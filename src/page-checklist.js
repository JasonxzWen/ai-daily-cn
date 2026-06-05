const FORBIDDEN_SECTION_TEXT = [
  "\u6a21\u578b\u53d1\u5e03",
  "\u4eca\u65e5\u503c\u5f97\u5173\u6ce8\u7684\u9879\u76ee",
  "\u9879\u76ee highlights"
];
const FORBIDDEN_SECTION_SELECTORS = [
  "#model-releases",
  "#projects",
  ".project-card-grid",
  ".project-card"
];

export async function evaluateDailyPageChecklist(page, options = {}) {
  await eagerLoadPageImages(page, options.imageTimeoutMs || 5000);
  const result = await page.evaluate(({ reportDate, forbiddenSectionText, forbiddenSectionSelectors }) => {
    const checks = [];
    const issues = [];
    const addCheck = (id, ok, message, details = {}) => {
      checks.push({ id, ok, message, details });
      if (!ok) {
        issues.push({ id, message, details });
      }
    };
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
    const sectionTextTargets = Array.from(document.querySelectorAll("section h1, section h2, section h3, nav a, [data-section-title]"))
      .map((node) => node.textContent?.replace(/\s+/g, " ").trim() || "")
      .filter(Boolean);
    const forbiddenTextHits = forbiddenSectionText.filter((item) =>
      sectionTextTargets.some((text) => text.includes(item))
    );
    const forbiddenSelectorHits = forbiddenSectionSelectors.filter((selector) =>
      document.querySelector(selector)
    );
    const forbiddenHits = [...forbiddenTextHits, ...forbiddenSelectorHits];
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
    const weakTrackingCards = Array.from(document.querySelectorAll(".tracking-card"))
      .map((card, index) => {
        const hasVisualData = Boolean(
          card.querySelector("[data-card-data-table]") ||
          card.querySelector("[data-card-bars]") ||
          card.querySelector(".card-media-grid img")
        );
        const rankDetailLabels = Array.from(card.querySelectorAll(".card-detail-list dt"))
          .map((node) => node.textContent?.trim() || "")
          .filter((text) => /^#\d+/.test(text));
        const detailRows = card.querySelectorAll(".card-detail-list div").length;
        const ok = hasVisualData && rankDetailLabels.length === 0 && detailRows <= 2;
        return ok
          ? null
          : {
              index,
              title: card.querySelector("h3")?.textContent?.replace(/\s+/g, " ").trim() || "",
              has_visual_data: hasVisualData,
              rank_detail_labels: rankDetailLabels,
              detail_rows: detailRows
            };
      })
      .filter(Boolean);
    addCheck(
      "daily_tracking_visualized",
      weakTrackingCards.length === 0,
      "Daily tracking cards should be visual/table-first and must not render leaderboard rows as text detail logs.",
      { weak_cards: weakTrackingCards }
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
        const hotBlogTemplate = /(?:\u8fd9\u7bc7\u6587\u7ae0\u7684\u770b\u70b9\u4e0d\u662f|\u4e0d\u662f\u5355\u4e2a\u6280\u672f\u540d\u8bcd|\u8bfb\u8005\u53ef\u4ee5\u91cd\u70b9\u770b|\u5bf9\u975e\s*AI\s*\u76f4\u63a5\u4ece\u4e1a\u8005|\u4ef7\u503c\u5728\u4e8e)/iu;
        const coveragePatterns = [
          /(?:\u6587\u7ae0|\u535a\u5ba2|\u4f5c\u8005|\u539f\u6587|\u5b83).{0,32}(?:\u8bb2|\u68b3\u7406|\u8bf4\u660e|\u5206\u6790|\u62c6\u89e3|\u5c55\u793a|\u56f4\u7ed5|\u9a8c\u8bc1|\u5c55\u5f00)/u,
          /(?:\u4f9d\u636e|\u8bc1\u636e|\u65b9\u6cd5|\u5b9e\u9a8c|\u6848\u4f8b|\u4ee3\u7801|\u63a5\u53e3|\u6570\u636e|\u5bf9\u6bd4|\u9650\u5236|\u6743\u9650|\u5931\u8d25|\u6d41\u7a0b|\u95e8\u69db|\u8fb9\u754c)/u,
          /(?:\u8bfb\u8005|\u56e2\u961f|\u5173\u6ce8|\u7559\u610f|\u6838\u5bf9|\u5224\u65ad|\u8bd5\u70b9|\u91c7\u8d2d|\u843d\u5730|\u98ce\u9669|\u5c40\u9650|\u8def\u7ebf\u56fe|\u53c2\u8003|\u5b89\u5168\u95e8)/u
        ];
        const coverageHits = coveragePatterns.filter((pattern) => pattern.test(plain)).length;
        const weakPointText = [bodyText, ...summaryPointText].some((point) => point.length > 0 && point.length < 18);
        const templateOrLowInfo = hotBlogTemplate.test(plain) || coverageHits < 2 || weakPointText;
        const ok = plain.length >= 100 && chineseChars >= 60 && chineseRatio >= 0.45 && pointCount >= 2 && pointCount <= 4 && !untranslatedEnglish && !templateOrLowInfo;
        return ok
          ? null
          : {
              index,
              title: card.querySelector("h3")?.textContent?.replace(/\s+/g, " ").trim() || "",
              length: plain.length,
              point_count: pointCount,
              chinese_chars: chineseChars,
              chinese_ratio: Number(chineseRatio.toFixed(3)),
              untranslated_english: untranslatedEnglish,
              template_or_low_information: templateOrLowInfo,
              coverage_hits: coverageHits,
              weak_point_text: weakPointText
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
    forbiddenSectionText: options.forbiddenSectionText || options.forbiddenText || FORBIDDEN_SECTION_TEXT,
    forbiddenSectionSelectors: options.forbiddenSectionSelectors || FORBIDDEN_SECTION_SELECTORS
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
