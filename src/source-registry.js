import fs from "node:fs/promises";
import path from "node:path";
import { PublisherError } from "./errors.js";
import { validateSourceRegistry } from "./schema.js";

const DEFAULT_SOURCE_DIR = path.join("config", "sources");

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

  if (options.includeEnablement) {
    const allowed = new Set(normalizeEnablements(options.includeEnablement));
    normalized.sources = normalized.sources.filter((source) => allowed.has(source.enablement));
  }

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
  const registry = normalizeRegistryPayload(payload);
  const validation = validateSourceRegistry(registry);
  if (!validation.valid) {
    throw new PublisherError("source_registry_schema_validation_failed", "信源注册表未通过 schema 校验。", {
      errors: validation.errors
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
    category: source.category || legacySourceCategory(candidateCategory, source.authority),
    format: source.format || (sourceKind === "html_index" ? "html_index" : undefined),
    tier: source.tier,
    authority: source.authority,
    enablement: source.enablement,
    verification_policy: source.verification_policy,
    requiresOriginalUrl: source.requiresOriginalUrl ?? source.requires_original_url,
    maxItemsPerRun: source.maxItemsPerRun || source.max_items_per_run,
    timeoutMs: source.timeoutMs || source.timeout_ms
  };
}

export function normalizeEnablements(value) {
  if (Array.isArray(value)) {
    return value;
  }
  return String(value || "core")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
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

function legacySourceCategory(candidateCategory, authority) {
  if (candidateCategory === "project") {
    return "project";
  }
  if (candidateCategory === "community_lead" || authority === "community" || authority === "intermediary" || authority === "aggregator") {
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
