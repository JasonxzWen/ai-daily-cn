const CHINESE_MEDIA_SOURCES = [
  {
    source_key: "qbitai",
    ids: ["intermediary-qbitai"],
    names: [/qbitai/i, /量子位/],
    hosts: ["qbitai.com"],
    display_name: "QbitAI"
  },
  {
    source_key: "sspai",
    ids: ["intermediary-sspai"],
    names: [/sspai/i, /少数派/],
    hosts: ["sspai.com"],
    display_name: "SSPAI"
  },
  {
    source_key: "jiqizhixin",
    ids: ["intermediary-jiqizhixin"],
    names: [/jiqizhixin/i, /machine heart/i, /机器之心/],
    hosts: ["jiqizhixin.com"],
    display_name: "Jiqizhixin"
  }
];

export function selectChineseMediaDynamics(candidates = [], options = {}) {
  const reportDate = String(options.reportDate || "").slice(0, 10);
  const seen = new Set();
  const items = [];
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const source = chineseMediaSourceForCandidate(candidate);
    if (!source) {
      continue;
    }
    if (reportDate && String(candidate?.event_date || "").slice(0, 10) !== reportDate) {
      continue;
    }
    if (!isUsefulChineseMediaCandidate(candidate)) {
      continue;
    }
    const urlKey = stableUrl(candidate?.url || candidate?.id || candidate?.title);
    if (seen.has(urlKey)) {
      continue;
    }
    seen.add(urlKey);
    items.push(chineseMediaItem(candidate, source));
  }

  return {
    items,
    source_statuses: CHINESE_MEDIA_SOURCES.map((source) => sourceStatus(source, options.sourceAudit))
  };
}

export function chineseMediaItem(candidate, source) {
  const title = cleanText(candidate?.title || candidate?.name || "中文媒体动态");
  const summary = summarizeChineseMediaCandidate(candidate, source);
  return {
    candidate_id: candidate?.id || candidate?.candidate_id || stableId(`${source.source_key}-${title}`),
    title,
    url: candidate?.url || candidate?.primary_url || "",
    publisher: source.display_name,
    author: candidate?.author || source.display_name,
    event_date: String(candidate?.event_date || "").slice(0, 10),
    topic: candidate?.topic || "中文 AI 媒体动态",
    summary,
    key_points: candidate?.key_points || deriveKeyPoints(summary),
    source_level: "intermediary",
    verification_status: "intermediary_only",
    verification_note: "中文媒体二手整理，事实性结论仍需回到原始来源核对。",
    risk_note: "作为读者关注线索收录，不提升为主线事实。"
  };
}

export function summarizeChineseMediaCandidate(candidate, source) {
  const title = cleanText(candidate?.title || candidate?.name || "");
  const evidence = cleanText(candidate?.summary || candidate?.evidence || candidate?.description || candidate?.content || "");
  const detail = evidence || "该条目提供中文语境下的 AI 行业、产品或工程动态。";
  const base = title && !detail.includes(title) ? `${title}：${detail}` : detail || title;
  return boundedText(base, 140, 40, 180);
}

export function chineseMediaSourceForCandidate(candidate = {}) {
  const id = String(candidate.source_id || candidate.sourceId || "").toLowerCase();
  const sourceName = String(candidate.source || candidate.publisher || candidate.name || "").toLowerCase();
  const urlHost = hostForUrl(candidate.url || candidate.primary_url || "");
  return CHINESE_MEDIA_SOURCES.find((source) =>
    source.ids.some((item) => item.toLowerCase() === id) ||
    source.names.some((pattern) => pattern.test(sourceName)) ||
    source.hosts.some((host) => urlHost === host || urlHost.endsWith(`.${host}`))
  ) || null;
}

function isUsefulChineseMediaCandidate(candidate = {}) {
  const text = cleanText([
    candidate.title,
    candidate.name,
    candidate.summary,
    candidate.evidence,
    candidate.description,
    candidate.content
  ].filter(Boolean).join(" "));
  if (!text) {
    return false;
  }
  if (isLowValueChineseMediaEvent(text)) {
    return false;
  }
  return /AI|AIGC|agent|LLM|RAG|GPU|Copilot|OpenAI|Claude|Gemini|Qwen|DeepSeek|模型|大模型|智能体|机器学习|深度学习|推理|训练|算力|云|知识库|语义|助手|机器人|世界模型|开源|工程/i.test(text);
}

function isLowValueChineseMediaEvent(text) {
  return /ciga|cg[jJ]\d*|game\s*jam|线下活动|召集令|少数派站|活动定位|没有评比|公园|猫咪|饮品|做人呐|最重要是开心/i.test(text);
}

function sourceStatus(source, sourceAudit) {
  const auditSource = findAuditSource(source, sourceAudit);
  if (!auditSource) {
    return {
      source_key: source.source_key,
      name: source.display_name,
      status: "missing_audit",
      url: "",
      notes: "This source was expected but no source_audit record was found."
    };
  }
  return {
    source_key: source.source_key,
    name: auditSource.name || source.display_name,
    status: auditSource.status || "checked",
    url: auditSource.url || "",
    notes: auditSource.notes || auditSource.error || auditSource.blocked_reason || ""
  };
}

function findAuditSource(source, sourceAudit = {}) {
  const groups = [
    sourceAudit.content_sources,
    sourceAudit.china_ai_sources,
    sourceAudit.sources_health
  ].filter(Boolean);
  for (const group of groups) {
    for (const item of Array.isArray(group.sources) ? group.sources : []) {
      if (chineseMediaSourceForCandidate({ ...item, source_id: item.id, source: item.name, url: item.url })?.source_key === source.source_key) {
        return item;
      }
    }
  }
  return null;
}

function deriveKeyPoints(summary) {
  const sentences = String(summary || "")
    .split(/[。！？!?]/)
    .map((item) => item.trim())
    .filter(Boolean);
  return sentences.slice(0, 3);
}

function boundedText(value, target, min, max) {
  const clean = cleanText(value);
  if (clean.length > max) {
    return `${clean.slice(0, max - 1).replace(/[，。；、：,.;:\s]+$/u, "")}。`;
  }
  if (clean.length >= min) {
    return clean;
  }
  const filler = " 该条目保留为中文信息源观察，方便读者判断是否继续追踪原文、官方公告或社区讨论。";
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
  return String(value || "chinese-media")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "chinese-media";
}

function hostForUrl(url) {
  try {
    return new URL(String(url || "")).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}
