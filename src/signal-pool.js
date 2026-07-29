import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import path from "node:path";

import { readJsonArtifact } from "./compressed-json.js";
import {
  assertOwnedPath,
  loadCuratedShadowCanonicalOwners,
  validateCuratedShadowArtifacts,
  writeJsonPairAtomic
} from "./curated-source-shadow.js";
import { PublisherError } from "./errors.js";
import { resolveLinkIcon } from "./link-icons.js";
import { findRepoSafeReceiptPrivacyFindings } from "./privacy.js";
import { canonicalPublicUrlIdentity, sanitizePublicHttpUrl } from "./public-url.js";
import {
  REPORTS_DATA_PUBLIC_SIGNAL_POOL_DIR,
  REPORTS_DATA_SIGNALS_DIR,
  publicSignalPoolRelativePath,
  rawObservationsRelativePath,
  signalPoolRelativePath,
  sourceFunnelRelativePath
} from "./reports-data-layout.js";
import {
  buildSignalAdmissionBatch,
  buildPreAdmissionReceipts,
  cleanupExpiredSignalAdmissionTemp,
  loadSignalAdmissionContract,
  sourceRoleForObservation
} from "./signal-admission.js";
import { buildSignalSummary } from "./signal-summary.js";
import {
  validatePublicSignalPool,
  validateRawObservations,
  validateSignalPool,
  validateSignalQuarantine,
  validateSourceFunnel
} from "./schema.js";
import { isValidDateString, isValidDateTimeString } from "./time.js";

export async function runSignalPoolShadow(options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const reportDate = String(options.reportDate || "").trim();
  const generatedAt = String(options.generatedAt || "").trim();
  if (!isValidDateString(reportDate)) {
    throw new PublisherError("signal_pool_date_invalid", "Signal pool shadow requires a valid report date.");
  }
  if (!isValidDateTimeString(generatedAt)) {
    throw new PublisherError("signal_pool_generated_at_invalid", "Signal pool shadow requires a valid generated_at timestamp.");
  }
  const inputDir = await assertOwnedPath(rootDir, options.inputDir || "reports-data", "signal_pool_input_path_unsafe");
  const outputDir = await assertOwnedPath(rootDir, options.outputDir || "reports-data", "signal_pool_output_path_unsafe");
  const rawPath = await assertOwnedPath(rootDir, path.join(inputDir, rawObservationsRelativePath(reportDate)), "signal_pool_input_path_unsafe");
  const funnelPath = await assertOwnedPath(rootDir, path.join(inputDir, sourceFunnelRelativePath(reportDate)), "signal_pool_input_path_unsafe");
  const signalPath = await assertOwnedPath(rootDir, path.join(outputDir, signalPoolRelativePath(reportDate)), "signal_pool_output_path_unsafe");
  const publicPath = await assertOwnedPath(rootDir, path.join(outputDir, publicSignalPoolRelativePath(reportDate)), "signal_pool_output_path_unsafe");
  const quarantinePath = await assertOwnedPath(
    rootDir,
    path.join(".tmp", "ai-daily", "quarantine", `${reportDate}.json`),
    "signal_pool_temp_path_unsafe"
  );
  const materialRunPath = await assertOwnedPath(
    rootDir,
    path.join(".tmp", "ai-daily", "materials", reportDate),
    "signal_pool_temp_path_unsafe"
  );

  await cleanupExpiredSignalAdmissionTemp({
    rootDir,
    now: generatedAt,
    retentionHours: options.retentionHours || 24
  });
  const existingSignals = options.existingSignals ?? await loadPriorSignalState({
    rootDir,
    reportDate,
    inputDir: outputDir
  });
  let primaryError = null;
  try {
    const rawPayload = await readJson(rawPath, "signal_pool_raw_missing_or_invalid");
    const funnelPayload = await readJson(funnelPath, "signal_pool_funnel_missing_or_invalid");
    const rawValidation = validateRawObservations(rawPayload);
    const funnelValidation = validateSourceFunnel(funnelPayload);
    if (
      !rawValidation.valid ||
      !funnelValidation.valid ||
      rawValidation.value.report_date !== reportDate ||
      funnelValidation.value.report_date !== reportDate ||
      rawValidation.value.generated_at !== generatedAt ||
      funnelValidation.value.generated_at !== generatedAt
    ) {
      throw new PublisherError("signal_pool_input_pair_invalid", "Signal pool shadow requires one valid same-generation Phase 1A pair.", {
        raw_errors: rawValidation.errors,
        funnel_errors: funnelValidation.errors
      });
    }
    const canonicalOwners = await loadCuratedShadowCanonicalOwners({ rootDir });
    validateCuratedShadowArtifacts({
      rawObservations: rawValidation.value,
      sourceFunnel: funnelValidation.value,
      ...canonicalOwners
    });

    const artifacts = await buildSignalPoolArtifacts({
      ...options,
      rootDir,
      reportDate,
      generatedAt,
      rawObservations: rawValidation.value,
      sourceFunnel: funnelValidation.value,
      existingSignals
    });
    await fs.mkdir(path.dirname(quarantinePath), { recursive: true });
    await fs.writeFile(quarantinePath, `${JSON.stringify(artifacts.quarantine, null, 2)}\n`, "utf8");
    await writeJsonPairAtomic([
      [signalPath, artifacts.signalPool],
      [publicPath, artifacts.publicSignalPool]
    ], options.fileSystem || fs);
    return {
      ok: true,
      degraded: false,
      degraded_reason: "",
      report_date: reportDate,
      signal_pool_path: signalPath,
      public_signal_pool_path: publicPath,
      signal_count: artifacts.signalPool.signal_count,
      public_ready_count: artifacts.publicSignalPool.item_count,
      rejected_count: artifacts.signalPool.disposition_counts.rejected,
      needs_review_count: artifacts.signalPool.disposition_counts.needs_review
    };
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    const cleanupFileSystem = options.cleanupFileSystem || fs;
    const cleanup = await Promise.allSettled([
      cleanupFileSystem.rm(quarantinePath, { force: true }),
      cleanupFileSystem.rm(materialRunPath, { recursive: true, force: true })
    ]);
    const failures = cleanup.filter((item) => item.status === "rejected");
    if (failures.length > 0) {
      throw new PublisherError("signal_pool_temp_cleanup_failed", "Signal pool shadow could not remove all owned temporary artifacts.", {
        failure_count: failures.length,
        primary_error_code: primaryError?.code || null
      });
    }
  }
}

export async function loadPriorSignalState(options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const reportDate = String(options.reportDate || "").trim();
  if (!isValidDateString(reportDate)) {
    throw new PublisherError("signal_pool_history_date_invalid", "Signal pool history requires a valid report date.");
  }
  const inputDir = await assertOwnedPath(rootDir, options.inputDir || "reports-data", "signal_pool_history_path_unsafe");
  const [files, publicFiles] = await Promise.all([
    listHistoricalPoolFiles(rootDir, inputDir, REPORTS_DATA_SIGNALS_DIR, reportDate),
    listHistoricalPoolFiles(rootDir, inputDir, REPORTS_DATA_PUBLIC_SIGNAL_POOL_DIR, reportDate)
  ]);
  const publicByDate = new Map(publicFiles.map((item) => [item.reportDate, item.filePath]));
  const signalDates = new Set(files.map((item) => item.reportDate));
  const publicDates = new Set(publicFiles.map((item) => item.reportDate));
  if (!sameStringSet(signalDates, publicDates)) {
    throw new PublisherError("signal_pool_history_invalid", "Historical signal pools require an exact internal/public companion set.", {
      missing_public_dates: [...signalDates].filter((date) => !publicDates.has(date)).sort(),
      missing_internal_dates: [...publicDates].filter((date) => !signalDates.has(date)).sort()
    });
  }
  const pools = [];
  for (const item of files) {
    const publicPath = publicByDate.get(item.reportDate);
    const [payload, publicPayload] = await Promise.all([
      readJson(item.filePath, "signal_pool_history_invalid"),
      readJson(publicPath, "signal_pool_history_invalid")
    ]);
    const validation = validateSignalPool(payload);
    const publicValidation = validatePublicSignalPool(publicPayload);
    if (
      !validation.valid ||
      !publicValidation.valid ||
      validation.value.report_date !== item.reportDate ||
      publicValidation.value.report_date !== item.reportDate ||
      validation.value.generated_at !== publicValidation.value.generated_at ||
      publicValidation.value.source_pool_hash !== computeSignalPoolHash(validation.value) ||
      !isDeepStrictEqual(
        publicValidation.value.items,
        validation.value.signals.filter((signal) => signal.summary_status === "ready").map(publicReadyProjection)
      )
    ) {
      throw new PublisherError("signal_pool_history_invalid", "Historical signal pool failed schema or path-date validation.", {
        path: path.relative(rootDir, item.filePath).replaceAll("\\", "/"),
        public_path: path.relative(rootDir, publicPath).replaceAll("\\", "/"),
        errors: [...validation.errors, ...publicValidation.errors]
      });
    }
    pools.push(validation.value);
  }
  pools.sort((left, right) => right.report_date.localeCompare(left.report_date));
  const existing = new Map();
  for (const pool of pools) {
    for (const signal of pool.signals) {
      const previous = existing.get(signal.canonical_url);
      const observationContentHashes = uniqueStrings([
        ...(previous?.observation_content_hashes || []),
        signal.content_hash,
        ...signal.observation_content_hashes
      ]);
      if (!previous) {
        existing.set(signal.canonical_url, {
          content_hash: signal.content_hash,
          observation_content_hashes: observationContentHashes,
          report_date: pool.report_date
        });
      } else {
        previous.observation_content_hashes = observationContentHashes;
      }
    }
  }
  return existing;
}

async function listHistoricalPoolFiles(rootDir, inputDir, relativeRoot, reportDate) {
  const poolRoot = await assertOwnedPath(rootDir, path.join(inputDir, relativeRoot), "signal_pool_history_path_unsafe");
  const files = [];
  let years;
  try {
    years = await fs.readdir(poolRoot, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return files;
    throw error;
  }
  for (const year of years.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!year.isDirectory() || !/^\d{4}$/.test(year.name)) continue;
    const yearPath = await assertOwnedPath(rootDir, path.join(poolRoot, year.name), "signal_pool_history_path_unsafe");
    const months = await fs.readdir(yearPath, { withFileTypes: true });
    for (const month of months.sort((left, right) => left.name.localeCompare(right.name))) {
      if (!month.isDirectory() || !/^\d{2}$/.test(month.name)) continue;
      const monthPath = await assertOwnedPath(rootDir, path.join(yearPath, month.name), "signal_pool_history_path_unsafe");
      const entries = await fs.readdir(monthPath, { withFileTypes: true });
      for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
        const match = /^(\d{4}-\d{2}-\d{2})\.json(?:\.gz)?$/.exec(entry.name);
        if (!entry.isFile() || !match || match[1] >= reportDate) continue;
        if (`${year.name}-${month.name}` !== match[1].slice(0, 7)) {
          throw new PublisherError("signal_pool_history_invalid", "Historical signal pool path must match its filename date.", {
            path: path.relative(rootDir, path.join(monthPath, entry.name)).replaceAll("\\", "/")
          });
        }
        files.push({
          reportDate: match[1],
          filePath: await assertOwnedPath(rootDir, path.join(monthPath, entry.name), "signal_pool_history_path_unsafe")
        });
      }
    }
  }
  return files;
}

export async function buildSignalPoolArtifacts(options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const rawValidation = validateRawObservations(options.rawObservations || {});
  const funnelValidation = validateSourceFunnel(options.sourceFunnel || {});
  if (!rawValidation.valid || !funnelValidation.valid) {
    throw new PublisherError("signal_pool_input_pair_invalid", "Signal pool artifact builder requires valid Phase 1A inputs.", {
      raw_errors: rawValidation.errors,
      funnel_errors: funnelValidation.errors
    });
  }
  const raw = rawValidation.value;
  const funnel = funnelValidation.value;
  const reportDate = String(options.reportDate || raw.report_date || "");
  const generatedAt = String(options.generatedAt || raw.generated_at || "");
  if (
    raw.report_date !== reportDate ||
    funnel.report_date !== reportDate ||
    raw.generated_at !== generatedAt ||
    funnel.generated_at !== generatedAt
  ) {
    throw new PublisherError("signal_pool_input_pair_invalid", "Signal pool inputs must share the requested date and generation.");
  }
  const contract = options.contract || await loadSignalAdmissionContract({
    rootDir,
    contractPath: options.contractPath
  });
  const derived = deriveSignalPoolArtifacts({
    ...options,
    rawObservations: raw,
    sourceFunnel: funnel,
    contract,
    reportDate,
    generatedAt
  });
  const validated = validateSignalPoolArtifacts({
    ...derived,
    rootDir,
    rawObservations: raw,
    sourceFunnel: funnel,
    contract,
    existingSignals: options.existingSignals,
    skipRecompute: true
  });
  return {
    signalPool: validated.signalPool,
    publicSignalPool: validated.publicSignalPool,
    quarantine: validated.quarantine
  };
}

function deriveSignalPoolArtifacts(options = {}) {
  const raw = options.rawObservations;
  const funnel = options.sourceFunnel;
  const contract = options.contract;
  const reportDate = options.reportDate;
  const generatedAt = options.generatedAt;
  const batch = buildSignalAdmissionBatch(raw, {
    ...options,
    contract,
    reportDate,
    generatedAt
  });
  const quarantineValidation = validateSignalQuarantine(batch.quarantine);
  if (!quarantineValidation.valid) {
    throw new PublisherError("signal_quarantine_schema_validation_failed", "Signal admission quarantine failed validation.", {
      errors: quarantineValidation.errors
    });
  }

  const admittedByCanonical = groupBy(batch.admitted, (item) => item.canonicalUrl);
  const signals = [];
  const summaryReceipts = [];
  for (const [canonicalUrl, entries] of [...admittedByCanonical.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const built = buildAdmittedSignal(canonicalUrl, entries, {
      contract,
      summaryProposals: options.summaryProposals
    });
    signals.push(built.signal);
    summaryReceipts.push(built.summaryReceipt);
  }
  signals.sort((left, right) => left.signal_id.localeCompare(right.signal_id));
  summaryReceipts.sort((left, right) => left.signal_id.localeCompare(right.signal_id));
  const admissionReceipts = [...batch.admissionReceipts].sort((left, right) => left.receipt_id.localeCompare(right.receipt_id));
  const signalPool = {
    schema_version: 1,
    kind: "signal_pool_shadow",
    pipeline_phase: "phase_1b_shadow",
    report_date: reportDate,
    generated_at: generatedAt,
    source_raw_generated_at: raw.generated_at,
    source_funnel_generated_at: funnel.generated_at,
    admission_contract_version: contract.version,
    input_record_count: raw.input_record_count,
    input_observation_count: raw.observation_count,
    pre_admission_counts: {
      normalization_errors: raw.normalization_error_count,
      parser_rejections: raw.rejection_count
    },
    disposition_counts: countByEnum(admissionReceipts, "disposition", ["admitted", "rejected", "needs_review"]),
    disposition_input_counts: sumByDisposition(admissionReceipts),
    signal_count: signals.length,
    summary_counts: countByEnum(signals, "summary_status", ["ready", "pending", "failed"]),
    pre_admission_receipts: buildPreAdmissionReceipts(raw, { contract }),
    admission_receipts: admissionReceipts,
    summary_receipts: summaryReceipts,
    signals
  };
  const publicItems = signals.filter((item) => item.summary_status === "ready").map(publicReadyProjection);
  const publicSignalPool = {
    schema_version: 1,
    kind: "public_signal_pool_shadow",
    pipeline_phase: "phase_1b_shadow",
    report_date: reportDate,
    generated_at: generatedAt,
    source_pool_hash: computeSignalPoolHash(signalPool),
    item_count: publicItems.length,
    items: publicItems
  };
  return {
    signalPool,
    publicSignalPool,
    quarantine: quarantineValidation.value,
    batch
  };
}

export function validateSignalPoolArtifacts(options = {}) {
  const signalValidation = validateSignalPool(options.signalPool || {});
  const publicValidation = validatePublicSignalPool(options.publicSignalPool || {});
  const hasQuarantine = Object.hasOwn(options, "quarantine");
  const quarantineValidation = hasQuarantine
    ? validateSignalQuarantine(options.quarantine || {})
    : { valid: true, value: null, errors: [] };
  if (!signalValidation.valid || !publicValidation.valid || !quarantineValidation.valid) {
    throw new PublisherError("signal_pool_schema_validation_failed", "Signal pool shadow artifacts failed schema validation.", {
      signal_errors: signalValidation.errors,
      public_errors: publicValidation.errors,
      quarantine_errors: quarantineValidation.errors
    });
  }
  const signalPool = signalValidation.value;
  const publicSignalPool = publicValidation.value;
  const raw = options.rawObservations || {};
  const funnel = options.sourceFunnel || {};
  if (
    !options.contract ||
    signalPool.admission_contract_version !== options.contract.version ||
    signalPool.report_date !== raw.report_date ||
    signalPool.report_date !== funnel.report_date ||
    signalPool.generated_at !== raw.generated_at ||
    signalPool.generated_at !== funnel.generated_at ||
    signalPool.source_raw_generated_at !== raw.generated_at ||
    signalPool.source_funnel_generated_at !== funnel.generated_at ||
    publicSignalPool.report_date !== signalPool.report_date ||
    publicSignalPool.generated_at !== signalPool.generated_at
  ) {
    throw new PublisherError("signal_pool_lineage_mismatch", "Signal pool artifacts must match the Phase 1A date and generation.");
  }
  const receiptObservationIds = new Set(signalPool.admission_receipts.map((item) => item.raw_observation_id));
  const rawObservationIds = new Set((raw.observations || []).map((item) => item.id));
  if (!sameStringSet(receiptObservationIds, rawObservationIds)) {
    throw new PublisherError("signal_pool_lineage_mismatch", "Every raw observation must have exactly one admission disposition.");
  }
  const representedInputs = signalPool.admission_receipts.reduce((sum, item) => sum + item.represented_input_count, 0);
  if (
    representedInputs + raw.normalization_error_count + raw.rejection_count !== raw.input_record_count ||
    signalPool.input_observation_count !== raw.observation_count
  ) {
    throw new PublisherError("signal_pool_input_conservation_failed", "Raw inputs must be conserved across pre-admission and admission dispositions.");
  }
  const expectedPublic = signalPool.signals.filter((item) => item.summary_status === "ready").map(publicReadyProjection);
  if (
    !isDeepStrictEqual(publicSignalPool.items, expectedPublic) ||
    publicSignalPool.source_pool_hash !== computeSignalPoolHash(signalPool)
  ) {
    throw new PublisherError("signal_pool_public_projection_mismatch", "Public-ready shadow must be the exact safe projection of ready pool members.");
  }
  const summaryBySignal = new Map(signalPool.summary_receipts.map((item) => [item.signal_id, item]));
  for (const signal of signalPool.signals) {
    const receipt = summaryBySignal.get(signal.signal_id);
    if (!receipt || receipt.status !== signal.summary_status || receipt.origin !== signal.summary_origin) {
      throw new PublisherError("signal_pool_summary_lineage_mismatch", "Every signal summary state must match its copy receipt.", {
        signal_id: signal.signal_id
      });
    }
    if (signal.review_policy === "aify_today_passthrough_v1") {
      if (
        signal.summary_status !== "ready" ||
        signal.summary_origin !== "upstream_editorial" ||
        signal.editorial_ready !== true ||
        receipt.claim_spans.length !== 0 ||
        Object.values(receipt.semantic_calls).some((count) => count !== 0)
      ) {
        throw new PublisherError("signal_pool_aify_passthrough_invalid", "Aify passthrough must stay byte-preserving and skip all secondary semantic work.");
      }
    } else if (signal.summary_status === "ready" && (
      receipt.claim_spans.length === 0 ||
      !["passed", "passed_exact_span"].includes(receipt.semantic_verifier.status)
    )) {
      throw new PublisherError("signal_pool_grounding_receipt_invalid", "Ordinary ready summaries require hash-bound source spans and verifier evidence.");
    }
  }
  const privacyFindings = [
    ...findRepoSafeReceiptPrivacyFindings(signalPool, { rootDir: options.rootDir, relativeFile: signalPoolRelativePath(signalPool.report_date) }),
    ...findRepoSafeReceiptPrivacyFindings(publicSignalPool, { rootDir: options.rootDir, relativeFile: publicSignalPoolRelativePath(signalPool.report_date) }),
    ...(hasQuarantine
      ? findRepoSafeReceiptPrivacyFindings(quarantineValidation.value, { rootDir: options.rootDir, relativeFile: ".tmp/ai-daily/quarantine" })
      : [])
  ];
  if (privacyFindings.length > 0) {
    throw new PublisherError("signal_pool_privacy_validation_failed", "Signal pool artifacts failed the repo-safe privacy gate.", {
      finding_patterns: uniqueStrings(privacyFindings.map((item) => item.pattern))
    });
  }
  if (
    !options.skipRecompute &&
    signalPool.signals.some((item) => item.summary_origin === "model_generated") &&
    !options.summaryProposals
  ) {
    throw new PublisherError(
      "signal_pool_model_summary_unverifiable",
      "Persisted model summaries require an independent same-generation proposal and review owner."
    );
  }
  if (!options.skipRecompute) {
    const expected = deriveSignalPoolArtifacts({
      rawObservations: raw,
      sourceFunnel: funnel,
      contract: options.contract,
      reportDate: raw.report_date,
      generatedAt: raw.generated_at,
      existingSignals: options.existingSignals,
      summaryProposals: options.summaryProposals
    });
    if (
      !isDeepStrictEqual(signalPool, expected.signalPool) ||
      !isDeepStrictEqual(publicSignalPool, expected.publicSignalPool) ||
      (hasQuarantine && !isDeepStrictEqual(quarantineValidation.value, expected.quarantine))
    ) {
      throw new PublisherError(
        "signal_pool_derivation_mismatch",
        "Signal pool receipts must be the exact deterministic derivation of raw observations, the admission contract, and verified summary evidence."
      );
    }
  }
  return {
    signalPool,
    publicSignalPool,
    quarantine: quarantineValidation.value
  };
}

function buildAdmittedSignal(canonicalUrl, entries, options) {
  const ordered = [...entries].sort((left, right) => {
    const priority = Number(isTrustedUpstreamEntry(right, options.contract)) -
      Number(isTrustedUpstreamEntry(left, options.contract));
    return priority || left.observation.id.localeCompare(right.observation.id);
  });
  const primaryEntry = ordered[0];
  const primary = primaryEntry.observation;
  const trusted = primary?.source_id === options.contract.trusted_upstream.source_id && primary?.upstream;
  const materialUrl = trusted ? primary.upstream.url : primary.material_url;
  const materialHost = new URL(materialUrl).hostname.toLowerCase().replace(/^www\./, "");
  const publisherName = materialHost === "aify-news.pages.dev"
    ? options.contract.trusted_upstream.editorial_source.name
    : String(trusted ? primary.upstream.source : primary.publisher_hint);
  const icon = resolveLinkIcon(materialUrl, { label: publisherName });
  const summary = buildSignalSummary({
    signalId: primaryEntry.signalId,
    observations: ordered.map((item) => item.observation),
    contract: options.contract,
    summaryProposals: options.summaryProposals
  });
  const upstream = trusted ? primary.upstream : null;
  const signal = {
    signal_id: primaryEntry.signalId,
    canonical_url: canonicalUrl,
    material_url: materialUrl,
    event_cluster_id: null,
    title: trusted ? upstream.title : primary.title,
    publisher: {
      name: publisherName,
      home_url: publisherHomeUrl(materialUrl)
    },
    editorial_source: trusted ? structuredClone(options.contract.trusted_upstream.editorial_source) : null,
    author: primary.author || null,
    handle: primary.handle || null,
    source_role: sourceRoleForObservation(primary),
    collected_via: mergeCollectors(ordered.map((item) => item.observation?.collector)),
    event_date: trusted ? upstream.date : primary.event_date,
    published_at: primary.published_at || null,
    summary_status: summary.status,
    source_summary: summary.source_summary,
    summary_origin: summary.origin,
    summary_failure_code: summary.failure_code,
    topic_path: primaryEntry.classification.topic_path,
    content_format: primaryEntry.classification.content_format,
    access_state: primary.access_state || "unknown",
    source_health: primary.source_health || "unknown",
    source_identity: {
      host: icon.host || materialHost,
      icon_url: icon.icon,
      icon_kind: icon.source || "none",
      fallback: icon.fallback,
      fallback_reason: icon.fallback ? icon.reason : null,
      cache_key: icon.key || materialHost
    },
    observation_refs: uniqueStrings(ordered.map((item) => item.observation.observation_id)),
    admission_receipt_refs: uniqueStrings(ordered.map((item) => item.receipt.receipt_id)),
    content_hash: primary.content_hash,
    observation_content_hashes: uniqueStrings(ordered.map((item) => item.observation.content_hash)),
    editorial_ready: Boolean(trusted),
    review_policy: trusted ? options.contract.trusted_upstream.review_policy : null,
    upstream_selection_date: upstream?.upstream_selection_date || null,
    upstream_position: upstream?.upstream_position || null,
    upstream_positions: upstream ? [...upstream.upstream_positions] : [],
    upstream_tags: upstream ? [...upstream.upstream_tags] : [],
    upstream_payload_hash: upstream?.upstream_payload_hash || null,
    upstream_snapshot_hash: upstream?.upstream_snapshot_hash || null,
    upstream_quality_score: upstream?.quality_score ?? null
  };
  return { signal, summaryReceipt: summary.receipt };
}

function isTrustedUpstreamEntry(entry, contract) {
  return Boolean(
    entry?.observation?.source_id === contract?.trusted_upstream?.source_id &&
    entry?.observation?.upstream
  );
}

function publicReadyProjection(signal) {
  return {
    signal_id: signal.signal_id,
    canonical_url: signal.canonical_url,
    material_url: signal.material_url,
    title: signal.title,
    source_summary: signal.source_summary,
    publisher: structuredClone(signal.publisher),
    editorial_source: structuredClone(signal.editorial_source),
    author: signal.author,
    handle: signal.handle,
    source_role: signal.source_role,
    collected_via: structuredClone(signal.collected_via),
    event_date: signal.event_date,
    published_at: signal.published_at,
    summary_origin: signal.summary_origin,
    topic_path: [...signal.topic_path],
    content_format: signal.content_format,
    access_state: signal.access_state,
    source_health: signal.source_health,
    source_identity: structuredClone(signal.source_identity),
    observation_refs: [...signal.observation_refs],
    editorial_ready: signal.editorial_ready,
    review_policy: signal.review_policy,
    upstream_selection_date: signal.upstream_selection_date,
    upstream_position: signal.upstream_position,
    upstream_positions: [...signal.upstream_positions],
    upstream_tags: [...signal.upstream_tags],
    upstream_payload_hash: signal.upstream_payload_hash,
    upstream_snapshot_hash: signal.upstream_snapshot_hash
  };
}

function mergeCollectors(values) {
  const byId = new Map();
  for (const value of values.filter(Boolean)) {
    const id = String(value.id || "").trim();
    if (!id) continue;
    const candidate = {
      id,
      name: String(value.name || id),
      url: sanitizePublicHttpUrl(value.url) || null,
      source_kind: String(value.source_kind || "unknown")
    };
    const existing = byId.get(id);
    if (!existing || (!existing.url && candidate.url)) byId.set(id, candidate);
  }
  return [...byId.values()].sort((left, right) => [left.id, left.name, left.url || ""].join("|").localeCompare([right.id, right.name, right.url || ""].join("|")));
}

function publisherHomeUrl(value) {
  const url = new URL(value);
  return `${url.protocol}//${url.host}/`;
}

async function readJson(filePath, code) {
  try {
    return await readJsonArtifact(filePath);
  } catch (error) {
    throw new PublisherError(code, "Signal pool input must be readable JSON.", {
      path: filePath,
      cause: error?.message || "read_failed"
    });
  }
}

function groupBy(values, selector) {
  const grouped = new Map();
  for (const value of values) {
    const key = selector(value);
    const bucket = grouped.get(key) || [];
    bucket.push(value);
    grouped.set(key, bucket);
  }
  return grouped;
}

function countByEnum(values, field, keys) {
  const counts = Object.fromEntries(keys.map((key) => [key, 0]));
  for (const value of values) counts[value[field]] += 1;
  return counts;
}

function sumByDisposition(receipts) {
  const counts = { admitted: 0, rejected: 0, needs_review: 0 };
  for (const receipt of receipts) counts[receipt.disposition] += receipt.represented_input_count;
  return counts;
}

function sameStringSet(left, right) {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

function uniqueStrings(values) {
  return [...new Set(values.map((value) => String(value || "")).filter(Boolean))].sort();
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(String(value || "")).digest("hex")}`;
}

export function computeSignalPoolHash(signalPool) {
  return sha256(stableJson(signalPool));
}
