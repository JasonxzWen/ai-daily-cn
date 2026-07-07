import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");
const execFileAsync = promisify(execFile);

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "adc-react-e2e-"));
const outDir = path.join(tmp, "docs");
await fs.mkdir(path.join(outDir, "data"), { recursive: true });
await writeFixtureData(outDir);

const viteBin = path.join(rootDir, "node_modules", "vite", "bin", "vite.js");
await execFileAsync(process.execPath, [
  viteBin,
  "build",
  "--outDir",
  outDir,
  "--emptyOutDir",
  "false"
], {
  cwd: rootDir,
  maxBuffer: 1024 * 1024 * 8
});

const server = await startStaticServer(outDir);
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1365, height: 768 } });
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  await page.goto(`${server.url}/`, { waitUntil: "networkidle" });
  await page.locator("[data-adc-app='react']").waitFor({ state: "visible", timeout: 5000 });
  assert.equal(await page.locator("[data-article-card]").count(), 2);
  for (const href of ["#/today", "#/all", "#/topics", "#/sources", "#/ops"]) {
    assert((await page.locator(`a[href='${href}']`).count()) >= 1, `${href} nav link should render`);
  }

  for (const selector of [
    "input",
    "select",
    "textarea",
    "#articleSearch",
    "#articleSource",
    "#articleScore",
    "[data-article-filter]",
    "[data-trend-index]",
    "[data-topic-map]",
    "[data-compare]"
  ]) {
    assert.equal(await page.locator(selector).count(), 0, `${selector} should not render`);
  }

  await page.locator("a[href='#/sources']").click();
  await page.waitForFunction(() => window.location.hash === "#/sources");
  assert.equal(await page.locator("text=Aify News").count(), 1);

  await page.locator("a[href='#/ops']").click();
  await page.waitForFunction(() => window.location.hash === "#/ops");
  assert.equal(await page.locator("text=static-react-github-pages").count(), 1);
  assert.deepEqual(consoleErrors, []);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

async function writeFixtureData(root) {
  const articleA = fixtureArticle({
    id: "article-aaaaaaaaaaaaaaaa",
    title: "AIFY fixture signal for React homepage",
    url: "https://example.com/aify-react-homepage",
    quality_score: 92,
    importance: "major"
  });
  const articleB = fixtureArticle({
    id: "article-bbbbbbbbbbbbbbbb",
    title: "ADC fixture signal for source pipeline",
    url: "https://example.com/adc-source-pipeline",
    quality_score: 84,
    importance: "notable"
  });
  const topic = {
    id: "topic-aaaaaaaaaaaa",
    label: "AI engineering",
    count: 2,
    article_ids: [articleA.id, articleB.id],
    sources: ["AIFY Fixture", "ADC Fixture"],
    latest_date: "2026-07-07",
    accent: "cyan"
  };
  const today = {
    schema_version: 1,
    generated_at: "2026-07-07T08:00:00.000Z",
    report_date: "2026-07-07",
    title: "ADC Today Fixture",
    summary: "A compact fixture for the React homepage acceptance path.",
    stats: {
      article_count: 2,
      source_count: 2,
      topic_count: 1,
      aify_count: 1
    },
    top_article_ids: [articleA.id, articleB.id],
    articles: [articleA, articleB],
    top_topics: [topic]
  };
  const topics = {
    schema_version: 1,
    generated_at: today.generated_at,
    topics: [topic]
  };
  const sources = {
    schema_version: 1,
    generated_at: today.generated_at,
    source_registry_version: 1,
    sources: [
      {
        id: "site-aify-news",
        name: "Aify News",
        url: "https://aify-news.pages.dev/",
        source_kind: "aify_articles_json",
        authority: "first_class",
        tier: "first_class",
        article_count: 1,
        latest_article_date: "2026-07-07",
        latest_article_ids: [articleA.id],
        status: "checked"
      },
      {
        id: "topic-adcfixture",
        name: "ADC Fixture",
        url: "https://example.com/adc-source-pipeline",
        source_kind: "article_source",
        authority: "observed",
        tier: "standard",
        article_count: 1,
        latest_article_date: "2026-07-07",
        latest_article_ids: [articleB.id],
        status: "checked"
      }
    ]
  };
  const runtime = {
    schema_version: 1,
    generated_at: today.generated_at,
    build_id: "abcdef123456",
    mode: "static-react-github-pages",
    report_date: "2026-07-07",
    final_status: "ready",
    artifacts: [
      { path: "data/articles.json", count: 2, hash: "aaaaaaaaaaaa" },
      { path: "data/today.json", count: 2, hash: "bbbbbbbbbbbb" },
      { path: "data/topics.json", count: 1, hash: "cccccccccccc" },
      { path: "data/sources.json", count: 2, hash: "dddddddddddd" }
    ],
    source_inputs: [
      {
        id: "site-aify-news",
        name: "Aify News",
        url: "https://aify-news.pages.dev/articles.json",
        status: "checked",
        article_count: 1
      }
    ]
  };

  await writeJson(path.join(root, "data", "articles.json"), [articleA, articleB]);
  await writeJson(path.join(root, "data", "today.json"), today);
  await writeJson(path.join(root, "data", "topics.json"), topics);
  await writeJson(path.join(root, "data", "sources.json"), sources);
  await writeJson(path.join(root, "data", "runtime.json"), runtime);
}

function fixtureArticle(overrides) {
  return {
    id: overrides.id,
    title: overrides.title,
    url: overrides.url,
    summary: "This fixture article gives the React app enough public data to render a reader-facing card.",
    date: "2026-07-07",
    month: "2026-07",
    source: overrides.id.includes("a") ? "AIFY Fixture" : "ADC Fixture",
    section: "source_watch",
    report_date: "2026-07-07",
    report_url: "reports/2026/07/2026-07-07.html",
    data_url: "data/2026/07/2026-07-07.json",
    quality_score: overrides.quality_score,
    importance: overrides.importance,
    domain: "AI engineering",
    flavors: ["analysis"],
    channels_l1: ["AI engineering"],
    channels_l2: ["Agent workflow"],
    companies: [],
    products: []
  };
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
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
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".woff2")) return "font/woff2";
  return "application/octet-stream";
}
