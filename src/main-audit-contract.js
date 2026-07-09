export const MAIN_SELECTION_STAGE = Object.freeze({
  STRICT: "strict",
  REFILL: "refill",
  REFILL_GITHUB: "refill_github",
  REFILL_BUILDER: "refill_builder",
  REFILL_HOT_BLOG: "refill_hot_blog",
  REFILL_COMMUNITY: "refill_community",
  REFILL_WINDOW: "refill_window",
  REFILL_WEAK_SIGNAL: "refill_weak_signal"
});

export const MAIN_SELECTION_STAGES = Object.freeze(Object.values(MAIN_SELECTION_STAGE));

export const MAIN_REFILL_SELECTION_STAGES = Object.freeze(
  MAIN_SELECTION_STAGES.filter((stage) => stage === MAIN_SELECTION_STAGE.REFILL || stage.startsWith("refill_"))
);

const MAIN_REFILL_SELECTION_STAGE_SET = new Set(MAIN_REFILL_SELECTION_STAGES);

export function isMainRefillSelectionStage(value) {
  const stage = String(value || "").trim();
  return MAIN_REFILL_SELECTION_STAGE_SET.has(stage);
}

export const CANDIDATE_AUDIT_ROLE = Object.freeze({
  MAIN_STREAM_CANDIDATE: "main_stream_candidate",
  GITHUB_TRENDING: "github_trending",
  HOT_BLOG: "hot_blog",
  BUILDER_SIGNAL: "builder_signal",
  COMMUNITY_SIGNAL: "community_signal",
  OFFICIAL_UPDATE: "official_update"
});

export const CANDIDATE_AUDIT_ROLES = Object.freeze(Object.values(CANDIDATE_AUDIT_ROLE));

const CANDIDATE_AUDIT_ROLE_SET = new Set(CANDIDATE_AUDIT_ROLES);

export function normalizeCandidateAuditRoles(roles) {
  if (!Array.isArray(roles)) return [];
  return [
    ...new Set(
      roles
        .map((role) => String(role || "").trim())
        .filter((role) => CANDIDATE_AUDIT_ROLE_SET.has(role))
    )
  ];
}
