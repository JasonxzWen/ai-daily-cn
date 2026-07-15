#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

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
    "Usage: node skills/effective-interact/scripts/validate-interaction.mjs report.html [--json] [--skip-browser] [--require-browser]",
    "",
    "Checks report structure, runtime rendering state, evidence, controls, and browser visual behavior."
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
    html.includes("Marked@18.0.3") &&
    html.includes("DOMPurify@3.4.2") &&
    html.includes("Mermaid@11.15.0") &&
    html.includes("@highlightjs/cdn-assets@11.11.1") &&
    html.includes("data-runtime-dependency-url=")
  );
}

function hasLikelyMojibake(html) {
  return /\?{4,}|\uFFFD/.test(html);
}

function sanitizeDiagnosticMessage(value) {
  return String(value ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/javascript\s*:/gi, "blocked-protocol:")
    .replace(/\son[a-z]+\s*=/gi, " data-removed=")
    .replace(/file:\/\/\/[^\s'")<>]+/gi, "[local-file]")
    .replace(/[A-Za-z]:[\\/][^\s'")<>]+/g, "[local-path]")
    .replace(/\/(?:Users|home)\/[^\s'")<>]+/gi, "[local-path]")
    .replace(/\b(?:gho|ghp|github_pat)_[A-Za-z0-9_]+/g, "[token]")
    .slice(0, 220);
}

function textFromHtml(fragment) {
  return String(fragment ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function collectTagText(html, tagName) {
  const pattern = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "gi");
  const values = [];
  for (const match of html.matchAll(pattern)) {
    values.push(textFromHtml(match[1]));
  }
  return values.filter(Boolean);
}

function addLengthWarnings(warnings, label, values, maxLength) {
  let count = 0;
  for (const value of values) {
    if (value.length <= maxLength) continue;
    if (count < 5) warnings.push(`${label} too long (${value.length} chars): ${value.slice(0, 80)}`);
    count += 1;
  }
  if (count > 5) warnings.push(`${label} too long: ${count - 5} more item(s) omitted`);
}

function collectReadabilityWarnings(documentMarkup) {
  const warnings = [];
  addLengthWarnings(warnings, "paragraph", collectTagText(documentMarkup, "p"), 180);
  addLengthWarnings(warnings, "bullet", collectTagText(documentMarkup, "li"), 120);
  addLengthWarnings(warnings, "table cell", [
    ...collectTagText(documentMarkup, "td"),
    ...collectTagText(documentMarkup, "th")
  ], 110);
  if (!/<strong\b/i.test(documentMarkup) && !/<mark\b/i.test(documentMarkup)) {
    warnings.push('missing visual anchors: add <strong> or <mark class="text-highlight"> to key conclusions, risks, changes, or verification results');
  }
  return warnings;
}

function collectDecisionBriefWarnings(documentMarkup) {
  const warnings = [];
  const hero = documentMarkup.match(/<header\b(?=[^>]*report-hero)[\s\S]*?<\/header>/i)?.[0] || "";
  const summaryBlock = hero.match(/<p\b(?=[^>]*hero-summary-text)[^>]*>[\s\S]*?<\/p>/i)?.[0]
    || hero.match(/<p\b[^>]*>[\s\S]*?<\/p>/i)?.[0]
    || "";
  const summaryText = textFromHtml(summaryBlock);
  const blufPattern = /^(?:结论|判断|决定|建议|风险|状态|完成|通过|阻塞|需要|已|未|可以|不能|Conclusion|Decision|Recommendation|Status|Done|Blocked)\b|^(?:\*\*)?(?:结论|判断|决定|建议|风险|状态)[：:]/i;
  const claimIds = new Set([...documentMarkup.matchAll(/data-claim-id="([^"]+)"/gi)].map((match) => match[1]));
  const hasNextAction = /id="next-actions"|data-section-type="actions"|data-copy-from="#next-action-list"/i.test(documentMarkup);

  if (!summaryText || summaryText.length > 90 || !blufPattern.test(summaryText)) {
    warnings.push("advisory: decision brief: lead with BLUF in the first sentence and keep it under 90 chars");
  }

  if (claimIds.size > 3) {
    warnings.push(`advisory: decision brief: keep top-level claims to 3 or fewer; found ${claimIds.size}`);
  }

  if (!hasNextAction) {
    warnings.push("advisory: decision brief: add a next action or CTA when the report is a handoff, review, or status decision");
  }

  return warnings;
}

function collectRichContentOpportunityWarnings(documentMarkup) {
  const warnings = [];
  const text = textFromHtml(documentMarkup);
  const lower = text.toLowerCase();
  const hasMermaid = documentMarkup.includes('data-section-type="mermaid"');
  const hasStructuredFlow = hasMermaid || /data-section-type="(?:data-table|chart|timeline|decision-matrix|tabs|filterable-cards)"/.test(documentMarkup);
  const hasCodeOrDiff = /data-section-type="(?:code|diff)"/.test(documentMarkup);
  const flowTerms = [
    "流程", "链路", "路由", "触发", "调用", "架构", "数据流", "状态机", "依赖关系", "决策链路",
    "flow", "workflow", "routing", "route", "trigger", "call path", "sequence", "architecture", "data-flow", "pipeline", "state machine"
  ];
  const fileLinePattern = /(?:^|[\s>(])(?:\.{1,2}\/|[A-Za-z0-9_.-]+\/)[A-Za-z0-9_./-]+\.(?:ts|tsx|js|jsx|mjs|cjs|md|json|css|html|py|ps1|yml|yaml|toml|rs|go|java|cs|cpp|h):\d+\b/;
  const hasFileLineEvidence = /data-file-path="[^"]+"/i.test(documentMarkup) && /data-line="\d+"/i.test(documentMarkup)
    || /data-source-link/i.test(documentMarkup)
    || fileLinePattern.test(text);

  if (!hasStructuredFlow && flowTerms.some((term) => lower.includes(term.toLowerCase()))) {
    warnings.push("advisory: rich content opportunity: consider Mermaid only when flow, routing, call-path, architecture, or trigger sequences would be faster than prose");
  }

  if (!hasCodeOrDiff && hasFileLineEvidence) {
    warnings.push("advisory: rich content opportunity: consider code or diff only when file-and-line evidence is central to the report");
  }

  return warnings;
}

function collectVisualStructureWarnings(documentMarkup) {
  const warnings = [];
  const structuredTypes = new Set([
    "summary-cards",
    "data-table",
    "mermaid",
    "code",
    "diff",
    "timeline",
    "evidence",
    "decision-matrix",
    "tabs",
    "filterable-cards",
    "chart"
  ]);
  const sectionTypes = [...String(documentMarkup || "").matchAll(/data-section-type="([^"]+)"/gi)]
    .map((match) => String(match[1] || "").trim())
    .filter(Boolean);
  const hasStructuredSection = sectionTypes.some((type) => structuredTypes.has(type));
  const hasRenderedTable = /<table\b/i.test(documentMarkup);

  if (!hasStructuredSection && !hasRenderedTable) {
    warnings.push("advisory: visual structure gate: unless the report is intentionally plain-brief, add at least one visible structure such as cards, a table, matrix, timeline, flow, source-linked code/evidence, or filterable layout");
  }

  return warnings;
}

function collectRichRenderWarnings(html, mode) {
  const warnings = [];
  const value = String(html || "");

  if (value.includes('data-mermaid-renderer="fallback"')) {
    warnings.push("advisory: mermaid fallback: regenerate with --browser-mermaid, use runtime-cdn with --require-browser, or replace the diagram with a table/timeline before handoff");
  }

  if (/data-rich-kind="(?:markdown|code|mermaid)"[^>]*data-render-state="(?:degraded|failed)"|data-render-state="(?:degraded|failed)"[^>]*data-rich-kind="(?:markdown|code|mermaid)"/i.test(value)) {
    warnings.push("advisory: rich render degraded: markdown, code, or Mermaid section is not handoff-ready");
  }

  if (mode === "runtime-cdn" && /data-rich-kind="(?:markdown|code|mermaid)"[^>]*data-render-state="pending"|data-render-state="pending"[^>]*data-rich-kind="(?:markdown|code|mermaid)"/i.test(value)) {
    warnings.push("advisory: runtime rich render pending: run validate-interaction.mjs --require-browser before handoff");
  }

  return warnings;
}

function collectStyleBlocks(html) {
  return [...String(html || "").matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)]
    .map((match) => match[1] || "");
}

function collectAestheticPreflightWarnings(html, documentMarkup) {
  const warnings = [];
  const styleText = collectStyleBlocks(html).join("\n");
  const styleLower = styleText.toLowerCase();
  const documentLower = String(documentMarkup || "").toLowerCase();
  const fullLower = `${styleLower}\n${documentLower}`;
  const purpleTell = /#(?:a855f7|8b5cf6|7c3aed|6d28d9|9333ea|4f46e5)\b|\b(?:ai-purple|purple-\d+|violet-\d+|from-purple|to-purple|blue glow|mesh gradient)\b/i;
  const defaultCardTell = /\b(?:default-card|feature-card|pricing-card|card-grid|three equal feature cards)\b/i;
  const splitHeaderTell = /\b(?:split-header|section-numbering|scroll to explore|version footer)\b/i;
  const sectionTags = [...String(documentMarkup || "").matchAll(/<section\b[^>]*>/gi)].map((match) => match[0]);
  const sectionTypes = sectionTags.map((tag) => attrValue(tag, "data-section-type")).filter(Boolean);
  const typeCounts = new Map();

  for (const type of sectionTypes) {
    typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
  }

  const dominantTypeCount = Math.max(0, ...typeCounts.values());
  if (purpleTell.test(fullLower)) {
    warnings.push("advisory: aesthetic preflight: avoid AI-purple or default blue/purple glow unless brand or source evidence requires it");
  }

  if (defaultCardTell.test(fullLower)) {
    warnings.push("advisory: aesthetic preflight: audit default-card grids; cards should clarify hierarchy, status, evidence, or options");
  }

  if (splitHeaderTell.test(fullLower)) {
    warnings.push("advisory: aesthetic preflight: avoid decorative split headers, scroll cues, version footers, and section-numbering labels in report artifacts");
  }

  if (sectionTypes.length >= 6 && typeCounts.size <= 2 && dominantTypeCount >= sectionTypes.length - 1) {
    warnings.push("advisory: aesthetic preflight: vary section layout families in long HTML reports instead of repeating one section shape");
  }

  const hero = String(documentMarkup || "").match(/<header\b(?=[^>]*report-hero)[\s\S]*?<\/header>/i)?.[0] || "";
  const heroTitle = collectTagText(hero, "h1")[0] || "";
  if (heroTitle.length > 120 || heroTitle.split(/\s+/).filter(Boolean).length > 18) {
    warnings.push("advisory: aesthetic preflight: keep report hero titles compact; use sections for nuance instead of billboard-scale copy");
  }

  if (/(?:transition|animation|@keyframes|scroll-behavior:\s*smooth)/i.test(styleText) && !/prefers-reduced-motion/i.test(styleText)) {
    warnings.push("advisory: aesthetic preflight: motion or smooth scrolling needs prefers-reduced-motion coverage");
  }

  return warnings;
}

function attrValue(tag, name) {
  const match = String(tag || "").match(new RegExp(`${name}="([^"]*)"`, "i"));
  return match ? match[1] : "";
}

function metaContent(documentMarkup, name) {
  const pattern = new RegExp(`<meta\\b(?=[^>]*name="${name}")[^>]*>`, "i");
  const tag = String(documentMarkup || "").match(pattern)?.[0] || "";
  return attrValue(tag, "content");
}

function collectHandoffDurabilityWarnings(documentMarkup) {
  const htmlTag = String(documentMarkup || "").match(/<html\b[^>]*>/i)?.[0] || "";
  const hero = String(documentMarkup || "").match(/<header\b(?=[^>]*report-hero)[\s\S]*?<\/header>/i)?.[0] || "";
  const artifactKind = attrValue(htmlTag, "data-artifact-kind") || attrValue(hero, "data-artifact-kind") || attrValue(String(documentMarkup || ""), "data-artifact-kind");
  const durableKinds = new Set(["handoff", "review", "status", "research", "decision", "explainer"]);
  const shouldHaveDurability = durableKinds.has(artifactKind);
  const sourcePath = attrValue(htmlTag, "data-handoff-source-path") || metaContent(documentMarkup, "handoff-source-path");
  const regenerationCommand = attrValue(htmlTag, "data-handoff-regeneration-command") || metaContent(documentMarkup, "handoff-regeneration-command");

  if (!shouldHaveDurability || (sourcePath && regenerationCommand)) return [];
  return ["advisory: handoff durability: add data-handoff-source-path and data-handoff-regeneration-command so ignored HTML artifacts can be regenerated"];
}

function normalizeFragmentId(value) {
  return String(value || "")
    .replace(/^#/, "")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

function collectNavigationOrderIssues(documentMarkup) {
  const issues = [];
  const nav = documentMarkup.match(/<nav\b(?=[^>]*data-report-nav)[\s\S]*?<\/nav>/i)?.[0] || "";
  if (!nav) return issues;

  const navIds = [...nav.matchAll(/<a\b(?=[^>]*data-nav-link)[^>]*href="([^"]+)"/gi)]
    .map((match) => normalizeFragmentId(match[1]))
    .filter((id) => id && id !== "report-top");
  if (navIds.length === 0) return issues;

  const sectionIds = [...documentMarkup.matchAll(/<section\b[^>]*>/gi)]
    .map((match) => match[0])
    .filter((tag) => tag.includes("data-section-type=") || /id="(?:evidence|verification|next-actions)"/i.test(tag))
    .map((tag) => attrValue(tag, "id"))
    .filter(Boolean);
  const sectionIdSet = new Set(sectionIds);
  const missingTargets = navIds.filter((id) => !sectionIdSet.has(id));
  if (missingTargets.length > 0) {
    issues.push(`navigation links target missing sections: ${missingTargets.slice(0, 5).join(", ")}`);
  }

  const navOrder = navIds.filter((id) => sectionIdSet.has(id));
  const bodyOrder = sectionIds.filter((id) => navIds.includes(id));
  if (navOrder.length > 1 && bodyOrder.length > 1 && navOrder.join(" > ") !== bodyOrder.join(" > ")) {
    issues.push(`navigation order differs from body order (nav: ${navOrder.join(" > ")}; body: ${bodyOrder.join(" > ")})`);
  }

  return issues;
}

function collectClaimIssues(documentMarkup) {
  const issues = [];
  const claimBlocks = [...documentMarkup.matchAll(/<([a-z0-9]+)\b[^>]*data-claim-id="([^"]*)"[^>]*>[\s\S]*?(?:<\/\1>|$)/gi)];
  const importantKinds = new Set(["conclusion", "metric", "trend", "risk", "recommendation"]);
  for (const match of claimBlocks) {
    const block = match[0];
    const opening = block.match(/^<[^>]+>/)?.[0] || "";
    const id = attrValue(opening, "data-claim-id") || textFromHtml(block).slice(0, 60) || "unknown";
    const kind = attrValue(opening, "data-claim-kind") || "conclusion";
    const confidence = attrValue(opening, "data-claim-confidence");
    if (importantKinds.has(kind) && confidence !== "low" && !block.includes("data-claim-evidence")) {
      issues.push(`claim ${id} lacks evidence for ${kind}`);
    }
  }
  return issues;
}

function collectChartIssues(documentMarkup) {
  const issues = [];
  const chartSections = [...documentMarkup.matchAll(/<section\b(?=[^>]*data-chart-section)([\s\S]*?)<\/section>/gi)];
  for (const match of chartSections) {
    const block = match[0];
    const opening = block.match(/^<section\b[^>]*>/i)?.[0] || "";
    const id = attrValue(opening, "id") || attrValue(opening, "data-chart-type") || "unknown";
    if (!attrValue(opening, "data-chart-alt")) issues.push(`chart ${id} lacks alt text`);
    if (!block.includes("data-chart-takeaway")) issues.push(`chart ${id} lacks textual takeaway`);
    if (!block.includes("data-chart-source")) issues.push(`chart ${id} lacks source metadata`);
    if (!block.includes("data-chart-table-fallback")) issues.push(`chart ${id} lacks table fallback`);
    if (block.includes("data-chart-visual") && !block.includes("data-chart-table-fallback")) {
      issues.push(`chart ${id} requires hover or visual-only data`);
    }
  }
  return issues;
}

function collectRuntimeAuditIssues(documentMarkup) {
  const issues = [];
  const dependencyTags = [...documentMarkup.matchAll(/<article\b[^>]*data-runtime-dependency="[^"]+"[^>]*>/gi)].map((match) => match[0]);
  for (const tag of dependencyTags) {
    const id = attrValue(tag, "data-runtime-dependency") || "unknown";
    const version = attrValue(tag, "data-runtime-dependency-version");
    const url = attrValue(tag, "data-runtime-dependency-url");
    const integrity = attrValue(tag, "data-runtime-dependency-integrity");
    const exemption = attrValue(tag, "data-runtime-dependency-integrity-exemption");
    if (!version || !url) issues.push(`runtime dependency ${id} is not pinned`);
    if (!integrity && !exemption) issues.push(`runtime dependency ${id} lacks integrity metadata or exemption`);
  }
  return issues;
}

function collectSectionBlocks(documentMarkup) {
  return [...String(documentMarkup || "").matchAll(/<section\b(?=[^>]*data-section-type=)[^>]*>[\s\S]*?<\/section>/gi)]
    .map((match) => match[0]);
}

function openingTag(block) {
  return String(block || "").match(/^<section\b[^>]*>/i)?.[0] || "";
}

function hasHighlightToken(block) {
  return /class="[^"]*\bhljs-(?:keyword|title|type|attr|attribute|string|comment|number|literal|built_in)\b/i.test(String(block || ""));
}

function collectCodeHighlightIssues(documentMarkup, runtime, runtimePins) {
  const issues = [];
  const blocks = collectSectionBlocks(documentMarkup)
    .filter((block) => attrValue(openingTag(block), "data-section-type") === "code");
  for (const block of blocks) {
    const tag = openingTag(block);
    const id = attrValue(tag, "id") || "code";
    const state = attrValue(tag, "data-render-state");
    if (runtime) {
      if (!(block.includes("data-rich-code") && block.includes("language-") && runtimePins)) {
        issues.push(`${id} lacks runtime code declaration`);
      }
      continue;
    }
    if (state === "degraded") continue;
    if (!hasHighlightToken(block)) issues.push(`${id} has no syntax highlight tokens`);
  }
  return issues;
}

function collectVisibleComponentIssues(documentMarkup) {
  const issues = [];
  for (const block of collectSectionBlocks(documentMarkup)) {
    const tag = openingTag(block);
    const id = attrValue(tag, "id") || "section";
    const type = attrValue(tag, "data-section-type");
    const text = textFromHtml(block);
    if (!text) {
      issues.push(`${id} ${type} has no visible text`);
      continue;
    }

    if (type === "summary-cards") {
      const strongValues = collectTagText(block, "strong");
      if (strongValues.length === 0) issues.push(`${id} summary-cards has no visible card values`);
      if (/<strong\b[^>]*>\s*<\/strong>/i.test(block)) issues.push(`${id} summary-cards contains an empty card value`);
    } else if (type === "data-table") {
      const cells = collectTagText(block, "td");
      if (cells.length === 0 || cells.every((cell) => !cell)) issues.push(`${id} data-table has no visible body cells`);
    } else if (type === "timeline") {
      const hasSemanticList = collectTagText(block, "li").length > 0;
      const hasStepShape = /<strong\b[^>]*>\s*\S[\s\S]*?<\/strong>/i.test(block) && /<span\b[^>]*>\s*\S[\s\S]*?<\/span>/i.test(block);
      if (!hasSemanticList && !hasStepShape) {
        issues.push(`${id} timeline has empty step labels or details`);
      }
    } else if (type === "decision-matrix") {
      if (collectTagText(block, "h3").length === 0 || collectTagText(block, "li").length === 0) {
        issues.push(`${id} decision-matrix has no visible option names or points`);
      }
    } else if (type === "actions") {
      if (collectTagText(block, "li").length === 0) issues.push(`${id} actions has no visible action items`);
    } else if (type === "tabs") {
      if (collectTagText(block, "button").length === 0 || !/class="[^"]*\btab-panel\b/i.test(block)) {
        issues.push(`${id} tabs has no visible tab labels or panels`);
      }
    } else if (type === "filterable-cards") {
      if (collectTagText(block, "h3").length === 0 || collectTagText(block, "p").length === 0) {
        issues.push(`${id} filterable-cards has no visible card titles or bodies`);
      }
    }
  }
  return issues;
}

function collectStatusConsistencyIssues(documentMarkup) {
  const htmlTag = String(documentMarkup || "").match(/<html\b[^>]*>/i)?.[0] || "";
  const status = attrValue(htmlTag, "data-status");
  if (status !== "complete") return [];

  const issues = [];
  const unsettledSections = [...String(documentMarkup || "").matchAll(/data-section-status="(pending|draft|review|blocked|failed|fail|not-run)"/gi)]
    .map((match) => match[1]);
  const badVerification = [...String(documentMarkup || "").matchAll(/data-verification-status="(fail|not-run)"/gi)]
    .map((match) => match[1]);

  if (unsettledSections.length > 0) {
    issues.push(`complete report includes unsettled section statuses: ${[...new Set(unsettledSections)].join(", ")}`);
  }
  if (badVerification.length > 0) {
    issues.push(`complete report includes failed or not-run verification: ${[...new Set(badVerification)].join(", ")}`);
  }
  return issues;
}

function hasSafeSinks(html) {
  return !/javascript:/i.test(html)
    && !/\son[a-z]+\s*=/i.test(html)
    && !/<script>\s*alert/i.test(html)
    && !/<canvas\b/i.test(html);
}

function validateStatic(html) {
  const checks = [];
  const issues = [];
  const mode = (html.match(/data-render-mode="([^"]+)"/) || [])[1] || "unknown";
  const runtime = mode === "runtime-cdn";
  const runtimePins = hasRuntimePins(html);
  const documentMarkup = html.split(/<script[\s>]/i)[0] || html;
  const hasRichSections = /data-rich-section|data-section-type="(markdown|mermaid|code|diff)"/.test(html);
  const hasEvidenceSection = html.includes('id="evidence"') || html.includes('data-section-type="evidence"');
  const hasVerificationSection = html.includes('id="verification"') || html.includes('data-verification');
  const hasDataTable = html.includes('data-section-type="data-table"');
  const hasInteractiveControls = /<(button|input|select)[^>]+data-(filter-target|tab-group|copy-from|copy-text|search-for)/.test(documentMarkup);
  const visibleComponentIssues = collectVisibleComponentIssues(documentMarkup);
  const statusConsistencyIssues = collectStatusConsistencyIssues(documentMarkup);
  const warnings = collectReadabilityWarnings(documentMarkup);
  warnings.push(...collectDecisionBriefWarnings(documentMarkup));
  warnings.push(...collectVisualStructureWarnings(documentMarkup));
  warnings.push(...collectRichContentOpportunityWarnings(documentMarkup));
  warnings.push(...collectRichRenderWarnings(html, mode));
  warnings.push(...collectAestheticPreflightWarnings(html, documentMarkup));
  warnings.push(...collectHandoffDurabilityWarnings(documentMarkup));

  add(checks, "report-root", html.includes("data-html-work-report"), "missing data-html-work-report root", issues);
  add(checks, "render-mode", ["runtime-cdn", "pre-rendered", "fallback-only"].includes(mode), `unexpected render mode: ${mode}`, issues);
  add(checks, "non-empty", html.trim().length > 500, "report appears empty or too small", issues);
  add(checks, "utf8-mojibake-free", !hasLikelyMojibake(html), "likely mojibake detected; ensure report input is UTF-8 and contains no continuous half-width question marks", issues);
  add(checks, "semantic-structure", /<html\b[^>]*lang=/i.test(html) && /<title>[^<]+<\/title>/i.test(html) && /<main\b/i.test(html) && /<h1\b/i.test(html), "missing title, language, main landmark, or h1", issues);
  add(checks, "safe-content", !/javascript:/i.test(html) && !/onerror=/i.test(html) && !/<script>\s*alert/i.test(html), "unsafe script, handler, or protocol found", issues);
  add(checks, "safe-sinks", hasSafeSinks(html), "unsafe script, handler, protocol, or active canvas sink found", issues);
  add(checks, "grouped-navigation", html.includes("data-report-nav") && html.includes("report-nav-group") && html.includes("data-nav-link"), "missing grouped navigation", issues);
  const navigationOrderIssues = collectNavigationOrderIssues(documentMarkup);
  add(checks, "navigation-order", navigationOrderIssues.length === 0, navigationOrderIssues.join("; "), issues);
  checks.push("decision-brief-scan");
  checks.push("visual-structure-gate-scan");
  checks.push("rich-content-opportunity-scan");
  checks.push("aesthetic-preflight-scan");
  add(checks, "section-groups", html.includes("data-section-group="), "sections lack group metadata", issues);
  add(checks, "intent-metadata", html.includes("data-report-intent") && html.includes("data-primary-question=") && html.includes("data-time-budget="), "missing report intent metadata", issues);
  if (hasRichSections) add(checks, "source-fallbacks", html.includes("data-source-fallback"), "rich sections lack source fallback markers", issues);
  add(checks, "render-states", html.includes("data-render-state=") || html.includes("data-runtime-state="), "missing render state metadata", issues);
  add(checks, "visible-component-content", visibleComponentIssues.length === 0, visibleComponentIssues.join("; "), issues);
  add(checks, "status-consistency", statusConsistencyIssues.length === 0, statusConsistencyIssues.join("; "), issues);

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
      html.includes("<svg") || (runtime && html.includes("data-rich-mermaid-target") && html.includes("data-mermaid-source") && runtimePins),
      "mermaid section lacks inline SVG or runtime fallback",
      issues
    );
  }

  if (html.includes('data-section-type="code"')) {
    const codeHighlightIssues = collectCodeHighlightIssues(documentMarkup, runtime, runtimePins);
    add(
      checks,
      "code-highlighted",
      codeHighlightIssues.length === 0,
      codeHighlightIssues.join("; "),
      issues
    );
    add(checks, "code-paths-inert", html.includes("data-file-path="), "code section lacks inert file path label", issues);
    add(
      checks,
      "source-linked-code-evidence",
      html.includes("data-source-link") && (html.includes("data-line=") || html.includes("data-start-line=")),
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

  if (hasDataTable) {
    add(checks, "data-table-rendered", html.includes("report-data-table") && html.includes("data-report-data-table") && html.includes("data-table-cell"), "data-table section lacks table component markers", issues);
    add(checks, "data-table-hover", html.includes("table-row-highlight") && html.includes("table-column-highlight") && html.includes("table-cell-highlight"), "data-table section lacks row, column, and cell hover states", issues);
  }

  if (hasEvidenceSection) add(checks, "evidence-present", html.includes("data-evidence") && html.includes("data-evidence-kind="), "missing evidence blocks", issues);
  if (hasVerificationSection) add(checks, "verification-present", html.includes("data-verification-status="), "missing verification status blocks", issues);
  if (hasInteractiveControls) add(checks, "interactive-controls", true, "", issues);
  const claimIssues = collectClaimIssues(documentMarkup);
  if (html.includes("data-claim-id=")) add(checks, "claims-traceable", claimIssues.length === 0, claimIssues.join("; "), issues);
  const chartIssues = collectChartIssues(documentMarkup);
  if (html.includes("data-chart-section")) add(checks, "chart-accessibility", chartIssues.length === 0, chartIssues.join("; "), issues);
  add(checks, "responsive-motion", html.includes("prefers-reduced-motion"), "missing reduced-motion CSS", issues);

  if (runtime) {
    const runtimeAuditIssues = collectRuntimeAuditIssues(documentMarkup);
    add(checks, "runtime-pins", runtimePins, "runtime-cdn mode does not declare pinned dependencies", issues);
    add(checks, "runtime-dependency-manifest", html.includes("data-runtime-dependencies"), "missing runtime dependency manifest", issues);
    add(checks, "runtime-audit", runtimeAuditIssues.length === 0, runtimeAuditIssues.join("; "), issues);
  } else if (mode === "pre-rendered") {
    add(checks, "self-contained-primary", !html.includes("https://cdn.jsdelivr.net"), "pre-rendered report includes CDN dependency", issues);
  }

  return { ok: issues.length === 0, checks, issues, warnings, mode };
}

const browserViewports = [
  { width: 390, height: 780 },
  { width: 768, height: 900 },
  { width: 1440, height: 1000 }
];

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function transformScale(value) {
  const text = String(value || "");
  if (!text || text === "none") return 1;
  const matrix = text.match(/^matrix\(([^,]+),[^,]+,[^,]+,([^,]+),/);
  if (matrix) return Math.max(Math.abs(Number(matrix[1])), Math.abs(Number(matrix[2])));
  const matrix3d = text.match(/^matrix3d\(([^,]+),[^,]+,[^,]+,[^,]+,[^,]+,([^,]+),/);
  if (matrix3d) return Math.max(Math.abs(Number(matrix3d[1])), Math.abs(Number(matrix3d[2])));
  return 1;
}

function chromeCandidates() {
  return [
    process.env.HTML_WORK_REPORT_CHROME,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "google-chrome",
    "chromium",
    "chromium-browser"
  ].filter(Boolean);
}

function findBrowserExecutable() {
  for (const candidate of chromeCandidates()) {
    if (candidate.includes("\\") || candidate.includes("/")) {
      if (fs.existsSync(candidate)) return candidate;
    } else {
      return candidate;
    }
  }
  return null;
}

async function waitForFile(file, timeoutMs, isStopped) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (fs.existsSync(file)) return;
    if (isStopped?.()) throw new Error("browser process exited before opening DevTools");
    await delay(100);
  }
  throw new Error(`timed out waiting for ${file}`);
}

async function launchCdpBrowser() {
  const executable = findBrowserExecutable();
  if (!executable) throw new Error("Chrome or Edge executable not found");

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "html-report-cdp-"));
  const processHandle = spawn(
    executable,
    [
      "--headless=new",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--disable-extensions",
      "--disable-default-apps",
      "--disable-background-networking",
      "--disable-sync",
      "--no-first-run",
      "--no-default-browser-check",
      "--remote-debugging-port=0",
      `--user-data-dir=${userDataDir}`,
      "about:blank"
    ],
    { stdio: "ignore", windowsHide: true }
  );

  const portFile = path.join(userDataDir, "DevToolsActivePort");
  await waitForFile(portFile, 15000, () => processHandle.exitCode !== null);
  const [portText] = fs.readFileSync(portFile, "utf8").trim().split(/\r?\n/);
  const port = Number(portText);
  if (!Number.isFinite(port)) throw new Error("browser did not publish a DevTools port");

  return { processHandle, port, userDataDir, executable };
}

async function stopCdpBrowser(browser) {
  if (!browser) return;
  if (browser.processHandle?.pid) {
    if (process.platform === "win32") {
      await new Promise((resolve) => {
        const killer = spawn("taskkill", ["/pid", String(browser.processHandle.pid), "/T", "/F"], {
          stdio: "ignore",
          windowsHide: true
        });
        killer.once("exit", resolve);
        killer.once("error", resolve);
      });
    } else {
      browser.processHandle.kill("SIGKILL");
    }
  }
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      fs.rmSync(browser.userDataDir, { recursive: true, force: true });
      return;
    } catch {
      await delay(100);
    }
  }
}

async function createCdpTarget(port, url) {
  const endpoint = `http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`;
  let response = await fetch(endpoint, { method: "PUT" });
  if (!response.ok) response = await fetch(endpoint);
  if (!response.ok) throw new Error(`could not create DevTools page: ${response.status}`);
  const target = await response.json();
  if (!target.webSocketDebuggerUrl) throw new Error("DevTools page did not include a WebSocket URL");
  return target.webSocketDebuggerUrl;
}

class CdpClient {
  constructor(url) {
    this.url = url;
    this.id = 0;
    this.pending = new Map();
    this.socket = null;
  }

  async connect() {
    if (typeof WebSocket === "undefined") throw new Error("WebSocket is unavailable in this runtime");
    await new Promise((resolve, reject) => {
      const socket = new WebSocket(this.url);
      this.socket = socket;
      socket.onopen = resolve;
      socket.onerror = () => reject(new Error("DevTools WebSocket failed to open"));
      socket.onmessage = (event) => this.handleMessage(event.data);
      socket.onclose = () => {
        for (const { reject: rejectPending } of this.pending.values()) rejectPending(new Error("DevTools WebSocket closed"));
        this.pending.clear();
      };
    });
  }

  handleMessage(data) {
    const text = typeof data === "string" ? data : Buffer.from(data).toString("utf8");
    const message = JSON.parse(text);
    if (!message.id || !this.pending.has(message.id)) return;
    const pending = this.pending.get(message.id);
    clearTimeout(pending.timer);
    this.pending.delete(message.id);
    if (message.error) pending.reject(new Error(message.error.message || "DevTools command failed"));
    else pending.resolve(message.result || {});
  }

  send(method, params = {}, timeoutMs = 15000) {
    const id = ++this.id;
    const payload = JSON.stringify({ id, method, params });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(payload);
    });
  }

  close() {
    this.socket?.close();
  }
}

async function evaluate(client, expression, timeoutMs = 15000) {
  const result = await client.send(
    "Runtime.evaluate",
    { expression, returnByValue: true, awaitPromise: true },
    timeoutMs
  );
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "browser evaluation failed");
  return result.result?.value;
}

async function waitForDocument(client) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(client, "document.readyState", 3000).catch(() => "loading");
    if (state === "interactive" || state === "complete") return;
    await delay(100);
  }
  throw new Error("browser document did not become ready");
}

async function settleRuntimeCdp(client, mode) {
  if (mode !== "runtime-cdn") return { state: "not-runtime", reason: "pre-rendered or fallback-only report" };

  let latest = {};
  for (let attempt = 0; attempt < 80; attempt += 1) {
    latest = await evaluate(
      client,
      `(() => {
        const sections = Array.from(document.querySelectorAll("[data-rich-section]"));
        const dependencyNodes = Array.from(document.querySelectorAll("[data-runtime-dependency-state]"));
        const dependencyStates = dependencyNodes.map((node) => node.dataset.runtimeDependencyState || "unknown");
        const pending = sections.filter((section) => (section.dataset.renderState || "pending") === "pending").length;
        const failed = sections.filter((section) => (section.dataset.renderState || "") === "failed").length;
        const degraded = sections.filter((section) => (section.dataset.renderState || "") === "degraded").length;
        return {
          state: document.documentElement.dataset.runtimeState || "unknown",
          pending,
          failed,
          degraded,
          dependencyStates
        };
      })()`,
      3000
    );
    if (latest.pending === 0 && latest.state !== "pending") return latest;
    await delay(250);
  }
  return latest;
}

async function inspectViewportCdp(client, width, height) {
  await client.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 600
  });
  await delay(150);
  return await evaluate(
    client,
    `(() => {
      const doc = document.documentElement;
      const body = document.body;
      const overflowX = Math.max(doc.scrollWidth, body.scrollWidth) - window.innerWidth;
      const title = document.querySelector(".report-title, h1")?.textContent?.trim() || "";
      const regions = Array.from(document.querySelectorAll("main > .report-hero, .report-layout > .report-nav, .report-section-stack > section"))
        .filter((node) => {
          const style = getComputedStyle(node);
          const rect = node.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
        })
        .map((node) => {
          const rect = node.getBoundingClientRect();
          return {
            selector: node.id ? "#" + node.id : node.className || node.tagName,
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height
          };
        });

      const overlaps = [];
      for (let i = 0; i < regions.length; i += 1) {
        for (let j = i + 1; j < regions.length; j += 1) {
          const a = regions[i];
          const b = regions[j];
          const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
          const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
          const area = x * y;
          if (area > 12) overlaps.push(a.selector + " overlaps " + b.selector);
        }
      }

      const clippedText = Array.from(document.querySelectorAll(".report-hero *, .report-section-stack section *"))
        .filter((node) => {
          if (!(node instanceof HTMLElement)) return false;
          if (node.closest(".report-nav, pre, code, svg, .mermaid-frame, .code-panel, .diff-panel")) return false;
          if (!/^(H1|H2|H3|P|LI|SPAN|STRONG|EM|TD|TH|A|DIV)$/.test(node.tagName)) return false;
          if (!node.textContent || !node.textContent.trim()) return false;
          const style = getComputedStyle(node);
          if (style.overflowX === "auto" || style.overflowX === "scroll") return false;
          const rect = node.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0 && node.scrollWidth - node.clientWidth > 3;
        })
        .slice(0, 8)
        .map((node) => (node.id ? "#" + node.id : node.className || node.tagName) + " clipped by " + (node.scrollWidth - node.clientWidth) + "px");

      return {
        width: window.innerWidth,
        height: window.innerHeight,
        title,
        overflowX,
        overlaps,
        clippedText,
        regionCount: regions.length
      };
    })()`,
    5000
  );
}

async function inspectMermaidCdp(client) {
  return await evaluate(
    client,
    `(() => Array.from(document.querySelectorAll('[data-section-type="mermaid"]')).map((section) => {
      const target = section.querySelector("[data-rich-mermaid-target], .mermaid-rendered");
      const svg = target?.querySelector("svg");
      const state = section.dataset.renderState || target?.dataset.renderState || "unknown";
      let textOverflow = false;
      if (svg) {
        const svgBox = svg.getBoundingClientRect();
        Array.from(svg.querySelectorAll("text")).forEach((text) => {
          const box = text.getBoundingClientRect();
          if (box.width > 0 && (box.left < svgBox.left - 4 || box.right > svgBox.right + 4 || box.top < svgBox.top - 4 || box.bottom > svgBox.bottom + 4)) {
            textOverflow = true;
          }
        });
      }
      return {
        id: section.id,
        state,
        svgCount: target ? target.querySelectorAll("svg").length : 0,
        textOverflow,
        hasFallback: Boolean(section.querySelector("[data-mermaid-source]"))
      };
    }))()`,
    5000
  );
}

async function inspectCodeCdp(client) {
  return await evaluate(
    client,
    `(() => Array.from(document.querySelectorAll('[data-section-type="code"]')).map((section) => {
      const code = section.querySelector("pre code");
      const lines = Array.from(code?.querySelectorAll(".code-line, .line-hot") || []);
      const style = code ? getComputedStyle(code) : null;
      const lineHeight = style ? Number.parseFloat(style.lineHeight) : 0;
      let maxLineGap = 0;
      for (let index = 1; index < lines.length; index += 1) {
        const previous = lines[index - 1].getBoundingClientRect();
        const current = lines[index].getBoundingClientRect();
        maxLineGap = Math.max(maxLineGap, current.top - previous.bottom);
      }
      return {
        id: section.id,
        state: section.dataset.renderState || "unknown",
        language: Array.from(code?.classList || []).find((item) => item.startsWith("language-")) || "",
        tokenCount: code ? code.querySelectorAll("[class^='hljs-'], [class*=' hljs-']").length : 0,
        lineCount: lines.length,
        lineHeight,
        maxLineGap,
        hasSource: Boolean(section.querySelector("[data-rich-source], details pre"))
      };
    }))()`,
    5000
  );
}

async function inspectDataTablesCdp(client) {
  return await evaluate(
    client,
    `(async () => {
      const tables = Array.from(document.querySelectorAll('[data-report-data-table]'));
      const results = [];
      for (const table of tables) {
        const first = table.querySelector('tbody [data-table-cell]') || table.querySelector('[data-table-cell]');
        if (!first) {
          results.push({ id: table.closest('[data-section-type]')?.id || '', cellCount: 0 });
          continue;
        }
        const rect = first.getBoundingClientRect();
        first.dispatchEvent(new PointerEvent('pointerover', {
          bubbles: true,
          clientX: rect.left + Math.min(8, rect.width / 2),
          clientY: rect.top + Math.min(8, rect.height / 2)
        }));
        first.focus();
        await new Promise((resolve) => setTimeout(resolve, 220));
        const row = first.getAttribute('data-table-row');
        const column = first.getAttribute('data-table-column');
        const style = getComputedStyle(first);
        results.push({
          id: table.closest('[data-section-type]')?.id || '',
          cellCount: table.querySelectorAll('[data-table-cell]').length,
          row,
          column,
          rowHighlights: table.querySelectorAll("[data-table-row='" + row + "'].table-row-highlight").length,
          columnHighlights: table.querySelectorAll("[data-table-column='" + column + "'].table-column-highlight").length,
          hovered: first.classList.contains('table-cell-highlight'),
          transform: style.transform,
          boxShadow: style.boxShadow
        });
      }
      return results;
    })()`,
    5000
  );
}

async function exerciseInteractionsCdp(client) {
  await evaluate(
    client,
    `(async () => {
      window.__effectiveInteractInteractionCheck = {};
      document.querySelectorAll("[data-filter-target][data-filter-value]")[1]?.click();
      document.querySelectorAll("[data-tab-group][data-tab]")[1]?.click();
      const navLinks = Array.from(document.querySelectorAll("[data-nav-link]"));
      const navTarget = navLinks[Math.min(3, navLinks.length - 1)] || navLinks[0] || null;
      navTarget?.click();
      await new Promise((resolve) => setTimeout(resolve, 220));
      const navTargetId = (navTarget?.getAttribute("href") || "").replace(/^#/, "");
      const activeNavTarget = (document.querySelector('[data-nav-link][aria-current="true"]')?.getAttribute("href") || "").replace(/^#/, "");
      window.__effectiveInteractInteractionCheck = {
        navTargetId,
        activeNavTarget,
        focusedSections: Array.from(document.querySelectorAll(".section-focus")).map((node) => node.id)
      };
      return true;
    })()`,
    5000
  );

  const copyTarget = await evaluate(
    client,
    `(async () => {
      const visible = (node) => {
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      };
      const copyButton = Array.from(document.querySelectorAll("[data-copy-from], [data-copy-text]")).find(visible);
      if (!copyButton) return { exists: false, copyHasSource: false };
      const copySource = copyButton.matches("[data-copy-from]")
        ? document.querySelector(copyButton.getAttribute("data-copy-from"))
        : null;
      const copyHasSource = Boolean(copyButton.matches("[data-copy-text]") ? copyButton.getAttribute("data-copy-text") : copySource?.textContent?.trim());
      copyButton.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
      await new Promise((resolve) => setTimeout(resolve, 450));
      const rect = copyButton.getBoundingClientRect();
      return {
        exists: rect.width > 0 && rect.height > 0,
        copyHasSource,
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      };
    })()`,
    5000
  );

  if (copyTarget.exists) {
    await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: copyTarget.x, y: copyTarget.y }).catch(() => {});
    await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: copyTarget.x, y: copyTarget.y, button: "left", buttons: 1, clickCount: 1 }).catch(() => {});
    await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: copyTarget.x, y: copyTarget.y, button: "left", buttons: 0, clickCount: 1 }).catch(() => {});
    await delay(360);
    const copied = await evaluate(client, `(() => {
      const visible = (node) => {
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      };
      const copyButton = Array.from(document.querySelectorAll("[data-copy-from], [data-copy-text]")).find(visible);
      return copyButton?.getAttribute("data-copy-state") === "success";
    })()`, 1000).catch(() => false);
    if (!copied) {
      await evaluate(client, `(() => {
        const visible = (node) => {
          const rect = node.getBoundingClientRect();
          const style = getComputedStyle(node);
          return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
        };
        Array.from(document.querySelectorAll("[data-copy-from], [data-copy-text]")).find(visible)?.focus();
      })()`, 1000).catch(() => {});
      await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }).catch(() => {});
      await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }).catch(() => {});
      await delay(360);
      const copiedAfterKeyboard = await evaluate(client, `(() => {
        const visible = (node) => {
          const rect = node.getBoundingClientRect();
          const style = getComputedStyle(node);
          return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
        };
        const copyButton = Array.from(document.querySelectorAll("[data-copy-from], [data-copy-text]")).find(visible);
        return copyButton?.getAttribute("data-copy-state") === "success";
      })()`, 1000).catch(() => false);
      if (!copiedAfterKeyboard) {
        await evaluate(client, `(() => {
          const visible = (node) => {
            const rect = node.getBoundingClientRect();
            const style = getComputedStyle(node);
            return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
          };
          Array.from(document.querySelectorAll("[data-copy-from], [data-copy-text]")).find(visible)?.click();
        })()`, 1000).catch(() => {});
        await delay(360);
      }
    }
  }

  return await evaluate(
    client,
    `(() => {
      const title = document.querySelector(".report-title, h1");
      const evidence = document.querySelector("#evidence");
      const saved = window.__effectiveInteractInteractionCheck || {};
      const isVisible = (node) => {
        if (!node) return true;
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      };
      const copyButton = Array.from(document.querySelectorAll("[data-copy-from], [data-copy-text]")).find(isVisible);
      return {
        hiddenPanels: document.querySelectorAll("[data-tab-panel-group][hidden], [data-filter-target][hidden]").length,
        titleVisible: isVisible(title),
        evidenceVisible: isVisible(evidence),
        navTargetId: saved.navTargetId || "",
        activeNavTarget: saved.activeNavTarget || "",
        focusedSections: saved.focusedSections || [],
        copyHasSource: ${copyTarget.copyHasSource ? "true" : "false"},
        copyState: copyButton?.getAttribute("data-copy-state") || "",
        copyLabel: copyButton?.textContent?.trim() || ""
      };
    })()`,
    5000
  );
}

async function inspectAccessibilityCdp(client) {
  for (let index = 0; index < 4; index += 1) {
    await client.send("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "Tab",
      code: "Tab",
      windowsVirtualKeyCode: 9
    }).catch(() => {});
    await client.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Tab",
      code: "Tab",
      windowsVirtualKeyCode: 9
    }).catch(() => {});
    await delay(80);
    const hasFocus = await evaluate(client, `(() => document.activeElement && document.activeElement !== document.body)()`, 1000).catch(() => false);
    if (hasFocus) break;
  }

  return await evaluate(
    client,
    `(() => {
      const isVisible = (node) => {
        if (!node) return false;
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      };
      const labelOf = (node) => (node.getAttribute("aria-label") || node.getAttribute("title") || node.textContent || node.value || "").trim();
      const controls = Array.from(document.querySelectorAll("button,input,select,summary,a[href],[tabindex]")).filter(isVisible);
      const unlabeledControls = controls
        .filter((node) => !labelOf(node))
        .slice(0, 6)
        .map((node) => node.id ? "#" + node.id : node.tagName.toLowerCase());
      const active = document.activeElement;
      const activeStyle = active ? getComputedStyle(active) : null;
      const focusVisible = Boolean(active && active !== document.body && activeStyle && (
        activeStyle.boxShadow !== "none" ||
        (activeStyle.outlineStyle && activeStyle.outlineStyle !== "none" && Number.parseFloat(activeStyle.outlineWidth || "0") > 0)
      ));
      const reducedMotionRule = Array.from(document.querySelectorAll("style")).some((style) => style.textContent.includes("prefers-reduced-motion"));
      const primaryConclusionVisible = isVisible(document.querySelector(".report-hero strong, .report-hero [data-report-intent]"));
      const chartIssues = Array.from(document.querySelectorAll("[data-chart-section]")).flatMap((section) => {
        const issues = [];
        const id = section.id || section.dataset.chartType || "chart";
        const rect = section.getBoundingClientRect();
        const figure = section.querySelector("figure");
        const fallback = section.querySelector("[data-chart-table-fallback]");
        const takeaway = section.querySelector("[data-chart-takeaway]");
        const source = section.querySelector("[data-chart-source]");
        if (!figure || !isVisible(figure)) issues.push(id + " chart figure is not visible");
        if (!fallback) issues.push(id + " chart fallback is missing");
        if (!takeaway || !takeaway.textContent.trim()) issues.push(id + " chart takeaway is missing");
        if (!source || !source.textContent.trim()) issues.push(id + " chart source is missing");
        if (section.scrollWidth - section.clientWidth > 4) issues.push(id + " chart section overflows horizontally");
        if (rect.width <= 0 || rect.height <= 0) issues.push(id + " chart section is blank");
        return issues;
      });
      return {
        controlCount: controls.length,
        unlabeledControls,
        focusVisible,
        activeTag: active ? active.tagName.toLowerCase() : "",
        reducedMotionRule,
        primaryConclusionVisible,
        chartIssues
      };
    })()`,
    5000
  );
}

async function validateBrowserWithCdp(file, mode) {
  const browser = await launchCdpBrowser();
  let client;
  try {
    const fileUrl = pathToFileURL(path.resolve(file)).href;
    const webSocketUrl = await createCdpTarget(browser.port, "about:blank");
    client = new CdpClient(webSocketUrl);
    await client.connect();
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Page.navigate", { url: fileUrl });
    await waitForDocument(client);

    const runtime = await settleRuntimeCdp(client, mode);
    const viewports = [];
    for (const viewport of browserViewports) {
      viewports.push(await inspectViewportCdp(client, viewport.width, viewport.height));
    }
    const mermaid = await inspectMermaidCdp(client);
    const code = await inspectCodeCdp(client);
    const dataTables = await inspectDataTablesCdp(client);
    const interactions = await exerciseInteractionsCdp(client);
    const accessibility = await inspectAccessibilityCdp(client);

    const issues = [];
    for (const viewport of viewports) {
      if (!viewport.title || viewport.regionCount < 3) issues.push(`blank or incomplete viewport ${viewport.width}`);
      if (viewport.overflowX > 4) issues.push(`body horizontal overflow ${viewport.overflowX}px at ${viewport.width}`);
      if (viewport.overlaps.length) issues.push(`overlap at ${viewport.width}: ${viewport.overlaps.slice(0, 3).join("; ")}`);
      if (viewport.clippedText?.length) issues.push(`clipped text at ${viewport.width}: ${viewport.clippedText.join("; ")}`);
    }
    for (const item of mermaid) {
      if (item.state !== "ready") issues.push(`mermaid ${item.id} did not render ready SVG; state=${item.state}`);
      if (item.svgCount === 0) issues.push(`mermaid ${item.id} rendered no SVG`);
      if (!item.hasFallback) issues.push(`mermaid ${item.id} lacks source fallback`);
      if (item.textOverflow) issues.push(`mermaid ${item.id} text appears outside SVG bounds`);
    }
    const totalHighlightTokens = code.reduce((total, item) => total + item.tokenCount, 0);
    for (const item of code) {
      if (!item.language) issues.push(`code ${item.id} lacks language class`);
      if (item.state === "ready" && item.lineCount === 0) issues.push(`code ${item.id} has no line wrappers`);
      if (item.maxLineGap > Math.max(3, item.lineHeight * 0.35)) issues.push(`code ${item.id} has excessive inter-line gap ${item.maxLineGap}px`);
      if (!item.hasSource) issues.push(`code ${item.id} lacks source fallback`);
    }
    for (const item of dataTables) {
      if (item.cellCount === 0) issues.push(`data table ${item.id} has no cells`);
      if (!item.hovered) issues.push(`data table ${item.id} did not mark hovered cell`);
      if (item.rowHighlights < 1) issues.push(`data table ${item.id} did not highlight hovered row`);
      if (item.columnHighlights < 1) issues.push(`data table ${item.id} did not highlight hovered column`);
      if (transformScale(item.transform) < 1.02) issues.push(`data table ${item.id} did not scale hovered cell`);
    }
    if (code.some((item) => item.state === "ready") && totalHighlightTokens === 0) issues.push("ready code blocks have no highlight tokens");
    if (!interactions.titleVisible || !interactions.evidenceVisible) issues.push("interactions hid primary title or evidence");
    const navTargetFocused = Boolean(interactions.navTargetId && interactions.focusedSections?.includes(interactions.navTargetId));
    if (interactions.navTargetId && interactions.activeNavTarget !== interactions.navTargetId && !navTargetFocused) issues.push(`nav click did not activate ${interactions.navTargetId}`);
    if (interactions.navTargetId && !interactions.focusedSections?.includes(interactions.navTargetId)) issues.push(`nav click did not highlight ${interactions.navTargetId}`);
    if (interactions.copyHasSource && interactions.copyState !== "success") issues.push(`copy button did not report success; label=${interactions.copyLabel || "empty"}`);
    if (accessibility.unlabeledControls?.length) issues.push(`unlabeled controls: ${accessibility.unlabeledControls.join(", ")}`);
    if (accessibility.controlCount > 0 && !accessibility.focusVisible) issues.push(`focus-visible style was not detected after keyboard Tab; active=${accessibility.activeTag || "none"}`);
    if (!accessibility.reducedMotionRule) issues.push("reduced-motion CSS was not detected in browser");
    if (!accessibility.primaryConclusionVisible) issues.push("primary conclusion is not visible before interaction");
    if (accessibility.chartIssues?.length) issues.push(accessibility.chartIssues.join(" | "));
    if (mode === "runtime-cdn" && runtime.pending > 0) issues.push(`runtime still pending for ${runtime.pending} sections`);
    if (mode === "runtime-cdn" && runtime.failed > 0) issues.push(`runtime failed for ${runtime.failed} rich section(s)`);
    if (mode === "runtime-cdn" && runtime.degraded > 0) issues.push(`runtime degraded for ${runtime.degraded} rich section(s)`);
    if (mode === "runtime-cdn" && runtime.dependencyStates?.length === 0) issues.push("runtime dependency states were not exposed");
    if (mode === "runtime-cdn" && runtime.dependencyStates?.includes("pending")) issues.push("runtime dependency states are still pending");

    if (issues.length) {
      return { status: "failed", reason: issues.join(" | "), runtime, viewports, mermaid, code, dataTables, interactions, accessibility };
    }

    return {
      status: "passed",
      reason: `runtime state, responsive layout, rich content, and controls were validated in ${path.basename(browser.executable)}`,
      runtime,
      viewports,
      mermaid,
      code,
      dataTables,
      interactions,
      accessibility
    };
  } finally {
    client?.close();
    await stopCdpBrowser(browser);
  }
}

async function validateBrowser(file, options, mode = "unknown") {
  if (options.skipBrowser) {
    return {
      status: "degraded",
      reason: "browser checks skipped by --skip-browser"
    };
  }

  try {
    return await validateBrowserWithCdp(file, mode);
  } catch (error) {
    return {
      status: options.requireBrowser ? "failed" : "degraded",
      reason: sanitizeDiagnosticMessage(error.message) || "browser validation failed"
    };
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
    const browser = await validateBrowser(file, args, staticResult.mode);
    const ok = staticResult.ok && browser.status !== "failed";
    const payload = {
      ok,
      file,
      mode: staticResult.mode,
      checks: staticResult.checks,
      issues: staticResult.issues,
      warnings: staticResult.warnings,
      browser
    };

    if (args.json) {
      console.log(JSON.stringify(payload, null, 2));
    } else {
      console.log(`${ok ? "PASS" : "FAIL"} ${file}`);
      for (const check of staticResult.checks) console.log(`- ok: ${check}`);
      for (const issue of staticResult.issues) console.log(`- issue: ${issue}`);
      for (const warning of staticResult.warnings) console.log(`- warning: ${warning}`);
      console.log(`- browser: ${browser.status} (${browser.reason})`);
    }

    if (!ok) process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? process.argv[1].replaceAll("\\", "/") : "";
if (invokedPath && (import.meta.url === `file://${invokedPath}` || process.argv[1]?.endsWith("validate-interaction.mjs"))) {
  await main();
}

export { validateStatic, validateBrowser, sanitizeDiagnosticMessage };
