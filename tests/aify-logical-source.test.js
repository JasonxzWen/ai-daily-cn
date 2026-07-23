import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildDailyWorkflowStages, runDailyWorkflow } from "../src/daily-runner.js";
import { collectContentSources } from "../src/discovery.js";
import {
  CORE_SOURCE_CONTRACTS,
  buildSourceEffectivenessTable
} from "../src/source-effectiveness.js";
import { auditSourceRunHistory } from "../src/source-phase5.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AIFY_SOURCE = {
  id: "content-aify-news",
  name: "Aify News",
  url: "https://aify-news.pages.dev/articles.json",
  source_kind: "search_api",
  candidate_category: "community_lead",
  source_group: "news_newsletters",
  credibility_tag: "single_source_relay",
  content_tags: ["industry_news", "analysis_opinion"],
  requires_original_url: false,
  timeout_ms: 15000
};

test("Aify collection is a logical source with explicit public taxonomy tags", async (t) => {
  const config = JSON.parse(await fs.readFile(path.join(rootDir, "config", "sources", "aify-news.json"), "utf8"));
  assert.deepEqual(config.sources, [AIFY_SOURCE]);

  const logical = CORE_SOURCE_CONTRACTS.find((source) => source.id === "aify-news");
  assert(logical);
  assert.equal(logical.role, "news_aggregator");
  assert(logical.aliases.includes("content-aify-news"));
  assert(logical.aliases.includes("site-aify-news"));
  assert.deepEqual(logical.required_observation_entries, ["content-aify-news", "site-aify-news"]);

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-aify-collection-"));
  t.after(() => fs.rm(tmp, { recursive: true, force: true }));
  const payload = JSON.stringify([
    {
      title: "LangChain publishes a new agent runtime guide",
      url: "https://docs.langchain.com/agent-runtime-guide",
      summary: "A guide to agent runtime execution and recovery.",
      date: "2026-07-13",
      source: "LangChain Docs"
    }
  ]);

  const live = await collectContentSources({
    rootDir: tmp,
    reportDate: "2026-07-13",
    generatedAt: "2026-07-13T08:00:00.000Z",
    sources: [AIFY_SOURCE],
    fetchRetries: 0,
    fetchImpl: async () => textResponse(payload)
  });
  assertAifyCandidate(live.candidates[0]);

  const cached = await collectContentSources({
    rootDir: tmp,
    reportDate: "2026-07-13",
    generatedAt: "2026-07-13T09:00:00.000Z",
    sources: [AIFY_SOURCE],
    fetchRetries: 0,
    fetchImpl: async () => {
      throw new Error("network unavailable");
    }
  });
  assertAifyCandidate(cached.candidates[0]);
  assert.match(cached.source_audit.content_sources.sources[0].notes, /cache_fallback_used/);

  const expired = await collectContentSources({
    rootDir: tmp,
    reportDate: "2026-07-13",
    generatedAt: "2026-07-21T08:00:00.000Z",
    sources: [AIFY_SOURCE],
    fetchRetries: 0,
    fetchImpl: async () => {
      throw new Error("network unavailable");
    }
  });
  assert.equal(expired.candidates.length, 0);
  assert.equal(expired.source_audit.content_sources.sources[0].status, "blocked");
});

test("daily production stage requests Aify Phase5 evidence and persists the structured result in run-summary", async (t) => {
  const reportDate = "2026-07-13";
  const stage = buildDailyWorkflowStages({ reportDate, publish: false })
    .find((item) => item.id === "sources_phase5_audit");
  assert(stage);
  assert.equal(stage.command.tool, "node");
  assert.deepEqual(stage.command.args, [
    "src/cli.js",
    "sources:phase5-audit",
    "--date",
    reportDate,
    "--history-dir",
    "reports-data",
    "--days",
    "3",
    "--logical-source",
    "aify-news",
    "--output",
    `.tmp/sources-phase5-audit-${reportDate}.json`
  ]);

  const launcherRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-aify-runner-"));
  t.after(() => fs.rm(launcherRoot, { recursive: true, force: true }));
  const evidence = {
    logical_source_id: "aify-news",
    required_observation_entries: ["content-aify-news", "site-aify-news"],
    expected_dates: ["2026-07-11", "2026-07-12", "2026-07-13"],
    days: [],
    consecutive_complete_days: 0,
    total_public_matches: 0,
    production_verified: false,
    violations: [{ code: "missing_report_day" }]
  };
  const result = await runDailyWorkflow({
    launcherRoot,
    reportDate,
    publish: false,
    prepareCleanWorktree: async () => ({
      ok: true,
      next_cwd: path.join(launcherRoot, ".tmp", "publish-worktrees", "main"),
      remote_main_sha: "1111111111111111111111111111111111111111"
    }),
    runStage: async (item) => item.id === "sources_phase5_audit"
      ? {
          ok: true,
          output: {
            ok: true,
            phase5_complete: false,
            report_date: reportDate,
            target_days: 3,
            logical_source_evidence: evidence
          }
        }
      : { ok: true, output: { stage: item.id } }
  });

  assert.deepEqual(result.summary.sources_phase5_audit, {
    phase5_complete: false,
    report_date: reportDate,
    target_days: 3,
    logical_source_evidence: evidence
  });
  const saved = JSON.parse(await fs.readFile(result.summaryPath, "utf8"));
  assert.deepEqual(saved.sources_phase5_audit, result.summary.sources_phase5_audit);
});

test("Aify effectiveness reports persisted non-main exclusion reasons", () => {
  const rows = buildSourceEffectivenessTable({
    report: {
      source_audit: {
        site_watch: {
          checked: true,
          candidates_found: 1,
          included: 0,
          sources: [{
            id: "site-aify-news",
            target_id: "site-aify-news",
            name: "Aify News",
            url: "https://aify-news.pages.dev/",
            status: "checked",
            parsed_count: 1
          }]
        }
      }
    },
    candidates: [{
      id: "aify-unchanged",
      source_id: "site-aify-news",
      source: "Aify News",
      url: "https://aify-news.pages.dev/",
      status: "excluded",
      exclusion_reason: "source_watch_unchanged_snapshot"
    }]
  });
  const aify = rows.find((row) => row.id === "aify-news");

  assert(aify);
  assert.equal(aify.candidate_created, true);
  assert.equal(aify.public_included, false);
  assert.equal(aify.not_included_reason, "candidate_rejected:source_watch_unchanged_snapshot");
});

test("logical source evidence accepts three consecutive closed-loop Aify days", async (t) => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-aify-phase5-"));
  t.after(() => fs.rm(tmp, { recursive: true, force: true }));
  await writeAifyEvidenceDay(tmp, "2026-07-11", {
    reason: "not_selected_lower_priority",
    url: "https://example.com/aify/11"
  });
  await writeAifyEvidenceDay(tmp, "2026-07-12", {
    included: true,
    url: "https://example.com/aify/12"
  });
  await writeAifyEvidenceDay(tmp, "2026-07-13", {
    reason: "source_watch_unchanged_snapshot",
    url: "https://aify-news.pages.dev/"
  });
  await writePublicArticles(tmp, [{
    url: "https://example.com/aify/12",
    report_date: "2026-07-12",
    report_url: "reports/2026/07/2026-07-12.html"
  }]);

  const result = await auditSourceRunHistory({
    rootDir: tmp,
    historyDir: "reports-data",
    reportDate: "2026-07-13",
    days: 3,
    logicalSourceId: "aify-news"
  });

  assert.deepEqual(result.logical_source_evidence.expected_dates, ["2026-07-11", "2026-07-12", "2026-07-13"]);
  assert.equal(result.logical_source_evidence.days.length, 3);
  assert.equal(result.logical_source_evidence.days.every((day) => day.complete), true);
  assert.deepEqual(result.logical_source_evidence.required_observation_entries, ["content-aify-news", "site-aify-news"]);
  assert.equal(result.logical_source_evidence.days.every((day) =>
    day.entry_observations.length === 2 && day.entry_observations.every((entry) => entry.complete)), true);
  assert.equal(result.logical_source_evidence.total_public_matches, 1);
  assert.equal(result.logical_source_evidence.production_verified, true);
  assert.deepEqual(result.logical_source_evidence.violations, []);
});

test("logical source evidence rejects a site-only three-day shell even with a public match", async (t) => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-aify-phase5-site-only-"));
  t.after(() => fs.rm(tmp, { recursive: true, force: true }));
  await writeAifyEvidenceDay(tmp, "2026-07-11", {
    entryIds: ["site-aify-news"],
    reason: "source_watch_unchanged_snapshot",
    url: "https://aify-news.pages.dev/11"
  });
  await writeAifyEvidenceDay(tmp, "2026-07-12", {
    entryIds: ["site-aify-news"],
    included: true,
    url: "https://aify-news.pages.dev/12"
  });
  await writeAifyEvidenceDay(tmp, "2026-07-13", {
    entryIds: ["site-aify-news"],
    reason: "source_watch_unchanged_snapshot",
    url: "https://aify-news.pages.dev/13"
  });
  await writePublicArticles(tmp, [{
    url: "https://aify-news.pages.dev/12",
    report_date: "2026-07-12",
    report_url: "reports/2026/07/2026-07-12.html"
  }]);

  const result = await auditSourceRunHistory({
    rootDir: tmp,
    historyDir: "reports-data",
    reportDate: "2026-07-13",
    days: 3,
    logicalSourceId: "aify-news"
  });
  const codes = result.logical_source_evidence.violations.map((violation) => violation.code);

  assert.equal(result.logical_source_evidence.total_public_matches, 1);
  assert.equal(result.logical_source_evidence.production_verified, false);
  assert(codes.includes("required_observation_entry_missing"));
  assert(codes.includes("required_observation_entry_candidate_missing"));
  assert.equal(result.logical_source_evidence.days.every((day) =>
    day.entry_observations.some((entry) => entry.id === "content-aify-news" && entry.complete === false)), true);
});

test("logical source evidence rejects one hybrid candidate being claimed by both required entries", async (t) => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-aify-phase5-hybrid-"));
  t.after(() => fs.rm(tmp, { recursive: true, force: true }));
  await writeAifyEvidenceDay(tmp, "2026-07-11", {
    hybridCandidate: true,
    reason: "not_selected_lower_priority",
    url: "https://example.com/aify/11"
  });
  await writeAifyEvidenceDay(tmp, "2026-07-12", {
    hybridCandidate: true,
    included: true,
    url: "https://example.com/aify/12"
  });
  await writeAifyEvidenceDay(tmp, "2026-07-13", {
    hybridCandidate: true,
    reason: "not_selected_lower_priority",
    url: "https://example.com/aify/13"
  });
  await writePublicArticles(tmp, [{
    url: "https://example.com/aify/12",
    report_date: "2026-07-12",
    report_url: "reports/2026/07/2026-07-12.html"
  }]);

  const result = await auditSourceRunHistory({
    rootDir: tmp,
    historyDir: "reports-data",
    reportDate: "2026-07-13",
    days: 3,
    logicalSourceId: "aify-news"
  });
  const codes = result.logical_source_evidence.violations.map((violation) => violation.code);

  assert.equal(result.logical_source_evidence.production_verified, false);
  assert(codes.includes("required_observation_entry_identity_conflict"));
  assert(codes.includes("required_observation_entry_candidate_missing"));
  assert.equal(result.logical_source_evidence.days.every((day) =>
    day.entry_observations.every((entry) => entry.candidate_count === 0 && entry.complete === false)), true);
});

test("logical source evidence rejects missing reasons and included/public mismatches", async (t) => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-aify-phase5-invalid-"));
  t.after(() => fs.rm(tmp, { recursive: true, force: true }));
  await writeAifyEvidenceDay(tmp, "2026-07-11", {
    reason: "not_selected_lower_priority",
    url: "https://example.com/aify/11"
  });
  await writeAifyEvidenceDay(tmp, "2026-07-12", {
    included: true,
    url: "https://example.com/aify/12"
  });
  await writeAifyEvidenceDay(tmp, "2026-07-13", {
    url: "https://example.com/aify/13",
    rowPublicIncluded: true
  });
  await writePublicArticles(tmp, []);

  const result = await auditSourceRunHistory({
    rootDir: tmp,
    historyDir: "reports-data",
    reportDate: "2026-07-13",
    days: 3,
    logicalSourceId: "aify-news"
  });
  const codes = result.logical_source_evidence.violations.map((violation) => violation.code);

  assert.equal(result.logical_source_evidence.production_verified, false);
  assert(codes.includes("missing_disposition_reason"));
  assert(codes.includes("included_public_output_mismatch"));
  assert(codes.includes("effectiveness_public_included_mismatch"));
});

test("logical source production proof cannot pass when the same Phase5 day fails admission", async (t) => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-aify-phase5-admission-"));
  t.after(() => fs.rm(tmp, { recursive: true, force: true }));
  await writeAifyEvidenceDay(tmp, "2026-07-11", {
    reason: "not_selected_lower_priority",
    url: "https://example.com/aify/11"
  });
  await writeAifyEvidenceDay(tmp, "2026-07-12", {
    included: true,
    includedIn: "main_items",
    reportMainItem: true,
    url: "https://example.com/aify/12"
  });
  await writeAifyEvidenceDay(tmp, "2026-07-13", {
    reason: "source_watch_unchanged_snapshot",
    url: "https://aify-news.pages.dev/"
  });
  await writePublicArticles(tmp, [{
    url: "https://example.com/aify/12",
    report_date: "2026-07-12",
    report_url: "reports/2026/07/2026-07-12.html"
  }]);

  const result = await auditSourceRunHistory({
    rootDir: tmp,
    historyDir: "reports-data",
    reportDate: "2026-07-13",
    days: 3,
    logicalSourceId: "aify-news"
  });
  const logicalCodes = result.logical_source_evidence.violations.map((violation) => violation.code);

  assert.equal(result.phase5_complete, false);
  assert.equal(result.logical_source_evidence.production_verified, false);
  assert(logicalCodes.includes("phase5_day_incomplete"));
});

function assertAifyCandidate(candidate) {
  assert(candidate);
  assert.equal(candidate.source_id, "content-aify-news");
  assert.equal(candidate.source, "LangChain Docs");
  assert.equal(candidate.source_group, "news_newsletters");
  assert.equal(candidate.credibility_tag, "single_source_relay");
  assert.deepEqual(candidate.content_tags, ["industry_news", "analysis_opinion"]);
  assert.equal(candidate.verification_status, "intermediary_only");
  assert.equal(candidate.url, "https://docs.langchain.com/agent-runtime-guide");
}

function textResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    async text() {
      return body;
    }
  };
}

async function writeAifyEvidenceDay(root, reportDate, options = {}) {
  const [year, month] = reportDate.split("-");
  const reportDir = path.join(root, "reports-data", year, month);
  const candidateDir = path.join(root, "reports-data", "internal", "candidates", year, month);
  await fs.mkdir(reportDir, { recursive: true });
  await fs.mkdir(candidateDir, { recursive: true });
  const entryIds = Array.isArray(options.entryIds) && options.entryIds.length > 0
    ? options.entryIds
    : ["content-aify-news", "site-aify-news"];
  const primarySourceId = entryIds.includes("content-aify-news") ? "content-aify-news" : entryIds[0];
  const included = options.included === true;
  const includedIn = options.includedIn || "source_watch";
  const rowPublicIncluded = options.rowPublicIncluded ?? included;
  const primaryCandidateId = `aify-${reportDate}-${primarySourceId}`;
  const report = {
    report_date: reportDate,
    source_audit: Object.fromEntries([
      "github_trending",
      "builder_sources",
      "content_sources",
      "search_sources",
      "sources_health"
    ].map((id) => [id, { checked: true, sources: [], candidates_found: 0, included: 0 }])),
    source_effectiveness: [{
      id: "aify-news",
      configured: true,
      reachable: true,
      parsed_recent: true,
      candidate_created: true,
      public_included: rowPublicIncluded,
      source_ids: entryIds,
      statuses: ["checked"]
    }],
    ...(options.reportMainItem ? {
      main_items: [{
        candidate_id: primaryCandidateId,
        title: `Aify candidate ${reportDate}`,
        url: options.url
      }]
    } : {})
  };
  const candidates = options.hybridCandidate ? [{
    id: primaryCandidateId,
    source_id: "content-aify-news",
    source: "Aify News",
    title: `Aify hybrid candidate ${reportDate}`,
    url: options.url,
    event_date: reportDate,
    status: included ? "included" : "excluded",
    verification_status: "intermediary_only",
    source_level: "ai_news_aggregator",
    source_watch: {
      target_id: "site-aify-news",
      event_url: options.url
    },
    ...(included ? { included_in: includedIn } : {}),
    ...(!included && options.reason ? { exclusion_reason: options.reason } : {})
  }] : entryIds.map((sourceId) => {
    const primary = sourceId === primarySourceId;
    const candidateIncluded = primary && included;
    const candidateUrl = primary ? options.url : "https://aify-news.pages.dev/";
    const reason = primary ? options.reason : "source_watch_unchanged_snapshot";
    return {
      id: `aify-${reportDate}-${sourceId}`,
      source_id: sourceId,
      source: "Aify News",
      title: `Aify candidate ${reportDate} ${sourceId}`,
      url: candidateUrl,
      event_date: reportDate,
      status: candidateIncluded ? "included" : "excluded",
      verification_status: "intermediary_only",
      source_level: "ai_news_aggregator",
      ...(sourceId === "site-aify-news" ? {
        source_watch: {
          target_id: sourceId,
          event_url: candidateUrl
        }
      } : {}),
      ...(candidateIncluded ? { included_in: includedIn } : {}),
      ...(!candidateIncluded && reason ? { exclusion_reason: reason } : {})
    };
  });
  await fs.writeFile(path.join(reportDir, `${reportDate}.json`), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(candidateDir, `${reportDate}.candidates.json`), `${JSON.stringify({ report_date: reportDate, candidates }, null, 2)}\n`, "utf8");
}

async function writePublicArticles(root, articles) {
  const docsDir = path.join(root, "docs");
  await fs.mkdir(docsDir, { recursive: true });
  await fs.writeFile(path.join(docsDir, "articles.json"), `${JSON.stringify(articles, null, 2)}\n`, "utf8");
}
