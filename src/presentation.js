export function modelReleaseTags(item) {
  const notes = String(item?.notes || "");
  const tags = [modelReleaseScopeLabel(item?.release_scope)];

  if (/同时出现在|同时出现|多处|多个来源|多个平台|相关发布/.test(notes)) {
    tags.push("多平台信号");
  }
  if (/官方来源|官方|官方 changelog|官方网关|官方网关/.test(notes)) {
    tags.push("官方可用性");
  }
  if (/二手媒体|未使用/.test(notes)) {
    tags.push("只采官方");
  }
  if (/reasoning effort|non-reasoning/i.test(notes)) {
    tags.push("能力边界");
  }
  if (/RAG|rerank|离线评估|自有查询集/i.test(notes)) {
    tags.push("RAG 评估");
  }

  return unique(tags).slice(0, 3);
}

export function modelReleaseScopeLabel(scope) {
  const labels = {
    provider_official_launch: "厂商正式发布",
    gateway_availability: "网关可用",
    preview_access: "预览开放",
    model_card_update: "模型卡更新"
  };
  return labels[scope] || "";
}

export function projectHeatTags(item) {
  const evidence = String(item?.evidence || "");
  const tags = [];

  for (const match of evidence.matchAll(/([\d,]+)\s+stars?\s+(today|this week)/gi)) {
    const count = match[1];
    const window = match[2].toLowerCase();
    tags.push(window === "today" ? `今日 +${count} stars` : `本周 +${count} stars`);
  }

  if (tags.length === 0) {
    const source = String(item?.source || "");
    if (/typescript daily/i.test(source)) {
      tags.push("TypeScript daily");
    } else if (/python daily/i.test(source)) {
      tags.push("Python daily");
    } else if (/weekly/i.test(source)) {
      tags.push("Weekly trending");
    } else if (/daily/i.test(source)) {
      tags.push("Daily trending");
    }
  }

  return unique(tags).slice(0, 2);
}

export function cleanProjectDescription(value) {
  const text = String(value || "")
    .trim()
    .replace(/，在[^，。；]*(?:daily|weekly)[^，。；]*(?:中出现|出现)/gi, "")
    .replace(/，说明[^。；]+/g, "")
    .trim();

  if (!text) {
    return "";
  }
  return /[。！？.!?]$/.test(text) ? text : `${text}。`;
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}
