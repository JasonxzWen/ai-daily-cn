import fs from "node:fs/promises";
import path from "node:path";
import { createDiscoveryFetch, formatDiscoveryErrorNote } from "./discovery.js";
import { isValidDateString } from "./time.js";

const DEFAULT_PROVIDERS = ["gdelt", "openalex", "arxiv"];
const PROVIDERS = {
  gdelt: {
    label: "GDELT",
    keyEnv: "",
    buildUrl(query, options) {
      const url = new URL("https://api.gdeltproject.org/api/v2/doc/doc");
      url.searchParams.set("query", query.query);
      url.searchParams.set("mode", "ArtList");
      url.searchParams.set("format", "json");
      url.searchParams.set("maxrecords", String(options.limit));
      url.searchParams.set("sort", "HybridRel");
      return url.toString();
    },
    parse(payload) {
      return arrayFrom(payload?.articles).map((item) => ({
        title: item.title,
        url: item.url,
        event_date: dateOnly(item.seendate || item.datetime || item.date),
        summary: item.sourceCountry ? `GDELT article from ${item.sourceCountry}.` : "GDELT article hit."
      }));
    }
  },
  openalex: {
    label: "OpenAlex",
    keyEnv: "",
    buildUrl(query, options) {
      const url = new URL("https://api.openalex.org/works");
      url.searchParams.set("search", query.query);
      url.searchParams.set("per-page", String(options.limit));
      if (options.reportDate) {
        url.searchParams.set("filter", `from_publication_date:${options.reportDate}`);
      }
      return url.toString();
    },
    parse(payload) {
      return arrayFrom(payload?.results).map((item) => ({
        title: item.title || item.display_name,
        url: item.primary_location?.landing_page_url || item.doi || item.id,
        event_date: dateOnly(item.publication_date || item.created_date),
        summary: firstString(item.primary_location?.source?.display_name, item.type, "OpenAlex work hit.")
      }));
    }
  },
  arxiv: {
    label: "arXiv",
    keyEnv: "",
    buildUrl(query, options) {
      const url = new URL("https://export.arxiv.org/api/query");
      url.searchParams.set("search_query", `all:${query.query}`);
      url.searchParams.set("start", "0");
      url.searchParams.set("max_results", String(options.limit));
      url.searchParams.set("sortBy", "submittedDate");
      url.searchParams.set("sortOrder", "descending");
      return url.toString();
    },
    parseText(xml) {
      return matchXmlBlocks(xml, "entry").map((block) => ({
        title: xmlText(block, "title"),
        url: atomLink(block) || xmlText(block, "id"),
        event_date: dateOnly(xmlText(block, "published") || xmlText(block, "updated")),
        summary: cleanText(xmlText(block, "summary"))
      }));
    }
  },
  brave: {
    label: "Brave Search",
    keyEnv: "BRAVE_SEARCH_API_KEY",
    buildUrl(query, options) {
      const url = new URL("https://api.search.brave.com/res/v1/web/search");
      url.searchParams.set("q", query.query);
      url.searchParams.set("count", String(options.limit));
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
    buildRequest(query, options, apiKey) {
      return {
        url: "https://api.tavily.com/search",
        init: {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            api_key: apiKey,
            query: query.query,
            max_results: options.limit,
            include_answer: false
          })
        }
      };
    },
    parse(payload) {
      return arrayFrom(payload?.results).map((item) => ({
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
            numResults: options.limit
          })
        }
      };
    },
    parse(payload) {
      return arrayFrom(payload?.results).map((item) => ({
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
    buildUrl(query, options, apiKey) {
      const url = new URL("https://serpapi.com/search.json");
      url.searchParams.set("engine", "google_news");
      url.searchParams.set("q", query.query);
      url.searchParams.set("num", String(options.limit));
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
    }
  },
  semantic_scholar: {
    label: "Semantic Scholar",
    keyEnv: "SEMANTIC_SCHOLAR_API_KEY",
    buildUrl(query, options) {
      const url = new URL("https://api.semanticscholar.org/graph/v1/paper/search");
      url.searchParams.set("query", query.query);
      url.searchParams.set("limit", String(options.limit));
      url.searchParams.set("fields", "title,url,abstract,year,publicationDate");
      return url.toString();
    },
    headers(apiKey) {
      return { "x-api-key": apiKey };
    },
    parse(payload) {
      return arrayFrom(payload?.data).map((item) => ({
        title: item.title,
        url: item.url,
        event_date: dateOnly(item.publicationDate || item.year),
        summary: item.abstract
      }));
    }
  }
};

export async function collectSearchNews(options = {}) {
  const reportDate = requireReportDate(options.reportDate);
  const generatedAt = options.generatedAt || new Date().toISOString();
  const fetchImpl = createDiscoveryFetch(options.fetchImpl || globalThis.fetch, options);
  if (typeof fetchImpl !== "function") {
    throw new Error("fetch is not available in this runtime");
  }

  const queries = await loadSearchQueries(options);
  const providers = normalizeProviders(options.providers);
  const limit = positiveInt(options.limit, 40);
  const perQueryLimit = Math.max(1, Math.ceil(limit / Math.max(queries.length, 1)));
  const sourceResults = [];
  const candidateSources = [];
  const candidates = [];
  const startedAt = Date.now();
  const budgetMs = Number.isInteger(options.budgetMs) && options.budgetMs > 0 ? options.budgetMs : 300000;
  const providerTimeoutMs = Number.isInteger(options.providerTimeoutMs) && options.providerTimeoutMs > 0
    ? options.providerTimeoutMs
    : Number.isInteger(options["provider-timeout-ms"]) && options["provider-timeout-ms"] > 0
      ? options["provider-timeout-ms"]
      : Math.max(positiveInt(options.timeoutMs, 15000), 1) * Math.max(queries.length, 1);
  const providerRuntimeMs = {};
  const providerCostUnits = {};
  const providerErrorCounts = {};

  for (const providerName of providers) {
    const providerStartedAt = Date.now();
    let providerErrors = 0;
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

    let providerHits = 0;
    let providerBlocked = "";
    let providerRequests = 0;
    for (const query of queries) {
      if (Date.now() - startedAt > budgetMs) {
        providerBlocked = "budget_exceeded";
        break;
      }
      if (Date.now() - providerStartedAt > providerTimeoutMs) {
        providerBlocked = `provider_timeout_exceeded_${providerTimeoutMs}ms`;
        break;
      }
      if (Array.isArray(query.providers) && query.providers.length > 0 && !query.providers.includes(providerName)) {
        continue;
      }
      try {
        providerRequests += 1;
        const hits = await runSearchProvider(providerName, provider, query, {
          apiKey,
          fetchImpl,
          limit: perQueryLimit,
          reportDate,
          timeoutMs: options.timeoutMs || 15000
        });
        for (const hit of hits) {
          if (candidates.length >= limit) {
            break;
          }
          const candidate = searchHitToCandidate({
            hit,
            query,
            providerName,
            provider,
            sourceId,
            reportDate,
            existing: candidates
          });
          if (candidate) {
            candidates.push(candidate);
            providerHits += 1;
          }
        }
      } catch (error) {
        providerErrors += 1;
        providerBlocked = sanitizeNoteValue(formatDiscoveryErrorNote(error));
      }
    }

    const status = providerHits > 0 ? "checked" : providerBlocked ? "blocked" : "no_signal";
    const notes = providerBlocked && providerHits > 0 ? `${providerHits} shadow candidates; ${providerBlocked}` : providerBlocked || `${providerHits} shadow candidates`;
    markSource(candidateSources.at(-1), status, notes);
    sourceResults.push(auditSource(provider.label, providerBaseUrl(providerName), status, notes));
    providerRuntimeMs[providerName] = Date.now() - providerStartedAt;
    providerCostUnits[providerName] = providerRequests;
    providerErrorCounts[providerName] = providerErrors;
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
        notes: "Search/news providers run as shadow discovery by default. Hits remain candidates until the target URL is read and primary-source verification passes."
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

async function runSearchProvider(providerName, provider, query, options) {
  const request = provider.buildRequest
    ? provider.buildRequest(query, options, options.apiKey)
    : {
        url: provider.buildUrl(query, options, options.apiKey),
        init: {}
      };
  const headers = {
    accept: providerName === "arxiv" ? "application/atom+xml,application/xml,text/xml,*/*" : "application/json",
    "user-agent": "ai-daily-cn-static-publisher",
    ...(provider.headers ? provider.headers(options.apiKey) : {}),
    ...(request.init?.headers || {})
  };
  const response = await options.fetchImpl(request.url, {
    ...(request.init || {}),
    headers,
    ...timeoutInit(options.timeoutMs || 15000)
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  if (provider.parseText) {
    return provider.parseText(await response.text());
  }
  return provider.parse(await readJsonResponse(response));
}

function searchHitToCandidate({ hit, query, providerName, provider, sourceId, reportDate, existing }) {
  const url = firstString(hit.url);
  const title = cleanText(hit.title);
  if (!url || !title || !isHttpUrl(url)) {
    return null;
  }
  const category = query.candidate_category || "community_lead";
  const verificationStatus = searchVerificationStatus(url, query, providerName);
  const candidate = {
    id: uniqueCandidateId(existing, `${sourceId}-${query.id || query.query}-${title}`),
    source_id: sourceId,
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

function auditSource(name, url, status, notes) {
  return { name, url, status, notes };
}

function markSource(sourceItem, status, notes) {
  sourceItem.status = status;
  sourceItem.notes = notes;
}

function positiveInt(value, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isInteger(number) && number > 0 ? number : fallback;
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

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
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
