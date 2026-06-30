import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  loadOfficialBlogKnowledge,
  normalizeOfficialBlogUrl,
  triageOfficialBlogPreview
} from "../src/official-blog-knowledge.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");

async function withTempKnowledge(records, fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "official-blog-knowledge-"));
  try {
    for (const [index, record] of records.entries()) {
      const company = record.company || "openai";
      const companyDir = path.join(dir, company);
      await fs.mkdir(companyDir, { recursive: true });
      await fs.writeFile(
        path.join(companyDir, `${index}-${record.id || crypto.randomUUID()}.json`),
        JSON.stringify(record, null, 2),
        "utf8"
      );
    }
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

const baseRecord = {
  id: "openai-structured-outputs-2024-08-06",
  company: "openai",
  canonical_url: "https://openai.com/index/introducing-structured-outputs-in-the-api/",
  published_at: "2024-08-06",
  title_original: "Introducing structured outputs in the API",
  title_zh: "OpenAI API 引入结构化输出",
  importance: "foundational",
  content_type: "best_practice",
  topics: ["structured_outputs", "api_reliability"],
  admission: {
    decision: "include",
    rationale: "Introduces a reusable API reliability primitive with concrete implementation guidance.",
    matched_criteria: ["new_product", "engineering_practice"]
  },
  summary_zh: "这篇文章说明 OpenAI 如何把模型输出约束为开发者声明的 JSON Schema，从而降低解析、重试和下游集成成本。",
  key_ideas: [
    "结构化输出把可靠性约束前移到模型调用接口。",
    "严格 schema 能减少应用层解析和修复逻辑。",
    "它适合表单抽取、工具调用参数生成和工作流状态写入。"
  ],
  practice_checklist: [
    "为模型输出定义明确 JSON Schema。",
    "把 schema 校验失败纳入重试和降级路径。"
  ],
  related_blog_ids: [],
  related_report_dates: []
};

test("official blog knowledge loads curated OpenAI and Anthropic records", async () => {
  const records = [
    baseRecord,
    {
      ...baseRecord,
      id: "anthropic-building-effective-agents-2024-12-19",
      company: "anthropic",
      canonical_url: "https://www.anthropic.com/research/building-effective-agents",
      published_at: "2024-12-19",
      title_original: "Building effective agents",
      title_zh: "构建有效智能体",
      content_type: "engineering_note",
      topics: ["agent", "harness_engineering"],
      admission: {
        decision: "include",
        rationale: "Provides engineering patterns for agent workflows and evaluation loops.",
        matched_criteria: ["engineering_practice", "agent_workflow"]
      }
    }
  ];
  const index = await withTempKnowledge(records, (knowledgeDir) => loadOfficialBlogKnowledge({ knowledgeDir }));
  assert.equal(index.schema_version, 1);
  assert.equal(index.records.length, 2);
  assert.deepEqual(index.stats.by_company, { anthropic: 1, openai: 1 });
  assert.deepEqual(index.companies, ["anthropic", "openai"]);
  assert(index.topics.includes("agent"));
  assert(index.topics.includes("structured_outputs"));
});

test("official blog knowledge rejects duplicate ids and canonical URLs", async () => {
  await assert.rejects(
    () => withTempKnowledge([
      baseRecord,
      {
        ...baseRecord,
        id: "openai-structured-outputs-copy",
        canonical_url: "https://openai.com/index/introducing-structured-outputs-in-the-api/?utm_source=newsletter#section"
      }
    ], (knowledgeDir) => loadOfficialBlogKnowledge({ knowledgeDir })),
    /duplicate canonical_url/i
  );

  await assert.rejects(
    () => withTempKnowledge([
      baseRecord,
      { ...baseRecord, canonical_url: "https://openai.com/index/another-article/" }
    ], (knowledgeDir) => loadOfficialBlogKnowledge({ knowledgeDir })),
    /duplicate id/i
  );
});

test("official blog knowledge rejects unsupported companies, empty topics, excluded records, and full-text sized summaries", async () => {
  await assert.rejects(
    () => withTempKnowledge([{ ...baseRecord, company: "google" }], (knowledgeDir) => loadOfficialBlogKnowledge({ knowledgeDir })),
    /unsupported company/i
  );
  await assert.rejects(
    () => withTempKnowledge([{ ...baseRecord, topics: [] }], (knowledgeDir) => loadOfficialBlogKnowledge({ knowledgeDir })),
    /topics/i
  );
  await assert.rejects(
    () => withTempKnowledge([{ ...baseRecord, admission: { decision: "exclude", rationale: "customer announcement", matched_criteria: [] } }], (knowledgeDir) => loadOfficialBlogKnowledge({ knowledgeDir })),
    /excluded records/i
  );
  await assert.rejects(
    () => withTempKnowledge([{ ...baseRecord, summary_zh: "这是一段过长的摘要。".repeat(260) }], (knowledgeDir) => loadOfficialBlogKnowledge({ knowledgeDir })),
    /full-text translation/i
  );
});

test("official blog URL normalization removes tracking noise without changing article identity", () => {
  assert.equal(
    normalizeOfficialBlogUrl("https://openai.com/index/introducing-structured-outputs-in-the-api/?utm_source=x&ref=foo#details"),
    "https://openai.com/index/introducing-structured-outputs-in-the-api"
  );
  assert.equal(
    normalizeOfficialBlogUrl("https://www.anthropic.com/research/building-effective-agents/"),
    "https://www.anthropic.com/research/building-effective-agents"
  );
});

test("official blog admission triage includes technical/product increments", () => {
  const result = triageOfficialBlogPreview({
    title: "Building effective agents",
    excerpt: "This article shares patterns for agent workflows, evaluation harnesses, tool use, orchestration, and when to use multi-agent systems."
  });
  assert.equal(result.admission, "include");
  assert.equal(result.knowledge_value, "major");
  assert(result.matched_criteria.includes("engineering_practice"));
  assert(result.suggested_topics.includes("agent"));
});

test("official blog admission triage excludes ordinary partnerships and customer news", () => {
  const result = triageOfficialBlogPreview({
    title: "OpenAI and ExampleCorp expand strategic partnership",
    excerpt: "The companies will bring AI to more employees and customers across global markets. Leaders discussed shared values and future collaboration."
  });
  assert.equal(result.admission, "exclude");
  assert.equal(result.knowledge_value, "none");
  assert.equal(result.excluded_as, "company_news");
});

test("official blog admission triage excludes ordinary customer use announcements", () => {
  const result = triageOfficialBlogPreview({
    title: "ExampleCorp uses Claude across support teams",
    excerpt: "The company says the rollout will help support teams answer requests faster."
  });
  assert.equal(result.admission, "exclude");
  assert.equal(result.knowledge_value, "none");
  assert.equal(result.excluded_as, "company_news");
});

test("official blog admission triage keeps borderline customer stories for review when implementation detail is hinted", () => {
  const result = triageOfficialBlogPreview({
    title: "How ExampleBank built a multi-agent support workflow with Claude",
    excerpt: "The team describes routing, tool permissions, evaluation harnesses, observability, and rollout controls for production support agents."
  });
  assert.equal(result.admission, "needs_review");
  assert(result.matched_criteria.includes("agent_workflow"));
  assert(result.suggested_topics.includes("harness_engineering"));
});

test("official blog admission triage sends technical customer use framing to review", () => {
  const result = triageOfficialBlogPreview({
    title: "How ExampleCorp uses Claude for support",
    excerpt: "Includes routing, permissions, evaluation harness, observability, and rollout controls."
  });
  assert.equal(result.admission, "needs_review");
  assert(result.matched_criteria.includes("engineering_practice"));
  assert(result.suggested_topics.includes("evals"));
});

test("repository seed knowledge includes curated OpenAI and Anthropic records", async () => {
  const index = await loadOfficialBlogKnowledge({ rootDir });
  assert(index.records.length >= 6, `expected at least 6 seed records, got ${index.records.length}`);
  assert(index.stats.by_company.openai >= 3, "expected at least 3 OpenAI seed records");
  assert(index.stats.by_company.anthropic >= 3, "expected at least 3 Anthropic seed records");
  assert(index.records.every((record) => record.admission.decision === "include"));
  assert(index.records.some((record) => record.topics.includes("harness_engineering")));
  assert(index.records.some((record) => record.topics.includes("structured_outputs")));
});
