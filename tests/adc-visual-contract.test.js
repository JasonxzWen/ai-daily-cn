import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { planGeneratedFiles } from "../src/site.js";

const rootDir = path.resolve(".");

test("React homepage is a source-grouped public signal monitor", async () => {
  const app = await fs.readFile(path.join(rootDir, "apps", "web", "src", "App.tsx"), "utf8");

  assert.match(app, /fetchJson<SignalIndex>\("signals\/index\.json"\)/);
  assert.doesNotMatch(app, /fetchJson<[^>]+>\("(?:home|articles|feed)\.json"\)/);
  assert.match(app, /data-public-signal-monitor/);
  assert.match(app, /data-source-group=/);
  assert.match(app, /data-signal-card=/);
  assert.match(app, /data-credibility-tag=/);
  assert.match(app, /data-content-tag=/);
  assert.match(app, /data-load-more=/);
  assert.match(app, /RECENT_WINDOW_MS\s*=\s*48\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
  assert.match(app, /timestamp\(signalIndex\.generated_at\)\s*-\s*RECENT_WINDOW_MS/);
  assert.match(app, /signalIndex\.recent_count/);
  assert.match(app, /group\.recent_count/);
  assert.match(app, /历史库存/);
  assert.match(app, /first_page_url/);
  assert.match(app, /next_url/);
  assert.match(app, /appendUniqueSignals/);
  assert.match(app, /查看更早历史/);
  assert.match(app, /标签只用于辅助判断，不改变默认时间顺序/);
  assert.doesNotMatch(app, /latest_edition|previous_edition|SourceWatchRail|EditionSurface|ArchiveSurface/);
  assert.doesNotMatch(app, /ops\.html|official-blogs\/|reports\//);
  assert.match(app, /role="status"/);
  assert.match(app, /aria-live="polite"/);
  assert.match(app, /role="alert"/);
  assert.match(app, /className="adc-skip-link"/);
  assert.match(app, /target="_blank" rel="noopener noreferrer"/);
});

test("scheme C CSS lowers density and remains desktop-only", async () => {
  const css = await fs.readFile(path.join(rootDir, "apps", "web", "src", "styles.css"), "utf8");

  assert.match(css, /\.adc-board\s*\{[^}]*grid-template-columns:\s*208px minmax\(0, 1fr\)/s);
  assert.match(css, /\.adc-signal-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,/s);
  assert.match(css, /\.adc-source-group\s*\{[^}]*margin-bottom:\s*76px/s);
  assert.match(css, /\.adc-signal-card\s*\{[^}]*min-height:\s*232px/s);
  assert.match(css, /\.adc-credibility\.is-primary/);
  assert.match(css, /\.adc-credibility\.is-relay/);
  assert.match(css, /\.adc-credibility\.is-lead/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
  assert.doesNotMatch(css, /@media\s*\([^)]*\b(?:max|min)-width\s*:/i);
  assert.doesNotMatch(css, /\.adc-lead-story|\.adc-secondary-story|\.adc-compact-story|\.adc-source-watch/);
  assert.doesNotMatch(css, /linear-gradient\(rgba\(17, 17, 17/);
});

test("public favicon is copied byte-for-byte into the Pages output", async () => {
  const source = await fs.readFile(path.join(rootDir, "apps", "web", "public", "favicon.ico"));
  const output = await fs.readFile(path.join(rootDir, "docs", "favicon.ico"));

  assert.equal(source.readUInt16LE(0), 0);
  assert.equal(source.readUInt16LE(2), 1);
  assert.deepEqual(output, source);

  const appIndex = await fs.readFile(path.join(rootDir, "apps", "web", "index.html"), "utf8");
  assert.match(appIndex, /<link rel="icon" href="\.\/favicon\.ico"/);
  assert.doesNotMatch(appIndex, /<meta\b[^>]*\bname=["']viewport["']/i);
});

test("desktop-only contract rejects project-owned mobile support paths", async () => {
  const policy = await fs.readFile(path.join(rootDir, "docs", "desktop-only-support-policy.md"), "utf8");
  assert.match(policy, /1280x900/);
  assert.match(policy, /手机、平板、窄屏和触摸专用布局/);

  const governedFiles = [
    "apps/web/index.html",
    "apps/web/src/App.tsx",
    "apps/web/src/styles.css",
    "packages/design/src/adc-theme.css",
    "tests/e2e/site.e2e.js"
  ];
  const forbiddenPatterns = [
    ["width-based media query", /@media\s*\([^)]*(?:(?:max|min)-width\s*:|\bwidth\s*[<>=])/i],
    ["viewport meta tag", /<meta\b[^>]*\bname\s*=\s*["']viewport["'][^>]*>/i],
    ["touch-only momentum scrolling", /-webkit-overflow-scrolling:\s*touch/i],
    ["touch-only event handler", /\btouch(?:start|move|end|cancel)\b/i],
    ["coarse-pointer layout branch", /\(\s*(?:pointer\s*:\s*coarse|hover\s*:\s*none)\s*\)/i],
    ["JavaScript viewport-width branch", /(?:window\.innerWidth|document\.documentElement\.clientWidth)\s*(?:<=|>=|<|>)\s*\d+/i]
  ];

  for (const relativePath of governedFiles) {
    const source = await fs.readFile(path.join(rootDir, relativePath), "utf8");
    for (const [label, pattern] of forbiddenPatterns) {
      assert.doesNotMatch(source, pattern, `${relativePath} must not contain ${label}`);
    }
  }

  const e2e = await fs.readFile(path.join(rootDir, "tests", "e2e", "site.e2e.js"), "utf8");
  const viewportSizes = [...e2e.matchAll(/viewport:\s*\{\s*width:\s*(\d+),\s*height:\s*(\d+)/g)]
    .map((match) => [Number(match[1]), Number(match[2])]);
  assert.equal(viewportSizes.length > 0, true);
  assert.deepEqual([...new Set(viewportSizes.map((size) => size.join("x")))], ["1280x900"]);
});

test("static build plan keeps JSON assets and retires legacy HTML surfaces", async () => {
  const plan = await planGeneratedFiles({
    rootDir,
    inputDir: ".tmp/adc-visual-contract-empty-source",
    dataInputDir: ".tmp/adc-visual-contract-empty-data",
    outDir: ".tmp/adc-visual-contract-out"
  });

  for (const expected of [
    "index.html",
    "favicon.ico",
    "assets/adc-home.css",
    "assets/adc-home.js",
    "home.json",
    "articles.json",
    "feed.json",
    "trends.json",
    "data/official-blogs.json",
    "signals/index.json"
  ]) {
    assert.equal(plan.files.includes(expected), true, `plan must retain ${expected}`);
  }
  for (const retired of [
    "ops.html",
    "official-blogs/index.html",
    "assets/style.css",
    "assets/adc-theme.css"
  ]) {
    assert.equal(plan.files.includes(retired), false, `plan must retire ${retired}`);
  }
  assert.equal(plan.files.some((file) => /^reports\/.*\.html$/.test(file)), false);
});
