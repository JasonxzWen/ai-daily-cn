import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { buildWebApp } from "../../src/web-app-build.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "adc-signal-e2e-"));
const outDir = path.join(tempRoot, "docs");
const snapshotAt = "2026-07-14T12:00:00.000Z";

await writeSignalFixture(outDir);
await buildWebApp({ rootDir, outDir, forwardOutput: false });

const server = await startStaticServer(outDir);
const browser = await chromium.launch();

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const requests = [];
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  page.on("request", (request) => requests.push(new URL(request.url()).pathname));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => failedRequests.push(`${request.url()} ${request.failure()?.errorText || "failed"}`));

  await page.goto(`${server.url}/index.html`, { waitUntil: "networkidle" });

  assert.match(await page.locator("h1").textContent(), /看见 AI 生态里/);
  assert.equal(await page.locator("[data-public-signal-monitor]").count(), 1);
  assert.equal(await page.locator('html[data-signal-index-loaded="ready"]').count(), 1);
  assert.equal(requests.includes("/signals/index.json"), true);
  assert.equal(requests.some((request) => request.includes("page-001.json")), false, "group pages must stay lazy");
  assert.deepEqual(
    await page.locator("[data-source-group]").evaluateAll((groups) => groups.map((group) => group.getAttribute("data-source-group"))),
    ["official_blogs", "github_trending"]
  );
  assert.equal(await page.locator('[data-source-group="official_blogs"] [data-signal-card]').count(), 6);
  assert.equal(await page.locator('[data-source-group="github_trending"] [data-signal-card]').count(), 2);
  assert.equal(await page.getByText("历史信号 11", { exact: true }).count(), 0);

  const firstCard = page.locator('[data-source-group="official_blogs"] [data-signal-card]').first();
  assert.match(await firstCard.textContent(), /OpenAI/);
  assert.equal(await firstCard.locator('[data-credibility-tag="primary_material"]').count(), 1);
  assert.equal(await firstCard.locator('[data-content-tag="product_update"]').count(), 1);
  assert.equal(await firstCard.locator('a[href^="https://example.com/"][target="_blank"][rel="noopener noreferrer"]').count() >= 1, true);

  const loadMore = page.locator('[data-load-more="official_blogs"]');
  await loadMore.click();
  assert.equal(await page.locator('[data-source-group="official_blogs"] [data-signal-card]').count(), 8);
  assert.equal(requests.some((request) => request.includes("page-001.json")), false, "cached preview should reveal first");

  await Promise.all([
    page.waitForResponse((response) => response.url().endsWith("/signals/official_blogs/page-001.json")),
    loadMore.click()
  ]);
  await page.getByRole("button", { name: /查看更早历史/ }).waitFor();
  assert.equal(requests.some((request) => request.endsWith("/signals/official_blogs/page-001.json")), true);
  assert.equal(await page.getByText("历史信号 11", { exact: true }).count(), 0, "older history stays cached until requested");

  const pageUrlBeforeHistory = page.url();
  await page.getByRole("button", { name: /查看更早历史/ }).click();
  assert.equal(await page.getByText("历史信号 11", { exact: true }).count(), 1);
  assert.equal(page.url(), pageUrlBeforeHistory, "history must expand on the same page");
  assert.equal(await page.getByText(/已进入快照 48 小时以前/).count(), 1);

  assert.equal(await page.locator('a[href="ops.html"], a[href^="official-blogs"], a[href^="reports/"]').count(), 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  assert.equal(consoleErrors.length, 0, consoleErrors.join("\n"));
  assert.equal(pageErrors.length, 0, pageErrors.join("\n"));
  assert.equal(failedRequests.length, 0, failedRequests.join("\n"));

  const screenshotDir = path.join(rootDir, ".tmp", "browser-evidence");
  await fs.mkdir(screenshotDir, { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: path.join(screenshotDir, "pr3-scheme-c-1280x900.png")
  });
} finally {
  await browser.close();
  await server.close();
  await fs.rm(tempRoot, { recursive: true, force: true });
}

async function writeSignalFixture(outDir) {
  const officialItems = Array.from({ length: 11 }, (_unused, index) => signalItem({
    index: index + 1,
    group: "official_blogs",
    publisher: index % 2 === 0 ? "OpenAI" : "Anthropic",
    eventDate: index === 10 ? "2026-07-10" : "2026-07-14",
    collectedAt: index === 10 ? "2026-07-10T09:00:00.000Z" : `2026-07-14T${String(11 - index).padStart(2, "0")}:00:00.000Z`,
    title: index === 10 ? "历史信号 11" : `官方信号 ${index + 1}`,
    credibility: index < 5 ? "primary_material" : "single_source_relay",
    contentTag: "product_update"
  }));
  const githubItems = Array.from({ length: 2 }, (_unused, index) => signalItem({
    index: 30 + index,
    group: "github_trending",
    publisher: "GitHub",
    eventDate: "2026-07-14",
    collectedAt: `2026-07-14T0${8 - index}:00:00.000Z`,
    title: `GitHub 信号 ${index + 1}`,
    credibility: "monitoring_lead",
    contentTag: "open_source"
  }));

  const signalIndex = {
    schema_version: 1,
    taxonomy_version: 1,
    kind: "signal_index",
    generated_at: snapshotAt,
    total_count: officialItems.length + githubItems.length,
    recent_count: officialItems.length + githubItems.length - 1,
    recent_window_hours: 48,
    page_size: 50,
    coverage: {
      input_record_count: officialItems.length + githubItems.length,
      occurrence_count: officialItems.length + githubItems.length,
      coalesced_record_count: 0,
      normalization_error_count: 0
    },
    groups: [
      {
        id: "official_blogs",
        label: "官网博客",
        count: officialItems.length,
        recent_count: officialItems.length - 1,
        page_count: 1,
        first_page_url: "signals/official_blogs/page-001.json",
        preview: officialItems.slice(0, 8)
      },
      {
        id: "github_trending",
        label: "GitHub 趋势",
        count: githubItems.length,
        recent_count: githubItems.length,
        page_count: 1,
        first_page_url: "signals/github_trending/page-001.json",
        preview: githubItems
      }
    ]
  };
  const officialPage = {
    schema_version: 1,
    taxonomy_version: 1,
    kind: "signal_page",
    generated_at: snapshotAt,
    group: { id: "official_blogs", label: "官网博客" },
    page: 1,
    page_count: 1,
    page_size: 50,
    total_count: officialItems.length,
    next_url: null,
    items: officialItems
  };

  await fs.mkdir(path.join(outDir, "signals", "official_blogs"), { recursive: true });
  await fs.mkdir(path.join(outDir, "signals", "github_trending"), { recursive: true });
  await fs.writeFile(path.join(outDir, "signals", "index.json"), `${JSON.stringify(signalIndex, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(outDir, "signals", "official_blogs", "page-001.json"), `${JSON.stringify(officialPage, null, 2)}\n`, "utf8");
}

function signalItem(options) {
  const id = String(options.index).padStart(24, "0");
  return {
    id: `occ_${id}`,
    cluster_id: `cluster_${id}`,
    title: options.title,
    url: `https://example.com/signals/${options.index}`,
    summary: `这是 ${options.title} 的独立摘要，用于验证来源、时间、链接与少量标签在宽松卡片中的呈现。`,
    author: null,
    handle: null,
    original_text: null,
    publisher: { name: options.publisher, home_url: `https://example.com/${options.publisher.toLowerCase()}` },
    collected_via: { name: `${options.publisher} Feed`, url: "https://example.com/feed.xml" },
    source_group: options.group,
    content_tags: [options.contentTag],
    credibility_tag: options.credibility,
    event_date: options.eventDate,
    published_at: null,
    collected_at: options.collectedAt,
    date_anomaly: null,
    image_url: null,
    source_health: "available",
    access_state: "direct"
  };
}

async function startStaticServer(root) {
  const server = http.createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
      const relativePath = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, "") || "index.html";
      const target = path.resolve(root, ...relativePath.split("/"));
      if (target !== path.resolve(root) && !target.startsWith(`${path.resolve(root)}${path.sep}`)) {
        response.writeHead(403).end("Forbidden");
        return;
      }
      const body = await fs.readFile(target);
      response.setHeader("content-type", contentType(target));
      response.writeHead(200).end(body);
    } catch {
      response.writeHead(404).end("Not found");
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}

function contentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".html") return "text/html; charset=utf-8";
  if (extension === ".js") return "text/javascript; charset=utf-8";
  if (extension === ".css") return "text/css; charset=utf-8";
  if (extension === ".json") return "application/json; charset=utf-8";
  if (extension === ".svg") return "image/svg+xml";
  if (extension === ".ico") return "image/x-icon";
  return "application/octet-stream";
}
