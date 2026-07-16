import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Ajv from "ajv/dist/2020.js";
import { fileURLToPath } from "node:url";
import { validatePersistedAifyTodayItem } from "./aify-today-picks.js";
import { canonicalPublicUrlIdentity, hasUnsafePublicHttpUrlMaterial, isSafePublicHttpUrl } from "./public-url.js";
import { rawMaterialUrlHash, rawObservationContentHash } from "./raw-observation-integrity.js";
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
  rawObservations: loadSchema("raw-observations.schema.json"),
  sourceFunnel: loadSchema("source-funnel.schema.json"),
  signalQuarantine: loadSchema("signal-quarantine.schema.json"),
  signalPool: loadSchema("signal-pool.schema.json"),
  publicSignalPool: loadSchema("public-signal-pool.schema.json"),
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
const validateRawObservationsSchema = ajv.compile(schemas.rawObservations);
const validateSourceFunnelSchema = ajv.compile(schemas.sourceFunnel);
const validateSignalQuarantineSchema = ajv.compile(schemas.signalQuarantine);
const validateSignalPoolSchema = ajv.compile(schemas.signalPool);
const validatePublicSignalPoolSchema = ajv.compile(schemas.publicSignalPool);
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

export function validateRawObservations(store) {
  const candidate = structuredClone(store);
  const schemaValid = validateRawObservationsSchema(candidate);
  const semanticErrors = schemaValid ? collectRawObservationSemanticErrors(candidate) : [];
  return {
    valid: schemaValid && semanticErrors.length === 0,
    value: candidate,
    errors: schemaValid ? semanticErrors : normalizeAjvErrors(validateRawObservationsSchema.errors)
  };
}

export function validateSourceFunnel(funnel) {
  const candidate = structuredClone(funnel);
  const schemaValid = validateSourceFunnelSchema(candidate);
  const semanticErrors = schemaValid ? collectSourceFunnelSemanticErrors(candidate) : [];
  return {
    valid: schemaValid && semanticErrors.length === 0,
    value: candidate,
    errors: schemaValid ? semanticErrors : normalizeAjvErrors(validateSourceFunnelSchema.errors)
  };
}

export function validateSignalQuarantine(quarantine) {
  const candidate = structuredClone(quarantine);
  const schemaValid = validateSignalQuarantineSchema(candidate);
  const semanticErrors = schemaValid ? collectSignalQuarantineSemanticErrors(candidate) : [];
  return {
    valid: schemaValid && semanticErrors.length === 0,
    value: candidate,
    errors: schemaValid ? semanticErrors : normalizeAjvErrors(validateSignalQuarantineSchema.errors)
  };
}

export function validateSignalPool(pool) {
  const candidate = structuredClone(pool);
  const schemaValid = validateSignalPoolSchema(candidate);
  const semanticErrors = schemaValid ? collectSignalPoolSemanticErrors(candidate) : [];
  return {
    valid: schemaValid && semanticErrors.length === 0,
    value: candidate,
    errors: schemaValid ? semanticErrors : normalizeAjvErrors(validateSignalPoolSchema.errors)
  };
}

export function validatePublicSignalPool(pool) {
  const candidate = structuredClone(pool);
  const schemaValid = validatePublicSignalPoolSchema(candidate);
  const semanticErrors = schemaValid ? collectPublicSignalPoolSemanticErrors(candidate) : [];
  return {
    valid: schemaValid && semanticErrors.length === 0,
    value: candidate,
    errors: schemaValid ? semanticErrors : normalizeAjvErrors(validatePublicSignalPoolSchema.errors)
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

function collectSignalQuarantineSemanticErrors(value) {
  const errors = [];
  const items = Array.isArray(value.items) ? value.items : [];
  if (value.item_count !== items.length) {
    errors.push(semanticError("/item_count", "item_count must equal items.length"));
  }
  if (!hasUniqueValues(items.map((item) => item.raw_observation_id))) {
    errors.push(semanticError("/items", "quarantine raw observation ids must be unique"));
  }
  if (Date.parse(value.expires_at) <= Date.parse(value.generated_at)) {
    errors.push(semanticError("/expires_at", "expires_at must be later than generated_at"));
  }
  return errors;
}

function collectSignalPoolSemanticErrors(value) {
  const errors = [];
  const preAdmissionReceipts = Array.isArray(value.pre_admission_receipts) ? value.pre_admission_receipts : [];
  const receipts = Array.isArray(value.admission_receipts) ? value.admission_receipts : [];
  const summaries = Array.isArray(value.summary_receipts) ? value.summary_receipts : [];
  const signals = Array.isArray(value.signals) ? value.signals : [];
  if (value.input_observation_count !== receipts.length) {
    errors.push(semanticError("/input_observation_count", "input_observation_count must equal admission_receipts.length"));
  }
  const expectedPreAdmissionCount = Number(value.pre_admission_counts?.normalization_errors || 0) +
    Number(value.pre_admission_counts?.parser_rejections || 0);
  if (preAdmissionReceipts.length !== expectedPreAdmissionCount) {
    errors.push(semanticError("/pre_admission_receipts", "pre-admission receipts must conserve normalization and parser rejects"));
  }
  if (value.input_record_count !== receipts.reduce((sum, item) => sum + Number(item.represented_input_count || 0), 0) + preAdmissionReceipts.length) {
    errors.push(semanticError("/input_record_count", "input_record_count must equal represented observations plus pre-admission receipts"));
  }
  const dispositionCounts = countEnum(receipts.map((item) => item.disposition), ["admitted", "rejected", "needs_review"]);
  const dispositionInputCounts = receipts.reduce((counts, item) => {
    counts[item.disposition] += Number(item.represented_input_count || 0);
    return counts;
  }, { admitted: 0, rejected: 0, needs_review: 0 });
  for (const key of Object.keys(dispositionCounts)) {
    if (value.disposition_counts?.[key] !== dispositionCounts[key]) {
      errors.push(semanticError(`/disposition_counts/${key}`, "disposition count must match admission receipts"));
    }
    if (value.disposition_input_counts?.[key] !== dispositionInputCounts[key]) {
      errors.push(semanticError(`/disposition_input_counts/${key}`, "represented input count must match admission receipts"));
    }
  }
  if (value.signal_count !== signals.length) {
    errors.push(semanticError("/signal_count", "signal_count must equal signals.length"));
  }
  if (summaries.length !== signals.length) {
    errors.push(semanticError("/summary_receipts", "every signal must have exactly one summary receipt"));
  }
  const summaryCounts = countEnum(signals.map((item) => item.summary_status), ["ready", "pending", "failed"]);
  for (const key of Object.keys(summaryCounts)) {
    if (value.summary_counts?.[key] !== summaryCounts[key]) {
      errors.push(semanticError(`/summary_counts/${key}`, "summary count must match signal status"));
    }
  }
  for (const [collectionPath, values] of [
    ["/pre_admission_receipts", preAdmissionReceipts.map((item) => item.receipt_id)],
    ["/admission_receipts", receipts.map((item) => item.receipt_id)],
    ["/admission_receipts", receipts.map((item) => item.raw_observation_id)],
    ["/summary_receipts", summaries.map((item) => item.receipt_id)],
    ["/summary_receipts", summaries.map((item) => item.signal_id)],
    ["/signals", signals.map((item) => item.signal_id)],
    ["/signals", signals.map((item) => item.canonical_url)]
  ]) {
    if (!hasUniqueValues(values)) errors.push(semanticError(collectionPath, "identity values must be unique"));
  }
  for (const [index, signal] of signals.entries()) {
    if (signal.summary_status === "ready" && (!signal.source_summary || signal.summary_origin === "none")) {
      errors.push(semanticError(`/signals/${index}/source_summary`, "ready signals require a source summary and origin"));
    }
    if (signal.summary_status !== "ready" && signal.source_summary !== null) {
      errors.push(semanticError(`/signals/${index}/source_summary`, "non-ready signals cannot expose a source summary"));
    }
  }
  return errors;
}

function collectPublicSignalPoolSemanticErrors(value) {
  const errors = [];
  const items = Array.isArray(value.items) ? value.items : [];
  if (value.item_count !== items.length) {
    errors.push(semanticError("/item_count", "item_count must equal items.length"));
  }
  if (!hasUniqueValues(items.map((item) => item.signal_id)) || !hasUniqueValues(items.map((item) => item.canonical_url))) {
    errors.push(semanticError("/items", "public-ready signal and canonical URL identities must be unique"));
  }
  return errors;
}

function countEnum(values, keys) {
  const counts = Object.fromEntries(keys.map((key) => [key, 0]));
  for (const value of values) {
    if (Object.hasOwn(counts, value)) counts[value] += 1;
  }
  return counts;
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

function collectRawObservationSemanticErrors(value) {
  const errors = [];
  const observations = Array.isArray(value.observations) ? value.observations : [];
  const normalizationErrors = Array.isArray(value.normalization_errors) ? value.normalization_errors : [];
  const rejections = Array.isArray(value.rejections) ? value.rejections : [];
  if (value.observation_count !== observations.length) {
    errors.push(semanticError("/observation_count", "observation_count must equal observations.length"));
  }
  if (value.normalization_error_count !== normalizationErrors.length) {
    errors.push(semanticError("/normalization_error_count", "normalization_error_count must equal normalization_errors.length"));
  }
  if (value.rejection_count !== rejections.length) {
    errors.push(semanticError("/rejection_count", "rejection_count must equal rejections.length"));
  }
  const represented = observations.reduce((sum, item) => sum + (
    item?.source_id === "aify_today_picks"
      ? Number(item?.upstream?.upstream_positions?.length || 0)
      : Number(item?.raw_record_count || 0)
  ), 0);
  if (value.input_record_count !== represented + normalizationErrors.length + rejections.length) {
    errors.push(semanticError("/input_record_count", "input_record_count must conserve represented, isolated, and rejected input records"));
  }
  if (!hasUniqueValues(observations.map((item) => item.id))) {
    errors.push(semanticError("/observations", "raw observation ids must be unique"));
  }
  const errorIndexes = normalizationErrors.map((item) => item.index);
  if (!hasUniqueValues(errorIndexes) || errorIndexes.some((index) => index >= value.input_record_count)) {
    errors.push(semanticError("/normalization_errors", "normalization error indexes must be unique and within the input range"));
  }
  const rejectionKeys = rejections.map((item) => `${item?.source_id}:${item?.upstream_position}`);
  if (!hasUniqueValues(rejectionKeys)) {
    errors.push(semanticError("/rejections", "rejected upstream positions must be unique per source"));
  }
  for (const [index, item] of observations.entries()) {
    if (item.collector?.id !== item.source_id) {
      errors.push(semanticError(`/observations/${index}/collector/id`, "collector id must equal the raw observation source_id"));
    }
    if (!isSafePublicHttpUrl(item.material_url)) {
      errors.push(semanticError(`/observations/${index}/material_url`, "material_url must be a repo-safe public HTTP(S) URL"));
    }
    if (item.material_url_hash !== rawMaterialUrlHash(item.material_url)) {
      errors.push(semanticError(`/observations/${index}/material_url_hash`, "material_url_hash must match the persisted material URL"));
    }
    if (item.collector?.url != null && !isSafePublicHttpUrl(item.collector.url)) {
      errors.push(semanticError(`/observations/${index}/collector/url`, "collector URL must be a repo-safe public HTTP(S) URL"));
    }
    const expectedExcerptHash = item.excerpt == null ? null : sha256(item.excerpt);
    if (
      item.excerpt_hash !== expectedExcerptHash ||
      (item.excerpt == null) !== (item.excerpt_origin === "none")
    ) {
      errors.push(semanticError(`/observations/${index}/excerpt_hash`, "excerpt text, origin, and hash must form one deterministic projection"));
    }
    if (item.source_id !== "aify_today_picks" && item.excerpt != null && item.excerpt !== item.excerpt.trim()) {
      errors.push(semanticError(`/observations/${index}/excerpt`, "ordinary excerpts must use canonical trimmed text"));
    }
    if (item.content_hash !== rawObservationContentHash(item)) {
      errors.push(semanticError(`/observations/${index}/content_hash`, "content_hash must match the canonical raw observation projection"));
    }
    if (item.upstream) {
      if (item.source_id !== "aify_today_picks" || item.excerpt_origin !== "upstream_editorial") {
        errors.push(semanticError(`/observations/${index}/upstream`, "only Aify observations may carry trusted upstream editorial payloads"));
      }
      if (hasUnsafePublicHttpUrlMaterial(item.upstream.url)) {
        errors.push(semanticError(`/observations/${index}/upstream/url`, "upstream URL must preserve a safe public HTTP(S) value"));
      }
      if (
        item.upstream.title !== item.title ||
        item.upstream.summary !== item.excerpt ||
        canonicalPublicUrlIdentity(item.upstream.url) !== canonicalPublicUrlIdentity(item.material_url) ||
        item.upstream.date !== item.event_date
      ) {
        errors.push(semanticError(`/observations/${index}/upstream`, "Aify upstream fields must match the persisted safe material projection"));
      }
      const persistedValidation = validatePersistedAifyTodayItem(item.upstream, { reportDate: value.report_date });
      if (!persistedValidation.valid) {
        errors.push(semanticError(`/observations/${index}/upstream`, `Aify persisted payload failed mechanical validation: ${persistedValidation.reason}`));
      }
    }
  }
  const aifyPositions = [
    ...observations
      .filter((item) => item?.source_id === "aify_today_picks")
      .flatMap((item) => item?.upstream?.upstream_positions || []),
    ...rejections
      .filter((item) => item?.source_id === "aify_today_picks")
      .map((item) => item.upstream_position)
  ].sort((left, right) => left - right);
  if (aifyPositions.length > 0 && (
    !hasUniqueValues(aifyPositions) ||
    aifyPositions.some((position, index) => position !== index + 1)
  )) {
    errors.push(semanticError("/rejections", "Aify accepted and rejected positions must conserve one contiguous upstream input"));
  }
  return errors;
}

function collectSourceFunnelSemanticErrors(value) {
  const errors = [];
  const reconciliation = value.asset_reconciliation || {};
  const uniqueCollections = [
    ["/asset_reconciliation/current_entries", reconciliation.current_entries, "source_id"],
    ["/asset_reconciliation/historical_decisions", reconciliation.historical_decisions, "source_id"],
    ["/asset_reconciliation/promotion_proposals", reconciliation.promotion_proposals, "source_id"],
    ["/asset_reconciliation/logical_sources", reconciliation.logical_sources, "logical_source_id"],
    ["/lanes", value.lanes, "lane_id"]
  ];
  for (const [pathname, rows, key] of uniqueCollections) {
    if (!hasUniqueValues((Array.isArray(rows) ? rows : []).map((item) => item?.[key]))) {
      errors.push(semanticError(pathname, `${key} values must be unique`));
    }
  }
  const actionCounts = { promoted: 0, defer: 0, retire: 0 };
  for (const proposal of Array.isArray(reconciliation.promotion_proposals) ? reconciliation.promotion_proposals : []) {
    actionCounts[proposal.action] += 1;
  }
  for (const action of Object.keys(actionCounts)) {
    if (reconciliation.promotion_action_counts?.[action] !== actionCounts[action]) {
      errors.push(semanticError(`/asset_reconciliation/promotion_action_counts/${action}`, "promotion action count must match proposal rows"));
    }
  }
  for (const [laneIndex, lane] of (Array.isArray(value.lanes) ? value.lanes : []).entries()) {
    const expectedUnits = {
      registered: "source_entry",
      fetched: "fetch_attempt",
      parsed: "observation",
      admitted: "signal",
      displayed: "edition_item"
    };
    for (const [stageName, stage] of Object.entries(lane.stages || {})) {
      if (stage.unit !== expectedUnits[stageName]) {
        errors.push(semanticError(`/lanes/${laneIndex}/stages/${stageName}/unit`, `stage unit must be ${expectedUnits[stageName]}`));
      }
      if (stage.count !== (Array.isArray(stage.item_ids) ? stage.item_ids.length : 0)) {
        errors.push(semanticError(`/lanes/${laneIndex}/stages/${stageName}/count`, "stage count must equal item_ids.length"));
      }
      if (stage.status === "not_run" && (stage.count !== 0 || stage.failure_reason)) {
        errors.push(semanticError(`/lanes/${laneIndex}/stages/${stageName}`, "not_run stages cannot claim items or failures"));
      }
      if (["success_with_items", "healthy_empty"].includes(stage.status) && stage.failure_reason) {
        errors.push(semanticError(`/lanes/${laneIndex}/stages/${stageName}/failure_reason`, "successful stages cannot carry a failure reason"));
      }
      if (stage.status === "success_with_items" && stage.count === 0) {
        errors.push(semanticError(`/lanes/${laneIndex}/stages/${stageName}`, "success_with_items stages must carry at least one receipt"));
      }
    }
    const registeredStatus = lane.stages?.registered?.status;
    const fetchedStatus = lane.stages?.fetched?.status;
    const parsedStatus = lane.stages?.parsed?.status;
    if (registeredStatus === "not_run" && (fetchedStatus !== "not_run" || parsedStatus !== "not_run")) {
      errors.push(semanticError(`/lanes/${laneIndex}/stages`, "unregistered lanes cannot claim fetched or parsed receipts"));
    }
    if (fetchedStatus === "not_run" && parsedStatus !== "not_run") {
      errors.push(semanticError(`/lanes/${laneIndex}/stages`, "parsed stage cannot run before the fetched stage"));
    }
    if (parsedStatus === "success_with_items" && fetchedStatus !== "success_with_items") {
      errors.push(semanticError(`/lanes/${laneIndex}/stages`, "parsed items require a successful fetched stage"));
    }
    if (parsedStatus === "healthy_empty" && lane.stages?.parsed?.count !== 0) {
      errors.push(semanticError(`/lanes/${laneIndex}/stages/parsed`, "healthy_empty parsed stages cannot carry observations"));
    }
    if (lane.terminal_status !== lane.stages?.parsed?.status) {
      errors.push(semanticError(`/lanes/${laneIndex}/terminal_status`, "terminal_status must mirror the parsed shadow stage"));
    }
    if (lane.failure_reason !== lane.stages?.parsed?.failure_reason) {
      errors.push(semanticError(`/lanes/${laneIndex}/failure_reason`, "lane failure_reason must mirror the parsed shadow stage"));
    }
    if (lane.collector_receipt?.receipt_kind === "aify_today_picks") {
      const receipt = lane.collector_receipt;
      if (
        lane.lane_id !== "aify_today_picks" ||
        !/^sha256:[a-f0-9]{64}$/.test(String(receipt.upstream_payload_sequence_hash || "")) ||
        receipt.item_count !== receipt.parsed_count ||
        receipt.item_count !== lane.stages?.parsed?.count ||
        receipt.input_count !== receipt.represented_input_count + receipt.rejection_count
      ) {
        errors.push(semanticError(`/lanes/${laneIndex}/collector_receipt`, "Aify content receipt counts must conserve the persisted parsed and rejected input"));
      }
    }
    if (lane.collector_receipt?.receipt_kind === "aify_site_health" && lane.lane_id !== "site-aify-news") {
      errors.push(semanticError(`/lanes/${laneIndex}/collector_receipt`, "Aify site-health receipt must belong to the site-aify-news lane"));
    }
    if (value.pipeline_phase === "phase_1a_shadow" && (
      lane.stages?.admitted?.status !== "not_run" ||
      lane.stages?.displayed?.status !== "not_run"
    )) {
      errors.push(semanticError(`/lanes/${laneIndex}/stages`, "Phase 1A cannot run admitted or displayed stages"));
    }
  }
  const serialized = JSON.stringify(value);
  if (/https?:\/\//i.test(serialized) || /(?:OPENAI_API_KEY|ANTHROPIC_API_KEY|GITHUB_TOKEN|GH_TOKEN|Authorization\s*:|Bearer\s+)/i.test(serialized)) {
    errors.push(semanticError("/", "source funnel must not persist raw URLs or secret-looking values"));
  }
  return errors;
}

function hasUniqueValues(values = []) {
  return new Set(values).size === values.length;
}

function collectPublicSignalSemanticErrors(value) {
  const errors = [];
  if (value?.kind === "signal_index") {
    const groups = Array.isArray(value.groups) ? value.groups : [];
    const groupCount = groups.reduce((sum, group) => sum + Number(group.count || 0), 0);
    const groupRecentCount = groups.reduce((sum, group) => sum + Number(group.recent_count || 0), 0);
    const coverage = value.coverage || {};
    if (value.total_count !== groupCount) {
      errors.push(semanticError("/total_count", "index total_count must equal the sum of group counts"));
    }
    if (value.total_count !== Number(coverage.occurrence_count || 0)) {
      errors.push(semanticError("/coverage/occurrence_count", "coverage occurrence_count must equal total_count"));
    }
    if (value.recent_count !== groupRecentCount) {
      errors.push(semanticError("/recent_count", "index recent_count must equal the sum of group recent counts"));
    }
    const accountedInputCount = Number(coverage.occurrence_count || 0) +
      Number(coverage.coalesced_record_count || 0) +
      Number(coverage.normalization_error_count || 0);
    if (Number(coverage.input_record_count || 0) !== accountedInputCount) {
      errors.push(semanticError("/coverage/input_record_count", "coverage input records must be conserved as occurrences, coalesced rows, or normalization errors"));
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
      if (group.recent_count > group.count) {
        errors.push(semanticError(`/groups/${index}/recent_count`, "group recent_count cannot exceed its archive count"));
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

function sha256(value) {
  return `sha256:${createHash("sha256").update(String(value || "")).digest("hex")}`;
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
