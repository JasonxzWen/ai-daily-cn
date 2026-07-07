#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

function parseArgs(argv) {
  const args = {
    date: "",
    input: "",
    output: "",
    history: "",
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
    } else if (arg === "--history") {
      args.history = readValue(argv, ++index, arg);
    } else if (arg === "--json") {
      args.json = true;
    } else {
      throw new Error(`Unsupported argument: ${arg}`);
    }
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
    throw new Error("source watch quality fixture requires --date YYYY-MM-DD");
  }
  if (!args.input) throw new Error("source watch quality fixture requires --input");
  if (!args.output) throw new Error("source watch quality fixture requires --output");
  if (!args.json) throw new Error("source watch quality fixture requires --json");
  return args;
}

function readValue(argv, index, flag) {
  const value = argv[index] || "";
  if (!value || value.startsWith("--")) {
    throw new Error(`source watch quality fixture requires ${flag} value`);
  }
  return value;
}

function resolvePipelineArtifactPath(rootDir, value, label) {
  if (!String(value).endsWith(".json")) {
    throw new Error(`source watch quality fixture ${label} must end with .json`);
  }
  const allowedRoot = path.resolve(rootDir, ".tmp", "daily-codex-pipeline");
  const resolved = path.resolve(rootDir, value);
  const relative = path.relative(allowedRoot, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`source watch quality fixture ${label} must stay under .tmp/daily-codex-pipeline`);
  }
  return resolved;
}

async function readHistory(rootDir, historyPath) {
  if (!historyPath) {
    return { previous_candidates: [], repo_snapshots: {} };
  }
  if (!String(historyPath).endsWith(".json")) {
    throw new Error("source watch quality fixture history must end with .json");
  }
  const resolved = resolveHistoryPath(rootDir, historyPath);
  const history = JSON.parse(await fs.readFile(resolved, "utf8"));
  return {
    previous_candidates: Array.isArray(history.previous_candidates) ? history.previous_candidates : [],
    repo_snapshots: isPlainObject(history.repo_snapshots) ? history.repo_snapshots : {}
  };
}

function resolveHistoryPath(rootDir, historyPath) {
  const resolved = path.resolve(rootDir, historyPath);
  const allowedRoots = [
    path.resolve(rootDir, "tests", "fixtures", "source-watch"),
    path.resolve(rootDir, ".tmp", "daily-codex-pipeline")
  ];
  if (!allowedRoots.some((allowedRoot) => isInsidePath(allowedRoot, resolved))) {
    throw new Error("source watch quality fixture history must stay under tests/fixtures/source-watch or .tmp/daily-codex-pipeline");
  }
  return resolved;
}

function isInsidePath(rootPath, candidatePath) {
  const relative = path.relative(rootPath, candidatePath);
  return !relative || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function buildQualityCandidates({ input, history, reportDate }) {
  if (!input || typeof input !== "object" || input.kind !== "source_watch_canonical_candidates") {
    throw new Error("source watch quality fixture input.kind must be source_watch_canonical_candidates");
  }
  if (!Array.isArray(input.candidates)) {
    throw new Error("source watch quality fixture input.candidates must be an array");
  }

  const seenIdentities = new Map();
  const candidates = input.candidates.map((candidate) => {
    const identity = candidateIdentity(candidate);
    const duplicateOf = seenIdentities.get(identity) || "";
    if (!duplicateOf) {
      seenIdentities.set(identity, stringField(candidate.id) || stringField(candidate.canonical_id) || identity);
    }
    const quality = qualityForCandidate({ candidate, history, reportDate, duplicateOf });
    return {
      ...copyCandidate(candidate),
      decision: quality.decision,
      quality_score: quality.quality_score,
      suppression_reasons: quality.suppression_reasons,
      duplicate_of: duplicateOf,
      freshness: quality.freshness,
      repo_delta: quality.repo_delta,
      summary_template: quality.summary_template
    };
  });

  const signalCounts = candidates.reduce((counts, candidate) => {
    counts[candidate.signal] = (counts[candidate.signal] || 0) + 1;
    return counts;
  }, {});
  const admitted = candidates.filter((candidate) => candidate.decision === "admitted");
  const suppressed = candidates.filter((candidate) => candidate.decision === "suppressed");

  return {
    schema_version: 1,
    kind: "source_watch_quality_candidates",
    mode: "source_watch_quality_loop_fixture_output",
    report_date: reportDate,
    input_kind: input.kind,
    candidate_count: candidates.length,
    admitted_count: admitted.length,
    suppressed_count: suppressed.length,
    duplicate_count: candidates.filter((candidate) => candidate.suppression_reasons.includes("duplicate_current")).length,
    stale_count: candidates.filter((candidate) => candidate.suppression_reasons.includes("seen_recently")).length,
    unchanged_repo_count: candidates.filter((candidate) => candidate.suppression_reasons.includes("repo_unchanged")).length,
    signal_counts: signalCounts,
    quality_audit: {
      public_surface: false,
      notes: "Internal Source Watch quality loop only; PR-G public promotion must consume admitted candidates after review.",
      suppressed_reasons: uniqueSorted(suppressed.flatMap((candidate) => candidate.suppression_reasons))
    },
    candidates
  };
}

function qualityForCandidate({ candidate, history, reportDate, duplicateOf }) {
  const notes = parseNotes(candidate.notes);
  const previousCandidate = findPreviousCandidate(candidate, history.previous_candidates);
  const freshness = freshnessStatus(previousCandidate, reportDate);
  const repoDeltaResult = candidate.signal === "github_watch"
    ? repoDelta(candidate, notes, history.repo_snapshots[stringField(candidate.repo)] || {})
    : null;
  const suppressionReasons = [];

  if (duplicateOf) suppressionReasons.push("duplicate_current");
  if (candidate.signal === "github_watch" && repoDeltaResult?.status === "unchanged") {
    suppressionReasons.push("repo_unchanged");
  }
  if (
    candidate.signal === "github_watch"
    && freshness.status === "seen_recently"
    && repoDeltaResult?.status !== "changed"
    && repoDeltaResult?.status !== "new"
  ) {
    suppressionReasons.push("seen_recently");
  }
  if (candidate.signal === "github_watch" && isThinRepoSignal(candidate, notes)) {
    suppressionReasons.push("thin_repo_signal");
  }

  const decision = suppressionReasons.length > 0 ? "suppressed" : "admitted";
  return {
    decision,
    suppression_reasons: uniqueSorted(suppressionReasons),
    freshness,
    repo_delta: repoDeltaResult,
    summary_template: candidate.signal === "github_watch" ? githubSummaryTemplate(candidate, notes, repoDeltaResult) : null,
    quality_score: qualityScore({
      decision,
      suppression_reasons: suppressionReasons,
      repo_delta: repoDeltaResult,
      freshness
    })
  };
}

function repoDelta(candidate, notes, previous) {
  if (!isPlainObject(previous) || Object.keys(previous).length === 0) {
    return {
      status: "new",
      stars_delta: 0,
      forks_delta: 0,
      pushed_at_changed: true,
      latest_commit_changed: true,
      latest_release_changed: Boolean(notes.latest_release),
      latest_tag_changed: Boolean(notes.latest_tag)
    };
  }
  const currentStars = numberFromString(notes.stars);
  const currentForks = numberFromString(notes.forks);
  const currentCommit = stringField(notes.latest_commit);
  const currentRelease = stringField(notes.latest_release);
  const currentTag = stringField(notes.latest_tag);
  const currentPushedAt = stringField(notes.pushed_at);
  const starsDelta = currentStars - nonNegativeIntegerOrZero(previous.stars);
  const forksDelta = currentForks - nonNegativeIntegerOrZero(previous.forks);
  const pushedAtChanged = Boolean(currentPushedAt && currentPushedAt !== stringField(previous.pushed_at));
  const latestCommitChanged = Boolean(currentCommit && currentCommit !== stringField(previous.latest_commit));
  const latestReleaseChanged = Boolean(currentRelease && currentRelease !== stringField(previous.latest_release));
  const latestTagChanged = Boolean(currentTag && currentTag !== stringField(previous.latest_tag));
  const changed = starsDelta !== 0
    || forksDelta !== 0
    || pushedAtChanged
    || latestCommitChanged
    || latestReleaseChanged
    || latestTagChanged;

  return {
    status: changed ? "changed" : "unchanged",
    stars_delta: starsDelta,
    forks_delta: forksDelta,
    pushed_at_changed: pushedAtChanged,
    latest_commit_changed: latestCommitChanged,
    latest_release_changed: latestReleaseChanged,
    latest_tag_changed: latestTagChanged
  };
}

function freshnessStatus(previousCandidate, reportDate) {
  if (!previousCandidate) {
    return { status: "new", previous_seen_date: "", days_since_seen: null };
  }
  const previousSeenDate = stringField(previousCandidate.last_seen_date || previousCandidate.report_date || previousCandidate.event_date);
  const days = daysBetween(previousSeenDate, reportDate);
  const seenRecently = Number.isInteger(days) && days >= 0 && days <= 7;
  return {
    status: seenRecently ? "seen_recently" : "fresh",
    previous_seen_date: previousSeenDate,
    days_since_seen: Number.isInteger(days) ? days : null
  };
}

function githubSummaryTemplate(candidate, notes, repoDeltaResult) {
  const repo = stringField(candidate.repo) || stringField(candidate.title);
  const tags = Array.isArray(candidate.tags) ? candidate.tags.filter(Boolean).slice(0, 4) : [];
  const purposeTarget = tags.length ? tags.join(", ") : "AI source monitoring";
  const changedParts = [];
  if (repoDeltaResult?.status === "changed") {
    if (repoDeltaResult.pushed_at_changed) changedParts.push("pushed_at");
    if (repoDeltaResult.latest_commit_changed) changedParts.push("latest_commit");
    if (repoDeltaResult.latest_release_changed) changedParts.push("release");
    if (repoDeltaResult.latest_tag_changed) changedParts.push("tag");
    if (repoDeltaResult.stars_delta) changedParts.push(`stars_delta=${repoDeltaResult.stars_delta}`);
    if (repoDeltaResult.forks_delta) changedParts.push(`forks_delta=${repoDeltaResult.forks_delta}`);
  }
  const change = repoDeltaResult?.status === "new"
    ? "New Source Watch repository without historical snapshot; keep it as an internal candidate."
    : repoDeltaResult?.status === "changed"
      ? `Historical snapshot changed: ${changedParts.join(", ")}.`
      : "Historical snapshot is unchanged; suppress by default before public promotion.";
  const evidence = [
    notes.stars ? `stars=${notes.stars}` : "",
    notes.forks ? `forks=${notes.forks}` : "",
    notes.pushed_at ? `pushed_at=${notes.pushed_at}` : "",
    notes.latest_release ? `latest_release=${notes.latest_release}` : "",
    notes.latest_tag ? `latest_tag=${notes.latest_tag}` : "",
    notes.latest_commit ? `latest_commit=${notes.latest_commit}` : ""
  ].filter(Boolean).join("; ");

  return {
    purpose: `${repo} tracks open-source signals related to ${purposeTarget}.`,
    change,
    evidence,
    fit: "Internal Source Watch candidate only; public promotion still needs downstream classify, score, and review gates."
  };
}

function qualityScore({ decision, suppression_reasons, repo_delta, freshness }) {
  let score = 70;
  if (repo_delta?.status === "changed") score += 15;
  if (repo_delta?.status === "new") score += 8;
  if (repo_delta?.status === "unchanged") score -= 25;
  if (freshness.status === "seen_recently") score -= 15;
  if (suppression_reasons.includes("duplicate_current")) score -= 40;
  if (suppression_reasons.includes("thin_repo_signal")) score -= 20;
  if (decision === "suppressed") score -= 5;
  return Math.max(0, Math.min(100, score));
}

function isThinRepoSignal(candidate, notes) {
  const tags = Array.isArray(candidate.tags) ? candidate.tags.filter(Boolean) : [];
  return tags.length === 0
    && !notes.latest_release
    && !notes.latest_tag
    && !notes.latest_commit
    && stringField(candidate.evidence).length < 40;
}

function findPreviousCandidate(candidate, previousCandidates) {
  const canonicalId = stringField(candidate.canonical_id);
  const canonicalUrl = stringField(candidate.canonical_url);
  const repo = stringField(candidate.repo);
  return previousCandidates.find((previous) => (
    (canonicalId && previous.canonical_id === canonicalId)
    || (canonicalUrl && previous.canonical_url === canonicalUrl)
    || (repo && previous.repo === repo)
  )) || null;
}

function candidateIdentity(candidate) {
  return stringField(candidate.repo)
    || stringField(candidate.canonical_url)
    || stringField(candidate.canonical_id)
    || `${stringField(candidate.source_id)}:${stringField(candidate.title)}`;
}

function parseNotes(value) {
  const result = {};
  for (const part of stringField(value).split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    const key = rawKey.trim();
    const noteValue = rawValue.join("=").trim();
    if (key) result[key] = noteValue;
  }
  return result;
}

function copyCandidate(candidate) {
  const output = {};
  for (const key of [
    "id",
    "canonical_id",
    "source_id",
    "signal",
    "title",
    "url",
    "canonical_url",
    "source",
    "event_date",
    "category",
    "status",
    "verification_status",
    "source_level",
    "editorial_category",
    "repo",
    "evidence",
    "notes"
  ]) {
    output[key] = stringField(candidate[key]);
  }
  output.tags = Array.isArray(candidate.tags) ? [...candidate.tags].filter((tag) => typeof tag === "string") : [];
  return output;
}

function daysBetween(leftDate, rightDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(leftDate) || !/^\d{4}-\d{2}-\d{2}$/.test(rightDate)) return null;
  const left = Date.parse(`${leftDate}T00:00:00.000Z`);
  const right = Date.parse(`${rightDate}T00:00:00.000Z`);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
  return Math.round((right - left) / 86400000);
}

function numberFromString(value) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function nonNegativeIntegerOrZero(value) {
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function uniqueSorted(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value))].sort();
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
    const history = await readHistory(rootDir, args.history);
    const output = buildQualityCandidates({ input, history, reportDate: args.date });

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
    process.stdout.write(`${JSON.stringify({
      ok: true,
      report_date: args.date,
      output_kind: output.kind,
      candidate_count: output.candidate_count,
      admitted_count: output.admitted_count,
      suppressed_count: output.suppressed_count,
      duplicate_count: output.duplicate_count,
      stale_count: output.stale_count,
      unchanged_repo_count: output.unchanged_repo_count
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
