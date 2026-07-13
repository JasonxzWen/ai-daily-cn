#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillDir = path.resolve(__dirname, "..");
const reportUiCssPath = path.join(skillDir, "assets", "components", "interaction-ui.css");
const reportUiJsPath = path.join(skillDir, "assets", "components", "interaction-ui.js");
const richRuntimeCssPath = path.join(skillDir, "assets", "components", "rich-render-runtime.css");
const richRuntimeJsPath = path.join(skillDir, "assets", "components", "rich-render-runtime.js");

const renderModes = ["runtime-cdn", "pre-rendered", "fallback-only", "runtime"];

const runtimeLibraries = [
  {
    id: "dompurify",
    name: "DOMPurify",
    version: "3.4.2",
    url: "https://cdn.jsdelivr.net/npm/dompurify@3.4.2/dist/purify.min.js",
    purpose: "插入 Markdown 渲染结果前进行净化",
    required: true,
    kind: "script",
    integrityExemption: "Pinned jsdelivr URL; SRI hash is not maintained for this generated artifact path."
  },
  {
    id: "highlightjs",
    name: "@highlightjs/cdn-assets",
    version: "11.11.1",
    url: "https://cdn.jsdelivr.net/npm/@highlightjs/cdn-assets@11.11.1/highlight.min.js",
    cssUrl: "https://cdn.jsdelivr.net/npm/@highlightjs/cdn-assets@11.11.1/styles/github-dark.min.css",
    purpose: "为代码块生成语法 token 高亮",
    required: true,
    kind: "script",
    integrityExemption: "Pinned jsdelivr URL; SRI hash is not maintained for this generated artifact path.",
    cssIntegrityExemption: "Pinned jsdelivr CSS URL; SRI hash is not maintained for this generated artifact path."
  },
  {
    id: "marked",
    name: "Marked",
    version: "18.0.3",
    url: "https://cdn.jsdelivr.net/npm/marked@18.0.3/lib/marked.esm.js",
    purpose: "解析 runtime-cdn 报告中的 Markdown 源文本",
    required: true,
    kind: "module",
    integrityExemption: "Pinned ESM URL loaded by module import; SRI is not available for inline import statements."
  },
  {
    id: "mermaid",
    name: "Mermaid",
    version: "11.15.0",
    url: "https://cdn.jsdelivr.net/npm/mermaid@11.15.0/dist/mermaid.esm.min.mjs",
    purpose: "从 Mermaid 源文本渲染图表",
    required: true,
    kind: "module",
    integrityExemption: "Pinned ESM URL loaded by module import; SRI is not available for inline import statements."
  }
];

const supportedChartTypes = ["bar", "line", "sparkline", "bullet", "slope", "matrix"];

const groupLabels = {
  claims: "判断",
  summary: "摘要",
  main: "正文",
  changes: "变更",
  impact: "影响",
  risks: "风险",
  decision: "决策",
  next: "下一步",
  details: "细节",
  overview: "总览",
  diagrams: "图表",
  code: "代码",
  evidence: "证据",
  verification: "验证",
  actions: "行动"
};

const statusLabels = {
  complete: "完成",
  ready: "就绪",
  pass: "通过",
  warn: "注意",
  failed: "失败",
  fail: "失败",
  blocked: "阻塞",
  review: "待审阅",
  pending: "待处理",
  degraded: "降级",
  draft: "草稿",
  info: "信息",
  "not-run": "未运行",
  "not-runtime": "非运行时"
};

const kindLabels = {
  file: "文件",
  command: "命令",
  source: "来源",
  assumption: "假设",
  verification: "验证"
};

const claimKindLabels = {
  conclusion: "结论",
  risk: "风险",
  metric: "指标",
  trend: "趋势",
  recommendation: "建议",
  assumption: "假设"
};

const confidenceLabels = {
  high: "高",
  medium: "中",
  low: "低",
  unknown: "未知"
};

function parseArgs(argv) {
  const args = {
    outDir: path.join(skillDir, "artifacts"),
    json: false,
    browserMermaid: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--input") args.input = argv[++index];
    else if (arg === "--out-dir") args.outDir = argv[++index];
    else if (arg === "--slug") args.slug = argv[++index];
    else if (arg === "--json") args.json = true;
    else if (arg === "--browser-mermaid") args.browserMermaid = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function usage() {
  return [
    "Usage: node skills/effective-interact/scripts/create-interaction.mjs --input report.json [--out-dir <dir>] [--slug name] [--json] [--browser-mermaid]",
    "",
    "Inputs follow references/interaction-input-schema.json. Default renderMode is pre-rendered. Default outDir is ignored skills/effective-interact/artifacts/. Use --out-dir only for another gitignored directory."
  ].join("\n");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "&#96;");
}

function stripTrailingWhitespace(value) {
  return String(value).replace(/[ \t]+$/gm, "");
}

function hasLikelyMojibake(value) {
  return /\?{4,}|\uFFFD/.test(String(value ?? ""));
}

function hasLikelyMojibakeInValue(value) {
  if (typeof value === "string") return hasLikelyMojibake(value);
  if (Array.isArray(value)) return value.some((item) => hasLikelyMojibakeInValue(item));
  if (value && typeof value === "object") return Object.values(value).some((item) => hasLikelyMojibakeInValue(item));
  return false;
}

function stripRawHtml(value) {
  return String(value ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]*>/g, "");
}

function safeAuditText(value) {
  return stripRawHtml(value)
    .replace(/javascript\s*:/gi, "blocked-protocol:")
    .replace(/\son[a-z]+\s*=/gi, " data-removed=");
}

function sanitizeDiagnosticMessage(value) {
  return safeAuditText(value)
    .replace(/file:\/\/\/[^\s'")<>]+/gi, "[local-file]")
    .replace(/[A-Za-z]:[\\/][^\s'")<>]+/g, "[local-path]")
    .replace(/\/(?:Users|home)\/[^\s'")<>]+/gi, "[local-path]")
    .replace(/\b(?:gho|ghp|github_pat)_[A-Za-z0-9_]+/g, "[token]")
    .slice(0, 220);
}

function slugify(value) {
  const slug = String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "html-work-report";
}

function safeLink(rawHref) {
  const href = String(rawHref ?? "").trim();
  if (!href) return "";
  if (href.startsWith("#")) return href;

  try {
    const parsed = new URL(href);
    return ["http:", "https:", "mailto:"].includes(parsed.protocol) ? href : "";
  } catch {
    return "";
  }
}

function safeMediaSrc(rawSrc) {
  const src = String(rawSrc ?? "").trim();
  if (!src || /[\u0000-\u001f<>]/.test(src) || hasHostLocalPath(src)) return "";
  if (/^data:image\/(?:png|jpe?g|gif|webp|svg\+xml);base64,/i.test(src)) return src;
  if (/^[a-z][a-z0-9+.-]*:/i.test(src)) {
    try {
      const parsed = new URL(src);
      return ["http:", "https:"].includes(parsed.protocol) ? src : "";
    } catch {
      return "";
    }
  }
  if (src.startsWith("//") || src.includes("\\")) return "";
  return src;
}

function linkAttrs(rawHref) {
  const href = safeLink(rawHref);
  if (!href) return "";
  if (/^https?:\/\//i.test(href)) {
    return `href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer"`;
  }
  if (/^mailto:/i.test(href)) {
    return `href="${escapeAttr(href)}" rel="noreferrer"`;
  }
  return `href="${escapeAttr(href)}"`;
}

function hasHostLocalPath(value) {
  return /file:\/\/\/|[A-Za-z]:[\\/]|\/(?:Users|home)\//i.test(String(value ?? ""));
}

function normalizeHandoffMetadata(handoff) {
  if (!handoff || typeof handoff !== "object") return { sourcePath: "", regenerationCommand: "" };
  return {
    sourcePath: String(handoff.sourcePath || "").trim().replaceAll("\\", "/"),
    regenerationCommand: String(handoff.regenerationCommand || "").trim()
  };
}

function hasParentPathSegment(value) {
  return String(value || "").split("/").includes("..");
}

function renderHandoffAttributes(handoff) {
  const normalized = normalizeHandoffMetadata(handoff);
  const attrs = [];
  if (normalized.sourcePath) attrs.push(`data-handoff-source-path="${escapeAttr(normalized.sourcePath)}"`);
  if (normalized.regenerationCommand) attrs.push(`data-handoff-regeneration-command="${escapeAttr(normalized.regenerationCommand)}"`);
  return attrs.length ? ` ${attrs.join(" ")}` : "";
}

function renderHandoffMetaTags(handoff) {
  const normalized = normalizeHandoffMetadata(handoff);
  const tags = [];
  if (normalized.sourcePath) tags.push(`  <meta name="handoff-source-path" content="${escapeAttr(normalized.sourcePath)}">`);
  if (normalized.regenerationCommand) tags.push(`  <meta name="handoff-regeneration-command" content="${escapeAttr(normalized.regenerationCommand)}">`);
  return tags.length ? `${tags.join("\n")}\n` : "";
}

function normalizeRenderMode(mode) {
  if (!mode) return { mode: "pre-rendered", compatibility: "" };
  if (mode === "runtime") return { mode: "runtime-cdn", compatibility: "legacy-runtime-alias" };
  return { mode, compatibility: "" };
}

function isRuntimeMode(mode) {
  return mode === "runtime-cdn";
}

function inferGroup(section) {
  if (section.group) return section.group;
  if (["evidence"].includes(section.type)) return "evidence";
  if (["decision-matrix"].includes(section.type)) return "decision";
  if (["actions"].includes(section.type)) return "next";
  return "main";
}

function normalizeSection(section, index) {
  const title = section.title || `Section ${index + 1}`;
  return {
    ...section,
    title,
    id: section.richId ? `section-${slugify(section.richId)}` : sectionId(title, index),
    group: inferGroup(section),
    priority: Number.isInteger(section.priority) ? section.priority : index,
    status: section.status || "info",
    summary: section.summary || ""
  };
}

function normalizeTrustLevel(value) {
  return ["trusted-generated", "mixed-trust", "untrusted"].includes(value) ? value : "mixed-trust";
}

function inferReportIntent(input, mode) {
  const explicit = input.intent && typeof input.intent === "object" ? input.intent : {};
  const hasEvidence = (input.evidence || []).length > 0;
  const hasClaims = (input.claims || []).length > 0;
  const hasCharts = (input.sections || []).some((section) => section.type === "chart");
  const artifactKind = explicit.artifactKind
    || (hasCharts ? "research" : "")
    || (hasClaims ? "review" : "")
    || (hasEvidence ? "status" : "")
    || "handoff";

  return {
    audience: explicit.audience || "maintainer",
    primaryQuestion: explicit.primaryQuestion || input.summary || "What should the reader know first?",
    decision: explicit.decision || (hasClaims || hasEvidence ? "Review the conclusion against linked evidence." : "Scan the conclusion and next actions."),
    timeBudget: explicit.timeBudget || (hasCharts ? "3m" : "30s"),
    artifactKind,
    successCriteria: Array.isArray(explicit.successCriteria) && explicit.successCriteria.length > 0
      ? explicit.successCriteria
      : [
        mode === "runtime-cdn" ? "Primary conclusion is readable before runtime enhancement." : "Primary conclusion is readable without network runtime.",
        hasClaims ? "Important claims are tied to evidence or marked as assumptions." : "The report stays concise when evidence is not needed."
      ]
  };
}

function sectionId(title, index = 0) {
  return `section-${slugify(title)}-${index + 1}`;
}

function statusClass(status) {
  if (["complete", "ready", "pass"].includes(status)) return "status-ok";
  if (["blocked", "fail", "failed"].includes(status)) return "status-danger";
  if (["warn", "degraded", "review", "pending", "not-run"].includes(status)) return "status-warn";
  return "status-info";
}

function statusLabel(status) {
  return statusLabels[status] || status || "信息";
}

function showSectionStatus(status) {
  return ["warn", "failed", "fail", "blocked", "review", "pending", "degraded", "draft", "not-run"].includes(status);
}

function richStateForMode(mode, rendered) {
  if (rendered) return "ready";
  if (mode === "fallback-only") return "degraded";
  if (isRuntimeMode(mode)) return "pending";
  return "ready";
}

function sourceLabel(section) {
  const filePath = section.filePath || section.title || "source";
  const startLine = Number.isInteger(section.startLine) ? section.startLine : undefined;
  const endLine = Number.isInteger(section.endLine) ? section.endLine : undefined;
  if (startLine && endLine && endLine !== startLine) return `${filePath}:${startLine}-${endLine}`;
  if (startLine) return `${filePath}:${startLine}`;
  return filePath;
}

function renderSourceLink(section, fallbackId) {
  const label = sourceLabel(section);
  const href = safeLink(section.sourceHref);
  if (href) {
    return `<a class="source-link" data-source-link data-file-path="${escapeAttr(section.filePath || "")}" href="${escapeAttr(href)}" rel="noreferrer">${escapeHtml(label)}</a>`;
  }
  return `<span class="source-link" data-source-link data-file-path="${escapeAttr(section.filePath || "")}" data-source-ref="${escapeAttr(fallbackId || "")}">${escapeHtml(label)}</span>`;
}

function visibleGroupLabel(section) {
  const label = groupLabels[section.group] || section.group || "";
  const title = String(section.title || "");
  if (!label || title.includes(label)) return "";
  return `<p class="meta">${escapeHtml(label)}</p>`;
}

function renderSectionHeader(section, statusText = "") {
  const summary = section.summary ? `<p class="section-summary">${escapeHtml(section.summary)}</p>` : "";
  const status = statusText || section.status || "info";
  const pill = showSectionStatus(status) ? `<span class="status-pill ${statusClass(status)}">${escapeHtml(statusLabel(status))}</span>` : "";
  return `<div class="section-heading split-row">
    <div>
      ${visibleGroupLabel(section)}
      <h2>${escapeHtml(section.title)}</h2>
      ${summary}
    </div>
    ${pill}
  </div>`;
}

function renderSupplementalHeading({ group, title, summary, status = "info" }) {
  return renderSectionHeader({ group, title, summary, status }, status);
}

function plainTextExcerpt(value, limit = 150) {
  const text = stripRawHtml(value)
    .replace(/!\[[^\]\n]*\]\([^)]+\)/g, "")
    .replace(/\[([^\]\n]+)\]\([^)]+\)/g, "$1")
    .replace(/==[^|\]\n]+\|([^=\n]+)==/g, "$1")
    .replace(/[*_`#>-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  return text.length > limit ? `${text.slice(0, limit - 1).trim()}...` : text;
}

function storySectionTeaser(section) {
  const direct = plainTextExcerpt(section.summary || section.subtitle || "");
  if (direct) return direct;
  const lines = stripRawHtml(section.content || "").replace(/\r\n/g, "\n").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || /^(#{1,3})\s+/.test(trimmed)) continue;
    const candidate = plainTextExcerpt(trimmed.replace(/^\s*(?:[-*]|\d+\.)\s+/, ""));
    if (candidate) return candidate;
  }
  return "Open story details.";
}

function renderCollapsibleStorySummary(section, statusText = "") {
  const label = groupLabels[section.group] || section.group || "";
  const status = statusText || section.status || "info";
  const pill = showSectionStatus(status) ? `<span class="status-pill ${statusClass(status)}">${escapeHtml(statusLabel(status))}</span>` : "";
  return `<summary class="collapsible-summary">
    <span>
      ${label && !String(section.title || "").includes(label) ? `<span class="meta">${escapeHtml(label)}</span>` : ""}
      <span class="collapsible-title">${escapeHtml(section.title)}</span>
      <span class="collapsible-subtitle">${escapeHtml(storySectionTeaser(section))}</span>
    </span>
    ${pill}
  </summary>`;
}

function renderHighlightMarker(marker) {
  const text = String(marker ?? "").trim();
  const match = text.match(/^([a-z0-9-]+)\|(.+)$/i);
  if (!match) return `<mark class="text-highlight">${text}</mark>`;
  const kind = slugify(match[1]);
  return `<mark class="text-highlight text-highlight-${escapeAttr(kind)}" data-highlight-kind="${escapeAttr(kind)}">${match[2]}</mark>`;
}

function safeHighlightClass(value) {
  return String(value || "").replace(/[^a-z0-9-]/gi, "").toLowerCase() || "topic";
}

function stashInlineToken(tokens, html) {
  const token = `\u0000HTML_WORK_REPORT_INLINE_${tokens.length}\u0000`;
  tokens.push(html);
  return token;
}

function restoreInlineTokens(tokens, html) {
  let restored = String(html || "");
  for (let pass = 0; pass < 4 && restored.includes("\u0000HTML_WORK_REPORT_INLINE_"); pass += 1) {
    restored = restored.replace(/\u0000HTML_WORK_REPORT_INLINE_(\d+)\u0000/g, (_match, index) => tokens[Number(index)] || "");
  }
  return restored;
}

function lightboxImageAttrs(label) {
  const caption = String(label || "").trim();
  const ariaLabel = caption ? `点击放大图片：${caption}` : "点击放大图片";
  return ` data-lightbox-image="true" data-lightbox-caption="${escapeAttr(caption)}" role="button" tabindex="0" aria-label="${escapeAttr(ariaLabel)}"`;
}

function renderInlineImage(label, src) {
  const safe = safeMediaSrc(src);
  if (!safe) return `<span class="unsafe-link">${renderInlineEmphasis(label)}</span>`;
  if (/^data:image\//i.test(safe)) {
    return `<img class="inline-site-icon" src="${escapeAttr(safe)}" alt="${escapeAttr(label)}" loading="lazy">`;
  }
  return `<img class="markdown-image inline-image lightbox-trigger" data-lightbox-image src="${escapeAttr(safe)}" alt="${escapeAttr(label)}" loading="lazy">`;
}

function renderInlineEmphasis(escaped) {
  return String(escaped ?? "")
    .replace(/==([^=\n]+)==/g, (_match, marker) => renderHighlightMarker(marker))
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^\*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
}

function inlineMarkdown(text) {
  const escaped = escapeHtml(stripRawHtml(text));
  const tokens = [];
  const withImageTokens = escaped.replace(/!\[([^\]\n]*)\]\(([^)\n]+)\)/g, (_match, label, src) => (
    stashInlineToken(tokens, renderInlineImage(label, src))
  ));
  const withLinkTokens = withImageTokens.replace(/\[([^\]\n]+)\]\(([^)\n]+)\)/g, (_match, label, href) => {
    const attrs = linkAttrs(href);
    const renderedLabel = renderInlineEmphasis(label);
    const html = attrs
      ? `<a ${attrs}>${renderedLabel}</a>`
      : `<span class="unsafe-link">${renderedLabel}</span>`;
    return stashInlineToken(tokens, html);
  });
  return restoreInlineTokens(tokens, renderInlineEmphasis(withLinkTokens));
}

function renderMarkdown(source) {
  const lines = stripRawHtml(source).replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length + 1;
      html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
        items.push(`<li>${inlineMarkdown(lines[index].replace(/^\s*[-*]\s+/, ""))}</li>`);
        index += 1;
      }
      html.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) {
        items.push(`<li>${inlineMarkdown(lines[index].replace(/^\s*\d+\.\s+/, ""))}</li>`);
        index += 1;
      }
      html.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    if (line.includes("|") && index + 1 < lines.length && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[index + 1])) {
      const headers = splitTableRow(line);
      const rows = [];
      index += 2;
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        rows.push(splitTableRow(lines[index]));
        index += 1;
      }
      html.push(renderTable(headers, rows));
      continue;
    }

    const paragraph = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^(#{1,3})\s+/.test(lines[index]) &&
      !/^\s*[-*]\s+/.test(lines[index]) &&
      !/^\s*\d+\.\s+/.test(lines[index]) &&
      !(lines[index].includes("|") && index + 1 < lines.length && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[index + 1]))
    ) {
      paragraph.push(lines[index]);
      index += 1;
    }
    html.push(`<p>${inlineMarkdown(paragraph.join(" "))}</p>`);
  }

  return `<div class="rendered-markdown">${html.join("\n")}</div>`;
}

function splitTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function renderTable(headers, rows) {
  const head = headers.map((cell) => `<th>${inlineMarkdown(cell)}</th>`).join("");
  const body = rows
    .map((row) => `<tr>${row.map((cell) => `<td>${inlineMarkdown(cell)}</td>`).join("")}</tr>`)
    .join("");
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function safeCssWidth(value) {
  const text = String(value ?? "").trim();
  return /^(?:\d+(?:\.\d+)?(?:px|%|rem|em|ch)?|auto|min-content|max-content)$/.test(text) ? text : "";
}

function normalizeTableColumn(column, index) {
  if (column && typeof column === "object") {
    const label = column.label || column.key || `Column ${index + 1}`;
    return {
      key: column.key || label,
      label,
      align: ["center", "right"].includes(column.align) ? column.align : "left",
      width: safeCssWidth(column.width)
    };
  }
  const label = String(column ?? `Column ${index + 1}`);
  return { key: label, label, align: "left", width: "" };
}

function normalizeTableColumns(section) {
  const explicitColumns = Array.isArray(section.columns)
    ? section.columns
    : Array.isArray(section.headers)
      ? section.headers
      : [];
  if (explicitColumns.length > 0) return explicitColumns.map(normalizeTableColumn);

  const rows = Array.isArray(section.rows) ? section.rows : [];
  const objectRow = rows.find((row) => row && typeof row === "object" && !Array.isArray(row));
  if (objectRow) {
    return Object.keys(objectRow)
      .filter((key) => !key.startsWith("_"))
      .map((key, index) => normalizeTableColumn({ key, label: key }, index));
  }

  const arrayRow = rows.find((row) => Array.isArray(row));
  return arrayRow ? arrayRow.map((_value, index) => normalizeTableColumn(`Column ${index + 1}`, index)) : [];
}

function hasOwnValue(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function tableCellValue(row, column, columnIndex) {
  if (Array.isArray(row)) return row[columnIndex];
  if (row && typeof row === "object") {
    if (hasOwnValue(row, column.key)) return row[column.key];
    if (hasOwnValue(row, column.label)) return row[column.label];
    if (hasOwnValue(row, String(columnIndex))) return row[String(columnIndex)];
  }
  return "";
}

function renderTableValue(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) {
    return `<ul class="table-cell-list">${value.map((item) => `<li>${renderTableValue(item)}</li>`).join("")}</ul>`;
  }
  if (typeof value === "object") {
    return `<dl class="table-cell-map">${Object.entries(value).map(([key, item]) => `<div><dt>${escapeHtml(key)}</dt><dd>${renderTableValue(item)}</dd></div>`).join("")}</dl>`;
  }
  return inlineMarkdown(value).replace(/\r?\n/g, "<br>");
}

function renderDataTableSection(section) {
  const columns = normalizeTableColumns(section);
  const rows = Array.isArray(section.rows) ? section.rows : [];
  if (columns.length === 0 || rows.length === 0) {
    return `<section class="panel" ${sectionAttrs(section)} data-table-section>
      ${renderSectionHeader(section)}
      <p>${escapeHtml(section.emptyState || "No table data.")}</p>
    </section>`;
  }

  const colgroup = columns
    .map((column) => column.width ? `<col style="width:${escapeAttr(column.width)}">` : "<col>")
    .join("");
  const caption = section.caption ? `<p class="table-caption">${escapeHtml(section.caption)}</p>` : "";
  const head = columns.map((column, columnIndex) => (
    `<th scope="col" tabindex="0" data-table-cell data-table-row="0" data-table-column="${columnIndex}" data-align="${escapeAttr(column.align)}">${escapeHtml(column.label)}</th>`
  )).join("");
  const body = rows.map((row, rowIndex) => {
    const tableRow = rowIndex + 1;
    return `<tr>${columns.map((column, columnIndex) => (
      `<td tabindex="0" data-table-cell data-table-row="${tableRow}" data-table-column="${columnIndex}" data-align="${escapeAttr(column.align)}">${renderTableValue(tableCellValue(row, column, columnIndex))}</td>`
    )).join("")}</tr>`;
  }).join("\n");

  return `<section class="panel" ${sectionAttrs(section)} data-table-section>
    ${renderSectionHeader(section)}
    ${caption}
    <div class="table-scroll" data-table-wrap>
      <table class="report-data-table" data-report-data-table>
        <colgroup>${colgroup}</colgroup>
        <thead><tr>${head}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  </section>`;
}

function chartSpecFromSection(section) {
  return section.chart && typeof section.chart === "object" ? section.chart : section;
}

function chartDataRows(chart) {
  if (Array.isArray(chart.tableFallback?.rows)) return chart.tableFallback.rows;
  if (Array.isArray(chart.data)) return chart.data;
  return [];
}

function chartColumns(chart, rows) {
  if (Array.isArray(chart.tableFallback?.columns) && chart.tableFallback.columns.length > 0) {
    return chart.tableFallback.columns.map(normalizeTableColumn);
  }
  const encoding = chart.encoding && typeof chart.encoding === "object" ? chart.encoding : {};
  const keys = [encoding.label, encoding.x, encoding.category, encoding.value, encoding.y, encoding.status]
    .filter(Boolean);
  if (keys.length > 0) {
    return [...new Set(keys)].map((key, index) => normalizeTableColumn({ key, label: key }, index));
  }
  const objectRow = rows.find((row) => row && typeof row === "object" && !Array.isArray(row));
  return objectRow ? Object.keys(objectRow).map((key, index) => normalizeTableColumn({ key, label: key }, index)) : [];
}

function chartValue(row, key, fallback = "") {
  if (!key) return fallback;
  if (Array.isArray(row)) return row[Number(key)] ?? fallback;
  if (row && typeof row === "object" && hasOwnValue(row, key)) return row[key];
  return fallback;
}

function numericChartValue(row, key) {
  const value = Number(chartValue(row, key, 0));
  return Number.isFinite(value) ? value : 0;
}

function renderChartFallbackTable(chart, rows) {
  const columns = chartColumns(chart, rows);
  if (columns.length === 0 || rows.length === 0) {
    return `<div class="chart-table-fallback" data-chart-table-fallback><p>No chart table data.</p></div>`;
  }
  const head = columns.map((column, columnIndex) => (
    `<th scope="col" tabindex="0" data-table-cell data-table-row="0" data-table-column="${columnIndex}" data-align="${escapeAttr(column.align)}">${escapeHtml(column.label)}</th>`
  )).join("");
  const body = rows.map((row, rowIndex) => {
    const tableRow = rowIndex + 1;
    return `<tr>${columns.map((column, columnIndex) => (
      `<td tabindex="0" data-table-cell data-table-row="${tableRow}" data-table-column="${columnIndex}" data-align="${escapeAttr(column.align)}">${renderTableValue(tableCellValue(row, column, columnIndex))}</td>`
    )).join("")}</tr>`;
  }).join("\n");
  return `<div class="chart-table-fallback table-scroll" data-chart-table-fallback>
    <table class="report-data-table" data-report-data-table>
      <thead><tr>${head}</tr></thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

function renderBarLikeChart(chart, rows) {
  const encoding = chart.encoding && typeof chart.encoding === "object" ? chart.encoding : {};
  const labelKey = encoding.label || encoding.x || encoding.category || "label";
  const valueKey = encoding.value || encoding.y || "value";
  const statusKey = encoding.status || encoding.color || "";
  const max = Math.max(1, ...rows.map((row) => Math.abs(numericChartValue(row, valueKey))));
  return `<div class="chart-bars" aria-hidden="true">
    ${rows.map((row) => {
      const value = numericChartValue(row, valueKey);
      const width = Math.max(3, Math.min(100, Math.round((Math.abs(value) / max) * 100)));
      const label = chartValue(row, labelKey, "Item");
      const status = statusKey ? chartValue(row, statusKey, "") : "";
      return `<div class="chart-bar-row">
        <span class="chart-bar-label">${escapeHtml(label)}</span>
        <span class="chart-bar-track"><span class="chart-bar-fill" style="width:${width}%"></span></span>
        <span class="chart-bar-value">${escapeHtml(value)}</span>
        ${status ? `<span class="chart-bar-status">${escapeHtml(status)}</span>` : ""}
      </div>`;
    }).join("\n")}
  </div>`;
}

function renderLineLikeChart(chart, rows) {
  const encoding = chart.encoding && typeof chart.encoding === "object" ? chart.encoding : {};
  const labelKey = encoding.label || encoding.x || "label";
  const valueKey = encoding.value || encoding.y || "value";
  const values = rows.map((row) => numericChartValue(row, valueKey));
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const span = Math.max(1, max - min);
  const width = 620;
  const height = 180;
  const points = values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : Math.round((index / (values.length - 1)) * width);
    const y = Math.round(height - ((value - min) / span) * height);
    return `${x},${y}`;
  }).join(" ");
  return `<svg class="chart-line" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeAttr(chart.altText || chart.title || "chart")}" aria-hidden="true">
    <polyline points="${escapeAttr(points)}" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></polyline>
    ${values.map((value, index) => {
      const [x, y] = points.split(" ")[index].split(",");
      const label = chartValue(rows[index], labelKey, `Point ${index + 1}`);
      return `<circle cx="${x}" cy="${y}" r="4"></circle><text x="${x}" y="${Math.max(14, Number(y) - 10)}">${escapeHtml(`${label}: ${value}`)}</text>`;
    }).join("")}
  </svg>`;
}

function renderMatrixChart(chart, rows) {
  const encoding = chart.encoding && typeof chart.encoding === "object" ? chart.encoding : {};
  const labelKey = encoding.label || encoding.option || "label";
  const valueKey = encoding.value || encoding.status || "value";
  return `<div class="chart-matrix" aria-hidden="true">
    ${rows.map((row) => `<article class="chart-matrix-cell">
      <strong>${escapeHtml(chartValue(row, labelKey, "Item"))}</strong>
      <span>${escapeHtml(chartValue(row, valueKey, ""))}</span>
    </article>`).join("\n")}
  </div>`;
}

function renderChartVisual(chart, rows, degradedReason) {
  if (degradedReason) {
    return `<div class="chart-degraded" aria-hidden="true">${escapeHtml(degradedReason.replaceAll("-", " "))}</div>`;
  }
  if (["bar", "bullet"].includes(chart.type)) return renderBarLikeChart(chart, rows);
  if (["line", "sparkline", "slope"].includes(chart.type)) return renderLineLikeChart(chart, rows);
  if (chart.type === "matrix") return renderMatrixChart(chart, rows);
  return `<div class="chart-degraded" aria-hidden="true">unsupported chart</div>`;
}

function renderChartSource(chart) {
  const source = chart.source && typeof chart.source === "object" ? chart.source : {};
  const label = source.label || chart.source || "Source not provided";
  const href = safeLink(source.url);
  const accessed = source.accessedAt ? ` (${source.accessedAt})` : "";
  const sourceText = `${label}${accessed}`;
  if (href) return `<a class="source-link" data-chart-source href="${escapeAttr(href)}" rel="noreferrer">${escapeHtml(sourceText)}</a>`;
  return `<span class="source-link" data-chart-source>${escapeHtml(sourceText)}</span>`;
}

function renderChartSection(section) {
  const chart = chartSpecFromSection(section);
  const type = String(chart.type || "").toLowerCase();
  const rows = chartDataRows(chart);
  const hasRequiredShape = chart.title && chart.takeaway && chart.encoding && chart.source && chart.altText && rows.length > 0;
  const degradedReason = !supportedChartTypes.includes(type)
    ? "unsupported-chart-type"
    : (!hasRequiredShape ? "malformed-chart" : "");
  const normalizedChart = { ...chart, type: supportedChartTypes.includes(type) ? type : "fallback" };
  const degradedAttr = degradedReason ? ` data-chart-degraded="${escapeAttr(degradedReason)}"` : "";

  return `<section class="panel chart-panel" ${sectionAttrs(section)} data-chart-section data-chart-type="${escapeAttr(type || "unknown")}" data-chart-alt="${escapeAttr(chart.altText || "")}"${degradedAttr}>
    ${renderSectionHeader(section, degradedReason ? "degraded" : section.status)}
    <figure role="group" aria-label="${escapeAttr(chart.altText || chart.title || section.title)}">
      <figcaption data-chart-takeaway>
        <strong>${escapeHtml(chart.title || section.title)}</strong>
        <span>${escapeHtml(chart.takeaway || "Chart degraded to table fallback.")}</span>
      </figcaption>
      ${renderChartVisual(normalizedChart, rows, degradedReason)}
      <p class="chart-source-row">${renderChartSource(chart)}</p>
      ${renderChartFallbackTable(chart, rows)}
    </figure>
  </section>`;
}

function highlightCode(source, language = "text", highlightLines = [], startLine = 1) {
  const hotLines = new Set(highlightLines);
  const lines = String(source ?? "").replace(/\r\n/g, "\n").split("\n");
  const highlighted = lines.map((line, index) => {
    const lineNumber = startLine + index;
    const relativeLine = index + 1;
    const rendered = highlightLine(line, language);
    if (hotLines.has(lineNumber) || hotLines.has(relativeLine)) {
      return `<span class="line-hot" data-line="${lineNumber}">${rendered}</span>`;
    }
    return `<span class="code-line" data-line="${lineNumber}">${rendered}</span>`;
  });
  return `<code class="hljs language-${escapeAttr(language)}">${highlighted.join("")}</code>`;
}

function stashHighlightToken(tokens, html, pattern, renderToken) {
  return html.replace(pattern, (...args) => {
    const key = `\u0000EFFECTIVE_HL_${tokens.length}\u0000`;
    tokens.push(renderToken(...args));
    return key;
  });
}

function restoreHighlightTokens(tokens, html) {
  return html.replace(/\u0000EFFECTIVE_HL_(\d+)\u0000/g, (_match, index) => tokens[Number(index)] || "");
}

function highlightLine(line, language) {
  let html = escapeHtml(line);
  const tokens = [];
  const stashClass = (pattern, className) => {
    html = stashHighlightToken(tokens, html, pattern, (match) => `<span class="${className}">${match}</span>`);
  };
  if (["javascript", "js", "typescript", "ts"].includes(language)) {
    stashClass(/(&quot;[^&]*?&quot;|&#39;[^&]*?&#39;|`[^`]*?`)/g, "hljs-string");
    stashClass(/(\/\/.*)$/g, "hljs-comment");
    html = stashHighlightToken(tokens, html, /\b(class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g, (_match, keyword, name) => `<span class="hljs-keyword">${keyword}</span> <span class="hljs-title class_">${name}</span>`);
    html = stashHighlightToken(tokens, html, /\b(function)\s+([A-Za-z_$][\w$]*)/g, (_match, keyword, name) => `<span class="hljs-keyword">${keyword}</span> <span class="hljs-title function_">${name}</span>`);
    stashClass(/\b(async|await|const|let|var|return|function|export|import|from|if|else|try|catch|new|typeof|instanceof|extends|implements|public|private|protected|static|readonly|yield|switch|case|break|continue|throw|for|while|do|in|of)\b/g, "hljs-keyword");
    stashClass(/\b(string|number|boolean|unknown|never|void|object|Record|Promise|Array|Map|Set)\b/g, "hljs-type");
    stashClass(/\b(true|false|null|undefined)\b/g, "hljs-literal");
    stashClass(/\b(\d+(?:\.\d+)?)\b/g, "hljs-number");
    html = stashHighlightToken(tokens, html, /([A-Za-z_$][\w$]*)(\s*:)/g, (_match, name, colon) => `<span class="hljs-attr">${name}</span>${colon}`);
  } else if (["json"].includes(language)) {
    html = stashHighlightToken(tokens, html, /(&quot;[^&]*?&quot;)(\s*:)?/g, (_match, text, colon = "") => `<span class="${colon ? "hljs-attr" : "hljs-string"}">${text}</span>${colon}`);
    stashClass(/\b(true|false|null)\b/g, "hljs-literal");
    stashClass(/\b(\d+(?:\.\d+)?)\b/g, "hljs-number");
  } else if (["bash", "sh", "shell", "powershell"].includes(language)) {
    html = stashHighlightToken(tokens, html, /(^|\s)(#.*)$/g, (_match, prefix, comment) => `${prefix}<span class="hljs-comment">${comment}</span>`);
    stashClass(/(--?[A-Za-z][A-Za-z0-9-]*)/g, "hljs-attr");
    stashClass(/\b(bun|node|npm|pnpm|yarn|git|gh|openspec|powershell|pwsh|cd|dir|ls|rg|curl|docker)\b/g, "hljs-built_in");
  } else if (["css"].includes(language)) {
    stashClass(/(\/\*.*?\*\/)/g, "hljs-comment");
    stashClass(/(&quot;[^&]*?&quot;|&#39;[^&]*?&#39;)/g, "hljs-string");
    stashClass(/(#[0-9a-fA-F]{3,8})\b/g, "hljs-number");
    stashClass(/\b(\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw|s|ms)?)\b/g, "hljs-number");
    html = stashHighlightToken(tokens, html, /(^|\s|;)(--?[A-Za-z_][\w-]*)(\s*:)/g, (_match, prefix, property, colon) => `${prefix}<span class="hljs-attr">${property}</span>${colon}`);
    stashClass(/\b(display|grid|flex|block|inline|none|relative|absolute|sticky|fixed|repeat|minmax|var|calc|color-mix)\b/g, "hljs-built_in");
  }
  return restoreHighlightTokens(tokens, html);
}

async function renderMermaidSvg(source, title, options) {
  if (options.browserMermaid) {
    const rendered = await renderMermaidWithBrowser(source);
    if (rendered.ok) return rendered.svg;
    return fallbackMermaidSvg(source, title, rendered.error || "Mermaid 预渲染不可用；已保留源内容 fallback。");
  }
  return fallbackMermaidSvg(source, title, "未请求预渲染 Mermaid；源内容保留为隐藏 fallback。");
}

async function renderMermaidWithBrowser(source) {
  if (process.env.EFFECTIVE_INTERACT_DISABLE_BROWSER_MERMAID === "1") {
    return {
      ok: false,
      error: "Playwright unavailable: disabled by EFFECTIVE_INTERACT_DISABLE_BROWSER_MERMAID"
    };
  }

  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch (error) {
    return {
      ok: false,
      error: `Playwright unavailable: ${sanitizeDiagnosticMessage(error.message) || "module not installed"}`
    };
  }

  let browser;
  try {
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const page = await browser.newPage();
    const mermaid = runtimeLibraries.find((item) => item.id === "mermaid");
    const html = `<!doctype html><div id="diagram"></div><script type="module">import mermaid from "${mermaid.url}"; mermaid.initialize({startOnLoad:false, securityLevel:"strict", theme:"base"}); const result = await mermaid.render("diagram-svg", ${JSON.stringify(String(source ?? ""))}); document.getElementById("diagram").innerHTML = result.svg;</script>`;
    await page.setContent(html, { waitUntil: "networkidle" });
    const svg = await page.locator("#diagram svg").evaluate((node) => node.outerHTML);
    return { ok: true, svg };
  } catch (error) {
    return {
      ok: false,
      error: sanitizeDiagnosticMessage(error.message) || "Browser Mermaid rendering failed"
    };
  } finally {
    if (browser) await browser.close();
  }
}

function fallbackMermaidSvg(source, title, message) {
  const lines = String(source ?? "").split("\n").filter(Boolean).slice(0, 8);
  const width = 900;
  const contentStart = 88;
  const lineStep = 24;
  const footerY = contentStart + lines.length * lineStep + 22;
  const height = Math.max(220, footerY + 38);
  const renderedLines = lines
    .map((line, index) => `<text x="34" y="${contentStart + index * lineStep}" font-size="14" fill="#172033">${escapeHtml(line.slice(0, 110))}</text>`)
    .join("");

  return [
    `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeAttr(title)} diagram" data-mermaid-renderer="fallback">`,
    `<rect x="12" y="12" width="${width - 24}" height="${height - 24}" rx="8" fill="#ffffff" stroke="#d7dce5"/>`,
    `<rect x="24" y="24" width="${width - 48}" height="34" rx="6" fill="#eef4ff" stroke="#2563eb"/>`,
    `<text x="38" y="46" font-size="15" font-weight="700" fill="#172033">${escapeHtml(title.slice(0, 96))}</text>`,
    renderedLines,
    `<text x="34" y="${footerY}" font-size="12" fill="#475467">${escapeHtml(message)}</text>`,
    `</svg>`
  ].join("");
}

function sectionAttrs(section) {
  return `id="${escapeAttr(section.id)}" data-section-type="${escapeAttr(section.type)}" data-section-group="${escapeAttr(section.group)}" data-section-status="${escapeAttr(section.status)}" data-trust-level="${escapeAttr(normalizeTrustLevel(section.trustLevel))}"`;
}

function renderSummaryCards(section) {
  const cards = Array.isArray(section.cards) ? section.cards : [];
  return `<section class="panel" ${sectionAttrs(section)}>
    ${renderSectionHeader(section)}
    <div class="metric-grid focus-field">
      ${cards.map((card) => `<article class="interactive-card evidence-card evidence-spotlight" data-evidence-spotlight><div class="meta">${escapeHtml(card.label)}</div><strong>${escapeHtml(card.value)}</strong></article>`).join("\n")}
    </div>
  </section>`;
}

function renderRuntimeMarkdown(section, index) {
  const sourceId = `markdown-source-${index}`;
  const statusId = `markdown-status-${index}`;
  const trustLevel = normalizeTrustLevel(section.trustLevel);
  const trustedAttr = trustLevel === "trusted-generated" ? ' data-trusted="true"' : "";
  return `<section class="panel rich-section" ${sectionAttrs(section)} data-rich-section data-rich-kind="markdown" data-render-state="pending" data-source-fallback>
    ${renderSectionHeader(section)}
    <div class="rich-target" data-rich-markdown data-rich-status-id="${statusId}" data-rich-section-id="${escapeAttr(section.id)}"${trustedAttr}>${escapeHtml(safeAuditText(section.content || ""))}</div>
    <template id="${sourceId}" data-rich-source data-source-fallback>${escapeHtml(safeAuditText(section.content || ""))}</template>
  </section>`;
}

async function renderMarkdownSection(section, mode, index) {
  if (isRuntimeMode(mode)) return renderRuntimeMarkdown(section, index);
  const rendered = mode === "pre-rendered";
  if (String(section.id || "").startsWith("section-story-")) {
    return `<details class="panel rich-section collapsible-panel" ${sectionAttrs(section)} data-rich-section data-rich-kind="markdown" data-render-state="${richStateForMode(mode, rendered)}" data-source-fallback>
    ${renderCollapsibleStorySummary(section, rendered ? "ready" : "degraded")}
    <div class="collapsible-content" data-collapsible-content>
      ${rendered ? renderMarkdown(section.content || "") : `<pre class="fallback-source-block">${escapeHtml(safeAuditText(section.content || ""))}</pre>`}
    </div>
    <template data-rich-source data-source-fallback>${escapeHtml(safeAuditText(section.content || ""))}</template>
  </details>`;
  }
  return `<section class="panel rich-section" ${sectionAttrs(section)} data-rich-section data-rich-kind="markdown" data-render-state="${richStateForMode(mode, rendered)}" data-source-fallback>
    ${renderSectionHeader(section, rendered ? "ready" : "degraded")}
    ${rendered ? renderMarkdown(section.content || "") : `<pre class="fallback-source-block">${escapeHtml(safeAuditText(section.content || ""))}</pre>`}
    <template data-rich-source data-source-fallback>${escapeHtml(safeAuditText(section.content || ""))}</template>
  </section>`;
}

async function renderMermaidSection(section, mode, index, options) {
  const sourceId = `mermaid-source-${index}`;
  const statusId = `mermaid-status-${index}`;

  if (isRuntimeMode(mode)) {
    return `<section class="panel diagram-panel mermaid-evidence rich-section" ${sectionAttrs(section)} data-rich-section data-rich-kind="mermaid" data-render-state="pending" data-source-fallback>
      ${renderSectionHeader(section)}
      <div class="mermaid-rendered" data-rich-mermaid-target data-rich-status-id="${statusId}" data-rich-section-id="${escapeAttr(section.id)}" data-source-id="${sourceId}"></div>
      <template id="${sourceId}" data-rich-source data-source-fallback data-mermaid-source>${escapeHtml(section.content || "")}</template>
    </section>`;
  }

  const rendered = mode === "pre-rendered";
  const svg = rendered ? await renderMermaidSvg(section.content || "", section.title, options) : fallbackMermaidSvg(section.content || "", section.title, "Fallback-only mode keeps Mermaid source auditable.");
  const isFallback = svg.includes('data-mermaid-renderer="fallback"');
  const renderState = rendered && !isFallback ? "ready" : "degraded";
  return `<section class="panel diagram-panel mermaid-evidence rich-section" ${sectionAttrs(section)} data-rich-section data-rich-kind="mermaid" data-render-state="${renderState}" data-source-fallback>
    ${renderSectionHeader(section, renderState)}
    <div class="mermaid-rendered">${svg}</div>
    <template id="${sourceId}" data-rich-source data-source-fallback data-mermaid-source>${escapeHtml(section.content || "")}</template>
  </section>`;
}

function renderCodeSection(section, mode, index) {
  const language = section.language || "text";
  const sourceId = `code-source-${index}`;
  const codeId = `code-${index}`;
  const statusId = `code-status-${index}`;
  const startLine = Number.isInteger(section.startLine) ? section.startLine : 1;
  const highlightLines = Array.isArray(section.highlightLines) ? section.highlightLines : [];

  if (isRuntimeMode(mode)) {
    return `<section class="code-panel rich-section" ${sectionAttrs(section)} data-rich-section data-rich-kind="code" data-render-state="pending" data-source-fallback>
      <header><div>${renderSourceLink(section, sourceId)}</div><button data-copy-from="#${codeId}">复制</button></header>
      <pre id="${codeId}" data-start-line="${startLine}" data-line-numbered><code class="hljs language-${escapeAttr(language)}" data-rich-code data-rich-status-id="${statusId}" data-rich-section-id="${escapeAttr(section.id)}" data-code-source-id="${sourceId}" data-start-line="${startLine}" data-highlight-lines="${escapeAttr(highlightLines.join(","))}">${escapeHtml(section.content || "")}</code></pre>
      <template id="${sourceId}" data-rich-source data-source-fallback>${escapeHtml(section.content || "")}</template>
    </section>`;
  }

  const rendered = mode === "pre-rendered";
  const code = rendered ? highlightCode(section.content || "", language, highlightLines, startLine) : `<code class="language-${escapeAttr(language)}">${escapeHtml(section.content || "")}</code>`;
  return `<section class="code-panel rich-section" ${sectionAttrs(section)} data-rich-section data-rich-kind="code" data-render-state="${richStateForMode(mode, rendered)}" data-source-fallback>
    <header><div>${renderSourceLink(section, sourceId)}</div><button data-copy-from="#${codeId}">复制</button></header>
    <pre id="${codeId}" data-start-line="${startLine}" data-line-numbered>${code}</pre>
    <template id="${sourceId}" data-rich-source data-source-fallback>${escapeHtml(section.content || "")}</template>
  </section>`;
}

function highlightDiff(source) {
  const lines = String(source ?? "").replace(/\r\n/g, "\n").split("\n");
  return lines.map((line, index) => {
    const escaped = escapeHtml(line);
    const lineNumber = index + 1;
    if (line.startsWith("+") && !line.startsWith("+++")) {
      return `<span class="diff-line diff-added" data-line="${lineNumber}">${escaped}</span>`;
    }
    if (line.startsWith("-") && !line.startsWith("---")) {
      return `<span class="diff-line diff-removed" data-line="${lineNumber}">${escaped}</span>`;
    }
    if (line.startsWith("@@")) {
      return `<span class="diff-line diff-hunk" data-line="${lineNumber}">${escaped}</span>`;
    }
    return `<span class="diff-line" data-line="${lineNumber}">${escaped}</span>`;
  }).join("");
}

function renderDiffSection(section, index) {
  const sourceId = `diff-${index}`;
  return `<section class="diff-panel rich-section" ${sectionAttrs(section)} data-rich-section data-rich-kind="diff" data-render-state="ready" data-source-fallback>
    <header><div><h2>${escapeHtml(section.title)}</h2>${renderSourceLink(section, sourceId)}</div><button data-copy-from="#${sourceId}">复制 diff</button></header>
    <pre id="${sourceId}" data-line-numbered><code>${highlightDiff(section.content || "")}</code></pre>
  </section>`;
}

function renderSourceInventoryFinder(section) {
  if (section.sourceInventoryFinder !== true) return "";
  const totalValue = Number(section.sourceInventoryFinderTotal);
  const total = Number.isFinite(totalValue) && totalValue >= 0 ? Math.trunc(totalValue) : "";
  const totalAttr = total === "" ? "" : ` data-source-inventory-total="${escapeAttr(total)}"`;
  const totalLabel = total === "" ? "全部信源" : `全部 ${total} 条`;
  const baseId = section.id || "section-source-inventory";
  const inputId = `${baseId}-finder-search`;
  const statusId = `${baseId}-finder-status`;
  return `<div class="source-inventory-finder" data-source-inventory-finder data-source-inventory-target-prefix="section-source-inventory-group-"${totalAttr}>
    <label class="source-inventory-finder__label" for="${escapeAttr(inputId)}">查找信源</label>
    <div class="source-inventory-finder__row">
      <input id="${escapeAttr(inputId)}" type="search" autocomplete="off" spellcheck="false" data-source-inventory-search aria-describedby="${escapeAttr(statusId)}" placeholder="OpenAI / rsshub / platform:wechat / manual">
      <button type="button" data-source-inventory-next disabled>下一个</button>
      <button type="button" data-source-inventory-clear disabled>清除</button>
    </div>
    <p class="source-inventory-finder__status" id="${escapeAttr(statusId)}" data-source-inventory-status aria-live="polite">输入关键词后只高亮匹配项，${escapeHtml(totalLabel)}仍保留在页面中。</p>
  </div>`;
}

function safeClassList(value) {
  return String(value || "")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => /^[A-Za-z0-9_-]+$/.test(item))
    .join(" ");
}

function renderCardTags(tags) {
  const values = Array.isArray(tags) ? tags.filter(Boolean) : [];
  if (values.length === 0) {
    return "";
  }
  return `<div class="card-tags">${values.map(renderCardTag).join("")}</div>`;
}

function renderCardTag(tag) {
  const normalized = normalizeCardTag(tag);
  const className = ["chip", normalized.kind ? `chip-${safeHighlightClass(normalized.kind)}` : ""].filter(Boolean).join(" ");
  return `<span class="${escapeAttr(className)}">${escapeHtml(normalized.label)}</span>`;
}

function normalizeCardTag(tag) {
  if (tag && typeof tag === "object") {
    return {
      label: String(tag.label || tag.text || tag.value || "").trim(),
      kind: String(tag.kind || tag.type || tag.status || "").trim()
    };
  }
  const text = String(tag || "").trim();
  const encoded = text.match(/^([a-z0-9-]+)\|(.+)$/i);
  if (encoded) {
    return { kind: encoded[1], label: encoded[2] };
  }
  if (text === "重大") return { kind: "major", label: text };
  if (text === "值得关注") return { kind: "notable", label: text };
  if (text === "一般") return { kind: "general", label: text };
  if (/stars?/i.test(text)) return { kind: "stars", label: text };
  return { kind: "", label: text };
}

function renderCardTitle(item) {
  const title = escapeHtml(item.title || "Untitled");
  const subtitle = String(item.subtitle || item.subTitle || item.sub_title || "").trim();
  const subtitleHtml = subtitle ? `<span class="card-subtitle">${escapeHtml(subtitle)}</span>` : "";
  const href = safeLink(item.href || item.url || "");
  const iconSource = item.titleIcon || item.title_icon || item.icon || item.iconDataUri || item.icon_data_uri || "";
  const icon = safeDataImage(iconSource) || safeMediaSrc(iconSource);
  const iconHtml = icon ? `<img class="inline-site-icon card-title-icon" src="${escapeAttr(icon)}" alt="" loading="lazy" decoding="async">` : "";
  if (!href) {
    return `<h3>${iconHtml}<span class="card-title-text"><span>${title}</span>${subtitleHtml}</span></h3>`;
  }
  return `<h3><a class="card-title-link" href="${escapeAttr(href)}" rel="noreferrer">${iconHtml}<span class="card-title-text"><span>${title}</span>${subtitleHtml}</span></a></h3>`;
}

function renderCardDetails(points) {
  const items = Array.isArray(points) ? points.filter((point) => point && (point.label || point.value)) : [];
  if (items.length === 0) {
    return "";
  }
  return `<dl class="card-detail-list">${items.map((point) => {
    const icon = safeDataImage(point.icon || point.iconDataUri || point.icon_data_uri || "");
    const iconHtml = icon ? `<img class="card-detail-icon" src="${escapeAttr(icon)}" alt="" loading="lazy" decoding="async">` : "";
    return `<div><dt>${escapeHtml(point.label || "Detail")}</dt><dd>${iconHtml}<span>${escapeHtml(point.value || "")}</span></dd></div>`;
  }).join("")}</dl>`;
}

function renderCardStats(stats) {
  const items = Array.isArray(stats) ? stats.filter((item) => item && (item.label || item.value || item.detail)).slice(0, 6) : [];
  if (items.length === 0) {
    return "";
  }
  return `<div class="card-stat-grid" data-card-stats>${items.map((item) => `
    <div class="card-stat">
      <span class="card-stat-label">${escapeHtml(item.label || "")}</span>
      <strong>${inlineMarkdown(item.value || "")}</strong>
      ${item.detail ? `<span class="card-stat-detail">${inlineMarkdown(item.detail)}</span>` : ""}
    </div>`).join("")}</div>`;
}

function cardVisualRows(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (value && typeof value === "object" && Array.isArray(value.rows)) {
    return value.rows;
  }
  return [];
}

function renderCardBars(bars) {
  const rows = cardVisualRows(bars).filter((row) => row && (row.label || row.value));
  if (rows.length === 0) {
    return "";
  }
  const title = bars && !Array.isArray(bars) && bars.title ? bars.title : "分布";
  const chart = {
    encoding: {
      label: "label",
      value: "value",
      status: "status"
    }
  };
  return `<div class="card-visual card-bars" data-card-bars>
    <div class="card-visual-title">${escapeHtml(title)}</div>
    ${renderBarLikeChart(chart, rows)}
  </div>`;
}

function renderCardTrendCurve(curve) {
  if (!curve || typeof curve !== "object") {
    return "";
  }
  const points = Array.isArray(curve.points)
    ? curve.points
        .map((point) => ({
          date: String(point?.date || ""),
          label: String(point?.label || point?.date || "").trim(),
          value: Number(point?.value),
          valueLabel: String(point?.valueLabel || point?.value_label || point?.value || "").trim(),
          topLabel: String(point?.topLabel || point?.top_label || "").trim()
        }))
        .filter((point) => point.label && Number.isFinite(point.value))
        .slice(-7)
    : [];
  if (points.length < 2) {
    return "";
  }

  const width = 360;
  const height = 118;
  const padX = 28;
  const padTop = 18;
  const padBottom = 28;
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const xStep = points.length > 1 ? (width - padX * 2) / (points.length - 1) : 0;
  const yScale = height - padTop - padBottom;
  const coordinates = points.map((point, index) => {
    const x = padX + xStep * index;
    const y = padTop + (1 - ((point.value - min) / span)) * yScale;
    return { ...point, x, y };
  });
  const polyline = coordinates.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const first = points[0];
  const last = points[points.length - 1];
  const title = curve.title || "7-day trend";
  const metric = curve.metric || "";
  const sourceId = curve.sourceId || curve.source_id || "";
  const ariaLabel = `${title}${metric ? ` ${metric}` : ""}: ${first.label} ${first.valueLabel || formatTrendPointValue(first.value)} to ${last.label} ${last.valueLabel || formatTrendPointValue(last.value)}`;

  return `<div class="card-visual card-trend-curve" data-tracking-trend-curve data-tracking-source="${escapeAttr(sourceId)}" data-trend-points="${points.length}" aria-label="${escapeAttr(ariaLabel)}">
    <div class="card-visual-title"><span>${escapeHtml(title)}</span>${metric ? `<span class="card-trend-metric">${escapeHtml(metric)}</span>` : ""}</div>
    <svg class="card-trend-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeAttr(ariaLabel)}" focusable="false">
      <line class="card-trend-grid" x1="${padX}" y1="${padTop}" x2="${width - padX}" y2="${padTop}"></line>
      <line class="card-trend-grid" x1="${padX}" y1="${height - padBottom}" x2="${width - padX}" y2="${height - padBottom}"></line>
      <polyline class="card-trend-line" points="${escapeAttr(polyline)}"></polyline>
      ${coordinates.map((point) => `<circle class="card-trend-point" cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="3.2"><title>${escapeHtml(`${point.label}: ${point.valueLabel || formatTrendPointValue(point.value)}${point.topLabel ? ` | ${point.topLabel}` : ""}`)}</title></circle>`).join("")}
      ${coordinates.map((point, index) => index === 0 || index === coordinates.length - 1
        ? `<text class="card-trend-axis-label" x="${point.x.toFixed(1)}" y="${height - 8}" text-anchor="${index === 0 ? "start" : "end"}">${escapeHtml(point.label)}</text>`
        : "").join("")}
    </svg>
    <div class="card-trend-summary">
      <span>${escapeHtml(first.valueLabel || formatTrendPointValue(first.value))}</span>
      <span>${escapeHtml(last.valueLabel || formatTrendPointValue(last.value))}</span>
    </div>
  </div>`;
}

function formatTrendPointValue(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "";
  }
  if (numeric >= 1_000_000_000_000) return `${(numeric / 1_000_000_000_000).toFixed(2).replace(/\.00$/, "")}T`;
  if (numeric >= 1_000_000_000) return `${(numeric / 1_000_000_000).toFixed(2).replace(/\.00$/, "")}B`;
  if (numeric >= 1_000_000) return `${(numeric / 1_000_000).toFixed(2).replace(/\.00$/, "")}M`;
  if (numeric >= 1_000) return `${(numeric / 1_000).toFixed(2).replace(/\.00$/, "")}K`;
  return String(Math.round(numeric * 100) / 100);
}

function renderCardTable(table) {
  const rows = cardVisualRows(table);
  if (!table || typeof table !== "object" || rows.length === 0) {
    return "";
  }
  const columns = normalizeTableColumns({ columns: table.columns, headers: table.headers, rows });
  if (columns.length === 0) {
    return "";
  }
  const colgroup = columns
    .map((column) => column.width ? `<col style="width:${escapeAttr(column.width)}">` : "<col>")
    .join("");
  const head = columns.map((column, columnIndex) => (
    `<th scope="col" tabindex="0" data-table-cell data-table-row="0" data-table-column="${columnIndex}" data-align="${escapeAttr(column.align)}">${escapeHtml(column.label)}</th>`
  )).join("");
  const body = rows.map((row, rowIndex) => {
    const tableRow = rowIndex + 1;
    return `<tr>${columns.map((column, columnIndex) => (
      `<td tabindex="0" data-table-cell data-table-row="${tableRow}" data-table-column="${columnIndex}" data-align="${escapeAttr(column.align)}">${renderTableValue(tableCellValue(row, column, columnIndex))}</td>`
    )).join("")}</tr>`;
  }).join("\n");
  const title = table.title ? `<div class="card-visual-title">${escapeHtml(table.title)}</div>` : "";
  const caption = table.caption ? `<p class="table-caption">${escapeHtml(table.caption)}</p>` : "";
  return `<div class="card-visual card-table" data-card-table>
    ${title}
    ${caption}
    <div class="table-scroll card-table-scroll" data-table-wrap>
      <table class="report-data-table card-data-table" data-report-data-table data-card-data-table>
        <colgroup>${colgroup}</colgroup>
        <thead><tr>${head}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  </div>`;
}

function renderTrackingComponent(component) {
  if (!component || typeof component !== "object") {
    return "";
  }
  if (component.officialSnapshot?.html) {
    return renderOfficialTrackingComponent(component);
  }
  const tabs = Array.isArray(component.tabs) ? component.tabs.filter((tab) => tab && tab.id) : [];
  if (tabs.length === 0) {
    return "";
  }
  const group = slugify(`tracking-${component.kind || component.source || "component"}`);
  const buttons = tabs.map((tab, index) => {
    const panelId = `${group}-${slugify(tab.id || `tab-${index + 1}`)}`;
    return `<button type="button" data-tab-group="${escapeAttr(group)}" data-tab="${escapeAttr(panelId)}" aria-selected="${index === 0 ? "true" : "false"}">${escapeHtml(tab.label || tab.id)}</button>`;
  }).join("");
  const panels = tabs.map((tab, index) => {
    const panelId = `${group}-${slugify(tab.id || `tab-${index + 1}`)}`;
    return `<div class="tracking-component-panel" id="${escapeAttr(panelId)}" data-tab-panel-group="${escapeAttr(group)}" ${index === 0 ? "" : "hidden"}>
      ${renderTrackingComponentPanel(component, tab)}
    </div>`;
  }).join("");
  const hasScaleToggle = tabs.some((tab) => ["bar", "stacked_bar"].includes(String(tab.view || "")));
  const header = hasScaleToggle ? `<div class="tracking-component-header">
      <div class="tracking-scale-toggle" role="group" aria-label="Scale">
        <button type="button" data-scale-mode="linear" aria-pressed="true">Linear</button>
        <button type="button" data-scale-mode="log" aria-pressed="false">Log</button>
      </div>
    </div>` : "";
  return `<div class="tracking-component" data-tracking-component data-component-kind="${escapeAttr(component.kind || "")}" data-scale="linear">
    ${header}
    <div class="toolbar tracking-component-tabs" role="tablist" aria-label="${escapeAttr(component.source || "Tracking component")} tabs">${buttons}</div>
    ${panels}
    ${renderTrackingTrace(component.trace)}
  </div>`;
}

function renderOfficialTrackingComponent(component) {
  const snapshot = component.officialSnapshot || {};
  const html = sanitizeOfficialSnapshotHtml(snapshot.html || snapshot.sanitizedHtml || snapshot.sanitized_html || "");
  if (!html) {
    return "";
  }
  if (!isPublishableOfficialTrackingSnapshot(snapshot, html)) {
    return renderOfficialTrackingUnavailable(component, snapshot);
  }
  const snapshotId = slugify(`${component.kind || component.source || "official"}-${snapshot.domHash || snapshot.dom_hash || "snapshot"}`);
  const css = scopeOfficialSnapshotCss(snapshot.css || snapshot.sanitizedCss || snapshot.sanitized_css || "", snapshotId);
  const style = css ? `<style data-official-tracking-css>${escapeStyleContent(css)}</style>` : "";
  const meta = officialTrackingPublicMeta(component, snapshot);
  return `<div class="tracking-component official-tracking-component" data-tracking-component data-official-component-snapshot data-component-kind="${escapeAttr(component.kind || "")}">
    ${style}
    <div class="tracking-component-header">
      <div>
        <div class="card-visual-title">${escapeHtml(component.source || "Tracking component")}</div>
        ${meta ? `<span class="tracking-component-meta">${escapeHtml(meta)}</span>` : ""}
      </div>
    </div>
    <div class="official-tracking-snapshot" data-official-snapshot-id="${escapeAttr(snapshotId)}">
      ${html}
    </div>
  </div>`;
}

function renderOfficialTrackingUnavailable(component, snapshot = {}) {
  const meta = officialTrackingPublicMeta(component, snapshot);
  return `<div class="tracking-component official-tracking-component tracking-component-fallback" data-tracking-component data-official-component-unavailable data-component-kind="${escapeAttr(component.kind || "")}">
    <div class="tracking-component-header">
      <div>
        <div class="card-visual-title">${escapeHtml(component.source || "Tracking component")}</div>
        ${meta ? `<span class="tracking-component-meta">${escapeHtml(meta)}</span>` : ""}
      </div>
    </div>
    <p>官方 web 组件 snapshot 本轮不可用；为避免渲染整页级 DOM 或未核验的巨型页面片段，本卡只保留官方入口供读者手动核对。</p>
  </div>`;
}

function officialTrackingPublicMeta() {
  return "";
}

function renderTrackingComponentPanel(component, tab) {
  const series = trackingSeriesForTab(component, tab.id);
  const rows = trackingRowsForPanel(component, series);
  if (tab.status === "fallback" || tab.status === "blocked" || rows.length === 0) {
    const reason = tab.fallbackReason || series.find((item) => item.fallbackReason)?.fallbackReason || "data unavailable";
    return `<div class="tracking-component-fallback">${escapeHtml(reason)}</div>`;
  }
  if (tab.view === "leaderboard" || tab.view === "score_table") {
    return renderTrackingLeaderboard(rows, tab);
  }
  if (tab.view === "line_multi") {
    return renderTrackingLineChart(rows, tab, component);
  }
  if (tab.view === "scatter") {
    return renderTrackingScatterFallback(rows, tab);
  }
  return renderTrackingBars(rows, tab);
}

function sanitizeOfficialSnapshotHtml(value) {
  return String(value || "")
    .replace(/\0/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\s*(script|style|iframe|object|embed|form|input|textarea|select|option|link|meta|base|canvas)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed|form|input|textarea|select|option|link|meta|base|canvas)[^>]*\/?>/gi, "")
    .replace(/\s(on[a-z]+|style|srcdoc)\s*=\s*"[^"]*"/gi, "")
    .replace(/\s(on[a-z]+|style|srcdoc)\s*=\s*'[^']*'/gi, "")
    .replace(/\s(on[a-z]+|style|srcdoc)\s*=\s*[^\s>]+/gi, "")
    .replace(/\s(href|src)\s*=\s*"(?!(?:https?:|\/|#))[^"]*"/gi, "")
    .replace(/\s(href|src)\s*=\s*'(?!(?:https?:|\/|#))[^']*'/gi, "")
    .replace(/\s(href|src)\s*=\s*(?!(?:https?:|\/|#))[^\s>]+/gi, "")
    .trim();
}

function isPublishableOfficialTrackingSnapshot(snapshot, html) {
  const selector = String(snapshot.sourceSelector || snapshot.source_selector || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (["html", "body", "main", "#root", "#__next"].includes(selector)) {
    return false;
  }
  if (html.length > 30000 || /^<\s*(html|body|main)(?:\s|>)/i.test(html)) {
    return false;
  }
  const rowLikeCount = (html.match(/<\s*tr\b|role\s*=\s*["']row["']|<\s*li\b/gi) || []).length;
  const hasStructuredSurface = /<\s*table\b|role\s*=\s*["']table["']/i.test(html) || rowLikeCount > 0;
  const hasComponentMarker = /data-[^=]*(openrouter|ranking|leaderboard|analysis|index|aa)|class\s*=\s*["'][^"']*(ranking|leaderboard|analysis|index|card)/i.test(html);
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text.length >= 20 && (hasStructuredSurface || hasComponentMarker);
}

function scopeOfficialSnapshotCss(value, snapshotId) {
  const css = String(value || "")
    .replace(/\0/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/@import[^;]+;/gi, "")
    .replace(/url\s*\([^)]*\)/gi, "none")
    .replace(/expression\s*\([^)]*\)/gi, "")
    .replace(/<\/?style[^>]*>/gi, "")
    .trim();
  if (!css) {
    return "";
  }
  const scope = `.official-tracking-snapshot[data-official-snapshot-id="${snapshotId}"]`;
  return css.replace(/([^{}]+)\{([^{}]*)\}/g, (match, selectorText, body) => {
    const selectors = selectorText
      .split(",")
      .map((selector) => selector.trim())
      .filter(Boolean)
      .filter((selector) => !selector.startsWith("@"));
    if (selectors.length === 0) {
      return "";
    }
    const declarations = body
      .replace(/position\s*:\s*(fixed|sticky)\s*;?/gi, "")
      .replace(/behavior\s*:[^;]+;/gi, "")
      .trim();
    if (!declarations) {
      return "";
    }
    return `${selectors.map((selector) => `${scope} ${selector}`).join(", ")} { ${declarations} }`;
  });
}

function escapeStyleContent(value) {
  return String(value || "").replace(/<\/style/gi, "<\\/style");
}

function trackingSeriesForTab(component, tabId) {
  return (Array.isArray(component.series) ? component.series : []).filter((series) => {
    return (series.tabId || series.tab_id) === tabId;
  });
}

function trackingRowsForPanel(component, series) {
  const rows = series.flatMap((item) => Array.isArray(item.rows) ? item.rows : []);
  if (rows.length > 0) {
    return rows;
  }
  return Array.isArray(component.rows) ? component.rows : [];
}

function trackingRowValue(row) {
  const value = Number(row.value);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function trackingRowLabel(row) {
  const rank = row.rank ? `#${row.rank} ` : "";
  return `${rank}${row.model || row.label || "item"}`;
}

function trackingTooltip(row) {
  return [
    trackingRowLabel(row),
    row.provider ? `provider: ${row.provider}` : "",
    row.metric ? `metric: ${row.metric}` : "",
    row.valueLabel || row.value_label || "",
    row.secondaryValueLabel || row.secondary_value_label ? `x: ${row.secondaryValueLabel || row.secondary_value_label}` : "",
    row.change ? `change: ${row.change}` : ""
  ].filter(Boolean).join(" | ");
}

function renderTrackingLineChart(rows, tab, component = {}) {
  const points = normalizeTrackingLinePoints(rows);
  if (points.length === 0) {
    return `<div class="tracking-component-fallback">${escapeHtml(tab.fallbackReason || "trend data unavailable")}</div>`;
  }
  const dates = [...new Set(points.map((point) => point.date))]
    .sort((left, right) => left.localeCompare(right))
    .slice(-7);
  const dateSet = new Set(dates);
  const inWindow = points.filter((point) => dateSet.has(point.date));
  const groups = trackingLineGroups(inWindow, dates).slice(0, 24);
  if (groups.length === 0) {
    return `<div class="tracking-component-fallback">${escapeHtml(tab.fallbackReason || "trend data unavailable")}</div>`;
  }

  const width = 920;
  const height = 300;
  const padLeft = 44;
  const padRight = 178;
  const padTop = 22;
  const padBottom = 34;
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;
  const maxRank = Math.max(10, ...groups.flatMap((group) => group.points.map((point) => point.rank)));
  const rankSpan = Math.max(1, maxRank - 1);
  const xForDate = (date) => {
    const index = dates.indexOf(date);
    if (dates.length <= 1) return padLeft + plotWidth / 2;
    return padLeft + (plotWidth * index) / (dates.length - 1);
  };
  const yForRank = (rank) => padTop + ((Math.max(1, rank) - 1) / rankSpan) * plotHeight;
  const gridDates = dates.map((date, index) => {
    const x = xForDate(date);
    return `<line class="tracking-line-grid tracking-line-grid-date" x1="${x.toFixed(1)}" y1="${padTop}" x2="${x.toFixed(1)}" y2="${height - padBottom}"></line>
      ${index === 0 || index === dates.length - 1 ? `<text class="tracking-line-axis-label" x="${x.toFixed(1)}" y="${height - 8}" text-anchor="${index === 0 ? "start" : "end"}">${escapeHtml(shortDateLabel(date))}</text>` : ""}`;
  }).join("");
  const rankTicks = [1, Math.max(2, Math.ceil(maxRank / 2)), maxRank]
    .filter((rank, index, all) => all.indexOf(rank) === index)
    .map((rank) => {
      const y = yForRank(rank);
      return `<line class="tracking-line-grid" x1="${padLeft}" y1="${y.toFixed(1)}" x2="${width - padRight}" y2="${y.toFixed(1)}"></line>
        <text class="tracking-line-rank-label" x="8" y="${(y + 4).toFixed(1)}">#${rank}</text>`;
    }).join("");
  const renderedGroups = groups.map((group, index) => {
    const color = trackingLineColor(index);
    const coordinates = group.points.map((point) => ({
      ...point,
      x: xForDate(point.date),
      y: yForRank(point.rank),
      dateIndex: dates.indexOf(point.date)
    }));
    const segments = contiguousTrackingLineSegments(coordinates)
      .filter((segment) => segment.length >= 2)
      .map((segment) => `<polyline class="tracking-line-path" points="${escapeAttr(segment.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" "))}"></polyline>`)
      .join("");
    const circles = coordinates.map((point) => {
      const tooltip = `${point.model} | ${point.date} | #${point.rank}${point.valueLabel ? ` | ${point.valueLabel}` : ""}${point.change ? ` | ${point.change}` : ""}`;
      return `<circle class="tracking-line-point" cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="3.1" data-tracking-tooltip="${escapeAttr(tooltip)}"><title>${escapeHtml(tooltip)}</title></circle>`;
    }).join("");
    const lastPoint = coordinates.at(-1);
    const label = lastPoint
      ? `<text class="tracking-line-label" data-tracking-line-label="${escapeAttr(group.model)}" x="${(lastPoint.x + 9).toFixed(1)}" y="${lastPoint.y.toFixed(1)}" dominant-baseline="middle">${escapeHtml(shortTrackingLineLabel(group.model))}</text>`
      : "";
    return `<g class="tracking-line-series" data-tracking-line data-tracking-line-model="${escapeAttr(group.model)}" style="--line-color:${escapeAttr(color)}">${segments}${circles}${label}</g>`;
  }).join("");
  const legend = "";
  const sourceId = component.sourceId || component.source_id || component.kind || "";
  const ariaLabel = `${tab.label || "七日排名"}：${groups.length} 条实体曲线，${dates.length} 个日期点`;
  return `<div class="tracking-line-chart" data-tracking-trend-curve data-tracking-line-chart data-tracking-source="${escapeAttr(sourceId)}" data-trend-points="${dates.length}" data-trend-lines="${groups.length}" aria-label="${escapeAttr(ariaLabel)}">
    <svg class="tracking-line-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeAttr(ariaLabel)}" focusable="false">
      ${gridDates}
      ${rankTicks}
      ${renderedGroups}
    </svg>
    <div class="tracking-line-legend" aria-label="实体图例">${legend}</div>
  </div>`;
}

function normalizeTrackingLinePoints(rows) {
  return rows
    .map((row) => {
      const date = String(row.metric || row.date || row.label || "").match(/\d{4}-\d{2}-\d{2}/)?.[0] || String(row.metric || row.date || row.label || "").trim();
      const rank = Number(row.rank);
      const model = String(row.model || row.label || "").trim();
      if (!date || !model || !Number.isFinite(rank) || rank <= 0) {
        return null;
      }
      return {
        date,
        rank,
        model,
        provider: String(row.provider || "").trim(),
        value: Number(row.value),
        valueLabel: String(row.valueLabel || row.value_label || "").trim(),
        change: String(row.change || "").trim()
      };
    })
    .filter(Boolean);
}

function trackingLineGroups(points, dates) {
  const dateOrder = new Map(dates.map((date, index) => [date, index]));
  const groups = new Map();
  for (const point of points) {
    const key = trackingModelKey(point.model);
    if (!key) continue;
    if (!groups.has(key)) {
      groups.set(key, { key, model: point.model, points: [] });
    }
    groups.get(key).points.push(point);
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      points: group.points
        .sort((left, right) => (dateOrder.get(left.date) ?? 0) - (dateOrder.get(right.date) ?? 0))
        .filter((point, index, all) => all.findIndex((candidate) => candidate.date === point.date) === index)
    }))
    .sort((left, right) => {
      const latestDate = dates[dates.length - 1] || "";
      const leftLatest = left.points.find((point) => point.date === latestDate);
      const rightLatest = right.points.find((point) => point.date === latestDate);
      const leftRank = leftLatest?.rank ?? 999;
      const rightRank = rightLatest?.rank ?? 999;
      return leftRank - rightRank || bestTrackingRank(left) - bestTrackingRank(right) || left.model.localeCompare(right.model);
    });
}

function contiguousTrackingLineSegments(points) {
  const segments = [];
  let current = [];
  for (const point of points) {
    if (current.length === 0 || point.dateIndex === current.at(-1)?.dateIndex + 1) {
      current.push(point);
    } else {
      segments.push(current);
      current = [point];
    }
  }
  if (current.length > 0) {
    segments.push(current);
  }
  return segments;
}

function bestTrackingRank(group) {
  return Math.min(...group.points.map((point) => point.rank));
}

function trackingModelKey(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/gu, " ").trim();
}

function trackingLineColor(index) {
  const colors = [
    "#0f766e", "#d97757", "#2563eb", "#9333ea", "#16a34a", "#dc2626",
    "#0891b2", "#ca8a04", "#be185d", "#4f46e5", "#047857", "#b45309",
    "#7c3aed", "#0369a1", "#65a30d", "#b91c1c", "#0e7490", "#a16207",
    "#c026d3", "#1d4ed8", "#15803d", "#c2410c", "#4338ca", "#be123c"
  ];
  return colors[index % colors.length];
}

function shortTrackingLineLabel(value) {
  const text = String(value || "").trim();
  const maxLength = 24;
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function shortDateLabel(value) {
  const text = String(value || "");
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text.slice(5) : text;
}

function renderTrackingBars(rows, tab) {
  if (rows.some((row) => row.metric) && rows.length > 6) {
    return renderTrackingStackedBars(rows, tab);
  }
  const max = Math.max(...rows.map(trackingRowValue), 1);
  const logMax = Math.log10(max + 1);
  const renderedRows = rows.slice(0, 30).map((row) => {
    const value = trackingRowValue(row);
    const linear = Math.max(2, Math.round((value / max) * 100));
    const log = logMax > 0 ? Math.max(2, Math.round((Math.log10(value + 1) / logMax) * 100)) : linear;
    return `<div class="tracking-bar-row" data-tracking-tooltip="${escapeAttr(trackingTooltip(row))}" title="${escapeAttr(trackingTooltip(row))}">
      <span class="tracking-rank">${escapeHtml(row.rank ? `#${row.rank}` : "")}</span>
      <span class="tracking-name">${escapeHtml(row.model || row.label || "")}<small>${escapeHtml(row.provider || "")}</small></span>
      <span class="tracking-bar-track"><span class="tracking-bar-fill" style="--bar-width-linear:${linear}%;--bar-width-log:${log}%"></span></span>
      <span class="tracking-value">${escapeHtml(row.valueLabel || row.value_label || "")}</span>
      <span class="tracking-change">${escapeHtml(row.change || "")}</span>
    </div>`;
  }).join("");
  return `<div class="tracking-bars" aria-label="${escapeAttr(tab.label || "Tracking bars")}">${renderedRows}</div>`;
}

function renderTrackingStackedBars(rows, tab) {
  const groups = new Map();
  for (const row of rows) {
    const key = row.metric || row.change || "current";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const groupRows = Array.from(groups.entries()).map(([label, items]) => ({
    label,
    items: items.slice().sort((left, right) => trackingRowValue(right) - trackingRowValue(left)),
    total: items.reduce((sum, item) => sum + trackingRowValue(item), 0)
  }));
  const max = Math.max(...groupRows.map((group) => group.total), 1);
  const logMax = Math.log10(max + 1);
  const rendered = groupRows.map((group) => {
    const linear = Math.max(2, Math.round((group.total / max) * 100));
    const log = logMax > 0 ? Math.max(2, Math.round((Math.log10(group.total + 1) / logMax) * 100)) : linear;
    const segments = group.items.map((row, index) => {
      const value = trackingRowValue(row);
      const width = group.total > 0 ? Math.max(4, Math.round((value / group.total) * 100)) : 4;
      return `<span class="tracking-stack-segment" data-segment="${index % 8}" style="width:${width}%" data-tracking-tooltip="${escapeAttr(trackingTooltip(row))}" title="${escapeAttr(trackingTooltip(row))}"></span>`;
    }).join("");
    const top = group.items[0];
    return `<div class="tracking-stack-row" data-tracking-stack-row data-tracking-tooltip="${escapeAttr(`${group.label} | total ${formatTrackingTotal(group.total)} | top ${top?.model || ""}`)}" title="${escapeAttr(`${group.label} | total ${formatTrackingTotal(group.total)} | top ${top?.model || ""}`)}">
      <span class="tracking-stack-label">${escapeHtml(group.label)}</span>
      <span class="tracking-stack-track" style="--bar-width-linear:${linear}%;--bar-width-log:${log}%"><span class="tracking-stack-fill">${segments}</span></span>
      <span class="tracking-value">${escapeHtml(formatTrackingTotal(group.total))}</span>
    </div>`;
  }).join("");
  return `<div class="tracking-stack" data-tracking-stack aria-label="${escapeAttr(tab.label || "Tracking stacked bars")}">${rendered}</div>`;
}

function formatTrackingTotal(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "";
  if (numeric >= 1_000_000_000_000) return `${(numeric / 1_000_000_000_000).toFixed(numeric >= 10_000_000_000_000 ? 0 : 2).replace(/\.00$/, "")}T`;
  if (numeric >= 1_000_000_000) return `${(numeric / 1_000_000_000).toFixed(numeric >= 10_000_000_000 ? 0 : 2).replace(/\.00$/, "")}G`;
  if (numeric >= 1_000_000) return `${(numeric / 1_000_000).toFixed(numeric >= 10_000_000 ? 0 : 2).replace(/\.00$/, "")}M`;
  if (numeric >= 1_000) return `${(numeric / 1_000).toFixed(numeric >= 10_000 ? 0 : 2).replace(/\.00$/, "")}K`;
  return String(Math.round(numeric * 100) / 100);
}

function renderTrackingLeaderboard(rows, tab) {
  const body = rows.slice(0, 30).map((row, index) => {
    const tableRow = index + 1;
    return `<tr data-tracking-tooltip="${escapeAttr(trackingTooltip(row))}" title="${escapeAttr(trackingTooltip(row))}">
      <td tabindex="0" data-table-cell data-table-row="${tableRow}" data-table-column="0">${escapeHtml(row.rank ? `#${row.rank}` : "")}</td>
      <td tabindex="0" data-table-cell data-table-row="${tableRow}" data-table-column="1">${escapeHtml(row.model || row.label || "")}</td>
      <td tabindex="0" data-table-cell data-table-row="${tableRow}" data-table-column="2">${escapeHtml(row.provider || "")}</td>
      <td tabindex="0" data-table-cell data-table-row="${tableRow}" data-table-column="3">${escapeHtml(row.valueLabel || row.value_label || "")}</td>
      <td tabindex="0" data-table-cell data-table-row="${tableRow}" data-table-column="4">${escapeHtml(row.change || row.metric || "")}</td>
    </tr>`;
  }).join("");
  return `<div class="table-scroll tracking-table-scroll" data-table-wrap>
    <table class="report-data-table tracking-data-table" data-report-data-table aria-label="${escapeAttr(tab.label || "Tracking table")}">
      <thead><tr>
        <th scope="col" tabindex="0" data-table-cell data-table-row="0" data-table-column="0">Rank</th>
        <th scope="col" tabindex="0" data-table-cell data-table-row="0" data-table-column="1">Model</th>
        <th scope="col" tabindex="0" data-table-cell data-table-row="0" data-table-column="2">Provider</th>
        <th scope="col" tabindex="0" data-table-cell data-table-row="0" data-table-column="3">Value</th>
        <th scope="col" tabindex="0" data-table-cell data-table-row="0" data-table-column="4">Change</th>
      </tr></thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

function renderTrackingScatterFallback(rows, tab) {
  if (rows.length === 0) {
    return `<div class="tracking-component-fallback">${escapeHtml(tab.fallbackReason || "source_tab_not_collected")}</div>`;
  }
  return renderTrackingLeaderboard(rows, tab);
}

function renderTrackingTrace(trace) {
  if (!trace || typeof trace !== "object") {
    return "";
  }
  const sourceUrl = safeLink(trace.sourceUrl || trace.source_url || "");
  const diff = trace.diff || {};
  const topRows = Array.isArray(trace.topRows) ? trace.topRows : Array.isArray(trace.top_rows) ? trace.top_rows : [];
  const topRowsText = topRows
    .slice(0, 5)
    .map((row) => `${row.rank ? `#${row.rank} ` : ""}${row.model || row.label || ""}`)
    .filter(Boolean)
    .join(", ");
  return `<details class="tracking-trace" data-tracking-trace>
    <summary>Trace</summary>
    <dl>
      ${sourceUrl ? `<div><dt>Source</dt><dd><a href="${escapeAttr(sourceUrl)}" rel="noreferrer">${escapeHtml(sourceUrl)}</a></dd></div>` : ""}
      <div><dt>Selector</dt><dd>${escapeHtml(trace.selectorVersion || trace.selector_version || "")}</dd></div>
      <div><dt>Data hash</dt><dd>${escapeHtml(trace.dataHash || trace.data_hash || "")}</dd></div>
      <div><dt>DOM hash</dt><dd>${escapeHtml(trace.rawDomHash || trace.domHash || "")}</dd></div>
      <div><dt>Cache</dt><dd>${escapeHtml(trace.cacheStatus || trace.cache_status || "live")}</dd></div>
      <div><dt>Diff</dt><dd>${escapeHtml(diff.summary || diff.status || "")}</dd></div>
      ${topRowsText ? `<div><dt>Top rows</dt><dd>${escapeHtml(topRowsText)}</dd></div>` : ""}
    </dl>
  </details>`;
}

function renderCardVisuals(item) {
  return [
    renderTrackingComponent(item.component || item.trackingComponent || item.tracking_component),
    renderCardStats(item.stats || item.summaryStats || item.summary_stats),
    renderCardTrendCurve(item.trendCurve || item.trend_curve || item.trend),
    renderCardBars(item.bars || item.barChart || item.bar_chart),
    renderCardTable(item.table || item.dataTable || item.data_table)
  ].join("");
}

function renderCardMedia(media) {
  const items = Array.isArray(media)
    ? media.filter((item) => item && item.src).slice(0, 5)
    : [];
  if (items.length === 0) {
    return "";
  }

  return `<div class="card-media-grid" data-count="${items.length}">${items.map((item) => {
    const src = safeMediaSrc(item.src);
    if (!src) {
      return "";
    }
    const caption = item.caption ? `<figcaption>${escapeHtml(item.caption)}</figcaption>` : "";
    const captionText = item.caption || item.alt || "";
    return `<figure><img src="${escapeAttr(src)}" alt="${escapeAttr(item.alt || item.caption || "")}" loading="lazy"${lightboxImageAttrs(captionText)} decoding="async">${caption}</figure>`;
  }).filter(Boolean).join("")}</div>`;
}

function safeDataImage(value) {
  const src = String(value || "").trim();
  if (/^data:image\/(?:svg\+xml|png|jpe?g|webp|gif);base64,[a-z0-9+/=]+$/i.test(src)) {
    return src;
  }
  return "";
}

function renderFilterableCard(item, target, cardClass, activeFilter = "all") {
  const group = String(item.group || "item");
  const className = ["interactive-card", "evidence-card", "evidence-spotlight", cardClass].filter(Boolean).join(" ");
  const groupMeta = item.showGroup === false ? "" : `<div class="meta">${escapeHtml(group)}</div>`;
  const body = item.body ? `<p>${inlineMarkdown(item.body)}</p>` : "";
  const trendStatus = item.trendStatus || item.trend_status || "";
  const trendPointCount = Number(item.trendPointCount ?? item.trend_point_count);
  const trendAttrs = [
    trendStatus ? `data-trend-status="${escapeAttr(trendStatus)}"` : "",
    Number.isFinite(trendPointCount) ? `data-trend-history-points="${Math.max(0, Math.round(trendPointCount))}"` : ""
  ].filter(Boolean).join(" ");
  const hidden = activeFilter !== "all" && group !== activeFilter ? " hidden" : "";
  return `<article class="${escapeAttr(className)}" data-evidence-spotlight data-filter-target="${target}" data-filter-value="${escapeAttr(group)}" data-search-target="${target}"${trendAttrs ? ` ${trendAttrs}` : ""}${hidden}>
    ${groupMeta}
    ${renderCardTitle(item)}
    ${renderCardTags(item.tags)}
    ${renderCardMedia(item.media)}
    ${renderCardVisuals(item)}
    ${body}
    ${renderCardDetails(item.points)}
  </article>`;
}

function filterableTargetForSection(section) {
  return slugify(section.id || section.richId || section.title);
}

function renderFilterableCards(section) {
  const target = filterableTargetForSection(section);
  const items = Array.isArray(section.items) ? section.items : [];
  const uniqueGroups = [...new Set(items.map((item) => String(item.group || "item")))];
  const includeAllFilter = section.includeAllFilter !== false;
  const groups = includeAllFilter ? ["all", ...uniqueGroups] : uniqueGroups;
  const requestedDefaultFilterValue = String(section.defaultFilterValue || "").trim();
  const defaultFilterValue = groups.includes(requestedDefaultFilterValue)
    ? requestedDefaultFilterValue
    : groups[0] || "all";
  const cardClass = safeClassList(section.cardClass);
  const cardClassGrid = cardClass.split(/\s+/).filter(Boolean).map((token) => `${token}-grid`);
  const gridClass = ["evidence-grid", "focus-field", ...cardClassGrid, safeClassList(section.gridClass)].filter(Boolean).join(" ");
  const showFilters = section.showFilters !== false && (includeAllFilter ? groups.length > 2 : groups.length > 1);
  const activeFilter = showFilters ? defaultFilterValue : "all";
  return `<section class="panel" ${sectionAttrs(section)}>
    ${renderSectionHeader(section)}
    ${renderSourceInventoryFinder(section)}
    ${showFilters ? `<div class="toolbar" role="toolbar" aria-label="${escapeAttr(section.filterLabel || section.title)} filters">
      ${groups.map((group) => `<button data-filter-target="${target}" data-filter-value="${escapeAttr(group)}" aria-pressed="${group === activeFilter ? "true" : "false"}">${escapeHtml(group === "all" ? "全部" : group)}</button>`).join("")}
    </div>` : ""}
    <div class="${escapeAttr(gridClass)}" data-focus-field="${target}">
      ${items.map((item) => renderFilterableCard(item, target, cardClass, activeFilter)).join("\n")}
    </div>
  </section>`;
}

function renderTabs(section) {
  const group = slugify(section.title);
  const tabs = Array.isArray(section.tabs) ? section.tabs : [];
  return `<section class="panel" ${sectionAttrs(section)}>
    ${renderSectionHeader(section)}
    <div class="toolbar" role="tablist" aria-label="${escapeAttr(section.title)} tabs">
      ${tabs.map((tab, index) => {
        const id = `${group}-tab-${index}`;
        return `<button data-tab-group="${group}" data-tab="${id}" aria-selected="${index === 0 ? "true" : "false"}">${escapeHtml(tab.label)}</button>`;
      }).join("")}
    </div>
    ${tabs.map((tab, index) => {
      const id = `${group}-tab-${index}`;
      return `<article class="tab-panel evidence-card" id="${id}" data-tab-panel-group="${group}" ${index === 0 ? "" : "hidden"}>${renderMarkdown(tab.content || "")}</article>`;
    }).join("\n")}
  </section>`;
}

function renderTimeline(section) {
  const items = Array.isArray(section.items) ? section.items : [];
  return `<section class="panel" ${sectionAttrs(section)}>
    ${renderSectionHeader(section)}
    <div class="timeline">
      ${items.map((item) => `<div class="step"><strong>${escapeHtml(item.label || item.when)}</strong><span>${escapeHtml(item.detail || item.body)}</span></div>`).join("\n")}
    </div>
  </section>`;
}

function renderDecisionMatrix(section) {
  const options = Array.isArray(section.options) ? section.options : [];
  return `<section class="panel" ${sectionAttrs(section)}>
    ${renderSectionHeader(section)}
    <div class="metric-grid focus-field">
      ${options.map((option) => `<article class="interactive-card evidence-card evidence-spotlight" data-evidence-spotlight>
        <div class="meta">${escapeHtml(option.status || "option")}</div>
        <h3>${escapeHtml(option.name)}</h3>
        <ul>
          ${(option.points || []).map((point) => `<li>${escapeHtml(point)}</li>`).join("")}
        </ul>
      </article>`).join("\n")}
    </div>
  </section>`;
}

function renderActions(section) {
  const actions = Array.isArray(section.items) ? section.items : [];
  const id = `${section.id}-actions`;
  return `<section class="panel" ${sectionAttrs(section)}>
    <div class="split-row">${renderSectionHeader(section)}<button data-copy-from="#${id}">复制行动项</button></div>
    <ul id="${id}">${actions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
  </section>`;
}

function renderEvidenceSection(section, input) {
  return `<section class="panel" ${sectionAttrs(section)}>
    ${renderSectionHeader(section)}
    ${renderEvidence(input.evidence || [])}
  </section>`;
}

async function renderSection(section, mode, index, input, options) {
  if (section.type === "summary-cards") return renderSummaryCards(section);
  if (section.type === "data-table") return renderDataTableSection(section);
  if (section.type === "chart") return renderChartSection(section);
  if (section.type === "markdown") return renderMarkdownSection(section, mode, index);
  if (section.type === "mermaid") return renderMermaidSection(section, mode, index, options);
  if (section.type === "code") return renderCodeSection(section, mode, index);
  if (section.type === "diff") return renderDiffSection(section, index);
  if (section.type === "filterable-cards") return renderFilterableCards(section);
  if (section.type === "tabs") return renderTabs(section);
  if (section.type === "timeline") return renderTimeline(section);
  if (section.type === "decision-matrix") return renderDecisionMatrix(section);
  if (section.type === "actions") return renderActions(section);
  if (section.type === "evidence") return renderEvidenceSection(section, input);
  return `<section class="panel" ${sectionAttrs(section)}>${renderSectionHeader(section)}<p>${escapeHtml(section.content || "")}</p></section>`;
}

function evidenceDomId(item, index) {
  return slugify(item.id || `evidence-${index + 1}`);
}

function renderEvidenceValue(item) {
  const parts = [];
  if (item.value) parts.push(item.value);
  if (item.command) parts.push(item.command);
  if (item.filePath) parts.push(`${item.filePath}${item.line ? `:${item.line}` : ""}`);
  if (item.sourceTitle) parts.push(item.sourceTitle);
  return parts.join(" | ");
}

function renderEvidenceLinks(claim) {
  const ids = Array.isArray(claim.evidenceIds) ? claim.evidenceIds : [];
  if (ids.length === 0) return "";
  return `<div class="claim-evidence-links" data-claim-evidence>
    ${ids.map((id) => `<a href="#${escapeAttr(slugify(id))}" data-claim-evidence-id="${escapeAttr(id)}">${escapeHtml(id)}</a>`).join("")}
  </div>`;
}

function renderConfidenceLabel(confidence) {
  return confidenceLabels[String(confidence)] || String(confidence);
}

function renderClaims(items) {
  return `<div class="evidence-grid claims-grid" data-claims>
    ${(items || []).map((claim) => {
      const kind = claim.kind || "assumption";
      const confidence = claim.confidence ?? "unknown";
      const limits = Array.isArray(claim.knownLimits) && claim.knownLimits.length > 0
        ? `<ul class="claim-limits">${claim.knownLimits.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
        : "";
      return `<article class="interactive-card evidence-card claim-card evidence-spotlight" data-evidence-spotlight data-claim-id="${escapeAttr(claim.id || "")}" data-claim-kind="${escapeAttr(kind)}" data-claim-confidence="${escapeAttr(confidence)}">
        <div class="claim-card-header"><span class="meta">${escapeHtml(claimKindLabels[kind] || kind)}</span><span class="status-pill ${kind === "assumption" || confidence === "low" ? "status-warn" : "status-info"}">${escapeHtml(`可信度：${renderConfidenceLabel(confidence)}`)}</span></div>
        <h3 class="claim-card-title">${escapeHtml(claim.statement || "")}</h3>
        ${claim.dateRange ? `<p class="meta">Date range: ${escapeHtml(typeof claim.dateRange === "string" ? claim.dateRange : `${claim.dateRange.start || ""} - ${claim.dateRange.end || ""}`)}</p>` : ""}
        ${renderEvidenceLinks(claim)}
        ${limits}
      </article>`;
    }).join("\n")}
  </div>`;
}

function renderEvidence(items) {
  return `<div class="evidence-grid" data-evidence>
    ${items.map((item, index) => `<article class="interactive-card evidence-card evidence-spotlight" id="${escapeAttr(evidenceDomId(item, index))}" data-evidence-spotlight data-evidence-id="${escapeAttr(item.id || evidenceDomId(item, index))}" data-evidence-kind="${escapeAttr(item.kind)}" data-trust-level="${escapeAttr(normalizeTrustLevel(item.trustLevel))}">
      <div class="split-row"><span class="meta">${escapeHtml(kindLabels[item.kind] || item.kind)}</span><span class="status-pill ${statusClass(item.status || "info")}">${escapeHtml(statusLabel(item.status || "info"))}</span></div>
      <h3>${escapeHtml(item.label)}</h3>
      <p>${escapeHtml(renderEvidenceValue(item))}</p>
      ${item.sourceUrl ? `<a class="source-link" href="${escapeAttr(safeLink(item.sourceUrl))}" rel="noreferrer">${escapeHtml(item.sourceTitle || item.sourceUrl)}</a>` : ""}
      ${item.knownLimits?.length ? `<ul class="claim-limits">${item.knownLimits.map((limit) => `<li>${escapeHtml(limit)}</li>`).join("")}</ul>` : ""}
    </article>`).join("\n")}
  </div>`;
}

function renderVerification(items) {
  return `<div class="evidence-grid" data-verification>
    ${(items || []).map((item) => `<article class="interactive-card evidence-card evidence-spotlight" data-evidence-spotlight data-verification-status="${escapeAttr(item.status)}">
      <div class="split-row"><h3>${escapeHtml(item.label)}</h3><span class="status-pill ${statusClass(item.status)}">${escapeHtml(statusLabel(item.status))}</span></div>
      <p>${escapeHtml(item.detail || "")}</p>
    </article>`).join("\n")}
  </div>`;
}

function renderRuntimeDependencies(mode, input = {}) {
  if (!isRuntimeMode(mode)) return "";
  const visible = input.showRuntimeDependencies === true;
  const hiddenAttrs = visible ? "" : ' hidden aria-hidden="true"';
  return `<section class="panel runtime-panel" id="runtime-dependencies" data-runtime-dependencies data-section-type="runtime-dependencies" data-section-group="verification"${hiddenAttrs}>
    <div class="split-row">
      <div>
        <p class="meta">运行时</p>
        <h2>运行时依赖</h2>
        <p class="section-summary">runtime-cdn 使用的固定版本浏览器库；默认隐藏为机器可验证清单，不占用阅读界面。</p>
      </div>
      <span class="status-pill status-warn" data-runtime-state-pill>待处理</span>
    </div>
    <div class="evidence-grid">
      ${runtimeLibraries.map((item) => `<article class="evidence-card" data-runtime-dependency="${escapeAttr(item.id)}" data-runtime-dependency-name="${escapeAttr(item.name)}" data-runtime-dependency-version="${escapeAttr(item.version)}" data-runtime-dependency-url="${escapeAttr(item.url)}" data-runtime-dependency-integrity="${escapeAttr(item.integrity || "")}" data-runtime-dependency-integrity-exemption="${escapeAttr(item.integrityExemption || "")}" data-runtime-dependency-state="pending">
        <div class="split-row"><strong>${escapeHtml(item.name)}@${escapeHtml(item.version)}</strong><span class="status-pill status-warn">待处理</span></div>
        <p>${escapeHtml(item.purpose)}</p>
        <p class="source-link">${escapeHtml(item.url)}</p>
      </article>`).join("\n")}
    </div>
  </section>`;
}

function runtimeScriptTags(mode) {
  if (!isRuntimeMode(mode)) return "";
  const dompurify = runtimeLibraries.find((item) => item.id === "dompurify");
  const highlight = runtimeLibraries.find((item) => item.id === "highlightjs");
  const marked = runtimeLibraries.find((item) => item.id === "marked");
  const mermaid = runtimeLibraries.find((item) => item.id === "mermaid");
  const runtimeAttrs = (item) => item.integrity
    ? ` integrity="${escapeAttr(item.integrity)}" crossorigin="anonymous"`
    : ` data-integrity-exemption="${escapeAttr(item.integrityExemption || "not-available")}"`;
  return `
  <link rel="stylesheet" href="${escapeAttr(highlight.cssUrl)}" data-runtime-stylesheet="highlightjs"${highlight.cssIntegrity ? ` integrity="${escapeAttr(highlight.cssIntegrity)}" crossorigin="anonymous"` : ` data-integrity-exemption="${escapeAttr(highlight.cssIntegrityExemption || "not-available")}"`}>
  <script src="${escapeAttr(dompurify.url)}" data-runtime-script="dompurify"${runtimeAttrs(dompurify)}></script>
  <script src="${escapeAttr(highlight.url)}" data-runtime-script="highlightjs"${runtimeAttrs(highlight)}></script>
  <script type="module">
    import { marked } from "${marked.url}";
    import mermaid from "${mermaid.url}";
    window.marked = marked;
    window.mermaid = mermaid;
    window.dispatchEvent(new Event("rich-render-libs-ready"));
  </script>`;
}

function renderGroupedNav(sections) {
  const entries = sections.filter(Boolean);
  return `<nav class="report-nav" data-report-nav data-nav-order="dom" data-report-region="navigation" aria-label="报告速览">
    <div class="report-nav-title">速览</div>
    <div class="report-nav-group" data-nav-group="reading-order">
      <div class="report-nav-group-title">阅读顺序</div>
      <a href="#report-top" title="返回总览" data-nav-link data-nav-home data-nav-index="0" data-nav-group-name="overview" data-nav-status="info"><span>总览</span></a>
      ${entries.map((section, index) => `<a href="#${escapeAttr(section.id)}" title="${escapeAttr(section.title)}" data-nav-link data-nav-index="${index + 1}" data-nav-group-name="${escapeAttr(section.group || "main")}" data-nav-status="${escapeAttr(section.status || "info")}"><span>${escapeHtml(section.title)}</span></a>`).join("\n")}
    </div>
  </nav>`;
}

function presentationOptions(input) {
  const source = input && typeof input.presentation === "object" && !Array.isArray(input.presentation)
    ? input.presentation
    : {};
  return {
    showHeroStats: source.showHeroStats === true,
    showSuccessCriteria: source.showSuccessCriteria === true,
    showClaims: source.showClaims === true,
    showEvidence: source.showEvidence === true,
    showVerification: source.showVerification === true,
    showNextActions: source.showNextActions === true
  };
}

function trimLeadingConclusion(value) {
  return String(value || "").replace(/^\s*(?:结论|Conclusion)\s*[：:]\s*/i, "").trim();
}

function renderHeroStats(input, sectionCount) {
  const providedStats = Array.isArray(input.heroStats)
    ? input.heroStats
      .map((item) => ({
        label: item?.label,
        value: item?.value,
        detail: item?.detail
      }))
      .filter((item) => item.label && item.value !== undefined && item.value !== null && String(item.value).trim())
    : [];
  if (providedStats.length > 0) {
    return `<div class="hero-stat-grid" aria-label="报告摘要指标">
    ${providedStats.map((item) => `<div class="hero-stat"><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}</strong><small>${escapeHtml(item.detail || "")}</small></div>`).join("\n")}
  </div>`;
  }
  const verification = input.verification || [];
  const passed = verification.filter((item) => item.status === "pass").length;
  const stats = [
    { label: "验证", value: verification.length ? `${passed}/${verification.length}` : "0", detail: "通过" },
    { label: "证据", value: String((input.evidence || []).length), detail: "条" },
    { label: "行动", value: String((input.nextActions || []).length), detail: "项" }
  ].filter((item) => item.value !== "0");

  if (stats.length === 0) return "";
  return `<div class="hero-stat-grid" aria-label="报告摘要指标">
    ${stats.map((item) => `<div class="hero-stat"><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}</strong><small>${escapeHtml(item.detail)}</small></div>`).join("\n")}
  </div>`;
}

function renderHeroLinks(input) {
  const links = Array.isArray(input.heroLinks) ? input.heroLinks : [];
  const rendered = links
    .map((link) => {
      const attrs = linkAttrs(link?.href);
      if (!attrs) return "";
      const iconSrc = safeMediaSrc(link.icon || link.iconSrc || "");
      const icon = iconSrc ? `<img src="${escapeAttr(iconSrc)}" alt="" aria-hidden="true" loading="lazy">` : "";
      return `<a class="hero-link" ${attrs}>${icon}<span>${escapeHtml(link.label || link.href || "")}</span></a>`;
    })
    .filter(Boolean);
  return rendered.length ? `<div class="hero-link-row" data-hero-links>${rendered.join("")}</div>` : "";
}

function renderHeroDecisionGrid(intent, presentation = {}, input = {}) {
  if (input.heroMode === "daily-report" || presentation.showHeroDecisionGrid === false) return "";
  const criteria = (intent.successCriteria || []).slice(0, 3);
  const criteriaHtml = criteria.length > 0
    ? `<ul class="hero-criteria-list">${criteria.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
    : "";
  const cards = [
    `<article class="hero-decision-card">
      <div class="meta">读者问题</div>
      <strong>${escapeHtml(intent.primaryQuestion)}</strong>
    </article>`,
    `<article class="hero-decision-card">
      <div class="meta">本文结论</div>
      <strong>${escapeHtml(intent.decision)}</strong>
    </article>`
  ];
  if (presentation.showSuccessCriteria === true && criteriaHtml) {
    cards.push(`<article class="hero-decision-card">
      <div class="meta">验收口径</div>
      ${criteriaHtml}
    </article>`);
  }
  return `<div class="hero-decision-grid" data-report-intent data-primary-question="${escapeAttr(intent.primaryQuestion)}" data-time-budget="${escapeAttr(intent.timeBudget)}" data-artifact-kind="${escapeAttr(intent.artifactKind)}">
    ${cards.join("\n")}
  </div>`;
}

function visibleText(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(visibleText).join(" ").trim();
  if (typeof value === "object") return Object.values(value).map(visibleText).join(" ").trim();
  return String(value).replace(/\s+/g, " ").trim();
}

function isBlank(value) {
  return visibleText(value).length === 0;
}

function hasVisibleTableBody(section) {
  const columns = normalizeTableColumns(section);
  const rows = Array.isArray(section.rows) ? section.rows : [];
  return rows.some((row) => columns.some((column, columnIndex) => !isBlank(tableCellValue(row, column, columnIndex))));
}

function hasRenderableFilterableCardContent(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return false;
  if (!isBlank(item.body) || !isBlank(item.subtitle) || !isBlank(item.href)) return true;
  if (Array.isArray(item.tags) && item.tags.some((tag) => !isBlank(tag))) return true;
  if (Array.isArray(item.points) && item.points.some((point) => !isBlank(point))) return true;
  if (Array.isArray(item.media) && item.media.some((media) => !isBlank(media?.src))) return true;
  return [
    "component",
    "trackingComponent",
    "tracking_component",
    "stats",
    "summaryStats",
    "summary_stats",
    "trendCurve",
    "trend_curve",
    "trend",
    "bars",
    "barChart",
    "bar_chart",
    "table",
    "dataTable",
    "data_table"
  ].some((key) => !isBlank(item[key]));
}

function sectionShapeErrors(section, index, input) {
  const errors = [];
  const prefix = `sections[${index}]`;
  if (!section || typeof section !== "object" || Array.isArray(section)) return [`${prefix} must be an object.`];
  if (isBlank(section.type)) errors.push(`${prefix}.type is required.`);
  if (isBlank(section.title)) errors.push(`${prefix}.title is required.`);

  if (section.type === "summary-cards") {
    const cards = Array.isArray(section.cards) ? section.cards : [];
    if (cards.length === 0) errors.push(`${prefix}.cards must contain at least one card.`);
    cards.forEach((card, cardIndex) => {
      if (isBlank(card?.label)) errors.push(`${prefix}.cards[${cardIndex}].label is required.`);
      if (isBlank(card?.value)) errors.push(`${prefix}.cards[${cardIndex}].value is required.`);
    });
  } else if (section.type === "data-table") {
    const columns = normalizeTableColumns(section);
    const rows = Array.isArray(section.rows) ? section.rows : [];
    if (columns.length === 0) errors.push(`${prefix}.columns must contain at least one column or inferable object row key.`);
    if (rows.length === 0) errors.push(`${prefix}.rows must contain at least one row.`);
    if (columns.length > 0 && rows.length > 0 && !hasVisibleTableBody(section)) errors.push(`${prefix}.rows must contain at least one visible body cell.`);
  } else if (["markdown", "mermaid", "code", "diff"].includes(section.type)) {
    if (isBlank(section.content)) errors.push(`${prefix}.content is required for ${section.type}.`);
    if (section.type === "code") {
      if (isBlank(section.language)) errors.push(`${prefix}.language is required for code.`);
      if (isBlank(section.filePath) && isBlank(section.sourceHref)) errors.push(`${prefix}.filePath or sourceHref is required for source-linked code.`);
    }
    if (section.type === "diff" && !/[+-]/.test(String(section.content || ""))) errors.push(`${prefix}.content must include added or removed diff lines.`);
  } else if (section.type === "timeline") {
    const items = Array.isArray(section.items) ? section.items : [];
    if (items.length === 0) errors.push(`${prefix}.items must contain at least one timeline item.`);
    items.forEach((item, itemIndex) => {
      if (isBlank(item?.label || item?.when)) errors.push(`${prefix}.items[${itemIndex}].label is required.`);
      if (isBlank(item?.detail || item?.body)) errors.push(`${prefix}.items[${itemIndex}].detail is required.`);
    });
  } else if (section.type === "decision-matrix") {
    const options = Array.isArray(section.options) ? section.options : [];
    if (options.length === 0) errors.push(`${prefix}.options must contain at least one option.`);
    options.forEach((option, optionIndex) => {
      if (isBlank(option?.name)) errors.push(`${prefix}.options[${optionIndex}].name is required.`);
      if (!Array.isArray(option?.points) || option.points.length === 0 || option.points.some(isBlank)) errors.push(`${prefix}.options[${optionIndex}].points must contain visible tradeoff text.`);
    });
  } else if (section.type === "actions") {
    const items = Array.isArray(section.items) ? section.items : [];
    if (items.length === 0 || items.some(isBlank)) errors.push(`${prefix}.items must contain visible actions.`);
  } else if (section.type === "tabs") {
    const tabs = Array.isArray(section.tabs) ? section.tabs : [];
    if (tabs.length === 0) errors.push(`${prefix}.tabs must contain at least one tab.`);
    tabs.forEach((tab, tabIndex) => {
      if (isBlank(tab?.label)) errors.push(`${prefix}.tabs[${tabIndex}].label is required.`);
      if (isBlank(tab?.content)) errors.push(`${prefix}.tabs[${tabIndex}].content is required.`);
    });
  } else if (section.type === "filterable-cards") {
    const items = Array.isArray(section.items) ? section.items : [];
    if (items.length === 0) errors.push(`${prefix}.items must contain at least one card.`);
    items.forEach((item, itemIndex) => {
      if (isBlank(item?.title)) errors.push(`${prefix}.items[${itemIndex}].title is required.`);
      if (!hasRenderableFilterableCardContent(item)) errors.push(`${prefix}.items[${itemIndex}] must include body, link, media, tracking component, or another visible card detail.`);
    });
  } else if (section.type === "chart") {
    const chart = chartSpecFromSection(section);
    if (isBlank(chart.title || section.title)) errors.push(`${prefix}.chart.title is required.`);
    if (isBlank(chart.takeaway)) errors.push(`${prefix}.chart.takeaway is required.`);
    if (isBlank(chart.altText)) errors.push(`${prefix}.chart.altText is required.`);
    if (!Array.isArray(chartDataRows(chart)) || chartDataRows(chart).length === 0) errors.push(`${prefix}.chart.data or tableFallback.rows must contain visible rows.`);
  } else if (section.type === "evidence" && (!Array.isArray(input.evidence) || input.evidence.length === 0)) {
    errors.push(`${prefix} uses evidence component but input.evidence is empty.`);
  }

  return errors;
}

function statusConsistencyErrors(input) {
  if (input.status !== "complete") return [];
  const errors = [];
  const unsettledStatuses = new Set(["pending", "draft", "review", "blocked", "failed", "fail", "not-run"]);
  const unsettledSections = Array.isArray(input.sections)
    ? input.sections
      .map((section, index) => ({ index, status: section?.status }))
      .filter((item) => unsettledStatuses.has(item.status))
    : [];
  const failedVerification = Array.isArray(input.verification)
    ? input.verification
      .map((item, index) => ({ index, status: item?.status }))
      .filter((item) => ["fail", "not-run"].includes(item.status))
    : [];

  if (unsettledSections.length > 0) {
    errors.push(`status complete conflicts with unsettled section status: ${unsettledSections.map((item) => `sections[${item.index}]=${item.status}`).join(", ")}.`);
  }
  if (failedVerification.length > 0) {
    errors.push(`status complete conflicts with verification status: ${failedVerification.map((item) => `verification[${item.index}]=${item.status}`).join(", ")}.`);
  }
  return errors;
}

function validateInput(input) {
  const errors = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Input must be an object.");
  if (!input.title) errors.push("Missing title.");
  if (!input.summary) errors.push("Missing summary.");
  if (!input.status) errors.push("Missing status.");
  if (!Array.isArray(input.sections) || input.sections.length === 0) errors.push("sections must be a non-empty array.");
  if (input.claims !== undefined && !Array.isArray(input.claims)) errors.push("claims must be an array when provided.");
  if (input.evidence !== undefined && !Array.isArray(input.evidence)) errors.push("evidence must be an array when provided.");
  if (input.verification !== undefined && !Array.isArray(input.verification)) errors.push("verification must be an array when provided.");
  if (input.nextActions !== undefined && !Array.isArray(input.nextActions)) errors.push("nextActions must be an array when provided.");
  if (input.presentation !== undefined && (!input.presentation || typeof input.presentation !== "object" || Array.isArray(input.presentation))) errors.push("presentation must be an object when provided.");
  if (input.presentation && typeof input.presentation === "object" && !Array.isArray(input.presentation)) {
    for (const key of ["showHeroStats", "showSuccessCriteria", "showClaims", "showEvidence", "showVerification", "showNextActions"]) {
      if (input.presentation[key] !== undefined && typeof input.presentation[key] !== "boolean") errors.push(`presentation.${key} must be boolean when provided.`);
    }
  }
  if (input.handoff !== undefined && (!input.handoff || typeof input.handoff !== "object" || Array.isArray(input.handoff))) errors.push("handoff must be an object when provided.");
  if (input.handoff !== undefined) {
    const { sourcePath, regenerationCommand } = normalizeHandoffMetadata(input.handoff);
    if (sourcePath && (path.isAbsolute(sourcePath) || hasParentPathSegment(sourcePath) || hasHostLocalPath(sourcePath))) {
      errors.push("handoff.sourcePath must be a repo-relative path without host-local or parent-directory segments.");
    }
    if (regenerationCommand && hasHostLocalPath(regenerationCommand)) {
      errors.push("handoff.regenerationCommand must not contain host-local absolute paths or file URLs.");
    }
  }
  if (input.renderMode && !renderModes.includes(input.renderMode)) errors.push("renderMode must be runtime-cdn, pre-rendered, fallback-only, or runtime alias.");
  if (Object.prototype.hasOwnProperty.call(input, "template")) errors.push("template is no longer supported; use intent.artifactKind and component sections.");
  if (Array.isArray(input.sections)) {
    input.sections.forEach((section, index) => errors.push(...sectionShapeErrors(section, index, input)));
  }
  errors.push(...statusConsistencyErrors(input));
  if (hasLikelyMojibakeInValue(input)) errors.push("Input contains likely mojibake. Write report JSON as UTF-8 and regenerate; continuous half-width question marks are not acceptable.");
  if (errors.length) throw new Error(errors.join(" "));
}

function supplementalSections(input, mode, presentation = presentationOptions(input)) {
  const sections = [];
  if (isRuntimeMode(mode) && input.showRuntimeDependencies === true) {
    sections.push({ id: "runtime-dependencies", title: "运行时依赖", group: "verification", status: "pending", priority: 880 });
  }
  if (presentation.showClaims === true && (input.claims || []).length > 0) {
    sections.push({ id: "claims", title: "关键判断", group: "claims", status: "info", priority: 890 });
  }
  if (presentation.showEvidence === true && (input.evidence || []).length > 0) {
    sections.push({ id: "evidence", title: "证据", group: "evidence", status: "info", priority: 900 });
  }
  if (presentation.showVerification === true && (input.verification || []).length > 0) {
    sections.push({ id: "verification", title: "验证", group: "verification", status: "info", priority: 901 });
  }
  if (presentation.showNextActions === true && (input.nextActions || []).length > 0) {
    sections.push({ id: "next-actions", title: "下一步", group: "next", status: "info", priority: 902 });
  }
  return sections;
}

async function createInteraction(input, options = {}) {
  validateInput(input);
  const { mode, compatibility } = normalizeRenderMode(input.renderMode);
  const intent = inferReportIntent(input, mode);
  const generatedAt = input.generatedAt || new Date().toISOString();
  const normalizedSections = input.sections.map(normalizeSection);
  const sections = [];

  for (let index = 0; index < normalizedSections.length; index += 1) {
    sections.push(await renderSection(normalizedSections[index], mode, index, input, options));
  }

  const css = [
    fs.readFileSync(reportUiCssPath, "utf8"),
    isRuntimeMode(mode) ? fs.readFileSync(richRuntimeCssPath, "utf8") : "",
    "table{width:100%;border-collapse:collapse;margin:10px 0;min-width:520px}th,td{border:1px solid var(--line);padding:8px 10px;text-align:left;vertical-align:top}.rendered-markdown table{display:table}.timeline{display:grid;gap:10px}.step{display:grid;grid-template-columns:minmax(90px,140px) minmax(0,1fr);gap:10px;padding:10px;border-left:3px solid var(--accent);background:#f9fafc;border-radius:6px;min-width:0}.unsafe-link{color:var(--danger);font-weight:700}.tab-panel{margin-top:10px}"
  ].join("\n");

  const js = [
    fs.readFileSync(reportUiJsPath, "utf8"),
    isRuntimeMode(mode) ? fs.readFileSync(richRuntimeJsPath, "utf8") : ""
  ].join("\n");

  const presentation = presentationOptions(input);
  const extras = supplementalSections(input, mode, presentation);
  const nav = renderGroupedNav([...normalizedSections, ...extras]);
  const conclusion = trimLeadingConclusion(input.summary);
  const hasProvidedHeroStats = Array.isArray(input.heroStats) && input.heroStats.length > 0;
  const heroStats = presentation.showHeroStats === true || hasProvidedHeroStats ? renderHeroStats(input, normalizedSections.length + extras.length) : "";
  const heroLinks = renderHeroLinks(input);
  const heroTitle = input.heroTitle || input.title;
  const heroEyebrow = input.heroEyebrow || `Component report | ${intent.artifactKind}`;
  const heroDecisionGrid = renderHeroDecisionGrid(intent, presentation, input);
  const compatibilityBadge = compatibility ? `<span class="status-pill status-warn" data-render-compatibility="${escapeAttr(compatibility)}">${escapeHtml(compatibility)}</span>` : "";
  const handoffAttributes = renderHandoffAttributes(input.handoff);
  const handoffMetaTags = renderHandoffMetaTags(input.handoff);
  const claimsSection = presentation.showClaims === true && (input.claims || []).length > 0
    ? `<section class="panel supplemental-panel" id="claims" data-section-type="claims" data-section-group="claims" data-report-region="claims">${renderSupplementalHeading({ group: "claims", title: "关键判断", summary: "每条判断都保留证据入口和可信度。", status: "info" })}${renderClaims(input.claims || [])}</section>`
    : "";
  const evidenceSection = presentation.showEvidence === true && (input.evidence || []).length > 0
    ? `<section class="panel supplemental-panel" id="evidence" data-section-type="evidence" data-section-group="evidence" data-report-region="evidence">${renderSupplementalHeading({ group: "evidence", title: "证据", summary: "文件、命令和验证来源集中在这里。", status: "info" })}${renderEvidence(input.evidence || [])}</section>`
    : "";
  const verificationSection = presentation.showVerification === true && (input.verification || []).length > 0
    ? `<section class="panel supplemental-panel" id="verification" data-section-type="verification" data-section-group="verification" data-report-region="verification">${renderSupplementalHeading({ group: "verification", title: "验证", summary: "命令级验收和降级项。", status: "info" })}${renderVerification(input.verification || [])}</section>`
    : "";
  const nextActionsSection = presentation.showNextActions === true && (input.nextActions || []).length > 0
    ? `<section class="panel supplemental-panel" id="next-actions" data-section-type="actions" data-section-group="next" data-report-region="actions"><div class="section-heading split-row"><div><h2>下一步</h2><p class="section-summary">只保留后续会真正改变行为的动作。</p></div><button data-copy-from="#next-action-list">复制行动项</button></div><ul id="next-action-list" class="action-list">${(input.nextActions || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>`
    : "";

  return stripTrailingWhitespace(`<!doctype html>
<html lang="zh-CN" data-html-work-report data-render-mode="${escapeAttr(mode)}" data-artifact-kind="${escapeAttr(intent.artifactKind)}" data-status="${escapeAttr(input.status)}"${handoffAttributes} data-runtime-state="${isRuntimeMode(mode) ? "pending" : "not-runtime"}">
<head>
  <meta charset="utf-8">
  <meta name="generator" content="effective-interact create-interaction.mjs">
  <meta name="generated-at" content="${escapeAttr(generatedAt)}">
  <meta name="render-mode" content="${escapeAttr(mode)}">
${handoffMetaTags}  <title>${escapeHtml(input.title)}</title>
  <style>${css}</style>
</head>
<body>
  <main class="report-shell">
    <header id="report-top" class="report-hero" data-report-region="hero" data-report-intent data-hero-mode="${escapeAttr(input.heroMode || "report")}" data-primary-question="${escapeAttr(intent.primaryQuestion)}" data-time-budget="${escapeAttr(intent.timeBudget)}" data-artifact-kind="${escapeAttr(intent.artifactKind)}">
      <div class="title-row">
        <div>
          <div class="eyebrow">${escapeHtml(heroEyebrow)}</div>
          <h1 class="report-title">${escapeHtml(heroTitle)}</h1>
        </div>
        <div class="toolbar"><span class="status-pill ${statusClass(input.status)}">状态：${escapeHtml(statusLabel(input.status))}</span>${compatibilityBadge}</div>
      </div>
      <div class="hero-brief">
        <p class="hero-summary-text">${inlineMarkdown(conclusion)}</p>
        ${heroStats}
        ${heroLinks}
      </div>
      ${heroDecisionGrid}
    </header>

    <div class="report-layout">
      ${nav}
      <div class="report-section-stack" data-report-region="sections">
        ${sections.join("\n")}
        ${renderRuntimeDependencies(mode, input)}
        ${claimsSection}
        ${evidenceSection}
        ${verificationSection}
        ${nextActionsSection}
      </div>
    </div>
  </main>
  ${runtimeScriptTags(mode)}
  <script>${js}</script>
</body>
</html>`);
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      console.log(usage());
      return;
    }
    if (!args.input) throw new Error("--input is required.");

    const inputPath = path.resolve(args.input);
    const input = JSON.parse(fs.readFileSync(inputPath, "utf8"));
    const html = await createInteraction(input, { browserMermaid: args.browserMermaid });
    const outDir = path.resolve(args.outDir);
    fs.mkdirSync(outDir, { recursive: true });
    const slug = args.slug || slugify(input.title);
    const outputPath = path.join(outDir, `${slug}.html`);
    fs.writeFileSync(outputPath, html, "utf8");
    const normalized = normalizeRenderMode(input.renderMode);

    if (args.json) {
      console.log(JSON.stringify({ ok: true, outputPath, renderMode: normalized.mode, artifactKind: inferReportIntent(input, normalized.mode).artifactKind }, null, 2));
    } else {
      console.log(outputPath);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? process.argv[1].replaceAll("\\", "/") : "";
if (invokedPath && (import.meta.url === `file://${invokedPath}` || process.argv[1]?.endsWith("create-interaction.mjs"))) {
  await main();
}

export { createInteraction, renderMarkdown, safeLink, normalizeRenderMode, runtimeLibraries, sanitizeDiagnosticMessage };
