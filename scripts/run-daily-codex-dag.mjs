#!/usr/bin/env node
import { createDailyCodexDagDryRun } from "../src/daily-codex-dag.js";

function parseArgs(argv) {
  const args = {
    dryRun: false,
    json: false,
    date: ""
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

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = await createDailyCodexDagDryRun({ reportDate: args.date });
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
