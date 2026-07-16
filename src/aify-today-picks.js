import { createHash } from "node:crypto";

import {
  canonicalPublicUrlIdentity,
  hasUnsafePublicHttpUrlMaterial,
  sanitizePublicHttpUrl
} from "./public-url.js";
import { containsSecretLikeText } from "./privacy.js";

export const AIFY_TODAY_SOURCE_KIND = "aify_today_html";
export const AIFY_TODAY_LANE_ID = "aify_today_picks";
export const AIFY_SITE_WATCH_ID = "site-aify-news";

const DEFAULT_MAX_RESPONSE_BYTES = 1_500_000;
const DEFAULT_MAX_REDIRECTS = 3;
const DEFAULT_FETCH_TIMEOUT_MS = 15_000;
const EXECUTABLE_SCRIPT_TYPES = new Set([
  "module",
  "text/javascript",
  "application/javascript",
  "text/ecmascript",
  "application/ecmascript"
]);
const REGEX_PREFIX_KEYWORDS = new Set([
  "return", "throw", "yield", "case", "delete", "typeof", "void", "await", "else", "do", "in", "of"
]);
const MAX_TITLE_LENGTH = 300;
const MAX_SUMMARY_LENGTH = 3_000;
const MAX_SOURCE_LENGTH = 200;
const MAX_TAG_LENGTH = 160;
const ENCODED_TEST_SENTINEL_PATTERN = /^test(?:\d+|_[a-z0-9]+)\b/i;
const TEST_HYPHEN_SENTINEL_PATTERN = /^test-(?:only|placeholder|fixture|row|content)\b/i;
const PLACEHOLDER_SEMANTIC_PATTERN = /^(?:test|placeholder|fixture)(?:\s+(?:only|placeholder|fixture|row|content))*$/i;
const OTHER_PLACEHOLDER_SENTINEL_PATTERN = /^(?:lorem\s+ipsum\b|测试占位(?:内容)?$|占位内容$)/i;
const INTERNAL_INSTRUCTION_PATTERN = /ignore (?:all |the )?(?:previous|prior) instructions|system prompt|selection_reason|入选标准|给\s*AI\s*看的|treat\s+this\s+as\s+(?:an?\s+)?priority\s+lead|trace\s+it\s+to\s+(?:the\s+)?original\s+source|优先核查/i;
const HTML_OR_CONTROL_PATTERN = /<\/?[A-Za-z][^>]*(?:>|$)|[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/i;
const NON_CONTENT_SEGMENTS = new Set([
  "career", "careers", "job", "jobs", "event", "events", "product", "products",
  "contact", "login", "log-in", "signin", "sign-in", "signup", "sign-up", "pricing"
]);
const NON_CONTENT_LANDING_SEGMENTS = new Set(["blog", "news"]);

export async function collectAifyTodayPicks(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const reportDate = String(options.reportDate || "").trim();
  const sourceUrl = String(options.sourceUrl || "").trim();
  const maxResponseBytes = positiveInteger(options.maxResponseBytes, DEFAULT_MAX_RESPONSE_BYTES);
  const maxRedirects = positiveInteger(options.maxRedirects, DEFAULT_MAX_REDIRECTS);
  if (typeof fetchImpl !== "function") {
    return createAifyTodayPicksFailure(sourceUrl, "fetch_unavailable");
  }

  let origin;
  try {
    origin = new URL(sourceUrl);
  } catch {
    return createAifyTodayPicksFailure(sourceUrl, "source_url_invalid");
  }
  if (hasUnsafePublicHttpUrlMaterial(sourceUrl)) return createAifyTodayPicksFailure("", "source_url_unsafe");
  if (origin.protocol !== "https:") return createAifyTodayPicksFailure(sourceUrl, "https_required");

  const timeoutController = options.signal ? null : new AbortController();
  const timeoutHandle = timeoutController
    ? setTimeout(() => timeoutController.abort(), positiveInteger(options.fetchTimeoutMs, DEFAULT_FETCH_TIMEOUT_MS))
    : null;
  const fetchSignal = options.signal || timeoutController.signal;
  let currentUrl = origin.toString();
  let redirectCount = 0;
  try {
    while (true) {
      const response = await fetchImpl(currentUrl, {
        redirect: "manual",
        signal: fetchSignal,
        headers: {
          accept: "text/html",
          "user-agent": "ai-daily-cn-curated-shadow/1.0"
        }
      });
      const status = Number(response?.status || 0);
      if ([301, 302, 303, 307, 308].includes(status)) {
        if (redirectCount >= maxRedirects) return createAifyTodayPicksFailure(sourceUrl, "redirect_limit_exceeded", { http_status: status, redirect_count: redirectCount });
        const location = response?.headers?.get?.("location") || "";
        let next;
        try {
          next = new URL(location, currentUrl);
        } catch {
          return createAifyTodayPicksFailure(sourceUrl, "redirect_location_invalid", { http_status: status, redirect_count: redirectCount });
        }
        if (next.protocol !== "https:") return createAifyTodayPicksFailure(sourceUrl, "redirect_https_required", { http_status: status, redirect_count: redirectCount });
        if (next.hostname.toLowerCase() !== origin.hostname.toLowerCase()) {
          return createAifyTodayPicksFailure(sourceUrl, "redirect_host_mismatch", { http_status: status, redirect_count: redirectCount });
        }
        if (hasUnsafePublicHttpUrlMaterial(next.toString())) {
          return createAifyTodayPicksFailure(sourceUrl, "redirect_url_unsafe", { http_status: status, redirect_count: redirectCount });
        }
        currentUrl = sanitizePublicHttpUrl(next.toString());
        redirectCount += 1;
        continue;
      }
      if (status !== 200 || response?.ok !== true) {
        return createAifyTodayPicksFailure(sourceUrl, "http_status_invalid", { http_status: status, redirect_count: redirectCount });
      }
      const contentType = String(response?.headers?.get?.("content-type") || "");
      if (!contentType.toLowerCase().startsWith("text/html")) {
        return createAifyTodayPicksFailure(sourceUrl, "content_type_invalid", { http_status: status, redirect_count: redirectCount });
      }
      const read = await readResponseTextWithLimit(response, maxResponseBytes);
      if (!read.ok) {
        return createAifyTodayPicksFailure(sourceUrl, read.error, {
          http_status: status,
          redirect_count: redirectCount,
          response_bytes: read.response_bytes
        });
      }
      const rawResponseUrl = String(response.url || currentUrl);
      if (hasUnsafePublicHttpUrlMaterial(rawResponseUrl)) {
        return createAifyTodayPicksFailure(sourceUrl, "response_url_unsafe", { http_status: status, redirect_count: redirectCount });
      }
      const responseUrl = sanitizePublicHttpUrl(rawResponseUrl);
      const contentLane = parseAifyTodayPicksHtml(read.text, {
        reportDate,
        sourceUrl,
        responseUrl,
        contentType,
        maxResponseBytes
      });
      const contentParsed = ["success_with_items", "healthy_empty"].includes(contentLane.status);
      const siteStructureParsed = contentParsed || contentLane.failure_reason === "all_items_rejected";
      return {
        source_url: sourceUrl,
        site_health: {
          lane_id: AIFY_SITE_WATCH_ID,
          logical_source_id: "aify-news",
          source_entry_id: AIFY_SITE_WATCH_ID,
          status: siteStructureParsed ? "success_with_items" : "failed",
          failure_reason: siteStructureParsed ? "" : contentLane.failure_reason,
          http_status: status,
          response_url: responseUrl,
          response_bytes: read.response_bytes,
          redirect_count: redirectCount,
          fetched_count: 1,
          parsed_count: siteStructureParsed ? 1 : 0
        },
        content_lane: {
          ...contentLane,
          http_status: status,
          response_url: responseUrl,
          response_bytes: read.response_bytes,
          redirect_count: redirectCount,
          fetched_count: 1,
          parsed_count: contentLane.items.length,
          cache_fallback_used: false
        }
      };
    }
  } catch (error) {
    return createAifyTodayPicksFailure(sourceUrl, fetchSignal.aborted ? "fetch_timeout" : "fetch_failed", {
      error_code: safeErrorCode(error),
      redirect_count: redirectCount
    });
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

export function parseAifyTodayPicksHtml(html, options = {}) {
  const reportDate = String(options.reportDate || "").trim();
  const sourceUrl = String(options.sourceUrl || "").trim();
  const responseUrl = String(options.responseUrl || sourceUrl).trim();
  const contentType = String(options.contentType || "").toLowerCase();
  const maxResponseBytes = positiveInteger(options.maxResponseBytes, DEFAULT_MAX_RESPONSE_BYTES);
  const body = typeof html === "string" ? html : "";
  const snapshotHash = sha256(body);
  const base = {
    lane_id: AIFY_TODAY_LANE_ID,
    logical_source_id: "aify-news",
    source_entry_id: AIFY_TODAY_LANE_ID,
    source_kind: AIFY_TODAY_SOURCE_KIND,
    source_url: sourceUrl,
    upstream_snapshot_hash: snapshotHash,
    upstream_selection_date: "",
    input_count: 0,
    item_count: 0,
    rejection_count: 0,
    rejected_items: [],
    items: []
  };

  const transportError = validateTransportEnvelope({
    sourceUrl,
    responseUrl,
    contentType,
    body,
    maxResponseBytes
  });
  if (transportError) return failedResult(base, transportError);
  if (!hasTodayPicksSurface(body)) return failedResult(base, "today_section_marker_missing");

  const articleLiteral = extractUniqueJsonAssignment(body, "ARTICLES_TODAY", "[");
  if (!articleLiteral.ok) return failedResult(base, articleLiteral.error);
  const siteLiteral = extractUniqueJsonAssignment(body, "SITE", "{");
  if (!siteLiteral.ok) return failedResult(base, siteLiteral.error);

  let rows;
  let site;
  try {
    rows = JSON.parse(articleLiteral.literal);
    site = JSON.parse(siteLiteral.literal);
  } catch {
    return failedResult(base, "embedded_json_invalid");
  }
  if (!Array.isArray(rows)) return failedResult(base, "articles_today_not_array");
  const selectionDate = typeof site?.last_updated === "string" ? site.last_updated : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(selectionDate)) return failedResult(base, "site_last_updated_invalid");
  if (selectionDate !== reportDate) return failedResult({ ...base, upstream_selection_date: selectionDate }, "snapshot_stale");

  const resultBase = {
    ...base,
    upstream_selection_date: selectionDate,
    input_count: rows.length
  };
  const allowedDates = new Set([reportDate, previousDate(reportDate)]);
  const accepted = [];
  const rejected = [];
  for (const [index, row] of rows.entries()) {
    const normalized = normalizeUpstreamItem(row, {
      upstreamPosition: index + 1,
      selectionDate,
      snapshotHash,
      allowedDates
    });
    if (normalized.error) {
      rejected.push({
        upstream_position: index + 1,
        reason: normalized.error,
        upstream_payload_hash: sha256(stableJson(row))
      });
    } else {
      accepted.push(normalized.item);
    }
  }

  const deduped = dedupeCanonicalItems(accepted, rejected);
  const items = deduped.items;
  const rejectedItems = deduped.rejected;
  const counts = {
    item_count: items.length,
    rejection_count: rejectedItems.length,
    rejected_items: rejectedItems,
    items
  };
  if (rows.length === 0) {
    return { ...resultBase, ...counts, status: "healthy_empty", failure_reason: "" };
  }
  if (items.length === 0) {
    return { ...resultBase, ...counts, status: "failed", failure_reason: "all_items_rejected" };
  }
  return { ...resultBase, ...counts, status: "success_with_items", failure_reason: "" };
}

export function validatePersistedAifyTodayItem(item, options = {}) {
  const reportDate = String(options.reportDate || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) return { valid: false, reason: "report_date_invalid" };
  if (item?.upstream_selection_date !== reportDate) return { valid: false, reason: "snapshot_stale" };
  const normalized = normalizeUpstreamItem(item, {
    upstreamPosition: item?.upstream_position,
    selectionDate: item?.upstream_selection_date,
    snapshotHash: item?.upstream_snapshot_hash,
    allowedDates: new Set([reportDate, previousDate(reportDate)])
  });
  if (normalized.error) return { valid: false, reason: normalized.error };
  const projected = normalized.item;
  for (const key of [
    "title",
    "url",
    "summary",
    "date",
    "source",
    "quality_score",
    "flavors",
    "domain",
    "channels_l1",
    "channels_l2",
    "companies",
    "products",
    "upstream_tags",
    "upstream_selection_date",
    "upstream_position",
    "upstream_payload_hash",
    "upstream_snapshot_hash"
  ]) {
    if (stableJson(item?.[key]) !== stableJson(projected[key])) {
      return { valid: false, reason: "persisted_payload_mismatch" };
    }
  }
  const positions = item?.upstream_positions;
  if (
    !Array.isArray(positions) ||
    positions.length === 0 ||
    positions[0] !== item.upstream_position ||
    positions.some((position) => !Number.isInteger(position) || position < 1) ||
    new Set(positions).size !== positions.length ||
    positions.some((position, index) => index > 0 && position <= positions[index - 1])
  ) {
    return { valid: false, reason: "upstream_positions_invalid" };
  }
  return { valid: true, reason: null };
}

function validateTransportEnvelope({ sourceUrl, responseUrl, contentType, body, maxResponseBytes }) {
  let source;
  let response;
  try {
    source = new URL(sourceUrl);
    response = new URL(responseUrl);
  } catch {
    return "source_url_invalid";
  }
  if (hasUnsafePublicHttpUrlMaterial(sourceUrl) || hasUnsafePublicHttpUrlMaterial(responseUrl)) return "source_url_unsafe";
  if (source.protocol !== "https:" || response.protocol !== "https:") return "https_required";
  if (source.hostname.toLowerCase() !== response.hostname.toLowerCase()) return "redirect_host_mismatch";
  if (!contentType.startsWith("text/html")) return "content_type_invalid";
  if (!body) return "response_body_empty";
  if (Buffer.byteLength(body, "utf8") > maxResponseBytes) return "response_body_too_large";
  return "";
}

function extractUniqueJsonAssignment(source, identifier, opening) {
  const matches = scriptBodies(source).flatMap((script) =>
    findExecutableAssignments(script, identifier).map((start) => ({ script, start })));
  if (matches.length === 0) return { ok: false, error: `${identifier.toLowerCase()}_missing` };
  if (matches.length !== 1) return { ok: false, error: `${identifier.toLowerCase()}_duplicate` };
  const { script, start } = matches[0];
  if (script[start] !== opening) return { ok: false, error: `${identifier.toLowerCase()}_literal_invalid` };
  const closing = opening === "[" ? "]" : "}";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < script.length; index += 1) {
    const character = script[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === opening) depth += 1;
    if (character === closing) {
      depth -= 1;
      if (depth === 0) {
        return { ok: true, literal: script.slice(start, index + 1) };
      }
    }
  }
  return { ok: false, error: `${identifier.toLowerCase()}_unclosed` };
}

function scriptBodies(source) {
  return [...String(source || "").matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)]
    .filter((match) => isExecutableScriptAttributes(match[1]))
    .map((match) => match[2]);
}

function isExecutableScriptAttributes(attributes) {
  const text = String(attributes || "");
  if (/(?:^|\s)src(?:\s*=|\s|$)/i.test(text)) return false;
  const match = text.match(/\btype\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
  if (!match) return true;
  const type = String(match[1] ?? match[2] ?? match[3] ?? "").trim().toLowerCase().split(";", 1)[0];
  return EXECUTABLE_SCRIPT_TYPES.has(type);
}

function findExecutableAssignments(source, identifier) {
  const starts = [];
  const text = String(source || "");
  let state = "code";
  let escaped = false;
  let regexCharacterClass = false;
  let braceDepth = 0;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1] || "";
    if (state === "line_comment") {
      if (character === "\n" || character === "\r") state = "code";
      continue;
    }
    if (state === "block_comment") {
      if (character === "*" && next === "/") {
        state = "code";
        index += 1;
      }
      continue;
    }
    if (state === "regex") {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === "[" && !regexCharacterClass) {
        regexCharacterClass = true;
      } else if (character === "]" && regexCharacterClass) {
        regexCharacterClass = false;
      } else if (character === "/" && !regexCharacterClass) {
        state = "code";
      } else if (character === "\n" || character === "\r") {
        state = "code";
        regexCharacterClass = false;
      }
      continue;
    }
    if (state !== "code") {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (
        (state === "single_quote" && character === "'") ||
        (state === "double_quote" && character === '"') ||
        (state === "template" && character === "`")
      ) {
        state = "code";
      }
      continue;
    }
    if (text.startsWith("<!--", index) || text.startsWith("-->", index)) {
      state = "line_comment";
      index += text.startsWith("<!--", index) ? 3 : 2;
      continue;
    }
    if (character === "/" && next === "/") {
      state = "line_comment";
      index += 1;
      continue;
    }
    if (character === "/" && next === "*") {
      state = "block_comment";
      index += 1;
      continue;
    }
    if (character === "/" && canStartRegexLiteral(text, index)) {
      state = "regex";
      escaped = false;
      regexCharacterClass = false;
      continue;
    }
    if (character === "'") {
      state = "single_quote";
      continue;
    }
    if (character === '"') {
      state = "double_quote";
      continue;
    }
    if (character === "`") {
      state = "template";
      continue;
    }
    if (character === "{") {
      braceDepth += 1;
      continue;
    }
    if (character === "}") {
      braceDepth = Math.max(0, braceDepth - 1);
      continue;
    }
    if (braceDepth !== 0) continue;
    for (const keyword of ["const", "let", "var"]) {
      if (!text.startsWith(keyword, index) || isIdentifierCharacter(text[index - 1]) || isIdentifierCharacter(text[index + keyword.length])) continue;
      if (!isDeclarationStatementBoundary(text, index)) continue;
      let cursor = index + keyword.length;
      if (!/\s/.test(text[cursor] || "")) continue;
      while (/\s/.test(text[cursor] || "")) cursor += 1;
      if (!text.startsWith(identifier, cursor) || isIdentifierCharacter(text[cursor + identifier.length])) continue;
      cursor += identifier.length;
      while (/\s/.test(text[cursor] || "")) cursor += 1;
      if (text[cursor] !== "=") continue;
      cursor += 1;
      while (/\s/.test(text[cursor] || "")) cursor += 1;
      starts.push(cursor);
      index = cursor - 1;
      break;
    }
  }
  return starts;
}

function isDeclarationStatementBoundary(source, declarationIndex) {
  let index = declarationIndex - 1;
  while (index >= 0 && /\s/.test(source[index])) index -= 1;
  return index < 0 || /[;{}]/.test(source[index]);
}

function canStartRegexLiteral(source, slashIndex) {
  let index = slashIndex - 1;
  while (index >= 0 && /\s/.test(source[index])) index -= 1;
  if (index < 0) return true;
  if (/[([{:;,=!?&|+\-*%^~<>]/.test(source[index])) return true;
  if (!isIdentifierCharacter(source[index])) return false;
  const end = index + 1;
  while (index >= 0 && isIdentifierCharacter(source[index])) index -= 1;
  return REGEX_PREFIX_KEYWORDS.has(source.slice(index + 1, end));
}

function isIdentifierCharacter(value) {
  return /[A-Za-z0-9_$]/.test(value || "");
}

function normalizeUpstreamItem(row, context) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return { error: "item_not_object" };
  const title = stringField(row.title);
  const summary = stringField(row.summary);
  const source = stringField(row.source);
  const date = stringField(row.date);
  if (!hasNonWhitespaceText(title)) return { error: "title_missing" };
  if (!hasNonWhitespaceText(summary)) return { error: "summary_missing" };
  if (!hasNonWhitespaceText(source)) return { error: "source_missing" };
  if (!hasNonWhitespaceText(date)) return { error: "date_missing" };
  if (title.length > MAX_TITLE_LENGTH) return { error: "title_too_long" };
  if (summary.length > MAX_SUMMARY_LENGTH) return { error: "summary_too_long" };
  if (source.length > MAX_SOURCE_LENGTH) return { error: "source_too_long" };
  if ([title, summary, source].some((value) => HTML_OR_CONTROL_PATTERN.test(value))) return { error: "unsafe_text" };
  if ([title, summary, source].some(containsSecretLikeText)) return { error: "secret_text" };
  if ([title, summary].some(isPlaceholderSentinelText)) {
    return { error: "placeholder_content" };
  }
  if (INTERNAL_INSTRUCTION_PATTERN.test(`${title} ${summary}`)) return { error: "internal_instruction_content" };
  if (!context.allowedDates.has(date)) return { error: "date_out_of_window" };

  if (!isExactSafeUpstreamUrl(row.url)) return { error: "material_url_unsafe" };
  const url = row.url;
  if (isNonContentEndpoint(url)) return { error: "non_content_endpoint" };

  const flavors = strictStringArray(row.flavors);
  const domain = typeof row.domain === "string" ? row.domain : null;
  const channelsL1 = strictStringArray(row.channels_l1);
  const channelsL2 = strictStringArray(row.channels_l2);
  const companies = strictStringArray(row.companies);
  const products = strictStringArray(row.products);
  if ([flavors, channelsL1, channelsL2, companies, products].some((value) => value == null) || domain == null) {
    return { error: "upstream_field_type_invalid" };
  }
  const persistedLabels = [...flavors, domain, ...channelsL1, ...channelsL2, ...companies, ...products];
  if (persistedLabels.some(containsSecretLikeText)) return { error: "secret_text" };
  if (persistedLabels.some((value) => (
    !hasNonWhitespaceText(value) ||
    value.length > MAX_TAG_LENGTH ||
    HTML_OR_CONTROL_PATTERN.test(value)
  ))) {
    return { error: "upstream_tag_invalid" };
  }
  const upstreamTags = uniqueStrings([...flavors, domain, ...channelsL1, ...channelsL2]);
  if (upstreamTags.length === 0) return { error: "upstream_tags_missing" };
  if (row.quality_score != null && (typeof row.quality_score !== "number" || !Number.isFinite(row.quality_score))) {
    return { error: "quality_score_invalid" };
  }

  const payload = aifyCanonicalPayloadProjection({
    title,
    url,
    summary,
    date,
    source,
    ...(row.quality_score == null ? {} : { quality_score: row.quality_score }),
    flavors,
    domain,
    channels_l1: channelsL1,
    channels_l2: channelsL2,
    companies,
    products
  });
  return {
    item: {
      ...payload,
      upstream_tags: upstreamTags,
      upstream_selection_date: context.selectionDate,
      upstream_position: context.upstreamPosition,
      upstream_positions: [context.upstreamPosition],
      upstream_payload_hash: aifyCanonicalPayloadHash(payload),
      upstream_snapshot_hash: context.snapshotHash
    }
  };
}

export function aifyCanonicalPayloadProjection(item) {
  return {
    title: item?.title,
    url: item?.url,
    summary: item?.summary,
    date: item?.date,
    source: item?.source,
    ...(item?.quality_score == null ? {} : { quality_score: item.quality_score }),
    flavors: item?.flavors,
    domain: item?.domain,
    channels_l1: item?.channels_l1,
    channels_l2: item?.channels_l2,
    companies: item?.companies,
    products: item?.products
  };
}

export function aifyCanonicalPayloadHash(item) {
  return sha256(stableJson(aifyCanonicalPayloadProjection(item)));
}

export function aifyPayloadSequenceHash(items) {
  const sequence = (Array.isArray(items) ? items : [])
    .flatMap((item) => (Array.isArray(item?.upstream_positions) ? item.upstream_positions : [])
      .map((position) => ({
        position,
        payload_hash: item?.upstream_payload_hash
      })))
    .sort((left, right) => left.position - right.position || String(left.payload_hash).localeCompare(String(right.payload_hash)));
  return sha256(stableJson(sequence));
}

export function isPlaceholderSentinelText(value) {
  const text = String(value || "")
    .trim()
    .replace(/[.!。！？?]+$/g, "")
    .trim();
  return Boolean(text && (
    ENCODED_TEST_SENTINEL_PATTERN.test(text) ||
    TEST_HYPHEN_SENTINEL_PATTERN.test(text) ||
    PLACEHOLDER_SEMANTIC_PATTERN.test(text) ||
    OTHER_PLACEHOLDER_SENTINEL_PATTERN.test(text)
  ));
}

function dedupeCanonicalItems(items, rejected) {
  const groups = new Map();
  for (const item of items) {
    const key = canonicalPublicUrlIdentity(item.url);
    const group = groups.get(key) || [];
    group.push(item);
    groups.set(key, group);
  }
  const accepted = [];
  const rejectedItems = [...rejected];
  for (const group of groups.values()) {
    const hashes = new Set(group.map((item) => item.upstream_payload_hash));
    if (hashes.size > 1) {
      for (const item of group) {
        rejectedItems.push({
          upstream_position: item.upstream_position,
          reason: "canonical_url_payload_conflict",
          upstream_payload_hash: item.upstream_payload_hash
        });
      }
      continue;
    }
    const [first] = group;
    accepted.push({
      ...first,
      upstream_positions: group.map((item) => item.upstream_position)
    });
  }
  accepted.sort((left, right) => left.upstream_position - right.upstream_position);
  rejectedItems.sort((left, right) => left.upstream_position - right.upstream_position || left.reason.localeCompare(right.reason));
  return { items: accepted, rejected: rejectedItems };
}

function visiblePageText(html) {
  return html
    .replace(/<!--([\s\S]*?)-->/g, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasTodayPicksSurface(html) {
  if (visiblePageText(html).includes("今日精选")) return true;
  const scripts = scriptBodies(html)
    .map(stripJavaScriptCommentsAndRegexLiterals)
    .join("\n");
  const todayTab = /\{\s*id\s*:\s*["']today["']\s*,\s*name\s*:\s*["'][^"']*今日精选/i.test(scripts);
  const todayMasthead = /class=["']np-title["'][^>]*>\s*今日精选\s*</i.test(scripts);
  return todayTab && todayMasthead;
}

function stripJavaScriptCommentsAndRegexLiterals(source) {
  const text = String(source || "");
  let output = "";
  let state = "code";
  let escaped = false;
  let regexCharacterClass = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1] || "";
    if (state === "line_comment") {
      if (character === "\n" || character === "\r") {
        state = "code";
        output += character;
      } else {
        output += " ";
      }
      continue;
    }
    if (state === "block_comment") {
      if (character === "*" && next === "/") {
        output += "  ";
        state = "code";
        index += 1;
      } else {
        output += character === "\n" || character === "\r" ? character : " ";
      }
      continue;
    }
    if (state === "regex") {
      output += character === "\n" || character === "\r" ? character : " ";
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === "[" && !regexCharacterClass) {
        regexCharacterClass = true;
      } else if (character === "]" && regexCharacterClass) {
        regexCharacterClass = false;
      } else if (character === "/" && !regexCharacterClass) {
        state = "code";
      } else if (character === "\n" || character === "\r") {
        state = "code";
        regexCharacterClass = false;
      }
      continue;
    }
    if (state !== "code") {
      output += character;
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (
        (state === "single_quote" && character === "'") ||
        (state === "double_quote" && character === '"') ||
        (state === "template" && character === "`")
      ) {
        state = "code";
      }
      continue;
    }
    if (text.startsWith("<!--", index) || text.startsWith("-->", index)) {
      const width = text.startsWith("<!--", index) ? 4 : 3;
      output += " ".repeat(width);
      state = "line_comment";
      index += width - 1;
      continue;
    }
    if (character === "/" && next === "/") {
      output += "  ";
      state = "line_comment";
      index += 1;
      continue;
    }
    if (character === "/" && next === "*") {
      output += "  ";
      state = "block_comment";
      index += 1;
      continue;
    }
    if (character === "/" && canStartRegexLiteral(text, index)) {
      output += " ";
      state = "regex";
      escaped = false;
      regexCharacterClass = false;
      continue;
    }
    output += character;
    if (character === "'") state = "single_quote";
    if (character === '"') state = "double_quote";
    if (character === "`") state = "template";
  }
  return output;
}

function isNonContentEndpoint(rawUrl) {
  let pathname;
  try {
    pathname = new URL(rawUrl).pathname;
  } catch {
    return true;
  }
  for (let attempt = 0; attempt < 4; attempt += 1) {
    let decoded;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      return true;
    }
    if (decoded === pathname) break;
    pathname = decoded;
  }
  if (/%[0-9a-f]{2}/i.test(pathname) || /[\u0000-\u001F\u007F]/.test(pathname)) return true;
  const segments = pathname
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.toLowerCase());
  if (segments.length === 0 || segments.some((segment) => segment === "." || segment === "..")) return true;
  if (segments.some((segment) => NON_CONTENT_SEGMENTS.has(segment))) return true;
  if (NON_CONTENT_LANDING_SEGMENTS.has(segments.at(-1))) return true;
  return segments.some((segment, index) => (
    segment === "cdn-cgi" && segments[index + 1] === "l" && segments[index + 2] === "email-protection"
  ));
}

function previousDate(reportDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) return "";
  const date = new Date(`${reportDate}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return "";
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function failedResult(base, failureReason) {
  return { ...base, status: "failed", failure_reason: failureReason };
}

function stringField(value) {
  return typeof value === "string" ? value : "";
}

function hasNonWhitespaceText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isExactSafeUpstreamUrl(value) {
  return typeof value === "string" &&
    value === value.trim() &&
    !/[\u0000-\u0020\u007F]/.test(value) &&
    !hasUnsafePublicHttpUrlMaterial(value);
}

function strictStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? [...value] : null;
}

function uniqueStrings(values) {
  return [...new Set(values)];
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(String(value)).digest("hex")}`;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

async function readResponseTextWithLimit(response, maxBytes) {
  const declaredLength = Number(response?.headers?.get?.("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return { ok: false, error: "response_body_too_large", response_bytes: declaredLength };
  }
  if (response?.body && typeof response.body.getReader === "function") {
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value || []);
      size += chunk.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => {});
        return { ok: false, error: "response_body_too_large", response_bytes: size };
      }
      chunks.push(chunk);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { ok: true, text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), response_bytes: size };
  }
  const text = await response.text();
  const size = Buffer.byteLength(text, "utf8");
  return size > maxBytes
    ? { ok: false, error: "response_body_too_large", response_bytes: size }
    : { ok: true, text, response_bytes: size };
}

export function createAifyTodayPicksFailure(sourceUrl, failureReason, details = {}) {
  const base = {
    source_url: sourceUrl,
    site_health: {
      lane_id: AIFY_SITE_WATCH_ID,
      logical_source_id: "aify-news",
      source_entry_id: AIFY_SITE_WATCH_ID,
      status: "blocked",
      failure_reason: failureReason,
      http_status: Number(details.http_status || 0),
      response_url: "",
      response_bytes: Number(details.response_bytes || 0),
      redirect_count: Number(details.redirect_count || 0),
      fetched_count: 0,
      parsed_count: 0,
      ...(details.error_code ? { error_code: details.error_code } : {})
    },
    content_lane: {
      lane_id: AIFY_TODAY_LANE_ID,
      logical_source_id: "aify-news",
      source_entry_id: AIFY_TODAY_LANE_ID,
      source_kind: AIFY_TODAY_SOURCE_KIND,
      source_url: sourceUrl,
      status: "blocked",
      failure_reason: failureReason,
      upstream_snapshot_hash: sha256(""),
      upstream_selection_date: "",
      input_count: 0,
      item_count: 0,
      rejection_count: 0,
      rejected_items: [],
      items: [],
      http_status: Number(details.http_status || 0),
      response_url: "",
      response_bytes: Number(details.response_bytes || 0),
      redirect_count: Number(details.redirect_count || 0),
      fetched_count: 0,
      parsed_count: 0,
      cache_fallback_used: false,
      ...(details.error_code ? { error_code: details.error_code } : {})
    }
  };
  return base;
}

function safeErrorCode(error) {
  const code = String(error?.code || error?.name || "fetch_error").trim();
  return /^[A-Za-z0-9_.:-]{1,120}$/.test(code) ? code : "fetch_error";
}
