import { reportRelativePaths, relativeAssetHref } from "./paths.js";
import { cleanProjectDescription, modelReleaseTags, projectHeatTags } from "./presentation.js";

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
  const modelReleases = Array.isArray(report.model_releases) ? report.model_releases : [];
  const hotBlogs = Array.isArray(report.hot_blogs) ? report.hot_blogs : [];
  const projects = Array.isArray(report.projects) ? report.projects : [];
  const builderObservations = Array.isArray(report.builder_observations) ? report.builder_observations : [];
  const communityLeads = Array.isArray(report.community_leads) ? report.community_leads : [];
  const sourceAudit = report.source_audit && typeof report.source_audit === "object" ? report.source_audit : null;
  const sourceAuditSection = sourceAudit ? `\n    ${renderSourceAudit(sourceAudit)}\n` : "";
  const metaItems = [
    `<span><strong>${mainItems.length}</strong> 主体信息</span>`,
    modelReleases.length > 0 ? `<span><strong>${modelReleases.length}</strong> 模型发布</span>` : "",
    hotBlogs.length > 0 ? `<span><strong>${hotBlogs.length}</strong> 技术博客</span>` : "",
    projects.length > 0 ? `<span><strong>${projects.length}</strong> 项目</span>` : "",
    builderObservations.length > 0 ? `<span><strong>${builderObservations.length}</strong> Builder 观察</span>` : "",
    communityLeads.length > 0 ? `<span><strong>${communityLeads.length}</strong> 社区线索</span>` : ""
  ]
    .filter(Boolean)
    .join("\n        ");
  const optionalSections = [
    renderModelReleasesSection(modelReleases),
    renderHotBlogsSection(hotBlogs),
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
      ${mainItems.map(renderMainItem).join("\n")}
    </section>
${optionalSections ? `\n    ${optionalSections}\n` : ""}
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

export function renderIndexHtml(feed) {
  const latest = feed.reports[0];
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

    <section class="section" id="reports">
      <h2>历史日报</h2>
      ${feed.reports.length > 0 ? `<ol class="report-list">${feed.reports.map(renderFeedItem).join("\n")}</ol>` : "<p>暂无可展示日报。</p>"}
    </section>
  </main>
</body>
</html>
`;
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

function renderMainItem(item) {
  return `<article class="item">
  <h3>${escapeHtml(item.title)}</h3>
  <div class="item-meta"><span>${escapeHtml(item.event_date)}</span><span>${escapeHtml(item.tier)}</span>${item.entities.map((entity) => `<span>${escapeHtml(entity)}</span>`).join("")}</div>
  <ul>
    ${item.bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join("\n")}
  </ul>
  <p class="source-line">来源：${externalLink(item.url, item.source)}</p>
</article>`;
}

function renderModelReleasesSection(items) {
  if (items.length === 0) {
    return "";
  }

  return `<section class="section" id="model-releases">
      <h2>模型发布</h2>
      ${items.map(renderModelRelease).join("\n")}
    </section>`;
}

function renderModelRelease(item) {
  return `<article class="item">
  <h3>${escapeHtml(item.name)}</h3>
  <div class="item-meta">
    <span>${escapeHtml(item.event_date)}</span>
    <span>${escapeHtml(item.provider)}</span>
    <span>${escapeHtml(renderAvailability(item.availability))}</span>
    ${renderTags(modelReleaseTags(item))}
  </div>
  <p>${escapeHtml(item.summary)}</p>
  <p class="source-line">来源：${externalLink(item.url, item.source)}</p>
</article>`;
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
  </div>
  <p>${escapeHtml(item.summary)}</p>
</article>`;
}

function renderAvailability(value) {
  const labels = {
    open_weights: "开源权重",
    closed_api: "闭源 API",
    closed_product: "产品内可用",
    research_preview: "研究预览"
  };
  const label = labels[value];
  return label ? `${label} (${value})` : value;
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
  const tags = projectHeatTags(project);
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
    item.source ? item.source : ""
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

  return `<ul class="compact-list">${items.map((item) => `<li>${escapeHtml(item.content)} ${externalLink(item.url, "来源")}</li>`).join("\n")}</ul>`;
}

function renderSourceAudit(audit) {
  return `<section class="section" id="source-audit">
      <h2>信源审计</h2>
      <div class="audit-grid">
        ${renderAuditGroup("GitHub Trending", audit.github_trending)}
        ${renderAuditGroup("Builder 原始源", audit.builder_sources)}
        ${audit.content_sources ? renderAuditGroup("热门博客与访谈源", audit.content_sources) : ""}
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
  return `<a href="${escapeAttribute(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
}
