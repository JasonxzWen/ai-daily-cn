import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv/dist/2020.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(__dirname, "..");
const DEFAULT_KNOWLEDGE_DIR = path.join(DEFAULT_ROOT, "knowledge", "official-blogs");
const SCHEMA_PATH = path.join(DEFAULT_ROOT, "schemas", "official-blog.schema.json");
const SUPPORTED_COMPANIES = new Set(["openai", "anthropic"]);
const MAX_DIGEST_LENGTH = 1200;
const TRIAGE_OPENING_PARAGRAPH_LIMIT = 2;
const TRIAGE_OPENING_CHAR_LIMIT = 1200;
const OFFICIAL_BLOG_IMPORTANCE_VALUES = new Set(["foundational", "major", "notable", "reference"]);
const OFFICIAL_BLOG_CONTENT_TYPES = new Set([
  "research",
  "engineering_note",
  "best_practice",
  "product_practice",
  "safety_policy",
  "model_release_context"
]);
const OFFICIAL_BLOG_MATCHED_CRITERIA = new Set([
  "new_product",
  "new_model",
  "engineering_practice",
  "harness_engineering",
  "agent_workflow",
  "eval_methodology",
  "safety_engineering"
]);
const OFFICIAL_BLOG_RECORD_ID_RE = /^(openai|anthropic)-[a-z0-9][a-z0-9-]*-[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const OFFICIAL_BLOG_TOPIC_ID_RE = /^[a-z0-9][a-z0-9_:-]*$/;
const REPORT_ITEM_SECTIONS = [
  "main_items",
  "hot_blogs",
  "official_org_updates",
  "model_releases",
  "projects",
  "github_trending",
  "builder_observations",
  "community_leads",
  "daily_tracking",
  "chinese_media_dynamics"
];
const REPORT_ITEM_URL_FIELDS = [
  "url",
  "source_url",
  "canonical_url",
  "primary_url",
  "article_url"
];

const TRACKING_PARAMS = new Set([
  "fbclid",
  "gclid",
  "igshid",
  "mc_cid",
  "mc_eid",
  "ref",
  "source"
]);

export const OFFICIAL_BLOG_ADMISSION_POLICY = {
  version: "official-blog-admission-v1",
  scope: "Curated OpenAI and Anthropic official blogs with durable product, model, technical-practice, harness, agent workflow, eval, safety-engineering, or implementation knowledge value.",
  first_pass: {
    input_fields: ["title_original", "opening_preview"],
    opening_paragraph_limit: TRIAGE_OPENING_PARAGRAPH_LIMIT,
    opening_char_limit: TRIAGE_OPENING_CHAR_LIMIT,
    rule: "Use only the title plus opening preview or first paragraphs for first-pass triage."
  },
  include_criteria: [
    {
      id: "new_product",
      description: "New product, API, developer platform primitive, or product surface with durable implementation value."
    },
    {
      id: "new_model",
      description: "New model release with capabilities, evals, safety notes, integration guidance, or deployment constraints."
    },
    {
      id: "engineering_practice",
      description: "Reusable architecture, workflow, implementation pattern, observability, permission, sandbox, or rollout practice."
    },
    {
      id: "harness_engineering",
      description: "Harness, long-running-agent environment, regression, isolation, or execution-management practice."
    },
    {
      id: "agent_workflow",
      description: "Agent, multi-agent, tool-use, routing, MCP, computer-use, or orchestration workflow guidance."
    },
    {
      id: "eval_methodology",
      description: "Evaluation, benchmark, measurement, regression, or test methodology with reusable engineering value."
    },
    {
      id: "safety_engineering",
      description: "Safety, alignment, containment, permission, blast-radius, or deployment-constraint engineering practice."
    }
  ],
  exclude_categories: [
    {
      id: "company_news",
      description: "Ordinary partnership, customer adoption, collaboration, sales, or company-news update without concrete reusable product, model, or engineering implementation detail."
    },
    {
      id: "business_update",
      description: "Funding, hiring, event, award, regional expansion, market availability, or broad enterprise productivity announcement."
    },
    {
      id: "low_knowledge_value",
      description: "Preview does not show a durable technical, product, model, engineering, eval, or safety-methodology increment."
    }
  ],
  review_rule: "Use needs_review, not include, when a customer or partnership story hints at concrete architecture, evals, permissions, observability, rollout controls, agent workflow, or similar implementation detail but the opening preview is not enough to prove durable knowledge value.",
  include: [
    "new products or developer platform primitives",
    "new model releases with capability, evaluation, safety, or integration guidance",
    "technical practices such as harness engineering, evals, context engineering, tool use, MCP, computer use, memory, sandboxing, observability, and multi-agent workflows",
    "engineering implementation write-ups with reusable architecture, workflow, checklist, or failure-mode lessons",
    "safety or alignment engineering only when methods, frameworks, deployment constraints, or evaluation practices are explained"
  ],
  exclude: [
    "ordinary partnerships or customer adoption announcements without implementation detail",
    "funding, hiring, events, awards, market expansion, regional availability, or sales copy",
    "policy statements or company news without reusable model, product, engineering, or safety methodology",
    "customer stories that only say a company adopted OpenAI or Claude",
    "business-news previews that use broad workflow, productivity, employee, customer, or AI-tools language without concrete reusable engineering detail"
  ],
  review: "First pass should use only the title plus opening preview/first paragraphs, not the complete article text. Use needs_review when a partnership or customer story hints at concrete architecture, evals, permissions, observability, agent workflow, or rollout controls but the opening preview is not enough to prove durable knowledge value."
};

export async function loadOfficialBlogKnowledge(options = {}) {
  const rootDir = options.rootDir || DEFAULT_ROOT;
  const knowledgeDir = options.knowledgeDir || path.join(rootDir, "knowledge", "official-blogs");
  const records = [];
  const files = await collectJsonFiles(knowledgeDir);

  for (const file of files) {
    const raw = JSON.parse(await fs.readFile(file, "utf8"));
    records.push(normalizeOfficialBlogRecord(raw, { file }));
  }

  assertUniqueRecords(records);
  const index = buildOfficialBlogKnowledgeIndex(records);
  const validation = await validateOfficialBlogKnowledge(index);
  if (!validation.valid) {
    throw new Error(`official blog knowledge schema validation failed: ${validation.errors.map((error) => `${error.path} ${error.message}`).join("; ")}`);
  }
  return validation.value;
}

export function toPublicOfficialBlogKnowledge(index = {}, options = {}) {
  const reportDatesByUrl = buildRelatedReportDateLookup(options.reports);
  const records = Array.isArray(index.records)
    ? index.records.map((record) => publicOfficialBlogRecord(record, { reportDatesByUrl }))
    : [];
  const companies = uniqueSorted(records.map((record) => record.company));
  const topics = uniqueSorted(records.flatMap((record) => record.topics || []));
  const byCompany = { anthropic: 0, openai: 0 };
  const byImportance = {};
  for (const record of records) {
    byCompany[record.company] = (byCompany[record.company] || 0) + 1;
    byImportance[record.importance] = (byImportance[record.importance] || 0) + 1;
  }

  return {
    schema_version: 1,
    generated_at: String(options.generatedAt || index.generated_at || ""),
    curation_scope: OFFICIAL_BLOG_ADMISSION_POLICY.scope,
    companies,
    topics,
    stats: {
      total_records: records.length,
      by_company: byCompany,
      by_importance: byImportance
    },
    records
  };
}

export function buildRelatedReportDateLookup(reports = []) {
  const byUrl = new Map();
  for (const report of Array.isArray(reports) ? reports : []) {
    const reportDate = String(report?.report_date || "").trim();
    if (!reportDate) {
      continue;
    }
    for (const url of officialBlogCandidateUrlsFromReport(report)) {
      const normalized = safeNormalizeOfficialBlogUrl(url);
      if (!normalized) {
        continue;
      }
      const dates = byUrl.get(normalized) || new Set();
      dates.add(reportDate);
      byUrl.set(normalized, dates);
    }
  }
  return new Map([...byUrl.entries()].map(([url, dates]) => [url, uniqueSorted([...dates])]));
}

export function normalizeOfficialBlogUrl(value) {
  const url = new URL(String(value || ""));
  url.protocol = url.protocol.toLowerCase();
  url.hostname = url.hostname.toLowerCase();
  url.hash = "";

  for (const key of [...url.searchParams.keys()]) {
    const lower = key.toLowerCase();
    if (lower.startsWith("utm_") || TRACKING_PARAMS.has(lower)) {
      url.searchParams.delete(key);
    }
  }

  const sortedParams = [...url.searchParams.entries()].sort(([left], [right]) => left.localeCompare(right));
  url.search = "";
  for (const [key, paramValue] of sortedParams) {
    url.searchParams.append(key, paramValue);
  }

  if (url.pathname.length > 1) {
    url.pathname = url.pathname.replace(/\/+$/g, "");
  }
  return url.toString();
}

export function triageOfficialBlogPreview(preview = {}) {
  const title = String(preview.title || "");
  const excerpt = officialBlogOpeningPreview(preview);
  const text = normalizeText(`${title} ${excerpt}`);
  const matchedCriteria = [];
  const suggestedTopics = [];

  addIf(hasAny(text, [
    "codex",
    "claude code",
    "agent sdk",
    "responses api",
    "structured outputs",
    "model context protocol",
    "mcp connector",
    "computer use",
    "new product",
    "new developer product",
    "developer platform",
    "developer platform primitive",
    "new api primitive"
  ]), matchedCriteria, "new_product");
  addIf(hasAny(text, ["new model", "model release", "system card", "model spec", "capability", "benchmark", "evals"]), matchedCriteria, "new_model");
  addIf(hasAny(text, ["best practice", "pattern", "architecture", "implementation", "workflow", "orchestration", "permissions", "observability", "sandbox", "tool use", "context engineering"]), matchedCriteria, "engineering_practice");
  addIf(hasAny(text, ["harness", "long running agent", "long horizon", "environment management"]), matchedCriteria, "harness_engineering");
  addIf(hasAny(text, ["agent workflow", "multi agent", "multi-agent", "agentic", "routing", "tools", "claude code"]), matchedCriteria, "agent_workflow");
  addIf(hasAny(text, ["eval", "evaluation", "measure", "test against", "benchmark", "regression"]), matchedCriteria, "eval_methodology");
  addIf(hasAny(text, ["safety", "alignment", "containment", "permissions", "blast radius", "deployment constraint"]), matchedCriteria, "safety_engineering");

  addTopicIf(text, suggestedTopics, "agent", ["agent", "agentic", "claude code", "codex"]);
  addTopicIf(text, suggestedTopics, "coding_agent", ["claude code", "codex", "software engineering agent"]);
  addTopicIf(text, suggestedTopics, "harness_engineering", ["harness", "long running agent", "environment management"]);
  addTopicIf(text, suggestedTopics, "evals", ["eval", "evaluation", "benchmark", "measure"]);
  addTopicIf(text, suggestedTopics, "mcp", ["mcp", "model context protocol"]);
  addTopicIf(text, suggestedTopics, "tool_use", ["tool use", "tools", "computer use", "permissions"]);
  addTopicIf(text, suggestedTopics, "context_engineering", ["context engineering", "long context"]);
  addTopicIf(text, suggestedTopics, "structured_outputs", ["structured outputs", "json schema"]);
  addTopicIf(text, suggestedTopics, "safety_engineering", ["safety", "alignment", "containment", "blast radius"]);

  const companyNews = hasAny(text, [
    "partnership",
    "customer",
    "customers",
    "adoption",
    "adopted",
    "expand strategic",
    "collaboration",
    "funding",
    "hiring",
    "event",
    "conference",
    "award",
    "regional",
    "market expansion",
    "bring ai to more employees",
    "leaders discussed"
  ]) || hasCustomerCaseFraming(text);

  const implementationDetail = hasConcreteImplementationDetail(text);

  if (companyNews && !implementationDetail) {
    return {
      admission: "exclude",
      reason: "Company news or partnership/customer announcement without concrete reusable product, model, or engineering implementation detail in the opening preview.",
      matched_criteria: [],
      excluded_as: "company_news",
      knowledge_value: "none",
      suggested_topics: []
    };
  }

  if (companyNews && matchedCriteria.length > 0) {
    return {
      admission: "needs_review",
      reason: "Customer or partnership framing hints at concrete technical implementation detail in the opening preview; read beyond the preview before admitting.",
      matched_criteria: matchedCriteria,
      excluded_as: "",
      knowledge_value: "notable",
      suggested_topics: suggestedTopics
    };
  }

  if (matchedCriteria.length > 0) {
    return {
      admission: "include",
      reason: "Preview contains concrete product, model, engineering, eval, agent workflow, or safety-engineering knowledge value.",
      matched_criteria: matchedCriteria,
      excluded_as: "",
      knowledge_value: matchedCriteria.includes("harness_engineering") || matchedCriteria.includes("agent_workflow") ? "major" : "notable",
      suggested_topics: suggestedTopics
    };
  }

  return {
    admission: "exclude",
    reason: "No durable technical, product, model, engineering, eval, or safety-methodology increment is visible in the preview.",
    matched_criteria: [],
    excluded_as: "low_knowledge_value",
    knowledge_value: "none",
    suggested_topics: []
  };
}

export function createOfficialBlogPreviewFeed(input = "", options = {}) {
  const parsed = officialBlogPreviewRawEntries(input);
  const optionCompany = normalizeOfficialBlogCompany(options.company);
  const candidates = [];
  const invalidEntries = [...parsed.invalid_entries];

  for (const [index, rawEntry] of parsed.entries.entries()) {
    try {
      candidates.push(normalizeOfficialBlogPreviewFeedEntry(rawEntry, {
        index,
        company: optionCompany,
        sourceLabel: options.sourceLabel || options.source_label
      }));
    } catch (error) {
      invalidEntries.push({
        index,
        title_original: String(rawEntry?.title_original || rawEntry?.title || "").trim(),
        canonical_url: String(rawEntry?.canonical_url || rawEntry?.canonicalUrl || rawEntry?.url || rawEntry?.link || rawEntry?.href || "").trim(),
        reason: error.message
      });
    }
  }

  return {
    schema_version: 1,
    kind: "official_blog_preview_feed",
    visibility: "internal",
    company: optionCompany,
    report_date: String(options.reportDate || options.report_date || ""),
    generated_at: String(options.generatedAt || options.generated_at || new Date().toISOString()),
    source_label: String(options.sourceLabel || options.source_label || "").trim(),
    admission_policy: officialBlogAdmissionPolicyArtifact(),
    stats: {
      total_entries: parsed.entries.length + parsed.invalid_entries.length,
      candidates: candidates.length,
      invalid_entries: invalidEntries.length
    },
    candidates,
    invalid_entries: invalidEntries
  };
}

export function createOfficialBlogKnowledgeDrafts(input = {}, options = {}) {
  const entries = officialBlogReviewedEntries(input);
  const existingByUrl = existingOfficialBlogRecordByUrl(options.existingIndex);
  const existingIds = new Set((Array.isArray(options.existingIndex?.records) ? options.existingIndex.records : []).map((record) => record.id));
  const seenByUrl = new Map();
  const seenById = new Map();
  const records = [];
  const invalidEntries = [];

  for (const [index, rawEntry] of entries.entries()) {
    let record;
    try {
      record = normalizeOfficialBlogKnowledgeDraftEntry(rawEntry, { index });
    } catch (error) {
      invalidEntries.push(officialBlogKnowledgeDraftInvalidEntry(rawEntry, index, error.message));
      continue;
    }

    if (existingByUrl.has(record.normalized_url)) {
      invalidEntries.push(officialBlogKnowledgeDraftInvalidEntry(rawEntry, index, `duplicate canonical_url already exists in official blog knowledge: ${record.canonical_url}`));
      continue;
    }
    if (existingIds.has(record.id)) {
      invalidEntries.push(officialBlogKnowledgeDraftInvalidEntry(rawEntry, index, `duplicate id already exists in official blog knowledge: ${record.id}`));
      continue;
    }
    if (seenByUrl.has(record.normalized_url)) {
      invalidEntries.push(officialBlogKnowledgeDraftInvalidEntry(rawEntry, index, `duplicate canonical_url in authored batch: ${record.canonical_url}`));
      continue;
    }
    if (seenById.has(record.id)) {
      invalidEntries.push(officialBlogKnowledgeDraftInvalidEntry(rawEntry, index, `duplicate id in authored batch: ${record.id}`));
      continue;
    }

    seenByUrl.set(record.normalized_url, record.id);
    seenById.set(record.id, record.normalized_url);
    records.push(record);
  }

  return {
    schema_version: 1,
    kind: "official_blog_knowledge_drafts",
    visibility: "internal",
    generated_at: String(options.generatedAt || options.generated_at || new Date().toISOString()),
    stats: {
      total_entries: entries.length,
      records: records.length,
      invalid_entries: invalidEntries.length
    },
    records,
    invalid_entries: invalidEntries
  };
}

export function createOfficialBlogRelationshipSuggestions(input = {}, options = {}) {
  const entries = officialBlogReviewedEntries(input);
  const existingRecords = Array.isArray(options.existingIndex?.records) ? options.existingIndex.records : [];
  const existingByUrl = existingOfficialBlogRecordByUrl(options.existingIndex);
  const maxSuggestions = Number.isFinite(Number(options.maxSuggestions)) ? Math.max(0, Number(options.maxSuggestions)) : 5;
  const suggestions = [];
  const duplicates = [];
  const invalidEntries = [];

  for (const [index, rawEntry] of entries.entries()) {
    let candidate;
    try {
      candidate = normalizeOfficialBlogRelationshipCandidate(rawEntry, { index });
    } catch (error) {
      invalidEntries.push(officialBlogRelationshipInvalidEntry(rawEntry, index, error.message));
      continue;
    }

    const existingRecord = existingByUrl.get(candidate.normalized_url);
    if (existingRecord) {
      duplicates.push({
        ...officialBlogRelationshipCandidateBase(candidate),
        duplicate_source: "existing_knowledge",
        duplicate_of: existingRecord.id || ""
      });
      continue;
    }

    const related = existingRecords
      .map((record) => officialBlogRelationshipMatch(candidate, record))
      .filter(Boolean)
      .sort((left, right) =>
        right.score - left.score ||
        String(right.published_at || "").localeCompare(String(left.published_at || "")) ||
        String(left.id || "").localeCompare(String(right.id || ""))
      )
      .slice(0, maxSuggestions);

    suggestions.push({
      ...officialBlogRelationshipCandidateBase(candidate),
      suggested_related_blog_ids: related
    });
  }

  return {
    schema_version: 1,
    kind: "official_blog_relationship_suggestions",
    visibility: "internal",
    generated_at: String(options.generatedAt || options.generated_at || new Date().toISOString()),
    stats: {
      total_entries: entries.length,
      candidates: suggestions.length,
      suggested_candidates: suggestions.filter((candidate) => candidate.suggested_related_blog_ids.length > 0).length,
      suggestions: suggestions.filter((candidate) => candidate.suggested_related_blog_ids.length > 0).length,
      suggested_links: suggestions.reduce((count, candidate) => count + candidate.suggested_related_blog_ids.length, 0),
      duplicates: duplicates.length,
      invalid_entries: invalidEntries.length
    },
    suggestions,
    duplicates,
    invalid_entries: invalidEntries
  };
}

export function createOfficialBlogKnowledgeContext(input = {}, options = {}) {
  const entries = officialBlogKnowledgeContextEntries(input);
  const existingRecords = Array.isArray(options.existingIndex?.records) ? options.existingIndex.records : [];
  const existingByUrl = existingOfficialBlogRecordByUrl(options.existingIndex);
  const existingById = new Map(existingRecords.map((record) => [String(record.id || ""), record]));
  const maxRecords = Number.isFinite(Number(options.limit ?? options.maxRecords ?? options.max_records))
    ? Math.max(0, Number(options.limit ?? options.maxRecords ?? options.max_records))
    : 8;
  const matchesById = new Map();
  const invalidEntries = [];
  let matchedEntries = 0;
  let unmatchedEntries = 0;

  for (const [index, rawEntry] of entries.entries()) {
    let entry;
    try {
      entry = normalizeOfficialBlogContextEntry(rawEntry, { index });
    } catch (error) {
      invalidEntries.push(officialBlogContextInvalidEntry(rawEntry, index, error.message));
      continue;
    }

    const entryMatches = [];
    const exactRecord = entry.normalized_url ? existingByUrl.get(entry.normalized_url) : null;
    if (exactRecord) {
      entryMatches.push(officialBlogContextMatch(entry, exactRecord, {
        score: 24,
        reasons: ["url_match"]
      }));
    }

    for (const relatedId of entry.related_blog_ids) {
      const record = existingById.get(relatedId);
      if (record) {
        entryMatches.push(officialBlogContextMatch(entry, record, {
          score: 18,
          reasons: ["explicit_related_blog_id"]
        }));
      }
    }

    for (const record of existingRecords) {
      const topicalMatch = officialBlogContextTopicalMatch(entry, record);
      if (topicalMatch) {
        entryMatches.push(topicalMatch);
      }
    }

    if (entryMatches.length === 0) {
      unmatchedEntries += 1;
      continue;
    }

    matchedEntries += 1;
    for (const match of entryMatches) {
      mergeOfficialBlogContextMatch(matchesById, entry, match);
    }
  }

  const records = [...matchesById.values()]
    .map(officialBlogContextRecord)
    .sort((left, right) =>
      right.score - left.score ||
      String(right.published_at || "").localeCompare(String(left.published_at || "")) ||
      String(left.id || "").localeCompare(String(right.id || ""))
    )
    .slice(0, maxRecords);

  return {
    schema_version: 1,
    kind: "official_blog_knowledge_context",
    visibility: "internal",
    generated_at: String(options.generatedAt || options.generated_at || new Date().toISOString()),
    admission_policy: officialBlogAdmissionPolicyArtifact(),
    stats: {
      total_entries: entries.length,
      matched_entries: matchedEntries,
      unmatched_entries: unmatchedEntries,
      matched_records: records.length,
      invalid_entries: invalidEntries.length
    },
    records,
    invalid_entries: invalidEntries
  };
}

export function createOfficialBlogReviewPacket(input = {}, options = {}) {
  const queue = officialBlogReviewPacketQueue(input, options);
  const feedInvalidCandidates = officialBlogReviewPacketFeedInvalidCandidates(input);
  const queueInvalidCandidates = (Array.isArray(queue.invalid_candidates) ? queue.invalid_candidates : [])
    .map(officialBlogReviewPacketInvalidCandidate);
  const invalidCandidates = [
    ...feedInvalidCandidates,
    ...queueInvalidCandidates
  ];
  const reviewItems = (Array.isArray(queue.review_queue) ? queue.review_queue : [])
    .map(officialBlogReviewPacketItem);
  const excludedItems = (Array.isArray(queue.excluded) ? queue.excluded : [])
    .map(officialBlogReviewPacketExcludedItem);
  const duplicates = (Array.isArray(queue.duplicates) ? queue.duplicates : [])
    .map(officialBlogReviewPacketDuplicateItem);

  return {
    schema_version: 1,
    kind: "official_blog_review_packet",
    visibility: "internal",
    report_date: String(options.reportDate || options.report_date || queue.report_date || ""),
    generated_at: String(options.generatedAt || options.generated_at || new Date().toISOString()),
    admission_policy: officialBlogAdmissionPolicyArtifact(),
    ai_review_contract: officialBlogAiReviewContract(),
    stats: {
      total_candidates: Number(queue.stats?.total_candidates || 0),
      review_items: reviewItems.length,
      included: reviewItems.filter((item) => item.deterministic_triage.decision === "include").length,
      needs_review: reviewItems.filter((item) => item.deterministic_triage.decision === "needs_review").length,
      excluded_items: excludedItems.length,
      duplicates: duplicates.length,
      invalid_candidates: invalidCandidates.length
    },
    review_items: reviewItems,
    excluded_items: excludedItems,
    duplicates,
    invalid_candidates: invalidCandidates
  };
}

export function createOfficialBlogReviewSession(input = {}, options = {}) {
  const reportDate = String(options.reportDate || options.report_date || input?.report_date || input?.reportDate || "");
  const generatedAt = String(options.generatedAt || options.generated_at || input?.generated_at || input?.generatedAt || new Date().toISOString());
  const feeds = officialBlogReviewSessionFeeds(input);
  if (feeds.length === 0) {
    throw new Error("official blog review session requires at least one feed");
  }

  const previewFeeds = feeds.map((feed, index) => {
    const feedText = officialBlogReviewSessionFeedText(feed, index);
    return createOfficialBlogPreviewFeed(feedText, {
      company: feed?.company,
      reportDate,
      generatedAt,
      sourceLabel: feed?.source_label || feed?.sourceLabel || feed?.source || `official-blog-feed-${index + 1}`
    });
  });
  const combinedPreviewFeed = combineOfficialBlogPreviewFeeds(previewFeeds, {
    reportDate,
    generatedAt
  });
  const intakeQueue = createOfficialBlogIntakeQueue(combinedPreviewFeed, {
    reportDate,
    generatedAt
  });
  const reviewPacket = createOfficialBlogReviewPacket({
    feed: combinedPreviewFeed,
    queue: intakeQueue
  }, {
    reportDate,
    generatedAt
  });

  return {
    schema_version: 1,
    kind: "official_blog_review_session",
    visibility: "internal",
    report_date: reportDate,
    generated_at: generatedAt,
    admission_policy: officialBlogAdmissionPolicyArtifact(),
    stats: {
      feeds: previewFeeds.length,
      candidates: combinedPreviewFeed.stats.candidates,
      invalid_entries: combinedPreviewFeed.stats.invalid_entries,
      review_items: reviewPacket.stats.review_items,
      included: reviewPacket.stats.included,
      needs_review: reviewPacket.stats.needs_review,
      excluded: intakeQueue.stats.excluded,
      duplicates: reviewPacket.stats.duplicates,
      invalid_candidates: reviewPacket.stats.invalid_candidates
    },
    preview_feeds: previewFeeds,
    combined_preview_feed: combinedPreviewFeed,
    intake_queue: intakeQueue,
    review_packet: reviewPacket
  };
}

export function createOfficialBlogReviewDecisions(input = {}, options = {}) {
  const packet = officialBlogReviewDecisionPacket(input);
  const reviewItems = Array.isArray(packet.review_items) ? packet.review_items : [];
  const reviewItemsById = new Map(reviewItems.map((item) => [String(item.intake_id || "").trim(), item]));
  const decisionEntries = officialBlogReviewDecisionEntries(input);
  const policy = officialBlogDecisionAdmissionPolicy(packet);
  const allowedCriteria = officialBlogDecisionAllowedCriteria(policy);
  const acceptedForAuthoring = [];
  const needsManualReview = [];
  const excluded = [];
  const invalidDecisions = [];
  const seenKnownIntakeIds = new Set();

  for (const [index, rawDecision] of decisionEntries.entries()) {
    const intakeId = String(rawDecision?.intake_id || rawDecision?.intakeId || rawDecision?.id || "").trim();
    if (!intakeId) {
      invalidDecisions.push(officialBlogReviewDecisionInvalid(rawDecision, index, "missing intake_id"));
      continue;
    }
    const packetItem = reviewItemsById.get(intakeId);
    if (!packetItem) {
      invalidDecisions.push(officialBlogReviewDecisionInvalid(rawDecision, index, `unknown intake_id: ${intakeId}`));
      continue;
    }
    if (seenKnownIntakeIds.has(intakeId)) {
      invalidDecisions.push(officialBlogReviewDecisionInvalid(rawDecision, index, `duplicate intake_id: ${intakeId}`));
      continue;
    }
    seenKnownIntakeIds.add(intakeId);

    const normalized = officialBlogNormalizeAiReviewDecision(rawDecision, {
      index,
      allowedCriteria
    });
    if (!normalized.ok) {
      invalidDecisions.push(officialBlogReviewDecisionInvalid(rawDecision, index, normalized.reason));
      continue;
    }

    const item = officialBlogReviewDecisionItem(packetItem, normalized.decision);
    if (item.final_decision === "include") {
      acceptedForAuthoring.push(item);
    } else if (item.final_decision === "needs_review") {
      needsManualReview.push(item);
    } else {
      excluded.push(item);
    }
  }

  for (const item of reviewItems) {
    const intakeId = String(item.intake_id || "").trim();
    if (intakeId && !seenKnownIntakeIds.has(intakeId)) {
      invalidDecisions.push(officialBlogReviewDecisionInvalid({ intake_id: intakeId }, null, `missing AI decision for intake_id: ${intakeId}`));
    }
  }

  return {
    schema_version: 1,
    kind: "official_blog_review_decisions",
    visibility: "internal",
    report_date: String(options.reportDate || options.report_date || packet.report_date || ""),
    generated_at: String(options.generatedAt || options.generated_at || new Date().toISOString()),
    admission_policy: policy,
    ai_review_contract: officialBlogAiReviewContract(),
    stats: {
      review_items: reviewItems.length,
      decisions_received: decisionEntries.length,
      accepted_for_authoring: acceptedForAuthoring.length,
      needs_manual_review: needsManualReview.length,
      excluded: excluded.length,
      invalid_decisions: invalidDecisions.length
    },
    accepted_for_authoring: acceptedForAuthoring,
    needs_manual_review: needsManualReview,
    excluded,
    invalid_decisions: invalidDecisions
  };
}

export function createOfficialBlogAuthoringBrief(input = {}, options = {}) {
  const reviewDecisions = officialBlogAuthoringBriefReviewDecisions(input);
  const relationshipSuggestions = officialBlogAuthoringBriefRelationshipSuggestions(input, options);
  const relationsByUrl = officialBlogAuthoringBriefRelationsByUrl(relationshipSuggestions);
  const accepted = Array.isArray(reviewDecisions.accepted_for_authoring) ? reviewDecisions.accepted_for_authoring : [];
  const manualReview = Array.isArray(reviewDecisions.needs_manual_review) ? reviewDecisions.needs_manual_review : [];
  const excluded = Array.isArray(reviewDecisions.excluded) ? reviewDecisions.excluded : [];
  const invalidDecisions = Array.isArray(reviewDecisions.invalid_decisions) ? reviewDecisions.invalid_decisions : [];
  const reportDate = String(options.reportDate || options.report_date || reviewDecisions.report_date || "");
  const authoringItems = accepted
    .filter((item) => normalizeOfficialBlogReviewDecision(item.final_decision) === "include")
    .map((item) => officialBlogAuthoringBriefItem(item, {
      relationsByUrl,
      reportDate
    }));

  return {
    schema_version: 1,
    kind: "official_blog_authoring_brief",
    visibility: "internal",
    report_date: reportDate,
    generated_at: String(options.generatedAt || options.generated_at || new Date().toISOString()),
    admission_policy: officialBlogAdmissionPolicyArtifact(),
    stats: {
      accepted_for_authoring: accepted.length,
      authoring_items: authoringItems.length,
      manual_review_required: manualReview.length,
      excluded: excluded.length,
      invalid_decisions: invalidDecisions.length
    },
    authoring_required_fields: officialBlogAuthoringRequiredFields(),
    authoring_items: authoringItems,
    manual_review_required: manualReview.map(officialBlogAuthoringBriefDecisionSummary),
    excluded: excluded.map(officialBlogAuthoringBriefDecisionSummary),
    invalid_decisions: invalidDecisions.map(officialBlogAuthoringBriefInvalidDecision)
  };
}

export function createOfficialBlogReviewedAuthoring(input = {}, options = {}) {
  const authoringBrief = officialBlogReviewedAuthoringBrief(input);
  const authoringItems = Array.isArray(authoringBrief.authoring_items) ? authoringBrief.authoring_items : [];
  const manualReview = Array.isArray(authoringBrief.manual_review_required) ? authoringBrief.manual_review_required : [];
  const reviewedEntries = [];
  const invalidEntries = [];
  const reportDate = String(options.reportDate || options.report_date || authoringBrief.report_date || "");

  for (const [index, item] of authoringItems.entries()) {
    const template = officialBlogReviewedAuthoringTemplate(item);
    try {
      const record = normalizeOfficialBlogKnowledgeDraftEntry(template, { index });
      reviewedEntries.push(officialBlogReviewedAuthoringEntry(record, template, item));
    } catch (error) {
      invalidEntries.push(officialBlogReviewedAuthoringInvalidEntry(item, template, index, error.message));
    }
  }

  return {
    schema_version: 1,
    kind: "official_blog_reviewed_authoring",
    visibility: "internal",
    report_date: reportDate,
    generated_at: String(options.generatedAt || options.generated_at || new Date().toISOString()),
    admission_policy: officialBlogAdmissionPolicyArtifact(),
    authoring_required_fields: officialBlogAuthoringRequiredFields(),
    stats: {
      authoring_items: authoringItems.length,
      reviewed_entries: reviewedEntries.length,
      manual_review_required: manualReview.length,
      invalid_entries: invalidEntries.length
    },
    reviewed_entries: reviewedEntries,
    manual_review_required: manualReview.map(officialBlogReviewedAuthoringManualReviewSummary),
    invalid_entries: invalidEntries
  };
}

export function createOfficialBlogIntakeQueue(input = {}, options = {}) {
  const candidates = officialBlogIntakeCandidates(input);
  const existingByUrl = existingOfficialBlogRecordByUrl(options.existingIndex);
  const seenByUrl = new Map();
  const reviewQueue = [];
  const excluded = [];
  const duplicates = [];
  const invalidCandidates = [];

  for (const [index, rawCandidate] of candidates.entries()) {
    let candidate;
    try {
      candidate = normalizeOfficialBlogIntakeCandidate(rawCandidate, { index });
    } catch (error) {
      invalidCandidates.push({
        index,
        title_original: String(rawCandidate?.title_original || rawCandidate?.title || ""),
        canonical_url: String(rawCandidate?.canonical_url || rawCandidate?.canonicalUrl || rawCandidate?.url || ""),
        reason: error.message
      });
      continue;
    }

    const existingRecord = existingByUrl.get(candidate.normalized_url);
    if (existingRecord) {
      duplicates.push({
        ...officialBlogIntakeCandidateBase(candidate),
        duplicate_source: "existing_knowledge",
        duplicate_of: existingRecord.id || ""
      });
      continue;
    }

    const seenRecord = seenByUrl.get(candidate.normalized_url);
    if (seenRecord) {
      duplicates.push({
        ...officialBlogIntakeCandidateBase(candidate),
        duplicate_source: "same_batch",
        duplicate_of: seenRecord.intake_id
      });
      continue;
    }

    const triage = triageOfficialBlogPreview({
      title: candidate.title_original,
      opening_preview: candidate.opening_preview
    });
    const base = officialBlogIntakeCandidateBase(candidate);
    seenByUrl.set(candidate.normalized_url, base);

    if (triage.admission === "include" || triage.admission === "needs_review") {
      reviewQueue.push({
        ...base,
        admission: {
          decision: triage.admission,
          reason: triage.reason,
          matched_criteria: triage.matched_criteria
        },
        suggested_topics: triage.suggested_topics,
        knowledge_value: triage.knowledge_value,
        next_action: triage.admission === "include" ? "draft_knowledge_record" : "manual_review_required"
      });
      continue;
    }

    excluded.push({
      ...base,
      admission: {
        decision: "exclude",
        reason: triage.reason,
        matched_criteria: triage.matched_criteria
      },
      excluded_as: triage.excluded_as,
      suggested_topics: triage.suggested_topics,
      knowledge_value: triage.knowledge_value
    });
  }

  return {
    schema_version: 1,
    kind: "official_blog_intake_queue",
    visibility: "internal",
    report_date: String(options.reportDate || ""),
    generated_at: String(options.generatedAt || new Date().toISOString()),
    policy_scope: OFFICIAL_BLOG_ADMISSION_POLICY.scope,
    admission_policy: officialBlogAdmissionPolicyArtifact(),
    stats: {
      total_candidates: candidates.length,
      review_queue: reviewQueue.length,
      included: reviewQueue.filter((candidate) => candidate.admission.decision === "include").length,
      needs_review: reviewQueue.filter((candidate) => candidate.admission.decision === "needs_review").length,
      excluded: excluded.length,
      duplicates: duplicates.length,
      invalid: invalidCandidates.length
    },
    review_queue: reviewQueue,
    excluded,
    duplicates,
    invalid_candidates: invalidCandidates
  };
}

export async function validateOfficialBlogKnowledge(index) {
  const schema = JSON.parse(await fs.readFile(SCHEMA_PATH, "utf8"));
  const ajv = createAjv();
  const validate = ajv.compile(schema);
  const candidate = structuredClone(index);
  const valid = validate(candidate);
  return {
    valid,
    value: candidate,
    errors: valid ? [] : (validate.errors || []).map((error) => ({
      path: error.instancePath || "/",
      message: error.message || "schema validation failed",
      keyword: error.keyword
    }))
  };
}

function publicOfficialBlogRecord(record = {}, options = {}) {
  const normalizedUrl = String(record.normalized_url || normalizeOfficialBlogUrl(record.canonical_url || ""));
  const inferredDates = options.reportDatesByUrl?.get(normalizedUrl) || [];
  return {
    id: String(record.id || ""),
    company: String(record.company || ""),
    company_label: record.company === "anthropic" ? "Anthropic" : record.company === "openai" ? "OpenAI" : String(record.company || ""),
    canonical_url: String(record.canonical_url || ""),
    normalized_url: normalizedUrl,
    published_at: String(record.published_at || ""),
    title_original: String(record.title_original || ""),
    title_zh: String(record.title_zh || ""),
    importance: String(record.importance || ""),
    content_type: String(record.content_type || ""),
    topics: uniqueSorted(record.topics || []),
    summary_zh: String(record.summary_zh || ""),
    key_ideas: stringArray(record.key_ideas),
    practice_checklist: stringArray(record.practice_checklist),
    related_blog_ids: uniqueSorted(record.related_blog_ids || []),
    related_report_dates: uniqueSorted([
      ...(Array.isArray(record.related_report_dates) ? record.related_report_dates : []),
      ...inferredDates
    ])
  };
}

function officialBlogCandidateUrlsFromReport(report = {}) {
  const urls = [];
  for (const section of REPORT_ITEM_SECTIONS) {
    const items = Array.isArray(report[section]) ? report[section] : [];
    for (const item of items) {
      if (!item || typeof item !== "object") {
        continue;
      }
      for (const field of REPORT_ITEM_URL_FIELDS) {
        if (typeof item[field] === "string" && item[field].trim()) {
          urls.push(item[field]);
        }
      }
    }
  }
  return urls;
}

function safeNormalizeOfficialBlogUrl(value) {
  try {
    return normalizeOfficialBlogUrl(value);
  } catch {
    return "";
  }
}

function officialBlogPreviewRawEntries(input) {
  const invalidEntries = [];
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) {
      return {
        entries: [],
        invalid_entries: [{ index: 0, reason: "official blog preview feed input is empty" }]
      };
    }
    if (trimmed.startsWith("<")) {
      const entries = officialBlogPreviewXmlEntries(trimmed);
      return {
        entries,
        invalid_entries: entries.length > 0 ? [] : [{ index: 0, reason: "official blog preview feed contains no RSS item or Atom entry elements" }]
      };
    }
    try {
      return officialBlogPreviewRawEntries(JSON.parse(trimmed));
    } catch (error) {
      invalidEntries.push({ index: 0, reason: `official blog preview feed JSON parse failed: ${error.message}` });
      return { entries: [], invalid_entries: invalidEntries };
    }
  }

  if (Array.isArray(input)) {
    return { entries: input, invalid_entries: [] };
  }
  if (input && typeof input === "object") {
    if (Array.isArray(input.candidates)) {
      return { entries: input.candidates, invalid_entries: [] };
    }
    if (Array.isArray(input.items)) {
      return { entries: input.items, invalid_entries: [] };
    }
    if (Array.isArray(input.entries)) {
      return { entries: input.entries, invalid_entries: [] };
    }
  }

  return {
    entries: [],
    invalid_entries: [{ index: 0, reason: "official blog preview feed input must be RSS, Atom, JSON array, or JSON object with items, entries, or candidates" }]
  };
}

function officialBlogPreviewXmlEntries(xml) {
  const atomEntries = matchOfficialBlogXmlBlocks(xml, "entry").map(parseOfficialBlogAtomEntry);
  if (atomEntries.length > 0) {
    return atomEntries;
  }
  return matchOfficialBlogXmlBlocks(xml, "item").map(parseOfficialBlogRssItem);
}

function parseOfficialBlogAtomEntry(block) {
  const contentHtml =
    officialBlogXmlInner(block, "summary") ||
    officialBlogXmlInner(block, "content") ||
    officialBlogXmlInner(block, "description");
  return {
    title: officialBlogXmlText(block, "title"),
    url: officialBlogAtomLink(block) || officialBlogXmlText(block, "link"),
    published_at: officialBlogDateOnly(officialBlogXmlText(block, "published") || officialBlogXmlText(block, "updated")),
    content_html: contentHtml
  };
}

function parseOfficialBlogRssItem(block) {
  const contentHtml =
    officialBlogXmlInner(block, "description") ||
    officialBlogXmlInner(block, "encoded") ||
    officialBlogXmlInner(block, "summary") ||
    officialBlogXmlInner(block, "content");
  return {
    title: officialBlogXmlText(block, "title"),
    url: officialBlogXmlText(block, "link") || officialBlogAtomLink(block) || officialBlogXmlText(block, "guid"),
    published_at: officialBlogDateOnly(
      officialBlogXmlText(block, "pubDate") ||
      officialBlogXmlText(block, "date") ||
      officialBlogXmlText(block, "published") ||
      officialBlogXmlText(block, "updated")
    ),
    content_html: contentHtml
  };
}

function normalizeOfficialBlogPreviewFeedEntry(rawEntry = {}, context = {}) {
  const canonicalUrl = String(
    rawEntry.canonical_url ||
    rawEntry.canonicalUrl ||
    rawEntry.url ||
    rawEntry.link ||
    rawEntry.href ||
    ""
  ).trim();
  if (!canonicalUrl) {
    throw new Error(`official blog preview feed entry missing URL at index ${context.index}`);
  }

  const normalizedUrl = normalizeOfficialBlogUrl(canonicalUrl);
  const company = normalizeOfficialBlogCompany(rawEntry.company || context.company || inferOfficialBlogCompany(normalizedUrl));
  if (!SUPPORTED_COMPANIES.has(company)) {
    throw new Error(`unsupported official blog company at index ${context.index}: ${company || "(missing)"}`);
  }

  const title = String(rawEntry.title_original || rawEntry.titleOriginal || rawEntry.title || "").trim();
  if (!title) {
    throw new Error(`official blog preview feed entry missing title at index ${context.index}`);
  }

  const openingParagraphs = cappedOfficialBlogPreviewEntryParagraphs(rawEntry);
  const openingPreview = officialBlogOpeningPreview({
    opening_paragraphs: openingParagraphs
  });
  const publishedAt = officialBlogDateOnly(
    rawEntry.published_at ||
    rawEntry.publishedAt ||
    rawEntry.event_date ||
    rawEntry.eventDate ||
    rawEntry.pubDate ||
    rawEntry.date ||
    rawEntry.updated_at ||
    rawEntry.updatedAt ||
    rawEntry.updated
  );
  const sourceLabel = String(rawEntry.source_label || rawEntry.sourceLabel || rawEntry.source || context.sourceLabel || "").trim();
  const sourceEntryId = String(rawEntry.source_entry_id || rawEntry.sourceEntryId || rawEntry.id || rawEntry.guid || "").trim();

  return {
    company,
    canonical_url: canonicalUrl,
    normalized_url: normalizedUrl,
    published_at: publishedAt,
    title_original: title,
    opening_paragraphs: openingParagraphs,
    opening_preview: openingPreview,
    source_label: sourceLabel,
    ...(sourceEntryId ? { source_entry_id: sourceEntryId } : {})
  };
}

function officialBlogPreviewEntryParagraphs(rawEntry = {}) {
  const explicitParagraphs = Array.isArray(rawEntry.opening_paragraphs)
    ? rawEntry.opening_paragraphs
    : Array.isArray(rawEntry.openingParagraphs)
      ? rawEntry.openingParagraphs
      : null;
  if (explicitParagraphs) {
    return explicitParagraphs
      .map((paragraph) => cleanOfficialBlogInlineText(paragraph))
      .filter(Boolean);
  }

  const source = firstOfficialBlogText(
    rawEntry.opening_preview,
    rawEntry.openingPreview,
    rawEntry.opening_excerpt,
    rawEntry.openingExcerpt,
    rawEntry.excerpt,
    rawEntry.summary,
    rawEntry.description,
    rawEntry.content_html,
    rawEntry.contentHtml,
    rawEntry.content,
    rawEntry.body
  );
  return officialBlogMarkupParagraphs(source);
}

function cappedOfficialBlogPreviewEntryParagraphs(rawEntry = {}) {
  const paragraphs = officialBlogPreviewEntryParagraphs(rawEntry).slice(0, TRIAGE_OPENING_PARAGRAPH_LIMIT);
  const capped = [];
  let remaining = TRIAGE_OPENING_CHAR_LIMIT;
  for (const paragraph of paragraphs) {
    if (remaining <= 0) {
      break;
    }
    const next = paragraph.slice(0, remaining).trim();
    if (!next) {
      continue;
    }
    capped.push(next);
    remaining -= next.length;
  }
  return capped;
}

function firstOfficialBlogText(...values) {
  for (const value of values) {
    if (Array.isArray(value)) {
      const joined = value.map((item) => String(item || "").trim()).filter(Boolean).join("\n\n");
      if (joined) {
        return joined;
      }
      continue;
    }
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return "";
}

function officialBlogMarkupParagraphs(value) {
  const withoutCdata = String(value || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  const decoded = decodeOfficialBlogEntities(withoutCdata)
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\b[^>]*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|section|article|li|h[1-6]|blockquote)>/gi, "\n\n")
    .replace(/<[^>]*(?:>|$)/g, " ");
  return decoded
    .split(/\n\s*\n/g)
    .map((paragraph) => cleanOfficialBlogInlineText(paragraph))
    .filter(Boolean)
    .slice(0, TRIAGE_OPENING_PARAGRAPH_LIMIT);
}

function cleanOfficialBlogInlineText(value) {
  return decodeOfficialBlogEntities(value)
    .replace(/\s+/g, " ")
    .trim();
}

function matchOfficialBlogXmlBlocks(xml, tagName) {
  const pattern = new RegExp(`<(?:[\\w.-]+:)?${tagName}\\b[\\s\\S]*?<\\/(?:[\\w.-]+:)?${tagName}>`, "gi");
  return [...String(xml || "").matchAll(pattern)].map((match) => match[0]);
}

function officialBlogXmlInner(block, tagName) {
  const pattern = new RegExp(`<(?:[\\w.-]+:)?${tagName}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${tagName}>`, "i");
  return block.match(pattern)?.[1] || "";
}

function officialBlogXmlText(block, tagName) {
  return officialBlogMarkupParagraphs(officialBlogXmlInner(block, tagName)).join(" ");
}

function officialBlogAtomLink(block) {
  let fallback = "";
  for (const match of String(block || "").matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    const href = officialBlogXmlAttribute(tag, "href");
    if (!href) {
      continue;
    }
    const rel = officialBlogXmlAttribute(tag, "rel").toLowerCase();
    if (!rel || rel === "alternate") {
      return href;
    }
    fallback ||= href;
  }
  return fallback;
}

function officialBlogXmlAttribute(tag, name) {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]+)"|'([^']+)'|([^\\s>]+))`, "i");
  const match = String(tag || "").match(pattern);
  return decodeOfficialBlogEntities(match?.[1] || match?.[2] || match?.[3] || "");
}

function officialBlogDateOnly(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  const direct = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (direct) {
    return direct[1];
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString().slice(0, 10);
}

function decodeOfficialBlogEntities(value) {
  return String(value || "")
    .replace(/&(?:#(\d+)|#x([0-9a-f]+)|amp|lt|gt|quot|apos|nbsp);/gi, (entity, decimal, hex) => {
      if (decimal) {
        return String.fromCodePoint(Number.parseInt(decimal, 10));
      }
      if (hex) {
        return String.fromCodePoint(Number.parseInt(hex, 16));
      }
      const normalized = entity.toLowerCase();
      if (normalized === "&amp;") return "&";
      if (normalized === "&lt;") return "<";
      if (normalized === "&gt;") return ">";
      if (normalized === "&quot;") return "\"";
      if (normalized === "&apos;") return "'";
      if (normalized === "&nbsp;") return " ";
      return entity;
    });
}

function officialBlogReviewSessionFeeds(input = {}) {
  if (Array.isArray(input)) {
    return input;
  }
  if (Array.isArray(input?.feeds)) {
    return input.feeds;
  }
  if (typeof input === "string" || input?.feed_text || input?.feedText || input?.xml || input?.content || input?.text) {
    return [input];
  }
  return [];
}

function officialBlogReviewSessionFeedText(feed = {}, index = 0) {
  if (typeof feed === "string") {
    return feed;
  }
  const feedText = String(feed?.feed_text ?? feed?.feedText ?? feed?.xml ?? feed?.content ?? feed?.text ?? "");
  if (!feedText.trim()) {
    throw new Error(`official blog review session feed missing feed_text at index ${index}`);
  }
  return feedText;
}

function combineOfficialBlogPreviewFeeds(feeds = [], options = {}) {
  const candidates = feeds.flatMap((feed) => Array.isArray(feed?.candidates) ? feed.candidates : []);
  const invalidEntries = feeds.flatMap((feed, feedIndex) => (
    Array.isArray(feed?.invalid_entries) ? feed.invalid_entries : []
  ).map((entry) => ({
    ...entry,
    feed_index: feedIndex,
    feed_company: String(feed?.company || "").trim(),
    source_label: String(feed?.source_label || "").trim()
  })));
  const sourceLabel = feeds
    .map((feed) => String(feed?.source_label || "").trim())
    .filter(Boolean)
    .join("; ");

  return {
    schema_version: 1,
    kind: "official_blog_preview_feed",
    visibility: "internal",
    report_date: String(options.reportDate || options.report_date || ""),
    generated_at: String(options.generatedAt || options.generated_at || new Date().toISOString()),
    source_label: sourceLabel,
    admission_policy: officialBlogAdmissionPolicyArtifact(),
    stats: {
      total_entries: feeds.reduce((sum, feed) => sum + Number(feed?.stats?.total_entries || 0), 0),
      candidates: candidates.length,
      invalid_entries: invalidEntries.length
    },
    candidates,
    invalid_entries: invalidEntries
  };
}

function officialBlogIntakeCandidates(input = {}) {
  if (Array.isArray(input)) {
    return input;
  }
  if (input?.kind === "official_blog_preview_feed" && Array.isArray(input.candidates)) {
    return input.candidates;
  }
  if (input?.feed && typeof input.feed === "object" && Array.isArray(input.feed.candidates)) {
    return input.feed.candidates;
  }
  if (Array.isArray(input.candidates)) {
    return input.candidates;
  }
  if (Array.isArray(input.items)) {
    return input.items;
  }
  return [];
}

function officialBlogReviewPacketQueue(input = {}, options = {}) {
  const queue = officialBlogReviewPacketExistingQueue(input);
  if (queue) {
    return queue;
  }
  return createOfficialBlogIntakeQueue(officialBlogReviewPacketCandidateInput(input), {
    existingIndex: options.existingIndex,
    reportDate: options.reportDate || options.report_date,
    generatedAt: options.generatedAt || options.generated_at
  });
}

function officialBlogReviewPacketExistingQueue(input = {}) {
  if (input?.kind === "official_blog_intake_queue") {
    return input;
  }
  if (input?.queue?.kind === "official_blog_intake_queue") {
    return input.queue;
  }
  if (input?.review_packet_source?.kind === "official_blog_intake_queue") {
    return input.review_packet_source;
  }
  return null;
}

function officialBlogReviewPacketCandidateInput(input = {}) {
  if (input?.kind === "official_blog_preview_feed" || input?.feed?.kind === "official_blog_preview_feed") {
    return {
      candidates: officialBlogIntakeCandidates(input)
    };
  }
  return input;
}

function officialBlogReviewPacketFeedInvalidCandidates(input = {}) {
  const feed = input?.kind === "official_blog_preview_feed"
    ? input
    : input?.feed?.kind === "official_blog_preview_feed"
      ? input.feed
      : null;
  return (Array.isArray(feed?.invalid_entries) ? feed.invalid_entries : [])
    .map((entry) => officialBlogReviewPacketInvalidCandidate(entry, "invalid preview feed entry"));
}

function officialBlogReviewPacketInvalidCandidate(entry = {}, fallbackReason = "invalid candidate") {
  return {
    index: entry.index,
    title_original: String(entry.title_original || entry.title || "").trim(),
    canonical_url: String(entry.canonical_url || entry.url || "").trim(),
    reason: String(entry.reason || fallbackReason).trim()
  };
}

function officialBlogReviewDecisionPacket(input = {}) {
  const packet = [
    input,
    input?.review_packet,
    input?.reviewPacket,
    input?.packet,
    input?.session?.review_packet,
    input?.review_packet?.session?.review_packet,
    input?.reviewPacket?.session?.review_packet,
    input?.packet?.session?.review_packet
  ].find((candidate) => candidate?.kind === "official_blog_review_packet");
  if (!packet) {
    throw new Error("official blog review decisions require review_packet");
  }
  return packet;
}

function officialBlogReviewDecisionEntries(input = {}) {
  if (Array.isArray(input)) {
    return input;
  }
  if (Array.isArray(input.decisions)) {
    return input.decisions;
  }
  if (Array.isArray(input.review_decisions)) {
    return input.review_decisions;
  }
  if (Array.isArray(input.reviewDecisions)) {
    return input.reviewDecisions;
  }
  if (Array.isArray(input.items)) {
    return input.items;
  }
  if (Array.isArray(input.entries)) {
    return input.entries;
  }
  if (input.review_decisions && typeof input.review_decisions === "object") {
    return officialBlogReviewDecisionEntries(input.review_decisions);
  }
  if (input.reviewDecisions && typeof input.reviewDecisions === "object") {
    return officialBlogReviewDecisionEntries(input.reviewDecisions);
  }
  if (input.ai_review && typeof input.ai_review === "object") {
    return officialBlogReviewDecisionEntries(input.ai_review);
  }
  if (input.aiReview && typeof input.aiReview === "object") {
    return officialBlogReviewDecisionEntries(input.aiReview);
  }
  return [];
}

function officialBlogDecisionAdmissionPolicy(packet = {}) {
  return officialBlogAdmissionPolicyArtifact();
}

function officialBlogDecisionAllowedCriteria(policy = {}) {
  const fromPolicy = (Array.isArray(policy.include_criteria) ? policy.include_criteria : [])
    .map((criterion) => String(criterion?.id || criterion || "").trim())
    .filter(Boolean);
  const values = fromPolicy.length > 0 ? fromPolicy : [...OFFICIAL_BLOG_MATCHED_CRITERIA];
  return new Set(values);
}

function officialBlogNormalizeAiReviewDecision(rawDecision = {}, context = {}) {
  const decision = normalizeOfficialBlogReviewDecision(rawDecision.decision || rawDecision.review_decision || rawDecision.reviewDecision);
  if (!["include", "needs_review", "exclude"].includes(decision)) {
    return {
      ok: false,
      reason: `invalid AI decision at index ${context.index}: ${decision || "(missing)"}`
    };
  }

  const matchedCriteria = uniqueSorted(officialBlogArrayLike(rawDecision.matched_criteria || rawDecision.matchedCriteria || rawDecision.criteria));
  const outsidePolicy = matchedCriteria.filter((criterion) => !context.allowedCriteria.has(criterion));
  if (outsidePolicy.length > 0) {
    return {
      ok: false,
      reason: `matched_criteria outside admission policy at index ${context.index}: ${outsidePolicy.join(", ")}`
    };
  }

  return {
    ok: true,
    decision: {
      decision,
      matched_criteria: matchedCriteria,
      suggested_topics: officialBlogReviewDecisionTopics(rawDecision.suggested_topics || rawDecision.suggestedTopics || rawDecision.topics),
      rationale: officialBlogReviewDecisionRationale(rawDecision.rationale || rawDecision.reason),
      confidence: officialBlogReviewDecisionConfidence(rawDecision.confidence)
    }
  };
}

function officialBlogReviewDecisionItem(packetItem = {}, aiReview = {}) {
  const deterministicDecision = normalizeOfficialBlogReviewDecision(packetItem.deterministic_triage?.decision);
  let finalDecision = aiReview.decision === "include" && deterministicDecision === "include"
    ? "include"
    : aiReview.decision === "exclude"
      ? "exclude"
      : "needs_review";
  if (deterministicDecision === "needs_review") {
    finalDecision = "needs_review";
  }
  if (deterministicDecision && !["include", "needs_review"].includes(deterministicDecision)) {
    finalDecision = "exclude";
  }

  return {
    ...officialBlogReviewDecisionPacketItemBase(packetItem),
    ai_review: aiReview,
    final_decision: finalDecision,
    final_action: finalDecision === "include"
      ? "ready_for_manual_authoring"
      : finalDecision === "needs_review"
        ? "manual_review_required"
        : "do_not_author"
  };
}

function officialBlogReviewDecisionPacketItemBase(packetItem = {}) {
  return {
    intake_id: String(packetItem.intake_id || ""),
    company: String(packetItem.company || ""),
    company_label: String(packetItem.company_label || ""),
    canonical_url: String(packetItem.canonical_url || ""),
    normalized_url: String(packetItem.normalized_url || safeNormalizeOfficialBlogUrl(packetItem.canonical_url) || ""),
    published_at: String(packetItem.published_at || ""),
    title_original: String(packetItem.title_original || ""),
    opening_preview: String(packetItem.opening_preview || ""),
    opening_paragraph_count: Number.isFinite(Number(packetItem.opening_paragraph_count))
      ? Number(packetItem.opening_paragraph_count)
      : officialBlogPreviewParagraphCount(packetItem.opening_preview),
    deterministic_triage: {
      decision: String(packetItem.deterministic_triage?.decision || ""),
      reason: String(packetItem.deterministic_triage?.reason || ""),
      matched_criteria: uniqueSorted(packetItem.deterministic_triage?.matched_criteria || [])
    }
  };
}

function officialBlogReviewDecisionInvalid(rawDecision = {}, index, reason) {
  return {
    index,
    intake_id: String(rawDecision?.intake_id || rawDecision?.intakeId || rawDecision?.id || "").trim(),
    reason: String(reason || "invalid AI decision").trim()
  };
}

function officialBlogArrayLike(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    return [value];
  }
  return [];
}

function officialBlogReviewDecisionTopics(value) {
  return uniqueSorted(officialBlogArrayLike(value))
    .filter((topic) => OFFICIAL_BLOG_TOPIC_ID_RE.test(topic))
    .slice(0, 12);
}

function officialBlogReviewDecisionRationale(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 600);
}

function officialBlogReviewDecisionConfidence(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return Math.max(0, Math.min(1, numeric));
  }
  const bucket = normalizeOfficialBlogReviewDecision(value);
  return ["high", "medium", "low"].includes(bucket) ? bucket : "";
}

function officialBlogAuthoringBriefReviewDecisions(input = {}) {
  const decisions = input?.kind === "official_blog_review_decisions"
    ? input
    : input?.review_decisions?.kind === "official_blog_review_decisions"
      ? input.review_decisions
      : input?.reviewDecisions?.kind === "official_blog_review_decisions"
        ? input.reviewDecisions
        : input?.decisions?.kind === "official_blog_review_decisions"
          ? input.decisions
          : null;
  if (!decisions) {
    throw new Error("official blog authoring brief requires review_decisions");
  }
  return decisions;
}

function officialBlogAuthoringBriefRelationshipSuggestions(input = {}, options = {}) {
  const fromOptions =
    options.relationshipSuggestions ||
    options.relationship_suggestions ||
    options.relations;
  const source =
    fromOptions ||
    input.relationship_suggestions ||
    input.relationshipSuggestions ||
    input.relations ||
    input.suggested_relations ||
    input.suggestedRelations;
  if (!source) {
    return { suggestions: [] };
  }
  if (source.kind === "official_blog_relationship_suggestions") {
    return source;
  }
  if (source.relationship_suggestions?.kind === "official_blog_relationship_suggestions") {
    return source.relationship_suggestions;
  }
  if (source.relationshipSuggestions?.kind === "official_blog_relationship_suggestions") {
    return source.relationshipSuggestions;
  }
  if (Array.isArray(source.suggestions)) {
    return { suggestions: source.suggestions };
  }
  return { suggestions: [] };
}

function officialBlogAuthoringBriefRelationsByUrl(relationshipSuggestions = {}) {
  const relationsByUrl = new Map();
  for (const suggestion of Array.isArray(relationshipSuggestions.suggestions) ? relationshipSuggestions.suggestions : []) {
    const normalizedUrl = safeNormalizeOfficialBlogUrl(suggestion.normalized_url || suggestion.canonical_url);
    if (!normalizedUrl) {
      continue;
    }
    const relatedIds = officialBlogAuthoringBriefRelatedBlogIds(suggestion.suggested_related_blog_ids || suggestion.suggestedRelatedBlogIds);
    if (relatedIds.length > 0) {
      relationsByUrl.set(normalizedUrl, relatedIds);
    }
  }
  return relationsByUrl;
}

function officialBlogAuthoringBriefRelatedBlogIds(value) {
  const ids = [];
  for (const item of Array.isArray(value) ? value : []) {
    if (typeof item === "string") {
      ids.push(item);
    } else if (item && typeof item === "object") {
      ids.push(item.id || item.record_id || item.recordId || "");
    }
  }
  return uniqueSorted(ids.filter((id) => OFFICIAL_BLOG_RECORD_ID_RE.test(String(id || ""))));
}

function officialBlogAuthoringBriefItem(item = {}, context = {}) {
  const base = officialBlogReviewDecisionPacketItemBase(item);
  const matchedCriteria = officialBlogAuthoringMatchedCriteria(item);
  const suggestedTopics = officialBlogAuthoringSuggestedTopics(item, matchedCriteria);
  const relatedBlogIds = context.relationsByUrl?.get(base.normalized_url) || [];
  const relatedReportDates = officialBlogAuthoringRelatedReportDates(item, context.reportDate);
  const suggestedFields = {
    importance: officialBlogAuthoringImportance(matchedCriteria),
    content_type: officialBlogAuthoringContentType(matchedCriteria),
    topics: suggestedTopics,
    related_blog_ids: relatedBlogIds,
    related_report_dates: relatedReportDates
  };
  const admissionReason = officialBlogAuthoringAdmissionReason(item);

  return {
    ...base,
    ai_review: officialBlogAuthoringAiReview(item.ai_review),
    final_decision: "include",
    final_action: "human_authoring_required",
    authoring_required_fields: officialBlogAuthoringRequiredFields(),
    suggested_fields: suggestedFields,
    reviewed_entry_template: {
      intake_id: base.intake_id,
      company: base.company,
      canonical_url: base.canonical_url,
      published_at: base.published_at,
      title_original: base.title_original,
      review_decision: "include",
      admission: {
        decision: "include",
        reason: admissionReason,
        matched_criteria: matchedCriteria
      },
      title_zh: "",
      summary_zh: "",
      key_ideas: [],
      practice_checklist: [],
      importance: suggestedFields.importance,
      content_type: suggestedFields.content_type,
      topics: suggestedFields.topics,
      related_blog_ids: suggestedFields.related_blog_ids,
      related_report_dates: suggestedFields.related_report_dates
    }
  };
}

function officialBlogAuthoringBriefDecisionSummary(item = {}) {
  return {
    ...officialBlogReviewDecisionPacketItemBase(item),
    ai_review: officialBlogAuthoringAiReview(item.ai_review),
    final_decision: String(item.final_decision || ""),
    final_action: String(item.final_action || "")
  };
}

function officialBlogAuthoringBriefInvalidDecision(item = {}) {
  return {
    index: item.index ?? null,
    intake_id: String(item.intake_id || ""),
    reason: String(item.reason || "")
  };
}

function officialBlogAuthoringRequiredFields() {
  return [
    "title_zh",
    "summary_zh",
    "key_ideas",
    "practice_checklist"
  ];
}

function officialBlogReviewedAuthoringBrief(input = {}) {
  const brief = input?.kind === "official_blog_authoring_brief"
    ? input
    : input?.authoring_brief?.kind === "official_blog_authoring_brief"
      ? input.authoring_brief
      : input?.authoringBrief?.kind === "official_blog_authoring_brief"
        ? input.authoringBrief
        : input?.brief?.kind === "official_blog_authoring_brief"
          ? input.brief
          : null;
  if (!brief) {
    throw new Error("official blog reviewed authoring requires authoring_brief");
  }
  return brief;
}

function officialBlogReviewedAuthoringTemplate(item = {}) {
  if (item?.reviewed_entry_template && typeof item.reviewed_entry_template === "object") {
    return item.reviewed_entry_template;
  }
  if (item?.reviewedEntryTemplate && typeof item.reviewedEntryTemplate === "object") {
    return item.reviewedEntryTemplate;
  }
  return {};
}

function officialBlogReviewedAuthoringEntry(record = {}, rawEntry = {}, sourceItem = {}) {
  return {
    intake_id: String(rawEntry.intake_id || sourceItem.intake_id || ""),
    id: String(record.id || ""),
    company: String(record.company || ""),
    canonical_url: String(record.canonical_url || ""),
    normalized_url: String(record.normalized_url || ""),
    published_at: String(record.published_at || ""),
    title_original: String(record.title_original || ""),
    review_decision: "include",
    admission: {
      decision: "include",
      rationale: String(record.admission?.rationale || ""),
      matched_criteria: uniqueSorted(record.admission?.matched_criteria || [])
    },
    title_zh: String(record.title_zh || ""),
    summary_zh: String(record.summary_zh || ""),
    key_ideas: stringArray(record.key_ideas),
    practice_checklist: stringArray(record.practice_checklist),
    importance: String(record.importance || ""),
    content_type: String(record.content_type || ""),
    topics: uniqueSorted(record.topics || []),
    related_blog_ids: uniqueSorted(record.related_blog_ids || []),
    related_report_dates: uniqueSorted(record.related_report_dates || [])
  };
}

function officialBlogReviewedAuthoringInvalidEntry(item = {}, template = {}, index, reason) {
  return {
    index,
    intake_id: String(template?.intake_id || item?.intake_id || ""),
    title_original: String(template?.title_original || template?.titleOriginal || item?.title_original || item?.titleOriginal || item?.title || "").trim(),
    canonical_url: String(template?.canonical_url || template?.canonicalUrl || template?.url || item?.canonical_url || item?.canonicalUrl || item?.url || "").trim(),
    reason
  };
}

function officialBlogReviewedAuthoringManualReviewSummary(item = {}) {
  return {
    intake_id: String(item.intake_id || ""),
    company: String(item.company || ""),
    company_label: String(item.company_label || (item.company === "anthropic" ? "Anthropic" : item.company === "openai" ? "OpenAI" : "")),
    canonical_url: String(item.canonical_url || item.canonicalUrl || item.url || ""),
    normalized_url: String(item.normalized_url || item.normalizedUrl || safeNormalizeOfficialBlogUrl(item.canonical_url || item.canonicalUrl || item.url || "") || ""),
    published_at: String(item.published_at || item.publishedAt || ""),
    title_original: String(item.title_original || item.titleOriginal || item.title || ""),
    final_decision: String(item.final_decision || ""),
    final_action: String(item.final_action || "")
  };
}

function officialBlogAuthoringAiReview(aiReview = {}) {
  return {
    decision: normalizeOfficialBlogReviewDecision(aiReview.decision),
    matched_criteria: uniqueSorted(aiReview.matched_criteria || []).filter((criterion) => OFFICIAL_BLOG_MATCHED_CRITERIA.has(criterion)),
    suggested_topics: officialBlogAuthoringTopicIds(aiReview.suggested_topics || []),
    rationale: officialBlogReviewDecisionRationale(aiReview.rationale || aiReview.reason),
    confidence: officialBlogReviewDecisionConfidence(aiReview.confidence)
  };
}

function officialBlogAuthoringMatchedCriteria(item = {}) {
  return uniqueSorted([
    ...(Array.isArray(item.deterministic_triage?.matched_criteria) ? item.deterministic_triage.matched_criteria : []),
    ...(Array.isArray(item.ai_review?.matched_criteria) ? item.ai_review.matched_criteria : [])
  ]).filter((criterion) => OFFICIAL_BLOG_MATCHED_CRITERIA.has(criterion));
}

function officialBlogAuthoringSuggestedTopics(item = {}, matchedCriteria = []) {
  const values = [
    ...(Array.isArray(item.ai_review?.suggested_topics) ? item.ai_review.suggested_topics : []),
    ...(Array.isArray(item.suggested_topics) ? item.suggested_topics : []),
    ...matchedCriteria.map(officialBlogAuthoringTopicForCriterion)
  ].filter(Boolean);
  return officialBlogAuthoringTopicIds(values).slice(0, 12);
}

function officialBlogAuthoringTopicIds(value) {
  return uniqueSorted(officialBlogArrayLike(value))
    .filter((topic) => OFFICIAL_BLOG_TOPIC_ID_RE.test(topic))
    .slice(0, 12);
}

function officialBlogAuthoringTopicForCriterion(criterion) {
  if (criterion === "new_model") return "model_release_context";
  if (criterion === "new_product") return "product_practice";
  if (criterion === "harness_engineering") return "harness_engineering";
  if (criterion === "agent_workflow") return "agent";
  if (criterion === "eval_methodology") return "evals";
  if (criterion === "safety_engineering") return "safety_engineering";
  if (criterion === "engineering_practice") return "engineering_practice";
  return "";
}

function officialBlogAuthoringImportance(matchedCriteria = []) {
  if (matchedCriteria.some((criterion) => ["new_model", "new_product", "harness_engineering", "agent_workflow"].includes(criterion))) {
    return "major";
  }
  if (matchedCriteria.some((criterion) => ["engineering_practice", "eval_methodology", "safety_engineering"].includes(criterion))) {
    return "notable";
  }
  return "reference";
}

function officialBlogAuthoringContentType(matchedCriteria = []) {
  if (matchedCriteria.includes("new_model")) return "model_release_context";
  if (matchedCriteria.includes("new_product")) return "product_practice";
  if (matchedCriteria.includes("safety_engineering")) return "safety_policy";
  if (matchedCriteria.includes("eval_methodology")) return "best_practice";
  if (matchedCriteria.some((criterion) => ["harness_engineering", "agent_workflow", "engineering_practice"].includes(criterion))) {
    return "engineering_note";
  }
  return "best_practice";
}

function officialBlogAuthoringRelatedReportDates(item = {}, reportDate = "") {
  return uniqueSorted([
    ...(Array.isArray(item.related_report_dates) ? item.related_report_dates : []),
    String(reportDate || "")
  ].filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)));
}

function officialBlogAuthoringAdmissionReason(item = {}) {
  const deterministicReason = String(item.deterministic_triage?.reason || "").trim();
  const aiRationale = officialBlogReviewDecisionRationale(item.ai_review?.rationale || item.ai_review?.reason);
  return [deterministicReason, aiRationale]
    .filter(Boolean)
    .join(" / ")
    .slice(0, 600);
}

function officialBlogReviewPacketItem(candidate = {}) {
  return {
    ...officialBlogReviewPacketCandidateBase(candidate),
    deterministic_triage: {
      decision: String(candidate.admission?.decision || ""),
      reason: String(candidate.admission?.reason || ""),
      matched_criteria: uniqueSorted(candidate.admission?.matched_criteria || [])
    },
    suggested_topics: uniqueSorted(candidate.suggested_topics || []),
    knowledge_value: String(candidate.knowledge_value || ""),
    next_action: String(candidate.next_action || "")
  };
}

function officialBlogReviewPacketExcludedItem(candidate = {}) {
  return {
    ...officialBlogReviewPacketCandidateBase(candidate),
    deterministic_triage: {
      decision: String(candidate.admission?.decision || "exclude"),
      reason: String(candidate.admission?.reason || ""),
      matched_criteria: uniqueSorted(candidate.admission?.matched_criteria || [])
    },
    excluded_as: String(candidate.excluded_as || ""),
    suggested_topics: uniqueSorted(candidate.suggested_topics || []),
    knowledge_value: String(candidate.knowledge_value || "")
  };
}

function officialBlogReviewPacketDuplicateItem(candidate = {}) {
  return {
    ...officialBlogReviewPacketCandidateBase(candidate),
    duplicate_source: String(candidate.duplicate_source || ""),
    duplicate_of: String(candidate.duplicate_of || "")
  };
}

function officialBlogReviewPacketCandidateBase(candidate = {}) {
  return {
    intake_id: String(candidate.intake_id || ""),
    company: String(candidate.company || ""),
    company_label: String(candidate.company_label || (candidate.company === "anthropic" ? "Anthropic" : candidate.company === "openai" ? "OpenAI" : "")),
    canonical_url: String(candidate.canonical_url || ""),
    normalized_url: String(candidate.normalized_url || safeNormalizeOfficialBlogUrl(candidate.canonical_url) || ""),
    published_at: String(candidate.published_at || ""),
    title_original: String(candidate.title_original || ""),
    opening_preview: String(candidate.opening_preview || ""),
    opening_paragraph_count: Number.isFinite(Number(candidate.opening_paragraph_count))
      ? Number(candidate.opening_paragraph_count)
      : officialBlogPreviewParagraphCount(candidate.opening_preview),
    source_label: String(candidate.source_label || "")
  };
}

function officialBlogPreviewParagraphCount(value) {
  return String(value || "").trim() ? 1 : 0;
}

function existingOfficialBlogRecordByUrl(index = {}) {
  const byUrl = new Map();
  for (const record of Array.isArray(index.records) ? index.records : []) {
    const normalized = safeNormalizeOfficialBlogUrl(record.normalized_url || record.canonical_url);
    if (normalized) {
      byUrl.set(normalized, record);
    }
  }
  return byUrl;
}

function officialBlogReviewedEntries(input = {}) {
  if (Array.isArray(input)) {
    return input;
  }
  if (Array.isArray(input.reviewed_entries)) {
    return input.reviewed_entries;
  }
  if (Array.isArray(input.reviewedEntries)) {
    return input.reviewedEntries;
  }
  if (Array.isArray(input.entries)) {
    return input.entries;
  }
  if (Array.isArray(input.records)) {
    return input.records;
  }
  if (Array.isArray(input.candidates)) {
    return input.candidates;
  }
  return [];
}

function officialBlogKnowledgeContextEntries(input = {}) {
  if (Array.isArray(input)) {
    return input;
  }
  if (!input || typeof input !== "object") {
    return [];
  }

  const entries = [];
  const addArray = (items) => {
    if (Array.isArray(items)) {
      entries.push(...items);
    }
  };

  addArray(input.context_entries);
  addArray(input.contextEntries);
  addArray(input.entries);
  addArray(input.reviewed_entries);
  addArray(input.reviewedEntries);
  addArray(input.review_queue);
  addArray(input.reviewQueue);
  addArray(input.records);
  addArray(input.candidates);
  addArray(input.items);

  for (const section of REPORT_ITEM_SECTIONS) {
    addArray(input[section]);
  }

  if (input.report && typeof input.report === "object") {
    entries.push(...officialBlogKnowledgeContextEntries(input.report));
  }
  if (input.queue && typeof input.queue === "object") {
    addArray(input.queue.review_queue);
    addArray(input.queue.reviewQueue);
    addArray(input.queue.entries);
    addArray(input.queue.candidates);
  }
  if (input.candidate_pool && typeof input.candidate_pool === "object") {
    addArray(input.candidate_pool.candidates);
  }
  if (input.candidatePool && typeof input.candidatePool === "object") {
    addArray(input.candidatePool.candidates);
  }

  if (entries.length === 0 && officialBlogContextEntryLike(input)) {
    entries.push(input);
  }

  return entries;
}

function officialBlogContextEntryLike(value = {}) {
  return Boolean(
    value &&
    typeof value === "object" &&
    (
      value.canonical_url ||
      value.canonicalUrl ||
      value.url ||
      value.source_url ||
      value.primary_url ||
      value.article_url ||
      value.title_original ||
      value.titleOriginal ||
      value.title ||
      value.name ||
      Array.isArray(value.topics) ||
      Array.isArray(value.suggested_topics) ||
      Array.isArray(value.suggestedTopics)
    )
  );
}

function normalizeOfficialBlogContextEntry(rawEntry = {}, context = {}) {
  const canonicalUrl = String(
    rawEntry.canonical_url ||
    rawEntry.canonicalUrl ||
    rawEntry.url ||
    rawEntry.source_url ||
    rawEntry.sourceUrl ||
    rawEntry.primary_url ||
    rawEntry.primaryUrl ||
    rawEntry.article_url ||
    rawEntry.articleUrl ||
    rawEntry.link ||
    rawEntry.href ||
    ""
  ).trim();
  const normalizedUrl = canonicalUrl ? normalizeOfficialBlogUrl(canonicalUrl) : "";
  const rawCompany = rawEntry.company || rawEntry.organization || rawEntry.org || "";
  const company = normalizeOfficialBlogCompany(rawCompany || inferOfficialBlogCompany(normalizedUrl));
  if (rawCompany && !SUPPORTED_COMPANIES.has(company)) {
    throw new Error(`unsupported official blog company at index ${context.index}: ${company || "(missing)"}`);
  }
  if (!rawCompany && company && !SUPPORTED_COMPANIES.has(company)) {
    throw new Error(`unsupported official blog company at index ${context.index}: ${company || "(missing)"}`);
  }

  const titleOriginal = String(rawEntry.title_original || rawEntry.titleOriginal || rawEntry.title || rawEntry.name || "").trim();
  const topics = normalizeOfficialBlogTopicIds(
    officialBlogContextArray(rawEntry.topics || rawEntry.suggested_topics || rawEntry.suggestedTopics || rawEntry.topic),
    `context topics at index ${context.index}`
  );
  const matchedCriteria = uniqueSorted(officialBlogContextArray(
    rawEntry.admission?.matched_criteria ||
    rawEntry.admission?.matchedCriteria ||
    rawEntry.matched_criteria ||
    rawEntry.matchedCriteria
  )).filter((criterion) => OFFICIAL_BLOG_MATCHED_CRITERIA.has(criterion));
  const relatedBlogIds = normalizeOfficialBlogRelatedBlogIds(
    officialBlogContextRelatedBlogIds(rawEntry),
    `context related_blog_ids at index ${context.index}`
  );

  if (!normalizedUrl && !titleOriginal && topics.length === 0 && matchedCriteria.length === 0 && relatedBlogIds.length === 0) {
    throw new Error(`official blog context entry lacks usable identity at index ${context.index}`);
  }

  return {
    index: context.index,
    company,
    canonical_url: canonicalUrl,
    normalized_url: normalizedUrl,
    title_original: titleOriginal,
    topics,
    matched_criteria: matchedCriteria,
    related_blog_ids: relatedBlogIds
  };
}

function officialBlogContextArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    return [value];
  }
  return [];
}

function officialBlogContextRelatedBlogIds(rawEntry = {}) {
  const values = [];
  for (const key of ["related_blog_ids", "relatedBlogIds"]) {
    values.push(...officialBlogContextArray(rawEntry[key]));
  }
  for (const key of ["suggested_related_blog_ids", "suggestedRelatedBlogIds"]) {
    const items = Array.isArray(rawEntry[key]) ? rawEntry[key] : [];
    for (const item of items) {
      if (typeof item === "string") {
        values.push(item);
      } else if (item && typeof item === "object") {
        values.push(item.id || item.record_id || item.recordId || "");
      }
    }
  }
  return values;
}

function officialBlogContextInvalidEntry(rawEntry, index, reason) {
  return {
    index,
    title_original: String(rawEntry?.title_original || rawEntry?.titleOriginal || rawEntry?.title || rawEntry?.name || "").trim(),
    canonical_url: String(
      rawEntry?.canonical_url ||
      rawEntry?.canonicalUrl ||
      rawEntry?.url ||
      rawEntry?.source_url ||
      rawEntry?.primary_url ||
      rawEntry?.article_url ||
      ""
    ).trim(),
    reason
  };
}

function officialBlogContextTopicalMatch(entry, record = {}) {
  const recordTopics = uniqueSorted(record.topics || []);
  const recordCriteria = uniqueSorted(record.admission?.matched_criteria || [])
    .filter((criterion) => OFFICIAL_BLOG_MATCHED_CRITERIA.has(criterion));
  const matchedTopics = intersectionSorted(entry.topics, recordTopics);
  const matchedCriteria = intersectionSorted(entry.matched_criteria, recordCriteria);
  if (matchedTopics.length === 0 && matchedCriteria.length < 2) {
    return null;
  }

  const reasons = [];
  let score = 0;
  if (matchedTopics.length > 0) {
    score += matchedTopics.length * 4;
    reasons.push("shared_topics");
  }
  if (matchedCriteria.length > 0) {
    score += matchedCriteria.length * 2;
    reasons.push("shared_matched_criteria");
  }
  if (entry.company && record.company === entry.company) {
    score += 1;
    reasons.push("same_company_context");
  } else if (isComparableOfficialBlogPractice(entry, record, matchedTopics, matchedCriteria)) {
    score += 1;
    reasons.push("cross_company_comparable_practice");
  }

  return officialBlogContextMatch(entry, record, {
    score,
    reasons,
    matchedTopics,
    matchedCriteria
  });
}

function officialBlogContextMatch(entry, record = {}, options = {}) {
  const recordTopics = uniqueSorted(record.topics || []);
  const recordCriteria = uniqueSorted(record.admission?.matched_criteria || [])
    .filter((criterion) => OFFICIAL_BLOG_MATCHED_CRITERIA.has(criterion));
  return {
    record,
    score: Number(options.score || 0),
    reasons: uniqueSorted(options.reasons || []),
    matched_topics: uniqueSorted(options.matchedTopics || intersectionSorted(entry.topics, recordTopics)),
    matched_criteria: uniqueSorted(options.matchedCriteria || intersectionSorted(entry.matched_criteria, recordCriteria))
  };
}

function mergeOfficialBlogContextMatch(matchesById, entry, match) {
  const id = String(match.record?.id || "");
  if (!id) {
    return;
  }
  const current = matchesById.get(id) || {
    record: match.record,
    score: 0,
    reasons: new Set(),
    matched_topics: new Set(),
    matched_criteria: new Set(),
    source_entry_indexes: new Set()
  };
  current.score += match.score;
  for (const reason of match.reasons) {
    current.reasons.add(reason);
  }
  for (const topic of match.matched_topics) {
    current.matched_topics.add(topic);
  }
  for (const criterion of match.matched_criteria) {
    current.matched_criteria.add(criterion);
  }
  current.source_entry_indexes.add(entry.index);
  matchesById.set(id, current);
}

function officialBlogContextRecord(match) {
  const record = match.record || {};
  return {
    id: String(record.id || ""),
    company: String(record.company || ""),
    company_label: record.company === "anthropic" ? "Anthropic" : record.company === "openai" ? "OpenAI" : String(record.company || ""),
    canonical_url: String(record.canonical_url || ""),
    normalized_url: String(record.normalized_url || safeNormalizeOfficialBlogUrl(record.canonical_url) || ""),
    published_at: String(record.published_at || ""),
    title_original: String(record.title_original || ""),
    title_zh: String(record.title_zh || ""),
    importance: String(record.importance || ""),
    content_type: String(record.content_type || ""),
    topics: uniqueSorted(record.topics || []),
    summary_zh: String(record.summary_zh || ""),
    key_ideas: stringArray(record.key_ideas).slice(0, 5),
    practice_checklist: stringArray(record.practice_checklist).slice(0, 5),
    related_blog_ids: uniqueSorted(record.related_blog_ids || []),
    related_report_dates: uniqueSorted(record.related_report_dates || []),
    score: match.score,
    reasons: uniqueSorted([...match.reasons]),
    matched_topics: uniqueSorted([...match.matched_topics]),
    matched_criteria: uniqueSorted([...match.matched_criteria]),
    source_entry_indexes: [...match.source_entry_indexes].sort((left, right) => left - right)
  };
}

function normalizeOfficialBlogRelationshipCandidate(rawEntry = {}, context = {}) {
  const canonicalUrl = String(rawEntry.canonical_url || rawEntry.canonicalUrl || rawEntry.url || "").trim();
  if (!canonicalUrl) {
    throw new Error(`official blog relationship candidate missing canonical_url at index ${context.index}`);
  }
  const normalizedUrl = normalizeOfficialBlogUrl(canonicalUrl);
  const company = normalizeOfficialBlogCompany(rawEntry.company || inferOfficialBlogCompany(normalizedUrl));
  if (!SUPPORTED_COMPANIES.has(company)) {
    throw new Error(`unsupported official blog company at index ${context.index}: ${company || "(missing)"}`);
  }

  const titleOriginal = String(rawEntry.title_original || rawEntry.titleOriginal || rawEntry.title || "").trim();
  if (!titleOriginal) {
    throw new Error(`official blog relationship candidate missing title_original at index ${context.index}`);
  }

  const publishedAt = officialBlogDateOnly(rawEntry.published_at || rawEntry.publishedAt || rawEntry.event_date || rawEntry.date);
  const topics = normalizeOfficialBlogTopicIds(
    rawEntry.topics || rawEntry.suggested_topics || rawEntry.suggestedTopics || [],
    `relationship topics at index ${context.index}`
  );
  const matchedCriteria = uniqueSorted(rawEntry.admission?.matched_criteria || rawEntry.matched_criteria || rawEntry.matchedCriteria || [])
    .filter((criterion) => OFFICIAL_BLOG_MATCHED_CRITERIA.has(criterion));

  if (topics.length === 0 && matchedCriteria.length === 0) {
    throw new Error(`official blog relationship candidate needs topics or matched_criteria at index ${context.index}`);
  }

  const explicitId = String(rawEntry.id || "").trim();
  const candidateId = OFFICIAL_BLOG_RECORD_ID_RE.test(explicitId)
    ? explicitId
    : publishedAt
      ? officialBlogRecordId({ company, normalizedUrl, publishedAt, titleOriginal })
      : officialBlogIntakeId({ company, normalized_url: normalizedUrl, published_at: "", title_original: titleOriginal }, context);

  return {
    index: context.index,
    candidate_id: candidateId,
    company,
    canonical_url: canonicalUrl,
    normalized_url: normalizedUrl,
    published_at: publishedAt,
    title_original: titleOriginal,
    topics,
    matched_criteria: matchedCriteria
  };
}

function officialBlogRelationshipCandidateBase(candidate) {
  return {
    index: candidate.index,
    candidate_id: candidate.candidate_id,
    company: candidate.company,
    company_label: candidate.company === "anthropic" ? "Anthropic" : "OpenAI",
    canonical_url: candidate.canonical_url,
    normalized_url: candidate.normalized_url,
    published_at: candidate.published_at,
    title_original: candidate.title_original,
    topics: candidate.topics,
    matched_criteria: candidate.matched_criteria
  };
}

function officialBlogRelationshipInvalidEntry(rawEntry, index, reason) {
  return {
    index,
    title_original: String(rawEntry?.title_original || rawEntry?.titleOriginal || rawEntry?.title || "").trim(),
    canonical_url: String(rawEntry?.canonical_url || rawEntry?.canonicalUrl || rawEntry?.url || "").trim(),
    reason
  };
}

function officialBlogRelationshipMatch(candidate, record = {}) {
  const recordTopics = uniqueSorted(record.topics || []);
  const recordCriteria = uniqueSorted(record.admission?.matched_criteria || [])
    .filter((criterion) => OFFICIAL_BLOG_MATCHED_CRITERIA.has(criterion));
  const matchedTopics = intersectionSorted(candidate.topics, recordTopics);
  const matchedCriteria = intersectionSorted(candidate.matched_criteria, recordCriteria);
  const reverseRelated = Array.isArray(record.related_blog_ids) && record.related_blog_ids.includes(candidate.candidate_id);

  if (matchedTopics.length === 0 && matchedCriteria.length === 0 && !reverseRelated) {
    return null;
  }

  const reasons = [];
  let score = 0;
  if (matchedTopics.length > 0) {
    score += matchedTopics.length * 4;
    reasons.push("shared_topics");
  }
  if (matchedCriteria.length > 0) {
    score += matchedCriteria.length * 2;
    reasons.push("shared_matched_criteria");
  }
  if (reverseRelated) {
    score += 3;
    reasons.push("existing_reverse_relation");
  }
  if (record.company === candidate.company) {
    score += 1;
    reasons.push("same_company_context");
  } else if (isComparableOfficialBlogPractice(candidate, record, matchedTopics, matchedCriteria)) {
    score += 1;
    reasons.push("cross_company_comparable_practice");
  }

  return {
    id: String(record.id || ""),
    company: String(record.company || ""),
    company_label: record.company === "anthropic" ? "Anthropic" : record.company === "openai" ? "OpenAI" : String(record.company || ""),
    canonical_url: String(record.canonical_url || ""),
    normalized_url: String(record.normalized_url || safeNormalizeOfficialBlogUrl(record.canonical_url) || ""),
    published_at: String(record.published_at || ""),
    title_original: String(record.title_original || ""),
    title_zh: String(record.title_zh || ""),
    topics: recordTopics,
    matched_topics: matchedTopics,
    matched_criteria: matchedCriteria,
    score,
    reasons
  };
}

function isComparableOfficialBlogPractice(candidate, record, matchedTopics, matchedCriteria) {
  if (matchedTopics.length === 0 && matchedCriteria.length === 0) {
    return false;
  }
  const comparableCriteria = new Set(["engineering_practice", "harness_engineering", "agent_workflow", "eval_methodology", "safety_engineering"]);
  return [...candidate.matched_criteria, ...(record.admission?.matched_criteria || [])]
    .some((criterion) => comparableCriteria.has(criterion));
}

function intersectionSorted(left, right) {
  const rightSet = new Set(uniqueSorted(right));
  return uniqueSorted(left).filter((item) => rightSet.has(item));
}

function normalizeOfficialBlogKnowledgeDraftEntry(rawEntry = {}, context = {}) {
  const reviewDecision = normalizeOfficialBlogReviewDecision(
    rawEntry.review_decision ||
    rawEntry.reviewDecision ||
    rawEntry.review?.decision ||
    rawEntry.authoring_review?.decision ||
    rawEntry.authoringReview?.decision
  );
  const admissionDecision = normalizeOfficialBlogReviewDecision(rawEntry.admission?.decision || "include");
  if (reviewDecision !== "include" || admissionDecision !== "include") {
    throw new Error(`reviewed include approval is required at index ${context.index}`);
  }

  const canonicalUrl = String(rawEntry.canonical_url || rawEntry.canonicalUrl || rawEntry.url || "").trim();
  if (!canonicalUrl) {
    throw new Error(`official blog knowledge draft missing canonical_url at index ${context.index}`);
  }
  const normalizedUrl = normalizeOfficialBlogUrl(canonicalUrl);
  const company = normalizeOfficialBlogCompany(rawEntry.company || inferOfficialBlogCompany(normalizedUrl));
  if (!SUPPORTED_COMPANIES.has(company)) {
    throw new Error(`unsupported official blog company at index ${context.index}: ${company || "(missing)"}`);
  }

  const publishedAt = officialBlogDateOnly(rawEntry.published_at || rawEntry.publishedAt || rawEntry.event_date || rawEntry.date);
  if (!publishedAt) {
    throw new Error(`official blog knowledge draft missing valid published_at at index ${context.index}`);
  }

  const titleOriginal = requiredOfficialBlogString(rawEntry.title_original || rawEntry.titleOriginal || rawEntry.title, `title_original at index ${context.index}`);
  const titleZh = requiredOfficialBlogString(rawEntry.title_zh || rawEntry.titleZh, `title_zh at index ${context.index}`);
  const summaryZh = requiredOfficialBlogString(rawEntry.summary_zh || rawEntry.summaryZh, `summary_zh at index ${context.index}`);
  if (summaryZh.length < 40) {
    throw new Error(`official blog summary_zh must be at least 40 characters at index ${context.index}`);
  }
  if (summaryZh.length > MAX_DIGEST_LENGTH) {
    throw new Error(`possible full-text translation detected at index ${context.index}: summary_zh exceeds ${MAX_DIGEST_LENGTH} characters`);
  }

  const importance = String(rawEntry.importance || "").trim();
  if (!OFFICIAL_BLOG_IMPORTANCE_VALUES.has(importance)) {
    throw new Error(`invalid official blog importance at index ${context.index}: ${importance || "(missing)"}`);
  }
  const contentType = String(rawEntry.content_type || rawEntry.contentType || "").trim();
  if (!OFFICIAL_BLOG_CONTENT_TYPES.has(contentType)) {
    throw new Error(`invalid official blog content_type at index ${context.index}: ${contentType || "(missing)"}`);
  }

  const topics = normalizeOfficialBlogTopicIds(
    rawEntry.topics || rawEntry.suggested_topics || rawEntry.suggestedTopics || [],
    `topics at index ${context.index}`
  );
  if (topics.length === 0) {
    throw new Error(`official blog record topics must be non-empty at index ${context.index}`);
  }

  const keyIdeas = stringArray(rawEntry.key_ideas || rawEntry.keyIdeas);
  if (keyIdeas.length < 3 || keyIdeas.length > 7) {
    throw new Error(`official blog key_ideas must contain 3-7 items at index ${context.index}`);
  }
  const practiceChecklist = stringArray(rawEntry.practice_checklist || rawEntry.practiceChecklist);
  if (practiceChecklist.length > 7) {
    throw new Error(`official blog practice_checklist must contain at most 7 items at index ${context.index}`);
  }

  const matchedCriteria = uniqueSorted(rawEntry.admission?.matched_criteria || rawEntry.matched_criteria || rawEntry.matchedCriteria || [])
    .filter((criterion) => OFFICIAL_BLOG_MATCHED_CRITERIA.has(criterion));
  if (matchedCriteria.length === 0) {
    throw new Error(`official blog admission matched_criteria must be non-empty at index ${context.index}`);
  }
  const admissionRationale = requiredOfficialBlogString(
    rawEntry.admission?.rationale ||
    rawEntry.admission_rationale ||
    rawEntry.admissionRationale ||
    rawEntry.review?.rationale ||
    rawEntry.authoring_review?.rationale ||
    rawEntry.admission?.reason,
    `admission rationale at index ${context.index}`
  );

  const id = String(rawEntry.id || officialBlogRecordId({
    company,
    normalizedUrl,
    publishedAt,
    titleOriginal
  })).trim();
  if (!OFFICIAL_BLOG_RECORD_ID_RE.test(id)) {
    throw new Error(`invalid official blog record id at index ${context.index}: ${id || "(missing)"}`);
  }

  return normalizeOfficialBlogRecord({
    id,
    company,
    canonical_url: canonicalUrl,
    normalized_url: normalizedUrl,
    published_at: publishedAt,
    title_original: titleOriginal,
    title_zh: titleZh,
    importance,
    content_type: contentType,
    topics,
    admission: {
      decision: "include",
      rationale: admissionRationale,
      matched_criteria: matchedCriteria
    },
    summary_zh: summaryZh,
    key_ideas: keyIdeas,
    practice_checklist: practiceChecklist,
    related_blog_ids: normalizeOfficialBlogRelatedBlogIds(rawEntry.related_blog_ids || rawEntry.relatedBlogIds || [], `related_blog_ids at index ${context.index}`),
    related_report_dates: normalizeOfficialBlogRelatedReportDates(rawEntry.related_report_dates || rawEntry.relatedReportDates || [], `related_report_dates at index ${context.index}`)
  });
}

function normalizeOfficialBlogReviewDecision(value) {
  return String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function requiredOfficialBlogString(value, label) {
  const text = String(value || "").trim();
  if (!text) {
    throw new Error(`official blog knowledge draft missing ${label}`);
  }
  return text;
}

function officialBlogRecordId({ company, normalizedUrl, publishedAt, titleOriginal }) {
  const url = new URL(normalizedUrl);
  const pathSlug = url.pathname.split("/").filter(Boolean).pop() || titleOriginal;
  const slug = slugifyOfficialBlogToken(pathSlug || titleOriginal) || "official-blog";
  return `${company}-${slug}-${publishedAt}`;
}

function normalizeOfficialBlogTopicIds(items, label) {
  const values = uniqueSorted(items);
  for (const value of values) {
    if (!OFFICIAL_BLOG_TOPIC_ID_RE.test(value)) {
      throw new Error(`invalid official blog ${label}: ${value}`);
    }
  }
  return values;
}

function normalizeOfficialBlogRelatedBlogIds(items, label) {
  const values = uniqueSorted(items);
  for (const value of values) {
    if (!OFFICIAL_BLOG_RECORD_ID_RE.test(value)) {
      throw new Error(`invalid official blog ${label}: ${value}`);
    }
  }
  return values;
}

function normalizeOfficialBlogRelatedReportDates(items, label) {
  const values = [];
  for (const item of Array.isArray(items) ? items : []) {
    const date = officialBlogDateOnly(item);
    if (!date) {
      throw new Error(`invalid official blog ${label}: ${String(item || "").trim() || "(missing)"}`);
    }
    values.push(date);
  }
  return uniqueSorted(values);
}

function officialBlogKnowledgeDraftInvalidEntry(rawEntry, index, reason) {
  return {
    index,
    title_original: String(rawEntry?.title_original || rawEntry?.titleOriginal || rawEntry?.title || "").trim(),
    canonical_url: String(rawEntry?.canonical_url || rawEntry?.canonicalUrl || rawEntry?.url || "").trim(),
    reason
  };
}

function normalizeOfficialBlogIntakeCandidate(rawCandidate = {}, context = {}) {
  const canonicalUrl = String(rawCandidate.canonical_url || rawCandidate.canonicalUrl || rawCandidate.url || "").trim();
  if (!canonicalUrl) {
    throw new Error(`official blog intake candidate missing URL at index ${context.index}`);
  }

  const normalizedUrl = normalizeOfficialBlogUrl(canonicalUrl);
  const company = normalizeOfficialBlogCompany(rawCandidate.company || inferOfficialBlogCompany(normalizedUrl));
  if (!SUPPORTED_COMPANIES.has(company)) {
    throw new Error(`unsupported official blog company at index ${context.index}: ${company || "(missing)"}`);
  }

  const title = String(rawCandidate.title_original || rawCandidate.titleOriginal || rawCandidate.title || "").trim();
  if (!title) {
    throw new Error(`official blog intake candidate missing title at index ${context.index}`);
  }

  const openingParagraphCount = cappedOfficialBlogPreviewEntryParagraphs(rawCandidate).length;
  const openingPreview = officialBlogOpeningPreview(rawCandidate);
  const publishedAt = String(rawCandidate.published_at || rawCandidate.publishedAt || "").trim();
  const candidate = {
    company,
    canonical_url: canonicalUrl,
    normalized_url: normalizedUrl,
    published_at: publishedAt,
    title_original: title,
    opening_preview: openingPreview,
    opening_paragraph_count: openingParagraphCount,
    source_label: String(rawCandidate.source_label || rawCandidate.source || "").trim()
  };
  candidate.intake_id = officialBlogIntakeId(candidate, context);
  return candidate;
}

function normalizeOfficialBlogCompany(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "openai" || normalized === "openai blog") {
    return "openai";
  }
  if (normalized === "anthropic" || normalized === "anthropic blog") {
    return "anthropic";
  }
  return normalized;
}

function inferOfficialBlogCompany(value) {
  try {
    const hostname = new URL(String(value || "")).hostname.toLowerCase();
    if (hostname === "openai.com" || hostname.endsWith(".openai.com")) {
      return "openai";
    }
    if (hostname === "anthropic.com" || hostname.endsWith(".anthropic.com")) {
      return "anthropic";
    }
  } catch {
    return "";
  }
  return "";
}

function officialBlogIntakeCandidateBase(candidate) {
  return {
    intake_id: candidate.intake_id,
    company: candidate.company,
    company_label: candidate.company === "anthropic" ? "Anthropic" : "OpenAI",
    canonical_url: candidate.canonical_url,
    normalized_url: candidate.normalized_url,
    published_at: candidate.published_at,
    title_original: candidate.title_original,
    opening_preview: candidate.opening_preview,
    opening_paragraph_count: candidate.opening_paragraph_count,
    source_label: candidate.source_label
  };
}

function officialBlogIntakeId(candidate, context = {}) {
  const url = new URL(candidate.normalized_url);
  const pathSlug = url.pathname.split("/").filter(Boolean).pop() || url.hostname;
  const slug = slugifyOfficialBlogToken(pathSlug || candidate.title_original) || `candidate-${context.index || 0}`;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(candidate.published_at) ? candidate.published_at : "undated";
  return `${candidate.company}-${slug}-${date}`;
}

function slugifyOfficialBlogToken(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function normalizeOfficialBlogRecord(record, context = {}) {
  const value = record && typeof record === "object" ? structuredClone(record) : {};
  const fileLabel = context.file ? ` in ${context.file}` : "";
  if (!SUPPORTED_COMPANIES.has(value.company)) {
    throw new Error(`unsupported company${fileLabel}: ${value.company || "(missing)"}`);
  }
  if (!Array.isArray(value.topics) || value.topics.length === 0) {
    throw new Error(`official blog record topics must be non-empty${fileLabel}`);
  }
  if (value.admission?.decision !== "include") {
    throw new Error(`excluded records are not publishable knowledge${fileLabel}: ${value.id || "(missing id)"}`);
  }
  if (!String(value.summary_zh || "").trim()) {
    throw new Error(`official blog summary_zh must be non-empty${fileLabel}`);
  }
  if (String(value.summary_zh || "").length > MAX_DIGEST_LENGTH) {
    throw new Error(`possible full-text translation detected${fileLabel}: summary_zh exceeds ${MAX_DIGEST_LENGTH} characters`);
  }

  value.normalized_url = normalizeOfficialBlogUrl(value.canonical_url);
  value.topics = uniqueSorted(value.topics.map((topic) => String(topic || "").trim()).filter(Boolean));
  value.related_blog_ids = uniqueSorted(value.related_blog_ids || []);
  value.related_report_dates = uniqueSorted(value.related_report_dates || []);
  value.practice_checklist = Array.isArray(value.practice_checklist) ? value.practice_checklist : [];
  return value;
}

function assertUniqueRecords(records) {
  const byId = new Map();
  const byUrl = new Map();
  for (const record of records) {
    if (byId.has(record.id)) {
      throw new Error(`duplicate id in official blog knowledge: ${record.id}`);
    }
    byId.set(record.id, record);
    if (byUrl.has(record.normalized_url)) {
      throw new Error(`duplicate canonical_url in official blog knowledge: ${record.canonical_url}`);
    }
    byUrl.set(record.normalized_url, record);
  }
}

function buildOfficialBlogKnowledgeIndex(records) {
  const sortedRecords = [...records].sort((left, right) =>
    String(right.published_at || "").localeCompare(String(left.published_at || "")) ||
    String(left.id || "").localeCompare(String(right.id || ""))
  );
  const companies = uniqueSorted(sortedRecords.map((record) => record.company));
  const topics = uniqueSorted(sortedRecords.flatMap((record) => record.topics));
  const byCompany = { anthropic: 0, openai: 0 };
  const byImportance = {};
  for (const record of sortedRecords) {
    byCompany[record.company] = (byCompany[record.company] || 0) + 1;
    byImportance[record.importance] = (byImportance[record.importance] || 0) + 1;
  }

  return {
    schema_version: 1,
    admission_policy: officialBlogAdmissionPolicyArtifact(),
    companies,
    topics,
    stats: {
      total_records: sortedRecords.length,
      by_company: byCompany,
      by_importance: byImportance
    },
    records: sortedRecords
  };
}

function officialBlogAdmissionPolicyArtifact() {
  return structuredClone(OFFICIAL_BLOG_ADMISSION_POLICY);
}

function officialBlogAiReviewContract() {
  return {
    version: "official-blog-ai-review-v1",
    review_basis: "title_and_opening_preview_only",
    instructions: [
      "Review every item using only title_original and opening_preview.",
      "Do not use full article bodies, source audit, candidate pools, or external browsing for first-pass admission.",
      "Return one decision per review item: include, needs_review, or exclude.",
      "Use include only for durable product, model, engineering, harness, agent workflow, eval, or safety-engineering knowledge value visible in the opening preview.",
      "Use needs_review for customer or partnership stories that hint at concrete reusable implementation detail but need manual reading before curation.",
      "Use exclude for ordinary partnership, customer adoption, company news, event, hiring, sales, regional, or broad enterprise workflow updates."
    ],
    decision_values: ["include", "needs_review", "exclude"],
    required_output_fields: [
      "intake_id",
      "decision",
      "matched_criteria",
      "suggested_topics",
      "rationale",
      "confidence"
    ],
    allowed_matched_criteria: [...OFFICIAL_BLOG_MATCHED_CRITERIA].sort(),
    forbidden_inputs: [
      "full_article_body",
      "body",
      "content_html",
      "source_audit",
      "candidate_pool",
      "public_rendering_html"
    ],
    manual_approval_required_for: [
      "needs_review_customer_or_partnership_story",
      "curated_record_authoring",
      "translation_or_summary_publication"
    ]
  };
}

async function collectJsonFiles(dir) {
  try {
    const stat = await fs.stat(dir);
    if (!stat.isDirectory()) {
      return [];
    }
  } catch {
    return [];
  }

  const files = [];
  await walk(dir, files);
  return files.filter((file) => file.toLowerCase().endsWith(".json")).sort();
}

async function walk(dir, files) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath, files);
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
}

function createAjv() {
  const ajv = new Ajv({
    allErrors: true,
    strict: true
  });
  ajv.addFormat("date", {
    type: "string",
    validate(value) {
      return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
    }
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

function officialBlogOpeningPreview(preview = {}) {
  const explicitParagraphs = Array.isArray(preview.opening_paragraphs)
    ? preview.opening_paragraphs
    : Array.isArray(preview.openingParagraphs)
      ? preview.openingParagraphs
      : null;
  const source = explicitParagraphs
    ? explicitParagraphs.join("\n\n")
    : String(
        preview.opening_preview ||
        preview.openingPreview ||
        preview.opening_excerpt ||
        preview.openingExcerpt ||
        preview.excerpt ||
        preview.summary ||
        ""
      );
  return source
    .split(/\n\s*\n/g)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, TRIAGE_OPENING_PARAGRAPH_LIMIT)
    .join(" ")
    .slice(0, TRIAGE_OPENING_CHAR_LIMIT)
    .trim();
}

function hasConcreteImplementationDetail(text) {
  return hasAny(text, [
    "agent workflow",
    "agent workflows",
    "api integration guidance",
    "architecture",
    "benchmark",
    "code example",
    "computer use",
    "deployment constraint",
    "environment management",
    "eval harness",
    "evaluation harness",
    "failure mode",
    "implementation detail",
    "json schema",
    "memory",
    "model context protocol",
    "mcp",
    "multi agent",
    "observability",
    "orchestration",
    "permission model",
    "permissions",
    "production agents",
    "regression checks",
    "rollout control",
    "rollout controls",
    "routing",
    "sandbox",
    "sdk architecture",
    "structured outputs",
    "system card",
    "tool execution"
  ]);
}

function addIf(condition, target, value) {
  if (condition && !target.includes(value)) {
    target.push(value);
  }
}

function addTopicIf(text, target, topic, aliases) {
  if (hasAny(text, aliases) && !target.includes(topic)) {
    target.push(topic);
  }
}

function hasAny(text, needles) {
  return needles.some((needle) => text.includes(normalizeText(needle)));
}

function hasCustomerCaseFraming(text) {
  return [
    /\bhow\s+[a-z0-9]+(?:\s+[a-z0-9]+){0,4}\s+(uses|used|adopts|adopted|deploys|deployed|built)\b/,
    /\b[a-z0-9]+(?:\s+[a-z0-9]+){0,4}\s+(uses|used|adopts|adopted|deploys|deployed)\s+(claude|openai|chatgpt|codex)\b/
  ].some((pattern) => pattern.test(text)) || hasAny(text, ["customer story", "case study", "use case"]);
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[._/:-]+/g, " ")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stringArray(items) {
  return (Array.isArray(items) ? items : []).map((item) => String(item || "").trim()).filter(Boolean);
}

function uniqueSorted(items) {
  return [...new Set((Array.isArray(items) ? items : []).map((item) => String(item || "").trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
}
