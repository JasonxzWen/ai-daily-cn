import fs from "node:fs/promises";
import path from "node:path";

const GITHUB_BASE_URL = "https://github.com";

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
          byRepo.set(candidate.repo, candidate);
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
        byRepo.set(candidate.repo, candidate);
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

function source(name, url, language, window) {
  return { name, url, language, window };
}

function normalizeRepo(value) {
  return value
    .replace(/^\/+/, "")
    .split("/")
    .slice(0, 2)
    .map((part) => decodeURIComponent(part.trim()))
    .join("/");
}

function extractFirstParagraph(block) {
  const paragraph = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i)?.[1] || "";
  return paragraph
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
