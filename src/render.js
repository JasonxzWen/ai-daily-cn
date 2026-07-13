import { reportRelativePaths, relativeAssetHref } from "./paths.js";
import {
  cleanGithubTrendDescription,
  cleanProjectDescription,
  githubTrendStatusTag,
  projectHeatTags
} from "./presentation.js";
import { importanceLabel } from "./importance.js";
import { normalizeUrlIdentity } from "./url.js";
import { adcPublicThemeAssetName, adcPublicThemeVersion } from "./adc-theme.js";

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#96;");
}

export function renderReportHtml(report) {
  const paths = reportRelativePaths(report.report_date);
  const jsonHref = relativeAssetHref(report.html_path, paths.dataPath);
  const markdownHref = report.markdown_path ? relativeAssetHref(report.html_path, report.markdown_path) : "";
  const mainItems = Array.isArray(report.main_items) ? report.main_items : [];
  const hotBlogs = Array.isArray(report.hot_blogs) ? report.hot_blogs : [];
  const githubTrending = Array.isArray(report.github_trending) ? report.github_trending : [];
  const projects = Array.isArray(report.projects) ? report.projects : [];
  const builderObservations = Array.isArray(report.builder_observations) ? report.builder_observations : [];
  const communityLeads = Array.isArray(report.community_leads) ? report.community_leads : [];
  const evidenceAssets = Array.isArray(report.evidence_assets) ? report.evidence_assets : [];
  const evidenceByUrl = evidenceAssetsBySourceUrl(evidenceAssets);
  const sourceAudit = report.source_audit && typeof report.source_audit === "object" ? report.source_audit : null;
  const sourceAuditSection = sourceAudit ? `\n    ${renderSourceAudit(sourceAudit)}\n` : "";
  const qualityStatusSection = renderQualityStatusSection(report.quality_status);
  const metaItems = [
    `<span><strong>${mainItems.length}</strong> 主体信息</span>`,
    githubTrending.length > 0 ? `<span><strong>${githubTrending.length}</strong> GitHub Trending</span>` : "",
    hotBlogs.length > 0 ? `<span><strong>${hotBlogs.length}</strong> 热门博客</span>` : "",
    builderObservations.length > 0 ? `<span><strong>${builderObservations.length}</strong> Builder 观察</span>` : "",
    communityLeads.length > 0 ? `<span><strong>${communityLeads.length}</strong> 社区线索</span>` : ""
  ]
    .filter(Boolean)
    .join("\n        ");
  const optionalSections = [
    renderHotBlogsSection(hotBlogs),
    renderGithubTrendingSection(githubTrending, projects),
    renderBuilderObservationsSection(builderObservations),
    renderCommunityLeadsSection(communityLeads)
  ].filter(Boolean).join("\n\n");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(report.title)}</title>
  <style>
${defaultStyleCss}
  </style>
</head>
<body>
  <header class="site-header">
    <a class="site-title" href="${escapeAttribute(relativeAssetHref(report.html_path, "index.html"))}">AI 日报</a>
    <span class="site-date">${escapeHtml(report.report_date)}</span>
  </header>
  <main class="page">
    <section class="report-hero">
      <p class="eyebrow">每日 AI 技术观察</p>
      <h1>${escapeHtml(report.title)}</h1>
      ${renderHeroSummary(report)}
      <div class="meta-grid" aria-label="日报统计">
        ${metaItems}
      </div>
    </section>

    <section class="section" id="main-items">
      <h2>主体信息</h2>
      ${mainItems.map((item) => renderMainItem(report, item, evidenceByUrl)).join("\n")}
    </section>
${optionalSections ? `\n    ${optionalSections}\n` : ""}
${qualityStatusSection ? `\n    ${qualityStatusSection}\n` : ""}
${sourceAuditSection}
    <section class="section" id="self-check">
      <h2>自检摘要</h2>
      <dl class="check-list">
        <div><dt>主条目</dt><dd>${escapeHtml(report.self_check.main_items)}</dd></div>
        <div><dt>Builder</dt><dd>${escapeHtml(report.self_check.builder_observations)}</dd></div>
        <div><dt>一手链接</dt><dd>${report.self_check.primary_links ? "通过" : "未通过"}</dd></div>
        <div><dt>无禁用表达</dt><dd>${report.self_check.no_banned_words ? "通过" : "未通过"}</dd></div>
        <div><dt>无无源数字</dt><dd>${report.self_check.no_unsourced_numbers ? "通过" : "未通过"}</dd></div>
      </dl>
      <p>${escapeHtml(report.self_check.notes || "无额外说明。")}</p>
      ${renderOptimizationSuggestions(report.self_check.optimization_suggestions)}
    </section>

    <nav class="artifact-links" aria-label="产物链接">
      <a href="${escapeAttribute(jsonHref)}">结构化 JSON</a>
      ${markdownHref ? `<a href="${escapeAttribute(markdownHref)}">Markdown 原文</a>` : ""}
    </nav>
  </main>
</body>
</html>
`;
}

function renderHeroSummary(report) {
  const highlights = Array.isArray(report.hero_highlights) ? report.hero_highlights.filter((item) => item?.title && item?.url).slice(0, 3) : [];
  if (highlights.length === 0) {
    return `<p class="summary">${escapeHtml(report.summary)}</p>`;
  }

  return `<ul class="summary">${highlights
    .map((item) => `<li><a href="${escapeAttribute(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a>${item.reason ? `：${escapeHtml(item.reason)}` : ""}</li>`)
    .join("\n")}</ul>`;
}

function renderQualityStatusSection(status) {
  if (!status || typeof status !== "object" || status.status === "ok") {
    return "";
  }
  const issues = [
    ...(Array.isArray(status.blocking_issues) ? status.blocking_issues : []),
    ...(Array.isArray(status.degraded_sections) ? status.degraded_sections : []),
    ...affectedSectionIssues(status)
  ];
  const issueList = issues.length > 0
    ? `<ul>${issues.map((issue) => `<li><strong>${escapeHtml(issue.section || "unknown")}</strong>（${escapeHtml(issue.code || issue.error_code || "quality_issue")}）：${escapeHtml(issue.message || "")}</li>`).join("\n")}</ul>`
    : "";
  return `<section class="section" id="quality-status">
      <h2>发布质量说明</h2>
      <p><strong>${status.status === "blocked" ? "阻断" : "降级"}</strong>${status.public_note ? `：${escapeHtml(status.public_note)}` : ""}</p>
      ${issueList}
    </section>`;
}

function affectedSectionIssues(status) {
  if (!Array.isArray(status.affected_sections) || status.affected_sections.length === 0) {
    return [];
  }
  const existing = new Set([
    ...(Array.isArray(status.blocking_issues) ? status.blocking_issues : []),
    ...(Array.isArray(status.degraded_sections) ? status.degraded_sections : [])
  ].map((issue) => issue?.section).filter(Boolean));
  return status.affected_sections
    .filter((section) => section && !existing.has(section))
    .map((section) => ({
      code: "affected_section_degraded",
      section,
      message: "该板块存在公开说明中的降级风险。"
    }));
}

export function renderIndexHtml(feed, trends = null, dateIndex = null, options = {}) {
  return renderOpsIndexHtml(feed, trends, dateIndex, options);
}

export function renderOpsIndexHtml(feed, trends = null, dateIndex = null, options = {}) {
  const latest = feed.reports[0];
  const dateItems = Array.isArray(dateIndex?.items) ? dateIndex.items : [];
  const latestItem = dateItems.find((item) => item.date === latest?.report_date) || dateItems.at(-1) || null;
  const indexConsole = renderIndexConsole(feed, dateIndex, latestItem);
  const latestBriefing = renderLatestBriefing(latestItem, latest);
  const signalHeatStrip = renderSignalHeatStrip(dateIndex);
  const sourceLaneBoard = renderSourceLaneBoard(dateIndex);
  const topicRadar = renderTopicRadar(trends);
  const officialBlogKnowledge = renderOfficialBlogKnowledge(options.officialBlogKnowledge);
  const dateResearchIndex = renderDateResearchIndex(dateIndex, latest);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(feed.site_title)}</title>
  <link rel="stylesheet" href="${escapeAttribute(indexStyleHref(options.styleVersion))}">
</head>
<body data-adc-public-surface="ops">
  <header class="site-header">
    <span class="site-title"><span class="adc-public-brand">ADC.</span><span>AI 日报</span></span>
    <span class="site-date">更新于 ${escapeHtml(feed.updated_at)}</span>
  </header>
  <main class="report-shell index-page" data-index-style="effective-interact">
    ${indexConsole}
    ${renderIndexNav()}
    <div class="index-dashboard-grid report-section-stack">
      ${latestBriefing}
      ${topicRadar}
    </div>
    ${officialBlogKnowledge}
    ${signalHeatStrip}
    ${sourceLaneBoard}
    ${dateResearchIndex}
  </main>
</body>
</html>
`;
}

function indexStyleHref(styleVersion) {
  const version = String(styleVersion || "").trim();
  return version ? `assets/style.css?v=${encodeURIComponent(version)}` : "assets/style.css";
}

export function renderOfficialBlogsHtml(knowledge = {}, options = {}) {
  const records = sortedOfficialBlogRecords(Array.isArray(knowledge.records) ? knowledge.records : []);
  const recordById = new Map(records.map((record) => [record.id, record]));
  const stats = knowledge.stats || {};
  const byCompany = stats.by_company || {};
  const topics = Array.isArray(knowledge.topics) ? knowledge.topics.slice(0, 18) : [];
  const styleHref = String(options.styleHref || "../assets/style.css");
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>官方博客知识库 | AI 日报</title>
  <link rel="stylesheet" href="${escapeAttribute(styleHref)}">
</head>
<body data-adc-public-surface="official-blogs">
  <header class="site-header">
    <a class="site-title" href="../index.html"><span class="adc-public-brand">ADC.</span><span>AI 日报</span></a>
    <span class="site-date">官方博客知识库</span>
  </header>
  <main class="report-shell index-page official-blog-page" data-index-style="effective-interact">
    <section class="report-hero report-hero-index official-blog-page-hero" id="official-blog-excerpts" aria-labelledby="official-blog-excerpts-title" data-section-type="knowledge">
      <div class="title-row">
        <div>
          <p class="eyebrow">OpenAI / Anthropic</p>
          <h1 class="report-title" id="official-blog-excerpts-title">官方博客节选</h1>
        </div>
        <span class="chip status-info">${escapeHtml(records.length)} 篇</span>
      </div>
      <p class="hero-summary-text">${escapeHtml(officialBlogCurationSummary(knowledge.curation_scope))}</p>
      <div class="hero-stat-grid" aria-label="官方博客知识库统计">
        ${renderConsoleStat("记录", stats.total_records ?? records.length, "official_blog_records")}
        ${renderConsoleStat("OpenAI", byCompany.openai || 0, "official_blog_openai")}
        ${renderConsoleStat("Anthropic", byCompany.anthropic || 0, "official_blog_anthropic")}
        ${renderConsoleStat("主题", topics.length, "official_blog_topics")}
      </div>
      <nav class="artifact-links official-blog-page-actions" aria-label="官方博客知识库入口">
        <a href="../index.html">返回首页</a>
        <a href="../data/official-blogs.json">official-blogs.json</a>
      </nav>
    </section>
    <section class="panel official-blog-topic-panel" aria-labelledby="official-blog-topic-title">
      <div class="section-heading split-row">
        <div>
          <p class="eyebrow">主题索引</p>
          <h2 id="official-blog-topic-title">长期跟踪主题</h2>
        </div>
        <span class="chip status-info">${escapeHtml(topics.length)} topics</span>
      </div>
      <div class="official-blog-topic-row" aria-label="官方博客主题">
        ${topics.map((topic) => `<span class="tag tag-topic">${escapeHtml(topic)}</span>`).join("")}
      </div>
    </section>
    <section class="official-blog-excerpt-grid" aria-label="官方博客节选列表">
      ${records.map((record) => renderOfficialBlogExcerptCard(record, recordById)).join("\n")}
    </section>
  </main>
</body>
</html>
`;
}

function renderIndexNav() {
  const links = [
    ["index-console", "总览"],
    ["latest-briefing", "最新主线"],
    ["signal-heat-strip", "时间热力"],
    ["source-lane-board", "来源结构"],
    ["topic-radar", "主题线索"],
    ["date-research-index", "日期索引"]
  ];
  return `<nav class="report-nav" aria-label="首页章节">
      <p class="report-nav-title">日报导航</p>
      <div class="report-nav-group">
        <span class="report-nav-group-title">首页模块</span>
        ${links.map(([id, label]) => `<a href="#${escapeAttribute(id)}" data-nav-link><span>${escapeHtml(label)}</span></a>`).join("\n")}
        <a href="#official-blog-knowledge" data-nav-link><span>官方博客</span></a>
      </div>
    </nav>`;
}

function renderIndexConsole(feed, dateIndex, latestItem) {
  const totals = dateIndex?.totals || {};
  const dateRange = dateIndex?.date_from && dateIndex?.date_to
    ? `${dateIndex.date_from} 至 ${dateIndex.date_to}`
    : "暂无完整窗口";
  const latestUrl = latestItem?.url || feed.reports?.[0]?.url || "";
  const latestDataUrl = latestItem?.data_url || feed.reports?.[0]?.data_url || "";
  const reportCount = totals.report_count ?? feed.reports?.length ?? 0;
  const strongDays = totals.strong_days ?? 0;
  const degradedDays = totals.degraded_days ?? 0;
  const mainSignals = totals.main_items ?? 0;
  return `<section class="report-hero report-hero-index" id="index-console" aria-labelledby="index-console-title" data-report-region="hero">
      <div class="title-row">
        <div>
          <p class="eyebrow">30 天 AI 信号简报</p>
          <h1 class="report-title" id="index-console-title">${escapeHtml(feed.site_title || "AI 日报")}</h1>
        </div>
        <span class="chip status-info">更新 ${escapeHtml(feed.updated_at || "-")}</span>
      </div>
      <div class="hero-brief">
        <p class="hero-summary-text">近 30 天共 ${escapeHtml(reportCount)} 份日报，${escapeHtml(strongDays)} 个强信号日，${escapeHtml(degradedDays)} 个质量降级日；主体信号累计 ${escapeHtml(mainSignals)} 条，最新日期 ${escapeHtml(latestItem?.date || feed.reports?.[0]?.report_date || "-")}。</p>
        <div class="hero-stat-grid" aria-label="30 天总览">
          ${renderConsoleStat("时间窗口", dateRange, "date_range")}
          ${renderConsoleStat("日报", reportCount, "report_count")}
          ${renderConsoleStat("最新日期", latestItem?.date || feed.reports?.[0]?.report_date || "-", "latest_date")}
          ${renderConsoleStat("强信号日", strongDays, "strong_days")}
          ${renderConsoleStat("质量降级日", degradedDays, "degraded_days", "quality")}
          ${renderConsoleStat("主体信号", mainSignals, "main_items")}
        </div>
      </div>
      <div class="artifact-links index-console-actions card-tags" aria-label="最新日报入口">
          ${latestUrl ? `<a href="${escapeAttribute(latestUrl)}">打开最新日报</a>` : ""}
          ${latestDataUrl ? `<a href="${escapeAttribute(latestDataUrl)}">最新 JSON</a>` : ""}
          <a href="feed.json">feed.json</a>
          <a href="trends.json">trends.json</a>
      </div>
    </section>`;
}

function renderConsoleStat(label, value, id, variant = "") {
  return `<span class="hero-stat${variant ? ` hero-stat-${escapeAttribute(variant)}` : ""}" data-console-stat="${escapeAttribute(id)}"><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong></span>`;
}

function renderLatestBriefing(latestItem, fallbackReport) {
  if (!latestItem && !fallbackReport) {
    return "";
  }
  const item = latestItem || {};
  const report = fallbackReport || {};
  const quality = item.quality || {};
  const strength = item.strength || {};
  const mainStream = normalizeMainStream(item.main_stream, item.metrics);
  const highlights = Array.isArray(item.highlights) ? item.highlights.filter((entry) => entry?.title && entry?.url).slice(0, 3) : [];
  const highlightHtml = highlights.length > 0
    ? `<ul class="compact-list latest-highlights">${highlights.map((entry) => `<li><a href="${escapeAttribute(entry.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(entry.title)}</a>${entry.reason ? `：${escapeHtml(firstSentence(entry.reason))}` : ""}</li>`).join("")}</ul>`
    : `<p class="muted">暂无可展示的 highlights。</p>`;
  return `<section class="panel latest-briefing" id="latest-briefing" aria-labelledby="latest-briefing-title" data-section-type="summary">
      <div class="section-heading split-row">
        <div>
          <p class="eyebrow">最新主线</p>
          <h2 id="latest-briefing-title">${escapeHtml(item.date || report.report_date || "最新日报")}</h2>
        </div>
        <span class="date-detail-badges">
          ${renderMainStreamChip(mainStream)}
          <span class="chip ${escapeAttribute(statusClassForQuality(quality.status || "ok"))} quality-${escapeAttribute(quality.status || "ok")}">${escapeHtml(quality.label || qualityStatusLabel(quality.status || "ok"))}</span>
        </span>
      </div>
      <p><strong>${escapeHtml(strength.label || "信号")}</strong>：${escapeHtml(firstSentence(item.summary || report.summary) || "暂无摘要")}</p>
      ${highlightHtml}
      <nav class="artifact-links" aria-label="最新日报链接">
        ${item.url || report.url ? `<a href="${escapeAttribute(item.url || report.url)}">打开日报</a>` : ""}
        ${item.data_url || report.data_url ? `<a href="${escapeAttribute(item.data_url || report.data_url)}">JSON</a>` : ""}
      </nav>
    </section>`;
}

function renderSignalHeatStrip(dateIndex) {
  const items = Array.isArray(dateIndex?.items) ? dateIndex.items : [];
  if (items.length === 0) {
    return "";
  }
  return `<section class="panel signal-heat-section" id="signal-heat-strip" aria-labelledby="signal-heat-title" data-section-type="timeline">
      <div class="section-heading split-row">
        <div>
          <p class="eyebrow">严格时间顺序</p>
          <h2 id="signal-heat-title">30 天信号热力带</h2>
        </div>
        <span class="chip status-info">${escapeHtml(dateIndex.date_from || "")} → ${escapeHtml(dateIndex.date_to || "")}</span>
      </div>
      <div class="signal-heat-row" role="list" aria-label="按日期排列的信号强度与质量">
        ${items.map(renderSignalHeatDay).join("\n")}
      </div>
      <p class="muted">条形高度表示信号强度；质量 badge 和边框单独标记 degraded/blocked，不参与强度计算。</p>
    </section>`;
}

function renderSignalHeatDay(item) {
  const strength = item.strength || {};
  const quality = item.quality || {};
  const mainStream = normalizeMainStream(item.main_stream, item.metrics);
  const visual = item.visual || {};
  const intensity = Number.isFinite(Number(visual.intensity || strength.intensity)) ? Number(visual.intensity || strength.intensity) : 1;
  const height = `${Math.max(18, Math.min(72, intensity * 14))}px`;
  return `<a class="signal-day signal-${escapeAttribute(strength.level || "quiet")} quality-${escapeAttribute(quality.status || "ok")}"
      data-signal-day="${escapeAttribute(item.date)}"
      data-strength-level="${escapeAttribute(strength.level || "quiet")}"
      data-quality-channel="${escapeAttribute(quality.status || "ok")}"
      data-main-stream-status="${escapeAttribute(mainStream.status)}"
      href="${escapeAttribute(item.url || "#date-research-index")}"
      aria-label="${escapeAttribute(`${item.date} ${strength.label || ""} ${mainStream.label || ""} ${quality.label || quality.status || ""}`)}">
      <span class="signal-day-bar" style="--signal-day-height:${escapeAttribute(height)}"></span>
      <span class="signal-day-date">${escapeHtml(item.date?.slice(5) || item.date || "")}</span>
      <span class="signal-day-quality chip ${escapeAttribute(statusClassForQuality(quality.status || "ok"))}">${escapeHtml(qualityStatusLabel(quality.status || "ok"))}</span>
    </a>`;
}

function renderSourceLaneBoard(dateIndex) {
  const items = Array.isArray(dateIndex?.items) ? dateIndex.items : [];
  if (items.length === 0) {
    return "";
  }
  const lanes = [
    sourceLane(items, "main_items", "主体信号", (item) => item.metrics?.main_items_count, "主线事实与产品/产业信号"),
    sourceLane(items, "github_trending", "GitHub", (item) => item.metrics?.github_trending_count, "项目趋势与开源实现线索"),
    sourceLane(items, "builder_observations", "Builder", (item) => item.metrics?.builder_observations_count, "开发者与研究者原始动态"),
    sourceLane(items, "hot_blogs", "博客", (item) => item.metrics?.hot_blogs_count, "深读文章与技术拆解"),
    sourceLane(items, "daily_tracking", "追踪", (item) => item.metrics?.daily_tracking_count, "榜单、模型和平台变化"),
    {
      id: "coverage_quality",
      label: "覆盖质量",
      total: items.filter((item) => item.quality?.status === "ok").length,
      activeDays: items.length,
      detail: `${items.filter((item) => item.quality?.status === "degraded" || item.quality?.status === "blocked").length} 个日期降级/阻断`
    }
  ];
  return `<section class="panel source-lane-board" id="source-lane-board" aria-labelledby="source-lane-title" data-section-type="metrics">
      <div class="section-heading split-row">
        <div>
          <p class="eyebrow">来源结构</p>
          <h2 id="source-lane-title">存量数据通道</h2>
        </div>
        <span class="chip status-info">透明统计</span>
      </div>
      <div class="table-scroll source-lane-table-scroll">
        <table class="report-data-table source-lane-table">
          <thead>
            <tr>
              <th scope="col">通道</th>
              <th scope="col">总量</th>
              <th scope="col">活跃天</th>
              <th scope="col">30 天占比</th>
              <th scope="col">说明</th>
            </tr>
          </thead>
          <tbody>
            ${lanes.map((lane) => renderSourceLaneRow(lane, items.length)).join("\n")}
          </tbody>
        </table>
      </div>
    </section>`;
}

function sourceLane(items, id, label, valueForItem, detail) {
  const values = items.map((item) => Number(valueForItem(item) || 0));
  return {
    id,
    label,
    total: values.reduce((sum, value) => sum + value, 0),
    activeDays: values.filter((value) => value > 0).length,
    detail
  };
}

function renderSourceLaneRow(lane, totalDays) {
  const activeRatio = totalDays > 0 ? Math.round((Number(lane.activeDays || 0) / totalDays) * 100) : 0;
  return `<tr data-source-lane="${escapeAttribute(lane.id)}">
      <th scope="row" data-label="通道">
        <span class="source-lane-label">${escapeHtml(lane.label)}</span>
      </th>
      <td data-label="总量"><strong>${escapeHtml(lane.total)}</strong></td>
      <td data-label="活跃天">${escapeHtml(lane.activeDays)} 天</td>
      <td data-label="30 天占比">
        <span class="source-lane-meter" aria-label="${escapeAttribute(`${lane.label} 活跃占比 ${activeRatio}%`)}"><span style="--source-lane-ratio:${escapeAttribute(String(activeRatio))}%"></span></span>
        <span class="muted">${escapeHtml(activeRatio)}%</span>
      </td>
      <td data-label="说明">${escapeHtml(lane.detail)}</td>
    </tr>`;
}

function renderTopicRadar(trends) {
  const topics = Array.isArray(trends?.topics)
    ? trends.topics.filter((topic) => topic.status === "hot" || topic.status === "active").slice(0, 6)
    : [];
  const topicBody = topics.length > 0
    ? `<div class="topic-radar-list">
        ${topics.map(renderTopicRadarItem).join("\n")}
      </div>`
    : `<p class="muted" data-topic-empty="true">暂无达到 hot/active 阈值的趋势主题。</p>`;
  return `<section class="panel topic-radar" id="topic-radar" aria-labelledby="topic-radar-title" data-section-type="details">
      <div class="section-heading split-row">
        <div>
          <p class="eyebrow">趋势雷达</p>
          <h2 id="topic-radar-title">热点研究线索</h2>
        </div>
        <a class="chip status-info" href="trends.json">trends.json</a>
      </div>
      ${topicBody}
    </section>`;
}

function renderTopicRadarItem(topic) {
  const entities = Array.isArray(topic.entities) && topic.entities.length > 0
    ? `<span class="topic-entities">${topic.entities.slice(0, 4).map((entity) => escapeHtml(entity)).join(" / ")}</span>`
    : "";
  return `<article class="topic-radar-item" data-topic-id="${escapeAttribute(topic.id || topic.label || "")}">
      <div>
        <h3>${escapeHtml(topic.label || topic.id || "未命名主题")}</h3>
        ${entities}
      </div>
      <div class="topic-radar-metrics">
        <span><b>${escapeHtml(topic.occurrences || 0)}</b>次</span>
        <span><b>${escapeHtml(topic.active_days || 0)}</b>天</span>
        <span class="chip ${escapeAttribute(topic.status === "hot" ? "status-warn" : "status-info")} topic-status topic-status-${escapeAttribute(topic.status || "active")}">${escapeHtml(topic.status || "active")}</span>
      </div>
    </article>`;
}

function renderOfficialBlogKnowledge(knowledge) {
  const records = Array.isArray(knowledge?.records) ? knowledge.records : [];
  if (records.length === 0) {
    return "";
  }
  const stats = knowledge.stats || {};
  const byCompany = stats.by_company || {};
  const featured = sortedOfficialBlogRecords(records).slice(0, 6);
  const topics = (Array.isArray(knowledge.topics) ? knowledge.topics : [])
    .slice(0, 12);
  return `<section class="panel official-blog-knowledge" id="official-blog-knowledge" aria-labelledby="official-blog-knowledge-title" data-section-type="knowledge">
      <div class="section-heading split-row">
        <div>
          <p class="eyebrow">OpenAI / Anthropic</p>
          <h2 id="official-blog-knowledge-title">官方博客知识库</h2>
        </div>
        <span class="official-blog-actions">
          <a class="chip status-info" href="official-blogs/">博客节选</a>
          <a class="chip status-info" href="data/official-blogs.json">official-blogs.json</a>
        </span>
      </div>
      <p class="official-blog-summary">${escapeHtml(officialBlogCurationSummary(knowledge.curation_scope))}</p>
      <div class="official-blog-stat-grid" aria-label="官方博客知识库统计">
        ${renderOfficialBlogStat("总记录", stats.total_records ?? records.length)}
        ${renderOfficialBlogStat("OpenAI", byCompany.openai || 0)}
        ${renderOfficialBlogStat("Anthropic", byCompany.anthropic || 0)}
        ${renderOfficialBlogStat("主题", topics.length)}
      </div>
      <div class="official-blog-topic-row" aria-label="官方博客主题">
        ${topics.map((topic) => `<span class="tag tag-topic">${escapeHtml(topic)}</span>`).join("")}
      </div>
      <div class="official-blog-grid">
        ${featured.map(renderOfficialBlogCard).join("\n")}
      </div>
    </section>`;
}

function sortedOfficialBlogRecords(records) {
  return [...records].sort((left, right) =>
    officialBlogImportanceRank(right.importance) - officialBlogImportanceRank(left.importance) ||
    String(right.published_at || "").localeCompare(String(left.published_at || "")) ||
    String(left.id || "").localeCompare(String(right.id || ""))
  );
}

function officialBlogCurationSummary(value) {
  const text = String(value || "").trim();
  if (!text || text === "Curated OpenAI and Anthropic official blogs with durable product, model, technical-practice, harness, agent workflow, eval, safety-engineering, or implementation knowledge value.") {
    return "收录 OpenAI 与 Anthropic 官方博客中具有长期知识价值的产品、模型、技术实践、harness 工程、智能体工作流、评测、安全工程与工程落地内容。";
  }
  return text;
}

function renderOfficialBlogStat(label, value) {
  return `<span class="official-blog-stat"><strong>${escapeHtml(value)}</strong>${escapeHtml(label)}</span>`;
}

function renderOfficialBlogCard(record) {
  const ideas = Array.isArray(record.key_ideas) ? record.key_ideas.slice(0, 2) : [];
  const checklist = Array.isArray(record.practice_checklist) ? record.practice_checklist.slice(0, 1) : [];
  const topics = Array.isArray(record.topics) ? record.topics.slice(0, 4) : [];
  const title = record.title_zh || record.title_original || record.id;
  return `<article class="official-blog-card" data-official-blog-card="${escapeAttribute(record.id || "")}" data-official-blog-company="${escapeAttribute(record.company || "")}">
      <div class="official-blog-card-head">
        <span class="chip status-info official-blog-company">${escapeHtml(record.company_label || record.company || "")}</span>
        <span class="chip official-blog-importance importance-${escapeAttribute(record.importance || "notable")}">${escapeHtml(officialBlogImportanceLabel(record.importance))}</span>
      </div>
      <h3><a href="${escapeAttribute(record.canonical_url || "#")}" target="_blank" rel="noopener noreferrer">${escapeHtml(title)}</a></h3>
      <p class="official-blog-original">${escapeHtml(record.title_original || "")}</p>
      <p>${escapeHtml(firstSentence(record.summary_zh) || record.summary_zh || "")}</p>
      <ul class="compact-list official-blog-ideas">
        ${[...ideas, ...checklist].map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
      <div class="official-blog-topic-row official-blog-card-topics">
        ${topics.map((topic) => `<span class="tag">${escapeHtml(topic)}</span>`).join("")}
      </div>
      <div class="item-meta">
        <span>${escapeHtml(record.published_at || "")}</span>
        <span>${escapeHtml(record.content_type || "")}</span>
      </div>
    </article>`;
}

function renderOfficialBlogExcerptCard(record, recordById) {
  const title = record.title_zh || record.title_original || record.id;
  const ideas = Array.isArray(record.key_ideas) ? record.key_ideas : [];
  const practices = Array.isArray(record.practice_checklist) ? record.practice_checklist : [];
  const topics = Array.isArray(record.topics) ? record.topics : [];
  return `<article class="official-blog-card official-blog-excerpt-card" id="blog-${escapeAttribute(record.id || "")}" data-official-blog-excerpt-card="${escapeAttribute(record.id || "")}" data-official-blog-company="${escapeAttribute(record.company || "")}">
      <div class="official-blog-card-head">
        <span class="chip status-info official-blog-company">${escapeHtml(record.company_label || record.company || "")}</span>
        <span class="chip official-blog-importance importance-${escapeAttribute(record.importance || "notable")}">${escapeHtml(officialBlogImportanceLabel(record.importance))}</span>
        <span class="chip">${escapeHtml(record.content_type || "")}</span>
      </div>
      <h2><a href="${escapeAttribute(record.canonical_url || "#")}" target="_blank" rel="noopener noreferrer">${escapeHtml(title)}</a></h2>
      <p class="official-blog-original">${escapeHtml(record.title_original || "")}</p>
      <p>${escapeHtml(record.summary_zh || "")}</p>
      ${renderOfficialBlogTextList("核心想法", ideas, "official-blog-ideas")}
      ${renderOfficialBlogTextList("实践清单", practices, "official-blog-practices")}
      <div class="official-blog-topic-row official-blog-card-topics">
        ${topics.map((topic) => `<span class="tag">${escapeHtml(topic)}</span>`).join("")}
      </div>
      ${renderRelatedBlogLinks(record, recordById)}
      ${renderRelatedReportLinks(record)}
      <div class="item-meta">
        <span>${escapeHtml(record.published_at || "")}</span>
        <a href="${escapeAttribute(record.canonical_url || "#")}" target="_blank" rel="noopener noreferrer">阅读原文</a>
      </div>
    </article>`;
}

function renderOfficialBlogTextList(label, items, className) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  if (list.length === 0) {
    return "";
  }
  return `<div class="${escapeAttribute(className)}">
        <h3>${escapeHtml(label)}</h3>
        <ul class="compact-list">
          ${list.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
        </ul>
      </div>`;
}

function renderRelatedBlogLinks(record, recordById) {
  const relatedIds = Array.isArray(record.related_blog_ids) ? record.related_blog_ids : [];
  const links = relatedIds
    .map((id) => recordById.get(id))
    .filter(Boolean)
    .map((related) => {
      const title = related.title_zh || related.title_original || related.id;
      return `<a class="tag" href="#blog-${escapeAttribute(related.id)}" data-related-blog-link="${escapeAttribute(related.id)}">${escapeHtml(title)}</a>`;
    });
  return `<div class="official-blog-related" data-related-blog-links="${escapeAttribute(record.id || "")}">
      <span class="official-blog-related-label">相关博客</span>
      ${links.length > 0 ? links.join("") : '<span class="muted">暂无关联博客</span>'}
    </div>`;
}

function renderRelatedReportLinks(record) {
  const dates = Array.isArray(record.related_report_dates) ? record.related_report_dates : [];
  const links = dates.map((date) => {
    const paths = reportRelativePaths(date);
    const href = relativeAssetHref("official-blogs/index.html", paths.htmlPath);
    return `<a class="tag" href="${escapeAttribute(href)}" data-related-report-link="${escapeAttribute(date)}">${escapeHtml(date)}</a>`;
  });
  return `<div class="official-blog-related" data-related-report-links="${escapeAttribute(record.id || "")}">
      <span class="official-blog-related-label">相关日报</span>
      ${links.length > 0 ? links.join("") : '<span class="muted">暂无关联日报</span>'}
    </div>`;
}

function officialBlogImportanceRank(value) {
  if (value === "foundational") return 4;
  if (value === "major") return 3;
  if (value === "notable") return 2;
  if (value === "reference") return 1;
  return 0;
}

function officialBlogImportanceLabel(value) {
  if (value === "foundational") return "foundational";
  if (value === "major") return "major";
  if (value === "reference") return "reference";
  return "notable";
}

function renderTrendOverview(trends) {
  const topics = Array.isArray(trends?.topics)
    ? trends.topics.filter((topic) => topic.status === "active" || topic.status === "hot").slice(0, 3)
    : [];
  if (topics.length === 0) {
    return "";
  }

  return `<section class="section" id="trends">
      <h2>近 7 日趋势</h2>
      <ol class="report-list">${topics.map(renderTrendItem).join("\n")}</ol>
      <nav class="artifact-links" aria-label="趋势索引">
        <a href="trends.json">趋势索引 JSON</a>
      </nav>
    </section>`;
}

function renderTrendItem(topic) {
  const entities = Array.isArray(topic.entities) && topic.entities.length > 0
    ? `<div class="item-meta">${topic.entities.slice(0, 4).map((entity) => `<span>${escapeHtml(entity)}</span>`).join("")}</div>`
    : "";
  return `<li class="report-card">
  <h3>${escapeHtml(topic.label)} ${renderTags([topic.status])}</h3>
  <p>近 7 日出现 ${escapeHtml(topic.occurrences)} 次，覆盖 ${escapeHtml(topic.active_days)} 天。</p>
  ${entities}
</li>`;
}

function renderDateResearchIndex(dateIndex, latest) {
  const items = Array.isArray(dateIndex?.items) ? dateIndex.items : [];
  if (items.length === 0) {
    return "";
  }
  const selectedDate = latest?.report_date || items.at(-1)?.date;
  return `<section class="panel date-index-section" id="date-research-index" aria-labelledby="date-research-title" data-section-type="details">
      <div class="section-heading split-row">
        <div>
          <p class="eyebrow">30 天研究索引</p>
          <h2 id="date-research-title">按日期检索 AI 信号</h2>
        </div>
        <a class="chip status-info" href="feed.json">feed.json</a>
      </div>
      <div class="date-overview-grid" aria-label="30 天透明统计">
        ${renderDateOverviewStat("日报", dateIndex.totals?.report_count ?? items.length)}
        ${renderDateOverviewStat("强信号日", dateIndex.totals?.strong_days ?? 0)}
        ${renderDateOverviewStat("degraded", dateIndex.totals?.degraded_days ?? 0, "quality")}
        ${renderDateOverviewStat("主体", dateIndex.totals?.main_items ?? 0)}
        ${renderDateOverviewStat("GitHub", dateIndex.totals?.github_trending ?? 0)}
        ${renderDateOverviewStat("Builder", dateIndex.totals?.builder_observations ?? 0)}
        ${renderDateOverviewStat("博客", dateIndex.totals?.hot_blogs ?? 0)}
        ${renderDateOverviewStat("追踪", dateIndex.totals?.daily_tracking ?? 0)}
      </div>
      ${renderDateFilters(dateIndex)}
      <div class="date-index-layout">
        <div class="date-timeline" aria-label="严格时间顺序日期索引">
          ${items.map((item) => renderDateCard(item, item.date === selectedDate)).join("\n")}
        </div>
        <aside class="selected-date-panel" id="selected-date-panel" aria-live="polite">
          ${items.map((item) => renderDateDetail(item, item.date !== selectedDate)).join("\n")}
        </aside>
      </div>
      <p class="date-index-empty" data-date-index-empty hidden>没有符合筛选条件的日期。</p>
      ${renderDateIndexScript()}
    </section>`;
}

function renderDateOverviewStat(label, value, variant = "") {
  return `<span class="date-overview-stat${variant ? ` date-overview-stat-${escapeAttribute(variant)}` : ""}"><strong>${escapeHtml(value)}</strong>${escapeHtml(label)}</span>`;
}

function renderDateFilters(dateIndex) {
  const months = Array.isArray(dateIndex?.filters?.months) ? dateIndex.filters.months : [];
  const strengthLevels = Array.isArray(dateIndex?.filters?.strength_levels) ? dateIndex.filters.strength_levels : [];
  const qualityStatuses = Array.isArray(dateIndex?.filters?.quality_statuses) ? dateIndex.filters.quality_statuses : [];
  return `<form class="date-index-filters" data-date-index-filters>
        <label for="date-filter-month">月份</label>
        <select id="date-filter-month" data-date-filter="month">
          <option value="">全部</option>
          ${months.map((month) => `<option value="${escapeAttribute(month)}">${escapeHtml(month)}</option>`).join("")}
        </select>
        <label for="date-filter-strength">强度</label>
        <select id="date-filter-strength" data-date-filter="strength">
          <option value="">全部</option>
          ${strengthLevels.map((level) => `<option value="${escapeAttribute(level)}">${escapeHtml(strengthLevelLabel(level))}</option>`).join("")}
        </select>
        <label for="date-filter-quality">质量</label>
        <select id="date-filter-quality" data-date-filter="quality">
          <option value="">全部</option>
          ${qualityStatuses.map((status) => `<option value="${escapeAttribute(status)}">${escapeHtml(qualityStatusLabel(status))}</option>`).join("")}
        </select>
        <label class="date-toggle"><input id="date-filter-github" type="checkbox" data-date-filter="hasGithub"> GitHub</label>
        <label class="date-toggle"><input id="date-filter-builder" type="checkbox" data-date-filter="hasBuilder"> Builder</label>
        <label class="date-toggle"><input id="date-filter-tracking" type="checkbox" data-date-filter="hasTracking"> 追踪</label>
        <label class="date-toggle"><input id="date-filter-degraded" type="checkbox" data-date-filter="hasDegraded"> degraded</label>
      </form>`;
}

function renderDateCard(item, selected = false) {
  const metrics = item.metrics || {};
  const quality = item.quality || {};
  const strength = item.strength || {};
  const mainStream = normalizeMainStream(item.main_stream, metrics);
  const visual = item.visual || {};
  const flags = item.flags || {};
  const signalIntensity = Number.isFinite(Number(visual.intensity || strength.intensity))
    ? Number(visual.intensity || strength.intensity)
    : 1;
  const signalWidth = `${Math.max(20, Math.min(100, signalIntensity * 20))}%`;
  const topTopicChip = item.top_topic?.label
    ? `\n          <span class="topic-chip">${escapeHtml(item.top_topic.label)}</span>`
    : "";
  return `<article class="date-card${selected ? " is-selected" : ""}"
      data-date-card="${escapeAttribute(item.date)}"
      data-month="${escapeAttribute(item.month || "")}"
      data-strength-level="${escapeAttribute(strength.level || "quiet")}"
      data-quality-status="${escapeAttribute(quality.status || "ok")}"
      data-quality-channel="${escapeAttribute(visual.quality_channel || quality.status || "ok")}"
      data-main-stream-status="${escapeAttribute(mainStream.status)}"
      data-main-stream-target="${mainStream.status === "target" ? "true" : "false"}"
      data-has-github="${flags.has_github ? "true" : "false"}"
      data-has-builder="${flags.has_builder ? "true" : "false"}"
      data-has-tracking="${flags.has_tracking ? "true" : "false"}"
      data-has-degraded="${flags.has_degraded ? "true" : "false"}">
      <button type="button" class="date-card-button" data-select-date="${escapeAttribute(item.date)}" aria-pressed="${selected ? "true" : "false"}">
        <span class="date-card-topline">
          <span><strong>${escapeHtml(item.date)}</strong>${item.weekday ? ` <small>${escapeHtml(item.weekday)}</small>` : ""}</span>
          <span class="quality-badge quality-${escapeAttribute(quality.status || "ok")}">${escapeHtml(quality.label || quality.status || "ok")}</span>
        </span>
        <span class="signal-bar signal-${escapeAttribute(strength.level || "quiet")}" style="--signal-width:${escapeAttribute(signalWidth)}"></span>
        <span class="date-card-summary">${escapeHtml(firstSentence(item.summary) || item.title || item.date)}</span>
        <span class="metric-row">
          ${renderMetricPill("主体", metrics.main_items_count)}
          ${renderMetricPill("重大", metrics.major_count)}
          ${renderMetricPill("GitHub", metrics.github_trending_count)}
          ${renderMetricPill("Builder", metrics.builder_observations_count)}
          ${renderMetricPill("博客", metrics.hot_blogs_count)}
          ${renderMetricPill("追踪", metrics.daily_tracking_count)}
          ${renderMetricPill("覆盖", metrics.section_coverage_count)}
        </span>
        <span class="date-card-footer">
          <span class="date-card-labels">
            <span class="strength-label">${escapeHtml(strength.label || strength.level || "quiet")}</span>
            ${renderMainStreamChip(mainStream)}
          </span>${topTopicChip}
        </span>
      </button>
    </article>`;
}

function renderDateDetail(item, hidden = false) {
  const metrics = item.metrics || {};
  const strength = item.strength || {};
  const quality = item.quality || {};
  const mainStream = normalizeMainStream(item.main_stream, metrics);
  return `<article class="date-detail" data-date-detail="${escapeAttribute(item.date)}"${hidden ? " hidden" : ""}>
      <header class="date-detail-header">
        <div>
          <p class="eyebrow">${escapeHtml(item.weekday || "")}</p>
          <h3>${escapeHtml(item.date)}</h3>
        </div>
        <span class="date-detail-badges">
          ${renderMainStreamChip(mainStream)}
          <span class="quality-badge quality-${escapeAttribute(quality.status || "ok")}">${escapeHtml(quality.label || quality.status || "ok")}</span>
        </span>
      </header>
      <p><strong>主线：</strong>${escapeHtml(firstSentence(item.summary) || item.title || "暂无摘要")}</p>
      <div class="date-detail-metrics" aria-label="透明统计">
        ${renderMetricPill("主体", metrics.main_items_count)}
        ${renderMetricPill("重大", metrics.major_count)}
        ${renderMetricPill("GitHub", metrics.github_trending_count)}
        ${renderMetricPill("Builder", metrics.builder_observations_count)}
        ${renderMetricPill("博客", metrics.hot_blogs_count)}
        ${renderMetricPill("追踪", metrics.daily_tracking_count)}
        ${renderMetricPill("覆盖", metrics.section_coverage_count)}
      </div>
      <div class="date-detail-block">
        <h4>强度原因</h4>
        ${renderStrengthReasons(strength)}
      </div>
      <div class="date-detail-block">
        <h4>降级影响</h4>
        ${renderQualityDetail(quality)}
      </div>
      ${renderDateHighlights(item.highlights)}
      <nav class="artifact-links" aria-label="日期入口">
        ${item.url ? `<a href="${escapeAttribute(item.url)}">打开日报</a>` : ""}
        ${item.data_url ? `<a href="${escapeAttribute(item.data_url)}">JSON</a>` : ""}
      </nav>
    </article>`;
}

function renderMetricPill(label, value) {
  return `<span class="metric-pill"><b>${escapeHtml(Number(value || 0))}</b>${escapeHtml(label)}</span>`;
}

function renderMainStreamChip(mainStream) {
  return `<span class="chip main-stream-chip ${escapeAttribute(statusClassForMainStream(mainStream.status))}" data-main-stream-chip="${escapeAttribute(mainStream.status)}">${escapeHtml(mainStream.label)}</span>`;
}

function normalizeMainStream(mainStream = {}, metrics = {}) {
  const count = Number(mainStream.count ?? metrics.main_items_count ?? 0);
  const status = String(mainStream.status || mainStreamStatusFromCount(count));
  return {
    status,
    label: mainStream.label || mainStreamLabel(status),
    count
  };
}

function mainStreamStatusFromCount(count) {
  if (count >= 5 && count <= 30) return "target";
  if (count > 30) return "oversized";
  if (count > 0) return "sparse";
  return "empty";
}

function mainStreamLabel(status) {
  if (status === "target") return "主体达标";
  if (status === "oversized") return "主体过量";
  if (status === "empty") return "主体为空";
  return "主体偏少";
}

function renderStrengthReasons(strength = {}) {
  const reasons = Array.isArray(strength.reasons) ? strength.reasons : [];
  if (reasons.length === 0) {
    return `<p class="muted">透明统计未触发额外强信号。</p>`;
  }
  return `<ul class="compact-list">${reasons.slice(0, 6).map((reason) => `<li>${escapeHtml(reason.label || reason.id)}：${escapeHtml(reason.value ?? "")}</li>`).join("")}</ul>`;
}

function renderQualityDetail(quality = {}) {
  if ((quality.status || "ok") === "ok") {
    return `<p class="muted">覆盖质量正常；强度等级未受到质量状态影响。</p>`;
  }
  const sections = Array.isArray(quality.affected_sections) && quality.affected_sections.length > 0
    ? `影响板块：${quality.affected_sections.map((section) => escapeHtml(section)).join("、")}。`
    : "";
  const note = escapeHtml(quality.public_note || "该日期存在覆盖或数据质量降级，需要阅读详情页核对。");
  return `<p>${sections ? `${note} ${sections}` : note}</p>`;
}

function renderDateHighlights(highlights) {
  const items = Array.isArray(highlights) ? highlights.filter((item) => item?.title && item?.url).slice(0, 3) : [];
  if (items.length === 0) {
    return "";
  }
  return `<div class="date-detail-block">
        <h4>Top highlights</h4>
        <ul class="compact-list">${items.map((item) => `<li><a href="${escapeAttribute(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a>${item.reason ? `：${escapeHtml(firstSentence(item.reason))}` : ""}</li>`).join("")}</ul>
      </div>`;
}

function renderDateIndexScript() {
  return `<script data-date-index-script>
(() => {
  const root = document.getElementById("date-research-index");
  if (!root) return;
  const cards = Array.from(root.querySelectorAll("[data-date-card]"));
  const details = Array.from(root.querySelectorAll("[data-date-detail]"));
  const empty = root.querySelector("[data-date-index-empty]");
  const month = root.querySelector("[data-date-filter='month']");
  const strength = root.querySelector("[data-date-filter='strength']");
  const quality = root.querySelector("[data-date-filter='quality']");
  const toggles = Array.from(root.querySelectorAll("input[data-date-filter]"));
  const activeDate = () => details.find((detail) => !detail.hidden)?.dataset.dateDetail;
  const selectDate = (date) => {
    cards.forEach((card) => {
      const selected = card.dataset.dateCard === date;
      card.classList.toggle("is-selected", selected);
      const button = card.querySelector("[data-select-date]");
      if (button) button.setAttribute("aria-pressed", selected ? "true" : "false");
    });
    details.forEach((detail) => {
      detail.hidden = detail.dataset.dateDetail !== date;
    });
  };
  const matchesFilters = (card) => {
    if (month?.value && card.dataset.month !== month.value) return false;
    if (strength?.value && card.dataset.strengthLevel !== strength.value) return false;
    if (quality?.value && card.dataset.qualityStatus !== quality.value) return false;
    for (const toggle of toggles) {
      if (toggle.checked && card.dataset[toggle.dataset.dateFilter] !== "true") return false;
    }
    return true;
  };
  const applyFilters = () => {
    const visible = cards.filter((card) => {
      const ok = matchesFilters(card);
      card.hidden = !ok;
      return ok;
    });
    if (empty) empty.hidden = visible.length > 0;
    const current = activeDate();
    if (!current || !visible.some((card) => card.dataset.dateCard === current)) {
      const fallback = visible.at(-1)?.dataset.dateCard;
      if (fallback) selectDate(fallback);
    }
  };
  root.addEventListener("click", (event) => {
    const button = event.target.closest("[data-select-date]");
    if (!button || !root.contains(button)) return;
    selectDate(button.dataset.selectDate);
  });
  [month, strength, quality, ...toggles].filter(Boolean).forEach((control) => {
    control.addEventListener("change", applyFilters);
  });
  applyFilters();
})();
</script>`;
}

function strengthLevelLabel(level) {
  return level === "strong" ? "强信号" : level === "medium" ? "中等信号" : "低噪/观察";
}

function qualityStatusLabel(status) {
  return status === "blocked" ? "阻断" : status === "degraded" ? "降级" : "正常";
}

function statusClassForQuality(status) {
  if (status === "blocked") return "status-danger";
  if (status === "degraded") return "status-warn";
  return "status-ok";
}

function statusClassForMainStream(status) {
  if (status === "target") return "status-ok";
  if (status === "empty") return "status-danger";
  return "status-warn";
}

function firstSentence(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  const match = text.match(/^(.{1,120}?[。！？.!?])\s*/u);
  return match ? match[1] : text.slice(0, 120);
}

function renderDateNavigation(reports) {
  if (!Array.isArray(reports) || reports.length === 0) {
    return "";
  }
  const groups = new Map();
  for (const item of reports) {
    const [year, month] = item.report_date.split("-");
    const monthKey = `${year}-${month}`;
    const weekKey = `${year}-W${String(isoWeek(item.report_date)).padStart(2, "0")}`;
    const monthGroup = groups.get(monthKey) || new Map();
    const weekItems = monthGroup.get(weekKey) || [];
    weekItems.push(item);
    monthGroup.set(weekKey, weekItems);
    groups.set(monthKey, monthGroup);
  }

  const monthSections = [...groups.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([monthKey, weeks]) => {
      const weekHtml = [...weeks.entries()]
        .sort(([left], [right]) => right.localeCompare(left))
        .map(([weekKey, weekReports]) => `<div class="report-card">
          <h3>${escapeHtml(weekKey)}</h3>
          <div class="item-meta">${weekReports
            .sort((a, b) => b.report_date.localeCompare(a.report_date))
            .map((report) => `<a class="tag" href="${escapeAttribute(report.url)}">${escapeHtml(report.report_date)}</a>`)
            .join("")}</div>
        </div>`)
        .join("\n");
      return `<article class="item">
        <h3>${escapeHtml(monthKey)}</h3>
        ${weekHtml}
      </article>`;
    })
    .join("\n");

  return `<section class="section" id="calendar">
      <h2>按年月周导航</h2>
      ${monthSections}
    </section>`;
}

function isoWeek(dateString) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
}

export const defaultStyleCss = `@import url("./${adcPublicThemeAssetName}?v=${adcPublicThemeVersion}");

:root {
  color-scheme: light;
  --bg: #faf9f5;
  --panel: #ffffff;
  --panel-soft: #f0eee6;
  --text: #3d3d3a;
  --ink: #3d3d3a;
  --muted: #78766f;
  --line: #d1cfc5;
  --line-strong: #9c9a93;
  --accent: #d97757;
  --accent-2: #3d6e6e;
  --ok: #788c5d;
  --warn: #a67c52;
  --danger: #b04a3f;
  --info: #3d6e6e;
  --accent-soft: #fbf1ec;
  --shadow: 0 14px 40px rgba(61, 61, 58, 0.12);
  --focus: 0 0 0 3px rgba(217, 119, 87, 0.24);
}

* {
  box-sizing: border-box;
  min-width: 0;
}

html {
  scroll-behavior: smooth;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 14px;
  line-height: 1.5;
}

a {
  color: var(--accent);
  text-decoration-thickness: 0.08em;
  text-underline-offset: 0.18em;
}

.site-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 24px;
  border-bottom: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(10px);
}

.site-title {
  color: var(--text);
  font-weight: 700;
  text-decoration: none;
}

.site-date {
  color: var(--muted);
  font-size: 0.95rem;
}

.page {
  width: min(1040px, calc(100% - 32px));
  margin: 0 auto;
  padding: 32px 0 56px;
}

.report-shell {
  width: min(1280px, calc(100vw - 28px));
  margin: 0 auto;
  padding: 22px 0 44px;
}

.report-shell [id] {
  scroll-margin-top: 86px;
}

.report-section-stack {
  display: grid;
  gap: 14px;
}

.report-hero {
  display: grid;
  gap: 14px;
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
  box-shadow: 0 1px 0 rgba(61, 61, 58, 0.04);
}

.eyebrow {
  margin: 0 0 8px;
  color: var(--accent);
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
}

h1,
h2,
h3,
p {
  overflow-wrap: anywhere;
}

h1 {
  margin: 0;
  font-size: 2rem;
  line-height: 1.25;
}

h2 {
  margin: 0 0 16px;
  font-size: 1.35rem;
}

h3 {
  margin: 0 0 10px;
  font-size: 1.05rem;
}

.summary {
  max-width: 760px;
  color: var(--muted);
}

.panel {
  min-width: 0;
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
  box-shadow: 0 1px 0 rgba(61, 61, 58, 0.04);
  transition: border-color 160ms ease, box-shadow 160ms ease, background-color 160ms ease;
}

.panel:target,
.section-focus {
  border-color: color-mix(in srgb, var(--accent) 56%, var(--line));
  background: linear-gradient(180deg, #ffffff, var(--accent-soft));
  box-shadow: 0 0 0 3px rgba(217, 119, 87, 0.14), var(--shadow);
}

.title-row,
.toolbar,
.split-row,
.section-heading-row {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
}

.report-title {
  margin: 2px 0 0;
  flex: 1 1 560px;
  max-width: 920px;
  font-size: 2.45rem;
  line-height: 1.08;
}

.hero-brief {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(280px, 0.9fr);
  gap: 12px;
  align-items: stretch;
}

.hero-summary-text {
  display: flex;
  min-height: 104px;
  align-items: center;
  margin: 0;
  padding: 14px 16px;
  border: 1px solid color-mix(in srgb, var(--accent) 24%, var(--line));
  border-radius: 8px;
  background: linear-gradient(180deg, #ffffff, var(--accent-soft));
  color: #8a3b1e;
  font-size: 1.04rem;
  font-weight: 760;
  line-height: 1.45;
}

.hero-stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(92px, 1fr));
  gap: 8px;
  align-self: stretch;
}

.hero-stat {
  display: grid;
  gap: 4px;
  align-content: space-between;
  min-height: 72px;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel-soft);
}

.hero-stat small,
.hero-stat span {
  color: var(--muted);
  font-size: 0.72rem;
  font-weight: 760;
}

.hero-stat strong {
  color: var(--ink);
  font-size: 1.16rem;
  line-height: 1.15;
  overflow-wrap: anywhere;
}

.hero-stat-quality {
  border-style: dashed;
  border-color: color-mix(in srgb, var(--warn) 42%, var(--line));
  background: #fbf1ec;
}

.chip,
.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  min-height: 26px;
  padding: 3px 8px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--panel-soft);
  color: var(--ink);
  font-size: 0.82rem;
  font-weight: 700;
  line-height: 1.25;
  text-decoration: none;
  white-space: normal;
}

.status-ok {
  border-color: color-mix(in srgb, var(--ok) 42%, var(--line));
  background: #e4e9dc;
  color: #4d6238;
}

.status-warn {
  border-color: color-mix(in srgb, var(--warn) 42%, var(--line));
  background: var(--accent-soft);
  color: #8a3b1e;
}

.status-danger {
  border-color: color-mix(in srgb, var(--danger) 42%, var(--line));
  background: #f3d9cc;
  color: #8d3028;
}

.status-info {
  border-color: color-mix(in srgb, var(--info) 38%, var(--line));
  background: #e8efeb;
  color: var(--info);
}

.report-nav {
  position: sticky;
  top: 8px;
  z-index: 4;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  max-width: 100%;
  margin-top: 12px;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(10px);
}

.report-nav-title {
  flex: 0 0 auto;
  margin: 0;
  color: var(--ink);
  font-size: 0.86rem;
  font-weight: 760;
}

.report-nav-group {
  display: flex;
  flex: 1 1 320px;
  flex-wrap: wrap;
  gap: 0;
  overflow: visible;
  padding: 2px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel-soft);
}

.report-nav-group-title {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.report-nav a {
  display: inline-flex;
  flex: 1 1 auto;
  align-items: center;
  justify-content: center;
  padding: 6px 8px;
  border: 1px solid transparent;
  color: var(--ink);
  font-size: 0.86rem;
  font-weight: 650;
  line-height: 1.25;
  text-decoration: none;
}

.report-nav a + a {
  border-left-color: var(--line);
}

.report-nav a:hover,
.report-nav a[aria-current="true"] {
  background: var(--accent-soft);
  color: var(--accent);
}

.meta-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.meta-grid span,
.tag {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  padding: 4px 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
  color: var(--muted);
}

.inline-site-icon {
  width: 1em;
  height: 1em;
  margin-right: 0.35em;
  border-radius: 3px;
  vertical-align: -0.15em;
}

.section {
  padding: 28px 0;
  border-bottom: 1px solid var(--line);
}

.index-page {
  width: min(1280px, calc(100vw - 28px));
}

.index-console {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(360px, 0.95fr);
  gap: 22px;
  align-items: stretch;
  padding: 28px 0 24px;
  border-bottom: 1px solid var(--line);
}

.index-console-copy {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 230px;
}

.index-console h1 {
  max-width: 720px;
  font-size: clamp(2rem, 4vw, 3.25rem);
  line-height: 1.08;
}

.index-console-actions {
  padding-top: 12px;
}

.index-console-stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  align-content: stretch;
}

.index-console-stat {
  display: flex;
  min-height: 88px;
  flex-direction: column;
  justify-content: space-between;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #ffffff;
  color: var(--muted);
  font-weight: 700;
}

.index-console-stat b {
  color: var(--text);
  font-size: 1.25rem;
  line-height: 1.2;
}

.index-console-stat-quality {
  border-style: dashed;
  border-color: #c36b1f;
  background: #fff8ed;
}

.index-dashboard-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 0.82fr);
  gap: 12px;
  margin-top: 12px;
}

.index-panel {
  min-width: 0;
  padding: 18px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #ffffff;
}

.latest-briefing p {
  margin-top: 0;
}

.latest-highlights {
  margin-top: 12px;
}

.signal-heat-section,
.source-lane-board,
.date-index-section {
  margin-top: 12px;
}

.signal-heat-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(52px, 1fr));
  gap: 6px;
  align-items: end;
}

.signal-day {
  display: grid;
  grid-template-rows: 72px auto auto;
  gap: 5px;
  align-items: end;
  min-width: 0;
  padding: 7px 5px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #ffffff;
  color: var(--text);
  text-align: center;
  text-decoration: none;
}

.signal-day.quality-degraded {
  border-style: dashed;
  border-color: color-mix(in srgb, var(--warn) 56%, var(--line));
  background: var(--accent-soft);
}

.signal-day.quality-blocked {
  border-style: double;
  border-color: var(--danger);
  background: #fff5f2;
}

.signal-day-bar {
  display: block;
  width: 100%;
  height: var(--signal-day-height, 18px);
  border-radius: 6px 6px 2px 2px;
  background:
    repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.28) 0 5px, transparent 5px 10px),
    #8fa39d;
}

.signal-day.signal-strong .signal-day-bar {
  background:
    repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.28) 0 5px, transparent 5px 10px),
    var(--accent);
}

.signal-day.signal-medium .signal-day-bar {
  background:
    repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.28) 0 5px, transparent 5px 10px),
    var(--warn);
}

.signal-day-date,
.signal-day-quality {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.76rem;
  font-weight: 700;
}

.signal-day-quality {
  justify-content: center;
  min-height: 22px;
  padding: 2px 5px;
  font-size: 0.72rem;
}

.table-scroll {
  max-width: 100%;
  overflow-x: auto;
  overflow-y: visible;
  padding: 2px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
}

.report-data-table {
  width: 100%;
  min-width: 720px;
  margin: 0;
  border-collapse: separate;
  border-spacing: 0;
  table-layout: fixed;
  font-size: 0.9rem;
  line-height: 1.38;
}

.report-data-table th,
.report-data-table td {
  border: 0;
  border-right: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  padding: 10px 12px;
  background: #ffffff;
  color: var(--ink);
  text-align: left;
  vertical-align: top;
  overflow-wrap: anywhere;
}

.report-data-table thead th {
  background: var(--panel-soft);
  color: #8a3b1e;
  font-weight: 760;
}

.report-data-table th:last-child,
.report-data-table td:last-child {
  border-right: 0;
}

.report-data-table tbody tr:last-child th,
.report-data-table tbody tr:last-child td {
  border-bottom: 0;
}

.source-lane-table th:nth-child(1) {
  width: 18%;
}

.source-lane-table th:nth-child(2),
.source-lane-table th:nth-child(3),
.source-lane-table th:nth-child(4) {
  width: 13%;
}

.source-lane-label,
.source-lane-card span {
  color: var(--ink);
  font-weight: 760;
}

.source-lane-table strong {
  color: var(--ink);
  font-size: 1.08rem;
}

.source-lane-meter {
  display: inline-flex;
  width: min(120px, 100%);
  height: 12px;
  overflow: hidden;
  margin-right: 8px;
  border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--line));
  border-radius: 999px;
  background: var(--accent-soft);
  vertical-align: -0.1em;
}

.source-lane-meter span {
  display: block;
  width: var(--source-lane-ratio, 0%);
  border-radius: inherit;
  background:
    repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.34) 0 5px, transparent 5px 10px),
    var(--accent);
}

.topic-radar-list {
  display: grid;
  gap: 10px;
}

.topic-radar-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fbfaf5;
}

.topic-radar-item h3 {
  margin-bottom: 3px;
}

.topic-entities {
  color: var(--muted);
  font-size: 0.86rem;
}

.topic-radar-metrics {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}

.topic-radar-metrics span {
  display: inline-flex;
  align-items: baseline;
  gap: 3px;
  min-height: 28px;
  padding: 3px 7px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: #ffffff;
  color: var(--muted);
  font-size: 0.82rem;
  font-weight: 700;
}

.topic-status-hot {
  border-color: #c36b1f;
  color: #7a3f00;
}

.official-blog-knowledge {
  margin-top: 12px;
}

.official-blog-summary {
  max-width: 880px;
  color: var(--muted);
}

.official-blog-stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(126px, 1fr));
  gap: 10px;
  margin: 14px 0;
}

.official-blog-stat {
  min-height: 64px;
  padding: 11px 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #ffffff;
  color: var(--muted);
  font-weight: 700;
}

.official-blog-stat strong {
  display: block;
  color: var(--text);
  font-size: 1.25rem;
  line-height: 1.15;
}

.official-blog-topic-row {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin: 10px 0;
}

.official-blog-actions {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 7px;
  justify-content: flex-end;
}

.official-blog-page {
  gap: 16px;
}

.official-blog-page-actions {
  margin-top: 16px;
}

.official-blog-topic-panel {
  margin-top: 12px;
}

.official-blog-excerpt-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 14px;
}

.official-blog-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 12px;
  margin-top: 14px;
}

.official-blog-card {
  display: grid;
  align-content: start;
  gap: 9px;
  min-width: 0;
  padding: 15px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #ffffff;
}

.official-blog-card h3 {
  margin: 0;
  font-size: 1.02rem;
  line-height: 1.32;
}

.official-blog-excerpt-card h2 {
  margin: 0;
  font-size: 1.12rem;
  line-height: 1.35;
}

.official-blog-excerpt-card h2 a {
  color: var(--text);
}

.official-blog-card h3 a {
  color: var(--text);
}

.official-blog-card p {
  margin: 0;
}

.official-blog-card-head {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.official-blog-original,
.official-blog-card .item-meta {
  color: var(--muted);
  font-size: 0.88rem;
}

.official-blog-ideas {
  margin: 0;
}

.official-blog-ideas h3,
.official-blog-practices h3 {
  margin: 0 0 5px;
  color: var(--muted);
  font-size: 0.86rem;
  line-height: 1.2;
}

.official-blog-practices {
  margin: 0;
}

.official-blog-card-topics {
  margin: 0;
}

.official-blog-related {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;
  margin: 0;
}

.official-blog-related-label {
  color: var(--muted);
  font-size: 0.84rem;
  font-weight: 800;
}

.item,
.report-card {
  margin: 0 0 16px;
  padding: 18px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
}

.section-heading-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.date-overview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
  gap: 10px;
  margin-bottom: 16px;
}

.date-overview-stat {
  min-height: 68px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #ffffff;
  color: var(--muted);
}

.date-overview-stat strong {
  display: block;
  color: var(--text);
  font-size: 1.35rem;
  line-height: 1.15;
}

.date-overview-stat-quality {
  border-style: dashed;
  border-color: color-mix(in srgb, var(--warn) 52%, var(--line));
  background: var(--accent-soft);
}

.date-index-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin: 0 0 18px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel-soft);
}

.date-index-filters label {
  color: var(--muted);
  font-size: 0.9rem;
  font-weight: 700;
}

.date-index-filters select {
  min-height: 34px;
  max-width: 100%;
  padding: 4px 28px 4px 8px;
  border: 1px solid var(--line-strong);
  border-radius: 6px;
  background: #ffffff;
  color: var(--text);
}

.date-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  padding: 4px 8px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: #ffffff;
}

.date-index-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(300px, 0.8fr);
  gap: 18px;
  align-items: start;
}

.date-timeline {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(216px, 1fr));
  gap: 12px;
}

.date-card {
  min-width: 0;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #ffffff;
}

.date-card[data-quality-status="degraded"],
.date-card[data-quality-status="blocked"] {
  border-style: dashed;
  border-color: color-mix(in srgb, var(--warn) 52%, var(--line));
}

.date-card.is-selected {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.date-card-button {
  display: grid;
  width: 100%;
  min-height: 222px;
  gap: 10px;
  padding: 14px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.date-card-button:hover,
.date-card-button:focus-visible {
  background: var(--accent-soft);
}

.date-card-topline,
.date-card-footer {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
}

.date-card-labels,
.date-detail-badges {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.date-card-labels {
  min-width: 0;
}

.date-card-topline small {
  color: var(--muted);
}

.signal-bar {
  display: block;
  width: var(--signal-width, 20%);
  height: 8px;
  border-radius: 6px;
  background:
    repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.28) 0 5px, transparent 5px 10px),
    #8fa39d;
}

.signal-strong {
  background:
    repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.28) 0 5px, transparent 5px 10px),
    var(--accent);
}

.signal-medium {
  background:
    repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.28) 0 5px, transparent 5px 10px),
    var(--warn);
}

.signal-quiet {
  background:
    repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.28) 0 5px, transparent 5px 10px),
    #8fa39d;
}

.quality-badge {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 3px 8px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--panel-soft);
  color: var(--muted);
  font-size: 0.86rem;
  font-weight: 700;
}

.quality-degraded {
  border-style: dashed;
  border-color: color-mix(in srgb, var(--warn) 52%, var(--line));
  background: var(--accent-soft);
  color: #8a3b1e;
}

.quality-blocked {
  border-style: double;
  border-color: var(--danger);
  background: #f3d9cc;
  color: #8d3028;
}

.date-card-summary {
  min-height: 58px;
  color: var(--muted);
  font-size: 0.94rem;
}

.metric-row,
.date-detail-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.metric-pill {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  min-height: 28px;
  padding: 3px 7px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: #fbfaf5;
  color: var(--muted);
  font-size: 0.82rem;
}

.metric-pill b {
  color: var(--text);
}

.strength-label,
.topic-chip {
  color: var(--muted);
  font-size: 0.88rem;
  font-weight: 700;
}

.topic-chip {
  max-width: 48%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.main-stream-chip {
  min-height: 24px;
  padding: 2px 7px;
  white-space: nowrap;
}

.selected-date-panel {
  position: sticky;
  top: 16px;
}

.date-detail {
  padding: 18px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #ffffff;
}

.date-detail-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 12px;
}

.date-detail h3,
.date-detail h4 {
  margin: 0 0 8px;
}

.date-detail-block {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
}

.date-index-empty {
  margin: 14px 0 0;
  color: var(--muted);
}

.builder-card-list {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

.builder-card {
  display: grid;
  grid-template-columns: minmax(180px, 240px) minmax(0, 1fr);
  grid-template-areas:
    "builder-header builder-body"
    "builder-meta builder-body"
    ". builder-original";
  gap: 10px 18px;
  align-items: start;
  margin: 0;
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
}

.builder-card-header {
  grid-area: builder-header;
  display: flex;
  gap: 10px;
  align-items: center;
}

.builder-avatar {
  width: 44px;
  height: 44px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: #f8fafc;
  object-fit: cover;
}

.builder-card-title {
  display: grid;
  gap: 2px;
}

.builder-card-title strong {
  line-height: 1.25;
}

.builder-card-title span {
  color: var(--muted);
  font-size: 0.88rem;
}

.builder-original {
  grid-area: builder-original;
  margin: 0;
  padding-top: 10px;
  border-top: 1px solid var(--line);
  color: var(--muted);
  white-space: pre-wrap;
}

.builder-card > .item-meta {
  grid-area: builder-meta;
  align-content: start;
}

.builder-card > p:not(.builder-original) {
  grid-area: builder-body;
  min-width: 0;
}

.item-meta,
.source-line {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  color: var(--muted);
  font-size: 0.95rem;
}

.source-line {
  margin-top: 12px;
}

.item mark {
  padding: 0 0.25em;
  border-radius: 4px;
  background: #fff3a3;
  color: #2f2b12;
}

.project-table {
  width: 100%;
  border-collapse: collapse;
  background: var(--panel);
}

.project-table th,
.project-table td {
  padding: 12px;
  border: 1px solid var(--line);
  text-align: left;
  vertical-align: top;
}

.inline-evidence {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
}

.inline-evidence figure {
  margin: 10px 0 0;
  text-align: center;
}

.evidence-image {
  display: block;
  width: auto;
  max-width: min(100%, 760px);
  max-height: 420px;
  height: auto;
  margin: 0 auto 6px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
  object-fit: contain;
}

.inline-evidence figcaption,
.inline-evidence-caption {
  max-width: min(100%, 760px);
  margin: 0 auto 16px;
  color: var(--muted);
  font-size: 0.82rem;
  font-weight: 650;
  line-height: 1.45;
  text-align: center;
}

.compact-list,
.report-list {
  padding-left: 1.25rem;
}

.check-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 10px;
}

.audit-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
}

.audit-card {
  padding: 18px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
}

.check-list div {
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
}

.check-list dt {
  color: var(--muted);
  font-size: 0.9rem;
}

.check-list dd {
  margin: 4px 0 0;
  font-weight: 700;
}

.muted {
  color: var(--muted);
}

.suggestions {
  margin-top: 20px;
}

.suggestions li {
  margin-bottom: 16px;
}

.artifact-links {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 14px;
}

.artifact-links a {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  padding: 6px 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
  color: var(--ink);
  font-weight: 650;
  text-decoration: none;
}

.artifact-links a:hover {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
}

button:focus-visible,
a:focus-visible,
summary:focus-visible,
select:focus-visible {
  outline: none;
  box-shadow: var(--focus);
}
`;

function renderMainItem(report, item, evidenceByUrl) {
  return `<article class="item">
  <h3>${externalLink(item.url, stripSourcePrefixForRender(item.title, item.source))}</h3>
  <div class="item-meta"><span>${escapeHtml(item.event_date)}</span><span>${escapeHtml(item.tier)}</span>${renderImportanceSpan(item)}${item.entities.map((entity) => `<span>${escapeHtml(entity)}</span>`).join("")}</div>
  <ul>
    ${item.bullets.map((bullet) => `<li>${renderInlineEmphasis(bullet)}</li>`).join("\n")}
  </ul>
  ${renderInlineEvidenceAssets(report, evidenceForUrl(evidenceByUrl, item.url))}
</article>`;
}

function renderInlineEmphasis(value) {
  return escapeHtml(value)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/==([^=]+)==/g, '<strong class="text-keyword">$1</strong>');
}

function stripSourcePrefixForRender(title, source) {
  const text = String(title || "").trim();
  const sourceText = String(source || "").trim();
  if (!sourceText) {
    return text;
  }
  const escapedSource = sourceText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text
    .replace(new RegExp(`^${escapedSource}\\s*[：:｜|\\-—–]?\\s*`, "i"), "")
    .trim() || text;
}

function renderHotBlogsSection(items) {
  if (items.length === 0) {
    return "";
  }

  return `<section class="section" id="hot-blogs">
      <h2>热门博客</h2>
      ${items.map(renderHotBlog).join("\n")}
    </section>`;
}

function renderHotBlog(item) {
  return `<article class="item">
  <h3>${externalLink(item.url, item.title)}</h3>
  <div class="item-meta">
    <span>${escapeHtml(item.event_date)}</span>
    <span>${escapeHtml(item.publisher)}</span>
    <span>${escapeHtml(item.author)}</span>
    <span>${escapeHtml(item.topic)}</span>
    ${renderImportanceSpan(item)}
  </div>
  <p>${escapeHtml(item.summary)}</p>
</article>`;
}

function renderGithubTrendingSection(items, projects = []) {
  if (items.length === 0) {
    return "";
  }

  return `<section class="section" id="github-trending">
      <h2>GitHub Trending</h2>
      ${renderGithubTrending(items, projects)}
    </section>`;
}

function renderGithubTrending(items, projects = []) {
  const projectIndex = indexProjectsForRender(projects);
  const rows = items
    .slice(0, 10)
    .map((item) => {
      const project = projectForTrendRender(item, projectIndex);
      const tags = [
        importanceLabel(item.importance),
        githubTrendStatusTag(item),
        githubStarsTag(item),
        githubReadmeStatusTag(item),
        githubLanguageTag(item),
        ...githubTopicTags(item),
        ...githubProjectHeatTags(item, project)
      ].filter(Boolean);
      return `<tr><td>#${escapeHtml(item.rank)}</td><td>${externalLink(item.url, item.name || item.repo)}</td><td>${renderTags(tags)}</td><td>${renderGithubTrendDetails(item, project)}</td></tr>`;
    })
    .join("\n");
  return `<table class="project-table">
  <thead><tr><th>榜位</th><th>项目</th><th>变化</th><th>简介</th></tr></thead>
  <tbody>
    ${rows}
  </tbody>
</table>`;
}

function renderGithubTrendDetails(item, project = null) {
  const description = cleanGithubTrendDescription(item);
  const projectDetail = project ? renderProjectHighlightText(project, description) : "";
  return `<p>${escapeHtml([description, projectDetail].filter(Boolean).join(" "))}</p>`;
}

function githubStarsTag(item) {
  const weekly = structuredGithubStarCount(item?.stars_this_week ?? item?.weekly_stars ?? item?.star_growth ?? item?.weekly_star_delta);
  if (weekly !== null) {
    return `本周 +${formatCompactNumber(weekly)} stars`;
  }
  const daily = structuredGithubStarCount(item?.stars_today ?? item?.daily_stars ?? item?.daily_star_delta);
  if (daily !== null) {
    return `今日 +${formatCompactNumber(daily)} stars`;
  }
  const total = structuredGithubStarCount(item?.stargazers_total ?? item?.stars);
  if (total !== null) {
    return `${formatCompactNumber(total)} stars`;
  }
  const evidence = String(item.evidence || "");
  const match = evidence.match(/with\s+([0-9,]+)\s+stars today/i) || evidence.match(/显示\s*([0-9,]+)\s+stars today/i);
  return match ? `今日 +${match[1]} stars` : "";
}

function githubReadmeStatusTag(item) {
  if (isGithubReadmeFetchFailed(item)) {
    return "README failed";
  }
  const status = String(item?.readme_fetch_status || item?.readme_status || item?.readme?.status || "").trim();
  return status || item?.readme_summary || item?.github_readme_summary ? "README OK" : "";
}

function isGithubReadmeFetchFailed(item = {}) {
  const status = String(item.readme_fetch_status || item.readme_status || item.readme?.status || "").toLowerCase();
  return /fail|failed|error|unavailable|blocked|timeout/.test(status) || Boolean(item.readme_error);
}

function githubLanguageTag(item) {
  const language = String(item?.language || "").trim();
  return language && language.toLowerCase() !== "all" ? language : "";
}

function githubTopicTags(item) {
  if (!Array.isArray(item?.topics)) return [];
  const tags = [];
  const seen = new Set();
  for (const topic of item.topics) {
    const label = publicGithubTopicLabel(topic);
    const key = label.toLowerCase();
    if (!label || seen.has(key)) continue;
    seen.add(key);
    tags.push(label);
    if (tags.length >= 3) break;
  }
  return tags;
}

function publicGithubTopicLabel(topic) {
  const text = String(topic || "").trim();
  const lower = text.toLowerCase();
  if (!lower) return "";
  if (/^(ai|llm|rag|aigc)$/.test(lower)) return lower.toUpperCase();
  if (/mcp/.test(lower)) return "MCP";
  if (/agent/.test(lower)) return "agent";
  if (/security|cyber|hacking|pentest|bug-bounty|ctf/.test(lower)) return "安全测试";
  if (/browser|playwright/.test(lower)) return "浏览器自动化";
  if (/code-quality|developer|devtools|coding|cli/.test(lower)) return "开发工具";
  if (/sandbox|container/.test(lower)) return "沙箱";
  if (/typescript/.test(lower)) return "TypeScript";
  if (/javascript/.test(lower)) return "JavaScript";
  if (/python/.test(lower)) return "Python";
  if (/rust/.test(lower)) return "Rust";
  if (/^go$|golang/.test(lower)) return "Go";
  if (/java/.test(lower)) return "Java";
  return text.length <= 12 && !text.includes("-") ? text : "";
}

function githubProjectHeatTags(item, project) {
  const tags = project ? projectHeatTags(project) : [];
  return githubStarsTag(item) ? tags.filter((tag) => !/stars/i.test(tag)) : tags;
}

function structuredGithubStarCount(value) {
  const text = String(value ?? "").trim();
  if (!text) {
    return null;
  }
  const number = Number(text.replaceAll(",", ""));
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : null;
}

function formatCompactNumber(value) {
  return Number(value).toLocaleString("en-US");
}

function renderProjectHighlightText(project, baseDescription = "") {
  const hasBaseDescription = Boolean(String(baseDescription || "").trim());
  const projectDescription = cleanProjectDescription(project.description);
  const description = hasBaseDescription || isNearDuplicateRenderText(projectDescription, baseDescription) ? "" : projectDescription;
  const hasDomains = Array.isArray(project.domains) && project.domains.length > 0;
  const domains = hasDomains ? `领域：${project.domains.join("、")}。` : "";
  const useCaseText = String(project.use_case || "").trim();
  const useCase = useCaseText && !(hasBaseDescription && hasDomains) && !isNearDuplicateRenderText(useCaseText, [baseDescription, description].filter(Boolean).join(" "))
    ? `适合：${useCaseText}`
    : "";
  return uniqueRenderTextFragments([description, domains, useCase]).join(" ");
}

function uniqueRenderTextFragments(fragments) {
  const result = [];
  for (const fragment of fragments.map((item) => String(item || "").trim()).filter(Boolean)) {
    if (!result.some((existing) => isNearDuplicateRenderText(fragment, existing))) {
      result.push(fragment);
    }
  }
  return result;
}

function isNearDuplicateRenderText(left, right) {
  const leftTokens = semanticRenderTokens(left);
  const rightTokens = semanticRenderTokens(right);
  if (leftTokens.length === 0 || rightTokens.length === 0) {
    return false;
  }

  const leftText = normalizeRenderSemanticText(left);
  const rightText = normalizeRenderSemanticText(right);
  if (leftText.length >= 16 && rightText.length >= 16 && (leftText.includes(rightText) || rightText.includes(leftText))) {
    return true;
  }

  const rightSet = new Set(rightTokens);
  const shared = new Set(leftTokens.filter((token) => rightSet.has(token))).size;
  const smaller = Math.min(new Set(leftTokens).size, rightSet.size);
  return smaller >= 4 && shared / smaller >= 0.45;
}

function semanticRenderTokens(value) {
  const text = normalizeRenderSemanticText(value);
  if (!text) {
    return [];
  }
  const tokens = text.match(/[a-z0-9][a-z0-9+#._-]*/g) || [];
  const cjk = text.replace(/[^\p{Script=Han}]/gu, "");
  for (let index = 0; index < cjk.length - 1; index += 1) {
    tokens.push(cjk.slice(index, index + 2));
  }
  return [...new Set(tokens.filter((token) => token.length > 1))];
}

function normalizeRenderSemanticText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\p{L}\p{N}+#._-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function indexProjectsForRender(projects) {
  const byUrl = new Map();
  const byRepo = new Map();
  for (const project of projects) {
    const urlKey = normalizeUrlForRender(project?.url);
    if (urlKey) byUrl.set(urlKey, project);
    const repoKey = repoKeyForRender(project);
    if (repoKey) byRepo.set(repoKey, project);
  }
  return { byUrl, byRepo };
}

function projectForTrendRender(item, projectIndex) {
  const urlKey = normalizeUrlForRender(item?.url);
  if (urlKey && projectIndex.byUrl.has(urlKey)) {
    return projectIndex.byUrl.get(urlKey);
  }
  const repoKey = repoKeyForRender(item);
  return repoKey ? projectIndex.byRepo.get(repoKey) : null;
}

function repoKeyForRender(item) {
  const value = item?.repo || item?.name || repoFromGithubUrlForRender(item?.url);
  return String(value || "").trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\/$/, "").toLowerCase();
}

function repoFromGithubUrlForRender(value) {
  try {
    const parsed = new URL(String(value || ""));
    if (!parsed.hostname.toLowerCase().includes("github.com")) return "";
    const parts = parsed.pathname.split("/").filter(Boolean);
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : "";
  } catch {
    return "";
  }
}

function normalizeUrlForRender(value) {
  return normalizeUrlIdentity(value);
}

function renderProjectsSection(projects) {
  if (projects.length === 0) {
    return "";
  }

  return `<section class="section" id="projects">
      <h2>今日值得关注的项目</h2>
      ${renderProjects(projects)}
    </section>`;
}

function renderProjects(projects) {
  if (projects.length === 0) {
    return "";
  }

  return `<table class="project-table">
  <thead><tr><th>项目</th><th>说明</th><th>链接</th></tr></thead>
  <tbody>
    ${projects
      .map(
        (project) =>
          `<tr><td>${escapeHtml(project.name)}</td><td>${renderProjectDetails(project)}</td><td>${externalLink(project.url, "原文")}</td></tr>`
      )
      .join("\n")}
  </tbody>
</table>`;
}

function renderProjectDetails(project) {
  const tags = [importanceLabel(project.importance), ...projectHeatTags(project)].filter(Boolean);
  const tagsHtml = tags.length > 0 ? `<div class="item-meta">${renderTags(tags)}</div>` : "";
  const domains = Array.isArray(project.domains) && project.domains.length > 0
    ? `<p><strong>领域：</strong>${escapeHtml(project.domains.join("、"))}</p>`
    : "";
  const useCase = project.use_case ? `<p><strong>作用：</strong>${escapeHtml(project.use_case)}</p>` : "";
  return `${tagsHtml}<p>${escapeHtml(cleanProjectDescription(project.description))}</p>${domains}${useCase}`;
}

function renderTags(tags) {
  return [...new Set(tags.map((tag) => String(tag || "").trim()).filter(Boolean))]
    .map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`)
    .join("");
}

function renderBuilderObservationsSection(items) {
  if (items.length === 0) {
    return "";
  }

  return `<section class="section" id="builder-observations">
      <h2>Builder 观察</h2>
      ${renderBuilderObservations(items)}
    </section>`;
}

function renderBuilderObservations(items) {
  if (items.length === 0) {
    return "";
  }

  return `<div class="builder-card-list">${items
    .map((item) => renderBuilderObservation(item))
    .join("\n")}</div>`;
}

function renderBuilderObservation(item) {
  const meta = [
    item.role ? item.role : "",
    item.event_date ? item.event_date : "",
    importanceLabel(item.importance)
  ].filter(Boolean);
  const metaHtml = meta.length > 0 ? `<div class="item-meta">${meta.map((value) => `<span>${escapeHtml(value)}</span>`).join("")}</div>` : "";
  const handle = builderHandle(item);
  const handleHtml = handle ? `<span>@${escapeHtml(handle)}</span>` : "";
  return `<article class="builder-card">
      <div class="builder-card-header">
        <img class="builder-avatar" src="${escapeAttribute(builderAvatarSrc(item))}" alt="" loading="lazy" decoding="async">
        <div class="builder-card-title"><strong>${externalLink(item.url, item.author || "Builder")}</strong>${handleHtml}</div>
      </div>
      ${metaHtml}
      <p>${escapeHtml(builderTranslationText(item))}</p>
    </article>`;
}

function builderTranslationText(item) {
  return String(item?.translation || item?.translated_text || item?.content || "").trim();
}

function builderHandle(item) {
  const handle = String(item?.handle || "").trim().replace(/^@/, "");
  if (handle) {
    return handle;
  }
  try {
    const [, parsedHandle] = new URL(String(item?.url || "")).pathname.match(/^\/([^/]+)\/status\/\d+/i) || [];
    return String(parsedHandle || "").trim().replace(/^@/, "");
  } catch {
    return "";
  }
}

function builderAvatarSrc(item) {
  if (item?.avatar_data_uri) {
    return item.avatar_data_uri;
  }
  return generatedLegacyIcon(item?.author || builderHandle(item) || "B");
}

function generatedLegacyIcon(label) {
  const text = escapeHtml(String(label || "B").split(/\s+/).filter(Boolean).map((part) => part[0]).join("").toUpperCase().slice(0, 3) || "B");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44"><rect width="44" height="44" rx="22" fill="#111827"/><text x="22" y="28" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="15" font-weight="700" fill="#ffffff">${text}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

function renderCommunityLeadsSection(items) {
  if (items.length === 0) {
    return "";
  }

  return `<section class="section" id="community-leads">
      <h2>社区线索</h2>
      ${renderCommunityLeads(items)}
    </section>`;
}

function renderCommunityLeads(items) {
  if (items.length === 0) {
    return "";
  }

  return `<ul class="compact-list">${items.map((item) => `<li>${renderImportanceSpan(item)}${escapeHtml(item.content)} ${externalLink(item.url, "来源")}</li>`).join("\n")}</ul>`;
}

function renderImportanceSpan(item) {
  const label = importanceLabel(item?.importance);
  return label ? `<span>${escapeHtml(label)}</span>` : "";
}

function evidenceAssetsBySourceUrl(assets) {
  const grouped = new Map();
  for (const asset of assets) {
    const key = normalizeEvidenceUrl(asset?.source_url);
    if (!key || !hasRenderableEvidence(asset)) {
      continue;
    }
    const current = grouped.get(key) || [];
    if (!current.some((existing) => evidenceAssetIdentity(existing) === evidenceAssetIdentity(asset))) {
      current.push(asset);
    }
    grouped.set(key, current);
  }
  return grouped;
}

function evidenceAssetIdentity(asset) {
  return asset?.local_path || `${asset?.title || ""}:${JSON.stringify(asset?.data || [])}`;
}

function evidenceForUrl(evidenceByUrl, url) {
  if (!evidenceByUrl || typeof evidenceByUrl.get !== "function") {
    return [];
  }
  return evidenceByUrl.get(normalizeEvidenceUrl(url)) || [];
}

function normalizeEvidenceUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return String(value || "").trim().replace(/\/$/, "");
  }
}

function hasRenderableEvidence(asset) {
  return Boolean(asset && (asset.local_path || (Array.isArray(asset.data) && asset.data.length > 0)));
}

function renderInlineEvidenceAssets(report, assets) {
  if (!report || !Array.isArray(assets) || assets.length === 0) {
    return "";
  }
  return assets
    .slice(0, 2)
    .map((asset) => renderInlineEvidenceAsset(report, asset))
    .filter(Boolean)
    .join("\n");
}

function renderInlineEvidenceAsset(report, asset) {
  const media = asset.local_path
    ? `<figure><img class="evidence-image" src="${escapeAttribute(relativeAssetHref(report.html_path, asset.local_path))}" alt="${escapeAttribute(asset.title)}" loading="lazy" decoding="async"><figcaption>${escapeHtml(asset.title)}</figcaption></figure>`
    : "";
  const table = asset.local_path ? "" : renderEvidenceTable(asset.data);
  if (!media && !table) {
    return "";
  }
  return `<aside class="inline-evidence">
    ${media}
    ${!media ? `<p class="inline-evidence-caption">${escapeHtml(asset.title)}</p>` : ""}
    ${table}
  </aside>`;
}

function renderEvidenceTable(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return "";
  }

  const [header, ...body] = rows;
  const headerHtml = Array.isArray(header)
    ? `<thead><tr>${header.map((cell) => `<th>${escapeHtml(cell)}</th>`).join("")}</tr></thead>`
    : "";
  const bodyRows = body.length > 0 ? body : [];
  return `<table class="project-table evidence-table">
  ${headerHtml}
  <tbody>
    ${bodyRows.map((row) => `<tr>${(Array.isArray(row) ? row : []).map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("\n")}
  </tbody>
</table>`;
}

function renderSourceAudit(audit) {
  return `<section class="section" id="source-audit">
      <h2>信源审计</h2>
      <div class="audit-grid">
        ${renderAuditGroup("GitHub Trending", audit.github_trending)}
        ${renderAuditGroup("Builder 原始源", audit.builder_sources)}
        ${audit.content_sources ? renderAuditGroup("热门博客与访谈源", audit.content_sources) : ""}
        ${audit.search_sources ? renderAuditGroup("搜索 / 新闻影子源", audit.search_sources) : ""}
        ${audit.sources_health ? renderAuditGroup("信源健康检查", audit.sources_health) : ""}
      </div>
    </section>`;
}

function renderAuditGroup(title, group) {
  if (!group) {
    return "";
  }

  const status = group.checked ? "已检查" : "未检查";
  const counts = sourceStatusCounts(group.sources);
  const meta = [
    `status checked=${counts.checked} no_signal=${counts.no_signal} blocked=${counts.blocked} skipped=${counts.skipped}`,
    "scope=this run fetched and parsed these sources; not exhaustive proof of no omitted updates",
    status,
    `${group.candidates_found} 候选`,
    `${group.included} 入选`,
    group.blocked_reason ? `阻塞：${group.blocked_reason}` : "",
    group.last_successful_feed_at ? `上次成功：${group.last_successful_feed_at}` : ""
  ].filter(Boolean);
  return `<article class="audit-card">
  <h3>${escapeHtml(title)}</h3>
  <div class="item-meta">
    ${meta.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
  </div>
  ${group.notes ? `<p>${escapeHtml(group.notes)}</p>` : ""}
  ${renderAuditSources(group.sources)}
</article>`;
}

function sourceStatusCounts(sources) {
  const counts = { checked: 0, no_signal: 0, blocked: 0, skipped: 0 };
  for (const source of Array.isArray(sources) ? sources : []) {
    const status = String(source?.status || "");
    if (status === "checked") counts.checked += 1;
    else if (status === "no_signal") counts.no_signal += 1;
    else if (status === "blocked") counts.blocked += 1;
    else if (status.startsWith("skipped")) counts.skipped += 1;
  }
  return counts;
}

function renderAuditSources(sources = []) {
  if (!Array.isArray(sources) || sources.length === 0) {
    return '<p class="muted">未记录具体来源。</p>';
  }

  return `<ul class="compact-list">${sources
    .map((source) => {
      const notes = source.notes ? `：${escapeHtml(source.notes)}` : "";
      return `<li>${externalLink(source.url, source.name)} <span class="tag">${escapeHtml(source.status)}</span>${notes}</li>`;
    })
    .join("\n")}</ul>`;
}

function renderOptimizationSuggestions(items = []) {
  if (!Array.isArray(items) || items.length === 0) {
    return '<p class="muted">暂无提示词或规则迭代建议。</p>';
  }

  return `<section class="suggestions" aria-label="提示词或规则迭代建议">
  <h3>提示词与规则迭代建议</h3>
  <ol class="compact-list">${items.map(renderOptimizationSuggestion).join("\n")}</ol>
</section>`;
}

function renderOptimizationSuggestion(item) {
  const parts = [
    item.module ? `<span class="tag">模块：${escapeHtml(item.module)}</span>` : "",
    typeof item.requires_user_confirmation === "boolean"
      ? `<span class="tag">${item.requires_user_confirmation ? "需要确认" : "可直接处理"}</span>`
      : ""
  ].filter(Boolean);
  const details = [
    `<p><strong>${escapeHtml(item.issue || item.observed_issue || item.suggestion || "建议")}</strong></p>`,
    parts.length > 0 ? `<div class="item-meta">${parts.join("")}</div>` : "",
    item.evidence ? `<p>证据：${escapeHtml(item.evidence)}</p>` : "",
    item.suggestion || item.proposed_change ? `<p>建议：${escapeHtml(item.suggestion || item.proposed_change)}</p>` : "",
    item.expected_benefit ? `<p>为什么要改：${escapeHtml(item.expected_benefit)}</p>` : ""
  ].filter(Boolean);
  return `<li>
    ${details.join("\n    ")}
  </li>`;
}

function renderFeedItem(item) {
  return `<li class="report-card">
  <h3><a href="${escapeAttribute(item.url)}">${escapeHtml(item.title)}</a></h3>
  <p>${escapeHtml(item.summary)}</p>
  <div class="item-meta"><span>${escapeHtml(item.report_date)}</span><span>${item.main_items} 主体信息</span><span>${item.builder_observations} Builder</span></div>
</li>`;
}

function externalLink(url, label) {
  const icon = siteIconForUrl(url);
  const iconHtml = icon ? `<img class="inline-site-icon" src="${escapeAttribute(icon)}" alt="" decoding="async">` : "";
  return `${iconHtml}<a href="${escapeAttribute(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
}

function siteIconForUrl(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
    const letter = hostname.replace(/[^a-z0-9]/g, "").slice(0, 1).toUpperCase() || "L";
    const color = colorForHost(hostname);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="${color}"/><text x="16" y="21" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" font-weight="700" fill="#fff">${letter}</text></svg>`;
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  } catch {
    return "";
  }
}

function colorForHost(hostname) {
  let hash = 0;
  for (const char of hostname) {
    hash = (hash * 31 + char.charCodeAt(0)) % 360;
  }
  return `hsl(${hash} 64% 38%)`;
}
