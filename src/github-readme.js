const DEFAULT_MAX_CHARS = 170;

const ZH = {
  mainlyAbout: "\u4e3b\u8981\u56f4\u7ed5",
  provides: "\u63d0\u4f9b",
  readFirst: "\u9605\u8bfb\u65f6\u5148\u770b",
  agentBuild: "Agent \u6784\u5efa",
  evaluation: "\u8bc4\u6d4b\u4e0e\u56de\u5f52",
  debugging: "\u8c03\u8bd5\u8ffd\u8e2a",
  toolWorkflow: "\u5de5\u5177\u8c03\u7528\u548c\u5de5\u4f5c\u6d41\u7f16\u6392",
  knowledge: "\u8bb0\u5fc6\u6216\u77e5\u8bc6\u68c0\u7d22",
  apiSdk: "API/SDK \u9002\u914d",
  projectFramework: "\u9879\u76ee\u6846\u67b6\u3001\u793a\u4f8b\u4ee3\u7801\u548c\u53ef\u590d\u7528\u5de5\u5177\u94fe",
  reusablePackage: "\u53ef\u590d\u7528\u5305",
  examples: "\u793a\u4f8b",
  testAssets: "\u6d4b\u8bd5\u6216\u8bc4\u4f30\u8d44\u4ea7",
  deployDocs: "\u90e8\u7f72\u8bf4\u660e",
  readmeUsage: "README \u8bf4\u660e\u548c\u4f7f\u7528\u5165\u53e3",
  quickStart: "\u5feb\u901f\u5f00\u59cb\u548c\u8fd0\u884c\u524d\u63d0",
  exampleCoverage: "\u793a\u4f8b\u8986\u76d6",
  license: "\u8bb8\u53ef\u8bc1",
  integrationBoundary: "\u96c6\u6210\u8fb9\u754c",
  testReview: "\u6d4b\u8bd5\u6216\u8bc4\u6d4b\u8d44\u4ea7",
  defaultChecks: "\u5feb\u901f\u5f00\u59cb\u3001\u8fd0\u884c\u524d\u63d0\u3001\u8bb8\u53ef\u8bc1\u548c\u8fd1\u671f\u7ef4\u62a4"
};

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
  const signal = extractReadmeSignal(readme);
  const source = signal || readme;
  const subject = pickCapability(source);
  const deliverables = pickMaturity(source);
  const checkpoints = pickReadmeCheckpoints(source);
  const label = repoDisplayName(repo);
  const prefix = label ? `${label} README ${ZH.mainlyAbout}` : `README ${ZH.mainlyAbout}`;
  const summary = `${prefix}${subject}\uff0c${ZH.provides}${deliverables}\u3002${ZH.readFirst}${checkpoints}\u3002`;
  return clampChineseSummary(summary, maxChars);
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

function extractReadmeSignal(value) {
  return String(value || "")
    .split(/(?<=[.!?。！？])\s+|\n+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 20)
    .filter((item) => !/^(table of contents|contents|installation|license|contributing)$/i.test(item))
    .filter((item) => !/(badge|shields\.io|npm version|build status)/i.test(item))
    .slice(0, 5)
    .join(" ");
}

function repoDisplayName(repo) {
  const text = String(repo || "").trim();
  if (!text) {
    return "";
  }
  const parts = text.split("/");
  return parts[1] || parts[0] || "";
}

function pickCapability(text) {
  const value = String(text || "").toLowerCase();
  const parts = [];
  if (/agent/.test(value)) parts.push(ZH.agentBuild);
  if (/evaluat|benchmark|test|ci/.test(value)) parts.push(ZH.evaluation);
  if (/debug|trace|replay|observability/.test(value)) parts.push(ZH.debugging);
  if (/browser|tool|runner|workflow/.test(value)) parts.push(ZH.toolWorkflow);
  if (/memory|rag|retrieval|knowledge/.test(value)) parts.push(ZH.knowledge);
  if (/api|sdk|adapter|package/.test(value)) parts.push(ZH.apiSdk);
  return unique(parts).slice(0, 4).join("\u3001") || ZH.projectFramework;
}

function pickMaturity(text) {
  const value = String(text || "").toLowerCase();
  const parts = [];
  if (/typescript|python|package|sdk/.test(value)) parts.push(ZH.reusablePackage);
  if (/example|demo|sample/.test(value)) parts.push(ZH.examples);
  if (/ci|test|fixture|benchmark|evaluation/.test(value)) parts.push(ZH.testAssets);
  if (/docker|deploy|production/.test(value)) parts.push(ZH.deployDocs);
  return unique(parts).join("\u3001") || ZH.readmeUsage;
}

function pickReadmeCheckpoints(text) {
  const value = String(text || "").toLowerCase();
  const parts = [];
  if (/quick\s*start|getting started|install|setup|usage|run\b/.test(value)) parts.push(ZH.quickStart);
  if (/example|demo|sample|template/.test(value)) parts.push(ZH.exampleCoverage);
  if (/license|mit|apache|commercial|terms/.test(value)) parts.push(ZH.license);
  if (/api|sdk|adapter|integration|package/.test(value)) parts.push(ZH.integrationBoundary);
  if (/test|ci|benchmark|evaluation|eval/.test(value)) parts.push(ZH.testReview);
  return unique(parts).slice(0, 4).join("\u3001") || ZH.defaultChecks;
}

function clampChineseSummary(text, maxChars) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= maxChars) {
    return clean;
  }
  const target = Math.max(80, maxChars);
  const sliced = clean.slice(0, target).replace(/[\uff0c\u3002\uff1b\u3001\uff1a,.;:\s]+$/u, "");
  return `${sliced}\u3002`;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function safeKeyPart(value) {
  return String(value || "unknown").trim().replace(/[^A-Za-z0-9._-]+/g, "-") || "unknown";
}
