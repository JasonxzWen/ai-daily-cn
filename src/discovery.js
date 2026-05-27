import fs from "node:fs/promises";
import path from "node:path";

const GITHUB_BASE_URL = "https://github.com";
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
    id: "content-microsoft-research",
    name: "Microsoft Research Blog",
    url: "https://www.microsoft.com/en-us/research/feed/"
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

export async function collectGitHubTrending(options = {}) {
  if (options.browserExportPath || options.browserExport) {
    return collectGitHubTrendingFromBrowserExport(options);
  }

  const fetchImpl = options.fetchImpl || globalThis.fetch;
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
          notes: `HTTP ${response.status}`
        });
        continue;
      }

      const html = await response.text();
      const parsed = parseGitHubTrendingHtml(html, currentSource);
      sourceResults.push({
        name: currentSource.name,
        url: currentSource.url,
        status: parsed.length > 0 ? "checked" : "no_signal",
        notes: `${parsed.length} repositories parsed`
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
        notes: error.message
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

  const candidates = [...byRepo.values()].slice(0, limit);
  return {
    source_audit: {
      github_trending: {
        checked: true,
        sources: sourceResults,
        candidates_found: byRepo.size,
        included: 0,
        notes: "Candidates require release, star velocity, notable PR, recent commit, or runnable artifact review before inclusion."
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

  return {
    source_audit: {
      github_trending: {
        checked: true,
        sources: sourceResults,
        candidates_found: byRepo.size,
        included: 0,
        notes: "Candidates parsed from browser-export input; still require release, star velocity, notable PR, recent commit, or runnable artifact review before inclusion."
      }
    },
    candidates: [...byRepo.values()].slice(0, limit)
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
        notes: `HTTP ${response.status}`
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
      notes: `${parsed.length} repositories parsed from OSSInsight API fallback`
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
      notes: error.message
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
      description,
      evidence: score ? `${repo} appeared in OSSInsight trending with score ${score}.` : `${repo} appeared in OSSInsight trending.`
    });
  }
  return candidates;
}

export async function collectBuilderFallbacks(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
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
        markSource(candidateSources.at(-1), "blocked", `HTTP ${response.status}`);
        sourceResults.push(auditSource(currentSource.name, currentSource.url, "blocked", `HTTP ${response.status}`));
        continue;
      }

      const entries = parseFeedEntries(await response.text())
        .filter((entry) => entry.url && entry.title && isWithinReportWindow(entry.event_date, reportDate, lookbackDays))
        .slice(0, limit);
      const status = entries.length > 0 ? "checked" : "no_signal";
      const notes = `${entries.length} recent original entries parsed`;
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
      markSource(candidateSources.at(-1), "blocked", error.message);
      sourceResults.push(auditSource(currentSource.name, currentSource.url, "blocked", error.message));
    }
  }

  return {
    source_audit: {
      builder_sources: {
        checked: true,
        sources: sourceResults,
        candidates_found: candidates.length,
        included: 0,
        blocked_reason: candidates.length > 0 ? "" : inferBuilderBlockedReason(sourceResults),
        last_successful_feed_at: candidates.length > 0 ? generatedAt : null,
        notes: followBuildersFeeds
          ? "follow-builders central feed is checked before fixed RSS/Atom fallback; each candidate keeps an original URL."
          : "Fixed original-source fallback; each candidate comes from a directly fetched RSS/Atom feed."
      }
    },
    sources: candidateSources,
    candidates: candidates.slice(0, limit)
  };
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
      markSource(candidateSources.at(-1), "blocked", `HTTP ${response.status}`);
      sourceResults.push(auditSource(sourceItem.name, sourceItem.url, "blocked", `HTTP ${response.status}`));
      return;
    }

    const allParsed = parser(await readJsonResponse(response), {
      sourceItem,
      reportDate,
      lookbackDays
    });
    const parsed = allParsed.slice(0, Math.max(limit - candidates.length, 0));
    const status = allParsed.length > 0 ? "checked" : "no_signal";
    const notes = `${allParsed.length} recent original entries parsed`;
    markSource(candidateSources.at(-1), status, notes);
    sourceResults.push(auditSource(sourceItem.name, sourceItem.url, status, notes));

    for (const entry of parsed) {
      candidates.push({
        ...entry,
        id: uniqueCandidateId(candidates, entry.id || `${sourceItem.id}-${entry.title}`)
      });
    }
  } catch (error) {
    markSource(candidateSources.at(-1), "blocked", error.message);
    sourceResults.push(auditSource(sourceItem.name, sourceItem.url, "blocked", error.message));
  }
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
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("fetch is not available in this runtime");
  }

  const reportDate = requireReportDate(options.reportDate);
  const generatedAt = options.generatedAt || new Date().toISOString();
  const sources = await loadSources(options.sources, options.sourcesPath, DEFAULT_CONTENT_SOURCES);
  const sourceResults = [];
  const candidateSources = [];
  const candidates = [];
  const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : 20;
  const lookbackDays = Number.isInteger(options.lookbackDays) ? options.lookbackDays : 2;

  for (const rawSource of sources) {
    const currentSource = normalizeGenericSource(rawSource, "content");
    const sourceCategory = currentSource.category === "project" ? "project" : "blog";
    const candidateCategory = currentSource.category === "project" ? "project" : "hot_blog";
    candidateSources.push(toCandidateSource(currentSource, sourceCategory, generatedAt, "blocked", ""));

    try {
      const response = await fetchImpl(currentSource.url, {
        headers: {
          accept: "application/atom+xml, application/rss+xml, application/xml, text/xml, text/html, */*",
          "user-agent": "ai-daily-cn-static-publisher"
        }
      });
      if (!response.ok) {
        markSource(candidateSources.at(-1), "blocked", `HTTP ${response.status}`);
        sourceResults.push(auditSource(currentSource.name, currentSource.url, "blocked", `HTTP ${response.status}`));
        continue;
      }

      const entries = parseContentSourceEntries(await response.text(), currentSource)
        .filter((entry) => entry.url && entry.title && isWithinReportWindow(entry.event_date, reportDate, lookbackDays));
      const status = entries.length > 0 ? "checked" : "no_signal";
      const notes = `${entries.length} recent ${candidateCategory === "project" ? "product/project" : "blog/interview"} entries parsed`;
      markSource(candidateSources.at(-1), status, notes);
      sourceResults.push(auditSource(currentSource.name, currentSource.url, status, notes));

      for (const entry of entries.slice(0, Math.max(limit - candidates.length, 0))) {
        candidates.push({
          id: uniqueCandidateId(candidates, `${currentSource.id}-${entry.title}`),
          source_id: currentSource.id,
          category: candidateCategory,
          title: entry.title,
          url: entry.url,
          source: currentSource.name,
          event_date: entry.event_date,
          status: "excluded",
          evidence: summarizeEvidence(entry.summary, `${currentSource.name} published this ${candidateCategory === "project" ? "product/project" : "blog/interview"} entry.`),
          ...(candidateCategory === "project" ? { signal: currentSource.signal || "product_hunt" } : {})
        });
      }
    } catch (error) {
      markSource(candidateSources.at(-1), "blocked", error.message);
      sourceResults.push(auditSource(currentSource.name, currentSource.url, "blocked", error.message));
    }
  }

  return {
    source_audit: {
      content_sources: {
        checked: true,
        sources: sourceResults,
        candidates_found: candidates.length,
        included: 0,
        blocked_reason: candidates.length > 0 ? "" : inferBuilderBlockedReason(sourceResults),
        last_successful_feed_at: candidates.length > 0 ? generatedAt : null,
        notes: "Official labs, engineering blogs, high-quality newsletters, interviews, aggregators, and product feeds are checked as content/project candidates."
      }
    },
    sources: candidateSources,
    candidates: candidates.slice(0, limit)
  };
}

export async function collectStatuspageIncidents(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
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
        markSource(candidateSources.at(-1), "blocked", `HTTP ${response.status}`);
        continue;
      }

      const entries = parseFeedEntries(await response.text())
        .filter((entry) => entry.url && entry.title && isWithinReportWindow(entry.event_date, reportDate, lookbackDays))
        .slice(0, limit);
      markSource(candidateSources.at(-1), entries.length > 0 ? "checked" : "no_signal", `${entries.length} recent incidents parsed`);

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
      markSource(candidateSources.at(-1), "blocked", error.message);
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
    candidates.push({
      repo,
      url: `${GITHUB_BASE_URL}/${repo}`,
      source: sourceInfo.name || "GitHub Trending",
      source_url: sourceInfo.url || "",
      signal: "trending",
      language: sourceInfo.language || "",
      window: sourceInfo.window || "",
      description,
      evidence: `${repo} appeared on ${sourceInfo.name || "GitHub Trending"}.`
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
    status: candidate.status || "excluded"
  };
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

function inferBuilderBlockedReason(sourceResults) {
  if (sourceResults.some((sourceResult) => sourceResult.status === "blocked")) {
    return "fetch_failed";
  }
  return "no_recent_signal";
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
  return {
    title: cleanText(entry.title),
    url: cleanText(entry.url),
    event_date: dateOnly(entry.date),
    summary: cleanText(entry.summary)
  };
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
