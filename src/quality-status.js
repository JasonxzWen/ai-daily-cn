import fs from "node:fs";
import path from "node:path";
import { PublisherError } from "./errors.js";
import { AUTOMATION_REVISION_RULES, AUTOMATION_REVISION_RULE_ALIASES } from "./automation-revision.js";
import { isMeaningfulPublicEvidenceAsset } from "./media-policy.js";
import { normalizeUrlIdentity } from "./url.js";
import { degradationEventFromAuditGroup } from "./degradation-events.js";

const BLOCKED_SOURCE_STATUSES = new Set(["blocked", "skipped_missing_token", "skipped_missing_base_url"]);
const SOURCE_AVAILABLE_STATUSES = new Set(["checked", "no_signal"]);
const SOURCE_AUDIT_PROOF_STATUSES = new Set([...SOURCE_AVAILABLE_STATUSES, "blocked"]);

export const STRICT_COVERAGE_EFFECTIVE_DATE = "2026-06-02";

export const SECTION_MINIMUMS = {
  main_items: 5,
  github_trending: 10,
  huggingface_trending: 10,
  hot_blogs: 6,
  projects: 8,
  builder_observations: 8
};

export const CONTENT_UNIT_MINIMUM = 45;
export const STRICT_CONTENT_SOURCE_MINIMUM = 50;
export const STRICT_SOURCE_REGISTRY_MINIMUM = 60;
export const STRICT_GITHUB_TRENDING_SOURCE_MINIMUM = 10;
export const STRICT_BUILDER_SOURCE_MINIMUM = 3;

const PUBLIC_EVIDENCE_MIN_WIDTH = 240;
const PUBLIC_EVIDENCE_MIN_HEIGHT = 160;
const PUBLIC_EVIDENCE_MIN_AREA = 80000;
const NON_CONTENT_ASSET_ROLES = new Set(["icon", "favicon", "logo", "avatar", "decorative"]);

const REQUIRED_GITHUB_TRENDING_PARSED_MINIMUM = 10;
const SOURCE_OUTAGE_BLOCKED_RATIO = 0.8;
const SOURCE_OUTAGE_MIN_BLOCKED = 3;
const SOURCE_OUTAGE_GROUPS = ["github_trending", "huggingface_trending", "builder_sources", "china_ai_sources", "content_sources", "search_sources", "sources_health"];
const CHINA_AI_HARD_GATE_EFFECTIVE_DATE = "2026-06-11";
const CHINA_AI_SOURCE_MINIMUM = 6;
const WORKSPACE_WRITE_NETWORK_REMINDER =
  "Check config.toml or Codex settings and enable network access for workspace-write sandbox mode: set [sandbox_workspace_write] network_access = true / 设置“当沙盒设置为工作区写入时允许网络访问”.";

const CANDIDATE_SECTION_MAP = {
  main_item: "main_items",
  github_trending: "github_trending",
  huggingface_trending: "huggingface_trending",
  hot_blog: "hot_blogs",
  project: "projects",
  builder_observation: "builder_observations"
};
const MAINLINE_FACT_SECTIONS = ["main_items", "model_releases"];
const NON_PRIMARY_ALLOWED_SECTIONS = ["main_items", "hot_blogs", "projects", "builder_observations", "community_leads"];
const PRIMARY_SOURCE_LEVELS = new Set([
  "primary",
  "official",
  "paper",
  "github",
  "multi_source",
  "official_company_news",
  "official_open_source_account",
  "official_model_host_account",
  "model_registry"
]);
const NON_PRIMARY_VERIFICATION_STATUSES = new Set(["intermediary_only", "original_social_only", "unverified", "platform_exempt_unverified"]);

const FIXED_SOURCE_REQUIREMENTS = [
  {
    code: "fixed_source_a_open_aggregators",
    label: "A. open-source aggregators",
    sources: [
      { groups: ["builder_sources"], label: "follow-builders X feed", name: /follow-builders x feed/i, url: /zarazhangrui\/follow-builders/i },
      { groups: ["content_sources"], label: "ML Papers of the Week", name: /ML Papers of the Week/i }
    ]
  },
  {
    code: "fixed_source_b_official_labs",
    label: "B. official AI lab/blog sources",
    sources: [
      { groups: ["content_sources"], label: "OpenAI Blog RSS", name: /OpenAI Blog RSS/i },
      { groups: ["content_sources"], label: "OpenAI News RSS", name: /OpenAI News RSS/i },
      { groups: ["content_sources"], label: "Google DeepMind RSS", name: /Google DeepMind RSS/i },
      { groups: ["content_sources"], label: "Google Research Blog", name: /Google Research Blog/i },
      { groups: ["content_sources"], label: "Meta AI Blog", name: /Meta AI Blog/i },
      { groups: ["content_sources"], label: "Microsoft Research Blog", name: /Microsoft Research Blog/i },
      { groups: ["content_sources"], label: "AWS Machine Learning Blog", name: /AWS Machine Learning Blog/i },
      { groups: ["content_sources"], label: "Anthropic News", name: /Anthropic News/i },
      { groups: ["content_sources"], label: "Hugging Face Blog", name: /Hugging Face Blog/i }
    ]
  },
  {
    code: "fixed_source_c_global_media",
    label: "C. global technology media",
    sources: [
      { groups: ["content_sources"], label: "TechCrunch AI", name: /TechCrunch AI/i },
      { groups: ["content_sources"], label: "The Verge", name: /^The Verge$/i },
      { groups: ["content_sources"], label: "MIT Technology Review", name: /MIT Technology Review/i },
      { groups: ["content_sources"], label: "Ars Technica", name: /Ars Technica/i },
      { groups: ["content_sources"], label: "VentureBeat AI", name: /VentureBeat AI/i },
      { groups: ["content_sources"], label: "HNRSS Frontpage", name: /(?:HNRSS Frontpage|Hacker News Frontpage 100\+)/i, url: /hnrss\.org\/frontpage/i }
    ]
  },
  {
    code: "fixed_source_d_chinese_media",
    label: "D. Chinese AI media leads",
    sources: [
      { groups: ["content_sources"], label: "Jiqizhixin", name: /Jiqizhixin/i },
      { groups: ["content_sources"], label: "QbitAI", name: /QbitAI/i },
      { groups: ["content_sources"], label: "36Kr", name: /36Kr/i },
      { groups: ["content_sources"], label: "InfoQ CN", name: /InfoQ CN/i }
    ]
  },
  {
    code: "fixed_source_e_public_apis",
    label: "E. public APIs and paper sources",
    sources: [
      { groups: ["content_sources"], label: "arXiv cs.AI", name: /arXiv cs\.AI/i },
      { groups: ["content_sources"], label: "arXiv cs.CL", name: /arXiv cs\.CL/i },
      { groups: ["content_sources"], label: "arXiv cs.LG", name: /arXiv cs\.LG/i },
      { groups: ["content_sources"], label: "Hacker News Topstories API", name: /Hacker News Topstories API/i },
      { groups: ["content_sources"], label: "Hugging Face Daily Papers", name: /Hugging Face Daily Papers/i },
      { groups: ["github_trending"], label: "GitHub Trending daily", name: /GitHub Trending daily/i }
    ]
  },
  {
    code: "fixed_source_f_quality_aggregators",
    label: "F. high-quality AI aggregators",
    sources: [
      { groups: ["content_sources"], label: "Smol AI News", name: /Smol AI News/i },
      { groups: ["content_sources"], label: "Latent.Space", name: /Latent\.Space/i }
    ]
  }
];

export function deriveQualityStatus(report, candidatePool = null) {
  const explicit = normalizeQualityStatus(report?.quality_status);
  if (explicit?.status === "blocked") {
    return explicit;
  }

  const reasons = [];
  const affectedSections = [];
  const audit = report?.source_audit || {};
  const sourceDegradedSections = [];

  if (isEmptyNetworkOutageReport(report)) {
    reasons.push("empty_due_to_network_outage");
    affectedSections.push("main_items");
  }

  addSourceDegradation({
    auditGroup: "github_trending",
    group: audit.github_trending,
    reason: "github_trending_blocked",
    section: "github_trending",
    currentCount: sectionCount(report, "github_trending"),
    reasons,
    affectedSections,
    degradedSections: sourceDegradedSections
  });
  addSourceDegradation({
    auditGroup: "huggingface_trending",
    group: audit.huggingface_trending,
    reason: "huggingface_trending_blocked",
    section: "huggingface_trending",
    currentCount: sectionCount(report, "huggingface_trending"),
    reasons,
    affectedSections,
    degradedSections: sourceDegradedSections
  });
  addSourceDegradation({
    auditGroup: "china_ai_sources",
    group: audit.china_ai_sources,
    reason: "china_ai_sources_blocked",
    section: "hot_blogs",
    currentCount: sectionCount(report, "hot_blogs"),
    reasons,
    affectedSections,
    degradedSections: sourceDegradedSections
  });
  addSourceDegradation({
    auditGroup: "content_sources",
    group: audit.content_sources,
    reason: "content_sources_blocked",
    section: "hot_blogs",
    currentCount: sectionCount(report, "hot_blogs"),
    reasons,
    affectedSections,
    degradedSections: sourceDegradedSections
  });
  addSourceDegradation({
    auditGroup: "builder_sources",
    group: audit.builder_sources,
    reason: "builder_sources_blocked",
    section: "builder_observations",
    currentCount: sectionCount(report, "builder_observations"),
    reasons,
    affectedSections,
    degradedSections: sourceDegradedSections
  });
  addDailyTrackingDegradation({ report, reasons, affectedSections });

  addSelectionDegradation({ report, candidatePool, reasons, affectedSections });

  if (explicit?.status === "degraded") {
    reasons.push(...explicit.reasons);
    affectedSections.push(...explicit.affected_sections);
  }

  const strictIssues = strictDailyCoverageIssues(report);
  const blockingIssues = strictIssues.filter(isBlockingPublishQualityIssue);
  const strictDegradedSections = strictIssues.filter((issue) => !isBlockingPublishQualityIssue(issue));
  const strictDegradedReasons = strictDegradedSections.map((issue) => issue.code || issue.error_code).filter(Boolean);
  const degradedSections = uniqueQualityIssues([
    ...(explicit?.degraded_sections || []),
    ...sourceDegradedSections,
    ...degradedSectionsFromReasons(reasons, affectedSections),
    ...strictDegradedSections
  ]);

  const degradedReasons = unique(reasons.filter((reason) => reason !== "low_signal"));
  const status = blockingIssues.length > 0
    ? "blocked"
    : degradedReasons.length > 0 || degradedSections.length > 0
      ? "degraded"
      : "ok";
  const finalReasons = status === "degraded"
    ? unique([...reasons, ...degradedReasons, ...strictDegradedReasons])
    : status === "blocked"
      ? unique([...reasons, ...blockingIssues.map((issue) => issue.code || issue.error_code)])
      : unique([...(explicit?.reasons || []), ...lowSignalReasons(report)]);

  return {
    status,
    reasons: finalReasons,
    affected_sections: unique(affectedSections),
    degraded_sections: degradedSections,
    blocking_issues: uniqueQualityIssues([...(explicit?.blocking_issues || []), ...blockingIssues]),
    public_note: publicQualityNote(status, finalReasons, explicit?.status === status ? explicit.public_note : "")
  };
}

export function normalizeQualityStatus(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const status = ["ok", "degraded", "blocked"].includes(value.status) ? value.status : "ok";
  return {
    status,
    reasons: Array.isArray(value.reasons) ? value.reasons.filter(Boolean).map(String) : [],
    affected_sections: Array.isArray(value.affected_sections) ? value.affected_sections.filter(Boolean).map(String) : [],
    degraded_sections: Array.isArray(value.degraded_sections) ? value.degraded_sections.map(normalizeQualityIssue).filter(Boolean) : [],
    blocking_issues: Array.isArray(value.blocking_issues) ? value.blocking_issues.map(normalizeQualityIssue).filter(Boolean) : [],
    public_note: String(value.public_note || "").trim()
  };
}

export function classifyPublishQuality(report, options = {}) {
  const degradedSections = [];
  const reasons = new Set(report?.quality_status?.reasons || []);
  const mainItemCount = sectionCount(report, "main_items");
  const contentUnitCount = countContentUnits(report);
  const mainItemMinimum = SECTION_MINIMUMS.main_items;
  const builderCount = sectionCount(report, "builder_observations");
  const builderMinimum = SECTION_MINIMUMS.builder_observations;
  const builderSources = report?.source_audit?.builder_sources;

  if (reasons.has("main_items_selection_degraded") && mainItemCount < mainItemMinimum) {
    degradedSections.push({
      error_code: "main_items_coverage_gate_failed",
      code: "main_items_below_minimum",
      section: "main_items",
      count: mainItemCount,
      minimum: mainItemMinimum,
      remediation: "Use story-first selection to include up to 8 readable stories when qualified candidates exist, cap at 12, or keep the sparse day degraded with rejection and shortfall evidence."
    });
  }

  if (reasons.has("content_units_selection_degraded") && contentUnitCount < CONTENT_UNIT_MINIMUM) {
    degradedSections.push({
      error_code: "content_units_coverage_gate_failed",
      code: "content_units_below_minimum",
      section: "content_units",
      count: contentUnitCount,
      minimum: CONTENT_UNIT_MINIMUM,
      remediation: "Include enough qualified candidates across main_items, GitHub Trending, projects, blogs, Builder observations, and community leads, or record why candidates were excluded."
    });
  }

  if (groupHasBlockingSignal(builderSources) && builderCount < builderMinimum) {
    degradedSections.push({
      error_code: "builder_coverage_gate_failed",
      code: "builder_coverage_below_minimum",
      section: "builder_observations",
      count: builderCount,
      minimum: builderMinimum,
      blocked_reason: String(builderSources?.blocked_reason || "").trim(),
      sources: Array.isArray(builderSources?.sources) ? builderSources.sources : [],
      remediation: "Add reliable original Builder fallback candidates until builder_observations reaches the minimum, or fix the blocked Builder source before publishing."
    });
  }

  const strictIssues = strictDailyCoverageIssues(report, options);
  const blockingIssues = strictIssues.filter(isBlockingPublishQualityIssue);
  degradedSections.push(...strictIssues.filter((issue) => !isBlockingPublishQualityIssue(issue)));

  return {
    blocking_issues: uniqueQualityIssues(blockingIssues),
    degraded_sections: uniqueQualityIssues(degradedSections)
  };
}

export function findPublishQualityIssues(report, options = {}) {
  return classifyPublishQuality(report, options).blocking_issues;
}

export function requirePublishableQuality(report, options = {}) {
  const { blocking_issues: issues } = classifyPublishQuality(report, options);
  if (issues.length === 0) {
    return;
  }

  const issue = issues[0];
  throw new PublisherError(
    issue.error_code || "report_quality_gate_failed",
    issue.message ||
      `${issue.section} below publish minimum: ${issue.count}/${issue.minimum}; available candidate coverage was not reflected in the report.`,
    {
      issues,
      remediation: issue.remediation || "Fix the report coverage issue before publishing."
    }
  );
}

function strictDailyCoverageIssues(report, options = {}) {
  if (!isStrictCoverageReport(report)) {
    return [];
  }

  return [
    ...strictAutomationRevisionIssues(report, options),
    ...strictSectionIssues(report),
    ...strictEditorialIssues(report),
    ...strictSourceAuditIssues(report),
    ...strictBuilderIssues(report),
    ...strictEvidenceIssues(report, options),
    ...strictModelReleaseIssues(report)
  ];
}

function isBlockingPublishQualityIssue(issue) {
  return issue?.error_code === "automation_revision_gate_failed" ||
    issue?.error_code === "builder_translation_gate_failed" ||
    issue?.error_code === "china_ai_hard_gate_failed" ||
    issue?.error_code === "mainline_source_authority_gate_failed" ||
    issue?.code === "automation_revision_missing_or_stale" ||
    issue?.code === "china_ai_source_lane_missing" ||
    issue?.code === "builder_original_translation_missing" ||
    issue?.code === "mainline_source_authority_failed";
}

function degradedSectionsFromReasons(reasons, affectedSections) {
  const sections = unique(affectedSections);
  return sections.map((section) => {
    if (section === "main_items" && reasons.includes("empty_due_to_network_outage")) {
      return {
        error_code: "empty_report_network_outage",
        code: "empty_due_to_network_outage",
        section,
        message: "All fixed source lanes were blocked by network errors, so the report intentionally contains no unverified main_items.",
        remediation: "Enable workspace-write network access and rerun discovery before publishing a factual daily report."
      };
    }
    const reason = degradedReasonForSection(reasons, section);
    if (section === "daily_tracking" && reason === "daily_tracking_source_blocked") {
      return {
        error_code: "quality_degraded",
        code: reason,
        section,
        message: "每日追踪固定源部分不可用；受影响榜单只保留抓取状态，不进入公开正文。",
        remediation: "修复对应榜单的抓取或解析路径后，再把可核验变化标记为 publish_to_public。"
      };
    }
    return {
      error_code: "quality_degraded",
      code: reason,
      section,
      message: `${section} coverage is degraded and should be disclosed in the public report.`,
      remediation: "Keep the report publishable when facts are verified, but disclose the affected section and fix the source path in a follow-up."
    };
  });
}

function degradedReasonForSection(reasons, section) {
  if (section === "hot_blogs" && reasons.includes("china_ai_sources_blocked")) {
    return "china_ai_sources_blocked";
  }
  const mapped = {
    github_trending: "github_trending_blocked",
    huggingface_trending: "huggingface_trending_blocked",
    hot_blogs: "content_sources_blocked",
    builder_observations: "builder_sources_blocked",
    daily_tracking: "daily_tracking_source_blocked"
  }[section];
  if (mapped && reasons.includes(mapped)) {
    return mapped;
  }
  return reasons.find((item) => String(item || "").includes(section)) ||
    reasons.find((item) => item !== "empty_due_to_network_outage") ||
    reasons[0] ||
    "coverage_degraded";
}

function strictAutomationRevisionIssues(report, options = {}) {
  const revision = report?.self_check?.automation_revision;
  const revisionRules = Array.isArray(revision?.rules) ? revision.rules : [];
  const missingRules = AUTOMATION_REVISION_RULES.filter((rule) => {
    if (revisionRules.includes(rule)) {
      return false;
    }
    return !(AUTOMATION_REVISION_RULE_ALIASES[rule] || []).some((alias) => revisionRules.includes(alias));
  });
  const sourceRegistryCount = Number(revision?.source_registry_count || 0);
  const gitCommit = String(revision?.git_commit || "");
  const revisionMismatches = automationRevisionMismatches(revision, options.currentAutomationRevision);

  if (
    !revision ||
    !/^[0-9a-f]{40}$/i.test(gitCommit) ||
    sourceRegistryCount < STRICT_SOURCE_REGISTRY_MINIMUM ||
    missingRules.length > 0 ||
    revisionMismatches.length > 0
  ) {
    return [
      {
        error_code: "automation_revision_gate_failed",
        code: "automation_revision_missing_or_stale",
        section: "self_check.automation_revision",
        count: sourceRegistryCount,
        minimum: STRICT_SOURCE_REGISTRY_MINIMUM,
        missing_rules: missingRules,
        revision_mismatches: revisionMismatches,
        message: "self_check.automation_revision is missing, stale, not generated from current origin/main, or does not prove the fixed source checklist rules were active.",
        remediation: "Regenerate the report through report:write on latest origin/main so it records git commit, origin_main_sha, prompt modules, source registry count, and active hardening rules."
      }
    ];
  }

  return [];
}

function strictSectionIssues(report) {
  const issues = [];

  for (const [section, minimum] of Object.entries(SECTION_MINIMUMS)) {
    const eligibleCandidates = strictEligibleCandidateCount(report, section);
    if (eligibleCandidates !== null && eligibleCandidates < minimum) {
      continue;
    }
    const count = sectionCount(report, section);
    if (count < minimum) {
      issues.push({
        error_code: "strict_section_coverage_gate_failed",
        code: `${section}_below_strict_minimum`,
        section,
        count,
        minimum,
        message: `${section} below strict publish minimum: ${count}/${minimum}.`,
        remediation: "Regenerate from the fixed candidate pool and either fill the required section count or keep the report unpublished until source coverage is complete."
      });
    }
  }

  return issues;
}

function strictEligibleCandidateCount(report, section) {
  const count = Number(report?.self_check?.selection_snapshot?.[section]?.eligible_candidates);
  return Number.isFinite(count) && count >= 0 ? count : null;
}

function strictEditorialIssues(report) {
  const issues = [];
  const summary = String(report?.summary || "").trim();
  if (isProcessStatusSummary(summary)) {
    issues.push({
      error_code: "editorial_summary_gate_failed",
      code: "summary_contains_process_status",
      section: "summary",
      message: "Public summary reads like a generation/build status instead of an editorial daily lead.",
      remediation: "Rewrite summary around today's reader-facing AI industry storylines; keep build details in self_check or source_audit only."
    });
  }

  const mainlineLeaks = MAINLINE_FACT_SECTIONS.flatMap((section) => {
    const items = Array.isArray(report?.[section]) ? report[section] : [];
    return items
      .map((item, index) => ({ section, index, item }))
      .filter(({ item }) => hasNonPrimarySourceSignal(item) && isHighRiskMainlineClaim(item));
  });
  if (mainlineLeaks.length > 0) {
    const first = mainlineLeaks[0];
    issues.push({
      error_code: "mainline_source_authority_gate_failed",
      code: "mainline_source_authority_failed",
      section: first.section,
      count: mainlineLeaks.length,
      minimum: 0,
      leaked_items: mainlineLeaks.map(({ section, item }) => `${section}:${item?.title || item?.name || item?.url || "item"}`).slice(0, 8),
      message: "High-risk mainline facts must not rely on intermediary/community/original-social-only sources.",
      remediation: "Replace high-risk facts with official, primary, paper, GitHub, or multi-source-confirmed URLs; low-risk refill items may stay disclosed and degraded."
    });
  }

  const missingDisclosure = NON_PRIMARY_ALLOWED_SECTIONS.flatMap((section) => {
    const items = Array.isArray(report?.[section]) ? report[section] : [];
    return items
      .map((item, index) => ({ section, index, item }))
      .filter(({ item }) => hasNonPrimarySourceSignal(item) && !hasNonPrimaryDisclosure(item));
  });
  if (missingDisclosure.length > 0) {
    const first = missingDisclosure[0];
    issues.push({
      error_code: "non_primary_source_disclosure_gate_failed",
      code: "non_primary_source_disclosure_missing",
      section: first.section,
      count: missingDisclosure.length,
      minimum: 0,
      missing_items: missingDisclosure.map(({ section, item }) => `${section}:${item?.title || item?.name || item?.url || "item"}`).slice(0, 8),
      message: "Non-primary sources in viewpoint, product, Builder, or community sections must disclose source level and verification/risk notes.",
      remediation: "Add source_level, verification_status, and verification_note or risk_note before publishing the section."
    });
  }

  return issues;
}

function strictSourceAuditIssues(report) {
  const issues = [];
  const contentSources = report?.source_audit?.content_sources;
  const githubSources = report?.source_audit?.github_trending;
  const contentSourceCount = Array.isArray(contentSources?.sources) ? contentSources.sources.length : 0;
  const githubSourceCount = Array.isArray(githubSources?.sources) ? githubSources.sources.length : 0;
  const githubCandidatesFound = Number(githubSources?.candidates_found || 0);
  const hasGithubTop10Ranks = hasRankCoverage(report?.github_trending, 1, SECTION_MINIMUMS.github_trending);

  if (contentSourceCount < STRICT_CONTENT_SOURCE_MINIMUM) {
    issues.push({
      error_code: "fixed_source_surface_gate_failed",
      code: "content_sources_below_fixed_surface",
      section: "source_audit.content_sources",
      count: contentSourceCount,
      minimum: STRICT_CONTENT_SOURCE_MINIMUM,
      message: `source_audit.content_sources does not prove the fixed source surface was checked: ${contentSourceCount}/${STRICT_CONTENT_SOURCE_MINIMUM}.`,
      remediation: "Run discover:content-sources with the core,optional registry surface and merge its source_audit into the final report JSON."
    });
  }

  if (
    githubSourceCount < STRICT_GITHUB_TRENDING_SOURCE_MINIMUM ||
    githubCandidatesFound < SECTION_MINIMUMS.github_trending ||
    sectionCount(report, "github_trending") < SECTION_MINIMUMS.github_trending ||
    !hasGithubTop10Ranks
  ) {
    issues.push({
      error_code: "github_trending_top10_gate_failed",
      code: "github_trending_top10_missing",
      section: "github_trending",
      count: sectionCount(report, "github_trending"),
      minimum: SECTION_MINIMUMS.github_trending,
      candidates_found: githubCandidatesFound,
      audit_sources: githubSourceCount,
      audit_source_minimum: STRICT_GITHUB_TRENDING_SOURCE_MINIMUM,
      has_rank_coverage: hasGithubTop10Ranks,
      message: "GitHub Trending Top 10 or its daily/weekly/language source audit is missing.",
      remediation: "Run discover:github-trending and include the Top 10 repositories with rank/trend metadata before publishing."
    });
  }

  issues.push(...strictGitHubTrendingSourceSignalIssues(githubSources));
  issues.push(...strictChinaAiSourceIssues(report));
  issues.push(...strictSourceAvailabilityIssues(report));

  for (const requirement of FIXED_SOURCE_REQUIREMENTS) {
    const missing = requirement.sources
      .filter((sourceRequirement) => !hasAuditSource(report, sourceRequirement))
      .map((sourceRequirement) => sourceRequirement.label);
    if (missing.length === 0) {
      continue;
    }
    issues.push({
      error_code: "fixed_source_surface_gate_failed",
      code: requirement.code,
      section: "source_audit",
      count: requirement.sources.length - missing.length,
      minimum: requirement.sources.length,
      missing_sources: missing,
      message: `${requirement.label} missing from final source_audit: ${missing.join(", ")}.`,
      remediation: "Regenerate discovery output from config/sources and merge the final source_audit before report:write/publish."
    });
  }

  return issues;
}

function strictSourceAvailabilityIssues(report) {
  const summaries = SOURCE_OUTAGE_GROUPS
    .map((groupName) => sourceAuditGroupSummary(groupName, report?.source_audit?.[groupName]))
    .filter((summary) => summary.total_sources > 0);
  const outageGroups = summaries.filter((summary) =>
    summary.blocked_count >= SOURCE_OUTAGE_MIN_BLOCKED &&
    summary.blocked_ratio >= SOURCE_OUTAGE_BLOCKED_RATIO
  );
  if (outageGroups.length === 0) {
    return [];
  }

  const likelyNetworkOutage = outageGroups.length >= 2 &&
    outageGroups.some((summary) => summary.network_error_count >= SOURCE_OUTAGE_MIN_BLOCKED);
  const issueGroups = likelyNetworkOutage ? outageGroups : outageGroups.filter((summary) => summary.group !== "sources_health");
  if (issueGroups.length === 0) {
    return [];
  }

  const groupSummaryText = issueGroups
    .map((summary) => `${summary.group} ${summary.blocked_count}/${summary.total_sources} blocked`)
    .join("; ");

  if (likelyNetworkOutage) {
    return [
      {
        error_code: "source_discovery_network_gate_failed",
        code: "source_discovery_network_unavailable",
        section: "source_audit",
        count: issueGroups.reduce((sum, summary) => sum + summary.blocked_count, 0),
        minimum: SOURCE_OUTAGE_MIN_BLOCKED,
        blocked_count: issueGroups.reduce((sum, summary) => sum + summary.blocked_count, 0),
        total_sources: issueGroups.reduce((sum, summary) => sum + summary.total_sources, 0),
        affected_groups: issueGroups.map((summary) => summary.group),
        group_summaries: issueGroups,
        message: `Source discovery appears network-unavailable for this run: ${groupSummaryText}.`,
        remediation: WORKSPACE_WRITE_NETWORK_REMINDER
      }
    ];
  }

  return issueGroups.map((summary) => ({
    error_code: "source_blocked_rate_gate_failed",
    code: "source_group_blocked_rate_high",
    section: `source_audit.${summary.group}`,
    count: summary.blocked_count,
    minimum: Math.ceil(summary.total_sources * SOURCE_OUTAGE_BLOCKED_RATIO),
    blocked_count: summary.blocked_count,
    total_sources: summary.total_sources,
    blocked_ratio: summary.blocked_ratio,
    checked_count: summary.checked_count,
    no_signal_count: summary.no_signal_count,
    skipped_count: summary.skipped_count,
    group_summaries: [summary],
    message: `${summary.group} has a high blocked-source ratio: ${summary.blocked_count}/${summary.total_sources} blocked.`,
    remediation: "Keep blocked sources out of factual text, disclose the degraded source lane publicly, and repair the source path before relying on this lane for selection."
  }));
}

function strictGitHubTrendingSourceSignalIssues(group) {
  const sources = Array.isArray(group?.sources) ? group.sources : [];
  const requiredSources = sources.filter(isRequiredGitHubTrendingSource);
  if (requiredSources.length === 0) {
    return [];
  }

  const weakSources = requiredSources
    .map((source) => ({
      name: String(source?.name || "").trim(),
      url: String(source?.url || "").trim(),
      status: String(source?.status || ""),
      parsed_count: githubTrendingParsedCount(source),
      notes: String(source?.notes || "").trim()
    }))
    .filter((source) =>
      source.status !== "checked" ||
      !Number.isInteger(source.parsed_count) ||
      source.parsed_count < REQUIRED_GITHUB_TRENDING_PARSED_MINIMUM
    );

  if (weakSources.length === 0) {
    return [];
  }

  return [
    {
      error_code: "github_trending_source_signal_gate_failed",
      code: "github_trending_required_source_weak_signal",
      section: "source_audit.github_trending",
      count: requiredSources.length - weakSources.length,
      minimum: requiredSources.length,
      parsed_minimum: REQUIRED_GITHUB_TRENDING_PARSED_MINIMUM,
      weak_sources: weakSources,
      message: "One or more required GitHub Trending pages did not parse enough repositories for reliable daily coverage.",
      remediation: "Re-run discover:github-trending, inspect GitHub HTML selectors or network responses for weak sources, and disclose the degraded GitHub Trending source lane before publishing."
    }
  ];
}

function strictChinaAiSourceIssues(report) {
  if (String(report?.report_date || "") < CHINA_AI_HARD_GATE_EFFECTIVE_DATE) {
    return [];
  }
  const group = report?.source_audit?.china_ai_sources;
  const sources = Array.isArray(group?.sources) ? group.sources : [];
  const activeSources = sources.filter((source) => !String(source?.status || "").startsWith("skipped_manual"));
  const proofSources = activeSources.filter((source) => SOURCE_AUDIT_PROOF_STATUSES.has(String(source?.status || "")) || String(source?.status || "") === "blocked");
  if (!group || group.checked !== true || proofSources.length < CHINA_AI_SOURCE_MINIMUM) {
    return [
      {
        error_code: "china_ai_hard_gate_failed",
        code: "china_ai_source_lane_missing",
        section: "source_audit.china_ai_sources",
        count: proofSources.length,
        minimum: CHINA_AI_SOURCE_MINIMUM,
        message: "China AI source lane is missing or too small for a strict daily publish.",
        remediation: "Run discover:china-ai against config/sources/china-ai-sources.json, merge source_audit.china_ai_sources, and prefer Chinese official pages before publishing."
      }
    ];
  }

  if (Number(group.candidates_found || 0) === 0) {
    return [
      {
        error_code: "china_ai_coverage_degraded",
        code: "china_ai_no_recent_signal",
        section: "source_audit.china_ai_sources",
        count: 0,
        minimum: 1,
        message: "China AI source lane ran successfully but produced no recent candidates.",
        remediation: "Disclose the no-signal China AI lane publicly and inspect source selectors/search coverage before relying on overseas mirrors."
      }
    ];
  }

  return [];
}

function isRequiredGitHubTrendingSource(source) {
  const name = String(source?.name || "").trim();
  return /^GitHub Trending (?:(?:Python|TypeScript|Rust|Go) )?(?:daily|weekly)$/i.test(name);
}

function githubTrendingParsedCount(source) {
  if (Number.isInteger(source?.parsed_count)) {
    return source.parsed_count;
  }
  const match = String(source?.notes || "").match(/(\d+)\s+repositories parsed/i);
  return match ? Number.parseInt(match[1], 10) : null;
}

function sourceAuditGroupSummary(groupName, group) {
  const sources = Array.isArray(group?.sources) ? group.sources : [];
  const activeSources = sources.filter((source) => !String(source?.status || "").startsWith("skipped_manual"));
  const statuses = activeSources.map((source) => String(source?.status || "unknown"));
  const blockedCount = statuses.filter((status) => BLOCKED_SOURCE_STATUSES.has(status) || status === "blocked").length;
  const checkedCount = statuses.filter((status) => status === "checked").length;
  const noSignalCount = statuses.filter((status) => status === "no_signal").length;
  const skippedCount = statuses.filter((status) => status.startsWith("skipped")).length;
  const networkErrorCount = activeSources.filter((source) => isNetworkUnavailableNote(source?.notes)).length;
  return {
    group: groupName,
    total_sources: activeSources.length,
    blocked_count: blockedCount,
    checked_count: checkedCount,
    no_signal_count: noSignalCount,
    skipped_count: skippedCount,
    network_error_count: networkErrorCount,
    blocked_ratio: activeSources.length > 0 ? Number((blockedCount / activeSources.length).toFixed(3)) : 0,
    blocked_reason: String(group?.blocked_reason || "").trim()
  };
}

function isNetworkUnavailableNote(value) {
  return /fetch failed|network|timeout|timed out|ENOTFOUND|EAI_AGAIN|ECONNRESET|ETIMEDOUT|retry_failed/i.test(String(value || ""));
}

function strictBuilderIssues(report) {
  const issues = [];
  const builderSources = report?.source_audit?.builder_sources;
  const builderSourceCount = Array.isArray(builderSources?.sources) ? builderSources.sources.length : 0;
  const hasFollowBuildersX = hasAuditSource(report, {
    groups: ["builder_sources"],
    name: /follow-builders x feed/i,
    url: /feed-x\.json/i
  });
  const hasXObservation = (report?.builder_observations || []).some((item) => isXStatusUrl(item?.url));

  if (builderSourceCount < STRICT_BUILDER_SOURCE_MINIMUM || !hasFollowBuildersX || !hasXObservation) {
    issues.push({
      error_code: "builder_x_coverage_gate_failed",
      code: "builder_x_source_or_observation_missing",
      section: "builder_observations",
      count: sectionCount(report, "builder_observations"),
      minimum: SECTION_MINIMUMS.builder_observations,
      audit_sources: builderSourceCount,
      audit_source_minimum: STRICT_BUILDER_SOURCE_MINIMUM,
      has_follow_builders_x: hasFollowBuildersX,
      has_x_observation: hasXObservation,
      message: "Builder coverage must prove follow-builders X was checked and include at least one original x.com/twitter.com status.",
      remediation: "Run discover:builders, preserve follow-builders X source status in source_audit, and include at least one original X status in builder_observations."
    });
  }

  const contractViolations = builderObservationContractViolations(report);
  if (contractViolations.length > 0) {
    issues.push({
      error_code: "builder_translation_gate_failed",
      code: "builder_original_translation_missing",
      section: "builder_observations",
      count: sectionCount(report, "builder_observations"),
      violations: contractViolations,
      message: "Builder observations must preserve original_text and a complete Chinese translation; content must match translation.",
      remediation: "Regenerate Builder observations from original posts, fill original_text and translation, and set content to the same complete Chinese translation before report:write or publish."
    });
  }

  return issues;
}

function builderObservationContractViolations(report) {
  const items = Array.isArray(report?.builder_observations) ? report.builder_observations : [];
  return items
    .map((item, index) => {
      const missing = [];
      const originalText = String(item?.original_text || "").trim();
      const translation = String(item?.translation || "").trim();
      const content = String(item?.content || "").trim();
      if (!originalText) {
        missing.push("original_text");
      }
      if (!translation) {
        missing.push("translation");
      }
      if (translation && content !== translation) {
        missing.push("content_matches_translation");
      }
      return missing.length > 0
        ? {
            index,
            author: String(item?.author || "").trim(),
            candidate_id: String(item?.candidate_id || "").trim(),
            missing
          }
        : null;
    })
    .filter(Boolean);
}

function strictEvidenceIssues(report, options = {}) {
  const assets = Array.isArray(report?.evidence_assets) ? report.evidence_assets : [];
  const itemUrls = new Set(
    ["main_items", "model_releases", "hot_blogs", "projects", "daily_tracking", "builder_observations", "community_leads"]
      .flatMap((section) => (Array.isArray(report?.[section]) ? report[section] : []))
      .map((item) => normalizeUrl(item?.url))
      .filter(Boolean)
  );
  const linkedLocalAssets = assets.filter((asset) => asset?.local_path && itemUrls.has(normalizeUrl(asset?.source_url)));
  const violations = linkedLocalAssets.flatMap((asset) => publicEvidenceAssetViolations(asset, options));

  if (violations.length > 0) {
    return [
      {
        error_code: "public_media_contract_failed",
        code: "public_evidence_asset_invalid",
        section: "evidence_assets",
        count: Math.max(0, linkedLocalAssets.length - violations.length),
        minimum: linkedLocalAssets.length,
        violations,
        message: "Public evidence media includes invalid icons, unreadable images, missing files, or full-page screenshots.",
        remediation: "Drop invalid media from public rendering, keep screenshots only in internal evidence, and prefer structured tables for leaderboard pages."
      }
    ];
  }

  return [];
}

function publicEvidenceAssetViolations(asset, options = {}) {
  const violations = [];
  const assetPath = normalizeAssetPath(asset?.local_path);
  if (!assetPath || !evidenceAssetExists(assetPath, options)) {
    violations.push(publicEvidenceViolation(asset, "linked_local_evidence_file_missing"));
  }
  if (isNonContentAsset(asset)) {
    violations.push(publicEvidenceViolation(asset, "non_content_image_asset"));
  }
  if (hasKnownTooSmallDimensions(asset)) {
    violations.push(publicEvidenceViolation(asset, "image_dimensions_too_small"));
  }
  if (isFullPageScreenshotAsset(asset)) {
    violations.push(publicEvidenceViolation(asset, "full_page_screenshot_not_public_content"));
  }
  if (!isMeaningfulPublicEvidenceAsset(asset)) {
    violations.push(publicEvidenceViolation(asset, "non_semantic_public_image"));
  }
  return violations;
}

function publicEvidenceViolation(asset, reason) {
  return {
    reason,
    title: String(asset?.title || "").trim(),
    source_url: String(asset?.source_url || "").trim(),
    local_path: String(asset?.local_path || "").trim(),
    width: Number.isFinite(Number(asset?.width)) ? Number(asset.width) : undefined,
    height: Number.isFinite(Number(asset?.height)) ? Number(asset.height) : undefined,
    asset_role: String(asset?.asset_role || "").trim(),
    asset_kind: String(asset?.asset_kind || "").trim(),
    capture_kind: String(asset?.capture_kind || "").trim()
  };
}

function isNonContentAsset(asset) {
  const role = String(asset?.asset_role || asset?.role || "").trim().toLowerCase();
  if (NON_CONTENT_ASSET_ROLES.has(role)) {
    return true;
  }
  const text = publicEvidenceAssetText(asset);
  return /\b(?:favicon|logo|avatar|icon)\b|图标|头像|徽标/u.test(text);
}

function hasKnownTooSmallDimensions(asset) {
  const width = Number(asset?.width || asset?.natural_width);
  const height = Number(asset?.height || asset?.natural_height);
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return false;
  }
  return width < PUBLIC_EVIDENCE_MIN_WIDTH ||
    height < PUBLIC_EVIDENCE_MIN_HEIGHT ||
    width * height < PUBLIC_EVIDENCE_MIN_AREA;
}

function isFullPageScreenshotAsset(asset) {
  const captureKind = String(asset?.capture_kind || asset?.capture_type || "").trim().toLowerCase();
  if (captureKind === "full_page_screenshot" || captureKind === "page_screenshot" || captureKind === "browser_screenshot") {
    return true;
  }
  return /\b(?:full[- ]?page|browser|viewport|page)\s+screenshot\b|整页截图|浏览器截图/u.test(publicEvidenceAssetText(asset));
}

function publicEvidenceAssetText(asset) {
  return [
    asset?.title,
    asset?.caption,
    asset?.local_path,
    asset?.extraction_status,
    asset?.asset_kind,
    asset?.asset_role,
    asset?.source_url
  ].map((value) => String(value || "").toLowerCase()).join(" ");
}

function strictModelReleaseIssues(report) {
  const modelReleases = Array.isArray(report?.model_releases) ? report.model_releases : [];
  if (modelReleases.length === 0) {
    return [];
  }

  const mainUrls = new Set((report?.main_items || []).map((item) => normalizeUrl(item?.url)).filter(Boolean));
  const missing = modelReleases
    .filter((item) => normalizeUrl(item?.url) && !mainUrls.has(normalizeUrl(item?.url)))
    .map((item) => item?.name || item?.title || item?.url || "model release");

  if (missing.length === 0) {
    return [];
  }

  return [
    {
      error_code: "model_release_main_item_gate_failed",
      code: "model_release_not_in_main_items",
      section: "model_releases",
      count: modelReleases.length - missing.length,
      minimum: modelReleases.length,
      missing_model_releases: missing,
      message: `Model releases missing from main_items: ${missing.join(", ")}.`,
      remediation: "Mirror each real model launch into main_items, while keeping model_releases as the structured index."
    }
  ];
}

function addSourceDegradation({ auditGroup, group, reason, section, currentCount, reasons, affectedSections, degradedSections }) {
  if (!groupHasBlockingSignal(group)) {
    return;
  }
  if (currentCount >= (SECTION_MINIMUMS[section] || 1)) {
    return;
  }
  reasons.push(reason);
  affectedSections.push(section);
  const event = degradationEventFromAuditGroup({ auditGroup, group, code: reason, section });
  if (event && Array.isArray(degradedSections)) {
    degradedSections.push(event);
  }
}

function addDailyTrackingDegradation({ report, reasons, affectedSections }) {
  const items = Array.isArray(report?.daily_tracking) ? report.daily_tracking : [];
  const hasUnverifiedTracking = items.some((item) => {
    if (String(item?.verification_status || "") === "unverified") {
      return true;
    }
    const note = [
      item?.verification_note,
      item?.risk_note,
      item?.evidence
    ].filter(Boolean).join(" ");
    return /blocked|HTTP\s+\d{3}|403|抓取受阻|不可用/i.test(note);
  });
  const trackingSourceBlocked = sourceAuditHasBlockedDailyTracker(report?.source_audit);
  if (!hasUnverifiedTracking && !trackingSourceBlocked) {
    return;
  }
  reasons.push("daily_tracking_source_blocked");
  affectedSections.push("daily_tracking");
}

function sourceAuditHasBlockedDailyTracker(sourceAudit) {
  const sources = Array.isArray(sourceAudit?.content_sources?.sources) ? sourceAudit.content_sources.sources : [];
  return sources.some((source) => {
    const name = String(source?.name || source?.label || "").trim();
    if (!/OpenRouter Rankings|Artificial Analysis Intelligence Index|Scale Labs SWE-Bench Pro/i.test(name)) {
      return false;
    }
    return BLOCKED_SOURCE_STATUSES.has(source?.status);
  });
}

function addSelectionDegradation({ report, candidatePool, reasons, affectedSections }) {
  const candidates = Array.isArray(candidatePool?.candidates) ? candidatePool.candidates : [];
  if (candidates.length === 0) {
    return;
  }

  const counts = new Map();
  for (const candidate of candidates) {
    const section = CANDIDATE_SECTION_MAP[candidate?.category] || candidate?.included_in;
    if (!section || !Object.hasOwn(SECTION_MINIMUMS, section)) {
      continue;
    }
    counts.set(section, (counts.get(section) || 0) + 1);
  }

  for (const [section, minimum] of Object.entries(SECTION_MINIMUMS)) {
    if (section === "github_trending") {
      continue;
    }
    if (selectionSnapshotProvesSparseFullSelection(report, section, minimum)) {
      continue;
    }
    if ((counts.get(section) || 0) >= minimum && sectionCount(report, section) < minimum) {
      reasons.push(`${section}_selection_degraded`);
      affectedSections.push(section);
    }
  }

  const selectableContentUnits = [...counts.entries()].reduce((sum, [section, count]) => {
    return sum + (section === "github_trending" ? Math.min(count, SECTION_MINIMUMS.github_trending) : count);
  }, 0);

  if (selectableContentUnits >= CONTENT_UNIT_MINIMUM && countContentUnits(report) < CONTENT_UNIT_MINIMUM) {
    reasons.push("content_units_selection_degraded");
    affectedSections.push("content_units");
  }
}

function selectionSnapshotProvesSparseFullSelection(report, section, minimum) {
  const snapshot = report?.self_check?.selection_snapshot?.[section];
  if (!snapshot || typeof snapshot !== "object") {
    return false;
  }
  const eligible = firstFiniteNumber(
    snapshot.eligible_after_filter,
    snapshot.eligible_after_ai_filter,
    snapshot.filtered_eligible,
    snapshot.eligible_candidates_after_filter,
    snapshot.eligible_candidates
  );
  if (eligible === null || eligible >= minimum) {
    return false;
  }
  const selected = firstFiniteNumber(snapshot.selected, snapshot.included, sectionCount(report, section));
  return selected !== null && selected >= eligible;
}

function firstFiniteNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number >= 0) {
      return number;
    }
  }
  return null;
}

function groupHasBlockingSignal(group) {
  if (!group || typeof group !== "object") {
    return false;
  }
  if (String(group.blocked_reason || "").trim()) {
    return true;
  }
  return Array.isArray(group.sources) && group.sources.some((source) => BLOCKED_SOURCE_STATUSES.has(source?.status));
}

function isProcessStatusSummary(summary) {
  return /最新\s*main|重新生成|结构化\s*JSON|内容单元|扩展为\s*\d+\s*条|generated from|regenerated|build log/i.test(summary);
}

function hasNonPrimarySourceSignal(item = {}) {
  const sourceLevel = String(item?.source_level || "").trim();
  const verificationStatus = String(item?.verification_status || "").trim();
  return Boolean(
    NON_PRIMARY_VERIFICATION_STATUSES.has(verificationStatus) ||
    (sourceLevel && !PRIMARY_SOURCE_LEVELS.has(sourceLevel))
  );
}

function isHighRiskMainlineClaim(item = {}) {
  const text = [
    item?.title,
    item?.summary,
    ...(Array.isArray(item?.bullets) ? item.bullets : []),
    item?.why_it_matters,
    item?.reader_relevance
  ].map((value) => String(value || "")).join(" ");
  return /\b(funding|raised|valuation|ipo|acquisition|revenue|earnings|profit|pricing|price|benchmark|outperform|accuracy|leaderboard|safety|regulation|policy|lawsuit|ban|security|vulnerability|attack|government|minister|capability|capabilities)\b|\$[\d,.]+\s*(?:m|b|million|billion)?|融资|估值|上市|收购|营收|财报|定价|价格|基准|跑分|安全|监管|政策|诉讼|禁令|漏洞|攻击|政府/u.test(text);
}

function hasNonPrimaryDisclosure(item = {}) {
  const sourceLevel = String(item?.source_level || "").trim();
  const verificationStatus = String(item?.verification_status || "").trim();
  const verificationNote = String(item?.verification_note || "").trim();
  const riskNote = String(item?.risk_note || "").trim();
  return Boolean(sourceLevel && verificationStatus && (verificationNote || riskNote));
}

function sectionCount(report, section) {
  const value = report?.[section];
  return Array.isArray(value) ? value.length : 0;
}

function isEmptyNetworkOutageReport(report) {
  return report?.report_status === "empty_due_to_network_outage" &&
    sectionCount(report, "main_items") === 0;
}

function countContentUnits(report) {
  return [
    "main_items",
    "model_releases",
    "hot_blogs",
    "projects",
    "builder_observations",
    "community_leads",
    "github_trending",
    "huggingface_trending"
  ].reduce((sum, section) => sum + sectionCount(report, section), 0);
}

function lowSignalReasons(report) {
  const audit = report?.source_audit || {};
  const checkedNoSignal = ["github_trending", "huggingface_trending", "content_sources", "china_ai_sources", "builder_sources"].some((groupName) => {
    const group = audit[groupName];
    return group?.checked === true && Number(group.candidates_found || 0) === 0 && !groupHasBlockingSignal(group);
  });
  return checkedNoSignal ? ["low_signal"] : [];
}

function publicQualityNote(status, reasons, explicitNote) {
  if (status === "blocked") {
    return explicitNote || "Report generation is blocked by a startup or validation failure.";
  }
  if (status === "degraded") {
    if (reasons.includes("empty_due_to_network_outage")) {
      return explicitNote ||
        `本轮固定信源发现面因网络不可用全部阻塞，日报未写入未核验主体事实。${WORKSPACE_WRITE_NETWORK_REMINDER}`;
    }
    if (reasons.includes("source_discovery_network_unavailable")) {
      return explicitNote ||
        `本轮固定信源发现面疑似网络不可用，日报可能沿用了旧候选或只保留 blocked 审计。${WORKSPACE_WRITE_NETWORK_REMINDER}`;
    }
    if (reasons.includes("github_trending_required_source_weak_signal")) {
      return explicitNote || "本轮 GitHub Trending 必查子源覆盖不足；公开 Top 10 可读，但语言/周期榜单审计可能不完整。";
    }
    if (reasons.includes("content_sources_blocked") && reasons.includes("builder_sources_blocked")) {
      return explicitNote || "Content source and Builder source coverage is degraded; those sections may be incomplete.";
    }
    if (reasons.includes("content_sources_blocked")) {
      return explicitNote || "Content source coverage is degraded; some sections may be incomplete.";
    }
    if (reasons.includes("builder_sources_blocked")) {
      return explicitNote || "Builder source coverage is degraded; Builder observations may be incomplete.";
    }
    if (reasons.includes("daily_tracking_source_blocked")) {
      return explicitNote || "本轮每日追踪源部分受阻；受影响榜单只保留抓取状态，不写入未核验的新事实。";
    }
    return explicitNote || "Some discovery coverage is degraded; this report may be incomplete.";
  }
  return explicitNote || "Core discovery checks completed without blocking degradation.";
}

function hasAuditSource(report, requirement) {
  const statuses = new Set(requirement.statuses || SOURCE_AUDIT_PROOF_STATUSES);
  return (requirement.groups || []).some((groupName) => {
    const sources = report?.source_audit?.[groupName]?.sources;
    if (!Array.isArray(sources)) {
      return false;
    }
    return sources.some((source) => {
      const name = String(source?.name || "");
      const url = String(source?.url || "");
      const status = String(source?.status || "");
      if (!statuses.has(status)) {
        return false;
      }
      if (requirement.name && !requirement.name.test(name)) {
        return false;
      }
      if (requirement.url && !requirement.url.test(url)) {
        return false;
      }
      return true;
    });
  });
}

function automationRevisionMismatches(revision, currentRevision) {
  if (!revision) {
    return ["missing"];
  }

  const mismatches = [];
  const revisionGitCommit = String(revision.git_commit || "");
  const revisionOriginMain = String(revision.origin_main_sha || "");
  if (/^[0-9a-f]{40}$/i.test(revisionOriginMain) && revisionGitCommit !== revisionOriginMain) {
    mismatches.push("origin_main_sha");
  }

  if (!currentRevision) {
    return mismatches;
  }

  const currentGitCommit = String(currentRevision.git_commit || "");
  if (!/^[0-9a-f]{40}$/i.test(currentGitCommit)) {
    mismatches.push("current_git_commit_unavailable");
  } else if (revisionGitCommit !== currentGitCommit) {
    mismatches.push("git_commit");
  }

  const currentOriginMain = String(currentRevision.origin_main_sha || "");
  if (/^[0-9a-f]{40}$/i.test(currentOriginMain)) {
    if (revisionOriginMain !== currentOriginMain) {
      mismatches.push("origin_main_sha");
    }
    if (currentGitCommit !== currentOriginMain) {
      mismatches.push("current_not_origin_main");
    }
  }

  if (currentRevision.prompt_manifest && revision.prompt_manifest !== currentRevision.prompt_manifest) {
    mismatches.push("prompt_manifest");
  }
  if (!arraysEqual(revision.prompt_modules, currentRevision.prompt_modules)) {
    mismatches.push("prompt_modules");
  }
  if (Number(revision.source_registry_count || 0) !== Number(currentRevision.source_registry_count || 0)) {
    mismatches.push("source_registry_count");
  }
  if (!objectsEqual(revision.source_registry_enablement_counts, currentRevision.source_registry_enablement_counts)) {
    mismatches.push("source_registry_enablement_counts");
  }

  return unique(mismatches);
}

function arraysEqual(left, right) {
  const leftItems = Array.isArray(left) ? left : [];
  const rightItems = Array.isArray(right) ? right : [];
  return leftItems.length === rightItems.length && leftItems.every((item, index) => item === rightItems[index]);
}

function objectsEqual(left, right) {
  return JSON.stringify(left || {}) === JSON.stringify(right || {});
}

function hasRankCoverage(items, start, end) {
  if (!Array.isArray(items)) {
    return false;
  }
  const ranks = new Set(
    items
      .map((item) => Number(item?.rank))
      .filter((rank) => Number.isInteger(rank))
  );
  for (let rank = start; rank <= end; rank += 1) {
    if (!ranks.has(rank)) {
      return false;
    }
  }
  return true;
}

function evidenceAssetExists(localPath, options = {}) {
  const normalized = normalizeAssetPath(localPath);
  if (!normalized) {
    return false;
  }
  if (options.existingAssetPaths) {
    return options.existingAssetPaths.has(normalized);
  }
  if (!options.rootDir) {
    return true;
  }

  return fs.existsSync(path.join(options.rootDir, "docs", ...normalized.split("/")));
}

function normalizeAssetPath(value) {
  const text = String(value || "").trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (!text || text.includes("..")) {
    return "";
  }
  return text;
}

function isStrictCoverageReport(report) {
  const date = String(report?.report_date || "");
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= STRICT_COVERAGE_EFFECTIVE_DATE;
}

function isXStatusUrl(value) {
  try {
    const url = new URL(String(value || ""));
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    return (host === "x.com" || host === "twitter.com") && /\/[^/]+\/status\/\d+/i.test(url.pathname);
  } catch {
    return false;
  }
}

function normalizeUrl(value) {
  return normalizeUrlIdentity(value);
}

function normalizeQualityIssue(issue) {
  if (!issue || typeof issue !== "object") {
    return null;
  }
  const code = String(issue.code || issue.error_code || "").trim();
  const section = String(issue.section || "").trim();
  if (!code || !section) {
    return null;
  }
  const normalized = {
    code,
    error_code: String(issue.error_code || code).trim(),
    section,
    message: String(issue.message || "").trim() || `${section} is degraded.`,
    remediation: String(issue.remediation || "").trim()
  };
  if (issue.severity !== undefined) {
    normalized.severity = String(issue.severity || "").trim() || "degraded";
  }
  if (issue.source && typeof issue.source === "object") {
    const source = {};
    const sourceName = String(issue.source.name || "").trim();
    const sourceUrl = String(issue.source.url || "").trim();
    if (sourceName) {
      source.name = sourceName;
    }
    if (/^https?:\/\//i.test(sourceUrl)) {
      source.url = sourceUrl;
    }
    if (Object.keys(source).length > 0) {
      normalized.source = source;
    }
  }

  for (const key of [
    "source_name",
    "source_url",
    "source_status",
    "fallback_kind",
    "retry_attempts_exhausted",
    "stage_id",
    "count",
    "minimum",
    "candidates_found",
    "audit_sources",
    "audit_source_minimum",
    "has_rank_coverage",
    "has_follow_builders_x",
    "has_x_observation",
    "blocked_count",
    "total_sources",
    "blocked_ratio",
    "checked_count",
    "no_signal_count",
    "skipped_count",
    "parsed_minimum",
    "weak_sources",
    "affected_groups",
    "group_summaries",
    "missing_sources",
    "missing_model_releases",
    "revision_mismatches",
    "missing_rules",
    "violations"
  ]) {
    if (issue[key] !== undefined) {
      normalized[key] = issue[key];
    }
  }

  return normalized;
}

function uniqueQualityIssues(issues) {
  const seen = new Set();
  const uniqueIssues = [];
  for (const issue of issues.map(normalizeQualityIssue).filter(Boolean)) {
    const key = `${issue.error_code}|${issue.code}|${issue.section}|${JSON.stringify(issue.missing_sources || issue.missing_model_releases || issue.revision_mismatches || issue.violations || [])}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    uniqueIssues.push(issue);
  }
  return uniqueIssues;
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}
