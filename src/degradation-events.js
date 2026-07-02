const AUDIT_GROUP_CONTRACTS = {
  github_trending: { code: "github_trending_blocked", section: "github_trending" },
  huggingface_trending: { code: "huggingface_trending_blocked", section: "huggingface_trending" },
  builder_sources: { code: "builder_sources_blocked", section: "builder_observations" },
  china_ai_sources: { code: "china_ai_sources_blocked", section: "hot_blogs" },
  content_sources: { code: "content_sources_blocked", section: "hot_blogs" },
  search_sources: { code: "search_sources_blocked", section: "community_leads" }
};

export function createPublicDegradationEvent(input = {}) {
  const auditGroup = String(input.audit_group || input.auditGroup || "").trim();
  const contract = AUDIT_GROUP_CONTRACTS[auditGroup] || {};
  const section = String(input.section || contract.section || "").trim();
  const code = String(input.code || contract.code || "").trim();
  if (!code || !section) {
    return null;
  }

  const event = {
    code,
    error_code: String(input.error_code || input.errorCode || "quality_degraded").trim() || "quality_degraded",
    section,
    severity: String(input.severity || "degraded").trim() || "degraded"
  };

  const source = normalizeEventSource(input.source || {
    name: input.source_name || input.sourceName,
    url: input.source_url || input.sourceUrl
  });
  if (source) {
    event.source = source;
  }

  event.message = String(input.message || `${section} coverage is degraded and should be disclosed in the public report.`).trim();
  event.remediation = String(
    input.remediation ||
    "Keep the report publishable when facts are verified, but disclose the affected section and fix the source path in a follow-up."
  ).trim();
  return event;
}

export function degradationEventFromAuditGroup({ auditGroup, group, code, section } = {}) {
  const source = firstBlockedSource(group) || firstAuditSource(group);
  return createPublicDegradationEvent({
    audit_group: auditGroup,
    code,
    section,
    source
  });
}

export function sanitizePublicDegradationEvent(issue = {}) {
  const event = createPublicDegradationEvent(issue);
  if (!event) {
    return null;
  }
  const publicEvent = {
    code: event.code,
    section: event.section,
    severity: event.severity,
    message: event.message
  };
  if (event.source) {
    publicEvent.source = event.source;
  }
  return publicEvent;
}

function firstBlockedSource(group = {}) {
  return (Array.isArray(group.sources) ? group.sources : [])
    .find((source) => String(source?.status || "").toLowerCase() === "blocked");
}

function firstAuditSource(group = {}) {
  return (Array.isArray(group.sources) ? group.sources : [])
    .find((source) => source?.name || source?.url);
}

function normalizeEventSource(source = {}) {
  if (!source || typeof source !== "object") {
    return null;
  }
  const name = String(source.name || "").trim();
  const url = String(source.url || "").trim();
  const result = {};
  if (name) {
    result.name = name;
  }
  if (/^https?:\/\//i.test(url)) {
    result.url = url;
  }
  return Object.keys(result).length > 0 ? result : null;
}
