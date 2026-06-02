import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PublisherError } from "../src/errors.js";
import { parseDailyMarkdown } from "../src/parser.js";
import {
  collectBuilderFallbacks,
  collectContentSources,
  DEFAULT_CONTENT_SOURCES,
  DEFAULT_GITHUB_TRENDING_SOURCES,
  collectGitHubTrending,
  collectStatuspageIncidents,
  parseGitHubTrendingHtml
} from "../src/discovery.js";
import { collectSearchNews } from "../src/search-news.js";
import { checkSourcesHealth } from "../src/source-health.js";
import { auditSourceRunHistory } from "../src/source-phase5.js";
import { mergeSourceAuditIntoReport } from "../src/source-audit.js";
import { loadSourceRegistry, normalizeSourceRegistry } from "../src/source-registry.js";
import { renderReportHtml } from "../src/render.js";
import { reportToInteractionInput } from "../src/interaction-report.js";
import { CACHED_SOURCE_ICONS } from "../src/source-icon-cache.js";
import { mergeFeed, buildSite } from "../src/site.js";
import { validateFeed, validateReport } from "../src/schema.js";
import { validateTrends } from "../src/schema.js";
import { assemblePrompt } from "../src/prompt.js";
import { normalizeReportDraft, writeReportDraft } from "../src/report.js";
import { buildAutomationRevision } from "../src/automation-revision.js";
import { findPlainLanguageIssues } from "../src/plain-language.js";
import { findFreshnessIssues } from "../src/quality-gates.js";
import { buildTrendIndex, loadTrendConfig } from "../src/trends.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const trendConfigPath = path.join(rootDir, "config/trends.json");
const fixedGeneratedAt = "2026-05-13T02:35:00+08:00";
const siteUrl = "https://jasonxzwen.github.io/ai-daily-cn/";

test("HTML renders main item bold and highlight markers", async () => {
  const markdown = await readFixture("reports/good/official-release.md");
  const report = parseDailyMarkdown(markdown, { siteUrl, generatedAt: fixedGeneratedAt });
  report.main_items[0].bullets = ["**Cost attribution** enters ==regular tracking==."];
  const html = renderReportHtml(report);

  assert(html.includes("<strong>Cost attribution</strong>"));
  assert(html.includes("<mark>regular tracking</mark>"));
});

test("解析 good fixture 并生成完整 report.json", async () => {
  const markdown = await readFixture("reports/good/official-release.md");
  const report = parseDailyMarkdown(markdown, { siteUrl, generatedAt: fixedGeneratedAt });

  assert.equal(report.schema_version, 1);
  assert.equal(report.report_date, "2026-05-13");
  assert.equal(report.main_items.length, 2);
  assert.equal(report.projects.length, 1);
  assert.equal(report.builder_observations.length, 1);
  assert.equal(report.community_leads.length, 1);
  assert.equal(report.publish_status.repo_pushed, false);
  assert.equal(report.publish_status.publish_error, "");
  assert.equal(report.publish_status.pages_url, "https://jasonxzwen.github.io/ai-daily-cn/reports/2026/05/2026-05-13.html");

  const validation = validateReport(report);
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
});

test("缺少自检 JSON 时返回明确错误码", async () => {
  const markdown = await readFixture("reports/bad/missing-self-check.md");
  assertPublisherCode(() => parseDailyMarkdown(markdown, { siteUrl, generatedAt: fixedGeneratedAt }), "self_check_missing");
});

test("主体信息缺少来源链接时返回明确错误码", async () => {
  const markdown = await readFixture("reports/bad/missing-source.md");
  assertPublisherCode(() => parseDailyMarkdown(markdown, { siteUrl, generatedAt: fixedGeneratedAt }), "main_item_source_missing");
});

test("主体信息缺少 tier 时不会猜测字段", async () => {
  const markdown = await readFixture("reports/bad/missing-tier.md");
  assertPublisherCode(() => parseDailyMarkdown(markdown, { siteUrl, generatedAt: fixedGeneratedAt }), "main_items_missing");
});

test("forbidden fixture 命中禁用表达", async () => {
  const markdown = await readFixture("reports/forbidden/stock-phrase.md");
  assertPublisherCode(() => parseDailyMarkdown(markdown, { siteUrl, generatedAt: fixedGeneratedAt }), "forbidden_phrase");
});

test("schema 能校验日期、URL 和 required fields", async () => {
  const markdown = await readFixture("reports/good/official-release.md");
  const report = parseDailyMarkdown(markdown, { siteUrl, generatedAt: fixedGeneratedAt });
  const invalid = structuredClone(report);
  invalid.report_date = "2026-99-99";
  invalid.main_items[0].url = "not-a-url";
  delete invalid.title;

  const validation = validateReport(invalid);
  assert.equal(validation.valid, false);
  assert(validation.errors.length >= 3);
});

test("schema 支持模型发布、hero 精选、博客新契约和项目用途字段，并为旧日报默认空数组", async () => {
  const markdown = await readFixture("reports/good/official-release.md");
  const report = parseDailyMarkdown(markdown, { siteUrl, generatedAt: fixedGeneratedAt });

  assert.deepEqual(report.model_releases, []);
  assert.deepEqual(report.hot_blogs, []);

  const enriched = structuredClone(report);
  enriched.model_releases = [
    {
      name: "ExampleModel 2",
      provider: "Example AI",
      availability: "open_weights",
      release_scope: "provider_official_launch",
      event_date: "2026-05-13",
      url: "https://example.com/model/examplemodel-2",
      source: "Example AI Model Card",
      summary: "ExampleModel 2 发布开放权重。",
      notes: "fixture: 模型发布独立追踪。"
    }
  ];
  enriched.hot_blogs = [
    {
      title: "Harness Engineering for Long Running Agents",
      url: "https://example.com/blog/harness-engineering",
      publisher: "Example Engineering",
      author: "Example Author",
      event_date: "2026-05-13",
      topic: "agent harness",
      summary: "该博客说明长任务 agent harness 的工程设计。"
    }
  ];
  enriched.hero_highlights = [
    {
      title: "Harness 成为今日主线",
      url: "https://example.com/blog/harness-engineering",
      reason: "同一天的模型、项目和工程博客都指向 agent harness。"
    }
  ];
  enriched.projects = [
    {
      name: "Example Agent Memory",
      description: "面向 coding agents 的 persistent memory 项目。",
      url: "https://github.com/example/agent-memory",
      domains: ["coding_agent", "agent_memory"],
      use_case: "给 coding agent 提供跨会话持久记忆。",
      signal: "product_hunt",
      evidence: "Product Hunt 上榜后，项目 README 提供可运行示例。"
    }
  ];
  enriched.github_trending = [
    {
      candidate_id: "trend-example-agent-memory",
      repo: "example/agent-memory",
      name: "example/agent-memory",
      description: "面向 coding agents 的 persistent memory 项目。",
      url: "https://github.com/example/agent-memory",
      event_date: "2026-05-13",
      source: "GitHub Trending daily",
      language: "TypeScript",
      window: "daily",
      rank: 3,
      previous_rank: 7,
      rank_delta: 4,
      trend: "up",
      evidence: "GitHub Trending daily rank #3, yesterday #7."
    }
  ];
  enriched.quality_status = {
    status: "degraded",
    reasons: ["content_sources_blocked"],
    affected_sections: ["hot_blogs"],
    public_note: "Content source coverage is degraded."
  };
  enriched.evidence_assets = [
    {
      type: "figure",
      title: "Coding agent adoption by discipline",
      source_url: "https://www.anthropic.com/research/coding-agents-social-sciences",
      local_path: "assets/evidence/anthropic-coding-agents-social-sciences-figure-1.png",
      caption: "Figure 1 from the Anthropic research post.",
      extraction_status: "source_image"
    },
    {
      type: "table",
      title: "Claude Opus 4.8 benchmark comparison",
      source_url: "https://www.anthropic.com/news/claude-opus-4-8",
      caption: "Table transcribed from the official launch image.",
      extraction_status: "extracted_from_image",
      data: [
        ["Benchmark", "Opus 4.8", "Opus 4.7"],
        ["SWE-Bench Pro", "69.2%", "64.3%"]
      ]
    }
  ];

  const validation = validateReport(enriched);
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));

  const invalidEvidence = structuredClone(enriched);
  invalidEvidence.evidence_assets[0].type = "chart";
  const invalidEvidenceValidation = validateReport(invalidEvidence);
  assert.equal(invalidEvidenceValidation.valid, false);
  assert(invalidEvidenceValidation.errors.some((error) => error.path.includes("/evidence_assets/0/type")));

  const invalidEvidencePath = structuredClone(enriched);
  invalidEvidencePath.evidence_assets[0].local_path = "/absolute/not-allowed.png";
  const invalidEvidencePathValidation = validateReport(invalidEvidencePath);
  assert.equal(invalidEvidencePathValidation.valid, false);
  assert(invalidEvidencePathValidation.errors.some((error) => error.path.includes("/evidence_assets/0/local_path")));

  const invalid = structuredClone(enriched);
  invalid.model_releases[0].availability = "unknown";
  const invalidValidation = validateReport(invalid);
  assert.equal(invalidValidation.valid, false);
  assert(invalidValidation.errors.some((error) => error.path.includes("/model_releases/0/availability")));

  const invalidScope = structuredClone(enriched);
  invalidScope.model_releases[0].release_scope = "unknown";
  const invalidScopeValidation = validateReport(invalidScope);
  assert.equal(invalidScopeValidation.valid, false);
  assert(invalidScopeValidation.errors.some((error) => error.path.includes("/model_releases/0/release_scope")));
});

test("feed 按日期幂等更新并倒序排序", async () => {
  const markdown = await readFixture("reports/good/official-release.md");
  const report = parseDailyMarkdown(markdown, { siteUrl, generatedAt: fixedGeneratedAt });
  const existing = {
    schema_version: 1,
    site_title: "AI 日报",
    site_url: siteUrl,
    updated_at: "2026-05-12T02:35:00+08:00",
    reports: [
      {
        report_date: "2026-05-13",
        title: "旧标题",
        summary: "旧摘要",
        url: "reports/2026/05/2026-05-13.html",
        data_url: "data/2026/05/2026-05-13.json",
        markdown_url: "reports/2026/05/2026-05-13.md",
        main_items: 0,
        builder_observations: 0,
        generated_at: "2026-05-12T02:35:00+08:00"
      },
      {
        report_date: "2026-05-12",
        title: "前一日",
        summary: "前一日摘要",
        url: "reports/2026/05/2026-05-12.html",
        data_url: "data/2026/05/2026-05-12.json",
        markdown_url: "reports/2026/05/2026-05-12.md",
        main_items: 1,
        builder_observations: 0,
        generated_at: "2026-05-12T02:35:00+08:00"
      }
    ]
  };

  const feed = mergeFeed(existing, [report], { siteUrl, updatedAt: fixedGeneratedAt });
  assert.equal(feed.reports.length, 2);
  assert.equal(feed.reports[0].report_date, "2026-05-13");
  assert.equal(feed.reports[0].title, report.title);
  assert.equal(feed.reports[0].main_items, 2);
  assert.equal(validateFeed(feed).valid, true);
});

test("无新日报时 feed 更新时间保持稳定", () => {
  const existing = {
    schema_version: 1,
    site_title: "AI 日报",
    site_url: siteUrl,
    updated_at: "2026-05-12T02:35:00+08:00",
    reports: []
  };

  const feed = mergeFeed(existing, [], { siteUrl, updatedAt: fixedGeneratedAt });
  assert.equal(feed.updated_at, "2026-05-12T02:35:00+08:00");
  assert.equal(validateFeed(feed).valid, true);
});

test("相同日报重建时 feed 更新时间保持稳定", async () => {
  const markdown = await readFixture("reports/good/official-release.md");
  const report = parseDailyMarkdown(markdown, { siteUrl, generatedAt: fixedGeneratedAt });
  const existing = mergeFeed(
    {
      schema_version: 1,
      site_title: "AI 日报",
      site_url: siteUrl,
      updated_at: "2026-05-13T02:35:00+08:00",
      reports: []
    },
    [report],
    { siteUrl, updatedAt: "2026-05-13T02:35:00+08:00" }
  );

  const feed = mergeFeed(existing, [report], { siteUrl, updatedAt: "2026-05-13T03:00:00+08:00" });
  assert.equal(feed.updated_at, "2026-05-13T02:35:00+08:00");
  assert.equal(validateFeed(feed).valid, true);
});

test("HTML 渲染会转义日报正文并保留外链 rel", async () => {
  const markdown = await readFixture("reports/good/html-escaping.md");
  const report = parseDailyMarkdown(markdown, { siteUrl, generatedAt: fixedGeneratedAt });
  const html = renderReportHtml(report);

  assert(!html.includes("<script>alert"));
  assert(html.includes("&lt;script&gt;alert"));
  assert(html.includes('rel="noopener noreferrer"'));
});

test("HTML 渲染会展示自检中的提示词和规则迭代建议", async () => {
  const markdown = await readFixture("reports/good/official-release.md");
  const report = parseDailyMarkdown(markdown, { siteUrl, generatedAt: fixedGeneratedAt });
  report.self_check.optimization_suggestions = [
    {
      issue: "48 小时窗口仍不足时缺少扩窗规则",
      evidence: "主体信息不足 5 条。",
      module: "date-scope",
      suggestion: "允许扩展到 72 小时并记录原因。",
      expected_benefit: "避免低质量硬凑。",
      requires_user_confirmation: true
    }
  ];
  const html = renderReportHtml(report);

  assert(html.includes("提示词与规则迭代建议"));
  assert(html.includes("48 小时窗口仍不足时缺少扩窗规则"));
  assert(html.includes("模块：date-scope"));
  assert(html.includes("需要确认"));
});

test("HTML 渲染会展示模型发布和热门技术博客", async () => {
  const report = JSON.parse(await readFixture("reports/good/structured-report.json"));
  const validation = validateReport(report);
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));

  const html = renderReportHtml(validation.value);

  assert(html.includes('id="model-releases"'));
  assert(html.includes("模型发布"));
  assert(html.includes("ExampleModel 2"));
  assert(html.includes("open_weights"));
  assert(html.includes('id="hot-blogs"'));
  assert(html.includes("热门技术博客"));
  assert(html.includes("Harness Engineering for Long Running Agents"));
  assert(html.includes('target="_blank" rel="noopener noreferrer"'));
});

test("HTML 渲染会展示 GitHub Trending 与 Builder 信源审计", async () => {
  const report = JSON.parse(await readFixture("reports/good/structured-report.json"));
  report.source_audit = sourceAuditFixture();
  report.source_audit.builder_sources.blocked_reason = "fetch_failed";
  report.source_audit.builder_sources.last_successful_feed_at = "2026-05-14T02:35:00+08:00";
  report.github_trending = [
    {
      name: "example/trending-agent",
      repo: "example/trending-agent",
      description: "用于验证 GitHub trending 项目展示。",
      url: "https://github.com/example/trending-agent",
      event_date: "2026-05-15",
      source: "GitHub Trending daily",
      language: "TypeScript",
      window: "daily",
      rank: 2,
      previous_rank: 9,
      rank_delta: 7,
      trend: "up",
      evidence: "GitHub Trending daily rank #2, yesterday #9."
    }
  ];
  report.projects = [
    {
      name: "Example Trending Agent",
      description: "用于验证 GitHub trending 项目展示，在 GitHub Trending daily 中出现。",
      url: "https://github.com/example/trending-agent",
      event_date: "2026-05-15",
      source: "GitHub Trending",
      signal: "trending",
      evidence: "GitHub Trending daily 显示 123 stars today，并有可运行 README。"
    }
  ];
  report.builder_observations = [
    {
      author: "Example Builder",
      role: "maintainer",
      content: "发布了 agent harness 的实现经验。",
      url: "https://example.com/builder-post",
      event_date: "2026-05-15",
      source: "follow-builders",
      evidence: "原始帖子链接可访问。"
    }
  ];
  report.self_check.builder_observations = 1;

  const validation = validateReport(report);
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));

  const html = renderReportHtml(validation.value);
  assert(html.includes('id="github-trending"'));
  assert(html.includes("GitHub Trending"));
  assert(html.includes("#2"));
  assert(html.includes("↑ UP +7"));
  assert(html.includes("example/trending-agent"));
  assert(html.includes('id="source-audit"'));
  assert(html.includes("信源审计"));
  assert(html.includes("GitHub Trending"));
  assert(html.includes("Builder 原始源"));
  assert(html.includes("搜索 / 新闻影子源"));
  assert(html.includes("信源健康检查"));
  assert(html.includes("阻塞：fetch_failed"));
  assert(html.includes("上次成功：2026-05-14T02:35:00+08:00"));
  assert(html.includes("今日 +123 stars"));
  assert(!html.includes("信号：trending"));
  assert(!html.includes("GitHub Trending daily 显示 123 stars today"));
  assert(!html.includes("在 GitHub Trending daily 中出现"));
  assert(html.includes("原始帖子链接可访问"));
});

test("日报可以转换为 effective-interact 输入", async () => {
  const report = JSON.parse(await readFixture("reports/good/structured-report.json"));
  report.source_audit = sourceAuditFixture();
  report.summary = "Google 把模型和 agent 工具放进同一条链路；Vercel AI Gateway 接入更多模型；GitHub Copilot 加强任务路由；GitHub Trending 显示 agent memory 升温。";
  report.main_items[0].title = "OpenAI Status：Example Agent Platform GA";
  report.main_items[0].source = "OpenAI Status";
  report.main_items[0].url = "https://status.openai.com/incidents/example-agent-platform";
  report.main_items.push({
    title: "Cisco and OpenAI redefine enterprise engineering with Codex",
    event_date: "2026-05-15",
    url: "https://openai.com/index/cisco",
    source: "OpenAI News RSS",
    tier: "T0",
    entities: ["OpenAI", "Cisco", "Codex"],
    summary: "OpenAI News RSS item for source icon coverage.",
    bullets: ["OpenAI News RSS uses the same embedded OpenAI icon as other OpenAI-owned sources."]
  });
  report.hero_highlights = [
    {
      title: "Agent harness 成为今日主线",
      url: "https://example.com/blog/harness-engineering",
      reason: "模型入口、项目趋势和工程博客都指向 harness 设计。"
    }
  ];
  report.model_releases[0].notes = "同时出现在多个平台；本轮只按官方来源记录可用性。";
  report.hot_blogs[0].summary = "这篇文章把长运行 agent 的 harness 拆成任务规划、上下文治理、工具执行、结果校验和恢复路径几层，重点不是再发明一个模型包装器，而是把每一步都变成可观测、可重放、可回滚的工程边界。作者用 coding agent 和研究代理的例子说明，真正影响稳定性的往往是文件系统隔离、权限提示、失败重试、上下文压缩和评估回放，而不是单次补全质量。对研发团队来说，它适合作为设计 agent 平台、评估 Claude Code/Codex 类工具、或制定内部自动化安全门时的术语和架构参考。";
  report.hot_blogs[0].publisher = "Hugging Face";
  report.hot_blogs[0].topic = "agent harness、long-running agents";
  report.hot_blogs[0].why_it_matters = "旧字段保留兼容，但公开页面不再渲染。";
  report.evidence_assets = [
    ...(report.evidence_assets || []),
    {
      type: "figure",
      title: "Example model benchmark",
      source_url: report.model_releases[0].url,
      local_path: "assets/evidence/example-model-benchmark.png",
      caption: "Official model benchmark.",
      extraction_status: "source_image"
    },
    {
      type: "figure",
      title: "Example model workflow",
      source_url: report.model_releases[0].url,
      local_path: "assets/evidence/example-model-workflow.png",
      caption: "Official model workflow.",
      extraction_status: "source_image"
    },
    {
      type: "figure",
      title: "Harness architecture",
      source_url: report.hot_blogs[0].url,
      local_path: "assets/evidence/harness-architecture.png",
      caption: "Original blog architecture diagram.",
      extraction_status: "source_image"
    }
  ];
  report.projects = [
    {
      name: "Example Agent Memory",
      description: "面向 coding agents 的 persistent memory 项目，在 GitHub Trending weekly 中出现。",
      url: "https://github.com/example/agent-memory",
      domains: ["coding_agent", "agent_memory"],
      use_case: "给 coding agent 提供跨会话持久记忆，让自动化任务能复用用户偏好、项目约束和历史决策。",
      event_date: "2026-05-15",
      source: "GitHub Trending weekly",
      signal: "star_velocity",
      evidence: "GitHub Trending weekly 显示 456 stars this week。"
    }
  ];
  report.github_trending = [
    {
      candidate_id: "trend-example-agent-memory",
      name: "example/agent-memory",
      repo: "example/agent-memory",
      description: "面向 coding agents 的 persistent memory 项目。",
      url: "https://github.com/example/agent-memory",
      event_date: "2026-05-15",
      source: "GitHub Trending weekly",
      language: "TypeScript",
      window: "weekly",
      rank: 1,
      previous_rank: null,
      rank_delta: null,
      trend: "new",
      evidence: "GitHub Trending weekly rank #1; not present yesterday."
    }
  ];
  const input = reportToInteractionInput(report);

  assert.equal(input.template, "research-explainer");
  assert.equal(input.renderMode, "pre-rendered");
  assert.equal(input.heroMode, "daily-report");
  assert.equal(input.heroTitle, "2026-05-15");
  assert.equal(input.hideNavigation, true);
  assert.equal(input.heroEyebrow, "AI 日报");
  assert(input.summary.includes("Google 把模型和 agent 工具放进同一条链路"));
  assert.deepEqual(
    input.heroStats.map((item) => [item.label, item.value, item.detail]),
    [
      ["主体", "2", "重点条目"],
      ["模型", "1", "发布"],
      ["技术博客", "1", "深读"],
      ["开源", "2", "Top10 + 项目"],
      ["Builder", "0", "观察"],
      ["信源窗", "05-15", "标准"]
    ]
  );
  assert(input.heroLinks.some((item) => item.label === "结构化 JSON" && item.href.endsWith("/data/2026/05/2026-05-15.json")));
  assert(input.heroLinks.every((item) => item.icon));
  assert(!input.summary.includes("Agent harness 成为今日主线"));
  assert(!input.summary.includes("其余条目见后文"));
  assert(!input.sections.some((section) => section.title === "日报概览"));
  assert(!input.sections.some((section) => section.title === "主线摘要"));
  const mainSection = input.sections.find((section) => section.title === "主体信息");
  assert(mainSection.content.includes("![OpenAI Status](data:image/png;base64,"));
  assert(mainSection.content.includes("![OpenAI News RSS](data:image/png;base64,"));
  assert(mainSection.content.includes("![OpenAI Status](data:image/png;base64,") && mainSection.content.includes("**![OpenAI Status]"));
  assert(!mainSection.content.includes("来源："));
  const hotBlogsSection = input.sections.find((section) => section.title === "热门技术博客");
  assert.equal(hotBlogsSection.type, "filterable-cards");
  assert.equal(hotBlogsSection.cardClass, "blog-card");
  assert.equal(hotBlogsSection.items.length, 1);
  assert.equal(hotBlogsSection.items[0].title, "Harness Engineering for Long Running Agents");
  assert.equal(hotBlogsSection.items[0].href, "https://example.com/blog/harness-engineering");
  assert.match(hotBlogsSection.items[0].titleIcon, /^data:image\/svg\+xml;base64,/);
  assert(hotBlogsSection.items[0].body.includes("这篇文章把长运行 agent 的 harness"));
  assert.equal(hotBlogsSection.items[0].showGroup, false);
  assert.deepEqual(hotBlogsSection.items[0].tags, ["agent harness", "long-running agents"]);
  assert.deepEqual(hotBlogsSection.items[0].points, []);
  assert.equal(hotBlogsSection.items[0].media.length, 1);
  assert(hotBlogsSection.items[0].media[0].src.endsWith("assets/evidence/harness-architecture.png"));
  assert(!JSON.stringify(hotBlogsSection.items[0].points).includes("发布方"));
  assert(!JSON.stringify(hotBlogsSection.items[0].points).includes("作者"));
  assert(!JSON.stringify(hotBlogsSection.items[0].points).includes("日期"));
  assert(!hotBlogsSection.items[0].body.includes("为什么重要"));
  const modelSection = input.sections.find((section) => section.title === "模型发布");
  assert(modelSection.content.includes("![Example AI Model Card](data:image/svg+xml;base64,"));
  assert(modelSection.content.includes("==多平台可见=="));
  assert(modelSection.content.includes("==官方可用性=="));
  assert(modelSection.content.includes("example-model-benchmark.png) ![Example model workflow]"));
  assert(!modelSection.content.includes("备注："));
  const projectsSection = input.sections.find((section) => section.title === "今日值得关注的项目");
  assert(projectsSection.content.includes("![Example Agent Memory](data:image/png;base64,"));
  assert.match(projectsSection.items[0].titleIcon, /^data:image\/png;base64,/);
  assert(projectsSection.content.includes("==本周 +456 stars=="));
  assert(projectsSection.content.includes("领域：coding_agent、agent_memory"));
  assert(projectsSection.content.includes("作用：给 coding agent 提供跨会话持久记忆"));
  assert(!projectsSection.content.includes("信号："));
  assert(!projectsSection.content.includes("证据："));
  assert(!projectsSection.content.includes("GitHub Trending weekly 中出现"));
  const trendingSection = input.sections.find((section) => section.title === "GitHub Trending · Top 10 daily");
  assert.equal(trendingSection.summary, undefined);
  assert(trendingSection.content.includes("example/agent-memory"));
  assert(trendingSection.content.includes("![example/agent-memory](data:image/png;base64,"));
  assert(trendingSection.content.includes("1. **![example/agent-memory]"));
  assert(trendingSection.content.includes("==trend-new|NEW=="));
  assert(!trendingSection.content.includes("\n  - "));
  assert(trendingSection.content.includes(" | "));
  assert(!trendingSection.content.includes("新上榜"));
  assert.equal(input.intent.audience, "3-10 年经验的研发工程师与技术管理者");
  assert(input.sections.some((section) => section.title === "主体信息"));
  const sourceAuditSection = input.sections.find((section) => section.title === "信源审计");
  assert(sourceAuditSection);
  assert(sourceAuditSection.content.includes("![GitHub Trending](data:image/png;base64,"));
  assert.equal(sourceAuditSection.appendix, true);
  assert.equal(sourceAuditSection.collapsed, true);
  const selfCheckSection = input.sections.find((section) => section.title === "自检与产物");
  assert(selfCheckSection);
  assert.equal(selfCheckSection.appendix, true);
  assert.equal(selfCheckSection.collapsed, true);
  assert(typeof selfCheckSection.content === "string" && selfCheckSection.content.includes("结构化 JSON"));
  assert.deepEqual(input.nextActions, []);
  assert.equal(input.nextActionsCollapsed, undefined);
  assert.equal(input.evidence, undefined);
});

test("project interaction section uses one card per project", async () => {
  const report = JSON.parse(await readFixture("reports/good/structured-report.json"));
  report.projects = [
    {
      name: "Project Alpha",
      description: "A reusable plugin set for agent workflows.",
      url: "https://github.com/example/project-alpha",
      domains: ["agent", "workflow"],
      use_case: "Use for packaging repeatable research and writing workflows.",
      event_date: "2026-05-15",
      source: "GitHub",
      signal: "star_velocity",
      evidence: "GitHub Trending weekly appeared in discovery."
    },
    {
      name: "Project Beta",
      description: "A dashboard toolkit for eval review.",
      url: "https://github.com/example/project-beta",
      domains: ["eval"],
      use_case: "Use for eval dashboards and review handoff.",
      event_date: "2026-05-15",
      source: "GitHub",
      signal: "release",
      evidence: "GitHub release page."
    }
  ];

  const input = reportToInteractionInput(report);
  const section = input.sections.find((item) => item.group === "projects");

  assert.equal(section.type, "filterable-cards");
  assert.equal(section.items.length, 2);
  assert.equal(section.items[0].title, "Project Alpha");
  assert.equal(section.items[0].href, "https://github.com/example/project-alpha");
  assert(section.items[0].body.includes("agent workflows"));
  assert(section.items[0].points.some((point) => point.value.includes("agent")));
  assert(section.items[1].points.some((point) => point.value.includes("eval dashboards")));
});

test("builder interaction section omits explicit evidence bullets", async () => {
  const report = JSON.parse(await readFixture("reports/good/structured-report.json"));
  report.builder_observations = [
    {
      author: "Example Builder",
      role: "maintainer",
      content: "Shared a concrete coding-agent workflow observation.",
      url: "https://example.com/builder-post",
      event_date: "2026-05-15",
      source: "follow-builders X feed",
      evidence: "Original X URL was collected from follow-builders central feed on 2026-05-15."
    }
  ];
  report.self_check.builder_observations = 1;

  const input = reportToInteractionInput(report);
  const section = input.sections.find((item) => item.group === "signals");

  assert.equal(section.title, "X/Twitter 讨论");
  assert(section.content.includes("Example Builder"));
  assert(section.content.includes("follow-builders X feed"));
  assert(!section.content.includes("### X/Twitter 讨论"));
  assert(!section.content.includes("Original X URL was collected"));
  assert(!section.content.includes("证据："));
});

test("community leads omit low-signal statuspage troubleshooting items", async () => {
  const report = JSON.parse(await readFixture("reports/good/structured-report.json"));
  report.builder_observations = [
    {
      author: "Example Builder",
      role: "maintainer",
      content: "Shared a concrete coding-agent workflow observation.",
      url: "https://example.com/builder-post",
      event_date: "2026-05-15",
      source: "follow-builders X feed"
    }
  ];
  report.community_leads = [
    {
      content: "Claude Status recorded Claude Code in Slack elevated errors and marked it resolved; troubleshooting note only.",
      url: "https://status.claude.com/"
    }
  ];
  report.self_check.builder_observations = 1;

  const input = reportToInteractionInput(report);
  const section = input.sections.find((item) => item.group === "signals");

  assert.equal(section.title, "X/Twitter 讨论");
  assert(section.content.includes("Example Builder"));
  assert(!section.content.includes("Claude Status"));
  assert(!section.content.includes("elevated errors"));
  assert(!section.content.includes("社区线索"));
});

test("X/Twitter discussion section reports checked-source degradation when no status is included", async () => {
  const report = JSON.parse(await readFixture("reports/good/structured-report.json"));
  report.source_audit = sourceAuditFixture();
  report.source_audit.builder_sources = {
    checked: true,
    sources: [
      {
        name: "follow-builders X feed",
        url: "https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-x.json",
        status: "blocked",
        notes: "HTTP 403"
      }
    ],
    candidates_found: 0,
    included: 0,
    blocked_reason: "HTTP 403",
    notes: "X feed blocked during fixture run."
  };
  report.builder_observations = [];
  report.community_leads = [];
  report.self_check.builder_observations = 0;

  const input = reportToInteractionInput(report);
  const section = input.sections.find((item) => item.group === "signals");

  assert.equal(section.title, "X/Twitter 讨论");
  assert(section.content.includes("降级说明"));
  assert(section.content.includes("follow-builders X feed:blocked"));
  assert(section.content.includes("HTTP 403"));
});

test("effective-interact 输入不会渲染空的可选板块", async () => {
  const report = JSON.parse(await readFixture("reports/good/structured-report.json"));
  report.model_releases = [];
  report.hot_blogs = [];
  report.projects = [];
  report.github_trending = [];
  report.builder_observations = [];
  report.community_leads = [];
  report.self_check.builder_observations = 0;

  const input = reportToInteractionInput(report);
  const titles = input.sections.map((section) => section.title);

  assert(!titles.includes("模型发布"));
  assert(!titles.includes("热门技术博客"));
  assert(!titles.includes("GitHub Trending 趋势"));
  assert(!titles.includes("今日值得关注的项目"));
  assert(!titles.includes("X/Twitter 讨论与社区线索"));
  assert(!JSON.stringify(input).includes("暂无 X/Twitter 讨论"));
  assert(!JSON.stringify(input).includes("暂无社区线索"));
  assert(!JSON.stringify(input).includes("暂无热门技术博客"));
});

test("HTML renders GitHub Trending without noisy audit labels", async () => {
  const report = JSON.parse(await readFixture("reports/good/structured-report.json"));
  report.source_audit = sourceAuditFixture();
  report.projects = [];
  report.builder_observations = [];
  report.github_trending = [
    {
      name: "hardikpandya/stop-slop",
      repo: "hardikpandya/stop-slop",
      description: "A skill file for removing AI tells from prose",
      url: "https://github.com/hardikpandya/stop-slop",
      event_date: "2026-05-15",
      source: "GitHub Trending daily",
      language: "all",
      window: "daily",
      rank: 3,
      previous_rank: null,
      rank_delta: null,
      trend: "new",
      evidence: "GitHub Trending daily rank #3."
    }
  ];

  const validation = validateReport(report);
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));

  const html = renderReportHtml(validation.value);
  const section = html.slice(html.indexOf('id="github-trending"'), html.indexOf('id="source-audit"'));
  assert(section.includes("GitHub Trending"));
  assert(!section.includes("GitHub Trending \u8d8b\u52bf"));
  assert(section.includes("\u53bb\u9664"));
  assert(!section.includes("A skill file for removing AI tells from prose"));
  assert(!section.includes("\u6765\u6e90\uff1a"));
  assert(!section.includes("\u8bed\u8a00\uff1a"));

  const input = reportToInteractionInput(validation.value);
  const trendingSection = input.sections.find((item) => item.title === "GitHub Trending · Top 10 daily");
  assert(trendingSection);
  assert(trendingSection.content.includes("3. **![hardikpandya/stop-slop]"));
  assert(trendingSection.content.includes("==trend-new|NEW=="));
  assert(!trendingSection.content.includes("\u6765\u6e90\uff1a"));
  assert(!trendingSection.content.includes("\u8bed\u8a00\uff1a"));
});

test("HTML and interaction input attach evidence assets to matching report items", async () => {
  const report = JSON.parse(await readFixture("reports/good/structured-report.json"));
  report.source_audit = sourceAuditFixture();
  report.quality_status = {
    status: "degraded",
    reasons: ["content_sources_blocked", "builder_sources_low_coverage"],
    affected_sections: ["hot_blogs", "builder_observations"],
    public_note: "Some automated discovery sources failed; blog and Builder coverage is incomplete."
  };
  report.evidence_assets = [
    {
      type: "figure",
      title: "Coding agent adoption by discipline",
      source_url: report.main_items[0].url,
      local_path: "assets/evidence/anthropic-coding-agents-social-sciences-figure-1.png",
      caption: "Official figure from Anthropic.",
      extraction_status: "source_image"
    },
    {
      type: "table",
      title: "Claude Opus 4.8 performance comparison",
      source_url: report.model_releases[0].url,
      caption: "Transcribed from the official launch image.",
      extraction_status: "extracted_from_image",
      data: [
        ["Task", "Opus 4.8", "Opus 4.7"],
        ["Agentic coding", "69.2%", "64.3%"]
      ]
    },
    {
      type: "figure",
      title: "Duplicate coding agent adoption figure",
      source_url: report.main_items[0].url,
      local_path: "assets/evidence/anthropic-coding-agents-social-sciences-figure-1.png",
      caption: "Duplicate figure should not render twice.",
      extraction_status: "source_image"
    }
  ];

  const validation = validateReport(report);
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));

  const html = renderReportHtml(validation.value);
  assert(!html.includes('id="quality-status"'));
  assert(!html.includes("质量状态"));
  assert(!html.includes("Some automated discovery sources failed"));
  assert(!html.includes('id="evidence-assets"'));
  const mainHtml = html.slice(html.indexOf('id="main-items"'), html.indexOf('id="model-releases"'));
  const modelHtml = html.slice(html.indexOf('id="model-releases"'), html.indexOf('id="hot-blogs"'));
  assert(mainHtml.includes("Coding agent adoption by discipline"));
  assert(mainHtml.includes("anthropic-coding-agents-social-sciences-figure-1.png"));
  assert.equal((mainHtml.match(/anthropic-coding-agents-social-sciences-figure-1\.png/g) || []).length, 1);
  assert(!mainHtml.includes("Claude Opus 4.8 performance comparison"));
  assert(modelHtml.includes("Claude Opus 4.8 performance comparison"));
  assert(modelHtml.includes("Agentic coding"));

  const input = reportToInteractionInput(validation.value);
  const qualitySection = input.sections.find((section) => section.title === "质量状态");
  assert.equal(qualitySection, undefined);
  assert(!input.sections.some((section) => section.title === "证据图表"));
  const mainSection = input.sections.find((section) => section.title === "主体信息");
  const modelSection = input.sections.find((section) => section.title === "模型发布");
  assert(mainSection.content.includes("Coding agent adoption by discipline"));
  assert(mainSection.content.includes("anthropic-coding-agents-social-sciences-figure-1.png"));
  assert.equal((mainSection.content.match(/anthropic-coding-agents-social-sciences-figure-1\.png/g) || []).length, 1);
  assert(!mainSection.content.includes("Claude Opus 4.8 performance comparison"));
  assert(modelSection.content.includes("Claude Opus 4.8 performance comparison"));
  assert(modelSection.content.includes("Agentic coding"));
  assert(modelSection.content.indexOf("Agentic coding") < modelSection.content.indexOf("Transcribed from the official launch image."));
});

test("interaction source icon cache covers high-frequency AI daily sources and source audit feeds", async () => {
  const report = JSON.parse(await readFixture("reports/good/structured-report.json"));
  report.main_items = [
    {
      title: "Microsoft Foundry update",
      event_date: "2026-05-15",
      url: "https://devblogs.microsoft.com/foundry/example",
      source: "Microsoft Foundry Blog",
      tier: "T1",
      entities: ["Microsoft"],
      summary: "fixture",
      bullets: ["**Foundry** fixture."]
    },
    {
      title: "NVIDIA Developer update",
      event_date: "2026-05-15",
      url: "https://developer.nvidia.com/blog/example",
      source: "NVIDIA Developer Blog",
      tier: "T1",
      entities: ["NVIDIA"],
      summary: "fixture",
      bullets: ["**NVIDIA** fixture."]
    },
    {
      title: "MiniMax model update",
      event_date: "2026-05-15",
      url: "https://www.minimax.io/models/text/m3",
      source: "MiniMax model page",
      tier: "T1",
      entities: ["MiniMax"],
      summary: "fixture",
      bullets: ["**MiniMax** fixture."]
    },
    {
      title: "Alibaba Cloud update",
      event_date: "2026-05-15",
      url: "https://www.alibabacloud.com/blog/example",
      source: "Alibaba Cloud Blog",
      tier: "T2",
      entities: ["Alibaba Cloud"],
      summary: "fixture",
      bullets: ["**Alibaba Cloud** fixture."]
    },
    {
      title: "Nature update",
      event_date: "2026-05-15",
      url: "https://www.nature.com/articles/example",
      source: "Nature Communications",
      tier: "T2",
      entities: ["Nature"],
      summary: "fixture",
      bullets: ["**Nature** fixture."]
    }
  ];
  report.source_audit = {
    content_sources: {
      checked: true,
      candidates_found: 6,
      included: 0,
      notes: "fixture",
      sources: [
        { name: "Andrej Karpathy Blog", url: "https://karpathy.github.io/feed.xml", status: "no_signal" },
        { name: "Tencent Hunyuan Blog", url: "https://llm.hunyuan.tencent.com/#/Blog", status: "no_signal" },
        { name: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/index", status: "checked" },
        { name: "HNRSS Frontpage", url: "https://hnrss.org/frontpage", status: "checked" },
        { name: "36Kr", url: "https://www.36kr.com/feed", status: "checked" },
        { name: "QbitAI", url: "https://www.qbitai.com/feed", status: "checked" }
      ]
    }
  };

  const input = reportToInteractionInput(report);
  const auditSection = input.sections.find((section) => section.group === "verification" && section.content.includes("HNRSS Frontpage"));
  assert(auditSection, "source audit section should be present");
  const mainSection = input.sections.find((section) => section.title === "主体信息");

  for (const source of [
    "Microsoft Foundry Blog",
    "NVIDIA Developer Blog",
    "MiniMax model page",
    "Alibaba Cloud Blog",
    "Nature Communications",
    "Andrej Karpathy Blog",
    "Tencent Hunyuan Blog",
    "Ars Technica",
    "HNRSS Frontpage",
    "36Kr",
    "QbitAI"
  ]) {
    assert.match(CACHED_SOURCE_ICONS[source], /^data:image\/(?:png|jpe?g|webp|gif);base64,/, source);
    const section = mainSection.content.includes(source) ? mainSection : auditSection;
    assert(section.content.includes(`![${source}](${CACHED_SOURCE_ICONS[source]})`), source);
    assert(!section.content.includes(`![${source}](data:image/svg+xml;base64,`), source);
  }
});

test("trend index uses controlled topics, conservative thresholds, and scoped annotations", async () => {
  const config = await loadTrendConfig({ rootDir });
  const reports = [
    trendReport("2026-05-25", {
      main: "OpenAI Codex pushed coding agent workflows toward eval harnesses.",
      github: "example/coding-agent-memory brings memory to coding agents.",
      project: "MCP tools for coding agent workflows.",
      builder: "Builder note about coding agent harness practice."
    }),
    trendReport("2026-05-26", {
      main: "GitHub Copilot added coding agent workflow controls.",
      github: "example/eval-harness improves coding agent evaluation."
    }),
    trendReport("2026-05-27", {
      main: "Anthropic described Claude Code as a coding agent surface.",
      builder: "Builder thread on coding agent memory and eval loops."
    }),
    trendReport("2026-05-29", {
      main: "OpenAI Codex and Claude Code made coding agent deployment more explicit.",
      github: "example/codex-agent is a coding agent harness project.",
      project: "A project-only coding agent mention should count but not be annotated.",
      hotBlog: "A blog about coding agent eval harnesses."
    })
  ];

  const trends = buildTrendIndex(reports, {
    config,
    reportDate: "2026-05-29",
    generatedAt: fixedGeneratedAt
  });
  const validation = validateTrends(trends);
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));

  const topic = trends.topics.find((item) => item.id === "coding-agent");
  assert.equal(topic.status, "hot");
  assert(topic.sections.includes("projects"));
  assert(topic.sections.includes("builder_observations"));
  assert(topic.sections.includes("hot_blogs"));
  assert(topic.entities.includes("OpenAI"));
  assert(topic.entities.includes("Claude Code"));

  const annotations = trends.annotations_by_date["2026-05-29"];
  assert.equal(annotations.main_items.length, 1);
  assert.equal(annotations.main_items[0].index, 0);
  assert.equal(annotations.main_items[0].tags[0].topic_id, "coding-agent");
  assert.equal(annotations.github_trending.length, 1);
  assert.equal(annotations.github_trending[0].index, 0);
  assert.equal(annotations.projects, undefined);
  assert.equal(annotations.builder_observations, undefined);
  assert(trends.candidate_topics.every((item) => item.display === false));
});

test("loadTrendConfig fails fast when the controlled vocabulary is missing or invalid", async () => {
  const missingRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-missing-trends-"));
  await assert.rejects(
    () => loadTrendConfig({ rootDir: missingRoot }),
    (error) => error instanceof PublisherError && error.code === "trend_config_missing"
  );

  const invalidRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-invalid-trends-"));
  await fs.mkdir(path.join(invalidRoot, "config"), { recursive: true });
  await fs.writeFile(path.join(invalidRoot, "config/trends.json"), "{}\n", "utf8");
  await assert.rejects(
    () => loadTrendConfig({ rootDir: invalidRoot }),
    (error) => error instanceof PublisherError && error.code === "trend_config_invalid"
  );
});

test("trend annotations are rendered only where they are injected", async () => {
  const report = JSON.parse(await readFixture("reports/good/structured-report.json"));
  report.github_trending = [
    {
      candidate_id: "trend-example-coding-agent",
      name: "example/coding-agent",
      repo: "example/coding-agent",
      description: "Coding agent harness.",
      url: "https://github.com/example/coding-agent",
      event_date: report.report_date,
      source: "GitHub Trending daily",
      language: "TypeScript",
      window: "daily",
      rank: 1,
      previous_rank: null,
      rank_delta: null,
      trend: "new",
      evidence: "GitHub Trending daily rank #1."
    }
  ];
  report.projects = [
    {
      name: "Project that should not get a trend tag",
      description: "coding agent project mention",
      url: "https://github.com/example/project",
      event_date: report.report_date,
      source: "GitHub",
      signal: "trending",
      evidence: "fixture"
    }
  ];
  const trendAnnotations = {
    main_items: [
      {
        index: 0,
        tags: [
          {
            topic_id: "coding-agent",
            label: "coding agent",
            status: "hot",
            text: "coding agent: 7d 8x/4d"
          }
        ]
      }
    ],
    github_trending: [
      {
        index: 0,
        tags: [
          {
            topic_id: "coding-agent",
            label: "coding agent",
            status: "hot",
            text: "coding agent: 7d 8x/4d"
          }
        ]
      }
    ]
  };

  const input = reportToInteractionInput(report, { trendAnnotations });
  const mainSection = input.sections.find((section) => section.title === "主体信息");
  const trendingSection = input.sections.find((section) => section.title.includes("GitHub Trending"));
  const projectsSection = input.sections.find((section) => section.cardClass === "project-card");

  assert(mainSection.content.includes("==coding agent: 7d 8x/4d=="));
  assert(trendingSection.content.includes("==coding agent: 7d 8x/4d=="));
  assert(!projectsSection.content.includes("==coding agent: 7d 8x/4d=="));
});

test("GitHub trending 发现器解析仓库候选并生成审计", async () => {
  const source = {
    name: "GitHub Trending TypeScript daily",
    url: "https://github.com/trending/typescript?since=daily",
    language: "typescript",
    window: "daily"
  };
  const html = githubTrendingFixture();
  const candidates = parseGitHubTrendingHtml(html, source);

  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].repo, "example/trending-agent");
  assert.equal(candidates[0].signal, "trending");
  assert.equal(candidates[0].language, "typescript");
  assert.equal(candidates[0].rank, 1);
  assert.equal(candidates[0].description, "Agent workbench with a runnable demo.");

  const collected = await collectGitHubTrending({
    sources: [source],
    reportDate: "2026-05-16",
    previousTrending: [
      {
        repo: "example/trending-agent",
        rank: 4
      }
    ],
    fetchImpl: async () => ({
      ok: true,
      text: async () => html
    })
  });

  assert.equal(collected.source_audit.github_trending.checked, true);
  assert.equal(collected.source_audit.github_trending.sources[0].status, "checked");
  assert.equal(collected.source_audit.github_trending.candidates_found, 2);
  assert.equal(collected.candidates[0].trend, "up");
  assert.equal(collected.candidates[0].previous_rank, 4);
  assert.equal(collected.candidates[0].rank_delta, 3);
  assert.equal(collected.candidates[1].trend, "new");
  assert.equal(collected.candidates[1].repo, "example/rag-eval");
});

test("GitHub trending 发现器可以解析浏览器导出的 HTML", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-browser-export-"));
  const exportPath = path.join(tmp, "github-trending.html");
  await fs.writeFile(exportPath, githubTrendingFixture(), "utf8");

  const collected = await collectGitHubTrending({
    browserExportPath: exportPath,
    fetchImpl: async () => {
      throw new Error("fetch should not be called for browser-export input");
    }
  });

  assert.equal(collected.source_audit.github_trending.checked, true);
  assert.equal(collected.source_audit.github_trending.sources[0].status, "checked");
  assert.match(collected.source_audit.github_trending.sources[0].notes, /browser export/);
  assert.equal(collected.source_audit.github_trending.candidates_found, 2);
  assert.equal(collected.candidates[0].repo, "example/trending-agent");
});

test("GitHub trending discovery falls back to OSSInsight API", async () => {
  const source = {
    name: "GitHub Trending daily",
    url: "https://github.com/trending?since=daily",
    language: "all",
    window: "daily"
  };

  const collected = await collectGitHubTrending({
    reportDate: "2026-05-26",
    sources: [source],
    retryDelayMs: 0,
    fetchImpl: async (url) => {
      if (String(url).startsWith("https://api.ossinsight.io/")) {
        return jsonResponse({
          data: {
            rows: [
              {
                repo_name: "example/agent-runtime",
                description: "Agent runtime with deterministic workflows.",
                primary_language: "TypeScript",
                total_score: 42
              }
            ]
          }
        });
      }
      throw new Error("fetch failed");
    }
  });

  assert.equal(collected.source_audit.github_trending.sources[0].status, "blocked");
  assert.equal(collected.source_audit.github_trending.sources[1].name, "OSSInsight Trending Repos API");
  assert.equal(collected.source_audit.github_trending.sources[1].status, "checked");
  assert.equal(collected.source_audit.github_trending.candidates_found, 1);
  assert.equal(collected.candidates[0].repo, "example/agent-runtime");
  assert.equal(collected.candidates[0].category, "project");
  assert.equal(collected.candidates[0].event_date, "2026-05-26");
});

test("GitHub trending discovery retries transient fetch failures and records retry notes", async () => {
  const source = {
    name: "GitHub Trending daily",
    url: "https://github.com/trending?since=daily",
    language: "all",
    window: "daily"
  };
  let calls = 0;
  const collected = await collectGitHubTrending({
    sources: [source],
    reportDate: "2026-05-16",
    retryDelayMs: 0,
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) {
        throw new Error("fetch failed");
      }
      return textResponse(githubTrendingFixture());
    }
  });

  assert.equal(calls, 2);
  assert.equal(collected.source_audit.github_trending.sources[0].status, "checked");
  assert.match(collected.source_audit.github_trending.sources[0].notes, /retry_succeeded_after_1/);
  assert.equal(collected.candidates.length, 2);
});

test("GitHub trending discovery records failed retry notes for retryable HTTP failures", async () => {
  const source = {
    name: "GitHub Trending daily",
    url: "https://github.com/trending?since=daily",
    language: "all",
    window: "daily"
  };
  let calls = 0;
  const collected = await collectGitHubTrending({
    sources: [source],
    reportDate: "2026-05-16",
    retryDelayMs: 0,
    ossInsightFallback: false,
    fetchImpl: async () => {
      calls += 1;
      return {
        ok: false,
        status: 500,
        text: async () => ""
      };
    }
  });

  assert.equal(calls, 2);
  assert.equal(collected.source_audit.github_trending.sources[0].status, "blocked");
  assert.match(collected.source_audit.github_trending.sources[0].notes, /HTTP 500/);
  assert.match(collected.source_audit.github_trending.sources[0].notes, /retry_failed_after_1/);
  assert.doesNotMatch(collected.source_audit.github_trending.sources[0].notes, /retry_succeeded_after_1/);
});

test("GitHub trending discovery compares candidates against recent local history", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-trending-history-"));
  const historyDir = path.join(tmp, "2026", "05");
  await fs.mkdir(historyDir, { recursive: true });
  await fs.writeFile(
    path.join(historyDir, "2026-05-25.json"),
    JSON.stringify({
      report_date: "2026-05-25",
      projects: [
        {
          name: "example/trending-agent",
          url: "https://github.com/example/trending-agent/commits/main/",
          source: "GitHub Trending daily"
        }
      ]
    }),
    "utf8"
  );
  await fs.writeFile(
    path.join(historyDir, "2026-05-24.candidates.json"),
    JSON.stringify({
      report_date: "2026-05-24",
      sources: [
        {
          id: "github-trending-daily",
          name: "GitHub Trending daily",
          url: "https://github.com/trending?since=daily",
          category: "github_trending",
          status: "checked"
        }
      ],
      candidates: [
        {
          id: "project-trending-agent",
          source_id: "github-trending-daily",
          category: "project",
          title: "example/trending-agent",
          url: "https://github.com/example/trending-agent",
          source: "GitHub Trending daily",
          event_date: "2026-05-24",
          status: "included"
        }
      ]
    }),
    "utf8"
  );

  const collected = await collectGitHubTrending({
    reportDate: "2026-05-27",
    historyRoot: tmp,
    sources: [
      {
        name: "GitHub Trending daily",
        url: "https://github.com/trending?since=daily",
        language: "all",
        window: "daily"
      }
    ],
    fetchImpl: async () => ({
      ok: true,
      text: async () => githubTrendingFixture()
    })
  });

  const repeated = collected.candidates.find((candidate) => candidate.repo === "example/trending-agent");
  const fresh = collected.candidates.find((candidate) => candidate.repo === "example/rag-eval");

  assert.match(collected.source_audit.github_trending.notes, /每日必查/);
  assert.match(collected.source_audit.github_trending.notes, /近 7 天/);
  assert.match(repeated.evidence, /2026-05-24/);
  assert.match(repeated.evidence, /2026-05-25/);
  assert.match(repeated.notes, /seen_2_days_in_7d/);
  assert.match(fresh.evidence, /近 7 天本地记录未见/);
  assert.match(fresh.notes, /new_in_7d/);
});

test("builder fallback discovery parses fixed original feeds", async () => {
  const collected = await collectBuilderFallbacks({
    reportDate: "2026-05-26",
    generatedAt: fixedGeneratedAt,
    followBuildersFeeds: false,
    sources: [
      {
        id: "builder-simon-willison",
        name: "Simon Willison Weblog",
        url: "https://example.com/simon.atom",
        author: "Simon Willison",
        role: "builder"
      }
    ],
    fetchImpl: async () => textResponse(builderAtomFixture())
  });

  assert.equal(collected.source_audit.builder_sources.checked, true);
  assert.equal(collected.source_audit.builder_sources.sources[0].status, "checked");
  assert.equal(collected.source_audit.builder_sources.candidates_found, 1);
  assert.equal(collected.sources[0].category, "builder");
  assert.equal(collected.candidates[0].category, "builder_observation");
  assert.equal(collected.candidates[0].source_id, "builder-simon-willison");
  assert.equal(collected.candidates[0].event_date, "2026-05-26");
  assert.equal(collected.candidates[0].url, "https://example.com/builder-post");
});

test("builder discovery 优先解析 follow-builders central X feed", async () => {
  const collected = await collectBuilderFallbacks({
    reportDate: "2026-05-26",
    generatedAt: fixedGeneratedAt,
    sources: [],
    followBuildersFeeds: {
      x: "https://example.com/feed-x.json",
      podcasts: "https://example.com/feed-podcasts.json",
      blogs: "https://example.com/feed-blogs.json"
    },
    fetchImpl: async (url) => {
      if (String(url).endsWith("feed-x.json")) {
        return jsonResponse(followBuildersXFixture());
      }
      return jsonResponse({ generatedAt: "2026-05-26T01:00:00Z" });
    }
  });

  assert.equal(collected.source_audit.builder_sources.checked, true);
  assert.equal(collected.source_audit.builder_sources.sources[0].name, "follow-builders X feed");
  assert.equal(collected.source_audit.builder_sources.sources[0].status, "checked");
  assert.equal(collected.source_audit.builder_sources.candidates_found, 1);
  assert.equal(collected.source_audit.builder_sources.blocked_reason, "");
  assert.equal(collected.sources[0].id, "follow-builders-x");
  assert.equal(collected.candidates[0].category, "builder_observation");
  assert.equal(collected.candidates[0].source_id, "follow-builders-x");
  assert.equal(collected.candidates[0].source, "follow-builders X feed");
  assert.equal(collected.candidates[0].event_date, "2026-05-26");
  assert.equal(collected.candidates[0].url, "https://x.com/swyx/status/2059000000000000000");
  assert.match(collected.candidates[0].evidence, /model alone is no longer the product/i);
});

test("builder discovery treats embedded follow-builders upstream errors as blocked", async () => {
  const collected = await collectBuilderFallbacks({
    reportDate: "2026-05-26",
    generatedAt: fixedGeneratedAt,
    sources: [],
    xSearchApiKey: "",
    followBuildersFeeds: {
      x: "https://example.com/feed-x.json",
      podcasts: "",
      blogs: ""
    },
    fetchImpl: async () =>
      jsonResponse({
        generatedAt: "2026-05-26T01:00:00Z",
        x: [],
        stats: { xBuilders: 0, totalTweets: 0 },
        errors: ["X API: User lookup failed: HTTP 500"]
      })
  });

  const source = collected.source_audit.builder_sources.sources[0];
  assert.equal(source.name, "follow-builders X feed");
  assert.equal(source.status, "blocked");
  assert.match(source.notes, /upstream_error=X API: User lookup failed: HTTP 500/);
  assert.equal(collected.source_audit.builder_sources.sources[1].name, "Tavily X builder search fallback");
  assert.equal(collected.source_audit.builder_sources.sources[1].status, "skipped_missing_token");
  assert.equal(collected.source_audit.builder_sources.blocked_reason, "x_feed_failed");
  assert.equal(collected.source_audit.builder_sources.candidates_found, 0);
});

test("builder discovery falls back to Tavily X status search when central X feed is blocked", async () => {
  const collected = await collectBuilderFallbacks({
    reportDate: "2026-05-26",
    generatedAt: fixedGeneratedAt,
    sources: [],
    xSearchApiKey: "test-key",
    xSearchQueries: ["site:x.com/*/status \"May 26, 2026\" \"coding agents\""],
    followBuildersFeeds: {
      x: "https://example.com/feed-x.json",
      podcasts: "",
      blogs: ""
    },
    fetchImpl: async (url) => {
      if (String(url).endsWith("feed-x.json")) {
        return jsonResponse({
          generatedAt: "2026-05-26T01:00:00Z",
          x: [],
          stats: { xBuilders: 0, totalTweets: 0 },
          errors: ["X API: User lookup failed: HTTP 500"]
        });
      }
      return jsonResponse({
        results: [
          {
            title: "Builder on X: Coding agents need eval loops",
            url: "https://x.com/examplebuilder/status/2059094004961914880",
            content: "Coding agents need eval loops, memory, and clear handoff boundaries before they can run unattended."
          }
        ]
      });
    }
  });

  const fallbackSource = collected.source_audit.builder_sources.sources.find((source) => source.name === "Tavily X builder search fallback");
  assert.equal(fallbackSource.status, "checked");
  assert.equal(collected.source_audit.builder_sources.blocked_reason, "");
  assert.equal(collected.candidates[0].source_id, "x-builder-search-tavily");
  assert.equal(collected.candidates[0].url, "https://x.com/examplebuilder/status/2059094004961914880");
  assert.equal(collected.candidates[0].event_date, "2026-05-26");
  assert.equal(collected.candidates[0].verification_status, "original_social_only");
});

test("builder discovery retries transient fetch failures and records retry notes", async () => {
  let calls = 0;
  const collected = await collectBuilderFallbacks({
    reportDate: "2026-05-26",
    generatedAt: fixedGeneratedAt,
    sources: [],
    followBuildersFeeds: {
      x: "https://example.com/feed-x.json",
      podcasts: "",
      blogs: ""
    },
    retryDelayMs: 0,
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) {
        throw new Error("fetch failed");
      }
      return jsonResponse(followBuildersXFixture());
    }
  });

  assert.equal(calls, 2);
  assert.equal(collected.source_audit.builder_sources.sources[0].status, "checked");
  assert.match(collected.source_audit.builder_sources.sources[0].notes, /retry_succeeded_after_1/);
  assert.equal(collected.source_audit.builder_sources.candidates_found, 1);
});

test("content source discovery parses hot blog and interview feeds", async () => {
  const collected = await collectContentSources({
    reportDate: "2026-05-26",
    generatedAt: fixedGeneratedAt,
    sources: [
      {
        id: "latent-space",
        name: "Latent.Space",
        url: "https://example.com/latent-space.xml"
      }
    ],
    fetchImpl: async () => textResponse(contentSourceRssFixture())
  });

  assert.equal(collected.source_audit.content_sources.checked, true);
  assert.equal(collected.source_audit.content_sources.sources[0].status, "checked");
  assert.equal(collected.source_audit.content_sources.candidates_found, 1);
  assert.equal(collected.sources[0].category, "blog");
  assert.equal(collected.candidates[0].category, "hot_blog");
  assert.equal(collected.candidates[0].source_id, "latent-space");
  assert.equal(collected.candidates[0].event_date, "2026-05-26");
  assert.equal(collected.candidates[0].url, "https://example.com/interview");
  assert.match(collected.candidates[0].evidence, /OpenAI engineer interview/i);
});

test("default content sources cover broader tech, big-tech, and Product Hunt trending", () => {
  const names = DEFAULT_CONTENT_SOURCES.map((source) => source.name);

  assert(names.includes("TechCrunch Enterprise"));
  assert(names.includes("The Verge"));
  assert(names.includes("Ars Technica"));
  assert(names.includes("Google Keyword Blog"));
  assert(names.includes("Official Microsoft Blog"));
  assert(names.includes("Apple Newsroom"));
  assert(names.includes("Meta Newsroom"));
  assert(names.includes("Amazon News"));
  assert(names.includes("Product Hunt Trending Feed"));
  assert(names.includes("The Magnifier AI"));
  assert(names.includes("Fast Company Creator Economy"));
  assert(names.includes("Crunchbase News AI"));
  assert(names.includes("OpenAI Blog RSS"));
  assert(names.includes("Google DeepMind RSS"));
  assert(names.includes("MIT Technology Review"));
  assert(names.includes("VentureBeat AI"));
  assert(names.includes("ML Papers of the Week"));
  assert(names.includes("HelloGitHub"));
  assert(names.includes("RuanYF Weekly"));
  assert(names.includes("Jiqizhixin"));
  assert(names.includes("arXiv cs.AI"));
  assert(names.includes("Hacker News Topstories API"));
  assert(names.includes("Hugging Face Daily Papers"));
  assert(names.includes("Papers with Code API"));
  assert(names.includes("Reddit r/MachineLearning"));
  assert(names.includes("Smol AI News"));
  assert(names.includes("AI News Archive"));
  assert(names.includes("Ben's Bites"));
});

test("registered discovery sources cover the user requested AI source list", async () => {
  const registry = await loadSourceRegistry({
    rootDir,
    includeEnablement: "core,optional,manual"
  });
  const fixedSources = [
    ...registry.sources,
    ...DEFAULT_CONTENT_SOURCES,
    ...DEFAULT_GITHUB_TRENDING_SOURCES,
    {
      name: "follow-builders central feed",
      url: "https://github.com/zarazhangrui/follow-builders"
    }
  ];

  const expected = [
    ["follow-builders", ["https://github.com/zarazhangrui/follow-builders"]],
    ["ML-Papers-of-the-Week", ["https://github.com/dair-ai/ML-Papers-of-the-Week/commits/main.atom"]],
    ["HelloGitHub", ["https://github.com/521xueweihan/HelloGitHub/commits/master.atom"]],
    ["RuanYF Weekly", ["https://github.com/ruanyf/weekly/commits/master.atom"]],
    ["OpenAI Blog RSS", ["https://openai.com/blog/rss.xml", "https://openai.com/news/rss.xml"]],
    ["Google DeepMind", ["https://deepmind.google/blog/rss.xml", "https://deepmind.google/discover/blog/"]],
    ["Google Research", ["https://research.google/blog/rss/"]],
    ["Meta AI", ["https://ai.meta.com/blog/rss/", "https://ai.meta.com/blog/"]],
    ["Microsoft Research", ["https://www.microsoft.com/en-us/research/feed/"]],
    ["AWS ML Blog", ["https://aws.amazon.com/blogs/machine-learning/feed/"]],
    ["Anthropic News", ["https://www.anthropic.com/news"]],
    ["Hugging Face Blog", ["https://huggingface.co/blog/feed.xml"]],
    ["TechCrunch AI", ["https://techcrunch.com/category/artificial-intelligence/feed/"]],
    ["The Verge", ["https://www.theverge.com/rss/index.xml"]],
    ["MIT Technology Review", ["https://www.technologyreview.com/feed/"]],
    ["Ars Technica", ["https://feeds.arstechnica.com/arstechnica/index"]],
    ["VentureBeat AI", ["https://venturebeat.com/category/ai/feed"]],
    ["HNRSS Frontpage", ["https://hnrss.org/frontpage"]],
    ["Jiqizhixin", ["https://www.jiqizhixin.com/rss"]],
    ["QbitAI", ["https://www.qbitai.com/feed"]],
    ["36Kr", ["https://36kr.com/feed", "https://www.36kr.com/feed"]],
    ["InfoQ CN", ["https://www.infoq.cn/feed"]],
    ["arXiv cs.AI", ["http://export.arxiv.org/api/query?search_query=cat:cs.AI&sortBy=submittedDate&sortOrder=descending&max_results=20"]],
    ["Hacker News API", ["https://hacker-news.firebaseio.com/v0/topstories.json"]],
    ["Hugging Face Daily Papers", ["https://huggingface.co/papers"]],
    ["Papers with Code API", ["https://paperswithcode.com/api/v1/"]],
    ["Reddit r/MachineLearning", ["https://www.reddit.com/r/MachineLearning/.json"]],
    ["GitHub Trending", ["https://github.com/trending?since=daily"]],
    ["Smol AI News", ["https://news.smol.ai/rss.xml", "https://news.smol.ai/"]],
    ["AI News Archive", ["https://buttondown.com/ainews/rss", "https://buttondown.com/ainews/archive/"]],
    ["Latent Space", ["https://www.latent.space/feed", "https://www.latent.space/"]],
    ["Ben's Bites", ["https://bensbites.com/feed", "https://bensbites.com/"]]
  ];

  for (const [label, urls] of expected) {
    assert(
      fixedSources.some((source) => urls.some((url) => normalizedSourceUrl(source.url) === normalizedSourceUrl(url))),
      `missing requested source: ${label}`
    );
  }
});

test("registered content sources cover frontier AI company official sources", async () => {
  const registry = JSON.parse(await fs.readFile(path.join(rootDir, "config/sources/default-content-sources.json"), "utf8"));
  const sourcesById = new Map(registry.sources.map((source) => [source.id, source]));
  const expected = [
    ["content-openai-news", "openai.com"],
    ["content-anthropic-news", "www.anthropic.com"],
    ["content-google-deepmind-blog", "deepmind.google"],
    ["content-meta-ai-blog", "ai.meta.com"],
    ["content-xai-news", "x.ai"],
    ["content-bytedance-seed-blog", "seed.bytedance.com"],
    ["content-tiktok-developers-blog", "developers.tiktok.com"],
    ["content-tencent-corporate-ai", "www.tencent.com"],
    ["content-tencent-hunyuan-blog", "llm.hunyuan.tencent.com"],
    ["content-qwen-blog", "qwen.ai"],
    ["content-alibaba-cloud-blog", "www.alibabacloud.com"],
    ["content-kimi-platform-blog", "platform.kimi.com"],
    ["content-kimi-technical-blog", "www.kimi.com"],
    ["content-minimax-blog", "www.minimax.io"],
    ["content-zhipu-research", "www.zhipuai.cn"]
  ];

  for (const [id, hostname] of expected) {
    const source = sourcesById.get(id);
    assert(source, `missing source ${id}`);
    assert.equal(new URL(source.url).hostname, hostname);
    assert.equal(source.authority, "primary");
    assert.equal(source.verification_policy, "primary_allowed");
  }
});

test("search shadow queries allow primary domains for China frontier AI labs", async () => {
  const queries = JSON.parse(await fs.readFile(path.join(rootDir, "config/search-queries.json"), "utf8"));
  const query = queries.find((item) => item.id === "china-frontier-labs-release");

  assert(query);
  assert.deepEqual(query.allowed_primary_domains, [
    "seed.bytedance.com",
    "developers.tiktok.com",
    "www.tencent.com",
    "llm.hunyuan.tencent.com",
    "qwen.ai",
    "qwenlm.github.io",
    "www.alibabacloud.com",
    "platform.kimi.com",
    "www.kimi.com",
    "www.minimax.io",
    "www.zhipuai.cn",
    "z.ai"
  ]);
});

test("source registry validates required source metadata", () => {
  const valid = normalizeSourceRegistry({
    schema_version: 1,
    sources: [
      {
        id: "content-apple-machine-learning",
        name: "Apple Machine Learning Research",
        url: "https://machinelearning.apple.com/rss.xml",
        source_kind: "rss",
        candidate_category: "hot_blog",
        tier: "T0",
        authority: "primary",
        enablement: "core",
        verification_policy: "primary_allowed",
        requires_original_url: false,
        max_items_per_run: 3,
        timeout_ms: 15000
      }
    ]
  });

  assert.equal(valid.sources[0].source_kind, "rss");
  assert.equal(valid.sources[0].candidate_category, "hot_blog");

  assert.throws(
    () =>
      normalizeSourceRegistry({
        schema_version: 1,
        sources: [
          {
            id: "missing-tier",
            name: "Missing Tier",
            url: "https://example.com/rss.xml",
            source_kind: "rss",
            candidate_category: "hot_blog",
            authority: "primary",
            enablement: "core",
            verification_policy: "primary_allowed"
          }
        ]
      }),
    (error) => error instanceof PublisherError && error.code === "source_registry_schema_validation_failed"
  );
});

test("content source discovery defaults to core and optional sources while keeping manual sources opt-in", async () => {
  const checkedUrls = [];
  const collectedDefault = await collectContentSources({
    rootDir,
    reportDate: "2026-05-26",
    generatedAt: fixedGeneratedAt,
    limit: 200,
    fetchImpl: async (url) => {
      checkedUrls.push(String(url));
      return textResponse(emptyRssFixture());
    }
  });

  assert(collectedDefault.source_audit.content_sources.enablement_counts.core > 0);
  assert(collectedDefault.source_audit.content_sources.enablement_counts.optional > 0);
  assert(checkedUrls.some((url) => url.includes("machinelearning.apple.com")));
  assert(checkedUrls.some((url) => url.includes("producthunt.com/feed")));
  assert(!checkedUrls.some((url) => url.includes("mp.weixin.qq.com")));

  const manualUrls = [];
  const collectedManual = await collectContentSources({
    rootDir,
    reportDate: "2026-05-26",
    generatedAt: fixedGeneratedAt,
    enablement: "core,optional,manual",
    limit: 200,
    fetchImpl: async (url) => {
      manualUrls.push(String(url));
      return textResponse(emptyRssFixture());
    }
  });

  assert(collectedManual.source_audit.content_sources.enablement_counts.manual > 0);
  assert(!manualUrls.some((url) => url.includes("mp.weixin.qq.com")));
  assert(
    collectedManual.source_audit.content_sources.sources.some(
      (source) => source.name === "WeChat Industry Whitelist Manual Intake" && source.status === "skipped_manual_review_required"
    )
  );
});

test("content source discovery keeps self-media as intermediary leads requiring primary verification", async () => {
  const collected = await collectContentSources({
    reportDate: "2026-05-26",
    generatedAt: fixedGeneratedAt,
    sources: [
      {
        id: "wechat-tech-media",
        name: "WeChat Tech Media Example",
        url: "https://example.com/wechat.xml",
        category: "intermediary"
      }
    ],
    fetchImpl: async () => textResponse(`
      <rss><channel>
        <item>
          <title>大厂模型产品化观察</title>
          <link>https://mp.weixin.qq.com/s/example</link>
          <pubDate>Tue, 26 May 2026 09:00:00 GMT</pubDate>
          <description><![CDATA[文章引用了官方公告和公司博客，但公众号自身只作为中介线索。]]></description>
        </item>
      </channel></rss>
    `)
  });

  const candidate = collected.candidates[0];
  assert.equal(collected.sources[0].category, "community");
  assert.equal(candidate.category, "community_lead");
  assert.equal(candidate.url, "https://mp.weixin.qq.com/s/example");
  assert.match(candidate.evidence, /intermediary\/self-media lead/);
  assert.match(candidate.notes, /intermediary_url=https:\/\/mp\.weixin\.qq\.com\/s\/example/);
  assert.match(candidate.notes, /primary_verification_required=true/);
});

test("content source discovery accepts X hotspot feeds only when original post URL is preserved", async () => {
  const collected = await collectContentSources({
    reportDate: "2026-05-26",
    generatedAt: fixedGeneratedAt,
    sources: [
      {
        id: "x-hotspots",
        name: "Self-hosted X Hotspot RSS",
        url: "https://example.com/x-hotspots.xml",
        category: "x_hotspot"
      }
    ],
    fetchImpl: async () => textResponse(`
      <rss><channel>
        <item>
          <title>模型公司发布节奏讨论</title>
          <link>https://x.com/example/status/1234567890</link>
          <pubDate>Tue, 26 May 2026 09:00:00 GMT</pubDate>
          <description>多位研究者讨论模型发布节奏。</description>
        </item>
        <item>
          <title>缺少原帖的聚合摘要</title>
          <link>https://example.com/summary</link>
          <pubDate>Tue, 26 May 2026 10:00:00 GMT</pubDate>
          <description>没有原始 X URL。</description>
        </item>
      </channel></rss>
    `)
  });

  assert.equal(collected.candidates.length, 1);
  assert.equal(collected.sources[0].category, "community");
  assert.equal(collected.candidates[0].category, "community_lead");
  assert.equal(collected.candidates[0].url, "https://x.com/example/status/1234567890");
  assert.match(collected.candidates[0].notes, /original_url=https:\/\/x\.com\/example\/status\/1234567890/);
  assert.match(collected.source_audit.content_sources.sources[0].notes, /1 skipped without original URL/);
});

test("content source discovery parses official HTML pages and Product Hunt project feeds", async () => {
  const collected = await collectContentSources({
    reportDate: "2026-05-26",
    generatedAt: fixedGeneratedAt,
    sources: [
      {
        id: "anthropic-news",
        name: "Anthropic News",
        url: "https://example.com/news",
        format: "html_index",
        linkPattern: "/news/"
      },
      {
        id: "product-hunt-devtools",
        name: "Product Hunt Developer Tools Feed",
        url: "https://example.com/product-hunt.xml",
        category: "project",
        signal: "product_hunt"
      }
    ],
    fetchImpl: async (url) => {
      if (String(url).endsWith("product-hunt.xml")) {
        return textResponse(productHuntAtomFixture());
      }
      return textResponse(anthropicNewsHtmlFixture());
    }
  });

  assert.equal(collected.source_audit.content_sources.sources.length, 2);
  assert.equal(collected.source_audit.content_sources.candidates_found, 2);
  assert.equal(collected.sources[0].category, "blog");
  assert.equal(collected.candidates[0].category, "hot_blog");
  assert.equal(collected.candidates[0].source_id, "anthropic-news");
  assert.equal(collected.candidates[0].event_date, "2026-05-26");
  assert.equal(collected.candidates[0].url, "https://example.com/news/claude-code-internals");
  assert.match(collected.candidates[0].evidence, /Claude Code team explained/);
  assert.equal(collected.sources[1].category, "project");
  assert.equal(collected.candidates[1].category, "project");
  assert.equal(collected.candidates[1].source_id, "product-hunt-devtools");
  assert.equal(collected.candidates[1].signal, "product_hunt");
  assert.equal(collected.candidates[1].url, "https://www.producthunt.com/products/agent-debugger");
});

test("content source discovery parses JSON API sources", async () => {
  const requestedUrls = [];
  const collected = await collectContentSources({
    reportDate: "2026-05-26",
    generatedAt: fixedGeneratedAt,
    sources: [
      {
        id: "content-hacker-news-api",
        name: "Hacker News Topstories API",
        url: "https://hacker-news.firebaseio.com/v0/topstories.json",
        source_kind: "search_api",
        category: "intermediary",
        source_level: "community_api"
      },
      {
        id: "content-papers-with-code-api",
        name: "Papers with Code API",
        url: "https://paperswithcode.com/api/v1/",
        source_kind: "search_api",
        category: "intermediary",
        source_level: "paper_api"
      },
      {
        id: "content-reddit-machinelearning",
        name: "Reddit r/MachineLearning",
        url: "https://www.reddit.com/r/MachineLearning/.json",
        source_kind: "search_api",
        category: "intermediary",
        source_level: "community_api"
      }
    ],
    fetchImpl: async (url) => {
      requestedUrls.push(String(url));
      if (String(url).endsWith("/topstories.json")) {
        return textResponse(JSON.stringify([12345]));
      }
      if (String(url).endsWith("/item/12345.json")) {
        return textResponse(JSON.stringify({
          id: 12345,
          title: "HN discussion about agent evals",
          url: "https://example.com/hn-agent-evals",
          time: 1779742800,
          text: "Discussion about production agent eval loops."
        }));
      }
      if (String(url).endsWith("/api/v1/papers/")) {
        return textResponse(JSON.stringify({
          results: [
            {
              title: "Agentic Evaluation for Long-Horizon Tasks",
              url: "https://paperswithcode.com/paper/agentic-evaluation",
              published: "2026-05-26",
              abstract: "A paper about long-horizon agent evaluation."
            }
          ]
        }));
      }
      if (String(url).endsWith("/r/MachineLearning/.json")) {
        return textResponse(JSON.stringify({
          data: {
            children: [
              {
                data: {
                  title: "[D] Practical lessons for AI agents",
                  url: "https://www.reddit.com/r/MachineLearning/comments/example/practical_agents/",
                  created_utc: 1779746400,
                  selftext: "Practitioners compare agent memory and eval results."
                }
              }
            ]
          }
        }));
      }
      return textResponse("{}", 404);
    }
  });

  assert(requestedUrls.includes("https://hacker-news.firebaseio.com/v0/item/12345.json"));
  assert(requestedUrls.includes("https://paperswithcode.com/api/v1/papers/"));
  assert.equal(collected.source_audit.content_sources.candidates_found, 3);
  assert.deepEqual(
    collected.candidates.map((candidate) => [candidate.source_id, candidate.url]),
    [
      ["content-hacker-news-api", "https://example.com/hn-agent-evals"],
      ["content-papers-with-code-api", "https://paperswithcode.com/paper/agentic-evaluation"],
      ["content-reddit-machinelearning", "https://www.reddit.com/r/MachineLearning/comments/example/practical_agents/"]
    ]
  );
});

test("content source discovery cross-checks Product Hunt candidates with GitHub or docs", async () => {
  const collected = await collectContentSources({
    reportDate: "2026-05-26",
    generatedAt: fixedGeneratedAt,
    sources: [
      {
        id: "product-hunt-devtools",
        name: "Product Hunt Developer Tools Feed",
        url: "https://example.com/product-hunt.xml",
        category: "project",
        signal: "product_hunt"
      }
    ],
    fetchImpl: async (url) => {
      const value = String(url);
      if (value.endsWith("product-hunt.xml")) {
        return textResponse(productHuntAtomFixture());
      }
      if (value === "https://www.producthunt.com/products/agent-debugger") {
        return textResponse(productHuntProductPageFixture());
      }
      if (value === "https://github.com/acme/agent-debugger") {
        return textResponse(githubProductReadmeFixture());
      }
      throw new Error(`unexpected url ${value}`);
    }
  });

  const candidate = collected.candidates[0];

  assert.equal(candidate.category, "project");
  assert.equal(candidate.signal, "product_hunt");
  assert.equal(candidate.url, "https://github.com/acme/agent-debugger");
  assert.match(candidate.evidence, /已打开 GitHub/);
  assert.match(candidate.evidence, /Replay production AI agent incidents/i);
  assert.match(candidate.notes, /product_cross_check=confirmed/);
  assert.match(candidate.notes, /product_hunt_url=https:\/\/www\.producthunt\.com\/products\/agent-debugger/);
  assert.match(candidate.notes, /confirmation_url=https:\/\/github\.com\/acme\/agent-debugger/);
  assert.match(collected.source_audit.content_sources.sources[0].notes, /1 product cross-checks confirmed/);
  assert.match(collected.source_audit.content_sources.notes, /Product Hunt project candidates are cross-checked/);
});

test("content source discovery follows Product Hunt RSS link redirects for product cross-check", async () => {
  const collected = await collectContentSources({
    reportDate: "2026-05-26",
    generatedAt: fixedGeneratedAt,
    sources: [
      {
        id: "product-hunt-devtools",
        name: "Product Hunt Developer Tools Feed",
        url: "https://example.com/product-hunt.xml",
        category: "project",
        signal: "product_hunt"
      }
    ],
    fetchImpl: async (url) => {
      const value = String(url);
      if (value.endsWith("product-hunt.xml")) {
        return textResponse(productHuntAtomWithRedirectFixture());
      }
      if (value === "https://www.producthunt.com/r/p/123?app_id=339") {
        return textResponse(githubProductReadmeFixture(), 200, "https://github.com/acme/agent-debugger");
      }
      throw new Error(`unexpected url ${value}`);
    }
  });

  const candidate = collected.candidates[0];

  assert.equal(candidate.url, "https://github.com/acme/agent-debugger");
  assert.match(candidate.evidence, /已打开 GitHub/);
  assert.match(candidate.notes, /confirmation_url=https:\/\/github\.com\/acme\/agent-debugger/);
});

test("content source discovery ignores Product Hunt internal help links during product cross-check", async () => {
  const collected = await collectContentSources({
    reportDate: "2026-05-26",
    generatedAt: fixedGeneratedAt,
    sources: [
      {
        id: "product-hunt-devtools",
        name: "Product Hunt Developer Tools Feed",
        url: "https://example.com/product-hunt.xml",
        category: "project",
        signal: "product_hunt"
      }
    ],
    fetchImpl: async (url) => {
      const value = String(url);
      if (value.endsWith("product-hunt.xml")) {
        return textResponse(productHuntAtomFixture());
      }
      if (value === "https://www.producthunt.com/products/agent-debugger") {
        return textResponse(productHuntInternalOnlyPageFixture());
      }
      throw new Error(`unexpected url ${value}`);
    }
  });

  const candidate = collected.candidates[0];

  assert.equal(candidate.url, "https://www.producthunt.com/products/agent-debugger");
  assert.match(candidate.notes, /product_cross_check=unresolved/);
  assert.match(candidate.notes, /no_external_confirmation_link/);
  assert.match(collected.source_audit.content_sources.sources[0].notes, /0 product cross-checks confirmed/);
});

test("content source discovery rejects low-quality Product Hunt confirmation pages", async () => {
  const collected = await collectContentSources({
    reportDate: "2026-05-26",
    generatedAt: fixedGeneratedAt,
    sources: [
      {
        id: "product-hunt-devtools",
        name: "Product Hunt Developer Tools Feed",
        url: "https://example.com/product-hunt.xml",
        category: "project",
        signal: "product_hunt"
      }
    ],
    fetchImpl: async (url) => {
      const value = String(url);
      if (value.endsWith("product-hunt.xml")) {
        return textResponse(productHuntAtomFixture());
      }
      if (value === "https://www.producthunt.com/products/agent-debugger") {
        return textResponse(productHuntLowQualityPageFixture());
      }
      if (value === "https://example.com/flutter-template") {
        return textResponse("<p>A new Flutter project.</p>");
      }
      if (value === "https://circle.ci/demo") {
        return textResponse("<p>Enjoy the videos and music you love on YouTube.</p>", 200, "https://www.youtube.com/watch?v=abc");
      }
      throw new Error(`unexpected url ${value}`);
    }
  });

  const candidate = collected.candidates[0];

  assert.equal(candidate.url, "https://www.producthunt.com/products/agent-debugger");
  assert.match(candidate.notes, /product_cross_check=unresolved/);
  assert.match(candidate.notes, /low_quality_summary|low_value_final_url/);
});

test("search news discovery runs shadow providers and preserves verification fields", async () => {
  const collected = await collectSearchNews({
    reportDate: "2026-05-26",
    generatedAt: fixedGeneratedAt,
    providers: "gdelt",
    queries: [
      {
        id: "frontier-labs-release",
        query: "OpenAI release",
        candidate_category: "community_lead",
        verification_policy: "primary_required",
        allowed_primary_domains: ["openai.com"]
      }
    ],
    fetchImpl: async () =>
      jsonResponse({
        articles: [
          {
            title: "OpenAI launches example agent feature",
            url: "https://openai.com/news/example-agent-feature",
            seendate: "20260526T120000Z",
            sourceCountry: "US"
          }
        ]
      })
  });

  assert.equal(collected.source_audit.search_sources.checked, true);
  assert.equal(collected.source_audit.search_sources.shadow, true);
  assert.equal(collected.source_audit.search_sources.sources[0].status, "checked");
  assert.equal(collected.candidates.length, 1);
  assert.equal(collected.candidates[0].category, "community_lead");
  assert.equal(collected.candidates[0].verification_status, "primary_confirmed");
  assert.equal(collected.candidates[0].primary_url, "https://openai.com/news/example-agent-feature");
  assert.match(collected.candidates[0].notes, /shadow=true/);
});

test("search news discovery skips keyed providers without exposing tokens", async () => {
  const collected = await collectSearchNews({
    reportDate: "2026-05-26",
    generatedAt: fixedGeneratedAt,
    providers: "brave",
    queries: [{ id: "example", query: "OpenAI", candidate_category: "community_lead" }],
    fetchImpl: async () => {
      throw new Error("should not fetch without token");
    }
  });

  assert.equal(collected.source_audit.search_sources.sources[0].status, "blocked");
  assert.equal(collected.source_audit.search_sources.sources[0].notes, "skipped_missing_token");
  assert.equal(collected.candidates.length, 0);
});

test("sources health checks feed shape and self-hosted base URL requirements", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-sources-health-"));
  const sourcesPath = path.join(tmp, "sources.json");
  await fs.writeFile(
    sourcesPath,
    JSON.stringify({
      schema_version: 1,
      sources: [
        {
          id: "health-feed",
          name: "Health Feed",
          url: "https://example.com/feed.xml",
          source_kind: "rss",
          candidate_category: "hot_blog",
          tier: "T0",
          authority: "primary",
          enablement: "core",
          verification_policy: "primary_allowed"
        },
        {
          id: "health-rsshub",
          name: "Health RSSHub X",
          url: "https://rsshub.example.com/twitter/list/ai",
          source_kind: "rsshub",
          candidate_category: "community_lead",
          tier: "T2",
          authority: "community",
          enablement: "optional",
          verification_policy: "primary_required",
          requires_original_url: true,
          base_url_env: "AI_DAILY_TEST_RSSHUB_BASE_URL"
        },
        {
          id: "health-manual-wechat",
          name: "Health Manual WeChat",
          url: "https://mp.weixin.qq.com/",
          source_kind: "manual",
          candidate_category: "community_lead",
          tier: "T3",
          authority: "intermediary",
          enablement: "manual",
          verification_policy: "community_only",
          requires_original_url: false
        }
      ]
    }),
    "utf8"
  );

  const health = await checkSourcesHealth({
    rootDir: tmp,
    sourcesPath,
    reportDate: "2026-05-26",
    enablement: "core,optional,manual",
    fetchImpl: async () => textResponse(contentSourceRssFixture())
  });

  assert.equal(health.source_audit.sources_health.checked, true);
  assert.equal(health.results[0].status, "checked");
  assert.equal(health.results[0].feed_like, true);
  assert.equal(health.results[0].recent_48h_entries, 1);
  assert.equal(health.results[1].status, "skipped_missing_base_url");
  assert.equal(health.results[2].status, "skipped_manual_source");
});

test("sources audit merge writes discovery audit groups into the final report JSON", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-source-audit-merge-"));
  const historyDir = path.join(tmp, "reports-data", "2026", "05");
  await fs.mkdir(historyDir, { recursive: true });
  const report = JSON.parse(await readFixture("reports/good/structured-report.json"));
  const reportPath = path.join(historyDir, "2026-05-15.json");
  const searchPath = path.join(tmp, "search-news.json");
  const healthPath = path.join(tmp, "sources-health.json");
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await fs.writeFile(
    searchPath,
    `${JSON.stringify({
      report_date: "2026-05-15",
      source_audit: {
        search_sources: {
          ...auditGroupFixture("Search", 3, 0),
          shadow: true,
          provider_runtime_ms: { gdelt: 123 },
          provider_cost_units: { gdelt: 1 }
        }
      }
    }, null, 2)}\n`,
    "utf8"
  );
  await fs.writeFile(
    healthPath,
    `${JSON.stringify({
      report_date: "2026-05-15",
      source_audit: {
        sources_health: auditGroupFixture("Health", 2, 0)
      }
    }, null, 2)}\n`,
    "utf8"
  );

  const result = await mergeSourceAuditIntoReport({
    rootDir: tmp,
    reportDate: "2026-05-15",
    historyDir: "reports-data",
    inputPaths: [searchPath, healthPath]
  });
  const merged = JSON.parse(await fs.readFile(reportPath, "utf8"));

  assert.deepEqual(result.merged_groups, ["search_sources", "sources_health"]);
  assert.equal(merged.source_audit.search_sources.shadow, true);
  assert.equal(merged.source_audit.search_sources.provider_runtime_ms.gdelt, 123);
  assert.equal(merged.source_audit.sources_health.sources[0].name, "Health");
});

test("phase 5 audit reports missing continuous source audit groups", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-phase5-audit-"));
  const historyDir = path.join(tmp, "reports-data");
  await writePhase5Day(historyDir, "2026-05-24", {
    includeSearch: true,
    includeHealth: true,
    candidateVerificationStatus: "primary_confirmed"
  });
  await writePhase5Day(historyDir, "2026-05-25", {
    includeSearch: true,
    includeHealth: true,
    candidateVerificationStatus: "primary_confirmed"
  });
  await writePhase5Day(historyDir, "2026-05-26", {
    includeSearch: false,
    includeHealth: true,
    candidateVerificationStatus: "primary_confirmed"
  });

  const incomplete = await auditSourceRunHistory({
    rootDir: tmp,
    historyDir: "reports-data",
    reportDate: "2026-05-26",
    days: 3
  });

  assert.equal(incomplete.phase5_complete, false);
  assert.equal(incomplete.summary.missing_days, 0);
  assert(incomplete.days[0].missing_required_groups.includes("search_sources"));

  await writePhase5Day(historyDir, "2026-05-26", {
    includeSearch: true,
    includeHealth: true,
    candidateVerificationStatus: "primary_confirmed"
  });
  const complete = await auditSourceRunHistory({
    rootDir: tmp,
    historyDir: "reports-data",
    reportDate: "2026-05-26",
    days: 3
  });

  assert.equal(complete.phase5_complete, true);
  assert.equal(complete.summary.days_with_all_required_groups, 3);
  assert.equal(complete.summary.t3_fact_leak_count, 0);
  assert.equal(complete.summary.primary_verified, 3);
});

test("statuspage discovery parses Atom incidents into light operations candidates", async () => {
  const collected = await collectStatuspageIncidents({
    reportDate: "2026-05-26",
    generatedAt: fixedGeneratedAt,
    sources: [
      {
        id: "status-claude",
        name: "Claude Status",
        url: "https://status.claude.com/history.atom"
      }
    ],
    fetchImpl: async () => textResponse(statuspageAtomFixture())
  });

  assert.equal(collected.sources[0].category, "other");
  assert.equal(collected.sources[0].status, "checked");
  assert.equal(collected.candidates.length, 1);
  assert.equal(collected.candidates[0].category, "community_lead");
  assert.equal(collected.candidates[0].source_id, "status-claude");
  assert.equal(collected.candidates[0].event_date, "2026-05-26");
  assert.equal(collected.candidates[0].url, "https://status.claude.com/incidents/abc123");
});

test("buildSite fails fast when trend config is absent from the build root", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-build-missing-trends-"));
  const inputDir = path.join(tmp, "reports-source");
  const outDir = path.join(tmp, "docs");
  await fs.mkdir(inputDir, { recursive: true });
  await fs.copyFile(
    path.join(rootDir, "tests/fixtures/reports/good/official-release.md"),
    path.join(inputDir, "official-release.md")
  );

  await assert.rejects(
    () =>
      buildSite({
        rootDir: tmp,
        inputDir,
        outDir,
        siteUrl,
        generatedAt: fixedGeneratedAt
      }),
    (error) => error instanceof PublisherError && error.code === "trend_config_missing"
  );
  assert.equal(await exists(path.join(outDir, "trends.json")), false);
});

test("buildSite 写入 docs/reports、docs/data、index 和 feed", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-build-"));
  const inputDir = path.join(tmp, "reports-source");
  const outDir = path.join(tmp, "docs");
  await fs.mkdir(inputDir, { recursive: true });
  await fs.copyFile(
    path.join(rootDir, "tests/fixtures/reports/good/official-release.md"),
    path.join(inputDir, "official-release.md")
  );

  const result = await buildSite({
    rootDir: tmp,
    inputDir,
    outDir,
    siteUrl,
    generatedAt: fixedGeneratedAt,
    trendConfigPath
  });

  assert(result.writtenFiles.includes("reports/2026/05/2026-05-13.html"));
  assert(result.writtenFiles.includes("reports/2026/05/2026-05-13.md"));
  assert(result.writtenFiles.includes("data/2026/05/2026-05-13.json"));
  assert(result.writtenFiles.includes("trends.json"));
  assert.equal(await exists(path.join(outDir, "index.html")), true);
  assert.equal(await exists(path.join(outDir, "feed.json")), true);
  assert.equal(await exists(path.join(outDir, "trends.json")), true);
  assert.equal(await exists(path.join(outDir, "assets/style.css")), true);

  const trends = JSON.parse(await fs.readFile(path.join(outDir, "trends.json"), "utf8"));
  assert.equal(validateTrends(trends).valid, true);
});

test("buildSite skips unchanged files and avoids legacy shared scratch path", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-repeat-build-"));
  const inputDir = path.join(tmp, "reports-source");
  const outDir = path.join(tmp, "docs");
  await fs.mkdir(inputDir, { recursive: true });
  await fs.copyFile(
    path.join(rootDir, "tests/fixtures/reports/good/official-release.md"),
    path.join(inputDir, "official-release.md")
  );

  const options = {
    rootDir: tmp,
    inputDir,
    outDir,
    siteUrl,
    generatedAt: fixedGeneratedAt,
    trendConfigPath
  };
  const first = await buildSite(options);
  const second = await buildSite(options);

  assert(first.writtenFiles.includes("data/2026/05/2026-05-13.json"));
  assert(!second.writtenFiles.includes("data/2026/05/2026-05-13.json"));
  assert(!second.writtenFiles.includes("reports/2026/05/2026-05-13.html"));
  assert(!second.writtenFiles.includes("trends.json"));
  assert.equal(await exists(path.join(tmp, ".tmp", "effective-interact-daily")), false);
});

test("结构化 JSON 输入可以直接生成自包含 HTML，不要求 Markdown", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-json-build-"));
  const dataInputDir = path.join(tmp, "reports-data");
  const outDir = path.join(tmp, "docs");
  await fs.mkdir(dataInputDir, { recursive: true });
  const structuredReport = JSON.parse(await readFixture("reports/good/structured-report.json"));
  for (const sectionName of ["main_items", "model_releases", "hot_blogs", "projects", "github_trending", "builder_observations", "community_leads"]) {
    for (const item of structuredReport[sectionName] || []) {
      delete item.importance;
    }
  }
  structuredReport.model_releases[0].notes = "同时出现在多个平台；本轮只按官方来源记录可用性。";
  structuredReport.projects = [
    {
      name: "Example Agent Tool",
      description: "面向 coding agents 的本地工具，在 GitHub Trending daily 中出现。",
      url: "https://github.com/example/agent-tool",
      event_date: "2026-05-15",
      source: "GitHub Trending daily",
      signal: "trending",
      evidence: "GitHub Trending daily 显示 321 stars today。"
    }
  ];
  await fs.writeFile(path.join(dataInputDir, "structured-report.json"), `${JSON.stringify(structuredReport, null, 2)}\n`, "utf8");

  const result = await buildSite({
    rootDir: tmp,
    inputDir: path.join(tmp, "reports-source"),
    dataInputDir,
    outDir,
    siteUrl,
    generatedAt: fixedGeneratedAt,
    trendConfigPath
  });

  assert(result.writtenFiles.includes("reports/2026/05/2026-05-15.html"));
  assert(result.writtenFiles.includes("data/2026/05/2026-05-15.json"));
  assert(!result.writtenFiles.includes("reports/2026/05/2026-05-15.md"));

  const html = await fs.readFile(path.join(outDir, "reports/2026/05/2026-05-15.html"), "utf8");
  assert(html.includes("<style>"));
  assert(html.includes("data-html-work-report"));
  assert(html.includes('data-render-mode="pre-rendered"'));
  assert(html.includes("模型发布"));
  assert(html.includes("ExampleModel 2"));
  assert(html.includes("多平台可见"));
  assert(html.includes("官方可用性"));
  assert(html.includes("热门技术博客"));
  assert(html.includes("Harness Engineering for Long Running Agents"));
  assert(html.includes(">重大<"));
  assert(html.includes(">值得关注<"));
  assert(html.includes("今日 +321 stars"));
  assert(!html.includes("备注："));
  assert(!html.includes("信号：trending"));
  assert(!html.includes("证据：GitHub Trending daily 显示 321 stars today"));
  assert(!html.includes("在 GitHub Trending daily 中出现"));
  assert(html.includes("https://jasonxzwen.github.io/ai-daily-cn/data/2026/05/2026-05-15.json"));
  assert(html.includes('rel="noopener noreferrer"'));
  assert(!html.includes('<span class="unsafe-link"'));
  assert(!html.includes('<link rel="stylesheet"'));
  assert(!html.includes("Markdown 原文"));

  const data = JSON.parse(await fs.readFile(path.join(outDir, "data/2026/05/2026-05-15.json"), "utf8"));
  assert.equal(data.main_items[0].importance, "major");
  assert.equal(data.model_releases[0].importance, "major");
  assert.equal(data.hot_blogs[0].importance, "notable");
  assert.equal(data.model_releases.length, 1);
  assert.equal(data.hot_blogs.length, 1);

  const feed = JSON.parse(await fs.readFile(path.join(outDir, "feed.json"), "utf8"));
  assert.equal(feed.reports[0].markdown_url, undefined);
});

test("buildSite writes trend index and injects scoped trend tags without mutating report data", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-trend-build-"));
  const dataInputDir = path.join(tmp, "reports-data");
  const outDir = path.join(tmp, "docs");
  await fs.mkdir(dataInputDir, { recursive: true });
  const base = JSON.parse(await readFixture("reports/good/structured-report.json"));
  const reports = [
    structuredTrendReport(base, "2026-05-25", {
      main: "OpenAI Codex pushed coding agent workflows toward eval harnesses.",
      github: "example/coding-agent-memory brings memory to coding agents.",
      project: "MCP tools for coding agent workflows.",
      builder: "Builder note about coding agent harness practice."
    }),
    structuredTrendReport(base, "2026-05-26", {
      main: "GitHub Copilot added coding agent workflow controls.",
      github: "example/eval-harness improves coding agent evaluation."
    }),
    structuredTrendReport(base, "2026-05-27", {
      main: "Anthropic described Claude Code as a coding agent surface.",
      builder: "Builder thread on coding agent memory and eval loops."
    }),
    structuredTrendReport(base, "2026-05-29", {
      main: "OpenAI Codex and Claude Code made coding agent deployment more explicit.",
      github: "example/codex-agent is a coding agent harness project.",
      project: "A project-only coding agent mention should count but not be annotated.",
      hotBlog: "A blog about coding agent eval harnesses."
    })
  ];
  for (const report of reports) {
    await fs.writeFile(path.join(dataInputDir, `${report.report_date}.json`), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }

  const result = await buildSite({
    rootDir: tmp,
    inputDir: path.join(tmp, "reports-source"),
    dataInputDir,
    outDir,
    siteUrl,
    generatedAt: fixedGeneratedAt,
    trendConfigPath
  });

  assert(result.writtenFiles.includes("trends.json"));
  const trends = JSON.parse(await fs.readFile(path.join(outDir, "trends.json"), "utf8"));
  assert.equal(validateTrends(trends).valid, true);
  assert.equal(trends.topics.find((topic) => topic.id === "coding-agent").status, "hot");

  const html = await fs.readFile(path.join(outDir, "reports/2026/05/2026-05-29.html"), "utf8");
  assert(html.includes("coding agent: 7d"));
  assert(html.includes("日报导航"));

  const indexHtml = await fs.readFile(path.join(outDir, "index.html"), "utf8");
  assert(indexHtml.includes("近 7 日趋势"));
  assert(indexHtml.includes("按年月周导航"));
  assert(indexHtml.includes("coding agent"));

  const data = JSON.parse(await fs.readFile(path.join(outDir, "data/2026/05/2026-05-29.json"), "utf8"));
  assert.equal(data.annotations_by_date, undefined);
  assert.equal(data.trends, undefined);
});

test("旧结构化 JSON 缺少模型发布和热门博客字段时仍可 build", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-legacy-json-build-"));
  const dataInputDir = path.join(tmp, "reports-data");
  const outDir = path.join(tmp, "docs");
  await fs.mkdir(dataInputDir, { recursive: true });
  const legacyReport = JSON.parse(await readFixture("reports/good/structured-report.json"));
  delete legacyReport.model_releases;
  delete legacyReport.hot_blogs;
  await fs.writeFile(path.join(dataInputDir, "legacy-structured-report.json"), `${JSON.stringify(legacyReport, null, 2)}\n`, "utf8");

  const result = await buildSite({
    rootDir: tmp,
    inputDir: path.join(tmp, "reports-source"),
    dataInputDir,
    outDir,
    siteUrl,
    generatedAt: fixedGeneratedAt,
    trendConfigPath
  });

  assert.deepEqual(result.reports[0].model_releases, []);
  assert.deepEqual(result.reports[0].hot_blogs, []);

  const data = JSON.parse(await fs.readFile(path.join(outDir, "data/2026/05/2026-05-15.json"), "utf8"));
  assert.deepEqual(data.model_releases, []);
  assert.deepEqual(data.hot_blogs, []);

  const html = await fs.readFile(path.join(outDir, "reports/2026/05/2026-05-15.html"), "utf8");
  assert(!html.includes('id="model-releases"'));
  assert(!html.includes('id="hot-blogs"'));
});

test("report:write 标准化结构化草稿并写入 reports-data", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-write-"));
  const draftPath = path.join(rootDir, "tests/fixtures/reports/good/structured-draft.json");
  const candidatePoolPath = path.join(rootDir, "tests/fixtures/reports/good/structured-draft.candidates.json");
  const result = await writeReportDraft({
    rootDir: tmp,
    inputPath: draftPath,
    outputDir: "reports-data",
    candidatePoolPath,
    siteUrl,
    generatedAt: fixedGeneratedAt
  });

  assert.equal(result.report.report_date, "2026-05-16");
  assert.equal(result.report.html_path, "reports/2026/05/2026-05-16.html");
  assert.equal(result.report.publish_status.repo_pushed, false);
  assert.equal(result.report.candidate_pool_path, "data/2026/05/2026-05-16.candidates.json");
  assert.equal(result.report.main_items[0].candidate_id, "main-report-write");
  assert.equal(result.report.main_items[0].importance, "major");
  assert.deepEqual(result.report.model_releases, []);
  assert.deepEqual(result.report.hot_blogs, []);
  assert.equal(result.report.quality_status.status, "ok");
  assert.equal(result.report.source_audit.github_trending.checked, true);
  assert.equal(result.report.source_audit.builder_sources.checked, true);
  assert.equal(result.report.self_check.automation_revision.schema_version, 1);
  assert.equal(result.path, path.join(tmp, "reports-data", "2026", "05", "2026-05-16.json"));
  assert.equal(result.candidatePoolPath, path.join(tmp, "reports-data", "2026", "05", "2026-05-16.candidates.json"));
  assert.equal(await exists(result.path), true);
  assert.equal(await exists(result.candidatePoolPath), true);
});

test("report:write importance labels are schema-validated and rendered", async () => {
  const draft = JSON.parse(await readFixture("reports/good/structured-draft.json"));
  const candidatePool = JSON.parse(await readFixture("reports/good/structured-draft.candidates.json"));
  const report = normalizeReportDraft(draft, {
    siteUrl,
    generatedAt: fixedGeneratedAt,
    candidatePool
  });

  assert.equal(report.main_items[0].importance, "major");

  const validation = validateReport(report);
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));

  const invalid = structuredClone(report);
  invalid.main_items[0].importance = "urgent";
  const invalidValidation = validateReport(invalid);
  assert.equal(invalidValidation.valid, false);
  assert(invalidValidation.errors.some((error) => error.path.includes("/main_items/0/importance")));

  const html = renderReportHtml(report);
  assert(html.includes(">重大<"));

  const interaction = reportToInteractionInput(report);
  assert(interaction.sections.some((section) => String(section.content || "").includes("==重大==")));
});

test("report:write records automation revision fingerprint in self_check", async () => {
  const draft = JSON.parse(await readFixture("reports/good/structured-draft.json"));
  const candidatePool = JSON.parse(await readFixture("reports/good/structured-draft.candidates.json"));
  const automationRevision = {
    schema_version: 1,
    git_commit: "abcdef1234567890abcdef1234567890abcdef12",
    git_commit_short: "abcdef123456",
    git_branch: "codex/test",
    prompt_manifest: "prompts/ai-daily/manifest.json",
    prompt_modules: ["fixed-source-checklist.md"],
    source_registry_count: 63,
    source_registry_enablement_counts: { core: 28, optional: 32, manual: 3 },
    rules: ["fixed_source_checklist"]
  };

  const report = normalizeReportDraft(draft, {
    siteUrl,
    generatedAt: fixedGeneratedAt,
    candidatePool,
    automationRevision
  });

  assert.deepEqual(report.self_check.automation_revision, automationRevision);
});

test("automation revision reads git, prompt manifest, and source registry state", async () => {
  const revision = await buildAutomationRevision({ rootDir });

  assert.equal(revision.schema_version, 1);
  assert.match(revision.git_commit_short, /^[0-9a-f]{7,12}$/);
  assert.equal(revision.prompt_manifest, "prompts/ai-daily/manifest.json");
  assert(revision.prompt_modules.includes("fixed-source-checklist.md"));
  assert(revision.source_registry_count >= 63);
  assert(revision.rules.includes("fixed_source_checklist"));
});

test("report:write derives degraded quality status for blocked content discovery", async () => {
  const draft = JSON.parse(await readFixture("reports/good/structured-draft.json"));
  const candidatePool = JSON.parse(await readFixture("reports/good/structured-draft.candidates.json"));
  draft.source_audit.content_sources.sources = [
    {
      name: "Content Sources",
      url: "https://example.com/content-feed.xml",
      status: "blocked",
      notes: "fetch failed"
    }
  ];
  draft.source_audit.content_sources.blocked_reason = "node_fetch_failed_for_registered_feeds";
  draft.source_audit.content_sources.candidates_found = 0;
  draft.source_audit.content_sources.included = 0;

  const report = normalizeReportDraft(draft, {
    siteUrl,
    generatedAt: fixedGeneratedAt,
    candidatePool
  });

  assert.equal(report.quality_status.status, "degraded");
  assert(report.quality_status.reasons.includes("content_sources_blocked"));
  assert(report.quality_status.affected_sections.includes("hot_blogs"));
  assert.match(report.quality_status.public_note, /Content source/);
});

test("report:write keeps low-signal checked sources out of degraded status", async () => {
  const draft = JSON.parse(await readFixture("reports/good/structured-draft.json"));
  const candidatePool = JSON.parse(await readFixture("reports/good/structured-draft.candidates.json"));
  draft.source_audit.content_sources.candidates_found = 0;
  draft.source_audit.content_sources.included = 0;
  draft.source_audit.content_sources.sources[0].status = "no_signal";
  draft.source_audit.content_sources.sources[0].notes = "0 recent entries parsed";

  const report = normalizeReportDraft(draft, {
    siteUrl,
    generatedAt: fixedGeneratedAt,
    candidatePool
  });

  assert.equal(report.quality_status.status, "ok");
  assert(report.quality_status.reasons.includes("low_signal"));
  assert(!report.quality_status.reasons.includes("content_sources_blocked"));
});

test("report:write flags selection degradation when candidate pool has enough unused candidates", async () => {
  const draft = JSON.parse(await readFixture("reports/good/structured-draft.json"));
  const candidatePool = JSON.parse(await readFixture("reports/good/structured-draft.candidates.json"));
  draft.source_audit.content_sources.candidates_found = 3;
  draft.source_audit.content_sources.included = 0;
  candidatePool.sources.push({
    id: "content-hot-blog-source",
    name: "Content Blog Source",
    url: "https://example.com/blog-feed.xml",
    category: "blog",
    status: "checked"
  });
  for (const index of [1, 2, 3]) {
    candidatePool.candidates.push({
      id: `hot-blog-unused-${index}`,
      source_id: "content-hot-blog-source",
      category: "hot_blog",
      title: `Unused hot blog ${index}`,
      url: `https://example.com/blog-${index}`,
      source: "Content Blog Source",
      event_date: "2026-05-16",
      status: "excluded",
      evidence: "fixture"
    });
  }

  const report = normalizeReportDraft(draft, {
    siteUrl,
    generatedAt: fixedGeneratedAt,
    candidatePool
  });

  assert.equal(report.quality_status.status, "degraded");
  assert(report.quality_status.reasons.includes("hot_blogs_selection_degraded"));
  assert(report.quality_status.affected_sections.includes("hot_blogs"));
});

test("report:write 缺少候选池时停止", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-write-missing-candidates-"));
  const draftPath = path.join(rootDir, "tests/fixtures/reports/good/structured-draft.json");

  await assert.rejects(
    () =>
      writeReportDraft({
        rootDir: tmp,
        inputPath: draftPath,
        outputDir: "reports-data",
        siteUrl,
        generatedAt: fixedGeneratedAt
      }),
    (error) => error instanceof PublisherError && error.code === "candidate_pool_missing"
  );
});

test("report:write 要求结构化草稿记录完整固定发现面审计", async () => {
  const draft = JSON.parse(await readFixture("reports/good/structured-draft.json"));
  delete draft.source_audit;

  assertPublisherCode(
    () =>
      normalizeReportDraft(draft, {
        siteUrl,
        generatedAt: fixedGeneratedAt
      }),
    "source_audit_missing"
  );

  const incompleteDraft = JSON.parse(await readFixture("reports/good/structured-draft.json"));
  delete incompleteDraft.source_audit.search_sources;
  assertPublisherCode(
    () =>
      normalizeReportDraft(incompleteDraft, {
        siteUrl,
        generatedAt: fixedGeneratedAt
      }),
    "source_audit_incomplete"
  );
});

test("report:write rejects source audit groups whose included count exceeds candidates found", async () => {
  const draft = JSON.parse(await readFixture("reports/good/structured-draft.json"));
  const candidatePool = JSON.parse(await readFixture("reports/good/structured-draft.candidates.json"));
  draft.source_audit.content_sources.candidates_found = 1;
  draft.source_audit.content_sources.included = 2;

  assertPublisherCode(
    () =>
      normalizeReportDraft(draft, {
        siteUrl,
        generatedAt: fixedGeneratedAt,
        candidatePool
      }),
    "source_audit_count_inconsistent"
  );
});

test("report:write rejects expanded main items without highlight markers or enough detail", async () => {
  const draft = JSON.parse(await readFixture("reports/good/structured-draft.json"));
  const candidatePool = JSON.parse(await readFixture("reports/good/structured-draft.candidates.json"));
  const baseItem = draft.main_items[0];
  const baseCandidate = candidatePool.candidates[0];

  draft.main_items = Array.from({ length: 10 }, (_unused, index) => {
    const id = `main-format-${index + 1}`;
    const url = `https://example.com/main-format-${index + 1}`;
    return {
      ...baseItem,
      candidate_id: id,
      title: `${baseItem.title} ${index + 1}`,
      url,
      bullets: [
        `**Fixture ${index + 1}** describes an important AI industry update.`,
        "It keeps a second factual point but deliberately omits highlight markers."
      ]
    };
  });
  candidatePool.candidates = draft.main_items.map((item, index) => ({
    ...baseCandidate,
    id: item.candidate_id,
    title: item.title,
    url: item.url,
    event_date: item.event_date,
    evidence: `fixture ${index + 1}`
  }));
  draft.evidence_assets = [];

  assertPublisherCode(
    () =>
      normalizeReportDraft(draft, {
        siteUrl,
        generatedAt: fixedGeneratedAt,
        candidatePool
      }),
    "main_items_format_weak"
  );
});

test("report:write blocks thin main_items when enough main candidates exist", async () => {
  const draft = JSON.parse(await readFixture("reports/good/structured-draft.json"));
  const candidatePool = JSON.parse(await readFixture("reports/good/structured-draft.candidates.json"));
  const baseCandidate = candidatePool.candidates[0];

  for (let index = 2; index <= 8; index += 1) {
    candidatePool.candidates.push({
      ...baseCandidate,
      id: `main-unused-${index}`,
      title: `Unused main candidate ${index}`,
      url: `https://example.com/main-unused-${index}`,
      status: "excluded",
      included_in: ""
    });
  }

  assertPublisherCode(
    () =>
      normalizeReportDraft(draft, {
        siteUrl,
        generatedAt: fixedGeneratedAt,
        candidatePool
      }),
    "main_items_coverage_gate_failed"
  );
});

test("report:write blocks low content unit density when enough candidates exist", async () => {
  const draft = JSON.parse(await readFixture("reports/good/structured-draft.json"));
  const candidatePool = JSON.parse(await readFixture("reports/good/structured-draft.candidates.json"));
  const baseCandidate = candidatePool.candidates[0];

  for (let index = 1; index <= 17; index += 1) {
    candidatePool.candidates.push({
      ...baseCandidate,
      id: `project-unused-${index}`,
      category: "project",
      title: `Unused project candidate ${index}`,
      url: `https://example.com/project-unused-${index}`,
      status: "excluded",
      included_in: ""
    });
  }

  assertPublisherCode(
    () =>
      normalizeReportDraft(draft, {
        siteUrl,
        generatedAt: fixedGeneratedAt,
        candidatePool
      }),
    "content_units_coverage_gate_failed"
  );
});

test("report:write 拒绝结构化草稿中的泛化套话", async () => {
  const draft = JSON.parse(await readFixture("reports/good/structured-draft.json"));
  draft.summary = "今天的高信号更新集中在 agent 工具链。";

  assert.deepEqual(findPlainLanguageIssues(draft).map((item) => item.phrase), ["高信号"]);
  assertPublisherCode(
    () =>
      normalizeReportDraft(draft, {
        siteUrl,
        generatedAt: fixedGeneratedAt
      }),
    "plain_language_failed"
  );
});

test("report:write 要求入选条目回指候选池", async () => {
  const draft = JSON.parse(await readFixture("reports/good/structured-draft.json"));
  const candidatePool = JSON.parse(await readFixture("reports/good/structured-draft.candidates.json"));
  draft.main_items[0].candidate_id = "missing-candidate";

  assertPublisherCode(
    () =>
      normalizeReportDraft(draft, {
        siteUrl,
        generatedAt: fixedGeneratedAt,
        candidatePool
      }),
    "candidate_pool_reference_invalid"
  );
});

test("report:write 拒绝未回到一手来源的中介候选进入事实栏目", async () => {
  const draft = JSON.parse(await readFixture("reports/good/structured-draft.json"));
  const candidatePool = JSON.parse(await readFixture("reports/good/structured-draft.candidates.json"));
  candidatePool.candidates[0].verification_status = "intermediary_only";
  candidatePool.candidates[0].intermediary_url = candidatePool.candidates[0].url;
  candidatePool.candidates[0].verification_sources = [];

  assertPublisherCode(
    () =>
      normalizeReportDraft(draft, {
        siteUrl,
        generatedAt: fixedGeneratedAt,
        candidatePool
      }),
    "candidate_pool_reference_invalid"
  );

  candidatePool.candidates[0].verification_status = "primary_confirmed";
  candidatePool.candidates[0].primary_url = candidatePool.candidates[0].url;
  candidatePool.candidates[0].verification_sources = [candidatePool.candidates[0].url];
  const report = normalizeReportDraft(draft, {
    siteUrl,
    generatedAt: fixedGeneratedAt,
    candidatePool
  });
  assert.equal(report.main_items[0].candidate_id, candidatePool.candidates[0].id);
});

test("report:write 拒绝缺少原始 X status 的 Builder 观察", async () => {
  const draft = JSON.parse(await readFixture("reports/good/structured-draft.json"));
  const candidatePool = JSON.parse(await readFixture("reports/good/structured-draft.candidates.json"));
  draft.source_audit.builder_sources.sources = [
    {
      name: "follow-builders X feed",
      url: "https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-x.json",
      status: "blocked",
      notes: "upstream_error=X API: User lookup failed: HTTP 500"
    },
    {
      name: "Tavily X builder search fallback",
      url: "https://api.tavily.com/search",
      status: "skipped_missing_token",
      notes: "skipped_missing_token"
    }
  ];
  draft.builder_observations = [
    {
      candidate_id: "builder-non-x",
      author: "Example Builder",
      role: "maintainer",
      content: "只来自博客的 builder 观察不能顶替 X status。",
      url: "https://example.com/builder-post",
      event_date: "2026-05-16",
      source: "Example Blog"
    }
  ];
  candidatePool.sources.push({
    id: "builder-blog-source",
    name: "Example Blog",
    url: "https://example.com/builder-post",
    category: "builder",
    status: "checked"
  });
  candidatePool.candidates.push({
    id: "builder-non-x",
    source_id: "builder-blog-source",
    category: "builder_observation",
    title: "Example Builder blog post",
    url: "https://example.com/builder-post",
    source: "Example Blog",
    event_date: "2026-05-16",
    status: "included",
    included_in: "builder_observations",
    evidence: "fixture"
  });

  assertPublisherCode(
    () =>
      normalizeReportDraft(draft, {
        siteUrl,
        generatedAt: fixedGeneratedAt,
        candidatePool
      }),
    "builder_x_observation_missing"
  );
});

test("report:write rejects forced manual evidence tables across most main items", async () => {
  const draft = JSON.parse(await readFixture("reports/good/structured-draft.json"));
  const candidatePool = JSON.parse(await readFixture("reports/good/structured-draft.candidates.json"));
  const baseItem = draft.main_items[0];
  const baseCandidate = candidatePool.candidates[0];

  draft.main_items = Array.from({ length: 10 }, (_unused, index) => {
    const id = `main-report-write-${index + 1}`;
    const url = `https://example.com/report-write-${index + 1}`;
    return {
      ...baseItem,
      candidate_id: id,
      title: `${baseItem.title} ${index + 1}`,
      url,
      bullets: [`**Fixture ${index + 1}** keeps the item specific enough for the schema.`]
    };
  });
  candidatePool.candidates = draft.main_items.map((item, index) => ({
    ...baseCandidate,
    id: item.candidate_id,
    title: item.title,
    url: item.url,
    event_date: item.event_date,
    evidence: `fixture ${index + 1}`
  }));
  draft.evidence_assets = draft.main_items.slice(0, 8).map((item, index) => ({
    type: "table",
    title: `Fixture table ${index + 1}`,
    source_url: item.url,
    caption: "A forced table should not be used as visual coverage.",
    extraction_status: "manual_table",
    data: [
      ["Field", "Value"],
      ["Index", String(index + 1)]
    ]
  }));

  assertPublisherCode(
    () =>
      normalizeReportDraft(draft, {
        siteUrl,
        generatedAt: fixedGeneratedAt,
        candidatePool
      }),
    "evidence_assets_overpadded"
  );
});

test("report:write blocks publishable drafts when blocked Builder sources stay below minimum", async () => {
  const draft = JSON.parse(await readFixture("reports/good/structured-draft.json"));
  const candidatePool = JSON.parse(await readFixture("reports/good/structured-draft.candidates.json"));
  draft.source_audit.builder_sources.sources = [
    {
      name: "follow-builders X feed",
      url: "https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-x.json",
      status: "blocked",
      notes: "retry_failed_after_1"
    }
  ];
  draft.source_audit.builder_sources.blocked_reason = "x_feed_failed";
  draft.source_audit.builder_sources.candidates_found = 2;
  draft.source_audit.builder_sources.included = 2;
  draft.builder_observations = [
    builderObservationFixture("builder-x-1", "https://x.com/example/status/2059000000000000000", "Example X"),
    builderObservationFixture("builder-blog-1", "https://example.com/builder-post", "Example Blog")
  ];
  candidatePool.sources.push(
    builderSourceFixture("builder-x-source", "Example X", "https://x.com/example/status/2059000000000000000"),
    builderSourceFixture("builder-blog-source", "Example Blog", "https://example.com/builder-post")
  );
  candidatePool.candidates.push(
    builderCandidateFixture("builder-x-1", "builder-x-source", "https://x.com/example/status/2059000000000000000", "Example X"),
    builderCandidateFixture("builder-blog-1", "builder-blog-source", "https://example.com/builder-post", "Example Blog")
  );

  assertPublisherCode(
    () =>
      normalizeReportDraft(draft, {
        siteUrl,
        generatedAt: fixedGeneratedAt,
        candidatePool
      }),
    "builder_coverage_gate_failed"
  );
});

test("report:write 拒绝同一 URL 在 main/model/blog 中重复包装", async () => {
  const draft = JSON.parse(await readFixture("reports/good/structured-draft.json"));
  const candidatePool = JSON.parse(await readFixture("reports/good/structured-draft.candidates.json"));
  draft.model_releases = [
    {
      candidate_id: "model-report-write",
      name: "Report Write Model",
      provider: "Example AI",
      availability: "closed_api",
      release_scope: "provider_official_launch",
      event_date: "2026-05-16",
      url: "https://example.com/report-write",
      source: "Report Write Source",
      summary: "同一 URL 不能被包装成模型发布。",
      notes: "fixture"
    }
  ];
  candidatePool.candidates.push({
    id: "model-report-write",
    source_id: "source-report-write",
    category: "model_release",
    title: "Report Write Model",
    url: "https://example.com/report-write",
    source: "Report Write Source",
    event_date: "2026-05-16",
    status: "included",
    included_in: "model_releases",
    evidence: "fixture"
  });

  const report = normalizeReportDraft(draft, {
    siteUrl,
    generatedAt: fixedGeneratedAt,
    candidatePool
  });
  const issues = findFreshnessIssues(report);
  assert.equal(issues.length, 0);

  const repeatedMain = structuredClone(report);
  repeatedMain.main_items.push({
    ...repeatedMain.main_items[0],
    candidate_id: "main-report-write-repeat"
  });
  assert.equal(findFreshnessIssues(repeatedMain)[0].code, "same_report_duplicate_url");

  const repeatedModel = structuredClone(report);
  repeatedModel.model_releases.push({
    ...repeatedModel.model_releases[0],
    candidate_id: "model-report-write-repeat"
  });
  assert.equal(findFreshnessIssues(repeatedModel)[0].code, "same_report_duplicate_url");

  report.hot_blogs = [
    {
      candidate_id: "blog-report-write",
      title: "Report Write Blog",
      url: "https://example.com/report-write",
      publisher: "Example Blog",
      author: "Example Author",
      event_date: "2026-05-16",
      topic: "report write",
      summary: "Duplicate blog fixture."
    }
  ];
  assert.equal(findFreshnessIssues(report)[0].code, "same_report_duplicate_url");
});

test("report:write 拒绝最近 7 天已出现 URL 再进主体信息", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-history-duplicate-"));
  const draftPath = path.join(rootDir, "tests/fixtures/reports/good/structured-draft.json");
  const candidatePoolPath = path.join(rootDir, "tests/fixtures/reports/good/structured-draft.candidates.json");
  const priorDir = path.join(tmp, "reports-data", "2026", "05");
  await fs.mkdir(priorDir, { recursive: true });
  await fs.writeFile(
    path.join(priorDir, "2026-05-15.json"),
    `${JSON.stringify({
      report_date: "2026-05-15",
      main_items: [{ url: "https://example.com/report-write" }]
    })}\n`,
    "utf8"
  );

  await assert.rejects(
    () =>
      writeReportDraft({
        rootDir: tmp,
        inputPath: draftPath,
        outputDir: "reports-data",
        candidatePoolPath,
        siteUrl,
        generatedAt: fixedGeneratedAt
      }),
    (error) => error instanceof PublisherError && error.code === "freshness_gate_failed"
  );
});

test("report:write 拒绝 48 小时外条目进入主体信息或摘要", async () => {
  const draft = JSON.parse(await readFixture("reports/good/structured-draft.json"));
  const candidatePool = JSON.parse(await readFixture("reports/good/structured-draft.candidates.json"));
  draft.summary = "这条 2026-05-10 旧内容不能进入摘要。";
  draft.main_items[0].event_date = "2026-05-10";
  candidatePool.candidates[0].event_date = "2026-05-10";

  const report = normalizeReportDraft(draft, {
    siteUrl,
    generatedAt: fixedGeneratedAt,
    candidatePool
  });
  const codes = findFreshnessIssues(report).map((issue) => issue.code);
  assert(codes.includes("old_main_item"));
  assert(codes.includes("old_date_in_summary"));
});

test("report:write 限制 48 小时外补充内容数量", async () => {
  const draft = JSON.parse(await readFixture("reports/good/structured-draft.json"));
  const candidatePool = JSON.parse(await readFixture("reports/good/structured-draft.candidates.json"));
  candidatePool.candidates.push(
    {
      id: "community-old-1",
      source_id: "source-report-write",
      category: "community_lead",
      title: "old lead 1",
      url: "https://example.com/old-lead-1",
      source: "Example",
      event_date: "2026-05-10",
      status: "included",
      included_in: "community_leads",
      evidence: "fixture"
    },
    {
      id: "community-old-2",
      source_id: "source-report-write",
      category: "community_lead",
      title: "old lead 2",
      url: "https://example.com/old-lead-2",
      source: "Example",
      event_date: "2026-05-11",
      status: "included",
      included_in: "community_leads",
      evidence: "fixture"
    }
  );

  const report = normalizeReportDraft(draft, {
    siteUrl,
    generatedAt: fixedGeneratedAt,
    candidatePool
  });
  const codes = findFreshnessIssues(report, [], candidatePool).map((issue) => issue.code);
  assert(codes.includes("too_many_old_background_items"));
});

test("report draft 缺少内容 required fields 时失败，不猜测", () => {
  assertPublisherCode(
    () =>
      normalizeReportDraft(
        {
          report_date: "2026-05-16",
          title: "缺少 summary",
          main_items: [],
          self_check: {
            report_date: "2026-05-16",
            main_items: 0,
            builder_observations: 0,
            primary_links: true,
            no_banned_words: true,
            no_unsourced_numbers: true,
            notes: ""
          }
        },
        { siteUrl, generatedAt: fixedGeneratedAt }
      ),
    "schema_validation_failed"
  );
});

test("prompt:build 组装 repo 内分模块提示词", async () => {
  const prompt = await assemblePrompt({
    rootDir,
    reportDate: "2026-05-15",
    generatedAt: fixedGeneratedAt
  });

  assert(prompt.includes("最终发布产物是自包含、可读性好的静态 HTML，不是 Markdown"));
  assert(prompt.includes(".codex/skills/effective-interact"));
  assert(prompt.includes('renderMode: "pre-rendered"'));
  assert(prompt.includes("定时任务假定已经在本仓库根目录启动"));
  assert(prompt.includes("反思与迭代建议"));
  assert(prompt.includes("去套话检查"));
  assert(prompt.includes("plain_language_failed"));
  assert(prompt.includes("候选池"));
  assert(prompt.includes("candidate_id"));
  assert(prompt.includes("真实发布后必须验证当日 GitHub Pages URL 返回 HTTP 200"));
  assert(prompt.includes("反思与自动化迭代建议"));
  assert(prompt.includes("GitHub Trending"));
  assert(prompt.includes("github_trending"));
  assert(prompt.includes("排名变化"));
  assert(prompt.includes("npm run discover:github-trending"));
  assert(prompt.includes("--browser-export"));
  assert(prompt.includes("npm run discover:builders"));
  assert(prompt.includes("npm run discover:content-sources"));
  assert(prompt.includes("npm run sources:validate"));
  assert(prompt.includes("npm run discover:search-news"));
  assert(prompt.includes("npm run sources:health"));
  assert(prompt.includes("npm run sources:audit-merge"));
  assert(prompt.includes("npm run sources:phase5-audit"));
  assert(prompt.includes("npm run discover:statuspage-incidents"));
  assert(prompt.includes("轻量运营"));
  assert(prompt.includes("pricing_quota_cost_items"));
  assert(prompt.includes("source_level"));
  assert(prompt.includes("wechat_industry_whitelist"));
  assert(prompt.includes("release_scope"));
  assert(prompt.includes("follow-builders"));
  assert(prompt.includes("source_audit"));
  assert(prompt.includes("builder_sources"));
  assert(prompt.includes("blocked_reason"));
  assert(prompt.includes("last_successful_feed_at"));
  assert(prompt.includes("hero_highlights"));
  assert(prompt.includes("300-500"));
  assert(prompt.includes("follow-builders central feed"));
  assert(prompt.includes("Product Hunt"));
  assert(prompt.includes("Product Hunt Trending"));
  assert(prompt.includes("TechCrunch AI"));
  assert(prompt.includes("TechCrunch AI/Enterprise"));
  assert(prompt.includes("ML Papers of the Week"));
  assert(prompt.includes("HelloGitHub"));
  assert(prompt.includes("RuanYF Weekly"));
  assert(prompt.includes("OpenAI Blog RSS"));
  assert(prompt.includes("Google DeepMind RSS"));
  assert(prompt.includes("MIT Technology Review"));
  assert(prompt.includes("VentureBeat AI"));
  assert(prompt.includes("Jiqizhixin"));
  assert(prompt.includes("QbitAI"));
  assert(prompt.includes("36Kr"));
  assert(prompt.includes("InfoQ CN"));
  assert(prompt.includes("arXiv cs.AI"));
  assert(prompt.includes("Hacker News Topstories API"));
  assert(prompt.includes("Hugging Face Daily Papers"));
  assert(prompt.includes("Papers with Code API"));
  assert(prompt.includes("Reddit r/MachineLearning"));
  assert(prompt.includes("Smol AI News"));
  assert(prompt.includes("AI News Archive"));
  assert(prompt.includes("Ben's Bites"));
  assert(prompt.includes("Big-company moves"));
  assert(prompt.includes("Models and papers"));
  assert(prompt.includes("Products and tools"));
  assert(prompt.includes("Industry and funding"));
  assert(prompt.includes("Open-source projects"));
  assert(prompt.includes("Opinions and long-form reads"));
  assert(prompt.includes("importance"));
  assert(prompt.includes("major"));
  assert(prompt.includes("notable"));
  assert(prompt.includes("general"));
  assert(prompt.includes("重大"));
  assert(prompt.includes("值得关注"));
  assert(prompt.includes("一般"));
  assert(prompt.includes("大厂动态"));
  assert(prompt.includes("行业趋势"));
  assert(prompt.includes("公众号"));
  assert(prompt.includes("自媒体"));
  assert(prompt.includes("小宇宙"));
  assert(prompt.includes("喜马拉雅"));
  assert(prompt.includes("RSSHub"));
  assert(prompt.includes("twscrape"));
  assert(prompt.includes("--per-source-limit"));
  assert(prompt.includes("热点讨论"));
  assert(prompt.includes("融资"));
  assert(prompt.includes("领域"));
  assert(prompt.includes("作用"));
  assert(prompt.includes("空数组对应板块不要渲染"));
  assert(prompt.includes("2026-05-15"));
});

async function readFixture(relativePath) {
  return fs.readFile(path.join(rootDir, "tests/fixtures", relativePath), "utf8");
}

test("report:write requires model releases to appear in main_items", async () => {
  const draft = JSON.parse(await readFixture("reports/good/structured-draft.json"));
  const candidatePool = JSON.parse(await readFixture("reports/good/structured-draft.candidates.json"));
  draft.model_releases = [
    {
      candidate_id: "model-missing-main",
      name: "Missing Main Model",
      provider: "Example AI",
      availability: "closed_api",
      release_scope: "provider_official_launch",
      event_date: "2026-05-16",
      url: "https://example.com/model-missing-main",
      source: "Example AI Model Card",
      summary: "Model release must also be represented in main_items.",
      notes: "fixture"
    }
  ];
  candidatePool.candidates.push({
    id: "model-missing-main",
    source_id: "source-report-write",
    category: "model_release",
    title: "Missing Main Model",
    url: "https://example.com/model-missing-main",
    source: "Example AI Model Card",
    event_date: "2026-05-16",
    status: "included",
    included_in: "model_releases",
    evidence: "fixture"
  });

  assertPublisherCode(
    () =>
      normalizeReportDraft(draft, {
        siteUrl,
        generatedAt: fixedGeneratedAt,
        candidatePool
      }),
    "model_releases_missing_main_item"
  );
});

function assertPublisherCode(fn, code) {
  try {
    fn();
  } catch (error) {
    assert(error instanceof PublisherError);
    assert.equal(error.code, code);
    return;
  }

  assert.fail(`expected PublisherError ${code}`);
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function sourceAuditFixture() {
  return {
    github_trending: {
      checked: true,
      sources: [
        {
          name: "GitHub Trending",
          url: "https://github.com/trending?since=daily",
          status: "checked",
          notes: "fixture"
        }
      ],
      candidates_found: 2,
      included: 1,
      notes: "fixture"
    },
    builder_sources: {
      checked: true,
      sources: [
        {
          name: "follow-builders central feed",
          url: "https://github.com/zarazhangrui/follow-builders",
          status: "checked",
          notes: "fixture"
        }
      ],
      candidates_found: 1,
      included: 1,
      notes: "fixture"
    },
    content_sources: {
      checked: true,
      sources: [
        {
          name: "Content Sources",
          url: "https://example.com/content-feed.xml",
          status: "checked",
          notes: "fixture"
        }
      ],
      candidates_found: 1,
      included: 1,
      notes: "fixture"
    },
    search_sources: {
      checked: true,
      shadow: true,
      sources: [
        {
          name: "OpenAlex",
          url: "https://api.openalex.org/works",
          status: "checked",
          notes: "fixture"
        }
      ],
      candidates_found: 1,
      included: 0,
      notes: "fixture"
    },
    sources_health: {
      checked: true,
      sources: [
        {
          name: "Source Health",
          url: "https://example.com/content-feed.xml",
          status: "checked",
          notes: "fixture"
        }
      ],
      candidates_found: 0,
      included: 0,
      notes: "fixture"
    }
  };
}

function builderObservationFixture(candidateId, url, source) {
  return {
    candidate_id: candidateId,
    author: "Example Builder",
    role: "builder",
    content: "Example Builder shared a concrete agent workflow observation.",
    url,
    event_date: "2026-05-16",
    source
  };
}

function builderSourceFixture(id, name, url) {
  return {
    id,
    name,
    url,
    category: "builder",
    status: "checked"
  };
}

function builderCandidateFixture(id, sourceId, url, source) {
  return {
    id,
    source_id: sourceId,
    category: "builder_observation",
    title: `${source} builder observation`,
    url,
    source,
    event_date: "2026-05-16",
    status: "included",
    included_in: "builder_observations",
    evidence: "fixture"
  };
}

function githubTrendingFixture() {
  return `
<article class="Box-row">
  <h2 class="h3 lh-condensed">
    <a href="/example/trending-agent">
      example / trending-agent
    </a>
  </h2>
  <p class="col-9 color-fg-muted my-1 pr-4">Agent workbench with a runnable demo.</p>
</article>
<article class="Box-row">
  <h2 class="h3 lh-condensed">
    <a href="/example/rag-eval">
      example / rag-eval
    </a>
  </h2>
  <p class="col-9 color-fg-muted my-1 pr-4">RAG eval toolkit.</p>
</article>`;
}

function builderAtomFixture() {
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>Agent notes from the field</title>
    <link href="https://example.com/builder-post" />
    <updated>2026-05-26T01:00:00Z</updated>
    <summary>Practical notes about shipping agent workflows.</summary>
  </entry>
</feed>`;
}

function followBuildersXFixture() {
  return {
    generatedAt: "2026-05-26T03:00:00Z",
    lookbackHours: 24,
    x: [
      {
        source: "x",
        name: "Swyx",
        handle: "swyx",
        bio: "AI engineer and Latent.Space co-host",
        tweets: [
          {
            id: "2059000000000000000",
            text: "The model alone is no longer the product; the harness, memory, eval loop, and workflow are the product surface now.",
            createdAt: "2026-05-26T02:00:00.000Z",
            url: "https://x.com/swyx/status/2059000000000000000",
            likes: 1200,
            retweets: 90,
            replies: 30,
            isQuote: false
          }
        ]
      }
    ]
  };
}

function contentSourceRssFixture() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <item>
      <title>How OpenAI engineers build coding agents</title>
      <link>https://example.com/interview</link>
      <pubDate>Tue, 26 May 2026 12:00:00 GMT</pubDate>
      <description>OpenAI engineer interview about harnesses, evals, and workflow design.</description>
    </item>
  </channel>
</rss>`;
}

function emptyRssFixture() {
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel></channel></rss>`;
}

function anthropicNewsHtmlFixture() {
  return `<!doctype html>
<main>
  <a href="/news/claude-code-internals">
    <h2>Inside Claude Code's agent harness</h2>
    <time>May 26, 2026</time>
    <p>Claude Code team explained how they isolate tools, replay evaluations, and keep coding agents observable.</p>
  </a>
</main>`;
}

function productHuntAtomFixture() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>Agent Debugger</title>
    <link rel="alternate" type="text/html" href="https://www.producthunt.com/products/agent-debugger" />
    <published>2026-05-26T08:00:00-07:00</published>
    <content type="html">&lt;p&gt;Debug and replay production AI agent incidents.&lt;/p&gt;</content>
  </entry>
</feed>`;
}

function productHuntAtomWithRedirectFixture() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>Agent Debugger</title>
    <link rel="alternate" type="text/html" href="https://www.producthunt.com/products/agent-debugger" />
    <published>2026-05-26T08:00:00-07:00</published>
    <content type="html">&lt;p&gt;Debug and replay production AI agent incidents.&lt;/p&gt;
      &lt;p&gt;&lt;a href="https://www.producthunt.com/products/agent-debugger"&gt;Discussion&lt;/a&gt; |
      &lt;a href="https://www.producthunt.com/r/p/123?app_id=339"&gt;Link&lt;/a&gt;&lt;/p&gt;</content>
  </entry>
</feed>`;
}

function productHuntProductPageFixture() {
  return `<!doctype html>
<main>
  <a href="https://help.producthunt.com/">Product Hunt Help</a>
  <a href="https://agentdebugger.dev">Website</a>
  <a href="https://github.com/acme/agent-debugger">GitHub</a>
</main>`;
}

function productHuntInternalOnlyPageFixture() {
  return `<!doctype html>
<main>
  <a href="https://help.producthunt.com/">Product Hunt Help</a>
  <a href="https://lu.ma/producthunt">Product Hunt Events</a>
  <a href="https://www.producthunt.com/discussions/agent-debugger">Discussion</a>
</main>`;
}

function productHuntLowQualityPageFixture() {
  return `<!doctype html>
<main>
  <a href="https://example.com/flutter-template">Website</a>
  <a href="https://circle.ci/demo">Demo video</a>
</main>`;
}

function githubProductReadmeFixture() {
  return `<!doctype html>
<head>
  <title>GitHub - acme/agent-debugger: Replay production AI agent incidents</title>
  <meta name="description" content="Replay production AI agent incidents, inspect tool traces, and compare model outputs.">
</head>
<article class="markdown-body">
  <p>Replay production AI agent incidents, inspect tool traces, and compare model outputs.</p>
  <a href="https://agentdebugger.dev/docs">Docs</a>
</article>`;
}

function statuspageAtomFixture() {
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>Elevated error rates on Opus 4.7</title>
    <link href="https://status.claude.com/incidents/abc123" />
    <updated>2026-05-26T02:00:00Z</updated>
    <content>Resolved after elevated API errors.</content>
  </entry>
</feed>`;
}

async function writePhase5Day(historyDir, reportDate, options = {}) {
  const [year, month] = reportDate.split("-");
  const dir = path.join(historyDir, year, month);
  await fs.mkdir(dir, { recursive: true });
  const sourceAudit = {
    github_trending: auditGroupFixture("GitHub Trending", 2, 1),
    builder_sources: auditGroupFixture("Builder", 1, 1),
    content_sources: auditGroupFixture("Content", 3, 0),
    ...(options.includeSearch ? { search_sources: auditGroupFixture("Search", 1, 0) } : {}),
    ...(options.includeHealth ? { sources_health: auditGroupFixture("Health", 3, 0) } : {})
  };
  await fs.writeFile(
    path.join(dir, `${reportDate}.json`),
    `${JSON.stringify({
      report_date: reportDate,
      source_audit: sourceAudit
    }, null, 2)}\n`,
    "utf8"
  );
  await fs.writeFile(
    path.join(dir, `${reportDate}.candidates.json`),
    `${JSON.stringify({
      schema_version: 1,
      report_date: reportDate,
      generated_at: `${reportDate}T00:00:00Z`,
      sources: [
        {
          id: "source-main",
          name: "Main Source",
          url: "https://example.com/source",
          category: "official_release",
          status: "checked"
        }
      ],
      candidates: [
        {
          id: "candidate-main",
          source_id: "source-main",
          category: "main_item",
          title: "Main Item",
          url: `https://example.com/${reportDate}`,
          source: "Main Source",
          event_date: reportDate,
          status: "included",
          included_in: "main_items",
          verification_status: options.candidateVerificationStatus || "primary_confirmed",
          verification_sources: [`https://example.com/${reportDate}`]
        }
      ]
    }, null, 2)}\n`,
    "utf8"
  );
}

function auditGroupFixture(name, candidatesFound, included) {
  return {
    checked: true,
    sources: [
      {
        name,
        url: "https://example.com/feed",
        status: "checked",
        notes: "fixture"
      }
    ],
    candidates_found: candidatesFound,
    included,
    notes: "fixture"
  };
}

function trendReport(reportDate, options = {}) {
  return {
    report_date: reportDate,
    main_items: [
      {
        title: options.main || "Main item",
        summary: options.main || "",
        bullets: [options.main || ""],
        entities: options.mainEntities || [],
        event_date: reportDate,
        url: `https://example.com/main/${reportDate}`,
        source: "Example",
        tier: "T0"
      }
    ],
    github_trending: options.github
      ? [
          {
            name: options.github,
            repo: "example/coding-agent",
            description: options.github,
            event_date: reportDate,
            url: `https://github.com/example/coding-agent-${reportDate}`,
            source: "GitHub Trending daily",
            rank: 1,
            trend: "new"
          }
        ]
      : [],
    projects: options.project
      ? [
          {
            name: "Project",
            description: options.project,
            url: `https://github.com/example/project-${reportDate}`
          }
        ]
      : [],
    builder_observations: options.builder
      ? [
          {
            author: "Builder",
            content: options.builder,
            url: `https://example.com/builder/${reportDate}`
          }
        ]
      : [],
    hot_blogs: options.hotBlog
      ? [
          {
            title: "Blog",
            publisher: "Example",
            author: "Author",
            event_date: reportDate,
            topic: "agents",
            summary: options.hotBlog,
            url: `https://example.com/blog/${reportDate}`
          }
        ]
      : [],
    model_releases: []
  };
}

function structuredTrendReport(base, reportDate, options = {}) {
  const report = structuredClone(base);
  const [year, month] = reportDate.split("-");
  report.report_date = reportDate;
  report.title = `AI 日报 ${reportDate}`;
  report.summary = options.main || `Trend fixture ${reportDate}`;
  report.canonical_url = `${siteUrl}reports/${year}/${month}/${reportDate}.html`;
  report.html_path = `reports/${year}/${month}/${reportDate}.html`;
  report.generated_at = fixedGeneratedAt;
  report.source_window = {
    date_from: reportDate,
    date_to: reportDate,
    fallback_window_used: false,
    notes: "fixture"
  };
  report.self_check.report_date = reportDate;
  report.main_items = [
    {
      title: options.main || "Main item",
      event_date: reportDate,
      url: `https://example.com/main/${reportDate}`,
      source: "Example",
      tier: "T0",
      entities: options.mainEntities || ["OpenAI", "Codex"],
      summary: options.main || "fixture",
      bullets: [options.main || "fixture"]
    }
  ];
  report.github_trending = options.github
    ? [
        {
          candidate_id: `trend-${reportDate}`,
          name: "example/coding-agent",
          repo: "example/coding-agent",
          description: options.github,
          url: `https://github.com/example/coding-agent-${reportDate}`,
          event_date: reportDate,
          source: "GitHub Trending daily",
          language: "TypeScript",
          window: "daily",
          rank: 1,
          previous_rank: null,
          rank_delta: null,
          trend: "new",
          evidence: "GitHub Trending daily rank #1."
        }
      ]
    : [];
  report.projects = options.project
    ? [
        {
          name: "Trend Project",
          description: options.project,
          url: `https://github.com/example/project-${reportDate}`,
          event_date: reportDate,
          source: "GitHub",
          signal: "trending",
          evidence: "fixture"
        }
      ]
    : [];
  report.builder_observations = options.builder
    ? [
        {
          author: "Builder",
          content: options.builder,
          url: `https://x.com/example/status/${reportDate.replaceAll("-", "")}`,
          event_date: reportDate,
          source: "follow-builders X feed",
          evidence: "fixture"
        }
      ]
    : [];
  report.hot_blogs = options.hotBlog
    ? [
        {
          title: "Trend Blog",
          url: `https://example.com/blog/${reportDate}`,
          publisher: "Example",
          author: "Author",
          event_date: reportDate,
          topic: "coding agent",
          summary: options.hotBlog
        }
      ]
    : [];
  report.model_releases = [];
  report.community_leads = [];
  report.self_check.main_items = report.main_items.length;
  report.self_check.builder_observations = report.builder_observations.length;
  delete report.candidate_pool_path;
  return report;
}

function normalizedSourceUrl(value) {
  const text = String(value || "").trim();
  try {
    const url = new URL(text);
    url.protocol = "https:";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    url.pathname = url.pathname.replace(/\/$/, "");
    return url.toString().replace(/\/$/, "");
  } catch {
    return text.toLowerCase().replace(/^http:/, "https:").replace(/\/$/, "");
  }
}

function textResponse(text, status = 200, finalUrl = "") {
  return {
    ok: status >= 200 && status < 300,
    status,
    url: finalUrl,
    text: async () => text
  };
}

function jsonResponse(value, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(value),
    json: async () => value
  };
}
