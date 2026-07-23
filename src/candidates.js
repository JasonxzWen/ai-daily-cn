import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { decodeJsonArtifact, encodeJsonArtifact } from "./compressed-json.js";
import { PublisherError } from "./errors.js";
import { reportRelativePaths } from "./paths.js";
import {
  compressedLegacyCandidatePoolRelativePath,
  internalCandidatePoolRelativePath,
  legacyCandidatePoolRelativePath,
  legacyInternalCandidatePoolRelativePath
} from "./reports-data-layout.js";
import { validateCandidatePool } from "./schema.js";
import {
  isPlatformExemptCategory,
  PLATFORM_CATEGORY_TO_SECTION,
  PLATFORM_SECTIONS,
  requirePlatformExemptItemContract
} from "./platform-exempt.js";
import { isMainRefillSelectionStage } from "./main-audit-contract.js";
import { effectiveCandidateVerification } from "./source-verification.js";

const REQUIRED_SECTIONS = {
  main_items: "main_item",
  github_trending: "github_trending",
  huggingface_trending: "huggingface_trending",
  model_releases: "model_release",
  hot_blogs: "hot_blog",
  projects: "project",
  builder_observations: "builder_observation",
  ...Object.fromEntries(Object.entries(PLATFORM_CATEGORY_TO_SECTION).map(([category, section]) => [section, category]))
};
const FACT_SECTION_NAMES = new Set(["main_items", "model_releases"]);
const NON_PRIMARY_DISCLOSURE_SECTIONS = new Set(["main_items", "hot_blogs", "projects", "builder_observations"]);
const PRIMARY_SOURCE_LEVELS = new Set(["primary", "official", "paper", "github", "multi_source", "model_registry"]);
const NON_PRIMARY_VERIFICATION_STATUSES = new Set(["intermediary_only", "original_social_only", "unverified"]);
const MAIN_REFILL_HIGH_RISK_ZH_RE = /禁用|停用|停止接入|暂停接入|暂停访问|模型访问/u;
const MAIN_REFILL_HIGH_RISK_RE = /\b(funding|raised|valuation|ipo|go public|acquisition|revenue|earnings|profit|pricing|price|benchmark|outperform|faster than|slower than|accuracy|leaderboard|safety|regulation|policy|lawsuit|ban|security|vulnerability|attack|government|minister|capability|capabilities|suspend(?:s|ed)? access|model access|access to new models|new model capabilities)\b|\b\d+(?:\.\d+)?x\s+faster\b|\$[\d,.]+\s*(?:m|b|million|billion)?|融资|估值|上市|收购|营收|财报|定价|价格|基准|跑分|安全|监管|政策|诉讼|禁令|漏洞|攻击|政府/u;

export async function readCandidatePool(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const reportDate = options.reportDate;
  const inputPath =
    options.inputPath || path.join(".tmp", `source-candidates-${reportDate}.json`);
  const candidatePath = path.resolve(rootDir, inputPath);

  try {
    const persisted = await readPersistedCandidatePool(candidatePath, reportDate);
    return {
      path: candidatePath,
      candidatePool: persisted.candidatePool
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new PublisherError("candidate_pool_missing", `缺少候选池文件：${candidatePath}`, {
        path: candidatePath
      });
    }
    throw error;
  }
}

export function normalizeCandidatePool(candidatePool, reportDate) {
  const validation = validateCandidatePool(candidatePool);
  if (!validation.valid) {
    throw new PublisherError("candidate_pool_schema_validation_failed", "候选池 JSON 未通过 schema 校验。", {
      errors: validation.errors
    });
  }

  const value = validation.value;
  const errors = [];
  if (value.report_date !== reportDate) {
    errors.push({
      path: "$.report_date",
      message: `候选池日期 ${value.report_date} 必须等于日报日期 ${reportDate}。`
    });
  }

  const sourceIds = new Set();
  for (const source of value.sources) {
    if (sourceIds.has(source.id)) {
      errors.push({ path: `$.sources[${source.id}]`, message: `source id 重复：${source.id}` });
    }
    sourceIds.add(source.id);
  }

  const candidateIds = new Set();
  for (const candidate of value.candidates) {
    if (candidateIds.has(candidate.id)) {
      errors.push({ path: `$.candidates[${candidate.id}]`, message: `candidate id 重复：${candidate.id}` });
    }
    candidateIds.add(candidate.id);
    if (!sourceIds.has(candidate.source_id)) {
      errors.push({
        path: `$.candidates[${candidate.id}].source_id`,
        message: `候选引用了不存在的 source_id：${candidate.source_id}`
      });
    }
  }

  if (errors.length > 0) {
    throw new PublisherError("candidate_pool_invalid", "候选池内部引用无效。", { errors });
  }

  return value;
}

export function requireCandidateCoverage(report, candidatePool) {
  if (!candidatePool) {
    throw new PublisherError("candidate_pool_missing", "结构化日报必须提供候选池，正文条目不得绕过候选池。");
  }

  const errors = collectCandidateCoverageIssues(report, candidatePool);
  if (errors.length > 0) {
    throw new PublisherError("candidate_pool_reference_invalid", "日报条目没有全部回指有效候选。", {
      errors
    });
  }
}

export function collectCandidateCoverageIssues(report, candidatePool) {
  const candidates = Array.isArray(candidatePool?.candidates) ? candidatePool.candidates : [];
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const errors = [];

  for (const [sectionName, expectedCategory] of Object.entries(REQUIRED_SECTIONS)) {
    const items = Array.isArray(report[sectionName]) ? report[sectionName] : [];
    items.forEach((item, index) => {
      const pathName = `${sectionName}[${index}]`;
      if (!item.candidate_id) {
        errors.push({ path: `${pathName}.candidate_id`, message: "入选条目必须回指 candidate_id。" });
        return;
      }

      const candidate = byId.get(item.candidate_id);
      if (!candidate) {
        errors.push({ path: `${pathName}.candidate_id`, message: `candidate_id 不存在：${item.candidate_id}` });
        return;
      }

      if (candidate.status !== "included") {
        errors.push({ path: `${pathName}.candidate_id`, message: `candidate_id 未标记 included：${item.candidate_id}` });
      }
      if (candidate.category !== expectedCategory) {
        errors.push({
          path: `${pathName}.candidate_id`,
          message: `candidate category 必须是 ${expectedCategory}，实际是 ${candidate.category}。`
        });
      }
      if (isPlatformExemptCategory(candidate.category) && !PLATFORM_SECTIONS.includes(sectionName)) {
        errors.push({
          path: `${pathName}.candidate_id`,
          message: `platform exempt candidate cannot enter ${sectionName}: ${item.candidate_id}`
        });
      }
      if (candidate.included_in && candidate.included_in !== sectionName) {
        errors.push({
          path: `${pathName}.candidate_id`,
          message: `candidate included_in 必须是 ${sectionName}，实际是 ${candidate.included_in}。`
        });
      }
      if (item.url !== candidate.url) {
        errors.push({ path: `${pathName}.url`, message: `条目 URL 必须与候选 URL 一致：${item.candidate_id}` });
      }
      if (item.event_date && item.event_date !== candidate.event_date) {
        errors.push({
          path: `${pathName}.event_date`,
          message: `条目 event_date 必须与候选 event_date 一致：${item.candidate_id}`
        });
      }
      if (PLATFORM_SECTIONS.includes(sectionName)) {
        try {
          requirePlatformExemptItemContract(item, { sectionName, candidate });
        } catch (error) {
          errors.push({
            path: `${pathName}.candidate_id`,
            message: error.message
          });
        }
        for (const field of ["platform", "source_id", "rule_id", "source_level", "verification_status", "exemption_policy", "published_by_gate"]) {
          if (candidate[field] !== undefined && item[field] !== candidate[field]) {
            errors.push({
              path: `${pathName}.${field}`,
              message: `platform exempt item ${field} must match candidate ${item.candidate_id}`
            });
          }
        }
      }
      const eligibility = evaluateLegacyReportEligibility({ sectionName, candidate, item });
      if (!eligibility.allowed && eligibility.reason_code === "primary_verification_required") {
        errors.push({
          path: `${pathName}.candidate_id`,
          message: `candidate_id 未完成一手或多源核验，不能进入 ${sectionName}：${item.candidate_id}`
        });
      }
      if (!eligibility.allowed && eligibility.reason_code === "non_primary_disclosure_required") {
        errors.push({
          path: `${pathName}.candidate_id`,
          message: `candidate_id 使用非一手来源进入 ${sectionName} 时必须在条目中披露 source_level、verification_status 和 verification_note/risk_note：${item.candidate_id}`
        });
      }
    });
  }

  return errors;
}

export function evaluateLegacyReportEligibility({ sectionName, candidate = {}, item = {} } = {}) {
  const effectiveCandidate = effectiveCandidateVerification(candidate);
  const verificationUpgraded =
    effectiveCandidate.verification_status !== candidate.verification_status ||
    effectiveCandidate.source_level !== candidate.source_level;
  const highRisk = isHighRiskMainRefillCandidate(effectiveCandidate, item) ||
    (sectionName === "projects" && isHighRiskFactCandidate(effectiveCandidate, item));
  const disclosureComplete = hasNonPrimaryDisclosure(effectiveCandidate, item);
  const primaryRequired = requiresPrimaryVerification(sectionName, effectiveCandidate, item);
  if (primaryRequired && !hasPrimaryVerification(effectiveCandidate)) {
    return {
      allowed: false,
      blocking: true,
      verdict: "blocked_primary_required",
      reason_code: "primary_verification_required",
      effective_verification_status: effectiveCandidate.verification_status || "",
      effective_source_level: effectiveCandidate.source_level || "",
      primary_url: effectiveCandidate.primary_url || "",
      verification_upgraded: verificationUpgraded,
      high_risk: highRisk,
      disclosure_complete: disclosureComplete
    };
  }

  const disclosureRequired = requiresNonPrimaryDisclosure(sectionName, effectiveCandidate, item);
  if (disclosureRequired && !disclosureComplete) {
    return {
      allowed: false,
      blocking: true,
      verdict: "blocked_missing_disclosure",
      reason_code: "non_primary_disclosure_required",
      effective_verification_status: effectiveCandidate.verification_status || "",
      effective_source_level: effectiveCandidate.source_level || "",
      primary_url: effectiveCandidate.primary_url || "",
      verification_upgraded: verificationUpgraded,
      high_risk: highRisk,
      disclosure_complete: false
    };
  }

  let verdict = "not_applicable";
  if (verificationUpgraded) {
    verdict = "trusted_primary_target_upgrade";
  } else if (hasPrimaryVerification(effectiveCandidate)) {
    verdict = effectiveCandidate.verification_status;
  } else if (sectionName === "main_items" && isMainRefillSelectionStage(effectiveCandidate.main_selection_stage)) {
    verdict = "disclosed_low_risk_refill";
  } else if (hasNonPrimarySignal(effectiveCandidate) || hasNonPrimarySignal(item)) {
    verdict = "disclosed_viewpoint_signal";
  }
  return {
    allowed: true,
    blocking: false,
    verdict,
    reason_code: "",
    effective_verification_status: effectiveCandidate.verification_status || "",
    effective_source_level: effectiveCandidate.source_level || "",
    primary_url: effectiveCandidate.primary_url || "",
    verification_upgraded: verificationUpgraded,
    high_risk: highRisk,
    disclosure_complete: disclosureComplete
  };
}

function requiresPrimaryVerification(sectionName, candidate, item = {}) {
  if (sectionName === "main_items" && allowsLowRiskMainRefill(candidate, item)) {
    return false;
  }
  if (FACT_SECTION_NAMES.has(sectionName)) {
    return Boolean(
      candidate.verification_status ||
      candidate.intermediary_url ||
      candidate.original_url ||
      item?.verification_status ||
      item?.source_level
    );
  }

  if (sectionName === "projects" && isHighRiskFactCandidate(candidate, item)) {
    return true;
  }

  return false;
}

function allowsLowRiskMainRefill(candidate, item = {}) {
  if (!isMainRefillSelectionStage(candidate?.main_selection_stage)) {
    return false;
  }
  const rejectReason = String(candidate?.main_reject_reason || "").trim();
  if (rejectReason && rejectReason !== "selected_main_item") {
    return false;
  }
  if (!hasNonPrimaryDisclosure(candidate, item)) {
    return false;
  }
  return !isHighRiskMainRefillCandidate(candidate, item);
}

function isHighRiskMainRefillCandidate(candidate, item = {}) {
  const text = [
    candidate?.title,
    candidate?.evidence,
    candidate?.summary,
    candidate?.notes,
    item?.title,
    item?.summary,
    ...(Array.isArray(item?.bullets) ? item.bullets : [])
  ].filter(Boolean).join(" ");
  return MAIN_REFILL_HIGH_RISK_RE.test(text) || MAIN_REFILL_HIGH_RISK_ZH_RE.test(text);
}

function hasPrimaryVerification(candidate) {
  return ["primary_confirmed", "multi_source_confirmed"].includes(candidate.verification_status);
}

function isHighRiskFactCandidate(candidate, item = {}) {
  const category = String(item?.editorial_category || candidate?.editorial_category || "").trim();
  return category === "funding";
}

function requiresNonPrimaryDisclosure(sectionName, candidate, item = {}) {
  if (!NON_PRIMARY_DISCLOSURE_SECTIONS.has(sectionName)) {
    return false;
  }
  if (requiresPrimaryVerification(sectionName, candidate, item)) {
    return false;
  }
  return hasNonPrimarySignal(candidate) || hasNonPrimarySignal(item);
}

function hasNonPrimarySignal(value = {}) {
  const status = String(value?.verification_status || "").trim();
  const sourceLevel = String(value?.source_level || "").trim();
  return Boolean(
    value?.intermediary_url ||
    value?.original_url ||
    NON_PRIMARY_VERIFICATION_STATUSES.has(status) ||
    (sourceLevel && !PRIMARY_SOURCE_LEVELS.has(sourceLevel))
  );
}

function hasNonPrimaryDisclosure(candidate, item = {}) {
  const status = String(item?.verification_status || candidate?.verification_status || "").trim();
  const sourceLevel = String(item?.source_level || candidate?.source_level || "").trim();
  const note = String(item?.verification_note || candidate?.verification_note || "").trim();
  const risk = String(item?.risk_note || candidate?.risk_note || "").trim();
  return Boolean(sourceLevel && status && (note || risk));
}

export async function writeCandidatePool(outputDir, reportDate, candidatePool) {
  const target = path.join(outputDir, ...internalCandidatePoolRelativePath(reportDate).split(path.sep));
  const persistedCandidatePool = normalizeCandidatePool(candidatePool, reportDate);
  const compressed = encodeJsonArtifact(persistedCandidatePool, target);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, compressed);
    await fs.rename(temporary, target);
    for (const relativePath of [
      legacyInternalCandidatePoolRelativePath(reportDate),
      compressedLegacyCandidatePoolRelativePath(reportDate),
      legacyCandidatePoolRelativePath(reportDate)
    ]) {
      await fs.rm(path.join(outputDir, ...relativePath.split(path.sep)), { force: true });
    }
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
  return target;
}

export async function readPersistedCandidatePool(filePath, reportDate = "") {
  const raw = await fs.readFile(filePath);
  const parsed = decodeJsonArtifact(raw);
  return {
    path: filePath,
    raw,
    candidatePool: normalizeCandidatePool(parsed, reportDate || parsed.report_date)
  };
}

export function candidatePoolOutputPath(reportDate) {
  const [year, month] = reportDate.split("-");
  return path.join(year, month, `${reportDate}.candidates.json`);
}

export function reportCandidatePoolPublicPath(reportDate) {
  return reportRelativePaths(reportDate).candidateDataPath;
}
