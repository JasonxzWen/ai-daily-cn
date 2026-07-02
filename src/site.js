import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { DEFAULT_SITE } from "./config.js";
import { PublisherError } from "./errors.js";
import { parseDailyMarkdown } from "./parser.js";
import { defaultStyleCss, renderIndexHtml, renderOfficialBlogsHtml } from "./render.js";
import { renderReportWithEffectiveInteract } from "./interaction-report.js";
import { reportRelativePaths, toPosixRelative } from "./paths.js";
import { defaultGeneratedAt } from "./time.js";
import { validateFeed, validateReport, validateTrends } from "./schema.js";
import { normalizeCandidatePool } from "./candidates.js";
import { deriveQualityStatus } from "./quality-status.js";
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

/* Stage D: Feishu-style left-rail table of contents (desktop only; mobile keeps
   the engine's horizontal nav so the per-story TOC stays contained). */
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
  const reportNavigationByDate = buildReportNavigation(feedValidation.value.reports, dateIndex.items);
  const trackingHistoryByDate = buildDailyTrackingHistoryByReportDate(reports);

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
  await writeJsonTracked(outDir, "trends.json", trendValidation.value, writtenFiles);
  await writeJsonTracked(outDir, "data/official-blogs.json", officialBlogKnowledge, writtenFiles);
  await writeFileTracked(outDir, "official-blogs/index.html", renderOfficialBlogsHtml(officialBlogKnowledge, {
    styleHref: `../assets/style.css?v=${encodeURIComponent(indexStyleVersion)}`
  }), writtenFiles);
  await writeFileTracked(outDir, "index.html", renderIndexHtml(feedValidation.value, trendValidation.value, dateIndex, {
    styleVersion: indexStyleVersion,
    officialBlogKnowledge
  }), writtenFiles);

  return {
    outDir,
    reports,
    feed: feedValidation.value,
    trends: trendValidation.value,
    officialBlogKnowledge,
    dateIndex,
    writtenFiles: uniqueSorted(writtenFiles)
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
  const files = [".nojekyll", "assets/style.css", "feed.json", "index.html", "trends.json", "data/official-blogs.json", "official-blogs/index.html"];
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
  const validation = validateReport(candidate);
  if (!validation.valid) {
    throw new PublisherError("schema_validation_failed", `结构化日报 JSON 未通过 schema 校验：${filePath}`, {
      errors: validation.errors
    });
  }

  const report = normalizeStoryFirstReport({
    ...withDefaultImportanceForReport(validation.value),
    evidence_assets: Array.isArray(validation.value.evidence_assets) ? validation.value.evidence_assets : [],
    quality_status: deriveQualityStatus(validation.value, null)
  });
  const finalValidation = validateReport(report);
  if (!finalValidation.valid) {
    throw new PublisherError("schema_validation_failed", `结构化日报 JSON 未通过 schema 校验：${filePath}`, {
      errors: finalValidation.errors
    });
  }

  return finalValidation.value;
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
  const metricParts = [
    Number(item.downloads) > 0 ? `${Number(item.downloads)} downloads` : "",
    Number(item.likes) > 0 ? `${Number(item.likes)} likes` : ""
  ].filter(Boolean);
  const metricText = metricParts.length > 0 ? `，当前热度指标是 ${metricParts.join("、")}` : "";
  return `${name} 是 Hugging Face 上的${taskLabel}${metricText}。`;
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
  return /(?:trending entry|verify model card|discovery lead|before factual inclusion|ranked\s+model\s+entry|公开描述指向|关键词包括|优先核对|准入|复现门槛|只记录排名|公开描述暂未给出足够功能细节)/iu.test(String(value || ""));
}

function isGenericGithubPublicText(value) {
  return /(?:公开描述指向|关键词包括|ranked\s+(?:model|repo|repository)\s+entry|README\s*主要围绕|阅读时先看|提供README|提供可复用包|测试或评估资产|README 将该仓库定位为|README\s*显示核心能力|读者应先确认|适合先从|优先核对|重点看 README|核心能力集中在|它的价值在于|具体阅读时|适合评估[^。]*README)/iu.test(String(value || ""));
}

function githubTrendingFactSummary(item = {}) {
  const source = String(item.source || "GitHub Trending").trim();
  const rank = Number.isFinite(Number(item.rank)) ? `#${Number(item.rank)}` : "";
  const evidence = String(item.evidence || "");
  const stars = evidence.match(/with\s+([0-9,]+)\s+stars\s+(today|this week)/i);
  const starsText = stars ? `${stars[2].toLowerCase() === "today" ? "今日" : "本周"} +${stars[1]} stars` : "";
  const repo = firstNonEmpty(item.repo, item.name, "该项目");
  const rankText = rank ? `${source} ${rank}` : source;
  return `${repo} 当前进入 ${rankText}${starsText ? `，${starsText}` : ""}。`;
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
