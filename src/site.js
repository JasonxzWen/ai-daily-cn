import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { DEFAULT_SITE } from "./config.js";
import { PublisherError } from "./errors.js";
import { parseDailyMarkdown } from "./parser.js";
import { defaultStyleCss, renderIndexHtml, renderOfficialBlogsHtml, renderOpsIndexHtml } from "./render.js";
import { renderReportWithEffectiveInteract } from "./interaction-report.js";
import { reportRelativePaths, toPosixRelative } from "./paths.js";
import { defaultGeneratedAt } from "./time.js";
import {
  validateArticles,
  validateFeed,
  validateFrontendRuntime,
  validateFrontendSources,
  validateFrontendToday,
  validateFrontendTopics,
  validateReport,
  validateTrends
} from "./schema.js";
import { normalizeCandidatePool } from "./candidates.js";
import { deriveQualityStatus, normalizeQualityStatus } from "./quality-status.js";
import { buildTrendIndex, loadTrendConfig } from "./trends.js";
import { withDefaultImportance } from "./importance.js";
import { isMeaningfulPublicEvidenceAsset } from "./media-policy.js";
import { isPublishableOfficialComponentFragment } from "./official-component-snapshot.js";
import { normalizeStoryFirstReport } from "./story-first.js";
import { sanitizeTrackingComponentSnapshot } from "./tracking-components.js";
import { sanitizePublicDegradationEvent } from "./degradation-events.js";
import { loadOfficialBlogKnowledge, toPublicOfficialBlogKnowledge } from "./official-blog-knowledge.js";
import { normalizeGithubReadmeSummary } from "./github-readme.js";
import { isPublicSurfaceDietEnabled } from "./public-surface-policy.js";

const AVATAR_DOWNLOAD_TIMEOUT_MS = 2500;
const AVATAR_MAX_BYTES = 1_000_000;
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);
const REPORT_DATA_AUXILIARY_JSON = new Set(["source-status-history.json"]);
const PUBLIC_DATA_PRIVATE_KEYS = new Set([
  "candidate_id",
  "candidate_pool_path",
  "source_audit",
  "source_effectiveness",
  "self_check",
  "quality_status",
  "source_window",
  "publish_status",
  "markdown_path",
  "why_it_matters",
  "reader_relevance",
  "watch_next",
  "why_watch",
  "selection_snapshot",
  "optimization_suggestions",
  "blocking_issues",
  "degraded_sections",
  "source_id",
  "rule_id",
  "source_level",
  "verification_status",
  "display_section",
  "display_section_label",
  "display_section_rank",
  "display_rank",
  "display_mode",
  "status_label",
  "verification_note",
  "verification_sources",
  "primary_url",
  "risk_note",
  "risk_level",
  "exemption_policy",
  "published_by_gate",
  "matched_terms",
  "published_by",
  "notes",
  "status",
  "evidence",
  "included_in",
  "debug",
  "raw",
  "publish_to_public"
]);
const NON_PUBLIC_ASSET_ROLES = new Set(["icon", "favicon", "logo", "avatar", "thumbnail"]);
const RETIRED_PLATFORM_SECTIONS = new Set(["wechat_items", "zhihu_items", "reddit_items"]);
const SCREENSHOT_CAPTURE_RE = /(?:full[_-]?page|browser|viewport|screenshot|page[_-]?capture)/i;
const LEGACY_REMOVED_PUBLIC_SOURCE_RE = /(?:hellogithub|hello\s*github|ruanyf|ruan\s*yf|reddit|r\/machinelearning|r\/localllama)/i;
const REMOVED_PUBLIC_SOURCE_RE = /(?:hellogithub|hello\s*github|ruanyf|ruan\s*yf)/i;
const COMMUNITY_HOTSPOT_SOURCE_RE = /(?:hnrss|hacker news|news\.ycombinator|reddit\.com\/r\/(?:machinelearning|localllama|singularity|artificial)|r\/(?:machinelearning|localllama|singularity|artificial))/i;
const PUBLIC_DISCOVERY_DEGRADED_NOTE = "Some discovery coverage is degraded; this report may be incomplete.";

const ARTICLE_SECTIONS = [
  "stories",
  "main_items",
  "hot_blogs",
  "github_trending",
  "huggingface_trending",
  "daily_tracking",
  "projects",
  "builder_observations",
  "community_leads",
  "official_org_updates",
  "chinese_media_dynamics"
];
const ARTICLE_SECTION_BASE_SCORE = {
  stories: 88,
  main_items: 86,
  hot_blogs: 76,
  github_trending: 72,
  huggingface_trending: 72,
  daily_tracking: 80,
  projects: 70,
  builder_observations: 68,
  community_leads: 60,
  official_org_updates: 82,
  chinese_media_dynamics: 72,
  source_watch: 78
};
const ARTICLE_DOMAIN_ORDER = [
  "AI 产品与应用工具",
  "AI 用法与实践方法",
  "企业落地与业务应用",
  "行业动态与政策地缘",
  "基础模型与算力技术栈",
  "多模态与具身等前沿"
];
const ARTICLE_FLAVORS = ["快讯", "论文", "技术拆解", "商业洞察", "报告", "实战方法", "观点专访"];
const EXTERNAL_ARTICLE_LIMIT_PER_SOURCE = 240;
const KNOWN_AI_COMPANIES = [
  "OpenAI",
  "Anthropic",
  "Google",
  "Microsoft",
  "Meta",
  "Apple",
  "NVIDIA",
  "GitHub",
  "Hugging Face",
  "ByteDance",
  "Mistral",
  "xAI",
  "Perplexity",
  "Vercel",
  "Cloudflare",
  "LangChain",
  "DeepSeek",
  "Alibaba",
  "Tencent",
  "Baidu",
  "Moonshot",
  "Zhipu"
];
const KNOWN_AI_PRODUCTS = [
  "ChatGPT",
  "Claude",
  "Gemini",
  "Codex",
  "Copilot",
  "Sora",
  "Llama",
  "GPT",
  "DeepSeek",
  "Qwen",
  "Kimi",
  "LangGraph",
  "LangChain",
  "SGLang",
  "vLLM",
  "MCP"
];
const PUBLIC_QUALITY_SECTION_ALIASES = new Map([
  ["source_audit.github_trending", "github_trending"],
  ["source_audit.huggingface_trending", "huggingface_trending"],
  ["source_audit.builder_sources", "builder_observations"],
  ["source_audit.china_ai_sources", "hot_blogs"],
  ["source_audit.content_sources", "hot_blogs"],
  ["source_audit.search_sources", "community_leads"]
]);
const LEGACY_PUBLIC_SOURCE_FILTER_SECTIONS = [
  "stories",
  "main_items",
  "model_releases",
  "hot_blogs",
  "chinese_media_dynamics",
  "projects",
  "github_trending",
  "huggingface_trending",
  "builder_observations",
  "official_org_updates",
  "wechat_items",
  "zhihu_items",
  "reddit_items"
];
const PUBLIC_SOURCE_FILTER_SECTIONS = [
  "stories",
  "main_items",
  "model_releases",
  "hot_blogs",
  "chinese_media_dynamics",
  "projects",
  "github_trending",
  "huggingface_trending",
  "builder_observations",
  "official_org_updates",
  "community_leads",
  "wechat_items",
  "zhihu_items",
  "reddit_items"
];
const TRACKING_HISTORY_LIMIT = 7;
const DAILY_REPORT_HTML_OVERRIDES = `<style data-ai-daily-css-overrides>
/* Stage D: denser collapsible panels at every width. */
.report-section-stack .collapsible-panel {
  margin: 0;
}

.report-section-stack .collapsible-summary {
  padding: 8px 12px;
}

.collapsible-subtitle {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  color: var(--muted);
}

.report-shell {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
}

.report-section-stack > section[id^="section-track-"] {
  border-radius: 8px;
}

.report-section-stack > section[id^="section-track-"] .rendered-markdown {
  font-size: 0.95rem;
  line-height: 1.66;
}

.report-section-stack > section[id^="section-track-"] .rendered-markdown > p:first-child {
  margin-top: 0;
  color: var(--muted);
  font-size: 0.9rem;
}

.report-section-stack > section[id^="section-track-"] .rendered-markdown strong {
  display: block;
  margin-top: 14px;
  color: var(--ink);
  font-size: 1rem;
  line-height: 1.38;
}

.report-section-stack > section[id^="section-track-"] .rendered-markdown ul {
  margin: 6px 0 14px;
  padding-left: 1.15rem;
}

.report-section-stack > section[id^="section-track-"] .rendered-markdown li {
  margin: 4px 0;
}

.inline-site-icon {
  width: 16px !important;
  height: 16px !important;
  max-width: 16px;
  max-height: 16px;
  object-fit: cover;
}

.card-title-icon {
  width: 18px !important;
  height: 18px !important;
  max-width: 18px;
  max-height: 18px;
  flex: 0 0 18px;
}

.chip,
.text-highlight,
.daily-tag,
.tag-highlight,
.tag-stars,
.tag-topic,
.tag-major,
.tag-notable,
.tag-general {
  font-size: 0.78rem;
  line-height: 1.2;
  transition: background-color 140ms ease, border-color 140ms ease, color 140ms ease, transform 140ms ease;
}

.chip:hover,
a.chip:hover,
.text-highlight:hover,
.daily-tag:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--accent) 44%, var(--line));
  background: color-mix(in srgb, var(--accent-soft) 76%, #ffffff);
  color: var(--accent);
}

.chip-topic,
.tag-topic {
  border-color: #adc4ce;
  background: #edf3f5;
  color: #31586a;
}

.chip-major,
.tag-major {
  border-color: #d7a06a;
  background: #fff1df;
  color: #8a431c;
}

.chip-notable,
.tag-notable {
  border-color: #b7c68f;
  background: #eef4df;
  color: #526a2d;
}

/* Reader report left rail: desktop keeps category-level anchors; mobile keeps
   the engine's horizontal nav. */
@media (min-width: 761px) {
  .report-layout {
    grid-template-columns: minmax(190px, 230px) minmax(0, 1fr);
    gap: 20px;
  }

  .report-nav {
    position: sticky;
    top: 12px;
    z-index: 3;
    flex-direction: column;
    align-items: stretch;
    max-height: calc(100vh - 24px);
    overflow-x: hidden;
    overflow-y: auto;
    backdrop-filter: none;
  }

  .report-nav-group {
    flex-direction: column;
    align-items: stretch;
    overflow: visible;
  }

  .report-nav a {
    white-space: normal;
    border-radius: 6px;
  }

  .report-nav a[href^="#section-track-"] {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 3px;
    justify-content: flex-start;
    border-left: 3px solid transparent;
    margin-top: 8px;
    font-size: 0.88rem;
    font-weight: 760;
  }

  .report-nav a[href^="#section-track-"]::before {
    display: block;
    content: "正文主线";
    color: var(--muted);
    font-size: 0.66rem;
    font-weight: 700;
    letter-spacing: 0;
    line-height: 1.1;
  }

  .report-nav a[href="#section-github-trending"]::before,
  .report-nav a[href="#section-huggingface-trending"]::before {
    content: "开源与模型";
  }

  .report-nav a[href="#section-trend-tracking"]::before,
  .report-nav a[href="#section-model-releases"]::before {
    content: "趋势追踪";
  }

  .report-nav a[href="#section-subscribed-rss"]::before,
  .report-nav a[href="#section-hot-blogs"]::before,
  .report-nav a[href="#section-chinese-media-dynamics"]::before {
    content: "媒体与订阅";
  }

  .report-nav a[href^="#section-track-"]:hover,
  .report-nav a[href^="#section-track-"][aria-current="true"] {
    border-left-color: var(--accent);
  }

  .report-nav a:not([href^="#section-track-"]) {
    padding-left: 18px;
    color: var(--muted);
    font-size: 0.8rem;
    font-weight: 600;
  }

  .report-nav a[href^="#section-story-"] {
    display: none;
  }

  .report-nav a + a {
    border-left-color: transparent;
  }

  .report-nav a span {
    overflow: visible;
    white-space: normal;
  }
}

@media (max-width: 760px) {
  .tracking-card .card-table-scroll {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  .tracking-card .card-data-table {
    width: max-content;
    min-width: 620px;
    table-layout: auto;
  }

  .tracking-card .card-data-table th,
  .tracking-card .card-data-table td {
    white-space: nowrap;
    overflow-wrap: normal;
    word-break: normal;
  }

  .tracking-card .card-data-table th:nth-child(2),
  .tracking-card .card-data-table td:nth-child(2) {
    min-width: 160px;
    white-space: normal;
    overflow-wrap: anywhere;
  }
}
</style>`;

export async function buildSite(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const inputDir = path.resolve(rootDir, options.inputDir || "reports-source");
  const dataInputDir = path.resolve(rootDir, options.dataInputDir || "reports-data");
  const outDir = path.resolve(rootDir, options.outDir || "docs");
  const siteUrl = options.siteUrl || DEFAULT_SITE.siteUrl;
  const siteTitle = options.siteTitle || DEFAULT_SITE.title;
  const generatedAt = options.generatedAt || defaultGeneratedAt();
  const markdownFiles = await collectMarkdownFiles(inputDir);
  const reportJsonFiles = await collectJsonFiles(dataInputDir);
  const reports = [];
  const reportRecords = [];
  const writtenFiles = [];

  await fs.mkdir(outDir, { recursive: true });
  await writeFileTracked(outDir, ".nojekyll", "", writtenFiles);
  await writeFileTracked(outDir, "assets/style.css", defaultStyleCss, writtenFiles);
  const indexStyleVersion = contentHash(defaultStyleCss);

  for (const file of markdownFiles) {
    const markdown = await fs.readFile(file, "utf8");
    const report = parseDailyMarkdown(markdown, { siteUrl, generatedAt });
    reports.push(report);
    reportRecords.push({ report, markdown, reportJsonPath: null });
  }

  for (const file of reportJsonFiles) {
    const report = await readReportJson(file);
    reports.push(report);
    reportRecords.push({ report, markdown: null, reportJsonPath: file });
  }

  const existingFeed = await readExistingFeed(outDir, siteTitle, siteUrl, generatedAt);
  const feed = mergeFeed(existingFeed, reports, { siteTitle, siteUrl, updatedAt: generatedAt });
  const feedValidation = validateFeed(feed);
  if (!feedValidation.valid) {
    throw new PublisherError("feed_schema_validation_failed", "生成的 feed.json 未通过 schema 校验。", {
      errors: feedValidation.errors
    });
  }
  const trendConfig = await loadTrendConfig({ rootDir, configPath: options.trendConfigPath });
  const trendIndex = buildTrendIndex(reports, {
    config: trendConfig,
    reportDate: feedValidation.value.reports[0]?.report_date,
    generatedAt: feedValidation.value.updated_at
  });
  const trendValidation = validateTrends(trendIndex);
  if (!trendValidation.valid) {
    throw new PublisherError("trends_schema_validation_failed", "生成的 trends.json 未通过 schema 校验。", {
      errors: trendValidation.errors
    });
  }

  const officialBlogKnowledgeRaw = await loadOfficialBlogKnowledge({
    rootDir,
    knowledgeDir: options.officialBlogKnowledgeDir
  });
  const officialBlogKnowledge = toPublicOfficialBlogKnowledge(officialBlogKnowledgeRaw, {
    generatedAt: feedValidation.value.updated_at,
    reports
  });
  const dateIndex = buildDateIndex(feedValidation.value, reports, trendValidation.value);
  const sourceWatchAdmittedArtifacts = await loadSourceWatchAdmittedArtifacts(rootDir, {
    artifactPath: options.sourceWatchAdmittedArtifactPath,
    artifactPaths: options.sourceWatchAdmittedArtifactPaths
  });
  const externalArticleSources = await loadConfiguredExternalArticleSources(rootDir, {
    generatedAt,
    reportDate: feedValidation.value.reports[0]?.report_date,
    fetchImpl: options.fetchImpl,
    sourceWatchlistPath: options.sourceWatchlistPath,
    externalArticleSources: options.externalArticleSources,
    externalArticleTargets: options.externalArticleTargets
  });
  const articles = buildArticleIndex(reports, {
    siteTitle,
    siteUrl,
    updatedAt: feedValidation.value.updated_at,
    sourceWatchAdmittedArtifacts,
    externalArticles: externalArticleSources.flatMap((source) => source.articles || [])
  });
  const articleValidation = validateArticles(articles);
  if (!articleValidation.valid) {
    throw new PublisherError("articles_schema_validation_failed", "生成的 articles.json 未通过 schema 校验。", {
      errors: articleValidation.errors
    });
  }
  const reportNavigationByDate = buildReportNavigation(feedValidation.value.reports, dateIndex.items);
  const trackingHistoryByDate = buildDailyTrackingHistoryByReportDate(reports);
  const frontendData = buildFrontendData({
    feed: feedValidation.value,
    articles: articleValidation.value,
    trends: trendValidation.value,
    generatedAt: feedValidation.value.updated_at,
    externalArticleSources
  });
  const frontendValidation = validateFrontendData(frontendData);
  if (!frontendValidation.valid) {
    throw new PublisherError("frontend_data_schema_validation_failed", "生成的 React 首页数据未通过 schema 校验。", {
      errors: frontendValidation.errors
    });
  }

  for (const record of reportRecords) {
    await writeReportArtifacts(rootDir, outDir, record.report, writtenFiles, record.markdown, record.reportJsonPath, {
      trendAnnotations: trendValidation.value.annotations_by_date[record.report.report_date],
      reportNavigation: reportNavigationByDate.get(record.report.report_date),
      dateIndexItem: dateIndex.items.find((item) => item.date === record.report.report_date),
      trackingHistoryById: trackingHistoryByDate.get(record.report.report_date),
      fetchImpl: options.fetchImpl,
      siteUrl,
      includeInternalData: Boolean(options.includeInternalData)
    });
  }

  await writeJsonTracked(outDir, "feed.json", feedValidation.value, writtenFiles);
  await writeJsonTracked(outDir, "articles.json", articleValidation.value, writtenFiles);
  await writeJsonTracked(outDir, "trends.json", trendValidation.value, writtenFiles);
  await writeJsonTracked(outDir, "data/articles.json", articleValidation.value, writtenFiles);
  await writeJsonTracked(outDir, "data/today.json", frontendValidation.value.today, writtenFiles);
  await writeJsonTracked(outDir, "data/topics.json", frontendValidation.value.topics, writtenFiles);
  await writeJsonTracked(outDir, "data/sources.json", frontendValidation.value.sources, writtenFiles);
  await writeJsonTracked(outDir, "data/runtime.json", frontendValidation.value.runtime, writtenFiles);
  await writeJsonTracked(outDir, "data/official-blogs.json", officialBlogKnowledge, writtenFiles);
  await writeFileTracked(outDir, "official-blogs/index.html", renderOfficialBlogsHtml(officialBlogKnowledge, {
    styleHref: `../assets/style.css?v=${encodeURIComponent(indexStyleVersion)}`
  }), writtenFiles);
  await writeFileTracked(outDir, "ops.html", renderOpsIndexHtml(feedValidation.value, trendValidation.value, dateIndex, {
    styleVersion: indexStyleVersion,
    officialBlogKnowledge
  }), writtenFiles);
  await writeFileTracked(outDir, "index.html", renderIndexHtml(feedValidation.value, trendValidation.value, dateIndex, {
    styleVersion: indexStyleVersion,
    officialBlogKnowledge,
    articles: articleValidation.value
  }), writtenFiles);

  return {
    outDir,
    reports,
    feed: feedValidation.value,
    articles: articleValidation.value,
    frontendData,
    externalArticleSources,
    trends: trendValidation.value,
    officialBlogKnowledge,
    dateIndex,
    writtenFiles: uniqueSorted(writtenFiles)
  };
}

function validateFrontendData(frontendData) {
  const validators = {
    today: validateFrontendToday,
    topics: validateFrontendTopics,
    sources: validateFrontendSources,
    runtime: validateFrontendRuntime
  };
  const value = {};
  const errors = [];
  for (const [key, validate] of Object.entries(validators)) {
    const result = validate(frontendData[key]);
    if (!result.valid) {
      errors.push(...result.errors.map((error) => ({
        ...error,
        file: `data/${key}.json`
      })));
    }
    value[key] = result.value;
  }
  return {
    valid: errors.length === 0,
    value,
    errors
  };
}

function contentHash(value) {
  return createHash("sha256").update(String(value)).digest("hex").slice(0, 12);
}

export async function collectMarkdownFiles(inputDir) {
  try {
    const stat = await fs.stat(inputDir);
    if (!stat.isDirectory()) {
      return [];
    }
  } catch {
    return [];
  }

  const files = [];
  await walk(inputDir, files);
  return files.filter((file) => file.toLowerCase().endsWith(".md")).sort();
}

export async function collectJsonFiles(inputDir) {
  try {
    const stat = await fs.stat(inputDir);
    if (!stat.isDirectory()) {
      return [];
    }
  } catch {
    return [];
  }

  const files = [];
  await walk(inputDir, files);
  return files
    .filter((file) => file.toLowerCase().endsWith(".json"))
    .filter((file) => !file.toLowerCase().endsWith(".candidates.json"))
    .filter((file) => !REPORT_DATA_AUXILIARY_JSON.has(path.basename(file).toLowerCase()))
    .sort();
}

export async function planGeneratedFiles(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const inputDir = path.resolve(rootDir, options.inputDir || "reports-source");
  const dataInputDir = path.resolve(rootDir, options.dataInputDir || "reports-data");
  const outDir = path.resolve(rootDir, options.outDir || "docs");
  const siteUrl = options.siteUrl || DEFAULT_SITE.siteUrl;
  const generatedAt = options.generatedAt || defaultGeneratedAt();
  const markdownFiles = await collectMarkdownFiles(inputDir);
  const reportJsonFiles = await collectJsonFiles(dataInputDir);
  const files = [
    ".nojekyll",
    "assets/style.css",
    "feed.json",
    "articles.json",
    "index.html",
    "ops.html",
    "trends.json",
    "data/official-blogs.json",
    "official-blogs/index.html"
  ];
  const reports = [];

  for (const file of markdownFiles) {
    const markdown = await fs.readFile(file, "utf8");
    const report = parseDailyMarkdown(markdown, { siteUrl, generatedAt });
    const paths = reportRelativePaths(report.report_date);
    files.push(paths.markdownPath, paths.dataPath, paths.htmlPath);
    files.push(...reportManagedAssetPaths(report));
    reports.push(report);
  }

  for (const file of reportJsonFiles) {
    const report = await readReportJson(file);
    const paths = reportRelativePaths(report.report_date);
    files.push(paths.dataPath, paths.htmlPath);
    files.push(...reportManagedAssetPaths(report));
    if (options.includeInternalData && (report.candidate_pool_path || (await exists(candidatePoolPathForReportFile(file, report.report_date))))) {
      files.push(paths.candidateDataPath);
    }
    if (report.markdown_path) {
      files.push(report.markdown_path);
    }
    reports.push(report);
  }

  return {
    reports,
    files: uniqueSorted(files),
    absoluteFiles: uniqueSorted(files.map((file) => path.join(outDir, ...file.split("/"))))
  };
}

export function mergeFeed(existingFeed, reports, options = {}) {
  const siteTitle = options.siteTitle || existingFeed?.site_title || DEFAULT_SITE.title;
  const siteUrl = options.siteUrl || existingFeed?.site_url || DEFAULT_SITE.siteUrl;
  const byDate = new Map();

  for (const item of existingFeed?.reports || []) {
    byDate.set(item.report_date, item);
  }

  for (const report of reports) {
    const paths = reportRelativePaths(report.report_date);
    const entry = {
      report_date: report.report_date,
      title: report.title,
      summary: report.summary,
      url: paths.htmlPath,
      data_url: paths.dataPath,
      main_items: report.main_items.length,
      builder_observations: report.builder_observations.length,
      generated_at: report.generated_at
    };
    if (report.markdown_path) {
      entry.markdown_url = report.markdown_path;
    }
    byDate.set(report.report_date, entry);
  }

  const mergedReports = [...byDate.values()].sort((a, b) => b.report_date.localeCompare(a.report_date));
  const updatedAt =
    existingFeed?.updated_at && reportsAreEqual(existingFeed.reports || [], mergedReports)
      ? existingFeed.updated_at
      : options.updatedAt || defaultGeneratedAt();

  return {
    schema_version: 1,
    site_title: siteTitle,
    site_url: siteUrl,
    updated_at: updatedAt,
    reports: mergedReports
  };
}

export function buildArticleIndex(reports = [], options = {}) {
  const byUrl = new Map();
  const orderedReports = [...(Array.isArray(reports) ? reports : [])]
    .filter((report) => report?.report_date)
    .sort((a, b) => String(b.report_date || "").localeCompare(String(a.report_date || "")));

  for (const report of orderedReports) {
    for (const section of ARTICLE_SECTIONS) {
      const items = Array.isArray(report[section]) ? report[section] : [];
      for (const item of items) {
        const article = articleFromReportItem(report, section, item, options);
        if (!article) {
          continue;
        }
        const key = articleUrlKey(article.url);
        if (!key) {
          continue;
        }
        byUrl.set(key, byUrl.has(key) ? mergeArticleRecords(byUrl.get(key), article) : article);
      }
    }
  }

  for (const record of sourceWatchAdmittedCandidateRecords(options)) {
    const article = articleFromSourceWatchCandidate(record.candidate, record.reportDate);
    if (!article) {
      continue;
    }
    const key = articleUrlKey(article.url);
    if (!key) {
      continue;
    }
    byUrl.set(key, byUrl.has(key) ? mergeArticleRecords(byUrl.get(key), article) : article);
  }

  for (const article of externalArticleRecords(options)) {
    const key = articleUrlKey(article.url);
    if (!key) {
      continue;
    }
    byUrl.set(key, byUrl.has(key) ? mergeArticleRecords(byUrl.get(key), article) : article);
  }

  return [...byUrl.values()].sort((a, b) =>
    String(b.date).localeCompare(String(a.date)) ||
    Number(b.quality_score || 0) - Number(a.quality_score || 0) ||
    String(a.title).localeCompare(String(b.title), "zh-Hans-CN")
  );
}

export async function loadConfiguredExternalArticleSources(rootDir, options = {}) {
  if (Array.isArray(options.externalArticleSources)) {
    return options.externalArticleSources.map((source) => normalizeExternalArticleSource(source, options));
  }

  const targets = Array.isArray(options.externalArticleTargets)
    ? options.externalArticleTargets
    : await loadExternalArticleTargets(rootDir, options);
  if (targets.length === 0) {
    return [];
  }

  const fetchImpl = typeof options.fetchImpl === "function" ? options.fetchImpl : globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    return targets.map((target) => externalArticleSourceResult(target, {
      status: "blocked",
      generatedAt: options.generatedAt,
      reportDate: options.reportDate,
      articles: []
    }));
  }

  const sources = [];
  for (const target of targets) {
    const result = await fetchExternalArticleJson(fetchImpl, target.articles_url);
    const payload = result.ok ? externalArticlePayloadItems(result.payload) : [];
    const articles = payload
      .slice(0, EXTERNAL_ARTICLE_LIMIT_PER_SOURCE)
      .map((item, index) => externalArticleFromRecord(item, target, {
        index,
        reportDate: options.reportDate
      }))
      .filter(Boolean);
    sources.push(externalArticleSourceResult(target, {
      status: result.ok ? "checked" : "blocked",
      generatedAt: options.generatedAt,
      reportDate: options.reportDate,
      articles,
      httpStatus: result.status || 0
    }));
  }
  return sources;
}

async function loadExternalArticleTargets(rootDir, options = {}) {
  const configPath = path.resolve(rootDir, options.sourceWatchlistPath || path.join("config", "source-watchlist.json"));
  let payload;
  try {
    payload = JSON.parse(await fs.readFile(configPath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  }
  const rawTargets = Array.isArray(payload) ? payload : payload.targets;
  return (Array.isArray(rawTargets) ? rawTargets : [])
    .filter((target) => isHttpUrl(target?.articles_url))
    .map((target) => ({
      id: cleanArticleToken(target.id) || `external-${articleId(target.articles_url).replace(/^article-/, "")}`,
      name: cleanArticleText(target.name || target.url || target.articles_url),
      url: isHttpUrl(target.url) ? target.url : target.articles_url,
      articles_url: target.articles_url,
      source_kind: cleanArticleToken(target.content_kind) || "articles_json",
      authority: target.source_tier === "first_class" ? "first_class" : "watched",
      tier: cleanArticleToken(target.source_tier || target.tier) || "standard",
      source_lane: cleanArticleToken(target.source_lane || target.lane) || "",
      verification_policy: cleanArticleToken(target.verification_policy) || ""
    }));
}

function normalizeExternalArticleSource(source = {}, options = {}) {
  const target = {
    id: cleanArticleToken(source.id) || `external-${articleId(source.url || source.articles_url || source.name).replace(/^article-/, "")}`,
    name: cleanArticleText(source.name || "External Articles"),
    url: isHttpUrl(source.url) ? source.url : source.articles_url || "",
    articles_url: source.articles_url || source.url || "",
    source_kind: cleanArticleToken(source.source_kind) || "articles_json",
    authority: cleanArticleToken(source.authority) || "watched",
    tier: cleanArticleToken(source.tier) || "standard",
    source_lane: cleanArticleToken(source.source_lane) || "",
    verification_policy: cleanArticleToken(source.verification_policy) || ""
  };
  const articles = (Array.isArray(source.articles) ? source.articles : [])
    .map((item, index) => externalArticleFromRecord(item, target, {
      index,
      reportDate: options.reportDate || source.report_date
    }))
    .filter(Boolean);
  return externalArticleSourceResult(target, {
    status: source.status === "blocked" ? "blocked" : "checked",
    generatedAt: options.generatedAt || source.generated_at,
    reportDate: options.reportDate || source.report_date,
    articles
  });
}

function externalArticleSourceResult(target, details = {}) {
  return {
    id: target.id,
    name: target.name,
    url: target.url,
    articles_url: target.articles_url,
    source_kind: target.source_kind || "articles_json",
    authority: target.authority || "watched",
    tier: target.tier || "standard",
    source_lane: target.source_lane || "",
    verification_policy: target.verification_policy || "",
    status: details.status || "not_configured_or_skipped",
    checked_at: details.generatedAt || defaultGeneratedAt(),
    report_date: normalizeArticleDate(details.reportDate, defaultGeneratedAt()),
    http_status: details.httpStatus || 0,
    articles: details.articles || []
  };
}

async function fetchExternalArticleJson(fetchImpl, url) {
  try {
    const response = await fetchImpl(url, {
      headers: {
        accept: "application/json",
        "user-agent": "ai-daily-cn-static-publisher"
      }
    });
    if (!response.ok) {
      return { ok: false, status: response.status || 0, payload: null };
    }
    return { ok: true, status: response.status || 200, payload: await response.json() };
  } catch {
    return { ok: false, status: 0, payload: null };
  }
}

function externalArticlePayloadItems(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (Array.isArray(payload?.articles)) {
    return payload.articles;
  }
  if (Array.isArray(payload?.items)) {
    return payload.items;
  }
  return [];
}

function externalArticleRecords(options = {}) {
  return (Array.isArray(options.externalArticles) ? options.externalArticles : [])
    .map((article, index) => {
      if (!article || typeof article !== "object") {
        return null;
      }
      return isPublicArticleRecord(article)
        ? article
        : externalArticleFromRecord(article, { name: "External Articles", url: "" }, {
          index,
          reportDate: options.reportDate
        });
    })
    .filter(Boolean);
}

function isPublicArticleRecord(value) {
  return Boolean(
    value
    && typeof value === "object"
    && value.id
    && value.title
    && value.url
    && value.summary
    && value.date
    && value.section
    && value.report_date
    && value.report_url
    && value.data_url
  );
}

function externalArticleFromRecord(record, target, options = {}) {
  if (!record || typeof record !== "object") {
    return null;
  }
  const url = firstHttpUrl(record.url, record.canonical_url, record.link);
  if (!isHttpUrl(url)) {
    return null;
  }
  const title = cleanArticleText(record.title || record.name);
  const summary = cleanArticleText(record.summary || record.description || record.abstract);
  if (!title || !summary) {
    return null;
  }
  const date = normalizeArticleDate(record.date || record.event_date || record.published_at, options.reportDate || defaultGeneratedAt());
  if (!date) {
    return null;
  }
  const rawText = [
    title,
    summary,
    record.domain,
    ...(Array.isArray(record.flavors) ? record.flavors : []),
    ...(Array.isArray(record.channels_l1) ? record.channels_l1 : []),
    ...(Array.isArray(record.channels_l2) ? record.channels_l2 : [])
  ].filter(Boolean).join(" ");
  const taxonomy = classifyArticleTaxonomy("source_watch", rawText);
  const entities = extractArticleEntities(record, rawText);
  const domain = ARTICLE_DOMAIN_ORDER.includes(record.domain) ? record.domain : taxonomy.domain;
  const flavors = normalizeExternalFlavors(record.flavors, taxonomy.flavors);
  const channelsL1 = normalizeExternalChannels(record.channels_l1, taxonomy.channels_l1, domain);
  const channelsL2 = normalizeExternalChannels(record.channels_l2, taxonomy.channels_l2, defaultArticleChannelL2(domain));
  const reportDate = normalizeArticleDate(options.reportDate, date) || date;
  const paths = reportRelativePaths(reportDate);
  const score = clampInteger(record.quality_score, 0, 100, 80);
  return {
    id: articleId(url),
    title,
    url,
    summary,
    date,
    month: date.slice(0, 7),
    source: cleanArticleText(record.source || target.name || "AIFY"),
    section: "source_watch",
    report_date: reportDate,
    report_url: paths.htmlPath,
    data_url: paths.dataPath,
    quality_score: score,
    importance: score >= 88 ? "major" : score >= 72 ? "notable" : "general",
    domain,
    flavors,
    channels_l1: channelsL1,
    channels_l2: channelsL2,
    companies: uniqueSorted([...(Array.isArray(record.companies) ? record.companies : []), ...entities.companies]).slice(0, 8),
    products: uniqueSorted([...(Array.isArray(record.products) ? record.products : []), ...entities.products]).slice(0, 8)
  };
}

function normalizeExternalFlavors(values, fallback = []) {
  const mapped = (Array.isArray(values) ? values : [values])
    .map((value) => {
      const text = cleanArticleText(value);
      if (ARTICLE_FLAVORS.includes(text)) return text;
      if (/实战|实践|方法|用法/.test(text)) return "实战方法";
      if (/论文|研究/.test(text)) return "论文";
      if (/拆解|技术|工程/.test(text)) return "技术拆解";
      if (/商业|市场|洞察/.test(text)) return "商业洞察";
      if (/报告/.test(text)) return "报告";
      if (/观点|专访/.test(text)) return "观点专访";
      if (/快讯|新闻/.test(text)) return "快讯";
      return "";
    })
    .filter((value) => ARTICLE_FLAVORS.includes(value));
  const merged = uniqueSorted([...mapped, ...(Array.isArray(fallback) ? fallback : [])])
    .filter((value) => ARTICLE_FLAVORS.includes(value));
  return merged.length ? merged.slice(0, 3) : ["快讯"];
}

function normalizeExternalChannels(primary, fallback = [], domain = "") {
  const values = [
    ...(Array.isArray(primary) ? primary : [primary]),
    ...(Array.isArray(fallback) ? fallback : [fallback]),
    domain
  ]
    .map(cleanArticleText)
    .filter(Boolean);
  return uniqueSorted(values).slice(0, 5);
}

function cleanArticleToken(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9_:-]+/g, "_").replace(/^_+|_+$/g, "");
}

function clampInteger(value, min, max, fallback) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, number));
}

export function buildFrontendData(options = {}) {
  const articles = Array.isArray(options.articles) ? options.articles : [];
  const generatedAt = options.generatedAt || defaultGeneratedAt();
  const latestDate = latestArticleDate(articles) || options.feed?.reports?.[0]?.report_date || generatedAt.slice(0, 10);
  const aifyIds = new Set(
    (Array.isArray(options.externalArticleSources) ? options.externalArticleSources : [])
      .flatMap((source) => source.articles || [])
      .map((article) => article.id)
  );
  const topics = buildFrontendTopics(articles, generatedAt);
  const sources = buildFrontendSources(articles, options.externalArticleSources || [], generatedAt);
  const todayArticles = selectTodayArticles(articles, latestDate);
  const today = {
    schema_version: 1,
    generated_at: generatedAt,
    report_date: latestDate,
    title: "今日 AI 情报",
    summary: `基于 ${articles.length} 条公开资讯完成去重、精读和主题归类，默认展示最值得先看的信号。`,
    stats: {
      article_count: articles.length,
      source_count: sources.sources.length,
      topic_count: topics.topics.length,
      aify_count: articles.filter((article) => aifyIds.has(article.id)).length
    },
    top_article_ids: todayArticles.map((article) => article.id),
    articles: todayArticles,
    top_topics: topics.topics.slice(0, 8)
  };
  const runtime = buildFrontendRuntime({
    generatedAt,
    reportDate: latestDate,
    articles,
    today,
    topics,
    sources,
    externalArticleSources: options.externalArticleSources || []
  });
  return {
    today,
    topics,
    sources,
    runtime
  };
}

function latestArticleDate(articles) {
  return articles
    .map((article) => article.date)
    .filter(Boolean)
    .sort((a, b) => String(b).localeCompare(String(a)))[0] || "";
}

function selectTodayArticles(articles, latestDate) {
  const sameDay = articles.filter((article) => article.date === latestDate);
  const pool = sameDay.length >= 12 ? sameDay : articles.slice(0, 24);
  return pool
    .slice()
    .sort((a, b) =>
      articleImportanceRank(b.importance) - articleImportanceRank(a.importance)
      || Number(b.quality_score || 0) - Number(a.quality_score || 0)
      || String(b.date).localeCompare(String(a.date))
    )
    .slice(0, 18);
}

function buildFrontendTopics(articles, generatedAt = defaultGeneratedAt()) {
  const byLabel = new Map();
  for (const article of articles) {
    const labels = uniqueSorted([
      ...(article.channels_l1 || []),
      ...(article.channels_l2 || []),
      article.domain
    ].filter(Boolean)).slice(0, 4);
    for (const label of labels) {
      const id = topicId(label);
      const topic = byLabel.get(id) || {
        id,
        label,
        count: 0,
        article_ids: [],
        sources: [],
        latest_date: "",
        accent: topicAccent(byLabel.size)
      };
      topic.count += 1;
      topic.article_ids.push(article.id);
      topic.sources.push(article.source);
      topic.latest_date = [topic.latest_date, article.date].filter(Boolean).sort((a, b) => String(b).localeCompare(String(a)))[0] || "";
      byLabel.set(id, topic);
    }
  }
  return {
    schema_version: 1,
    generated_at: generatedAt,
    topics: [...byLabel.values()]
      .map((topic) => ({
        ...topic,
        article_ids: uniqueSorted(topic.article_ids).slice(0, 60),
        sources: uniqueSorted(topic.sources).slice(0, 8)
      }))
      .sort((a, b) => b.count - a.count || String(b.latest_date).localeCompare(String(a.latest_date)))
  };
}

function buildFrontendSources(articles, externalSources, generatedAt) {
  const bySource = new Map();
  for (const article of articles) {
    const id = topicId(article.source);
    const source = bySource.get(id) || {
      id,
      name: article.source,
      url: article.url,
      source_kind: "article_source",
      authority: "observed",
      tier: "standard",
      article_count: 0,
      latest_article_date: "",
      latest_article_ids: [],
      status: "checked"
    };
    source.article_count += 1;
    source.latest_article_ids.push(article.id);
    if (!source.latest_article_date || String(article.date).localeCompare(String(source.latest_article_date)) > 0) {
      source.latest_article_date = article.date;
      source.url = article.url;
    }
    bySource.set(id, source);
  }

  for (const externalSource of externalSources) {
    const id = externalSource.id || topicId(externalSource.name);
    bySource.set(id, {
      id,
      name: externalSource.name,
      url: externalSource.url,
      source_kind: externalSource.source_kind || "articles_json",
      authority: externalSource.authority || "watched",
      tier: externalSource.tier || "standard",
      article_count: externalSource.articles?.length || 0,
      latest_article_date: latestArticleDate(externalSource.articles || []),
      latest_article_ids: (externalSource.articles || []).slice(0, 8).map((article) => article.id),
      status: externalSource.status || "not_configured_or_skipped"
    });
  }

  return {
    schema_version: 1,
    generated_at: generatedAt,
    source_registry_version: 1,
    sources: [...bySource.values()]
      .map((source) => ({
        ...source,
        latest_article_ids: uniqueSorted(source.latest_article_ids).slice(0, 8)
      }))
      .sort((a, b) => Number(b.article_count || 0) - Number(a.article_count || 0) || String(a.name).localeCompare(String(b.name), "zh-Hans-CN"))
      .slice(0, 80)
  };
}

function buildFrontendRuntime(details) {
  const sourceInputs = details.externalArticleSources.map((source) => ({
    id: source.id,
    name: source.name,
    url: source.articles_url || source.url,
    status: source.status === "checked" ? "checked" : source.status === "blocked" ? "blocked" : "not_configured_or_skipped",
    article_count: source.articles?.length || 0
  }));
  const finalStatus = sourceInputs.some((source) => source.status === "blocked") ? "degraded" : "ready";
  return {
    schema_version: 1,
    generated_at: details.generatedAt,
    build_id: contentHash(`${details.generatedAt}:${details.articles.length}:${details.reportDate}`),
    mode: "static-react-github-pages",
    report_date: details.reportDate,
    final_status: finalStatus,
    artifacts: [
      frontendArtifact("data/articles.json", details.articles),
      frontendArtifact("data/today.json", details.today?.articles || []),
      frontendArtifact("data/topics.json", details.topics?.topics || []),
      frontendArtifact("data/sources.json", details.sources?.sources || [])
    ],
    source_inputs: sourceInputs
  };
}

function frontendArtifact(relativePath, value) {
  const payload = JSON.stringify(value || []);
  return {
    path: relativePath,
    count: Array.isArray(value) ? value.length : 0,
    hash: contentHash(payload)
  };
}

function topicId(value) {
  const text = cleanArticleText(value) || "topic";
  return `topic-${createHash("sha256").update(text).digest("hex").slice(0, 12)}`;
}

function topicAccent(index) {
  return ["cyan", "green", "pink", "orange", "purple"][index % 5];
}

async function loadSourceWatchAdmittedArtifacts(rootDir, options = {}) {
  const artifactPaths = sourceWatchAdmittedArtifactPaths(options.artifactPaths || options.artifactPath);
  if (artifactPaths.length === 0) {
    return [];
  }
  const artifacts = [];
  for (const artifactPath of artifactPaths) {
    const resolved = resolveSourceWatchAdmittedArtifactPath(rootDir, artifactPath);
    let payload;
    try {
      payload = JSON.parse(await fs.readFile(resolved, "utf8"));
    } catch (error) {
      throw new PublisherError("source_watch_admitted_artifact_read_failed", "Source Watch admitted artifact could not be read.", {
        path: artifactPath,
        error: error.message
      });
    }
    if (!payload || typeof payload !== "object" || payload.kind !== "source_watch_admitted_candidates") {
      throw new PublisherError("source_watch_admitted_artifact_invalid", "Source Watch admitted artifact must have kind source_watch_admitted_candidates.", {
        path: artifactPath
      });
    }
    if (payload.public_surface === true || payload.admission_audit?.public_surface === true) {
      throw new PublisherError("source_watch_admitted_artifact_public_surface_invalid", "Source Watch admitted artifact must remain an internal input before article publication.", {
        path: artifactPath
      });
    }
    artifacts.push(payload);
  }
  return artifacts;
}

function sourceWatchAdmittedArtifactPaths(value) {
  if (!value) {
    return [];
  }
  return (Array.isArray(value) ? value : [value])
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function resolveSourceWatchAdmittedArtifactPath(rootDir, value) {
  if (!String(value).toLowerCase().endsWith(".json")) {
    throw new PublisherError("source_watch_admitted_artifact_path_invalid", "Source Watch admitted artifact path must end with .json.", {
      path: value
    });
  }
  const allowedRoot = path.resolve(rootDir, ".tmp", "daily-codex-pipeline");
  const resolved = path.resolve(rootDir, value);
  const relative = path.relative(allowedRoot, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new PublisherError("source_watch_admitted_artifact_path_out_of_scope", "Source Watch admitted artifact path must stay under .tmp/daily-codex-pipeline.", {
      path: value,
      allowed_root: path.join(".tmp", "daily-codex-pipeline")
    });
  }
  return resolved;
}

function articleFromReportItem(report, section, item, options = {}) {
  if (!item || typeof item !== "object") {
    return null;
  }
  const url = articleItemUrl(section, item);
  if (!isHttpUrl(url)) {
    return null;
  }
  const title = articleItemTitle(section, item);
  const summary = articleItemSummary(section, item);
  const source = articleItemSource(section, item);
  if (!title || !summary || !source) {
    return null;
  }
  const date = normalizeArticleDate(item.event_date || item.date || report.report_date, report.report_date);
  const paths = reportRelativePaths(report.report_date);
  const importance = normalizeArticleImportance(item.importance || (section === "stories" ? item.importance : ""));
  const rawText = [
    section,
    title,
    summary,
    source,
    item.editorial_category,
    item.topic,
    item.trend,
    item.content_type,
    item.language,
    item.task,
    item.role,
    item.primary_entity,
    item.object,
    ...(Array.isArray(item.entities) ? item.entities : [])
  ].filter(Boolean).join(" ");
  const taxonomy = classifyArticleTaxonomy(section, rawText);
  const entities = extractArticleEntities(item, rawText);
  return {
    id: articleId(url),
    title,
    url,
    summary,
    date,
    month: date.slice(0, 7),
    source,
    section,
    report_date: report.report_date,
    report_url: paths.htmlPath,
    data_url: paths.dataPath,
    quality_score: scoreArticle(section, item, importance, summary),
    importance,
    domain: taxonomy.domain,
    flavors: taxonomy.flavors,
    channels_l1: taxonomy.channels_l1,
    channels_l2: taxonomy.channels_l2,
    companies: entities.companies,
    products: entities.products
  };
}

function sourceWatchAdmittedCandidateRecords(options = {}) {
  const records = [];
  for (const artifact of sourceWatchAdmittedArtifactList(options.sourceWatchAdmittedArtifacts)) {
    if (!artifact || typeof artifact !== "object" || artifact.kind !== "source_watch_admitted_candidates") {
      continue;
    }
    const reportDate = normalizeSourceWatchReportDate(artifact.report_date || options.sourceWatchReportDate || options.reportDate);
    if (!reportDate || !Array.isArray(artifact.candidates)) {
      continue;
    }
    for (const candidate of artifact.candidates) {
      records.push({ candidate, reportDate });
    }
  }

  const directReportDate = normalizeSourceWatchReportDate(options.sourceWatchReportDate || options.reportDate);
  if (Array.isArray(options.sourceWatchAdmittedCandidates)) {
    for (const candidate of options.sourceWatchAdmittedCandidates) {
      const reportDate = normalizeSourceWatchReportDate(candidate?.report_date) || directReportDate;
      if (!reportDate) {
        continue;
      }
      records.push({
        candidate,
        reportDate
      });
    }
  }

  return records;
}

function sourceWatchAdmittedArtifactList(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (value && typeof value === "object") {
    return [value];
  }
  return [];
}

function articleFromSourceWatchCandidate(candidate, reportDate) {
  if (!candidate || typeof candidate !== "object" || candidate.decision !== "admitted") {
    return null;
  }
  const url = firstHttpUrl(candidate.url, candidate.canonical_url);
  if (!isHttpUrl(url)) {
    return null;
  }
  const title = cleanArticleText(candidate.title || candidate.repo || url);
  const source = sourceWatchArticleSource(candidate, title);
  const summary = sourceWatchArticleSummary(candidate, title);
  if (!title || !source || !summary) {
    return null;
  }

  const date = normalizeArticleDate(candidate.event_date || reportDate, reportDate);
  if (!date) {
    return null;
  }
  const paths = reportRelativePaths(reportDate);
  const importance = sourceWatchArticleImportance(candidate);
  const rawText = [
    "source_watch",
    title,
    summary,
    source,
    candidate.editorial_category,
    candidate.category,
    candidate.signal,
    candidate.repo,
    ...(Array.isArray(candidate.tags) ? candidate.tags : [])
  ].filter(Boolean).join(" ");
  const taxonomy = classifyArticleTaxonomy("source_watch", rawText);
  const entities = extractArticleEntities(candidate, rawText);

  return {
    id: articleId(url),
    title,
    url,
    summary,
    date,
    month: date.slice(0, 7),
    source,
    section: "source_watch",
    report_date: reportDate,
    report_url: paths.htmlPath,
    data_url: paths.dataPath,
    quality_score: sourceWatchArticleQualityScore(candidate),
    importance,
    domain: taxonomy.domain,
    flavors: taxonomy.flavors,
    channels_l1: taxonomy.channels_l1,
    channels_l2: taxonomy.channels_l2,
    companies: entities.companies,
    products: entities.products
  };
}

function sourceWatchArticleSource(candidate, title) {
  if (candidate.source_tier === "first_class" && title) {
    return title;
  }
  const source = cleanArticleText(candidate.source);
  if (source) {
    return source;
  }
  const repo = cleanArticleText(candidate.repo);
  if (repo) {
    return `GitHub repo watch: ${repo}`;
  }
  return title || "Source Watch";
}

function sourceWatchArticleSummary(candidate, title) {
  const template = candidate.summary_template && typeof candidate.summary_template === "object" && !Array.isArray(candidate.summary_template)
    ? candidate.summary_template
    : null;
  const summaryFromTemplate = cleanArticleText([
    publicSourceWatchTemplatePurpose(template?.purpose),
    publicSourceWatchTemplateChange(template?.change),
    publicSourceWatchTemplateEvidence(template?.evidence)
  ].filter(Boolean).join(" "));
  if (summaryFromTemplate) {
    return summaryFromTemplate;
  }
  if (candidate.source_tier === "first_class" || candidate.source_lane === "aify") {
    return cleanArticleText(`${title} is tracked as a first-class AI news source for the public article library.`);
  }
  const repo = cleanArticleText(candidate.repo || title);
  if (candidate.signal === "github_watch" && repo) {
    return `${repo} is tracked as a Source Watch repository signal with public project, release, and update evidence.`;
  }
  return `${title} is tracked as a Source Watch signal for the public article library.`;
}

function publicSourceWatchTemplatePurpose(value) {
  return stripSourceWatchInternalTokens(value);
}

function publicSourceWatchTemplateChange(value) {
  const text = cleanArticleText(value);
  if (!text) {
    return "";
  }
  if (/historical snapshot changed/i.test(text)) {
    const changed = [];
    if (/(?:commit|pushed_at)/i.test(text)) changed.push("recent repository activity");
    if (/(?:release|tag)/i.test(text)) changed.push("release or tag metadata");
    if (/(?:stars_delta|forks_delta|stars|forks)/i.test(text)) changed.push("community metrics");
    return changed.length > 0
      ? `Public repository signals changed across ${changed.join(", ")}.`
      : "Public repository signals changed since the previous local snapshot.";
  }
  if (/new source watch repository/i.test(text)) {
    return "Newly tracked source repository without prior local history.";
  }
  if (/unchanged|suppress/i.test(text)) {
    return "";
  }
  return stripSourceWatchInternalTokens(text);
}

function publicSourceWatchTemplateEvidence(value) {
  const fields = sourceWatchEvidenceFields(value);
  const parts = [];
  const stars = fields.get("stars");
  const forks = fields.get("forks");
  if (stars && forks) {
    parts.push(`GitHub metadata shows ${stars} stars and ${forks} forks.`);
  } else if (stars) {
    parts.push(`GitHub metadata shows ${stars} stars.`);
  } else if (forks) {
    parts.push(`GitHub metadata shows ${forks} forks.`);
  }
  if (fields.get("latest_release")) {
    parts.push(`Latest release metadata is ${cleanArticleText(fields.get("latest_release"))}.`);
  }
  if (fields.get("latest_tag")) {
    parts.push(`Latest tag metadata is ${cleanArticleText(fields.get("latest_tag"))}.`);
  }
  if (fields.get("latest_commit")) {
    parts.push("Recent commit activity is present.");
  }
  if (fields.get("pushed_at")) {
    parts.push(`Repository push activity is dated ${cleanArticleText(String(fields.get("pushed_at")).slice(0, 10))}.`);
  }
  if (parts.length > 0) {
    return parts.join(" ");
  }
  return stripSourceWatchInternalTokens(value);
}

function sourceWatchEvidenceFields(value) {
  const fields = new Map();
  for (const part of String(value || "").split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    const key = String(rawKey || "").trim().toLowerCase();
    const fieldValue = cleanArticleText(rawValue.join("="));
    if (key && fieldValue) {
      fields.set(key, fieldValue);
    }
  }
  return fields;
}

function stripSourceWatchInternalTokens(value) {
  return cleanArticleText(String(value || "")
    .replace(/\b(?:latest_commit|latest_release|latest_tag|pushed_at|stars_delta|forks_delta|repo_delta|freshness|source_lane|source_tier|verification_policy|verification_status)\s*=\s*[^;,\s]+/gi, "")
    .replace(/\b(?:latest_commit|latest_release|latest_tag|pushed_at|stars_delta|forks_delta|repo_delta|freshness|source_lane|source_tier|verification_policy|verification_status)\b/gi, "")
    .replace(/\bHistorical snapshot changed\s*:\s*/gi, "Public repository signals changed: ")
    .replace(/\s*;\s*/g, "; ")
    .replace(/\s+([.;,])/g, "$1")
    .replace(/(?:;\s*){2,}/g, "; "));
}

function sourceWatchArticleImportance(candidate) {
  if (candidate.importance) {
    return normalizeArticleImportance(candidate.importance);
  }
  const score = sourceWatchArticleQualityScore(candidate);
  if (score >= 90) return "major";
  if (score >= 75) return "notable";
  return "general";
}

function sourceWatchArticleQualityScore(candidate) {
  const score = Number(candidate.quality_score);
  if (Number.isFinite(score)) {
    return Math.max(0, Math.min(100, Math.round(score)));
  }
  return ARTICLE_SECTION_BASE_SCORE.source_watch;
}

function normalizeSourceWatchReportDate(value) {
  const date = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
}

function firstHttpUrl(...values) {
  return values.find((value) => isHttpUrl(value)) || "";
}

function articleItemUrl(section, item) {
  if (section === "stories") {
    return item.sources?.find((source) => isHttpUrl(source?.url))?.url || item.url || "";
  }
  return item.url || item.html_url || item.source_url || "";
}

function articleItemTitle(section, item) {
  if (section === "stories") {
    return cleanArticleText(item.object || item.title);
  }
  if (section === "builder_observations") {
    const author = cleanArticleText(item.author || item.handle || "Builder");
    const text = cleanArticleText(item.original_text || item.content || item.translation || "");
    return `${author}: ${truncateArticleText(text, 42)}`;
  }
  if (section === "daily_tracking") {
    return cleanArticleText(item.name || item.title);
  }
  if (section === "projects" || section === "github_trending" || section === "huggingface_trending") {
    return cleanArticleText(item.name || item.repo || item.title);
  }
  return cleanArticleText(item.title || item.name);
}

function articleItemSummary(section, item) {
  if (section === "stories") {
    return cleanArticleText([item.what_happened, item.why_it_matters].filter(Boolean).join(" "));
  }
  if (section === "github_trending" || section === "huggingface_trending" || section === "projects") {
    return cleanArticleText(item.readme_summary || item.description || item.summary || item.evidence);
  }
  if (section === "builder_observations") {
    return cleanArticleText(item.original_text || item.content || item.translation);
  }
  if (section === "daily_tracking") {
    return cleanArticleText(item.summary || item.change_summary || firstString(item.watch_points) || item.evidence);
  }
  if (section === "community_leads") {
    return cleanArticleText(item.content || item.summary);
  }
  return cleanArticleText(item.summary || item.content || item.description || item.evidence);
}

function articleItemSource(section, item) {
  if (section === "stories") {
    return cleanArticleText(item.sources?.[0]?.label || item.primary_entity || item.source || "AI Daily");
  }
  if (section === "hot_blogs") {
    return cleanArticleText(item.publisher || item.source || item.author || "Blog");
  }
  if (section === "builder_observations") {
    return cleanArticleText(item.author || item.handle || item.source || "Builder/X");
  }
  return cleanArticleText(item.source || item.publisher || item.author || item.repo || item.name || "AI Daily");
}

function classifyArticleTaxonomy(section, textValue) {
  const text = String(textValue || "");
  const lower = text.toLowerCase();
  let domain = "行业动态与政策地缘";
  const flavors = new Set();
  const channelsL1 = new Set();
  const channelsL2 = new Set();

  if (/(?:\b(?:video|image|audio|multimodal|vision|3d|robot|embodied)\b|多模态|视频|图像|语音|具身|机器人)/i.test(text)) {
    domain = "多模态与具身等前沿";
    channelsL1.add("多模态 AI");
    channelsL2.add(/(?:\b(?:robot|embodied)\b|具身|机器人)/i.test(text) ? "具身智能" : "多模态生成");
  } else if (/(?:\b(?:github|repo|open source|oss|cuda|kernel|inference|vector|rag|sdk|api|developer|benchmark|eval)\b|开源|推理|向量|检索|开发者|基准|评测|算力)/i.test(text)) {
    domain = "基础模型与算力技术栈";
    channelsL1.add(/(?:\b(?:inference|cuda|gpu|nvidia)\b|推理|算力)/i.test(text) ? "AI 算力与推理服务" : "AI 工程栈");
    channelsL2.add(/(?:\b(?:rag|vector)\b|检索|向量)/i.test(text) ? "RAG 与检索" : "开发者工具");
  } else if (/(?:\b(?:enterprise|business|cost|pricing|adoption|governance|organization|frontier company)\b|企业|组织|治理|成本|预算|商业|落地|采纳)/i.test(text)) {
    domain = "企业落地与业务应用";
    channelsL1.add("企业 AI 采纳");
    channelsL2.add(/(?:\b(?:cost|pricing)\b|成本|预算)/i.test(text) ? "成本与用量治理" : "企业治理与落地");
  } else if (/(?:\b(?:workflow|playbook|practice|method|guide|how to|skill|agent workflow)\b|实践|方法|教程|工作流|经验)/i.test(text)) {
    domain = "AI 用法与实践方法";
    channelsL1.add("AI 实践方法");
    channelsL2.add("Agent 工作流");
  } else if (/(?:\b(?:product|tool|app|assistant|copilot|codex|plugin)\b|产品|工具|助手|应用)/i.test(text)) {
    domain = "AI 产品与应用工具";
    channelsL1.add(/(?:\b(?:agent|assistant|copilot|codex)\b|助手|智能体)/i.test(text) ? "AI 助手与 Agent" : "工作场景 AI 软件");
    channelsL2.add(/(?:\b(?:code|coding|codex|copilot)\b|编程|代码)/i.test(text) ? "AI 编程" : "AI 应用工具");
  }

  if (/(?:\b(?:policy|regulation|law|geopolitic)\b|safety rule|监管|政策|地缘|法规)/i.test(text)) {
    domain = "行业动态与政策地缘";
    channelsL1.add("AI 政策与地缘");
    channelsL2.add("监管与政策");
  }

  if (/(?:\b(?:agent|copilot|codex|assistant)\b|智能体|助手)/i.test(text)) {
    channelsL1.add("AI 助手与 Agent");
    channelsL2.add(/(?:\b(?:code|coding|codex|copilot)\b|编程|代码)/i.test(text) ? "AI 编程" : "Agent 产品");
  }
  if (/(?:\b(?:model|llm|gpt|claude|gemini|llama|qwen|deepseek)\b|模型|大模型|基础模型)/i.test(text)) {
    channelsL1.add("基础模型");
    channelsL2.add("模型能力");
  }
  if (/(?:\b(?:market|funding|startup|revenue)\b|融资|市场|收入|公司动态)/i.test(text)) {
    channelsL1.add("AI 市场动态");
    channelsL2.add("市场与商业化");
  }

  if (/(?:\b(?:paper|arxiv|research)\b|论文|研究)/i.test(text)) {
    flavors.add("论文");
  }
  if (/(?:\b(?:report|whitepaper|survey)\b|报告|白皮书|调研)/i.test(text)) {
    flavors.add("报告");
  }
  if (section === "builder_observations" || /(?:\b(?:interview|podcast|opinion)\b|观点|访谈|播客)/i.test(text)) {
    flavors.add("观点专访");
  }
  if (section === "hot_blogs" || /(?:\b(?:deep dive|analysis|benchmark|eval)\b|拆解|解析|架构|调优|内核)/i.test(text)) {
    flavors.add("技术拆解");
  }
  if (/(?:\b(?:workflow|practice|guide|how to|playbook)\b|方法|实践|教程|工作流)/i.test(text)) {
    flavors.add("实战方法");
  }
  if (/(?:\b(?:business|market|enterprise|cost|pricing|adoption)\b|商业|市场|企业|成本|治理)/i.test(text)) {
    flavors.add("商业洞察");
  }
  if (flavors.size === 0 || section === "github_trending" || section === "huggingface_trending" || section === "daily_tracking") {
    flavors.add("快讯");
  }

  if (channelsL1.size === 0) {
    channelsL1.add(domain === "行业动态与政策地缘" ? "AI 市场动态" : "AI 工程栈");
  }
  if (channelsL2.size === 0) {
    channelsL2.add(defaultArticleChannelL2(domain));
  }

  return {
    domain: ARTICLE_DOMAIN_ORDER.includes(domain) ? domain : ARTICLE_DOMAIN_ORDER[0],
    flavors: orderedKnownValues(flavors, ARTICLE_FLAVORS),
    channels_l1: uniqueSorted([...channelsL1]),
    channels_l2: uniqueSorted([...channelsL2])
  };
}

function defaultArticleChannelL2(domain) {
  if (domain === "AI 产品与应用工具") return "AI 应用工具";
  if (domain === "AI 用法与实践方法") return "实践方法";
  if (domain === "企业落地与业务应用") return "企业落地";
  if (domain === "行业动态与政策地缘") return "行业动态";
  if (domain === "多模态与具身等前沿") return "多模态生成";
  return "开发者工具";
}

function scoreArticle(section, item = {}, importance, summary) {
  let score = ARTICLE_SECTION_BASE_SCORE[section] ?? 60;
  if (importance === "major") score += 8;
  if (importance === "notable") score += 4;
  if (String(item.evidence_level || "").toLowerCase() === "primary") score += 4;
  if (String(item.evidence_level || "").toLowerCase() === "multi_source") score += 3;
  if (String(item.tier || "").toUpperCase() === "T0") score += 4;
  if (String(item.tier || "").toUpperCase() === "T1") score += 2;
  if (String(item.source_level || "").toUpperCase() === "T0") score += 3;
  if (String(item.verification_status || "").toLowerCase() === "verified") score += 3;
  if (String(summary || "").length >= 120) score += 2;
  if (section === "community_leads") score -= 4;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function extractArticleEntities(item = {}, textValue = "") {
  const text = String(textValue || "");
  const companies = new Set();
  const products = new Set();
  const entityValues = Array.isArray(item.entities) ? item.entities : [];
  for (const entity of entityValues) {
    const value = cleanArticleText(entity);
    if (!value || /^https?:\/\//i.test(value) || value.includes("/")) {
      continue;
    }
    if (matchesKnown(value, KNOWN_AI_PRODUCTS)) {
      products.add(canonicalKnown(value, KNOWN_AI_PRODUCTS));
    } else if (matchesKnown(value, KNOWN_AI_COMPANIES)) {
      companies.add(canonicalKnown(value, KNOWN_AI_COMPANIES));
    }
  }
  for (const company of KNOWN_AI_COMPANIES) {
    if (new RegExp(escapeRegExp(company), "i").test(text)) {
      companies.add(company);
    }
  }
  for (const product of KNOWN_AI_PRODUCTS) {
    if (new RegExp(escapeRegExp(product), "i").test(text)) {
      products.add(product);
    }
  }
  const repo = cleanArticleText(item.repo || item.name || "");
  const repoOwner = repo.includes("/") ? repo.split("/")[0] : "";
  if (repoOwner) {
    const ownerCompany = canonicalKnown(repoOwner, KNOWN_AI_COMPANIES);
    if (ownerCompany) {
      companies.add(ownerCompany);
    }
  }
  return {
    companies: uniqueSorted([...companies]),
    products: uniqueSorted([...products])
  };
}

function mergeArticleRecords(existing, incoming) {
  return {
    ...existing,
    quality_score: Math.max(existing.quality_score, incoming.quality_score),
    importance: articleImportanceRank(incoming.importance) > articleImportanceRank(existing.importance)
      ? incoming.importance
      : existing.importance,
    flavors: uniqueSorted([...existing.flavors, ...incoming.flavors]),
    channels_l1: uniqueSorted([...existing.channels_l1, ...incoming.channels_l1]),
    channels_l2: uniqueSorted([...existing.channels_l2, ...incoming.channels_l2]),
    companies: uniqueSorted([...existing.companies, ...incoming.companies]),
    products: uniqueSorted([...existing.products, ...incoming.products])
  };
}

function articleImportanceRank(value) {
  if (value === "major") return 3;
  if (value === "notable") return 2;
  return 1;
}

function normalizeArticleImportance(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "major" || normalized === "high") return "major";
  if (normalized === "notable" || normalized === "medium") return "notable";
  return "general";
}

function normalizeArticleDate(value, fallback) {
  const candidate = String(value || "").slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(candidate)) {
    return candidate;
  }
  return String(fallback || "").slice(0, 10);
}

function articleUrlKey(value) {
  try {
    const url = new URL(String(value || ""));
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|igshid$|mc_cid$|mc_eid$)/i.test(key)) {
        url.searchParams.delete(key);
      }
    }
    url.hostname = url.hostname.toLowerCase();
    if (url.pathname.length > 1) {
      url.pathname = url.pathname.replace(/\/+$/, "");
    }
    return url.toString();
  } catch {
    return "";
  }
}

function articleId(url) {
  return `article-${createHash("sha256").update(articleUrlKey(url) || String(url)).digest("hex").slice(0, 16)}`;
}

function cleanArticleText(value) {
  return String(value || "")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateArticleText(value, maxLength) {
  const text = cleanArticleText(value);
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function firstString(values) {
  return (Array.isArray(values) ? values : []).find((value) => typeof value === "string" && value.trim());
}

function isHttpUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function orderedKnownValues(values, order) {
  const set = new Set(values);
  const ordered = order.filter((value) => set.has(value));
  for (const value of set) {
    if (!ordered.includes(value)) {
      ordered.push(value);
    }
  }
  return ordered;
}

function matchesKnown(value, knownValues) {
  return Boolean(canonicalKnown(value, knownValues));
}

function canonicalKnown(value, knownValues) {
  const normalized = String(value || "").toLowerCase();
  return knownValues.find((known) => known.toLowerCase() === normalized || normalized.includes(known.toLowerCase())) || "";
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function buildDateIndex(feed = {}, reports = [], trends = null) {
  const feedReports = Array.isArray(feed.reports) ? feed.reports : [];
  const reportByDate = new Map(
    (Array.isArray(reports) ? reports : [])
      .filter((report) => report?.report_date)
      .map((report) => [report.report_date, report])
  );
  const topicByDate = topicLookupByDate(trends);
  const items = [...feedReports]
    .sort((a, b) => String(a.report_date || "").localeCompare(String(b.report_date || "")))
    .map((feedReport) => {
      const report = reportByDate.get(feedReport.report_date) || {};
      const metrics = dateSignalMetrics(feedReport, report);
      const strength = deriveDateSignalStrength(metrics);
      const mainStream = publicMainStreamStatus(metrics);
      const quality = publicDateQuality(report.quality_status);
      const topTopic = topicByDate.get(feedReport.report_date) || null;
      return {
        date: feedReport.report_date,
        weekday: weekdayLabel(feedReport.report_date),
        month: monthKey(feedReport.report_date),
        title: String(feedReport.title || ""),
        summary: String(feedReport.summary || ""),
        url: feedReport.url,
        data_url: feedReport.data_url,
        metrics,
        strength,
        main_stream: mainStream,
        quality,
        top_topic: topTopic,
        highlights: dateHighlights(report, feedReport),
        flags: {
          main_stream_target_met: mainStream.status === "target",
          has_github: metrics.github_trending_count > 0,
          has_builder: metrics.builder_observations_count > 0,
          has_tracking: metrics.daily_tracking_count > 0,
          has_degraded: quality.status === "degraded" || quality.status === "blocked"
        },
        visual: {
          strength_channel: strength.level,
          quality_channel: quality.status,
          intensity: strength.intensity
        }
      };
    });
  const totals = items.reduce((acc, item) => {
    acc.report_count += 1;
    acc.strong_days += item.strength.level === "strong" ? 1 : 0;
    acc.degraded_days += item.quality.status === "degraded" || item.quality.status === "blocked" ? 1 : 0;
    acc.main_items += item.metrics.main_items_count;
    acc.github_trending += item.metrics.github_trending_count;
    acc.builder_observations += item.metrics.builder_observations_count;
    acc.hot_blogs += item.metrics.hot_blogs_count;
    acc.daily_tracking += item.metrics.daily_tracking_count;
    return acc;
  }, {
    report_count: 0,
    strong_days: 0,
    degraded_days: 0,
    main_items: 0,
    github_trending: 0,
    builder_observations: 0,
    hot_blogs: 0,
    daily_tracking: 0
  });

  return {
    generated_at: feed.updated_at || defaultGeneratedAt(),
    date_from: items[0]?.date || "",
    date_to: items.at(-1)?.date || "",
    window_days: items.length,
    totals,
    filters: {
      months: uniqueSorted(items.map((item) => item.month).filter(Boolean)),
      strength_levels: uniqueSorted(items.map((item) => item.strength.level)),
      quality_statuses: uniqueSorted(items.map((item) => item.quality.status))
    },
    items
  };
}

function publicMainStreamStatus(metrics = {}) {
  const count = Number(metrics.main_items_count || 0);
  const targetMin = 1;
  const targetMax = 12;
  if (count >= targetMin && count <= targetMax) {
    return {
      status: "target",
      label: "主体达标",
      count,
      target_min: targetMin,
      target_max: targetMax
    };
  }
  if (count > targetMax) {
    return {
      status: "oversized",
      label: "主体过量",
      count,
      target_min: targetMin,
      target_max: targetMax
    };
  }
  if (count > 0) {
    return {
      status: "sparse",
      label: "主体偏少",
      count,
      target_min: targetMin,
      target_max: targetMax
    };
  }
  return {
    status: "empty",
    label: "主体为空",
    count,
    target_min: targetMin,
    target_max: targetMax
  };
}

export function deriveDateSignalStrength(metrics = {}) {
  const reasons = [];
  let score = 0;
  const addReason = (condition, points, id, label, value) => {
    if (!condition) return;
    score += points;
    reasons.push({ id, label, value });
  };

  addReason(metrics.main_items_count >= 5, 3, "main_items_target", "主体信号达到目标", metrics.main_items_count);
  addReason(metrics.main_items_count >= 3 && metrics.main_items_count < 5, 2, "main_items_sparse", "主体信号偏少", metrics.main_items_count);
  addReason(metrics.main_items_count > 0 && metrics.main_items_count < 3, 1, "main_items_present", "主体信号存在", metrics.main_items_count);
  addReason(metrics.major_count >= 3, 3, "major_items_high", "重大/高亮信号较多", metrics.major_count);
  addReason(metrics.major_count > 0 && metrics.major_count < 3, 1, "major_items_present", "存在高亮信号", metrics.major_count);
  addReason(metrics.github_trending_count >= 10, 2, "github_full", "GitHub Top 10 完整", metrics.github_trending_count);
  addReason(metrics.github_trending_count > 0 && metrics.github_trending_count < 10, 1, "github_present", "GitHub 信号存在", metrics.github_trending_count);
  addReason(metrics.builder_observations_count >= 8, 2, "builder_dense", "Builder 观察密集", metrics.builder_observations_count);
  addReason(metrics.builder_observations_count > 0 && metrics.builder_observations_count < 8, 1, "builder_present", "Builder 观察存在", metrics.builder_observations_count);
  addReason(metrics.hot_blogs_count >= 4, 1, "hot_blogs_dense", "深读内容充足", metrics.hot_blogs_count);
  addReason(metrics.daily_tracking_count > 0, 1, "tracking_present", "追踪榜单有变化", metrics.daily_tracking_count);
  addReason(metrics.section_coverage_count >= 5, 2, "coverage_broad", "覆盖板块较全", metrics.section_coverage_count);
  addReason(metrics.section_coverage_count >= 3 && metrics.section_coverage_count < 5, 1, "coverage_medium", "覆盖板块中等", metrics.section_coverage_count);
  addReason(metrics.evidence_assets_count > 0, 1, "evidence_present", "存在公开证据资产", metrics.evidence_assets_count);

  const level = score >= 8 ? "strong" : score >= 4 ? "medium" : "quiet";
  const label = level === "strong" ? "强信号" : level === "medium" ? "中等信号" : "低噪/观察";
  return {
    level,
    label,
    score,
    intensity: Math.max(1, Math.min(5, Math.ceil(score / 2))),
    reasons
  };
}

function buildReportNavigation(feedReports = [], dateIndexItems = []) {
  const ordered = [...(Array.isArray(feedReports) ? feedReports : [])]
    .sort((a, b) => String(a.report_date || "").localeCompare(String(b.report_date || "")));
  const dateIndexByDate = new Map(dateIndexItems.map((item) => [item.date, item]));
  return new Map(ordered.map((report, index) => [report.report_date, {
    previous: ordered[index - 1] || null,
    next: ordered[index + 1] || null,
    index_url: "index.html",
    dateIndexItem: dateIndexByDate.get(report.report_date) || null
  }]));
}

function topicLookupByDate(trends) {
  const byDate = new Map();
  const topics = Array.isArray(trends?.topics) ? trends.topics : [];
  const sortedTopics = [...topics].sort((a, b) => {
    const statusRank = { hot: 3, active: 2, watching: 1 };
    return (statusRank[b.status] || 0) - (statusRank[a.status] || 0) ||
      Number(b.occurrences || 0) - Number(a.occurrences || 0);
  });
  for (const topic of sortedTopics) {
    const dates = new Set([
      ...(Array.isArray(topic.dates) ? topic.dates : []),
      ...(Array.isArray(topic.related_reports) ? topic.related_reports : [])
    ]);
    for (const date of dates) {
      if (!byDate.has(date)) {
        byDate.set(date, {
          id: topic.id,
          label: topic.label,
          status: topic.status,
          occurrences: Number(topic.occurrences || 0),
          active_days: Number(topic.active_days || 0)
        });
      }
    }
  }
  return byDate;
}

function dateSignalMetrics(feedReport = {}, report = {}) {
  const surfaceDietEnabled = isPublicSurfaceDietEnabled(report);
  const stories = arrayValue(report.stories);
  const mainItems = arrayValue(report.main_items);
  const modelReleases = arrayValue(report.model_releases);
  const hotBlogs = arrayValue(report.hot_blogs);
  const dailyTracking = arrayValue(report.daily_tracking).filter((item) => item?.publish_to_public !== false);
  const githubTrending = arrayValue(report.github_trending);
  const huggingFaceTrending = arrayValue(report.huggingface_trending);
  const builderObservations = arrayValue(report.builder_observations);
  const communityLeads = surfaceDietEnabled ? arrayValue(report.community_leads).filter(isPublicCommunityHotspotItem) : [];
  const evidenceAssets = arrayValue(report.evidence_assets);
  const platformItems = surfaceDietEnabled
    ? []
    : [
      ...arrayValue(report.wechat_items),
      ...arrayValue(report.zhihu_items),
      ...arrayValue(report.reddit_items)
    ];
  const mainItemsCount = stories.length > 0 ? stories.length : mainItems.length > 0 ? mainItems.length : Number(feedReport.main_items || 0);
  const builderCount = builderObservations.length > 0 ? builderObservations.length : Number(feedReport.builder_observations || 0);
  const sectionCounts = [
    mainItemsCount,
    modelReleases.length,
    hotBlogs.length,
    dailyTracking.length,
    githubTrending.length,
    huggingFaceTrending.length,
    builderCount,
    communityLeads.length,
    platformItems.length
  ];

  return {
    main_items_count: mainItemsCount,
    major_count: countMajorItems([
      ...mainItems,
      ...modelReleases,
      ...hotBlogs,
      ...dailyTracking
    ]),
    model_releases_count: modelReleases.length,
    hot_blogs_count: hotBlogs.length,
    daily_tracking_count: dailyTracking.length,
    github_trending_count: githubTrending.length,
    huggingface_trending_count: huggingFaceTrending.length,
    builder_observations_count: builderCount,
    community_leads_count: communityLeads.length,
    platform_items_count: platformItems.length,
    evidence_assets_count: evidenceAssets.length,
    section_coverage_count: sectionCounts.filter((count) => count > 0).length
  };
}

function publicDateQuality(status = {}) {
  const value = status && typeof status === "object" ? status : {};
  const publicStatus = publicQualityStatus(value, { retiredPlatformMode: "remove" }) || {};
  const rawStatus = String(publicStatus.status || value.status || "ok").toLowerCase();
  const normalizedStatus = ["ok", "degraded", "blocked"].includes(rawStatus) ? rawStatus : "ok";
  return {
    status: normalizedStatus,
    label: normalizedStatus === "blocked" ? "阻断" : normalizedStatus === "degraded" ? "降级" : "正常",
    public_note: String(publicStatus.public_note || "").trim(),
    affected_sections: arrayValue(publicStatus.affected_sections)
  };
}

function dateHighlights(report = {}, feedReport = {}) {
  const mainHighlights = arrayValue(report.main_items)
    .filter((item) => item?.title && item?.url)
    .slice(0, 3)
    .map((item) => ({
      title: String(item.title || ""),
      url: String(item.url || ""),
      reason: String(item.summary || item.source || "").trim()
    }));
  if (mainHighlights.length > 0) {
    return mainHighlights;
  }
  const heroHighlights = arrayValue(report.hero_highlights)
    .filter((item) => item?.title && item?.url)
    .slice(0, 3)
    .map((item) => ({
      title: String(item.title || ""),
      url: String(item.url || ""),
      reason: String(item.reason || "").trim()
    }));
  if (heroHighlights.length > 0) {
    return heroHighlights;
  }
  return [{
    title: String(feedReport.title || feedReport.report_date || ""),
    url: String(feedReport.url || ""),
    reason: String(feedReport.summary || "").trim()
  }].filter((item) => item.title && item.url);
}

function countMajorItems(items) {
  return items.filter((item) => {
    const importance = String(item?.importance || "").toLowerCase();
    return importance === "major" || importance === "critical";
  }).length;
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function publicReportWithoutRemovedSources(report) {
  if (!report || typeof report !== "object") {
    return report;
  }
  const surfaceDietEnabled = isPublicSurfaceDietEnabled(report);
  const sourceFilterSections = surfaceDietEnabled ? PUBLIC_SOURCE_FILTER_SECTIONS : LEGACY_PUBLIC_SOURCE_FILTER_SECTIONS;
  const removedSourceRe = surfaceDietEnabled ? REMOVED_PUBLIC_SOURCE_RE : LEGACY_REMOVED_PUBLIC_SOURCE_RE;
  const next = structuredClone(report);
  for (const sectionName of sourceFilterSections) {
    if (Array.isArray(next[sectionName])) {
      next[sectionName] = next[sectionName].filter((item) => !isRemovedPublicSourceItem(item, removedSourceRe));
    }
  }
  if (surfaceDietEnabled && Array.isArray(next.community_leads)) {
    next.community_leads = next.community_leads.filter(isPublicCommunityHotspotItem);
    if (next.community_leads.length === 0) {
      delete next.community_leads;
    }
  }
  if (surfaceDietEnabled) {
    delete next.wechat_items;
    delete next.zhihu_items;
    delete next.reddit_items;
  } else {
    delete next.community_leads;
  }
  if (Array.isArray(next.source_effectiveness)) {
    next.source_effectiveness = next.source_effectiveness.filter((row) => !isRemovedPublicSourceItem(row, removedSourceRe));
  }
  if (Array.isArray(next.hero_highlights)) {
    next.hero_highlights = next.hero_highlights.filter((item) => !isRemovedPublicSourceItem(item, removedSourceRe));
  }
  return next;
}

function isRemovedPublicSourceItem(item, sourceRe = REMOVED_PUBLIC_SOURCE_RE) {
  return sourceRe.test(publicSourceSearchText(item));
}

function isPublicCommunityHotspotItem(item) {
  return COMMUNITY_HOTSPOT_SOURCE_RE.test(publicSourceSearchText(item));
}

function publicSourceSearchText(value) {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function buildDailyTrackingHistoryByReportDate(reports = []) {
  const sortedReports = arrayValue(reports)
    .filter((report) => report?.report_date)
    .slice()
    .sort((left, right) => String(left.report_date).localeCompare(String(right.report_date)));
  const historyByReportDate = new Map();

  for (const report of sortedReports) {
    const reportDate = String(report.report_date || "");
    const windowReports = sortedReports
      .filter((candidate) => String(candidate.report_date || "") <= reportDate)
      .slice(-TRACKING_HISTORY_LIMIT);
    const historyById = {};

    for (const historyReport of windowReports) {
      const historyDate = String(historyReport.report_date || "");
      for (const item of arrayValue(historyReport.daily_tracking)) {
        const point = dailyTrackingHistoryPoint(historyDate, item);
        if (!point) {
          continue;
        }
        if (!historyById[point.sourceId]) {
          historyById[point.sourceId] = [];
        }
        historyById[point.sourceId].push(point);
      }
    }

    for (const [sourceId, points] of Object.entries(historyById)) {
      const byDate = new Map();
      for (const point of points) {
        byDate.set(point.date, point);
      }
      historyById[sourceId] = [...byDate.values()]
        .sort((left, right) => String(left.date).localeCompare(String(right.date)))
        .slice(-TRACKING_HISTORY_LIMIT);
    }
    historyByReportDate.set(reportDate, historyById);
  }

  return historyByReportDate;
}

function dailyTrackingHistoryPoint(reportDate, item) {
  if (!item || item.publish_to_public === false) {
    return null;
  }
  const sourceId = String(item.id || item.name || item.source || item.url || "").trim();
  if (!sourceId) {
    return null;
  }
  const entry = firstTrackingHistoryEntry(item);
  const rows = dailyTrackingHistoryRows(item);
  const valueLabel = firstNonEmpty(entry?.tokens, entry?.value_label, entry?.value, entry?.score, entry?.metric);
  const value = parseTrackingHistoryNumericValue(valueLabel);
  if (!Number.isFinite(value)) {
    return null;
  }
  return {
    sourceId,
    date: reportDate,
    label: String(reportDate || "").slice(5),
    value,
    valueLabel: String(valueLabel || ""),
    topLabel: firstNonEmpty(entry?.model, entry?.name, entry?.title, item.name),
    rank: Number.isFinite(Number(entry?.rank)) ? Number(entry.rank) : 1,
    rows
  };
}

function dailyTrackingHistoryRows(item) {
  const snapshotEntries = arrayValue(item?.snapshot?.top_entries);
  const sourceRows = snapshotEntries.length > 0
    ? snapshotEntries
    : arrayValue(item?.tracking_component_snapshot?.rows);
  return sourceRows
    .map((entry, index) => {
      const valueLabel = firstNonEmpty(entry?.tokens, entry?.value_label, entry?.value, entry?.score, entry?.metric);
      const value = parseTrackingHistoryNumericValue(valueLabel);
      const model = firstNonEmpty(entry?.model, entry?.name, entry?.title, entry?.label);
      if (!model || !Number.isFinite(value)) {
        return null;
      }
      return {
        rank: Number.isFinite(Number(entry?.rank)) ? Number(entry.rank) : index + 1,
        model,
        provider: firstNonEmpty(entry?.provider, entry?.vendor, entry?.source),
        value,
        valueLabel: String(valueLabel || ""),
        change: firstNonEmpty(entry?.change, entry?.weekly_change, entry?.delta)
      };
    })
    .filter(Boolean)
    .slice(0, 10);
}

function firstTrackingHistoryEntry(item) {
  const snapshotEntries = arrayValue(item?.snapshot?.top_entries);
  if (snapshotEntries.length > 0) {
    return snapshotEntries[0];
  }
  const componentRows = arrayValue(item?.tracking_component_snapshot?.rows);
  if (componentRows.length > 0) {
    return componentRows[0];
  }
  const metrics = arrayValue(item?.metrics);
  if (metrics.length > 0) {
    return metrics[0];
  }
  return null;
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) {
      return text;
    }
  }
  return "";
}

function parseTrackingHistoryNumericValue(value) {
  const text = String(value || "").replace(/,/g, "").trim();
  const match = text.match(/[-+]?\d+(?:\.\d+)?/);
  if (!match) {
    return NaN;
  }
  const amount = Number(match[0]);
  if (!Number.isFinite(amount)) {
    return NaN;
  }
  const unit = String((text.match(/\b([KMBGT])(?:\b|(?=\s*tokens?))/i) || [])[1] || "").toUpperCase();
  const multiplier = unit === "T"
    ? 1_000_000_000_000
    : unit === "G" || unit === "B"
      ? 1_000_000_000
      : unit === "M"
        ? 1_000_000
        : unit === "K"
          ? 1_000
          : 1;
  return amount * multiplier;
}

function weekdayLabel(dateString) {
  const date = new Date(`${dateString}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][date.getUTCDay()];
}

function monthKey(dateString) {
  const match = String(dateString || "").match(/^(\d{4}-\d{2})-\d{2}$/);
  return match ? match[1] : "";
}

function reportsAreEqual(left, right) {
  const normalize = (items) => [...items].sort((a, b) => b.report_date.localeCompare(a.report_date));
  const normalizedLeft = normalize(left);
  const normalizedRight = normalize(right);
  if (normalizedLeft.length !== normalizedRight.length) {
    return false;
  }

  return normalizedLeft.every((item, index) => JSON.stringify(item) === JSON.stringify(normalizedRight[index]));
}

async function walk(dir, files) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const current = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(current, files);
    } else if (entry.isFile()) {
      files.push(current);
    }
  }
}

async function readExistingFeed(outDir, siteTitle, siteUrl, generatedAt) {
  try {
    const raw = await fs.readFile(path.join(outDir, "feed.json"), "utf8");
    return JSON.parse(raw);
  } catch {
    return {
      schema_version: 1,
      site_title: siteTitle,
      site_url: siteUrl,
      updated_at: generatedAt,
      reports: []
    };
  }
}

async function writeFileTracked(outDir, relativePath, content, writtenFiles) {
  const target = path.join(outDir, ...relativePath.split("/"));
  await fs.mkdir(path.dirname(target), { recursive: true });
  if ((await readExistingText(target)) === content) {
    return;
  }
  await fs.writeFile(target, content, "utf8");
  writtenFiles.push(relativePath);
}

async function readExistingText(target) {
  try {
    return await fs.readFile(target, "utf8");
  } catch {
    return null;
  }
}

async function writeReportArtifacts(rootDir, outDir, report, writtenFiles, markdown = null, reportJsonPath = null, options = {}) {
  const paths = reportRelativePaths(report.report_date);
  await localizeBuilderAvatars(rootDir, outDir, report, writtenFiles, {
    fetchImpl: options.fetchImpl
  });
  const reportHtml = applyDailyReportHtmlOverrides(await renderReportWithEffectiveInteract(report, {
    rootDir,
    assetRootDir: outDir,
    trendAnnotations: options.trendAnnotations,
    reportNavigation: options.reportNavigation,
    dateIndexItem: options.dateIndexItem,
    trackingHistoryById: options.trackingHistoryById
  }), report.report_date);
  await writeJsonTracked(outDir, paths.dataPath, publicReportData(report), writtenFiles);
  await writeFileTracked(outDir, paths.htmlPath, reportHtml, writtenFiles);
  if (options.includeInternalData && reportJsonPath) {
    await copyCandidatePoolIfPresent(outDir, report, reportJsonPath, writtenFiles);
  }
  if (markdown !== null && report.markdown_path) {
    await writeFileTracked(outDir, report.markdown_path, markdown.replace(/\r\n/g, "\n"), writtenFiles);
  }
}

function applyDailyReportHtmlOverrides(html, reportDate) {
  let result = html;
  if (!result || result.includes("data-ai-daily-css-overrides")) {
    return result;
  }
  if (result.includes("</head>")) {
    return result.replace("</head>", `${DAILY_REPORT_HTML_OVERRIDES}\n</head>`);
  }
  return `${DAILY_REPORT_HTML_OVERRIDES}\n${result}`;
}

async function readReportJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  const candidate = JSON.parse(raw);
  const hasExplicitQualityStatus = Object.prototype.hasOwnProperty.call(candidate, "quality_status");
  const validation = validateReport(candidate);
  if (!validation.valid) {
    throw new PublisherError("schema_validation_failed", `结构化日报 JSON 未通过 schema 校验：${filePath}`, {
      errors: validation.errors
    });
  }

  const reportWithDefaults = withDefaultImportanceForReport(validation.value);
  const report = normalizeStoryFirstReport({
    ...reportWithDefaults,
    evidence_assets: Array.isArray(validation.value.evidence_assets) ? validation.value.evidence_assets : [],
    quality_status: qualityStatusForPublishedReport(reportWithDefaults, { preserveExplicit: hasExplicitQualityStatus })
  });
  const finalValidation = validateReport(report);
  if (!finalValidation.valid) {
    throw new PublisherError("schema_validation_failed", `结构化日报 JSON 未通过 schema 校验：${filePath}`, {
      errors: finalValidation.errors
    });
  }

  return finalValidation.value;
}

function qualityStatusForPublishedReport(report, options = {}) {
  return options.preserveExplicit && normalizeQualityStatus(report?.quality_status)
    ? normalizeQualityStatus(report.quality_status)
    : deriveQualityStatus(report, null);
}

function withDefaultImportanceForReport(report) {
  const result = { ...report };
  for (const sectionName of [
    "stories",
    "main_items",
    "model_releases",
    "hot_blogs",
    "chinese_media_dynamics",
    "daily_tracking",
    "projects",
    "github_trending",
    "huggingface_trending",
    "builder_observations",
    "official_org_updates",
    "community_leads",
    "wechat_items",
    "zhihu_items",
    "reddit_items"
  ]) {
    result[sectionName] = withDefaultImportance(sectionName, result[sectionName]);
  }
  return result;
}

function publicReportData(report) {
  const surfaceDietEnabled = isPublicSurfaceDietEnabled(report);
  const publicReport = publicReportWithoutRemovedSources(report);
  const result = sanitizePublicValue(publicReport);
  delete result.wechat_items;
  delete result.zhihu_items;
  delete result.reddit_items;
  if (!surfaceDietEnabled) {
    delete result.community_leads;
  }
  result.stories = publicStories(publicReport?.stories);
  result.hero_highlights = publicHeroHighlights(publicReport?.hero_highlights);
  if (surfaceDietEnabled) {
    result.community_leads = publicCommunityLeads(publicReport?.community_leads);
    if (result.community_leads.length === 0) {
      delete result.community_leads;
    }
  }
  const qualityStatus = publicQualityStatus(publicReport?.quality_status, {
    retiredPlatformMode: "remove"
  });
  if (qualityStatus) {
    result.quality_status = qualityStatus;
  }
  result.daily_tracking = (Array.isArray(result.daily_tracking) ? result.daily_tracking : [])
    .filter((item) => publicReport?.daily_tracking?.find((source) => source?.id === item?.id || source?.url === item?.url)?.publish_to_public !== false)
    .map(stripUnpublishableOfficialSnapshots);
  result.github_trending = publicGithubTrending(publicReport?.github_trending);
  result.huggingface_trending = publicHuggingFaceTrending(publicReport?.huggingface_trending);
  result.projects = publicGithubProjects(publicReport?.projects);
  result.evidence_assets = publicEvidenceAssets(publicReport?.evidence_assets);
  return result;
}

function publicCommunityLeads(items = []) {
  return arrayValue(items)
    .filter(isPublicCommunityHotspotItem)
    .map((item) => sanitizePublicValue(item));
}

function publicGithubTrending(items = []) {
  return arrayValue(items).map((item) => {
    const result = sanitizePublicValue(item);
    const normalizedSummary = normalizeGithubReadmeSummary(
      firstNonEmpty(result.readme_summary, result.github_readme_summary, result.description),
      result.repo || result.name || ""
    );
    for (const key of ["readme_summary", "github_readme_summary", "description", "use_case"]) {
      if (isGenericGithubPublicText(result[key])) {
        delete result[key];
      }
    }
    if (normalizedSummary && !isGenericGithubPublicText(normalizedSummary)) {
      result.description = normalizedSummary;
    }
    if (!String(result.description || "").trim()) {
      result.description = githubTrendingFactSummary(item);
    }
    delete result.readme_summary;
    delete result.github_readme_summary;
    return result;
  });
}

function publicGithubProjects(items = []) {
  return arrayValue(items).map((item) => {
    const result = sanitizePublicValue(item);
    for (const key of ["description", "use_case", "readme_summary", "github_readme_summary"]) {
      if (isGenericGithubPublicText(result[key])) {
        delete result[key];
      }
    }
    return result;
  });
}

function publicHuggingFaceTrending(items = []) {
  return arrayValue(items).map((item) => {
    const result = sanitizePublicValue(item);
    const raw = firstNonEmpty(result.description, result.summary);
    if (!raw || isGenericHuggingFacePublicText(raw)) {
      result.description = huggingFacePublicDescription(result);
    }
    return result;
  });
}

function huggingFacePublicDescription(item = {}) {
  const name = firstNonEmpty(item.name, item.repo, "该模型");
  const taskLabel = huggingFaceTaskLabel(item.task);
  const useCase = huggingFacePublicUseCase(item.task);
  return `${name} 是 Hugging Face 上的${taskLabel}，${useCase}；榜单数据只代表社区关注和调用热度，选型前仍要核对模型卡、许可证、限制和部署成本。`;
}

function huggingFacePublicUseCase(task) {
  const text = String(task || "").toLowerCase();
  if (/text-generation|conversational|chat/.test(text)) return "可作为文本生成或推理基线候选";
  if (/image-to-text|vision|visual-question-answering/.test(text)) return "适合关注视觉理解链路的模型对比";
  if (/text-to-image|image-generation|diffusion/.test(text)) return "适合关注图像生成工作流的模型对比";
  if (/speech|audio|automatic-speech-recognition|text-to-speech/.test(text)) return "适合关注语音和音频链路的模型对比";
  if (/embedding|retrieval|sentence-similarity/.test(text)) return "适合关注检索、嵌入和语义匹配链路";
  return "适合作为同类模型的对比入口";
}

function huggingFaceTaskLabel(task) {
  const text = String(task || "").toLowerCase();
  if (/text-generation|conversational|chat/.test(text)) return "文本生成模型";
  if (/image-to-text|vision|visual-question-answering/.test(text)) return "视觉语言模型";
  if (/text-to-image|image-generation|diffusion/.test(text)) return "图像生成模型";
  if (/automatic-speech-recognition|text-to-speech|speech|audio/.test(text)) return "语音或音频模型";
  if (/sentence-similarity|feature-extraction|embedding/.test(text)) return "嵌入或语义检索模型";
  if (/dataset/.test(text)) return "数据集资源";
  if (text) return `${task} 任务模型`;
  return "模型资源";
}

function isGenericHuggingFacePublicText(value) {
  return /(?:trending entry|verify model card|discovery lead|before factual inclusion|ranked\s+model\s+entry|公开描述指向|关键词包括|优先核对|准入|复现门槛|只记录排名|公开描述暂未给出足够功能细节|本周榜单记录|downloads、likes|社区使用热度)/iu.test(String(value || ""));
}

function isGenericGithubPublicText(value) {
  return /(?:公开描述指向|关键词包括|ranked\s+(?:model|repo|repository)\s+entry|README\s*主要围绕|阅读时先看|提供README|提供可复用包|测试或评估资产|README 将该仓库定位为|README\s*显示核心能力|读者应先确认|读者应先确认快速开始|适合先从|优先核对|重点看 README|核心能力集中在|它的价值在于|具体阅读时|适合评估[^。]*README|本轮开源榜单|公开页面显示|读者应看项目说明|公开信息只能说明开发者关注度增加|这类项目不应只看星标变化|面向AI\s*工程实践的开源项目|给出README\s*说明和使用入口|这类项目适合先从最小示例复现)/iu.test(String(value || ""));
}

function githubTrendingFactSummary(item = {}) {
  const source = String(item.source || "GitHub Trending").trim();
  const rank = Number.isFinite(Number(item.rank)) ? `#${Number(item.rank)}` : "";
  const evidence = String(item.evidence || "");
  const stars = evidence.match(/with\s+([0-9,]+)\s+stars\s+(today|this week)/i);
  const starsText = stars ? `${stars[2].toLowerCase() === "today" ? "今日" : "本周"} +${stars[1]} stars` : "";
  const repo = firstNonEmpty(item.repo, item.name, "该项目");
  const scope = source.replace(/GitHub\s*Trending/ig, "开源榜单").replace(/\s+/g, " ").trim() || "开源榜单";
  const rankText = rank ? `${scope} ${rank}` : scope;
  return `${repo} 本周出现在${rankText}${starsText ? `，${starsText}` : ""}；当前只能确认榜单动量，正式采用前还要核对 README、许可证、维护状态和 issue 反馈。`;
}

function publicStories(stories = []) {
  return arrayValue(stories)
    .map((story) => ({
      story_id: story.story_id,
      title: story.title,
      importance: story.importance,
      trend: story.trend,
      event_date: story.event_date,
      primary_entity: story.primary_entity,
      event_type: story.event_type,
      object: story.object,
      what_happened: story.what_happened,
      why_it_matters: story.why_it_matters,
      evidence_level: story.evidence_level,
      sources: arrayValue(story.sources).map((source) => ({
        label: source.label,
        url: source.url,
        type: source.type
      }))
    }))
    .filter((story) => story.title && story.sources.length > 0);
}

function publicHeroHighlights(highlights = []) {
  return arrayValue(highlights)
    .filter((item) => item?.title && item?.url)
    .map((item) => {
      const result = {
        title: String(item.title || ""),
        url: String(item.url || ""),
        reason: String(item.reason || "").trim()
      };
      for (const field of ["what_happened", "why_watch", "category"]) {
        const value = String(item?.[field] || "").trim();
        if (value) {
          result[field] = value;
        }
      }
      if (item.source_item_ref) {
        result.source_item_ref = String(item.url || item.source_item_ref || "").trim();
      }
      return result;
    });
}

function sanitizePublicValue(value, key = "") {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizePublicValue(item, key));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  if (key === "quality_status") {
    return publicQualityStatus(value);
  }
  if (key === "evidence_assets") {
    return publicEvidenceAssets(value);
  }
  const result = {};
  for (const [entryKey, entryValue] of Object.entries(value)) {
    if (PUBLIC_DATA_PRIVATE_KEYS.has(entryKey)) {
      continue;
    }
    result[entryKey] = sanitizePublicValue(entryValue, entryKey);
  }
  return result;
}

function stripUnpublishableOfficialSnapshots(item) {
  if (!item || typeof item !== "object") {
    return item;
  }
  const next = structuredClone(item);
  next.tracking_component_snapshot = sanitizeTrackingComponentSnapshot(next.tracking_component_snapshot);
  stripOfficialSnapshotIfUnpublishable(next.snapshot);
  stripOfficialSnapshotIfUnpublishable(next.tracking_component_snapshot);
  return next;
}

function stripOfficialSnapshotIfUnpublishable(snapshot) {
  const official = snapshot?.official_component_snapshot;
  if (!official || isPublishableOfficialComponentFragment({
    html: official.sanitized_html || official.html || official.sanitizedHtml,
    sourceSelector: official.source_selector || official.sourceSelector
  })) {
    return;
  }
  delete snapshot.official_component_snapshot;
}

function publicQualityStatus(status = {}, options = {}) {
  if (!status || typeof status !== "object") {
    return undefined;
  }
  const retiredPlatformMode = options.retiredPlatformMode || "keep";
  const result = {};
  const statusValue = String(status.status || "").trim();
  if (statusValue) {
    result.status = statusValue;
  }
  const publicNote = publicQualityNote(status.public_note);
  if (publicNote) {
    result.public_note = publicNote;
  }
  const affectedSections = arrayValue(status.affected_sections)
    .map((item) => String(item || "").trim())
    .map(publicQualitySection)
    .filter(Boolean)
    .filter((section) => retiredPlatformMode !== "remove" || !RETIRED_PLATFORM_SECTIONS.has(section));
  if (affectedSections.length > 0) {
    result.affected_sections = affectedSections;
  }
  const degradedEvents = arrayValue(status.degraded_sections)
    .map(sanitizePublicDegradationEvent)
    .filter(Boolean)
    .filter((event) => publicQualityEventAllowed(event, retiredPlatformMode))
    .map(publicQualityEvent)
    .filter(Boolean);
  if (degradedEvents.length > 0) {
    result.degraded_events = degradedEvents;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function publicQualityEvent(event) {
  if (!event || typeof event !== "object") {
    return null;
  }
  const section = publicQualitySection(event.section);
  if (!section) {
    return null;
  }
  const result = {
    section,
    message: publicQualityMessage(event.message, section)
  };
  const severity = String(event.severity || "").trim();
  if (severity) {
    result.severity = severity;
  }
  return result;
}

function publicQualityNote(value) {
  const note = publicQualityMessage(value, "source_status").trim();
  if (!note) {
    return "";
  }
  if (/\bsource\s+coverage\b/i.test(note)) {
    return PUBLIC_DISCOVERY_DEGRADED_NOTE;
  }
  if (/\bblocked audit trail\b|审计记录|信源审计|source[_ -]?audit/i.test(note)) {
    return "部分采集覆盖降级，公开页仅展示已核验内容。";
  }
  return note;
}

function publicQualityMessage(value, section) {
  return String(value || "").replace(/\bsource_audit(?:[._-][a-z0-9_-]+)?\b/gi, section);
}

function publicQualitySection(value) {
  const section = String(value || "").trim();
  if (!section) {
    return "";
  }
  if (PUBLIC_QUALITY_SECTION_ALIASES.has(section)) {
    return PUBLIC_QUALITY_SECTION_ALIASES.get(section);
  }
  if (section === "source_audit" || /^source_audit[._-]/i.test(section)) {
    return "source_status";
  }
  return section;
}

function publicQualityEventAllowed(event, retiredPlatformMode) {
  const section = String(event?.section || "");
  if (!RETIRED_PLATFORM_SECTIONS.has(section)) {
    return true;
  }
  if (retiredPlatformMode === "remove") {
    return false;
  }
  if (retiredPlatformMode !== "legacy") {
    return true;
  }
  const code = String(event?.code || "");
  return (section === "wechat_items" && code === "wechat_sources_blocked") ||
    (section === "zhihu_items" && code === "zhihu_sources_blocked") ||
    (section === "reddit_items" && code === "reddit_sources_blocked");
}

function publicEvidenceAssets(assets) {
  return (Array.isArray(assets) ? assets : [])
    .filter(isPublicEvidenceAsset)
    .map((asset) => sanitizePublicValue(asset));
}

function isPublicEvidenceAsset(asset = {}) {
  const type = String(asset.type || "").toLowerCase();
  if (type === "table") {
    return true;
  }
  const role = String(asset.asset_role || "").toLowerCase();
  const captureKind = String(asset.capture_kind || asset.extraction_status || "").toLowerCase();
  if (NON_PUBLIC_ASSET_ROLES.has(role)) {
    return false;
  }
  if (SCREENSHOT_CAPTURE_RE.test(captureKind)) {
    return false;
  }
  const width = Number(asset.width || 0);
  const height = Number(asset.height || 0);
  if ((width > 0 && width < 320) || (height > 0 && height < 180)) {
    return false;
  }
  return Boolean(asset.local_path) && isMeaningfulPublicEvidenceAsset(asset);
}

async function writeJsonTracked(outDir, relativePath, value, writtenFiles) {
  await writeFileTracked(outDir, relativePath, `${JSON.stringify(value, null, 2)}\n`, writtenFiles);
}

function uniqueSorted(items) {
  return [...new Set(items)].sort((a, b) => String(a).localeCompare(String(b)));
}

export function reportManagedAssetPaths(report) {
  return uniqueSorted([...evidenceAssetPaths(report), ...builderAvatarAssetPaths(report)]);
}

function evidenceAssetPaths(report) {
  return (Array.isArray(report?.evidence_assets) ? report.evidence_assets : [])
    .map((asset) => asset?.local_path)
    .filter(Boolean);
}

function builderAvatarAssetPaths(report) {
  return (Array.isArray(report?.builder_observations) ? report.builder_observations : [])
    .map((item) => builderAvatarAssetPath(report, item))
    .filter(Boolean);
}

export function builderAvatarAssetPath(report, item) {
  if (item?.avatar_local_path) {
    return item.avatar_local_path;
  }
  const avatarUrl = normalizeHttpUrl(item?.avatar_url);
  if (!avatarUrl || !report?.report_date) {
    return "";
  }
  const [year, month] = report.report_date.split("-");
  const slug = slugForAsset(item.handle || xHandleFromStatusUrl(item.url) || item.author || "builder");
  return `assets/avatars/${year}/${month}/${report.report_date}-${slug}${imageExtensionFromUrl(avatarUrl) || ".png"}`;
}

async function localizeBuilderAvatars(rootDir, outDir, report, writtenFiles, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const items = Array.isArray(report?.builder_observations) ? report.builder_observations : [];
  if (typeof fetchImpl !== "function" || items.length === 0) {
    return;
  }

  await Promise.all(items.map((item) => localizeSingleBuilderAvatar(outDir, report, item, writtenFiles, fetchImpl)));
}

async function localizeSingleBuilderAvatar(outDir, report, item, writtenFiles, fetchImpl) {
  if (!item || item.avatar_data_uri) {
    return;
  }
  const avatarUrl = builderAvatarDownloadUrl(item);
  const relativePath = item.avatar_local_path || builderAvatarAssetPath(report, item);
  if (!avatarUrl || !relativePath) {
    return;
  }

  const target = safeOutPath(outDir, relativePath);
  if (!target) {
    return;
  }
  if (await exists(target)) {
    return;
  }

  const downloaded = await downloadImage(fetchImpl, avatarUrl, target);
  if (downloaded) {
    writtenFiles.push(relativePath);
  }
}

async function downloadImage(fetchImpl, url, target) {
  try {
    const response = await fetchImpl(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(AVATAR_DOWNLOAD_TIMEOUT_MS),
      headers: {
        accept: "image/avif,image/webp,image/png,image/jpeg,image/gif,image/*",
        "user-agent": "ai-daily-cn-static-publisher"
      }
    });
    if (!response.ok) {
      return false;
    }
    const contentType = String(response.headers?.get?.("content-type") || "").toLowerCase();
    if (contentType && !contentType.startsWith("image/")) {
      return false;
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0 || buffer.length > AVATAR_MAX_BYTES) {
      return false;
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, buffer);
    return true;
  } catch {
    return false;
  }
}

function builderAvatarDownloadUrl(item) {
  return normalizeHttpUrl(item?.avatar_url);
}

function normalizeHttpUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

function normalizeXHandle(value) {
  const handle = String(value || "").trim().replace(/^@/, "");
  return /^[A-Za-z0-9_]{1,32}$/.test(handle) ? handle : "";
}

function xHandleFromStatusUrl(value) {
  try {
    const [, handle] = new URL(String(value || "")).pathname.match(/^\/([^/]+)\/status\/\d+/i) || [];
    return normalizeXHandle(handle);
  } catch {
    return "";
  }
}

function imageExtensionFromUrl(value) {
  try {
    const ext = path.extname(new URL(String(value || "")).pathname).toLowerCase();
    return IMAGE_EXTENSIONS.has(ext) ? ext : "";
  } catch {
    return "";
  }
}

function safeOutPath(outDir, relativePath) {
  const normalized = String(relativePath || "").replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || normalized.includes("\0") || normalized.split("/").includes("..")) {
    return "";
  }
  const target = path.resolve(outDir, ...normalized.split("/"));
  const root = path.resolve(outDir);
  return target === root || target.startsWith(`${root}${path.sep}`) ? target : "";
}

function slugForAsset(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "builder";
}

async function copyCandidatePoolIfPresent(outDir, report, reportJsonPath, writtenFiles) {
  const candidatePath = candidatePoolPathForReportFile(reportJsonPath, report.report_date);
  const candidateExists = await exists(candidatePath);
  if (!candidateExists && !report.candidate_pool_path) {
    return;
  }
  if (!candidateExists) {
    throw new PublisherError("candidate_pool_missing", `日报声明了候选池，但文件不存在：${candidatePath}`, {
      path: candidatePath
    });
  }

  const candidatePool = normalizeCandidatePool(JSON.parse(await fs.readFile(candidatePath, "utf8")), report.report_date);
  await writeJsonTracked(outDir, reportRelativePaths(report.report_date).candidateDataPath, candidatePool, writtenFiles);
}

function candidatePoolPathForReportFile(reportJsonPath, reportDate) {
  return path.join(path.dirname(reportJsonPath), `${reportDate}.candidates.json`);
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function relativeWrittenFiles(rootDir, files) {
  return files.map((file) => toPosixRelative(rootDir, file)).sort();
}
