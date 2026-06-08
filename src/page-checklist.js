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
  const imageLoad = await eagerLoadPageImages(page, options.imageTimeoutMs || 5000);
  const result = await page.evaluate(({ reportDate, forbiddenSectionText, forbiddenSectionSelectors, imageLoadTimedOut }) => {
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
    const bodyText = document.body.textContent?.replace(/\s+/g, " ").trim() || "";
    const legacyPublicHits = [
      "技不止术",
      "热门技术博客",
      "变化：",
      "落点：",
      "为什么重要：",
      "判断点：",
      "watch_next"
    ].filter((item) => bodyText.includes(item));
    addCheck(
      "legacy_public_copy_absent",
      legacyPublicHits.length === 0,
      "Public page should not expose legacy section labels or template copy such as 技不止术 / 热门技术博客 / 变化： / 落点：.",
      { hits: legacyPublicHits }
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
    const unlinkedMarkdownIcons = Array.from(document.querySelectorAll("main .rendered-markdown li img.inline-site-icon"))
      .filter((image) => !image.closest("details"))
      .filter((image) => !image.closest("a"));
    const unlinkedCardTitleIcons = Array.from(document.querySelectorAll(".interactive-card h3 img.card-title-icon"))
      .filter((image) => !image.closest("a.card-title-link"));
    addCheck(
      "source_icons_linked",
      unlinkedMarkdownIcons.length === 0 && unlinkedCardTitleIcons.length === 0,
      "Source icons in public titles should be part of the same clickable link as the title.",
      {
        markdown_icons: unlinkedMarkdownIcons.map((image) => image.closest("li")?.textContent?.replace(/\s+/g, " ").trim().slice(0, 140) || ""),
        card_icons: unlinkedCardTitleIcons.map((image) => image.closest(".interactive-card")?.querySelector("h3")?.textContent?.replace(/\s+/g, " ").trim().slice(0, 140) || "")
      }
    );
    const cardTitleLinks = Array.from(document.querySelectorAll(".interactive-card h3 a.card-title-link"));
    const missingCardTitleIcons = cardTitleLinks
      .filter((link) => !link.querySelector("img.card-title-icon"))
      .map((link) => link.textContent?.replace(/\s+/g, " ").trim().slice(0, 140) || "");
    addCheck(
      "source_icons_present",
      cardTitleLinks.length === 0 || missingCardTitleIcons.length === 0,
      "Public card title links should include source or avatar icons.",
      { count: cardTitleLinks.length, missing_titles: missingCardTitleIcons }
    );
    const githubTrendingSection = document.querySelector("section[id*='github-trending']");
    const githubTrendRows = githubTrendingSection ? Array.from(githubTrendingSection.querySelectorAll("ol > li")) : [];
    const weakGithubTrendRows = githubTrendRows
      .map((row, index) => {
        const text = row.textContent?.replace(/\s+/g, " ").trim() || "";
        const prose = text
          .replace(/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/g, "")
          .replace(/\b(?:GitHub|Trending|Top|README|AI|RAG|AIGC|agent|infra|eval|NEW|SAME|DOWN|UP|stars)\b/gi, "")
          .replace(/https?:\/\/\S+/gi, "");
        const longEnglishRun = /[A-Za-z][A-Za-z0-9 ,;:'"()[\]/.!?+~`#-]{45,}/.test(prose);
        const chineseChars = (text.match(/\p{Script=Han}/gu) || []).length;
        return longEnglishRun || chineseChars < 10
          ? { index, text: text.slice(0, 220), long_english_run: longEnglishRun, chinese_chars: chineseChars }
          : null;
      })
      .filter(Boolean);
    addCheck(
      "github_trending_reader_facing_top10",
      githubTrendRows.length === 10 && weakGithubTrendRows.length === 0,
      "GitHub Trending should render exactly Top 10 with Chinese reader-facing inline descriptions, not raw English repository excerpts.",
      {
        count: githubTrendRows.length,
        weak_rows: weakGithubTrendRows
      }
    );
    const trackingCards = Array.from(document.querySelectorAll(".tracking-card"));
    const weakTrackingCards = trackingCards
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
      trackingCards.length > 0 && weakTrackingCards.length === 0,
      "Daily tracking should render at least one visual/table-first public card and must not render leaderboard rows as text detail logs.",
      { count: trackingCards.length, weak_cards: weakTrackingCards }
    );
    const trackingImageCountIssues = trackingCards
      .map((card) => {
        const title = card.querySelector("h3")?.textContent?.replace(/\s+/g, " ").trim() || "";
        if (!["OpenRouter", "Artificial Analysis"].includes(title)) {
          return null;
        }
        const imageCount = card.querySelectorAll(".card-media-grid img").length;
        return imageCount >= 3 && imageCount <= 5
          ? null
          : {
              title,
              image_count: imageCount
            };
      })
      .filter(Boolean);
    addCheck(
      "daily_tracking_expected_image_count",
      trackingImageCountIssues.length === 0,
      "OpenRouter and Artificial Analysis cards should render 3-5 evidence images when those cards are present.",
      { issues: trackingImageCountIssues }
    );
    const trackingOverlapIssues = trackingCards
      .map((card, index) => {
        const selectors = [":scope > h3", ":scope > .card-tags", ":scope > .card-stat-grid", ":scope > .card-bars", ":scope > .card-table", ":scope > .card-media-grid", ":scope > p"];
        const rects = selectors
          .flatMap((selector) => Array.from(card.querySelectorAll(selector)))
          .map((node) => {
            const rect = node.getBoundingClientRect();
            return {
              label: node.matches("h3") ? "title" : node.className || node.tagName.toLowerCase(),
              left: rect.left,
              right: rect.right,
              top: rect.top,
              bottom: rect.bottom,
              width: rect.width,
              height: rect.height
            };
          })
          .filter((rect) => rect.width > 1 && rect.height > 1);
        for (let leftIndex = 0; leftIndex < rects.length; leftIndex += 1) {
          for (let rightIndex = leftIndex + 1; rightIndex < rects.length; rightIndex += 1) {
            const a = rects[leftIndex];
            const b = rects[rightIndex];
            const separated = a.right <= b.left + 1 || b.right <= a.left + 1 || a.bottom <= b.top + 1 || b.bottom <= a.top + 1;
            if (!separated) {
              return {
                index,
                title: card.querySelector("h3")?.textContent?.replace(/\s+/g, " ").trim() || "",
                overlap: [a.label, b.label]
              };
            }
          }
        }
        return null;
      })
      .filter(Boolean);
    addCheck(
      "daily_tracking_no_overlap",
      trackingOverlapIssues.length === 0,
      "Daily tracking card title, tags, stats, bars, table, media and body should not visually overlap.",
      { overlaps: trackingOverlapIssues }
    );
    const weakBuilderCards = Array.from(document.querySelectorAll(".builder-card"))
      .map((card, index) => {
        const bodyText = card.querySelector(":scope > p")?.textContent?.replace(/\s+/g, " ").trim() || "";
        const originalRows = Array.from(card.querySelectorAll(".card-detail-list div"))
          .filter((row) => (row.querySelector("dt")?.textContent || "").trim() === "原文");
        const originalText = originalRows
          .map((row) => row.querySelector("dd")?.textContent?.replace(/\s+/g, " ").trim() || "")
          .join(" ");
        const textWithoutUrls = bodyText.replace(/https?:\/\/\S+/gi, "").trim();
        const chineseChars = (bodyText.match(/\p{Script=Han}/gu) || []).length;
        const latinChars = (bodyText.match(/[A-Za-z]/g) || []).length;
        const ratioBase = chineseChars + latinChars;
        const chineseRatio = ratioBase > 0 ? chineseChars / ratioBase : 0;
        const longEnglishRun = /[A-Za-z@][A-Za-z0-9 @_,;:'"()[\]\/.!?+~`#-]{60,}/.test(textWithoutUrls);
        const originalAttached = originalText.length >= 10;
        const ok = bodyText.length > 0 && chineseChars >= 10 && chineseRatio >= 0.35 && !longEnglishRun && originalAttached;
        return ok
          ? null
          : {
              index,
              title: card.querySelector("h3")?.textContent?.replace(/\s+/g, " ").trim() || "",
              body: bodyText.slice(0, 180),
              chinese_chars: chineseChars,
              chinese_ratio: Number(chineseRatio.toFixed(3)),
              long_english_run: longEnglishRun,
              original_attached: originalAttached
            };
      })
      .filter(Boolean);
    addCheck(
      "builder_cards_translated",
      weakBuilderCards.length === 0,
      "X/Twitter builder cards should render Chinese translations in the body and attach the original post below.",
      { weak_cards: weakBuilderCards }
    );
    const internalReviewLanguageRe = /(?:待确认|Treat this as a community lead|unless it is backed by a primary source|仅作(?:发现|社区)?线索|仅作为?线索|事实性结论(?:仍需|需要)|不得仅凭该线索写入主体|(?:不进入|未进入)\s*AI\s*主体事实|当前作为[^。；;\n]*(?:线索|观察)|这是[^。；;\n]*(?:线索|观察)[^。；;\n]*(?:不进入|未进入)|边界\s*[：:])/i;
    const internalReviewTextHits = Array.from(document.querySelectorAll(".interactive-card > p, .interactive-card .card-detail-list dd"))
      .map((node, index) => ({
        index,
        text: node.textContent?.replace(/\s+/g, " ").trim() || "",
        title: node.closest(".interactive-card")?.querySelector("h3")?.textContent?.replace(/\s+/g, " ").trim() || ""
      }))
      .filter((item) => internalReviewLanguageRe.test(item.text))
      .map((item) => ({
        index: item.index,
        title: item.title,
        text: item.text.slice(0, 180)
      }));
    addCheck(
      "public_internal_review_language_absent",
      internalReviewTextHits.length === 0,
      "Public card bodies should not expose internal review labels such as pending confirmation or community-lead caveats.",
      { hits: internalReviewTextHits }
    );
    const weakCommunityCards = Array.from(document.querySelectorAll(".community-card"))
      .map((card, index) => {
        const bodyText = card.querySelector(":scope > p")?.textContent?.replace(/\s+/g, " ").trim() || "";
        const textWithoutUrls = bodyText.replace(/https?:\/\/\S+/gi, "").trim();
        const chineseChars = (bodyText.match(/\p{Script=Han}/gu) || []).length;
        const latinChars = (bodyText.match(/[A-Za-z]/g) || []).length;
        const ratioBase = chineseChars + latinChars;
        const chineseRatio = ratioBase > 0 ? chineseChars / ratioBase : 0;
        const longEnglishRun = /[A-Za-z@][A-Za-z0-9 @_,;:'"()[\]\/.!?+~`#-]{60,}/.test(textWithoutUrls);
        const ok = bodyText.length > 0 && chineseChars >= 10 && chineseRatio >= 0.35 && !longEnglishRun;
        return ok
          ? null
          : {
              index,
              title: card.querySelector("h3")?.textContent?.replace(/\s+/g, " ").trim() || "",
              body: bodyText.slice(0, 180),
              chinese_chars: chineseChars,
              chinese_ratio: Number(chineseRatio.toFixed(3)),
              long_english_run: longEnglishRun
            };
      })
      .filter(Boolean);
    addCheck(
      "community_cards_reader_facing",
      weakCommunityCards.length === 0,
      "Community cards should render Chinese reader-facing summaries, not raw English excerpts.",
      { weak_cards: weakCommunityCards }
    );
    const communityGrid = document.querySelector(".community-card-grid");
    const communityCards = Array.from(document.querySelectorAll(".community-card"));
    const communityGridColumns = communityGrid ? getComputedStyle(communityGrid).gridTemplateColumns.trim().split(/\s+/).filter(Boolean) : [];
    const narrowViewport = window.innerWidth <= 760;
    const weakCommunityLayoutCards = communityCards
      .map((card, index) => {
        const media = card.querySelector(".card-media-grid");
        if (!media) {
          return null;
        }
        const styles = getComputedStyle(card);
        const columns = styles.gridTemplateColumns.trim().split(/\s+/).filter(Boolean);
        const titleRect = card.querySelector("h3")?.getBoundingClientRect();
        const bodyRect = card.querySelector(":scope > p")?.getBoundingClientRect();
        const mediaRect = media.getBoundingClientRect();
        const ok = narrowViewport
          ? columns.length === 1 && Boolean(titleRect && bodyRect && Math.abs(bodyRect.left - titleRect.left) < 8 && Math.abs(mediaRect.left - titleRect.left) < 8)
          : columns.length === 2 && Boolean(titleRect && bodyRect && mediaRect.left > bodyRect.left + 120);
        return ok
          ? null
          : {
              index,
              title: card.querySelector("h3")?.textContent?.replace(/\s+/g, " ").trim() || "",
              columns,
              viewport: window.innerWidth
            };
      })
      .filter(Boolean);
    addCheck(
      "community_cards_news_stream",
      communityCards.length === 0 || (communityGridColumns.length === 1 && weakCommunityLayoutCards.length === 0),
      "Community leads should render as a single-column news stream, and cards with images should use a text-left / image-right row layout on desktop then collapse on mobile.",
      {
        grid_columns: communityGridColumns,
        weak_cards: weakCommunityLayoutCards
      }
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
    const sourceAuditSection = Array.from(document.querySelectorAll("section, details"))
      .find((section) => /信源审计/.test(section.querySelector("h1, h2, h3, summary")?.textContent || ""));
    const sourceAuditOverviewChart = Array.from(document.querySelectorAll("[data-chart-section]"))
      .find((section) => /信源状态概览/.test(section.textContent || ""));
    const sourceStatusTags = Array.from(document.querySelectorAll("mark.daily-tag-status-checked, mark.daily-tag-status-no-signal, mark.daily-tag-status-blocked, mark.daily-tag-status-skipped, mark.daily-tag-status-unknown"));
    addCheck(
      "source_audit_status_visualized",
      Boolean(sourceAuditOverviewChart) && Boolean(sourceAuditSection) && sourceStatusTags.length >= 2,
      "Source audit should include a visible status chart and colored status tags for each source state.",
      {
        has_chart: Boolean(sourceAuditOverviewChart),
        has_audit_section: Boolean(sourceAuditSection),
        status_tag_count: sourceStatusTags.length
      }
    );
    const contentImages = Array.from(document.images).filter((image) =>
      image.getAttribute("src") && !image.closest(".image-lightbox[hidden]")
    );
    const remoteContentImages = contentImages
      .filter((image) => /^(https?:)?\/\//i.test(image.getAttribute("src") || ""))
      .map((image) => ({
        src: image.getAttribute("src") || "",
        alt: image.getAttribute("alt") || "",
        title: image.closest("figure")?.querySelector("figcaption")?.textContent?.replace(/\s+/g, " ").trim() || ""
      }));
    addCheck(
      "public_media_local_only",
      remoteContentImages.length === 0,
      "Public page should only render local build assets or data URI images, not remote http(s) media.",
      { remote_images: remoteContentImages }
    );
    addCheck(
      "images_loaded",
      !imageLoadTimedOut && contentImages.every((image) => image.complete && image.naturalWidth > 0),
      "All page images should load.",
      { timed_out: imageLoadTimedOut, count: contentImages.length }
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
    forbiddenSectionSelectors: options.forbiddenSectionSelectors || FORBIDDEN_SECTION_SELECTORS,
    imageLoadTimedOut: imageLoad.timedOut
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
  try {
    await page.waitForFunction(
      () => Array.from(document.images).every((image) => image.complete),
      null,
      { timeout: timeoutMs }
    );
    return { timedOut: false };
  } catch (error) {
    if (String(error?.message || error).includes("Timeout")) {
      return { timedOut: true };
    }
    throw error;
  }
}
