import { reportRelativePaths, relativeAssetHref } from "./paths.js";
import {
  cleanGithubTrendDescription,
  cleanProjectDescription,
  githubTrendStatusTag,
  projectHeatTags
} from "./presentation.js";
import { importanceLabel } from "./importance.js";

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
    hotBlogs.length > 0 ? `<span><strong>${hotBlogs.length}</strong> 技术博客</span>` : "",
    projects.length > 0 ? `<span><strong>${projects.length}</strong> 项目</span>` : "",
    builderObservations.length > 0 ? `<span><strong>${builderObservations.length}</strong> Builder 观察</span>` : "",
    communityLeads.length > 0 ? `<span><strong>${communityLeads.length}</strong> 社区线索</span>` : ""
  ]
    .filter(Boolean)
    .join("\n        ");
  const optionalSections = [
    renderHotBlogsSection(hotBlogs),
    renderGithubTrendingSection(githubTrending),
    renderProjectsSection(projects),
    renderBuilderObservationsSection(builderObservations),
    renderCommunityLeadsSection(communityLeads)
  ].filter(Boolean).join("\n\n");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
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

export function renderIndexHtml(feed, trends = null) {
  const latest = feed.reports[0];
  const trendOverview = renderTrendOverview(trends);
  const dateNavigation = renderDateNavigation(feed.reports);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(feed.site_title)}</title>
  <link rel="stylesheet" href="assets/style.css">
</head>
<body>
  <header class="site-header">
    <span class="site-title">AI 日报</span>
    <span class="site-date">更新于 ${escapeHtml(feed.updated_at)}</span>
  </header>
  <main class="page">
    <section class="report-hero">
      <p class="eyebrow">GitHub Pages 静态归档</p>
      <h1>${escapeHtml(feed.site_title)}</h1>
      <p class="summary">${latest ? escapeHtml(latest.summary) : "暂无日报。运行 build 后会在这里展示归档。"}</p>
      <div class="meta-grid" aria-label="站点统计">
        <span><strong>${feed.reports.length}</strong> 篇日报</span>
        <span><strong>${latest ? latest.report_date : "-"}</strong> 最新日期</span>
      </div>
    </section>

    ${trendOverview}

    ${dateNavigation}

    <section class="section" id="reports">
      <h2>历史日报</h2>
      ${feed.reports.length > 0 ? `<ol class="report-list">${feed.reports.map(renderFeedItem).join("\n")}</ol>` : "<p>暂无可展示日报。</p>"}
    </section>
  </main>
</body>
</html>
`;
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

export const defaultStyleCss = `:root {
  color-scheme: light;
  --bg: #f6f7f9;
  --panel: #ffffff;
  --text: #17202a;
  --muted: #5f6f7f;
  --line: #d9e0e7;
  --accent: #146c94;
  --accent-2: #246b45;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  line-height: 1.65;
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
  background: #ffffff;
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

.report-hero {
  padding: 28px 0 24px;
  border-bottom: 1px solid var(--line);
}

.eyebrow {
  margin: 0 0 8px;
  color: var(--accent-2);
  font-weight: 700;
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

.item,
.report-card {
  margin: 0 0 16px;
  padding: 18px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
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
  gap: 12px;
  padding-top: 24px;
}

.artifact-links a {
  padding: 8px 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
}

@media (max-width: 640px) {
  .site-header {
    align-items: flex-start;
    flex-direction: column;
    padding: 14px 16px;
  }

  .page {
    width: min(100% - 24px, 1040px);
    padding-top: 20px;
  }

  h1 {
    font-size: 1.55rem;
  }

  .project-table {
    display: block;
    overflow-x: auto;
  }
}
`;

function renderMainItem(report, item, evidenceByUrl) {
  return `<article class="item">
  <h3>${escapeHtml(item.title)}</h3>
  <div class="item-meta"><span>${escapeHtml(item.event_date)}</span><span>${escapeHtml(item.tier)}</span>${renderImportanceSpan(item)}${item.entities.map((entity) => `<span>${escapeHtml(entity)}</span>`).join("")}</div>
  <ul>
    ${item.bullets.map((bullet) => `<li>${renderInlineEmphasis(bullet)}</li>`).join("\n")}
  </ul>
  <p class="source-line">来源：${externalLink(item.url, item.source)}</p>
  ${renderInlineEvidenceAssets(report, evidenceForUrl(evidenceByUrl, item.url))}
</article>`;
}

function renderInlineEmphasis(value) {
  return escapeHtml(value)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/==([^=]+)==/g, "<mark>$1</mark>");
}

function renderHotBlogsSection(items) {
  if (items.length === 0) {
    return "";
  }

  return `<section class="section" id="hot-blogs">
      <h2>热门技术博客</h2>
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

function renderGithubTrendingSection(items) {
  if (items.length === 0) {
    return "";
  }

  return `<section class="section" id="github-trending">
      <h2>GitHub Trending</h2>
      ${renderGithubTrending(items)}
    </section>`;
}

function renderGithubTrending(items) {
  return `<table class="project-table">
  <thead><tr><th>榜位</th><th>项目</th><th>变化</th><th>简介</th></tr></thead>
  <tbody>
    ${items
      .slice(0, 10)
      .map(
        (item) =>
          `<tr><td>#${escapeHtml(item.rank)}</td><td>${externalLink(item.url, item.name || item.repo)}</td><td>${renderTags([importanceLabel(item.importance), githubTrendStatusTag(item)].filter(Boolean))}</td><td>${renderGithubTrendDetails(item)}</td></tr>`
      )
      .join("\n")}
  </tbody>
</table>`;
}

function renderGithubTrendDetails(item) {
  return `<p>${escapeHtml(cleanGithubTrendDescription(item))}</p>`;
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
  return tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("");
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

  return `<ul class="compact-list">${items
    .map((item) => `<li>${renderBuilderObservation(item)}</li>`)
    .join("\n")}</ul>`;
}

function renderBuilderObservation(item) {
  const meta = [
    item.role ? item.role : "",
    item.event_date ? item.event_date : "",
    item.source ? item.source : "",
    importanceLabel(item.importance)
  ].filter(Boolean);
  const metaHtml = meta.length > 0 ? `<div class="item-meta">${meta.map((value) => `<span>${escapeHtml(value)}</span>`).join("")}</div>` : "";
  const evidence = item.evidence ? `<p class="muted">${escapeHtml(item.evidence)}</p>` : "";
  return `<strong>${escapeHtml(item.author)}</strong>：${escapeHtml(item.content)} ${externalLink(item.url, "来源")}${metaHtml}${evidence}`;
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
  const meta = [
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
