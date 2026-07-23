import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import Ajv from "ajv/dist/2020.js";
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
  assert.equal(collected.candidates.length, 9);
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
  assert.deepEqual(
    Object.keys(repoCandidate.source_watch).sort(),
    [
      "event_url",
      "repo_snapshot",
      "signal",
      "snapshot_fingerprint",
      "source_lane",
      "source_tier",
      "target_id",
      "verification_policy"
    ]
  );
  assert.equal(repoCandidate.source_watch.signal, "github_watch");
  assert.equal(repoCandidate.source_watch.target_id, "repo-ml-news-of-the-week");
  assert.equal(repoCandidate.source_watch.source_lane, "github_watch");
  assert.equal(repoCandidate.source_watch.source_tier, "watchlist");
  assert.equal(repoCandidate.source_watch.verification_policy, "primary_source_required");
  assert.equal(
    repoCandidate.source_watch.event_url,
    "https://github.com/SalvatoreRa/ML-news-of-the-week/commit/bbbbbbbb"
  );
  assert.equal(repoCandidate.event_date, "2026-07-05");
  assert.match(repoCandidate.source_watch.snapshot_fingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.equal(repoCandidate.source_watch.repo_snapshot.repo, "SalvatoreRa/ML-news-of-the-week");
  assert.equal(repoCandidate.source_watch.repo_snapshot.latest_release.tag_name, "2026-W27");
  assert.equal(repoCandidate.source_watch.repo_snapshot.latest_commit.sha, "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
  assert.equal(repoCandidate.source_watch.repo_snapshot.readme_status, "checked");
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
  assert.equal(siteSource.verification_status, "intermediary_only");

  const siteAudit = collected.source_audit.site_watch.sources.find((source) => source.target_id === "site-aify-news");
  const repoAudit = collected.source_audit.github_watch.sources.find((source) => source.target_id === "repo-ml-news-of-the-week");
  assert.equal(repoAudit.id, "repo-ml-news-of-the-week");
  assert.equal(repoAudit.parsed_count, 4);
  assert.equal(siteAudit.id, "site-aify-news");
  assert.equal(siteAudit.parsed_count, 1);
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
  assert.equal(siteCandidate.verification_status, "intermediary_only");
  assert.match(siteCandidate.notes, /feeds=1/);
  assert.equal(siteCandidate.source_watch.signal, "site_watch");
  assert.equal(siteCandidate.source_watch.target_id, "site-aify-news");
  assert.equal(siteCandidate.source_watch.source_lane, "aify");
  assert.equal(siteCandidate.source_watch.source_tier, "first_class");
  assert.equal(siteCandidate.source_watch.verification_policy, "no_secondary_review_required");
  assert.equal(siteCandidate.source_watch.event_url, "https://aify-news.pages.dev/");
  assert.match(siteCandidate.source_watch.snapshot_fingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.equal(siteCandidate.source_watch.site_snapshot.title, "Aify News");
  assert.match(siteCandidate.source_watch.site_snapshot.content_fingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.equal(siteCandidate.source_watch.site_snapshot.feeds[0].url, "https://aify-news.pages.dev/feed.xml");
  assert.equal(
    siteCandidate.source_watch.site_snapshot.discovered_github_repositories[0].repo,
    "example/aify-news"
  );
  assert.doesNotMatch(JSON.stringify(collected), /first_class_source_confirmed/);

  const repeated = await collectSourceWatch({
    rootDir,
    reportDate,
    generatedAt: "2026-07-06T09:00:00.000Z",
    watchlistPath: fixtureWatchlistPath,
    fetchImpl: await createSourceWatchFixtureFetch(fixtureDir),
    fetchRetries: 0
  });
  const repeatedRepo = repeated.candidates.find((candidate) => candidate.source_id === "repo-ml-news-of-the-week");
  const repeatedSite = repeated.candidates.find((candidate) => candidate.source_id === "site-aify-news");
  assert.equal(repeatedRepo.source_watch.snapshot_fingerprint, repoCandidate.source_watch.snapshot_fingerprint);
  assert.equal(repeatedSite.source_watch.snapshot_fingerprint, siteCandidate.source_watch.snapshot_fingerprint);
  assert.equal(
    repeatedSite.source_watch.site_snapshot.content_fingerprint,
    siteCandidate.source_watch.site_snapshot.content_fingerprint
  );

  const aifyTarget = {
    id: "site-aify-news",
    type: "site",
    name: "Aify News",
    url: "https://aify-news.pages.dev/",
    source_lane: "aify",
    source_tier: "first_class",
    verification_policy: "no_secondary_review_required"
  };
  const nonVisibleFixtureFetch = await createSourceWatchFixtureFetch(fixtureDir);
  const nonVisibleChange = await collectSourceWatch({
    reportDate,
    generatedAt: "2026-07-06T09:30:00.000Z",
    targets: [aifyTarget],
    fetchImpl: async (url, init) => {
      const response = await nonVisibleFixtureFetch(url, init);
      const html = await response.text();
      return textResponse(html.replace(
        "</body>",
        "<!-- ignored comment --><style>.ignored{display:none}</style><script>window.ignored=true</script></body>"
      ));
    },
    fetchRetries: 0
  });
  const nonVisibleSite = nonVisibleChange.candidates[0];
  assert.equal(
    nonVisibleSite.source_watch.site_snapshot.content_fingerprint,
    siteCandidate.source_watch.site_snapshot.content_fingerprint
  );
  assert.equal(nonVisibleSite.source_watch.snapshot_fingerprint, siteCandidate.source_watch.snapshot_fingerprint);

  const visibleFixtureFetch = await createSourceWatchFixtureFetch(fixtureDir);
  const visibleChange = await collectSourceWatch({
    reportDate,
    generatedAt: "2026-07-06T09:45:00.000Z",
    targets: [aifyTarget],
    fetchImpl: async (url, init) => {
      const response = await visibleFixtureFetch(url, init);
      const html = await response.text();
      return textResponse(html.replace(">GitHub<", ">GitHub SOURCE_WATCH_VISIBLE_CHANGE_SENTINEL<"));
    },
    fetchRetries: 0
  });
  const visibleSite = visibleChange.candidates[0];
  assert.notEqual(
    visibleSite.source_watch.site_snapshot.content_fingerprint,
    siteCandidate.source_watch.site_snapshot.content_fingerprint
  );
  assert.notEqual(visibleSite.source_watch.snapshot_fingerprint, siteCandidate.source_watch.snapshot_fingerprint);
  assert.doesNotMatch(JSON.stringify(visibleSite), /SOURCE_WATCH_VISIBLE_CHANGE_SENTINEL/);

  const changedMetricsFixtureFetch = await createSourceWatchFixtureFetch(fixtureDir);
  const metricsOnlyChange = await collectSourceWatch({
    rootDir,
    reportDate,
    generatedAt: "2026-07-06T10:00:00.000Z",
    watchlistPath: fixtureWatchlistPath,
    fetchImpl: async (url, init) => {
      if (String(url) === "https://api.github.com/repos/SalvatoreRa/ML-news-of-the-week") {
        const response = await changedMetricsFixtureFetch(url, init);
        const payload = await response.json();
        return jsonResponse({ ...payload, stargazers_count: 9999, forks_count: 999 });
      }
      return changedMetricsFixtureFetch(url, init);
    },
    fetchRetries: 0
  });
  const metricsOnlyRepo = metricsOnlyChange.candidates.find(
    (candidate) => candidate.source_id === "repo-ml-news-of-the-week"
  );
  assert.equal(metricsOnlyRepo.source_watch.repo_snapshot.stars, 9999);
  assert.equal(metricsOnlyRepo.source_watch.repo_snapshot.forks, 999);
  assert.equal(metricsOnlyRepo.source_watch.snapshot_fingerprint, repoCandidate.source_watch.snapshot_fingerprint);
});

test("collectSourceWatch retains a degraded repository snapshot when a material GitHub endpoint is incomplete", async () => {
  const fixtureFetch = await createSourceWatchFixtureFetch(fixtureDir);
  const partialFetch = async (url, init) => {
    if (String(url).includes("/SalvatoreRa/ML-news-of-the-week/commits?")) {
      return new Response(JSON.stringify({ message: "temporary commit endpoint outage" }), {
        status: 503,
        headers: { "content-type": "application/json" }
      });
    }
    return fixtureFetch(url, init);
  };

  const collected = await collectSourceWatch({
    rootDir,
    reportDate,
    generatedAt,
    watchlistPath: fixtureWatchlistPath,
    fetchImpl: partialFetch,
    fetchRetries: 0
  });

  const target = collected.targets.find((item) => item.id === "repo-ml-news-of-the-week");
  assert.equal(target.status, "blocked");
  assert.equal(target.endpoint_status.repo.status, "checked");
  assert.equal(target.endpoint_status.releases.status, "checked");
  assert.equal(target.endpoint_status.tags.status, "checked");
  assert.equal(target.endpoint_status.commits.status, "blocked");
  const candidate = collected.candidates.find((item) => item.source_id === "repo-ml-news-of-the-week");
  assert(candidate, "an incomplete endpoint must annotate rather than suppress the repository observation");
  assert.equal(candidate.verification_status, "unverified");
  assert.equal(candidate.source_watch.repo_snapshot.latest_commit, null);
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
  assert.equal(collected.source_audit.github_watch.sources[0].id, "repo-failed");
  assert.equal(collected.source_audit.github_watch.sources[0].parsed_count, 0);
  assert.equal(collected.source_audit.site_watch.sources[0].id, "site-failed");
  assert.equal(collected.source_audit.site_watch.sources[0].parsed_count, 0);
  assert.match(collected.source_audit.github_watch.sources[0].notes, /HTTP 503/);
});

test("candidate pool schema accepts the namespaced Source Watch contract", async () => {
  const sourceWatch = {
    signal: "github_watch",
    target_id: "repo-source-watch",
    source_lane: "github_watch",
    source_tier: "watchlist",
    verification_policy: "primary_source_required",
    event_url: "https://github.com/example/source-watch/releases/tag/v1",
    snapshot_fingerprint: `sha256:${"a".repeat(64)}`,
    repo_snapshot: {
      repo: "example/source-watch",
      stars: 42,
      forks: 3,
      open_issues: 1,
      pushed_at: "2026-07-06T07:00:00Z",
      updated_at: "2026-07-06T07:05:00Z",
      default_branch: "main",
      language: "JavaScript",
      license: "MIT",
      latest_release: {
        tag_name: "v1",
        name: "v1",
        html_url: "https://github.com/example/source-watch/releases/tag/v1",
        published_at: "2026-07-06T06:00:00Z",
        prerelease: false
      },
      latest_tag: { name: "v1", commit_sha: "a".repeat(40) },
      latest_commit: {
        sha: "b".repeat(40),
        html_url: "https://github.com/example/source-watch/commit/bbbbbbbb",
        message: "Release v1",
        author_date: "2026-07-06T05:00:00Z",
        author_name: "Example"
      },
      readme_status: "checked"
    }
  };
  const candidatePool = {
    schema_version: 1,
    report_date: reportDate,
    generated_at: generatedAt,
    sources: [{
      id: "repo-source-watch",
      name: "Source Watch",
      url: "https://github.com/example/source-watch",
      category: "repository",
      status: "checked"
    }],
    candidates: [{
      id: "repo-source-watch-v1",
      source_id: "repo-source-watch",
      category: "project",
      title: "Source Watch v1",
      url: "https://github.com/example/source-watch/releases/tag/v1",
      source: "Source Watch",
      event_date: reportDate,
      status: "included",
      included_in: "source_watch",
      source_watch: sourceWatch
    }]
  };

  const schema = JSON.parse(await fs.readFile(path.join(rootDir, "schemas", "candidates.schema.json"), "utf8"));
  const ajv = new Ajv({ allErrors: true, strict: true });
  ajv.addFormat("date", /^\d{4}-\d{2}-\d{2}$/);
  ajv.addFormat("date-time", { type: "string", validate: (value) => Number.isFinite(Date.parse(value)) });
  ajv.addFormat("uri", {
    type: "string",
    validate(value) {
      try {
        return ["http:", "https:"].includes(new URL(value).protocol);
      } catch {
        return false;
      }
    }
  });
  const validateCandidatePool = ajv.compile(schema);
  assert.equal(validateCandidatePool(structuredClone(candidatePool)), true, JSON.stringify(validateCandidatePool.errors));

  const rejected = validateCandidatePool({
    ...candidatePool,
    candidates: [{
      ...candidatePool.candidates[0],
      source_watch: { ...sourceWatch, snapshot_fingerprint: "unstable-fingerprint" }
    }]
  });
  assert.equal(rejected, false);

  const missingMetadata = structuredClone(candidatePool);
  delete missingMetadata.candidates[0].source_watch;
  assert.equal(validateCandidatePool(missingMetadata), false);
});

test("collectSourceWatch uses endpoint limit only as the GitHub transport page size", async () => {
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
  assert.equal(collected.targets[0].releases.length, 2);
  assert.equal(collected.targets[0].tags.length, 2);
  assert.equal(collected.targets[0].recent_commits.length, 2);
  assert.equal(collected.targets[0].releases[0].tag_name, "v2");
  assert.equal(collected.targets[0].tags[0].name, "v2");
  assert.equal(collected.targets[0].recent_commits[0].message, "Second");
});

test("discover:github-watch CLI writes the source watch artifact", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-source-watch-"));
  const outputPath = path.join(tmp, "source-candidates-2026-07-06.github-watch.json");
  const transportStatePath = path.join(tmp, ".tmp", "search-pagination-state.json");
  const ambientTransportState = `${JSON.stringify({
    schema_version: 1,
    lanes: {
      "source-watch:github:repo-ml-news-of-the-week:commits": {
        provider: "github_source_watch",
        state: {
          nextUrl: "https://api.github.com/repositories/711834199/commits?page=20&per_page=5"
        },
        updated_at: generatedAt
      }
    }
  }, null, 2)}\n`;
  await fs.mkdir(path.dirname(transportStatePath), { recursive: true });
  await fs.writeFile(transportStatePath, ambientTransportState);

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
    "--repo-root",
    tmp,
    "--output",
    outputPath
  ], { cwd: rootDir });

  const stdoutPayload = JSON.parse(stdout);
  const filePayload = JSON.parse(await fs.readFile(outputPath, "utf8"));
  assert.equal(stdoutPayload.ok, true);
  assert.equal(stdoutPayload.kind, "source_watch_artifact_receipt");
  assert.equal(stdoutPayload.report_date, reportDate);
  assert.equal(stdoutPayload.output_path, path.resolve(outputPath));
  assert.match(stdoutPayload.artifact_sha256, /^[a-f0-9]{64}$/);
  assert.equal(stdoutPayload.candidate_count, 9);
  assert.equal(filePayload.output_path, path.resolve(outputPath));
  assert.equal(filePayload.candidates.length, 9);
  assert.equal(filePayload.source_audit.github_watch.fetched_repos, 2);
  assert.equal(filePayload.source_audit.site_watch.fetched_sites, 2);
  assert.equal(await fs.readFile(transportStatePath, "utf8"), ambientTransportState);
  const aifyCandidate = filePayload.candidates.find((candidate) => candidate.source_id === "site-aify-news");
  assert.equal(aifyCandidate.source_lane, "aify");
  assert.equal(aifyCandidate.source_tier, "first_class");
  assert.equal(aifyCandidate.verification_policy, "no_secondary_review_required");
  assert.equal(aifyCandidate.verification_status, "intermediary_only");
  assert.equal(aifyCandidate.source_watch.source_lane, "aify");
  assert.equal(aifyCandidate.source_watch.source_tier, "first_class");
  assert.equal(aifyCandidate.source_watch.verification_policy, "no_secondary_review_required");
  assert.match(aifyCandidate.source_watch.snapshot_fingerprint, /^sha256:[a-f0-9]{64}$/);

  const explicitTransportStatePath = path.join(tmp, "explicit-pagination-state.json");
  const explicitOutputPath = path.join(tmp, "source-candidates-2026-07-06.explicit-state.json");
  await execFileAsync(process.execPath, [
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
    "--repo-root",
    tmp,
    "--transport-state",
    explicitTransportStatePath,
    "--output",
    explicitOutputPath
  ], { cwd: rootDir });
  const explicitTransportState = JSON.parse(await fs.readFile(explicitTransportStatePath, "utf8"));
  assert.equal(explicitTransportState.schema_version, 1);
  assert.equal(explicitTransportState.updated_at, generatedAt);
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

function textResponse(value, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    async text() {
      return value;
    }
  };
}
