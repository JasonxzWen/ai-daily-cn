#!/usr/bin/env node
import crypto from "node:crypto";
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
    throw new Error("source watch normalize fixture requires --date YYYY-MM-DD");
  }
  if (!args.input) {
    throw new Error("source watch normalize fixture requires --input");
  }
  if (!args.output) {
    throw new Error("source watch normalize fixture requires --output");
  }
  if (!args.json) {
    throw new Error("source watch normalize fixture requires --json");
  }
  return args;
}

function readValue(argv, index, flag) {
  const value = argv[index] || "";
  if (!value || value.startsWith("--")) {
    throw new Error(`source watch normalize fixture requires ${flag} value`);
  }
  return value;
}

function resolveArtifactPath(rootDir, value, label) {
  if (!String(value).endsWith(".json")) {
    throw new Error(`source watch normalize fixture ${label} must end with .json`);
  }
  const allowedRoot = path.resolve(rootDir, ".tmp", "daily-codex-pipeline");
  const resolved = path.resolve(rootDir, value);
  const relative = path.relative(allowedRoot, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`source watch normalize fixture ${label} must stay under .tmp/daily-codex-pipeline`);
  }
  return resolved;
}

function buildCanonicalCandidates({ input, reportDate }) {
  if (!input || typeof input !== "object" || input.kind !== "source_watch_extracted_candidates") {
    throw new Error("source watch normalize fixture input.kind must be source_watch_extracted_candidates");
  }
  if (!Array.isArray(input.candidates)) {
    throw new Error("source watch normalize fixture input.candidates must be an array");
  }

  const candidates = input.candidates.map((candidate, index) => {
    const canonicalUrl = canonicalizeUrl(stringField(candidate.url));
    const identityKey = canonicalUrl || `${stringField(candidate.source_id)}:${stringField(candidate.title)}`;
    return {
      id: stringField(candidate.id) || `source-watch-candidate-${index + 1}`,
      canonical_id: `source-watch:${hashText(identityKey).slice(0, 16)}`,
      source_id: stringField(candidate.source_id),
      signal: stringField(candidate.signal),
      title: normalizeWhitespace(stringField(candidate.title)),
      url: stringField(candidate.url),
      canonical_url: canonicalUrl,
      source: stringField(candidate.source),
      event_date: stringField(candidate.event_date) || reportDate,
      category: stringField(candidate.category),
      status: stringField(candidate.status) || "pending",
      verification_status: stringField(candidate.verification_status),
      source_level: stringField(candidate.source_level),
      source_lane: stringField(candidate.source_lane),
      source_tier: stringField(candidate.source_tier),
      verification_policy: stringField(candidate.verification_policy),
      editorial_category: stringField(candidate.editorial_category),
      repo: stringField(candidate.repo),
      evidence: normalizeWhitespace(stringField(candidate.evidence)),
      notes: normalizeWhitespace(stringField(candidate.notes)),
      tags: normalizeTags(candidate.tags)
    };
  });

  const signal_counts = candidates.reduce((counts, candidate) => {
    counts[candidate.signal] = (counts[candidate.signal] || 0) + 1;
    return counts;
  }, {});

  return {
    schema_version: 1,
    kind: "source_watch_canonical_candidates",
    mode: "daily_codex_dag_source_watch_normalize_fixture_output",
    report_date: reportDate,
    input_kind: input.kind,
    candidate_count: candidates.length,
    signal_counts,
    candidates
  };
}

function canonicalizeUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    const sortedParams = [...url.searchParams.entries()].sort(([left], [right]) => left.localeCompare(right));
    url.search = "";
    for (const [key, paramValue] of sortedParams) {
      url.searchParams.append(key, paramValue);
    }
    return url.toString();
  } catch {
    return value.trim();
  }
}

function hashText(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function normalizeTags(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((tag) => typeof tag === "string").map((tag) => normalizeWhitespace(tag)).filter(Boolean))].sort();
}

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
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
    const output = buildCanonicalCandidates({ input, reportDate: args.date });

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
