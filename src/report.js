import fs from "node:fs/promises";
import path from "node:path";
import { DEFAULT_SITE } from "./config.js";
import { PublisherError } from "./errors.js";
import { canonicalReportUrl, reportRelativePaths } from "./paths.js";
import { defaultGeneratedAt, isValidDateString } from "./time.js";
import { defaultPublishStatus } from "./parser.js";
import { requirePlainLanguage } from "./plain-language.js";
import { requireFreshReport } from "./quality-gates.js";
import { deriveQualityStatus, requirePublishableQuality } from "./quality-status.js";
import {
  readCandidatePool,
  requireCandidateCoverage,
  reportCandidatePoolPublicPath,
  writeCandidatePool
} from "./candidates.js";
import { validateReport } from "./schema.js";

export async function writeReportDraft(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const outputDir = path.resolve(rootDir, options.outputDir || "reports-data");
  const raw = options.inputPath ? await fs.readFile(path.resolve(rootDir, options.inputPath), "utf8") : await fs.readFile(0, "utf8");
  const draft = JSON.parse(raw);
  const reportDate = options.reportDate || draft.report_date;
  if (!isValidDateString(reportDate)) {
    throw new PublisherError("report_date_invalid", "结构化日报必须提供有效的 report_date 或 --date。");
  }
  const { candidatePool } = await readCandidatePool({
    rootDir,
    reportDate,
    inputPath: options.candidatePoolPath
  });
  const report = normalizeReportDraft(draft, {
    reportDate,
    siteUrl: options.siteUrl || DEFAULT_SITE.siteUrl,
    generatedAt: options.generatedAt,
    candidatePool
  });
  await requireFreshReport(report, {
    historyDir: outputDir,
    historyDays: options.historyDays,
    candidatePool
  });
  const [year, month] = report.report_date.split("-");
  const target = path.join(outputDir, year, month, `${report.report_date}.json`);

  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  const candidatePoolPath = await writeCandidatePool(outputDir, report.report_date, candidatePool);

  return {
    report,
    path: target,
    candidatePoolPath
  };
}

export function normalizeReportDraft(draft, options = {}) {
  const reportDate = options.reportDate || draft.report_date;
  if (!isValidDateString(reportDate)) {
    throw new PublisherError("report_date_invalid", "结构化日报必须提供有效的 report_date 或 --date。");
  }

  const paths = reportRelativePaths(reportDate);
  const canonicalUrl = canonicalReportUrl(options.siteUrl || DEFAULT_SITE.siteUrl, reportDate);
  const report = {
    ...draft,
    schema_version: 1,
    report_date: reportDate,
    canonical_url: draft.canonical_url || canonicalUrl,
    html_path: draft.html_path || paths.htmlPath,
    source_window: draft.source_window || {
      date_from: reportDate,
      date_to: reportDate,
      fallback_window_used: false,
      notes: ""
    },
    hero_highlights: Array.isArray(draft.hero_highlights) ? draft.hero_highlights : [],
    candidate_pool_path: draft.candidate_pool_path || reportCandidatePoolPublicPath(reportDate),
    github_trending: Array.isArray(draft.github_trending) ? draft.github_trending : [],
    model_releases: Array.isArray(draft.model_releases) ? draft.model_releases : [],
    hot_blogs: Array.isArray(draft.hot_blogs) ? draft.hot_blogs : [],
    projects: Array.isArray(draft.projects) ? draft.projects : [],
    builder_observations: Array.isArray(draft.builder_observations) ? draft.builder_observations : [],
    community_leads: Array.isArray(draft.community_leads) ? draft.community_leads : [],
    evidence_assets: Array.isArray(draft.evidence_assets) ? draft.evidence_assets : [],
    publish_status: draft.publish_status || defaultPublishStatus(canonicalUrl),
    generated_at: draft.generated_at || options.generatedAt || defaultGeneratedAt()
  };

  if (report.self_check && typeof report.self_check === "object") {
    report.self_check = {
      ...report.self_check,
      report_date: report.self_check.report_date || reportDate,
      builder_skill_used: Array.isArray(report.self_check.builder_skill_used) ? report.self_check.builder_skill_used : [],
      fallback_sources: Array.isArray(report.self_check.fallback_sources) ? report.self_check.fallback_sources : [],
      optimization_suggestions: Array.isArray(report.self_check.optimization_suggestions)
        ? report.self_check.optimization_suggestions
        : []
    };
  }

  report.quality_status = deriveQualityStatus(report, options.candidatePool);

  const validation = validateReport(report);
  if (!validation.valid) {
    throw new PublisherError("schema_validation_failed", "结构化日报草稿未通过 schema 校验。", {
      errors: validation.errors
    });
  }

  requireSourceAudit(validation.value);
  requirePlainLanguage(validation.value);
  requireCandidateCoverage(validation.value, options.candidatePool);
  requireBuilderXObservation(validation.value, options.candidatePool);
  requirePublishableQuality(validation.value);

  return validation.value;
}

function requireSourceAudit(report) {
  const audit = report.source_audit;
  if (!audit || typeof audit !== "object") {
    throw new PublisherError("source_audit_missing", "结构化日报草稿必须包含 source_audit，记录固定发现面和源健康检查结果。");
  }

  for (const groupName of ["github_trending", "builder_sources", "content_sources", "search_sources", "sources_health"]) {
    requireAuditGroup(audit[groupName], `source_audit.${groupName}`);
  }
}

function requireAuditGroup(group, pathName) {
  if (!group || typeof group !== "object") {
    throw new PublisherError("source_audit_incomplete", `${pathName} 缺失。`);
  }
  if (group.checked !== true) {
    throw new PublisherError("source_audit_incomplete", `${pathName}.checked 必须为 true。`);
  }
  if (!Array.isArray(group.sources) || group.sources.length === 0) {
    throw new PublisherError("source_audit_incomplete", `${pathName}.sources 必须至少记录一个已检查来源。`);
  }
}

function requireBuilderXObservation(report, candidatePool) {
  const builderSources = report.source_audit?.builder_sources?.sources || [];
  const checksX = builderSources.some((source) => isFollowBuildersXSource(source) || isXSearchFallbackSource(source));
  if (!checksX) {
    return;
  }

  const hasXObservation = (report.builder_observations || []).some((item) => isXStatusUrl(item.url)) ||
    (candidatePool?.candidates || []).some((candidate) =>
      candidate.status === "included" &&
      candidate.included_in === "builder_observations" &&
      (isXStatusUrl(candidate.url) || isXStatusUrl(candidate.original_url))
    );
  if (hasXObservation) {
    return;
  }

  const sourceState = builderSources
    .filter((source) => isFollowBuildersXSource(source) || isXSearchFallbackSource(source))
    .map((source) => `${source.name}:${source.status}${source.notes ? `:${source.notes}` : ""}`)
    .join(" | ");
  throw new PublisherError(
    "builder_x_observation_missing",
    "Builder 观察必须包含至少一条近期原始 X status；不能在 X 发现失败时只用博客或播客顶替。",
    { sources: sourceState }
  );
}

function isFollowBuildersXSource(source) {
  return /follow-builders x feed/i.test(source?.name || "") || /feed-x\.json/i.test(source?.url || "");
}

function isXSearchFallbackSource(source) {
  return /x builder search/i.test(source?.name || "") || /tavily\.com\/search/i.test(source?.url || "");
}

function isXStatusUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    return (host === "x.com" || host === "twitter.com") && /\/[^/]+\/status\/\d+/i.test(url.pathname);
  } catch {
    return false;
  }
}
