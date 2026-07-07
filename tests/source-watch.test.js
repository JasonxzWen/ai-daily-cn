import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  collectSourceWatch,
  createSourceWatchFixtureFetch
} from "../src/discovery.js";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const fixtureDir = path.join(rootDir, "tests", "fixtures", "source-watch");
const fixtureWatchlistPath = path.join(fixtureDir, "source-watchlist.json");
const qualityHistoryPath = path.join(fixtureDir, "quality-history.json");
const sourceWatchQualityFixtureScript = path.join(rootDir, "scripts", "run-source-watch-quality-fixture.mjs");
const reportDate = "2026-07-06";
const qualityReportDate = "2026-07-08";
const generatedAt = "2026-07-06T08:00:00.000Z";

test("collectSourceWatch replays configured sites and GitHub repos from fixtures", async () => {
  const fetchImpl = await createSourceWatchFixtureFetch(fixtureDir);
  const collected = await collectSourceWatch({
    rootDir,
    reportDate,
    generatedAt,
    watchlistPath: fixtureWatchlistPath,
    fetchImpl,
    fetchRetries: 0
  });

  assert.equal(collected.kind, "source_watch_candidates");
  assert.equal(collected.report_date, reportDate);
  assert.equal(collected.targets.length, 4);
  assert.equal(collected.sources.length, 4);
  assert.equal(collected.candidates.length, 4);
  assert.equal(collected.source_audit.github_watch.watched_repos, 2);
  assert.equal(collected.source_audit.github_watch.fetched_repos, 2);
  assert.equal(collected.source_audit.site_watch.watched_sites, 2);
  assert.equal(collected.source_audit.site_watch.fetched_sites, 2);

  const repoTarget = collected.targets.find((target) => target.id === "repo-ml-news-of-the-week");
  assert.equal(repoTarget.status, "checked");
  assert.equal(repoTarget.repo_metadata.stars, 3210);
  assert.equal(repoTarget.repo_metadata.forks, 210);
  assert.equal(repoTarget.repo_metadata.pushed_at, "2026-07-05T12:00:00Z");
  assert.equal(repoTarget.releases[0].tag_name, "2026-W27");
  assert.equal(repoTarget.tags[0].name, "2026-W27");
  assert.equal(repoTarget.recent_commits[0].message, "Add July AI model notes");
  assert.equal(repoTarget.readme.status, "checked");
  assert.match(repoTarget.readme.excerpt, /machine learning updates/);

  const repoCandidate = collected.candidates.find((candidate) => candidate.source_id === "repo-ml-news-of-the-week");
  assert.equal(repoCandidate.category, "project");
  assert.equal(repoCandidate.signal, "github_watch");
  assert.equal(repoCandidate.source_level, "github");
  assert.equal(repoCandidate.verification_status, "primary_confirmed");
  assert.match(repoCandidate.notes, /stars=3210/);
  assert.equal(Object.hasOwn(repoCandidate, "readme_summary"), false);
  assert.doesNotMatch(JSON.stringify(repoCandidate), /machine learning updates/);

  const siteTarget = collected.targets.find((target) => target.id === "site-aify-news");
  assert.equal(siteTarget.status, "checked");
  assert.equal(siteTarget.source_lane, "aify");
  assert.equal(siteTarget.source_tier, "first_class");
  assert.equal(siteTarget.verification_policy, "no_secondary_review_required");
  assert.equal(siteTarget.site_metadata.title, "Aify News");
  assert.equal(siteTarget.feeds[0].url, "https://aify-news.pages.dev/feed.xml");
  assert.equal(siteTarget.discovered_github_repositories[0].repo, "example/aify-news");

  const siteSource = collected.sources.find((source) => source.id === "site-aify-news");
  assert.equal(siteSource.source_lane, "aify");
  assert.equal(siteSource.source_tier, "first_class");
  assert.equal(siteSource.verification_policy, "no_secondary_review_required");
  assert.equal(siteSource.verification_status, "first_class_source_confirmed");

  const siteAudit = collected.source_audit.site_watch.sources.find((source) => source.target_id === "site-aify-news");
  assert.equal(siteAudit.source_lane, "aify");
  assert.equal(siteAudit.source_tier, "first_class");
  assert.equal(siteAudit.verification_policy, "no_secondary_review_required");

  const siteCandidate = collected.candidates.find((candidate) => candidate.source_id === "site-aify-news");
  assert.equal(siteCandidate.category, "community_lead");
  assert.equal(siteCandidate.signal, "site_watch");
  assert.equal(siteCandidate.source_lane, "aify");
  assert.equal(siteCandidate.source_tier, "first_class");
  assert.equal(siteCandidate.verification_policy, "no_secondary_review_required");
  assert.equal(siteCandidate.source_level, "ai_news_aggregator");
  assert.equal(siteCandidate.verification_status, "first_class_source_confirmed");
  assert.match(siteCandidate.notes, /feeds=1/);
});

test("collectSourceWatch structures per-target failures without aborting the artifact", async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 503,
    headers: { get: () => null },
    async text() {
      return "service unavailable";
    },
    async json() {
      return { error: "service unavailable" };
    }
  });
  const collected = await collectSourceWatch({
    reportDate,
    generatedAt,
    targets: [
      { id: "repo-failed", type: "github_repo", repo: "example/failing-repo" },
      { id: "site-failed", type: "site", url: "https://example.com/news" }
    ],
    fetchImpl,
    fetchRetries: 0
  });

  assert.equal(collected.targets.length, 2);
  assert.equal(collected.candidates.length, 0);
  assert.equal(collected.targets[0].status, "blocked");
  assert.equal(collected.targets[1].status, "blocked");
  assert.equal(collected.source_audit.github_watch.sources[0].status, "blocked");
  assert.equal(collected.source_audit.site_watch.sources[0].status, "blocked");
  assert.match(collected.source_audit.github_watch.sources[0].notes, /HTTP 503/);
});

test("collectSourceWatch applies endpoint limit to GitHub URL and normalized arrays", async () => {
  const requestedUrls = [];
  const fetchImpl = async (url) => {
    requestedUrls.push(String(url));
    if (url === "https://api.github.com/repos/example/limited-repo") {
      return jsonResponse({
        full_name: "example/limited-repo",
        html_url: "https://github.com/example/limited-repo",
        description: "Limited repo fixture",
        stargazers_count: 10,
        forks_count: 2,
        pushed_at: "2026-07-06T00:00:00Z"
      });
    }
    if (url === "https://api.github.com/repos/example/limited-repo/releases?per_page=1") {
      return jsonResponse([
        { tag_name: "v2", html_url: "https://github.com/example/limited-repo/releases/tag/v2" },
        { tag_name: "v1", html_url: "https://github.com/example/limited-repo/releases/tag/v1" }
      ]);
    }
    if (url === "https://api.github.com/repos/example/limited-repo/tags?per_page=1") {
      return jsonResponse([
        { name: "v2", commit: { sha: "2222" } },
        { name: "v1", commit: { sha: "1111" } }
      ]);
    }
    if (url === "https://api.github.com/repos/example/limited-repo/commits?per_page=1") {
      return jsonResponse([
        { sha: "2222", commit: { message: "Second", author: { date: "2026-07-06T00:00:00Z" } } },
        { sha: "1111", commit: { message: "First", author: { date: "2026-07-05T00:00:00Z" } } }
      ]);
    }
    if (url === "https://api.github.com/repos/example/limited-repo/readme") {
      return jsonResponse({ path: "README.md", encoding: "base64", content: "" });
    }
    throw new Error(`unexpected url ${url}`);
  };

  const collected = await collectSourceWatch({
    reportDate,
    generatedAt,
    endpointLimit: 1,
    targets: [{ id: "repo-limited", type: "github_repo", repo: "example/limited-repo" }],
    fetchImpl,
    fetchRetries: 0
  });

  assert(requestedUrls.includes("https://api.github.com/repos/example/limited-repo/releases?per_page=1"));
  assert(requestedUrls.includes("https://api.github.com/repos/example/limited-repo/tags?per_page=1"));
  assert(requestedUrls.includes("https://api.github.com/repos/example/limited-repo/commits?per_page=1"));
  assert.equal(collected.targets[0].releases.length, 1);
  assert.equal(collected.targets[0].tags.length, 1);
  assert.equal(collected.targets[0].recent_commits.length, 1);
  assert.equal(collected.targets[0].releases[0].tag_name, "v2");
  assert.equal(collected.targets[0].tags[0].name, "v2");
  assert.equal(collected.targets[0].recent_commits[0].message, "Second");
});

test("discover:github-watch CLI writes the source watch artifact", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-source-watch-"));
  const outputPath = path.join(tmp, "source-candidates-2026-07-06.github-watch.json");

  const { stdout } = await execFileAsync(process.execPath, [
    path.join(rootDir, "src", "cli.js"),
    "discover:github-watch",
    "--date",
    reportDate,
    "--generated-at",
    generatedAt,
    "--config",
    fixtureWatchlistPath,
    "--fixture-dir",
    fixtureDir,
    "--output",
    outputPath
  ], { cwd: rootDir });

  const stdoutPayload = JSON.parse(stdout);
  const filePayload = JSON.parse(await fs.readFile(outputPath, "utf8"));
  assert.equal(stdoutPayload.ok, true);
  assert.equal(filePayload.output_path, path.resolve(outputPath));
  assert.equal(filePayload.candidates.length, 4);
  assert.equal(filePayload.source_audit.github_watch.fetched_repos, 2);
  assert.equal(filePayload.source_audit.site_watch.fetched_sites, 2);
  const aifyCandidate = filePayload.candidates.find((candidate) => candidate.source_id === "site-aify-news");
  assert.equal(aifyCandidate.source_lane, "aify");
  assert.equal(aifyCandidate.source_tier, "first_class");
  assert.equal(aifyCandidate.verification_policy, "no_secondary_review_required");
  assert.equal(aifyCandidate.verification_status, "first_class_source_confirmed");
});

test("source watch quality fixture dedupes stale unchanged repos and keeps internal summaries", async () => {
  const artifactDir = path.join(rootDir, ".tmp", "daily-codex-pipeline", "source-watch-quality-test", "artifacts");
  const inputPath = path.join(artifactDir, "source-watch-quality-test-canonical.json");
  const outputPath = path.join(artifactDir, "source-watch-quality-test-output.json");
  await fs.mkdir(artifactDir, { recursive: true });
  await fs.writeFile(inputPath, `${JSON.stringify({
    schema_version: 1,
    kind: "source_watch_canonical_candidates",
    mode: "source_watch_quality_test_input",
    report_date: qualityReportDate,
    input_kind: "source_watch_extracted_candidates",
    candidate_count: 4,
    signal_counts: { github_watch: 3, site_watch: 1 },
    candidates: [{
      id: "candidate-ml-news",
      canonical_id: "source-watch:ml-news",
      source_id: "repo-ml-news-of-the-week",
      signal: "github_watch",
      title: "SalvatoreRa/ML-news-of-the-week",
      url: "https://github.com/SalvatoreRa/ML-news-of-the-week",
      canonical_url: "https://github.com/SalvatoreRa/ML-news-of-the-week",
      source: "GitHub repo watch: SalvatoreRa/ML-news-of-the-week",
      event_date: "2026-07-05",
      category: "project",
      status: "pending",
      verification_status: "primary_confirmed",
      source_level: "github",
      editorial_category: "open_source",
      repo: "SalvatoreRa/ML-news-of-the-week",
      evidence: "GitHub repo SalvatoreRa/ML-news-of-the-week stars=3210 forks=210 pushed_at=2026-07-05T12:00:00Z",
      notes: "stars=3210; forks=210; pushed_at=2026-07-05T12:00:00Z; latest_release=2026-W27; latest_tag=2026-W27; latest_commit=bbbbbbbbbbbb",
      tags: ["ml-news", "weekly"]
    }, {
      id: "candidate-awesome",
      canonical_id: "source-watch:awesome-ai-news",
      source_id: "repo-awesome-ai-news",
      signal: "github_watch",
      title: "taielab/awesome-ai-news",
      url: "https://github.com/taielab/awesome-ai-news",
      canonical_url: "https://github.com/taielab/awesome-ai-news",
      source: "GitHub repo watch: taielab/awesome-ai-news",
      event_date: "2026-07-03",
      category: "project",
      status: "pending",
      verification_status: "primary_confirmed",
      source_level: "github",
      editorial_category: "open_source",
      repo: "taielab/awesome-ai-news",
      evidence: "GitHub repo taielab/awesome-ai-news stars=1888 forks=99 pushed_at=2026-07-03T09:00:00Z",
      notes: "stars=1888; forks=99; pushed_at=2026-07-03T09:00:00Z; latest_tag=v2026.07; latest_commit=dddddddddddd",
      tags: ["ai-news"]
    }, {
      id: "candidate-awesome-duplicate",
      canonical_id: "source-watch:awesome-ai-news-dupe",
      source_id: "repo-awesome-ai-news-duplicate",
      signal: "github_watch",
      title: "taielab/awesome-ai-news duplicate",
      url: "https://github.com/taielab/awesome-ai-news",
      canonical_url: "https://github.com/taielab/awesome-ai-news",
      source: "GitHub repo watch: taielab/awesome-ai-news",
      event_date: "2026-07-03",
      category: "project",
      status: "pending",
      verification_status: "primary_confirmed",
      source_level: "github",
      editorial_category: "open_source",
      repo: "taielab/awesome-ai-news",
      evidence: "GitHub repo taielab/awesome-ai-news stars=1888 forks=99 pushed_at=2026-07-03T09:00:00Z",
      notes: "stars=1888; forks=99; pushed_at=2026-07-03T09:00:00Z; latest_tag=v2026.07; latest_commit=dddddddddddd",
      tags: ["ai-news"]
    }, {
      id: "candidate-site",
      canonical_id: "source-watch:aify-news",
      source_id: "site-aify-news",
      signal: "site_watch",
      title: "Aify News",
      url: "https://aify-news.pages.dev/",
      canonical_url: "https://aify-news.pages.dev/",
      source: "Site watch: Aify News",
      event_date: qualityReportDate,
      category: "community_lead",
      status: "pending",
      verification_status: "secondary_confirmed",
      source_level: "ai_news_aggregator",
      source_lane: "aify",
      source_tier: "first_class",
      verification_policy: "no_secondary_review_required",
      editorial_category: "community",
      repo: "",
      evidence: "Site metadata title=Aify News",
      notes: "feeds=1; discovered_github_repositories=1",
      tags: ["ai-news"]
    }]
  }, null, 2)}\n`, "utf8");

  const { stdout, stderr } = await execFileAsync(process.execPath, [
    sourceWatchQualityFixtureScript,
    "--date",
    qualityReportDate,
    "--input",
    path.relative(rootDir, inputPath),
    "--output",
    path.relative(rootDir, outputPath),
    "--history",
    path.relative(rootDir, qualityHistoryPath),
    "--json"
  ], { cwd: rootDir });

  assert.equal(stderr, "");
  const stdoutPayload = JSON.parse(stdout);
  const output = JSON.parse(await fs.readFile(outputPath, "utf8"));
  assert.equal(stdoutPayload.ok, true);
  assert.equal(output.kind, "source_watch_quality_candidates");
  assert.equal(output.candidate_count, 4);
  assert.equal(output.admitted_count, 2);
  assert.equal(output.suppressed_count, 2);
  assert.equal(output.duplicate_count, 1);
  assert.equal(output.stale_count, 2);
  assert.equal(output.unchanged_repo_count, 2);
  assert.equal(output.quality_audit.public_surface, false);
  assert.deepEqual(output.quality_audit.suppressed_reasons, ["duplicate_current", "repo_unchanged", "seen_recently"]);

  const changedRepo = output.candidates.find((candidate) => candidate.id === "candidate-ml-news");
  const unchangedRepo = output.candidates.find((candidate) => candidate.id === "candidate-awesome");
  const duplicateRepo = output.candidates.find((candidate) => candidate.id === "candidate-awesome-duplicate");
  const siteCandidate = output.candidates.find((candidate) => candidate.id === "candidate-site");
  assert.equal(changedRepo.decision, "admitted");
  assert.equal(changedRepo.repo_delta.status, "changed");
  assert.equal(changedRepo.summary_template.purpose.includes("ML-news-of-the-week"), true);
  assert.match(changedRepo.summary_template.evidence, /latest_commit=bbbbbbbbbbbb/);
  assert.equal(unchangedRepo.decision, "suppressed");
  assert.deepEqual(unchangedRepo.suppression_reasons, ["repo_unchanged", "seen_recently"]);
  assert.equal(duplicateRepo.decision, "suppressed");
  assert.equal(duplicateRepo.duplicate_of, "candidate-awesome");
  assert.deepEqual(duplicateRepo.suppression_reasons, ["duplicate_current", "repo_unchanged", "seen_recently"]);
  assert.equal(siteCandidate.decision, "admitted");
  assert.equal(siteCandidate.summary_template, null);
  assert.equal(siteCandidate.source_lane, "aify");
  assert.equal(siteCandidate.source_tier, "first_class");
  assert.equal(siteCandidate.verification_policy, "no_secondary_review_required");
  assert.equal(JSON.stringify(output).includes("machine learning updates"), false);

  await fs.rm(inputPath, { force: true });
  await fs.rm(outputPath, { force: true });
});

test("source watch quality fixture reports structured failure for invalid canonical input", async () => {
  const artifactDir = path.join(rootDir, ".tmp", "daily-codex-pipeline", "source-watch-quality-test", "artifacts");
  const inputPath = path.join(artifactDir, "source-watch-quality-bad-input.json");
  const outputPath = path.join(artifactDir, "source-watch-quality-bad-output.json");
  await fs.mkdir(artifactDir, { recursive: true });
  await fs.writeFile(inputPath, `${JSON.stringify({ kind: "wrong_kind", candidates: [] }, null, 2)}\n`, "utf8");

  await assert.rejects(
    execFileAsync(process.execPath, [
      sourceWatchQualityFixtureScript,
      "--date",
      qualityReportDate,
      "--input",
      path.relative(rootDir, inputPath),
      "--output",
      path.relative(rootDir, outputPath),
      "--history",
      path.relative(rootDir, qualityHistoryPath),
      "--json"
    ], { cwd: rootDir }),
    (error) => {
      assert.equal(error.code, 1);
      assert.equal(error.stderr, "");
      const payload = JSON.parse(error.stdout);
      assert.equal(payload.ok, false);
      assert.match(payload.failures.join("\n"), /input.kind must be source_watch_canonical_candidates/);
      return true;
    }
  );

  await fs.rm(inputPath, { force: true });
  await fs.rm(outputPath, { force: true });
});

test("source watch quality fixture rejects history files outside approved roots", async () => {
  const artifactDir = path.join(rootDir, ".tmp", "daily-codex-pipeline", "source-watch-quality-test", "artifacts");
  const inputPath = path.join(artifactDir, "source-watch-quality-history-boundary-input.json");
  const outputPath = path.join(artifactDir, "source-watch-quality-history-boundary-output.json");
  await fs.mkdir(artifactDir, { recursive: true });
  await fs.writeFile(inputPath, `${JSON.stringify({ kind: "wrong_kind", candidates: [] }, null, 2)}\n`, "utf8");

  await assert.rejects(
    execFileAsync(process.execPath, [
      sourceWatchQualityFixtureScript,
      "--date",
      qualityReportDate,
      "--input",
      path.relative(rootDir, inputPath),
      "--output",
      path.relative(rootDir, outputPath),
      "--history",
      "package.json",
      "--json"
    ], { cwd: rootDir }),
    (error) => {
      assert.equal(error.code, 1);
      assert.equal(error.stderr, "");
      const payload = JSON.parse(error.stdout);
      assert.equal(payload.ok, false);
      assert.match(payload.failures.join("\n"), /history must stay under tests\/fixtures\/source-watch or \.tmp\/daily-codex-pipeline/);
      return true;
    }
  );

  await fs.rm(inputPath, { force: true });
  await fs.rm(outputPath, { force: true });
});

function jsonResponse(value, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    async text() {
      return JSON.stringify(value);
    },
    async json() {
      return value;
    }
  };
}
