#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_ROOTS = [
  { kind: "docs-data", dir: path.join("docs", "data"), extension: ".json" },
  { kind: "reports-data", dir: "reports-data", extension: ".json" },
  { kind: "report-html", dir: path.join("docs", "reports"), extension: ".html" }
];

export const PUBLIC_COPY_REPLAY_BANNED_TERMS = [
  "当前只能确认榜单动量",
  "正式采用前还要核对 README",
  "核对 README",
  "准入",
  "复现门槛",
  "优先核对",
  "阅读时先看"
];

const BANNED_PATTERNS = [
  { term: "当前只能确认榜单动量", pattern: /当前只能确认榜单动量/u },
  { term: "正式采用前还要核对 README", pattern: /正式采用前还要核对\s*README/u },
  { term: "核对 README", pattern: /核对\s*README/u },
  { term: "准入", pattern: /准入(?:门槛|规则|清单|检查|流程|结果|条件|标准)|admission\s+(?:gate|checklist|criteria)/iu },
  { term: "复现门槛", pattern: /复现门槛/u },
  { term: "优先核对", pattern: /优先核对/u },
  { term: "阅读时先看", pattern: /阅读时先看/u }
];

export async function evaluatePublicCopyReplay(options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const latestDays = parsePositiveInteger(options.latestDays || options["latest-days"] || 14, "latestDays");
  const currentDate = normalizeDate(options.currentDate || options["current-date"] || new Date().toISOString().slice(0, 10));
  const windowStart = addDays(currentDate, -(latestDays - 1));
  const roots = Array.isArray(options.roots) ? options.roots : DEFAULT_ROOTS;
  const artifacts = await discoverArtifacts({ rootDir, roots, windowStart, currentDate });
  const issues = [];
  const artifactEntries = [];

  for (const artifact of artifacts) {
    const raw = await fs.readFile(artifact.absolutePath, "utf8");
    const text = artifact.kind === "report-html" ? visibleHtmlText(raw) : raw;
    const hits = findBannedCopyHits(text).map((hit) => ({
      path: artifact.relativePath,
      kind: artifact.kind,
      report_date: artifact.reportDate,
      ...hit
    }));
    issues.push(...hits);
    artifactEntries.push({
      path: artifact.relativePath,
      kind: artifact.kind,
      report_date: artifact.reportDate,
      issue_count: hits.length
    });
  }

  return {
    schema_version: 1,
    ok: issues.length === 0,
    issues,
    artifacts: artifactEntries,
    summary: {
      mode: "public-copy-replay",
      current_date: currentDate,
      latest_days: latestDays,
      window_start: windowStart,
      artifacts_checked: artifacts.length,
      issue_count: issues.length,
      roots: roots.map((root) => normalizePath(root.dir))
    }
  };
}

function findBannedCopyHits(text) {
  const normalized = normalizeWhitespace(text);
  const hits = [];
  for (const { term, pattern } of BANNED_PATTERNS) {
    const match = pattern.exec(normalized);
    if (!match) {
      continue;
    }
    hits.push({
      term,
      excerpt: excerptAround(normalized, match.index || 0, match[0].length)
    });
  }
  return hits;
}

async function discoverArtifacts({ rootDir, roots, windowStart, currentDate }) {
  const artifacts = [];
  for (const root of roots) {
    const absoluteRoot = path.resolve(rootDir, root.dir);
    if (!(await exists(absoluteRoot))) {
      continue;
    }
    for (const absolutePath of await walkFiles(absoluteRoot, root.extension)) {
      const basename = path.basename(absolutePath, root.extension);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(basename)) {
        continue;
      }
      if (basename < windowStart || basename > currentDate) {
        continue;
      }
      artifacts.push({
        kind: root.kind,
        reportDate: basename,
        absolutePath,
        relativePath: normalizePath(path.relative(rootDir, absolutePath))
      });
    }
  }
  return artifacts.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

async function walkFiles(dir, extension) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkFiles(child, extension));
    } else if (entry.isFile() && entry.name.endsWith(extension)) {
      files.push(child);
    }
  }
  return files;
}

async function runCli(argv) {
  const args = parseArgs(argv);
  const result = await evaluatePublicCopyReplay({
    rootDir: args["repo-root"],
    currentDate: args["current-date"],
    latestDays: args["latest-days"]
  });

  if (args.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    printHumanResult(result);
  }
  return result.ok ? 0 : 1;
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      throw new Error(`Unknown argument: ${token}`);
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function printHumanResult(result) {
  const status = result.ok ? "passed" : "failed";
  console.log(`Public copy replay ${status}.`);
  console.log(`Checked ${result.summary.artifacts_checked} artifact(s); issues: ${result.summary.issue_count}.`);
  for (const issue of result.issues.slice(0, 20)) {
    console.log(`BLOCKING ${issue.report_date} ${issue.path}: ${issue.term} - ${issue.excerpt}`);
  }
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function parsePositiveInteger(value, name) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

function normalizeDate(value) {
  const text = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new Error(`Expected YYYY-MM-DD date, got ${text}.`);
  }
  return text;
}

function addDays(dateText, deltaDays) {
  const date = new Date(`${dateText}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

function visibleHtmlText(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/giu, " ")
    .replace(/<style[\s\S]*?<\/style>/giu, " ")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&#39;/giu, "'")
    .replace(/&quot;/giu, "\"");
}

function normalizeWhitespace(value) {
  return String(value).replace(/\s+/gu, " ").trim();
}

function excerptAround(text, index, length) {
  const start = Math.max(0, index - 40);
  const end = Math.min(text.length, index + length + 80);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < text.length ? "..." : "";
  return `${prefix}${text.slice(start, end)}${suffix}`;
}

function normalizePath(filePath) {
  return filePath.replace(/\\/g, "/");
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  runCli(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(error?.stack || error?.message || String(error));
      process.exitCode = 1;
    });
}
