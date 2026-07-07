#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

function parseArgs(argv) {
  const args = {
    date: "",
    input: "",
    output: "",
    json: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--date") {
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

  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
    throw new Error("source watch admit fixture requires --date YYYY-MM-DD");
  }
  if (!args.input) throw new Error("source watch admit fixture requires --input");
  if (!args.output) throw new Error("source watch admit fixture requires --output");
  if (!args.json) throw new Error("source watch admit fixture requires --json");
  return args;
}

function readValue(argv, index, flag) {
  const value = argv[index] || "";
  if (!value || value.startsWith("--")) {
    throw new Error(`source watch admit fixture requires ${flag} value`);
  }
  return value;
}

function resolvePipelineArtifactPath(rootDir, value, label) {
  if (!String(value).endsWith(".json")) {
    throw new Error(`source watch admit fixture ${label} must end with .json`);
  }
  const allowedRoot = path.resolve(rootDir, ".tmp", "daily-codex-pipeline");
  const resolved = path.resolve(rootDir, value);
  const relative = path.relative(allowedRoot, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`source watch admit fixture ${label} must stay under .tmp/daily-codex-pipeline`);
  }
  return resolved;
}

function buildAdmittedCandidates({ input, reportDate }) {
  if (!isPlainObject(input) || input.kind !== "source_watch_quality_candidates") {
    throw new Error("source watch admit fixture input.kind must be source_watch_quality_candidates");
  }
  if (!Array.isArray(input.candidates)) {
    throw new Error("source watch admit fixture input.candidates must be an array");
  }
  if (input.quality_audit?.public_surface === true) {
    throw new Error("source watch admit fixture input quality_audit.public_surface must not be true");
  }

  const candidates = input.candidates
    .filter((candidate) => candidate?.decision === "admitted")
    .map(copyCandidate);
  const signalCounts = candidates.reduce((counts, candidate) => {
    const signal = stringField(candidate.signal);
    if (signal) counts[signal] = (counts[signal] || 0) + 1;
    return counts;
  }, {});

  return {
    schema_version: 1,
    kind: "source_watch_admitted_candidates",
    mode: "source_watch_admit_fixture_output",
    report_date: reportDate,
    input_kind: input.kind,
    input_candidate_count: input.candidates.length,
    candidate_count: candidates.length,
    signal_counts: signalCounts,
    public_surface: false,
    admission_audit: {
      public_surface: false,
      admitted_only: true,
      source_quality_candidate_count: input.candidates.length,
      suppressed_input_count: input.candidates.filter((candidate) => candidate?.decision === "suppressed").length,
      notes: "Internal Source Watch admitted-candidates handoff only; public promotion still requires downstream article/report gates."
    },
    candidates
  };
}

function copyCandidate(candidate) {
  return JSON.parse(JSON.stringify(candidate));
}

function stringField(value) {
  return typeof value === "string" ? value : "";
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const rootDir = process.cwd();
    const inputPath = resolvePipelineArtifactPath(rootDir, args.input, "input");
    const outputPath = resolvePipelineArtifactPath(rootDir, args.output, "output");
    const input = JSON.parse(await fs.readFile(inputPath, "utf8"));
    const output = buildAdmittedCandidates({ input, reportDate: args.date });

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
    process.stdout.write(`${JSON.stringify({
      ok: true,
      report_date: args.date,
      output_kind: output.kind,
      candidate_count: output.candidate_count,
      input_candidate_count: output.input_candidate_count,
      suppressed_input_count: output.admission_audit.suppressed_input_count
    }, null, 2)}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({
      ok: false,
      failures: [error instanceof Error ? error.message : String(error)]
    }, null, 2)}\n`);
    process.exitCode = 1;
  }
}

await main();
