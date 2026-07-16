import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { isPlaceholderSentinelText, validatePersistedAifyTodayItem } from "./aify-today-picks.js";
import { PublisherError } from "./errors.js";
import { containsSecretLikeText } from "./privacy.js";
import {
  canonicalPublicUrlIdentity,
  hasUnsafePublicHttpUrlMaterial,
  isSafePublicHttpUrl
} from "./public-url.js";
import { isValidDateString, isValidDateTimeString } from "./time.js";

const DEFAULT_CONTRACT_PATH = path.join("config", "signal-admission-contract.json");
const INTERNAL_INSTRUCTION_PATTERN = /treat\s+this\s+as|trace\s+it\s+to|ignore\s+(?:all\s+)?(?:previous|prior)\s+instructions|selection_reason|入选标准|优先核查|给\s*AI\s*看的/i;
const CORPORATE_PR_PATTERN = /\b(?:partnership|partnered|partners?\s+with|partnering\s+with|collaboration|award|sponsor(?:ship)?|brand\s+campaign)\b|合作(?:伙伴|协议|签约|公告)?|战略签约|荣获|参会/i;
const PROMOTION_PATTERN = /\b(?:hiring|recruit(?:ing|ment)?|register\s+now|discount|coupon|sale|meet\s+the\s+hiring\s+team)\b|招聘|报名|优惠|促销|销售活动/i;
const HTML_OR_CONTROL_PATTERN = /<\/?[A-Za-z][^>]*(?:>|$)|[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

export async function loadSignalAdmissionContract(options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const contractPath = path.resolve(rootDir, options.contractPath || DEFAULT_CONTRACT_PATH);
  let contract;
  try {
    contract = JSON.parse(await fs.readFile(contractPath, "utf8"));
  } catch (error) {
    throw new PublisherError("signal_admission_contract_invalid", "Signal admission contract must be readable JSON.", {
      path: toRepoPath(rootDir, contractPath),
      cause: error?.message || "read_failed"
    });
  }
  const requiredArrays = [
    "non_content_exact_paths",
    "promotion_path_segments",
    "ai_relevance_terms",
    "relevance_content_hints",
    "relevance_content_tags",
    "corporate_technical_substance_terms",
    "rejection_codes",
    "needs_review_codes"
  ];
  if (
    contract?.schema_version !== 1 ||
    contract?.contract_id !== "signal-admission-contract" ||
    typeof contract?.version !== "string" ||
    !contract.version ||
    !Number.isInteger(contract?.retention_hours) ||
    contract.retention_hours <= 0 ||
    !Number.isInteger(contract?.freshness?.max_age_days) ||
    contract.freshness.max_age_days < 0 ||
    requiredArrays.some((key) => !Array.isArray(contract?.[key])) ||
    contract?.trusted_upstream?.source_id !== "aify_today_picks" ||
    contract?.trusted_upstream?.review_policy !== "aify_today_passthrough_v1"
  ) {
    throw new PublisherError("signal_admission_contract_invalid", "Signal admission contract failed its deterministic shape gate.", {
      path: toRepoPath(rootDir, contractPath)
    });
  }
  return structuredClone(contract);
}

export function classifySignalAdmission(observation, options = {}) {
  const contract = options.contract || {};
  const reportDate = String(options.reportDate || "").trim();
  const topic = topicAndFormat(observation);
  const result = (disposition, reasonCode) => ({
    disposition,
    reason_code: reasonCode,
    topic_path: topic.topic_path,
    content_format: topic.content_format
  });
  const trustedUpstream = trustedUpstreamForObservation(observation, contract);
  const materialUrl = String(trustedUpstream?.url || observation?.material_url || "").trim();
  if (!isValidDateString(reportDate)) return result("needs_review", "event_date_unverified");
  if (hasUnsafePublicHttpUrlMaterial(materialUrl) || !isSafePublicHttpUrl(materialUrl)) {
    return result("rejected", "unsafe_url");
  }
  if (matchesNonContentEndpoint(materialUrl, contract)) {
    return result("rejected", "non_content_endpoint");
  }
  if (existingSignalHasContentHash(materialUrl, observation?.content_hash, options.existingSignals)) {
    return result("rejected", "duplicate_no_new_state");
  }
  if (!options.historicalFixtureMode && isStaleObservation(observation, reportDate, contract)) {
    return result("rejected", "stale_without_update");
  }
  if (trustedUpstream) {
    const persistedValidation = validatePersistedAifyTodayItem(trustedUpstream, { reportDate });
    if (!persistedValidation.valid) return result("rejected", aifyMechanicalRejectionCode(persistedValidation.reason));
    return result("admitted", "admitted");
  }

  const text = admissionText(observation, contract);
  const pathParts = decodedPathParts(materialUrl);
  if (matchesPromotionPath(pathParts, contract) || PROMOTION_PATTERN.test(text)) {
    return result("rejected", "promotion_or_hiring");
  }
  if (isPlaceholderText(observation?.title) || isPlaceholderText(observation?.excerpt)) {
    return result("rejected", "test_or_placeholder");
  }
  if (INTERNAL_INSTRUCTION_PATTERN.test(text)) return result("rejected", "internal_instruction_copy");
  if (HTML_OR_CONTROL_PATTERN.test(text)) return result("rejected", "empty_or_unparsed");
  if (CORPORATE_PR_PATTERN.test(text) && !hasCorporateTechnicalSubstance(text, contract.corporate_technical_substance_terms)) {
    return result("rejected", "corporate_pr_without_substance");
  }
  if (!isAiRelevant(observation, text, contract)) return result("rejected", "off_topic");

  if (!verifiedEventDateOrigin(observation, contract)) return result("needs_review", "event_date_unverified");
  if (!resolvedPublisher(observation, contract)) return result("needs_review", "publisher_unresolved");
  return result("admitted", "admitted");
}

export function buildSignalAdmissionBatch(rawObservations, options = {}) {
  const contract = options.contract || {};
  const reportDate = String(options.reportDate || rawObservations?.report_date || "");
  const generatedAt = String(options.generatedAt || rawObservations?.generated_at || "");
  const observations = [...(Array.isArray(rawObservations?.observations) ? rawObservations.observations : [])]
    .sort(compareObservationIdentity);
  const admissionReceipts = [];
  const admitted = [];
  const quarantineItems = [];
  for (const observation of observations) {
    const classification = classifySignalAdmission(observation, {
      ...options,
      contract,
      reportDate
    });
    const trustedUpstream = trustedUpstreamForObservation(observation, contract);
    const canonicalUrl = canonicalPublicUrlIdentity(trustedUpstream?.url || observation?.material_url || "");
    const representedInputCount = representedCount(observation);
    const signalId = classification.disposition === "admitted" ? signalIdForCanonicalUrl(canonicalUrl) : null;
    const receipt = {
      receipt_id: `adm_${digest([
        observation.id,
        classification.disposition,
        classification.reason_code,
        canonicalUrl,
        contract.version
      ].join("|"))}`,
      raw_observation_id: observation.id,
      observation_id: observation.observation_id,
      source_id: observation.source_id,
      disposition: classification.disposition,
      reason_code: classification.reason_code,
      represented_input_count: representedInputCount,
      canonical_url_hash: sha256(canonicalUrl),
      signal_id: signalId
    };
    admissionReceipts.push(receipt);
    if (classification.disposition === "admitted") {
      admitted.push({ observation, classification, receipt, canonicalUrl, signalId });
    } else {
      quarantineItems.push(quarantineItem(observation, classification, representedInputCount));
    }
  }
  const expiresAt = new Date(Date.parse(generatedAt) + Number(contract.retention_hours || 24) * 60 * 60 * 1000).toISOString();
  return {
    admissionReceipts,
    admitted,
    quarantine: {
      schema_version: 1,
      kind: "signal_quarantine",
      report_date: reportDate,
      generated_at: generatedAt,
      expires_at: expiresAt,
      item_count: quarantineItems.length,
      items: quarantineItems
    }
  };
}

export async function cleanupExpiredSignalAdmissionTemp(options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const nowMs = Date.parse(options.now || new Date().toISOString());
  const retentionHours = positiveInteger(options.retentionHours, 24);
  if (!Number.isFinite(nowMs)) {
    throw new PublisherError("signal_admission_cleanup_time_invalid", "Signal admission cleanup requires a valid time.");
  }
  const cutoffMs = nowMs - retentionHours * 60 * 60 * 1000;
  const relativeRoots = [
    path.join(".tmp", "ai-daily", "materials"),
    path.join(".tmp", "ai-daily", "quarantine")
  ];
  const removed = [];
  const skippedLinks = [];
  for (const relativeRoot of relativeRoots) {
    const targetRoot = path.resolve(rootDir, relativeRoot);
    if (!isInside(rootDir, targetRoot)) {
      throw new PublisherError("signal_admission_cleanup_path_unsafe", "Signal admission cleanup path escaped the repository.");
    }
    let entries;
    try {
      entries = await fs.readdir(targetRoot, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const candidate = path.join(targetRoot, entry.name);
      const stats = await fs.lstat(candidate);
      if (stats.isSymbolicLink()) {
        skippedLinks.push(toRepoPath(rootDir, candidate));
        continue;
      }
      if (stats.mtimeMs > cutoffMs) continue;
      if (!isInside(targetRoot, candidate)) {
        throw new PublisherError("signal_admission_cleanup_path_unsafe", "Signal admission cleanup target escaped its owned root.");
      }
      await fs.rm(candidate, { recursive: stats.isDirectory(), force: true });
      removed.push(toRepoPath(rootDir, candidate));
    }
  }
  return { removed, skipped_links: skippedLinks };
}

export function sourceRoleForObservation(observation) {
  const group = String(observation?.source_group || "");
  const text = admissionText(observation).toLowerCase();
  if (group === "official_blogs" && /engineering|harness|架构|工程|实现/.test(text)) return "官方工程博客";
  if (group === "official_blogs") return "官方发布";
  if (group === "x_updates") return "独立开发者";
  if (group === "github_trending") return "开源仓库";
  if (group === "papers_models") return "研究 / 评测";
  if (group === "news_newsletters") return "新闻 / Newsletter";
  if (group === "community_discussions") return "社区来源";
  return "内容来源";
}

export function mapPreAdmissionReason(reason) {
  const value = String(reason || "");
  if (["url_unsafe", "material_url_unsafe", "source_url_unsafe", "redirect_url_unsafe"].includes(value)) return "unsafe_url";
  if (value === "non_content_endpoint") return value;
  if (["placeholder_content", "title_missing", "summary_missing"].includes(value)) return "test_or_placeholder";
  if (value === "internal_instruction_content") return "internal_instruction_copy";
  return "empty_or_unparsed";
}

export function buildPreAdmissionReceipts(rawObservations, options = {}) {
  const contractVersion = String(options.contract?.version || "unknown");
  const receipts = [];
  for (const item of rawObservations?.normalization_errors || []) {
    const sourceReason = safeReasonCode(item?.reason);
    receipts.push({
      receipt_id: `pre_${digest(["normalization_error", item?.index, sourceReason, contractVersion].join("|"))}`,
      kind: "normalization_error",
      source_id: null,
      input_index: Number.isInteger(item?.index) ? item.index : null,
      upstream_position: null,
      source_reason: sourceReason,
      reason_code: mapPreAdmissionReason(sourceReason),
      represented_input_count: 1,
      upstream_payload_hash: null
    });
  }
  for (const item of rawObservations?.rejections || []) {
    const sourceReason = safeReasonCode(item?.reason);
    receipts.push({
      receipt_id: `pre_${digest(["parser_rejection", item?.source_id, item?.upstream_position, sourceReason, item?.upstream_payload_hash, contractVersion].join("|"))}`,
      kind: "parser_rejection",
      source_id: String(item?.source_id || "") || null,
      input_index: null,
      upstream_position: Number.isInteger(item?.upstream_position) ? item.upstream_position : null,
      source_reason: sourceReason,
      reason_code: mapPreAdmissionReason(sourceReason),
      represented_input_count: 1,
      upstream_payload_hash: /^sha256:[a-f0-9]{64}$/.test(String(item?.upstream_payload_hash || ""))
        ? item.upstream_payload_hash
        : null
    });
  }
  return receipts.sort((left, right) => left.receipt_id.localeCompare(right.receipt_id));
}

export function isPlaceholderText(value) {
  return isPlaceholderSentinelText(value);
}

function safeReasonCode(value) {
  const normalized = String(value || "empty_or_unparsed")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || "empty_or_unparsed";
}

function topicAndFormat(observation) {
  const group = String(observation?.source_group || "");
  const hint = String(observation?.content_format_hint || "").toLowerCase();
  const text = admissionText(observation).toLowerCase();
  const tags = new Set(Array.isArray(observation?.content_tags) ? observation.content_tags : []);
  if (tags.has("engineering_practice") || /engineering|harness|runtime|orchestrat|架构|工程实践|智能体工程/.test(text)) {
    return { topic_path: ["工程与开源", "工程实践"], content_format: group === "x_updates" ? "X 帖子 / Thread" : "文章 / 博客" };
  }
  if (group === "x_updates" || /builder_observation|x_post|tweet/.test(hint)) {
    return { topic_path: ["工程与开源", "工程实践"], content_format: "X 帖子 / Thread" };
  }
  if (group === "github_trending" || /project|repository|github/.test(hint)) {
    return { topic_path: ["工程与开源", "开发工具 / 框架"], content_format: "GitHub 仓库" };
  }
  if (/benchmark|leaderboard/.test(hint) || /benchmark|榜单|评测/.test(text)) {
    return { topic_path: ["研究与评测", "评测 / Benchmark"], content_format: "Benchmark" };
  }
  if (/paper|arxiv/.test(hint)) {
    return { topic_path: ["研究与评测", "论文 / 方法"], content_format: "论文" };
  }
  if (/model/.test(hint)) {
    return { topic_path: ["研究与评测", "模型 / 数据集"], content_format: "模型" };
  }
  if (group === "news_newsletters" || /newsletter|digest|feed/.test(hint)) {
    return { topic_path: ["产品与能力", "Agent / 应用"], content_format: "Newsletter / Digest" };
  }
  return { topic_path: ["产品与能力"], content_format: "文章 / 博客" };
}

function matchesPromotionPath(pathParts, contract) {
  const segments = new Set((contract?.promotion_path_segments || []).map((item) => String(item).toLowerCase()));
  return pathParts.some((part) => segments.has(part));
}

function matchesNonContentEndpoint(value, contract) {
  try {
    const url = new URL(value);
    const pathname = decodeURIComponent(url.pathname).replace(/\/+$/, "") || "/";
    const exact = new Set((contract?.non_content_exact_paths || []).map((item) => String(item).replace(/\/+$/, "") || "/"));
    return exact.has(pathname.toLowerCase());
  } catch {
    return true;
  }
}

function decodedPathParts(value) {
  try {
    return decodeURIComponent(new URL(value).pathname).toLowerCase().split("/").filter(Boolean);
  } catch {
    return [];
  }
}

function isAiRelevant(observation, text, contract) {
  const hint = String(observation?.content_format_hint || "").toLowerCase();
  const configuredHints = new Set((contract?.relevance_content_hints || []).map((value) => String(value).toLowerCase()));
  if (configuredHints.has(hint)) return true;
  const tags = new Set((observation?.content_tags || []).map((value) => String(value).toLowerCase()));
  if ((contract?.relevance_content_tags || []).some((value) => tags.has(String(value).toLowerCase()))) return true;
  return (contract?.ai_relevance_terms || []).some((term) => relevanceTermMatches(text, term));
}

function relevanceTermMatches(text, term) {
  const needle = String(term || "").trim().toLowerCase();
  if (!needle) return false;
  const haystack = String(text || "").toLowerCase();
  if (/^[a-z0-9][a-z0-9 +._/-]*$/i.test(needle)) {
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, "i").test(haystack);
  }
  return haystack.includes(needle);
}

function hasCorporateTechnicalSubstance(text, values) {
  const normalized = String(text || "").toLowerCase();
  for (const value of Array.isArray(values) ? values : []) {
    const term = String(value || "").toLowerCase();
    if (!term) continue;
    let offset = 0;
    while (offset < normalized.length) {
      const index = normalized.indexOf(term, offset);
      if (index < 0) break;
      const prefix = normalized.slice(Math.max(0, index - 48), index);
      const negated = /(?:\b(?:no|without|lacks?|lacking|missing)\b(?:[\s,:-]+\w+){0,3}[\s,:-]*|(?:没有|不含|未提供|缺少|缺乏)[^。；，,]{0,16})$/i.test(prefix);
      if (!negated) return true;
      offset = index + term.length;
    }
  }
  return false;
}

function isStaleObservation(observation, reportDate, contract) {
  const trustedUpstream = observation?.source_id === contract?.trusted_upstream?.source_id
    ? observation?.upstream
    : null;
  const eventDate = String(trustedUpstream?.date || observation?.event_date || "");
  if (!isValidDateString(eventDate)) return false;
  const ageDays = Math.floor((Date.parse(`${reportDate}T00:00:00.000Z`) - Date.parse(`${eventDate}T00:00:00.000Z`)) / 86_400_000);
  return ageDays > Number(contract?.freshness?.max_age_days ?? 2);
}

function verifiedEventDateOrigin(observation, contract) {
  const trustedUpstream = trustedUpstreamForObservation(observation, contract);
  if (trustedUpstream?.date && isValidDateString(trustedUpstream.date)) return true;
  if (["source", "published_at", "upstream_editorial"].includes(observation?.event_date_origin)) return true;
  if (!observation?.event_date_origin && isValidDateTimeString(observation?.published_at)) return true;
  return false;
}

function resolvedPublisher(observation, contract) {
  const trustedUpstream = trustedUpstreamForObservation(observation, contract);
  const value = String(trustedUpstream?.source || observation?.publisher_hint || "").trim();
  return Boolean(value && !/^(?:unknown|unknown-source|runtime source)$/i.test(value));
}

function existingSignalHasContentHash(materialUrl, contentHash, existingSignals) {
  const canonical = canonicalPublicUrlIdentity(materialUrl);
  let existing = null;
  if (existingSignals instanceof Map) existing = existingSignals.get(canonical);
  if (Array.isArray(existingSignals)) {
    existing = existingSignals.find((item) => item?.canonical_url === canonical) || null;
  }
  if (!existing) return false;
  if (typeof existing === "string") return existing === contentHash;
  const hashes = new Set([
    existing.content_hash,
    ...(Array.isArray(existing.observation_content_hashes) ? existing.observation_content_hashes : [])
  ].filter(Boolean));
  return hashes.has(contentHash);
}

function quarantineItem(observation, classification, representedInputCount) {
  const materialUrl = String(observation?.material_url || "");
  let host = null;
  try {
    if (isSafePublicHttpUrl(materialUrl)) host = new URL(materialUrl).hostname.toLowerCase();
  } catch {
    host = null;
  }
  const excerpt = safeExcerpt(observation?.excerpt);
  return {
    raw_observation_id: observation.id,
    observation_id: observation.observation_id,
    source_id: observation.source_id,
    disposition: classification.disposition,
    reason_code: classification.reason_code,
    represented_input_count: representedInputCount,
    material_host: host,
    material_url_hash: /^sha256:[a-f0-9]{64}$/.test(String(observation?.material_url_hash || ""))
      ? observation.material_url_hash
      : sha256(materialUrl),
    safe_excerpt: excerpt
  };
}

function safeExcerpt(value) {
  const text = String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text || containsSecretLikeText(text)) return null;
  return text.slice(0, 160).trim() || null;
}

function admissionText(observation, contract) {
  const trustedSummary = trustedUpstreamForObservation(observation, contract)?.summary;
  return [
    observation?.title,
    trustedSummary,
    observation?.excerpt,
    observation?.publisher_hint,
    ...(Array.isArray(observation?.content_tags) ? observation.content_tags : [])
  ].map((item) => String(item || "")).join(" ");
}

function trustedUpstreamForObservation(observation, contract) {
  return observation?.source_id === contract?.trusted_upstream?.source_id
    ? observation?.upstream || null
    : null;
}

function aifyMechanicalRejectionCode(reason) {
  if (reason === "placeholder_content") return "test_or_placeholder";
  if (reason === "internal_instruction_content") return "internal_instruction_copy";
  if (["material_url_unsafe", "source_url_unsafe", "https_required"].includes(reason)) return "unsafe_url";
  if (reason === "non_content_endpoint") return "non_content_endpoint";
  return "empty_or_unparsed";
}

function representedCount(observation) {
  if (observation?.source_id === "aify_today_picks") {
    return Math.max(1, Number(observation?.upstream?.upstream_positions?.length || 0));
  }
  return Math.max(1, Number(observation?.raw_record_count || 0));
}

function compareObservationIdentity(left, right) {
  return String(left?.id || "").localeCompare(String(right?.id || ""));
}

function signalIdForCanonicalUrl(value) {
  return `sig_${digest(value)}`;
}

function digest(value) {
  return createHash("sha256").update(String(value || "")).digest("hex").slice(0, 24);
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(String(value || "")).digest("hex")}`;
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function isInside(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return !relative || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function toRepoPath(rootDir, value) {
  return path.relative(rootDir, value).split(path.sep).join("/");
}
