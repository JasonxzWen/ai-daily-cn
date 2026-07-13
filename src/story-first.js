import { withDefaultImportance } from "./importance.js";
import { normalizeUrlIdentity } from "./url.js";

export const STORY_FIRST_MIN = 5;
export const STORY_FIRST_TARGET = 8;
export const STORY_FIRST_MAX = 12;

const STORY_APPENDIX_SECTIONS = [
  "model_releases",
  "hot_blogs",
  "chinese_media_dynamics",
  "community_leads",
  "builder_observations",
  "official_org_updates",
  "wechat_items",
  "zhihu_items",
  "reddit_items"
];

const STORY_SOURCE_TYPE_BY_LEVEL = new Map([
  ["official", "official"],
  ["official_company_news", "official"],
  ["primary", "primary"],
  ["model_registry", "primary"],
  ["paper", "paper"],
  ["paper_api", "paper"],
  ["github", "github"],
  ["official_open_source_account", "github"],
  ["official_model_host_account", "github"],
  ["intermediary", "media"],
  ["community", "community"],
  ["community_api", "community"],
  ["original_social", "social"]
]);

export function normalizeStoryFirstReport(report, options = {}) {
  if (!report || typeof report !== "object") {
    return report;
  }

  const target = boundedTarget(options.target, STORY_FIRST_TARGET);
  const max = boundedTarget(options.max, STORY_FIRST_MAX);
  const effectiveTarget = Math.min(target, max);
  const existingStories = Array.isArray(report.stories) ? report.stories : [];
  const mainItems = Array.isArray(report.main_items) ? report.main_items : [];
  const preserveExistingStories = options.preserveExistingStories === true && existingStories.length > 0;
  const storyCandidates = preserveExistingStories
    ? existingStories.map((story, index) => storyCandidateFromExistingStory(story, mainItems, index))
    : storyCandidatesFromReport(report);
  const selected = [];
  const usedUrls = new Set();
  const usedStoryIds = new Set();

  for (const candidate of storyCandidates) {
    if (!candidate?.story) {
      continue;
    }
    const story = candidate.story;
    const sourceUrls = storySourceUrls(story);
    if (sourceUrls.length === 0) {
      continue;
    }
    if (sourceUrls.some((url) => usedUrls.has(url))) {
      mergeCandidateIntoExistingStory(selected, candidate, sourceUrls);
      continue;
    }
    if (!preserveExistingStories && options.allowSecondarySingleSource !== true && shouldDemoteStoryCandidate(story)) {
      continue;
    }
    if (!preserveExistingStories && isTemplatedStoryTitle(story.title)) {
      continue;
    }
    const storyId = uniqueStoryId(story.story_id, usedStoryIds, selected.length + 1);
    story.story_id = storyId;
    usedStoryIds.add(storyId);
    selected.push({
      story,
      mainItem: mainItemForStory(story, candidate.mainItem)
    });
    for (const url of sourceUrls) {
      usedUrls.add(url);
    }
    if (!preserveExistingStories && selected.length >= effectiveTarget) {
      break;
    }
  }

  const normalizedStories = selected.map((entry) => entry.story);
  const normalizedMainItems = selected.map((entry) => entry.mainItem);
  const normalized = {
    ...report,
    stories: withDefaultImportance("stories", normalizedStories),
    main_items: withDefaultImportance("main_items", normalizedMainItems)
  };

  pruneDuplicateAppendixUrls(normalized, selected);
  updateStorySelectionSnapshot(normalized, {
    selected: normalizedStories.length,
    target: effectiveTarget,
    max,
    source: existingStories.length > 0 ? "stories" : "main_items"
  });

  return normalized;
}

export function isTemplatedStoryTitle(value) {
  const title = compactText(value);
  if (!title) {
    return false;
  }
  return /某(?:机构|公司|团队).{0,8}更新AI(?:产品|平台|工程实践)/u.test(title) ||
    /更新AI产品、平台或工程实践/u.test(title) ||
    /披露模型能力和评估方法更新/u.test(title) ||
    /更新agent工作流和开发工具能力/i.test(title) ||
    /^该开源项目推出企业agent工作流系统$/iu.test(title) ||
    /updates?AIproducts?,?platforms?orengineeringpractices?/i.test(title) ||
    /modelcapabilitiesandevaluationmethodupdates?/i.test(title) ||
    /updates?agentworkflowanddevelopertools?/i.test(title);
}

export function readerFacingStoryTitle(value) {
  let title = cleanText(value);
  if (!title) {
    return title;
  }
  title = title
    .replace(/披露\s*(安全治理|治理|政策|风险|安全|平台控制)/gu, "说明$1")
    .replace(/披露\s*(agent|Agent|开发者|开发工具|工具|工作流|能力|平台能力)/gu, "更新$1")
    .replace(/披露\s*(模型|评测|基准|benchmark|Benchmark)/gu, "公布$1")
    .replace(/披露/gu, "发布")
    .replace(/\s+/g, " ")
    .trim();
  return title;
}

export function canonicalStoryUrl(value) {
  return normalizeUrlIdentity(value);
}

function storyCandidatesFromReport(report) {
  const existingStories = Array.isArray(report.stories) ? report.stories : [];
  if (existingStories.length > 0) {
    return existingStories.map((story, index) =>
      storyCandidateFromExistingStory(story, report.main_items || [], index)
    );
  }
  const grouped = groupMainItemsByCanonicalUrl(report.main_items || []);
  return grouped.map((items, index) => storyCandidateFromMainItems(items, index));
}

function groupMainItemsByCanonicalUrl(items) {
  const groups = [];
  const byUrl = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const url = canonicalStoryUrl(item?.url);
    if (!url) {
      continue;
    }
    if (!byUrl.has(url)) {
      const group = [];
      byUrl.set(url, group);
      groups.push(group);
    }
    byUrl.get(url).push(item);
  }
  return groups;
}

function storyCandidateFromExistingStory(story, mainItems, index) {
  const clone = cloneObject(story);
  const id = String(clone.story_id || "").trim();
  const matchingMain = (Array.isArray(mainItems) ? mainItems : []).find((item) =>
    id && String(item?.candidate_id || "").trim() === id
  );
  return {
    story: normalizeExistingStory(clone, index),
    mainItem: matchingMain ? cloneObject(matchingMain) : null
  };
}

function normalizeExistingStory(story, index) {
  const sources = uniqueStorySources(story.sources || [], { allowInvalid: true });
  const rawTitle = cleanText(story.title);
  const title = rawTitle && !isTemplatedStoryTitle(rawTitle)
    ? readerFacingStoryTitle(rawTitle)
    : concreteTitleFromSources(sources, index);
  return {
    ...story,
    story_id: sanitizeStoryId(story.story_id || `story-${index + 1}`),
    title,
    event_date: cleanText(story.event_date),
    what_happened: cleanText(story.what_happened),
    why_it_matters: cleanText(story.why_it_matters),
    evidence_level: normalizeEvidenceLevel(story.evidence_level, sources),
    sources
  };
}

function storyCandidateFromMainItems(items, index) {
  const primary = items[0] || {};
  const title = concreteStoryTitle(primary, index);
  if (!title) {
    return null;
  }
  const sources = uniqueStorySources(items.flatMap((item) => sourceCandidatesForMainItem(item)));
  const story = {
    story_id: sanitizeStoryId(primary.candidate_id || idFromUrl(primary.url) || `story-${index + 1}`),
    title,
    importance: primary.importance || "general",
    trend: storyTrend(primary),
    event_date: cleanText(primary.event_date),
    primary_entity: primaryEntity(primary),
    event_type: eventType(primary),
    object: objectLabel(primary, title),
    what_happened: storyWhatHappened(primary, title),
    why_it_matters: storyWhyItMatters(primary, title),
    evidence_level: evidenceLevelForItems(items, sources),
    sources,
    source_item_refs: uniqueStrings(items.map((item) => item.candidate_id || item.url))
  };
  return {
    story,
    mainItem: cloneObject(primary)
  };
}

function concreteStoryTitle(item, index) {
  const rawTitle = cleanText(item?.title);
  const titleWithoutSource = stripSourcePrefix(rawTitle, item?.source || item?.publisher);
  if (titleWithoutSource && !isTemplatedStoryTitle(titleWithoutSource)) {
    return readerFacingStoryTitle(titleWithoutSource);
  }
  const slugTitle = titleFromUrl(item?.url);
  const source = cleanText(item?.source || item?.publisher || item?.repo || item?.name);
  const githubTitle = githubStoryTitleFromUrl(item?.url);
  if (githubTitle) {
    return githubTitle;
  }
  if (slugTitle) {
    return readerFacingStoryTitle(source ? `${source}: ${slugTitle}` : slugTitle);
  }
  const summaryTitle = firstConcreteSentence([
    item?.summary,
    ...(Array.isArray(item?.bullets) ? item.bullets : [])
  ]);
  if (summaryTitle) {
    return readerFacingStoryTitle(summaryTitle);
  }
  return titleWithoutSource && !isTemplatedStoryTitle(titleWithoutSource)
    ? readerFacingStoryTitle(titleWithoutSource)
    : `Story ${index + 1}`;
}

function titleFromUrl(value) {
  try {
    const url = new URL(String(value || ""));
    const parts = url.pathname.split("/").filter(Boolean).map((part) => decodeURIComponent(part));
    if (/github\.com$/i.test(url.hostname) && parts.length >= 2) {
      return `${parts[0]}/${parts[1]}`;
    }
    const tail = parts.at(-1) || parts.at(-2) || "";
    const cleaned = tail
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[_+|]+/g, "-")
      .replace(/[-\s]+/g, " ")
      .trim();
    return toTitleCase(cleaned);
  } catch {
    return "";
  }
}

function githubStoryTitleFromUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (!/github\.com$/i.test(url.hostname)) {
      return "";
    }
    const parts = url.pathname.split("/").filter(Boolean).map((part) => decodeURIComponent(part));
    if (parts.length < 2) {
      return "";
    }
    return `${parts[0]}/${parts[1]} 开源项目更新 agent 工作流能力`;
  } catch {
    return "";
  }
}

function toTitleCase(value) {
  const text = cleanText(value);
  if (!text) return "";
  if (/[\u3400-\u9fff]/u.test(text)) return text;
  return text
    .split(" ")
    .filter(Boolean)
    .map((word) => {
      if (/^(ai|api|sdk|mcp|llm|vla|ui|ux|id|url|mle|finops)$/i.test(word)) {
        return word.toUpperCase();
      }
      if (/^[A-Z0-9]{2,}$/.test(word)) {
        return word;
      }
      return `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`;
    })
    .join(" ");
}

function firstConcreteSentence(values) {
  for (const value of values) {
    const text = cleanText(value);
    if (!text || isTemplatedStoryTitle(text)) {
      continue;
    }
    const sentence = text.split(/[。.!?；;]/u).map((part) => part.trim()).find((part) => part.length >= 12);
    if (sentence && !isTemplatedStoryTitle(sentence)) {
      return trimText(sentence, 96);
    }
  }
  return "";
}

function concreteTitleFromSources(sources, index) {
  const first = sources.find((source) => source?.url);
  const githubTitle = githubStoryTitleFromUrl(first?.url);
  if (githubTitle) {
    return githubTitle;
  }
  const title = titleFromUrl(first?.url);
  if (title) {
    return first?.label ? `${first.label}: ${title}` : title;
  }
  return `Story ${index + 1}`;
}

function sourceCandidatesForMainItem(item) {
  const urls = uniqueStrings([
    item?.url,
    item?.primary_url,
    ...(Array.isArray(item?.verification_sources) ? item.verification_sources : [])
  ]).filter(isHttpUrl);
  return urls.map((url) => ({
    label: cleanText(item?.source || item?.publisher || item?.repo || "Source"),
    url,
    type: sourceTypeForItem(item)
  }));
}

function uniqueStorySources(sources, options = {}) {
  const result = [];
  const seen = new Set();
  for (const source of Array.isArray(sources) ? sources : []) {
    const url = cleanText(source?.url);
    if (!isHttpUrl(url) && options.allowInvalid !== true) {
      continue;
    }
    const label = cleanText(source?.label || source?.source || source?.name || hostnameLabel(url) || "Source");
    const type = normalizeSourceType(source?.type);
    const key = `${canonicalStoryUrl(url)}|${label}|${type}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push({ label, url, type });
  }
  return result;
}

function storySourceUrls(story) {
  return uniqueStrings((Array.isArray(story?.sources) ? story.sources : [])
    .map((source) => canonicalStoryUrl(source?.url))
    .filter(Boolean));
}

function shouldDemoteStoryCandidate(story) {
  const sources = Array.isArray(story.sources) ? story.sources : [];
  if (sources.length >= 2) {
    return false;
  }
  return story.evidence_level === "secondary" || story.evidence_level === "community_signal";
}

function mergeCandidateIntoExistingStory(selected, candidate, sourceUrls) {
  const existing = selected.find((entry) => {
    const existingUrls = new Set(storySourceUrls(entry.story));
    return sourceUrls.some((url) => existingUrls.has(url));
  });
  if (!existing) {
    return;
  }
  existing.story.sources = uniqueStorySources([
    ...(existing.story.sources || []),
    ...(candidate.story.sources || [])
  ]);
  existing.story.evidence_level = normalizeEvidenceLevel(existing.story.evidence_level, existing.story.sources);
  existing.story.source_item_refs = uniqueStrings([
    ...(existing.story.source_item_refs || []),
    ...(candidate.story.source_item_refs || [])
  ]);
}

function mainItemForStory(story, mainItem) {
  const primarySource = story.sources[0] || {};
  const base = mainItem && typeof mainItem === "object" ? cloneObject(mainItem) : {};
  const summary = cleanText(base.summary || story.what_happened || story.title);
  const bullets = Array.isArray(base.bullets) && base.bullets.length > 0
    ? base.bullets.map(cleanText).filter(Boolean).slice(0, 4)
    : uniqueStrings([story.what_happened, story.why_it_matters]).slice(0, 3);
  const result = {
    ...base,
    candidate_id: base.candidate_id || story.story_id,
    title: story.title,
    event_date: cleanText(base.event_date || story.event_date),
    url: cleanText(base.url || primarySource.url),
    source: cleanText(base.source || primarySource.label || hostnameLabel(primarySource.url) || "Source"),
    tier: base.tier || importanceToTier(story.importance),
    entities: Array.isArray(base.entities) && base.entities.length > 0
      ? base.entities
      : [story.primary_entity].filter(Boolean),
    summary,
    bullets,
    importance: story.importance || base.importance || "general",
    editorial_category: base.editorial_category || categoryFromStory(story),
    why_it_matters: cleanText(base.why_it_matters || story.why_it_matters)
  };
  if (base.source_level) {
    result.source_level = base.source_level;
  }
  if (base.verification_status) {
    result.verification_status = base.verification_status;
  }
  return result;
}

function pruneDuplicateAppendixUrls(report, selected) {
  const mainUrls = new Set();
  for (const entry of selected) {
    for (const url of storySourceUrls(entry.story)) {
      mainUrls.add(url);
    }
    for (const url of itemUrls(entry.mainItem)) {
      mainUrls.add(url);
    }
  }
  for (const sectionName of STORY_APPENDIX_SECTIONS) {
    if (Array.isArray(report[sectionName])) {
      report[sectionName] = report[sectionName].filter((item) =>
        !itemUrls(item).some((url) => mainUrls.has(url))
      );
    }
  }

  if (Array.isArray(report.projects)) {
    report.projects = report.projects.filter((item) => {
      const urls = itemUrls(item);
      return !urls.some((url) => mainUrls.has(url));
    });
  }
}

function itemUrls(item) {
  return uniqueStrings([
    item?.url,
    item?.primary_url,
    item?.source_url,
    ...(Array.isArray(item?.verification_sources) ? item.verification_sources : [])
  ].map(canonicalStoryUrl).filter(Boolean));
}

function updateStorySelectionSnapshot(report, summary) {
  const selfCheck = report.self_check && typeof report.self_check === "object" ? report.self_check : {};
  const selectionSnapshot = selfCheck.selection_snapshot && typeof selfCheck.selection_snapshot === "object"
    ? selfCheck.selection_snapshot
    : {};
  const previousStories = selectionSnapshot.stories && typeof selectionSnapshot.stories === "object"
    ? selectionSnapshot.stories
    : {};
  report.self_check = {
    ...selfCheck,
    stories: summary.selected,
    main_items: Array.isArray(report.main_items) ? report.main_items.length : summary.selected,
    selection_snapshot: {
      ...selectionSnapshot,
      stories: {
        ...previousStories,
        selected: summary.selected,
        target_min: STORY_FIRST_MIN,
        target: summary.target,
        target_max: summary.max,
        shortfall: summary.selected < STORY_FIRST_MIN,
        normalized_from: summary.source
      }
    }
  };
}

function normalizeEvidenceLevel(value, sources = []) {
  const raw = cleanText(value);
  if (["primary", "multi_source", "secondary", "community_signal"].includes(raw)) {
    if (sources.length >= 2 && raw === "primary") {
      return "multi_source";
    }
    return raw;
  }
  if (sources.length >= 2) {
    return "multi_source";
  }
  const type = cleanText(sources[0]?.type);
  if (type === "community" || type === "social") {
    return "community_signal";
  }
  if (type === "media") {
    return "secondary";
  }
  return "primary";
}

function evidenceLevelForItems(items, sources) {
  if (sources.length >= 2) {
    return "multi_source";
  }
  const levels = new Set(items.map((item) => cleanText(item?.source_level)));
  if (levels.has("multi_source")) return "multi_source";
  if (levels.has("community") || levels.has("original_social") || levels.has("community_api")) return "community_signal";
  if (levels.has("intermediary")) return "secondary";
  return "primary";
}

function sourceTypeForItem(item) {
  const level = cleanText(item?.source_level);
  return STORY_SOURCE_TYPE_BY_LEVEL.get(level) || "source";
}

function normalizeSourceType(value) {
  const type = cleanText(value);
  return ["official", "primary", "paper", "github", "analysis", "media", "community", "social", "source", "other"].includes(type)
    ? type
    : "source";
}

function storyWhatHappened(item, title) {
  const source = item?.source || item?.publisher;
  return stripSourcePrefix(cleanText(item?.summary), source) ||
    stripSourcePrefix(firstConcreteSentence(Array.isArray(item?.bullets) ? item.bullets : []), source) ||
    title;
}

function storyWhyItMatters(item, title) {
  const source = item?.source || item?.publisher;
  const bulletReason = stripSourcePrefix(secondConcreteSentence(Array.isArray(item?.bullets) ? item.bullets : []), source);
  if (bulletReason) {
    return bulletReason;
  }
  const explicitReason = cleanText(item?.why_it_matters || item?.reader_relevance);
  if (explicitReason && !looksLikeInternalMetadata(explicitReason)) {
    return explicitReason;
  }
  return "";
}

function looksLikeInternalMetadata(value) {
  return /metadata|reader relevance|watch[- ]?next|入选理由|候选分数|后续跟进/i.test(String(value || ""));
}

function secondConcreteSentence(values) {
  const cleaned = values.map(cleanText).filter(Boolean);
  return cleaned[1] || cleaned[0] || "";
}

function storyTrend(item) {
  const category = cleanText(item?.editorial_category);
  if (category === "engineering_toolchain" || category === "product_radar") return "AI products and developer workflow";
  if (category === "open_source") return "open source AI";
  if (category === "content_aigc") return "AI content workflow";
  if (category === "model_release") return "model releases";
  if (category === "policy_infra") return "AI policy and infrastructure";
  return "AI industry";
}

function eventType(item) {
  const text = `${item?.title || ""} ${item?.summary || ""}`.toLowerCase();
  if (/launch|release|ship|rollout|available|推出|发布|上线|开源/u.test(text)) return "launch";
  if (/research|paper|benchmark|eval|评估|论文|研究/u.test(text)) return "research";
  if (/policy|regulation|治理|监管/u.test(text)) return "policy";
  return "update";
}

function primaryEntity(item) {
  return cleanText(item?.source || (Array.isArray(item?.entities) ? item.entities[0] : "") || hostnameLabel(item?.url) || "AI");
}

function objectLabel(item, title) {
  const explicit = cleanText(item?.object || item?.name || item?.repo);
  return trimText(explicit || title, 96);
}

function categoryFromStory(story) {
  const trend = cleanText(story?.trend).toLowerCase();
  if (/open source|github/.test(trend)) return "open_source";
  if (/model/.test(trend)) return "model_release";
  if (/workflow|developer|product/.test(trend)) return "product_radar";
  return "ai_industry";
}

function sourceLevelFromEvidence(level) {
  if (level === "multi_source") return "multi_source";
  if (level === "secondary") return "intermediary";
  if (level === "community_signal") return "community";
  return "primary";
}

function verificationFromEvidence(level) {
  if (level === "multi_source") return "multi_source_confirmed";
  if (level === "secondary") return "intermediary_only";
  if (level === "community_signal") return "original_social_only";
  return "primary_confirmed";
}

function importanceToTier(value) {
  if (value === "major") return "T1";
  if (value === "notable") return "T2";
  return "T3";
}

function boundedTarget(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.max(1, Math.min(STORY_FIRST_MAX, Math.trunc(number)));
}

function uniqueStoryId(value, seen, index) {
  const base = sanitizeStoryId(value || `story-${index}`) || `story-${index}`;
  if (!seen.has(base)) {
    return base;
  }
  let suffix = 2;
  while (seen.has(`${base}-${suffix}`)) {
    suffix += 1;
  }
  return `${base}-${suffix}`;
}

function sanitizeStoryId(value) {
  const cleaned = cleanText(value)
    .replace(/[^A-Za-z0-9._:-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "";
}

function idFromUrl(value) {
  const title = titleFromUrl(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return title ? `story-${title}` : "";
}

function hostnameLabel(value) {
  try {
    return new URL(String(value || "")).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || ""));
}

function uniqueStrings(values) {
  const result = [];
  const seen = new Set();
  for (const value of values) {
    const text = cleanText(value);
    if (!text || seen.has(text)) {
      continue;
    }
    seen.add(text);
    result.push(text);
  }
  return result;
}

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function stripSourcePrefix(value, source) {
  const text = cleanText(value);
  const sourceText = cleanText(source);
  if (!text || !sourceText) {
    return text;
  }
  const escapedSource = sourceText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text
    .replace(new RegExp(`^(?:\\*\\*)?${escapedSource}(?:\\*\\*)?\\s*[:：\\-–—|｜]\\s*`, "i"), "")
    .trim() || text;
}

function compactText(value) {
  return cleanText(value).replace(/[\s:：,，.。|｜-]+/g, "");
}

function trimText(value, maxLength) {
  const text = cleanText(value);
  return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…` : text;
}

function cloneObject(value) {
  return value && typeof value === "object" ? structuredClone(value) : {};
}
