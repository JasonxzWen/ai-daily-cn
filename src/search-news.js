import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  createDiscoveryFetch,
  formatDiscoveryErrorNote,
  loadSharedTransportCheckpoint,
  sanitizeSharedPaginationState,
  writeSharedTransportCheckpoint
} from "./discovery.js";
import { sanitizePublicHttpUrl } from "./public-url.js";
import { isValidDateString } from "./time.js";
import { transportCompletenessTags } from "./public-signal-lanes.js";

const DEFAULT_PROVIDERS = ["gdelt", "openalex", "arxiv"];
const ACADEMIC_PROVIDERS = new Set(["openalex", "arxiv", "semantic_scholar"]);
const DEFAULT_TRANSPORT_REQUEST_BUDGET = 120;
const DEFAULT_TRANSPORT_RUNTIME_MS = 180000;
const PROVIDERS = {
  gdelt: {
    label: "GDELT",
    keyEnv: "",
    transportLimitation: "provider_has_no_reliable_exhaustive_pagination",
    buildUrl(query, options, _apiKey, state = {}) {
      const url = new URL("https://api.gdeltproject.org/api/v2/doc/doc");
      const window = gdeltWindowForState(options.reportDate, state);
      url.searchParams.set("query", query.query);
      url.searchParams.set("mode", "ArtList");
      url.searchParams.set("format", "json");
      url.searchParams.set("maxrecords", "250");
      url.searchParams.set("sort", "HybridRel");
      url.searchParams.set("startdatetime", window.start);
      url.searchParams.set("enddatetime", window.end);
      return url.toString();
    },
    parse(payload) {
      return arrayFrom(payload?.articles).map((item) => ({
        title: item.title,
        url: item.url,
        event_date: dateOnly(item.seendate || item.datetime || item.date),
        summary: item.sourceCountry ? `GDELT article from ${item.sourceCountry}.` : "GDELT article hit."
      }));
    },
    nextPage({ pageHits, state, options }) {
      return gdeltNextWindow({ pageHits, state, reportDate: options.reportDate });
    }
  },
  openalex: {
    label: "OpenAlex",
    keyEnv: "",
    buildUrl(query, options, _apiKey, state = {}) {
      const url = new URL("https://api.openalex.org/works");
      url.searchParams.set("search", query.query);
      url.searchParams.set("per-page", String(options.transportPageSize));
      url.searchParams.set("cursor", state.cursor || "*");
      return url.toString();
    },
    parse(payload) {
      return arrayFrom(payload?.results).map((item) => ({
        native_id: item.id,
        title: item.title || item.display_name,
        url: item.primary_location?.landing_page_url || item.doi || item.id,
        event_date: dateOnly(item.publication_date || item.created_date),
        summary: firstString(item.primary_location?.source?.display_name, item.type, "OpenAlex work hit.")
      }));
    },
    nextPage({ payload, pageHits }) {
      const cursor = firstString(payload?.meta?.next_cursor);
      return cursor && pageHits.length > 0 ? { state: { cursor } } : { done: true };
    }
  },
  arxiv: {
    label: "arXiv",
    keyEnv: "",
    buildUrl(query, options, _apiKey, state = {}) {
      const url = new URL("https://export.arxiv.org/api/query");
      url.searchParams.set("search_query", `all:${query.query}`);
      url.searchParams.set("start", String(state.start || 0));
      url.searchParams.set("max_results", String(options.transportPageSize));
      url.searchParams.set("sortBy", "submittedDate");
      url.searchParams.set("sortOrder", "descending");
      return url.toString();
    },
    parseText(xml) {
      return matchXmlBlocks(xml, "entry").map((block) => ({
        native_id: xmlText(block, "id"),
        title: xmlText(block, "title"),
        url: atomLink(block) || xmlText(block, "id"),
        event_date: dateOnly(xmlText(block, "published") || xmlText(block, "updated")),
        summary: cleanText(xmlText(block, "summary"))
      }));
    },
    nextPage({ text, pageHits, state, options }) {
      const start = Number(state.start || 0);
      const totalRaw = xmlText(text, "totalResults");
      const total = totalRaw ? Number(totalRaw) : Number.NaN;
      const nextStart = start + pageHits.length;
      if (pageHits.length === 0 || (Number.isFinite(total) && nextStart >= total)) return { done: true };
      if (!Number.isFinite(total) && pageHits.length < options.transportPageSize) return { done: true };
      return { state: { start: nextStart } };
    }
  },
  brave: {
    label: "Brave Search",
    keyEnv: "BRAVE_SEARCH_API_KEY",
    transportLimitation: "provider_result_window_has_no_exhaustive_cursor",
    buildUrl(query, options) {
      const url = new URL("https://api.search.brave.com/res/v1/web/search");
      url.searchParams.set("q", query.query);
      url.searchParams.set("count", String(options.transportPageSize));
      return url.toString();
    },
    headers(apiKey) {
      return { "X-Subscription-Token": apiKey };
    },
    parse(payload) {
      return arrayFrom(payload?.web?.results).map((item) => ({
        title: item.title,
        url: item.url,
        event_date: "",
        summary: item.description
      }));
    }
  },
  tavily: {
    label: "Tavily",
    keyEnv: "TAVILY_API_KEY",
    transportLimitation: "provider_has_no_pagination",
    buildRequest(query, options, apiKey) {
      return {
        url: "https://api.tavily.com/search",
        init: {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            api_key: apiKey,
            query: query.query,
            max_results: options.transportPageSize,
            include_answer: false
          })
        }
      };
    },
    parse(payload) {
      return arrayFrom(payload?.results).map((item) => ({
        native_id: item.id,
        title: item.title,
        url: item.url,
        event_date: "",
        summary: item.content
      }));
    }
  },
  exa: {
    label: "Exa",
    keyEnv: "EXA_API_KEY",
    transportLimitation: "provider_search_endpoint_has_no_exhaustive_cursor",
    buildRequest(query, options, apiKey) {
      return {
        url: "https://api.exa.ai/search",
        init: {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": apiKey
          },
          body: JSON.stringify({
            query: query.query,
            numResults: options.transportPageSize
          })
        }
      };
    },
    parse(payload) {
      return arrayFrom(payload?.results).map((item) => ({
        native_id: item.id,
        title: item.title,
        url: item.url,
        event_date: dateOnly(item.publishedDate),
        summary: item.text || item.summary
      }));
    }
  },
  serpapi: {
    label: "SerpAPI Google News",
    keyEnv: "SERPAPI_API_KEY",
    buildUrl(query, options, apiKey, state = {}) {
      if (state.nextUrl) {
        const next = new URL(state.nextUrl);
        next.searchParams.set("api_key", apiKey);
        return next.toString();
      }
      const url = new URL("https://serpapi.com/search.json");
      url.searchParams.set("engine", "google_news");
      url.searchParams.set("q", query.query);
      url.searchParams.set("num", String(options.transportPageSize));
      url.searchParams.set("api_key", apiKey);
      return url.toString();
    },
    parse(payload) {
      return arrayFrom(payload?.news_results).map((item) => ({
        title: item.title,
        url: item.link,
        event_date: dateOnly(item.date),
        summary: item.snippet || item.source
      }));
    },
    nextPage({ payload, pageHits }) {
      const rawNextUrl = firstString(payload?.serpapi_pagination?.next);
      if (!rawNextUrl || pageHits.length === 0) return { done: true };
      const nextUrl = safeProviderPaginationUrl(rawNextUrl, "https://serpapi.com");
      return nextUrl
        ? { state: { nextUrl } }
        : { done: true, limitation: "pagination_next_url_rejected" };
    }
  },
  semantic_scholar: {
    label: "Semantic Scholar",
    keyEnv: "SEMANTIC_SCHOLAR_API_KEY",
    buildUrl(query, options, _apiKey, state = {}) {
      const url = new URL("https://api.semanticscholar.org/graph/v1/paper/search");
      url.searchParams.set("query", query.query);
      url.searchParams.set("limit", String(options.transportPageSize));
      url.searchParams.set("offset", String(state.offset || 0));
      url.searchParams.set("fields", "title,url,abstract,year,publicationDate");
      return url.toString();
    },
    headers(apiKey) {
      return { "x-api-key": apiKey };
    },
    parse(payload) {
      return arrayFrom(payload?.data).map((item) => ({
        native_id: item.paperId,
        title: item.title,
        url: item.url,
        event_date: dateOnly(item.publicationDate || item.year),
        summary: item.abstract
      }));
    },
    nextPage({ payload, pageHits, state }) {
      const offset = Number(state.offset || 0);
      const nextOffset = offset + pageHits.length;
      const total = Number(payload?.total);
      if (pageHits.length === 0 || (Number.isFinite(total) && nextOffset >= total)) return { done: true };
      if (nextOffset >= 1000) {
        return { done: true, limitation: "provider_result_window_cap_1000" };
      }
      return { state: { offset: nextOffset } };
    }
  }
};

function gdeltWindowForState(reportDate, state = {}) {
  const dateToken = String(reportDate || "").replace(/-/g, "");
  return {
    start: validGdeltDatetime(state.windowStart) || `${dateToken}000000`,
    end: validGdeltDatetime(state.windowEnd) || `${dateToken}235959`
  };
}

function gdeltNextWindow({ pageHits, state = {}, reportDate }) {
  const current = gdeltWindowForState(reportDate, state);
  const pending = sanitizeGdeltPendingWindows(state.pendingWindows);
  if (pageHits.length >= 250) {
    const split = splitGdeltWindow(current);
    if (split) {
      return {
        state: gdeltWindowState(split[0], [split[1], ...pending]),
        limitation: "provider_has_no_reliable_exhaustive_pagination"
      };
    }
    const next = pending.shift();
    return next
      ? { state: gdeltWindowState(next, pending), limitation: "provider_slice_saturated_without_cursor" }
      : { done: true, limitation: "provider_slice_saturated_without_cursor" };
  }
  const next = pending.shift();
  return next
    ? { state: gdeltWindowState(next, pending), limitation: "provider_has_no_reliable_exhaustive_pagination" }
    : { done: true, limitation: "provider_has_no_reliable_exhaustive_pagination" };
}

function splitGdeltWindow(window) {
  const start = gdeltDatetimeToMs(window.start);
  const end = gdeltDatetimeToMs(window.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end - start < 1000) return null;
  const midpoint = Math.floor(((start + end) / 2) / 1000) * 1000;
  if (midpoint < start || midpoint >= end) return null;
  return [
    { start: gdeltMsToDatetime(start), end: gdeltMsToDatetime(midpoint) },
    { start: gdeltMsToDatetime(midpoint + 1000), end: gdeltMsToDatetime(end) }
  ];
}

function gdeltWindowState(window, pendingWindows) {
  return {
    windowStart: window.start,
    windowEnd: window.end,
    pendingWindows: sanitizeGdeltPendingWindows(pendingWindows)
  };
}

function sanitizeGdeltPendingWindows(value) {
  if (!Array.isArray(value)) return [];
  return value.map((window) => ({
    start: validGdeltDatetime(window?.start),
    end: validGdeltDatetime(window?.end)
  })).filter((window) => window.start && window.end && gdeltDatetimeToMs(window.start) <= gdeltDatetimeToMs(window.end));
}

function validGdeltDatetime(value) {
  const token = String(value || "");
  return /^\d{14}$/.test(token) && Number.isFinite(gdeltDatetimeToMs(token)) ? token : "";
}

function gdeltDatetimeToMs(value) {
  const token = String(value || "");
  if (!/^\d{14}$/.test(token)) return Number.NaN;
  return Date.UTC(
    Number(token.slice(0, 4)),
    Number(token.slice(4, 6)) - 1,
    Number(token.slice(6, 8)),
    Number(token.slice(8, 10)),
    Number(token.slice(10, 12)),
    Number(token.slice(12, 14))
  );
}

function gdeltMsToDatetime(value) {
  return new Date(value).toISOString().replace(/[-:T]/g, "").slice(0, 14);
}

export async function collectSearchNews(options = {}) {
  const reportDate = requireReportDate(options.reportDate);
  const generatedAt = options.generatedAt || new Date().toISOString();
  const fetchImpl = createDiscoveryFetch(options.fetchImpl || globalThis.fetch, options);
  if (typeof fetchImpl !== "function") {
    throw new Error("fetch is not available in this runtime");
  }

  const queries = await loadSearchQueries(options);
  const providers = normalizeProviders(options.providers);
  const transportPageSize = positiveInt(options.transportPageSize, 20);
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const transportStatePath = options.transportStatePath
    ? path.resolve(rootDir, options.transportStatePath)
    : "";
  const checkpoint = await loadSharedTransportCheckpoint(transportStatePath);
  const budget = createSearchTransportBudget({
    requestBudget: options.transportRequestBudget,
    runtimeMs: options.transportRuntimeMs
  });
  const sourceResults = [];
  const candidateSources = [];
  const candidates = [];
  const queryConcurrency = positiveInt(options.queryConcurrency || options["query-concurrency"], 4);
  const providerRuntimeMs = {};
  const providerCostUnits = {};
  const providerErrorCounts = {};
  const providerTransportStatus = {};
  const providerTransportLimitations = {};
  const providerPagesFetched = {};
  const contexts = [];

  for (const providerName of providers) {
    const providerStartedAt = Date.now();
    const provider = PROVIDERS[providerName];
    if (!provider) {
      sourceResults.push(auditSource(`unknown:${providerName}`, "", "blocked", "unknown_provider"));
      providerRuntimeMs[providerName] = Date.now() - providerStartedAt;
      providerCostUnits[providerName] = 0;
      providerErrorCounts[providerName] = 1;
      continue;
    }

    const sourceId = `search-${providerName}`;
    candidateSources.push({
      id: sourceId,
      name: provider.label,
      url: providerBaseUrl(providerName),
      category: "community",
      source_group: providerSourceGroup(providerName),
      status: "blocked",
      checked_at: generatedAt,
      notes: ""
    });

    const apiKey = provider.keyEnv ? process.env[provider.keyEnv] : "";
    if (provider.keyEnv && !apiKey) {
      markSource(candidateSources.at(-1), "blocked", "skipped_missing_token");
      sourceResults.push(auditSource(provider.label, providerBaseUrl(providerName), "blocked", "skipped_missing_token"));
      providerRuntimeMs[providerName] = Date.now() - providerStartedAt;
      providerCostUnits[providerName] = 0;
      providerErrorCounts[providerName] = 0;
      continue;
    }
    contexts.push({
      providerName,
      provider,
      providerStartedAt,
      sourceId,
      sourceItem: candidateSources.at(-1),
      apiKey,
      queries: queries.filter((query) => queryMatchesProvider(query, providerName)),
      hits: 0,
      requests: 0,
      pages: 0,
      errors: 0,
      blocked: "",
      limitations: new Set(),
      continuationUrls: new Set(),
      lastRequestAt: 0
    });
  }

  const lanes = [];
  for (const context of contexts) {
    const concurrency = context.providerName === "arxiv" ? 1 : queryConcurrency;
    const firstPages = await mapWithConcurrency(context.queries, concurrency, async (query) => ({
      query,
      page: await runSearchProviderPage(context, query, {}, {
        fetchImpl,
        reportDate,
        transportPageSize,
        timeoutMs: options.timeoutMs || 15000,
        providerThrottleMs: options.providerThrottleMs,
        budget,
        seenRequests: new Set(),
        seenPages: new Set()
      })
    }));
    for (const { query, page } of firstPages) {
      recordSearchPage(context, query, page, { candidates, reportDate });
      const laneKey = searchTransportLaneKey(context.providerName, query);
      const savedState = sanitizePaginationState(checkpoint.lanes?.[laneKey]?.state);
      const continuationState = savedState || page.next_state;
      if (!continuationState || !context.provider.nextPage) {
        if (!page.next_state) delete checkpoint.lanes[laneKey];
        continue;
      }
      lanes.push({
        key: laneKey,
        context,
        query,
        state: continuationState,
        current_next_state: page.next_state,
        used_checkpoint: Boolean(savedState && page.next_state && !samePaginationState(savedState, page.next_state)),
        seenRequests: new Set(page.request_fingerprint ? [page.request_fingerprint] : []),
        seenPages: new Set(page.page_fingerprint ? [page.page_fingerprint] : []),
        active: true
      });
    }
  }

  while (lanes.some((lane) => lane.active) && budget.canReserve()) {
    let progressed = false;
    for (const lane of lanes) {
      if (!lane.active || !budget.canReserve()) continue;
      const page = await runSearchProviderPage(lane.context, lane.query, lane.state, {
        fetchImpl,
        reportDate,
        transportPageSize,
        timeoutMs: options.timeoutMs || 15000,
        providerThrottleMs: options.providerThrottleMs,
        budget,
        seenRequests: lane.seenRequests,
        seenPages: lane.seenPages
      });
      if (page.budget_exhausted) break;
      progressed = progressed || page.requested;
      recordSearchPage(lane.context, lane.query, page, { candidates, reportDate });
      if (page.error) {
        if (page.retry_state) {
          lane.state = page.retry_state;
          checkpoint.lanes[lane.key] = searchCheckpointLane(lane, generatedAt, page.request_fingerprint);
          lane.context.continuationUrls.add(searchContinuationUrl(lane));
        } else {
          delete checkpoint.lanes[lane.key];
        }
        lane.active = false;
        continue;
      }
      if (page.next_state) {
        lane.state = page.next_state;
        checkpoint.lanes[lane.key] = searchCheckpointLane(lane, generatedAt, page.request_fingerprint);
        continue;
      }
      if (lane.used_checkpoint && lane.current_next_state && !samePaginationState(lane.state, lane.current_next_state)) {
        lane.state = lane.current_next_state;
        lane.used_checkpoint = false;
        checkpoint.lanes[lane.key] = searchCheckpointLane(lane, generatedAt, page.request_fingerprint);
        continue;
      }
      lane.active = false;
      delete checkpoint.lanes[lane.key];
    }
    if (transportStatePath) await writeSharedTransportCheckpoint(transportStatePath, checkpoint, generatedAt);
    if (!progressed) break;
  }

  for (const lane of lanes.filter((item) => item.active)) {
    lane.context.limitations.add(budget.exhaustionReason() || "checkpoint_backlog_pending");
    checkpoint.lanes[lane.key] = searchCheckpointLane(lane, generatedAt, "");
    lane.context.continuationUrls.add(searchContinuationUrl(lane));
  }
  if (transportStatePath) await writeSharedTransportCheckpoint(transportStatePath, checkpoint, generatedAt);

  for (const context of contexts) {
    const transportDegraded = context.limitations.size > 0;
    const status = context.hits > 0 ? "checked" : context.blocked ? "blocked" : "no_signal";
    const notesBase = context.blocked && context.hits > 0
      ? `${context.hits} shadow candidates; ${context.blocked}`
      : context.blocked || `${context.hits} shadow candidates`;
    const notes = `${notesBase}; transport_status=${transportDegraded ? "degraded" : "complete"}; pages_fetched=${context.pages}${context.limitations.size ? `; transport_limitation=${[...context.limitations].join(",")}` : ""}`;
    markSource(context.sourceItem, status, notes);
    sourceResults.push(auditSource(context.provider.label, providerBaseUrl(context.providerName), status, notes, {
      source_group: providerSourceGroup(context.providerName),
      transport_status: transportDegraded ? "degraded" : "complete",
      pages_fetched: context.pages,
      ...(context.limitations.size ? { transport_limitation: [...context.limitations].join(",") } : {}),
      ...(context.continuationUrls.size ? { continuation_urls: [...context.continuationUrls].filter(Boolean) } : {})
    }));
    providerRuntimeMs[context.providerName] = Date.now() - context.providerStartedAt;
    providerCostUnits[context.providerName] = context.requests;
    providerErrorCounts[context.providerName] = context.errors;
    providerTransportStatus[context.providerName] = transportDegraded ? "degraded" : "complete";
    providerTransportLimitations[context.providerName] = [...context.limitations];
    providerPagesFetched[context.providerName] = context.pages;
  }

  return {
    source_audit: {
      search_sources: {
        checked: true,
        shadow: options.shadow !== false,
        sources: sourceResults,
        candidates_found: candidates.length,
        included: 0,
        provider_runtime_ms: providerRuntimeMs,
        provider_cost_units: providerCostUnits,
        provider_error_counts: providerErrorCounts,
        provider_transport_status: providerTransportStatus,
        provider_transport_limitations: providerTransportLimitations,
        provider_pages_fetched: providerPagesFetched,
        transport_budget: budget.summary(),
        notes: "Search/news providers run as listener inputs. Every safe parsed hit is retained; source and credibility metadata describe whether the target is primary, intermediary, or still pending review."
      }
    },
    sources: candidateSources,
    candidates
  };
}

async function loadSearchQueries(options) {
  if (Array.isArray(options.queries)) {
    return options.queries;
  }
  const queriesPath = options.queriesPath || options.queries || path.join("config", "search-queries.json");
  const raw = await fs.readFile(path.resolve(options.rootDir || process.cwd(), queriesPath), "utf8");
  const payload = JSON.parse(raw);
  return Array.isArray(payload) ? payload : payload.queries || [];
}

async function runSearchProviderPage(context, query, state, options) {
  const request = context.provider.buildRequest
    ? context.provider.buildRequest(query, options, context.apiKey, state)
    : {
        url: context.provider.buildUrl(query, options, context.apiKey, state),
        init: {}
      };
  const requestFingerprint = searchRequestFingerprint(request);
  if (options.seenRequests.has(requestFingerprint)) {
    return { hits: [], error: "pagination_request_repeated", request_fingerprint: requestFingerprint };
  }
  await respectSearchProviderThrottle(context, options);
  if (!options.budget.reserve()) {
    return { hits: [], budget_exhausted: true, next_state: sanitizePaginationState(state) };
  }
  options.seenRequests.add(requestFingerprint);
  context.lastRequestAt = Date.now();

  const headers = {
    accept: context.providerName === "arxiv" ? "application/atom+xml,application/xml,text/xml,*/*" : "application/json",
    "user-agent": "ai-daily-cn-static-publisher",
    ...(context.provider.headers ? context.provider.headers(context.apiKey) : {}),
    ...(request.init?.headers || {})
  };
  let response;
  try {
    response = await options.fetchImpl(request.url, {
      ...(request.init || {}),
      headers,
      ...timeoutInit(options.timeoutMs || 15000)
    });
  } catch (error) {
    return {
      hits: [],
      requested: true,
      error: `pagination_fetch_failed:${sanitizeNoteValue(formatDiscoveryErrorNote(error))}`,
      retry_state: sanitizePaginationState(state),
      request_fingerprint: requestFingerprint
    };
  }
  if (!response.ok) {
    return {
      hits: [],
      requested: true,
      error: `pagination_http_${response.status}`,
      retry_state: sanitizePaginationState(state),
      request_fingerprint: requestFingerprint
    };
  }

  let text = "";
  let payload = null;
  const pageHits = context.provider.parseText
    ? context.provider.parseText(text = await response.text())
    : context.provider.parse(payload = await readJsonResponse(response));
  const pageFingerprint = createHash("sha256").update(JSON.stringify(pageHits)).digest("hex");
  if (pageHits.length > 0 && options.seenPages.has(pageFingerprint)) {
    return {
      hits: [],
      requested: true,
      error: "pagination_page_repeated",
      request_fingerprint: requestFingerprint,
      page_fingerprint: pageFingerprint
    };
  }
  if (pageHits.length > 0) options.seenPages.add(pageFingerprint);

  if (!context.provider.nextPage) {
    return {
      hits: pageHits,
      requested: true,
      done: true,
      limitation: context.provider.transportLimitation || "provider_has_no_exhaustive_pagination",
      request_fingerprint: requestFingerprint,
      page_fingerprint: pageFingerprint
    };
  }
  const next = context.provider.nextPage({ payload, text, pageHits, state, options, request, response }) || { done: true };
  return {
    hits: pageHits,
    requested: true,
    done: Boolean(next.done),
    ...(next.state ? { next_state: sanitizePaginationState(next.state) } : {}),
    ...(next.limitation ? { limitation: next.limitation } : {}),
    request_fingerprint: requestFingerprint,
    page_fingerprint: pageFingerprint
  };
}

async function respectSearchProviderThrottle(context, options) {
  if (context.providerName !== "arxiv" || !context.lastRequestAt) return;
  const interval = Number.isFinite(Number(options.providerThrottleMs))
    ? Math.max(0, Number(options.providerThrottleMs))
    : 3000;
  const remaining = interval - (Date.now() - context.lastRequestAt);
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
}

function recordSearchPage(context, query, page, { candidates, reportDate }) {
  if (page.budget_exhausted) context.limitations.add("runtime_budget_exhausted");
  if (page.requested) {
    context.requests += 1;
    context.pages += page.page_fingerprint ? 1 : 0;
  }
  if (page.error) {
    context.errors += 1;
    context.blocked = page.error;
    context.limitations.add(page.error);
  }
  if (page.limitation) context.limitations.add(page.limitation);
  for (const hit of page.hits || []) {
    const candidate = searchHitToCandidate({
      hit,
      query,
      providerName: context.providerName,
      provider: context.provider,
      sourceId: context.sourceId,
      reportDate,
      existing: candidates
    });
    if (!candidate) continue;
    candidate.source_group = providerSourceGroup(context.providerName);
    candidates.push(candidate);
    context.hits += 1;
  }
}

function queryMatchesProvider(query, providerName) {
  const configured = Array.isArray(query?.providers) ? query.providers.map(String) : [];
  if (configured.length > 0) return configured.includes(providerName);
  return !ACADEMIC_PROVIDERS.has(providerName);
}

function providerSourceGroup(providerName) {
  return ACADEMIC_PROVIDERS.has(providerName) ? "papers_models" : "news_newsletters";
}

function searchTransportLaneKey(providerName, query) {
  return `search:${providerName}:${String(query?.id || query?.query || "query").replace(/[^A-Za-z0-9._:-]+/g, "_")}`;
}

function sanitizePaginationState(state) {
  return sanitizeSharedPaginationState(state);
}

function samePaginationState(left, right) {
  return JSON.stringify(sanitizePaginationState(left)) === JSON.stringify(sanitizePaginationState(right));
}

function searchCheckpointLane(lane, generatedAt, requestFingerprint) {
  return {
    provider: lane.context.providerName,
    query_id: String(lane.query.id || lane.query.query || ""),
    state: sanitizePaginationState(lane.state),
    ...(requestFingerprint ? { request_fingerprint: requestFingerprint } : {}),
    updated_at: generatedAt
  };
}

function searchContinuationUrl(lane) {
  try {
    const request = lane.context.provider.buildRequest
      ? lane.context.provider.buildRequest(lane.query, { transportPageSize: 20 }, lane.context.apiKey, lane.state)
      : { url: lane.context.provider.buildUrl(lane.query, { transportPageSize: 20 }, lane.context.apiKey, lane.state) };
    return redactContinuationUrl(request.url);
  } catch {
    return "";
  }
}

function createSearchTransportBudget(options = {}) {
  const maxRequests = positiveInt(options.requestBudget, DEFAULT_TRANSPORT_REQUEST_BUDGET);
  const runtimeMs = positiveInt(options.runtimeMs, DEFAULT_TRANSPORT_RUNTIME_MS);
  const startedAt = Date.now();
  let used = 0;
  return {
    canReserve() {
      return used < maxRequests && Date.now() - startedAt < runtimeMs;
    },
    reserve() {
      if (!this.canReserve()) return false;
      used += 1;
      return true;
    },
    exhaustionReason() {
      if (used >= maxRequests) return "runtime_request_budget_exhausted";
      if (Date.now() - startedAt >= runtimeMs) return "runtime_time_budget_exhausted";
      return "";
    },
    summary() {
      return {
        requests_used: used,
        request_budget: maxRequests,
        runtime_ms: Date.now() - startedAt,
        runtime_budget_ms: runtimeMs,
        exhausted: !this.canReserve()
      };
    }
  };
}

function searchRequestFingerprint(request = {}) {
  return createHash("sha256").update(JSON.stringify({
    url: redactContinuationUrl(request.url),
    method: request.init?.method || "GET",
    body: redactRequestBody(request.init?.body)
  })).digest("hex");
}

function redactRequestBody(value) {
  try {
    const payload = JSON.parse(String(value || ""));
    for (const key of ["api_key", "apiKey", "token", "access_token"]) {
      if (Object.hasOwn(payload, key)) payload[key] = "[REDACTED]";
    }
    return JSON.stringify(payload);
  } catch {
    return String(value || "").replace(/(api[_-]?key|token)=([^&\s]+)/gi, "$1=[REDACTED]");
  }
}

function redactContinuationUrl(value) {
  try {
    const url = new URL(String(value || ""));
    for (const key of [...url.searchParams.keys()]) {
      if (/api[_-]?key|token|secret|credential/i.test(key)) url.searchParams.set(key, "[REDACTED]");
    }
    url.username = "";
    url.password = "";
    return url.toString();
  } catch {
    return "";
  }
}

function safeProviderPaginationUrl(value, expectedOrigin) {
  try {
    const sanitized = sanitizePublicHttpUrl(value);
    if (!sanitized) return "";
    const url = new URL(sanitized);
    return url.origin === new URL(expectedOrigin).origin ? url.toString() : "";
  } catch {
    return "";
  }
}

function searchHitToCandidate({ hit, query, providerName, provider, sourceId, reportDate, existing }) {
  const url = sanitizePublicHttpUrl(firstString(hit.url));
  const title = cleanText(hit.title);
  if (!url) {
    return null;
  }
  const category = query.candidate_category || "community_lead";
  const verificationStatus = searchVerificationStatus(url, query, providerName);
  const candidate = {
    id: uniqueCandidateId(existing, `${sourceId}-${query.id || query.query}-${title || url}`),
    observation_id: searchObservationId({ hit, query, providerName, sourceId, url, title }),
    source_id: sourceId,
    query_id: String(query.id || query.query || "").trim(),
    category,
    title,
    url,
    source: provider.label,
    event_date: dateOnly(hit.event_date) || reportDate,
    status: "excluded",
    evidence: summarizeEvidence(hit.summary, `${provider.label} shadow search hit for ${query.id || query.query}.`),
    notes: `search_query=${query.id || sanitizeNoteValue(query.query)}; provider=${providerName}; shadow=true`,
    verification_status: verificationStatus,
    verification_sources: verificationStatus === "primary_confirmed" ? [url] : []
  };
  if (verificationStatus === "primary_confirmed") {
    candidate.primary_url = url;
  } else {
    candidate.intermediary_url = url;
  }
  return candidate;
}

function searchObservationId({ hit, query, providerName, sourceId, url, title }) {
  const nativeId = firstString(hit.observation_id, hit.native_id, hit.id);
  const identity = nativeId
    ? [sourceId, "native", nativeId]
    : [sourceId, providerName, query.id || query.query, url, title, hit.event_date, hit.summary];
  return `search:${createHash("sha256").update(identity.map((part) => String(part || "").trim()).join("\n")).digest("hex").slice(0, 32)}`;
}

function searchVerificationStatus(url, query, providerName) {
  if (providerName === "arxiv") {
    return "primary_confirmed";
  }
  const domains = Array.isArray(query.allowed_primary_domains) ? query.allowed_primary_domains : [];
  if (domains.some((domain) => hostMatches(url, domain))) {
    return "primary_confirmed";
  }
  return query.verification_policy === "primary_allowed" && (hostMatches(url, "arxiv.org") || hostMatches(url, "github.com"))
    ? "primary_confirmed"
    : "intermediary_only";
}

function normalizeProviders(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  return String(value || DEFAULT_PROVIDERS.join(","))
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function providerBaseUrl(providerName) {
  return {
    gdelt: "https://api.gdeltproject.org/",
    openalex: "https://api.openalex.org/",
    arxiv: "https://export.arxiv.org/",
    brave: "https://api.search.brave.com/",
    tavily: "https://api.tavily.com/",
    exa: "https://api.exa.ai/",
    serpapi: "https://serpapi.com/",
    semantic_scholar: "https://api.semanticscholar.org/"
  }[providerName] || "https://example.com/";
}

function auditSource(name, url, status, notes, extra = {}) {
  const source = { name, url, status, notes, ...extra };
  return { ...source, ...transportCompletenessTags(source) };
}

function markSource(sourceItem, status, notes) {
  sourceItem.status = status;
  sourceItem.notes = notes;
}

function positiveInt(value, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

async function mapWithConcurrency(values, concurrency, worker) {
  const items = Array.isArray(values) ? values : [];
  const results = new Array(items.length);
  let cursor = 0;
  const workerCount = Math.min(positiveInt(concurrency, 1), Math.max(items.length, 1));
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }));
  return results;
}

function requireReportDate(reportDate) {
  if (!isValidDateString(reportDate || "")) {
    throw new Error("reportDate must be YYYY-MM-DD");
  }
  return reportDate;
}

function readJsonResponse(response) {
  if (typeof response.json === "function") {
    return response.json();
  }
  return response.text().then((text) => JSON.parse(text));
}

function arrayFrom(value) {
  return Array.isArray(value) ? value : [];
}

function hostMatches(value, domain) {
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
    const normalized = String(domain || "").toLowerCase().replace(/^www\./, "");
    return host === normalized || host.endsWith(`.${normalized}`);
  } catch {
    return false;
  }
}

function matchXmlBlocks(xml, tagName) {
  const pattern = new RegExp(`<(?:\\w+:)?${tagName}\\b[\\s\\S]*?<\\/(?:\\w+:)?${tagName}>`, "gi");
  return [...String(xml || "").matchAll(pattern)].map((match) => match[0]);
}

function xmlText(block, tagName) {
  const pattern = new RegExp(`<(?:\\w+:)?${tagName}\\b[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${tagName}>`, "i");
  return decodeXml(stripTags(block.match(pattern)?.[1] || ""));
}

function atomLink(block) {
  const href = block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/i)?.[1] || "";
  return decodeXml(href);
}

function stripTags(value) {
  return String(value).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]*>/g, " ");
}

function decodeXml(value) {
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&nbsp;/g, " ");
}

function cleanText(value) {
  return stripTags(decodeXml(value)).replace(/\s+/g, " ").trim();
}

function dateOnly(value) {
  const raw = String(value || "").trim();
  const ymd = raw.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (ymd) {
    return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function summarizeEvidence(summary, fallback) {
  const cleaned = cleanText(summary);
  return cleaned ? cleaned.slice(0, 240) : fallback;
}

function uniqueCandidateId(existingCandidates, rawValue) {
  const base = slugId(rawValue).slice(0, 80) || "candidate";
  const used = new Set(existingCandidates.map((candidate) => candidate.id));
  if (!used.has(base)) {
    return base;
  }
  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) {
    suffix += 1;
  }
  return `${base}-${suffix}`;
}

function slugId(value) {
  return String(value)
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function firstString(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
}

function sanitizeNoteValue(value) {
  return String(value || "")
    .replace(/[\r\n;]+/g, " ")
    .replace(/\s+/g, "_")
    .slice(0, 160);
}

function timeoutInit(timeoutMs) {
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || typeof AbortSignal?.timeout !== "function") {
    return {};
  }
  return { signal: AbortSignal.timeout(timeoutMs) };
}
