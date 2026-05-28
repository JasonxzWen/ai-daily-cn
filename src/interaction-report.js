import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { DEFAULT_SITE } from "./config.js";
import { PublisherError } from "./errors.js";
import { relativeAssetHref, reportRelativePaths } from "./paths.js";
import {
  cleanProjectDescription,
  githubTrendMovementLabel,
  githubTrendTags,
  modelReleaseTags,
  projectHeatTags
} from "./presentation.js";

const execFileAsync = promisify(execFile);

export function reportToInteractionInput(report) {
  const mainItems = Array.isArray(report.main_items) ? report.main_items : [];
  const modelReleases = Array.isArray(report.model_releases) ? report.model_releases : [];
  const hotBlogs = Array.isArray(report.hot_blogs) ? report.hot_blogs : [];
  const githubTrending = Array.isArray(report.github_trending) ? report.github_trending : [];
  const projects = Array.isArray(report.projects) ? report.projects : [];
  const builderObservations = Array.isArray(report.builder_observations) ? report.builder_observations : [];
  const communityLeads = Array.isArray(report.community_leads) ? report.community_leads : [];
  const heroHighlights = Array.isArray(report.hero_highlights) ? report.hero_highlights : [];
  const paths = reportRelativePaths(report.report_date);
  const dataHref = publicAssetUrl(report, paths.dataPath);
  const summaryCards = [
    { label: "报告日期", value: report.report_date },
    { label: "主体信息", value: String(mainItems.length) },
    githubTrending.length > 0 ? { label: "GitHub Trending", value: String(githubTrending.length) } : null,
    modelReleases.length > 0 ? { label: "模型发布", value: String(modelReleases.length) } : null,
    hotBlogs.length > 0 ? { label: "热门技术博客", value: String(hotBlogs.length) } : null,
    projects.length > 0 ? { label: "项目", value: String(projects.length) } : null,
    builderObservations.length > 0 ? { label: "Builder 观察", value: String(builderObservations.length) } : null
  ].filter(Boolean);
  const sections = [
    {
      type: "summary-cards",
      title: "日报概览",
      group: "summary",
      cards: summaryCards
    },
    {
      type: "markdown",
      title: "主线摘要",
      group: "summary",
      content: formatMainlineSummary(report.summary)
    },
    {
      type: "markdown",
      title: "主体信息",
      group: "main",
      content: formatMainItems(mainItems)
    }
  ];

  if (modelReleases.length > 0) {
    sections.push({
      type: "markdown",
      title: "模型发布",
      group: "main",
      content: formatModelReleases(modelReleases)
    });
  }
  if (hotBlogs.length > 0) {
    sections.push({
      type: "markdown",
      title: "热门技术博客",
      group: "main",
      content: formatHotBlogs(hotBlogs)
    });
  }
  if (githubTrending.length > 0) {
    sections.push({
      type: "markdown",
      title: "GitHub Trending 趋势",
      group: "projects",
      content: formatGithubTrending(githubTrending)
    });
  }
  if (projects.length > 0) {
    sections.push({
      type: "markdown",
      title: "今日值得关注的项目",
      group: "projects",
      content: formatProjects(projects)
    });
  }
  const signalSections = [formatBuilderObservations(builderObservations), formatCommunityLeads(communityLeads)].filter(Boolean);
  if (signalSections.length > 0) {
    sections.push({
      type: "markdown",
      title: "Builder 观察与社区线索",
      group: "signals",
      content: signalSections.join("\n\n")
    });
  }
  sections.push(
    {
      type: "markdown",
      title: "信源审计",
      group: "verification",
      content: formatSourceAudit(report.source_audit)
    },
    {
      type: "markdown",
      title: "自检与产物",
      group: "verification",
      content: `${formatSelfCheck(report.self_check)}\n\n- ${markdownLink(dataHref, "结构化 JSON")}`
    }
  );

  return {
    title: report.title,
    summary: formatHeroSummary(report.summary, heroHighlights),
    status: "complete",
    template: "research-explainer",
    renderMode: "pre-rendered",
    generatedAt: report.generated_at,
    intent: {
      audience: "3-10 年经验的研发工程师与技术管理者",
      primaryQuestion: `${report.report_date} 有哪些值得跟进的 AI 产品、模型、工程工具和开源项目动态？`,
      decision: "只保留有可回源证据、与工程工作流相关、且通过日报自检的条目。",
      timeBudget: "8 分钟",
      artifactKind: "research",
      successCriteria: [
        "主体信息不强行凑数",
        "项目和 Builder 观察与主体信息分开",
        "信源审计可见",
        "结构化 JSON 可追溯"
      ]
    },
    sections,
    nextActions: Array.isArray(report.self_check?.optimization_suggestions)
      ? report.self_check.optimization_suggestions.map((item) => item.suggestion).filter(Boolean).slice(0, 3)
      : []
  };
}

function formatHeroSummary(summary, heroHighlights = []) {
  const highlights = Array.isArray(heroHighlights) ? heroHighlights.filter((item) => item?.title && item?.url).slice(0, 3) : [];
  if (highlights.length > 0) {
    return highlights
      .map((item) => `- **${markdownLink(item.url, item.title)}**：${item.reason || ""}`.trim())
      .join("\n");
  }

  const clauses = splitSummaryClauses(summary).slice(0, 3);
  if (clauses.length < 2) {
    return String(summary || "").trim();
  }

  return clauses.map((clause) => `- ${shortenText(clause, 88)}`).join("\n");
}

function formatMainlineSummary(summary) {
  const clauses = splitSummaryClauses(summary);
  if (clauses.length < 2) {
    return `- **概览**：${String(summary || "").trim()}`;
  }

  const bullets = clauses.slice(0, 7).map((clause, index) => {
    const cleaned = cleanSummaryClause(clause);
    return `- **${inferSummaryLabel(cleaned, index)}**：${shortenText(cleaned, 105)}`;
  });

  if (clauses.length > bullets.length) {
    bullets.push(`- **未展开**：还有 ${clauses.length - bullets.length} 条内容见后续分区。`);
  }

  return bullets.join("\n");
}

function cleanSummaryClause(clause) {
  return String(clause || "")
    .replace(/^本轮重点集中在[^：:]*[：:]\s*/, "")
    .trim();
}

function inferSummaryLabel(clause, index) {
  const text = String(clause || "");
  const labels = [
    [/AWS|SageMaker|OpenAI-compatible|迁移/i, "SageMaker"],
    [/OpenAI Codex|Codex/i, "Codex"],
    [/Anthropic|Claude|Glasswing|Mythos|CVD|漏洞|安全/i, "安全扫描"],
    [/Google|Gemini|Antigravity|WebMCP|Managed Agents|托管 agent|agent 工程栈/i, "Google I/O"],
    [/GitHub Copilot|issue|任务路由|语义/i, "Copilot"],
    [/Mistral|Emmi|工业物理/i, "工业 AI"],
    [/Vercel|Qwen|Grok|Gateway/i, "模型入口"],
    [/Trending|coding-agent|代码图谱|memory|开源/i, "开源项目"],
    [/Builder feed|网络限制|未收录/i, "Builder 来源"],
    [/24\/48|48 小时|source_window|event_date|扩展到/i, "日期范围"]
  ];
  const match = labels.find(([pattern]) => pattern.test(text));
  return match ? match[1] : "概览";
}

function splitSummaryClauses(summary) {
  return String(summary || "")
    .replace(/\r\n/g, "\n")
    .split(/[；;。]\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function shortenText(value, maxLength) {
  const text = String(value || "").trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1)}…`;
}

export async function renderReportWithEffectiveInteract(report, options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const skillDir = await resolveSkillDir(rootDir, options.skillDir);
  const createScript = path.join(skillDir, "scripts", "create-interaction.mjs");
  const inputDir = path.join(rootDir, ".tmp", "effective-interact-daily", "inputs");
  const outputDir = path.join(rootDir, ".tmp", "effective-interact-daily", "html");
  const inputPath = path.join(inputDir, `${report.report_date}.json`);

  await fs.mkdir(inputDir, { recursive: true });
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(inputPath, `${JSON.stringify(reportToInteractionInput(report), null, 2)}\n`, "utf8");

  const { stdout } = await execFileAsync(process.execPath, [
    createScript,
    "--input",
    inputPath,
    "--out-dir",
    outputDir,
    "--slug",
    `ai-daily-${report.report_date}`,
    "--json"
  ], {
    cwd: rootDir,
    encoding: "utf8",
    maxBuffer: 1024 * 1024
  });

  let payload = null;
  try {
    payload = JSON.parse(stdout);
  } catch (error) {
    throw new PublisherError("effective_interact_output_invalid", "effective-interact 生成器输出不是有效 JSON。", {
      cause: error.message,
      stdout
    });
  }

  if (!payload.ok || !payload.outputPath) {
    throw new PublisherError("effective_interact_generation_failed", "effective-interact 生成器未返回有效 HTML 产物。", payload);
  }

  return normalizePublicHtml(await fs.readFile(payload.outputPath, "utf8"));
}

function publicAssetUrl(report, assetPath) {
  if (report.canonical_url && report.html_path) {
    return new URL(relativeAssetHref(report.html_path, assetPath), report.canonical_url).toString();
  }

  return new URL(assetPath, DEFAULT_SITE.siteUrl).toString();
}

async function resolveSkillDir(rootDir, requestedSkillDir) {
  if (requestedSkillDir) {
    return path.resolve(requestedSkillDir);
  }

  const candidates = [
    path.join(rootDir, ".codex/skills/effective-interact"),
    path.join(process.cwd(), ".codex/skills/effective-interact")
  ];
  for (const candidate of candidates) {
    try {
      await fs.access(path.join(candidate, "scripts", "create-interaction.mjs"));
      return path.resolve(candidate);
    } catch {
      // Try the next candidate.
    }
  }

  return path.resolve(candidates[0]);
}

function normalizePublicHtml(html) {
  return html.replaceAll('rel="noreferrer"', 'rel="noopener noreferrer"');
}

function formatMainItems(items) {
  if (items.length === 0) {
    return "暂无主体信息。";
  }

  return items
    .map((item, index) => {
      const bullets = item.bullets.map((bullet) => `  - ${bullet}`).join("\n");
      return `${index + 1}. **${item.title}**（${item.event_date}，${item.tier}）\n${bullets}\n  - 来源：${markdownLink(item.url, item.source)}`;
    })
    .join("\n\n");
}

function formatModelReleases(items) {
  if (items.length === 0) {
    return "暂无模型发布。";
  }

  return items
    .map((item) => `- **${item.name}**${formatHighlightTags(modelReleaseTags(item))}（${item.provider}，${item.availability}，${item.event_date}）：${item.summary} ${markdownLink(item.url, item.source)}`)
    .join("\n");
}

function formatHotBlogs(items) {
  if (items.length === 0) {
    return "";
  }

  return items
    .map((item) => `- **${markdownLink(item.url, item.title)}**（${item.publisher} / ${item.author}，${item.event_date}）：${item.summary}`)
    .join("\n");
}

function formatGithubTrending(items) {
  if (items.length === 0) {
    return "";
  }

  return items
    .slice(0, 8)
    .map((item) => {
      const tags = formatHighlightTags(githubTrendTags(item));
      const previous = item.previous_rank ? `，昨日 #${item.previous_rank}` : "";
      const movement = githubTrendMovementLabel(item);
      const movementText = movement ? `，${movement}` : "";
      return `- **${markdownLink(item.url, item.name || item.repo)}**${tags}：${cleanProjectDescription(item.description)}\n  - 排名：#${item.rank}${previous}${movementText}；来源：${item.source}${item.language ? `；语言：${item.language}` : ""}`;
    })
    .join("\n");
}

function formatProjects(items) {
  if (items.length === 0) {
    return "";
  }

  return items
    .map((item) => {
      const domains = Array.isArray(item.domains) && item.domains.length > 0 ? `\n  - 领域：${item.domains.join("、")}` : "";
      const useCase = item.use_case ? `\n  - 作用：${item.use_case}` : "";
      return `- **${markdownLink(item.url, item.name)}**${formatHighlightTags(projectHeatTags(item))}：${cleanProjectDescription(item.description)}${domains}${useCase}`;
    })
    .join("\n");
}

function formatHighlightTags(tags) {
  return tags.length > 0 ? ` ${tags.map((tag) => `==${tag}==`).join(" ")}` : "";
}

function formatBuilderObservations(items) {
  if (items.length === 0) {
    return "";
  }

  return `### Builder 观察\n\n${items
    .map((item) => `- **${item.author}**${item.role ? `（${item.role}）` : ""}：${item.content} ${markdownLink(item.url, item.source || "来源")}${item.evidence ? `\n  - 证据：${item.evidence}` : ""}`)
    .join("\n")}`;
}

function formatCommunityLeads(items) {
  if (items.length === 0) {
    return "";
  }

  return `### 社区线索\n\n${items.map((item) => `- ${item.content} ${markdownLink(item.url, "来源")}`).join("\n")}`;
}

function formatSourceAudit(audit) {
  if (!audit) {
    return "未记录信源审计。";
  }

  return [
    formatAuditGroup("GitHub Trending", audit.github_trending),
    formatAuditGroup("Builder 原始源", audit.builder_sources),
    audit.content_sources ? formatAuditGroup("热门博客与访谈源", audit.content_sources) : ""
  ].filter(Boolean).join("\n\n");
}

function formatAuditGroup(title, group) {
  if (!group) {
    return `### ${title}\n\n未记录。`;
  }

  const sources = Array.isArray(group.sources) && group.sources.length > 0
    ? group.sources.map((source) => `- ${markdownLink(source.url, source.name)}：${source.status}${source.notes ? `，${source.notes}` : ""}`).join("\n")
    : "- 未记录具体来源。";
  const details = [
    `- 检查状态：${group.checked ? "已检查" : "未检查"}`,
    `- 候选 / 入选：${group.candidates_found} / ${group.included}`,
    group.blocked_reason ? `- 阻塞原因：${group.blocked_reason}` : "",
    group.last_successful_feed_at ? `- 上次成功获取：${group.last_successful_feed_at}` : "",
    `- 说明：${group.notes || "无"}`
  ].filter(Boolean);
  return `### ${title}\n\n${details.join("\n")}\n\n${sources}`;
}

function formatSelfCheck(selfCheck) {
  if (!selfCheck) {
    return "未记录自检。";
  }

  const suggestions = Array.isArray(selfCheck.optimization_suggestions) && selfCheck.optimization_suggestions.length > 0
    ? selfCheck.optimization_suggestions
        .map(formatOptimizationSuggestion)
        .join("\n")
    : "- 本轮无新增建议。";
  return `- 主体信息：${selfCheck.main_items}\n- Builder 观察：${selfCheck.builder_observations}\n- 一手链接：${selfCheck.primary_links ? "通过" : "未通过"}\n- 无禁用表达：${selfCheck.no_banned_words ? "通过" : "未通过"}\n- 无无源数字：${selfCheck.no_unsourced_numbers ? "通过" : "未通过"}\n- 说明：${selfCheck.notes || "无"}\n\n### 提示词与规则迭代建议\n\n${suggestions}`;
}

function formatOptimizationSuggestion(item) {
  const title = item.issue || item.observed_issue || item.suggestion || "建议";
  const change = item.suggestion || item.proposed_change || "";
  const firstLine = change ? `- **${title}**：${change}` : `- **${title}**`;
  return `${firstLine}${item.expected_benefit ? `\n  - 为什么要改：${item.expected_benefit}` : ""}`;
}

function markdownLink(url, label) {
  return `[${escapeMarkdownText(label || url)}](${String(url)})`;
}

function escapeMarkdownText(value) {
  return String(value).replaceAll("[", "\\[").replaceAll("]", "\\]");
}
