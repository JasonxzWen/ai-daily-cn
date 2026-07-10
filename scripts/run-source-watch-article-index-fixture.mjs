#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { validateArticles } from "../src/schema.js";
import { buildArticleIndex } from "../src/site.js";

const INTERNAL_FIELD_RE = /"(?:candidate_id|canonical_id|source_id|source_lane|source_tier|verification_policy|verification_status|repo_delta|freshness|summary_template|admission|rationale|notes|raw)"\s*:/;
const RAW_EVIDENCE_RE = /\b(?:latest_commit|pushed_at|stars|forks)=/;

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
    throw new Error("source watch article index fixture requires --date YYYY-MM-DD");
  }
  if (!args.input) throw new Error("source watch article index fixture requires --input");
  if (!args.output) throw new Error("source watch article index fixture requires --output");
  if (!args.json) throw new Error("source watch article index fixture requires --json");
  return args;
}

function readValue(argv, index, flag) {
  const value = argv[index] || "";
  if (!value || value.startsWith("--")) {
    throw new Error(`source watch article index fixture requires ${flag} value`);
  }
  return value;
}

function resolvePipelineArtifactPath(rootDir, value, label) {
  if (!String(value).endsWith(".json")) {
    throw new Error(`source watch article index fixture ${label} must end with .json`);
  }
  const allowedRoot = path.resolve(rootDir, ".tmp", "daily-codex-pipeline");
  const resolved = path.resolve(rootDir, value);
  const relative = path.relative(allowedRoot, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`source watch article index fixture ${label} must stay under .tmp/daily-codex-pipeline`);
  }
  return resolved;
}

function buildArticleIndexArtifact({ input, reportDate }) {
  if (!isPlainObject(input) || input.kind !== "source_watch_admitted_candidates") {
    throw new Error("source watch article index fixture input.kind must be source_watch_admitted_candidates");
  }
  if (!Array.isArray(input.candidates)) {
    throw new Error("source watch article index fixture input.candidates must be an array");
  }
  if (input.public_surface === true || input.admission_audit?.public_surface === true) {
    throw new Error("source watch article index fixture input public_surface must not be true");
  }
  if (input.report_date !== reportDate) {
    throw new Error("source watch article index fixture input.report_date must match --date");
  }

  const candidatePool = {
    schema_version: 1,
    report_date: reportDate,
    generated_at: `${reportDate}T00:00:00.000Z`,
    sources: [],
    candidates: input.candidates.map((candidate) => ({
      ...candidate,
      status: "included",
      included_in: "source_watch"
    }))
  };
  const articles = buildArticleIndex([], {
    updatedAt: `${reportDate}T00:00:00.000Z`,
    sourceWatchCandidatePools: [candidatePool]
  });
  const validation = validateArticles(articles);
  if (!validation.valid) {
    throw new Error(`source watch article index fixture articles schema validation failed: ${JSON.stringify(validation.errors)}`);
  }
  const serialized = JSON.stringify(validation.value);
  if (INTERNAL_FIELD_RE.test(serialized)) {
    throw new Error("source watch article index fixture public articles leaked internal Source Watch fields");
  }
  if (RAW_EVIDENCE_RE.test(serialized)) {
    throw new Error("source watch article index fixture public articles leaked raw Source Watch evidence fields");
  }

  return validation.value;
}

function sourceWatchCounts(articles) {
  return articles.reduce((counts, article) => {
    if (article.section === "source_watch") {
      counts.source_watch_articles += 1;
    }
    if (isGithubUrl(article.url)) {
      counts.github_watch_articles += 1;
    } else {
      counts.site_watch_articles += 1;
    }
    return counts;
  }, {
    source_watch_articles: 0,
    github_watch_articles: 0,
    site_watch_articles: 0
  });
}

function isGithubUrl(value) {
  try {
    const hostname = new URL(String(value)).hostname.toLowerCase();
    return hostname === "github.com" || hostname.endsWith(".github.com");
  } catch {
    return false;
  }
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
    const articles = buildArticleIndexArtifact({ input, reportDate: args.date });
    const counts = sourceWatchCounts(articles);

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, `${JSON.stringify(articles, null, 2)}\n`, "utf8");
    process.stdout.write(`${JSON.stringify({
      ok: true,
      report_date: args.date,
      output_kind: "articles",
      article_count: articles.length,
      source_watch_articles: counts.source_watch_articles,
      github_watch_articles: counts.github_watch_articles,
      site_watch_articles: counts.site_watch_articles
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
