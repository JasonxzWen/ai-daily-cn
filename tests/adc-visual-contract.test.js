import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { defaultStyleCss, renderOfficialBlogsHtml, renderOpsIndexHtml } from "../src/render.js";
import { applyDailyReportHtmlOverrides, planGeneratedFiles } from "../src/site.js";
import { adcPublicThemeCss } from "../src/adc-theme.js";

const rootDir = path.resolve(".");

async function collectHtmlFiles(directory) {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectHtmlFiles(target));
    } else if (entry.isFile() && entry.name.endsWith(".html")) {
      files.push(target);
    }
  }
  return files.sort();
}

test("React homepage keeps badges monochrome and exposes resilient UI states", async () => {
  const app = await fs.readFile(path.join(rootDir, "apps", "web", "src", "App.tsx"), "utf8");

  assert.doesNotMatch(app, /variant=\{badgeVariant\(/);
  assert.doesNotMatch(app, /function badgeVariant\(/);
  assert.match(app, /Promise\.allSettled\(/);
  assert.match(app, /role="status"/);
  assert.match(app, /aria-live="polite"/);
  assert.match(app, /role="alert"/);
  assert.match(app, /className="adc-skip-link"/);
});

test("React homepage CSS supports narrow viewports and direct Astryx badge overrides", async () => {
  const css = await fs.readFile(path.join(rootDir, "apps", "web", "src", "styles.css"), "utf8");

  assert.doesNotMatch(css, /body\s*\{[^}]*min-width:\s*1120px/s);
  assert.match(css, /\.astryx-badge/);
  assert.match(css, /@media\s*\(max-width:\s*720px\)/);
  assert.match(css, /:focus-visible/);
});

test("static public surfaces declare the shared ADC skin instead of implying separate themes", () => {
  const feed = {
    site_title: "AI 日报",
    updated_at: "2026-07-10T00:00:00.000Z",
    reports: [{ report_date: "2026-07-10", title: "AI 日报", url: "reports/2026/07/2026-07-10.html" }]
  };
  const ops = renderOpsIndexHtml(feed, { topics: [] }, { items: [] });
  const official = renderOfficialBlogsHtml({ records: [], stats: {}, topics: [] });
  const report = applyDailyReportHtmlOverrides("<!doctype html><html><head></head><body><main>日报</main></body></html>", "2026-07-10");
  const historicalReport = applyDailyReportHtmlOverrides("<!doctype html><html><head></head><body><main>历史日报</main></body></html>", "2026-07-08");

  assert.match(defaultStyleCss, /@import url\("\.\/adc-theme\.css\?v=[a-f0-9]{12}"\)/);
  assert.doesNotMatch(defaultStyleCss, /adc-public-theme:v1/);
  assert.match(ops, /<body data-adc-public-surface="ops">/);
  assert.match(official, /<body data-adc-public-surface="official-blogs">/);
  for (const dailyReport of [report, historicalReport]) {
    assert.match(dailyReport, /<body data-adc-public-surface="report">/);
    assert.match(dailyReport, /<link[^>]+data-adc-public-theme[^>]+adc-theme\.css/);
    assert.match(dailyReport, /class="adc-report-brand"/);
    assert.doesNotMatch(dailyReport, /<style data-adc-public-theme>|--adc-paper/);
  }
  assert.match(ops, /<span class="adc-public-brand">ADC\.<\/span>/);
  assert.match(official, /<span class="adc-public-brand">ADC\.<\/span>/);
});

test("static site generation plans the shared ADC theme asset", async () => {
  const plan = await planGeneratedFiles({
    rootDir,
    inputDir: ".tmp/adc-visual-contract-empty-source",
    dataInputDir: ".tmp/adc-visual-contract-empty-data",
    outDir: ".tmp/adc-visual-contract-out"
  });

  assert.equal(plan.files.includes("assets/adc-theme.css"), true);
});

test("generated historical reports share one external ADC theme asset", async () => {
  const reports = await collectHtmlFiles(path.join(rootDir, "docs", "reports"));
  assert.equal(reports.length >= 49, true);

  for (const reportPath of reports) {
    const html = await fs.readFile(reportPath, "utf8");
    const links = [...html.matchAll(/<link rel="stylesheet" data-adc-public-theme href="([^"]+)">/g)];
    assert.equal(links.length, 1, path.relative(rootDir, reportPath));
    assert.match(html, /<body data-adc-public-surface="report">/);
    assert.doesNotMatch(html, /<style data-adc-public-theme>|--adc-paper/);
    const assetPath = path.resolve(path.dirname(reportPath), links[0][1].split("?")[0]);
    assert.equal(await fs.readFile(assetPath, "utf8"), adcPublicThemeCss + "\n");
  }

  const siteSource = await fs.readFile(path.join(rootDir, "src", "site.js"), "utf8");
  assert.doesNotMatch(siteSource, /ADC_PUBLIC_THEME_START_DATE/);
});
