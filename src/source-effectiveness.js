import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadSourceRegistrySync } from "./source-registry.js";

export const CORE_SOURCE_CONTRACTS = [
  {
    id: "openai-news",
    name: "OpenAI News RSS",
    role: "official",
    notes: "canonical_rss=https://openai.com/news/rss.xml; legacy_alias=https://openai.com/blog/rss.xml is grouped here to avoid duplicate source accounting",
    aliases: ["content-openai-news-rss", "openai news rss", "openai blog rss", "openai.com/news", "openai.com/blog/rss.xml", "openai.com/news/rss.xml"]
  },
  {
    id: "google-deepmind",
    name: "Google DeepMind RSS",
    role: "official",
    aliases: ["google deepmind", "deepmind.google", "deepmind rss"]
  },
  {
    id: "google-research",
    name: "Google Research Blog",
    role: "official",
    aliases: ["google research", "research.google", "google research blog"]
  },
  {
    id: "meta-ai",
    name: "Meta AI Blog",
    role: "official",
    notes: "rss_not_available_404=https://ai.meta.com/blog/rss/; strategy=html_index:https://ai.meta.com/blog/",
    aliases: ["meta ai", "ai.meta.com", "meta ai blog"]
  },
  {
    id: "microsoft-research",
    name: "Microsoft Research Blog",
    role: "official",
    aliases: ["microsoft research", "microsoft.com/en-us/research"]
  },
  {
    id: "apple-ml-research",
    name: "Apple Machine Learning Research",
    role: "official",
    aliases: ["content-apple-machine-learning", "apple machine learning research", "apple ml research", "machinelearning.apple.com"]
  },
  {
    id: "aws-ml",
    name: "AWS ML Blog",
    role: "official",
    aliases: ["aws ml", "aws machine learning", "aws.amazon.com/blogs/machine-learning"]
  },
  {
    id: "anthropic-news",
    name: "Anthropic News",
    role: "official",
    aliases: ["anthropic news", "anthropic.com/news"]
  },
  {
    id: "anthropic-research-engineering",
    name: "Anthropic Research and Engineering",
    role: "official",
    aliases: [
      "content-anthropic-research",
      "content-anthropic-engineering",
      "anthropic research",
      "anthropic engineering",
      "anthropic.com/research",
      "anthropic.com/engineering"
    ]
  },
  {
    id: "meta-engineering",
    name: "Meta Engineering",
    role: "official",
    aliases: ["content-meta-engineering", "meta engineering", "engineering.fb.com"]
  },
  {
    id: "nvidia-ai-developer",
    name: "NVIDIA AI Developer Blog",
    role: "official",
    aliases: ["content-nvidia-developer-blog", "nvidia developer blog", "nvidia ai developer", "developer.nvidia.com/blog"]
  },
  {
    id: "hugging-face-blog",
    name: "Hugging Face Blog",
    role: "official",
    aliases: ["hugging face blog", "huggingface.co/blog", "huggingface blog feed"]
  },
  {
    id: "xai-news",
    name: "xAI News",
    role: "official",
    aliases: ["content-xai-news", "content-xai-company-news", "xai news", "x.ai/news"]
  },
  {
    id: "deepseek-official",
    name: "DeepSeek Official",
    role: "china_model_official",
    aliases: ["china-ai-deepseek-news", "deepseek news", "api-docs.deepseek.com/news", "api-docs.deepseek.com/updates"]
  },
  {
    id: "qwen-official",
    name: "Qwen Official",
    role: "china_model_official",
    aliases: ["china-ai-qwen-blog", "content-qwen-blog", "qwen blog", "qwen.ai/blog"]
  },
  {
    id: "kimi-official",
    name: "Kimi Official",
    role: "china_model_official",
    aliases: [
      "china-ai-kimi-blog",
      "content-moonshot-kimi-company-news",
      "content-kimi-official-blog-company-news",
      "content-kimi-platform-blog",
      "content-kimi-technical-blog",
      "kimi blog",
      "platform.kimi.com/blog",
      "www.kimi.com/blog"
    ]
  },
  {
    id: "minimax-official",
    name: "MiniMax Official",
    role: "china_model_official",
    aliases: [
      "china-ai-minimax-blog",
      "content-minimax-company-news",
      "content-minimax-news",
      "content-minimax-blog",
      "minimax blog",
      "minimax news",
      "minimax.io/blog",
      "minimax.io/news"
    ]
  },
  {
    id: "zhipu-official",
    name: "Zhipu Official",
    role: "china_model_official",
    aliases: [
      "china-ai-zhipu-news",
      "content-zhipu-zh-news",
      "content-zhipu-research",
      "zhipu ai news",
      "z.ai research",
      "zhipuai.cn/zh/news",
      "zhipuai.cn/en/research"
    ]
  },
  {
    id: "follow-builders",
    name: "follow-builders X feed",
    role: "builder_aggregator",
    aliases: ["github-watch-follow-builders-x", "follow-builders x feed", "feed-x.json"]
  },
  {
    id: "github-watch-ai-news-radar",
    name: "ai-news-radar GitHub watch",
    role: "github_watch",
    notes: "Repository watchlist requested by the user; probe 2026-07-01 confirmed master commits Atom is the usable daily surface.",
    aliases: ["github-watch-ai-news-radar-commits", "learnprompt/ai-news-radar", "ai-news-radar github commits"]
  },
  {
    id: "github-watch-follow-builders",
    name: "follow-builders GitHub watch",
    role: "github_watch",
    notes: "Repository watchlist requested by the user; commit Atom plus raw X/podcast/blog JSON surfaces are monitored, with X feed also represented by the builder row.",
    aliases: ["github-watch-follow-builders-commits", "github-watch-follow-builders-podcasts", "github-watch-follow-builders-blogs", "zarazhangrui/follow-builders"]
  },
  {
    id: "github-watch-ai-news-agent",
    name: "ai-news-agent GitHub watch",
    role: "github_watch",
    notes: "Repository watchlist requested by the user; probe 2026-07-01 confirmed main commits Atom is usable.",
    aliases: ["github-watch-ai-news-agent-commits", "nickzren/ai-news-agent", "ai-news-agent github commits"]
  },
  {
    id: "github-watch-ml-news-of-the-week",
    name: "ML News of the Week GitHub watch",
    role: "github_watch",
    notes: "Recommended weekly source. README is large and weekly, so it should inform selection without becoming daily filler.",
    aliases: ["github-watch-ml-news-of-the-week-readme", "github-watch-ml-news-of-the-week-commits", "salvatorera/ml-news-of-the-week", "ml news of the week"]
  },
  {
    id: "ml-papers-week",
    name: "ML Papers of the Week",
    role: "open_source_aggregator",
    aliases: ["ml papers of the week", "dair-ai/ml-papers-of-the-week"]
  },
  {
    id: "arxiv-papers",
    name: "arXiv AI Papers",
    role: "paper_api",
    aliases: ["content-arxiv-cs-ai", "content-arxiv-cs-cl", "content-arxiv-cs-lg", "content-arxiv-cs-ma", "content-arxiv-stat-ml", "arxiv cs.ai", "arxiv cs.cl", "arxiv cs.lg", "arxiv cs.ma", "arxiv stat.ml", "export.arxiv.org"]
  },
  {
    id: "huggingface-daily-papers",
    name: "Hugging Face Daily Papers",
    role: "paper_api",
    aliases: ["content-huggingface-daily-papers", "hugging face daily papers", "huggingface.co/api/daily_papers", "huggingface.co/papers"]
  },
  {
    id: "techcrunch-ai",
    name: "TechCrunch AI",
    role: "media",
    aliases: ["techcrunch ai", "techcrunch.com/category/artificial-intelligence"]
  },
  {
    id: "the-verge",
    name: "The Verge",
    role: "media",
    aliases: ["the verge", "theverge.com"]
  },
  {
    id: "mit-technology-review",
    name: "MIT Technology Review",
    role: "media",
    aliases: ["mit technology review", "technologyreview.com"]
  },
  {
    id: "ars-technica",
    name: "Ars Technica",
    role: "media",
    aliases: ["ars technica", "arstechnica.com"]
  },
  {
    id: "venturebeat-ai",
    name: "VentureBeat AI",
    role: "media",
    aliases: ["venturebeat ai", "venturebeat.com/category/ai"]
  },
  {
    id: "hacker-news",
    name: "Hacker News",
    role: "community_api",
    aliases: ["hacker news", "hnrss", "topstories", "hacker-news.firebaseio.com"]
  },
  {
    id: "community-hotspots",
    name: "Community Hotspots",
    role: "community_rss",
    notes: "Bottom-of-report community pulse requested by the user. HNRSS is usable; Reddit RSS failures stay internal diagnostics unless selected content affects readers.",
    aliases: ["community-hn-frontpage-100", "community-hn-ai-newest", "community-reddit-machinelearning", "community-reddit-localllama", "community-reddit-singularity", "community-reddit-artificial", "hnrss.org/frontpage?points=100", "hnrss.org/newest?q=ai", "reddit.com/r/machinelearning", "reddit.com/r/localllama", "reddit.com/r/singularity", "reddit.com/r/artificial"]
  },
  {
    id: "chinese-direct-rss",
    name: "Chinese direct RSS",
    role: "chinese_media",
    notes: "Directly reachable Chinese RSS sources are retained; Jiqizhixin stays on the working articles index until its /rss endpoint returns XML.",
    aliases: ["intermediary-qbitai", "intermediary-36kr", "intermediary-infoq-cn", "intermediary-jiqizhixin", "qbitai", "36kr.com/feed", "infoq.cn/feed", "jiqizhixin"]
  },
  {
    id: "github-org-watch",
    name: "GitHub Organization Watch",
    role: "github_watch",
    notes: "Official organization/repository Atom feeds are monitored separately from GitHub Trending and only count when recent parsed repository events produce candidates.",
    aliases: ["github organization", "github org", "github_atom", "github atom", "content github"]
  },
  {
    id: "github-trending",
    name: "GitHub Trending",
    role: "github_trending",
    aliases: ["github trending", "github.com/trending", "ossinsight trending"]
  },
  {
    id: "openrouter-rankings",
    name: "OpenRouter Rankings",
    role: "tracking_metric",
    aliases: ["content-openrouter-rankings", "openrouter rankings", "openrouter_rankings_public_playwright", "openrouter.ai/rankings"]
  },
  {
    id: "artificial-analysis-index",
    name: "Artificial Analysis Intelligence Index",
    role: "tracking_metric",
    aliases: ["content-artificial-analysis-intelligence-index", "artificial analysis intelligence index", "artificial analysis", "artificial_analysis_index_public_playwright"]
  },
  {
    id: "swe-bench-pro",
    name: "SWE-Bench Pro",
    role: "tracking_metric",
    aliases: ["content-swe-bench-pro-public", "swe-bench pro", "swe bench pro", "scale labs swe-bench pro", "swe_bench_pro_public_playwright"]
  }
];

const PUBLIC_REPORT_SECTIONS = [
  "stories",
  "main_items",
  "github_trending",
  "huggingface_trending",
  "hot_blogs",
  "chinese_media_dynamics",
  "daily_tracking",
  "projects",
  "builder_observations",
  "official_org_updates",
  "community_leads",
  "wechat_items",
  "zhihu_items",
  "reddit_items"
];

const REACHABLE_STATUSES = new Set(["checked", "no_signal"]);
const SKIPPED_SOURCE_STATUSES = new Set([
  "skipped_missing_token",
  "skipped_missing_base_url",
  "skipped_manual_source",
  "skipped_manual_review_required"
]);
const DEFAULT_DISPLAY_SECTION = {
  id: "uncategorized",
  label: "未分组信源",
  rank: 999,
  default_display_mode: "collapsed"
};
export const SOURCE_FIRST_PRESENTATION_SECTION_RICH_IDS = Object.freeze({
  source_signal_story: "source-signal-story",
  source_first_dashboard: "source-first-dashboard",
  source_status_focus: "source-status-focus",
  source_map: "source-map",
  source_inventory: "source-inventory"
});
export const SOURCE_DISPLAY_CONTRACT = loadSourceDisplayContract();
const SOURCE_DISPLAY_BY_ID = sourceDisplayIndex(SOURCE_DISPLAY_CONTRACT);
const SOURCE_DISPLAY_SECTION_BY_ID = sourceDisplaySectionIndex(SOURCE_DISPLAY_CONTRACT);

export function buildSourceEffectivenessTable({ report = {}, candidates = [] } = {}) {
  const auditSources = collectAuditSources(report?.source_audit);
  const rows = CORE_SOURCE_CONTRACTS.map((contract) => {
    const sources = auditSources.filter((source) => sourceMatchesContract(source, contract));
    const activeSources = contract.requires_real_configuration
      ? sources.filter((source) => !isInactivePlaceholderSource(source))
      : sources;
    const candidateSources = contract.requires_real_configuration ? activeSources : sources;
    const matchedCandidates = contract.requires_real_configuration && activeSources.length === 0
      ? []
      : Array.isArray(candidates)
      ? candidates.filter((candidate) => candidateMatchesContract(candidate, contract, candidateSources))
      : [];
    const publicIncluded = sourceIncludedPublicly(report, contract, candidateSources, matchedCandidates);
    const configured = sources.length > 0 && (contract.requires_real_configuration ? activeSources.length > 0 : true);
    const reachable = configured && activeSources.some((source) => REACHABLE_STATUSES.has(String(source.status || "")));
    const parsedRecent = configured && activeSources.some(sourceHasRecentParsedSignal);
    const candidateCreated = matchedCandidates.length > 0;
    return {
      id: contract.id,
      name: contract.name,
      role: contract.role,
      configured,
      reachable,
      parsed_recent: parsedRecent,
      candidate_created: candidateCreated,
      public_included: publicIncluded,
      not_included_reason: publicIncluded ? "" : sourceNotIncludedReason({ configured, reachable, parsedRecent, candidateCreated, sources }),
      source_ids: uniqueStrings(sources.map((source) => source.id).filter(Boolean)),
      source_kinds: uniqueStrings(sources.map((source) => source.source_kind).filter(Boolean)),
      statuses: uniqueStrings(sources.map((source) => source.status).filter(Boolean)),
      candidate_count: matchedCandidates.length,
      included_count: matchedCandidates.filter(candidateIncludedPublicly).length,
      notes: sourceEffectivenessNotes(contract, sources)
    };
  });
  return decorateSourceEffectivenessRows(rows);
}

export function buildSourceInventoryRows(options = {}) {
  const rootDir = resolveSourceInventoryRootDir(options);
  const registry = loadSourceRegistrySync({
    rootDir,
    sourcesPath: options.sourcesPath || "config/sources",
    includeEnablement: options.includeEnablement || "core,optional,manual"
  });
  return registry.sources
    .map((source, index) => sourceInventoryRow(source, index))
    .sort(compareSourceInventoryRows);
}

export function sourceFirstPresentationContract(override) {
  const presentation = override && typeof override === "object"
    ? override
    : SOURCE_DISPLAY_CONTRACT.presentation_contract;
  const order = Array.isArray(presentation?.source_first_section_order)
    ? presentation.source_first_section_order.map((id) => String(id || "").trim()).filter(Boolean)
    : [];
  const knownIds = Object.keys(SOURCE_FIRST_PRESENTATION_SECTION_RICH_IDS);
  const unknown = order.filter((id) => !Object.hasOwn(SOURCE_FIRST_PRESENTATION_SECTION_RICH_IDS, id));
  if (unknown.length > 0) {
    throw new Error(`unknown source-first presentation section id: ${uniqueStrings(unknown).join(", ")}`);
  }
  const missing = knownIds.filter((id) => !order.includes(id));
  if (missing.length > 0) {
    throw new Error(`missing source-first presentation section id: ${missing.join(", ")}`);
  }
  const duplicates = uniqueStrings(order.filter((id, index) => order.indexOf(id) !== index));
  if (duplicates.length > 0) {
    throw new Error(`duplicate source-first presentation section id: ${duplicates.join(", ")}`);
  }
  return {
    ...presentation,
    first_viewport_order: Array.isArray(presentation?.first_viewport_order)
      ? [...presentation.first_viewport_order]
      : [],
    source_first_section_order: order
  };
}

export function sourceFirstPresentationRichId(sectionId) {
  const richId = SOURCE_FIRST_PRESENTATION_SECTION_RICH_IDS[sectionId];
  if (!richId) {
    throw new Error(`unknown source-first presentation section id: ${sectionId}`);
  }
  return richId;
}

export function sourceFirstPresentationRichIds(presentation) {
  return sourceFirstPresentationContract(presentation)
    .source_first_section_order
    .map(sourceFirstPresentationRichId);
}

function resolveSourceInventoryRootDir(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const sourcesPath = options.sourcesPath || "config/sources";
  if (pathExists(path.resolve(rootDir, sourcesPath))) {
    return rootDir;
  }
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

export function decorateSourceEffectivenessRows(rows = []) {
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows
    .map((row, rowIndex) => {
      const display = sourceDisplayMetadata(row, rowIndex);
      return {
        ...row,
        display_section: display.sectionId,
        display_section_label: display.sectionLabel,
        display_section_rank: display.sectionRank,
        display_rank: display.rank,
        display_mode: display.mode,
        status_label: isValidSourceDisplayStatusLabel(row?.status_label)
          ? String(row.status_label)
          : sourceDisplayStatusLabelFromRow(row),
        _contract_index: rowIndex
      };
    })
    .sort(compareSourceEffectivenessRows)
    .map(({ _contract_index, ...row }) => row);
}

function loadSourceDisplayContract() {
  const sourceFile = fileURLToPath(import.meta.url);
  const configPath = path.resolve(path.dirname(sourceFile), "../config/source-display-contract.json");
  try {
    return JSON.parse(readFileSync(configPath, "utf8"));
  } catch {
    return { schema_version: 1, sections: [] };
  }
}

function sourceDisplayIndex(contract) {
  const rows = new Map();
  const sections = Array.isArray(contract?.sections) ? contract.sections : [];
  for (const section of sections) {
    const sources = Array.isArray(section?.sources) ? section.sources : [];
    for (const source of sources) {
      const id = String(source?.id || "").trim();
      if (!id) {
        continue;
      }
      rows.set(id, {
        sectionId: String(section.id || DEFAULT_DISPLAY_SECTION.id),
        sectionLabel: String(section.label || section.id || DEFAULT_DISPLAY_SECTION.label),
        sectionRank: Number.isFinite(Number(section.rank)) ? Number(section.rank) : DEFAULT_DISPLAY_SECTION.rank,
        rank: Number.isFinite(Number(source.rank)) ? Number(source.rank) : 999,
        mode: ["expanded", "collapsed"].includes(String(source.display_mode || section.default_display_mode))
          ? String(source.display_mode || section.default_display_mode)
          : DEFAULT_DISPLAY_SECTION.default_display_mode
      });
    }
  }
  return rows;
}

function sourceDisplaySectionIndex(contract) {
  const rows = new Map();
  const sections = Array.isArray(contract?.sections) ? contract.sections : [];
  for (const section of sections) {
    const id = String(section?.id || "").trim();
    if (!id) {
      continue;
    }
    rows.set(id, {
      sectionId: id,
      sectionLabel: String(section.label || section.id || DEFAULT_DISPLAY_SECTION.label),
      sectionRank: Number.isFinite(Number(section.rank)) ? Number(section.rank) : DEFAULT_DISPLAY_SECTION.rank,
      mode: ["expanded", "collapsed"].includes(String(section.default_display_mode))
        ? String(section.default_display_mode)
        : DEFAULT_DISPLAY_SECTION.default_display_mode
    });
  }
  rows.set(DEFAULT_DISPLAY_SECTION.id, {
    sectionId: DEFAULT_DISPLAY_SECTION.id,
    sectionLabel: DEFAULT_DISPLAY_SECTION.label,
    sectionRank: DEFAULT_DISPLAY_SECTION.rank,
    mode: DEFAULT_DISPLAY_SECTION.default_display_mode
  });
  return rows;
}

function pathExists(filePath) {
  try {
    readFileSync(filePath);
    return true;
  } catch (error) {
    if (error && (error.code === "EISDIR" || error.code === "EPERM")) {
      return true;
    }
    return false;
  }
}

function sourceDisplayMetadata(contract, contractIndex) {
  const display = SOURCE_DISPLAY_BY_ID.get(contract.id);
  if (display) {
    return display;
  }
  return {
    sectionId: DEFAULT_DISPLAY_SECTION.id,
    sectionLabel: DEFAULT_DISPLAY_SECTION.label,
    sectionRank: DEFAULT_DISPLAY_SECTION.rank,
    rank: (contractIndex + 1) * 10,
    mode: DEFAULT_DISPLAY_SECTION.default_display_mode
  };
}

function sourceInventoryRow(source, sourceIndex) {
  const contractIndex = CORE_SOURCE_CONTRACTS.findIndex((contract) => sourceMatchesContract(source, contract));
  const contract = contractIndex >= 0 ? CORE_SOURCE_CONTRACTS[contractIndex] : null;
  const display = contract
    ? sourceDisplayMetadata(contract, contractIndex)
    : inferredSourceInventoryDisplay(source, sourceIndex);
  return {
    id: String(source?.id || ""),
    name: String(source?.name || source?.id || "Unnamed source"),
    source_kind: String(source?.source_kind || "unknown"),
    enablement: String(source?.enablement || "unknown"),
    tier: String(source?.tier || ""),
    authority: String(source?.authority || ""),
    platform: String(source?.platform || ""),
    config_status: publicSourceConfigStatus(source),
    logical_source_id: contract?.id || "",
    logical_source_name: contract?.name || "未归入逻辑源",
    display_section: display.sectionId,
    display_section_label: display.sectionLabel,
    display_section_rank: display.sectionRank,
    display_rank: display.rank || 999,
    display_mode: display.mode,
    _source_index: sourceIndex
  };
}

function inferredSourceInventoryDisplay(source, sourceIndex) {
  const sectionId = inferSourceInventorySectionId(source);
  const section = SOURCE_DISPLAY_SECTION_BY_ID.get(sectionId) || SOURCE_DISPLAY_SECTION_BY_ID.get(DEFAULT_DISPLAY_SECTION.id);
  return {
    sectionId: section.sectionId,
    sectionLabel: section.sectionLabel,
    sectionRank: section.sectionRank,
    rank: 10000 + sourceIndex,
    mode: section.mode
  };
}

function inferSourceInventorySectionId(source = {}) {
  const text = searchableText([
    source.id,
    source.name,
    source.url,
    source.source_kind,
    source.candidate_category,
    source.category,
    source.platform,
    source.authority
  ]);
  if (/china-ai|deepseek|qwen|kimi|minimax|zhipu|moonshot|baidu|tencent|alibaba|bytedance|doubao|siliconflow/.test(text)) {
    return "china_models";
  }
  if (/openrouter|artificial analysis|swe[-_ ]?bench|leaderboard|rankings|public_playwright/.test(text)) {
    return "tracking_metrics";
  }
  if (/qbitai|machine heart|jiqizhixin|sspai|36kr|infoq cn/.test(text)) {
    return "platform_cn_media";
  }
  if (/follow-builders|hacker news|hnrss|reddit|x\/twitter|twitter|builder|community/.test(text)) {
    return "builder_community";
  }
  if (/github|github-watch|ai-news-radar|ai-news-agent|ml-news-of-the-week|huggingface|hugging face|arxiv|papers|open source|opensource|model card/.test(text)) {
    return "open_source_platforms";
  }
  if (/search_api|techcrunch|verge|technologyreview|ars technica|venturebeat|media|intermediary|aggregator/.test(text)) {
    return "english_media_search";
  }
  if (/primary|official|company|research|blog|news/.test(text)) {
    return "core_primary";
  }
  return DEFAULT_DISPLAY_SECTION.id;
}

function publicSourceConfigStatus(source = {}) {
  const statuses = [];
  if (source.kill_switch === true) {
    statuses.push("disabled");
  }
  if (source.source_kind === "manual") {
    statuses.push("manual_review");
  }
  if (source.url_env || source.base_url_env || source.required_env) {
    statuses.push("configuration_needed");
  } else if (source.url) {
    statuses.push("configured");
  }
  if (statuses.length === 0) {
    statuses.push("placeholder");
  }
  return uniqueStrings(statuses).join("+");
}

function compareSourceInventoryRows(left, right) {
  return Number(left.display_section_rank) - Number(right.display_section_rank) ||
    Number(left.display_rank) - Number(right.display_rank) ||
    String(left.logical_source_name || "").localeCompare(String(right.logical_source_name || "")) ||
    String(left.name || "").localeCompare(String(right.name || "")) ||
    Number(left._source_index) - Number(right._source_index);
}

function compareSourceEffectivenessRows(left, right) {
  return Number(left.display_section_rank) - Number(right.display_section_rank) ||
    Number(left.display_rank) - Number(right.display_rank) ||
    Number(left._contract_index) - Number(right._contract_index) ||
    String(left.id || "").localeCompare(String(right.id || ""));
}

function sourceDisplayStatusLabelFromRow(row = {}) {
  return sourceDisplayStatusLabel({
    configured: Boolean(row.configured),
    reachable: Boolean(row.reachable),
    parsedRecent: Boolean(row.parsed_recent),
    candidateCreated: Boolean(row.candidate_created),
    publicIncluded: Boolean(row.public_included),
    statuses: Array.isArray(row.statuses) ? row.statuses : []
  });
}

function isValidSourceDisplayStatusLabel(value) {
  return [
    "included",
    "updated_not_selected",
    "parsed_not_candidate",
    "no_recent_update",
    "blocked",
    "not_configured_or_skipped"
  ].includes(String(value || ""));
}

function sourceDisplayStatusLabel({ configured, reachable, parsedRecent, candidateCreated, publicIncluded, statuses = [] }) {
  const normalizedStatuses = statuses.map((status) => String(status || ""));
  if (publicIncluded) {
    return "included";
  }
  if (candidateCreated) {
    return "updated_not_selected";
  }
  if (!configured || normalizedStatuses.some((status) => SKIPPED_SOURCE_STATUSES.has(status))) {
    return "not_configured_or_skipped";
  }
  if (!reachable || normalizedStatuses.some((status) => status === "blocked")) {
    return "blocked";
  }
  if (parsedRecent) {
    return "parsed_not_candidate";
  }
  return "no_recent_update";
}

function collectAuditSources(sourceAudit) {
  const rows = [];
  if (!sourceAudit || typeof sourceAudit !== "object") {
    return rows;
  }
  for (const [groupName, group] of Object.entries(sourceAudit)) {
    const sources = Array.isArray(group?.sources) ? group.sources : [];
    for (const source of sources) {
      if (!source || typeof source !== "object") {
        continue;
      }
      rows.push({
        ...source,
        audit_group: groupName,
        group_candidates_found: Number.isInteger(group?.candidates_found) ? group.candidates_found : 0,
        group_included: Number.isInteger(group?.included) ? group.included : 0
      });
    }
  }
  return rows;
}

function sourceMatchesContract(source, contract) {
  const text = searchableText([
    source?.id,
    source?.name,
    source?.url,
    source?.source_kind,
    source?.audit_group
  ]);
  return contract.aliases.some((alias) => text.includes(normalizeSearchToken(alias)));
}

function candidateMatchesContract(candidate, contract, sources) {
  const sourceIds = new Set(sources.map((source) => normalizeSearchToken(source.id)).filter(Boolean));
  const candidateSourceId = normalizeSearchToken(candidate?.source_id);
  if (candidateSourceId && sourceIds.has(candidateSourceId)) {
    return true;
  }
  const text = searchableText([
    candidate?.id,
    candidate?.source_id,
    candidate?.source,
    candidate?.source_name,
    candidate?.source_url,
    candidate?.url,
    candidate?.publisher,
    candidate?.category,
    candidate?.audit_group
  ]);
  return contract.aliases.some((alias) => text.includes(normalizeSearchToken(alias)));
}

function sourceIncludedPublicly(report, contract, sources, matchedCandidates) {
  if (matchedCandidates.some(candidateIncludedPublicly)) {
    return true;
  }
  const items = PUBLIC_REPORT_SECTIONS.flatMap((sectionName) =>
    Array.isArray(report?.[sectionName]) ? report[sectionName] : []
  );
  return items.some((item) => itemMatchesContract(item, contract, sources));
}

function itemMatchesContract(item, contract, sources) {
  if (!item || typeof item !== "object") {
    return false;
  }
  const sourceIds = new Set(sources.map((source) => normalizeSearchToken(source.id)).filter(Boolean));
  if (sourceIds.has(normalizeSearchToken(item.source_id || item.candidate_id))) {
    return true;
  }
  const nestedSources = Array.isArray(item.sources) ? item.sources : [];
  const text = searchableText([
    item.source_id,
    item.source,
    item.source_name,
    item.publisher,
    item.organization,
    item.url,
    item.primary_url,
    item.source_url,
    ...nestedSources.flatMap((source) => [source?.label, source?.name, source?.url, source?.type])
  ]);
  return contract.aliases.some((alias) => text.includes(normalizeSearchToken(alias)));
}

function candidateIncludedPublicly(candidate) {
  const includedIn = candidate?.included_in;
  if (Array.isArray(includedIn)) {
    return includedIn.length > 0;
  }
  if (typeof includedIn === "string" && includedIn.trim()) {
    return true;
  }
  return String(candidate?.status || "") === "included";
}

function sourceHasRecentParsedSignal(source) {
  return countValue(source?.recent_48h_entries) > 0 ||
    countValue(source?.parsed_count) > 0 ||
    countValue(source?.group_candidates_found) > 0;
}

function sourceNotIncludedReason({ configured, reachable, parsedRecent, candidateCreated, sources }) {
  if (!configured) {
    return "not_configured_or_not_checked";
  }
  if (!reachable) {
    return sources.some((source) => source.status === "blocked") ? "blocked_or_unreachable" : "not_reachable";
  }
  if (!parsedRecent) {
    return "reachable_but_no_recent_parsed_signal";
  }
  if (!candidateCreated) {
    return "parsed_but_no_candidate_created";
  }
  return "candidate_not_selected_for_public_page";
}

function isInactivePlaceholderSource(source = {}) {
  const text = searchableText([
    source.id,
    source.name,
    source.url,
    source.notes,
    source.status
  ]);
  return text.includes("example com") ||
    text.includes("kill switch enabled") ||
    text.includes("kill switch") ||
    text.includes("placeholder source") ||
    text.includes("skipped missing") ||
    text.includes("skipped manual source") ||
    text.includes("no date scoped");
}

function sourceEffectivenessNotes(contract, sources) {
  const sourceNotes = uniqueStrings(
    sources
      .map((source) => String(source?.notes || "").trim())
      .filter(Boolean)
      .slice(0, 4)
  );
  return [contract.notes || "", ...sourceNotes].filter(Boolean).join("; ");
}

function searchableText(values) {
  return values.map(normalizeSearchToken).filter(Boolean).join(" ");
}

function normalizeSearchToken(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countValue(value) {
  const count = Number(value);
  return Number.isFinite(count) ? count : 0;
}

function uniqueStrings(items) {
  return [...new Set(items.map((item) => String(item || "").trim()).filter(Boolean))];
}
