import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import {
  AIFY_TODAY_LANE_ID,
  AIFY_SITE_WATCH_ID,
  aifyPayloadSequenceHash,
  createAifyTodayPicksFailure
} from "./aify-today-picks.js";
import { encodeJsonArtifact } from "./compressed-json.js";
import { PublisherError } from "./errors.js";
import { buildOccurrenceStore } from "./occurrence-store.js";
import { findRepoSafeReceiptPrivacyFindings } from "./privacy.js";
import { rawObservationsRelativePath, sourceFunnelRelativePath } from "./reports-data-layout.js";
import { canonicalPublicUrlIdentity, sanitizePublicHttpUrl } from "./public-url.js";
import { rawMaterialUrlHash, rawObservationContentHash } from "./raw-observation-integrity.js";
import { validateRawObservations, validateSourceFunnel } from "./schema.js";
import {
  CORE_SOURCE_CONTRACTS,
  logicalSourceIdsForRegisteredSource,
  parseHistoricalSourceDecisions,
  parseSourcePromotionReview
} from "./source-effectiveness.js";
import { validateSourceRegistryPath } from "./source-registry.js";
import { isValidDateString, isValidDateTimeString } from "./time.js";

const OWNER_PR = "pr3-source-raw-funnel-shadow";
const PRIORITY_LOGICAL_SOURCES = new Set([
  "aify-news",
  "anthropic-research-engineering",
  "github-trending",
  "follow-builders",
  "github-watch-follow-builders",
  "huggingface-daily-papers",
  "arxiv-papers",
  "swe-bench-pro",
  "chinese-direct-rss"
]);
const USER_EXPLICIT_LOGICAL_SOURCES = new Set([
  "aify-news",
  "follow-builders",
  "github-watch-follow-builders",
  "github-trending",
  "huggingface-daily-papers",
  "arxiv-papers",
  "chinese-direct-rss"
]);
const SUCCESS_STATUSES = new Set(["checked", "success", "success_with_items"]);
const HEALTHY_EMPTY_STATUSES = new Set(["no_signal", "healthy_empty"]);
const BLOCKED_STATUSES = new Set([
  "blocked",
  "rate_limited",
  "unauthorized",
  "forbidden",
  "skipped_missing_token",
  "skipped_missing_base_url"
]);
const FAILED_STATUSES = new Set(["failed", "error", "parse_failed"]);
const HISTORICAL_REPLACEMENTS = new Map([
  ["content-ai-news-buttondown", { logicalSourceId: "smol-ai-news", sourceEntryIds: ["content-smol-ai-news"] }],
  ["content-hn-frontpage", { logicalSourceId: "community-hotspots", sourceEntryIds: ["community-hn-frontpage-100", "community-hn-ai-newest"] }],
  ["content-papers-with-code-api", { logicalSourceId: "huggingface-daily-papers", sourceEntryIds: ["content-huggingface-daily-papers"] }],
  ["content-themagnifier-ai", { logicalSourceId: "the-magnifier-ai", sourceEntryIds: ["content-the-magnifier-ai"] }],
  ["content-crunchbase-news-ai", { logicalSourceId: "content-crunchbase-ai-news", sourceEntryIds: ["content-crunchbase-ai-news"] }],
  ["platform-wechat-ai-feed", { logicalSourceId: "wechat2rss-public-feeds", sourceEntryPrefix: "wechat2rss-" }],
  ["wechat-industry-whitelist-manual", { logicalSourceId: "wechat2rss-public-feeds", sourceEntryPrefix: "wechat2rss-" }],
  ["wechat-rsshub-newrank-template", { logicalSourceId: "wechat2rss-public-feeds", sourceEntryPrefix: "wechat2rss-" }],
  ["wechat-wechat2rss-feed", { logicalSourceId: "wechat2rss-public-feeds", sourceEntryPrefix: "wechat2rss-" }]
]);

export async function runCuratedSourceShadow(options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const reportDate = String(options.reportDate || "").trim();
  const generatedAt = String(options.generatedAt || "").trim();
  if (!isValidDateString(reportDate)) {
    throw new PublisherError("curated_shadow_date_invalid", "Curated source shadow requires a valid report date.");
  }
  if (!isValidDateTimeString(generatedAt)) {
    throw new PublisherError("curated_shadow_generated_at_invalid", "Curated source shadow requires a valid generated_at timestamp.");
  }

  const inputPaths = normalizeInputPaths(options.inputPaths || options.inputPath || options.input);
  if (inputPaths.length === 0) {
    throw new PublisherError("curated_shadow_input_required", "Curated source shadow requires at least one discovery input.");
  }
  const payloads = [];
  for (const inputPath of inputPaths) {
    const resolved = await assertOwnedPath(rootDir, inputPath, "curated_shadow_input_outside_repository");
    const payload = JSON.parse(await fs.readFile(resolved, "utf8"));
    if (payload?.report_date && payload.report_date !== reportDate) {
      throw new PublisherError("curated_shadow_input_date_mismatch", "Curated source shadow input report date does not match.", {
        input_path: toRepoAnchor(rootDir, resolved),
        input_report_date: payload.report_date,
        report_date: reportDate
      });
    }
    payloads.push(payload);
  }

  const aifyResult = options.aifyResult || createAifyTodayPicksFailure("https://aify-news.pages.dev/", "aify_collection_not_run");
  validateAifyCollectorReceipt(aifyResult);
  const outputDir = await assertOwnedPath(rootDir, options.outputDir || "reports-data", "curated_shadow_output_outside_repository");
  const rawPath = await assertOwnedPath(
    rootDir,
    path.join(outputDir, rawObservationsRelativePath(reportDate)),
    "curated_shadow_output_outside_repository"
  );
  const funnelPath = await assertOwnedPath(
    rootDir,
    path.join(outputDir, sourceFunnelRelativePath(reportDate)),
    "curated_shadow_output_outside_repository"
  );

  const {
    registry,
    historicalDecisions,
    promotionProposals,
    sourcesAnchor
  } = await loadCuratedShadowCanonicalOwners({ ...options, rootDir });

  const discoverySources = payloads.flatMap((payload) => Array.isArray(payload?.sources) ? payload.sources : []);
  const discoveryCandidates = payloads.flatMap((payload) => Array.isArray(payload?.candidates) ? payload.candidates : []);
  const aifyCandidates = createAifyCandidates(aifyResult, generatedAt);
  const candidates = [...discoveryCandidates, ...aifyCandidates];
  const candidateSources = createCandidateOccurrenceSources(discoveryCandidates);
  const candidateSourceIds = new Set(candidateSources.map((source) => source.id));
  const runtimeSources = addAuditOnlySources(payloads, uniqueSourcesById([
    ...registry.sources,
    ...discoverySources,
    ...candidateSources
  ]));
  const occurrenceSources = uniqueSourcesById([...runtimeSources, createAifyOccurrenceSource(aifyResult)]);
  const occurrenceStore = buildOccurrenceStore({
    reportDate,
    generatedAt,
    sources: occurrenceSources,
    candidates
  });
  const rawObservations = buildRawObservations({
    occurrenceStore,
    candidates,
    sources: occurrenceSources,
    aifyResult
  });

  const auditRows = collectAuditRows(payloads, occurrenceSources, candidateSourceIds);
  addAifyAuditRow(auditRows, aifyResult);
  const assetReconciliation = buildCuratedSourceAssetReconciliation({
    registry,
    sources: occurrenceSources,
    auditRows,
    rawObservations,
    historicalDecisions,
    promotionProposals,
    sourcesPath: sourcesAnchor
  });
  const funnel = {
    schema_version: 1,
    kind: "source_funnel",
    pipeline_phase: "phase_1a_shadow",
    report_date: reportDate,
    generated_at: generatedAt,
    asset_reconciliation: assetReconciliation,
    lanes: buildFunnelLanes({
      sources: occurrenceSources,
      auditRows,
      rawObservations,
      aifyResult
    })
  };

  const rawValidation = validateRawObservations(rawObservations);
  if (!rawValidation.valid) {
    throw new PublisherError("raw_observations_schema_validation_failed", "Raw observations failed validation.", {
      errors: rawValidation.errors
    });
  }
  const funnelValidation = validateSourceFunnel(funnel);
  if (!funnelValidation.valid) {
    throw new PublisherError("source_funnel_schema_validation_failed", "Source funnel failed validation.", {
      errors: funnelValidation.errors
    });
  }
  validateCuratedShadowArtifacts({
    rawObservations: rawValidation.value,
    sourceFunnel: funnelValidation.value,
    registry,
    historicalDecisions,
    promotionProposals
  });

  const privacyFindings = [
    ...findRepoSafeReceiptPrivacyFindings(rawValidation.value, {
      rootDir,
      relativeFile: toRepoAnchor(rootDir, rawPath)
    }),
    ...findRepoSafeReceiptPrivacyFindings(funnelValidation.value, {
      rootDir,
      relativeFile: toRepoAnchor(rootDir, funnelPath)
    })
  ];
  if (privacyFindings.length > 0) {
    throw new PublisherError("curated_shadow_privacy_validation_failed", "Curated shadow receipts failed the in-memory repo-safe privacy gate.", {
      finding_patterns: uniqueStrings(privacyFindings.map((item) => item.pattern))
    });
  }
  await writeJsonPairAtomic([
    [rawPath, rawValidation.value],
    [funnelPath, funnelValidation.value]
  ]);
  const priorityLanes = funnelValidation.value.lanes.filter((lane) => lane.priority);
  const degradedLanes = funnelValidation.value.lanes
    .filter((lane) => (
      ["blocked", "failed"].includes(lane.terminal_status) ||
      (lane.priority && lane.terminal_status === "not_run")
    ))
    .map((lane) => ({
      lane_id: lane.lane_id,
      terminal_status: lane.terminal_status,
      failure_reason: lane.failure_reason
    }));
  const priorityLaneIds = new Set(priorityLanes.map((lane) => lane.lane_id));
  const priorityFailures = degradedLanes.filter((lane) => priorityLaneIds.has(lane.lane_id));
  return {
    ok: true,
    degraded: degradedLanes.length > 0,
    degraded_reason: degradedLanes.length > 0 ? "source_lanes_degraded" : "",
    priority_terminal_counts: countBy(priorityLanes.map((lane) => lane.terminal_status)),
    priority_failures: priorityFailures,
    degraded_lanes: degradedLanes,
    report_date: reportDate,
    raw_observations_path: rawPath,
    source_funnel_path: funnelPath,
    observation_count: rawValidation.value.observation_count,
    lane_count: funnelValidation.value.lanes.length,
    current_entry_count: registry.sources.length,
    historical_decision_count: historicalDecisions.length,
    promotion_proposal_count: promotionProposals.length
  };
}

export function validateCuratedShadowArtifacts(options = {}) {
  const raw = options.rawObservations || {};
  const funnel = options.sourceFunnel || {};
  const registry = options.registry || { sources: [] };
  const expectedHistorical = options.historicalDecisions || [];
  const expectedPromotions = options.promotionProposals || [];
  const reconciliation = funnel.asset_reconciliation || {};
  assertExactRows(
    registry.sources.map((source) => ({ source_id: source.id })),
    reconciliation.current_entries,
    ["source_id"],
    "curated_shadow_current_registry_mismatch"
  );
  assertExactRows(
    expectedHistorical.map((item) => ({
      source_id: item.sourceId,
      logical_source_id: historicalLogicalSourceId(item),
      action: item.action,
      reason: item.reason
    })),
    reconciliation.historical_decisions,
    ["source_id", "logical_source_id", "action", "reason"],
    "curated_shadow_historical_decisions_mismatch"
  );
  assertExactRows(
    expectedPromotions.map((item) => ({
      source_id: item.sourceId,
      logical_source_id: item.logicalSourceId,
      section_id: item.sectionId,
      rank: item.rank,
      action: item.action,
      reason: item.reason
    })),
    reconciliation.promotion_proposals,
    ["source_id", "logical_source_id", "section_id", "rank", "action", "reason"],
    "curated_shadow_promotion_proposals_mismatch"
  );
  assertExactRows(
    logicalSourceDefinitions(expectedPromotions, expectedHistorical).map((contract) => ({ logical_source_id: contract.id })),
    reconciliation.logical_sources,
    ["logical_source_id"],
    "curated_shadow_logical_sources_mismatch"
  );
  const currentById = new Map(reconciliation.current_entries.map((entry) => [entry.source_id, entry]));
  const promotionBySourceId = new Map(expectedPromotions.map((item) => [item.sourceId, item]));
  for (const source of registry.sources) {
    const entry = currentById.get(source.id);
    assertExactStringSet(
      uniqueStrings([
        ...logicalSourceIdsForRegisteredSource(source),
        ...expectedPromotions.filter((item) => item.sourceId === source.id).map((item) => item.logicalSourceId),
        ...historicalLogicalIdsForRegisteredSource(source, expectedHistorical)
      ]),
      entry?.logical_source_ids,
      "curated_shadow_current_lineage_mismatch",
      { source_id: source.id }
    );
    const proposal = promotionBySourceId.get(source.id);
    const expectedDecision = proposal ? promotionDecision(proposal.action) : "active";
    const expectedReason = proposal?.reason || "Present in the validated current source registry.";
    if (entry?.decision !== expectedDecision || entry?.decision_reason !== expectedReason) {
      throw new PublisherError("curated_shadow_current_decision_mismatch", "Current source decision does not match its canonical owner.", {
        source_id: source.id
      });
    }
  }
  const logicalById = new Map(reconciliation.logical_sources.map((source) => [source.logical_source_id, source]));
  const aliasOwners = new Map(reconciliation.logical_sources.map((source) => [source.logical_source_id, source.logical_source_id]));
  for (const logical of reconciliation.logical_sources) {
    for (const alias of logical.aliases || []) {
      const existingOwner = aliasOwners.get(alias);
      if (existingOwner && existingOwner !== logical.logical_source_id) {
        throw new PublisherError("curated_shadow_logical_alias_owner_conflict", "One source alias cannot belong to multiple logical sources.", {
          alias,
          logical_source_ids: [existingOwner, logical.logical_source_id].sort()
        });
      }
      aliasOwners.set(alias, logical.logical_source_id);
    }
  }
  for (const contract of logicalSourceDefinitions(expectedPromotions, expectedHistorical)) {
    const logical = logicalById.get(contract.id);
    const expectedEntries = registry.sources
      .filter((source) => currentById.get(source.id)?.logical_source_ids.includes(contract.id))
      .map((source) => source.id);
    assertExactStringSet(expectedEntries, logical?.source_entry_ids, "curated_shadow_logical_entry_mismatch", {
      logical_source_id: contract.id
    });
    assertExactStringSet([
      ...(contract.aliases || []),
      ...expectedHistorical.filter((item) => historicalLogicalSourceId(item) === contract.id).map((item) => item.sourceId)
    ], logical?.aliases, "curated_shadow_logical_alias_mismatch", {
      logical_source_id: contract.id
    });
    assertExactStringSet(contract.required_observation_entries || [], logical?.required_observation_entries, "curated_shadow_required_entry_mismatch", {
      logical_source_id: contract.id
    });
  }
  for (const item of expectedHistorical) {
    const logicalSourceId = historicalLogicalSourceId(item);
    const logical = logicalById.get(logicalSourceId);
    if (!logical?.aliases?.includes(item.sourceId)) {
      throw new PublisherError("curated_shadow_historical_alias_mismatch", "Historical source aliases must resolve to one structured logical source.", {
        source_id: item.sourceId,
        logical_source_id: logicalSourceId
      });
    }
  }

  const lanes = Array.isArray(funnel.lanes) ? funnel.lanes : [];
  for (const lane of lanes) {
    if (lane.stages?.admitted?.status !== "not_run" || lane.stages?.displayed?.status !== "not_run") {
      throw new PublisherError("curated_shadow_public_stage_ran", "Phase 1A shadow cannot admit or display content.", {
        lane_id: lane.lane_id
      });
    }
  }
  const aifyContentLanes = lanes.filter((lane) => lane.lane_id === AIFY_TODAY_LANE_ID);
  const aifyHealthLanes = lanes.filter((lane) => lane.lane_id === AIFY_SITE_WATCH_ID);
  if (aifyContentLanes.length !== 1 || aifyHealthLanes.length !== 1) {
    throw new PublisherError("curated_shadow_aify_lanes_invalid", "Aify content and site-health lanes must each exist exactly once.");
  }
  const lineage = inspectCuratedShadowLineage(raw, funnel);
  if (lineage.missing_aify_ids.length > 0 || lineage.extra_aify_ids.length > 0) {
    throw new PublisherError("curated_shadow_aify_lineage_invalid", "Aify parsed items must map exactly to persisted raw observations.");
  }
  if (
    lineage.aify_snapshot_mismatch_ids.length > 0 ||
    lineage.aify_selection_date_mismatch_ids.length > 0 ||
    lineage.aify_payload_sequence_mismatch_ids.length > 0
  ) {
    throw new PublisherError("curated_shadow_aify_receipt_mismatch", "Aify raw observations must match the collector snapshot and selection date.", {
      snapshot_mismatch_ids: lineage.aify_snapshot_mismatch_ids,
      selection_date_mismatch_ids: lineage.aify_selection_date_mismatch_ids,
      payload_sequence_mismatch_ids: lineage.aify_payload_sequence_mismatch_ids
    });
  }
  if (!lineage.valid) {
    throw new PublisherError("curated_shadow_raw_lineage_incomplete", "Every persisted raw observation must close at least one parsed funnel lane.", {
      missing_raw_ids: lineage.missing_raw_ids,
      unknown_raw_ids: lineage.unknown_raw_ids,
      misbound_raw_ids: lineage.misbound_raw_ids,
      collector_mismatch_ids: lineage.collector_mismatch_ids
    });
  }
  return { valid: true };
}

export async function loadCuratedShadowCanonicalOwners(options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const sourcesPath = await assertOwnedPath(
    rootDir,
    options.sourcesPath || "config/sources",
    "curated_shadow_sources_outside_repository"
  );
  const promotionReviewPath = await assertOwnedPath(
    rootDir,
    options.promotionReviewPath || "docs/source-order-tuning-review.md",
    "curated_shadow_review_outside_repository"
  );
  const recoveryLedgerPath = await assertOwnedPath(
    rootDir,
    options.recoveryLedgerPath || "tasks/project-recovery-ledger.md",
    "curated_shadow_ledger_outside_repository"
  );
  const [registry, promotionReview, recoveryLedger] = await Promise.all([
    validateSourceRegistryPath({ rootDir, sourcesPath }),
    fs.readFile(promotionReviewPath, "utf8"),
    fs.readFile(recoveryLedgerPath, "utf8")
  ]);
  return {
    registry,
    historicalDecisions: parseHistoricalSourceDecisions(recoveryLedger),
    promotionProposals: parseSourcePromotionReview(promotionReview),
    sourcesAnchor: toRepoAnchor(rootDir, sourcesPath)
  };
}

export function inspectCuratedShadowLineage(rawObservations, sourceFunnel) {
  const observations = Array.isArray(rawObservations?.observations) ? rawObservations.observations : [];
  const lanes = Array.isArray(sourceFunnel?.lanes) ? sourceFunnel.lanes : [];
  const rawById = new Map(observations.map((item) => [item.id, item]));
  const parsedLanes = lanes.filter((lane) => lane.lane_id !== AIFY_SITE_WATCH_ID);
  const parsedRawIds = new Set(parsedLanes.flatMap((lane) => lane.stages?.parsed?.item_ids || []));
  const missingRawIds = observations.map((item) => item.id).filter((id) => !parsedRawIds.has(id));
  const unknownRawIds = [...parsedRawIds].filter((id) => !rawById.has(id));
  const misboundRawIds = observations
    .filter((item) => !parsedLanes.some((lane) => (
      (lane.stages?.parsed?.item_ids || []).includes(item.id) &&
      (lane.source_entry_ids || []).includes(item.source_id)
    )))
    .map((item) => item.id);
  const collectorMismatchIds = observations
    .filter((item) => item.collector?.id !== item.source_id)
    .map((item) => item.id);
  const rawAifyIds = new Set(observations
    .filter((item) => item.source_id === AIFY_TODAY_LANE_ID)
    .map((item) => item.id));
  const aifyContentLanes = lanes.filter((lane) => lane.lane_id === AIFY_TODAY_LANE_ID);
  const parsedAifyIds = new Set(aifyContentLanes[0]?.stages?.parsed?.item_ids || []);
  const missingAifyIds = [...rawAifyIds].filter((id) => !parsedAifyIds.has(id));
  const extraAifyIds = [...parsedAifyIds].filter((id) => !rawAifyIds.has(id));
  const aifyCollectorReceipt = aifyContentLanes[0]?.collector_receipt || {};
  const aifySnapshotMismatchIds = observations
    .filter((item) => item.source_id === AIFY_TODAY_LANE_ID)
    .filter((item) => item.upstream?.upstream_snapshot_hash !== aifyCollectorReceipt.upstream_snapshot_hash)
    .map((item) => item.id);
  const aifySelectionDateMismatchIds = observations
    .filter((item) => item.source_id === AIFY_TODAY_LANE_ID)
    .filter((item) => item.upstream?.upstream_selection_date !== aifyCollectorReceipt.upstream_selection_date)
    .map((item) => item.id);
  const aifyPayloadSequenceMismatchIds = aifyPayloadSequenceHash(
    observations
      .filter((item) => item.source_id === AIFY_TODAY_LANE_ID)
      .map((item) => item.upstream)
  ) === aifyCollectorReceipt.upstream_payload_sequence_hash
    ? []
    : [...rawAifyIds];
  return {
    valid: missingRawIds.length === 0 &&
      unknownRawIds.length === 0 &&
      misboundRawIds.length === 0 &&
      collectorMismatchIds.length === 0 &&
      missingAifyIds.length === 0 &&
      extraAifyIds.length === 0 &&
      aifySnapshotMismatchIds.length === 0 &&
      aifySelectionDateMismatchIds.length === 0 &&
      aifyPayloadSequenceMismatchIds.length === 0,
    missing_raw_ids: missingRawIds,
    unknown_raw_ids: unknownRawIds,
    misbound_raw_ids: misboundRawIds,
    collector_mismatch_ids: collectorMismatchIds,
    missing_aify_ids: missingAifyIds,
    extra_aify_ids: extraAifyIds,
    aify_snapshot_mismatch_ids: aifySnapshotMismatchIds,
    aify_selection_date_mismatch_ids: aifySelectionDateMismatchIds,
    aify_payload_sequence_mismatch_ids: aifyPayloadSequenceMismatchIds
  };
}

function validateAifyCollectorReceipt(aifyResult) {
  const content = aifyResult?.content_lane || {};
  const health = aifyResult?.site_health || {};
  const items = Array.isArray(content.items) ? content.items : null;
  const rejections = Array.isArray(content.rejected_items) ? content.rejected_items : null;
  const countFields = [
    ["input_count", content.input_count],
    ["item_count", content.item_count],
    ["rejection_count", content.rejection_count],
    ["fetched_count", content.fetched_count],
    ["parsed_count", content.parsed_count],
    ["site_fetched_count", health.fetched_count],
    ["site_parsed_count", health.parsed_count]
  ];
  const invalidCountFields = countFields
    .filter(([, value]) => !Number.isInteger(value) || value < 0)
    .map(([name]) => name);
  const positions = [];
  let positionsValid = Boolean(items && rejections);
  for (const item of items || []) {
    const itemPositions = item?.upstream_positions;
    if (
      !Array.isArray(itemPositions) ||
      itemPositions.length === 0 ||
      !itemPositions.every((position) => Number.isInteger(position) && position > 0) ||
      item.upstream_position !== itemPositions[0]
    ) {
      positionsValid = false;
      continue;
    }
    positions.push(...itemPositions);
  }
  for (const rejection of rejections || []) {
    if (!Number.isInteger(rejection?.upstream_position) || rejection.upstream_position <= 0) {
      positionsValid = false;
      continue;
    }
    positions.push(rejection.upstream_position);
  }
  const expectedPositions = Array.from({ length: Number(content.input_count || 0) }, (_, index) => index + 1);
  const actualPositions = [...positions].sort((left, right) => left - right);
  const countConserved = Boolean(items && rejections) &&
    content.item_count === items.length &&
    content.rejection_count === rejections.length &&
    content.parsed_count === items.length &&
    actualPositions.length === expectedPositions.length &&
    actualPositions.every((position, index) => position === expectedPositions[index]);
  if (invalidCountFields.length > 0 || !positionsValid || !countConserved) {
    throw new PublisherError(
      "curated_shadow_aify_receipt_invalid",
      "Aify collector receipt counts and upstream positions must conserve the declared input.",
      {
        invalid_count_fields: invalidCountFields,
        declared_input_count: content.input_count,
        declared_item_count: content.item_count,
        declared_rejection_count: content.rejection_count,
        actual_item_count: items?.length ?? null,
        actual_rejection_count: rejections?.length ?? null
      }
    );
  }
}

function buildRawObservations({ occurrenceStore, candidates, sources, aifyResult }) {
  const candidatesByOccurrenceId = new Map();
  for (const candidate of candidates) {
    const sourceId = normalizeIdentity(candidate?.source_id, "source");
    const observationId = normalizeIdentity(candidate?.observation_id, "obs");
    if (!sourceId || !observationId) continue;
    const id = occurrenceId(occurrenceStore.report_date, sourceId, observationId);
    const group = candidatesByOccurrenceId.get(id) || { candidates: [], sourceId };
    group.candidates.push(candidate);
    candidatesByOccurrenceId.set(id, group);
  }
  const sourceById = new Map(sources.map((source) => [String(source?.id || ""), source]));
  const upstreamByObservationId = new Map((aifyResult?.content_lane?.items || []).map((item) => [
    aifyObservationId(item),
    item
  ]));
  const observations = occurrenceStore.occurrences.map((occurrence) => {
    const matched = candidatesByOccurrenceId.get(occurrence.id) || {};
    const matchedCandidates = matched.candidates || [];
    const representativeCandidate = deterministicCandidate(matchedCandidates);
    const sourceId = matched.sourceId || "unknown-source";
    const source = sourceById.get(sourceId) || {};
    const upstream = sourceId === AIFY_TODAY_LANE_ID
      ? upstreamByObservationId.get(occurrence.observation_id)
      : null;
    const material = upstream
      ? { url: upstream.url, accessState: "direct" }
      : deterministicMaterialProjection(matchedCandidates, occurrence);
    const materialUrlHash = rawMaterialUrlHash(material.url);
    const title = upstream?.title ?? occurrence.title;
    const excerptProjection = rawExcerptProjection({
      upstream,
      candidates: matchedCandidates,
      occurrence
    });
    const excerpt = excerptProjection.excerpt;
    const eventDate = upstream?.date ?? occurrence.event_date;
    const hasExplicitEventDate = candidateHasEventDate(matchedCandidates, eventDate);
    const hasPublishedDate = candidateHasPublishedDate(matchedCandidates, eventDate);
    const eventDateOrigin = upstream
      ? "upstream_editorial"
      : hasExplicitEventDate
        ? "source"
        : hasPublishedDate
          ? "published_at"
          : "report_date_fallback";
    const raw = {
      id: `raw_${occurrence.id.slice(4)}`,
      observation_id: occurrence.observation_id,
      source_id: sourceId,
      raw_record_count: occurrence.raw_record_count,
      material_url: material.url,
      material_url_hash: materialUrlHash,
      title,
      excerpt,
      excerpt_origin: excerptProjection.origin,
      excerpt_hash: excerptProjection.hash,
      publisher_hint: occurrence.publisher_hint,
      collector: {
        id: sourceId,
        name: occurrence.collector.name,
        url: explicitCollectorUrl(matchedCandidates, source),
        source_kind: String(source.source_kind || source.format || representativeCandidate?.category || "unknown")
      },
      author: occurrence.author,
      handle: occurrence.handle,
      event_date: eventDate,
      event_date_origin: eventDateOrigin,
      published_at: occurrence.published_at,
      collected_at: occurrence.collected_at,
      fetch_status: "fetched",
      parse_status: "parsed",
      content_hash: null,
      source_group: occurrence.raw_source_group,
      content_format_hint: String(occurrence.raw_content_kind || representativeCandidate?.category || "other"),
      access_state: material.accessState,
      source_health: String(occurrence.collector?.health || "unknown"),
      content_tags: upstream
        ? upstream.upstream_tags
        : deterministicContentTags(matchedCandidates, occurrence.raw_tags)
    };
    if (upstream) raw.upstream = aifyUpstreamReceipt(upstream);
    raw.content_hash = rawObservationContentHash(raw);
    return raw;
  });
  const rejections = (aifyResult?.content_lane?.rejected_items || []).map((item) => ({
    source_id: AIFY_TODAY_LANE_ID,
    upstream_position: item.upstream_position,
    reason: safeFailureCode(item.reason),
    upstream_payload_hash: item.upstream_payload_hash
  }));
  const representedInputCount = observations.reduce((sum, item) => sum + (
    item.source_id === AIFY_TODAY_LANE_ID
      ? Number(item.upstream?.upstream_positions?.length || 0)
      : Number(item.raw_record_count || 0)
  ), 0);
  return {
    schema_version: 1,
    kind: "raw_observations",
    report_date: occurrenceStore.report_date,
    generated_at: occurrenceStore.generated_at,
    input_record_count: representedInputCount + occurrenceStore.normalization_error_count + rejections.length,
    observation_count: observations.length,
    normalization_error_count: occurrenceStore.normalization_error_count,
    normalization_errors: occurrenceStore.normalization_errors.map((item) => ({
      index: item.index,
      reason: item.code
    })),
    rejection_count: rejections.length,
    rejections,
    observations
  };
}

function candidateHasEventDate(candidates, eventDate) {
  return candidates.some((candidate) => [candidate?.event_date, candidate?.date].some((value) => {
    const text = String(value || "").slice(0, 10);
    return isValidDateString(text) && text === eventDate;
  }));
}

function rawExcerptProjection({ upstream, candidates, occurrence }) {
  if (upstream) {
    const excerpt = String(upstream.summary || "");
    return { excerpt, origin: "upstream_editorial", hash: sha256(excerpt) };
  }
  const originalText = normalizeShortExcerpt(occurrence?.original_text);
  if (originalText) return excerptProjection(originalText, "source_original_text");
  const explicit = deterministicSourceSynopsis(candidates);
  if (explicit) return excerptProjection(explicit.synopsis, explicit.origin);
  const legacyCopy = normalizeShortExcerpt(occurrence?.summary);
  if (legacyCopy) return excerptProjection(legacyCopy, "legacy_candidate_copy");
  return { excerpt: null, origin: "none", hash: null };
}

function excerptProjection(value, origin) {
  const excerpt = normalizeShortExcerpt(value);
  return excerpt
    ? { excerpt, origin, hash: sha256(excerpt) }
    : { excerpt: null, origin: "none", hash: null };
}

function candidateHasPublishedDate(candidates, eventDate) {
  return candidates.some((candidate) => {
    const value = String(candidate?.published_at || "");
    return isValidDateTimeString(value) && value.slice(0, 10) === eventDate;
  });
}

function explicitCollectorUrl(candidates, source) {
  const candidateUrls = candidates
    .flatMap((candidate) => [candidate?.source_url, candidate?.collector?.url])
    .map(sanitizePublicHttpUrl)
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
  for (const value of [...candidateUrls, source?.url]) {
    const safe = sanitizePublicHttpUrl(value);
    if (safe) return safe;
  }
  return null;
}

function deterministicMaterialProjection(candidates, occurrence) {
  const accessOrder = new Map([
    ["direct", 0],
    ["indirect", 1],
    ["unknown", 2]
  ]);
  const projections = candidates
    .map(candidateMaterialProjection)
    .filter(Boolean)
    .sort((left, right) => (
      (accessOrder.get(left.accessState) ?? 3) - (accessOrder.get(right.accessState) ?? 3) ||
      canonicalPublicUrlIdentity(left.url).localeCompare(canonicalPublicUrlIdentity(right.url)) ||
      left.url.localeCompare(right.url)
    ));
  if (projections[0]) return projections[0];
  return {
    url: sanitizePublicHttpUrl(occurrence?.url),
    accessState: ["direct", "indirect", "unknown"].includes(occurrence?.access_state)
      ? occurrence.access_state
      : "unknown"
  };
}

function candidateMaterialProjection(candidate) {
  for (const field of ["primary_url", "original_url"]) {
    const url = sanitizePublicHttpUrl(candidate?.[field]);
    if (url) return { url, accessState: "direct" };
  }
  const materialUrl = sanitizePublicHttpUrl(candidate?.url);
  const intermediaryUrl = sanitizePublicHttpUrl(candidate?.intermediary_url);
  if (materialUrl) {
    return {
      url: materialUrl,
      accessState: candidate?.access_state === "indirect" || (
        intermediaryUrl && canonicalPublicUrlIdentity(materialUrl) === canonicalPublicUrlIdentity(intermediaryUrl)
      ) ? "indirect" : "direct"
    };
  }
  return intermediaryUrl ? { url: intermediaryUrl, accessState: "indirect" } : null;
}

function deterministicContentTags(candidates, fallback = []) {
  const tags = candidates
    .flatMap((candidate) => [
      ...(Array.isArray(candidate?.content_tags) ? candidate.content_tags : []),
      ...(Array.isArray(candidate?.tags) ? candidate.tags : [])
    ])
    .map(normalizeShortExcerpt)
    .map((value) => value.length <= 100 ? value : `${value.slice(0, 99).trimEnd()}…`)
    .filter(Boolean);
  const values = tags.length > 0 ? tags : (Array.isArray(fallback) ? fallback : []);
  return [...new Set(values)].sort((left, right) => left.localeCompare(right)).slice(0, 32);
}

function deterministicCandidate(candidates) {
  return [...candidates].sort((left, right) => stableJson(left).localeCompare(stableJson(right)))[0] || null;
}

function deterministicSourceSynopsis(candidates) {
  const originPriority = new Map([
    ["source_feed", 0],
    ["structured_source", 1],
    ["source_metadata", 2]
  ]);
  const values = candidates.flatMap((candidate) => {
    const origin = String(candidate?.source_synopsis_origin || "");
    const synopsis = normalizeShortExcerpt(candidate?.source_synopsis);
    return synopsis && originPriority.has(origin) ? [{ origin, synopsis }] : [];
  });
  values.sort((left, right) => (
    originPriority.get(left.origin) - originPriority.get(right.origin) ||
    right.synopsis.length - left.synopsis.length ||
    left.synopsis.localeCompare(right.synopsis)
  ));
  return values[0] || null;
}

function normalizeShortExcerpt(value) {
  const text = String(value || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  return text.length <= 360 ? text : `${text.slice(0, 359).trimEnd()}…`;
}

export function buildCuratedSourceAssetReconciliation({ registry, sources, auditRows, rawObservations, historicalDecisions, promotionProposals, sourcesPath }) {
  const proposalBySourceId = new Map(promotionProposals.map((item) => [item.sourceId, item]));
  const currentEntries = registry.sources.map((source) => {
    const logicalIds = uniqueStrings([
      ...logicalSourceIdsForRegisteredSource(source),
      ...promotionProposals.filter((item) => item.sourceId === source.id).map((item) => item.logicalSourceId),
      ...historicalLogicalIdsForRegisteredSource(source, historicalDecisions)
    ]);
    const audits = auditRows.get(source.id) || [];
    const states = sourceRuntimeStates(audits, rawObservations.observations.filter((item) => item.source_id === source.id));
    const proposal = proposalBySourceId.get(source.id);
    return {
      source_id: source.id,
      name: String(source.name || source.id),
      source_kind: String(source.source_kind || "unknown"),
      source_group: String(source.source_group || "other"),
      logical_source_ids: logicalIds,
      config_state: sourceConfigState(source),
      transport_state: states.transport,
      content_state: states.content,
      decision: proposal ? promotionDecision(proposal.action) : "active",
      decision_reason: proposal?.reason || "Present in the validated current source registry.",
      evidence_origin: uniqueStrings([
        "current_source_registry",
        ...(audits.length > 0 ? ["daily_runtime_source_audit"] : []),
        ...(proposal ? ["rec_316_promotion_review"] : [])
      ]),
      roles: uniqueStrings(logicalIds
        .map((id) => CORE_SOURCE_CONTRACTS.find((contract) => contract.id === id)?.role)
        .filter(Boolean)
        .concat(logicalIds.length === 0 ? ["collection_entry"] : [])),
      owner_pr: OWNER_PR,
      anchors: uniqueStrings([
        toRepoStyle(sourcesPath),
        ...(proposal ? ["docs/source-order-tuning-review.md"] : [])
      ])
    };
  });
  const logicalSources = logicalSourceDefinitions(promotionProposals, historicalDecisions).map((contract) => {
    const entries = currentEntries.filter((entry) => entry.logical_source_ids.includes(contract.id));
    const runtimeEntries = (Array.isArray(sources) ? sources : []).filter((source) => (
      entries.some((entry) => entry.source_id === source.id) ||
      logicalSourceIdsForRegisteredSource(source).includes(contract.id)
    ));
    const runtimeIds = new Set(runtimeEntries.map((entry) => entry.id));
    const audits = [...runtimeIds].flatMap((id) => auditRows.get(id) || []);
    const observations = rawObservations.observations.filter((item) => runtimeIds.has(item.source_id));
    const proposal = promotionProposals.find((item) => item.logicalSourceId === contract.id);
    const historicalRows = historicalDecisions.filter((item) => historicalLogicalSourceId(item) === contract.id);
    const transportRuntime = audits.length > 0
      ? aggregateRuntimeStates(audits.map((audit) => normalizeAuditState(audit.status)))
      : observations.length > 0
        ? "success_with_items"
        : "not_run";
    const explicitParseRuntime = aggregateRuntimeStates(audits
      .map((audit) => normalizeAuditState(audit.parse_status))
      .filter((status) => status !== "not_run"));
    const parsedRuntime = observations.length > 0
      ? "success_with_items"
      : explicitParseRuntime !== "not_run"
        ? explicitParseRuntime
        : parsedEmptyStatus(transportRuntime);
    const runtimeEvidence = audits.length > 0 || observations.length > 0;
    return {
      logical_source_id: contract.id,
      name: contract.name,
      aliases: uniqueStrings([
        ...(contract.aliases || []),
        ...historicalRows.map((item) => item.sourceId)
      ]),
      source_entry_ids: entries.map((entry) => entry.source_id),
      required_observation_entries: uniqueStrings(contract.required_observation_entries || []),
      current_config_state: logicalConfigState(entries, runtimeEntries, proposal, historicalRows),
      transport_state: logicalTransportState(transportRuntime, runtimeEvidence),
      content_state: logicalContentState({
        logicalSourceId: contract.id,
        generatedAt: rawObservations.generated_at,
        parsedStatus: parsedRuntime,
        parsedCount: observations.length,
        runtimeEvidence
      }),
      decision: logicalDecision(entries, runtimeEntries, proposal, historicalRows),
      decision_reason: proposal?.reason || historicalRows.map((item) => item.reason).join("; ") || (entries.length > 0
        ? "Validated registry entries retain their current collection role pending later cutover phases."
        : runtimeEvidence
          ? "Runtime evidence exists without an active registry owner; repair and reconcile in shadow before cutover."
          : "No current registry or runtime evidence proves this logical source is active."),
      evidence_origin: uniqueStrings([
        ...(USER_EXPLICIT_LOGICAL_SOURCES.has(contract.id) ? ["user_explicit"] : []),
        ...(entries.length > 0 ? ["registry"] : []),
        ...((proposal || historicalRows.length > 0) ? ["historical_ref"] : []),
        ...(runtimeEvidence ? ["runtime_artifact"] : []),
        ...((entries.length === 0 && !proposal && !runtimeEvidence) ? ["external_reference"] : [])
      ]),
      roles: logicalRoles(contract),
      owner_pr: OWNER_PR,
      anchors: uniqueStrings([
        "src/source-effectiveness.js",
        "config/source-display-contract.json",
        ...(proposal ? ["docs/source-order-tuning-review.md"] : []),
        ...(historicalRows.length > 0 ? ["tasks/project-recovery-ledger.md"] : [])
      ])
    };
  });
  return {
    current_entries: currentEntries,
    historical_decisions: historicalDecisions.map((item) => ({
      source_id: item.sourceId,
      logical_source_id: historicalLogicalSourceId(item),
      action: item.action,
      reason: item.reason,
      evidence_origin: ["rec_315_historical_source_review"],
      anchors: ["tasks/project-recovery-ledger.md"]
    })),
    promotion_proposals: promotionProposals.map((item) => ({
      source_id: item.sourceId,
      logical_source_id: item.logicalSourceId,
      section_id: item.sectionId,
      rank: item.rank,
      action: item.action,
      reason: item.reason,
      evidence_origin: ["rec_316_promotion_review"],
      anchors: ["docs/source-order-tuning-review.md"]
    })),
    promotion_action_counts: countPromotionActions(promotionProposals),
    logical_sources: logicalSources
  };
}

function logicalSourceDefinitions(promotionProposals, historicalDecisions = []) {
  const definitions = new Map(CORE_SOURCE_CONTRACTS.map((contract) => [contract.id, contract]));
  for (const proposal of promotionProposals) {
    if (!definitions.has(proposal.logicalSourceId)) {
      definitions.set(proposal.logicalSourceId, {
        id: proposal.logicalSourceId,
        name: proposal.logicalSourceId,
        role: "collection_entry",
        aliases: [proposal.sourceId]
      });
    }
  }
  for (const item of historicalDecisions) {
    const logicalSourceId = historicalLogicalSourceId(item);
    if (!definitions.has(logicalSourceId)) {
      definitions.set(logicalSourceId, {
        id: logicalSourceId,
        name: logicalSourceId,
        role: "collection_entry",
        aliases: []
      });
    }
  }
  return [...definitions.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function historicalLogicalSourceId(item) {
  return HISTORICAL_REPLACEMENTS.get(item.sourceId)?.logicalSourceId || item.sourceId;
}

function historicalLogicalIdsForRegisteredSource(source, historicalDecisions) {
  const ids = [];
  for (const item of historicalDecisions) {
    const replacement = HISTORICAL_REPLACEMENTS.get(item.sourceId);
    if (!replacement) continue;
    if (
      replacement.sourceEntryIds?.includes(source.id) ||
      (replacement.sourceEntryPrefix && source.id.startsWith(replacement.sourceEntryPrefix))
    ) {
      ids.push(replacement.logicalSourceId);
    }
  }
  return uniqueStrings(ids);
}

function logicalConfigState(entries, runtimeEntries, proposal, historicalRows = []) {
  if (entries.length > 0) return proposal?.action === "retire" ? "collection-only" : "active";
  if (runtimeEntries.length > 0) return "shadow-only";
  if (proposal?.action === "retire" || historicalRows.some((item) => item.action === "retire")) return "retired";
  return "absent";
}

function logicalTransportState(runtimeState, hasRuntimeEvidence) {
  if (!hasRuntimeEvidence) return "unknown";
  if (runtimeState === "success_with_items") return "fetched";
  if (runtimeState === "healthy_empty") return "healthy-empty";
  if (runtimeState === "blocked") return "blocked";
  if (runtimeState === "failed") return "failed";
  return hasRuntimeEvidence ? "not-run" : "unknown";
}

function logicalContentState({ logicalSourceId, generatedAt, parsedStatus, parsedCount, runtimeEvidence }) {
  const receipt = (stageName) => `source-funnel:${logicalSourceId}:${stageName}`;
  return {
    parsed: {
      status: runtimeEvidence ? parsedStatus : "unknown",
      count: parsedCount,
      observed_at: runtimeEvidence ? generatedAt : null,
      receipt: runtimeEvidence ? receipt("parsed") : null
    },
    admitted: {
      status: "not_run",
      count: 0,
      observed_at: generatedAt,
      receipt: receipt("admitted")
    },
    displayed: {
      status: "not_run",
      count: 0,
      observed_at: generatedAt,
      receipt: receipt("displayed")
    }
  };
}

function logicalDecision(entries, runtimeEntries, proposal, historicalRows = []) {
  if (proposal?.action === "promoted") return entries.length > 0 ? "keep-active" : "cutover-add";
  if (proposal?.action === "defer") return "repair-in-shadow";
  if (proposal?.action === "retire") return "retire";
  if (historicalRows.some((item) => item.action === "retire")) return "retire";
  if (historicalRows.some((item) => ["defer", "investigate"].includes(item.action))) return "repair-in-shadow";
  if (historicalRows.some((item) => item.action === "replace")) {
    return entries.length > 0 ? "keep-active" : "repair-in-shadow";
  }
  if (entries.length > 0) return "keep-active";
  if (runtimeEntries.length > 0) return "repair-in-shadow";
  return "unknown";
}

function logicalRoles(contract) {
  if (contract.id === "aify-news") return ["editorial_source", "collector", "site_watch"];
  if (["news_aggregator", "builder_aggregator", "open_source_aggregator"].includes(contract.role)) {
    return ["editorial_source", "collector"];
  }
  if ([
    "official",
    "official_platform",
    "official_company_news",
    "china_model_official",
    "media",
    "chinese_media",
    "builder_analysis",
    "research_context"
  ].includes(contract.role)) {
    return ["publisher", "collector"];
  }
  return ["collector"];
}

function buildFunnelLanes({ sources, auditRows, rawObservations, aifyResult }) {
  const observationsBySourceId = groupBy(rawObservations.observations, (item) => item.source_id);
  const logicalLanes = CORE_SOURCE_CONTRACTS.map((contract) => {
    const entries = sources.filter((source) => logicalSourceIdsForRegisteredSource(source).includes(contract.id));
    return buildRegistryLane({
      laneId: contract.id,
      logicalSourceId: contract.id,
      entries,
      auditRows,
      observationsBySourceId,
      priority: PRIORITY_LOGICAL_SOURCES.has(contract.id)
    });
  });
  const collectionLanes = sources
    .map((source) => buildRegistryLane({
      laneId: `collection:${source.id}`,
      logicalSourceId: source.id,
      entries: [source],
      auditRows,
      observationsBySourceId,
      priority: false
    }));
  return [
    ...logicalLanes,
    ...collectionLanes,
    buildAifyContentLane(aifyResult, observationsBySourceId.get(AIFY_TODAY_LANE_ID) || []),
    buildAifyHealthLane(aifyResult)
  ];
}

function buildRegistryLane({ laneId, logicalSourceId, entries, auditRows, observationsBySourceId, priority }) {
  const sourceIds = entries.map((source) => source.id);
  const audits = sourceIds.flatMap((id) => auditRows.get(id) || []);
  const observations = sourceIds.flatMap((id) => observationsBySourceId.get(id) || []);
  const registered = stage("source_entry", sourceIds.length > 0 ? "success_with_items" : "not_run", sourceIds);
  const fetchEvidence = audits.filter((audit) => normalizeAuditState(audit.status) !== "not_run");
  const auditFetchStates = fetchEvidence.map((audit) => normalizeAuditState(audit.status));
  const auditFetchStatus = aggregateRuntimeStates(auditFetchStates);
  const fetchStatus = aggregateRuntimeStates([
    ...auditFetchStates,
    ...(observations.length > 0 ? ["success_with_items"] : [])
  ]);
  const inferredFetchIds = observations.length > 0 && auditFetchStatus !== "success_with_items"
    ? observations.map((item) => `fetch:${item.id}`)
    : [];
  const fetched = stage(
    "fetch_attempt",
    fetchStatus,
    [
      ...fetchEvidence.map((audit, index) => `fetch:${String(audit.id || audit.name || laneId)}:${index + 1}`),
      ...inferredFetchIds
    ],
    failureReasonForStatus(fetchStatus)
  );
  const explicitParseStatus = aggregateRuntimeStates(audits
    .map((audit) => normalizeAuditState(audit.parse_status))
    .filter((status) => status !== "not_run"));
  const parsedStatus = observations.length > 0
    ? "success_with_items"
    : explicitParseStatus !== "not_run"
      ? explicitParseStatus
      : parsedEmptyStatus(fetchStatus);
  const parsed = stage(
    "observation",
    parsedStatus,
    observations.map((item) => item.id),
    failureReasonForStatus(parsedStatus)
  );
  return lane({ laneId, logicalSourceId, sourceIds, priority, registered, fetched, parsed });
}

function buildAifyContentLane(aifyResult, observations) {
  const content = aifyResult?.content_lane || {};
  const status = normalizeReceiptStatus(content.status);
  const fetchedStatus = Number(content.fetched_count || 0) > 0 ? "success_with_items" : status;
  return lane({
    laneId: AIFY_TODAY_LANE_ID,
    logicalSourceId: "aify-news",
    sourceIds: [AIFY_TODAY_LANE_ID],
    priority: true,
    registered: stage("source_entry", "success_with_items", [AIFY_TODAY_LANE_ID]),
    fetched: stage(
      "fetch_attempt",
      fetchedStatus,
      Number(content.fetched_count || 0) > 0 ? [`fetch:${AIFY_TODAY_LANE_ID}:1`] : [],
      failureReasonForReceipt(content, fetchedStatus)
    ),
    parsed: stage(
      "observation",
      status,
      observations.map((item) => item.id),
      failureReasonForReceipt(content, status)
    ),
    collectorReceipt: {
      receipt_kind: "aify_today_picks",
      source_url_hash: sha256(String(aifyResult?.source_url || content.source_url || "https://aify-news.pages.dev/")),
      response_url_hash: sha256(String(content.response_url || "")),
      http_status: Number(content.http_status || 0),
      response_bytes: Number(content.response_bytes || 0),
      redirect_count: Number(content.redirect_count || 0),
      fetched_count: Number(content.fetched_count || 0),
      parsed_count: Number(content.parsed_count || 0),
      upstream_snapshot_hash: String(content.upstream_snapshot_hash || ""),
      upstream_selection_date: String(content.upstream_selection_date || ""),
      upstream_payload_sequence_hash: aifyPayloadSequenceHash(content.items),
      input_count: Number(content.input_count || 0),
      represented_input_count: (content.items || []).reduce((sum, item) => sum + Number(item?.upstream_positions?.length || 0), 0),
      item_count: Number(content.item_count || 0),
      rejection_count: Number(content.rejection_count || 0),
      cache_fallback_used: false
    }
  });
}

function buildAifyHealthLane(aifyResult) {
  const health = aifyResult?.site_health || {};
  const status = normalizeReceiptStatus(health.status);
  const fetchedCount = Number(health.fetched_count || 0);
  const parsedCount = Number(health.parsed_count || 0);
  const fetchedStatus = fetchedCount > 0 ? "success_with_items" : status;
  const parsedStatus = parsedCount > 0 ? "success_with_items" : status;
  return lane({
    laneId: AIFY_SITE_WATCH_ID,
    logicalSourceId: "aify-news",
    sourceIds: [AIFY_SITE_WATCH_ID],
    priority: true,
    registered: stage("source_entry", "success_with_items", [AIFY_SITE_WATCH_ID]),
    fetched: stage(
      "fetch_attempt",
      fetchedStatus,
      fetchedCount > 0 ? [`fetch:${AIFY_SITE_WATCH_ID}:1`] : [],
      failureReasonForReceipt(health, fetchedStatus)
    ),
    parsed: stage(
      "observation",
      parsedStatus,
      parsedCount > 0 ? [`health:${AIFY_SITE_WATCH_ID}`] : [],
      failureReasonForReceipt(health, parsedStatus)
    ),
    collectorReceipt: {
      receipt_kind: "aify_site_health",
      source_url_hash: sha256(String(aifyResult?.source_url || "https://aify-news.pages.dev/")),
      response_url_hash: sha256(String(health.response_url || "")),
      http_status: Number(health.http_status || 0),
      response_bytes: Number(health.response_bytes || 0),
      redirect_count: Number(health.redirect_count || 0),
      fetched_count: fetchedCount,
      parsed_count: parsedCount
    }
  });
}

function lane({ laneId, logicalSourceId, sourceIds, priority, registered, fetched, parsed, collectorReceipt }) {
  return {
    lane_id: laneId,
    logical_source_id: logicalSourceId,
    source_entry_ids: uniqueStrings(sourceIds),
    priority: Boolean(priority),
    terminal_status: parsed.status,
    failure_reason: parsed.failure_reason,
    ...(collectorReceipt ? { collector_receipt: collectorReceipt } : {}),
    stages: {
      registered,
      fetched,
      parsed,
      admitted: stage("signal", "not_run", []),
      displayed: stage("edition_item", "not_run", [])
    }
  };
}

function stage(unit, status, itemIds, failureReason = "") {
  const ids = uniqueStrings(itemIds);
  return {
    status,
    unit,
    count: ids.length,
    item_ids: ids,
    failure_reason: status === "not_run" || ["success_with_items", "healthy_empty"].includes(status)
      ? ""
      : safeFailureCode(failureReason || `stage_${status}`)
  };
}

function createAifyCandidates(aifyResult, generatedAt) {
  return (aifyResult?.content_lane?.items || []).map((item) => ({
    id: aifyObservationId(item),
    observation_id: aifyObservationId(item),
    source_id: AIFY_TODAY_LANE_ID,
    category: "hot_blog",
    title: item.title,
    url: item.url,
    description: item.summary,
    source: item.source,
    source_url: aifyResult.source_url,
    publisher: item.source,
    event_date: item.date,
    collected_at: generatedAt,
    source_group: "news_newsletters",
    content_tags: item.upstream_tags
  }));
}

function createAifyOccurrenceSource(aifyResult) {
  return {
    id: AIFY_TODAY_LANE_ID,
    name: "Aify Today Picks",
    url: aifyResult?.source_url || "https://aify-news.pages.dev/",
    source_kind: "aify_today_html",
    category: "news_aggregator",
    source_group: "news_newsletters",
    status: aifyResult?.content_lane?.status === "success_with_items" ? "checked" : "blocked"
  };
}

function createCandidateOccurrenceSources(candidates) {
  return uniqueSourcesById((Array.isArray(candidates) ? candidates : []).map((candidate) => {
    const id = normalizeIdentity(candidate?.source_id, "source");
    return {
      id,
      name: String(candidate?.source || candidate?.publisher || candidate?.collector?.name || id || "Runtime source"),
      url: String(candidate?.source_url || candidate?.collector?.url || ""),
      source_kind: String(candidate?.source_kind || candidate?.category || "runtime_discovery"),
      category: String(candidate?.category || "runtime_discovery"),
      source_group: String(candidate?.source_group || "other")
    };
  }));
}

function addAuditOnlySources(payloads, sources) {
  const rows = [...sources];
  for (const audit of allAuditSources(payloads)) {
    const explicitId = normalizeIdentity(audit?.id, "source");
    if (explicitId) {
      if (!rows.some((source) => source.id === explicitId)) rows.push(runtimeSourceFromAudit(audit, explicitId));
      continue;
    }
    if (rows.some((source) => sourceIdentityMatchesAudit(source, audit))) continue;
    rows.push(runtimeSourceFromAudit(audit, `audit-${digest(`${audit?.name || ""}|${audit?.url || ""}`)}`));
  }
  return uniqueSourcesById(rows);
}

function runtimeSourceFromAudit(audit, id) {
  return {
    id,
    name: String(audit?.name || id),
    url: String(audit?.url || ""),
    source_kind: "runtime_audit",
    category: "runtime_audit",
    source_group: "other"
  };
}

function aifyUpstreamReceipt(item) {
  return {
    title: item.title,
    summary: item.summary,
    url: item.url,
    date: item.date,
    upstream_selection_date: item.upstream_selection_date,
    upstream_position: item.upstream_position,
    upstream_positions: item.upstream_positions,
    upstream_payload_hash: item.upstream_payload_hash,
    upstream_snapshot_hash: item.upstream_snapshot_hash,
    upstream_tags: item.upstream_tags,
    source: item.source,
    ...(item.quality_score == null ? {} : { quality_score: item.quality_score }),
    flavors: item.flavors,
    domain: item.domain,
    channels_l1: item.channels_l1,
    channels_l2: item.channels_l2,
    companies: item.companies,
    products: item.products
  };
}

function aifyObservationId(item) {
  return `aify-today-${String(item?.upstream_payload_hash || sha256(stableJson(item))).replace(/^sha256:/, "").slice(0, 24)}`;
}

function collectAuditRows(payloads, sources, preferredSourceIds = new Set()) {
  const rows = new Map();
  for (const source of allAuditSources(payloads)) {
    const explicitId = normalizeIdentity(source?.id, "source");
    let ids = explicitId ? [explicitId] : sources
      .filter((candidate) => sourceIdentityMatchesAudit(candidate, source))
      .map((candidate) => candidate.id);
    const preferred = ids.filter((id) => preferredSourceIds.has(id));
    if (preferred.length > 0) ids = preferred;
    if (ids.length === 0) ids = [`audit-${digest(`${source?.name || ""}|${source?.url || ""}`)}`];
    for (const id of uniqueStrings(ids)) {
      const bucket = rows.get(id) || [];
      bucket.push({ ...source, id });
      rows.set(id, bucket);
    }
  }
  return rows;
}

function addAifyAuditRow(rows, aifyResult) {
  const content = aifyResult?.content_lane || {};
  const bucket = rows.get(AIFY_TODAY_LANE_ID) || [];
  bucket.push({
    id: AIFY_TODAY_LANE_ID,
    name: "Aify Today Picks",
    status: Number(content.fetched_count || 0) > 0 ? "checked" : content.status,
    parse_status: content.status,
    parsed_count: Number(content.parsed_count || 0)
  });
  rows.set(AIFY_TODAY_LANE_ID, bucket);
}

function allAuditSources(payloads) {
  return (Array.isArray(payloads) ? payloads : []).flatMap((payload) =>
    Object.values(payload?.source_audit || {}).flatMap((group) =>
      Array.isArray(group?.sources) ? group.sources : []));
}

function sourceIdentityMatchesAudit(source, audit) {
  const sourceUrl = canonicalPublicUrlIdentity(source?.url);
  const auditUrl = canonicalPublicUrlIdentity(audit?.url);
  if (sourceUrl && auditUrl) return sourceUrl === auditUrl;
  const sourceName = String(source?.name || "").trim().toLowerCase();
  const auditName = String(audit?.name || "").trim().toLowerCase();
  return Boolean(sourceName && auditName && sourceName === auditName);
}

function sourceRuntimeStates(audits, observations) {
  const transport = audits.length > 0
    ? aggregateRuntimeStates(audits.map((audit) => normalizeAuditState(audit.status)))
    : observations.length > 0
      ? "success_with_items"
      : "not_run";
  const explicitParse = aggregateRuntimeStates(audits
    .map((audit) => normalizeAuditState(audit.parse_status))
    .filter((status) => status !== "not_run"));
  const content = observations.length > 0
    ? "success_with_items"
    : explicitParse !== "not_run"
      ? explicitParse
      : parsedEmptyStatus(transport);
  return { transport, content };
}

function normalizeAuditState(value) {
  const status = String(value || "").toLowerCase();
  if (SUCCESS_STATUSES.has(status)) return "success_with_items";
  if (HEALTHY_EMPTY_STATUSES.has(status)) return "healthy_empty";
  if (BLOCKED_STATUSES.has(status)) return "blocked";
  if (FAILED_STATUSES.has(status)) return "failed";
  return "not_run";
}

function normalizeReceiptStatus(value) {
  const status = String(value || "");
  return ["success_with_items", "healthy_empty", "blocked", "failed", "not_run"].includes(status)
    ? status
    : "failed";
}

function parsedEmptyStatus(fetchStatus) {
  if (["success_with_items", "healthy_empty"].includes(fetchStatus)) return "healthy_empty";
  return fetchStatus;
}

function aggregateRuntimeStates(states) {
  const normalized = states.filter(Boolean);
  if (normalized.includes("success_with_items")) return "success_with_items";
  if (normalized.includes("healthy_empty")) return "healthy_empty";
  if (normalized.includes("blocked")) return "blocked";
  if (normalized.includes("failed")) return "failed";
  return "not_run";
}

function aggregateConfigStates(states) {
  if (states.includes("configured")) return "configured";
  if (states.includes("manual")) return "manual";
  if (states.includes("configuration_needed")) return "configuration_needed";
  return "placeholder";
}

function sourceConfigState(source) {
  if (source?.source_kind === "manual") return "manual";
  if (source?.url_env || source?.base_url_env || source?.required_env) return "configuration_needed";
  if (source?.url) return "configured";
  return "placeholder";
}

function promotionDecision(action) {
  if (action === "promoted") return "active";
  return ["defer", "retire"].includes(action) ? action : "observe";
}

function countPromotionActions(proposals) {
  const counts = { promoted: 0, defer: 0, retire: 0 };
  for (const proposal of proposals) counts[proposal.action] += 1;
  return counts;
}

function failureReasonForStatus(status) {
  if (status === "blocked") return "source_blocked";
  if (status === "failed") return "source_failed";
  return "";
}

function failureReasonForReceipt(receipt, status) {
  if (["success_with_items", "healthy_empty", "not_run"].includes(status)) return "";
  return safeFailureCode(receipt?.failure_reason || `source_${status}`);
}

function safeFailureCode(value) {
  const code = String(value || "source_failed").toLowerCase().replace(/[^a-z0-9._:-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 120);
  return code || "source_failed";
}

function assertExactRows(expected, actual, keys, code) {
  const expectedKeys = expected.map((row) => stableJson(selectKeys(row, keys))).sort();
  const actualKeys = (Array.isArray(actual) ? actual : []).map((row) => stableJson(selectKeys(row, keys))).sort();
  if (stableJson(expectedKeys) !== stableJson(actualKeys)) {
    throw new PublisherError(code, "Curated source reconciliation does not match its authoritative repository owner.", {
      expected_count: expectedKeys.length,
      actual_count: actualKeys.length
    });
  }
}

function assertExactStringSet(expected, actual, code, details = {}) {
  const expectedValues = uniqueStrings(expected).sort();
  const actualValues = uniqueStrings(actual).sort();
  if (stableJson(expectedValues) !== stableJson(actualValues)) {
    throw new PublisherError(code, "Curated source lineage does not match its authoritative repository owner.", details);
  }
}

function selectKeys(row, keys) {
  return Object.fromEntries(keys.map((key) => [key, row?.[key]]));
}

function uniqueSourcesById(sources) {
  const rows = new Map();
  for (const source of sources) {
    const id = String(source?.id || "").trim();
    if (id && !rows.has(id)) rows.set(id, source);
  }
  return [...rows.values()];
}

function groupBy(values, keyFor) {
  const groups = new Map();
  for (const value of values) {
    const key = keyFor(value);
    const group = groups.get(key) || [];
    group.push(value);
    groups.set(key, group);
  }
  return groups;
}

function countBy(values) {
  const counts = {};
  for (const value of values) counts[value] = Number(counts[value] || 0) + 1;
  return counts;
}

function normalizeInputPaths(value) {
  const values = Array.isArray(value) ? value : [value];
  return values.flatMap((item) => String(item || "").split(",")).map((item) => item.trim()).filter(Boolean);
}

function normalizeIdentity(value, prefix) {
  const text = typeof value === "string" || typeof value === "number" || typeof value === "bigint"
    ? String(value).trim()
    : "";
  if (!text) return "";
  return text.length <= 500 && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(text)
    ? text
    : `${prefix}_${digest(text)}`;
}

function occurrenceId(reportDate, sourceId, observationId) {
  return `occ_${digest([reportDate, sourceId, observationId].join("|"))}`;
}

function digest(value) {
  return createHash("sha256").update(String(value)).digest("hex").slice(0, 24);
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

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => String(value || "").trim()).filter(Boolean))];
}

export async function assertOwnedPath(rootDir, candidate, code) {
  const resolvedRoot = path.resolve(rootDir);
  const resolved = path.resolve(resolvedRoot, candidate);
  const relative = path.relative(resolvedRoot, resolved);
  if (relative && (relative.startsWith("..") || path.isAbsolute(relative))) {
    throw new PublisherError(code, "Curated source shadow path must stay inside the repository.", { path: String(candidate) });
  }
  const segments = relative ? relative.split(path.sep).filter(Boolean) : [];
  let current = resolvedRoot;
  for (const segment of ["", ...segments]) {
    if (segment) current = path.join(current, segment);
    let stats;
    try {
      stats = await fs.lstat(current);
    } catch (error) {
      if (error?.code === "ENOENT") break;
      throw error;
    }
    if (stats.isSymbolicLink()) {
      throw new PublisherError(code, "Curated source shadow paths cannot traverse symbolic links or junctions.", {
        path: String(candidate)
      });
    }
  }
  let existing = resolved;
  while (existing !== resolvedRoot) {
    try {
      await fs.access(existing);
      break;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      existing = path.dirname(existing);
    }
  }
  const [realRoot, realExisting] = await Promise.all([fs.realpath(resolvedRoot), fs.realpath(existing)]);
  const realRelative = path.relative(realRoot, realExisting);
  if (realRelative && (realRelative.startsWith("..") || path.isAbsolute(realRelative))) {
    throw new PublisherError(code, "Curated source shadow path resolves outside the repository.", { path: String(candidate) });
  }
  return resolved;
}

function toRepoAnchor(rootDir, absolutePath) {
  return toRepoStyle(path.relative(rootDir, absolutePath));
}

function toRepoStyle(value) {
  return String(value || "").split(path.sep).join("/");
}

export async function writeJsonPairAtomic(entries, fileSystem = fs) {
  const prepared = [];
  let pairFinalized = false;
  try {
    for (const [target, value] of entries) {
      await fileSystem.mkdir(path.dirname(target), { recursive: true });
      const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
      const backup = `${target}.${process.pid}.${randomUUID()}.backup`;
      let existed = true;
      try {
        await fileSystem.access(target);
      } catch (error) {
        if (error?.code === "ENOENT") existed = false;
        else throw error;
      }
      prepared.push({ target, temporary, backup, existed, backedUp: false, finalized: false });
      await fileSystem.writeFile(temporary, encodeJsonArtifact(value, target));
    }
    for (const item of prepared) {
      if (!item.existed) continue;
      await fileSystem.rename(item.target, item.backup);
      item.backedUp = true;
    }
    for (const item of prepared) {
      await fileSystem.rename(item.temporary, item.target);
      item.finalized = true;
    }
    pairFinalized = true;
    for (const item of prepared) {
      if (item.backedUp) {
        await fileSystem.rm(item.backup, { force: true });
        item.backedUp = false;
      }
    }
  } catch (error) {
    if (pairFinalized) throw error;
    const rollbackErrors = [];
    for (const item of [...prepared].reverse()) {
      if (item.finalized) {
        try {
          await fileSystem.rm(item.target, { force: true });
        } catch (rollbackError) {
          rollbackErrors.push({ target: path.basename(item.target), step: "remove_new", code: rollbackError?.code || "error" });
        }
      }
      if (item.backedUp) {
        try {
          await fileSystem.rename(item.backup, item.target);
          item.backedUp = false;
        } catch (rollbackError) {
          rollbackErrors.push({ target: path.basename(item.target), step: "restore_backup", code: rollbackError?.code || "error" });
        }
      }
    }
    if (rollbackErrors.length === 0) {
      for (const item of prepared) {
        try {
          await fileSystem.rm(item.temporary, { force: true });
        } catch (rollbackError) {
          rollbackErrors.push({ target: path.basename(item.target), step: "remove_temporary", code: rollbackError?.code || "error" });
        }
      }
    }
    if (rollbackErrors.length > 0) {
      throw new PublisherError(
        "curated_shadow_pair_rollback_failed",
        "Curated shadow pair write failed and rollback could not restore every target; recovery artifacts were retained so the legacy publisher can ignore this failed shadow transaction.",
        {
          cause_code: error?.code || "write_failed",
          rollback_errors: rollbackErrors
        }
      );
    }
    throw error;
  }
}
