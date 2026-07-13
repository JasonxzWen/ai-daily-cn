import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildDailyWorkflowStages, runDailyWorkflow } from "../src/daily-runner.js";
import { generateReportDraft } from "../src/draft.js";
import { validateCandidatePool } from "../src/schema.js";

const REPORT_DATE = "2026-07-10";

test("daily runner collects Source Watch and sends the artifact to report:draft", () => {
  const stages = buildDailyWorkflowStages({ reportDate: REPORT_DATE, publish: false });
  const sourceWatchStage = stages.find((stage) => stage.id === "discover_source_watch");
  const draftStage = stages.find((stage) => stage.id === "report_draft");

  assert(sourceWatchStage, "production runner must include a Source Watch producer stage");
  assert.deepEqual(sourceWatchStage.command.args, [
    "src/cli.js",
    "discover:github-watch",
    "--date",
    REPORT_DATE,
    "--config",
    "config/source-watchlist.json",
    "--output",
    `.tmp/source-watch-${REPORT_DATE}.json`
  ]);

  const inputIndex = draftStage.command.args.indexOf("--input");
  assert(inputIndex >= 0);
  assert(
    draftStage.command.args[inputIndex + 1].split(",").includes(`.tmp/source-watch-${REPORT_DATE}.json`),
    "report:draft must consume the exact Source Watch producer artifact"
  );
});

test("daily runner records both Source Watch lanes when collection exhausts retries", async (t) => {
  const launcherRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-source-watch-degraded-"));
  t.after(() => fs.rm(launcherRoot, { recursive: true, force: true }));
  const cleanRoot = path.join(launcherRoot, ".tmp", "publish-worktrees", "main");
  const calls = [];

  const result = await runDailyWorkflow({
    launcherRoot,
    reportDate: REPORT_DATE,
    publish: false,
    retryDelayMs: 0,
    prepareCleanWorktree: async () => ({
      ok: true,
      next_cwd: cleanRoot,
      remote_main_sha: "1111111111111111111111111111111111111111"
    }),
    runStage: async (stage) => {
      calls.push(stage.id);
      if (stage.id === "discover_source_watch") {
        const error = new Error("network_error: Source Watch collection failed");
        error.code = "network_error";
        throw error;
      }
      return { ok: true, output: { stage: stage.id } };
    }
  });

  assert.equal(result.summary.final_status, "generated_degraded");
  assert.equal(calls.filter((id) => id === "discover_source_watch").length, 3);
  assert(calls.includes("report_draft"));
  const recorded = result.summary.stages.find((stage) => stage.id === "discover_source_watch");
  assert.equal(recorded.status, "degraded");
  assert.equal(recorded.output.fallback_used, true);
  assert.equal(recorded.output.fallback_kind, "persistent_candidate_history_only");
  const fallbackPath = path.join(cleanRoot, ".tmp", `source-watch-${REPORT_DATE}.json`);
  const payload = JSON.parse(await fs.readFile(fallbackPath, "utf8"));
  assert.deepEqual(payload.candidates, []);
  assert.equal(payload.source_audit.github_watch.sources[0].status, "blocked");
  assert.equal(payload.source_audit.site_watch.sources[0].status, "blocked");
});

test("report:draft preserves Source Watch audit and routes a first snapshot only to source_watch", async (t) => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-source-watch-first-"));
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));
  const candidate = sourceWatchCandidate({
    id: "repo-first-snapshot",
    fingerprint: fingerprint("a"),
    eventUrl: "https://github.com/acme/agent/releases/tag/v1.0.0"
  });
  const siteCandidate = siteSourceWatchCandidate();
  await writeDiscovery(rootDir, sourceWatchDiscovery([candidate, siteCandidate]));

  const drafted = await runDraft(rootDir);
  const stored = drafted.candidatePool.candidates.find((item) => item.id === candidate.id);

  assert(stored);
  assert.deepEqual(stored.source_watch, candidate.source_watch, "namespaced producer metadata must survive normalization");
  assert.equal(stored.status, "included");
  assert.equal(stored.included_in, "source_watch");
  const storedSite = drafted.candidatePool.candidates.find((item) => item.id === siteCandidate.id);
  assert.deepEqual(storedSite.source_watch, siteCandidate.source_watch);
  assert.equal(storedSite.included_in, "source_watch");
  for (const storedCandidate of [stored, storedSite]) {
    assert(
      drafted.candidatePool.sources.some((source) => source.id === storedCandidate.source_id),
      `normalization must synthesize Source Watch source ${storedCandidate.source_id}`
    );
  }
  assert.equal(drafted.report.source_audit.github_watch.included, 1);
  assert.equal(drafted.report.source_audit.site_watch.included, 1);
  assert.equal(drafted.report.source_audit.github_watch.sources[0].id, "acme-agent");
  assert.equal(drafted.report.source_audit.github_watch.sources[0].parsed_count, 1);
  assert.equal(drafted.report.source_audit.site_watch.sources[0].id, "example-ai");
  assert.equal(drafted.report.source_audit.site_watch.sources[0].parsed_count, 1);
  assertCandidateAbsentFromOrdinarySections(drafted.report, candidate.id);
  assertCandidateAbsentFromOrdinarySections(drafted.report, siteCandidate.id);
  assert.equal(validateCandidatePool(drafted.candidatePool).valid, true);
});

test("report:draft suppresses persisted and same-run Source Watch snapshots but includes a material change", async (t) => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-source-watch-history-"));
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));
  const oldFingerprint = fingerprint("b");
  const changedFingerprint = fingerprint("c");
  const priorCandidate = sourceWatchCandidate({
    id: "repo-prior",
    fingerprint: oldFingerprint,
    eventUrl: "https://github.com/acme/agent/commit/1111111"
  });
  priorCandidate.status = "included";
  priorCandidate.included_in = "source_watch";
  const olderMatchingCandidate = sourceWatchCandidate({
    id: "repo-older-matching-change",
    fingerprint: changedFingerprint,
    eventUrl: "https://github.com/acme/agent/commit/2222222"
  });
  olderMatchingCandidate.status = "included";
  olderMatchingCandidate.included_in = "source_watch";
  await writePersistedCandidatePool(rootDir, "2026-07-08", [olderMatchingCandidate], "custom-reports-data");
  await writePersistedCandidatePool(rootDir, "2026-07-09", [priorCandidate], "custom-reports-data");

  const unchanged = sourceWatchCandidate({
    id: "repo-unchanged",
    fingerprint: oldFingerprint,
    eventUrl: "https://github.com/acme/agent/commit/1111111"
  });
  const changed = sourceWatchCandidate({
    id: "repo-changed",
    fingerprint: changedFingerprint,
    eventUrl: "https://github.com/acme/agent/commit/2222222"
  });
  const currentDuplicate = sourceWatchCandidate({
    id: "repo-current-duplicate",
    fingerprint: changedFingerprint,
    eventUrl: "https://github.com/acme/agent/commit/2222222"
  });
  await writeDiscovery(rootDir, sourceWatchDiscovery([unchanged, changed, currentDuplicate]));

  const drafted = await runDraft(rootDir, { sourceStatusOutputDir: "custom-reports-data" });
  const byId = new Map(drafted.candidatePool.candidates.map((candidate) => [candidate.id, candidate]));
  const included = drafted.candidatePool.candidates.filter((candidate) => candidate.included_in === "source_watch");

  assert.deepEqual(included.map((candidate) => candidate.id), ["repo-changed"]);
  assert.equal(byId.get("repo-unchanged").status, "excluded");
  assert.equal(byId.get("repo-unchanged").exclusion_reason, "source_watch_unchanged_snapshot");
  assert.equal(byId.get("repo-current-duplicate").status, "excluded");
  assert.equal(byId.get("repo-current-duplicate").exclusion_reason, "source_watch_duplicate_snapshot");
  assert.equal(drafted.report.source_audit.github_watch.included, 1);
  assert.equal(validateCandidatePool(drafted.candidatePool).valid, true);
  for (const candidate of [unchanged, changed, currentDuplicate]) {
    assertCandidateAbsentFromOrdinarySections(drafted.report, candidate.id);
  }
});

async function runDraft(rootDir, options = {}) {
  return generateReportDraft({
    rootDir,
    reportDate: REPORT_DATE,
    generatedAt: `${REPORT_DATE}T08:00:00.000Z`,
    inputPaths: ["source-watch.json"],
    outputPath: ".tmp/draft.json",
    candidateOutputPath: ".tmp/candidates.json",
    cacheEvidence: false,
    ...options
  });
}

async function writeDiscovery(rootDir, payload) {
  await fs.writeFile(
    path.join(rootDir, "source-watch.json"),
    `${JSON.stringify(payload, null, 2)}\n`,
    "utf8"
  );
}

async function writePersistedCandidatePool(rootDir, reportDate, candidates, reportsDataDir = "reports-data") {
  const [year, month] = reportDate.split("-");
  const target = path.join(
    rootDir,
    reportsDataDir,
    "internal",
    "candidates",
    year,
    month,
    `${reportDate}.candidates.json`
  );
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify({
    schema_version: 1,
    report_date: reportDate,
    generated_at: `${reportDate}T08:00:00.000Z`,
    sources: [],
    candidates
  }, null, 2)}\n`, "utf8");
}

function sourceWatchDiscovery(candidates) {
  const githubCandidates = candidates.filter((candidate) => candidate.source_watch.signal === "github_watch");
  const siteCandidates = candidates.filter((candidate) => candidate.source_watch.signal === "site_watch");
  return {
    schema_version: 1,
    kind: "source_watch_candidates",
    report_date: REPORT_DATE,
    generated_at: `${REPORT_DATE}T08:00:00.000Z`,
    sources: [],
    source_audit: {
      github_watch: auditGroup("acme-agent", "GitHub Watch", "https://github.com/acme/agent", githubCandidates.length),
      site_watch: auditGroup("example-ai", "Site Watch", "https://example.com/ai", siteCandidates.length)
    },
    candidates
  };
}

function auditGroup(id, name, url, candidatesFound) {
  return {
    checked: true,
    sources: [{ id, target_id: id, name, url, status: "checked", parsed_count: candidatesFound > 0 ? 1 : 0, notes: "source watch fixture" }],
    candidates_found: candidatesFound,
    included: 0,
    notes: `${candidatesFound} Source Watch candidates collected.`
  };
}

function sourceWatchCandidate({ id, fingerprint, eventUrl }) {
  return {
    id,
    source_id: "source-watch-acme-agent",
    category: "project",
    title: "acme/agent changed",
    url: eventUrl,
    source: "GitHub Watch",
    event_date: REPORT_DATE,
    status: "excluded",
    evidence: "The watched repository published a material commit or release.",
    verification_status: "primary_confirmed",
    source_level: "github",
    source_watch: {
      signal: "github_watch",
      target_id: "acme-agent",
      source_lane: "github_watch",
      source_tier: "first_class",
      verification_policy: "no_secondary_review_required",
      event_url: eventUrl,
      snapshot_fingerprint: fingerprint,
      repo_snapshot: {
        repo: "acme/agent",
        stars: 42,
        forks: 4,
        open_issues: 2,
        pushed_at: "2026-07-10T07:00:00.000Z",
        updated_at: "2026-07-10T07:05:00.000Z",
        default_branch: "main",
        language: "TypeScript",
        license: "MIT",
        latest_release: null,
        latest_tag: null,
        latest_commit: {
          sha: "2222222",
          html_url: eventUrl,
          message: "material update",
          author_date: "2026-07-10T07:00:00.000Z",
          author_name: "Acme"
        },
        readme_status: "checked"
      }
    }
  };
}

function siteSourceWatchCandidate() {
  const eventUrl = "https://example.com/ai";
  return {
    id: "site-first-snapshot",
    source_id: "source-watch-example-ai",
    category: "community_lead",
    title: "Example AI site changed",
    url: eventUrl,
    source: "Site Watch",
    event_date: REPORT_DATE,
    status: "excluded",
    evidence: "The watched site published materially different visible content.",
    verification_status: "intermediary_only",
    source_level: "ai_news_aggregator",
    source_watch: {
      signal: "site_watch",
      target_id: "example-ai-site",
      source_lane: "site_watch",
      source_tier: "discovery",
      verification_policy: "secondary_review_required",
      event_url: eventUrl,
      snapshot_fingerprint: fingerprint("d"),
      site_snapshot: {
        title: "Example AI",
        description: "Independent AI project updates.",
        canonical_url: eventUrl,
        feeds: [],
        discovered_github_repositories: [],
        content_fingerprint: fingerprint("e")
      }
    }
  };
}

function fingerprint(character) {
  return `sha256:${character.repeat(64)}`;
}

function assertCandidateAbsentFromOrdinarySections(report, candidateId) {
  for (const section of [
    "stories",
    "main_items",
    "github_trending",
    "huggingface_trending",
    "model_releases",
    "hot_blogs",
    "chinese_media_dynamics",
    "projects",
    "builder_observations",
    "official_org_updates",
    "community_leads"
  ]) {
    assert(
      !(report[section] || []).some((item) => item.candidate_id === candidateId),
      `${candidateId} must not enter ordinary section ${section}`
    );
  }
}
