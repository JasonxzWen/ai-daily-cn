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
import {
  auditGroupForPlatform,
  isPlatformExemptCategory,
  PLATFORM_CATEGORY_TO_SECTION,
  PLATFORM_TO_AUDIT_GROUP,
  platformFromCandidateCategory
} from "./platform-exempt.js";
import { isMeaningfulPublicEvidenceAsset } from "./media-policy.js";
import { selectChineseMediaDynamics } from "./chinese-media.js";
import { selectOfficialOrgUpdates } from "./official-updates.js";
import { buildTrackingComponentSnapshot } from "./tracking-components.js";
import { normalizeOfficialComponentSnapshot } from "./official-component-snapshot.js";
import { normalizeStoryFirstReport } from "./story-first.js";
import { buildSourceEffectivenessTable } from "./source-effectiveness.js";
import { createPublicDegradationEvent } from "./degradation-events.js";
import { normalizeGithubReadmeSummary } from "./github-readme.js";

const REQUIRED_AUDIT_GROUPS = [
  "github_trending",
  "huggingface_trending",
  "builder_sources",
  "china_ai_sources",
  "content_sources",
  "search_sources",
  "sources_health"
];
const DEGRADED_DISCOVERY_INPUT_FALLBACKS = [
  {
    pattern: /^github-trending-\d{4}-\d{2}-\d{2}\.json$/i,
    auditGroup: "github_trending",
    sourceName: "GitHub Trending",
    sourceUrl: "https://github.com/trending",
    sourceCategory: "github_trending"
  },
  {
    pattern: /^huggingface-trending-\d{4}-\d{2}-\d{2}\.json$/i,
    auditGroup: "huggingface_trending",
    sourceName: "Hugging Face Trending",
    sourceUrl: "https://huggingface.co/models?sort=trending",
    sourceCategory: "project"
  },
  {
    pattern: /^builders-\d{4}-\d{2}-\d{2}\.json$/i,
    auditGroup: "builder_sources",
    sourceName: "Builder discovery",
    sourceUrl: "https://x.com/",
    sourceCategory: "builder"
  },
  {
    pattern: /^china-ai-\d{4}-\d{2}-\d{2}\.json$/i,
    auditGroup: "china_ai_sources",
    sourceName: "China AI discovery",
    sourceUrl: "https://www.qbitai.com/",
    sourceCategory: "community"
  },
  {
    pattern: /^content-sources-\d{4}-\d{2}-\d{2}\.json$/i,
    auditGroup: "content_sources",
    sourceName: "Content source discovery",
    sourceUrl: "https://openai.com/news/",
    sourceCategory: "community"
  },
  {
    pattern: /^statuspage-incidents-\d{4}-\d{2}-\d{2}\.json$/i,
    auditGroup: "content_sources",
    sourceName: "Statuspage incident discovery",
    sourceUrl: "https://status.openai.com/",
    sourceCategory: "official_release"
  },
  {
    pattern: /^search-news-\d{4}-\d{2}-\d{2}\.json$/i,
    auditGroup: "search_sources",
    sourceName: "Search/news discovery",
    sourceUrl: "https://www.google.com/search?q=AI",
    sourceCategory: "community"
  },
  {
    pattern: /^sources-health-\d{4}-\d{2}-\d{2}\.json$/i,
    auditGroup: "sources_health",
    sourceName: "Source health check",
    sourceUrl: "https://github.com/JasonxzWen/ai-daily-cn/tree/main/config/sources",
    sourceCategory: "community"
  }
];
const DEGRADED_DISCOVERY_INPUT_ERROR_CODES = new Set(["ENOENT", "EACCES", "EPERM", "EBUSY", "EIO", "EMFILE", "ENFILE"]);
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
const INTERMEDIARY_SOURCE_RE = /techcrunch|the verge|verge ai|ars technica|venturebeat|fast company|planet ai|google news|product hunt|producthunt|crunchbase|36kr|qbitai|jiqizhixin|leiphone|infoq|hacker news|hnrss|reddit|smol ai|ben's bites|buttondown|ai news archive|the magnifier/i;
const AI_RELEVANCE_RE = /\b(ai|artificial intelligence|machine learning|ml|deep learning|neural|llm|large language model|model|models|agent|agents|agentic|chatgpt|codex|claude|gemini|gpt|grok|openai|anthropic|deepmind|xai|x\.ai|mistral|qwen|nemotron|reasoning|inference|eval|benchmark|rag|embedding|vector|transformer|diffusion|copilot|cursor|mcp)\b|人工智能|机器学习|深度学习|神经网络|大模型|模型|智能体|推理|评测|向量|多模态|代码助手/i;
const BUILDER_RELEVANCE_RE = /\b(ai|agi|llm|model|agent|agents|openai|anthropic|claude|gemini|deepmind|google labs|gpt|codex|cursor|copilot|mcp|eval|benchmark|rag|inference|training|fine[-\s]?tuning|prompt|token|transformer|diffusion|sora|veo|runway)\b|人工智能|大模型|模型|智能体|代理|评测|推理|训练|微调|提示词|多模态|生成式|文生图|文生视频|代码助手/i;
const BUILDER_IRRELEVANT_RE = /\bnot anything ai related\b|nothing to do with ai|unrelated to ai|off[-\s]?topic/i;
const BUILDER_LOW_SIGNAL_RE = /\bgood night\b|touch sand|favorite of plato|favorite.*dialogues?|vibecon\b|my absolute favorite|last chance to fill out|annual ai engineering survey|\bama\b|\byolo\b|martial arts movies|foggiest|sunniest/i;
const COMPANY_ACTION_RE = /\b(earnings|quarterly results?|financial results?|revenue|profit|guidance|layoffs?|job cuts?|hiring|reorganization|reorganisation|restructuring|organization changes?|leadership|management|board|conference|summit|keynote|product conference|launch event|partnership|investment|pricing|availability|policy|regulation|open[-\s]?source|github|hugging face|model weights?)\b|财报|业绩|营收|利润|指引|裁员|招聘|组织架构|组织调整|重组|管理层|董事会|大会|峰会|发布会|合作|投资|价格|定价|可用性|政策|监管|开源|模型权重/i;
const PRODUCT_PLATFORM_RE = /\b(product|platform|app|service|cloud|enterprise|developer|api|sdk|release|launch|availability|pricing|quota|github|hugging face|open[-\s]?source|repo|repository)\b|产品|平台|应用|服务|云|企业|开发者|接口|发布|上线|可用|价格|配额|开源|仓库/i;
const HARDCORE_RESEARCH_RE = /\b(arxiv|paper|benchmark|evaluation|eval|reasoning traces?|transformer inference|inference benchmark|ablation|dataset|pre[-\s]?train|post[-\s]?training|fine[-\s]?tuning|rlvr|loss|gradient|tokenizer|architecture|throughput|latency|context window)\b|论文|基准|评测|推理轨迹|消融|数据集|训练|微调|架构|吞吐|延迟/i;
const PLAIN_READER_SIGNAL_RE = /\b(pricing|availability|rollout|launch|product|platform|app|service|enterprise|developer|api|sdk|conference|summit|partnership|customer|use case|workflow|open[-\s]?source|github|hugging face|model weights?|layoffs?|job cuts?|reorganization|restructuring|earnings|revenue|guidance)\b|价格|定价|可用|发布|上线|产品|平台|应用|服务|企业|开发者|接口|大会|峰会|合作|客户|用例|工作流|开源|模型权重|裁员|组织调整|重组|财报|营收|指引/i;
const LOW_SIGNAL_VENDOR_PARTNERSHIP_RE = /\b(partnership|collaborat(?:e|ion)|build(?:ing)? an ai factory|ai factory|build ai infrastructure|gigawatt-scale ai cloud|memory for ai factor(?:y|ies)|uk sovereign ai|sovereign ai advancements|ai maker,\s*not an ai taker)\b|合作|联合打造|共建/i;
const LOW_VALUE_EVENT_GUIDE_RE = /\bhow to watch\b|\bwhat to expect\b|\bwatch live\b|\blivestream\b|\bschedule\b|\blineup\b|\btickets?\b|直播|观看指南|日程|赛程/i;
const MINOR_CONSUMER_AI_FEATURE_RE = /\bdesign merch\b|\balexa for shopping\b|\bpet portraits?\b|\btumblers?\b|\bgroup shirts?\b|\bcreator assistant\b|\bai translations?\b|\bfacebook translations?\b/i;
const PUBLIC_AI_HEADLINE_ENTITY_RE = /\b(openai|google|deepmind|anthropic|meta|nvidia|xai|x\.ai|microsoft|amazon|aws|apple|bytedance|byte\s*dance|tiktok|alibaba|qwen|deepseek|tencent|minimax|moonshot|kimi|mistral|hugging face|runway|pika|luma|kling|adobe)\b|字节|阿里|通义|腾讯|混元|深度求索|月之暗面|快手|可灵|商汤|智谱|百川|阶跃星辰/i;
const STRATEGIC_CORE_SOURCE_RE = /\b(openai|anthropic|claude|deepmind|google research|google keyword|meta ai|meta llama|microsoft|zhipu|z\.ai|zai-org|glm|智谱|minimax|moonshot|kimi|deepseek|bytedance|byte\s*dance|seed\.bytedance|tencent|hunyuan|qwen|alibaba|meituan)\b|openai\.com|anthropic\.com|deepmind\.google|research\.google|blog\.google|ai\.meta\.com|about\.fb\.com|microsoft\.com|zhipuai\.cn|minimax\.io|kimi\.com|platform\.kimi\.com|deepseek\.com|bytedance\.com|seed\.bytedance\.com|tencent\.com|hunyuan\.tencent\.com|qwen\.ai|alibabagroup\.com|alibabacloud\.com|meituan\.com|github\.com\/(?:openai|anthropics|google-deepmind|meta-llama|deepseek-ai|qwenlm|moonshotai|minimax-ai|tencent-hunyuan|tencent|bytedance|alibaba|meituan|microsoft)\b|huggingface\.co\/(?:openai|anthropic|deepseek-ai|minimaxai|qwen|zai-org|bytedance-seed|moonshotai|meta-llama|microsoft)\b/i;
const OVERREPRESENTED_INFRA_VENDOR_SOURCE_RE = /\b(nvidia|aws|amazon web services|amazon bedrock|sagemaker)\b|developer\.nvidia\.com|nvidianews\.nvidia\.com|blogs\.nvidia\.com|aws\.amazon\.com|aboutamazon\.com/i;
const GENERIC_HOT_BLOG_EVIDENCE_RE = /published this blog\/interview entry\.?$/i;
const OFFICIAL_TECHNICAL_BLOG_SOURCE_RE = /\b(anthropic engineering|anthropic research|google research|google deepmind|deepmind rss|hugging face blog|microsoft research|apple machine learning|openai blog|openai research|meta ai blog)\b|anthropic\.com\/(?:engineering|research)|research\.google|deepmind\.google\/blog|huggingface\.co\/blog|microsoft\.com\/en-us\/research|machinelearning\.apple\.com\/research|ai\.meta\.com\/blog|openai\.com\/(?:research|index)/i;
const HUGGING_FACE_ORG_TECHNICAL_BLOG_URL_RE = /huggingface\.co\/blog\/[a-z0-9-]*(?:research|labs?|ai|deepmind|qwen|openai|microsoft|ibm|nvidia|meta)[a-z0-9-]*\//i;
const SPECIFIC_TECHNICAL_BLOG_SURFACE_RE = /\b(agentic?|agents?|llms?|large language models?|reasoning|inference|benchmark|leaderboard|fine[-\s]?tuning|transformers?|workflow|harness|computer use|gemini|claude|gpt|qwen|deepmind|research|developer|architecture|evaluation|eval|rag|retrieval|open[-\s]?source|github|hugging face|cuga|asr|tool use|tools?|memory|context|token|tokens?|model|models?)\b|模型|推理|评测|基准|智能体|开发者|工作流|架构|研究|检索|上下文|多模态/u;
const GENERIC_TECHNICAL_BLOG_TITLE_RE = /^(?:latest|official|new)\s+ai\s+(?:platform|product|model|research|blog)\s+update\b|^ai\s+(?:platform|product|model)\s+update$/i;
const TITLE_MOJIBAKE_RE = /�|锟|喔|鈥|峄|岷|箞|鑳|€/u;
const LOW_VALUE_MAIN_RE = /amazon in the community|service,\s*community,\s*and commitment at hq2|friday night baseball|apple arcade|family feud pocket|prime video|spinoff|ari[a]?nespace launch|deploy more satellites|vought rising|here'?s what'?s happening in seattle|hq2|july.*baseball|mini football legends|the latest ai news we announced in/i;
const LOW_VALUE_AI_PR_RE = /doosan group collaborate|multiyear technology partnership|advance memory for ai factories|advance physical ai and ai factory infrastructure|build ai infrastructure to power|expands ai infrastructure with nvidia/i;
const VENDOR_MODEL_AVAILABILITY_SOURCE_RE = /\b(aws|amazon web services|amazon bedrock|bedrock|sagemaker|microsoft foundry|azure ai|github copilot|github changelog|google cloud|vertex ai|openrouter)\b|aws\.amazon\.com|devblogs\.microsoft\.com\/foundry|github\.blog\/changelog|cloud\.google\.com|openrouter\.ai/i;
const VENDOR_MODEL_AVAILABILITY_TEXT_RE = /\b(now available|available on|available in|is available|are available|availability|model access|selected regions?|standard api access|comes to|launches in|on amazon bedrock|in amazon bedrock|in microsoft foundry|in github copilot|on vertex|in vertex|on azure|in azure|on openrouter|in openrouter)\b/i;
const THIRD_PARTY_MODEL_NAME_RE = /\b(claude|anthropic|gpt-|openai|gemini|llama|qwen|mistral|deepseek|fable|mythos|frontier model|foundation model)\b/i;
const TRUSTED_PRIMARY_SOURCE_LEVELS = new Set([
  "primary",
  "official",
  "paper",
  "github",
  "multi_source",
  "official_company_news",
  "official_open_source_account",
  "official_model_host_account",
  "model_registry"
]);
const READER_RELEVANT_SOURCE_LEVELS = new Set([
  "official_company_news",
  "official_open_source_account",
  "official_model_host_account",
  "github"
]);
const MAIN_ITEM_RECENT_HISTORY_SECTIONS = [
  "main_items",
  "github_trending",
  "model_releases",
  "hot_blogs",
  "projects",
  "builder_observations"
];
const MAIN_STREAM_SOURCE_IMPACT_GROUPS = [
  "github_trending",
  "huggingface_trending",
  "builder_sources",
  "china_ai_sources",
  "content_sources",
  "search_sources",
  "wechat_sources",
  "zhihu_sources",
  "sources_health"
];
const STORY_TARGET_MIN = 1;
const STORY_TARGET = 8;
const STORY_TARGET_MAX = 12;
const MAIN_TARGET_MIN = 5;
const MAIN_TARGET = STORY_TARGET;
const MAIN_TARGET_MAX = STORY_TARGET_MAX;
const MAIN_REFILL_WINDOW_DAYS = 3;
const CANDIDATE_ROLE_VALUES = new Set([
  "main_stream_candidate",
  "github_trending",
  "hot_blog",
  "builder_signal",
  "community_signal",
  "official_update"
]);
const NON_MAIN_STREAM_AUDIT_REASONS = new Set([
  "not_evaluated_section_item",
  "retired_platform_lane"
]);
const GITHUB_TRENDING_TARGET = 20;
const GITHUB_TRENDING_LANGUAGE_SCOPES = ["python", "typescript", "rust", "go", "java"];
const HUGGINGFACE_TRENDING_TARGET = 10;
const PROJECT_TARGET = 10;
const HOT_BLOG_TARGET = 8;
const BUILDER_OBSERVATION_TARGET = 12;
const COMMUNITY_LEAD_TARGET = 6;
const COMMUNITY_PAPER_TARGET = 3;
const COMMUNITY_GITHUB_TARGET = 3;
const COMMUNITY_LOW_SIGNAL_PARTNERSHIP_TARGET = 2;
const MAX_INFRA_VENDOR_MAIN_ITEMS = 2;
const MAX_INFRA_VENDOR_HOT_BLOGS = 2;
const MAX_PUBLIC_UNITS = 80;
const PUBLIC_THIRD_PARTY_SOURCE_LEVELS = new Set([
  "intermediary",
  "community",
  "original_social",
  "wechat_industry_whitelist",
  "weekly_paper_aggregator",
  "open_source_aggregator",
  "tech_weekly_aggregator",
  "paper_aggregator",
  "ai_news_aggregator",
  "aigc_content_industry",
  "ai_funding_product_radar",
  "community_api"
]);

export async function generateReportDraft(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const reportDate = requireReportDate(options.reportDate);
  const generatedAt = options.generatedAt || new Date().toISOString();
  const inputPaths = normalizeInputPaths(options.inputPaths || options.inputs || options.input);
  const loaded = await loadDiscoveryInputsWithDegraded(rootDir, inputPaths, {
    reportDate,
    generatedAt,
    allowDegradedInputs: options.allowDegradedInputs === true
  });
  const merged = mergeDiscoveryPayloads(loaded, { reportDate, generatedAt });
  const recentMainUrlHistory = await loadRecentMainUrlHistory(rootDir, reportDate);
  const selection = selectReportItems(merged, { reportDate, recentMainUrlHistory });
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
      maxAssets: options.maxEvidenceAssets,
      candidates: candidatePool.candidates.filter((candidate) => candidate.status === "included"),
      existingEvidenceAssets: merged.evidence_assets,
      fetchImpl: options.fetchImpl
    });
  const sourceAudit = updateAuditIncludedCounts(merged.sourceAudit, selection.candidates);
  const report = buildDraftReport({
    reportDate,
    generatedAt,
    selection,
    sourceAudit,
    candidates: candidatePool.candidates,
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
  const reportWithSourceSuggestions = normalizeStoryFirstReport(
    appendSourceStatusSuggestionsToDraft(report, sourceStatusUpdate),
    { preserveExistingStories: true }
  );
  sanitizeGeneratedPublicReport(reportWithSourceSuggestions);
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
      huggingface_trending: reportWithSourceSuggestions.huggingface_trending.length,
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

const GENERATED_PUBLIC_COPY_REPLACEMENTS = [
  [/\u66f4\u65b0AI\s*\u4ea7\u54c1\u3001\u5e73\u53f0\u6216\u5de5\u7a0b\u5b9e\u8df5/gu, "\u8bf4\u660e AI \u4ea7\u54c1\u3001\u5e73\u53f0\u6216\u5de5\u7a0b\u53d8\u5316"],
  [/\u66f4\u65b0AI\s*\u4ea7\u54c1\u3001\u5e73\u53f0\u6216\u5de5\u7a0b/gu, "\u8bf4\u660e AI \u4ea7\u54c1\u3001\u5e73\u53f0\u6216\u5de5\u7a0b\u53d8\u5316"],
  [/\u66f4\u65b0\s+AI\s*\u4ea7\u54c1\u3001\u5e73\u53f0\u6216\u5de5\u7a0b/gu, "\u8bf4\u660e AI \u4ea7\u54c1\u3001\u5e73\u53f0\u6216\u5de5\u7a0b\u53d8\u5316"],
  [/\u6750\u6599\u8986\u76d6/gu, "\u5185\u5bb9\u5305\u62ec"],
  [/\u6750\u6599\u628a/gu, "\u8fd9\u6761\u4fe1\u606f\u628a"],
  [/\u5df2\u62ab\u9732\u4e8b\u5b9e\u96c6\u4e2d\u5728/gu, "\u53ef\u6838\u5bf9\u4fe1\u606f\u96c6\u4e2d\u5728"],
  [/\u5df2\u62ab\u9732\u7ec6\u8282\u8986\u76d6/gu, "\u7ec6\u8282\u5305\u62ec"],
  [/\u8fb9\u754c\u843d\u5728\u843d\u5730\u8d28\u91cf\u53d6\u51b3\u4e8e/gu, "\u5b9e\u9645\u6548\u679c\u8fd8\u8981\u770b"],
  [/\u8fb9\u754c\u843d\u5728/gu, "\u5224\u65ad\u65f6\u8fd8\u8981\u770b"],
  [/\u843d\u5730\u8d28\u91cf\u53d6\u51b3\u4e8e/gu, "\u5b9e\u9645\u6548\u679c\u53d6\u51b3\u4e8e"],
  [/\u5019\u9009\u6c60/gu, "\u5165\u9009\u7ebf\u7d22"],
  [/\u51c6\u5165\u95e8\u69db/gu, "\u5165\u9009\u6807\u51c6"],
  [/\u4fe1\u6e90\u5ba1\u8ba1/gu, "\u6765\u6e90\u6838\u5bf9"],
  [/\u4fe1\u6e90\u8986\u76d6\u4e0e\u7f3a\u53e3/gu, "\u6765\u6e90\u8986\u76d6\u72b6\u6001"],
  [/\u53d1\u5e03\u8d28\u91cf\u8bf4\u660e/gu, "\u53d1\u5e03\u72b6\u6001\u8bf4\u660e"],
  [/README \u4e3b\u8981\u56f4\u7ed5/gu, "README \u91cd\u70b9\u8bf4\u660e"],
  [/\u9605\u8bfb\u65f6\u5148\u770b/gu, "\u9605\u8bfb\u65f6\u91cd\u70b9\u770b"],
  [/\u9700\u8981\u7ed3\u5408\u4ed3\u5e93\u9875\u9762\u786e\u8ba4/gu, "\u9700\u8981\u56de\u5230\u4ed3\u5e93\u9875\u9762\u6838\u5bf9"],
  [/\u8fdb\u5165 GitHub Trending Top/gu, "\u51fa\u73b0\u5728 GitHub Trending Top"],
  [/\u4eca\u5929\u8fdb\u5165 GitHub Trending/gu, "\u4eca\u5929\u51fa\u73b0\u5728 GitHub Trending"],
  [/\u62ab\u9732/gu, "\u8bf4\u660e"]
];

const GENERATED_PUBLIC_COPY_SECTIONS = [
  "stories",
  "main_items",
  "model_releases",
  "hot_blogs",
  "chinese_media_dynamics",
  "daily_tracking",
  "projects",
  "github_trending",
  "huggingface_trending",
  "builder_observations",
  "official_org_updates",
  "community_leads"
];

function sanitizeGeneratedPublicReport(report) {
  if (!report || typeof report !== "object") {
    return report;
  }
  for (const key of ["title", "summary", "hero_summary"]) {
    if (typeof report[key] === "string") {
      report[key] = sanitizeGeneratedPublicCopy(report[key]);
    }
  }
  for (const sectionName of GENERATED_PUBLIC_COPY_SECTIONS) {
    if (Array.isArray(report[sectionName])) {
      report[sectionName] = report[sectionName].map((item) => sanitizeGeneratedPublicItem(item));
    }
  }
  return report;
}

function sanitizeGeneratedPublicItem(value) {
  if (typeof value === "string") {
    return sanitizeGeneratedPublicCopy(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeGeneratedPublicItem(item));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (isGeneratedPublicInternalKey(key)) {
      continue;
    }
    value[key] = sanitizeGeneratedPublicItem(entry);
  }
  return value;
}

function isGeneratedPublicInternalKey(key) {
  return /^(?:candidate_id|source_audit|self_check|quality_status|selection_snapshot|debug|raw|notes|status|source_id|rule_id|verification_status|verification_note|matched_terms|included_in|published_by|degraded_sections|evidence_assets)$/i.test(String(key || ""));
}

function sanitizeGeneratedPublicCopy(value) {
  let cleaned = String(value || "");
  for (const [pattern, replacement] of GENERATED_PUBLIC_COPY_REPLACEMENTS) {
    cleaned = cleaned.replace(pattern, replacement);
  }
  return cleaned;
}

function selectReportItems(merged, options = {}) {
  const reportDate = requireReportDate(options.reportDate);
  const candidates = cloneCandidates(merged.candidates);
  const metaById = merged.metaById || new Map();
  const selectedIds = new Set();
  const recentMainUrlHistory = normalizeRecentMainUrlHistory(options.recentMainUrlHistory || options.recentMainUrls);
  const derived = [];
  const includedCandidates = [...candidates];
  const githubSourceCandidates = candidates
    .map((candidate) => ({ candidate, meta: metaById.get(candidate.id) || {} }))
    .filter(({ candidate, meta }) => isGitHubTrendingCandidate(candidate, meta))
    .sort((left, right) => rankOf(left.meta, 999) - rankOf(right.meta, 999));
  const publicGithubCandidates = publicGithubTrendingCandidates(githubSourceCandidates);
  const githubTrending = publicGithubCandidates.slice(0, GITHUB_TRENDING_TARGET).map(({ candidate, meta }, index) => {
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
  const huggingFacePool = candidates
    .filter((candidate) => candidate.category === "huggingface_trending" && !selectedIds.has(candidate.id))
    .sort(compareHuggingFaceTrendingCandidates);
  const huggingFaceTrending = huggingFacePool.slice(0, HUGGINGFACE_TRENDING_TARGET).map((candidate, index) => {
    const selected = markIncludedCandidate(candidate, "huggingface_trending", "huggingface_trending");
    selectedIds.add(candidate.id);
    return huggingFaceTrendingItem(selected, index);
  });

  const mainEvaluations = evaluateMainCandidates(candidates, {
    reportDate,
    recentMainUrlHistory,
    metaById
  });
  const strictMainPool = mainEvaluations
    .filter((entry) => entry.eligible && entry.stage === "strict")
    .map((entry) => entry.candidate)
    .sort(compareMainCandidates);
  const refillMainPool = mainEvaluations
    .filter((entry) => entry.eligible && entry.stage !== "strict")
    .map((entry) => entry.candidate)
    .sort(compareMainCandidates);
  const mainPool = mainEvaluations
    .filter((entry) => entry.eligible)
    .map((entry) => entry.candidate)
    .sort(compareMainCandidates);
  const storyPool = uniqueCandidatesById([...strictMainPool, ...refillMainPool]);
  const storyClusters = pickStoryClusters(storyPool, Math.min(STORY_TARGET, STORY_TARGET_MAX));
  const mainSeeds = storyClusters.map((cluster) => cluster.primary);
  const mainSeedIds = new Set(storyClusters.flatMap((cluster) => cluster.candidates.map((candidate) => candidate.id)));
  for (const entry of mainEvaluations) {
    if (!entry.eligible || mainSeedIds.has(entry.candidate.id)) {
      continue;
    }
    entry.candidate.main_reject_reason = entry.candidate.main_reject_reason || "not_selected_lower_priority";
  }
  const mainSelectionSnapshot = mainSelectionSnapshotFor(mainEvaluations, mainSeeds, {
    sourceAudit: merged.sourceAudit
  });
  const stories = [];
  const mainItems = storyClusters.map((cluster) => {
    const candidate = cluster.primary;
    const mainCandidate = derivedCandidate(candidate, {
      idPrefix: "main",
      category: "main_item",
      includedIn: "main_items",
      existing: [...includedCandidates, ...derived]
    });
    mainCandidate.id = uniqueCandidateId([...includedCandidates, ...derived], storyIdForCluster(cluster));
    markStoryClusterAudit(cluster, mainCandidate.id);
    derived.push(mainCandidate);
    for (const sourceCandidate of cluster.candidates) {
      selectedIds.add(sourceCandidate.id);
      selectedIds.add(`project:${sourceCandidate.id}`);
    }
    const item = mainItem(mainCandidate, candidate);
    const story = storyItemFromCluster(cluster, item, mainCandidate.id);
    stories.push(story);
    return item;
  });

  const projectSeeds = publicGithubCandidates
    .map(({ candidate, meta }) => ({ candidate, meta }))
    .filter(({ candidate }) => !selectedIds.has(`project:${candidate.id}`))
    .slice(0, PROJECT_TARGET);
  const projects = projectSeeds.map(({ candidate, meta }) => {
    const projectCandidate = markIncludedCandidate(candidate, "project", "projects");
    selectedIds.add(`project:${candidate.id}`);
    return projectItem(projectCandidate, meta);
  });

  const hotBlogSeenUrls = new Set(mainItems.map((item) => normalizeUrl(item.url)).filter(Boolean));
  const hotBlogPool = candidates
    .filter((candidate) => !selectedIds.has(candidate.id))
    .filter((candidate) => isFreshForMainItems(candidate, recentMainUrlHistory))
    .filter((candidate) => canPromoteToHotBlog(candidate, reportDate))
    .sort((left, right) => candidateScore(right) - candidateScore(left));
  const chinaHotBlogFallbackPool = candidates
    .filter((candidate) => !selectedIds.has(candidate.id))
    .filter((candidate) => isFreshForMainItems(candidate, recentMainUrlHistory))
    .filter((candidate) => canFallbackToChinaAiHotBlog(candidate, reportDate))
    .sort((left, right) => candidateScore(right) - candidateScore(left));
  const hotBlogSeeds = [];
  const enforceHotBlogInfraVendorCap = shouldEnforceInfraVendorCap(hotBlogPool, HOT_BLOG_TARGET);
  let hotBlogInfraVendorCount = 0;
  for (const candidate of hotBlogPool) {
    if (hotBlogSeeds.length >= HOT_BLOG_TARGET) break;
    const key = normalizeUrl(candidate.url);
    if (!key || hotBlogSeenUrls.has(key)) continue;
    if (isOverrepresentedInfraVendorCandidate(candidate)) {
      if (enforceHotBlogInfraVendorCap && hotBlogInfraVendorCount >= MAX_INFRA_VENDOR_HOT_BLOGS) continue;
    }
    hotBlogSeenUrls.add(key);
    hotBlogSeeds.push(candidate);
    if (isOverrepresentedInfraVendorCandidate(candidate)) {
      hotBlogInfraVendorCount += 1;
    }
  }
  ensureChineseHotBlogSeed(hotBlogSeeds, [...hotBlogPool, ...chinaHotBlogFallbackPool], hotBlogSeenUrls);
  const hotBlogDrafts = hotBlogSeeds.map((candidate) => ({
    candidate,
    item: hotBlogItem(candidate)
  }));
  const hotBlogPrune = pruneHotBlogDrafts(hotBlogDrafts);
  const hotBlogs = hotBlogPrune.items.map(({ candidate }) => {
    const hotCandidate = markIncludedCandidate(candidate, "hot_blog", "hot_blogs");
    selectedIds.add(candidate.id);
    return hotBlogItem(hotCandidate);
  });
  const chineseMediaDynamics = selectChineseMediaDynamics(candidates, {
    reportDate,
    sourceAudit: merged.sourceAudit
  });

  const builderSeeds = candidates
    .filter((candidate) => candidate.category === "builder_observation" && !selectedIds.has(candidate.id))
    .filter((candidate) => canPromoteToBuilderObservation(candidate))
    .sort((left, right) => {
      const curatedDelta = (right.curated_first_party === true ? 1 : 0) - (left.curated_first_party === true ? 1 : 0);
      if (curatedDelta !== 0) return curatedDelta;
      return candidateScore(right) - candidateScore(left);
    })
    .slice(0, BUILDER_OBSERVATION_TARGET);
  const builderObservations = builderSeeds.map((candidate) => {
    const builderCandidate = markIncludedCandidate(candidate, "builder_observation", "builder_observations");
    selectedIds.add(candidate.id);
    return builderObservationItem(builderCandidate);
  });
  const officialOrgUpdates = selectOfficialOrgUpdates(candidates, { reportDate });

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
    if (communitySeeds.length >= COMMUNITY_LEAD_TARGET) break;
    const sourceLevel = sourceLevelForCandidate(candidate);
    if (isLowSignalVendorPartnership(candidate)) {
      if (communityLowSignalPartnerships >= COMMUNITY_LOW_SIGNAL_PARTNERSHIP_TARGET) continue;
      communityLowSignalPartnerships += 1;
    }
    if ((sourceLevel === "paper" || sourceLevel === "paper_api") && communityPaperCount >= COMMUNITY_PAPER_TARGET) continue;
    if (sourceLevel === "github" && communityGithubCount >= COMMUNITY_GITHUB_TARGET) continue;
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
    candidates: finalizeMainAudit([...includedCandidates, ...derived]),
    stories,
    main_items: mainItems,
    github_trending: githubTrending,
    huggingface_trending: huggingFaceTrending,
    hot_blogs: hotBlogs,
    chinese_media_dynamics: chineseMediaDynamics.items,
    chinese_media_source_statuses: chineseMediaDynamics.source_statuses,
    projects,
    builder_observations: builderObservations,
    official_org_updates: officialOrgUpdates,
    community_leads: communityLeads,
    eligible_counts: {
      main_items: mainPool.length,
      github_trending: publicGithubCandidates.length,
      huggingface_trending: huggingFacePool.length,
      hot_blogs: hotBlogPool.length,
      chinese_media_dynamics: chineseMediaDynamics.items.length,
      projects: projectSeeds.length,
      builder_observations: candidates.filter((candidate) => candidate.category === "builder_observation" && canPromoteToBuilderObservation(candidate)).length,
      official_org_updates: officialOrgUpdates.length
    },
    selection_snapshot: {
      main_items: mainSelectionSnapshot,
      stories: storySelectionSnapshotFor(mainEvaluations, storyClusters),
      hot_blogs: {
        eligible_candidates: hotBlogPool.length,
        target: HOT_BLOG_TARGET,
        selected_before_prune: hotBlogDrafts.length,
        selected: hotBlogs.length,
        pruned: hotBlogPrune.pruned,
        prune_reasons: hotBlogPrune.prune_reasons
      }
    }
  };
}

function pruneHotBlogDrafts(entries) {
  const kept = [];
  const seenTitles = new Set();
  const pruneReasons = {};
  for (const entry of entries) {
    const titleKey = publicHotBlogTitleKey(entry.item?.title);
    let reason = "";
    if (titleKey && seenTitles.has(titleKey)) {
      reason = "duplicate_title";
    } else if (isRepeatedTemplateHotBlogCopy(entry.item)) {
      reason = "template_or_low_information";
    }
    if (reason) {
      pruneReasons[reason] = (pruneReasons[reason] || 0) + 1;
      continue;
    }
    if (titleKey) {
      seenTitles.add(titleKey);
    }
    kept.push(entry);
  }
  return {
    items: kept,
    pruned: entries.length - kept.length,
    prune_reasons: pruneReasons
  };
}

function publicHotBlogTitleKey(value) {
  return String(value || "")
    .replace(/\*\*/g, "")
    .replace(/[：:，,。；;、|｜\s]+/g, "")
    .trim()
    .toLowerCase();
}

function isRepeatedTemplateHotBlogCopy(item) {
  const text = [
    item?.summary,
    ...(Array.isArray(item?.key_points) ? item.key_points : [])
  ].join(" ");
  const phrases = [
    "这类文章最有用的地方",
    "文章真正有用的部分",
    "真正的信息密度在真实场景",
    "真正有价值的是作者给出的证据",
    "原文把价值落在代码",
    "它能帮助读者更新对模型能力的预期",
    "能帮团队判断它该不该进入试点"
  ];
  const hits = phrases.filter((phrase) => text.includes(phrase)).length;
  return hits >= 2;
}

function normalizeCandidateRoles(roles) {
  if (!Array.isArray(roles)) return [];
  return uniqueValues(
    roles
      .map((role) => String(role || "").trim())
      .filter((role) => CANDIDATE_ROLE_VALUES.has(role))
  );
}

function shouldMarkMainStreamCandidateRole(candidate) {
  if (candidate.included_in === "main_items" || candidate.category === "main_item") return true;
  if (candidate.main_selection_stage) return true;
  const rejectReason = String(candidate.main_reject_reason || "").trim();
  return Boolean(rejectReason && !NON_MAIN_STREAM_AUDIT_REASONS.has(rejectReason));
}

function candidateAuditRoles(candidate) {
  const roles = normalizeCandidateRoles(candidate.roles);
  const category = candidate.category;
  const includedIn = candidate.included_in;
  const explicitSourceLevel = String(candidate.source_level || "").trim();
  const sourceLevel = sourceLevelForCandidate(candidate);
  const sourceLevels = new Set([sourceLevel, explicitSourceLevel].filter(Boolean));
  const sourceText = `${candidate.source_id || ""} ${candidate.source || ""} ${candidate.url || ""}`;

  if (shouldMarkMainStreamCandidateRole(candidate)) roles.push("main_stream_candidate");
  if (category === "github_trending" || includedIn === "github_trending" || sourceLevels.has("github") || /github trending/i.test(sourceText)) {
    roles.push("github_trending");
  }
  if (category === "hot_blog" || includedIn === "hot_blogs") {
    roles.push("hot_blog");
  }
  if (category === "builder_observation" || includedIn === "builder_observations") {
    roles.push("builder_signal");
  }
  if (includedIn === "community_leads" || sourceLevels.has("community") || sourceLevels.has("community_api")) {
    roles.push("community_signal");
  }
  if (
    category === "model_release" ||
    includedIn === "model_releases" ||
    sourceLevels.has("official") ||
    sourceLevels.has("official_company_news") ||
    sourceLevels.has("official_open_source_account") ||
    sourceLevels.has("official_model_host_account")
  ) {
    roles.push("official_update");
  }

  return normalizeCandidateRoles(roles);
}

function applyCandidateAuditRoles(candidate) {
  const roles = candidateAuditRoles(candidate);
  if (roles.length > 0) {
    candidate.roles = roles;
  } else {
    delete candidate.roles;
  }
}

function finalizeMainAudit(candidates) {
  for (const candidate of candidates) {
    if (isPlatformExemptCategory(candidate.category)) {
      candidate.status = "excluded";
      delete candidate.included_in;
      candidate.main_reject_reason = candidate.main_reject_reason || "retired_platform_lane";
      applyCandidateAuditRoles(candidate);
      continue;
    }
    if (candidate.main_selection_stage || candidate.main_reject_reason) {
      applyCandidateAuditRoles(candidate);
      continue;
    }
    candidate.main_reject_reason = candidate.included_in === "main_items"
      ? "selected_main_item"
      : "not_evaluated_section_item";
    applyCandidateAuditRoles(candidate);
  }
  return candidates;
}

async function loadRecentMainUrlHistory(rootDir, reportDate, lookbackDays = 7) {
  const urls = new Map();
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
    for (const sectionName of MAIN_ITEM_RECENT_HISTORY_SECTIONS) {
      for (const [index, item] of (Array.isArray(parsed?.[sectionName]) ? parsed[sectionName] : []).entries()) {
        const key = normalizeUrl(item?.url);
        if (key && !urls.has(key)) {
          urls.set(key, `${parsed?.report_date || dateString}:${sectionName}[${index}]`);
        }
        const storyKey = recentStoryHistoryKey(item);
        if (storyKey && !urls.has(storyKey)) {
          urls.set(storyKey, `${parsed?.report_date || dateString}:${sectionName}[${index}]`);
        }
      }
    }
    for (const [index, story] of (Array.isArray(parsed?.stories) ? parsed.stories : []).entries()) {
      const storyKey = recentStoryHistoryKey(story);
      if (storyKey && !urls.has(storyKey)) {
        urls.set(storyKey, `${parsed?.report_date || dateString}:stories[${index}]`);
      }
      for (const source of Array.isArray(story?.sources) ? story.sources : []) {
        const key = normalizeUrl(source?.url);
        if (key && !urls.has(key)) {
          urls.set(key, `${parsed?.report_date || dateString}:stories[${index}].sources`);
        }
      }
    }
  }
  return urls;
}

function normalizeRecentMainUrlHistory(value) {
  if (value instanceof Map) {
    return value;
  }
  if (value instanceof Set) {
    return new Map([...value].map((url) => [url, "recent_history"]));
  }
  return new Map();
}

function isFreshForMainItems(candidate, recentMainUrlHistory) {
  if (hasMaterialStoryUpdate(candidate)) {
    return true;
  }
  const keys = recentCandidateHistoryKeys(candidate);
  for (const key of keys) {
    const previous = recentMainUrlHistory.get(key);
    if (previous) {
      candidate.exclusion_reason = `recent_duplicate_main_item:${previous}`;
      return false;
    }
  }
  return true;
}

function recentCandidateHistoryKeys(candidate) {
  return uniqueValues([
    normalizeUrl(candidate?.url),
    storyHistoryKey(explicitStoryKey(candidate))
  ].filter(Boolean));
}

function recentStoryHistoryKey(item) {
  return storyHistoryKey(
    item?.claim_fingerprint ||
    item?.story_key ||
    item?.story_id ||
    item?.candidate_id ||
    item?.source_item_ref
  );
}

function storyHistoryKey(value) {
  const key = String(value || "").trim();
  return key ? `story:${slugId(key.replace(/^story-/i, ""))}` : "";
}

function hasMaterialStoryUpdate(candidate) {
  if (candidate?.material_update === true || candidate?.material_new_progress === true) {
    return true;
  }
  return /\b(material_update|new_progress|material_new_progress)\s*=\s*true\b/i.test(String(candidate?.notes || ""));
}

function mergeEvidenceAssets(...groups) {
  const merged = [];
  const seen = new Set();
  for (const group of groups) {
    for (const asset of Array.isArray(group) ? group : []) {
      if (!asset || typeof asset !== "object") {
        continue;
      }
      if (!isPublicEvidenceAssetAllowed(asset)) {
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

function isPublicEvidenceAssetAllowed(asset) {
  const text = [
    asset.title,
    asset.caption,
    asset.local_path,
    asset.source_url,
    asset.capture_kind,
    asset.extraction_status,
    asset.asset_role
  ].map((value) => String(value || "").toLowerCase()).join(" ");
  if (String(asset.type || "").toLowerCase() === "table") {
    return true;
  }
  if (/整页截图|浏览器截图|页面截图|full[-_ ]?page|viewport|browser|screenshot/.test(text)) {
    return false;
  }
  if (/(^|\b)(icon|favicon|logo|avatar|badge)(\b|$)/.test(text)) {
    return false;
  }
  const width = Number(asset.width || asset.image_width || 0);
  const height = Number(asset.height || asset.image_height || 0);
  if (width > 0 && height > 0 && (width < 320 || height < 180)) {
    return false;
  }
  if (!isMeaningfulPublicEvidenceAsset(asset)) {
    return false;
  }
  if (/openrouter|artificial analysis|artificialanalysis|rankings|leaderboard|排行榜|榜单/.test(text) && !/(source_asset|source_image|semantic|chart|diagram)/.test(text)) {
    return false;
  }
  return true;
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
  const seenTopics = new Set();
  const enforceInfraVendorCap = shouldEnforceInfraVendorCap(candidates, target);
  let infraVendorCount = 0;
  let lowSignalPartnershipCount = 0;
  const plainReaderCandidates = candidates.filter((candidate) => hasPlainReaderSignal(candidate));
  const hardcoreLimit = plainReaderCandidates.length >= target - 2 ? 2 : target;
  let hardcorePicked = 0;
  for (const candidate of candidates) {
    if (picked.length >= target) break;
    const key = normalizeUrl(candidate.url);
    if (!key || seenUrls.has(key)) continue;
    const topicKey = mainTopicKey(candidate);
    if (topicKey && seenTopics.has(topicKey)) continue;
    if (isOverrepresentedInfraVendorCandidate(candidate)) {
      if (enforceInfraVendorCap && infraVendorCount >= MAX_INFRA_VENDOR_MAIN_ITEMS) continue;
    }
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
    if (isOverrepresentedInfraVendorCandidate(candidate)) {
      infraVendorCount += 1;
    }
    if (topicKey) {
      seenTopics.add(topicKey);
    }
  }
  return picked;
}

function compareHuggingFaceTrendingCandidates(left, right) {
  const leftRank = Number.isInteger(Number(left.rank)) ? Number(left.rank) : 999;
  const rightRank = Number.isInteger(Number(right.rank)) ? Number(right.rank) : 999;
  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }
  return candidateScore(right) - candidateScore(left);
}

function ensureChineseHotBlogSeed(hotBlogSeeds, hotBlogPool, seenUrls) {
  if (hotBlogSeeds.some(isChineseHotBlogCandidate)) {
    return;
  }
  const candidate = hotBlogPool.find((item) => {
    const key = normalizeUrl(item.url);
    return isChineseHotBlogCandidate(item) && key && !seenUrls.has(key);
  });
  if (!candidate) {
    return;
  }
  const key = normalizeUrl(candidate.url);
  if (hotBlogSeeds.length < HOT_BLOG_TARGET) {
    hotBlogSeeds.push(candidate);
  } else {
    const replaceIndex = hotBlogSeeds.findIndex((item) => !isStrategicCoreOfficialCandidate(item) && !isChineseHotBlogCandidate(item));
    hotBlogSeeds[replaceIndex >= 0 ? replaceIndex : hotBlogSeeds.length - 1] = candidate;
  }
  if (key) {
    seenUrls.add(key);
  }
}

function isChineseHotBlogCandidate(candidate) {
  const text = candidateText(candidate);
  if (/[\u4e00-\u9fff]/u.test(text)) {
    return true;
  }
  return /\b(?:qwen|alibaba|alibabacloud|aliyun|tencent|hunyuan|deepseek|zhipu|glm|kimi|moonshot|minimax|bytedance|baidu|qbitai|jiqizhixin|36kr|infoq\.cn)\b|(?:qwen\.ai|alibabagroup\.com|alibabacloud\.com|tencent\.com|hunyuan\.tencent\.com|deepseek\.com|zhipuai\.cn|kimi\.com|minimax\.io|bytedance\.com|baidu\.com|qbitai\.com|jiqizhixin\.com|36kr\.com|infoq\.cn)/i.test(text);
}

function isChinaAiSourceLaneCandidate(candidate) {
  return /^china-ai-/i.test(String(candidate?.source_id || "")) ||
    /china_ai_sources/i.test(String(candidate?.source_category || candidate?.audit_group || ""));
}

function isChinaAiCandidate(candidate) {
  return /\b(?:china-ai|qwen|alibaba|alibabacloud|aliyun|tencent|hunyuan|deepseek|zhipu|glm|kimi|moonshot|minimax|bytedance|baidu)\b|(?:qwen\.ai|alibabagroup\.com|alibabacloud\.com|tencent\.com|hunyuan\.tencent\.com|deepseek\.com|zhipuai\.cn|kimi\.com|minimax\.io|bytedance\.com|baidu\.com)/i.test(candidateText(candidate));
}

function shouldEnforceInfraVendorCap(candidates, target) {
  const strategicCoreCount = candidates.filter((candidate) => isStrategicCoreOfficialCandidate(candidate)).length;
  const nonInfraCount = candidates.filter((candidate) => !isOverrepresentedInfraVendorCandidate(candidate)).length;
  return strategicCoreCount >= 3 || nonInfraCount >= Math.max(3, target - 2);
}

function mainTopicKey(candidate) {
  return modelLaunchTopicKey(candidate) || "";
}

function modelLaunchTopicKey(candidate) {
  const text = candidateText(candidate).toLowerCase();
  if (/\b(?:claude\s*)?(?:fable|mythos)\s*5\b/.test(text)) {
    return "model:claude-fable-5-mythos-5";
  }
  const namedModel = text.match(/\b(?:claude\s+(?:opus|sonnet|haiku)\s*\d(?:\.\d+)?|gpt-\d(?:\.\d+)?(?:-[a-z0-9]+)?|gemini\s+\d(?:\.\d+)?\s*(?:pro|flash|ultra)?|grok\s+\d(?:\.\d+)?|qwen\s*\d(?:\.\d+)?|deepseek\s+[a-z0-9.-]+|mistral\s+[a-z0-9.-]+)\b/i);
  if (!namedModel) {
    return "";
  }
  const releaseLike = /\b(model|launch|release|released|available|availability|rollout|preview|api|sdk|bedrock|copilot|foundry|vertex|azure|aws)\b/i.test(text);
  return releaseLike ? `model:${namedModel[0].replace(/\s+/g, "-").toLowerCase()}` : "";
}

function buildDraftReport({ reportDate, generatedAt, selection, sourceAudit, candidates = [], evidenceAssets }) {
  const aigcCount = selection.main_items.filter((item) => item.editorial_category === "content_aigc").length +
    selection.community_leads.filter((item) => item.editorial_category === "content_aigc").length;
  const report = {
    schema_version: 1,
    report_date: reportDate,
    title: `AI 日报 ${reportDate}`,
    summary: summaryForSelection(selection, aigcCount),
    source_window: {
      date_from: shiftDateOnly(reportDate, -2),
      date_to: reportDate,
      fallback_window_used: true,
      notes: "report:draft uses a 72-hour candidate window; main_items admission is blacklist-based, while source authority affects ranking and high-risk fact handling."
    },
    hero_highlights: selectHeroHighlights(selection),
    source_audit: sourceAudit,
    source_effectiveness: buildSourceEffectivenessTable({ report: { source_audit: sourceAudit }, candidates }),
    stories: selection.stories || [],
    main_items: selection.main_items,
    github_trending: selection.github_trending,
    huggingface_trending: selection.huggingface_trending,
    model_releases: [],
    hot_blogs: selection.hot_blogs,
    chinese_media_dynamics: selection.chinese_media_dynamics || [],
    daily_tracking: dailyTrackingItems(reportDate, sourceAudit),
    projects: selection.projects,
    builder_observations: selection.builder_observations,
    official_org_updates: selection.official_org_updates || [],
    community_leads: selection.community_leads,
    evidence_assets: evidenceAssets,
    self_check: {
      report_date: reportDate,
      stories: (selection.stories || []).length,
      main_items: selection.main_items.length,
      builder_observations: selection.builder_observations.length,
      builder_skill_used: ["candidate-pool-autodraft"],
      selection_snapshot: {
        main_items: selection.selection_snapshot?.main_items || {
          eligible_candidates: selection.eligible_counts?.main_items || 0,
          selected: selection.main_items.length,
          target_min: MAIN_TARGET_MIN,
          target: MAIN_TARGET,
          target_max: MAIN_TARGET_MAX,
          shortfall: selection.main_items.length < MAIN_TARGET_MIN,
          rejection_counts: {}
        },
        stories: selection.selection_snapshot?.stories || {
          eligible_candidates: selection.eligible_counts?.main_items || 0,
          selected: (selection.stories || []).length,
          target_min: STORY_TARGET_MIN,
          target: STORY_TARGET,
          target_max: STORY_TARGET_MAX,
          shortfall: (selection.stories || []).length < STORY_TARGET,
          rejection_counts: {}
        },
        github_trending: {
          eligible_candidates: selection.eligible_counts?.github_trending || 0,
          selected: selection.github_trending.length
        },
        huggingface_trending: {
          eligible_candidates: selection.eligible_counts?.huggingface_trending || 0,
          selected: selection.huggingface_trending.length
        },
        hot_blogs: {
          ...(selection.selection_snapshot?.hot_blogs || {
            eligible_candidates: selection.eligible_counts?.hot_blogs || 0,
            selected: selection.hot_blogs.length
          })
        },
        chinese_media_dynamics: {
          eligible_candidates: selection.eligible_counts?.chinese_media_dynamics || 0,
          selected: (selection.chinese_media_dynamics || []).length
        },
        projects: {
          eligible_candidates: selection.eligible_counts?.projects || 0,
          selected: selection.projects.length
        },
        builder_observations: {
          eligible_candidates: selection.eligible_counts?.builder_observations || 0,
          eligible_after_filter: selection.eligible_counts?.builder_observations || 0,
          selected: selection.builder_observations.length
        },
        official_org_updates: {
          eligible_candidates: selection.eligible_counts?.official_org_updates || 0,
          selected: (selection.official_org_updates || []).length
        }
      },
      fallback_sources: [],
      primary_links: selection.main_items.every((item) => PRIMARY_STATUSES.has(item.verification_status)),
      no_banned_words: true,
      no_unsourced_numbers: true,
      notes: "Automatic selection completed with blacklist admission; high-risk non-primary facts remain excluded, while low-risk refill candidates can enter main_items.",
      optimization_suggestions: []
    },
    generated_at: generatedAt
  };
  normalizeAutodraftPublicText(report);
  return report;
}

function selectHeroHighlights(selectionOrMainItems = []) {
  const eligible = heroHighlightSourceItems(selectionOrMainItems).filter((item) => heroItemTitle(item) && item?.url);
  if (eligible.length === 0) {
    return [];
  }

  const picked = [];
  const seenUrls = new Set();
  const seenEntities = new Set();
  const lanes = [
    "model_platform",
    "product_tool",
    "china_open_source_community",
    "business_policy",
    "research_safety"
  ];
  for (const lane of lanes) {
    const match = eligible.find((item) =>
      heroHighlightCategory(item) === lane &&
      canPickHeroHighlight(item, { seenUrls, seenEntities })
    );
    if (match) {
      picked.push(match);
      rememberHeroHighlight(match, { seenUrls, seenEntities });
    }
    if (picked.length >= 3) {
      break;
    }
  }

  for (const item of eligible) {
    if (picked.length >= 3) {
      break;
    }
    if (!canPickHeroHighlight(item, { seenUrls, seenEntities })) {
      continue;
    }
    picked.push(item);
    rememberHeroHighlight(item, { seenUrls, seenEntities });
  }

  for (const item of eligible) {
    if (picked.length >= 3) {
      break;
    }
    const key = normalizeUrl(item.url);
    if (!key || seenUrls.has(key)) {
      continue;
    }
    picked.push(item);
    seenUrls.add(key);
  }

  return picked.slice(0, 3).map(heroHighlightForItem);
}

function heroHighlightSourceItems(selectionOrMainItems = []) {
  if (Array.isArray(selectionOrMainItems)) {
    return selectionOrMainItems;
  }
  const selection = selectionOrMainItems && typeof selectionOrMainItems === "object" ? selectionOrMainItems : {};
  return [
    ...(Array.isArray(selection.main_items) ? selection.main_items : []),
    ...(Array.isArray(selection.hot_blogs) ? selection.hot_blogs : []),
    ...(Array.isArray(selection.official_org_updates) ? selection.official_org_updates : [])
  ];
}

function canPickHeroHighlight(item, state) {
  const key = normalizeUrl(item?.url);
  if (!key || state.seenUrls.has(key)) {
    return false;
  }
  const entity = heroEntityKey(item);
  return !entity || !state.seenEntities.has(entity);
}

function rememberHeroHighlight(item, state) {
  const key = normalizeUrl(item?.url);
  if (key) {
    state.seenUrls.add(key);
  }
  const entity = heroEntityKey(item);
  if (entity) {
    state.seenEntities.add(entity);
  }
}

function heroHighlightForItem(item) {
  const whatHappened = heroWhatHappened(item);
  const whyWatch = heroWhyWatch(item);
  return {
    title: heroItemTitle(item),
    url: item.url,
    reason: whyWatch,
    what_happened: whatHappened,
    why_watch: whyWatch,
    category: heroHighlightCategory(item),
    source_item_ref: item.candidate_id || normalizeUrl(item.url) || item.url
  };
}

function heroWhatHappened(item) {
  return trimText(firstUsefulPublicFact(item) || heroItemTitle(item), 150);
}

function heroWhyWatch(item) {
  const explicit = stripDraftPublicBodyNoise(item?.why_it_matters || item?.reader_relevance || "", item);
  if (explicit && !isGenericHeroWhyText(explicit)) {
    return trimText(stripSentenceEnding(explicit), 150);
  }
  const facts = mainItemPublicFactsForHero(item);
  const impact = facts.find((fact) => /impact|影响|判断|优先级|adopt|choice|decision|workflow|cost|risk|上线|采购|试用/i.test(fact));
  if (impact && !isGenericHeroWhyText(impact)) {
    return trimText(stripSentenceEnding(impact), 150);
  }
  return trimText(stripSentenceEnding(firstUsefulPublicFact(item) || heroItemTitle(item) || heroFallbackWhyWatch(item)), 150);
}

function isGenericHeroWhyText(value) {
  return /它会影响|它提示|可用它判断|看是否|重点看|判断是否需要|接入优先级|可采购|可试用/u.test(String(value || ""));
}

function firstUsefulPublicFact(item) {
  return mainItemPublicFactsForHero(item)[0] || "";
}

function mainItemPublicFactsForHero(item) {
  return [
    item?.summary,
    item?.description,
    item?.content,
    ...(Array.isArray(item?.bullets) ? item.bullets : [])
  ]
    .map((value) => stripDraftPublicBodyNoise(value, item))
    .map(stripMarkdownEmphasis)
    .map(stripSentenceEnding)
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => !isTemplateHeroText(value));
}

function stripMarkdownEmphasis(value) {
  return String(value || "")
    .replace(/==(?:[^|=\n]+\|)?([^=\n]+)==/g, "$1")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function heroFallbackWhyWatch(item) {
  const category = heroHighlightCategory(item);
  if (category === "model_platform") {
    return "它会影响模型、平台入口或能力边界的判断";
  }
  if (category === "product_tool") {
    return "它会影响工具试用、团队采购或工作流替换的优先级";
  }
  if (category === "china_open_source_community") {
    return "它补足国内、开源或社区侧信号，避免首屏只看海外大厂";
  }
  if (category === "business_policy") {
    return "它会影响业务投入、监管约束或市场节奏判断";
  }
  return "它会影响安全、研究或能力边界的后续跟踪";
}

function heroHighlightCategory(item) {
  const category = String(item?.editorial_category || "").trim();
  const sourceLevel = String(item?.source_level || "").trim();
  const text = candidateText(item);
  if (category === "open_source" || sourceLevel === "github" || isGitHubPublicItem(item) || isChinaAiCandidate(item)) {
    return "china_open_source_community";
  }
  if (category === "product_radar" || category === "engineering_toolchain" || category === "content_aigc" || /tool|workflow|developer|coding|gateway|agent|product|app|api|sdk/i.test(text)) {
    return "product_tool";
  }
  if (category === "company_business" || category === "policy_infra" || category === "funding" || /policy|regulation|governance|earnings|revenue|partnership|pricing/i.test(text)) {
    return "business_policy";
  }
  if (category === "viewpoint_analysis" || /research|paper|safety|security|benchmark|eval|risk/i.test(text)) {
    return "research_safety";
  }
  return "model_platform";
}

function heroItemTitle(item) {
  return String(item?.title || item?.name || item?.repo || item?.organization || "").trim();
}

function isGitHubPublicItem(item) {
  return /github/i.test(String(item?.source || "")) || /^https:\/\/github\.com\//i.test(String(item?.url || ""));
}

function heroEntityKey(item) {
  const entities = Array.isArray(item?.entities) ? item.entities : [];
  const entity = entities.find(Boolean) || item?.source || "";
  return String(entity || "")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/gu, " ")
    .trim();
}

function isTemplateHeroText(value) {
  return /发布了一条\s*AI\s*相关更新|原文标题为|published an ai related update|original title/i.test(String(value || ""));
}

function normalizeAutodraftPublicText(report) {
  report.source_window.notes = "覆盖 72 小时固定信源候选；主体采用黑名单准入，来源权威性用于排序，高风险事实仍要求更强核验。";
  report.self_check.notes = "主体选择已在生成期完成黑名单过滤、优先级排序、补位和短缺记录。";
  for (const item of report.hero_highlights || []) {
    item.reason = stripDraftPublicBodyNoise(item.reason, item);
    item.what_happened = stripDraftPublicBodyNoise(item.what_happened, item);
    item.why_watch = stripDraftPublicBodyNoise(item.why_watch, item);
  }
  for (const item of report.main_items || []) {
    item.summary = stripDraftPublicBodyNoise(item.summary, item);
    item.bullets = (item.bullets || []).map((bullet) => stripDraftPublicBodyNoise(bullet, item));
  }
  for (const item of report.hot_blogs || []) {
    item.summary = stripDraftPublicBodyNoise(item.summary, item);
    delete item.key_points;
  }
  for (const item of report.github_trending || []) {
    const description = stripDraftPublicBodyNoise(item.description, item);
    if (description) {
      item.description = description;
    } else {
      delete item.description;
    }
  }
  for (const item of report.community_leads || []) {
    item.content = stripDraftPublicBodyNoise(item.content, item);
  }
  for (const item of report.chinese_media_dynamics || []) {
    item.summary = stripDraftPublicBodyNoise(item.summary, item);
  }
  for (const item of report.official_org_updates || []) {
    item.summary = stripDraftPublicBodyNoise(item.summary, item);
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
    .replace(/\s*[A-Za-z][A-Za-z0-9 .&/_'()-]{1,80}\s+published this intermediary lead entry\.?/gi, "")
    .replace(/\s*published this intermediary lead entry\.?/gi, "")
    .replace(/\s*This is an intermediary\/self-media lead; trace it to a primary source before[^。.;\n]*(?:[。.;]|$)/gi, "")
    .replace(/\s*This is an intermediary\/self-media le(?:ad[^。.;\n]*)?/gi, "")
    .replace(/\bintermediary_url=\S+/gi, "")
    .replace(/\bsource_report_url=\S+/gi, "")
    .replace(/\bprimary_url=\S+/gi, "")
    .replace(/\bprimary_verification_required\s*=\s*true\b/gi, "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/^\s*作者\s*[|｜]\s*[^。；;\n]{1,40}\s+编辑\s*[|｜]\s*[^。；;\n]{1,40}\s*/u, "")
    .replace(/^[（(]英文[)）][。.]?\s*/u, "")
    .replace(/^[（(]中文[)）][。.]?\s*/u, "")
    .replace(/\s*待确认\s*[:：]\s*[^。；;\n]*(?:[。；;]|$)/g, "")
    .replace(/\s*边界\s*[:：]\s*[^。；;\n]*(?:[。；;]|$)/g, "")
    .replace(/\s*事实性结论[^。；;\n]*(?:一手来源|多源确认|原始链接|主体)[^。；;\n]*(?:[。；;]|$)/g, "")
    .replace(/\s*事实来自可回看的原始链接[^。；;\n]*(?:[。；;]|$)/g, "")
    .replace(/\s*不得仅凭该线索写入主体[^。；;\n]*(?:[。；;]|$)/g, "")
    .replace(/。?\s*可先关注适用对象、落地边界和后续变化[。]?/g, "")
    .replace(/这条动态主要围绕/g, "")
    .replace(/；\s*目前最需要补看的信息是/g, "，公开信息主要涉及")
    .replace(/[，,]?\s*(?:不进入|未进入)\s*AI\s*主体事实[。；;]?/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  text = stripLeadingChinesePolicyBoilerplate(text);
  text = rewritePublicStockPhrases(text);
  text = stripDraftSourcePrefixes(text, item);
  return text.trim();
}

function stripLeadingChinesePolicyBoilerplate(value) {
  let text = String(value || "").trim();
  for (let index = 0; index < 4; index += 1) {
    const match = text.match(/^([^。！？!?]{8,240}[。！？!?])\s*/u);
    if (!match || !isChinesePolicyBoilerplateSentence(match[1])) {
      break;
    }
    text = text.slice(match[0].length).trimStart();
  }
  return text
    .replace(/^在这一(?:战略|政策|产业|行业)?背景下[，,]\s*/u, "")
    .trim();
}

function isChinesePolicyBoilerplateSentence(sentence) {
  return /人工智能作为|新质生产力|国家战略|人工智能\+|千行百业|深度融合|核心引擎|产业落地门槛|开放共享的国产AI生态/u.test(
    String(sentence || "")
  );
}

function rewritePublicStockPhrases(value) {
  return String(value || "")
    .replace(/打开[“"]?([^”"\n。；;]{0,30})[”"]?协作想象空间/g, "提供$1协作观察样本")
    .replace(/打开了?[^。；;\n]{0,48}想象空间/g, "提供了可继续观察的落地样本")
    .replace(/想象空间/g, "落地样本")
    .replace(/赛道/g, "方向")
    .replace(/\s{2,}/g, " ")
    .trim();
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
  const specificBullets = mainItemSpecificBullets(candidate);
  const evidenceDetail = stripSentenceEnding(stripDraftPublicBodyNoise(mainItemEvidenceDetail(candidate), candidate));
  const label = readerLabelForCandidate(candidate) || compactMainItemLabel(candidate);
  if (evidenceDetail) {
    specificBullets.push(`**${label}**：${evidenceDetail}。`);
  }
  const detail = stripSentenceEnding(stripDraftPublicBodyNoise(mainItemDetail(candidate, category), candidate));
  if (detail) {
    specificBullets.push(`**${label}**：${detail}。`);
  }
  const bullets = uniqueEditorialSentences([
    ...specificBullets,
    mainItemScopeBullet(candidate, category),
    mainItemDecisionBullet(candidate, category),
    mainItemFactBullet(candidate, original)
  ]);
  if (bullets.length >= 2) {
    return bullets.slice(0, 3);
  }
  const fallback = stripSentenceEnding(stripDraftPublicBodyNoise(audienceRelevanceForCandidate(candidate, category), candidate));
  return uniqueEditorialSentences([
    ...bullets,
    fallback ? `${fallback}。` : ""
  ]).slice(0, 3);
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
  if (/unlocking ai flexibility in europe|cross-region inference.*eu data processing|eu data processing.*model access/.test(text)) return "AWS 跨区域推理";
  if (/ip allow list coverage.*emu namespaces|emu namespaces.*ip allow list|ip allow list.*general availability/.test(text)) return "GitHub IP 白名单";
  if (/economic research exchange/.test(text)) return "OpenAI 经济研究";
  if (/train models faster with jax and maxtext|nvfp4.*blackwell|blackwell.*nvfp4/.test(text)) return "Blackwell 低精度训练";
  if (/next-generation of apple intelligence|siri ai|more capable and personal assistant/.test(text)) return "苹果 Siri AI";
  if (/aids app development.*intelligence frameworks|new intelligence frameworks.*advanced tools/.test(text)) return "苹果开发框架";
  if (/apple intelligence brings powerful ai capabilities|powerful ai capabilities into everyday experiences/.test(text)) return "苹果系统 AI";
  if (/third generation of apple.*foundation models|introducing the third generation of apple/.test(text)) return "苹果基础模型";
  if (/rocketmq.*litetopic/.test(text)) return "RocketMQ LiteTopic";
  if (/agentscope java 2\.0/.test(text)) return "AgentScope Java 2.0";
  if (/tokenmaxxing|ontology-based dependency/.test(text)) return "Token 成本优化";
  if (/whatsapp.*spyware|spyware.*whatsapp|nso/.test(text)) return "WhatsApp 反间谍";
  if (/sovereign ai|london tech week|ai maker, not an ai taker/.test(text)) return "英国主权 AI";
  if (/sk telecom.*ai cloud|gigawatt-scale ai cloud/.test(text)) return "SKT AI Cloud";
  if (/lg group.*ai factory/.test(text)) return "LG AI Factory";
  if (/doosan.*ai factory/.test(text)) return "Doosan AI Factory";
  if (/\b(?:claude\s*)?(?:fable|mythos)\s*5\b/.test(text)) return "Claude Fable/Mythos";
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
    return "已披露细节覆盖投入方向、合作节奏、组织动作、执行安排和后续资源配置";
  }
  if (category === "product_radar") {
    return "当前公开的是产品入口、适用对象、价格地区限制、权限要求和后续上线节奏";
  }
  if (category === "open_source") {
    return "当前公开的是代码接口、许可证、维护节奏、集成门槛和团队可复用边界";
  }
  if (category === "content_aigc" || AIGC_RE.test(text)) {
    return "当前公开的是试用入口、样例质量、版权边界、价格信息和生产可用范围";
  }
  if (/agent|workflow|mcp|tool|developer|coding|codex|copilot|cursor/i.test(text)) {
    return "当前公开的是部署方式、权限、上下文管理和失败恢复边界";
  }
  if (/benchmark|eval|paper|research|arxiv|reasoning|long context|memory/i.test(text)) {
    return "当前公开的是实验设置、数据范围、对比基线、复现材料和作者承认的限制";
  }
  if (/policy|safety|governance|regulation|security/i.test(text)) {
    return "当前公开的是生效范围、执行主体、例外条款、落地安排和责任边界";
  }
  return "已披露细节覆盖适用对象、证据来源、执行安排、后续时间表和风险边界";
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
    return "这会改变产品和采购团队安排试用、预算审批、替换工具和风险复盘的优先级";
  }
  if (category === "open_source") {
    return "这会影响研发团队是否把它放进 PoC、评估清单、现有工作流或长期维护计划";
  }
  if (category === "content_aigc" || AIGC_RE.test(text)) {
    return "这会影响内容团队判断创作工具能否进入正式生产流程、预算清单和版权审查";
  }
  if (/agent|workflow|mcp|tool|developer|coding|codex|copilot|cursor/i.test(text)) {
    return "这会影响研发团队安排 agent 工具接入顺序、权限设计、评估回放和落地成本";
  }
  if (/benchmark|eval|paper|research|arxiv|reasoning|long context|memory/i.test(text)) {
    return "这会改变模型和平台团队对能力边界、推理成本、可靠性和内部实验设计的预期";
  }
  if (/policy|safety|governance|regulation|security/i.test(text)) {
    return "这类更新会直接牵动产品上线流程、风控口径、合规检查和责任分工";
  }
  return "这会影响产品团队判断路线优先级、接入时机、资源投入和后续风险预案";
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
  if (/security new features in may 2026|alibaba cloud security products targeting international markets/.test(text)) {
    return [
      "**阿里云安全产品**：原文按产品线汇总 2026 年 5 月功能变化，重点是国际站安全能力、控制台入口和防护范围。"
    ];
  }
  if (/automating daily outlook email summarization with hermesagent|outlook email.*hermesagent|hermesagent.*outlook email/.test(text)) {
    return [
      "**HermesAgent 工作流**：文章演示在 Alibaba Cloud ECS 上自动汇总 Outlook 邮件，把邮箱处理接入云端 agent 任务链。"
    ];
  }
  if (/cut checkpoint costs.*nvidia nvcomp|periodic checkpoints|model weights.*optimizer states.*gradients|optimizer states.*gradients/.test(text)) {
    return [
      "**训练检查点成本**：NVIDIA 把 nvCOMP 压缩库接到 checkpoint 流程里，关注权重、优化器状态和梯度快照的存储开销。"
    ];
  }
  if (/claude code guide 2026|25 features.*examples.*demo|claude\.md|subagents|hooks.*mcp|mcp.*auto mode/.test(text)) {
    return [
      "**Claude Code 用法**：指南把 CLAUDE.md、skills、subagents、hooks、MCP 和 Auto Mode 等功能拆成示例与场景。"
    ];
  }
  if (/agent evaluation practices|tool traces|replayable failures|release gates|human rollback|deployment checklists?/.test(text)) {
    return [
      "**Agent 评测流程**：文章把 tool traces、可复现失败、release gates、人工回滚和部署检查清单放进同一条上线流程。"
    ];
  }
  if (/vla.*世界模型|世界模型.*vla|智源研究院院长王仲远|world model.*embodied|embodied.*world model/.test(text)) {
    return [
      "**具身智能路线**：专访把 VLA、世界模型和机器人对物理因果的理解放在一起，重点是当前系统仍缺少稳定的物理预测能力。"
    ];
  }
  if (/\b(?:claude\s*)?(?:fable|mythos)\s*5\b/.test(text)) {
    return [
      "**模型关系**：Anthropic 把 Fable 5 解释为面向通用使用开放的 ==Mythos-class== 模型；Mythos 5 是同一底层模型、面向可信访问放宽部分安全限制。",
      "**安全边界**：Fable 5 在 cyber、bio、chemical 和模型蒸馏等敏感场景由分类器接管，并 fallback 到 Claude Opus 4.8，官方称平均少于 5% sessions 触发。",
      "**可用性/价格**：Fable 5 面向公开产品和 API 可用；Mythos 5 仅限 Project Glasswing/可信访问，两者标价都是 $10/M input、$50/M output。"
    ];
  }
  if (/runway updates ai video creation workflow for game worlds/.test(text)) {
    return [
      "**工作流变化**：官方条目指向 AI 视频生成和游戏世界创作流程更新，关注素材生成链路而不是单个模型名。"
    ];
  }
  if (/^official ai platform update\s+\d+$/i.test(String(candidate.title || "").trim())) {
    return [
      `**官方来源**：${candidate.source || "官方来源"} 把它列为产品、模型、平台或治理相关变化，需要按原文入口核对具体范围。`
    ];
  }
  if (/unlocking ai flexibility in europe|cross-region inference.*eu data processing|eu data processing.*model access/.test(text)) {
    return [
      "**适用范围**：原文讨论欧盟数据处理场景下如何使用 ==跨区域推理== 取得更多模型选择。",
      "**约束条件**：AWS 把模型可用性、跨 Region 容量和数据处理边界放在同一组问题里说明，适合欧洲团队核对区域访问方案。"
    ];
  }
  if (/rocketmq.*litetopic/.test(text)) {
    return [
      "**新能力**：==LiteTopic== 面向百万级轻量 AI agent 会话，给每个会话提供专用消息通道。",
      "**工程指向**：文章强调事件驱动分发和会话持久化，目标是降低独立 Topic 带来的管理和资源成本。"
    ];
  }
  if (/agentscope java 2\.0/.test(text)) {
    return [
      "**框架方向**：2.0 版本强调 ==分布式执行== 和企业级 agent 基础能力，定位不只是单机 demo。",
      "**落地范围**：公开信息把 Java 生态接入、生产可用能力和企业级运行放在一起，适合关注 agent 工程化团队跟进。"
    ];
  }
  if (/tokenmaxxing|ontology-based dependency/.test(text)) {
    return [
      "**成本路径**：文章主张先用 ontology-based dependency modeling 抽取任务依赖关系，再减少 ==无效上下文==。",
      "**适用场景**：它讨论的是企业 agent 的 token 消耗，不是单纯压缩提示词；关键在检索、记忆和上下文裁剪协同。"
    ];
  }
  if (/ip allow list coverage.*emu namespaces|emu namespaces.*ip allow list|ip allow list.*general availability/.test(text)) {
    return [
      "**GitHub IP 白名单**：企业托管用户的命名空间现在可执行 GitHub 原生 ==IP 白名单== 配置。",
      "**正式可用**：这项能力从预览推进到 GA，影响 GitHub Enterprise Cloud EMU 的用户命名空间访问控制。"
    ];
  }
  if (/economic research exchange/.test(text)) {
    return [
      "**OpenAI 研究项目**：Economic Research Exchange 面向 AI 对就业、生产率和宏观经济影响的 ==经济研究==。",
      "**参与方式**：OpenAI 表示将为选定研究项目开放申请入口，公开信息更像研究合作计划而不是产品功能发布。"
    ];
  }
  if (/train models faster with jax and maxtext|nvfp4.*blackwell|blackwell.*nvfp4/.test(text)) {
    return [
      "**训练优化**：NVIDIA 把 JAX、MaxText、Blackwell 和 ==NVFP4== 放在同一条训练吞吐优化链路里。",
      "**问题背景**：文章从 frontier LLM 预训练的吞吐瓶颈切入，讨论千卡级训练中每一点 step efficiency 的成本意义。"
    ];
  }
  if (/next-generation of apple intelligence|siri ai|more capable and personal assistant/.test(text)) {
    return [
      "**苹果系统 AI**：Apple 预览下一代 Apple Intelligence，并把 ==Siri AI== 放进系统级更新。",
      "**可用范围**：公开信息集中在更个人化的助手体验、设备软件版本和覆盖范围，属于苹果平台级 AI 入口变化。"
    ];
  }
  if (/aids app development.*intelligence frameworks|new intelligence frameworks.*advanced tools/.test(text)) {
    return [
      "**开发者工具**：Apple 宣布新的 ==智能框架==、Xcode 生产力能力和平台改进，面向第三方应用开发。",
      "**接入方向**：这条信息指向系统级 AI 能力怎样进入开发工具链，而不是独立发布一个聊天产品。"
    ];
  }
  if (/bringing the latest gemini models to apple developers|gemini models.*apple developers/.test(text)) {
    return [
      "**Gemini 模型接入**：Google 把 ==Gemini 模型== 接入苹果开发者工具链，开发者可在 Apple 生态的开发流程里调用最新模型能力，而不是只从独立网页或云控制台进入。"
    ];
  }
  if (/third generation of apple.*foundation models|introducing the third generation of apple/.test(text)) {
    return [
      "**模型说明**：Apple 披露第三代基础模型的 ==端侧模型、服务器模型和评测范围==，把能力范围写进研究说明。",
      "**系统入口**：公开信息把模型能力、系统体验和开发者接口放在一起，区分已产品化能力和仍处在研究披露中的能力。"
    ];
  }
  if (/apple intelligence brings powerful ai capabilities|powerful ai capabilities into everyday experiences/.test(text)) {
    return [
      "**日常入口**：Apple 把 ==写作、图像和快捷操作== 等 AI 能力接入 iPhone、iPad 和 Mac 的日常体验。",
      "**产品形态**：公开信息强调更个人化、更有帮助的系统功能，说明苹果继续把 AI 做成默认系统能力。"
    ];
  }
  if (/whatsapp.*spyware|spyware.*whatsapp|nso/.test(text)) {
    return [
      "**攻击归因**：WhatsApp 把这轮定向钓鱼攻击与 NSO 关联起来，说明它把这次事件按高风险间谍软件处理。",
      "**背景**：NSO 是一家长期处在监管和执法争议中的间谍软件公司，也被美国政府列入黑名单。",
      "**披露重点**：这次公开信息集中在拦截动作和攻击归因，暂时还没有更完整的受影响范围说明。"
    ];
  }
  if (/sovereign ai|london tech week|ai maker, not an ai taker/.test(text)) {
    return [
      "**时间点**：NVIDIA 继续借伦敦科技周推进 ==英国主权 AI== 议题，和去年的口号形成前后呼应。",
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
  const readmeSummary = normalizeGithubReadmeSummary(
    meta.readme_summary || candidate.readme_summary || candidate.github_readme_summary || "",
    repo
  );
  const readmeCache = meta.readme_cache || candidate.readme_cache || null;
  const readmeFetchStatus = String(meta.readme_fetch_status || candidate.readme_fetch_status || meta.readme_status || candidate.readme_status || "").trim();
  const readmeError = String(meta.readme_error || candidate.readme_error || "").trim();
  const topics = publicGithubTopics(meta.topics || candidate.topics);
  const license = String(meta.license || candidate.license || "").trim();
  const stargazersTotal = nonNegativeInteger(meta.stargazers_total ?? candidate.stargazers_total);
  const pushedAt = String(meta.pushed_at || candidate.pushed_at || "").trim();
  const description = readmeSummary;
  return {
    name: meta.name || repo,
    repo,
    candidate_id: candidate.id,
    ...(description ? { description } : {}),
    ...(readmeSummary ? { readme_summary: readmeSummary } : {}),
    ...(readmeCache ? { readme_cache: readmeCache } : {}),
    ...(readmeFetchStatus ? { readme_fetch_status: readmeFetchStatus } : {}),
    ...(readmeError ? { readme_error: readmeError } : {}),
    ...(topics.length > 0 ? { topics } : {}),
    ...(license ? { license } : {}),
    ...(stargazersTotal !== null ? { stargazers_total: stargazersTotal } : {}),
    ...(pushedAt ? { pushed_at: pushedAt } : {}),
    url: candidate.url,
    event_date: candidate.event_date,
    source: candidate.source || "GitHub Trending",
    language: meta.language || candidate.language || "",
    window: meta.window || candidate.window || "weekly",
    rank: index + 1,
    source_rank: rankOf(meta, index + 1),
    source_scope: githubTrendingSourceScope(candidate, meta),
    previous_rank: Number.isInteger(meta.previous_rank) ? meta.previous_rank : null,
    rank_delta: Number.isInteger(meta.rank_delta) ? meta.rank_delta : null,
    trend: ["new", "up", "down", "same"].includes(meta.trend || candidate.trend) ? (meta.trend || candidate.trend) : "new",
    evidence: candidate.evidence || meta.evidence || `${repo} appeared in GitHub Trending.`
  };
}

function publicGithubTopics(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value
    .map((item) => String(item || "").trim())
    .filter(Boolean))]
    .slice(0, 12);
}

function nonNegativeInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function huggingFaceTrendingItem(candidate, index) {
  const repo = repoFromUrl(candidate.url) || candidate.title;
  const task = String(candidate.task || "").trim();
  const metrics = [
    Number.isFinite(Number(candidate.likes)) && Number(candidate.likes) > 0 ? `${Number(candidate.likes)} likes` : "",
    Number.isFinite(Number(candidate.downloads)) && Number(candidate.downloads) > 0 ? `${Number(candidate.downloads)} downloads` : "",
    task ? `task: ${task}` : ""
  ].filter(Boolean).join("; ");
  return {
    name: repo,
    repo,
    candidate_id: candidate.id,
    description: huggingFaceModelDescription(candidate, repo, metrics),
    url: candidate.url,
    event_date: candidate.event_date,
    source: candidate.source || "Hugging Face Trending Models",
    task,
    downloads: Number.isFinite(Number(candidate.downloads)) ? Number(candidate.downloads) : 0,
    likes: Number.isFinite(Number(candidate.likes)) ? Number(candidate.likes) : 0,
    rank: Number.isInteger(Number(candidate.rank)) ? Number(candidate.rank) : index + 1,
    trend: "trending",
    evidence: candidate.evidence || `Hugging Face trending entry for ${repo}.`,
    editorial_category: "open_source",
    source_level: "model_registry",
    verification_status: "primary_confirmed",
    importance: index < 3 ? "notable" : "general"
  };
}

function projectItem(candidate, meta) {
  const repo = meta.repo || repoFromUrl(candidate.url) || candidate.title;
  const readmeSummary = normalizeGithubReadmeSummary(
    meta.readme_summary || candidate.readme_summary || candidate.github_readme_summary || "",
    repo
  );
  const safeMeta = {
    ...meta,
    readme_summary: readmeSummary,
    description: readmeSummary || meta.description
  };
  return {
    name: repo,
    candidate_id: candidate.id,
    editorial_category: "open_source",
    source_level: "github",
    verification_status: "primary_confirmed",
    description: readmeSummary || chineseGithubDescription(meta.description || candidate.evidence || repo, repo),
    ...(readmeSummary ? { readme_summary: readmeSummary } : {}),
    domains: projectDomains(meta.description || candidate.title || ""),
    use_case: githubProjectUseCase(candidate, safeMeta, repo),
    url: candidate.url,
    event_date: candidate.event_date,
    source: candidate.source || "GitHub Trending",
    signal: "trending",
    evidence: candidate.evidence || meta.evidence || `${repo} appeared in GitHub Trending.`
  };
}

function hotBlogItem(candidate) {
  const fields = nonPrimaryDisclosureFields(candidate);
  const summary = hotBlogSummary(candidate);
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
    summary,
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
    evidence: stripDraftPublicBodyNoise(candidate.evidence || candidate.title, candidate),
    editorial_category: inferredEditorialCategory(candidate) === "content_aigc" ? "content_aigc" : "community_signal",
    ...fields
  };
}

function communityLeadPublicSummary(candidate) {
  const summary = communityLeadReaderMaterial(candidate);
  return summary ? trimText(stripDraftPublicBodyNoise(summary, candidate), 170) : "";
}

function hasCommunityLeadReaderMaterial(candidate) {
  return isPublishableCommunityLeadReaderMaterial(communityLeadReaderMaterial(candidate), candidate);
}

function communityLeadReaderMaterial(candidate) {
  const summary = joinReaderSentences([
    candidateReaderDigest(candidate),
    communityLeadDetailSentence(candidate)
  ]);
  if (summary) {
    return stripDraftPublicBodyNoise(summary, candidate);
  }
  const lead = chineseLeadForCandidate(candidate);
  if (lead) {
    return stripDraftPublicBodyNoise(lead, candidate);
  }
  for (const field of [candidate.summary, candidate.evidence, candidate.title]) {
    const raw = stripDraftPublicBodyNoise(field, candidate);
    if (hasChineseText(raw) && raw.length >= 18) {
      return raw;
    }
  }
  return "";
}

function isPublishableCommunityLeadReaderMaterial(value, candidate = {}) {
  const text = stripDraftPublicBodyNoise(value, candidate).replace(/\s+/g, " ").trim();
  if (!text || isGenericCommunityLeadPublicText(text, candidate)) {
    return false;
  }
  const hanCount = (text.match(/\p{Script=Han}/gu) || []).length;
  const sourceLevel = sourceLevelForCandidate(candidate);
  if (sourceLevel === "intermediary" || sourceLevel === "community" || sourceLevel === "community_api") {
    return text.length >= 80 && hanCount >= 30;
  }
  return text.length >= 50 && hanCount >= 20;
}

function isGenericCommunityLeadPublicText(value, candidate = {}) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  const generic = genericChineseHeadline(candidate);
  if (generic && text === generic) {
    return true;
  }
  if (isPromotionalCommunityLeadPublicText(text, candidate)) {
    return true;
  }
  return /(?:相关团队|相关平台|Nature|TechCrunch AI|Crunchbase AI|HNRSS Frontpage|Planet AI|NVIDIA|MIT Technology Review|Interconnects|Smol AI)更新(?:AI 产品、平台或工程实践|agent 工作流和开发工具能力)|披露模型能力和评估方法更新/u.test(text);
}

function isPromotionalCommunityLeadPublicText(value, candidate = {}) {
  const combined = [
    value,
    candidate.title,
    candidate.summary,
    candidate.evidence,
    candidate.source
  ]
    .filter(Boolean)
    .map((item) => String(item).replace(/\s+/g, " ").trim())
    .join(" ");
  if (!combined) {
    return false;
  }
  const promotionalEventSignal = /WAVES\s*2026|\u76db\u590f\u8d74\u7ea6|\u8fce\u98ce\u800c\u7acb|\u521b\u6295\u6d6a\u6f6e|\u521b\u6295\u5708|\u5e74\u5ea6\u98ce\u5411\u6807|\u98ce\u53e3/u.test(combined);
  if (!promotionalEventSignal) {
    return false;
  }
  const action = "\u53d1\u5e03|\u63a8\u51fa|\u4e0a\u7ebf|\u5f00\u6e90|\u5f00\u653e|\u53ef\u7528";
  const object = "\u6a21\u578b|\u5927\u6a21\u578b|API|SDK|CLI|\u5de5\u5177|\u5e73\u53f0|\u4ea7\u54c1|\u8bba\u6587|\u57fa\u51c6|\u8bc4\u6d4b|\u6570\u636e\u96c6|Agent|agent|\u667a\u80fd\u4f53|\u8bed\u97f3\u514b\u9686|TTS";
  const concreteAiFact = new RegExp(`(?:${action}).{0,24}(?:${object})|(?:${object}).{0,24}(?:${action})`, "u").test(combined);
  return !concreteAiFact;
}

function communityLeadTitleForCandidate(candidate) {
  const rawTitle = rewritePublicStockPhrases(stripDraftPublicBodyNoise(candidate.title || "", candidate));
  const lead = chineseLeadForCandidate(candidate);
  if (lead && (/^(the download|newsletter|daily brief|daily digest)\s*:/i.test(rawTitle) || (!hasChineseText(rawTitle) && rawTitle.length > 36))) {
    return trimText(lead, 80);
  }
  const genericHeadline = genericChineseHeadline(candidate);
  if (genericHeadline && (!hasReaderChineseText(rawTitle) || rawTitle.length > 72)) {
    return trimText(genericHeadline, 80);
  }
  if (rawTitle && (hasReaderChineseText(rawTitle) || !/[A-Za-z]{18,}/.test(rawTitle))) {
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
    const publishUnavailableNote = Boolean(audit.sourceUnavailableNote);
    const item = {
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
      publish_to_public: publishToPublic || publishUnavailableNote,
      summary: audit.summary || (blocked ? `${tracker.summary} 本轮自动抓取未取得可解析快照，读者需要点开官方页人工核对最新榜单。` : tracker.summary),
      watch_points: audit.watchPoints || tracker.watchPoints,
      metrics: audit.metrics || tracker.metrics,
      evidence: `${tracker.evidence} ${audit.evidenceNote}`.trim(),
      verification_note: audit.verificationNote,
      ...(audit.sourceUnavailableNote ? { source_unavailable_note: audit.sourceUnavailableNote } : {}),
      risk_note: tracker.riskNote,
      watch_next: audit.watchNext || tracker.watchNext,
      ...(audit.snapshot ? { snapshot: audit.snapshot } : {})
    };
    const trackingComponentSnapshot = buildTrackingComponentSnapshot(item);
    return trackingComponentSnapshot
      ? { ...item, tracking_component_snapshot: trackingComponentSnapshot }
      : item;
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
    url: "https://scaleapi.github.io/SWE-bench_Pro-os/",
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
  const source = matchingSources.find((item) => isCompleteDailyTrackingSnapshotForTracker(sanitizeDailyTrackingSnapshot(item?.snapshot), tracker) && hasRequiredOfficialComponentSnapshot(sanitizeDailyTrackingSnapshot(item?.snapshot), tracker)) ||
    matchingSources.find((item) => isCompleteDailyTrackingSnapshotForTracker(sanitizeDailyTrackingSnapshot(item?.snapshot), tracker)) ||
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
      evidenceNote: `\u6765\u6e90\u68c0\u67e5\u72b6\u6001=${source.status}; ${snapshot.top_entries.length} OpenRouter top models parsed from public_page_snapshot`,
      verificationNote: `已解析 OpenRouter 公开 Rankings 页面的 This Week Top ${snapshot.top_entries.length}；快照时间 ${snapshot.snapshot_as_of}，这是平台用量信号，不是全市场份额或能力评测。`,
      watchNext: "若榜首、Top 10 构成或周变化继续异常，回到模型发布、价格页和状态页核验是发布驱动、价格驱动还是平台内工作流迁移。"
    };
  }
  if (tracker.id === "artificial-analysis-intelligence-index" && isCompleteArtificialAnalysisSnapshot(snapshot) && !hasOfficialComponentSnapshot(snapshot)) {
    return {
      status: "blocked",
      verificationStatus: "unverified",
      changeStatus: "blocked",
      changeSummary: "Artificial Analysis 官方组件 snapshot 不可用，不能确认可发布的榜单组件。",
      sourceUnavailableNote: "Artificial Analysis 官方 web 组件 snapshot 本轮不可用；已隐藏榜单数据卡，只保留官方入口供读者手动核对。",
      evidenceNote: `\u6765\u6e90\u68c0\u67e5\u72b6\u6001=${source.status}; official_component_snapshot_missing${source.notes ? `; notes=${source.notes}` : ""}`,
      verificationNote: "Artificial Analysis 需要官方 DOM/CSS snapshot 才能渲染公开追踪组件；本轮未取得可用 snapshot，因此不重画本地假组件。",
      watchNext: "下次抓取若恢复官方 snapshot，再展示榜单组件；本轮以官方入口人工核对为准。"
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
      evidenceNote: `\u6765\u6e90\u68c0\u67e5\u72b6\u6001=${source.status}; ${snapshot.top_entries.length} Artificial Analysis top models parsed from public_page_snapshot`,
      verificationNote: `已解析 Artificial Analysis Intelligence Index 公开页面的 Top ${snapshot.top_entries.length}；快照时间 ${snapshot.snapshot_as_of}，这是独立综合评测信号，不是生产选型结论。`,
      watchNext: "若榜首或 Top 10 构成变化，继续核对分项 benchmark、价格、延迟和自有 workload 复测结果。"
    };
  }
  if (tracker.id === "swe-bench-pro-public" && isUsableSweBenchProSnapshot(snapshot) && !hasOfficialComponentSnapshot(snapshot)) {
    return {
      status: "blocked",
      verificationStatus: "unverified",
      changeStatus: "blocked",
      changeSummary: "SWE-bench Pro 官方组件 snapshot 不可用，不能确认可发布的榜单组件。",
      sourceUnavailableNote: "SWE-bench Pro 官方 web 组件 snapshot 本轮不可用；已隐藏榜单数据卡，只保留官方入口供读者手动核对。",
      evidenceNote: `\u6765\u6e90\u68c0\u67e5\u72b6\u6001=${source.status}; official_component_snapshot_missing${source.notes ? `; notes=${source.notes}` : ""}`,
      verificationNote: "SWE-bench Pro 需要官方榜单组件 snapshot 才能渲染公开追踪卡；本轮未取得可用 snapshot，因此不重画本地假组件。",
      watchNext: "下次抓取若恢复官方 snapshot，再展示榜单组件；本轮以官方入口人工核对为准。"
    };
  }
  if (tracker.id === "swe-bench-pro-public" && isUsableSweBenchProSnapshot(snapshot)) {
    return {
      status: source.status,
      verificationStatus: "primary_confirmed",
      changeStatus: "changed",
      changeSummary: sweBenchProSnapshotChangeSummary(snapshot),
      summary: sweBenchProSnapshotSummary(snapshot),
      watchPoints: sweBenchProSnapshotWatchPoints(snapshot),
      metrics: sweBenchProSnapshotMetrics(snapshot),
      snapshot,
      evidenceNote: `\u6765\u6e90\u68c0\u67e5\u72b6\u6001=${source.status}; ${snapshot.top_entries.length} SWE-bench Pro rows parsed from official page snapshot`,
      verificationNote: `已解析 Scale Labs SWE-Bench Pro Public Dataset 的 Top ${snapshot.top_entries.length}；快照时间 ${snapshot.snapshot_as_of}，这是 coding benchmark 信号，不是生产选型结论。`,
      watchNext: "若榜首或 Top 10 构成变化，继续核对 agent scaffold、成本限制、置信区间和团队自有仓库复测结果。"
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
      evidenceNote: `\u6765\u6e90\u68c0\u67e5\u72b6\u6001=${source.status}${source.notes ? `; notes=${source.notes}` : ""}`,
      verificationNote: source.status === "checked"
        ? "\u672c\u8f6e\u5df2\u68c0\u67e5\u5b98\u65b9\u5165\u53e3\uff1b\u5982\u9875\u9762\u4e3a\u52a8\u6001\u699c\u5355\uff0c\u4ecd\u4ee5\u70b9\u5f00\u5b98\u65b9\u9875\u4e3a\u6700\u7ec8\u6838\u5bf9\u3002"
        : "本轮已检查官方入口，但未解析到当日可入选条目；保留为追踪面而非事实更新。"
    };
  }
  return {
    status: "blocked",
    verificationStatus: "unverified",
    changeStatus: "blocked",
    changeSummary: "本轮官方入口抓取受阻，不能确认榜单是否变化。",
    evidenceNote: `\u6765\u6e90\u68c0\u67e5\u72b6\u6001=${source.status || "blocked"}${source.notes ? `; notes=${source.notes}` : ""}`,
    verificationNote: `本轮固定入口抓取受阻：${source.notes || source.status || "blocked"}。`
  };
}

function hasOfficialComponentSnapshot(snapshot) {
  const official = snapshot?.official_component_snapshot;
  return Boolean(official && typeof official === "object" && String(official.sanitized_html || "").trim());
}

function hasRequiredOfficialComponentSnapshot(snapshot, tracker) {
  if (tracker.id === "artificial-analysis-intelligence-index" || tracker.id === "swe-bench-pro-public") {
    return hasOfficialComponentSnapshot(snapshot);
  }
  return true;
}

function isCompleteDailyTrackingSnapshotForTracker(snapshot, tracker) {
  if (tracker.id === "openrouter-rankings") {
    return isCompleteOpenRouterSnapshot(snapshot);
  }
  if (tracker.id === "artificial-analysis-intelligence-index") {
    return isCompleteArtificialAnalysisSnapshot(snapshot);
  }
  if (tracker.id === "swe-bench-pro-public") {
    return isUsableSweBenchProSnapshot(snapshot);
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

function isCompleteSweBenchProSnapshot(snapshot) {
  return snapshot?.snapshot_status === "complete" &&
    Array.isArray(snapshot.top_entries) &&
    snapshot.top_entries.length === 10 &&
    snapshot.top_entries.every((entry, index) => entry.rank === index + 1 && entry.model && entry.provider && /\d+(?:\.\d+)?/.test(entry.tokens || "") && entry.change);
}

function isUsableSweBenchProSnapshot(snapshot) {
  return (snapshot?.snapshot_status === "complete" || snapshot?.snapshot_status === "partial") &&
    Array.isArray(snapshot.top_entries) &&
    snapshot.top_entries.length > 0 &&
    snapshot.top_entries.every((entry, index) => entry.rank === index + 1 && entry.model && entry.provider && /\d+(?:\.\d+)?/.test(entry.tokens || "") && entry.change);
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

function sweBenchProSnapshotChangeSummary(snapshot) {
  const top = snapshot.top_entries.slice(0, 3);
  const topText = top.map((entry) => `#${entry.rank} ${entry.model} ${entry.tokens}`).join("，");
  const newEntries = snapshot.top_entries.filter((entry) => /^new$/i.test(entry.change));
  return newEntries.length > 0
    ? `SWE-bench Pro Public Dataset Top 10 已解析：${topText}；新进榜条目包括 ${newEntries.map((entry) => entry.model).join("、")}。`
    : `SWE-bench Pro Public Dataset Top 10 已解析：${topText}。`;
}

function sweBenchProSnapshotSummary(snapshot) {
  const top = snapshot.top_entries[0];
  const providers = providerMix(snapshot.top_entries);
  const topRows = snapshot.top_entries.slice(0, 3).map((entry) => `${entry.model} ${entry.tokens}`).join("、");
  return [
    `Scale Labs 公开榜单显示，SWE-bench Pro Public Dataset 当前第一是 ${top.model}（${top.provider}，Resolve Rate ${top.tokens}）。`,
    `前三名为 ${topRows}，Top 10 供应商分布为 ${providers}。`,
    "这个榜单适合观察 coding agent 在长周期真实工程任务上的相对表现，但生产选型仍要结合 scaffold、成本上限、置信区间和团队自有仓库复测。"
  ].join(" ");
}

function sweBenchProSnapshotWatchPoints(snapshot) {
  const top = snapshot.top_entries[0];
  const newEntries = snapshot.top_entries.filter((entry) => /^new$/i.test(entry.change));
  return [
    `榜首 ${top.model} 的 Resolve Rate 为 ${top.tokens}，需要看它是否依赖特定 agent scaffold 或成本上限。`,
    newEntries.length > 0 ? `新进榜条目：${newEntries.map((entry) => `${entry.model}（${entry.provider}）`).join("、")}。` : "如果 Top 10 没有新进榜，重点看相邻模型的置信区间是否重叠。",
    "把 SWE-bench Pro 与真实 IDE/CI 工作流分开看，避免把公开 benchmark 直接等同于团队仓库里的修复率。"
  ];
}

function sweBenchProSnapshotMetrics(snapshot) {
  const topMetrics = snapshot.top_entries.map((entry) => ({
    label: `#${entry.rank}`,
    value: `${entry.model}（${entry.provider}）：Resolve Rate ${entry.tokens}`,
    trend: /^new$/i.test(entry.change) ? "new" : "unknown"
  }));
  return [
    { label: "榜单范围", value: `SWE-bench Pro Public Top ${snapshot.top_entries.length}`, trend: "same" },
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
    ...(source?.id ? { id: String(source.id) } : {}),
    ...(source?.source_kind ? { source_kind: String(source.source_kind) } : {}),
    ...(source?.tier ? { tier: String(source.tier) } : {}),
    ...(source?.authority ? { authority: String(source.authority) } : {}),
    ...(source?.enablement ? { enablement: String(source.enablement) } : {}),
    ...(source?.verification_policy ? { verification_policy: String(source.verification_policy) } : {}),
    ...(source?.platform ? { platform: String(source.platform) } : {}),
    ...(typeof source?.requires_original_url === "boolean" ? { requires_original_url: source.requires_original_url } : {}),
    ...(Number.isInteger(source?.http_status) || source?.http_status === null ? { http_status: source.http_status } : {}),
    ...(typeof source?.feed_like === "boolean" ? { feed_like: source.feed_like } : {}),
    ...(Number.isInteger(source?.recent_48h_entries) ? { recent_48h_entries: source.recent_48h_entries } : {}),
    ...(Number.isInteger(source?.original_url_count) || source?.original_url_count === null ? { original_url_count: source.original_url_count } : {}),
    ...(Number.isInteger(source?.parsed_count) ? { parsed_count: source.parsed_count } : {}),
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
  const historyEntries = Array.isArray(snapshot.history_entries)
    ? snapshot.history_entries
      .map((entry) => ({
        week: String(entry?.week || "").trim(),
        rank: Number(entry?.rank),
        model: String(entry?.model || "").trim(),
        provider: String(entry?.provider || "").trim(),
        tokens: String(entry?.tokens || "").trim(),
        change: String(entry?.change || entry?.week || "").trim()
      }))
      .filter((entry) => entry.week && Number.isInteger(entry.rank) && entry.rank > 0 && entry.model && entry.tokens)
    : [];
  const componentTabs = sanitizeDailyTrackingComponentTabs(snapshot.component_tabs);
  const officialComponentSnapshot = normalizeOfficialComponentSnapshot(snapshot.official_component_snapshot, {
    componentKind: String(snapshot.official_component_snapshot?.component_kind || "").trim(),
    sourceUrl: isHttpUrl(snapshot.source_url) ? snapshot.source_url : "https://example.com/",
    capturedAt: String(snapshot.snapshot_as_of || new Date().toISOString()),
    selectorVersion: String(snapshot.official_component_snapshot?.selector_version || "")
  });
  return {
    type: String(snapshot.type || "daily_tracking_snapshot"),
    collection_method: String(snapshot.collection_method || "public_page_playwright"),
    snapshot_status: String(snapshot.snapshot_status || (topEntries.length > 0 ? "partial" : "blocked")),
    snapshot_as_of: String(snapshot.snapshot_as_of || new Date().toISOString()),
    source_url: isHttpUrl(snapshot.source_url) ? snapshot.source_url : "https://example.com/",
    top_entries: topEntries,
    ...(historyEntries.length > 0 ? { history_entries: historyEntries } : {}),
    ...(componentTabs ? { component_tabs: componentTabs } : {}),
    ...(officialComponentSnapshot ? { official_component_snapshot: officialComponentSnapshot } : {}),
    ...(snapshot.notes ? { notes: String(snapshot.notes) } : {})
  };
}

function sanitizeDailyTrackingComponentTabs(componentTabs) {
  if (!componentTabs || typeof componentTabs !== "object") {
    return null;
  }
  const result = {};
  for (const key of ["score", "token_usage", "cost", "score_vs_token_usage", "score_vs_cost", "score_vs_compute"]) {
    const rows = Array.isArray(componentTabs?.[key]?.rows)
      ? componentTabs[key].rows.map(sanitizeDailyTrackingComponentRow).filter(Boolean)
      : [];
    if (rows.length > 0) {
      result[key] = {
        rows,
        ...(componentTabs[key].fallback_reason ? { fallback_reason: String(componentTabs[key].fallback_reason) } : {})
      };
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}

function sanitizeDailyTrackingComponentRow(row) {
  if (!row || typeof row !== "object") {
    return null;
  }
  const rank = Number(row.rank);
  const model = String(row.model || "").trim();
  const value = Number(row.value);
  const provider = String(row.provider || "").trim();
  const valueLabel = String(row.value_label || row.valueLabel || "").trim();
  if (!Number.isInteger(rank) || rank <= 0 || !model || !Number.isFinite(value)) {
    return null;
  }
  const segments = row.segments && typeof row.segments === "object"
    ? Object.fromEntries(Object.entries(row.segments)
      .map(([key, segmentValue]) => [String(key), String(segmentValue || "").trim()])
      .filter(([, segmentValue]) => segmentValue))
    : null;
  return {
    rank,
    model,
    provider,
    value,
    value_label: valueLabel,
    change: String(row.change || "").trim(),
    ...(row.metric ? { metric: String(row.metric) } : {}),
    ...(row.secondary_value !== undefined && Number.isFinite(Number(row.secondary_value)) ? { secondary_value: Number(row.secondary_value) } : {}),
    ...(row.secondary_value_label ? { secondary_value_label: String(row.secondary_value_label) } : {}),
    ...(segments && Object.keys(segments).length > 0 ? { segments } : {}),
    ...(isHttpUrl(row.url) ? { url: row.url } : {})
  };
}

function auditGroupForCandidate(candidate) {
  if (isPlatformExemptCategory(candidate.category)) {
    return auditGroupForPlatform(candidate.platform || platformFromCandidateCategory(candidate.category));
  }
  const source = `${candidate.source_id || ""} ${candidate.source || ""}`.toLowerCase();
  if (source.includes("github") && source.includes("trending")) return "github_trending";
  if (candidate.category === "huggingface_trending" || source.includes("huggingface-trending") || source.includes("hugging face trending")) return "huggingface_trending";
  if (source.includes("china-ai") || isChinaAiCandidate(candidate)) return "china_ai_sources";
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
    const category = groupName === "github_trending"
      ? "github_trending"
      : groupName === "huggingface_trending"
        ? "project"
        : groupName === "builder_sources" ? "builder" : "community";
    for (const source of Array.isArray(group?.sources) ? group.sources : []) {
      addCandidateSource(sourceMap, {
        id: sourceIdFromAuditSource(groupName, source),
        name: source.name || groupName,
        url: source.url || "https://example.com/",
        category,
        status: source.status,
        checked_at: generatedAt,
        notes: source.notes || "",
        platform: source.platform || platformForAuditGroup(groupName),
        source_level: source.source_level,
        verification_status: source.verification_status
      }, generatedAt);
    }
  }
}

function sourceIdFromAuditSource(groupName, source) {
  const platform = platformForAuditGroup(groupName);
  const prefix = platform || (groupName === "github_trending" ? "github" : groupName === "huggingface_trending" ? "huggingface" : groupName === "china_ai_sources" ? "china-ai" : groupName === "builder_sources" ? "builder" : groupName === "search_sources" ? "search" : "content");
  return `${prefix}-${slugId(source?.name || source?.url || groupName) || "source"}`;
}

function platformForAuditGroup(groupName) {
  return Object.entries(PLATFORM_TO_AUDIT_GROUP).find(([, auditGroup]) => auditGroup === groupName)?.[0] || "";
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
    notes: source.notes || "",
    ...(source.platform ? { platform: source.platform } : {}),
    ...(source.source_level ? { source_level: source.source_level } : {}),
    ...(source.verification_status ? { verification_status: source.verification_status } : {})
  };
  if (!sourceMap.has(id)) {
    sourceMap.set(id, normalized);
  }
}

function normalizeCandidate(rawCandidate, context) {
  const id = uniqueCandidateId(context.existing, rawCandidate.id || `${rawCandidate.source_id || rawCandidate.source}-${rawCandidate.title || rawCandidate.url}`);
  const sourceId = rawCandidate.source_id || sourceIdFromCandidate(rawCandidate);
  const roles = normalizeCandidateRoles(rawCandidate.roles);
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
    ...(Number.isInteger(Number(rawCandidate.rank)) ? { rank: Number(rawCandidate.rank) } : {}),
    ...(Number.isInteger(Number(rawCandidate.downloads)) ? { downloads: Number(rawCandidate.downloads) } : {}),
    ...(Number.isInteger(Number(rawCandidate.likes)) ? { likes: Number(rawCandidate.likes) } : {}),
    ...(rawCandidate.task ? { task: trimText(rawCandidate.task, 80) } : {}),
    ...(Array.isArray(rawCandidate.tags) ? { tags: rawCandidate.tags.map((tag) => String(tag || "").trim()).filter(Boolean).slice(0, 8) } : {}),
    ...(roles.length > 0 ? { roles } : {}),
    ...(rawCandidate.notes ? { notes: trimText(rawCandidate.notes, 400) } : {}),
    ...(rawCandidate.intermediary_url ? { intermediary_url: rawCandidate.intermediary_url } : {}),
    ...(rawCandidate.primary_url ? { primary_url: rawCandidate.primary_url } : {}),
    ...(rawCandidate.original_url ? { original_url: rawCandidate.original_url } : {}),
    ...(rawCandidate.verification_status ? { verification_status: rawCandidate.verification_status } : {}),
    ...(rawCandidate.source_level ? { source_level: rawCandidate.source_level } : {}),
    ...(rawCandidate.verification_note ? { verification_note: rawCandidate.verification_note } : {}),
    ...(rawCandidate.risk_note ? { risk_note: rawCandidate.risk_note } : {}),
    ...(rawCandidate.reader_relevance ? { reader_relevance: rawCandidate.reader_relevance } : {}),
    ...(rawCandidate.story_key ? { story_key: String(rawCandidate.story_key).trim() } : {}),
    ...(rawCandidate.claim_fingerprint ? { claim_fingerprint: String(rawCandidate.claim_fingerprint).trim() } : {}),
    ...(rawCandidate.material_update ? { material_update: true } : {}),
    ...(Array.isArray(rawCandidate.verification_sources) ? { verification_sources: rawCandidate.verification_sources.filter(isHttpUrl) } : {}),
    ...(rawCandidate.platform ? { platform: rawCandidate.platform } : {}),
    ...(rawCandidate.rule_id ? { rule_id: rawCandidate.rule_id } : {}),
    ...(rawCandidate.claim_text ? { claim_text: trimText(rawCandidate.claim_text, 500) } : {}),
    ...(rawCandidate.why_watch ? { why_watch: trimText(rawCandidate.why_watch, 300) } : {}),
    ...(rawCandidate.disclosure ? { disclosure: trimText(rawCandidate.disclosure, 300) } : {}),
    ...(Array.isArray(rawCandidate.matched_terms) ? { matched_terms: rawCandidate.matched_terms.map((term) => String(term || "").trim()).filter(Boolean).slice(0, 12) } : {}),
    ...(rawCandidate.exemption_policy ? { exemption_policy: rawCandidate.exemption_policy } : {}),
    ...(rawCandidate.published_by_gate ? { published_by_gate: rawCandidate.published_by_gate } : {}),
    ...(rawCandidate.curated_first_party === true ? { curated_first_party: true } : {})
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

function uniqueCandidatesById(candidates) {
  const seen = new Set();
  const result = [];
  for (const candidate of candidates) {
    const id = String(candidate?.id || "").trim();
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    result.push(candidate);
  }
  return result;
}

function uniqueValues(values) {
  return [...new Set(values)];
}

function pickStoryClusters(candidates, target) {
  const clusters = clusterStoryCandidates(candidates);
  const picked = [];
  const seenUrls = new Set();
  const seenTopics = new Set();
  const enforceInfraVendorCap = shouldEnforceInfraVendorCap(clusters.map((cluster) => cluster.primary), target);
  let infraVendorCount = 0;
  let lowSignalPartnershipCount = 0;
  for (const cluster of clusters) {
    if (picked.length >= target) break;
    const candidate = cluster.primary;
    const clusterUrls = storyClusterUrls(cluster);
    if (clusterUrls.length === 0 || clusterUrls.some((url) => seenUrls.has(url))) continue;
    const topicKey = mainTopicKey(candidate);
    if (topicKey && seenTopics.has(topicKey)) continue;
    if (isOverrepresentedInfraVendorCandidate(candidate)) {
      if (enforceInfraVendorCap && infraVendorCount >= MAX_INFRA_VENDOR_MAIN_ITEMS) continue;
    }
    if (isLowSignalVendorPartnership(candidate)) {
      if (lowSignalPartnershipCount >= 1) continue;
      lowSignalPartnershipCount += 1;
    }
    picked.push(cluster);
    for (const url of clusterUrls) {
      seenUrls.add(url);
    }
    if (isOverrepresentedInfraVendorCandidate(candidate)) {
      infraVendorCount += 1;
    }
    if (topicKey) {
      seenTopics.add(topicKey);
    }
  }
  return picked;
}

function clusterStoryCandidates(candidates) {
  const byKey = new Map();
  const ordered = [];
  for (const candidate of candidates) {
    const key = storyClusterKey(candidate);
    if (!key) {
      continue;
    }
    let cluster = byKey.get(key);
    if (!cluster) {
      cluster = {
        key,
        explicit_key: explicitStoryKey(candidate),
        primary: candidate,
        candidates: []
      };
      byKey.set(key, cluster);
      ordered.push(cluster);
    }
    cluster.candidates.push(candidate);
    if (compareMainCandidates(candidate, cluster.primary) < 0) {
      cluster.primary = candidate;
    }
  }
  return ordered.sort((left, right) => compareMainCandidates(left.primary, right.primary));
}

function storyClusterKey(candidate) {
  const explicit = explicitStoryKey(candidate);
  if (explicit) {
    return `story:${slugId(explicit)}`;
  }
  const url = normalizeUrl(candidate?.url);
  return url ? `url:${url}` : "";
}

function explicitStoryKey(candidate) {
  return [
    candidate?.claim_fingerprint,
    candidate?.story_key,
    candidate?.story_id,
    candidate?.fingerprint
  ].map((value) => String(value || "").trim()).find(Boolean) || "";
}

function storyClusterUrls(cluster) {
  return uniqueValues(cluster.candidates.map((candidate) => normalizeUrl(candidate?.url)).filter(Boolean));
}

function markStoryClusterAudit(cluster, storyId) {
  const primaryId = String(cluster?.primary?.id || "").trim() || storyId;
  for (const candidate of Array.isArray(cluster?.candidates) ? cluster.candidates : []) {
    candidate.main_story_id = storyId;
    candidate.main_story_primary_id = primaryId;
    candidate.main_story_role = String(candidate?.id || "").trim() === primaryId ? "primary" : "supporting";
  }
}

function storyIdForCluster(cluster) {
  const explicit = cluster.explicit_key || explicitStoryKey(cluster.primary);
  if (explicit) {
    return `story-${slugId(explicit)}`;
  }
  return `story-${slugId(cluster.primary?.id || cluster.primary?.url || cluster.key)}`;
}

function storySelectionSnapshotFor(evaluations, clusters) {
  const rejectionCounts = {};
  for (const entry of evaluations) {
    if (!entry.eligible) {
      incrementCount(rejectionCounts, entry.reject_reason || "rejected");
    }
  }
  return {
    eligible_candidates: evaluations.filter((entry) => entry.eligible).length,
    eligible_story_clusters: clusterStoryCandidates(evaluations.filter((entry) => entry.eligible).map((entry) => entry.candidate)).length,
    selected: clusters.length,
    target_min: STORY_TARGET_MIN,
    target: STORY_TARGET,
    target_max: STORY_TARGET_MAX,
    shortfall: clusters.length < STORY_TARGET,
    rejection_counts: rejectionCounts
  };
}

function storyItemFromCluster(cluster, mainItemValue, storyId) {
  const candidate = cluster.primary;
  const sources = storySourcesForCluster(cluster);
  return {
    story_id: storyId,
    title: mainItemValue.title,
    importance: mainItemValue.importance || "general",
    trend: storyTrendForCandidate(candidate),
    event_date: candidate.event_date || mainItemValue.event_date,
    primary_entity: mainEntity(candidate) || candidate.source || "AI",
    event_type: storyEventType(candidate),
    object: trimText(displayTitleForCandidate(candidate), 96),
    what_happened: mainItemValue.summary || mainItemPublicLine(mainItemValue),
    why_it_matters: mainItemValue.why_it_matters || mainItemValue.reader_relevance || mainItemPublicLine(mainItemValue),
    evidence_level: storyEvidenceLevel(cluster, sources),
    sources,
    source_item_refs: uniqueValues(cluster.candidates.map((item) => item.id || item.url).filter(Boolean))
  };
}

function mainItemPublicLine(item) {
  return [
    item?.summary,
    ...(Array.isArray(item?.bullets) ? item.bullets : [])
  ].map((value) => String(value || "").trim()).find(Boolean) || String(item?.title || "").trim();
}

function storySourcesForCluster(cluster) {
  const sources = [];
  const seen = new Set();
  for (const candidate of cluster.candidates) {
    const url = candidate.url || candidate.primary_url || (Array.isArray(candidate.verification_sources) ? candidate.verification_sources[0] : "");
    if (!isHttpUrl(url)) {
      continue;
    }
    const key = `${normalizeUrl(url)}|${candidate.source || candidate.source_id || ""}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    sources.push({
      label: String(candidate.source || candidate.source_id || "Source").trim(),
      url,
      type: storySourceType(candidate)
    });
  }
  return sources;
}

function storySourceType(candidate) {
  const sourceLevel = sourceLevelForCandidate(candidate);
  if (sourceLevel === "official" || sourceLevel === "official_company_news") return "official";
  if (sourceLevel === "primary" || sourceLevel === "model_registry") return "primary";
  if (sourceLevel === "paper" || sourceLevel === "paper_api") return "paper";
  if (sourceLevel === "github" || sourceLevel === "official_open_source_account" || sourceLevel === "official_model_host_account") return "github";
  if (sourceLevel === "community") return "community";
  if (sourceLevel === "original_social") return "social";
  if (sourceLevel === "intermediary") return "media";
  return "source";
}

function storyEvidenceLevel(cluster, sources) {
  const sourceLevels = new Set(cluster.candidates.map((candidate) => sourceLevelForCandidate(candidate)));
  const uniqueUrls = new Set(sources.map((source) => normalizeUrl(source.url)).filter(Boolean));
  if (uniqueUrls.size >= 2 || sourceLevels.has("multi_source")) return "multi_source";
  const sourceLevel = sourceLevelForCandidate(cluster.primary);
  if (sourceLevel === "community" || sourceLevel === "original_social") return "community_signal";
  if (sourceLevel === "intermediary") return "secondary";
  return "primary";
}

function storyTrendForCandidate(candidate) {
  const category = inferredEditorialCategory(candidate);
  if (category === "engineering_toolchain" || category === "product_radar") return "AI products and developer workflow";
  if (category === "open_source") return "open source AI";
  if (category === "content_aigc") return "AI content workflow";
  if (category === "model_release") return "model releases";
  if (category === "funding" || category === "company_business") return "AI business";
  return "AI industry";
}

function storyEventType(candidate) {
  const text = candidateText(candidate).toLowerCase();
  if (/\b(launch|release|ship|rollout|available|introduce|open source)\b|发布|推出|上线|开源/u.test(text)) return "launch";
  if (/\b(update|upgrade|add|support)\b|更新|新增|支持/u.test(text)) return "update";
  if (/\b(research|paper|benchmark|eval)\b|论文|研究|评测|基准/u.test(text)) return "research";
  return "signal";
}

function evaluateMainCandidates(candidates, options = {}) {
  return candidates.map((candidate) => {
    const meta = options.metaById?.get(candidate.id) || {};
    const rejectReason = mainRejectReason(candidate, {
      reportDate: options.reportDate,
      recentMainUrlHistory: options.recentMainUrlHistory,
      meta
    });
    if (rejectReason) {
      candidate.main_reject_reason = rejectReason;
      return {
        candidate,
        meta,
        eligible: false,
        reject_reason: rejectReason
      };
    }
    if (canPromoteToMainStrict(candidate, options.reportDate)) {
      candidate.main_selection_stage = "strict";
      return {
        candidate,
        meta,
        eligible: true,
        stage: "strict"
      };
    }
    if (!canPromoteToMainRefill(candidate, meta, options.reportDate)) {
      candidate.main_reject_reason = "not_main_refill_material";
      return {
        candidate,
        meta,
        eligible: false,
        reject_reason: "not_main_refill_material"
      };
    }
    const stage = mainRefillStage(candidate, meta, options.reportDate);
    candidate.main_selection_stage = stage;
    return {
      candidate,
      meta,
      eligible: true,
      stage
    };
  });
}

function mainSelectionSnapshotFor(evaluations, selectedCandidates, options = {}) {
  const rejectionCounts = {};
  for (const entry of evaluations) {
    if (!entry.eligible) {
      incrementCount(rejectionCounts, entry.reject_reason || "rejected");
    }
  }
  const selected = selectedCandidates.length;
  const strictSelected = selectedCandidates.filter((candidate) => candidate.main_selection_stage === "strict").length;
  const refillSelected = selected - strictSelected;
  const shortfall = selected < MAIN_TARGET_MIN;
  const snapshot = {
    eligible_candidates: evaluations.filter((entry) => entry.eligible).length,
    selected,
    strict_selected: strictSelected,
    refill_selected: refillSelected,
    target_min: MAIN_TARGET_MIN,
    target: MAIN_TARGET,
    target_max: MAIN_TARGET_MAX,
    shortfall,
    rejection_counts: rejectionCounts
  };
  if (shortfall) {
    snapshot.shortfall_event = {
      type: "main_stream_shortfall",
      selected,
      target_min: MAIN_TARGET_MIN,
      target_max: MAIN_TARGET_MAX,
      remaining_shortfall: MAIN_TARGET_MIN - selected,
      eligible_candidates: snapshot.eligible_candidates,
      rejection_counts: rejectionCounts,
      source_impacts: sourceImpactsForMainShortfall(options.sourceAudit)
    };
  }
  return snapshot;
}

function sourceImpactsForMainShortfall(sourceAudit = {}) {
  if (!sourceAudit || typeof sourceAudit !== "object") {
    return [];
  }
  return MAIN_STREAM_SOURCE_IMPACT_GROUPS
    .map((groupName) => sourceImpactForAuditGroup(groupName, sourceAudit[groupName]))
    .filter(Boolean)
    .sort(compareSourceImpacts)
    .slice(0, 12);
}

function sourceImpactForAuditGroup(groupName, group) {
  if (!group || typeof group !== "object") {
    return null;
  }
  const sources = Array.isArray(group.sources) ? group.sources : [];
  const statuses = sources
    .map((source) => String(source?.status || "").trim().toLowerCase())
    .filter(Boolean);
  const blockedReason = String(group.blocked_reason || "").trim();
  const notes = String(group.notes || "").trim();
  const candidateCount = countValue(group.candidates_found);
  const includedCount = countValue(group.included);
  const status = sourceImpactStatus({ statuses, blockedReason, candidateCount });
  if (!status) {
    return null;
  }
  return {
    source_group: groupName,
    status,
    reason: sourceImpactReason({ blockedReason, notes, sources, status, candidateCount }),
    candidate_count: candidateCount,
    included_count: includedCount,
    source_count: sources.length,
    source_names: sources.map((source) => String(source?.name || "").trim()).filter(Boolean).slice(0, 3),
    affects_main_stream: true
  };
}

function sourceImpactStatus({ statuses, blockedReason, candidateCount }) {
  const reason = String(blockedReason || "").toLowerCase();
  if (reason.includes("unconfigured") || statuses.includes("unconfigured")) {
    return "unconfigured";
  }
  if (blockedReason || statuses.some((status) => /blocked|failed|error|timeout|http_\d+/.test(status))) {
    return "blocked";
  }
  if (statuses.includes("degraded")) {
    return "degraded";
  }
  if (candidateCount === 0 || statuses.some((status) => status === "no_signal")) {
    return "no_signal";
  }
  return "";
}

function sourceImpactReason({ blockedReason, notes, sources, status, candidateCount }) {
  if (blockedReason) {
    return blockedReason;
  }
  const sourceNote = sources
    .map((source) => String(source?.notes || "").trim())
    .find(Boolean);
  if (sourceNote) {
    return sourceNote;
  }
  if (notes) {
    return notes;
  }
  if (candidateCount === 0) {
    return "no_candidates_found";
  }
  return status;
}

function countValue(value) {
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? count : 0;
}

function compareSourceImpacts(left, right) {
  const order = {
    blocked: 0,
    unconfigured: 1,
    degraded: 2,
    no_signal: 3
  };
  const statusDiff = (order[left.status] ?? 9) - (order[right.status] ?? 9);
  if (statusDiff !== 0) return statusDiff;
  const candidateDiff = left.candidate_count - right.candidate_count;
  if (candidateDiff !== 0) return candidateDiff;
  return left.source_group.localeCompare(right.source_group);
}

function incrementCount(counts, key) {
  counts[key] = (counts[key] || 0) + 1;
}

function canPromoteToMain(candidate, reportDate = "", context = {}) {
  return !mainRejectReason(candidate, { ...context, reportDate });
}

function canPromoteToMainRefill(candidate, meta = {}, reportDate = "") {
  const sourceLevel = sourceLevelForCandidate(candidate);
  if (candidate.category === "builder_observation") {
    return hasMainRefillOperationalSignal(candidate, meta) && hasSubstantialMainRefillEvidence(candidate, meta);
  }
  if (candidate.category === "project") {
    return hasMainRefillOperationalSignal(candidate, meta);
  }
  if (candidate.category === "hot_blog") {
    return canPromoteToHotBlog(candidate, reportDate) ||
      canUseLowRiskPrimaryRequiredIntermediaryAsMain(candidate, meta) ||
      hasMainRefillOperationalSignal(candidate, meta);
  }
  if (sourceLevel === "paper" || sourceLevel === "paper_api") {
    return canUseLowRiskPrimaryRequiredIntermediaryAsMain(candidate, meta) ||
      hasEvidenceBackedPaperMainRefill(candidate, meta);
  }
  if (canUseLowRiskPrimaryRequiredIntermediaryAsMain(candidate, meta)) {
    return true;
  }
  if (isChineseInterviewMainRefill(candidate)) {
    return true;
  }
  if (candidate.category === "community_lead") {
    return hasMainRefillOperationalSignal(candidate, meta) && hasSubstantialMainRefillEvidence(candidate, meta);
  }
  return hasMainRefillOperationalSignal(candidate, meta) && hasSubstantialMainRefillEvidence(candidate, meta);
}

function mainRefillStage(candidate, meta = {}, reportDate = "") {
  const sourceLevel = sourceLevelForCandidate(candidate);
  if (candidate.category === "project" || sourceLevel === "github") {
    return "refill_github";
  }
  if (candidate.category === "builder_observation") {
    return "refill_builder";
  }
  if (candidate.category === "hot_blog") {
    return "refill_hot_blog";
  }
  if (candidate.category === "community_lead") {
    return "refill_community";
  }
  if (
    isPrimaryRequiredIntermediaryMainCandidate(candidate) ||
    canUseLowRiskPrimaryRequiredIntermediaryAsMain(candidate, meta) ||
    isOutsideMainWindowCandidate(candidate, reportDate)
  ) {
    return "refill_window";
  }
  return "refill_weak_signal";
}

function hasEvidenceBackedPaperMainRefill(candidate, meta = {}) {
  const text = mainRefillText(candidate, meta);
  if (!hasSubstantialMainRefillEvidence(candidate, meta)) {
    return false;
  }
  return /\b(ai scientist|scientific discovery|discovery systems?|agent workflow|agents?|workflow|evaluation|eval|tool|tools?|developer|architecture|framework|search space|model|llm|benchmark|dataset|inference|training|reasoning)\b|科学发现|智能体|工作流|评测|模型|推理|训练|数据集/u.test(text);
}

function isChineseInterviewMainRefill(candidate) {
  const text = mainRefillText(candidate);
  return /VLA不会死|世界模型是未来|智源研究院院长王仲远|世界模型.*具身智能|VLA.*世界模型|世界模型.*VLA/u.test(text);
}

function hasMainRefillOperationalSignal(candidate, meta = {}) {
  const text = mainRefillText(candidate, meta);
  return /\b(agent|agents|workflow|workflows|tool|tools|tooling|developer|developers|engineering|architecture|integration|sdk|api|mcp|hook|hooks|skill|skills|subagent|subagents|eval|evaluation|observability|trace|traces|rollback|release gate|release gates|terminal|guide|practice|practices|example|examples|productivity|deployment|model weights?|usage limits?|enterprise|platform|launch|rollout|availability|funding|raises?|acquisition|acquires?|revenue|valuation|monetization|monetisation|partnership|lawsuit|regulation|video generation|image generation|text[-\s]?to[-\s]?video)\b|智能体|工作流|工具|开发者|工程|架构|集成|评测|观测|链路|回滚|发布门|终端|指南|实践|示例|部署|模型权重|企业|平台|上线|可用|融资|收购|营收|估值|商业化|变现|合作|诉讼|监管|开源|短剧|短视频|视频生成|图像生成|创作者|内容生产/u.test(text);
}

function hasSubstantialMainRefillEvidence(candidate, meta = {}) {
  const detail = [
    candidate?.evidence,
    candidate?.summary,
    candidate?.original_text,
    meta?.description,
    meta?.readme_summary
  ].map((value) => String(value || "").trim()).filter(Boolean).join(" ");
  return stripDraftPublicBodyNoise(detail, candidate).length >= 80;
}

function mainRefillText(candidate, meta = {}) {
  return [
    candidateText(candidate),
    meta?.description,
    meta?.readme_summary
  ].map((value) => String(value || "")).join(" ");
}

function mainRejectReason(candidate, options = {}) {
  const reportDate = options.reportDate || "";
  const recentMainUrlHistory = options.recentMainUrlHistory || new Map();
  const meta = options.meta || {};
  if (!candidate || typeof candidate !== "object") return "invalid_candidate";
  if (!candidate.url) return "missing_url";
  if (!hasReaderVisibleTitle(candidate)) return "missing_reader_visible_title";
  if (isTemplatedStoryTitleCandidate(candidate)) return "templated_story_title";
  if (isFutureDatedCandidate(candidate, reportDate)) return "future_dated";
  if (isOutsideMainWindowCandidate(candidate, reportDate)) return "outside_main_window";
  if (!isFreshForMainItems(candidate, recentMainUrlHistory)) return "recent_duplicate";
  if (isStatuspageCandidate(candidate)) return "statuspage";
  if (isSearchShadowCandidate(candidate)) return "search_shadow";
  // Hugging Face model-registry trending entries belong only to the
  // huggingface_trending section; they are repository-popularity signals, not
  // news, and must never fill the main story stream.
  if (candidate.category === "huggingface_trending") return "huggingface_trending_lane";
  if (isUnresolvedAggregatorMainCandidate(candidate)) return "unverified_aggregator_lead";
  if (isPrimaryRequiredIntermediaryMainCandidate(candidate) && !canUseLowRiskPrimaryRequiredIntermediaryAsMain(candidate, meta)) return "primary_required_intermediary_lead";
  if (isGenericGithubTrendingTextCandidate(candidate, meta)) return "generic_github_trending_text";
  if (isGenericHotBlogAnnouncementCandidate(candidate)) return "generic_hot_blog_announcement";
  if (isPublicFillerMainCandidate(candidate, meta)) return "public_filler_text";
  if (isLowValueProductHuntMainCandidate(candidate)) return "low_value_product_hunt_project";
  if (isLowValueVendorAvailabilityPrCandidate(candidate)) return "low_value_vendor_availability_pr";
  if (isLowValueMainCandidate(candidate)) return "low_value";
  if (isLowValueEventGuideCandidate(candidate)) return "low_value_event_guide";
  if (isLowValueProfileCandidate(candidate)) return "low_value_profile";
  if (isMinorConsumerAiFeatureCandidate(candidate)) return "minor_consumer_ai_feature";
  if (isLowSignalVendorPartnership(candidate)) return "low_signal_vendor_partnership";
  if (candidate.category === "builder_observation" && isLowSignalBuilderMainCandidate(candidate)) return "builder_low_signal";
  if (isHardcoreResearchOnly(candidate)) return "hardcore_research_only";
  if (isCommunitySingleSourceStoryCandidate(candidate)) return "community_single_source_story";
  if (isSecondarySingleSourceStoryCandidate(candidate)) return "secondary_single_source_story";
  if (!hasMainStreamSignal(candidate, meta, reportDate)) return "not_ai_relevant";
  if (isThinMainStreamCandidate(candidate, meta)) return "thin_candidate_detail";
  if (isUnverifiedHighRiskMainCandidate(candidate)) return "unverified_high_risk_claim";
  return "";
}

function isTemplatedStoryTitleCandidate(candidate) {
  const title = String(candidate?.title || "").replace(/\s+/g, "");
  if (!title) {
    return false;
  }
  return isTemplatedStoryTitleText(title);
}

function isTemplatedStoryTitleText(value) {
  const title = String(value || "").replace(/\s+/g, "");
  if (!title) {
    return false;
  }
  return /更新AI产品、平台或工程实践/u.test(title) ||
    /披露模型能力和评估方法更新/u.test(title) ||
    /相关团队更新agent工作流和开发工具能力/u.test(title) ||
    /updates?AIproducts?,?platforms?orengineeringpractices?/i.test(title) ||
    /modelcapabilitiesandevaluationmethodupdates?/i.test(title) ||
    /updates?agentworkflowanddevelopertools?/i.test(title);
}

function isSecondarySingleSourceStoryCandidate(candidate) {
  const sourceLevel = sourceLevelForCandidate(candidate);
  if (sourceLevel !== "intermediary") {
    return false;
  }
  return !hasMultiSourceStoryEvidence(candidate) && !hasPrimaryStoryEvidence(candidate);
}

function isCommunitySingleSourceStoryCandidate(candidate) {
  const sourceLevel = String(candidate?.source_level || sourceLevelForCandidate(candidate)).trim();
  if (sourceLevel !== "community" && sourceLevel !== "original_social") {
    return false;
  }
  return !hasMultiSourceStoryEvidence(candidate) && !hasPrimaryStoryEvidence(candidate);
}

function hasMultiSourceStoryEvidence(candidate) {
  if (sourceLevelForCandidate(candidate) === "multi_source" || candidate.verification_status === "multi_source_confirmed") {
    return true;
  }
  const sources = Array.isArray(candidate.verification_sources) ? candidate.verification_sources : [];
  const urls = new Set(sources.map((url) => normalizeUrl(url)).filter(Boolean));
  return urls.size >= 2;
}

function hasPrimaryStoryEvidence(candidate) {
  if (PRIMARY_STATUSES.has(candidate.verification_status) && TRUSTED_PRIMARY_SOURCE_LEVELS.has(sourceLevelForCandidate(candidate))) {
    return true;
  }
  const primaryUrl = normalizeUrl(candidate.primary_url);
  const ownUrl = normalizeUrl(candidate.url);
  return Boolean(primaryUrl && primaryUrl !== ownUrl);
}

function hasMainStreamSignal(candidate, meta = {}, reportDate = "") {
  const text = `${candidateText(candidate)} ${meta.description || ""} ${meta.readme_summary || ""}`;
  return isAiRelevantCandidate(candidate) ||
    isAigcCandidate(candidate) ||
    isReaderRelevantCandidate(candidate) ||
    isMajorMainNewsCandidate(candidate) ||
    isOfficialBlogMainlineCandidate(candidate) ||
    isPublicAiImportantCandidate(candidate) ||
    canPromoteToBuilderObservation(candidate) ||
    canPromoteToCommunityLead(candidate, reportDate) ||
    (PRODUCT_PLATFORM_RE.test(text) && AI_RELEVANCE_RE.test(text));
}

function isPublicFillerMainCandidate(candidate, meta = {}) {
  const text = [
    candidate.title,
    candidate.evidence,
    candidate.notes,
    candidate.summary,
    candidate.original_text,
    meta.description,
    meta.readme_summary
  ].map((value) => String(value || "")).join(" ");
  const hasFiller = /published this blog\/interview entry|latest report listed this entry|use it as a discovery lead|this is an intermediary\/self-media lead|source:\s*third-party report|这条动态主要围绕|来源\s*第三方报道|原文标题为|想象空间|赛道|序号\s*\d+/i.test(text);
  if (!hasFiller) {
    return false;
  }
  if (hasSpecificOfficialTechnicalHotBlogSurface(candidate)) {
    return false;
  }
  const detailText = [
    candidate.evidence,
    candidate.notes,
    candidate.summary,
    candidate.original_text,
    meta.description,
    meta.readme_summary
  ].map((value) => String(value || "")).join(" ");
  const cleaned = stripDraftPublicBodyNoise(detailText, candidate)
    .replace(/\b(?:published this blog\/interview entry|latest report listed this entry|use it as a discovery lead)\b/gi, "")
    .replace(/\bsource:\s*third-party report\b/gi, "")
    .replace(/\bthis is an intermediary\/self-media lead\b/gi, "")
    .replace(/\btrace it to a primary source before treating it as a reported fact\b/gi, "")
    .replace(/\bintermediary_url=\S+/gi, "")
    .replace(/\bsource_report_url=\S+/gi, "")
    .replace(/\bprimary_url=\S+/gi, "")
    .replace(/\bprimary_verification_required\s*=\s*true\b/gi, "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/[（(](?:中文|英文)[)）][。.]?/gu, "")
    .replace(/这条动态主要围绕|来源\s*第三方报道|原文标题为|想象空间|赛道|序号\s*\d+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const title = String(candidate.title || "").replace(/\s+/g, " ").trim();
  const source = String(candidate.source || "").replace(/\s+/g, " ").trim();
  const cleanedWithoutTitle = [title, source]
    .filter(Boolean)
    .reduce((value, part) => value.replace(new RegExp(escapeRegex(part), "gi"), ""), cleaned)
    .replace(/\s+/g, " ")
    .trim();
  if (cleanedWithoutTitle.length < 40) {
    return true;
  }
  if (/published this blog\/interview entry|latest report listed this entry|use it as a discovery lead|primary_verification_required=true|intermediary_url=/i.test(detailText) && cleanedWithoutTitle.length < 80) {
    return true;
  }
  if (cleanedWithoutTitle.length >= 80) {
    return false;
  }
  const cleanedSignalText = `${candidate.title || ""} ${cleanedWithoutTitle}`;
  return !(
    AI_RELEVANCE_RE.test(cleanedSignalText) &&
    (PRODUCT_PLATFORM_RE.test(cleanedSignalText) || PLAIN_READER_SIGNAL_RE.test(cleanedSignalText) || BUILDER_RELEVANCE_RE.test(cleanedSignalText))
  );
}

function isGenericHotBlogAnnouncementCandidate(candidate) {
  if (!candidate || candidate.category !== "hot_blog") {
    return false;
  }
  return !hasConcreteHotBlogMaterial(candidate);
}

function isUnresolvedAggregatorMainCandidate(candidate) {
  const sourceUrlText = [
    candidate?.source,
    candidate?.source_id,
    candidate?.url,
    candidate?.intermediary_url
  ].filter(Boolean).join(" ");
  if (!/(google news|news\.google\.com)/i.test(sourceUrlText)) {
    return false;
  }
  if (candidate.verification_status && candidate.verification_status !== "intermediary_only") {
    return false;
  }
  const verificationUrls = [
    candidate.primary_url,
    ...(Array.isArray(candidate.verification_sources) ? candidate.verification_sources : [])
  ].filter(Boolean);
  return !verificationUrls.some((value) => !/(google news|news\.google\.com)/i.test(String(value)));
}

function isPrimaryRequiredIntermediaryMainCandidate(candidate) {
  const verificationStatus = String(candidate?.verification_status || "").toLowerCase();
  if (verificationStatus && verificationStatus !== "intermediary_only") {
    return false;
  }
  const text = [
    candidate?.evidence,
    candidate?.notes,
    candidate?.verification_note,
    candidate?.risk_note
  ].filter(Boolean).join(" ");
  if (!/primary_verification_required\s*=\s*true|trace it to a primary source|trace to a primary source|requires primary verification/i.test(text)) {
    return false;
  }
  const primaryUrls = [
    candidate?.primary_url,
    ...(Array.isArray(candidate?.verification_sources) ? candidate.verification_sources : [])
  ].filter(Boolean);
  const intermediaryUrl = String(candidate?.intermediary_url || candidate?.url || "");
  const hasNonIntermediaryPrimaryUrl = primaryUrls.some((value) => {
    const url = String(value || "");
    return url && normalizeUrlIdentity(url) !== normalizeUrlIdentity(intermediaryUrl);
  });
  return !hasNonIntermediaryPrimaryUrl;
}

function canUseLowRiskPrimaryRequiredIntermediaryAsMain(candidate, meta = {}) {
  if (!candidate || typeof candidate !== "object") {
    return false;
  }
  if (isUnverifiedHighRiskMainCandidate(candidate)) {
    return false;
  }
  if (isPublicFillerMainCandidate(candidate, meta) || isGenericHotBlogAnnouncementCandidate(candidate)) {
    return false;
  }
  if (isLowValueMainCandidate(candidate) || isLowValueEventGuideCandidate(candidate) || isLowValueProfileCandidate(candidate)) {
    return false;
  }
  if (candidate.category === "builder_observation" && isLowSignalBuilderMainCandidate(candidate)) {
    return false;
  }

  const text = [
    candidateText(candidate),
    meta.description,
    meta.readme_summary
  ].map((value) => String(value || "")).join(" ");
  const hasAiSurface = AI_RELEVANCE_RE.test(text) || PRODUCT_PLATFORM_RE.test(text) || BUILDER_RELEVANCE_RE.test(text);
  if (!hasAiSurface) {
    return false;
  }
  const hasConcreteLowRiskSurface = /\b(agent|agents|workflow|workflows|tool|tools|tooling|developer|developers|engineering|architecture|integration|sdk|api|mcp|hook|hooks|skill|skills|subagent|subagents|eval|evaluation|observability|trace|traces|rollback|release gate|release gates|terminal|guide|practice|practices|example|examples|productivity|deployment|docs?|tutorial)\b|智能体|工作流|工具|开发者|工程|架构|集成|评测|观测|链路|回滚|发布门禁|终端|指南|实践|示例|部署/u.test(text);
  if (!hasConcreteLowRiskSurface) {
    return false;
  }
  return true;
}

function isLowValueProductHuntMainCandidate(candidate) {
  const sourceText = `${candidate?.source || ""} ${candidate?.source_id || ""} ${candidate?.url || ""} ${candidate?.notes || ""}`;
  if (!/product\s*hunt|product-hunt/i.test(sourceText)) {
    return false;
  }
  const text = candidateText(candidate);
  if (isAigcCandidate(candidate) || AI_RELEVANCE_RE.test(text)) {
    return false;
  }
  return true;
}

function isLowSignalBuilderMainCandidate(candidate) {
  const text = candidateText(candidate);
  if (!text || BUILDER_IRRELEVANT_RE.test(text)) return true;
  if (BUILDER_LOW_SIGNAL_RE.test(text)) return true;
  if (!candidate.url && !candidate.original_url) return true;
  return !BUILDER_RELEVANCE_RE.test(text);
}

function isGenericGithubTrendingTextCandidate(candidate, meta = {}) {
  const githubLike = /github/i.test(`${candidate.source || ""} ${candidate.source_id || ""} ${candidate.url || ""}`);
  if (!githubLike) {
    return false;
  }
  const candidateTextOnly = [
    candidate.title,
    candidate.evidence,
    candidate.notes,
    candidate.summary
  ].map((value) => String(value || "")).join(" ");
  const auditOnlyCandidateText =
    /today entered github trending top 10|entered github trending top 10|appeared on github trending(?:\s+[a-z0-9+#.-]+)?\s+(?:daily|weekly).*?(?:stars?|this week|today)|github_trending_history=seen_|source:\s*third-party report|sequence\s+\d+|今天进入\s*GitHub Trending Top 10|近\s*7\s*天本地记录|需要复核它是否仍在\s*GitHub Trending|是否有\s*release\/commit\s*或\s*star velocity|来源\s*第三方报道|这条动态主要围绕|序号\s*\d+/i.test(candidateTextOnly);
  if (auditOnlyCandidateText) {
    return true;
  }
  const text = [
    candidate.title,
    candidate.evidence,
    candidate.notes,
    candidate.summary,
    meta.description,
    meta.readme_summary
  ].map((value) => String(value || "")).join(" ");
  const genericRankText = /today entered github trending top 10|entered github trending top 10|appeared on github trending(?:\s+[a-z0-9+#.-]+)?\s+(?:daily|weekly)|github trending top 10|github_trending_history=seen_|source:\s*third-party report|sequence\s+\d+|今天进入\s*GitHub Trending Top 10|近\s*7\s*天本地记录|需要复核它是否仍在\s*GitHub Trending|是否有\s*release\/commit\s*或\s*star velocity|来源\s*第三方报道|这条动态主要围绕|序号\s*\d+/i.test(text);
  if (!genericRankText) {
    return false;
  }
  const meaningfulText = `${candidate.evidence || ""} ${candidate.summary || ""} ${meta.description || ""} ${meta.readme_summary || ""}`;
  return !/(readme|\bagent\b|\bmodel\b|\brag\b|\beval\b|\bworkflow\b|\btool\b|\bmcp\b|\binference\b|\bdeployment\b|\bexample\b|\bsdk\b|\bapi\b|\bframework\b|\bruntime\b|\bdataset\b|\bretrieval\b|\borchestration\b|\bobservability\b|\bbenchmark\b|\bvideo\b|\bimage\b|\baudio\b|\bgenerative\b|生成|模型|智能体|工作流|工具|评测|检索|部署)/i.test(meaningfulText);
}

function isThinMainStreamCandidate(candidate, meta = {}) {
  const detail = [
    candidate.evidence,
    candidate.summary,
    candidate.original_text,
    meta.description,
    meta.readme_summary
  ].map((value) => String(value || "").trim()).filter(Boolean).join(" ");
  if (detail.length >= 40) {
    return false;
  }
  const text = `${candidate.title || ""} ${detail}`;
  if (AI_RELEVANCE_RE.test(text) && (PRODUCT_PLATFORM_RE.test(text) || PLAIN_READER_SIGNAL_RE.test(text))) {
    return false;
  }
  return true;
}

function isUnverifiedHighRiskMainCandidate(candidate) {
  const sourceLevel = sourceLevelForCandidate(candidate);
  const primaryVerified = PRIMARY_STATUSES.has(candidate.verification_status) && TRUSTED_PRIMARY_SOURCE_LEVELS.has(sourceLevel);
  if (primaryVerified) {
    return false;
  }
  const text = candidateText(candidate);
  return /\b(funding|raised|valuation|ipo|go public|acquisition|revenue|earnings|profit|pricing|price|benchmark|outperform|faster than|slower than|accuracy|leaderboard|safety|regulation|policy|lawsuit|ban|security|vulnerability|attack|government|minister|capability|capabilities|suspend(?:s|ed)? access|model access|access to new models|new model capabilities)\b|\b\d+(?:\.\d+)?x\s+faster\b|\$[\d,.]+\s*(?:m|b|million|billion)?|融资|估值|上市|收购|营收|财报|定价|价格|基准|跑分|安全|监管|政策|诉讼|禁令|漏洞|攻击|政府/u.test(text);
}

function canPromoteToMainStrict(candidate, reportDate = "") {
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
  const publicImportant = isPublicAiImportantCandidate(candidate);
  const officialBlogMainline = isOfficialBlogMainlineCandidate(candidate);
  if (!hasReaderVisibleTitle(candidate)) return false;
  if (isFutureDatedCandidate(candidate, reportDate)) return false;
  const allowReaderRelevantCompanySignal =
    readerRelevant &&
    (sourceLevel === "official_company_news" || (majorMainNews && TRUSTED_PRIMARY_SOURCE_LEVELS.has(sourceLevel)));
  if (!isAiRelevantCandidate(candidate) && !isAigcCandidate(candidate) && !allowReaderRelevantCompanySignal && !officialBlogMainline && !publicImportant) return false;
  if (!readerRelevant && !publicImportant) return false;
  if (candidate.verification_status && !PRIMARY_STATUSES.has(candidate.verification_status)) return false;
  if (isLowSignalVendorPartnership(candidate)) return false;
  if (isBlogLikeCandidate(candidate) && !majorMainNews && !READER_RELEVANT_SOURCE_LEVELS.has(sourceLevel) && !officialBlogMainline && !publicImportant) return false;
  if (candidate.category === "hot_blog" && !["official", "paper", "github", "multi_source"].includes(sourceLevel)) {
    return false;
  }
  const trustedSourceLevel = TRUSTED_PRIMARY_SOURCE_LEVELS.has(sourceLevel);
  return trustedSourceLevel && (!candidate.verification_status || PRIMARY_STATUSES.has(candidate.verification_status));
}

function isOfficialBlogMainlineCandidate(candidate) {
  const sourceLevel = sourceLevelForCandidate(candidate);
  const chinaAiHotBlog = isChinaAiSourceLaneCandidate(candidate) && isChineseHotBlogCandidate(candidate);
  if (sourceLevel !== "official") return false;
  if (!isBlogLikeCandidate(candidate)) return false;
  if (!hasPlainReaderSignal(candidate)) return false;
  if (!hasConcreteHotBlogMaterial(candidate) && !chinaAiHotBlog) return false;
  if (isLowValueMainCandidate(candidate)) return false;
  if (isMinorConsumerAiFeatureCandidate(candidate)) return false;
  if (isLowSignalVendorPartnership(candidate)) return false;

  const category = candidate.editorial_category || inferredEditorialCategory(candidate);
  const mainlineText = `${candidate.title || ""} ${candidate.evidence || ""} ${candidate.summary || ""}`.toLowerCase();
  const titleText = `${candidate.title || ""}`.toLowerCase();
  const negatedSurfaceRe = /\b(no|not|without|rather than)\b.{0,48}\b(product|availability|launch|release|pricing|rollout|feature|update)\b/;
  const platformSignalRe = /\b(workflow|developer|enterprise|availability|pricing|quota|open source|session|platform|cloud|app|service|product|launch|rollout|api|sdk|hosting|hosted|permissions?|reliability|framework|feature|version|production-ready|runtime|workspace|gateway|observability|microvm|cloud computer|source finding|version history|cli|litetopic|agentcore)\b|工作流|开发者|企业|可用|价格|配额|开源|会话|平台|云|产品|上线|接口|权限|可靠性|框架|功能|版本|生产可用|运行时|工作区|观测|版本历史/u;
  const concreteSurfaceRe = /\b(adds?|added|ships?|shipped|launch(?:es|ed)?|release[sd]?|roll(?:s|ed)? out|available|availability|pricing|quota|supports?|supporting|hosting|hosted|permissions?|reliability|framework|feature|features|version|production-ready|runtime|workspace|gateway|observability|microvm|persistent workspace|tool access|open source|cloud computer|source finding|version history|session persistence|litetopic|agentcore|v\d+(?:\.\d+)+|\d+\.\d+)\b|新增|发布|上线|可用|价格|配额|支持|托管|权限|可靠性|框架|功能|版本|生产可用|运行时|工作区|观测|开源|版本历史/u;
  const abstractEssayTitleRe = /\b(dilemma|how to|guide|lessons?|tips|analysis|overview|improvement|best practices?)\b|困境|指南|经验|技巧|分析|概览|优化|最佳实践/u;
  const deepDiveOnlyRe = /\b(reasoning|benchmark|inference|throughput|latency|accuracy|eval|evaluation|ablation|reasoning quality|efficiency details?|ontology|dependency modeling|token consumption)\b|推理|评测|基准|吞吐|延迟|准确率|消融|依赖建模|token 成本/u;
  const allowedCategories = new Set(["company_business", "product_radar", "open_source", "engineering_toolchain", "content_aigc", "ai_industry"]);

  if (!allowedCategories.has(category) && !PRODUCT_PLATFORM_RE.test(mainlineText)) {
    return false;
  }
  if (negatedSurfaceRe.test(mainlineText) && !/(launch(?:es|ed)?|release[sd]?|available now|now available|pricing starts?|roll(?:s|ed)? out|open[-\s]?source[sd]?)/.test(mainlineText)) {
    return false;
  }
  if (!platformSignalRe.test(mainlineText)) {
    return false;
  }
  if (!concreteSurfaceRe.test(mainlineText)) {
    return false;
  }
  if (abstractEssayTitleRe.test(titleText) && !/(availability|pricing|quota|platform|service|api|sdk|hosting|hosted|framework|feature|version|open source|cloud computer|source finding|version history|litetopic|agentcore|可用|价格|配额|平台|服务|接口|托管|框架|功能|版本|开源|版本历史)/u.test(mainlineText)) {
    return false;
  }
  if (deepDiveOnlyRe.test(mainlineText) && !/(workflow|availability|pricing|quota|session|platform|service|api|sdk|hosting|hosted|permissions?|reliability|framework|feature|version|production-ready|cloud computer|source finding|version history|cli|agentcore|litetopic|工作流|可用|价格|配额|会话|平台|服务|接口|托管|权限|可靠性|框架|功能|版本|生产可用|版本历史)/u.test(mainlineText)) {
    return false;
  }
  return true;
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

function canFallbackToChinaAiHotBlog(candidate, reportDate = "") {
  if (!isChinaAiSourceLaneCandidate(candidate)) return false;
  if (!isChineseHotBlogCandidate(candidate)) return false;
  if (candidate.category !== "hot_blog" && !isBlogLikeCandidate(candidate)) return false;
  if (isFutureDatedCandidate(candidate, reportDate)) return false;
  if (isStatuspageCandidate(candidate)) return false;
  if (isSearchShadowCandidate(candidate)) return false;
  if (isLowSignalVendorPartnership(candidate)) return false;
  if (candidate.verification_status && !PRIMARY_STATUSES.has(candidate.verification_status)) return false;
  return TRUSTED_PRIMARY_SOURCE_LEVELS.has(sourceLevelForCandidate(candidate));
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
  score += strategicCoreOfficialScore(candidate);
  if (isOverrepresentedInfraVendorCandidate(candidate)) score -= 35;
  if (candidate.category === "main_item") score += 10;
  if (candidate.category === "hot_blog") score += 6;
  if (candidate.category === "community_lead" && hasCommunityImage) score += 12;
  if (candidate.category === "community_lead" && sourceLevel === "intermediary") score += 4;
  if (isBlogLikeCandidate(candidate) && /weekly|newsletter|substack|hugging face|huggingface|latent\.space/i.test(`${candidate.source || ""} ${candidate.url || ""}`.toLowerCase())) score += 8;
  if (candidate.category === "hot_blog" && hasConcreteHotBlogMaterial(candidate)) score += 18;
  if (candidate.editorial_category === "company_business") score += 10;
  if (candidate.editorial_category === "product_radar" || candidate.editorial_category === "open_source") score += 8;
  if (isReaderRelevantCandidate(candidate)) score += 6;
  score += publicImportanceScore(candidate);
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
  if (isOriginalModelLaunchCandidate(candidate)) score += 120;
  if (isModelAvailabilityDuplicateCandidate(candidate)) score -= 90;
  if (/openai|anthropic|deepmind|google|meta|microsoft|qwen|zhipu|deepseek|bytedance|tencent|minimax|moonshot|kimi|alibaba|meituan|runway|pika|luma|kling|adobe/i.test(`${candidate.source} ${candidate.title}`)) score += 5;
  if (isSpecificStrategicOfficialCandidate(candidate)) score += 30;
  if (isGenericOfficialPlatformUpdateCandidate(candidate)) score -= 80;
  if (isLowValueMainCandidate(candidate)) score -= 40;
  return score;
}

function compareMainCandidates(left, right) {
  const publicDiff = mainCandidateScore(right) - mainCandidateScore(left);
  if (publicDiff !== 0) return publicDiff;
  const fallbackDiff = candidateScore(right) - candidateScore(left);
  if (fallbackDiff !== 0) return fallbackDiff;
  return String(left.title || "").localeCompare(String(right.title || ""));
}

function mainCandidateScore(candidate) {
  let score = candidateScore(candidate);
  score += publicNewsSalienceScore(candidate) * 2;
  if (isStrategicCoreOfficialCandidate(candidate)) {
    score += 160;
  }
  if (isOverrepresentedInfraVendorCandidate(candidate)) {
    score -= 80;
  }
  if (isOriginalModelLaunchCandidate(candidate)) {
    score += 220;
  }
  if (isModelAvailabilityDuplicateCandidate(candidate)) {
    score -= 160;
  }
  if (isNarrowEngineeringDeepDiveCandidate(candidate) && !isMajorMainNewsCandidate(candidate)) {
    score -= 30;
  }
  return score;
}

function isOriginalModelLaunchCandidate(candidate) {
  const topicKey = modelLaunchTopicKey(candidate);
  if (!topicKey) {
    return false;
  }
  const sourceText = `${candidate.source || ""} ${candidate.source_id || ""} ${candidate.url || ""}`.toLowerCase();
  const text = candidateText(candidate).toLowerCase();
  if (topicKey === "model:claude-fable-5-mythos-5") {
    return /anthropic|claude/.test(sourceText) &&
      /(fable\s*5|mythos\s*5)/.test(text) &&
      /(same underlying model|mythos-class|safe for general use|trusted access|safeguards|claude fable 5 and claude mythos 5)/.test(text);
  }
  const originalProviderRe = /openai|anthropic|google|deepmind|xai|x\.ai|mistral|qwen|alibaba|deepseek|minimax|moonshot|kimi|meta|nvidia|adobe|runway|pika|luma|kling/;
  const platformOnlyRe = /aws|amazon|bedrock|azure|microsoft|foundry|github|copilot|vertex|google cloud|sagemaker|openrouter/;
  return originalProviderRe.test(sourceText) && !platformOnlyRe.test(sourceText) && /\b(launch|release|introduc|announc|new model|model card)\b/i.test(text);
}

function isModelAvailabilityDuplicateCandidate(candidate) {
  if (!modelLaunchTopicKey(candidate)) {
    return false;
  }
  if (isOriginalModelLaunchCandidate(candidate)) {
    return false;
  }
  const text = `${candidateText(candidate)} ${candidate.source || ""} ${candidate.source_id || ""} ${candidate.url || ""}`.toLowerCase();
  return /\b(available|availability|now available|launches in|comes to|on bedrock|in bedrock|copilot|foundry|azure|aws|amazon|microsoft|github|sagemaker|vertex|google cloud)\b/.test(text);
}

function publicNewsSalienceScore(candidate) {
  const text = candidateText(candidate);
  const sourceText = `${candidate.source || ""} ${candidate.source_id || ""} ${candidate.url || ""}`;
  const combined = `${text} ${sourceText}`;
  let score = 0;
  if (isStrategicCoreOfficialCandidate(candidate)) {
    score += 180;
  }
  if (isOverrepresentedInfraVendorCandidate(candidate)) {
    score -= 40;
  }
  const entityWeights = [
    [/openai|chatgpt|gpt-|anthropic|claude|google|deepmind|gemini|microsoft|meta\b|llama\b|alibaba|qwen|tencent|bytedance|byte\s*dance|kimi|moonshot|minimax|zhipu|deepseek|meituan/i, 170],
    [/apple|siri|apple intelligence|wwdc|xai|x\.ai|adobe|mistral/i, 105],
    [/nvidia|blackwell|cuda|nvfp|amazon|aws|github/i, 65]
  ];
  const matchedEntity = entityWeights.find(([pattern]) => pattern.test(combined));
  if (matchedEntity) {
    score += matchedEntity[1];
  }
  if (/wwdc|siri|apple intelligence|chatgpt|gpt-|blackwell|cuda|nvfp|frontier model|foundation model/i.test(combined)) {
    score += 24;
  }
  if (/launch|release|rollout|available|availability|pricing|price|api|sdk|model|benchmark|leaderboard|regulation|policy|lawsuit|funding|acquisition|earnings|revenue/i.test(combined)) {
    score += 20;
  }
  if (/newsroom|news rss|press|official|keyword blog|developer blog/i.test(sourceText)) {
    score += 8;
  }
  if (isNarrowEngineeringDeepDiveCandidate(candidate)) {
    score -= 18;
  }
  return score;
}

function isNarrowEngineeringDeepDiveCandidate(candidate) {
  const text = candidateText(candidate);
  const sourceText = `${candidate.source || ""} ${candidate.source_id || ""} ${candidate.url || ""}`;
  if (!/blog|developer|machine-learning|devblogs|engineering|architecture|technical/i.test(sourceText)) {
    return false;
  }
  if (/wwdc|siri|apple intelligence|chatgpt|gpt-|frontier model|blackwell|launch|release|rollout|pricing|available|availability|benchmark|regulation|lawsuit|funding|acquisition|earnings|revenue/i.test(text)) {
    return false;
  }
  return /tutorial|guide|how to|deep dive|case study|reference architecture|cross[-\s]?region|session isolation|workflow|lite[-\s]?topic|tokenmaxxing|hosting coding agents/i.test(text);
}

function isGitHubTrendingCandidate(candidate, meta = {}) {
  return Boolean(
    meta.repo ||
    /github trending/i.test(`${candidate.source || ""} ${candidate.evidence || ""} ${candidate.notes || ""}`) ||
    /github[-_]trending|github-github-trending/i.test(candidate.source_id || "")
  );
}

function publicGithubTrendingCandidates(candidates) {
  const weeklyAllLanguage = candidates
    .filter(({ candidate, meta }) => isWeeklyAllLanguageGithubTrending(candidate, meta))
    .sort(compareGithubSourceRank)
    .slice(0, 10);
  const languagePools = GITHUB_TRENDING_LANGUAGE_SCOPES.map((language) => candidates
    .filter(({ candidate, meta }) => isWeeklyLanguageGithubTrending(candidate, meta, language))
    .sort(compareGithubSourceRank)
    .slice(0, 10));
  const weeklyRanked = [
    ...weeklyAllLanguage,
    ...roundRobinGithubLanguagePools(languagePools)
  ];
  if (weeklyRanked.length > 0) {
    return dedupeRankedGithubCandidates(weeklyRanked, GITHUB_TRENDING_TARGET);
  }
  return dedupeRankedGithubCandidates(candidates.sort(compareGithubSourceRank), GITHUB_TRENDING_TARGET);
}

function isWeeklyAllLanguageGithubTrending(candidate, meta = {}) {
  const source = `${candidate.source || ""} ${candidate.source_id || ""} ${candidate.source_url || ""} ${meta.source_url || ""} ${candidate.url || ""}`.toLowerCase();
  const window = String(meta.window || candidate.window || "").toLowerCase();
  const sourceLooksWeekly = source.includes("trending?since=weekly") || source.includes("github trending weekly") || source.includes("github-trending-weekly");
  const languageFilteredSource = /github\.com\/trending\/[^?\s]+/.test(source) || /github trending (python|typescript|javascript|go|rust|java|c\+\+|c#|php|ruby|swift|kotlin|scala) weekly/.test(source);
  const language = String(meta.language || candidate.language || "").toLowerCase();
  return sourceLooksWeekly && (window === "weekly" || sourceLooksWeekly) && !languageFilteredSource && (!language || language === "all");
}

function isWeeklyLanguageGithubTrending(candidate, meta = {}, language) {
  const source = `${candidate.source || ""} ${candidate.source_id || ""} ${candidate.source_url || ""} ${meta.source_url || ""}`.toLowerCase();
  const window = String(meta.window || candidate.window || "").toLowerCase();
  const itemLanguage = String(meta.language || candidate.language || "").toLowerCase();
  const sourceMatches = source.includes(`github trending ${language} weekly`) ||
    source.includes(`github-trending-${language}-weekly`) ||
    source.includes(`github.com/trending/${language}?since=weekly`);
  return (window === "weekly" || sourceMatches) && (itemLanguage === language || sourceMatches);
}

function compareGithubSourceRank(left, right) {
  return rankOf(left.meta, rankOf(left.candidate, 999)) - rankOf(right.meta, rankOf(right.candidate, 999));
}

function roundRobinGithubLanguagePools(pools) {
  const result = [];
  const maxLength = Math.max(0, ...pools.map((pool) => pool.length));
  for (let index = 0; index < maxLength; index += 1) {
    for (const pool of pools) {
      if (pool[index]) {
        result.push(pool[index]);
      }
    }
  }
  return result;
}

function dedupeRankedGithubCandidates(candidates, limit = 10) {
  const seenRepos = new Set();
  const picked = [];
  for (const entry of candidates) {
    const repo = (entry.meta.repo || repoFromUrl(entry.candidate.url) || entry.candidate.title || "").toLowerCase();
    if (repo && seenRepos.has(repo)) continue;
    if (repo) seenRepos.add(repo);
    picked.push(entry);
    if (picked.length >= limit) break;
  }
  return picked;
}

function githubTrendingSourceScope(candidate, meta = {}) {
  const window = String(meta.window || candidate.window || "weekly").toLowerCase() || "weekly";
  const language = String(meta.language || candidate.language || "").toLowerCase();
  return language && language !== "all" ? `${window}:${language}` : `${window}:all`;
}

function isGithubReadmeFetchFailed(item = {}) {
  const status = String(item.readme_fetch_status || item.readme_status || item.readme?.status || "").toLowerCase();
  return /fail|failed|error|unavailable|blocked|timeout/.test(status) || Boolean(item.readme_error);
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

function isLowValueVendorAvailabilityPrCandidate(candidate) {
  if (!candidate || typeof candidate !== "object") {
    return false;
  }
  if (isOriginalModelLaunchCandidate(candidate)) {
    return false;
  }
  const ownerText = candidateSourceOwnerText(candidate);
  if (!VENDOR_MODEL_AVAILABILITY_SOURCE_RE.test(ownerText)) {
    return false;
  }
  if (isStrategicCoreOfficialCandidate(candidate)) {
    return false;
  }
  const text = candidateText(candidate);
  if (!THIRD_PARTY_MODEL_NAME_RE.test(text)) {
    return false;
  }
  if (!VENDOR_MODEL_AVAILABILITY_TEXT_RE.test(text)) {
    return false;
  }
  return true;
}

function strategicCoreOfficialScore(candidate) {
  if (!isStrategicCoreOfficialCandidate(candidate)) {
    return 0;
  }
  const sourceLevel = sourceLevelForCandidate(candidate);
  let score = 120;
  if (sourceLevel === "official_company_news") score += 40;
  if (sourceLevel === "official_open_source_account" || sourceLevel === "official_model_host_account") score += 30;
  if (candidate.category === "hot_blog") score += 20;
  if (isAigcCandidate(candidate)) score += 16;
  return score;
}

function isSpecificStrategicOfficialCandidate(candidate) {
  if (!isStrategicCoreOfficialCandidate(candidate) || isGenericOfficialPlatformUpdateCandidate(candidate)) {
    return false;
  }
  const title = String(candidate?.title || "").replace(/\s+/g, " ").trim();
  if (!title || title.length < 12) {
    return false;
  }
  return !/^(?:official|latest|new)\s+ai\s+(?:platform|product|model|governance)\s+update\b/i.test(title);
}

function isGenericOfficialPlatformUpdateCandidate(candidate) {
  const title = String(candidate?.title || "").replace(/\s+/g, " ").trim();
  return /^official ai platform update\s+\d+$/i.test(title);
}

function isStrategicCoreOfficialCandidate(candidate) {
  if (isOverrepresentedInfraVendorCandidate(candidate)) {
    return false;
  }
  const sourceLevel = sourceLevelForCandidate(candidate);
  if (!TRUSTED_PRIMARY_SOURCE_LEVELS.has(sourceLevel)) {
    return false;
  }
  return STRATEGIC_CORE_SOURCE_RE.test(candidateSourceOwnerText(candidate));
}

function isOverrepresentedInfraVendorCandidate(candidate) {
  return OVERREPRESENTED_INFRA_VENDOR_SOURCE_RE.test(candidateSourceOwnerText(candidate));
}

function candidateSourceOwnerText(candidate) {
  return [
    candidate?.source,
    candidate?.source_id,
    candidate?.source_url,
    candidate?.url,
    candidate?.primary_url
  ].filter(Boolean).join(" ").toLowerCase();
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

function isPublicAiImportantCandidate(candidate) {
  if (isLowValueMainCandidate(candidate) || isLowSignalVendorPartnership(candidate)) {
    return false;
  }
  const sourceLevel = sourceLevelForCandidate(candidate);
  if (!TRUSTED_PRIMARY_SOURCE_LEVELS.has(sourceLevel)) {
    return false;
  }
  const text = candidateText(candidate);
  if (isMajorMainNewsCandidate(candidate)) {
    return true;
  }
  if (!PUBLIC_AI_HEADLINE_ENTITY_RE.test(text)) {
    return false;
  }
  return AI_RELEVANCE_RE.test(text) ||
    AIGC_RE.test(text) ||
    COMPANY_ACTION_RE.test(text) ||
    PRODUCT_PLATFORM_RE.test(text);
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

function publicImportanceScore(candidate) {
  if (!isPublicAiImportantCandidate(candidate)) {
    return 0;
  }
  let score = 18;
  const text = candidateText(candidate);
  if (PUBLIC_AI_HEADLINE_ENTITY_RE.test(text)) score += 8;
  if (isMajorMainNewsCandidate(candidate)) score += 10;
  if (COMPANY_ACTION_RE.test(text)) score += 8;
  if (PRODUCT_PLATFORM_RE.test(text)) score += 8;
  if (/pricing|price|token|api|model|launch|release|availability|funding|acquisition|regulation|policy|lawsuit|earnings|revenue|价格|定价|接口|模型|发布|上线|融资|收购|监管|政策|诉讼|财报|营收/i.test(text)) score += 8;
  return score;
}

export function canPromoteToBuilderObservation(candidate) {
  const text = candidateText(candidate);
  if (!text || BUILDER_IRRELEVANT_RE.test(text)) return false;
  if (!candidate.url && !candidate.original_url) return false;
  const originalText = sanitizeBuilderOriginalText(candidate);
  const readable = hasChineseText(originalText) || Boolean(builderReadableSummary(originalText));
  if (!readable) return false;
  // Curated first-party handles bypass the low-signal and broad-relevance gates
  // (they are noteworthy by curation); basic validity — not spam, has an
  // original URL, and readable text — is still required.
  if (candidate.curated_first_party === true) return true;
  if (BUILDER_LOW_SIGNAL_RE.test(text)) return false;
  if (!BUILDER_RELEVANCE_RE.test(text)) return false;
  return true;
}

function canPromoteToHotBlog(candidate, reportDate = "") {
  const sourceLevel = sourceLevelForCandidate(candidate);
  const isPrimaryLike = TRUSTED_PRIMARY_SOURCE_LEVELS.has(sourceLevel);
  const isDisclosedThirdParty = isPublicThirdPartySignalCandidate(candidate);
  const chinaAiHotBlog = isChinaAiSourceLaneCandidate(candidate) && isChineseHotBlogCandidate(candidate);
  if (!isPrimaryLike && !isDisclosedThirdParty) return false;
  if (candidate.verification_status && !PRIMARY_STATUSES.has(candidate.verification_status) && !isDisclosedThirdParty) return false;
  if (!isAiRelevantCandidate(candidate) && !chinaAiHotBlog) return false;
  if (!isBlogLikeCandidate(candidate)) return false;
  if (!hasConcreteHotBlogMaterial(candidate)) return false;
  if (!hasReaderVisibleTitle(candidate) && !chinaAiHotBlog) return false;
  if (isFutureDatedCandidate(candidate, reportDate)) return false;
  if (isStatuspageCandidate(candidate)) return false;
  if (isSearchShadowCandidate(candidate)) return false;
  if (isLowSignalVendorPartnership(candidate)) return false;
  return true;
}

function isPublicThirdPartySignalCandidate(candidate) {
  const sourceLevel = sourceLevelForCandidate(candidate);
  return PUBLIC_THIRD_PARTY_SOURCE_LEVELS.has(sourceLevel) || isKnownIntermediaryCandidate(candidate);
}

function canPromoteToCommunityLead(candidate, reportDate = "") {
  const sourceLevel = sourceLevelForCandidate(candidate);
  if (candidate.category === "builder_observation") return false;
  if (candidate.category === "project") return false;
  if (!isAiRelevantCandidate(candidate)) return false;
  if (!hasReaderVisibleTitle(candidate)) return false;
  if (isFutureDatedCandidate(candidate, reportDate)) return false;
  if (isSearchShadowCandidate(candidate)) return false;
  if (isGoogleNewsAggregatorCandidate(candidate) && !hasResolvedNonGoogleNewsUrl(candidate)) return false;
  if (isResolvedStatusCandidate(candidate)) return false;
  if (isLowValueResearchLead(candidate, reportDate)) return false;
  if ((sourceLevel === "paper" || sourceLevel === "paper_api") && !hasPlainReaderSignal(candidate)) return false;
  if (isLowValueEventGuideCandidate(candidate)) return false;
  if (isLowValueProfileCandidate(candidate)) return false;
  if (!hasCommunityLeadReaderMaterial(candidate)) return false;
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

function isGoogleNewsAggregatorCandidate(candidate) {
  return /(?:^|[\s-])general-news-google(?:[\s-]|$)|google news|news\.google\.com/i.test(
    `${candidate.source_id || ""} ${candidate.source || ""} ${candidate.url || ""}`
  );
}

function hasResolvedNonGoogleNewsUrl(candidate) {
  const urls = [
    candidate.url,
    candidate.original_url,
    candidate.primary_url,
    candidate.canonical_url,
    ...(Array.isArray(candidate.verification_sources) ? candidate.verification_sources : [])
  ];
  return urls.some((url) => isHttpUrl(url) && !isGoogleNewsUrl(url));
}

function isGoogleNewsUrl(value) {
  try {
    const hostname = new URL(String(value || "")).hostname.toLowerCase();
    return hostname === "news.google.com" || hostname.endsWith(".news.google.com");
  } catch {
    return false;
  }
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
  if (hasSpecificOfficialTechnicalHotBlogSurface(candidate)) {
    return true;
  }
  const evidence = String(candidate.evidence || "").trim();
  if (!evidence || GENERIC_HOT_BLOG_EVIDENCE_RE.test(evidence)) {
    return false;
  }
  if (evidence.length >= 90) {
    return true;
  }
  return /\b(introduces|explains|shows|details|describes|breaks down|designed|workflows?|sessions?|distributed|enterprise|ontology|dependency|methods?|case studies?|benchmarks?|architecture|implementation)\b/i.test(evidence);
}

function hasSpecificOfficialTechnicalHotBlogSurface(candidate) {
  if (!candidate || candidate.category !== "hot_blog") {
    return false;
  }
  if (candidate.verification_status && !PRIMARY_STATUSES.has(candidate.verification_status)) {
    return false;
  }
  const sourceLevel = sourceLevelForCandidate(candidate);
  if (!TRUSTED_PRIMARY_SOURCE_LEVELS.has(sourceLevel)) {
    return false;
  }
  if (!isBlogLikeCandidate(candidate) || !hasReaderVisibleTitle(candidate)) {
    return false;
  }
  if (isStatuspageCandidate(candidate) || isSearchShadowCandidate(candidate)) {
    return false;
  }
  if (isLowValueMainCandidate(candidate) || isLowSignalVendorPartnership(candidate) || isMinorConsumerAiFeatureCandidate(candidate)) {
    return false;
  }
  const sourceText = candidateSourceOwnerText(candidate);
  if (!OFFICIAL_TECHNICAL_BLOG_SOURCE_RE.test(sourceText)) {
    return false;
  }
  if (/hugging\s*face blog|huggingface\.co\/blog/i.test(sourceText) && !HUGGING_FACE_ORG_TECHNICAL_BLOG_URL_RE.test(sourceText)) {
    return false;
  }
  const title = String(candidate.title || "").replace(/\s+/g, " ").trim();
  if (GENERIC_TECHNICAL_BLOG_TITLE_RE.test(title)) {
    return false;
  }
  const surface = [
    title,
    candidate.url,
    candidate.source,
    candidate.source_id
  ].filter(Boolean).join(" ");
  return AI_RELEVANCE_RE.test(surface) && SPECIFIC_TECHNICAL_BLOG_SURFACE_RE.test(surface);
}

function isKnownIntermediaryCandidate(candidate) {
  return INTERMEDIARY_SOURCE_RE.test(`${candidate.source_id || ""} ${candidate.source || ""} ${candidate.url || ""}`);
}

function verifiedStrategicPrimaryUrlText(candidate) {
  if (!PRIMARY_STATUSES.has(candidate?.verification_status)) {
    return "";
  }
  const verificationSources = Array.isArray(candidate?.verification_sources) ? candidate.verification_sources : [];
  const urlText = [
    candidate?.primary_url,
    candidate?.url,
    ...verificationSources
  ].filter(Boolean).join(" ").toLowerCase();
  return STRATEGIC_CORE_SOURCE_RE.test(urlText) ? urlText : "";
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
  const hasVerifiedStrategicPrimaryUrl = Boolean(verifiedStrategicPrimaryUrlText(candidate));
  if (isKnownIntermediaryCandidate(candidate)) {
    return hasVerifiedStrategicPrimaryUrl ? "official" : "intermediary";
  }
  if (candidate.source_level) return candidate.source_level;
  if (hasVerifiedStrategicPrimaryUrl) return "official";
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
  const negatedSurfaceRe = /\b(no|not|without|rather than)\b.{0,48}\b(product|availability|launch|release|pricing|rollout|feature|update)\b/;
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
  if (negatedSurfaceRe.test(text) && !/(launch(?:es|ed)?|release[sd]?|available now|now available|pricing starts?|roll(?:s|ed)? out|open[-\s]?source[sd]?)/.test(text)) {
    return false;
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

function isOutsideMainWindowCandidate(candidate, reportDate = "", windowDays = MAIN_REFILL_WINDOW_DAYS) {
  const candidateDate = dateOnly(candidate?.event_date);
  const baseline = dateOnly(reportDate);
  if (!candidateDate || !baseline) {
    return false;
  }
  return candidateDate < shiftDateOnly(baseline, -windowDays);
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
  const evidenceSummary = mainItemEvidenceSummary(candidate);
  if (evidenceSummary) {
    return ensureChineseSentence(evidenceSummary);
  }
  const lead = chineseLeadForCandidate(candidate);
  const title = displayTitleForCandidate(candidate);
  let fact = stripDraftPublicBodyNoise(lead || genericChineseHeadline(candidate) || genericChineseFact(candidate, null), candidate);
  if (samePublicCopy(fact, title)) {
    fact = mainItemEvidenceDetail(candidate) || mainItemDetail(candidate, category) || genericChineseFact(candidate, null);
  }
  return ensureChineseSentence(fact);
}

function mainItemSpecificSummary(candidate) {
  const text = candidateText(candidate).toLowerCase();
  if (/\b(?:claude\s*)?(?:fable|mythos)\s*5\b/.test(text)) {
    return "Anthropic 发布 Claude Fable 5 和 Claude Mythos 5：Fable 5 是面向通用使用开放的 Mythos-class 安全版，Mythos 5 是同一底层模型的可信访问版本，差别主要在安全限制和访问范围。";
  }
  if (/whatsapp.*spyware|spyware.*whatsapp|nso/.test(text)) {
    return "WhatsApp 披露其拦截了一轮与 NSO 相关的定向钓鱼攻击，公开信息主要集中在攻击归因、拦截动作和受影响范围说明。";
  }
  return "";
}

function mainItemEvidenceSummary(candidate) {
  const text = candidateText(candidate).toLowerCase();
  if (/security new features in may 2026|alibaba cloud security products targeting international markets/.test(text)) {
    return "这篇阿里云博客按产品线汇总 2026 年 5 月安全产品更新，重点是面向国际市场的安全能力变化";
  }
  if (/automating daily outlook email summarization with hermesagent|outlook email.*hermesagent|hermesagent.*outlook email/.test(text)) {
    return "文章演示在 Alibaba Cloud ECS 上用 HermesAgent 自动汇总 Outlook 邮件，把邮件处理接入云端 agent 工作流";
  }
  if (/cut checkpoint costs.*nvidia nvcomp|periodic checkpoints|model weights.*optimizer states.*gradients|optimizer states.*gradients/.test(text)) {
    return "NVIDIA 文章把训练检查点成本压缩落到 nvCOMP 和约 30 行 Python 代码，关注权重、优化器状态和梯度快照的存储开销";
  }
  if (/claude code guide 2026|25 features.*examples.*demo|claude\.md|subagents|hooks.*mcp|mcp.*auto mode/.test(text)) {
    return "这篇指南把 Claude Code 拆成 CLAUDE.md、skills、subagents、hooks、MCP 和 Auto Mode 等功能，并配示例和演示";
  }
  if (/agent evaluation practices|tool traces|replayable failures|release gates|human rollback|deployment checklists?/.test(text)) {
    return "文章比较 agent 评测实践，把 tool traces、可复现失败、release gates、人工回滚和部署检查清单放在同一条上线流程里";
  }
  if (/self-revising discovery systems|genuine scientific discovery is not answer generation|change in the search space/.test(text)) {
    return "这篇论文把科学发现定义为搜索空间本身的改变，讨论 AI scientist 如何在无人提示时识别这种转变";
  }
  if (/vla.*世界模型|世界模型.*vla|智源研究院院长王仲远|world model.*embodied|embodied.*world model/.test(text)) {
    return "36Kr 专访围绕具身智能短板、VLA 与世界模型关系展开，核心是机器人是否能补上物理规律和因果预测能力";
  }
  const chinese = firstReaderChineseEvidence(candidate);
  if (chinese && !samePublicCopy(chinese, comparableTitleForCandidate(candidate))) {
    return stripSentenceEnding(trimText(chinese, 160));
  }
  const english = firstReaderEnglishEvidence(candidate);
  const englishSummary = englishEvidenceSummary(candidate, english);
  if (englishSummary && !samePublicCopy(englishSummary, comparableTitleForCandidate(candidate))) {
    return stripSentenceEnding(trimText(englishSummary, 160));
  }
  return "";
}

function mainItemEvidenceDetail(candidate) {
  const text = candidateText(candidate).toLowerCase();
  if (/security new features in may 2026|alibaba cloud security products targeting international markets/.test(text)) {
    return "原文按产品线列出 5 月功能变化，适合安全团队核对国际站控制台、检测和防护能力";
  }
  if (/automating daily outlook email summarization with hermesagent|outlook email.*hermesagent|hermesagent.*outlook email/.test(text)) {
    return "流程把邮件读取、摘要和云端执行环境连起来，适合评估企业邮箱 agent 的权限和部署边界";
  }
  if (/cut checkpoint costs.*nvidia nvcomp|periodic checkpoints|model weights.*optimizer states.*gradients|optimizer states.*gradients/.test(text)) {
    return "它把问题落到训练中断恢复需要保存的权重、优化器状态和梯度快照，关注存储成本而不是单纯压缩口号";
  }
  if (/claude code guide 2026|25 features.*examples.*demo|claude\.md|subagents|hooks.*mcp|mcp.*auto mode/.test(text)) {
    return "内容覆盖项目记忆、技能、子代理、hooks、MCP 和自动模式，适合开发团队评估 Claude Code 的工程化配置面";
  }
  if (/agent evaluation practices|tool traces|replayable failures|release gates|human rollback|deployment checklists?/.test(text)) {
    return "重点是把工具轨迹、可复现失败、发布门禁和人工回滚串起来，避免 agent 直接进入无人值守生产环境";
  }
  if (/self-revising discovery systems|genuine scientific discovery is not answer generation|change in the search space/.test(text)) {
    return "原文把重点放在 AI scientist 能否察觉问题空间已经变化，并用 category-theoretic framework 描述自修正发现系统";
  }
  if (/vla.*世界模型|世界模型.*vla|智源研究院院长王仲远|world model.*embodied|embodied.*world model/.test(text)) {
    return "文章把行业焦虑落到具身智能的物理世界理解能力，讨论世界模型是否能成为补足 VLA 路线短板的方向";
  }
  const chinese = firstReaderChineseEvidence(candidate);
  if (chinese && !samePublicCopy(chinese, comparableTitleForCandidate(candidate))) {
    return stripSentenceEnding(trimText(chinese, 180));
  }
  const english = firstReaderEnglishEvidence(candidate);
  const englishDetail = englishEvidenceDetail(candidate, english);
  if (englishDetail && !samePublicCopy(englishDetail, comparableTitleForCandidate(candidate))) {
    return stripSentenceEnding(trimText(englishDetail, 180));
  }
  return "";
}

function firstReaderChineseEvidence(candidate) {
  for (const field of [candidate.evidence, candidate.summary, candidate.content, candidate.original_text]) {
    const clean = stripDraftPublicBodyNoise(field, candidate);
    if (hasReaderChineseText(clean) && clean.length >= 18) {
      return clean;
    }
  }
  return "";
}

function firstReaderEnglishEvidence(candidate) {
  for (const field of [candidate.evidence, candidate.summary, candidate.content, candidate.original_text]) {
    const clean = stripDraftPublicBodyNoise(field, candidate);
    if (hasReaderEnglishText(clean)) {
      return clean;
    }
  }
  return "";
}

function hasReaderEnglishText(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length < 80 || hasReaderChineseText(text)) {
    return false;
  }
  const words = text.match(/\b[A-Za-z][A-Za-z-]{2,}\b/g) || [];
  if (words.length < 12) {
    return false;
  }
  return !/^(?:intermediary_url|source_report_url|primary_verification_required|https?:\/\/)/i.test(text);
}

function englishEvidenceSummary(candidate, evidence) {
  const text = `${candidateText(candidate)} ${evidence || ""}`.toLowerCase();
  if (/self-revising discovery systems|genuine scientific discovery is not answer generation|change in the search space/.test(text)) {
    return "这篇论文把科学发现定义为搜索空间本身的改变，讨论 AI scientist 如何在无人提示时识别这种转变";
  }
  return englishPublicSummary(candidate);
}

function englishEvidenceDetail(candidate, evidence) {
  const text = `${candidateText(candidate)} ${evidence || ""}`.toLowerCase();
  if (/self-revising discovery systems|genuine scientific discovery is not answer generation|change in the search space/.test(text)) {
    return "原文把重点放在 AI scientist 能否察觉问题空间已经变化，并用 category-theoretic framework 描述自修正发现系统";
  }
  return englishPublicDetail(candidate);
}

function englishPublicHeadline(candidate) {
  const signal = englishPublicSignal(candidate);
  return signal ? signal.headline : "";
}

function englishPublicSummary(candidate) {
  const signal = englishPublicSignal(candidate);
  return signal ? signal.summary : "";
}

function englishPublicDetail(candidate) {
  const signal = englishPublicSignal(candidate);
  return signal ? signal.detail : "";
}

function englishPublicPoint(candidate, rawPoint = "") {
  const signal = englishPublicSignal(candidate);
  if (!signal) {
    return "";
  }
  const pointText = String(rawPoint || "").toLowerCase();
  if (/latency|cold.?start|cost|cache|caching|loading/.test(pointText)) {
    return signal.points.find((point) => /延迟|成本|缓存|加载/u.test(point)) || signal.points[0] || "";
  }
  if (/guardrail|policy|filter|control|safety|observability/.test(pointText)) {
    return signal.points.find((point) => /策略|安全|过滤|观测|控制/u.test(point)) || signal.points[0] || "";
  }
  if (/fraud|transaction|sequence|feature|data/.test(pointText)) {
    return signal.points.find((point) => /交易|数据|序列|特征|反欺诈/u.test(point)) || signal.points[0] || "";
  }
  return signal.points[0] || signal.detail || signal.summary;
}

function englishPublicSignal(candidate) {
  const rawTitle = stripDraftPublicBodyNoise(decodeCommonHtmlEntities(String(candidate.title || "")).replace(/\s+/g, " ").trim(), candidate);
  const rawEvidence = stripDraftPublicBodyNoise([candidate.evidence, candidate.summary, candidate.content, candidate.original_text]
    .map((value) => String(value || "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" "), candidate);
  const joined = `${rawTitle} ${rawEvidence}`.replace(/\s+/g, " ").trim();
  if (!joined || hasReaderChineseText(joined)) {
    return null;
  }
  const words = joined.match(/\b[A-Za-z][A-Za-z-]{2,}\b/g) || [];
  if (words.length < 8) {
    return null;
  }
  const text = joined.toLowerCase();
  const actor = publicActorLabel(candidate);
  const profile = englishSignalProfile(text);
  const headline = `${actor}${profile.verb}${profile.topic}`;
  const summary = `${actor}${profile.verb}${profile.topic}，重点包括${profile.scope}，使用前提是${profile.boundary}`;
  const detail = `${profile.topic}对应${profile.scope}，可核对事实包括${profile.factFocus}`;
  const points = [
    `核心变化围绕${profile.topic}，范围包括${profile.scope}`,
    `可核对信息包括${profile.factFocus}`,
    `使用前提是${profile.boundary}`
  ];
  return { headline, summary, detail, points };
}

function publicActorLabel(candidate) {
  const source = String(candidate.source || "").replace(/\s+/g, " ").trim();
  const title = String(candidate.title || "").replace(/\s+/g, " ").trim();
  const text = `${source} ${title}`.toLowerCase();
  if (/github trending/.test(text) || candidate.source_level === "github" || candidate.repo) return "该开源项目";
  if (/microsoft/.test(text)) return "微软研究院";
  if (/google deepmind|deepmind/.test(text)) return "DeepMind";
  if (/openai/.test(text)) return "OpenAI";
  if (/\bqwen\b|qwenlm/.test(text)) return "Qwen 团队";
  if (/\bqoder\b/.test(text)) return "Qoder";
  if (/\bwarp\b/.test(text)) return "Warp";
  if (/\breprorepo\b/.test(text)) return "ReproRepo";
  if (/agent dashboard/.test(text)) return "Agent Dashboard";
  if (/aws|sagemaker|bedrock/.test(text)) return "AWS";
  if (/nvidia/.test(text)) return "NVIDIA";
  const cleaned = source
    .replace(/\b(?:News|RSS|Blog|Research|Developer|Machine Learning|Feed|Changelog)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned && cleaned.length <= 24) {
    return cleaned;
  }
  return "相关团队";
}

function englishSignalProfile(text) {
  if (/simulated conversations|model deployments?|pre-release|red-team|safety monitoring/.test(text)) {
    return {
      verb: "披露",
      topic: "模拟对话评估与模型部署流程",
      scope: "预发布评估、策略检查、红队审查和上线监控",
      boundary: "模型发布不只依赖单次 benchmark，而是把安全评估接入部署链路",
      factFocus: "模拟对话、发布分阶段、策略检查和线上监控"
    };
  }
  if (/robot learning|multimodal|embodied|robotics/.test(text)) {
    return {
      verb: "介绍",
      topic: "机器人学习与多模态推理实验",
      scope: "具身任务规划、训练数据、多模态推理和评估工作流",
      boundary: "研究信号仍需要看真实机器人任务、数据规模和评测设置",
      factFocus: "机器人学习实验、多模态推理和任务规划评估"
    };
  }
  if (/house-building|urban planning|planning constraints|public-sector|infrastructure tradeoffs/.test(text)) {
    return {
      verb: "展示",
      topic: "住房建设约束规划项目",
      scope: "选址约束、基础设施取舍、规划流程和公共部门决策支持",
      boundary: "这类 AI 规划工具的价值取决于数据边界、审批流程和责任归属",
      factFocus: "规划约束、选址模型、基础设施取舍和公共部门使用场景"
    };
  }
  if (/easycopilot|enterprise agent|business process|task routing/.test(text)) {
    return {
      verb: "推出",
      topic: "企业 agent 工作流系统",
      scope: "任务路由、业务流程自动化、护栏和组织集成入口",
      boundary: "企业采用时仍要处理权限、审计、流程接入和失败恢复",
      factFocus: "任务路由、业务流程、组织护栏和系统集成点"
    };
  }
  if (/qoder|coding agents?|repository context|ide integration|software teams?/.test(text)) {
    return {
      verb: "发布",
      topic: "面向软件团队的 agent 平台",
      scope: "代码仓库上下文、工作流编排、IDE 集成、企业控制和评估钩子",
      boundary: "工程落地取决于仓库权限、上下文质量、评估回放和团队治理",
      factFocus: "coding agent、仓库上下文、IDE 集成和评估钩子"
    };
  }
  if (/agent dashboard|tool-call|incident|observability|rollback|release-health/.test(text)) {
    return {
      verb: "发布",
      topic: "生产 agent 观测面板",
      scope: "工具调用轨迹、事故时间线、成本归因、回滚状态和发布健康度",
      boundary: "观测价值取决于能否把失败记录、成本和发布状态串进同一条链路",
      factFocus: "tool-call traces、事故记录、成本归因和回滚状态"
    };
  }
  if (/grok|warp terminal|command-line|terminal assistant/.test(text)) {
    return {
      verb: "接入",
      topic: "终端助手里的模型选项",
      scope: "代码帮助、命令解释、模型路由和开发者工作流自定义",
      boundary: "终端内模型能力仍受权限、命令风险和团队默认配置约束",
      factFocus: "Grok 模型入口、终端助手、命令解释和模型路由"
    };
  }
  if (/reprorepo|reproducible|failure reports?|tool traces|repository snapshots|regression replay/.test(text)) {
    return {
      verb: "公开",
      topic: "agent 失败复现报告流程",
      scope: "提示词、工具轨迹、仓库快照、期望输出和回归回放元数据",
      boundary: "复现质量取决于记录粒度、隐私处理和能否稳定重放失败",
      factFocus: "prompt、工具轨迹、仓库快照和回归回放字段"
    };
  }
  if (/p-eagle|speculative decoding|draft model parallelism|decoding latency|throughput tradeoffs/.test(text)) {
    return {
      verb: "说明",
      topic: "SageMaker 推测解码并行化方案",
      scope: "draft model 并行、解码延迟、吞吐取舍、部署设置和适用条件",
      boundary: "优化收益取决于模型结构、请求形态、草稿模型质量和线上延迟预算",
      factFocus: "P-EAGLE、speculative decoding、SageMaker 部署和吞吐延迟指标"
    };
  }
  if (/sagemaker|container caching|model loading latency|cold-start|serving cost/.test(text)) {
    return {
      verb: "讲解",
      topic: "SageMaker 推理容器缓存方案",
      scope: "模型加载延迟、冷启动时间、发布风险和生产推理成本",
      boundary: "收益取决于模型大小、镜像组织、缓存命中率和部署频率",
      factFocus: "容器缓存、模型加载、冷启动延迟和部署成本"
    };
  }
  if (/transaction foundation model|financial fraud|fraud detection|sequence modeling|feature pipelines/.test(text)) {
    return {
      verb: "拆解",
      topic: "交易基础模型与反欺诈工作流",
      scope: "交易序列建模、特征流水线、合成数据边界和部署取舍",
      boundary: "金融场景还要处理数据偏差、可解释性、误报成本和合规要求",
      factFocus: "交易数据、序列建模、特征流水线和反欺诈部署"
    };
  }
  if (/bedrock guardrails|multi-agent|prompt filtering|response controls|policy checks/.test(text)) {
    return {
      verb: "说明",
      topic: "多 agent 安全护栏方案",
      scope: "策略检查、提示过滤、响应控制、企业应用和可观测性",
      boundary: "多 agent 系统仍要处理策略一致性、误拦截、日志留存和人工兜底",
      factFocus: "Guardrails、策略检查、提示过滤和响应控制"
    };
  }
  if (/ar glasses|xr devices|xr ai|speech interaction|perception inputs|avatar rendering/.test(text)) {
    return {
      verb: "拆解",
      topic: "XR 眼镜里的端侧 agent 开发流程",
      scope: "端侧推理、语音交互、感知输入、avatar 渲染、SDK 集成和部署边界",
      boundary: "落地质量取决于设备算力、延迟、隐私权限、场景数据和开发者工具成熟度",
      factFocus: "XR AI、端侧推理、语音交互、感知输入和 SDK 集成"
    };
  }
  if (/ace game agent sdk|unreal engine|ai companions|character behavior|scene integration/.test(text)) {
    return {
      verb: "介绍",
      topic: "游戏 agent SDK 与 Unreal 插件方案",
      scope: "角色行为、语音接口、本地推理、场景集成、插件工作流和部署取舍",
      boundary: "游戏内 agent 还要处理实时延迟、内容安全、角色一致性和引擎集成成本",
      factFocus: "ACE Game Agent SDK、Unreal Engine 插件、本地推理和角色行为接口"
    };
  }
  if (/mlperf|blackwell|training performance|benchmark/.test(text)) {
    return {
      verb: "披露",
      topic: "Blackwell MLPerf 训练性能结果",
      scope: "训练基准、硬件吞吐、模型规模、对比设置和数据中心部署前提",
      boundary: "benchmark 结果仍要结合任务类型、集群配置、能耗和真实训练负载判断",
      factFocus: "Blackwell、MLPerf Training、吞吐指标和训练基准设置"
    };
  }
  if (/agent|workflow|developer|coding|software|repository|ide|tool|platform/.test(text)) {
    return {
      verb: "更新",
      topic: "agent 工作流和开发工具能力",
      scope: "任务编排、上下文、权限控制、工程集成和失败恢复",
      boundary: "落地质量取决于权限模型、评估回放、团队流程和可观测性",
      factFocus: "agent 工作流、开发工具入口、权限控制和工程集成"
    };
  }
  if (/model|llm|reasoning|multimodal|benchmark|evaluation|research|planning/.test(text)) {
    return {
      verb: "披露",
      topic: "模型能力和评估方法更新",
      scope: "能力边界、评估设置、数据来源、使用场景和限制说明",
      boundary: "结论仍要依赖可复现评测、真实任务和公开限制",
      factFocus: "模型能力、评估设置、数据来源和限制说明"
    };
  }
  if (/guardrail|safety|security|policy|governance|risk/.test(text)) {
    return {
      verb: "说明",
      topic: "安全治理和平台控制更新",
      scope: "策略检查、风险控制、上线约束、审计记录和组织执行",
      boundary: "治理效果取决于误判率、日志留存、人工复核和系统接入范围",
      factFocus: "策略检查、风险控制、审计记录和上线约束"
    };
  }
  return {
    verb: "更新",
    topic: "公开产品或工程信息",
    scope: "标题、适用场景、访问条件、限制说明和后续链接",
    boundary: "读者还要查看原文中的访问条件、地区范围、价格和使用限制",
    factFocus: "标题、适用场景、访问条件和限制说明"
  };
}

function samePublicCopy(left, right) {
  const normalize = (value) => String(value || "")
    .replace(/\*\*/g, "")
    .replace(/[：:，,。；;、｜|\s]+/g, "")
    .trim()
    .toLowerCase();
  const a = normalize(left);
  const b = normalize(right);
  return Boolean(a && b && a === b);
}

function comparableTitleForCandidate(candidate) {
  const rawTitle = stripDraftPublicBodyNoise(
    decodeCommonHtmlEntities(String(candidate.title || "")).replace(/\s+/g, " ").trim(),
    candidate
  );
  return chineseLeadForCandidate(candidate) || genericChineseHeadline(candidate) || rawTitle || candidate.title || "";
}

function chineseGithubDescription(description, repo) {
  const cleanDescription = stripDraftPublicBodyNoise(String(description || "").replace(/\s+/g, " ").trim());
  const repoLabel = String(repo || "").trim() || "这个仓库";
  if (hasChineseText(cleanDescription) && cleanDescription.length >= 12 && !isGenericGithubTrendDraftDescription(cleanDescription)) {
    return trimText(`${repoLabel}：${cleanDescription.replace(/[。；;]+$/u, "")}。`, 120);
  }
  const concrete = concreteGithubDescription(cleanDescription, repoLabel);
  if (concrete) {
    return trimText(`${repoLabel}：${concrete}`, 140);
  }
  return trimText(`${repoLabel}：公开描述暂未给出足够功能细节，本轮只记录排名、语言和星标变化，不补写用途判断。`, 120);
}

function isGenericGithubTrendDraftDescription(value) {
  return /进入 GitHub Trending Top 10|优先核对 README|重点看 README|可作为[^。；;]*?(?:实现线索|观察)|AI 工程工具方向的开源项目观察/u.test(String(value || ""));
}

function concreteGithubDescription(description, repo) {
  const text = `${repo} ${description}`.toLowerCase();
  const keywordPhrase = githubDescriptionKeywordPhrase(description);
  const pitch = githubPitchFromDescription(description, repo);
  if (keywordPhrase && pitch !== "AI 工程工具") {
    return `${repo} 围绕${pitch}展开，页面信息显示它覆盖 ${keywordPhrase} 等模块，适合用来了解同类项目的能力边界和集成入口。`;
  }
  if (keywordPhrase) {
    return `${repo} 的项目页面把 ${keywordPhrase} 作为主要线索，重点是理解它提供的代码入口、示例和集成方式。`;
  }
  if (/agent|mcp|rag|eval|benchmark|browser|workflow|llm|model|inference|audio|video|image|vision|dataset|deploy|docker|kubernetes|frontend|component/i.test(text)) {
    return `${repo} 可作为${pitch}方向的项目参照，重点看核心 API、示例覆盖和与现有工具链的衔接方式。`;
  }
  return "";
}

function huggingFaceModelDescription(candidate, repo, metrics) {
  const task = String(candidate?.task || "").trim();
  const taskLabel = huggingFaceTaskLabel(task);
  const downloads = Number(candidate?.downloads);
  const likes = Number(candidate?.likes);
  const metricParts = [
    Number.isFinite(downloads) && downloads > 0 ? `${downloads} downloads` : "",
    Number.isFinite(likes) && likes > 0 ? `${likes} likes` : ""
  ].filter(Boolean);
  const metricText = metricParts.length > 0
    ? `本周榜单记录 ${metricParts.join("、")}，可作为社区使用热度参考`
    : "本周榜单只提供基础排名信息";
  const taskText = task ? `任务类型是 ${task}` : "任务类型需要回到模型卡核对";
  const metricsHint = metrics ? `；榜单元数据包括 ${metrics}` : "";
  return trimText(`${repo} 是 Hugging Face 上的${taskLabel}。${metricText}；${taskText}${metricsHint}。选型前还要看模型卡、许可证、推理成本和适用限制。`, 190);
}

function huggingFaceTaskLabel(task) {
  const text = String(task || "").toLowerCase();
  if (/text-generation|conversational|chat/.test(text)) return "文本生成模型";
  if (/image-to-text|vision|visual-question-answering/.test(text)) return "视觉语言模型";
  if (/text-to-image|image-generation|diffusion/.test(text)) return "图像生成模型";
  if (/automatic-speech-recognition|speech|audio/.test(text)) return "语音或音频模型";
  if (/sentence-similarity|feature-extraction|embedding/.test(text)) return "嵌入或语义检索模型";
  if (/dataset/.test(text)) return "数据集资源";
  if (text) return `${task} 任务模型`;
  return "模型资源";
}

function githubDescriptionKeywordPhrase(value) {
  const words = String(value || "")
    .split(/[^A-Za-z0-9+#._-]+/)
    .map((word) => word.trim())
    .filter((word) => /^[A-Za-z][A-Za-z0-9+#._-]{2,}$/.test(word))
    .filter((word) => !/^(?:github|trending|daily|weekly|today|stars?|repo|repository|open|source)$/i.test(word));
  return [...new Set(words)].slice(0, 8).join("、");
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
  if (/unlocking ai flexibility in europe|cross-region inference.*eu data processing|eu data processing.*model access/.test(text)) {
    return "AWS 说明欧洲数据处理场景如何用跨区域推理访问模型";
  }
  if (/ip allow list coverage.*emu namespaces|emu namespaces.*ip allow list|ip allow list.*general availability/.test(text)) {
    return "GitHub 将企业托管用户命名空间的 IP 白名单覆盖正式可用";
  }
  if (/economic research exchange/.test(text)) {
    return "OpenAI 推出经济研究交流项目，面向 AI 经济影响研究";
  }
  if (/patch the planet/.test(text)) {
    return "OpenAI 推出开源维护者漏洞修复计划";
  }
  if (/codex[-\s]?maxxing|long-running work/.test(text)) {
    return "OpenAI 总结长时间运行 Codex 的工程工作流实践";
  }
  if (/train models faster with jax and maxtext|nvfp4.*blackwell|blackwell.*nvfp4/.test(text)) {
    return "英伟达介绍 Blackwell 低精度训练方案，用 JAX 工具链提速";
  }
  if (/apple introduces siri ai|more capable and personal assistant/.test(text)) {
    return "苹果单独介绍 Siri AI 个性化助手升级";
  }
  if (/next-generation of apple intelligence|siri ai/.test(text)) {
    return "苹果发布新一代系统级 AI 和 Siri";
  }
  if (/aids app development.*intelligence frameworks|new intelligence frameworks.*advanced tools/.test(text)) {
    return "苹果为应用开发者推出新的智能框架和开发工具";
  }
  if (/apple intelligence brings powerful ai capabilities|powerful ai capabilities into everyday experiences/.test(text)) {
    return "苹果把新的 AI 能力接入系统日常体验";
  }
  if (/third generation of apple.*foundation models|introducing the third generation of apple/.test(text)) {
    return "苹果介绍第三代基础模型，公开内容集中在端侧和云端模型能力范围";
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
  if (/bringing the latest gemini models to apple developers|gemini models.*apple developers/.test(text)) {
    return "Google 将最新 Gemini 模型接入苹果开发者工具链";
  }
  if (/confidential submission of draft s-1 to the sec|openai submits confidential s-1|draft s-1.*sec/.test(text)) {
    return "OpenAI 向美国证监会秘密提交上市草案";
  }
  if (/built to benefit everyone.*our plan|our plan.*built to benefit everyone/.test(text)) {
    return "OpenAI 发布公司治理和公共利益计划";
  }
  if (/openai files for ipo.*sam altman.*eye.*layoffs|eye-scanning company.*layoffs|world.*layoffs/.test(text)) {
    return "TechCrunch 报道 World 项目出现裁员";
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
  const rawTitle = stripDraftPublicBodyNoise(
    decodeCommonHtmlEntities(String(candidate.title || "")).replace(/\s+/g, " ").trim(),
    candidate
  );
  if (hasChineseText(rawTitle) && isConcreteReaderTitle(rawTitle, candidate)) {
    return trimText(stripSentenceEnding(rawTitle), 120);
  }
  const concreteEnglishTitle = concreteChineseTitleFromEnglish(rawTitle, candidate);
  if (concreteEnglishTitle) {
    return trimText(concreteEnglishTitle, 120);
  }
  const title = chineseLeadForCandidate(candidate) || genericChineseHeadline(candidate);
  if (title) {
    return trimText(title, 120);
  }
  if (hasChineseText(rawTitle) && rawTitle.length >= 10) {
    return trimText(stripSentenceEnding(rawTitle), 120);
  }
  return trimText(rawTitle || genericChineseFact(candidate, null) || candidate.title, 120);
}

function isConcreteReaderTitle(title, candidate = {}) {
  const text = String(title || "").replace(/\s+/g, " ").trim();
  if (!text || text.length < 12 || TITLE_MOJIBAKE_RE.test(text)) {
    return false;
  }
  if (isTemplatedStoryTitleText(text)) {
    return false;
  }
  if (/^(?:source|update|report|news|blog|paper|project)\s*[:：-]?\s*$/i.test(text)) {
    return false;
  }
  if (/^(?:[a-z0-9_.-]+\/[a-z0-9_.-]+)$/i.test(text)) {
    return false;
  }
  if (/today entered github trending top 10|appeared on github trending|source:\s*third-party report|sequence\s+\d+/i.test(text)) {
    return false;
  }
  const visibleLetters = (text.match(/[A-Za-z]|\p{Script=Han}/gu) || []).length;
  if (visibleLetters < 8) {
    return false;
  }
  const context = `${text} ${candidate?.evidence || ""} ${candidate?.summary || ""}`;
  return AI_RELEVANCE_RE.test(context) ||
    PRODUCT_PLATFORM_RE.test(context) ||
    BUILDER_RELEVANCE_RE.test(context) ||
    /agent|model|llm|copilot|claude|openai|anthropic|google|github|nvidia|microsoft|meta|bytedance|alibaba|qwen|deepseek/i.test(context);
}

function concreteChineseTitleFromEnglish(rawTitle, candidate = {}) {
  const title = String(rawTitle || "").replace(/\s+/g, " ").trim();
  if (!title || hasChineseText(title) || !isConcreteReaderTitle(title, candidate)) {
    return "";
  }
  const lower = title.toLowerCase();
  const entity = shortEntityForChineseTitle(candidate);
  const topic = englishConcreteTopic(lower, candidate);
  if (!topic) {
    return "";
  }
  const verb = englishConcreteVerb(lower);
  return `${entity}${verb}${topic}`;
}

function shortEntityForChineseTitle(candidate = {}) {
  const raw = mainEntity(candidate) || String(candidate.source || "").trim() || "相关团队";
  const text = raw.replace(/\s+(?:News RSS|RSS|Feed|Research Blog|Developer Blog|Machine Learning Blog|Blog)$/i, "").trim();
  if (/microsoft/i.test(text)) return "Microsoft";
  if (/openai/i.test(text)) return "OpenAI";
  if (/anthropic/i.test(text)) return "Anthropic";
  if (/google\s*deepmind|deepmind/i.test(text)) return "DeepMind";
  if (/google/i.test(text)) return "Google";
  if (/nvidia/i.test(text)) return "NVIDIA";
  if (/\baws\b|amazon/i.test(text)) return "AWS";
  if (/qwen/i.test(text)) return "Qwen";
  if (/alibaba/i.test(text)) return "Alibaba Cloud";
  if (/example\s*ai/i.test(text)) return "Example AI";
  return text || "相关团队";
}

function englishConcreteVerb(lowerTitle) {
  if (/\b(launches|introduces|unveils|ships|releases|publishes)\b/.test(lowerTitle)) {
    return "发布";
  }
  if (/\b(changes|updates|adds|expands|improves|upgrades)\b/.test(lowerTitle)) {
    return "更新";
  }
  if (/\b(explains|details|summarizes|breaks down|covers|tracks)\b/.test(lowerTitle)) {
    return "说明";
  }
  return "披露";
}

function englishConcreteTopic(lowerTitle, candidate = {}) {
  const text = `${lowerTitle} ${candidate?.evidence || ""} ${candidate?.summary || ""}`.toLowerCase();
  if (/pricing|price|availability|available|rollout/.test(text) && /copilot|github|enterprise/.test(text)) {
    return " Copilot 与企业可用范围变化";
  }
  if (/model weights?|usage guide|hugging\s*face/.test(text)) {
    return "模型权重和使用说明";
  }
  if (/enterprise ai platform/.test(text)) {
    return "企业 AI 平台";
  }
  if (/agent runtime/.test(text)) {
    return " agent runtime，面向企业团队";
  }
  if (/agent workflow|workflow update|developer workflow|developer platform|api workflow/.test(text)) {
    return "具体的 agent 工作流更新，面向开发团队";
  }
  if (/deployment controls?|admin console|enterprise controls?/.test(text)) {
    return "企业部署控制和管理入口";
  }
  if (/ai search|search interface/.test(text)) {
    return " AI 搜索界面变化";
  }
  if (/observability/.test(text)) {
    return " agent 可观测平台更新";
  }
  if (/evaluation practices?|eval loops?|release gates?|rollback/.test(text)) {
    return " agent 评估实践和发布门禁";
  }
  if (/claude code|agent tooling|subagents?|mcp|hooks?|skills?/.test(text)) {
    return " Claude Code agent 工具工作流";
  }
  if (/video|image|creative|creator|game worlds?/.test(text)) {
    return " AIGC 创作工作流";
  }
  if (/security|guardrail|safety|policy|governance/.test(text)) {
    return "安全治理和平台控制变化";
  }
  if (/benchmark|reasoning|evaluation|eval|paper|research/.test(text)) {
    return "模型评估和研究结果";
  }
  if (/agent|workflow|tool|developer|coding|sdk|api|mcp/.test(text)) {
    return " agent 与开发者工具能力";
  }
  if (/model|llm|multimodal|inference/.test(text)) {
    return "模型能力和推理入口变化";
  }
  return "";
}

function candidateReaderDigest(candidate) {
  const lead = chineseLeadForCandidate(candidate);
  if (lead) {
    return lead;
  }
  for (const field of [candidate.summary, candidate.evidence, candidate.title]) {
    const raw = stripDraftPublicBodyNoise(field, candidate);
    if (hasReaderChineseText(raw) && raw.length >= 18) {
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
  if (/VLA不会死|世界模型是未来|智源研究院院长王仲远|世界模型.*具身智能/u.test(raw)) {
    return "智源王仲远谈 VLA 与世界模型路线";
  }
  const titleTranslation = englishTitleToChineseHeadline(raw, candidate);
  if (titleTranslation) return titleTranslation;
  if (/tested 19 llm api workloads|cut costs 79/.test(lower)) {
    return "实测 19 类 LLM API 调用后，作者给出 79% 成本压缩数据";
  }
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
  if (/runway updates ai video creation workflow for game worlds/.test(lower)) {
    return "Runway 更新 AI 视频创作工作流";
  }
  if (/introducing the openai partner network/.test(lower)) {
    return "OpenAI 发布 Partner Network，面向企业客户整理合作伙伴入口";
  }
  const officialPlatformMatch = lower.match(/^official ai platform update\s+(\d+)$/);
  if (officialPlatformMatch) {
    return `官方 AI 平台更新 ${officialPlatformMatch[1]}`;
  }
  if (/public preview/.test(lower) && /(plugin|copilot|codex|agent|developer|sdk|api)/.test(lower)) {
    return `${mainEntity(candidate) || "相关平台"} 将一项开发者能力推入公开预览`;
  }
  return "";
}

function genericChineseFact(candidate, original) {
  void original;
  const evidenceSummary = mainItemEvidenceSummary(candidate);
  if (evidenceSummary) {
    return stripSentenceEnding(trimText(evidenceSummary, 140));
  }
  const evidenceDetail = mainItemEvidenceDetail(candidate);
  if (evidenceDetail) {
    return stripSentenceEnding(trimText(evidenceDetail, 140));
  }
  const title = stripDraftPublicBodyNoise(decodeCommonHtmlEntities(String(candidate.title || "")).replace(/\s+/g, " ").trim(), candidate);
  if (hasChineseText(title) && title.length >= 10) {
    return stripSentenceEnding(trimText(title, 120));
  }
  if (title) {
    return stripSentenceEnding(trimText(genericChineseHeadline(candidate) || title, 120));
  }
  return "";
}

function englishTitleToChineseHeadline(rawTitle, candidate = {}) {
  const lower = String(rawTitle || "").toLowerCase();
  if (/patch the planet/.test(lower)) {
    return "OpenAI 推出开源维护者漏洞修复计划";
  }
  if (/codex[-\s]?maxxing|long-running work/.test(lower)) {
    return "OpenAI 总结长时间运行 Codex 的工程工作流实践";
  }
  if (/security new features in may 2026/.test(lower)) {
    return "阿里云汇总 2026 年 5 月安全产品新功能";
  }
  if (/automating daily outlook email summarization with hermesagent on alibaba cloud ecs/.test(lower)) {
    return "阿里云示例用 HermesAgent 在 ECS 上自动汇总 Outlook 邮件";
  }
  if (/cut checkpoint costs with about 30 lines of python and nvidia nvcomp/.test(lower)) {
    return "英伟达用压缩库和约 30 行代码降低训练检查点成本";
  }
  if (/claude code guide 2026|25 features.*examples.*demo/.test(lower)) {
    return "Claude Code 2026 指南梳理 25 个功能点";
  }
  if (/agent evaluation practices|tool traces|release gates|human rollback|deployment checklists?/.test(lower)) {
    return "Agent 生产评测、发布门禁和回滚清单被重新整理";
  }
  if (/self-revising discovery systems/.test(lower)) {
    return "论文讨论自修正科学发现系统";
  }
  if (/most games secretly use ai in development|players unaware|industry transparency debate/.test(lower)) {
    return "游戏开发使用 AI 工具的透明度争议升温";
  }
  if (/i shipped a concrete eval workflow for coding agents|ai agents need eval loops before unattended production use/.test(lower)) {
    return "Builder 分享 coding agent 评测工作流";
  }
  if (/ai agents need production eval loops/.test(lower)) {
    return "Builder 讨论 agent 生产评测、工具轨迹和回滚计划";
  }
  if (/the layer that can route to the best ai model/.test(lower)) {
    return "Aaron Levie 讨论模型路由层的价值";
  }
  if (/frontier model launch reviews|launching an llm isn't like shipping traditional software/.test(lower)) {
    return "Madhu Guru 讨论前沿模型发布评审的难点";
  }
  const source = String(candidate.source || "").toLowerCase();
  if (/nvidia developer blog/.test(source) && /checkpoint|nvcomp/.test(lower)) {
    return "英伟达讨论训练检查点成本压缩";
  }
  if (/alibaba cloud blog/.test(source) && /hermesagent|outlook/.test(lower)) {
    return "阿里云展示 HermesAgent 邮件汇总示例";
  }
  return englishPublicHeadline(candidate);
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

function githubProjectUseCase(candidate, meta, repo) {
  const basis = [meta?.readme_summary, meta?.description, candidate?.summary, candidate?.evidence, candidate?.title, repo]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ");
  const pitch = githubPitchFromDescription(basis, repo);
  if (pitch && pitch !== "AI 工程工具") {
    return `公开 README 信息显示它聚焦${pitch}，适合从示例、许可证和近期维护记录判断能否进入 PoC。`;
  }
  return "公开 README 信息应优先说明项目目标、示例、许可证和近期维护记录，避免只复述 Trending 排名。";
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
    return "可观察的是资源投入、组织重心和合作优先级是否同时变化";
  }
  if (category === "product_radar") {
    return "可观察的是产品入口、目标用户、上线范围和采购节奏";
  }
  if (category === "open_source") {
    return "可观察的是代码、权重、示例、许可证和生态复用条件";
  }
  if (category === "content_aigc" || AIGC_RE.test(text)) {
    return "可观察的是素材生成质量、创作者工具链成本和交付方式";
  }
  if (/agent|workflow|mcp|tool|developer|coding|codex|copilot|cursor/i.test(text)) {
    return "可观察的是 agent、开发工具和自动化工作流的接入成本";
  }
  if (/benchmark|eval|paper|research|arxiv|reasoning|long context|memory/i.test(text)) {
    return "可观察的是评测设置、能力边界和内部实验参照价值";
  }
  if (/policy|safety|governance|regulation|security/i.test(text)) {
    return "可观察的是合规、安全和平台治理口径变化";
  }
  return "可观察的是 AI 产品、模型或平台策略的实际变化";
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
    return "";
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
  if (/unlocking ai flexibility in europe|cross-region inference.*eu data processing|eu data processing.*model access/.test(text)) {
    return "原文把重点放在欧盟数据处理、跨区域推理和模型可用性之间的取舍，适合判断欧洲团队怎样在合规边界内调用区域外模型";
  }
  if (/ip allow list coverage.*emu namespaces|emu namespaces.*ip allow list|ip allow list.*general availability/.test(text)) {
    return "这次变化面向企业托管用户命名空间，把 ==IP 白名单覆盖== 从预览推进到正式可用，影响组织级访问控制配置、命名空间边界和企业安全策略";
  }
  if (/economic research exchange/.test(text)) {
    return "它不是产品发布，而是 OpenAI 面向外部研究者组织 ==经济影响研究== 的项目入口，后续可观察就业、生产率、政策研究和 AI 扩散数据产出";
  }
  if (/train models faster with jax and maxtext|nvfp4.*blackwell|blackwell.*nvfp4/.test(text)) {
    return "原文把 Blackwell 加速卡、==低精度格式== 和 JAX 训练工具链放在同一条优化链路里，关注点是训练吞吐、显存效率和大模型训练成本";
  }
  if (/next-generation of apple intelligence|siri ai|more capable and personal assistant/.test(text)) {
    return "公开信息把系统级 AI、==Siri== 和个人上下文放在同一组更新里，关键边界是可用地区、设备要求、隐私处理方式和个人化助手入口";
  }
  if (/aids app development.*intelligence frameworks|new intelligence frameworks.*advanced tools/.test(text)) {
    return "这条面向开发者，核心变化是苹果把 ==系统模型和智能框架== 接入开发工具链，让第三方应用有机会调用系统级 AI 能力";
  }
  if (/apple intelligence brings powerful ai capabilities|powerful ai capabilities into everyday experiences/.test(text)) {
    return "这条面向用户体验，核心变化是苹果把 ==写作、图像和快捷操作== 等 AI 能力接入系统应用，做成日常默认入口而非独立工具";
  }
  if (/third generation of apple.*foundation models|introducing the third generation of apple/.test(text)) {
    return "Apple 披露第三代基础模型的 ==端侧模型、服务器模型和评测范围==，公开信息说明哪些能力已经进入系统，哪些仍停留在研究披露和开发者接口范围";
  }
  if (/built to benefit everyone.*our plan|our plan.*built to benefit everyone/.test(text)) {
    return "OpenAI 把 ==公司治理、公共利益承诺和长期结构== 放进同一份计划，公开信息集中在组织边界、监督安排和商业化扩张后的责任分配";
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
    return "";
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
    return "适合业务、采购和组织管理团队复盘行业风向、供应商策略和合作风险";
  }
  if (category === "product_radar") {
    return "适合产品、运营和业务团队安排试用、替换工具或路线图复盘";
  }
  if (category === "open_source") {
    return "适合技术和产品团队评估仓库、模型权重或生态工具的采用条件";
  }
  if (category === "content_aigc" || AIGC_RE.test(text)) {
    return "适合内容、设计和产品团队评估生成式工具的试用或采购边界";
  }
  if (/agent|workflow|mcp|tool|developer|coding|codex|copilot|cursor/i.test(text)) {
    return "适合研发团队评估 agent 平台、开发工具和自动化流程的迁移窗口";
  }
  if (/benchmark|eval|paper|research|arxiv|reasoning|long context|memory/i.test(text)) {
    return "适合算法、平台和评测团队更新能力边界和内部实验设计";
  }
  if (/policy|safety|governance|regulation|security/i.test(text)) {
    return "适合安全、合规和平台团队更新风险登记、上线检查和治理口径";
  }
  return "适合产品和工程团队复盘选型、试点范围和内部风险提示";
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
  if (/unlocking ai flexibility in europe|cross-region inference.*eu data processing|eu data processing.*model access/.test(text)) {
    return "文章把欧盟数据处理、跨区域推理和模型可用性放在同一条调用链路里说明。它具体讨论在 EU 数据边界下如何选择目标 Region、处理容量限制，并在合规前提下取得更多模型。平台团队可据此把区域、模型和数据边界拆成可配置方案。";
  }
  if (/tested 19 llm api workloads|cut costs 79/.test(text)) {
    return "作者用 19 类真实 LLM API 调用比较模型和路由方式，给出把成本压低 79% 的数据。文章不是泛谈省钱，而是把工作负载分类、真实调用和模型选择拆开。团队可把它转成路由评估表：高价值任务用强模型，低风险任务换便宜模型。";
  }
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
  if (/nvidia nemotron 3 ultra.*long-running agents|nemotron 3 ultra powers faster/.test(text)) {
    return "文章介绍英伟达长程推理模型面向长时间代理任务的能力，信息集中在多轮上下文、工具调用、接口流程和推理效率。原文同时说明企业部署入口、效率优化和单轮评测的限制，边界是长任务代理是否需要专门模型，以及模型能力怎样接进工程链路。";
  }
  if (/third generation of apple.*foundation models|introducing the third generation of apple/.test(text)) {
    return "文章围绕苹果第三代基础模型展开，信息重点在端侧模型、服务器模型、评测范围和安全隐私处理方式。它把模型能力、系统体验和开发者接口放在一起说明，能区分已经产品化的能力、仍在研究披露中的能力，以及第三方应用可复用的接口范围。";
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
    return normalizeHotBlogSummary(specific, candidate);
  }
  const evidenceSummary = hotBlogEvidenceDrivenSummary(candidate);
  if (evidenceSummary) {
    return normalizeHotBlogSummary(evidenceSummary, candidate);
  }
  const digest = candidateReaderDigest(candidate) || hotBlogClaimForCandidate(candidate);
  const angle = hotBlogSpecificAngle(candidate) || hotBlogEvidenceForCandidate(candidate);
  const action = hotBlogActionForCandidate(candidate);
  return normalizeHotBlogSummary(`${digest}。${angle}。${action}。`, candidate);
}

function normalizeHotBlogSummary(value, candidate) {
  const sentences = [
    ...splitHotBlogSummaryPoints(value),
    hotBlogClaimForCandidate(candidate),
    hotBlogEvidenceForCandidate(candidate),
    hotBlogActionForCandidate(candidate)
  ];
  const selected = [];
  const seen = new Set();
  for (const raw of sentences) {
    let sentence = stripDraftPublicBodyNoise(stripSentenceEnding(String(raw || "")), candidate)
      .replace(/\s+/g, " ")
      .trim();
    if (!sentence) continue;
    if (!hasReaderChineseText(sentence) && hasReaderEnglishText(sentence)) {
      sentence = englishPublicPoint(candidate, sentence);
    }
    sentence = stripSentenceEnding(sentence);
    if (!sentence) continue;
    const key = sentence.replace(/\s+/g, " ").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const nextSentence = ensureChineseSentence(sentence);
    const current = selected.join("");
    const currentHan = hotBlogSummaryHanCount(current);
    const nextHan = hotBlogSummaryHanCount(`${current}${nextSentence}`);
    if (currentHan >= 100 && nextHan > 200) {
      continue;
    }
    selected.push(nextSentence);
    const selectedHan = hotBlogSummaryHanCount(selected.join(""));
    if (selectedHan >= 100 && selectedHan <= 200) {
      break;
    }
  }
  return clipHotBlogSummary(selected.join(""), 200);
}

function hotBlogSummaryHanCount(value) {
  return (String(value || "").match(/\p{Script=Han}/gu) || []).length;
}

function clipHotBlogSummary(value, maxHan) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (hotBlogSummaryHanCount(text) <= maxHan) {
    return text;
  }
  let han = 0;
  let result = "";
  for (const char of text) {
    if (/\p{Script=Han}/u.test(char)) {
      han += 1;
    }
    if (han > maxHan) {
      break;
    }
    result += char;
  }
  return ensureChineseSentence(stripSentenceEnding(result));
}

function hotBlogKeyPoints(candidate, summary) {
  const explicitPoints = Array.isArray(candidate.key_points) ? candidate.key_points : [];
  const candidates = [
    ...explicitPoints,
    ...splitHotBlogSummaryPoints(summary),
    ...hotBlogEvidenceDrivenPoints(candidate),
    hotBlogClaimForCandidate(candidate),
    hotBlogSpecificAngle(candidate),
    hotBlogEvidenceForCandidate(candidate),
    hotBlogAngleSentence(candidate),
    hotBlogActionForCandidate(candidate),
    hotBlogReaderValueSentence(candidate)
  ];
  const cleaned = [];
  const seen = new Set();
  for (const value of candidates) {
    const point = normalizeHotBlogPoint(value, candidate);
    if (!point) continue;
    const key = point.replace(/\s+/g, " ").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(point);
    if (cleaned.length >= 5) break;
  }
  while (cleaned.length < 3) {
    const fallback = normalizeHotBlogPoint(hotBlogFallbackPoint(candidate, cleaned.length), candidate);
    if (!fallback) break;
    const key = fallback.replace(/\s+/g, " ").toLowerCase();
    if (seen.has(key)) break;
    seen.add(key);
    cleaned.push(fallback);
  }
  return cleaned.slice(0, 5);
}

function hotBlogEvidenceDrivenSummary(candidate) {
  const text = candidateText(candidate).toLowerCase();
  if (!text || hasReaderChineseText(candidate.summary) || hasReaderChineseText(candidate.evidence)) {
    return "";
  }
  const actor = publicActorLabel(candidate);
  const profile = englishSignalProfile(text);
  if (!profile) {
    return "";
  }
  return `${actor}${profile.verb}${profile.topic}，重点落在${profile.scope}。更有价值的信息是${profile.factFocus}，判断这类方案时还要看${profile.boundary}。`;
}

function hotBlogEvidenceDrivenPoints(candidate) {
  const text = candidateText(candidate).toLowerCase();
  if (!text) {
    return [];
  }
  const actor = publicActorLabel(candidate);
  const profile = englishSignalProfile(text);
  if (!profile) {
    return [];
  }
  return [
    `${actor}${profile.verb}${profile.topic}`,
    `重点覆盖${profile.scope}`,
    `关键信息包括${profile.factFocus}`,
    `判断边界是${profile.boundary}`
  ];
}

function splitHotBlogSummaryPoints(summary) {
  const text = String(summary || "").replace(/\s+/g, " ").trim();
  if (!text) return [];
  return text
    .split(/(?<=[。！？!?；;])\s*/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeHotBlogPoint(value, candidate) {
  let cleaned = stripDraftPublicBodyNoise(stripSentenceEnding(String(value || "")), candidate)
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned && !hasReaderChineseText(cleaned) && hasReaderEnglishText(cleaned)) {
    cleaned = englishPublicPoint(candidate, cleaned);
  }
  if (!cleaned || cleaned.length < 12) return "";
  return ensureChineseSentence(trimText(cleaned, 150));
}

function hotBlogFallbackPoint(candidate, index) {
  if (index === 0) return hotBlogClaimForCandidate(candidate);
  if (index === 1) return hotBlogEvidenceForCandidate(candidate);
  return hotBlogActionForCandidate(candidate);
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
    return "Aaron Levie 认为应用层的==模型路由==会更有价值：不同任务需要在成本优化、能力最大化和风险缓解之间切换，不能只按一个默认模型或单一排行榜做决定。";
  }
  if (/route to the best ai model|cost optimization.*capability maximization.*risk mitigation/.test(lower)) {
    return "Aaron Levie 认为应用层的==模型路由==会更有价值，因为团队需要同时处理成本优化、能力最大化和风险缓解，而不是把所有任务固定到一个模型上。";
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
  if (/i shipped a concrete eval workflow for coding agents/.test(lower)) {
    return "原帖作者说自己发布了一个面向 coding agent 的具体评测工作流，重点是把 agent 输出放到可验证的流程里，而不是只看一次补全是否成功。";
  }
  if (/ai agents need eval loops before unattended production use/.test(lower)) {
    return "原帖强调，AI agent 在无人值守进入生产前需要先有 eval loops；这把关注点从单次能力展示移到持续评测和上线边界。";
  }
  if (/ai agents need production eval loops, tool traces, and rollback plans before unattended workflow use/.test(lower)) {
    return "原帖强调，AI agent 在无人值守工作流前需要==生产 eval loops==、工具调用轨迹和回滚计划，重点是把自动化从演示推到可审计运行。";
  }
  if (/launching an llm isn't like shipping traditional software|frontier model launch reviews/.test(lower)) {
    return "Madhu Guru 说，发布 LLM 不像发布传统软件：团队要在近乎无限的使用场景和失败模式里做取舍，通过 eval、red-team 和候选 checkpoint 评审降低不确定性。";
  }
  if (/fable export control situation|regulation discourse/.test(lower)) {
    return "Aaron Levie 把 Fable 出口管制事件看作模型层监管的早期样本：如果每次模型发布都要和政府反复确认风险，发布节奏和市场进展都会被拖慢。";
  }
  if (BUILDER_RELEVANCE_RE.test(text)) {
    return builderGenericEnglishSummary(text);
  }
  return "";
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

function builderGenericEnglishSummary(text) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim().toLowerCase();
  const topic = builderTopicName(normalized);
  const focus = builderFocusPoints(normalized);
  const sourceSignal = /eval|benchmark|trace|rollback|permission|policy|routing|memory|workflow|production|agent|model/.test(normalized)
    ? "工程落地"
    : "产品判断";
  return `原帖围绕${topic}给出一条${sourceSignal}线索，重点是${focus}；读者可把它作为 Builder/X 讨论信号，继续核对官方入口、可复现做法和失败边界。`;
}

function topicForCandidate(candidate) {
  if (isAigcCandidate(candidate)) return "AIGC / content generation";
  if (/agent|tool|developer|coding/i.test(candidateText(candidate))) return "AI engineering tools";
  if (/research|paper|arxiv|eval/i.test(candidateText(candidate))) return "research / evaluation";
  return "AI industry";
}

function mainEntity(candidate) {
  if (isRepositoryLikeUrl(candidate?.url)) {
    const repo = repoFromUrl(candidate.url);
    if (repo) {
      return repo;
    }
  }
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
    candidate.name,
    candidate.repo,
    candidate.source,
    candidate.description,
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
  return ["main_item", "github_trending", "huggingface_trending", "model_release", "hot_blog", "project", "builder_observation", "community_lead", ...Object.keys(PLATFORM_CATEGORY_TO_SECTION)].includes(category)
    ? category
    : category === "blog"
      ? "hot_blog"
      : "community_lead";
}

function candidateSourceCategory(category) {
  return ["official_release", "github_trending", "huggingface_trending", "builder", "blog", "project", "community", "model_registry", "repository", "other"].includes(category)
    ? category
    : category === "intermediary" || category === "x_hotspot"
      ? "community"
      : "other";
}

function sourceCategoryForCandidate(candidate) {
  if (isPlatformExemptCategory(candidate.category)) return "community";
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

async function loadDiscoveryInputsWithDegraded(rootDir, inputPaths, options = {}) {
  if (options.allowDegradedInputs !== true) {
    return await loadDiscoveryInputs(rootDir, inputPaths);
  }
  if (inputPaths.length === 0) {
    throw new PublisherError(
      "report_draft_inputs_missing",
      "report:draft needs --input pointing at discovery output JSON."
    );
  }

  const payloads = [];
  let readableInputs = 0;
  for (const inputPath of inputPaths) {
    try {
      payloads.push(JSON.parse(await fs.readFile(path.resolve(rootDir, inputPath), "utf8")));
      readableInputs += 1;
    } catch (error) {
      if (!isDegradableDiscoveryInputError(error)) {
        throw error;
      }
      const degraded = degradedDiscoveryInputPayload(inputPath, {
        reportDate: options.reportDate,
        generatedAt: options.generatedAt,
        error
      });
      if (!degraded) {
        throw error;
      }
      payloads.push(degraded);
    }
  }

  if (readableInputs === 0) {
    throw new PublisherError(
      "report_draft_inputs_unavailable",
      "report:draft needs at least one readable discovery input before degraded input fallback can continue."
    );
  }
  return payloads;
}

function degradedDiscoveryInputPayload(inputPath, { reportDate, generatedAt, error } = {}) {
  const spec = fallbackSpecForDiscoveryInput(inputPath);
  if (!spec) {
    return null;
  }
  const baseName = path.basename(inputPath);
  const errorCode = String(error?.code || error?.name || "discovery_input_unavailable");
  const reason = `Missing or unreadable discovery input ${baseName}: ${errorCode}`;
  const auditSource = {
    name: spec.sourceName,
    url: spec.sourceUrl,
    status: "blocked",
    notes: reason
  };
  if (spec.platform) {
    auditSource.platform = spec.platform;
  }
  const degradationEvent = createPublicDegradationEvent({
    audit_group: spec.auditGroup,
    source: {
      name: spec.sourceName,
      url: spec.sourceUrl
    }
  });
  return {
    ok: true,
    degraded: true,
    fallback_used: true,
    fallback_kind: "degraded_discovery_input",
    report_date: reportDate,
    generated_at: generatedAt,
    source_audit: {
      [spec.auditGroup]: {
        checked: true,
        sources: [auditSource],
        candidates_found: 0,
        included: 0,
        blocked_reason: errorCode,
        notes: reason
      }
    },
    sources: [
      {
        id: `${spec.platform || spec.auditGroup}-${slugId(spec.sourceName) || "source"}`,
        name: spec.sourceName,
        url: spec.sourceUrl,
        category: spec.sourceCategory,
        status: "blocked",
        checked_at: generatedAt,
        notes: reason,
        ...(spec.platform ? { platform: spec.platform } : {})
      }
    ],
    degradation_events: degradationEvent ? [degradationEvent] : [],
    candidates: []
  };
}

function fallbackSpecForDiscoveryInput(inputPath) {
  const baseName = path.basename(String(inputPath || ""));
  return DEGRADED_DISCOVERY_INPUT_FALLBACKS.find((spec) => spec.pattern.test(baseName)) || null;
}

function isDegradableDiscoveryInputError(error) {
  return DEGRADED_DISCOVERY_INPUT_ERROR_CODES.has(String(error?.code || ""));
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

function hasReaderChineseText(value) {
  const text = String(value || "").replace(/\s+/g, "");
  const chinese = (text.match(/\p{Script=Han}/gu) || []).length;
  if (chinese === 0) return false;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  if (chinese >= 24) return true;
  return chinese >= 10 && chinese / Math.max(1, chinese + latin) >= 0.35;
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
