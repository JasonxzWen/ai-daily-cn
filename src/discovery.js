import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  applyGithubReadmeSummary,
  githubReadmeCacheKey,
  summarizeGithubReadme
} from "./github-readme.js";
import { collectAifyTodayPicks, createAifyTodayPicksFailure } from "./aify-today-picks.js";
import { loadSourceRegistry } from "./source-registry.js";
import { sanitizePublicHttpUrl, urlHostMatches } from "./public-url.js";
import { decodeXmlEntitiesOnce as decodeXml } from "./xml.js";
import { loadWeChatArticleInput, WECHAT_ARTICLE_INPUT_SOURCE } from "./wechat-input.js";
import {
  auditGroupForPlatform,
  isPlatformExemptCategory,
  PLATFORM_EXEMPT_PLATFORMS,
  platformEntryToCandidate,
  platformFromCandidateCategory,
  platformSourceRejectReason as legacyPlatformSourceAnnotation,
  sectionForPlatformCategory
} from "./platform-exempt.js";
import { createOfficialComponentSnapshot } from "./official-component-snapshot.js";
import { candidatePoolRelativePaths } from "./reports-data-layout.js";
import { transportCompletenessTags } from "./public-signal-lanes.js";

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
const TAVILY_MAX_RESULTS_PER_REQUEST = 20;
const DEFAULT_SOURCE_CACHE_TTL_DAYS = 7;
const OPENROUTER_RANKINGS_SOURCE_KIND = "openrouter_rankings_public_playwright";
const ARTIFICIAL_ANALYSIS_INDEX_SOURCE_KIND = "artificial_analysis_index_public_playwright";
const SWE_BENCH_PRO_PUBLIC_SOURCE_KIND = "swe_bench_pro_public_playwright";
const GITHUB_REPORT_MARKDOWN_SOURCE_KIND = "github_report_markdown";
const HUGGINGFACE_DAILY_PAPERS_API_SOURCE_KIND = "huggingface_daily_papers_api";
const HUGGINGFACE_HUB_TRENDING_API_SOURCE_KIND = "huggingface_hub_trending_api";
const DATED_CHANGELOG_SOURCE_KIND = "dated_changelog";
const DEFAULT_X_BUILDER_SEARCH_TERMS = [
  "Claude Code",
  "coding agents",
  "CI coding agents",
  "MCP Claude",
  "Codex agent",
  "AI agents"
];
const DEFAULT_SOURCE_WATCHLIST_PATH = path.join("config", "source-watchlist.json");
const SOURCE_WATCH_USER_AGENT = "ai-daily-cn-static-publisher";
const DEFAULT_SOURCE_WATCH_ENDPOINT_LIMIT = 5;
const DEFAULT_TRANSPORT_REQUEST_BUDGET = 120;
const DEFAULT_TRANSPORT_RUNTIME_MS = 180000;

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
  source("GitHub Trending Go weekly", "https://github.com/trending/go?since=weekly", "go", "weekly"),
  source("GitHub Trending Java daily", "https://github.com/trending/java?since=daily", "java", "daily"),
  source("GitHub Trending Java weekly", "https://github.com/trending/java?since=weekly", "java", "weekly")
];
const REQUIRED_GITHUB_TRENDING_WEEKLY_LANGUAGES = ["python", "typescript", "rust", "go", "java"];

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
    id: "content-openai-blog-rss",
    name: "OpenAI Blog RSS",
    url: "https://openai.com/blog/rss.xml"
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
    id: "content-mit-technology-review",
    name: "MIT Technology Review",
    url: "https://www.technologyreview.com/feed/",
    category: "intermediary"
  },
  {
    id: "content-venturebeat-ai",
    name: "VentureBeat AI",
    url: "https://venturebeat.com/category/ai/feed",
    category: "intermediary"
  },
  {
    id: "intermediary-jiqizhixin",
    name: "Jiqizhixin",
    url: "https://www.jiqizhixin.com/articles",
    category: "intermediary",
    source_kind: "html_index"
  },
  {
    id: "intermediary-qbitai",
    name: "QbitAI",
    url: "https://www.qbitai.com/feed",
    category: "intermediary"
  },
  {
    id: "intermediary-sspai",
    name: "SSPAI",
    url: "https://sspai.com/feed",
    category: "intermediary"
  },
  {
    id: "intermediary-36kr",
    name: "36Kr",
    url: "https://36kr.com/feed",
    category: "intermediary"
  },
  {
    id: "intermediary-infoq-cn",
    name: "InfoQ CN",
    url: "https://www.infoq.cn/feed",
    category: "intermediary"
  },
  {
    id: "content-ml-papers-week",
    name: "ML Papers of the Week",
    url: "https://raw.githubusercontent.com/dair-ai/ML-Papers-of-the-Week/main/README.md",
    category: "intermediary",
    source_kind: GITHUB_REPORT_MARKDOWN_SOURCE_KIND,
    latest_report_link_pattern: "years/\\d{4}\\.md#",
    sourceLevel: "weekly_paper_aggregator"
  },
  {
    id: "content-awesome-ai-news",
    name: "Awesome AI News",
    url: "https://raw.githubusercontent.com/taielab/awesome-ai-news/main/README.md",
    category: "project",
    source_kind: GITHUB_REPORT_MARKDOWN_SOURCE_KIND,
    timeoutMs: 15000,
    sourceLevel: "github_ai_news_directory"
  },
  {
    id: "content-salvatorera-ml-news-week",
    name: "ML & AI News of the Week",
    url: "https://raw.githubusercontent.com/SalvatoreRa/ML-news-of-the-week/main/README.md",
    category: "intermediary",
    source_kind: GITHUB_REPORT_MARKDOWN_SOURCE_KIND,
    latest_report_link_pattern: "#ML-news-Week",
    timeoutMs: 20000,
    sourceLevel: "weekly_ai_news_aggregator"
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
    id: "content-google-deepmind-rss",
    name: "Google DeepMind RSS",
    url: "https://deepmind.google/blog/rss.xml"
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
    id: "content-arxiv-cs-ai",
    name: "arXiv cs.AI",
    url: "http://export.arxiv.org/api/query?search_query=cat:cs.AI&sortBy=submittedDate&sortOrder=descending&max_results=20",
    source_kind: "rss",
    sourceLevel: "paper_api"
  },
  {
    id: "content-arxiv-cs-cl",
    name: "arXiv cs.CL",
    url: "http://export.arxiv.org/api/query?search_query=cat:cs.CL&sortBy=submittedDate&sortOrder=descending&max_results=20",
    source_kind: "rss",
    sourceLevel: "paper_api"
  },
  {
    id: "content-arxiv-cs-lg",
    name: "arXiv cs.LG",
    url: "http://export.arxiv.org/api/query?search_query=cat:cs.LG&sortBy=submittedDate&sortOrder=descending&max_results=20",
    source_kind: "rss",
    sourceLevel: "paper_api"
  },
  {
    id: "content-arxiv-cs-ma",
    name: "arXiv cs.MA",
    url: "http://export.arxiv.org/api/query?search_query=cat:cs.MA&sortBy=submittedDate&sortOrder=descending&max_results=20",
    source_kind: "rss",
    sourceLevel: "paper_api"
  },
  {
    id: "content-arxiv-stat-ml",
    name: "arXiv stat.ML",
    url: "http://export.arxiv.org/api/query?search_query=cat:stat.ML&sortBy=submittedDate&sortOrder=descending&max_results=20",
    source_kind: "rss",
    sourceLevel: "paper_api"
  },
  {
    id: "content-hacker-news-api",
    name: "Hacker News Topstories API",
    url: "https://hacker-news.firebaseio.com/v0/topstories.json",
    category: "intermediary",
    sourceLevel: "community_api"
  },
  {
    id: "content-huggingface-daily-papers",
    name: "Hugging Face Daily Papers",
    url: "https://huggingface.co/api/daily_papers?date={YYYY-MM-DD}",
    source_kind: HUGGINGFACE_DAILY_PAPERS_API_SOURCE_KIND,
    category: "intermediary",
    sourceLevel: "paper_api"
  },
  {
    id: "content-smol-ai-news",
    name: "Smol AI News",
    url: "https://news.smol.ai/rss.xml",
    category: "intermediary",
    sourceLevel: "ai_news_aggregator"
  },
  {
    id: "content-interconnects",
    name: "Interconnects",
    url: "https://www.interconnects.ai/feed"
  },
  {
    id: "content-the-magnifier-ai",
    name: "The Magnifier AI",
    url: "https://themagnifier.ai/",
    format: "html_index",
    linkPattern: "https://themagnifier.ai/",
    sourceLevel: "aigc_content_industry"
  },
  {
    id: "content-crunchbase-ai-news",
    name: "Crunchbase News AI",
    url: "https://news.crunchbase.com/sections/ai/",
    format: "html_index",
    linkPattern: "/",
    sourceLevel: "ai_funding_product_radar"
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

export const DEFAULT_HUGGINGFACE_TRENDING_SOURCE = {
  id: "huggingface-trending-models",
  name: "Hugging Face Trending Models",
  url: "https://huggingface.co/api/models?sort=likes&direction=-1&limit=50",
  category: "huggingface_trending"
};

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

export function formatDiscoveryErrorNote(error) {
  const parts = [String(error?.message || error || "unknown_error")];
  const cause = error?.cause;
  if (error?.name && error.name !== "Error") {
    parts.push(`name=${error.name}`);
  }
  if (cause && typeof cause === "object") {
    if (cause.code) parts.push(`cause_code=${cause.code}`);
    if (cause.errno) parts.push(`errno=${cause.errno}`);
    if (cause.syscall) parts.push(`syscall=${cause.syscall}`);
    if (cause.hostname) parts.push(`hostname=${cause.hostname}`);
  }
  return parts.join("; ");
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
  const sourceResults = [];
  const byRepo = new Map();
  const observations = [];

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
        notes: withRetryNote(`${parsed.length} repositories parsed`, response),
        parsed_count: parsed.length
      });

      for (const candidate of parsed) {
        const enriched = enrichProjectCandidate(candidate, currentSource, options.reportDate);
        observations.push(enriched);
        const existing = byRepo.get(candidate.repo);
        if (!existing || shouldPreferGithubTrendingCandidate(enriched, existing)) {
          byRepo.set(candidate.repo, enriched);
        }
      }
    } catch (error) {
      sourceResults.push({
        name: currentSource.name,
        url: currentSource.url,
        status: "blocked",
        notes: withRetryNote(formatDiscoveryErrorNote(error), error)
      });
    }
  }

  if (byRepo.size === 0 && options.ossInsightFallback !== false) {
    await collectOssInsightTrendingFallback({
      byRepo,
      sourceResults,
      fetchImpl,
      reportDate: options.reportDate
    });
  }

  const history = await loadGitHubTrendingHistory(options);
  const collectedCandidates = observations.length > 0 ? observations : [...byRepo.values()];
  const enrichedCandidates = await enrichGithubTrendingReadmes(collectedCandidates, {
    fetchImpl,
    disabled: options.readmeEnrichment === false,
    maxCandidates: options.readmeLimit,
    cache: history.readmeCache
  });
  const apiEnrichedCandidates = await enrichGithubTrendingApiFields(enrichedCandidates, {
    fetchImpl,
    enabled: options.apiEnrichment === true || Boolean(githubTrendingApiToken(options)),
    token: githubTrendingApiToken(options),
    maxCandidates: options.apiEnrichmentLimit
  });
  const candidates = annotateGitHubTrendingCandidates(apiEnrichedCandidates, history);
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

export async function collectSourceWatch(options = {}) {
  const reportDate = requireReportDate(options.reportDate);
  const generatedAt = options.generatedAt || new Date().toISOString();
  const rootDir = options.rootDir || process.cwd();
  const fetchImpl = createDiscoveryFetch(options.fetchImpl || globalThis.fetch, options);
  if (typeof fetchImpl !== "function") {
    throw new Error("fetch is not available in this runtime");
  }

  const watchlist = await loadSourceWatchlist(options, rootDir);
  const transportRuntime = await createContentTransportRuntime({ ...options, rootDir });
  const targets = [];
  const sources = [];
  const candidates = [];
  const githubAuditSources = [];
  const siteAuditSources = [];

  for (const target of watchlist.targets) {
    if (target.type === "github_repo") {
      const result = await collectSourceWatchGithubRepo(target, {
        fetchImpl,
        generatedAt,
        reportDate,
        candidates,
        options,
        transportRuntime
      });
      targets.push(result.target);
      sources.push(result.source);
      candidates.push(...(result.candidates || (result.candidate ? [result.candidate] : [])));
      githubAuditSources.push(result.auditSource);
      continue;
    }

    const result = await collectSourceWatchSite(target, {
      fetchImpl,
      generatedAt,
      reportDate,
      candidates
    });
    targets.push(result.target);
    sources.push(result.source);
    if (result.candidate) {
      candidates.push(result.candidate);
    }
    siteAuditSources.push(result.auditSource);
  }

  const fetchedRepos = githubAuditSources.filter((sourceResult) => sourceResult.status === "checked").length;
  const fetchedSites = siteAuditSources.filter((sourceResult) => sourceResult.status === "checked").length;
  await persistContentTransportRuntime(transportRuntime, generatedAt);
  return {
    schema_version: 1,
    kind: "source_watch_candidates",
    report_date: reportDate,
    generated_at: generatedAt,
    watchlist_schema_version: watchlist.schema_version,
    targets,
    sources,
    candidates,
    source_audit: {
      github_watch: {
        checked: true,
        sources: githubAuditSources,
        candidates_found: candidates.filter((candidate) => candidate.signal === "github_watch").length,
        included: 0,
        watched_repos: watchlist.targets.filter((target) => target.type === "github_repo").length,
        fetched_repos: fetchedRepos,
        changed_repos: 0,
        notes: "Repo delta and cross-day freshness are deferred to the GitHub watch quality loop."
      },
      site_watch: {
        checked: true,
        sources: siteAuditSources,
        candidates_found: candidates.filter((candidate) => candidate.signal === "site_watch").length,
        included: 0,
        watched_sites: watchlist.targets.filter((target) => target.type === "site").length,
        fetched_sites: fetchedSites,
        notes: "Site watch records page metadata, feed discovery, and discovered GitHub links without auto-promoting repos."
      }
    }
  };
}

export async function collectAifyTodayPicksFromWatchlist(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const reportDate = requireReportDate(options.reportDate);
  const watchlist = await loadSourceWatchlist(options, rootDir);
  const targets = watchlist.targets.filter((target) => target.id === "site-aify-news");
  if (targets.length !== 1) {
    return createAifyTodayPicksFailure(
      targets[0]?.url || "https://aify-news.pages.dev/",
      targets.length === 0 ? "aify_watch_target_missing" : "aify_watch_target_duplicate"
    );
  }
  return collectAifyTodayPicks({
    fetchImpl: createDiscoveryFetch(options.fetchImpl || globalThis.fetch, options),
    reportDate,
    sourceUrl: targets[0].url,
    maxResponseBytes: options.maxResponseBytes,
    maxRedirects: options.maxRedirects
  });
}

export async function createSourceWatchFixtureFetch(fixtureDir) {
  const manifestPath = path.resolve(fixtureDir || "", "fixtures.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  const responses = new Map();
  for (const entry of Array.isArray(manifest.responses) ? manifest.responses : []) {
    if (!entry.url) {
      continue;
    }
    responses.set(String(entry.url), {
      status: Number.isInteger(entry.status) ? entry.status : 200,
      headers: entry.headers || {},
      body: entry.body
    });
  }

  return async (url) => {
    const key = String(url);
    const entry = responses.get(key);
    if (!entry) {
      throw new Error(`fixture response missing for ${key}`);
    }
    const text = typeof entry.body === "string" ? entry.body : JSON.stringify(entry.body ?? null);
    return {
      ok: entry.status >= 200 && entry.status < 300,
      status: entry.status,
      url: key,
      headers: {
        get(name) {
          const normalized = String(name || "").toLowerCase();
          const foundKey = Object.keys(entry.headers).find((headerName) => headerName.toLowerCase() === normalized);
          return foundKey ? String(entry.headers[foundKey]) : null;
        }
      },
      async text() {
        return text;
      },
      async json() {
        return typeof entry.body === "string" ? JSON.parse(entry.body) : entry.body;
      }
    };
  };
}

async function loadSourceWatchlist(options = {}, rootDir = process.cwd()) {
  const payload = options.watchlist || (Array.isArray(options.targets) ? { targets: options.targets } : null);
  const watchlist = payload || JSON.parse(await fs.readFile(
    path.resolve(rootDir, options.watchlistPath || options.configPath || DEFAULT_SOURCE_WATCHLIST_PATH),
    "utf8"
  ));
  const rawTargets = Array.isArray(watchlist) ? watchlist : watchlist.targets;
  if (!Array.isArray(rawTargets) || rawTargets.length === 0) {
    throw new Error("source watchlist requires a non-empty targets array");
  }
  return {
    schema_version: Number.isInteger(watchlist.schema_version) ? watchlist.schema_version : 1,
    targets: rawTargets.map((target, index) => normalizeSourceWatchTarget(target, index))
  };
}

function normalizeSourceWatchTarget(rawTarget = {}, index = 0) {
  const type = String(rawTarget.type || "").trim().toLowerCase();
  const contractFields = normalizeSourceWatchContractFields(rawTarget);
  if (["github_repo", "github", "repo", "repository"].includes(type)) {
    const repo = normalizeSourceWatchRepo(rawTarget.repo || githubRepoFromUrl(rawTarget.url || ""));
    if (!repo) {
      throw new Error(`source watch target ${index + 1} requires repo owner/name`);
    }
    const url = rawTarget.url && isHttpUrl(rawTarget.url) ? rawTarget.url : `${GITHUB_BASE_URL}/${repo}`;
    return {
      ...rawTarget,
      type: "github_repo",
      id: rawTarget.id || `github-watch-${slugId(repo)}`,
      name: rawTarget.name || repo,
      repo,
      url,
      ...contractFields
    };
  }

  if (type === "site" || (!type && isHttpUrl(rawTarget.url))) {
    if (!isHttpUrl(rawTarget.url)) {
      throw new Error(`source watch site target ${index + 1} requires an absolute url`);
    }
    return {
      ...rawTarget,
      type: "site",
      id: rawTarget.id || `site-watch-${slugId(rawTarget.url)}`,
      name: rawTarget.name || rawTarget.url,
      url: rawTarget.url,
      ...contractFields
    };
  }

  throw new Error(`source watch target ${index + 1} has unsupported type ${rawTarget.type || "(missing)"}`);
}

function normalizeSourceWatchContractFields(rawTarget = {}) {
  const sourceLane = sourceWatchToken(rawTarget.source_lane || rawTarget.lane);
  const sourceTier = sourceWatchToken(rawTarget.source_tier || rawTarget.tier);
  const verificationPolicy = sourceWatchToken(rawTarget.verification_policy);
  return {
    ...(sourceLane ? { source_lane: sourceLane } : {}),
    ...(sourceTier ? { source_tier: sourceTier } : {}),
    ...(verificationPolicy ? { verification_policy: verificationPolicy } : {})
  };
}

function sourceWatchContractFields(target = {}) {
  return normalizeSourceWatchContractFields(target);
}

function sourceWatchToken(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9_:-]+/g, "_").replace(/^_+|_+$/g, "");
}

function sourceWatchStrategy(target = {}, signal = "") {
  const configured = sourceWatchContractFields(target);
  return {
    source_lane: configured.source_lane || signal,
    source_tier: configured.source_tier || "watchlist",
    verification_policy: configured.verification_policy || (
      signal === "github_watch" ? "primary_source_required" : "secondary_review_required"
    )
  };
}

function sourceWatchFingerprint(snapshot) {
  return sourceWatchDigest(stableSourceWatchJson(snapshot));
}

function sourceWatchDigest(value) {
  return `sha256:${createHash("sha256").update(String(value || "")).digest("hex")}`;
}

function stableSourceWatchJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSourceWatchJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableSourceWatchJson(value[key])}`
    )).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

function normalizeSourceWatchRepo(value) {
  const normalized = normalizeRepo(String(value || ""));
  return normalized.split("/").length === 2 ? normalized : "";
}

function githubRepoFromUrl(value) {
  if (!isHttpUrl(value)) {
    return "";
  }
  try {
    const url = new URL(value);
    if (url.hostname.toLowerCase() !== "github.com") {
      return "";
    }
    return normalizeSourceWatchRepo(url.pathname);
  } catch {
    return "";
  }
}

async function collectSourceWatchGithubRepo(target, context) {
  const endpointLimit = sourceWatchEndpointLimit(context.options);
  const endpointUrls = {
    repo: `https://api.github.com/repos/${target.repo}`,
    releases: `https://api.github.com/repos/${target.repo}/releases?per_page=${endpointLimit}`,
    tags: `https://api.github.com/repos/${target.repo}/tags?per_page=${endpointLimit}`,
    commits: `https://api.github.com/repos/${target.repo}/commits?per_page=${endpointLimit}`,
    readme: `https://api.github.com/repos/${target.repo}/readme`
  };
  const endpointStatus = {};
  const rateLimit = {};
  const githubHeaders = sourceWatchGithubHeaders(context.options);
  const repoResult = await sourceWatchFetchJson(context.fetchImpl, endpointUrls.repo, {
    headers: githubHeaders
  }, context.transportRuntime?.budget);
  endpointStatus.repo = sourceWatchEndpointStatus(repoResult);
  sourceWatchMergeRateLimit(rateLimit, repoResult.rate_limit);

  let releases = [];
  let tags = [];
  let commits = [];
  let readme = { status: "not_fetched", excerpt: "" };
  const incompleteMaterialEndpoints = [];
  const transportLimitations = new Set();
  const continuationUrls = new Set();
  let transportPagesFetched = 0;
  if (repoResult.ok) {
    const releaseResult = await sourceWatchFetchGithubPages({
      fetchImpl: context.fetchImpl,
      url: endpointUrls.releases,
      init: { headers: githubHeaders },
      runtime: context.transportRuntime,
      laneKey: `source-watch:github:${target.id}:releases`,
      generatedAt: context.generatedAt
    });
    endpointStatus.releases = sourceWatchEndpointStatus(releaseResult);
    sourceWatchMergeRateLimit(rateLimit, releaseResult.rate_limit);
    releases = sourceWatchReleases(releaseResult.payload);
    transportPagesFetched += releaseResult.pages_fetched || 0;
    if (releaseResult.transport_limitation) transportLimitations.add(releaseResult.transport_limitation);
    if (releaseResult.continuation_url) continuationUrls.add(releaseResult.continuation_url);
    if (!releaseResult.ok || releaseResult.transport_status === "degraded") incompleteMaterialEndpoints.push("releases");

    const tagResult = await sourceWatchFetchGithubPages({
      fetchImpl: context.fetchImpl,
      url: endpointUrls.tags,
      init: { headers: githubHeaders },
      runtime: context.transportRuntime,
      laneKey: `source-watch:github:${target.id}:tags`,
      generatedAt: context.generatedAt
    });
    endpointStatus.tags = sourceWatchEndpointStatus(tagResult);
    sourceWatchMergeRateLimit(rateLimit, tagResult.rate_limit);
    tags = sourceWatchTags(tagResult.payload);
    transportPagesFetched += tagResult.pages_fetched || 0;
    if (tagResult.transport_limitation) transportLimitations.add(tagResult.transport_limitation);
    if (tagResult.continuation_url) continuationUrls.add(tagResult.continuation_url);
    if (!tagResult.ok || tagResult.transport_status === "degraded") incompleteMaterialEndpoints.push("tags");

    const commitResult = await sourceWatchFetchGithubPages({
      fetchImpl: context.fetchImpl,
      url: endpointUrls.commits,
      init: { headers: githubHeaders },
      runtime: context.transportRuntime,
      laneKey: `source-watch:github:${target.id}:commits`,
      generatedAt: context.generatedAt
    });
    endpointStatus.commits = sourceWatchEndpointStatus(commitResult);
    sourceWatchMergeRateLimit(rateLimit, commitResult.rate_limit);
    commits = sourceWatchCommits(commitResult.payload);
    transportPagesFetched += commitResult.pages_fetched || 0;
    if (commitResult.transport_limitation) transportLimitations.add(commitResult.transport_limitation);
    if (commitResult.continuation_url) continuationUrls.add(commitResult.continuation_url);
    if (!commitResult.ok || commitResult.transport_status === "degraded") incompleteMaterialEndpoints.push("commits");

    const readmeResult = await sourceWatchFetchJson(context.fetchImpl, endpointUrls.readme, {
      headers: githubHeaders
    }, context.transportRuntime?.budget);
    endpointStatus.readme = sourceWatchEndpointStatus(readmeResult);
    sourceWatchMergeRateLimit(rateLimit, readmeResult.rate_limit);
    readme = sourceWatchReadme(readmeResult);
  }

  const metadata = repoResult.ok ? sourceWatchRepoMetadata(repoResult.payload, target) : {};
  const materialSnapshotComplete = repoResult.ok && incompleteMaterialEndpoints.length === 0;
  const status = materialSnapshotComplete ? "checked" : "blocked";
  const notes = materialSnapshotComplete
    ? `repo metadata and material endpoints fetched; releases=${releases.length}; tags=${tags.length}; commits=${commits.length}; readme=${readme.status}`
    : repoResult.ok
      ? `repo metadata fetched but material snapshot is incomplete: ${incompleteMaterialEndpoints.join(",")}`
    : `repo metadata failed: ${repoResult.error || `HTTP ${repoResult.status}`}`;
  const targetResult = {
    id: target.id,
    type: target.type,
    name: target.name,
    repo: target.repo,
    url: target.url,
    ...sourceWatchContractFields(target),
    status,
    fetched_at: context.generatedAt,
    endpoint_status: endpointStatus,
    ...(Object.keys(rateLimit).length ? { rate_limit: rateLimit } : {}),
    repo_metadata: metadata,
    releases,
    tags,
    recent_commits: commits,
    readme
  };
  const sourceItem = {
    id: target.id,
    name: target.name,
    url: target.url,
    category: "repository",
    status,
    checked_at: context.generatedAt,
    notes,
    repo: target.repo,
    source_level: "github",
    ...sourceWatchContractFields(target),
    verification_status: materialSnapshotComplete ? "primary_confirmed" : "unverified"
  };
  const snapshotCandidate = repoResult.ok ? sourceWatchGithubCandidate(target, metadata, {
    reportDate: context.reportDate,
    candidates: context.candidates,
    releases,
    tags,
    commits,
    readme,
    materialSnapshotComplete
  }) : null;
  const eventCandidates = repoResult.ok ? sourceWatchGithubEventCandidates(target, metadata, {
    reportDate: context.reportDate,
    candidates: [...context.candidates, ...(snapshotCandidate ? [snapshotCandidate] : [])],
    releases,
    tags,
    commits,
    readme,
    materialSnapshotComplete
  }) : [];
  const githubCandidates = [...(snapshotCandidate ? [snapshotCandidate] : []), ...eventCandidates];
  return {
    target: targetResult,
    source: sourceItem,
    candidate: snapshotCandidate,
    candidates: githubCandidates,
    auditSource: auditSource(target.name, target.url, status, notes, {
      id: target.id,
      target_id: target.id,
      parsed_count: githubCandidates.length,
      repo: target.repo,
      ...sourceWatchContractFields(target),
      endpoint_status: endpointStatus,
      ...(Object.keys(rateLimit).length ? { rate_limit: rateLimit } : {}),
      stars: metadata.stars || 0,
      forks: metadata.forks || 0,
      pushed_at: metadata.pushed_at || "",
      releases_count: releases.length,
      tags_count: tags.length,
      recent_commits_count: commits.length,
      readme_fetch_status: readme.status,
      transport_status: transportLimitations.size > 0 ? "degraded" : "complete",
      pages_fetched: transportPagesFetched,
      ...(transportLimitations.size ? { transport_limitation: [...transportLimitations].join(",") } : {}),
      ...(continuationUrls.size ? { continuation_urls: [...continuationUrls] } : {})
    })
  };
}

async function collectSourceWatchSite(target, context) {
  const result = await sourceWatchFetchText(context.fetchImpl, target.url, {
    headers: {
      accept: "application/json, application/atom+xml, application/rss+xml, application/xml, text/xml, text/html, */*",
      "user-agent": SOURCE_WATCH_USER_AGENT
    }
  });
  const status = result.ok ? "checked" : "blocked";
  const site = result.ok ? parseSourceWatchSiteHtml(result.text, target.url) : {};
  const notes = result.ok
    ? `site metadata fetched; feeds=${site.feeds.length}; github_links=${site.github_repositories.length}`
    : `site fetch failed: ${result.error || `HTTP ${result.status}`}`;
  const targetResult = {
    id: target.id,
    type: target.type,
    name: target.name,
    url: target.url,
    ...sourceWatchContractFields(target),
    status,
    fetched_at: context.generatedAt,
    http_status: result.status,
    site_metadata: {
      title: site.title || "",
      description: site.description || "",
      canonical_url: site.canonical_url || ""
    },
    feeds: site.feeds || [],
    discovered_github_repositories: site.github_repositories || []
  };
  const sourceItem = {
    id: target.id,
    name: target.name,
    url: target.url,
    category: "community",
    status,
    checked_at: context.generatedAt,
    notes,
    source_level: "ai_news_aggregator",
    ...sourceWatchContractFields(target),
    verification_status: result.ok ? "intermediary_only" : "unverified"
  };
  const candidate = result.ok ? sourceWatchSiteCandidate(target, site, {
    reportDate: context.reportDate,
    candidates: context.candidates
  }) : null;
  return {
    target: targetResult,
    source: sourceItem,
    candidate,
    auditSource: auditSource(target.name, target.url, status, notes, {
      id: target.id,
      target_id: target.id,
      parsed_count: candidate ? 1 : 0,
      ...sourceWatchContractFields(target),
      http_status: result.status,
      title: site.title || "",
      canonical_url: site.canonical_url || "",
      feeds_count: site.feeds?.length || 0,
      discovered_github_repositories: site.github_repositories || []
    })
  };
}

function sourceWatchGithubCandidate(target, metadata, details) {
  const latestRelease = details.releases[0]?.tag_name || "";
  const latestTag = details.tags[0]?.name || "";
  const latestCommit = details.commits[0]?.sha || "";
  const event = sourceWatchGithubEvent(target, metadata, details);
  const sourceWatch = sourceWatchGithubMetadata(target, metadata, details, event);
  return {
    id: uniqueCandidateId(details.candidates, `github-watch-${target.repo}`),
    observation_id: stableRowFingerprint("github-watch-repository", [target.id, target.repo, details.reportDate]),
    source_id: target.id,
    category: "project",
    title: metadata.full_name || target.repo,
    name: metadata.full_name || target.repo,
    repo: target.repo,
    url: metadata.html_url || target.url,
    source: target.name,
    event_date: dateOnly(event.date) || dateOnly(metadata.pushed_at) || details.reportDate,
    status: "excluded",
    signal: "github_watch",
    ...sourceWatchContractFields(target),
    source_watch: sourceWatch,
    description: metadata.description || "",
    evidence: `${target.repo} is explicitly watched; stars=${metadata.stars || 0}; forks=${metadata.forks || 0}; pushed_at=${metadata.pushed_at || "unknown"}.`,
    notes: [
      `stars=${metadata.stars || 0}`,
      `forks=${metadata.forks || 0}`,
      `pushed_at=${metadata.pushed_at || ""}`,
      latestRelease ? `latest_release=${latestRelease}` : "",
      latestTag ? `latest_tag=${latestTag}` : "",
      latestCommit ? `latest_commit=${latestCommit.slice(0, 12)}` : "",
      `readme=${details.readme.status}`
    ].filter(Boolean).join("; "),
    tags: metadata.topics || [],
    verification_status: details.materialSnapshotComplete === false ? "unverified" : "primary_confirmed",
    source_level: "github",
    primary_url: metadata.html_url || target.url,
    verification_sources: [metadata.html_url || target.url],
    editorial_category: "open_source",
    trend: "same"
  };
}

function sourceWatchGithubEventCandidates(target, metadata, details) {
  const repoUrl = metadata.html_url || target.url;
  const usedCandidates = [...details.candidates];
  const candidates = [];
  const add = (kind, item, fields) => {
    const url = sanitizePublicHttpUrl(fields.url) || repoUrl;
    const observationId = sourceWatchGithubEventObservationId(target, kind, item);
    const candidate = {
      id: uniqueCandidateId([...usedCandidates, ...candidates], `github-watch-${target.repo}-${kind}-${item.native_id || item.sha || item.tag_name || item.name || observationId}`),
      observation_id: observationId,
      source_id: target.id,
      category: "project",
      title: fields.title,
      name: metadata.full_name || target.repo,
      repo: target.repo,
      url,
      source: target.name,
      event_date: dateOnly(fields.date) || details.reportDate,
      status: "excluded",
      signal: "github_watch",
      ...sourceWatchContractFields(target),
      source_watch: {
        ...sourceWatchGithubMetadata(target, metadata, details, { url, date: fields.date }),
        event_url: url,
        snapshot_fingerprint: sourceWatchFingerprint({ repo: target.repo.toLowerCase(), kind, observation_id: observationId })
      },
      description: fields.description || metadata.description || "",
      evidence: fields.evidence,
      notes: `event_kind=${kind}; listener_event=true`,
      verification_status: details.materialSnapshotComplete === false ? "unverified" : "primary_confirmed",
      source_level: "github",
      primary_url: url,
      verification_sources: [url],
      editorial_category: "open_source",
      trend: "same"
    };
    candidates.push(candidate);
  };

  for (const release of details.releases) {
    add("release", release, {
      title: `${metadata.full_name || target.repo} release ${release.name || release.tag_name || "(untitled)"}`,
      url: release.html_url || `${repoUrl.replace(/\/$/, "")}/releases`,
      date: release.published_at,
      evidence: `${target.repo} published release ${release.tag_name || release.name || "(untitled)"}${release.published_at ? ` at ${release.published_at}` : ""}.`,
      description: release.name || release.tag_name || ""
    });
  }
  for (const tag of details.tags) {
    add("tag", tag, {
      title: `${metadata.full_name || target.repo} tag ${tag.name || "(untitled)"}`,
      url: `${repoUrl.replace(/\/$/, "")}/tree/${encodeURIComponent(tag.name || tag.commit_sha || "")}`,
      date: "",
      evidence: `${target.repo} exposed tag ${tag.name || "(untitled)"}${tag.commit_sha ? ` at ${tag.commit_sha.slice(0, 12)}` : ""}.`,
      description: tag.name || ""
    });
  }
  for (const commit of details.commits) {
    add("commit", commit, {
      title: `${metadata.full_name || target.repo} commit ${commit.message || commit.sha.slice(0, 12) || "(untitled)"}`,
      url: commit.html_url || `${repoUrl.replace(/\/$/, "")}/commit/${commit.sha}`,
      date: commit.author_date,
      evidence: `${target.repo} commit ${commit.sha.slice(0, 12) || "unknown"}${commit.author_date ? ` was authored at ${commit.author_date}` : ""}.`,
      description: commit.message || ""
    });
  }
  return candidates;
}

function sourceWatchGithubEventObservationId(target, kind, item) {
  const nativeId = firstString(item?.native_id, item?.sha, item?.tag_name, item?.name, item?.html_url);
  return nativeId
    ? stableRowFingerprint("github-watch-event", [target.id, target.repo, kind, "native", nativeId])
    : stableRowFingerprint("github-watch-event-row", [target.id, target.repo, kind, JSON.stringify(item)]);
}

function sourceWatchSiteCandidate(target, site, details) {
  const url = site.canonical_url || target.url;
  const sourceWatch = sourceWatchSiteMetadata(target, site, url);
  return {
    id: uniqueCandidateId(details.candidates, `site-watch-${target.id}`),
    source_id: target.id,
    category: "community_lead",
    title: site.title || target.name,
    url,
    source: target.name,
    event_date: details.reportDate,
    status: "excluded",
    signal: "site_watch",
    ...sourceWatchContractFields(target),
    source_watch: sourceWatch,
    evidence: `${target.name} is explicitly watched; feeds=${site.feeds.length}; github_links=${site.github_repositories.length}.`,
    notes: [
      site.description ? `description=${trimText(site.description, 160)}` : "",
      `feeds=${site.feeds.length}`,
      `github_links=${site.github_repositories.length}`
    ].filter(Boolean).join("; "),
    verification_status: "intermediary_only",
    source_level: "ai_news_aggregator",
    intermediary_url: target.url,
    verification_sources: [target.url],
    editorial_category: "community_signal",
    tags: site.github_repositories.map((repo) => repo.repo).slice(0, 5)
  };
}

function sourceWatchGithubMetadata(target, metadata, details, event = sourceWatchGithubEvent(target, metadata, details)) {
  const latestRelease = details.releases[0] || null;
  const latestTag = details.tags[0] || null;
  const latestCommit = details.commits[0] || null;
  const repoSnapshot = {
    repo: target.repo,
    stars: metadata.stars || 0,
    forks: metadata.forks || 0,
    open_issues: metadata.open_issues || 0,
    pushed_at: metadata.pushed_at || "",
    updated_at: metadata.updated_at || "",
    default_branch: metadata.default_branch || "",
    language: metadata.language || "",
    license: metadata.license || "",
    latest_release: latestRelease ? {
      tag_name: latestRelease.tag_name || "",
      name: latestRelease.name || "",
      html_url: latestRelease.html_url || "",
      published_at: latestRelease.published_at || "",
      prerelease: Boolean(latestRelease.prerelease)
    } : null,
    latest_tag: latestTag ? {
      name: latestTag.name || "",
      commit_sha: latestTag.commit_sha || ""
    } : null,
    latest_commit: latestCommit ? {
      sha: latestCommit.sha || "",
      html_url: latestCommit.html_url || "",
      message: latestCommit.message || "",
      author_date: latestCommit.author_date || "",
      author_name: latestCommit.author_name || ""
    } : null,
    readme_status: details.readme.status || "not_fetched"
  };
  const materialSnapshot = {
    repo: target.repo.toLowerCase(),
    pushed_at: repoSnapshot.pushed_at,
    latest_release: repoSnapshot.latest_release ? {
      tag_name: repoSnapshot.latest_release.tag_name,
      html_url: repoSnapshot.latest_release.html_url,
      published_at: repoSnapshot.latest_release.published_at,
      prerelease: repoSnapshot.latest_release.prerelease
    } : null,
    latest_tag: repoSnapshot.latest_tag,
    latest_commit: repoSnapshot.latest_commit ? {
      sha: repoSnapshot.latest_commit.sha,
      html_url: repoSnapshot.latest_commit.html_url,
      author_date: repoSnapshot.latest_commit.author_date
    } : null
  };
  return {
    signal: "github_watch",
    target_id: target.id,
    ...sourceWatchStrategy(target, "github_watch"),
    event_url: event.url,
    snapshot_fingerprint: sourceWatchFingerprint(materialSnapshot),
    repo_snapshot: repoSnapshot
  };
}

function sourceWatchGithubEvent(target, metadata, details) {
  const repoUrl = metadata.html_url || target.url;
  const latestRelease = details.releases[0] || null;
  const latestTag = details.tags[0] || null;
  const latestCommit = details.commits[0] || null;
  const releaseTime = sourceWatchEventTime(latestRelease?.published_at);
  const commitTime = sourceWatchEventTime(latestCommit?.author_date);
  if (latestCommit && (!latestRelease || commitTime > releaseTime)) {
    return {
      kind: "commit",
      url: latestCommit.html_url || repoUrl,
      date: latestCommit.author_date || metadata.pushed_at || ""
    };
  }
  if (latestRelease) {
    return {
      kind: "release",
      url: latestRelease.html_url || repoUrl,
      date: latestRelease.published_at || metadata.pushed_at || ""
    };
  }
  if (latestCommit) {
    return {
      kind: "commit",
      url: latestCommit.html_url || repoUrl,
      date: latestCommit.author_date || metadata.pushed_at || ""
    };
  }
  if (latestTag?.name) {
    return {
      kind: "tag",
      url: `${repoUrl.replace(/\/$/, "")}/tree/${encodeURIComponent(latestTag.name)}`,
      date: metadata.pushed_at || ""
    };
  }
  return { kind: "repository", url: repoUrl, date: metadata.pushed_at || "" };
}

function sourceWatchEventTime(value) {
  const timestamp = Date.parse(String(value || ""));
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

function sourceWatchSiteMetadata(target, site, eventUrl) {
  const siteSnapshot = {
    title: site.title || "",
    description: site.description || "",
    canonical_url: site.canonical_url || target.url,
    content_fingerprint: site.content_fingerprint || sourceWatchDigest(""),
    feeds: site.feeds.map((feed) => ({
      title: feed.title || "",
      type: feed.type || "",
      url: feed.url || ""
    })),
    discovered_github_repositories: site.github_repositories.map((repo) => ({
      repo: repo.repo || "",
      url: repo.url || ""
    }))
  };
  return {
    signal: "site_watch",
    target_id: target.id,
    ...sourceWatchStrategy(target, "site_watch"),
    event_url: eventUrl,
    snapshot_fingerprint: sourceWatchFingerprint(siteSnapshot),
    site_snapshot: siteSnapshot
  };
}

async function sourceWatchFetchJson(fetchImpl, url, init, budget) {
  if (budget && !budget.reserve()) {
    const limitation = budget.exhaustionReason() || "runtime_request_budget_exhausted";
    return { ok: false, status: 0, error: limitation, transport_status: "degraded", transport_limitation: limitation };
  }
  try {
    const response = await fetchImpl(url, init);
    const rateLimit = sourceWatchRateLimit(response);
    if (!response.ok) {
      return { ok: false, status: response.status || 0, response, rate_limit: rateLimit, error: withRetryNote(`HTTP ${response.status || 0}`, response) };
    }
    return {
      ok: true,
      status: response.status || 200,
      response,
      rate_limit: rateLimit,
      payload: await readJsonResponse(response)
    };
  } catch (error) {
    return { ok: false, status: 0, error: withRetryNote(formatDiscoveryErrorNote(error), error) };
  }
}

async function sourceWatchFetchGithubPages({ fetchImpl, url, init, runtime, laneKey, generatedAt }) {
  const rows = [];
  const rateLimit = {};
  const seenRequests = new Set();
  let pagesFetched = 0;
  let status = 0;
  let limitation = "";
  let error = "";

  const first = await sourceWatchFetchJson(fetchImpl, url, init, runtime?.budget);
  status = first.status || 0;
  sourceWatchMergeRateLimit(rateLimit, first.rate_limit);
  if (!first.ok) {
    return {
      ...first,
      payload: [],
      pages_fetched: 0,
      transport_status: "degraded",
      transport_limitation: first.transport_limitation || first.error || "first_page_fetch_failed"
    };
  }
  rows.push(...(Array.isArray(first.payload) ? first.payload : []));
  pagesFetched += 1;
  seenRequests.add(sourceWatchPaginationRequestKey(url));

  const currentNext = nextLinkUrl(first.response, url, "https://api.github.com");
  if (currentNext.error) limitation = currentNext.error;
  const savedState = sanitizeSharedPaginationState(runtime?.checkpoint?.lanes?.[laneKey]?.state);
  let nextUrl = savedState?.nextUrl || currentNext.url;
  let replayCurrent = Boolean(savedState?.nextUrl && currentNext.url && savedState.nextUrl !== currentNext.url);

  while (nextUrl && runtime?.budget?.canReserve()) {
    const requestFingerprint = sourceWatchPaginationRequestKey(nextUrl);
    if (!requestFingerprint || seenRequests.has(requestFingerprint)) {
      limitation = "pagination_request_repeated";
      nextUrl = "";
      break;
    }
    seenRequests.add(requestFingerprint);
    const page = await sourceWatchFetchJson(fetchImpl, nextUrl, init, runtime.budget);
    status = page.status || status;
    sourceWatchMergeRateLimit(rateLimit, page.rate_limit);
    if (!page.ok) {
      limitation = page.transport_limitation || "pagination_fetch_failed";
      error = page.error || limitation;
      break;
    }
    rows.push(...(Array.isArray(page.payload) ? page.payload : []));
    pagesFetched += 1;
    const following = nextLinkUrl(page.response, nextUrl, "https://api.github.com");
    if (following.error) {
      limitation = following.error;
      nextUrl = "";
    } else if (following.url) {
      nextUrl = following.url;
    } else if (replayCurrent) {
      nextUrl = currentNext.url;
      replayCurrent = false;
    } else {
      nextUrl = "";
    }
    if (nextUrl) {
      runtime.checkpoint.lanes[laneKey] = {
        provider: "github_source_watch",
        state: { nextUrl },
        updated_at: generatedAt
      };
      await persistContentTransportRuntime(runtime, generatedAt);
    }
  }

  if (nextUrl) {
    limitation ||= runtime?.budget?.exhaustionReason() || "checkpoint_backlog_pending";
    runtime.checkpoint.lanes[laneKey] = {
      provider: "github_source_watch",
      state: { nextUrl },
      updated_at: generatedAt
    };
  } else {
    delete runtime.checkpoint.lanes[laneKey];
  }
  return {
    ok: true,
    status,
    payload: rows,
    rate_limit: rateLimit,
    pages_fetched: pagesFetched,
    transport_status: limitation ? "degraded" : "complete",
    ...(limitation ? { transport_limitation: limitation } : {}),
    ...(nextUrl ? { continuation_url: nextUrl } : {}),
    ...(error ? { error } : {})
  };
}

function sourceWatchPaginationRequestKey(value) {
  const safe = sanitizePublicHttpUrl(value);
  return safe ? createHash("sha256").update(safe).digest("hex") : "";
}

async function sourceWatchFetchText(fetchImpl, url, init) {
  try {
    const response = await fetchImpl(url, init);
    if (!response.ok) {
      return { ok: false, status: response.status || 0, text: "", error: withRetryNote(`HTTP ${response.status || 0}`, response) };
    }
    return { ok: true, status: response.status || 200, text: await response.text() };
  } catch (error) {
    return { ok: false, status: 0, text: "", error: withRetryNote(formatDiscoveryErrorNote(error), error) };
  }
}

function sourceWatchGithubHeaders(options = {}) {
  const headers = {
    accept: "application/vnd.github+json",
    "user-agent": SOURCE_WATCH_USER_AGENT,
    "x-github-api-version": "2022-11-28"
  };
  const token = options.githubToken || options.env?.GITHUB_TOKEN || options.env?.GH_TOKEN || "";
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  return headers;
}

function sourceWatchEndpointLimit(options = {}) {
  const value = Number.parseInt(options.endpointLimit || options["endpoint-limit"] || DEFAULT_SOURCE_WATCH_ENDPOINT_LIMIT, 10);
  return Number.isInteger(value) && value > 0 ? Math.min(value, 100) : DEFAULT_SOURCE_WATCH_ENDPOINT_LIMIT;
}

function sourceWatchEndpointStatus(result = {}) {
  return {
    status: result.ok ? "checked" : "blocked",
    http_status: result.status || 0,
    ...(result.error ? { error: result.error } : {})
  };
}

function sourceWatchRateLimit(response) {
  const headers = response?.headers;
  if (!headers || typeof headers.get !== "function") {
    return {};
  }
  const values = {};
  for (const [key, header] of [
    ["limit", "x-ratelimit-limit"],
    ["remaining", "x-ratelimit-remaining"],
    ["used", "x-ratelimit-used"],
    ["reset", "x-ratelimit-reset"],
    ["resource", "x-ratelimit-resource"]
  ]) {
    const value = headers.get(header);
    if (value !== null && value !== undefined && value !== "") {
      values[key] = value;
    }
  }
  return values;
}

function sourceWatchMergeRateLimit(target, source) {
  if (!source || Object.keys(source).length === 0) {
    return;
  }
  Object.assign(target, source);
}

function sourceWatchRepoMetadata(payload = {}, target = {}) {
  const license = payload.license && typeof payload.license === "object"
    ? payload.license.spdx_id || payload.license.key || payload.license.name || ""
    : "";
  return {
    full_name: payload.full_name || target.repo,
    html_url: payload.html_url || target.url,
    description: payload.description || "",
    stars: Number.isInteger(payload.stargazers_count) ? payload.stargazers_count : 0,
    forks: Number.isInteger(payload.forks_count) ? payload.forks_count : 0,
    open_issues: Number.isInteger(payload.open_issues_count) ? payload.open_issues_count : 0,
    pushed_at: payload.pushed_at || "",
    updated_at: payload.updated_at || "",
    default_branch: payload.default_branch || "",
    language: payload.language || "",
    topics: Array.isArray(payload.topics) ? payload.topics.filter(Boolean).slice(0, 20) : [],
    license
  };
}

function sourceWatchReleases(payload) {
  return Array.isArray(payload) ? payload.map((release) => ({
    native_id: firstString(release.id, release.node_id, release.tag_name),
    tag_name: release.tag_name || "",
    name: release.name || release.tag_name || "",
    html_url: release.html_url || "",
    published_at: release.published_at || "",
    prerelease: Boolean(release.prerelease)
  })) : [];
}

function sourceWatchTags(payload) {
  return Array.isArray(payload) ? payload.map((tag) => ({
    native_id: firstString(tag.node_id, tag.name, tag.commit?.sha),
    name: tag.name || "",
    commit_sha: tag.commit?.sha || ""
  })) : [];
}

function sourceWatchCommits(payload) {
  return Array.isArray(payload) ? payload.map((commit) => ({
    native_id: firstString(commit.node_id, commit.sha),
    sha: commit.sha || "",
    html_url: commit.html_url || "",
    message: firstLine(commit.commit?.message || ""),
    author_date: commit.commit?.author?.date || "",
    author_name: commit.commit?.author?.name || ""
  })) : [];
}

function sourceWatchReadme(result = {}) {
  if (!result.ok) {
    return { status: result.status === 404 ? "missing" : "blocked", excerpt: "", error: result.error || "" };
  }
  const payload = result.payload || {};
  const encoded = String(payload.content || "").replace(/\s+/g, "");
  let text = "";
  try {
    text = encoded ? Buffer.from(encoded, payload.encoding || "base64").toString("utf8") : "";
  } catch {
    text = "";
  }
  return {
    status: text ? "checked" : "empty",
    excerpt: trimText(text, 800),
    path: payload.path || ""
  };
}

function parseSourceWatchSiteHtml(html, baseUrl) {
  const title = cleanText(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
  const description = sourceWatchMetaContent(html, "description") || sourceWatchMetaPropertyContent(html, "og:description");
  const canonical = sourceWatchLinkHref(html, "canonical", baseUrl);
  return {
    title,
    description,
    canonical_url: canonical || baseUrl,
    content_fingerprint: sourceWatchSiteContentFingerprint(html),
    feeds: sourceWatchFeeds(html, baseUrl),
    github_repositories: sourceWatchGithubLinks(html)
  };
}

function sourceWatchSiteContentFingerprint(html) {
  const rawHtml = String(html || "");
  const bodyHtml = rawHtml.match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i)?.[1] || rawHtml;
  const visibleText = decodeXml(bodyHtml
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<[^>]*(?:>|$)/g, " "))
    .replace(/\s+/g, " ")
    .trim();
  return sourceWatchDigest(visibleText);
}

function sourceWatchMetaContent(html, name) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    if (sourceWatchAttr(tag, "name").toLowerCase() === name.toLowerCase()) {
      return cleanText(sourceWatchAttr(tag, "content"));
    }
  }
  return "";
}

function sourceWatchMetaPropertyContent(html, property) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    if (sourceWatchAttr(tag, "property").toLowerCase() === property.toLowerCase()) {
      return cleanText(sourceWatchAttr(tag, "content"));
    }
  }
  return "";
}

function sourceWatchLinkHref(html, relName, baseUrl) {
  for (const tag of html.match(/<link\b[^>]*>/gi) || []) {
    const rel = sourceWatchAttr(tag, "rel").toLowerCase().split(/\s+/);
    if (rel.includes(relName.toLowerCase())) {
      return absoluteUrl(sourceWatchAttr(tag, "href"), baseUrl);
    }
  }
  return "";
}

function sourceWatchFeeds(html, baseUrl) {
  const feeds = [];
  const seen = new Set();
  for (const tag of html.match(/<link\b[^>]*>/gi) || []) {
    const rel = sourceWatchAttr(tag, "rel").toLowerCase().split(/\s+/);
    const type = sourceWatchAttr(tag, "type").toLowerCase();
    const href = absoluteUrl(sourceWatchAttr(tag, "href"), baseUrl);
    if (!href || !rel.includes("alternate") || !/(rss|atom|feed|json)/i.test(type)) {
      continue;
    }
    if (seen.has(href)) {
      continue;
    }
    seen.add(href);
    feeds.push({
      title: sourceWatchAttr(tag, "title") || "",
      type,
      url: href
    });
  }
  return feeds;
}

function sourceWatchGithubLinks(html) {
  const repos = [];
  const seen = new Set();
  const pattern = /https?:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/g;
  for (const match of html.matchAll(pattern)) {
    const repo = normalizeSourceWatchRepo(`${match[1]}/${match[2]}`);
    if (!repo || isGithubNonRepoPath(repo) || seen.has(repo.toLowerCase())) {
      continue;
    }
    seen.add(repo.toLowerCase());
    repos.push({
      repo,
      url: `${GITHUB_BASE_URL}/${repo}`
    });
  }
  return repos;
}

function isGithubNonRepoPath(repo) {
  const [owner, name] = String(repo || "").toLowerCase().split("/");
  return !owner || !name || new Set([
    "about",
    "apps",
    "collections",
    "customer-stories",
    "events",
    "explore",
    "features",
    "github",
    "issues",
    "login",
    "marketplace",
    "new",
    "notifications",
    "orgs",
    "pricing",
    "pulls",
    "search",
    "settings",
    "sponsors",
    "topics",
    "trending"
  ]).has(owner);
}

function sourceWatchAttr(tag, name) {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i");
  return decodeXml(tag.match(pattern)?.[2] || "");
}

function firstLine(value) {
  return String(value || "").split(/\r?\n/)[0].trim();
}

async function enrichGithubTrendingReadmes(candidates, options = {}) {
  if (options.disabled) {
    return candidates;
  }
  const fetchImpl = options.fetchImpl;
  if (typeof fetchImpl !== "function") {
    return candidates;
  }
  const maxCandidates = Number.isInteger(options.maxCandidates) && options.maxCandidates > 0
    ? options.maxCandidates
    : candidates.length;
  const enriched = [];
  for (const candidate of candidates) {
    if (enriched.length >= maxCandidates) {
      enriched.push(candidate);
      continue;
    }
    enriched.push(await enrichGithubTrendingReadme(candidate, fetchImpl, options.cache));
  }
  return enriched;
}

async function enrichGithubTrendingReadme(candidate, fetchImpl, cache) {
  if (candidate.readme_summary || candidate.github_readme_summary || candidate.readme_fetch_status || candidate.readme_status) {
    return candidate;
  }
  const repo = normalizeRepo(candidate.repo || candidate.name || candidate.url || "");
  if (!repo || repo.split("/").length !== 2) {
    return markGithubReadmeFetchFailed(candidate, "invalid_repo");
  }
  const branches = unique([candidate.default_branch, candidate.defaultBranch, "main", "master"].filter(Boolean));
  const filenames = ["README.md", "readme.md"];
  let lastError = "not_found";
  for (const branch of branches) {
    for (const filename of filenames) {
      const sourceUrl = `https://raw.githubusercontent.com/${repo}/${encodeURIComponent(branch)}/${filename}`;
      try {
        const response = await fetchImpl(sourceUrl, {
          headers: {
            "user-agent": "ai-daily-cn-static-publisher"
          }
        });
        if (!response?.ok) {
          lastError = `HTTP ${response?.status || 0}`;
          continue;
        }
        const readme = await response.text();
        if (!String(readme || "").trim()) {
          lastError = "empty_readme";
          continue;
        }
        const sha = createHash("sha256").update(String(readme)).digest("hex");
        const cacheKey = githubReadmeCacheKey({ repo, defaultBranch: branch, sha });
        const cached = cache instanceof Map ? cache.get(cacheKey) : null;
        const summary = cached?.summary || summarizeGithubReadme({ repo, readme, maxChars: 160 });
        return {
          ...applyGithubReadmeSummary(candidate, {
            repo,
            summary,
            defaultBranch: branch,
            sha,
            cacheKey,
            hit: Boolean(cached),
            sourceUrl
          }),
          readme_fetch_status: "ok"
        };
      } catch (error) {
        lastError = formatDiscoveryErrorNote(error);
      }
    }
  }
  return markGithubReadmeFetchFailed(candidate, lastError);
}

function markGithubReadmeFetchFailed(candidate, error) {
  return {
    ...candidate,
    readme_fetch_status: "failed",
    readme_error: String(error || "readme_unavailable")
  };
}

// Opt-in GitHub REST enrichment: topics, license, total stargazers and last
// push timestamp. Off unless a token/flag is supplied (so offline tests and the
// HTML-only path are unaffected), and resilient — a failed call keeps the
// scraped candidate and only records api_fetch_status. The trending HTML scrape
// already carries the weekly star velocity; this adds the slower-moving fields.
export async function enrichGithubTrendingApiFields(candidates, options = {}) {
  const list = Array.isArray(candidates) ? candidates : [];
  const fetchImpl = options.fetchImpl;
  const token = options.token || "";
  const enabled = options.enabled === true || Boolean(token);
  if (!enabled || typeof fetchImpl !== "function") {
    return list;
  }
  const maxCandidates = Number.isInteger(options.maxCandidates) && options.maxCandidates > 0
    ? options.maxCandidates
    : list.length;
  const enriched = [];
  for (const candidate of list) {
    if (enriched.length >= maxCandidates) {
      enriched.push(candidate);
      continue;
    }
    enriched.push(await enrichGithubTrendingApiField(candidate, fetchImpl, token));
  }
  return enriched;
}

async function enrichGithubTrendingApiField(candidate, fetchImpl, token) {
  const repo = normalizeRepo(candidate.repo || candidate.name || candidate.url || "");
  if (!repo || repo.split("/").length !== 2) {
    return { ...candidate, api_fetch_status: "failed", api_error: "invalid_repo" };
  }
  const headers = {
    "user-agent": "ai-daily-cn-static-publisher",
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28"
  };
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  try {
    const response = await fetchImpl(`https://api.github.com/repos/${repo}`, { headers });
    if (!response?.ok) {
      return { ...candidate, api_fetch_status: "failed", api_error: `HTTP ${response?.status || 0}` };
    }
    const data = await response.json();
    const topics = Array.isArray(data?.topics) ? data.topics.filter(Boolean).slice(0, 12) : [];
    const license = data?.license?.spdx_id || data?.license?.key || candidate.license || null;
    const stars = Number.isFinite(data?.stargazers_count) ? data.stargazers_count : (candidate.stargazers_total ?? null);
    const repositoryLanguage = cleanText(data?.language || candidate.repository_language || "");
    return {
      ...candidate,
      topics: topics.length > 0 ? topics : (Array.isArray(candidate.topics) ? candidate.topics : []),
      license: license && license !== "NOASSERTION" ? license : (candidate.license || null),
      stargazers_total: stars,
      ...(repositoryLanguage ? { repository_language: repositoryLanguage } : {}),
      pushed_at: data?.pushed_at || candidate.pushed_at || null,
      api_default_branch: data?.default_branch || candidate.default_branch || null,
      api_fetch_status: "ok"
    };
  } catch (error) {
    return { ...candidate, api_fetch_status: "failed", api_error: formatDiscoveryErrorNote(error) };
  }
}

function githubTrendingApiToken(options = {}) {
  const env = options.env || {};
  return options.githubToken || env.GH_TOKEN || env.GITHUB_TOKEN || "";
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export async function collectHuggingFaceTrending(options = {}) {
  const fetchImpl = createDiscoveryFetch(options.fetchImpl || globalThis.fetch, options);
  if (typeof fetchImpl !== "function") {
    throw new Error("fetch is not available in this runtime");
  }

  const reportDate = requireReportDate(options.reportDate);
  const generatedAt = options.generatedAt || new Date().toISOString();
  const sourceItem = normalizeGenericSource(options.source || DEFAULT_HUGGINGFACE_TRENDING_SOURCE, "huggingface-trending");
  const sourceResults = [];
  const candidateSources = [toCandidateSource(sourceItem, "project", generatedAt, "blocked", "")];
  const candidates = [];
  const requestUrl = withTransportPageSize(sourceItem.url, options.transportPageSize);

  try {
    const transport = await fetchHuggingFacePages({
      fetchImpl,
      url: requestUrl,
      pageSize: options.transportPageSize,
      requestBudget: options.transportRequestBudget,
      init: {
      headers: {
        accept: "application/json,text/html,*/*",
        "user-agent": "ai-daily-cn-static-publisher"
      },
      ...timeoutInit(sourceItem.timeoutMs || sourceItem.timeout_ms || 15000)
      }
    });
    const response = transport.response;
    if (!transport.ok) {
      const notes = withRetryNote(`HTTP ${response?.status || 0}`, response);
      markSource(candidateSources[0], "blocked", notes);
      sourceResults.push(auditSource(sourceItem.name, sourceItem.url, "blocked", notes, huggingFaceTransportAudit(transport)));
      return huggingFaceTrendingResult(sourceResults, candidateSources, candidates);
    }

    const entries = parseHuggingFaceTrendingEntries(transport.text, sourceItem)
      .filter((entry) => entry.repo && entry.url);
    for (const [index, entry] of entries.entries()) {
      candidates.push({
        id: uniqueCandidateId(candidates, `${sourceItem.id}-${entry.repo}`),
        observation_id: `huggingface:model:${entry.repo}`,
        source_id: sourceItem.id,
        category: "huggingface_trending",
        title: entry.repo,
        url: entry.url,
        source: sourceItem.name,
        event_date: reportDate,
        status: "excluded",
        rank: index + 1,
        downloads: entry.downloads,
        likes: entry.likes,
        task: entry.task,
        tags: entry.tags,
        evidence: huggingFaceTrendingEvidence(entry),
        source_level: "model_registry",
        verification_status: "primary_confirmed",
        primary_url: entry.url,
        verification_sources: [entry.url]
      });
    }
    const status = entries.length > 0 ? "checked" : "no_signal";
    const notes = withRetryNote(
      `${entries.length} ranked models parsed; transport_status=${transport.transport_status}; pages_fetched=${transport.pages_fetched}${transport.transport_limitation ? `; transport_limitation=${transport.transport_limitation}` : ""}${transport.continuation_url ? `; continuation_url=${sanitizeNoteValue(transport.continuation_url)}` : ""}`,
      response
    );
    markSource(candidateSources[0], status, notes);
    sourceResults.push(auditSource(sourceItem.name, sourceItem.url, status, notes, {
      parsed_count: entries.length,
      ...huggingFaceTransportAudit(transport)
    }));
  } catch (error) {
    const notes = withRetryNote(formatDiscoveryErrorNote(error), error);
    markSource(candidateSources[0], "blocked", notes);
    sourceResults.push(auditSource(sourceItem.name, sourceItem.url, "blocked", notes));
  }

  return huggingFaceTrendingResult(sourceResults, candidateSources, candidates);
}

function withTransportPageSize(value, pageSize) {
  const size = Number.parseInt(pageSize, 10);
  if (!Number.isInteger(size) || size <= 0) return value;
  try {
    const url = new URL(value);
    url.searchParams.set("limit", String(size));
    return url.toString();
  } catch {
    return value;
  }
}

async function fetchHuggingFacePages({ fetchImpl, url, init, pageSize, requestBudget }) {
  let nextUrl = String(url || "");
  let response = null;
  let pagesFetched = 0;
  const rows = [];
  const seenUrls = new Set();
  const seenPages = new Set();
  const allowedOrigin = safeUrlOrigin(nextUrl);
  const maxRequests = positiveInteger(requestBudget, 1000);

  while (nextUrl) {
    if (pagesFetched >= maxRequests) {
      return huggingFacePageResult({
        response,
        rows,
        pagesFetched,
        transportLimitation: "runtime_request_budget_exhausted",
        continuationUrl: nextUrl
      });
    }
    if (seenUrls.has(nextUrl)) {
      return huggingFacePageResult({ response, rows, pagesFetched, transportLimitation: "pagination_url_repeated" });
    }
    seenUrls.add(nextUrl);
    response = await fetchImpl(nextUrl, init);
    if (!response.ok) {
      if (pagesFetched === 0) {
        return {
          ok: false,
          response,
          text: "",
          pages_fetched: 0,
          transport_status: "degraded",
          transport_limitation: `http_${response.status}`
        };
      }
      return huggingFacePageResult({ response, rows, pagesFetched, transportLimitation: `pagination_http_${response.status}` });
    }

    const text = await response.text();
    const payload = parseJsonOrNull(text);
    if (payload === null) {
      return {
        ok: true,
        response,
        text,
        pages_fetched: 1,
        transport_status: "degraded",
        transport_limitation: "html_surface_has_no_reliable_pagination"
      };
    }
    const pageRows = Array.isArray(payload)
      ? payload
      : arrayFromPossibleKeys(payload, ["models", "spaces", "datasets", "items", "data", "results"]);
    const pageFingerprint = createHash("sha256").update(JSON.stringify(pageRows)).digest("hex");
    if (seenPages.has(pageFingerprint)) {
      return huggingFacePageResult({ response, rows, pagesFetched, transportLimitation: "pagination_page_repeated" });
    }
    seenPages.add(pageFingerprint);
    rows.push(...pageRows);
    pagesFetched += 1;

    const nextFromHeader = nextLinkUrl(response, nextUrl, allowedOrigin);
    if (nextFromHeader.error) {
      return huggingFacePageResult({ response, rows, pagesFetched, transportLimitation: nextFromHeader.error });
    }
    if (nextFromHeader.url) {
      nextUrl = nextFromHeader.url;
      continue;
    }

    const requestPageSize = positiveInteger(pageSize, transportPageSizeFromUrl(nextUrl));
    if (pageRows.length < requestPageSize) {
      return huggingFacePageResult({ response, rows, pagesFetched });
    }
    return huggingFacePageResult({
      response,
      rows,
      pagesFetched,
      transportLimitation: "upstream_pagination_link_missing_on_full_page"
    });
  }

  return huggingFacePageResult({ response, rows, pagesFetched });
}

function huggingFacePageResult({ response, rows, pagesFetched, transportLimitation = "", continuationUrl = "" }) {
  return {
    ok: true,
    response,
    text: JSON.stringify(rows),
    pages_fetched: pagesFetched,
    transport_status: transportLimitation ? "degraded" : "complete",
    ...(transportLimitation ? { transport_limitation: transportLimitation } : {}),
    ...(continuationUrl ? { continuation_url: continuationUrl } : {})
  };
}

function huggingFaceTransportAudit(transport = {}) {
  return {
    transport_status: transport.transport_status || "degraded",
    pages_fetched: Number(transport.pages_fetched || 0),
    ...(transport.transport_limitation ? { transport_limitation: transport.transport_limitation } : {}),
    ...(transport.continuation_url ? { continuation_url: transport.continuation_url } : {})
  };
}

function transportPageSizeFromUrl(value) {
  try {
    return positiveInteger(new URL(value).searchParams.get("limit"), 1);
  } catch {
    return 1;
  }
}

function nextLinkUrl(response, baseUrl, allowedOrigin) {
  const link = response?.headers?.get?.("link") || "";
  for (const part of String(link).split(",")) {
    const match = part.match(/<([^>]+)>\s*;\s*rel=(?:"next"|next)/i);
    if (!match) continue;
    try {
      const next = new URL(match[1], baseUrl).toString();
      const sanitized = sanitizePublicHttpUrl(next);
      if (!sanitized || new URL(sanitized).origin !== allowedOrigin) {
        return { url: "", error: "pagination_next_url_rejected" };
      }
      return { url: sanitized, error: "" };
    } catch {
      return { url: "", error: "pagination_next_url_invalid" };
    }
  }
  return { url: "", error: "" };
}

function isArxivApiSourceUrl(value) {
  try {
    const url = new URL(value);
    return url.hostname.toLowerCase() === "export.arxiv.org" && url.pathname === "/api/query";
  } catch {
    return false;
  }
}

async function createContentTransportRuntime(options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const statePath = options.transportStatePath ? path.resolve(rootDir, options.transportStatePath) : "";
  return {
    statePath,
    checkpoint: await loadSharedTransportCheckpoint(statePath),
    budget: createContentTransportBudget(options.transportRequestBudget, options.transportRuntimeMs),
    arxivQueue: Promise.resolve(),
    arxivLastRequestAt: 0,
    arxivThrottleMs: Number.isFinite(Number(options.providerThrottleMs)) ? Math.max(0, Number(options.providerThrottleMs)) : 3000
  };
}

async function persistContentTransportRuntime(runtime, generatedAt) {
  if (!runtime?.statePath) return;
  await writeSharedTransportCheckpoint(runtime.statePath, runtime.checkpoint, generatedAt);
}

async function fetchArxivContentPages({ fetchImpl, sourceInfo, url, init, runtime }) {
  const laneKey = `content:arxiv:${String(sourceInfo.id || sourceInfo.name || url).replace(/[^A-Za-z0-9._:-]+/g, "_")}`;
  const firstState = arxivStateFromUrl(url);
  const pageSize = positiveInteger(firstState.pageSize, 20);
  const blocks = [];
  const seenRequests = new Set();
  const seenPages = new Set();
  let response = null;
  let pagesFetched = 0;
  let limitation = "";

  const firstPage = await fetchArxivContentPage({ fetchImpl, url: arxivUrlForState(url, firstState.start, pageSize), init, runtime });
  response = firstPage.response;
  if (!firstPage.ok) {
    return {
      ok: false,
      response: response || transportResponseStub(false, 0),
      text: "",
      pages_fetched: 0,
      transport_status: "degraded",
      transport_limitation: firstPage.limitation || "first_page_fetch_failed"
    };
  }
  const firstParsed = parseArxivTransportPage(firstPage.text, firstState.start, pageSize);
  blocks.push(...firstParsed.blocks);
  pagesFetched += 1;
  seenRequests.add(arxivRequestFingerprint(firstPage.requestUrl));
  if (firstParsed.blocks.length > 0) seenPages.add(firstParsed.fingerprint);

  const savedState = sanitizeContentPaginationState(runtime.checkpoint.lanes?.[laneKey]?.state);
  let state = savedState || firstParsed.nextState;
  const currentNextState = firstParsed.nextState;
  let usedCheckpoint = Boolean(savedState && currentNextState && Number(savedState.start) !== Number(currentNextState.start));

  while (state && runtime.budget.canReserve()) {
    const requestUrl = arxivUrlForState(url, state.start, pageSize);
    const requestFingerprint = arxivRequestFingerprint(requestUrl);
    if (seenRequests.has(requestFingerprint)) {
      limitation = "pagination_request_repeated";
      state = null;
      break;
    }
    seenRequests.add(requestFingerprint);
    const page = await fetchArxivContentPage({ fetchImpl, url: requestUrl, init, runtime });
    response = page.response || response;
    if (!page.ok) {
      limitation = page.limitation || "pagination_fetch_failed";
      break;
    }
    const parsed = parseArxivTransportPage(page.text, state.start, pageSize);
    if (parsed.blocks.length > 0 && seenPages.has(parsed.fingerprint)) {
      limitation = "pagination_page_repeated";
      state = null;
      break;
    }
    if (parsed.blocks.length > 0) seenPages.add(parsed.fingerprint);
    blocks.push(...parsed.blocks);
    pagesFetched += 1;
    if (parsed.nextState) {
      state = parsed.nextState;
      runtime.checkpoint.lanes[laneKey] = contentCheckpointLane(sourceInfo, state);
      continue;
    }
    if (usedCheckpoint && currentNextState && Number(currentNextState.start) !== Number(state.start)) {
      state = currentNextState;
      usedCheckpoint = false;
      runtime.checkpoint.lanes[laneKey] = contentCheckpointLane(sourceInfo, state);
      continue;
    }
    state = null;
  }

  if (state) {
    limitation ||= runtime.budget.exhaustionReason() || "checkpoint_backlog_pending";
    runtime.checkpoint.lanes[laneKey] = contentCheckpointLane(sourceInfo, state);
  } else {
    delete runtime.checkpoint.lanes[laneKey];
  }
  const continuationUrl = state ? arxivUrlForState(url, state.start, pageSize) : "";
  return {
    ok: true,
    response: response || transportResponseStub(true, 200),
    text: `<?xml version="1.0"?><feed>${blocks.join("")}</feed>`,
    pages_fetched: pagesFetched,
    transport_status: limitation ? "degraded" : "complete",
    ...(limitation ? { transport_limitation: limitation } : {}),
    ...(continuationUrl ? { continuation_url: continuationUrl } : {})
  };
}

async function fetchArxivContentPage({ fetchImpl, url, init, runtime }) {
  const task = runtime.arxivQueue.then(async () => {
    const remaining = runtime.arxivThrottleMs - (Date.now() - runtime.arxivLastRequestAt);
    if (runtime.arxivLastRequestAt && remaining > 0) await sleep(remaining);
    if (!runtime.budget.reserve()) {
      return { ok: false, response: transportResponseStub(false, 0), text: "", limitation: runtime.budget.exhaustionReason(), requestUrl: url };
    }
    runtime.arxivLastRequestAt = Date.now();
    try {
      const response = await fetchImpl(url, init);
      return {
        ok: Boolean(response?.ok),
        response,
        text: response?.ok ? await response.text() : "",
        limitation: response?.ok ? "" : `http_${response?.status || 0}`,
        requestUrl: url
      };
    } catch (error) {
      return {
        ok: false,
        response: transportResponseStub(false, 0),
        text: "",
        limitation: `fetch_failed:${sanitizeNoteValue(formatDiscoveryErrorNote(error))}`,
        requestUrl: url
      };
    }
  });
  runtime.arxivQueue = task.then(() => undefined, () => undefined);
  return task;
}

function parseArxivTransportPage(text, start, pageSize) {
  const blocks = matchXmlBlocks(text, "entry");
  const totalRaw = xmlText(text, "totalResults");
  const total = totalRaw ? Number(totalRaw) : Number.NaN;
  const nextStart = Number(start || 0) + blocks.length;
  const exhausted = blocks.length === 0 || (Number.isFinite(total) && nextStart >= total) || (!Number.isFinite(total) && blocks.length < pageSize);
  return {
    blocks,
    fingerprint: createHash("sha256").update(blocks.join("\n")).digest("hex"),
    nextState: exhausted ? null : { start: nextStart }
  };
}

function arxivStateFromUrl(value) {
  try {
    const url = new URL(value);
    return {
      start: Math.max(0, Number.parseInt(url.searchParams.get("start") || "0", 10) || 0),
      pageSize: positiveInteger(url.searchParams.get("max_results"), 20)
    };
  } catch {
    return { start: 0, pageSize: 20 };
  }
}

function arxivUrlForState(value, start, pageSize) {
  const url = new URL(value);
  url.protocol = "https:";
  url.searchParams.set("start", String(Math.max(0, Number(start || 0))));
  url.searchParams.set("max_results", String(pageSize));
  return url.toString();
}

function arxivRequestFingerprint(value) {
  return createHash("sha256").update(String(value || "")).digest("hex");
}

function contentCheckpointLane(sourceInfo, state) {
  return {
    provider: "arxiv_content",
    source_id: String(sourceInfo.id || ""),
    state: sanitizeContentPaginationState(state),
    updated_at: new Date().toISOString()
  };
}

function sanitizeContentPaginationState(state) {
  if (!state || !Number.isInteger(Number(state.start)) || Number(state.start) < 0) return null;
  return { start: Number(state.start) };
}

function createContentTransportBudget(requestBudget, runtimeMs) {
  const maxRequests = positiveInteger(requestBudget, DEFAULT_TRANSPORT_REQUEST_BUDGET);
  const maxRuntimeMs = positiveInteger(runtimeMs, DEFAULT_TRANSPORT_RUNTIME_MS);
  const startedAt = Date.now();
  let used = 0;
  return {
    canReserve: () => used < maxRequests && Date.now() - startedAt < maxRuntimeMs,
    reserve() {
      if (!this.canReserve()) return false;
      used += 1;
      return true;
    },
    exhaustionReason() {
      if (used >= maxRequests) return "runtime_request_budget_exhausted";
      if (Date.now() - startedAt >= maxRuntimeMs) return "runtime_time_budget_exhausted";
      return "";
    }
  };
}

export async function loadSharedTransportCheckpoint(filePath) {
  if (!filePath) return { schema_version: 1, lanes: {} };
  try {
    const payload = JSON.parse(await fs.readFile(filePath, "utf8"));
    return { schema_version: 1, lanes: payload?.lanes && typeof payload.lanes === "object" ? payload.lanes : {} };
  } catch {
    return { schema_version: 1, lanes: {} };
  }
}

export async function writeSharedTransportCheckpoint(filePath, checkpoint, generatedAt) {
  const lanes = {};
  for (const [key, lane] of Object.entries(checkpoint?.lanes || {})) {
    const state = sanitizeSharedPaginationState(lane?.state);
    if (!state) continue;
    lanes[key] = {
      provider: String(lane.provider || ""),
      ...(lane.query_id ? { query_id: String(lane.query_id) } : {}),
      ...(lane.source_id ? { source_id: String(lane.source_id) } : {}),
      state,
      ...(lane.request_fingerprint ? { request_fingerprint: String(lane.request_fingerprint) } : {}),
      updated_at: String(lane.updated_at || generatedAt)
    };
  }
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify({ schema_version: 1, updated_at: generatedAt, lanes }, null, 2)}\n`, "utf8");
  await replaceCheckpointFile(temporary, filePath);
}

async function replaceCheckpointFile(temporary, destination) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      await fs.rename(temporary, destination);
      return;
    } catch (error) {
      if (!["EPERM", "EACCES", "EEXIST"].includes(error?.code) || attempt === 5) throw error;
      await sleep((attempt + 1) * 10);
    }
  }
}

export function sanitizeSharedPaginationState(state) {
  if (!state || typeof state !== "object" || Array.isArray(state)) return null;
  const clean = {};
  if (state.cursor !== undefined && String(state.cursor).length <= 2000) clean.cursor = String(state.cursor);
  if (Number.isInteger(Number(state.start)) && Number(state.start) >= 0) clean.start = Number(state.start);
  if (Number.isInteger(Number(state.offset)) && Number(state.offset) >= 0) clean.offset = Number(state.offset);
  if (Number.isInteger(Number(state.laneIndex)) && Number(state.laneIndex) >= 0) clean.laneIndex = Number(state.laneIndex);
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(state.reportDate || ""))) clean.reportDate = String(state.reportDate);
  if (/^[A-Za-z0-9:_-]{1,160}$/.test(String(state.laneFingerprint || ""))) clean.laneFingerprint = String(state.laneFingerprint);
  if (/^\d{14}$/.test(String(state.windowStart || ""))) clean.windowStart = String(state.windowStart);
  if (/^\d{14}$/.test(String(state.windowEnd || ""))) clean.windowEnd = String(state.windowEnd);
  if (Array.isArray(state.pendingWindows)) {
    clean.pendingWindows = state.pendingWindows.map((window) => ({
      start: /^\d{14}$/.test(String(window?.start || "")) ? String(window.start) : "",
      end: /^\d{14}$/.test(String(window?.end || "")) ? String(window.end) : ""
    })).filter((window) => window.start && window.end);
  }
  if (state.nextUrl) {
    const safe = sanitizePublicHttpUrl(String(state.nextUrl).replace(/([?&](?:api[_-]?key|token|secret|credential)=)[^&]*/gi, "$1[REDACTED]"));
    if (safe) clean.nextUrl = safe;
  }
  return Object.keys(clean).length ? clean : null;
}

function transportResponseStub(ok, status) {
  return { ok, status, headers: { get: () => null } };
}

function safeUrlOrigin(value) {
  try {
    return new URL(sanitizePublicHttpUrl(value)).origin;
  } catch {
    return "";
  }
}

function huggingFaceTrendingResult(sourceResults, candidateSources, candidates) {
  return {
    source_audit: {
      huggingface_trending: {
        checked: true,
        sources: sourceResults,
        candidates_found: candidates.length,
        included: 0,
        sources_checked: sourceResults.length,
        blocked_reason: candidates.length > 0 ? "" : inferBuilderBlockedReason(sourceResults),
        last_successful_feed_at: candidates.length > 0 ? new Date().toISOString() : null,
        notes: "Hugging Face public model ranking is tracked as a separate model/project lane, not as GitHub Trending."
      }
    },
    sources: candidateSources,
    candidates
  };
}

function parseHuggingFaceTrendingEntries(text, sourceItem) {
  const payload = parseJsonOrNull(text);
  if (Array.isArray(payload)) {
    return payload.map((item) => normalizeHuggingFaceTrendingEntry(item)).filter(Boolean);
  }
  if (payload && typeof payload === "object") {
    return arrayFromPossibleKeys(payload, ["models", "items", "data", "results"])
      .map((item) => normalizeHuggingFaceTrendingEntry(item))
      .filter(Boolean);
  }
  return parseHuggingFaceTrendingHtml(text, sourceItem);
}

function parseJsonOrNull(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizeHuggingFaceTrendingEntry(item) {
  if (!item || typeof item !== "object") {
    return null;
  }
  const repo = cleanText(firstString(item.modelId, item.id, item.repo, item.name, item.slug));
  if (!repo) {
    return null;
  }
  const tags = Array.isArray(item.tags) ? item.tags.map((tag) => cleanText(tag)).filter(Boolean).slice(0, 8) : [];
  return {
    repo,
    url: absoluteUrl(`/` + repo.replace(/^\/+/, ""), "https://huggingface.co"),
    task: cleanText(firstString(item.pipeline_tag, item.pipelineTag, item.task, item.library_name, item.libraryName, tags[0])),
    downloads: Number.isFinite(Number(item.downloads)) ? Number(item.downloads) : 0,
    likes: Number.isFinite(Number(item.likes)) ? Number(item.likes) : 0,
    tags
  };
}

function parseHuggingFaceTrendingHtml(html, sourceItem) {
  const entries = [];
  const seen = new Set();
  const anchorPattern = /<a\b[^>]*href=(?:"([^"]+)"|'([^']+)'|([^'"\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(anchorPattern)) {
    const href = decodeXml(match[1] || match[2] || match[3] || "");
    const url = absoluteUrl(href, sourceItem.url);
    if (!url || !/^https:\/\/huggingface\.co\/[^/?#]+\/[^/?#]+/i.test(url) || seen.has(url)) {
      continue;
    }
    const repo = new URL(url).pathname.replace(/^\/+/, "").replace(/\/+$/, "");
    if (!repo || repo.split("/").length !== 2) {
      continue;
    }
    seen.add(url);
    const text = cleanText(match[4]);
    entries.push({
      repo,
      url,
      task: text && text !== repo ? trimText(text, 40) : "",
      downloads: 0,
      likes: 0,
      tags: []
    });
  }
  return entries;
}

function huggingFaceTrendingEvidence(entry) {
  const metrics = [
    entry.task ? `task=${entry.task}` : "",
    entry.likes ? `likes=${entry.likes}` : "",
    entry.downloads ? `downloads=${entry.downloads}` : ""
  ].filter(Boolean).join("; ");
  return `Hugging Face ranked model entry${metrics ? `; ${metrics}` : ""}.`;
}

async function collectGitHubTrendingFromBrowserExport(options = {}) {
  const sources = await readBrowserExportSources(options.browserExportPath || options.browserExport, {
    name: options.browserExportName || "GitHub Trending browser export",
    url: options.browserExportUrl || DEFAULT_GITHUB_TRENDING_SOURCES[0].url,
    language: options.browserExportLanguage || DEFAULT_GITHUB_TRENDING_SOURCES[0].language,
    window: options.browserExportWindow || DEFAULT_GITHUB_TRENDING_SOURCES[0].window
  });
  const sourceResults = [];
  const byRepo = new Map();
  const observations = [];

  for (const exportSource of sources) {
    const parsed = parseGitHubTrendingHtml(exportSource.html, exportSource);
    sourceResults.push({
      name: exportSource.name,
      url: exportSource.url,
      status: parsed.length > 0 ? "checked" : "no_signal",
      notes: `${parsed.length} repositories parsed from browser export`,
      parsed_count: parsed.length
    });

    for (const candidate of parsed) {
      const enriched = enrichProjectCandidate(candidate, exportSource, options.reportDate);
      observations.push(enriched);
      const existing = byRepo.get(candidate.repo);
      if (!existing || shouldPreferGithubTrendingCandidate(enriched, existing)) {
        byRepo.set(candidate.repo, enriched);
      }
    }
  }

  const history = await loadGitHubTrendingHistory(options);
  const candidates = annotateGitHubTrendingCandidates(observations, history);
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

async function collectOssInsightTrendingFallback({ byRepo, sourceResults, fetchImpl, reportDate }) {
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
      .map((candidate) => enrichProjectCandidate(candidate, OSSINSIGHT_TRENDING_SOURCE, reportDate));
    sourceResults.push({
      name: OSSINSIGHT_TRENDING_SOURCE.name,
      url: OSSINSIGHT_TRENDING_SOURCE.url,
      status: parsed.length > 0 ? "checked" : "no_signal",
      notes: withRetryNote(`${parsed.length} repositories parsed from OSSInsight API fallback`, response),
      parsed_count: parsed.length
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
      notes: withRetryNote(formatDiscoveryErrorNote(error), error)
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
  const transportRuntime = await createContentTransportRuntime(options);
  const sources = await loadSources(options.sources, options.sourcesPath, DEFAULT_BUILDER_FALLBACK_SOURCES);
  const sourceResults = [];
  const candidateSources = [];
  const candidates = [];
  const followBuildersFeeds = options.followBuildersFeeds === false
    ? null
    : normalizeFollowBuildersFeeds(options.followBuildersFeeds || DEFAULT_FOLLOW_BUILDERS_FEEDS);

  if (followBuildersFeeds) {
    await collectFollowBuildersCentralFeeds({
      feeds: followBuildersFeeds,
      fetchImpl,
      reportDate,
      generatedAt,
      sourceResults,
      candidateSources,
      candidates
    });
  }

  if (followBuildersFeeds && options.xSearchFallback !== false) {
    await collectXBuilderSearchFallback({
      fetchImpl,
      reportDate,
      generatedAt,
      sourceResults,
      candidateSources,
      candidates,
      apiKey: Object.hasOwn(options, "xSearchApiKey") ? options.xSearchApiKey : process.env.TAVILY_API_KEY,
      queries: options.xSearchQueries,
      accounts: options.xSearchAccounts,
      lookbackDays: options.xSearchLookbackDays,
      transportRuntime
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
        .map((entry) => withObservedEntryDate(entry, reportDate))
        .map(retainEntryWithSafeUrl)
        .filter(Boolean);
      const status = entries.length > 0 ? "checked" : "no_signal";
      const notes = withRetryNote(`${entries.length} recent original entries parsed`, response);
      markSource(candidateSources.at(-1), status, notes);
      sourceResults.push(auditSource(currentSource.name, currentSource.url, status, notes));

      for (const entry of entries) {
        candidates.push({
          id: uniqueCandidateId(candidates, `${currentSource.id}-${entry.title || entry.url}`),
          ...observationIdentityFields(entry),
          source_id: currentSource.id,
          category: "builder_observation",
          title: entry.title ? `${currentSource.author || currentSource.name}: ${entry.title}` : "",
          url: entry.url,
          source: currentSource.name,
          event_date: entry.event_date,
          status: "excluded",
          evidence: summarizeEvidence(entry.summary, `${currentSource.author || currentSource.name} published this original feed entry.`)
        });
      }
    } catch (error) {
      const notes = withRetryNote(formatDiscoveryErrorNote(error), error);
      markSource(candidateSources.at(-1), "blocked", notes);
      sourceResults.push(auditSource(currentSource.name, currentSource.url, "blocked", notes));
    }
  }

  const curatedXHandleSet = await loadCuratedXHandles(options);
  const taggedCandidates = markCuratedXHandles(candidates, curatedXHandleSet);
  await persistContentTransportRuntime(transportRuntime, generatedAt);

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
          ? "follow-builders central feed is checked before X search fallback and fixed RSS/Atom fallback; X observations without an original status URL retain a safe relay/provider URL and explicit uncertainty tags."
          : "Fixed original-source fallback; each candidate comes from a directly fetched RSS/Atom feed."
      }
    },
    sources: candidateSources,
    candidates: taggedCandidates
  };
}

async function collectXBuilderSearchFallback({ fetchImpl, reportDate, generatedAt, sourceResults, candidateSources, candidates, apiKey, queries, accounts, lookbackDays, transportRuntime }) {
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

  let hitCount = 0;
  let blockedNote = "";
  const searchQueries = Array.isArray(queries) && queries.length > 0
    ? queries
    : buildXBuilderSearchQueries();
  const lanes = buildXBuilderSearchLanes(searchQueries, { reportDate, accounts, lookbackDays });
  const laneKey = "builder:tavily:x";
  const laneFingerprint = stableRowFingerprint("x-builder-lanes", lanes.map((lane) => lane.id));
  const savedState = sanitizeSharedPaginationState(transportRuntime.checkpoint.lanes?.[laneKey]?.state);
  let laneIndex = savedState?.reportDate === reportDate && savedState?.laneFingerprint === laneFingerprint
    ? Math.min(savedState.laneIndex || 0, lanes.length)
    : 0;
  let completedLanes = 0;

  for (; laneIndex < lanes.length; laneIndex += 1) {
    const lane = lanes[laneIndex];
    if (!transportRuntime.budget.reserve()) {
      blockedNote = transportRuntime.budget.exhaustionReason() || "runtime_request_budget_exhausted";
      break;
    }
    try {
      const response = await fetchImpl(sourceItem.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey,
          query: lane.query,
          max_results: TAVILY_MAX_RESULTS_PER_REQUEST,
          include_answer: false,
          include_raw_content: false,
          search_depth: "advanced",
          include_domains: ["x.com"],
          start_date: lane.start_date,
          end_date: lane.end_date
        })
      });
      if (!response.ok) {
        blockedNote = withRetryNote(`HTTP ${response.status}`, response);
        break;
      }

      const payload = await readJsonResponse(response);
      const parsed = parseXBuilderSearchResults(payload, {
        sourceItem,
        reportDate,
        query: `${lane.query}; lane=${lane.id}`
      });
      for (const entry of parsed) {
        hitCount += 1;
        candidates.push({
          ...entry,
          id: uniqueCandidateId(candidates, entry.id || `${sourceItem.id}-${entry.url}`)
        });
      }
      completedLanes += 1;
      const nextIndex = laneIndex + 1;
      if (nextIndex < lanes.length) {
        transportRuntime.checkpoint.lanes[laneKey] = {
          provider: "tavily_x_search",
          state: { laneIndex: nextIndex, reportDate, laneFingerprint },
          updated_at: generatedAt
        };
        await persistContentTransportRuntime(transportRuntime, generatedAt);
      }
    } catch (error) {
      blockedNote = withRetryNote(formatDiscoveryErrorNote(error), error);
      break;
    }
  }

  const hasContinuation = laneIndex < lanes.length;
  if (hasContinuation) {
    transportRuntime.checkpoint.lanes[laneKey] = {
      provider: "tavily_x_search",
      state: { laneIndex, reportDate, laneFingerprint },
      updated_at: generatedAt
    };
  } else {
    delete transportRuntime.checkpoint.lanes[laneKey];
  }

  const status = hitCount > 0 ? "checked" : blockedNote ? "blocked" : "no_signal";
  const limitations = ["provider_has_no_pagination", ...(hasContinuation ? [transportRuntime.budget.exhaustionReason() || "lane_backlog_pending"] : [])];
  const notes = hitCount > 0
    ? `${hitCount} X listener observations parsed across ${completedLanes}/${lanes.length} query/account/day lanes; transport_status=degraded; transport_limitation=${limitations.join(",")}; provider_max_results=${TAVILY_MAX_RESULTS_PER_REQUEST}`
    : `${blockedNote || "0 X listener observations parsed"}; lanes_completed=${completedLanes}/${lanes.length}; transport_status=degraded; transport_limitation=${limitations.join(",")}; provider_max_results=${TAVILY_MAX_RESULTS_PER_REQUEST}`;
  markSource(candidateSources.at(-1), status, notes);
  sourceResults.push(auditSource(sourceItem.name, sourceItem.url, status, notes, {
    transport_status: "degraded",
    transport_limitation: limitations.join(","),
    provider_max_results: TAVILY_MAX_RESULTS_PER_REQUEST,
    lane_count: lanes.length,
    lanes_completed: completedLanes,
    ...(hasContinuation ? { continuation_lane: laneIndex } : {})
  }));
}

function buildXBuilderSearchQueries() {
  return DEFAULT_X_BUILDER_SEARCH_TERMS.map((term) => `site:x.com/*/status "${term}"`);
}

function buildXBuilderSearchLanes(queries, { reportDate, accounts, lookbackDays }) {
  const globalAccounts = Array.isArray(accounts) ? accounts.map(normalizeXHandle).filter(Boolean) : [];
  const days = positiveInteger(lookbackDays, 1);
  const lanes = [];
  for (const rawQuery of queries) {
    const baseQuery = cleanText(typeof rawQuery === "string" ? rawQuery : rawQuery?.query || rawQuery?.term);
    if (!baseQuery) continue;
    const queryAccounts = Array.isArray(rawQuery?.accounts)
      ? rawQuery.accounts.map(normalizeXHandle).filter(Boolean)
      : globalAccounts;
    const accountLanes = queryAccounts.length > 0 ? queryAccounts : [""];
    for (const account of accountLanes) {
      const accountQuery = account
        ? (/site:x\.com\/\*\/status/i.test(baseQuery)
            ? baseQuery.replace(/site:x\.com\/\*\/status/i, `site:x.com/${account}/status`)
            : `site:x.com/${account}/status ${baseQuery}`)
        : baseQuery;
      for (let offset = 0; offset < days; offset += 1) {
        const startDate = shiftDate(reportDate, -offset);
        const endDate = shiftDate(startDate, 1);
        lanes.push({
          id: stableRowFingerprint("x-builder-lane", [accountQuery, startDate, endDate]),
          query: accountQuery,
          account,
          start_date: startDate,
          end_date: endDate
        });
      }
    }
  }
  return lanes;
}

function shiftDate(date, days) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function parseXBuilderSearchResults(payload, { sourceItem, reportDate, query }) {
  return arrayFromPossibleKeys(payload, ["results"])
    .map((item) => {
      const links = xObservationLinks(item.url, sourceItem.url);
      const eventDate = xStatusDate(links.original_url) || reportDate;
      const content = cleanText(item.content || item.raw_content || item.title);
      const handle = xStatusHandle(links.original_url);
      const author = handle ? `@${handle}` : "X builder";
      const avatarUrl = xAvatarUrl(handle);
      return {
        observation_id: xObservationId(sourceItem.id, links, eventDate, content),
        source_id: sourceItem.id,
        category: "builder_observation",
        title: content ? `${author}: ${shortenCandidateTitle(item.title || content)}` : "",
        ...links,
        ...(!content ? { tags: unique([...(links.tags || []), "content_pending"]) } : {}),
        source: sourceItem.name,
        event_date: eventDate,
        status: "excluded",
        author,
        ...(content ? { original_text: content } : {}),
        ...(handle ? { handle } : {}),
        ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
        evidence: summarizeEvidence(
          content,
          links.original_url
            ? `${author} posted this original X status.`
            : `${sourceItem.name} relayed an X observation whose original status URL was unavailable.`
        ),
        notes: appendSentence(links.notes, `x_search_query=${sanitizeNoteValue(query)}`)
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

async function collectSingleFollowBuildersFeed({ sourceItem, parser, fetchImpl, reportDate, generatedAt, sourceResults, candidateSources, candidates }) {
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
      reportDate
    });
    const upstreamErrors = followBuildersPayloadErrors(payload);
    const status = allParsed.length > 0 ? "checked" : upstreamErrors ? "blocked" : "no_signal";
    const notes = withRetryNote(
      upstreamErrors
        ? `${allParsed.length} listener entries parsed; upstream_error=${upstreamErrors}`
        : `${allParsed.length} listener entries parsed`,
      response
    );
    markSource(candidateSources.at(-1), status, notes);
    sourceResults.push(auditSource(sourceItem.name, sourceItem.url, status, notes));

    for (const entry of allParsed) {
      candidates.push({
        ...entry,
        id: uniqueCandidateId(candidates, entry.id || `${sourceItem.id}-${entry.title || entry.url}`)
      });
    }
  } catch (error) {
    const notes = withRetryNote(formatDiscoveryErrorNote(error), error);
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

function parseFollowBuildersXFeed(payload, { sourceItem, reportDate }) {
  const builders = Array.isArray(payload?.x) ? payload.x : Array.isArray(payload?.builders) ? payload.builders : [];
  const entries = [];
  for (const builder of builders) {
    const tweets = Array.isArray(builder?.tweets) ? builder.tweets : [];
    for (const tweet of tweets) {
      const eventDate = dateOnly(tweet.createdAt || tweet.created_at || tweet.date) || reportDate;
      const links = xObservationLinks(tweet.url, sourceItem.url);
      const handle = normalizeXHandle(builder.handle || xStatusHandle(links.original_url));
      const author = builder.name || (handle ? `@${handle}` : "") || "Builder";
      const avatarUrl = builderAvatarUrl(builder, handle);
      entries.push({
        observation_id: xObservationId(sourceItem.id, links, eventDate, tweet.text, handle),
        source_id: sourceItem.id,
        category: "builder_observation",
        title: tweet.text ? `${author}: ${shortenCandidateTitle(tweet.text)}` : "",
        ...links,
        ...(!tweet.text ? { tags: unique([...(links.tags || []), "content_pending"]) } : {}),
        source: sourceItem.name,
        event_date: eventDate,
        status: "excluded",
        author,
        ...(tweet.text ? { original_text: tweet.text } : {}),
        ...(handle ? { handle } : {}),
        ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
        evidence: summarizeEvidence(
          tweet.text,
          links.original_url
            ? `${author} posted this original X update.`
            : `${sourceItem.name} relayed an X observation whose original status URL was unavailable.`
        )
      });
    }
  }
  return entries;
}

function parseFollowBuildersPodcastFeed(payload, { sourceItem, reportDate }) {
  const episodes = arrayFromPossibleKeys(payload, ["podcasts", "episodes"]);
  return episodes
    .map((episode) => {
      const eventDate = dateOnly(episode.publishedAt || episode.published_at || episode.pubDate || episode.date) || reportDate;
      const url = sanitizePublicHttpUrl(episode.url);
      if (!url) {
        return null;
      }
      const title = cleanText(episode.title);
      return {
        observation_id: followBuildersRowObservationId(sourceItem, "podcast", episode),
        source_id: sourceItem.id,
        category: "builder_observation",
        title: title ? (episode.name ? `${episode.name}: ${title}` : title) : "",
        url,
        source: sourceItem.name,
        event_date: eventDate,
        status: "excluded",
        evidence: summarizeEvidence(episode.summary || episode.description || episode.transcript, "follow-builders podcast episode.")
      };
    })
    .filter(Boolean);
}

function parseFollowBuildersBlogFeed(payload, { sourceItem, reportDate }) {
  const posts = arrayFromPossibleKeys(payload, ["blogs", "posts", "articles"]);
  return posts
    .map((post) => {
      const eventDate = dateOnly(post.publishedAt || post.published_at || post.pubDate || post.date || post.event_date) || reportDate;
      const url = sanitizePublicHttpUrl(post.url);
      if (!url) {
        return null;
      }
      return {
        observation_id: followBuildersRowObservationId(sourceItem, "blog", post),
        source_id: sourceItem.id,
        category: "hot_blog",
        title: cleanText(post.title),
        url,
        source: post.source || post.publisher || sourceItem.name,
        event_date: eventDate,
        status: "excluded",
        evidence: summarizeEvidence(post.summary || post.description || post.content, "follow-builders blog entry.")
      };
    })
    .filter(Boolean);
}

function followBuildersRowObservationId(sourceItem, kind, item) {
  const nativeId = firstString(item?.id, item?.guid, item?.uuid, item?.episode_id, item?.post_id);
  return nativeId
    ? `${sourceItem.id || "follow-builders"}:${kind}:${cleanText(nativeId)}`
    : stableRowFingerprint(`follow-builders-${kind}-row`, [sourceItem.id || sourceItem.url, JSON.stringify(item)]);
}

export async function collectContentSources(options = {}) {
  const fetchImpl = createDiscoveryFetch(options.fetchImpl || globalThis.fetch, options);
  if (typeof fetchImpl !== "function") {
    throw new Error("fetch is not available in this runtime");
  }

  const reportDate = requireReportDate(options.reportDate);
  const generatedAt = options.generatedAt || new Date().toISOString();
  const platformExempt = normalizePlatformExemptOption(options.platformExempt);
  const sources = filterPlatformExemptSources(await loadContentSources(options), platformExempt);
  const ownsTransportRuntime = !options._contentTransportRuntime;
  const contentTransportRuntime = options._contentTransportRuntime || await createContentTransportRuntime(options);
  const sourceResults = [];
  const candidateSources = [];
  const candidates = [];
  const evidenceAssets = [];
  let sourcesToCollect = sources;

  if (!platformExempt && shouldCheckWeChatArticleInput(options)) {
    const wechatInput = await loadWeChatArticleInput({
      reportDate,
      inputPath: options.wechatInputPath,
      env: options.env || process.env
    });
    const status = wechatInput.status === "checked" ? "checked" : "no_signal";
    const notes = appendSentence(wechatInput.notes, "input_source=wechat_article_input; input_path_redacted=true; primary_verification_required=true");
    sourceResults.push(auditSource(WECHAT_ARTICLE_INPUT_SOURCE.name, WECHAT_ARTICLE_INPUT_SOURCE.url, status, notes));
    candidateSources.push(toCandidateSource(WECHAT_ARTICLE_INPUT_SOURCE, "community", generatedAt, status, notes));

    for (const article of wechatInput.articles) {
      candidates.push(wechatArticleCandidate(article, candidates));
    }
  }

  if (sources.length > 1 && options._singleContentSource !== true) {
    const collected = await mapWithConcurrency(
      sources,
      positiveInteger(options.sourceConcurrency || options["source-concurrency"], 12),
      (rawSource) => collectContentSources({
        ...options,
        sources: [rawSource],
        includeWeChatInput: false,
        _singleContentSource: true,
        _contentTransportRuntime: contentTransportRuntime
      })
    );
    for (const result of collected) {
      const audit = Object.values(result.source_audit || {})[0] || {};
      sourceResults.push(...(Array.isArray(audit.sources) ? audit.sources : []));
      candidateSources.push(...(Array.isArray(result.sources) ? result.sources : []));
      candidates.push(...(Array.isArray(result.candidates) ? result.candidates : []));
      evidenceAssets.push(...(Array.isArray(result.evidence_assets) ? result.evidence_assets : []));
    }
    sourcesToCollect = [];
  }

  for (const rawSource of sourcesToCollect) {
    const currentSource = normalizeGenericSource(rawSource, "content");
    const { sourceCategory, candidateCategory, entryLabel } = contentSourceKinds(currentSource);
    candidateSources.push(toCandidateSource(currentSource, sourceCategory, generatedAt, "blocked", ""));
    const skipped = contentSourceSkipReason(currentSource, options.env || process.env);
    if (skipped) {
      markSource(candidateSources.at(-1), "blocked", skipped);
      sourceResults.push(auditSource(currentSource.name, currentSource.url, skipped, skipped, platformAuditSourceExtra(currentSource)));
      continue;
    }
    if (currentSource.source_kind === OPENROUTER_RANKINGS_SOURCE_KIND) {
      const result = await collectOpenRouterRankingsSource(currentSource, {
        ...options,
        generatedAt,
        reportDate
      });
      evidenceAssets.push(...(Array.isArray(result.evidence_assets) ? result.evidence_assets : []));
      markSource(candidateSources.at(-1), result.status, result.notes);
      sourceResults.push(auditSource(currentSource.name, currentSource.url, result.status, result.notes, {
        snapshot: result.snapshot
      }));
      candidates.push(...rankingSnapshotCandidates(result.snapshot, currentSource, reportDate, generatedAt, candidates));
      continue;
    }
    if (currentSource.source_kind === ARTIFICIAL_ANALYSIS_INDEX_SOURCE_KIND) {
      const result = await collectArtificialAnalysisIndexSource(currentSource, {
        ...options,
        generatedAt,
        reportDate
      });
      evidenceAssets.push(...(Array.isArray(result.evidence_assets) ? result.evidence_assets : []));
      markSource(candidateSources.at(-1), result.status, result.notes);
      sourceResults.push(auditSource(currentSource.name, currentSource.url, result.status, result.notes, {
        snapshot: result.snapshot
      }));
      candidates.push(...rankingSnapshotCandidates(result.snapshot, currentSource, reportDate, generatedAt, candidates));
      continue;
    }
    if (currentSource.source_kind === SWE_BENCH_PRO_PUBLIC_SOURCE_KIND) {
      const result = await collectSweBenchProSource(currentSource, {
        ...options,
        generatedAt,
        reportDate
      });
      evidenceAssets.push(...(Array.isArray(result.evidence_assets) ? result.evidence_assets : []));
      markSource(candidateSources.at(-1), result.status, result.notes);
      sourceResults.push(auditSource(currentSource.name, currentSource.url, result.status, result.notes, {
        snapshot: result.snapshot
      }));
      candidates.push(...rankingSnapshotCandidates(result.snapshot, currentSource, reportDate, generatedAt, candidates));
      continue;
    }
    if (currentSource.source_kind === GITHUB_REPORT_MARKDOWN_SOURCE_KIND) {
      try {
        const result = await collectGitHubReportMarkdownSource({
          sourceInfo: currentSource,
          fetchImpl,
          reportDate,
          generatedAt,
          options
        });
        const datedEntries = result.entries
          .map((entry) => withObservedEntryDate(entry, reportDate))
          .map(retainEntryWithSafeUrl)
          .filter(Boolean);
        const platformAnnotations = {};
        const entries = annotatePlatformEntries(datedEntries, currentSource, candidateCategory, platformAnnotations);
        for (const entry of entries) {
          candidates.push(platformCandidateOrContentCandidate({
            id: uniqueCandidateId(candidates, `${currentSource.id}-${entry.title || entry.url}`),
            ...observationIdentityFields(entry),
            source_id: currentSource.id,
            category: candidateCategory,
            title: entry.title,
            url: entry.url,
            source: currentSource.name,
            event_date: entry.event_date,
            status: "excluded",
            evidence: contentCandidateEvidence(entry, currentSource, candidateCategory, entryLabel),
            notes: [contentCandidateNotes(entry, currentSource, ""), `source_report_url=${sanitizeNoteValue(entry.source_report_url || currentSource.url)}`].filter(Boolean).join("; "),
            ...contentVerificationFields({ ...entry, url: entry.source_report_url || entry.url }, currentSource, ""),
            ...(Array.isArray(entry.tags) ? { tags: entry.tags } : {}),
            ...contentCandidateTagFields(entry, currentSource),
            ...(entry.publisher ? { publisher: entry.publisher } : {}),
            ...(candidateCategory === "project" ? { signal: currentSource.signal || "github_report" } : {})
          }, entry, currentSource, candidates));
        }
        const status = entries.length > 0 ? result.status : "no_signal";
        const notes = appendPlatformAnnotations(`${result.notes}; ${entries.length} listener entries retained`, platformAnnotations);
        markSource(candidateSources.at(-1), status, notes);
        sourceResults.push(auditSource(currentSource.name, currentSource.url, status, notes, platformAuditSourceExtra(currentSource, { parsed_count: entries.length })));
      } catch (error) {
        const notes = withRetryNote(formatDiscoveryErrorNote(error), error);
        markSource(candidateSources.at(-1), "blocked", notes);
        sourceResults.push(auditSource(currentSource.name, currentSource.url, "blocked", notes, platformAuditSourceExtra(currentSource)));
      }
      continue;
    }

    try {
      const requestUrl = contentSourceRequestUrl(currentSource, options.env || process.env, reportDate);
      const requestInit = {
        headers: {
          accept: "application/json, application/atom+xml, application/rss+xml, application/xml, text/xml, text/html, */*",
          "user-agent": "ai-daily-cn-static-publisher"
        },
        ...timeoutInit(currentSource.timeoutMs || currentSource.timeout_ms || 15000)
      };
      const huggingFaceTransport = currentSource.source_kind === HUGGINGFACE_HUB_TRENDING_API_SOURCE_KIND
        ? await fetchHuggingFacePages({
            fetchImpl,
            url: requestUrl,
            init: requestInit,
            pageSize: transportPageSizeFromUrl(requestUrl),
            requestBudget: options.transportRequestBudget
          })
        : null;
      const arxivTransport = !huggingFaceTransport && isArxivApiSourceUrl(requestUrl)
        ? await fetchArxivContentPages({
            fetchImpl,
            sourceInfo: currentSource,
            url: requestUrl,
            init: requestInit,
            runtime: contentTransportRuntime
          })
        : null;
      const paginationTransport = huggingFaceTransport || arxivTransport;
      const response = paginationTransport?.response || await fetchImpl(requestUrl, requestInit);
      let responseText = paginationTransport?.text || "";
      let responseForRetryNote = response;
      let cacheFallbackNote = "";
      if (!(paginationTransport ? paginationTransport.ok : response.ok)) {
        const notes = withRetryNote(`HTTP ${response.status}`, response);
        const cached = await readContentSourceCache({
          rootDir: options.rootDir || process.cwd(),
          sourceInfo: currentSource,
          maxAgeDays: options.cacheTtlDays || currentSource.cache_ttl_days || DEFAULT_SOURCE_CACHE_TTL_DAYS,
          enabled: options.cacheFallback !== false
        });
        if (!cached) {
          markSource(candidateSources.at(-1), "blocked", notes);
          sourceResults.push(auditSource(currentSource.name, currentSource.url, "blocked", notes, platformAuditSourceExtra(currentSource)));
          continue;
        }
        responseText = cached.content;
        responseForRetryNote = null;
        cacheFallbackNote = `cache_fallback_used; original_error=${sanitizeNoteValue(notes)}; cached_at=${sanitizeNoteValue(cached.fetched_at)}`;
      } else if (!paginationTransport) {
        responseText = await response.text();
        await writeContentSourceCache({
          rootDir: options.rootDir || process.cwd(),
          sourceInfo: currentSource,
          content: responseText,
          fetchedAt: generatedAt,
          enabled: options.cacheFallback !== false
        });
      } else {
        await writeContentSourceCache({
          rootDir: options.rootDir || process.cwd(),
          sourceInfo: currentSource,
          content: responseText,
          fetchedAt: generatedAt,
          enabled: options.cacheFallback !== false
        });
      }

      const parsedEntries = await hydrateSearchApiEntries(
        parseContentSourceEntries(responseText, currentSource),
        currentSource,
        fetchImpl
      );
      const hydrationFailureCount = parsedEntries.filter((entry) => entry.transport_degraded === "item_hydration_failed").length;
      const datedEntries = parsedEntries
        .map((entry) => withObservedEntryDate(entry, reportDate))
        .map(retainEntryWithSafeUrl)
        .filter(Boolean);
      const platformAnnotations = {};
      const entries = annotatePlatformEntries(datedEntries, currentSource, candidateCategory, platformAnnotations);
      const status = entries.length > 0 ? "checked" : "no_signal";
      let notes = cacheFallbackNote
        ? `${entries.length} recent ${entryLabel} entries parsed; ${cacheFallbackNote}`
        : withRetryNote(`${entries.length} recent ${entryLabel} entries parsed`, responseForRetryNote);
      notes = appendPlatformAnnotations(notes, platformAnnotations);
      if (paginationTransport) {
        notes = appendSentence(notes, `transport_status=${paginationTransport.transport_status}; pages_fetched=${paginationTransport.pages_fetched}${paginationTransport.transport_limitation ? `; transport_limitation=${paginationTransport.transport_limitation}` : ""}${paginationTransport.continuation_url ? `; continuation_url=${sanitizeNoteValue(paginationTransport.continuation_url)}` : ""}`);
      }
      if (hydrationFailureCount > 0) {
        notes = appendSentence(notes, `transport_status=degraded; item_hydration_failed=${hydrationFailureCount}; all list observations retained as placeholders`);
      }
      let confirmedProductCrossChecks = 0;
      let unresolvedProductCrossChecks = 0;
      let missingOriginalUrlCount = 0;

      for (const entry of entries) {
        const originalUrl = originalRequiredUrlForEntry(entry, currentSource);
        if (requiresOriginalUrl(currentSource) && !originalUrl) {
          missingOriginalUrlCount += 1;
        }
        let candidate = platformCandidateOrContentCandidate({
          id: uniqueCandidateId(candidates, `${currentSource.id}-${entry.title || entry.url}`),
          ...observationIdentityFields(entry),
          source_id: currentSource.id,
          category: candidateCategory,
          title: entry.title,
          url: originalUrl || entry.url,
          source: contentCandidateSource(entry, currentSource),
          event_date: entry.event_date,
          status: "excluded",
          evidence: contentCandidateEvidence(entry, currentSource, candidateCategory, entryLabel),
          notes: contentCandidateNotes(entry, currentSource, originalUrl),
          ...contentVerificationFields(entry, currentSource, originalUrl),
          ...contentCandidateImageFields(entry),
          ...(Array.isArray(entry.tags) ? { tags: entry.tags } : {}),
          ...contentCandidateTagFields(entry, currentSource),
          ...(entry.publisher ? { publisher: entry.publisher } : {}),
          ...(candidateCategory === "project" ? { signal: currentSource.signal || "product_hunt" } : {})
        }, entry, currentSource, candidates);

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
        notes = `${notes}; ${missingOriginalUrlCount} retained without original URL`;
      }
      markSource(candidateSources.at(-1), status, notes);
      sourceResults.push(auditSource(currentSource.name, currentSource.url, status, notes, platformAuditSourceExtra(currentSource, {
        parsed_count: entries.length,
        transport_status: hydrationFailureCount > 0 || paginationTransport?.transport_status === "degraded" ? "degraded" : "complete",
        ...(paginationTransport ? { pages_fetched: paginationTransport.pages_fetched } : {}),
        ...(paginationTransport?.transport_limitation ? { transport_limitation: paginationTransport.transport_limitation } : {}),
        ...(paginationTransport?.continuation_url ? { continuation_url: paginationTransport.continuation_url } : {}),
        ...(hydrationFailureCount > 0 ? {
          transport_limitation: "item_hydration_failed",
          hydration_failure_count: hydrationFailureCount
        } : {})
      })));
    } catch (error) {
      const notes = withRetryNote(formatDiscoveryErrorNote(error), error);
      const cached = await readContentSourceCache({
        rootDir: options.rootDir || process.cwd(),
        sourceInfo: currentSource,
        maxAgeDays: options.cacheTtlDays || currentSource.cache_ttl_days || DEFAULT_SOURCE_CACHE_TTL_DAYS,
        enabled: options.cacheFallback !== false
      });
      if (!cached) {
        markSource(candidateSources.at(-1), "blocked", notes);
        sourceResults.push(auditSource(currentSource.name, currentSource.url, "blocked", notes, platformAuditSourceExtra(currentSource)));
        continue;
      }
      const parsedEntries = await hydrateSearchApiEntries(
        parseContentSourceEntries(cached.content, currentSource),
        currentSource,
        fetchImpl
      );
      const hydrationFailureCount = parsedEntries.filter((entry) => entry.transport_degraded === "item_hydration_failed").length;
      const datedEntries = parsedEntries
        .map((entry) => withObservedEntryDate(entry, reportDate))
        .map(retainEntryWithSafeUrl)
        .filter(Boolean);
      const platformAnnotations = {};
      const entries = annotatePlatformEntries(datedEntries, currentSource, contentSourceKinds(currentSource).candidateCategory, platformAnnotations);
      const status = entries.length > 0 ? "checked" : "no_signal";
      let missingOriginalUrlCount = 0;
      for (const entry of entries) {
        const originalUrl = originalRequiredUrlForEntry(entry, currentSource);
        if (requiresOriginalUrl(currentSource) && !originalUrl) {
          missingOriginalUrlCount += 1;
        }
        candidates.push(platformCandidateOrContentCandidate({
          id: uniqueCandidateId(candidates, `${currentSource.id}-${entry.title || entry.url}`),
          ...observationIdentityFields(entry),
          source_id: currentSource.id,
          category: candidateCategory,
          title: entry.title,
          url: originalUrl || entry.url,
          source: contentCandidateSource(entry, currentSource),
          event_date: entry.event_date,
          status: "excluded",
          evidence: contentCandidateEvidence(entry, currentSource, candidateCategory, entryLabel),
          notes: contentCandidateNotes(entry, currentSource, originalUrl),
          ...contentVerificationFields(entry, currentSource, originalUrl),
          ...contentCandidateImageFields(entry),
          ...(Array.isArray(entry.tags) ? { tags: entry.tags } : {}),
          ...contentCandidateTagFields(entry, currentSource),
          ...(entry.publisher ? { publisher: entry.publisher } : {})
        }, entry, currentSource, candidates));
      }
      let cacheNotes = appendPlatformAnnotations(`${entries.length} recent ${entryLabel} entries parsed; cache_fallback_used; original_error=${sanitizeNoteValue(notes)}; cached_at=${sanitizeNoteValue(cached.fetched_at)}${missingOriginalUrlCount > 0 ? `; ${missingOriginalUrlCount} retained without original URL` : ""}`, platformAnnotations);
      if (hydrationFailureCount > 0) {
        cacheNotes = appendSentence(cacheNotes, `transport_status=degraded; item_hydration_failed=${hydrationFailureCount}; all list observations retained as placeholders`);
      }
      markSource(candidateSources.at(-1), status, cacheNotes);
      sourceResults.push(auditSource(currentSource.name, currentSource.url, status, cacheNotes, platformAuditSourceExtra(currentSource, {
        parsed_count: entries.length,
        transport_status: "degraded",
        transport_limitation: hydrationFailureCount > 0 ? "cache_fallback_and_item_hydration_failed" : "cache_fallback",
        ...(hydrationFailureCount > 0 ? { hydration_failure_count: hydrationFailureCount } : {})
      })));
    }
  }
  const auditGroupName = platformExempt
    ? auditGroupForPlatform(platformExempt)
    : String(options.auditGroupName || "content_sources").trim() || "content_sources";

  if (ownsTransportRuntime) {
    await persistContentTransportRuntime(contentTransportRuntime, generatedAt);
  }

  return {
    report_date: reportDate,
    generated_at: generatedAt,
    source_audit: {
      [auditGroupName]: {
        checked: true,
        sources: sourceResults,
        candidates_found: candidates.length,
        included: 0,
        sources_checked: sourceResults.length,
        credibility_tag_counts: countBy(sources, "credibility_tag"),
        source_group_counts: countBy(sources, "source_group"),
        source_kind_counts: countBy(sources, "source_kind"),
        blocked_reason: candidates.length > 0 ? "" : inferBuilderBlockedReason(sourceResults),
        last_successful_feed_at: candidates.length > 0 ? generatedAt : null,
        notes: platformExempt
          ? `${platformExempt} platform listener sources retain every parsed entry. Legacy host and keyword contract results are recorded as annotations only; they never suppress listener observations.`
          : "Official labs, broad tech/big-tech newsrooms, engineering blogs, high-quality newsletters, interviews, aggregators, podcast platforms, intermediary/self-media leads, X-hotspot feeds, and product feeds are checked as content/project/community candidates. Intermediary and self-media observations remain visible with credibility metadata. Product Hunt project candidates are cross-checked against product homepages, GitHub, README, or docs when available. X observations without original status URLs retain safe relay/provider URLs and explicit uncertainty tags."
      }
    },
    sources: candidateSources,
    candidates,
    evidence_assets: evidenceAssets
  };
}

function rankingSnapshotCandidates(snapshot, sourceInfo, reportDate, generatedAt, existingCandidates) {
  const rows = Array.isArray(snapshot?.top_entries) ? snapshot.top_entries : [];
  return rows.map((row, index) => {
    const rank = Number(row.rank) || index + 1;
    const model = cleanText(row.model || row.name || `rank-${rank}`);
    const provider = cleanText(row.provider || "");
    const metric = cleanText(row.tokens || row.score || row.value || "");
    const idSeed = `${sourceInfo.id}-${reportDate}-${rank}-${model}`;
    return {
      id: uniqueCandidateId(existingCandidates, idSeed),
      observation_id: `ranking:${slugId(sourceInfo.id)}:${reportDate}:${rank}:${slugId(model)}`,
      source_id: sourceInfo.id,
      category: sourceInfo.candidate_category || "model_release",
      title: `${sourceInfo.name} #${rank}: ${model}`,
      url: sourceInfo.url,
      source: sourceInfo.name,
      publisher: provider || sourceInfo.name,
      source_group: sourceInfo.source_group || "papers_models",
      rank,
      event_date: reportDate,
      collected_at: generatedAt,
      status: "excluded",
      summary: [provider, metric].filter(Boolean).join(" · ") || `${model} appeared in the public ranking snapshot.`,
      evidence: `${model} appeared at rank ${rank} in ${sourceInfo.name}${metric ? ` with ${metric}` : ""}.`,
      source_level: "community_api",
      ...(sourceInfo.credibility_tag ? { credibility_tag: sourceInfo.credibility_tag } : {}),
      verification_status: "unverified",
      content_tags: unique([...(Array.isArray(sourceInfo.content_tags) ? sourceInfo.content_tags : []), "model_release"])
    };
  });
}

function shouldCheckWeChatArticleInput(options = {}) {
  if (options.includeWeChatInput === false) {
    return false;
  }
  if (options.wechatInputPath) {
    return true;
  }
  return !Array.isArray(options.sources) && !options.sourcesPath;
}

function wechatArticleCandidate(article, candidates) {
  const hasPrimarySources = article.primary_urls.length > 0;
  const notes = [
    "input_source=wechat_article_input",
    `account=${sanitizeNoteValue(article.account_name)}`,
    `risk_level=${article.risk_level}`,
    `allowed_sections=${sanitizeNoteValue(article.allowed_sections.join(","))}`,
    `primary_verification_required=${hasPrimarySources ? "false" : "true"}`,
    "input_path_redacted=true"
  ].join("; ");
  return {
    id: uniqueCandidateId(candidates, `${WECHAT_ARTICLE_INPUT_SOURCE.id}-${article.account_name}-${article.title}`),
    source_id: WECHAT_ARTICLE_INPUT_SOURCE.id,
    category: "community_lead",
    title: article.title,
    url: article.url,
    source: `WeChat · ${article.account_name}`,
    author: article.account_name,
    event_date: article.event_date,
    status: "excluded",
    evidence: appendSentence(article.summary, "White-listed WeChat article input; treat as a viewpoint or industry lead unless primary verification is present."),
    notes,
    intermediary_url: article.url,
    original_url: article.url,
    verification_status: hasPrimarySources ? "primary_confirmed" : "intermediary_only",
    source_level: article.source_level,
    verification_note: article.verification_notes,
    risk_note: `risk_level=${article.risk_level}; ${article.risk_notes}`,
    reader_relevance: article.reader_relevance,
    verification_sources: article.primary_urls,
    ...(hasPrimarySources ? { primary_url: article.primary_urls[0] } : {})
  };
}

async function loadContentSources(options = {}) {
  if (Array.isArray(options.sources) || options.sourcesPath) {
    return loadSources(options.sources, options.sourcesPath, DEFAULT_CONTENT_SOURCES);
  }

  try {
    const registry = await loadSourceRegistry({
      rootDir: options.rootDir || process.cwd(),
      sourcesPath: options.registryPath || path.join("config", "sources")
    });
    return registry.sources;
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
    return DEFAULT_CONTENT_SOURCES;
  }
}

function normalizePlatformExemptOption(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return PLATFORM_EXEMPT_PLATFORMS.includes(normalized) ? normalized : "";
}

function filterPlatformExemptSources(sources, platform) {
  if (!platform) {
    return sources;
  }
  return sources.filter((source) => {
    const candidateCategory = source.candidate_category || source.candidateCategory;
    const candidatePlatform = source.platform || platformFromCandidateCategory(candidateCategory);
    return candidatePlatform === platform &&
      platformFromCandidateCategory(candidateCategory) === platform;
  });
}

function contentSourceKinds(sourceInfo) {
  if (isPlatformExemptCategory(sourceInfo.candidate_category)) {
    return { sourceCategory: "community", candidateCategory: sourceInfo.candidate_category, entryLabel: "platform signal" };
  }
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

function platformCandidateOrContentCandidate(candidate, entry, sourceInfo, existingCandidates) {
  if (!isPlatformExemptCategory(candidate.category)) {
    return candidate;
  }
  const platformFields = platformEntryToCandidate(entry, sourceInfo, existingCandidates);
  return {
    ...candidate,
    status: "included",
    included_in: sectionForPlatformCategory(candidate.category),
    evidence: summarizeEvidence(entry.summary || entry.description || entry.content || "", `${sourceInfo.name} platform entry was retained as a listener observation.`),
    notes: appendSentence(candidate.notes, `platform_contract_annotation=true; listener_retained=true; rule_id=${sanitizeNoteValue(platformFields.rule_id)}; primary_verification_required=false`),
    ...platformFields,
    verification_sources: []
  };
}

function annotatePlatformEntries(entries, sourceInfo, candidateCategory, annotations) {
  if (!isPlatformExemptCategory(candidateCategory)) {
    return entries;
  }
  for (const entry of entries) {
    const annotation = legacyPlatformSourceAnnotation(entry, sourceInfo);
    if (annotation) {
      annotations[annotation] = (annotations[annotation] || 0) + 1;
    }
  }
  return entries;
}

function appendPlatformAnnotations(notes, annotations = {}) {
  const parts = Object.entries(annotations)
    .filter(([, count]) => count > 0)
    .map(([reason, count]) => `${reason}=${count}`);
  if (parts.length === 0) {
    return notes;
  }
  return appendSentence(notes, `legacy_platform_contract_annotations: ${parts.join(", ")}; listener_retained=true`);
}

function platformAuditSourceExtra(sourceInfo, extra = {}) {
  const generic = {
    id: sourceInfo.id,
    source_kind: sourceInfo.source_kind,
    source_group: sourceInfo.source_group,
    credibility_tag: sourceInfo.credibility_tag,
    ...(typeof sourceInfo.requires_original_url === "boolean" ? { requires_original_url: sourceInfo.requires_original_url } : {})
  };
  if (!isPlatformExemptCategory(sourceInfo.candidate_category)) {
    return {
      ...generic,
      ...extra
    };
  }
  return {
    ...generic,
    platform: sourceInfo.platform || platformFromCandidateCategory(sourceInfo.candidate_category),
    ...extra
  };
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
  if (sourceInfo.category === "intermediary" || isIntermediaryCredibilityTag(sourceInfo.credibility_tag)) {
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
  if (sourceInfo.category === "intermediary" || isIntermediaryCredibilityTag(sourceInfo.credibility_tag)) {
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
    verification_sources: [],
    ...(sourceInfo.source_group ? { source_group: String(sourceInfo.source_group).trim() } : {}),
    ...(sourceInfo.credibility_tag ? { credibility_tag: String(sourceInfo.credibility_tag).trim() } : {})
  };
  if (isIntermediaryCredibilityTag(sourceInfo.credibility_tag)) {
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

function contentCandidateTagFields(entry, sourceInfo) {
  const tags = unique([
    ...(Array.isArray(sourceInfo.content_tags) ? sourceInfo.content_tags : []),
    ...(Array.isArray(entry.content_tags) ? entry.content_tags : [])
  ].map((tag) => String(tag || "").trim()).filter(Boolean));
  return tags.length > 0 ? { content_tags: tags } : {};
}

function contentCandidateSource(entry, sourceInfo) {
  return String(entry.publisher || "").trim() || sourceInfo.name;
}

function contentVerificationStatus(sourceInfo, originalUrl) {
  if (sourceInfo.category === "x_hotspot") {
    return originalUrl ? "original_social_only" : "unverified";
  }
  return {
    primary_material: "primary_confirmed",
    multi_source_material: "multi_source_confirmed",
    single_source_relay: "intermediary_only",
    community_lead: "original_social_only",
    monitoring_lead: "unverified",
    pending_review: "unverified"
  }[String(sourceInfo.credibility_tag || "")] || "unverified";
}

function isIntermediaryCredibilityTag(value) {
  return ["single_source_relay", "monitoring_lead", "pending_review"].includes(String(value || ""));
}

function shouldCrossCheckProductCandidate(sourceInfo, options = {}) {
  if (options.productCrossCheck === false) {
    return false;
  }
  const sourceText = `${sourceInfo.name || ""} ${sourceInfo.signal || ""}`.toLowerCase();
  return sourceInfo.signal === "product_hunt" || sourceText.includes("product hunt") || urlHostMatches(sourceInfo.url, "producthunt.com");
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
        .map((entry) => withObservedEntryDate(entry, reportDate))
        .map(retainEntryWithSafeUrl)
        .filter(Boolean);
      markSource(candidateSources.at(-1), entries.length > 0 ? "checked" : "no_signal", withRetryNote(`${entries.length} recent incidents parsed`, response));

      for (const entry of entries) {
        candidates.push({
          id: uniqueCandidateId(candidates, `${currentSource.id}-${entry.title || entry.url}`),
          ...observationIdentityFields(entry),
          source_id: currentSource.id,
          category: "community_lead",
          title: entry.title ? `${currentSource.name}: ${entry.title}` : "",
          url: entry.url,
          source: currentSource.name,
          event_date: entry.event_date,
          status: "excluded",
          evidence: summarizeEvidence(entry.summary, "Statuspage incident feed entry.")
        });
      }
    } catch (error) {
      markSource(candidateSources.at(-1), "blocked", withRetryNote(formatDiscoveryErrorNote(error), error));
    }
  }

  return {
    sources: candidateSources,
    candidates
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

async function mapWithConcurrency(values, concurrency, worker) {
  const items = Array.isArray(values) ? values : [];
  const results = new Array(items.length);
  let cursor = 0;
  const workerCount = Math.min(positiveInteger(concurrency, 1), Math.max(items.length, 1));
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }));
  return results;
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
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
    const repositoryLanguage = extractGitHubRepositoryLanguage(block);
    const stars = extractTrendingStarCount(block);
    candidates.push({
      repo,
      url: `${GITHUB_BASE_URL}/${repo}`,
      source: sourceInfo.name || "GitHub Trending",
      source_url: sourceInfo.url || "",
      signal: "trending",
      language: sourceInfo.language || "",
      ...(repositoryLanguage ? { repository_language: repositoryLanguage } : {}),
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

function extractGitHubRepositoryLanguage(block) {
  const match = String(block || "").match(
    /<[^>]+\bitemprop=["']programmingLanguage["'][^>]*>([\s\S]*?)<\/[^>]+>/i
  );
  return cleanText(match?.[1] || "");
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

function shouldPreferGithubTrendingCandidate(candidate, existing) {
  return githubTrendingScopePriority(candidate) > githubTrendingScopePriority(existing);
}

function githubTrendingScopePriority(candidate) {
  if (isGithubTrendingWeeklyAllCandidate(candidate)) return 3;
  if (REQUIRED_GITHUB_TRENDING_WEEKLY_LANGUAGES.some((language) => isGithubTrendingWeeklyLanguageCandidate(candidate, language))) return 2;
  if (isGithubTrendingWeeklyCandidate(candidate)) return 1;
  return 0;
}

function isGithubTrendingWeeklyAllCandidate(candidate) {
  const language = String(candidate?.language || "").toLowerCase();
  const text = githubTrendingCandidateScopeText(candidate);
  const languageFilteredSource = /github\.com\/trending\/(?:python|typescript|rust|go|java)\?since=weekly/i.test(text) ||
    /github trending (?:python|typescript|rust|go|java) weekly/i.test(text);
  return isGithubTrendingWeeklyCandidate(candidate) && !languageFilteredSource && (!language || language === "all");
}

function isGithubTrendingWeeklyLanguageCandidate(candidate, language) {
  const normalizedLanguage = String(language || "").toLowerCase();
  const itemLanguage = String(candidate?.language || "").toLowerCase();
  const text = githubTrendingCandidateScopeText(candidate);
  const sourceMatches = text.includes(`github trending ${normalizedLanguage} weekly`) ||
    text.includes(`github-trending-${normalizedLanguage}-weekly`) ||
    text.includes(`github.com/trending/${normalizedLanguage}?since=weekly`);
  return isGithubTrendingWeeklyCandidate(candidate) && (itemLanguage === normalizedLanguage || sourceMatches);
}

function isGithubTrendingWeeklyCandidate(candidate) {
  const text = githubTrendingCandidateScopeText(candidate);
  const window = String(candidate?.window || "").toLowerCase();
  return window === "weekly" || text.includes("github trending weekly") || text.includes("since=weekly");
}

function githubTrendingCandidateScopeText(candidate) {
  return [
    candidate?.source,
    candidate?.source_id,
    candidate?.source_url,
    candidate?.url,
    candidate?.window,
    candidate?.language
  ].map((value) => String(value || "").toLowerCase()).join(" ");
}

function compareGithubTrendingCandidateRank(left, right) {
  return githubTrendingCandidateRank(left) - githubTrendingCandidateRank(right);
}

function githubTrendingCandidateRank(candidate) {
  const rank = Number(candidate?.rank || candidate?.source_rank);
  return Number.isInteger(rank) && rank > 0 ? rank : 999;
}

function githubCandidateRepoKey(candidate) {
  return String(candidate?.repo || normalizeRepo(candidate?.url || "") || candidate?.title || "").toLowerCase();
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
    readmeCache: new Map(),
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
  const readmeCache = new Map();
  const dates = new Set();
  const repos = new Set();

  for (const record of records) {
    if (!isPreviousDateWithinWindow(record.date, reportDate, lookbackDays)) {
      continue;
    }
    for (const cacheEntry of extractGitHubReadmeCacheEntries(record.payload)) {
      const existing = readmeCache.get(cacheEntry.key);
      if (!existing || record.date > existing.date) {
        readmeCache.set(cacheEntry.key, { ...cacheEntry, date: record.date });
      }
    }
    const entries = extractGitHubTrendingHistoryEntries(record.payload, record.date);
    if (entries.length === 0) {
      continue;
    }
    dates.add(record.date);
    for (const entry of entries) {
      if (!entry.source_scope) {
        continue;
      }
      const repoKey = entry.repo.toLowerCase();
      const key = `${repoKey}|${entry.source_scope}`;
      const existing = byRepo.get(key) || {
        repo: entry.repo,
        source_scope: entry.source_scope,
        dates: new Set(),
        ranks: new Map(),
        sources: new Set()
      };
      repos.add(repoKey);
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
    readmeCache,
    dates: [...dates].sort(),
    repoCount: repos.size,
    errors
  };
}

async function loadGitHubTrendingHistoryRecordsFromRoot(historyRoot, reportDate, lookbackDays, errors) {
  const records = [];
  for (const date of previousDateStrings(reportDate, lookbackDays)) {
    const [year, month] = date.split("-");
    const candidatePaths = candidatePoolRelativePaths(date).map((relativePath) =>
      path.join(historyRoot, ...relativePath.split(path.sep))
    );
    const reportPath = path.join(historyRoot, year, month, `${date}.json`);
    for (const filePath of [...candidatePaths, reportPath]) {
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

function extractGitHubReadmeCacheEntries(payload) {
  const entries = [];
  const items = [
    ...(Array.isArray(payload?.github_trending) ? payload.github_trending : []),
    ...(Array.isArray(payload?.candidates) ? payload.candidates : []),
    ...(Array.isArray(payload?.projects) ? payload.projects : [])
  ];
  for (const item of items) {
    const cache = item?.readme_cache;
    const key = String(cache?.key || "").trim();
    const sha = String(cache?.sha || "").trim().toLowerCase();
    const summary = String(item?.readme_summary || item?.description || "").trim();
    if (!key || !/^[a-f0-9]{64}$/.test(sha) || !summary || !key.endsWith(`/${sha}`)) {
      continue;
    }
    entries.push({ key, sha, summary });
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
    rank: Number.isInteger(item.source_rank) && item.source_rank > 0
      ? item.source_rank
      : null,
    source: item.source || sourceItem?.name || "",
    source_scope: githubTrendingHistorySourceScope(item, sourceItem)
  });
}

function githubTrendingHistorySourceScope(item = {}, sourceItem = null) {
  const explicit = String(item.source_scope || "").trim().toLowerCase();
  if (/^(?:daily|weekly|past_24_hours):[a-z0-9+#._-]+$/.test(explicit)) {
    return explicit;
  }

  const text = [
    item.source,
    item.source_id,
    item.source_url,
    sourceItem?.name,
    sourceItem?.id,
    sourceItem?.url
  ].filter(Boolean).join(" ").toLowerCase();
  const isGithubTrending = /github[ _-]?trending|github\.com\/trending|ossinsight/.test(text);
  if (!isGithubTrending) {
    return "";
  }

  const window = /past[_ -]?24[_ -]?hours|period=past_24_hours/.test(text)
    ? "past_24_hours"
    : /weekly|since=weekly/.test(text)
      ? "weekly"
      : /daily|since=daily/.test(text)
        ? "daily"
        : ["daily", "weekly", "past_24_hours"].includes(String(item.window || "").toLowerCase())
          ? String(item.window).toLowerCase()
          : "";
  const pathLanguage = text.match(/github\.com\/trending\/([^?\s/]+)/)?.[1] || "";
  const namedLanguage = text.match(/github[ _-]?trending[ _-]+(python|typescript|javascript|go|rust|java|c\+\+|c#|php|ruby|swift|kotlin|scala)(?:[ _-]+|$)/)?.[1] || "";
  const sourceIsAll = /github[ _-]?trending(?:[ _-]+(?:daily|weekly))?(?:\s|$)|github\.com\/trending(?:\?|\s|$)|ossinsight/.test(text);
  const fallbackLanguage = String(item.language || "").trim().toLowerCase();
  const language = pathLanguage || namedLanguage || (sourceIsAll ? "all" : fallbackLanguage);
  return window && language ? `${window}:${language}` : "";
}

function annotateGitHubTrendingCandidates(candidates, history) {
  if (!history.checked) {
    return candidates.map((candidate) => applyGitHubTrendMovement(candidate, null));
  }
  return candidates.map((candidate) => {
    const repoKey = (candidate.repo || repoFromHistoryItem(candidate)).toLowerCase();
    const sourceScope = githubTrendingHistorySourceScope(candidate);
    if (!repoKey || !sourceScope) {
      return applyGitHubTrendMovement(candidate, null);
    }
    const key = `${repoKey}|${sourceScope}`;
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
  const sourceGroup = String(sourceItem.source_group || sourceItem.public_source_group || "").trim();
  return {
    id: sourceItem.id,
    name: sourceItem.name,
    url: sourceItem.url,
    category,
    status,
    checked_at: checkedAt,
    notes,
    ...(sourceGroup ? { source_group: sourceGroup } : {}),
    ...(sourceItem.credibility_tag ? { credibility_tag: String(sourceItem.credibility_tag).trim() } : {}),
    ...(Array.isArray(sourceItem.content_tags) ? { content_tags: unique(sourceItem.content_tags.map((tag) => String(tag || "").trim()).filter(Boolean)) } : {}),
    ...(sourceItem.platform ? { platform: sourceItem.platform } : {}),
    ...(sourceItem.rule_id || sourceItem.id ? { rule_id: sourceItem.rule_id || sourceItem.id } : {}),
    ...(isPlatformExemptCategory(sourceItem.candidate_category) ? {
      source_level: "platform_exempt_signal",
      verification_status: "platform_exempt_unverified"
    } : {})
  };
}

function markSource(sourceItem, status, notes) {
  sourceItem.status = status;
  sourceItem.notes = notes;
}

function auditSource(name, url, status, notes, extra = {}) {
  const source = { name, url, status, notes, ...extra };
  return { ...source, ...transportCompletenessTags(source) };
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
  return candidates.some((candidate) => {
    if (isXStatusUrl(candidate.url) || isXStatusUrl(candidate.original_url)) {
      return true;
    }
    const tags = Array.isArray(candidate.tags) ? candidate.tags : [];
    return candidate.category === "builder_observation" &&
      tags.includes("original_url_missing") &&
      (candidate.source_id === "follow-builders-x" || candidate.source_id === "x-builder-search-tavily");
  });
}

function xObservationLinks(rawUrl, providerUrl) {
  const originalUrl = normalizeXStatusUrl(rawUrl);
  if (originalUrl) {
    return {
      url: originalUrl,
      original_url: originalUrl,
      verification_status: "original_social_only",
      verification_sources: [originalUrl],
      notes: ""
    };
  }

  const intermediaryUrl = sanitizePublicHttpUrl(rawUrl) || sanitizePublicHttpUrl(providerUrl);
  return {
    url: intermediaryUrl,
    ...(intermediaryUrl ? { intermediary_url: intermediaryUrl } : {}),
    verification_status: "unverified",
    verification_sources: [],
    tags: ["original_url_missing", "unverified", "indirect"],
    notes: `original_url_missing=true; verification=unverified; access=indirect; safe_public_url=${intermediaryUrl ? "retained" : "missing"}`
  };
}

function xObservationId(sourceId, links, eventDate, ...identityParts) {
  const identity = [
    sourceId,
    links.original_url || links.intermediary_url || links.url || "no_safe_public_url",
    eventDate,
    ...identityParts
  ].join("|");
  return `x_observation:${createHash("sha256").update(identity).digest("hex").slice(0, 24)}`;
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
    return normalizeXHandle(handle);
  } catch {
    return "";
  }
}

function normalizeXHandle(value) {
  const handle = String(value || "").trim().replace(/^@/, "");
  return /^[A-Za-z0-9_]{1,32}$/.test(handle) ? handle : "";
}

// Curated first-party X handles: the canonical allowlist of builders/researchers
// whose posts should be prioritized as first-party signal. X has no free API, so
// this does not by itself ingest feed-less handles; it tags builder candidates
// that already surfaced (via follow-builders or builder search) so selection can
// prioritize them. A handle may carry an optional feed_url for future ingestion.
export async function loadCuratedXHandles(options = {}) {
  if (Array.isArray(options.curatedXHandles)) {
    return curatedHandleSet(options.curatedXHandles);
  }
  const rootDir = options.rootDir || process.cwd();
  const configPath = path.resolve(rootDir, options.curatedXHandlesPath || "config/curated-x-handles.json");
  try {
    const parsed = JSON.parse(await fs.readFile(configPath, "utf8"));
    return curatedHandleSet(parsed?.handles || []);
  } catch {
    return new Set();
  }
}

function curatedHandleSet(handles) {
  const set = new Set();
  for (const entry of Array.isArray(handles) ? handles : []) {
    const normalized = normalizeXHandle(typeof entry === "string" ? entry : entry?.handle);
    if (normalized) {
      set.add(normalized.toLowerCase());
    }
  }
  return set;
}

function candidateXHandle(candidate) {
  return (
    normalizeXHandle(candidate?.handle) ||
    xStatusHandle(candidate?.original_url || candidate?.url || "") ||
    normalizeXHandle(String(candidate?.author || "").replace(/^@/, ""))
  );
}

export function markCuratedXHandles(candidates, handleSet) {
  if (!(handleSet instanceof Set) || handleSet.size === 0) {
    return Array.isArray(candidates) ? candidates : [];
  }
  return (Array.isArray(candidates) ? candidates : []).map((candidate) => {
    if (!candidate || candidate.category !== "builder_observation") {
      return candidate;
    }
    const handle = candidateXHandle(candidate);
    if (handle && handleSet.has(handle.toLowerCase())) {
      return { ...candidate, curated_first_party: true };
    }
    return candidate;
  });
}

function builderAvatarUrl(builder, handle) {
  const explicit = [
    builder?.avatar_url,
    builder?.avatarUrl,
    builder?.profile_image_url,
    builder?.profileImageUrl,
    builder?.profileImage,
    builder?.avatar,
    builder?.image,
    builder?.photo
  ].find(Boolean);
  const url = normalizeHttpUrl(explicit);
  return url || xAvatarUrl(handle);
}

function xAvatarUrl(handle) {
  const normalized = normalizeXHandle(handle);
  return normalized ? `https://unavatar.io/x/${encodeURIComponent(normalized)}` : "";
}

function normalizeHttpUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
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

function parseFeedEntries(xml) {
  const entryBlocks = matchXmlBlocks(xml, "entry");
  if (entryBlocks.length > 0) {
    return entryBlocks.map(parseAtomEntry);
  }
  return matchXmlBlocks(xml, "item").map(parseRssItem);
}

function parseContentSourceEntries(content, sourceInfo) {
  if (sourceInfo.source_kind === DATED_CHANGELOG_SOURCE_KIND) {
    return parseDatedChangelogEntries(content, sourceInfo);
  }
  if (sourceInfo.format === "html_index") {
    return parseHtmlIndexEntries(content, sourceInfo);
  }
  if (sourceInfo.source_kind === GITHUB_REPORT_MARKDOWN_SOURCE_KIND) {
    return parseGitHubReportMarkdownEntries(content, sourceInfo);
  }
  if (sourceInfo.source_kind === HUGGINGFACE_DAILY_PAPERS_API_SOURCE_KIND && looksLikeJson(content)) {
    return parseHuggingFaceDailyPapersEntries(content, sourceInfo);
  }
  if (sourceInfo.source_kind === HUGGINGFACE_HUB_TRENDING_API_SOURCE_KIND && looksLikeJson(content)) {
    return parseHuggingFaceHubTrendingEntries(content, sourceInfo);
  }
  if (sourceInfo.source_kind === "search_api" && looksLikeJson(content)) {
    return parseJsonSearchApiEntries(content, sourceInfo);
  }
  return parseFeedEntries(content);
}

function parseDatedChangelogEntries(content, sourceInfo = {}) {
  const value = String(content || "");
  const entries = /<\/?[a-z][\s\S]*>/i.test(value)
    ? parseHtmlDatedChangelogEntries(value, sourceInfo)
    : parseMarkdownDatedChangelogEntries(value, sourceInfo);
  if (entries.length > 0) {
    return entries;
  }
  const summary = cleanText(value).slice(0, 240);
  return summary ? [{
    title: `${sourceInfo.name || "Changelog"} update`,
    url: sourceInfo.url,
    event_date: "",
    summary
  }] : [];
}

function parseMarkdownDatedChangelogEntries(markdown, sourceInfo = {}) {
  const headings = [...String(markdown || "").matchAll(/^(#{2,4})\s+(.+?)\s*$/gm)].map((match) => ({
    index: match.index,
    end: match.index + match[0].length,
    level: match[1].length,
    text: cleanText(match[2])
  }));
  const dated = headings.filter((heading) => dateOnly(heading.text));
  return dated.map((heading, index) => {
    const next = dated[index + 1];
    const section = String(markdown || "").slice(heading.end, next?.index ?? String(markdown || "").length);
    const innerHeading = headings.find((candidate) => candidate.index >= heading.end && candidate.index < (next?.index ?? Infinity));
    const link = markdownLinks(section).find((item) => !item.image)?.url || markdownLinks(section).find((item) => !item.image)?.href || "";
    const title = innerHeading?.text || `${sourceInfo.name || "Changelog"} · ${heading.text}`;
    return {
      title,
      url: absoluteUrl(link, sourceInfo.url) || `${String(sourceInfo.url || "").replace(/#.*$/, "")}#${slugId(title)}`,
      event_date: dateOnly(heading.text),
      summary: cleanText(section.replace(/^#{2,4}\s+.+$/gm, " ")).slice(0, 240)
    };
  }).filter((entry) => entry.title && entry.url && entry.event_date);
}

function parseHtmlDatedChangelogEntries(html, sourceInfo = {}) {
  const headings = [...String(html || "").matchAll(/<h([2-4])\b([^>]*)>([\s\S]*?)<\/h\1>/gi)].map((match) => ({
    index: match.index,
    end: match.index + match[0].length,
    level: Number(match[1]),
    id: extractAttribute(match[2], "id"),
    text: cleanText(match[3])
  }));
  const dated = headings.filter((heading) => dateOnly(heading.text));
  return dated.map((heading, index) => {
    const next = dated[index + 1];
    const section = String(html || "").slice(heading.end, next?.index ?? String(html || "").length);
    const innerHeading = headings.find((candidate) => candidate.index >= heading.end && candidate.index < (next?.index ?? Infinity));
    const sectionLink = extractHtmlLinks(section, sourceInfo.url)[0] || "";
    const title = innerHeading?.text || `${sourceInfo.name || "Changelog"} · ${heading.text}`;
    return {
      title,
      url: sectionLink || `${String(sourceInfo.url || "").replace(/#.*$/, "")}#${heading.id || slugId(title)}`,
      event_date: dateOnly(heading.text),
      summary: cleanText(section).slice(0, 240)
    };
  }).filter((entry) => entry.title && entry.url && entry.event_date);
}

function parseHuggingFaceHubTrendingEntries(content, sourceInfo = {}) {
  let payload;
  try {
    payload = JSON.parse(content);
  } catch {
    return [];
  }
  const rows = Array.isArray(payload) ? payload : arrayFromPossibleKeys(payload, ["results", "data", "items", "models", "spaces", "datasets"]);
  const artifactType = huggingFaceArtifactType(sourceInfo.url);
  return rows.map((item) => {
    const id = cleanText(firstString(item?.id, item?.modelId, item?.name));
    if (!id) return null;
    const tags = Array.isArray(item.tags) ? item.tags.map(cleanText).filter(Boolean) : [];
    const score = Number.isFinite(Number(item.trendingScore)) ? Number(item.trendingScore) : null;
    const likes = Number.isFinite(Number(item.likes)) ? Number(item.likes) : null;
    const downloads = Number.isFinite(Number(item.downloads)) ? Number(item.downloads) : null;
    const metrics = [
      score === null ? "" : `trending score ${score}`,
      likes === null ? "" : `${likes} likes`,
      downloads === null ? "" : `${downloads} downloads`
    ].filter(Boolean);
    return {
      observation_id: `huggingface:${artifactType}:${id}`,
      title: id,
      url: huggingFaceArtifactUrl(id, artifactType),
      event_date: jsonDateOnly(firstString(item.createdAt, item.created_at, item.lastModified, item.last_modified)),
      summary: `${id} appeared in Hugging Face ${artifactType} trending${metrics.length ? ` with ${metrics.join(", ")}` : ""}.`,
      publisher: id.split("/")[0] || "Hugging Face",
      tags,
      content_tags: artifactType === "models" ? ["model_release"] : artifactType === "datasets" ? ["research"] : ["product_update"]
    };
  }).filter(Boolean);
}

function huggingFaceArtifactType(value) {
  const match = String(value || "").match(/\/api\/(models|spaces|datasets)\b/i);
  return match?.[1]?.toLowerCase() || "models";
}

function huggingFaceArtifactUrl(id, artifactType) {
  const encodedPath = String(id || "").split("/").map(encodeURIComponent).join("/");
  if (artifactType === "spaces") return `https://huggingface.co/spaces/${encodedPath}`;
  if (artifactType === "datasets") return `https://huggingface.co/datasets/${encodedPath}`;
  return `https://huggingface.co/${encodedPath}`;
}

async function collectGitHubReportMarkdownSource({ sourceInfo, fetchImpl, reportDate, generatedAt, options = {} }) {
  const indexResponse = await fetchImpl(contentSourceRequestUrl(sourceInfo, options.env || process.env), {
    headers: {
      accept: "text/markdown, text/plain, text/html, */*",
      "user-agent": "ai-daily-cn-static-publisher"
    },
    ...timeoutInit(sourceInfo.timeoutMs || sourceInfo.timeout_ms || 15000)
  });
  if (!indexResponse.ok) {
    return {
      status: "blocked",
      notes: withRetryNote(`HTTP ${indexResponse.status}`, indexResponse),
      entries: []
    };
  }

  const indexMarkdown = await indexResponse.text();
  const latest = latestGitHubReportLink(indexMarkdown, sourceInfo);
  let reportMarkdown = indexMarkdown;
  let reportUrl = sourceInfo.url;
  let reportTitle = sourceInfo.name;
  let reportResponse = indexResponse;
  if (latest.url) {
    reportUrl = latest.url;
    reportTitle = latest.title || sourceInfo.name;
  }
  if (latest.url && urlWithoutHash(latest.url) !== urlWithoutHash(sourceInfo.url)) {
    reportResponse = await fetchImpl(reportUrl, {
      headers: {
        accept: "text/markdown, text/plain, text/html, */*",
        "user-agent": "ai-daily-cn-static-publisher"
      },
      ...timeoutInit(sourceInfo.timeoutMs || sourceInfo.timeout_ms || 15000)
    });
    if (!reportResponse.ok) {
      return {
        status: "blocked",
        notes: withRetryNote(`latest_report_fetch_failed; HTTP ${reportResponse.status}; latest_report_url=${sanitizeNoteValue(reportUrl)}`, reportResponse),
        entries: []
      };
    }
    reportMarkdown = await reportResponse.text();
  }

  const sectionMarkdown = latest.hash
    ? markdownSectionForGitHubAnchor(reportMarkdown, latest.hash) || reportMarkdown
    : reportMarkdown;
  const entries = parseGitHubReportMarkdownEntries(sectionMarkdown, {
    ...sourceInfo,
    url: reportUrl,
    report_url: reportUrl,
    report_title: reportTitle,
    fallback_event_date: githubReportEventDate(reportTitle, reportDate),
    generated_at: generatedAt
  });
  const status = entries.length > 0 ? "checked" : "no_signal";
  return {
    status,
    notes: withRetryNote(`${entries.length} report entries parsed; latest_report_url=${sanitizeNoteValue(reportUrl)}; report_title=${sanitizeNoteValue(reportTitle)}`, reportResponse),
    entries
  };
}

function latestGitHubReportLink(markdown, sourceInfo = {}) {
  const pattern = sourceInfo.latest_report_link_pattern
    ? new RegExp(sourceInfo.latest_report_link_pattern, "i")
    : /\.md(?:#[-\w]+)?$/i;
  for (const link of markdownLinks(markdown)) {
    if (!link.href || link.image || !pattern.test(link.href)) {
      continue;
    }
    const url = resolveGitHubMarkdownUrl(link.href, sourceInfo.url);
    if (url) {
      return { ...link, url, hash: new URL(url).hash.replace(/^#/, "") };
    }
  }
  return { title: sourceInfo.name || "", url: sourceInfo.url || "", hash: "" };
}

function resolveGitHubMarkdownUrl(href, baseUrl) {
  const rawHref = String(href || "").trim();
  if (!rawHref || /^(?:mailto|javascript):/i.test(rawHref)) {
    return "";
  }
  try {
    const base = new URL(baseUrl);
    if (rawHref.startsWith("#")) {
      base.hash = rawHref;
      return base.toString();
    }
    if (base.hostname === "raw.githubusercontent.com") {
      const resolved = rawHref.startsWith("/")
        ? rawGitHubRootRelativeUrl(rawHref, base)
        : new URL(rawHref, base).toString();
      return resolved || "";
    }
    const url = new URL(rawHref, base);
    if (url.hostname === "github.com" && /\/blob\//.test(url.pathname)) {
      const [, owner, repo, , ref, ...parts] = url.pathname.split("/");
      return `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${parts.join("/")}${url.hash}`;
    }
    return url.toString();
  } catch {
    return "";
  }
}

function urlWithoutHash(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString();
  } catch {
    return String(value || "").replace(/#.*$/, "");
  }
}

function markdownLinks(markdown) {
  const links = [];
  const pattern = /(!)?\[([^\]]{0,220})\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  for (const match of String(markdown || "").matchAll(pattern)) {
    links.push({
      image: Boolean(match[1]),
      title: cleanText(match[2]),
      href: decodeXml(match[3]),
      index: match.index || 0
    });
  }
  return links;
}

export function parseGitHubReportMarkdownEntries(markdown, sourceInfo = {}) {
  const reportUrl = sourceInfo.report_url || sourceInfo.url || "";
  const eventDate = sourceInfo.fallback_event_date || dateOnly(sourceInfo.generated_at) || "";
  const entries = [];
  const seenParserPositions = new Set();
  const text = String(markdown || "");

  const tableRowPattern = /(?:^|\n)\s*\|\s*\d+\)\s+\*\*([^*]{2,180})\*\*\s*[-:：]?\s*([\s\S]*?)\|\s*([\s\S]*?)\s*\|/g;
  for (const match of text.matchAll(tableRowPattern)) {
    const link = markdownLinks(match[3]).find((candidate) => !candidate.image);
    if (!link) {
      continue;
    }
    addMarkdownReportEntry(entries, seenParserPositions, {
      title: match[1],
      href: link.href,
      summary: match[2],
      markdown: text,
      index: match.index || 0,
      sourceInfo,
      reportUrl,
      eventDate
    });
  }

  const numberedPattern = /(?:^|\n)\s*\d+[、.)]\s*\[([^\]]{2,160})\]\(([^)\s]+)(?:\s+"[^"]*")?\)\s*[：:，,-]?\s*([^\n]{0,360})/g;
  for (const match of text.matchAll(numberedPattern)) {
    addMarkdownReportEntry(entries, seenParserPositions, {
      title: match[1],
      href: match[2],
      summary: match[3],
      markdown: text,
      index: match.index || 0,
      sourceInfo,
      reportUrl,
      eventDate
    });
  }

  const bulletPattern = /(?:^|\n)\s*[-*]\s+\[([^\]]{2,180})\]\(([^)\s]+)(?:\s+"[^"]*")?\)\s*[：:，,-]?\s*([^\n]{0,360})/g;
  for (const match of text.matchAll(bulletPattern)) {
    addMarkdownReportEntry(entries, seenParserPositions, {
      title: match[1],
      href: match[2],
      summary: match[3],
      markdown: text,
      index: match.index || 0,
      sourceInfo,
      reportUrl,
      eventDate
    });
  }

  for (const link of markdownLinks(text)) {
    addMarkdownReportEntry(entries, seenParserPositions, {
      title: link.title,
      href: link.href,
      summary: markdownLineAround(text, link.index),
      markdown: text,
      index: link.index,
      sourceInfo,
      reportUrl,
      eventDate,
      image: link.image
    });
  }

  return entries;
}

function addMarkdownReportEntry(entries, seenParserPositions, { title, href, summary, markdown, index, sourceInfo, reportUrl, eventDate, image }) {
  const url = resolveGitHubReportEntryUrl(href, reportUrl || sourceInfo.url);
  if (!isUsefulReportEntryUrl(url, sourceInfo) || image) {
    return;
  }
  const cleanedTitle = cleanText(title);
  const rowText = markdownLineAround(markdown, index);
  const parserPosition = `${markdownLineStart(markdown, index)}|${url}`;
  if (seenParserPositions.has(parserPosition)) {
    return;
  }
  seenParserPositions.add(parserPosition);
  const localSummary = cleanText(summary) || rowText;
  const rowFingerprint = stableRowFingerprint("github-report-row", [
    sourceInfo.id || sourceInfo.url,
    reportUrl || sourceInfo.url,
    url,
    cleanedTitle,
    localSummary
  ]);
  entries.push({
    observation_id: rowFingerprint,
    title: cleanedTitle,
    url,
    event_date: eventDate,
    summary: appendSentence(
      localSummary,
      `${sourceInfo.name || "GitHub report"} latest report listed this entry; use it as a discovery lead and verify with the original source before factual inclusion.`
    ),
    source_report_url: reportUrl || sourceInfo.url,
    source_report_title: sourceInfo.report_title || sourceInfo.name || ""
  });
}

function resolveGitHubReportEntryUrl(href, baseUrl) {
  const rawHref = String(href || "").trim();
  if (!rawHref || rawHref.startsWith("#") || /^(?:mailto|javascript):/i.test(rawHref)) {
    return "";
  }
  try {
    const url = new URL(rawHref, baseUrl);
    if (url.hostname === "github.com" && /\/blob\//.test(url.pathname)) {
      const [, owner, repo, , ref, ...parts] = url.pathname.split("/");
      return `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${parts.join("/")}${url.hash}`;
    }
    return url.toString();
  } catch {
    return "";
  }
}

function rawGitHubRootRelativeUrl(href, base) {
  const parts = base.pathname.split("/").filter(Boolean);
  if (parts.length < 3) {
    return "";
  }
  const [owner, repo, ref] = parts;
  return `https://raw.githubusercontent.com/${owner}/${repo}/${ref}${href}`;
}

function isUsefulReportEntryUrl(url, sourceInfo = {}) {
  return Boolean(sanitizePublicHttpUrl(url)) && !looksLikeImageUrl(url);
}

function markdownLineAround(markdown, index) {
  const text = String(markdown || "");
  const start = markdownLineStart(text, index);
  const end = text.indexOf("\n", index);
  return cleanText(text.slice(start, end >= 0 ? end : text.length)).slice(0, 360);
}

function markdownLineStart(markdown, index) {
  const text = String(markdown || "");
  const offset = Math.max(0, Number(index || 0));
  if (text[offset] === "\n") return offset + 1;
  return text.lastIndexOf("\n", Math.max(0, offset - 1)) + 1;
}

function markdownSectionForGitHubAnchor(markdown, hash) {
  const target = normalizedGitHubAnchorHash(hash);
  if (!target) {
    return "";
  }
  const headingPattern = /^(#{1,6})\s+(.+)$/gm;
  const headings = [...String(markdown || "").matchAll(headingPattern)];
  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    const headingAnchor = githubMarkdownAnchor(heading[2]);
    if (headingAnchor !== target && relaxedGitHubAnchor(headingAnchor) !== relaxedGitHubAnchor(target)) {
      continue;
    }
    const level = heading[1].length;
    const start = heading.index || 0;
    const next = headings.slice(index + 1).find((candidate) => candidate[1].length <= level);
    return String(markdown || "").slice(start, next?.index || undefined);
  }
  return "";
}

function normalizedGitHubAnchorHash(hash) {
  const raw = String(hash || "").replace(/^#/, "");
  if (!raw) {
    return "";
  }
  try {
    return githubMarkdownAnchor(decodeURIComponent(raw));
  } catch {
    return githubMarkdownAnchor(raw);
  }
}

function relaxedGitHubAnchor(value) {
  return String(value || "").replace(/[^a-z0-9]+/gi, "").toLowerCase();
}

function githubMarkdownAnchor(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}

function githubReportEventDate(title, reportDate) {
  const fromEnglish = latestEnglishMonthDate(title, reportDate);
  return fromEnglish || reportDate;
}

function latestEnglishMonthDate(value, reportDate) {
  const matches = [...String(value || "").matchAll(/\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+(\d{1,2})\b/gi)];
  const last = matches.at(-1);
  if (!last) {
    return "";
  }
  const month = monthNumber(last[1]);
  if (!month) {
    return "";
  }
  const day = last[2].padStart(2, "0");
  const reportYear = String(reportDate || "").slice(0, 4) || String(new Date().getUTCFullYear());
  return `${reportYear}-${month}-${day}`;
}

async function collectOpenRouterRankingsSource(sourceInfo, options = {}) {
  try {
    if (
      typeof options.openrouterRankingsText !== "string" &&
      typeof options.openrouterRankingsTextFetcher !== "function" &&
      Object.hasOwn(options, "fetchImpl") &&
      options.openrouterRankingsLive !== true
    ) {
      throw new Error("browser_snapshot_disabled_for_mock_fetch");
    }
    const pageSnapshot = typeof options.openrouterRankingsText === "string"
      ? {
          text: options.openrouterRankingsText,
          official_component_snapshot: buildOfficialComponentSnapshotFromOption(options.openrouterOfficialComponentSnapshot, sourceInfo, {
            componentKind: "openrouter_rankings",
            selectorVersion: "openrouter-rankings-v1",
            capturedAt: options.generatedAt
          }),
          evidence_assets: Array.isArray(options.openrouterRankingsEvidenceAssets) ? options.openrouterRankingsEvidenceAssets : []
        }
      : typeof options.openrouterRankingsTextFetcher === "function"
        ? {
            text: await options.openrouterRankingsTextFetcher(sourceInfo),
            official_component_snapshot: buildOfficialComponentSnapshotFromOption(options.openrouterOfficialComponentSnapshot, sourceInfo, {
              componentKind: "openrouter_rankings",
              selectorVersion: "openrouter-rankings-v1",
              capturedAt: options.generatedAt
            }),
            evidence_assets: Array.isArray(options.openrouterRankingsEvidenceAssets) ? options.openrouterRankingsEvidenceAssets : []
          }
        : await readOpenRouterRankingsPageSnapshot(sourceInfo, options);
    const text = pageSnapshot.text;
    const pageData = parseOpenRouterRankingsPageText(text);
    const snapshot = openRouterRankingsSnapshot(pageData.entries, sourceInfo, options.generatedAt, {
      historyEntries: pageData.historyEntries,
      officialComponentSnapshot: pageSnapshot.official_component_snapshot
    });
    const complete = snapshot.snapshot_status === "complete";
    return {
      status: complete ? "checked" : "no_signal",
      notes: complete
        ? `public_page_snapshot; ${snapshot.top_entries.length} top models parsed; collection_method=playwright_dom`
        : `public_page_snapshot; ${snapshot.top_entries.length} top models parsed; top10_incomplete`,
      snapshot,
      evidence_assets: pageSnapshot.evidence_assets || []
    };
  } catch (error) {
    return {
      status: "blocked",
      notes: withRetryNote(formatDiscoveryErrorNote(error), error),
      snapshot: {
        type: "openrouter_rankings_public_page",
        collection_method: "public_page_playwright",
        snapshot_status: "blocked",
        snapshot_as_of: options.generatedAt || new Date().toISOString(),
        source_url: sourceInfo.url,
        top_entries: [],
        notes: sanitizeNoteValue(error?.message || error)
      },
      evidence_assets: []
    };
  }
}

async function readOpenRouterRankingsPageSnapshot(sourceInfo, options = {}) {
  const { chromium } = await import("@playwright/test");
  const timeoutMs = Number.isInteger(sourceInfo.timeoutMs) && sourceInfo.timeoutMs > 0
    ? sourceInfo.timeoutMs
    : Number.isInteger(sourceInfo.timeout_ms) && sourceInfo.timeout_ms > 0
      ? sourceInfo.timeout_ms
      : 30000;
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(sourceInfo.url, { waitUntil: "networkidle", timeout: timeoutMs });
    await page.waitForTimeout(Math.min(2000, Math.max(500, Math.floor(timeoutMs / 10))));
    const text = await page.locator("body").innerText({ timeout: Math.min(10000, timeoutMs) });
    const official_component_snapshot = await captureOfficialComponentSnapshot(page, sourceInfo, {
      componentKind: "openrouter_rankings",
      selectorVersion: "openrouter-rankings-v1",
      capturedAt: options.generatedAt,
      selectors: [
        "main [data-openrouter-rankings]",
        "[data-openrouter-rankings]",
        "[class*='ranking'] table",
        "[class*='leaderboard'] table"
      ]
    });
    const evidence_assets = await captureDailyTrackingPageEvidence({
      page,
      sourceInfo,
      rootDir: options.rootDir || process.cwd(),
      outDir: options.evidenceOutDir || options.outDir || "docs",
      reportDate: options.reportDate,
      maxScreenshots: 5
    });
    return { text, official_component_snapshot, evidence_assets };
  } finally {
    await browser.close();
  }
}

export function parseOpenRouterRankingsText(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => cleanText(line))
    .filter(Boolean);
  const start = lines.indexOf("This Week");
  const end = start >= 0 ? lines.indexOf("Show more", start) : -1;
  const rankingLines = start >= 0 && end > start ? lines.slice(start + 1, end) : lines;
  const entries = [];

  for (let index = 0; index < rankingLines.length; index += 1) {
    const rankMatch = rankingLines[index].match(/^(\d+)\.$/);
    if (!rankMatch) {
      continue;
    }
    const rank = Number(rankMatch[1]);
    const model = rankingLines[index + 1];
    const byLabel = rankingLines[index + 2];
    const provider = rankingLines[index + 3];
    const tokens = rankingLines[index + 4];
    const change = rankingLines[index + 5];
    if (!rank || !model || byLabel !== "by" || !provider || !/tokens$/i.test(tokens || "") || !change) {
      continue;
    }
    entries.push({
      rank,
      model,
      provider,
      tokens,
      change
    });
    index += 5;
  }

  return entries;
}

export function parseOpenRouterRankingsPageText(text) {
  const entries = parseOpenRouterRankingsText(text);
  return {
    entries,
    historyEntries: parseOpenRouterHistoryEntries(text, entries)
  };
}

function parseOpenRouterHistoryEntries(text, topEntries = []) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => cleanText(line))
    .filter(Boolean);
  const start = lines.findIndex((line) => /top models history|weekly usage history|usage history/i.test(line));
  if (start < 0) {
    return [];
  }
  const end = lines.findIndex((line, index) => index > start && /llm leaderboard|market share|tool calls|images|audio input|show more/i.test(line));
  const section = lines.slice(start + 1, end > start ? end : undefined);
  const providerByModel = new Map(topEntries.map((entry) => [normalizeModelKey(entry.model), entry.provider || ""]));
  const rows = [];
  let week = "";
  let rankForWeek = 0;

  for (let index = 0; index < section.length; index += 1) {
    const line = section[index];
    if (/^\d{4}-\d{2}-\d{2}$/.test(line)) {
      week = line;
      rankForWeek = 0;
      continue;
    }
    if (!week || !line || /^(week|date|model|tokens|usage)$/i.test(line)) {
      continue;
    }
    const next = section[index + 1];
    if (!/tokens$/i.test(next || "")) {
      continue;
    }
    rankForWeek += 1;
    rows.push({
      week,
      rank: rankForWeek,
      model: line,
      provider: providerByModel.get(normalizeModelKey(line)) || "",
      tokens: next,
      change: week
    });
    index += 1;
  }

  return rows;
}

function openRouterRankingsSnapshot(entries, sourceInfo, generatedAt, extras = {}) {
  const topEntries = entries.map((entry) => ({
    rank: entry.rank,
    model: entry.model,
    provider: entry.provider,
    tokens: entry.tokens,
    change: entry.change
  }));
  const historyEntries = Array.isArray(extras.historyEntries)
    ? extras.historyEntries
      .filter((entry) => entry?.week && entry?.model && entry?.tokens)
      .map((entry) => ({
        week: entry.week,
        rank: Number(entry.rank) || 1,
        model: entry.model,
        provider: entry.provider || "",
        tokens: entry.tokens,
        change: entry.change || entry.week
      }))
    : [];
  const officialComponentSnapshot = extras.officialComponentSnapshot ||
    (hasCompleteTop10(topEntries) ? openRouterOfficialComponentSnapshot(topEntries, sourceInfo, generatedAt) : null);
  return {
    type: "openrouter_rankings_public_page",
    collection_method: "public_page_playwright",
    snapshot_status: hasCompleteTop10(topEntries) ? "complete" : "partial",
    snapshot_as_of: generatedAt || new Date().toISOString(),
    source_url: sourceInfo.url,
    top_entries: topEntries,
    ...(historyEntries.length > 0 ? { history_entries: historyEntries } : {}),
    ...(officialComponentSnapshot ? { official_component_snapshot: officialComponentSnapshot } : {}),
    notes: "Public OpenRouter rankings page snapshot; use as platform usage signal, not market share or capability proof."
  };
}

function hasCompleteTop10(entries) {
  if (!Array.isArray(entries) || entries.length < 10) {
    return false;
  }
  return entries.slice(0, 10).every((entry, index) =>
    entry.rank === index + 1 &&
    entry.model &&
    entry.provider &&
    /tokens$/i.test(entry.tokens || "") &&
    entry.change
  );
}

function openRouterOfficialComponentSnapshot(entries, sourceInfo, generatedAt) {
  return trackingTableOfficialComponentSnapshot({
    componentKind: "openrouter_rankings",
    sourceInfo,
    generatedAt,
    selectorVersion: "openrouter-rankings-v1",
    sourceSelector: "[data-openrouter-rankings]",
    className: "openrouter-rankings-card",
    marker: "data-openrouter-rankings",
    title: "OpenRouter Top Models",
    subtitle: "This Week usage ranking",
    columns: ["Rank", "Model", "Provider", "Tokens", "Change"],
    rows: entries.map((entry) => [
      `#${entry.rank}`,
      entry.model,
      entry.provider,
      entry.tokens,
      entry.change
    ])
  });
}

async function collectArtificialAnalysisIndexSource(sourceInfo, options = {}) {
  try {
    if (
      typeof options.artificialAnalysisIndexText !== "string" &&
      typeof options.artificialAnalysisIndexTextFetcher !== "function" &&
      Object.hasOwn(options, "fetchImpl") &&
      options.artificialAnalysisIndexLive !== true
    ) {
      throw new Error("browser_snapshot_disabled_for_mock_fetch");
    }
    const pageSnapshot = typeof options.artificialAnalysisIndexText === "string"
      ? {
          text: options.artificialAnalysisIndexText,
          official_component_snapshot: buildOfficialComponentSnapshotFromOption(options.artificialAnalysisOfficialComponentSnapshot, sourceInfo, {
            componentKind: "artificial_analysis_index",
            selectorVersion: "artificial-analysis-index-v1",
            capturedAt: options.generatedAt
          }),
          evidence_assets: Array.isArray(options.artificialAnalysisIndexEvidenceAssets) ? options.artificialAnalysisIndexEvidenceAssets : []
        }
      : typeof options.artificialAnalysisIndexTextFetcher === "function"
        ? {
            text: await options.artificialAnalysisIndexTextFetcher(sourceInfo),
            official_component_snapshot: buildOfficialComponentSnapshotFromOption(options.artificialAnalysisOfficialComponentSnapshot, sourceInfo, {
              componentKind: "artificial_analysis_index",
              selectorVersion: "artificial-analysis-index-v1",
              capturedAt: options.generatedAt
            }),
            evidence_assets: Array.isArray(options.artificialAnalysisIndexEvidenceAssets) ? options.artificialAnalysisIndexEvidenceAssets : []
          }
        : await readArtificialAnalysisIndexPageSnapshot(sourceInfo, options);
    const text = pageSnapshot.text;
    const entries = parseArtificialAnalysisIndexText(text);
    const componentTabs = parseArtificialAnalysisComponentTabs(text, entries);
    const snapshot = artificialAnalysisIndexSnapshot(entries, sourceInfo, options.generatedAt, componentTabs, {
      officialComponentSnapshot: pageSnapshot.official_component_snapshot
    });
    const complete = snapshot.snapshot_status === "complete";
    return {
      status: complete ? "checked" : "no_signal",
      notes: complete
        ? `public_page_snapshot; ${snapshot.top_entries.length} top models parsed; collection_method=playwright_dom`
        : `public_page_snapshot; ${snapshot.top_entries.length} top models parsed; top10_incomplete`,
      snapshot,
      evidence_assets: pageSnapshot.evidence_assets || []
    };
  } catch (error) {
    return {
      status: "blocked",
      notes: withRetryNote(formatDiscoveryErrorNote(error), error),
      snapshot: {
        type: "artificial_analysis_intelligence_index_public_page",
        collection_method: "public_page_playwright",
        snapshot_status: "blocked",
        snapshot_as_of: options.generatedAt || new Date().toISOString(),
        source_url: sourceInfo.url,
        top_entries: [],
        notes: sanitizeNoteValue(error?.message || error)
      },
      evidence_assets: []
    };
  }
}

async function readArtificialAnalysisIndexPageSnapshot(sourceInfo, options = {}) {
  const { chromium } = await import("@playwright/test");
  const timeoutMs = Number.isInteger(sourceInfo.timeoutMs) && sourceInfo.timeoutMs > 0
    ? sourceInfo.timeoutMs
    : Number.isInteger(sourceInfo.timeout_ms) && sourceInfo.timeout_ms > 0
      ? sourceInfo.timeout_ms
      : 30000;
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(sourceInfo.url, { waitUntil: "networkidle", timeout: timeoutMs });
    await page.waitForTimeout(Math.min(2000, Math.max(500, Math.floor(timeoutMs / 10))));
    const text = await page.locator("body").innerText({ timeout: Math.min(10000, timeoutMs) });
    const official_component_snapshot = await captureOfficialComponentSnapshot(page, sourceInfo, {
      componentKind: "artificial_analysis_index",
      selectorVersion: "artificial-analysis-index-v1",
      capturedAt: options.generatedAt,
      selectors: [
        "main [data-testid*='leaderboard']",
        "main [class*='leaderboard']",
        "[data-testid*='leaderboard']",
        "[class*='leaderboard'] table",
        "table"
      ]
    });
    const evidence_assets = await captureDailyTrackingPageEvidence({
      page,
      sourceInfo,
      rootDir: options.rootDir || process.cwd(),
      outDir: options.evidenceOutDir || options.outDir || "docs",
      reportDate: options.reportDate,
      maxScreenshots: 5
    });
    return { text, official_component_snapshot, evidence_assets };
  } finally {
    await browser.close();
  }
}

async function collectSweBenchProSource(sourceInfo, options = {}) {
  try {
    if (
      typeof options.sweBenchProText !== "string" &&
      typeof options.sweBenchProTextFetcher !== "function" &&
      Object.hasOwn(options, "fetchImpl") &&
      options.sweBenchProLive !== true
    ) {
      throw new Error("browser_snapshot_disabled_for_mock_fetch");
    }
    const pageSnapshot = typeof options.sweBenchProText === "string"
      ? {
          text: options.sweBenchProText,
          official_component_snapshot: buildOfficialComponentSnapshotFromOption(options.sweBenchProOfficialComponentSnapshot, sourceInfo, {
            componentKind: "swe_bench_pro",
            selectorVersion: "swe-bench-pro-v1",
            capturedAt: options.generatedAt
          }),
          evidence_assets: Array.isArray(options.sweBenchProEvidenceAssets) ? options.sweBenchProEvidenceAssets : []
        }
      : typeof options.sweBenchProTextFetcher === "function"
        ? {
            text: await options.sweBenchProTextFetcher(sourceInfo),
            official_component_snapshot: buildOfficialComponentSnapshotFromOption(options.sweBenchProOfficialComponentSnapshot, sourceInfo, {
              componentKind: "swe_bench_pro",
              selectorVersion: "swe-bench-pro-v1",
              capturedAt: options.generatedAt
            }),
            evidence_assets: Array.isArray(options.sweBenchProEvidenceAssets) ? options.sweBenchProEvidenceAssets : []
          }
        : await readSweBenchProPageSnapshot(sourceInfo, options);
    const entries = parseSweBenchProText(pageSnapshot.text);
    const snapshot = sweBenchProSnapshot(entries, sourceInfo, options.generatedAt, {
      officialComponentSnapshot: pageSnapshot.official_component_snapshot
    });
    const complete = snapshot.snapshot_status === "complete";
    if (snapshot.top_entries.length > 0) {
      return {
        status: "checked",
        notes: complete
          ? `public_page_snapshot; ${snapshot.top_entries.length} rows parsed; collection_method=playwright_dom`
          : `public_page_snapshot; ${snapshot.top_entries.length} rows parsed; snapshot_status=partial; collection_method=playwright_dom`,
        snapshot,
        evidence_assets: pageSnapshot.evidence_assets || []
      };
    }
    return sweBenchProStaticFallbackSource(sourceInfo, options, `parsed_${snapshot.top_entries.length}_rows`);
  } catch (error) {
    return sweBenchProStaticFallbackSource(sourceInfo, options, withRetryNote(formatDiscoveryErrorNote(error), error));
  }
}

async function readSweBenchProPageSnapshot(sourceInfo, options = {}) {
  const { chromium } = await import("@playwright/test");
  const timeoutMs = Number.isInteger(sourceInfo.timeoutMs) && sourceInfo.timeoutMs > 0
    ? sourceInfo.timeoutMs
    : Number.isInteger(sourceInfo.timeout_ms) && sourceInfo.timeout_ms > 0
      ? sourceInfo.timeout_ms
      : 30000;
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(sourceInfo.url, { waitUntil: "networkidle", timeout: timeoutMs });
    await page.waitForTimeout(Math.min(2000, Math.max(500, Math.floor(timeoutMs / 10))));
    let text = await page.locator("body").innerText({ timeout: Math.min(10000, timeoutMs) });
    const official_component_snapshot = await captureOfficialComponentSnapshot(page, sourceInfo, {
      componentKind: "swe_bench_pro",
      selectorVersion: "swe-bench-pro-v1",
      capturedAt: options.generatedAt,
      selectors: [
        "[data-swe-bench-pro-leaderboard]",
        "main [class*='leaderboard']",
        "main [class*='ranking']",
        "[class*='leaderboard'] table",
        "[class*='ranking'] table",
        "table"
      ]
    });
    if (parseSweBenchProText(text).length === 0) {
      const htmlText = await readSweBenchProRawHtmlText(sourceInfo, timeoutMs);
      if (parseSweBenchProText(htmlText).length > 0) {
        text = htmlText;
      }
    }
    const evidence_assets = await captureDailyTrackingPageEvidence({
      page,
      sourceInfo,
      rootDir: options.rootDir || process.cwd(),
      outDir: options.evidenceOutDir || options.outDir || "docs",
      reportDate: options.reportDate,
      maxScreenshots: 5
    });
    return { text, official_component_snapshot, evidence_assets };
  } finally {
    await browser.close();
  }
}

async function readSweBenchProRawHtmlText(sourceInfo, timeoutMs) {
  if (typeof globalThis.fetch !== "function") {
    return "";
  }
  try {
    const response = await globalThis.fetch(sourceInfo.url, {
      headers: {
        accept: "text/html,application/xhtml+xml,*/*",
        "user-agent": "ai-daily-cn-static-publisher"
      },
      ...timeoutInit(timeoutMs)
    });
    if (!response.ok) {
      return "";
    }
    return response.text();
  } catch {
    return "";
  }
}

export function parseSweBenchProText(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => cleanText(line))
    .filter(Boolean);
  const entries = [];
  const seen = new Set();
  for (let index = 0; index < lines.length; index += 1) {
    const score = sweBenchProScoreLine(lines[index]);
    if (!score) {
      continue;
    }
    const model = previousSweBenchProModelLine(lines, index);
    if (!model || seen.has(model.toLowerCase())) {
      continue;
    }
    seen.add(model.toLowerCase());
    entries.push({
      rank: entries.length + 1,
      model,
      provider: sweBenchProProviderForModel(model),
      tokens: score,
      change: previousSweBenchProNewMarker(lines, index) ? "new" : "Resolve Rate"
    });
  }
  return entries;
}

function sweBenchProStaticFallbackSource(sourceInfo, options = {}, reason = "") {
  const snapshot = sweBenchProSnapshot(SWE_BENCH_PRO_STATIC_ROWS, sourceInfo, options.generatedAt, {
    officialComponentSnapshot: sweBenchProOfficialComponentSnapshot(sourceInfo, options.generatedAt),
    notes: `Static official snapshot fallback from Scale Labs public leaderboard; fallback_reason=${sanitizeNoteValue(reason)}`
  });
  return {
    status: "checked",
    notes: `official_page_snapshot_static_fallback; ${snapshot.top_entries.length} rows parsed; fallback_reason=${sanitizeNoteValue(reason)}`,
    snapshot,
    evidence_assets: []
  };
}

function sweBenchProSnapshot(entries, sourceInfo, generatedAt, extras = {}) {
  const topEntries = entries.map((entry, index) => ({
    rank: Number(entry.rank) || index + 1,
    model: String(entry.model || "").trim(),
    provider: String(entry.provider || sweBenchProProviderForModel(entry.model)).trim(),
    tokens: String(entry.tokens || "").trim(),
    change: String(entry.change || "Resolve Rate").trim()
  })).filter((entry) => entry.model && entry.provider && entry.tokens);
  return {
    type: "swe_bench_pro_public_page",
    collection_method: extras.notes ? "public_page_static" : "public_page_playwright",
    snapshot_status: hasCompleteSweBenchProTop10(topEntries) ? "complete" : "partial",
    snapshot_as_of: generatedAt || new Date().toISOString(),
    source_url: sourceInfo.url,
    top_entries: topEntries,
    ...(extras.officialComponentSnapshot ? { official_component_snapshot: extras.officialComponentSnapshot } : {}),
    notes: extras.notes || "Scale Labs SWE-Bench Pro public leaderboard snapshot; use as coding benchmark signal, not production selection proof."
  };
}

function trackingTableOfficialComponentSnapshot({
  componentKind,
  sourceInfo,
  generatedAt,
  selectorVersion,
  sourceSelector,
  className,
  marker,
  title,
  subtitle,
  columns,
  rows
}) {
  const tableRows = rows.map((row) => `
        <tr>${row.map((cell) => `<td>${escapeHtmlText(cell)}</td>`).join("")}</tr>`).join("");
  const tableHeaders = columns.map((column) => `<th>${escapeHtmlText(column)}</th>`).join("");
  return createOfficialComponentSnapshot({
    componentKind,
    sourceUrl: sourceInfo.url,
    capturedAt: generatedAt,
    selectorVersion,
    sourceSelector,
    html: `
      <section class="${escapeHtmlText(className)}" ${marker}>
        <header>
          <p>${escapeHtmlText(title)}</p>
          <span>${escapeHtmlText(subtitle)}</span>
        </header>
        <table>
          <thead><tr>${tableHeaders}</tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </section>`,
    css: `
      .${className} { border: 1px solid currentColor; padding: 16px; }
      .${className} table { width: 100%; border-collapse: collapse; }
      .${className} th, .${className} td { padding: 8px; border-top: 1px solid currentColor; text-align: left; }
    `
  });
}

function sweBenchProOfficialComponentSnapshot(sourceInfo, generatedAt) {
  const rows = SWE_BENCH_PRO_STATIC_ROWS.map((entry) => `
        <tr>
          <td>${escapeHtmlText(`#${entry.rank}`)}</td>
          <td>${escapeHtmlText(entry.model)}</td>
          <td>${escapeHtmlText(entry.provider)}</td>
          <td>${escapeHtmlText(entry.tokens)}</td>
          <td>${escapeHtmlText(entry.change)}</td>
        </tr>`).join("");
  return createOfficialComponentSnapshot({
    componentKind: "swe_bench_pro",
    sourceUrl: sourceInfo.url,
    capturedAt: generatedAt,
    selectorVersion: "swe-bench-pro-v1",
    sourceSelector: "[data-swe-bench-pro-leaderboard]",
    html: `
      <section class="swe-bench-pro-card" data-swe-bench-pro-leaderboard>
        <header>
          <p>SWE-Bench Pro (Public Dataset)</p>
          <h2>Performance Comparison</h2>
          <span>Primary metric: Resolve Rate</span>
        </header>
        <table>
          <thead><tr><th>Rank</th><th>Model / Agent</th><th>Provider</th><th>Resolve Rate</th><th>Change</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </section>`,
    css: `
      .swe-bench-pro-card { border: 1px solid currentColor; padding: 16px; }
      .swe-bench-pro-card table { width: 100%; border-collapse: collapse; }
      .swe-bench-pro-card th, .swe-bench-pro-card td { padding: 8px; border-top: 1px solid currentColor; text-align: left; }
    `
  });
}

const SWE_BENCH_PRO_STATIC_ROWS = [
  { rank: 1, model: "gpt-5.4 (xHigh)*", provider: "openai", tokens: "59.10±3.56%", change: "Resolve Rate" },
  { rank: 2, model: "Muse Spark*", provider: "scale", tokens: "55.00±3.60%", change: "new" },
  { rank: 3, model: "claude-opus-4-6 (thinking)*", provider: "anthropic", tokens: "51.90±3.61%", change: "Resolve Rate" },
  { rank: 4, model: "gemini-3.1-pro (thinking)*", provider: "google", tokens: "46.10±3.60%", change: "Resolve Rate" },
  { rank: 5, model: "claude-opus-4-5-20251101", provider: "anthropic", tokens: "45.89±3.60%", change: "Resolve Rate" },
  { rank: 6, model: "claude-4-5-Sonnet", provider: "anthropic", tokens: "43.60±3.60%", change: "Resolve Rate" },
  { rank: 7, model: "gemini-3-pro-preview", provider: "google", tokens: "43.30±3.60%", change: "Resolve Rate" },
  { rank: 8, model: "claude-4-Sonnet", provider: "anthropic", tokens: "42.70±3.59%", change: "Resolve Rate" },
  { rank: 9, model: "gpt-5-2025-08-07 (High)", provider: "openai", tokens: "41.78±3.49%", change: "Resolve Rate" },
  { rank: 10, model: "gpt-5.2-codex", provider: "openai", tokens: "41.04±3.57%", change: "Resolve Rate" }
];

function hasCompleteSweBenchProTop10(entries) {
  return Array.isArray(entries) &&
    entries.length >= 10 &&
    entries.slice(0, 10).every((entry, index) =>
      Number(entry.rank) === index + 1 &&
      entry.model &&
      entry.provider &&
      /\d+(?:\.\d+)?/.test(entry.tokens || "") &&
      entry.change
    );
}

function sweBenchProScoreLine(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{1,3}(?:\.\d+)?)\s*(?:±|\+\/-|\+|-)?\s*(\d{1,2}(?:\.\d+)?)?\s*%?$/);
  if (!match) {
    return "";
  }
  const score = match[1];
  const error = match[2] ? `±${match[2]}` : "";
  return `${score}${error}%`;
}

function previousSweBenchProModelLine(lines, index) {
  for (let current = index - 1; current >= 0 && current >= index - 8; current -= 1) {
    const line = lines[current];
    if (!line || /^new$/i.test(line) || /^\d+$/.test(line) || sweBenchProScoreLine(line)) {
      continue;
    }
    if (/rank|model|provider|resolve|rate|dataset|primary metric|performance comparison|cost|accuracy/i.test(line)) {
      continue;
    }
    if (/[A-Za-z]/.test(line)) {
      return line;
    }
  }
  return "";
}

function previousSweBenchProNewMarker(lines, index) {
  return lines.slice(Math.max(0, index - 4), index).some((line) => /^new$/i.test(line));
}

function sweBenchProProviderForModel(model) {
  const lower = String(model || "").toLowerCase();
  if (/claude|anthropic/.test(lower)) return "anthropic";
  if (/gpt|openai|codex/.test(lower)) return "openai";
  if (/gemini|google/.test(lower)) return "google";
  if (/qwen|alibaba/.test(lower)) return "alibaba";
  if (/deepseek/.test(lower)) return "deepseek";
  if (/llama|meta/.test(lower)) return "meta";
  if (/kimi|moonshot/.test(lower)) return "moonshot";
  if (/mistral|codestral/.test(lower)) return "mistral";
  if (/minimax/.test(lower)) return "minimax";
  if (/muse|spark/.test(lower)) return "scale";
  return "unknown";
}

function escapeHtmlText(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildOfficialComponentSnapshotFromOption(value, sourceInfo, defaults = {}) {
  if (!value || typeof value !== "object") {
    return null;
  }
  return createOfficialComponentSnapshot({
    componentKind: defaults.componentKind,
    sourceUrl: sourceInfo.url,
    capturedAt: defaults.capturedAt,
    selectorVersion: defaults.selectorVersion,
    sourceSelector: value.source_selector || value.sourceSelector,
    html: value.html || value.sanitized_html || value.sanitizedHtml,
    css: value.css || value.sanitized_css || value.sanitizedCss
  });
}

async function captureOfficialComponentSnapshot(page, sourceInfo, options = {}) {
  const selectors = Array.isArray(options.selectors) && options.selectors.length > 0 ? options.selectors : [];
  const fragment = await page.evaluate(async ({ selectors: candidateSelectors }) => {
    const firstExistingSelector = candidateSelectors.find((selector) => {
      try {
        return Boolean(document.querySelector(selector));
      } catch {
        return false;
      }
    });
    if (!firstExistingSelector) {
      return null;
    }
    const element = document.querySelector(firstExistingSelector);
    const cssParts = [];
    for (const style of Array.from(document.querySelectorAll("style"))) {
      const text = style.textContent || "";
      if (text.trim()) {
        cssParts.push(text);
      }
    }
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        const rules = Array.from(sheet.cssRules || []).map((rule) => rule.cssText).join("\n");
        if (rules.trim()) {
          cssParts.push(rules);
        }
      } catch {
        // Cross-origin stylesheets are expected on public pages; keep inline styles only.
      }
    }
    return {
      selector: firstExistingSelector,
      html: element ? element.outerHTML : "",
      css: cssParts.join("\n")
    };
  }, { selectors });
  if (!fragment) {
    return null;
  }
  return createOfficialComponentSnapshot({
    componentKind: options.componentKind,
    sourceUrl: sourceInfo.url,
    capturedAt: options.capturedAt,
    selectorVersion: options.selectorVersion,
    sourceSelector: fragment.selector,
    html: fragment.html,
    css: fragment.css
  });
}

export function parseArtificialAnalysisIndexText(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => cleanText(line))
    .filter(Boolean);
  const resultsIndex = lines.findIndex((line) => /Artificial Analysis Intelligence Index:\s*Results/i.test(line));
  const scanLines = resultsIndex >= 0 ? lines.slice(resultsIndex + 1) : lines;
  const addModelIndex = scanLines.findIndex((line) => /Add model from specific provider/i.test(line));
  const tableLines = addModelIndex >= 0 ? scanLines.slice(addModelIndex + 1) : scanLines;
  const scoreStartIndex = tableLines.findIndex((line) => /^\d{1,3}(?:\.\d+)?$/.test(line));
  if (scoreStartIndex >= 0) {
    const models = tableLines.slice(0, scoreStartIndex)
      .filter((line) => artificialAnalysisProviderForModel(line));
    const scores = tableLines.slice(scoreStartIndex)
      .filter((line) => /^\d{1,3}(?:\.\d+)?$/.test(line))
      .filter((line) => {
        const value = Number(line);
        return value >= 0 && value <= 100;
      });
    return models
      .map((model, index) => ({
        rank: index + 1,
        model,
        provider: artificialAnalysisProviderForModel(model),
        tokens: `${scores[index]} 分`,
        change: "AA Index"
      }))
      .filter((entry) => entry.tokens !== "undefined 分");
  }

  const entries = [];
  const seen = new Set();

  for (let index = 0; index < scanLines.length; index += 1) {
    const model = scanLines[index];
    const provider = artificialAnalysisProviderForModel(model);
    if (!provider || seen.has(model.toLowerCase())) {
      continue;
    }
    const score = firstArtificialAnalysisScore(scanLines, index + 1);
    if (!score) {
      continue;
    }
    seen.add(model.toLowerCase());
    entries.push({
      rank: entries.length + 1,
      model,
      provider,
      tokens: `${score} 分`,
      change: "AA Index"
    });
  }

  return entries;
}

function firstArtificialAnalysisScore(lines, startIndex) {
  for (let offset = 0; offset < 6; offset += 1) {
    const line = lines[startIndex + offset];
    if (/^\d{1,3}(?:\.\d+)?$/.test(line || "")) {
      const value = Number(line);
      if (value >= 0 && value <= 100) {
        return line;
      }
    }
  }
  return "";
}

function artificialAnalysisProviderForModel(model) {
  const text = String(model || "").toLowerCase();
  if (/claude|anthropic/.test(text)) return "anthropic";
  if (/\bgpt\b|gpt-|o3|o4|openai/.test(text)) return "openai";
  if (/gemini|gemma|google/.test(text)) return "google";
  if (/qwen|alibaba/.test(text)) return "alibaba";
  if (/minimax/.test(text)) return "minimax";
  if (/kimi|moonshot/.test(text)) return "moonshot";
  if (/mimo|xiaomi/.test(text)) return "xiaomi";
  if (/deepseek/.test(text)) return "deepseek";
  if (/grok|xai/.test(text)) return "xai";
  if (/nemotron|nvidia/.test(text)) return "nvidia";
  if (/glm|zhipu/.test(text)) return "zhipu";
  if (/mistral|mixtral/.test(text)) return "mistral";
  if (/nova|amazon/.test(text)) return "amazon";
  if (/solar|upstage/.test(text)) return "upstage";
  return "";
}

function artificialAnalysisIndexSnapshot(entries, sourceInfo, generatedAt, componentTabs = {}, extras = {}) {
  const topEntries = entries.map((entry) => ({
    rank: entry.rank,
    model: entry.model,
    provider: entry.provider,
    tokens: entry.tokens,
    change: entry.change
  }));
  const tabs = normalizeArtificialAnalysisComponentTabs(componentTabs, topEntries);
  const officialComponentSnapshot = extras.officialComponentSnapshot ||
    (topEntries.length >= 10 ? artificialAnalysisOfficialComponentSnapshot(topEntries, sourceInfo, generatedAt) : null);
  return {
    type: "artificial_analysis_intelligence_index_public_page",
    collection_method: "public_page_playwright",
    snapshot_status: topEntries.length >= 10 ? "complete" : topEntries.length > 0 ? "partial" : "blocked",
    snapshot_as_of: generatedAt || new Date().toISOString(),
    source_url: sourceInfo.url,
    top_entries: topEntries,
    ...(Object.keys(tabs).length > 0 ? { component_tabs: tabs } : {}),
    ...(officialComponentSnapshot ? { official_component_snapshot: officialComponentSnapshot } : {}),
    notes: "Public Artificial Analysis Intelligence Index snapshot; use as independent benchmark signal, not production-selection proof."
  };
}

function artificialAnalysisOfficialComponentSnapshot(entries, sourceInfo, generatedAt) {
  return trackingTableOfficialComponentSnapshot({
    componentKind: "artificial_analysis_index",
    sourceInfo,
    generatedAt,
    selectorVersion: "artificial-analysis-index-v1",
    sourceSelector: "[data-artificial-analysis-index]",
    className: "artificial-analysis-index-card",
    marker: "data-artificial-analysis-index",
    title: "Artificial Analysis Intelligence Index",
    subtitle: "Top models by independent Intelligence Index",
    columns: ["Rank", "Model", "Provider", "Score", "Metric"],
    rows: entries.map((entry) => [
      `#${entry.rank}`,
      entry.model,
      entry.provider,
      entry.tokens,
      entry.change
    ])
  });
}

function parseArtificialAnalysisComponentTabs(text, scoreEntries = []) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => cleanText(line))
    .filter(Boolean);
  const scoreRows = scoreEntries.map((entry) => ({
    rank: entry.rank,
    model: entry.model,
    provider: entry.provider,
    value: parseTrackingNumericValue(entry.tokens),
    value_label: entry.tokens,
    change: "AA Index",
    metric: "Score"
  }));
  const tokenRows = parseArtificialAnalysisValueRows(
    sectionBetween(lines, /## Token Usage|Intelligence Index:\s*Token Usage/i, /## Cost|## Score vs|## Example Tasks/i),
    {
      metric: "Token Usage",
      valuePattern: /(?:tokens?|[KMGTP]$)/i,
      segmentLabels: [
        ["answer", /answer tokens?/i],
        ["reasoning", /reasoning tokens?/i],
        ["input", /input tokens?/i]
      ]
    }
  );
  const costRows = parseArtificialAnalysisValueRows(
    sectionBetween(lines, /## Cost|Intelligence Index:\s*Cost Breakdown/i, /## Score vs|## Example Tasks/i),
    {
      metric: "Cost",
      valuePattern: /^\$|cost/i,
      segmentLabels: [
        ["answer", /answer cost/i],
        ["reasoning", /reasoning cost/i],
        ["input", /input cost/i]
      ]
    }
  );
  const computeRows = parseArtificialAnalysisScoreComputeRows(sectionBetween(lines, /## Score vs\.?\s*Compute|Score vs\.?\s*Compute/i, /## Example Tasks|## Score|## Token Usage|## Cost/i));
  return {
    ...(scoreRows.length > 0 ? { score: { rows: scoreRows } } : {}),
    ...(tokenRows.length > 0 ? { token_usage: { rows: tokenRows } } : {}),
    ...(costRows.length > 0 ? { cost: { rows: costRows } } : {}),
    ...scatterTabsFromArtificialAnalysisRows(scoreRows, tokenRows, costRows, computeRows)
  };
}

function normalizeArtificialAnalysisComponentTabs(componentTabs, topEntries) {
  const normalized = {};
  const scoreRows = Array.isArray(componentTabs?.score?.rows) && componentTabs.score.rows.length > 0
    ? componentTabs.score.rows
    : topEntries.map((entry) => ({
        rank: entry.rank,
        model: entry.model,
        provider: entry.provider,
        value: parseTrackingNumericValue(entry.tokens),
        value_label: entry.tokens,
        change: "AA Index",
        metric: "Score"
      }));
  if (scoreRows.length > 0) {
    normalized.score = { rows: normalizeSourceComponentRows(scoreRows) };
  }
  for (const key of ["token_usage", "cost", "score_vs_token_usage", "score_vs_cost", "score_vs_compute"]) {
    const rows = normalizeSourceComponentRows(componentTabs?.[key]?.rows || []);
    if (rows.length > 0) {
      normalized[key] = { rows };
    }
  }
  return normalized;
}

function scatterTabsFromArtificialAnalysisRows(scoreRows, tokenRows, costRows, computeRows) {
  const scoreByModel = new Map(scoreRows.map((row) => [normalizeModelKey(row.model), row]));
  const scatterFor = (rows, metric) => rows
    .map((row, index) => {
      const score = scoreByModel.get(normalizeModelKey(row.model));
      if (!score) return null;
      return {
        rank: score.rank || index + 1,
        model: score.model,
        provider: score.provider || row.provider || "",
        value: score.value,
        value_label: `${score.value_label} / ${row.value_label}`,
        change: "",
        metric,
        secondary_value: row.value,
        secondary_value_label: row.value_label
      };
    })
    .filter(Boolean);
  const scoreVsToken = scatterFor(tokenRows, "Score vs. Token Usage");
  const scoreVsCost = scatterFor(costRows, "Score vs. Cost");
  const scoreVsCompute = scatterFor(computeRows, "Score vs. Compute");
  return {
    ...(scoreVsToken.length > 0 ? { score_vs_token_usage: { rows: scoreVsToken } } : {}),
    ...(scoreVsCost.length > 0 ? { score_vs_cost: { rows: scoreVsCost } } : {}),
    ...(scoreVsCompute.length > 0 ? { score_vs_compute: { rows: scoreVsCompute } } : {})
  };
}

function parseArtificialAnalysisValueRows(sectionLines, options = {}) {
  const rows = [];
  const segmentLabels = options.segmentLabels || [];
  for (let index = 0; index < sectionLines.length; index += 1) {
    const model = sectionLines[index];
    const provider = artificialAnalysisProviderForModel(model);
    if (!provider) {
      continue;
    }
    const totalIndex = firstValueLineIndex(sectionLines, index + 1, options.valuePattern);
    if (totalIndex < 0) {
      continue;
    }
    const total = sectionLines[totalIndex];
    const segments = {};
    for (const [key, pattern] of segmentLabels) {
      const value = valueAfterLabel(sectionLines, totalIndex + 1, pattern, options.valuePattern);
      if (value) {
        segments[key] = value;
      }
    }
    rows.push({
      rank: rows.length + 1,
      model,
      provider,
      value: parseTrackingNumericValue(total),
      value_label: total,
      change: "",
      metric: options.metric || "",
      ...(Object.keys(segments).length > 0 ? { segments } : {})
    });
    index = Math.max(index, totalIndex);
  }
  return rows;
}

function parseArtificialAnalysisScoreComputeRows(sectionLines) {
  const rows = [];
  for (let index = 0; index < sectionLines.length; index += 1) {
    const model = sectionLines[index];
    const provider = artificialAnalysisProviderForModel(model);
    if (!provider) {
      continue;
    }
    const scoreIndex = firstValueLineIndex(sectionLines, index + 1, /^\d{1,3}(?:\.\d+)?$/);
    const compute = valueAfterLabel(sectionLines, scoreIndex + 1, /compute/i, /^\d+(?:\.\d+)?$/);
    if (scoreIndex < 0 || !compute) {
      continue;
    }
    rows.push({
      rank: rows.length + 1,
      model,
      provider,
      value: parseTrackingNumericValue(compute),
      value_label: compute,
      change: "",
      metric: "Compute"
    });
    index = scoreIndex;
  }
  return rows;
}

function sectionBetween(lines, startPattern, endPattern) {
  const start = lines.findIndex((line) => startPattern.test(line));
  if (start < 0) {
    return [];
  }
  const end = lines.findIndex((line, index) => index > start && endPattern.test(line));
  return lines.slice(start + 1, end > start ? end : undefined);
}

function firstValueLineIndex(lines, startIndex, valuePattern) {
  for (let index = Math.max(0, startIndex); index < Math.min(lines.length, startIndex + 8); index += 1) {
    const line = lines[index];
    if (looksLikeTrackingValue(line) && (!valuePattern || valuePattern.test(line))) {
      return index;
    }
  }
  return -1;
}

function valueAfterLabel(lines, startIndex, labelPattern, valuePattern) {
  for (let index = Math.max(0, startIndex); index < Math.min(lines.length, startIndex + 12); index += 1) {
    const line = lines[index];
    const compact = line.match(new RegExp(`${labelPattern.source}\\s+(.+)$`, labelPattern.flags.includes("i") ? "i" : ""));
    if (compact && looksLikeTrackingValue(compact[1]) && (!valuePattern || valuePattern.test(compact[1]))) {
      return compact[1];
    }
    if (!labelPattern.test(line)) {
      continue;
    }
    const next = lines[index + 1];
    if (looksLikeTrackingValue(next) && (!valuePattern || valuePattern.test(next))) {
      return next;
    }
  }
  return "";
}

function normalizeSourceComponentRows(rows) {
  return rows
    .filter((row) => row?.model && Number.isFinite(Number(row.value)))
    .map((row, index) => ({
      rank: Number(row.rank) || index + 1,
      model: row.model,
      provider: row.provider || "",
      value: Number(row.value),
      value_label: row.value_label || String(row.value),
      change: row.change || "",
      ...(row.metric ? { metric: row.metric } : {}),
      ...(row.secondary_value !== undefined ? { secondary_value: Number(row.secondary_value) } : {}),
      ...(row.secondary_value_label ? { secondary_value_label: row.secondary_value_label } : {}),
      ...(row.segments && Object.keys(row.segments).length > 0 ? { segments: row.segments } : {})
    }));
}

function looksLikeTrackingValue(value) {
  const text = String(value || "").trim();
  return /^\$?\d[\d,]*(?:\.\d+)?\s*(?:[KMGTP]|\w+)?(?:\s*tokens?)?$/i.test(text);
}

function parseTrackingNumericValue(value) {
  const text = String(value || "").replace(/,/g, "").trim();
  const amount = Number((text.match(/\d+(?:\.\d+)?/) || [0])[0]);
  if (!Number.isFinite(amount)) {
    return 0;
  }
  const unit = String((text.match(/\b([KMGTP])(?:\b|(?=\s*tokens?))/i) || [])[1] || "").toUpperCase();
  const multiplier = unit === "T" ? 1_000_000_000_000 : unit === "G" ? 1_000_000_000 : unit === "M" ? 1_000_000 : unit === "K" ? 1_000 : 1;
  return amount * multiplier;
}

function normalizeModelKey(value) {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

async function captureDailyTrackingPageEvidence(options = {}) {
  const page = options.page;
  const sourceInfo = options.sourceInfo || {};
  const rootDir = options.rootDir || process.cwd();
  const outDir = path.resolve(rootDir, options.outDir || "docs");
  const reportDate = requireReportDate(options.reportDate || new Date().toISOString().slice(0, 10));
  const maxScreenshots = Number.isInteger(options.maxScreenshots) && options.maxScreenshots > 0 ? options.maxScreenshots : 5;
  if (!page || maxScreenshots <= 0) {
    return [];
  }

  const publicPrefix = path.posix.join("assets", "evidence");
  const targetDir = path.join(outDir, "assets", "evidence");
  await fs.mkdir(targetDir, { recursive: true });

  const viewportSize = page.viewportSize() || { width: 1280, height: 900 };
  const scrollMetrics = await page.evaluate(() => ({
    scrollHeight: Math.max(document.documentElement.scrollHeight || 0, document.body?.scrollHeight || 0, window.innerHeight || 0),
    viewportHeight: window.innerHeight || 0
  }));
  const positions = screenshotScrollPositions(scrollMetrics.scrollHeight, scrollMetrics.viewportHeight || viewportSize.height, maxScreenshots);
  const base = slugId(`${sourceInfo.id || sourceInfo.name || "tracking"}-${reportDate}`) || `tracking-${reportDate}`;
  const assets = [];

  for (const [index, top] of positions.entries()) {
    await page.evaluate((value) => window.scrollTo(0, value), top);
    await page.waitForTimeout(350);
    const fileName = `${base}-${index + 1}.png`;
    const filePath = path.join(targetDir, fileName);
    await page.screenshot({
      path: filePath,
      animations: "disabled",
      clip: {
        x: 0,
        y: 0,
        width: viewportSize.width,
        height: viewportSize.height
      }
    });
    assets.push({
      type: "figure",
      title: trimText(`${sourceInfo.name || "每日追踪"} 图表 ${index + 1}`, 80),
      source_url: sourceInfo.url,
      local_path: path.posix.join(publicPrefix, fileName),
      caption: `${sourceInfo.name || "每日追踪"} 页面截图 ${index + 1}，用于展示当日公开榜单或图表。`,
      extraction_status: "source_image"
    });
  }

  await page.evaluate(() => window.scrollTo(0, 0));
  return assets;
}

function screenshotScrollPositions(scrollHeight, viewportHeight, maxScreenshots) {
  const totalHeight = Number(scrollHeight) > 0 ? Number(scrollHeight) : viewportHeight;
  const frameHeight = Number(viewportHeight) > 0 ? Number(viewportHeight) : 900;
  const maxScroll = Math.max(0, totalHeight - frameHeight);
  const ratios = maxScreenshots >= 4 ? [0, 0.25, 0.5, 0.75, 1] : [0, 0.35, 0.7, 1];
  const positions = [...new Set(
    ratios
      .map((ratio) => Math.round(maxScroll * ratio))
      .filter((value) => value >= 0)
  )];
  if (positions.length === 0) {
    return [0];
  }
  return positions.slice(0, maxScreenshots);
}

export function contentSourceSkipReason(sourceInfo, env = process.env) {
  if ((sourceInfo.source_kind === "rsshub" || sourceInfo.source_kind === "rss_bridge") && sourceInfo.base_url_env && !env[sourceInfo.base_url_env]) {
    return "skipped_missing_base_url";
  }
  if (sourceInfo.url_env && !env[sourceInfo.url_env]) {
    return "skipped_missing_base_url";
  }
  const requiredEnv = Array.isArray(sourceInfo.required_env) ? sourceInfo.required_env : sourceInfo.required_env ? [sourceInfo.required_env] : [];
  if (requiredEnv.some((name) => !env[name])) {
    return "skipped_missing_token";
  }
  return "";
}

export function contentSourceRequestUrl(sourceInfo, env = process.env, reportDate = "") {
  if (sourceInfo.url_env && env[sourceInfo.url_env]) {
    return resolveSourceUrlPlaceholders(env[sourceInfo.url_env], reportDate);
  }
  if ((sourceInfo.source_kind === "rsshub" || sourceInfo.source_kind === "rss_bridge") && sourceInfo.base_url_env && env[sourceInfo.base_url_env] && sourceInfo.route_path) {
    return resolveSourceUrlPlaceholders(new URL(sourceInfo.route_path, withTrailingSlash(env[sourceInfo.base_url_env])).toString(), reportDate);
  }
  return resolveSourceUrlPlaceholders(sourceInfo.url, reportDate);
}

function resolveSourceUrlPlaceholders(value, reportDate = "") {
  const url = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate || "")) {
    return url;
  }
  const compact = reportDate.replace(/-/g, "");
  return url
    .replace(/\{YYYY-MM-DD\}|\{date\}|\{REPORT_DATE\}/g, reportDate)
    .replace(/\{YYYYMMDD\}/g, compact);
}

async function writeContentSourceCache({ rootDir, sourceInfo, content, fetchedAt, enabled }) {
  if (!enabled || !isCacheFallbackSource(sourceInfo) || !content) {
    return;
  }
  const target = contentSourceCachePath(rootDir, sourceInfo);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify({
    schema_version: 1,
    source_id: sourceInfo.id,
    url: contentSourceRequestUrl(sourceInfo),
    fetched_at: fetchedAt || new Date().toISOString(),
    content
  })}\n`, "utf8");
}

async function readContentSourceCache({ rootDir, sourceInfo, maxAgeDays, enabled }) {
  if (!enabled || !isCacheFallbackSource(sourceInfo)) {
    return null;
  }
  try {
    const payload = JSON.parse(await fs.readFile(contentSourceCachePath(rootDir, sourceInfo), "utf8"));
    if (!payload || payload.source_id !== sourceInfo.id || typeof payload.content !== "string") {
      return null;
    }
    if (isCacheExpired(payload.fetched_at, maxAgeDays)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function contentSourceCachePath(rootDir, sourceInfo) {
  return path.resolve(rootDir || process.cwd(), ".tmp", "source-cache", "content", `${slugId(sourceInfo.id || sourceInfo.name || sourceInfo.url)}.json`);
}

function isCacheFallbackSource(sourceInfo = {}) {
  return /aify|arxiv|reddit/i.test(`${sourceInfo.id || ""} ${sourceInfo.name || ""} ${sourceInfo.url || ""}`);
}

function isCacheExpired(fetchedAt, maxAgeDays) {
  const ttlDays = Number.isFinite(Number(maxAgeDays)) && Number(maxAgeDays) > 0 ? Number(maxAgeDays) : DEFAULT_SOURCE_CACHE_TTL_DAYS;
  const date = new Date(fetchedAt);
  if (Number.isNaN(date.getTime())) {
    return true;
  }
  return Date.now() - date.getTime() > ttlDays * 24 * 60 * 60 * 1000;
}

function withTrailingSlash(value) {
  return String(value || "").endsWith("/") ? String(value) : `${value}/`;
}

function looksLikeJson(content) {
  return /^[\s\r\n]*[\[{]/.test(String(content || ""));
}

async function hydrateSearchApiEntries(entries, sourceInfo, fetchImpl) {
  if (!isHackerNewsStoriesSource(sourceInfo)) {
    return entries;
  }

  return mapWithConcurrency(entries, positiveInteger(sourceInfo.hydration_concurrency, 8), async (entry) => {
    if (!entry.item_api_url) {
      return entry;
    }
    try {
      const response = await fetchImpl(entry.item_api_url, {
        headers: {
          accept: "application/json, */*",
          "user-agent": "ai-daily-cn-static-publisher"
        },
        ...timeoutInit(sourceInfo.timeoutMs || sourceInfo.timeout_ms || 15000)
      });
      if (!response.ok) {
        return hackerNewsPlaceholderEntry(entry);
      }
      const item = JSON.parse(await response.text());
      const normalized = normalizeJsonApiEntry(item, sourceInfo);
      return normalized.url ? normalized : hackerNewsPlaceholderEntry(entry);
    } catch {
      return hackerNewsPlaceholderEntry(entry);
    }
  });
}

function parseJsonSearchApiEntries(content, sourceInfo) {
  let payload;
  try {
    payload = JSON.parse(content);
  } catch {
    return [];
  }

  if (isHackerNewsStoriesSource(sourceInfo) && Array.isArray(payload)) {
    return payload
      .filter((id) => Number.isInteger(Number(id)))
      .map((id) => ({
        observation_id: `hacker-news:${Number(id)}`,
        item_id: Number(id),
        item_api_url: `https://hacker-news.firebaseio.com/v0/item/${id}.json`
      }));
  }

  const items = isRedditSource(sourceInfo)
    ? ((payload?.data?.children || []).map((child) => child?.data || child))
    : arrayFromPossibleKeys(payload, ["results", "data", "items", "papers", "posts", "children"]);

  return items.map((item) => normalizeJsonApiEntry(item, sourceInfo)).filter((entry) => entry.url);
}

function parseHuggingFaceDailyPapersEntries(content, sourceInfo) {
  let payload;
  try {
    payload = JSON.parse(content);
  } catch {
    return [];
  }

  return arrayFromPossibleKeys(payload, ["results", "data", "items", "papers", "dailyPapers", "daily_papers"])
    .map((item) => normalizeHuggingFaceDailyPaperEntry(item, sourceInfo))
    .filter((entry) => entry.url);
}

function normalizeHuggingFaceDailyPaperEntry(rawItem, sourceInfo = {}) {
  const item = rawItem?.data && !rawItem.title ? rawItem.data : rawItem;
  if (!item || typeof item !== "object") {
    return {};
  }
  const paper = item.paper && typeof item.paper === "object" ? item.paper : {};
  const paperId = firstString(paper.id, item.paper_id, item.paperId, item.id);
  const paperUrl = paperId ? `https://huggingface.co/papers/${paperId}` : "";
  const url = absoluteUrl(
    firstString(item.url_abs, item.html_url, item.url, paper.url, item.paper_url, item.paperUrl, paperUrl),
    sourceInfo.url || "https://huggingface.co"
  );
  const authors = normalizeHuggingFaceAuthors(paper.authors || item.authors);
  const comments = Number.isFinite(Number(item.numComments ?? item.num_comments ?? item.comments))
    ? Number(item.numComments ?? item.num_comments ?? item.comments)
    : null;
  const summary = huggingFaceDailyPaperSummary(
    firstString(item.summary, paper.summary, item.abstract, paper.abstract, item.description),
    authors,
    comments
  );

  return {
    observation_id: paperId
      ? `huggingface:paper:${paperId}`
      : stableRowFingerprint("huggingface-paper-row", [JSON.stringify(item)]),
    title: cleanText(firstString(item.title, paper.title, item.name, paper.name)),
    url,
    event_date: jsonDateOnly(firstString(item.publishedAt, item.published_at, item.date, paper.publishedAt, paper.published_at)),
    summary,
    links: unique([
      absoluteUrl(firstString(paper.url, item.paper_url, item.paperUrl), sourceInfo.url || "https://huggingface.co"),
      paperId && /^\d{4}\.\d{4,5}/.test(paperId) ? `https://arxiv.org/abs/${paperId}` : ""
    ].filter(Boolean)),
    paper_id: paperId,
    authors,
    comments,
    source_level: "paper_api"
  };
}

function normalizeHuggingFaceAuthors(value) {
  const list = Array.isArray(value) ? value : [];
  return list
    .map((author) => cleanText(firstString(author?.name, author?.username, author?.fullname, author)))
    .filter(Boolean)
    .slice(0, 5);
}

function huggingFaceDailyPaperSummary(summary, authors, comments) {
  const parts = [];
  if (authors.length > 0) {
    parts.push(`Authors: ${authors.join(", ")}.`);
  }
  if (comments !== null) {
    parts.push(`${comments} comments.`);
  }
  const cleaned = cleanText(summary);
  if (cleaned) {
    parts.push(cleaned);
  }
  return parts.join(" ");
}

function normalizeJsonApiEntry(rawItem, sourceInfo = {}) {
  const item = rawItem?.data && !rawItem.title ? rawItem.data : rawItem;
  if (!item || typeof item !== "object") {
    return {};
  }

  const idUrl = isHackerNewsStoriesSource(sourceInfo) && item.id
    ? `https://news.ycombinator.com/item?id=${item.id}`
    : "";
  const permalink = absoluteUrl(firstString(item.permalink, item.comments_url), sourceInfo.url);
  const url = absoluteUrl(
    firstString(item.url_abs, item.html_url, item.url, item.paper_url, item.repository_url, item.arxiv_url, item.link, permalink, idUrl),
    sourceInfo.url
  );
  const summary = cleanText(firstString(item.abstract, item.summary, item.excerpt, item.selftext, item.text, item.description));
  const imageUrl = absoluteUrl(
    firstString(
      item.image_url,
      item.imageUrl,
      item.image,
      item.thumbnail_url,
      item.thumbnailUrl,
      item.thumbnail,
      item.social_image,
      item.socialImage,
      item.og_image,
      item.ogImage,
      looksLikeImageUrl(item.url_overridden_by_dest) ? item.url_overridden_by_dest : ""
    ),
    sourceInfo.url
  );
  const nativeObservationId = firstString(item.id, item.guid, item.uuid);

  return {
    observation_id: nativeObservationId
      ? `${sourceInfo.id || "json-api"}:${cleanText(nativeObservationId)}`
      : stableRowFingerprint("json-api-row", [sourceInfo.id || sourceInfo.url, JSON.stringify(item)]),
    title: cleanText(firstString(item.title, item.name, item.paper_title)),
    url,
    event_date: jsonDateOnly(firstString(item.published, item.published_at, item.date, item.created_at, item.createdAt, item.updated_at, item.time, item.created_utc)),
    summary,
    publisher: cleanText(firstString(item.source, item.publisher, item.publisher_name, item.site_name)),
    links: extractHtmlLinks(summary, url),
    ...entryImageFields(imageUrl, "json_api")
  };
}

function jsonDateOnly(value) {
  if (Number.isFinite(Number(value)) && String(value).trim() !== "") {
    const numeric = Number(value);
    const timestampMs = numeric < 100000000000 ? numeric * 1000 : numeric;
    const date = new Date(timestampMs);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
  }
  return dateOnly(value);
}

function isHackerNewsStoriesSource(sourceInfo = {}) {
  return sourceInfo.id === "content-hacker-news-api" || /hacker-news\.firebaseio\.com\/v0\/(?:top|best|new|show|ask)stories\.json/i.test(sourceInfo.url || "");
}

function hackerNewsPlaceholderEntry(entry = {}) {
  const id = Number(entry.item_id || String(entry.item_api_url || "").match(/\/item\/(\d+)\.json/)?.[1]);
  if (!Number.isInteger(id)) return entry;
  return {
    observation_id: entry.observation_id || `hacker-news:${id}`,
    title: `Hacker News item ${id}`,
    url: `https://news.ycombinator.com/item?id=${id}`,
    event_date: "",
    summary: "Hacker News item hydration was temporarily unavailable; the discussion URL was retained as a monitoring clue.",
    transport_degraded: "item_hydration_failed"
  };
}

function isRedditSource(sourceInfo = {}) {
  return /reddit\.com\/r\/[^/]+\/\.json/i.test(sourceInfo.url || "");
}

function parseHtmlIndexEntries(html, sourceInfo = {}) {
  const entries = [];
  const structuredMetadata = htmlIndexStructuredMetadata(html, sourceInfo.url);
  const anchorPattern = /<a\b[^>]*href=(?:"([^"]+)"|'([^']+)'|([^'"\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(anchorPattern)) {
    const rawHref = decodeXml(match[1] || match[2] || match[3] || "");
    const url = absoluteUrl(rawHref, sourceInfo.url);
    if (!url || !matchesSourceLink(rawHref, url, sourceInfo)) {
      continue;
    }

    const anchorBlock = match[0];
    const containerBlock = htmlIndexContainerBlock(html, match.index, match.index + match[0].length);
    const metadata = structuredMetadata.get(htmlIndexMetadataKey(url));
    const anchorTitle = extractHtmlTitle(match[4]);
    const title = genericHtmlAnchorTitle(anchorTitle)
      ? metadata?.title || ""
      : anchorTitle || metadata?.title || "";
    const anchorEventDate = extractHtmlDate(anchorBlock);
    const eventDate = anchorEventDate || metadata?.event_date || extractHtmlDate(containerBlock);
    // Treat the exact anchor (or same-URL structured metadata) as the fact boundary.
    // Reading past its closing tag can attach the next card's title, image, or facts
    // to the current candidate. An exact article/list-item container may supply only
    // an external date; arbitrary surrounding markup is never used as evidence.
    const imageUrl = extractHtmlImageUrl(anchorBlock, url) || metadata?.image_url || "";
    const rowFingerprint = stableRowFingerprint("html-index", [
      sourceInfo.id || sourceInfo.url,
      url,
      title,
      eventDate,
      cleanText(containerBlock || anchorBlock)
    ]);
    entries.push({
      observation_id: rowFingerprint,
      title,
      url,
      event_date: eventDate,
      summary: metadata?.summary || extractHtmlSummary(anchorBlock),
      ...(imageUrl ? { image_url: imageUrl, image_source: "html_index" } : {})
    });
  }

  return entries;
}

function htmlIndexStructuredMetadata(html, baseUrl) {
  const byUrl = new Map();
  for (const item of jsonLdObjects(html)) {
    const url = absoluteUrl(firstString(
      item.url,
      item["@id"],
      item.mainEntityOfPage?.url,
      item.mainEntityOfPage?.["@id"]
    ), baseUrl);
    const key = htmlIndexMetadataKey(url);
    if (!key) {
      continue;
    }
    const title = cleanText(firstString(item.headline, item.title, item.name));
    const eventDate = dateOnly(firstString(item.datePublished, item.dateCreated, item.dateModified, item.uploadDate));
    const summary = cleanText(firstString(item.description, item.abstract, item.summary));
    const imageUrl = structuredImageUrl(item.image, baseUrl);
    const previous = byUrl.get(key) || {};
    byUrl.set(key, {
      title: previous.title || title,
      event_date: previous.event_date || eventDate,
      summary: previous.summary || summary,
      image_url: previous.image_url || imageUrl
    });
  }
  return byUrl;
}

function htmlIndexContainerBlock(html, anchorStart, anchorEnd) {
  const prefix = html.slice(0, anchorStart);
  const lowerPrefix = prefix.toLowerCase();
  const candidates = [];

  for (const tag of ["article", "li"]) {
    let openingIndex = -1;
    for (const match of prefix.matchAll(new RegExp(`<${tag}\\b`, "gi"))) {
      openingIndex = match.index;
    }
    if (openingIndex < 0 || lowerPrefix.lastIndexOf(`</${tag}`) > openingIndex) {
      continue;
    }

    const suffix = html.slice(anchorEnd);
    const closingMatch = suffix.match(new RegExp(`</${tag}\\s*>`, "i"));
    if (!closingMatch || closingMatch.index === undefined) {
      continue;
    }
    candidates.push({
      start: openingIndex,
      end: anchorEnd + closingMatch.index + closingMatch[0].length
    });
  }

  const nearest = candidates.sort((left, right) => right.start - left.start)[0];
  return nearest ? html.slice(nearest.start, nearest.end) : "";
}

function genericHtmlAnchorTitle(value) {
  return /^(read\s+more|learn\s+more|view\s+more|more|details?|continue\s+reading|阅读全文|阅读更多|了解更多)$/i.test(cleanText(value));
}

function jsonLdObjects(html) {
  const objects = [];
  const scriptPattern = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of String(html || "").matchAll(scriptPattern)) {
    try {
      objects.push(...flattenJsonLd(JSON.parse(decodeXml(match[1]).trim())));
    } catch {
      continue;
    }
  }
  return objects;
}

function flattenJsonLd(value) {
  if (Array.isArray(value)) {
    return value.flatMap(flattenJsonLd);
  }
  if (!value || typeof value !== "object") {
    return [];
  }
  const nested = [
    value["@graph"],
    value.itemListElement,
    value.item,
    value.mainEntity,
    value.mainEntityOfPage
  ].flatMap(flattenJsonLd);
  return [value, ...nested];
}

function structuredImageUrl(value, baseUrl) {
  if (Array.isArray(value)) {
    return value.map((item) => structuredImageUrl(item, baseUrl)).find(Boolean) || "";
  }
  if (value && typeof value === "object") {
    return normalizeImageUrl(firstString(value.url, value.contentUrl, value["@id"]), baseUrl);
  }
  return normalizeImageUrl(value, baseUrl);
}

function parseAtomEntry(block) {
  const url = atomLink(block) || xmlText(block, "link");
  const summary = xmlText(block, "summary") || xmlText(block, "content");
  const nativeId = xmlText(block, "id");
  return normalizeFeedEntry({
    observation_id: nativeId || feedRowObservationId(block),
    title: xmlText(block, "title"),
    url,
    date: xmlText(block, "updated") || xmlText(block, "published"),
    summary,
    image_url: extractFeedImageUrl(block, url) || extractHtmlImageUrl(summary, url, { attributesDecoded: true }),
    image_source: "feed"
  });
}

function parseRssItem(block) {
  const url = xmlText(block, "link") || atomLink(block);
  const summary = xmlText(block, "description") || xmlText(block, "encoded") || xmlText(block, "summary");
  const nativeId = xmlText(block, "guid") || xmlText(block, "id");
  return normalizeFeedEntry({
    observation_id: nativeId || feedRowObservationId(block),
    title: xmlText(block, "title"),
    url,
    date: xmlText(block, "pubDate") || xmlText(block, "date") || xmlText(block, "updated"),
    summary,
    image_url: extractFeedImageUrl(block, url) || extractHtmlImageUrl(summary, url, { attributesDecoded: true }),
    image_source: "feed"
  });
}

function normalizeFeedEntry(entry) {
  const url = cleanText(entry.url);
  const rawSummary = entry.summary || "";
  const imageUrl = normalizeImageUrl(entry.image_url, url);
  return {
    observation_id: cleanText(entry.observation_id),
    title: cleanText(entry.title),
    url,
    event_date: dateOnly(entry.date),
    summary: cleanText(rawSummary),
    links: extractHtmlLinks(rawSummary, url, { attributesDecoded: true }),
    ...(imageUrl ? { image_url: imageUrl, image_source: entry.image_source || "feed" } : {})
  };
}

function feedRowObservationId(block) {
  const row = String(block || "").replace(/\s+/g, " ").trim();
  return stableRowFingerprint("feed-row", [row]);
}

function stableRowFingerprint(prefix, parts) {
  const row = (Array.isArray(parts) ? parts : [parts]).map((part) => String(part || "").trim()).join("\n");
  return `${prefix}:${createHash("sha256").update(row).digest("hex").slice(0, 32)}`;
}

function observationIdentityFields(entry = {}) {
  const observationId = cleanText(entry.observation_id);
  return observationId ? { observation_id: observationId } : {};
}

function contentCandidateImageFields(entry = {}) {
  const imageUrl = normalizeImageUrl(entry.image_url, entry.url);
  if (!imageUrl) {
    return {};
  }
  return {
    image_url: imageUrl,
    image_alt: cleanText(entry.image_alt || entry.title || ""),
    image_source: cleanText(entry.image_source || "feed_or_page")
  };
}

function entryImageFields(imageUrl, source) {
  const normalized = normalizeImageUrl(imageUrl);
  if (!normalized) {
    return {};
  }
  return {
    image_url: normalized,
    image_source: source
  };
}

function extractFeedImageUrl(block, baseUrl) {
  const mediaTag =
    block.match(/<(?:media:)?(?:content|thumbnail)\b[^>]*(?:url|href)=(?:"([^"]+)"|'([^']+)'|([^'"\s>]+))[^>]*>/i)?.[0] ||
    block.match(/<enclosure\b[^>]*(?:url|href)=(?:"([^"]+)"|'([^']+)'|([^'"\s>]+))[^>]*>/i)?.[0] ||
    block.match(/<itunes:image\b[^>]*(?:href|url)=(?:"([^"]+)"|'([^']+)'|([^'"\s>]+))[^>]*>/i)?.[0] ||
    "";
  const direct = mediaTag ? extractAttribute(mediaTag, "url") || extractAttribute(mediaTag, "href") : "";
  const imageText = xmlText(block, "image") || xmlText(block, "thumbnail");
  return normalizeImageUrl(direct || imageText, baseUrl);
}

function extractHtmlImageUrl(html, baseUrl, options = {}) {
  const markup = String(html || "");
  const metaTag =
    markup.match(/<meta\b[^>]*(?:property|name)=["'](?:og:image|twitter:image|twitter:image:src)["'][^>]*>/i)?.[0] ||
    markup.match(/<meta\b[^>]*content=["'][^"']+["'][^>]*(?:property|name)=["'](?:og:image|twitter:image|twitter:image:src)["'][^>]*>/i)?.[0] ||
    "";
  const metaImage = metaTag ? extractAttribute(metaTag, "content", options) : "";
  if (metaImage) {
    return normalizeImageUrl(metaImage, baseUrl);
  }

  for (const match of markup.matchAll(/<(?:img|source)\b[^>]*>/gi)) {
    const tag = match[0];
    const src = extractAttribute(tag, "src", options) || firstSrcsetUrl(extractAttribute(tag, "srcset", options));
    const imageUrl = normalizeImageUrl(src, baseUrl);
    if (imageUrl) {
      return imageUrl;
    }
  }
  return "";
}

function normalizeImageUrl(value, baseUrl = "") {
  const raw = String(value || "").trim();
  if (!raw || raw.startsWith("data:")) {
    return "";
  }
  const url = absoluteUrl(raw, baseUrl);
  return looksLikeImageUrl(url) ? url : "";
}

function looksLikeImageUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (!/^https?:$/i.test(url.protocol)) {
      return false;
    }
    return /\.(?:png|jpe?g|webp|gif|avif|svg)(?:$|[?#])/i.test(url.pathname);
  } catch {
    return false;
  }
}

function firstSrcsetUrl(value) {
  return String(value || "").split(",")[0]?.trim().split(/\s+/)[0] || "";
}

function extractAttribute(tag, name, options = {}) {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]+)"|'([^']+)'|([^\\s>]+))`, "i");
  const match = String(tag || "").match(pattern);
  const value = match?.[1] || match?.[2] || match?.[3] || "";
  return options.attributesDecoded ? value : decodeXml(value);
}

function extractHtmlLinks(html, baseUrl, options = {}) {
  const links = [];
  const seen = new Set();
  const markup = String(html || "");
  const anchorPattern = /<a\b[^>]*href=(?:"([^"]+)"|'([^']+)'|([^'"\s>]+))[^>]*>/gi;
  for (const match of markup.matchAll(anchorPattern)) {
    const value = match[1] || match[2] || match[3] || "";
    const url = absoluteUrl(options.attributesDecoded ? value : decodeXml(value), baseUrl);
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
  return String(value).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]*(?:>|$)/g, " ");
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

  const dottedYmdMatch = rawValue.match(/\b(\d{4})\.(\d{2})\.(\d{2})\b/);
  if (dottedYmdMatch) {
    return `${dottedYmdMatch[1]}-${dottedYmdMatch[2]}-${dottedYmdMatch[3]}`;
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

function withObservedEntryDate(entry, reportDate) {
  if (dateOnly(entry?.event_date)) {
    return entry;
  }
  return {
    ...entry,
    event_date: reportDate,
    date_basis: "observed"
  };
}

function retainEntryWithSafeUrl(entry) {
  const url = sanitizePublicHttpUrl(entry?.url);
  return url ? { ...entry, url } : null;
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

function trimText(value, maxLength) {
  const text = cleanText(value);
  if (!maxLength || text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
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

function htmlIndexMetadataKey(value) {
  try {
    const url = new URL(String(value || ""));
    url.hash = "";
    return url.toString().replace(/\/$/, "");
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
    .replace(/^(?:(?:[A-Z][a-z]+\.?\s+\d{1,2},\s+\d{4}|\d{4}[.-]\d{2}[.-]\d{2})\s+)?(?:Announcements|Blog|Case\s+Study|Company|Featured|Product|Research)\s+/i, "")
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
    text.match(/\b\d{4}\.\d{2}\.\d{2}\b/)?.[0] ||
    text.match(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},\s+\d{4}\b/i)?.[0];
  return dateOnly(explicitDate);
}

function extractHtmlSummary(block) {
  return extractFirstParagraph(block) || cleanText(block).slice(0, 240);
}
