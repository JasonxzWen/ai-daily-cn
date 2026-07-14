import fs from "node:fs";
import path from "node:path";
import Ajv from "ajv/dist/2020.js";
import { fileURLToPath } from "node:url";
import { isSafePublicHttpUrl } from "./public-url.js";
import { classifyOccurrenceDateAnomaly, isOccurrenceChronologySorted } from "./signal-chronology.js";
import { isValidDateString, isValidDateTimeString } from "./time.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

function loadSchema(name) {
  const schemaPath = path.join(rootDir, "schemas", name);
  return JSON.parse(fs.readFileSync(schemaPath, "utf8"));
}

function loadConfig(name) {
  const configPath = path.join(rootDir, "config", name);
  return JSON.parse(fs.readFileSync(configPath, "utf8"));
}

function createAjv() {
  const ajv = new Ajv({
    allErrors: true,
    strict: true,
    useDefaults: true
  });

  ajv.addFormat("date", {
    type: "string",
    validate: isValidDateString
  });
  ajv.addFormat("date-time", {
    type: "string",
    validate: isValidDateTimeString
  });
  ajv.addFormat("uri", {
    type: "string",
    validate(value) {
      try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
      } catch {
        return false;
      }
    }
  });

  return ajv;
}

export const schemas = {
  report: loadSchema("report.schema.json"),
  feed: loadSchema("feed.schema.json"),
  articles: loadSchema("articles.schema.json"),
  home: loadSchema("home.schema.json"),
  candidatePool: loadSchema("candidates.schema.json"),
  occurrenceStore: loadSchema("occurrence-store.schema.json"),
  publicSignals: loadSchema("public-signals.schema.json"),
  sourceRegistry: loadSchema("sources.schema.json"),
  trends: loadSchema("trends.schema.json")
};

export const publicSignalTaxonomy = loadConfig("public-signal-taxonomy.json");

const ajv = createAjv();
const validateReportSchema = ajv.compile(schemas.report);
const validateFeedSchema = ajv.compile(schemas.feed);
const validateArticlesSchema = ajv.compile(schemas.articles);
const validateHomeSchema = ajv.compile(schemas.home);
const validateCandidatePoolSchema = ajv.compile(schemas.candidatePool);
const validateOccurrenceStoreSchema = ajv.compile(schemas.occurrenceStore);
const validatePublicSignalsSchema = ajv.compile(schemas.publicSignals);
const validateSourceRegistrySchema = ajv.compile(schemas.sourceRegistry);
const validateTrendsSchema = ajv.compile(schemas.trends);

export function validateReport(report) {
  const candidate = structuredClone(report);
  const valid = validateReportSchema(candidate);
  return {
    valid,
    value: candidate,
    errors: valid ? [] : normalizeAjvErrors(validateReportSchema.errors)
  };
}

export function validateFeed(feed) {
  const candidate = structuredClone(feed);
  const valid = validateFeedSchema(candidate);
  return {
    valid,
    value: candidate,
    errors: valid ? [] : normalizeAjvErrors(validateFeedSchema.errors)
  };
}

export function validateArticles(articles) {
  const candidate = structuredClone(articles);
  const valid = validateArticlesSchema(candidate);
  return {
    valid,
    value: candidate,
    errors: valid ? [] : normalizeAjvErrors(validateArticlesSchema.errors)
  };
}

export function validateHome(home) {
  const candidate = structuredClone(home);
  const valid = validateHomeSchema(candidate);
  return {
    valid,
    value: candidate,
    errors: valid ? [] : normalizeAjvErrors(validateHomeSchema.errors)
  };
}

export function validateCandidatePool(candidatePool) {
  const candidate = structuredClone(candidatePool);
  const valid = validateCandidatePoolSchema(candidate);
  return {
    valid,
    value: candidate,
    errors: valid ? [] : normalizeAjvErrors(validateCandidatePoolSchema.errors)
  };
}

export function validateOccurrenceStore(store) {
  const candidate = structuredClone(store);
  const schemaValid = validateOccurrenceStoreSchema(candidate);
  const semanticErrors = schemaValid ? collectOccurrenceStoreSemanticErrors(candidate) : [];
  return {
    valid: schemaValid && semanticErrors.length === 0,
    value: candidate,
    errors: schemaValid ? semanticErrors : normalizeAjvErrors(validateOccurrenceStoreSchema.errors)
  };
}

export function validatePublicSignals(value) {
  const candidate = structuredClone(value);
  const schemaValid = validatePublicSignalsSchema(candidate);
  const taxonomyErrors = schemaValid ? collectPublicSignalTaxonomyErrors(candidate) : [];
  const semanticErrors = schemaValid ? collectPublicSignalSemanticErrors(candidate) : [];
  return {
    valid: schemaValid && taxonomyErrors.length === 0 && semanticErrors.length === 0,
    value: candidate,
    errors: schemaValid ? [...taxonomyErrors, ...semanticErrors] : normalizeAjvErrors(validatePublicSignalsSchema.errors)
  };
}

export function validateSourceRegistry(sourceRegistry) {
  const candidate = structuredClone(sourceRegistry);
  const valid = validateSourceRegistrySchema(candidate);
  return {
    valid,
    value: candidate,
    errors: valid ? [] : normalizeAjvErrors(validateSourceRegistrySchema.errors)
  };
}

export function validateTrends(trends) {
  const candidate = structuredClone(trends);
  const valid = validateTrendsSchema(candidate);
  return {
    valid,
    value: candidate,
    errors: valid ? [] : normalizeAjvErrors(validateTrendsSchema.errors)
  };
}

function normalizeAjvErrors(errors = []) {
  return errors.map((error) => ({
    code: "schema_validation_failed",
    path: error.instancePath || "/",
    message: error.message || "schema validation failed",
    keyword: error.keyword
  }));
}

function collectPublicSignalTaxonomyErrors(value) {
  const allowedGroups = new Set(publicSignalTaxonomy.source_groups.map((item) => item.id));
  const allowedContentTags = new Set(publicSignalTaxonomy.content_tags.map((item) => item.id));
  const allowedCredibilityTags = new Set(publicSignalTaxonomy.credibility_tags.map((item) => item.id));
  const errors = [];
  if (value?.taxonomy_version !== publicSignalTaxonomy.schema_version) {
    errors.push(taxonomyError("/taxonomy_version", value?.taxonomy_version));
  }
  const occurrences = value?.kind === "signal_index"
    ? (Array.isArray(value.groups) ? value.groups.flatMap((group) => group.preview || []) : [])
    : (Array.isArray(value?.items) ? value.items : []);
  for (const [index, occurrence] of occurrences.entries()) {
    if (!allowedGroups.has(occurrence?.source_group)) {
      errors.push(taxonomyError(`/items/${index}/source_group`, occurrence?.source_group));
    }
    if (!allowedCredibilityTags.has(occurrence?.credibility_tag)) {
      errors.push(taxonomyError(`/items/${index}/credibility_tag`, occurrence?.credibility_tag));
    }
    for (const [tagIndex, tag] of (Array.isArray(occurrence?.content_tags) ? occurrence.content_tags : []).entries()) {
      if (!allowedContentTags.has(tag)) {
        errors.push(taxonomyError(`/items/${index}/content_tags/${tagIndex}`, tag));
      }
    }
  }
  if (value?.kind === "signal_index") {
    for (const [index, group] of (Array.isArray(value.groups) ? value.groups : []).entries()) {
      if (!allowedGroups.has(group?.id)) {
        errors.push(taxonomyError(`/groups/${index}/id`, group?.id));
        continue;
      }
      const expected = publicSignalTaxonomy.source_groups.find((item) => item.id === group.id);
      if (group.label !== expected?.label) {
        errors.push(taxonomyError(`/groups/${index}/label`, group?.label));
      }
    }
  } else if (value?.kind === "signal_page") {
    if (!allowedGroups.has(value?.group?.id)) {
      errors.push(taxonomyError("/group/id", value?.group?.id));
    } else {
      const expected = publicSignalTaxonomy.source_groups.find((item) => item.id === value.group.id);
      if (value.group.label !== expected?.label) {
        errors.push(taxonomyError("/group/label", value.group.label));
      }
    }
  }
  return errors;
}

function collectOccurrenceStoreSemanticErrors(value) {
  const errors = [];
  const occurrences = Array.isArray(value.occurrences) ? value.occurrences : [];
  const normalizationErrors = Array.isArray(value.normalization_errors) ? value.normalization_errors : [];
  if (value.occurrence_count !== occurrences.length) {
    errors.push(semanticError("/occurrence_count", "occurrence_count must equal occurrences.length"));
  }
  if (value.normalization_error_count !== normalizationErrors.length) {
    errors.push(semanticError("/normalization_error_count", "normalization_error_count must equal normalization_errors.length"));
  }
  const representedRecordCount = occurrences.reduce((sum, item) => sum + Number(item?.raw_record_count || 0), 0);
  const coalescedRecordCount = occurrences.reduce((sum, item) => sum + Math.max(0, Number(item?.raw_record_count || 0) - 1), 0);
  if (value.coalesced_record_count !== coalescedRecordCount) {
    errors.push(semanticError("/coalesced_record_count", "coalesced_record_count must equal repeated records represented by canonical observations"));
  }
  if (value.input_record_count !== representedRecordCount + normalizationErrors.length) {
    errors.push(semanticError("/input_record_count", "input_record_count must equal represented plus isolated records"));
  }
  const ids = occurrences.map((item) => item.id);
  if (new Set(ids).size !== ids.length) {
    errors.push(semanticError("/occurrences", "occurrence ids must be unique"));
  }
  const errorIndexes = normalizationErrors.map((item) => item.index);
  if (new Set(errorIndexes).size !== errorIndexes.length || errorIndexes.some((index) => index >= value.input_record_count)) {
    errors.push(semanticError("/normalization_errors", "normalization error indexes must be unique and within the input range"));
  }
  if (!isOccurrenceChronologySorted(occurrences)) {
    errors.push(semanticError("/occurrences", "occurrences must use canonical descending chronology"));
  }
  errors.push(...collectOccurrenceSafetyErrors(occurrences, "/occurrences", { stored: true }));
  return errors;
}

function collectPublicSignalSemanticErrors(value) {
  const errors = [];
  if (value?.kind === "signal_index") {
    const groups = Array.isArray(value.groups) ? value.groups : [];
    const groupCount = groups.reduce((sum, group) => sum + Number(group.count || 0), 0);
    const coverageCount = Object.entries(value.coverage || {})
      .filter(([key]) => key.endsWith("_count") && key !== "normalization_error_count")
      .reduce((sum, [, count]) => sum + Number(count || 0), 0);
    if (value.total_count !== groupCount) {
      errors.push(semanticError("/total_count", "index total_count must equal the sum of group counts"));
    }
    if (value.total_count !== coverageCount) {
      errors.push(semanticError("/coverage", "coverage origin counts must equal total_count"));
    }
    const order = new Map(publicSignalTaxonomy.source_groups.map((group) => [group.id, group.order]));
    const groupIds = groups.map((group) => group.id);
    if (new Set(groupIds).size !== groupIds.length) {
      errors.push(semanticError("/groups", "index groups must be unique"));
    }
    for (const [index, group] of groups.entries()) {
      if (group.page_count !== Math.ceil(group.count / value.page_size)) {
        errors.push(semanticError(`/groups/${index}/page_count`, "group page_count must match count and page_size"));
      }
      if ((group.preview || []).some((item) => item.source_group !== group.id)) {
        errors.push(semanticError(`/groups/${index}/preview`, "preview items must belong to their group"));
      }
      if (group.first_page_url !== `signals/${group.id}/page-001.json`) {
        errors.push(semanticError(`/groups/${index}/first_page_url`, "first_page_url must point to the group's first page"));
      }
      if ((group.preview || []).length > group.count) {
        errors.push(semanticError(`/groups/${index}/preview`, "preview length cannot exceed group count"));
      }
      if (!isUniqueOccurrenceList(group.preview) || !isOccurrenceChronologySorted(group.preview || [])) {
        errors.push(semanticError(`/groups/${index}/preview`, "preview ids must be unique and chronologically sorted"));
      }
      errors.push(...collectOccurrenceSafetyErrors(group.preview || [], `/groups/${index}/preview`));
      if (index > 0 && (order.get(groups[index - 1].id) || 0) >= (order.get(group.id) || 0)) {
        errors.push(semanticError("/groups", "groups must follow canonical taxonomy order"));
      }
    }
  }
  if (value?.kind === "signal_page") {
    const items = Array.isArray(value.items) ? value.items : [];
    const expectedPageCount = Math.ceil(value.total_count / value.page_size);
    const expectedItemCount = value.page < expectedPageCount
      ? value.page_size
      : value.total_count - value.page_size * (expectedPageCount - 1);
    const expectedNext = value.page < expectedPageCount
      ? `signals/${value.group.id}/page-${String(value.page + 1).padStart(3, "0")}.json`
      : null;
    if (value.page_count !== expectedPageCount || value.page > expectedPageCount) {
      errors.push(semanticError("/page_count", "page_count and page must match total_count and page_size"));
    }
    if (items.length !== expectedItemCount) {
      errors.push(semanticError("/items", "page item count must match its exact slice"));
    }
    if (value.next_url !== expectedNext) {
      errors.push(semanticError("/next_url", "next_url must point to the next page and be null on the last page"));
    }
    if (items.some((item) => item.source_group !== value.group.id)) {
      errors.push(semanticError("/items", "all page items must belong to the page group"));
    }
    if (!isUniqueOccurrenceList(items)) {
      errors.push(semanticError("/items", "page occurrence ids must be unique"));
    }
    if (!isOccurrenceChronologySorted(items)) {
      errors.push(semanticError("/items", "page items must use canonical descending chronology"));
    }
    errors.push(...collectOccurrenceSafetyErrors(items, "/items"));
  }
  return errors;
}

function collectOccurrenceSafetyErrors(items, basePath, options = {}) {
  const errors = [];
  for (const [index, item] of (Array.isArray(items) ? items : []).entries()) {
    const prefix = `${basePath}/${index}`;
    const urls = options.stored
      ? [
          ["url", item?.url],
          ["collector/url", item?.collector?.url],
          ["image_url", item?.image_url]
        ]
      : [
          ["url", item?.url],
          ["publisher/home_url", item?.publisher?.home_url],
          ["collected_via/url", item?.collected_via?.url],
          ["image_url", item?.image_url]
        ];
    for (const [field, url] of urls) {
      if (url == null) continue;
      if (!isSafePublicHttpUrl(url)) {
        errors.push(semanticError(`${prefix}/${field}`, "public URL must be canonical HTTP(S) without credentials, fragments, tracking, or secret query parameters"));
      }
    }
    const expectedAnomaly = classifyOccurrenceDateAnomaly(item);
    if ((item?.date_anomaly || null) !== expectedAnomaly) {
      errors.push(semanticError(`${prefix}/date_anomaly`, "date_anomaly must match the canonical collection-time comparison"));
    }
  }
  return errors;
}

function isUniqueOccurrenceList(items = []) {
  const ids = items.map((item) => item.id);
  return new Set(ids).size === ids.length;
}

function taxonomyError(pathname, value) {
  return {
    code: "taxonomy_value_unknown",
    path: pathname,
    message: `unknown normalized taxonomy value: ${String(value || "")}`,
    keyword: "taxonomy"
  };
}

function semanticError(pathname, message) {
  return {
    code: "semantic_validation_failed",
    path: pathname,
    message,
    keyword: "semantic"
  };
}
