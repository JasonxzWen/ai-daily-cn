#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { createDailyCodexDagDryRun } from "../src/daily-codex-dag.js";

function parseArgs(argv) {
  const args = {
    dryRun: false,
    json: false,
    date: "",
    summaryPath: ""
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--json") {
      args.json = true;
    } else if (arg === "--date") {
      index += 1;
      args.date = argv[index] || "";
    } else if (arg === "--summary-path") {
      index += 1;
      args.summaryPath = argv[index] || "";
      if (!args.summaryPath || args.summaryPath.startsWith("--")) {
        throw new Error("daily codex DAG CLI requires --summary-path value");
      }
    } else {
      throw new Error(`Unsupported argument: ${arg}`);
    }
  }

  if (!args.dryRun) {
    throw new Error("daily codex DAG CLI requires --dry-run");
  }
  if (!args.json) {
    throw new Error("daily codex DAG CLI requires --json");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
    throw new Error("daily codex DAG CLI requires --date YYYY-MM-DD");
  }

  return args;
}

function resolveSummaryPath(rootDir, value) {
  if (!value) return "";
  if (!String(value).endsWith(".json")) {
    throw new Error("daily codex DAG summary path must end with .json");
  }
  const allowedRoot = path.resolve(rootDir, ".tmp", "daily-codex-pipeline");
  const resolved = path.resolve(rootDir, value);
  const relative = path.relative(allowedRoot, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("daily codex DAG summary path must stay under .tmp/daily-codex-pipeline");
  }
  return resolved;
}

async function writeSummaryFile(filePath, result) {
  if (!filePath) return;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const summaryPath = resolveSummaryPath(process.cwd(), args.summaryPath);
    const result = await createDailyCodexDagDryRun({ reportDate: args.date });
    if (result.ok) {
      await writeSummaryFile(summaryPath, result);
    }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = result.ok ? 0 : 1;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({
      ok: false,
      failures: [error.message],
      warnings: [],
      validation: null,
      plan: null,
      run: null
    }, null, 2)}\n`);
    process.exitCode = 1;
  }
}

await main();
