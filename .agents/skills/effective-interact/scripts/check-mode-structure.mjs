#!/usr/bin/env node

import fs from "node:fs";
import { pathToFileURL } from "node:url";

const VALID_MODES = new Set(["plain-brief", "structured-markdown", "visual-markdown", "html-artifact"]);

function parseArgs(argv) {
  const args = {
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") args.json = true;
    else if (arg === "--mode") args.mode = argv[index += 1];
    else if (arg === "--input") args.input = argv[index += 1];
    else if (arg === "--cases-file") args.casesFile = argv[index += 1];
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function usage() {
  return [
    "Usage:",
    "  node skills/effective-interact/scripts/check-mode-structure.mjs --mode <mode> --input <file> [--json]",
    "  node skills/effective-interact/scripts/check-mode-structure.mjs --cases-file <file.json> [--json]",
    "",
    "Checks whether non-HTML Effective Interact outputs keep at least one visible structure instead of collapsing into linear prose."
  ].join("\n");
}

function normalizeLines(content) {
  return String(content || "").replace(/\r\n/g, "\n").split("\n");
}

function countMatches(lines, pattern) {
  return lines.filter((line) => pattern.test(line)).length;
}

function hasMarkdownTable(content) {
  const text = String(content || "");
  return /^\|.+\|\s*\n\|(?:\s*:?-+:?\s*\|)+\s*$/m.test(text);
}

function hasMermaidFence(content) {
  return /```mermaid\b/i.test(String(content || ""));
}

function hasCodeFence(content) {
  return /```(?!mermaid\b)[a-z0-9_-]*\s*\n[\s\S]*?\n```/i.test(String(content || ""));
}

function hasSourceAnchorList(lines) {
  const sourcePattern = /(?:\[[^\]]+\]\([^)]+:\d+\)|(?:[A-Za-z]:[\\/]|\/|\.{1,2}\/)[^:\s]+(?:\.\w+):\d+\b|[A-Za-z0-9_.-]+\/[^:\s]+(?:\.\w+):\d+\b)/;
  const listPattern = /^\s*(?:[-*+]|\d+\.)\s+/;
  return lines.filter((line) => listPattern.test(line) && sourcePattern.test(line)).length >= 1;
}

function hasGroupedList(lines) {
  const groupedPattern = /^\s*(?:[-*+]|\d+\.)\s+(?:\*\*[^*]{1,40}(?:[:：])?\*\*[:：]?|`[^`]{1,40}(?:[:：])?`[:：]?|[A-Za-z][A-Za-z0-9 /_-]{1,30}:|[\u4e00-\u9fa5A-Za-z0-9 _-]{1,16}[：:])/;
  return countMatches(lines, groupedPattern) >= 2;
}

function hasNumberedSteps(lines) {
  return countMatches(lines, /^\s*\d+\.\s+/) >= 2;
}

function detectStructures(content) {
  const lines = normalizeLines(content);
  const detected = [];

  if (hasMarkdownTable(content)) detected.push("table");
  if (hasMermaidFence(content)) detected.push("mermaid");
  if (hasCodeFence(content)) detected.push("code-evidence");
  if (hasSourceAnchorList(lines)) detected.push("source-anchor-list");
  if (hasGroupedList(lines)) detected.push("grouped-list");
  if (hasNumberedSteps(lines)) detected.push("numbered-steps");

  return detected;
}

function checkModeStructure({ mode, content }) {
  const warnings = [];
  const normalizedMode = String(mode || "").trim();
  const detectedStructures = detectStructures(content);
  const structuredSet = new Set(detectedStructures);

  if (!VALID_MODES.has(normalizedMode)) {
    return {
      ok: false,
      mode: normalizedMode,
      detectedStructures,
      warnings,
      issues: [`invalid mode: ${normalizedMode}`],
    };
  }

  if (normalizedMode === "structured-markdown") {
    const ok = ["table", "grouped-list", "numbered-steps", "code-evidence", "source-anchor-list"]
      .some((name) => structuredSet.has(name));
    if (!ok) {
      warnings.push("advisory: markdown structure gate: structured-markdown should expose at least one visible structure such as a compact table, grouped list, numbered steps, code/source evidence, or source-anchor list");
    }
  }

  if (normalizedMode === "visual-markdown") {
    const ok = ["table", "mermaid", "code-evidence", "source-anchor-list"]
      .some((name) => structuredSet.has(name));
    if (!ok) {
      warnings.push("advisory: markdown structure gate: visual-markdown should expose a stronger visible structure such as Mermaid, a table, code/source evidence, or source-anchor list");
    }
  }

  return {
    ok: true,
    mode: normalizedMode,
    detectedStructures,
    warnings,
    issues: [],
  };
}

function runCasesFile(casesFile) {
  const payload = JSON.parse(fs.readFileSync(casesFile, "utf8"));
  const cases = Array.isArray(payload.cases) ? payload.cases : [];
  const results = cases.map((entry) => {
    const outcome = checkModeStructure({ mode: entry.mode, content: entry.content });
    const expectedWarn = Boolean(entry.shouldWarn);
    const warned = outcome.warnings.length > 0;
    const expectedStructures = Array.isArray(entry.expectedStructures) ? entry.expectedStructures : [];
    const missingStructures = expectedStructures.filter((name) => !outcome.detectedStructures.includes(name));
    const passed = outcome.ok && warned === expectedWarn && missingStructures.length === 0;

    return {
      id: entry.id,
      mode: entry.mode,
      shouldWarn: expectedWarn,
      warned,
      detectedStructures: outcome.detectedStructures,
      warnings: outcome.warnings,
      missingStructures,
      passed,
    };
  });

  const failedCount = results.filter((entry) => !entry.passed).length;
  return {
    schemaVersion: 1,
    ok: failedCount === 0,
    mutates: false,
    dispatchesSubagents: false,
    summary: {
      caseCount: results.length,
      passedCount: results.length - failedCount,
      failedCount,
      warnedCount: results.filter((entry) => entry.warned).length,
    },
    cases: results,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    const text = usage();
    if (args.json) {
      console.log(JSON.stringify({ ok: true, usage: text }, null, 2));
      return;
    }
    console.log(text);
    return;
  }

  if (args.casesFile) {
    const result = runCasesFile(args.casesFile);
    if (args.json) console.log(JSON.stringify(result, null, 2));
    else console.log(result.ok ? "Mode structure cases passed." : "Mode structure cases failed.");
    if (!result.ok) process.exitCode = 1;
    return;
  }

  if (!args.mode || !args.input) {
    throw new Error("Both --mode and --input are required unless --cases-file is provided.");
  }

  const content = fs.readFileSync(args.input, "utf8");
  const result = {
    schemaVersion: 1,
    mutates: false,
    dispatchesSubagents: false,
    ...checkModeStructure({ mode: args.mode, content }),
  };

  if (args.json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(result.warnings.length === 0
      ? `Mode structure check passed for ${result.mode}.`
      : `Mode structure check completed for ${result.mode} with ${result.warnings.length} warning(s).`);
  }

  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  }
}

export { checkModeStructure, detectStructures, runCasesFile };
