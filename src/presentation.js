export function modelReleaseTags(item) {
  const notes = String(item?.notes || "");
  const tags = [modelReleaseScopeLabel(item?.release_scope)];

  if (/同时出现在|同时出现|多处|多个来源|多个平台|相关发布/.test(notes)) {
    tags.push("多平台可见");
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

export function githubTrendTags(item) {
  return unique([githubTrendStatusTag(item)]);
}

export function githubTrendStatusTag(item) {
  const trend = item?.trend === "up" || item?.trend === "down" || item?.trend === "same"
    ? item.trend
    : "new";
  const delta = Number.isInteger(item?.rank_delta) ? Math.abs(item.rank_delta) : null;

  if (trend === "up" && delta !== null) {
    return `up +${delta}`;
  }
  if (trend === "down" && delta !== null) {
    return `down -${delta}`;
  }
  return trend;
}

export function githubTrendMovementLabel(item) {
  if (!item || item.trend === "new" || item.previous_rank === null) {
    return "新上榜";
  }
  if (item.trend === "up" && Number.isInteger(item.rank_delta)) {
    return `上升 ${Math.abs(item.rank_delta)} 名`;
  }
  if (item.trend === "down" && Number.isInteger(item.rank_delta)) {
    return `下降 ${Math.abs(item.rank_delta)} 名`;
  }
  if (item.trend === "same") {
    return "持平";
  }
  return "";
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

export function cleanGithubTrendDescription(item) {
  const repo = typeof item === "object" ? item?.repo : "";
  const raw = typeof item === "object" ? item?.description : item;
  const withoutRepoPrefix = removeRepoPrefix(String(raw || ""), repo);
  return cleanProjectDescription(translateKnownGithubDescription(withoutRepoPrefix, repo));
}

function translateKnownGithubDescription(value, repo) {
  const text = value.trim();
  const normalized = text.toLowerCase();

  if (/moneyprinterturbo/i.test(repo) || /generate short videos with one click/i.test(normalized)) {
    return "利用 AI 大模型一键生成高清短视频。";
  }
  if (/understand-anything/i.test(repo) || /turn any code into an interactive knowledge graph/i.test(normalized)) {
    return "把代码转换成可探索、可搜索、可提问的交互式知识图谱，支持 Claude Code、Codex、Cursor、Copilot、Gemini CLI 等工具。";
  }
  if (/stop-slop/i.test(repo) || /removing ai tells from prose/i.test(normalized)) {
    return "用于去除文章中常见 AI 痕迹的 skill 文件。";
  }
  if (/\/ecc$/i.test(repo) || /agent harness performance optimization system/i.test(normalized)) {
    return "面向 Claude Code、Codex、opencode、Cursor 等工具的 agent harness 性能优化体系，覆盖 skills、memory、安全和研究优先开发流程。";
  }
  if (/knowledge-work-plugins/i.test(repo) || /plugins primarily intended for knowledge workers/i.test(normalized)) {
    return "Anthropic 面向 Claude Cowork 知识工作场景开放的插件仓库。";
  }
  if (/taste-skill/i.test(repo) || /gives your ai good taste/i.test(normalized)) {
    return "用于约束 AI 输出风格、减少空泛生成的 skill 文件。";
  }
  if (/\/heretic$/i.test(repo) || /censorship removal for language models/i.test(normalized)) {
    return "用于自动移除语言模型审查限制的工具。";
  }
  if (/\/kronos$/i.test(repo) || /foundation model for the language of financial markets/i.test(normalized)) {
    return "面向金融市场序列语言的基础模型。";
  }
  if (/anthropic-cybersecurity-skills/i.test(repo) || /structured cybersecurity skills for ai agents/i.test(normalized)) {
    return "为 AI agents 准备的结构化网络安全 skills，映射 MITRE ATT&CK、NIST CSF、MITRE ATLAS、D3FEND 与 NIST AI RMF，并面向 Claude Code、GitHub Copilot、Codex CLI、Cursor、Gemini CLI 等平台。";
  }
  if (/twentyhq\/twenty/i.test(repo) || /open alternative to salesforce/i.test(normalized)) {
    return "面向 AI 场景设计的开源 Salesforce 替代方案。";
  }

  return text;
}

function removeRepoPrefix(value, repo) {
  const text = value.trim();
  if (!repo || !repo.includes("/")) {
    return text;
  }
  const [owner, name] = repo.split("/");
  return text
    .replace(new RegExp(`^${escapeRegex(owner)}\\s*/\\s*${escapeRegex(name)}\\s*`, "i"), "")
    .replace(new RegExp(`^${escapeRegex(owner)}\\s+\\/\\s+${escapeRegex(name)}\\s*`, "i"), "")
    .trim();
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}
