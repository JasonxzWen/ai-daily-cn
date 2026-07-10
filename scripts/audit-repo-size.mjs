#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  legacySourceStatusHistoryRelativePath,
  sourceStatusHistoryRelativePaths,
  toRepoPath
} from "../src/reports-data-layout.js";

const DEFAULT_LARGEST_FILE_LIMIT = 20;
const DOCS_ASSETS_PREFIX = "docs/assets/";

export async function auditRepoSize(options = {}) {
  const rootDir = path.resolve(options.rootDir || options.root || process.cwd());
  const trackedFiles = listTrackedFiles(rootDir);
  const entries = [];
  let missingFromWorktree = 0;

  for (const relativePath of trackedFiles) {
    const absolutePath = path.join(rootDir, relativePath);
    let stat;
    try {
      stat = await fs.stat(absolutePath);
    } catch (error) {
      if (error?.code === "ENOENT") {
        missingFromWorktree += 1;
        continue;
      }
      throw error;
    }
    if (!stat.isFile()) continue;
    const normalizedPath = normalizePath(relativePath);
    entries.push({
      path: normalizedPath,
      bytes: stat.size,
      extension: extensionFor(normalizedPath),
      top_level: topLevelFor(normalizedPath)
    });
  }

  const docsAssetsEntries = entries.filter((entry) => entry.path.startsWith(DOCS_ASSETS_PREFIX));
  const duplicateAssets = await findDuplicateAssetGroups(rootDir, docsAssetsEntries);
  const largestFiles = [...entries]
    .sort((left, right) => right.bytes - left.bytes || left.path.localeCompare(right.path))
    .slice(0, Number(options.largestFileLimit || DEFAULT_LARGEST_FILE_LIMIT));

  return {
    schema_version: 1,
    root_dir: rootDir,
    generated_at: new Date().toISOString(),
    tracked: {
      file_count: entries.length,
      missing_from_worktree: missingFromWorktree,
      total_bytes: sumBytes(entries),
      total_mib: bytesToMiB(sumBytes(entries))
    },
    top_level_directories: groupEntries(entries, (entry) => entry.top_level),
    notable_paths: buildNotablePaths(entries),
    docs_assets_by_extension: groupEntries(docsAssetsEntries, (entry) => entry.extension),
    duplicate_assets: duplicateAssets,
    git_objects: readGitObjectStats(rootDir),
    largest_files: largestFiles
  };
}

export function evaluateRepoSizeBudget(audit, budget = {}) {
  const thresholds = budget.thresholds || {};
  const violations = [];

  addThresholdViolation(violations, {
    metric: "tracked_total_bytes",
    actualBytes: audit.tracked.total_bytes,
    threshold: thresholds.tracked_total_bytes,
    message: "tracked repository payload exceeds budget"
  });
  addThresholdViolation(violations, {
    metric: "docs_assets_total_bytes",
    actualBytes: audit.notable_paths.docs_assets?.bytes || 0,
    threshold: thresholds.docs_assets_total_bytes,
    message: "docs/assets payload exceeds budget"
  });
  addThresholdViolation(violations, {
    metric: "reports_data_total_bytes",
    actualBytes: audit.notable_paths.reports_data?.bytes || 0,
    threshold: thresholds.reports_data_total_bytes,
    message: "reports-data payload exceeds budget"
  });
  addThresholdViolation(violations, {
    metric: "reports_data_candidates_bytes",
    actualBytes: audit.notable_paths.reports_data_candidates_json?.bytes || 0,
    threshold: thresholds.reports_data_candidates_bytes,
    message: "candidate JSON payload exceeds budget"
  });
  addThresholdViolation(violations, {
    metric: "duplicate_docs_assets_waste_bytes",
    actualBytes: audit.duplicate_assets.wasted_bytes || 0,
    threshold: thresholds.duplicate_docs_assets_waste_bytes,
    message: "exact duplicate docs/assets bytes exceed budget"
  });
  addThresholdViolation(violations, {
    metric: "git_pack_bytes",
    actualBytes: audit.git_objects.pack_bytes || 0,
    threshold: thresholds.git_pack_bytes,
    message: "git pack payload exceeds budget"
  });

  const largestFile = audit.largest_files[0] || null;
  if (largestFile) {
    addThresholdViolation(violations, {
      metric: "single_file_bytes",
      actualBytes: largestFile.bytes,
      threshold: thresholds.single_file_bytes,
      message: "largest tracked file exceeds budget",
      path: largestFile.path
    });
  }

  const errors = violations.filter((violation) => violation.severity === "error");
  const warnings = violations.filter((violation) => violation.severity === "warning");
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    violations
  };
}

export function formatRepoSizeAudit(audit, budgetResult = null) {
  const lines = [
    `tracked files: ${audit.tracked.file_count}`,
    `tracked size: ${formatBytes(audit.tracked.total_bytes)}`,
    `docs/assets: ${formatBytes(audit.notable_paths.docs_assets?.bytes || 0)}`,
    `reports-data: ${formatBytes(audit.notable_paths.reports_data?.bytes || 0)}`,
    `candidate JSON: ${formatBytes(audit.notable_paths.reports_data_candidates_json?.bytes || 0)}`,
    `internal candidate JSON: ${formatBytes(audit.notable_paths.reports_data_internal_candidates_json?.bytes || 0)}`,
    `duplicate docs/assets waste: ${formatBytes(audit.duplicate_assets.wasted_bytes || 0)}`,
    `git pack: ${formatBytes(audit.git_objects.pack_bytes || 0)}`
  ];
  if (budgetResult) {
    lines.push(`budget: ${budgetResult.ok ? "ok" : "failed"} (${budgetResult.errors.length} errors, ${budgetResult.warnings.length} warnings)`);
    for (const violation of budgetResult.violations) {
      const violationPath = violation.path ? ` (${violation.path})` : "";
      lines.push(`- ${violation.severity}: ${violation.metric} ${formatBytes(violation.actual_bytes)} > ${formatBytes(violation.threshold_bytes)}${violationPath}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const audit = await auditRepoSize({ rootDir: args.rootDir });
  let budgetResult = null;
  if (args.budgetPath) {
    const budget = JSON.parse(await fs.readFile(path.resolve(args.rootDir, args.budgetPath), "utf8"));
    budgetResult = evaluateRepoSizeBudget(audit, budget);
  }
  const result = budgetResult ? { ...audit, budget: budgetResult } : audit;
  process.stdout.write(args.json ? `${JSON.stringify(result, null, 2)}\n` : formatRepoSizeAudit(audit, budgetResult));
  if (budgetResult && shouldFailForBudget(budgetResult, args.failOn)) {
    process.exitCode = 1;
  }
}

function parseArgs(argv) {
  const args = {
    rootDir: process.cwd(),
    budgetPath: "",
    failOn: "error",
    json: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root" || arg === "--repo-root") {
      args.rootDir = requireValue(argv, ++index, arg);
    } else if (arg === "--budget") {
      args.budgetPath = requireValue(argv, ++index, arg);
    } else if (arg === "--fail-on") {
      args.failOn = requireValue(argv, ++index, arg);
      if (!["error", "warning", "none"].includes(args.failOn)) {
        throw new Error("--fail-on must be error, warning, or none");
      }
    } else if (arg === "--json") {
      args.json = true;
    } else {
      throw new Error(`unsupported repo size audit flag: ${arg}`);
    }
  }
  args.rootDir = path.resolve(args.rootDir);
  return args;
}

function requireValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`flag ${flag} requires a value`);
  }
  return value;
}

function listTrackedFiles(rootDir) {
  const output = execFileSync("git", ["ls-files", "-z"], {
    cwd: rootDir,
    encoding: "buffer",
    stdio: ["ignore", "pipe", "ignore"],
    maxBuffer: 64 * 1024 * 1024
  });
  return output.toString("utf8").split("\0").filter(Boolean);
}

function readGitObjectStats(rootDir) {
  try {
    const output = execFileSync("git", ["count-objects", "-v"], {
      cwd: rootDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 1024 * 1024
    });
    const values = Object.fromEntries(output.trim().split(/\r?\n/).map((line) => {
      const [key, rawValue] = line.split(":");
      return [key.trim(), Number(rawValue.trim())];
    }));
    const looseBytes = Number(values.size || 0) * 1024;
    const packBytes = Number(values["size-pack"] || 0) * 1024;
    return {
      count: Number(values.count || 0),
      in_pack: Number(values["in-pack"] || 0),
      packs: Number(values.packs || 0),
      loose_bytes: looseBytes,
      pack_bytes: packBytes,
      total_bytes: looseBytes + packBytes
    };
  } catch {
    return {
      count: 0,
      in_pack: 0,
      packs: 0,
      loose_bytes: 0,
      pack_bytes: 0,
      total_bytes: 0
    };
  }
}

async function findDuplicateAssetGroups(rootDir, entries) {
  const bySize = new Map();
  for (const entry of entries) {
    if (entry.bytes <= 0) continue;
    const bucket = bySize.get(entry.bytes) || [];
    bucket.push(entry);
    bySize.set(entry.bytes, bucket);
  }

  const byDigest = new Map();
  for (const [bytes, bucket] of bySize.entries()) {
    if (bucket.length < 2) continue;
    for (const entry of bucket) {
      const digest = await fileSha256(path.join(rootDir, entry.path));
      const key = `${bytes}:${digest}`;
      const digestBucket = byDigest.get(key) || [];
      digestBucket.push(entry);
      byDigest.set(key, digestBucket);
    }
  }

  const groups = [];
  for (const [key, bucket] of byDigest.entries()) {
    if (bucket.length < 2) continue;
    const [bytesRaw, sha256] = key.split(":");
    const bytes = Number(bytesRaw);
    groups.push({
      sha256,
      bytes,
      count: bucket.length,
      wasted_bytes: bytes * (bucket.length - 1),
      paths: bucket.map((entry) => entry.path).sort()
    });
  }
  groups.sort((left, right) => right.wasted_bytes - left.wasted_bytes || left.sha256.localeCompare(right.sha256));
  return {
    group_count: groups.length,
    duplicate_file_count: groups.reduce((total, group) => total + group.count, 0),
    wasted_bytes: groups.reduce((total, group) => total + group.wasted_bytes, 0),
    groups
  };
}

async function fileSha256(filePath) {
  const content = await fs.readFile(filePath);
  return createHash("sha256").update(content).digest("hex");
}

function buildNotablePaths(entries) {
  const docsAssets = filterPrefix(entries, DOCS_ASSETS_PREFIX);
  const docsReports = filterPrefix(entries, "docs/reports/");
  const docsData = filterPrefix(entries, "docs/data/");
  const docsArticles = entries.filter((entry) => entry.path === "docs/articles.json");
  const reportsData = filterPrefix(entries, "reports-data/");
  const reportsData2026 = filterPrefix(entries, "reports-data/2026/");
  const reportsDataInternal = filterPrefix(entries, "reports-data/internal/");
  const candidateJson = reportsData.filter((entry) => entry.path.endsWith(".candidates.json"));
  const internalCandidateJson = reportsDataInternal.filter((entry) => entry.path.endsWith(".candidates.json"));
  const sourceStatusHistoryPaths = new Set(sourceStatusHistoryRelativePaths().map((relativePath) =>
    toRepoPath("reports-data", relativePath)
  ));
  const sourceStatusHistory = entries.filter((entry) => sourceStatusHistoryPaths.has(entry.path));
  const legacySourceStatusHistory = entries.filter((entry) =>
    entry.path === toRepoPath("reports-data", legacySourceStatusHistoryRelativePath())
  );
  return {
    docs_assets: summarizeEntries(docsAssets),
    docs_reports: summarizeEntries(docsReports),
    docs_data: summarizeEntries(docsData),
    docs_articles_json: summarizeEntries(docsArticles),
    reports_data: summarizeEntries(reportsData),
    reports_data_2026: summarizeEntries(reportsData2026),
    reports_data_internal: summarizeEntries(reportsDataInternal),
    reports_data_candidates_json: summarizeEntries(candidateJson),
    reports_data_internal_candidates_json: summarizeEntries(internalCandidateJson),
    source_status_history_json: summarizeEntries(sourceStatusHistory),
    legacy_source_status_history_json: summarizeEntries(legacySourceStatusHistory)
  };
}

function filterPrefix(entries, prefix) {
  return entries.filter((entry) => entry.path.startsWith(prefix));
}

function summarizeEntries(entries) {
  const bytes = sumBytes(entries);
  return {
    files: entries.length,
    bytes,
    mib: bytesToMiB(bytes)
  };
}

function groupEntries(entries, keyFn) {
  const groups = new Map();
  for (const entry of entries) {
    const key = keyFn(entry);
    const group = groups.get(key) || { path: key, files: 0, bytes: 0 };
    group.files += 1;
    group.bytes += entry.bytes;
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => ({ ...group, mib: bytesToMiB(group.bytes) }))
    .sort((left, right) => right.bytes - left.bytes || left.path.localeCompare(right.path));
}

function addThresholdViolation(violations, { metric, actualBytes, threshold, message, path: violationPath = "" }) {
  if (!threshold) return;
  for (const severity of ["error", "warning"]) {
    const thresholdBytes = Number(threshold[severity] || 0);
    if (thresholdBytes > 0 && actualBytes > thresholdBytes) {
      violations.push({
        metric,
        severity,
        actual_bytes: actualBytes,
        threshold_bytes: thresholdBytes,
        message,
        ...(violationPath ? { path: violationPath } : {})
      });
      return;
    }
  }
}

function shouldFailForBudget(budgetResult, failOn) {
  if (failOn === "none") return false;
  if (failOn === "warning") return budgetResult.violations.length > 0;
  return budgetResult.errors.length > 0;
}

function sumBytes(entries) {
  return entries.reduce((total, entry) => total + entry.bytes, 0);
}

function normalizePath(filePath) {
  return filePath.split(path.sep).join("/");
}

function topLevelFor(filePath) {
  return filePath.includes("/") ? filePath.split("/")[0] : "(root)";
}

function extensionFor(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return extension || "(none)";
}

function bytesToMiB(bytes) {
  return Number((bytes / 1024 / 1024).toFixed(2));
}

function formatBytes(bytes) {
  return `${bytesToMiB(bytes)} MiB`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
