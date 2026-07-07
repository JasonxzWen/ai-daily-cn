#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import {
  createDailyCodexDagContractRun,
  createDailyCodexDagDryRun,
  createDailyCodexDagExecutableNodeMvp,
  createDailyCodexDagRealNodeAdapterMvp,
  createDailyCodexDagSourceWatchCollectMvp,
  createDailyCodexDagSourceWatchDownstreamMvp,
  createDailyCodexDagSourceWatchNormalizeMvp,
  createDailyCodexDagSourceWatchQualityMvp,
  createDailyCodexDagSourceWatchAdmitMvp,
  createDailyCodexDagTwoNodeFixtureMvp
} from "../src/daily-codex-dag.js";

function parseArgs(argv) {
  const args = {
    dryRun: false,
    contractRun: false,
    executeNodeFixture: false,
    executeRealNodeFixture: false,
    executeSourceWatchFixture: false,
    executeSourceWatchDownstreamFixture: false,
    executeSourceWatchNormalizeFixture: false,
    executeSourceWatchQualityFixture: false,
    executeSourceWatchAdmitFixture: false,
    executeTwoNodeFixture: false,
    execute: false,
    publish: false,
    json: false,
    date: "",
    node: "",
    summaryPath: ""
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--contract-run") {
      args.contractRun = true;
    } else if (arg === "--execute-node-fixture") {
      args.executeNodeFixture = true;
    } else if (arg === "--execute-real-node-fixture") {
      args.executeRealNodeFixture = true;
    } else if (arg === "--execute-source-watch-fixture") {
      args.executeSourceWatchFixture = true;
    } else if (arg === "--execute-source-watch-downstream-fixture") {
      args.executeSourceWatchDownstreamFixture = true;
    } else if (arg === "--execute-source-watch-normalize-fixture") {
      args.executeSourceWatchNormalizeFixture = true;
    } else if (arg === "--execute-source-watch-quality-fixture") {
      args.executeSourceWatchQualityFixture = true;
    } else if (arg === "--execute-source-watch-admit-fixture") {
      args.executeSourceWatchAdmitFixture = true;
    } else if (arg === "--execute-two-node-fixture") {
      args.executeTwoNodeFixture = true;
    } else if (arg === "--execute") {
      args.execute = true;
    } else if (arg === "--publish") {
      args.publish = true;
    } else if (arg === "--json") {
      args.json = true;
    } else if (arg === "--date") {
      index += 1;
      args.date = argv[index] || "";
    } else if (arg === "--node") {
      index += 1;
      args.node = argv[index] || "";
      if (!args.node || args.node.startsWith("--")) {
        throw new Error("daily codex DAG CLI requires --node value");
      }
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

  const modeCount = [
    args.dryRun,
    args.contractRun,
    args.executeNodeFixture,
    args.executeRealNodeFixture,
    args.executeSourceWatchFixture,
    args.executeSourceWatchDownstreamFixture,
    args.executeSourceWatchNormalizeFixture,
    args.executeSourceWatchQualityFixture,
    args.executeSourceWatchAdmitFixture,
    args.executeTwoNodeFixture
  ].filter(Boolean).length;
  if (modeCount === 0) {
    throw new Error("daily codex DAG CLI requires one of --dry-run, --contract-run, --execute-node-fixture, --execute-real-node-fixture, --execute-source-watch-fixture, --execute-source-watch-downstream-fixture, --execute-source-watch-normalize-fixture, --execute-source-watch-quality-fixture, --execute-source-watch-admit-fixture, or --execute-two-node-fixture");
  }
  if (args.dryRun && args.contractRun && !args.executeNodeFixture && !args.executeRealNodeFixture && !args.executeSourceWatchFixture && !args.executeSourceWatchDownstreamFixture && !args.executeSourceWatchNormalizeFixture && !args.executeSourceWatchQualityFixture && !args.executeSourceWatchAdmitFixture && !args.executeTwoNodeFixture) {
    throw new Error("daily codex DAG CLI cannot combine --dry-run and --contract-run");
  }
  if (modeCount > 1) {
    throw new Error("daily codex DAG CLI cannot combine --dry-run, --contract-run, --execute-node-fixture, --execute-real-node-fixture, --execute-source-watch-fixture, --execute-source-watch-downstream-fixture, --execute-source-watch-normalize-fixture, --execute-source-watch-quality-fixture, --execute-source-watch-admit-fixture, and --execute-two-node-fixture");
  }
  if (args.dryRun && (args.execute || args.publish)) {
    throw new Error(`Unsupported argument: ${args.execute ? "--execute" : "--publish"}`);
  }
  if (args.contractRun && (args.execute || args.publish)) {
    throw new Error("daily codex DAG CLI contract-run does not support --execute or --publish");
  }
  if (args.executeNodeFixture && (args.execute || args.publish)) {
    throw new Error("daily codex DAG CLI execute-node fixture does not support --execute or --publish");
  }
  if (args.executeRealNodeFixture && (args.execute || args.publish)) {
    throw new Error("daily codex DAG CLI execute-real-node fixture does not support --execute or --publish");
  }
  if (args.executeSourceWatchFixture && (args.execute || args.publish)) {
    throw new Error("daily codex DAG CLI execute-source-watch fixture does not support --execute or --publish");
  }
  if (args.executeSourceWatchDownstreamFixture && (args.execute || args.publish)) {
    throw new Error("daily codex DAG CLI execute-source-watch-downstream fixture does not support --execute or --publish");
  }
  if (args.executeSourceWatchNormalizeFixture && (args.execute || args.publish)) {
    throw new Error("daily codex DAG CLI execute-source-watch-normalize fixture does not support --execute or --publish");
  }
  if (args.executeSourceWatchQualityFixture && (args.execute || args.publish)) {
    throw new Error("daily codex DAG CLI execute-source-watch-quality fixture does not support --execute or --publish");
  }
  if (args.executeSourceWatchAdmitFixture && (args.execute || args.publish)) {
    throw new Error("daily codex DAG CLI execute-source-watch-admit fixture does not support --execute or --publish");
  }
  if (args.executeTwoNodeFixture && (args.execute || args.publish)) {
    throw new Error("daily codex DAG CLI execute-two-node fixture does not support --execute or --publish");
  }
  if (!args.executeRealNodeFixture && args.node) {
    throw new Error("daily codex DAG CLI --node is only supported with --execute-real-node-fixture");
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
    const result = args.contractRun
      ? await createDailyCodexDagContractRun({ reportDate: args.date })
      : args.executeNodeFixture
        ? await createDailyCodexDagExecutableNodeMvp({ reportDate: args.date })
        : args.executeRealNodeFixture
          ? await createDailyCodexDagRealNodeAdapterMvp({ reportDate: args.date, nodeId: args.node || "score" })
          : args.executeSourceWatchFixture
            ? await createDailyCodexDagSourceWatchCollectMvp({ reportDate: args.date })
            : args.executeSourceWatchDownstreamFixture
              ? await createDailyCodexDagSourceWatchDownstreamMvp({ reportDate: args.date })
              : args.executeSourceWatchNormalizeFixture
                ? await createDailyCodexDagSourceWatchNormalizeMvp({ reportDate: args.date })
                : args.executeSourceWatchQualityFixture
                  ? await createDailyCodexDagSourceWatchQualityMvp({ reportDate: args.date })
                  : args.executeSourceWatchAdmitFixture
                    ? await createDailyCodexDagSourceWatchAdmitMvp({ reportDate: args.date })
                    : args.executeTwoNodeFixture
                      ? await createDailyCodexDagTwoNodeFixtureMvp({ reportDate: args.date })
                      : await createDailyCodexDagDryRun({ reportDate: args.date });
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
