import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  OFFICIAL_BLOG_ADMISSION_POLICY,
  createOfficialBlogAuthoringBrief,
  createOfficialBlogKnowledgeContext,
  createOfficialBlogKnowledgeDrafts,
  createOfficialBlogPreviewFeed,
  createOfficialBlogReviewedAuthoring,
  createOfficialBlogAiReviewHandoff,
  createOfficialBlogReviewSession,
  createOfficialBlogIntakeQueue,
  createOfficialBlogRelationshipSuggestions,
  createOfficialBlogReviewDecisions,
  createOfficialBlogReviewPacket,
  loadOfficialBlogKnowledge,
  normalizeOfficialBlogUrl,
  toPublicOfficialBlogKnowledge,
  validateOfficialBlogKnowledge,
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

test("official blog admission threshold excludes generic partnership workflow news", () => {
  const result = triageOfficialBlogPreview({
    title: "OpenAI and ExampleCorp launch an enterprise AI partnership",
    excerpt: "The companies will bring AI tools to more employees and improve business workflows across sales and support teams."
  });
  assert.equal(result.admission, "exclude");
  assert.equal(result.knowledge_value, "none");
  assert.equal(result.excluded_as, "company_news");
});

test("official blog admission threshold excludes generic API partnership news", () => {
  const result = triageOfficialBlogPreview({
    title: "OpenAI and ExampleCorp expand enterprise API partnership",
    excerpt: "The companies will bring API tools to more teams and improve everyday business workflows for employees and customers."
  });
  assert.equal(result.admission, "exclude");
  assert.equal(result.knowledge_value, "none");
  assert.equal(result.excluded_as, "company_news");
});

test("official blog admission threshold uses only the opening preview for first-pass triage", () => {
  const result = triageOfficialBlogPreview({
    title: "OpenAI and ExampleCorp expand strategic partnership",
    summary: [
      "OpenAI and ExampleCorp announced a broader partnership to bring AI tools to employees and customers.",
      "Executives said the collaboration will support future business workflows across global markets.",
      "Later paragraphs mention routing architecture, evaluation harnesses, tool permissions, and rollout controls."
    ].join("\n\n")
  });
  assert.equal(result.admission, "exclude");
  assert.equal(result.excluded_as, "company_news");
  assert.deepEqual(result.matched_criteria, []);
});

test("official blog admission threshold includes new models and engineering practice previews", () => {
  const model = triageOfficialBlogPreview({
    title: "Introducing ExampleModel 5",
    excerpt: "This new model release describes capabilities, benchmark results, evals, safety mitigations, and integration guidance."
  });
  assert.equal(model.admission, "include");
  assert(model.matched_criteria.includes("new_model"));
  assert(model.suggested_topics.includes("evals"));

  const practice = triageOfficialBlogPreview({
    title: "Harness engineering for long-running agents",
    excerpt: "This engineering note explains environment management, sandbox boundaries, observability, regression checks, and failure modes for long-running agent workflows."
  });
  assert.equal(practice.admission, "include");
  assert.equal(practice.knowledge_value, "major");
  assert(practice.matched_criteria.includes("harness_engineering"));
});

test("official blog admission threshold sends concrete implementation customer stories to review", () => {
  const result = triageOfficialBlogPreview({
    title: "How ExampleBank built a Claude support workflow",
    excerpt: "The opening preview describes routing architecture, tool permissions, evaluation harnesses, observability, and rollout controls for production agents."
  });
  assert.equal(result.admission, "needs_review");
  assert(result.matched_criteria.includes("engineering_practice"));
  assert(result.suggested_topics.includes("evals"));
});

test("official blog intake creates an internal review queue from opening previews", async () => {
  const existingIndex = await loadOfficialBlogKnowledge({ rootDir });
  const result = createOfficialBlogIntakeQueue({
    candidates: [
      {
        company: "openai",
        canonical_url: "https://openai.com/index/introducing-examplemodel-5/?utm_source=newsletter",
        published_at: "2026-06-30",
        title: "Introducing ExampleModel 5",
        opening_paragraphs: [
          "Today we are releasing a new model with improved coding capabilities, benchmark results, evals, safety mitigations, and integration guidance.",
          "The post explains model behavior changes and deployment constraints for developers."
        ]
      },
      {
        company: "anthropic",
        url: "https://www.anthropic.com/news/examplebank-claude-support",
        published_at: "2026-06-30",
        title_original: "How ExampleBank built a Claude support workflow",
        opening_preview: "The opening preview describes routing architecture, tool permissions, evaluation harnesses, observability, and rollout controls for production agents."
      },
      {
        company: "openai",
        canonical_url: "https://openai.com/index/new-developer-product-for-agents",
        published_at: "2026-06-30",
        title: "Launching a new developer product for agent orchestration",
        opening_preview: "This new developer product adds a developer platform primitive for orchestrating tool calls, deployment constraints, and integration guidance."
      },
      {
        company: "openai",
        canonical_url: "https://openai.com/news/examplecorp-partnership",
        published_at: "2026-06-30",
        title: "OpenAI and ExampleCorp expand enterprise API partnership",
        excerpt: "The companies will bring API tools to more teams and improve everyday business workflows for employees and customers."
      },
      {
        company: "openai",
        canonical_url: "https://openai.com/news/strategic-partnership",
        published_at: "2026-06-30",
        title: "OpenAI and ExampleCorp expand strategic partnership",
        summary: [
          "OpenAI and ExampleCorp announced a broader partnership to bring AI tools to employees and customers.",
          "Executives said the collaboration will support future business workflows across global markets.",
          "Later paragraphs mention routing architecture, evaluation harnesses, tool permissions, and rollout controls."
        ].join("\n\n")
      },
      {
        company: "openai",
        canonical_url: "https://openai.com/index/introducing-structured-outputs-in-the-api/?ref=queue",
        published_at: "2024-08-06",
        title: "Introducing structured outputs in the API",
        opening_preview: "Existing curated record should not be queued again."
      },
      {
        company: "openai",
        canonical_url: "https://openai.com/index/introducing-examplemodel-5/#details",
        published_at: "2026-06-30",
        title: "Introducing ExampleModel 5 duplicate",
        opening_preview: "Duplicate candidate URL should not be queued again."
      }
    ]
  }, {
    existingIndex,
    reportDate: "2026-06-30",
    generatedAt: "2026-06-30T08:00:00.000Z"
  });

  assert.equal(result.kind, "official_blog_intake_queue");
  assert.equal(result.visibility, "internal");
  assert.equal(result.stats.total_candidates, 7);
  assert.equal(result.review_queue.length, 3);
  assert.equal(result.excluded.length, 2);
  assert.equal(result.duplicates.length, 2);
  assert.equal(result.invalid_candidates.length, 0);

  const model = result.review_queue.find((candidate) => candidate.title_original === "Introducing ExampleModel 5");
  assert.equal(model.admission.decision, "include");
  assert.equal(model.next_action, "draft_knowledge_record");
  assert(model.admission.matched_criteria.includes("new_model"));
  assert.equal(model.opening_preview.includes("Later paragraphs"), false);

  const customerStory = result.review_queue.find((candidate) => candidate.company === "anthropic");
  assert.equal(customerStory.admission.decision, "needs_review");
  assert.equal(customerStory.next_action, "manual_review_required");
  assert(customerStory.admission.matched_criteria.includes("engineering_practice"));

  const product = result.review_queue.find((candidate) => candidate.title_original.includes("new developer product"));
  assert.equal(product.admission.decision, "include");
  assert(product.admission.matched_criteria.includes("new_product"));
  assert(product.suggested_topics.includes("agent"));

  assert(result.excluded.some((candidate) => candidate.excluded_as === "company_news" && candidate.title_original.includes("enterprise API partnership")));
  assert(result.excluded.some((candidate) => candidate.title_original.includes("strategic partnership")));
  assert(result.duplicates.some((candidate) => candidate.duplicate_source === "existing_knowledge"));
  assert(result.duplicates.some((candidate) => candidate.duplicate_source === "same_batch"));
});

test("official blog preview feed parses rss and atom entries for intake", async () => {
  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <item>
      <title>Introducing Agents API for production workflows</title>
      <link>https://openai.com/index/agents-api-production?utm_source=rss</link>
      <pubDate>Tue, 30 Jun 2026 00:00:00 GMT</pubDate>
      <description><![CDATA[
        <script>tracking()</script>
        <p>We are launching a new developer product for building production agent workflows with tool permissions and deployment constraints.</p>
        <p>The post covers API integration guidance, observability, and eval harness patterns.</p>
        <p>Later full body paragraph should not be stored.</p>
      ]]></description>
    </item>
    <item>
      <title>OpenAI and ExampleCorp expand enterprise partnership</title>
      <link>https://openai.com/news/examplecorp-partnership</link>
      <pubDate>Tue, 30 Jun 2026 02:00:00 GMT</pubDate>
      <description><![CDATA[
        <p>The companies will bring AI tools to more employees and customers.</p>
        <p>Executives discussed future business workflows across global markets.</p>
      ]]></description>
    </item>
  </channel>
</rss>`;
  const atom = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>How ExampleBank built a Claude support workflow</title>
    <link rel="alternate" href="https://www.anthropic.com/news/examplebank-claude-support?utm_source=atom" />
    <updated>2026-06-30T05:00:00Z</updated>
    <summary><![CDATA[
      <p>The opening preview describes routing architecture, tool permissions, evaluation harnesses, observability, and rollout controls for production agents.</p>
      <p>It includes deployment constraints and regression checks for safe rollout.</p>
    ]]></summary>
  </entry>
</feed>`;

  const openaiFeed = createOfficialBlogPreviewFeed(rss, {
    company: "openai",
    reportDate: "2026-06-30",
    generatedAt: "2026-06-30T08:00:00.000Z",
    sourceLabel: "OpenAI RSS fixture"
  });
  const anthropicFeed = createOfficialBlogPreviewFeed(atom, {
    company: "anthropic",
    reportDate: "2026-06-30",
    generatedAt: "2026-06-30T08:00:00.000Z",
    sourceLabel: "Anthropic Atom fixture"
  });

  assert.equal(openaiFeed.kind, "official_blog_preview_feed");
  assert.equal(openaiFeed.visibility, "internal");
  assert.equal(openaiFeed.company, "openai");
  assert.equal(openaiFeed.stats.total_entries, 2);
  assert.equal(openaiFeed.candidates.length, 2);
  assert.equal(openaiFeed.invalid_entries.length, 0);

  const productCandidate = openaiFeed.candidates[0];
  assert.equal(productCandidate.normalized_url, "https://openai.com/index/agents-api-production");
  assert.equal(productCandidate.published_at, "2026-06-30");
  assert.equal(productCandidate.opening_paragraphs.length, 2);
  assert.match(productCandidate.opening_preview, /new developer product/);
  assert.equal(productCandidate.opening_preview.includes("Later full body"), false);
  assert.equal(productCandidate.opening_preview.includes("tracking()"), false);

  assert.equal(anthropicFeed.candidates.length, 1);
  assert.equal(anthropicFeed.candidates[0].normalized_url, "https://www.anthropic.com/news/examplebank-claude-support");

  const existingIndex = await loadOfficialBlogKnowledge({ rootDir });
  const queue = createOfficialBlogIntakeQueue({
    candidates: [
      ...openaiFeed.candidates,
      ...anthropicFeed.candidates
    ]
  }, {
    existingIndex,
    reportDate: "2026-06-30",
    generatedAt: "2026-06-30T08:00:00.000Z"
  });

  assert.equal(queue.review_queue.length, 2);
  assert.equal(queue.excluded.length, 1);
  assert(queue.review_queue.some((candidate) => candidate.title_original.includes("Agents API") && candidate.admission.decision === "include"));
  assert(queue.review_queue.some((candidate) => candidate.company === "anthropic" && candidate.admission.decision === "needs_review"));
  assert(queue.excluded.some((candidate) => candidate.excluded_as === "company_news"));
});

test("official blog preview feed parses json exports with partial invalid entries", () => {
  const feed = createOfficialBlogPreviewFeed({
    items: [
      {
        company: "openai",
        url: "https://openai.com/index/new-api-primitive?utm_source=json",
        date: "2026-06-29",
        title: "Launching a new API primitive for agents",
        content_html: [
          "<p>This new API primitive gives developers an orchestration pattern for tool use, structured outputs, and deployment constraints.</p>",
          "<p>It includes implementation details for production agent workflows.</p>",
          "<p>Full article body should not be retained.</p>"
        ].join("")
      },
      {
        company: "cohere",
        url: "https://cohere.com/blog/example",
        title: "Unsupported company entry",
        summary: "This should be reported as invalid."
      },
      {
        company: "openai",
        title: "Missing URL entry",
        summary: "This should be reported as invalid without blocking the valid item."
      }
    ]
  }, {
    reportDate: "2026-06-30",
    generatedAt: "2026-06-30T08:00:00.000Z",
    sourceLabel: "JSON export fixture"
  });

  assert.equal(feed.kind, "official_blog_preview_feed");
  assert.equal(feed.visibility, "internal");
  assert.equal(feed.stats.total_entries, 3);
  assert.equal(feed.candidates.length, 1);
  assert.equal(feed.invalid_entries.length, 2);
  assert.equal(feed.candidates[0].company, "openai");
  assert.equal(feed.candidates[0].normalized_url, "https://openai.com/index/new-api-primitive");
  assert.equal(feed.candidates[0].opening_preview.includes("Full article body"), false);
  assert(feed.invalid_entries.some((entry) => /unsupported official blog company/.test(entry.reason)));
  assert(feed.invalid_entries.some((entry) => /missing URL/.test(entry.reason)));
});

test("official blog preview feed caps stored opening paragraphs", () => {
  const longParagraph = "A".repeat(1500);
  const feed = createOfficialBlogPreviewFeed({
    items: [
      {
        company: "openai",
        url: "https://openai.com/index/long-opening-preview",
        title: "Introducing long preview handling for agents",
        content_html: `<p>${longParagraph}</p><p>This second paragraph should not be retained after the character cap.</p>`
      }
    ]
  }, {
    reportDate: "2026-06-30",
    generatedAt: "2026-06-30T08:00:00.000Z"
  });

  assert.equal(feed.candidates.length, 1);
  assert.equal(feed.candidates[0].opening_paragraphs.length, 1);
  assert.equal(feed.candidates[0].opening_paragraphs[0].length, 1200);
  assert.equal(feed.candidates[0].opening_preview.length, 1200);
  assert.equal(feed.candidates[0].opening_preview.includes("This second paragraph"), false);
});

test("official blog admission policy is versioned and preview-only for internal artifacts", async () => {
  assert.equal(OFFICIAL_BLOG_ADMISSION_POLICY.version, "official-blog-admission-v1");

  const feed = createOfficialBlogPreviewFeed({
    items: [
      {
        company: "openai",
        url: "https://openai.com/index/introducing-examplemodel-6",
        date: "2026-07-01",
        title: "Introducing ExampleModel 6",
        content_html: [
          "<p>This new model release explains benchmark results, evals, safety mitigations, and integration guidance.</p>",
          "<p>The opening segment includes developer deployment constraints.</p>"
        ].join("")
      }
    ]
  }, {
    generatedAt: "2026-07-01T08:00:00.000Z"
  });

  const existingIndex = await loadOfficialBlogKnowledge({ rootDir });
  const queue = createOfficialBlogIntakeQueue({
    candidates: feed.candidates
  }, {
    existingIndex,
    reportDate: "2026-07-01",
    generatedAt: "2026-07-01T08:00:00.000Z"
  });
  const context = createOfficialBlogKnowledgeContext({
    entries: [
      {
        company: "openai",
        title_original: "ExampleModel 6 implementation notes",
        admission: {
          decision: "include",
          matched_criteria: ["new_model", "eval_methodology"]
        },
        topics: ["evals"]
      }
    ]
  }, {
    existingIndex,
    generatedAt: "2026-07-01T08:00:00.000Z"
  });

  for (const artifact of [feed, queue, context]) {
    assert.equal(artifact.admission_policy.version, "official-blog-admission-v1");
    assert.equal(artifact.admission_policy.scope, OFFICIAL_BLOG_ADMISSION_POLICY.scope);
    assert.deepEqual(artifact.admission_policy.first_pass.input_fields, ["title_original", "opening_preview"]);
    assert.equal(artifact.admission_policy.first_pass.opening_paragraph_limit, 2);
    assert.equal(artifact.admission_policy.first_pass.opening_char_limit, 1200);
    assert(artifact.admission_policy.include_criteria.some((criterion) => criterion.id === "new_model"));
    assert(artifact.admission_policy.include_criteria.some((criterion) => criterion.id === "harness_engineering"));
    assert(artifact.admission_policy.include_criteria.some((criterion) => criterion.id === "agent_workflow"));
    assert(artifact.admission_policy.exclude_categories.some((category) => category.id === "company_news" && /partnership|customer/.test(category.description)));
    assert.match(artifact.admission_policy.review_rule, /needs_review/);
    assert.equal(JSON.stringify(artifact.admission_policy).includes("full article body"), false);
  }
});

test("public official blog knowledge exposes curation scope without internal admission policy details", async () => {
  await withTempKnowledge([baseRecord], async (knowledgeDir) => {
    const index = await loadOfficialBlogKnowledge({ knowledgeDir });
    const publicIndex = toPublicOfficialBlogKnowledge(index, {
      generatedAt: "2026-07-01T08:00:00.000Z"
    });

    assert.equal(publicIndex.curation_scope, index.admission_policy.scope);
    assert.equal(Object.hasOwn(publicIndex, "admission_policy"), false);
    assert.equal(Object.hasOwn(publicIndex, "policy_scope"), false);
    const serialized = JSON.stringify(publicIndex);
    assert.equal(serialized.includes("company_news"), false);
    assert.equal(serialized.includes("first_pass"), false);
    assert.equal(serialized.includes("opening_preview"), false);
  });
});

test("official blog admission policy schema rejects missing required criteria", async () => {
  await withTempKnowledge([baseRecord], async (knowledgeDir) => {
    const index = await loadOfficialBlogKnowledge({ knowledgeDir });
    const missingIncludeCriterion = structuredClone(index);
    missingIncludeCriterion.admission_policy.include_criteria = missingIncludeCriterion.admission_policy.include_criteria
      .filter((criterion) => criterion.id !== "new_model");
    const missingExcludeCategory = structuredClone(index);
    missingExcludeCategory.admission_policy.exclude_categories = missingExcludeCategory.admission_policy.exclude_categories
      .filter((category) => category.id !== "company_news");

    const includeValidation = await validateOfficialBlogKnowledge(missingIncludeCriterion);
    const excludeValidation = await validateOfficialBlogKnowledge(missingExcludeCategory);

    assert.equal(includeValidation.valid, false);
    assert(includeValidation.errors.some((error) => error.path.includes("/admission_policy/include_criteria")));
    assert.equal(excludeValidation.valid, false);
    assert(excludeValidation.errors.some((error) => error.path.includes("/admission_policy/exclude_categories")));
  });
});

test("official blog review packet packages preview-only AI review items without leaking internals", async () => {
  const existingIndex = await loadOfficialBlogKnowledge({ rootDir });
  const feed = createOfficialBlogPreviewFeed({
    items: [
      {
        company: "openai",
        url: "https://openai.com/index/introducing-examplemodel-7?utm_source=rss",
        date: "2026-07-01",
        title: "Introducing ExampleModel 7",
        content_html: [
          "<p>This new model release explains benchmark results, evals, safety mitigations, and integration guidance.</p>",
          "<p>The opening segment includes developer deployment constraints.</p>",
          "<p>Full article body should not enter the review packet.</p>"
        ].join("")
      },
      {
        company: "openai",
        url: "https://openai.com/news/examplecorp-partnership",
        date: "2026-07-01",
        title: "OpenAI and ExampleCorp expand enterprise partnership",
        summary: "The companies will bring AI tools to more employees and improve business workflows."
      },
      {
        company: "anthropic",
        url: "https://www.anthropic.com/news/examplebank-claude-support",
        date: "2026-07-01",
        title: "How ExampleBank built a Claude support workflow",
        summary: "The opening preview describes routing architecture, tool permissions, evaluation harnesses, observability, and rollout controls for production agents."
      },
      {
        company: "openai",
        url: "https://openai.com/index/introducing-structured-outputs-in-the-api/?ref=packet",
        date: "2024-08-06",
        title: "Introducing structured outputs in the API",
        summary: "Existing knowledge should be treated as duplicate."
      },
      {
        company: "openai",
        url: "https://openai.com/index/introducing-examplemodel-7#duplicate",
        date: "2026-07-01",
        title: "Introducing ExampleModel 7 duplicate",
        summary: "Duplicate candidate should not be reviewed twice."
      }
    ]
  }, {
    reportDate: "2026-07-01",
    generatedAt: "2026-07-01T08:00:00.000Z"
  });

  const packet = createOfficialBlogReviewPacket({
    feed,
    source_audit: { should_not_leak: true },
    candidate_pool: { should_not_leak: true }
  }, {
    existingIndex,
    reportDate: "2026-07-01",
    generatedAt: "2026-07-01T08:00:00.000Z"
  });

  assert.equal(packet.kind, "official_blog_review_packet");
  assert.equal(packet.visibility, "internal");
  assert.equal(packet.admission_policy.version, "official-blog-admission-v1");
  assert.equal(packet.ai_review_contract.review_basis, "title_and_opening_preview_only");
  assert(packet.ai_review_contract.forbidden_inputs.includes("full_article_body"));
  assert(packet.ai_review_contract.decision_values.includes("needs_review"));
  assert.equal(packet.stats.total_candidates, 5);
  assert.equal(packet.stats.review_items, 2);
  assert.equal(packet.stats.excluded_items, 1);
  assert.equal(packet.stats.duplicates, 2);
  assert.equal(packet.stats.invalid_candidates, 0);

  const model = packet.review_items.find((item) => item.title_original === "Introducing ExampleModel 7");
  assert(model);
  assert.equal(model.deterministic_triage.decision, "include");
  assert(model.deterministic_triage.matched_criteria.includes("new_model"));
  assert.equal(model.opening_preview.includes("Full article body"), false);
  assert.equal(model.opening_paragraph_count, 2);
  assert.equal(Object.hasOwn(model, "opening_paragraphs"), false);

  const customer = packet.review_items.find((item) => item.company === "anthropic");
  assert(customer);
  assert.equal(customer.deterministic_triage.decision, "needs_review");
  assert.equal(customer.next_action, "manual_review_required");

  assert(packet.excluded_items.some((item) => item.excluded_as === "company_news" && item.title_original.includes("enterprise partnership")));
  assert(packet.duplicates.some((item) => item.duplicate_source === "existing_knowledge"));
  assert(packet.duplicates.some((item) => item.duplicate_source === "same_batch"));

  const reviewPayload = JSON.stringify({
    review_items: packet.review_items,
    excluded_items: packet.excluded_items,
    duplicates: packet.duplicates,
    invalid_candidates: packet.invalid_candidates
  });
  assert.equal(reviewPayload.includes("should_not_leak"), false);
  assert.equal(reviewPayload.includes("Full article body should not enter"), false);
  assert.equal(reviewPayload.includes("content_html"), false);
  assert.equal(reviewPayload.includes("candidate_pool"), false);
});

test("official blog review packet accepts existing intake queues", async () => {
  const existingIndex = await loadOfficialBlogKnowledge({ rootDir });
  const queue = createOfficialBlogIntakeQueue({
    candidates: [
      {
        company: "openai",
        canonical_url: "https://openai.com/index/agents-api-production-review-packet",
        published_at: "2026-07-01",
        title: "Launching a new developer product for production agent workflows",
        opening_preview: "This new developer product adds a developer platform primitive for tool permissions, orchestration, deployment constraints, and eval harnesses."
      }
    ]
  }, {
    existingIndex,
    reportDate: "2026-07-01",
    generatedAt: "2026-07-01T08:00:00.000Z"
  });
  const packet = createOfficialBlogReviewPacket({ queue }, {
    existingIndex,
    reportDate: "2026-07-01",
    generatedAt: "2026-07-01T08:00:00.000Z"
  });

  assert.equal(packet.stats.total_candidates, 1);
  assert.equal(packet.review_items.length, 1);
  assert.equal(packet.review_items[0].intake_id, queue.review_queue[0].intake_id);
  assert.equal(packet.review_items[0].deterministic_triage.decision, "include");
});

test("official blog review packet sanitizes invalid candidates from existing queues", async () => {
  const packet = createOfficialBlogReviewPacket({
    queue: {
      kind: "official_blog_intake_queue",
      report_date: "2026-07-01",
      stats: { total_candidates: 1 },
      review_queue: [],
      excluded: [],
      duplicates: [],
      invalid_candidates: [
        {
          index: 0,
          title: "Invalid queue entry with raw internals",
          url: "https://openai.com/index/raw-invalid-entry",
          reason: "missing required company",
          body: "This full body must not leak.",
          content_html: "<p>This HTML must not leak.</p>",
          source_audit: { should_not_leak: true },
          candidate_pool: { should_not_leak: true },
          raw_logs: ["raw crawler log must not leak"]
        }
      ]
    }
  }, {
    reportDate: "2026-07-01",
    generatedAt: "2026-07-01T08:00:00.000Z"
  });

  assert.equal(packet.stats.invalid_candidates, 1);
  assert.deepEqual(packet.invalid_candidates[0], {
    index: 0,
    title_original: "Invalid queue entry with raw internals",
    canonical_url: "https://openai.com/index/raw-invalid-entry",
    reason: "missing required company"
  });
  const serialized = JSON.stringify(packet.invalid_candidates);
  assert.equal(serialized.includes("This full body must not leak"), false);
  assert.equal(serialized.includes("content_html"), false);
  assert.equal(serialized.includes("should_not_leak"), false);
  assert.equal(serialized.includes("raw crawler log"), false);
});

test("official blog review decisions normalize AI output without auto-promoting manual review", async () => {
  const existingIndex = await loadOfficialBlogKnowledge({ rootDir });
  const packet = createOfficialBlogReviewPacket({
    candidates: [
      {
        company: "openai",
        canonical_url: "https://openai.com/index/examplemodel-8-review-decisions",
        published_at: "2026-07-01",
        title: "Introducing ExampleModel 8",
        opening_preview: "This new model release explains evals, safety mitigations, deployment constraints, and developer integration guidance."
      },
      {
        company: "anthropic",
        canonical_url: "https://www.anthropic.com/news/examplebank-agent-routing-review-decisions",
        published_at: "2026-07-01",
        title: "How ExampleBank built a Claude support workflow",
        opening_preview: "The opening preview describes routing architecture, tool permissions, evaluation harnesses, observability, and rollout controls for production agents."
      },
      {
        company: "openai",
        canonical_url: "https://openai.com/index/internal-agent-eval-playbook-review-decisions",
        published_at: "2026-07-01",
        title: "A production agent eval playbook",
        opening_preview: "This engineering practice note explains eval harness design, regression checks, failure triage, and observability for agent workflows."
      }
    ]
  }, {
    existingIndex,
    reportDate: "2026-07-01",
    generatedAt: "2026-07-01T08:00:00.000Z"
  });
  const model = packet.review_items.find((item) => item.title_original.includes("ExampleModel 8"));
  const customer = packet.review_items.find((item) => item.company === "anthropic");
  const practice = packet.review_items.find((item) => item.title_original.includes("eval playbook"));
  assert(model);
  assert(customer);
  assert(practice);

  const decisions = createOfficialBlogReviewDecisions({
    review_packet: packet,
    decisions: [
      {
        intake_id: model.intake_id,
        decision: "include",
        matched_criteria: ["new_model"],
        suggested_topics: ["model_release_context", "evals"],
        rationale: "The preview shows a durable model release with evals, safety notes, and developer integration guidance.",
        confidence: 0.93,
        body: "This full body must not leak."
      },
      {
        intake_id: customer.intake_id,
        decision: "include",
        matched_criteria: ["agent_workflow"],
        suggested_topics: ["agent_workflow"],
        rationale: "The preview hints at implementation detail, but it is still a customer story and needs manual reading.",
        confidence: "high",
        raw_transcript: "This raw AI transcript must not leak."
      },
      {
        intake_id: practice.intake_id,
        decision: "exclude",
        matched_criteria: [],
        suggested_topics: ["evals"],
        rationale: "The reviewer did not find enough reusable detail in the preview.",
        confidence: 0.61
      },
      {
        intake_id: model.intake_id,
        decision: "include",
        matched_criteria: ["new_model"],
        rationale: "Duplicate decision should be rejected."
      },
      {
        intake_id: "unknown-intake-id",
        decision: "include",
        matched_criteria: ["new_product"],
        rationale: "Unknown intake id should be rejected."
      }
    ],
    source_audit: { should_not_leak: true },
    candidate_pool: { should_not_leak: true }
  }, {
    reportDate: "2026-07-01",
    generatedAt: "2026-07-01T08:00:00.000Z"
  });

  assert.equal(decisions.kind, "official_blog_review_decisions");
  assert.equal(decisions.visibility, "internal");
  assert.equal(decisions.admission_policy.version, "official-blog-admission-v1");
  assert.equal(decisions.ai_review_contract.review_basis, "title_and_opening_preview_only");
  assert.equal(decisions.stats.review_items, 3);
  assert.equal(decisions.stats.decisions_received, 5);
  assert.equal(decisions.stats.accepted_for_authoring, 1);
  assert.equal(decisions.stats.needs_manual_review, 1);
  assert.equal(decisions.stats.excluded, 1);
  assert.equal(decisions.stats.invalid_decisions, 2);

  assert.equal(decisions.accepted_for_authoring[0].intake_id, model.intake_id);
  assert.equal(decisions.accepted_for_authoring[0].final_action, "ready_for_manual_authoring");
  assert.equal(decisions.needs_manual_review[0].intake_id, customer.intake_id);
  assert.equal(decisions.needs_manual_review[0].ai_review.decision, "include");
  assert.equal(decisions.needs_manual_review[0].final_decision, "needs_review");
  assert.equal(decisions.needs_manual_review[0].final_action, "manual_review_required");
  assert.equal(decisions.excluded[0].intake_id, practice.intake_id);
  assert(decisions.invalid_decisions.some((item) => item.reason.includes("duplicate intake_id")));
  assert(decisions.invalid_decisions.some((item) => item.reason.includes("unknown intake_id")));

  const decisionPayload = JSON.stringify({
    accepted_for_authoring: decisions.accepted_for_authoring,
    needs_manual_review: decisions.needs_manual_review,
    excluded: decisions.excluded,
    invalid_decisions: decisions.invalid_decisions
  });
  assert.equal(decisionPayload.includes("This full body must not leak"), false);
  assert.equal(decisionPayload.includes("raw AI transcript"), false);
  assert.equal(decisionPayload.includes("should_not_leak"), false);
  assert.equal(decisionPayload.includes("candidate_pool"), false);
  assert.equal(decisionPayload.includes("content_html"), false);
});

test("official blog review decisions reject policy-invalid criteria and missing decisions", async () => {
  const packet = createOfficialBlogReviewPacket({
    candidates: [
      {
        company: "openai",
        canonical_url: "https://openai.com/index/review-decision-policy-invalid",
        published_at: "2026-07-01",
        title: "Launching a developer product for agent workflow reviews",
        opening_preview: "This new developer product adds agent workflow controls, eval harnesses, and deployment guardrails."
      },
      {
        company: "openai",
        canonical_url: "https://openai.com/index/review-decision-missing",
        published_at: "2026-07-01",
        title: "A safety engineering playbook for agent deployment",
        opening_preview: "This safety engineering note explains containment, permissions, rollout controls, and evaluation gates."
      }
    ]
  }, {
    reportDate: "2026-07-01",
    generatedAt: "2026-07-01T08:00:00.000Z"
  });
  const invalidCriteriaItem = packet.review_items.find((item) => item.title_original.includes("developer product"));
  const missingItem = packet.review_items.find((item) => item.title_original.includes("safety engineering"));
  assert(invalidCriteriaItem);
  assert(missingItem);

  const decisions = createOfficialBlogReviewDecisions({
    review_packet: packet,
    decisions: [
      {
        intake_id: invalidCriteriaItem.intake_id,
        decision: "include",
        matched_criteria: ["company_news"],
        suggested_topics: ["company_news"],
        rationale: "This should fail because company_news is not an include criterion.",
        confidence: 0.5
      }
    ]
  }, {
    reportDate: "2026-07-01",
    generatedAt: "2026-07-01T08:00:00.000Z"
  });

  assert.equal(decisions.stats.accepted_for_authoring, 0);
  assert.equal(decisions.stats.invalid_decisions, 2);
  assert(decisions.invalid_decisions.some((item) => item.reason.includes("matched_criteria outside admission policy")));
  assert(decisions.invalid_decisions.some((item) => item.reason.includes("missing AI decision")));
});

test("official blog authoring brief creates human templates from accepted decisions only", async () => {
  const existingIndex = await loadOfficialBlogKnowledge({ rootDir });
  const packet = createOfficialBlogReviewPacket({
    candidates: [
      {
        company: "openai",
        canonical_url: "https://openai.com/index/examplemodel-9-authoring-brief",
        published_at: "2026-07-01",
        title: "Introducing ExampleModel 9",
        opening_preview: "This new model release explains evals, safety mitigations, deployment constraints, and developer integration guidance."
      },
      {
        company: "anthropic",
        canonical_url: "https://www.anthropic.com/news/examplebank-agent-routing-authoring-brief",
        published_at: "2026-07-01",
        title: "How ExampleBank built a Claude support workflow",
        opening_preview: "The opening preview describes routing architecture, tool permissions, evaluation harnesses, observability, and rollout controls for production agents."
      },
      {
        company: "openai",
        canonical_url: "https://openai.com/index/internal-agent-eval-playbook-authoring-brief",
        published_at: "2026-07-01",
        title: "A production agent eval playbook",
        opening_preview: "This engineering practice note explains eval harness design, regression checks, failure triage, and observability for agent workflows."
      }
    ]
  }, {
    existingIndex,
    reportDate: "2026-07-01",
    generatedAt: "2026-07-01T08:00:00.000Z"
  });
  const model = packet.review_items.find((item) => item.title_original.includes("ExampleModel 9"));
  const customer = packet.review_items.find((item) => item.company === "anthropic");
  const practice = packet.review_items.find((item) => item.title_original.includes("eval playbook"));
  assert(model);
  assert(customer);
  assert(practice);

  const decisions = createOfficialBlogReviewDecisions({
    review_packet: packet,
    decisions: [
      {
        intake_id: model.intake_id,
        decision: "include",
        matched_criteria: ["new_model"],
        suggested_topics: ["model_release_context", "evals"],
        rationale: "The preview shows a durable model release with evals, safety notes, and developer integration guidance.",
        confidence: 0.94,
        body: "This full body must not leak."
      },
      {
        intake_id: customer.intake_id,
        decision: "include",
        matched_criteria: ["agent_workflow"],
        suggested_topics: ["agent_workflow"],
        rationale: "The preview hints at implementation detail, but it is still a customer story and needs manual reading.",
        confidence: "high",
        raw_transcript: "This raw transcript must not leak."
      },
      {
        intake_id: practice.intake_id,
        decision: "exclude",
        matched_criteria: [],
        suggested_topics: ["evals"],
        rationale: "The reviewer did not find enough reusable detail in the preview.",
        confidence: 0.61
      }
    ],
    source_audit: { should_not_leak: true },
    candidate_pool: { should_not_leak: true }
  }, {
    reportDate: "2026-07-01",
    generatedAt: "2026-07-01T08:00:00.000Z"
  });
  const brief = createOfficialBlogAuthoringBrief({
    review_decisions: decisions,
    relationship_suggestions: {
      kind: "official_blog_relationship_suggestions",
      suggestions: [
        {
          canonical_url: model.canonical_url,
          normalized_url: model.normalized_url,
          suggested_related_blog_ids: [
            { id: "openai-new-tools-building-agents-2025-03-11", score: 11 },
            "anthropic-building-effective-agents-2024-12-19"
          ]
        }
      ]
    },
    source_audit: { should_not_leak: true },
    candidate_pool: { should_not_leak: true }
  }, {
    reportDate: "2026-07-01",
    generatedAt: "2026-07-01T08:00:00.000Z"
  });

  assert.equal(brief.kind, "official_blog_authoring_brief");
  assert.equal(brief.visibility, "internal");
  assert.equal(brief.admission_policy.version, "official-blog-admission-v1");
  assert.equal(brief.stats.accepted_for_authoring, 1);
  assert.equal(brief.stats.authoring_items, 1);
  assert.equal(brief.stats.manual_review_required, 1);
  assert.equal(brief.stats.excluded, 1);
  assert.equal(brief.authoring_items[0].intake_id, model.intake_id);
  assert.equal(brief.manual_review_required[0].intake_id, customer.intake_id);
  assert.equal(brief.excluded[0].intake_id, practice.intake_id);

  const item = brief.authoring_items[0];
  assert.deepEqual(item.authoring_required_fields, [
    "title_zh",
    "summary_zh",
    "key_ideas",
    "practice_checklist"
  ]);
  assert.equal(item.suggested_fields.importance, "major");
  assert.equal(item.suggested_fields.content_type, "model_release_context");
  assert.deepEqual(item.suggested_fields.topics, ["evals", "model_release_context", "safety_engineering"]);
  assert.deepEqual(item.suggested_fields.related_blog_ids, [
    "anthropic-building-effective-agents-2024-12-19",
    "openai-new-tools-building-agents-2025-03-11"
  ]);
  assert.equal(item.reviewed_entry_template.review_decision, "include");
  assert.equal(item.reviewed_entry_template.title_zh, "");
  assert.equal(item.reviewed_entry_template.summary_zh, "");
  assert.deepEqual(item.reviewed_entry_template.key_ideas, []);
  assert.deepEqual(item.reviewed_entry_template.practice_checklist, []);
  assert.equal(Object.hasOwn(item.reviewed_entry_template, "opening_preview"), false);
  assert.deepEqual(item.reviewed_entry_template.related_blog_ids, item.suggested_fields.related_blog_ids);

  const briefPayload = JSON.stringify(brief);
  assert.equal(briefPayload.includes("This full body must not leak"), false);
  assert.equal(briefPayload.includes("raw transcript"), false);
  assert.equal(briefPayload.includes("should_not_leak"), false);
  assert.equal(briefPayload.includes("candidate_pool"), false);
  assert.equal(briefPayload.includes("content_html"), false);
});

test("official blog reviewed authoring validates completed templates and keeps manual items separate", () => {
  const result = createOfficialBlogReviewedAuthoring({
    kind: "official_blog_authoring_brief",
    visibility: "internal",
    report_date: "2026-07-01",
    authoring_items: [
      {
        intake_id: "anthropic-production-agent-evals-2026-07-01",
        reviewed_entry_template: {
          intake_id: "anthropic-production-agent-evals-2026-07-01",
          company: "anthropic",
          canonical_url: "https://www.anthropic.com/research/production-agent-evals?utm_source=authoring",
          published_at: "2026-07-01",
          title_original: "Production agent evals for Claude workflows",
          opening_preview: "This opening preview must not leak.",
          review_decision: "include",
          admission: {
            decision: "include",
            reason: "Approved because the completed post records reusable agent workflow eval practice.",
            matched_criteria: ["engineering_practice", "agent_workflow", "eval_methodology"]
          },
          title_zh: "Production agent evals for Claude workflows",
          summary_zh: "This reviewed authoring entry explains reusable production agent eval practices, deployment constraints, observability loops, and workflow checks without copying the full source article.",
          key_ideas: [
            "Production agent evals should cover tool calls, permissions, and task completion quality.",
            "Regression checks need to bind to real workflows rather than isolated single-turn answers.",
            "Deployment readiness should include observability metrics and failure recovery paths."
          ],
          practice_checklist: [
            "Define workflow-level evals before launch.",
            "Record tool permissions, recovery paths, and observability metrics."
          ],
          importance: "major",
          content_type: "engineering_note",
          topics: ["agent", "evals", "tool_use"],
          related_blog_ids: ["anthropic-building-effective-agents-2024-12-19"],
          related_report_dates: ["2026-07-01"],
          body: "Full article body must not leak.",
          content_html: "<p>Full article body must not leak.</p>",
          raw_transcript: "Raw review transcript must not leak."
        }
      },
      {
        intake_id: "openai-incomplete-authoring-2026-07-01",
        reviewed_entry_template: {
          intake_id: "openai-incomplete-authoring-2026-07-01",
          company: "openai",
          canonical_url: "https://openai.com/index/incomplete-authoring",
          published_at: "2026-07-01",
          title_original: "Incomplete authoring template",
          review_decision: "include",
          admission: {
            decision: "include",
            reason: "Approved but not yet completed.",
            matched_criteria: ["engineering_practice"]
          },
          title_zh: "Incomplete authoring template",
          importance: "notable",
          content_type: "engineering_note",
          topics: ["agent"]
        }
      }
    ],
    manual_review_required: [
      {
        intake_id: "anthropic-customer-story-2026-07-01",
        company: "anthropic",
        canonical_url: "https://www.anthropic.com/news/customer-story",
        published_at: "2026-07-01",
        title_original: "How a customer built with Claude",
        opening_preview: "Manual review opening preview must not leak.",
        reviewed_entry_template: {
          review_decision: "include",
          title_zh: "Manual item must not be promoted",
          summary_zh: "This manual review item looks filled out but must not enter reviewed_entries because it did not pass accepted authoring.",
          key_ideas: ["Do not promote", "Manual only", "Needs review"],
          body: "Manual body must not leak."
        },
        final_decision: "needs_review",
        final_action: "manual_review_required"
      }
    ],
    source_audit: { should_not_leak: true },
    candidate_pool: { should_not_leak: true }
  }, {
    reportDate: "2026-07-01",
    generatedAt: "2026-07-01T09:00:00.000Z"
  });

  assert.equal(result.kind, "official_blog_reviewed_authoring");
  assert.equal(result.visibility, "internal");
  assert.equal(result.admission_policy.version, "official-blog-admission-v1");
  assert.equal(result.stats.authoring_items, 2);
  assert.equal(result.stats.reviewed_entries, 1);
  assert.equal(result.stats.manual_review_required, 1);
  assert.equal(result.stats.invalid_entries, 1);
  assert.equal(result.reviewed_entries[0].intake_id, "anthropic-production-agent-evals-2026-07-01");
  assert.equal(result.reviewed_entries[0].review_decision, "include");
  assert.equal(result.reviewed_entries[0].admission.decision, "include");
  assert.deepEqual(result.reviewed_entries[0].topics, ["agent", "evals", "tool_use"]);
  assert.deepEqual(result.reviewed_entries[0].related_blog_ids, ["anthropic-building-effective-agents-2024-12-19"]);
  assert.equal(result.manual_review_required[0].intake_id, "anthropic-customer-story-2026-07-01");
  assert.equal(result.invalid_entries[0].intake_id, "openai-incomplete-authoring-2026-07-01");
  assert.match(result.invalid_entries[0].reason, /summary_zh|key_ideas/);

  const drafts = createOfficialBlogKnowledgeDrafts(result);
  assert.equal(drafts.records.length, 1);
  assert.equal(drafts.invalid_entries.length, 0);
  assert.equal(drafts.records[0].id, "anthropic-production-agent-evals-2026-07-01");

  const payload = JSON.stringify(result);
  assert.equal(payload.includes("opening preview must not leak"), false);
  assert.equal(payload.includes("Full article body must not leak"), false);
  assert.equal(payload.includes("Raw review transcript"), false);
  assert.equal(payload.includes("Manual body must not leak"), false);
  assert.equal(payload.includes("Manual review opening preview must not leak"), false);
  assert.equal(payload.includes("should_not_leak"), false);
  assert.equal(payload.includes("candidate_pool"), false);
  assert.equal(payload.includes("content_html"), false);
});

test("official blog knowledge drafts require reviewed authoring fields and omit queue internals", async () => {
  const existingIndex = await loadOfficialBlogKnowledge({ rootDir });
  const result = createOfficialBlogKnowledgeDrafts({
    reviewed_entries: [
      {
        intake_id: "openai-agents-api-production-2026-06-30",
        company: "openai",
        canonical_url: "https://openai.com/index/agents-api-production?utm_source=authoring",
        published_at: "2026-06-30",
        title_original: "Introducing Agents API for production workflows",
        opening_preview: "This preview must not be copied into the curated record.",
        source_label: "OpenAI RSS",
        next_action: "draft_knowledge_record",
        admission: {
          decision: "include",
          reason: "Preview contains a new developer product and agent workflow implementation guidance.",
          matched_criteria: ["new_product", "agent_workflow", "engineering_practice"]
        },
        review: {
          decision: "include",
          rationale: "Reviewed as a product-practice record because it introduces reusable agent workflow primitives."
        },
        title_zh: "面向生产工作流的 Agents API",
        summary_zh: "这条记录把 OpenAI 的 Agents API 作为生产智能体工作流的知识节点处理，重点保留工具权限、部署约束、可观测性和评测闭环等可复用工程实践，而不是复述发布新闻。",
        key_ideas: [
          "Agents API 把工具调用、权限和状态管理放进同一条生产工作流。",
          "开发者需要为每个工具定义输入输出边界、失败恢复和观测指标。",
          "上线前应把 eval harness 和回归检查纳入部署约束。"
        ],
        practice_checklist: [
          "为每个 agent 工具声明权限、schema 和失败恢复路径。",
          "把部署约束、观测指标和 eval harness 作为发布前检查项。"
        ],
        importance: "major",
        content_type: "product_practice",
        topics: ["agent", "tool_use", "workflow_orchestration"],
        related_blog_ids: ["openai-new-tools-building-agents-2025-03-11"],
        related_report_dates: ["2026-06-30"],
        body: "Full article body must not be copied."
      },
      {
        company: "anthropic",
        canonical_url: "https://www.anthropic.com/news/examplebank-claude-support",
        published_at: "2026-06-30",
        title_original: "How ExampleBank built a Claude support workflow",
        admission: {
          decision: "needs_review",
          reason: "Implementation detail is hinted but not approved.",
          matched_criteria: ["engineering_practice"]
        },
        review_decision: "needs_review",
        title_zh: "未审核通过的客户工作流",
        summary_zh: "这条记录即使有中文摘要，也不能在 needs_review 状态下进入 curated knowledge。",
        key_ideas: ["不能入库", "需要复核", "防止误收"],
        importance: "notable",
        content_type: "engineering_note",
        topics: ["agent"]
      },
      {
        company: "openai",
        canonical_url: "https://openai.com/index/introducing-structured-outputs-in-the-api/?ref=authoring",
        published_at: "2024-08-06",
        title_original: "Introducing structured outputs in the API",
        review_decision: "include",
        title_zh: "重复的结构化输出记录",
        summary_zh: "这条记录对应已有知识库 URL，应该作为重复项报告，不能再次生成 curated record。",
        key_ideas: ["重复 URL", "不应入库", "保持唯一性"],
        importance: "foundational",
        content_type: "best_practice",
        topics: ["structured_outputs"],
        admission: {
          decision: "include",
          reason: "Duplicate fixture.",
          matched_criteria: ["new_product"]
        }
      },
      {
        company: "openai",
        canonical_url: "https://openai.com/index/missing-authoring-fields",
        published_at: "2026-06-30",
        title_original: "Missing authoring fields",
        review_decision: "include",
        admission: {
          decision: "include",
          reason: "Approved but incomplete.",
          matched_criteria: ["engineering_practice"]
        }
      },
      {
        id: "bad-id",
        company: "openai",
        canonical_url: "https://openai.com/index/malformed-authoring-fields",
        published_at: "2026-06-30",
        title_original: "Malformed authoring fields",
        review_decision: "include",
        title_zh: "格式错误的字段",
        summary_zh: "这条记录带有错误的 id、topic、related blog id 和 report date，必须在 draft 阶段被拒绝，不能等到 schema validation 才失败。",
        key_ideas: ["错误 id", "错误 topic", "错误关联字段"],
        importance: "notable",
        content_type: "engineering_note",
        topics: ["Agent Workflow"],
        related_blog_ids: ["bad-related-id"],
        related_report_dates: ["not-a-date"],
        admission: {
          decision: "include",
          reason: "Malformed fixture.",
          matched_criteria: ["engineering_practice"]
        }
      }
    ]
  }, {
    existingIndex,
    generatedAt: "2026-06-30T08:00:00.000Z"
  });

  assert.equal(result.kind, "official_blog_knowledge_drafts");
  assert.equal(result.visibility, "internal");
  assert.equal(result.stats.total_entries, 5);
  assert.equal(result.records.length, 1);
  assert.equal(result.invalid_entries.length, 4);
  assert.equal(result.records[0].id, "openai-agents-api-production-2026-06-30");
  assert.equal(result.records[0].normalized_url, "https://openai.com/index/agents-api-production");
  assert.deepEqual(result.records[0].admission.matched_criteria, ["agent_workflow", "engineering_practice", "new_product"]);
  assert.equal(Object.hasOwn(result.records[0], "opening_preview"), false);
  assert.equal(Object.hasOwn(result.records[0], "source_label"), false);
  assert.equal(Object.hasOwn(result.records[0], "next_action"), false);
  assert.equal(Object.hasOwn(result.records[0], "body"), false);
  assert(result.invalid_entries.some((entry) => /reviewed include approval/.test(entry.reason)));
  assert(result.invalid_entries.some((entry) => /duplicate canonical_url/.test(entry.reason)));
  assert(result.invalid_entries.some((entry) => /title_zh/.test(entry.reason)));
  assert(result.invalid_entries.some((entry) => /topics/.test(entry.reason)));

  await withTempKnowledge([result.records[0]], async (knowledgeDir) => {
    const index = await loadOfficialBlogKnowledge({ knowledgeDir });
    assert.equal(index.records.length, 1);
    assert.equal(index.records[0].id, "openai-agents-api-production-2026-06-30");
  });
});

test("official blog knowledge drafts reject schema-invalid ids topics and related fields", () => {
  const validAuthoring = {
    company: "openai",
    published_at: "2026-06-30",
    review_decision: "include",
    title_zh: "格式校验记录",
    summary_zh: "这条记录用于验证 authoring 阶段会提前拒绝 schema-invalid 字段，而不是让坏记录进入 records 后再等 schema validation 失败。",
    key_ideas: ["提前拒绝坏字段", "不写 schema-invalid record", "保持 curated knowledge 可加载"],
    importance: "notable",
    content_type: "engineering_note",
    topics: ["agent"],
    admission: {
      decision: "include",
      reason: "Schema validation boundary fixture.",
      matched_criteria: ["engineering_practice"]
    }
  };
  const result = createOfficialBlogKnowledgeDrafts({
    reviewed_entries: [
      {
        ...validAuthoring,
        id: "bad-id",
        canonical_url: "https://openai.com/index/bad-id-authoring",
        title_original: "Bad id authoring"
      },
      {
        ...validAuthoring,
        canonical_url: "https://openai.com/index/bad-topic-authoring",
        title_original: "Bad topic authoring",
        topics: ["Agent Workflow"]
      },
      {
        ...validAuthoring,
        canonical_url: "https://openai.com/index/bad-related-id-authoring",
        title_original: "Bad related id authoring",
        related_blog_ids: ["bad-related-id"]
      },
      {
        ...validAuthoring,
        canonical_url: "https://openai.com/index/bad-related-date-authoring",
        title_original: "Bad related date authoring",
        related_report_dates: ["not-a-date"]
      }
    ]
  }, {
    generatedAt: "2026-06-30T08:00:00.000Z"
  });

  assert.equal(result.records.length, 0);
  assert.equal(result.invalid_entries.length, 4);
  assert(result.invalid_entries.some((entry) => /record id/.test(entry.reason)));
  assert(result.invalid_entries.some((entry) => /topics/.test(entry.reason)));
  assert(result.invalid_entries.some((entry) => /related_blog_ids/.test(entry.reason)));
  assert(result.invalid_entries.some((entry) => /related_report_dates/.test(entry.reason)));
});

test("official blog relationship suggestions rank shared topics and criteria without mutating records", async () => {
  const effectiveAgentsRecord = {
    ...baseRecord,
    id: "anthropic-building-effective-agents-2024-12-19",
    company: "anthropic",
    canonical_url: "https://www.anthropic.com/research/building-effective-agents",
    published_at: "2024-12-19",
    title_original: "Building effective agents",
    title_zh: "Building effective agents digest",
    content_type: "best_practice",
    topics: ["agent", "evals", "harness_engineering", "workflow_orchestration"],
    admission: {
      decision: "include",
      rationale: "Reusable agent workflow and evaluation guidance.",
      matched_criteria: ["engineering_practice", "harness_engineering", "agent_workflow", "eval_methodology"]
    },
    related_blog_ids: ["openai-new-tools-building-agents-2025-03-11"]
  };

  await withTempKnowledge([baseRecord, effectiveAgentsRecord], async (knowledgeDir) => {
    const existingIndex = await loadOfficialBlogKnowledge({ knowledgeDir });
    const before = JSON.stringify(existingIndex.records);
    const result = createOfficialBlogRelationshipSuggestions({
      reviewed_entries: [
        {
          company: "openai",
          canonical_url: "https://openai.com/index/agent-harness-patterns",
          published_at: "2026-06-30",
          title_original: "Agent harness patterns for production workflows",
          review_decision: "include",
          topics: ["agent", "harness_engineering", "workflow_orchestration"],
          admission: {
            decision: "include",
            matched_criteria: ["engineering_practice", "harness_engineering", "agent_workflow"]
          },
          opening_preview: "This should remain outside relationship suggestions.",
          body: "Full body should remain outside relationship suggestions."
        }
      ]
    }, {
      existingIndex,
      generatedAt: "2026-06-30T08:00:00.000Z"
    });

    assert.equal(result.kind, "official_blog_relationship_suggestions");
    assert.equal(result.visibility, "internal");
    assert.equal(result.stats.total_entries, 1);
    assert.equal(result.stats.candidates, 1);
    assert.equal(result.stats.suggestions, 1);
    assert.equal(result.invalid_entries.length, 0);
    assert.equal(result.duplicates.length, 0);
    assert.equal(result.suggestions.length, 1);
    assert.equal(Object.hasOwn(result.suggestions[0], "opening_preview"), false);
    assert.equal(Object.hasOwn(result.suggestions[0], "body"), false);

    const top = result.suggestions[0].suggested_related_blog_ids[0];
    assert.equal(top.id, "anthropic-building-effective-agents-2024-12-19");
    assert(top.score >= 8);
    assert.deepEqual(top.matched_topics, ["agent", "harness_engineering", "workflow_orchestration"]);
    assert(top.matched_criteria.includes("agent_workflow"));
    assert(top.reasons.includes("shared_topics"));
    assert(top.reasons.includes("shared_matched_criteria"));
    assert(top.reasons.includes("cross_company_comparable_practice"));
    assert.equal(JSON.stringify(existingIndex.records), before);
  });
});

test("official blog relationship suggestions report duplicates and suppress company-only matches", async () => {
  await withTempKnowledge([baseRecord], async (knowledgeDir) => {
    const existingIndex = await loadOfficialBlogKnowledge({ knowledgeDir });
    const result = createOfficialBlogRelationshipSuggestions({
      reviewed_entries: [
        {
          company: "openai",
          canonical_url: "https://openai.com/index/introducing-structured-outputs-in-the-api/?utm_source=test",
          published_at: "2024-08-06",
          title_original: "Structured outputs duplicate",
          topics: ["structured_outputs"],
          admission: {
            decision: "include",
            matched_criteria: ["new_product"]
          }
        },
        {
          company: "openai",
          canonical_url: "https://openai.com/index/company-only-noise",
          published_at: "2026-06-30",
          title_original: "Company-only update",
          topics: ["enterprise_rollout"],
          admission: {
            decision: "include",
            matched_criteria: ["new_model"]
          }
        },
        {
          company: "unknown",
          canonical_url: "https://example.com/blog",
          published_at: "2026-06-30",
          title_original: "Unsupported company",
          topics: ["agent"],
          admission: {
            decision: "include",
            matched_criteria: ["engineering_practice"]
          }
        }
      ]
    }, {
      existingIndex,
      generatedAt: "2026-06-30T08:00:00.000Z"
    });

    assert.equal(result.stats.total_entries, 3);
    assert.equal(result.stats.candidates, 1);
    assert.equal(result.duplicates.length, 1);
    assert.equal(result.duplicates[0].duplicate_of, "openai-structured-outputs-2024-08-06");
    assert.equal(result.invalid_entries.length, 1);
    assert.match(result.invalid_entries[0].reason, /unsupported official blog company/);
    assert.equal(result.suggestions.length, 1);
    assert.equal(result.suggestions[0].suggested_related_blog_ids.length, 0);
  });
});

test("official blog knowledge context ranks URL topic and criteria matches without leaking internals", async () => {
  const effectiveAgentsRecord = {
    ...baseRecord,
    id: "anthropic-building-effective-agents-2024-12-19",
    company: "anthropic",
    canonical_url: "https://www.anthropic.com/research/building-effective-agents",
    normalized_url: "https://www.anthropic.com/research/building-effective-agents",
    published_at: "2024-12-19",
    title_original: "Building effective agents",
    title_zh: "Building effective agents digest",
    content_type: "best_practice",
    topics: ["agent", "evals", "harness_engineering", "workflow_orchestration"],
    admission: {
      decision: "include",
      rationale: "Reusable agent workflow and evaluation guidance.",
      matched_criteria: ["engineering_practice", "harness_engineering", "agent_workflow", "eval_methodology"]
    },
    related_blog_ids: ["openai-new-tools-building-agents-2025-03-11"],
    related_report_dates: ["2025-03-12"]
  };

  await withTempKnowledge([baseRecord, effectiveAgentsRecord], async (knowledgeDir) => {
    const existingIndex = await loadOfficialBlogKnowledge({ knowledgeDir });
    const before = JSON.stringify(existingIndex.records);
    const result = createOfficialBlogKnowledgeContext({
      report_date: "2026-07-01",
      hot_blogs: [
        {
          company: "openai",
          canonical_url: "https://openai.com/index/agent-harness-patterns",
          title_original: "Agent harness patterns for production workflows",
          topics: ["agent", "harness_engineering", "workflow_orchestration"],
          admission: {
            decision: "include",
            matched_criteria: ["engineering_practice", "harness_engineering", "agent_workflow"]
          },
          opening_preview: "Internal preview must not be copied into the knowledge context.",
          body: "Full body must not be copied into the knowledge context."
        },
        {
          company: "openai",
          canonical_url: "https://openai.com/index/introducing-structured-outputs-in-the-api/?utm_source=report",
          title_original: "Structured outputs in the API",
          topics: ["structured_outputs"],
          admission: {
            decision: "include",
            matched_criteria: ["new_product", "engineering_practice"]
          },
          source_audit: { should_not_leak: true }
        }
      ],
      source_audit: { should_not_leak: true },
      candidate_pool: { should_not_leak: true }
    }, {
      existingIndex,
      generatedAt: "2026-07-01T08:00:00.000Z",
      limit: 5
    });

    assert.equal(result.kind, "official_blog_knowledge_context");
    assert.equal(result.visibility, "internal");
    assert.equal(result.stats.total_entries, 2);
    assert.equal(result.stats.matched_records, 2);
    assert.equal(result.invalid_entries.length, 0);
    assert.equal(result.records.length, 2);

    const structured = result.records.find((record) => record.id === "openai-structured-outputs-2024-08-06");
    assert(structured);
    assert(structured.reasons.includes("url_match"));
    assert.deepEqual(structured.source_entry_indexes, [1]);
    assert.equal(structured.summary_zh, baseRecord.summary_zh);
    assert(structured.key_ideas.length >= 3);

    const agents = result.records.find((record) => record.id === "anthropic-building-effective-agents-2024-12-19");
    assert(agents);
    assert(agents.score > 0);
    assert(agents.reasons.includes("shared_topics"));
    assert(agents.reasons.includes("shared_matched_criteria"));
    assert(agents.reasons.includes("cross_company_comparable_practice"));
    assert.deepEqual(agents.matched_topics, ["agent", "harness_engineering", "workflow_orchestration"]);
    assert(agents.matched_criteria.includes("agent_workflow"));
    assert.deepEqual(agents.related_report_dates, ["2025-03-12"]);

    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes("Internal preview must not be copied"), false);
    assert.equal(serialized.includes("Full body must not be copied"), false);
    assert.equal(serialized.includes("should_not_leak"), false);
    assert.equal(Object.hasOwn(result.records[0], "opening_preview"), false);
    assert.equal(Object.hasOwn(result.records[0], "body"), false);
    assert.equal(JSON.stringify(existingIndex.records), before);
  });
});

test("official blog knowledge context ignores company-only news and isolates invalid entries", async () => {
  await withTempKnowledge([baseRecord], async (knowledgeDir) => {
    const existingIndex = await loadOfficialBlogKnowledge({ knowledgeDir });
    const result = createOfficialBlogKnowledgeContext({
      entries: [
        {
          company: "openai",
          canonical_url: "https://openai.com/news/examplecorp-partnership",
          title_original: "OpenAI and ExampleCorp expand enterprise partnership",
          opening_preview: "The companies will bring AI tools to more employees and improve business workflows.",
          admission: {
            decision: "exclude",
            matched_criteria: []
          },
          topics: []
        },
        {
          company: "unknown",
          canonical_url: "https://example.com/blog/agent-evals",
          title_original: "Unsupported company agent evals",
          topics: ["agent"],
          admission: {
            decision: "include",
            matched_criteria: ["engineering_practice"]
          }
        }
      ]
    }, {
      existingIndex,
      generatedAt: "2026-07-01T08:00:00.000Z"
    });

    assert.equal(result.kind, "official_blog_knowledge_context");
    assert.equal(result.stats.total_entries, 2);
    assert.equal(result.stats.matched_records, 0);
    assert.equal(result.stats.unmatched_entries, 1);
    assert.equal(result.invalid_entries.length, 1);
    assert.match(result.invalid_entries[0].reason, /unsupported official blog company/);
    assert.equal(result.records.length, 0);
  });
});

test("official blog knowledge context covers explicit related ids limits and generic criteria suppression", async () => {
  const effectiveAgentsRecord = {
    ...baseRecord,
    id: "anthropic-building-effective-agents-2024-12-19",
    company: "anthropic",
    canonical_url: "https://www.anthropic.com/research/building-effective-agents",
    published_at: "2024-12-19",
    title_original: "Building effective agents",
    title_zh: "Building effective agents digest",
    content_type: "best_practice",
    topics: ["agent", "evals", "harness_engineering", "workflow_orchestration"],
    admission: {
      decision: "include",
      rationale: "Reusable agent workflow and evaluation guidance.",
      matched_criteria: ["engineering_practice", "harness_engineering", "agent_workflow", "eval_methodology"]
    },
    related_blog_ids: []
  };
  const newToolsRecord = {
    ...baseRecord,
    id: "openai-new-tools-building-agents-2025-03-11",
    company: "openai",
    canonical_url: "https://openai.com/index/new-tools-for-building-agents/",
    published_at: "2025-03-11",
    title_original: "New tools for building agents",
    title_zh: "New tools for building agents digest",
    importance: "major",
    content_type: "product_practice",
    topics: ["agent", "tool_use", "workflow_orchestration"],
    admission: {
      decision: "include",
      rationale: "Introduces reusable platform tools for agent workflows.",
      matched_criteria: ["new_product", "engineering_practice", "agent_workflow"]
    },
    related_blog_ids: ["anthropic-building-effective-agents-2024-12-19"]
  };

  await withTempKnowledge([baseRecord, effectiveAgentsRecord, newToolsRecord], async (knowledgeDir) => {
    const existingIndex = await loadOfficialBlogKnowledge({ knowledgeDir });
    const limited = createOfficialBlogKnowledgeContext({
      entries: [
        { canonical_url: baseRecord.canonical_url, title_original: baseRecord.title_original },
        { canonical_url: effectiveAgentsRecord.canonical_url, title_original: effectiveAgentsRecord.title_original },
        { canonical_url: newToolsRecord.canonical_url, title_original: newToolsRecord.title_original }
      ]
    }, {
      existingIndex,
      generatedAt: "2026-07-01T08:00:00.000Z",
      limit: 1
    });

    assert.equal(limited.records.length, 1);
    assert.equal(limited.records[0].id, "openai-new-tools-building-agents-2025-03-11");
    assert.deepEqual(limited.records[0].reasons, ["url_match"]);

    const explicitAndNoise = createOfficialBlogKnowledgeContext({
      entries: [
        {
          canonical_url: "https://example.com/internal-related-id-only",
          title_original: "Related id only entry",
          related_blog_ids: ["anthropic-building-effective-agents-2024-12-19"]
        },
        {
          company: "openai",
          canonical_url: "https://openai.com/index/generic-engineering-practice-news",
          title_original: "Generic engineering practice news",
          admission: {
            decision: "include",
            matched_criteria: ["engineering_practice"]
          },
          topics: []
        }
      ]
    }, {
      existingIndex,
      generatedAt: "2026-07-01T08:00:00.000Z"
    });

    assert.equal(explicitAndNoise.stats.total_entries, 2);
    assert.equal(explicitAndNoise.stats.matched_entries, 1);
    assert.equal(explicitAndNoise.stats.unmatched_entries, 1);
    assert.equal(explicitAndNoise.records.length, 1);
    assert.equal(explicitAndNoise.records[0].id, "anthropic-building-effective-agents-2024-12-19");
    assert.deepEqual(explicitAndNoise.records[0].reasons, ["explicit_related_blog_id"]);
    assert.deepEqual(explicitAndNoise.records[0].source_entry_indexes, [0]);
  });
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

test("official blog runbook replay fixtures exercise local OpenAI and Anthropic flow", async () => {
  const fixtureDir = path.join(rootDir, "tests", "fixtures", "official-blog-runbook-replay");
  const fixture = JSON.parse(await fs.readFile(path.join(fixtureDir, "replay.json"), "utf8"));
  const previewFeeds = [];
  for (const feed of fixture.feeds) {
    const feedXml = await fs.readFile(path.join(fixtureDir, feed.file), "utf8");
    previewFeeds.push(createOfficialBlogPreviewFeed(feedXml, {
      company: feed.company,
      reportDate: fixture.report_date,
      generatedAt: fixture.generated_at,
      sourceLabel: feed.source_label
    }));
  }

  const previewFeed = {
    kind: "official_blog_preview_feed",
    visibility: "internal",
    report_date: fixture.report_date,
    generated_at: fixture.generated_at,
    candidates: previewFeeds.flatMap((feed) => feed.candidates)
  };
  assert.equal(previewFeed.candidates.length, 4);
  assert(previewFeed.candidates.every((candidate) => candidate.opening_paragraphs.length <= 2));
  for (const marker of fixture.forbidden_markers) {
    assert.equal(JSON.stringify(previewFeed).includes(marker), false, `${marker} must stay outside preview feed`);
  }

  const intake = createOfficialBlogIntakeQueue(previewFeed, {
    reportDate: fixture.report_date,
    generatedAt: fixture.generated_at
  });
  assert.equal(intake.kind, "official_blog_intake_queue");
  assert.equal(intake.stats.included, 2);
  assert.equal(intake.stats.needs_review, 1);
  assert.equal(intake.stats.excluded, 1);
  assert.equal(
    intake.excluded.find((item) => item.normalized_url === normalizeOfficialBlogUrl(fixture.expected.hidden_body_excluded_url))
      ?.admission.matched_criteria.length,
    0
  );

  const reviewPacket = createOfficialBlogReviewPacket(intake, {
    reportDate: fixture.report_date,
    generatedAt: fixture.generated_at
  });
  assert.equal(reviewPacket.kind, "official_blog_review_packet");
  assert.equal(reviewPacket.stats.review_items, 3);
  assert.equal(reviewPacket.stats.excluded_items, 1);

  const reviewItemsByUrl = new Map(reviewPacket.review_items.map((item) => [item.normalized_url, item]));
  const decisions = fixture.ai_decisions.map((decision) => {
    const item = reviewItemsByUrl.get(normalizeOfficialBlogUrl(decision.canonical_url));
    assert(item, `missing review item for ${decision.canonical_url}`);
    return {
      intake_id: item.intake_id,
      decision: decision.decision,
      matched_criteria: decision.matched_criteria,
      suggested_topics: decision.suggested_topics,
      rationale: decision.rationale,
      confidence: decision.confidence,
      raw_transcript: fixture.forbidden_markers[1]
    };
  });
  const reviewDecisions = createOfficialBlogReviewDecisions({
    review_packet: reviewPacket,
    decisions,
    source_audit: { marker: fixture.forbidden_markers[2] },
    candidate_pool: { marker: fixture.forbidden_markers[3] }
  }, {
    reportDate: fixture.report_date,
    generatedAt: fixture.generated_at
  });
  assert.equal(reviewDecisions.kind, "official_blog_review_decisions");
  assert.equal(reviewDecisions.stats.accepted_for_authoring, 2);
  assert.equal(reviewDecisions.stats.needs_manual_review, 1);
  assert.equal(reviewDecisions.stats.invalid_decisions, 0);

  const brief = createOfficialBlogAuthoringBrief({ review_decisions: reviewDecisions }, {
    reportDate: fixture.report_date,
    generatedAt: fixture.generated_at
  });
  assert.equal(brief.kind, "official_blog_authoring_brief");
  assert.equal(brief.stats.authoring_items, 2);
  assert.equal(brief.stats.manual_review_required, 1);
  assert.equal(brief.manual_review_required[0].final_decision, "needs_review");

  const authoredByUrl = new Map(fixture.human_authoring.map((entry) => [
    normalizeOfficialBlogUrl(entry.canonical_url),
    entry
  ]));
  const reviewed = createOfficialBlogReviewedAuthoring({
    ...brief,
    authoring_items: brief.authoring_items.map((item) => {
      const authored = authoredByUrl.get(item.normalized_url);
      assert(authored, `missing human authoring for ${item.canonical_url}`);
      return {
        ...item,
        reviewed_entry_template: {
          ...item.reviewed_entry_template,
          ...authored
        }
      };
    }),
    source_audit: { marker: fixture.forbidden_markers[2] },
    candidate_pool: { marker: fixture.forbidden_markers[3] }
  }, {
    reportDate: fixture.report_date,
    generatedAt: fixture.generated_at
  });
  assert.equal(reviewed.kind, "official_blog_reviewed_authoring");
  assert.equal(reviewed.stats.reviewed_entries, 2);
  assert.equal(reviewed.stats.manual_review_required, 1);
  assert.equal(reviewed.stats.invalid_entries, 0);
  assert.equal(
    reviewed.reviewed_entries.some((entry) => entry.intake_id === brief.manual_review_required[0].intake_id),
    false
  );

  const drafts = createOfficialBlogKnowledgeDrafts(reviewed, {
    existingIndex: { records: [] },
    generatedAt: fixture.generated_at
  });
  assert.equal(drafts.kind, "official_blog_knowledge_drafts");
  assert.equal(drafts.records.length, 2);
  assert.equal(drafts.invalid_entries.length, 0);
  assert.equal(
    drafts.records.some((record) => record.id === brief.manual_review_required[0].intake_id),
    false
  );

  const recordsById = new Map(drafts.records.map((record) => [record.id, record]));
  for (const expectedRecord of fixture.expected.records) {
    const record = recordsById.get(expectedRecord.id);
    assert(record, `missing record ${expectedRecord.id}`);
    assert.equal(record.company, expectedRecord.company);
    for (const topic of expectedRecord.topics) {
      assert(record.topics.includes(topic), `${record.id} should include topic ${topic}`);
    }
    assert.equal(Object.hasOwn(record, "opening_preview"), false);
    assert.equal(Object.hasOwn(record, "body"), false);
    assert.equal(Object.hasOwn(record, "raw_transcript"), false);
  }

  const sanitizedPayload = JSON.stringify({ reviewDecisions, brief, reviewed, drafts });
  for (const marker of fixture.forbidden_markers) {
    assert.equal(sanitizedPayload.includes(marker), false, `${marker} must not leak past review normalization`);
  }
});

test("official blog review session composes preview intake and review packet without later artifacts", async () => {
  const fixtureDir = path.join(rootDir, "tests", "fixtures", "official-blog-runbook-replay");
  const fixture = JSON.parse(await fs.readFile(path.join(fixtureDir, "replay.json"), "utf8"));
  const feeds = await Promise.all(fixture.feeds.map(async (feed) => ({
    company: feed.company,
    source_label: feed.source_label,
    feed_text: await fs.readFile(path.join(fixtureDir, feed.file), "utf8")
  })));

  const session = createOfficialBlogReviewSession({ feeds }, {
    reportDate: fixture.report_date,
    generatedAt: fixture.generated_at
  });

  assert.equal(session.kind, "official_blog_review_session");
  assert.equal(session.visibility, "internal");
  assert.equal(session.stats.feeds, 2);
  assert.equal(session.stats.candidates, 4);
  assert.equal(session.stats.review_items, 3);
  assert.equal(session.stats.included, 2);
  assert.equal(session.stats.needs_review, 1);
  assert.equal(session.stats.excluded, 1);
  assert.equal(session.stats.duplicates, 0);
  assert.equal(session.stats.invalid_candidates, 0);
  assert.equal(session.preview_feeds.length, 2);
  assert.equal(session.combined_preview_feed.kind, "official_blog_preview_feed");
  assert.equal(session.intake_queue.kind, "official_blog_intake_queue");
  assert.equal(session.review_packet.kind, "official_blog_review_packet");
  assert.equal(session.review_packet.ai_review_contract.review_basis, "title_and_opening_preview_only");
  assert.equal(Object.hasOwn(session, "source_audit"), false);
  assert.equal(Object.hasOwn(session, "candidate_pool"), false);

  const sessionJson = JSON.stringify(session);
  const reviewItemsByUrl = new Map(session.review_packet.review_items.map((item) => [item.normalized_url, item]));
  assert(reviewItemsByUrl.has(normalizeOfficialBlogUrl(fixture.ai_decisions[0].canonical_url)));
  assert(reviewItemsByUrl.has(normalizeOfficialBlogUrl(fixture.ai_decisions[1].canonical_url)));
  assert.equal(
    reviewItemsByUrl.get(normalizeOfficialBlogUrl(fixture.ai_decisions[2].canonical_url))?.deterministic_triage.decision,
    "needs_review"
  );
  assert.equal(sessionJson.includes(fixture.expected.hidden_body_excluded_url), true);

  for (const marker of fixture.forbidden_markers) {
    assert.equal(sessionJson.includes(marker), false, `${marker} must stay outside review session`);
  }
  for (const laterArtifact of [
    "official_blog_review_decisions",
    "official_blog_authoring_brief",
    "official_blog_reviewed_authoring",
    "official_blog_knowledge_drafts",
    "records_planned",
    "records_written",
    "raw_transcript"
  ]) {
    assert.equal(sessionJson.includes(laterArtifact), false, `${laterArtifact} must not appear before manual checkpoints`);
  }
});

test("official blog AI review handoff creates prompt and blank decisions from review session", async () => {
  const fixtureDir = path.join(rootDir, "tests", "fixtures", "official-blog-runbook-replay");
  const fixture = JSON.parse(await fs.readFile(path.join(fixtureDir, "replay.json"), "utf8"));
  const feeds = await Promise.all(fixture.feeds.map(async (feed) => ({
    company: feed.company,
    source_label: feed.source_label,
    feed_text: await fs.readFile(path.join(fixtureDir, feed.file), "utf8")
  })));
  const session = createOfficialBlogReviewSession({ feeds }, {
    reportDate: fixture.report_date,
    generatedAt: fixture.generated_at
  });

  const handoff = createOfficialBlogAiReviewHandoff(session, {
    reportDate: fixture.report_date,
    generatedAt: fixture.generated_at
  });

  assert.equal(handoff.kind, "official_blog_ai_review_handoff");
  assert.equal(handoff.visibility, "internal");
  assert.equal(handoff.report_date, fixture.report_date);
  assert.equal(handoff.stats.review_items, 3);
  assert.equal(handoff.stats.included, 2);
  assert.equal(handoff.stats.needs_review, 1);
  assert.equal(handoff.stats.excluded_items, 1);
  assert.equal(handoff.stats.duplicates, 0);
  assert.equal(handoff.stats.invalid_candidates, 0);
  assert.equal(handoff.review_packet.kind, "official_blog_review_packet");
  assert.equal(handoff.ai_review_contract.review_basis, "title_and_opening_preview_only");
  assert.equal(handoff.prompt.review_basis, "title_and_opening_preview_only");
  assert(handoff.prompt.instructions.some((instruction) => instruction.includes("title_original") && instruction.includes("opening_preview")));
  assert.equal(handoff.decision_template.length, 3);
  assert(handoff.decision_template.every((entry) => entry.intake_id));
  assert(handoff.decision_template.every((entry) => entry.decision === ""));
  assert(handoff.decision_template.every((entry) => entry.rationale === ""));
  assert(handoff.decision_template.every((entry) => entry.confidence === null));
  assert.equal(
    handoff.decision_template.find((entry) => entry.normalized_url === normalizeOfficialBlogUrl(fixture.ai_decisions[2].canonical_url))?.deterministic_decision,
    "needs_review"
  );
  assert.equal(
    handoff.decision_template.find((entry) => entry.normalized_url === normalizeOfficialBlogUrl(fixture.ai_decisions[2].canonical_url))?.decision,
    ""
  );
  assert.equal(Object.hasOwn(handoff, "source_audit"), false);
  assert.equal(Object.hasOwn(handoff, "candidate_pool"), false);

  const handoffJson = JSON.stringify(handoff);
  for (const marker of fixture.forbidden_markers) {
    assert.equal(handoffJson.includes(marker), false, `${marker} must stay outside AI review handoff`);
  }
  for (const laterArtifact of [
    "official_blog_review_decisions",
    "official_blog_authoring_brief",
    "official_blog_reviewed_authoring",
    "official_blog_knowledge_drafts",
    "records_planned",
    "records_written",
    "raw_transcript"
  ]) {
    assert.equal(handoffJson.includes(laterArtifact), false, `${laterArtifact} must not appear before AI decision checkpoint`);
  }
});

test("official blog AI review handoff sanitizes embedded packet before AI handoff", async () => {
  const fixtureDir = path.join(rootDir, "tests", "fixtures", "official-blog-runbook-replay");
  const fixture = JSON.parse(await fs.readFile(path.join(fixtureDir, "replay.json"), "utf8"));
  const feeds = await Promise.all(fixture.feeds.map(async (feed) => ({
    company: feed.company,
    source_label: feed.source_label,
    feed_text: await fs.readFile(path.join(fixtureDir, feed.file), "utf8")
  })));
  const session = createOfficialBlogReviewSession({ feeds }, {
    reportDate: fixture.report_date,
    generatedAt: fixture.generated_at
  });
  const pollutedPacket = JSON.parse(JSON.stringify(session.review_packet));
  pollutedPacket.source_audit = { local_path: "C:\\Users\\Admin\\private-source-audit.json" };
  pollutedPacket.candidate_pool = [{ body: "FULL BODY MUST NOT LEAK" }];
  pollutedPacket.raw_transcript = "RAW TRANSCRIPT MUST NOT LEAK";
  pollutedPacket.body = "PACKET BODY MUST NOT LEAK";
  pollutedPacket.ai_review_contract.extra_private_payload = "PRIVATE CONTRACT PAYLOAD MUST NOT LEAK";
  pollutedPacket.review_items[0].body = "ITEM BODY MUST NOT LEAK";
  pollutedPacket.review_items[0].full_article_body = "FULL ARTICLE BODY MUST NOT LEAK";
  pollutedPacket.review_items[0].source_audit = { request_id: "PRIVATE AUDIT MUST NOT LEAK" };
  pollutedPacket.review_items[0].candidate_pool = [{ title: "PRIVATE CANDIDATE MUST NOT LEAK" }];
  pollutedPacket.excluded_items[0].raw_transcript = "EXCLUDED RAW TRANSCRIPT MUST NOT LEAK";

  const handoff = createOfficialBlogAiReviewHandoff(pollutedPacket, {
    reportDate: fixture.report_date,
    generatedAt: fixture.generated_at
  });

  assert.equal(handoff.review_packet.kind, "official_blog_review_packet");
  assert.equal(handoff.review_packet.review_items.length, 3);
  assert.equal(handoff.review_packet.excluded_items.length, 1);
  assert.equal(Object.hasOwn(handoff.review_packet, "source_audit"), false);
  assert.equal(Object.hasOwn(handoff.review_packet, "candidate_pool"), false);
  assert.equal(Object.hasOwn(handoff.review_packet, "raw_transcript"), false);
  assert.equal(Object.hasOwn(handoff.review_packet, "body"), false);
  assert.equal(Object.hasOwn(handoff.review_packet.ai_review_contract, "extra_private_payload"), false);
  assert.equal(Object.hasOwn(handoff.review_packet.review_items[0], "body"), false);
  assert.equal(Object.hasOwn(handoff.review_packet.review_items[0], "full_article_body"), false);
  assert.equal(Object.hasOwn(handoff.review_packet.review_items[0], "source_audit"), false);
  assert.equal(Object.hasOwn(handoff.review_packet.review_items[0], "candidate_pool"), false);
  assert.equal(Object.hasOwn(handoff.review_packet.excluded_items[0], "raw_transcript"), false);

  const handoffJson = JSON.stringify(handoff);
  for (const marker of [
    "FULL BODY MUST NOT LEAK",
    "RAW TRANSCRIPT MUST NOT LEAK",
    "PACKET BODY MUST NOT LEAK",
    "PRIVATE CONTRACT PAYLOAD MUST NOT LEAK",
    "ITEM BODY MUST NOT LEAK",
    "FULL ARTICLE BODY MUST NOT LEAK",
    "PRIVATE AUDIT MUST NOT LEAK",
    "PRIVATE CANDIDATE MUST NOT LEAK",
    "EXCLUDED RAW TRANSCRIPT MUST NOT LEAK"
  ]) {
    assert.equal(handoffJson.includes(marker), false, `${marker} must stay outside AI review handoff`);
  }
});

test("official blog workflow runbook is executable and safety-backed", async () => {
  const runbookPath = path.join(rootDir, "tasks", "official-blog-workflow-runbook.md");
  const planPath = path.join(rootDir, "docs", "official-blog-knowledge-plan.md");
  const runbook = await fs.readFile(runbookPath, "utf8");
  const plan = await fs.readFile(planPath, "utf8");

  assert(plan.includes("tasks/official-blog-workflow-runbook.md"));

  const orderedCommands = [
    "official-blog:review-session",
    "official-blog:parse-feed",
    "official-blog:intake",
    "official-blog:review-packet",
    "official-blog:review-handoff",
    "official-blog:review-decisions",
    "official-blog:authoring-brief",
    "official-blog:reviewed-authoring",
    "official-blog:author-records --dry-run",
    "official-blog:author-records --output-dir knowledge/official-blogs"
  ];
  let previousIndex = -1;
  for (const command of orderedCommands) {
    const nextIndex = runbook.indexOf(command);
    assert(nextIndex > previousIndex, `${command} must appear in workflow order`);
    previousIndex = nextIndex;
  }

  for (const requiredText of [
    "title + opening preview",
    "must not read full article text for first-pass admission",
    "review-session manifest",
    "session.review_packet",
    "handoff.review_packet",
    "new products",
    "new models",
    "harness engineering",
    "multi-agent workflows",
    "ordinary partnerships",
    "customer adoption",
    "needs_review",
    "human resolution checkpoint",
    "full article",
    "explicit `include` or `exclude` decision",
    "records_planned",
    "records_written: []",
    "does not create directories or record files",
    "docs/data",
    "docs/official-blogs",
    "public .html",
    "official_blog_preview_feed",
    "official_blog_intake_queue",
    "official_blog_review_packet",
    "official_blog_ai_review_handoff",
    "official_blog_review_decisions",
    "official_blog_authoring_brief",
    "official_blog_reviewed_authoring",
    "official_blog_knowledge_drafts",
    "npm run validate"
  ]) {
    assert(runbook.includes(requiredText), `runbook must include ${requiredText}`);
  }
});
