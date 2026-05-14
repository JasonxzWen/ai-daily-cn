import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PublisherError } from "../src/errors.js";
import { parseDailyMarkdown } from "../src/parser.js";
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
  assert(!html.includes('<link rel="stylesheet"'));
  assert(!html.includes("Markdown 原文"));

  const feed = JSON.parse(await fs.readFile(path.join(outDir, "feed.json"), "utf8"));
  assert.equal(feed.reports[0].markdown_url, undefined);
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
  assert.equal(result.path, path.join(tmp, "reports-data", "2026", "05", "2026-05-16.json"));
  assert.equal(await exists(result.path), true);
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
