import { createDiscoveryFetch, formatDiscoveryErrorNote } from "./discovery.js";
import { loadSourceRegistry, normalizeEnablements } from "./source-registry.js";
import { isValidDateString } from "./time.js";

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
      results.push(healthResult(source, skipped, {
        notes: skipped
      }));
      continue;
    }

    try {
      const response = await fetchImpl(source.url, {
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
  if ((source.source_kind === "rsshub" || source.source_kind === "rss_bridge") && source.base_url_env && !process.env[source.base_url_env]) {
    return "skipped_missing_base_url";
  }
  return "";
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
