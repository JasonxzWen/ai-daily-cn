import { PublisherError } from "./errors.js";

const BLOCKED_SOURCE_STATUSES = new Set(["blocked", "skipped_missing_token", "skipped_missing_base_url"]);

export const SECTION_MINIMUMS = {
  github_trending: 10,
  hot_blogs: 3,
  projects: 3,
  builder_observations: 3
};

const CANDIDATE_SECTION_MAP = {
  github_trending: "github_trending",
  hot_blog: "hot_blogs",
  project: "projects",
  builder_observation: "builder_observations"
};

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

export function findPublishQualityIssues(report) {
  const issues = [];
  const builderCount = sectionCount(report, "builder_observations");
  const builderMinimum = SECTION_MINIMUMS.builder_observations;
  const builderSources = report?.source_audit?.builder_sources;

  if (groupHasBlockingSignal(builderSources) && builderCount < builderMinimum) {
    issues.push({
      code: "builder_coverage_below_minimum",
      section: "builder_observations",
      count: builderCount,
      minimum: builderMinimum,
      blocked_reason: String(builderSources?.blocked_reason || "").trim(),
      sources: Array.isArray(builderSources?.sources) ? builderSources.sources : []
    });
  }

  return issues;
}

export function requirePublishableQuality(report) {
  const issues = findPublishQualityIssues(report);
  if (issues.length === 0) {
    return;
  }

  const issue = issues[0];
  throw new PublisherError(
    "builder_coverage_gate_failed",
    `Builder observations below publish minimum: ${issue.count}/${issue.minimum}; blocked Builder sources cannot be published as complete coverage.`,
    {
      issues,
      remediation: "Add reliable original Builder fallback candidates until builder_observations reaches the minimum, or fix the blocked Builder source before publishing."
    }
  );
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

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}
