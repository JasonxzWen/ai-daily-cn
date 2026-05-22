import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { DEFAULT_SITE } from "./config.js";
import { PublisherError } from "./errors.js";
import { relativeAssetHref, reportRelativePaths } from "./paths.js";
import { cleanProjectDescription, modelReleaseTags, projectHeatTags } from "./presentation.js";

const execFileAsync = promisify(execFile);

export function reportToInteractionInput(report) {
  const mainItems = Array.isArray(report.main_items) ? report.main_items : [];
  const modelReleases = Array.isArray(report.model_releases) ? report.model_releases : [];
  const hotBlogs = Array.isArray(report.hot_blogs) ? report.hot_blogs : [];
  const projects = Array.isArray(report.projects) ? report.projects : [];
  const builderObservations = Array.isArray(report.builder_observations) ? report.builder_observations : [];
  const communityLeads = Array.isArray(report.community_leads) ? report.community_leads : [];
  const paths = reportRelativePaths(report.report_date);
  const dataHref = publicAssetUrl(report, paths.dataPath);

  return {
    title: report.title,
    summary: formatHeroSummary(report.summary),
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
    sections: [
      {
        type: "summary-cards",
        title: "日报概览",
        group: "summary",
        cards: [
          { label: "报告日期", value: report.report_date },
          { label: "主体信息", value: String(mainItems.length) },
          { label: "模型发布", value: String(modelReleases.length) },
          { label: "热门技术博客", value: String(hotBlogs.length) },
          { label: "项目", value: String(projects.length) },
          { label: "Builder 观察", value: String(builderObservations.length) }
        ]
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
      },
      {
        type: "markdown",
        title: "模型发布",
        group: "main",
        content: formatModelReleases(modelReleases)
      },
      {
        type: "markdown",
        title: "热门技术博客",
        group: "main",
        content: formatHotBlogs(hotBlogs)
      },
      {
        type: "markdown",
        title: "今日值得关注的项目",
        group: "projects",
        content: formatProjects(projects)
      },
      {
        type: "markdown",
        title: "Builder 观察与社区线索",
        group: "signals",
        content: `${formatBuilderObservations(builderObservations)}\n\n${formatCommunityLeads(communityLeads)}`
      },
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
    ],
    evidence: [
      {
        kind: "file",
        label: "结构化日报 JSON",
        value: dataHref,
        status: "info"
      },
      {
        kind: "assumption",
        label: "页面生成器",
        value: "由 .codex/skills/effective-interact/scripts/create-interaction.mjs 生成公开日报 HTML。",
        status: "pass"
      }
    ],
    nextActions: Array.isArray(report.self_check?.optimization_suggestions)
      ? report.self_check.optimization_suggestions.map((item) => item.suggestion).filter(Boolean).slice(0, 3)
      : []
  };
}

function formatHeroSummary(summary) {
  const clauses = splitSummaryClauses(summary).slice(0, 3);
  if (clauses.length < 2) {
    return `重点：${String(summary || "").trim()}`;
  }

  const bullets = clauses.map((clause) => `- ${shortenText(clause, 88)}`);
  if (splitSummaryClauses(summary).length > clauses.length) {
    bullets.push("- 更多信号见主线摘要、主体信息与项目分区。");
  }
  return `重点：\n${bullets.join("\n")}`;
}

function formatMainlineSummary(summary) {
  const clauses = splitSummaryClauses(summary);
  if (clauses.length < 2) {
    return `- **重点**：${String(summary || "").trim()}`;
  }

  const bullets = clauses.slice(0, 7).map((clause, index) => {
    const cleaned = cleanSummaryClause(clause);
    return `- **${inferSummaryLabel(cleaned, index)}**：${shortenText(cleaned, 105)}`;
  });

  if (clauses.length > bullets.length) {
    bullets.push(`- **其他信号**：还有 ${clauses.length - bullets.length} 条补充信息，详见后续分区。`);
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
    [/Google|Gemini|Antigravity|WebMCP|托管 agent|agent 工程栈/i, "Agent 开发链路"],
    [/Vercel|Qwen|Grok|Gateway/i, "模型入口"],
    [/GitHub Copilot|issue|任务路由|语义/i, "开发工作流"],
    [/AWS|SageMaker|OpenAI-compatible|迁移/i, "迁移成本"],
    [/Trending|coding-agent|代码图谱|memory|开源/i, "开源信号"],
    [/Anthropic|Claude|MCP|执行环境|访问边界/i, "执行边界"],
    [/Builder feed|网络限制|未收录/i, "信源边界"]
  ];
  const match = labels.find(([pattern]) => pattern.test(text));
  return match ? match[1] : `重点 ${index + 1}`;
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
    return "暂无热门技术博客。";
  }

  return items
    .map((item) => `- **${markdownLink(item.url, item.title)}**（${item.publisher} / ${item.author}，${item.event_date}）：${item.summary}\n  - 为什么重要：${item.why_it_matters}`)
    .join("\n");
}

function formatProjects(items) {
  if (items.length === 0) {
    return "暂无项目条目。";
  }

  return items
    .map((item) => `- **${markdownLink(item.url, item.name)}**${formatHighlightTags(projectHeatTags(item))}：${cleanProjectDescription(item.description)}`)
    .join("\n");
}

function formatHighlightTags(tags) {
  return tags.length > 0 ? ` ${tags.map((tag) => `==${tag}==`).join(" ")}` : "";
}

function formatBuilderObservations(items) {
  if (items.length === 0) {
    return "### Builder 观察\n\n暂无 Builder 观察。";
  }

  return `### Builder 观察\n\n${items
    .map((item) => `- **${item.author}**${item.role ? `（${item.role}）` : ""}：${item.content} ${markdownLink(item.url, item.source || "来源")}${item.evidence ? `\n  - 证据：${item.evidence}` : ""}`)
    .join("\n")}`;
}

function formatCommunityLeads(items) {
  if (items.length === 0) {
    return "### 社区线索\n\n暂无社区线索。";
  }

  return `### 社区线索\n\n${items.map((item) => `- ${item.content} ${markdownLink(item.url, "来源")}`).join("\n")}`;
}

function formatSourceAudit(audit) {
  if (!audit) {
    return "未记录信源审计。";
  }

  return [
    formatAuditGroup("GitHub Trending", audit.github_trending),
    formatAuditGroup("Builder 原始源", audit.builder_sources)
  ].join("\n\n");
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
        .map((item) => `- **${item.issue || item.suggestion || "未命名建议"}**：${item.suggestion || ""}${item.expected_benefit ? `\n  - 预期收益：${item.expected_benefit}` : ""}`)
        .join("\n")
    : "- 本轮无新增建议。";
  return `- 主体信息：${selfCheck.main_items}\n- Builder 观察：${selfCheck.builder_observations}\n- 一手链接：${selfCheck.primary_links ? "通过" : "未通过"}\n- 无禁用表达：${selfCheck.no_banned_words ? "通过" : "未通过"}\n- 无无源数字：${selfCheck.no_unsourced_numbers ? "通过" : "未通过"}\n- 说明：${selfCheck.notes || "无"}\n\n### 提示词与规则迭代建议\n\n${suggestions}`;
}

function markdownLink(url, label) {
  return `[${escapeMarkdownText(label || url)}](${String(url)})`;
}

function escapeMarkdownText(value) {
  return String(value).replaceAll("[", "\\[").replaceAll("]", "\\]");
}
