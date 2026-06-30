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

// Page checks whose failure is an editorial weak-signal-card quality issue
// (text too short / thin reader-facing summary), not a structural defect. These
// degrade (publish with disclosure) instead of hard-blocking the whole daily;
// structural checks (layout, hero, nav, sections, images, dates, GitHub
// Trending coverage) keep the hard block.
const DEGRADABLE_PAGE_CHECK_IDS = new Set([
  "community_cards_reader_facing",
  "hot_blog_cards_reader_facing"
]);
const PAGE_CHECK_SECTION_BY_ID = {
  community_cards_reader_facing: "community_leads",
  hot_blog_cards_reader_facing: "hot_blogs"
};

// Pure classifier (importable + unit-testable): split failed page checks across
// all viewports into blocking vs degradable.
export function classifyDailyPageCheckResults(results) {
  const failed = new Set();
  for (const result of Array.isArray(results) ? results : []) {
    for (const check of Array.isArray(result?.checks) ? result.checks : []) {
      if (check && check.ok === false) {
        failed.add(String(check.id));
      }
    }
  }
  const blocking = [...failed].filter((id) => !DEGRADABLE_PAGE_CHECK_IDS.has(id));
  const degraded = [...failed].filter((id) => DEGRADABLE_PAGE_CHECK_IDS.has(id));
  return {
    ok: blocking.length === 0,
    blocking_checks: blocking,
    degraded_checks: degraded,
    degraded_sections: degraded.map((id) => PAGE_CHECK_SECTION_BY_ID[id]).filter(Boolean)
  };
}

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
    const compactMainList = document.querySelector("#section-compact-main-list");
    const legacyTriple = document.querySelector("#section-today-judgment, #section-trend-themes, #section-story-list");
    const trackSections = Array.from(document.querySelectorAll("[id^='section-track-']"));
    const storyPanels = Array.from(document.querySelectorAll("details.collapsible-panel[id^='section-story-']"));
    const collapsedStoryPanels = storyPanels.filter((panel) => !panel.open);
    const storyPanelWithTeaser = storyPanels.some((panel) =>
      Boolean(panel.querySelector(".collapsible-subtitle")?.textContent?.trim())
    );
    const trackText = trackSections.map((node) => (node.textContent || "").trim()).join("");
    const promptLayerTheme = document.documentElement.getAttribute("data-ai-daily-theme") === "promptlayer-inspired";
    const ticketCards = document.querySelectorAll(".main-ticket-card, .main-ticket-card-grid, #section-main-signal-cards").length;
    const storyFirstOk = trackSections.length >= 1 &&
      Boolean(trackText) &&
      storyPanels.length >= 1 &&
      collapsedStoryPanels.length >= 1 &&
      storyPanelWithTeaser &&
      !legacyTriple;
    addCheck(
      "today_must_read_not_required",
      !mustReadSection,
      "Daily report should not require or render a must-read section as the primary page contract.",
      {
        must_read_cards: mustReadSection?.querySelectorAll(".interactive-card").length || 0
      }
    );
    addCheck(
      "story_first_sections_expanded",
      !compactMainList && storyFirstOk && !promptLayerTheme && ticketCards === 0,
      "The public page should group stories into editorial track sections with per-story collapsible detail, not the legacy 今日判断/趋势主题/今日主线 triple.",
      {
        compact_list_present: Boolean(compactMainList),
        legacy_triple_present: Boolean(legacyTriple),
        track_sections: trackSections.length,
        story_panels: storyPanels.length,
        collapsed_story_panels: collapsedStoryPanels.length,
        story_panel_with_teaser: storyPanelWithTeaser,
        promptlayer_theme: promptLayerTheme,
        ticket_cards: ticketCards
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
    const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const standaloneLegacyLabel = (label) => new RegExp(`(^|[\\s。；;，,])${escapeRegExp(label)}`, "u").test(bodyText);
    const legacyPublicHits = [
      { label: "技不止术", test: () => bodyText.includes("技不止术") },
      { label: "热门技术博客", test: () => bodyText.includes("热门技术博客") },
      { label: "变化：", test: () => standaloneLegacyLabel("变化：") },
      { label: "落点：", test: () => standaloneLegacyLabel("落点：") },
      { label: "为什么重要：", test: () => standaloneLegacyLabel("为什么重要：") },
      { label: "判断点：", test: () => standaloneLegacyLabel("判断点：") },
      { label: "来源 第三方报道", test: () => bodyText.includes("来源 第三方报道") },
      { label: "第三方报道", test: () => bodyText.includes("第三方报道") },
      { label: "项目 highlight", test: () => bodyText.includes("项目 highlight") },
      { label: "这条动态主要围绕", test: () => bodyText.includes("这条动态主要围绕") },
      { label: "完整列表", test: () => bodyText.includes("完整列表") },
      { label: "优先核对 README", test: () => bodyText.includes("优先核对 README") },
      { label: "README 主要围绕", test: () => bodyText.includes("README 主要围绕") },
      { label: "阅读时先看", test: () => bodyText.includes("阅读时先看") },
      { label: "重点 story", test: () => bodyText.includes("重点 story") },
      { label: "可作为 agent 工具方向", test: () => bodyText.includes("可作为 agent 工具方向") },
      { label: "AI 工程工具方向的开源项目观察", test: () => bodyText.includes("AI 工程工具方向的开源项目观察") },
      { label: "今天进入 GitHub Trending Top 10", test: () => bodyText.includes("今天进入 GitHub Trending Top 10") },
      { label: "进入 GitHub Trending Top 10", test: () => bodyText.includes("进入 GitHub Trending Top 10") },
      { label: "序号 1", test: () => bodyText.includes("序号 1") },
      { label: "序号 2", test: () => bodyText.includes("序号 2") },
      { label: "序号 3", test: () => bodyText.includes("序号 3") },
      { label: "watch_next", test: () => bodyText.includes("watch_next") },
      { label: "候选 / 入选", test: () => bodyText.includes("候选 / 入选") },
      { label: "入选原因", test: () => bodyText.includes("入选原因") },
      { label: "source_audit", test: () => bodyText.includes("source_audit") },
      { label: "self_check", test: () => bodyText.includes("self_check") },
      { label: "candidate_id", test: () => bodyText.includes("candidate_id") },
      { label: "quality_status", test: () => bodyText.includes("quality_status") },
      { label: "degraded_sections", test: () => bodyText.includes("degraded_sections") },
      { label: "remediation", test: () => bodyText.includes("remediation") },
      { label: "parsed_count", test: () => bodyText.includes("parsed_count") }
    ].filter((rule) => rule.test()).map((rule) => rule.label);
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
    const sectionOrder = Array.from(document.querySelectorAll(".report-section-stack > [id]"))
      .map((node) => node.id);
    const publicAuditSectionIds = new Set([
      "section-source-signal-story",
      "section-source-first-dashboard",
      "section-system-operating-dashboard",
      "section-source-status-focus",
      "section-source-map",
      "section-source-inventory"
    ]);
    const publicAuditSectionHits = sectionOrder.filter((id) =>
      publicAuditSectionIds.has(id) ||
      id.startsWith("section-source-map-group-") ||
      id.startsWith("section-source-inventory-group-")
    );
    const firstTrackOrderIndex = sectionOrder.findIndex((id) => id.startsWith("section-track-"));
    addCheck(
      "public_source_audit_sections_absent",
      publicAuditSectionHits.length === 0,
      "Public report should not render source-first, source inventory, source map, or system operating audit sections.",
      {
        hits: publicAuditSectionHits,
        first_track_order_index: firstTrackOrderIndex,
        checked_ids: [...publicAuditSectionIds]
      }
    );
    const githubTrendingSection = document.querySelector(".github-trending-card-grid")?.closest("section") ||
      document.querySelector("section[id*='github-trending']");
    const githubTrendCards = githubTrendingSection ? Array.from(githubTrendingSection.querySelectorAll(".github-trending-card")) : [];
    const githubTrendRows = githubTrendingSection ? Array.from(githubTrendingSection.querySelectorAll("ol > li")) : [];
    const githubTrendItems = githubTrendCards.length > 0 ? githubTrendCards : githubTrendRows;
    const weakGithubTrendRows = githubTrendItems
      .map((row, index) => {
        const text = row.textContent?.replace(/\s+/g, " ").trim() || "";
        const bodyText = row.querySelector("p")?.textContent?.replace(/\s+/g, " ").trim() || text;
        const prose = bodyText
          .replace(/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/g, "")
          .replace(/\b(?:GitHub|Trending|Top|README|AI|RAG|AIGC|agent|infra|eval|NEW|SAME|DOWN|UP|stars|weekly|daily|all|python|typescript|rust|go|java)\b/gi, "")
          .replace(/https?:\/\/\S+/gi, "");
        const longEnglishRun = /[A-Za-z][A-Za-z0-9 ,;:'"()[\]/.!?+~`#-]{45,}/.test(prose);
        const chineseChars = (bodyText.match(/\p{Script=Han}/gu) || []).length;
        return longEnglishRun || chineseChars < 10
          ? { index, text: text.slice(0, 220), long_english_run: longEnglishRun, chinese_chars: chineseChars }
          : null;
      })
      .filter(Boolean);
    addCheck(
      "github_trending_reader_facing_top5_to_8",
      githubTrendItems.length >= 5 && githubTrendItems.length <= 8 && weakGithubTrendRows.length === 0,
      "GitHub Trending should render Top 5 to 8 in the public page with README-grounded Chinese reader-facing summaries when README fetch succeeds.",
      {
        count: githubTrendItems.length,
        expected_count_range: "5..8",
        weak_rows: weakGithubTrendRows
      }
    );
    const trackingCards = Array.from(document.querySelectorAll(".tracking-card"));
    const weakTrackingCards = trackingCards
      .map((card, index) => {
        const sourceUnavailable = hasTrackingSourceUnavailableNote(card);
        const officialRows = officialTrackingSnapshotRows(card);
        const hasVisualData = Boolean(
          card.querySelector("[data-card-data-table]") ||
          card.querySelector("[data-card-bars]") ||
          card.querySelector("[data-tracking-trend-curve]") ||
          card.querySelector("[data-official-component-snapshot]") ||
          card.querySelector(".card-media-grid img")
        );
        const rankDetailLabels = Array.from(card.querySelectorAll(".card-detail-list dt"))
          .map((node) => node.textContent?.trim() || "")
          .filter((text) => /^#\d+/.test(text));
        const detailRows = card.querySelectorAll(".card-detail-list div").length;
        const ok = (sourceUnavailable || hasVisualData || officialRows >= 3) && rankDetailLabels.length === 0 && detailRows <= 2;
        return ok
          ? null
          : {
              index,
              title: card.querySelector("h3")?.textContent?.replace(/\s+/g, " ").trim() || "",
              has_visual_data: hasVisualData,
              official_rows: officialRows,
              source_unavailable: sourceUnavailable,
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
    const missingTrendCurveCards = trackingCards
      .map((card, index) => {
        if (hasTrackingSourceUnavailableNote(card)) {
          return null;
        }
        const title = card.querySelector("h3")?.textContent?.replace(/\s+/g, " ").trim() || "";
        const hasStructuredTracking = Boolean(
          card.querySelector("[data-card-data-table]") ||
          card.querySelector("[data-card-bars]") ||
          card.querySelector("[data-official-component-snapshot]")
        );
        if (!hasStructuredTracking) {
          return null;
        }
        const trendStatus = card.getAttribute("data-trend-status") || "";
        const historyPointCount = Number(card.getAttribute("data-trend-history-points") || 0);
        if (trendStatus === "insufficient-history" && historyPointCount < 2) {
          return null;
        }
        const curve = card.querySelector("[data-tracking-trend-curve]");
        const pointCount = Number(curve?.getAttribute("data-trend-points") || 0);
        return curve && pointCount >= 2
          ? null
          : { index, title, point_count: pointCount };
      })
      .filter(Boolean);
    addCheck(
      "daily_tracking_trend_curves",
      missingTrendCurveCards.length === 0,
      "Daily tracking cards with structured leaderboard data should include a pre-rendered recent trend curve when history is available.",
      { missing_cards: missingTrendCurveCards }
    );
    const trackingScreenshotIssues = trackingCards
      .map((card) => {
        const title = card.querySelector("h3")?.textContent?.replace(/\s+/g, " ").trim() || "";
        if (!["OpenRouter", "Artificial Analysis"].includes(title)) {
          return null;
        }
        if (hasTrackingSourceUnavailableNote(card)) {
          return null;
        }
        const hasOfficialSnapshot = Boolean(card.querySelector("[data-official-component-snapshot]"));
        const tableRows = card.querySelectorAll("[data-card-data-table] tbody tr").length + officialTrackingSnapshotRows(card);
        const imageCount = card.querySelectorAll(".card-media-grid img").length;
        return ((hasOfficialSnapshot && imageCount === 0) || (tableRows >= 3 && imageCount === 0))
          ? null
          : {
              title,
              table_rows: tableRows,
              official_snapshot: hasOfficialSnapshot,
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
    const artificialAnalysisEmptyFallbackTabs = trackingCards
      .map((card) => {
        const title = card.querySelector("h3")?.textContent?.replace(/\s+/g, " ").trim() || "";
        const text = card.textContent?.replace(/\s+/g, " ").trim() || "";
        if (!/Artificial Analysis/i.test(title)) {
          return null;
        }
        const emptyLabels = ["Score vs. Token Usage", "Score vs. Cost", "Score vs. Compute", "Token Usage", "Cost"]
          .filter((label) => text.includes(label) && /source_tab_not_collected|fallback/i.test(text));
        return emptyLabels.length > 0 ? { title, empty_labels: emptyLabels } : null;
      })
      .filter(Boolean);
    addCheck(
      "daily_tracking_no_empty_fallback_tabs",
      artificialAnalysisEmptyFallbackTabs.length === 0,
      "Artificial Analysis should not expose empty fallback tabs when score/cost/scatter data was not collected.",
      { issues: artificialAnalysisEmptyFallbackTabs }
    );
    const officialSnapshotLayoutIssues = trackingCards
      .map((card, index) => {
        const snapshot = card.querySelector("[data-official-component-snapshot] .official-tracking-snapshot, .official-tracking-snapshot");
        if (!snapshot) {
          return null;
        }
        const rect = snapshot.getBoundingClientRect();
        const directBroadRoot = snapshot.querySelector(":scope > main, :scope > body, :scope > html");
        const directChrome = snapshot.querySelector(":scope > nav, :scope > header, :scope > footer, :scope > aside");
        const heightLimit = document.documentElement.clientWidth <= 760 ? 460 : 540;
        const mediaTooTall = Array.from(snapshot.querySelectorAll("svg, img, canvas, video")).some((node) => {
          const mediaRect = node.getBoundingClientRect();
          return mediaRect.height > 180 || mediaRect.width > rect.width + 2;
        });
        const ok = rect.height <= heightLimit && !directBroadRoot && !directChrome && !mediaTooTall;
        return ok
          ? null
          : {
              index,
              title: card.querySelector("h3")?.textContent?.replace(/\s+/g, " ").trim() || "",
              height: Math.round(rect.height),
              height_limit: heightLimit,
              direct_broad_root: directBroadRoot?.tagName?.toLowerCase() || "",
              direct_page_chrome: directChrome?.tagName?.toLowerCase() || "",
              media_too_tall: mediaTooTall
            };
      })
      .filter(Boolean);
    addCheck(
      "daily_tracking_official_snapshot_layout",
      officialSnapshotLayoutIssues.length === 0,
      "Official tracking snapshots must be bounded component fragments, not full-page DOM dumps or oversized visual blocks.",
      { issues: officialSnapshotLayoutIssues }
    );
    function officialTrackingSnapshotRows(card) {
      const snapshot = card.querySelector("[data-official-component-snapshot] .official-tracking-snapshot, .official-tracking-snapshot");
      if (!snapshot) {
        return 0;
      }
      const structuredRows = snapshot.querySelectorAll("tbody tr, [role='row'], li").length;
      if (structuredRows > 0) {
        return structuredRows;
      }
      const directChildren = Array.from(snapshot.children).filter((node) => (node.textContent || "").trim().length >= 10).length;
      if (directChildren > 0) {
        return directChildren;
      }
      const textLength = (snapshot.textContent || "").replace(/\s+/g, " ").trim().length;
      return textLength >= 80 ? 3 : 0;
    }
    function hasTrackingSourceUnavailableNote(card) {
      const text = card.textContent?.replace(/\s+/g, " ").trim() || "";
      return /source[-\s]?unavailable|源不可用|官方 web 组件 snapshot 本轮不可用|snapshot 本轮不可用|只保留官方入口供读者手动核对/i.test(text);
    }
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
        const selectors = [":scope > h3", ":scope > .card-tags", ":scope > .card-stat-grid", ":scope > .card-trend-curve", ":scope > .card-bars", ":scope > .card-table", ":scope > .card-media-grid", ":scope > p"];
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
        const summaryLike = /(?:已保留原文|适合结合原帖|这条\s*X\/Twitter\s*讨论|原帖讨论|可作为|读者可|继续核对|重点看|适合用来核对|事实性结论仍需)/i.test(bodyText);
        const originalBuried = originalText.length >= 10;
        const ok = bodyText.length > 0 &&
          !summaryLike &&
          !originalBuried;
        return ok
          ? null
          : {
              index,
              title: card.querySelector("h3")?.textContent?.replace(/\s+/g, " ").trim() || "",
              body: bodyText.slice(0, 180),
              summary_like: summaryLike,
              original_buried: originalBuried,
              original_text: originalText.slice(0, 180)
            };
      })
      .filter(Boolean);
    addCheck(
      "builder_cards_original_text",
      weakBuilderCards.length === 0,
      "X/Twitter builder cards should render the original post text in the body, not a translated/generic summary with the original buried in details.",
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
        const ok = bodyText.length >= 100 && chineseChars >= 50 && chineseRatio >= 0.35 && !longEnglishRun;
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
    const communityAggregatorFillerHits = Array.from(document.querySelectorAll(".community-card"))
      .map((card, index) => {
        const title = card.querySelector("h3")?.textContent?.replace(/\s+/g, " ").trim() || "";
        const body = card.querySelector(":scope > p")?.textContent?.replace(/\s+/g, " ").trim() || "";
        const text = `${title} ${body}`;
        const filler = /(?:Google News|RSS\s*记录了一条|记录了一条[^。；;\n]*(?:公开条目|公开动态)|详情需回到原文链接核对)/u.test(text);
        return filler
          ? {
              index,
              title,
              body: body.slice(0, 180)
            }
          : null;
      })
      .filter(Boolean);
    addCheck(
      "community_aggregator_filler_absent",
      communityAggregatorFillerHits.length === 0,
      "Community cards should not expose aggregator labels or low-information feed fallback wording.",
      { hits: communityAggregatorFillerHits }
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
        const legacyPointText = pointRows
          .filter((row) => /^\u8981\u70b9\s*\d+/.test(row.querySelector("dt")?.textContent || ""))
          .map((row) => row.querySelector("dd")?.textContent?.replace(/\s+/g, " ").trim() || "")
          .filter(Boolean);
        const plain = bodyText.replace(/[#*_=`~]/g, "").trim();
        const chineseChars = (plain.match(/\p{Script=Han}/gu) || []).length;
        const latinChars = (plain.match(/[A-Za-z]/g) || []).length;
        const ratioBase = chineseChars + latinChars;
        const chineseRatio = ratioBase > 0 ? chineseChars / ratioBase : 0;
        const strictSummaryContract = !reportDate || String(reportDate) >= "2026-06-17";
        const minChineseChars = strictSummaryContract ? 100 : 80;
        const maxChineseOk = !strictSummaryContract || chineseChars <= 200;
        const legacyPointCount = legacyPointText.filter(Boolean).length;
        const untranslatedEnglish = /\b[A-Z][A-Za-z0-9 ,;:'"()[\]\/-]{35,}[.!?]/.test(plain);
        const hotBlogTemplate = /(?:\u8fd9\u7bc7\u6587\u7ae0\u7684\u770b\u70b9\u4e0d\u662f|\u4e0d\u662f\u5355\u4e2a\u6280\u672f\u540d\u8bcd|\u8bfb\u8005\u53ef\u4ee5\u91cd\u70b9\u770b|\u5bf9\u975e\s*AI\s*\u76f4\u63a5\u4ece\u4e1a\u8005|\u4ef7\u503c\u5728\u4e8e)/iu;
        const coveragePatterns = [
          /(?:\u6587\u7ae0|\u535a\u5ba2|\u4f5c\u8005|\u539f\u6587|\u5b83).{0,32}(?:\u8bb2|\u68b3\u7406|\u8bf4\u660e|\u5206\u6790|\u62c6\u89e3|\u5c55\u793a|\u56f4\u7ed5|\u9a8c\u8bc1|\u5c55\u5f00)/u,
          /(?:\u4f9d\u636e|\u8bc1\u636e|\u65b9\u6cd5|\u5b9e\u9a8c|\u6848\u4f8b|\u4ee3\u7801|\u63a5\u53e3|\u6570\u636e|\u5bf9\u6bd4|\u9650\u5236|\u6743\u9650|\u5931\u8d25|\u6d41\u7a0b|\u95e8\u69db|\u8fb9\u754c)/u,
          /(?:\u8bfb\u8005|\u56e2\u961f|\u5173\u6ce8|\u7559\u610f|\u6838\u5bf9|\u5224\u65ad|\u8bd5\u70b9|\u91c7\u8d2d|\u843d\u5730|\u98ce\u9669|\u5c40\u9650|\u8def\u7ebf\u56fe|\u53c2\u8003|\u5b89\u5168\u95e8)/u
        ];
        const coverageHits = coveragePatterns.filter((pattern) => pattern.test(plain)).length;
        const weakSummaryText = bodyText.length > 0 && chineseChars < minChineseChars;
        const templateOrLowInfo = hotBlogTemplate.test(plain) || coverageHits < 2 || weakSummaryText;
        const ok = chineseChars >= minChineseChars && maxChineseOk && chineseRatio >= 0.45 && legacyPointCount === 0 && !untranslatedEnglish && !templateOrLowInfo;
        return ok
          ? null
          : {
              index,
              title: card.querySelector("h3")?.textContent?.replace(/\s+/g, " ").trim() || "",
              length: plain.length,
              legacy_point_count: legacyPointCount,
              chinese_chars: chineseChars,
              min_chinese_chars: minChineseChars,
              max_chinese_ok: maxChineseOk,
              chinese_ratio: Number(chineseRatio.toFixed(3)),
              untranslated_english: untranslatedEnglish,
              template_or_low_information: templateOrLowInfo,
              coverage_hits: coverageHits,
              weak_summary_text: weakSummaryText
            };
      })
      .filter(Boolean);
    addCheck(
      "hot_blog_cards_reader_facing",
      weakBlogCards.length === 0,
      "Hot blog cards should render as a reader-facing Chinese article summary, not legacy point rows, untranslated excerpts, or thin summaries.",
      { weak_cards: weakBlogCards }
    );
    const internalDebugPattern =
      /信源审计|自检与产物|发布质量说明|Source status|候选\s*\/\s*入选|source_audit|self_check|candidate_pool|candidate_id|quality_status|degraded_sections|remediation|parsed_count|feedback-ledger|config\/feedback-ledger\.json|Feedback Ledger Review|Regression Self-Check|降级项/;
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
        return rel.includes("noopener") && rel.includes("noreferrer") && anchor.getAttribute("target") === "_blank";
      }),
      "External links should include noopener noreferrer and open in a new tab."
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
        quality_channel: card.getAttribute("data-quality-channel") || "",
        main_stream_status: card.getAttribute("data-main-stream-status") || ""
      }))
      .filter((card) => card.metric_count < 6 || !card.strength || !card.quality || !card.quality_channel || !card.main_stream_status);
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
    const officialBlogKnowledge = document.querySelector("#official-blog-knowledge");
    const officialBlogCards = Array.from(document.querySelectorAll("[data-official-blog-card]"));
    const officialBlogCompanies = new Set(
      officialBlogCards
        .map((card) => card.getAttribute("data-official-blog-company") || "")
        .filter(Boolean)
    );
    const officialBlogJsonLink = document.querySelector('#official-blog-knowledge a[href="data/official-blogs.json"]');
    const officialBlogPrivateHits = officialBlogKnowledge
      ? ["admission", "admission_policy", "source_audit", "self_check", "candidate_id"].filter((token) =>
          (officialBlogKnowledge.textContent || "").includes(token)
        )
      : [];

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
      "official_blog_knowledge_present",
      Boolean(officialBlogKnowledge),
      "Homepage should render the official blog knowledge module."
    );
    addCheck(
      "official_blog_knowledge_cards",
      officialBlogCards.length >= 6 &&
        officialBlogCompanies.has("openai") &&
        officialBlogCompanies.has("anthropic") &&
        Boolean(officialBlogJsonLink),
      "Official blog module should expose curated OpenAI/Anthropic cards and the public JSON projection.",
      {
        card_count: officialBlogCards.length,
        companies: [...officialBlogCompanies].sort(),
        json_link: Boolean(officialBlogJsonLink)
      }
    );
    addCheck(
      "official_blog_knowledge_public_only",
      officialBlogPrivateHits.length === 0,
      "Official blog module should not expose admission or internal audit fields.",
      { hits: officialBlogPrivateHits }
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
      "Every date card should expose transparent metrics plus strength, quality, and main-stream channels.",
      { weak_cards: cardsWithoutMetrics }
    );
    const cardsWithoutMainStreamChip = cards
      .map((card) => ({
        date: card.getAttribute("data-date-card") || "",
        status: card.getAttribute("data-main-stream-status") || "",
        has_chip: Boolean(card.querySelector("[data-main-stream-chip]"))
      }))
      .filter((card) => !["target", "sparse", "empty", "oversized"].includes(card.status) || !card.has_chip);
    addCheck(
      "date_cards_main_stream_status",
      cards.length > 0 && cardsWithoutMainStreamChip.length === 0,
      "Every date card should separately expose whether the 1-12 story-first main stream target is met.",
      { weak_cards: cardsWithoutMainStreamChip }
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
