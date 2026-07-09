#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import {
  buildEditorialRankArtifact,
  formatEditorialRankErrors,
  validateEditorialRankArtifact
} from "../src/editorial-rank.js";

function parseArgs(argv) {
  const args = {
    input: "",
    out: "",
    generatedAt: "",
    sourceDate: "",
    sourceFrom: "",
    sourceTo: "",
    relativeHours: null,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--input") {
      args.input = readValue(argv, ++index, arg);
    } else if (arg === "--out") {
      args.out = readValue(argv, ++index, arg);
    } else if (arg === "--generated-at") {
      args.generatedAt = readValue(argv, ++index, arg);
    } else if (arg === "--source-date") {
      args.sourceDate = readValue(argv, ++index, arg);
    } else if (arg === "--source-from") {
      args.sourceFrom = readValue(argv, ++index, arg);
    } else if (arg === "--source-to") {
      args.sourceTo = readValue(argv, ++index, arg);
    } else if (arg === "--relative-hours") {
      args.relativeHours = Number(readValue(argv, ++index, arg));
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else {
      throw new Error(`Unsupported argument: ${arg}`);
    }
  }

  if (args.help) return args;
  if (!args.input) {
    throw new Error("editorial rank artifact builder requires --input");
  }
  if (args.relativeHours !== null && (!Number.isInteger(args.relativeHours) || args.relativeHours < 1)) {
    throw new Error("editorial rank artifact builder --relative-hours must be a positive integer");
  }
  if (args.sourceDate && !/^\d{4}-\d{2}-\d{2}$/.test(args.sourceDate)) {
    throw new Error("editorial rank artifact builder --source-date must be YYYY-MM-DD");
  }
  return args;
}

function readValue(argv, index, flag) {
  const value = argv[index] || "";
  if (!value || value.startsWith("--")) {
    throw new Error(`editorial rank artifact builder requires ${flag} value`);
  }
  return value;
}

function usage() {
  return [
    "Usage: node scripts/build-editorial-rank-artifact.mjs --input candidates.json [--out .tmp/editorial-rank/artifact.json]",
    "",
    "Input may be a candidate array or an object with candidates and optional source_window.",
    "Without --out, the validated internal editorial rank artifact is written to stdout."
  ].join("\n");
}

async function readCandidateInput(inputPath) {
  const input = JSON.parse(await fs.readFile(inputPath, "utf8"));
  if (Array.isArray(input)) {
    return {
      candidates: input,
      sourceWindow: undefined,
      generatedAt: undefined
    };
  }
  if (isPlainObject(input) && Array.isArray(input.candidates)) {
    return {
      candidates: input.candidates,
      sourceWindow: isPlainObject(input.source_window) ? input.source_window : undefined,
      generatedAt: input.generated_at
    };
  }
  throw new Error("editorial rank artifact builder input must be a candidate array or object with candidates[]");
}

function sourceWindowFromArgs(args, fallback) {
  if (args.sourceDate) {
    return { date: args.sourceDate };
  }
  if (args.sourceFrom || args.sourceTo) {
    return {
      ...(args.sourceFrom ? { from: args.sourceFrom } : {}),
      ...(args.sourceTo ? { to: args.sourceTo } : {})
    };
  }
  if (args.relativeHours !== null) {
    return { relative_hours: args.relativeHours };
  }
  return fallback;
}

function resolveInternalOutputPath(rootDir, value) {
  if (!String(value).endsWith(".json")) {
    throw new Error("editorial rank artifact output must end with .json");
  }
  const resolved = path.resolve(rootDir, value);
  const relativeToRoot = path.relative(rootDir, resolved);
  if (!relativeToRoot || relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    throw new Error("editorial rank artifact output must stay inside the repository");
  }
  const normalized = relativeToRoot.split(path.sep).join("/");
  if (normalized === "docs" || normalized.startsWith("docs/")) {
    throw new Error("editorial rank artifact output must not be written under docs/");
  }
  if (normalized === "apps" || normalized.startsWith("apps/")) {
    throw new Error("editorial rank artifact output must not be written under apps/");
  }
  if (normalized.startsWith(".tmp/")) {
    return resolved;
  }
  if (/^reports-data\/[^/]+\/[^/]+\/internal\//.test(normalized)) {
    return resolved;
  }
  throw new Error("editorial rank artifact output must stay under .tmp/ or reports-data/YYYY/MM/internal/");
}

function summarizeArtifact(artifact, outputPath) {
  return {
    ok: true,
    output_kind: "editorial_rank_artifact",
    policy_id: artifact.policy_id,
    generated_at: artifact.generated_at,
    item_count: artifact.items.length,
    today_selected_count: artifact.items.filter((item) => item.admission.today_selected.selected).length,
    must_read_count: artifact.items.filter((item) => item.admission.must_read.selected).length,
    ...(outputPath ? { output_path: outputPath } : {})
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      process.stdout.write(`${usage()}\n`);
      return;
    }

    const rootDir = process.cwd();
    const inputPath = path.resolve(rootDir, args.input);
    const input = await readCandidateInput(inputPath);
    const artifact = buildEditorialRankArtifact({
      rootDir,
      candidates: input.candidates,
      generatedAt: args.generatedAt || input.generatedAt,
      sourceWindow: sourceWindowFromArgs(args, input.sourceWindow)
    });
    const validation = validateEditorialRankArtifact(artifact, { rootDir });
    if (!validation.valid) {
      throw new Error(`editorial rank artifact schema validation failed: ${formatEditorialRankErrors(validation.errors)}`);
    }

    if (args.out) {
      const outputPath = resolveInternalOutputPath(rootDir, args.out);
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, `${JSON.stringify(validation.value, null, 2)}\n`, "utf8");
      process.stdout.write(`${JSON.stringify(summarizeArtifact(validation.value, outputPath), null, 2)}\n`);
      return;
    }

    process.stdout.write(`${JSON.stringify(validation.value, null, 2)}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({
      ok: false,
      failures: [error instanceof Error ? error.message : String(error)]
    }, null, 2)}\n`);
    process.exitCode = 1;
  }
}

await main();
