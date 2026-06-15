import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { PublisherError } from "../src/errors.js";
import { parseDailyMarkdown } from "../src/parser.js";
import {
  collectBuilderFallbacks,
  collectContentSources,
  DEFAULT_CONTENT_SOURCES,
  DEFAULT_GITHUB_TRENDING_SOURCES,
  collectGitHubTrending,
  collectHuggingFaceTrending,
  collectStatuspageIncidents,
  parseGitHubTrendingHtml,
  parseGitHubReportMarkdownEntries,
  parseOpenRouterRankingsText,
  parseArtificialAnalysisIndexText
} from "../src/discovery.js";
import { collectSearchNews } from "../src/search-news.js";
import { checkSourcesHealth } from "../src/source-health.js";
import { auditSourceRunHistory } from "../src/source-phase5.js";
import {
  extractSourceStatusRecords,
  findSourcesWithoutEffectiveSignal,
  mergeSourceStatusRecords
} from "../src/source-status-history.js";
import { mergeSourceAuditIntoReport } from "../src/source-audit.js";
import { loadSourceRegistry, normalizeSourceRegistry } from "../src/source-registry.js";
import { renderIndexHtml, renderReportHtml } from "../src/render.js";
import { reportToInteractionInput } from "../src/interaction-report.js";
import { generateReportDraft } from "../src/draft.js";
import { cacheEvidenceImages } from "../src/evidence-cache.js";
import { CACHED_DOMAIN_ICONS, CACHED_SOURCE_ICONS } from "../src/source-icon-cache.js";
import { buildDateIndex, deriveDateSignalStrength, mergeFeed, buildSite } from "../src/site.js";
import { validateFeed, validateReport } from "../src/schema.js";
import { validateTrends } from "../src/schema.js";
import { assemblePrompt } from "../src/prompt.js";
import { normalizeReportDraft, writeReportDraft } from "../src/report.js";
import { resolveLinkIcon } from "../src/link-icons.js";
import {
  buildTrackingComponentSnapshot,
  attachTrackingComponentSnapshots
} from "../src/tracking-components.js";
import {
  applyGithubReadmeSummary,
  githubReadmeCacheKey,
  summarizeGithubReadme
} from "../src/github-readme.js";
import { selectChineseMediaDynamics } from "../src/chinese-media.js";
import { officialOrgUpdateItem, selectOfficialOrgUpdates } from "../src/official-updates.js";
import { buildAutomationRevision } from "../src/automation-revision.js";
import {
  normalizeOptimizationSuggestions,
  validateFeedbackContract
} from "../src/feedback-contract.js";
import { findPlainLanguageIssues } from "../src/plain-language.js";
import { findFreshnessIssues } from "../src/quality-gates.js";
import { classifyPublishQuality, deriveQualityStatus, findPublishQualityIssues } from "../src/quality-status.js";
import {
  applyQualityRepairContract,
  repairReportQuality,
  reviewReportQuality
} from "../src/quality-loop.js";
import { runDailyWorkflow } from "../src/daily-runner.js";
import { runStatusSelfCheck } from "../src/status-self-check.js";
import { npmInvocationForArgs } from "../src/process-runner.js";
import { normalizeUrlIdentity } from "../src/url.js";
import { validateDailyWorkflowContract } from "../src/workflow-contract.js";
import { scanPublicArtifactsForLocalInfo } from "../src/privacy.js";
import { buildTrendIndex, loadTrendConfig } from "../src/trends.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const trendConfigPath = path.join(rootDir, "config/trends.json");
const fixedGeneratedAt = "2026-05-13T02:35:00+08:00";
const siteUrl = "https://jasonxzwen.github.io/ai-daily-cn/";
const execFileAsync = promisify(execFile);

test("schema allows OpenRouter snapshot on a source audit source", async () => {
  const report = JSON.parse(await readFixture("reports/good/structured-report.json"));
  report.source_audit = sourceAuditFixture();
  report.source_audit.content_sources.sources.push({
    name: "OpenRouter Rankings",
    url: "https://openrouter.ai/rankings",
    status: "checked",
    notes: "public_page_snapshot; 10 top models parsed",
    snapshot: openRouterSnapshotFixture()
  });

  const validation = validateReport(report);

  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
  const source = validation.value.source_audit.content_sources.sources.find((item) => item.name === "OpenRouter Rankings");
  assert.equal(source.snapshot.snapshot_status, "complete");
  assert.equal(source.snapshot.top_entries.length, 10);
});

function mainMarkdownSections(input) {
  return input.sections.filter((section) => section.group === "main" && section.type === "markdown");
}

function mainMarkdownContent(input) {
  return mainMarkdownSections(input)
    .map((section) => section.content)
    .join("\n\n");
}

function reportWithThreeMinuteMustRead(report) {
  const categories = ["model_release", "product_radar", "open_source"];
  const sources = ["OpenAI News RSS", "Vercel", "GitHub Trending daily"];
  const base = report.main_items[0] || {};
  const mainItems = categories.map((category, index) => ({
    ...base,
    candidate_id: `must-read-main-${index + 1}`,
    title: `Must read signal ${index + 1}`,
    event_date: report.report_date || "2026-05-15",
    url: `https://example.com/must-read/${index + 1}`,
    source: sources[index],
    editorial_category: category,
    source_level: index === 2 ? "github" : "official",
    verification_status: "primary_confirmed",
    importance: "major",
    summary: `**Signal ${index + 1}** ships a concrete AI change that a three-minute reader can understand before opening technical details.`,
    bullets: [
      `==Result== Signal ${index + 1} changes the visible product or project surface today.`,
      `==Impact== Readers can decide whether this affects model choice, tool adoption, or open-source tracking.`
    ]
  }));
  report.main_items = mainItems;
  report.self_check = {
    ...report.self_check,
    report_date: report.report_date || "2026-05-15",
    main_items: mainItems.length
  };
  report.hero_highlights = mainItems.map((item, index) => ({
    title: item.title,
    url: item.url,
    reason: `Readers should watch signal ${index + 1} because it changes a practical decision surface.`,
    what_happened: `Signal ${index + 1} shipped a concrete AI update.`,
    why_watch: `It changes a practical decision surface for a three-minute reader.`,
    category: ["model_platform", "product_tool", "china_open_source_community"][index],
    source_item_ref: item.candidate_id
  }));
  return report;
}

test("report:write validation gate requires must read fields for full reports", async () => {
  const report = reportWithThreeMinuteMustRead(JSON.parse(await readFixture("reports/good/structured-report.json")));
  report.source_audit = sourceAuditFixture();
  report.github_trending = [];
  report.huggingface_trending = [];
  report.model_releases = [];
  report.hot_blogs = [];
  report.projects = [];
  report.builder_observations = [];
  report.official_org_updates = [];
  report.community_leads = [];
  report.hero_highlights = report.hero_highlights.map(({ title, url, reason }) => ({ title, url, reason }));
  const candidatePool = {
    report_date: report.report_date,
    sources: [],
    candidates: report.main_items.map((item) => ({
      id: item.candidate_id,
      source_id: "unit-test",
      category: "main_item",
      status: "included",
      included_in: "main_items",
      title: item.title,
      url: item.url,
      source: item.source,
      event_date: item.event_date,
      source_level: item.source_level,
      verification_status: item.verification_status,
      verification_sources: [item.url]
    }))
  };

  assert.throws(
    () => normalizeReportDraft(report, { reportDate: report.report_date, candidatePool }),
    (error) => error instanceof PublisherError && error.code === "hero_highlights_contract_failed"
  );
});

test("report:draft selects must read highlights with category balance", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-must-read-draft-"));
  const reportDate = "2026-05-26";
  const discoveryPath = path.join(tmp, "discovery.json");
  const discovery = autodraftDiscoveryFixture(reportDate);
  discovery.candidates.unshift(
    {
      id: "must-read-open-source-cn",
      source_id: "china-ai-qwen",
      category: "community_lead",
      title: "Qwen Code updates open-source agent workflow",
      url: "https://github.com/QwenLM/qwen-code",
      source: "Qwen GitHub",
      event_date: reportDate,
      status: "excluded",
      evidence: "Official repository update describes a concrete open-source agent workflow change.",
      verification_status: "primary_confirmed",
      source_level: "github",
      primary_url: "https://github.com/QwenLM/qwen-code",
      verification_sources: ["https://github.com/QwenLM/qwen-code"],
      editorial_category: "open_source"
    },
    {
      id: "must-read-product-tool",
      source_id: "content-vercel",
      category: "community_lead",
      title: "Vercel AI Gateway adds routing controls for teams",
      url: "https://vercel.com/changelog/ai-gateway-routing-controls",
      source: "Vercel",
      event_date: reportDate,
      status: "excluded",
      evidence: "Official changelog describes routing controls, team usage, and model gateway behavior.",
      verification_status: "primary_confirmed",
      source_level: "official",
      primary_url: "https://vercel.com/changelog/ai-gateway-routing-controls",
      verification_sources: ["https://vercel.com/changelog/ai-gateway-routing-controls"],
      editorial_category: "product_radar"
    }
  );
  await fs.writeFile(discoveryPath, `${JSON.stringify(discovery, null, 2)}\n`, "utf8");

  const drafted = await generateReportDraft({
    rootDir: tmp,
    reportDate,
    generatedAt: fixedGeneratedAt,
    inputPaths: [discoveryPath],
    cacheEvidence: false
  });

  assert.equal(drafted.report.hero_highlights.length, 3);
  assert(drafted.report.hero_highlights.every((item) =>
    item.what_happened &&
    item.why_watch &&
    item.category &&
    item.source_item_ref
  ));
  assert(new Set(drafted.report.hero_highlights.map((item) => item.category)).size >= 2);
  assert.notDeepEqual(
    drafted.report.hero_highlights.map((item) => item.source_item_ref),
    drafted.report.main_items.slice(0, 3).map((item) => item.candidate_id || item.url)
  );
});

test("report:draft backfills must read highlights from public sections when main items are sparse", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-must-read-backfill-"));
  const reportDate = "2026-06-15";
  const discoveryPath = path.join(tmp, "discovery.json");
  const githubCandidates = Array.from({ length: 10 }, (_unused, index) => ({
    id: `github-sparse-project-${index + 1}`,
    source_id: "github-github-trending-daily",
    category: "project",
    title: `example/sparse-agent-project-${index + 1}`,
    repo: `example/sparse-agent-project-${index + 1}`,
    url: `https://github.com/example/sparse-agent-project-${index + 1}`,
    source: "GitHub Trending daily",
    event_date: reportDate,
    status: "excluded",
    rank: index + 1,
    trend: "new",
    language: "TypeScript",
    window: "daily",
    description: "Agent workflow toolkit for local AI engineering.",
    evidence: `GitHub Trending daily rank #${index + 1} with recent stars today.`,
    verification_status: "primary_confirmed",
    source_level: "github",
    primary_url: `https://github.com/example/sparse-agent-project-${index + 1}`,
    verification_sources: [`https://github.com/example/sparse-agent-project-${index + 1}`]
  }));
  const discovery = discoveryEnvelope({
    sourceNames: ["OpenAI News RSS", "GitHub Trending daily"],
    candidates: [
      strategicOfficialCandidate(reportDate, {
        id: "official-main-one",
        title: "OpenAI ships a practical agent platform update",
        url: "https://openai.com/news/practical-agent-platform-update",
        source: "OpenAI News RSS",
        evidence: "Official source describes a concrete agent platform update for engineering teams.",
        editorialCategory: "product_radar"
      }),
      strategicOfficialCandidate(reportDate, {
        id: "official-main-two",
        title: "Anthropic expands developer workflow controls",
        url: "https://www.anthropic.com/news/developer-workflow-controls",
        source: "Anthropic News",
        evidence: "Official source describes developer workflow controls, API availability, and team rollout details.",
        editorialCategory: "engineering_toolchain"
      }),
      ...githubCandidates
    ]
  });
  discovery.source_audit.github_trending = {
    checked: true,
    sources: [{
      name: "GitHub Trending daily",
      url: "https://github.com/trending?since=daily",
      status: "checked",
      notes: "10 repositories parsed"
    }],
    candidates_found: githubCandidates.length,
    included: 0,
    notes: "GitHub Trending fixed source checked."
  };
  await fs.writeFile(discoveryPath, `${JSON.stringify(discovery, null, 2)}\n`, "utf8");

  const drafted = await generateReportDraft({
    rootDir: tmp,
    reportDate,
    generatedAt: fixedGeneratedAt,
    inputPaths: [discoveryPath],
    cacheEvidence: false
  });

  assert.equal(drafted.report.main_items.length, 2);
  assert.equal(drafted.report.github_trending.length, 10);
  assert.equal(drafted.report.hero_highlights.length, 3);
  const mainRefs = new Set(drafted.report.main_items.map((item) => item.candidate_id || item.url));
  assert(drafted.report.hero_highlights.some((item) => !mainRefs.has(item.source_item_ref)));
  assert(drafted.report.hero_highlights.every((item) =>
    item.what_happened &&
    item.why_watch &&
    item.category &&
    item.source_item_ref
  ));
});

test("interaction input puts must read first and compact main list", async () => {
  const report = reportWithThreeMinuteMustRead(JSON.parse(await readFixture("reports/good/structured-report.json")));

  const input = reportToInteractionInput(report);
  const firstSection = input.sections[0];
  const mainContent = mainMarkdownContent(input);

  assert.equal(input.hideNavigation, true);
  assert.deepEqual(input.heroStats, []);
  assert.deepEqual(input.heroLinks, []);
  assert.equal(firstSection.richId, "today-must-read");
  assert.equal(firstSection.type, "filterable-cards");
  assert.equal(firstSection.items.length, 3);
  assert(input.sections.findIndex((section) => section.richId === "daily-overview") > 0);
  const compactList = input.sections.find((section) => section.richId === "compact-main-list");
  const detailSection = input.sections.find((section) => section.richId === "main-item-details");
  assert.equal(compactList.type, "filterable-cards");
  assert.equal(compactList.items.length, 3);
  assert.equal(detailSection.collapsed, true);
  assert(mainContent.includes("Signal 1 changes the visible product or project surface today"));
});

function openRouterRankingsSampleText(rows = 10) {
  const entries = [
    ["DeepSeek V4 Flash", "deepseek", "2.9T tokens", "18%"],
    ["Hy3 preview", "tencent", "2.7T tokens", "13%"],
    ["MiMo-V2.5", "xiaomi", "2.31T tokens", "450%"],
    ["Owl Alpha", "openrouter", "1.99T tokens", "44%"],
    ["Claude Sonnet 4.6", "anthropic", "1.77T tokens", "14%"],
    ["Claude Opus 4.7", "anthropic", "1.41T tokens", "47%"],
    ["DeepSeek V4 Pro", "deepseek", "1.34T tokens", "11%"],
    ["MiniMax M3", "minimax", "1.22T tokens", "new"],
    ["MiMo-V2.5-Pro", "xiaomi", "1.12T tokens", "37%"],
    ["DeepSeek V3.2", "deepseek", "1.11T tokens", "15%"]
  ].slice(0, rows);
  return [
    "AI Model Rankings",
    "Top Models",
    "This Week",
    ...entries.flatMap(([model, provider, tokens, change], index) => [
      `${index + 1}.`,
      model,
      "by",
      provider,
      tokens,
      change
    ]),
    "Show more",
    "Market Share"
  ].join("\n");
}

function openRouterRankingsHistorySampleText() {
  return [
    openRouterRankingsSampleText(),
    "Top Models History",
    "Week",
    "2026-05-04",
    "DeepSeek V4 Flash",
    "1.8T tokens",
    "Claude Sonnet 4.6",
    "1.2T tokens",
    "MiniMax M3",
    "620B tokens",
    "2026-05-11",
    "DeepSeek V4 Flash",
    "2.4T tokens",
    "Claude Sonnet 4.6",
    "1.5T tokens",
    "MiniMax M3",
    "910B tokens",
    "2026-05-18",
    "DeepSeek V4 Flash",
    "2.9T tokens",
    "Claude Sonnet 4.6",
    "1.77T tokens",
    "MiniMax M3",
    "1.22T tokens",
    "LLM Leaderboard"
  ].join("\n");
}

function openRouterSnapshotFixture(rows = 10) {
  return {
    type: "openrouter_rankings_public_page",
    collection_method: "public_page_playwright",
    snapshot_status: rows === 10 ? "complete" : "partial",
    snapshot_as_of: fixedGeneratedAt,
    source_url: "https://openrouter.ai/rankings",
    top_entries: parseOpenRouterRankingsText(openRouterRankingsSampleText(rows)).map((entry) => ({
      ...entry,
      url: `https://openrouter.ai/${entry.provider}/${entry.model.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`
    })),
    notes: "Public OpenRouter rankings page snapshot."
  };
}

function artificialAnalysisIndexSampleText(rows = 10) {
  const entries = [
    ["Claude Opus 4.8 (Adaptive Reasoning, Max Effort)", "61"],
    ["GPT-5.5 (xhigh)", "60"],
    ["GPT-5.5 (high)", "59"],
    ["Claude Opus 4.7 (Max Effort)", "57"],
    ["Gemini 3.1 Pro Preview", "57"],
    ["Qwen3.7 Max", "57"],
    ["Gemini 3.5 Flash", "55"],
    ["MiniMax-M3", "55"],
    ["Kimi K2.6", "54"],
    ["MiMo-V2.5-Pro", "54"]
  ].slice(0, rows);
  return [
    "Artificial Analysis Intelligence Index",
    "Artificial Analysis Intelligence Index: Results",
    "Add model from specific provider",
    ...entries.map(([model]) => model),
    ...entries.map(([, score]) => score),
    "About the Data"
  ].join("\n");
}

function artificialAnalysisComponentSampleText() {
  return [
    artificialAnalysisIndexSampleText(),
    "## Token Usage",
    "### Artificial Analysis Intelligence Index: Token Usage",
    "Answer tokens Reasoning tokens Input tokens",
    "Claude Opus 4.8 (Adaptive Reasoning, Max Effort)",
    "676M",
    "Answer tokens",
    "77M",
    "Reasoning tokens",
    "187M",
    "Input tokens",
    "412M",
    "GPT-5.5 (xhigh)",
    "628M",
    "Answer tokens",
    "92M",
    "Reasoning tokens",
    "0M",
    "Input tokens",
    "536M",
    "Gemini 3.5 Flash",
    "671M",
    "Answer tokens",
    "62M",
    "Reasoning tokens",
    "0M",
    "Input tokens",
    "609M",
    "## Cost",
    "### Artificial Analysis Intelligence Index: Cost Breakdown",
    "Answer cost Reasoning cost Input cost",
    "Claude Opus 4.8 (Adaptive Reasoning, Max Effort)",
    "$4,309",
    "Answer cost",
    "$1,508",
    "Reasoning cost",
    "$2,614",
    "Input cost",
    "$187",
    "GPT-5.5 (xhigh)",
    "$3,357",
    "Answer cost",
    "$1,101",
    "Reasoning cost",
    "$0",
    "Input cost",
    "$2,256",
    "Gemini 3.5 Flash",
    "$1,552",
    "Answer cost",
    "$898",
    "Reasoning cost",
    "$0",
    "Input cost",
    "$654",
    "## Score vs. Compute",
    "Claude Opus 4.8 (Adaptive Reasoning, Max Effort)",
    "61",
    "Compute",
    "840",
    "GPT-5.5 (xhigh)",
    "60",
    "Compute",
    "790",
    "Gemini 3.5 Flash",
    "55",
    "Compute",
    "510",
    "## Example Tasks"
  ].join("\n");
}

function artificialAnalysisSnapshotFixture(rows = 10) {
  return {
    type: "artificial_analysis_intelligence_index_public_page",
    collection_method: "public_page_playwright",
    snapshot_status: rows === 10 ? "complete" : "partial",
    snapshot_as_of: fixedGeneratedAt,
    source_url: "https://artificialanalysis.ai/evaluations/artificial-analysis-intelligence-index",
    top_entries: parseArtificialAnalysisIndexText(artificialAnalysisIndexSampleText(rows)),
    notes: "Public Artificial Analysis Intelligence Index snapshot."
  };
}

test("HTML renders main item bold and highlight markers", async () => {
  const markdown = await readFixture("reports/good/official-release.md");
  const report = parseDailyMarkdown(markdown, { siteUrl, generatedAt: fixedGeneratedAt });
  report.main_items[0].bullets = ["**Cost attribution** enters ==regular tracking==."];
  const html = renderReportHtml(report);

  assert(html.includes("<strong>Cost attribution</strong>"));
  assert(html.includes('<strong class="text-keyword">regular tracking</strong>'));
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
      reason: "同一天的模型、项目和工程博客都指向 agent harness。",
      what_happened: "Agent harness became the leading topic in the fixture.",
      why_watch: "It changes how readers evaluate long-running agent workflows.",
      category: "product_tool",
      source_item_ref: "https://example.com/blog/harness-engineering"
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

  const input = reportToInteractionInput(report, { includeInternalSections: true });
  const selfCheckSection = input.sections.find((section) => section.title === "自检与产物");
  assert(selfCheckSection.content.includes("为什么要改：避免低质量硬凑。"));
  assert(!selfCheckSection.content.includes("。；为什么要改"));
  assert(!/\n\s+- 为什么要改/.test(selfCheckSection.content));
});

test("HTML 渲染不会展示独立模型栏目但会展示热门博客", async () => {
  const report = JSON.parse(await readFixture("reports/good/structured-report.json"));
  const validation = validateReport(report);
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));

  const html = renderReportHtml(validation.value);

  assert(!html.includes('id="model-releases"'));
  assert(!html.includes("模型发布"));
  assert(!html.includes("ExampleModel 2"));
  assert(!html.includes("open_weights"));
  assert(html.includes('id="hot-blogs"'));
  assert(html.includes("热门博客"));
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
      handle: "examplebuilder",
      role: "maintainer",
      original_text: "I shipped a concrete agent harness workflow.",
      translation: "我发布了一个具体的 agent harness 工作流。",
      content: "我发布了一个具体的 agent harness 工作流。",
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
  assert(html.includes("我发布了一个具体的 agent harness 工作流"));
  assert(!html.includes("I shipped a concrete agent harness workflow"));
  assert(!html.includes("原始帖子链接可访问"));
});

test("日报可以转换为 effective-interact 输入", async () => {
  const report = JSON.parse(await readFixture("reports/good/structured-report.json"));
  report.source_audit = sourceAuditFixture();
  report.summary = "Google 把模型和 agent 工具放进同一条链路；Vercel AI Gateway 接入更多模型；GitHub Copilot 加强任务路由；GitHub Trending 显示 agent memory 升温。";
  report.main_items[0].title = "OpenAI Status：Example Agent Platform GA";
  report.main_items[0].source = "OpenAI Status";
  report.main_items[0].url = "https://status.openai.com/incidents/example-agent-platform";
  report.main_items[0].editorial_category = "ai_industry";
  report.main_items[0].why_it_matters = "Why metadata should stay in JSON but not render as an extra main bullet.";
  report.main_items[0].reader_relevance = "Reader relevance metadata should stay in JSON and not render as an extra main bullet.";
  report.main_items[0].watch_next = "Generic follow-up metadata should not render in main bullets.";
  report.main_items.push({
    title: "Cisco and OpenAI redefine enterprise engineering with Codex",
    event_date: "2026-05-15",
    url: "https://openai.com/index/cisco",
    source: "OpenAI News RSS",
    tier: "T0",
    entities: ["OpenAI", "Cisco", "Codex"],
    summary: "OpenAI News RSS item for source icon coverage.",
    editorial_category: "ai_industry",
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
    },
    {
      type: "figure",
      title: "OpenRouter Top 10",
      source_url: "https://openrouter.ai/rankings",
      local_path: "assets/evidence/openrouter-top10.png",
      caption: "Weekly Top 10 ranking snapshot.",
      extraction_status: "source_image"
    },
    {
      type: "figure",
      title: "OpenRouter provider mix",
      source_url: "https://openrouter.ai/rankings",
      local_path: "assets/evidence/openrouter-provider-mix.png",
      caption: "Provider mix comparison.",
      extraction_status: "source_image"
    },
    {
      type: "figure",
      title: "OpenRouter weekly deltas",
      source_url: "https://openrouter.ai/rankings",
      local_path: "assets/evidence/openrouter-weekly-deltas.png",
      caption: "Weekly ranking change snapshot.",
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
  report.daily_tracking = [
    {
      id: "openrouter-rankings",
      name: "OpenRouter",
      url: "https://openrouter.ai/rankings",
      event_date: "2026-05-15",
      source: "OpenRouter Rankings",
      category: "model_usage",
      importance: "notable",
      source_level: "primary",
      verification_status: "primary_confirmed",
      change_status: "changed",
      change_summary: "OpenRouter Top 10 出现新模型。",
      publish_to_public: true,
      summary: "关注模型在 OpenRouter 上的实际调用热度、周使用排名和应用生态迁移；它回答开发者正在用什么。",
      watch_points: ["榜首模型和供应商份额是否改变。"],
      metrics: [{ label: "核心指标", value: "Top Models / weekly usage", trend: "unknown" }],
      evidence: "OpenRouter 官方榜单。",
      verification_note: "本轮已检查官方入口。",
      risk_note: "不能直接代表全市场份额。",
      watch_next: "显著变化时回到模型发布和价格页核验。"
    }
  ];
  const input = reportToInteractionInput(report, { includeInternalSections: true });

  assert.equal(input.template, "research-explainer");
  assert.equal(input.renderMode, "pre-rendered");
  assert.equal(input.heroMode, "daily-report");
  assert.equal(input.heroTitle, "2026-05-15");
  assert.equal(input.hideNavigation, false);
  assert.equal(input.heroEyebrow, "AI 日报 · 覆盖 2026-05-15");
  assert(input.summary.includes("Google 把模型和 agent 工具放进同一条链路"));
  assert.deepEqual(
    input.heroStats.map((item) => [item.label, item.value, item.detail]),
    [
      ["主体", "2", "重点条目"],
      ["AIGC", "1", "产品/内容"],
      ["追踪", "1", "榜单变化"],
      ["精选博客", "1", "深读"],
      ["GitHub", "1", "Top 10"],
      ["Builder", "0", "观察"],
      ["覆盖", "05-15", "标准时间范围"]
    ]
  );
  assert(input.heroLinks.some((item) => item.label === "结构化 JSON" && item.href.endsWith("/data/2026/05/2026-05-15.json")));
  assert(input.heroLinks.every((item) => item.icon));
  assert(input.heroLinks.find((item) => item.label === "日报导航")?.icon.startsWith("data:image/svg+xml;base64,"));
  assert(!input.summary.includes("Agent harness 成为今日主线"));
  assert(!input.summary.includes("其余条目见后文"));
  assert(!input.summary.includes("技不止术"));
  assert(!input.sections.some((section) => section.title === "日报概览"));
  assert(!input.sections.some((section) => section.title === "主线摘要"));
  const mainContent = mainMarkdownContent(input);
  assert(!input.sections.some((section) => section.title === "主体信息"));
  assert(!JSON.stringify(input.sections).includes("主体信息"));
  assert(JSON.stringify(input.sections).includes("主线条目："));
  assert(input.sections.some((section) => section.title === "AI 行业动态"));
  assert(mainContent.includes("![OpenAI Status](data:image/png;base64,"));
  assert(mainContent.includes("![OpenAI News RSS](data:image/png;base64,"));
  assert(mainContent.includes("![OpenAI Status](data:image/png;base64,") && mainContent.includes("**[![OpenAI Status]"));
  assert(!mainContent.includes("来源："));
  assert(!mainContent.includes("，T0）"));
  assert(!mainContent.includes("Why metadata should stay in JSON"));
  assert(!mainContent.includes("Reader relevance metadata should stay in JSON"));
  assert(!mainContent.includes("Generic follow-up metadata should not render"));
  assert(!mainContent.includes("==影响=="));
  assert(!mainContent.includes("==留意=="));
  const trackingSection = input.sections.find((section) => section.title === "每日追踪");
  assert.equal(trackingSection.type, "filterable-cards");
  assert.equal(trackingSection.cardClass, "tracking-card");
  assert.equal(trackingSection.items.length, 1);
  assert.equal(trackingSection.items[0].title, "OpenRouter");
  assert.equal(trackingSection.items[0].href, "https://openrouter.ai/rankings");
  assert.match(trackingSection.items[0].titleIcon, /^data:image\/png;base64,/);
  assert(!trackingSection.items[0].titleIcon.includes("PHN2Zy"));
  assert(trackingSection.items[0].body.includes("OpenRouter"));
  assert(trackingSection.items[0].tags.includes("topic|模型使用"));
  assert.equal(trackingSection.items[0].points.length, 0);
  assert.equal(trackingSection.items[0].media.length, 3);
  assert.equal(trackingSection.items[0].table.rows.length, 1);
  assert.equal(trackingSection.items[0].table.rows[0].label, "核心指标");
  assert(trackingSection.items[0].stats.some((stat) => stat.label === "核心指标"));
  const hotBlogsSection = input.sections.find((section) => section.title === "精选博客更新");
  assert.equal(hotBlogsSection.type, "filterable-cards");
  assert.equal(hotBlogsSection.cardClass, "blog-card");
  assert.equal(hotBlogsSection.items.length, 1);
  assert(!JSON.stringify(hotBlogsSection).includes("技不止术"));
  assert.equal(hotBlogsSection.items[0].title, "Harness Engineering for Long Running Agents");
  assert.equal(hotBlogsSection.items[0].href, "https://example.com/blog/harness-engineering");
  assert.match(hotBlogsSection.items[0].titleIcon, /^data:image\/svg\+xml;base64,/);
  assert(hotBlogsSection.items[0].body.includes("这篇文章把长运行 agent 的 harness"));
  assert.equal(hotBlogsSection.items[0].showGroup, false);
  assert.deepEqual(hotBlogsSection.items[0].tags, ["notable|值得关注", "topic|agent harness", "topic|long-running agents"]);
  assert(hotBlogsSection.items[0].points.length > 0);
  assert.equal(hotBlogsSection.items[0].media.length, 1);
  assert(hotBlogsSection.items[0].media[0].src.endsWith("assets/evidence/harness-architecture.png"));
  assert(!JSON.stringify(hotBlogsSection.items[0].points).includes("发布方"));
  assert(!JSON.stringify(hotBlogsSection.items[0].points).includes("日期"));
  assert(!hotBlogsSection.items[0].points.some((point) => ["发布方", "作者", "日期"].includes(point.label)));
  assert(!hotBlogsSection.items[0].body.includes("为什么重要"));
  assert(!input.sections.some((section) => section.title === "模型发布"));
  assert(!input.sections.some((section) => section.title === "今日值得关注的项目"));
  const trendingSection = input.sections.find((section) => section.title === "GitHub Trending · Top 10");
  assert(!JSON.stringify(input.sections).includes("ExampleModel 2"));
  assert(!JSON.stringify(input.sections).includes("open_weights"));
  assert.equal(trendingSection.summary, undefined);
  assert(trendingSection.content.includes("example/agent-memory"));
  assert(trendingSection.content.includes("![example/agent-memory](data:image/png;base64,"));
  assert(trendingSection.content.includes("1. **[![example/agent-memory]"));
  assert(trendingSection.content.includes("==trend-new|NEW=="));
  assert(trendingSection.content.includes("==tag-stars|本周 +456 stars=="));
  assert.equal((trendingSection.content.match(/==tag-stars\|/g) || []).length, 1);
  assert(trendingSection.content.includes("==tag-highlight|项目 highlight=="));
  assert(trendingSection.content.includes("领域：coding_agent、agent_memory") || trendingSection.content.includes("给 coding agent 提供跨会话持久记忆"));
  assert(!trendingSection.content.includes("\n  - "));
  assert(!trendingSection.content.includes(" | "));
  assert(!trendingSection.content.includes("新上榜"));
  assert(input.intent.audience.includes("内容、产品、平台、策略与工程"));
  assert(input.intent.primaryQuestion.includes("内容、产品、平台、策略与工程团队"));
  assert(input.sections.some((section) => section.title === "AI 行业动态"));
  const sourceAuditSection = input.sections.find((section) => section.title === "信源审计");
  assert(sourceAuditSection);
  assert(sourceAuditSection.content.includes("![GitHub Trending](data:image/png;base64,"));
  assert(sourceAuditSection.content.includes("==tag-status-checked|checked=="));
  assert(sourceAuditSection.content.includes("==tag-status-no-signal|no_signal=="));
  assert.equal(sourceAuditSection.appendix, true);
  assert.equal(sourceAuditSection.collapsed, true);
  const sourceAuditOverview = input.sections.find((section) => section.title === "信源状态概览");
  assert(sourceAuditOverview);
  assert.equal(sourceAuditOverview.type, "chart");
  assert.equal(sourceAuditOverview.chart.type, "bar");
  assert(sourceAuditOverview.chart.data.some((row) => row.group === "GitHub Trending"));
  const selfCheckSection = input.sections.find((section) => section.title === "自检与产物");
  assert(selfCheckSection);
  assert.equal(selfCheckSection.appendix, true);
  assert.equal(selfCheckSection.collapsed, true);
  assert(typeof selfCheckSection.content === "string" && selfCheckSection.content.includes("结构化 JSON"));
  assert.deepEqual(input.nextActions, []);
  assert.equal(input.nextActionsCollapsed, undefined);
  assert.equal(input.evidence, undefined);
});

test("每日追踪没有可核验变化时不渲染公开正文板块", async () => {
  const report = JSON.parse(await readFixture("reports/good/structured-report.json"));
  report.daily_tracking = [
    {
      id: "openrouter-rankings",
      name: "OpenRouter",
      url: "https://openrouter.ai/rankings",
      event_date: "2026-05-15",
      source: "OpenRouter Rankings",
      category: "model_usage",
      importance: "notable",
      source_level: "primary",
      verification_status: "primary_confirmed",
      change_status: "no_change",
      change_summary: "本轮检查了官方入口，未解析到当日可入选变化。",
      publish_to_public: false,
      summary: "关注模型在 OpenRouter 上的实际调用热度。",
      watch_points: ["榜首模型和供应商份额是否改变。"],
      metrics: [{ label: "核心指标", value: "Top Models / weekly usage", trend: "unknown" }],
      evidence: "OpenRouter 官方榜单。",
      verification_note: "本轮已检查官方入口。",
      risk_note: "不能直接代表全市场份额。"
    }
  ];

  const input = reportToInteractionInput(report, { includeInternalSections: true });

  assert(!input.sections.some((section) => section.title === "每日追踪"));
  assert(!input.heroStats.some((item) => item.label === "追踪"));
});

test("interaction input strips source-name prefixes from public body text", async () => {
  const report = JSON.parse(await readFixture("reports/good/structured-report.json"));
  report.source_audit = sourceAuditFixture();
  report.summary = "generated from latest main";
  report.hero_highlights = [
    {
      title: "Google Keyword Blog：生成式媒体行业视角",
      url: "https://example.com/generative-media",
      reason: "Google Keyword Blog：Google 汇总生成式媒体初创公司的行业视角，重点看影像、音乐、游戏和营销内容生产。"
    }
  ];
  report.main_items[0] = {
    ...report.main_items[0],
    title: "Google Keyword Blog：生成式媒体行业视角",
    source: "Google Keyword Blog",
    url: "https://example.com/generative-media",
    editorial_category: "content_aigc",
    bullets: [
      "Google Keyword Blog：Google 汇总生成式媒体初创公司的行业视角，重点看影像、音乐、游戏和营销内容生产。"
    ]
  };

  const input = reportToInteractionInput(report);
  const mainContent = mainMarkdownContent(input);

  assert(input.summary.includes("生成式媒体行业视角：Google 汇总生成式媒体初创公司的行业视角"));
  assert(!input.summary.includes("Google Keyword Blog："));
  assert(!mainContent.includes("Google Keyword Blog："));
  assert(mainContent.includes("Google 汇总生成式媒体初创公司的行业视角"));
});

test("project interaction content is only shown as GitHub Trending item tags", async () => {
  const report = JSON.parse(await readFixture("reports/good/structured-report.json"));
  report.github_trending = [
    {
      name: "example/project-alpha",
      repo: "example/project-alpha",
      description: "A reusable plugin set for agent workflows.",
      url: "https://github.com/example/project-alpha",
      event_date: "2026-05-15",
      source: "GitHub Trending weekly",
      language: "TypeScript",
      window: "weekly",
      rank: 1,
      previous_rank: null,
      rank_delta: null,
      trend: "new",
      evidence: "GitHub Trending weekly rank #1 with 456 stars today."
    }
  ];
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
  const section = input.sections.find((item) => item.title === "GitHub Trending · Top 10");

  assert.equal(section.type, "markdown");
  assert(!input.sections.some((item) => item.cardClass === "project-card"));
  assert(!section.content.includes("项目 highlights"));
  assert(section.content.includes("example/project-alpha"));
  assert(section.content.includes("agent workflows"));
  assert(section.content.includes("领域：agent、workflow"));
  assert(section.content.includes("==tag-highlight|项目 highlight=="));
  assert(!section.content.includes("Project Beta"));
  assert(!section.content.includes("eval dashboards"));
});

test("GitHub Trending project highlights deduplicate overlapping project text", async () => {
  const report = JSON.parse(await readFixture("reports/good/structured-report.json"));
  report.github_trending = [
    {
      name: "example/headroom",
      repo: "example/headroom",
      description: "压缩工具输出、日志、文件和 RAG chunks，在进入 LLM 前减少 token。",
      url: "https://github.com/example/headroom",
      event_date: "2026-05-15",
      source: "GitHub Trending daily",
      language: "all",
      window: "daily",
      rank: 1,
      previous_rank: 1,
      rank_delta: 0,
      trend: "same",
      evidence: "GitHub Trending daily rank #1 with 1,265 stars today."
    }
  ];
  report.projects = [
    {
      name: "example/headroom",
      description: "在 LLM 前压缩工具输出、日志、文件和 RAG chunks，目标是减少 token 同时保持回答质量。",
      url: "https://github.com/example/headroom",
      domains: ["LLM 工具链", "RAG", "MCP"],
      use_case: "把长日志、工具输出或检索片段送入模型前做压缩，降低上下文成本。",
      event_date: "2026-05-15",
      source: "GitHub",
      signal: "trending",
      evidence: "GitHub Trending daily appeared in discovery."
    }
  ];

  const validation = validateReport(report);
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));

  const input = reportToInteractionInput(validation.value, { includeInternalSections: true });
  const section = input.sections.find((item) => item.title === "GitHub Trending · Top 10");
  assert(section.content.includes("压缩工具输出、日志、文件和 RAG chunks"));
  assert(section.content.includes("领域：LLM 工具链、RAG、MCP"));
  assert(section.content.includes("==tag-highlight|项目 highlight=="));
  assert(!section.content.includes("目标是减少 token 同时保持回答质量"));
  assert(!section.content.includes("把长日志、工具输出或检索片段"));

  const html = renderReportHtml(validation.value);
  const githubSection = html.slice(html.indexOf('id="github-trending"'), html.indexOf('id="builder-observations"'));
  assert(githubSection.includes("压缩工具输出、日志、文件和 RAG chunks"));
  assert(githubSection.includes("领域：LLM 工具链、RAG、MCP"));
  assert(!githubSection.includes("目标是减少 token 同时保持回答质量"));
  assert(!githubSection.includes("把长日志、工具输出或检索片段"));
});

test("interaction input rewrites generation-log summaries into editorial summaries", async () => {
  const report = JSON.parse(await readFixture("reports/good/structured-report.json"));
  report.summary = "今天用最新 main 重新生成，扩展为 10 条主体信息和 26 个内容单元。";
  report.hero_highlights = [
    {
      title: "Agent harness 成为今日主线",
      url: report.main_items[0].url,
      reason: "工程团队需要把长任务 agent 的规划、执行、审计和回滚拆成可验证边界。"
    }
  ];

  const input = reportToInteractionInput(report, { includeInternalSections: true });

  assert(!input.summary.includes("最新 main"));
  assert(!input.summary.includes("重新生成"));
  assert(input.summary.includes("Agent harness 成为今日主线"));
  assert(input.summary.includes("工程团队需要"));
});

test("interaction input discloses non-primary viewpoint sources without polluting factual sections", async () => {
  const report = JSON.parse(await readFixture("reports/good/structured-report.json"));
  report.hot_blogs[0] = {
    ...report.hot_blogs[0],
    source_level: "intermediary",
    verification_status: "intermediary_only",
    verification_note: "原文是行业媒体/播客整理，未作为事实主线使用。",
    risk_note: "观点和产品信号仅供跟进，具体发布事实需要回到官方公告。",
    reader_relevance: "适合普通工程师判断 agent 平台和工具链的采用顺序。"
  };

  const input = reportToInteractionInput(report);
  const hotBlogsSection = input.sections.find((section) => section.title === "精选博客更新");
  const pointsText = JSON.stringify(hotBlogsSection.items[0].points);

  assert(pointsText.includes("行业媒体/播客整理"));
  assert(pointsText.includes("仅供跟进"));
  assert(!pointsText.includes("普通工程师"));
  assert(!pointsText.includes("看点"));
  assert(!pointsText.includes("风险"));
  assert(!mainMarkdownContent(input).includes("行业媒体/播客整理"));
});

test("interaction input renders source trust tags on public daily items", async () => {
  const report = JSON.parse(await readFixture("reports/good/structured-report.json"));
  report.main_items[0] = {
    ...report.main_items[0],
    source_level: "official",
    verification_status: "primary_confirmed"
  };
  report.hot_blogs[0] = {
    ...report.hot_blogs[0],
    source_level: "intermediary",
    verification_status: "intermediary_only"
  };
  report.builder_observations = [
    {
      author: "Example Builder",
      handle: "examplebuilder",
      role: "maintainer",
      original_text: "AI agents need eval loops before unattended work.",
      translation: "AI agent 在无人值守工作之前需要 eval loops。",
      content: "AI agent 在无人值守工作之前需要 eval loops。",
      url: "https://x.com/examplebuilder/status/1794993600000000000",
      event_date: "2026-05-15",
      source: "follow-builders X feed",
      verification_status: "original_social_only",
      source_level: "original_social"
    }
  ];
  report.community_leads = [
    {
      title: "AI agent 市场线索",
      content: "第三方报道提到 AI agent 平台的企业采用信号。",
      url: "https://techcrunch.com/example-ai-agent-signal",
      event_date: "2026-05-15",
      source: "TechCrunch AI",
      verification_status: "intermediary_only",
      source_level: "intermediary"
    }
  ];

  const input = reportToInteractionInput(report);
  const rendered = JSON.stringify(input);

  assert(rendered.includes("官方一手来源"));
  assert(rendered.includes("第三方报道"));
  assert(rendered.includes("原始社交动态"));
});

test("builder interaction section renders translated Twitter-style cards and omits explicit evidence bullets", async () => {
  const report = JSON.parse(await readFixture("reports/good/structured-report.json"));
  report.builder_observations = [
    {
      author: "Example Builder",
      handle: "examplebuilder",
      role: "maintainer",
      original_text: "Coding agents need eval loops before unattended work.",
      translation: "Coding agent 在无人值守工作之前需要 eval loops。",
      content: "Coding agent 在无人值守工作之前需要 eval loops。",
      url: "https://example.com/builder-post",
      event_date: "2026-05-15",
      source: "follow-builders X feed",
      image_url: "https://example.com/builder-post.png",
      image_alt: "Builder thread screenshot",
      evidence: "Original X URL was collected from follow-builders central feed on 2026-05-15."
    }
  ];
  report.evidence_assets = [
    {
      type: "figure",
      title: "Builder thread screenshot",
      source_url: "https://example.com/builder-post",
      local_path: "assets/evidence/builder-post.png",
      caption: "Cached Builder post image.",
      extraction_status: "source_image"
    }
  ];
  report.self_check.builder_observations = 1;

  const input = reportToInteractionInput(report);
  const section = input.sections.find((item) => item.group === "signals");

  assert.equal(section.title, "X/Twitter 讨论");
  assert.equal(section.type, "filterable-cards");
  assert.equal(section.cardClass, "builder-card");
  assert.equal(section.items[0].title, "Example Builder");
  assert.equal(section.items[0].subtitle, "@examplebuilder");
  assert.equal(section.items[0].body, "Coding agent 在无人值守工作之前需要 eval loops。");
  assert(section.items[0].points.some((point) => point.label === "原文" && point.value.includes("unattended work")));
  assert.equal(section.items[0].media.length, 1);
  assert(section.items[0].media[0].src.endsWith("assets/evidence/builder-post.png"));
  assert(!section.items[0].points.some((point) => point.label === "账号"));
  assert(!JSON.stringify(section).includes("Original X URL was collected"));
  assert(!JSON.stringify(section).includes("证据："));
});

test("compact builder discussion truncates original posts", () => {
  const report = strictPublishReportFixture();
  const longOriginal = Array.from({ length: 20 }, (_unused, index) => `sentence-${index + 1} about agent workflow and deployment tradeoffs`).join(" ");
  report.builder_observations = [
    {
      ...report.builder_observations[0],
      original_text: longOriginal,
      translation: "这是一条关于 agent workflow 部署取舍的中文摘要。",
      content: "这是一条关于 agent workflow 部署取舍的中文摘要。"
    }
  ];

  const input = reportToInteractionInput(report);
  const section = input.sections.find((item) => item.group === "signals" && item.cardClass === "builder-card");
  const originalPoint = section.items[0].points.find((point) => point.value.includes("sentence-1"));

  assert(originalPoint);
  assert(originalPoint.value.length <= 220);
  assert(originalPoint.value.endsWith("..."));
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
  assert(JSON.stringify(section).includes("Example Builder"));
  assert(!JSON.stringify(input).includes("Claude Status"));
  assert(!JSON.stringify(input).includes("elevated errors"));
  assert(!input.sections.some((item) => item.title === "社区线索"));
});

test("domestic community leads stay inside the shared community section", async () => {
  const report = JSON.parse(await readFixture("reports/good/structured-report.json"));
  report.builder_observations = [];
  report.community_leads = [
    {
      content: "雷峰网报道千问 APP 将向第三方 Agent、Skill 开放；当前作为中文产品生态线索，等待官方产品页确认。",
      url: "https://www.leiphone.com/category/industrynews/example.html",
      source: "Leiphone",
      event_date: "2026-06-03",
      source_level: "intermediary",
      verification_status: "intermediary_only",
      verification_note: "中介来源仅作发现线索，事实性结论需要一手或多源确认。"
    },
    {
      content: "TechCrunch 报道海外企业限制 AI 支出；当前作为成本治理社区线索。",
      url: "https://techcrunch.com/example",
      source: "TechCrunch AI",
      event_date: "2026-06-03",
      source_level: "intermediary",
      verification_status: "intermediary_only",
      verification_note: "中介来源，仅作社区观察。"
    }
  ];
  report.self_check.builder_observations = 0;

  const input = reportToInteractionInput(report);
  const builderHeroStat = input.heroStats.find((item) => item.label === "Builder");
  const communitySection = input.sections.find((section) => section.title === "社区线索");

  assert.equal(builderHeroStat.value, "0");
  assert(!input.sections.some((section) => section.title === "国内动态"));
  assert(communitySection);
  assert.equal(communitySection.type, "filterable-cards");
  assert.equal(communitySection.cardClass, "community-card");
  assert.equal(communitySection.items.length, 2);
  const leiphone = communitySection.items.find((item) => item.group === "Leiphone");
  const techcrunch = communitySection.items.find((item) => item.group === "TechCrunch AI");
  assert(leiphone);
  assert.match(leiphone.title, /千问 APP/);
  assert(leiphone.body.includes("千问 APP"));
  assert(!leiphone.body.includes("待确认"));
  assert(!leiphone.body.includes("中介来源仅作发现线索"));
  assert.equal(leiphone.points.length, 0);
  assert(techcrunch);
  assert.match(techcrunch.title, /TechCrunch/);
  assert(techcrunch.body.includes("TechCrunch"));
  assert(!techcrunch.body.includes("待确认"));
  assert.equal(techcrunch.points.length, 0);
});

test("community lead cards keep fuller news summaries and preserve images", async () => {
  const report = JSON.parse(await readFixture("reports/good/structured-report.json"));
  report.builder_observations = [];
  report.self_check.builder_observations = 0;
  report.community_leads = [
    {
      title: "OpenAI is still working on that ‘super app’",
      content: "OpenAI 还在推进“super app”方向，想把聊天和工具入口做成统一应用；讨论焦点在于这些入口会不会继续往同一个应用里收。",
      url: "https://techcrunch.com/2026/06/07/openai-is-still-working-on-that-super-app/",
      source: "TechCrunch AI",
      event_date: "2026-06-08",
      source_level: "intermediary",
      verification_status: "intermediary_only",
      verification_note: "中介来源，仅作社区观察。",
      image_url: "https://example.com/super-app.png",
      image_alt: "OpenAI super app illustration"
    }
  ];
  report.evidence_assets = [
    {
      type: "figure",
      title: "OpenAI super app illustration",
      source_url: "https://techcrunch.com/2026/06/07/openai-is-still-working-on-that-super-app/",
      local_path: "assets/evidence/openai-super-app.png",
      caption: "Cached community illustration.",
      extraction_status: "source_image"
    }
  ];

  const input = reportToInteractionInput(report);
  const section = input.sections.find((item) => item.title === "社区线索");

  assert(section);
  assert.equal(section.type, "filterable-cards");
  assert.equal(section.cardClass, "community-card");
  assert.equal(section.items.length, 1);
  assert.equal(section.items[0].title, "OpenAI 还在推进“super app”方向，想把聊天和工具入口做成统一应用");
  assert.match(section.items[0].body, /这些入口会不会继续往同一个应用里收/);
  assert.equal(section.items[0].media.length, 1);
  assert(section.items[0].media[0].src.endsWith("assets/evidence/openai-super-app.png"));
});

test("public card media prefers local evidence assets and drops remote fallbacks", async () => {
  const report = JSON.parse(await readFixture("reports/good/structured-report.json"));
  report.hot_blogs = [
    {
      ...report.hot_blogs[0],
      image_url: "https://example.com/blog-cover.png",
      image_alt: "Blog cover"
    }
  ];
  report.builder_observations = [
    {
      author: "Example Builder",
      handle: "examplebuilder",
      role: "maintainer",
      original_text: "Coding agents need eval loops before unattended work.",
      translation: "Coding agent 在无人值守工作之前需要 eval loops。",
      content: "Coding agent 在无人值守工作之前需要 eval loops。",
      url: "https://example.com/builder-post",
      event_date: "2026-05-15",
      source: "follow-builders X feed",
      image_url: "https://example.com/builder-post.png",
      image_alt: "Builder thread screenshot"
    }
  ];
  report.community_leads = [
    {
      title: "OpenAI is still working on that ‘super app’",
      content: "OpenAI 还在推进“super app”方向，想把聊天和工具入口做成统一应用；讨论焦点在于这些入口会不会继续往同一个应用里收。",
      url: "https://techcrunch.com/2026/06/07/openai-is-still-working-on-that-super-app/",
      source: "TechCrunch AI",
      event_date: "2026-06-08",
      source_level: "intermediary",
      verification_status: "intermediary_only",
      verification_note: "中介来源，仅作社区观察。",
      image_url: "https://example.com/community-cover.png",
      image_alt: "Community cover"
    }
  ];
  report.evidence_assets = [
    {
      type: "figure",
      title: "Harness architecture",
      source_url: report.hot_blogs[0].url,
      local_path: "assets/evidence/harness-architecture.png",
      caption: "Original blog architecture diagram.",
      extraction_status: "source_image"
    }
  ];

  const input = reportToInteractionInput(report);
  const hotBlogsSection = input.sections.find((section) => section.cardClass === "blog-card");
  const builderSection = input.sections.find((section) => section.cardClass === "builder-card");
  const communitySection = input.sections.find((section) => section.cardClass === "community-card");

  assert.equal(hotBlogsSection.items[0].media.length, 1);
  assert(hotBlogsSection.items[0].media[0].src.endsWith("assets/evidence/harness-architecture.png"));
  assert(!JSON.stringify(hotBlogsSection.items[0].media).includes("https://example.com/blog-cover.png"));
  assert.equal(builderSection.items[0].media?.length || 0, 0);
  assert.equal(communitySection.items[0].media?.length || 0, 0);
});

test("AIGC hero stat counts Chinese signals and omits zero-value cards", async () => {
  const report = JSON.parse(await readFixture("reports/good/structured-report.json"));
  report.main_items = [
    {
      ...report.main_items[0],
      title: "示例模型支持多模态图像生成",
      content: "官方介绍多模态图像生成能力，适合 AIGC 产品团队跟进。",
      summary: "多模态图像生成能力。",
      editorial_category: "model_release"
    }
  ];
  report.hot_blogs = [];
  report.github_trending = [];
  report.projects = [];
  report.builder_observations = [];
  report.community_leads = [];
  report.self_check.builder_observations = 0;

  const input = reportToInteractionInput(report);
  const aigcStat = input.heroStats.find((item) => item.label === "AIGC");
  assert.deepEqual([aigcStat.label, aigcStat.value, aigcStat.detail], ["AIGC", "1", "产品/内容"]);

  report.main_items[0] = {
    ...report.main_items[0],
    title: "示例模型发布",
    content: "官方介绍推理能力和 API 可用性。",
    summary: "推理能力和 API 可用性。"
  };
  const noAigcInput = reportToInteractionInput(report);
  assert(!noAigcInput.heroStats.some((item) => item.label === "AIGC"));
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
  assert(!titles.includes("热门博客"));
  assert(!titles.includes("GitHub Trending 趋势"));
  assert(!titles.includes("今日值得关注的项目"));
  assert(!titles.includes("X/Twitter 讨论与社区线索"));
  assert(!JSON.stringify(input).includes("暂无 X/Twitter 讨论"));
  assert(!JSON.stringify(input).includes("暂无社区线索"));
  assert(!JSON.stringify(input).includes("暂无热门博客"));
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

  const input = reportToInteractionInput(validation.value, { includeInternalSections: true });
  const trendingSection = input.sections.find((item) => item.title === "GitHub Trending · Top 10");
  assert(trendingSection);
  assert(trendingSection.content.includes("3. **[![hardikpandya/stop-slop]"));
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
      source_url: report.main_items[0].url,
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
  assert(html.includes('id="quality-status"'));
  assert(html.includes("发布质量说明"));
  assert(html.includes("Some automated discovery sources failed"));
  assert(html.includes("hot_blogs"));
  assert(!html.includes('id="evidence-assets"'));
  assert(!html.includes('id="model-releases"'));
  const mainHtml = html.slice(html.indexOf('id="main-items"'), html.indexOf('id="hot-blogs"'));
  assert(mainHtml.includes("Coding agent adoption by discipline"));
  assert(mainHtml.includes("anthropic-coding-agents-social-sciences-figure-1.png"));
  assert.equal((mainHtml.match(/anthropic-coding-agents-social-sciences-figure-1\.png/g) || []).length, 1);
  assert(mainHtml.includes("Claude Opus 4.8 performance comparison"));
  assert(mainHtml.includes("Agentic coding"));

  const input = reportToInteractionInput(validation.value, { includeInternalSections: true });
  const qualitySection = input.sections.find((section) => section.title === "发布质量说明");
  assert(qualitySection);
  assert(qualitySection.content.includes("hot_blogs"));
  assert(qualitySection.content.includes("Some automated discovery sources failed"));
  assert(!input.sections.some((section) => section.title === "证据图表"));
  const mainContent = mainMarkdownContent(input);
  assert(mainContent.includes("Coding agent adoption by discipline"));
  assert(mainContent.includes("anthropic-coding-agents-social-sciences-figure-1.png"));
  assert.equal((mainContent.match(/anthropic-coding-agents-social-sciences-figure-1\.png/g) || []).length, 1);
  assert(mainContent.includes("Claude Opus 4.8 performance comparison"));
  assert(mainContent.includes("Agentic coding"));
  assert(mainContent.indexOf("Agentic coding") < mainContent.indexOf("Transcribed from the official launch image."));
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
      title: "Baidu IR update",
      event_date: "2026-05-15",
      url: "https://ir.baidu.com/news-releases/news-release-details/example",
      source: "Baidu Press Releases",
      tier: "T2",
      entities: ["Baidu"],
      summary: "fixture",
      bullets: ["**Baidu** fixture."]
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
    },
    {
      title: "arXiv update",
      event_date: "2026-05-15",
      url: "https://arxiv.org/abs/2605.00001",
      source: "arXiv cs.AI",
      tier: "T2",
      entities: ["arXiv"],
      summary: "fixture",
      bullets: ["**arXiv** fixture."]
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

  const input = reportToInteractionInput(report, { includeInternalSections: true });
  const auditSection = input.sections.find((section) => section.group === "verification" && typeof section.content === "string" && section.content.includes("HNRSS Frontpage"));
  assert(auditSection, "source audit section should be present");
  const mainContent = mainMarkdownContent(input);

  for (const source of [
    "Microsoft Foundry Blog",
    "NVIDIA Developer Blog",
    "MiniMax model page",
    "Alibaba Cloud Blog",
    "Baidu Press Releases",
    "Nature Communications",
    "Andrej Karpathy Blog",
    "Tencent Hunyuan Blog",
    "Ars Technica",
    "HNRSS Frontpage",
    "36Kr",
    "QbitAI"
  ]) {
    assert.match(CACHED_SOURCE_ICONS[source], /^data:image\/(?:png|jpe?g|webp|gif);base64,/, source);
    const sectionContent = mainContent.includes(source) ? mainContent : auditSection.content;
    assert(sectionContent.includes(`![${source}](${CACHED_SOURCE_ICONS[source]})`), source);
    assert(!sectionContent.includes(`![${source}](data:image/svg+xml;base64,`), source);
  }
  assert.equal(CACHED_DOMAIN_ICONS["ir.baidu.com"], CACHED_SOURCE_ICONS["Baidu Press Releases"]);
  assert(mainContent.includes("![arXiv cs.AI](data:image/svg+xml;base64,"));
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
  const mainContent = mainMarkdownContent(input);
  const trendingSection = input.sections.find((section) => section.title.includes("GitHub Trending"));

  assert(mainContent.includes("==tag-topic|coding agent: 7d 8x/4d=="));
  assert(trendingSection.content.includes("==tag-topic|coding agent: 7d 8x/4d=="));
  assert(!input.sections.some((section) => section.cardClass === "project-card"));
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
  assert.equal(collected.source_audit.github_trending.sources[0].parsed_count, 2);
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
  assert.equal(collected.source_audit.github_trending.sources[0].parsed_count, 2);
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
  assert.equal(collected.source_audit.github_trending.sources[1].parsed_count, 1);
  assert.equal(collected.source_audit.github_trending.candidates_found, 1);
  assert.equal(collected.candidates[0].repo, "example/agent-runtime");
  assert.equal(collected.candidates[0].category, "project");
  assert.equal(collected.candidates[0].event_date, "2026-05-26");
});

test("huggingface trending discovery and public section", async () => {
  const collected = await collectHuggingFaceTrending({
    reportDate: "2026-06-11",
    limit: 2,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: new Map([["content-type", "application/json"]]),
      text: async () => JSON.stringify([
        {
          modelId: "Qwen/Qwen3-235B-A22B",
          pipeline_tag: "text-generation",
          downloads: 12345,
          likes: 678,
          tags: ["text-generation", "qwen"]
        },
        {
          modelId: "deepseek-ai/DeepSeek-R2",
          pipeline_tag: "text-generation",
          downloads: 5432,
          likes: 210,
          tags: ["text-generation", "deepseek"]
        }
      ])
    })
  });

  assert.equal(collected.source_audit.huggingface_trending.checked, true);
  assert.equal(collected.candidates.length, 2);
  assert.equal(collected.candidates[0].category, "huggingface_trending");
  assert.equal(collected.candidates[0].rank, 1);
  assert.equal(collected.candidates[0].likes, 678);

  const report = strictPublishReportFixture();
  report.huggingface_trending = collected.candidates.map((candidate, index) => ({
    name: candidate.title,
    repo: candidate.title,
    candidate_id: candidate.id,
    description: candidate.evidence,
    url: candidate.url,
    event_date: candidate.event_date,
    source: candidate.source,
    task: candidate.task,
    downloads: candidate.downloads,
    likes: candidate.likes,
    rank: index + 1,
    trend: "trending",
    evidence: candidate.evidence,
    editorial_category: "open_source",
    source_level: "model_registry",
    verification_status: "primary_confirmed"
  }));
  const input = reportToInteractionInput(report);
  const section = input.sections.find((item) => item.title === "Hugging Face Trending 路 Top 10");

  assert(section);
  assert.match(section.content, /Qwen\/Qwen3-235B-A22B/);
  assert.match(section.content, /likes 678/);
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
  assert.equal(collected.candidates[0].author, "Swyx");
  assert.equal(collected.candidates[0].handle, "swyx");
  assert.equal(collected.candidates[0].original_text, "The model alone is no longer the product; the harness, memory, eval loop, and workflow are the product surface now.");
  assert.equal(collected.candidates[0].avatar_url, "https://unavatar.io/x/swyx");
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
  assert.equal(collected.candidates[0].handle, "examplebuilder");
  assert.match(collected.candidates[0].original_text, /Coding agents need eval loops/);
  assert.equal(collected.candidates[0].avatar_url, "https://unavatar.io/x/examplebuilder");
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
  assert.equal(collected.candidates[0].image_url, "https://example.com/assets/harness.png");
  assert.equal(collected.candidates[0].image_source, "feed");
  assert.match(collected.candidates[0].evidence, /OpenAI engineer interview/i);
});

test("content source discovery keeps late fixed sources effective under global candidate limit", async () => {
  const collected = await collectContentSources({
    reportDate: "2026-06-12",
    generatedAt: fixedGeneratedAt,
    limit: 3,
    perSourceLimit: 3,
    sources: [
      {
        id: "content-early-official",
        name: "Early Official Feed",
        url: "https://example.com/early.xml",
        source_kind: "rss",
        candidate_category: "hot_blog",
        max_items_per_run: 3
      },
      {
        id: "content-middle-official",
        name: "Middle Official Feed",
        url: "https://example.com/middle.xml",
        source_kind: "rss",
        candidate_category: "hot_blog",
        max_items_per_run: 1
      },
      {
        id: "content-late-fixed-source",
        name: "Late Fixed Source",
        url: "https://example.com/late.xml",
        source_kind: "rss",
        candidate_category: "community_lead",
        max_items_per_run: 1
      }
    ],
    fetchImpl: async (url) => textResponse(`
      <rss><channel>
        <item>
          <title>${url.includes("early") ? "Early" : url.includes("middle") ? "Middle" : "Late"} AI signal A</title>
          <link>${String(url).replace(".xml", "/a")}</link>
          <pubDate>Fri, 12 Jun 2026 01:00:00 GMT</pubDate>
          <description>${url} entry A</description>
        </item>
        <item>
          <title>${url.includes("early") ? "Early" : url.includes("middle") ? "Middle" : "Late"} AI signal B</title>
          <link>${String(url).replace(".xml", "/b")}</link>
          <pubDate>Fri, 12 Jun 2026 02:00:00 GMT</pubDate>
          <description>${url} entry B</description>
        </item>
        <item>
          <title>${url.includes("early") ? "Early" : url.includes("middle") ? "Middle" : "Late"} AI signal C</title>
          <link>${String(url).replace(".xml", "/c")}</link>
          <pubDate>Fri, 12 Jun 2026 03:00:00 GMT</pubDate>
          <description>${url} entry C</description>
        </item>
      </channel></rss>
    `)
  });

  assert.equal(collected.candidates.length, 3);
  assert.deepEqual(
    collected.candidates.map((candidate) => candidate.source_id),
    ["content-early-official", "content-middle-official", "content-late-fixed-source"]
  );
  assert.equal(collected.source_audit.content_sources.candidates_found, 5);
  assert(
    collected.source_audit.content_sources.sources.some(
      (source) => source.name === "Late Fixed Source" && source.status === "checked" && source.parsed_count === 3
    )
  );
});

test("GitHub report markdown parser extracts report links as discovery leads", () => {
  const entries = parseGitHubReportMarkdownEntries(`
## Top AI Papers of the Week (May 24 - May 31) - 2026
| **Paper** | **Links** |
| --- | --- |
| 1) **SkillOpt** - Optimizes agent skill documents through validation-gated rollouts. | [Paper](https://arxiv.org/abs/2605.23904), [Tweet](https://x.com/omarsar0/status/2058936160291004483) |

1、[codex-provider-sync](https://hellogithub.com/periodical/statistics/click?target=https://github.com/Dailin521/codex-provider-sync)：Codex 切换 Provider 找回历史对话的工具。
`, {
    name: "GitHub report fixture",
    url: "https://raw.githubusercontent.com/example/repo/main/report.md",
    fallback_event_date: "2026-05-31"
  });

  assert.equal(entries.length, 2);
  assert.equal(entries[0].title, "SkillOpt");
  assert.equal(entries[0].url, "https://arxiv.org/abs/2605.23904");
  assert.equal(entries[0].event_date, "2026-05-31");
  assert.equal(entries[1].title, "codex-provider-sync");
  assert.equal(entries[1].url, "https://github.com/Dailin521/codex-provider-sync");
});

test("content source discovery reads latest GitHub markdown report instead of commit feed", async () => {
  const fetchedUrls = [];
  const collected = await collectContentSources({
    reportDate: "2026-06-05",
    generatedAt: fixedGeneratedAt,
    limit: 10,
    sources: [
      {
        id: "content-ruanyf-weekly",
        name: "RuanYF Weekly",
        url: "https://raw.githubusercontent.com/ruanyf/weekly/master/README.md",
        source_kind: "github_report_markdown",
        candidate_category: "community_lead",
        authority: "aggregator",
        verification_policy: "primary_required",
        latest_report_link_pattern: "docs/issue-\\d+\\.md",
        lookback_days: 14,
        maxItemsPerRun: 2
      }
    ],
    fetchImpl: async (url) => {
      fetchedUrls.push(url);
      if (url.endsWith("/README.md")) {
        return textResponse("- Issue 399: [China AI labs visit](docs/issue-399.md)");
      }
      return textResponse(`
# Weekly issue 399: China AI labs visit
Analysts wrote trip notes: [Kevin Xu](https://interconnect.substack.com/p/chinai-mood-april-26-may-4-2026), [Nathan Lambert](https://www.interconnects.ai/p/notes-from-inside-chinas-ai-labs).
`);
    }
  });

  assert.deepEqual(fetchedUrls, [
    "https://raw.githubusercontent.com/ruanyf/weekly/master/README.md",
    "https://raw.githubusercontent.com/ruanyf/weekly/master/docs/issue-399.md"
  ]);
  assert.equal(collected.source_audit.content_sources.sources[0].status, "checked");
  assert.equal(collected.candidates.length, 2);
  assert.equal(collected.candidates[0].source_id, "content-ruanyf-weekly");
  assert.equal(collected.candidates[0].category, "community_lead");
  assert.equal(collected.candidates[0].verification_status, "intermediary_only");
  assert.match(collected.candidates[0].notes, /source_report_url=https:\/\/raw\.githubusercontent\.com\/ruanyf\/weekly\/master\/docs\/issue-399\.md/);
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
  assert(names.includes("SSPAI"));
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
    ["ML-Papers-of-the-Week", ["https://raw.githubusercontent.com/dair-ai/ML-Papers-of-the-Week/main/README.md"]],
    ["HelloGitHub", ["https://raw.githubusercontent.com/521xueweihan/HelloGitHub/master/README.md"]],
    ["RuanYF Weekly", ["https://raw.githubusercontent.com/ruanyf/weekly/master/README.md"]],
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
    ["Jiqizhixin", ["https://www.jiqizhixin.com/articles"]],
    ["QbitAI", ["https://www.qbitai.com/feed"]],
    ["SSPAI", ["https://sspai.com/feed"]],
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

test("registered content sources include fixed daily tracking leaderboards", async () => {
  const registry = JSON.parse(await fs.readFile(path.join(rootDir, "config/sources/default-content-sources.json"), "utf8"));
  const sourcesById = new Map(registry.sources.map((source) => [source.id, source]));
  const expected = [
    ["content-openrouter-rankings", "https://openrouter.ai/rankings"],
    ["content-artificial-analysis-intelligence-index", "https://artificialanalysis.ai/evaluations/artificial-analysis-intelligence-index"],
    ["content-swe-bench-pro-public", "https://scale.com/leaderboard/swe_bench_pro_public"]
  ];

  for (const [id, url] of expected) {
    const source = sourcesById.get(id);
    assert(source, `missing source ${id}`);
    assert.equal(normalizedSourceUrl(source.url), normalizedSourceUrl(url));
    const expectedSourceKind = new Map([
      ["content-openrouter-rankings", "openrouter_rankings_public_playwright"],
      ["content-artificial-analysis-intelligence-index", "artificial_analysis_index_public_playwright"]
    ]);
    assert.equal(source.source_kind, expectedSourceKind.get(id) || "html_index");
    assert.equal(source.candidate_category, "community_lead");
    assert.equal(source.authority, "primary");
    assert.equal(source.enablement, "core");
    assert.equal(source.verification_policy, "primary_allowed");
  }
});

test("parseOpenRouterRankingsText extracts public Top 10 rows", () => {
  const rows = parseOpenRouterRankingsText(openRouterRankingsSampleText());

  assert.equal(rows.length, 10);
  assert.deepEqual(rows[0], {
    rank: 1,
    model: "DeepSeek V4 Flash",
    provider: "deepseek",
    tokens: "2.9T tokens",
    change: "18%"
  });
  assert.equal(rows[7].change, "new");
  assert.deepEqual(rows.map((row) => row.rank), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test("collectContentSources stores OpenRouter public page snapshot without candidate pollution", async () => {
  const collected = await collectContentSources({
    reportDate: "2026-06-05",
    generatedAt: fixedGeneratedAt,
    sources: [
      {
        id: "content-openrouter-rankings",
        name: "OpenRouter Rankings",
        url: "https://openrouter.ai/rankings",
        source_kind: "openrouter_rankings_public_playwright",
        candidate_category: "community_lead",
        tier: "T0",
        authority: "primary",
        enablement: "core",
        verification_policy: "primary_allowed"
      }
    ],
    openrouterRankingsText: openRouterRankingsSampleText()
  });

  const source = collected.source_audit.content_sources.sources[0];
  assert.equal(source.status, "checked");
  assert.match(source.notes, /public_page_snapshot/);
  assert.equal(source.snapshot.snapshot_status, "complete");
  assert.equal(source.snapshot.collection_method, "public_page_playwright");
  assert.equal(source.snapshot.top_entries.length, 10);
  assert.equal(source.snapshot.top_entries[0].model, "DeepSeek V4 Flash");
  assert.equal(collected.candidates.length, 0);
});

test("collectContentSources degrades OpenRouter snapshot when Top 10 is incomplete", async () => {
  const collected = await collectContentSources({
    reportDate: "2026-06-05",
    generatedAt: fixedGeneratedAt,
    sources: [
      {
        id: "content-openrouter-rankings",
        name: "OpenRouter Rankings",
        url: "https://openrouter.ai/rankings",
        source_kind: "openrouter_rankings_public_playwright",
        candidate_category: "community_lead",
        tier: "T0",
        authority: "primary",
        enablement: "core",
        verification_policy: "primary_allowed"
      }
    ],
    openrouterRankingsText: openRouterRankingsSampleText(8)
  });

  const source = collected.source_audit.content_sources.sources[0];
  assert.equal(source.status, "no_signal");
  assert.match(source.notes, /top10_incomplete/);
  assert.equal(source.snapshot.snapshot_status, "partial");
  assert.equal(source.snapshot.top_entries.length, 8);
});

test("collectContentSources stores OpenRouter weekly history for local tracking components", async () => {
  const collected = await collectContentSources({
    reportDate: "2026-06-05",
    generatedAt: fixedGeneratedAt,
    sources: [
      {
        id: "content-openrouter-rankings",
        name: "OpenRouter Rankings",
        url: "https://openrouter.ai/rankings",
        source_kind: "openrouter_rankings_public_playwright",
        candidate_category: "community_lead",
        tier: "T0",
        authority: "primary",
        enablement: "core",
        verification_policy: "primary_allowed"
      }
    ],
    openrouterRankingsText: openRouterRankingsHistorySampleText()
  });

  const source = collected.source_audit.content_sources.sources[0];
  assert.equal(source.status, "checked");
  assert.equal(source.snapshot.snapshot_status, "complete");
  assert.equal(source.snapshot.history_entries.length, 9);
  assert(source.snapshot.history_entries.some((row) =>
    row.week === "2026-05-18" &&
    row.model === "DeepSeek V4 Flash" &&
    row.tokens === "2.9T tokens"
  ));

  const component = buildTrackingComponentSnapshot({
    id: "openrouter-rankings",
    name: "OpenRouter",
    url: "https://openrouter.ai/rankings",
    source: "OpenRouter Rankings",
    snapshot: source.snapshot
  });

  const topModels = component.series.find((series) => series.tab_id === "top-models");
  assert.equal(topModels.fallback_reason, "");
  assert(topModels.rows.some((row) =>
    row.metric === "2026-05-18" &&
    row.model === "DeepSeek V4 Flash" &&
    row.value_label === "2.9T tokens"
  ));
  assert(component.public_trace.top_rows.some((row) => row.model === "DeepSeek V4 Flash"));
  assert(!JSON.stringify(component.public_trace).includes("raw_dom"));
});

test("parseArtificialAnalysisIndexText extracts public Intelligence Index Top 10 rows", () => {
  const rows = parseArtificialAnalysisIndexText(artificialAnalysisIndexSampleText());

  assert.equal(rows.length, 10);
  assert.deepEqual(rows[0], {
    rank: 1,
    model: "Claude Opus 4.8 (Adaptive Reasoning, Max Effort)",
    provider: "anthropic",
    tokens: "61 分",
    change: "AA Index"
  });
  assert.equal(rows[1].provider, "openai");
  assert.equal(rows[4].provider, "google");
  assert.equal(rows[9].provider, "xiaomi");
});

test("collectContentSources stores Artificial Analysis public page snapshot without candidate pollution", async () => {
  const collected = await collectContentSources({
    reportDate: "2026-06-05",
    generatedAt: fixedGeneratedAt,
    sources: [
      {
        id: "content-artificial-analysis-intelligence-index",
        name: "Artificial Analysis Intelligence Index",
        url: "https://artificialanalysis.ai/evaluations/artificial-analysis-intelligence-index",
        source_kind: "artificial_analysis_index_public_playwright",
        candidate_category: "community_lead",
        tier: "T0",
        authority: "primary",
        enablement: "core",
        verification_policy: "primary_allowed"
      }
    ],
    artificialAnalysisIndexText: artificialAnalysisIndexSampleText()
  });

  const source = collected.source_audit.content_sources.sources[0];
  assert.equal(source.status, "checked");
  assert.match(source.notes, /public_page_snapshot/);
  assert.equal(source.snapshot.snapshot_status, "complete");
  assert.equal(source.snapshot.collection_method, "public_page_playwright");
  assert.equal(source.snapshot.top_entries.length, 10);
  assert.equal(source.snapshot.top_entries[0].model, "Claude Opus 4.8 (Adaptive Reasoning, Max Effort)");
  assert.equal(collected.candidates.length, 0);
});

test("collectContentSources stores Artificial Analysis token cost and scatter tabs", async () => {
  const collected = await collectContentSources({
    reportDate: "2026-06-05",
    generatedAt: fixedGeneratedAt,
    sources: [
      {
        id: "content-artificial-analysis-intelligence-index",
        name: "Artificial Analysis Intelligence Index",
        url: "https://artificialanalysis.ai/evaluations/artificial-analysis-intelligence-index",
        source_kind: "artificial_analysis_index_public_playwright",
        candidate_category: "community_lead",
        tier: "T0",
        authority: "primary",
        enablement: "core",
        verification_policy: "primary_allowed"
      }
    ],
    artificialAnalysisIndexText: artificialAnalysisComponentSampleText()
  });

  const source = collected.source_audit.content_sources.sources[0];
  assert.equal(source.status, "checked");
  assert.equal(source.snapshot.snapshot_status, "complete");
  assert.equal(source.snapshot.component_tabs.token_usage.rows.length, 3);
  assert.equal(source.snapshot.component_tabs.cost.rows.length, 3);
  assert.equal(source.snapshot.component_tabs.score_vs_token_usage.rows.length, 3);
  assert.equal(source.snapshot.component_tabs.score_vs_cost.rows.length, 3);
  assert.equal(source.snapshot.component_tabs.score_vs_compute.rows.length, 3);

  const component = buildTrackingComponentSnapshot({
    id: "artificial-analysis-intelligence-index",
    name: "Artificial Analysis",
    url: "https://artificialanalysis.ai/evaluations/artificial-analysis-intelligence-index",
    source: "Artificial Analysis Intelligence Index",
    snapshot: source.snapshot
  });

  const tabsById = new Map(component.tabs.map((tab) => [tab.id, tab]));
  assert.equal(tabsById.get("token-usage").status, "complete");
  assert.equal(tabsById.get("token-usage").fallback_reason, "");
  assert.equal(tabsById.get("cost").status, "complete");
  assert.equal(tabsById.get("score-vs-token-usage").status, "complete");
  assert.equal(tabsById.get("score-vs-cost").status, "complete");
  assert.equal(tabsById.get("score-vs-compute").status, "complete");

  const tokenUsage = component.series.find((series) => series.tab_id === "token-usage");
  const cost = component.series.find((series) => series.tab_id === "cost");
  const scoreVsCost = component.series.find((series) => series.tab_id === "score-vs-cost");
  assert(tokenUsage.rows.some((row) => row.model.includes("Claude Opus 4.8") && row.value_label === "676M"));
  assert(cost.rows.some((row) => row.model.includes("GPT-5.5") && row.value_label === "$3,357"));
  assert(scoreVsCost.rows.some((row) => row.model.includes("Gemini") && row.metric === "Score vs. Cost"));
  assert(!JSON.stringify(component.public_trace).includes("raw_dom"));
});

test("report:draft publishes OpenRouter snapshot as reader-facing daily tracking card", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-openrouter-snapshot-"));
  const reportDate = "2026-06-05";
  const discoveryPath = path.join(tmp, "discovery.json");
  const discovery = autodraftDiscoveryFixture(reportDate);
  discovery.source_audit.content_sources.sources.push({
    name: "OpenRouter Rankings",
    url: "https://openrouter.ai/rankings",
    status: "checked",
    notes: "public_page_snapshot; 10 top models parsed; collection_method=playwright_dom",
    snapshot: openRouterSnapshotFixture()
  });
  await fs.writeFile(discoveryPath, `${JSON.stringify(discovery, null, 2)}\n`, "utf8");

  const drafted = await generateReportDraft({
    rootDir: tmp,
    reportDate,
    generatedAt: fixedGeneratedAt,
    inputPaths: [discoveryPath],
    cacheEvidence: false
  });

  const tracking = drafted.report.daily_tracking.find((item) => item.id === "openrouter-rankings");
  assert.equal(tracking.publish_to_public, true);
  assert.equal(tracking.change_status, "changed");
  assert.equal(tracking.verification_status, "primary_confirmed");
  assert.equal(tracking.snapshot.top_entries.length, 10);
  assert.equal(tracking.tracking_component_snapshot.component_kind, "openrouter_rankings");
  assert.equal(tracking.tracking_component_snapshot.public_trace.selector_version, "openrouter-rankings-v1");
  assert(tracking.summary.includes("DeepSeek V4 Flash"));
  assert(tracking.metrics.some((metric) => metric.label === "#10" && metric.value.includes("DeepSeek V3.2")));
  assert(tracking.watch_points.some((point) => point.includes("MiniMax M3") || point.includes("MiMo-V2.5")));

  const input = reportToInteractionInput(drafted.report);
  const trackingSection = input.sections.find((section) => section.title === "每日追踪" || section.title.includes("追踪"));
  assert(trackingSection);
  assert.equal(trackingSection.items.length, 1);
  assert.equal(trackingSection.items[0].title, "OpenRouter");
  assert.equal(trackingSection.items[0].points.length, 0);
  assert.equal(trackingSection.items[0].table.rows.length, 10);
  assert.equal(trackingSection.items[0].component.kind, "openrouter_rankings");
  assert.equal(trackingSection.items[0].component.tabs.length, 2);
  assert(trackingSection.items[0].table.rows.some((row) => row.rank === "#1" && row.tokens.includes("2.9T tokens")));
  assert(trackingSection.items[0].table.rows.some((row) => row.rank === "#10" && row.tokens.includes("1.11T tokens")));
  assert(trackingSection.items[0].bars.rows.some((row) => row.label === "deepseek" && row.value === 3));
  assert(trackingSection.items[0].stats.some((stat) => stat.label === "榜首" && stat.value === "DeepSeek V4 Flash"));
  assert(!JSON.stringify(trackingSection).includes("Playwright"));
  assert(!JSON.stringify(trackingSection).includes("DOM"));
});

test("report:draft publishes Artificial Analysis snapshot as reader-facing daily tracking card", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-artificial-analysis-snapshot-"));
  const reportDate = "2026-06-05";
  const discoveryPath = path.join(tmp, "discovery.json");
  const discovery = autodraftDiscoveryFixture(reportDate);
  discovery.source_audit.content_sources.sources.push(
    {
      name: "Artificial Analysis Intelligence Index",
      url: "https://artificialanalysis.ai/evaluations/artificial-analysis-intelligence-index",
      status: "no_signal",
      notes: "0 recent intermediary lead entries parsed"
    },
    {
      name: "Artificial Analysis Intelligence Index",
      url: "https://artificialanalysis.ai/evaluations/artificial-analysis-intelligence-index",
      status: "checked",
      notes: "public_page_snapshot; 10 top models parsed; collection_method=playwright_dom",
      snapshot: artificialAnalysisSnapshotFixture()
    }
  );
  await fs.writeFile(discoveryPath, `${JSON.stringify(discovery, null, 2)}\n`, "utf8");

  const drafted = await generateReportDraft({
    rootDir: tmp,
    reportDate,
    generatedAt: fixedGeneratedAt,
    inputPaths: [discoveryPath],
    cacheEvidence: false
  });

  const tracking = drafted.report.daily_tracking.find((item) => item.id === "artificial-analysis-intelligence-index");
  assert.equal(tracking.publish_to_public, true);
  assert.equal(tracking.change_status, "changed");
  assert.equal(tracking.verification_status, "primary_confirmed");
  assert.equal(tracking.snapshot.top_entries.length, 10);
  assert.equal(tracking.tracking_component_snapshot.component_kind, "artificial_analysis_index");
  assert.equal(tracking.tracking_component_snapshot.tabs.length, 6);
  assert(tracking.summary.includes("Claude Opus 4.8"));
  assert(tracking.metrics.some((metric) => metric.label === "#10" && metric.value.includes("54 分")));

  const input = reportToInteractionInput(drafted.report);
  const trackingSection = input.sections.find((section) => section.items?.some((item) => item.title === "Artificial Analysis"));
  assert(trackingSection);
  const card = trackingSection.items.find((item) => item.title === "Artificial Analysis");
  assert.equal(card.points.length, 0);
  assert.equal(card.component.kind, "artificial_analysis_index");
  assert.equal(card.component.tabs.length, 6);
  assert.equal(card.table.rows.length, 10);
  assert(card.table.columns.some((column) => column.key === "tokens" && column.label === "分数"));
  assert(card.table.columns.some((column) => column.key === "change" && column.label === "指标"));
  assert(card.table.rows.some((row) => row.rank === "#1" && row.tokens === "61 分"));
});

test("registered source registry covers official company news lanes", async () => {
  const registry = await loadSourceRegistry({
    rootDir,
    includeEnablement: "core,optional"
  });
  const sourcesById = new Map(registry.sources.map((source) => [source.id, source]));
  const expected = [
    ["content-google-keyword", "https://blog.google/rss/"],
    ["content-microsoft-official-blog", "https://blogs.microsoft.com/feed/"],
    ["content-apple-newsroom", "https://www.apple.com/newsroom/rss-feed.rss"],
    ["content-meta-newsroom", "https://about.fb.com/news/feed/"],
    ["content-amazon-news", "https://www.aboutamazon.com/news/rss"],
    ["content-nvidia-newsroom-rss", "https://nvidianews.nvidia.com/rss.xml"],
    ["content-github-blog-feed", "https://github.blog/feed/"],
    ["content-openai-company-news", "https://openai.com/news/rss.xml"],
    ["content-anthropic-company-news", "https://www.anthropic.com/news"],
    ["content-xai-company-news", "https://x.ai/news"],
    ["content-tencent-media-center", "https://www.tencent.com/en-us/media.html"],
    ["content-huawei-newsroom", "https://www.huawei.com/en/news/"],
    ["content-bytedance-news", "https://www.bytedance.com/en/news"],
    ["content-alibaba-group-press-releases", "https://www.alibabagroup.com/en-US/news-press-releases"],
    ["content-baidu-press-releases", "https://ir.baidu.com/index.php/press-releases"],
    ["content-xiaomi-investor-relations", "https://ir.mi.com/"],
    ["content-jd-investor-news", "https://ir.jd.com/news-releases/"],
    ["content-netease-company-news", "https://ir.netease.com/news-releases"],
    ["content-kuaishou-company-news", "https://kuaishou.gcs-web.com/news-events/company-news"],
    ["content-meituan-investor-relations", "https://www.meituan.com/en-US/investor-relations"],
    ["content-moonshot-kimi-company-news", "https://platform.kimi.com/blog"],
    ["content-minimax-company-news", "https://www.minimax.io/blog"]
  ];

  for (const [id, url] of expected) {
    const source = sourcesById.get(id);
    assert(source, `missing company news source ${id}`);
    assert.equal(source.url, url);
    assert.equal(source.candidate_category, "community_lead");
    assert.equal(source.authority, "primary");
    assert.equal(source.verification_policy, "primary_allowed");
    assert.equal(source.source_level, "official_company_news");
  }
});

test("registered source registry covers official open-source account lanes", async () => {
  const registry = await loadSourceRegistry({
    rootDir,
    includeEnablement: "core,optional"
  });
  const sourcesById = new Map(registry.sources.map((source) => [source.id, source]));
  const expected = [
    ["content-github-openai-org", "https://github.com/openai.atom", "official_open_source_account"],
    ["content-github-anthropics-org", "https://github.com/anthropics.atom", "official_open_source_account"],
    ["content-github-google-deepmind-org", "https://github.com/google-deepmind.atom", "official_open_source_account"],
    ["content-github-meta-llama-org", "https://github.com/meta-llama.atom", "official_open_source_account"],
    ["content-github-deepseek-ai-org", "https://github.com/deepseek-ai.atom", "official_open_source_account"],
    ["content-github-qwenlm-org", "https://github.com/QwenLM.atom", "official_open_source_account"],
    ["content-github-moonshotai-org", "https://github.com/moonshotai.atom", "official_open_source_account"],
    ["content-github-minimax-ai-org", "https://github.com/MiniMax-AI.atom", "official_open_source_account"],
    ["content-github-tencent-hunyuan-org", "https://github.com/Tencent-Hunyuan.atom", "official_open_source_account"],
    ["content-github-tencent-org", "https://github.com/Tencent.atom", "official_open_source_account"],
    ["content-github-bytedance-org", "https://github.com/bytedance.atom", "official_open_source_account"],
    ["content-github-baidu-org", "https://github.com/baidu.atom", "official_open_source_account"],
    ["content-github-alibaba-org", "https://github.com/alibaba.atom", "official_open_source_account"],
    ["content-github-meituan-org", "https://github.com/meituan.atom", "official_open_source_account"],
    ["content-github-microsoft-org", "https://github.com/microsoft.atom", "official_open_source_account"],
    ["content-github-nvidia-org", "https://github.com/NVIDIA.atom", "official_open_source_account"],
    ["content-github-paddlepaddle-org", "https://github.com/PaddlePaddle.atom", "official_open_source_account"],
    ["content-huggingface-openai", "https://huggingface.co/openai", "official_model_host_account"],
    ["content-huggingface-anthropic", "https://huggingface.co/Anthropic", "official_model_host_account"],
    ["content-huggingface-deepseek-ai", "https://huggingface.co/deepseek-ai", "official_model_host_account"],
    ["content-huggingface-minimaxai", "https://huggingface.co/MiniMaxAI", "official_model_host_account"],
    ["content-huggingface-qwen", "https://huggingface.co/Qwen", "official_model_host_account"],
    ["content-huggingface-zai-org", "https://huggingface.co/zai-org", "official_model_host_account"],
    ["content-huggingface-bytedance-seed", "https://huggingface.co/ByteDance-Seed", "official_model_host_account"],
    ["content-huggingface-moonshotai", "https://huggingface.co/moonshotai", "official_model_host_account"],
    ["content-huggingface-meta-llama", "https://huggingface.co/meta-llama", "official_model_host_account"],
    ["content-huggingface-paddlepaddle", "https://huggingface.co/PaddlePaddle", "official_model_host_account"],
    ["content-huggingface-microsoft", "https://huggingface.co/microsoft", "official_model_host_account"],
    ["content-huggingface-nvidia", "https://huggingface.co/nvidia", "official_model_host_account"]
  ];

  for (const [id, url, sourceLevel] of expected) {
    const source = sourcesById.get(id);
    assert(source, `missing official open-source source ${id}`);
    assert.equal(source.url, url);
    assert.equal(source.candidate_category, "community_lead");
    assert.equal(source.authority, "primary");
    assert.equal(source.verification_policy, "primary_allowed");
    assert.equal(source.source_level, sourceLevel);
  }
});

test("general news registry includes company and open-source discovery lanes", async () => {
  const registry = await loadSourceRegistry({
    rootDir,
    includeEnablement: "core,optional"
  });
  const sourcesById = new Map(registry.sources.map((source) => [source.id, source]));
  const expected = [
    ["general-news-google-big-tech-company-watch", ["layoffs", "reorganization", "earnings", "GitHub"]],
    ["general-news-google-china-big-tech-company-watch", ["Tencent", "ByteDance", "Meituan", "Hugging%20Face"]],
    ["general-news-google-official-open-source-watch", ["GitHub", "Hugging%20Face", "model%20weights"]]
  ];

  for (const [id, fragments] of expected) {
    const source = sourcesById.get(id);
    assert(source, `missing general news lane ${id}`);
    assert.equal(source.candidate_category, "community_lead");
    assert.equal(source.authority, "aggregator");
    assert.equal(source.verification_policy, "primary_required");
    for (const fragment of fragments) {
      assert(source.url.includes(fragment), `${id} url missing ${fragment}`);
    }
  }
});

test("search queries include company and official open-source watches", async () => {
  const queries = JSON.parse(await fs.readFile(path.join(rootDir, "config/search-queries.json"), "utf8"));
  const queriesById = new Map(queries.map((query) => [query.id, query]));
  const expected = [
    ["big-tech-company-watch", ["blog.google", "blogs.microsoft.com", "aboutamazon.com", "github.com", "huggingface.co"]],
    ["china-big-tech-company-watch", ["www.tencent.com", "www.bytedance.com", "www.alibabagroup.com", "www.meituan.com", "github.com", "huggingface.co"]],
    ["official-open-source-account-watch", ["github.com", "huggingface.co", "qwen.ai", "www.minimax.io", "z.ai"]]
  ];

  for (const [id, domains] of expected) {
    const query = queriesById.get(id);
    assert(query, `missing search query ${id}`);
    assert.equal(query.candidate_category, "community_lead");
    assert.equal(query.verification_policy, "primary_required");
    assert.match(query.query, /GitHub/i);
    assert.match(query.query, /open[-\s]source/i);
    for (const domain of domains) {
      assert(query.allowed_primary_domains.includes(domain), `${id} missing allowed domain ${domain}`);
    }
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

test("content source discovery reads date-scoped WeChat article input without leaking local paths", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-wechat-input-"));
  const inputPath = path.join(tmp, "2026-05-26.json");
  await fs.writeFile(inputPath, JSON.stringify({
    schema_version: 1,
    report_date: "2026-05-26",
    articles: [
      {
        url: "https://mp.weixin.qq.com/s/example?scene=21&from=timeline",
        account_name: "AI Product Notes",
        published_at: "2026-05-26T09:00:00+08:00",
        title: "AI video tools reshape creator workflows",
        summary: "A whitelist WeChat article tracks product and creator workflow changes.",
        risk_level: "low",
        allowed_sections: ["community_leads", "opinion_analysis"],
        verification_notes: "Low-risk industry interpretation; product claims require primary confirmation.",
        risk_notes: "No funding, pricing, benchmark, safety, or regulatory claim is used as fact.",
        reader_relevance: "Useful for AIGC content-industry monitoring."
      }
    ]
  }), "utf8");

  const collected = await collectContentSources({
    reportDate: "2026-05-26",
    generatedAt: fixedGeneratedAt,
    sources: [],
    wechatInputPath: inputPath,
    fetchImpl: async () => textResponse(emptyRssFixture())
  });

  assert.equal(collected.candidates.length, 1);
  assert.equal(collected.candidates[0].category, "community_lead");
  assert.equal(collected.candidates[0].source_level, "wechat_industry_whitelist");
  assert.equal(collected.candidates[0].url, "https://mp.weixin.qq.com/s/example");
  assert.match(collected.candidates[0].notes, /input_path_redacted=true/);
  assert.doesNotMatch(JSON.stringify(collected), new RegExp(escapeRegExp(tmp)));
  const auditSource = collected.source_audit.content_sources.sources.find((source) => source.name === "WeChat Article Link Input");
  assert.equal(auditSource.status, "checked");
  assert.doesNotMatch(auditSource.notes, /ai-daily-wechat-input/);
});

test("content source discovery rejects WeChat article input containing local machine paths", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-wechat-input-"));
  const inputPath = path.join(tmp, "2026-05-26.json");
  await fs.writeFile(inputPath, JSON.stringify({
    schema_version: 1,
    report_date: "2026-05-26",
    articles: [
      {
        url: "https://mp.weixin.qq.com/s/example",
        account_name: "AI Product Notes",
        published_at: "2026-05-26T09:00:00+08:00",
        title: "AI video tools reshape creator workflows",
        summary: "Draft came from C:\\Users\\Admin\\.codex\\automations\\ai-daily\\inputs\\wechat\\2026-05-26.json",
        risk_level: "low",
        verification_notes: "Low-risk industry interpretation."
      }
    ]
  }), "utf8");

  await assert.rejects(
    () => collectContentSources({
      reportDate: "2026-05-26",
      generatedAt: fixedGeneratedAt,
      sources: [],
      wechatInputPath: inputPath,
      fetchImpl: async () => textResponse(emptyRssFixture())
    }),
    (error) => error.code === "wechat_input_privacy_violation"
  );
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
  assert.equal(collected.candidates[0].image_url, "https://example.com/assets/claude-code.png");
  assert.equal(collected.candidates[0].image_source, "html_index");
  assert.match(collected.candidates[0].evidence, /Claude Code team explained/);
  assert.equal(collected.sources[1].category, "project");
  assert.equal(collected.candidates[1].category, "project");
  assert.equal(collected.candidates[1].source_id, "product-hunt-devtools");
  assert.equal(collected.candidates[1].signal, "product_hunt");
  assert.equal(collected.candidates[1].url, "https://www.producthunt.com/products/agent-debugger");
});

test("content source discovery parses company news HTML with dotted dates before links", async () => {
  const collected = await collectContentSources({
    reportDate: "2026-05-06",
    generatedAt: fixedGeneratedAt,
    sources: [
      {
        id: "content-kuaishou-company-news",
        name: "Kuaishou Company News",
        url: "https://kuaishou.example.com/news-events/company-news",
        source_kind: "html_index",
        candidate_category: "community_lead",
        authority: "primary",
        verification_policy: "primary_allowed",
        format: "html_index",
        linkPattern: "/news-releases/news-release-details/",
        source_level: "official_company_news"
      }
    ],
    fetchImpl: async () => textResponse(`
      <main>
        <article>
          <span>2026.05.06</span>
          <a href="/news-releases/news-release-details/kuaishou-reports-quarterly-results">
            Kuaishou Technology to Report 2026 First Quarter Financial Results
          </a>
          Official company news covering results timing, management commentary, and investor-facing operating signals.
          <img alt="Hero image" loading="lazy"
        </article>
      </main>
    `)
  });

  assert.equal(collected.source_audit.content_sources.candidates_found, 1);
  assert.equal(collected.source_audit.content_sources.sources[0].status, "checked");
  assert.equal(collected.candidates[0].source_id, "content-kuaishou-company-news");
  assert.equal(collected.candidates[0].category, "community_lead");
  assert.equal(collected.candidates[0].event_date, "2026-05-06");
  assert.equal(collected.candidates[0].verification_status, "primary_confirmed");
  assert.equal(collected.candidates[0].url, "https://kuaishou.example.com/news-releases/news-release-details/kuaishou-reports-quarterly-results");
  assert(!collected.candidates[0].evidence.includes("<img"));
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

test("search news discovery preserves provider-level partial results and timing", async () => {
  const collected = await collectSearchNews({
    reportDate: "2026-05-26",
    generatedAt: fixedGeneratedAt,
    providers: "gdelt,openalex",
    queries: [
      {
        id: "frontier-labs-release",
        query: "OpenAI release",
        candidate_category: "community_lead",
        verification_policy: "primary_required",
        allowed_primary_domains: ["openai.com"]
      }
    ],
    retryDelayMs: 0,
    fetchImpl: async (url) => {
      if (String(url).includes("gdeltproject")) {
        throw new Error("fetch failed");
      }
      return jsonResponse({
        results: [
          {
            title: "OpenAI example release paper",
            primary_location: {
              landing_page_url: "https://openai.com/news/example-release-paper",
              source: { display_name: "OpenAI" }
            },
            publication_date: "2026-05-26",
            type: "article"
          }
        ]
      });
    }
  });

  const audit = collected.source_audit.search_sources;
  assert.equal(audit.sources.find((source) => source.name === "GDELT").status, "blocked");
  assert.equal(audit.sources.find((source) => source.name === "OpenAlex").status, "checked");
  assert.equal(collected.candidates.length, 1);
  assert.equal(collected.candidates[0].source, "OpenAlex");
  assert(Number.isInteger(audit.provider_runtime_ms.gdelt));
  assert(Number.isInteger(audit.provider_runtime_ms.openalex));
  assert.equal(audit.provider_error_counts.gdelt, 1);
  assert.equal(audit.provider_error_counts.openalex, 0);
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
        },
        {
          id: "health-wechat2rss",
          name: "Health Wechat2RSS",
          url: "https://wechat2rss.example.invalid/feed.xml",
          source_kind: "aggregator",
          candidate_category: "community_lead",
          tier: "T3",
          authority: "aggregator",
          enablement: "manual",
          verification_policy: "primary_required",
          url_env: "AI_DAILY_TEST_WECHAT2RSS_FEED_URL"
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
  assert.equal(health.results[3].status, "skipped_missing_base_url");
});

test("shared URL identity normalizes tracking parameters for dedupe gates", () => {
  assert.equal(
    normalizeUrlIdentity("https://www.Example.com/news/item/?utm_source=newsletter&ref=feed#section"),
    "https://example.com/news/item?ref=feed"
  );
  assert.equal(
    normalizeUrlIdentity("https://example.com/news/item?ref=feed&utm_campaign=daily"),
    "https://example.com/news/item?ref=feed"
  );
});

test("shared npm invocation wraps npm through cmd on Windows", () => {
  const windows = npmInvocationForArgs(["ci", "--cache", "C:\\tmp\\npm cache"], { platform: "win32" });
  assert.equal(windows.file, "cmd.exe");
  assert.deepEqual(windows.args.slice(0, 3), ["/d", "/s", "/c"]);
  assert.match(windows.args[3], /^npm ci --cache /);
  assert.match(windows.args[3], /npm cache/);

  const linux = npmInvocationForArgs(["ci"], { platform: "linux" });
  assert.equal(linux.file, "npm");
  assert.deepEqual(linux.args, ["ci"]);
});

test("public artifact privacy scan blocks local machine path leakage", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-privacy-scan-"));
  await fs.mkdir(path.join(tmp, "docs/reports"), { recursive: true });
  await fs.mkdir(path.join(tmp, "docs/data"), { recursive: true });
  await fs.mkdir(path.join(tmp, "reports-data"), { recursive: true });
  await fs.writeFile(path.join(tmp, "docs/reports/report.html"), "<p>C:\\Users\\Admin\\.codex\\automations\\ai-daily</p>", "utf8");
  await fs.writeFile(path.join(tmp, "docs/data/report.json"), "{\"ok\":true}", "utf8");
  const blocked = await scanPublicArtifactsForLocalInfo({ rootDir: tmp });
  assert.equal(blocked.ok, false);
  assert(blocked.findings.some((finding) => finding.pattern === "windows_user_path"));

  await fs.writeFile(path.join(tmp, "docs/reports/report.html"), "<p>https://mp.weixin.qq.com/s/example</p>", "utf8");
  const clean = await scanPublicArtifactsForLocalInfo({ rootDir: tmp });
  assert.equal(clean.ok, true, JSON.stringify(clean.findings));
});

test("CLI JSON commands can write clean UTF-8 output files", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-cli-output-"));
  const outputPath = path.join(tmp, "sources-validate.json");

  const result = await execFileAsync(process.execPath, [
    path.join(rootDir, "src/cli.js"),
    "sources:validate",
    "--output",
    outputPath
  ], {
    cwd: rootDir,
    maxBuffer: 1024 * 1024
  });

  assert.match(result.stdout, /"ok": true/);
  const raw = await fs.readFile(outputPath, "utf8");
  const parsed = JSON.parse(raw);
  assert.equal(parsed.ok, true);
  assert(parsed.source_count >= 63);
  assert(!raw.startsWith("\uFEFF"));
});

test("status:self-check blocks when multiple daily publish automations are active", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-status-self-check-"));
  await writeSelfCheckReportFixture(tmp, "2026-06-04", {
    quality_status: { status: "ok", reasons: [], degraded_sections: [], blocking_issues: [] }
  });
  const automationsDir = path.join(tmp, "automations");
  await fs.mkdir(path.join(automationsDir, "ai-daily"), { recursive: true });
  await fs.mkdir(path.join(automationsDir, "ai-push-github-pages"), { recursive: true });
  await fs.writeFile(
    path.join(automationsDir, "ai-daily", "automation.toml"),
    [
      'id = "ai-daily"',
      'kind = "cron"',
      'name = "AI 日报生成、push 与 GitHub Pages 发布"',
      'prompt = "node src/cli.js daily:run --publish publish:dry-run:daily"',
      'status = "ACTIVE"',
      'rrule = "RRULE:FREQ=WEEKLY;BYHOUR=2;BYMINUTE=30;BYDAY=SU,MO,TU,WE,TH,FR,SA"'
    ].join("\n"),
    "utf8"
  );
  await fs.writeFile(
    path.join(automationsDir, "ai-push-github-pages", "automation.toml"),
    [
      'id = "ai-push-github-pages"',
      'kind = "cron"',
      'name = "AI 日报生成、push 与 GitHub Pages 发布"',
      'prompt = "npm run publish:prepare-worktree && npm run publish:dry-run"',
      'status = "ACTIVE"',
      'rrule = "RRULE:FREQ=WEEKLY;BYHOUR=2;BYMINUTE=30;BYDAY=SU,MO,TU,WE,TH,FR,SA"'
    ].join("\n"),
    "utf8"
  );

  const result = await runStatusSelfCheck({
    rootDir: tmp,
    reportDate: "2026-06-04",
    automationsDir,
    fetchImpl: async () => textResponse("2026-06-04"),
    prepareCleanPublishWorktreeImpl: async () => ({
      mode: "prepare-clean-worktree",
      repo_root: tmp,
      launcher_repo_root: tmp,
      branch: "main",
      remote_main_sha: "1111111111111111111111111111111111111111"
    }),
    buildSiteImpl: async () => ({ reports: [{ report_date: "2026-06-04" }], writtenFiles: [] }),
    createDailyPublishPlanImpl: async () => ({ mode: "daily-dry-run", reports: [] }),
    checkSourcesHealthImpl: async () => ({
      results: [{ status: "checked" }],
      source_audit: { sources_health: { checked: true, sources: [{ status: "checked" }] } }
    }),
    validateWorkflowImpl: async () => ({ ok: true, failures: [], warnings: [] }),
    validateSourcesImpl: async () => ({ ok: true })
  });

  assert.equal(result.status, "blocked");
  assert(result.blocking_issues.some((issue) => issue.code === "multiple_active_daily_publish_automations"));
  assert.equal(result.automation.active_publish_automations.length, 2);
});

test("status:self-check reports degraded published state without blocking", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-status-self-check-ok-"));
  await writeSelfCheckReportFixture(tmp, "2026-06-04", {
    quality_status: {
      status: "degraded",
      reasons: ["content_sources_blocked"],
      degraded_sections: [{ code: "content_sources_blocked", section: "hot_blogs" }],
      blocking_issues: []
    }
  });
  const automationsDir = path.join(tmp, "automations");
  await fs.mkdir(path.join(automationsDir, "ai-daily"), { recursive: true });
  await fs.writeFile(
    path.join(automationsDir, "ai-daily", "automation.toml"),
    [
      'id = "ai-daily"',
      'kind = "cron"',
      'name = "AI 日报生成、push 与 GitHub Pages 发布"',
      'prompt = "node src/cli.js daily:run --publish publish:dry-run:daily"',
      'status = "ACTIVE"'
    ].join("\n"),
    "utf8"
  );

  const result = await runStatusSelfCheck({
    rootDir: tmp,
    reportDate: "2026-06-04",
    automationsDir,
    fetchImpl: async () => textResponse("AI daily 2026-06-04"),
    prepareCleanPublishWorktreeImpl: async () => ({
      mode: "prepare-clean-worktree",
      repo_root: tmp,
      launcher_repo_root: tmp,
      branch: "main",
      remote_main_sha: "2222222222222222222222222222222222222222"
    }),
    buildSiteImpl: async () => ({ reports: [{ report_date: "2026-06-04" }], writtenFiles: [] }),
    createDailyPublishPlanImpl: async () => ({ mode: "daily-dry-run", reports: [{ report_date: "2026-06-04" }] }),
    checkSourcesHealthImpl: async () => ({
      results: [{ status: "checked" }, { status: "blocked" }],
      source_audit: { sources_health: { checked: true, sources: [{ status: "checked" }, { status: "blocked" }] } }
    }),
    validateWorkflowImpl: async () => ({ ok: true, failures: [], warnings: [] }),
    validateSourcesImpl: async () => ({ ok: true })
  });

  assert.equal(result.status, "degraded");
  assert.deepEqual(result.blocking_issues, []);
  assert(result.degraded_sections.some((issue) => issue.code === "content_sources_blocked"));
  assert(result.degraded_sections.some((issue) => issue.code === "sources_health_blocked"));
});

test("status:self-check runs publish checks from the prepared clean worktree", async () => {
  const launcherRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-status-launcher-"));
  const cleanRoot = path.join(launcherRoot, ".tmp", "publish-worktrees", "main");
  const reportAutomationRevision = {
    schema_version: 1,
    git_commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    git_commit_short: "aaaaaaaaaaaa",
    git_branch: "main",
    origin_main_sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    origin_main_short: "aaaaaaaaaaaa",
    prompt_manifest: "prompts/ai-daily/manifest.json",
    prompt_modules: ["fixed-source-checklist.md"],
    source_registry_count: 132,
    source_registry_enablement_counts: { core: 54, optional: 73, manual: 5 },
    rules: ["fixed_source_checklist"]
  };
  await writeSelfCheckReportFixture(cleanRoot, "2026-06-04", {
    self_check: {
      report_date: "2026-06-04",
      automation_revision: reportAutomationRevision
    }
  });
  const automationsDir = path.join(launcherRoot, "automations");
  await fs.mkdir(path.join(automationsDir, "ai-daily"), { recursive: true });
  await fs.writeFile(
    path.join(automationsDir, "ai-daily", "automation.toml"),
    [
      'id = "ai-daily"',
      'kind = "cron"',
      'prompt = "node src/cli.js daily:run --publish publish:dry-run:daily"',
      'status = "ACTIVE"'
    ].join("\n"),
    "utf8"
  );
  const seenRoots = [];
  let dryRunAutomationRevision = null;

  const result = await runStatusSelfCheck({
    rootDir: launcherRoot,
    reportDate: "2026-06-04",
    automationsDir,
    outputPath: ".tmp/status-self-check-2026-06-04.json",
    fetchImpl: async () => textResponse("AI daily 2026-06-04"),
    prepareCleanPublishWorktreeImpl: async () => ({
      mode: "prepare-clean-worktree",
      repo_root: cleanRoot,
      launcher_repo_root: launcherRoot,
      branch: "main",
      remote_main_sha: "3333333333333333333333333333333333333333"
    }),
    buildSiteImpl: async ({ rootDir: checkRoot }) => {
      seenRoots.push(["build", checkRoot]);
      return { reports: [{ report_date: "2026-06-04" }], writtenFiles: [] };
    },
    createDailyPublishPlanImpl: async ({ repoRoot: checkRoot, currentAutomationRevision }) => {
      seenRoots.push(["dry-run", checkRoot]);
      dryRunAutomationRevision = currentAutomationRevision;
      return { mode: "daily-dry-run", reports: [{ report_date: "2026-06-04" }] };
    },
    checkSourcesHealthImpl: async ({ rootDir: checkRoot }) => {
      seenRoots.push(["sources-health", checkRoot]);
      return {
        results: [{ status: "checked" }],
        source_audit: { sources_health: { checked: true, sources: [{ status: "checked" }] } }
      };
    },
    validateWorkflowImpl: async ({ rootDir: checkRoot }) => {
      seenRoots.push(["workflow", checkRoot]);
      return { ok: true, failures: [], warnings: [] };
    },
    validateSourcesImpl: async ({ rootDir: checkRoot }) => {
      seenRoots.push(["sources-validate", checkRoot]);
      return { ok: true };
    }
  });

  assert.equal(result.status, "ok");
  assert.equal(result.launcher_root, launcherRoot.replace(/\\/g, "/"));
  assert.equal(result.checked_repo_root, cleanRoot.replace(/\\/g, "/"));
  assert(seenRoots.every(([, checkRoot]) => checkRoot === cleanRoot));
  assert.deepEqual(dryRunAutomationRevision, reportAutomationRevision);
  const saved = JSON.parse(await fs.readFile(path.join(launcherRoot, ".tmp", "status-self-check-2026-06-04.json"), "utf8"));
  assert.equal(saved.checked_repo_root, cleanRoot.replace(/\\/g, "/"));
});

test("daily workflow contract validates repository workflow markers", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-workflow-contract-"));
  const automationsDir = path.join(tmp, "automations");
  const promptPath = path.join(automationsDir, "ai-daily", "automation.toml");
  await fs.mkdir(path.join(automationsDir, "ai-daily"), { recursive: true });
  await fs.mkdir(path.join(automationsDir, "ai-daily-status-self-check"), { recursive: true });
  await fs.writeFile(
    promptPath,
    [
      'id = "ai-daily"',
      'kind = "cron"',
      'prompt = "node src/cli.js daily:run --publish; read .tmp/run-summary-YYYY-MM-DD.json next_action publish:dry-run:daily"',
      'status = "ACTIVE"',
      'cwds = ["D:\\\\ai-daily-cn"]'
    ].join("\n"),
    "utf8"
  );
  await fs.writeFile(
    path.join(automationsDir, "ai-daily-status-self-check", "automation.toml"),
    [
      'id = "ai-daily-status-self-check"',
      'kind = "cron"',
      'prompt = "node src/cli.js status:self-check --date YYYY-MM-DD --output .tmp/status-self-check-YYYY-MM-DD.json"',
      'status = "ACTIVE"',
      'cwds = ["D:\\\\ai-daily-cn"]'
    ].join("\n"),
    "utf8"
  );

  const result = await validateDailyWorkflowContract({
    rootDir,
    automationsDir,
    automationPromptPath: promptPath
  });

  assert.equal(result.ok, true, result.failures.join("\n"));
  assert(result.checked_files.some((file) => file.endsWith("tasks/daily-publish-runbook.md")));
  assert(result.checked_files.some((file) => file.endsWith("prompts/ai-daily/modules/publish-workflow.md")));
});

test("harness init recreates ignored local state files before validation", async () => {
  const tmp = await createHarnessFixture();
  await fs.rm(path.join(tmp, "progress.md"));
  await fs.rm(path.join(tmp, "session-handoff.md"));
  await fs.rm(path.join(tmp, "tasks", "current-task.md"));

  const missing = await runHarnessValidate(tmp);
  assert.notEqual(missing.code, 0);
  assert.match(missing.stderr, /npm run harness:init/);

  const initialized = await runHarnessInit(tmp, ["--json"]);
  assert.equal(initialized.code, 0, initialized.stderr);
  const initResult = JSON.parse(initialized.stdout);
  assert.equal(initResult.ok, true);
  assert.deepEqual(
    initResult.results.map((entry) => entry.status),
    ["created", "created", "created"]
  );

  const validated = await runHarnessValidate(tmp);
  assert.equal(validated.code, 0, validated.stderr);
});

test("harness init keeps existing local state unless forced", async () => {
  const tmp = await createHarnessFixture();
  const progressPath = path.join(tmp, "progress.md");
  await fs.writeFile(progressPath, "# Progress\n\n## Current State\n\n- Keep this local note.\n", "utf8");

  const kept = await runHarnessInit(tmp, ["--json"]);
  assert.equal(kept.code, 0, kept.stderr);
  assert.match(await fs.readFile(progressPath, "utf8"), /Keep this local note/);
  assert(JSON.parse(kept.stdout).results.some((entry) => entry.target === "progress.md" && entry.status === "kept"));

  const forced = await runHarnessInit(tmp, ["--force", "--json"]);
  assert.equal(forced.code, 0, forced.stderr);
  assert.doesNotMatch(await fs.readFile(progressPath, "utf8"), /Keep this local note/);
});

test("harness SDD TDD rejects non-trivial current task without red test", async () => {
  const tmp = await createHarnessFixture({
    currentTask: [
      "# Current Task",
      "",
      "## Task Class",
      "",
      "non-trivial",
      "",
      "## Spec",
      "",
      "A non-trivial implementation task.",
      "",
      "## Acceptance Criteria",
      "",
      "- Harness enforces the SDD/TDD contract.",
      "",
      "## Allowed Paths",
      "",
      "- `scripts/harness-validate.mjs`",
      "",
      "## Forbidden Paths",
      "",
      "- Do not modify generated reports.",
      "",
      "## Validation Commands",
      "",
      "- `node scripts/harness-validate.mjs`",
      "",
      "## Parallel Writes",
      "",
      "- No parallel writes.",
      "",
      "## Handoff Requirements",
      "",
      "- Report validation evidence.",
      ""
    ].join("\n")
  });

  const result = await runHarnessValidate(tmp);

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /Red Test|Deterministic Substitute/);
});

test("harness SDD TDD rejects red test without failing result evidence", async () => {
  const tmp = await createHarnessFixture({
    currentTask: [
      "# Current Task",
      "",
      "## Task Class",
      "",
      "non-trivial",
      "",
      "## Spec",
      "",
      "A non-trivial implementation task.",
      "",
      "## Acceptance Criteria",
      "",
      "- Harness enforces red-test evidence.",
      "",
      "## Red Test",
      "",
      "```powershell",
      "node scripts/harness-validate.mjs",
      "```",
      "",
      "## Allowed Paths",
      "",
      "- `scripts/harness-validate.mjs`",
      "",
      "## Forbidden Paths",
      "",
      "- Do not modify generated reports.",
      "",
      "## Validation Commands",
      "",
      "- `node scripts/harness-validate.mjs`",
      "",
      "## Parallel Writes",
      "",
      "- No parallel writes.",
      "",
      "## Handoff Requirements",
      "",
      "- Report validation evidence.",
      ""
    ].join("\n")
  });

  const result = await runHarnessValidate(tmp);

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /failing result/);
});

test("harness SDD TDD accepts trivial current task only with justification", async () => {
  const missingJustificationRoot = await createHarnessFixture({
    currentTask: [
      "# Current Task",
      "",
      "## Task Class",
      "",
      "trivial",
      "",
      "## Spec",
      "",
      "Fix a typo.",
      "",
      "## Acceptance Criteria",
      "",
      "- Typo is fixed.",
      "",
      "## Feedback Ledger Review",
      "",
      "- Reviewed `config/feedback-ledger.json`; no feedback-ledger item applies to this typo-only fixture.",
      "",
      "## Regression Self-Check",
      "",
      "- Self-check confirms this trivial fixture does not touch behavior, validation gates, or generated reports.",
      "",
      "## Retrospective Plan",
      "",
      "- Trivial fixture only documents no retrospective record requirement; retrospectives/index.json stays unchanged.",
      "",
      "## Allowed Paths",
      "",
      "- `docs/example.md`",
      "",
      "## Forbidden Paths",
      "",
      "- Do not change code.",
      "",
      "## Validation Commands",
      "",
      "- `git diff --check`",
      "",
      "## Parallel Writes",
      "",
      "- No parallel writes.",
      "",
      "## Handoff Requirements",
      "",
      "- Report the edit.",
      ""
    ].join("\n")
  });
  const missingJustification = await runHarnessValidate(missingJustificationRoot);

  assert.notEqual(missingJustification.code, 0);
  assert.match(missingJustification.stderr, /Trivial Justification/);

  const justifiedRoot = await createHarnessFixture({
    currentTask: [
      "# Current Task",
      "",
      "## Task Class",
      "",
      "trivial",
      "",
      "## Trivial Justification",
      "",
      "Documentation-only typo fix with no behavior, contract, validation, publication, or automation impact.",
      "",
      "## Spec",
      "",
      "Fix a typo.",
      "",
      "## Acceptance Criteria",
      "",
      "- Typo is fixed.",
      "",
      "## Feedback Ledger Review",
      "",
      "- Reviewed `config/feedback-ledger.json`; no feedback-ledger item applies to this typo-only fixture.",
      "",
      "## Regression Self-Check",
      "",
      "- Self-check confirms this trivial fixture does not touch behavior, validation gates, or generated reports.",
      "",
      "## Retrospective Plan",
      "",
      "- Trivial fixture only documents no retrospective record requirement; retrospectives/index.json stays unchanged.",
      "",
      "## Allowed Paths",
      "",
      "- `docs/example.md`",
      "",
      "## Forbidden Paths",
      "",
      "- Do not change code.",
      "",
      "## Validation Commands",
      "",
      "- `git diff --check`",
      "",
      "## Parallel Writes",
      "",
      "- No parallel writes.",
      "",
      "## Handoff Requirements",
      "",
      "- Report the edit.",
      ""
    ].join("\n")
  });
  const justified = await runHarnessValidate(justifiedRoot);

  assert.equal(justified.code, 0, justified.stderr);
});

test("harness SDD TDD accepts task class followed by template guidance", async () => {
  const tmp = await createHarnessFixture({
    currentTask: [
      "# Current Task",
      "",
      "## Task Class",
      "",
      "non-trivial",
      "",
      "Use `trivial` only for typo, pure copy, one-line no-behavior config, or read-only diagnostic tasks.",
      "",
      "## Spec",
      "",
      "A non-trivial implementation task.",
      "",
      "## Acceptance Criteria",
      "",
      "- Harness accepts task templates with guidance text.",
      "",
      "## Feedback Ledger Review",
      "",
      "- Reviewed `config/feedback-ledger.json` and confirmed this fixture exercises the feedback-ledger review contract.",
      "",
      "## Regression Self-Check",
      "",
      "- Self-check confirms the fixture still contains the required regression review before handoff validation.",
      "",
      "## Retrospective Plan",
      "",
      "- This non-trivial fixture records a project_iteration retrospective plan and keeps retrospectives/index.json aligned.",
      "",
      "## Red Test",
      "",
      "Run before implementation:",
      "",
      "```powershell",
      "node scripts/harness-validate.mjs",
      "```",
      "",
      "Expected initial failure:",
      "",
      "- The pre-change harness rejects the task fixture.",
      "",
      "## Allowed Paths",
      "",
      "- `scripts/harness-validate.mjs`",
      "",
      "## Forbidden Paths",
      "",
      "- Do not modify generated reports.",
      "",
      "## Validation Commands",
      "",
      "- `node scripts/harness-validate.mjs`",
      "",
      "## Parallel Writes",
      "",
      "- No parallel writes.",
      "",
      "## Handoff Requirements",
      "",
      "- Report validation evidence.",
      ""
    ].join("\n")
  });

  const result = await runHarnessValidate(tmp);

  assert.equal(result.code, 0, result.stderr);
});

test("feedback memory self-check rejects non-trivial current task without feedback ledger review", async () => {
  const tmp = await createHarnessFixture({
    currentTask: [
      "# Current Task",
      "",
      "## Task Class",
      "",
      "non-trivial",
      "",
      "## Spec",
      "",
      "A non-trivial implementation task.",
      "",
      "## Acceptance Criteria",
      "",
      "- Harness enforces feedback-memory review.",
      "",
      "## Regression Self-Check",
      "",
      "- Compare the implementation against prior feedback items before handoff.",
      "",
      "## Red Test",
      "",
      "Run before implementation:",
      "",
      "```powershell",
      "node scripts/harness-validate.mjs",
      "```",
      "",
      "Expected initial failure:",
      "",
      "- The pre-change harness rejects this fixture.",
      "",
      "## Allowed Paths",
      "",
      "- `scripts/harness-validate.mjs`",
      "",
      "## Forbidden Paths",
      "",
      "- Do not modify generated reports.",
      "",
      "## Validation Commands",
      "",
      "- `node scripts/harness-validate.mjs`",
      "",
      "## Parallel Writes",
      "",
      "- No parallel writes.",
      "",
      "## Handoff Requirements",
      "",
      "- Report validation evidence.",
      ""
    ].join("\n")
  });

  const result = await runHarnessValidate(tmp);

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /Feedback Ledger Review/);
});

test("feedback memory self-check rejects non-trivial current task without regression self-check", async () => {
  const tmp = await createHarnessFixture({
    currentTask: [
      "# Current Task",
      "",
      "## Task Class",
      "",
      "non-trivial",
      "",
      "## Spec",
      "",
      "A non-trivial implementation task.",
      "",
      "## Acceptance Criteria",
      "",
      "- Harness enforces regression self-checks.",
      "",
      "## Feedback Ledger Review",
      "",
      "- Reviewed `config/feedback-ledger.json` and the quick reference for applicable regressions.",
      "",
      "## Red Test",
      "",
      "Run before implementation:",
      "",
      "```powershell",
      "node scripts/harness-validate.mjs",
      "```",
      "",
      "Expected initial failure:",
      "",
      "- The pre-change harness rejects this fixture.",
      "",
      "## Allowed Paths",
      "",
      "- `scripts/harness-validate.mjs`",
      "",
      "## Forbidden Paths",
      "",
      "- Do not modify generated reports.",
      "",
      "## Validation Commands",
      "",
      "- `node scripts/harness-validate.mjs`",
      "",
      "## Parallel Writes",
      "",
      "- No parallel writes.",
      "",
      "## Handoff Requirements",
      "",
      "- Report validation evidence.",
      ""
    ].join("\n")
  });

  const result = await runHarnessValidate(tmp);

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /Regression Self-Check/);
});

test("feedback memory self-check ledger item is bound to harness validation", async () => {
  const ledger = JSON.parse(await fs.readFile(path.join(rootDir, "config", "feedback-ledger.json"), "utf8"));
  const item = ledger.items.find((entry) => entry.id === "feedback/p1-feedback-memory-self-check");

  assert(item, "feedback/p1-feedback-memory-self-check must be recorded in the feedback ledger");
  assert.equal(item.severity, "P1");
  assert.equal(item.status, "implemented");
  assert(item.scope.includes("scripts/harness-validate.mjs"));
  assert(item.scope.includes("tasks/templates/sdd-tdd-task.md"));
  assert.equal(item.validation.command, "node --test tests/unit.test.js");
  assert.equal(item.validation.test_name, "feedback memory self-check rejects quick reference missing ledger item");

  const result = await validateFeedbackContract({ rootDir });
  assert.equal(result.ok, true, result.failures.join("\n"));
});

test("feedback memory self-check rejects quick reference missing ledger item", async () => {
  const tmp = await createHarnessFixture({
    feedbackLedger: {
      schema_version: 1,
      items: [
        {
          id: "feedback/covered-item",
          severity: "P1",
          status: "implemented",
          title: "Covered feedback",
          problem: "Covered feedback can regress.",
          expected_behavior: "Covered feedback is documented.",
          scope: ["scripts/harness-validate.mjs"],
          validation: {
            command: "node --test tests/unit.test.js",
            test_name: "fixture",
            gate: "npm run validate"
          }
        },
        {
          id: "feedback/missing-from-quick-reference",
          severity: "P1",
          status: "implemented",
          title: "Missing feedback",
          problem: "A quick reference can drift from the ledger.",
          expected_behavior: "Harness validation catches missing quick-reference IDs.",
          scope: ["scripts/harness-validate.mjs"],
          validation: {
            command: "node --test tests/unit.test.js",
            test_name: "fixture",
            gate: "npm run validate"
          }
        }
      ]
    },
    quickReference: [
      "# Feedback Buglist Quick Reference",
      "",
      "- feedback/covered-item: documented.",
      ""
    ].join("\n")
  });

  const result = await runHarnessValidate(tmp);

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /feedback\/missing-from-quick-reference/);
});

test("retrospective validation accepts sanitized records and index", async () => {
  const tmp = await createRetrospectiveFixture();

  const result = await runRetrospectivesValidate(tmp);

  assert.equal(result.code, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.records_checked, 2);
});

test("retrospective validation rejects local path leakage", async () => {
  const tmp = await createRetrospectiveFixture({
    mutateRecord(record) {
      record.evidence.summary_path = "C:\\Users\\Admin\\.codex\\automations\\ai-daily\\run-worktrees\\run\\.tmp\\run-summary.json";
    }
  });

  const result = await runRetrospectivesValidate(tmp);

  assert.notEqual(result.code, 0);
  assert.match(result.stdout, /local_or_private_path_leak/);
});

test("retrospective validation rejects index entries without records", async () => {
  const tmp = await createRetrospectiveFixture({
    mutateIndex(index) {
      index.records.push({
        id: "2026-06-12.rollup.missing",
        run_type: "rollup",
        date: "2026-06-12",
        status: "completed",
        path: "retrospectives/2026/06/2026-06-12.rollup.missing.json",
        title: "Missing rollup"
      });
    }
  });

  const result = await runRetrospectivesValidate(tmp);

  assert.notEqual(result.code, 0);
  assert.match(result.stdout, /index_record_missing/);
});

test("retrospective validation rejects implemented suggestions without durable evidence", async () => {
  const tmp = await createRetrospectiveFixture({
    mutateRecord(record) {
      record.suggestions = [
        {
          status: "implemented",
          issue: "复盘建议缺少验证绑定。",
          evidence: "fixture",
          module: "scripts/validate-retrospectives.mjs",
          suggestion: "补充验证绑定。",
          expected_benefit: "防止把未验证建议标为已实现。",
          requires_user_confirmation: false,
          promotion_path: "已经实现。"
        }
      ];
    }
  });

  const result = await runRetrospectivesValidate(tmp);

  assert.notEqual(result.code, 0);
  assert.match(result.stdout, /implemented_suggestion_missing_evidence/);
});

test("harness rejects non-trivial current task without retrospective plan", async () => {
  const tmp = await createHarnessFixture({
    currentTask: [
      "# Current Task",
      "",
      "## Task Class",
      "",
      "non-trivial",
      "",
      "## Spec",
      "",
      "A non-trivial implementation task.",
      "",
      "## Acceptance Criteria",
      "",
      "- Harness enforces retrospective planning.",
      "",
      "## Feedback Ledger Review",
      "",
      "- Reviewed `config/feedback-ledger.json` and the quick reference for applicable regressions.",
      "",
      "## Regression Self-Check",
      "",
      "- Self-check verifies validation, harness, and retrospective regression coverage before handoff.",
      "",
      "## Red Test",
      "",
      "Run before implementation:",
      "",
      "```powershell",
      "node scripts/harness-validate.mjs",
      "```",
      "",
      "Expected initial failure:",
      "",
      "- The pre-change harness rejects this fixture.",
      "",
      "## Allowed Paths",
      "",
      "- `scripts/harness-validate.mjs`",
      "",
      "## Forbidden Paths",
      "",
      "- Do not modify generated reports.",
      "",
      "## Validation Commands",
      "",
      "- `node scripts/harness-validate.mjs`",
      "",
      "## Parallel Writes",
      "",
      "- No parallel writes.",
      "",
      "## Handoff Requirements",
      "",
      "- Report validation evidence.",
      ""
    ].join("\n")
  });

  const result = await runHarnessValidate(tmp);

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /Retrospective Plan/);
});

test("retrospective ledger item is bound to validation", async () => {
  const ledger = JSON.parse(await fs.readFile(path.join(rootDir, "config", "feedback-ledger.json"), "utf8"));
  const item = ledger.items.find((entry) => entry.id === "feedback/p1-authoritative-retrospectives");

  assert(item, "feedback/p1-authoritative-retrospectives must be recorded in the feedback ledger");
  assert.equal(item.severity, "P1");
  assert.equal(item.status, "implemented");
  assert(item.scope.includes("schemas/retrospective.schema.json"));
  assert(item.scope.includes("scripts/validate-retrospectives.mjs"));
  assert(item.scope.includes("src/retrospectives.js"));
  assert(item.scope.includes("src/daily-runner.js"));
  assert(item.scope.includes("src/publish.js"));
  assert(item.scope.includes("retrospectives/index.json"));
  assert(item.scope.includes("tests/publish.test.js"));
  assert.equal(item.validation.command, "node --test tests/unit.test.js");
  assert.equal(item.validation.test_name, "daily runner writes sanitized daily publish retrospective before validation");

  const result = await validateFeedbackContract({ rootDir });
  assert.equal(result.ok, true, result.failures.join("\n"));
});

test("OpenSpec removed from active package workflow", async () => {
  const manifest = JSON.parse(await fs.readFile(path.join(rootDir, "package.json"), "utf8"));
  const scripts = manifest.scripts || {};

  assert.equal("validate:openspec" in scripts, false);
  assert.equal(scripts["harness:init"], "node scripts/harness-init.mjs");
  assert.equal(scripts["harness:validate"], "node scripts/harness-validate.mjs");
  assert.match(scripts.validate || "", /npm run harness:init/);
  assert.match(scripts.validate || "", /npm run harness:validate/);
  assert.doesNotMatch(scripts.test || "", /openspec/i);
  assert.doesNotMatch(scripts.validate || "", /openspec/i);
  assert.equal(await exists(path.join(rootDir, "scripts", "validate-openspec.mjs")), false);
  assert.equal(await exists(path.join(rootDir, "tests", "openspec.test.js")), false);
  assert.equal(await exists(path.join(rootDir, "openspec")), false);
});

test("daily runner writes launcher summary and stops before real publish by default", async () => {
  const launcherRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-runner-launcher-"));
  const cleanRoot = path.join(launcherRoot, ".tmp", "publish-worktrees", "main");
  const calls = [];

  const result = await runDailyWorkflow({
    launcherRoot,
    reportDate: "2026-06-04",
    publish: false,
    prepareCleanWorktree: async () => ({
      ok: true,
      next_cwd: cleanRoot,
      remote_main_sha: "1111111111111111111111111111111111111111"
    }),
    runStage: async (stage, context) => {
      calls.push({ id: stage.id, cwd: context.cleanRoot, args: stage.command.args });
      return { ok: true, output: { stage: stage.id } };
    }
  });

  assert.equal(result.summary.mode, "dry-run");
  assert.equal(result.summary.final_status, "generated_only");
  assert.equal(result.summary.next_action.kind, "none");
  assert.equal(result.summary.launcher_root, launcherRoot);
  assert.equal(result.summary.clean_repo_root, cleanRoot);
  assert.equal(result.summaryPath, path.join(launcherRoot, ".tmp", "run-summary-2026-06-04.json"));
  assert(calls.some((call) => call.id === "sources_phase5_audit"));
  assert(calls.some((call) => call.id === "publish_dry_run_daily"));
  assert(!calls.some((call) => call.id === "publish_real"));
  assert(calls.every((call) => call.cwd === cleanRoot));

  const saved = JSON.parse(await fs.readFile(result.summaryPath, "utf8"));
  assert.equal(saved.final_status, "generated_only");
});

test("daily runner writes sanitized daily publish retrospective before validation", async () => {
  const launcherRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-runner-retrospective-"));
  const cleanRoot = path.join(launcherRoot, ".tmp", "publish-worktrees", "main");
  await fs.mkdir(path.join(cleanRoot, "schemas"), { recursive: true });
  await fs.copyFile(
    path.join(rootDir, "schemas", "retrospective.schema.json"),
    path.join(cleanRoot, "schemas", "retrospective.schema.json")
  );
  const validateObservations = [];

  const result = await runDailyWorkflow({
    launcherRoot,
    reportDate: "2026-06-15",
    publish: false,
    prepareCleanWorktree: async () => ({
      ok: true,
      next_cwd: cleanRoot,
      remote_main_sha: "1111111111111111111111111111111111111111"
    }),
    runStage: async (stage) => {
      if (stage.id === "validate") {
        validateObservations.push(await exists(path.join(
          cleanRoot,
          "retrospectives",
          "2026",
          "06",
          "2026-06-15.daily_publish.daily-run.json"
        )));
      }
      return { ok: true, output: { stage: stage.id } };
    }
  });

  assert.equal(result.summary.final_status, "generated_only");
  assert.deepEqual(validateObservations, [true]);
  assert.equal(result.summary.retrospective.ok, true);
  assert.equal(result.summary.retrospective.record_path, "retrospectives/2026/06/2026-06-15.daily_publish.daily-run.json");
  assert(result.summary.stages.some((stage) => stage.id === "retrospective_write" && stage.status === "passed"));

  const record = JSON.parse(await fs.readFile(path.join(cleanRoot, result.summary.retrospective.record_path), "utf8"));
  assert.equal(record.run_type, "daily_publish");
  assert.equal(record.status, "generated_only");
  assert.doesNotMatch(JSON.stringify(record), new RegExp(escapeRegExp(launcherRoot)));
  assert.doesNotMatch(JSON.stringify(record), new RegExp(escapeRegExp(cleanRoot)));

  const validation = await runRetrospectivesValidate(cleanRoot);
  assert.equal(validation.code, 0, validation.stderr);
  assert.equal(JSON.parse(validation.stdout).records_checked, 1);
});

test("daily runner finalizes publish retrospectives before real publish", async () => {
  const launcherRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-runner-retrospective-finalize-"));
  const cleanRoot = path.join(launcherRoot, ".tmp", "publish-worktrees", "main");
  await fs.mkdir(path.join(cleanRoot, "schemas"), { recursive: true });
  await fs.copyFile(
    path.join(rootDir, "schemas", "retrospective.schema.json"),
    path.join(cleanRoot, "schemas", "retrospective.schema.json")
  );
  const recordPath = path.join(cleanRoot, "retrospectives", "2026", "06", "2026-06-16.daily_publish.daily-run.json");
  const observations = [];

  const result = await runDailyWorkflow({
    launcherRoot,
    reportDate: "2026-06-16",
    publish: true,
    prepareCleanWorktree: async () => ({
      ok: true,
      next_cwd: cleanRoot,
      remote_main_sha: "1111111111111111111111111111111111111111"
    }),
    runStage: async (stage) => {
      if (stage.id === "validate") {
        observations.push({ stage: stage.id, status: JSON.parse(await fs.readFile(recordPath, "utf8")).status });
      }
      if (stage.id === "publish_real") {
        observations.push({ stage: stage.id, status: JSON.parse(await fs.readFile(recordPath, "utf8")).status });
      }
      return { ok: true, output: { stage: stage.id } };
    }
  });

  assert.equal(result.summary.final_status, "published");
  assert.deepEqual(observations, [
    { stage: "validate", status: "generated_only" },
    { stage: "publish_real", status: "published" }
  ]);
  assert(result.summary.stages.some((stage) => stage.id === "retrospective_finalize" && stage.status === "passed"));
  assert(result.summary.stages.some((stage) => stage.id === "retrospective_validate" && stage.status === "passed"));

  const record = JSON.parse(await fs.readFile(recordPath, "utf8"));
  assert.equal(record.run_type, "daily_publish");
  assert.equal(record.status, "published");
  assert.doesNotMatch(JSON.stringify(record), new RegExp(escapeRegExp(launcherRoot)));
  assert.doesNotMatch(JSON.stringify(record), new RegExp(escapeRegExp(cleanRoot)));
});

test("daily runner writes blocked correction rollup when publish and fallback fail", async () => {
  const launcherRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-runner-retrospective-correction-"));
  const cleanRoot = path.join(launcherRoot, ".tmp", "publish-worktrees", "main");
  await fs.mkdir(path.join(cleanRoot, "schemas"), { recursive: true });
  await fs.copyFile(
    path.join(rootDir, "schemas", "retrospective.schema.json"),
    path.join(cleanRoot, "schemas", "retrospective.schema.json")
  );

  const result = await runDailyWorkflow({
    launcherRoot,
    reportDate: "2026-06-17",
    publish: true,
    prepareCleanWorktree: async () => ({
      ok: true,
      next_cwd: cleanRoot,
      remote_main_sha: "1111111111111111111111111111111111111111"
    }),
    runStage: async (stage) => {
      if (stage.id === "publish_real") {
        return { ok: false, output: { ok: false, error: "git_push_failed" } };
      }
      if (stage.id === "publish_github_api_fallback") {
        return { ok: false, output: { ok: false, error: "github_api_error" } };
      }
      return { ok: true, output: { stage: stage.id } };
    }
  });

  assert.equal(result.summary.final_status, "blocked");
  assert.equal(result.summary.retrospective_correction.ok, true);
  assert.equal(
    result.summary.retrospective_correction.record_path,
    "retrospectives/2026/06/2026-06-17.rollup.daily-publish-correction.json"
  );
  assert(result.summary.stages.some((stage) => stage.id === "retrospective_correction_write" && stage.status === "passed"));
  assert(result.summary.stages.some((stage) => stage.id === "retrospective_correction_validate" && stage.status === "passed"));

  const correction = JSON.parse(
    await fs.readFile(path.join(cleanRoot, result.summary.retrospective_correction.record_path), "utf8")
  );
  assert.equal(correction.run_type, "rollup");
  assert.equal(correction.status, "blocked");
  assert(correction.blockers.some((blocker) => blocker.section === "publish_real"));
  assert(correction.blockers.some((blocker) => blocker.section === "publish_github_api_fallback"));
  assert.doesNotMatch(JSON.stringify(correction), new RegExp(escapeRegExp(launcherRoot)));
  assert.doesNotMatch(JSON.stringify(correction), new RegExp(escapeRegExp(cleanRoot)));

  const validation = await runRetrospectivesValidate(cleanRoot);
  assert.equal(validation.code, 0, validation.stderr);
  assert.equal(JSON.parse(validation.stdout).records_checked, 2);
});

test("daily runner wires platform exempt discovery outputs into report draft", async () => {
  const launcherRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-runner-platforms-"));
  const cleanRoot = path.join(launcherRoot, ".tmp", "publish-worktrees", "main");
  const calls = [];

  await runDailyWorkflow({
    launcherRoot,
    reportDate: "2026-06-09",
    publish: false,
    prepareCleanWorktree: async () => ({
      ok: true,
      next_cwd: cleanRoot,
      remote_main_sha: "1111111111111111111111111111111111111111"
    }),
    runStage: async (stage) => {
      calls.push(stage);
      return { ok: true, output: { stage: stage.id } };
    }
  });

  assert.deepEqual(
    calls
      .map((stage) => stage.id)
      .filter((id) => id.includes("platform")),
    ["discover_wechat_platform", "discover_zhihu_platform", "discover_reddit_platform"]
  );
  const reportDraft = calls.find((stage) => stage.id === "report_draft");
  const inputIndex = reportDraft.command.args.indexOf("--input");
  const inputPaths = reportDraft.command.args[inputIndex + 1].split(",");
  assert(inputPaths.includes(".tmp/huggingface-trending-2026-06-09.json"));
  assert(inputPaths.includes(".tmp/china-ai-2026-06-09.json"));
  assert(inputPaths.includes(".tmp/wechat-platform-2026-06-09.json"));
  assert(inputPaths.includes(".tmp/zhihu-platform-2026-06-09.json"));
  assert(inputPaths.includes(".tmp/reddit-platform-2026-06-09.json"));
});

test("daily runner gives content source discovery enough candidate budget for the fixed source surface", async () => {
  const launcherRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-runner-content-budget-"));
  const cleanRoot = path.join(launcherRoot, ".tmp", "publish-worktrees", "main");
  const calls = [];

  await runDailyWorkflow({
    launcherRoot,
    reportDate: "2026-06-12",
    publish: false,
    prepareCleanWorktree: async () => ({
      ok: true,
      next_cwd: cleanRoot,
      remote_main_sha: "1111111111111111111111111111111111111111"
    }),
    runStage: async (stage) => {
      calls.push(stage);
      return { ok: true, output: { stage: stage.id } };
    }
  });

  const contentDiscovery = calls.find((stage) => stage.id === "discover_content_sources");
  const limitIndex = contentDiscovery.command.args.indexOf("--limit");
  const perSourceIndex = contentDiscovery.command.args.indexOf("--per-source-limit");
  const limit = Number(contentDiscovery.command.args[limitIndex + 1]);
  const perSourceLimit = Number(contentDiscovery.command.args[perSourceIndex + 1]);

  assert.equal(perSourceLimit, 3);
  assert(limit >= 150, `content source limit ${limit} is below fixed source surface budget`);
});

test("reddit platform source is enabled with deterministic safety gates", async () => {
  const config = JSON.parse(
    await fs.readFile(path.join(rootDir, "config", "sources", "reddit-platform-sources.json"), "utf8")
  );
  const redditSource = config.sources.find((source) => source.id === "platform-reddit-local-llama-feed");

  assert(redditSource);
  assert.equal(redditSource.kill_switch, false);
  assert.equal(redditSource.verification_policy, "platform_signal_exempt");
  assert(redditSource.allowed_hosts.includes("reddit.com"));
  assert(redditSource.exclude_keywords.includes("slop"));
  assert(redditSource.exclude_keywords.includes("bot"));
});

test("daily runner hands AI repair back to Codex with publish review budget", async () => {
  const launcherRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-runner-repair-"));
  const cleanRoot = path.join(launcherRoot, ".tmp", "publish-worktrees", "main");

  const result = await runDailyWorkflow({
    launcherRoot,
    reportDate: "2026-06-04",
    publish: true,
    prepareCleanWorktree: async () => ({
      ok: true,
      next_cwd: cleanRoot,
      remote_main_sha: "2222222222222222222222222222222222222222"
    }),
    runStage: async (stage) => {
      if (stage.id === "quality_review") {
        return {
          ok: false,
          needsAiRepair: true,
          output: {
            ai_review_tasks: [{ kind: "translation_fidelity", path: "builder_observations[0]" }]
          }
        };
      }
      return { ok: true, output: { stage: stage.id } };
    }
  });

  assert.equal(result.summary.mode, "publish");
  assert.equal(result.summary.final_status, "needs_ai_repair");
  assert.equal(result.summary.next_action.kind, "codex_ai_repair_contract");
  assert.equal(result.summary.next_action.max_review_repair_loops, 5);
  assert.equal(result.summary.next_action.remaining_review_repair_loops, 4);
  assert.match(result.summary.next_action.contract_path, /quality-ai-repair-2026-06-04\.json$/);
  assert(!result.summary.stages.some((stage) => stage.id === "publish_real"));
});

test("daily runner allows one AI repair loop in default dry-run mode", async () => {
  const launcherRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-runner-dry-repair-"));
  const cleanRoot = path.join(launcherRoot, ".tmp", "publish-worktrees", "main");

  const result = await runDailyWorkflow({
    launcherRoot,
    reportDate: "2026-06-04",
    publish: false,
    prepareCleanWorktree: async () => ({
      ok: true,
      next_cwd: cleanRoot,
      remote_main_sha: "3333333333333333333333333333333333333333"
    }),
    runStage: async (stage) => {
      if (stage.id === "quality_review") {
        return {
          ok: false,
          output: {
            review: {
              ok: false,
              ai_review_tasks: [{ kind: "rewrite_autodraft_template", path: "main_items[0].bullets[0]" }]
            }
          }
        };
      }
      return { ok: true, output: { stage: stage.id } };
    }
  });

  assert.equal(result.summary.final_status, "needs_ai_repair");
  assert.equal(result.summary.next_action.kind, "codex_ai_repair_contract");
  assert.equal(result.summary.next_action.max_review_repair_loops, 1);
  assert.equal(result.summary.next_action.remaining_review_repair_loops, 0);
});

test("daily runner resumes from AI repair contract and continues with optimized report", async () => {
  const launcherRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-runner-resume-"));
  const cleanRoot = path.join(launcherRoot, ".tmp", "publish-worktrees", "main");
  let prepareCalls = 0;
  const first = await runDailyWorkflow({
    launcherRoot,
    reportDate: "2026-06-04",
    publish: true,
    prepareCleanWorktree: async () => {
      prepareCalls += 1;
      return {
        ok: true,
        next_cwd: cleanRoot,
        remote_main_sha: "4444444444444444444444444444444444444444"
      };
    },
    runStage: async (stage) => {
      if (stage.id === "quality_review") {
        return {
          ok: false,
          output: {
            review: {
              ok: false,
              ai_review_tasks: [{ kind: "translation_fidelity", path: "builder_observations[0].translation" }]
            }
          }
        };
      }
      return { ok: true, output: { stage: stage.id } };
    }
  });
  const contractPath = first.summary.next_action.contract_path;
  await fs.mkdir(path.dirname(contractPath), { recursive: true });
  await fs.writeFile(contractPath, JSON.stringify({
    schema_version: 1,
    report_date: "2026-06-04",
    edits: [
      {
        path: "builder_observations[0].translation",
        value: "修复后的译文。",
        reason: "Preserve original meaning."
      }
    ]
  }, null, 2), "utf8");

  const calls = [];
  const resumed = await runDailyWorkflow({
    launcherRoot,
    reportDate: "2026-06-04",
    publish: true,
    prepareCleanWorktree: async () => {
      prepareCalls += 1;
      throw new Error("prepare should not run during repair resume");
    },
    runStage: async (stage) => {
      calls.push(stage);
      if (stage.id === "quality_review") {
        return { ok: true, output: { review: { ok: true, ai_review_tasks: [] } } };
      }
      return { ok: true, output: { stage: stage.id } };
    }
  });

  assert.equal(prepareCalls, 1);
  assert.equal(resumed.summary.final_status, "published");
  assert.deepEqual(calls.map((stage) => stage.id), [
    "quality_ai_repair",
    "quality_review",
    "report_write",
    "build",
    "quality_page_check",
    "validate",
    "sources_phase5_audit",
    "publish_dry_run_daily",
    "retrospective_validate",
    "publish_real"
  ]);
  const repairStage = calls.find((stage) => stage.id === "quality_ai_repair");
  assert(repairStage.command.args.includes(contractPath));
  const reportWriteStage = calls.find((stage) => stage.id === "report_write");
  assert(reportWriteStage.command.args.includes(".tmp/daily-report.optimized.json"));
});

test("daily runner falls back to GitHub API when real publish fails", async () => {
  const launcherRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-runner-publish-fallback-"));
  const cleanRoot = path.join(launcherRoot, ".tmp", "publish-worktrees", "main");
  const calls = [];

  const result = await runDailyWorkflow({
    launcherRoot,
    reportDate: "2026-06-04",
    publish: true,
    prepareCleanWorktree: async () => ({
      ok: true,
      next_cwd: cleanRoot,
      remote_main_sha: "5555555555555555555555555555555555555555"
    }),
    runStage: async (stage) => {
      calls.push(stage);
      if (stage.id === "publish_real") {
        return {
          ok: false,
          output: {
            ok: false,
            publish_status: {
              publish_error: "git_push_failed"
            }
          }
        };
      }
      return { ok: true, output: { stage: stage.id } };
    }
  });

  assert.equal(result.summary.final_status, "published");
  assert.equal(result.summary.next_action.kind, "none");
  assert.deepEqual(calls.slice(-2).map((stage) => stage.id), ["publish_real", "publish_github_api_fallback"]);
  const fallbackStage = calls.find((stage) => stage.id === "publish_github_api_fallback");
  assert.deepEqual(fallbackStage.command.args, ["run", "publish:github-api", "--", "confirm-push", "2026-06-04"]);
});

test("daily runner records stdout and stderr from failed publish stages", async () => {
  const launcherRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-runner-publish-error-output-"));
  const cleanRoot = path.join(launcherRoot, ".tmp", "publish-worktrees", "main");

  const result = await runDailyWorkflow({
    launcherRoot,
    reportDate: "2026-06-04",
    publish: true,
    prepareCleanWorktree: async () => ({
      ok: true,
      next_cwd: cleanRoot,
      remote_main_sha: "5555555555555555555555555555555555555555"
    }),
    runStage: async (stage) => {
      if (stage.id === "publish_real" || stage.id === "publish_github_api_fallback") {
        const error = new Error(`${stage.id} failed`);
        error.code = stage.id === "publish_real" ? "ETIMEDOUT" : 1;
        error.stdout = `${stage.id} stdout`;
        error.stderr = `${stage.id} stderr`;
        throw error;
      }
      return { ok: true, output: { stage: stage.id } };
    }
  });

  assert.equal(result.summary.final_status, "blocked");
  const publishStage = result.summary.stages.find((stage) => stage.id === "publish_real");
  const fallbackStage = result.summary.stages.find((stage) => stage.id === "publish_github_api_fallback");
  assert.equal(publishStage.error_code, "ETIMEDOUT");
  assert.equal(publishStage.output.stdout, "publish_real stdout");
  assert.equal(publishStage.output.stderr, "publish_real stderr");
  assert.equal(fallbackStage.error_code, 1);
  assert.equal(fallbackStage.output.stdout, "publish_github_api_fallback stdout");
  assert.equal(fallbackStage.output.stderr, "publish_github_api_fallback stderr");
});

test("daily runner restart discards pending AI repair state and prepares again", async () => {
  const launcherRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-runner-restart-"));
  const summaryPath = path.join(launcherRoot, ".tmp", "run-summary-2026-06-04.json");
  await fs.mkdir(path.dirname(summaryPath), { recursive: true });
  await fs.writeFile(summaryPath, JSON.stringify({
    schema_version: 1,
    report_date: "2026-06-04",
    mode: "publish",
    launcher_root: launcherRoot,
    clean_repo_root: path.join(launcherRoot, ".tmp", "publish-worktrees", "main"),
    summary_path: summaryPath,
    max_review_repair_loops: 5,
    review_repair_attempts: 1,
    stages: [],
    final_status: "needs_ai_repair",
    next_action: {
      kind: "codex_ai_repair_contract",
      contract_path: path.join(launcherRoot, ".tmp", "quality-ai-repair-2026-06-04.json")
    }
  }, null, 2), "utf8");

  let prepareCalls = 0;
  const result = await runDailyWorkflow({
    launcherRoot,
    reportDate: "2026-06-04",
    publish: true,
    restart: true,
    prepareCleanWorktree: async () => {
      prepareCalls += 1;
      return {
        ok: true,
        next_cwd: path.join(launcherRoot, ".tmp", "publish-worktrees", "fresh"),
        remote_main_sha: "5555555555555555555555555555555555555555"
      };
    },
    runStage: async (stage) => ({ ok: true, output: { stage: stage.id } })
  });

  assert.equal(prepareCalls, 1);
  assert.equal(result.summary.final_status, "published");
  assert.equal(result.summary.review_repair_attempts, 0);
  assert(result.summary.stages.some((stage) => stage.id === "prepare_clean_worktree"));
});

test("quality review flags AI tone highlight and translation issues", async () => {
  const report = JSON.parse(await readFixture("reports/good/structured-report.json"));
  report.summary = "Today has a high-signal platform shift with more signal for builders.";
  report.main_items[0].bullets = [
    "==OpenAI shipped a broad platform update with a very long highlighted sentence that should not be entirely marked because it makes the page noisy and hides the real keyword.=="
  ];
  report.builder_observations = [
    {
      author: "Example Builder",
      original_text: "Coding agents need eval loops before unattended work.",
      translation: "Coding agent 在无人值守工作之前需要 eval loops。",
      content: "Coding agents need eval loops before unattended work.",
      url: "https://x.com/examplebuilder/status/2059000000000000000"
    }
  ];

  const review = reviewReportQuality(report);
  const codes = review.issues.map((issue) => issue.code);

  assert.equal(review.ok, false);
  assert(codes.includes("plain_language_stock_phrase"));
  assert(codes.includes("highlight_too_large"));
  assert(codes.includes("builder_content_translation_mismatch"));
  assert(review.ai_review_tasks.some((task) => task.kind === "translation_fidelity"));
});

test("quality review flags untranslated or thin hot blog summaries", async () => {
  const report = JSON.parse(await readFixture("reports/good/structured-report.json"));
  report.hot_blogs = [
    {
      ...report.hot_blogs[0],
      summary: "This post validates blog cards without evidence images. It should use a full-width title and body instead of leaving an empty media column."
    },
    {
      ...report.hot_blogs[0],
      title: "Thin Blog",
      url: "https://example.com/blog/thin",
      summary: "这篇文章提到 agent 工具。读者可以继续观察。"
    }
  ];

  const review = reviewReportQuality(report);
  const codes = review.issues.map((issue) => issue.code);

  assert.equal(review.ok, false);
  assert(codes.includes("hot_blog_summary_untranslated"));
  assert(review.issues.some((issue) =>
    issue.path === "hot_blogs[1].summary" &&
    Array.isArray(issue.details?.problems) &&
    issue.details.problems.includes("summary_too_short")
  ));
  assert(review.ai_review_tasks.some((task) => task.kind === "hot_blog_editorial_rewrite" && task.path === "hot_blogs[0].summary"));
  assert.equal(review.checklist.find((item) => item.id === "hot_blog_editorial_quality").status, "failed");
});

test("quality review requires hot blogs to expose three to five public points", async () => {
  const report = JSON.parse(await readFixture("reports/good/structured-report.json"));
  report.hot_blogs = [
    {
      ...report.hot_blogs[0],
      title: "Two Point Blog",
      url: "https://example.com/blog/two-points",
      summary: "这篇博客拆解 agent 平台的任务规划、工具权限和失败恢复，说明团队不能只看模型能力。作者用工程案例说明上下文压缩、审计日志和回放评估会决定长任务稳定性。"
    }
  ];

  const review = reviewReportQuality(report);
  const issue = review.issues.find((item) => item.path === "hot_blogs[0].summary");

  assert.equal(review.ok, false);
  assert.equal(issue?.code, "hot_blog_points_invalid");
  assert(issue.details.problems.includes("points_not_3_to_5"));
});

test("quality review flags untranslated main item source excerpts", async () => {
  const report = JSON.parse(await readFixture("reports/good/structured-report.json"));
  report.main_items[0] = {
    ...report.main_items[0],
    summary: "Baidu to Hold Annual General Meeting on June 5, 2026; Baidu to Report First Quarter 2026 Financial Results on May 18, 2026.",
    bullets: [
      "**Baidu Press Releases**: Baidu to Hold Annual General Meeting on June 5, 2026; Baidu to Hold Annual General Meeting on June 5, 2026 Apr 23, 2026 Baidu to Report First Quarter 2026 Financial Results on May 18, 2026.",
      "==影响==：它能帮助读者判断大厂的资源投入、组织重心和商业优先级是否正在改变。"
    ]
  };

  const review = reviewReportQuality(report);
  const codes = review.issues.map((issue) => issue.code);

  assert.equal(review.ok, false);
  assert(codes.includes("main_item_untranslated"));
  assert(review.issues.some((issue) => issue.path === "main_items[0].summary"));
  assert(review.issues.some((issue) => issue.path === "main_items[0].bullets[0]"));
  assert(review.ai_review_tasks.some((task) => task.kind === "main_item_editorial_rewrite"));
  assert.equal(review.checklist.find((item) => item.id === "main_item_editorial_quality").status, "failed");
});

test("quality review flags mixed English changelog excerpts in main item body", async () => {
  const report = JSON.parse(await readFixture("reports/good/structured-report.json"));
  report.main_items[0] = {
    ...report.main_items[0],
    summary: "GitHub Changelog：Fix with Copilot for failing Actions now in Pro, Pro+, and Max。读者应先看原文给出的变化、适用对象和落地边界；When a GitHub Actions job fails, Copilot Pro, Pro+, and Max subscribers can now ask Copilot cloud agent to fix it in one click.",
    bullets: [
      "**GitHub Changelog**：Fix with Copilot for failing Actions now in Pro, Pro+, and Max；When a GitHub Actions job fails, Copilot Pro, Pro+, and Max subscribers can now ask Copilot cloud agent to fix it in one click。",
      "==影响==：它影响开发者和产品团队能否直接复用官方代码、模型权重、示例或社区生态。"
    ]
  };

  const review = reviewReportQuality(report);
  const codes = review.issues.map((issue) => issue.code);

  assert.equal(review.ok, false);
  assert(codes.includes("main_item_untranslated"));
  assert(review.issues.some((issue) => issue.path === "main_items[0].summary"));
  assert(review.issues.some((issue) => issue.path === "main_items[0].bullets[0]"));
  assert.equal(review.checklist.find((item) => item.id === "main_item_editorial_quality").status, "failed");
});

test("quality review flags generic main item reader-guidance bullets", async () => {
  const report = JSON.parse(await readFixture("reports/good/structured-report.json"));
  report.main_items[0] = {
    ...report.main_items[0],
    summary: "WhatsApp 披露其拦截了一轮与 NSO 相关的定向钓鱼攻击。",
    bullets: [
      "**WhatsApp 反间谍**：WhatsApp 披露其拦截了一轮与 NSO 相关的定向钓鱼攻击。",
      "重点看入口、范围和后续变化。",
      "它更像一条决策信号：值不值得试、何时接入、风险放在哪。"
    ]
  };

  const review = reviewReportQuality(report);
  const codes = review.issues.map((issue) => issue.code);

  assert.equal(review.ok, false);
  assert(codes.includes("main_item_template_bullet"));
  assert(review.issues.some((issue) => issue.path === "main_items[0].bullets[1]"));
  assert(review.issues.some((issue) => issue.path === "main_items[0].bullets[2]"));
  assert(review.ai_review_tasks.some((task) => task.kind === "main_item_editorial_rewrite"));
  assert.equal(review.checklist.find((item) => item.id === "main_item_editorial_quality").status, "failed");
});

test("quality review flags untranslated English excerpts in public observation sections", async () => {
  const report = JSON.parse(await readFixture("reports/good/structured-report.json"));
  report.hero_highlights = [
    {
      title: "Industry leaders share new perspectives on generative media for startups",
      url: "https://example.com",
      reason: "Google Keyword Blog：Industry leaders share new perspectives on generative media for startups。这条内容生成线索的关键信息是：Future of AI hero. Treat this as a community lead unless it is backed by a primary source."
    }
  ];
  report.builder_observations = [
    {
      ...report.builder_observations[0],
      content: "这条原帖讨论 AI 工具或 agent 实践：Finally! the first eval ship from cog. To contextualize: METR evals cap out at about 16 hours, while Cog has private enterprise evals up to 100 hours.",
      translation: "这条原帖讨论 AI 工具或 agent 实践：Finally! the first eval ship from cog. To contextualize: METR evals cap out at about 16 hours, while Cog has private enterprise evals up to 100 hours."
    }
  ];
  report.community_leads = [
    {
      ...report.community_leads[0],
      content: "Apple Newsroom：Apple and Major League Baseball have announced the July schedule for Friday Night Baseball on Apple TV, featuring several marquee matchups. Treat this as a community lead unless it is backed by a primary source."
    }
  ];

  const review = reviewReportQuality(report);
  const issuePaths = review.issues.filter((issue) => issue.code === "public_text_untranslated").map((issue) => issue.path);

  assert.equal(review.ok, false);
  assert(issuePaths.includes("hero_highlights[0].reason"));
  assert(issuePaths.includes("builder_observations[0].content"));
  assert(issuePaths.includes("builder_observations[0].translation"));
  assert(issuePaths.includes("community_leads[0].content"));
  assert(review.ai_review_tasks.some((task) => task.kind === "public_editorial_rewrite"));
  assert.equal(review.checklist.find((item) => item.id === "public_editorial_quality").status, "failed");
});

test("quality review rejects templated builder translations", async () => {
  const report = JSON.parse(await readFixture("reports/good/structured-report.json"));
  report.builder_observations = [
    {
      author: "Example Builder",
      original_text: "There should be a way to filter or sort all my Codex threads.",
      translation: "这是一条关于 AI 工具和 agent 实践的 Builder 讨论。读者可关注官方说明、可试用入口、演示截图和真实案例。",
      content: "这是一条关于 AI 工具和 agent 实践的 Builder 讨论。读者可关注官方说明、可试用入口、演示截图和真实案例。",
      url: "https://x.com/example/status/2059000000000000000"
    }
  ];

  const review = reviewReportQuality(report);
  const templateIssues = review.issues.filter((issue) => issue.code === "builder_translation_template");

  assert.equal(review.ok, false);
  assert.equal(templateIssues.length, 2);
  assert(templateIssues.some((issue) => issue.path === "builder_observations[0].translation"));
  assert(templateIssues.some((issue) => issue.path === "builder_observations[0].content"));
  assert(review.ai_review_tasks.some((task) => task.kind === "builder_translation_rewrite"));
  assert.equal(review.checklist.find((item) => item.id === "builder_translation").status, "failed");
});

test("quality review rejects builder translations that are too weak for rendered cards", async () => {
  const report = JSON.parse(await readFixture("reports/good/structured-report.json"));
  report.builder_observations = [
    {
      author: "Boris Cherny",
      handle: "bcherny",
      original_text: "Hello from Code with Claude Tokyo!!",
      translation: "来自 Code with Claude Tokyo 的问候。",
      content: "来自 Code with Claude Tokyo 的问候。",
      url: "https://x.com/bcherny/status/2064885111477219664"
    }
  ];
  report.self_check.builder_observations = report.builder_observations.length;

  const review = reviewReportQuality(report);
  const weakIssues = review.issues.filter((issue) => issue.code === "builder_translation_too_weak");

  assert.equal(review.ok, false);
  assert.deepEqual(weakIssues.map((issue) => issue.path).sort(), [
    "builder_observations[0].content",
    "builder_observations[0].translation"
  ]);
  assert(weakIssues.every((issue) => issue.details.chinese_chars < 10));
  assert(review.ai_review_tasks.some((task) => task.kind === "builder_translation_rewrite" && task.path === "builder_observations[0].translation"));
  assert.equal(review.checklist.find((item) => item.id === "builder_translation").status, "failed");
});

test("quality review rejects templated impact and watch prose in public body", async () => {
  const report = JSON.parse(await readFixture("reports/good/structured-report.json"));
  report.main_items[0] = {
    ...report.main_items[0],
    bullets: [
      "**要点**：GitHub Copilot 增加更大上下文窗口和可配置推理级别。",
      "==影响==：它影响开发者和产品团队能否直接复用官方代码、模型权重、示例或社区生态。",
      "==留意==：看仓库活跃度、README、许可证、模型卡、下载限制和是否有真实案例。"
    ]
  };

  const review = reviewReportQuality(report);
  const issuePaths = review.issues.filter((issue) => issue.code === "public_template_body").map((issue) => issue.path);

  assert.equal(review.ok, false);
  assert(issuePaths.includes("main_items[0].bullets[1]"));
  assert(issuePaths.includes("main_items[0].bullets[2]"));
  assert(review.ai_review_tasks.some((task) => task.kind === "public_editorial_rewrite"));
  assert.equal(review.checklist.find((item) => item.id === "public_editorial_quality").status, "failed");
});

test("quality review rejects source-name prefixes in public body text", async () => {
  const report = JSON.parse(await readFixture("reports/good/structured-report.json"));
  report.hero_highlights = [
    {
      title: "Google 汇总生成式媒体初创公司的行业视角",
      url: "https://example.com/generative-media",
      reason: "Google Keyword Blog：Google 汇总生成式媒体初创公司的行业视角，重点看影像、音乐、游戏和营销内容生产。"
    }
  ];
  report.main_items[0] = {
    ...report.main_items[0],
    title: "Google 汇总生成式媒体初创公司的行业视角",
    summary: "Google 汇总生成式媒体初创公司的行业视角，重点看影像、音乐、游戏和营销内容生产。",
    bullets: [
      "**要点**：Google 汇总生成式媒体初创公司的行业视角。",
      "Google Keyword Blog：Google 汇总生成式媒体初创公司的行业视角，重点看影像、音乐、游戏和营销内容生产。"
    ]
  };
  report.community_leads = [
    {
      ...report.community_leads[0],
      source: "OpenAlex",
      content: "OpenAlex：Zenodo 记录了一个待确认研究线索，事实性结论仍需回到一手来源或多源确认。"
    }
  ];

  const review = reviewReportQuality(report);
  const issuePaths = review.issues.filter((issue) => issue.code === "public_source_prefix").map((issue) => issue.path);

  assert.equal(review.ok, false);
  assert(issuePaths.includes("hero_highlights[0].reason"));
  assert(issuePaths.includes("main_items[0].bullets[1]"));
  assert(issuePaths.includes("community_leads[0].content"));
  assert(review.ai_review_tasks.some((task) => task.kind === "public_editorial_rewrite"));
  assert.equal(review.checklist.find((item) => item.id === "public_editorial_quality").status, "failed");
});

test("quality review rejects legacy hot blog public labels", async () => {
  const report = JSON.parse(await readFixture("reports/good/structured-report.json"));
  report.summary = "今天的技不止术集中在 agent 平台和成本治理。";

  const review = reviewReportQuality(report);
  const legacyIssue = review.issues.find((issue) => issue.path === "summary" && issue.code === "plain_language_stock_phrase");

  assert.equal(review.ok, false);
  assert(legacyIssue);
  assert.equal(legacyIssue.message, "Text contains stock phrase: 技不止术");
});

test("quality review rejects internal review language in public body text", async () => {
  const report = JSON.parse(await readFixture("reports/good/structured-report.json"));
  report.community_leads = [
    {
      ...report.community_leads[0],
      source: "Apple Newsroom",
      content: "Apple 公布 Apple TV 上 Friday Night Baseball 的 7 月赛程。待确认：事实来自可回看的原始链接；边界：不得仅凭该线索写入主体。"
    }
  ];

  const review = reviewReportQuality(report);
  const internalIssue = review.issues.find((issue) => issue.code === "public_internal_review_language");

  assert.equal(review.ok, false);
  assert(internalIssue);
  assert.equal(internalIssue.path, "community_leads[0].content");
  assert(review.ai_review_tasks.some((task) => task.kind === "public_editorial_rewrite" && task.path === "community_leads[0].content"));
  assert.equal(review.checklist.find((item) => item.id === "public_editorial_quality").status, "failed");
});

test("quality review rejects templated hot blog summaries even when length and Chinese ratio pass", async () => {
  const report = JSON.parse(await readFixture("reports/good/structured-report.json"));
  report.hot_blogs = [
    {
      ...report.hot_blogs[0],
      summary: "这篇文章的看点不是单个技术名词，而是它怎样把 agent、开发工具或自动化流程拆成可采用的产品和工程边界。读者可以重点看是否有代码、接口、README、案例或失败模式，而不只看作者结论。对非 AI 直接从业者，价值在于判断 agent 工具是否已经从演示走向可试点的工作流。"
    }
  ];

  const review = reviewReportQuality(report);
  const issue = review.issues.find((item) => item.path === "hot_blogs[0].summary");

  assert.equal(review.ok, false);
  assert.equal(issue?.code, "hot_blog_summary_template");
  assert(issue.details.problems.includes("template_or_low_information"));
  assert.equal(review.checklist.find((item) => item.id === "hot_blog_editorial_quality").status, "failed");
});

test("quality review requires candidate pool and flags autodraft template prose", async () => {
  const report = JSON.parse(await readFixture("reports/good/structured-report.json"));
  report.source_window = {
    date_from: report.report_date,
    date_to: report.report_date,
    fallback_window_used: false,
    notes: "report:draft 自动从固定发现候选池选取；一手候选进入主体。"
  };
  report.self_check = {
    ...report.self_check,
    builder_skill_used: ["candidate-pool-autodraft"],
    notes: "report:draft 已从候选池自动选取并写回 included 标记。"
  };
  report.main_items = [
    {
      ...report.main_items[0],
      candidate_id: "main-auto",
      bullets: [
        "**OpenAI** 发布或更新了这条信号；==它进入主体的原因是来源可回溯且与 AI 产品、模型、工具链或内容生成工作流相关==。"
      ]
    }
  ];
  report.github_trending = [];
  report.hot_blogs = [];
  report.projects = [];
  report.builder_observations = [];
  report.community_leads = [];
  report.model_releases = [];

  const missingPool = reviewReportQuality(report);
  const missingCodes = missingPool.issues.map((issue) => issue.code);
  assert.equal(missingPool.ok, false);
  assert(missingCodes.includes("candidate_pool_not_checked"));
  assert(missingCodes.includes("autodraft_template_phrase"));
  assert(missingPool.ai_review_tasks.some((task) => task.kind === "rewrite_autodraft_template"));

  const withPool = reviewReportQuality(report, {
    candidatePool: {
      schema_version: 1,
      report_date: report.report_date,
      candidates: [
        {
          id: "main-auto",
          status: "included",
          included_in: "main_items"
        }
      ]
    }
  });
  const withPoolCodes = withPool.issues.map((issue) => issue.code);
  assert(!withPoolCodes.includes("candidate_pool_not_checked"));
  assert(withPoolCodes.includes("autodraft_template_phrase"));
  assert.equal(withPool.checklist.find((item) => item.id === "candidate_backrefs").status, "passed");
});

test("quality review validates autodraft candidate backreferences", async () => {
  const report = JSON.parse(await readFixture("reports/good/structured-report.json"));
  report.self_check = {
    ...report.self_check,
    builder_skill_used: ["candidate-pool-autodraft"],
    notes: "candidate-pool-autodraft"
  };
  report.main_items = [
    {
      ...report.main_items[0],
      candidate_id: "main-auto",
      bullets: [
        "**OpenAI** added ==source-linked evidence== for the daily report workflow."
      ]
    }
  ];
  report.github_trending = [];
  report.hot_blogs = [];
  report.projects = [];
  report.builder_observations = [];
  report.community_leads = [];
  report.model_releases = [];

  const review = reviewReportQuality(report, {
    candidatePool: {
      schema_version: 1,
      report_date: report.report_date,
      candidates: [
        {
          id: "main-auto",
          status: "excluded",
          included_in: "hot_blogs"
        }
      ]
    }
  });
  const issues = review.issues.filter((issue) => issue.code === "candidate_pool_reference_invalid");
  assert.equal(review.ok, false);
  assert.equal(issues.length, 2);
  assert.equal(review.checklist.find((item) => item.id === "candidate_backrefs").status, "failed");
});

test("quality repair only applies safe text and highlight fixes", async () => {
  const report = JSON.parse(await readFixture("reports/good/structured-report.json"));
  report.main_items[0].bullets = [
    "==OpenAI shipped a broad platform update with a very long highlighted sentence that should not be entirely marked because it makes the page noisy and hides the real keyword.=="
  ];
  report.builder_observations = [
    {
      author: "Example Builder",
      original_text: "Coding agents need eval loops before unattended work.",
      translation: "Coding agent 在无人值守工作之前需要 eval loops。",
      content: "Coding agents need eval loops before unattended work.",
      url: "https://x.com/examplebuilder/status/2059000000000000000"
    }
  ];

  const { report: repaired, repairs } = repairReportQuality(report);

  assert.equal(repaired.builder_observations[0].content, "Coding agent 在无人值守工作之前需要 eval loops。");
  assert.equal(repaired.builder_observations[0].url, report.builder_observations[0].url);
  assert.equal(repaired.main_items[0].bullets[0].includes("=="), false);
  assert(repairs.some((repair) => repair.code === "builder_content_translation_mismatch"));
  assert(repairs.some((repair) => repair.code === "highlight_too_large"));
});

test("AI repair contract cannot change source facts or links", async () => {
  const report = JSON.parse(await readFixture("reports/good/structured-report.json"));
  const originalUrl = report.main_items[0].url;
  const result = applyQualityRepairContract(report, {
    schema_version: 1,
    report_date: report.report_date,
    edits: [
      {
        path: "main_items[0].bullets[0]",
        value: "**OpenAI** added ==source-linked evidence== for the daily report workflow.",
        reason: "Make the public bullet concise and specific.",
        evidence_path: "main_items[0].url"
      },
      {
        path: "main_items[0].url",
        value: "https://example.com/rewritten-source",
        reason: "This must be rejected."
      }
    ]
  });

  assert.equal(result.report.main_items[0].bullets[0], "**OpenAI** added ==source-linked evidence== for the daily report workflow.");
  assert.equal(result.report.main_items[0].url, originalUrl);
  assert.deepEqual(result.applied.map((edit) => edit.path), ["main_items[0].bullets[0]"]);
  assert.equal(result.rejected[0].path, "main_items[0].url");
  assert.equal(result.rejected[0].code, "path_not_allowed");
});

test("AI repair contract can update hero highlight result and impact copy", async () => {
  const report = JSON.parse(await readFixture("reports/good/structured-report.json"));
  report.hero_highlights = [
    {
      title: "Hero highlight",
      url: report.main_items[0].url,
      reason: "Reader-facing reason.",
      what_happened: "OpenAI News RSS 发布了一条 AI 相关更新，原文标题为“How Preply combines AI and human tutors to personalize learning”",
      why_watch: "它提示某个产品、平台或服务是否接近可试用、可采购或需要重新评估",
      category: "model_platform",
      source_item_ref: report.main_items[0].candidate_id || "main-item-1"
    }
  ];

  const result = applyQualityRepairContract(report, {
    schema_version: 1,
    report_date: report.report_date,
    edits: [
      {
        path: "hero_highlights[0].what_happened",
        value: "DXC 将 Claude 接入受监管行业的系统集成项目。",
        reason: "Repair hero result copy."
      },
      {
        path: "hero_highlights[0].why_watch",
        value: "这说明模型公司正在通过大型 IT 服务商进入企业交付渠道。",
        reason: "Repair hero impact copy."
      }
    ]
  });

  assert.equal(result.report.hero_highlights[0].what_happened, "DXC 将 Claude 接入受监管行业的系统集成项目。");
  assert.equal(result.report.hero_highlights[0].why_watch, "这说明模型公司正在通过大型 IT 服务商进入企业交付渠道。");
  assert.deepEqual(result.applied.map((edit) => edit.path), [
    "hero_highlights[0].what_happened",
    "hero_highlights[0].why_watch"
  ]);
  assert.deepEqual(result.rejected, []);
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
  const indexHtml = await fs.readFile(path.join(outDir, "index.html"), "utf8");
  assert.match(indexHtml, /<link rel="stylesheet" href="assets\/style\.css\?v=[a-f0-9]{12}">/);

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
  structuredReport.github_trending = [
    {
      name: "example/agent-tool",
      repo: "example/agent-tool",
      description: "面向 coding agents 的本地工具。",
      url: "https://github.com/example/agent-tool",
      event_date: "2026-05-15",
      source: "GitHub Trending daily",
      language: "TypeScript",
      window: "daily",
      rank: 1,
      previous_rank: null,
      rank_delta: null,
      trend: "new",
      evidence: "GitHub Trending daily rank #1 with 321 stars today."
    }
  ];
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
  assert(!html.includes("模型发布"));
  assert(!html.includes("ExampleModel 2"));
  assert(!html.includes("多平台可见"));
  assert(!html.includes("官方可用性"));
  assert(html.includes("精选博客更新"));
  assert(html.includes("Harness Engineering for Long Running Agents"));
  assert(html.includes(">重大<"));
  assert(html.includes(">值得关注<"));
  assert(html.includes("今日 +321 stars"));
  assert(html.includes("项目 highlight"));
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

test("buildSite ignores source status history metadata in reports-data", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-source-history-build-"));
  const dataInputDir = path.join(tmp, "reports-data");
  const outDir = path.join(tmp, "docs");
  const structuredReport = JSON.parse(await readFixture("reports/good/structured-report.json"));
  const [year, month] = structuredReport.report_date.split("-");
  const reportDir = path.join(dataInputDir, year, month);
  await fs.mkdir(reportDir, { recursive: true });
  await fs.writeFile(
    path.join(reportDir, `${structuredReport.report_date}.json`),
    `${JSON.stringify(structuredReport, null, 2)}\n`,
    "utf8"
  );
  await fs.writeFile(
    path.join(dataInputDir, "source-status-history.json"),
    `${JSON.stringify({ schema_version: 1, records: [] }, null, 2)}\n`,
    "utf8"
  );

  const result = await buildSite({
    rootDir: tmp,
    inputDir: path.join(tmp, "reports-source"),
    dataInputDir,
    outDir,
    siteUrl,
    generatedAt: fixedGeneratedAt,
    trendConfigPath
  });

  assert.equal(result.reports.length, 1);
  assert(result.writtenFiles.includes(`reports/${year}/${month}/${structuredReport.report_date}.html`));
  assert(result.writtenFiles.includes(`data/${year}/${month}/${structuredReport.report_date}.json`));
});

test("buildSite writes reader-safe public data without internal fields or candidate pools", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-public-data-"));
  const dataInputDir = path.join(tmp, "reports-data");
  const outDir = path.join(tmp, "docs");
  const report = JSON.parse(await readFixture("reports/good/structured-report.json"));
  const [year, month] = report.report_date.split("-");
  const reportDir = path.join(dataInputDir, year, month);
  await fs.mkdir(reportDir, { recursive: true });

  report.candidate_pool_path = `data/${year}/${month}/${report.report_date}.candidates.json`;
  report.main_items[0].candidate_id = "internal-candidate";
  report.main_items[0].why_it_matters = "Internal rationale must not be public data.";
  report.main_items[0].reader_relevance = "Internal reader relevance must not be public data.";
  report.main_items[0].watch_next = "Internal watch-next must not be public data.";
  report.hero_highlights = [
    {
      title: report.main_items[0].title,
      url: report.main_items[0].url,
      reason: "Public must-read reason.",
      what_happened: "Public result for the must-read card.",
      why_watch: "Public impact for the must-read card.",
      category: "model_platform",
      source_item_ref: report.main_items[0].candidate_id
    }
  ];
  report.daily_tracking = [
    {
      id: "openrouter-rankings",
      name: "OpenRouter",
      url: "https://openrouter.ai/rankings",
      event_date: report.report_date,
      source: "OpenRouter Rankings",
      category: "model_usage",
      importance: "notable",
      publish_to_public: true,
      change_status: "changed",
      verification_status: "primary_confirmed",
      source_level: "primary",
      summary: "Public summary.",
      evidence: "OpenRouter public page snapshot parsed successfully.",
      metrics: [],
      watch_points: ["Top models and providers remain visible in the parsed snapshot."],
      snapshot: openRouterSnapshotFixture()
    },
    {
      id: "internal-blocked-tracker",
      name: "Internal Blocked Tracker",
      url: "https://example.com/internal",
      event_date: report.report_date,
      source: "Internal",
      category: "model_usage",
      importance: "general",
      publish_to_public: false,
      change_status: "blocked",
      verification_status: "unverified",
      source_level: "primary",
      summary: "This should not be copied to public data.",
      evidence: "Internal tracker blocked.",
      metrics: [],
      watch_points: ["Internal tracker should remain out of public data."]
    }
  ];
  report.evidence_assets = [
    {
      type: "figure",
      title: "Valid benchmark chart",
      source_url: report.main_items[0].url,
      local_path: "assets/evidence/valid-source-asset.jpg",
      caption: "Benchmark chart from the source article.",
      extraction_status: "source_image",
      width: 640,
      height: 360,
      capture_kind: "source_asset",
      asset_role: "chart",
      asset_kind: "chart"
    },
    {
      type: "figure",
      title: "Full page screenshot",
      source_url: report.main_items[0].url,
      local_path: "assets/evidence/full-page.png",
      caption: "Full page browser screenshot.",
      extraction_status: "source_image",
      width: 1280,
      height: 900,
      capture_kind: "full_page_screenshot"
    }
  ];
  await fs.writeFile(path.join(reportDir, `${report.report_date}.json`), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(reportDir, `${report.report_date}.candidates.json`), `${JSON.stringify({
    schema_version: 1,
    report_date: report.report_date,
    generated_at: fixedGeneratedAt,
    sources: [],
    candidates: [
      {
        id: "internal-candidate",
        source_id: "internal-source",
        title: "Internal candidate",
        url: report.main_items[0].url,
        event_date: report.report_date,
        status: "included",
        included_in: "main_items"
      }
    ]
  }, null, 2)}\n`, "utf8");

  const result = await buildSite({
    rootDir: tmp,
    inputDir: path.join(tmp, "reports-source"),
    dataInputDir,
    outDir,
    siteUrl,
    generatedAt: fixedGeneratedAt,
    trendConfigPath
  });

  assert(result.writtenFiles.includes(`data/${year}/${month}/${report.report_date}.json`));
  assert(!result.writtenFiles.includes(`data/${year}/${month}/${report.report_date}.candidates.json`));
  assert.equal(await exists(path.join(outDir, `data/${year}/${month}/${report.report_date}.candidates.json`)), false);

  const publicData = JSON.parse(await fs.readFile(path.join(outDir, `data/${year}/${month}/${report.report_date}.json`), "utf8"));
  const keys = collectJsonKeys(publicData);
  for (const key of [
    "candidate_id",
    "candidate_pool_path",
    "source_audit",
    "self_check",
    "why_it_matters",
    "reader_relevance",
    "watch_next",
    "source_id",
    "source_level",
    "verification_status",
    "blocking_issues",
    "degraded_sections",
    "publish_status"
  ]) {
    assert(!keys.has(key), `${key} must not appear in public docs data`);
  }
  assert.equal(publicData.daily_tracking.length, 1);
  assert.equal(publicData.daily_tracking[0].id, "openrouter-rankings");
  assert.equal(publicData.hero_highlights[0].why_watch, "Public impact for the must-read card.");
  assert.equal(publicData.hero_highlights[0].source_item_ref, report.main_items[0].url);
  assert(!JSON.stringify(publicData.hero_highlights).includes(report.main_items[0].candidate_id));
  assert.equal(publicData.evidence_assets.length, 1);
  assert.equal(publicData.evidence_assets[0].local_path, "assets/evidence/valid-source-asset.jpg");
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
  assert(indexHtml.includes('id="topic-radar"'));
  assert(indexHtml.includes('id="signal-heat-strip"'));
  assert(!indexHtml.includes("近 7 日趋势"));
  assert(!indexHtml.includes("按年月周导航"));
  assert(indexHtml.includes("coding agent"));

  const data = JSON.parse(await fs.readFile(path.join(outDir, "data/2026/05/2026-05-29.json"), "utf8"));
  assert.equal(data.annotations_by_date, undefined);
  assert.equal(data.trends, undefined);
});

test("date index view model keeps chronological order and transparent signal strength", async () => {
  const quietReport = minimalDateIndexReport("2026-05-13", {
    mainItems: 1,
    github: 0,
    builder: 0,
    hotBlogs: 0,
    tracking: 0,
    qualityStatus: { status: "ok" }
  });
  const strongDegradedReport = minimalDateIndexReport("2026-05-14", {
    mainItems: 10,
    majorItems: 4,
    github: 10,
    builder: 8,
    hotBlogs: 5,
    tracking: 2,
    evidence: 1,
    qualityStatus: {
      status: "degraded",
      public_note: "Builder and source coverage were partially degraded.",
      affected_sections: ["builder_observations", "source_coverage"]
    }
  });
  strongDegradedReport.source_audit = {
    builder_sources: {
      checked: true,
      candidates_found: 8,
      included: 8,
      notes: "Internal audit must not appear in the date index."
    }
  };
  strongDegradedReport.self_check = {
    notes: "Internal self-check must not appear in the date index."
  };
  const feed = {
    schema_version: 1,
    site_title: "AI 日报",
    site_url: siteUrl,
    updated_at: fixedGeneratedAt,
    reports: [feedEntryFor(strongDegradedReport), feedEntryFor(quietReport)]
  };
  const trends = {
    topics: [
      {
        id: "coding-agent",
        label: "coding agent",
        status: "hot",
        occurrences: 6,
        active_days: 2,
        sections: ["main_items", "builder_observations"],
        entities: ["OpenAI"],
        dates: ["2026-05-14"],
        related_reports: ["2026-05-14"]
      }
    ]
  };

  const dateIndex = buildDateIndex(feed, [strongDegradedReport, quietReport], trends);

  assert.deepEqual(dateIndex.items.map((item) => item.date), ["2026-05-13", "2026-05-14"]);
  assert.equal(dateIndex.totals.report_count, 2);
  assert.equal(dateIndex.totals.degraded_days, 1);
  assert.equal(dateIndex.totals.strong_days, 1);
  assert.equal(dateIndex.items[0].strength.level, "quiet");
  assert.equal(dateIndex.items[1].strength.level, "strong");
  assert(dateIndex.items[1].strength.reasons.some((reason) => reason.id === "main_items_high"));
  assert(dateIndex.items[1].strength.reasons.some((reason) => reason.id === "github_full"));
  assert.equal(dateIndex.items[1].quality.status, "degraded");
  assert.deepEqual(dateIndex.items[1].quality.affected_sections, ["builder_observations", "source_coverage"]);
  assert.equal(dateIndex.items[1].flags.has_degraded, true);
  assert.equal(dateIndex.items[1].top_topic.label, "coding agent");
  assert.equal(dateIndex.items[1].metrics.main_items_count, 10);
  assert.equal(dateIndex.items[1].metrics.github_trending_count, 10);
  assert.equal(dateIndex.items[1].metrics.builder_observations_count, 8);
  assert.equal(dateIndex.items[1].metrics.daily_tracking_count, 2);

  const serialized = JSON.stringify(dateIndex);
  assert(!serialized.includes("source_audit"));
  assert(!serialized.includes("self_check"));
  assert(!serialized.includes("candidate_pool"));
  assert(!serialized.includes("Internal audit"));

  assert.equal(deriveDateSignalStrength({
    main_items_count: 5,
    major_count: 1,
    github_trending_count: 2,
    builder_observations_count: 2,
    hot_blogs_count: 1,
    daily_tracking_count: 0,
    section_coverage_count: 3,
    evidence_assets_count: 0
  }).level, "medium");
});

test("calendar index homepage renders controls and independent quality channel", async () => {
  const okReport = minimalDateIndexReport("2026-05-13", {
    mainItems: 2,
    github: 0,
    builder: 1,
    hotBlogs: 0,
    tracking: 0,
    qualityStatus: { status: "ok" }
  });
  const strongDegradedReport = minimalDateIndexReport("2026-05-14", {
    mainItems: 10,
    majorItems: 3,
    github: 10,
    builder: 8,
    hotBlogs: 4,
    tracking: 2,
    evidence: 1,
    qualityStatus: {
      status: "degraded",
      public_note: "Some source lanes degraded.",
      affected_sections: ["source_coverage"]
    }
  });
  const feed = {
    schema_version: 1,
    site_title: "AI 日报",
    site_url: siteUrl,
    updated_at: fixedGeneratedAt,
    reports: [feedEntryFor(strongDegradedReport), feedEntryFor(okReport)]
  };
  const dateIndex = buildDateIndex(feed, [strongDegradedReport, okReport], null);

  const html = renderIndexHtml(feed, null, dateIndex);

  assert(html.includes('id="date-research-index"'));
  assert(html.includes('data-date-card="2026-05-13"'));
  assert(html.includes('data-date-card="2026-05-14"'));
  assert(html.indexOf('data-date-card="2026-05-13"') < html.indexOf('data-date-card="2026-05-14"'));
  assert(html.includes('data-strength-level="strong"'));
  assert(html.includes('data-quality-status="degraded"'));
  assert(html.includes('data-quality-channel="degraded"'));
  assert(html.includes('id="date-filter-strength"'));
  assert(html.includes('id="date-filter-quality"'));
  assert(html.includes('id="date-filter-github"'));
  assert(html.includes('id="selected-date-panel"'));
  assert(html.includes("data-date-index-script"));
  assert(html.includes("主线"));
  assert(html.includes("强度原因"));
  assert(html.includes("降级影响"));
});

test("index rewrite renders signal console from stored data", async () => {
  const quietReport = minimalDateIndexReport("2026-05-13", {
    mainItems: 2,
    github: 0,
    builder: 1,
    hotBlogs: 0,
    tracking: 0,
    qualityStatus: { status: "ok" }
  });
  const strongBlockedReport = minimalDateIndexReport("2026-05-14", {
    mainItems: 10,
    majorItems: 3,
    github: 10,
    builder: 8,
    hotBlogs: 5,
    tracking: 2,
    evidence: 1,
    qualityStatus: {
      status: "blocked",
      public_note: "Report generation is blocked by validation failure.",
      affected_sections: ["hot_blogs", "daily_tracking"]
    }
  });
  const feed = {
    schema_version: 1,
    site_title: "AI 日报",
    site_url: siteUrl,
    updated_at: fixedGeneratedAt,
    reports: [feedEntryFor(strongBlockedReport), feedEntryFor(quietReport)]
  };
  const trends = {
    topics: [
      {
        id: "coding-agent",
        label: "coding agent",
        status: "hot",
        occurrences: 8,
        active_days: 2,
        sections: ["main_items", "builder_observations"],
        entities: ["OpenAI", "Anthropic"],
        dates: ["2026-05-13", "2026-05-14"],
        related_reports: ["2026-05-13", "2026-05-14"]
      }
    ]
  };
  const dateIndex = buildDateIndex(feed, [quietReport, strongBlockedReport], trends);

  const html = renderIndexHtml(feed, trends, dateIndex);

  assert(html.includes('id="index-console"'));
  assert(html.includes('id="latest-briefing"'));
  assert(html.includes('id="signal-heat-strip"'));
  assert(html.includes('id="source-lane-board"'));
  assert(html.includes('id="topic-radar"'));
  assert(html.includes('data-signal-day="2026-05-13"'));
  assert(html.includes('data-signal-day="2026-05-14"'));
  assert(html.indexOf('data-signal-day="2026-05-13"') < html.indexOf('data-signal-day="2026-05-14"'));
  assert(html.includes('data-source-lane="main_items"'));
  assert(html.includes('data-source-lane="github_trending"'));
  assert(html.includes('data-source-lane="builder_observations"'));
  assert(html.includes('data-topic-id="coding-agent"'));
  assert(html.includes('data-quality-channel="blocked"'));
  assert(!html.includes("GitHub Pages 静态归档"));
  assert(!html.includes('id="date-navigation"'));
  assert(!html.includes("<h2>历史日报</h2>"));
});

test("effective interact index style uses report primitives", async () => {
  const baseReport = JSON.parse(await readFixture("reports/good/structured-report.json"));
  const strongBlockedReport = structuredReportForDate(baseReport, "2026-05-14", {
    report: {
      main_items: Array.from({ length: 8 }, (_unused, index) => ({
        ...baseReport.main_items[0],
        title: `Strong signal ${index + 1}`,
        url: `https://example.com/effective-index-main-${index + 1}`,
        importance: index < 3 ? "major" : "notable"
      })),
      github_trending: (baseReport.github_trending || []).slice(0, 2),
      builder_observations: (baseReport.builder_observations || []).slice(0, 2),
      quality_status: {
        status: "degraded",
        blocking_issues: [],
        degraded_sections: [{ section: "builder_observations", message: "Builder lane degraded." }],
        affected_sections: ["builder_observations"],
        notes: "测试降级质量通道。"
      }
    }
  });
  const quietReport = structuredReportForDate(baseReport, "2026-05-13", {
    report: {
      main_items: baseReport.main_items.slice(0, 2),
      github_trending: [],
      builder_observations: [],
      hot_blogs: [],
      daily_tracking: []
    }
  });
  const feed = {
    schema_version: 1,
    site_title: "AI 日报",
    site_url: siteUrl,
    updated_at: fixedGeneratedAt,
    reports: [feedEntryFor(strongBlockedReport), feedEntryFor(quietReport)]
  };
  const trends = {
    topics: [
      {
        id: "effective-interact-style",
        label: "effective-interact style",
        status: "hot",
        occurrences: 4,
        active_days: 2,
        entities: ["AI 日报"],
        dates: ["2026-05-13", "2026-05-14"],
        related_reports: ["2026-05-13", "2026-05-14"]
      }
    ]
  };
  const dateIndex = buildDateIndex(feed, [quietReport, strongBlockedReport], trends);

  const html = renderIndexHtml(feed, trends, dateIndex);

  assert(html.includes('data-index-style="effective-interact"'));
  assert(html.includes('class="report-shell index-page"'));
  assert(html.includes('class="report-hero report-hero-index"'));
  assert(html.includes("hero-brief"));
  assert(html.includes("hero-summary-text"));
  assert(html.includes("hero-stat-grid"));
  assert(html.includes("hero-stat"));
  assert(html.includes('class="report-nav"'));
  assert(html.includes('data-nav-link'));
  assert(html.includes('class="panel latest-briefing"'));
  assert(html.includes('class="panel source-lane-board"'));
  assert(html.includes("report-data-table"));
  assert(html.includes("chip"));
  assert(html.includes("status-warn"));
  assert(!html.includes("class=\"index-console-stats\""));
  assert(!html.includes("class=\"source-lane-grid\""));
});

test("buildSite writes date index homepage without exposing private report fields", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-date-index-build-"));
  const dataInputDir = path.join(tmp, "reports-data");
  const outDir = path.join(tmp, "docs");
  await fs.mkdir(dataInputDir, { recursive: true });
  const base = JSON.parse(await readFixture("reports/good/structured-report.json"));
  const firstReport = structuredReportForDate(base, "2026-05-13");
  const secondReport = structuredReportForDate(base, "2026-05-14");
  const firstMainItem = secondReport.main_items[0];
  secondReport.main_items = Array.from({ length: 10 }, (_unused, index) => ({
    ...firstMainItem,
    title: `${firstMainItem.title} ${index + 1}`,
    url: `https://example.com/date-index-main-${index + 1}`,
    importance: index < 3 ? "major" : "notable"
  }));
  secondReport.github_trending = Array.from({ length: 10 }, (_unused, index) => ({
    name: `example/date-index-${index + 1}`,
    repo: `example/date-index-${index + 1}`,
    description: `Date index project ${index + 1} with public AI signal.`,
    url: `https://github.com/example/date-index-${index + 1}`,
    event_date: secondReport.report_date,
    source: "GitHub Trending daily",
    rank: index + 1,
    trend: "new",
    evidence: `GitHub Trending daily fixture ${index + 1}.`
  }));
  const firstBuilder = secondReport.builder_observations[0];
  secondReport.builder_observations = Array.from({ length: 8 }, (_unused, index) => ({
    ...firstBuilder,
    author: `Date Index Builder ${index + 1}`,
    handle: `dateindexbuilder${index + 1}`,
    url: `https://x.com/dateindexbuilder/status/20590000000000000${index + 1}`,
    original_text: `Date index original builder observation ${index + 1}.`,
    translation: `日期索引 Builder 观察 ${index + 1}。`,
    content: `日期索引 Builder 观察 ${index + 1}。`
  }));
  secondReport.source_audit = {
    builder_sources: {
      checked: true,
      candidates_found: 8,
      included: 8,
      notes: "Internal audit should never be copied to homepage."
    }
  };
  secondReport.self_check.notes = "Internal self-check should never be copied to homepage.";

  await fs.writeFile(path.join(dataInputDir, "2026-05-13.json"), `${JSON.stringify(firstReport, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(dataInputDir, "2026-05-14.json"), `${JSON.stringify(secondReport, null, 2)}\n`, "utf8");

  const result = await buildSite({
    rootDir: tmp,
    inputDir: path.join(tmp, "reports-source"),
    dataInputDir,
    outDir,
    siteUrl,
    generatedAt: fixedGeneratedAt,
    trendConfigPath
  });

  assert(result.writtenFiles.includes("index.html"));
  assert.equal(result.dateIndex.items.length, 2);
  const html = await fs.readFile(path.join(outDir, "index.html"), "utf8");
  assert(html.includes('id="date-research-index"'));
  assert(html.includes('data-date-card="2026-05-13"'));
  assert(html.includes('data-date-card="2026-05-14"'));
  assert(html.indexOf('data-date-card="2026-05-13"') < html.indexOf('data-date-card="2026-05-14"'));
  assert(html.includes('data-strength-level="strong"'));
  assert(html.includes("透明统计"));
  assert(!html.includes("source_audit"));
  assert(!html.includes("self_check"));
  assert(!html.includes("candidate_pool"));
  assert(!html.includes("Internal audit"));
  assert(!html.includes("Internal self-check"));
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

test("report:write 允许热门博客和社区线索携带公开图片字段", async () => {
  const draft = JSON.parse(await readFixture("reports/good/structured-draft.json"));
  const candidatePool = JSON.parse(await readFixture("reports/good/structured-draft.candidates.json"));
  draft.hot_blogs = [
    {
      title: "Visible blog card",
      candidate_id: "hot-blog-with-image",
      editorial_category: "viewpoint_analysis",
      source_level: "primary",
      verification_status: "primary_confirmed",
      verification_note: "Backed by the original blog post.",
      risk_note: "No extra risk note.",
      image_url: "https://example.com/blog-cover.png",
      image_alt: "Blog cover",
      image_source: "feed",
      url: "https://example.com/blog-post",
      publisher: "Example Blog",
      author: "Example Author",
      event_date: "2026-05-16",
      topic: "agent workflow",
      summary: "这篇文章把 agent 工作流拆成任务规划、上下文治理和失败恢复几层，适合拿来判断团队是否该做更重的自动化编排。",
      content_type: "blog"
    }
  ];
  draft.community_leads = [
    {
      candidate_id: "community-lead-with-image",
      title: "示例社区线索",
      content: "这条社区线索直接告诉读者这件事在说什么，并附带公开图片。",
      image_url: "https://example.com/community-cover.png",
      image_alt: "Community cover",
      image_source: "feed",
      url: "https://example.com/community-lead",
      event_date: "2026-05-16",
      source: "Example Community",
      evidence: "Primary write-up with a public image.",
      editorial_category: "community_signal",
      source_level: "primary",
      verification_status: "primary_confirmed",
      verification_note: "Primary source reviewed.",
      risk_note: "No extra risk note."
    }
  ];
  candidatePool.candidates.push(
    {
      ...candidatePool.candidates[0],
      id: "hot-blog-with-image",
      title: "Visible blog card",
      url: "https://example.com/blog-post",
      category: "hot_blog",
      included_in: "hot_blogs",
      status: "included",
      source: "Example Blog",
      source_level: "primary",
      verification_status: "primary_confirmed",
      event_date: "2026-05-16"
    },
    {
      ...candidatePool.candidates[0],
      id: "community-lead-with-image",
      title: "示例社区线索",
      url: "https://example.com/community-lead",
      category: "community_lead",
      included_in: "community_leads",
      status: "included",
      source: "Example Community",
      source_level: "primary",
      verification_status: "primary_confirmed",
      event_date: "2026-05-16"
    }
  );

  const normalized = normalizeReportDraft(draft, {
    siteUrl,
    generatedAt: fixedGeneratedAt,
    candidatePool
  });

  assert.equal(normalized.hot_blogs[0].image_url, "https://example.com/blog-cover.png");
  assert.equal(normalized.hot_blogs[0].image_alt, "Blog cover");
  assert.equal(normalized.community_leads[0].image_url, "https://example.com/community-cover.png");
  assert.equal(normalized.community_leads[0].image_alt, "Community cover");
});

test("source status history dedupes same-day records and flags 10-day stale sources", () => {
  const staleUrl = "https://example.com/stale-feed.xml";
  const currentRecords = extractSourceStatusRecords({
    content_sources: {
      checked: true,
      sources: [
        {
          name: "Stale Feed",
          url: staleUrl,
          status: "blocked",
          notes: "latest run blocked"
        },
        {
          name: "Healthy Feed",
          url: "https://example.com/healthy-feed.xml",
          status: "checked",
          notes: "latest run parsed items"
        }
      ],
      candidates_found: 0,
      included: 0
    }
  }, {
    reportDate: "2026-05-16",
    generatedAt: fixedGeneratedAt
  });
  const staleHistory = datesThrough("2026-05-07", 9).map((date) => ({
    date,
    group: "content_sources",
    source_key: staleUrl,
    name: "Stale Feed",
    url: staleUrl,
    status: "no_signal",
    notes: "no dated items"
  }));
  const healthyHistory = datesThrough("2026-05-07", 9).map((date, index) => ({
    date,
    group: "content_sources",
    source_key: "https://example.com/healthy-feed.xml",
    name: "Healthy Feed",
    url: "https://example.com/healthy-feed.xml",
    status: index === 4 ? "checked" : "no_signal",
    notes: "mixed status"
  }));
  const firstMerge = mergeSourceStatusRecords({
    schema_version: 1,
    records: [...staleHistory, ...healthyHistory]
  }, currentRecords, {
    reportDate: "2026-05-16",
    generatedAt: fixedGeneratedAt
  });
  const secondMerge = mergeSourceStatusRecords(firstMerge, currentRecords.map((record) =>
    record.url === staleUrl ? { ...record, notes: "second same-day run" } : record
  ), {
    reportDate: "2026-05-16",
    generatedAt: fixedGeneratedAt
  });

  const staleRecords = secondMerge.records.filter((record) => record.url === staleUrl);
  assert.equal(staleRecords.length, 10);
  assert.equal(staleRecords.filter((record) => record.date === "2026-05-16").length, 1);
  assert.equal(staleRecords.find((record) => record.date === "2026-05-16").notes, "second same-day run");

  const staleSources = findSourcesWithoutEffectiveSignal(secondMerge, {
    reportDate: "2026-05-16",
    days: 10
  });

  assert.equal(staleSources.length, 1);
  assert.equal(staleSources[0].name, "Stale Feed");
  assert.equal(staleSources[0].blocked_count, 1);
  assert.equal(staleSources[0].no_signal_count, 9);
});

test("report:write tracks source status history and appends stale source optimization suggestion", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-source-status-"));
  const draft = JSON.parse(await readFixture("reports/good/structured-draft.json"));
  const staleUrl = "https://example.com/stale-feed.xml";
  draft.source_audit.content_sources.sources.push({
    name: "Stale Feed",
    url: staleUrl,
    status: "no_signal",
    notes: "no dated items returned"
  });
  const draftPath = path.join(tmp, "daily-report.json");
  await fs.writeFile(draftPath, `${JSON.stringify(draft, null, 2)}\n`, "utf8");

  const historyPath = path.join(tmp, "reports-data", "source-status-history.json");
  await fs.mkdir(path.dirname(historyPath), { recursive: true });
  await fs.writeFile(historyPath, `${JSON.stringify({
    schema_version: 1,
    records: datesThrough("2026-05-07", 9).map((date) => ({
      date,
      group: "content_sources",
      source_key: staleUrl,
      name: "Stale Feed",
      url: staleUrl,
      status: date === "2026-05-12" ? "blocked" : "no_signal",
      notes: "historical no signal"
    }))
  }, null, 2)}\n`, "utf8");

  const result = await writeReportDraft({
    rootDir: tmp,
    inputPath: draftPath,
    outputDir: "reports-data",
    candidatePoolPath: path.join(rootDir, "tests/fixtures/reports/good/structured-draft.candidates.json"),
    siteUrl,
    generatedAt: fixedGeneratedAt
  });

  assert.equal(result.sourceStatusHistoryPath, historyPath);
  assert.equal(await exists(result.sourceStatusHistoryPath), true);
  const history = JSON.parse(await fs.readFile(historyPath, "utf8"));
  const staleRecords = history.records.filter((record) => record.url === staleUrl);
  assert.equal(staleRecords.length, 10);
  assert.equal(staleRecords.filter((record) => record.date === "2026-05-16").length, 1);
  assert.equal(result.report.self_check.source_status_history.stale_sources, 1);
  assert(result.report.self_check.optimization_suggestions.some((item) =>
    item.issue.includes("过去 10 天存在持续无有效信号的固定信源") &&
    item.evidence.includes("Stale Feed")
  ));
});

test("report:draft 从发现候选池自动选取并写出可 report:write 的草稿", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-autodraft-"));
  const reportDate = "2026-05-26";
  const discoveryPath = path.join(tmp, "discovery.json");
  const discovery = autodraftDiscoveryFixture(reportDate);
  discovery.candidates.push({
    id: "github-weekly-rank-one",
    source_id: "github-github-trending-weekly",
    category: "project",
    title: "example/weekly-project",
    repo: "example/weekly-project",
    url: "https://github.com/example/weekly-project",
    source: "GitHub Trending weekly",
    event_date: reportDate,
    status: "excluded",
    rank: 1,
    trend: "new",
    language: "TypeScript",
    window: "weekly",
    description: "Weekly-only project that must not replace the daily Top 10.",
    evidence: "GitHub Trending weekly rank #1 with recent stars this week.",
    verification_status: "primary_confirmed",
    source_level: "github",
    primary_url: "https://github.com/example/weekly-project",
    verification_sources: ["https://github.com/example/weekly-project"]
  });
  discovery.candidates.push({
    id: "official-looking-intermediary",
    source_id: "content-google-research-blog",
    category: "community_lead",
    title: "Aggregator says Google released a model",
    url: "https://example.com/intermediary-google-model",
    source: "Google Research Blog",
    event_date: reportDate,
    status: "excluded",
    evidence: "A non-primary wrapper claims a model update but has not returned to the original post.",
    verification_status: "intermediary_only",
    source_level: "official",
    intermediary_url: "https://example.com/wrapper"
  });
  discovery.candidates.push({
    id: "builder-non-ai",
    source_id: "builder-follow-builders-x-feed",
    category: "builder_observation",
    title: "@builder: off topic",
    url: "https://x.com/builder/status/1794993600000000999",
    source: "follow-builders X feed",
    event_date: reportDate,
    status: "excluded",
    author: "Example Builder",
    handle: "builder",
    original_text: "not anything ai related, just a personal update",
    evidence: "Original X status collected by follow-builders.",
    verification_status: "original_social_only",
    source_level: "original_social",
    original_url: "https://x.com/builder/status/1794993600000000999"
  });
  discovery.evidence_assets = [
    {
      type: "figure",
      title: "OpenRouter browser screenshot",
      source_url: "https://openrouter.ai/rankings",
      local_path: "assets/evidence/openrouter-page.png",
      caption: "OpenRouter Rankings 页面截图，不应进入公开日报主体证据。",
      extraction_status: "source_image"
    }
  ];
  await fs.writeFile(discoveryPath, `${JSON.stringify(discovery, null, 2)}\n`, "utf8");

  const drafted = await generateReportDraft({
    rootDir: tmp,
    reportDate,
    generatedAt: fixedGeneratedAt,
    inputPaths: [discoveryPath],
    cacheEvidence: false
  });

  assert(drafted.counts.main_items >= 7);
  assert.equal(drafted.counts.github_trending, 10);
  assert.equal(drafted.counts.daily_tracking, 3);
  assert.deepEqual(drafted.report.daily_tracking.map((item) => item.id), [
    "openrouter-rankings",
    "artificial-analysis-intelligence-index",
    "swe-bench-pro-public"
  ]);
  assert(drafted.report.daily_tracking.every((item) => item.watch_points.length > 0 && item.metrics.length > 0));
  assert(!drafted.report.evidence_assets.some((asset) =>
    /openrouter|browser screenshot|页面截图|screenshot/i.test(`${asset.title || ""} ${asset.caption || ""} ${asset.local_path || ""}`)
  ));
  assert.deepEqual(drafted.report.github_trending.map((item) => item.rank), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert(drafted.report.github_trending.every((item) => item.source === "GitHub Trending daily"));
  assert(!drafted.report.github_trending.some((item) => item.repo === "example/weekly-project"));
  assert(drafted.report.main_items.some((item) => item.editorial_category === "content_aigc"));
  assert(!drafted.report.main_items.some((item) => item.verification_status === "intermediary_only"));
  assert(!drafted.report.main_items.some((item) => item.url === "https://example.com/intermediary-google-model"));
  assert(!drafted.report.main_items.some((item) => item.source === "OpenAI Status"));
  assert(!drafted.report.main_items.some((item) => item.source === "Product Hunt Trending Feed"));
  assert(!drafted.report.main_items.some((item) => item.source === "TechCrunch AI"));
  assert(!drafted.report.main_items.some((item) => item.source === "OpenAlex"));
  assert(!drafted.report.main_items.some((item) => item.title.includes("AI 寻找 Bug")));
  assert(!drafted.report.builder_observations.some((item) => item.original_text?.includes("not anything ai related")));
  assert(drafted.report.hot_blogs.every((item) => {
    const summary = String(item.summary || "");
    const points = Array.isArray(item.key_points) ? item.key_points : summary
      .split(/(?<=[\u3002\uff01\uff1f!?\uff1b;])\s*/u)
      .map((part) => part.trim())
      .filter(Boolean);
    return summary.length >= 100 && /\p{Script=Han}/u.test(summary) && points.length >= 3 && points.length <= 5;
  }));
  const draftInput = reportToInteractionInput(drafted.report);
  const blogCards = draftInput.sections.find((section) => section.cardClass === "blog-card")?.items || [];
  assert(blogCards.length > 0);
  assert(blogCards.every((card) => Array.isArray(card.points) && card.points.filter((point) => /^要点\s*\d+/.test(point.label)).length >= 3));
  assert(drafted.report.main_items.every((item) =>
    Array.isArray(item.bullets) &&
    item.bullets.every((bullet) => !/重点看|值不值得试|决策信号/u.test(String(bullet || "")))
  ));
  assert(drafted.report.hot_blogs.every((item) => !/适合用来判断 agent 工具是否已经从演示走向可试点的工作流/u.test(String(item.summary || ""))));
  const publicAutodraftText = JSON.stringify({
    summary: drafted.report.summary,
    main_items: drafted.report.main_items,
    hot_blogs: drafted.report.hot_blogs,
    builder_observations: drafted.report.builder_observations
  });
  for (const phrase of [
    "来源链路清晰",
    "核验状态为",
    "事实栏目只采用",
    "可信信号",
    "发布或更新了这条信号",
    "自动草稿译述",
    "工程雷达线索",
    "这次放出的信息主要落在",
    "当前公开信息主要落在",
    "公开细节集中在",
    "最有用的公开信息，通常是",
    "当前公开信息主要集中在"
  ]) {
    assert(!publicAutodraftText.includes(phrase), `public autodraft text should not include ${phrase}`);
  }
  assert(drafted.candidatePool.candidates.some((candidate) =>
    candidate.status === "included" &&
    candidate.included_in === "main_items" &&
    candidate.category === "main_item"
  ));
  assert(drafted.candidatePool.candidates.some((candidate) =>
    candidate.status === "included" &&
    candidate.included_in === "github_trending" &&
    candidate.category === "github_trending"
  ));
  assert(drafted.report.source_audit.content_sources.included <= drafted.report.source_audit.content_sources.candidates_found);
  assert(drafted.report.source_audit.github_trending.included <= drafted.report.source_audit.github_trending.candidates_found);

  const draftReview = reviewReportQuality(drafted.report, { candidatePool: drafted.candidatePool });
  const draftReviewCodes = draftReview.issues.map((issue) => issue.code);
  assert(!draftReviewCodes.includes("autodraft_template_phrase"));
  assert(!draftReviewCodes.includes("candidate_pool_reference_invalid"));
  assert(!draftReviewCodes.includes("main_item_untranslated"));
  assert(!draftReviewCodes.includes("hot_blog_summary_untranslated"));
  assert(!draftReviewCodes.includes("hot_blog_summary_too_thin"));
  assert(!draftReviewCodes.includes("hot_blog_points_invalid"));
  assert.equal(draftReview.checklist.find((item) => item.id === "candidate_backrefs").status, "passed");
  assert.equal(draftReview.checklist.find((item) => item.id === "main_item_editorial_quality").status, "passed");
  assert.equal(draftReview.checklist.find((item) => item.id === "hot_blog_editorial_quality").status, "passed");

  const written = await writeReportDraft({
    rootDir: tmp,
    inputPath: drafted.path,
    outputDir: path.join(tmp, "reports-data"),
    candidatePoolPath: drafted.candidatePoolPath,
    siteUrl,
    generatedAt: fixedGeneratedAt
  });

  assert.equal(written.report.report_date, reportDate);
  assert(written.report.main_items.length >= 7);
  assert.equal(written.report.github_trending.length, 10);
  assert.equal(written.report.daily_tracking.length, 3);
  assert.equal(written.report.quality_status.status, "degraded");
  assert(written.report.quality_status.reasons.includes("daily_tracking_source_blocked"));
  assert(written.report.quality_status.degraded_sections.some((issue) => issue.section === "daily_tracking"));
});

test("report:draft prioritizes strategic official AI company sources over NVIDIA and AWS floods", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-strategic-priority-"));
  const reportDate = "2026-05-26";
  const discoveryPath = path.join(tmp, "discovery.json");
  const strategicCandidates = [
    strategicOfficialCandidate(reportDate, {
      id: "openai-official-model",
      source: "OpenAI News RSS",
      url: "https://openai.com/news/gpt-6",
      title: "OpenAI announces GPT-6 for API and enterprise developers",
      evidence: "OpenAI announced a GPT-6 model release with API availability, enterprise controls, pricing notes, and developer migration guidance."
    }),
    strategicOfficialCandidate(reportDate, {
      id: "anthropic-official-model",
      source: "Anthropic News",
      url: "https://www.anthropic.com/news/claude-fable-5",
      title: "Claude Fable 5 and Mythos 5 launch from Anthropic",
      evidence: "Anthropic says Claude Fable 5 and Claude Mythos 5 are the same underlying model, with trusted-access safeguards and general-use deployment guidance."
    }),
    strategicOfficialCandidate(reportDate, {
      id: "zhipu-official-platform",
      source: "Zhipu AI News",
      url: "https://www.zhipuai.cn/zh/news/glm-5-api",
      title: "智谱发布 GLM-5 API 与企业平台更新",
      evidence: "智谱官方新闻说明 GLM-5 API、企业平台、模型价格、上线节奏和开发者迁移入口。"
    }),
    strategicOfficialCandidate(reportDate, {
      id: "minimax-official-news",
      source: "MiniMax News",
      url: "https://www.minimax.io/news/m3-model-release",
      title: "MiniMax 发布 M3 模型与 Hailuo AI 开发者更新",
      evidence: "MiniMax 官方新闻介绍 M3 模型、Hailuo AI、API 能力、模型发布节奏和创作者工作流。"
    }),
    strategicOfficialCandidate(reportDate, {
      id: "kimi-official-blog",
      source: "Kimi Technical Blog",
      url: "https://www.kimi.com/blog/kimi-k2-agent-update",
      title: "Kimi 技术博客发布 K2 agent 与长上下文平台更新",
      evidence: "Kimi 技术博客说明 K2 agent、长上下文、API、开发者平台和工作流上线节奏。"
    }),
    strategicOfficialCandidate(reportDate, {
      id: "meta-official-ai",
      source: "Meta AI Blog",
      url: "https://ai.meta.com/blog/llama-agent-platform",
      title: "Meta AI 发布 Llama agent 平台更新",
      evidence: "Meta AI 官方博客介绍 Llama agent 平台、开源模型、开发者工具、企业部署和模型权重发布。"
    })
  ];
  const infraCandidates = Array.from({ length: 8 }, (_, index) => {
    const nvidia = index % 2 === 0;
    return strategicOfficialCandidate(reportDate, {
      id: `${nvidia ? "nvidia" : "aws"}-infra-${index + 1}`,
      source: nvidia ? "NVIDIA Developer Blog" : "AWS Machine Learning Blog",
      url: nvidia
        ? `https://developer.nvidia.com/blog/blackwell-training-${index + 1}/`
        : `https://aws.amazon.com/blogs/machine-learning/bedrock-agentcore-${index + 1}/`,
      title: nvidia
        ? `NVIDIA Blackwell CUDA workflow update ${index + 1}`
        : `AWS Bedrock AgentCore workflow update ${index + 1}`,
      evidence: nvidia
        ? "NVIDIA Developer Blog describes Blackwell, CUDA, NVFP4, developer workflow, model training availability, and platform release details."
        : "AWS Machine Learning Blog describes Bedrock AgentCore, model inference, API availability, quotas, developer workflow, and platform release details.",
      sourceLevel: "official",
      category: "hot_blog"
    });
  });
  const discovery = discoveryEnvelope({
    candidates: [...infraCandidates, ...strategicCandidates],
    sourceNames: ["OpenAI News RSS", "Anthropic News", "Zhipu AI News", "MiniMax News", "Kimi Technical Blog", "Meta AI Blog", "NVIDIA Developer Blog", "AWS Machine Learning Blog"]
  });
  await fs.writeFile(discoveryPath, `${JSON.stringify(discovery, null, 2)}\n`, "utf8");

  const drafted = await generateReportDraft({
    rootDir: tmp,
    reportDate,
    generatedAt: fixedGeneratedAt,
    inputPaths: [discoveryPath],
    cacheEvidence: false
  });

  const mainSources = drafted.report.main_items.map((item) => item.source);
  assert(mainSources.includes("OpenAI News RSS"));
  assert(mainSources.includes("Anthropic News"));
  assert(mainSources.includes("Zhipu AI News"));
  assert(mainSources.includes("MiniMax News"));
  assert(mainSources.includes("Kimi Technical Blog"));
  assert(mainSources.includes("Meta AI Blog"));
  assert(
    drafted.report.main_items.filter((item) => /NVIDIA|AWS/i.test(item.source)).length <= 2,
    "NVIDIA/AWS should not occupy more than two main items when strategic official sources are available"
  );
});

test("report:draft reserves Chinese hot blog slot when qualified", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-chinese-hot-blog-"));
  const reportDate = "2026-06-11";
  const mainCandidates = Array.from({ length: 10 }, (_unused, index) => ({
    id: `main-official-${index + 1}`,
    source_id: "source-main-official",
    category: "community_lead",
    title: `Official AI platform update ${index + 1}`,
    url: `https://example.com/main/${index + 1}`,
    source: "OpenAI News RSS",
    event_date: reportDate,
    status: "excluded",
    evidence: "Official platform model API launch with product details, benchmark context, and availability notes for engineering teams.",
    source_level: "primary",
    verification_status: "primary_confirmed"
  }));
  const overseasBlogs = Array.from({ length: 8 }, (_unused, index) => ({
    id: `overseas-blog-${index + 1}`,
    source_id: "source-overseas-blog",
    category: "hot_blog",
    title: `Overseas model benchmark architecture blog ${index + 1}`,
    url: `https://example.com/blog/${index + 1}`,
    source: "Anthropic News",
    event_date: reportDate,
    status: "excluded",
    evidence: "This blog explains model benchmark architecture, implementation details, evaluation workflow, and deployment constraints for AI teams.",
    source_level: "primary",
    verification_status: "primary_confirmed"
  }));
  const chineseBlog = {
    id: "qwen-chinese-blog",
    source_id: "china-ai-qwen-blog",
    category: "hot_blog",
    title: "通义千问模型评测与推理架构更新",
    url: "https://qwen.ai/blog/chinese-model-benchmark",
    source: "Qwen Blog",
    event_date: reportDate,
    status: "excluded",
    evidence: "官方博客说明模型评测、推理架构、API 接入和部署约束，适合中国 AI 覆盖的中文官方博客 slot。",
    source_level: "official_model_host_account",
    verification_status: "primary_confirmed"
  };
  const inputPath = path.join(tmp, "discovery.json");
  await fs.writeFile(inputPath, JSON.stringify({
    source_audit: {
      content_sources: {
        checked: true,
        sources: [{ name: "Anthropic News", url: "https://www.anthropic.com/news", status: "checked", notes: "fixture" }],
        candidates_found: overseasBlogs.length,
        included: 0,
        notes: "fixture"
      },
      china_ai_sources: {
        checked: true,
        sources: [{ name: "Qwen Blog", url: "https://qwen.ai/blog", status: "checked", notes: "fixture" }],
        candidates_found: 1,
        included: 0,
        notes: "fixture"
      }
    },
    candidates: [...mainCandidates, ...overseasBlogs, chineseBlog]
  }), "utf8");

  const drafted = await generateReportDraft({
    rootDir: tmp,
    reportDate,
    generatedAt: fixedGeneratedAt,
    inputPaths: [inputPath],
    outputPath: path.join(tmp, "daily-report.json"),
    candidateOutputPath: path.join(tmp, "source-candidates.json"),
    cacheEvidence: false
  });

  assert(drafted.report.hot_blogs.some((item) => item.url === chineseBlog.url));
});

test("interaction input renders AI industry, content track, and selected blog sections", () => {
  const report = {
    schema_version: 1,
    report_date: "2026-05-26",
    title: "AI 日报 2026-05-26",
    summary: "今日重点覆盖模型、平台和内容赛道。",
    site_url: siteUrl,
    main_items: [
      {
        title: "OpenAI 发布企业 API 更新",
        summary: "OpenAI 官方说明企业 API、模型发布、权限边界和开发者迁移节奏。",
        bullets: ["**平台边界**：API、权限、定价和企业治理需要一起核对。"],
        url: "https://openai.com/news/example-enterprise-api",
        event_date: "2026-05-26",
        source: "OpenAI News RSS",
        source_level: "official_company_news",
        verification_status: "primary_confirmed",
        editorial_category: "ai_industry"
      },
      {
        title: "Runway 更新 AI 视频创作工作流",
        summary: "Runway 官方 changelog 说明视频生成、游戏世界和创作者工作流的产品变化。",
        bullets: ["**内容生产**：视频、游戏资产和创作者工具进入同一条产品链路。"],
        url: "https://runwayml.com/en/changelog/example",
        event_date: "2026-05-26",
        source: "Runway Changelog",
        source_level: "official",
        verification_status: "primary_confirmed",
        editorial_category: "content_aigc"
      }
    ],
    hot_blogs: [
      {
        title: "Harness Engineering for Long Running Agents",
        summary: "这篇文章把长运行 agent 的任务规划、上下文治理、工具执行、结果校验和恢复路径拆成清晰层次，适合判断 agent 平台的工程边界。",
        key_points: ["任务规划需要可回放", "上下文治理决定成本", "工具执行要有权限边界"],
        url: "https://example.com/blog/harness-engineering",
        publisher: "Example Blog",
        author: "Example",
        event_date: "2026-05-26",
        topic: "agent harness",
        source_level: "primary",
        verification_status: "primary_confirmed"
      }
    ],
    github_trending: [],
    projects: [],
    builder_observations: [],
    community_leads: [],
    daily_tracking: [],
    evidence_assets: [],
    source_audit: {}
  };

  const input = reportToInteractionInput(report);
  const titles = input.sections.map((section) => section.title);
  assert(titles.includes("AI 行业动态"));
  assert(titles.includes("内容赛道动态"));
  assert(titles.includes("精选博客更新"));
  assert(!titles.includes("AI 资讯"));
  assert(!titles.includes("热门博客"));
});

test("report:draft cleans Builder original_text shell metadata before publishing", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-builder-clean-"));
  const reportDate = "2026-05-26";
  const discoveryPath = path.join(tmp, "discovery.json");
  const discovery = autodraftDiscoveryFixture(reportDate);
  discovery.candidates.push({
    id: "builder-shell-text",
    source_id: "builder-follow-builders-x-feed",
    category: "builder_observation",
    title: "@builder shipped eval workflow",
    url: "https://x.com/builder/status/2059000000000000999",
    source: "follow-builders X feed",
    event_date: reportDate,
    status: "excluded",
    author: "Example Builder",
    handle: "builder",
    original_text: "Example Builder @builder 1h I shipped a concrete eval workflow for coding agents. 123 Likes 5 Replies View post image",
    evidence: "Original X status collected by follow-builders.",
    verification_status: "original_social_only",
    source_level: "original_social",
    original_url: "https://x.com/builder/status/2059000000000000999"
  });
  await fs.writeFile(discoveryPath, `${JSON.stringify(discovery, null, 2)}\n`, "utf8");

  const drafted = await generateReportDraft({
    rootDir: tmp,
    reportDate,
    generatedAt: fixedGeneratedAt,
    inputPaths: [discoveryPath],
    cacheEvidence: false
  });

  const builderItem = drafted.report.builder_observations.find((item) => item.candidate_id === "builder-shell-text");
  assert(builderItem);
  assert(builderItem.original_text.includes("I shipped a concrete eval workflow for coding agents."));
  assert(!builderItem.original_text.includes("123 Likes"));
  assert(!builderItem.original_text.includes("5 Replies"));
  assert(!builderItem.original_text.includes("View post image"));
});

test("report:draft rewrites Builder English fallbacks and strips community intermediary boilerplate", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-builder-rewrite-"));
  const reportDate = "2026-05-26";
  const discoveryPath = path.join(tmp, "discovery.json");
  const discovery = autodraftDiscoveryFixture(reportDate);
  discovery.candidates.push(
    {
      id: "builder-vercel-gateway",
      source_id: "builder-follow-builders-x-feed",
      category: "builder_observation",
      title: "@rauchg on gateway retries",
      url: "https://x.com/rauchg/status/2059000000000000111",
      source: "follow-builders X feed",
      event_date: reportDate,
      status: "excluded",
      author: "Guillermo Rauch",
      handle: "rauchg",
      original_text: "Vercel AI Gateway recovers on average over 1T tokens a month. Much like Stripe recovers revenue with smart retries on failed payments or credit card updates. And we do it with zero markup over the labs, adding redundancy, zero-data retention enforcement, observability, usage APIs, and caps.",
      evidence: "Original X status collected by follow-builders.",
      verification_status: "original_social_only",
      source_level: "original_social",
      original_url: "https://x.com/rauchg/status/2059000000000000111"
    },
    {
      id: "ruanyf-miscompile-lead",
      source_id: "content-ruanyf-weekly",
      category: "community_lead",
      title: "我用 AI 寻找 Bug 的经历",
      url: "https://newsletter.semianalysis.com/p/finding-miscompiles-for-fun-not-profit",
      source: "RuanYF Weekly",
      event_date: reportDate,
      status: "excluded",
      evidence: "（英文）。RuanYF Weekly latest report listed this entry; use it as a discovery lead and verify with the original source before factual inclusion. This is an intermediary/self-media lead; trace it to a primary source before treating it as a reported fact.",
      verification_status: "intermediary_only",
      source_level: "primary",
      primary_url: "https://newsletter.semianalysis.com/p/finding-miscompiles-for-fun-not-profit",
      verification_sources: ["https://newsletter.semianalysis.com/p/finding-miscompiles-for-fun-not-profit"]
    }
  );
  await fs.writeFile(discoveryPath, `${JSON.stringify(discovery, null, 2)}\n`, "utf8");

  const drafted = await generateReportDraft({
    rootDir: tmp,
    reportDate,
    generatedAt: fixedGeneratedAt,
    inputPaths: [discoveryPath],
    cacheEvidence: false
  });

  const builderItem = drafted.report.builder_observations.find((item) => item.candidate_id === "builder-vercel-gateway");
  assert(builderItem);
  assert.match(builderItem.translation, /1T token|容灾|零数据留存/u);
  assert.doesNotMatch(builderItem.translation, /Much like Stripe recovers revenue/i);

  const leadItem = drafted.report.community_leads.find((item) => item.candidate_id === "ruanyf-miscompile-lead");
  assert(leadItem);
  assert.doesNotMatch(leadItem.content, /latest report listed this entry/i);
  assert.doesNotMatch(leadItem.content, /intermediary\/self-media/i);
  assert.match(leadItem.content, /miscompile|难复现 bug/u);
});

test("report:draft keeps repository-style GitHub entries out of 热门博客", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-hot-blog-repo-"));
  const reportDate = "2026-05-26";
  const discoveryPath = path.join(tmp, "discovery.json");
  const discovery = autodraftDiscoveryFixture(reportDate);
  discovery.candidates.push(
    {
      id: "repo-shaped-hot-blog",
      source_id: "github-github-trending-weekly",
      category: "hot_blog",
      title: "example/repo-hot-blog",
      url: "https://github.com/example/repo-hot-blog",
      source: "GitHub Trending weekly",
      event_date: reportDate,
      status: "excluded",
      evidence: "GitHub Trending weekly rank #1 with recent stars this week.",
      verification_status: "primary_confirmed",
      source_level: "github",
      primary_url: "https://github.com/example/repo-hot-blog",
      verification_sources: ["https://github.com/example/repo-hot-blog"]
    },
    {
      id: "reader-hot-blog",
      source_id: "content-hugging-face-blog",
      category: "hot_blog",
      title: "Building Pakistan Notice Helper: A Small AI Tool for a Very Local Safety Problem",
      url: "https://huggingface.co/blog/build-small-hackathon/building-pakistan-notice-helper",
      source: "Hugging Face Blog",
      event_date: reportDate,
      status: "excluded",
      evidence: "Hugging Face Blog published this blog/interview entry.",
      verification_status: "primary_confirmed",
      source_level: "primary",
      primary_url: "https://huggingface.co/blog/build-small-hackathon/building-pakistan-notice-helper",
      verification_sources: ["https://huggingface.co/blog/build-small-hackathon/building-pakistan-notice-helper"]
    }
  );
  await fs.writeFile(discoveryPath, `${JSON.stringify(discovery, null, 2)}\n`, "utf8");

  const drafted = await generateReportDraft({
    rootDir: tmp,
    reportDate,
    generatedAt: fixedGeneratedAt,
    inputPaths: [discoveryPath],
    cacheEvidence: false
  });

  assert(!drafted.report.hot_blogs.some((item) => item.url === "https://github.com/example/repo-hot-blog"));
  assert(drafted.report.hot_blogs.some((item) => item.url === "https://huggingface.co/blog/build-small-hackathon/building-pakistan-notice-helper"));
});

test("report:draft prefers specific hot blog evidence over generic feed announcements", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-hot-blog-specific-"));
  const reportDate = "2026-06-08";
  const discoveryPath = path.join(tmp, "discovery.json");
  const discovery = autodraftDiscoveryFixture(reportDate);
  discovery.candidates = [
    {
      id: "hf-generic-1",
      source_id: "content-hugging-face-blog",
      category: "hot_blog",
      title: "The crash that vanished: control and emergence in a five-model economy",
      url: "https://huggingface.co/blog/build-small-hackathon/thousand-token-wood-sim-v3",
      source: "Hugging Face Blog",
      event_date: reportDate,
      status: "excluded",
      evidence: "Hugging Face Blog published this blog/interview entry.",
      verification_status: "primary_confirmed",
      source_level: "primary",
      primary_url: "https://huggingface.co/blog/build-small-hackathon/thousand-token-wood-sim-v3",
      verification_sources: ["https://huggingface.co/blog/build-small-hackathon/thousand-token-wood-sim-v3"]
    },
    {
      id: "hf-generic-2",
      source_id: "content-hugging-face-blog",
      category: "hot_blog",
      title: "The Open Source Community is backing OpenEnv for Agentic RL",
      url: "https://huggingface.co/blog/openenv-agentic-rl",
      source: "Hugging Face Blog",
      event_date: reportDate,
      status: "excluded",
      evidence: "Hugging Face Blog published this blog/interview entry.",
      verification_status: "primary_confirmed",
      source_level: "primary",
      primary_url: "https://huggingface.co/blog/openenv-agentic-rl",
      verification_sources: ["https://huggingface.co/blog/openenv-agentic-rl"]
    },
    {
      id: "ali-rocketmq",
      source_id: "content-alibaba-cloud-blog",
      category: "hot_blog",
      title: "Apache RocketMQ 5.5.0 Open Source LiteTopic: Dedicated Channel for Millions of AI Sessions",
      url: "https://www.alibabacloud.com/blog/apache-rocketmq-5-5-0-open-source-litetopic-dedicated-channel-for-millions-of-ai-sessions_603233",
      source: "Alibaba Cloud Blog",
      event_date: reportDate,
      status: "excluded",
      evidence: "This article introduces Apache RocketMQ 5.5.0's LiteTopic, a new message model designed for millions of lightweight AI agent sessions with event-driven distribution and session persistence.",
      verification_status: "primary_confirmed",
      source_level: "official",
      primary_url: "https://www.alibabacloud.com/blog/apache-rocketmq-5-5-0-open-source-litetopic-dedicated-channel-for-millions-of-ai-sessions_603233",
      verification_sources: ["https://www.alibabacloud.com/blog/apache-rocketmq-5-5-0-open-source-litetopic-dedicated-channel-for-millions-of-ai-sessions_603233"]
    },
    {
      id: "ali-tokenmaxxing",
      source_id: "content-alibaba-cloud-blog",
      category: "hot_blog",
      title: "Tokenmaxxing Dilemma: Are There Immediate Solutions for Improvement?",
      url: "https://www.alibabacloud.com/blog/tokenmaxxing-dilemma-are-there-immediate-solutions-for-improvement_603232",
      source: "Alibaba Cloud Blog",
      event_date: reportDate,
      status: "excluded",
      evidence: "This article introduces how ontology-based dependency modeling can reduce AI agent token consumption in enterprise scenarios.",
      verification_status: "primary_confirmed",
      source_level: "official",
      primary_url: "https://www.alibabacloud.com/blog/tokenmaxxing-dilemma-are-there-immediate-solutions-for-improvement_603232",
      verification_sources: ["https://www.alibabacloud.com/blog/tokenmaxxing-dilemma-are-there-immediate-solutions-for-improvement_603232"]
    },
    {
      id: "ali-agentscope",
      source_id: "content-alibaba-cloud-blog",
      category: "hot_blog",
      title: "AgentScope Java 2.0: Building a Distributed, Enterprise-Grade Foundation for AI Agents",
      url: "https://www.alibabacloud.com/blog/agentscope-java-2-0-building-a-distributed-enterprise-grade-foundation-for-ai-agents_603231",
      source: "Alibaba Cloud Blog",
      event_date: reportDate,
      status: "excluded",
      evidence: "This article introduces AgentScope Java 2.0, an open-source framework for building distributed, enterprise-grade AI agents with production-ready features.",
      verification_status: "primary_confirmed",
      source_level: "official",
      primary_url: "https://www.alibabacloud.com/blog/agentscope-java-2-0-building-a-distributed-enterprise-grade-foundation-for-ai-agents_603231",
      verification_sources: ["https://www.alibabacloud.com/blog/agentscope-java-2-0-building-a-distributed-enterprise-grade-foundation-for-ai-agents_603231"]
    }
  ];
  await fs.writeFile(discoveryPath, `${JSON.stringify(discovery, null, 2)}\n`, "utf8");

  const drafted = await generateReportDraft({
    rootDir: tmp,
    reportDate,
    generatedAt: fixedGeneratedAt,
    inputPaths: [discoveryPath],
    cacheEvidence: false
  });

  const rocketmqUrl = "https://www.alibabacloud.com/blog/apache-rocketmq-5-5-0-open-source-litetopic-dedicated-channel-for-millions-of-ai-sessions_603233";
  const tokenmaxxingUrl = "https://www.alibabacloud.com/blog/tokenmaxxing-dilemma-are-there-immediate-solutions-for-improvement_603232";
  const agentscopeUrl = "https://www.alibabacloud.com/blog/agentscope-java-2-0-building-a-distributed-enterprise-grade-foundation-for-ai-agents_603231";
  const genericOneUrl = "https://huggingface.co/blog/build-small-hackathon/thousand-token-wood-sim-v3";
  const genericTwoUrl = "https://huggingface.co/blog/openenv-agentic-rl";
  const mainUrls = new Set(drafted.report.main_items.map((item) => item.url));
  const hotUrls = new Set(drafted.report.hot_blogs.map((item) => item.url));
  const selectedUrls = new Set([...mainUrls, ...hotUrls]);

  assert(selectedUrls.has(rocketmqUrl), "specific RocketMQ write-up should survive public selection");
  assert(selectedUrls.has(agentscopeUrl), "specific AgentScope write-up should survive public selection");
  assert(selectedUrls.has(tokenmaxxingUrl), "method essay should remain available in public selection");
  assert(!selectedUrls.has(genericOneUrl), "generic feed announcement should be filtered out");
  assert(!selectedUrls.has(genericTwoUrl), "generic feed announcement should be filtered out");
});

test("report:draft filters unreadable blog titles and low-signal community leads", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-selection-filter-"));
  const reportDate = "2026-05-26";
  const discoveryPath = path.join(tmp, "discovery.json");
  const discovery = autodraftDiscoveryFixture(reportDate);
  discovery.candidates.push(
    {
      id: "thai-openclaw-blog",
      source_id: "content-alibaba-cloud-blog",
      category: "hot_blog",
      title: "ปรับใช้ OpenClaw บน Alibaba Cloud ECS ด้วย Telegram Integration",
      url: "https://www.alibabacloud.com/blog/example-openclaw-thai",
      source: "Alibaba Cloud Blog",
      event_date: reportDate,
      status: "excluded",
      evidence: "Official Alibaba Cloud post about deploying OpenClaw with Telegram integration.",
      verification_status: "primary_confirmed",
      source_level: "official",
      primary_url: "https://www.alibabacloud.com/blog/example-openclaw-thai",
      verification_sources: ["https://www.alibabacloud.com/blog/example-openclaw-thai"]
    },
    {
      id: "ruanyf-ai-bug-story",
      source_id: "content-ruanyf-weekly",
      category: "community_lead",
      title: "我用 AI 寻找 Bug 的经历",
      url: "https://newsletter.semianalysis.com/p/finding-miscompiles-for-fun-not-profit",
      source: "RuanYF Weekly",
      event_date: reportDate,
      status: "excluded",
      evidence: "作者复盘了用 AI 找 miscompile 和 bug 的过程，重点是提示词、验证链路和失败模式。",
      verification_status: "primary_confirmed",
      source_level: "primary",
      primary_url: "https://newsletter.semianalysis.com/p/finding-miscompiles-for-fun-not-profit",
      verification_sources: ["https://newsletter.semianalysis.com/p/finding-miscompiles-for-fun-not-profit"],
      image_url: "https://example.com/ai-bug-story.png",
      image_alt: "AI 找 Bug 文章截图"
    },
    {
      id: "resolved-status-incident",
      source_id: "status-openai",
      category: "community_lead",
      title: "OpenAI Status: temporary incident resolved",
      url: "https://status.openai.com/incidents/example",
      source: "OpenAI Status",
      event_date: reportDate,
      status: "excluded",
      evidence: "Status: Resolved. All impacted services have recovered.",
      verification_status: "primary_confirmed",
      source_level: "official"
    },
    {
      id: "future-openalex-package",
      source_id: "search-openalex",
      category: "community_lead",
      title: "Data and Code to reproduce results in paper",
      url: "https://doi.org/10.5281/zenodo.18864874",
      source: "OpenAlex",
      event_date: "2027-01-01",
      status: "excluded",
      evidence: "Zenodo replication package.",
      verification_status: "intermediary_only",
      source_level: "primary"
    },
    {
      id: "wwdc-watch-guide",
      source_id: "content-the-verge-ai",
      category: "community_lead",
      title: "WWDC 2026: How to watch and what to expect",
      url: "https://www.theverge.com/tech/example-wwdc-watch-guide",
      source: "The Verge AI",
      event_date: reportDate,
      status: "excluded",
      evidence: "Apple's WWDC 2026 guide covers how to watch the keynote and what to expect from the event.",
      verification_status: "intermediary_only",
      source_level: "intermediary"
    },
    {
      id: "crunchbase-person-page",
      source_id: "content-crunchbase-news-ai",
      category: "community_lead",
      title: "Elon Musk",
      url: "https://www.crunchbase.com/person/elon-musk",
      source: "Crunchbase News AI",
      event_date: reportDate,
      status: "excluded",
      evidence: "Crunchbase person profile link with a generic AI background image.",
      verification_status: "intermediary_only",
      source_level: "intermediary"
    }
  );
  await fs.writeFile(discoveryPath, `${JSON.stringify(discovery, null, 2)}\n`, "utf8");

  const drafted = await generateReportDraft({
    rootDir: tmp,
    reportDate,
    generatedAt: fixedGeneratedAt,
    inputPaths: [discoveryPath],
    cacheEvidence: false
  });

  assert(!drafted.report.hot_blogs.some((item) => item.title.includes("OpenClaw")));
  assert(
    drafted.report.hot_blogs.some((item) => item.candidate_id === "ruanyf-ai-bug-story") ||
    drafted.report.community_leads.some((item) => item.candidate_id === "ruanyf-ai-bug-story")
  );
  assert(!drafted.report.community_leads.some((item) => item.source === "OpenAI Status"));
  assert(!drafted.report.community_leads.some((item) => item.source === "OpenAlex"));
  assert(!drafted.report.community_leads.some((item) => item.url === "https://www.theverge.com/tech/example-wwdc-watch-guide"));
  assert(!drafted.report.community_leads.some((item) => item.url === "https://www.crunchbase.com/person/elon-musk"));
});

test("report:draft dedupes duplicate community topics and keeps reader-facing summaries", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-community-dedupe-"));
  const reportDate = "2026-06-08";
  const discoveryPath = path.join(tmp, "discovery.json");
  const discovery = autodraftDiscoveryFixture(reportDate);
  discovery.candidates = [
    {
      id: "openai-super-app-techcrunch",
      source_id: "content-techcrunch-ai",
      category: "community_lead",
      title: "OpenAI is still working on that ‘super app’",
      url: "https://techcrunch.com/2026/06/07/openai-is-still-working-on-that-super-app/",
      source: "TechCrunch AI",
      event_date: reportDate,
      status: "excluded",
      evidence: "\"Chat is dead\" — at least, according to a senior OpenAI employee.",
      verification_status: "intermediary_only",
      source_level: "intermediary"
    },
    {
      id: "openai-super-app-mittr",
      source_id: "content-mit-technology-review",
      category: "community_lead",
      title: "The Download: how the World Cup ball will fly and OpenAI’s “super app”",
      url: "https://www.technologyreview.com/2026/06/08/1138485/the-download-world-cup-ball-openai-super-app/",
      source: "MIT Technology Review",
      event_date: reportDate,
      status: "excluded",
      evidence: "This is today’s edition of The Download, our weekday newsletter that provides a daily dose of what’s going on in the world of technology.",
      verification_status: "intermediary_only",
      source_level: "official"
    },
    {
      id: "ars-climate-ai",
      source_id: "content-ars-technica",
      category: "community_lead",
      title: "The weather and climate science AI revolution isn’t revolutionary",
      url: "https://arstechnica.com/science/2026/06/the-weather-and-climate-science-ai-revolution-isnt-revolutionary/",
      source: "Ars Technica",
      event_date: reportDate,
      status: "excluded",
      evidence: "Machine learning has its limits—how is it being used?",
      verification_status: "intermediary_only",
      source_level: "intermediary"
    }
  ];
  await fs.writeFile(discoveryPath, `${JSON.stringify(discovery, null, 2)}\n`, "utf8");

  const drafted = await generateReportDraft({
    rootDir: tmp,
    reportDate,
    generatedAt: fixedGeneratedAt,
    inputPaths: [discoveryPath],
    cacheEvidence: false
  });

  assert.equal(drafted.report.community_leads.length, 2);
  assert.equal(drafted.report.community_leads.filter((item) => /super app/.test(item.content)).length, 1);
  const climateLead = drafted.report.community_leads.find((item) => /气象|气候/u.test(item.content));
  assert(climateLead);
  assert.doesNotMatch(climateLead.content, /公开信息主要落在/u);
});

test("report:draft limits paper and GitHub overflow in community leads while keeping reader-facing news leads", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-community-mix-"));
  const reportDate = "2026-06-08";
  const discoveryPath = path.join(tmp, "discovery.json");
  const discovery = autodraftDiscoveryFixture(reportDate);
  discovery.candidates = [
    {
      id: "super-app-visual",
      source_id: "content-techcrunch-ai",
      category: "community_lead",
      title: "OpenAI is still working on that ‘super app’",
      url: "https://techcrunch.com/2026/06/07/openai-is-still-working-on-that-super-app/",
      source: "TechCrunch AI",
      event_date: reportDate,
      status: "excluded",
      evidence: "\"Chat is dead\" — at least, according to a senior OpenAI employee.",
      verification_status: "intermediary_only",
      source_level: "intermediary",
      image_url: "https://example.com/super-app.png",
      image_alt: "OpenAI super app illustration"
    },
    {
      id: "climate-visual",
      source_id: "content-ars-technica",
      category: "community_lead",
      title: "The weather and climate science AI revolution isn’t revolutionary",
      url: "https://arstechnica.com/science/2026/06/the-weather-and-climate-science-ai-revolution-isnt-revolutionary/",
      source: "Ars Technica",
      event_date: reportDate,
      status: "excluded",
      evidence: "Machine learning has its limits—how is it being used?",
      verification_status: "intermediary_only",
      source_level: "intermediary",
      image_url: "https://example.com/climate-ai.png",
      image_alt: "Climate AI illustration"
    },
    {
      id: "skillopt-paper",
      source_id: "content-ml-papers",
      category: "community_lead",
      title: "SkillOpt",
      url: "https://example.com/papers/skillopt",
      source: "ML Papers of the Week",
      event_date: reportDate,
      status: "excluded",
      evidence: "Skill optimization for agent workflows.",
      verification_status: "intermediary_only",
      source_level: "paper"
    },
    {
      id: "autoscientists-paper",
      source_id: "content-ml-papers",
      category: "community_lead",
      title: "AutoScientists",
      url: "https://example.com/papers/autoscientists",
      source: "ML Papers of the Week",
      event_date: reportDate,
      status: "excluded",
      evidence: "Multi-agent science workflows without a central planner.",
      verification_status: "intermediary_only",
      source_level: "paper"
    },
    {
      id: "codex-provider-sync",
      source_id: "content-hellogithub",
      category: "community_lead",
      title: "codex-provider-sync",
      url: "https://hellogithub.com/repository/codex-provider-sync",
      source: "HelloGitHub",
      event_date: reportDate,
      status: "excluded",
      evidence: "A tool that keeps Codex sessions when switching providers.",
      verification_status: "primary_confirmed",
      source_level: "github"
    },
    {
      id: "agent-memory-sync",
      source_id: "content-hellogithub",
      category: "community_lead",
      title: "agent-memory-sync",
      url: "https://hellogithub.com/repository/agent-memory-sync",
      source: "HelloGitHub",
      event_date: reportDate,
      status: "excluded",
      evidence: "An AI agent memory sync utility for multi-provider workflows.",
      verification_status: "primary_confirmed",
      source_level: "github"
    }
  ];
  await fs.writeFile(discoveryPath, `${JSON.stringify(discovery, null, 2)}\n`, "utf8");

  const drafted = await generateReportDraft({
    rootDir: tmp,
    reportDate,
    generatedAt: fixedGeneratedAt,
    inputPaths: [discoveryPath],
    cacheEvidence: false
  });

  assert(drafted.report.community_leads.some((item) => item.candidate_id === "super-app-visual"));
  assert(drafted.report.community_leads.some((item) => item.candidate_id === "climate-visual"));
  assert(drafted.report.community_leads.filter((item) => item.source_level === "paper").length <= 3);
  assert(drafted.report.community_leads.filter((item) => item.source_level === "github").length <= 3);
});

test("report:draft expands public signal coverage beyond strict factual sections", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-expanded-signals-"));
  const reportDate = "2026-06-08";
  const discoveryPath = path.join(tmp, "discovery.json");
  const discovery = autodraftDiscoveryFixture(reportDate);

  const extraHotBlogs = Array.from({ length: 12 }, (_, index) => ({
    id: `third-party-hot-blog-${index + 1}`,
    source_id: `content-latent-space-extra-${index + 1}`,
    category: "hot_blog",
    title: `AI agent platform field report ${index + 1}`,
    url: `https://www.latent.space/p/agent-platform-field-report-${index + 1}`,
    source: "Latent.Space",
    author: "Latent.Space",
    event_date: reportDate,
    status: "excluded",
    evidence: `A detailed AI agent platform field report ${index + 1} covering enterprise workflow design, model orchestration, deployment constraints, evaluation loops, and developer adoption signals.`,
    verification_status: "intermediary_only",
    source_level: "intermediary"
  }));
  const extraBuilders = Array.from({ length: 14 }, (_, index) => ({
    id: `builder-expanded-${index + 1}`,
    source_id: "builder-follow-builders-x-feed",
    category: "builder_observation",
    title: `Builder note ${index + 1}: AI agents need production evals`,
    url: `https://x.com/builder/status/179499360000000${index + 1}`,
    source: "follow-builders X feed",
    author: `Builder ${index + 1}`,
    handle: `builder${index + 1}`,
    event_date: reportDate,
    status: "excluded",
    original_text: `AI agents need production eval loops, tool traces, and rollback plans before unattended workflow use ${index + 1}.`,
    evidence: "Original X status collected by follow-builders.",
    verification_status: "original_social_only",
    source_level: "original_social"
  }));
  const extraCommunityLeads = Array.from({ length: 30 }, (_, index) => ({
    id: `community-expanded-${index + 1}`,
    source_id: `content-techcrunch-ai-expanded-${index + 1}`,
    category: "community_lead",
    title: `AI agent market signal ${index + 1}`,
    url: `https://techcrunch.com/2026/06/08/ai-agent-market-signal-${index + 1}/`,
    source: "TechCrunch AI",
    event_date: reportDate,
    status: "excluded",
    evidence: `Third-party reporting describes AI agent market signal ${index + 1}, including product rollout, enterprise workflow adoption, pricing implications, and developer platform context.`,
    verification_status: "intermediary_only",
    source_level: "intermediary"
  }));

  discovery.candidates = [
    ...discovery.candidates,
    ...extraHotBlogs,
    ...extraBuilders,
    ...extraCommunityLeads
  ];
  await fs.writeFile(discoveryPath, `${JSON.stringify(discovery, null, 2)}\n`, "utf8");

  const drafted = await generateReportDraft({
    rootDir: tmp,
    reportDate,
    generatedAt: fixedGeneratedAt,
    inputPaths: [discoveryPath],
    cacheEvidence: false
  });

  assert.equal(drafted.report.projects.length, 10);
  assert.equal(drafted.report.hot_blogs.length, 8);
  assert.equal(drafted.report.builder_observations.length, 12);
  assert.equal(drafted.report.community_leads.length, 24);
  assert(drafted.report.hot_blogs.some((item) => item.source_level === "intermediary"));
  assert(drafted.report.community_leads.some((item) => item.verification_status === "intermediary_only"));
});

test("report:draft keeps minor consumer AI feature rollouts out of main_items", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-main-quality-"));
  const reportDate = "2026-06-08";
  const discoveryPath = path.join(tmp, "discovery.json");
  const discovery = autodraftDiscoveryFixture(reportDate);
  discovery.candidates = [
    {
      id: "whatsapp-spyware",
      source_id: "content-meta-newsroom",
      category: "community_lead",
      title: "Fighting Spyware: An Update From WhatsApp",
      url: "https://about.fb.com/news/2026/06/fighting-spyware-an-update-from-whatsapp/",
      source: "Meta Newsroom",
      event_date: reportDate,
      status: "excluded",
      evidence: "WhatsApp caught and disrupted spear phishing attempts linked to NSO, a spyware firm blacklisted by the US government.",
      verification_status: "primary_confirmed",
      source_level: "primary",
      primary_url: "https://about.fb.com/news/2026/06/fighting-spyware-an-update-from-whatsapp/",
      verification_sources: ["https://about.fb.com/news/2026/06/fighting-spyware-an-update-from-whatsapp/"]
    },
    {
      id: "uk-sovereign-ai",
      source_id: "content-nvidia-newsroom-rss",
      category: "community_lead",
      title: "How the UK Is Turning Sovereign AI Ambition Into Action With NVIDIA Technologies",
      url: "https://blogs.nvidia.com/blog/uk-sovereign-ai-advancements/",
      source: "NVIDIA Newsroom RSS",
      event_date: reportDate,
      status: "excluded",
      evidence: "At this year’s London Tech Week, NVIDIA and its partners are showing how UK sovereign AI plans are moving from rhetoric into infrastructure and execution.",
      verification_status: "primary_confirmed",
      source_level: "official",
      primary_url: "https://blogs.nvidia.com/blog/uk-sovereign-ai-advancements/",
      verification_sources: ["https://blogs.nvidia.com/blog/uk-sovereign-ai-advancements/"]
    },
    {
      id: "amazon-minor-feature",
      source_id: "content-amazon-news",
      category: "community_lead",
      title: "Customers can now design merch with Alexa for Shopping on Amazon",
      url: "https://www.aboutamazon.com/news/retail/design-merch-with-ai-alexa-for-shopping?utm_source=rss",
      source: "Amazon News",
      event_date: reportDate,
      status: "excluded",
      evidence: "From personalized pet portraits on tumblers to matching group shirts, the new feature uses AI to turn ideas into designs you’ll want to share and wear.",
      verification_status: "primary_confirmed",
      source_level: "primary",
      primary_url: "https://www.aboutamazon.com/news/retail/design-merch-with-ai-alexa-for-shopping?utm_source=rss",
      verification_sources: ["https://www.aboutamazon.com/news/retail/design-merch-with-ai-alexa-for-shopping?utm_source=rss"],
      editorial_category: "engineering_toolchain"
    }
  ];
  await fs.writeFile(discoveryPath, `${JSON.stringify(discovery, null, 2)}\n`, "utf8");

  const drafted = await generateReportDraft({
    rootDir: tmp,
    reportDate,
    generatedAt: fixedGeneratedAt,
    inputPaths: [discoveryPath],
    cacheEvidence: false
  });

  const titles = drafted.report.main_items.map((item) => item.title);
  assert.equal(titles.length, 1);
  assert(titles.includes("WhatsApp 披露其拦截了一轮与 NSO 相关的定向钓鱼攻击"));
  assert(!titles.some((title) => /NVIDIA|主权 AI|sovereign/i.test(title)));
  assert(!titles.some((title) => /Alexa|merch|Shopping/i.test(title)));
});

test("report:draft limits low-signal vendor partnership items in main coverage", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-main-diversity-"));
  const reportDate = "2026-05-26";
  const discoveryPath = path.join(tmp, "discovery.json");
  const discovery = autodraftDiscoveryFixture(reportDate);
  discovery.candidates = discovery.candidates.filter((candidate) => !candidate.id.startsWith("official-"));
  discovery.candidates.push(
    ...Array.from({ length: 4 }, (_, index) => ({
      id: `nvidia-partnership-${index + 1}`,
      source_id: "content-nvidia-newsroom-rss",
      category: "community_lead",
      title: [
        "NVIDIA and SK Telecom Build AI Infrastructure to Power Korea",
        "NVIDIA and SK hynix Announce Multiyear Partnership for AI Factories",
        "NVIDIA and LG Group Build an AI Factory",
        "NVIDIA and Doosan Group Collaborate on AI Factory Infrastructure"
      ][index],
      url: `https://nvidianews.nvidia.com/news/example-partnership-${index + 1}`,
      source: "NVIDIA Newsroom RSS",
      event_date: reportDate,
      status: "excluded",
      evidence: "Official NVIDIA release about an AI factory or infrastructure partnership.",
      verification_status: "primary_confirmed",
      source_level: "official"
    })),
    ...Array.from({ length: 4 }, (_, index) => ({
      id: `reader-main-${index + 1}`,
      source_id: `content-official-main-${index + 1}`,
      category: "community_lead",
      title: [
        "OpenAI opens a new enterprise coding workflow API",
        "Anthropic launches a new eval dashboard for Claude teams",
        "Google DeepMind updates Gemini enterprise rollout and pricing",
        "ByteDance Seed publishes an agent toolchain update for developers"
      ][index],
      url: `https://example.com/reader-main-${index + 1}`,
      source: [
        "OpenAI News RSS",
        "Anthropic News",
        "Google DeepMind RSS",
        "ByteDance Seed Tech Blog"
      ][index],
      event_date: reportDate,
      status: "excluded",
      evidence: "Official source explains product scope, availability, and developer-facing workflow impact.",
      verification_status: "primary_confirmed",
      source_level: "official_company_news"
    }))
  );
  await fs.writeFile(discoveryPath, `${JSON.stringify(discovery, null, 2)}\n`, "utf8");

  const drafted = await generateReportDraft({
    rootDir: tmp,
    reportDate,
    generatedAt: fixedGeneratedAt,
    inputPaths: [discoveryPath],
    cacheEvidence: false
  });

  const partnershipItems = drafted.report.main_items.filter((item) => /NVIDIA/i.test(item.source) && /partnership|AI Factory|Infrastructure/i.test(item.title));
  assert(partnershipItems.length <= 1);
  assert(drafted.report.main_items.some((item) => item.source === "OpenAI News RSS"));
  assert(drafted.report.main_items.some((item) => item.source === "Anthropic News"));
});

test("report:draft promotes public-important company actions from primary sources", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-reader-selection-"));
  const reportDate = "2026-05-26";
  const discoveryPath = path.join(tmp, "discovery.json");
  const discovery = autodraftDiscoveryFixture(reportDate);
  const companyCandidates = [
    {
      id: "tencent-product-conference",
      source_id: "content-tencent-media-center",
      category: "community_lead",
      title: "Tencent schedules product conference and cloud business updates",
      url: "https://www.tencent.com/en-us/articles/product-conference.html",
      source: "Tencent Media Center",
      event_date: reportDate,
      status: "excluded",
      evidence: "Official Tencent Media Center says the company will hold a product conference and update cloud, games, and enterprise service plans.",
      verification_status: "primary_confirmed",
      source_level: "official_company_news",
      primary_url: "https://www.tencent.com/en-us/articles/product-conference.html",
      verification_sources: ["https://www.tencent.com/en-us/articles/product-conference.html"]
    },
    {
      id: "alibaba-quarterly-results",
      source_id: "content-alibaba-group-press-releases",
      category: "community_lead",
      title: "Alibaba Group posts quarterly results and business priorities",
      url: "https://www.alibabagroup.com/en-US/document-quarterly-results",
      source: "Alibaba Group Press Releases",
      event_date: reportDate,
      status: "excluded",
      evidence: "Official Alibaba Group release covers quarterly results, management commentary, and priority businesses for the next period.",
      verification_status: "primary_confirmed",
      source_level: "official_company_news",
      primary_url: "https://www.alibabagroup.com/en-US/document-quarterly-results",
      verification_sources: ["https://www.alibabagroup.com/en-US/document-quarterly-results"]
    },
    {
      id: "meituan-organization-update",
      source_id: "content-meituan-investor-relations",
      category: "community_lead",
      title: "Meituan updates organization and quarterly operating outlook",
      url: "https://www.meituan.com/en-US/investor-relations/organization-update",
      source: "Meituan Investor Relations",
      event_date: reportDate,
      status: "excluded",
      evidence: "Official investor relations material explains organization changes, operating outlook, and service priorities.",
      verification_status: "primary_confirmed",
      source_level: "official_company_news",
      primary_url: "https://www.meituan.com/en-US/investor-relations/organization-update",
      verification_sources: ["https://www.meituan.com/en-US/investor-relations/organization-update"]
    }
  ];
  const paperCandidates = Array.from({ length: 4 }, (_, index) => ({
    id: `hardcore-paper-${index + 1}`,
    source_id: "content-arxiv-cs-ai",
    category: "community_lead",
    title: `New transformer inference benchmark paper ${index + 1}`,
    url: `https://arxiv.org/abs/2605.${index + 1}`,
    source: "arXiv cs.AI",
    event_date: reportDate,
    status: "excluded",
    evidence: "A technical paper about transformer inference benchmarks, eval design, and reasoning traces.",
    verification_status: "primary_confirmed",
    source_level: "paper",
    primary_url: `https://arxiv.org/abs/2605.${index + 1}`,
    verification_sources: [`https://arxiv.org/abs/2605.${index + 1}`]
  }));
  discovery.candidates.push(
    ...companyCandidates,
    ...paperCandidates,
    {
      id: "google-news-company-rumor",
      source_id: "general-news-google-china-big-tech-company-watch",
      category: "community_lead",
      title: "Google News reports a Tencent reorganization rumor",
      url: "https://news.google.com/rss/articles/example",
      source: "Google News China Big Tech Company Watch RSS",
      event_date: reportDate,
      status: "excluded",
      evidence: "Aggregator lead about a possible company reorganization without primary confirmation.",
      verification_status: "intermediary_only",
      source_level: "intermediary",
      intermediary_url: "https://news.google.com/rss/articles/example"
    }
  );
  await fs.writeFile(discoveryPath, `${JSON.stringify(discovery, null, 2)}\n`, "utf8");

  const drafted = await generateReportDraft({
    rootDir: tmp,
    reportDate,
    generatedAt: fixedGeneratedAt,
    inputPaths: [discoveryPath],
    cacheEvidence: false
  });

  const mainIds = new Set(drafted.report.main_items.map((item) => item.candidate_id));
  const mainUrls = new Set(drafted.report.main_items.map((item) => item.url));
  const selectedCompanyCandidates = companyCandidates.filter((candidate) => mainUrls.has(candidate.url));
  assert(mainUrls.has(companyCandidates[0].url), "Tencent public company action should enter main_items");
  assert(mainUrls.has(companyCandidates[1].url), "Alibaba public company action should enter main_items");
  assert(selectedCompanyCandidates.length >= 2, "public-important company actions should not be crowded out");
  assert(!mainIds.has("google-news-company-rumor"));
  assert(!mainUrls.has("https://news.google.com/rss/articles/example"));
  assert(drafted.report.main_items.some((item) => item.editorial_category === "company_business"));
  assert(
    drafted.report.main_items
      .filter((item) => item.source_level === "paper")
      .length < paperCandidates.length,
    "hardcore papers should not crowd out all reader-relevant company actions"
  );
});

test("report:draft favors plain-reader utility over hardcore research details", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-grounded-selection-"));
  const reportDate = "2026-05-26";
  const discoveryPath = path.join(tmp, "discovery.json");
  const discovery = autodraftDiscoveryFixture(reportDate);
  const plainReaderCandidates = [
    {
      id: "github-platform-pricing",
      source_id: "content-github-blog-feed",
      category: "community_lead",
      title: "GitHub changes Copilot pricing and enterprise availability",
      url: "https://github.blog/example-copilot-pricing",
      source: "GitHub Blog Feed",
      event_date: reportDate,
      status: "excluded",
      evidence: "Official GitHub Blog explains Copilot pricing, enterprise availability, and rollout timing for business users.",
      verification_status: "primary_confirmed",
      source_level: "official_company_news",
      primary_url: "https://github.blog/example-copilot-pricing",
      verification_sources: ["https://github.blog/example-copilot-pricing"]
    },
    {
      id: "bytedance-seed-model-card",
      source_id: "content-huggingface-bytedance-seed",
      category: "community_lead",
      title: "ByteDance Seed publishes model weights and a usage guide on Hugging Face",
      url: "https://huggingface.co/ByteDance-Seed/example-model",
      source: "ByteDance Seed Hugging Face Organization",
      event_date: reportDate,
      status: "excluded",
      evidence: "Official Hugging Face organization page lists model weights, usage limits, and examples for developers.",
      verification_status: "primary_confirmed",
      source_level: "official_model_host_account",
      primary_url: "https://huggingface.co/ByteDance-Seed/example-model",
      verification_sources: ["https://huggingface.co/ByteDance-Seed/example-model"]
    },
    {
      id: "nvidia-ai-platform-launch",
      source_id: "content-nvidia-newsroom-rss",
      category: "community_lead",
      title: "NVIDIA launches an enterprise AI platform with Microsoft partner support",
      url: "https://nvidianews.nvidia.com/news/example-enterprise-ai-platform",
      source: "NVIDIA Newsroom RSS",
      event_date: reportDate,
      status: "excluded",
      evidence: "Official NVIDIA Newsroom says the company launched an enterprise AI platform, named partners, and described availability.",
      verification_status: "primary_confirmed",
      source_level: "official_company_news",
      primary_url: "https://nvidianews.nvidia.com/news/example-enterprise-ai-platform",
      verification_sources: ["https://nvidianews.nvidia.com/news/example-enterprise-ai-platform"]
    }
  ];
  const hardcoreResearchCandidates = Array.from({ length: 12 }, (_, index) => ({
    id: `hardcore-transformer-paper-${index + 1}`,
    source_id: "content-arxiv-cs-ai",
    category: "community_lead",
    title: `Transformer inference benchmark and reasoning trace paper ${index + 1}`,
    url: `https://arxiv.org/abs/2605.90${index}`,
    source: "arXiv cs.AI",
    event_date: reportDate,
    status: "excluded",
    evidence: "A technical paper about transformer inference benchmarks, ablation settings, reasoning traces, and eval methodology.",
    verification_status: "primary_confirmed",
    source_level: "paper",
    primary_url: `https://arxiv.org/abs/2605.90${index}`,
    verification_sources: [`https://arxiv.org/abs/2605.90${index}`]
  }));
  discovery.candidates.push(...plainReaderCandidates, ...hardcoreResearchCandidates);
  await fs.writeFile(discoveryPath, `${JSON.stringify(discovery, null, 2)}\n`, "utf8");

  const drafted = await generateReportDraft({
    rootDir: tmp,
    reportDate,
    generatedAt: fixedGeneratedAt,
    inputPaths: [discoveryPath],
    cacheEvidence: false
  });

  const mainUrls = new Set(drafted.report.main_items.map((item) => item.url));
  for (const candidate of plainReaderCandidates) {
    assert(mainUrls.has(candidate.url), `plain-reader utility candidate should enter main_items: ${candidate.id}`);
  }
  assert.equal(
    drafted.report.main_items.filter((item) => item.source_level === "paper").length,
    0,
    "pure benchmark papers should stay out of main_items when enough reader-utility candidates exist"
  );
  assert(drafted.report.github_trending.length > 0);
  for (const item of drafted.report.github_trending) {
    assert.match(item.description, /(?:进入|进了) GitHub Trending Top 10/);
    assert.doesNotMatch(item.description, /Agent workflow toolkit for local AI engineering/);
  }
});

test("report:draft promotes official product and platform deep dives into main_items", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-official-mainline-"));
  const reportDate = "2026-06-08";
  const discoveryPath = path.join(tmp, "discovery.json");
  const discovery = autodraftDiscoveryFixture(reportDate);
  const notebooklmUrl = "https://blog.google/innovation-and-ai/products/notebooklm/better-research-notebooklm/";
  const appleSiriUrl = "https://www.apple.com/newsroom/2026/06/apple-intelligence-and-siri-at-wwdc/";
  const applePersonalSiriUrl = "https://www.apple.com/newsroom/2026/06/apple-introduces-siri-ai-a-profoundly-more-capable-and-personal-assistant/";
  const openAiExchangeUrl = "https://openai.com/index/economic-research-exchange/";
  const awsCrossRegionUrl = "https://aws.amazon.com/blogs/machine-learning/unlocking-ai-flexibility-in-europe-a-guide-to-cross-region-inference-for-eu-data-processing-and-model-access/";
  const agentcoreUrl = "https://aws.amazon.com/blogs/machine-learning/its-safe-to-close-your-laptop-now-hosting-coding-agents-on-amazon-bedrock-agentcore/";
  const rocketmqUrl = "https://www.alibabacloud.com/blog/apache-rocketmq-5-5-0-open-source-litetopic-dedicated-channel-for-millions-of-ai-sessions_603233";
  const nemotronUrl = "https://developer.nvidia.com/blog/nvidia-nemotron-3-ultra-powers-faster-more-efficient-reasoning-for-long-running-agents/";
  const blackwellUrl = "https://developer.nvidia.com/blog/blackwell-nvfp4-and-jax-ai-inference/";

  discovery.candidates = [
    {
      id: "apple-siri-wwdc-ai",
      source_id: "content-apple-newsroom",
      category: "community_lead",
      title: "Apple updates Siri and Apple Intelligence at WWDC",
      url: appleSiriUrl,
      source: "Apple Newsroom",
      event_date: reportDate,
      status: "excluded",
      evidence: "Apple Newsroom describes Siri, Apple Intelligence, developer APIs, and platform rollout details from WWDC.",
      verification_status: "primary_confirmed",
      source_level: "official_company_news",
      primary_url: appleSiriUrl,
      verification_sources: [appleSiriUrl]
    },
    {
      id: "apple-personal-siri-ai",
      source_id: "content-apple-newsroom",
      category: "community_lead",
      title: "Apple introduces Siri AI, a profoundly more capable and personal assistant",
      url: applePersonalSiriUrl,
      source: "Apple Newsroom",
      event_date: reportDate,
      status: "excluded",
      evidence: "Apple Newsroom separately describes Siri AI as a more capable and personal assistant with system context and privacy boundaries.",
      verification_status: "primary_confirmed",
      source_level: "official_company_news",
      primary_url: applePersonalSiriUrl,
      verification_sources: [applePersonalSiriUrl]
    },
    {
      id: "openai-economic-research-exchange",
      source_id: "content-openai-news",
      category: "community_lead",
      title: "OpenAI launches Economic Research Exchange for AI labor market research",
      url: openAiExchangeUrl,
      source: "OpenAI News RSS",
      event_date: reportDate,
      status: "excluded",
      evidence: "OpenAI announced an Economic Research Exchange focused on AI, labor markets, measurement, and public research collaboration.",
      verification_status: "primary_confirmed",
      source_level: "official_company_news",
      primary_url: openAiExchangeUrl,
      verification_sources: [openAiExchangeUrl]
    },
    {
      id: "notebooklm-product-upgrade",
      source_id: "content-google-keyword-blog",
      category: "community_lead",
      title: "Do better research with NotebookLM",
      url: notebooklmUrl,
      source: "Google Keyword Blog",
      event_date: reportDate,
      status: "excluded",
      evidence: "Official Google post explains NotebookLM adds a cloud computer, better source finding, and workflow changes for research users.",
      verification_status: "primary_confirmed",
      source_level: "official",
      primary_url: notebooklmUrl,
      verification_sources: [notebooklmUrl]
    },
    {
      id: "aws-cross-region-inference-eu",
      source_id: "content-aws-machine-learning-blog",
      category: "hot_blog",
      title: "Unlocking AI flexibility in Europe: A guide to cross-region inference for EU data processing and model access",
      url: awsCrossRegionUrl,
      source: "AWS Machine Learning Blog",
      event_date: reportDate,
      status: "excluded",
      evidence: "Official AWS post explains cross-region inference for EU data processing, model access, and operational setup.",
      verification_status: "primary_confirmed",
      source_level: "official",
      primary_url: awsCrossRegionUrl,
      verification_sources: [awsCrossRegionUrl]
    },
    {
      id: "agentcore-hosted-coding-agents",
      source_id: "content-aws-machine-learning-blog",
      category: "hot_blog",
      title: "It’s safe to close your laptop now: Hosting coding agents on Amazon Bedrock AgentCore",
      url: agentcoreUrl,
      source: "AWS Machine Learning Blog",
      event_date: reportDate,
      status: "excluded",
      evidence: "Official AWS post details how Bedrock AgentCore hosts long-running coding agents in the cloud, with workflow, permissions, and reliability implications for developers.",
      verification_status: "primary_confirmed",
      source_level: "official",
      primary_url: agentcoreUrl,
      verification_sources: [agentcoreUrl]
    },
    {
      id: "rocketmq-litetopic-mainline",
      source_id: "content-alibaba-cloud-blog",
      category: "hot_blog",
      title: "Apache RocketMQ 5.5.0 Open Source LiteTopic: Dedicated Channel for Millions of AI Sessions",
      url: rocketmqUrl,
      source: "Alibaba Cloud Blog",
      event_date: reportDate,
      status: "excluded",
      evidence: "Official Alibaba Cloud post explains LiteTopic, session isolation, and event distribution for million-scale AI agent sessions in production.",
      verification_status: "primary_confirmed",
      source_level: "official",
      primary_url: rocketmqUrl,
      verification_sources: [rocketmqUrl]
    },
    {
      id: "nemotron-deep-dive-stays-blog",
      source_id: "content-nvidia-developer-blog",
      category: "hot_blog",
      title: "NVIDIA Nemotron 3 Ultra Powers Faster, More Efficient Reasoning for Long-Running Agents",
      url: nemotronUrl,
      source: "NVIDIA Developer Blog",
      event_date: reportDate,
      status: "excluded",
      evidence: "Official NVIDIA post focuses on long-running agent reasoning quality and efficiency details rather than a new public product or availability change.",
      verification_status: "primary_confirmed",
      source_level: "official",
      primary_url: nemotronUrl,
      verification_sources: [nemotronUrl]
    },
    {
      id: "nvidia-blackwell-jax-nvfp4",
      source_id: "content-nvidia-developer-blog",
      category: "hot_blog",
      title: "NVIDIA Blackwell NVFP4 and JAX improve AI inference efficiency",
      url: blackwellUrl,
      source: "NVIDIA Developer Blog",
      event_date: reportDate,
      status: "excluded",
      evidence: "NVIDIA describes Blackwell NVFP4, JAX support, and AI inference efficiency changes for model serving.",
      verification_status: "primary_confirmed",
      source_level: "official",
      primary_url: blackwellUrl,
      verification_sources: [blackwellUrl]
    }
  ];
  await fs.writeFile(discoveryPath, `${JSON.stringify(discovery, null, 2)}\n`, "utf8");

  const drafted = await generateReportDraft({
    rootDir: tmp,
    reportDate,
    generatedAt: fixedGeneratedAt,
    inputPaths: [discoveryPath],
    cacheEvidence: false
  });

  const mainUrls = new Set(drafted.report.main_items.map((item) => item.url));
  const hotBlogUrls = new Set(drafted.report.hot_blogs.map((item) => item.url));
  const orderedMainUrls = drafted.report.main_items.map((item) => item.url);

  assert(mainUrls.has(appleSiriUrl), "Apple Siri and Apple Intelligence update should enter main_items");
  assert(mainUrls.has(applePersonalSiriUrl), "Apple personal Siri AI update should enter main_items");
  assert(mainUrls.has(openAiExchangeUrl), "OpenAI public research exchange should enter main_items");
  assert(mainUrls.has(blackwellUrl), "NVIDIA Blackwell AI inference update should enter main_items");
  assert(mainUrls.has(notebooklmUrl), "official NotebookLM product update should enter main_items");
  assert(mainUrls.has(rocketmqUrl), "official RocketMQ workflow infrastructure update should enter main_items");
  assert(new Set([...mainUrls, ...hotBlogUrls]).has(awsCrossRegionUrl), "official AWS cross-region inference update should remain in public selection");
  assert(new Set([...mainUrls, ...hotBlogUrls]).has(agentcoreUrl), "official Bedrock AgentCore workflow update should remain in public selection");
  assert(new Set([...mainUrls, ...hotBlogUrls]).has(nemotronUrl), "official NVIDIA model deep dive should remain available in public selection");
  assert(
    drafted.report.main_items.filter((item) => /NVIDIA|AWS/i.test(item.source)).length <= 2,
    "NVIDIA/AWS infrastructure items should not dominate main_items when core official sources exist"
  );
  assert(orderedMainUrls.indexOf(openAiExchangeUrl) < orderedMainUrls.indexOf(blackwellUrl), "OpenAI official update should rank before NVIDIA infrastructure update");
  assert.equal(
    new Set(drafted.report.main_items.map((item) => item.title)).size,
    drafted.report.main_items.length,
    "main_items should not expose duplicate display titles"
  );
});

test("report:draft promotes original Anthropic Fable/Mythos launch over platform availability duplicates", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-fable-mythos-"));
  const reportDate = "2026-06-10";
  const discoveryPath = path.join(tmp, "discovery.json");
  const discovery = autodraftDiscoveryFixture(reportDate);
  const anthropicUrl = "https://www.anthropic.com/news/claude-fable-5-mythos-5";
  const foundryUrl = "https://devblogs.microsoft.com/foundry/claude-fable-5-in-foundry/";
  const githubUrl = "https://github.blog/changelog/2026-06-09-claude-fable-5-is-now-available-in-github-copilot/";
  const bedrockUrl = "https://aws.amazon.com/about-aws/whats-new/2026/06/claude-fable-5-amazon-bedrock/";

  discovery.candidates.push(
    {
      id: "anthropic-fable-mythos-original",
      source_id: "content-anthropic-company-news",
      category: "community_lead",
      title: "Claude Fable 5 and Claude Mythos 5",
      url: anthropicUrl,
      source: "Anthropic Company News",
      event_date: reportDate,
      status: "excluded",
      evidence: "Anthropic says Claude Fable 5 is a Mythos-class model made safe for general use. Mythos 5 is the same underlying model with some safeguards lifted for trusted access. Fable 5 falls back to Claude Opus 4.8 for cyber, bio, chemical, and distillation cases; Fable is broadly available and Mythos is restricted.",
      verification_status: "primary_confirmed",
      source_level: "official_company_news",
      primary_url: anthropicUrl,
      verification_sources: [anthropicUrl],
      editorial_category: "ai_industry"
    },
    {
      id: "microsoft-foundry-fable-availability",
      source_id: "content-microsoft-foundry-blog",
      category: "community_lead",
      title: "Claude Fable 5 is available in Microsoft Foundry",
      url: foundryUrl,
      source: "Microsoft Foundry Blog",
      event_date: reportDate,
      status: "excluded",
      evidence: "Microsoft says Claude Fable 5 is available in Foundry for developers using Azure platform tooling.",
      verification_status: "primary_confirmed",
      source_level: "official",
      primary_url: foundryUrl,
      verification_sources: [foundryUrl],
      editorial_category: "product_radar"
    },
    {
      id: "github-copilot-fable-availability",
      source_id: "content-github-changelog",
      category: "community_lead",
      title: "Claude Fable 5 is now available in GitHub Copilot",
      url: githubUrl,
      source: "GitHub Changelog",
      event_date: reportDate,
      status: "excluded",
      evidence: "GitHub says Claude Fable 5 is now available in Copilot and requires 30-day prompt and output retention for safety classifiers.",
      verification_status: "primary_confirmed",
      source_level: "official",
      primary_url: githubUrl,
      verification_sources: [githubUrl],
      editorial_category: "product_radar"
    },
    {
      id: "aws-bedrock-fable-availability",
      source_id: "content-aws-whats-new",
      category: "community_lead",
      title: "Claude Fable 5 is available in Amazon Bedrock",
      url: bedrockUrl,
      source: "AWS What's New",
      event_date: reportDate,
      status: "excluded",
      evidence: "AWS says Claude Fable 5 is available in Amazon Bedrock for model access through AWS accounts.",
      verification_status: "primary_confirmed",
      source_level: "official",
      primary_url: bedrockUrl,
      verification_sources: [bedrockUrl],
      editorial_category: "product_radar"
    }
  );
  await fs.writeFile(discoveryPath, `${JSON.stringify(discovery, null, 2)}\n`, "utf8");

  const drafted = await generateReportDraft({
    rootDir: tmp,
    reportDate,
    generatedAt: fixedGeneratedAt,
    inputPaths: [discoveryPath],
    cacheEvidence: false
  });

  const mainUrls = drafted.report.main_items.map((item) => item.url);
  const fableMain = drafted.report.main_items.find((item) => item.url === anthropicUrl);
  assert(fableMain, "Anthropic original Fable/Mythos launch should enter main_items");
  assert.equal(mainUrls.includes(foundryUrl), false, "Foundry availability should not occupy a separate main slot");
  assert.equal(mainUrls.includes(githubUrl), false, "GitHub availability should not occupy a separate main slot");
  assert.equal(mainUrls.includes(bedrockUrl), false, "Bedrock availability should not occupy a separate main slot");
  assert(mainUrls.indexOf(anthropicUrl) <= 2, "Original Fable/Mythos launch should rank near the top");
  const fableText = `${fableMain.summary} ${(fableMain.bullets || []).join(" ")}`;
  assert.match(fableText, /Fable 5/);
  assert.match(fableText, /Mythos/);
  assert.match(fableText, /Opus 4\.8|\$10\/M|\$50\/M|trusted/i);
});

test("report:draft skips recent main duplicates and same-report hot blog duplicates", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-autodraft-dedupe-"));
  const reportDate = "2026-05-26";
  const discoveryPath = path.join(tmp, "discovery.json");
  const discovery = autodraftDiscoveryFixture(reportDate);
  discovery.candidates.push({
    id: "hot-blog-duplicate-main-url",
    source_id: "content-openai-news",
    category: "hot_blog",
    title: "Duplicate OpenAI blog wrapper",
    url: "https://example.com/official/1",
    source: "OpenAI News RSS",
    author: "OpenAI",
    event_date: reportDate,
    status: "excluded",
    evidence: "Same URL as a main candidate; should not be wrapped again as a hot blog.",
    verification_status: "primary_confirmed",
    source_level: "primary",
    primary_url: "https://example.com/official/1",
    verification_sources: ["https://example.com/official/1"]
  });
  discovery.candidates.push({
    id: "hot-blog-duplicate-blog-url",
    source_id: "content-latent-space-copy",
    category: "hot_blog",
    title: "Scaling Past Informal AI mirror",
    url: "https://www.latent.space/p/axiom",
    source: "Latent.Space Mirror",
    author: "Latent.Space",
    event_date: reportDate,
    status: "excluded",
    evidence: "Same URL as another hot blog candidate; should not be included twice.",
    verification_status: "primary_confirmed",
    source_level: "primary",
    primary_url: "https://www.latent.space/p/axiom",
    verification_sources: ["https://www.latent.space/p/axiom"]
  });
  const staleNvidiaUrl = "https://blogs.nvidia.com/blog/uk-sovereign-ai-advancements/";
  discovery.candidates.push({
    id: "hot-blog-stale-nvidia-sovereign-ai",
    source_id: "content-nvidia-newsroom-rss",
    category: "hot_blog",
    title: "NVIDIA pushes UK sovereign AI advancements",
    url: staleNvidiaUrl,
    source: "NVIDIA Newsroom",
    author: "NVIDIA",
    event_date: "2026-06-08",
    status: "excluded",
    evidence: "Official NVIDIA post about UK sovereign AI infrastructure, partners, and AI factory positioning.",
    verification_status: "primary_confirmed",
    source_level: "official",
    primary_url: staleNvidiaUrl,
    verification_sources: [staleNvidiaUrl]
  });
  await fs.writeFile(discoveryPath, `${JSON.stringify(discovery, null, 2)}\n`, "utf8");

  const historyDir = path.join(tmp, "reports-data", "2026", "05");
  await fs.mkdir(historyDir, { recursive: true });
  await fs.writeFile(
    path.join(historyDir, "2026-05-25.json"),
    `${JSON.stringify({
      report_date: "2026-05-25",
      main_items: [{ url: "https://www.example.com/official/2/?utm_source=feed#seen" }],
      hot_blogs: [
        { url: "https://example.com/official/3?utm_source=feed#seen" },
        { url: `${staleNvidiaUrl}?utm_source=feed#seen` }
      ]
    }, null, 2)}\n`,
    "utf8"
  );

  const drafted = await generateReportDraft({
    rootDir: tmp,
    reportDate,
    generatedAt: fixedGeneratedAt,
    inputPaths: [discoveryPath],
    cacheEvidence: false
  });

  const mainUrls = new Set(drafted.report.main_items.map((item) => item.url));
  assert.equal(mainUrls.has("https://example.com/official/2"), false);
  assert.equal(mainUrls.has("https://example.com/official/3"), false);
  assert.equal(
    drafted.candidatePool.candidates.find((candidate) => candidate.id === "official-3")?.exclusion_reason,
    "recent_duplicate_main_item:2026-05-25:hot_blogs[0]"
  );
  assert(!drafted.report.hot_blogs.some((item) => mainUrls.has(item.url)));
  assert.equal(new Set(drafted.report.hot_blogs.map((item) => item.url)).size, drafted.report.hot_blogs.length);
  assert.equal(
    drafted.candidatePool.candidates.find((candidate) => candidate.id === "hot-blog-duplicate-blog-url")?.status,
    "excluded"
  );
  assert(!drafted.report.hot_blogs.some((item) => item.url === staleNvidiaUrl));
  assert.match(
    drafted.candidatePool.candidates.find((candidate) => candidate.id === "hot-blog-stale-nvidia-sovereign-ai")?.exclusion_reason || "",
    /recent_duplicate/
  );
});

test("evidence cache downloads image_url candidates into local evidence assets", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-evidence-cache-"));
  const result = await cacheEvidenceImages({
    rootDir: tmp,
    reportDate: "2026-05-26",
    outDir: "docs",
    candidates: [
      {
        id: "main-aigc-image",
        title: "Runway video model update",
        url: "https://runwayml.com/en/changelog/example",
        source: "Runway Changelog",
        status: "included",
        included_in: "main_items",
        verification_status: "primary_confirmed",
        editorial_category: "content_aigc",
        image_url: "https://example.com/runway.png",
        image_alt: "Runway product screenshot",
        image_source: "feed"
      }
    ],
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: new Map([["content-type", "image/png"]]),
      arrayBuffer: async () => Buffer.alloc(256, 7)
    })
  });

  assert.equal(result.assets.length, 1);
  assert.equal(result.assets[0].source_url, "https://runwayml.com/en/changelog/example");
  assert.match(result.assets[0].local_path, /^assets\/evidence\/runway-video-model-update-2026-05-26\.png$/);
  assert.equal(await exists(path.join(tmp, "docs", result.assets[0].local_path)), true);
});

test("semantic evidence asset gate rejects decorative article images", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-evidence-semantic-"));
  let fetchCount = 0;
  const result = await cacheEvidenceImages({
    rootDir: tmp,
    reportDate: "2026-06-11",
    outDir: "docs",
    maxAssets: 3,
    candidates: [
      {
        id: "decorative-hero",
        title: "Meta explains compute power",
        url: "https://about.fb.com/news/2026/06/what-is-compute-power-meta-ai-infrastructure/",
        source: "Meta Newsroom",
        status: "included",
        included_in: "main_items",
        verification_status: "primary_confirmed",
        image_url: "https://example.com/computer-hero.png",
        image_alt: "Decorative computer hero image",
        image_source: "html_index"
      },
      {
        id: "benchmark-table",
        title: "Claude Fable 5 benchmark results",
        url: "https://www.anthropic.com/news/claude-fable-5-mythos-5",
        source: "Anthropic News",
        status: "included",
        included_in: "main_items",
        verification_status: "primary_confirmed",
        image_url: "https://example.com/fable-benchmark.png",
        image_alt: "Model performance benchmark table",
        image_source: "source_asset"
      }
    ],
    fetchImpl: async () => {
      fetchCount += 1;
      return {
        ok: true,
        status: 200,
        headers: new Map([["content-type", "image/png"]]),
        arrayBuffer: async () => Buffer.alloc(256, 7)
      };
    }
  });

  assert.equal(fetchCount, 1);
  assert.equal(result.assets.length, 1);
  assert.equal(result.assets[0].source_url, "https://www.anthropic.com/news/claude-fable-5-mythos-5");
  assert.equal(result.assets[0].asset_role, "table");
  assert.equal(result.assets[0].asset_kind, "table");
});

test("evidence cache skips sources that already have local evidence and backfills remaining public images", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-evidence-cache-existing-"));
  const result = await cacheEvidenceImages({
    rootDir: tmp,
    reportDate: "2026-05-26",
    outDir: "docs",
    existingEvidenceAssets: [
      {
        source_url: "https://example.com/blog-already-covered",
        local_path: "assets/evidence/already-covered.png"
      }
    ],
    candidates: [
      {
        id: "already-covered",
        title: "Blog already covered",
        url: "https://example.com/blog-already-covered",
        source: "Covered source",
        status: "included",
        included_in: "hot_blogs",
        verification_status: "primary_confirmed",
        image_url: "https://example.com/already-covered.png",
        image_alt: "Already covered"
      },
      {
        id: "community-image",
        title: "Community image worth caching",
        url: "https://example.com/community-image",
        source: "Community source",
        status: "included",
        included_in: "community_leads",
        verification_status: "intermediary_only",
        image_url: "https://example.com/community-image.png",
        image_alt: "Community product UI screenshot"
      }
    ],
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: new Map([["content-type", "image/png"]]),
      arrayBuffer: async () => Buffer.alloc(256, 7)
    })
  });

  assert.equal(result.assets.length, 1);
  assert.equal(result.assets[0].source_url, "https://example.com/community-image");
  assert.match(result.assets[0].local_path, /^assets\/evidence\/community-image-worth-caching-2026-05-26\.png$/);
});

test("evidence cache preserves a community image slot when hot blogs would otherwise take every new asset", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-evidence-cache-community-quota-"));
  const result = await cacheEvidenceImages({
    rootDir: tmp,
    reportDate: "2026-05-26",
    outDir: "docs",
    maxAssets: 4,
    candidates: [
      {
        id: "main-image",
        title: "Main image",
        url: "https://example.com/main-image",
        source: "Primary main source",
        status: "included",
        included_in: "main_items",
        verification_status: "primary_confirmed",
        image_url: "https://example.com/main-image.png",
        image_alt: "Main benchmark chart"
      },
      {
        id: "hot-blog-1",
        title: "Hot blog one",
        url: "https://example.com/hot-blog-1",
        source: "Hot blog one",
        status: "included",
        included_in: "hot_blogs",
        verification_status: "primary_confirmed",
        image_url: "https://example.com/hot-blog-1.png",
        image_alt: "Hot blog one performance chart"
      },
      {
        id: "hot-blog-2",
        title: "Hot blog two",
        url: "https://example.com/hot-blog-2",
        source: "Hot blog two",
        status: "included",
        included_in: "hot_blogs",
        verification_status: "primary_confirmed",
        image_url: "https://example.com/hot-blog-2.png",
        image_alt: "Hot blog two architecture diagram"
      },
      {
        id: "hot-blog-3",
        title: "Hot blog three",
        url: "https://example.com/hot-blog-3",
        source: "Hot blog three",
        status: "included",
        included_in: "hot_blogs",
        verification_status: "primary_confirmed",
        image_url: "https://example.com/hot-blog-3.png",
        image_alt: "Hot blog three leaderboard table"
      },
      {
        id: "community-priority",
        title: "Community image should stay visible",
        url: "https://example.com/community-priority",
        source: "Community source",
        status: "included",
        included_in: "community_leads",
        verification_status: "primary_confirmed",
        image_url: "https://example.com/community-priority.png",
        image_alt: "Community product UI screenshot"
      }
    ],
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: new Map([["content-type", "image/png"]]),
      arrayBuffer: async () => Buffer.alloc(256, 7)
    })
  });

  assert.equal(result.assets.length, 4);
  assert(result.assets.some((asset) => asset.source_url === "https://example.com/main-image"));
  assert(result.assets.some((asset) => asset.source_url === "https://example.com/community-priority"));
  assert.equal(
    result.assets.filter((asset) => asset.source_url.startsWith("https://example.com/hot-blog-")).length,
    2
  );
});

test("content source discovery uses cache fallback for blocked arXiv or Reddit sources", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-source-cache-"));
  const reportDate = "2026-05-26";
  const redditSource = {
    id: "content-reddit-machinelearning",
    name: "Reddit r/MachineLearning",
    url: "https://www.reddit.com/r/MachineLearning/.json",
    source_kind: "search_api",
    category: "intermediary",
    source_level: "community_api",
    maxItemsPerRun: 3
  };
  const redditPayload = {
    data: {
      children: [
        {
          data: {
            title: "[D] AI video workflows for games",
            url: "https://www.reddit.com/r/MachineLearning/comments/example/ai_video_games/",
            created_utc: 1779746400,
            selftext: "Developers discuss AI video and game asset generation workflows."
          }
        }
      ]
    }
  };
  await collectContentSources({
    rootDir: tmp,
    reportDate,
    generatedAt: fixedGeneratedAt,
    sources: [redditSource],
    fetchRetries: 0,
    cacheTtlDays: 999,
    fetchImpl: async () => textResponse(JSON.stringify(redditPayload))
  });

  const fallback = await collectContentSources({
    rootDir: tmp,
    reportDate,
    generatedAt: fixedGeneratedAt,
    sources: [redditSource],
    fetchRetries: 0,
    cacheTtlDays: 999,
    fetchImpl: async () => textResponse("", 429)
  });

  assert.equal(fallback.source_audit.content_sources.sources[0].status, "checked");
  assert.match(fallback.source_audit.content_sources.sources[0].notes, /cache_fallback_used/);
  assert.match(fallback.source_audit.content_sources.sources[0].notes, /original_error=HTTP_429/);
  assert.equal(fallback.candidates.length, 1);
  assert.equal(fallback.candidates[0].url, "https://www.reddit.com/r/MachineLearning/comments/example/ai_video_games/");
});

test("report:write allows explicit network-outage empty reports only", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-empty-outage-"));
  const reportDate = "2026-06-03";
  const draft = JSON.parse(await readFixture("reports/good/structured-draft.json"));
  const candidatePool = JSON.parse(await readFixture("reports/good/structured-draft.candidates.json"));
  const draftPath = path.join(tmp, "daily-report.json");
  const candidatePoolPath = path.join(tmp, "source-candidates.json");

  Object.assign(draft, {
    report_date: reportDate,
    report_status: "empty_due_to_network_outage",
    title: `AI 日报 ${reportDate}`,
    summary: "固定信源网络阻塞，本轮未写入未核验主体事实。",
    hero_highlights: [],
    source_window: {
      date_from: reportDate,
      date_to: reportDate,
      fallback_window_used: false,
      notes: "network outage fixture"
    },
    source_audit: networkOutageSourceAuditFixture(),
    main_items: [],
    github_trending: [],
    model_releases: [],
    hot_blogs: [],
    projects: [],
    builder_observations: [],
    community_leads: [],
    evidence_assets: [],
    self_check: {
      ...draft.self_check,
      report_date: reportDate,
      main_items: 0,
      builder_observations: 0,
      notes: "network outage fixture",
      optimization_suggestions: []
    }
  });

  Object.assign(candidatePool, {
    report_date: reportDate,
    generated_at: "2026-06-03T02:35:00+08:00",
    sources: [
      {
        id: "source-network-outage",
        name: "Network outage fixture",
        url: "https://example.com/network-outage",
        category: "other",
        status: "blocked",
        checked_at: "2026-06-03T02:35:00+08:00",
        notes: "fetch failed EACCES"
      }
    ],
    candidates: []
  });

  await fs.writeFile(draftPath, `${JSON.stringify(draft, null, 2)}\n`, "utf8");
  await fs.writeFile(candidatePoolPath, `${JSON.stringify(candidatePool, null, 2)}\n`, "utf8");

  const result = await writeReportDraft({
    rootDir: tmp,
    inputPath: draftPath,
    outputDir: "reports-data",
    candidatePoolPath,
    siteUrl,
    generatedAt: "2026-06-03T02:35:00+08:00",
    automationRevision: strictAutomationRevisionFixture()
  });

  assert.equal(result.report.report_status, "empty_due_to_network_outage");
  assert.deepEqual(result.report.main_items, []);
  assert.equal(result.report.quality_status.status, "degraded");
  assert(result.report.quality_status.reasons.includes("empty_due_to_network_outage"));
  assert(
    result.report.quality_status.degraded_sections.some(
      (issue) => issue.code === "empty_due_to_network_outage" && issue.section === "main_items"
    )
  );
  assert(
    !result.report.quality_status.degraded_sections.some(
      (issue) => issue.code === "empty_due_to_network_outage" && issue.section !== "main_items"
    )
  );

  const interaction = reportToInteractionInput(result.report);
  const aiNewsSection = interaction.sections.find((section) => section.title === "AI 行业动态");
  assert(aiNewsSection.content.includes("未写入未核验主体事实"));

  const invalid = structuredClone(result.report);
  invalid.report_status = "normal";
  const invalidValidation = validateReport(invalid);
  assert.equal(invalidValidation.valid, false);
  assert(invalidValidation.errors.some((error) => error.path === "/main_items"));
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
  assert(interaction.sections.some((section) => String(section.content || "").includes("==tag-major|重大==")));
});

test("schema rejects arbitrary optimization_suggestions objects", async () => {
  const report = JSON.parse(await readFixture("reports/good/structured-report.json"));
  report.self_check.optimization_suggestions = [{ foo: "bar" }];

  const validation = validateReport(report);

  assert.equal(validation.valid, false);
  assert(validation.errors.some((error) => error.path.includes("/self_check/optimization_suggestions/0")));
});

test("schema accepts Chinese media dynamics with two key points", async () => {
  const report = JSON.parse(await readFixture("reports/good/structured-report.json"));
  report.chinese_media_dynamics = [
    {
      title: "Chinese media item with concise notes",
      url: "https://example.com/chinese-media/two-key-points",
      publisher: "QbitAI",
      author: "QbitAI",
      event_date: report.report_date,
      topic: "Chinese AI media",
      summary: "This fixture keeps a Chinese media dynamics item with only two concise key points.",
      key_points: ["First verified note.", "Second verified note."]
    }
  ];

  const validation = validateReport(report);

  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
});

test("optimization suggestions normalize legacy fields into canonical contract", () => {
  const suggestions = normalizeOptimizationSuggestions([
    {
      issue: "历史建议字段不稳定",
      evidence: "同一字段出现多种 key shape。",
      suggested_module: "prompts/ai-daily/modules/reflection-loop.md",
      suggestion: "固定字段名并拒绝任意对象。",
      expected_benefit: "让反馈能被 validate 和 report:write 稳定消费。",
      needs_user_confirmation: false
    }
  ]);

  assert.deepEqual(suggestions, [
    {
      issue: "历史建议字段不稳定",
      evidence: "同一字段出现多种 key shape。",
      module: "prompts/ai-daily/modules/reflection-loop.md",
      suggestion: "固定字段名并拒绝任意对象。",
      expected_benefit: "让反馈能被 validate 和 report:write 稳定消费。",
      requires_user_confirmation: false
    }
  ]);
});

test("feedback contract requires P1 ledger items to bind to tests or gates", async () => {
  const result = await validateFeedbackContract({
    rootDir,
    ledger: {
      schema_version: 1,
      items: [
        {
          id: "feedback/p1-missing-binding",
          severity: "P1",
          status: "confirmed",
          title: "Missing binding",
          problem: "Confirmed feedback can drift.",
          expected_behavior: "Every P1 item binds to validation.",
          scope: ["src/feedback-contract.js"]
        }
      ]
    },
    promptModules: {
      schema_version: 1,
      modules: []
    },
    promptManifest: {
      schema_version: 1,
      modules: []
    }
  });

  assert.equal(result.ok, false);
  assert(result.failures.some((failure) => failure.includes("feedback/p1-missing-binding")));
});

test("feedback contract rejects P1 bindings whose test name is not present in tests", async () => {
  const result = await validateFeedbackContract({
    rootDir,
    ledger: {
      schema_version: 1,
      items: [
        {
          id: "feedback/p1-missing-test-name",
          severity: "P1",
          status: "implemented",
          title: "Missing test name",
          problem: "A ledger item can point at a non-existent assertion.",
          expected_behavior: "The validator proves the named assertion exists.",
          scope: ["src/feedback-contract.js"],
          validation: {
            command: "node --test tests/unit.test.js",
            test_name: "this test name does not exist",
            gate: "npm run validate"
          }
        }
      ]
    },
    promptModules: { schema_version: 1, modules: [] },
    promptManifest: { schema_version: 1, modules: [] },
    testFiles: [
      {
        path: "tests/unit.test.js",
        content: "test(\"some other test\", () => {})"
      }
    ],
    packageJson: {
      scripts: {
        validate: "npm run test",
        test: "node --test tests/unit.test.js"
      }
    }
  });

  assert.equal(result.ok, false);
  assert(result.failures.some((failure) => failure.includes("validation.test_name not found")));
});

test("feedback contract rejects P1 validation commands outside npm validate", async () => {
  const result = await validateFeedbackContract({
    rootDir,
    ledger: {
      schema_version: 1,
      items: [
        {
          id: "feedback/p1-command-not-covered",
          severity: "P1",
          status: "implemented",
          title: "Command not covered",
          problem: "A ledger item can cite a command that validate never runs.",
          expected_behavior: "The validator proves the command is covered by npm run validate.",
          scope: ["src/feedback-contract.js"],
          validation: {
            command: "node --test tests/not-in-validate.test.js",
            test_name: "covered assertion",
            gate: "npm run validate"
          }
        }
      ]
    },
    promptModules: { schema_version: 1, modules: [] },
    promptManifest: { schema_version: 1, modules: [] },
    testFiles: [
      {
        path: "tests/not-in-validate.test.js",
        content: "test(\"covered assertion\", () => {})"
      }
    ],
    packageJson: {
      scripts: {
        validate: "npm run test",
        test: "node --test tests/unit.test.js"
      }
    }
  });

  assert.equal(result.ok, false);
  assert(result.failures.some((failure) => failure.includes("validation.command is not covered by npm run validate")));
});

test("feedback contract rejects P1 scope paths that do not exist", async () => {
  const result = await validateFeedbackContract({
    rootDir,
    ledger: {
      schema_version: 1,
      items: [
        {
          id: "feedback/p1-missing-scope",
          severity: "P1",
          status: "implemented",
          title: "Missing scope",
          problem: "A ledger item can point at no real changed file.",
          expected_behavior: "Every P1 scope path resolves to a repository file.",
          scope: ["src/does-not-exist.js"],
          validation: {
            command: "node --test tests/unit.test.js",
            test_name: "covered assertion",
            gate: "npm run validate"
          }
        }
      ]
    },
    promptModules: { schema_version: 1, modules: [] },
    promptManifest: { schema_version: 1, modules: [] },
    testFiles: [
      {
        path: "tests/unit.test.js",
        content: "test(\"covered assertion\", () => {})"
      }
    ],
    packageJson: {
      scripts: {
        validate: "npm run test",
        test: "node --test tests/unit.test.js"
      }
    }
  });

  assert.equal(result.ok, false);
  assert(result.failures.some((failure) => failure.includes("scope path does not exist")));
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
    source_registry_count: 68,
    source_registry_enablement_counts: { core: 28, optional: 35, manual: 5 },
    origin_main_sha: "abcdef1234567890abcdef1234567890abcdef12",
    origin_main_short: "abcdef123456",
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
  assert.match(revision.origin_main_sha, /^(unknown|[0-9a-f]{40})$/);
});

test("publish quality accepts strict daily reports with full source proof", () => {
  const report = strictPublishReportFixture();

  assert.deepEqual(findPublishQualityIssues(report, strictPublishOptionsFixture()), []);
});

test("publish quality degrades strict daily reports whose summary reads like a generation log", () => {
  const report = strictPublishReportFixture();
  report.summary = "今天用最新 main 重新生成，扩展为 10 条主体信息和 26 个内容单元。";

  const classification = classifyPublishQuality(report, strictPublishOptionsFixture());

  assert.deepEqual(classification.blocking_issues, []);
  assert(
    classification.degraded_sections.some(
      (issue) => issue.code === "summary_contains_process_status" && issue.section === "summary"
    )
  );
});

test("publish quality accepts strict daily reports without explanation metadata", () => {
  const report = strictPublishReportFixture();
  delete report.main_items[0].reader_relevance;
  delete report.main_items[0].why_it_matters;

  const classification = classifyPublishQuality(report, strictPublishOptionsFixture());

  assert.deepEqual(classification.blocking_issues, []);
  assert(!classification.degraded_sections.some((issue) => issue.code === "main_items_editorial_context_missing"));
});

test("publish quality blocks strict daily reports when intermediary sources enter mainline facts", () => {
  const report = strictPublishReportFixture();
  report.main_items[0].source_level = "intermediary";
  report.main_items[0].verification_status = "intermediary_only";
  report.main_items[0].verification_note = "Only an intermediary report was found.";

  const classification = classifyPublishQuality(report, strictPublishOptionsFixture());

  assert(
    classification.blocking_issues.some(
      (issue) => issue.code === "mainline_source_authority_failed" && issue.section === "main_items"
    )
  );
});

test("publish quality accepts strict fixed source proof when a public source is blocked", () => {
  const report = strictPublishReportFixture();
  const redditSource = report.source_audit.content_sources.sources
    .find((source) => source.name === "Reddit r/MachineLearning");
  redditSource.status = "blocked";
  redditSource.notes = "HTTP 403";

  const issues = findPublishQualityIssues(report, strictPublishOptionsFixture());

  assert(!issues.some((issue) => issue.code === "fixed_source_e_public_apis"));
});

test("publish quality blocks strict daily reports without automation revision proof", () => {
  const report = strictPublishReportFixture();
  delete report.self_check.automation_revision;

  const issues = findPublishQualityIssues(report);

  assert(issues.some((issue) => issue.code === "automation_revision_missing_or_stale"));
});

test("publish quality blocks strict daily reports whose automation revision does not match the current repo revision", () => {
  const report = strictPublishReportFixture();
  const options = strictPublishOptionsFixture();
  options.currentAutomationRevision = {
    ...options.currentAutomationRevision,
    git_commit: "1234567890abcdef1234567890abcdef12345678"
  };

  const issues = findPublishQualityIssues(report, options);

  assert(
    issues.some(
      (issue) =>
        issue.code === "automation_revision_missing_or_stale" &&
        issue.revision_mismatches.includes("git_commit")
    )
  );
});

test("publish quality blocks strict daily reports not generated from current origin/main", () => {
  const report = strictPublishReportFixture();
  const options = strictPublishOptionsFixture();
  report.self_check.automation_revision.origin_main_sha = "1234567890abcdef1234567890abcdef12345678";
  report.self_check.automation_revision.origin_main_short = "1234567890ab";

  const issues = findPublishQualityIssues(report, options);

  assert(
    issues.some(
      (issue) =>
        issue.code === "automation_revision_missing_or_stale" &&
        issue.revision_mismatches.includes("origin_main_sha")
    )
  );
});

test("china ai hard gate blocks strict publish when China lane is missing", () => {
  const report = strictPublishReportFixture();
  report.report_date = "2026-06-11";
  report.self_check.report_date = "2026-06-11";
  delete report.source_audit.china_ai_sources;

  const classification = classifyPublishQuality(report, strictPublishOptionsFixture());

  assert(
    classification.blocking_issues.some(
      (issue) =>
        issue.error_code === "china_ai_hard_gate_failed" &&
        issue.code === "china_ai_source_lane_missing" &&
        issue.section === "source_audit.china_ai_sources"
    )
  );
});

test("publish quality degrades strict daily reports missing requested Chinese source surface", () => {
  const report = strictPublishReportFixture();
  report.source_audit.content_sources.sources = report.source_audit.content_sources.sources
    .filter((source) => source.name !== "QbitAI")
    .concat({
      name: "Strict Filler Source",
      url: "https://example.com/strict-filler.xml",
      status: "checked",
      notes: "fixture"
    });

  const classification = classifyPublishQuality(report);

  assert.deepEqual(classification.blocking_issues, []);
  assert(
    classification.degraded_sections.some(
      (issue) => issue.code === "fixed_source_d_chinese_media" && issue.missing_sources.includes("QbitAI")
    )
  );
});

test("publish quality degrades strict daily reports missing OpenAI News RSS source proof", () => {
  const report = strictPublishReportFixture();
  report.source_audit.content_sources.sources = report.source_audit.content_sources.sources
    .filter((source) => source.name !== "OpenAI News RSS")
    .concat({
      name: "Strict OpenAI Filler Source",
      url: "https://example.com/strict-openai-filler.xml",
      status: "checked",
      notes: "fixture"
    });

  const classification = classifyPublishQuality(report, strictPublishOptionsFixture());

  assert.deepEqual(classification.blocking_issues, []);
  assert(
    classification.degraded_sections.some(
      (issue) =>
        issue.code === "fixed_source_b_official_labs" &&
        issue.missing_sources.includes("OpenAI News RSS")
    )
  );
});

test("publish quality degrades strict daily reports missing GitHub Trending Top 10 proof", () => {
  const report = strictPublishReportFixture();
  report.github_trending = report.github_trending.slice(0, 9);
  report.source_audit.github_trending.candidates_found = 9;

  const classification = classifyPublishQuality(report, strictPublishOptionsFixture());

  assert.deepEqual(classification.blocking_issues, []);
  assert(classification.degraded_sections.some((issue) => issue.error_code === "github_trending_top10_gate_failed"));
});

test("publish quality degrades strict daily reports when a required GitHub Trending source has weak signal", () => {
  const report = strictPublishReportFixture();
  const weakSource = report.source_audit.github_trending.sources.find((source) => source.name === "GitHub Trending Rust daily");
  weakSource.status = "no_signal";
  weakSource.notes = "0 repositories parsed";
  weakSource.parsed_count = 0;

  const classification = classifyPublishQuality(report, strictPublishOptionsFixture());
  const qualityStatus = deriveQualityStatus(report);
  const issue = classification.degraded_sections.find(
    (candidate) => candidate.error_code === "github_trending_source_signal_gate_failed"
  );

  assert.deepEqual(classification.blocking_issues, []);
  assert(issue);
  assert.equal(issue.section, "source_audit.github_trending");
  assert.equal(issue.parsed_minimum, 10);
  assert(issue.weak_sources.some((source) => source.name === "GitHub Trending Rust daily"));
  assert(qualityStatus.reasons.includes("github_trending_required_source_weak_signal"));
  assert.match(qualityStatus.public_note, /GitHub Trending/);
});

test("publish quality exposes network-wide source outage even when sections are populated", () => {
  const report = strictPublishReportFixture();
  for (const groupName of ["github_trending", "builder_sources", "content_sources", "search_sources", "sources_health"]) {
    const group = report.source_audit[groupName];
    if (!group) {
      continue;
    }
    group.sources = group.sources.map((source) => ({
      ...source,
      status: "blocked",
      notes: "fetch failed; retry_failed_after_1"
    }));
    group.candidates_found = 0;
    group.included = 0;
    group.blocked_reason = "fetch_failed";
  }

  const classification = classifyPublishQuality(report, strictPublishOptionsFixture());
  const outage = classification.degraded_sections.find((issue) => issue.code === "source_discovery_network_unavailable");

  assert.deepEqual(classification.blocking_issues, []);
  assert(outage);
  assert.equal(outage.section, "source_audit");
  assert.match(outage.message, /github_trending/);
  assert.match(outage.message, /content_sources/);
  assert.match(outage.remediation, /config\.toml/);
  assert.match(outage.remediation, /workspace-write/);
});

test("publish quality degrades strict daily reports with duplicate or non-top-10 GitHub ranks", () => {
  const report = strictPublishReportFixture();
  report.github_trending = report.github_trending.map((item, index) => ({
    ...item,
    rank: index + 11
  }));

  const classification = classifyPublishQuality(report, strictPublishOptionsFixture());

  assert.deepEqual(classification.blocking_issues, []);
  assert(
    classification.degraded_sections.some(
      (issue) => issue.error_code === "github_trending_top10_gate_failed" && issue.has_rank_coverage === false
    )
  );
});

test("publish quality degrades strict daily reports missing follow-builders X status coverage", () => {
  const report = strictPublishReportFixture();
  report.builder_observations[0].url = "https://example.com/not-x-status";

  const classification = classifyPublishQuality(report, strictPublishOptionsFixture());

  assert.deepEqual(classification.blocking_issues, []);
  assert(
    classification.degraded_sections.some(
      (issue) => issue.error_code === "builder_x_coverage_gate_failed" && issue.has_x_observation === false
    )
  );
});

test("publish quality degrades strict daily reports with fewer than eight Builder observations", () => {
  const report = strictPublishReportFixture();
  report.builder_observations = report.builder_observations.slice(0, 3);
  report.self_check.builder_observations = report.builder_observations.length;
  report.source_audit.builder_sources.candidates_found = 12;
  report.source_audit.builder_sources.included = report.builder_observations.length;

  const classification = classifyPublishQuality(report, strictPublishOptionsFixture());

  assert.deepEqual(classification.blocking_issues, []);
  assert(
    classification.degraded_sections.some(
      (issue) =>
        issue.error_code === "strict_section_coverage_gate_failed" &&
        issue.code === "builder_observations_below_strict_minimum" &&
        issue.minimum === 8
      )
  );
});

test("publish quality skips strict section minimums when selection snapshot proves insufficient candidates", () => {
  const report = strictPublishReportFixture();
  report.main_items = report.main_items.slice(0, 6);
  report.hot_blogs = report.hot_blogs.slice(0, 1);
  report.self_check.main_items = report.main_items.length;
  report.self_check.selection_snapshot = {
    main_items: { eligible_candidates: 6, selected: 6 },
    github_trending: { eligible_candidates: 10, selected: 10 },
    hot_blogs: { eligible_candidates: 1, selected: 1 },
    projects: { eligible_candidates: 3, selected: 3 },
    builder_observations: { eligible_candidates: 5, selected: 5 }
  };

  const classification = classifyPublishQuality(report, strictPublishOptionsFixture());

  assert(
    !classification.degraded_sections.some(
      (issue) => issue.code === "main_items_below_strict_minimum" || issue.code === "hot_blogs_below_strict_minimum"
    )
  );
});

test("publish quality blocks strict daily reports with summarized Builder observations", () => {
  const report = strictPublishReportFixture();
  delete report.builder_observations[0].original_text;
  report.builder_observations[1].translation = "完整翻译。";
  report.builder_observations[1].content = "摘要而不是完整翻译。";

  const classification = classifyPublishQuality(report, strictPublishOptionsFixture());

  assert(
    classification.blocking_issues.some(
      (issue) =>
        issue.error_code === "builder_translation_gate_failed" &&
        issue.violations.some((violation) => violation.index === 0 && violation.missing.includes("original_text")) &&
        issue.violations.some((violation) => violation.index === 1 && violation.missing.includes("content_matches_translation"))
    )
  );
});

test("publish quality accepts strict daily reports without linked local evidence assets", () => {
  const report = strictPublishReportFixture();
  report.evidence_assets = [
    {
      type: "figure",
      title: "Unlinked fixture evidence",
      source_url: "https://example.com/not-in-report",
      local_path: "assets/evidence/unlinked.png",
      caption: "fixture",
      extraction_status: "source_image"
    }
  ];

  const classification = classifyPublishQuality(report, strictPublishOptionsFixture());

  assert.deepEqual(classification.blocking_issues, []);
  assert(!classification.degraded_sections.some((issue) => issue.error_code === "evidence_assets_gate_failed"));
  assert(!classification.degraded_sections.some((issue) => issue.error_code === "public_media_contract_failed"));
});

test("publish quality degrades strict daily reports when linked local evidence file is missing", () => {
  const report = strictPublishReportFixture();

  const classification = classifyPublishQuality(report, { existingAssetPaths: new Set() });

  assert.deepEqual(classification.blocking_issues, []);
  assert(
    classification.degraded_sections.some(
      (issue) =>
        issue.error_code === "public_media_contract_failed" &&
        issue.violations.some((violation) => violation.reason === "linked_local_evidence_file_missing")
    )
  );
});

test("publish quality degrades strict daily reports whose model releases are not mirrored in main_items", () => {
  const report = strictPublishReportFixture();
  report.model_releases = [
    {
      candidate_id: "strict-model-missing-main",
      name: "Strict Model",
      provider: "Strict AI",
      availability: "closed_api",
      release_scope: "provider_official_launch",
      event_date: report.report_date,
      url: "https://example.com/strict/model-release",
      source: "Strict Model Card",
      summary: "Fixture model release.",
      notes: "fixture",
      importance: "major"
    }
  ];

  const classification = classifyPublishQuality(report, strictPublishOptionsFixture());

  assert.deepEqual(classification.blocking_issues, []);
  assert(classification.degraded_sections.some((issue) => issue.error_code === "model_release_main_item_gate_failed"));
});

test("publish quality keeps strict coverage gate scoped to 2026-06-02 and later", () => {
  const report = strictPublishReportFixture();
  report.report_date = "2026-06-01";
  report.github_trending = [];
  report.builder_observations = [];
  report.evidence_assets = [];
  delete report.self_check.automation_revision;

  const issues = findPublishQualityIssues(report);

  assert(!issues.some((issue) => issue.error_code === "automation_revision_gate_failed"));
  assert(!issues.some((issue) => issue.error_code === "github_trending_top10_gate_failed"));
  assert(!issues.some((issue) => issue.error_code === "builder_x_coverage_gate_failed"));
  assert(!issues.some((issue) => issue.error_code === "evidence_assets_gate_failed"));
});

test("public daily contract accepts no-image short news without explanation fields", () => {
  const report = strictPublishReportFixture();
  report.main_items = report.main_items.map((item, index) => {
    const updated = {
      ...item,
      summary: `第 ${index + 1} 条主体短新闻只保留可回源事实、对象和变化，不输出判断或启示。`,
      bullets: [
        `事实 ${index + 1}：官方页面记录了明确发布时间、对象和变化范围。`,
        `来源 ${index + 1}：原文链接保留，读者可直接打开核对。`
      ]
    };
    delete updated.why_it_matters;
    delete updated.reader_relevance;
    delete updated.watch_next;
    return updated;
  });
  report.evidence_assets = [];

  const classification = classifyPublishQuality(report, strictPublishOptionsFixture());
  const issueCodes = [
    ...classification.blocking_issues,
    ...classification.degraded_sections
  ].flatMap((issue) => [issue.error_code, issue.code].filter(Boolean));

  assert(!issueCodes.includes("editorial_context_gate_failed"));
  assert(!issueCodes.includes("evidence_assets_gate_failed"));
});

test("public daily contract rejects invalid public media but allows missing media", () => {
  const report = strictPublishReportFixture();
  const options = strictPublishOptionsFixture();
  report.evidence_assets = [
    {
      type: "figure",
      title: "Tiny favicon should not be public evidence",
      source_url: report.main_items[0].url,
      local_path: "assets/evidence/tiny-favicon.png",
      caption: "28x28 icon from a source page.",
      extraction_status: "source_image",
      width: 28,
      height: 28,
      byte_size: 398,
      asset_role: "icon"
    },
    {
      type: "figure",
      title: "OpenRouter full page screenshot",
      source_url: report.main_items[1].url,
      local_path: "assets/evidence/openrouter-full-page.png",
      caption: "Full browser page capture.",
      extraction_status: "source_image",
      width: 1280,
      height: 900,
      capture_kind: "full_page_screenshot"
    }
  ];
  options.existingAssetPaths = new Set(report.evidence_assets.map((asset) => asset.local_path));

  const classification = classifyPublishQuality(report, options);

  assert.deepEqual(classification.blocking_issues, []);
  assert(
    classification.degraded_sections.some(
      (issue) =>
        issue.error_code === "public_media_contract_failed" &&
        issue.violations.some((violation) => violation.reason === "image_dimensions_too_small") &&
        issue.violations.some((violation) => violation.reason === "full_page_screenshot_not_public_content")
    )
  );
});

test("public daily contract renders tables instead of screenshots and hides audit appendices", () => {
  const report = strictPublishReportFixture();
  report.daily_tracking = [
    {
      id: "openrouter-rankings",
      name: "OpenRouter",
      url: "https://openrouter.ai/rankings",
      event_date: report.report_date,
      source: "OpenRouter Rankings",
      category: "model_usage",
      importance: "notable",
      source_level: "primary",
      verification_status: "primary_confirmed",
      change_status: "changed",
      publish_to_public: true,
      summary: "OpenRouter 公开榜单解析出 Top 10 模型、供应商、调用量和周变化。",
      metrics: [],
      snapshot: openRouterSnapshotFixture()
    }
  ];
  report.evidence_assets = [
    {
      type: "figure",
      title: "OpenRouter browser screenshot",
      source_url: "https://openrouter.ai/rankings",
      local_path: "assets/evidence/openrouter-browser-shot.png",
      caption: "Browser viewport screenshot should not be the public main content.",
      extraction_status: "source_image",
      width: 1280,
      height: 900,
      capture_kind: "full_page_screenshot"
    },
    {
      type: "figure",
      title: "Tiny source icon",
      source_url: report.hot_blogs[0].url,
      local_path: "assets/evidence/tiny-source-icon.png",
      caption: "28x28 source icon.",
      extraction_status: "source_image",
      width: 28,
      height: 28,
      byte_size: 398,
      asset_role: "icon"
    }
  ];

  const input = reportToInteractionInput(report);
  const tracking = input.sections.find((section) => section.title === "每日追踪");
  const hotBlogs = input.sections.find((section) => section.title === "精选博客更新");
  const serialized = JSON.stringify(input.sections);

  assert(tracking);
  assert.equal(tracking.items[0].media, undefined);
  assert.equal(tracking.items[0].table.rows.length, 10);
  assert(hotBlogs.items.every((item) => !item.media));
  assert(!input.sections.some((section) => ["信源审计", "自检与产物", "发布质量说明"].includes(section.title)));
  assert(!serialized.includes("source_audit"));
  assert(!serialized.includes("候选 / 入选"));
  assert(!serialized.includes("why_it_matters"));
});

test("tracking visual tables render OpenRouter and Artificial Analysis without screenshots", () => {
  const report = strictPublishReportFixture();
  report.daily_tracking = [
    {
      id: "openrouter-rankings",
      name: "OpenRouter",
      url: "https://openrouter.ai/rankings",
      event_date: report.report_date,
      source: "OpenRouter Rankings",
      category: "model_usage",
      importance: "notable",
      source_level: "primary",
      verification_status: "primary_confirmed",
      change_status: "changed",
      publish_to_public: true,
      summary: "OpenRouter parsed Top 10 model usage rows.",
      metrics: [],
      snapshot: openRouterSnapshotFixture()
    },
    {
      id: "artificial-analysis-index",
      name: "Artificial Analysis Intelligence Index",
      url: "https://artificialanalysis.ai/models",
      event_date: report.report_date,
      source: "Artificial Analysis",
      category: "model_eval",
      importance: "notable",
      source_level: "primary",
      verification_status: "primary_confirmed",
      change_status: "changed",
      publish_to_public: true,
      summary: "Artificial Analysis parsed Top 10 intelligence index rows.",
      metrics: [],
      snapshot: artificialAnalysisSnapshotFixture()
    }
  ];
  report.evidence_assets = [
    {
      type: "figure",
      title: "OpenRouter full page screenshot",
      source_url: "https://openrouter.ai/rankings",
      local_path: "assets/evidence/openrouter-full-page.png",
      caption: "Full page screenshot should not be public.",
      extraction_status: "source_image",
      width: 1280,
      height: 900,
      capture_kind: "full_page_screenshot"
    }
  ];

  const input = reportToInteractionInput(report);
  const section = input.sections.find((item) => item.group === "signals" && item.cardClass === "tracking-card");

  assert(section);
  assert.equal(section.items.length, 2);
  assert(section.items.every((item) => item.table?.rows?.length === 10));
  assert(section.items.every((item) => item.media === undefined));
});

test("tracking component snapshot exposes OpenRouter and Artificial Analysis trace data", async () => {
  const report = JSON.parse(await readFixture("reports/good/structured-report.json"));
  report.daily_tracking = [
    {
      id: "openrouter-rankings",
      name: "OpenRouter",
      url: "https://openrouter.ai/rankings",
      event_date: report.report_date,
      source: "OpenRouter Rankings",
      category: "model_usage",
      importance: "notable",
      source_level: "primary",
      verification_status: "primary_confirmed",
      change_status: "changed",
      publish_to_public: true,
      summary: "OpenRouter parsed Top Models and leaderboard rows.",
      watch_points: ["Track Top Models and provider concentration."],
      evidence: "OpenRouter public rankings page parsed successfully.",
      metrics: [],
      snapshot: openRouterSnapshotFixture()
    },
    {
      id: "artificial-analysis-intelligence-index",
      name: "Artificial Analysis",
      url: "https://artificialanalysis.ai/evaluations/artificial-analysis-intelligence-index",
      event_date: report.report_date,
      source: "Artificial Analysis Intelligence Index",
      category: "model_benchmark",
      importance: "notable",
      source_level: "primary",
      verification_status: "primary_confirmed",
      change_status: "changed",
      publish_to_public: true,
      summary: "Artificial Analysis parsed score, token and cost component tabs.",
      watch_points: ["Track Score, Token Usage, Cost and trade-off tabs."],
      evidence: "Artificial Analysis public Intelligence Index page parsed successfully.",
      metrics: [],
      snapshot: artificialAnalysisSnapshotFixture()
    }
  ].map((item) => ({
    ...item,
    tracking_component_snapshot: buildTrackingComponentSnapshot(item)
  }));

  const validation = validateReport(report);
  assert.equal(validation.valid, true, validation.errors?.map((error) => error.message).join("\n"));

  const openRouter = validation.value.daily_tracking.find((item) => item.id === "openrouter-rankings");
  const artificialAnalysis = validation.value.daily_tracking.find((item) => item.id === "artificial-analysis-intelligence-index");
  assert.equal(openRouter.tracking_component_snapshot.component_kind, "openrouter_rankings");
  assert(openRouter.tracking_component_snapshot.tabs.some((tab) => tab.id === "top-models" && tab.view === "stacked_bar"));
  assert(openRouter.tracking_component_snapshot.tabs.some((tab) => tab.id === "leaderboard" && tab.view === "leaderboard"));
  assert.match(openRouter.tracking_component_snapshot.raw_dom_hash, /^sha256:[a-f0-9]{64}$/);
  assert.match(openRouter.tracking_component_snapshot.data_hash, /^sha256:[a-f0-9]{64}$/);
  assert.equal(openRouter.tracking_component_snapshot.public_trace.selector_version, "openrouter-rankings-v1");
  assert(openRouter.tracking_component_snapshot.public_trace.top_rows.some((row) => row.model === "DeepSeek V4 Flash"));
  assert(!JSON.stringify(openRouter.tracking_component_snapshot.public_trace).includes("raw_dom"));

  assert.equal(artificialAnalysis.tracking_component_snapshot.component_kind, "artificial_analysis_index");
  assert.deepEqual(
    artificialAnalysis.tracking_component_snapshot.tabs.map((tab) => tab.id),
    ["score", "token-usage", "cost", "score-vs-token-usage", "score-vs-cost", "score-vs-compute"]
  );
  assert(artificialAnalysis.tracking_component_snapshot.tabs.every((tab) => tab.status === "complete" || tab.fallback_reason));

  const input = reportToInteractionInput(validation.value);
  const trackingSection = input.sections.find((section) => section.cardClass === "tracking-card");
  const openRouterCard = trackingSection.items.find((item) => item.title === "OpenRouter");
  const aaCard = trackingSection.items.find((item) => item.title === "Artificial Analysis");
  assert.equal(openRouterCard.component.kind, "openrouter_rankings");
  assert.equal(openRouterCard.component.tabs.length, 2);
  assert(openRouterCard.component.trace.dataHash.startsWith("sha256:"));
  assert.equal(aaCard.component.kind, "artificial_analysis_index");
  assert.equal(aaCard.component.tabs.length, 6);
  assert(aaCard.component.trace.sourceUrl.includes("artificialanalysis.ai"));
});

test("tracking component snapshots attach deterministically to daily tracking items", () => {
  const report = strictPublishReportFixture();
  report.daily_tracking = [
    {
      id: "openrouter-rankings",
      name: "OpenRouter",
      url: "https://openrouter.ai/rankings",
      event_date: report.report_date,
      source: "OpenRouter Rankings",
      category: "model_usage",
      importance: "notable",
      source_level: "primary",
      verification_status: "primary_confirmed",
      change_status: "changed",
      publish_to_public: true,
      summary: "OpenRouter parsed Top Models and leaderboard rows.",
      watch_points: ["Track top model usage and provider share."],
      evidence: "OpenRouter public page parsed successfully.",
      metrics: [],
      snapshot: openRouterSnapshotFixture()
    }
  ];

  const enriched = attachTrackingComponentSnapshots(report);

  assert.notEqual(enriched, report);
  assert.equal(enriched.daily_tracking[0].tracking_component_snapshot.component_kind, "openrouter_rankings");
  assert.equal(enriched.daily_tracking[0].tracking_component_snapshot.public_trace.top_rows.length, 10);
  assert(!JSON.stringify(enriched.daily_tracking[0].tracking_component_snapshot.public_trace).includes("raw_dom"));
});

test("public daily renders source coverage gaps without internal audit dumps", () => {
  const report = strictPublishReportFixture();
  report.source_audit = sourceAuditFixture();
  report.source_audit.wechat_sources = {
    checked: true,
    candidates_found: 0,
    included: 0,
    notes: "WeChat sources checked; no public item selected.",
    sources: [
      {
        name: "WeChat Platform AI Feed",
        url: "https://example.com/ai-daily-cn/platform/wechat.xml",
        status: "no_signal",
        notes: "kill_switch_enabled"
      },
      {
        name: "RSSHub NewRank WeChat Route",
        url: "https://example.com/rsshub/newrank",
        status: "skipped_missing_base_url",
        notes: "RSSHUB_BASE_URL missing"
      }
    ]
  };
  report.source_audit.zhihu_sources = {
    checked: true,
    candidates_found: 0,
    included: 0,
    notes: "Zhihu sources checked; no public item selected.",
    sources: [
      {
        name: "Zhihu Platform AI Feed",
        url: "https://example.com/ai-daily-cn/platform/zhihu.xml",
        status: "no_signal",
        notes: "kill_switch_enabled"
      }
    ]
  };

  const input = reportToInteractionInput(report);
  const coverageSection = input.sections.find((section) =>
    section.group === "verification" &&
    typeof section.content === "string" &&
    section.content.includes("kill_switch_enabled")
  );
  const serialized = JSON.stringify(input.sections);

  assert(coverageSection, "public coverage summary should mention WeChat/Zhihu source gaps");
  assert(coverageSection.content.includes("WeChat Platform AI Feed"));
  assert(coverageSection.content.includes("Zhihu Platform AI Feed"));
  assert(coverageSection.content.includes("skipped_missing_base_url"));
  assert(!serialized.includes("source_audit"));
  assert(!serialized.includes("candidate_pool"));
  assert(!serialized.includes("Source status"));
  assert(!serialized.includes("candidate counts"));
});

test("public source coverage visualization uses tags and collapsed details", () => {
  const report = strictPublishReportFixture();
  report.source_audit.china_ai_sources.sources[1].status = "no_signal";
  report.source_audit.china_ai_sources.sources[2].status = "blocked";
  report.source_audit.china_ai_sources.sources[2].notes = "HTTP 403";

  const input = reportToInteractionInput(report);
  const coverageSection = input.sections.find((section) =>
    section.group === "verification" &&
    typeof section.content === "string" &&
    section.content.includes("China AI official sources")
  );

  assert(coverageSection);
  assert.match(coverageSection.content, /<details><summary>/);
  assert.match(coverageSection.content, /tag-status-checked/);
  assert.match(coverageSection.content, /tag-status-no-signal/);
  assert.match(coverageSection.content, /tag-status-blocked/);
  assert.match(coverageSection.content, /Tencent Newsroom CN/);
  assert(!coverageSection.content.includes("candidate_pool"));
  assert(!coverageSection.content.includes("selection_snapshot"));
});

test("public daily contract renders main items as industry and content-track streams", () => {
  const report = strictPublishReportFixture();
  const categories = [
    "ai_industry",
    "company_business",
    "product_radar",
    "open_source",
    "content_aigc"
  ];
  report.main_items = report.main_items.map((item, index) => ({
    ...item,
    editorial_category: categories[index % categories.length],
    summary: `Main short news item ${index + 1} keeps source-grounded facts only.`,
    bullets: [
      `Fact line ${index + 1}: the source states the object and change.`,
      `Source line ${index + 1}: the original URL remains attached.`
    ]
  }));

  const input = reportToInteractionInput(report);
  const mainSections = input.sections.filter((section) => section.group === "main" && section.type === "markdown");
  const content = mainSections.map((section) => section.content || "").join("\n");

  assert.equal(mainSections.length, 2);
  assert.deepEqual(mainSections.map((section) => section.title), ["AI 行业动态", "内容赛道动态"]);
  assert(content.includes("1. **["));
  assert(content.includes(`${report.main_items.length}. **[`));
  for (const item of report.main_items) {
    assert(content.includes(item.title));
  }
  assert(!input.sections.some((section) => ["AI 资讯", "大厂与政策", "产品与开源", "AIGC 动态"].includes(section.title)));
});

test("public daily contract replays 2026-06-09 bad media and short-main regression", async () => {
  const fixture = JSON.parse(await readFixture("reports/bad/public-daily-2026-06-09-regression.json"));
  const report = strictPublishReportFixture();
  report.report_date = fixture.report_date;
  report.title = `AI Daily ${fixture.report_date} bad regression replay`;
  report.main_items = report.main_items.slice(0, fixture.main_item_count);
  report.self_check.report_date = fixture.report_date;
  report.self_check.main_items = report.main_items.length;
  report.daily_tracking = fixture.daily_tracking.map((item) => ({
    ...item,
    snapshot: item.snapshot_fixture === "openrouter_top_10" ? openRouterSnapshotFixture() : undefined
  }));
  report.hot_blogs[0].url = fixture.evidence_assets.find((asset) => asset.asset_role === "icon").source_url;
  report.evidence_assets = fixture.evidence_assets;

  const options = strictPublishOptionsFixture();
  options.existingAssetPaths = new Set(fixture.evidence_assets.map((asset) => asset.local_path));
  const classification = classifyPublishQuality(report, options);
  const issueCodes = [
    ...classification.blocking_issues,
    ...classification.degraded_sections
  ].flatMap((issue) => [issue.error_code, issue.code].filter(Boolean));
  const mediaIssue = classification.degraded_sections.find((issue) => issue.error_code === "public_media_contract_failed");

  assert(issueCodes.includes("main_items_below_strict_minimum"), JSON.stringify(issueCodes));
  assert(mediaIssue);
  assert(mediaIssue.violations.some((violation) => violation.reason === "full_page_screenshot_not_public_content"));
  assert(mediaIssue.violations.some((violation) => violation.reason === "non_content_image_asset"));

  const input = reportToInteractionInput(report);
  const openRouterCard = input.sections
    .flatMap((section) => section.items || [])
    .find((item) => item.title === "OpenRouter");
  const serialized = JSON.stringify(input.sections);

  assert(openRouterCard);
  assert.equal(openRouterCard.media, undefined);
  assert.equal(openRouterCard.table.rows.length, 10);
  assert(!serialized.includes("source_audit"));
  assert(!serialized.includes("why_it_matters"));
  assert(!serialized.includes("full-page browser screenshot"));
  assert(!serialized.includes("28x28 source icon"));
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
  assert(report.quality_status.degraded_sections.some((issue) => issue.section === "hot_blogs"));
  assert.match(report.quality_status.public_note, /Content source/);
});

test("quality status degrades when a fixed daily tracking source is unverified", () => {
  const report = {
    report_date: "2026-05-01",
    main_items: [],
    github_trending: [],
    hot_blogs: [],
    projects: [],
    builder_observations: [],
    daily_tracking: [
      {
        id: "swe-bench-pro",
        name: "SWE-bench Pro",
        verification_status: "unverified",
        verification_note: "本轮固定入口抓取受阻：HTTP 403。"
      }
    ],
    source_audit: {
      content_sources: {
        sources: [
          {
            name: "Scale Labs SWE-Bench Pro",
            status: "blocked",
            notes: "HTTP 403"
          }
        ]
      }
    }
  };

  const status = deriveQualityStatus(report);

  assert.equal(status.status, "degraded");
  assert(status.reasons.includes("daily_tracking_source_blocked"));
  assert(status.affected_sections.includes("daily_tracking"));
  assert(status.degraded_sections.some((issue) => issue.section === "daily_tracking"));
});

test("report:write includes public network guidance for discovery outages", async () => {
  const draft = JSON.parse(await readFixture("reports/good/structured-draft.json"));
  const candidatePool = JSON.parse(await readFixture("reports/good/structured-draft.candidates.json"));
  draft.report_date = "2026-06-02";
  draft.self_check.report_date = "2026-06-02";
  for (const groupName of ["github_trending", "builder_sources", "content_sources", "search_sources", "sources_health"]) {
    const group = draft.source_audit[groupName];
    if (!group) {
      continue;
    }
    group.sources = Array.from({ length: 5 }, (_unused, index) => ({
      ...(group.sources[index % group.sources.length] || {}),
      name: `${groupName} blocked ${index + 1}`,
      url: `https://example.com/${groupName}/${index + 1}`,
      status: "blocked",
      notes: "fetch failed; retry_failed_after_1"
    }));
    group.candidates_found = 0;
    group.included = 0;
    group.blocked_reason = "fetch_failed";
  }

  const report = normalizeReportDraft(draft, {
    siteUrl,
    generatedAt: fixedGeneratedAt,
    candidatePool,
    automationRevision: strictAutomationRevisionFixture()
  });

  assert.equal(report.quality_status.status, "degraded");
  assert(report.quality_status.reasons.includes("source_discovery_network_unavailable"));
  assert.match(report.quality_status.public_note, /config\.toml/);
  assert.match(report.quality_status.public_note, /workspace-write/);
  assert(
    report.quality_status.degraded_sections.some(
      (issue) => issue.code === "source_discovery_network_unavailable" && issue.section === "source_audit"
    )
  );

  const input = reportToInteractionInput(report, { includeInternalSections: true });
  const qualitySection = input.sections.find((section) => section.title.includes("质量") || section.title.includes("Quality"));
  assert(qualitySection);
  assert.match(qualitySection.content, /config\.toml/);
  assert.match(qualitySection.content, /workspace-write/);
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
  draft.source_audit.content_sources.candidates_found = 6;
  draft.source_audit.content_sources.included = 0;
  candidatePool.sources.push({
    id: "content-hot-blog-source",
    name: "Content Blog Source",
    url: "https://example.com/blog-feed.xml",
    category: "blog",
    status: "checked"
  });
  for (const index of [1, 2, 3, 4, 5, 6]) {
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
  assert(report.quality_status.degraded_sections.some((issue) => issue.code === "hot_blogs_selection_degraded"));
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

test("report:write rejects GitHub Trending descriptions copied in English", async () => {
  const draft = JSON.parse(await readFixture("reports/good/structured-draft.json"));
  const candidatePool = JSON.parse(await readFixture("reports/good/structured-draft.candidates.json"));
  const trendUrl = "https://github.com/example/agent-workflows";

  draft.github_trending = [
    {
      candidate_id: "github-trending-english-description",
      name: "example/agent-workflows",
      repo: "example/agent-workflows",
      description: "A reusable plugin set for agent workflows.",
      url: trendUrl,
      event_date: "2026-05-16",
      source: "GitHub Trending daily",
      language: "TypeScript",
      window: "daily",
      rank: 1,
      trend: "new",
      evidence: "GitHub Trending daily fixture."
    }
  ];
  draft.source_audit.github_trending.candidates_found = 1;
  draft.source_audit.github_trending.included = 1;
  candidatePool.sources.push({
    id: "github-trending-daily",
    name: "GitHub Trending daily",
    url: "https://github.com/trending?since=daily",
    category: "github_trending",
    status: "checked"
  });
  candidatePool.candidates.push({
    id: "github-trending-english-description",
    source_id: "github-trending-daily",
    category: "github_trending",
    title: "example/agent-workflows",
    url: trendUrl,
    source: "GitHub Trending daily",
    event_date: "2026-05-16",
    status: "included",
    included_in: "github_trending",
    evidence: "fixture"
  });

  assertPublisherCode(
    () =>
      normalizeReportDraft(draft, {
        siteUrl,
        generatedAt: fixedGeneratedAt,
        candidatePool
      }),
    "github_trending_description_not_chinese"
  );

  draft.github_trending[0].description = "面向 agent 工作流的可复用插件集合，用于打包研究、写作和交付流程。";
  const report = normalizeReportDraft(draft, {
    siteUrl,
    generatedAt: fixedGeneratedAt,
    candidatePool
  });
  assert.equal(report.github_trending[0].description, draft.github_trending[0].description);
});

test("report:write rejects expanded main items with templated prose or thin detail", async () => {
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
        "==影响==：它影响开发者和产品团队能否直接复用官方代码、模型权重、示例或社区生态。"
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

test("report:write accepts expanded main items with three compact factual bullets", async () => {
  const draft = JSON.parse(await readFixture("reports/good/structured-draft.json"));
  const candidatePool = JSON.parse(await readFixture("reports/good/structured-draft.candidates.json"));
  const baseItem = draft.main_items[0];
  const baseCandidate = candidatePool.candidates[0];

  draft.main_items = Array.from({ length: 8 }, (_unused, index) => {
    const id = `main-two-bullets-${index + 1}`;
    const url = `https://example.com/main-two-bullets-${index + 1}`;
    return {
      ...baseItem,
      candidate_id: id,
      title: `${baseItem.title} ${index + 1}`,
      url,
      bullets: [
        `**Fixture ${index + 1}** confirms a concrete product or platform update for readers.`,
        `==keyword-notable|边界== ${index + 1}：这条信息说明接入方式、可用范围或限制条件。`,
        `**Fixture ${index + 1} detail** records another factual line about availability, pricing, benchmark, or deployment scope.`
      ]
    };
  });
  draft.hero_highlights = draft.main_items.slice(0, 3).map((item, index) => ({
    title: item.title,
    url: item.url,
    reason: `Fixture ${index + 1} changes a concrete reader decision surface.`,
    what_happened: `Fixture ${index + 1} is a concrete product or platform update.`,
    why_watch: `It helps readers decide whether to track availability, pricing, benchmark, or deployment scope.`,
    category: index === 0 ? "model_platform" : index === 1 ? "product_tool" : "business_policy",
    source_item_ref: item.candidate_id
  }));
  candidatePool.candidates = draft.main_items.map((item, index) => ({
    ...baseCandidate,
    id: item.candidate_id,
    title: item.title,
    url: item.url,
    event_date: item.event_date,
    evidence: `fixture two bullets ${index + 1}`
  }));
  draft.evidence_assets = [];

  const report = normalizeReportDraft(draft, {
    siteUrl,
    generatedAt: fixedGeneratedAt,
    candidatePool
  });

  assert.equal(report.main_items.length, 8);
  assert.equal(report.quality_status.status, "ok");
});

test("report:write marks thin main_items degraded when enough main candidates exist", async () => {
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

  const report = normalizeReportDraft(draft, {
    siteUrl,
    generatedAt: fixedGeneratedAt,
    candidatePool
  });

  assert.equal(report.quality_status.status, "degraded");
  assert(report.quality_status.degraded_sections.some((issue) => issue.section === "main_items"));
});

test("report:write marks low content unit density degraded when enough candidates exist", async () => {
  const draft = JSON.parse(await readFixture("reports/good/structured-draft.json"));
  const candidatePool = JSON.parse(await readFixture("reports/good/structured-draft.candidates.json"));
  const baseCandidate = candidatePool.candidates[0];

  for (let index = 1; index <= 45; index += 1) {
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

  const report = normalizeReportDraft(draft, {
    siteUrl,
    generatedAt: fixedGeneratedAt,
    candidatePool
  });

  assert.equal(report.quality_status.status, "degraded");
  assert(report.quality_status.reasons.includes("content_units_selection_degraded"));
  assert(report.quality_status.degraded_sections.some((issue) => issue.section === "content_units"));
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

test("report:write allows disclosed intermediary leads in viewpoint sections", async () => {
  const draft = JSON.parse(await readFixture("reports/good/structured-draft.json"));
  const candidatePool = JSON.parse(await readFixture("reports/good/structured-draft.candidates.json"));
  const hotBlogUrl = "https://example.com/blog/intermediary-agent-platforms";
  draft.hot_blogs = [
    {
      candidate_id: "hot-blog-intermediary",
      title: "Agent platform lessons from an industry roundup",
      url: hotBlogUrl,
      publisher: "Industry Roundup",
      author: "Analyst",
      event_date: "2026-05-16",
      topic: "agent platforms",
      summary: "A useful viewpoint lead about agent platform adoption patterns.",
      source_level: "intermediary",
      verification_status: "intermediary_only",
      verification_note: "行业媒体整理，作为观点线索收录，不写入事实主线。",
      risk_note: "产品发布事实仍需回到官方公告或仓库确认。",
      reader_relevance: "帮助普通工程师判断 agent 平台能力和迁移成本。"
    }
  ];
  draft.source_audit.content_sources.candidates_found = 1;
  draft.source_audit.content_sources.included = 1;
  candidatePool.sources.push({
    id: "industry-roundup-source",
    name: "Industry Roundup",
    url: "https://example.com/blog",
    category: "blog",
    status: "checked",
    source_level: "intermediary"
  });
  candidatePool.candidates.push({
    id: "hot-blog-intermediary",
    source_id: "industry-roundup-source",
    category: "hot_blog",
    title: "Agent platform lessons from an industry roundup",
    url: hotBlogUrl,
    source: "Industry Roundup",
    event_date: "2026-05-16",
    status: "included",
    included_in: "hot_blogs",
    intermediary_url: hotBlogUrl,
    verification_status: "intermediary_only",
    verification_sources: [],
    source_level: "intermediary",
    verification_note: "行业媒体整理，作为观点线索收录，不写入事实主线。",
    risk_note: "产品发布事实仍需回到官方公告或仓库确认。",
    reader_relevance: "帮助普通工程师判断 agent 平台能力和迁移成本。"
  });

  const report = normalizeReportDraft(draft, {
    siteUrl,
    generatedAt: fixedGeneratedAt,
    candidatePool
  });

  assert.equal(report.hot_blogs[0].candidate_id, "hot-blog-intermediary");
  assert.equal(report.hot_blogs[0].source_level, "intermediary");
  assert(!("verification_note" in report.hot_blogs[0]));
  assert(!("risk_note" in report.hot_blogs[0]));
});

test("icon resolver uses link domain icons and records fallback metadata", () => {
  const githubIcon = resolveLinkIcon("https://github.com/openai/codex", { label: "openai/codex" });
  assert.equal(githubIcon.host, "github.com");
  assert.equal(githubIcon.key, "github.com");
  assert.equal(githubIcon.fallback, false);
  assert.equal(githubIcon.reason, "github_unified_icon");
  assert.equal(githubIcon.icon, CACHED_DOMAIN_ICONS["github.com"]);

  const qbitaiIcon = resolveLinkIcon("https://www.qbitai.com/2026/06/example", { label: "QbitAI" });
  assert.equal(qbitaiIcon.host, "qbitai.com");
  assert.equal(qbitaiIcon.fallback, false);
  assert.equal(qbitaiIcon.icon, CACHED_DOMAIN_ICONS["qbitai.com"]);

  const generated = resolveLinkIcon("https://unknown-icon-test.invalid/post", {
    label: "Unknown Icon Test",
    allowGeneratedFallback: true
  });
  assert.equal(generated.host, "unknown-icon-test.invalid");
  assert.equal(generated.fallback, true);
  assert.equal(generated.reason, "generated_initials_fallback");
  assert.match(generated.icon, /^data:image\/svg\+xml/);
});

test("GitHub Trending enriches descriptions from cached README summaries", () => {
  const repo = "example/agent-workbench";
  const sha = "0123456789abcdef";
  const key = githubReadmeCacheKey({ repo, defaultBranch: "main", sha });
  assert.equal(key, "github-readme/example/agent-workbench/main/0123456789abcdef");

  const summary = summarizeGithubReadme({
    repo,
    readme: [
      "# Agent Workbench",
      "",
      "Agent Workbench is a local-first workspace for building, evaluating, and debugging AI agents.",
      "It includes task runners, browser tools, memory inspection, replayable traces, and adapters for common LLM APIs.",
      "The project ships TypeScript packages, example agents, and CI fixtures for production evaluation."
    ].join("\n"),
    maxChars: 120
  });
  assert(summary.length >= 80, summary);
  assert(summary.length <= 130, summary);
  assert.match(summary, /Agent Workbench|agent|工作区|评测|调试/);

  const item = applyGithubReadmeSummary(
    {
      repo,
      description: "short description",
      url: `https://github.com/${repo}`
    },
    {
      summary,
      sha,
      defaultBranch: "main",
      cacheKey: key,
      sourceUrl: `https://raw.githubusercontent.com/${repo}/main/README.md`
    }
  );
  assert.equal(item.description, summary);
  assert.equal(item.readme_summary, summary);
  assert.equal(item.readme_cache.key, key);
  assert.equal(item.readme_cache.hit, true);
  assert.equal(item.readme_cache.sha, sha);
});

test("Chinese media dynamics include all in-window QbitAI SSPAI and Machine Heart entries", () => {
  const reportDate = "2026-06-12";
  const result = selectChineseMediaDynamics(
    [
      {
        id: "qbitai-1",
        source_id: "intermediary-qbitai",
        source: "QbitAI",
        title: "量子位报道多模态 Agent 在工业质检落地",
        url: "https://www.qbitai.com/2026/06/agent-quality",
        event_date: reportDate,
        category: "community_lead",
        evidence: "文章梳理了工业质检场景里多模态 Agent 的部署方式、人工复核比例和失败样例。"
      },
      {
        id: "sspai-1",
        source_id: "intermediary-sspai",
        source: "SSPAI",
        title: "少数派体验本地知识库助手的真实工作流",
        url: "https://sspai.com/post/100001",
        event_date: reportDate,
        category: "community_lead",
        evidence: "作者记录了从资料导入、语义检索、摘要生成到移动端同步的完整使用体验。"
      },
      {
        id: "jiqizhixin-1",
        source_id: "intermediary-jiqizhixin",
        source: "Jiqizhixin",
        title: "机器之心整理开源推理框架的新一轮优化",
        url: "https://www.jiqizhixin.com/articles/2026-06-12",
        event_date: reportDate,
        category: "community_lead",
        evidence: "报道比较了连续批处理、KV cache 管理、显存占用和多卡调度的工程差异。"
      },
      {
        id: "old-qbitai",
        source_id: "intermediary-qbitai",
        source: "QbitAI",
        title: "旧文章不应进入今日动态",
        url: "https://www.qbitai.com/2026/06/old",
        event_date: "2026-06-09",
        category: "community_lead"
      }
    ],
    {
      reportDate,
      sourceAudit: {
        content_sources: {
          sources: [
            {
              id: "intermediary-jiqizhixin",
              name: "Jiqizhixin",
              url: "https://www.jiqizhixin.com/articles",
              status: "checked",
              notes: "HTML adapter parsed 1 article"
            }
          ]
        }
      }
    }
  );

  assert.equal(result.items.length, 3);
  assert.deepEqual(result.items.map((item) => item.candidate_id), ["qbitai-1", "sspai-1", "jiqizhixin-1"]);
  for (const item of result.items) {
    assert(item.summary.length >= 120, item.summary);
    assert(item.summary.length <= 260, item.summary);
    assert.equal(item.source_level, "intermediary");
    assert.equal(item.verification_status, "intermediary_only");
  }
  assert.equal(result.source_statuses.find((item) => item.source_key === "jiqizhixin").status, "checked");
});

test("official organization update summaries strip internal review and English excerpts", () => {
  const item = officialOrgUpdateItem({
    id: "official-openai-preply",
    source: "OpenAI News RSS",
    source_level: "official_company_news",
    title: "How Preply combines AI and human tutors to personalize learning",
    url: "https://openai.com/index/preply",
    event_date: "2026-06-12",
    summary: "Preply uses OpenAI to launch AI-generated lesson summaries, providing personalised feedback and language learning exercises. Treat this as a community lead unless it is backed by a primary source."
  });

  assert.match(item.summary, /Preply/);
  assert.match(item.summary, /真人教师|个性化语言学习/);
  assert.doesNotMatch(item.summary, /Treat this as a community lead|unless it is backed|AI-generated lesson summaries/);
});

test("unconfigured WeChat and Zhihu sources degrade without blocking publish", () => {
  const report = strictPublishReportFixture();
  report.wechat_items = [];
  report.zhihu_items = [];
  report.source_audit.wechat_sources = {
    checked: true,
    sources: [
      {
        id: "wechat-placeholder",
        name: "WeChat placeholder",
        url: "https://example.com/wechat-placeholder.xml",
        status: "skipped_missing_base_url",
        notes: "No real WeChat entrypoint configured; public report must disclose degraded status."
      }
    ],
    candidates_found: 0,
    included: 0
  };
  report.source_audit.zhihu_sources = {
    checked: true,
    sources: [
      {
        id: "zhihu-placeholder",
        name: "Zhihu placeholder",
        url: "https://example.com/zhihu-placeholder.xml",
        status: "skipped_missing_base_url",
        notes: "No real Zhihu entrypoint configured; public report must disclose degraded status."
      }
    ],
    candidates_found: 0,
    included: 0
  };

  const status = deriveQualityStatus(report);
  assert.equal(status.status, "degraded");
  assert(status.reasons.includes("wechat_sources_blocked"));
  assert(status.reasons.includes("zhihu_sources_blocked"));
  assert.equal(status.blocking_issues.length, 0);
});

test("official organization updates render separately from Builder observations", () => {
  const selected = selectOfficialOrgUpdates(
    [
      {
        id: "openai-news-1",
        source_id: "content-openai-news",
        source: "OpenAI News RSS",
        source_level: "official_company_news",
        title: "OpenAI updates enterprise admin controls",
        url: "https://openai.com/news/enterprise-admin-controls",
        event_date: "2026-06-12",
        evidence: "OpenAI says enterprise admins now get more granular policy and observability controls for AI deployments."
      },
      {
        id: "builder-x-1",
        source_id: "follow-builders-x",
        source: "follow-builders X feed",
        source_level: "original_social",
        title: "Builder comment about enterprise AI",
        url: "https://x.com/example/status/1",
        event_date: "2026-06-12",
        evidence: "A builder comments on enterprise AI adoption."
      }
    ],
    { reportDate: "2026-06-12" }
  );
  assert.equal(selected.length, 1);
  assert.equal(selected[0].candidate_id, "openai-news-1");
  assert.equal(selected[0].organization, "OpenAI");

  const report = strictPublishReportFixture();
  report.official_org_updates = selected;
  report.builder_observations = [];
  const input = reportToInteractionInput(report);
  const rendered = JSON.stringify(input);
  assert(rendered.includes("官方组织动态"));
  assert(rendered.includes("OpenAI updates enterprise admin controls"));
  assert(!rendered.includes("Builder comment about enterprise AI"));
});

test("platform exempt report sections require public audit disclosure and render independently", async () => {
  const draft = JSON.parse(await readFixture("reports/good/structured-draft.json"));
  const candidatePool = JSON.parse(await readFixture("reports/good/structured-draft.candidates.json"));
  const platformUrl = "https://www.zhihu.com/question/123/answer/456";
  draft.zhihu_items = [
    {
      candidate_id: "zhihu-platform-signal",
      platform: "zhihu",
      source_id: "zhihu-ai-agent-feed",
      rule_id: "zhihu-ai-agent-feed",
      title: "知乎讨论提到企业 agent 部署门槛",
      url: platformUrl,
      event_date: "2026-05-16",
      source: "Zhihu AI Agent Feed",
      source_level: "platform_exempt_signal",
      verification_status: "platform_exempt_unverified",
      claim_text: "平台线索显示，原帖称企业 agent 部署仍主要卡在权限、评测和回滚流程。",
      why_watch: "适合作为产品和工程团队观察国内用户讨论的弱信号。",
      disclosure: "平台扩散发现，未做一手回源核验。",
      matched_terms: ["agent", "评测"],
      exemption_policy: "platform_signal_exempt",
      published_by_gate: "deterministic_platform_gate"
    }
  ];
  draft.source_audit.zhihu_sources = platformAuditGroupFixture("Zhihu AI Agent Feed", "https://www.zhihu.com/rss", 1, 1);
  candidatePool.sources.push(platformCandidateSourceFixture("zhihu-ai-agent-feed", "Zhihu AI Agent Feed", "https://www.zhihu.com/rss", "zhihu"));
  candidatePool.candidates.push(platformCandidateFixture({
    id: "zhihu-platform-signal",
    sourceId: "zhihu-ai-agent-feed",
    category: "zhihu_item",
    includedIn: "zhihu_items",
    platform: "zhihu",
    title: "知乎讨论提到企业 agent 部署门槛",
    url: platformUrl
  }));

  const report = normalizeReportDraft(draft, {
    siteUrl,
    generatedAt: fixedGeneratedAt,
    candidatePool
  });
  report.reddit_items = [
    {
      platform: "reddit",
      source_id: "platform-reddit-local-llama-feed",
      rule_id: "platform-reddit-local-llama-feed",
      title: "Reddit LocalLLaMA Platform Feed 发布了一条 AI 相关更新，原文标题为“Xiaomi just claimed 1,000+ tps on a 1T model using a standard 8-GPU...”",
      url: "https://www.reddit.com/r/LocalLLaMA/comments/1u0buhm/xiaomi_just_claimed_1000_tps_on_a_1t_model_using/",
      event_date: "2026-06-08",
      source: "Reddit LocalLLaMA Platform Feed",
      source_level: "platform_exempt_signal",
      verification_status: "platform_exempt_unverified",
      claim_text: "Just saw Xiaomi MiMo announce MiMo-V2.5-Pro UltraSpeed, claiming they broke the 1,000 tokens/sec output barrier on a 1 trillion parameter MoE model. Crazy if true.",
      why_watch: "This is a platform discussion weak signal.",
      disclosure: "平台内扩散发现，未做一手回源核验。",
      matched_terms: ["AI", "model"]
    }
  ];
  const input = reportToInteractionInput(report);
  const renderedText = JSON.stringify(input);

  assert.equal(report.zhihu_items[0].source_id, "zhihu-ai-agent-feed");
  assert.equal(report.zhihu_items[0].rule_id, "zhihu-ai-agent-feed");
  assert.equal(report.quality_status.status, "ok");
  assert(renderedText.includes("知乎线索"));
  assert(renderedText.includes("未做一手回源核验"));
  assert(renderedText.includes("Reddit 讨论小米 1T MoE 模型 1000+ tokens/sec 声称"));
  assert(renderedText.includes("标准 8-GPU 节点"));
  assert(!renderedText.includes("source_id"));
  assert(!renderedText.includes("rule_id"));
  assert(!renderedText.includes("verification_status"));
  assert(!renderedText.includes("matched_terms"));
  assert(!renderedText.includes("观察理由"));
  assert(!renderedText.includes("zhihu-ai-agent-feed"));
  assert(!renderedText.includes("Reddit LocalLLaMA Platform Feed 发布了一条 AI 相关更新"));
  assert(!renderedText.includes("Crazy if true"));
});

test("platform exempt report rejects fact-style claims and wrong section placement", async () => {
  const draft = JSON.parse(await readFixture("reports/good/structured-draft.json"));
  const candidatePool = JSON.parse(await readFixture("reports/good/structured-draft.candidates.json"));
  const platformUrl = "https://www.reddit.com/r/MachineLearning/comments/example/agent_eval/";
  const item = {
    candidate_id: "reddit-platform-signal",
    platform: "reddit",
    source_id: "reddit-ml-feed",
    rule_id: "reddit-ml-feed",
    title: "Reddit thread on agent evaluation",
    url: platformUrl,
    event_date: "2026-05-16",
    source: "Reddit r/MachineLearning",
    source_level: "platform_exempt_signal",
    verification_status: "platform_exempt_unverified",
    claim_text: "OpenAI 发布了新的 agent evaluation product.",
    why_watch: "A discussion signal for evaluation workflows.",
    disclosure: "Platform discovery signal; no primary-source verification.",
    matched_terms: ["agent", "evaluation"],
    exemption_policy: "platform_signal_exempt",
    published_by_gate: "deterministic_platform_gate"
  };
  draft.reddit_items = [item];
  draft.source_audit.reddit_sources = platformAuditGroupFixture("Reddit r/MachineLearning", "https://www.reddit.com/r/MachineLearning/.rss", 1, 1);
  candidatePool.sources.push(platformCandidateSourceFixture("reddit-ml-feed", "Reddit r/MachineLearning", "https://www.reddit.com/r/MachineLearning/.rss", "reddit"));
  candidatePool.candidates.push(platformCandidateFixture({
    id: "reddit-platform-signal",
    sourceId: "reddit-ml-feed",
    category: "reddit_item",
    includedIn: "reddit_items",
    platform: "reddit",
    title: item.title,
    url: platformUrl
  }));

  assertPublisherCode(
    () =>
      normalizeReportDraft(draft, {
        siteUrl,
        generatedAt: fixedGeneratedAt,
        candidatePool
      }),
    "platform_exempt_claim_too_strong"
  );

  draft.reddit_items[0].claim_text = "Reddit 讨论称，开发者仍在寻找更可靠的 agent evaluation workflow.";
  draft.reddit_items[0].url = "https://example.com/not-reddit";
  candidatePool.candidates.at(-1).url = "https://example.com/not-reddit";
  assertPublisherCode(
    () =>
      normalizeReportDraft(draft, {
        siteUrl,
        generatedAt: fixedGeneratedAt,
        candidatePool
      }),
    "platform_exempt_url_mismatch"
  );

  draft.reddit_items[0].url = platformUrl;
  candidatePool.candidates.at(-1).url = platformUrl;
  candidatePool.candidates.at(-1).included_in = "main_items";
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

test("platform exempt discovery applies deterministic source rules", async () => {
  const collected = await collectContentSources({
    reportDate: "2026-05-16",
    generatedAt: fixedGeneratedAt,
    includeWeChatInput: false,
    platformExempt: "wechat",
    sources: [
      {
        id: "wechat-ai-feed",
        name: "WeChat AI Feed",
        url: "https://example.com/wechat.xml",
        source_kind: "rss",
        candidate_category: "wechat_item",
        tier: "T3",
        authority: "community",
        enablement: "optional",
        verification_policy: "platform_signal_exempt",
        platform: "wechat",
        allowed_hosts: ["mp.weixin.qq.com"],
        allowed_url_patterns: ["^https://mp\\.weixin\\.qq\\.com/"],
        include_keywords: ["agent", "AI"],
        exclude_keywords: ["广告"],
        public_disclosure_label: "平台扩散发现，未做一手回源核验。",
        max_items_per_run: 3
      }
    ],
    fetchImpl: async () => textResponse([
      "<?xml version=\"1.0\"?><rss><channel>",
      "<item><title>AI agent 工程复盘</title><link>https://mp.weixin.qq.com/s/demo</link><pubDate>Sat, 16 May 2026 02:00:00 GMT</pubDate><description>原帖称 AI agent 工程复盘关注评测和回滚。</description></item>",
      "<item><title>广告：AI agent 课程</title><link>https://mp.weixin.qq.com/s/ad</link><pubDate>Sat, 16 May 2026 02:00:00 GMT</pubDate><description>广告内容。</description></item>",
      "</channel></rss>"
    ].join(""))
  });

  assert.equal(collected.candidates.length, 1);
  assert.equal(collected.candidates[0].category, "wechat_item");
  assert.equal(collected.candidates[0].included_in, "wechat_items");
  assert.equal(collected.candidates[0].platform, "wechat");
  assert.equal(collected.candidates[0].rule_id, "wechat-ai-feed");
  assert.equal(collected.source_audit.wechat_sources.candidates_found, 1);
  assert.equal(collected.source_audit.wechat_sources.included, 0);
});

test("report:draft publishes platform exempt candidates into independent sections", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-platform-draft-"));
  const reportDate = "2026-05-26";
  const discoveryPath = path.join(tmp, "discovery.json");
  const discovery = autodraftDiscoveryFixture(reportDate);
  const platformUrl = "https://www.zhihu.com/question/123/answer/456";
  discovery.source_audit.zhihu_sources = platformAuditGroupFixture("Zhihu AI Agent Feed", "https://www.zhihu.com/rss", 1, 0);
  discovery.sources.push(platformCandidateSourceFixture("zhihu-ai-agent-feed", "Zhihu AI Agent Feed", "https://www.zhihu.com/rss", "zhihu"));
  discovery.candidates.push(platformCandidateFixture({
    id: "zhihu-platform-draft-signal",
    sourceId: "zhihu-ai-agent-feed",
    category: "zhihu_item",
    includedIn: "zhihu_items",
    platform: "zhihu",
    title: "知乎讨论提到企业 agent 部署门槛",
    url: platformUrl
  }));
  await fs.writeFile(discoveryPath, `${JSON.stringify(discovery, null, 2)}\n`, "utf8");

  const drafted = await generateReportDraft({
    rootDir: tmp,
    reportDate,
    generatedAt: fixedGeneratedAt,
    inputPaths: [discoveryPath],
    cacheEvidence: false
  });

  assert.equal(drafted.report.zhihu_items.length, 1);
  assert.equal(drafted.report.zhihu_items[0].candidate_id, "zhihu-platform-draft-signal");
  assert.equal(drafted.report.zhihu_items[0].verification_status, "platform_exempt_unverified");
  assert.equal(drafted.report.zhihu_items[0].risk_label, "medium");
  const normalized = normalizeReportDraft(drafted.report, {
    siteUrl,
    generatedAt: fixedGeneratedAt,
    candidatePool: drafted.candidatePool
  });
  assert.equal(validateReport(normalized).valid, true, JSON.stringify(validateReport(normalized).errors));
  assert.equal(drafted.report.source_audit.zhihu_sources.included, 1);
  assert(!drafted.report.main_items.some((item) => item.candidate_id === "zhihu-platform-draft-signal"));
  assert(drafted.candidatePool.candidates.some((candidate) =>
    candidate.id === "zhihu-platform-draft-signal" &&
    candidate.status === "included" &&
    candidate.included_in === "zhihu_items"
  ));
});

test("report:write rejects undisclosed intermediary leads in viewpoint sections", async () => {
  const draft = JSON.parse(await readFixture("reports/good/structured-draft.json"));
  const candidatePool = JSON.parse(await readFixture("reports/good/structured-draft.candidates.json"));
  const hotBlogUrl = "https://example.com/blog/undisclosed-roundup";
  draft.hot_blogs = [
    {
      candidate_id: "hot-blog-undisclosed",
      title: "Undisclosed intermediary roundup",
      url: hotBlogUrl,
      publisher: "Industry Roundup",
      author: "Analyst",
      event_date: "2026-05-16",
      topic: "agent platforms",
      summary: "A useful viewpoint lead without the required disclosure fields."
    }
  ];
  candidatePool.sources.push({
    id: "undisclosed-roundup-source",
    name: "Industry Roundup",
    url: "https://example.com/blog",
    category: "blog",
    status: "checked"
  });
  candidatePool.candidates.push({
    id: "hot-blog-undisclosed",
    source_id: "undisclosed-roundup-source",
    category: "hot_blog",
    title: "Undisclosed intermediary roundup",
    url: hotBlogUrl,
    source: "Industry Roundup",
    event_date: "2026-05-16",
    status: "included",
    included_in: "hot_blogs",
    intermediary_url: hotBlogUrl,
    verification_status: "intermediary_only",
    verification_sources: []
  });

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

test("report:write marks missing original X status as degraded", async () => {
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

  const report = normalizeReportDraft(draft, {
    siteUrl,
    generatedAt: fixedGeneratedAt,
    candidatePool
  });

  assert.equal(report.quality_status.status, "degraded");
  assert(report.quality_status.degraded_sections.some((issue) => issue.section === "builder_observations"));
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

test("report:write marks drafts degraded when blocked Builder sources stay below minimum", async () => {
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

  const report = normalizeReportDraft(draft, {
    siteUrl,
    generatedAt: fixedGeneratedAt,
    candidatePool
  });

  assert.equal(report.quality_status.status, "degraded");
  assert(report.quality_status.degraded_sections.some((issue) => issue.section === "builder_observations"));
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
  assert(prompt.includes("定时任务和长程发布任务必须从 launcher worktree 启动"));
  assert(prompt.includes("npm run daily:run -- --date YYYY-MM-DD"));
  assert(prompt.includes("npm run daily:run -- --date YYYY-MM-DD --publish"));
  assert(prompt.includes(".tmp/run-summary-YYYY-MM-DD.json"));
  assert(prompt.includes("publish:dry-run:daily"));
  assert(prompt.includes("--restart"));
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
  assert(prompt.includes("original_text"));
  assert(prompt.includes("translation"));
  assert(prompt.includes("content` 为兼容字段"));
  assert(prompt.includes("不得写成概括"));
  assert(prompt.includes("hero_highlights"));
  assert(prompt.includes("3-5 个分点式要点"));
  assert(prompt.includes("key_points"));
  assert(prompt.includes("点开放大"));
  assert(prompt.includes("项目 highlight"));
  assert(prompt.includes("覆盖时间范围"));
  assert(prompt.includes("不渲染公开“模型发布”"));
  assert(prompt.includes("不渲染公开“今日值得关注的项目”"));
  assert(prompt.includes("项目 highlights"));
  assert(prompt.includes("额外项目列表"));
  assert(prompt.includes("star 变化"));
  assert(prompt.includes("加粗变色文字"));
  assert(prompt.includes("8-12 条短新闻流"));
  assert(prompt.includes("公共 AI 重要性"));
  assert(prompt.includes("不按用户个人工作直接相关性"));
  assert(prompt.includes("结构化表格"));
  assert(prompt.includes("OpenRouter"));
  assert(prompt.includes("Artificial Analysis"));
  assert(prompt.includes("无图日报可以通过"));
  assert(prompt.includes("公开页不渲染 `why_it_matters`"));
  assert(prompt.includes("公开日报默认隐藏 source audit"));
  assert(!prompt.includes("`main_items` 每条必须填写 `why_it_matters` 或 `reader_relevance`"));
  assert(!prompt.includes("`main_items` 必须至少填写其一"));
  assert(!prompt.includes("每条用 3-5 个短 bullet"));
  assert(!prompt.includes("每条 3-5 个短 bullet"));
  assert(!prompt.includes("每条用 2-4 个短 bullet"));
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

function minimalDateIndexReport(reportDate, options = {}) {
  const mainItems = Array.from({ length: options.mainItems || 0 }, (_unused, index) => ({
    title: `Main signal ${index + 1}`,
    summary: `Public summary for signal ${index + 1}.`,
    url: `https://example.com/${reportDate}/main-${index + 1}`,
    event_date: reportDate,
    source: "Example",
    importance: index < (options.majorItems || 0) ? "major" : "notable"
  }));
  const githubTrending = Array.from({ length: options.github || 0 }, (_unused, index) => ({
    name: `example/date-index-${index + 1}`,
    repo: `example/date-index-${index + 1}`,
    url: `https://github.com/example/date-index-${index + 1}`,
    rank: index + 1,
    trend: "new",
    event_date: reportDate,
    description: `Date index repository ${index + 1}.`
  }));
  const builderObservations = Array.from({ length: options.builder || 0 }, (_unused, index) => ({
    author: `Builder ${index + 1}`,
    handle: `builder${index + 1}`,
    url: `https://x.com/builder/status/${reportDate.replaceAll("-", "")}${index + 1}`,
    event_date: reportDate,
    content: `Builder observation ${index + 1}.`,
    original_text: `Builder original ${index + 1}.`
  }));
  const hotBlogs = Array.from({ length: options.hotBlogs || 0 }, (_unused, index) => ({
    title: `Hot blog ${index + 1}`,
    url: `https://example.com/${reportDate}/blog-${index + 1}`,
    summary: `Hot blog summary ${index + 1}.`,
    event_date: reportDate,
    importance: index === 0 ? "major" : "notable"
  }));
  const dailyTracking = Array.from({ length: options.tracking || 0 }, (_unused, index) => ({
    id: `tracking-${index + 1}`,
    name: `Tracking ${index + 1}`,
    url: `https://example.com/${reportDate}/tracking-${index + 1}`,
    event_date: reportDate,
    publish_to_public: true,
    change_status: "changed",
    summary: `Tracking summary ${index + 1}.`
  }));
  const evidenceAssets = Array.from({ length: options.evidence || 0 }, (_unused, index) => ({
    type: "figure",
    title: `Evidence ${index + 1}`,
    local_path: `assets/evidence/${reportDate}-${index + 1}.png`,
    source_url: mainItems[0]?.url || `https://example.com/${reportDate}`,
    caption: `Evidence caption ${index + 1}.`
  }));

  return {
    report_date: reportDate,
    title: `AI 日报 ${reportDate}`,
    summary: `Summary for ${reportDate}.`,
    generated_at: fixedGeneratedAt,
    html_path: `reports/${reportDate.slice(0, 4)}/${reportDate.slice(5, 7)}/${reportDate}.html`,
    canonical_url: `${siteUrl}reports/${reportDate.slice(0, 4)}/${reportDate.slice(5, 7)}/${reportDate}.html`,
    main_items: mainItems,
    model_releases: [],
    hot_blogs: hotBlogs,
    daily_tracking: dailyTracking,
    projects: [],
    github_trending: githubTrending,
    huggingface_trending: [],
    builder_observations: builderObservations,
    community_leads: [],
    evidence_assets: evidenceAssets,
    hero_highlights: mainItems.slice(0, 2).map((item) => ({
      title: item.title,
      url: item.url,
      reason: item.summary
    })),
    quality_status: options.qualityStatus || { status: "ok" }
  };
}

function feedEntryFor(report) {
  return {
    report_date: report.report_date,
    title: report.title,
    summary: report.summary,
    url: report.html_path,
    data_url: `data/${report.report_date.slice(0, 4)}/${report.report_date.slice(5, 7)}/${report.report_date}.json`,
    main_items: report.main_items.length,
    builder_observations: report.builder_observations.length,
    generated_at: report.generated_at
  };
}

function structuredReportForDate(base, reportDate) {
  const report = structuredClone(base);
  report.report_date = reportDate;
  report.title = `AI 日报 ${reportDate}`;
  report.summary = `Structured report for ${reportDate}.`;
  report.generated_at = fixedGeneratedAt;
  report.html_path = `reports/${reportDate.slice(0, 4)}/${reportDate.slice(5, 7)}/${reportDate}.html`;
  report.canonical_url = `${siteUrl}${report.html_path}`;
  report.self_check.report_date = reportDate;
  for (const sectionName of [
    "main_items",
    "model_releases",
    "hot_blogs",
    "daily_tracking",
    "projects",
    "github_trending",
    "huggingface_trending",
    "builder_observations",
    "community_leads"
  ]) {
    for (const item of report[sectionName] || []) {
      item.event_date = reportDate;
    }
  }
  return report;
}

function platformAuditGroupFixture(name, url, candidatesFound, included) {
  return {
    checked: true,
    sources: [
      {
        id: slugFixtureId(name),
        name,
        url,
        status: "checked",
        source_kind: "rss",
        tier: "T3",
        authority: "community",
        enablement: "optional",
        verification_policy: "platform_signal_exempt",
        platform: platformFromUrl(url),
        parsed_count: candidatesFound,
        recent_48h_entries: candidatesFound,
        notes: `${candidatesFound} platform entries parsed`
      }
    ],
    candidates_found: candidatesFound,
    included,
    sources_checked: 1,
    notes: "Platform exempt discovery checked."
  };
}

function platformCandidateSourceFixture(id, name, url, platform) {
  return {
    id,
    name,
    url,
    category: "community",
    status: "checked",
    checked_at: fixedGeneratedAt,
    source_level: "platform_exempt_signal",
    verification_status: "platform_exempt_unverified",
    platform
  };
}

function platformCandidateFixture({ id, sourceId, category, includedIn, platform, title, url }) {
  return {
    id,
    source_id: sourceId,
    category,
    title,
    url,
    source: sourceId,
    event_date: "2026-05-16",
    status: "included",
    included_in: includedIn,
    platform,
    rule_id: sourceId,
    source_level: "platform_exempt_signal",
    verification_status: "platform_exempt_unverified",
    claim_text: `${platform} 平台线索显示，原帖称这是一条值得观察的工程讨论。`,
    why_watch: "用于观察平台讨论趋势，不作为事实确认。",
    disclosure: "平台扩散发现，未做一手回源核验。",
    matched_terms: ["agent"],
    exemption_policy: "platform_signal_exempt",
    published_by_gate: "deterministic_platform_gate",
    evidence: "Platform exempt fixture."
  };
}

function slugFixtureId(value) {
  return String(value || "fixture")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "fixture";
}

function platformFromUrl(value) {
  if (/zhihu/i.test(value)) return "zhihu";
  if (/reddit/i.test(value)) return "reddit";
  if (/wechat|weixin/i.test(value)) return "wechat";
  return "wechat";
}

function strictPublishReportFixture() {
  const reportDate = "2026-06-02";
  const mainItems = Array.from({ length: 8 }, (_unused, index) => ({
    candidate_id: `strict-main-${index + 1}`,
    title: `Strict main item ${index + 1}`,
    event_date: reportDate,
    url: `https://example.com/strict/main-${index + 1}`,
    source: "Strict Source",
    tier: "T0",
    entities: ["Strict AI"],
    summary: "Fixture main item for strict publish coverage.",
    bullets: [
      "**Strict AI** published a dated update with enough detail for the publish gate.",
      "The item includes ==specific evidence==, source URL, and candidate linkage."
    ],
    editorial_category: "ai_industry",
    source_level: "primary",
    verification_status: "primary_confirmed",
    why_it_matters: "It changes how engineering teams evaluate AI platform and toolchain choices.",
    reader_relevance: "Ordinary engineers can use it to judge migration timing, implementation risk, and follow-up reading.",
    importance: index < 2 ? "major" : "notable"
  }));
  const githubTrending = Array.from({ length: 10 }, (_unused, index) => ({
    candidate_id: `strict-trending-${index + 1}`,
    repo: `example/strict-agent-${index + 1}`,
    name: `example/strict-agent-${index + 1}`,
    description: "用于验证每日 GitHub Trending 覆盖的严格 fixture 仓库，聚焦 agent 工作流。",
    url: `https://github.com/example/strict-agent-${index + 1}`,
    event_date: reportDate,
    source: "GitHub Trending daily",
    language: "TypeScript",
    window: "daily",
    rank: index + 1,
    trend: "new",
    evidence: "GitHub Trending daily fixture.",
    editorial_category: "open_source",
    source_level: "github",
    verification_status: "primary_confirmed",
    importance: "general"
  }));
  const huggingFaceTrending = Array.from({ length: 10 }, (_unused, index) => ({
    candidate_id: `strict-hf-${index + 1}`,
    repo: `example/strict-model-${index + 1}`,
    name: `example/strict-model-${index + 1}`,
    description: "Hugging Face trending model fixture with public model-card metadata.",
    url: `https://huggingface.co/example/strict-model-${index + 1}`,
    event_date: reportDate,
    source: "Hugging Face Trending Models",
    task: "text-generation",
    downloads: 1000 + index,
    likes: 100 + index,
    rank: index + 1,
    trend: "trending",
    evidence: "Hugging Face public model trending fixture.",
    editorial_category: "open_source",
    source_level: "model_registry",
    verification_status: "primary_confirmed",
    importance: "general"
  }));
  const hotBlogs = Array.from({ length: 3 }, (_unused, index) => ({
    candidate_id: `strict-blog-${index + 1}`,
    title: `Strict engineering blog ${index + 1}`,
    url: `https://example.com/strict/blog-${index + 1}`,
    publisher: "Strict Engineering",
    author: "Strict Author",
    event_date: reportDate,
    topic: "agent workflow",
    summary: "Fixture blog for strict publish coverage.",
    editorial_category: "viewpoint_analysis",
    source_level: "primary",
    verification_status: "primary_confirmed",
    reader_relevance: "Useful background for engineers designing or evaluating agent workflows.",
    importance: "notable"
  }));
  const projects = Array.from({ length: 3 }, (_unused, index) => ({
    candidate_id: `strict-project-${index + 1}`,
    name: `strict-project-${index + 1}`,
    description: "Fixture project with a clear agent workflow use case.",
    url: `https://github.com/example/strict-project-${index + 1}`,
    event_date: reportDate,
    source: "GitHub Trending",
    signal: "trending",
    evidence: "Fixture project evidence.",
    editorial_category: "open_source",
    source_level: "github",
    verification_status: "primary_confirmed",
    reader_relevance: "Engineers can inspect the repository before adopting or benchmarking it.",
    importance: "notable"
  }));
  const builderObservations = [
    {
      candidate_id: "strict-builder-x",
      author: "Strict Builder",
      role: "builder",
      original_text: "Original X status about agent workflow practice.",
      translation: "关于 agent workflow 实践的原始 X 状态。",
      content: "关于 agent workflow 实践的原始 X 状态。",
      url: "https://x.com/strictbuilder/status/2059000000000000000",
      event_date: reportDate,
      source: "follow-builders X feed",
      evidence: "Fixture X status.",
      editorial_category: "x_discussion",
      source_level: "original_social",
      verification_status: "original_social_only",
      verification_note: "Original X status collected from follow-builders.",
      risk_note: "Treat as practitioner observation rather than confirmed product fact.",
      importance: "notable"
    },
    {
      candidate_id: "strict-builder-blog",
      author: "Strict Maintainer",
      role: "maintainer",
      original_text: "Original blog note about agent evaluation.",
      translation: "关于 agent evaluation 的原始博客笔记。",
      content: "关于 agent evaluation 的原始博客笔记。",
      url: "https://example.com/strict/builder-blog",
      event_date: reportDate,
      source: "follow-builders blog feed",
      evidence: "Fixture builder blog.",
      editorial_category: "community_signal",
      source_level: "primary",
      verification_status: "primary_confirmed",
      importance: "general"
    },
    {
      candidate_id: "strict-builder-research",
      author: "Strict Researcher",
      role: "researcher",
      original_text: "Researcher note about model deployment constraints.",
      translation: "关于模型部署约束的研究者笔记。",
      content: "关于模型部署约束的研究者笔记。",
      url: "https://example.com/strict/research-note",
      event_date: reportDate,
      source: "Simon Willison Weblog",
      evidence: "Fixture researcher note.",
      editorial_category: "community_signal",
      source_level: "primary",
      verification_status: "primary_confirmed",
      importance: "general"
    },
    {
      candidate_id: "strict-builder-founder",
      author: "Strict Founder",
      role: "founder",
      original_text: "Founder note about enterprise agent adoption.",
      translation: "关于企业 agent 采用的创始人笔记。",
      content: "关于企业 agent 采用的创始人笔记。",
      url: "https://example.com/strict/founder-note",
      event_date: reportDate,
      source: "follow-builders blog feed",
      evidence: "Fixture founder note.",
      editorial_category: "community_signal",
      source_level: "primary",
      verification_status: "primary_confirmed",
      importance: "general"
    },
    {
      candidate_id: "strict-builder-maintainer",
      author: "Strict Tool Maintainer",
      role: "maintainer",
      original_text: "Maintainer note about coding agent memory.",
      translation: "关于 coding agent 记忆的维护者笔记。",
      content: "关于 coding agent 记忆的维护者笔记。",
      url: "https://example.com/strict/maintainer-note",
      event_date: reportDate,
      source: "Simon Willison Weblog",
      evidence: "Fixture maintainer note.",
      editorial_category: "community_signal",
      source_level: "primary",
      verification_status: "primary_confirmed",
      importance: "general"
    }
  ];
  const contentSourceNames = [
    "OpenAI News RSS",
    "OpenAI Blog RSS",
    "Anthropic News",
    "Hugging Face Blog",
    "GitHub Changelog",
    "Google Research Blog",
    "Google DeepMind Blog",
    "Google DeepMind RSS",
    "Meta AI Blog",
    "Microsoft Research Blog",
    "Apple Machine Learning Research",
    "NVIDIA Developer Blog",
    "AWS Machine Learning Blog",
    "Azure Blog",
    "Meta Engineering",
    "xAI News",
    "ByteDance Seed Tech Blog",
    "TikTok for Developers Blog",
    "Tencent AI Business",
    "Tencent Hunyuan Blog",
    "Qwen Blog",
    "Alibaba Cloud Blog",
    "Moonshot AI Kimi Platform Blog",
    "Kimi Technical Blog",
    "MiniMax Blog",
    "Z.ai Research",
    "Cloudflare Blog",
    "Nature Machine Learning",
    "TechCrunch AI",
    "The Verge AI",
    "TechCrunch Enterprise",
    "The Verge",
    "Ars Technica",
    "MIT Technology Review",
    "VentureBeat AI",
    "ML Papers of the Week",
    "HelloGitHub",
    "RuanYF Weekly",
    "Product Hunt Trending Feed",
    "Product Hunt Developer Tools Feed",
    "Latent.Space",
    "arXiv cs.AI",
    "Hacker News Topstories API",
    "Hugging Face Daily Papers",
    "Papers with Code API",
    "Reddit r/MachineLearning",
    "Smol AI News",
    "AI News Archive",
    "Ben's Bites",
    "Interconnects",
    "The Magnifier AI",
    "Fast Company Creator Economy",
    "Crunchbase News AI",
    "Planet AI",
    "HNRSS Frontpage",
    "36Kr",
    "QbitAI",
    "Jiqizhixin",
    "Leiphone",
    "InfoQ CN"
  ];
  const githubSourceNames = [
    "GitHub Trending daily",
    "GitHub Trending weekly",
    "GitHub Trending Python daily",
    "GitHub Trending Python weekly",
    "GitHub Trending TypeScript daily",
    "GitHub Trending TypeScript weekly",
    "GitHub Trending Rust daily",
    "GitHub Trending Rust weekly",
    "GitHub Trending Go daily",
    "GitHub Trending Go weekly"
  ];

  return {
    report_date: reportDate,
    title: `AI Daily ${reportDate}`,
    summary: "Strict publish quality fixture.",
    main_items: mainItems,
    github_trending: githubTrending,
    huggingface_trending: huggingFaceTrending,
    hot_blogs: hotBlogs,
    projects,
    builder_observations: builderObservations,
    model_releases: [],
    community_leads: [],
    evidence_assets: [
      {
        type: "figure",
        title: "Strict evidence figure",
        source_url: mainItems[0].url,
        local_path: "assets/evidence/strict-figure.png",
        caption: "Benchmark chart from the source page.",
        extraction_status: "source_image",
        width: 960,
        height: 540,
        asset_role: "chart",
        asset_kind: "chart",
        capture_kind: "source_asset"
      }
    ],
    quality_status: {
      status: "ok",
      reasons: [],
      affected_sections: [],
      public_note: ""
    },
    source_audit: {
      github_trending: {
        checked: true,
        sources: githubSourceNames.map((name) => ({
          name,
          url: `https://github.com/trending${name === "GitHub Trending daily" ? "?since=daily" : `/${slugId(name)}?since=daily`}`,
          status: "checked",
          notes: "10 repositories parsed",
          parsed_count: 10
        })),
        candidates_found: 100,
        included: 10,
        notes: "fixture"
      },
      huggingface_trending: {
        checked: true,
        sources: [
          {
            name: "Hugging Face Trending Models",
            url: "https://huggingface.co/api/models?sort=trending&direction=-1&limit=50",
            status: "checked",
            notes: "10 trending models parsed",
            parsed_count: 10
          }
        ],
        candidates_found: 10,
        included: 10,
        notes: "fixture"
      },
      builder_sources: {
        checked: true,
        sources: [
          {
            name: "follow-builders X feed",
            url: "https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-x.json",
            status: "checked",
            notes: "fixture"
          },
          {
            name: "follow-builders blog feed",
            url: "https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-blogs.json",
            status: "checked",
            notes: "fixture"
          },
          {
            name: "Simon Willison Weblog",
            url: "https://simonwillison.net/atom/everything/",
            status: "checked",
            notes: "fixture"
          }
        ],
        candidates_found: 12,
        included: 5,
        notes: "fixture"
      },
      china_ai_sources: {
        checked: true,
        sources: [
          "Tencent Newsroom CN",
          "Alibaba Group News CN",
          "Alibaba Cloud Blog CN",
          "Qwen Blog",
          "DeepSeek News",
          "Zhipu AI News"
        ].map((name) => ({
          name,
          url: `https://example.cn/${slugId(name)}`,
          status: "checked",
          notes: "fixture"
        })),
        candidates_found: 6,
        included: 2,
        notes: "fixture"
      },
      content_sources: {
        checked: true,
        sources: contentSourceNames.map((name) => ({
          name,
          url: `https://example.com/sources/${slugId(name)}.xml`,
          status: "checked",
          notes: "fixture"
        })),
        candidates_found: 60,
        included: 12,
        sources_checked: contentSourceNames.length,
        enablement_counts: { core: 28, optional: 35 },
        notes: "fixture"
      }
    },
    self_check: {
      report_date: reportDate,
      main_items: mainItems.length,
      builder_observations: builderObservations.length,
      automation_revision: strictAutomationRevisionFixture()
    }
  };
}

function strictAutomationRevisionFixture() {
  return {
    schema_version: 1,
    git_commit: "abcdef1234567890abcdef1234567890abcdef12",
    git_commit_short: "abcdef123456",
    git_branch: "main",
    origin_main_sha: "abcdef1234567890abcdef1234567890abcdef12",
    origin_main_short: "abcdef123456",
    prompt_manifest: "prompts/ai-daily/manifest.json",
    prompt_modules: ["fixed-source-checklist.md"],
    source_registry_count: 68,
    source_registry_enablement_counts: { core: 28, optional: 35, manual: 5 },
    rules: [
      "main_items_min_8_when_candidates_available",
      "content_units_min_45_when_candidates_available",
      "model_releases_must_mirror_main_items",
      "github_api_fallback_for_git_transport",
      "fixed_source_checklist"
    ]
  };
}

function strictPublishOptionsFixture() {
  return {
    existingAssetPaths: new Set(["assets/evidence/strict-figure.png"]),
    currentAutomationRevision: strictAutomationRevisionFixture()
  };
}

function slugId(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

test("report:write marks model releases missing from main_items as degraded", async () => {
  const draft = JSON.parse(await readFixture("reports/good/structured-draft.json"));
  const candidatePool = JSON.parse(await readFixture("reports/good/structured-draft.candidates.json"));
  draft.report_date = "2026-06-02";
  draft.self_check.report_date = "2026-06-02";
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

  const report = normalizeReportDraft(draft, {
    siteUrl,
    generatedAt: fixedGeneratedAt,
    candidatePool,
    automationRevision: strictAutomationRevisionFixture()
  });

  assert.equal(report.quality_status.status, "degraded");
  assert(report.quality_status.degraded_sections.some((issue) => issue.error_code === "model_release_main_item_gate_failed"));
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

function collectJsonKeys(value, keys = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectJsonKeys(item, keys);
    }
    return keys;
  }
  if (!value || typeof value !== "object") {
    return keys;
  }
  for (const [key, entryValue] of Object.entries(value)) {
    keys.add(key);
    collectJsonKeys(entryValue, keys);
  }
  return keys;
}

async function runHarnessValidate(cwd) {
  try {
    const result = await execFileAsync(process.execPath, [path.join(rootDir, "scripts/harness-validate.mjs")], {
      cwd
    });
    return {
      code: 0,
      stdout: result.stdout,
      stderr: result.stderr
    };
  } catch (error) {
    return {
      code: error.code ?? 1,
      stdout: error.stdout || "",
      stderr: error.stderr || error.message || ""
    };
  }
}

async function runRetrospectivesValidate(cwd) {
  try {
    const result = await execFileAsync(process.execPath, [path.join(rootDir, "scripts/validate-retrospectives.mjs")], {
      cwd
    });
    return {
      code: 0,
      stdout: result.stdout,
      stderr: result.stderr
    };
  } catch (error) {
    return {
      code: error.code ?? 1,
      stdout: error.stdout || "",
      stderr: error.stderr || error.message || ""
    };
  }
}

async function runHarnessInit(cwd, args = []) {
  try {
    const result = await execFileAsync(process.execPath, [path.join(rootDir, "scripts/harness-init.mjs"), ...args], {
      cwd
    });
    return {
      code: 0,
      stdout: result.stdout,
      stderr: result.stderr
    };
  } catch (error) {
    return {
      code: error.code ?? 1,
      stdout: error.stdout || "",
      stderr: error.stderr || error.message || ""
    };
  }
}

async function createRetrospectiveFixture(options = {}) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-retrospectives-"));
  await fs.mkdir(path.join(tmp, "schemas"), { recursive: true });
  await fs.mkdir(path.join(tmp, "retrospectives", "2026", "06"), { recursive: true });
  await fs.copyFile(
    path.join(rootDir, "schemas", "retrospective.schema.json"),
    path.join(tmp, "schemas", "retrospective.schema.json")
  );

  const records = [
    retrospectiveRecordFixture({
      id: "2026-06-12.daily_publish.scheduled-publish",
      run_type: "daily_publish",
      title: "2026-06-12 日报发布复盘",
      slug: "scheduled-publish"
    }),
    retrospectiveRecordFixture({
      id: "2026-06-12.project_iteration.retrospective-harness",
      run_type: "project_iteration",
      title: "复盘 harness 落地",
      slug: "retrospective-harness",
      status: "completed"
    })
  ];

  if (typeof options.mutateRecord === "function") {
    options.mutateRecord(records[0]);
  }

  for (const record of records) {
    const filePath = retrospectiveRecordPath(tmp, record);
    await fs.writeFile(filePath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  }

  const index = {
    schema_version: 1,
    generated_at: "2026-06-12T12:00:00.000Z",
    records: records.map((record) => ({
      id: record.id,
      run_type: record.run_type,
      date: record.date,
      status: record.status,
      path: retrospectiveRecordRelativePath(record),
      title: record.title
    }))
  };

  if (typeof options.mutateIndex === "function") {
    options.mutateIndex(index);
  }

  await fs.writeFile(path.join(tmp, "retrospectives", "index.json"), `${JSON.stringify(index, null, 2)}\n`, "utf8");

  return tmp;
}

function retrospectiveRecordFixture({
  id,
  run_type,
  title,
  slug,
  status = "published"
}) {
  return {
    schema_version: 1,
    id,
    run_type,
    date: "2026-06-12",
    title,
    status,
    summary: "脱敏复盘记录 fixture。",
    evidence: {
      summary_path: ".tmp/run-summary-2026-06-12.json",
      report_json: "reports-data/2026/06/2026-06-12.json",
      html: "docs/reports/2026/06/2026-06-12.html",
      commits: ["4e48249"],
      prs: ["79"],
      validation_commands: ["node scripts/validate-retrospectives.mjs", "npm run validate"]
    },
    blockers: [],
    degraded_sections: [
      {
        code: "content_sources_blocked",
        section: "source_audit",
        message: "部分内容源受阻，已公开标注为降级。"
      }
    ],
    lessons: [
      {
        lesson: "复盘必须写成脱敏项目记录，而不是只留在自动化记忆里。",
        evidence: "用户确认复盘索引提交到仓库但必须脱敏。",
        scope: run_type,
        persistence: "implemented",
        recommended_action: "通过 retrospective validator 和 harness 门禁保持记录完整。"
      }
    ],
    suggestions: [
      {
        status: "implemented",
        issue: "复盘建议需要状态机和验证绑定。",
        evidence: "本 fixture 记录实现态建议。",
        module: "scripts/validate-retrospectives.mjs",
        suggestion: "使用 retrospective schema 和 validator 固定字段。",
        expected_benefit: "后续任务可以可靠读取项目教训。",
        requires_user_confirmation: false,
        promotion_path: "已写入 feedback ledger 并由 unit test 覆盖。",
        ledger_links: ["feedback/p1-authoritative-retrospectives"],
        validation_evidence: ["retrospective validation accepts sanitized records and index"]
      }
    ],
    ledger_links: ["feedback/p1-authoritative-retrospectives"],
    followups: [
      {
        status: "recommended",
        action: "让 daily runner 在发布结束后自动调用复盘写入器。",
        owner: "future-task"
      }
    ],
    slug
  };
}

function retrospectiveRecordRelativePath(record) {
  return `retrospectives/2026/06/${record.id}.json`;
}

function retrospectiveRecordPath(root, record) {
  return path.join(root, retrospectiveRecordRelativePath(record));
}

async function createHarnessFixture(options = {}) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-harness-"));
  await fs.mkdir(path.join(tmp, "config"), { recursive: true });
  await fs.mkdir(path.join(tmp, "docs"), { recursive: true });
  await fs.mkdir(path.join(tmp, "prompts", "ai-daily", "modules"), { recursive: true });
  await fs.mkdir(path.join(tmp, "scripts"), { recursive: true });
  await fs.mkdir(path.join(tmp, "schemas"), { recursive: true });
  await fs.mkdir(path.join(tmp, "retrospectives", "2026", "06"), { recursive: true });
  await fs.mkdir(path.join(tmp, "tasks", "templates"), { recursive: true });

  await fs.writeFile(
    path.join(tmp, "AGENTS.md"),
    [
      "# AGENTS.md",
      "",
      "Codex worktree session-handoff tasks/daily-publish-runbook.md publish:dry-run",
      "SDD/TDD Red Test",
      "Feedback Ledger Review Regression Self-Check",
      ""
    ].join("\n"),
    "utf8"
  );
  await fs.writeFile(path.join(tmp, "progress.md"), "# Progress\n\n## Current State\n\n- Fixture.\n", "utf8");
  await fs.writeFile(path.join(tmp, "session-handoff.md"), "# Session Handoff\n\n## Current Status\n\n- Fixture.\n", "utf8");
  await fs.writeFile(path.join(tmp, "progress.example.md"), "# Progress\n\n## Current State\n\n- Example fixture.\n", "utf8");
  await fs.writeFile(path.join(tmp, "session-handoff.example.md"), "# Session Handoff\n\n## Current Status\n\n- Example fixture.\n", "utf8");
  await fs.writeFile(path.join(tmp, "clean-state-checklist.md"), "# Clean State Checklist\n\n- Fixture.\n", "utf8");
  await fs.writeFile(path.join(tmp, "definition-of-done.md"), "# Definition Of Done\n\n- Fixture.\n", "utf8");
  await fs.writeFile(
    path.join(tmp, "config", "feedback-ledger.json"),
    JSON.stringify(options.feedbackLedger || {
      schema_version: 1,
      items: [
        {
          id: "feedback/fixture",
          severity: "P1",
          status: "implemented",
          title: "Fixture feedback",
          problem: "Fixture feedback can drift.",
          expected_behavior: "Fixture feedback is reviewed.",
          scope: ["scripts/harness-validate.mjs"],
          validation: {
            command: "node --test tests/unit.test.js",
            test_name: "fixture",
            gate: "npm run validate"
          }
        }
      ]
    }, null, 2),
    "utf8"
  );
  await fs.writeFile(
    path.join(tmp, "docs", "feedback-buglist-quick-reference.md"),
    options.quickReference || "# Feedback Buglist Quick Reference\n\n- feedback/fixture: review config/feedback-ledger.json before implementation.\n",
    "utf8"
  );
  await fs.writeFile(path.join(tmp, "tasks", "current-task.md"), options.currentTask || validNonTrivialCurrentTask(), "utf8");
  await fs.writeFile(
    path.join(tmp, "tasks", "daily-publish-runbook.md"),
    [
      "# Daily Publish Runbook",
      "",
      "唯一权威资产：`prompts/ai-daily/modules/editorial-authority.md`",
      "",
      "## Preflight",
      "## Source Discovery",
      "## Report Write",
      "## Build And Validate",
      "## Dry Run",
      "## Real Publish",
      "## GitHub API Fallback",
      "## Handoff",
      "",
      "npm run publish:dry-run",
      "npm run publish -- confirm-push YYYY-MM-DD",
      "npm run publish:github-api -- confirm-push YYYY-MM-DD",
      ""
    ].join("\n"),
    "utf8"
  );
  await fs.writeFile(
    path.join(tmp, "tasks", "templates", "daily-publish-task.md"),
    [
      "# Daily Publish Task",
      "",
      "`prompts/ai-daily/modules/editorial-authority.md`",
      "YYYY-MM-DD",
      "Asia/Shanghai",
      "Real publish requires explicit confirmation",
      "npm run validate",
      "npm run publish:dry-run",
      ""
    ].join("\n"),
    "utf8"
  );
  await fs.writeFile(
    path.join(tmp, "tasks", "templates", "sdd-tdd-task.md"),
    [
      "# Current Task",
      "## Task Class",
      "## Trivial Justification",
      "## Spec",
      "## Acceptance Criteria",
      "## Red Test",
      "## Deterministic Substitute",
      "## Feedback Ledger Review",
      "## Regression Self-Check",
      "## Retrospective Plan",
      "## Allowed Paths",
      "## Forbidden Paths",
      "## Validation Commands",
      "## Handoff Requirements",
      ""
    ].join("\n"),
    "utf8"
  );
  await fs.writeFile(path.join(tmp, "tasks", "current-task.example.md"), validNonTrivialCurrentTask(), "utf8");
  await fs.copyFile(
    path.join(rootDir, "prompts", "ai-daily", "modules", "editorial-authority.md"),
    path.join(tmp, "prompts", "ai-daily", "modules", "editorial-authority.md")
  );
  await fs.copyFile(path.join(rootDir, "scripts", "harness-init.mjs"), path.join(tmp, "scripts", "harness-init.mjs"));
  await fs.copyFile(path.join(rootDir, "scripts", "harness-validate.mjs"), path.join(tmp, "scripts", "harness-validate.mjs"));
  await fs.copyFile(path.join(rootDir, "scripts", "validate-retrospectives.mjs"), path.join(tmp, "scripts", "validate-retrospectives.mjs"));
  await fs.copyFile(path.join(rootDir, "schemas", "retrospective.schema.json"), path.join(tmp, "schemas", "retrospective.schema.json"));
  const retrospectiveRecords = [
    retrospectiveRecordFixture({
      id: "2026-06-12.daily_publish.scheduled-publish",
      run_type: "daily_publish",
      title: "Daily publish fixture",
      slug: "scheduled-publish"
    }),
    retrospectiveRecordFixture({
      id: "2026-06-12.project_iteration.retrospective-harness",
      run_type: "project_iteration",
      title: "Retrospective harness fixture",
      slug: "retrospective-harness",
      status: "completed"
    })
  ];
  for (const record of retrospectiveRecords) {
    await fs.writeFile(retrospectiveRecordPath(tmp, record), `${JSON.stringify(record, null, 2)}\n`, "utf8");
  }
  await fs.writeFile(
    path.join(tmp, "retrospectives", "index.json"),
    `${JSON.stringify({
      schema_version: 1,
      generated_at: "2026-06-12T12:00:00.000Z",
      records: retrospectiveRecords.map((record) => ({
        id: record.id,
        run_type: record.run_type,
        date: record.date,
        status: record.status,
        path: retrospectiveRecordRelativePath(record),
        title: record.title
      }))
    }, null, 2)}\n`,
    "utf8"
  );
  await fs.writeFile(
    path.join(tmp, "package.json"),
    JSON.stringify({
      scripts: {
        "prompt:build": "node src/cli.js prompt:build",
        "report:write": "node src/cli.js report:write",
        build: "node src/cli.js build --data-input reports-data --input reports-source --out docs",
        test: "node --test tests/unit.test.js",
        "test:e2e": "node scripts/run-e2e.mjs",
        "harness:init": "node scripts/harness-init.mjs",
        "harness:validate": "node scripts/harness-validate.mjs",
        "retrospectives:validate": "node scripts/validate-retrospectives.mjs",
        validate: "npm run harness:init && npm run harness:validate && npm run retrospectives:validate && npm run test && npm run build && npm run test:e2e && git diff --check",
        "publish:prepare-worktree": "node src/cli.js publish:prepare-worktree",
        "publish:prepare-clean-worktree": "node src/cli.js publish:prepare-clean-worktree",
        "publish:preflight": "node src/cli.js publish:preflight",
        "publish:dry-run": "node src/cli.js publish:dry-run --data-input reports-data --input reports-source --out docs",
        "publish:github-api": "node src/cli.js publish:github-api",
        publish: "node src/cli.js publish",
        "discover:github-trending": "node src/cli.js discover:github-trending",
        "discover:builders": "node src/cli.js discover:builders",
        "discover:content-sources": "node src/cli.js discover:content-sources",
        "discover:statuspage-incidents": "node src/cli.js discover:statuspage-incidents"
      }
    }, null, 2),
    "utf8"
  );
  await fs.writeFile(
    path.join(tmp, "feature_list.json"),
    JSON.stringify({
      features: [
        "daily-source-discovery",
        "structured-report-write",
        "static-html-build",
        "publish-preflight",
        "publish-dry-run",
        "publish-execute",
        "daily-publish-harness"
      ].map((id) => ({
        id,
        status: "active",
        summary: `${id} fixture`,
        commands: ["npm run validate"],
        artifacts: ["fixture"],
        acceptance: ["fixture acceptance 1", "fixture acceptance 2"],
        stop_conditions: ["fixture stop"]
      })),
      parallel_write_policy: {
        default: "blocked"
      }
    }, null, 2),
    "utf8"
  );

  return tmp;
}

function validNonTrivialCurrentTask() {
  return [
    "# Current Task",
    "",
    "## Task Class",
    "",
    "non-trivial",
    "",
    "## Spec",
    "",
    "A fixture implementation task.",
    "",
    "## Acceptance Criteria",
    "",
    "- Harness enforces the SDD/TDD contract.",
    "",
    "## Feedback Ledger Review",
    "",
    "- Reviewed `config/feedback-ledger.json`; this fixture confirms feedback-ledger memory is present before implementation.",
    "",
    "## Regression Self-Check",
    "",
    "- Self-check verifies the fixture includes the required regression review before validation handoff.",
    "",
    "## Retrospective Plan",
    "",
    "- This non-trivial fixture updates a project_iteration retrospective record and keeps retrospectives/index.json aligned.",
    "",
    "## Red Test",
    "",
    "`node --test tests/unit.test.js --test-name-pattern \"fixture\"` fails before implementation.",
    "",
    "## Allowed Paths",
    "",
    "- `scripts/harness-validate.mjs`",
    "",
    "## Forbidden Paths",
    "",
    "- Do not modify generated reports.",
    "",
    "## Validation Commands",
    "",
    "- `node scripts/harness-validate.mjs`",
    "",
    "## Parallel Writes",
    "",
    "- No parallel writes.",
    "",
    "## Handoff Requirements",
    "",
    "- Report validation evidence.",
    ""
  ].join("\n");
}

function datesThrough(startDate, count) {
  const start = new Date(`${startDate}T00:00:00Z`);
  return Array.from({ length: count }, (_unused, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    return date.toISOString().slice(0, 10);
  });
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

function networkOutageSourceAuditFixture() {
  const blockedSources = (prefix, count) =>
    Array.from({ length: count }, (_, index) => ({
      name: `${prefix} ${index + 1}`,
      url: `https://example.com/${slugId(prefix)}-${index + 1}`,
      status: "blocked",
      notes: "fetch failed EACCES"
    }));

  return {
    github_trending: {
      checked: true,
      sources: blockedSources("GitHub Trending", 3),
      candidates_found: 0,
      included: 0,
      blocked_reason: "fetch_failed",
      notes: "network outage fixture"
    },
    builder_sources: {
      checked: true,
      sources: blockedSources("Builder Source", 3),
      candidates_found: 0,
      included: 0,
      blocked_reason: "fetch_failed",
      last_successful_feed_at: null,
      notes: "network outage fixture"
    },
    content_sources: {
      checked: true,
      sources: blockedSources("Content Source", 50),
      candidates_found: 0,
      included: 0,
      blocked_reason: "fetch_failed",
      notes: "network outage fixture"
    },
    search_sources: {
      checked: true,
      shadow: true,
      sources: blockedSources("Search Source", 3),
      candidates_found: 0,
      included: 0,
      blocked_reason: "fetch_failed",
      notes: "network outage fixture"
    },
    sources_health: {
      checked: true,
      sources: blockedSources("Source Health", 3),
      candidates_found: 0,
      included: 0,
      blocked_reason: "fetch_failed",
      notes: "network outage fixture"
    }
  };
}

function builderObservationFixture(candidateId, url, source) {
  const translation = "Example Builder 分享了一个具体的 agent workflow 观察。";
  return {
    candidate_id: candidateId,
    author: "Example Builder",
    role: "builder",
    original_text: "Example Builder shared a concrete agent workflow observation.",
    translation,
    content: translation,
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
      <media:content url="https://example.com/assets/harness.png" medium="image" />
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
    <img src="/assets/claude-code.png" alt="Claude Code harness">
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

function autodraftDiscoveryFixture(reportDate) {
  const contentCandidates = Array.from({ length: 8 }, (_, index) => {
    const number = index + 1;
    const isAigc = index === 0;
    return {
      id: `official-${number}`,
      source_id: "content-runway-changelog",
      category: "community_lead",
      title: isAigc
        ? "Runway updates AI video creation workflow for game worlds"
        : `Official AI platform update ${number}`,
      url: `https://example.com/official/${number}`,
      source: isAigc ? "Runway Changelog" : "OpenAI News RSS",
      event_date: reportDate,
      status: "excluded",
      evidence: isAigc
        ? "Official changelog describes AI video generation and game-world creation workflow updates."
        : "Official source describes a product, model, platform, or governance update relevant to engineering teams.",
      verification_status: "primary_confirmed",
      source_level: "official",
      verification_sources: [`https://example.com/official/${number}`],
      primary_url: `https://example.com/official/${number}`,
      editorial_category: isAigc ? "content_aigc" : "ai_industry",
      ...(isAigc ? {
        image_url: "https://example.com/assets/runway.png",
        image_alt: "Runway video generation UI",
        image_source: "feed"
      } : {})
    };
  });
  const githubCandidates = Array.from({ length: 10 }, (_, index) => ({
    id: `github-project-${index + 1}`,
    source_id: "github-github-trending-daily",
    category: "project",
    title: `example/agent-project-${index + 1}`,
    repo: `example/agent-project-${index + 1}`,
    url: `https://github.com/example/agent-project-${index + 1}`,
    source: "GitHub Trending daily",
    event_date: reportDate,
    status: "excluded",
    rank: index + 1,
    trend: "new",
    language: "TypeScript",
    window: "daily",
    description: "Agent workflow toolkit for local AI engineering.",
    evidence: `GitHub Trending daily rank #${index + 1} with recent stars today.`,
    verification_status: "primary_confirmed",
    source_level: "github",
    primary_url: `https://github.com/example/agent-project-${index + 1}`,
    verification_sources: [`https://github.com/example/agent-project-${index + 1}`]
  }));
  const builderCandidate = {
    id: "builder-x-status",
    source_id: "builder-follow-builders-x-feed",
    category: "builder_observation",
    title: "@builder: AI agents need eval loops",
    url: "https://x.com/builder/status/1794993600000000000",
    source: "follow-builders X feed",
    event_date: reportDate,
    status: "excluded",
    author: "Example Builder",
    handle: "builder",
    original_text: "AI agents need eval loops before unattended production use.",
    evidence: "Original X status collected by follow-builders.",
    verification_status: "original_social_only",
    source_level: "original_social",
    original_url: "https://x.com/builder/status/1794993600000000000"
  };
  const hotBlogCandidate = {
    id: "hot-blog-axiom",
    source_id: "content-latent-space",
    category: "hot_blog",
    title: "Scaling Past Informal AI",
    url: "https://www.latent.space/p/axiom",
    source: "Latent.Space",
    author: "Latent.Space",
    event_date: reportDate,
    status: "excluded",
    evidence: "Interview about formal math, verified generation, and AI research workflows.",
    verification_status: "primary_confirmed",
    source_level: "primary",
    primary_url: "https://www.latent.space/p/axiom",
    verification_sources: ["https://www.latent.space/p/axiom"]
  };
  const statuspageCandidate = {
    id: "status-openai-gpt-image",
    source_id: "status-openai",
    category: "community_lead",
    title: "OpenAI Status: codex-gpt-image-2-does-not-exist-errors",
    url: "https://status.openai.com/incidents/example",
    source: "OpenAI Status",
    event_date: reportDate,
    status: "excluded",
    evidence: "Statuspage incident about a temporary GPT image API error.",
    verification_status: "primary_confirmed",
    source_level: "official",
    primary_url: "https://status.openai.com/incidents/example",
    verification_sources: ["https://status.openai.com/incidents/example"]
  };
  const productHuntCandidate = {
    id: "product-hunt-aigc",
    source_id: "content-product-hunt-trending",
    category: "project",
    title: "AIGC Game Asset Maker",
    url: "https://www.producthunt.com/posts/aigc-game-asset-maker",
    source: "Product Hunt Trending Feed",
    event_date: reportDate,
    status: "excluded",
    evidence: "Product Hunt listing for a generative game asset tool.",
    verification_status: "primary_confirmed",
    source_level: "official",
    primary_url: "https://www.producthunt.com/posts/aigc-game-asset-maker",
    verification_sources: ["https://www.producthunt.com/posts/aigc-game-asset-maker"],
    editorial_category: "content_aigc"
  };
  const mediaAigcCandidate = {
    id: "media-aigc-techcrunch",
    source_id: "content-techcrunch-ai",
    category: "community_lead",
    title: "TechCrunch reports an AI video product rumor",
    url: "https://techcrunch.com/example-ai-video-product",
    source: "TechCrunch AI",
    event_date: reportDate,
    status: "excluded",
    evidence: "Media report about an AI video product rumor.",
    verification_status: "primary_confirmed",
    source_level: "aigc_content_industry",
    primary_url: "https://techcrunch.com/example-ai-video-product",
    verification_sources: ["https://techcrunch.com/example-ai-video-product"],
    editorial_category: "content_aigc"
  };
  const searchAigcCandidate = {
    id: "search-openalex-aigc",
    source_id: "search-openalex",
    category: "community_lead",
    title: "Exploring platform generative AI in online work",
    url: "https://openalex.org/works/example",
    source: "OpenAlex",
    event_date: reportDate,
    status: "excluded",
    evidence: "Search shadow candidate for an AIGC paper.",
    verification_status: "primary_confirmed",
    source_level: "primary",
    primary_url: "https://openalex.org/works/example",
    verification_sources: ["https://openalex.org/works/example"],
    editorial_category: "content_aigc"
  };

  return {
    source_audit: {
      github_trending: {
        checked: true,
        sources: [
          {
            name: "GitHub Trending daily",
            url: "https://github.com/trending?since=daily",
            status: "checked",
            notes: "10 repositories parsed"
          }
        ],
        candidates_found: githubCandidates.length,
        included: 0,
        notes: "GitHub Trending fixed source checked."
      },
      builder_sources: {
        checked: true,
        sources: [
          {
            name: "follow-builders X feed",
            url: "https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-x.json",
            status: "checked",
            notes: "1 recent original X status parsed"
          }
        ],
        candidates_found: 1,
        included: 0,
        notes: "Builder fixed source checked."
      },
      content_sources: {
        checked: true,
        sources: [
          {
            name: "Runway Changelog",
            url: "https://runwayml.com/en/changelog",
            status: "checked",
            notes: "1 recent AIGC entry parsed"
          },
          {
            name: "OpenAI News RSS",
            url: "https://openai.com/news/rss.xml",
            status: "checked",
            notes: "7 recent official entries parsed"
          },
          {
            name: "Latent.Space",
            url: "https://www.latent.space/feed",
            status: "checked",
            notes: "1 recent blog entry parsed"
          }
        ],
        candidates_found: contentCandidates.length + 1,
        included: 0,
        sources_checked: 3,
        notes: "Content fixed sources checked."
      },
      search_sources: {
        checked: true,
        shadow: true,
        sources: [
          {
            name: "arXiv",
            url: "https://export.arxiv.org/",
            status: "no_signal",
            notes: "0 shadow candidates"
          }
        ],
        candidates_found: 0,
        included: 0,
        provider_runtime_ms: { arxiv: 1 },
        provider_cost_units: { arxiv: 1 },
        provider_error_counts: { arxiv: 0 },
        notes: "Search shadow checked."
      },
      sources_health: {
        checked: true,
        sources: [
          {
            name: "Health",
            url: "https://example.com/health",
            status: "checked",
            notes: "fixture health"
          }
        ],
        candidates_found: 0,
        included: 0,
        notes: "Health checked."
      }
    },
    sources: [
      {
        id: "content-runway-changelog",
        name: "Runway Changelog",
        url: "https://runwayml.com/en/changelog",
        category: "blog",
        status: "checked",
        checked_at: fixedGeneratedAt
      },
      {
        id: "content-latent-space",
        name: "Latent.Space",
        url: "https://www.latent.space/feed",
        category: "blog",
        status: "checked",
        checked_at: fixedGeneratedAt
      },
      {
        id: "github-github-trending-daily",
        name: "GitHub Trending daily",
        url: "https://github.com/trending?since=daily",
        category: "github_trending",
        status: "checked",
        checked_at: fixedGeneratedAt
      },
      {
        id: "builder-follow-builders-x-feed",
        name: "follow-builders X feed",
        url: "https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-x.json",
        category: "builder",
        status: "checked",
        checked_at: fixedGeneratedAt
      }
    ],
    candidates: [
      ...contentCandidates,
      hotBlogCandidate,
      statuspageCandidate,
      productHuntCandidate,
      mediaAigcCandidate,
      searchAigcCandidate,
      ...githubCandidates,
      builderCandidate
    ]
  };
}

function strategicOfficialCandidate(reportDate, options = {}) {
  return {
    id: options.id,
    source_id: options.sourceId || `content-${String(options.source || "official").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    category: options.category || "community_lead",
    title: options.title,
    url: options.url,
    source: options.source,
    event_date: reportDate,
    status: "excluded",
    evidence: options.evidence,
    verification_status: "primary_confirmed",
    source_level: options.sourceLevel || "official_company_news",
    verification_sources: [options.url],
    primary_url: options.url,
    editorial_category: options.editorialCategory || "ai_industry"
  };
}

function discoveryEnvelope({ candidates, sourceNames = [] } = {}) {
  return {
    source_audit: {
      github_trending: {
        checked: true,
        sources: [],
        candidates_found: 0,
        included: 0,
        notes: "No GitHub trending fixture candidates."
      },
      builder_sources: {
        checked: true,
        sources: [],
        candidates_found: 0,
        included: 0,
        notes: "No builder fixture candidates."
      },
      content_sources: {
        checked: true,
        sources: sourceNames.map((name) => ({
          name,
          url: `https://example.com/${String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
          status: "checked",
          notes: "fixture source checked"
        })),
        candidates_found: candidates.length,
        included: 0,
        sources_checked: sourceNames.length,
        notes: "Fixture content sources checked."
      },
      search_sources: {
        checked: true,
        sources: [],
        candidates_found: 0,
        included: 0,
        notes: "No search fixture candidates."
      },
      sources_health: {
        checked: true,
        sources: [],
        candidates_found: 0,
        included: 0,
        notes: "Source health fixture ok."
      }
    },
    sources: sourceNames.map((name) => ({
      id: `fixture-${String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      name,
      url: `https://example.com/${String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      category: "content_sources",
      status: "checked"
    })),
    candidates
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

async function writeSelfCheckReportFixture(root, reportDate, overrides = {}) {
  const [year, month] = reportDate.split("-");
  const report = {
    report_date: reportDate,
    title: `AI 日报 ${reportDate}`,
    canonical_url: `https://example.com/reports/${year}/${month}/${reportDate}.html`,
    main_items: [
      {
        title: "Fixture item",
        url: "https://example.com/news/fixture",
        event_date: reportDate,
        source: "Example",
        bullets: ["Fixture"]
      }
    ],
    source_audit: {
      sources_health: {
        checked: true,
        sources: [{ name: "Example", url: "https://example.com/feed.xml", status: "checked" }]
      }
    },
    quality_status: {
      status: "ok",
      reasons: [],
      degraded_sections: [],
      blocking_issues: []
    },
    ...overrides
  };
  const dataDir = path.join(root, "reports-data", year, month);
  const docsDataDir = path.join(root, "docs", "data", year, month);
  const htmlDir = path.join(root, "docs", "reports", year, month);
  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(docsDataDir, { recursive: true });
  await fs.mkdir(htmlDir, { recursive: true });
  await fs.writeFile(path.join(dataDir, `${reportDate}.json`), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(docsDataDir, `${reportDate}.json`), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(htmlDir, `${reportDate}.html`), `<main>${reportDate}</main>`, "utf8");
  await fs.writeFile(path.join(root, "docs", "index.html"), `<a>${reportDate}</a>`, "utf8");
  await fs.writeFile(path.join(root, "docs", "feed.json"), JSON.stringify({ reports: [{ report_date: reportDate }] }), "utf8");
  await fs.writeFile(path.join(root, "docs", "trends.json"), JSON.stringify({ reports: [{ report_date: reportDate }] }), "utf8");
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

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
