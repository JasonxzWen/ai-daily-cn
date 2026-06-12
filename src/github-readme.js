const DEFAULT_MAX_CHARS = 120;

export function githubReadmeCacheKey(input) {
  const repo = normalizeRepo(input?.repo || input?.name || input);
  const branch = safeKeyPart(input?.defaultBranch || input?.branch || "main");
  const sha = safeKeyPart(input?.sha || input?.commitSha || input?.commit || "unknown");
  return `github-readme/${repo}/${branch}/${sha}`;
}

export function summarizeGithubReadme(input = {}) {
  const repo = normalizeRepo(input.repo || input.name || "");
  const maxChars = Number.isFinite(input.maxChars) ? Math.max(80, Math.floor(input.maxChars)) : DEFAULT_MAX_CHARS;
  const readme = cleanReadmeText(input.readme || input.content || "");
  const projectName = titleFromReadme(readme) || repo.split("/").at(-1) || "该项目";
  const sentences = readme
    .split(/(?<=[.!?。！？])\s+|\n+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 20 && !/^#+\s/.test(item));
  const source = sentences.slice(0, 4).join(" ");
  const capability = pickCapability(source || readme);
  const maturity = pickMaturity(source || readme);
  const scenario = pickScenario(source || readme);
  const englishContext = compactWords(source || readme, 18);
  const base = `${projectName} 是面向 ${scenario} 的开源项目，核心能力包括${capability}。README 显示它已提供${maturity}，适合先评估架构、依赖和运行示例后再接入生产流程。${englishContext}`;
  return clampChineseSummary(base, maxChars);
}

export function applyGithubReadmeSummary(item = {}, summaryInfo = {}) {
  const summary = String(summaryInfo.summary || summaryInfo.readme_summary || "").trim();
  if (!summary) {
    return { ...item };
  }
  const repo = normalizeRepo(item.repo || item.name || summaryInfo.repo || "");
  const cacheKey = summaryInfo.cacheKey || githubReadmeCacheKey({
    repo,
    defaultBranch: summaryInfo.defaultBranch,
    sha: summaryInfo.sha
  });
  return {
    ...item,
    description: summary,
    readme_summary: summary,
    readme_cache: {
      key: cacheKey,
      hit: summaryInfo.hit !== false,
      repo,
      sha: summaryInfo.sha || "",
      default_branch: summaryInfo.defaultBranch || summaryInfo.branch || "main",
      source_url: summaryInfo.sourceUrl || summaryInfo.url || ""
    }
  };
}

export function normalizeRepo(value) {
  const text = String(value || "").trim().replace(/^https:\/\/github\.com\//i, "");
  const match = text.match(/^([^/\s]+)\/([^/\s#?]+)/);
  if (!match) {
    return text.replace(/^\/+|\/+$/g, "").toLowerCase();
  }
  return `${match[1].toLowerCase()}/${match[2].replace(/\.git$/i, "").toLowerCase()}`;
}

function cleanReadmeText(value) {
  return String(value || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/[#>*_~|-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleFromReadme(readme) {
  const match = String(readme || "").match(/^([A-Z][A-Za-z0-9_. -]{2,80})\b/);
  return match ? match[1].trim() : "";
}

function pickCapability(text) {
  const value = String(text || "").toLowerCase();
  const parts = [];
  if (/agent/.test(value)) parts.push("Agent 构建");
  if (/evaluat|benchmark|test|ci/.test(value)) parts.push("评测与回归");
  if (/debug|trace|replay|observability/.test(value)) parts.push("调试追踪");
  if (/browser|tool|runner|workflow/.test(value)) parts.push("工具调用和工作流编排");
  if (/memory|rag|retrieval|knowledge/.test(value)) parts.push("记忆或知识检索");
  if (/api|sdk|adapter|package/.test(value)) parts.push("API/SDK 适配");
  return unique(parts).slice(0, 4).join("、") || "项目框架、示例代码和可复用工具链";
}

function pickMaturity(text) {
  const value = String(text || "").toLowerCase();
  const parts = [];
  if (/typescript|python|package|sdk/.test(value)) parts.push("可复用包");
  if (/example|demo|sample/.test(value)) parts.push("示例");
  if (/ci|test|fixture|benchmark|evaluation/.test(value)) parts.push("测试或评测资产");
  if (/docker|deploy|production/.test(value)) parts.push("部署说明");
  return unique(parts).join("、") || "README 说明和使用入口";
}

function pickScenario(text) {
  const value = String(text || "").toLowerCase();
  if (/local|workspace|developer|coding|code/.test(value)) return "开发者本地工作流";
  if (/enterprise|admin|policy|observability/.test(value)) return "企业 AI 落地";
  if (/browser|web/.test(value)) return "浏览器自动化";
  if (/data|rag|knowledge|retrieval/.test(value)) return "知识库和数据应用";
  return "AI 工程实践";
}

function compactWords(text, count) {
  const words = String(text || "")
    .split(/\s+/)
    .map((word) => word.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, ""))
    .filter((word) => /^[A-Za-z][A-Za-z0-9_.-]{2,}$/.test(word));
  return unique(words).slice(0, count).join(" ");
}

function clampChineseSummary(text, maxChars) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= maxChars) {
    return clean;
  }
  const target = Math.max(80, maxChars);
  const sliced = clean.slice(0, target).replace(/[，。；、：,.;:\s]+$/u, "");
  return `${sliced}。`;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function safeKeyPart(value) {
  return String(value || "unknown").trim().replace(/[^A-Za-z0-9._-]+/g, "-") || "unknown";
}
