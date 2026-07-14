import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { PublisherError } from "./errors.js";
import { canonicalPublicUrlIdentity, isPublicNetworkHost, sanitizePublicHttpUrl } from "./public-url.js";
import { occurrenceStoreRelativePath } from "./reports-data-layout.js";
import { validateOccurrenceStore } from "./schema.js";
import { classifyOccurrenceDateAnomaly, compareOccurrenceChronology } from "./signal-chronology.js";
import { isValidDateString, isValidDateTimeString } from "./time.js";

export { compareOccurrenceChronology } from "./signal-chronology.js";

const MAX_TITLE_LENGTH = 300;
const MAX_SUMMARY_LENGTH = 360;
const MAX_HINT_LENGTH = 200;
const MAX_ORIGINAL_TEXT_LENGTH = 5000;

export function buildOccurrenceStore(options = {}) {
  const reportDate = String(options.reportDate || "").trim();
  const generatedAt = String(options.generatedAt || "").trim();
  if (!isValidDateString(reportDate)) {
    throw new PublisherError("occurrence_store_date_invalid", "Occurrence store requires a valid report date.");
  }
  if (!isValidDateTimeString(generatedAt)) {
    throw new PublisherError("occurrence_store_generated_at_invalid", "Occurrence store requires a valid generated_at timestamp.");
  }

  const sources = Array.isArray(options.sources) ? options.sources : [];
  const candidates = Array.isArray(options.candidates) ? options.candidates : [];
  const sourceById = new Map(sources
    .filter((item) => item && typeof item === "object")
    .map((item) => [normalizeSourceIdentity(item.id), item])
    .filter(([id]) => id));
  const normalizationErrors = [];
  const occurrencesByIdentity = new Map();

  const candidateEntries = candidates
    .map((candidate, index) => ({ candidate, index }));
  for (const { candidate, index } of candidateEntries) {
    const result = normalizeOccurrence(candidate, {
      reportDate,
      generatedAt,
      sourceById
    });
    if (result.error) {
      normalizationErrors.push({ index, code: result.error });
      continue;
    }
    const group = occurrencesByIdentity.get(result.identity) || [];
    group.push(result.value);
    occurrencesByIdentity.set(result.identity, group);
  }
  normalizationErrors.sort((left, right) => left.index - right.index);

  const occurrences = [...occurrencesByIdentity.entries()]
    .map(([identity, values]) => mergeOccurrenceValues(identity, values));
  occurrences.sort(compareOccurrenceChronology);
  const coalescedRecordCount = occurrences.reduce((sum, item) => sum + item.raw_record_count - 1, 0);
  const store = {
    schema_version: 1,
    kind: "occurrence_store",
    report_date: reportDate,
    generated_at: generatedAt,
    input_record_count: candidates.length,
    occurrence_count: occurrences.length,
    coalesced_record_count: coalescedRecordCount,
    normalization_error_count: normalizationErrors.length,
    normalization_errors: normalizationErrors,
    occurrences
  };
  const validation = validateOccurrenceStore(store);
  if (!validation.valid) {
    throw new PublisherError("occurrence_store_schema_validation_failed", "Occurrence store failed schema validation.", {
      errors: validation.errors
    });
  }
  return validation.value;
}

export async function writeOccurrenceStore(options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const outputDir = path.resolve(rootDir, options.outputDir || "reports-data");
  const store = options.store;
  const validation = validateOccurrenceStore(store);
  if (!validation.valid) {
    throw new PublisherError("occurrence_store_schema_validation_failed", "Occurrence store failed schema validation before write.", {
      errors: validation.errors
    });
  }
  const target = path.join(outputDir, ...occurrenceStoreRelativePath(validation.value.report_date).split(path.sep));
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, `${JSON.stringify(validation.value, null, 2)}\n`, "utf8");
    await fs.rename(temporary, target);
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
  return target;
}

function normalizeOccurrence(candidate, context) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return { error: "record_invalid" };
  }
  const selectedUrl = selectMaterialUrl(candidate);
  if (!selectedUrl.url) {
    return { error: "url_unsafe" };
  }
  const eventDate = normalizeEventDate(candidate.event_date || candidate.date, context.reportDate);
  if (!eventDate) {
    return { error: "date_invalid" };
  }
  const observationId = normalizeObservationId(candidate.observation_id);
  if (!observationId) {
    return { error: "observation_id_missing" };
  }

  const sourceId = normalizeSourceIdentity(candidate.source_id) || "unknown-source";
  const source = context.sourceById.get(sourceId) || {};
  const title = cleanText(
    candidate.title || candidate.name || candidate.publisher || candidate.author || candidate.source || source.name,
    MAX_TITLE_LENGTH
  ) || fallbackTitle(selectedUrl.url);
  const collectorUrl = firstHttpUrl(candidate.source_url, source.url, selectedUrl.url);
  const collectorName = cleanText(source.name || candidate.source || sourceId, MAX_HINT_LENGTH) || hostnameLabel(collectorUrl);
  const publishedAt = isValidDateTimeString(candidate.published_at) ? String(candidate.published_at) : null;
  const collectedAt = isValidDateTimeString(candidate.collected_at) ? String(candidate.collected_at) : context.generatedAt;
  const author = nullableText(candidate.author, MAX_HINT_LENGTH);
  const handle = nullableText(candidate.handle, MAX_HINT_LENGTH);
  const originalText = nullableText(candidate.original_text, MAX_ORIGINAL_TEXT_LENGTH);
  const summary = publicSummary(candidate);
  const publisherHint = cleanText(candidate.publisher, MAX_HINT_LENGTH)
    || hostnameLabel(selectedUrl.url);
  const identityBase = [
    context.reportDate,
    sourceId,
    observationId
  ].join("|");

  return {
    identity: identityBase,
    value: {
      observation_id: observationId,
      raw_record_count: 1,
      cluster_id: `cluster_${digest(canonicalPublicUrlIdentity(selectedUrl.url))}`,
      title,
      url: selectedUrl.url,
      summary,
      publisher_hint: publisherHint,
      collector: {
        name: collectorName,
        url: collectorUrl,
        health: collectorHealth(source.status),
        category: nullableText(source.category, 120)
      },
      candidate_category: cleanText(candidate.category, 100) || "other",
      source_level: nullableText(candidate.source_level, 120),
      verification_status: nullableText(candidate.verification_status, 120),
      editorial_category: nullableText(candidate.editorial_category, 120),
      raw_source_group: nullableText(inferSourceGroupHint(candidate, source, selectedUrl.url), 120),
      raw_tags: uniqueTextValues([
        ...(Array.isArray(candidate.content_tags) ? candidate.content_tags : []),
        ...(Array.isArray(candidate.tags) ? candidate.tags : [])
      ], 32, 100),
      author,
      handle,
      original_text: originalText,
      event_date: eventDate,
      published_at: publishedAt,
      collected_at: collectedAt,
      date_anomaly: classifyOccurrenceDateAnomaly({ event_date: eventDate, published_at: publishedAt, collected_at: collectedAt }),
      image_url: firstHttpUrl(candidate.image_url, ...(Array.isArray(candidate.image_urls) ? candidate.image_urls : [])) || null,
      access_state: selectedUrl.accessState
    }
  };
}

function mergeOccurrenceValues(identity, values) {
  const records = Array.isArray(values) ? values : [];
  const first = records[0];
  const material = preferredMaterialRecord(records) || first;
  const url = material.url;
  const eventDate = preferredDate(records.map((item) => item.event_date)) || first.event_date;
  const publishedAt = preferredDateTime(records.map((item) => item.published_at));
  const collectedAt = preferredDateTime(records.map((item) => item.collected_at)) || first.collected_at;
  return {
    id: `occ_${digest(identity)}`,
    observation_id: first.observation_id,
    raw_record_count: records.length,
    cluster_id: `cluster_${digest(canonicalPublicUrlIdentity(url))}`,
    title: preferredText(records.map((item) => item.title)) || first.title,
    url,
    summary: preferredText(records.map((item) => item.summary)) || null,
    publisher_hint: preferredText(records.map((item) => item.publisher_hint)) || first.publisher_hint,
    collector: preferredObject(records.map((item) => item.collector)) || first.collector,
    candidate_category: preferredMetadata(records.map((item) => item.candidate_category), "other") || "other",
    source_level: preferredMetadata(records.map((item) => item.source_level)),
    verification_status: preferredMetadata(records.map((item) => item.verification_status)),
    editorial_category: preferredMetadata(records.map((item) => item.editorial_category)),
    raw_source_group: preferredMetadata(records.map((item) => item.raw_source_group)),
    raw_tags: uniqueTextValues(records.flatMap((item) => item.raw_tags), 32, 100).sort((left, right) => left.localeCompare(right)),
    author: preferredText(records.map((item) => item.author)) || null,
    handle: preferredText(records.map((item) => item.handle)) || null,
    original_text: preferredText(records.map((item) => item.original_text)) || null,
    event_date: eventDate,
    published_at: publishedAt,
    collected_at: collectedAt,
    date_anomaly: classifyOccurrenceDateAnomaly({ event_date: eventDate, published_at: publishedAt, collected_at: collectedAt }),
    image_url: preferredUrl(records.map((item) => item.image_url)) || null,
    access_state: material.access_state
  };
}

function selectMaterialUrl(candidate) {
  for (const [value, accessState] of [
    [candidate.primary_url, "direct"],
    [candidate.original_url, "direct"],
    [candidate.url, "direct"],
    [candidate.intermediary_url, "indirect"]
  ]) {
    const url = sanitizePublicHttpUrl(value);
    if (url) return { url, accessState };
  }
  return { url: "", accessState: "unknown" };
}

function publicSummary(candidate) {
  for (const value of [candidate.summary, candidate.original_text, candidate.evidence, candidate.description]) {
    const text = cleanText(value, MAX_SUMMARY_LENGTH);
    if (text) return text;
  }
  return null;
}

function cleanText(value, maxLength) {
  const text = redactNonPublicEmbeddedUrls(String(value || ""))
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  return text.length <= maxLength ? text : `${text.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}

function redactNonPublicEmbeddedUrls(value) {
  return String(value).replace(/https?:\/\/[^\s<>"']+/gi, (rawUrl) => {
    const trailing = rawUrl.match(/[),.;!?]+$/)?.[0] || "";
    const candidate = trailing ? rawUrl.slice(0, -trailing.length) : rawUrl;
    try {
      const url = new URL(candidate);
      const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
      if (host === "localhost" || host.endsWith(".localhost")) return rawUrl;
      return isPublicNetworkHost(host) ? rawUrl : `[non-public link removed]${trailing}`;
    } catch {
      return rawUrl;
    }
  });
}

function nullableText(value, maxLength) {
  return cleanText(value, maxLength) || null;
}

function normalizeObservationId(value) {
  const text = identityScalarText(value);
  if (!text) return "";
  return text.length <= 500 && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(text)
    ? text
    : `obs_${digest(text)}`;
}

function normalizeSourceIdentity(value) {
  const text = identityScalarText(value);
  if (!text) return "";
  return text.length <= 500 && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(text)
    ? text
    : `source_${digest(text)}`;
}

function identityScalarText(value) {
  return typeof value === "string" || typeof value === "number" || typeof value === "bigint"
    ? String(value).trim()
    : "";
}

function preferredText(values) {
  return values
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .sort((left, right) => right.length - left.length || left.localeCompare(right))[0] || "";
}

function preferredMetadata(values, fallback = "") {
  const normalized = [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
  return normalized.find((value) => value !== fallback) || normalized[0] || null;
}

function preferredUrl(values) {
  return [...new Set(values.map((value) => sanitizePublicHttpUrl(value)).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right))[0] || "";
}

function preferredDate(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(isValidDateString))]
    .sort((left, right) => right.localeCompare(left))[0] || "";
}

function preferredDateTime(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(isValidDateTimeString))]
    .sort((left, right) => Date.parse(right) - Date.parse(left) || right.localeCompare(left))[0] || null;
}

function preferredObject(values) {
  return values
    .filter((value) => value && typeof value === "object")
    .map((value) => ({ value, key: JSON.stringify(value) }))
    .sort((left, right) => left.key.localeCompare(right.key))[0]?.value || null;
}

function preferredMaterialRecord(records) {
  const accessOrder = new Map([
    ["direct", 0],
    ["indirect", 1],
    ["unknown", 2]
  ]);
  return records
    .filter((item) => sanitizePublicHttpUrl(item?.url))
    .sort((left, right) => {
      const accessDelta = (accessOrder.get(left.access_state) ?? 3) - (accessOrder.get(right.access_state) ?? 3);
      if (accessDelta !== 0) return accessDelta;
      return canonicalPublicUrlIdentity(left.url).localeCompare(canonicalPublicUrlIdentity(right.url));
    })[0] || null;
}

function uniqueTextValues(values, maxItems, maxLength) {
  return [...new Set(values
    .map((value) => cleanText(value, maxLength))
    .filter(Boolean))]
    .slice(0, maxItems);
}

function normalizeEventDate(value, fallback) {
  const text = String(value || "").slice(0, 10);
  if (isValidDateString(text)) return text;
  return isValidDateString(fallback) ? fallback : "";
}

function firstHttpUrl(...values) {
  for (const value of values) {
    const url = sanitizePublicHttpUrl(value);
    if (url) return url;
  }
  return "";
}

function fallbackTitle(value) {
  try {
    const url = new URL(value);
    const segment = url.pathname.split("/").filter(Boolean).at(-1) || "";
    const decoded = decodeURIComponent(segment).replace(/[-_]+/g, " ");
    return cleanText(decoded, MAX_TITLE_LENGTH) || hostnameLabel(value);
  } catch {
    return "未命名信号";
  }
}

function inferSourceGroupHint(candidate, source, materialUrl) {
  const explicit = cleanText(candidate.source_group || source.source_group || source.public_source_group, 120);
  if (explicit) return explicit;
  const category = `${cleanText(source.category, 120)} ${cleanText(candidate.category, 120)}`.toLowerCase();
  const host = hostnameLabel(materialUrl).toLowerCase();
  if (/^(?:x|twitter)\.com$/.test(host) || /\b(?:builder|social|twitter|x_updates)\b/.test(category)) return "x_updates";
  if (/github/.test(host) || /\b(?:github|project|open[_ -]?source)\b/.test(category)) return "github_trending";
  if (/arxiv|openreview|huggingface|paperswithcode/.test(host) || /\b(?:paper|research|model|huggingface)\b/.test(category)) return "papers_models";
  if (/hacker|hnrss|reddit|zhihu|weixin|v2ex|lobste/.test(host) || /\bcommunity\b/.test(category)) return "community_discussions";
  if (/\b(?:official|core_primary|china_models|official_blog)\b/.test(category)) return "official_blogs";
  if (/\b(?:news|newsletter|media|rss|feed|aggregator|search|hot_blog)\b/.test(category)) return "news_newsletters";
  return null;
}

function hostnameLabel(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "未知发布者";
  }
}

function collectorHealth(status) {
  if (status === "checked") return "available";
  if (status === "blocked") return "degraded";
  return "unknown";
}

function digest(value) {
  return createHash("sha256").update(String(value)).digest("hex").slice(0, 24);
}
