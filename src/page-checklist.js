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
const PUBLIC_CONTENT_IMAGE_MIN_WIDTH = 240;
const PUBLIC_CONTENT_IMAGE_MIN_HEIGHT = 160;
const PUBLIC_CONTENT_IMAGE_MIN_AREA = 80000;

export async function evaluateDailyPageChecklist(page, options = {}) {
  const imageLoad = await eagerLoadPageImages(page, options.imageTimeoutMs || 5000);
  const result = await page.evaluate(({
    reportDate,
    forbiddenSectionText,
    forbiddenSectionSelectors,
    imageLoadTimedOut,
    publicImageMinWidth,
    publicImageMinHeight,
    publicImageMinArea
  }) => {
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
    const mustReadSection = document.querySelector("#section-today-must-read");
    const overviewSection = document.querySelector("#section-daily-overview");
    const fullNavigationSection = document.querySelector("#section-full-navigation");
    const compactMainList = document.querySelector("#section-compact-main-list");
    const mainDetails = document.querySelector("#section-main-item-details");
    const sectionOrder = [mustReadSection, overviewSection, fullNavigationSection, compactMainList, mainDetails]
      .map((node) => node ? Array.from(document.querySelectorAll("main section")).indexOf(node) : -1);
    addCheck(
      "today_must_read_first",
      Boolean(mustReadSection) &&
        mustReadSection.querySelectorAll(".interactive-card").length === 3 &&
        sectionOrder[0] >= 0 &&
        sectionOrder[0] < sectionOrder[1] &&
        sectionOrder[0] < sectionOrder[2] &&
        sectionOrder[0] < sectionOrder[3],
      "Daily report should put exactly three 今日必看 cards before stats, navigation, and the full list.",
      {
        order: sectionOrder,
        must_read_cards: mustReadSection?.querySelectorAll(".interactive-card").length || 0
      }
    );
    addCheck(
      "stats_and_navigation_sunk",
      Boolean(overviewSection) &&
        Boolean(fullNavigationSection) &&
        sectionOrder[1] > sectionOrder[0] &&
        sectionOrder[2] > sectionOrder[0] &&
        !document.querySelector("#report-top .hero-stat-grid") &&
        !document.querySelector("#report-top .hero-link"),
      "Stats, full navigation, and JSON links should be below 今日必看, not in the hero toolbar.",
      {
        overview_order: sectionOrder[1],
        navigation_order: sectionOrder[2],
        hero_stats: Boolean(document.querySelector("#report-top .hero-stat-grid")),
        hero_links: Boolean(document.querySelector("#report-top .hero-link"))
      }
    );
    addCheck(
      "compact_main_list_default",
      Boolean(compactMainList) &&
        compactMainList.querySelectorAll(".interactive-card").length >= 3 &&
        mainDetails?.tagName === "DETAILS" &&
        !mainDetails.open,
      "The complete main list should default to compact cards, with full bullets in a collapsed details section.",
      {
        compact_cards: compactMainList?.querySelectorAll(".interactive-card").length || 0,
        details_tag: mainDetails?.tagName || "",
        details_open: Boolean(mainDetails?.open)
      }
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
      "watch_next",
      "候选 / 入选",
      "入选原因",
      "source_audit"
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
    const trackingScreenshotIssues = trackingCards
      .map((card) => {
        const title = card.querySelector("h3")?.textContent?.replace(/\s+/g, " ").trim() || "";
        if (!["OpenRouter", "Artificial Analysis"].includes(title)) {
          return null;
        }
        const tableRows = card.querySelectorAll("[data-card-data-table] tbody tr").length;
        const imageCount = card.querySelectorAll(".card-media-grid img").length;
        return tableRows >= 3 && imageCount === 0
          ? null
          : {
              title,
              table_rows: tableRows,
              image_count: imageCount
            };
      })
      .filter(Boolean);
    addCheck(
      "daily_tracking_structured_not_screenshot",
      trackingScreenshotIssues.length === 0,
      "OpenRouter and Artificial Analysis should render structured table rows and no public screenshot media.",
      { issues: trackingScreenshotIssues }
    );
    const trackingTableLayoutIssues = trackingCards
      .map((card, index) => {
        const table = card.querySelector("[data-card-data-table]");
        const rows = Array.from(table?.querySelectorAll("tbody tr") || []);
        if (!table || rows.length === 0) {
          return null;
        }
        const rowHeights = rows.map((row) => row.getBoundingClientRect().height).filter((height) => height > 0);
        const maxRowHeight = Math.max(...rowHeights, 0);
        const rowHeightLimit = document.documentElement.clientWidth <= 760 ? 140 : 120;
        return maxRowHeight <= rowHeightLimit
          ? null
          : {
              index,
              title: card.querySelector("h3")?.textContent?.replace(/\s+/g, " ").trim() || "",
              max_row_height: Math.round(maxRowHeight),
              row_height_limit: rowHeightLimit,
              rows: rows.length,
              table_width: Math.round(table.getBoundingClientRect().width),
              viewport_width: document.documentElement.clientWidth
            };
      })
      .filter(Boolean);
    addCheck(
      "daily_tracking_table_compact",
      trackingTableLayoutIssues.length === 0,
      "Daily tracking tables should stay compact on mobile and must not stretch rows into large blank blocks.",
      { issues: trackingTableLayoutIssues }
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
    const weakBlogCards = Array.from(document.querySelectorAll(".interactive-card.blog-card:not(.chinese-media-card)"))
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
        const pointCount = summaryPointText.filter(Boolean).length;
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
        const ok = plain.length >= 100 && chineseChars >= 60 && chineseRatio >= 0.45 && pointCount >= 3 && pointCount <= 5 && !untranslatedEnglish && !templateOrLowInfo;
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
      "Hot blog cards should render as reader-facing Chinese analysis with 3-5 readable points, not untranslated excerpts or thin summaries.",
      { weak_cards: weakBlogCards }
    );
    const internalDebugPattern =
      /信源审计|自检与产物|发布质量说明|Source status|候选\s*\/\s*入选|source_audit|self_check|candidate_pool|feedback-ledger|config\/feedback-ledger\.json|Feedback Ledger Review|Regression Self-Check|降级项/;
    const publicDebugSections = Array.from(document.querySelectorAll("section, details, nav a"))
      .map((node) => node.textContent?.replace(/\s+/g, " ").trim() || "")
      .filter((text) => internalDebugPattern.test(text));
    addCheck(
      "public_debug_sections_absent",
      publicDebugSections.length === 0,
      "Public report should not expose source audit, self-check, ledger, candidate counts, or degradation logs as reader content.",
      { hits: publicDebugSections.slice(0, 12) }
    );
    const contentImages = Array.from(document.images).filter((image) =>
      image.getAttribute("src") && !image.closest(".image-lightbox[hidden]")
    );
    const publicContentImages = contentImages.filter((image) =>
      image.closest(".card-media-grid") ||
      (image.closest(".rendered-markdown") && !image.classList.contains("inline-site-icon"))
    );
    const invalidPublicImages = publicContentImages
      .map((image, index) => {
        const src = image.getAttribute("src") || "";
        const caption = image.closest("figure")?.querySelector("figcaption")?.textContent?.replace(/\s+/g, " ").trim() || "";
        const alt = image.getAttribute("alt") || "";
        const width = image.naturalWidth || 0;
        const height = image.naturalHeight || 0;
        const tooSmall = width < publicImageMinWidth || height < publicImageMinHeight || width * height < publicImageMinArea;
        const screenshotLike = /full[- ]?page|browser|viewport|page screenshot|页面截图|整页截图|浏览器截图/i.test(`${src} ${alt} ${caption}`);
        const nonContent = /\b(?:favicon|logo|avatar|icon)\b|图标|头像|徽标/i.test(`${src} ${alt} ${caption}`);
        return tooSmall || screenshotLike || nonContent
          ? {
              index,
              src,
              alt,
              caption,
              width,
              height,
              too_small: tooSmall,
              screenshot_like: screenshotLike,
              non_content: nonContent
            }
          : null;
      })
      .filter(Boolean);
    addCheck(
      "public_content_media_valid",
      invalidPublicImages.length === 0,
      "Public content images must be readable content assets, not tiny icons/logos/avatars or full-page screenshots.",
      { invalid_images: invalidPublicImages }
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
    imageLoadTimedOut: imageLoad.timedOut,
    publicImageMinWidth: PUBLIC_CONTENT_IMAGE_MIN_WIDTH,
    publicImageMinHeight: PUBLIC_CONTENT_IMAGE_MIN_HEIGHT,
    publicImageMinArea: PUBLIC_CONTENT_IMAGE_MIN_AREA
  });

  return {
    ...result,
    viewport: await page.viewportSize(),
    url: page.url()
  };
}

export async function evaluateIndexPageChecklist(page, options = {}) {
  const result = await page.evaluate(({ expectedMinReports }) => {
    const checks = [];
    const issues = [];
    const addCheck = (id, ok, message, details = {}) => {
      checks.push({ id, ok, message, details });
      if (!ok) {
        issues.push({ id, message, details });
      }
    };
    const root = document.querySelector("#date-research-index");
    const consoleRoot = document.querySelector("#index-console");
    const styleRoot = document.querySelector("[data-index-style='effective-interact']");
    const reportShell = document.querySelector(".report-shell.index-page");
    const reportHero = document.querySelector(".report-hero.report-hero-index");
    const reportNav = document.querySelector("nav.report-nav");
    const heatStrip = document.querySelector("#signal-heat-strip");
    const sourceLaneBoard = document.querySelector("#source-lane-board");
    const topicRadar = document.querySelector("#topic-radar");
    const cards = Array.from(document.querySelectorAll("[data-date-card]"));
    const heatDays = Array.from(document.querySelectorAll("[data-signal-day]"));
    const details = Array.from(document.querySelectorAll("[data-date-detail]"));
    const dates = cards.map((card) => card.getAttribute("data-date-card") || "").filter(Boolean);
    const heatDates = heatDays.map((day) => day.getAttribute("data-signal-day") || "").filter(Boolean);
    const chronological = dates.every((date, index) => index === 0 || dates[index - 1] <= date);
    const heatChronological = heatDates.every((date, index) => index === 0 || heatDates[index - 1] <= date);
    const cardsWithoutMetrics = cards
      .map((card) => ({
        date: card.getAttribute("data-date-card") || "",
        metric_count: card.querySelectorAll(".metric-pill").length,
        strength: card.getAttribute("data-strength-level") || "",
        quality: card.getAttribute("data-quality-status") || "",
        quality_channel: card.getAttribute("data-quality-channel") || ""
      }))
      .filter((card) => card.metric_count < 6 || !card.strength || !card.quality || !card.quality_channel);
    const degradedCards = cards.filter((card) => {
      const status = card.getAttribute("data-quality-status");
      return status === "degraded" || status === "blocked";
    });
    const weakDegradedCards = degradedCards
      .map((card) => ({
        date: card.getAttribute("data-date-card") || "",
        quality_channel: card.getAttribute("data-quality-channel") || "",
        has_badge: Boolean(card.querySelector(".quality-degraded, .quality-blocked")),
        border_style: getComputedStyle(card).borderStyle
      }))
      .filter((card) => card.quality_channel !== "degraded" && card.quality_channel !== "blocked" || !card.has_badge);

    addCheck(
      "index_console_present",
      Boolean(consoleRoot),
      "Homepage should lead with a data console instead of archive-first framing."
    );
    addCheck(
      "effective_interact_index_style",
      Boolean(styleRoot && reportShell && reportHero && reportNav),
      "Homepage should use effective-interact report shell, hero, and grouped navigation primitives.",
      {
        style_root: Boolean(styleRoot),
        report_shell: Boolean(reportShell),
        report_hero: Boolean(reportHero),
        report_nav: Boolean(reportNav)
      }
    );
    addCheck(
      "effective_interact_component_primitives",
      Boolean(
        document.querySelector(".hero-brief") &&
        document.querySelector(".hero-summary-text") &&
        document.querySelector(".hero-stat-grid") &&
        document.querySelector(".hero-stat") &&
        document.querySelector(".panel") &&
        document.querySelector(".chip")
      ),
      "Homepage should reuse effective-interact component primitives rather than a bespoke dashboard skin."
    );
    addCheck(
      "source_lane_comparison_surface",
      Boolean(sourceLaneBoard && sourceLaneBoard.querySelector(".report-data-table")),
      "Source lanes should be rendered as a comparable metric surface."
    );
    addCheck(
      "latest_briefing_present",
      Boolean(document.querySelector("#latest-briefing")),
      "Homepage should render a latest briefing from stored report data."
    );
    addCheck(
      "signal_heat_strip_present",
      Boolean(heatStrip) && heatDays.length >= Number(expectedMinReports || 1) && heatChronological,
      "Homepage should render a chronological signal heat strip.",
      { count: heatDays.length, dates: heatDates }
    );
    addCheck(
      "source_lane_board_present",
      Boolean(sourceLaneBoard) && document.querySelectorAll("[data-source-lane]").length >= 5,
      "Homepage should render source lanes with transparent aggregate counts.",
      { count: document.querySelectorAll("[data-source-lane]").length }
    );
    addCheck(
      "topic_radar_present",
      Boolean(topicRadar),
      "Homepage should render a topic radar when trend data is available."
    );
    addCheck(
      "archive_first_copy_absent",
      !/GitHub Pages 静态归档|按年月周导航/.test(document.body.textContent || ""),
      "Homepage should not lead with legacy archive-first copy."
    );
    addCheck(
      "date_research_index_present",
      Boolean(root),
      "Homepage should render the 30-day date research index."
    );
    addCheck(
      "date_cards_present",
      cards.length >= Number(expectedMinReports || 1),
      "Date index should render report-date cards.",
      { count: cards.length, expected_min_reports: expectedMinReports }
    );
    addCheck(
      "date_cards_chronological",
      chronological,
      "Date cards should keep strict chronological order.",
      { dates }
    );
    addCheck(
      "date_cards_transparent_metrics",
      cards.length > 0 && cardsWithoutMetrics.length === 0,
      "Every date card should expose transparent metrics plus strength and quality channels.",
      { weak_cards: cardsWithoutMetrics }
    );
    addCheck(
      "date_filters_present",
      Boolean(
        document.querySelector("#date-filter-month") &&
        document.querySelector("#date-filter-strength") &&
        document.querySelector("#date-filter-quality") &&
        document.querySelector("#date-filter-github") &&
        document.querySelector("#date-filter-builder") &&
        document.querySelector("#date-filter-tracking") &&
        document.querySelector("#date-filter-degraded")
      ),
      "Date index should expose month, strength, quality, and signal filters."
    );
    addCheck(
      "selected_date_panel_present",
      Boolean(document.querySelector("#selected-date-panel")) && details.length === cards.length,
      "Date index should render one selected-date detail panel per date.",
      { detail_count: details.length, card_count: cards.length }
    );
    addCheck(
      "degraded_quality_channel_encoded",
      weakDegradedCards.length === 0,
      "Degraded or blocked dates should use an independent quality channel and visible badge.",
      { degraded_count: degradedCards.length, weak_cards: weakDegradedCards }
    );
    addCheck(
      "index_no_remote_scripts",
      !Array.from(document.scripts).some((script) => /^https?:\/\//i.test(script.src || "")),
      "Homepage should not depend on remote scripts."
    );
    addCheck(
      "index_no_horizontal_overflow",
      document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      "Homepage should not create horizontal overflow at the current viewport.",
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
    expectedMinReports: options.expectedMinReports || 1
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
