import fs from "node:fs/promises";
import path from "node:path";
import { DEFAULT_SITE } from "./config.js";
import { PublisherError } from "./errors.js";
import { parseDailyMarkdown } from "./parser.js";
import { defaultStyleCss, renderIndexHtml } from "./render.js";
import { renderReportWithEffectiveInteract } from "./interaction-report.js";
import { reportRelativePaths, toPosixRelative } from "./paths.js";
import { defaultGeneratedAt } from "./time.js";
import { validateFeed, validateReport, validateTrends } from "./schema.js";
import { normalizeCandidatePool } from "./candidates.js";
import { deriveQualityStatus } from "./quality-status.js";
import { buildTrendIndex, loadTrendConfig } from "./trends.js";
import { withDefaultImportance } from "./importance.js";
import { isMeaningfulPublicEvidenceAsset } from "./media-policy.js";

const AVATAR_DOWNLOAD_TIMEOUT_MS = 2500;
const AVATAR_MAX_BYTES = 1_000_000;
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);
const REPORT_DATA_AUXILIARY_JSON = new Set(["source-status-history.json"]);
const PUBLIC_DATA_PRIVATE_KEYS = new Set([
  "candidate_id",
  "candidate_pool_path",
  "source_audit",
  "self_check",
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
const SCREENSHOT_CAPTURE_RE = /(?:full[_-]?page|browser|viewport|screenshot|page[_-]?capture)/i;
const DAILY_REPORT_HTML_OVERRIDES = `<style data-ai-daily-css-overrides>
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

  for (const record of reportRecords) {
    await writeReportArtifacts(rootDir, outDir, record.report, writtenFiles, record.markdown, record.reportJsonPath, {
      trendAnnotations: trendValidation.value.annotations_by_date[record.report.report_date],
      fetchImpl: options.fetchImpl,
      includeInternalData: Boolean(options.includeInternalData)
    });
  }

  await writeJsonTracked(outDir, "feed.json", feedValidation.value, writtenFiles);
  await writeJsonTracked(outDir, "trends.json", trendValidation.value, writtenFiles);
  await writeFileTracked(outDir, "index.html", renderIndexHtml(feedValidation.value, trendValidation.value), writtenFiles);

  return {
    outDir,
    reports,
    feed: feedValidation.value,
    trends: trendValidation.value,
    writtenFiles: uniqueSorted(writtenFiles)
  };
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
  const files = [".nojekyll", "assets/style.css", "feed.json", "index.html", "trends.json"];
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
    trendAnnotations: options.trendAnnotations
  }));
  await writeJsonTracked(outDir, paths.dataPath, publicReportData(report), writtenFiles);
  await writeFileTracked(outDir, paths.htmlPath, reportHtml, writtenFiles);
  if (options.includeInternalData && reportJsonPath) {
    await copyCandidatePoolIfPresent(outDir, report, reportJsonPath, writtenFiles);
  }
  if (markdown !== null && report.markdown_path) {
    await writeFileTracked(outDir, report.markdown_path, markdown.replace(/\r\n/g, "\n"), writtenFiles);
  }
}

function applyDailyReportHtmlOverrides(html) {
  if (!html || html.includes("data-ai-daily-css-overrides")) {
    return html;
  }
  if (html.includes("</head>")) {
    return html.replace("</head>", `${DAILY_REPORT_HTML_OVERRIDES}\n</head>`);
  }
  return `${DAILY_REPORT_HTML_OVERRIDES}\n${html}`;
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

  const report = {
    ...withDefaultImportanceForReport(validation.value),
    evidence_assets: Array.isArray(validation.value.evidence_assets) ? validation.value.evidence_assets : [],
    quality_status: deriveQualityStatus(validation.value, null)
  };
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
    "main_items",
    "model_releases",
    "hot_blogs",
    "daily_tracking",
    "projects",
    "github_trending",
    "huggingface_trending",
    "builder_observations",
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
  const result = sanitizePublicValue(report);
  result.quality_status = publicQualityStatus(report?.quality_status);
  result.daily_tracking = (Array.isArray(result.daily_tracking) ? result.daily_tracking : [])
    .filter((item) => report?.daily_tracking?.find((source) => source?.id === item?.id || source?.url === item?.url)?.publish_to_public !== false);
  result.evidence_assets = publicEvidenceAssets(report?.evidence_assets);
  return result;
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

function publicQualityStatus(status = {}) {
  if (!status || typeof status !== "object") {
    return undefined;
  }
  const result = {};
  for (const key of ["status", "public_note", "affected_sections"]) {
    if (status[key] !== undefined) {
      result[key] = sanitizePublicValue(status[key], key);
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
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
    item.avatar_local_path = relativePath;
    return;
  }

  const downloaded = await downloadImage(fetchImpl, avatarUrl, target);
  if (downloaded) {
    item.avatar_local_path = relativePath;
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
