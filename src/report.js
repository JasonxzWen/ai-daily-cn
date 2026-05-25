import fs from "node:fs/promises";
import path from "node:path";
import { DEFAULT_SITE } from "./config.js";
import { PublisherError } from "./errors.js";
import { canonicalReportUrl, reportRelativePaths } from "./paths.js";
import { defaultGeneratedAt, isValidDateString } from "./time.js";
import { defaultPublishStatus } from "./parser.js";
import { requirePlainLanguage } from "./plain-language.js";
import { requireFreshReport } from "./quality-gates.js";
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
    candidate_pool_path: draft.candidate_pool_path || reportCandidatePoolPublicPath(reportDate),
    model_releases: Array.isArray(draft.model_releases) ? draft.model_releases : [],
    hot_blogs: Array.isArray(draft.hot_blogs) ? draft.hot_blogs : [],
    projects: Array.isArray(draft.projects) ? draft.projects : [],
    builder_observations: Array.isArray(draft.builder_observations) ? draft.builder_observations : [],
    community_leads: Array.isArray(draft.community_leads) ? draft.community_leads : [],
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

  const validation = validateReport(report);
  if (!validation.valid) {
    throw new PublisherError("schema_validation_failed", "结构化日报草稿未通过 schema 校验。", {
      errors: validation.errors
    });
  }

  requireSourceAudit(validation.value);
  requirePlainLanguage(validation.value);
  requireCandidateCoverage(validation.value, options.candidatePool);

  return validation.value;
}

function requireSourceAudit(report) {
  const audit = report.source_audit;
  if (!audit || typeof audit !== "object") {
    throw new PublisherError("source_audit_missing", "结构化日报草稿必须包含 source_audit，记录 GitHub Trending 和 Builder 原始源检查结果。");
  }

  requireAuditGroup(audit.github_trending, "source_audit.github_trending");
  requireAuditGroup(audit.builder_sources, "source_audit.builder_sources");
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
