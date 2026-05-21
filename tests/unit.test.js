import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PublisherError } from "../src/errors.js";
import { parseDailyMarkdown } from "../src/parser.js";
import { collectGitHubTrending, parseGitHubTrendingHtml } from "../src/discovery.js";
import { renderReportHtml } from "../src/render.js";
import { mergeFeed, buildSite } from "../src/site.js";
import { validateFeed, validateReport } from "../src/schema.js";
import { assemblePrompt } from "../src/prompt.js";
import { normalizeReportDraft, writeReportDraft } from "../src/report.js";

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

test("schema 支持模型发布和热门技术博客，并为旧日报默认空数组", async () => {
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
      summary: "该博客说明长任务 agent harness 的工程设计。",
      why_it_matters: "它是工程实践读物，不应计入主体信息数量。"
    }
  ];

  const validation = validateReport(enriched);
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));

  const invalid = structuredClone(enriched);
  invalid.model_releases[0].availability = "unknown";
  const invalidValidation = validateReport(invalid);
  assert.equal(invalidValidation.valid, false);
  assert(invalidValidation.errors.some((error) => error.path.includes("/model_releases/0/availability")));
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
  report.projects = [
    {
      name: "Example Trending Agent",
      description: "用于验证 GitHub trending 项目信号展示。",
      url: "https://github.com/example/trending-agent",
      event_date: "2026-05-15",
      source: "GitHub Trending",
      signal: "trending",
      evidence: "出现在 daily trending，并有可运行 README。"
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
  assert(html.includes("信号：trending"));
  assert(html.includes("出现在 daily trending"));
  assert(html.includes("原始帖子链接可访问"));
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
  await fs.copyFile(
    path.join(rootDir, "tests/fixtures/reports/good/structured-report.json"),
    path.join(dataInputDir, "structured-report.json")
  );

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
  assert(html.includes("模型发布"));
  assert(html.includes("ExampleModel 2"));
  assert(html.includes("热门技术博客"));
  assert(html.includes("Harness Engineering for Long Running Agents"));
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
  const result = await writeReportDraft({
    rootDir: tmp,
    inputPath: draftPath,
    outputDir: "reports-data",
    siteUrl,
    generatedAt: fixedGeneratedAt
  });

  assert.equal(result.report.report_date, "2026-05-16");
  assert.equal(result.report.html_path, "reports/2026/05/2026-05-16.html");
  assert.equal(result.report.publish_status.repo_pushed, false);
  assert.deepEqual(result.report.model_releases, []);
  assert.deepEqual(result.report.hot_blogs, []);
  assert.equal(result.report.source_audit.github_trending.checked, true);
  assert.equal(result.report.source_audit.builder_sources.checked, true);
  assert.equal(result.path, path.join(tmp, "reports-data", "2026", "05", "2026-05-16.json"));
  assert.equal(await exists(result.path), true);
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
  assert(prompt.includes("定时任务假定已经在本仓库根目录启动"));
  assert(prompt.includes("反思与迭代建议"));
  assert(prompt.includes("真实发布后必须验证当日 GitHub Pages URL 返回 HTTP 200"));
  assert(prompt.includes("反思与自动化迭代建议"));
  assert(prompt.includes("GitHub Trending"));
  assert(prompt.includes("npm run discover:github-trending"));
  assert(prompt.includes("follow-builders"));
  assert(prompt.includes("source_audit"));
  assert(prompt.includes("builder_sources"));
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
