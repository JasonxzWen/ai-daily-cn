import fs from "node:fs/promises";
import path from "node:path";
import { loadSourceRegistry } from "./source-registry.js";

const GITHUB_BASE_URL = "https://github.com";
const FETCH_RETRY_NOTES = new WeakMap();
const OSSINSIGHT_TRENDING_SOURCE = source(
  "OSSInsight Trending Repos API",
  "https://api.ossinsight.io/v1/trends/repos/?period=past_24_hours&language=All",
  "all",
  "past_24_hours"
);
const DEFAULT_FOLLOW_BUILDERS_FEEDS = {
  x: "https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-x.json",
  podcasts: "https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-podcasts.json",
  blogs: "https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-blogs.json"
};
const X_SNOWFLAKE_EPOCH_MS = 1288834974657n;
const TAVILY_SEARCH_URL = "https://api.tavily.com/search";
const DEFAULT_X_BUILDER_SEARCH_TERMS = [
  "Claude Code",
  "coding agents",
  "CI coding agents",
  "MCP Claude",
  "Codex agent",
  "AI agents"
];

export const DEFAULT_GITHUB_TRENDING_SOURCES = [
  source("GitHub Trending daily", "https://github.com/trending?since=daily", "all", "daily"),
  source("GitHub Trending weekly", "https://github.com/trending?since=weekly", "all", "weekly"),
  source("GitHub Trending Python daily", "https://github.com/trending/python?since=daily", "python", "daily"),
  source("GitHub Trending Python weekly", "https://github.com/trending/python?since=weekly", "python", "weekly"),
  source("GitHub Trending TypeScript daily", "https://github.com/trending/typescript?since=daily", "typescript", "daily"),
  source("GitHub Trending TypeScript weekly", "https://github.com/trending/typescript?since=weekly", "typescript", "weekly"),
  source("GitHub Trending Rust daily", "https://github.com/trending/rust?since=daily", "rust", "daily"),
  source("GitHub Trending Rust weekly", "https://github.com/trending/rust?since=weekly", "rust", "weekly"),
  source("GitHub Trending Go daily", "https://github.com/trending/go?since=daily", "go", "daily"),
  source("GitHub Trending Go weekly", "https://github.com/trending/go?since=weekly", "go", "weekly")
];

export const DEFAULT_BUILDER_FALLBACK_SOURCES = [
  {
    id: "builder-simon-willison",
    name: "Simon Willison Weblog",
    url: "https://simonwillison.net/atom/everything/",
    author: "Simon Willison",
    role: "builder"
  },
  {
    id: "builder-chip-huyen",
    name: "Chip Huyen Blog",
    url: "https://huyenchip.com/feed.xml",
    author: "Chip Huyen",
    role: "researcher"
  },
  {
    id: "builder-andrej-karpathy",
    name: "Andrej Karpathy Blog",
    url: "https://karpathy.github.io/feed.xml",
    author: "Andrej Karpathy",
    role: "researcher"
  }
];

export const DEFAULT_CONTENT_SOURCES = [
  {
    id: "content-openai-news",
    name: "OpenAI News RSS",
    url: "https://openai.com/news/rss.xml"
  },
  {
    id: "content-anthropic-news",
    name: "Anthropic News",
    url: "https://www.anthropic.com/news",
    format: "html_index",
    linkPattern: "/news/"
  },
  {
    id: "content-hugging-face-blog",
    name: "Hugging Face Blog",
    url: "https://huggingface.co/blog/feed.xml"
  },
  {
    id: "content-github-changelog",
    name: "GitHub Changelog",
    url: "https://github.blog/changelog/feed/"
  },
  {
    id: "content-techcrunch-ai",
    name: "TechCrunch AI",
    url: "https://techcrunch.com/category/artificial-intelligence/feed/"
  },
  {
    id: "content-the-verge-ai",
    name: "The Verge AI",
    url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml"
  },
  {
    id: "content-techcrunch-enterprise",
    name: "TechCrunch Enterprise",
    url: "https://techcrunch.com/category/enterprise/feed/"
  },
  {
    id: "content-the-verge-main",
    name: "The Verge",
    url: "https://www.theverge.com/rss/index.xml"
  },
  {
    id: "content-ars-technica",
    name: "Ars Technica",
    url: "https://feeds.arstechnica.com/arstechnica/index"
  },
  {
    id: "content-google-keyword",
    name: "Google Keyword Blog",
    url: "https://blog.google/rss/"
  },
  {
    id: "content-google-research",
    name: "Google Research Blog",
    url: "https://research.google/blog/rss/"
  },
  {
    id: "content-google-deepmind-blog",
    name: "Google DeepMind Blog",
    url: "https://deepmind.google/discover/blog/",
    format: "html_index",
    linkPattern: "/blog/"
  },
  {
    id: "content-meta-ai-blog",
    name: "Meta AI Blog",
    url: "https://ai.meta.com/blog/",
    format: "html_index",
    linkPattern: "https://ai.meta.com/blog/"
  },
  {
    id: "content-xai-news",
    name: "xAI News",
    url: "https://x.ai/news",
    format: "html_index",
    linkPattern: "/news/"
  },
  {
    id: "content-bytedance-seed-blog",
    name: "ByteDance Seed Tech Blog",
    url: "https://seed.bytedance.com/en/blog?view_from=homepage_tab",
    format: "html_index",
    linkPattern: "/en/blog/"
  },
  {
    id: "content-tiktok-developers-blog",
    name: "TikTok for Developers Blog",
    url: "https://developers.tiktok.com/blogs/",
    format: "html_index",
    linkPattern: "/blog/"
  },
  {
    id: "content-tencent-corporate-ai",
    name: "Tencent AI Business",
    url: "https://www.tencent.com/en-us/business/artificial-intelligence.html",
    format: "html_index",
    linkPattern: "/en-us/articles/"
  },
  {
    id: "content-tencent-hunyuan-blog",
    name: "Tencent Hunyuan Blog",
    url: "https://llm.hunyuan.tencent.com/#/Blog",
    format: "html_index",
    linkPattern: "/blog/"
  },
  {
    id: "content-qwen-blog",
    name: "Qwen Blog",
    url: "https://qwen.ai/blog",
    format: "html_index",
    linkPattern: "/blog/"
  },
  {
    id: "content-alibaba-cloud-blog",
    name: "Alibaba Cloud Blog",
    url: "https://www.alibabacloud.com/blog",
    format: "html_index",
    linkPattern: "/blog/"
  },
  {
    id: "content-kimi-platform-blog",
    name: "Moonshot AI Kimi Platform Blog",
    url: "https://platform.kimi.com/blog",
    format: "html_index",
    linkPattern: "/blog/posts/"
  },
  {
    id: "content-kimi-technical-blog",
    name: "Kimi Technical Blog",
    url: "https://www.kimi.com/blog/",
    format: "html_index",
    linkPattern: "/blog/"
  },
  {
    id: "content-minimax-blog",
    name: "MiniMax Blog",
    url: "https://www.minimax.io/blog",
    format: "html_index",
    linkPattern: "/blog/"
  },
  {
    id: "content-zhipu-research",
    name: "Z.ai Research",
    url: "https://www.zhipuai.cn/en/research",
    format: "html_index",
    linkPattern: "/en/research/"
  },
  {
    id: "content-microsoft-research",
    name: "Microsoft Research Blog",
    url: "https://www.microsoft.com/en-us/research/feed/"
  },
  {
    id: "content-microsoft-official-blog",
    name: "Official Microsoft Blog",
    url: "https://blogs.microsoft.com/feed/"
  },
  {
    id: "content-apple-newsroom",
    name: "Apple Newsroom",
    url: "https://www.apple.com/newsroom/rss-feed.rss"
  },
  {
    id: "content-meta-newsroom",
    name: "Meta Newsroom",
    url: "https://about.fb.com/news/feed/"
  },
  {
    id: "content-amazon-news",
    name: "Amazon News",
    url: "https://www.aboutamazon.com/news/rss"
  },
  {
    id: "content-latent-space",
    name: "Latent.Space",
    url: "https://www.latent.space/feed"
  },
  {
    id: "content-interconnects",
    name: "Interconnects",
    url: "https://www.interconnects.ai/feed"
  },
  {
    id: "content-product-hunt-devtools",
    name: "Product Hunt Developer Tools Feed",
    url: "https://www.producthunt.com/feed?category=developer-tools",
    category: "project",
    signal: "product_hunt"
  },
  {
    id: "content-product-hunt-trending",
    name: "Product Hunt Trending Feed",
    url: "https://www.producthunt.com/feed",
    category: "project",
    signal: "product_hunt"
  },
  {
    id: "content-planet-ai",
    name: "Planet AI",
    url: "https://www.planet-ai.net/rss.xml"
  },
  {
    id: "content-bair",
    name: "BAIR Blog",
    url: "https://bair.berkeley.edu/blog/feed.xml"
  }
];

export const DEFAULT_STATUSPAGE_SOURCES = [
  {
    id: "status-openai",
    name: "OpenAI Status",
    url: "https://status.openai.com/history.atom"
  },
  {
    id: "status-claude",
    name: "Claude Status",
    url: "https://status.claude.com/history.atom"
  }
];

export function createDiscoveryFetch(fetchImpl, options = {}) {
  if (typeof fetchImpl !== "function") {
    return fetchImpl;
  }
  if (fetchImpl.__aiDailyRetryWrapped) {
    return fetchImpl;
  }

  const retries = Number.isInteger(options.fetchRetries)
    ? options.fetchRetries
    : Number.isInteger(options.retryCount)
      ? options.retryCount
      : 1;
  const retryDelayMs = Number.isInteger(options.retryDelayMs)
    ? options.retryDelayMs
    : Number.isInteger(options.fetchRetryDelayMs)
      ? options.fetchRetryDelayMs
      : 1500;

  const wrapped = async (url, init) => {
    let lastError = null;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const response = await fetchImpl(url, init);
        const retryableHttpStatus = shouldRetryHttpStatus(response?.status);
        if (response?.ok) {
          setRetryNote(response, attempt > 0 ? `retry_succeeded_after_${attempt}` : "");
          return response;
        }
        if (!retryableHttpStatus) {
          return response;
        }
        if (attempt >= retries) {
          setRetryNote(response, attempt > 0 ? `retry_failed_after_${attempt}` : "");
          return response;
        }
        lastError = new Error(`HTTP ${response.status}`);
      } catch (error) {
        lastError = error;
        if (attempt >= retries || !isRetryableFetchError(error)) {
          setRetryNote(error, attempt > 0 ? `retry_failed_after_${attempt}` : "");
          throw error;
        }
      }

      await sleep(retryDelayMs);
    }

    if (lastError) {
      setRetryNote(lastError, `retry_failed_after_${retries}`);
      throw lastError;
    }
    return fetchImpl(url, init);
  };

  Object.defineProperty(wrapped, "__aiDailyRetryWrapped", {
    value: true,
    enumerable: false
  });
  return wrapped;
}

function shouldRetryHttpStatus(status) {
  return status === 408 || status === 429 || (Number.isInteger(status) && status >= 500);
}

function isRetryableFetchError(error) {
  return /fetch failed|network|timeout|timed out|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND/i.test(String(error?.message || error));
}

function setRetryNote(target, note) {
  if (target && typeof target === "object" && note) {
    FETCH_RETRY_NOTES.set(target, note);
  }
}

function withRetryNote(notes, target) {
  const note = target && typeof target === "object" ? FETCH_RETRY_NOTES.get(target) : "";
  return note ? `${notes}; ${note}` : notes;
}

function sleep(ms) {
  if (!ms || ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function collectGitHubTrending(options = {}) {
  if (options.browserExportPath || options.browserExport) {
    return collectGitHubTrendingFromBrowserExport(options);
  }

  const fetchImpl = createDiscoveryFetch(options.fetchImpl || globalThis.fetch, options);
  if (typeof fetchImpl !== "function") {
    throw new Error("fetch is not available in this runtime");
  }

  const sources = options.sources || DEFAULT_GITHUB_TRENDING_SOURCES;
  const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : 50;
  const sourceResults = [];
  const byRepo = new Map();

  for (const currentSource of sources) {
    try {
      const response = await fetchImpl(currentSource.url, {
        headers: {
          "user-agent": "ai-daily-cn-static-publisher"
        }
      });
      if (!response.ok) {
        sourceResults.push({
          name: currentSource.name,
          url: currentSource.url,
          status: "blocked",
          notes: withRetryNote(`HTTP ${response.status}`, response)
        });
        continue;
      }

      const html = await response.text();
      const parsed = parseGitHubTrendingHtml(html, currentSource);
      sourceResults.push({
        name: currentSource.name,
        url: currentSource.url,
        status: parsed.length > 0 ? "checked" : "no_signal",
        notes: withRetryNote(`${parsed.length} repositories parsed`, response)
      });

      for (const candidate of parsed) {
        if (!byRepo.has(candidate.repo)) {
          byRepo.set(candidate.repo, enrichProjectCandidate(candidate, currentSource, options.reportDate));
        }
      }
    } catch (error) {
      sourceResults.push({
        name: currentSource.name,
        url: currentSource.url,
        status: "blocked",
        notes: withRetryNote(error.message, error)
      });
    }
  }

  if (byRepo.size === 0 && options.ossInsightFallback !== false) {
    await collectOssInsightTrendingFallback({
      byRepo,
      sourceResults,
      fetchImpl,
      limit,
      reportDate: options.reportDate
    });
  }

  const history = await loadGitHubTrendingHistory(options);
  const candidates = annotateGitHubTrendingCandidates([...byRepo.values()].slice(0, limit), history);
  return {
    source_audit: {
      github_trending: {
        checked: true,
        sources: sourceResults,
        candidates_found: byRepo.size,
        included: 0,
        notes: githubTrendingAuditNotes(
          "Candidates require release, star velocity, notable PR, recent commit, or runnable artifact review before inclusion.",
          history
        )
      }
    },
    candidates
  };
}

async function collectGitHubTrendingFromBrowserExport(options = {}) {
  const sources = await readBrowserExportSources(options.browserExportPath || options.browserExport, {
    name: options.browserExportName || "GitHub Trending browser export",
    url: options.browserExportUrl || DEFAULT_GITHUB_TRENDING_SOURCES[0].url,
    language: options.browserExportLanguage || DEFAULT_GITHUB_TRENDING_SOURCES[0].language,
    window: options.browserExportWindow || DEFAULT_GITHUB_TRENDING_SOURCES[0].window
  });
  const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : 50;
  const sourceResults = [];
  const byRepo = new Map();

  for (const exportSource of sources) {
    const parsed = parseGitHubTrendingHtml(exportSource.html, exportSource);
    sourceResults.push({
      name: exportSource.name,
      url: exportSource.url,
      status: parsed.length > 0 ? "checked" : "no_signal",
      notes: `${parsed.length} repositories parsed from browser export`
    });

    for (const candidate of parsed) {
      if (!byRepo.has(candidate.repo)) {
        byRepo.set(candidate.repo, enrichProjectCandidate(candidate, exportSource, options.reportDate));
      }
    }
  }

  const history = await loadGitHubTrendingHistory(options);
  const candidates = annotateGitHubTrendingCandidates([...byRepo.values()].slice(0, limit), history);
  return {
    source_audit: {
      github_trending: {
        checked: true,
        sources: sourceResults,
        candidates_found: byRepo.size,
        included: 0,
        notes: githubTrendingAuditNotes(
          "Candidates parsed from browser-export input; still require release, star velocity, notable PR, recent commit, or runnable artifact review before inclusion.",
          history
        )
      }
    },
    candidates
  };
}

async function collectOssInsightTrendingFallback({ byRepo, sourceResults, fetchImpl, limit, reportDate }) {
  try {
    const response = await fetchImpl(OSSINSIGHT_TRENDING_SOURCE.url, {
      headers: {
        accept: "application/json",
        "user-agent": "ai-daily-cn-static-publisher"
      }
    });
    if (!response.ok) {
      sourceResults.push({
        name: OSSINSIGHT_TRENDING_SOURCE.name,
        url: OSSINSIGHT_TRENDING_SOURCE.url,
        status: "blocked",
        notes: withRetryNote(`HTTP ${response.status}`, response)
      });
      return;
    }

    const payload = await readJsonResponse(response);
    const parsed = parseOssInsightTrendingPayload(payload, OSSINSIGHT_TRENDING_SOURCE)
      .map((candidate) => enrichProjectCandidate(candidate, OSSINSIGHT_TRENDING_SOURCE, reportDate))
      .slice(0, limit);
    sourceResults.push({
      name: OSSINSIGHT_TRENDING_SOURCE.name,
      url: OSSINSIGHT_TRENDING_SOURCE.url,
      status: parsed.length > 0 ? "checked" : "no_signal",
      notes: withRetryNote(`${parsed.length} repositories parsed from OSSInsight API fallback`, response)
    });

    for (const candidate of parsed) {
      if (!byRepo.has(candidate.repo)) {
        byRepo.set(candidate.repo, candidate);
      }
    }
  } catch (error) {
    sourceResults.push({
      name: OSSINSIGHT_TRENDING_SOURCE.name,
      url: OSSINSIGHT_TRENDING_SOURCE.url,
      status: "blocked",
      notes: withRetryNote(error.message, error)
    });
  }
}

export function parseOssInsightTrendingPayload(payload, sourceInfo = OSSINSIGHT_TRENDING_SOURCE) {
  const rows = Array.isArray(payload?.data?.rows)
    ? payload.data.rows
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.rows)
        ? payload.rows
        : [];

  const candidates = [];
  for (const row of rows) {
    const repo = normalizeRepoFromOssInsightRow(row);
    if (!repo) {
      continue;
    }
    const description = firstString(row.description, row.repo_description, row.about, "");
    const language = firstString(row.primary_language, row.language, "");
    const score = firstString(row.total_score, row.score, row.stars, "");
    candidates.push({
      repo,
      url: row.repo_url || `${GITHUB_BASE_URL}/${repo}`,
      source: sourceInfo.name,
      source_url: sourceInfo.url,
      signal: "trending",
      language,
      window: sourceInfo.window || "past_24_hours",
      rank: candidates.length + 1,
      description,
      evidence: score ? `${repo} appeared in OSSInsight trending with score ${score}.` : `${repo} appeared in OSSInsight trending.`
    });
  }
  return candidates;
}

export async function collectBuilderFallbacks(options = {}) {
  const fetchImpl = createDiscoveryFetch(options.fetchImpl || globalThis.fetch, options);
  if (typeof fetchImpl !== "function") {
    throw new Error("fetch is not available in this runtime");
  }

  const reportDate = requireReportDate(options.reportDate);
  const generatedAt = options.generatedAt || new Date().toISOString();
  const sources = await loadSources(options.sources, options.sourcesPath, DEFAULT_BUILDER_FALLBACK_SOURCES);
  const sourceResults = [];
  const candidateSources = [];
  const candidates = [];
  const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : 20;
  const lookbackDays = Number.isInteger(options.lookbackDays) ? options.lookbackDays : 2;
  const followBuildersFeeds = options.followBuildersFeeds === false
    ? null
    : normalizeFollowBuildersFeeds(options.followBuildersFeeds || DEFAULT_FOLLOW_BUILDERS_FEEDS);

  if (followBuildersFeeds) {
    await collectFollowBuildersCentralFeeds({
      feeds: followBuildersFeeds,
      fetchImpl,
      reportDate,
      lookbackDays,
      generatedAt,
      sourceResults,
      candidateSources,
      candidates,
      limit
    });
  }

  if (followBuildersFeeds && options.xSearchFallback !== false && !hasXStatusCandidate(candidates)) {
    await collectXBuilderSearchFallback({
      fetchImpl,
      reportDate,
      lookbackDays,
      generatedAt,
      sourceResults,
      candidateSources,
      candidates,
      limit,
      apiKey: Object.hasOwn(options, "xSearchApiKey") ? options.xSearchApiKey : process.env.TAVILY_API_KEY,
      queries: options.xSearchQueries,
      perQueryLimit: Number.parseInt(options.xSearchPerQueryLimit || "8", 10)
    });
  }

  for (const rawSource of sources) {
    const currentSource = normalizeBuilderSource(rawSource);
    candidateSources.push(toCandidateSource(currentSource, "builder", generatedAt, "blocked", ""));

    try {
      const response = await fetchImpl(currentSource.url, {
        headers: {
          accept: "application/atom+xml, application/rss+xml, application/xml, text/xml, */*",
          "user-agent": "ai-daily-cn-static-publisher"
        }
      });
      if (!response.ok) {
        const notes = withRetryNote(`HTTP ${response.status}`, response);
        markSource(candidateSources.at(-1), "blocked", notes);
        sourceResults.push(auditSource(currentSource.name, currentSource.url, "blocked", notes));
        continue;
      }

      const entries = parseFeedEntries(await response.text())
        .filter((entry) => entry.url && entry.title && isWithinReportWindow(entry.event_date, reportDate, lookbackDays))
        .slice(0, limit);
      const status = entries.length > 0 ? "checked" : "no_signal";
      const notes = withRetryNote(`${entries.length} recent original entries parsed`, response);
      markSource(candidateSources.at(-1), status, notes);
      sourceResults.push(auditSource(currentSource.name, currentSource.url, status, notes));

      for (const entry of entries) {
        candidates.push({
          id: uniqueCandidateId(candidates, `${currentSource.id}-${entry.title}`),
          source_id: currentSource.id,
          category: "builder_observation",
          title: `${currentSource.author || currentSource.name}: ${entry.title}`,
          url: entry.url,
          source: currentSource.name,
          event_date: entry.event_date,
          status: "excluded",
          evidence: summarizeEvidence(entry.summary, `${currentSource.author || currentSource.name} published this original feed entry.`)
        });
      }
    } catch (error) {
      const notes = withRetryNote(error.message, error);
      markSource(candidateSources.at(-1), "blocked", notes);
      sourceResults.push(auditSource(currentSource.name, currentSource.url, "blocked", notes));
    }
  }

  return {
    source_audit: {
      builder_sources: {
        checked: true,
        sources: sourceResults,
        candidates_found: candidates.length,
        included: 0,
        blocked_reason: inferBuilderBlockedReason(sourceResults, candidates),
        last_successful_feed_at: candidates.length > 0 ? generatedAt : null,
        notes: followBuildersFeeds
          ? "follow-builders central feed is checked before X search fallback and fixed RSS/Atom fallback; X observations must keep an original status URL."
          : "Fixed original-source fallback; each candidate comes from a directly fetched RSS/Atom feed."
      }
    },
    sources: candidateSources,
    candidates: candidates.slice(0, limit)
  };
}

async function collectXBuilderSearchFallback({ fetchImpl, reportDate, lookbackDays, generatedAt, sourceResults, candidateSources, candidates, limit, apiKey, queries, perQueryLimit }) {
  const sourceItem = {
    id: "x-builder-search-tavily",
    name: "Tavily X builder search fallback",
    url: TAVILY_SEARCH_URL,
    category: "builder"
  };
  candidateSources.push(toCandidateSource(sourceItem, "builder", generatedAt, "blocked", ""));

  if (!apiKey) {
    markSource(candidateSources.at(-1), "blocked", "skipped_missing_token");
    sourceResults.push(auditSource(sourceItem.name, sourceItem.url, "skipped_missing_token", "skipped_missing_token"));
    return;
  }

  const seenUrls = new Set(candidates.map((candidate) => candidate.url));
  let hitCount = 0;
  let blockedNote = "";
  const searchQueries = Array.isArray(queries) && queries.length > 0
    ? queries
    : buildXBuilderSearchQueries(reportDate);

  for (const query of searchQueries) {
    if (candidates.length >= limit) {
      break;
    }
    try {
      const response = await fetchImpl(sourceItem.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey,
          query,
          max_results: Math.max(1, perQueryLimit || 8),
          include_answer: false,
          include_raw_content: false,
          search_depth: "advanced",
          include_domains: ["x.com"]
        })
      });
      if (!response.ok) {
        blockedNote = withRetryNote(`HTTP ${response.status}`, response);
        continue;
      }

      const payload = await readJsonResponse(response);
      const parsed = parseXBuilderSearchResults(payload, {
        sourceItem,
        reportDate,
        lookbackDays,
        query
      });
      for (const entry of parsed) {
        if (candidates.length >= limit || seenUrls.has(entry.url)) {
          continue;
        }
        seenUrls.add(entry.url);
        hitCount += 1;
        candidates.push({
          ...entry,
          id: uniqueCandidateId(candidates, entry.id || `${sourceItem.id}-${entry.url}`)
        });
      }
    } catch (error) {
      blockedNote = withRetryNote(error.message, error);
    }
  }

  const status = hitCount > 0 ? "checked" : blockedNote ? "blocked" : "no_signal";
  const notes = hitCount > 0
    ? `${hitCount} recent original X status entries parsed`
    : blockedNote || "0 recent original X status entries parsed";
  markSource(candidateSources.at(-1), status, notes);
  sourceResults.push(auditSource(sourceItem.name, sourceItem.url, status, notes));
}

function buildXBuilderSearchQueries(reportDate) {
  const dates = [reportDate, ...previousDateStrings(reportDate, 1)]
    .map((date) => formatSearchDate(date))
    .filter(Boolean);
  return dates.flatMap((dateText) =>
    DEFAULT_X_BUILDER_SEARCH_TERMS.map((term) => `site:x.com/*/status "${dateText}" "${term}"`)
  );
}

function parseXBuilderSearchResults(payload, { sourceItem, reportDate, lookbackDays, query }) {
  return arrayFromPossibleKeys(payload, ["results"])
    .map((item) => {
      const url = normalizeXStatusUrl(item.url);
      const eventDate = xStatusDate(url);
      const content = cleanText(item.content || item.raw_content || item.title);
      if (!url || !content || !isWithinReportWindow(eventDate, reportDate, lookbackDays)) {
        return null;
      }
      const handle = xStatusHandle(url);
      const author = handle ? `@${handle}` : "X builder";
      return {
        source_id: sourceItem.id,
        category: "builder_observation",
        title: `${author}: ${shortenCandidateTitle(item.title || content)}`,
        url,
        source: sourceItem.name,
        event_date: eventDate,
        status: "excluded",
        evidence: summarizeEvidence(content, `${author} posted this original X status.`),
        original_url: url,
        verification_status: "original_social_only",
        verification_sources: [url],
        notes: `x_search_query=${sanitizeNoteValue(query)}`
      };
    })
    .filter(Boolean);
}

async function collectFollowBuildersCentralFeeds(context) {
  await collectSingleFollowBuildersFeed({
    ...context,
    key: "x",
    sourceItem: {
      id: "follow-builders-x",
      name: "follow-builders X feed",
      url: context.feeds.x,
      category: "builder"
    },
    parser: parseFollowBuildersXFeed
  });
  await collectSingleFollowBuildersFeed({
    ...context,
    key: "podcasts",
    sourceItem: {
      id: "follow-builders-podcasts",
      name: "follow-builders podcast feed",
      url: context.feeds.podcasts,
      category: "builder"
    },
    parser: parseFollowBuildersPodcastFeed
  });
  await collectSingleFollowBuildersFeed({
    ...context,
    key: "blogs",
    sourceItem: {
      id: "follow-builders-blogs",
      name: "follow-builders blog feed",
      url: context.feeds.blogs,
      category: "blog"
    },
    parser: parseFollowBuildersBlogFeed
  });
}

async function collectSingleFollowBuildersFeed({ sourceItem, parser, fetchImpl, reportDate, lookbackDays, generatedAt, sourceResults, candidateSources, candidates, limit }) {
  if (!sourceItem.url) {
    return;
  }

  candidateSources.push(toCandidateSource(sourceItem, sourceItem.category, generatedAt, "blocked", ""));
  try {
    const response = await fetchImpl(sourceItem.url, {
      headers: {
        accept: "application/json, */*",
        "user-agent": "ai-daily-cn-static-publisher"
      }
    });
    if (!response.ok) {
      const notes = withRetryNote(`HTTP ${response.status}`, response);
      markSource(candidateSources.at(-1), "blocked", notes);
      sourceResults.push(auditSource(sourceItem.name, sourceItem.url, "blocked", notes));
      return;
    }

    const payload = await readJsonResponse(response);
    const allParsed = parser(payload, {
      sourceItem,
      reportDate,
      lookbackDays
    });
    const parsed = allParsed.slice(0, Math.max(limit - candidates.length, 0));
    const upstreamErrors = followBuildersPayloadErrors(payload);
    const status = allParsed.length > 0 ? "checked" : upstreamErrors ? "blocked" : "no_signal";
    const notes = withRetryNote(
      upstreamErrors
        ? `${allParsed.length} recent original entries parsed; upstream_error=${upstreamErrors}`
        : `${allParsed.length} recent original entries parsed`,
      response
    );
    markSource(candidateSources.at(-1), status, notes);
    sourceResults.push(auditSource(sourceItem.name, sourceItem.url, status, notes));

    for (const entry of parsed) {
      candidates.push({
        ...entry,
        id: uniqueCandidateId(candidates, entry.id || `${sourceItem.id}-${entry.title}`)
      });
    }
  } catch (error) {
    const notes = withRetryNote(error.message, error);
    markSource(candidateSources.at(-1), "blocked", notes);
    sourceResults.push(auditSource(sourceItem.name, sourceItem.url, "blocked", notes));
  }
}

function followBuildersPayloadErrors(payload) {
  const errors = Array.isArray(payload?.errors) ? payload.errors : [];
  return errors
    .map((error) => cleanText(typeof error === "string" ? error : error?.message || JSON.stringify(error)))
    .filter(Boolean)
    .join(" | ")
    .slice(0, 240);
}

function parseFollowBuildersXFeed(payload, { sourceItem, reportDate, lookbackDays }) {
  const builders = Array.isArray(payload?.x) ? payload.x : Array.isArray(payload?.builders) ? payload.builders : [];
  const entries = [];
  for (const builder of builders) {
    const tweets = Array.isArray(builder?.tweets) ? builder.tweets : [];
    for (const tweet of tweets) {
      const eventDate = dateOnly(tweet.createdAt || tweet.created_at || tweet.date);
      if (!tweet.url || !tweet.text || !isWithinReportWindow(eventDate, reportDate, lookbackDays)) {
        continue;
      }
      const author = builder.name || builder.handle || "Builder";
      entries.push({
        source_id: sourceItem.id,
        category: "builder_observation",
        title: `${author}: ${shortenCandidateTitle(tweet.text)}`,
        url: tweet.url,
        source: sourceItem.name,
        event_date: eventDate,
        status: "excluded",
        evidence: summarizeEvidence(tweet.text, `${author} posted this original X update.`)
      });
    }
  }
  return entries;
}

function parseFollowBuildersPodcastFeed(payload, { sourceItem, reportDate, lookbackDays }) {
  const episodes = arrayFromPossibleKeys(payload, ["podcasts", "episodes"]);
  return episodes
    .map((episode) => {
      const eventDate = dateOnly(episode.publishedAt || episode.published_at || episode.pubDate || episode.date);
      if (!episode.url || !episode.title || !isWithinReportWindow(eventDate, reportDate, lookbackDays)) {
        return null;
      }
      return {
        source_id: sourceItem.id,
        category: "builder_observation",
        title: episode.name ? `${episode.name}: ${episode.title}` : episode.title,
        url: episode.url,
        source: sourceItem.name,
        event_date: eventDate,
        status: "excluded",
        evidence: summarizeEvidence(episode.summary || episode.description || episode.transcript, "follow-builders podcast episode.")
      };
    })
    .filter(Boolean);
}

function parseFollowBuildersBlogFeed(payload, { sourceItem, reportDate, lookbackDays }) {
  const posts = arrayFromPossibleKeys(payload, ["blogs", "posts", "articles"]);
  return posts
    .map((post) => {
      const eventDate = dateOnly(post.publishedAt || post.published_at || post.pubDate || post.date || post.event_date);
      if (!post.url || !post.title || !isWithinReportWindow(eventDate, reportDate, lookbackDays)) {
        return null;
      }
      return {
        source_id: sourceItem.id,
        category: "hot_blog",
        title: post.title,
        url: post.url,
        source: post.source || post.publisher || sourceItem.name,
        event_date: eventDate,
        status: "excluded",
        evidence: summarizeEvidence(post.summary || post.description || post.content, "follow-builders blog entry.")
      };
    })
    .filter(Boolean);
}

export async function collectContentSources(options = {}) {
  const fetchImpl = createDiscoveryFetch(options.fetchImpl || globalThis.fetch, options);
  if (typeof fetchImpl !== "function") {
    throw new Error("fetch is not available in this runtime");
  }

  const reportDate = requireReportDate(options.reportDate);
  const generatedAt = options.generatedAt || new Date().toISOString();
  const sources = await loadContentSources(options);
  const sourceResults = [];
  const candidateSources = [];
  const candidates = [];
  const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : 20;
  const perSourceLimit = Number.isInteger(options.perSourceLimit) && options.perSourceLimit > 0 ? options.perSourceLimit : 3;
  const lookbackDays = Number.isInteger(options.lookbackDays) ? options.lookbackDays : 2;
  const startedAt = Date.now();
  const budgetMs = Number.isInteger(options.budgetMs) && options.budgetMs > 0 ? options.budgetMs : 300000;

  for (const rawSource of sources) {
    const currentSource = normalizeGenericSource(rawSource, "content");
    const { sourceCategory, candidateCategory, entryLabel } = contentSourceKinds(currentSource);
    candidateSources.push(toCandidateSource(currentSource, sourceCategory, generatedAt, "blocked", ""));
    if (Date.now() - startedAt > budgetMs) {
      markSource(candidateSources.at(-1), "blocked", "budget_exceeded");
      sourceResults.push(auditSource(currentSource.name, currentSource.url, "blocked", "budget_exceeded"));
      continue;
    }

    try {
      const response = await fetchImpl(currentSource.url, {
        headers: {
          accept: "application/atom+xml, application/rss+xml, application/xml, text/xml, text/html, */*",
          "user-agent": "ai-daily-cn-static-publisher"
        },
        ...timeoutInit(currentSource.timeoutMs || currentSource.timeout_ms || 15000)
      });
      if (!response.ok) {
        const notes = withRetryNote(`HTTP ${response.status}`, response);
        markSource(candidateSources.at(-1), "blocked", notes);
        sourceResults.push(auditSource(currentSource.name, currentSource.url, "blocked", notes));
        continue;
      }

      const entries = parseContentSourceEntries(await response.text(), currentSource)
        .filter((entry) => entry.url && entry.title && isWithinReportWindow(entry.event_date, reportDate, lookbackDays));
      const status = entries.length > 0 ? "checked" : "no_signal";
      let notes = withRetryNote(`${entries.length} recent ${entryLabel} entries parsed`, response);
      let confirmedProductCrossChecks = 0;
      let unresolvedProductCrossChecks = 0;
      let skippedOriginalUrlChecks = 0;

      const sourceLimit = Number.isInteger(currentSource.maxItemsPerRun) && currentSource.maxItemsPerRun > 0
        ? currentSource.maxItemsPerRun
        : perSourceLimit;
      for (const entry of entries.slice(0, Math.min(sourceLimit, Math.max(limit - candidates.length, 0)))) {
        const originalUrl = originalRequiredUrlForEntry(entry, currentSource);
        if (requiresOriginalUrl(currentSource) && !originalUrl) {
          skippedOriginalUrlChecks += 1;
          continue;
        }
        let candidate = {
          id: uniqueCandidateId(candidates, `${currentSource.id}-${entry.title}`),
          source_id: currentSource.id,
          category: candidateCategory,
          title: entry.title,
          url: originalUrl || entry.url,
          source: currentSource.name,
          event_date: entry.event_date,
          status: "excluded",
          evidence: contentCandidateEvidence(entry, currentSource, candidateCategory, entryLabel),
          notes: contentCandidateNotes(entry, currentSource, originalUrl),
          ...contentVerificationFields(entry, currentSource, originalUrl),
          ...(candidateCategory === "project" ? { signal: currentSource.signal || "product_hunt" } : {})
        };

        if (candidateCategory === "project" && shouldCrossCheckProductCandidate(currentSource, options)) {
          const result = await crossCheckProductCandidate({
            candidate,
            productHuntUrl: entry.url,
            feedLinks: entry.links,
            fetchImpl
          });
          candidate = result.candidate;
          if (result.status === "confirmed") {
            confirmedProductCrossChecks += 1;
          } else if (result.status !== "skipped") {
            unresolvedProductCrossChecks += 1;
          }
        }

        candidates.push(candidate);
      }

      if (candidateCategory === "project" && shouldCrossCheckProductCandidate(currentSource, options)) {
        notes = `${notes}; ${confirmedProductCrossChecks} product cross-checks confirmed`;
        if (unresolvedProductCrossChecks > 0) {
          notes = `${notes}; ${unresolvedProductCrossChecks} unresolved`;
        }
      }
      if (requiresOriginalUrl(currentSource)) {
        notes = `${notes}; ${skippedOriginalUrlChecks} skipped without original URL`;
      }
      markSource(candidateSources.at(-1), status, notes);
      sourceResults.push(auditSource(currentSource.name, currentSource.url, status, notes));
    } catch (error) {
      const notes = withRetryNote(error.message, error);
      markSource(candidateSources.at(-1), "blocked", notes);
      sourceResults.push(auditSource(currentSource.name, currentSource.url, "blocked", notes));
    }
  }

  return {
    source_audit: {
      content_sources: {
        checked: true,
        sources: sourceResults,
        candidates_found: candidates.length,
        included: 0,
        sources_checked: sourceResults.length,
        enablement_counts: countBy(sources, "enablement"),
        tier_counts: countBy(sources, "tier"),
        source_kind_counts: countBy(sources, "source_kind"),
        blocked_reason: candidates.length > 0 ? "" : inferBuilderBlockedReason(sourceResults),
        last_successful_feed_at: candidates.length > 0 ? generatedAt : null,
        notes: "Official labs, broad tech/big-tech newsrooms, engineering blogs, high-quality newsletters, interviews, aggregators, podcast platforms, intermediary/self-media leads, X-hotspot feeds, and product feeds are checked as content/project/community candidates. Intermediary and self-media leads are discovery-only until traced to primary sources. Product Hunt project candidates are cross-checked against product homepages, GitHub, README, or docs before they become easier project candidates. X-hotspot feeds must preserve original x.com/twitter.com URLs."
      }
    },
    sources: candidateSources,
    candidates: candidates.slice(0, limit)
  };
}

async function loadContentSources(options = {}) {
  if (Array.isArray(options.sources) || options.sourcesPath) {
    return loadSources(options.sources, options.sourcesPath, DEFAULT_CONTENT_SOURCES);
  }

  try {
    const registry = await loadSourceRegistry({
      rootDir: options.rootDir || process.cwd(),
      sourcesPath: options.registryPath || path.join("config", "sources"),
      includeEnablement: options.enablement || "core"
    });
    return registry.sources;
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
    return DEFAULT_CONTENT_SOURCES;
  }
}

function contentSourceKinds(sourceInfo) {
  if (sourceInfo.candidate_category === "project" || sourceInfo.category === "project") {
    return { sourceCategory: "project", candidateCategory: "project", entryLabel: "product/project" };
  }
  if (sourceInfo.candidate_category === "community_lead" || sourceInfo.category === "intermediary") {
    return { sourceCategory: "community", candidateCategory: "community_lead", entryLabel: "intermediary lead" };
  }
  if (sourceInfo.category === "x_hotspot") {
    return { sourceCategory: "community", candidateCategory: "community_lead", entryLabel: "X hotspot" };
  }
  return { sourceCategory: "blog", candidateCategory: sourceInfo.candidate_category || "hot_blog", entryLabel: "blog/interview" };
}

function requiresOriginalUrl(sourceInfo) {
  return sourceInfo.requiresOriginalUrl === true || sourceInfo.requires_original_url === true || sourceInfo.category === "x_hotspot";
}

function originalRequiredUrlForEntry(entry, sourceInfo) {
  if (!requiresOriginalUrl(sourceInfo)) {
    return "";
  }
  return [entry.url, ...(Array.isArray(entry.links) ? entry.links : [])].find(isOriginalXUrl) || "";
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

function contentCandidateEvidence(entry, sourceInfo, candidateCategory, entryLabel) {
  const fallback = `${sourceInfo.name} published this ${entryLabel} entry.`;
  const evidence = summarizeEvidence(entry.summary, fallback);
  if (sourceInfo.category === "intermediary" || sourceInfo.authority === "intermediary" || sourceInfo.verification_policy === "primary_required") {
    return appendSentence(evidence, "This is an intermediary/self-media lead; trace it to a primary source before treating it as a reported fact.");
  }
  if (sourceInfo.category === "x_hotspot") {
    return appendSentence(evidence, "This X-hotspot lead keeps an original X URL and should not be used as a factual report without primary-source confirmation.");
  }
  if (candidateCategory === "community_lead") {
    return appendSentence(evidence, "Treat this as a community lead unless it is backed by a primary source.");
  }
  return evidence;
}

function contentCandidateNotes(entry, sourceInfo, originalUrl) {
  const parts = [];
  if (sourceInfo.category === "intermediary" || sourceInfo.authority === "intermediary" || sourceInfo.verification_policy === "primary_required") {
    parts.push(`intermediary_url=${entry.url}`, "primary_verification_required=true");
  }
  if (sourceInfo.category === "x_hotspot") {
    parts.push(`feed_url=${entry.url}`, `original_url=${originalUrl}`, "primary_verification_required=true");
  }
  return parts.join("; ");
}

function contentVerificationFields(entry, sourceInfo, originalUrl) {
  const status = contentVerificationStatus(sourceInfo, originalUrl);
  const fields = {
    verification_status: status,
    verification_sources: []
  };
  if (sourceInfo.authority === "intermediary" || sourceInfo.authority === "secondary" || sourceInfo.authority === "aggregator" || sourceInfo.verification_policy === "primary_required") {
    fields.intermediary_url = entry.url;
  }
  if (originalUrl) {
    fields.original_url = originalUrl;
  }
  if (status === "primary_confirmed") {
    fields.primary_url = originalUrl || entry.url;
    fields.verification_sources = [fields.primary_url];
  }
  if (status === "original_social_only" && originalUrl) {
    fields.verification_sources = [originalUrl];
  }
  return fields;
}

function contentVerificationStatus(sourceInfo, originalUrl) {
  if (sourceInfo.category === "x_hotspot") {
    return originalUrl ? "original_social_only" : "unverified";
  }
  if (sourceInfo.authority === "primary" && sourceInfo.verification_policy !== "primary_required") {
    return "primary_confirmed";
  }
  if (sourceInfo.verification_policy === "community_only") {
    return "original_social_only";
  }
  if (sourceInfo.verification_policy === "multi_source_required") {
    return "unverified";
  }
  return "intermediary_only";
}

function shouldCrossCheckProductCandidate(sourceInfo, options = {}) {
  if (options.productCrossCheck === false) {
    return false;
  }
  const sourceText = `${sourceInfo.name || ""} ${sourceInfo.url || ""} ${sourceInfo.signal || ""}`.toLowerCase();
  return sourceInfo.signal === "product_hunt" || sourceText.includes("product hunt") || sourceText.includes("producthunt.com");
}

async function crossCheckProductCandidate({ candidate, productHuntUrl, feedLinks = [], fetchImpl }) {
  try {
    let confirmationLinks = normalizeProductConfirmationLinks(feedLinks);
    if (confirmationLinks.length === 0) {
      const productResponse = await fetchHtml(fetchImpl, productHuntUrl);
      if (!productResponse.ok) {
        return unresolvedProductCandidate(candidate, productHuntUrl, `product_page_http_${productResponse.status}`);
      }

      confirmationLinks = extractProductConfirmationLinks(await productResponse.text(), productHuntUrl);
      if (confirmationLinks.length === 0) {
        return unresolvedProductCandidate(candidate, productHuntUrl, "no_external_confirmation_link");
      }
    }

    const fetchErrors = [];
    for (const link of confirmationLinks.slice(0, 3)) {
      try {
        const confirmationResponse = await fetchHtml(fetchImpl, link.url);
        if (!confirmationResponse.ok) {
          fetchErrors.push(`${link.type}:HTTP_${confirmationResponse.status}`);
          continue;
        }
        const finalUrl = typeof confirmationResponse.url === "string" && confirmationResponse.url
          ? confirmationResponse.url
          : link.url;
        if (isLowValueProductLink(finalUrl)) {
          fetchErrors.push(`${link.type}:low_value_final_url`);
          continue;
        }
        const confirmationType = classifyProductConfirmationUrl(finalUrl) || link.type;
        const summary = summarizeProductConfirmationHtml(await confirmationResponse.text());
        if (!summary) {
          fetchErrors.push(`${link.type}:empty_summary`);
          continue;
        }
        if (!isUsefulProductConfirmationSummary(summary)) {
          fetchErrors.push(`${link.type}:low_quality_summary`);
          continue;
        }
        return {
          status: "confirmed",
          candidate: {
            ...candidate,
            url: finalUrl,
            primary_url: finalUrl,
            verification_status: "primary_confirmed",
            verification_sources: [finalUrl],
            evidence: appendSentence(candidate.evidence, `已打开 ${productConfirmationLabel(confirmationType)} 确认用途：${summary}`),
            notes: appendSentence(
              candidate.notes,
              `product_hunt_url=${productHuntUrl}; product_cross_check=confirmed; confirmation_url=${finalUrl}; confirmation_type=${confirmationType}`
            )
          }
        };
      } catch (error) {
        fetchErrors.push(`${link.type}:${error.message}`);
      }
    }
    return unresolvedProductCandidate(candidate, productHuntUrl, fetchErrors.join("|") || "confirmation_fetch_failed");
  } catch (error) {
    return unresolvedProductCandidate(candidate, productHuntUrl, error.message);
  }
}

async function fetchHtml(fetchImpl, url) {
  return fetchImpl(url, {
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "user-agent": "ai-daily-cn-static-publisher"
    },
    ...timeoutInit(15000)
  });
}

function unresolvedProductCandidate(candidate, productHuntUrl, reason) {
  return {
    status: "unresolved",
    candidate: {
      ...candidate,
      verification_status: candidate.verification_status === "primary_confirmed" ? "primary_confirmed" : "intermediary_only",
      notes: appendSentence(candidate.notes, `product_hunt_url=${productHuntUrl}; product_cross_check=unresolved; reason=${sanitizeNoteValue(reason)}`)
    }
  };
}

function extractProductConfirmationLinks(html, baseUrl) {
  const links = [];
  const seen = new Set();
  const anchorPattern = /<a\b[^>]*href=(?:"([^"]+)"|'([^']+)'|([^'"\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(anchorPattern)) {
    const url = absoluteUrl(decodeXml(match[1] || match[2] || match[3] || ""), baseUrl);
    if (!url || seen.has(url) || isLowValueProductLink(url)) {
      continue;
    }
    const type = classifyProductConfirmationUrl(url);
    if (!type) {
      continue;
    }
    seen.add(url);
    links.push({
      url,
      type,
      score: productConfirmationScore(type)
    });
  }
  return links.sort((left, right) => right.score - left.score || left.url.localeCompare(right.url));
}

function normalizeProductConfirmationLinks(urls = []) {
  const links = [];
  const seen = new Set();
  for (const rawUrl of urls) {
    const url = String(rawUrl || "").trim();
    if (!url || seen.has(url) || isLowValueProductLink(url)) {
      continue;
    }
    const type = classifyProductConfirmationUrl(url);
    if (!type) {
      continue;
    }
    seen.add(url);
    links.push({
      url,
      type,
      score: productConfirmationScore(type)
    });
  }
  return links.sort((left, right) => right.score - left.score || left.url.localeCompare(right.url));
}

function classifyProductConfirmationUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const pathName = url.pathname.toLowerCase();
    if (host === "producthunt.com" && pathName.startsWith("/r/")) {
      return "redirect";
    }
    if (host === "github.com" && normalizeRepoFromGitHubUrl(value)) {
      return "github";
    }
    if (host.includes("docs.") || /\/(docs|documentation|developers|api|readme)(\/|$)/i.test(pathName)) {
      return "docs";
    }
    return "homepage";
  } catch {
    return "";
  }
}

function productConfirmationScore(type) {
  return {
    github: 30,
    redirect: 25,
    docs: 20,
    homepage: 10
  }[type] || 0;
}

function isLowValueProductLink(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "producthunt.com" && url.pathname.toLowerCase().startsWith("/r/")) {
      return false;
    }
    if (host === "producthunt.com" || host.endsWith(".producthunt.com")) {
      return true;
    }
    if (host === "lu.ma" && url.pathname.toLowerCase().includes("producthunt")) {
      return true;
    }
    return [
      "x.com",
      "twitter.com",
      "facebook.com",
      "linkedin.com",
      "instagram.com",
      "youtube.com",
      "discord.gg",
      "discord.com",
      "t.me",
      "reddit.com"
    ].includes(host);
  } catch {
    return true;
  }
}

function productConfirmationLabel(type) {
  return {
    github: "GitHub",
    redirect: "跳转链接",
    docs: "docs",
    homepage: "官网"
  }[type] || "产品页";
}

function summarizeProductConfirmationHtml(html) {
  const metaDescription =
    html.match(/<meta\b[^>]*(?:name|property)=["'](?:description|og:description)["'][^>]*content=["']([^"']+)["'][^>]*>/i)?.[1] ||
    html.match(/<meta\b[^>]*content=["']([^"']+)["'][^>]*(?:name|property)=["'](?:description|og:description)["'][^>]*>/i)?.[1] ||
    "";
  const summary = cleanText(metaDescription) || extractFirstParagraph(html) || cleanText(html).slice(0, 240);
  return summary.slice(0, 240);
}

function isUsefulProductConfirmationSummary(summary) {
  const cleaned = cleanText(summary);
  if (!cleaned || cleaned.length < 16) {
    return false;
  }
  return ![
    /^a new flutter project\.?$/i,
    /^product hunt help center$/i,
    /view and subscribe to events from product hunt/i,
    /enjoy the videos and music you love on youtube/i,
    /youtube .*動画.*音楽/i
  ].some((pattern) => pattern.test(cleaned));
}

function sanitizeNoteValue(value) {
  return String(value || "")
    .replace(/[\r\n;]+/g, " ")
    .replace(/\s+/g, "_")
    .slice(0, 160);
}

export async function collectStatuspageIncidents(options = {}) {
  const fetchImpl = createDiscoveryFetch(options.fetchImpl || globalThis.fetch, options);
  if (typeof fetchImpl !== "function") {
    throw new Error("fetch is not available in this runtime");
  }

  const reportDate = requireReportDate(options.reportDate);
  const generatedAt = options.generatedAt || new Date().toISOString();
  const sources = await loadSources(options.sources, options.sourcesPath, DEFAULT_STATUSPAGE_SOURCES);
  const candidateSources = [];
  const candidates = [];
  const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : 20;
  const lookbackDays = Number.isInteger(options.lookbackDays) ? options.lookbackDays : 2;

  for (const rawSource of sources) {
    const currentSource = normalizeGenericSource(rawSource, "status");
    candidateSources.push(toCandidateSource(currentSource, "other", generatedAt, "blocked", ""));

    try {
      const response = await fetchImpl(currentSource.url, {
        headers: {
          accept: "application/atom+xml, application/rss+xml, application/xml, text/xml, */*",
          "user-agent": "ai-daily-cn-static-publisher"
        }
      });
      if (!response.ok) {
        markSource(candidateSources.at(-1), "blocked", withRetryNote(`HTTP ${response.status}`, response));
        continue;
      }

      const entries = parseFeedEntries(await response.text())
        .filter((entry) => entry.url && entry.title && isWithinReportWindow(entry.event_date, reportDate, lookbackDays))
        .slice(0, limit);
      markSource(candidateSources.at(-1), entries.length > 0 ? "checked" : "no_signal", withRetryNote(`${entries.length} recent incidents parsed`, response));

      for (const entry of entries) {
        candidates.push({
          id: uniqueCandidateId(candidates, `${currentSource.id}-${entry.title}`),
          source_id: currentSource.id,
          category: "main_item",
          title: `${currentSource.name}: ${entry.title}`,
          url: entry.url,
          source: currentSource.name,
          event_date: entry.event_date,
          status: "excluded",
          evidence: summarizeEvidence(entry.summary, "Statuspage incident feed entry.")
        });
      }
    } catch (error) {
      markSource(candidateSources.at(-1), "blocked", withRetryNote(error.message, error));
    }
  }

  return {
    sources: candidateSources,
    candidates: candidates.slice(0, limit)
  };
}

async function readBrowserExportSources(filePath, fallback) {
  const resolved = path.resolve(filePath);
  const raw = await fs.readFile(resolved, "utf8");
  if (path.extname(resolved).toLowerCase() !== ".json") {
    return [{ ...fallback, html: raw }];
  }

  const payload = JSON.parse(raw);
  const items = Array.isArray(payload) ? payload : payload.sources || payload.pages || payload.exports || [payload];
  return items.map((item, index) => normalizeBrowserExportItem(item, fallback, index));
}

function normalizeBrowserExportItem(item, fallback, index) {
  const html = item?.html || item?.content || item?.body;
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error(`browser-export item ${index + 1} must include non-empty html, content, or body`);
  }

  return {
    name: item.name || item.title || fallback.name,
    url: isHttpUrl(item.url) ? item.url : fallback.url,
    language: item.language || fallback.language,
    window: item.window || fallback.window,
    html
  };
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

async function loadSources(inlineSources, sourcesPath, fallbackSources) {
  if (Array.isArray(inlineSources)) {
    return inlineSources;
  }
  if (!sourcesPath) {
    return fallbackSources;
  }
  const raw = await fs.readFile(path.resolve(sourcesPath), "utf8");
  const payload = JSON.parse(raw);
  return Array.isArray(payload) ? payload : payload.sources || fallbackSources;
}

export function parseGitHubTrendingHtml(html, sourceInfo = {}) {
  const candidates = [];
  const headingPattern = /<h2[^>]*>\s*<a[^>]+href="\/([^"?#]+\/[^"?#]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h2>/gi;
  const matches = [...html.matchAll(headingPattern)];

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const repo = normalizeRepo(match[1]);
    if (!repo || repo.split("/").length !== 2) {
      continue;
    }

    const nextIndex = matches[index + 1]?.index || html.length;
    const block = html.slice(match.index, nextIndex);
    const description = extractFirstParagraph(block);
    const stars = extractTrendingStarCount(block);
    candidates.push({
      repo,
      url: `${GITHUB_BASE_URL}/${repo}`,
      source: sourceInfo.name || "GitHub Trending",
      source_url: sourceInfo.url || "",
      signal: "trending",
      language: sourceInfo.language || "",
      window: sourceInfo.window || "",
      rank: candidates.length + 1,
      description,
      evidence: stars
        ? `${repo} appeared on ${sourceInfo.name || "GitHub Trending"} with ${stars} stars ${sourceInfo.window === "weekly" ? "this week" : "today"}.`
        : `${repo} appeared on ${sourceInfo.name || "GitHub Trending"}.`,
      ...(stars ? sourceInfo.window === "weekly" ? { stars_this_week: stars } : { stars_today: stars } : {})
    });
  }

  return candidates;
}

function enrichProjectCandidate(candidate, sourceInfo, reportDate) {
  return {
    ...candidate,
    id: candidate.id || `project-${slugId(candidate.repo || candidate.url || candidate.source || "repo")}`,
    source_id: candidate.source_id || `github-${slugId(sourceInfo.name || sourceInfo.url || "trending")}`,
    category: candidate.category || "project",
    event_date: candidate.event_date || reportDate,
    status: candidate.status || "excluded",
    name: candidate.name || candidate.repo,
    trend: candidate.trend || "new"
  };
}

async function loadGitHubTrendingHistory(options = {}) {
  const lookbackDays = Number.isInteger(options.historyLookbackDays) && options.historyLookbackDays > 0
    ? options.historyLookbackDays
    : 7;
  const reportDate = options.reportDate || "";
  const empty = {
    checked: false,
    lookbackDays,
    byRepo: new Map(),
    dates: [],
    repoCount: 0,
    errors: []
  };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate) || options.history === false || options.trendingHistory === false) {
    return empty;
  }

  const inlineHistory = Array.isArray(options.candidateHistory)
    ? options.candidateHistory
    : Array.isArray(options.trendingHistory)
      ? options.trendingHistory
      : Array.isArray(options.previousTrending)
        ? [{ date: previousDateStrings(reportDate, 1)[0], payload: { github_trending: options.previousTrending } }]
        : null;
  const errors = [];
  const records = inlineHistory
    ? normalizeInlineGitHubTrendingHistory(inlineHistory)
    : await loadGitHubTrendingHistoryRecordsFromRoot(
      path.resolve(options.historyRoot || options.historyDir || path.join(process.cwd(), "reports-data")),
      reportDate,
      lookbackDays,
      errors
    );
  const byRepo = new Map();
  const dates = new Set();

  for (const record of records) {
    if (!isPreviousDateWithinWindow(record.date, reportDate, lookbackDays)) {
      continue;
    }
    const entries = extractGitHubTrendingHistoryEntries(record.payload, record.date);
    if (entries.length === 0) {
      continue;
    }
    dates.add(record.date);
    for (const entry of entries) {
      const key = entry.repo.toLowerCase();
      const existing = byRepo.get(key) || {
        repo: entry.repo,
        dates: new Set(),
        ranks: new Map(),
        sources: new Set()
      };
      existing.dates.add(record.date);
      if (Number.isInteger(entry.rank)) {
        existing.ranks.set(record.date, entry.rank);
      }
      if (entry.source) {
        existing.sources.add(entry.source);
      }
      byRepo.set(key, existing);
    }
  }

  return {
    checked: true,
    lookbackDays,
    byRepo,
    dates: [...dates].sort(),
    repoCount: byRepo.size,
    errors
  };
}

async function loadGitHubTrendingHistoryRecordsFromRoot(historyRoot, reportDate, lookbackDays, errors) {
  const records = [];
  for (const date of previousDateStrings(reportDate, lookbackDays)) {
    const [year, month] = date.split("-");
    const baseDir = path.join(historyRoot, year, month);
    for (const fileName of [`${date}.candidates.json`, `${date}.json`]) {
      const filePath = path.join(baseDir, fileName);
      try {
        records.push({
          date,
          payload: JSON.parse(await fs.readFile(filePath, "utf8"))
        });
      } catch (error) {
        if (error.code !== "ENOENT") {
          errors.push(`${filePath}: ${error.message}`);
        }
      }
    }
  }
  return records;
}

function normalizeInlineGitHubTrendingHistory(items) {
  return items.map((item) => ({
    date: dateOnly(item.report_date || item.date || item.payload?.report_date),
    payload: item.payload || item
  }));
}

function extractGitHubTrendingHistoryEntries(payload, fallbackDate) {
  const sourceById = new Map((Array.isArray(payload?.sources) ? payload.sources : [])
    .map((sourceItem) => [sourceItem.id, sourceItem]));
  const entries = [];

  for (const item of Array.isArray(payload?.github_trending) ? payload.github_trending : []) {
    addGitHubTrendingHistoryEntry(entries, item, null, fallbackDate, {
      acceptDailyProject: true,
      acceptDirectTrending: true
    });
  }

  for (const candidate of Array.isArray(payload?.candidates) ? payload.candidates : []) {
    const sourceItem = sourceById.get(candidate.source_id);
    addGitHubTrendingHistoryEntry(entries, candidate, sourceItem, fallbackDate, {
      acceptDailyProject: candidate.category === "project" || candidate.included_in === "projects",
      acceptDirectTrending: candidate.category === "github_trending" || candidate.included_in === "github_trending"
    });
  }

  for (const project of Array.isArray(payload?.projects) ? payload.projects : []) {
    addGitHubTrendingHistoryEntry(entries, project, null, fallbackDate, { acceptDailyProject: true });
  }

  return entries;
}

function addGitHubTrendingHistoryEntry(entries, item, sourceItem, fallbackDate, options = {}) {
  const repo = repoFromHistoryItem(item);
  if (!repo) {
    return;
  }
  const text = [
    item.source,
    item.source_id,
    item.evidence,
    item.notes,
    sourceItem?.name,
    sourceItem?.category,
    sourceItem?.notes
  ].filter(Boolean).join(" ").toLowerCase();
  if (!options.acceptDirectTrending && !options.acceptDailyProject && !text.includes("github trending") && !text.includes("github_trending")) {
    return;
  }
  entries.push({
    repo,
    date: dateOnly(item.event_date) || fallbackDate,
    rank: Number.isInteger(item.rank) ? item.rank : null,
    source: item.source || sourceItem?.name || ""
  });
}

function annotateGitHubTrendingCandidates(candidates, history) {
  if (!history.checked) {
    return candidates.map((candidate) => applyGitHubTrendMovement(candidate, null));
  }
  return candidates.map((candidate) => {
    const key = (candidate.repo || repoFromHistoryItem(candidate)).toLowerCase();
    if (!key) {
      return applyGitHubTrendMovement(candidate, null);
    }
    const repoHistory = history.byRepo.get(key);
    const dates = repoHistory ? [...repoHistory.dates].sort() : [];
    const previousRank = repoHistory ? latestRank(repoHistory.ranks) : null;
    const historySentence = dates.length > 0
      ? `近 ${history.lookbackDays} 天本地记录曾在 ${dates.join("、")} 出现；今日需要复核它是否仍在 GitHub Trending 前列、是否有 release/commit 或 star velocity。`
      : `近 ${history.lookbackDays} 天本地记录未见该仓库，按新进入 GitHub Trending 前列的项目优先核查。`;
    const marker = dates.length > 0
      ? `seen_${dates.length}_days_in_${history.lookbackDays}d`
      : `new_in_${history.lookbackDays}d`;
    const annotated = applyGitHubTrendMovement(candidate, previousRank);
    return {
      ...annotated,
      evidence: appendSentence(annotated.evidence, historySentence),
      notes: appendSentence(
        annotated.notes,
        `github_trending_history=${marker}; trend=${annotated.trend}${dates.length > 0 ? `; dates=${dates.join(",")}` : ""}`
      )
    };
  });
}

function applyGitHubTrendMovement(candidate, previousRank) {
  const rankDelta = Number.isInteger(previousRank) && Number.isInteger(candidate.rank)
    ? previousRank - candidate.rank
    : null;
  return {
    ...candidate,
    previous_rank: Number.isInteger(previousRank) ? previousRank : null,
    rank_delta: rankDelta,
    trend: rankDelta === null ? "new" : rankDelta > 0 ? "up" : rankDelta < 0 ? "down" : "same"
  };
}

function latestRank(ranks) {
  if (!ranks || ranks.size === 0) {
    return null;
  }
  const latest = [...ranks.entries()].sort(([left], [right]) => right.localeCompare(left))[0];
  return Number.isInteger(latest?.[1]) ? latest[1] : null;
}

function githubTrendingAuditNotes(baseNotes, history) {
  const prefix = "GitHub Trending 是每日必查路径；daily/weekly 与语言榜前列项目都必须进入候选审计。";
  if (!history.checked) {
    return `${prefix} ${baseNotes} 近 7 天本地历史对比需要提供 --date YYYY-MM-DD 后运行。`;
  }
  const historyNotes = `近 ${history.lookbackDays} 天本地 reports-data 对比已运行，覆盖 ${history.dates.length} 个日期、${history.repoCount} 个 GitHub 仓库记录；有历史 rank 时会生成 previous_rank、rank_delta 和 trend。`;
  const errorNotes = history.errors.length > 0 ? ` ${history.errors.length} 个历史文件读取失败，已跳过。` : "";
  return `${prefix} ${baseNotes} ${historyNotes}${errorNotes}`;
}

function repoFromHistoryItem(item) {
  const textMatch = firstString(item?.repo, item?.full_name, item?.name, item?.title).match(/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/);
  if (textMatch) {
    return normalizeRepo(textMatch[1]);
  }
  return normalizeRepoFromGitHubUrl(item?.url || item?.html_url || "");
}

function normalizeRepoFromGitHubUrl(value) {
  try {
    const url = new URL(value);
    if (!/^(www\.)?github\.com$/i.test(url.hostname)) {
      return "";
    }
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length < 2 || ["trending", "topics", "marketplace", "features", "orgs"].includes(segments[0])) {
      return "";
    }
    return normalizeRepo(`${segments[0]}/${segments[1]}`);
  } catch {
    return "";
  }
}

function previousDateStrings(reportDate, days) {
  const base = new Date(`${reportDate}T00:00:00Z`);
  if (Number.isNaN(base.getTime())) {
    return [];
  }
  const dates = [];
  for (let offset = 1; offset <= days; offset += 1) {
    const current = new Date(base);
    current.setUTCDate(base.getUTCDate() - offset);
    dates.push(current.toISOString().slice(0, 10));
  }
  return dates;
}

function isPreviousDateWithinWindow(date, reportDate, lookbackDays) {
  if (!date) {
    return false;
  }
  const dateTime = Date.parse(`${date}T00:00:00Z`);
  const reportTime = Date.parse(`${reportDate}T00:00:00Z`);
  if (Number.isNaN(dateTime) || Number.isNaN(reportTime)) {
    return false;
  }
  const diffDays = Math.floor((reportTime - dateTime) / 86400000);
  return diffDays > 0 && diffDays <= lookbackDays;
}

function appendSentence(value, sentence) {
  const base = String(value || "").trim();
  if (!base) {
    return sentence;
  }
  const separator = /[。！？]$/.test(base) ? "" : /[.!?]$/.test(base) ? " " : "。";
  return `${base}${separator}${sentence}`;
}

function countBy(items, key) {
  const counts = {};
  for (const item of items) {
    const value = item?.[key] || "unspecified";
    counts[value] = (counts[value] || 0) + 1;
  }
  return counts;
}

function timeoutInit(timeoutMs) {
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || typeof AbortSignal?.timeout !== "function") {
    return {};
  }
  return { signal: AbortSignal.timeout(timeoutMs) };
}

function source(name, url, language, window) {
  return { name, url, language, window };
}

function normalizeRepoFromOssInsightRow(row) {
  const fullName = firstString(row.full_name, row.repo_full_name, row.repo_name, row.name, "");
  if (fullName.includes("/")) {
    return normalizeRepo(fullName);
  }
  const owner = firstString(row.owner_login, row.owner, row.org, "");
  const name = firstString(row.repo, row.repository_name, row.repo_name, "");
  if (owner && name) {
    return normalizeRepo(`${owner}/${name}`);
  }
  if (row.repo_url) {
    try {
      const url = new URL(row.repo_url);
      return normalizeRepo(url.pathname);
    } catch {
      return "";
    }
  }
  return "";
}

function normalizeRepo(value) {
  return value
    .replace(/^\/+/, "")
    .split("/")
    .slice(0, 2)
    .map((part) => decodeURIComponent(part.trim()))
    .join("/");
}

function normalizeBuilderSource(sourceItem) {
  const normalized = normalizeGenericSource(sourceItem, "builder");
  return {
    ...normalized,
    author: sourceItem.author || sourceItem.name,
    role: sourceItem.role || "builder"
  };
}

function normalizeFollowBuildersFeeds(feeds) {
  if (!feeds || typeof feeds !== "object") {
    return DEFAULT_FOLLOW_BUILDERS_FEEDS;
  }
  return {
    x: isHttpUrl(feeds.x) ? feeds.x : "",
    podcasts: isHttpUrl(feeds.podcasts) ? feeds.podcasts : "",
    blogs: isHttpUrl(feeds.blogs) ? feeds.blogs : ""
  };
}

function normalizeGenericSource(sourceItem, prefix) {
  if (!sourceItem || !isHttpUrl(sourceItem.url)) {
    throw new Error(`${prefix} source must include an absolute url`);
  }
  const name = sourceItem.name || sourceItem.url;
  return {
    ...sourceItem,
    id: sourceItem.id || `${prefix}-${slugId(name)}`,
    name,
    url: sourceItem.url
  };
}

function toCandidateSource(sourceItem, category, checkedAt, status, notes) {
  return {
    id: sourceItem.id,
    name: sourceItem.name,
    url: sourceItem.url,
    category,
    status,
    checked_at: checkedAt,
    notes
  };
}

function markSource(sourceItem, status, notes) {
  sourceItem.status = status;
  sourceItem.notes = notes;
}

function auditSource(name, url, status, notes) {
  return { name, url, status, notes };
}

function inferBuilderBlockedReason(sourceResults, candidates = []) {
  const xFeedBlocked = sourceResults.some((sourceResult) =>
    isFollowBuildersXSource(sourceResult) && ["blocked", "skipped_missing_token"].includes(sourceResult.status)
  );
  if (xFeedBlocked && !hasXStatusCandidate(candidates)) {
    return "x_feed_failed";
  }
  if (candidates.length > 0) {
    return "";
  }
  if (sourceResults.some((sourceResult) => sourceResult.status === "blocked")) {
    return "fetch_failed";
  }
  return "no_recent_signal";
}

function isFollowBuildersXSource(sourceResult) {
  return /follow-builders x feed/i.test(sourceResult?.name || "") || /feed-x\.json/i.test(sourceResult?.url || "");
}

function hasXStatusCandidate(candidates) {
  return candidates.some((candidate) => isXStatusUrl(candidate.url) || isXStatusUrl(candidate.original_url));
}

function normalizeXStatusUrl(value) {
  if (!isXStatusUrl(value)) {
    return "";
  }
  try {
    const url = new URL(value);
    url.protocol = "https:";
    url.hostname = "x.com";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function isXStatusUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    return (host === "x.com" || host === "twitter.com") && /\/[^/]+\/status\/\d+/i.test(url.pathname);
  } catch {
    return false;
  }
}

function xStatusHandle(value) {
  try {
    const [, handle] = new URL(value).pathname.match(/^\/([^/]+)\/status\/\d+/i) || [];
    return handle || "";
  } catch {
    return "";
  }
}

function xStatusDate(value) {
  try {
    const [, id] = new URL(value).pathname.match(/\/status\/(\d+)/i) || [];
    if (!id) {
      return "";
    }
    const timestampMs = Number((BigInt(id) >> 22n) + X_SNOWFLAKE_EPOCH_MS);
    const date = new Date(timestampMs);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

function formatSearchDate(value) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return `${date.toLocaleString("en-US", { month: "long", timeZone: "UTC" })} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

function parseFeedEntries(xml) {
  const entryBlocks = matchXmlBlocks(xml, "entry");
  if (entryBlocks.length > 0) {
    return entryBlocks.map(parseAtomEntry);
  }
  return matchXmlBlocks(xml, "item").map(parseRssItem);
}

function parseContentSourceEntries(content, sourceInfo) {
  if (sourceInfo.format === "html_index") {
    return parseHtmlIndexEntries(content, sourceInfo);
  }
  return parseFeedEntries(content);
}

function parseHtmlIndexEntries(html, sourceInfo = {}) {
  const entries = [];
  const seenUrls = new Set();
  const anchorPattern = /<a\b[^>]*href=(?:"([^"]+)"|'([^']+)'|([^'"\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(anchorPattern)) {
    const rawHref = decodeXml(match[1] || match[2] || match[3] || "");
    const url = absoluteUrl(rawHref, sourceInfo.url);
    if (!url || seenUrls.has(url) || !matchesSourceLink(rawHref, url, sourceInfo)) {
      continue;
    }

    const block = html.slice(match.index, Math.min(html.length, match.index + 1800));
    const title = extractHtmlTitle(match[4]) || extractHtmlTitle(block);
    const eventDate = extractHtmlDate(block);
    if (!title || !eventDate) {
      continue;
    }

    seenUrls.add(url);
    entries.push({
      title,
      url,
      event_date: eventDate,
      summary: extractHtmlSummary(block)
    });
  }

  return entries;
}

function parseAtomEntry(block) {
  return normalizeFeedEntry({
    title: xmlText(block, "title"),
    url: atomLink(block) || xmlText(block, "link"),
    date: xmlText(block, "updated") || xmlText(block, "published"),
    summary: xmlText(block, "summary") || xmlText(block, "content")
  });
}

function parseRssItem(block) {
  return normalizeFeedEntry({
    title: xmlText(block, "title"),
    url: xmlText(block, "link") || atomLink(block),
    date: xmlText(block, "pubDate") || xmlText(block, "date") || xmlText(block, "updated"),
    summary: xmlText(block, "description") || xmlText(block, "encoded") || xmlText(block, "summary")
  });
}

function normalizeFeedEntry(entry) {
  const url = cleanText(entry.url);
  const rawSummary = entry.summary || "";
  return {
    title: cleanText(entry.title),
    url,
    event_date: dateOnly(entry.date),
    summary: cleanText(rawSummary),
    links: extractHtmlLinks(rawSummary, url)
  };
}

function extractHtmlLinks(html, baseUrl) {
  const links = [];
  const seen = new Set();
  const decoded = decodeXml(html);
  const anchorPattern = /<a\b[^>]*href=(?:"([^"]+)"|'([^']+)'|([^'"\s>]+))[^>]*>/gi;
  for (const match of decoded.matchAll(anchorPattern)) {
    const url = absoluteUrl(decodeXml(match[1] || match[2] || match[3] || ""), baseUrl);
    if (url && !seen.has(url)) {
      seen.add(url);
      links.push(url);
    }
  }
  return links;
}

function matchXmlBlocks(xml, tagName) {
  const pattern = new RegExp(`<(?:\\w+:)?${tagName}\\b[\\s\\S]*?<\\/(?:\\w+:)?${tagName}>`, "gi");
  return [...xml.matchAll(pattern)].map((match) => match[0]);
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
    .replace(/&#x2F;/g, "/")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&nbsp;/g, " ");
}

function cleanText(value) {
  return stripTags(decodeXml(value)).replace(/\s+/g, " ").trim();
}

function dateOnly(value) {
  const rawValue = String(value || "").trim();
  const ymdMatch = rawValue.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (ymdMatch) {
    return `${ymdMatch[1]}-${ymdMatch[2]}-${ymdMatch[3]}`;
  }

  const monthDateMatch = rawValue.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2}),\s+(\d{4})\b/i);
  if (monthDateMatch) {
    const month = monthNumber(monthDateMatch[1]);
    const day = monthDateMatch[2].padStart(2, "0");
    return month ? `${monthDateMatch[3]}-${month}-${day}` : "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString().slice(0, 10);
}

function monthNumber(value) {
  const month = String(value || "").slice(0, 3).toLowerCase();
  const months = {
    jan: "01",
    feb: "02",
    mar: "03",
    apr: "04",
    may: "05",
    jun: "06",
    jul: "07",
    aug: "08",
    sep: "09",
    oct: "10",
    nov: "11",
    dec: "12"
  };
  return months[month] || "";
}

function isWithinReportWindow(eventDate, reportDate, lookbackDays) {
  if (!eventDate) {
    return false;
  }
  const eventTime = Date.parse(`${eventDate}T00:00:00Z`);
  const reportTime = Date.parse(`${reportDate}T00:00:00Z`);
  if (Number.isNaN(eventTime) || Number.isNaN(reportTime)) {
    return false;
  }
  const diffDays = Math.floor((reportTime - eventTime) / 86400000);
  return diffDays >= 0 && diffDays <= lookbackDays;
}

function summarizeEvidence(summary, fallback) {
  const cleaned = cleanText(summary);
  return cleaned ? cleaned.slice(0, 240) : fallback;
}

function shortenCandidateTitle(value) {
  const text = cleanText(value);
  return text.length > 80 ? `${text.slice(0, 79)}…` : text;
}

function arrayFromPossibleKeys(payload, keys) {
  if (Array.isArray(payload)) {
    return payload;
  }
  for (const key of keys) {
    if (Array.isArray(payload?.[key])) {
      return payload[key];
    }
  }
  return [];
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

function requireReportDate(reportDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate || "")) {
    throw new Error("reportDate must be YYYY-MM-DD");
  }
  return reportDate;
}

function firstString(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
}

async function readJsonResponse(response) {
  if (typeof response.json === "function") {
    return response.json();
  }
  return JSON.parse(await response.text());
}

function extractFirstParagraph(block) {
  const paragraph = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i)?.[1] || "";
  return cleanText(paragraph);
}

function extractTrendingStarCount(block) {
  const text = cleanText(block);
  const match = text.match(/([\d,]+)\s+stars?\s+(?:today|this week)/i);
  return match ? match[1] : "";
}

function absoluteUrl(value, baseUrl) {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return "";
  }
}

function matchesSourceLink(rawHref, url, sourceInfo) {
  const patterns = Array.isArray(sourceInfo.linkPattern)
    ? sourceInfo.linkPattern
    : sourceInfo.linkPattern
      ? [sourceInfo.linkPattern]
      : [];
  if (patterns.length > 0) {
    return patterns.some((pattern) => rawHref.includes(pattern) || url.includes(pattern));
  }

  try {
    const sourceUrl = new URL(sourceInfo.url);
    const candidateUrl = new URL(url);
    return candidateUrl.origin === sourceUrl.origin && candidateUrl.pathname !== sourceUrl.pathname;
  } catch {
    return false;
  }
}

function extractHtmlTitle(block) {
  const heading = block.match(/<h[1-4]\b[^>]*>([\s\S]*?)<\/h[1-4]>/i)?.[1];
  if (heading) {
    return cleanHtmlTitle(cleanText(heading));
  }
  return cleanHtmlTitle(cleanText(block));
}

function cleanHtmlTitle(value) {
  return String(value || "")
    .replace(/^(?:[A-Z][a-z]+\.?\s+\d{1,2},\s+\d{4}\s+)?(?:Announcements|Blog|Company|Featured|Product|Research)\s+/i, "")
    .trim();
}

function extractHtmlDate(block) {
  const datetime = block.match(/<time\b[^>]*datetime=["']([^"']+)["'][^>]*>/i)?.[1];
  const dateFromDatetime = dateOnly(datetime);
  if (dateFromDatetime) {
    return dateFromDatetime;
  }

  const text = cleanText(block);
  const explicitDate =
    text.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0] ||
    text.match(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},\s+\d{4}\b/i)?.[0];
  return dateOnly(explicitDate);
}

function extractHtmlSummary(block) {
  return extractFirstParagraph(block) || cleanText(block).slice(0, 240);
}
