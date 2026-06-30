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
  scope: "Curated OpenAI and Anthropic official blogs with durable product, model, technical-practice, harness, agent workflow, eval, safety-engineering, or implementation knowledge value.",
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
  review: "First pass should use only the title plus opening preview/first paragraphs, not the full article body. Use needs_review when a partnership or customer story hints at concrete architecture, evals, permissions, observability, agent workflow, or rollout controls but the opening preview is not enough to prove durable knowledge value."
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

function officialBlogIntakeCandidates(input = {}) {
  if (Array.isArray(input)) {
    return input;
  }
  if (Array.isArray(input.candidates)) {
    return input.candidates;
  }
  if (Array.isArray(input.items)) {
    return input.items;
  }
  return [];
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

  const openingPreview = officialBlogOpeningPreview(rawCandidate);
  const publishedAt = String(rawCandidate.published_at || rawCandidate.publishedAt || "").trim();
  const candidate = {
    company,
    canonical_url: canonicalUrl,
    normalized_url: normalizedUrl,
    published_at: publishedAt,
    title_original: title,
    opening_preview: openingPreview,
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
    admission_policy: OFFICIAL_BLOG_ADMISSION_POLICY,
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
