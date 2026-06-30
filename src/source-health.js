import { contentSourceRequestUrl, contentSourceSkipReason, createDiscoveryFetch, formatDiscoveryErrorNote } from "./discovery.js";
import { loadSourceRegistry, normalizeEnablements } from "./source-registry.js";
import { isValidDateString } from "./time.js";

const SOURCE_SPECIFIC_TRACKING_KINDS = new Set([
  "openrouter_rankings_public_playwright",
  "artificial_analysis_index_public_playwright",
  "swe_bench_pro_public_playwright"
]);

export async function checkSourcesHealth(options = {}) {
  const reportDate = requireReportDate(options.reportDate);
  const fetchImpl = createDiscoveryFetch(options.fetchImpl || globalThis.fetch, options);
  if (typeof fetchImpl !== "function") {
    throw new Error("fetch is not available in this runtime");
  }

  const registry = await loadSourceRegistry({
    rootDir: options.rootDir || process.cwd(),
    sourcesPath: options.sourcesPath || options.sources || "config/sources",
    includeEnablement: options.enablement || ["core", "optional", "manual"]
  });
  const enabled = new Set(normalizeEnablements(options.enablement || "core,optional,manual"));
  const sources = registry.sources.filter((source) => enabled.has(source.enablement));
  const results = [];

  for (const source of sources) {
    const skipped = skipReasonForSource(source);
    if (skipped) {
      const status = typeof skipped === "string" ? skipped : skipped.status;
      const notes = typeof skipped === "string" ? skipped : skipped.notes;
      results.push(healthResult(source, status, {
        notes
      }));
      continue;
    }

    try {
      const response = await fetchImpl(contentSourceRequestUrl(source, options.env || process.env, reportDate), {
        headers: {
          accept: "application/atom+xml, application/rss+xml, application/xml, text/xml, text/html, */*",
          "user-agent": "ai-daily-cn-static-publisher"
        },
        ...timeoutInit(source.timeoutMs || source.timeout_ms || 15000)
      });
      if (!response.ok) {
        results.push(healthResult(source, "blocked", {
          http_status: response.status,
          notes: `HTTP ${response.status}`
        }));
        continue;
      }

      const text = await response.text();
      const sourceSpecific = sourceSpecificHealthResult(source, text, response.status, reportDate);
      if (sourceSpecific) {
        results.push(sourceSpecific);
        continue;
      }

      const entries = parseFeedEntries(text);
      const feedLike = isFeedLike(text);
      const htmlIndex = source.source_kind === "html_index";
      const recentEntries = entries.filter((entry) => isWithinHours(entry.event_date, reportDate, 48));
      const originalUrlCount = source.requires_original_url || source.requiresOriginalUrl
        ? entries.filter((entry) => [entry.url, ...entry.links].some(isOriginalXUrl)).length
        : null;
      const status = htmlIndex ? "checked" : feedLike ? recentEntries.length > 0 ? "checked" : "no_signal" : "blocked";
      results.push(healthResult(source, status, {
        http_status: response.status,
        feed_like: feedLike,
        recent_48h_entries: recentEntries.length,
        original_url_count: originalUrlCount,
        notes: htmlIndex
          ? "html_index source is reachable; feed_like=false"
          : feedLike
          ? `${entries.length} feed entries parsed; ${recentEntries.length} within 48h`
          : "response is not feed-like"
      }));
    } catch (error) {
      results.push(healthResult(source, "blocked", {
        notes: formatDiscoveryErrorNote(error)
      }));
    }
  }

  return {
    source_audit: {
      sources_health: {
        checked: true,
        sources: results,
        candidates_found: 0,
        included: 0,
        notes: "Health check validates configured source availability, feed shape, 48h recency, and original URL requirements without admitting content into the report."
      }
    },
    results
  };
}

function skipReasonForSource(source) {
  if (source.source_kind === "manual") {
    return "skipped_manual_source";
  }
  if (source.verification_policy === "platform_signal_exempt" && source.kill_switch === true) {
    return {
      status: "skipped_manual_source",
      notes: "kill_switch_enabled"
    };
  }
  return contentSourceSkipReason(source);
}

function sourceSpecificHealthResult(source, text, httpStatus, reportDate) {
  const sourceKind = String(source?.source_kind || "").trim();
  if (SOURCE_SPECIFIC_TRACKING_KINDS.has(sourceKind)) {
    const reachable = String(text || "").trim().length > 0;
    return healthResult(source, reachable ? "checked" : "no_signal", {
      http_status: httpStatus,
      feed_like: false,
      recent_48h_entries: reachable ? 1 : 0,
      notes: `source-specific tracking health; source_kind=${sourceKind}; reachable=${reachable}; feed_like=false`
    });
  }

  if (sourceKind === "github_report_markdown") {
    const recentHints = countRecentMarkdownHints(text, reportDate);
    const linkCount = markdownLinkCount(text);
    const reachable = String(text || "").trim().length > 0;
    return healthResult(source, reachable ? "checked" : "no_signal", {
      http_status: httpStatus,
      feed_like: false,
      recent_48h_entries: recentHints,
      notes: `source-specific github_report_markdown health; markdown_links=${linkCount}; recent_48h_hints=${recentHints}`
    });
  }

  if (sourceKind === "search_api") {
    const recordCount = jsonRecordCount(text);
    return healthResult(source, recordCount > 0 ? "checked" : "no_signal", {
      http_status: httpStatus,
      feed_like: false,
      recent_48h_entries: recordCount,
      notes: `source-specific search_api health; api_records=${recordCount}`
    });
  }

  if (sourceKind === "huggingface_daily_papers_api") {
    const recordCount = jsonRecordCount(text);
    return healthResult(source, recordCount > 0 ? "checked" : "no_signal", {
      http_status: httpStatus,
      feed_like: false,
      recent_48h_entries: recordCount,
      notes: `source-specific huggingface_daily_papers_api health; api_records=${recordCount}`
    });
  }

  return null;
}

function countRecentMarkdownHints(text, reportDate) {
  const dates = String(text || "").match(/\b\d{4}-\d{2}-\d{2}\b/g) || [];
  const recentDates = dates.filter((date) => isWithinHours(date, reportDate, 48)).length;
  if (recentDates > 0) {
    return recentDates;
  }
  return markdownLinkCount(text) > 0 ? 1 : 0;
}

function markdownLinkCount(text) {
  return (String(text || "").match(/\[[^\]]+\]\(https?:\/\/[^)]+\)/g) || []).length;
}

function jsonRecordCount(text) {
  try {
    const value = JSON.parse(String(text || ""));
    if (Array.isArray(value)) {
      return value.length;
    }
    if (!value || typeof value !== "object") {
      return 0;
    }
    for (const key of ["items", "results", "data", "hits", "stories"]) {
      if (Array.isArray(value[key])) {
        return value[key].length;
      }
    }
    return Object.keys(value).length;
  } catch {
    return 0;
  }
}

function healthResult(source, status, extra = {}) {
  return {
    id: source.id,
    name: source.name,
    url: source.url,
    source_kind: source.source_kind,
    tier: source.tier,
    authority: source.authority,
    enablement: source.enablement,
    verification_policy: source.verification_policy,
    ...(source.platform ? { platform: source.platform } : {}),
    requires_original_url: source.requires_original_url === true || source.requiresOriginalUrl === true,
    status,
    http_status: extra.http_status || null,
    feed_like: extra.feed_like === true,
    recent_48h_entries: Number.isInteger(extra.recent_48h_entries) ? extra.recent_48h_entries : 0,
    original_url_count: extra.original_url_count,
    notes: extra.notes || ""
  };
}

function isFeedLike(text) {
  return /<(rss|feed)\b/i.test(String(text || ""));
}

function parseFeedEntries(xml) {
  const entryBlocks = matchXmlBlocks(xml, "entry");
  if (entryBlocks.length > 0) {
    return entryBlocks.map(parseAtomEntry);
  }
  return matchXmlBlocks(xml, "item").map(parseRssItem);
}

function parseAtomEntry(block) {
  return {
    url: atomLink(block) || xmlText(block, "link"),
    event_date: dateOnly(xmlText(block, "updated") || xmlText(block, "published")),
    links: extractLinks(block)
  };
}

function parseRssItem(block) {
  return {
    url: xmlText(block, "link") || atomLink(block),
    event_date: dateOnly(xmlText(block, "pubDate") || xmlText(block, "date") || xmlText(block, "updated")),
    links: extractLinks(block)
  };
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

function extractLinks(block) {
  const links = [];
  for (const match of String(block || "").matchAll(/(?:href|url)=["']([^"']+)["']|<link\b[^>]*>([\s\S]*?)<\/link>/gi)) {
    const value = decodeXml(stripTags(match[1] || match[2] || ""));
    if (value) {
      links.push(value);
    }
  }
  return links;
}

function isWithinHours(eventDate, reportDate, hours) {
  if (!eventDate) {
    return false;
  }
  const eventTime = Date.parse(`${eventDate}T00:00:00Z`);
  const reportTime = Date.parse(`${reportDate}T23:59:59Z`);
  if (Number.isNaN(eventTime) || Number.isNaN(reportTime)) {
    return false;
  }
  const diffMs = reportTime - eventTime;
  return diffMs >= 0 && diffMs <= hours * 60 * 60 * 1000;
}

function isOriginalXUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    return (host === "x.com" || host === "twitter.com") && /\/[^/]+\/status\/\d+/i.test(url.pathname);
  } catch {
    return false;
  }
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
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
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

function requireReportDate(reportDate) {
  if (!isValidDateString(reportDate || "")) {
    throw new Error("reportDate must be YYYY-MM-DD");
  }
  return reportDate;
}

function timeoutInit(timeoutMs) {
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || typeof AbortSignal?.timeout !== "function") {
    return {};
  }
  return { signal: AbortSignal.timeout(timeoutMs) };
}
