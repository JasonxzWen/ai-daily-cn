import { PublisherError } from "./errors.js";
import {
  MAIN_AUDIT_CONTRACT_VERSION,
  MAIN_REJECT_REASON,
  MAIN_REJECT_REASONS,
  MAIN_SELECTION_STAGE,
  MAIN_SELECTION_STAGES
} from "./main-audit-contract.js";
import { STORY_FIRST_MAX, STORY_FIRST_MIN, STORY_FIRST_TARGET } from "./story-first.js";

const MAIN_SELECTION_STAGE_SET = new Set(MAIN_SELECTION_STAGES);
const MAIN_REJECT_REASON_SET = new Set(MAIN_REJECT_REASONS);
const NON_MAIN_REJECT_REASONS = new Set([
  MAIN_REJECT_REASON.NOT_EVALUATED_SECTION_ITEM,
  MAIN_REJECT_REASON.RETIRED_PLATFORM_LANE
]);

export function hasMainAuditReceipts(candidatePool) {
  return hasOwn(candidatePool, "main_audit_contract_version");
}

export function collectMainAuditConsistencyIssues(report, candidatePool) {
  const candidates = candidatePoolCandidates(candidatePool);
  const poolHasContract = hasMainAuditReceipts(candidatePool);
  const reportHasContract = hasOwn(report?.self_check, "main_audit_contract_version");
  if (!poolHasContract && !reportHasContract) {
    return [];
  }

  const issues = [];
  const poolContractVersion = Number(candidatePool?.main_audit_contract_version);
  const reportContractVersion = Number(report?.self_check?.main_audit_contract_version);
  if (
    !poolHasContract ||
    !reportHasContract ||
    poolContractVersion !== MAIN_AUDIT_CONTRACT_VERSION ||
    reportContractVersion !== MAIN_AUDIT_CONTRACT_VERSION
  ) {
    issues.push(issue(
      "main_audit_contract_version_mismatch",
      "main_audit_contract_version",
      "Candidate pool and report must both declare the supported main audit contract version.",
      {
        expected: MAIN_AUDIT_CONTRACT_VERSION,
        candidate_pool: poolHasContract ? poolContractVersion : null,
        report: reportHasContract ? reportContractVersion : null
      }
    ));
    return issues;
  }
  const evaluated = candidates.filter(isEvaluatedMainCandidate);
  const selectedProjections = candidates.filter(isSelectedMainProjection);

  if (evaluated.length === 0) {
    issues.push(issue("main_audit_receipt_missing", "candidate_pool.candidates", "Main audit receipts exist but no evaluated main candidates were found."));
    return issues;
  }

  for (const candidate of evaluated) {
    const stage = String(candidate?.main_selection_stage || "").trim();
    const reason = String(candidate?.main_reject_reason || "").trim();
    const candidatePath = `candidate_pool.candidates[${candidate.id || "unknown"}]`;
    if (Boolean(stage) === Boolean(reason)) {
      issues.push(issue(
        stage ? "main_audit_disposition_conflict" : "main_audit_disposition_missing",
        candidatePath,
        stage
          ? "Main candidate cannot have both a selection stage and a reject reason."
          : "Evaluated main candidate must have one terminal selection or rejection disposition.",
        { candidate_id: candidate.id || "", main_selection_stage: stage, main_reject_reason: reason }
      ));
    }
    if (stage && !MAIN_SELECTION_STAGE_SET.has(stage)) {
      issues.push(issue("main_audit_stage_unknown", `${candidatePath}.main_selection_stage`, `Unknown main selection stage: ${stage}`, { candidate_id: candidate.id || "" }));
    }
    if (reason && !MAIN_REJECT_REASON_SET.has(reason)) {
      issues.push(issue("main_audit_reject_reason_unknown", `${candidatePath}.main_reject_reason`, `Unknown main reject reason: ${reason}`, { candidate_id: candidate.id || "" }));
    }
    if (!Number.isFinite(Number(candidate?.main_rank_score))) {
      issues.push(issue("main_audit_score_missing", `${candidatePath}.main_rank_score`, "Evaluated main candidate is missing its persisted rank score.", { candidate_id: candidate.id || "" }));
    }
    if ((stage || reason === MAIN_REJECT_REASON.NOT_SELECTED_LOWER_PRIORITY) && !isPositiveInteger(candidate?.main_rank)) {
      issues.push(issue("main_audit_rank_missing", `${candidatePath}.main_rank`, "Eligible main candidate is missing its persisted rank.", { candidate_id: candidate.id || "" }));
    }
  }

  const eligibleRanks = evaluated
    .map((candidate) => candidate.main_rank)
    .filter(isPositiveInteger)
    .sort((left, right) => left - right);
  const expectedRanks = Array.from({ length: eligibleRanks.length }, (_unused, index) => index + 1);
  if (!sameJson(eligibleRanks, expectedRanks)) {
    issues.push(issue("main_audit_rank_sequence_mismatch", "candidate_pool.candidates", "Eligible main candidate ranks must be unique and contiguous.", {
      expected: expectedRanks,
      actual: eligibleRanks
    }));
  }
  const rankedEvaluated = evaluated
    .filter((candidate) => isPositiveInteger(candidate?.main_rank))
    .sort((left, right) => Number(left.main_rank) - Number(right.main_rank));
  for (let index = 1; index < rankedEvaluated.length; index += 1) {
    const previous = rankedEvaluated[index - 1];
    const current = rankedEvaluated[index];
    const previousScore = Number(previous.main_rank_score);
    const currentScore = Number(current.main_rank_score);
    const scoreOrderInvalid = Number.isFinite(previousScore) && Number.isFinite(currentScore) && (
      currentScore > previousScore ||
      (currentScore === previousScore && String(current.id || "").localeCompare(String(previous.id || "")) < 0)
    );
    if (scoreOrderInvalid) {
      issues.push(issue(
        "main_audit_rank_score_mismatch",
        `candidate_pool.candidates[${current.id || "unknown"}].main_rank`,
        "Persisted main ranks must order persisted scores from highest to lowest with candidate ID as the stable tie-breaker.",
        {
          previous: { candidate_id: previous.id || "", rank: Number(previous.main_rank), score: previousScore },
          current: { candidate_id: current.id || "", rank: Number(current.main_rank), score: currentScore }
        }
      ));
    }
  }

  const snapshot = report?.self_check?.selection_snapshot?.main_items;
  if (!snapshot || typeof snapshot !== "object") {
    issues.push(issue("main_audit_snapshot_missing", "self_check.selection_snapshot.main_items", "Main selection snapshot is required when audit receipts are present."));
    return issues;
  }

  const expectedRejectionCounts = rejectionCountsFor(evaluated);
  const actualRejectionCounts = normalizeCounts(snapshot.rejection_counts);
  if (!sameJson(actualRejectionCounts, expectedRejectionCounts)) {
    issues.push(issue("main_audit_rejection_counts_mismatch", "self_check.selection_snapshot.main_items.rejection_counts", "Selection snapshot rejection counts do not match final candidate dispositions.", {
      expected: expectedRejectionCounts,
      actual: actualRejectionCounts
    }));
  }
  if (Number(snapshot.eligible_candidates) !== eligibleRanks.length) {
    issues.push(issue("main_audit_eligible_count_mismatch", "self_check.selection_snapshot.main_items.eligible_candidates", "Selection snapshot eligible count does not match ranked candidate receipts.", {
      expected: eligibleRanks.length,
      actual: Number(snapshot.eligible_candidates)
    }));
  }

  const expectedTargets = {
    target_min: STORY_FIRST_MIN,
    target: STORY_FIRST_TARGET,
    target_max: STORY_FIRST_MAX
  };
  const actualTargets = {
    target_min: Number(snapshot.target_min),
    target: Number(snapshot.target),
    target_max: Number(snapshot.target_max)
  };
  if (!sameJson(actualTargets, expectedTargets)) {
    issues.push(issue("main_audit_target_contract_mismatch", "self_check.selection_snapshot.main_items", "Main selection snapshot targets must use the shared story-first contract.", {
      expected: expectedTargets,
      actual: actualTargets
    }));
  }

  const reportMainIds = reportCandidateIds(report?.main_items, "candidate_id");
  const reportStoryIds = reportCandidateIds(report?.stories, "story_id", "candidate_id");
  const selectedById = new Map(selectedProjections.map((candidate) => [String(candidate.id || ""), candidate]));
  issues.push(...collectProjectionLineageIssues(evaluated, selectedProjections));
  for (const [section, ids] of [["main_items", reportMainIds], ["stories", reportStoryIds]]) {
    ids.forEach((candidateId, index) => {
      const candidate = selectedById.get(candidateId);
      if (!candidate || !MAIN_SELECTION_STAGE_SET.has(String(candidate.main_selection_stage || ""))) {
        issues.push(issue("main_audit_report_selection_missing", `${section}[${index}]`, "Main report item is not backed by a selected main audit receipt.", {
          section,
          candidate_id: candidateId
        }));
      }
    });
  }

  const selectedOrder = [...selectedProjections]
    .sort((left, right) => Number(left.main_rank) - Number(right.main_rank) || String(left.id || "").localeCompare(String(right.id || "")))
    .map((candidate) => String(candidate.id || ""));
  if (!sameJson(reportMainIds, selectedOrder)) {
    issues.push(issue("main_audit_report_order_mismatch", "main_items", "Public main item order must match persisted main ranks.", {
      expected: selectedOrder,
      actual: reportMainIds
    }));
  }
  if (!sameJson(reportStoryIds, selectedOrder)) {
    issues.push(issue("main_audit_story_order_mismatch", "stories", "Public story order must match persisted main ranks.", {
      expected: selectedOrder,
      actual: reportStoryIds
    }));
  }

  const storySnapshot = report?.self_check?.selection_snapshot?.stories;
  const expectedStorySnapshot = {
    selected: reportStoryIds.length,
    target_min: STORY_FIRST_MIN,
    target: STORY_FIRST_TARGET,
    target_max: STORY_FIRST_MAX,
    shortfall: reportStoryIds.length < STORY_FIRST_MIN
  };
  const actualStorySnapshot = storySnapshot && typeof storySnapshot === "object"
    ? {
        selected: Number(storySnapshot.selected),
        target_min: Number(storySnapshot.target_min),
        target: Number(storySnapshot.target),
        target_max: Number(storySnapshot.target_max),
        shortfall: Boolean(storySnapshot.shortfall)
      }
    : null;
  if (!sameJson(actualStorySnapshot, expectedStorySnapshot)) {
    issues.push(issue("main_audit_story_target_contract_mismatch", "self_check.selection_snapshot.stories", "Story selection snapshot must use the shared 5/8/12 contract and public story count.", {
      expected: expectedStorySnapshot,
      actual: actualStorySnapshot
    }));
  }

  const strictSelected = selectedProjections.filter((candidate) => candidate.main_selection_stage === MAIN_SELECTION_STAGE.STRICT).length;
  const refillSelected = selectedProjections.length - strictSelected;
  if (Number(snapshot.selected) !== selectedProjections.length || Number(snapshot.selected) !== reportMainIds.length) {
    issues.push(issue("main_audit_selected_count_mismatch", "self_check.selection_snapshot.main_items.selected", "Selection snapshot, candidate receipts, and report main item counts must agree.", {
      snapshot: Number(snapshot.selected),
      receipts: selectedProjections.length,
      report: reportMainIds.length
    }));
  }
  const expectedShortfall = selectedProjections.length < STORY_FIRST_MIN;
  if (Boolean(snapshot.shortfall) !== expectedShortfall) {
    issues.push(issue("main_audit_shortfall_mismatch", "self_check.selection_snapshot.main_items.shortfall", "Main selection shortfall must be derived from the shared minimum.", {
      expected: expectedShortfall,
      actual: Boolean(snapshot.shortfall)
    }));
  }
  if (expectedShortfall) {
    const shortfallEvent = snapshot.shortfall_event;
    const expectedShortfallEvent = {
      type: "main_stream_shortfall",
      selected: selectedProjections.length,
      target_min: STORY_FIRST_MIN,
      target_max: STORY_FIRST_MAX,
      remaining_shortfall: STORY_FIRST_MIN - selectedProjections.length,
      eligible_candidates: eligibleRanks.length,
      rejection_counts: expectedRejectionCounts
    };
    const actualShortfallEvent = shortfallEvent && typeof shortfallEvent === "object"
      ? {
          type: shortfallEvent.type,
          selected: Number(shortfallEvent.selected),
          target_min: Number(shortfallEvent.target_min),
          target_max: Number(shortfallEvent.target_max),
          remaining_shortfall: Number(shortfallEvent.remaining_shortfall),
          eligible_candidates: Number(shortfallEvent.eligible_candidates),
          rejection_counts: normalizeCounts(shortfallEvent.rejection_counts)
        }
      : null;
    if (!sameJson(actualShortfallEvent, expectedShortfallEvent)) {
      issues.push(issue("main_audit_shortfall_event_mismatch", "self_check.selection_snapshot.main_items.shortfall_event", "Main shortfall event must match receipts, rejection counts, and the shared contract.", {
        expected: expectedShortfallEvent,
        actual: actualShortfallEvent
      }));
    }
  } else if (snapshot.shortfall_event) {
    issues.push(issue("main_audit_shortfall_event_unexpected", "self_check.selection_snapshot.main_items.shortfall_event", "Main shortfall event must be absent when the shared minimum is met."));
  }
  if (Number(snapshot.strict_selected) !== strictSelected || Number(snapshot.refill_selected) !== refillSelected) {
    issues.push(issue("main_audit_stage_counts_mismatch", "self_check.selection_snapshot.main_items", "Strict and refill selected counts must match selected candidate receipts.", {
      expected: { strict_selected: strictSelected, refill_selected: refillSelected },
      actual: { strict_selected: Number(snapshot.strict_selected), refill_selected: Number(snapshot.refill_selected) }
    }));
  }

  return issues;
}

export function requireMainAuditConsistency(report, candidatePool) {
  const issues = collectMainAuditConsistencyIssues(report, candidatePool);
  if (issues.length > 0) {
    throw new PublisherError(
      "main_audit_consistency_failed",
      "Main selection score, disposition, snapshot, and report lineage do not agree.",
      { issues }
    );
  }
}

function candidatePoolCandidates(candidatePool) {
  return Array.isArray(candidatePool?.candidates) ? candidatePool.candidates : [];
}

function isEvaluatedMainCandidate(candidate) {
  const roles = Array.isArray(candidate?.roles) ? candidate.roles : [];
  const reason = String(candidate?.main_reject_reason || "").trim();
  return roles.includes("main_stream_candidate") &&
    !isSelectedMainProjection(candidate) &&
    !NON_MAIN_REJECT_REASONS.has(reason);
}

function isSelectedMainProjection(candidate) {
  return candidate?.status === "included" &&
    candidate?.included_in === "main_items" &&
    candidate?.category === "main_item";
}

function collectProjectionLineageIssues(evaluated, selectedProjections) {
  const issues = [];
  const selectedSources = evaluated.filter((candidate) => MAIN_SELECTION_STAGE_SET.has(String(candidate?.main_selection_stage || "")));
  const selectedSourceById = new Map(selectedSources.map((candidate) => [String(candidate.id || ""), candidate]));
  const projectionById = new Map(selectedProjections.map((candidate) => [String(candidate.id || ""), candidate]));

  for (const candidate of selectedSources) {
    const storyId = String(candidate?.main_story_id || "").trim();
    const primaryId = String(candidate?.main_story_primary_id || "").trim();
    const role = String(candidate?.main_story_role || "").trim();
    const projection = projectionById.get(storyId);
    const primary = selectedSourceById.get(primaryId);
    const lineageValid =
      Boolean(storyId && primaryId) &&
      (role === "primary" || role === "supporting") &&
      Boolean(projection) &&
      Boolean(primary) &&
      primary.main_story_role === "primary" &&
      String(primary.main_story_id || "") === storyId &&
      String(primary.main_story_primary_id || "") === primaryId &&
      (role !== "primary" || String(candidate.id || "") === primaryId);
    if (!lineageValid) {
      issues.push(issue("main_audit_source_lineage_mismatch", `candidate_pool.candidates[${candidate.id || "unknown"}]`, "Selected source candidate must point to one selected story projection and its primary candidate.", {
        candidate_id: candidate.id || "",
        main_story_id: storyId,
        main_story_primary_id: primaryId,
        main_story_role: role
      }));
    }
  }

  for (const projection of selectedProjections) {
    const projectionId = String(projection?.id || "").trim();
    const primaryId = String(projection?.main_story_primary_id || "").trim();
    const primary = selectedSourceById.get(primaryId);
    const expected = primary
      ? {
          main_story_id: projectionId,
          main_story_primary_id: primaryId,
          main_rank_score: Number(primary.main_rank_score),
          main_rank: Number(primary.main_rank),
          main_selection_stage: String(primary.main_selection_stage || "")
        }
      : null;
    const actual = {
      main_story_id: String(projection?.main_story_id || ""),
      main_story_primary_id: primaryId,
      main_rank_score: Number(projection?.main_rank_score),
      main_rank: Number(projection?.main_rank),
      main_selection_stage: String(projection?.main_selection_stage || "")
    };
    if (!primary || primary.main_story_role !== "primary" || !sameJson(actual, expected)) {
      issues.push(issue("main_audit_projection_lineage_mismatch", `candidate_pool.candidates[${projectionId || "unknown"}]`, "Selected story projection must exactly mirror its primary source candidate score, rank, stage, and lineage.", {
        candidate_id: projectionId,
        expected,
        actual
      }));
    }
  }

  return issues;
}

function rejectionCountsFor(candidates) {
  const counts = {};
  for (const candidate of candidates) {
    const reason = String(candidate?.main_reject_reason || "").trim();
    if (reason) {
      counts[reason] = (counts[reason] || 0) + 1;
    }
  }
  return normalizeCounts(counts);
}

function normalizeCounts(value) {
  return Object.fromEntries(
    Object.entries(value && typeof value === "object" && !Array.isArray(value) ? value : {})
      .map(([key, count]) => [String(key), Number(count)])
      .filter(([, count]) => Number.isInteger(count) && count > 0)
      .sort(([left], [right]) => left.localeCompare(right))
  );
}

function reportCandidateIds(items, ...keys) {
  return (Array.isArray(items) ? items : []).map((item) => {
    for (const key of keys) {
      const value = String(item?.[key] || "").trim();
      if (value) return value;
    }
    return "";
  });
}

function isPositiveInteger(value) {
  return Number.isInteger(Number(value)) && Number(value) > 0;
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function hasOwn(value, key) {
  return Boolean(value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, key));
}

function issue(code, path, message, details = {}) {
  return { code, path, message, ...details };
}
