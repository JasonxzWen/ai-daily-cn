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
import { buildAutomationRevision, defaultAutomationRevision } from "./automation-revision.js";
import { normalizeOptimizationSuggestions } from "./feedback-contract.js";
import { withDefaultImportance } from "./importance.js";
import { normalizeUrlIdentity } from "./url.js";
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
  const automationRevision = options.automationRevision || (await buildAutomationRevision({ rootDir }));
  const report = normalizeReportDraft(draft, {
    reportDate,
    siteUrl: options.siteUrl || DEFAULT_SITE.siteUrl,
    generatedAt: options.generatedAt,
    candidatePool,
    automationRevision,
    rootDir
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
    report_status: draft.report_status || "normal",
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
    main_items: Array.isArray(draft.main_items) ? draft.main_items : [],
    github_trending: Array.isArray(draft.github_trending) ? draft.github_trending : [],
    model_releases: Array.isArray(draft.model_releases) ? draft.model_releases : [],
    hot_blogs: Array.isArray(draft.hot_blogs) ? draft.hot_blogs : [],
    daily_tracking: Array.isArray(draft.daily_tracking) ? draft.daily_tracking : [],
    projects: Array.isArray(draft.projects) ? draft.projects : [],
    builder_observations: Array.isArray(draft.builder_observations) ? draft.builder_observations : [],
    community_leads: Array.isArray(draft.community_leads) ? draft.community_leads : [],
    evidence_assets: Array.isArray(draft.evidence_assets) ? draft.evidence_assets : [],
    publish_status: draft.publish_status || defaultPublishStatus(canonicalUrl),
    generated_at: draft.generated_at || options.generatedAt || defaultGeneratedAt()
  };

  for (const sectionName of [
    "main_items",
    "model_releases",
    "hot_blogs",
    "daily_tracking",
    "projects",
    "github_trending",
    "builder_observations",
    "community_leads"
  ]) {
    report[sectionName] = withDefaultImportance(sectionName, report[sectionName]);
  }

  if (report.self_check && typeof report.self_check === "object") {
    report.self_check = {
      ...report.self_check,
      report_date: report.self_check.report_date || reportDate,
      builder_skill_used: Array.isArray(report.self_check.builder_skill_used) ? report.self_check.builder_skill_used : [],
      fallback_sources: Array.isArray(report.self_check.fallback_sources) ? report.self_check.fallback_sources : [],
      optimization_suggestions: normalizeOptimizationSuggestions(report.self_check.optimization_suggestions),
      automation_revision:
        options.automationRevision || report.self_check.automation_revision || defaultAutomationRevision()
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
  requireEvidenceAssetSelectivity(validation.value);
  requireExpandedMainItemFormat(validation.value);
  requireChineseGithubTrendingDescriptions(validation.value);
  requirePublishableQuality(validation.value, {
    rootDir: options.rootDir,
    currentAutomationRevision: options.automationRevision
  });

  return validation.value;
}

function requireModelReleasesInMainItems(report) {
  const modelReleases = Array.isArray(report.model_releases) ? report.model_releases : [];
  if (modelReleases.length === 0) {
    return;
  }

  const mainUrls = new Set(
    (Array.isArray(report.main_items) ? report.main_items : [])
      .map((item) => normalizeUrlForEvidenceGate(item.url))
      .filter(Boolean)
  );
  const missing = modelReleases
    .map((item, index) => ({
      index,
      name: item?.name || item?.title || "",
      url: normalizeUrlForEvidenceGate(item?.url)
    }))
    .filter((item) => item.url && !mainUrls.has(item.url));

  if (missing.length > 0) {
    throw new PublisherError(
      "model_releases_missing_main_item",
      "model_releases must be mirrored in main_items so model launches stay part of the main report.",
      { missing }
    );
  }
}

function requireEvidenceAssetSelectivity(report) {
  const mainItems = Array.isArray(report.main_items) ? report.main_items : [];
  if (mainItems.length < 6) {
    return;
  }

  const mainUrls = new Set(mainItems.map((item) => normalizeUrlForEvidenceGate(item.url)).filter(Boolean));
  const assets = Array.isArray(report.evidence_assets) ? report.evidence_assets : [];
  const mainEvidenceAssets = assets.filter((asset) => mainUrls.has(normalizeUrlForEvidenceGate(asset?.source_url)));
  const manualMainTables = mainEvidenceAssets.filter((asset) => asset?.type === "table" && asset?.extraction_status === "manual_table");

  if (manualMainTables.length >= Math.ceil(mainItems.length * 0.8)) {
    throw new PublisherError(
      "evidence_assets_overpadded",
      "evidence_assets 不能用人工转写表格覆盖大多数主体信息；只有原文图表或天然适合表格呈现的结构化数据才应挂载表格。",
      {
        main_items: mainItems.length,
        main_evidence_assets: mainEvidenceAssets.length,
        manual_main_tables: manualMainTables.length
      }
    );
  }
}

function normalizeUrlForEvidenceGate(value) {
  return normalizeUrlIdentity(value);
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
  const candidatesFound = Number.isInteger(group.candidates_found) ? group.candidates_found : 0;
  const included = Number.isInteger(group.included) ? group.included : 0;
  if (included > candidatesFound) {
    throw new PublisherError("source_audit_count_inconsistent", `${pathName}.included cannot exceed candidates_found.`, {
      path: pathName,
      candidates_found: candidatesFound,
      included
    });
  }
}

function requireExpandedMainItemFormat(report) {
  const mainItems = Array.isArray(report.main_items) ? report.main_items : [];
  if (mainItems.length < 8) {
    return;
  }

  const bannedMetaPhrases = ["日报跟踪口径", "报道边界", "后续跟进", "反思建议", "对日报的反思"];
  const errors = [];

  mainItems.forEach((item, index) => {
    const bullets = Array.isArray(item.bullets) ? item.bullets.map((bullet) => String(bullet || "").trim()) : [];
    const text = bullets.join("\n");
    if (bullets.length < 2 || bullets.length > 4) {
      errors.push(`main_items[${index}].bullets must contain 2-4 factual bullets`);
    }
    if (!/\*\*[^*]+\*\*/.test(text)) {
      errors.push(`main_items[${index}] missing bold emphasis`);
    }
    if (!/==[^=]+==/.test(text)) {
      errors.push(`main_items[${index}] missing highlight marker`);
    }
    const totalChars = bullets.reduce((sum, bullet) => sum + bullet.length, 0);
    if (totalChars < 120) {
      errors.push(`main_items[${index}] summary is too thin`);
    }
    const metaPhrase = bannedMetaPhrases.find((phrase) => text.includes(phrase));
    if (metaPhrase) {
      errors.push(`main_items[${index}] contains report-meta phrase: ${metaPhrase}`);
    }
  });

  if (errors.length > 0) {
    throw new PublisherError(
      "main_items_format_weak",
      "Expanded main_items require 2-4 factual bullets with bold and highlight markers.",
      { errors }
    );
  }
}

function requireChineseGithubTrendingDescriptions(report) {
  const errors = [];
  for (const [index, item] of (Array.isArray(report.github_trending) ? report.github_trending : []).entries()) {
    const description = String(item?.description || "").trim();
    if (description && !hasChineseText(description)) {
      errors.push({
        code: "github_trending_description_not_chinese",
        path: `github_trending[${index}].description`,
        repo: item?.repo || item?.name || "",
        message: "GitHub Trending description must be a Chinese rewrite, not a copied English repo description."
      });
    }
  }

  if (errors.length > 0) {
    throw new PublisherError(
      "github_trending_description_not_chinese",
      "GitHub Trending description 必须中文改写，不能直接复制英文仓库描述。",
      { errors }
    );
  }
}

function hasChineseText(value) {
  return /\p{Script=Han}/u.test(String(value || ""));
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
