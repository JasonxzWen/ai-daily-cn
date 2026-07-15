import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  collectBuilderFallbacks,
  collectContentSources,
  collectGitHubTrending,
  collectHuggingFaceTrending,
  collectSourceWatch,
  parseGitHubReportMarkdownEntries
} from "../src/discovery.js";
import { mergeDiscoveryPayloads } from "../src/draft.js";
import { buildDailyWorkflowStages } from "../src/daily-runner.js";
import { collectSearchNews } from "../src/search-news.js";
import { buildOccurrenceStore } from "../src/occurrence-store.js";
import { projectOccurrenceStore } from "../src/public-signals.js";
import { normalizeSourceRegistry, validateSourceRegistryPath } from "../src/source-registry.js";
import { validateCandidatePool } from "../src/schema.js";

const REPORT_DATE = "2026-07-14";
const GENERATED_AT = "2026-07-14T08:00:00.000Z";

test("daily workflow publishes signal artifacts before source health and never feeds health into signals_write", () => {
  const stages = buildDailyWorkflowStages({ reportDate: REPORT_DATE, generatedAt: GENERATED_AT, publish: true });
  const byId = new Map(stages.map((stage, index) => [stage.id, { stage, index }]));
  assert(byId.get("sources_health").index > byId.get("signals_publish_real").index);
  const signalWriteArgs = byId.get("signals_write").stage.command.args;
  const signalInput = signalWriteArgs[signalWriteArgs.indexOf("--input") + 1];
  assert.equal(signalInput.includes("sources-health"), false);
  const draftArgs = byId.get("report_draft").stage.command.args;
  const draftInput = draftArgs[draftArgs.indexOf("--input") + 1];
  assert.equal(draftInput.includes("sources-health"), true);
});

test("content listener keeps every parsed item from every configured source", async () => {
  const sources = [contentSource("alpha"), contentSource("beta")];
  const feeds = new Map(sources.map((source) => [source.url, rssFeed(source.id, 4)]));
  const result = await collectContentSources({
    reportDate: REPORT_DATE,
    generatedAt: GENERATED_AT,
    sources,
    includeWeChatInput: false,
    cacheFallback: false,
    fetchImpl: async (url) => response(feeds.get(String(url)) || "", feeds.has(String(url)) ? 200 : 404)
  });

  assert.equal(result.candidates.length, 8);
  assert.deepEqual(new Set(result.candidates.map((item) => item.source_id)), new Set(["content-alpha", "content-beta"]));
});

test("builder listener keeps the union of all public feeds", async () => {
  const sources = [builderSource("alpha"), builderSource("beta")];
  const feeds = new Map(sources.map((source) => [source.url, rssFeed(source.id, 3)]));
  const result = await collectBuilderFallbacks({
    reportDate: REPORT_DATE,
    generatedAt: GENERATED_AT,
    sources,
    followBuildersFeeds: false,
    xSearchFallback: false,
    fetchImpl: async (url) => response(feeds.get(String(url)) || "", feeds.has(String(url)) ? 200 : 404)
  });

  assert.equal(result.candidates.length, 6);
});

test("X search listener retains a safe relay when the original status URL is missing", async () => {
  const xFeedUrl = "https://feeds.example.com/follow-builders-x.json";
  const relayUrl = "https://relay.example.com/x-observations/agent-update";
  const result = await collectBuilderFallbacks({
    reportDate: REPORT_DATE,
    generatedAt: GENERATED_AT,
    sources: [],
    followBuildersFeeds: { x: xFeedUrl, podcasts: "", blogs: "" },
    xSearchApiKey: "test-key",
    xSearchQueries: ["site:x.com AI agent update"],
    fetchImpl: async (url) => {
      if (String(url) === xFeedUrl) {
        return response(JSON.stringify({ x: [] }), 200, "application/json");
      }
      if (String(url) === "https://api.tavily.com/search") {
        return response(JSON.stringify({
          results: [{
            title: "Agent update relayed from X",
            url: relayUrl,
            content: "A builder described a new agent workflow."
          }]
        }), 200, "application/json");
      }
      return response("{}", 404, "application/json");
    }
  });

  assert.equal(result.candidates.length, 1);
  const candidate = result.candidates[0];
  assert.equal(candidate.url, relayUrl);
  assert.equal(candidate.intermediary_url, relayUrl);
  assert.equal(candidate.original_url, undefined);
  assert.equal(candidate.verification_status, "unverified");
  assert.deepEqual(candidate.tags, ["original_url_missing", "unverified", "indirect"]);

  const merged = mergeDiscoveryPayloads([result], { reportDate: REPORT_DATE, generatedAt: GENERATED_AT });
  const store = buildOccurrenceStore({
    reportDate: REPORT_DATE,
    generatedAt: GENERATED_AT,
    sources: merged.sources,
    candidates: merged.occurrenceCandidates
  });
  assert.equal(store.normalization_error_count, 0);
  assert.equal(store.occurrences[0].url, relayUrl);
  assert.equal(store.occurrences[0].access_state, "indirect");
  assert.deepEqual(store.occurrences[0].raw_tags, ["indirect", "original_url_missing", "unverified"]);
  const xAudit = result.source_audit.builder_sources.sources.find((source) => source.name.includes("Tavily"));
  assert.equal(xAudit.transport_status, "degraded");
  assert.equal(xAudit.transport_limitation, "provider_has_no_pagination");
});

test("follow-builders X listener falls back to its safe provider URL", async () => {
  const xFeedUrl = "https://feeds.example.com/follow-builders-x.json";
  const result = await collectBuilderFallbacks({
    reportDate: REPORT_DATE,
    generatedAt: GENERATED_AT,
    sources: [],
    followBuildersFeeds: { x: xFeedUrl, podcasts: "", blogs: "" },
    xSearchFallback: false,
    fetchImpl: async () => response(JSON.stringify({
      x: [{
        name: "Builder Example",
        handle: "builder_example",
        tweets: [{ text: "An X observation without a source status URL.", createdAt: GENERATED_AT }]
      }]
    }), 200, "application/json")
  });

  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].url, xFeedUrl);
  assert.equal(result.candidates[0].intermediary_url, xFeedUrl);
  assert.deepEqual(result.candidates[0].tags, ["original_url_missing", "unverified", "indirect"]);
  assert.equal(result.source_audit.builder_sources.blocked_reason, "");
});

test("X listeners retain safe URL observations even when text is still pending", async () => {
  const xFeedUrl = "https://feeds.example.com/follow-builders-x.json";
  const relayUrl = "https://relay.example.com/x/title-pending";
  const originalUrl = "https://x.com/builder_example/status/1812345678901234567";
  const result = await collectBuilderFallbacks({
    reportDate: REPORT_DATE,
    generatedAt: GENERATED_AT,
    sources: [],
    followBuildersFeeds: { x: xFeedUrl, podcasts: "", blogs: "" },
    xSearchApiKey: "test-key",
    xSearchQueries: ["site:x.com pending"],
    fetchImpl: async (url) => {
      if (String(url) === xFeedUrl) {
        return response(JSON.stringify({
          x: [{ handle: "builder_example", tweets: [{ url: originalUrl, text: "", createdAt: GENERATED_AT }] }]
        }), 200, "application/json");
      }
      if (String(url) === "https://api.tavily.com/search") {
        return response(JSON.stringify({ results: [{ title: "", content: "", url: relayUrl }] }), 200, "application/json");
      }
      return response("{}", 404, "application/json");
    }
  });

  assert.equal(result.candidates.length, 2);
  assert(result.candidates.every((item) => item.title === ""));
  assert(result.candidates.every((item) => item.tags.includes("content_pending")));
  assert.deepEqual(new Set(result.candidates.map((item) => item.url)), new Set([originalUrl, relayUrl]));
});

test("Tavily X fallback shards query/day lanes and resumes the auditable lane checkpoint", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "adc-x-lanes-"));
  const statePath = path.join(rootDir, "pagination.json");
  const xFeedUrl = "https://feeds.example.com/follow-builders-x.json";
  const seenDays = [];
  const run = (requestBudget) => collectBuilderFallbacks({
    rootDir,
    reportDate: REPORT_DATE,
    generatedAt: GENERATED_AT,
    sources: [],
    followBuildersFeeds: { x: xFeedUrl, podcasts: "", blogs: "" },
    xSearchApiKey: "test-key",
    xSearchQueries: ["site:x.com/*/status AI agents"],
    xSearchLookbackDays: 3,
    transportStatePath: statePath,
    transportRequestBudget: requestBudget,
    fetchImpl: async (url, init = {}) => {
      if (String(url) === xFeedUrl) return response(JSON.stringify({ x: [] }), 200, "application/json");
      if (String(url) === "https://api.tavily.com/search") {
        const body = JSON.parse(init.body);
        seenDays.push(body.start_date);
        return response(JSON.stringify({
          results: [{ title: `X ${body.start_date}`, content: "lane observation", url: `https://x.com/builder/status/${body.start_date.replaceAll("-", "")}` }]
        }), 200, "application/json");
      }
      return response("{}", 404, "application/json");
    }
  });

  const firstRun = await run(1);
  const firstAudit = firstRun.source_audit.builder_sources.sources.find((source) => source.name.includes("Tavily"));
  assert.equal(firstRun.candidates.length, 1);
  assert.equal(firstAudit.lane_count, 3);
  assert.equal(firstAudit.lanes_completed, 1);
  assert.equal(firstAudit.continuation_lane, 1);
  assert.equal(JSON.parse(await fs.readFile(statePath, "utf8")).lanes["builder:tavily:x"].state.laneIndex, 1);

  const secondRun = await run(5);
  assert.equal(secondRun.candidates.length, 2);
  assert.equal(new Set(seenDays).size, 3);
  assert.deepEqual(JSON.parse(await fs.readFile(statePath, "utf8")).lanes, {});
});

test("follow-builders podcast and blog rows preserve same-URL observations and coalesce exact duplicates", async () => {
  const podcastFeedUrl = "https://feeds.example.com/follow-builders-podcasts.json";
  const blogFeedUrl = "https://feeds.example.com/follow-builders-blogs.json";
  const podcastRows = [
    { id: "episode-a", title: "First episode row", url: "https://example.com/shared-episode", publishedAt: GENERATED_AT },
    { id: "episode-b", title: "Second episode row", url: "https://example.com/shared-episode", publishedAt: GENERATED_AT },
    { id: "episode-a", title: "First episode row", url: "https://example.com/shared-episode", publishedAt: GENERATED_AT }
  ];
  const blogRows = [
    { title: "First blog row", url: "https://example.com/shared-post", publishedAt: GENERATED_AT },
    { title: "Second blog row", url: "https://example.com/shared-post", publishedAt: GENERATED_AT },
    { title: "First blog row", url: "https://example.com/shared-post", publishedAt: GENERATED_AT }
  ];
  const result = await collectBuilderFallbacks({
    reportDate: REPORT_DATE,
    generatedAt: GENERATED_AT,
    sources: [],
    followBuildersFeeds: { x: "", podcasts: podcastFeedUrl, blogs: blogFeedUrl },
    xSearchFallback: false,
    fetchImpl: async (url) => {
      if (String(url) === podcastFeedUrl) return response(JSON.stringify({ podcasts: podcastRows }), 200, "application/json");
      if (String(url) === blogFeedUrl) return response(JSON.stringify({ blogs: blogRows }), 200, "application/json");
      return response("{}", 404, "application/json");
    }
  });
  const merged = mergeDiscoveryPayloads([result], { reportDate: REPORT_DATE, generatedAt: GENERATED_AT });
  const store = buildOccurrenceStore({
    reportDate: REPORT_DATE,
    generatedAt: GENERATED_AT,
    sources: merged.sources,
    candidates: merged.occurrenceCandidates
  });

  assert.equal(result.candidates.length, 6);
  assert.equal(store.occurrence_count, 4);
  assert.deepEqual(store.occurrences.map((item) => item.raw_record_count).sort((a, b) => a - b), [1, 1, 2, 2]);
});

test("X observation without any safe public URL becomes a normalization error", async () => {
  const unsafeFeedUrl = "http://127.0.0.1/follow-builders-x.json";
  const result = await collectBuilderFallbacks({
    reportDate: REPORT_DATE,
    generatedAt: GENERATED_AT,
    sources: [],
    followBuildersFeeds: { x: unsafeFeedUrl, podcasts: "", blogs: "" },
    xSearchFallback: false,
    fetchImpl: async () => response(JSON.stringify({
      x: [{
        handle: "unsafe_example",
        tweets: [{ url: "javascript:alert(1)", text: "Unsafe relay observation", createdAt: GENERATED_AT }]
      }]
    }), 200, "application/json")
  });

  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].url, "");
  const store = buildOccurrenceStore({
    reportDate: REPORT_DATE,
    generatedAt: GENERATED_AT,
    sources: [],
    candidates: result.candidates
  });
  assert.equal(store.occurrence_count, 0);
  assert.equal(store.normalization_error_count, 1);
  assert.equal(store.normalization_errors[0].code, "url_unsafe");
});

test("GitHub Trending retains the same repository observed in distinct ranking collectors", async () => {
  const sources = [
    { name: "GitHub Trending Daily", url: "https://github.com/trending?since=daily", language: "all", window: "daily" },
    { name: "GitHub Trending Weekly", url: "https://github.com/trending?since=weekly", language: "all", window: "weekly" }
  ];
  const html = `<article><h2><a href="/example/listener">example/listener</a></h2><p>Source listener</p></article>`;
  const result = await collectGitHubTrending({
    reportDate: REPORT_DATE,
    sources,
    readmeEnrichment: false,
    ossInsightFallback: false,
    fetchImpl: async () => response(html)
  });

  assert.equal(result.candidates.length, 2);
  assert.deepEqual(result.candidates.map((item) => item.source_id).sort(), [
    "github-github-trending-daily",
    "github-github-trending-weekly"
  ]);
});

test("Hugging Face listener persists every returned ranking row", async () => {
  const payload = Array.from({ length: 5 }, (_, index) => ({
    id: `org/model-${index + 1}`,
    likes: index,
    downloads: index * 10,
    pipeline_tag: "text-generation",
    tags: ["transformers"]
  }));
  const result = await collectHuggingFaceTrending({
    reportDate: REPORT_DATE,
    generatedAt: GENERATED_AT,
    fetchImpl: async () => response(JSON.stringify(payload), 200, "application/json")
  });

  assert.equal(result.candidates.length, 5);
  assert.equal(result.source_audit.huggingface_trending.sources[0].transport_status, "complete");
});

test("Hugging Face listener follows same-origin pagination to exhaustion", async () => {
  const calls = [];
  const result = await collectHuggingFaceTrending({
    reportDate: REPORT_DATE,
    generatedAt: GENERATED_AT,
    transportPageSize: 2,
    fetchImpl: async (url) => {
      calls.push(String(url));
      if (calls.length === 1) {
        return response(JSON.stringify([{ id: "org/model-1" }, { id: "org/model-2" }]), 200, "application/json", {
          link: '<https://huggingface.co/api/models?sort=likes&direction=-1&limit=2&cursor=next>; rel="next"'
        });
      }
      return response(JSON.stringify([{ id: "org/model-3" }]), 200, "application/json");
    }
  });

  assert.equal(result.candidates.length, 3);
  assert.equal(calls.length, 2);
  assert.equal(result.source_audit.huggingface_trending.sources[0].transport_status, "complete");
  assert.equal(result.source_audit.huggingface_trending.sources[0].pages_fetched, 2);
});

test("Hugging Face listener reports a resumable partial result when its request budget is exhausted", async () => {
  let call = 0;
  const result = await collectHuggingFaceTrending({
    reportDate: REPORT_DATE,
    generatedAt: GENERATED_AT,
    transportPageSize: 1,
    transportRequestBudget: 2,
    fetchImpl: async () => {
      call += 1;
      return response(JSON.stringify([{ id: `org/model-${call}` }]), 200, "application/json", {
        link: `<https://huggingface.co/api/models?limit=1&cursor=page-${call + 1}>; rel="next"`
      });
    }
  });

  const audit = result.source_audit.huggingface_trending.sources[0];
  assert.equal(result.candidates.length, 2);
  assert.equal(call, 2);
  assert.equal(audit.transport_status, "degraded");
  assert.equal(audit.transport_limitation, "runtime_request_budget_exhausted");
  assert.match(audit.continuation_url, /cursor=page-3/);
});

test("Hugging Face listener rejects cross-origin pagination links", async () => {
  const result = await collectHuggingFaceTrending({
    reportDate: REPORT_DATE,
    generatedAt: GENERATED_AT,
    transportPageSize: 1,
    fetchImpl: async () => response(JSON.stringify([{ id: "org/model-1" }]), 200, "application/json", {
      link: '<http://127.0.0.1/private?cursor=next>; rel="next"'
    })
  });

  const audit = result.source_audit.huggingface_trending.sources[0];
  assert.equal(result.candidates.length, 1);
  assert.equal(audit.transport_status, "degraded");
  assert.equal(audit.transport_limitation, "pagination_next_url_rejected");
});

test("search transport page size limits each request without capping aggregate listener output", async () => {
  const queries = [
    { id: "agents", query: "AI agents", category: "ai" },
    { id: "models", query: "AI models", category: "ai" }
  ];
  const requestedPageSizes = [];
  const result = await collectSearchNews({
    reportDate: REPORT_DATE,
    generatedAt: GENERATED_AT,
    providers: ["gdelt"],
    queries,
    transportPageSize: 1,
    fetchImpl: async (url) => {
      const requestUrl = new URL(String(url));
      const query = requestUrl.searchParams.get("query") || "query";
      requestedPageSizes.push(requestUrl.searchParams.get("maxrecords"));
      return response(JSON.stringify({
        articles: [0, 1].map((index) => ({
          title: index === 0 ? `${query} result ${index + 1}` : "",
          url: `https://example.com/${encodeURIComponent(query)}/${index + 1}`,
          seendate: "20260714T070000Z",
          domain: "example.com",
          language: "English"
        }))
      }), 200, "application/json");
    }
  });

  assert.equal(result.candidates.length, 4);
  assert.deepEqual(requestedPageSizes, ["250", "250"]);
  assert.deepEqual(new Set(result.candidates.map((item) => item.query_id)), new Set(["agents", "models"]));
  assert.deepEqual(new Set(result.candidates.map((item) => item.source_group)), new Set(["news_newsletters"]));
  assert.equal(result.source_audit.search_sources.sources[0].transport_status, "degraded");
  assert.equal(result.source_audit.search_sources.sources[0].transport_limitation, "provider_has_no_reliable_exhaustive_pagination");
  assert.equal(result.source_audit.search_sources.sources[0].completeness_status, "partial");
  assert.equal(result.source_audit.search_sources.sources[0].completeness_reason, "provider_limited");
});

test("GDELT recursively time-slices saturated 250-row windows and resumes the saved window queue", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "adc-gdelt-checkpoint-"));
  const statePath = path.join(rootDir, "pagination.json");
  const windows = [];
  const firstRun = await collectSearchNews({
    rootDir,
    reportDate: REPORT_DATE,
    generatedAt: GENERATED_AT,
    providers: ["gdelt"],
    queries: [{ id: "dense", query: "dense AI news" }],
    transportStatePath: statePath,
    transportRequestBudget: 3,
    fetchImpl: async (url) => {
      const requestUrl = new URL(String(url));
      const start = requestUrl.searchParams.get("startdatetime");
      const end = requestUrl.searchParams.get("enddatetime");
      windows.push([start, end]);
      return response(JSON.stringify({
        articles: Array.from({ length: 250 }, (_, index) => ({
          title: `GDELT ${start}-${end}-${index}`,
          url: `https://example.com/gdelt/${start}/${end}/${index}`,
          seendate: "20260714T070000Z"
        }))
      }), 200, "application/json");
    }
  });

  assert.equal(firstRun.candidates.length, 750);
  assert.equal(windows.length, 3);
  assert.equal(new Set(windows.map((window) => window.join("-"))).size, 3);
  const audit = firstRun.source_audit.search_sources.sources[0];
  assert.equal(audit.pages_fetched, 3);
  assert.match(audit.transport_limitation, /runtime_request_budget_exhausted/);
  assert(audit.continuation_urls.length > 0);
  const saved = JSON.parse(await fs.readFile(statePath, "utf8"));
  const savedLane = saved.lanes["search:gdelt:dense"];
  assert.match(savedLane.state.windowStart, /^\d{14}$/);
  assert(Array.isArray(savedLane.state.pendingWindows));

  const resumedWindows = [];
  await collectSearchNews({
    rootDir,
    reportDate: REPORT_DATE,
    generatedAt: GENERATED_AT,
    providers: ["gdelt"],
    queries: [{ id: "dense", query: "dense AI news" }],
    transportStatePath: statePath,
    transportRequestBudget: 10,
    fetchImpl: async (url) => {
      const requestUrl = new URL(String(url));
      resumedWindows.push([requestUrl.searchParams.get("startdatetime"), requestUrl.searchParams.get("enddatetime")]);
      return response(JSON.stringify({ articles: [] }), 200, "application/json");
    }
  });

  assert(resumedWindows.length >= 2);
  assert.notDeepEqual(resumedWindows[0], resumedWindows[1]);
  assert.deepEqual(JSON.parse(await fs.readFile(statePath, "utf8")).lanes, {});
});

test("OpenAlex search removes the report-date floor and exhausts cursor pagination", async () => {
  const cursors = [];
  const result = await collectSearchNews({
    reportDate: REPORT_DATE,
    generatedAt: GENERATED_AT,
    providers: ["openalex"],
    queries: [{ id: "history", query: "AI history", providers: ["openalex"] }],
    transportPageSize: 2,
    fetchImpl: async (url) => {
      const requestUrl = new URL(String(url));
      assert.equal(requestUrl.searchParams.has("filter"), false);
      const cursor = requestUrl.searchParams.get("cursor");
      cursors.push(cursor);
      if (cursor === "*") {
        return response(JSON.stringify({
          results: [
            { id: "https://openalex.org/W1", title: "Older work", publication_date: "2020-01-01" },
            { id: "https://openalex.org/W2", title: "Recent work", publication_date: "2026-07-14" }
          ],
          meta: { next_cursor: "cursor-2" }
        }), 200, "application/json");
      }
      return response(JSON.stringify({ results: [], meta: { next_cursor: null } }), 200, "application/json");
    }
  });

  assert.deepEqual(cursors, ["*", "cursor-2"]);
  assert.equal(result.candidates.length, 2);
  assert.equal(result.candidates[0].event_date, "2020-01-01");
  assert.deepEqual(new Set(result.candidates.map((item) => item.source_group)), new Set(["papers_models"]));
  assert.equal(result.source_audit.search_sources.sources[0].transport_status, "complete");
});

test("academic search providers only receive queries that explicitly name them", async () => {
  const requestedHosts = [];
  const result = await collectSearchNews({
    reportDate: REPORT_DATE,
    generatedAt: GENERATED_AT,
    providers: ["gdelt", "openalex", "arxiv"],
    queries: [{ id: "general", query: "general AI news" }],
    providerThrottleMs: 0,
    fetchImpl: async (url) => {
      requestedHosts.push(new URL(String(url)).hostname);
      return response(JSON.stringify({ articles: [{ title: "General news", url: "https://example.com/general" }] }), 200, "application/json");
    }
  });

  assert.deepEqual(requestedHosts, ["api.gdeltproject.org"]);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].source_group, "news_newsletters");
  assert.equal(result.source_audit.search_sources.provider_cost_units.openalex, 0);
  assert.equal(result.source_audit.search_sources.provider_cost_units.arxiv, 0);
});

test("search pagination uses one global budget, persists atomic redacted lanes, and consumes them next run", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "adc-search-checkpoint-"));
  const statePath = path.join(rootDir, "pagination.json");
  const queries = [
    { id: "one", query: "query one", providers: ["openalex"] },
    { id: "two", query: "query two", providers: ["openalex"] }
  ];
  const firstRunRequests = [];
  const firstRun = await collectSearchNews({
    rootDir,
    reportDate: REPORT_DATE,
    generatedAt: GENERATED_AT,
    providers: ["openalex"],
    queries,
    transportPageSize: 1,
    transportStatePath: statePath,
    transportRequestBudget: 3,
    queryConcurrency: 2,
    fetchImpl: async (url) => {
      const requestUrl = new URL(String(url));
      const query = requestUrl.searchParams.get("search");
      const cursor = requestUrl.searchParams.get("cursor");
      firstRunRequests.push({ query, cursor });
      const suffix = query.endsWith("one") ? "one" : "two";
      if (cursor === "*") {
        return response(JSON.stringify({
          results: [{ id: `https://openalex.org/${suffix}-first`, title: `${suffix} first` }],
          meta: { next_cursor: `${suffix}-2` }
        }), 200, "application/json");
      }
      return response(JSON.stringify({
        results: [{ id: `https://openalex.org/${cursor}`, title: cursor }],
        meta: { next_cursor: `${suffix}-3` }
      }), 200, "application/json");
    }
  });

  assert.equal(firstRun.source_audit.search_sources.transport_budget.requests_used, 3);
  assert.deepEqual(firstRunRequests.slice(0, 2).map((item) => item.cursor), ["*", "*"]);
  assert.notEqual(firstRunRequests[2].cursor, "*");
  const checkpointText = await fs.readFile(statePath, "utf8");
  const checkpoint = JSON.parse(checkpointText);
  assert.equal(Object.keys(checkpoint.lanes).length, 2);
  assert.equal(checkpointText.includes("api_key"), false);
  assert.equal(checkpointText.includes("test-token"), false);
  const siblingFiles = await fs.readdir(rootDir);
  assert.deepEqual(siblingFiles, ["pagination.json"]);

  const resumedCursors = [];
  await collectSearchNews({
    rootDir,
    reportDate: REPORT_DATE,
    generatedAt: GENERATED_AT,
    providers: ["openalex"],
    queries,
    transportPageSize: 1,
    transportStatePath: statePath,
    transportRequestBudget: 10,
    queryConcurrency: 2,
    fetchImpl: async (url) => {
      const requestUrl = new URL(String(url));
      const cursor = requestUrl.searchParams.get("cursor");
      resumedCursors.push(cursor);
      if (cursor === "*") return response(JSON.stringify({ results: [], meta: { next_cursor: null } }), 200, "application/json");
      return response(JSON.stringify({ results: [], meta: { next_cursor: null } }), 200, "application/json");
    }
  });

  assert.deepEqual(resumedCursors.slice(0, 2), ["*", "*"]);
  assert(resumedCursors.slice(2).some((cursor) => cursor !== "*"));
  assert.deepEqual(JSON.parse(await fs.readFile(statePath, "utf8")).lanes, {});
});

test("GitHub report parser does not silently truncate the listener at 30 links", () => {
  const markdown = Array.from({ length: 35 }, (_, index) =>
    `- [Signal ${index + 1}](https://example.com/signals/${index + 1}) — useful source`
  ).join("\n");
  const entries = parseGitHubReportMarkdownEntries(markdown, {
    id: "listener-report",
    name: "Listener report",
    url: "https://raw.githubusercontent.com/example/listener/main/README.md",
    report_url: "https://github.com/example/listener",
    fallback_event_date: REPORT_DATE
  });

  assert.equal(entries.length, 35);
});

test("GitHub report parser retains distinct rows that point to the same URL", () => {
  const markdown = [
    "- [First observation](https://example.com/shared) first context",
    "- [Second observation](https://example.com/shared) second context",
    "- [First observation](https://example.com/shared) first context"
  ].join("\n");
  const entries = parseGitHubReportMarkdownEntries(markdown, {
    id: "listener-report",
    name: "Listener report",
    url: "https://raw.githubusercontent.com/example/listener/main/README.md",
    report_url: "https://github.com/example/listener",
    fallback_event_date: REPORT_DATE
  });

  assert.equal(entries.length, 3);
  assert.equal(new Set(entries.map((entry) => entry.url)).size, 1);
  assert.equal(entries[0].observation_id, entries[2].observation_id);
  assert.notEqual(entries[0].observation_id, entries[1].observation_id);
});

test("GitHub report parser treats safe issue and boilerplate-labelled links as observations", () => {
  const markdown = [
    "- [Issue](https://github.com/example/listener/issues/123) user discussion",
    "- [Code](https://github.com/example/listener) repository link",
    "- [README](https://github.com/example/listener/blob/main/README.md) source document"
  ].join("\n");
  const entries = parseGitHubReportMarkdownEntries(markdown, {
    id: "listener-report",
    name: "Listener report",
    url: "https://raw.githubusercontent.com/example/listener/main/REPORT.md",
    report_url: "https://github.com/example/listener",
    fallback_event_date: REPORT_DATE
  });

  assert.equal(entries.length, 3);
  assert(entries.some((entry) => entry.url === "https://github.com/example/listener/issues/123"));
  assert(entries.some((entry) => entry.title === "Code"));
  assert(entries.some((entry) => entry.title === "README"));
});

test("RSS native GUIDs preserve same-URL observations and exact duplicates coalesce in the occurrence store", async () => {
  const source = contentSource("guid-observations");
  const feed = `<?xml version="1.0"?><rss version="2.0"><channel>
    <item><guid>guid-a</guid><title>First observation</title><link>https://example.com/shared</link><pubDate>Tue, 14 Jul 2026 07:00:00 GMT</pubDate></item>
    <item><guid>guid-b</guid><title>Second observation</title><link>https://example.com/shared</link><pubDate>Tue, 14 Jul 2026 07:00:00 GMT</pubDate></item>
    <item><guid>guid-a</guid><title>First observation</title><link>https://example.com/shared</link><pubDate>Tue, 14 Jul 2026 07:00:00 GMT</pubDate></item>
  </channel></rss>`;
  const result = await collectContentSources({
    reportDate: REPORT_DATE,
    generatedAt: GENERATED_AT,
    sources: [source],
    includeWeChatInput: false,
    cacheFallback: false,
    fetchImpl: async () => response(feed)
  });
  const merged = mergeDiscoveryPayloads([result], { reportDate: REPORT_DATE, generatedAt: GENERATED_AT });
  const store = buildOccurrenceStore({
    reportDate: REPORT_DATE,
    generatedAt: GENERATED_AT,
    sources: merged.sources,
    candidates: merged.occurrenceCandidates
  });

  assert.equal(result.candidates.length, 3);
  assert.equal(store.occurrence_count, 2);
  assert.equal(new Set(store.occurrences.map((item) => item.cluster_id)).size, 1);
  assert.deepEqual(store.occurrences.map((item) => item.raw_record_count).sort((a, b) => a - b), [1, 2]);
});

test("HTML index retains duplicate URLs as row observations and allows titleless safe links", async () => {
  const source = {
    ...contentSource("html-rows"),
    source_kind: "html_index",
    format: "html_index",
    linkPattern: "/news/",
    url: "https://example.com/news/"
  };
  const html = [
    '<article><a href="/news/shared">First row</a></article>',
    '<article><a href="/news/shared">Second row</a></article>',
    '<article><a href="/news/titleless"><span aria-hidden="true"></span></a></article>'
  ].join("");
  const result = await collectContentSources({
    reportDate: REPORT_DATE,
    generatedAt: GENERATED_AT,
    sources: [source],
    includeWeChatInput: false,
    cacheFallback: false,
    fetchImpl: async () => response(html, 200, "text/html")
  });

  assert.equal(result.candidates.length, 3);
  assert.equal(result.candidates.filter((item) => item.url === "https://example.com/news/shared").length, 2);
  assert.equal(result.candidates.find((item) => item.url.endsWith("/titleless")).title, "");
});

test("generic JSON listener preserves no-id same-URL rows and coalesces exact duplicate rows", async () => {
  const source = {
    ...contentSource("json-rows"),
    source_kind: "search_api",
    format: "json",
    url: "https://api.example.com/articles.json"
  };
  const rows = [
    { title: "First JSON row", url: "https://example.com/shared-json", summary: "first context", date: REPORT_DATE },
    { title: "Second JSON row", url: "https://example.com/shared-json", summary: "second context", date: REPORT_DATE },
    { title: "First JSON row", url: "https://example.com/shared-json", summary: "first context", date: REPORT_DATE }
  ];
  const result = await collectContentSources({
    reportDate: REPORT_DATE,
    generatedAt: GENERATED_AT,
    sources: [source],
    includeWeChatInput: false,
    cacheFallback: false,
    fetchImpl: async () => response(JSON.stringify(rows), 200, "application/json")
  });
  const merged = mergeDiscoveryPayloads([result], { reportDate: REPORT_DATE, generatedAt: GENERATED_AT });
  const store = buildOccurrenceStore({
    reportDate: REPORT_DATE,
    generatedAt: GENERATED_AT,
    sources: merged.sources,
    candidates: merged.occurrenceCandidates
  });

  assert.equal(result.candidates.length, 3);
  assert.equal(store.occurrence_count, 2);
  assert.deepEqual(store.occurrences.map((item) => item.raw_record_count).sort((a, b) => a - b), [1, 2]);
});

test("collector source group wins over the linked material host", async () => {
  const source = {
    ...contentSource("hn"),
    name: "Hacker News discussion",
    url: "https://hnrss.org/newest?q=AI",
    source_group: "community_discussions",
    authority: "community"
  };
  const result = await collectContentSources({
    reportDate: REPORT_DATE,
    generatedAt: GENERATED_AT,
    sources: [source],
    includeWeChatInput: false,
    cacheFallback: false,
    fetchImpl: async () => response(rssFeed("hn", 1, { itemBaseUrl: "https://openai.com/news" }))
  });
  const merged = mergeDiscoveryPayloads([result], { reportDate: REPORT_DATE, generatedAt: GENERATED_AT });
  const store = buildOccurrenceStore({
    reportDate: REPORT_DATE,
    generatedAt: GENERATED_AT,
    sources: merged.sources,
    candidates: merged.occurrenceCandidates
  });
  const projected = projectOccurrenceStore(store);

  assert.equal(projected.occurrences.length, 1);
  assert.equal(projected.occurrences[0].source_group, "community_discussions");
});

test("registry source_group, content_tags, and credibility_tag pass through candidate to occurrence raw metadata", async () => {
  const source = {
    ...contentSource("credibility"),
    source_group: "news_newsletters",
    credibility_tag: "monitoring_lead",
    content_tags: ["industry_news", "engineering"]
  };
  delete source.source_level;
  const result = await collectContentSources({
    reportDate: REPORT_DATE,
    generatedAt: GENERATED_AT,
    sources: [source],
    includeWeChatInput: false,
    cacheFallback: false,
    fetchImpl: async () => response(rssFeed("credibility", 1))
  });
  const merged = mergeDiscoveryPayloads([result], { reportDate: REPORT_DATE, generatedAt: GENERATED_AT });
  const store = buildOccurrenceStore({
    reportDate: REPORT_DATE,
    generatedAt: GENERATED_AT,
    sources: merged.sources,
    candidates: merged.occurrenceCandidates
  });

  assert.equal(result.candidates[0].credibility_tag, "monitoring_lead");
  assert.deepEqual(result.candidates[0].content_tags, ["industry_news", "engineering"]);
  assert.equal(store.occurrences[0].raw_credibility_tag, "monitoring_lead");
  assert.equal(store.occurrences[0].raw_source_group, "news_newsletters");
  assert.equal(store.occurrences[0].raw_source_level, null);
});

test("source registry retains distinct source identities that share one physical endpoint", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "adc-source-registry-"));
  const sourcesPath = path.join(rootDir, "sources.json");
  await fs.writeFile(sourcesPath, JSON.stringify({
    schema_version: 1,
    sources: [
      registrySource("one", "https://example.com/feed"),
      registrySource("two", "https://EXAMPLE.com/feed/")
    ]
  }), "utf8");

  const registry = await validateSourceRegistryPath({ rootDir, sourcesPath });
  assert.equal(registry.sources.length, 2);
  assert.deepEqual(registry.sources.map((source) => source.id), ["one", "two"]);
});

test("source registry rejects retired listener gates but permits manual as metadata", () => {
  const base = registrySource("listener", "https://example.com/listener.xml");
  const retiredConfigurations = [
    { max_items_per_run: 1 },
    { maxItemsPerRun: 1 },
    { per_source_limit: 1 },
    { lookback_days: 2 },
    { lookbackDays: 2 },
    { kill_switch: true },
    { enablement: "manual" },
    { tier: "T2" },
    { authority: "secondary" },
    { verification_policy: "community_only" },
    { source_level: "community" }
  ];

  for (const retired of retiredConfigurations) {
    assert.throws(
      () => normalizeSourceRegistry({
        schema_version: 1,
        sources: [{ ...base, ...retired }]
      }),
      (error) => error?.code === "source_registry_schema_validation_failed",
      `retired listener gate must be rejected: ${JSON.stringify(retired)}`
    );
  }

  const registry = normalizeSourceRegistry({
    schema_version: 1,
    sources: [{ ...base, source_kind: "manual", tags: ["manual", "watch"] }]
  });
  assert.equal(registry.sources[0].source_kind, "manual");
  assert.deepEqual(registry.sources[0].tags, ["manual", "watch"]);
});

test("content listener loads every registry source even when a legacy enablement option is supplied", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "adc-listener-enablement-"));
  const sourcesPath = path.join(rootDir, "sources.json");
  const optionalSource = registrySource("optional-listener", "https://feeds.example.com/optional-listener.xml");
  await fs.writeFile(sourcesPath, JSON.stringify({ schema_version: 1, sources: [optionalSource] }), "utf8");

  const result = await collectContentSources({
    rootDir,
    registryPath: "sources.json",
    enablement: "core",
    reportDate: REPORT_DATE,
    generatedAt: GENERATED_AT,
    includeWeChatInput: false,
    cacheFallback: false,
    fetchImpl: async () => response(rssFeed("optional", 1))
  });

  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].source_id, "optional-listener");
});

test("content listener retains old and undated entries instead of using recency as admission", async () => {
  const source = contentSource("archive");
  const feed = `<?xml version="1.0"?><rss version="2.0"><channel>
    <item><title>old signal</title><link>https://example.com/old</link><pubDate>Mon, 01 Jun 2026 07:00:00 GMT</pubDate></item>
    <item><title>observed signal</title><link>https://example.com/observed</link></item>
    <item><link>https://example.com/untitled</link></item>
  </channel></rss>`;
  const result = await collectContentSources({
    reportDate: REPORT_DATE,
    generatedAt: GENERATED_AT,
    sources: [source],
    includeWeChatInput: false,
    cacheFallback: false,
    fetchImpl: async () => response(feed)
  });

  assert.equal(result.candidates.length, 3);
  assert.deepEqual(result.candidates.map((item) => item.event_date), ["2026-06-01", REPORT_DATE, REPORT_DATE]);
  assert.equal(result.candidates[2].title, "");
});

test("legacy platform kill-switch metadata is annotated and never suppresses listener entries", async () => {
  const source = {
    ...contentSource("reddit-legacy"),
    url: "https://www.reddit.com/r/LocalLLaMA/.rss",
    candidate_category: "reddit_item",
    source_group: "community_discussions",
    authority: "community",
    verification_policy: "platform_signal_exempt",
    platform: "reddit",
    allowed_hosts: ["reddit.com"],
    include_keywords: ["ai"],
    public_disclosure_label: "Platform observation",
    kill_switch: true
  };
  const result = await collectContentSources({
    reportDate: REPORT_DATE,
    generatedAt: GENERATED_AT,
    sources: [source],
    includeWeChatInput: false,
    cacheFallback: false,
    fetchImpl: async () => response(rssFeed("AI", 1, {
      itemBaseUrl: "https://www.reddit.com/r/LocalLLaMA/comments"
    }))
  });

  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].status, "included");
  assert.match(result.source_audit.content_sources.sources[0].notes, /kill_switch_enabled=1/);
  assert.match(result.source_audit.content_sources.sources[0].notes, /listener_retained=true/);
});

test("dated changelog adapter emits entries from markdown date headings", async () => {
  const source = {
    ...contentSource("changelog"),
    source_kind: "dated_changelog",
    source_group: "official_blogs",
    authority: "primary",
    url: "https://docs.example.com/changelog.md"
  };
  const changelog = `# Changelog\n\n## July 14, 2026\n\n### Realtime API\nAdded a streaming capability.\n\n## July 10, 2026\n\n### Batch API\nImproved batch processing.`;
  const result = await collectContentSources({
    reportDate: REPORT_DATE,
    generatedAt: GENERATED_AT,
    sources: [source],
    includeWeChatInput: false,
    cacheFallback: false,
    fetchImpl: async () => response(changelog, 200, "text/markdown")
  });

  assert.equal(result.candidates.length, 2);
  assert.deepEqual(result.candidates.map((item) => item.event_date), ["2026-07-14", "2026-07-10"]);
  assert.match(result.candidates[0].title, /Realtime API/);
});

test("Hugging Face Hub trending adapter retains every artifact row and license tag", async () => {
  const source = {
    ...contentSource("hf-models"),
    source_kind: "huggingface_hub_trending_api",
    candidate_category: "huggingface_trending",
    source_group: "papers_models",
    url: "https://huggingface.co/api/models?sort=trendingScore&direction=-1&limit=20"
  };
  const payload = Array.from({ length: 4 }, (_, index) => ({
    id: `org/model-${index + 1}`,
    trendingScore: 10 - index,
    likes: index + 1,
    downloads: (index + 1) * 100,
    tags: ["transformers", "license:apache-2.0"],
    lastModified: "2026-07-14T06:00:00.000Z"
  }));
  const result = await collectContentSources({
    reportDate: REPORT_DATE,
    generatedAt: GENERATED_AT,
    sources: [source],
    includeWeChatInput: false,
    cacheFallback: false,
    fetchImpl: async () => response(JSON.stringify(payload), 200, "application/json")
  });

  assert.equal(result.candidates.length, 4);
  assert.equal(result.candidates[0].url, "https://huggingface.co/org/model-1");
  assert.match(result.candidates[0].evidence, /trending/i);
  assert(result.candidates[0].tags.includes("license:apache-2.0"));
});

test("arXiv content listeners exhaust max_results pages through one serial courtesy queue", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "adc-arxiv-content-"));
  const statePath = path.join(rootDir, "pagination.json");
  const sources = ["alpha", "beta"].map((name) => ({
    ...contentSource(`arxiv-${name}`),
    source_kind: "search_api",
    candidate_category: "research",
    source_group: "papers_models",
    url: `https://export.arxiv.org/api/query?search_query=all:${name}&start=0&max_results=20`
  }));
  const startsByQuery = new Map();
  let activeRequests = 0;
  let maxActiveRequests = 0;
  const result = await collectContentSources({
    rootDir,
    reportDate: REPORT_DATE,
    generatedAt: GENERATED_AT,
    sources,
    includeWeChatInput: false,
    cacheFallback: false,
    sourceConcurrency: 2,
    transportStatePath: statePath,
    transportRequestBudget: 10,
    providerThrottleMs: 0,
    fetchImpl: async (url) => {
      const requestUrl = new URL(String(url));
      const query = requestUrl.searchParams.get("search_query").split(":").at(-1);
      const start = Number(requestUrl.searchParams.get("start"));
      startsByQuery.set(query, [...(startsByQuery.get(query) || []), start]);
      activeRequests += 1;
      maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
      await new Promise((resolve) => setTimeout(resolve, 2));
      activeRequests -= 1;
      return response(arxivFeed(query, start, Math.min(20, 23 - start), 23), 200, "application/atom+xml");
    }
  });

  assert.equal(result.candidates.length, 46);
  assert.deepEqual(startsByQuery.get("alpha"), [0, 20]);
  assert.deepEqual(startsByQuery.get("beta"), [0, 20]);
  assert.equal(maxActiveRequests, 1);
  assert(result.source_audit.content_sources.sources.every((source) => source.pages_fetched === 2));
  assert(result.source_audit.content_sources.sources.every((source) => source.transport_status === "complete"));
  assert.deepEqual(JSON.parse(await fs.readFile(statePath, "utf8")).lanes, {});
});

test("content and search stages preserve each other's lanes in one atomic checkpoint namespace", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "adc-shared-checkpoint-"));
  const statePath = path.join(rootDir, "pagination.json");
  await fs.writeFile(statePath, JSON.stringify({
    schema_version: 1,
    lanes: {
      "foreign:serpapi": {
        provider: "serpapi",
        state: { nextUrl: "https://serpapi.com/search.json?q=ai&api_key=test-token&page=2" }
      }
    }
  }), "utf8");
  const source = {
    ...contentSource("arxiv-shared-state"),
    source_kind: "search_api",
    source_group: "papers_models",
    credibility_tag: "monitoring_lead",
    content_tags: ["research"],
    url: "https://export.arxiv.org/api/query?search_query=all:shared&start=0&max_results=20"
  };
  const arxivFetch = async (url) => {
    const start = Number(new URL(String(url)).searchParams.get("start"));
    return response(arxivFeed("shared", start, Math.min(20, 40 - start), 40), 200, "application/atom+xml");
  };

  await collectContentSources({
    rootDir,
    reportDate: REPORT_DATE,
    generatedAt: GENERATED_AT,
    sources: [source],
    includeWeChatInput: false,
    cacheFallback: false,
    transportStatePath: statePath,
    transportRequestBudget: 1,
    providerThrottleMs: 0,
    fetchImpl: arxivFetch
  });
  let checkpoint = JSON.parse(await fs.readFile(statePath, "utf8"));
  const contentLane = `content:arxiv:${source.id}`;
  assert.equal(checkpoint.lanes[contentLane].state.start, 20);
  assert.equal(JSON.stringify(checkpoint).includes("test-token"), false);
  assert.equal(checkpoint.lanes["foreign:serpapi"].state.nextUrl.includes("api_key"), false);

  await collectSearchNews({
    rootDir,
    reportDate: REPORT_DATE,
    generatedAt: GENERATED_AT,
    providers: ["openalex"],
    queries: [{ id: "shared", query: "shared state", providers: ["openalex"] }],
    transportStatePath: statePath,
    transportRequestBudget: 1,
    fetchImpl: async () => response(JSON.stringify({
      results: [{ id: "https://openalex.org/shared-1", title: "Shared state" }],
      meta: { next_cursor: "shared-2" }
    }), 200, "application/json")
  });
  checkpoint = JSON.parse(await fs.readFile(statePath, "utf8"));
  assert.equal(checkpoint.lanes[contentLane].state.start, 20);
  assert.equal(checkpoint.lanes["search:openalex:shared"].state.cursor, "shared-2");

  await collectContentSources({
    rootDir,
    reportDate: REPORT_DATE,
    generatedAt: GENERATED_AT,
    sources: [source],
    includeWeChatInput: false,
    cacheFallback: false,
    transportStatePath: statePath,
    transportRequestBudget: 2,
    providerThrottleMs: 0,
    fetchImpl: arxivFetch
  });
  checkpoint = JSON.parse(await fs.readFile(statePath, "utf8"));
  assert.equal(checkpoint.lanes[contentLane], undefined);
  assert.equal(checkpoint.lanes["search:openalex:shared"].state.cursor, "shared-2");
  assert.deepEqual((await fs.readdir(rootDir)).sort(), ["pagination.json"]);
});

test("public ranking adapters project every visible row instead of truncating to Top 10", async () => {
  const source = {
    ...contentSource("openrouter-ranking"),
    source_kind: "openrouter_rankings_public_playwright",
    candidate_category: "model_release",
    source_group: "papers_models",
    url: "https://openrouter.ai/rankings"
  };
  const rankingRows = Array.from({ length: 12 }, (_, index) => [
    `${index + 1}.`,
    `Model ${index + 1}`,
    "by",
    `Provider ${index + 1}`,
    `${1200 - index} tokens`,
    `+${index + 1}%`
  ].join("\n")).join("\n");
  const result = await collectContentSources({
    reportDate: REPORT_DATE,
    generatedAt: GENERATED_AT,
    sources: [source],
    includeWeChatInput: false,
    cacheFallback: false,
    openrouterRankingsText: `This Week\n${rankingRows}\nShow more`,
    fetchImpl: async () => response("", 500, "text/plain")
  });

  assert.equal(result.candidates.length, 12);
  assert.deepEqual(result.candidates.map((item) => item.rank), Array.from({ length: 12 }, (_, index) => index + 1));
});

test("general Hacker News stories adapter retains item placeholders when hydration is partial", async () => {
  const source = {
    ...contentSource("hn-show"),
    source_kind: "search_api",
    source_group: "community_discussions",
    url: "https://hacker-news.firebaseio.com/v0/showstories.json",
    fetch_page_size: 3
  };
  const result = await collectContentSources({
    reportDate: REPORT_DATE,
    generatedAt: GENERATED_AT,
    sources: [source],
    includeWeChatInput: false,
    cacheFallback: false,
    fetchImpl: async (url) => {
      if (String(url).endsWith("showstories.json")) return response("[101,102,103]", 200, "application/json");
      if (String(url).includes("/item/101.json")) {
        return response(JSON.stringify({ id: 101, title: "Show HN: Listener", url: "https://example.com/listener", time: 1784012400 }), 200, "application/json");
      }
      return response(JSON.stringify({ message: "temporary failure" }), 503, "application/json");
    }
  });

  assert.equal(result.candidates.length, 3);
  assert.equal(result.candidates[0].title, "Show HN: Listener");
  assert.match(result.candidates[1].title, /Hacker News item 102/);
  assert.equal(result.candidates[1].url, "https://news.ycombinator.com/item?id=102");
  const audit = result.source_audit.content_sources.sources[0];
  assert.equal(audit.transport_status, "degraded");
  assert.equal(audit.hydration_failure_count, 2);
});

test("Hacker News story-list listener hydrates the full returned ID list without a fixed 50-item slice", async () => {
  const source = {
    ...contentSource("hn-full"),
    source_kind: "search_api",
    url: "https://hacker-news.firebaseio.com/v0/topstories.json",
    fetch_page_size: 1
  };
  const ids = Array.from({ length: 55 }, (_, index) => index + 1);
  const result = await collectContentSources({
    reportDate: REPORT_DATE,
    generatedAt: GENERATED_AT,
    sources: [source],
    includeWeChatInput: false,
    cacheFallback: false,
    fetchImpl: async (url) => {
      if (String(url).endsWith("topstories.json")) return response(JSON.stringify(ids), 200, "application/json");
      const id = Number(String(url).match(/\/item\/(\d+)\.json/)?.[1]);
      return response(JSON.stringify({ id, title: `HN ${id}`, url: `https://example.com/hn/${id}`, time: 1784012400 }), 200, "application/json");
    }
  });

  assert.equal(result.candidates.length, 55);
  assert.equal(result.source_audit.content_sources.sources[0].transport_status, "complete");
});

test("Source Watch follows GitHub Link pages and emits one stable observation per fetched event", async () => {
  const repo = "example/listener";
  const apiBase = `https://api.github.com/repos/${repo}`;
  const result = await collectSourceWatch({
    reportDate: REPORT_DATE,
    generatedAt: GENERATED_AT,
    targets: [{ id: "watch-listener", type: "github_repo", repo }],
    endpointLimit: 1,
    fetchRetries: 0,
    fetchImpl: async (url) => {
      const value = String(url);
      if (value === apiBase) {
        return response(JSON.stringify({
          full_name: repo,
          html_url: `https://github.com/${repo}`,
          stargazers_count: 10,
          forks_count: 2,
          pushed_at: "2026-07-14T06:00:00Z"
        }), 200, "application/json");
      }
      for (const endpoint of ["releases", "tags", "commits"]) {
        const firstUrl = `${apiBase}/${endpoint}?per_page=1`;
        const secondUrl = `${firstUrl}&page=2`;
        const requestUrl = new URL(value);
        if (requestUrl.pathname === `/repos/${repo}/${endpoint}` && requestUrl.searchParams.get("per_page") === "1") {
          const page = Number(requestUrl.searchParams.get("page") || 1);
          const body = endpoint === "releases"
            ? [{ id: page, tag_name: `v${page}`, name: `Release ${page}`, html_url: `https://github.com/${repo}/releases/tag/v${page}`, published_at: `2026-07-1${5 - page}T06:00:00Z` }]
            : endpoint === "tags"
              ? [{ name: `v${page}`, commit: { sha: `tag-sha-${page}` } }]
              : [{ sha: `commit-sha-${page}`, html_url: `https://github.com/${repo}/commit/commit-sha-${page}`, commit: { message: `Commit ${page}`, author: { date: `2026-07-1${5 - page}T05:00:00Z`, name: "Builder" } } }];
          return response(JSON.stringify(body), 200, "application/json", page === 1 ? {
            link: `<${secondUrl}>; rel="next"`
          } : {});
        }
      }
      if (value === `${apiBase}/readme`) return response("{}", 404, "application/json");
      return response("{}", 404, "application/json");
    }
  });

  assert.equal(result.targets[0].releases.length, 2);
  assert.equal(result.targets[0].tags.length, 2);
  assert.equal(result.targets[0].recent_commits.length, 2);
  assert.equal(result.candidates.length, 7);
  assert.equal(new Set(result.candidates.map((item) => item.observation_id)).size, 7);
  assert.deepEqual(result.candidates.slice(1).map((item) => item.notes.match(/event_kind=([^;]+)/)?.[1]).sort(), ["commit", "commit", "release", "release", "tag", "tag"]);
  const audit = result.source_audit.github_watch.sources[0];
  assert.equal(audit.pages_fetched, 6);
  assert.equal(audit.transport_status, "complete");
  assert.equal(audit.parsed_count, 7);
  const validation = validateCandidatePool({
    schema_version: 1,
    report_date: REPORT_DATE,
    generated_at: GENERATED_AT,
    sources: result.sources,
    candidates: result.candidates
  });
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
});

test("Source Watch persists a Link continuation under the shared budget and consumes it next run", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "adc-source-watch-state-"));
  const statePath = path.join(rootDir, "pagination.json");
  const repo = "example/resumable";
  const apiBase = `https://api.github.com/repos/${repo}`;
  const releasesUrl = `${apiBase}/releases?per_page=1`;
  const releasePage2 = `${releasesUrl}&page=2`;
  let phase = 1;
  const fetchImpl = async (url) => {
    const value = String(url);
    const requestUrl = new URL(value);
    if (value === apiBase) return response(JSON.stringify({ full_name: repo, html_url: `https://github.com/${repo}` }), 200, "application/json");
    if (requestUrl.pathname === `/repos/${repo}/releases` && !requestUrl.searchParams.has("page")) {
      return phase === 1
        ? response(JSON.stringify([{ id: 1, tag_name: "v1", html_url: `https://github.com/${repo}/releases/tag/v1` }]), 200, "application/json", { link: `<${releasePage2}>; rel="next"` })
        : response("[]", 200, "application/json");
    }
    if (requestUrl.pathname === `/repos/${repo}/releases` && requestUrl.searchParams.get("page") === "2") return response(JSON.stringify([{ id: 2, tag_name: "v2", html_url: `https://github.com/${repo}/releases/tag/v2` }]), 200, "application/json");
    if (value.startsWith(`${apiBase}/tags?`) || value.startsWith(`${apiBase}/commits?`)) return response("[]", 200, "application/json");
    if (value === `${apiBase}/readme`) return response("{}", 404, "application/json");
    return response("{}", 404, "application/json");
  };

  const firstRun = await collectSourceWatch({
    rootDir,
    reportDate: REPORT_DATE,
    generatedAt: GENERATED_AT,
    targets: [{ id: "watch-resumable", type: "github_repo", repo }],
    endpointLimit: 1,
    transportStatePath: statePath,
    transportRequestBudget: 2,
    fetchRetries: 0,
    fetchImpl
  });
  const laneKey = "source-watch:github:watch-resumable:releases";
  assert.equal(firstRun.targets[0].releases.length, 1);
  assert.match(firstRun.source_audit.github_watch.sources[0].transport_limitation, /runtime_request_budget_exhausted/);
  const continuationUrl = new URL(JSON.parse(await fs.readFile(statePath, "utf8")).lanes[laneKey].state.nextUrl);
  assert.equal(continuationUrl.pathname, `/repos/${repo}/releases`);
  assert.equal(continuationUrl.searchParams.get("page"), "2");
  assert.equal(continuationUrl.searchParams.get("per_page"), "1");

  phase = 2;
  const secondRun = await collectSourceWatch({
    rootDir,
    reportDate: REPORT_DATE,
    generatedAt: GENERATED_AT,
    targets: [{ id: "watch-resumable", type: "github_repo", repo }],
    endpointLimit: 1,
    transportStatePath: statePath,
    transportRequestBudget: 10,
    fetchRetries: 0,
    fetchImpl
  });
  assert(secondRun.candidates.some((candidate) => candidate.title.includes("v2")));
  assert.equal(JSON.parse(await fs.readFile(statePath, "utf8")).lanes[laneKey], undefined);
});

test("Source Watch preserves repository observation when one material endpoint is unavailable", async () => {
  const repoPayload = {
    full_name: "example/listener",
    html_url: "https://github.com/example/listener",
    stargazers_count: 10,
    forks_count: 2,
    pushed_at: "2026-07-14T06:00:00Z"
  };
  const result = await collectSourceWatch({
    reportDate: REPORT_DATE,
    generatedAt: GENERATED_AT,
    targets: [{ id: "watch-listener", type: "github_repo", repo: "example/listener" }],
    fetchRetries: 0,
    fetchImpl: async (url) => {
      const value = String(url);
      if (value === "https://api.github.com/repos/example/listener") return response(JSON.stringify(repoPayload), 200, "application/json");
      if (value.includes("/commits?")) return response("{}", 503, "application/json");
      if (value.endsWith("/readme")) return response("{}", 404, "application/json");
      return response("[]", 200, "application/json");
    }
  });

  assert.equal(result.targets[0].status, "blocked");
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].source_id, "watch-listener");
  assert.equal(result.candidates[0].verification_status, "unverified");
});

function contentSource(id) {
  return {
    id: `content-${id}`,
    name: `Content ${id}`,
    url: `https://feeds.example.com/${id}.xml`,
    source_kind: "rss",
    candidate_category: "community_lead",
    source_group: "news_newsletters",
    credibility_tag: "community_lead",
    content_tags: ["community_discussion"],
    timeout_ms: 15000
  };
}

function builderSource(id) {
  return {
    id: `builder-${id}`,
    name: `Builder ${id}`,
    author: `Builder ${id}`,
    url: `https://builders.example.com/${id}.xml`
  };
}

function registrySource(id, url) {
  return {
    id,
    name: id,
    url,
    source_kind: "rss",
    candidate_category: "community_lead",
    source_group: "news_newsletters",
    credibility_tag: "community_lead",
    content_tags: ["community_discussion"]
  };
}

function rssFeed(prefix, count, options = {}) {
  const itemBaseUrl = options.itemBaseUrl || "https://example.com/items";
  const items = Array.from({ length: count }, (_, index) => `
    <item>
      <title>${prefix} signal ${index + 1}</title>
      <link>${itemBaseUrl}/${prefix}-${index + 1}</link>
      <pubDate>Tue, 14 Jul 2026 07:0${index}:00 GMT</pubDate>
      <description>${prefix} summary ${index + 1}</description>
    </item>`).join("");
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>${prefix}</title>${items}</channel></rss>`;
}

function arxivFeed(prefix, start, count, total) {
  const entries = Array.from({ length: count }, (_, index) => {
    const number = start + index + 1;
    return `<entry>
      <id>https://arxiv.org/abs/${prefix}.${number}</id>
      <title>${prefix} paper ${number}</title>
      <published>2026-07-14T07:00:00Z</published>
      <summary>${prefix} summary ${number}</summary>
      <link href="https://arxiv.org/abs/${prefix}.${number}" rel="alternate" />
    </entry>`;
  }).join("");
  return `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom" xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/"><opensearch:totalResults>${total}</opensearch:totalResults>${entries}</feed>`;
}

function response(body, status = 200, contentType = "application/rss+xml", headers = {}) {
  return new Response(body, { status, headers: { "content-type": contentType, ...headers } });
}
