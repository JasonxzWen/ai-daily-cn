const FORBIDDEN_TEXT = [
  "\u6a21\u578b\u53d1\u5e03",
  "\u4eca\u65e5\u503c\u5f97\u5173\u6ce8\u7684\u9879\u76ee",
  "\u9879\u76ee highlights"
];

export async function evaluateDailyPageChecklist(page, options = {}) {
  await eagerLoadPageImages(page, options.imageTimeoutMs || 5000);
  const result = await page.evaluate(({ reportDate, forbiddenText }) => {
    const checks = [];
    const issues = [];
    const addCheck = (id, ok, message, details = {}) => {
      checks.push({ id, ok, message, details });
      if (!ok) {
        issues.push({ id, message, details });
      }
    };
    const text = document.body?.textContent || "";
    const hero = document.querySelector("#report-top");

    addCheck(
      "report_date_visible",
      !reportDate || Boolean(hero && hero.textContent.includes(reportDate)),
      "Hero/date area should include the target report date."
    );
    addCheck(
      "daily_report_hero",
      Boolean(document.querySelector("#report-top[data-hero-mode='daily-report']")),
      "Daily page should render with the daily-report hero mode."
    );
    addCheck(
      "pre_rendered_mode",
      document.documentElement.getAttribute("data-render-mode") === "pre-rendered",
      "Production daily report should use pre-rendered mode."
    );
    addCheck(
      "no_remote_scripts",
      !Array.from(document.scripts).some((script) => /^https?:\/\//i.test(script.src || "")),
      "Public report should not depend on remote scripts."
    );
    const forbiddenHits = forbiddenText.filter((item) => text.includes(item));
    addCheck(
      "forbidden_sections_absent",
      forbiddenHits.length === 0,
      "Public report should not render deprecated model/project sections.",
      { forbidden_hits: forbiddenHits }
    );
    addCheck(
      "inline_highlights_rendered",
      document.querySelectorAll(".text-keyword, .text-highlight, .keyword-major, .keyword-notable, .keyword-general, .daily-tag, .tag-highlight, .tag-stars, .tag-topic, .tag-major, .tag-notable, .tag-general").length > 0,
      "Inline highlights and typed tags should render as styled elements."
    );
    addCheck(
      "project_cards_absent",
      document.querySelectorAll(".project-card-grid, .project-card").length === 0,
      "Project highlights should stay inside GitHub Trending entries, not a standalone project card section."
    );
    const weakBlogCards = Array.from(document.querySelectorAll(".blog-card"))
      .map((card, index) => {
        const bodyText = card.querySelector(":scope > p")?.textContent?.replace(/\s+/g, " ").trim() || "";
        const pointRows = Array.from(card.querySelectorAll(".card-detail-list div"));
        const summaryPointText = pointRows
          .filter((row) => /^要点\s*\d+/.test(row.querySelector("dt")?.textContent || ""))
          .map((row) => row.querySelector("dd")?.textContent?.replace(/\s+/g, " ").trim() || "")
          .filter(Boolean);
        const detailText = Array.from(card.querySelectorAll(".card-detail-list dd"))
          .map((item) => item.textContent.replace(/\s+/g, " ").trim())
          .filter(Boolean);
        const editorialText = [bodyText, ...detailText].join(" ");
        const plain = editorialText.replace(/[#*_=`~]/g, "").trim();
        const chineseChars = (plain.match(/\p{Script=Han}/gu) || []).length;
        const latinChars = (plain.match(/[A-Za-z]/g) || []).length;
        const ratioBase = chineseChars + latinChars;
        const chineseRatio = ratioBase > 0 ? chineseChars / ratioBase : 0;
        const pointCount = [bodyText, ...summaryPointText].filter(Boolean).length;
        const untranslatedEnglish = /\b[A-Z][A-Za-z0-9 ,;:'"()[\]\/-]{35,}[.!?]/.test(plain);
        const ok = plain.length >= 100 && chineseChars >= 60 && chineseRatio >= 0.45 && pointCount >= 2 && pointCount <= 4 && !untranslatedEnglish;
        return ok
          ? null
          : {
              index,
              title: card.querySelector("h3")?.textContent?.replace(/\s+/g, " ").trim() || "",
              length: plain.length,
              point_count: pointCount,
              chinese_chars: chineseChars,
              chinese_ratio: Number(chineseRatio.toFixed(3)),
              untranslated_english: untranslatedEnglish
            };
      })
      .filter(Boolean);
    addCheck(
      "hot_blog_cards_reader_facing",
      weakBlogCards.length === 0,
      "Hot blog cards should render as reader-facing Chinese analysis with 2-4 readable points, not untranslated excerpts or thin summaries.",
      { weak_cards: weakBlogCards }
    );
    const contentImages = Array.from(document.images).filter((image) =>
      image.getAttribute("src") && !image.closest(".image-lightbox[hidden]")
    );
    addCheck(
      "images_loaded",
      contentImages.every((image) => image.complete && image.naturalWidth > 0),
      "All page images should load."
    );
    addCheck(
      "external_links_rel",
      Array.from(document.querySelectorAll("a[href^='http']")).every((anchor) => {
        const rel = anchor.getAttribute("rel") || "";
        return rel.includes("noopener") && rel.includes("noreferrer");
      }),
      "External links should include noopener noreferrer."
    );
    addCheck(
      "no_horizontal_overflow",
      document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      "Page should not create horizontal overflow at the current viewport.",
      {
        scroll_width: document.documentElement.scrollWidth,
        client_width: document.documentElement.clientWidth
      }
    );

    return {
      ok: issues.length === 0,
      checks,
      issues
    };
  }, {
    reportDate: options.reportDate || "",
    forbiddenText: options.forbiddenText || FORBIDDEN_TEXT
  });

  return {
    ...result,
    viewport: await page.viewportSize(),
    url: page.url()
  };
}

async function eagerLoadPageImages(page, timeoutMs) {
  await page.evaluate(async () => {
    const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    for (const image of document.images) {
      image.loading = "eager";
    }
    for (let y = 0; y <= document.documentElement.scrollHeight; y += Math.max(window.innerHeight, 1)) {
      window.scrollTo(0, y);
      await nextFrame();
    }
    window.scrollTo(0, 0);
    await nextFrame();
  });
  await page.waitForFunction(
    () => Array.from(document.images).every((image) => image.complete),
    null,
    { timeout: timeoutMs }
  );
}
