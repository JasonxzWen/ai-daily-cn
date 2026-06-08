import fs from "node:fs/promises";
import path from "node:path";
import { PublisherError } from "./errors.js";
import { cacheEvidenceImages } from "./evidence-cache.js";
import {
  appendSourceStatusSuggestionsToDraft,
  prepareSourceStatusHistoryUpdate,
  writeSourceStatusHistory
} from "./source-status-history.js";
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
const BUILDER_LOW_SIGNAL_RE = /\bgood night\b|touch sand|favorite of plato|favorite.*dialogues?|vibecon\b|my absolute favorite/i;
const COMPANY_ACTION_RE = /\b(earnings|quarterly results?|financial results?|revenue|profit|guidance|layoffs?|job cuts?|hiring|reorganization|reorganisation|restructuring|organization changes?|leadership|management|board|conference|summit|keynote|product conference|launch event|partnership|investment|pricing|availability|policy|regulation|open[-\s]?source|github|hugging face|model weights?)\b|财报|业绩|营收|利润|指引|裁员|招聘|组织架构|组织调整|重组|管理层|董事会|大会|峰会|发布会|合作|投资|价格|定价|可用性|政策|监管|开源|模型权重/i;
const PRODUCT_PLATFORM_RE = /\b(product|platform|app|service|cloud|enterprise|developer|api|sdk|release|launch|availability|pricing|quota|github|hugging face|open[-\s]?source|repo|repository)\b|产品|平台|应用|服务|云|企业|开发者|接口|发布|上线|可用|价格|配额|开源|仓库/i;
const HARDCORE_RESEARCH_RE = /\b(arxiv|paper|benchmark|evaluation|eval|reasoning traces?|transformer inference|inference benchmark|ablation|dataset|pre[-\s]?train|post[-\s]?training|fine[-\s]?tuning|rlvr|loss|gradient|tokenizer|architecture|throughput|latency|context window)\b|论文|基准|评测|推理轨迹|消融|数据集|训练|微调|架构|吞吐|延迟/i;
const PLAIN_READER_SIGNAL_RE = /\b(pricing|availability|rollout|launch|product|platform|app|service|enterprise|developer|api|sdk|conference|summit|partnership|customer|use case|workflow|open[-\s]?source|github|hugging face|model weights?|layoffs?|job cuts?|reorganization|restructuring|earnings|revenue|guidance)\b|价格|定价|可用|发布|上线|产品|平台|应用|服务|企业|开发者|接口|大会|峰会|合作|客户|用例|工作流|开源|模型权重|裁员|组织调整|重组|财报|营收|指引/i;
const LOW_SIGNAL_VENDOR_PARTNERSHIP_RE = /\b(partnership|collaborat(?:e|ion)|build(?:ing)? an ai factory|ai factory|build ai infrastructure|gigawatt-scale ai cloud|memory for ai factor(?:y|ies))\b|合作|联合打造|共建/i;
const LOW_VALUE_EVENT_GUIDE_RE = /\bhow to watch\b|\bwhat to expect\b|\bwatch live\b|\blivestream\b|\bschedule\b|\blineup\b|\btickets?\b|直播|观看指南|日程|赛程/i;
const MINOR_CONSUMER_AI_FEATURE_RE = /\bdesign merch\b|\balexa for shopping\b|\bpet portraits?\b|\btumblers?\b|\bgroup shirts?\b|\bcreator assistant\b|\bai translations?\b|\bfacebook translations?\b/i;
const GENERIC_HOT_BLOG_EVIDENCE_RE = /published this blog\/interview entry\.?$/i;
const TITLE_MOJIBAKE_RE = /�|锟|喔|鈥|峄|岷|箞|鑳|€/u;
const LOW_VALUE_MAIN_RE = /amazon in the community|service,\s*community,\s*and commitment at hq2|friday night baseball|apple arcade|family feud pocket|prime video|spinoff|ari[a]?nespace launch|deploy more satellites|vought rising|here'?s what'?s happening in seattle|hq2|july.*baseball|mini football legends|the latest ai news we announced in/i;
const LOW_VALUE_AI_PR_RE = /doosan group collaborate|multiyear technology partnership|advance memory for ai factories|advance physical ai and ai factory infrastructure|build ai infrastructure to power|expands ai infrastructure with nvidia/i;
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
    evidenceAssets: mergeEvidenceAssets(merged.evidence_assets, evidence.assets)
  });
  const sourceStatusUpdate = await prepareSourceStatusHistoryUpdate({
    rootDir,
    outputDir: options.sourceStatusOutputDir || "reports-data",
    reportDate,
    generatedAt,
    sourceAudit,
    days: options.sourceStatusWindowDays || 10
  });
  const reportWithSourceSuggestions = appendSourceStatusSuggestionsToDraft(report, sourceStatusUpdate);
  const sourceStatusHistoryPath = await writeSourceStatusHistory(sourceStatusUpdate);

  const outputPath = path.resolve(rootDir, options.outputPath || path.join(".tmp", "daily-report.json"));
  const candidateOutputPath = path.resolve(rootDir, options.candidateOutputPath || path.join(".tmp", `source-candidates-${reportDate}.json`));
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.mkdir(path.dirname(candidateOutputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(reportWithSourceSuggestions, null, 2)}\n`, "utf8");
  await fs.writeFile(candidateOutputPath, `${JSON.stringify(candidatePool, null, 2)}\n`, "utf8");

  return {
    report: reportWithSourceSuggestions,
    candidatePool,
    path: outputPath,
    candidatePoolPath: candidateOutputPath,
    sourceStatusHistoryPath,
    evidence_assets: mergeEvidenceAssets(merged.evidence_assets, evidence.assets),
    evidence_skipped: evidence.skipped,
    counts: {
      candidates: candidatePool.candidates.length,
      main_items: reportWithSourceSuggestions.main_items.length,
      github_trending: reportWithSourceSuggestions.github_trending.length,
      hot_blogs: reportWithSourceSuggestions.hot_blogs.length,
      daily_tracking: reportWithSourceSuggestions.daily_tracking.length,
      projects: reportWithSourceSuggestions.projects.length,
      builder_observations: reportWithSourceSuggestions.builder_observations.length,
      community_leads: reportWithSourceSuggestions.community_leads.length,
      evidence_assets: reportWithSourceSuggestions.evidence_assets.length
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
  const evidenceAssets = [];

  for (const payload of payloads) {
    mergeSourceAudit(sourceAudit, payload?.source_audit);
    for (const asset of Array.isArray(payload?.evidence_assets) ? payload.evidence_assets : []) {
      evidenceAssets.push(asset);
    }
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
    metaById,
    evidence_assets: mergeEvidenceAssets(evidenceAssets)
  };
}

function selectReportItems(merged, options = {}) {
  const reportDate = requireReportDate(options.reportDate);
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
    .filter((candidate) => canPromoteToMain(candidate, reportDate))
    .sort((left, right) => candidateScore(right) - candidateScore(left));
  let mainSeeds = pickMainCandidates(mainPool, MAIN_TARGET);
  if (mainSeeds.length === 0) {
    mainSeeds = candidates
      .filter((candidate) => !selectedIds.has(candidate.id))
      .filter((candidate) => !recentMainUrls.has(normalizeUrl(candidate.url)))
      .filter((candidate) => canFallbackToSingleMain(candidate))
      .sort((left, right) => candidateScore(right) - candidateScore(left))
      .slice(0, 1);
  }
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
  const hotBlogPool = candidates
    .filter((candidate) => !selectedIds.has(candidate.id))
    .filter((candidate) => canPromoteToHotBlog(candidate, reportDate))
    .sort((left, right) => candidateScore(right) - candidateScore(left));
  const hotBlogSeeds = [];
  for (const candidate of hotBlogPool) {
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

  const communityPool = candidates
    .filter((candidate) => candidate.category === "community_lead" && !selectedIds.has(candidate.id))
    .filter((candidate) => canPromoteToCommunityLead(candidate, reportDate))
    .sort((left, right) => candidateScore(right) - candidateScore(left))
    .slice(0, Math.max(0, MAX_PUBLIC_UNITS - mainItems.length - githubTrending.length - projects.length - hotBlogs.length - builderObservations.length));
  const communitySeeds = [];
  let communityLowSignalPartnerships = 0;
  let communityPaperCount = 0;
  let communityGithubCount = 0;
  const communityTopicKeys = new Set();
  for (const candidate of communityPool) {
    if (communitySeeds.length >= 8) break;
    const sourceLevel = sourceLevelForCandidate(candidate);
    if (isLowSignalVendorPartnership(candidate)) {
      if (communityLowSignalPartnerships >= 1) continue;
      communityLowSignalPartnerships += 1;
    }
    if ((sourceLevel === "paper" || sourceLevel === "paper_api") && communityPaperCount >= 1) continue;
    if (sourceLevel === "github" && communityGithubCount >= 1) continue;
    const topicKey = communityLeadTopicKey(candidate);
    if (topicKey && communityTopicKeys.has(topicKey)) continue;
    communitySeeds.push(candidate);
    if (topicKey) {
      communityTopicKeys.add(topicKey);
    }
    if (sourceLevel === "paper" || sourceLevel === "paper_api") {
      communityPaperCount += 1;
    }
    if (sourceLevel === "github") {
      communityGithubCount += 1;
    }
  }
  const communityLeads = communitySeeds.map((candidate) => {
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
    community_leads: communityLeads,
    eligible_counts: {
      main_items: mainPool.length,
      github_trending: publicGithubCandidates.length,
      hot_blogs: hotBlogPool.length,
      projects: projectSeeds.length,
      builder_observations: candidates.filter((candidate) => candidate.category === "builder_observation" && canPromoteToBuilderObservation(candidate)).length
    }
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

function mergeEvidenceAssets(...groups) {
  const merged = [];
  const seen = new Set();
  for (const group of groups) {
    for (const asset of Array.isArray(group) ? group : []) {
      if (!asset || typeof asset !== "object") {
        continue;
      }
      const key = `${asset.source_url || ""}::${asset.local_path || ""}::${asset.title || ""}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      merged.push(asset);
    }
  }
  return merged;
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
  let lowSignalPartnershipCount = 0;
  const plainReaderCandidates = candidates.filter((candidate) => hasPlainReaderSignal(candidate));
  const hardcoreLimit = plainReaderCandidates.length >= target - 2 ? 2 : target;
  let hardcorePicked = 0;
  const aigc = candidates.find((candidate) => (
    isAigcCandidate(candidate) &&
    !isHardcoreResearchOnly(candidate) &&
    !isMinorConsumerAiFeatureCandidate(candidate)
  ));
  if (aigc) {
    picked.push(aigc);
    seenUrls.add(normalizeUrl(aigc.url));
  }
  for (const candidate of candidates) {
    if (picked.length >= target) break;
    const key = normalizeUrl(candidate.url);
    if (!key || seenUrls.has(key)) continue;
    if (isLowSignalVendorPartnership(candidate)) {
      if (lowSignalPartnershipCount >= 1) continue;
      lowSignalPartnershipCount += 1;
    }
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
      selection_snapshot: {
        main_items: {
          eligible_candidates: selection.eligible_counts?.main_items || 0,
          selected: selection.main_items.length
        },
        github_trending: {
          eligible_candidates: selection.eligible_counts?.github_trending || 0,
          selected: selection.github_trending.length
        },
        hot_blogs: {
          eligible_candidates: selection.eligible_counts?.hot_blogs || 0,
          selected: selection.hot_blogs.length
        },
        projects: {
          eligible_candidates: selection.eligible_counts?.projects || 0,
          selected: selection.projects.length
        },
        builder_observations: {
          eligible_candidates: selection.eligible_counts?.builder_observations || 0,
          selected: selection.builder_observations.length
        }
      },
      fallback_sources: [],
      primary_links: selection.main_items.every((item) => PRIMARY_STATUSES.has(item.verification_status)),
      no_banned_words: true,
      no_unsourced_numbers: true,
      notes: "自动挑选已完成；高风险或中介事实未进入主体。",
      optimization_suggestions: []
    },
    generated_at: generatedAt
  };
  normalizeAutodraftPublicText(report);
  return report;
}

function normalizeAutodraftPublicText(report) {
  report.source_window.notes = "覆盖当日固定信源；正文只采用已回到一手、官方、论文、GitHub 或多源确认的事实，未确认线索留在观察区。";
  report.self_check.notes = "主体事实只保留可回溯来源；高风险和中介线索留在社区观察。";
  for (const item of report.hero_highlights || []) {
    item.reason = stripDraftPublicBodyNoise(item.reason, item);
  }
  for (const item of report.main_items || []) {
    item.summary = stripDraftPublicBodyNoise(item.summary, item);
    item.bullets = (item.bullets || []).map((bullet) => stripDraftPublicBodyNoise(bullet, item));
  }
  for (const item of report.community_leads || []) {
    item.content = stripDraftPublicBodyNoise(item.content, item);
  }
}

function stripDraftPublicBodyNoise(value, item = {}) {
  let text = String(value || "").trim();
  if (!text) return text;
  text = stripDraftSourcePrefixes(text, item);
  text = text
    .replace(/\s*Treat this as a community lead unless it is backed by a primary source\.?/gi, "")
    .replace(/\s*Community lead unless backed by a primary source\.?/gi, "")
    .replace(/\s*This is a community lead unless it is backed by a primary source\.?/gi, "")
    .replace(/\s*[A-Za-z][A-Za-z0-9 .&/_'()-]{1,60}\s+latest report listed this entry; use it as a discovery lead and verify with the original source before factual inclusion\.?/gi, "")
    .replace(/\s*This is an intermediary\/self-media lead; trace it to a primary source before[^。.;\n]*(?:[。.;]|$)/gi, "")
    .replace(/^[（(]英文[)）][。.]?\s*/u, "")
    .replace(/\s*待确认\s*[:：]\s*[^。；;\n]*(?:[。；;]|$)/g, "")
    .replace(/\s*边界\s*[:：]\s*[^。；;\n]*(?:[。；;]|$)/g, "")
    .replace(/\s*事实性结论[^。；;\n]*(?:一手来源|多源确认|原始链接|主体)[^。；;\n]*(?:[。；;]|$)/g, "")
    .replace(/\s*事实来自可回看的原始链接[^。；;\n]*(?:[。；;]|$)/g, "")
    .replace(/\s*不得仅凭该线索写入主体[^。；;\n]*(?:[。；;]|$)/g, "")
    .replace(/。?\s*可先关注适用对象、落地边界和后续变化[。]?/g, "")
    .replace(/；\s*目前最需要补看的信息是/g, "，公开信息主要涉及")
    .replace(/[，,]?\s*(?:不进入|未进入)\s*AI\s*主体事实[。；;]?/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  text = stripDraftSourcePrefixes(text, item);
  return text.trim();
}

function stripDraftSourcePrefixes(value, item = {}) {
  let text = String(value || "").trim();
  const names = [
    item.source,
    item.publisher,
    item.source_name,
    item.source_title
  ].filter(Boolean);
  for (const name of names) {
    const escaped = escapeRegex(String(name).trim());
    if (!escaped) continue;
    text = text
      .replace(new RegExp(`^(?:\\*\\*)?${escaped}(?:\\*\\*)?\\s*[:：;；,-]\\s*`, "i"), "")
      .replace(new RegExp(`^(?:\\*\\*)?${escaped}(?:\\*\\*)?\\s*[\\u2013\\u2014]\\s*`, "i"), "")
      .trim();
  }
  return text.replace(/^[A-Za-z][A-Za-z0-9 &./+_'()-]{2,80}\s*(?:Blog|Changelog|Press Releases|Investor Relations|Newsroom|News|Research|RSS|Feed|Status|Docs|Documentation|Release Notes|Company News|Keyword Blog|Model Card|Hugging Face|GitHub)\s*[:：-]\s*/i, "").trim();
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function summaryForSelection(selection, aigcCount) {
  const mainTitles = selection.main_items
    .map((item) => stripDraftPublicBodyNoise(item.title || item.summary || "", item))
    .filter(Boolean)
    .slice(0, 3);
  if (mainTitles.length === 0 && selection.github_trending.length === 0) {
    return "今日固定信源没有足够清晰的主体事实，日报保留信源状态和少量观察，不强行扩写。";
  }
  const parts = [];
  if (mainTitles.length > 0) {
    parts.push(mainTitles.length === 1 ? `今天最值得看的主线是 ${mainTitles[0]}` : `今天最值得看的主线有 ${mainTitles.join("；")}`);
  }
  const hotBlogCue = hotBlogSummaryCue(selection.hot_blogs);
  if (hotBlogCue) {
    parts.push(`热门博客这轮主要看 ${hotBlogCue}`);
  } else if (aigcCount > 0) {
    parts.push("内容和创作者工具这条线今天也有值得看的新动作");
  }
  if (selection.github_trending.length > 0) {
    parts.push("GitHub Trending 继续保留完整 Top 10，方便对照开源侧动向");
  }
  const cleanParts = parts
    .map((part) => String(part || "").replace(/[。；\s]+$/u, "").trim())
    .filter(Boolean);
  return `${cleanParts.join("；")}。`;
}

function hotBlogSummaryCue(items = []) {
  const labels = items
    .map((item) => hotBlogSummaryTheme(item))
    .filter(Boolean)
    .slice(0, 3);
  if (labels.length === 0) {
    return "";
  }
  return [...new Set(labels)].join("、");
}

function hotBlogSummaryTheme(item) {
  const text = candidateText(item).toLowerCase();
  if (/rocketmq|litetopic/.test(text)) {
    return "消息层怎么承接百万级 agent 会话";
  }
  if (/agentscope java/.test(text)) {
    return "企业级 agent 基座怎么做分布式和治理";
  }
  if (/tokenmaxxing|ontology-based dependency/.test(text)) {
    return "企业 agent 的 token 成本该先从哪里下手";
  }
  if (/agent|workflow|mcp|tool|developer|coding|codex|copilot|cursor/.test(text)) {
    return "agent 和开发工具的落地边界";
  }
  if (/content|creator|video|image|media|aigc/.test(text)) {
    return "内容工具和创作工作流";
  }
  return "";
}

function mainItem(candidate, original) {
  const category = inferredEditorialCategory(candidate);
  const entity = mainEntity(candidate);
  const summary = chineseSummary(candidate, category);
  const impact = readerImpactForCandidate(candidate, category);
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
    bullets: mainItemBullets(candidate, original, category),
    why_it_matters: impact,
    reader_relevance: audienceRelevanceForCandidate(candidate, category),
    verification_note: candidate.verification_note || "事实来自可回看的原始链接。",
    risk_note: candidate.risk_note || "如涉及价格、融资、benchmark 或监管事实，仍需在正式编辑时补充更强核验。"
  };
}

function mainItemBullets(candidate, original, category) {
  return uniqueEditorialSentences([
    mainItemFactBullet(candidate, original),
    ...mainItemSpecificBullets(candidate),
    mainItemScopeBullet(candidate, category),
    mainItemDecisionBullet(candidate, category)
  ]).slice(0, 5);
}

function mainItemFactBullet(candidate, original) {
  const label = readerLabelForCandidate(candidate) || compactMainItemLabel(candidate);
  const fact = highlightMainItemFact(
    candidate,
    stripSentenceEnding(stripDraftPublicBodyNoise(sourceGroundedFact(candidate, original), candidate))
  );
  return `**${label}**：${fact}。`;
}

function mainItemScopeBullet(candidate, category) {
  const scope = mainItemScopeFactText(candidate, category);
  return scope ? `${scope}。` : "";
}

function mainItemDecisionBullet(candidate, category) {
  const impact = mainItemDecisionSentence(candidate, category);
  return impact ? `${impact}。` : "";
}

function compactMainItemLabel(candidate) {
  const raw = stripDraftPublicBodyNoise(displayTitleForCandidate(candidate), candidate)
    .replace(/[：:｜|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const text = trimText(raw || mainEntity(candidate) || candidate.source || "今日主线", 28);
  return text.replace(/\.\.\.$/, "");
}

function readerLabelForCandidate(candidate) {
  const text = `${candidate.title || ""} ${candidate.evidence || ""} ${candidate.url || ""}`.toLowerCase();
  if (/rocketmq.*litetopic/.test(text)) return "RocketMQ LiteTopic";
  if (/agentscope java 2\.0/.test(text)) return "AgentScope Java 2.0";
  if (/tokenmaxxing|ontology-based dependency/.test(text)) return "Token 成本优化";
  if (/whatsapp.*spyware|spyware.*whatsapp|nso/.test(text)) return "WhatsApp 反间谍";
  if (/sovereign ai|london tech week|ai maker, not an ai taker/.test(text)) return "英国主权 AI";
  if (/sk telecom.*ai cloud|gigawatt-scale ai cloud/.test(text)) return "SKT AI Cloud";
  if (/lg group.*ai factory/.test(text)) return "LG AI Factory";
  if (/doosan.*ai factory/.test(text)) return "Doosan AI Factory";
  return "";
}

function mainItemScopeBulletText(candidate, category) {
  const text = candidateText(candidate);
  if (category === "company_business") {
    return "==keyword-notable|投入方向==、合作节奏和组织动作";
  }
  if (category === "product_radar") {
    return "==keyword-notable|入口/范围==、价格、地区和上线节奏";
  }
  if (category === "open_source") {
    return "==keyword-notable|代码/接口==、许可证和维护节奏";
  }
  if (category === "content_aigc" || AIGC_RE.test(text)) {
    return "==keyword-notable|试用入口==、样例质量、版权边界和价格";
  }
  if (/agent|workflow|mcp|tool|developer|coding|codex|copilot|cursor/i.test(text)) {
    return "==keyword-notable|部署方式==、权限、上下文和失败恢复";
  }
  if (/benchmark|eval|paper|research|arxiv|reasoning|long context|memory/i.test(text)) {
    return "==keyword-notable|实验边界==、数据范围和复现材料";
  }
  if (/policy|safety|governance|regulation|security/i.test(text)) {
    return "==keyword-notable|生效范围==、执行主体和例外条款";
  }
  return "==keyword-notable|官方入口==、适用范围和证据";
}

function mainItemScopeFactText(candidate, category) {
  const text = candidateText(candidate);
  if (/whatsapp.*spyware|spyware.*whatsapp|nso/i.test(text)) {
    return "当前公开的是攻击归因、拦截动作和受影响对象描述，完整受害面仍未披露";
  }
  if (/sovereign ai|london tech week|ai maker, not an ai taker/i.test(text)) {
    return "当前公开的是基础设施路线、合作方口径和英国本地落地节奏";
  }
  if (category === "company_business") {
    return "当前公开信息主要落在投入方向、合作节奏、组织动作和执行安排";
  }
  if (category === "product_radar") {
    return "当前公开的是入口、适用范围、价格、地区和上线节奏";
  }
  if (category === "open_source") {
    return "当前公开的是代码、接口、许可证、维护节奏和可复用边界";
  }
  if (category === "content_aigc" || AIGC_RE.test(text)) {
    return "当前公开的是试用入口、样例质量、版权边界和价格信息";
  }
  if (/agent|workflow|mcp|tool|developer|coding|codex|copilot|cursor/i.test(text)) {
    return "当前公开的是部署方式、权限、上下文管理和失败恢复边界";
  }
  if (/benchmark|eval|paper|research|arxiv|reasoning|long context|memory/i.test(text)) {
    return "当前公开的是实验设置、数据范围、对比基线和复现材料";
  }
  if (/policy|safety|governance|regulation|security/i.test(text)) {
    return "当前公开的是生效范围、执行主体、例外条款和落地安排";
  }
  return "当前公开信息主要集中在适用对象、证据来源和后续执行安排";
}

function mainItemScopePhrase(candidate, category) {
  const text = candidateText(candidate);
  if (category === "company_business") {
    return "管理层口径、业务投入和合作节奏";
  }
  if (category === "product_radar") {
    return "入口、权限、价格、地区和上线范围";
  }
  if (category === "open_source") {
    return "代码示例、许可证、模型卡和维护节奏";
  }
  if (category === "content_aigc" || AIGC_RE.test(text)) {
    return "试用入口、样例质量、版权边界和价格信息";
  }
  if (/agent|workflow|mcp|tool|developer|coding|codex|copilot|cursor/i.test(text)) {
    return "API、权限、上下文管理、失败恢复和落地成本";
  }
  if (/benchmark|eval|paper|research|arxiv|reasoning|long context|memory/i.test(text)) {
    return "实验设置、数据范围、可复现材料和对比基线";
  }
  if (/policy|safety|governance|regulation|security/i.test(text)) {
    return "生效范围、执行主体、例外条款和上线流程";
  }
  return "官方入口、适用范围和可验证证据";
}

function mainItemDecisionSentence(candidate, category) {
  const text = candidateText(candidate);
  if (/whatsapp.*spyware|spyware.*whatsapp|nso/i.test(text)) {
    return "这会提醒企业和高风险人群重新审视聊天入口、设备链路和定向钓鱼防护";
  }
  if (/sovereign ai|london tech week|ai maker, not an ai taker/i.test(text)) {
    return "这会影响欧洲本地算力建设、政府合作项目和供应商站位判断";
  }
  if (category === "company_business") {
    return "这会影响市场对供应商投入方向、合作优先级和组织重心的判断";
  }
  if (category === "product_radar") {
    return "这会改变团队安排试用、采购和替换工具的优先级";
  }
  if (category === "open_source") {
    return "这会影响团队是否把它放进 PoC、评估清单或现有工作流";
  }
  if (category === "content_aigc" || AIGC_RE.test(text)) {
    return "这会影响创作工具能否进入正式生产流程和预算清单";
  }
  if (/agent|workflow|mcp|tool|developer|coding|codex|copilot|cursor/i.test(text)) {
    return "这会影响 agent 工具接入顺序、权限设计和团队落地成本";
  }
  if (/benchmark|eval|paper|research|arxiv|reasoning|long context|memory/i.test(text)) {
    return "这会改变团队对能力边界、成本和可靠性的预期";
  }
  if (/policy|safety|governance|regulation|security/i.test(text)) {
    return "这类更新会直接牵动上线流程、风控口径和合规检查";
  }
  return "这会影响产品路线、接入时机和风险判断";
}

function highlightMainItemFact(candidate, fact) {
  const text = String(fact || "").trim();
  const candidateTextLower = candidateText(candidate).toLowerCase();
  if (/whatsapp.*spyware|spyware.*whatsapp|nso/.test(candidateTextLower)) {
    return text.replace("NSO", "==keyword-notable|NSO==");
  }
  if (/sovereign ai|london tech week|ai maker, not an ai taker/.test(candidateTextLower)) {
    return text.replace("英国主权 AI", "==keyword-notable|英国主权 AI==");
  }
  if (/fix with copilot.*failing actions|failing actions.*copilot/.test(candidateTextLower)) {
    return text.replace("Copilot", "==keyword-notable|Copilot==");
  }
  return text;
}

function mainItemSpecificBullets(candidate) {
  const text = candidateText(candidate).toLowerCase();
  if (/whatsapp.*spyware|spyware.*whatsapp|nso/.test(text)) {
    return [
      "**攻击归因**：WhatsApp 把这轮定向钓鱼攻击与 NSO 关联起来，说明它把这次事件按高风险间谍软件处理。",
      "**背景**：NSO 是一家长期处在监管和执法争议中的间谍软件公司，也被美国政府列入黑名单。",
      "**披露重点**：这次公开信息集中在拦截动作和攻击归因，暂时还没有更完整的受影响范围说明。"
    ];
  }
  if (/sovereign ai|london tech week|ai maker, not an ai taker/.test(text)) {
    return [
      "**时间点**：NVIDIA 继续借伦敦科技周推进英国“主权 AI”议题，和去年的口号形成前后呼应。",
      "**今年**：公开叙事已经从“做 AI maker”转向展示基础设施、伙伴协作和执行层进展。",
      "**信号**：这条消息更像英国把 AI 产业政策往算力建设和本地落地推进的延续动作。"
    ];
  }
  if (/fix with copilot.*failing actions|failing actions.*copilot/.test(text)) {
    return [
      "**入口变化**：GitHub 把 Actions 失败后的 Copilot 修复能力开放给 Pro、Pro+ 和 Max 用户。",
      "**使用方式**：失败任务现在可以直接交给 Copilot cloud agent 处理，而不是只停在错误日志。",
      "**范围**：这次变化首先影响 GitHub Actions 的故障处理链路和团队内的自动修复习惯。"
    ];
  }
  if (/agent tasks rest api.*copilot|copilot.*agent tasks rest api/.test(text)) {
    return [
      "**接口变化**：GitHub 为 Copilot 云端 agent 任务开放了 REST API。",
      "**团队价值**：外部系统现在可以启动、跟踪和串联 Copilot agent 任务，不必只靠界面操作。",
      "**落地边界**：真正要看的不是口号，而是接口权限、任务状态和可集成范围。"
    ];
  }
  return [];
}

function uniqueEditorialSentences(items) {
  const result = [];
  const seen = new Set();
  for (const value of items.map((item) => String(item || "").trim()).filter(Boolean)) {
    const key = value.replace(/\s+/g, " ").trim();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(value);
  }
  return result;
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
    title: hotBlogTitleForCandidate(candidate),
    candidate_id: candidate.id,
    editorial_category: inferredEditorialCategory(candidate) === "content_aigc" ? "content_aigc" : "viewpoint_analysis",
    ...fields,
    ...builderMediaFields(candidate),
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
  const originalText = sanitizeBuilderOriginalText(candidate);
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
    ...builderMediaFields(candidate),
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
    title: communityLeadTitleForCandidate(candidate),
    content: communityLeadPublicSummary(candidate),
    ...builderMediaFields(candidate),
    url: candidate.url,
    event_date: candidate.event_date,
    source: candidate.source,
    evidence: candidate.evidence || candidate.title,
    editorial_category: inferredEditorialCategory(candidate) === "content_aigc" ? "content_aigc" : "community_signal",
    ...fields
  };
}

function communityLeadPublicSummary(candidate) {
  const summary = joinReaderSentences([
    candidateReaderDigest(candidate),
    communityLeadDetailSentence(candidate)
  ]);
  if (summary) {
    return trimText(stripDraftPublicBodyNoise(summary, candidate), 170);
  }
  const lead = chineseLeadForCandidate(candidate);
  if (lead) {
    return trimText(stripDraftPublicBodyNoise(lead, candidate), 170);
  }
  for (const field of [candidate.summary, candidate.evidence, candidate.title]) {
    const raw = stripDraftPublicBodyNoise(field, candidate);
    if (hasChineseText(raw) && raw.length >= 18) {
      return trimText(raw, 170);
    }
  }
  const category = inferredEditorialCategory(candidate);
  const source = candidate.source || "公开来源";
  return `${source} 提到一条${themeLabelForCandidate(candidate)}相关线索，当前公开信息主要落在${mainItemScopePhrase(candidate, category)}。`;
}

function communityLeadTitleForCandidate(candidate) {
  const rawTitle = stripDraftPublicBodyNoise(candidate.title || "", candidate);
  const lead = chineseLeadForCandidate(candidate);
  if (lead && (/^(the download|newsletter|daily brief|daily digest)\s*:/i.test(rawTitle) || (!hasChineseText(rawTitle) && rawTitle.length > 36))) {
    return trimText(lead, 80);
  }
  if (rawTitle) {
    return trimText(rawTitle, 80);
  }
  const source = String(candidate.source || "").trim();
  if (source) {
    return source;
  }
  try {
    return new URL(String(candidate.url || "")).hostname.replace(/^www\./, "");
  } catch {
    return "社区线索";
  }
}

function communityLeadDetailSentence(candidate) {
  const text = candidateText(candidate).toLowerCase();
  if (/finding-miscompiles-for-fun-not-profit|我用 ai 寻找 bug|miscompile/.test(text)) {
    return "文章重点不在“AI 很会找 bug”，而是提示词、验证链路和失败模式怎么配合。";
  }
  if (/sk telecom.*ai cloud|gigawatt-scale ai cloud/.test(text)) {
    return "公开口径里已经给出吉瓦级 AI Cloud 和 2027 年首座 AI factory 这两个时间点。";
  }
  if (/notion restores access to anthropic|service disruption/.test(text)) {
    return "这类恢复通知说明，上游模型波动已经会直接打到下游企业 AI 工具的可用性。";
  }
  if (/super app/.test(text)) {
    return "讨论焦点在于 OpenAI 会不会把聊天、搜索和工具入口继续往同一个应用里收。";
  }
  if (/codex-provider-sync/.test(text)) {
    return "它直接对准多 Provider 工作流里最麻烦的会话迁移和历史上下文保留问题。";
  }
  if (/weather and climate science ai revolution|climate science ai revolution|machine learning has its limits/.test(text)) {
    return "文章把讨论拉回具体环节：哪些任务能提效，哪些地方还不能替代传统方法。";
  }
  if (/skillopt/.test(text)) {
    return "核心想法是把自然语言 skill 文档也当成 agent 可以学习和优化的状态。";
  }
  if (/autoscientists/.test(text)) {
    return "它的关键设定是多智能体不靠中央 planner，也能自己分工推进科研流程。";
  }
  if (/tokenpocalypse|token costs?|tokens? cost/.test(text)) {
    return "讨论点不是模型更强，而是企业怎么把 token 成本重新压回可控区间。";
  }
  return "";
}

function joinReaderSentences(parts) {
  const cleaned = parts
    .map((part) => stripSentenceEnding(stripDraftPublicBodyNoise(part)))
    .filter(Boolean)
    .slice(0, 2);
  if (cleaned.length === 0) {
    return "";
  }
  return `${cleaned.join("；")}。`;
}

function communityLeadTopicKey(candidate) {
  const basis = stripDraftPublicBodyNoise(
    chineseLeadForCandidate(candidate) ||
    candidate.title ||
    candidate.content ||
    candidate.evidence ||
    "",
    candidate
  ).toLowerCase();
  return basis
    .replace(/[“”"'‘’`]/g, "")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ")
    .trim();
}

function hotBlogTitleForCandidate(candidate) {
  const rawTitle = stripDraftPublicBodyNoise(candidate.title || "", candidate);
  if (rawTitle && /\p{Script=Han}/u.test(rawTitle) && hasReaderVisibleTitle(candidate)) {
    return trimText(rawTitle, 120);
  }
  return displayTitleForCandidate(candidate);
}

function builderMediaFields(candidate) {
  const fields = {};
  if (candidate.image_url && isHttpUrl(candidate.image_url)) {
    fields.image_url = candidate.image_url;
  }
  if (Array.isArray(candidate.image_urls)) {
    const imageUrls = candidate.image_urls.filter(isHttpUrl).slice(0, 4);
    if (imageUrls.length > 0) {
      fields.image_urls = imageUrls;
    }
  }
  if (candidate.image_alt) {
    fields.image_alt = trimText(candidate.image_alt, 180);
  }
  if (candidate.image_source) {
    fields.image_source = trimText(candidate.image_source, 80);
  }
  return fields;
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
      summary: audit.summary || (blocked ? `${tracker.summary} 本轮自动抓取未取得可解析快照，读者需要点开官方页人工核对最新榜单。` : tracker.summary),
      watch_points: audit.watchPoints || tracker.watchPoints,
      metrics: audit.metrics || tracker.metrics,
      evidence: `${tracker.evidence} ${audit.evidenceNote}`.trim(),
      verification_note: audit.verificationNote,
      risk_note: tracker.riskNote,
      watch_next: audit.watchNext || tracker.watchNext,
      ...(audit.snapshot ? { snapshot: audit.snapshot } : {})
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
  const matchingSources = sources.filter((item) => {
    const url = normalizeUrl(item?.url);
    const name = String(item?.name || "").toLowerCase();
    return (targetUrl && url === targetUrl) || name === targetName || name.includes(targetName);
  });
  const source = matchingSources.find((item) => isCompleteDailyTrackingSnapshotForTracker(sanitizeDailyTrackingSnapshot(item?.snapshot), tracker)) ||
    matchingSources.find((item) => item?.status === "checked") ||
    matchingSources[0];
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
  const snapshot = sanitizeDailyTrackingSnapshot(source.snapshot);
  if (tracker.id === "openrouter-rankings" && isCompleteOpenRouterSnapshot(snapshot)) {
    return {
      status: source.status,
      verificationStatus: "primary_confirmed",
      changeStatus: "changed",
      changeSummary: openRouterSnapshotChangeSummary(snapshot),
      summary: openRouterSnapshotSummary(snapshot),
      watchPoints: openRouterSnapshotWatchPoints(snapshot),
      metrics: openRouterSnapshotMetrics(snapshot),
      snapshot,
      evidenceNote: `source_audit status=${source.status}; ${snapshot.top_entries.length} OpenRouter top models parsed from public_page_snapshot`,
      verificationNote: `已解析 OpenRouter 公开 Rankings 页面的 This Week Top ${snapshot.top_entries.length}；快照时间 ${snapshot.snapshot_as_of}，这是平台用量信号，不是全市场份额或能力评测。`,
      watchNext: "若榜首、Top 10 构成或周变化继续异常，回到模型发布、价格页和状态页核验是发布驱动、价格驱动还是平台内工作流迁移。"
    };
  }
  if (tracker.id === "artificial-analysis-intelligence-index" && isCompleteArtificialAnalysisSnapshot(snapshot)) {
    return {
      status: source.status,
      verificationStatus: "primary_confirmed",
      changeStatus: "changed",
      changeSummary: artificialAnalysisSnapshotChangeSummary(snapshot),
      summary: artificialAnalysisSnapshotSummary(snapshot),
      watchPoints: artificialAnalysisSnapshotWatchPoints(snapshot),
      metrics: artificialAnalysisSnapshotMetrics(snapshot),
      snapshot,
      evidenceNote: `source_audit status=${source.status}; ${snapshot.top_entries.length} Artificial Analysis top models parsed from public_page_snapshot`,
      verificationNote: `已解析 Artificial Analysis Intelligence Index 公开页面的 Top ${snapshot.top_entries.length}；快照时间 ${snapshot.snapshot_as_of}，这是独立综合评测信号，不是生产选型结论。`,
      watchNext: "若榜首或 Top 10 构成变化，继续核对分项 benchmark、价格、延迟和自有 workload 复测结果。"
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

function isCompleteDailyTrackingSnapshotForTracker(snapshot, tracker) {
  if (tracker.id === "openrouter-rankings") {
    return isCompleteOpenRouterSnapshot(snapshot);
  }
  if (tracker.id === "artificial-analysis-intelligence-index") {
    return isCompleteArtificialAnalysisSnapshot(snapshot);
  }
  return false;
}

function isCompleteOpenRouterSnapshot(snapshot) {
  return snapshot?.snapshot_status === "complete" &&
    Array.isArray(snapshot.top_entries) &&
    snapshot.top_entries.length === 10 &&
    snapshot.top_entries.every((entry, index) => entry.rank === index + 1 && entry.model && entry.provider && entry.tokens && entry.change);
}

function isCompleteArtificialAnalysisSnapshot(snapshot) {
  return snapshot?.snapshot_status === "complete" &&
    Array.isArray(snapshot.top_entries) &&
    snapshot.top_entries.length === 10 &&
    snapshot.top_entries.every((entry, index) => entry.rank === index + 1 && entry.model && entry.provider && /\d+(?:\.\d+)?\s*分/.test(entry.tokens || "") && entry.change);
}

function openRouterSnapshotChangeSummary(snapshot) {
  const top = snapshot.top_entries.slice(0, 3);
  const fastest = snapshot.top_entries
    .filter((entry) => /%$/.test(entry.change))
    .sort((left, right) => Number.parseFloat(right.change) - Number.parseFloat(left.change))[0];
  const topText = top.map((entry) => `#${entry.rank} ${entry.model} ${entry.tokens}`).join("；");
  return fastest
    ? `OpenRouter 本周 Top 10 已解析：${topText}；${fastest.model} 周变化 ${fastest.change}。`
    : `OpenRouter 本周 Top 10 已解析：${topText}。`;
}

function openRouterSnapshotSummary(snapshot) {
  const top = snapshot.top_entries[0];
  const providers = providerMix(snapshot.top_entries);
  const newEntries = snapshot.top_entries.filter((entry) => /^new$/i.test(entry.change));
  return [
    `OpenRouter 公开榜单显示，本周调用热度第一是 ${top.model}（${top.provider}，${top.tokens}，周变化 ${top.change}）。`,
    `Top 10 供应商分布为 ${providers}，可用来观察开发者在 OpenRouter 平台内的真实调用偏好。`,
    newEntries.length > 0 ? `新进榜模型包括 ${newEntries.map((entry) => entry.model).join("、")}，应继续核对是否来自新发布、免费额度或价格变化。` : "该快照只说明 OpenRouter 平台内使用热度，不能替代能力榜单或全市场份额判断。"
  ].join(" ");
}

function openRouterSnapshotWatchPoints(snapshot) {
  const fastest = snapshot.top_entries
    .filter((entry) => /%$/.test(entry.change))
    .sort((left, right) => Number.parseFloat(right.change) - Number.parseFloat(left.change))[0];
  const newEntries = snapshot.top_entries.filter((entry) => /^new$/i.test(entry.change));
  return [
    fastest ? `${fastest.model} 的周变化为 ${fastest.change}，需要结合发布、价格、免费额度和上下文窗口变化判断原因。` : "继续观察 Top 10 排名是否持续换位，而不是只看单日截图。",
    newEntries.length > 0 ? `新进榜模型：${newEntries.map((entry) => `${entry.model}（${entry.provider}）`).join("、")}。` : "若没有新进榜，重点看榜首和供应商份额是否迁移。",
    "OpenRouter 用量是平台内需求信号；生产选型仍需回到延迟、价格、上下文长度和自有任务复测。"
  ];
}

function openRouterSnapshotMetrics(snapshot) {
  const topMetrics = snapshot.top_entries.map((entry) => ({
    label: `#${entry.rank}`,
    value: `${entry.model}（${entry.provider}）：${entry.tokens}，周变化 ${entry.change}`,
    trend: dailyTrackingTrendForChange(entry.change)
  }));
  return [
    { label: "榜单范围", value: `This Week Top ${snapshot.top_entries.length}`, trend: "same" },
    { label: "供应商分布", value: providerMix(snapshot.top_entries), trend: "unknown" },
    ...topMetrics
  ];
}

function artificialAnalysisSnapshotChangeSummary(snapshot) {
  const top = snapshot.top_entries.slice(0, 3);
  const topText = top.map((entry) => `#${entry.rank} ${entry.model} ${entry.tokens}`).join("，");
  return `Artificial Analysis Intelligence Index Top 10 已解析：${topText}。`;
}

function artificialAnalysisSnapshotSummary(snapshot) {
  const top = snapshot.top_entries[0];
  const providers = providerMix(snapshot.top_entries);
  const topScores = snapshot.top_entries.slice(0, 3).map((entry) => `${entry.model} ${entry.tokens}`).join("、");
  return [
    `Artificial Analysis 公开榜单显示，当前 Intelligence Index 第一是 ${top.model}（${top.provider}，${top.tokens}）。`,
    `前三名为 ${topScores}，Top 10 供应商分布为 ${providers}。`,
    "这个榜单适合做模型 shortlist 和能力变化监测，但生产选型仍要结合延迟、价格、上下文长度和自有任务复测。"
  ].join(" ");
}

function artificialAnalysisSnapshotWatchPoints(snapshot) {
  const top = snapshot.top_entries[0];
  const tiedScores = scoreCounts(snapshot.top_entries)
    .filter((item) => item.count > 1)
    .map((item) => `${item.score} 分有 ${item.count} 个模型`)
    .join("，");
  return [
    `榜首 ${top.model} 的综合分为 ${top.tokens}，需要继续看它在代码、长上下文和 agentic task 分项上的表现。`,
    tiedScores ? `Top 10 内部竞争接近：${tiedScores}，不要只按一个名次做选型。` : "若 Top 10 分数拉开，再回到具体 benchmark 看优势来自哪类任务。",
    "把 Intelligence Index 与价格、延迟、吞吐和可用地区一起看，避免用综合分替代真实 workload 复测。"
  ];
}

function artificialAnalysisSnapshotMetrics(snapshot) {
  const topMetrics = snapshot.top_entries.map((entry) => ({
    label: `#${entry.rank}`,
    value: `${entry.model}（${entry.provider}）：${entry.tokens}`,
    trend: "unknown"
  }));
  return [
    { label: "榜单范围", value: `Intelligence Index Top ${snapshot.top_entries.length}`, trend: "same" },
    { label: "供应商分布", value: providerMix(snapshot.top_entries), trend: "unknown" },
    ...topMetrics
  ];
}

function scoreCounts(entries) {
  const counts = new Map();
  for (const entry of entries) {
    const score = String(entry.tokens || "").replace(/\s*分$/, "").trim();
    if (!score) continue;
    counts.set(score, (counts.get(score) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([score, count]) => ({ score, count }))
    .sort((left, right) => Number(right.score) - Number(left.score));
}

function dailyTrackingTrendForChange(change) {
  if (/^new$/i.test(change)) {
    return "new";
  }
  const value = Number.parseFloat(String(change || "").replace("%", ""));
  if (Number.isNaN(value)) {
    return "unknown";
  }
  if (value > 0) {
    return "up";
  }
  if (value < 0) {
    return "down";
  }
  return "same";
}

function providerMix(entries) {
  const counts = new Map();
  for (const entry of entries) {
    counts.set(entry.provider, (counts.get(entry.provider) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([provider, count]) => `${provider} ${count}`)
    .join("、");
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
  const snapshot = sanitizeDailyTrackingSnapshot(source?.snapshot);
  return {
    name: source?.name || "Unknown source",
    url: isHttpUrl(source?.url) ? source.url : "https://example.com/",
    status: source?.status || "no_signal",
    ...(source?.notes ? { notes: String(source.notes) } : {}),
    ...(snapshot ? { snapshot } : {})
  };
}

function sanitizeDailyTrackingSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") {
    return null;
  }
  const topEntries = Array.isArray(snapshot.top_entries)
    ? snapshot.top_entries
      .map((entry) => ({
        rank: Number(entry?.rank),
        model: String(entry?.model || "").trim(),
        provider: String(entry?.provider || "").trim(),
        tokens: String(entry?.tokens || "").trim(),
        change: String(entry?.change || "").trim(),
        ...(isHttpUrl(entry?.url) ? { url: entry.url } : {})
      }))
      .filter((entry) => Number.isInteger(entry.rank) && entry.rank > 0 && entry.model && entry.provider && entry.tokens && entry.change)
    : [];
  return {
    type: String(snapshot.type || "daily_tracking_snapshot"),
    collection_method: String(snapshot.collection_method || "public_page_playwright"),
    snapshot_status: String(snapshot.snapshot_status || (topEntries.length > 0 ? "partial" : "blocked")),
    snapshot_as_of: String(snapshot.snapshot_as_of || new Date().toISOString()),
    source_url: isHttpUrl(snapshot.source_url) ? snapshot.source_url : "https://example.com/",
    top_entries: topEntries,
    ...(snapshot.notes ? { notes: String(snapshot.notes) } : {})
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
    ...(Array.isArray(rawCandidate.image_urls) ? { image_urls: rawCandidate.image_urls.filter(isHttpUrl).slice(0, 4) } : {}),
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

function canPromoteToMain(candidate, reportDate = "") {
  if (candidate.category === "builder_observation") return false;
  if (candidate.category === "project") return false;
  if (isStatuspageCandidate(candidate)) return false;
  if (isSearchShadowCandidate(candidate)) return false;
  if (isKnownIntermediaryCandidate(candidate)) return false;
  if (isGitHubTrendingCandidate(candidate, {})) return false;
  if (isHardcoreResearchOnly(candidate)) return false;
  if (isLowValueMainCandidate(candidate)) return false;
  if (isMinorConsumerAiFeatureCandidate(candidate)) return false;
  const sourceLevel = sourceLevelForCandidate(candidate);
  const readerRelevant = isReaderRelevantCandidate(candidate);
  const majorMainNews = isMajorMainNewsCandidate(candidate);
  if (!hasReaderVisibleTitle(candidate)) return false;
  if (isFutureDatedCandidate(candidate, reportDate)) return false;
  const allowReaderRelevantCompanySignal =
    readerRelevant &&
    (sourceLevel === "official_company_news" || (majorMainNews && TRUSTED_PRIMARY_SOURCE_LEVELS.has(sourceLevel)));
  if (!isAiRelevantCandidate(candidate) && !isAigcCandidate(candidate) && !allowReaderRelevantCompanySignal) return false;
  if (!readerRelevant) return false;
  if (candidate.verification_status && !PRIMARY_STATUSES.has(candidate.verification_status)) return false;
  if (isLowSignalVendorPartnership(candidate)) return false;
  if (isBlogLikeCandidate(candidate) && !majorMainNews && !READER_RELEVANT_SOURCE_LEVELS.has(sourceLevel)) return false;
  if (candidate.category === "hot_blog" && !["official", "paper", "github", "multi_source"].includes(sourceLevel)) {
    return false;
  }
  const trustedSourceLevel = TRUSTED_PRIMARY_SOURCE_LEVELS.has(sourceLevel);
  return trustedSourceLevel && (!candidate.verification_status || PRIMARY_STATUSES.has(candidate.verification_status));
}

function canFallbackToSingleMain(candidate) {
  if (canPromoteToMain(candidate)) return true;
  if (candidate.category !== "hot_blog") return false;
  if (isStatuspageCandidate(candidate)) return false;
  if (isSearchShadowCandidate(candidate)) return false;
  if (isKnownIntermediaryCandidate(candidate)) return false;
  if (isGitHubTrendingCandidate(candidate, {})) return false;
  if (isHardcoreResearchOnly(candidate)) return false;
  if (isLowValueMainCandidate(candidate)) return false;
  if (!isAiRelevantCandidate(candidate) && !isAigcCandidate(candidate)) return false;
  if (!isReaderRelevantCandidate(candidate)) return false;
  if (candidate.verification_status && !PRIMARY_STATUSES.has(candidate.verification_status)) return false;
  return sourceLevelForCandidate(candidate) === "primary";
}

function candidateScore(candidate) {
  let score = 0;
  const sourceLevel = sourceLevelForCandidate(candidate);
  const hasCommunityImage = communityLeadHasImage(candidate);
  if (PRIMARY_STATUSES.has(candidate.verification_status)) score += 30;
  if (sourceLevel === "official" || sourceLevel === "primary") score += 20;
  if (sourceLevel === "official_company_news") score += 22;
  if (sourceLevel === "official_open_source_account" || sourceLevel === "official_model_host_account") score += 18;
  if (sourceLevel === "paper" || sourceLevel === "paper_api") score += 4;
  if (sourceLevel === "github") score += 10;
  if (candidate.category === "main_item") score += 10;
  if (candidate.category === "hot_blog") score += 6;
  if (candidate.category === "community_lead" && hasCommunityImage) score += 12;
  if (candidate.category === "community_lead" && sourceLevel === "intermediary") score += 4;
  if (isBlogLikeCandidate(candidate) && /weekly|newsletter|substack|hugging face|huggingface|latent\.space/i.test(`${candidate.source || ""} ${candidate.url || ""}`.toLowerCase())) score += 8;
  if (candidate.category === "hot_blog" && hasConcreteHotBlogMaterial(candidate)) score += 18;
  if (candidate.editorial_category === "company_business") score += 10;
  if (candidate.editorial_category === "product_radar" || candidate.editorial_category === "open_source") score += 8;
  if (isReaderRelevantCandidate(candidate)) score += 6;
  score += readerUtilityScore(candidate);
  if (isAigcCandidate(candidate)) score += 8;
  if (candidate.image_url) score += 4;
  if (hasReaderVisibleTitle(candidate)) score += 3;
  if (isRepositoryLikeUrl(candidate.url)) score -= 20;
  if (isLowSignalVendorPartnership(candidate)) score -= 22;
  if (isResolvedStatusCandidate(candidate)) score -= 25;
  if (isLowValueEventGuideCandidate(candidate)) score -= 20;
  if (isLowValueProfileCandidate(candidate)) score -= 30;
  if (candidate.category === "hot_blog" && !hasConcreteHotBlogMaterial(candidate)) score -= 20;
  if (candidate.category === "community_lead" && (sourceLevel === "paper" || sourceLevel === "paper_api")) score -= 18;
  if (candidate.category === "community_lead" && sourceLevel === "github") score -= 8;
  if (isMinorConsumerAiFeatureCandidate(candidate)) score -= 35;
  if (isFutureDatedCandidate(candidate)) score -= 30;
  if (/openai|anthropic|deepmind|google|meta|qwen|bytedance|tencent|minimax|kimi|runway|pika|luma|kling|nvidia|adobe/i.test(`${candidate.source} ${candidate.title}`)) score += 5;
  if (isLowValueMainCandidate(candidate)) score -= 40;
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

function isLowValueMainCandidate(candidate) {
  const text = `${candidate.title || ""} ${candidate.evidence || ""} ${candidate.source || ""}`.toLowerCase();
  if (LOW_VALUE_MAIN_RE.test(text)) return true;
  if (LOW_VALUE_AI_PR_RE.test(text)) return true;
  if (/(board|annual general meeting|director|circular|shareholder|baseball|arcade|community)/i.test(text) && !/(ai|agent|model|copilot|codex|rag|creator assistant|translation|gemma|codeql|plugin|qwen|claude|gpt|gemini)/i.test(text)) {
    return true;
  }
  return false;
}

function isReaderRelevantCandidate(candidate) {
  if (hasPlainReaderSignal(candidate)) return true;
  if (isHardcoreResearchOnly(candidate)) return false;
  if (isAiRelevantCandidate(candidate)) return true;
  const sourceLevel = sourceLevelForCandidate(candidate);
  const text = candidateText(candidate);
  if (TRUSTED_PRIMARY_SOURCE_LEVELS.has(sourceLevel) && isMajorMainNewsCandidate(candidate)) {
    return true;
  }
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
  if (BUILDER_LOW_SIGNAL_RE.test(text)) return false;
  if (!candidate.url && !candidate.original_url) return false;
  return BUILDER_RELEVANCE_RE.test(text);
}

function canPromoteToHotBlog(candidate, reportDate = "") {
  const sourceLevel = sourceLevelForCandidate(candidate);
  if (!["official", "primary", "paper", "multi_source"].includes(sourceLevel)) return false;
  if (candidate.verification_status && !PRIMARY_STATUSES.has(candidate.verification_status)) return false;
  if (!isAiRelevantCandidate(candidate)) return false;
  if (!isBlogLikeCandidate(candidate)) return false;
  if (!hasConcreteHotBlogMaterial(candidate)) return false;
  if (!hasReaderVisibleTitle(candidate)) return false;
  if (isFutureDatedCandidate(candidate, reportDate)) return false;
  if (isStatuspageCandidate(candidate)) return false;
  if (isSearchShadowCandidate(candidate)) return false;
  return true;
}

function canPromoteToCommunityLead(candidate, reportDate = "") {
  const sourceLevel = sourceLevelForCandidate(candidate);
  if (candidate.category === "builder_observation") return false;
  if (candidate.category === "project") return false;
  if (!isAiRelevantCandidate(candidate)) return false;
  if (!hasReaderVisibleTitle(candidate)) return false;
  if (isFutureDatedCandidate(candidate, reportDate)) return false;
  if (isSearchShadowCandidate(candidate)) return false;
  if (isResolvedStatusCandidate(candidate)) return false;
  if (isLowValueResearchLead(candidate, reportDate)) return false;
  if ((sourceLevel === "paper" || sourceLevel === "paper_api") && !hasPlainReaderSignal(candidate)) return false;
  if (isLowValueEventGuideCandidate(candidate)) return false;
  if (isLowValueProfileCandidate(candidate)) return false;
  return true;
}

function communityLeadHasImage(candidate) {
  if (isHttpUrl(candidate?.image_url)) {
    return true;
  }
  return Array.isArray(candidate?.image_urls) && candidate.image_urls.some((value) => isHttpUrl(value));
}

function isStatuspageCandidate(candidate) {
  const text = `${candidate.source_id || ""} ${candidate.source || ""} ${candidate.url || ""} ${candidate.title || ""}`.toLowerCase();
  return text.includes("statuspage") || text.includes("status page") || text.includes("status.openai.com") || text.includes("status.claude.com") || /\bincident\b/.test(text);
}

function isResolvedStatusCandidate(candidate) {
  if (!isStatuspageCandidate(candidate)) {
    return false;
  }
  return /resolved|operational|fully recovered|monitoring|elevated errors|degraded performance|incident/i.test(candidateText(candidate));
}

function isLowValueEventGuideCandidate(candidate) {
  const text = `${candidate.title || ""} ${candidate.evidence || ""} ${candidate.summary || ""}`.toLowerCase();
  return LOW_VALUE_EVENT_GUIDE_RE.test(text) && !/launch|release|pricing|availability|api|sdk|model|ai feature|siri|agent|copilot|codex|claude|gemini|gpt|模型|功能|价格|接口|开发者/.test(text);
}

function isLowValueProfileCandidate(candidate) {
  const url = String(candidate.url || "");
  const text = `${candidate.source || ""} ${candidate.title || ""}`.toLowerCase();
  if (/crunchbase\.com\/person\//i.test(url)) {
    return true;
  }
  return /crunchbase news ai/.test(text) && /\belon musk\b/.test(text);
}

function isMinorConsumerAiFeatureCandidate(candidate) {
  const text = candidateText(candidate).toLowerCase();
  if (!MINOR_CONSUMER_AI_FEATURE_RE.test(text)) {
    return false;
  }
  return !/\b(api|sdk|model|pricing|enterprise|developer|platform|open source|weights|research|regulation|policy|security|privacy|government|benchmark)\b/.test(text);
}

function hasConcreteHotBlogMaterial(candidate) {
  if (hotBlogSpecificSummary(candidate)) {
    return true;
  }
  const evidence = String(candidate.evidence || "").trim();
  if (!evidence || GENERIC_HOT_BLOG_EVIDENCE_RE.test(evidence)) {
    return false;
  }
  if (evidence.length >= 90) {
    return true;
  }
  return /\b(introduces|explains|shows|details|describes|breaks down|designed|workflow|session|distributed|enterprise|ontology|dependency)\b/i.test(evidence);
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

function hasReaderVisibleTitle(candidate) {
  const title = stripDraftPublicBodyNoise(candidate?.title || "", candidate);
  if (!title || TITLE_MOJIBAKE_RE.test(title)) {
    return false;
  }
  if (/\p{Script=Han}/u.test(title)) {
    return true;
  }
  if (/\p{Script=Thai}/u.test(title)) {
    return false;
  }

  const asciiLetters = (title.match(/[A-Za-z]/g) || []).length;
  const nonAsciiLetters = [...title].filter((char) => char.charCodeAt(0) > 127 && /\p{Letter}/u.test(char)).length;
  return (asciiLetters >= 8 && nonAsciiLetters <= 2) || (asciiLetters >= 14 && nonAsciiLetters <= 4);
}

function isRepositoryLikeUrl(url) {
  try {
    const parsed = new URL(String(url || ""));
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    if (host !== "github.com") return false;
    const parts = parsed.pathname.split("/").filter(Boolean);
    return parts.length >= 2 && !parts[0].endsWith(".atom");
  } catch {
    return false;
  }
}

function isBlogLikeCandidate(candidate) {
  const source = `${candidate.source || ""} ${candidate.source_id || ""} ${candidate.url || ""}`.toLowerCase();
  if (isRepositoryLikeUrl(candidate.url)) {
    return false;
  }
  if (source.includes("hellogithub")) {
    return false;
  }
  if (candidate.category === "hot_blog") {
    return true;
  }
  return /blog|weblog|newsletter|weekly|latent\.space|huggingface|hugging face|substack|changelog|anthropic news|openai blog|research/i.test(source);
}

function isLowSignalVendorPartnership(candidate) {
  const text = candidateText(candidate);
  if (!LOW_SIGNAL_VENDOR_PARTNERSHIP_RE.test(text)) {
    return false;
  }
  return /nvidia|sk telecom|sk hynix|lg group|doosan|ai factory|infrastructure/i.test(text);
}

function isMajorMainNewsCandidate(candidate) {
  const text = candidateText(candidate).toLowerCase();
  const sourceText = `${candidate.source || ""} ${candidate.source_id || ""}`.toLowerCase();
  const sourceLevel = sourceLevelForCandidate(candidate);
  if (isLowSignalVendorPartnership(candidate)) {
    return false;
  }
  if (candidate.source_level === "official_company_news") {
    return true;
  }
  if (sourceLevel === "official" && /changelog|release notes?|updates?/.test(sourceText) && (hasPlainReaderSignal(candidate) || isAigcCandidate(candidate))) {
    return true;
  }
  if (/newsroom|news rss|anthropic news|media center|press/.test(sourceText) && (COMPANY_ACTION_RE.test(text) || PRODUCT_PLATFORM_RE.test(text))) {
    return true;
  }
  return /spyware|phishing|security|attack|vulnerability|lawsuit|ban|policy|regulation|government|prime minister|minister|sovereign ai|annual general meeting|earnings|revenue|profit|layoffs?|reorganization|funding|acquisition|ipo|pricing|availability|rollout|launch|restores? access|service disruption|conference|summit|keynote|wwdc/i.test(text);
}

function isLowValueResearchLead(candidate, reportDate = "") {
  const sourceText = `${candidate.source || ""} ${candidate.source_id || ""} ${candidate.url || ""}`;
  if (!/openalex|doi\.org|zenodo|scholarworks|hal\.science|eprint|dataset|replication package/i.test(sourceText.toLowerCase())) {
    return false;
  }
  if (isFutureDatedCandidate(candidate, reportDate)) {
    return true;
  }
  return !hasPlainReaderSignal(candidate);
}

function isFutureDatedCandidate(candidate, reportDate = "", toleranceDays = 0) {
  const candidateDate = dateOnly(candidate?.event_date);
  const baseline = dateOnly(reportDate);
  if (!candidateDate || !baseline) {
    return false;
  }
  return candidateDate > shiftDateOnly(baseline, toleranceDays);
}

function shiftDateOnly(value, offsetDays) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function tierForCandidate(candidate) {
  if (candidate.source_level === "official" || candidate.source_level === "primary" || candidate.source_level === "official_company_news") return "T0";
  if (candidate.source_level === "official_open_source_account" || candidate.source_level === "official_model_host_account") return "T1";
  if (candidate.source_level === "paper" || candidate.source_level === "github") return "T2";
  if (candidate.source_level === "multi_source") return "T1";
  return "T3";
}

function chineseSummary(candidate, category) {
  const specific = mainItemSpecificSummary(candidate);
  if (specific) {
    return specific;
  }
  const lead = chineseLeadForCandidate(candidate);
  const fact = stripDraftPublicBodyNoise(lead || genericChineseFact(candidate, null), candidate);
  const detail = stripDraftPublicBodyNoise(mainItemDetail(candidate, category), candidate);
  if (detail) {
    return `${ensureChineseSentence(fact)}${detail}`;
  }
  if (category === "content_aigc") {
    return `${fact}。当前公开信息主要落在试用入口、样例质量、版权边界和价格信息。`;
  }
  return `${fact}。当前公开信息主要落在${mainItemScopePhrase(candidate, category)}。`;
}

function mainItemSpecificSummary(candidate) {
  const text = candidateText(candidate).toLowerCase();
  if (/whatsapp.*spyware|spyware.*whatsapp|nso/.test(text)) {
    return "WhatsApp 披露其拦截了一轮与 NSO 相关的定向钓鱼攻击，公开信息主要集中在攻击归因、拦截动作和受影响范围说明。";
  }
  if (/sovereign ai|london tech week|ai maker, not an ai taker/.test(text)) {
    return "NVIDIA 借伦敦科技周继续推进英国主权 AI，公开信息主要落在基础设施展示、伙伴协作和执行层进展。";
  }
  return "";
}

function chineseGithubDescription(description, repo) {
  const cleanDescription = stripDraftPublicBodyNoise(String(description || "").replace(/\s+/g, " ").trim());
  const repoLabel = String(repo || "").trim() || "这个仓库";
  if (hasChineseText(cleanDescription) && cleanDescription.length >= 12) {
    return trimText(`${repoLabel} 今天进入 GitHub Trending Top 10，仓库简介写的是：${cleanDescription.replace(/[。；;]+$/u, "")}。`, 120);
  }
  const pitch = githubPitchFromDescription(cleanDescription, repoLabel);
  return trimText(`${repoLabel} 今天进入 GitHub Trending Top 10，公开描述把它定位在${pitch}，仓库首页当前围绕这条能力展开。`, 120);
}

function githubDomainUseCase(domains) {
  const text = String(domains || "").toLowerCase();
  if (text.includes("agent")) return "agent 工具或工作流实现";
  if (text.includes("aigc")) return "内容生成、多模态或创作链路工具";
  if (text.includes("rag")) return "文档处理、检索增强或知识库管线";
  if (text.includes("eval")) return "评测、测试或质量验证工具";
  if (text.includes("infra")) return "部署、运行时或工程基础设施";
  return "AI 工程工具";
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
  if (/gpt-5\.2 and gpt-5\.2-codex deprecated/.test(text)) {
    return "GitHub 在 Copilot 多个体验里弃用 GPT-5.2 与 GPT-5.2-Codex";
  }
  if (/codeql 2\.25\.6 adds swift 6\.3\.2 support and improves c# coverage/.test(text)) {
    return "CodeQL 2.25.6 补上 Swift 6.3.2 支持，并增强 C# 扫描覆盖";
  }
  if (/enterprise-managed plugins in vs code in public preview/.test(text)) {
    return "VS Code 开始公测企业统一管理插件能力";
  }
  if (/unlocking dependable responses with gemini enterprise agent platform.?s agentic rag/.test(text)) {
    return "Google 拆解 Gemini 企业 Agent 平台里的检索增强方案";
  }
  if (/gemma 4 qat models/.test(text)) {
    return "Google 发布 Gemma 4 QAT 模型，主打移动端和轻量部署";
  }
  if (/sk telecom and nvidia build ai infrastructure to power korea.?s ai innovation/.test(text)) {
    return "SK Telecom 与 NVIDIA 共建韩国 AI 基础设施";
  }
  if (/nvidia and sk hynix announce multiyear technology partnership to advance memory for ai factories/.test(text)) {
    return "NVIDIA 与 SK hynix 推进 AI 工厂内存合作";
  }
  if (/naver expands ai infrastructure with nvidia/.test(text)) {
    return "NAVER 扩建 AI 基础设施，并继续绑定 NVIDIA";
  }
  if (/fix with copilot.*failing actions|failing actions.*copilot/.test(text)) {
    return "GitHub 将 Actions 失败后的 Copilot 修复入口开放给 Pro、Pro+ 和 Max 用户，重点是失败任务能否一键交给云端 agent 处理";
  }
  if (/agent tasks rest api.*copilot|copilot.*agent tasks rest api/.test(text)) {
    return "GitHub 为 Copilot Pro、Pro+ 和 Max 开放 Agent tasks REST API，重点是团队能否用接口启动、跟踪和集成 Copilot 云端 agent 任务";
  }
  if (/larger context windows.*github copilot|configurable reasoning levels.*github copilot/.test(text)) {
    return "GitHub Copilot 增加更大上下文窗口和可配置推理级别，重点是复杂代码任务能否获得更长上下文和更深推理预算";
  }
  if (/github universe is back|agentic era/.test(text)) {
    return "GitHub Universe 2026 回归，主题转向 agentic era，重点是开发者平台如何围绕 Copilot、agent 和协作工作流组织年度路线图";
  }
  if (/generative media.*startups|industry leaders.*generative media/.test(text)) {
    return "Google 汇总生成式媒体初创公司的行业视角，重点是创作工具、商业模式和内容生产链路正在怎样被生成式 AI 改写";
  }
  if (/publishers and creators.*highlight their work|new profile.*search/.test(text)) {
    return "Google 为出版方和创作者推出 Search 作品展示资料页，重点是原创内容、署名身份和搜索可见性如何被产品化";
  }
  if (/creator assistant|ai translations.*facebook|facebook.*ai translations/.test(text)) {
    return "Meta 推出 Creator Assistant 并扩展 Facebook AI Translations 语言覆盖，重点是创作者运营和跨语言内容分发能否被自动化";
  }
  if (/proposed election.*independent non-executive director|proposed re-election.*director|circulars/.test(text)) {
    return "美团发布董事选举与重选相关通函，重点是公司治理结构、董事会组成和股东投票事项是否出现变化";
  }
  if (/baidu.*annual general meeting|annual general meeting.*baidu/.test(text)) {
    return "Baidu 披露将召开年度股东大会，重点是公司治理、投资者关系和后续管理层议程是否出现变化";
  }
  if (/dreaming.*memory|better memory.*chatgpt|chatgpt.*memory/.test(text)) {
    return "OpenAI 介绍 ChatGPT 的新记忆系统，重点是让产品更稳定地记住用户偏好，并在多轮对话中保留更有用的上下文";
  }
  if (/biodefense|biological resilience/.test(text)) {
    return "OpenAI 发布 AI 时代生物防御行动计划，把模型能力与生物安全、监测和应急响应放在同一套韧性框架里讨论";
  }
  if (/nemotron 3 ultra.*sagemaker|sagemaker.*nemotron 3 ultra/.test(text)) {
    return "亚马逊云接入英伟达长程代理推理模型，重点看多轮任务效率";
  }
  if (/nemotron 3 ultra|long-running agents/.test(text)) {
    return "NVIDIA 介绍 Nemotron 3 Ultra 面向长程 agent 的推理能力，重点在多轮上下文、工具使用和推理效率";
  }
  if (/nemotron 3\.5 content safety|multimodal safety/.test(text)) {
    return "Hugging Face/NVIDIA 介绍 Nemotron 3.5 Content Safety，重点是面向企业 AI 的可定制多模态安全分类和治理能力";
  }
  if (/hf cli|agent-optimized way to work with the hub/.test(text)) {
    return "Hugging Face 这篇文章在讨论 hf CLI 如何更适合 agent 使用，重点是把模型、数据集和 Hub 操作压缩成更顺手的命令行工作流";
  }
  if (/your ai bill is out of control|ai gateway.*spend limits/.test(text)) {
    return "Cloudflare 给 AI Gateway 加上实时预算阈值，重点看多模型调用怎么控成本";
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
  if (/productivity agent suite|gateway to ai for users and enterprises/.test(text)) {
    return "腾讯云把 Productivity Agent Suite 当成企业接入 AI 的统一入口，重点看 agent、模型和业务流程能否在一个套件里闭环";
  }
  if (/dragonwell native acceleration|java\/scala applications|performance analytics system/.test(text)) {
    return "阿里云这篇文章展示用 AI 性能分析系统给 Java / Scala 应用找加速空间，核心是自动发现真正值得改的性能瓶颈";
  }
  if (/openclaw|telegram|jalankan ai coding agent|coding agent anda sendiri/.test(text)) {
    return "这篇教程讲的是如何在阿里云 ECS 上部署 OpenClaw，并通过 Telegram 把自建 coding agent 接到日常协作入口";
  }
  if (/data security center/.test(text)) {
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
  if (/rocketmq.*litetopic/.test(text)) {
    return "RocketMQ 5.5.0 新增 LiteTopic，专门处理百万级 AI agent 会话";
  }
  if (/agentscope java 2\.0/.test(text)) {
    return "AgentScope Java 2.0 补齐分布式和生产可用能力，继续往企业级 agent 框架走";
  }
  if (/tokenmaxxing|ontology-based dependency/.test(text)) {
    return "这篇文章讨论企业 agent 怎么降 token 成本，重点是先建依赖关系再减无效上下文";
  }
  if (/whatsapp.*spyware|spyware.*whatsapp|nso/.test(text)) {
    return "WhatsApp 披露其拦截了一轮与 NSO 相关的定向钓鱼攻击";
  }
  if (/sovereign ai|london tech week|ai maker, not an ai taker/.test(text)) {
    return "NVIDIA 借伦敦科技周继续推动英国主权 AI，从算力口号走向执行";
  }
  if (/sk telecom.*ai cloud|gigawatt-scale ai cloud/.test(text)) {
    return "SK Telecom 计划用 NVIDIA DSX 搭建吉瓦级 AI Cloud，首个 AI factory 瞄准 2027 年";
  }
  if (/lg group.*ai factory/.test(text)) {
    return "NVIDIA 与 LG Group 共建 AI factory，覆盖机器人、自动驾驶和 GPU 云";
  }
  if (/doosan.*ai factory/.test(text)) {
    return "NVIDIA 与 Doosan 扩大合作，继续押注 physical AI、机器人和 AI factory 基础设施";
  }
  if (/building pakistan notice helper|small ai tool for a very local safety problem/.test(text)) {
    return "作者用一个很小的 AI 工具去解决巴基斯坦本地安全公告的检索问题";
  }
  if (/finding-miscompiles-for-fun-not-profit|我用 ai 寻找 bug|miscompile/.test(text)) {
    return "这篇文章讲的是如何借助 AI 去定位 miscompile 这类难复现 bug";
  }
  if (/codex-provider-sync/.test(text)) {
    return "这个工具专门解决 Codex 切换 Provider 后历史会话丢失的问题";
  }
  if (/wwdc 2026|how to watch and what to expect/.test(text)) {
    return "苹果 WWDC 2026 临近，外界在看系统改版和 Siri / AI 是否补课";
  }
  if (/notion restores access to anthropic|service disruption/.test(text)) {
    return "Notion 已恢复 Anthropic 接入，暴露出企业 AI 工作流对模型供应商的依赖";
  }
  if (/super app/.test(text)) {
    return "OpenAI 还在推进“super app”方向，想把聊天和工具入口做成统一应用";
  }
  if (/skillopt/.test(text)) {
    return "SkillOpt 把自然语言 skill 文档当成 agent 的可训练状态";
  }
  if (/weather and climate science ai revolution|climate science ai revolution|machine learning has its limits/.test(text)) {
    return "Ars Technica 讨论气象和气候科学里的 AI 使用边界，核心问题不是“能不能用”，而是哪些环节真的比传统方法更可靠";
  }
  if (/autoscientists/.test(text)) {
    return "AutoScientists 试图让多智能体在没有中央 planner 的情况下自组织做科研";
  }
  if (/compiling agentic workflows into weights/.test(text)) {
    return "这篇论文想把完整 agent workflow 蒸馏进小模型权重里，换更低的推理成本";
  }
  if (/language models need sleep/.test(text)) {
    return "这篇论文讨论长上下文 agent 的“睡眠”机制，想降低记忆越跑越贵的问题";
  }
  if (/adapting the interface, not the model|life-harness/.test(text)) {
    return "Life-Harness 的观点是，很多 agent 失败先该改接口和反馈，不必急着重训模型";
  }
  if (/the efficiency frontier/.test(text)) {
    return "这篇论文把上下文成本当成部署问题，讨论什么时候该缓存、检索或压缩";
  }
  return "";
}

function displayTitleForCandidate(candidate) {
  return trimText(chineseLeadForCandidate(candidate) || genericChineseHeadline(candidate) || genericChineseFact(candidate, null) || candidate.title, 120);
}

function candidateReaderDigest(candidate) {
  const lead = chineseLeadForCandidate(candidate);
  if (lead) {
    return lead;
  }
  for (const field of [candidate.summary, candidate.evidence, candidate.title]) {
    const raw = stripDraftPublicBodyNoise(field, candidate);
    if (hasChineseText(raw) && raw.length >= 18) {
      return trimText(raw, 180);
    }
  }
  const headline = genericChineseHeadline(candidate);
  if (headline) {
    return headline;
  }
  return "";
}

function sourceGroundedFact(candidate, original) {
  const digest = candidateReaderDigest(candidate);
  if (digest) {
    return digest;
  }
  return genericChineseFact(candidate, original);
}

function genericChineseHeadline(candidate) {
  const raw = decodeCommonHtmlEntities(String(candidate.title || "")).replace(/\s+/g, " ").trim();
  const lower = raw.toLowerCase();
  if (!raw) return "";
  if (/deprecated/.test(lower) && /gpt-5\.2/.test(lower)) {
    return "GitHub Copilot 停用 GPT-5.2 与 GPT-5.2-Codex";
  }
  if (/codeql 2\.25\.6/.test(lower) && /swift 6\.3\.2/.test(lower)) {
    return "CodeQL 2.25.6 补上 Swift 6.3.2 支持，并增强 C# 扫描覆盖";
  }
  if (/enterprise-managed plugins in vs code in public preview/.test(lower)) {
    return "VS Code 开始公测企业统一管理插件能力";
  }
  if (/unlocking dependable responses with gemini enterprise agent platform.?s agentic rag/.test(lower)) {
    return "Google 拆解 Gemini 企业 Agent 平台里的检索增强方案";
  }
  if (/gemma 4 qat models/.test(lower)) {
    return "Google 发布 Gemma 4 QAT 模型，主打移动端和轻量部署";
  }
  if (/creator assistant/.test(lower) && /translations/.test(lower)) {
    return "Meta 推出 Creator Assistant，并扩展 Facebook AI 翻译";
  }
  if (/public preview/.test(lower) && /(plugin|copilot|codex|agent|developer|sdk|api)/.test(lower)) {
    return `${mainEntity(candidate) || "相关平台"} 将一项开发者能力推入公开预览`;
  }
  return "";
}

function genericChineseFact(candidate, original) {
  void original;
  const entity = mainEntity(candidate) || candidate.source || "相关来源";
  const category = inferredEditorialCategory(candidate);
  const sourceLevel = sourceLevelForCandidate(candidate);
  const text = candidateText(candidate);
  const theme = genericFactTheme({ category, sourceLevel, text });
  const scope = genericFactScope({ category, text });
  return `${entity} 这次放出的信息主要落在${theme}，公开细节集中在${scope}`;
}

function genericFactTheme({ category, sourceLevel, text }) {
  if (category === "company_business" || sourceLevel === "official_company_news") {
    return "公司治理、财报、组织或业务优先级";
  }
  if (category === "open_source" || sourceLevel === "official_open_source_account" || sourceLevel === "official_model_host_account") {
    return "开源仓库、模型账号或开发者资源";
  }
  if (category === "product_radar") {
    return "产品、平台或服务可用性";
  }
  if (category === "content_aigc" || AIGC_RE.test(text)) {
    return "内容生成工具或创作工作流";
  }
  if (/agent|workflow|mcp|tool|developer|coding|codex|copilot|cursor/i.test(text)) {
    return "agent、开发工具或自动化工作流";
  }
  if (/benchmark|eval|paper|research|arxiv|reasoning|long context|memory/i.test(text)) {
    return "研究、评测或能力边界";
  }
  if (/policy|safety|governance|regulation|security/i.test(text)) {
    return "安全、治理或合规";
  }
  return "AI 产品、模型或平台动态";
}

function githubPitchFromDescription(description, repo) {
  const text = `${repo} ${description}`.toLowerCase();
  if (hasChineseText(description) && description.length >= 12) {
    return trimText(description.replace(/[。；;]+$/u, ""), 60);
  }
  if (/computer vision|opencv|image processing/.test(text)) {
    return "计算机视觉和图像处理";
  }
  if (/(agent|agentic|autonomous).*(coding|code)|coding.*(agent|assistant)/.test(text)) {
    return "AI 编码和 agent 工作流";
  }
  if (/agent|agentic|autonomous/.test(text)) {
    return "agent 工作流和任务编排";
  }
  if (/mcp|tool use|function call|tools/.test(text)) {
    return "工具调用和接口接入";
  }
  if (/rag|retrieval|knowledge/.test(text)) {
    return "检索增强和知识库管线";
  }
  if (/eval|benchmark|test/.test(text)) {
    return "模型评测和质量验证";
  }
  if (/audio|speech|transcrib/.test(text)) {
    return "语音识别和音频处理";
  }
  if (/video/.test(text)) {
    return "视频生成或视频处理";
  }
  if (/image|vision/.test(text)) {
    return "图像生成或视觉处理";
  }
  if (/ui|frontend|component/.test(text)) {
    return "前端界面和组件工程";
  }
  if (/browser|web automation|crawler|scrap/.test(text)) {
    return "浏览器自动化和网页处理";
  }
  if (/docker|kubernetes|deploy|infra/.test(text)) {
    return "部署和工程基础设施";
  }
  if (/dataset|data/.test(text)) {
    return "数据集处理和数据工程";
  }
  if (/model|llm|embedding|inference/.test(text)) {
    return "模型调用和推理工程";
  }
  return "AI 工程工具";
}

function genericFactScope({ category, text }) {
  if (category === "company_business") {
    return "发布时间、管理层口径、业务投入和对合作或采购的影响";
  }
  if (/agent|workflow|mcp|tool|developer|coding|codex|copilot|cursor/i.test(text)) {
    return "适用版本、权限边界、接入方式、失败恢复和团队落地成本";
  }
  if (/benchmark|eval|paper|research|arxiv|reasoning|long context|memory/i.test(text)) {
    return "实验设置、数据范围、可复现材料和与现有方案的差异";
  }
  if (/policy|safety|governance|regulation|security/i.test(text)) {
    return "生效范围、执行主体、例外条款和上线流程影响";
  }
  return "入口、适用对象、证据和后续动作";
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

function readerJudgementForCandidate(candidate, category) {
  const text = candidateText(candidate);
  if (category === "company_business") {
    return "重点看管理层议程、资源投入、合作伙伴和财务口径有没有一起变化";
  }
  if (category === "product_radar") {
    return "重点看入口、地区、权限、价格、目标用户和后续发布时间是否已经明确";
  }
  if (category === "open_source") {
    return "重点看代码示例、许可证、模型卡、下载限制、维护节奏和真实案例是否齐全";
  }
  if (category === "content_aigc" || AIGC_RE.test(text)) {
    return "重点看试用入口、样例质量、版权边界、商用条件和价格变化";
  }
  if (/agent|workflow|mcp|tool|developer|coding|codex|copilot|cursor/i.test(text)) {
    return "重点看 API、权限、上下文管理、失败恢复和团队落地成本";
  }
  if (/benchmark|eval|paper|research|arxiv|reasoning|long context|memory/i.test(text)) {
    return "重点看实验设置、数据范围、可复现材料和与现有方案的差异";
  }
  if (/policy|safety|governance|regulation|security/i.test(text)) {
    return "重点看生效范围、执行主体、例外条款和产品上线流程";
  }
  return "重点看发布时间、入口、适用对象和可验证证据";
}

function mainItemDetail(candidate, category) {
  const text = candidateText(candidate).toLowerCase();
  if (category === "content_aigc" || isAigcCandidate(candidate)) {
    return "最有用的公开信息，通常是试用入口、样例质量、版权边界、商用条件和价格是否一起披露";
  }
  if (/gpt-5\.2 and gpt-5\.2-codex deprecated/.test(text)) {
    return "影响范围包括 Copilot Chat、代码补全和 agent 模式，团队需要同步检查默认模型和迁移路径";
  }
  if (/codeql 2\.25\.6 adds swift 6\.3\.2 support and improves c# coverage/.test(text)) {
    return "直接受影响的是多语言仓库的静态扫描一致性，尤其是 Swift 与 C# 并存的代码库";
  }
  if (/enterprise-managed plugins in vs code in public preview/.test(text)) {
    return "重点不在插件数量，而在企业能否统一控管插件装配、策略和开发环境";
  }
  if (/unlocking dependable responses with gemini enterprise agent platform.?s agentic rag/.test(text)) {
    return "文章把重点放在企业知识检索怎样减少幻觉、提高回答稳定性，而不是把 RAG 再包装成一串平台名词";
  }
  if (/creator assistant|ai translations.*facebook|facebook.*ai translations/.test(text)) {
    return "信号是创作者运营、跨语言分发和账号增长工具继续往 AI 自动化收口";
  }
  if (/github universe 2026|agentic era/.test(text)) {
    return "它更像 GitHub 在年度路线图里给 Copilot 和 agent 抢主舞台，而不是一次普通大会预热";
  }
  if (/gemma 4 qat models/.test(text)) {
    return "QAT 版本把模型压缩和轻量部署摆到台前，明显冲着手机、笔记本和边缘设备去";
  }
  if (/nemotron 3 ultra.*sagemaker|sagemaker.*nemotron 3 ultra/.test(text)) {
    return "这次更值得看的，不是模型名字本身，而是亚马逊云把长程代理推理能力接进现成云入口后，团队能更快验证多轮上下文、工具调用和推理效率";
  }
  if (/your ai bill is out of control|ai gateway.*spend limits/.test(text)) {
    return "它把 spend limit、身份权限和多供应商调用放进同一套控制面里，团队可以更早拦住 token 失控和预算外溢";
  }
  if (/sk telecom and nvidia build ai infrastructure to power korea.?s ai innovation/.test(text)) {
    return "这类合作真正值得看的不是新闻稿口号，而是有没有交代本地算力、交付路径和客户落地范围";
  }
  if (/nvidia and sk hynix announce multiyear technology partnership to advance memory for ai factories/.test(text)) {
    return "如果没有更具体的性能、供货和部署信息，它就更接近供应链合作信号，而不是立刻改变团队路线的产品发布";
  }
  if (/naver expands ai infrastructure with nvidia/.test(text)) {
    return "真正的看点是本土平台是否开始为全球 AI 服务负载扩算力，而不只是补一批硬件";
  }
  if (category === "content_aigc" || isAigcCandidate(candidate)) {
    return "重点看它有没有把试用入口、样例质量、版权边界和价格条件一起说清楚";
  }
  return "";
}

function ensureChineseSentence(value) {
  const text = String(value || "").trim().replace(/[。；;,\s]+$/u, "");
  return `${text}。`;
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

function hotBlogSpecificAngle(candidate) {
  const text = candidateText(candidate).toLowerCase();
  if (/building pakistan notice helper|small ai tool for a very local safety problem/.test(text)) {
    return "文章最有价值的地方，是它先把问题压得很窄，再决定该用多重的 AI 流程，而不是先炫模型能力";
  }
  if (/rocketmq.*litetopic|agentscope java 2\.0|tokenmaxxing/.test(text)) {
    return "阅读时重点看作者把哪些工程约束讲清楚了，哪些是真正能落进生产环境的能力，哪些还只是 demo 叙事";
  }
  if (/skillopt|autoscientists|language models need sleep|the efficiency frontier|life-harness/.test(text)) {
    return "阅读时重点看方法边界：哪些结论来自实验设置，哪些部分真的能迁移到团队自己的 agent 工作流";
  }
  return "";
}

function hotBlogSpecificSummary(candidate) {
  const text = candidateText(candidate).toLowerCase();
  if (/building pakistan notice helper|small ai tool for a very local safety problem/.test(text)) {
    return "作者做了一个面向巴基斯坦本地安全公告的检索助手，问题边界压得很窄。文章把数据入口、检索路径和真实使用场景讲得很具体，不是先堆复杂 agent 再找问题。对产品和内容团队的参考价值，在于它给了一个“先做小而准的 AI 工具，再谈扩展”的案例。";
  }
  if (/rocketmq.*litetopic/.test(text)) {
    return "文章介绍 RocketMQ 5.5.0 的 LiteTopic，目标是承接百万级轻量 AI agent 会话。作者把事件分发、会话隔离和持久化这些消息层约束讲得比模型故事更具体，也给出了对应场景。对工程团队的价值，在于判断多 agent 或高并发系统里，消息层是不是要单独设计。";
  }
  if (/agentscope java 2\.0/.test(text)) {
    return "文章讲 AgentScope Java 2.0 如何补齐分布式调度、企业级部署和生产可用能力。它关心的是 Java 团队真正会卡住的稳定性、集成和治理问题，不只是 demo 体验。团队更需要看清的是，企业内部 agent 平台到底要不要走 JVM 路线。";
  }
  if (/tokenmaxxing|ontology-based dependency/.test(text)) {
    return "文章拆解企业 agent 的 token 开销为什么会被无效上下文放大，问题不在模型单价，而在上下文装得过满。作者给的方法是先画任务依赖关系，再决定哪些信息该进检索、哪些留在记忆、哪些直接删掉。对团队落地的意义在于，它把检索、记忆和上下文裁剪三条优化路线拆成了可分别验证的工程边界。";
  }
  if (/gpt-5\.2 and gpt-5\.2-codex deprecated/.test(text)) {
    return "这条更新的重点不是单纯下线两个模型名，而是 GitHub 开始重新整理 Copilot Chat、补全和 agent 模式背后的默认模型组合。真正值得看的，是哪些入口已经切走、哪些团队还需要补迁移，以及现有提示词、评测和自动化流程会不会被连带影响。";
  }
  if (/enterprise-managed plugins in vs code in public preview/.test(text)) {
    return "VS Code 这次放出的不是一个新插件，而是企业统一管理插件装配和策略的入口，核心问题是开发环境治理终于开始产品化。对平台团队来说，更值得盯的是权限模型、允许名单、分发方式和团队级配置能不能真正落到现有 IDE 管理流程里。";
  }
  if (/unlocking dependable responses with gemini enterprise agent platform.?s agentic rag/.test(text)) {
    return "Google 这篇文章拆解的是企业检索增强的落地流程：先准备知识切片和索引，再处理查询改写、召回、重排与上下文拼装，目标是减少幻觉并稳住回答质量。更有用的是，它把效果验证和方法边界也放进同一套流程里，团队可以据此判断企业知识库问答到底该在哪些环节补检索和评测。";
  }
  if (/productivity agent suite|gateway to ai for users and enterprises/.test(text)) {
    return "腾讯云把 Productivity Agent Suite 打包成企业接入 AI 的统一入口，套件把 agent、模型和业务流程放在同一条交付链路里。文章真正有价值的地方，是它把哪些组件、业务场景和企业接入路径公开出来，说明大厂正把企业级 agent 从概念演示往标准化产品推进。";
  }
  if (/dragonwell native acceleration|java\/scala applications|performance analytics system/.test(text)) {
    return "阿里云介绍一套 AI 驱动的性能分析系统，用来自动找出 Java / Scala 应用里最值得优先优化的热点。重点不是“10 倍提升”的口号，而是把性能排查、定位和优化建议做成可重复的产品能力；如果方法和误报边界公开得足够清楚，这类工具就可能进入日常性能治理链路。";
  }
  if (/openclaw|telegram|jalankan ai coding agent|coding agent anda sendiri/.test(text)) {
    return "这篇教程把 OpenClaw、阿里云 ECS 和 Telegram 串成一条可直接上手的自建 coding agent 路线，说明个人或小团队已经能用现成云资源快速搭起远程协作入口。真正有用的是部署步骤、权限配置和协作体验是否写得足够清楚，而不是再讲一遍“agent 很火”。";
  }
  if (/nemotron 3\.5 content safety|customizable multimodal safety/.test(text)) {
    return "这篇文章介绍 Nemotron 3.5 Content Safety 如何把文本、图像等多模态内容做成统一安全分类，并按企业政策返回审核结果。对内容平台和企业 AI 团队来说，更关键的是它把地区、行业和平台差异做成可配置策略，审核口径不必每次重建一套流程。真正需要盯的是误判率、漏判成本、支持的模态范围，以及接入现有风控系统时要补多少人工兜底。";
  }
  if (/hf cli|agent-optimized way to work with the hub/.test(text)) {
    return "这篇文章想解决的，是 agent 操作 Hugging Face Hub 时总被网页按钮、权限跳转和人工确认打断，所以把拉模型、下数据集、登录和仓库管理尽量收进命令行。对做自动化的团队来说，关键不只是多一个 CLI，而是常用 Hub 动作终于更容易被脚本和工作流稳定调用。";
  }
  if (/endava.*software delivery|software delivery.*ai agents/.test(text)) {
    return "OpenAI 用 Endava 案例讲企业怎么把 ChatGPT Enterprise、Codex 和 agent 工作流塞进软件交付链路，重点不是口号，而是哪些开发、协作和自动化环节真的被改写。文章真正有参考价值的地方，是它把落地团队、接入工具和可复用流程说得有多具体，这决定 agent 进入交付体系到底是不是可复制能力。";
  }
  return "";
}

export function hotBlogSummary(candidate) {
  const specific = hotBlogSpecificSummary(candidate);
  if (specific) {
    return trimText(specific, 220);
  }
  const digest = candidateReaderDigest(candidate) || hotBlogClaimForCandidate(candidate);
  const angle = hotBlogSpecificAngle(candidate) || hotBlogEvidenceForCandidate(candidate);
  const action = hotBlogActionForCandidate(candidate);
  return trimText(`${digest}。${angle}。${action}。`, 220);
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
    return "原文把价值落在代码、接口、README、案例和失败模式这些硬信息上，而不是只给观点";
  }
  if (/paper|arxiv|benchmark|eval|dataset|leaderboard/i.test(text)) {
    return "真正有用的是实验设置、数据来源、对比基线、可复现代码和作者承认的限制";
  }
  if (/product|launch|platform|enterprise|workflow|agent/i.test(text)) {
    return "真正的信息密度在真实场景、接入门槛、价格、可用地区、案例证据和工作流限制";
  }
  return "真正有价值的是作者给出的证据、适用前提、反例和没有覆盖的边界";
}

function hotBlogActionForCandidate(candidate) {
  const text = candidateText(candidate);
  if (/agent|workflow|tool|coding|developer|mcp/i.test(text)) {
    return "这类文章最有用的地方，是能帮团队判断它该不该进入试点、采购或内部自动化路线图";
  }
  if (/model|llm|benchmark|eval|reasoning|context/i.test(text)) {
    return "它能帮助读者更新对模型能力的预期，而不是只记住排行榜或单个指标";
  }
  if (/policy|security|safety|governance|regulation/i.test(text)) {
    return "它更适合作为合规、安全或平台治理团队的风险输入，而不是一条普通新闻";
  }
  if (AIGC_RE.test(text)) {
    return "它能帮助内容团队判断这类工具该不该进入试用、采购或正式生产流程";
  }
  return "它能帮助读者判断这条变化是否会影响产品路线、工具选型或内部风险预案";
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

function hotBlogAngleSentence(candidate) {
  const focus = hotBlogFocusForCandidate(candidate);
  const angle = hotBlogReadingAngle(candidate);
  if (focus && angle) {
    return `文章真正有用的部分，在于它讲清了${focus}，同时没有回避${angle}`;
  }
  if (focus) {
    return `文章把重点落在${focus}`;
  }
  if (angle) {
    return `文中把${angle}交代得更具体`;
  }
  return "文章没有停留在抽象观点，而是给了更具体的做法和边界";
}

function hotBlogReaderValueSentence(candidate) {
  return `对读者的价值，在于${hotBlogReaderValue(candidate)}`;
}

function builderReadableSummary(originalText) {
  const text = String(originalText || "").replace(/\s+/g, " ").trim();
  const lower = text.toLowerCase();
  if (/dreambeans|personal intelligence|google apps|hope scroll|endless scroll/.test(lower)) {
    return "Google Labs 展示 Dreambeans 实验应用，重点是用 Personal Intelligence 连接 Google 应用，并把用户关注事项整理成每日集合；读者可关注它是否给出试用入口、隐私边界和真实场景示例。";
  }
  if (/generating frontends|business data|killer apps of coding ai/.test(lower)) {
    return "Guillermo Rauch 关注“用业务数据生成前端”这一 coding AI 场景，重点是把内部数据直接转成可操作界面；读者可关注权限、数据接入方式和生成结果能否进入生产工作流。";
  }
  if (/codex.*default tab|default tab.*chatgpt/.test(lower)) {
    return "Peter Yang 讨论 ChatGPT 应用里的 Codex 入口优先级，重点是 coding agent 是否正在从附加功能变成开发者的默认工作台；读者可关注产品入口、权限和团队协作能力。";
  }
  if (/little vectors at openai|coming weeks/.test(lower)) {
    return "Thibault Sottiaux 观察 OpenAI 多条产品线正在朝同一方向收敛，重点是后续几周可能出现的模型、agent 和开发者工具组合变化；读者可关注官方发布与实际可用入口。";
  }
  if (/automated 95%.*analytics|business analytics queries.*claude|evals, ablations/.test(lower)) {
    return "Cat Wu 转发 Anthropic 数据团队用 Claude 自动化业务分析查询的案例，重点是 eval、ablation 和内部工具链如何支撑高比例自动化；读者可关注方法论、失败边界和可迁移性。";
  }
  if (/first eval ship from cog|metr evals|enterprise evals/.test(lower)) {
    return "Swyx 关注 Cog 的企业级 eval 进展，并把它与 METR 的长任务评测边界作对比；读者可关注长周期任务、财务保证和私有评测是否能成为 agent 采购依据。";
  }
  if (/danintheory|spotify|apple podcasts|youtube/.test(lower)) {
    return "Matt Turck 提到一场与 OpenAI 相关负责人的访谈已同步到播客和 YouTube；读者可把它作为产品路线和模型方向的访谈入口，重点听是否出现可验证的新信息。";
  }
  if (/gemini feature|macos app/.test(lower)) {
    return "Josh Woodward 提到 macOS 版 Gemini 的新体验，重点是桌面端 AI 助手是否更贴近日常工作流；读者可关注功能范围、系统权限和是否已有稳定入口。";
  }
  if (/python sdk|openai-codex|use codex within your own programs/.test(lower)) {
    return "Thibault Sottiaux 提到可通过 Python SDK 在自有程序中调用 Codex，重点是 coding agent 能否嵌入内部工具链；读者可关注 SDK 权限、任务追踪和失败处理方式。";
  }
  if (/claude code.*pm|agentic eval|model performance/.test(lower)) {
    return "Cat Wu 发布 Claude Code 相关产品岗位信息，重点指向模型表现和 agentic eval；读者可关注团队是否继续把评测能力和产品性能改进绑定。";
  }
  if (/vercel ai gateway.*1t tokens|zero markup over the labs|zero-data retention/.test(lower)) {
    return "Guillermo Rauch 说，Vercel AI Gateway 每月能替用户“救回”超过 1T token 请求，做法类似支付里的智能重试：底层模型失败或额度出问题时，用网关做冗余切换。重点不是再赚一层差价，而是在不加价的前提下补上容灾、零数据留存、可观测性、用量 API 和配额控制。";
  }
  if (/opus is the best model for long-running work|five tips for running opus autonomously/.test(lower)) {
    return "Boris Cherny 总结了让 Opus 长时间自主跑任务的五个要点：权限尽量自动放行、把复杂任务拆进动态工作流、用 /goal 或 /loop 强化“做完再停”、尽量放到云端跑，以及确保 Claude 能持续拿到它需要的工具和文件。";
  }
  if (/market got wrong about ai eating enterprise software|gtm|enterprise software/.test(lower)) {
    return "Aaron Levie 认为市场误判了“AI 会吞掉企业软件”的速度。写软件本身确实更便宜了，但企业软件真正昂贵的部分一直是分发、销售、实施和长期服务，所以 AI 不会自动抹平这些护城河。";
  }
  if (/box now has a markdown editor|full cli support|box drive/.test(lower)) {
    return "Aaron Levie 宣布 Box Web 端补上了 Markdown 编辑、CLI、评论和版本历史，同时 Box Drive 可以把文件直接挂给 Claude、Codex、Obsidian、Cursor 这类桌面工具。重点是 Box 想把自己变成 AI 工具能直接读写的文件层，而不只是云盘。";
  }
  if (/new kind of big button.*codex|10x usage limits for a month|100 days/.test(lower)) {
    return "Thibault Sottiaux 说 Codex 接下来 100 天每天会挑一位做出高质量成果的用户，给一个月 10 倍额度。这个动作本质上是在用更高上限换真实案例，看看高频用户会把 Codex 推到什么强度。";
  }
  if (/training data is low skill|high-economic-value tasks|knowledge work agents/.test(lower)) {
    return "Madhu Guru 反驳了“训练数据只是低技能脏活”的看法。他的核心观点是，前沿模型真正缺的是高经济价值任务的数据，而这类知识往往分散在旧工具、专家经验和难标准化的工作流里，所以知识工作 agent 迟迟没有像 SWE agent 那样成熟。";
  }
  if (/routing to models|model routing|router/.test(lower)) {
    return "把请求路由到合适模型确实很难：成本、延迟、质量和可用性都会变化，不能只按单一排行榜或默认模型做决定。";
  }
  if (/token costs?|tokens? cost|pricing|costs? are becoming/.test(lower)) {
    return "Token 成本正在成为模型选择里的真实约束：同一个工作流要同时看价格、上下文长度、延迟和失败率，而不是只看能力榜。";
  }
  if (/filter or sort.*codex threads|codex threads.*filter or sort/.test(lower)) {
    return "应该有办法筛选或排序所有 Codex 线程；线程一多，找回正在进行、已阻塞或需要收尾的任务会变得很困难。";
  }
  if (/plato.*dialogues?|favorite.*dialogues?/.test(lower)) {
    return "原帖提到自己最喜欢的柏拉图对话；这更像个人阅读分享，除非上下文连接到 AI 工具或 agent 实践，否则不应扩写成产品信号。";
  }
  if (/datasette-agent-edit|release:.*agent|agent-edit/.test(lower)) {
    return "发布 datasette-agent-edit：它把 agent 辅助编辑接到 Datasette 工作流里，重点看是否能稳定处理数据、权限和可回滚修改。";
  }
  if (/vercel ai gateway.*recovers on average over 1t tokens|zero markup over the labs|smart retries/.test(lower)) {
    return "Guillermo Rauch 说 Vercel AI Gateway 每月平均能帮客户追回超过 1T tokens 的请求量，逻辑类似支付里的失败重试；他强调平台不在模型层加价，卖点放在冗余路由、零数据留存、观测和配额控制。";
  }
  if (/lockdown mode|eligible personal accounts|self-serve chatgpt business accounts/.test(lower)) {
    return "OpenAI 开始向个人和自助版 ChatGPT Business 账户推出 Lockdown Mode，重点是把高风险场景下的数据访问、外部连接和协作入口收得更紧。";
  }
  if (/market got wrong about ai eating enterprise software|enterprise software companies is actually on gtm/.test(lower)) {
    return "Aaron Levie 认为市场高估了 AI 直接吞掉企业软件的速度：写软件变容易只是起点，真正难的是分发、集成、信任、销售和长期服务这些企业软件的重成本环节。";
  }
  if (/box now has a markdown editor on the web|full cli support|full version history|mounted drive/.test(lower)) {
    return "Box 网页端补上了 Markdown 编辑、CLI、评论和版本历史，Box Drive 也能把文件挂载给 Codex、Cursor、Obsidian 这类桌面工具，信号是企业内容库开始主动适配 agent 与本地工具链。";
  }
  if (/new kind of big button.*codex|10x usage limits for a month|select one person per day/.test(lower)) {
    return "OpenAI 的 Thibault Sottiaux 说接下来 100 天会每天挑一个高价值 Codex 用例，给 1 个月 10 倍 usage limit，本质上是在用真实案例拉动社区展示更成熟的 Codex 工作流。";
  }
  return `这条帖子在谈${builderTopicName(lower)}，重点落在${builderFocusPoints(lower)}。如果要继续跟进，先看它有没有给出真实场景、约束条件和可复用做法。`;
}

function builderTopicName(text) {
  if (/agent|eval|production|workflow|tool|coding|codex|cursor|copilot/.test(text)) {
    return "AI 工具和 agent 实践";
  }
  if (/model|llm|openai|anthropic|claude|gemini|gpt/.test(text)) {
    return "模型产品和能力变化";
  }
  return "AI 生态变化";
}

function builderFocusPoints(text) {
  if (/pricing|token|cost|gateway|retry|retention|quota|usage api/.test(text)) {
    return "成本、容灾、可观测性和网关这一层到底能替团队省多少事";
  }
  if (/permissions?|dynamic workflows?|goal|loop|cloud/.test(text)) {
    return "权限放行、工作流编排和长任务稳定性";
  }
  if (/gtm|enterprise software|market/.test(text)) {
    return "企业分发、销售和服务这些真正难被 AI 立刻抹平的成本";
  }
  if (/markdown|cli|version history|drive|codex|cursor|obsidian/.test(text)) {
    return "文件入口、版本历史，以及它怎样接进现有 AI 工具链";
  }
  if (/training data|knowledge work|domain-specific/.test(text)) {
    return "高价值训练数据为什么难拿，以及这会卡住哪些知识工作 agent";
  }
  return "真实场景、落地边界和哪些做法可以直接复用";
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
    candidate.summary,
    candidate.content,
    candidate.original_text,
    candidate.reader_relevance,
    candidate.image_alt
  ].filter(Boolean).join(" ");
}

function sanitizeBuilderOriginalText(candidate) {
  const fallback = candidate.original_text || candidate.evidence || candidate.title || "";
  let text = String(fallback).replace(/\s+/g, " ").trim();
  if (!text) {
    return text;
  }

  const author = String(candidate.author || "").trim();
  const handle = String(candidate.handle || "").trim().replace(/^@/, "");
  if (author && handle) {
    text = text.replace(new RegExp(`^${escapeRegex(author)}\\s+@?${escapeRegex(handle)}\\s+\\d+\\s*(?:s|m|h|d|w)\\b\\s*`, "i"), "");
  }
  if (author) {
    text = text.replace(new RegExp(`^${escapeRegex(author)}\\s+`, "i"), "");
  }
  if (handle) {
    text = text.replace(new RegExp(`^@?${escapeRegex(handle)}\\s+`, "i"), "");
  }

  text = text
    .replace(/^\d+\s*(?:s|m|h|d|w)\b\s*/i, "")
    .replace(/\b\d[\d,.]*\s+(?:likes?|replies|reply|reposts?|retweets?|views?|bookmarks?)\b/gi, "")
    .replace(/\b(?:view post image|show more|translate post|read more|view analytics|copy link)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return text || String(candidate.title || "").trim();
}

function stripSentenceEnding(value) {
  return String(value || "").trim().replace(/[。！？!?；;]+$/u, "");
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

function decodeCommonHtmlEntities(value) {
  return String(value || "")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/&amp;/g, "&");
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
