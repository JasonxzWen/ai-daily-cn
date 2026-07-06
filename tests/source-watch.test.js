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
const reportDate = "2026-07-06";
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
  assert.equal(siteTarget.site_metadata.title, "Aify News");
  assert.equal(siteTarget.feeds[0].url, "https://aify-news.pages.dev/feed.xml");
  assert.equal(siteTarget.discovered_github_repositories[0].repo, "example/aify-news");

  const siteCandidate = collected.candidates.find((candidate) => candidate.source_id === "site-aify-news");
  assert.equal(siteCandidate.category, "community_lead");
  assert.equal(siteCandidate.signal, "site_watch");
  assert.equal(siteCandidate.source_level, "ai_news_aggregator");
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
