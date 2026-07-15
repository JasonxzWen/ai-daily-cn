import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { PublisherError } from "./errors.js";
import { publicSignalTaxonomy, schemas, validateSourceRegistry } from "./schema.js";

const DEFAULT_SOURCE_DIR = path.join("config", "sources");
const PUBLIC_SOURCE_GROUPS = new Set(publicSignalTaxonomy.source_groups.map((item) => item.id));
const PUBLIC_CREDIBILITY_TAGS = new Set(publicSignalTaxonomy.credibility_tags.map((item) => item.id));
const PUBLIC_CONTENT_TAGS = new Set(publicSignalTaxonomy.content_tags.map((item) => item.id));

export async function loadSourceRegistry(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const sourcesPath = options.sourcesPath || DEFAULT_SOURCE_DIR;
  const resolved = path.resolve(rootDir, sourcesPath);
  const payloads = await readRegistryPayloads(resolved);
  const sources = payloads.flatMap((payload) => normalizeRegistryPayload(payload).sources);
  const normalized = normalizeSourceRegistry({
    schema_version: 1,
    sources
  });
  return normalized;
}

export function loadSourceRegistrySync(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const sourcesPath = options.sourcesPath || DEFAULT_SOURCE_DIR;
  const resolved = path.resolve(rootDir, sourcesPath);
  const payloads = readRegistryPayloadsSync(resolved);
  const sources = payloads.flatMap((payload) => normalizeRegistryPayload(payload).sources);
  const normalized = normalizeSourceRegistry({
    schema_version: 1,
    sources
  });
  return normalized;
}

export async function validateSourceRegistryPath(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const sourcesPath = options.sourcesPath || DEFAULT_SOURCE_DIR;
  const registry = await loadSourceRegistry({ rootDir, sourcesPath });
  const duplicateErrors = duplicateSourceIdErrors(registry.sources);
  if (duplicateErrors.length > 0) {
    throw new PublisherError("source_registry_invalid", "信源注册表存在重复 source id。", {
      errors: duplicateErrors
    });
  }
  return registry;
}

export function normalizeSourceRegistry(payload) {
  assertRegistryTaxonomyContract();
  const registry = normalizeRegistryPayload(payload);
  const validation = validateSourceRegistry(registry);
  if (!validation.valid) {
    throw new PublisherError("source_registry_schema_validation_failed", "信源注册表未通过 schema 校验。", {
      errors: validation.errors
    });
  }
  const taxonomyErrors = sourceRegistryTaxonomyErrors(validation.value.sources);
  if (taxonomyErrors.length > 0) {
    throw new PublisherError("source_registry_taxonomy_validation_failed", "信源注册表未通过公共 taxonomy 校验。", {
      errors: taxonomyErrors
    });
  }

  return {
    ...validation.value,
    sources: validation.value.sources.map(normalizeRegisteredSource)
  };
}

export function normalizeRegisteredSource(source) {
  const sourceKind = source.source_kind || source.sourceKind || source.format || "rss";
  const candidateCategory = source.candidate_category || source.candidateCategory || legacyCandidateCategory(source.category);
  return {
    ...source,
    source_kind: sourceKind,
    candidate_category: candidateCategory,
    category: source.category || legacySourceCategory(candidateCategory, source.source_group),
    format: source.format || (sourceKind === "html_index" ? "html_index" : undefined),
    source_group: normalizeSourceGroup(source.source_group),
    credibility_tag: normalizeCredibilityTag(source.credibility_tag),
    content_tags: normalizeContentTags(source.content_tags),
    requiresOriginalUrl: source.requiresOriginalUrl ?? source.requires_original_url,
    fetchPageSize: source.fetchPageSize || source.fetch_page_size,
    timeoutMs: source.timeoutMs || source.timeout_ms
  };
}

async function readRegistryPayloads(resolvedPath) {
  const stat = await fs.stat(resolvedPath);
  if (stat.isDirectory()) {
    const entries = await fs.readdir(resolvedPath, { withFileTypes: true });
    const files = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => path.join(resolvedPath, entry.name))
      .sort();
    const payloads = [];
    for (const filePath of files) {
      payloads.push(JSON.parse(await fs.readFile(filePath, "utf8")));
    }
    return payloads;
  }
  return [JSON.parse(await fs.readFile(resolvedPath, "utf8"))];
}

function readRegistryPayloadsSync(resolvedPath) {
  const stat = fsSync.statSync(resolvedPath);
  if (stat.isDirectory()) {
    return fsSync.readdirSync(resolvedPath, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => path.join(resolvedPath, entry.name))
      .sort()
      .map((filePath) => JSON.parse(fsSync.readFileSync(filePath, "utf8")));
  }
  return [JSON.parse(fsSync.readFileSync(resolvedPath, "utf8"))];
}

function normalizeRegistryPayload(payload) {
  if (Array.isArray(payload)) {
    return {
      schema_version: 1,
      sources: payload
    };
  }
  return {
    schema_version: payload.schema_version ?? 1,
    sources: Array.isArray(payload.sources) ? payload.sources : []
  };
}

function legacyCandidateCategory(category) {
  if (category === "project") {
    return "project";
  }
  if (category === "intermediary" || category === "x_hotspot" || category === "community") {
    return "community_lead";
  }
  if (category === "builder") {
    return "builder_observation";
  }
  return category || "hot_blog";
}

function legacySourceCategory(candidateCategory, sourceGroup) {
  if (candidateCategory === "project") {
    return "project";
  }
  if (["community_lead", "wechat_item", "zhihu_item", "reddit_item"].includes(candidateCategory) || sourceGroup === "community_discussions") {
    return "community";
  }
  if (candidateCategory === "builder_observation") {
    return "builder";
  }
  return "blog";
}

function duplicateSourceIdErrors(sources) {
  const seen = new Set();
  const errors = [];
  for (const source of sources) {
    if (seen.has(source.id)) {
      errors.push({ path: `$.sources[${source.id}]`, message: `source id 重复：${source.id}` });
    }
    seen.add(source.id);
  }
  return errors;
}

function normalizeSourceGroup(value) {
  const group = String(value || "").trim();
  return PUBLIC_SOURCE_GROUPS.has(group) ? group : "";
}

function normalizeCredibilityTag(value) {
  const tag = String(value || "").trim();
  return PUBLIC_CREDIBILITY_TAGS.has(tag) ? tag : "";
}

function normalizeContentTags(value) {
  return [...new Set(Array.isArray(value) ? value : [])]
    .map((tag) => String(tag || "").trim())
    .filter((tag) => PUBLIC_CONTENT_TAGS.has(tag));
}

function assertRegistryTaxonomyContract() {
  const sourceProperties = schemas.sourceRegistry?.$defs?.source?.properties || {};
  const contracts = [
    ["source_group", sourceProperties.source_group?.enum, publicSignalTaxonomy.source_groups],
    ["credibility_tag", sourceProperties.credibility_tag?.enum, publicSignalTaxonomy.credibility_tags],
    ["content_tags", sourceProperties.content_tags?.items?.enum, publicSignalTaxonomy.content_tags]
  ];
  const mismatches = contracts.flatMap(([field, schemaValues, taxonomyItems]) => {
    const schemaIds = [...new Set(Array.isArray(schemaValues) ? schemaValues : [])].sort();
    const taxonomyIds = [...new Set((Array.isArray(taxonomyItems) ? taxonomyItems : []).map((item) => item.id))].sort();
    return arraysEqual(schemaIds, taxonomyIds) ? [] : [{ field, schema_ids: schemaIds, taxonomy_ids: taxonomyIds }];
  });
  if (mismatches.length > 0) {
    throw new PublisherError("source_registry_taxonomy_contract_drift", "信源注册表 schema 与公共 taxonomy 不一致。", {
      mismatches
    });
  }
}

function sourceRegistryTaxonomyErrors(sources = []) {
  const errors = [];
  for (const [index, source] of sources.entries()) {
    if (!PUBLIC_SOURCE_GROUPS.has(source.source_group)) {
      errors.push({ path: `$.sources[${index}].source_group`, message: `未知 source_group：${source.source_group}` });
    }
    if (!PUBLIC_CREDIBILITY_TAGS.has(source.credibility_tag)) {
      errors.push({ path: `$.sources[${index}].credibility_tag`, message: `未知 credibility_tag：${source.credibility_tag}` });
    }
    for (const [tagIndex, tag] of (Array.isArray(source.content_tags) ? source.content_tags : []).entries()) {
      if (!PUBLIC_CONTENT_TAGS.has(tag)) {
        errors.push({ path: `$.sources[${index}].content_tags[${tagIndex}]`, message: `未知 content tag：${tag}` });
      }
    }
  }
  return errors;
}

function arraysEqual(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
