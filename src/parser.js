import { BANNED_PHRASES, DEFAULT_SITE, OPTIONAL_SECTION_HEADINGS, SELF_CHECK_HEADINGS, SOURCE_TIERS } from "./config.js";
import { PublisherError } from "./errors.js";
import { canonicalReportUrl, reportRelativePaths } from "./paths.js";
import { defaultGeneratedAt, isValidDateString } from "./time.js";
import { validateReport } from "./schema.js";

const MAIN_ITEM_HEADING =
  /^(\d+)\.\s+(.+?)\s+\[event_date:\s*(\d{4}-\d{2}-\d{2})\]\s+\[tier:\s*(T[0-3])\]\s*$/;

const LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/;

export function parseDailyMarkdown(markdown, options = {}) {
  const normalized = markdown.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  assertNoForbiddenPhrases(normalized);

  const lines = normalized.split("\n");
  const title = parseTitle(lines);
  const summary = parseSummary(lines);
  const sections = parseSections(lines);
  const selfCheck = parseSelfCheck(sections);
  const reportDate = selfCheck.report_date;

  if (!isValidDateString(reportDate)) {
    throw new PublisherError("report_date_invalid", "`self_check.report_date` 必须是有效的 YYYY-MM-DD。");
  }

  const paths = reportRelativePaths(reportDate);
  const canonicalUrl = canonicalReportUrl(options.siteUrl || DEFAULT_SITE.siteUrl, reportDate);
  const mainItems = parseMainItems(sections);
  const projects = parseProjects(sections);
  const builderObservations = parseBuilderObservations(sections);
  const communityLeads = parseCommunityLeads(sections);
  const generatedAt = options.generatedAt || defaultGeneratedAt();

  const report = {
    schema_version: 1,
    report_date: reportDate,
    title,
    summary,
    canonical_url: canonicalUrl,
    markdown_path: paths.markdownPath,
    html_path: paths.htmlPath,
    source_window: normalizeSourceWindow(selfCheck, reportDate),
    main_items: mainItems,
    projects,
    builder_observations: builderObservations,
    community_leads: communityLeads,
    self_check: normalizeSelfCheck(selfCheck),
    publish_status: defaultPublishStatus(canonicalUrl),
    generated_at: generatedAt
  };

  const validation = validateReport(report);
  if (!validation.valid) {
    throw new PublisherError("schema_validation_failed", "解析后的 report.json 未通过 schema 校验。", {
      errors: validation.errors
    });
  }

  return validation.value;
}

export function defaultPublishStatus(pagesUrl = "") {
  return {
    html_generated: true,
    repo_updated: true,
    repo_pushed: false,
    pages_url: pagesUrl,
    publish_error: ""
  };
}

function assertNoForbiddenPhrases(markdown) {
  const phrase = BANNED_PHRASES.find((item) => markdown.includes(item));
  if (phrase) {
    throw new PublisherError("forbidden_phrase", `日报包含禁用模板化表达：${phrase}`, { phrase });
  }
}

function parseTitle(lines) {
  const line = lines.find((item) => item.startsWith("# "));
  if (!line) {
    throw new PublisherError("title_missing", "日报缺少一级标题。");
  }

  const title = line.replace(/^#\s+/, "").trim();
  if (!title) {
    throw new PublisherError("title_missing", "日报一级标题不能为空。");
  }

  return title;
}

function parseSummary(lines) {
  const firstHeading = lines.findIndex((line) => /^##\s+/.test(line));
  const searchLines = firstHeading === -1 ? lines : lines.slice(0, firstHeading);
  const summaryLine = searchLines.find((line) => line.trim().startsWith(">"));
  const summary = summaryLine?.replace(/^>\s*/, "").trim();

  if (!summary) {
    throw new PublisherError("summary_missing", "日报缺少摘要引用行。");
  }

  return summary;
}

function parseSections(lines) {
  const headings = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^##\s+(.+?)\s*$/.exec(lines[index]);
    if (match) {
      headings.push({ title: match[1].trim(), line: index });
    }
  }

  return headings.map((heading, index) => {
    const next = headings[index + 1]?.line ?? lines.length;
    return {
      title: heading.title,
      line: heading.line + 1,
      body: lines.slice(heading.line + 1, next).join("\n").trim()
    };
  });
}

function parseSelfCheck(sections) {
  const section = sections.find((item) => SELF_CHECK_HEADINGS.has(item.title));
  if (!section) {
    throw new PublisherError("self_check_missing", "日报缺少 `## 自检` 或 `## 自检与优化建议` 章节。");
  }

  const match = /```json\s*([\s\S]*?)```/i.exec(section.body);
  if (!match) {
    throw new PublisherError("self_check_json_missing", "自检章节缺少 json code block。");
  }

  try {
    return JSON.parse(match[1]);
  } catch (error) {
    throw new PublisherError("self_check_json_invalid", `自检 JSON 解析失败：${error.message}`);
  }
}

function parseMainItems(sections) {
  const sectionsByTitle = new Set([
    OPTIONAL_SECTION_HEADINGS.projects,
    OPTIONAL_SECTION_HEADINGS.builderObservations,
    OPTIONAL_SECTION_HEADINGS.communityLeads,
    ...SELF_CHECK_HEADINGS
  ]);
  const mainSections = sections.filter((section) => !sectionsByTitle.has(section.title));
  const items = [];

  for (const section of mainSections) {
    const match = MAIN_ITEM_HEADING.exec(section.title);
    if (!match) {
      continue;
    }

    const [, index, rawTitle, eventDate, tier] = match;
    if (!SOURCE_TIERS.includes(tier)) {
      throw new PublisherError("main_item_tier_invalid", `第 ${index} 条主体信息 tier 无效。`);
    }

    const source = parseRequiredSource(section.body, `第 ${index} 条主体信息`);
    const bullets = parseBullets(section.body);
    if (bullets.length === 0) {
      throw new PublisherError("main_item_bullets_missing", `第 ${index} 条主体信息缺少事实要点。`);
    }

    items.push({
      title: rawTitle.trim(),
      event_date: eventDate,
      url: source.url,
      source: source.label,
      tier,
      entities: parseEntities(section.body),
      summary: bullets.join(" "),
      bullets
    });
  }

  if (items.length === 0) {
    throw new PublisherError("main_items_missing", "日报缺少主体信息条目。");
  }

  return items;
}

function parseRequiredSource(body, label) {
  const sourceLine = body.split("\n").find((line) => /来源[：:]/.test(line));
  const link = sourceLine ? LINK_RE.exec(sourceLine) : null;
  if (!link) {
    throw new PublisherError("main_item_source_missing", `${label} 缺少来源链接。`);
  }

  assertAbsoluteUrl(link[2], "main_item_source_url_invalid", `${label} 来源 URL 必须是 http(s) 绝对 URL。`);
  return { label: link[1].trim(), url: link[2] };
}

function parseBullets(body) {
  return body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^-\s+/.test(line) && !/来源[：:]/.test(line))
    .map((line) => line.replace(/^-\s+/, "").trim())
    .filter(Boolean);
}

function parseEntities(body) {
  const line = body.split("\n").find((item) => /^(实体|Entities)[：:]/i.test(item.trim()));
  if (!line) {
    return [];
  }

  return line
    .replace(/^(实体|Entities)[：:]/i, "")
    .split(/[，,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseProjects(sections) {
  const section = sections.find((item) => item.title === OPTIONAL_SECTION_HEADINGS.projects);
  if (!section || !section.body) {
    return [];
  }

  const tableRows = parseMarkdownTable(section.body);
  if (tableRows.length > 0) {
    return tableRows.map((row, index) => {
      const nameCell = row["项目"] || row["名称"] || "";
      const description = row["描述"] || row["说明"] || "";
      const urlCell = row["URL"] || row["链接"] || "";
      const nameLink = LINK_RE.exec(nameCell);
      const urlLink = LINK_RE.exec(urlCell);
      const url = urlLink?.[2] || nameLink?.[2] || urlCell.trim();
      const name = nameLink?.[1] || nameCell.trim();
      assertProjectRow(name, description, url, index + 1);
      return { name, description: description.trim(), url };
    });
  }

  return section.body
    .split("\n")
    .map((line) => parseProjectBullet(line))
    .filter(Boolean);
}

function parseMarkdownTable(body) {
  const rows = body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|") && line.endsWith("|"));

  if (rows.length < 2) {
    return [];
  }

  const headers = splitTableRow(rows[0]);
  const separator = splitTableRow(rows[1]).every((cell) => /^:?-{3,}:?$/.test(cell));
  if (!separator) {
    return [];
  }

  return rows.slice(2).map((row) => {
    const cells = splitTableRow(row);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] || ""]));
  });
}

function splitTableRow(row) {
  return row
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function parseProjectBullet(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("- ")) {
    return null;
  }

  const link = LINK_RE.exec(trimmed);
  if (!link) {
    throw new PublisherError("project_url_missing", "项目条目必须包含项目 URL。");
  }

  const description = trimmed.slice(link.index + link[0].length).replace(/^[：:\s-]+/, "").trim();
  assertProjectRow(link[1], description, link[2], 1);
  return { name: link[1], description, url: link[2] };
}

function assertProjectRow(name, description, url, index) {
  if (!name || !description || !url) {
    throw new PublisherError("project_row_invalid", `项目表第 ${index} 行缺少 name、description 或 url。`);
  }

  assertAbsoluteUrl(url, "project_url_invalid", `项目表第 ${index} 行 URL 必须是 http(s) 绝对 URL。`);
}

function parseBuilderObservations(sections) {
  const section = sections.find((item) => item.title === OPTIONAL_SECTION_HEADINGS.builderObservations);
  if (!section || !section.body) {
    return [];
  }

  return section.body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line, index) => {
      const link = LINK_RE.exec(line);
      const match = /^-\s*(.+?)[：:]\s*(.+?)(?:。|\s)?来源[：:]/.exec(line);
      if (!link || !match) {
        throw new PublisherError("builder_observation_invalid", `Builder 观察第 ${index + 1} 条格式无效。`);
      }

      assertAbsoluteUrl(link[2], "builder_observation_url_invalid", `Builder 观察第 ${index + 1} 条 URL 无效。`);
      return {
        author: match[1].trim(),
        content: match[2].trim(),
        url: link[2]
      };
    });
}

function parseCommunityLeads(sections) {
  const section = sections.find((item) => item.title === OPTIONAL_SECTION_HEADINGS.communityLeads);
  if (!section || !section.body) {
    return [];
  }

  return section.body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line, index) => {
      const link = LINK_RE.exec(line);
      const match = /^-\s*(.+?)(?:。|\s)?来源[：:]/.exec(line);
      if (!link || !match) {
        throw new PublisherError("community_lead_invalid", `社区线索第 ${index + 1} 条格式无效。`);
      }

      assertAbsoluteUrl(link[2], "community_lead_url_invalid", `社区线索第 ${index + 1} 条 URL 无效。`);
      return {
        content: match[1].trim(),
        url: link[2]
      };
    });
}

function normalizeSelfCheck(selfCheck) {
  return {
    ...selfCheck,
    builder_skill_used: Array.isArray(selfCheck.builder_skill_used) ? selfCheck.builder_skill_used : [],
    fallback_sources: Array.isArray(selfCheck.fallback_sources) ? selfCheck.fallback_sources : [],
    optimization_suggestions: Array.isArray(selfCheck.optimization_suggestions)
      ? selfCheck.optimization_suggestions
      : []
  };
}

function normalizeSourceWindow(selfCheck, reportDate) {
  if (selfCheck.source_window && typeof selfCheck.source_window === "object") {
    return {
      date_from: selfCheck.source_window.date_from,
      date_to: selfCheck.source_window.date_to,
      fallback_window_used: Boolean(selfCheck.source_window.fallback_window_used),
      notes: selfCheck.source_window.notes || ""
    };
  }

  return {
    date_from: reportDate,
    date_to: reportDate,
    fallback_window_used: false,
    notes: selfCheck.notes || ""
  };
}

function assertAbsoluteUrl(value, code, message) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("unsupported protocol");
    }
  } catch {
    throw new PublisherError(code, message, { url: value });
  }
}
