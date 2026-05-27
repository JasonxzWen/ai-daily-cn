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
  collectGitHubTrending,
  collectStatuspageIncidents,
  parseGitHubTrendingHtml
} from "../src/discovery.js";
import { renderReportHtml } from "../src/render.js";
import { reportToInteractionInput } from "../src/interaction-report.js";
import { mergeFeed, buildSite } from "../src/site.js";
import { validateFeed, validateReport } from "../src/schema.js";
import { assemblePrompt } from "../src/prompt.js";
import { normalizeReportDraft, writeReportDraft } from "../src/report.js";
import { findPlainLanguageIssues } from "../src/plain-language.js";
import { findFreshnessIssues } from "../src/quality-gates.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const fixedGeneratedAt = "2026-05-13T02:35:00+08:00";
const siteUrl = "https://jasonxzwen.github.io/ai-daily-cn/";

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

  const validation = validateReport(enriched);
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));

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
  assert(html.includes('id="source-audit"'));
  assert(html.includes("信源审计"));
  assert(html.includes("GitHub Trending"));
  assert(html.includes("Builder 原始源"));
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
  report.hero_highlights = [
    {
      title: "Agent harness 成为今日主线",
      url: "https://example.com/blog/harness-engineering",
      reason: "模型入口、项目趋势和工程博客都指向 harness 设计。"
    }
  ];
  report.model_releases[0].notes = "同时出现在多个平台；本轮只按官方来源记录可用性。";
  report.hot_blogs[0].summary = "这篇文章把长运行 agent 的 harness 拆成任务规划、上下文治理、工具执行、结果校验和恢复路径几层，重点不是再发明一个模型包装器，而是把每一步都变成可观测、可重放、可回滚的工程边界。作者用 coding agent 和研究代理的例子说明，真正影响稳定性的往往是文件系统隔离、权限提示、失败重试、上下文压缩和评估回放，而不是单次补全质量。对研发团队来说，它适合作为设计 agent 平台、评估 Claude Code/Codex 类工具、或制定内部自动化安全门时的术语和架构参考。";
  report.hot_blogs[0].why_it_matters = "旧字段保留兼容，但公开页面不再渲染。";
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
  const input = reportToInteractionInput(report);

  assert.equal(input.template, "research-explainer");
  assert.equal(input.renderMode, "pre-rendered");
  assert(input.summary.includes("Agent harness 成为今日主线"));
  assert(!input.summary.includes("其余条目见后文"));
  const mainlineSection = input.sections.find((section) => section.title === "主线摘要");
  assert(mainlineSection.content.includes("**Google I/O**"));
  assert(mainlineSection.content.includes("**模型入口**"));
  const hotBlogsSection = input.sections.find((section) => section.title === "热门技术博客");
  assert(hotBlogsSection.content.includes("这篇文章把长运行 agent 的 harness"));
  assert(!hotBlogsSection.content.includes("为什么重要"));
  const modelSection = input.sections.find((section) => section.title === "模型发布");
  assert(modelSection.content.includes("==多平台可见=="));
  assert(modelSection.content.includes("==官方可用性=="));
  assert(!modelSection.content.includes("备注："));
  const projectsSection = input.sections.find((section) => section.title === "今日值得关注的项目");
  assert(projectsSection.content.includes("==本周 +456 stars=="));
  assert(projectsSection.content.includes("领域：coding_agent、agent_memory"));
  assert(projectsSection.content.includes("作用：给 coding agent 提供跨会话持久记忆"));
  assert(!projectsSection.content.includes("信号："));
  assert(!projectsSection.content.includes("证据："));
  assert(!projectsSection.content.includes("GitHub Trending weekly 中出现"));
  assert.equal(input.intent.audience, "3-10 年经验的研发工程师与技术管理者");
  assert(input.sections.some((section) => section.title === "主体信息"));
  assert(input.sections.some((section) => section.title === "信源审计"));
  assert(input.sections.some((section) => typeof section.content === "string" && section.content.includes("结构化 JSON")));
  assert.equal(input.evidence, undefined);
});

test("effective-interact 输入不会渲染空的可选板块", async () => {
  const report = JSON.parse(await readFixture("reports/good/structured-report.json"));
  report.model_releases = [];
  report.hot_blogs = [];
  report.projects = [];
  report.builder_observations = [];
  report.community_leads = [];
  report.self_check.builder_observations = 0;

  const input = reportToInteractionInput(report);
  const titles = input.sections.map((section) => section.title);

  assert(!titles.includes("模型发布"));
  assert(!titles.includes("热门技术博客"));
  assert(!titles.includes("今日值得关注的项目"));
  assert(!titles.includes("Builder 观察与社区线索"));
  assert(!JSON.stringify(input).includes("暂无 Builder 观察"));
  assert(!JSON.stringify(input).includes("暂无社区线索"));
  assert(!JSON.stringify(input).includes("暂无热门技术博客"));
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
  assert.equal(candidates[0].description, "Agent workbench with a runnable demo.");

  const collected = await collectGitHubTrending({
    sources: [source],
    fetchImpl: async () => ({
      ok: true,
      text: async () => html
    })
  });

  assert.equal(collected.source_audit.github_trending.checked, true);
  assert.equal(collected.source_audit.github_trending.sources[0].status, "checked");
  assert.equal(collected.source_audit.github_trending.candidates_found, 2);
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

test("statuspage discovery parses Atom incidents into candidates", async () => {
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
  assert.equal(collected.candidates[0].category, "main_item");
  assert.equal(collected.candidates[0].source_id, "status-claude");
  assert.equal(collected.candidates[0].event_date, "2026-05-26");
  assert.equal(collected.candidates[0].url, "https://status.claude.com/incidents/abc123");
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
    generatedAt: fixedGeneratedAt
  });

  assert(result.writtenFiles.includes("reports/2026/05/2026-05-13.html"));
  assert(result.writtenFiles.includes("reports/2026/05/2026-05-13.md"));
  assert(result.writtenFiles.includes("data/2026/05/2026-05-13.json"));
  assert.equal(await exists(path.join(outDir, "index.html")), true);
  assert.equal(await exists(path.join(outDir, "feed.json")), true);
  assert.equal(await exists(path.join(outDir, "assets/style.css")), true);
});

test("结构化 JSON 输入可以直接生成自包含 HTML，不要求 Markdown", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-json-build-"));
  const dataInputDir = path.join(tmp, "reports-data");
  const outDir = path.join(tmp, "docs");
  await fs.mkdir(dataInputDir, { recursive: true });
  const structuredReport = JSON.parse(await readFixture("reports/good/structured-report.json"));
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
    generatedAt: fixedGeneratedAt
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
  assert.equal(data.model_releases.length, 1);
  assert.equal(data.hot_blogs.length, 1);

  const feed = JSON.parse(await fs.readFile(path.join(outDir, "feed.json"), "utf8"));
  assert.equal(feed.reports[0].markdown_url, undefined);
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
    generatedAt: fixedGeneratedAt
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
  assert.deepEqual(result.report.model_releases, []);
  assert.deepEqual(result.report.hot_blogs, []);
  assert.equal(result.report.source_audit.github_trending.checked, true);
  assert.equal(result.report.source_audit.builder_sources.checked, true);
  assert.equal(result.path, path.join(tmp, "reports-data", "2026", "05", "2026-05-16.json"));
  assert.equal(result.candidatePoolPath, path.join(tmp, "reports-data", "2026", "05", "2026-05-16.candidates.json"));
  assert.equal(await exists(result.path), true);
  assert.equal(await exists(result.candidatePoolPath), true);
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

test("report:write 要求结构化草稿记录 GitHub Trending 和 Builder 信源审计", async () => {
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
  assert.equal(issues[0].code, "same_report_duplicate_url");
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
  assert(prompt.includes("npm run discover:github-trending"));
  assert(prompt.includes("--browser-export"));
  assert(prompt.includes("npm run discover:builders"));
  assert(prompt.includes("npm run discover:content-sources"));
  assert(prompt.includes("npm run discover:statuspage-incidents"));
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
  assert(prompt.includes("领域"));
  assert(prompt.includes("作用"));
  assert(prompt.includes("空数组对应板块不要渲染"));
  assert(prompt.includes("2026-05-15"));
});

async function readFixture(relativePath) {
  return fs.readFile(path.join(rootDir, "tests/fixtures", relativePath), "utf8");
}

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
    }
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

function textResponse(text, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
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
