import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { buildSite } from "../../src/site.js";
import { evaluateDailyPageChecklist } from "../../src/page-checklist.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");
const trendConfigPath = path.join(rootDir, "config/trends.json");
const fixedGeneratedAt = "2026-05-13T02:35:00+08:00";

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-e2e-"));
const inputDir = path.join(tmp, "reports-source");
const dataInputDir = path.join(tmp, "reports-data");
const outDir = path.join(tmp, "docs");
await fs.mkdir(inputDir, { recursive: true });
await fs.mkdir(dataInputDir, { recursive: true });
await fs.copyFile(
  path.join(rootDir, "tests/fixtures/reports/good/official-release.md"),
  path.join(inputDir, "official-release.md")
);
const structuredReport = JSON.parse(
  await fs.readFile(path.join(rootDir, "tests/fixtures/reports/good/structured-report.json"), "utf8")
);
const weakHotBlogReport = structuredClone(structuredReport);
weakHotBlogReport.report_date = "2026-05-16";
weakHotBlogReport.title = "AI 日报 2026-05-16";
weakHotBlogReport.html_path = "reports/2026/05/2026-05-16.html";
weakHotBlogReport.canonical_url = "https://jasonxzwen.github.io/ai-daily-cn/reports/2026/05/2026-05-16.html";
weakHotBlogReport.hot_blogs = [
  {
    ...weakHotBlogReport.hot_blogs[0],
    summary: "这篇文章的看点不是单个技术名词，而是它怎样把 agent、开发工具或自动化流程拆成可采用的产品和工程边界。读者可以重点看是否有代码、接口、README、案例或失败模式，而不只看作者结论。对非 AI 直接从业者，价值在于判断 agent 工具是否已经从演示走向可试点的工作流。"
  }
];
structuredReport.main_items[0].bullets = [
  "**OpenAI** added ==keyword-notable|source-linked evidence== for page checklist validation.",
  "The fixture keeps enough public text to exercise inline highlight rendering and card layout."
];
const firstModel = structuredReport.model_releases[0];
const builderAvatarDataUri = `data:image/svg+xml;base64,${Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44"><rect width="44" height="44" rx="22" fill="#111827"/><text x="22" y="28" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="15" font-weight="700" fill="#ffffff">EB</text></svg>',
  "utf8"
).toString("base64")}`;
structuredReport.model_releases.push({
  ...firstModel,
  name: "ExampleModel Vision",
  url: "https://example.com/model/examplemodel-vision",
  summary: "ExampleModel Vision release for validating the two-image model release row."
});
structuredReport.projects = [
  {
    name: "Example Agent Memory",
    description: "Agent memory engine for validating horizontal project cards.",
    url: "https://github.com/example/agent-memory",
    domains: ["agent_memory", "developer_api"],
    use_case: "Provide cross-session memory and retrieval for agent apps.",
    event_date: "2026-05-15",
    source: "GitHub Trending daily",
    signal: "trending",
    evidence: "GitHub Trending daily showed 123 stars today."
  },
  {
    name: "Example Eval Harness",
    description: "Coding-agent eval harness for validating even project card heights.",
    url: "https://github.com/example/eval-harness",
    domains: ["eval_harness", "coding_agent"],
    use_case: "Replay agent tasks, record outputs, and compare regressions.",
    event_date: "2026-05-15",
    source: "GitHub Trending daily",
    signal: "trending",
    evidence: "GitHub Trending daily showed 98 stars today."
  }
];
structuredReport.github_trending = Array.from({ length: 10 }, (_, index) => {
  const rank = index + 1;
  const repo = index === 0 ? "example/agent-memory" : `example/agent-tool-${rank}`;
  return {
    name: repo,
    repo,
    description: `${repo}：进入 GitHub Trending Top 10，可作为 agent 工具方向的实现线索。优先核对 README 示例、许可证、近期维护和本地复现门槛。`,
    url: `https://github.com/${repo}`,
    event_date: "2026-05-15",
    source: "GitHub Trending daily",
    language: "TypeScript",
    window: "daily",
    rank,
    previous_rank: index === 0 ? 3 : null,
    rank_delta: index === 0 ? 2 : null,
    trend: index === 0 ? "up" : "new",
    evidence: index === 0
      ? "example/agent-memory appeared on GitHub Trending daily with 123 stars today."
      : `${repo} appeared on GitHub Trending daily.`
  };
});
structuredReport.hot_blogs.push({
  title: "No Media Blog Layout",
  url: "https://example.com/blog/no-media-layout",
  publisher: "Example Blog",
  author: "Example Author",
  event_date: "2026-05-15",
  topic: "layout regression",
  summary: "这篇博客用于验证没有证据图时的卡片布局，重点是普通读者能否顺畅扫读。它应让标题、正文和要点占满可读宽度，而不是留下空媒体栏。读者看到的是清楚的中文正文层级、要点分组和链接状态，不会被英文测试文案干扰。"
});
structuredReport.builder_observations = [
  {
    author: "Example Builder",
    handle: "examplebuilder",
    role: "maintainer",
    event_date: "2026-05-15",
    source: "follow-builders X feed",
    original_text: "Coding agents need eval loops before unattended work.",
    translation: "Coding agent 在无人值守工作之前需要 eval loops。",
    content: "Coding agent 在无人值守工作之前需要 eval loops。",
    avatar_data_uri: builderAvatarDataUri,
    url: "https://x.com/examplebuilder/status/2059000000000000000",
    evidence: "Original X status URL was collected from follow-builders central feed."
  },
  {
    author: "Long Thread Builder",
    handle: "longbuilder",
    role: "researcher",
    event_date: "2026-05-15",
    source: "follow-builders X feed",
    original_text: "Long-form builder posts should not make a neighboring X card stretch into empty space. The card should be a horizontal row with identity metadata on the left and translated content on the right.",
    translation: "长文本 Builder 帖子不应该让相邻 X 卡片被拉成大块空白。卡片应使用横向行：左侧放作者和标签，右侧放翻译正文与原文。",
    content: "长文本 Builder 帖子不应该让相邻 X 卡片被拉成大块空白。卡片应使用横向行：左侧放作者和标签，右侧放翻译正文与原文。",
    avatar_data_uri: builderAvatarDataUri,
    url: "https://x.com/longbuilder/status/2059000000000000001",
    evidence: "Original X status URL was collected from follow-builders central feed."
  }
];
structuredReport.self_check.builder_observations = structuredReport.builder_observations.length;
structuredReport.community_leads = [
  {
    title: "企业开始把 token 成本当成模型路由约束",
    content: "TechCrunch 报道企业在多模型工作流里开始把 token 成本、路由策略和失败率一起算，模型选择正从单模型能力比较转向系统成本控制。",
    url: "https://techcrunch.com/example-token-routing-costs/",
    source: "TechCrunch AI",
    event_date: "2026-05-15",
    source_level: "intermediary",
    verification_status: "intermediary_only",
    verification_note: "中介来源，仅作社区观察。"
  }
];
structuredReport.daily_tracking = [
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
    change_summary: "OpenRouter Top 10 fixture.",
    publish_to_public: true,
    summary: "OpenRouter public ranking fixture renders daily tracking as a visual table and provider bars.",
    watch_points: ["Review the top model, provider mix, and new entries together."],
    metrics: [{ label: "Scope", value: "This Week Top 10", trend: "same" }],
    evidence: "OpenRouter public rankings fixture.",
    verification_note: "Fixture snapshot is primary-confirmed for e2e rendering.",
    risk_note: "OpenRouter reflects platform usage, not market share.",
    watch_next: "Continue watching provider mix.",
    snapshot: {
      type: "openrouter_rankings_public_page",
      collection_method: "public_page_playwright",
      snapshot_status: "complete",
      snapshot_as_of: fixedGeneratedAt,
      source_url: "https://openrouter.ai/rankings",
      top_entries: Array.from({ length: 10 }, (_, index) => ({
        rank: index + 1,
        model: index === 0 ? "DeepSeek V4 Flash" : `Fixture Model ${index + 1}`,
        provider: index < 3 ? "deepseek" : index < 6 ? "anthropic" : "openrouter",
        tokens: index === 0 ? "2.9T tokens" : `${10 - index}00B tokens`,
        change: index === 7 ? "new" : `${10 + index}%`
      }))
    }
  }
];
structuredReport.source_audit = {
  github_trending: {
    checked: true,
    candidates_found: 10,
    included: 10,
    notes: "Fixture GitHub Trending audit.",
    sources: [
      { name: "GitHub Trending daily", url: "https://github.com/trending?since=daily", status: "checked", notes: "Top 10 parsed." },
      { name: "GitHub Trending weekly", url: "https://github.com/trending?since=weekly", status: "no_signal", notes: "Not used for this public day." }
    ]
  },
  builder_sources: {
    checked: true,
    candidates_found: 2,
    included: 2,
    notes: "Fixture Builder audit.",
    sources: [
      { name: "follow-builders X feed", url: "https://x.com/examplebuilder", status: "checked", notes: "Original X URLs preserved." }
    ]
  },
  content_sources: {
    checked: true,
    candidates_found: 2,
    included: 2,
    notes: "Fixture content audit.",
    sources: [
      { name: "Example Blog", url: "https://example.com/blog", status: "checked", notes: "Fixture blog parsed." }
    ]
  }
};
structuredReport.evidence_assets = [
  {
    type: "figure",
    title: "OpenRouter chart 1",
    source_url: "https://openrouter.ai/rankings",
    local_path: "assets/evidence/e2e-openrouter-1.png",
    caption: "OpenRouter chart 1.",
    extraction_status: "source_image"
  },
  {
    type: "figure",
    title: "OpenRouter chart 2",
    source_url: "https://openrouter.ai/rankings",
    local_path: "assets/evidence/e2e-openrouter-2.png",
    caption: "OpenRouter chart 2.",
    extraction_status: "source_image"
  },
  {
    type: "figure",
    title: "OpenRouter chart 3",
    source_url: "https://openrouter.ai/rankings",
    local_path: "assets/evidence/e2e-openrouter-3.png",
    caption: "OpenRouter chart 3.",
    extraction_status: "source_image"
  },
  {
    type: "figure",
    title: "ExampleModel benchmark",
    source_url: firstModel.url,
    local_path: "assets/evidence/e2e-model-benchmark.png",
    caption: "Official benchmark figure.",
    extraction_status: "source_image"
  },
  {
    type: "figure",
    title: "ExampleModel vision workflow",
    source_url: "https://example.com/model/examplemodel-vision",
    local_path: "assets/evidence/e2e-model-workflow.png",
    caption: "Official workflow figure.",
    extraction_status: "source_image"
  },
  {
    type: "figure",
    title: "Harness architecture",
    source_url: structuredReport.hot_blogs[0].url,
    local_path: "assets/evidence/e2e-blog-architecture.png",
    caption: "Original blog architecture figure.",
    extraction_status: "source_image"
  },
  {
    type: "figure",
    title: "Builder post screenshot",
    source_url: structuredReport.builder_observations[0].url,
    local_path: "assets/evidence/e2e-builder-post.png",
    caption: "Original X post image.",
    extraction_status: "source_image"
  },
  {
    type: "figure",
    title: "Community token routing illustration",
    source_url: structuredReport.community_leads[0].url,
    local_path: "assets/evidence/e2e-community-token-routing.png",
    caption: "Community article illustration.",
    extraction_status: "source_image"
  }
];
const weakBuilderReport = structuredClone(structuredReport);
weakBuilderReport.report_date = "2026-05-17";
weakBuilderReport.title = "AI 日报 2026-05-17";
weakBuilderReport.html_path = "reports/2026/05/2026-05-17.html";
weakBuilderReport.canonical_url = "https://jasonxzwen.github.io/ai-daily-cn/reports/2026/05/2026-05-17.html";
weakBuilderReport.builder_observations = [
  {
    ...structuredReport.builder_observations[0],
    author: "Untranslated Builder",
    handle: "rawbuilder",
    url: "https://x.com/rawbuilder/status/2059000000000000002",
    translation: "Matt Turck 提到一场与 OpenAI 相关负责人的访谈已同步到播客和 YouTube；这类帖子适合当访谈入口，但不能替代正式发布或产品说明。",
    content: "Matt Turck 提到一场与 OpenAI 相关负责人的访谈已同步到播客和 YouTube；这类帖子适合当访谈入口，但不能替代正式发布或产品说明。"
  }
];
weakBuilderReport.self_check.builder_observations = weakBuilderReport.builder_observations.length;
await fs.writeFile(path.join(dataInputDir, "structured-report.json"), JSON.stringify(structuredReport, null, 2), "utf8");
await fs.writeFile(path.join(dataInputDir, "weak-hot-blog-report.json"), JSON.stringify(weakHotBlogReport, null, 2), "utf8");
await fs.writeFile(path.join(dataInputDir, "weak-builder-report.json"), JSON.stringify(weakBuilderReport, null, 2), "utf8");

await buildSite({
  rootDir: tmp,
  inputDir,
  dataInputDir,
  outDir,
  generatedAt: fixedGeneratedAt,
  trendConfigPath
});
await writeTinyPng(path.join(outDir, "assets/evidence/e2e-model-benchmark.png"));
await writeTinyPng(path.join(outDir, "assets/evidence/e2e-model-workflow.png"));
await writeTinyPng(path.join(outDir, "assets/evidence/e2e-blog-architecture.png"));
await writeTinyPng(path.join(outDir, "assets/evidence/e2e-builder-post.png"));
await writeTinyPng(path.join(outDir, "assets/evidence/e2e-community-token-routing.png"));
await writeTinyPng(path.join(outDir, "assets/evidence/e2e-openrouter-1.png"));
await writeTinyPng(path.join(outDir, "assets/evidence/e2e-openrouter-2.png"));
await writeTinyPng(path.join(outDir, "assets/evidence/e2e-openrouter-3.png"));

const server = await startStaticServer(outDir);
const browser = await chromium.launch();

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${server.url}/index.html`);
  assert.match(await page.locator("h1").textContent(), /AI 日报/);
  assert.equal(await hasRemoteScripts(page), false);
  assert((await page.locator("a[href='reports/2026/05/2026-05-13.html']").count()) >= 1);
  assert.match(await page.locator("body").textContent(), /按年月周导航/);

  await page.goto(`${server.url}/reports/2026/05/2026-05-13.html`);
  assert.equal((await page.locator("#report-top h1").textContent()).trim(), "2026-05-13");
  assert.equal(await page.locator("#report-top[data-hero-mode='daily-report']").count(), 1);
  assert.match(await page.locator("#report-top").textContent(), /AI 日报/);
  assert.equal(await page.locator("#report-top .hero-summary-text").count(), 1);
  assert.match(await page.locator("#report-top .hero-stat-grid").textContent(), /主体/);
  assert.equal(await page.locator("#report-top .hero-decision-grid").count(), 0);
  assert.equal(await page.locator("nav.report-nav").count(), 1);
  assert.equal(await page.locator("html[data-html-work-report][data-render-mode='pre-rendered']").count(), 1);
  assert.match(await page.locator("#report-top").textContent(), /日报导航/);
  assert.match(await page.locator("body").textContent(), /主体信息/);
  assert.match(await page.locator("body").textContent(), /信源审计/);
  assert.equal(await page.locator("#report-top a[href='https://jasonxzwen.github.io/ai-daily-cn/data/2026/05/2026-05-13.json']").count(), 1);
  assert.equal(await page.locator("link[rel='stylesheet']").count(), 0);
  assert.equal(await page.locator("style").count(), 1);
  assert.equal(await allExternalLinksHaveRel(page), true);

  await page.goto(`${server.url}/reports/2026/05/2026-05-15.html`);
  const reportBody = await page.locator("body").textContent();
  const desktopChecklist = await evaluateDailyPageChecklist(page, { reportDate: "2026-05-15" });
  assert.equal(desktopChecklist.ok, true, JSON.stringify(desktopChecklist.issues, null, 2));
  assert.doesNotMatch(reportBody, /模型发布/);
  assert.doesNotMatch(reportBody, /ExampleModel 2/);
  assert.equal(await page.locator("#model-releases").count(), 0);
  assert.match(await page.locator("body").textContent(), /热门博客/);
  assert.match(await page.locator("body").textContent(), /Harness Engineering for Long Running Agents/);
  assert.match(await page.locator("body").textContent(), /GitHub Trending/);
  assert.match(await page.locator("body").textContent(), /项目 highlight/);
  assert.doesNotMatch(await page.locator("body").textContent(), /项目 highlights/);
  assert.doesNotMatch(await page.locator("#report-top").textContent(), /项目高亮/);
  assert.equal(await allImagesLoaded(page), true);
  assert.equal(await page.locator(".blog-card .card-media-grid img").count(), 1);
  assert.equal(await page.locator(".blog-card").count(), 2);
  assert.equal(await page.locator(".builder-card").count(), 2);
  assert.equal(await page.locator(".builder-card .card-title-icon").count(), 2);
  assert.equal(await page.locator(".card-media-grid img[src^='http']").count(), 0);
  const builderCardsText = await page.locator(".builder-card-grid").textContent();
  assert.match(builderCardsText, /@examplebuilder/);
  assert.match(builderCardsText, /Coding agent 在无人值守工作之前需要 eval loops/);
  assert.match(builderCardsText, /原文/);
  assert.match(builderCardsText, /Coding agents need eval loops before unattended work/);
  assert.doesNotMatch(builderCardsText, /Original X status URL was collected/);
  assert.equal(await page.locator(".builder-card .card-media-grid img").count(), 1);
  assert.equal(await builderCardsUseHorizontalRows(page), true);
  const communityCardsText = await page.locator(".community-card-grid").textContent();
  assert.match(communityCardsText, /token 成本/);
  assert.equal(await page.locator(".community-card .card-media-grid img").count(), 1);
  assert.equal(await communityCardsUseNewsStreamLayout(page), true);
  assert.doesNotMatch(communityCardsText, /Apple Newsroom[：:]/);
  assert.doesNotMatch(communityCardsText, /待确认|Treat this as a community lead|事实性结论|不进入\s*AI\s*主体事实|社区观察/);
  assert.doesNotMatch(await page.locator("body").textContent(), /技不止术|热门技术博客/);
  assert.equal(await noMediaBlogCardsUseReadableSingleColumn(page), true);
  await imageLightboxOpensAndCloses(page, ".blog-card .card-media-grid img");
  await imageLightboxOpensAndCloses(page, ".builder-card .card-media-grid img");
  await imageLightboxOpensAndCloses(page, ".community-card .card-media-grid img");
  assert.equal(await page.locator(".project-card-grid").count(), 0);
  assert.equal(await allExternalLinksHaveRel(page), true);

  await page.setViewportSize({ width: 375, height: 812 });
  const mobileChecklist = await evaluateDailyPageChecklist(page, { reportDate: "2026-05-15" });
  assert.equal(mobileChecklist.ok, true, JSON.stringify(mobileChecklist.issues, null, 2));
  await imageLightboxOpensAndCloses(page, ".blog-card .card-media-grid img");
  await imageLightboxOpensAndCloses(page, ".builder-card .card-media-grid img");
  await imageLightboxOpensAndCloses(page, ".community-card .card-media-grid img");
  assert.equal(await noMediaBlogCardsUseReadableSingleColumn(page), true);
  assert.equal(await builderCardsCollapseOnMobile(page), true);
  assert.equal(await communityCardsCollapseOnMobile(page), true);
  assert.equal(await hasHorizontalOverflow(page), false);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator(".community-card > p").first().evaluate((node) => {
    node.textContent = "Apple Newsroom：Apple and Major League Baseball have announced the July schedule for Friday Night Baseball on Apple TV. Treat this as a community lead unless it is backed by a primary source. 待确认：事实来自可回看的原始链接。";
  });
  const pollutedCommunityChecklist = await evaluateDailyPageChecklist(page, { reportDate: "2026-05-15" });
  assert.equal(pollutedCommunityChecklist.ok, false);
  assert(pollutedCommunityChecklist.issues.some((issue) => issue.id === "public_internal_review_language_absent"));
  assert(pollutedCommunityChecklist.issues.some((issue) => issue.id === "community_cards_reader_facing"));

  await page.goto(`${server.url}/reports/2026/05/2026-05-15.html`);
  await page.evaluate(() => {
    const stat = Array.from(document.querySelectorAll(".hero-stat span"))
      .find((node) => (node.textContent || "").includes("热门博客"));
    if (stat) {
      stat.textContent = "技不止术";
    }
  });
  const legacyCopyChecklist = await evaluateDailyPageChecklist(page, { reportDate: "2026-05-15" });
  assert.equal(legacyCopyChecklist.ok, false);
  assert(legacyCopyChecklist.issues.some((issue) => issue.id === "legacy_public_copy_absent"));

  await page.goto(`${server.url}/reports/2026/05/2026-05-15.html`);
  await page.locator(".blog-card > p").first().evaluate((node) => {
    node.textContent = "这篇文章的看点不是单个技术名词，而是它怎样把 agent、开发工具或自动化流程拆成可采用的产品和工程边界。读者可以重点看是否有代码、接口、README、案例或失败模式，而不只看作者结论。";
  });
  const weakHotBlogChecklist = await evaluateDailyPageChecklist(page, { reportDate: "2026-05-16" });
  assert.equal(weakHotBlogChecklist.ok, false);
  assert(weakHotBlogChecklist.issues.some((issue) => issue.id === "hot_blog_cards_reader_facing"));

  await page.goto(`${server.url}/reports/2026/05/2026-05-15.html`);
  await page.locator(".builder-card > p").first().evaluate((node) => {
    node.textContent = "Finally! the first eval ship from cog. To contextualize: METR evals cap out at about 16 hours, while Cog has private enterprise evals up to 100 hours.";
  });
  await page.locator(".builder-card .card-detail-list dd").first().evaluate((node) => {
    node.textContent = "";
  });
  const weakBuilderChecklist = await evaluateDailyPageChecklist(page, { reportDate: "2026-05-17" });
  assert.equal(weakBuilderChecklist.ok, false);
  assert(weakBuilderChecklist.issues.some((issue) => issue.id === "builder_cards_translated"));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

async function startStaticServer(root) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
    const filePath = path.join(root, ...pathname.split("/").filter(Boolean));

    if (!filePath.startsWith(root)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    try {
      const content = await fs.readFile(filePath);
      res.writeHead(200, { "content-type": contentType(filePath) });
      res.end(content);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: (callback) => server.close(callback)
  };
}

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".md")) return "text/markdown; charset=utf-8";
  return "application/octet-stream";
}

async function hasRemoteScripts(page) {
  return page.evaluate(() =>
    Array.from(document.scripts).some((script) => {
      if (!script.src) return false;
      return /^https?:\/\//.test(script.src);
    })
  );
}

async function allExternalLinksHaveRel(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("a[href^='http']")).every((anchor) => {
      const rel = anchor.getAttribute("rel") || "";
      return rel.includes("noopener") && rel.includes("noreferrer");
    })
  );
}

async function hasHorizontalOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
}

async function allImagesLoaded(page) {
  await page.evaluate(async () => {
    const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
    for (const image of document.images) {
      image.loading = "eager";
    }
    for (let y = 0; y <= document.documentElement.scrollHeight; y += window.innerHeight) {
      window.scrollTo(0, y);
      await nextFrame();
    }
    window.scrollTo(0, 0);
    await nextFrame();
  });
  await page.waitForFunction(
    () => Array.from(document.images).every((image) => image.complete),
    null,
    { timeout: 5000 }
  );
  return page.evaluate(() =>
    Array.from(document.images).every((image) => image.complete && image.naturalWidth > 0)
  );
}

async function imageLightboxOpensAndCloses(page, selector) {
  const image = page.locator(selector).first();
  await image.scrollIntoViewIfNeeded();
  await image.click();
  const lightbox = page.locator(".image-lightbox:not([hidden])");
  await lightbox.waitFor({ state: "visible", timeout: 2000 });
  await page.waitForFunction(() => document.querySelector(".image-lightbox[data-open='true']"), null, { timeout: 2000 });
  assert.equal(await page.locator("body.lightbox-open").count(), 1);
  assert.equal(
    await page.locator(".image-lightbox__image").evaluate((node) => node.complete && node.naturalWidth > 0),
    true
  );
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".image-lightbox:not([hidden])"), null, { timeout: 2000 });
  assert.equal(await page.locator("body.lightbox-open").count(), 0);
}

async function noMediaBlogCardsUseReadableSingleColumn(page) {
  return page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll(".blog-card"))
      .filter((card) => !card.querySelector(".card-media-grid"));

    if (cards.length === 0) return false;

    return cards.every((card) => {
      const styles = getComputedStyle(card);
      const cardRect = card.getBoundingClientRect();
      const titleRect = card.querySelector("h3")?.getBoundingClientRect();
      const bodyRect = card.querySelector(":scope > p")?.getBoundingClientRect();
      const termRects = Array.from(card.querySelectorAll(".card-detail-list dt"))
        .map((node) => node.getBoundingClientRect());
      const detailRects = Array.from(card.querySelectorAll(".card-detail-list dd"))
        .map((node) => node.getBoundingClientRect());
      const detailMinWidth = Math.min(240, cardRect.width * 0.6);

      return styles.gridTemplateColumns.trim().split(/\s+/).length === 1
        && !styles.gridTemplateAreas.includes("blog-media")
        && Boolean(titleRect && titleRect.width >= cardRect.width * 0.75)
        && Boolean(bodyRect && bodyRect.width >= cardRect.width * 0.75)
        && termRects.length > 0
        && termRects.every((rect) => rect.width <= 2 && rect.height <= 2)
        && detailRects.length > 0
        && detailRects.every((rect) => rect.width >= detailMinWidth);
    });
  });
}

async function builderCardsUseHorizontalRows(page) {
  return page.evaluate(() => {
    const grid = document.querySelector(".builder-card-grid");
    const cards = Array.from(document.querySelectorAll(".builder-card"));
    if (!grid || cards.length < 2) return false;

    const gridColumns = getComputedStyle(grid).gridTemplateColumns.trim().split(/\s+/);
    if (gridColumns.length !== 1) return false;

    return cards.every((card) => {
      const styles = getComputedStyle(card);
      const columns = styles.gridTemplateColumns.trim().split(/\s+/);
      const areas = styles.gridTemplateAreas;
      const titleRect = card.querySelector("h3")?.getBoundingClientRect();
      const bodyRect = card.querySelector(":scope > p")?.getBoundingClientRect();
      const detailRect = card.querySelector(".card-detail-list")?.getBoundingClientRect();
      const detailOk = !detailRect || (titleRect && detailRect.left > titleRect.left + 120);
      return columns.length === 2
        && areas.includes("builder-title")
        && areas.includes("builder-body")
        && Boolean(titleRect && bodyRect && bodyRect.left > titleRect.left + 120)
        && Boolean(detailOk);
    });
  });
}

async function builderCardsCollapseOnMobile(page) {
  return page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll(".builder-card"));
    if (cards.length === 0) return false;

    return cards.every((card) => {
      const styles = getComputedStyle(card);
      const columns = styles.gridTemplateColumns.trim().split(/\s+/);
      const areas = styles.gridTemplateAreas;
      const titleRect = card.querySelector("h3")?.getBoundingClientRect();
      const bodyRect = card.querySelector(":scope > p")?.getBoundingClientRect();
      return columns.length === 1
        && areas.includes("builder-title")
        && areas.includes("builder-body")
        && Boolean(titleRect && bodyRect && Math.abs(bodyRect.left - titleRect.left) < 8);
    });
  });
}

async function communityCardsUseNewsStreamLayout(page) {
  return page.evaluate(() => {
    const grid = document.querySelector(".community-card-grid");
    const cards = Array.from(document.querySelectorAll(".community-card"));
    if (!grid || cards.length === 0) return false;

    const gridColumns = getComputedStyle(grid).gridTemplateColumns.trim().split(/\s+/).filter(Boolean);
    if (gridColumns.length !== 1) return false;

    const cardWithMedia = cards.find((card) => card.querySelector(".card-media-grid"));
    if (!cardWithMedia) return false;

    const styles = getComputedStyle(cardWithMedia);
    const columns = styles.gridTemplateColumns.trim().split(/\s+/).filter(Boolean);
    const titleRect = cardWithMedia.querySelector("h3")?.getBoundingClientRect();
    const bodyRect = cardWithMedia.querySelector(":scope > p")?.getBoundingClientRect();
    const mediaRect = cardWithMedia.querySelector(".card-media-grid")?.getBoundingClientRect();

    return columns.length === 2
      && Boolean(titleRect && bodyRect && mediaRect && mediaRect.left > bodyRect.left + 120);
  });
}

async function communityCardsCollapseOnMobile(page) {
  return page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll(".community-card"));
    if (cards.length === 0) return false;

    return cards.every((card) => {
      const styles = getComputedStyle(card);
      const columns = styles.gridTemplateColumns.trim().split(/\s+/).filter(Boolean);
      const titleRect = card.querySelector("h3")?.getBoundingClientRect();
      const bodyRect = card.querySelector(":scope > p")?.getBoundingClientRect();
      const mediaRect = card.querySelector(".card-media-grid")?.getBoundingClientRect();
      const mediaOk = !mediaRect || Boolean(titleRect && Math.abs(mediaRect.left - titleRect.left) < 8);
      return columns.length === 1
        && Boolean(titleRect && bodyRect && Math.abs(bodyRect.left - titleRect.left) < 8)
        && mediaOk;
    });
  });
}

async function modelReleaseImagesShareRow(page) {
  return page.evaluate(() => {
    const row = Array.from(document.querySelectorAll(".rendered-markdown p")).find((paragraph) => {
      const sources = Array.from(paragraph.querySelectorAll("img.markdown-image"))
        .map((image) => image.getAttribute("src") || "");
      return sources.some((source) => source.includes("e2e-model-benchmark"))
        && sources.some((source) => source.includes("e2e-model-workflow"));
    });
    if (!row) return false;
    const rects = Array.from(row.querySelectorAll("img.markdown-image"))
      .map((image) => image.getBoundingClientRect());
    return rects.length === 2 && Math.abs(rects[0].y - rects[1].y) <= 4;
  });
}

async function projectCardsAreHorizontalAndEven(page) {
  return page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll(".project-card"));
    if (cards.length < 2) return false;
    const firstTitle = cards[0].querySelector("h3")?.getBoundingClientRect();
    const firstBody = cards[0].querySelector(":scope > p")?.getBoundingClientRect();
    const heights = cards.map((card) => Math.round(card.getBoundingClientRect().height));
    return Boolean(firstTitle && firstBody && firstBody.x > firstTitle.x)
      && Math.max(...heights) - Math.min(...heights) <= 8;
  });
}

async function writeTinyPng(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8Dwn4GBgYGJAQoAHxcCAr9c6yQAAAAASUVORK5CYII=",
    "base64"
  );
  await fs.writeFile(filePath, png);
}
