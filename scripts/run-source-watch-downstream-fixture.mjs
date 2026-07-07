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
    throw new Error("source watch downstream fixture requires --date YYYY-MM-DD");
  }
  if (!args.input) {
    throw new Error("source watch downstream fixture requires --input");
  }
  if (!args.output) {
    throw new Error("source watch downstream fixture requires --output");
  }
  if (!args.json) {
    throw new Error("source watch downstream fixture requires --json");
  }
  return args;
}

function readValue(argv, index, flag) {
  const value = argv[index] || "";
  if (!value || value.startsWith("--")) {
    throw new Error(`source watch downstream fixture requires ${flag} value`);
  }
  return value;
}

function resolveArtifactPath(rootDir, value, label) {
  if (!String(value).endsWith(".json")) {
    throw new Error(`source watch downstream fixture ${label} must end with .json`);
  }
  const allowedRoot = path.resolve(rootDir, ".tmp", "daily-codex-pipeline");
  const resolved = path.resolve(rootDir, value);
  const relative = path.relative(allowedRoot, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`source watch downstream fixture ${label} must stay under .tmp/daily-codex-pipeline`);
  }
  return resolved;
}

function buildExtractedCandidates({ input, reportDate }) {
  if (!input || typeof input !== "object" || input.kind !== "source_watch_candidates") {
    throw new Error("source watch downstream fixture input.kind must be source_watch_candidates");
  }
  if (!Array.isArray(input.candidates)) {
    throw new Error("source watch downstream fixture input.candidates must be an array");
  }

  const candidates = input.candidates.map((candidate, index) => ({
    id: stringField(candidate.id) || `source-watch-candidate-${index + 1}`,
    source_id: stringField(candidate.source_id),
    signal: stringField(candidate.signal),
    title: stringField(candidate.title),
    url: stringField(candidate.url),
    source: stringField(candidate.source),
    event_date: stringField(candidate.event_date) || reportDate,
    category: stringField(candidate.category),
    status: "pending",
    verification_status: stringField(candidate.verification_status),
    source_level: stringField(candidate.source_level),
    source_lane: stringField(candidate.source_lane),
    source_tier: stringField(candidate.source_tier),
    verification_policy: stringField(candidate.verification_policy),
    editorial_category: stringField(candidate.editorial_category),
    repo: stringField(candidate.repo),
    evidence: stringField(candidate.evidence),
    notes: stringField(candidate.notes),
    tags: Array.isArray(candidate.tags) ? candidate.tags.filter((tag) => typeof tag === "string") : []
  }));

  const signal_counts = candidates.reduce((counts, candidate) => {
    counts[candidate.signal] = (counts[candidate.signal] || 0) + 1;
    return counts;
  }, {});

  return {
    schema_version: 1,
    kind: "source_watch_extracted_candidates",
    mode: "daily_codex_dag_source_watch_downstream_fixture_output",
    report_date: reportDate,
    input_kind: input.kind,
    candidate_count: candidates.length,
    signal_counts,
    candidates
  };
}

function stringField(value) {
  return typeof value === "string" ? value : "";
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const rootDir = process.cwd();
    const inputPath = resolveArtifactPath(rootDir, args.input, "input");
    const outputPath = resolveArtifactPath(rootDir, args.output, "output");
    const input = JSON.parse(await fs.readFile(inputPath, "utf8"));
    const output = buildExtractedCandidates({ input, reportDate: args.date });

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
    process.stdout.write(`${JSON.stringify({
      ok: true,
      report_date: args.date,
      output_kind: output.kind,
      candidate_count: output.candidate_count,
      signal_counts: output.signal_counts
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
