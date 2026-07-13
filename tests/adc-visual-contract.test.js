import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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
  assert.match(app, /fetchJson<HomeData>\("home\.json"\)/);
  assert.doesNotMatch(app, /fetchJson<[^>]+>\("articles\.json"\)/);
  assert.doesNotMatch(app, /fetchJson<[^>]+>\("feed\.json"\)/);
  assert.doesNotMatch(app, /quality_score/);
  assert.match(app, /data-edition-surface/);
  assert.match(app, /data-lead-story/);
  assert.match(app, /data-secondary-story/);
  assert.match(app, /data-compact-story/);
  assert(app.indexOf("<EditionSurface") < app.indexOf("<SourceWatchRail"), "edition must render before Source Watch");
  assert.match(app, /role="status"/);
  assert.match(app, /aria-live="polite"/);
  assert.match(app, /role="alert"/);
  assert.match(app, /className="adc-skip-link"/);
});

test("React homepage CSS is desktop-only and keeps direct Astryx badge overrides", async () => {
  const css = await fs.readFile(path.join(rootDir, "apps", "web", "src", "styles.css"), "utf8");

  assert.doesNotMatch(css, /body\s*\{[^}]*min-width:\s*1120px/s);
  assert.match(css, /\.astryx-badge/);
  assert.doesNotMatch(css, /@media\s*\([^)]*\b(?:max|min)-width\s*:/i);
  assert.match(css, /\.adc-source-watch h2\s*\{[^}]*color:\s*var\(--adc-card\)/);
  assert.match(css, /\.adc-lead-story/);
  assert.match(css, /\.adc-secondary-story/);
  assert.match(css, /\.adc-compact-story/);
  assert.doesNotMatch(css, /\.adc-metrics\b/);
  assert.match(css, /:focus-visible/);
});

test("public favicon is a multi-size ICO copied byte-for-byte into the Pages output", async () => {
  const sourcePath = path.join(rootDir, "apps", "web", "public", "favicon.ico");
  const outputPath = path.join(rootDir, "docs", "favicon.ico");
  const source = await fs.readFile(sourcePath);
  const output = await fs.readFile(outputPath);

  assert.equal(source.readUInt16LE(0), 0);
  assert.equal(source.readUInt16LE(2), 1);
  const count = source.readUInt16LE(4);
  const sizes = Array.from({ length: count }, (_unused, index) => {
    const offset = 6 + (index * 16);
    return source[offset] || 256;
  });
  assert.deepEqual(sizes, [16, 32, 48, 64, 128, 256]);
  assert.deepEqual(output, source);

  const appIndex = await fs.readFile(path.join(rootDir, "apps", "web", "index.html"), "utf8");
  assert.match(appIndex, /<link rel="icon" href="\.\/favicon\.ico"/);
});

test("desktop-only contract rejects project-owned mobile support paths", async () => {
  const policy = await fs.readFile(path.join(rootDir, "docs", "desktop-only-support-policy.md"), "utf8");
  assert.match(policy, /1280x900/);
  assert.match(policy, /手机、平板、窄屏和触摸专用布局/);
  assert.match(policy, /第三方依赖内部的通用 touch\/pointer\/响应式兼容/);

  const governedFiles = [
    "apps/web/index.html",
    "apps/web/src/styles.css",
    "packages/design/src/adc-theme.css",
    "src/render.js",
    "src/site.js",
    "src/page-checklist.js",
    "scripts/check-daily-page.mjs",
    "tests/e2e/site.e2e.js",
    "tests/skills.test.js",
    ".codex/skills/effective-interact/assets/components/interaction-ui.css",
    ".codex/skills/effective-interact/scripts/create-interaction.mjs",
    ".codex/skills/effective-interact/scripts/validate-interaction.mjs",
    ".codex/skills/html-work-reports/assets/components/report-ui.css",
    ".codex/skills/html-work-reports/scripts/create-report.mjs",
    ".codex/skills/html-work-reports/scripts/validate-html-report.mjs",
    "docs/assets/adc-theme.css",
    "docs/assets/style.css",
    "docs/index.html",
    "docs/ops.html",
    "docs/official-blogs/index.html"
  ];
  governedFiles.push(...(await collectHtmlFiles(path.join(rootDir, ".codex", "skills", "effective-interact", "assets", "templates")))
    .map((file) => path.relative(rootDir, file)));
  governedFiles.push(...(await collectHtmlFiles(path.join(rootDir, ".codex", "skills", "html-work-reports", "assets", "templates")))
    .map((file) => path.relative(rootDir, file)));

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

  const generatedHomeCss = await fs.readFile(path.join(rootDir, "docs", "assets", "adc-home.css"), "utf8");
  assert.doesNotMatch(generatedHomeCss, /@media\s*\(width<=1100px\)\{\.adc-shell/i, "generated homepage must not restore the removed 1100px ADC breakpoint");
  assert.doesNotMatch(generatedHomeCss, /@media\s*\(width<=720px\)\{\.adc-shell/i, "generated homepage must not restore the removed 720px ADC breakpoint");
  assert.doesNotMatch(generatedHomeCss, /@media\s*\(width<=640px\)\{\.adc-report-brand/i, "generated homepage must not restore the removed ADC report-brand breakpoint");

  const interactionValidator = await fs.readFile(path.join(rootDir, ".codex", "skills", "effective-interact", "scripts", "validate-interaction.mjs"), "utf8");
  assert.match(interactionValidator, /Emulation\.setDeviceMetricsOverride[\s\S]*?mobile:\s*false/, "CDP requires an explicit desktop device-emulation flag");
  assert.doesNotMatch(interactionValidator, /mobile:\s*(?:true|width\s*[<>=])/, "interaction validation must never enable device emulation or derive it from viewport width");
  assert.match(interactionValidator, /const browserViewport\s*=\s*\{\s*width:\s*1280,\s*height:\s*900\s*\}/);

  const pageCheckScript = await fs.readFile(path.join(rootDir, "scripts", "check-daily-page.mjs"), "utf8");
  assert.match(pageCheckScript, /const viewport\s*=\s*\{\s*width:\s*1280,\s*height:\s*900\s*\}/);
  assert.match(pageCheckScript, /viewport overrides are unsupported/);
  assert.doesNotMatch(pageCheckScript, /parseViewports|normalizeViewportList|for\s*\(const viewport/);
  for (const overrideArgs of [
    ["--viewports", "390x844"],
    ["1280x900 390x1200"],
    ["1280x900,390x1200"]
  ]) {
    const rejected = spawnSync(process.execPath, ["scripts/check-daily-page.mjs", "--date", "2026-07-09", ...overrideArgs], {
      cwd: rootDir,
      encoding: "utf8"
    });
    assert.equal(rejected.status, 1, `page-check must reject viewport override ${overrideArgs.join(" ")}`);
    assert.match(rejected.stderr, /fixed 1280x900 desktop viewport/);
  }

  const htmlReportValidator = await fs.readFile(path.join(rootDir, ".codex", "skills", "html-work-reports", "scripts", "validate-html-report.mjs"), "utf8");
  assert.match(htmlReportValidator, /newPage\(\{\s*viewport:\s*\{\s*width:\s*1280,\s*height:\s*900\s*\}\s*\}\)/);

  for (const relativePath of ["tests/e2e/site.e2e.js", "tests/skills.test.js"]) {
    const source = await fs.readFile(path.join(rootDir, relativePath), "utf8");
    const viewportSizes = [
      ...source.matchAll(/viewport:\s*\{\s*width:\s*(\d+),\s*height:\s*(\d+)/g),
      ...source.matchAll(/setViewportSize\(\{\s*width:\s*(\d+),\s*height:\s*(\d+)/g)
    ].map((match) => [Number(match[1]), Number(match[2])]);
    assert.equal(viewportSizes.length > 0, true, `${relativePath} must exercise the canonical desktop viewport`);
    assert.deepEqual([...new Set(viewportSizes.map((size) => size.join("x")))], ["1280x900"], `${relativePath} must not exercise other viewport sizes`);
  }

  const activeInstructionFiles = [
    "apps/web/README.md",
    "docs/ai-daily-distribution-testing-prompt-spec.md",
    "docs/skill-hub-frontend-html-capability-evaluation.md",
    "prompts/ai-daily/modules/output-html.md",
    "prompts/ai-daily/modules/structured-report-json.md",
    "prompts/ai-daily/modules/editorial-authority.md",
    ".codex/skills/design-taste-frontend/references/visual-discipline.md",
    ".codex/skills/design-taste-frontend/references/redesign-and-preflight.md",
    ".claude/skills/design-taste-frontend/references/visual-discipline.md",
    ".claude/skills/design-taste-frontend/references/redesign-and-preflight.md",
    "evaluator-rubric.md"
  ];
  const retiredInstruction = /桌面和移动端阅读|在移动视口|移动\/桌面无明显重叠|验证移动视口|移动端不能横向撑破页面|手机端不可读|移动视口建立|日报页、移动视口|Check mobile wrapping|mobile and desktop|responsive rules stay|desktop\/mobile|desktop\/narrow|375x812|390px layout/i;
  for (const relativePath of activeInstructionFiles) {
    const source = await fs.readFile(path.join(rootDir, relativePath), "utf8");
    assert.match(source, /1280x900/, `${relativePath} must name the canonical desktop viewport`);
    assert.doesNotMatch(source, retiredInstruction, `${relativePath} must not restore a retired mobile instruction`);
  }

  const ledger = await fs.readFile(path.join(rootDir, "tasks", "project-recovery-ledger.md"), "utf8");
  const rec330 = ledger.match(/### REC-330[\s\S]*?(?=\n## |\n### REC-331|$)/)?.[0] || "";
  assert.match(rec330, /1280x900/);
  assert.doesNotMatch(rec330, /desktop\/mobile|desktop\/narrow|375x812|390px layout/i);
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
  assert.match(ops, /<link rel="icon" href="favicon\.ico">/);
  assert.match(official, /<link rel="icon" href="\.\.\/favicon\.ico">/);
  for (const dailyReport of [report, historicalReport]) {
    assert.match(dailyReport, /<body data-adc-public-surface="report">/);
    assert.match(dailyReport, /<link[^>]+data-adc-public-theme[^>]+adc-theme\.css/);
    assert.match(dailyReport, /class="adc-report-brand"/);
    assert.match(dailyReport, /<link rel="icon" href="\.\.\/\.\.\/\.\.\/favicon\.ico">/);
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
  assert.equal(plan.files.includes("home.json"), true);
  assert.equal(plan.files.includes("favicon.ico"), true);
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
    assert.doesNotMatch(html, /<meta\b[^>]*\bname\s*=\s*["']viewport["'][^>]*>/i);
    assert.doesNotMatch(html, /@media\s*\([^)]*(?:(?:max|min)-width\s*:|\bwidth\s*[<>=])/i);
    const assetPath = path.resolve(path.dirname(reportPath), links[0][1].split("?")[0]);
    assert.equal(await fs.readFile(assetPath, "utf8"), adcPublicThemeCss + "\n");
  }

  const siteSource = await fs.readFile(path.join(rootDir, "src", "site.js"), "utf8");
  assert.doesNotMatch(siteSource, /ADC_PUBLIC_THEME_START_DATE/);
});
