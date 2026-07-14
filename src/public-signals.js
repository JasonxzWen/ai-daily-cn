import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { PublisherError } from "./errors.js";
import { buildOccurrenceStore, compareOccurrenceChronology } from "./occurrence-store.js";
import { publicSignalTaxonomy, validateOccurrenceStore, validatePublicSignals } from "./schema.js";
import { isOccurrenceChronologySorted } from "./signal-chronology.js";
import { isValidDateString, isValidDateTimeString } from "./time.js";

export const PUBLIC_SIGNAL_PAGE_SIZE = 50;
export const PUBLIC_SIGNAL_PREVIEW_SIZE = 8;

const GROUPS = [...publicSignalTaxonomy.source_groups].sort((left, right) => left.order - right.order);
const GROUP_IDS = new Set(GROUPS.map((item) => item.id));
const GROUP_BY_ID = new Map(GROUPS.map((item) => [item.id, item]));
const CONTENT_TAGS = [...publicSignalTaxonomy.content_tags].sort((left, right) => left.order - right.order);
const CONTENT_TAG_IDS = new Set(CONTENT_TAGS.map((item) => item.id));
const CONTENT_TAG_ORDER = new Map(CONTENT_TAGS.map((item) => [item.id, item.order]));
const CREDIBILITY_TAG_IDS = new Set(publicSignalTaxonomy.credibility_tags.map((item) => item.id));
const LEGACY = publicSignalTaxonomy.legacy_mappings;
const MONITORING_CATEGORIES = new Set(["github_trending", "huggingface_trending", "source_watch"]);
const REPORT_SECTIONS = [
  "stories",
  "main_items",
  "daily_tracking",
  "chinese_media_dynamics",
  "github_trending",
  "huggingface_trending",
  "model_releases",
  "hot_blogs",
  "projects",
  "builder_observations",
  "official_org_updates",
  "community_leads",
  "wechat_items",
  "zhihu_items",
  "reddit_items"
];

export function projectOccurrenceStore(store, options = {}) {
  const validation = validateOccurrenceStore(store);
  if (!validation.valid) {
    throw new PublisherError("occurrence_store_schema_validation_failed", "Cannot project an invalid occurrence store.", {
      errors: validation.errors
    });
  }
  const recordOrigin = options.recordOrigin || "observed";
  return {
    report_date: validation.value.report_date,
    normalization_error_count: validation.value.normalization_error_count,
    occurrences: validation.value.occurrences.map((item) => publicOccurrence(item, recordOrigin))
  };
}

export function projectLegacyCandidatePool(candidatePool) {
  const reportDate = normalizedReportDate(candidatePool?.report_date);
  if (!reportDate) {
    return { report_date: "", normalization_error_count: 0, occurrences: [] };
  }
  const generatedAt = normalizedGeneratedAt(candidatePool?.generated_at, reportDate);
  const store = buildOccurrenceStore({
    reportDate,
    generatedAt,
    sources: Array.isArray(candidatePool?.sources) ? candidatePool.sources : [],
    candidates: (Array.isArray(candidatePool?.candidates) ? candidatePool.candidates : []).map((candidate) => ({
      ...candidate,
      observation_id: `legacy_candidate_${stableDigest([
        candidate?.id,
        candidate?.source_id,
        candidate?.category,
        candidate?.included_in,
        candidate?.url
      ].join("|"))}`
    }))
  });
  return projectOccurrenceStore(store, { recordOrigin: "legacy_candidate_pool" });
}

export function projectLegacyReport(report) {
  const reportDate = normalizedReportDate(report?.report_date);
  if (!reportDate) {
    return { report_date: "", normalization_error_count: 0, occurrences: [] };
  }
  const generatedAt = normalizedGeneratedAt(report?.generated_at, reportDate);
  const sources = [];
  const candidates = [];
  for (const section of REPORT_SECTIONS) {
    const items = Array.isArray(report?.[section]) ? report[section] : [];
    for (const [index, item] of items.entries()) {
      const entries = legacyReportEntries(item);
      for (const [entryIndex, entry] of entries.entries()) {
        const publisherName = cleanText(item?.publisher || hostname(entry.url)) || hostname(entry.url);
        const sourceName = cleanText(entry.name || item?.source || publisherName) || publisherName;
        const sourceId = `legacy-${stableDigest([section, item?.candidate_id, item?.id, entry.url, sourceName].join("|"))}`;
        sources.push({
          id: sourceId,
          name: `AI Daily legacy report · ${sourceName}`,
          url: entry.url,
          status: "unknown",
          category: sourceCategoryForSection(section)
        });
        candidates.push({
          id: cleanText(item?.candidate_id || item?.id || `${section}-${stableDigest(entry.url)}`) || `${section}-${stableDigest(entry.url)}`,
          observation_id: `legacy_editorial_${stableDigest([section, item?.candidate_id, item?.id, entry.url, index, entryIndex].join("|"))}`,
          source_id: sourceId,
          category: candidateCategoryForSection(section),
          title: item?.title || item?.name || item?.repo || sourceName || entry.url,
          url: entry.url,
          source: `AI Daily legacy report`,
          publisher: publisherName,
          source_group: sourceGroupForSection(section),
          event_date: item?.event_date || reportDate,
          published_at: item?.published_at,
          summary: item?.summary || item?.what_happened || item?.claim || item?.description,
          author: item?.author,
          handle: item?.handle,
          original_text: item?.original_text,
          source_level: item?.source_level,
          verification_status: item?.verification_status,
          editorial_category: item?.editorial_category,
          tags: item?.tags,
          image_url: item?.image_url,
          collected_at: generatedAt,
          legacy_entry_index: entryIndex,
          legacy_item_index: index
        });
      }
    }
  }
  const store = buildOccurrenceStore({ reportDate, generatedAt, sources, candidates });
  return projectOccurrenceStore(store, { recordOrigin: "legacy_editorial" });
}

export function buildPublicSignalArtifacts(options = {}) {
  const generatedAt = publicSignalGeneratedAt(options);
  const pageSize = positiveInteger(options.pageSize, PUBLIC_SIGNAL_PAGE_SIZE);
  const previewSize = nonNegativeInteger(options.previewSize, PUBLIC_SIGNAL_PREVIEW_SIZE);
  const projected = [];
  let normalizationErrorCount = 0;

  for (const storeRecord of Array.isArray(options.occurrenceStores) ? options.occurrenceStores : []) {
    const store = storeRecord?.store || storeRecord;
    const result = projectOccurrenceStore(store);
    normalizationErrorCount += result.normalization_error_count;
    projected.push(...result.occurrences);
  }

  for (const poolRecord of Array.isArray(options.legacyCandidatePools) ? options.legacyCandidatePools : []) {
    const pool = poolRecord?.candidatePool || poolRecord;
    const reportDate = normalizedReportDate(pool?.report_date);
    if (!reportDate) continue;
    const result = projectLegacyCandidatePool(pool);
    normalizationErrorCount += result.normalization_error_count;
    projected.push(...result.occurrences);
  }

  for (const report of Array.isArray(options.reports) ? options.reports : []) {
    const reportDate = normalizedReportDate(report?.report_date);
    if (!reportDate) continue;
    const result = projectLegacyReport(report);
    normalizationErrorCount += result.normalization_error_count;
    projected.push(...result.occurrences);
  }

  const occurrences = uniqueOccurrences(projected).sort(compareOccurrenceChronology);
  const byGroup = new Map(GROUPS.map((group) => [group.id, []]));
  for (const occurrence of occurrences) {
    const groupId = GROUP_IDS.has(occurrence.source_group) ? occurrence.source_group : "other";
    byGroup.get(groupId).push(occurrence);
  }

  const pages = [];
  const groups = [];
  for (const group of GROUPS) {
    const items = byGroup.get(group.id);
    if (!Array.isArray(items) || items.length === 0) continue;
    const pageCount = Math.ceil(items.length / pageSize);
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const pagePath = publicSignalPagePath(group.id, pageNumber);
      const nextUrl = pageNumber < pageCount ? publicSignalPagePath(group.id, pageNumber + 1) : null;
      const page = {
        schema_version: 1,
        taxonomy_version: publicSignalTaxonomy.schema_version,
        kind: "signal_page",
        generated_at: generatedAt,
        group: { id: group.id, label: group.label },
        page: pageNumber,
        page_count: pageCount,
        page_size: pageSize,
        total_count: items.length,
        next_url: nextUrl,
        items: items.slice((pageNumber - 1) * pageSize, pageNumber * pageSize)
      };
      requirePublicSignals(page, pagePath);
      pages.push({ path: pagePath, data: page });
    }
    groups.push({
      id: group.id,
      label: group.label,
      count: items.length,
      page_count: pageCount,
      first_page_url: publicSignalPagePath(group.id, 1),
      preview: items.slice(0, previewSize)
    });
  }

  const coverage = {
    observed_count: occurrences.filter((item) => item.record_origin === "observed").length,
    legacy_candidate_count: occurrences.filter((item) => item.record_origin === "legacy_candidate_pool").length,
    legacy_editorial_count: occurrences.filter((item) => item.record_origin === "legacy_editorial").length,
    normalization_error_count: normalizationErrorCount
  };
  const index = {
    schema_version: 1,
    taxonomy_version: publicSignalTaxonomy.schema_version,
    kind: "signal_index",
    generated_at: generatedAt,
    total_count: occurrences.length,
    page_size: pageSize,
    coverage,
    groups
  };
  requirePublicSignals(index, "signals/index.json");
  const artifacts = {
    index,
    pages,
    occurrences,
    files: [{ path: "signals/index.json", data: index }, ...pages]
  };
  const setValidation = validatePublicSignalArtifactSet(artifacts);
  if (!setValidation.valid) {
    throw new PublisherError("public_signal_artifact_set_invalid", "Public signal artifact set failed cross-file validation.", {
      errors: setValidation.errors
    });
  }
  return artifacts;
}

export function validatePublicSignalArtifactSet(artifacts = {}) {
  const errors = [];
  const index = artifacts.index;
  const pages = Array.isArray(artifacts.pages) ? artifacts.pages : [];
  const indexValidation = validatePublicSignals(index);
  if (!indexValidation.valid) {
    errors.push(...indexValidation.errors.map((error) => ({ ...error, path: `/index${error.path || ""}` })));
    return { valid: false, errors };
  }
  const pagesByGroup = new Map();
  for (const entry of pages) {
    const validation = validatePublicSignals(entry?.data);
    if (!validation.valid) {
      errors.push(...validation.errors.map((error) => ({ ...error, path: `/${entry?.path || "unknown"}${error.path || ""}` })));
      continue;
    }
    const expectedPath = publicSignalPagePath(entry.data.group.id, entry.data.page);
    if (entry.path !== expectedPath) {
      errors.push(artifactSetError(`/${entry.path || "unknown"}`, `page path must be ${expectedPath}`));
    }
    const groupPages = pagesByGroup.get(entry.data.group.id) || [];
    groupPages.push(entry);
    pagesByGroup.set(entry.data.group.id, groupPages);
  }

  const allItems = [];
  for (const group of index.groups) {
    const groupPages = (pagesByGroup.get(group.id) || [])
      .sort((left, right) => left.data.page - right.data.page);
    if (groupPages.length !== group.page_count) {
      errors.push(artifactSetError(`/groups/${group.id}`, "page file count must equal index page_count"));
      continue;
    }
    const items = [];
    for (const [pageIndex, entry] of groupPages.entries()) {
      const page = entry.data;
      if (page.page !== pageIndex + 1 ||
          page.page_count !== group.page_count ||
          page.total_count !== group.count ||
          page.page_size !== index.page_size ||
          page.generated_at !== index.generated_at ||
          page.taxonomy_version !== index.taxonomy_version ||
          page.group.label !== group.label) {
        errors.push(artifactSetError(`/${entry.path}`, "page generation, taxonomy, group, count, and pagination metadata must match the index"));
      }
      items.push(...page.items);
    }
    if (items.length !== group.count || new Set(items.map((item) => item.id)).size !== items.length) {
      errors.push(artifactSetError(`/groups/${group.id}`, "page union must contain the exact unique group occurrence set"));
    }
    if (!isOccurrenceChronologySorted(items)) {
      errors.push(artifactSetError(`/groups/${group.id}`, "page union must preserve global occurrence chronology across page boundaries"));
    }
    const expectedPreview = items.slice(0, group.preview.length);
    if (JSON.stringify(group.preview) !== JSON.stringify(expectedPreview)) {
      errors.push(artifactSetError(`/groups/${group.id}/preview`, "index preview must equal the first chronological page items"));
    }
    allItems.push(...items);
    pagesByGroup.delete(group.id);
  }
  for (const groupId of pagesByGroup.keys()) {
    errors.push(artifactSetError(`/groups/${groupId}`, "page group is absent from the index"));
  }
  if (allItems.length !== index.total_count || new Set(allItems.map((item) => item.id)).size !== allItems.length) {
    errors.push(artifactSetError("/index/total_count", "global page union must equal index total_count with unique occurrence ids"));
  }
  const actualCoverage = {
    observed_count: allItems.filter((item) => item.record_origin === "observed").length,
    legacy_candidate_count: allItems.filter((item) => item.record_origin === "legacy_candidate_pool").length,
    legacy_editorial_count: allItems.filter((item) => item.record_origin === "legacy_editorial").length
  };
  for (const [field, actual] of Object.entries(actualCoverage)) {
    if (index.coverage[field] !== actual) {
      errors.push(artifactSetError(`/index/coverage/${field}`, "coverage count must equal the page-union record_origin distribution"));
    }
  }
  const declaredOccurrences = artifacts.occurrences;
  if (!Array.isArray(declaredOccurrences)) {
    errors.push(artifactSetError("/occurrences", "artifact set must include its complete occurrence list"));
  } else {
    const declaredById = new Map(declaredOccurrences.map((item) => [item?.id, item]));
    const pageById = new Map(allItems.map((item) => [item.id, item]));
    if (declaredOccurrences.length !== allItems.length || declaredById.size !== declaredOccurrences.length) {
      errors.push(artifactSetError("/occurrences", "declared occurrences must be globally unique and equal page-union cardinality"));
    }
    if (!isOccurrenceChronologySorted(declaredOccurrences)) {
      errors.push(artifactSetError("/occurrences", "declared occurrences must preserve canonical global chronology"));
    }
    for (const [id, item] of declaredById.entries()) {
      if (!pageById.has(id) || JSON.stringify(pageById.get(id)) !== JSON.stringify(item)) {
        errors.push(artifactSetError(`/occurrences/${id || "unknown"}`, "declared occurrence must exactly match its page-union record"));
      }
    }
    for (const id of pageById.keys()) {
      if (!declaredById.has(id)) {
        errors.push(artifactSetError(`/occurrences/${id}`, "page-union record is missing from declared occurrences"));
      }
    }
  }
  const declaredFiles = artifacts.files;
  const expectedFiles = [{ path: "signals/index.json", data: index }, ...pages];
  if (!Array.isArray(declaredFiles)) {
    errors.push(artifactSetError("/files", "artifact set must declare every generated signal file"));
  } else {
    const declaredByPath = new Map(declaredFiles.map((entry) => [entry?.path, entry]));
    const expectedByPath = new Map(expectedFiles.map((entry) => [entry.path, entry]));
    if (declaredFiles.length !== expectedFiles.length || declaredByPath.size !== declaredFiles.length) {
      errors.push(artifactSetError("/files", "declared signal files must be unique and equal the generated path cardinality"));
    }
    for (const [filePath, expected] of expectedByPath.entries()) {
      const declared = declaredByPath.get(filePath);
      if (!declared || JSON.stringify(declared.data) !== JSON.stringify(expected.data)) {
        errors.push(artifactSetError(`/files/${filePath}`, "declared signal file must exactly match its generated index or page"));
      }
    }
    for (const filePath of declaredByPath.keys()) {
      if (!expectedByPath.has(filePath)) {
        errors.push(artifactSetError(`/files/${filePath || "unknown"}`, "declared signal file is not part of the generated artifact set"));
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

export async function loadOccurrenceStores(dataInputDir) {
  const baseDir = path.join(path.resolve(dataInputDir), "occurrences");
  const files = await collectFiles(baseDir, (file) => file.toLowerCase().endsWith(".json"));
  const records = [];
  for (const file of files) {
    const store = JSON.parse(await fs.readFile(file, "utf8"));
    const validation = validateOccurrenceStore(store);
    if (!validation.valid) {
      throw new PublisherError("occurrence_store_schema_validation_failed", `Invalid occurrence store: ${file}`, {
        path: file,
        errors: validation.errors
      });
    }
    records.push({ path: file, store: validation.value });
  }
  return records.sort((left, right) => String(left.store.report_date).localeCompare(String(right.store.report_date)));
}

export async function loadLegacyCandidatePools(dataInputDir) {
  const baseDir = path.resolve(dataInputDir);
  const files = await collectFiles(baseDir, (file) => file.toLowerCase().endsWith(".candidates.json"));
  const records = [];
  for (const file of files) {
    const candidatePool = JSON.parse(await fs.readFile(file, "utf8"));
    if (!normalizedReportDate(candidatePool?.report_date)) continue;
    records.push({ path: file, candidatePool });
  }
  return records.sort((left, right) => String(left.candidatePool.report_date).localeCompare(String(right.candidatePool.report_date)));
}

export function publicSignalPagePath(groupId, pageNumber) {
  return `signals/${groupId}/page-${String(pageNumber).padStart(3, "0")}.json`;
}

function publicOccurrence(item, recordOrigin) {
  const sourceGroup = resolveSourceGroup(item);
  const credibilityTag = resolveCredibilityTag(item);
  const contentTags = resolveContentTags(item, sourceGroup);
  const homeUrl = originUrl(item.url);
  return {
    id: item.id,
    cluster_id: item.cluster_id,
    record_origin: recordOrigin,
    title: item.title,
    url: item.url,
    summary: item.summary,
    author: item.author,
    handle: item.handle,
    original_text: item.original_text,
    publisher: {
      name: item.publisher_hint || hostname(item.url),
      home_url: homeUrl
    },
    collected_via: {
      name: item.collector.name,
      url: item.collector.url
    },
    source_group: sourceGroup,
    content_tags: contentTags,
    credibility_tag: credibilityTag,
    event_date: item.event_date,
    published_at: item.published_at,
    collected_at: item.collected_at,
    date_anomaly: item.date_anomaly,
    image_url: item.image_url,
    source_health: item.collector.health,
    access_state: item.access_state
  };
}

function resolveSourceGroup(item) {
  const host = hostname(item.url);
  for (const groupId of ["x_updates", "papers_models", "github_trending", "community_discussions", "official_blogs"]) {
    if (hostMatchesAny(host, publicSignalTaxonomy.host_groups[groupId])) return groupId;
  }
  if (GROUP_IDS.has(item.raw_source_group)) return item.raw_source_group;
  const collectorText = `${item.collector.name} ${item.collector.url}`.toLowerCase();
  if (/\b(?:x|twitter)\b/.test(collectorText)) return "x_updates";
  if (/github/.test(collectorText)) return "github_trending";
  if (/arxiv|paper|research|hugging\s*face|model registry/.test(collectorText)) return "papers_models";
  if (/hacker news|hnrss|reddit|zhihu|wechat|community/.test(collectorText)) return "community_discussions";
  if (/news|newsletter|weekly|rss|feed|media/.test(collectorText)) return "news_newsletters";
  return "other";
}

function resolveCredibilityTag(item) {
  if (MONITORING_CATEGORIES.has(item.candidate_category)) return "monitoring_lead";
  const verificationMapped = LEGACY.verification_status_to_credibility_tag[item.verification_status];
  if (CREDIBILITY_TAG_IDS.has(verificationMapped)) return verificationMapped;
  const sourceMapped = LEGACY.source_level_to_credibility_tag[item.source_level];
  return CREDIBILITY_TAG_IDS.has(sourceMapped) ? sourceMapped : "pending_review";
}

function resolveContentTags(item, sourceGroup) {
  const tags = new Set((Array.isArray(item.raw_tags) ? item.raw_tags : []).filter((tag) => CONTENT_TAG_IDS.has(tag)));
  for (const tag of LEGACY.editorial_category_to_content_tags[item.editorial_category] || []) tags.add(tag);
  for (const tag of LEGACY.candidate_category_to_content_tags[item.candidate_category] || []) tags.add(tag);
  if (sourceGroup === "papers_models" && tags.size === 0) {
    tags.add(item.candidate_category === "huggingface_trending" || item.candidate_category === "model_release" ? "model_release" : "research");
  }
  if (sourceGroup === "github_trending" && tags.size === 0) tags.add("open_source");
  if ((sourceGroup === "community_discussions" || sourceGroup === "x_updates") && tags.size === 0) tags.add("community_discussion");
  if (tags.size === 0) tags.add("other");
  return [...tags].sort((left, right) => CONTENT_TAG_ORDER.get(left) - CONTENT_TAG_ORDER.get(right));
}

function requirePublicSignals(value, artifactPath) {
  const validation = validatePublicSignals(value);
  if (!validation.valid) {
    throw new PublisherError("public_signals_schema_validation_failed", `Public signal artifact is invalid: ${artifactPath}`, {
      path: artifactPath,
      errors: validation.errors
    });
  }
}

function uniqueOccurrences(values) {
  const byId = new Map();
  for (const item of values) {
    if (!byId.has(item.id)) byId.set(item.id, item);
  }
  return [...byId.values()];
}

function artifactSetError(pathValue, message) {
  return {
    code: "public_signal_artifact_set_invalid",
    path: pathValue,
    message
  };
}

function hostMatchesAny(host, suffixes = []) {
  return suffixes.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

function originUrl(value) {
  const url = new URL(value);
  return `${url.protocol}//${url.host}/`;
}

function hostname(value) {
  try {
    return new URL(String(value || "")).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "unknown.invalid";
  }
}

function firstHttpUrl(...values) {
  for (const value of values) {
    try {
      const url = new URL(String(value || ""));
      if (url.protocol === "http:" || url.protocol === "https:") return url.toString();
    } catch {
      // Try the next candidate URL.
    }
  }
  return "";
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizedReportDate(value) {
  const text = String(value || "").trim();
  return isValidDateString(text) ? text : "";
}

function normalizedGeneratedAt(value, fallbackDate) {
  if (isValidDateTimeString(value)) return String(value);
  const date = normalizedReportDate(fallbackDate) || new Date().toISOString().slice(0, 10);
  return `${date}T00:00:00.000Z`;
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function candidateCategoryForSection(section) {
  const mapping = {
    stories: "main_item",
    main_items: "main_item",
    daily_tracking: "daily_tracking",
    chinese_media_dynamics: "hot_blog",
    github_trending: "github_trending",
    huggingface_trending: "huggingface_trending",
    model_releases: "model_release",
    hot_blogs: "hot_blog",
    projects: "project",
    builder_observations: "builder_observation",
    community_leads: "community_lead",
    wechat_items: "community_lead",
    zhihu_items: "community_lead",
    reddit_items: "community_lead"
  };
  return mapping[section] || "community_lead";
}

function sourceGroupForSection(section) {
  const mapping = {
    github_trending: "github_trending",
    projects: "github_trending",
    huggingface_trending: "papers_models",
    model_releases: "papers_models",
    builder_observations: "x_updates",
    community_leads: "community_discussions",
    wechat_items: "community_discussions",
    zhihu_items: "community_discussions",
    reddit_items: "community_discussions",
    hot_blogs: "news_newsletters",
    chinese_media_dynamics: "news_newsletters"
  };
  return mapping[section] || null;
}

function sourceCategoryForSection(section) {
  return sourceGroupForSection(section) || "other";
}

function legacyReportEntries(item) {
  const entries = [];
  const directUrl = firstHttpUrl(item?.url, item?.repo_url, item?.original_url, item?.primary_url, item?.intermediary_url);
  if (directUrl) entries.push({ url: directUrl, name: item?.source || item?.publisher || hostname(directUrl) });
  for (const source of Array.isArray(item?.sources) ? item.sources : []) {
    const url = firstHttpUrl(source?.url, source?.primary_url, source?.original_url);
    if (url) entries.push({ url, name: source?.name || source?.source || source?.publisher });
  }
  const byUrl = new Map();
  for (const entry of entries) {
    if (!byUrl.has(entry.url)) byUrl.set(entry.url, entry);
  }
  return [...byUrl.values()];
}

function stableDigest(value) {
  return createHash("sha256").update(String(value)).digest("hex").slice(0, 16);
}

function publicSignalGeneratedAt(options) {
  const timestamps = [];
  for (const record of Array.isArray(options.occurrenceStores) ? options.occurrenceStores : []) {
    const store = record?.store || record;
    const validation = validateOccurrenceStore(store);
    if (validation.valid) timestamps.push(validation.value.generated_at);
  }
  for (const record of Array.isArray(options.legacyCandidatePools) ? options.legacyCandidatePools : []) {
    const pool = record?.candidatePool || record;
    const reportDate = normalizedReportDate(pool?.report_date);
    if (reportDate) timestamps.push(normalizedGeneratedAt(pool?.generated_at, reportDate));
  }
  for (const report of Array.isArray(options.reports) ? options.reports : []) {
    const reportDate = normalizedReportDate(report?.report_date);
    if (reportDate) timestamps.push(normalizedGeneratedAt(report?.generated_at, reportDate));
  }
  if (timestamps.length > 0) {
    const latestEpoch = Math.max(...timestamps.map((value) => Date.parse(value)));
    return new Date(latestEpoch).toISOString();
  }
  return normalizedGeneratedAt(options.generatedAt, new Date().toISOString().slice(0, 10));
}

async function collectFiles(directory, predicate) {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const files = [];
  for (const entry of entries) {
    const current = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(current, predicate));
    } else if (entry.isFile() && predicate(current)) {
      files.push(current);
    }
  }
  return files.sort();
}
