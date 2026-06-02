import fs from "node:fs";
import path from "node:path";
import { PublisherError } from "./errors.js";
import { AUTOMATION_REVISION_RULES } from "./automation-revision.js";

const BLOCKED_SOURCE_STATUSES = new Set(["blocked", "skipped_missing_token", "skipped_missing_base_url"]);
const SOURCE_AVAILABLE_STATUSES = new Set(["checked", "no_signal"]);

export const STRICT_COVERAGE_EFFECTIVE_DATE = "2026-06-02";

export const SECTION_MINIMUMS = {
  main_items: 8,
  github_trending: 10,
  hot_blogs: 3,
  projects: 3,
  builder_observations: 3
};

export const CONTENT_UNIT_MINIMUM = 18;
export const STRICT_CONTENT_SOURCE_MINIMUM = 50;
export const STRICT_SOURCE_REGISTRY_MINIMUM = 60;
export const STRICT_GITHUB_TRENDING_SOURCE_MINIMUM = 10;
export const STRICT_BUILDER_SOURCE_MINIMUM = 3;

const CANDIDATE_SECTION_MAP = {
  main_item: "main_items",
  github_trending: "github_trending",
  hot_blog: "hot_blogs",
  project: "projects",
  builder_observation: "builder_observations"
};

const FIXED_SOURCE_REQUIREMENTS = [
  {
    code: "fixed_source_a_open_aggregators",
    label: "A. open-source aggregators",
    sources: [
      { groups: ["builder_sources"], label: "follow-builders X feed", name: /follow-builders x feed/i, url: /zarazhangrui\/follow-builders/i },
      { groups: ["content_sources"], label: "ML Papers of the Week", name: /ML Papers of the Week/i },
      { groups: ["content_sources"], label: "HelloGitHub", name: /HelloGitHub/i },
      { groups: ["content_sources"], label: "RuanYF Weekly", name: /RuanYF Weekly/i }
    ]
  },
  {
    code: "fixed_source_b_official_labs",
    label: "B. official AI lab/blog sources",
    sources: [
      { groups: ["content_sources"], label: "OpenAI Blog RSS", name: /OpenAI Blog RSS/i },
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
      { groups: ["content_sources"], label: "HNRSS Frontpage", name: /HNRSS Frontpage/i }
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
      { groups: ["content_sources"], label: "Hacker News Topstories API", name: /Hacker News Topstories API/i },
      { groups: ["content_sources"], label: "Hugging Face Daily Papers", name: /Hugging Face Daily Papers/i },
      { groups: ["content_sources"], label: "Papers with Code API", name: /Papers with Code API/i },
      { groups: ["content_sources"], label: "Reddit r/MachineLearning", name: /Reddit r\/MachineLearning/i },
      { groups: ["github_trending"], label: "GitHub Trending daily", name: /GitHub Trending daily/i }
    ]
  },
  {
    code: "fixed_source_f_quality_aggregators",
    label: "F. high-quality AI aggregators",
    sources: [
      { groups: ["content_sources"], label: "Smol AI News", name: /Smol AI News/i },
      { groups: ["content_sources"], label: "AI News Archive", name: /AI News Archive/i },
      { groups: ["content_sources"], label: "Latent.Space", name: /Latent\.Space/i },
      { groups: ["content_sources"], label: "Ben's Bites", name: /Ben's Bites/i }
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

  addSourceDegradation({
    group: audit.github_trending,
    reason: "github_trending_blocked",
    section: "github_trending",
    currentCount: sectionCount(report, "github_trending"),
    reasons,
    affectedSections
  });
  addSourceDegradation({
    group: audit.content_sources,
    reason: "content_sources_blocked",
    section: "hot_blogs",
    currentCount: sectionCount(report, "hot_blogs"),
    reasons,
    affectedSections
  });
  addSourceDegradation({
    group: audit.builder_sources,
    reason: "builder_sources_blocked",
    section: "builder_observations",
    currentCount: sectionCount(report, "builder_observations"),
    reasons,
    affectedSections
  });

  addSelectionDegradation({ report, candidatePool, reasons, affectedSections });

  if (explicit?.status === "degraded") {
    reasons.push(...explicit.reasons);
    affectedSections.push(...explicit.affected_sections);
  }

  const degradedReasons = unique(reasons.filter((reason) => reason !== "low_signal"));
  const status = degradedReasons.length > 0 ? "degraded" : "ok";
  const finalReasons = status === "degraded"
    ? unique([...reasons, ...degradedReasons])
    : unique([...(explicit?.reasons || []), ...lowSignalReasons(report)]);

  return {
    status,
    reasons: finalReasons,
    affected_sections: unique(affectedSections),
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
    public_note: String(value.public_note || "").trim()
  };
}

export function findPublishQualityIssues(report, options = {}) {
  const issues = [];
  const reasons = new Set(report?.quality_status?.reasons || []);
  const mainItemCount = sectionCount(report, "main_items");
  const contentUnitCount = countContentUnits(report);
  const mainItemMinimum = SECTION_MINIMUMS.main_items;
  const builderCount = sectionCount(report, "builder_observations");
  const builderMinimum = SECTION_MINIMUMS.builder_observations;
  const builderSources = report?.source_audit?.builder_sources;

  if (reasons.has("main_items_selection_degraded") && mainItemCount < mainItemMinimum) {
    issues.push({
      error_code: "main_items_coverage_gate_failed",
      code: "main_items_below_minimum",
      section: "main_items",
      count: mainItemCount,
      minimum: mainItemMinimum,
      remediation: "Use the candidate pool to include 8-12 high-signal main_items, or mark weak candidates as excluded so the selection degradation reason disappears."
    });
  }

  if (reasons.has("content_units_selection_degraded") && contentUnitCount < CONTENT_UNIT_MINIMUM) {
    issues.push({
      error_code: "content_units_coverage_gate_failed",
      code: "content_units_below_minimum",
      section: "content_units",
      count: contentUnitCount,
      minimum: CONTENT_UNIT_MINIMUM,
      remediation: "Include enough qualified candidates across main_items, GitHub Trending, projects, blogs, Builder observations, and community leads, or record why candidates were excluded."
    });
  }

  if (groupHasBlockingSignal(builderSources) && builderCount < builderMinimum) {
    issues.push({
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

  issues.push(...strictDailyCoverageIssues(report, options));

  return issues;
}

export function requirePublishableQuality(report, options = {}) {
  const issues = findPublishQualityIssues(report, options);
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
    ...strictSourceAuditIssues(report),
    ...strictBuilderIssues(report),
    ...strictEvidenceIssues(report, options),
    ...strictModelReleaseIssues(report)
  ];
}

function strictAutomationRevisionIssues(report, options = {}) {
  const revision = report?.self_check?.automation_revision;
  const missingRules = AUTOMATION_REVISION_RULES.filter((rule) => !Array.isArray(revision?.rules) || !revision.rules.includes(rule));
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
        message: "self_check.automation_revision is missing, stale, or does not prove the fixed source checklist rules were active.",
        remediation: "Regenerate the report through report:write on current main so it records git commit, prompt modules, source registry count, and active hardening rules."
      }
    ];
  }

  return [];
}

function strictSectionIssues(report) {
  const issues = [];

  for (const [section, minimum] of Object.entries(SECTION_MINIMUMS)) {
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

function strictBuilderIssues(report) {
  const builderSources = report?.source_audit?.builder_sources;
  const builderSourceCount = Array.isArray(builderSources?.sources) ? builderSources.sources.length : 0;
  const hasFollowBuildersX = hasAuditSource(report, {
    groups: ["builder_sources"],
    name: /follow-builders x feed/i,
    url: /feed-x\.json/i
  });
  const hasXObservation = (report?.builder_observations || []).some((item) => isXStatusUrl(item?.url));

  if (builderSourceCount < STRICT_BUILDER_SOURCE_MINIMUM || !hasFollowBuildersX || !hasXObservation) {
    return [
      {
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
      }
    ];
  }

  return [];
}

function strictEvidenceIssues(report, options = {}) {
  const assets = Array.isArray(report?.evidence_assets) ? report.evidence_assets : [];
  const itemUrls = new Set(
    ["main_items", "model_releases", "hot_blogs", "projects"]
      .flatMap((section) => (Array.isArray(report?.[section]) ? report[section] : []))
      .map((item) => normalizeUrl(item?.url))
      .filter(Boolean)
  );
  const linkedLocalAssets = assets.filter((asset) => {
    return asset?.local_path && itemUrls.has(normalizeUrl(asset?.source_url)) && evidenceAssetExists(asset.local_path, options);
  });

  if (linkedLocalAssets.length === 0) {
    return [
      {
        error_code: "evidence_assets_gate_failed",
        code: "linked_local_evidence_asset_missing",
        section: "evidence_assets",
        count: linkedLocalAssets.length,
        minimum: 1,
        message: "At least one report item must carry a local evidence image asset linked to its source URL.",
        remediation: "Attach a real source figure/screenshot/table image to a matching main/model/blog/project item, or keep the report unpublished."
      }
    ];
  }

  return [];
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

function addSourceDegradation({ group, reason, section, currentCount, reasons, affectedSections }) {
  if (!groupHasBlockingSignal(group)) {
    return;
  }
  if (currentCount >= (SECTION_MINIMUMS[section] || 1)) {
    return;
  }
  reasons.push(reason);
  affectedSections.push(section);
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

function groupHasBlockingSignal(group) {
  if (!group || typeof group !== "object") {
    return false;
  }
  if (String(group.blocked_reason || "").trim()) {
    return true;
  }
  return Array.isArray(group.sources) && group.sources.some((source) => BLOCKED_SOURCE_STATUSES.has(source?.status));
}

function sectionCount(report, section) {
  const value = report?.[section];
  return Array.isArray(value) ? value.length : 0;
}

function countContentUnits(report) {
  return [
    "main_items",
    "model_releases",
    "hot_blogs",
    "projects",
    "builder_observations",
    "community_leads",
    "github_trending"
  ].reduce((sum, section) => sum + sectionCount(report, section), 0);
}

function lowSignalReasons(report) {
  const audit = report?.source_audit || {};
  const checkedNoSignal = ["github_trending", "content_sources", "builder_sources"].some((groupName) => {
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
    if (reasons.includes("content_sources_blocked") && reasons.includes("builder_sources_blocked")) {
      return explicitNote || "Content source and Builder source coverage is degraded; those sections may be incomplete.";
    }
    if (reasons.includes("content_sources_blocked")) {
      return explicitNote || "Content source coverage is degraded; some sections may be incomplete.";
    }
    if (reasons.includes("builder_sources_blocked")) {
      return explicitNote || "Builder source coverage is degraded; Builder observations may be incomplete.";
    }
    return explicitNote || "Some discovery coverage is degraded; this report may be incomplete.";
  }
  return explicitNote || "Core discovery checks completed without blocking degradation.";
}

function hasAuditSource(report, requirement) {
  const statuses = new Set(requirement.statuses || SOURCE_AVAILABLE_STATUSES);
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
  if (!currentRevision) {
    return [];
  }
  if (!revision) {
    return ["missing"];
  }

  const mismatches = [];
  const currentGitCommit = String(currentRevision.git_commit || "");
  if (!/^[0-9a-f]{40}$/i.test(currentGitCommit)) {
    mismatches.push("current_git_commit_unavailable");
  } else if (String(revision.git_commit || "") !== currentGitCommit) {
    mismatches.push("git_commit");
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

  return mismatches;
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
  try {
    const url = new URL(String(value || ""));
    url.hash = "";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    return url.toString().replace(/\/$/, "");
  } catch {
    return String(value || "").trim().toLowerCase().replace(/^http:/, "https:").replace(/\/$/, "");
  }
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}
