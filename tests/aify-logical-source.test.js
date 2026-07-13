import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
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
  tier: "T3",
  authority: "aggregator",
  enablement: "core",
  verification_policy: "primary_required",
  requires_original_url: false,
  lookback_days: 0,
  max_items_per_run: 5,
  timeout_ms: 15000,
  source_level: "ai_news_aggregator"
};

test("Aify collection is a core logical source without publisher or authority escalation", async (t) => {
  const config = JSON.parse(await fs.readFile(path.join(rootDir, "config", "sources", "aify-news.json"), "utf8"));
  assert.deepEqual(config.sources, [AIFY_SOURCE]);

  const logical = CORE_SOURCE_CONTRACTS.find((source) => source.id === "aify-news");
  assert(logical);
  assert.equal(logical.role, "news_aggregator");
  assert(logical.aliases.includes("content-aify-news"));
  assert(logical.aliases.includes("site-aify-news"));

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
    sourceId: "site-aify-news",
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
  assert.equal(result.logical_source_evidence.total_public_matches, 1);
  assert.equal(result.logical_source_evidence.production_verified, true);
  assert.deepEqual(result.logical_source_evidence.violations, []);
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
    sourceId: "site-aify-news",
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
  assert.equal(candidate.source_level, "ai_news_aggregator");
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
  const sourceId = options.sourceId || "content-aify-news";
  const included = options.included === true;
  const includedIn = options.includedIn || "source_watch";
  const rowPublicIncluded = options.rowPublicIncluded ?? included;
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
      source_ids: ["content-aify-news", "site-aify-news"],
      statuses: ["checked"]
    }],
    ...(options.reportMainItem ? {
      main_items: [{
        candidate_id: `aify-${reportDate}`,
        title: `Aify candidate ${reportDate}`,
        url: options.url
      }]
    } : {})
  };
  const candidate = {
    id: `aify-${reportDate}`,
    source_id: sourceId,
    source: "Aify News",
    title: `Aify candidate ${reportDate}`,
    url: options.url,
    event_date: reportDate,
    status: included ? "included" : "excluded",
    verification_status: "intermediary_only",
    source_level: "ai_news_aggregator",
    ...(included ? { included_in: includedIn } : {}),
    ...(options.reason ? { exclusion_reason: options.reason } : {})
  };
  await fs.writeFile(path.join(reportDir, `${reportDate}.json`), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(candidateDir, `${reportDate}.candidates.json`), `${JSON.stringify({ report_date: reportDate, candidates: [candidate] }, null, 2)}\n`, "utf8");
}

async function writePublicArticles(root, articles) {
  const docsDir = path.join(root, "docs");
  await fs.mkdir(docsDir, { recursive: true });
  await fs.writeFile(path.join(docsDir, "articles.json"), `${JSON.stringify(articles, null, 2)}\n`, "utf8");
}
