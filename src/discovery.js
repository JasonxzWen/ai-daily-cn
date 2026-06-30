import fs from "node:fs/promises";
import path from "node:path";
import {
  applyGithubReadmeSummary,
  summarizeGithubReadme
} from "./github-readme.js";
import { loadSourceRegistry } from "./source-registry.js";
import { loadWeChatArticleInput, WECHAT_ARTICLE_INPUT_SOURCE } from "./wechat-input.js";
import {
  auditGroupForPlatform,
  isPlatformExemptCategory,
  PLATFORM_EXEMPT_PLATFORMS,
  PLATFORM_EXEMPT_POLICY,
  platformEntryToCandidate,
  platformFromCandidateCategory,
  platformSourceRejectReason,
  sectionForPlatformCategory
} from "./platform-exempt.js";
import { createOfficialComponentSnapshot } from "./official-component-snapshot.js";

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
const DEFAULT_SOURCE_CACHE_TTL_DAYS = 7;
const OPENROUTER_RANKINGS_SOURCE_KIND = "openrouter_rankings_public_playwright";
const ARTIFICIAL_ANALYSIS_INDEX_SOURCE_KIND = "artificial_analysis_index_public_playwright";
const SWE_BENCH_PRO_PUBLIC_SOURCE_KIND = "swe_bench_pro_public_playwright";
const GITHUB_REPORT_MARKDOWN_SOURCE_KIND = "github_report_markdown";
const HUGGINGFACE_DAILY_PAPERS_API_SOURCE_KIND = "huggingface_daily_papers_api";
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
    category: "intermediary",
    max_items_per_run: 20
  },
  {
    id: "intermediary-sspai",
    name: "SSPAI",
    url: "https://sspai.com/feed",
    category: "intermediary",
    max_items_per_run: 20
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
    lookback_days: 14,
    maxItemsPerRun: 8,
    sourceLevel: "weekly_paper_aggregator"
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
    sourceLevel: "ai_news_aggregator",
    lookback_days: 7
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
        notes: withRetryNote(`${parsed.length} repositories parsed`, response),
        parsed_count: parsed.length
      });

      for (const candidate of parsed) {
        const enriched = enrichProjectCandidate(candidate, currentSource, options.reportDate);
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
      limit,
      reportDate: options.reportDate
    });
  }

  const history = await loadGitHubTrendingHistory(options);
  const limitedCandidates = prioritizeGithubTrendingCandidatesForLimit([...byRepo.values()], limit);
  const enrichedCandidates = await enrichGithubTrendingReadmes(limitedCandidates, {
    fetchImpl,
    disabled: options.readmeEnrichment === false,
    maxCandidates: options.readmeLimit
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
    enriched.push(await enrichGithubTrendingReadme(candidate, fetchImpl));
  }
  return enriched;
}

async function enrichGithubTrendingReadme(candidate, fetchImpl) {
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
        const summary = summarizeGithubReadme({
          repo,
          readme,
          maxChars: 160
        });
        return {
          ...applyGithubReadmeSummary(candidate, {
            repo,
            summary,
            defaultBranch: branch,
            sha: candidate.sha || candidate.commit_sha || "unknown",
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
    return {
      ...candidate,
      topics: topics.length > 0 ? topics : (Array.isArray(candidate.topics) ? candidate.topics : []),
      license: license && license !== "NOASSERTION" ? license : (candidate.license || null),
      stargazers_total: stars,
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
  const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : 20;
  const sourceResults = [];
  const candidateSources = [toCandidateSource(sourceItem, "project", generatedAt, "blocked", "")];
  const candidates = [];

  try {
    const response = await fetchImpl(sourceItem.url, {
      headers: {
        accept: "application/json,text/html,*/*",
        "user-agent": "ai-daily-cn-static-publisher"
      },
      ...timeoutInit(sourceItem.timeoutMs || sourceItem.timeout_ms || 15000)
    });
    if (!response.ok) {
      const notes = withRetryNote(`HTTP ${response.status}`, response);
      markSource(candidateSources[0], "blocked", notes);
      sourceResults.push(auditSource(sourceItem.name, sourceItem.url, "blocked", notes));
      return huggingFaceTrendingResult(sourceResults, candidateSources, candidates);
    }

    const text = await response.text();
    const entries = parseHuggingFaceTrendingEntries(text, sourceItem)
      .filter((entry) => entry.repo && entry.url)
      .slice(0, limit);
    for (const [index, entry] of entries.entries()) {
      candidates.push({
        id: uniqueCandidateId(candidates, `${sourceItem.id}-${entry.repo}`),
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
    const notes = withRetryNote(`${entries.length} ranked models parsed`, response);
    markSource(candidateSources[0], status, notes);
    sourceResults.push(auditSource(sourceItem.name, sourceItem.url, status, notes, { parsed_count: entries.length }));
  } catch (error) {
    const notes = withRetryNote(formatDiscoveryErrorNote(error), error);
    markSource(candidateSources[0], "blocked", notes);
    sourceResults.push(auditSource(sourceItem.name, sourceItem.url, "blocked", notes));
  }

  return huggingFaceTrendingResult(sourceResults, candidateSources, candidates);
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
  const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : 50;
  const sourceResults = [];
  const byRepo = new Map();

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
      const existing = byRepo.get(candidate.repo);
      if (!existing || shouldPreferGithubTrendingCandidate(enriched, existing)) {
        byRepo.set(candidate.repo, enriched);
      }
    }
  }

  const history = await loadGitHubTrendingHistory(options);
  const candidates = annotateGitHubTrendingCandidates(prioritizeGithubTrendingCandidatesForLimit([...byRepo.values()], limit), history);
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
  const sources = await loadSources(options.sources, options.sourcesPath, DEFAULT_BUILDER_FALLBACK_SOURCES);
  const sourceResults = [];
  const candidateSources = [];
  const candidates = [];
  const evidenceAssets = [];
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
      const notes = withRetryNote(formatDiscoveryErrorNote(error), error);
      markSource(candidateSources.at(-1), "blocked", notes);
      sourceResults.push(auditSource(currentSource.name, currentSource.url, "blocked", notes));
    }
  }

  const curatedXHandleSet = await loadCuratedXHandles(options);
  const taggedCandidates = markCuratedXHandles(candidates, curatedXHandleSet);

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
    candidates: taggedCandidates.slice(0, limit)
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
      blockedNote = withRetryNote(formatDiscoveryErrorNote(error), error);
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
      const avatarUrl = xAvatarUrl(handle);
      return {
        source_id: sourceItem.id,
        category: "builder_observation",
        title: `${author}: ${shortenCandidateTitle(item.title || content)}`,
        url,
        source: sourceItem.name,
        event_date: eventDate,
        status: "excluded",
        author,
        original_text: content,
        ...(handle ? { handle } : {}),
        ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
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
      const handle = normalizeXHandle(builder.handle || xStatusHandle(tweet.url));
      const author = builder.name || (handle ? `@${handle}` : "") || "Builder";
      const avatarUrl = builderAvatarUrl(builder, handle);
      entries.push({
        source_id: sourceItem.id,
        category: "builder_observation",
        title: `${author}: ${shortenCandidateTitle(tweet.text)}`,
        url: tweet.url,
        source: sourceItem.name,
        event_date: eventDate,
        status: "excluded",
        author,
        original_text: tweet.text,
        ...(handle ? { handle } : {}),
        ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
        original_url: tweet.url,
        verification_status: "original_social_only",
        verification_sources: [tweet.url],
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
  const platformExempt = normalizePlatformExemptOption(options.platformExempt);
  const sources = filterPlatformExemptSources(await loadContentSources(options), platformExempt);
  const sourceResults = [];
  const candidateSources = [];
  const candidates = [];
  const evidenceAssets = [];
  const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : 20;
  const perSourceLimit = Number.isInteger(options.perSourceLimit) && options.perSourceLimit > 0 ? options.perSourceLimit : 3;
  const lookbackDays = Number.isInteger(options.lookbackDays) ? options.lookbackDays : 2;
  const startedAt = Date.now();
  const budgetMs = Number.isInteger(options.budgetMs) && options.budgetMs > 0 ? options.budgetMs : 300000;

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

  for (const rawSource of sources) {
    const currentSource = normalizeGenericSource(rawSource, "content");
    const { sourceCategory, candidateCategory, entryLabel } = contentSourceKinds(currentSource);
    candidateSources.push(toCandidateSource(currentSource, sourceCategory, generatedAt, "blocked", ""));
    if (isPlatformExemptCategory(candidateCategory) && currentSource.kill_switch === true) {
      const notes = "kill_switch_enabled";
      markSource(candidateSources.at(-1), "no_signal", notes);
      sourceResults.push(auditSource(currentSource.name, currentSource.url, "no_signal", notes, platformAuditSourceExtra(currentSource, { parsed_count: 0 })));
      continue;
    }
    if (currentSource.source_kind === "manual") {
      markSource(candidateSources.at(-1), "skipped_manual_review_required", "manual whitelist source");
      sourceResults.push(auditSource(currentSource.name, currentSource.url, "skipped_manual_review_required", "manual whitelist source; add reviewed items to the candidate pool with source_level metadata", platformAuditSourceExtra(currentSource)));
      continue;
    }
    const skipped = contentSourceSkipReason(currentSource, options.env || process.env);
    if (skipped) {
      markSource(candidateSources.at(-1), "blocked", skipped);
      sourceResults.push(auditSource(currentSource.name, currentSource.url, skipped, skipped, platformAuditSourceExtra(currentSource)));
      continue;
    }
    if (Date.now() - startedAt > budgetMs) {
      markSource(candidateSources.at(-1), "blocked", "budget_exceeded");
      sourceResults.push(auditSource(currentSource.name, currentSource.url, "blocked", "budget_exceeded", platformAuditSourceExtra(currentSource)));
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
        const sourceLookbackDays = Number.isInteger(currentSource.lookback_days) ? currentSource.lookback_days : lookbackDays;
        const datedEntries = result.entries
          .filter((entry) => entry.url && entry.title && isWithinReportWindow(entry.event_date, reportDate, sourceLookbackDays));
        const rejected = {};
        const entries = filterPlatformEntries(datedEntries, currentSource, candidateCategory, rejected);
        const sourceLimit = sourceMaxItemsPerRun(currentSource, perSourceLimit);
        for (const entry of entries.slice(0, sourceLimit)) {
          candidates.push(platformCandidateOrContentCandidate({
            id: uniqueCandidateId(candidates, `${currentSource.id}-${entry.title}`),
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
            ...(candidateCategory === "project" ? { signal: currentSource.signal || "github_report" } : {})
          }, entry, currentSource, candidates));
        }
        const status = entries.length > 0 ? result.status : "no_signal";
        const notes = appendPlatformRejectedNotes(`${result.notes}; ${entries.length} within ${sourceLookbackDays}d source window`, rejected);
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
      const response = await fetchImpl(contentSourceRequestUrl(currentSource, options.env || process.env, reportDate), {
        headers: {
          accept: "application/json, application/atom+xml, application/rss+xml, application/xml, text/xml, text/html, */*",
          "user-agent": "ai-daily-cn-static-publisher"
        },
        ...timeoutInit(currentSource.timeoutMs || currentSource.timeout_ms || 15000)
      });
      let responseText = "";
      let responseForRetryNote = response;
      let cacheFallbackNote = "";
      if (!response.ok) {
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
      } else {
        responseText = await response.text();
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
      const sourceLookbackDays = Number.isInteger(currentSource.lookback_days) ? currentSource.lookback_days : lookbackDays;
      const datedEntries = parsedEntries
        .filter((entry) => entry.url && entry.title && isWithinReportWindow(entry.event_date, reportDate, sourceLookbackDays));
      const rejected = {};
      const entries = filterPlatformEntries(datedEntries, currentSource, candidateCategory, rejected);
      const status = entries.length > 0 ? "checked" : "no_signal";
      let notes = cacheFallbackNote
        ? `${entries.length} recent ${entryLabel} entries parsed; ${cacheFallbackNote}`
        : withRetryNote(`${entries.length} recent ${entryLabel} entries parsed`, responseForRetryNote);
      notes = appendPlatformRejectedNotes(notes, rejected);
      let confirmedProductCrossChecks = 0;
      let unresolvedProductCrossChecks = 0;
      let skippedOriginalUrlChecks = 0;

      const sourceLimit = sourceMaxItemsPerRun(currentSource, perSourceLimit);
      for (const entry of entries.slice(0, sourceLimit)) {
        const originalUrl = originalRequiredUrlForEntry(entry, currentSource);
        if (requiresOriginalUrl(currentSource) && !originalUrl) {
          skippedOriginalUrlChecks += 1;
          continue;
        }
        let candidate = platformCandidateOrContentCandidate({
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
          ...contentCandidateImageFields(entry),
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
        notes = `${notes}; ${skippedOriginalUrlChecks} skipped without original URL`;
      }
      markSource(candidateSources.at(-1), status, notes);
      sourceResults.push(auditSource(currentSource.name, currentSource.url, status, notes, platformAuditSourceExtra(currentSource, { parsed_count: entries.length })));
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
      const sourceLookbackDays = Number.isInteger(currentSource.lookback_days) ? currentSource.lookback_days : lookbackDays;
      const datedEntries = parsedEntries
        .filter((entry) => entry.url && entry.title && isWithinReportWindow(entry.event_date, reportDate, sourceLookbackDays));
      const rejected = {};
      const entries = filterPlatformEntries(datedEntries, currentSource, contentSourceKinds(currentSource).candidateCategory, rejected);
      const status = entries.length > 0 ? "checked" : "no_signal";
      const sourceLimit = sourceMaxItemsPerRun(currentSource, perSourceLimit);
      let skippedOriginalUrlChecks = 0;
      for (const entry of entries.slice(0, sourceLimit)) {
        const originalUrl = originalRequiredUrlForEntry(entry, currentSource);
        if (requiresOriginalUrl(currentSource) && !originalUrl) {
          skippedOriginalUrlChecks += 1;
          continue;
        }
        candidates.push(platformCandidateOrContentCandidate({
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
          ...contentCandidateImageFields(entry)
        }, entry, currentSource, candidates));
      }
      const cacheNotes = appendPlatformRejectedNotes(`${entries.length} recent ${entryLabel} entries parsed; cache_fallback_used; original_error=${sanitizeNoteValue(notes)}; cached_at=${sanitizeNoteValue(cached.fetched_at)}${skippedOriginalUrlChecks > 0 ? `; ${skippedOriginalUrlChecks} skipped without original URL` : ""}`, rejected);
      markSource(candidateSources.at(-1), status, cacheNotes);
      sourceResults.push(auditSource(currentSource.name, currentSource.url, status, cacheNotes, platformAuditSourceExtra(currentSource, { parsed_count: entries.length })));
    }
  }
  const auditGroupName = platformExempt
    ? auditGroupForPlatform(platformExempt)
    : String(options.auditGroupName || "content_sources").trim() || "content_sources";

  const outputCandidates = limitCandidatesBySource(candidates, limit);

  return {
    source_audit: {
      [auditGroupName]: {
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
        notes: platformExempt
          ? `${platformExempt} platform exempt sources are gated by versioned host, keyword, exclude-keyword, date-window, max-item, and kill-switch rules. Items remain outside factual sections and disclose that no primary-source backtrace was performed.`
          : "Official labs, broad tech/big-tech newsrooms, engineering blogs, high-quality newsletters, interviews, aggregators, podcast platforms, intermediary/self-media leads, X-hotspot feeds, and product feeds are checked as content/project/community candidates. Intermediary and self-media leads are discovery-only until traced to primary sources. Product Hunt project candidates are cross-checked against product homepages, GitHub, README, or docs before they become easier project candidates. X-hotspot feeds must preserve original x.com/twitter.com URLs."
      }
    },
    sources: candidateSources,
    candidates: outputCandidates,
    evidence_assets: evidenceAssets
  };
}

function limitCandidatesBySource(candidates, limit) {
  if (!Number.isInteger(limit) || limit <= 0 || candidates.length <= limit) {
    return candidates;
  }

  const sourceOrder = [];
  const bySource = new Map();
  for (const candidate of candidates) {
    const key = candidate.source_id || candidate.source || candidate.url || "";
    if (!bySource.has(key)) {
      bySource.set(key, []);
      sourceOrder.push(key);
    }
    bySource.get(key).push(candidate);
  }

  const selected = [];
  for (let round = 0; selected.length < limit; round += 1) {
    let added = false;
    for (const key of sourceOrder) {
      const candidate = bySource.get(key)?.[round];
      if (!candidate) {
        continue;
      }
      selected.push(candidate);
      added = true;
      if (selected.length >= limit) {
        break;
      }
    }
    if (!added) {
      break;
    }
  }

  return selected;
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
      sourcesPath: options.registryPath || path.join("config", "sources"),
      includeEnablement: options.enablement || "core,optional"
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
    return source.verification_policy === PLATFORM_EXEMPT_POLICY &&
      candidatePlatform === platform &&
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
    evidence: summarizeEvidence(entry.summary || entry.description || entry.content || "", `${sourceInfo.name} platform entry passed deterministic rules.`),
    notes: appendSentence(candidate.notes, `platform_exempt=true; rule_id=${sanitizeNoteValue(platformFields.rule_id)}; primary_verification_required=false`),
    ...platformFields,
    verification_sources: []
  };
}

function filterPlatformEntries(entries, sourceInfo, candidateCategory, rejected) {
  if (!isPlatformExemptCategory(candidateCategory)) {
    return entries;
  }
  return entries.filter((entry) => {
    const reason = platformSourceRejectReason(entry, sourceInfo);
    if (!reason) {
      return true;
    }
    rejected[reason] = (rejected[reason] || 0) + 1;
    return false;
  });
}

function appendPlatformRejectedNotes(notes, rejected = {}) {
  const parts = Object.entries(rejected)
    .filter(([, count]) => count > 0)
    .map(([reason, count]) => `${reason}=${count}`);
  if (parts.length === 0) {
    return notes;
  }
  return appendSentence(notes, `platform_rejections: ${parts.join(", ")}`);
}

function platformAuditSourceExtra(sourceInfo, extra = {}) {
  const generic = {
    id: sourceInfo.id,
    source_kind: sourceInfo.source_kind,
    tier: sourceInfo.tier,
    authority: sourceInfo.authority,
    enablement: sourceInfo.enablement,
    verification_policy: sourceInfo.verification_policy,
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

function sourceMaxItemsPerRun(sourceInfo, fallback) {
  const camel = Number(sourceInfo.maxItemsPerRun);
  if (Number.isInteger(camel) && camel > 0) {
    return camel;
  }
  const snake = Number(sourceInfo.max_items_per_run);
  if (Number.isInteger(snake) && snake > 0) {
    return snake;
  }
  return fallback;
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
          category: "community_lead",
          title: `${currentSource.name}: ${entry.title}`,
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

function prioritizeGithubTrendingCandidatesForLimit(candidates, limit) {
  if (!Number.isInteger(limit) || limit <= 0 || candidates.length <= limit) {
    return candidates;
  }

  const selected = [];
  const seenRepos = new Set();
  const addCandidate = (candidate) => {
    const key = githubCandidateRepoKey(candidate);
    if (key && seenRepos.has(key)) {
      return false;
    }
    if (key) {
      seenRepos.add(key);
    }
    selected.push(candidate);
    return selected.length >= limit;
  };

  const weeklyAll = candidates
    .filter((candidate) => isGithubTrendingWeeklyAllCandidate(candidate))
    .sort(compareGithubTrendingCandidateRank)
    .slice(0, 10);
  for (const candidate of weeklyAll) {
    if (addCandidate(candidate)) return selected;
  }

  const languagePools = REQUIRED_GITHUB_TRENDING_WEEKLY_LANGUAGES.map((language) => candidates
    .filter((candidate) => isGithubTrendingWeeklyLanguageCandidate(candidate, language))
    .sort(compareGithubTrendingCandidateRank)
    .slice(0, 10));
  const maxPoolLength = Math.max(0, ...languagePools.map((pool) => pool.length));
  for (let index = 0; index < maxPoolLength; index += 1) {
    for (const pool of languagePools) {
      if (pool[index] && addCandidate(pool[index])) {
        return selected;
      }
    }
  }

  for (const candidate of candidates) {
    if (addCandidate(candidate)) {
      return selected;
    }
  }
  return selected;
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
    notes,
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
  return { name, url, status, notes, ...extra };
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
  if (sourceInfo.source_kind === GITHUB_REPORT_MARKDOWN_SOURCE_KIND) {
    return parseGitHubReportMarkdownEntries(content, sourceInfo);
  }
  if (sourceInfo.source_kind === HUGGINGFACE_DAILY_PAPERS_API_SOURCE_KIND && looksLikeJson(content)) {
    return parseHuggingFaceDailyPapersEntries(content, sourceInfo);
  }
  if (sourceInfo.source_kind === "search_api" && looksLikeJson(content)) {
    return parseJsonSearchApiEntries(content, sourceInfo);
  }
  return parseFeedEntries(content);
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
  if (latest.url && latest.url !== sourceInfo.url) {
    reportUrl = latest.url;
    reportTitle = latest.title || sourceInfo.name;
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
  if (!rawHref || rawHref.startsWith("#") || /^(?:mailto|javascript):/i.test(rawHref)) {
    return "";
  }
  try {
    const base = new URL(baseUrl);
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

function markdownLinks(markdown) {
  const links = [];
  const pattern = /(!)?\[([^\]]{1,220})\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
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
  const seen = new Set();
  const text = String(markdown || "");

  const tableRowPattern = /(?:^|\n)\s*\|\s*\d+\)\s+\*\*([^*]{2,180})\*\*\s*[-:：]?\s*([\s\S]*?)\|\s*([\s\S]*?)\s*\|/g;
  for (const match of text.matchAll(tableRowPattern)) {
    const link = markdownLinks(match[3]).find((candidate) => !candidate.image);
    if (!link) {
      continue;
    }
    addMarkdownReportEntry(entries, seen, {
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
    addMarkdownReportEntry(entries, seen, {
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
    addMarkdownReportEntry(entries, seen, {
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
    if (entries.length >= 30) {
      break;
    }
    addMarkdownReportEntry(entries, seen, {
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

  return entries.slice(0, 30);
}

function addMarkdownReportEntry(entries, seen, { title, href, summary, markdown, index, sourceInfo, reportUrl, eventDate, image }) {
  const url = resolveGitHubReportEntryUrl(href, reportUrl || sourceInfo.url);
  if (!isUsefulReportEntryUrl(url, sourceInfo) || image) {
    return;
  }
  const key = url.replace(/#.*$/, "");
  if (seen.has(key)) {
    return;
  }
  const cleanedTitle = cleanText(title);
  if (!cleanedTitle || isBoilerplateReportTitle(cleanedTitle)) {
    return;
  }
  seen.add(key);
  const localSummary = cleanText(summary) || markdownLineAround(markdown, index);
  entries.push({
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
  if (!isHttpUrl(url) || looksLikeImageUrl(url)) {
    return false;
  }
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const pathName = parsed.pathname.toLowerCase();
    if (/^(?:cdn\.|raw\.githubusercontent\.com$)/i.test(host) && looksLikeImageUrl(url)) {
      return false;
    }
    if (host === "github.com" && /\/(?:issues|pull|discussions)\/\d+$/i.test(pathName)) {
      return false;
    }
    const sourceHost = sourceInfo.url ? new URL(sourceInfo.url).hostname.toLowerCase() : "";
    if (sourceHost && host === sourceHost && /(?:readme|contributors|license|commits)/i.test(pathName)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function isBoilerplateReportTitle(title) {
  return /^(官网|更新发布|贡献者|推荐或自荐|subscribe|newsletter|readme|english|中文|日本語|paper|papers|tweet|tweets?|post|website|code|github|pdf|demo)$/i.test(title);
}

function markdownLineAround(markdown, index) {
  const text = String(markdown || "");
  const start = text.lastIndexOf("\n", Math.max(0, index - 1)) + 1;
  const end = text.indexOf("\n", index);
  return cleanText(text.slice(start, end >= 0 ? end : text.length)).slice(0, 360);
}

function markdownSectionForGitHubAnchor(markdown, hash) {
  const target = String(hash || "").replace(/^#/, "");
  if (!target) {
    return "";
  }
  const headingPattern = /^(#{1,6})\s+(.+)$/gm;
  const headings = [...String(markdown || "").matchAll(headingPattern)];
  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    if (githubMarkdownAnchor(heading[2]) !== target) {
      continue;
    }
    const level = heading[1].length;
    const start = heading.index || 0;
    const next = headings.slice(index + 1).find((candidate) => candidate[1].length <= level);
    return String(markdown || "").slice(start, next?.index || undefined);
  }
  return "";
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
  const topEntries = entries.slice(0, 10).map((entry) => ({
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
  if (!Array.isArray(entries) || entries.length !== 10) {
    return false;
  }
  return entries.every((entry, index) =>
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
  for (let index = 0; index < lines.length && entries.length < 10; index += 1) {
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
  const topEntries = entries.slice(0, 10).map((entry, index) => ({
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
    entries.length === 10 &&
    entries.every((entry, index) =>
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
      .slice(0, 10)
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

  for (let index = 0; index < scanLines.length && entries.length < 10; index += 1) {
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
  const topEntries = entries.slice(0, 10).map((entry) => ({
    rank: entry.rank,
    model: entry.model,
    provider: entry.provider,
    tokens: entry.tokens,
    change: entry.change
  }));
  const tabs = normalizeArtificialAnalysisComponentTabs(componentTabs, topEntries);
  const officialComponentSnapshot = extras.officialComponentSnapshot ||
    (topEntries.length === 10 ? artificialAnalysisOfficialComponentSnapshot(topEntries, sourceInfo, generatedAt) : null);
  return {
    type: "artificial_analysis_intelligence_index_public_page",
    collection_method: "public_page_playwright",
    snapshot_status: topEntries.length === 10 ? "complete" : topEntries.length > 0 ? "partial" : "blocked",
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
  return /arxiv|reddit/i.test(`${sourceInfo.id || ""} ${sourceInfo.name || ""} ${sourceInfo.url || ""}`);
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
  if (!isHackerNewsTopstoriesSource(sourceInfo)) {
    return entries;
  }

  const hydrated = [];
  for (const entry of entries.slice(0, Math.max(15, Number(sourceInfo.maxItemsPerRun) || 0))) {
    if (!entry.item_api_url) {
      hydrated.push(entry);
      continue;
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
        continue;
      }
      const item = JSON.parse(await response.text());
      const normalized = normalizeJsonApiEntry(item, sourceInfo);
      if (normalized.title && normalized.url && normalized.event_date) {
        hydrated.push(normalized);
      }
    } catch {
      continue;
    }
  }
  return hydrated;
}

function parseJsonSearchApiEntries(content, sourceInfo) {
  let payload;
  try {
    payload = JSON.parse(content);
  } catch {
    return [];
  }

  if (isHackerNewsTopstoriesSource(sourceInfo) && Array.isArray(payload)) {
    return payload
      .filter((id) => Number.isInteger(Number(id)))
      .slice(0, 30)
      .map((id) => ({
        item_api_url: `https://hacker-news.firebaseio.com/v0/item/${id}.json`
      }));
  }

  const items = isRedditSource(sourceInfo)
    ? ((payload?.data?.children || []).map((child) => child?.data || child))
    : arrayFromPossibleKeys(payload, ["results", "data", "items", "papers", "posts", "children"]);

  return items.map((item) => normalizeJsonApiEntry(item, sourceInfo)).filter((entry) => entry.title && entry.url);
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
    .filter((entry) => entry.title && entry.url);
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

  const idUrl = sourceInfo.id === "content-hacker-news-api" && item.id
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

  return {
    title: cleanText(firstString(item.title, item.name, item.paper_title)),
    url,
    event_date: jsonDateOnly(firstString(item.published, item.published_at, item.date, item.created_at, item.createdAt, item.updated_at, item.time, item.created_utc)),
    summary,
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

function isHackerNewsTopstoriesSource(sourceInfo = {}) {
  return sourceInfo.id === "content-hacker-news-api" || /hacker-news\.firebaseio\.com\/v0\/topstories\.json/i.test(sourceInfo.url || "");
}

function isRedditSource(sourceInfo = {}) {
  return /reddit\.com\/r\/[^/]+\/\.json/i.test(sourceInfo.url || "");
}

function parseHtmlIndexEntries(html, sourceInfo = {}) {
  const entries = [];
  const seenUrls = new Set();
  const structuredMetadata = htmlIndexStructuredMetadata(html, sourceInfo.url);
  const anchorPattern = /<a\b[^>]*href=(?:"([^"]+)"|'([^']+)'|([^'"\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(anchorPattern)) {
    const rawHref = decodeXml(match[1] || match[2] || match[3] || "");
    const url = absoluteUrl(rawHref, sourceInfo.url);
    if (!url || seenUrls.has(url) || !matchesSourceLink(rawHref, url, sourceInfo)) {
      continue;
    }

    const forwardBlock = html.slice(match.index, Math.min(html.length, match.index + 1800));
    const surroundingBlock = html.slice(Math.max(0, match.index - 600), Math.min(html.length, match.index + 1800));
    const metadata = structuredMetadata.get(htmlIndexMetadataKey(url));
    const anchorTitle = extractHtmlTitle(match[4]);
    const title = genericHtmlAnchorTitle(anchorTitle)
      ? metadata?.title || extractHtmlTitle(forwardBlock)
      : anchorTitle || metadata?.title || extractHtmlTitle(forwardBlock);
    const eventDate = extractHtmlDate(forwardBlock) || extractHtmlDate(surroundingBlock) || metadata?.event_date;
    if (!title || !eventDate) {
      continue;
    }

    const imageUrl = extractHtmlImageUrl(forwardBlock, url) || metadata?.image_url || "";
    seenUrls.add(url);
    entries.push({
      title,
      url,
      event_date: eventDate,
      summary: metadata?.summary || extractHtmlSummary(forwardBlock),
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
  return normalizeFeedEntry({
    title: xmlText(block, "title"),
    url,
    date: xmlText(block, "updated") || xmlText(block, "published"),
    summary,
    image_url: extractFeedImageUrl(block, url) || extractHtmlImageUrl(summary, url),
    image_source: "feed"
  });
}

function parseRssItem(block) {
  const url = xmlText(block, "link") || atomLink(block);
  const summary = xmlText(block, "description") || xmlText(block, "encoded") || xmlText(block, "summary");
  return normalizeFeedEntry({
    title: xmlText(block, "title"),
    url,
    date: xmlText(block, "pubDate") || xmlText(block, "date") || xmlText(block, "updated"),
    summary,
    image_url: extractFeedImageUrl(block, url) || extractHtmlImageUrl(summary, url),
    image_source: "feed"
  });
}

function normalizeFeedEntry(entry) {
  const url = cleanText(entry.url);
  const rawSummary = entry.summary || "";
  const imageUrl = normalizeImageUrl(entry.image_url, url);
  return {
    title: cleanText(entry.title),
    url,
    event_date: dateOnly(entry.date),
    summary: cleanText(rawSummary),
    links: extractHtmlLinks(rawSummary, url),
    ...(imageUrl ? { image_url: imageUrl, image_source: entry.image_source || "feed" } : {})
  };
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

function extractHtmlImageUrl(html, baseUrl) {
  const decoded = decodeXml(html);
  const metaTag =
    decoded.match(/<meta\b[^>]*(?:property|name)=["'](?:og:image|twitter:image|twitter:image:src)["'][^>]*>/i)?.[0] ||
    decoded.match(/<meta\b[^>]*content=["'][^"']+["'][^>]*(?:property|name)=["'](?:og:image|twitter:image|twitter:image:src)["'][^>]*>/i)?.[0] ||
    "";
  const metaImage = metaTag ? extractAttribute(metaTag, "content") : "";
  if (metaImage) {
    return normalizeImageUrl(metaImage, baseUrl);
  }

  for (const match of decoded.matchAll(/<(?:img|source)\b[^>]*>/gi)) {
    const tag = match[0];
    const src = extractAttribute(tag, "src") || firstSrcsetUrl(extractAttribute(tag, "srcset"));
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

function extractAttribute(tag, name) {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]+)"|'([^']+)'|([^\\s>]+))`, "i");
  const match = String(tag || "").match(pattern);
  return decodeXml(match?.[1] || match?.[2] || match?.[3] || "");
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
  return String(value).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]*(?:>|$)/g, " ");
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
    .replace(/^(?:(?:[A-Z][a-z]+\.?\s+\d{1,2},\s+\d{4}|\d{4}[.-]\d{2}[.-]\d{2})\s+)?(?:Announcements|Blog|Company|Featured|Product|Research)\s+/i, "")
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
