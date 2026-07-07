import type { AppData } from "./types";

const DATA_PATHS = {
  today: "data/today.json",
  articles: "data/articles.json",
  topics: "data/topics.json",
  sources: "data/sources.json",
  runtime: "data/runtime.json"
} as const;

export async function loadAppData(): Promise<AppData> {
  const [today, articles, topics, sources, runtime] = await Promise.all([
    fetchJson(DATA_PATHS.today),
    fetchJson(DATA_PATHS.articles),
    fetchJson(DATA_PATHS.topics),
    fetchJson(DATA_PATHS.sources),
    fetchJson(DATA_PATHS.runtime)
  ]);

  return {
    today,
    articles,
    topics,
    sources,
    runtime
  } as AppData;
}

async function fetchJson(path: string) {
  const response = await fetch(relativeUrl(path), {
    headers: {
      accept: "application/json"
    }
  });
  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}`);
  }
  return response.json();
}

function relativeUrl(path: string) {
  return new URL(path, window.location.href).toString();
}
