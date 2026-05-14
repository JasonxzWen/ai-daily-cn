#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const args = {
    json: false,
    skipBrowser: false,
    requireBrowser: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") args.json = true;
    else if (arg === "--skip-browser") args.skipBrowser = true;
    else if (arg === "--require-browser") args.requireBrowser = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else if (!args.file) args.file = arg;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function usage() {
  return [
    "Usage: node .agents/skills/html-work-reports/scripts/validate-html-report.mjs report.html [--json] [--skip-browser] [--require-browser]",
    "",
    "Checks report structure, rich rendering, evidence, controls, and optional browser behavior."
  ].join("\n");
}

function add(checks, name, ok, detail, issues) {
  if (ok) {
    checks.push(name);
    return;
  }
  issues.push(`${name}: ${detail}`);
}

function hasRuntimePins(html) {
  return (
    html.includes("marked@18.0.3") &&
    html.includes("DOMPurify@3.4.2") &&
    html.includes("mermaid@11.15.0") &&
    html.includes("@highlightjs/cdn-assets@11.11.1")
  );
}

function validateStatic(html) {
  const checks = [];
  const issues = [];
  const mode = (html.match(/data-render-mode="([^"]+)"/) || [])[1] || "unknown";
  const runtime = mode === "runtime";
  const runtimePins = hasRuntimePins(html);

  add(checks, "report-root", html.includes("data-html-work-report"), "missing data-html-work-report root", issues);
  add(checks, "non-empty", html.trim().length > 500, "report appears empty or too small", issues);
  add(checks, "safe-content", !/javascript:/i.test(html) && !/onerror=/i.test(html) && !/<script>\s*alert/i.test(html), "unsafe script, handler, or protocol found", issues);

  if (html.includes('data-section-type="markdown"')) {
    add(
      checks,
      "markdown-rendered",
      html.includes("rendered-markdown") || (runtime && html.includes("data-rich-markdown") && html.includes("data-source-fallback") && runtimePins),
      "markdown section is neither pre-rendered nor runtime-declared with fallback",
      issues
    );
    add(
      checks,
      "markdown-structure",
      html.includes("<table>") || html.includes("<ul>") || (runtime && html.includes("data-rich-markdown")),
      "markdown structure was not detected",
      issues
    );
  }

  if (html.includes('data-section-type="mermaid"')) {
    add(
      checks,
      "mermaid-rendered",
      html.includes("<svg") || (runtime && html.includes("data-rich-mermaid") && html.includes("data-mermaid-source") && runtimePins),
      "mermaid section lacks inline SVG or runtime fallback",
      issues
    );
  }

  if (html.includes('data-section-type="code"')) {
    add(
      checks,
      "code-highlighted",
      html.includes('class="hljs') || (runtime && html.includes("language-") && runtimePins),
      "code section lacks highlight markup or runtime declaration",
      issues
    );
    add(checks, "code-paths-inert", html.includes("data-file-path="), "code section lacks inert file path label", issues);
    add(
      checks,
      "source-linked-code-evidence",
      html.includes("data-source-link") && html.includes("data-line="),
      "code section lacks source link or line numbers",
      issues
    );
  }

  if (html.includes('data-section-type="diff"')) {
    add(
      checks,
      "diff-rendered",
      html.includes("diff-panel") && (html.includes("diff-added") || html.includes("diff-removed")),
      "diff section lacks added/removed line markup",
      issues
    );
  }

  add(checks, "evidence-present", html.includes("data-evidence") && html.includes("data-evidence-kind="), "missing evidence blocks", issues);
  add(checks, "verification-present", html.includes("data-verification-status="), "missing verification status blocks", issues);
  add(
    checks,
    "interactive-controls",
    html.includes("data-filter-target") && html.includes("data-tab-group") && html.includes("data-copy-from"),
    "filters, tabs, or copy controls missing",
    issues
  );
  add(checks, "responsive-motion", html.includes("prefers-reduced-motion"), "missing reduced-motion CSS", issues);

  if (runtime) {
    add(checks, "runtime-pins", runtimePins, "runtime mode does not declare pinned dependencies", issues);
    add(checks, "runtime-fallbacks", html.includes("data-source-fallback"), "runtime sections lack source fallback", issues);
  } else {
    add(checks, "self-contained-primary", !html.includes("https://cdn.jsdelivr.net"), "default report includes CDN dependency", issues);
  }

  return { ok: issues.length === 0, checks, issues, mode };
}

async function validateBrowser(file, options) {
  if (options.skipBrowser) {
    return {
      status: "degraded",
      reason: "browser checks skipped by --skip-browser"
    };
  }

  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch (error) {
    return {
      status: options.requireBrowser ? "failed" : "degraded",
      reason: `Playwright unavailable: ${error.message}`
    };
  }

  let browser;
  try {
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 780 } });
    await page.goto(`file://${path.resolve(file).replaceAll("\\", "/")}`);
    const title = await page.locator(".report-title, h1").first().textContent({ timeout: 3000 });
    const bodyBox = await page.locator("body").boundingBox();
    const filter = page.locator("[data-filter-target][data-filter-value]").nth(1);
    if (await filter.count()) await filter.click();
    const tab = page.locator("[data-tab-group][data-tab]").nth(1);
    if (await tab.count()) await tab.click();
    const hiddenPanels = await page.locator("[data-tab-panel-group][hidden], [data-filter-target][hidden]").count();

    if (!title || !bodyBox || bodyBox.width < 300) {
      return { status: "failed", reason: "blank or badly sized narrow viewport" };
    }

    return {
      status: "passed",
      reason: "narrow viewport loaded and basic controls were exercised",
      hiddenPanels
    };
  } catch (error) {
    return {
      status: options.requireBrowser ? "failed" : "degraded",
      reason: error.message
    };
  } finally {
    if (browser) await browser.close();
  }
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      console.log(usage());
      return;
    }
    if (!args.file) throw new Error("report file is required.");

    const file = path.resolve(args.file);
    const html = fs.readFileSync(file, "utf8");
    const staticResult = validateStatic(html);
    const browser = await validateBrowser(file, args);
    const ok = staticResult.ok && browser.status !== "failed";
    const payload = {
      ok,
      file,
      mode: staticResult.mode,
      checks: staticResult.checks,
      issues: staticResult.issues,
      browser
    };

    if (args.json) {
      console.log(JSON.stringify(payload, null, 2));
    } else {
      console.log(`${ok ? "PASS" : "FAIL"} ${file}`);
      for (const check of staticResult.checks) console.log(`- ok: ${check}`);
      for (const issue of staticResult.issues) console.log(`- issue: ${issue}`);
      console.log(`- browser: ${browser.status} (${browser.reason})`);
    }

    if (!ok) process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1].replaceAll("\\", "/")}` || process.argv[1]?.endsWith("validate-html-report.mjs")) {
  await main();
}

export { validateStatic, validateBrowser };
