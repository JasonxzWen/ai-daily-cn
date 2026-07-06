#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const SUPPORTED_NODE_ID = "score";

function parseArgs(argv) {
  const args = {
    node: "",
    date: "",
    input: "",
    output: "",
    json: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--node") {
      args.node = readValue(argv, ++index, arg);
    } else if (arg === "--date") {
      args.date = readValue(argv, ++index, arg);
    } else if (arg === "--input") {
      args.input = readValue(argv, ++index, arg);
    } else if (arg === "--output") {
      args.output = readValue(argv, ++index, arg);
    } else if (arg === "--json") {
      args.json = true;
    } else {
      throw new Error(`Unsupported argument: ${arg}`);
    }
  }

  if (args.node !== SUPPORTED_NODE_ID) {
    throw new Error(`daily codex DAG node fixture replay only supports ${SUPPORTED_NODE_ID}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
    throw new Error("daily codex DAG node fixture replay requires --date YYYY-MM-DD");
  }
  if (!args.input) {
    throw new Error("daily codex DAG node fixture replay requires --input");
  }
  if (!args.output) {
    throw new Error("daily codex DAG node fixture replay requires --output");
  }
  if (!args.json) {
    throw new Error("daily codex DAG node fixture replay requires --json");
  }

  return args;
}

function readValue(argv, index, flag) {
  const value = argv[index] || "";
  if (!value || value.startsWith("--")) {
    throw new Error(`daily codex DAG node fixture replay requires ${flag} value`);
  }
  return value;
}

function resolveArtifactPath(rootDir, value, label) {
  if (!String(value).endsWith(".json")) {
    throw new Error(`daily codex DAG node fixture replay ${label} must end with .json`);
  }
  const allowedRoot = path.resolve(rootDir, ".tmp", "daily-codex-pipeline");
  const resolved = path.resolve(rootDir, value);
  const relative = path.relative(allowedRoot, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`daily codex DAG node fixture replay ${label} must stay under .tmp/daily-codex-pipeline`);
  }
  return resolved;
}

function buildScoredCandidates({ input, reportDate }) {
  if (!input || typeof input !== "object" || !Array.isArray(input.candidates)) {
    throw new Error("daily codex DAG node fixture replay input.candidates must be an array");
  }
  return {
    schema_version: 1,
    mode: "daily_codex_dag_real_node_adapter_fixture_output",
    report_date: reportDate,
    node_id: SUPPORTED_NODE_ID,
    candidates: input.candidates.map((candidate, index) => ({
      ...candidate,
      score: {
        quality_score: Number((0.91 - index * 0.01).toFixed(2)),
        rank: index + 1,
        rationale: "deterministic fixture score"
      }
    }))
  };
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const rootDir = process.cwd();
    const inputPath = resolveArtifactPath(rootDir, args.input, "input");
    const outputPath = resolveArtifactPath(rootDir, args.output, "output");
    const input = JSON.parse(await fs.readFile(inputPath, "utf8"));
    const output = buildScoredCandidates({ input, reportDate: args.date });

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
    process.stdout.write(`${JSON.stringify({
      ok: true,
      node_id: SUPPORTED_NODE_ID,
      report_date: args.date,
      candidate_count: output.candidates.length
    }, null, 2)}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({
      ok: false,
      failures: [error.message]
    }, null, 2)}\n`);
    process.exitCode = 1;
  }
}

await main();
