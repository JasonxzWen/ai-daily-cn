const CORE_SOURCE_CONTRACTS = [
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
    id: "hugging-face-blog",
    name: "Hugging Face Blog",
    role: "official",
    aliases: ["hugging face blog", "huggingface.co/blog", "huggingface blog feed"]
  },
  {
    id: "follow-builders",
    name: "follow-builders",
    role: "builder_aggregator",
    aliases: ["follow-builders", "follow builders", "zarazhangrui/follow-builders"]
  },
  {
    id: "ml-papers-week",
    name: "ML Papers of the Week",
    role: "open_source_aggregator",
    aliases: ["ml papers of the week", "dair-ai/ml-papers-of-the-week"]
  },
  {
    id: "hellogithub",
    name: "HelloGitHub",
    role: "open_source_aggregator",
    aliases: ["hellogithub", "521xueweihan/hellogithub"]
  },
  {
    id: "ruanyf-weekly",
    name: "RuanYF Weekly",
    role: "open_source_aggregator",
    aliases: ["ruanyf weekly", "ruanyf/weekly", "weekly", "阮一峰"]
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
    id: "github-trending",
    name: "GitHub Trending",
    role: "github_trending",
    aliases: ["github trending", "github.com/trending", "ossinsight trending"]
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

export function buildSourceEffectivenessTable({ report = {}, candidates = [] } = {}) {
  const auditSources = collectAuditSources(report?.source_audit);
  return CORE_SOURCE_CONTRACTS.map((contract) => {
    const sources = auditSources.filter((source) => sourceMatchesContract(source, contract));
    const matchedCandidates = Array.isArray(candidates)
      ? candidates.filter((candidate) => candidateMatchesContract(candidate, contract, sources))
      : [];
    const publicIncluded = sourceIncludedPublicly(report, contract, sources, matchedCandidates);
    const configured = sources.length > 0;
    const reachable = sources.some((source) => REACHABLE_STATUSES.has(String(source.status || "")));
    const parsedRecent = sources.some(sourceHasRecentParsedSignal);
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
      notes: contract.notes || ""
    };
  });
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
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function uniqueStrings(values) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}
