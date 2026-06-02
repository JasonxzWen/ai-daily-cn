import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { buildSite } from "../../src/site.js";

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
const firstModel = structuredReport.model_releases[0];
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
structuredReport.github_trending = [
  {
    name: "example/agent-memory",
    repo: "example/agent-memory",
    description: "Agent memory engine.",
    url: "https://github.com/example/agent-memory",
    event_date: "2026-05-15",
    source: "GitHub Trending daily",
    language: "TypeScript",
    window: "daily",
    rank: 1,
    previous_rank: 3,
    rank_delta: 2,
    trend: "up",
    evidence: "example/agent-memory appeared on GitHub Trending daily with 123 stars today."
  }
];
structuredReport.evidence_assets = [
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
  }
];
await fs.writeFile(path.join(dataInputDir, "structured-report.json"), JSON.stringify(structuredReport, null, 2), "utf8");

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
  assert.equal(await page.locator("nav.report-nav").count(), 0);
  assert.equal(await page.locator("html[data-html-work-report][data-render-mode='pre-rendered']").count(), 1);
  assert.match(await page.locator("#report-top").textContent(), /日报导航/);
  assert.match(await page.locator("body").textContent(), /主体信息/);
  assert.match(await page.locator("body").textContent(), /信源审计/);
  assert.equal(await page.locator("#report-top a[href='https://jasonxzwen.github.io/ai-daily-cn/data/2026/05/2026-05-13.json']").count(), 1);
  assert.equal(await page.locator("link[rel='stylesheet']").count(), 0);
  assert.equal(await page.locator("style").count(), 1);
  assert.equal(await allExternalLinksHaveRel(page), true);

  await page.goto(`${server.url}/reports/2026/05/2026-05-15.html`);
  assert.match(await page.locator("body").textContent(), /模型发布/);
  assert.match(await page.locator("body").textContent(), /ExampleModel 2/);
  assert.match(await page.locator("body").textContent(), /热门技术博客/);
  assert.match(await page.locator("body").textContent(), /Harness Engineering for Long Running Agents/);
  assert.equal(await allImagesLoaded(page), true);
  assert.equal(await modelReleaseImagesShareRow(page), true);
  assert.equal(await page.locator(".blog-card .card-media-grid img").count(), 1);
  assert.equal(await page.locator(".project-card-grid").count(), 1);
  assert.equal(await projectCardsAreHorizontalAndEven(page), true);
  assert.equal(await allExternalLinksHaveRel(page), true);

  await page.setViewportSize({ width: 375, height: 812 });
  assert.equal(await hasHorizontalOverflow(page), false);
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
