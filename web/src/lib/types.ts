export type Article = {
  id: string;
  title: string;
  url: string;
  summary: string;
  date: string;
  month: string;
  source: string;
  section: string;
  report_date: string;
  report_url: string;
  data_url: string;
  quality_score: number;
  importance: "major" | "notable" | "general";
  domain: string;
  flavors: string[];
  channels_l1: string[];
  channels_l2: string[];
  companies: string[];
  products: string[];
};

export type TopicSummary = {
  id: string;
  label: string;
  count: number;
  article_ids: string[];
  sources: string[];
  latest_date: string;
  accent: string;
};

export type TodayData = {
  schema_version: number;
  generated_at: string;
  report_date: string;
  title: string;
  summary: string;
  stats: {
    article_count: number;
    source_count: number;
    topic_count: number;
    aify_count: number;
  };
  top_article_ids: string[];
  articles: Article[];
  top_topics: TopicSummary[];
};

export type TopicsData = {
  schema_version: number;
  generated_at: string;
  topics: TopicSummary[];
};

export type SourceSummary = {
  id: string;
  name: string;
  url: string;
  source_kind: string;
  authority: string;
  tier: string;
  article_count: number;
  latest_article_date: string;
  latest_article_ids: string[];
  status: "checked" | "blocked" | "no_signal" | "not_configured_or_skipped";
};

export type SourcesData = {
  schema_version: number;
  generated_at: string;
  source_registry_version: number;
  sources: SourceSummary[];
};

export type RuntimeData = {
  schema_version: number;
  generated_at: string;
  build_id: string;
  mode: string;
  report_date: string;
  final_status: "ready" | "degraded";
  artifacts: Array<{
    path: string;
    count: number;
    hash: string;
  }>;
  source_inputs: Array<{
    id: string;
    name: string;
    url: string;
    status: "checked" | "blocked" | "not_configured_or_skipped";
    article_count: number;
  }>;
};

export type AppData = {
  today: TodayData;
  articles: Article[];
  topics: TopicsData;
  sources: SourcesData;
  runtime: RuntimeData;
};
