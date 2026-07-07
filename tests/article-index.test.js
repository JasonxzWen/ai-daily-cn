// Article index contract for the Aify-style homepage.
//
// Run: node --test tests/article-index.test.js

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { PublisherError } from "../src/errors.js";
import { scanPublicArtifactsForLocalInfo } from "../src/privacy.js";
import { buildArticleIndex, buildFrontendData, buildSite } from "../src/site.js";
import { renderIndexHtml } from "../src/render.js";
import {
  validateArticles,
  validateFrontendRuntime,
  validateFrontendSources,
  validateFrontendToday,
  validateFrontendTopics
} from "../src/schema.js";

const rootDir = process.cwd();
const trendConfigPath = path.join(rootDir, "config", "trends.json");

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

function sampleSourceWatchAdmittedArtifact() {
  return {
    schema_version: 1,
    kind: "source_watch_admitted_candidates",
    mode: "source_watch_admit_fixture_output",
    report_date: "2026-07-03",
    public_surface: false,
    candidates: [
      {
        id: "candidate-ml-news",
        canonical_id: "source-watch:ml-news",
        source_id: "repo-ml-news-of-the-week",
        signal: "github_watch",
        title: "SalvatoreRa/ML-news-of-the-week",
        url: "https://github.com/SalvatoreRa/ML-news-of-the-week",
        canonical_url: "https://github.com/SalvatoreRa/ML-news-of-the-week",
        source: "GitHub repo watch: SalvatoreRa/ML-news-of-the-week",
        event_date: "2026-07-03",
        category: "project",
        decision: "admitted",
        quality_score: 88,
        verification_status: "primary_confirmed",
        source_level: "github",
        editorial_category: "open_source",
        repo: "SalvatoreRa/ML-news-of-the-week",
        evidence: "GitHub repo SalvatoreRa/ML-news-of-the-week stars=3210 forks=210 pushed_at=2026-07-05T12:00:00Z",
        notes: "stars=3210; forks=210; pushed_at=2026-07-05T12:00:00Z; latest_commit=bbbbbbbbbbbb",
        repo_delta: { status: "changed", latest_commit_changed: true },
        freshness: { status: "fresh" },
        summary_template: {
          purpose: "SalvatoreRa/ML-news-of-the-week tracks open-source signals related to ml-news, weekly.",
          change: "Historical snapshot changed: latest_commit.",
          evidence: "stars=3210; forks=210; latest_commit=bbbbbbbbbbbb",
          fit: "Internal Source Watch candidate only; public promotion still needs downstream gates."
        },
        tags: ["ml-news", "weekly"]
      },
      {
        id: "candidate-aify",
        canonical_id: "source-watch:aify-news",
        source_id: "site-aify-news",
        signal: "site_watch",
        title: "Aify News",
        url: "https://aify-news.pages.dev/",
        canonical_url: "https://aify-news.pages.dev/",
        source: "Site watch: Aify News",
        event_date: "2026-07-03",
        category: "community_lead",
        decision: "admitted",
        quality_score: 91,
        verification_status: "first_class_source_confirmed",
        source_level: "ai_news_aggregator",
        source_lane: "aify",
        source_tier: "first_class",
        verification_policy: "no_secondary_review_required",
        editorial_category: "community",
        evidence: "Site metadata title=Aify News",
        notes: "feeds=1; discovered_github_repositories=1",
        summary_template: null,
        tags: ["ai-news"]
      },
      {
        id: "candidate-suppressed",
        signal: "github_watch",
        title: "taielab/awesome-ai-news",
        url: "https://github.com/taielab/awesome-ai-news",
        canonical_url: "https://github.com/taielab/awesome-ai-news",
        source: "GitHub repo watch: taielab/awesome-ai-news",
        event_date: "2026-07-03",
        decision: "suppressed",
        quality_score: 42,
        repo: "taielab/awesome-ai-news",
        summary_template: {
          purpose: "Suppressed repo should never become public."
        },
        tags: ["ai-news"]
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

test("buildArticleIndex consumes admitted Source Watch candidates as public articles", () => {
  const articles = buildArticleIndex([], {
    updatedAt: "2026-07-03T08:00:00.000Z",
    sourceWatchAdmittedArtifacts: [sampleSourceWatchAdmittedArtifact()]
  });

  assert.equal(articles.length, 2, "only admitted Source Watch candidates should become public articles");
  assert.equal(articles.some((article) => article.url.includes("awesome-ai-news")), false);

  const github = articles.find((article) => article.url.includes("ML-news-of-the-week"));
  assert.equal(github.section, "source_watch");
  assert.equal(github.date, "2026-07-03");
  assert.equal(github.source, "GitHub repo watch: SalvatoreRa/ML-news-of-the-week");
  assert.equal(github.quality_score, 88);
  assert.match(github.summary, /tracks open-source signals/);
  assert.match(github.summary, /3210 stars/);
  assert.match(github.summary, /Recent commit activity/);
  assert.doesNotMatch(github.summary, /latest_commit=|pushed_at=|stars=|forks=|Historical snapshot changed/);

  const aify = articles.find((article) => article.url === "https://aify-news.pages.dev/");
  assert.equal(aify.section, "source_watch");
  assert.equal(aify.source, "Aify News");
  assert.equal(aify.quality_score, 91);
  assert.match(aify.summary, /first-class AI news source/);

  const serialized = JSON.stringify(articles);
  for (const forbidden of [
    "candidate_id",
    "canonical_id",
    "source_id",
    "source_lane",
    "source_tier",
    "verification_policy",
    "verification_status",
    "repo_delta",
    "freshness",
    "summary_template",
    "admission",
    "rationale",
    "notes",
    "raw"
  ]) {
    assert.equal(serialized.includes(forbidden), false, `public Source Watch article leaked ${forbidden}`);
  }

  const validation = validateArticles(articles);
  assert.equal(validation.valid, true, JSON.stringify(validation.errors, null, 2));
});

test("buildSite publishes an explicit Source Watch admitted artifact into docs/articles.json", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "article-public-build-"));
  const inputDir = path.join(tmp, "reports-source");
  const outDir = path.join(tmp, "docs");
  const artifactPath = path.join(
    tmp,
    ".tmp",
    "daily-codex-pipeline",
    "2026-07-03",
    "artifacts",
    "admitted-candidates.json"
  );
  await fs.mkdir(inputDir, { recursive: true });
  await fs.mkdir(path.dirname(artifactPath), { recursive: true });
  await fs.copyFile(
    path.join(rootDir, "tests", "fixtures", "reports", "good", "official-release.md"),
    path.join(inputDir, "official-release.md")
  );
  await fs.writeFile(artifactPath, `${JSON.stringify(sampleSourceWatchAdmittedArtifact(), null, 2)}\n`, "utf8");

  const result = await buildSite({
    rootDir: tmp,
    inputDir,
    outDir,
    generatedAt: "2026-07-03T08:00:00.000Z",
    trendConfigPath,
    sourceWatchAdmittedArtifactPath: artifactPath
  });

  assert(result.writtenFiles.includes("articles.json"));
  assert(result.articles.some((article) => article.section === "source_watch"));
  const articles = JSON.parse(await fs.readFile(path.join(outDir, "articles.json"), "utf8"));
  const aify = articles.find((article) => article.url === "https://aify-news.pages.dev/");
  assert.equal(aify.source, "Aify News");
  assert.equal(aify.section, "source_watch");
  assert.equal(aify.report_url, "index.html");
  assert.equal(validateArticles(articles).valid, true);
  const feed = JSON.parse(await fs.readFile(path.join(outDir, "feed.json"), "utf8"));
  assert.equal(feed.reports[0].url, "index.html");
  const serialized = JSON.stringify(articles);
  assert.equal(serialized.includes("source_lane"), false);
  assert.equal(serialized.includes("latest_commit="), false);
  assert.equal(result.writtenFiles.some((filePath) => /^reports\/\d{4}\/\d{2}\/\d{4}-\d{2}-\d{2}\.html$/.test(filePath)), false);
  await assert.rejects(
    fs.readFile(path.join(outDir, "reports", "2026", "07", "2026-07-03.html"), "utf8"),
    /ENOENT/
  );
});

test("buildSite writes React frontend data artifacts with external AIFY articles", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "article-public-frontend-data-"));
  const inputDir = path.join(tmp, "reports-source");
  const outDir = path.join(tmp, "docs");
  await fs.mkdir(inputDir, { recursive: true });
  await fs.copyFile(
    path.join(rootDir, "tests", "fixtures", "reports", "good", "official-release.md"),
    path.join(inputDir, "official-release.md")
  );

  const result = await buildSite({
    rootDir: tmp,
    inputDir,
    outDir,
    generatedAt: "2026-07-07T08:00:00.000Z",
    trendConfigPath,
    externalArticleSources: [{
      id: "site-aify-news",
      name: "Aify News",
      url: "https://aify-news.pages.dev/",
      articles_url: "https://aify-news.pages.dev/articles.json",
      source_lane: "aify",
      tier: "first_class",
      verification_policy: "no_secondary_review_required",
      articles: [{
        title: "AIFY latest engineering signal",
        url: "https://example.com/aify-latest-engineering-signal",
        summary: "AIFY latest engineering signal explains how teams are changing AI engineering practice.",
        date: "2026-07-07",
        source: "AIFY Fixture",
        quality_score: 90,
        domain: "AI 用法与实践方法",
        channels_l1: ["AI 工程栈"],
        channels_l2: ["Agent 工程实践"],
        flavors: ["实战"]
      }]
    }]
  });

  for (const filePath of [
    "data/articles.json",
    "data/today.json",
    "data/topics.json",
    "data/sources.json",
    "data/runtime.json"
  ]) {
    assert(result.writtenFiles.includes(filePath), `${filePath} should be written`);
  }

  const articles = JSON.parse(await fs.readFile(path.join(outDir, "data", "articles.json"), "utf8"));
  assert(articles.some((article) => article.url === "https://example.com/aify-latest-engineering-signal"));
  const today = JSON.parse(await fs.readFile(path.join(outDir, "data", "today.json"), "utf8"));
  assert.equal(today.report_date, "2026-07-07");
  assert.equal(today.stats.aify_count, 1);
  const sources = JSON.parse(await fs.readFile(path.join(outDir, "data", "sources.json"), "utf8"));
  assert(sources.sources.some((source) => source.id === "site-aify-news" && source.article_count === 1));
  const topics = JSON.parse(await fs.readFile(path.join(outDir, "data", "topics.json"), "utf8"));
  const runtime = JSON.parse(await fs.readFile(path.join(outDir, "data", "runtime.json"), "utf8"));
  assert.equal(validateArticles(articles).valid, true);
  assert.equal(validateFrontendToday(today).valid, true);
  assert.equal(validateFrontendTopics(topics).valid, true);
  assert.equal(validateFrontendSources(sources).valid, true);
  assert.equal(validateFrontendRuntime(runtime).valid, true);
});

test("React frontend source schema rejects internal Source Watch strategy fields", () => {
  const frontendData = buildFrontendData({
    generatedAt: "2026-07-07T08:00:00.000Z",
    feed: { reports: [] },
    articles: buildArticleIndex([], {
      externalArticles: [{
        title: "AIFY schema source signal",
        url: "https://example.com/aify-schema-source-signal",
        summary: "AIFY schema source signal keeps public source records reader-safe.",
        date: "2026-07-07",
        source: "AIFY Source",
        quality_score: 86
      }]
    }),
    externalArticleSources: [{
      id: "site-aify-news",
      name: "Aify News",
      url: "https://aify-news.pages.dev/",
      articles: []
    }]
  });

  const valid = validateFrontendSources(frontendData.sources);
  assert.equal(valid.valid, true, JSON.stringify(valid.errors, null, 2));

  const leaked = validateFrontendSources({
    ...frontendData.sources,
    sources: [{
      ...frontendData.sources.sources[0],
      source_lane: "aify",
      verification_policy: "no_secondary_review_required"
    }]
  });
  assert.equal(leaked.valid, false);
  assert(leaked.errors.some((error) => error.keyword === "additionalProperties"));
});

test("buildSite degrades React runtime when AIFY article fetch fails", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "article-public-aify-failure-"));
  const inputDir = path.join(tmp, "reports-source");
  const outDir = path.join(tmp, "docs");
  await fs.mkdir(inputDir, { recursive: true });
  await fs.copyFile(
    path.join(rootDir, "tests", "fixtures", "reports", "good", "official-release.md"),
    path.join(inputDir, "official-release.md")
  );

  const result = await buildSite({
    rootDir: tmp,
    inputDir,
    outDir,
    generatedAt: "2026-07-07T08:00:00.000Z",
    trendConfigPath,
    externalArticleTargets: [{
      id: "site-aify-news",
      name: "Aify News",
      url: "https://aify-news.pages.dev/",
      articles_url: "https://aify-news.pages.dev/articles.json",
      content_kind: "aify_articles_json",
      source_tier: "first_class",
      source_lane: "aify",
      verification_policy: "no_secondary_review_required"
    }],
    fetchImpl: async () => {
      throw new Error("synthetic AIFY outage");
    }
  });

  assert.equal(result.externalArticleSources.length, 1);
  assert.equal(result.externalArticleSources[0].status, "blocked");
  assert.equal(result.externalArticleSources[0].articles.length, 0);

  const runtime = JSON.parse(await fs.readFile(path.join(outDir, "data", "runtime.json"), "utf8"));
  assert.equal(runtime.final_status, "degraded");
  assert.deepEqual(runtime.source_inputs, [{
    id: "site-aify-news",
    name: "Aify News",
    url: "https://aify-news.pages.dev/articles.json",
    status: "blocked",
    article_count: 0
  }]);
  assert.equal(validateFrontendRuntime(runtime).valid, true);

  const sources = JSON.parse(await fs.readFile(path.join(outDir, "data", "sources.json"), "utf8"));
  const aify = sources.sources.find((source) => source.id === "site-aify-news");
  assert.equal(aify.status, "blocked");
  assert.equal(aify.article_count, 0);
  assert.equal(validateFrontendSources(sources).valid, true);

  const today = JSON.parse(await fs.readFile(path.join(outDir, "data", "today.json"), "utf8"));
  assert.equal(today.stats.aify_count, 0);
  assert.equal(validateFrontendToday(today).valid, true);
});

test("buildSite rejects Source Watch admitted artifact paths outside the pipeline temp root", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "article-public-build-scope-"));
  const inputDir = path.join(tmp, "reports-source");
  const outDir = path.join(tmp, "docs");
  const artifactPath = path.join(tmp, "admitted-candidates.json");
  await fs.mkdir(inputDir, { recursive: true });
  await fs.copyFile(
    path.join(rootDir, "tests", "fixtures", "reports", "good", "official-release.md"),
    path.join(inputDir, "official-release.md")
  );
  await fs.writeFile(artifactPath, `${JSON.stringify(sampleSourceWatchAdmittedArtifact(), null, 2)}\n`, "utf8");

  await assert.rejects(
    () => buildSite({
      rootDir: tmp,
      inputDir,
      outDir,
      generatedAt: "2026-07-03T08:00:00.000Z",
      trendConfigPath,
      sourceWatchAdmittedArtifactPath: artifactPath
    }),
    (error) => error instanceof PublisherError && error.code === "source_watch_admitted_artifact_path_out_of_scope"
  );
});

test("buildArticleIndex accepts direct Source Watch candidate arrays with per-candidate dates", () => {
  const artifact = sampleSourceWatchAdmittedArtifact();
  const articles = buildArticleIndex([], {
    sourceWatchAdmittedCandidates: artifact.candidates.map((candidate) => ({
      ...candidate,
      report_date: artifact.report_date
    }))
  });

  assert.equal(articles.length, 2);
  assert(articles.every((article) => article.report_date === "2026-07-03"));
  const validation = validateArticles(articles);
  assert.equal(validation.valid, true, JSON.stringify(validation.errors, null, 2));
});

test("buildArticleIndex normalizes AIFY article JSON records into public articles", () => {
  const articles = buildArticleIndex([], {
    externalArticles: [{
      title: "Latent Space 拆解 Claude Fable 5 使用方法论",
      url: "https://www.latent.space/p/ainews-the-field-guide-to-fable?utm_source=aify",
      summary: "Latent Space 归纳了与新一代模型协作的方法，包括解除旧约束、主动寻找盲区和提高对模型输出的要求。",
      date: "2026-07-07",
      source: "Latent Space",
      quality_score: 80,
      flavors: ["实战"],
      domain: "AI 用法与实践方法",
      channels_l1: ["AI 实践方法"],
      channels_l2: ["AI 场景实战", "Agent 工程实践"],
      companies: ["Anthropic"],
      products: ["Claude"]
    }]
  });

  assert.equal(articles.length, 1);
  assert.equal(articles[0].section, "source_watch");
  assert.equal(articles[0].source, "Latent Space");
  assert.equal(articles[0].flavors.includes("实战方法"), true);
  assert.equal(articles[0].channels_l1.includes("AI 实践方法"), true);
  assert.equal(articles[0].quality_score, 80);
  assert.equal(validateArticles(articles).valid, true);
});

test("buildFrontendData writes first-screen data around latest articles", () => {
  const articles = buildArticleIndex([], {
    externalArticles: [{
      title: "AIFY latest product signal",
      url: "https://example.com/aify-latest-product-signal",
      summary: "AIFY latest product signal gives readers a useful daily AI update.",
      date: "2026-07-07",
      source: "AIFY Source",
      quality_score: 92,
      domain: "AI 产品与应用工具",
      channels_l1: ["新兴 AI 产品与项目"],
      channels_l2: ["AI 应用工具"],
      flavors: ["快讯"]
    }]
  });
  const frontendData = buildFrontendData({
    generatedAt: "2026-07-07T08:00:00.000Z",
    feed: { reports: [] },
    articles,
    externalArticleSources: [{
      id: "site-aify-news",
      name: "Aify News",
      url: "https://aify-news.pages.dev/",
      articles
    }]
  });

  assert.equal(frontendData.today.report_date, "2026-07-07");
  assert.equal(frontendData.today.stats.aify_count, 1);
  assert.equal(frontendData.today.articles[0].title, "AIFY latest product signal");
  assert.equal(frontendData.topics.topics.some((topic) => topic.label === "新兴 AI 产品与项目"), true);
  assert.equal(frontendData.sources.sources.some((source) => source.id === "site-aify-news"), true);
  assert.equal(frontendData.runtime.final_status, "ready");
});

test("Source Watch article records dedupe with report-derived records by canonical URL", () => {
  const artifact = sampleSourceWatchAdmittedArtifact();
  artifact.candidates = [{
    ...artifact.candidates[0],
    id: "candidate-codex-duplicate",
    title: "openai/codex",
    url: "https://github.com/openai/codex?utm_source=source-watch",
    canonical_url: "https://github.com/openai/codex?utm_source=source-watch",
    source: "Source Watch duplicate",
    quality_score: 97,
    summary_template: {
      purpose: "Duplicate URL should merge with the report article.",
      change: "Source Watch saw the same public URL.",
      evidence: "verified duplicate"
    }
  }];

  const articles = buildArticleIndex([sampleReport()], {
    updatedAt: "2026-07-03T08:00:00.000Z",
    sourceWatchAdmittedArtifacts: [artifact]
  });

  const duplicates = articles.filter((article) => article.url.includes("github.com/openai/codex"));
  assert.equal(duplicates.length, 1);
  assert.equal(duplicates[0].quality_score, 97);
  assert.notEqual(duplicates[0].section, "source_watch", "existing report-derived public article should remain the primary record");
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
    "canonical_id",
    "source_id",
    "source_lane",
    "source_tier",
    "verification_policy",
    "verification_status",
    "repo_delta",
    "freshness",
    "summary_template",
    "admission",
    "rationale"
  ]) {
    assert.equal(serialized.includes(forbidden), false, `public articles.json leaked ${forbidden}`);
  }
});

test("article schema rejects invalid public records", () => {
  const [validArticle] = buildArticleIndex([sampleReport()], {
    updatedAt: "2026-07-03T08:00:00.000Z"
  });

  const withInternalField = validateArticles([{ ...validArticle, candidate_id: "internal" }]);
  assert.equal(withInternalField.valid, false, "schema should reject unexpected internal fields");
  assert(withInternalField.errors.some((error) => error.keyword === "additionalProperties"));

  const missingRequired = { ...validArticle };
  delete missingRequired.quality_score;
  const missingResult = validateArticles([missingRequired]);
  assert.equal(missingResult.valid, false, "schema should reject missing quality_score");
  assert(missingResult.errors.some((error) => error.keyword === "required"));

  const invalidTaxonomy = validateArticles([{ ...validArticle, domain: "invalid-domain" }]);
  assert.equal(invalidTaxonomy.valid, false, "schema should reject invalid taxonomy enum");
  assert(invalidTaxonomy.errors.some((error) => error.keyword === "enum"));

  const invalidScore = validateArticles([{ ...validArticle, quality_score: 101 }]);
  assert.equal(invalidScore.valid, false, "schema should reject out-of-range quality_score");
  assert(invalidScore.errors.some((error) => error.keyword === "maximum"));
});

test("article index generation is deterministic for identical input", () => {
  const options = { updatedAt: "2026-07-03T08:00:00.000Z" };
  const first = buildArticleIndex([sampleReport()], options);
  const second = buildArticleIndex([sampleReport()], options);

  assert.deepEqual(second, first);
  assert.equal(JSON.stringify(second), JSON.stringify(first));
});

test("public artifact scan includes docs/articles.json internal fields", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "article-public-scan-"));
  await fs.mkdir(path.join(rootDir, "docs"), { recursive: true });
  await fs.writeFile(
    path.join(rootDir, "docs", "articles.json"),
    `${JSON.stringify([{ id: "article-1", candidate_id: "internal-candidate" }], null, 2)}\n`,
    "utf8"
  );

  const result = await scanPublicArtifactsForLocalInfo({ rootDir });
  assert.equal(result.ok, false);
  assert(
    result.findings.some((finding) =>
      finding.file === "docs/articles.json" && finding.pattern === "public_internal_audit_field"
    ),
    JSON.stringify(result.findings, null, 2)
  );
});

test("homepage renders the article library as the primary surface", () => {
  const articles = buildArticleIndex([sampleReport()], {
    updatedAt: "2026-07-03T08:00:00.000Z"
  });
  articles.push({
    ...articles[0],
    id: "article-old-history-only",
    title: "Very Old History Only Article",
    url: "https://example.com/old-history-only",
    date: "2026-01-01",
    month: "2026-01",
    report_date: "2026-01-01",
    report_url: "reports/2026/01/2026-01-01.html",
    data_url: "data/2026/01/2026-01-01.json"
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
  assert.match(html, /昨日回看/);
  assert.match(html, /全部资讯/);
  assert.match(html, /商业洞察|技术拆解|实战方法/);
  assert.match(html, /articles\.json/);
  assert.match(html, /id="articleSource"/);
  assert.match(html, /id="articleScore"/);
  assert.match(html, /window\.__ARTICLE_INDEX_INLINE__/);
  assert.match(html, /requestIdleCallback|setTimeout/);
  assert.match(html, /window\.__ARTICLE_INDEX_URL__="articles\.json"/);
  assert.match(html, /fetch\(url/);
  assert.doesNotMatch(html, /window\.__ARTICLE_INDEX__=/);
  assert.doesNotMatch(html, /Very Old History Only Article/);
  assert.doesNotMatch(html, /近 30 天共/);
  assert.doesNotMatch(html, /source-lane-board/);
});
