export const MAIN_AUDIT_CONTRACT_VERSION = 1;

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

export const MAIN_REJECT_REASON = Object.freeze({
  INVALID_CANDIDATE: "invalid_candidate",
  MISSING_URL: "missing_url",
  MISSING_READER_VISIBLE_TITLE: "missing_reader_visible_title",
  TEMPLATED_STORY_TITLE: "templated_story_title",
  FUTURE_DATED: "future_dated",
  OUTSIDE_MAIN_WINDOW: "outside_main_window",
  RECENT_DUPLICATE: "recent_duplicate",
  STATUSPAGE: "statuspage",
  SEARCH_SHADOW: "search_shadow",
  HUGGINGFACE_TRENDING_LANE: "huggingface_trending_lane",
  UNVERIFIED_AGGREGATOR_LEAD: "unverified_aggregator_lead",
  PRIMARY_REQUIRED_INTERMEDIARY_LEAD: "primary_required_intermediary_lead",
  GENERIC_GITHUB_TRENDING_TEXT: "generic_github_trending_text",
  GENERIC_HOT_BLOG_ANNOUNCEMENT: "generic_hot_blog_announcement",
  PUBLIC_FILLER_TEXT: "public_filler_text",
  LOW_VALUE_PRODUCT_HUNT_PROJECT: "low_value_product_hunt_project",
  LOW_VALUE_VENDOR_AVAILABILITY_PR: "low_value_vendor_availability_pr",
  LOW_VALUE: "low_value",
  LOW_VALUE_EVENT_GUIDE: "low_value_event_guide",
  LOW_VALUE_PROFILE: "low_value_profile",
  MINOR_CONSUMER_AI_FEATURE: "minor_consumer_ai_feature",
  LOW_SIGNAL_VENDOR_PARTNERSHIP: "low_signal_vendor_partnership",
  BUILDER_LOW_SIGNAL: "builder_low_signal",
  HARDCORE_RESEARCH_ONLY: "hardcore_research_only",
  COMMUNITY_SINGLE_SOURCE_STORY: "community_single_source_story",
  SECONDARY_SINGLE_SOURCE_STORY: "secondary_single_source_story",
  NOT_AI_RELEVANT: "not_ai_relevant",
  THIN_CANDIDATE_DETAIL: "thin_candidate_detail",
  UNVERIFIED_HIGH_RISK_CLAIM: "unverified_high_risk_claim",
  NOT_MAIN_REFILL_MATERIAL: "not_main_refill_material",
  NOT_SELECTED_LOWER_PRIORITY: "not_selected_lower_priority",
  RETIRED_PLATFORM_LANE: "retired_platform_lane",
  NOT_EVALUATED_SECTION_ITEM: "not_evaluated_section_item"
});

export const MAIN_REJECT_REASONS = Object.freeze(Object.values(MAIN_REJECT_REASON));

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
