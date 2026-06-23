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

export function githubTrendStatusMeta(item) {
  const trend = item?.trend === "up" || item?.trend === "down" || item?.trend === "same"
    ? item.trend
    : "new";
  const delta = Number.isInteger(item?.rank_delta) ? Math.abs(item.rank_delta) : null;

  if (trend === "up" && delta !== null) {
    return { trend, label: `↑ UP +${delta}` };
  }
  if (trend === "down" && delta !== null) {
    return { trend, label: `↓ DOWN -${delta}` };
  }
  if (trend === "same") {
    return { trend, label: "SAME" };
  }
  return { trend: "new", label: "NEW" };
}

export function githubTrendStatusTag(item) {
  return githubTrendStatusMeta(item).label;
}

export function githubTrendStatusHighlightTag(item) {
  const status = githubTrendStatusMeta(item);
  return `trend-${status.trend}|${status.label}`;
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
  const raw = typeof item === "object" ? githubTrendDescriptionSource(item) : item;
  const withoutRepoPrefix = removeRepoPrefix(String(raw || ""), repo)
    .replace(new RegExp(`^${escapeRegex(repo || "")}\\s*[：:]\\s*`, "i"), "")
    .replace(/^今天进入 GitHub Trending Top 10，仓库简介写的是：/u, "")
    .replace(/^今天进入 GitHub Trending Top 10，公开描述把它定位在/u, "可作为")
    .replace(/今天进入 GitHub Trending Top 10，仓库简介写的是：/u, "：")
    .replace(/今天进入 GitHub Trending Top 10，公开描述把它定位在/u, "可作为")
    .replace(/(?:今天)?进入 GitHub Trending Top 10[，,]?\s*/giu, "")
    .replace(/可作为[^。；;]*?(?:实现线索|观察)[。；;]?/gu, "")
    .replace(/优先核对 README 示例、许可证、近期维护和本地复现门槛[。；;]?/gu, "")
    .replace(/重点看 README、许可证、近期维护和可复现门槛[。；;]?/gu, "")
    .replace(/，仓库首页当前围绕这条能力展开。?$/u, "观察。");
  const translated = translateKnownGithubDescription(withoutRepoPrefix, repo);
  if (isGenericGithubTrendDescription(raw) || isGenericGithubTrendDescription(translated)) {
    return "";
  }
  return cleanProjectDescription(translated);
}

function githubTrendDescriptionSource(item = {}) {
  const readmeSummary = String(item.readme_summary || item.github_readme_summary || "").trim();
  if (readmeSummary) {
    return readmeSummary;
  }
  return "";
}

function isGenericGithubTrendDescription(value) {
  if (/README\s*主要围绕|阅读时先看|提供README|提供可复用包|测试或评估资产|README 将该仓库定位为|核心能力集中在|它的价值在于|具体阅读时|适合评估[^。]*README/u.test(String(value || ""))) {
    return true;
  }
  return /进入 GitHub Trending Top 10|优先核对 README|重点看 README|可作为[^。；;]*?(?:实现线索|观察)|AI 工程工具方向的开源项目观察/u.test(String(value || ""));
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
