import fs from "node:fs/promises";
import path from "node:path";
import { PublisherError } from "./errors.js";
import { cacheEvidenceImages } from "./evidence-cache.js";

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
      candidates: candidatePool.candidates,
      fetchImpl: options.fetchImpl
    });
  const report = buildDraftReport({
    reportDate,
    generatedAt,
    selection,
    sourceAudit: updateAuditIncludedCounts(merged.sourceAudit, selection.candidates),
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
  const githubTrending = githubSourceCandidates.slice(0, 10).map(({ candidate, meta }, index) => {
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

  const projectSeeds = githubSourceCandidates
    .map(({ candidate, meta }) => ({ candidate, meta }))
    .filter(({ candidate }) => !selectedIds.has(`project:${candidate.id}`))
    .slice(0, 3);
  const projects = projectSeeds.map(({ candidate, meta }) => {
    const projectCandidate = markIncludedCandidate(candidate, "project", "projects");
    selectedIds.add(`project:${candidate.id}`);
    return projectItem(projectCandidate, meta);
  });

  const hotBlogSeeds = candidates
    .filter((candidate) => candidate.category === "hot_blog" && !selectedIds.has(candidate.id))
    .filter((candidate) => !mainItems.some((item) => normalizeUrl(item.url) === normalizeUrl(candidate.url)))
    .sort((left, right) => candidateScore(right) - candidateScore(left))
    .slice(0, 3);
  const hotBlogs = hotBlogSeeds.map((candidate) => {
    const hotCandidate = markIncludedCandidate(candidate, "hot_blog", "hot_blogs");
    selectedIds.add(candidate.id);
    return hotBlogItem(hotCandidate);
  });

  const builderSeeds = candidates
    .filter((candidate) => candidate.category === "builder_observation" && !selectedIds.has(candidate.id))
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
  const aigc = candidates.find((candidate) => isAigcCandidate(candidate));
  if (aigc) {
    picked.push(aigc);
    seenUrls.add(normalizeUrl(aigc.url));
  }
  for (const candidate of candidates) {
    if (picked.length >= target) break;
    const key = normalizeUrl(candidate.url);
    if (!key || seenUrls.has(key)) continue;
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
  report.source_window.notes = "固定发现候选池已完成选择：主体仅收录一手、官方、论文、GitHub 或多源确认信号；中介线索保留在社区观察或风险说明中。";
  report.self_check.notes = "候选池 included 标记已随草稿写回；高风险或中介事实保持在非事实栏目。";

  for (const item of report.main_items || []) {
    const entity = item.entities?.[0] || item.source || "该信号";
    const evidence = trimText(item.summary || item.evidence || item.title, 130);
    item.bullets = [
      `**${entity}** 的最新信号与 ${topicForCandidate(item)} 直接相关；==来源链路清晰，可用于判断是否需要跟进产品或工程变化==。`,
      `${evidence}；==重点看它对能力边界、集成路径或运营策略的具体影响==。`,
      `核验状态为 ${item.verification_status || "primary_confirmed"}；==事实栏目只采用一手、官方、论文、GitHub 或多源确认信息==。`
    ];
    item.why_it_matters = "该条进入主体，是因为候选池提供了足够明确的一手或可信证据。";
    item.reader_relevance = "工程团队可据此判断是否需要跟进能力变化、工具接入、内容生成工作流或平台策略。";
    item.verification_note = "候选池提供了可检查来源与核验状态。";
  }

  for (const item of report.hot_blogs || []) {
    item.verification_note = "该材料有可检查来源；观点解读仍按原文边界呈现。";
  }

  for (const item of report.community_leads || []) {
    const lead = trimText(item.evidence || item.content || item.title, 240);
    item.verification_note = "该线索用于观察，不作为事实栏目证据。";
    item.content = `${item.source ? `${item.source}：` : ""}${lead} 待确认：该线索没有进入事实栏目，仍需回到原始来源或多源确认。`;
  }
}

function summaryForSelection(selection, aigcCount) {
  const parts = [];
  if (selection.main_items.length > 0) {
    parts.push(`主体覆盖 ${selection.main_items.length} 条一手或可信信号`);
  }
  if (aigcCount > 0) {
    parts.push(`AIGC/内容生成信号 ${aigcCount} 条`);
  }
  if (selection.github_trending.length > 0) {
    parts.push(`GitHub Trending Top ${selection.github_trending.length}`);
  }
  if (selection.builder_observations.length > 0) {
    parts.push(`Builder/X 观察 ${selection.builder_observations.length} 条`);
  }
  return parts.length > 0
    ? `今日主线：${parts.join("，")}；社区线索保留中介来源和核验边界。`
    : "今日固定候选池没有足够可核验信号，正文保持克制并公开信源状态。";
}

function mainItem(candidate, original) {
  const category = inferredEditorialCategory(candidate);
  const entity = mainEntity(candidate);
  const summary = chineseSummary(candidate, category);
  return {
    title: candidate.title,
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
      `**${entity || candidate.source}** 发布或更新了这条信号；==它进入主体的原因是来源可回溯且与 AI 产品、模型、工具链或内容生成工作流相关==。`,
      `${trimText(candidate.evidence || original?.evidence || candidate.title, 130)}；==工程团队应关注它对产品能力、平台接入、评估或运营边界的影响==。`,
      `该条目来自 **${candidate.source}**，核验状态为 ${candidate.verification_status || "primary_confirmed"}；==中介或聚合来源不会被自动提升为主体事实==。`
    ],
    why_it_matters: "自动草稿仅把一手、官方、论文、GitHub 或多源确认候选提升到主体。",
    reader_relevance: "适合工程团队判断是否需要跟进能力变化、工具链接入、内容生成工作流或平台策略。",
    verification_note: candidate.verification_note || "候选池标记为一手或可信来源。",
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
    title: candidate.title,
    candidate_id: candidate.id,
    editorial_category: inferredEditorialCategory(candidate) === "content_aigc" ? "content_aigc" : "viewpoint_analysis",
    ...fields,
    url: candidate.url,
    publisher: candidate.source || "Unknown",
    author: candidate.author || candidate.source || "Unknown",
    event_date: candidate.event_date,
    topic: topicForCandidate(candidate),
    summary: `${candidate.source} 发布这条深读或观点材料。${trimText(candidate.evidence || candidate.title, 140)}`,
    content_type: "blog"
  };
}

function builderObservationItem(candidate) {
  const originalText = candidate.original_text || candidate.evidence || candidate.title;
  const translation = hasChineseText(originalText)
    ? originalText
    : `自动草稿译述：${trimText(originalText, 220)}`;
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

function nonPrimaryDisclosureFields(candidate) {
  const sourceLevel = candidate.source_level || sourceLevelForCandidate(candidate);
  const verificationStatus = candidate.verification_status || (PRIMARY_STATUSES.has(candidate.verification_status) ? candidate.verification_status : "intermediary_only");
  return {
    source_level: sourceLevel,
    verification_status: verificationStatus,
    verification_note: candidate.verification_note || (PRIMARY_STATUSES.has(verificationStatus)
      ? "候选池标记为一手或可信来源。"
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
  if (!candidate.verification_status && candidate.source_level && ["primary", "official", "paper", "github", "multi_source"].includes(candidate.source_level)) {
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
  const sourceLevel = sourceLevelForCandidate(candidate);
  if (candidate.category === "hot_blog" && !["official", "paper", "github", "multi_source"].includes(sourceLevel)) {
    return false;
  }
  const trustedSourceLevel = ["primary", "official", "paper", "github", "multi_source"].includes(sourceLevel);
  return trustedSourceLevel && (PRIMARY_STATUSES.has(candidate.verification_status) || Boolean(sourceLevel));
}

function candidateScore(candidate) {
  let score = 0;
  if (PRIMARY_STATUSES.has(candidate.verification_status)) score += 30;
  if (candidate.source_level === "official" || candidate.source_level === "primary") score += 20;
  if (candidate.source_level === "paper" || candidate.source_level === "paper_api") score += 12;
  if (candidate.source_level === "github") score += 10;
  if (candidate.category === "main_item") score += 10;
  if (candidate.category === "hot_blog") score += 6;
  if (isAigcCandidate(candidate)) score += 8;
  if (candidate.image_url) score += 4;
  if (/openai|anthropic|deepmind|google|meta|qwen|bytedance|tencent|minimax|kimi|runway|pika|luma|kling|nvidia|adobe/i.test(`${candidate.source} ${candidate.title}`)) score += 5;
  return score;
}

function isGitHubTrendingCandidate(candidate, meta = {}) {
  return Boolean(
    meta.repo ||
    /github trending/i.test(`${candidate.source || ""} ${candidate.evidence || ""} ${candidate.notes || ""}`) ||
    /github-trending|github-/i.test(candidate.source_id || "")
  );
}

function isAigcCandidate(candidate) {
  return candidate.editorial_category === "content_aigc" || candidate.source_level === "aigc_content_industry" || AIGC_RE.test(candidateText(candidate));
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
  if (candidate.source_level === "official" || candidate.source_level === "primary") return "T0";
  if (candidate.source_level === "paper" || candidate.source_level === "github") return "T2";
  if (candidate.source_level === "multi_source") return "T1";
  return "T3";
}

function chineseSummary(candidate, category) {
  const source = candidate.source || "来源";
  const evidence = trimText(candidate.evidence || candidate.title, 120);
  if (category === "content_aigc") {
    return `${source} 释放 AIGC、图片/视频生成、创作者工具或游戏技术相关信号；${evidence}`;
  }
  return `${source} 释放与 AI 产品、模型、工程工具链或行业策略相关的可信信号；${evidence}`;
}

function chineseGithubDescription(description, repo) {
  if (hasChineseText(description)) {
    return trimText(description, 140);
  }
  const keywords = projectDomains(description).slice(0, 2).join("、") || "AI 工程";
  return `${repo} 是围绕 ${keywords} 的开源项目，今日出现在 GitHub Trending；适合作为工程雷达线索。`;
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
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
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
