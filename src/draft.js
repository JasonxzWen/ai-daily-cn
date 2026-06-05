import fs from "node:fs/promises";
import path from "node:path";
import { PublisherError } from "./errors.js";
import { cacheEvidenceImages } from "./evidence-cache.js";
import { normalizeUrlIdentity } from "./url.js";

const REQUIRED_AUDIT_GROUPS = ["github_trending", "builder_sources", "content_sources", "search_sources", "sources_health"];
const CANDIDATE_SOURCE_STATUSES = new Set(["checked", "blocked", "no_signal"]);
const PRIMARY_STATUSES = new Set(["primary_confirmed", "multi_source_confirmed"]);
const REPORT_AUDIT_GROUP_FIELDS = new Set([
  "checked",
  "sources",
  "candidates_found",
  "included",
  "sources_checked",
  "enablement_counts",
  "tier_counts",
  "source_kind_counts",
  "shadow",
  "blocked_reason",
  "last_successful_feed_at",
  "provider_runtime_ms",
  "provider_cost_units",
  "notes"
]);
const AIGC_RE = /\bAIGC\b|generative\s+(?:ai|video|image|media|game|art|audio)|(?:ai|image|video|music|audio|speech|game|3d)\s+generation|AI\s+(?:video|image|music|game|short|film|asset|avatar|media|creator)|text-to-(?:image|video|speech|3d)|creator\s+tool|content\s+generation|game\s+(?:asset|world|level|character)\s+generation|runway|pika|sora|veo|luma|kling|hailuo|midjourney|stable diffusion|图像生成|图片生成|视频生成|影像生成|音乐生成|音频生成|语音生成|配音|短剧|漫剧|游戏资产|游戏生成|动画生成|三维生成|数字人|创作者工具|内容产业|文生图|文生视频|生图|生视频/i;
const INTERMEDIARY_SOURCE_RE = /techcrunch|the verge|verge ai|ars technica|venturebeat|fast company|planet ai|google news|product hunt|producthunt|crunchbase|36kr|qbitai|jiqizhixin|leiphone|infoq|wechat|rsshub|reddit|hacker news|hnrss|smol ai|ben's bites|buttondown|ai news archive|the magnifier/i;
const AI_RELEVANCE_RE = /\b(ai|artificial intelligence|machine learning|ml|deep learning|neural|llm|large language model|model|models|agent|agents|agentic|chatgpt|codex|claude|gemini|gpt|grok|openai|anthropic|deepmind|xai|x\.ai|mistral|qwen|nemotron|reasoning|inference|eval|benchmark|rag|embedding|vector|transformer|diffusion|copilot|cursor|mcp)\b|人工智能|机器学习|深度学习|神经网络|大模型|模型|智能体|推理|评测|向量|多模态|代码助手/i;
const BUILDER_RELEVANCE_RE = /\b(ai|agi|llm|model|agent|agents|openai|anthropic|claude|gemini|deepmind|google labs|gpt|codex|cursor|copilot|mcp|eval|benchmark|rag|inference|training|fine[-\s]?tuning|prompt|token|transformer|diffusion|sora|veo|runway)\b|人工智能|大模型|模型|智能体|代理|评测|推理|训练|微调|提示词|多模态|生成式|文生图|文生视频|代码助手/i;
const BUILDER_IRRELEVANT_RE = /\bnot anything ai related\b|nothing to do with ai|unrelated to ai|off[-\s]?topic/i;
const COMPANY_ACTION_RE = /\b(earnings|quarterly results?|financial results?|revenue|profit|guidance|layoffs?|job cuts?|hiring|reorganization|reorganisation|restructuring|organization changes?|leadership|management|board|conference|summit|keynote|product conference|launch event|partnership|investment|pricing|availability|policy|regulation|open[-\s]?source|github|hugging face|model weights?)\b|财报|业绩|营收|利润|指引|裁员|招聘|组织架构|组织调整|重组|管理层|董事会|大会|峰会|发布会|合作|投资|价格|定价|可用性|政策|监管|开源|模型权重/i;
const PRODUCT_PLATFORM_RE = /\b(product|platform|app|service|cloud|enterprise|developer|api|sdk|release|launch|availability|pricing|quota|github|hugging face|open[-\s]?source|repo|repository)\b|产品|平台|应用|服务|云|企业|开发者|接口|发布|上线|可用|价格|配额|开源|仓库/i;
const HARDCORE_RESEARCH_RE = /\b(arxiv|paper|benchmark|evaluation|eval|reasoning traces?|transformer inference|inference benchmark|ablation|dataset|pre[-\s]?train|post[-\s]?training|fine[-\s]?tuning|rlvr|loss|gradient|tokenizer|architecture|throughput|latency|context window)\b|论文|基准|评测|推理轨迹|消融|数据集|训练|微调|架构|吞吐|延迟/i;
const PLAIN_READER_SIGNAL_RE = /\b(pricing|availability|rollout|launch|product|platform|app|service|enterprise|developer|api|sdk|conference|summit|partnership|customer|use case|workflow|open[-\s]?source|github|hugging face|model weights?|layoffs?|job cuts?|reorganization|restructuring|earnings|revenue|guidance)\b|价格|定价|可用|发布|上线|产品|平台|应用|服务|企业|开发者|接口|大会|峰会|合作|客户|用例|工作流|开源|模型权重|裁员|组织调整|重组|财报|营收|指引/i;
const TRUSTED_PRIMARY_SOURCE_LEVELS = new Set([
  "primary",
  "official",
  "paper",
  "github",
  "multi_source",
  "official_company_news",
  "official_open_source_account",
  "official_model_host_account"
]);
const READER_RELEVANT_SOURCE_LEVELS = new Set([
  "official_company_news",
  "official_open_source_account",
  "official_model_host_account",
  "github"
]);
const MAIN_TARGET = 10;
const MAX_PUBLIC_UNITS = 45;

export async function generateReportDraft(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const reportDate = requireReportDate(options.reportDate);
  const generatedAt = options.generatedAt || new Date().toISOString();
  const inputPaths = normalizeInputPaths(options.inputPaths || options.inputs || options.input);
  const loaded = await loadDiscoveryInputs(rootDir, inputPaths);
  const merged = mergeDiscoveryPayloads(loaded, { reportDate, generatedAt });
  const recentMainUrls = await loadRecentMainUrls(rootDir, reportDate);
  const selection = selectReportItems(merged, { reportDate, recentMainUrls });
  const candidatePool = {
    schema_version: 1,
    report_date: reportDate,
    generated_at: generatedAt,
    sources: merged.sources,
    candidates: selection.candidates
  };
  const evidence = options.cacheEvidence === false
    ? { assets: [], skipped: [] }
    : await cacheEvidenceImages({
      rootDir,
      reportDate,
      outDir: options.evidenceOutDir || options.outDir || "docs",
      maxAssets: options.maxEvidenceAssets || 3,
      candidates: candidatePool.candidates.filter((candidate) => candidate.status === "included"),
      fetchImpl: options.fetchImpl
    });
  const sourceAudit = updateAuditIncludedCounts(merged.sourceAudit, selection.candidates);
  const report = buildDraftReport({
    reportDate,
    generatedAt,
    selection,
    sourceAudit,
    evidenceAssets: evidence.assets
  });

  const outputPath = path.resolve(rootDir, options.outputPath || path.join(".tmp", "daily-report.json"));
  const candidateOutputPath = path.resolve(rootDir, options.candidateOutputPath || path.join(".tmp", `source-candidates-${reportDate}.json`));
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.mkdir(path.dirname(candidateOutputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await fs.writeFile(candidateOutputPath, `${JSON.stringify(candidatePool, null, 2)}\n`, "utf8");

  return {
    report,
    candidatePool,
    path: outputPath,
    candidatePoolPath: candidateOutputPath,
    evidence_assets: evidence.assets,
    evidence_skipped: evidence.skipped,
    counts: {
      candidates: candidatePool.candidates.length,
      main_items: report.main_items.length,
      github_trending: report.github_trending.length,
      hot_blogs: report.hot_blogs.length,
      daily_tracking: report.daily_tracking.length,
      projects: report.projects.length,
      builder_observations: report.builder_observations.length,
      community_leads: report.community_leads.length,
      evidence_assets: report.evidence_assets.length
    }
  };
}

export function mergeDiscoveryPayloads(payloads, options = {}) {
  const reportDate = requireReportDate(options.reportDate);
  const generatedAt = options.generatedAt || new Date().toISOString();
  const sourceAudit = {};
  const sourceMap = new Map();
  const candidates = [];
  const metaById = new Map();

  for (const payload of payloads) {
    mergeSourceAudit(sourceAudit, payload?.source_audit);
    for (const source of Array.isArray(payload?.sources) ? payload.sources : []) {
      addCandidateSource(sourceMap, source, generatedAt);
    }
    addSourcesFromAudit(sourceMap, payload?.source_audit, generatedAt);
    for (const rawCandidate of Array.isArray(payload?.candidates) ? payload.candidates : []) {
      const candidate = normalizeCandidate(rawCandidate, {
        reportDate,
        existing: candidates,
        sourceMap,
        generatedAt
      });
      candidates.push(candidate);
      metaById.set(candidate.id, rawCandidate);
    }
  }

  for (const groupName of REQUIRED_AUDIT_GROUPS) {
    if (!sourceAudit[groupName]) {
      sourceAudit[groupName] = emptyAuditGroup(groupName);
      addCandidateSource(sourceMap, {
        id: `audit-${groupName}`,
        name: `Missing ${groupName} discovery output`,
        url: "https://example.com/",
        category: groupName === "github_trending" ? "github_trending" : groupName === "builder_sources" ? "builder" : "community",
        status: "no_signal",
        checked_at: generatedAt,
        notes: "discovery output was not supplied to report:draft"
      }, generatedAt);
    }
  }

  return {
    sourceAudit,
    sources: [...sourceMap.values()].sort((left, right) => left.id.localeCompare(right.id)),
    candidates,
    metaById
  };
}

function selectReportItems(merged, options = {}) {
  const candidates = cloneCandidates(merged.candidates);
  const metaById = merged.metaById || new Map();
  const selectedIds = new Set();
  const recentMainUrls = options.recentMainUrls || new Set();
  const derived = [];
  const includedCandidates = [...candidates];
  const githubSourceCandidates = candidates
    .map((candidate) => ({ candidate, meta: metaById.get(candidate.id) || {} }))
    .filter(({ candidate, meta }) => isGitHubTrendingCandidate(candidate, meta))
    .sort((left, right) => rankOf(left.meta, 999) - rankOf(right.meta, 999));
  const publicGithubCandidates = publicGithubTrendingCandidates(githubSourceCandidates);
  const githubTrending = publicGithubCandidates.slice(0, 10).map(({ candidate, meta }, index) => {
    const trendCandidate = derivedCandidate(candidate, {
      idPrefix: "trend",
      category: "github_trending",
      includedIn: "github_trending",
      existing: [...includedCandidates, ...derived]
    });
    derived.push(trendCandidate);
    selectedIds.add(candidate.id);
    return githubTrendingItem(trendCandidate, meta, index);
  });

  const mainPool = candidates
    .filter((candidate) => !selectedIds.has(candidate.id))
    .filter((candidate) => !recentMainUrls.has(normalizeUrl(candidate.url)))
    .filter((candidate) => canPromoteToMain(candidate))
    .sort((left, right) => candidateScore(right) - candidateScore(left));
  const mainSeeds = pickMainCandidates(mainPool, MAIN_TARGET);
  const mainItems = mainSeeds.map((candidate) => {
    const mainCandidate = derivedCandidate(candidate, {
      idPrefix: "main",
      category: "main_item",
      includedIn: "main_items",
      existing: [...includedCandidates, ...derived]
    });
    derived.push(mainCandidate);
    selectedIds.add(candidate.id);
    return mainItem(mainCandidate, candidate);
  });

  const projectSeeds = publicGithubCandidates
    .map(({ candidate, meta }) => ({ candidate, meta }))
    .filter(({ candidate }) => !selectedIds.has(`project:${candidate.id}`))
    .slice(0, 3);
  const projects = projectSeeds.map(({ candidate, meta }) => {
    const projectCandidate = markIncludedCandidate(candidate, "project", "projects");
    selectedIds.add(`project:${candidate.id}`);
    return projectItem(projectCandidate, meta);
  });

  const hotBlogSeenUrls = new Set(mainItems.map((item) => normalizeUrl(item.url)).filter(Boolean));
  const hotBlogSeeds = [];
  for (const candidate of candidates
    .filter((item) => item.category === "hot_blog" && !selectedIds.has(item.id))
    .filter((item) => isAiRelevantCandidate(item))
    .sort((left, right) => candidateScore(right) - candidateScore(left))) {
    if (hotBlogSeeds.length >= 3) break;
    const key = normalizeUrl(candidate.url);
    if (!key || hotBlogSeenUrls.has(key)) continue;
    hotBlogSeenUrls.add(key);
    hotBlogSeeds.push(candidate);
  }
  const hotBlogs = hotBlogSeeds.map((candidate) => {
    const hotCandidate = markIncludedCandidate(candidate, "hot_blog", "hot_blogs");
    selectedIds.add(candidate.id);
    return hotBlogItem(hotCandidate);
  });

  const builderSeeds = candidates
    .filter((candidate) => candidate.category === "builder_observation" && !selectedIds.has(candidate.id))
    .filter((candidate) => canPromoteToBuilderObservation(candidate))
    .sort((left, right) => candidateScore(right) - candidateScore(left))
    .slice(0, 6);
  const builderObservations = builderSeeds.map((candidate) => {
    const builderCandidate = markIncludedCandidate(candidate, "builder_observation", "builder_observations");
    selectedIds.add(candidate.id);
    return builderObservationItem(builderCandidate);
  });

  const communitySeeds = candidates
    .filter((candidate) => candidate.category === "community_lead" && !selectedIds.has(candidate.id))
    .sort((left, right) => candidateScore(right) - candidateScore(left))
    .slice(0, Math.max(0, MAX_PUBLIC_UNITS - mainItems.length - githubTrending.length - projects.length - hotBlogs.length - builderObservations.length));
  const communityLeads = communitySeeds.slice(0, 8).map((candidate) => {
    markIncludedCandidate(candidate, "community_lead", "community_leads");
    selectedIds.add(candidate.id);
    return communityLeadItem(candidate);
  });

  return {
    candidates: [...includedCandidates, ...derived],
    main_items: mainItems,
    github_trending: githubTrending,
    hot_blogs: hotBlogs,
    projects,
    builder_observations: builderObservations,
    community_leads: communityLeads
  };
}

async function loadRecentMainUrls(rootDir, reportDate, lookbackDays = 7) {
  const urls = new Set();
  const baseDate = parseReportDate(reportDate);
  for (let offset = 1; offset <= lookbackDays; offset += 1) {
    const date = new Date(baseDate.getTime());
    date.setUTCDate(date.getUTCDate() - offset);
    const dateString = formatReportDate(date);
    const [year, month] = dateString.split("-");
    const reportPath = path.join(rootDir, "reports-data", year, month, `${dateString}.json`);
    let parsed;
    try {
      parsed = JSON.parse(await fs.readFile(reportPath, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") continue;
      continue;
    }
    for (const item of Array.isArray(parsed?.main_items) ? parsed.main_items : []) {
      const key = normalizeUrl(item?.url);
      if (key) urls.add(key);
    }
  }
  return urls;
}

function parseReportDate(reportDate) {
  const validDate = requireReportDate(reportDate);
  const [year, month, day] = validDate.split("-").map((part) => Number.parseInt(part, 10));
  return new Date(Date.UTC(year, month - 1, day));
}

function formatReportDate(date) {
  return date.toISOString().slice(0, 10);
}

function pickMainCandidates(candidates, target) {
  const picked = [];
  const seenUrls = new Set();
  const plainReaderCandidates = candidates.filter((candidate) => hasPlainReaderSignal(candidate));
  const hardcoreLimit = plainReaderCandidates.length >= target - 2 ? 2 : target;
  let hardcorePicked = 0;
  const aigc = candidates.find((candidate) => isAigcCandidate(candidate) && !isHardcoreResearchOnly(candidate));
  if (aigc) {
    picked.push(aigc);
    seenUrls.add(normalizeUrl(aigc.url));
  }
  for (const candidate of candidates) {
    if (picked.length >= target) break;
    const key = normalizeUrl(candidate.url);
    if (!key || seenUrls.has(key)) continue;
    if (isHardcoreResearchOnly(candidate)) {
      if (hardcorePicked >= hardcoreLimit) continue;
      hardcorePicked += 1;
    }
    picked.push(candidate);
    seenUrls.add(key);
  }
  return picked;
}

function buildDraftReport({ reportDate, generatedAt, selection, sourceAudit, evidenceAssets }) {
  const aigcCount = selection.main_items.filter((item) => item.editorial_category === "content_aigc").length +
    selection.community_leads.filter((item) => item.editorial_category === "content_aigc").length;
  const report = {
    schema_version: 1,
    report_date: reportDate,
    title: `AI 日报 ${reportDate}`,
    summary: summaryForSelection(selection, aigcCount),
    source_window: {
      date_from: reportDate,
      date_to: reportDate,
      fallback_window_used: false,
      notes: "report:draft 自动从固定发现候选池选取；一手/可信候选进入主体，中介线索仅作社区观察。"
    },
    hero_highlights: selection.main_items.slice(0, 3).map((item) => ({
      title: item.title,
      url: item.url,
      reason: trimText(item.summary, 120)
    })),
    source_audit: sourceAudit,
    main_items: selection.main_items,
    github_trending: selection.github_trending,
    model_releases: [],
    hot_blogs: selection.hot_blogs,
    daily_tracking: dailyTrackingItems(reportDate, sourceAudit),
    projects: selection.projects,
    builder_observations: selection.builder_observations,
    community_leads: selection.community_leads,
    evidence_assets: evidenceAssets,
    self_check: {
      report_date: reportDate,
      main_items: selection.main_items.length,
      builder_observations: selection.builder_observations.length,
      builder_skill_used: ["candidate-pool-autodraft"],
      fallback_sources: [],
      primary_links: selection.main_items.every((item) => PRIMARY_STATUSES.has(item.verification_status)),
      no_banned_words: true,
      no_unsourced_numbers: true,
      notes: "report:draft 已从候选池自动选取并写回 included 标记；高风险或中介事实未进入主体。",
      optimization_suggestions: []
    },
    generated_at: generatedAt
  };
  normalizeAutodraftPublicText(report);
  return report;
}

function normalizeAutodraftPublicText(report) {
  report.source_window.notes = "覆盖当日固定信源；正文只采用已回到一手、官方、论文、GitHub 或多源确认的事实，未确认线索留在观察区。";
  report.self_check.notes = "候选池 included 标记已写回；高风险或中介线索不进入主体事实。";
}

function summaryForSelection(selection, aigcCount) {
  const themes = selection.main_items
    .map((item) => themeLabelForCandidate(item))
    .filter(Boolean);
  const uniqueThemes = [...new Set(themes)].slice(0, 4);
  if (uniqueThemes.length === 0 && selection.github_trending.length === 0) {
    return "今日固定信源没有足够清晰的主体事实，日报保留信源状态和少量观察，不强行扩写。";
  }
  const trendText = selection.github_trending.length > 0 ? `GitHub Trending 展示当日 Top ${selection.github_trending.length}` : "";
  const builderText = selection.builder_observations.length > 0 ? "Builder 观察只保留与 AI 工具、模型或 agent 实践直接相关的原帖" : "";
  const aigcText = aigcCount > 0 ? `内容生成相关 ${aigcCount} 条` : "";
  return [uniqueThemes.length > 0 ? `今日重点集中在${uniqueThemes.join("、")}` : "", aigcText, trendText, builderText]
    .filter(Boolean)
    .join("；") + "。";
}

function mainItem(candidate, original) {
  const category = inferredEditorialCategory(candidate);
  const entity = mainEntity(candidate);
  const summary = chineseSummary(candidate, category);
  const impact = readerImpactForCandidate(candidate, category);
  const watch = readerWatchForCandidate(candidate, category);
  return {
    title: displayTitleForCandidate(candidate),
    candidate_id: candidate.id,
    editorial_category: category,
    source_level: candidate.source_level || sourceLevelForCandidate(candidate),
    verification_status: candidate.verification_status || "primary_confirmed",
    event_date: candidate.event_date,
    url: candidate.url,
    source: candidate.source,
    tier: tierForCandidate(candidate),
    entities: [entity].filter(Boolean),
    summary,
    bullets: [
      `**${entity || candidate.source}**：${sourceGroundedFact(candidate, original)}。`,
      `==影响==：${impact}。`,
      `==留意==：${watch}。`
    ],
    why_it_matters: impact,
    reader_relevance: audienceRelevanceForCandidate(candidate, category),
    verification_note: candidate.verification_note || "事实来自可回看的原始链接。",
    risk_note: candidate.risk_note || "如涉及价格、融资、benchmark 或监管事实，仍需在正式编辑时补充更强核验。"
  };
}

function githubTrendingItem(candidate, meta, index) {
  const repo = meta.repo || repoFromUrl(candidate.url) || candidate.title;
  return {
    name: meta.name || repo,
    repo,
    candidate_id: candidate.id,
    description: chineseGithubDescription(meta.description || candidate.evidence || repo, repo),
    url: candidate.url,
    event_date: candidate.event_date,
    source: candidate.source || "GitHub Trending",
    language: meta.language || "",
    window: meta.window || "daily",
    rank: rankOf(meta, index + 1),
    previous_rank: Number.isInteger(meta.previous_rank) ? meta.previous_rank : null,
    rank_delta: Number.isInteger(meta.rank_delta) ? meta.rank_delta : null,
    trend: ["new", "up", "down", "same"].includes(meta.trend) ? meta.trend : "new",
    evidence: candidate.evidence || meta.evidence || `${repo} appeared in GitHub Trending.`
  };
}

function projectItem(candidate, meta) {
  const repo = meta.repo || repoFromUrl(candidate.url) || candidate.title;
  return {
    name: repo,
    candidate_id: candidate.id,
    editorial_category: "open_source",
    source_level: "github",
    verification_status: "primary_confirmed",
    description: chineseGithubDescription(meta.description || candidate.evidence || repo, repo),
    domains: projectDomains(meta.description || candidate.title || ""),
    use_case: "作为开源雷达线索，优先检查 README、release、recent commits 和是否能在本地复现。",
    url: candidate.url,
    event_date: candidate.event_date,
    source: candidate.source || "GitHub Trending",
    signal: "trending",
    evidence: candidate.evidence || meta.evidence || `${repo} appeared in GitHub Trending.`
  };
}

function hotBlogItem(candidate) {
  const fields = nonPrimaryDisclosureFields(candidate);
  return {
    title: displayTitleForCandidate(candidate),
    candidate_id: candidate.id,
    editorial_category: inferredEditorialCategory(candidate) === "content_aigc" ? "content_aigc" : "viewpoint_analysis",
    ...fields,
    url: candidate.url,
    publisher: candidate.source || "Unknown",
    author: candidate.author || candidate.source || "Unknown",
    event_date: candidate.event_date,
    topic: topicForCandidate(candidate),
    summary: hotBlogSummary(candidate),
    content_type: "blog"
  };
}

function builderObservationItem(candidate) {
  const originalText = candidate.original_text || candidate.evidence || candidate.title;
  const translation = hasChineseText(originalText)
    ? originalText
    : builderReadableSummary(originalText);
  const fields = nonPrimaryDisclosureFields(candidate);
  return {
    author: candidate.author || candidate.handle || candidate.source || "Builder",
    ...(candidate.handle ? { handle: candidate.handle } : {}),
    candidate_id: candidate.id,
    editorial_category: "x_discussion",
    ...fields,
    content: translation,
    original_text: originalText,
    translation,
    ...(candidate.avatar_url ? { avatar_url: candidate.avatar_url } : {}),
    ...(candidate.avatar_local_path ? { avatar_local_path: candidate.avatar_local_path } : {}),
    url: candidate.url,
    role: "builder",
    event_date: candidate.event_date,
    source: candidate.source,
    evidence: candidate.evidence || "Original builder/source post collected by discovery."
  };
}

function communityLeadItem(candidate) {
  const fields = nonPrimaryDisclosureFields(candidate);
  return {
    candidate_id: candidate.id,
    content: `${candidate.source ? `${candidate.source}：` : ""}${trimText(candidate.evidence || candidate.title, 240)} 待确认：${fields.verification_note || "该线索未进入主体事实，需回到一手来源或多源确认。"}`,
    url: candidate.url,
    event_date: candidate.event_date,
    source: candidate.source,
    evidence: candidate.evidence || candidate.title,
    editorial_category: inferredEditorialCategory(candidate) === "content_aigc" ? "content_aigc" : "community_signal",
    ...fields
  };
}

function dailyTrackingItems(reportDate, sourceAudit) {
  return DAILY_TRACKERS.map((tracker) => {
    const audit = dailyTrackingAuditStatus(sourceAudit, tracker);
    const blocked = audit.status === "blocked" || audit.verificationStatus === "unverified";
    const publishToPublic = audit.changeStatus === "changed" && audit.verificationStatus !== "unverified";
    return {
      id: tracker.id,
      name: tracker.name,
      url: tracker.url,
      event_date: reportDate,
      source: tracker.source,
      category: tracker.category,
      importance: tracker.importance,
      source_level: "primary",
      verification_status: audit.verificationStatus,
      change_status: audit.changeStatus,
      change_summary: audit.changeSummary,
      publish_to_public: publishToPublic,
      summary: blocked ? `${tracker.summary} 本轮自动抓取未取得可解析快照，读者需要点开官方页人工核对最新榜单。` : tracker.summary,
      watch_points: tracker.watchPoints,
      metrics: tracker.metrics,
      evidence: `${tracker.evidence} ${audit.evidenceNote}`.trim(),
      verification_note: audit.verificationNote,
      risk_note: tracker.riskNote,
      watch_next: tracker.watchNext
    };
  });
}

const DAILY_TRACKERS = [
  {
    id: "openrouter-rankings",
    name: "OpenRouter",
    source: "OpenRouter Rankings",
    url: "https://openrouter.ai/rankings",
    category: "model_usage",
    importance: "notable",
    summary: "关注模型在 OpenRouter 上的实际调用热度、周使用排名和应用生态迁移；它回答“开发者正在用什么”，不能替代能力评测。",
    watchPoints: [
      "榜首模型、上升最快模型和供应商份额是否改变。",
      "工具调用、图像、音频等用量变化是否指向新的产品需求。",
      "热度变化需要和价格、延迟、上下文长度及能力榜交叉看。"
    ],
    metrics: [
      { label: "核心指标", value: "Top Models / weekly usage / model author share", trend: "unknown" },
      { label: "适用问题", value: "真实 API 生态里哪些模型正在获得调用量", trend: "same" }
    ],
    evidence: "OpenRouter Rankings 是 OpenRouter 官方榜单，说明其排名结合 benchmark 和 OpenRouter 用户真实使用数据。",
    riskNote: "OpenRouter 反映平台内使用结构，不能直接代表全市场份额，也不能当成模型能力结论。",
    watchNext: "若榜首、周使用或供应商份额显著变化，再回到模型发布、价格页和状态页核验原因。"
  },
  {
    id: "artificial-analysis-intelligence-index",
    name: "Artificial Analysis",
    source: "Artificial Analysis Intelligence Index",
    url: "https://artificialanalysis.ai/evaluations/artificial-analysis-intelligence-index",
    category: "model_benchmark",
    importance: "notable",
    summary: "关注独立基准里模型能力、速度、价格和 token 使用的相对位置；它适合做模型 shortlist，不能单独决定生产选型。",
    watchPoints: [
      "榜首和 Top 10 是否发生换位，尤其是新模型是否进入综合能力前列。",
      "分数、成本和 token 用量是否出现明显 trade-off。",
      "把 Intelligence Index 与具体任务基准分开看，避免被单一综合分误导。"
    ],
    metrics: [
      { label: "核心指标", value: "Intelligence Index / cost / token usage", trend: "unknown" },
      { label: "适用问题", value: "能力、价格和性能之间的模型取舍", trend: "same" }
    ],
    evidence: "Artificial Analysis 官方说明 Intelligence Index 聚合十项数学、科学、代码和推理评测，并由 Artificial Analysis 独立运行。",
    riskNote: "综合榜单会压缩任务差异；生产选型仍需要用自己的 workload、延迟和价格约束复测。",
    watchNext: "若新模型进入前列，补查该模型在 coding、long context、agentic task 和价格页上的分项表现。"
  },
  {
    id: "swe-bench-pro-public",
    name: "SWE-bench Pro",
    source: "Scale Labs SWE-Bench Pro",
    url: "https://scale.com/leaderboard/swe_bench_pro_public",
    category: "coding_benchmark",
    importance: "major",
    summary: "关注 coding agent 在长周期真实工程任务上的 Resolve Rate；它比短题 benchmark 更接近修 bug、跨文件修改和测试通过能力。",
    watchPoints: [
      "Top 10 是否出现新模型或新 agent scaffold，分数提升是否超过误差区间。",
      "Public、Private、Held-out 子集的差异是否揭示污染风险或泛化能力差距。",
      "把榜单结果和实际 IDE/agent 工作流体验分开判断。"
    ],
    metrics: [
      { label: "核心指标", value: "Resolve Rate / public dataset ranking", trend: "unknown" },
      { label: "适用问题", value: "模型或 agent 能否完成长周期软件工程任务", trend: "same" }
    ],
    evidence: "Scale Labs 官方页面把 SWE-Bench Pro 定义为面向长周期软件工程任务的 agentic coding benchmark，并以 Resolve Rate 作为主指标。",
    riskNote: "榜单分数受 scaffold、成本上限、任务集和误差区间影响；不能直接等同于团队代码库中的实际修复率。",
    watchNext: "若榜单更新，优先核对模型、agent scaffold、数据子集、成本限制和置信区间。"
  }
];

function dailyTrackingAuditStatus(sourceAudit, tracker) {
  const sources = Object.values(sourceAudit || {})
    .flatMap((group) => Array.isArray(group?.sources) ? group.sources : []);
  const targetUrl = normalizeUrl(tracker.url);
  const targetName = tracker.source.toLowerCase();
  const source = sources.find((item) => {
    const url = normalizeUrl(item?.url);
    const name = String(item?.name || "").toLowerCase();
    return (targetUrl && url === targetUrl) || name === targetName || name.includes(targetName);
  });
  if (!source) {
    return {
      status: "missing",
      verificationStatus: "unverified",
      changeStatus: "missing",
      changeSummary: "本轮未确认该追踪入口状态。",
      evidenceNote: "本轮 source_audit 未记录该固定追踪入口。",
      verificationNote: "未在本轮发现输出中看到该入口的 source_audit 记录；已保留官方 URL 作为固定追踪目标。"
    };
  }
  if (source.status === "checked" || source.status === "no_signal") {
    return {
      status: source.status,
      verificationStatus: "primary_confirmed",
      changeStatus: "no_change",
      changeSummary: source.status === "checked"
        ? "本轮检查了官方入口，但未形成可核验的榜单变化条目。"
        : "本轮检查了官方入口，未解析到当日可入选变化。",
      evidenceNote: `source_audit status=${source.status}${source.notes ? `; notes=${source.notes}` : ""}`,
      verificationNote: source.status === "checked"
        ? "本轮已检查官方入口并记录到 source_audit；如页面为动态榜单，仍以点开官方页为最终核对。"
        : "本轮已检查官方入口，但未解析到当日可入选条目；保留为追踪面而非事实更新。"
    };
  }
  return {
    status: "blocked",
    verificationStatus: "unverified",
    changeStatus: "blocked",
    changeSummary: "本轮官方入口抓取受阻，不能确认榜单是否变化。",
    evidenceNote: `source_audit status=${source.status || "blocked"}${source.notes ? `; notes=${source.notes}` : ""}`,
    verificationNote: `本轮固定入口抓取受阻：${source.notes || source.status || "blocked"}。`
  };
}

function nonPrimaryDisclosureFields(candidate) {
  const sourceLevel = candidate.source_level || sourceLevelForCandidate(candidate);
  const verificationStatus = candidate.verification_status || (PRIMARY_STATUSES.has(candidate.verification_status) ? candidate.verification_status : "intermediary_only");
  return {
    source_level: sourceLevel,
    verification_status: verificationStatus,
    verification_note: candidate.verification_note || (PRIMARY_STATUSES.has(verificationStatus)
      ? "事实来自可回看的原始链接。"
      : "该来源仅作为线索，事实性结论需要一手来源或多源确认。"),
    risk_note: candidate.risk_note || "融资、价格、benchmark、安全事故、监管和模型能力等高风险事实不得仅凭该线索写入主体。"
  };
}

function mergeSourceAudit(target, audit) {
  if (!audit || typeof audit !== "object") return;
  for (const [groupName, group] of Object.entries(audit)) {
    if (!group || typeof group !== "object") continue;
    if (!target[groupName]) {
      target[groupName] = {
        ...group,
        sources: Array.isArray(group.sources) ? [...group.sources] : []
      };
      continue;
    }
    const existing = target[groupName];
    existing.sources = dedupeAuditSources([...(existing.sources || []), ...(Array.isArray(group.sources) ? group.sources : [])]);
    existing.candidates_found = (Number(existing.candidates_found) || 0) + (Number(group.candidates_found) || 0);
    existing.included = 0;
    existing.notes = [existing.notes, group.notes].filter(Boolean).join(" ");
    for (const [key, value] of Object.entries(group)) {
      if (!(key in existing) && key !== "sources") {
        existing[key] = value;
      }
    }
  }
}

function updateAuditIncludedCounts(sourceAudit, candidates) {
  const audit = {};
  for (const groupName of REQUIRED_AUDIT_GROUPS) {
    audit[groupName] = sanitizeReportAuditGroup(sourceAudit[groupName] || emptyAuditGroup(groupName));
    const included = candidates.filter((candidate) => candidate.status === "included" && auditGroupForCandidate(candidate) === groupName).length;
    const candidatesFound = Number.isInteger(audit[groupName].candidates_found) ? audit[groupName].candidates_found : included;
    audit[groupName].included = Math.min(included, candidatesFound);
  }
  return audit;
}

function sanitizeReportAuditGroup(group) {
  const sanitized = {};
  for (const [key, value] of Object.entries(group || {})) {
    if (!REPORT_AUDIT_GROUP_FIELDS.has(key)) continue;
    if (key === "sources") {
      sanitized.sources = Array.isArray(value) ? value.map(sanitizeReportAuditSource) : [];
    } else {
      sanitized[key] = value;
    }
  }
  sanitized.checked = typeof sanitized.checked === "boolean" ? sanitized.checked : true;
  sanitized.sources = Array.isArray(sanitized.sources) ? sanitized.sources : [];
  sanitized.candidates_found = Math.max(0, Number.isInteger(sanitized.candidates_found) ? sanitized.candidates_found : 0);
  sanitized.included = Math.max(0, Number.isInteger(sanitized.included) ? sanitized.included : 0);
  sanitized.notes = typeof sanitized.notes === "string" ? sanitized.notes : "";
  return sanitized;
}

function sanitizeReportAuditSource(source) {
  return {
    name: source?.name || "Unknown source",
    url: isHttpUrl(source?.url) ? source.url : "https://example.com/",
    status: source?.status || "no_signal",
    ...(source?.notes ? { notes: String(source.notes) } : {})
  };
}

function auditGroupForCandidate(candidate) {
  const source = `${candidate.source_id || ""} ${candidate.source || ""}`.toLowerCase();
  if (source.includes("github") && source.includes("trending")) return "github_trending";
  if (source.includes("builder") || source.includes("follow-builders") || candidate.category === "builder_observation") return "builder_sources";
  if (source.startsWith("search-") || source.includes("gdelt") || source.includes("openalex")) return "search_sources";
  return "content_sources";
}

function dedupeAuditSources(sources) {
  const seen = new Set();
  return sources.filter((source) => {
    const key = `${source?.name || ""} ${source?.url || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function addSourcesFromAudit(sourceMap, audit, generatedAt) {
  if (!audit || typeof audit !== "object") return;
  for (const [groupName, group] of Object.entries(audit)) {
    const category = groupName === "github_trending" ? "github_trending" : groupName === "builder_sources" ? "builder" : "community";
    for (const source of Array.isArray(group?.sources) ? group.sources : []) {
      addCandidateSource(sourceMap, {
        id: sourceIdFromAuditSource(groupName, source),
        name: source.name || groupName,
        url: source.url || "https://example.com/",
        category,
        status: source.status,
        checked_at: generatedAt,
        notes: source.notes || ""
      }, generatedAt);
    }
  }
}

function sourceIdFromAuditSource(groupName, source) {
  const prefix = groupName === "github_trending" ? "github" : groupName === "builder_sources" ? "builder" : groupName === "search_sources" ? "search" : "content";
  return `${prefix}-${slugId(source?.name || source?.url || groupName) || "source"}`;
}

function addCandidateSource(sourceMap, source, generatedAt) {
  const id = source?.id || slugId(source?.name || source?.url || "source");
  if (!id) return;
  const status = CANDIDATE_SOURCE_STATUSES.has(source.status) ? source.status : source.status === "skipped_manual_review_required" || String(source.status || "").startsWith("skipped") ? "blocked" : "no_signal";
  const normalized = {
    id,
    name: source.name || id,
    url: isHttpUrl(source.url) ? source.url : "https://example.com/",
    category: candidateSourceCategory(source.category),
    status,
    checked_at: source.checked_at || generatedAt,
    notes: source.notes || ""
  };
  if (!sourceMap.has(id)) {
    sourceMap.set(id, normalized);
  }
}

function normalizeCandidate(rawCandidate, context) {
  const id = uniqueCandidateId(context.existing, rawCandidate.id || `${rawCandidate.source_id || rawCandidate.source}-${rawCandidate.title || rawCandidate.url}`);
  const sourceId = rawCandidate.source_id || sourceIdFromCandidate(rawCandidate);
  if (!context.sourceMap.has(sourceId)) {
    addCandidateSource(context.sourceMap, {
      id: sourceId,
      name: rawCandidate.source || sourceId,
      url: rawCandidate.source_url || rawCandidate.url || "https://example.com/",
      category: sourceCategoryForCandidate(rawCandidate),
      status: "checked",
      checked_at: context.generatedAt,
      notes: "synthesized from discovery candidate"
    }, context.generatedAt);
  }

  const candidate = {
    id,
    source_id: sourceId,
    category: normalizedCandidateCategory(rawCandidate.category),
    title: trimText(rawCandidate.title || rawCandidate.name || rawCandidate.repo || rawCandidate.url, 180),
    url: rawCandidate.url,
    source: rawCandidate.source || sourceNameForSourceId(context.sourceMap, sourceId),
    event_date: dateOnly(rawCandidate.event_date) || context.reportDate,
    status: rawCandidate.status === "included" ? "included" : "excluded",
    ...(rawCandidate.included_in ? { included_in: rawCandidate.included_in } : {}),
    ...(rawCandidate.evidence ? { evidence: trimText(rawCandidate.evidence, 320) } : {}),
    ...(rawCandidate.author ? { author: rawCandidate.author } : {}),
    ...(rawCandidate.handle ? { handle: rawCandidate.handle } : {}),
    ...(rawCandidate.original_text ? { original_text: trimText(rawCandidate.original_text, 500) } : {}),
    ...(rawCandidate.avatar_url ? { avatar_url: rawCandidate.avatar_url } : {}),
    ...(rawCandidate.avatar_local_path ? { avatar_local_path: rawCandidate.avatar_local_path } : {}),
    ...(rawCandidate.image_url ? { image_url: rawCandidate.image_url } : {}),
    ...(rawCandidate.image_alt ? { image_alt: rawCandidate.image_alt } : {}),
    ...(rawCandidate.image_source ? { image_source: rawCandidate.image_source } : {}),
    ...(rawCandidate.notes ? { notes: trimText(rawCandidate.notes, 400) } : {}),
    ...(rawCandidate.intermediary_url ? { intermediary_url: rawCandidate.intermediary_url } : {}),
    ...(rawCandidate.primary_url ? { primary_url: rawCandidate.primary_url } : {}),
    ...(rawCandidate.original_url ? { original_url: rawCandidate.original_url } : {}),
    ...(rawCandidate.verification_status ? { verification_status: rawCandidate.verification_status } : {}),
    ...(rawCandidate.source_level ? { source_level: rawCandidate.source_level } : {}),
    ...(rawCandidate.verification_note ? { verification_note: rawCandidate.verification_note } : {}),
    ...(rawCandidate.risk_note ? { risk_note: rawCandidate.risk_note } : {}),
    ...(rawCandidate.reader_relevance ? { reader_relevance: rawCandidate.reader_relevance } : {}),
    ...(Array.isArray(rawCandidate.verification_sources) ? { verification_sources: rawCandidate.verification_sources.filter(isHttpUrl) } : {})
  };
  const editorialCategory = rawCandidate.editorial_category || inferredEditorialCategory(candidate);
  if (editorialCategory) {
    candidate.editorial_category = editorialCategory;
  }
  if (!candidate.source_level) {
    candidate.source_level = sourceLevelForCandidate(candidate);
  }
  if (!candidate.verification_status && candidate.source_level && TRUSTED_PRIMARY_SOURCE_LEVELS.has(candidate.source_level)) {
    candidate.verification_status = candidate.source_level === "multi_source" ? "multi_source_confirmed" : "primary_confirmed";
  }
  return candidate;
}

function markIncludedCandidate(candidate, category, includedIn) {
  candidate.category = category;
  candidate.status = "included";
  candidate.included_in = includedIn;
  return candidate;
}

function derivedCandidate(candidate, options) {
  const clone = {
    ...candidate,
    id: uniqueCandidateId(options.existing, `${options.idPrefix}-${candidate.id}`),
    category: options.category,
    status: "included",
    included_in: options.includedIn
  };
  return clone;
}

function cloneCandidates(candidates) {
  return candidates.map((candidate) => ({ ...candidate }));
}

function canPromoteToMain(candidate) {
  if (candidate.category === "builder_observation") return false;
  if (candidate.category === "project") return false;
  if (isStatuspageCandidate(candidate)) return false;
  if (isSearchShadowCandidate(candidate)) return false;
  if (isKnownIntermediaryCandidate(candidate)) return false;
  if (isGitHubTrendingCandidate(candidate, {})) return false;
  if (isHardcoreResearchOnly(candidate)) return false;
  if (!isReaderRelevantCandidate(candidate)) return false;
  if (candidate.verification_status && !PRIMARY_STATUSES.has(candidate.verification_status)) return false;
  const sourceLevel = sourceLevelForCandidate(candidate);
  if (candidate.category === "hot_blog" && !["official", "paper", "github", "multi_source"].includes(sourceLevel)) {
    return false;
  }
  const trustedSourceLevel = TRUSTED_PRIMARY_SOURCE_LEVELS.has(sourceLevel);
  return trustedSourceLevel && (!candidate.verification_status || PRIMARY_STATUSES.has(candidate.verification_status));
}

function candidateScore(candidate) {
  let score = 0;
  if (PRIMARY_STATUSES.has(candidate.verification_status)) score += 30;
  if (candidate.source_level === "official" || candidate.source_level === "primary") score += 20;
  if (candidate.source_level === "official_company_news") score += 22;
  if (candidate.source_level === "official_open_source_account" || candidate.source_level === "official_model_host_account") score += 18;
  if (candidate.source_level === "paper" || candidate.source_level === "paper_api") score += 4;
  if (candidate.source_level === "github") score += 10;
  if (candidate.category === "main_item") score += 10;
  if (candidate.category === "hot_blog") score += 6;
  if (candidate.editorial_category === "company_business") score += 10;
  if (candidate.editorial_category === "product_radar" || candidate.editorial_category === "open_source") score += 8;
  if (isReaderRelevantCandidate(candidate)) score += 6;
  score += readerUtilityScore(candidate);
  if (isAigcCandidate(candidate)) score += 8;
  if (candidate.image_url) score += 4;
  if (/openai|anthropic|deepmind|google|meta|qwen|bytedance|tencent|minimax|kimi|runway|pika|luma|kling|nvidia|adobe/i.test(`${candidate.source} ${candidate.title}`)) score += 5;
  return score;
}

function isGitHubTrendingCandidate(candidate, meta = {}) {
  return Boolean(
    meta.repo ||
    /github trending/i.test(`${candidate.source || ""} ${candidate.evidence || ""} ${candidate.notes || ""}`) ||
    /github[-_]trending|github-github-trending/i.test(candidate.source_id || "")
  );
}

function publicGithubTrendingCandidates(candidates) {
  const dailyAllLanguage = candidates
    .filter(({ candidate, meta }) => isDailyAllLanguageGithubTrending(candidate, meta))
    .sort((left, right) => rankOf(left.meta, 999) - rankOf(right.meta, 999));
  const ranked = dailyAllLanguage.length >= 10 ? dailyAllLanguage : candidates;
  return dedupeRankedGithubCandidates(ranked);
}

function isDailyAllLanguageGithubTrending(candidate, meta = {}) {
  const source = `${candidate.source || ""} ${candidate.source_id || ""} ${candidate.source_url || ""} ${meta.source_url || ""} ${candidate.url || ""}`.toLowerCase();
  const window = String(meta.window || candidate.window || "").toLowerCase();
  const sourceLooksDaily = source.includes("trending?since=daily") || source.includes("github trending daily") || source.includes("github-trending-daily");
  const languageFilteredSource = /github\.com\/trending\/[^?\s]+/.test(source) || /github trending (python|typescript|javascript|go|rust|java|c\+\+|c#|php|ruby|swift|kotlin|scala) daily/.test(source);
  return sourceLooksDaily && (window === "daily" || sourceLooksDaily) && !languageFilteredSource;
}

function dedupeRankedGithubCandidates(candidates) {
  const seenRepos = new Set();
  const seenRanks = new Set();
  const picked = [];
  for (const entry of candidates.sort((left, right) => rankOf(left.meta, 999) - rankOf(right.meta, 999))) {
    const repo = (entry.meta.repo || repoFromUrl(entry.candidate.url) || entry.candidate.title || "").toLowerCase();
    const rank = rankOf(entry.meta, picked.length + 1);
    if (repo && seenRepos.has(repo)) continue;
    if (rank >= 1 && rank <= 10 && seenRanks.has(rank)) continue;
    if (repo) seenRepos.add(repo);
    if (rank >= 1 && rank <= 10) seenRanks.add(rank);
    picked.push(entry);
    if (picked.length >= 10) break;
  }
  return picked;
}

function isAigcCandidate(candidate) {
  return candidate.editorial_category === "content_aigc" || candidate.source_level === "aigc_content_industry" || AIGC_RE.test(candidateText(candidate));
}

function isAiRelevantCandidate(candidate) {
  const text = candidateText(candidate);
  return AIGC_RE.test(text) || AI_RELEVANCE_RE.test(text);
}

function isReaderRelevantCandidate(candidate) {
  if (hasPlainReaderSignal(candidate)) return true;
  if (isHardcoreResearchOnly(candidate)) return false;
  if (isAiRelevantCandidate(candidate)) return true;
  const sourceLevel = sourceLevelForCandidate(candidate);
  const text = candidateText(candidate);
  if (sourceLevel === "official_company_news") {
    return COMPANY_ACTION_RE.test(text) || PRODUCT_PLATFORM_RE.test(text);
  }
  if (READER_RELEVANT_SOURCE_LEVELS.has(sourceLevel)) {
    return COMPANY_ACTION_RE.test(text) || PRODUCT_PLATFORM_RE.test(text);
  }
  return TRUSTED_PRIMARY_SOURCE_LEVELS.has(sourceLevel) && (COMPANY_ACTION_RE.test(text) || PRODUCT_PLATFORM_RE.test(text));
}

function hasPlainReaderSignal(candidate) {
  const category = candidate.editorial_category || inferredEditorialCategory(candidate);
  if (["company_business", "product_radar", "open_source", "content_aigc"].includes(category)) return true;
  const sourceLevel = sourceLevelForCandidate(candidate);
  const text = candidateText(candidate);
  if (AIGC_RE.test(text)) return true;
  if (sourceLevel === "official_company_news") {
    return COMPANY_ACTION_RE.test(text) || PRODUCT_PLATFORM_RE.test(text) || PLAIN_READER_SIGNAL_RE.test(text);
  }
  if (sourceLevel === "official_open_source_account" || sourceLevel === "official_model_host_account" || sourceLevel === "github") {
    return PRODUCT_PLATFORM_RE.test(text) || PLAIN_READER_SIGNAL_RE.test(text);
  }
  return PLAIN_READER_SIGNAL_RE.test(text);
}

function isHardcoreResearchOnly(candidate) {
  const sourceLevel = sourceLevelForCandidate(candidate);
  const text = candidateText(candidate);
  const researchSource = sourceLevel === "paper" || sourceLevel === "paper_api" || /\barxiv\b|openalex|semantic scholar|research paper/i.test(`${candidate.source_id || ""} ${candidate.source || ""} ${candidate.url || ""}`);
  return researchSource && HARDCORE_RESEARCH_RE.test(text) && !hasPlainReaderSignal(candidate);
}

function readerUtilityScore(candidate) {
  let score = 0;
  const category = candidate.editorial_category || inferredEditorialCategory(candidate);
  if (category === "company_business") score += 18;
  if (category === "product_radar") score += 16;
  if (category === "open_source") score += 14;
  if (category === "content_aigc") score += 14;
  if (hasPlainReaderSignal(candidate)) score += 12;
  if (COMPANY_ACTION_RE.test(candidateText(candidate))) score += 8;
  if (PRODUCT_PLATFORM_RE.test(candidateText(candidate))) score += 8;
  if (isHardcoreResearchOnly(candidate)) score -= 30;
  return score;
}

function canPromoteToBuilderObservation(candidate) {
  const text = candidateText(candidate);
  if (!text || BUILDER_IRRELEVANT_RE.test(text)) return false;
  if (!candidate.url && !candidate.original_url) return false;
  return BUILDER_RELEVANCE_RE.test(text);
}

function isStatuspageCandidate(candidate) {
  const text = `${candidate.source_id || ""} ${candidate.source || ""} ${candidate.url || ""} ${candidate.title || ""}`.toLowerCase();
  return text.includes("statuspage") || text.includes("status page") || text.includes("status.openai.com") || text.includes("status.claude.com") || /\bincident\b/.test(text);
}

function isKnownIntermediaryCandidate(candidate) {
  return INTERMEDIARY_SOURCE_RE.test(`${candidate.source_id || ""} ${candidate.source || ""} ${candidate.url || ""}`);
}

function isSearchShadowCandidate(candidate) {
  return /(^|[\s-])(search|gdelt|openalex|semantic-scholar|serpapi|tavily|brave|exa)([\s-]|$)/i.test(
    `${candidate.source_id || ""} ${candidate.source || ""}`
  );
}

function inferredEditorialCategory(candidate) {
  const text = candidateText(candidate);
  if (AIGC_RE.test(text)) return "content_aigc";
  if (sourceLevelForCandidate(candidate) === "official_company_news" && COMPANY_ACTION_RE.test(text)) return "company_business";
  if (sourceLevelForCandidate(candidate) === "official_model_host_account") return "model_release";
  if (sourceLevelForCandidate(candidate) === "official_open_source_account") return "open_source";
  if (PRODUCT_PLATFORM_RE.test(text) && /github|open[-\s]?source|repo|repository|hugging face|开源|仓库/i.test(text)) return "open_source";
  if (COMPANY_ACTION_RE.test(text) && /earnings|quarterly|financial|revenue|profit|layoffs?|job cuts?|reorganization|restructuring|organization|leadership|conference|summit|keynote|财报|业绩|营收|利润|裁员|组织|重组|管理层|大会|峰会|发布会/i.test(text)) return "company_business";
  if (/model|gpt|claude|gemini|qwen|llm|benchmark|eval|reasoning|推理|模型/i.test(text)) return "ai_industry";
  if (/policy|governance|regulation|safety|安全|监管|治理|政策/i.test(text)) return "policy_infra";
  if (/funding|acquisition|ipo|融资|收购|估值/i.test(text)) return "funding";
  if (/github|open source|repo|开源|仓库/i.test(text)) return "open_source";
  if (/agent|developer|tool|ide|copilot|codex|claude code|工具|开发|工程/i.test(text)) return "engineering_toolchain";
  if (/product|launch|app|平台|产品|发布/i.test(text)) return "product_radar";
  return "ai_industry";
}

function sourceLevelForCandidate(candidate) {
  const text = `${candidate.source || ""} ${candidate.url || ""} ${candidate.source_id || ""}`.toLowerCase();
  if (isKnownIntermediaryCandidate(candidate)) return "intermediary";
  if (candidate.source_level) return candidate.source_level;
  if (text.includes("github")) return "github";
  if (text.includes("arxiv")) return "paper";
  if (/reddit|hacker news|hnrss|wechat|36kr|qbitai|leiphone|infoq|techcrunch|verge|venturebeat|fast company|google news/i.test(text)) {
    return "intermediary";
  }
  if (/openai|anthropic|deepmind|google|ai\.meta|x\.ai|mistral|qwen|alibabacloud|bytedance|tencent|minimax|kimi|zhipu|microsoft|nvidia|aws|azure|apple|adobe|runway|pika|luma/i.test(text)) {
    return "official";
  }
  return "primary";
}

function tierForCandidate(candidate) {
  if (candidate.source_level === "official" || candidate.source_level === "primary" || candidate.source_level === "official_company_news") return "T0";
  if (candidate.source_level === "official_open_source_account" || candidate.source_level === "official_model_host_account") return "T1";
  if (candidate.source_level === "paper" || candidate.source_level === "github") return "T2";
  if (candidate.source_level === "multi_source") return "T1";
  return "T3";
}

function chineseSummary(candidate, category) {
  const source = candidate.source || "来源";
  const title = trimText(candidate.title, 90);
  const evidence = trimText(candidate.evidence || candidate.title, 150);
  const lead = chineseLeadForCandidate(candidate);
  if (category === "content_aigc") {
    return `${source}：${lead || title}。这条内容生成线索的关键信息是：${evidence}`;
  }
  return `${source}：${lead || title}。读者应先看原文给出的变化、适用对象和落地边界；${evidence}`;
}

function chineseGithubDescription(description, repo) {
  if (hasChineseText(description)) {
    return trimText(description, 140);
  }
  const clean = trimText(String(description || "").replace(/\s+/g, " "), 120);
  const domains = projectDomains(description).slice(0, 2).join("、") || "AI tooling";
  return clean && clean.toLowerCase() !== repo.toLowerCase()
    ? `${repo}：${clean}。关注点是 ${domains} 场景下是否有可复用实现、README 示例和近期维护。`
    : `${repo}：关注 README、示例和近期提交，判断它是否能补上 ${domains} 场景里的工程缺口。`;
}

function projectDomains(text) {
  const lower = String(text || "").toLowerCase();
  const domains = [];
  if (/agent|workflow|mcp/.test(lower)) domains.push("agent");
  if (/video|image|aigc|generative|game|3d/.test(lower)) domains.push("AIGC");
  if (/rag|retrieval|document|pdf/.test(lower)) domains.push("RAG");
  if (/eval|benchmark|test/.test(lower)) domains.push("eval");
  if (/infra|deploy|runtime|server/.test(lower)) domains.push("infra");
  return domains.length > 0 ? domains : ["AI tooling"];
}

function chineseLeadForCandidate(candidate) {
  const title = String(candidate.title || "");
  const evidence = String(candidate.evidence || "");
  const text = `${title} ${evidence}`.toLowerCase();
  if (/dreaming.*memory|better memory.*chatgpt|chatgpt.*memory/.test(text)) {
    return "OpenAI 介绍 ChatGPT 的新记忆系统，重点是让产品更稳定地记住用户偏好，并在多轮对话中保留更有用的上下文";
  }
  if (/biodefense|biological resilience/.test(text)) {
    return "OpenAI 发布 AI 时代生物防御行动计划，把模型能力与生物安全、监测和应急响应放在同一套韧性框架里讨论";
  }
  if (/nemotron 3 ultra.*sagemaker|sagemaker.*nemotron 3 ultra/.test(text)) {
    return "AWS 将 NVIDIA Nemotron 3 Ultra 放进 SageMaker JumpStart，卖点是面向 agentic workload 的推理速度和成本优化";
  }
  if (/nemotron 3 ultra|long-running agents/.test(text)) {
    return "NVIDIA 介绍 Nemotron 3 Ultra 面向长程 agent 的推理能力，重点在多轮上下文、工具使用和推理效率";
  }
  if (/nemotron 3\.5 content safety|multimodal safety/.test(text)) {
    return "Hugging Face/NVIDIA 介绍 Nemotron 3.5 Content Safety，重点是面向企业 AI 的可定制多模态安全分类和治理能力";
  }
  if (/streaming communication.*multi-agent|streamma/.test(text)) {
    return "这篇论文提出 StreamMA，让多智能体推理在生成过程中流式传递中间信息，目标是降低深层 agent pipeline 的端到端延迟";
  }
  if (/distributional dagger|reinforcement learning from rich feedback/.test(text)) {
    return "这篇论文讨论用更丰富的反馈训练推理模型，试图突破只依赖可验证奖励的窄化 RLVR 配方";
  }
  if (/endava.*software delivery|software delivery.*ai agents/.test(text)) {
    return "OpenAI 用 Endava 案例说明企业如何把 ChatGPT Enterprise、Codex 和 agent 工作流放进软件交付流程";
  }
  if (/claude partner network|services track|partner hub/.test(text)) {
    return "Anthropic 扩展 Claude Partner Network，新增服务轨道和 Partner Hub，目标是让咨询、系统集成和企业落地路径更清晰";
  }
  if (/data security center|alibaba cloud/.test(text)) {
    return "阿里云介绍 Data Security Center，重点是云上数据识别、风险治理和安全运营能力";
  }
  if (/hydrology framework|flood resilience/.test(text)) {
    return "Google Research 开源水文预测相关框架，面向洪水韧性和气候风险建模场景";
  }
  if (/heart health|smartphone camera/.test(text)) {
    return "Google Research 探索用手机摄像头做被动心脏健康监测，核心问题是移动端感知和健康信号建模";
  }
  if (/personal intelligence|dreambeans|google apps/.test(text)) {
    return "Google Labs 展示个人智能实验，用用户授权的 Google 应用上下文生成个性化故事流";
  }
  if (/business analytics.*claude|automated.*analytics/.test(text)) {
    return "Anthropic 数据团队案例显示，Claude 被用于自动化大量业务分析查询，并配套 eval、消融和线上验证";
  }
  return "";
}

function displayTitleForCandidate(candidate) {
  return trimText(chineseLeadForCandidate(candidate) || candidate.title, 120);
}

function sourceGroundedFact(candidate, original) {
  const title = trimText(candidate.title, 110);
  const evidence = trimText(candidate.evidence || original?.evidence || "", 170);
  const lead = chineseLeadForCandidate(candidate);
  if (lead) {
    return `${lead}${title ? `（原文标题：${title}）` : ""}`;
  }
  if (!evidence || evidence === title) return title;
  return `${title}；${evidence}`;
}

function readerImpactForCandidate(candidate, category) {
  const text = candidateText(candidate);
  if (category === "company_business") {
    return "它能帮助读者判断大厂的资源投入、组织重心和商业优先级是否正在改变";
  }
  if (category === "product_radar") {
    return "它提示某个产品、平台或服务是否接近可试用、可采购或需要重新评估";
  }
  if (category === "open_source") {
    return "它影响开发者和产品团队能否直接复用官方代码、模型权重、示例或社区生态";
  }
  if (category === "content_aigc" || AIGC_RE.test(text)) {
    return "它可能改变内容生产、素材生成或创作者工具链的成本与交付方式";
  }
  if (/agent|workflow|mcp|tool|developer|coding|codex|copilot|cursor/i.test(text)) {
    return "它会影响 agent、开发工具或自动化工作流的选型和接入优先级";
  }
  if (/benchmark|eval|paper|research|arxiv|reasoning|long context|memory/i.test(text)) {
    return "它提供了评测、研究或能力边界的新参照，适合更新内部判断标准";
  }
  if (/policy|safety|governance|regulation|security/i.test(text)) {
    return "它会影响合规、安全或平台治理口径，适合进入风险观察清单";
  }
  return "它反映了 AI 产品、模型或平台策略的实际变化，适合判断是否影响产品路线、架构选择或风险预案";
}

function readerWatchForCandidate(candidate, category) {
  const text = candidateText(candidate);
  if (category === "company_business") {
    return "看它是否涉及裁员、组织调整、财报指引、发布会、合作伙伴和重点业务投入";
  }
  if (category === "product_radar") {
    return "看是否有明确入口、价格、地区、权限、目标用户和后续发布时间";
  }
  if (category === "open_source") {
    return "看仓库活跃度、README、许可证、模型卡、下载限制和是否有真实案例";
  }
  if (category === "content_aigc" || AIGC_RE.test(text)) {
    return "看它是否给出可试用入口、生成质量样例、版权/商用边界和价格变化";
  }
  if (/agent|workflow|mcp|tool|developer|coding|codex|copilot|cursor/i.test(text)) {
    return "看 API、权限、上下文管理、失败恢复和团队内落地成本";
  }
  if (/benchmark|eval|paper|research|arxiv|reasoning|long context|memory/i.test(text)) {
    return "看实验设置、数据集、可复现代码和与现有模型/工具的差异";
  }
  if (/policy|safety|governance|regulation|security/i.test(text)) {
    return "看生效范围、执行主体、例外条款和对产品上线流程的影响";
  }
  return "看是否有明确发布时间、产品入口、开发者文档和可验证的用户影响";
}

function audienceRelevanceForCandidate(candidate, category) {
  const text = candidateText(candidate);
  if (category === "company_business") {
    return "不直接做 AI 的读者也可用它判断行业风向、就业与供应商策略、合作和采购风险";
  }
  if (category === "product_radar") {
    return "产品、运营和业务团队可用它判断是否需要试用、替换工具或调整路线图";
  }
  if (category === "open_source") {
    return "技术和产品团队可用它判断是否值得跟进仓库、模型权重或生态工具";
  }
  if (category === "content_aigc" || AIGC_RE.test(text)) {
    return "内容、设计和产品团队可用它判断生成式工具是否值得进入试用或采购清单";
  }
  if (/agent|workflow|mcp|tool|developer|coding|codex|copilot|cursor/i.test(text)) {
    return "研发团队可用它评估 agent 平台、开发工具和自动化流程的迁移时机";
  }
  if (/benchmark|eval|paper|research|arxiv|reasoning|long context|memory/i.test(text)) {
    return "算法、平台和评测团队可用它更新能力边界和内部实验设计";
  }
  if (/policy|safety|governance|regulation|security/i.test(text)) {
    return "安全、合规和平台团队可用它更新风险登记、上线检查和治理口径";
  }
  return "产品和工程团队可用它判断是否需要调整选型、试点范围或内部风险提示";
}

function themeLabelForCandidate(candidate) {
  const text = candidateText(candidate);
  if (AIGC_RE.test(text)) return "内容生成";
  if (sourceLevelForCandidate(candidate) === "official_company_news" || /earnings|layoffs?|reorganization|leadership|conference|财报|裁员|组织|发布会/i.test(text)) return "大厂与业务动向";
  if (sourceLevelForCandidate(candidate) === "official_open_source_account" || sourceLevelForCandidate(candidate) === "official_model_host_account") return "官方开源与模型账号";
  if (/agent|workflow|mcp|tool|developer|coding|codex|copilot|cursor/i.test(text)) return "agent 与开发工具";
  if (/benchmark|eval|paper|research|arxiv|reasoning|long context|memory/i.test(text)) return "模型研究与评测";
  if (/policy|safety|governance|regulation|security/i.test(text)) return "安全治理";
  if (/open source|github|repo/i.test(text)) return "开源项目";
  return "产品与平台动态";
}

function hotBlogSummary(candidate) {
  const claim = hotBlogClaimForCandidate(candidate);
  const evidence = hotBlogEvidenceForCandidate(candidate);
  const action = hotBlogActionForCandidate(candidate);
  return trimText(`${claim}。${evidence}。${action}。`, 220);
}

function hotBlogClaimForCandidate(candidate) {
  const text = candidateText(candidate);
  if (/agent|workflow|mcp|tool|developer|coding|codex|copilot|cursor/i.test(text)) {
    return "文章拆解 agent、开发工具或自动化流程里的任务规划、权限、上下文、工具调用和失败恢复";
  }
  if (/benchmark|eval|paper|research|arxiv|reasoning|long context|memory/i.test(text)) {
    return "文章梳理模型评测或研究结论怎样改变能力边界、成本预期和可靠性判断";
  }
  if (/policy|safety|governance|regulation|security/i.test(text)) {
    return "文章说明安全、治理或平台规则会怎样变成团队需要执行的产品和上线约束";
  }
  if (AIGC_RE.test(text)) {
    return "文章分析内容生成工具怎样改变素材生产、创作流程、质量判断或商业边界";
  }
  return "文章梳理一个 AI 产品、平台或工程实践的具体变化，而不是只给观点";
}

function hotBlogEvidenceForCandidate(candidate) {
  const text = candidateText(candidate);
  if (/code|repo|github|open source|readme|sdk|api|mcp/i.test(text)) {
    return "需要核对代码、接口、README、案例或失败模式，判断作者结论是否能复用";
  }
  if (/paper|arxiv|benchmark|eval|dataset|leaderboard/i.test(text)) {
    return "需要核对实验设置、数据来源、对比基线、可复现代码和作者承认的限制";
  }
  if (/product|launch|platform|enterprise|workflow|agent/i.test(text)) {
    return "需要核对真实场景、接入门槛、价格、可用地区、案例证据和工作流限制";
  }
  return "需要核对作者列出的证据、适用前提、反例和没有覆盖的边界";
}

function hotBlogActionForCandidate(candidate) {
  const text = candidateText(candidate);
  if (/agent|workflow|tool|coding|developer|mcp/i.test(text)) {
    return "适合判断这类工具是否值得试点、采购或进入内部自动化路线图";
  }
  if (/model|llm|benchmark|eval|reasoning|context/i.test(text)) {
    return "适合更新对模型能力的预期，避免只记住排行榜或单个指标";
  }
  if (/policy|security|safety|governance|regulation/i.test(text)) {
    return "适合进入合规、安全或平台治理的风险清单";
  }
  if (AIGC_RE.test(text)) {
    return "适合判断这类工具是否值得试用、采购或进入内容生产流程";
  }
  return "适合判断它是否会影响产品路线、工具选型或内部风险预案";
}

function hotBlogFocusForCandidate(candidate) {
  const text = candidateText(candidate);
  if (/agent|workflow|mcp|tool|developer|coding|codex|copilot|cursor/i.test(text)) {
    return "它怎样把 agent、开发工具或自动化流程拆成可采用的产品和工程边界";
  }
  if (/benchmark|eval|paper|research|arxiv|reasoning|long context|memory/i.test(text)) {
    return "它用哪些实验或评测说明模型能力边界，以及这些结论能否被复核";
  }
  if (/policy|safety|governance|regulation|security/i.test(text)) {
    return "它怎样把安全、治理或平台规则转成团队需要跟进的实际约束";
  }
  if (AIGC_RE.test(text)) {
    return "它怎样改变内容生产、素材生成或创作者工作流里的成本和质量判断";
  }
  return "它反映的产品方向、平台策略或使用方式是否已经接近普通团队的日常选择";
}

function hotBlogReadingAngle(candidate) {
  const text = candidateText(candidate);
  if (/code|repo|github|open source|readme|sdk|api|mcp/i.test(text)) {
    return "是否有代码、接口、README、案例或失败模式，而不只看作者结论";
  }
  if (/paper|arxiv|benchmark|eval|dataset|leaderboard/i.test(text)) {
    return "实验设置、数据来源、对比基线和作者承认的限制";
  }
  if (/product|launch|platform|enterprise|workflow|agent/i.test(text)) {
    return "它对应的真实使用场景、接入门槛和会影响哪些团队决策";
  }
  return "作者给出的证据、适用前提和没有覆盖的反例";
}

function hotBlogReaderValue(candidate) {
  const text = candidateText(candidate);
  if (/agent|workflow|tool|coding|developer|mcp/i.test(text)) {
    return "判断 agent 工具是否已经从演示走向可试点的工作流";
  }
  if (/model|llm|benchmark|eval|reasoning|context/i.test(text)) {
    return "更新对模型能力、成本和可靠性的预期，而不是只记住排行榜名次";
  }
  if (/policy|security|safety|governance|regulation/i.test(text)) {
    return "提前看到合规、安全和平台治理可能带来的使用边界";
  }
  return "快速判断这条技术观点是否会影响产品路线、工具选型或风险预案";
}

function builderReadableSummary(originalText) {
  const text = trimText(originalText, 220);
  if (/agent|eval|production|workflow|tool|coding|codex|cursor|copilot/i.test(text)) {
    return `这条原帖讨论 AI 工具或 agent 实践：${text}`;
  }
  if (/model|llm|openai|anthropic|claude|gemini|gpt/i.test(text)) {
    return `这条原帖讨论模型或产品变化：${text}`;
  }
  return `这条原帖与 AI 生态有关：${text}`;
}

function topicForCandidate(candidate) {
  if (isAigcCandidate(candidate)) return "AIGC / content generation";
  if (/agent|tool|developer|coding/i.test(candidateText(candidate))) return "AI engineering tools";
  if (/research|paper|arxiv|eval/i.test(candidateText(candidate))) return "research / evaluation";
  return "AI industry";
}

function mainEntity(candidate) {
  try {
    const host = new URL(candidate.url).hostname.replace(/^www\./, "");
    return candidate.source || host;
  } catch {
    return candidate.source || "";
  }
}

function emptyAuditGroup(groupName) {
  return {
    checked: true,
    sources: [
      {
        name: `Missing ${groupName} discovery output`,
        url: "https://example.com/",
        status: "no_signal",
        notes: "report:draft did not receive this discovery output"
      }
    ],
    candidates_found: 0,
    included: 0,
    notes: "No discovery output was supplied for this group."
  };
}

function candidateText(candidate) {
  return [
    candidate.title,
    candidate.source,
    candidate.evidence,
    candidate.notes,
    candidate.reader_relevance,
    candidate.image_alt
  ].filter(Boolean).join(" ");
}

function normalizedCandidateCategory(category) {
  return ["main_item", "github_trending", "model_release", "hot_blog", "project", "builder_observation", "community_lead"].includes(category)
    ? category
    : category === "blog"
      ? "hot_blog"
      : "community_lead";
}

function candidateSourceCategory(category) {
  return ["official_release", "github_trending", "builder", "blog", "project", "community", "model_registry", "repository", "other"].includes(category)
    ? category
    : category === "intermediary" || category === "x_hotspot"
      ? "community"
      : "other";
}

function sourceCategoryForCandidate(candidate) {
  if (candidate.category === "builder_observation") return "builder";
  if (candidate.category === "project" || isGitHubTrendingCandidate(candidate, candidate)) return "project";
  if (candidate.category === "hot_blog") return "blog";
  return "community";
}

function sourceIdFromCandidate(candidate) {
  return `${sourceCategoryForCandidate(candidate)}-${slugId(candidate.source || candidate.source_url || candidate.url || "source") || "source"}`;
}

function sourceNameForSourceId(sourceMap, sourceId) {
  return sourceMap.get(sourceId)?.name || sourceId;
}

function normalizeInputPaths(value) {
  if (Array.isArray(value)) return value.flatMap((item) => normalizeInputPaths(item));
  return String(value || "")
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

async function loadDiscoveryInputs(rootDir, inputPaths) {
  if (inputPaths.length === 0) {
    throw new PublisherError("report_draft_inputs_missing", "report:draft 需要 --input 指向发现输出或候选池 JSON。");
  }
  const payloads = [];
  for (const inputPath of inputPaths) {
    payloads.push(JSON.parse(await fs.readFile(path.resolve(rootDir, inputPath), "utf8")));
  }
  return payloads;
}

function requireReportDate(reportDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(reportDate || ""))) {
    throw new PublisherError("report_date_invalid", "reportDate must be YYYY-MM-DD");
  }
  return reportDate;
}

function rankOf(value, fallback) {
  const rank = Number(value?.rank);
  return Number.isInteger(rank) && rank > 0 ? rank : fallback;
}

function repoFromUrl(value) {
  try {
    const url = new URL(value);
    const match = url.hostname === "github.com" ? url.pathname.match(/^\/([^/]+\/[^/]+)/) : null;
    return match?.[1] || "";
  } catch {
    return "";
  }
}

function hasChineseText(value) {
  return /\p{Script=Han}/u.test(String(value || ""));
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeUrl(value) {
  return normalizeUrlIdentity(value);
}

function dateOnly(value) {
  const raw = String(value || "").trim();
  const ymd = raw.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function trimText(value, maxLength) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!maxLength || text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}...`;
}

function uniqueCandidateId(existingCandidates, rawValue) {
  const base = slugId(rawValue).slice(0, 96) || "candidate";
  const used = new Set(existingCandidates.map((candidate) => candidate.id));
  if (!used.has(base)) return base;
  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function slugId(value) {
  return String(value)
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
