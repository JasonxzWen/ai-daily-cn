#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import {
  collectSourceWatch,
  createSourceWatchFixtureFetch
} from "../src/discovery.js";

function parseArgs(argv) {
  const args = {
    date: "",
    generatedAt: "",
    config: path.join("tests", "fixtures", "source-watch", "source-watchlist.json"),
    fixtureDir: path.join("tests", "fixtures", "source-watch"),
    output: "",
    endpointLimit: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--date") {
      index += 1;
      args.date = argv[index] || "";
    } else if (arg === "--generated-at") {
      index += 1;
      args.generatedAt = argv[index] || "";
    } else if (arg === "--config") {
      index += 1;
      args.config = argv[index] || "";
    } else if (arg === "--fixture-dir") {
      index += 1;
      args.fixtureDir = argv[index] || "";
    } else if (arg === "--output") {
      index += 1;
      args.output = argv[index] || "";
    } else if (arg === "--endpoint-limit") {
      index += 1;
      args.endpointLimit = Number.parseInt(argv[index] || "", 10);
    } else if (arg === "--json") {
      // Accepted for parity with other DAG command scripts.
    } else {
      throw new Error(`Unsupported argument: ${arg}`);
    }
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
    throw new Error("source watch collect fixture requires --date YYYY-MM-DD");
  }
  if (!args.output || !String(args.output).endsWith(".json")) {
    throw new Error("source watch collect fixture requires --output JSON path");
  }
  if (args.generatedAt && Number.isNaN(Date.parse(args.generatedAt))) {
    throw new Error("source watch collect fixture --generated-at must be a valid timestamp");
  }
  if (args.endpointLimit !== null && (!Number.isInteger(args.endpointLimit) || args.endpointLimit < 1)) {
    throw new Error("source watch collect fixture --endpoint-limit must be a positive integer");
  }
  return args;
}

function resolveOutputPath(rootDir, value) {
  const allowedRoot = path.resolve(rootDir, ".tmp", "daily-codex-pipeline");
  const resolved = path.resolve(rootDir, value);
  const relative = path.relative(allowedRoot, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("source watch collect fixture output must stay under .tmp/daily-codex-pipeline");
  }
  return resolved;
}

async function main() {
  const rootDir = process.cwd();
  const args = parseArgs(process.argv.slice(2));
  const outputPath = resolveOutputPath(rootDir, args.output);
  const fetchImpl = await createSourceWatchFixtureFetch(path.resolve(rootDir, args.fixtureDir));
  const artifact = await collectSourceWatch({
    rootDir,
    reportDate: args.date,
    generatedAt: args.generatedAt || new Date().toISOString(),
    watchlistPath: path.resolve(rootDir, args.config),
    fixtureDir: path.resolve(rootDir, args.fixtureDir),
    endpointLimit: args.endpointLimit || undefined,
    fetchImpl
  });

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({
    ok: true,
    output_path: outputPath,
    report_date: artifact.report_date,
    candidates_found: artifact.candidates.length,
    source_audit_keys: Object.keys(artifact.source_audit || {})
  }, null, 2)}\n`);
}

try {
  await main();
} catch (error) {
  process.stdout.write(`${JSON.stringify({
    ok: false,
    failures: [error instanceof Error ? error.message : String(error)]
  }, null, 2)}\n`);
  process.exitCode = 1;
}
