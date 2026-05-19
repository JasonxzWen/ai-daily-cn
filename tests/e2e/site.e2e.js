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
await fs.copyFile(
  path.join(rootDir, "tests/fixtures/reports/good/structured-report.json"),
  path.join(dataInputDir, "structured-report.json")
);

await buildSite({
  rootDir: tmp,
  inputDir,
  dataInputDir,
  outDir,
  generatedAt: fixedGeneratedAt
});

const server = await startStaticServer(outDir);
const browser = await chromium.launch();

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${server.url}/index.html`);
  assert.match(await page.locator("h1").textContent(), /AI 日报/);
  assert.equal(await hasRemoteScripts(page), false);
  assert.equal(await page.locator("a[href='reports/2026/05/2026-05-13.html']").count(), 1);

  await page.goto(`${server.url}/reports/2026/05/2026-05-13.html`);
  assert.match(await page.locator("h1").textContent(), /AI 日报 2026-05-13/);
  assert.equal(await page.locator("#main-items article").count(), 2);
  const artifactHrefs = await page.locator(".artifact-links a").evaluateAll((links) => links.map((link) => link.getAttribute("href")));
  assert.deepEqual(artifactHrefs.sort(), ["../../../data/2026/05/2026-05-13.json", "./2026-05-13.md"].sort());
  assert.equal(await page.locator("link[rel='stylesheet']").count(), 0);
  assert.equal(await page.locator("style").count(), 1);
  assert.equal(await allExternalLinksHaveRel(page), true);

  await page.goto(`${server.url}/reports/2026/05/2026-05-15.html`);
  assert.equal(await page.locator("#model-releases").count(), 1);
  assert.match(await page.locator("#model-releases").textContent(), /ExampleModel 2/);
  assert.equal(await page.locator("#hot-blogs").count(), 1);
  assert.match(await page.locator("#hot-blogs").textContent(), /Harness Engineering for Long Running Agents/);
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
