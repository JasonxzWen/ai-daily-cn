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
    "customer stories that only say a company adopted OpenAI or Claude"
  ],
  review: "Use needs_review when a partnership or customer story hints at concrete architecture, evals, permissions, workflow, or rollout controls but the preview is not enough to prove durable knowledge value."
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
  const excerpt = String(preview.excerpt || preview.summary || "");
  const text = normalizeText(`${title} ${excerpt}`);
  const matchedCriteria = [];
  const suggestedTopics = [];

  addIf(hasAny(text, ["codex", "claude code", "agent sdk", "responses api", "structured outputs", "model context protocol", "mcp connector", "computer use"]), matchedCriteria, "new_product");
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

  if (companyNews && matchedCriteria.length === 0) {
    return {
      admission: "exclude",
      reason: "Company news or partnership/customer announcement without concrete reusable product, model, or engineering practice detail.",
      matched_criteria: [],
      excluded_as: "company_news",
      knowledge_value: "none",
      suggested_topics: []
    };
  }

  if (companyNews && matchedCriteria.length > 0) {
    return {
      admission: "needs_review",
      reason: "Customer or partnership framing hints at technical implementation detail; read beyond the preview before admitting.",
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

function uniqueSorted(items) {
  return [...new Set((Array.isArray(items) ? items : []).map((item) => String(item || "").trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
}
