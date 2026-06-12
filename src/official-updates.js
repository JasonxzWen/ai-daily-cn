const OFFICIAL_SOURCE_LEVELS = new Set([
  "official_company_news",
  "official_open_source_account",
  "official_model_host_account",
  "primary",
  "official"
]);

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
  const detail = evidence || "官方来源发布了与 AI 产品、模型、平台、开发者生态或企业采用相关的更新。";
  return boundedText(`${organization} 的官方动态「${title}」显示，${detail} 该条目单独放入官方组织动态，便于和个人讨论、社区线索区分；读者可通过原始 URL 继续核对发布时间、适用范围和后续行动。`, 180, 90, 240);
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
