import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";

import { PublisherError } from "./errors.js";
import { compareOccurrenceChronology } from "./occurrence-store.js";
import { publicSignalTaxonomy, validateOccurrenceStore, validatePublicSignals } from "./schema.js";
import { isOccurrenceChronologySorted } from "./signal-chronology.js";
import { isValidDateTimeString } from "./time.js";

export const PUBLIC_SIGNAL_PAGE_SIZE = 50;
export const PUBLIC_SIGNAL_PREVIEW_SIZE = 8;

const GROUPS = [...publicSignalTaxonomy.source_groups].sort((left, right) => left.order - right.order);
const GROUP_IDS = new Set(GROUPS.map((item) => item.id));
const CONTENT_TAGS = [...publicSignalTaxonomy.content_tags].sort((left, right) => left.order - right.order);
const CONTENT_TAG_IDS = new Set(CONTENT_TAGS.map((item) => item.id));
const CONTENT_TAG_ORDER = new Map(CONTENT_TAGS.map((item) => [item.id, item.order]));
const CREDIBILITY_TAG_IDS = new Set(publicSignalTaxonomy.credibility_tags.map((item) => item.id));
const NORMALIZATION_MAPPINGS = publicSignalTaxonomy.normalization_mappings;
const MONITORING_CATEGORIES = new Set(["github_trending", "huggingface_trending", "source_watch"]);

export function projectOccurrenceStore(store) {
  const validation = validateOccurrenceStore(store);
  if (!validation.valid) {
    throw new PublisherError("occurrence_store_schema_validation_failed", "Cannot project an invalid occurrence store.", {
      errors: validation.errors
    });
  }
  return {
    report_date: validation.value.report_date,
    input_record_count: validation.value.input_record_count,
    occurrence_count: validation.value.occurrence_count,
    coalesced_record_count: validation.value.coalesced_record_count,
    normalization_error_count: validation.value.normalization_error_count,
    occurrences: validation.value.occurrences.map(publicOccurrence)
  };
}

export function buildPublicSignalArtifacts(options = {}) {
  const generatedAt = publicSignalGeneratedAt(options);
  const pageSize = positiveInteger(options.pageSize, PUBLIC_SIGNAL_PAGE_SIZE);
  const previewSize = nonNegativeInteger(options.previewSize, PUBLIC_SIGNAL_PREVIEW_SIZE);
  const projected = [];
  let inputRecordCount = 0;
  let coalescedRecordCount = 0;
  let normalizationErrorCount = 0;

  for (const storeRecord of Array.isArray(options.occurrenceStores) ? options.occurrenceStores : []) {
    const store = storeRecord?.store || storeRecord;
    const result = projectOccurrenceStore(store);
    inputRecordCount += result.input_record_count;
    coalescedRecordCount += result.coalesced_record_count;
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
    input_record_count: inputRecordCount,
    occurrence_count: occurrences.length,
    coalesced_record_count: coalescedRecordCount,
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
  if (index.coverage.occurrence_count !== allItems.length) {
    errors.push(artifactSetError("/index/coverage/occurrence_count", "occurrence count must equal the page union"));
  }
  const accountedInputCount = index.coverage.occurrence_count +
    index.coverage.coalesced_record_count +
    index.coverage.normalization_error_count;
  if (index.coverage.input_record_count !== accountedInputCount) {
    errors.push(artifactSetError("/index/coverage/input_record_count", "input records must be conserved as occurrences, coalesced rows, or normalization errors"));
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

export async function loadOccurrenceStores(dataInputDir, options = {}) {
  const resolvedDataInputDir = path.resolve(dataInputDir);
  const baseDir = path.join(resolvedDataInputDir, "occurrences");
  const files = await collectFiles(baseDir, (file) => /\.json(?:\.gz)?$/i.test(file));
  const records = [];
  for (const file of files) {
    records.push(await readOccurrenceStoreFile(file));
  }
  await requireOccurrenceBaselineManifest(resolvedDataInputDir, records, {
    requireManifest: await occurrenceBaselineManifestRequired(resolvedDataInputDir, options.requireBaselineManifest)
  });
  return records.sort((left, right) => String(left.store.report_date).localeCompare(String(right.store.report_date)));
}

async function readOccurrenceStoreFile(file) {
  const raw = await fs.readFile(file);
  const store = JSON.parse(file.toLowerCase().endsWith(".gz")
    ? gunzipSync(raw).toString("utf8")
    : raw.toString("utf8"));
  const validation = validateOccurrenceStore(store);
  if (!validation.valid) {
    throw new PublisherError("occurrence_store_schema_validation_failed", `Invalid occurrence store: ${file}`, {
      path: file,
      errors: validation.errors
    });
  }
  return { path: file, store: validation.value };
}

async function requireOccurrenceBaselineManifest(dataInputDir, records, options = {}) {
  const manifestPath = path.join(dataInputDir, "occurrence-baseline-manifest.json");
  const baselineDir = path.join(dataInputDir, "occurrences", "baseline-v1");
  const baselineRecords = records.filter((record) => isPathInside(baselineDir, record.path));
  let manifest;
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT" && baselineRecords.length === 0 && options.requireManifest !== true) return;
    throw new PublisherError(
      "occurrence_baseline_manifest_invalid",
      `Unable to read the immutable occurrence baseline manifest: ${manifestPath}`,
      { cause: error.message }
    );
  }

  const errors = [];
  if (manifest?.schema_version !== 1) errors.push("schema_version must equal 1");
  if (manifest?.kind !== "public_signal_occurrence_baseline") {
    errors.push("kind must equal public_signal_occurrence_baseline");
  }
  if (manifest?.migration?.production_reads_legacy_artifacts !== false) {
    errors.push("migration.production_reads_legacy_artifacts must be false");
  }
  if (!Number.isInteger(manifest?.source?.occurrence_count) || manifest.source.occurrence_count < 0) {
    errors.push("source.occurrence_count must be a non-negative integer");
  }
  if (!Array.isArray(manifest?.files)) errors.push("files must be an array");

  const rootDir = path.dirname(dataInputDir);
  const actualByPath = new Map(baselineRecords.map((record) => [toPosix(path.relative(rootDir, record.path)), record]));
  const declaredByPath = new Map();
  for (const [index, entry] of (Array.isArray(manifest?.files) ? manifest.files : []).entries()) {
    const entryPath = typeof entry?.path === "string" ? entry.path.replaceAll("\\", "/") : "";
    const absolutePath = entryPath ? path.resolve(rootDir, ...entryPath.split("/")) : "";
    if (!entryPath || !absolutePath || !isPathInside(baselineDir, absolutePath)) {
      errors.push(`files[${index}].path must stay inside ${toPosix(path.relative(rootDir, baselineDir))}`);
      continue;
    }
    const canonicalPath = toPosix(path.relative(rootDir, absolutePath));
    if (canonicalPath !== entryPath || declaredByPath.has(entryPath)) {
      errors.push(`files[${index}].path must be canonical and unique`);
      continue;
    }
    declaredByPath.set(entryPath, entry);
  }

  const actualPaths = [...actualByPath.keys()].sort();
  const declaredPaths = [...declaredByPath.keys()].sort();
  if (JSON.stringify(actualPaths) !== JSON.stringify(declaredPaths)) {
    errors.push("manifest files must exactly equal the immutable baseline file set");
  }

  let declaredOccurrenceCount = 0;
  for (const [entryPath, entry] of declaredByPath.entries()) {
    const record = actualByPath.get(entryPath);
    if (!record) continue;
    const raw = await fs.readFile(record.path);
    const digest = createHash("sha256").update(raw).digest("hex");
    if (entry.sha256 !== digest) errors.push(`${entryPath} sha256 does not match the manifest`);
    if (entry.compressed_bytes !== raw.length) errors.push(`${entryPath} compressed_bytes does not match the file`);
    if (entry.report_date !== record.store.report_date) errors.push(`${entryPath} report_date does not match the store`);
    if (entry.occurrence_count !== record.store.occurrence_count) {
      errors.push(`${entryPath} occurrence_count does not match the store`);
    }
    if (Number.isInteger(entry.occurrence_count) && entry.occurrence_count >= 0) {
      declaredOccurrenceCount += entry.occurrence_count;
    }
  }
  if (Number.isInteger(manifest?.source?.occurrence_count) &&
      manifest.source.occurrence_count !== declaredOccurrenceCount) {
    errors.push("source.occurrence_count must equal the sum of baseline file occurrence_count values");
  }

  if (errors.length > 0) {
    throw new PublisherError(
      "occurrence_baseline_manifest_invalid",
      "The immutable occurrence baseline does not match its manifest.",
      { path: manifestPath, errors }
    );
  }
}

async function occurrenceBaselineManifestRequired(dataInputDir, explicitRequirement) {
  if (typeof explicitRequirement === "boolean") return explicitRequirement;
  const contractPath = path.join(path.dirname(dataInputDir), "config", "daily-workflow-contract.json");
  try {
    const contract = JSON.parse(await fs.readFile(contractPath, "utf8"));
    return contract?.daily_runner?.public_signals?.history_baseline?.manifest_path ===
      "reports-data/occurrence-baseline-manifest.json";
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw new PublisherError("occurrence_baseline_contract_invalid", `Unable to read baseline contract: ${contractPath}`, {
      cause: error.message
    });
  }
}

export function publicSignalPagePath(groupId, pageNumber) {
  return `signals/${groupId}/page-${String(pageNumber).padStart(3, "0")}.json`;
}

function publicOccurrence(item) {
  const sourceGroup = resolveSourceGroup(item);
  const credibilityTag = resolveCredibilityTag(item);
  const contentTags = resolveContentTags(item, sourceGroup);
  const homeUrl = originUrl(item.url);
  return {
    id: item.id,
    cluster_id: item.cluster_id,
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
  if (GROUP_IDS.has(item.raw_source_group)) return item.raw_source_group;
  const collectorText = `${item.collector.category || ""} ${item.collector.name} ${item.collector.url}`.toLowerCase();
  if (/\b(?:x|twitter)\b/.test(collectorText)) return "x_updates";
  if (/github/.test(collectorText)) return "github_trending";
  if (/arxiv|paper|research|hugging\s*face|model registry/.test(collectorText)) return "papers_models";
  if (/hacker news|hnrss|reddit|zhihu|wechat|community/.test(collectorText)) return "community_discussions";
  if (/news|newsletter|weekly|rss|feed|media/.test(collectorText)) return "news_newsletters";
  const host = hostname(item.url);
  for (const groupId of ["x_updates", "papers_models", "github_trending", "community_discussions", "official_blogs"]) {
    if (hostMatchesAny(host, publicSignalTaxonomy.host_groups[groupId])) return groupId;
  }
  return "other";
}

function resolveCredibilityTag(item) {
  if (CREDIBILITY_TAG_IDS.has(item.raw_credibility_tag)) return item.raw_credibility_tag;
  if (MONITORING_CATEGORIES.has(item.raw_content_kind)) return "monitoring_lead";
  const verificationMapped = NORMALIZATION_MAPPINGS.verification_status_to_credibility_tag[item.raw_verification_status];
  if (CREDIBILITY_TAG_IDS.has(verificationMapped)) return verificationMapped;
  const sourceMapped = NORMALIZATION_MAPPINGS.source_level_to_credibility_tag[item.raw_source_level];
  return CREDIBILITY_TAG_IDS.has(sourceMapped) ? sourceMapped : "pending_review";
}

function resolveContentTags(item, sourceGroup) {
  const tags = new Set((Array.isArray(item.raw_tags) ? item.raw_tags : []).filter((tag) => CONTENT_TAG_IDS.has(tag)));
  for (const tag of NORMALIZATION_MAPPINGS.content_category_to_content_tags[item.raw_content_category] || []) tags.add(tag);
  for (const tag of NORMALIZATION_MAPPINGS.content_kind_to_content_tags[item.raw_content_kind] || []) tags.add(tag);
  if (sourceGroup === "papers_models" && tags.size === 0) {
    tags.add(item.raw_content_kind === "huggingface_trending" || item.raw_content_kind === "model_release" ? "model_release" : "research");
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

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function publicSignalGeneratedAt(options) {
  const timestamps = [];
  for (const record of Array.isArray(options.occurrenceStores) ? options.occurrenceStores : []) {
    const store = record?.store || record;
    const validation = validateOccurrenceStore(store);
    if (validation.valid) timestamps.push(validation.value.generated_at);
  }
  if (timestamps.length > 0) {
    const latestEpoch = Math.max(...timestamps.map((value) => Date.parse(value)));
    return new Date(latestEpoch).toISOString();
  }
  return isValidDateTimeString(options.generatedAt)
    ? String(options.generatedAt)
    : `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`;
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

function isPathInside(directory, candidate) {
  const relative = path.relative(path.resolve(directory), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function toPosix(value) {
  return String(value).split(path.sep).join("/");
}
