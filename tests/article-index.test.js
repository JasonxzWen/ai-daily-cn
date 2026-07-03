// Article index contract for the Aify-style homepage.
//
// Run: node --test tests/article-index.test.js

import assert from "node:assert/strict";
import test from "node:test";
import { buildArticleIndex } from "../src/site.js";
import { renderIndexHtml } from "../src/render.js";
import { validateArticles } from "../src/schema.js";

const AIFY_DOMAINS = new Set([
  "AI 产品与应用工具",
  "AI 用法与实践方法",
  "企业落地与业务应用",
  "行业动态与政策地缘",
  "基础模型与算力技术栈",
  "多模态与具身等前沿"
]);

function sampleReport() {
  return {
    schema_version: 1,
    report_date: "2026-07-03",
    title: "AI 日报 2026-07-03",
    summary: "今日主线转向企业 AI 治理、模型基础设施和 Agent 工程实践。",
    generated_at: "2026-07-03T08:00:00.000Z",
    stories: [
      {
        story_id: "story-frontier-company",
        title: "Official Microsoft Blog: Microsoft Frontier Company AI Engineering",
        object: "微软提出 Frontier Company 的 AI 工程治理方法",
        what_happened: "微软把 Frontier Company 描述为人和 AI 共同工作的组织形态，重点放在权限、隐私、安全和治理控制。",
        why_it_matters: "企业采用 AI 后，真正的难点正在从试用功能转向可控部署和组织治理。",
        importance: "major",
        event_date: "2026-07-02",
        evidence_level: "primary",
        sources: [
          {
            label: "Official Microsoft Blog",
            url: "https://blogs.microsoft.com/blog/2026/07/02/microsoft-frontier-company-ai-engineering-that-amplifies-and-protects-your-intelligence/",
            type: "official"
          }
        ]
      }
    ],
    main_items: [
      {
        title: "Official Microsoft Blog: Microsoft Frontier Company AI Engineering",
        url: "https://blogs.microsoft.com/blog/2026/07/02/microsoft-frontier-company-ai-engineering-that-amplifies-and-protects-your-intelligence/",
        source: "Official Microsoft Blog",
        summary: "微软强调 AI 工程要同时覆盖协作、权限控制、隐私保护和治理。",
        editorial_category: "ai_industry",
        tier: "T0",
        importance: "major",
        entities: ["Microsoft", "Frontier Company"],
        candidate_id: "internal-candidate-id",
        reader_relevance: "internal only"
      }
    ],
    hot_blogs: [
      {
        title: "SGLang 团队把 CUDA 调优写进 Agent 工作流",
        url: "https://lmsys.org/blog/2026-07-03-sglang-agent-workflow/",
        publisher: "LMSYS Blog",
        summary: "SGLang 团队把 CUDA 调优、内核集成和性能分析拆成可复用的 agent 工作流。",
        topic: "agent engineering",
        content_type: "analysis",
        event_date: "2026-07-03",
        importance: "notable",
        candidate_id: "internal-blog-candidate"
      }
    ],
    github_trending: [
      {
        name: "openai/codex",
        repo: "openai/codex",
        url: "https://github.com/openai/codex",
        description: "Coding agent that runs in the terminal.",
        readme_summary: "Codex 是面向终端的 coding agent，适合自动化代码阅读、修改和验证。",
        source: "GitHub Trending",
        language: "TypeScript",
        rank: 1,
        event_date: "2026-07-03",
        importance: "notable"
      }
    ],
    builder_observations: [
      {
        author: "Builder",
        handle: "builder",
        content: "Agent 已经不是应用里的一个功能，而是独立的软件形态。",
        original_text: "Agents are becoming standalone software, not a feature inside apps.",
        url: "https://x.com/builder/status/1",
        role: "Founder",
        source: "X",
        event_date: "2026-07-03",
        importance: "general",
        candidate_id: "internal-builder-candidate"
      }
    ]
  };
}

test("buildArticleIndex emits public Aify-style article records", () => {
  const articles = buildArticleIndex([sampleReport()], {
    siteTitle: "AI 日报",
    siteUrl: "https://example.com/ai-daily-cn/",
    updatedAt: "2026-07-03T08:00:00.000Z"
  });

  assert.ok(Array.isArray(articles), "articles.json should be an array like Aify");
  assert.equal(
    articles.filter((article) => article.url.includes("frontier-company")).length,
    1,
    "story and main item with the same URL should dedupe into one article"
  );
  assert.ok(articles.length >= 4, "fixture should produce article records from multiple report sections");

  for (const article of articles) {
    assert.equal(article.date.length, 10);
    assert.equal(article.month, "2026-07");
    assert.ok(article.id, "article requires a stable id");
    assert.ok(article.title, "article requires title");
    assert.ok(article.summary, "article requires summary");
    assert.ok(article.source, "article requires source");
    assert.ok(article.report_url.endsWith("2026-07-03.html"));
    assert.ok(article.data_url.endsWith("2026-07-03.json"));
    assert.ok(Number.isInteger(article.quality_score), "quality_score must be integer");
    assert.ok(article.quality_score >= 0 && article.quality_score <= 100);
    assert.ok(AIFY_DOMAINS.has(article.domain), `unexpected domain ${article.domain}`);
    assert.ok(Array.isArray(article.flavors) && article.flavors.length > 0);
    assert.ok(Array.isArray(article.channels_l1) && article.channels_l1.length > 0);
    assert.ok(Array.isArray(article.channels_l2));
    assert.ok(Array.isArray(article.companies));
    assert.ok(Array.isArray(article.products));
  }

  const validation = validateArticles(articles);
  assert.equal(validation.valid, true, JSON.stringify(validation.errors, null, 2));
});

test("article index does not leak internal generation fields", () => {
  const articles = buildArticleIndex([sampleReport()], {
    updatedAt: "2026-07-03T08:00:00.000Z"
  });
  const serialized = JSON.stringify(articles);
  for (const forbidden of [
    "candidate_id",
    "source_audit",
    "self_check",
    "candidate_pool",
    "reader_relevance",
    "admission",
    "rationale"
  ]) {
    assert.equal(serialized.includes(forbidden), false, `public articles.json leaked ${forbidden}`);
  }
});

test("homepage renders the article library as the primary surface", () => {
  const articles = buildArticleIndex([sampleReport()], {
    updatedAt: "2026-07-03T08:00:00.000Z"
  });
  const html = renderIndexHtml({
    schema_version: 1,
    site_title: "AI 日报",
    site_url: "https://example.com/ai-daily-cn/",
    updated_at: "2026-07-03T08:00:00.000Z",
    reports: [
      {
        report_date: "2026-07-03",
        title: "AI 日报 2026-07-03",
        summary: "今日主线转向企业 AI 治理、模型基础设施和 Agent 工程实践。",
        url: "reports/2026/07/2026-07-03.html",
        data_url: "data/2026/07/2026-07-03.json",
        main_items: 1,
        builder_observations: 1,
        generated_at: "2026-07-03T08:00:00.000Z"
      }
    ]
  }, null, null, {
    articles,
    styleVersion: "test"
  });

  assert.match(html, /data-article-index="aify-style"/);
  assert.match(html, /AI 资讯库/);
  assert.match(html, /今日精选/);
  assert.match(html, /全部资讯/);
  assert.match(html, /商业洞察|技术拆解|实战方法/);
  assert.match(html, /articles\.json/);
  assert.doesNotMatch(html, /近 30 天共/);
  assert.doesNotMatch(html, /source-lane-board/);
});
