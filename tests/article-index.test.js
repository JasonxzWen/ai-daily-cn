// Article index contract for the Aify-style homepage.
//
// Run: node --test tests/article-index.test.js

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { scanPublicArtifactsForLocalInfo } from "../src/privacy.js";
import { buildArticleIndex, buildHomeData, buildSite, collectJsonFiles } from "../src/site.js";
import { validateArticles, validateHome } from "../src/schema.js";

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

test("legacy report scan ignores baseline and internal shadow signal trees", async () => {
  const dataInputDir = await fs.mkdtemp(path.join(os.tmpdir(), "adc-report-scan-"));
  const reportDir = path.join(dataInputDir, "2026", "07");
  const signalPoolDir = path.join(dataInputDir, "signals", "2026", "07");
  const publicSignalPoolDir = path.join(dataInputDir, "public-signal-pool", "2026", "07");
  await fs.mkdir(reportDir, { recursive: true });
  await fs.mkdir(signalPoolDir, { recursive: true });
  await fs.mkdir(publicSignalPoolDir, { recursive: true });
  await fs.writeFile(path.join(reportDir, "2026-07-14.json"), "{}", "utf8");
  await fs.writeFile(path.join(dataInputDir, "occurrence-baseline-manifest.json"), "{}", "utf8");
  await fs.writeFile(path.join(signalPoolDir, "2026-07-14.json"), "{}", "utf8");
  await fs.writeFile(path.join(publicSignalPoolDir, "2026-07-14.json"), "{}", "utf8");

  const files = await collectJsonFiles(dataInputDir);

  assert.deepEqual(files, [path.join(reportDir, "2026-07-14.json")]);
});

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

function sampleSourceWatchCandidatePool() {
  return {
    schema_version: 1,
    report_date: "2026-07-03",
    generated_at: "2026-07-03T08:00:00.000Z",
    sources: [
      {
        id: "repo-ml-news-of-the-week",
        name: "SalvatoreRa/ML-news-of-the-week",
        url: "https://github.com/SalvatoreRa/ML-news-of-the-week",
        category: "repository",
        status: "checked"
      },
      {
        id: "site-aify-news",
        name: "Aify News",
        url: "https://aify-news.pages.dev/",
        category: "community",
        status: "checked"
      },
      {
        id: "repo-awesome-ai-news",
        name: "taielab/awesome-ai-news",
        url: "https://github.com/taielab/awesome-ai-news",
        category: "repository",
        status: "checked"
      }
    ],
    candidates: [
      {
        id: "candidate-ml-news",
        source_id: "repo-ml-news-of-the-week",
        title: "SalvatoreRa/ML-news-of-the-week",
        url: "https://github.com/SalvatoreRa/ML-news-of-the-week",
        source: "GitHub repo watch: SalvatoreRa/ML-news-of-the-week",
        event_date: "2026-07-03",
        category: "project",
        status: "included",
        included_in: "source_watch",
        verification_status: "primary_confirmed",
        source_level: "github",
        editorial_category: "open_source",
        evidence: "GitHub repo SalvatoreRa/ML-news-of-the-week stars=3210 forks=210 pushed_at=2026-07-05T12:00:00Z",
        notes: "stars=3210; forks=210; pushed_at=2026-07-05T12:00:00Z; latest_commit=bbbbbbbbbbbb",
        source_watch: {
          signal: "github_watch",
          target_id: "repo-ml-news-of-the-week",
          source_lane: "github_watch",
          source_tier: "watchlist",
          verification_policy: "primary_source_required",
          event_url: "https://github.com/SalvatoreRa/ML-news-of-the-week/releases/tag/2026-W27",
          snapshot_fingerprint: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
          repo_snapshot: {
            repo: "SalvatoreRa/ML-news-of-the-week",
            stars: 3210,
            forks: 210,
            open_issues: 12,
            pushed_at: "2026-07-05T12:00:00Z",
            updated_at: "2026-07-05T12:00:00Z",
            default_branch: "main",
            language: "Python",
            license: "MIT",
            latest_release: {
              tag_name: "2026-W27",
              name: "2026-W27",
              html_url: "https://github.com/SalvatoreRa/ML-news-of-the-week/releases/tag/2026-W27",
              published_at: "2026-07-05T10:00:00Z",
              prerelease: false
            },
            latest_tag: { name: "2026-W27", commit_sha: "bbbbbbbbbbbb" },
            latest_commit: {
              sha: "bbbbbbbbbbbb",
              html_url: "https://github.com/SalvatoreRa/ML-news-of-the-week/commit/bbbbbbbbbbbb",
              message: "Add July AI model notes",
              author_date: "2026-07-05T12:00:00Z",
              author_name: "Maintainer"
            },
            readme_status: "checked"
          }
        },
        tags: ["ml-news", "weekly"]
      },
      {
        id: "candidate-aify",
        source_id: "site-aify-news",
        title: "Aify News",
        url: "https://aify-news.pages.dev/",
        source: "Site watch: Aify News",
        event_date: "2026-07-03",
        category: "community_lead",
        status: "included",
        included_in: "source_watch",
        verification_status: "intermediary_only",
        source_level: "ai_news_aggregator",
        editorial_category: "community_signal",
        evidence: "Site metadata title=Aify News",
        notes: "feeds=1; discovered_github_repositories=1",
        source_watch: {
          signal: "site_watch",
          target_id: "site-aify-news",
          source_lane: "aify",
          source_tier: "first_class",
          verification_policy: "no_secondary_review_required",
          event_url: "https://aify-news.pages.dev/",
          snapshot_fingerprint: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
          site_snapshot: {
            title: "Aify News",
            description: "Aify AI 新闻聚合站更新了公开信源快照。",
            canonical_url: "https://aify-news.pages.dev/",
            content_fingerprint: "sha256:3333333333333333333333333333333333333333333333333333333333333333",
            feeds: [{ title: "Aify Feed", type: "application/rss+xml", url: "https://aify-news.pages.dev/feed.xml" }],
            discovered_github_repositories: [{ repo: "example/aify-news", url: "https://github.com/example/aify-news" }]
          }
        },
        tags: ["ai-news"]
      },
      {
        id: "candidate-suppressed",
        source_id: "repo-awesome-ai-news",
        title: "taielab/awesome-ai-news",
        url: "https://github.com/taielab/awesome-ai-news",
        source: "GitHub repo watch: taielab/awesome-ai-news",
        event_date: "2026-07-03",
        category: "project",
        status: "excluded",
        exclusion_reason: "source_watch_snapshot_unchanged"
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
    assert.ok(article.report_url.endsWith("2026-07-03.json"));
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

test("home data binds editions by report_date and preserves editorial story order", () => {
  const latest = sampleReport();
  latest.stories = Array.from({ length: 6 }, (_, index) => {
    const story = structuredClone(latest.stories[0]);
    story.story_id = `story-latest-${index + 1}`;
    story.object = `本期主故事 ${index + 1}`;
    story.title = `Latest story ${index + 1}`;
    story.event_date = "2026-07-02";
    story.sources[0].url = `https://example.com/latest-story-${index + 1}`;
    return story;
  });
  latest.main_items = [];

  const previous = structuredClone(latest);
  previous.report_date = "2026-07-02";
  previous.title = "AI 日报 2026-07-02";
  previous.summary = "上一期编辑摘要。";
  previous.generated_at = "2026-07-02T08:00:00.000Z";
  previous.stories = previous.stories.slice(0, 2).map((story, index) => ({
    ...story,
    story_id: `story-previous-${index + 1}`,
    object: `上一期主故事 ${index + 1}`,
    title: `Previous story ${index + 1}`,
    event_date: "2026-07-01",
    sources: [{
      ...story.sources[0],
      url: `https://example.com/previous-story-${index + 1}`
    }]
  }));

  const feed = {
    schema_version: 1,
    site_title: "AI 日报",
    site_url: "https://example.com/ai-daily-cn/",
    updated_at: "2026-07-03T08:00:00.000Z",
    reports: [latest, previous].map((report) => ({
      report_date: report.report_date,
      title: report.title,
      summary: report.summary,
      url: `reports/2026/07/${report.report_date}.html`,
      data_url: `data/2026/07/${report.report_date}.json`,
      main_items: report.stories.length,
      builder_observations: 0,
      generated_at: report.generated_at
    }))
  };
  const articles = buildArticleIndex([previous, latest], {
    updatedAt: feed.updated_at,
    sourceWatchCandidatePools: [sampleSourceWatchCandidatePool()]
  });
  const home = buildHomeData([previous, latest], { feed, articles });

  assert.equal(home.latest_edition.report_date, "2026-07-03");
  assert.equal(home.previous_edition.report_date, "2026-07-02");
  assert.deepEqual(
    [
      home.latest_edition.lead_story,
      ...home.latest_edition.secondary_stories,
      ...home.latest_edition.compact_stories
    ].map((story) => story.title),
    latest.stories.map((story) => story.object),
    "home edition must retain report.stories order even when every event happened the previous day"
  );
  assert.equal(home.latest_edition.lead_story.event_date, "2026-07-02");
  assert.equal(home.latest_edition.story_count, 6);
  assert.equal(home.previous_edition.story_count, 2);
  assert.equal(home.source_watch.length, 2);
  assert(home.source_watch.length <= 4);
  assert.equal(Buffer.byteLength(`${JSON.stringify(home, null, 2)}\n`), home.byte_size);
  assert(home.byte_size < 128 * 1024, `home.json must stay lightweight, got ${home.byte_size}`);

  const serialized = JSON.stringify(home);
  for (const forbidden of [
    "quality_score",
    "candidate_id",
    "candidate_pool_path",
    "admission",
    "rationale",
    "source_effectiveness",
    "self_check"
  ]) {
    assert.equal(serialized.includes(forbidden), false, `home data leaked ${forbidden}`);
  }

  const validation = validateHome(home);
  assert.equal(validation.valid, true, JSON.stringify(validation.errors, null, 2));
  const invalid = structuredClone(home);
  invalid.latest_edition.lead_story.quality_score = 99;
  const invalidResult = validateHome(invalid);
  assert.equal(invalidResult.valid, false, "home schema must reject internal score fields");
  assert(invalidResult.errors.some((error) => error.keyword === "additionalProperties"));
});

test("buildArticleIndex consumes included Source Watch candidates from persistent candidate pools", () => {
  const articles = buildArticleIndex([], {
    updatedAt: "2026-07-03T08:00:00.000Z",
    sourceWatchCandidatePools: [sampleSourceWatchCandidatePool()]
  });

  assert.equal(articles.length, 2, "only included Source Watch candidates should become public articles");
  assert.equal(articles.some((article) => article.url.includes("awesome-ai-news")), false);

  const github = articles.find((article) => article.url.includes("commit/bbbbbbbbbbbb"));
  assert.equal(github.section, "source_watch");
  assert.equal(github.date, "2026-07-05");
  assert.equal(github.source, "GitHub repo watch: SalvatoreRa/ML-news-of-the-week");
  assert.equal(github.quality_score, 78);
  assert.match(github.summary, /Add July AI model notes/);
  assert.match(github.summary, /公开提交/);
  assert.equal(Object.hasOwn(github, "report_date"), false);
  assert.equal(Object.hasOwn(github, "report_url"), false);
  assert.equal(Object.hasOwn(github, "data_url"), false);
  assert.doesNotMatch(github.summary, /latest_commit=|pushed_at=|stars=|forks=|snapshot_fingerprint/);

  const aify = articles.find((article) => article.url === "https://aify-news.pages.dev/");
  assert.equal(aify.section, "source_watch");
  assert.equal(aify.source, "Aify News");
  assert.equal(aify.quality_score, 78);
  assert.match(aify.summary, /信源快照/);

  const serialized = JSON.stringify(articles);
  for (const forbidden of [
    "candidate_id",
    "canonical_id",
    "source_id",
    "snapshot_fingerprint",
    "verification_status",
    "repo_delta",
    "freshness",
    "summary_template",
    "admission",
    "rationale",
    '"notes":',
    "raw"
  ]) {
    assert.equal(serialized.includes(forbidden), false, `public Source Watch article leaked ${forbidden}`);
  }

  const validation = validateArticles(articles);
  assert.equal(validation.valid, true, JSON.stringify(validation.errors, null, 2));
});

test("buildSite publishes Source Watch candidates from the persistent candidate pool", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "article-public-build-"));
  const inputDir = path.join(tmp, "reports-source");
  const dataInputDir = path.join(tmp, "reports-data");
  const outDir = path.join(tmp, "docs");
  const candidatePoolPath = path.join(dataInputDir, "internal", "candidates", "2026", "05", "2026-05-13.candidates.json");
  const candidatePool = sampleSourceWatchCandidatePool();
  candidatePool.report_date = "2026-05-13";
  candidatePool.generated_at = "2026-05-13T08:00:00.000Z";
  candidatePool.candidates = candidatePool.candidates.map((candidate) => ({
    ...candidate,
    event_date: "2026-05-13"
  }));
  await fs.mkdir(inputDir, { recursive: true });
  await fs.mkdir(path.dirname(candidatePoolPath), { recursive: true });
  await fs.copyFile(
    path.join(rootDir, "tests", "fixtures", "reports", "good", "official-release.md"),
    path.join(inputDir, "official-release.md")
  );
  await fs.writeFile(candidatePoolPath, `${JSON.stringify(candidatePool, null, 2)}\n`, "utf8");

  const result = await buildSite({
    rootDir: tmp,
    inputDir,
    dataInputDir,
    outDir,
    generatedAt: "2026-07-03T08:00:00.000Z",
    trendConfigPath
  });

  assert(result.writtenFiles.includes("articles.json"));
  assert(result.writtenFiles.includes("home.json"));
  assert(result.articles.some((article) => article.section === "source_watch"));
  assert.equal(validateHome(result.home).valid, true, JSON.stringify(validateHome(result.home).errors, null, 2));
  const home = JSON.parse(await fs.readFile(path.join(outDir, "home.json"), "utf8"));
  assert.deepEqual(home, result.home);
  assert.equal(home.latest_edition.report_date, "2026-05-13");
  assert.equal(home.source_watch.length, 2);
  const articles = JSON.parse(await fs.readFile(path.join(outDir, "articles.json"), "utf8"));
  const aify = articles.find((article) => article.url === "https://aify-news.pages.dev/");
  assert.equal(aify.source, "Aify News");
  assert.equal(aify.section, "source_watch");
  assert.equal(validateArticles(articles).valid, true);
  assert.deepEqual(result.sourceWatchConsumption, {
    candidate_pool_count: 1,
    candidate_pool_paths: [candidatePoolPath],
    candidate_pool_hashes: [{ path: candidatePoolPath, sha256: result.sourceWatchConsumption.candidate_pool_hashes[0].sha256 }],
    included_candidate_count: 2,
    public_article_count: 2
  });
  assert.match(result.sourceWatchConsumption.candidate_pool_hashes[0].sha256, /^[a-f0-9]{64}$/);
  const serialized = JSON.stringify(articles);
  assert.equal(serialized.includes("source_watch"), true, "public records retain only the section name");
  assert.equal(serialized.includes("snapshot_fingerprint"), false);
  assert.equal(serialized.includes("latest_commit="), false);
});

test("buildSite keeps Source Watch consumption proof fixed to the requested report date", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "article-source-watch-receipt-"));
  const inputDir = path.join(tmp, "reports-source");
  const dataInputDir = path.join(tmp, "reports-data");
  const outDir = path.join(tmp, "docs");
  const oldDate = "2026-05-13";
  const newDate = "2026-05-14";
  const oldPoolPath = path.join(dataInputDir, "internal", "candidates", "2026", "05", `${oldDate}.candidates.json`);
  const newPoolPath = path.join(dataInputDir, "internal", "candidates", "2026", "05", `${newDate}.candidates.json`);
  const markdown = await fs.readFile(
    path.join(rootDir, "tests", "fixtures", "reports", "good", "official-release.md"),
    "utf8"
  );
  await fs.mkdir(inputDir, { recursive: true });
  await fs.mkdir(path.dirname(oldPoolPath), { recursive: true });
  await fs.writeFile(path.join(inputDir, "old.md"), markdown, "utf8");
  await fs.writeFile(path.join(inputDir, "new.md"), markdown.replaceAll(oldDate, newDate), "utf8");

  const oldPool = sampleSourceWatchCandidatePool();
  oldPool.report_date = oldDate;
  oldPool.generated_at = `${oldDate}T08:00:00.000Z`;
  oldPool.candidates = [structuredClone(oldPool.candidates.find((candidate) => candidate.id === "candidate-aify"))];
  oldPool.candidates[0].event_date = oldDate;
  const newPool = structuredClone(oldPool);
  newPool.report_date = newDate;
  newPool.generated_at = `${newDate}T08:00:00.000Z`;
  newPool.candidates[0].id = "candidate-aify-new-date";
  newPool.candidates[0].event_date = newDate;
  newPool.candidates[0].source_watch.snapshot_fingerprint = `sha256:${"7".repeat(64)}`;
  newPool.candidates[0].source_watch.site_snapshot.content_fingerprint = `sha256:${"8".repeat(64)}`;
  newPool.candidates[0].source_watch.site_snapshot.description = "Aify 在 5 月 14 日出现新的公开内容。";
  await fs.writeFile(oldPoolPath, `${JSON.stringify(oldPool, null, 2)}\n`, "utf8");
  await fs.writeFile(newPoolPath, `${JSON.stringify(newPool, null, 2)}\n`, "utf8");

  const result = await buildSite({
    rootDir: tmp,
    inputDir,
    dataInputDir,
    outDir,
    generatedAt: "2026-05-14T08:00:00.000Z",
    trendConfigPath,
    sourceWatchConsumptionReportDate: newDate
  });

  assert.equal(result.articles.filter((article) => article.section === "source_watch").length, 1);
  assert.equal(result.sourceWatchConsumption.candidate_pool_count, 1);
  assert.deepEqual(result.sourceWatchConsumption.candidate_pool_paths, [newPoolPath]);
  assert.deepEqual(result.sourceWatchConsumption.candidate_pool_hashes.map((item) => item.path), [newPoolPath]);
  assert.equal(result.sourceWatchConsumption.included_candidate_count, 1);
  assert.equal(result.sourceWatchConsumption.public_article_count, 1);
  assert.equal(JSON.stringify(result.sourceWatchConsumption).includes(oldPoolPath), false);
});

test("Source Watch article records dedupe with report-derived records by canonical URL", () => {
  const candidatePool = sampleSourceWatchCandidatePool();
  candidatePool.candidates = [{
    ...candidatePool.candidates[0],
    id: "candidate-codex-duplicate",
    title: "openai/codex",
    url: "https://github.com/openai/codex?utm_source=source-watch",
    source: "Source Watch duplicate",
    source_watch: {
      ...candidatePool.candidates[0].source_watch,
      event_url: "https://github.com/openai/codex?utm_source=source-watch",
      repo_snapshot: {
        ...candidatePool.candidates[0].source_watch.repo_snapshot,
        repo: "openai/codex",
        latest_release: null,
        latest_tag: null,
        latest_commit: null
      }
    }
  }];

  const articles = buildArticleIndex([sampleReport()], {
    updatedAt: "2026-07-03T08:00:00.000Z",
    sourceWatchCandidatePools: [candidatePool]
  });

  const duplicates = articles.filter((article) => article.url.includes("github.com/openai/codex"));
  assert.equal(duplicates.length, 1);
  assert.equal(duplicates[0].quality_score, 78);
  assert.notEqual(duplicates[0].section, "source_watch", "existing report-derived public article should remain the primary record");
});

test("Source Watch site records keep the newest changed snapshot for one canonical URL", () => {
  const older = sampleSourceWatchCandidatePool();
  older.candidates = [older.candidates.find((candidate) => candidate.id === "candidate-aify")];
  const newer = structuredClone(older);
  newer.report_date = "2026-07-04";
  newer.generated_at = "2026-07-04T08:00:00.000Z";
  newer.candidates[0].id = "candidate-aify-newer";
  newer.candidates[0].event_date = "2026-07-04";
  newer.candidates[0].source_watch.snapshot_fingerprint = `sha256:${"4".repeat(64)}`;
  newer.candidates[0].source_watch.site_snapshot.content_fingerprint = `sha256:${"5".repeat(64)}`;
  newer.candidates[0].source_watch.site_snapshot.description = "Aify 新增了 7 月 4 日的公开内容。";

  const articles = buildArticleIndex([], { sourceWatchCandidatePools: [older, newer] });

  assert.equal(articles.length, 1);
  assert.equal(articles[0].date, "2026-07-04");
  assert.match(articles[0].summary, /7 月 4 日/);
});

test("Source Watch repository records do not let a stale release hide a newer commit", () => {
  const older = sampleSourceWatchCandidatePool();
  const olderRepo = older.candidates.find((candidate) => candidate.id === "candidate-ml-news");
  older.candidates = [structuredClone(olderRepo)];
  older.candidates[0].event_date = "2026-07-05";
  older.candidates[0].source_watch.repo_snapshot.latest_commit.author_date = "2026-07-05T09:00:00Z";
  older.candidates[0].source_watch.repo_snapshot.latest_release.published_at = "2026-07-05T10:00:00Z";
  older.candidates[0].source_watch.event_url = older.candidates[0].source_watch.repo_snapshot.latest_release.html_url;

  const newer = structuredClone(older);
  newer.report_date = "2026-07-06";
  newer.generated_at = "2026-07-06T08:00:00.000Z";
  newer.candidates[0].id = "candidate-ml-news-new-commit";
  newer.candidates[0].event_date = "2026-07-06";
  newer.candidates[0].source_watch.snapshot_fingerprint = `sha256:${"6".repeat(64)}`;
  newer.candidates[0].source_watch.repo_snapshot.latest_commit = {
    sha: "cccccccccccccccccccccccccccccccccccccccc",
    html_url: "https://github.com/SalvatoreRa/ML-news-of-the-week/commit/cccccccccccc",
    message: "Publish the July 6 model roundup",
    author_date: "2026-07-06T07:30:00Z",
    author_name: "Maintainer"
  };
  newer.candidates[0].source_watch.event_url = newer.candidates[0].source_watch.repo_snapshot.latest_release.html_url;

  const articles = buildArticleIndex([], { sourceWatchCandidatePools: [older, newer] });
  const repoArticles = articles.filter((article) => article.source.includes("ML-news-of-the-week"));

  assert.equal(repoArticles.length, 2);
  const newest = repoArticles.find((article) => article.url.endsWith("/commit/cccccccccccc"));
  assert(newest);
  assert.equal(newest.date, "2026-07-06");
  assert.match(newest.summary, /Publish the July 6 model roundup/);
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

  const withoutReportBackref = { ...validArticle };
  delete withoutReportBackref.report_date;
  delete withoutReportBackref.report_url;
  delete withoutReportBackref.data_url;
  const missingBackref = validateArticles([withoutReportBackref]);
  assert.equal(missingBackref.valid, false, "report-derived articles still require a real report back-reference");

  const [sourceWatchArticle] = buildArticleIndex([], {
    sourceWatchCandidatePools: [sampleSourceWatchCandidatePool()]
  });
  assert.equal(Object.hasOwn(sourceWatchArticle, "report_url"), false);
  const sourceWatchResult = validateArticles([sourceWatchArticle]);
  assert.equal(sourceWatchResult.valid, true, JSON.stringify(sourceWatchResult.errors, null, 2));
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
