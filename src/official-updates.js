const OFFICIAL_SOURCE_LEVELS = new Set([
  "official_company_news",
  "official_open_source_account",
  "official_model_host_account"
]);

const NON_OFFICIAL_VERIFICATION_RE = /intermediary|unverified|platform_exempt|original_social/i;

const ORGANIZATION_RULES = [
  ["OpenAI", /openai/i],
  ["Anthropic", /anthropic|claude/i],
  ["Google DeepMind", /deepmind|gemini|google/i],
  ["GitHub", /github/i],
  ["Hugging Face", /hugging\s*face/i],
  ["Meta AI", /meta|llama/i],
  ["Microsoft", /microsoft|azure/i],
  ["xAI", /\bxai\b|x\.ai|grok/i],
  ["Perplexity", /perplexity/i],
  ["Mistral", /mistral/i],
  ["DeepSeek", /deepseek/i],
  ["Qwen", /qwen|通义|alibaba/i],
  ["Moonshot AI", /moonshot|kimi/i],
  ["MiniMax", /minimax/i],
  ["Zhipu AI", /zhipu|z\.ai|智谱/i],
  ["Tencent Hunyuan", /tencent|hunyuan|混元/i],
  ["ByteDance Seed", /bytedance|seed|字节/i]
];

export function selectOfficialOrgUpdates(candidates = [], options = {}) {
  const reportDate = String(options.reportDate || "").slice(0, 10);
  const limit = Number.isFinite(options.limit) ? options.limit : 16;
  const seen = new Set();
  const items = [];
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    if (!isOfficialOrganizationCandidate(candidate)) {
      continue;
    }
    if (reportDate && String(candidate?.event_date || "").slice(0, 10) !== reportDate) {
      continue;
    }
    const key = stableUrl(candidate?.url || candidate?.id || candidate?.title);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    items.push(officialOrgUpdateItem(candidate));
    if (items.length >= limit) {
      break;
    }
  }
  return items;
}

export function isOfficialOrganizationCandidate(candidate = {}) {
  const sourceLevel = String(candidate.source_level || "").trim();
  if (!OFFICIAL_SOURCE_LEVELS.has(sourceLevel)) {
    return false;
  }
  const verificationStatus = String(candidate.verification_status || "").trim();
  if (verificationStatus && NON_OFFICIAL_VERIFICATION_RE.test(verificationStatus)) {
    return false;
  }
  const text = [
    candidate.source,
    candidate.publisher,
    candidate.title,
    candidate.url,
    candidate.primary_url
  ].filter(Boolean).join(" ");
  return Boolean(organizationFromText(text));
}

export function officialOrgUpdateItem(candidate = {}) {
  const organization = organizationFromText([
    candidate.source,
    candidate.publisher,
    candidate.title,
    candidate.url,
    candidate.primary_url
  ].filter(Boolean).join(" ")) || cleanText(candidate.source || "Official source");
  const title = cleanText(candidate.title || candidate.name || `${organization} update`);
  return {
    candidate_id: candidate.id || candidate.candidate_id || stableId(`${organization}-${title}`),
    organization,
    title,
    url: candidate.url || candidate.primary_url || "",
    source: candidate.source || candidate.publisher || organization,
    event_date: String(candidate.event_date || "").slice(0, 10),
    summary: summarizeOfficialUpdate(candidate, organization),
    source_level: String(candidate.source_level || "official_company_news"),
    verification_status: candidate.verification_status || "primary_confirmed"
  };
}

function summarizeOfficialUpdate(candidate, organization) {
  const title = cleanText(candidate.title || candidate.name || "");
  const evidence = cleanText(candidate.summary || candidate.evidence || candidate.description || "");
  const detail = readerFacingOfficialDetail(candidate, organization, title, evidence);
  return boundedText(`${organization} 的官方动态「${title}」显示，${detail} 该条目单独放入官方组织动态，便于和个人讨论、社区线索区分；读者可通过原始 URL 继续核对发布时间、适用范围和后续行动。`, 180, 90, 240);
}

function readerFacingOfficialDetail(candidate, organization, title, evidence) {
  const cleanEvidence = sanitizeOfficialEvidence(evidence);
  if (cleanEvidence) {
    return cleanEvidence;
  }
  const lowerTitle = String(title || "").toLowerCase();
  const sourceText = [
    organization,
    candidate.source,
    candidate.publisher,
    candidate.url,
    candidate.primary_url
  ].filter(Boolean).join(" ").toLowerCase();
  if (/preply|human tutors?|personalize learning|personalise learning/.test(lowerTitle)) {
    return "这条更新介绍 Preply 如何把 AI 练习、课程总结和反馈能力与真人教师辅导结合，用于个性化语言学习。";
  }
  if (/combatting ai scams?|ai scams?|security|legislation/.test(lowerTitle)) {
    return "这条更新围绕 AI 诈骗防护、安全能力和立法协作展开，说明平台如何把安全治理落到产品和政策动作中。";
  }
  if (/status|incident|errors?|outage/.test(lowerTitle) || /status/.test(sourceText)) {
    return "这条状态更新记录了平台服务可用性变化，适合用于追踪受影响组件、恢复进度和稳定性风险。";
  }
  if (/github|release|changelog|open source|repository|model|dataset|weights?/.test(lowerTitle)) {
    return "这条更新涉及官方开源、模型、数据集或开发者生态变化，适合和产品发布及工程采用节奏一起跟踪。";
  }
  return "官方来源发布了与 AI 产品、模型、平台、开发者生态或企业采用相关的更新。";
}

function sanitizeOfficialEvidence(value) {
  const clean = cleanText(value);
  if (!clean) {
    return "";
  }
  if (containsInternalReviewLanguage(clean) || containsLongEnglishExcerpt(clean)) {
    return "";
  }
  const chineseChars = (clean.match(/\p{Script=Han}/gu) || []).length;
  const latinChars = (clean.match(/[A-Za-z]/g) || []).length;
  const ratioBase = chineseChars + latinChars;
  if (ratioBase > 0 && chineseChars / ratioBase < 0.35) {
    return "";
  }
  return clean;
}

function containsInternalReviewLanguage(value) {
  return /Treat this as a community lead|unless it is backed by a primary source|trace it to a primary source|intermediary\/self-media lead|待确认|仅作(?:发现|社区)?线索|事实性结论/i.test(String(value || ""));
}

function containsLongEnglishExcerpt(value) {
  return /[A-Za-z@][A-Za-z0-9 @_,;:'"()[\]\/.!?+~`#-]{60,}/.test(String(value || ""));
}

function organizationFromText(text) {
  const value = String(text || "");
  const match = ORGANIZATION_RULES.find(([, pattern]) => pattern.test(value));
  return match ? match[0] : "";
}

function boundedText(value, target, min, max) {
  const clean = cleanText(value);
  if (clean.length > max) {
    return `${clean.slice(0, max - 1).replace(/[，。；、：,.;:\s]+$/u, "")}。`;
  }
  if (clean.length >= min) {
    return clean;
  }
  const filler = " 该官方条目用于追踪组织层面的产品、平台或生态变化。";
  let next = clean;
  while (next.length < Math.min(target, max - 1)) {
    next += filler;
  }
  return `${next.slice(0, max - 1).replace(/[，。；、：,.;:\s]+$/u, "")}。`;
}

function cleanText(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stableUrl(value) {
  return String(value || "").trim().toLowerCase();
}

function stableId(value) {
  return String(value || "official-org-update")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "official-org-update";
}
