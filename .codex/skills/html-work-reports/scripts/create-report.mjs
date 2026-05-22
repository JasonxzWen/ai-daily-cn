#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillDir = path.resolve(__dirname, "..");
const reportUiCssPath = path.join(skillDir, "assets", "components", "report-ui.css");
const reportUiJsPath = path.join(skillDir, "assets", "components", "report-ui.js");
const richRuntimeCssPath = path.join(skillDir, "assets", "components", "rich-render-runtime.css");
const richRuntimeJsPath = path.join(skillDir, "assets", "components", "rich-render-runtime.js");

const runtimePins = {
  marked: "18.0.3",
  DOMPurify: "3.4.2",
  mermaid: "11.15.0",
  "@highlightjs/cdn-assets": "11.11.1"
};

const templateMeta = {
  "implementation-handoff": {
    label: "Implementation handoff",
    useCase: "completed implementation work, verification gates, file evidence, risks, and next actions",
    accent: "#2563eb"
  },
  "review-findings": {
    label: "Review findings",
    useCase: "code or document review with severity filters, snippets, owners, and action export",
    accent: "#c2414b"
  },
  "research-explainer": {
    label: "Research explainer",
    useCase: "research synthesis, architecture walkthroughs, source-backed explanations, and diagrams",
    accent: "#0f766e"
  },
  "decision-matrix": {
    label: "Decision matrix",
    useCase: "option comparison, recommendation, trade-offs, risks, and confirmation questions",
    accent: "#b7791f"
  }
};

function parseArgs(argv) {
  const args = {
    outDir: "reports",
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
    "Usage: node .agents/skills/html-work-reports/scripts/create-report.mjs --input report.json [--out-dir reports] [--slug name] [--json] [--browser-mermaid]",
    "",
    "Inputs follow references/report-input-schema.json. Default renderMode is pre-rendered."
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
  return `<a class="source-link" data-source-link data-file-path="${escapeAttr(section.filePath || "")}" href="#${escapeAttr(fallbackId)}">${escapeHtml(label)}</a>`;
}

function inlineMarkdown(text) {
  const escaped = escapeHtml(stripRawHtml(text));
  return escaped.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, href) => {
    const safe = safeLink(href);
    if (!safe) return `<span class="unsafe-link">${escapeHtml(label)}</span>`;
    return `<a href="${escapeAttr(safe)}" rel="noreferrer">${escapeHtml(label)}</a>`;
  });
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
  return `<code class="hljs language-${escapeAttr(language)}">${highlighted.join("\n")}</code>`;
}

function highlightLine(line, language) {
  let html = escapeHtml(line);
  if (["javascript", "js", "typescript", "ts"].includes(language)) {
    html = html.replace(/\b(async|await|const|let|var|return|function|export|import|from|if|else|try|catch|new)\b/g, '<span class="hljs-keyword">$1</span>');
    html = html.replace(/(&quot;[^&]*?&quot;|&#39;[^&]*?&#39;|`[^`]*?`)/g, '<span class="hljs-string">$1</span>');
    html = html.replace(/(\/\/.*)$/g, '<span class="hljs-comment">$1</span>');
  } else if (["json"].includes(language)) {
    html = html.replace(/(&quot;[^&]*?&quot;)(\s*:)?/g, '<span class="hljs-string">$1</span>$2');
    html = html.replace(/\b(true|false|null)\b/g, '<span class="hljs-literal">$1</span>');
  } else if (["bash", "sh", "shell"].includes(language)) {
    html = html.replace(/\b(bun|node|npm|git|openspec|powershell)\b/g, '<span class="hljs-keyword">$1</span>');
  }
  return html;
}

async function renderMermaidSvg(source, title, options) {
  if (options.browserMermaid) {
    const rendered = await renderMermaidWithBrowser(source);
    if (rendered.ok) return rendered.svg;
    return fallbackMermaidSvg(source, title, rendered.error);
  }
  return fallbackMermaidSvg(source, title, "Browser Mermaid rendering not requested; generated deterministic inline SVG fallback.");
}

async function renderMermaidWithBrowser(source) {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch (error) {
    return { ok: false, error: `Playwright unavailable: ${error.message}` };
  }

  let browser;
  try {
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const page = await browser.newPage();
    const html = `<!doctype html><div class="mermaid">${escapeHtml(source)}</div><script type="module">import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@${runtimePins.mermaid}/dist/mermaid.esm.min.mjs"; mermaid.initialize({startOnLoad:false, securityLevel:"strict"}); await mermaid.run({querySelector:".mermaid"});</script>`;
    await page.setContent(html, { waitUntil: "networkidle" });
    const svg = await page.locator(".mermaid svg").evaluate((node) => node.outerHTML);
    return { ok: true, svg };
  } catch (error) {
    return { ok: false, error: error.message };
  } finally {
    if (browser) await browser.close();
  }
}

function fallbackMermaidSvg(source, title, message) {
  const lines = String(source ?? "").split("\n").filter(Boolean).slice(0, 6);
  const width = 760;
  const height = Math.max(180, 78 + lines.length * 24);
  const renderedLines = lines
    .map((line, index) => `<text x="34" y="${88 + index * 24}" font-size="14" fill="#172033">${escapeHtml(line)}</text>`)
    .join("");

  return [
    `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeAttr(title)} diagram" data-mermaid-renderer="fallback">`,
    `<rect x="12" y="12" width="${width - 24}" height="${height - 24}" rx="10" fill="#ffffff" stroke="#d7dce5"/>`,
    `<rect x="24" y="24" width="${width - 48}" height="34" rx="8" fill="#eef4ff" stroke="#2563eb"/>`,
    `<text x="38" y="46" font-size="15" font-weight="700" fill="#172033">${escapeHtml(title)}</text>`,
    renderedLines,
    `<text x="34" y="${height - 30}" font-size="12" fill="#667085">${escapeHtml(message)}</text>`,
    `</svg>`
  ].join("");
}

function statusClass(status) {
  if (["complete", "ready", "pass"].includes(status)) return "status-ok";
  if (["blocked", "fail"].includes(status)) return "status-danger";
  return "status-warn";
}

function renderSummaryCards(section) {
  const cards = Array.isArray(section.cards) ? section.cards : [];
  return `<section class="panel" id="${sectionId(section.title)}" data-section-type="summary-cards">
    <h2>${escapeHtml(section.title)}</h2>
    <div class="metric-grid focus-field">
      ${cards.map((card) => `<article class="interactive-card evidence-card evidence-spotlight" data-evidence-spotlight><div class="meta">${escapeHtml(card.label)}</div><strong>${escapeHtml(card.value)}</strong></article>`).join("\n")}
    </div>
  </section>`;
}

function renderRuntimeMarkdown(section, index) {
  const sourceId = `markdown-source-${index}`;
  return `<section class="panel" id="${sectionId(section.title)}" data-section-type="markdown" data-source-fallback>
    <div class="split-row"><h2>${escapeHtml(section.title)}</h2><span class="rich-status" data-rich-status="${sourceId}">Markdown source fallback</span></div>
    <div data-rich-markdown data-rich-status-id="${sourceId}">${escapeHtml(section.content)}</div>
    <details><summary>Source fallback</summary><pre>${escapeHtml(safeAuditText(section.content))}</pre></details>
  </section>`;
}

async function renderMarkdownSection(section, mode, index) {
  if (mode === "runtime") return renderRuntimeMarkdown(section, index);
  return `<section class="panel" id="${sectionId(section.title)}" data-section-type="markdown" data-source-fallback>
    <div class="split-row"><h2>${escapeHtml(section.title)}</h2><span class="rich-status" data-state="ready">Markdown pre-rendered</span></div>
    ${renderMarkdown(section.content)}
    <details><summary>Source fallback</summary><pre>${escapeHtml(safeAuditText(section.content))}</pre></details>
  </section>`;
}

async function renderMermaidSection(section, mode, index, options) {
  if (mode === "runtime") {
    return `<section class="panel diagram-panel mermaid-evidence" id="${sectionId(section.title)}" data-section-type="mermaid" data-source-fallback>
      <div class="split-row"><h2>${escapeHtml(section.title)}</h2><span class="rich-status" data-rich-status="mermaid">Mermaid source fallback</span></div>
      <div data-rich-mermaid>${escapeHtml(section.content)}</div>
      <details><summary>Mermaid source</summary><pre data-mermaid-source>${escapeHtml(section.content)}</pre></details>
    </section>`;
  }

  const svg = await renderMermaidSvg(section.content, section.title, options);
  return `<section class="panel diagram-panel mermaid-evidence" id="${sectionId(section.title)}" data-section-type="mermaid" data-source-fallback>
    <div class="split-row"><h2>${escapeHtml(section.title)}</h2><span class="rich-status" data-state="ready">Mermaid inline SVG</span></div>
    ${svg}
    <details><summary>Mermaid source</summary><pre data-mermaid-source>${escapeHtml(section.content)}</pre></details>
  </section>`;
}

function renderCodeSection(section, mode, index) {
  const language = section.language || "text";
  const sourceId = `code-${index}`;
  const startLine = Number.isInteger(section.startLine) ? section.startLine : 1;
  const code = highlightCode(section.content, language, section.highlightLines || [], startLine);

  return `<section class="code-panel" id="${sectionId(section.title)}" data-section-type="code" data-source-fallback>
    <header>${renderSourceLink(section, sourceId)}<button data-copy-from="#${sourceId}">Copy</button></header>
    <pre id="${sourceId}" data-start-line="${startLine}" data-line-numbered>${code}</pre>
    <details><summary>Code source</summary><pre>${escapeHtml(section.content)}</pre></details>
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
  }).join("\n");
}

function renderDiffSection(section, index) {
  const sourceId = `diff-${index}`;
  return `<section class="diff-panel" id="${sectionId(section.title)}" data-section-type="diff" data-source-fallback>
    <header><div><h2>${escapeHtml(section.title)}</h2>${renderSourceLink(section, sourceId)}</div><button data-copy-from="#${sourceId}">Copy diff</button></header>
    <pre id="${sourceId}" data-line-numbered><code>${highlightDiff(section.content)}</code></pre>
  </section>`;
}

function renderFilterableCards(section) {
  const target = slugify(section.title);
  const items = Array.isArray(section.items) ? section.items : [];
  const groups = ["all", ...new Set(items.map((item) => item.group || "item"))];
  return `<section class="panel" id="${sectionId(section.title)}" data-section-type="filterable-cards">
    <div class="split-row"><h2>${escapeHtml(section.title)}</h2><div class="toolbar" role="toolbar" aria-label="${escapeAttr(section.filterLabel || section.title)} filters">
      ${groups.map((group, index) => `<button data-filter-target="${target}" data-filter-value="${escapeAttr(group)}" aria-pressed="${index === 0 ? "true" : "false"}">${escapeHtml(group)}</button>`).join("")}
    </div></div>
    <div class="evidence-grid focus-field" data-focus-field="${target}">
      ${items.map((item) => `<article class="interactive-card evidence-card evidence-spotlight" data-evidence-spotlight data-filter-target="${target}" data-filter-value="${escapeAttr(item.group || "item")}" data-search-target="${target}">
        <div class="meta">${escapeHtml(item.group || "item")}</div>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.body)}</p>
      </article>`).join("\n")}
    </div>
  </section>`;
}

function renderTabs(section) {
  const group = slugify(section.title);
  const tabs = Array.isArray(section.tabs) ? section.tabs : [];
  return `<section class="panel" id="${sectionId(section.title)}" data-section-type="tabs">
    <h2>${escapeHtml(section.title)}</h2>
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
  return `<section class="panel" id="${sectionId(section.title)}" data-section-type="timeline">
    <h2>${escapeHtml(section.title)}</h2>
    <div class="timeline">
      ${items.map((item) => `<div class="step"><strong>${escapeHtml(item.label || item.when)}</strong><span>${escapeHtml(item.detail || item.body)}</span></div>`).join("\n")}
    </div>
  </section>`;
}

function renderDecisionMatrix(section) {
  const options = Array.isArray(section.options) ? section.options : [];
  return `<section class="panel" id="${sectionId(section.title)}" data-section-type="decision-matrix">
    <h2>${escapeHtml(section.title)}</h2>
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
  const id = `${sectionId(section.title)}-actions`;
  return `<section class="panel" id="${sectionId(section.title)}" data-section-type="actions">
    <div class="split-row"><h2>${escapeHtml(section.title)}</h2><button data-copy-from="#${id}">Copy actions</button></div>
    <ul id="${id}">${actions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
  </section>`;
}

function renderEvidenceSection(section, input) {
  return `<section class="panel" id="${sectionId(section.title || "Evidence")}" data-section-type="evidence">
    <h2>${escapeHtml(section.title || "Evidence")}</h2>
    ${renderEvidence(input.evidence || [])}
  </section>`;
}

async function renderSection(section, mode, index, input, options) {
  if (section.type === "summary-cards") return renderSummaryCards(section);
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
  return `<section class="panel" id="${sectionId(section.title)}" data-section-type="${escapeAttr(section.type)}"><h2>${escapeHtml(section.title)}</h2><p>${escapeHtml(section.content || "")}</p></section>`;
}

function renderEvidence(items) {
  return `<div class="evidence-grid" data-evidence>
    ${items.map((item) => `<article class="interactive-card evidence-card evidence-spotlight" data-evidence-spotlight data-evidence-kind="${escapeAttr(item.kind)}">
      <div class="split-row"><span class="meta">${escapeHtml(item.kind)}</span><span class="status-pill ${statusClass(item.status || "info")}">${escapeHtml(item.status || "info")}</span></div>
      <h3>${escapeHtml(item.label)}</h3>
      <p>${escapeHtml(item.value || "")}</p>
    </article>`).join("\n")}
  </div>`;
}

function renderVerification(items) {
  return `<div class="evidence-grid" data-verification>
    ${(items || []).map((item) => `<article class="interactive-card evidence-card evidence-spotlight" data-evidence-spotlight data-verification-status="${escapeAttr(item.status)}">
      <div class="split-row"><span class="meta">Verification</span><span class="status-pill ${statusClass(item.status)}">${escapeHtml(item.status)}</span></div>
      <h3>${escapeHtml(item.label)}</h3>
      <p>${escapeHtml(item.detail || "")}</p>
    </article>`).join("\n")}
  </div>`;
}

function renderRuntimeDependencies(mode) {
  if (mode !== "runtime") return "";
  const pins = Object.entries(runtimePins).map(([name, version]) => `${name}@${version}`);
  return `<section class="panel" data-runtime-dependencies>
    <h2>Runtime dependencies</h2>
    <div class="evidence-grid">
      ${pins.map((pin) => `<article class="evidence-card" data-runtime-dependency="${escapeAttr(pin)}"><strong>${escapeHtml(pin)}</strong><p>Optional post-load enhancement. Source fallbacks remain visible.</p></article>`).join("\n")}
    </div>
  </section>`;
}

function runtimeScriptTags(mode) {
  if (mode !== "runtime") return "";
  return `
  <script src="https://cdn.jsdelivr.net/npm/dompurify@${runtimePins.DOMPurify}/dist/purify.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/@highlightjs/cdn-assets@${runtimePins["@highlightjs/cdn-assets"]}/highlight.min.js"></script>
  <script type="module">
    import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@${runtimePins.mermaid}/dist/mermaid.esm.min.mjs";
    import { marked } from "https://cdn.jsdelivr.net/npm/marked@${runtimePins.marked}/lib/marked.esm.js";
    window.mermaid = mermaid;
    window.marked = marked;
    window.dispatchEvent(new Event("rich-render-libs-ready"));
  </script>`;
}

function sectionId(title) {
  return `section-${slugify(title)}`;
}

function validateInput(input) {
  const errors = [];
  if (!input || typeof input !== "object") errors.push("Input must be an object.");
  if (!input.title) errors.push("Missing title.");
  if (!input.summary) errors.push("Missing summary.");
  if (!input.status) errors.push("Missing status.");
  if (!Array.isArray(input.sections) || input.sections.length === 0) errors.push("sections must be a non-empty array.");
  if (!Array.isArray(input.evidence)) errors.push("evidence must be an array.");
  if (input.renderMode && !["pre-rendered", "runtime"].includes(input.renderMode)) errors.push("renderMode must be pre-rendered or runtime.");
  if (input.template && !templateMeta[input.template]) errors.push(`Unknown template: ${input.template}`);
  if (errors.length) throw new Error(errors.join(" "));
}

async function createReport(input, options = {}) {
  validateInput(input);
  const mode = input.renderMode || "pre-rendered";
  const template = input.template || "implementation-handoff";
  const meta = templateMeta[template];
  const generatedAt = input.generatedAt || new Date().toISOString();
  const sections = [];

  for (let index = 0; index < input.sections.length; index += 1) {
    sections.push(await renderSection(input.sections[index], mode, index, input, options));
  }

  const css = [
    fs.readFileSync(reportUiCssPath, "utf8"),
    mode === "runtime" ? fs.readFileSync(richRuntimeCssPath, "utf8") : "",
    "table{width:100%;border-collapse:collapse;margin:10px 0}th,td{border:1px solid var(--line);padding:8px;text-align:left;vertical-align:top}.timeline{display:grid;gap:10px}.step{display:grid;grid-template-columns:120px 1fr;gap:10px;padding:10px;border-left:3px solid var(--accent);background:#f9fafc;border-radius:6px}.unsafe-link{color:var(--danger);font-weight:700}.rich-status{font-size:12px;color:var(--muted)}nav.report-nav{position:sticky;top:0;z-index:5;margin:12px 0;padding:10px;border:1px solid var(--line);border-radius:8px;background:rgba(255,255,255,.92);backdrop-filter:blur(10px)}nav.report-nav a{display:inline-block;margin:4px 10px 4px 0;font-weight:700;text-decoration:none}.report-section-stack{display:grid;gap:12px}.panel{margin-top:12px}details{margin-top:10px}.tab-panel{margin-top:10px}@media(max-width:720px){.step{grid-template-columns:1fr}}"
  ].join("\n");

  const js = [
    fs.readFileSync(reportUiJsPath, "utf8"),
    mode === "runtime" ? fs.readFileSync(richRuntimeJsPath, "utf8") : ""
  ].join("\n");

  const nav = input.sections
    .map((section) => `<a href="#${sectionId(section.title)}">${escapeHtml(section.title)}</a>`)
    .join("");

  return `<!doctype html>
<html lang="en" data-html-work-report data-render-mode="${escapeAttr(mode)}" data-template="${escapeAttr(template)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="generator" content="html-work-reports create-report.mjs">
  <meta name="generated-at" content="${escapeAttr(generatedAt)}">
  <title>${escapeHtml(input.title)}</title>
  <style>${css}</style>
</head>
<body>
  <main class="report-shell">
    <header class="report-hero">
      <div class="title-row">
        <div>
          <div class="eyebrow">${escapeHtml(meta.label)} | ${escapeHtml(meta.useCase)}</div>
          <h1 class="report-title">${escapeHtml(input.title)}</h1>
        </div>
        <span class="status-pill ${statusClass(input.status)}">Status: ${escapeHtml(input.status)}</span>
      </div>
      <div class="lede-grid">
        <article class="interactive-card evidence-card"><div class="meta">Conclusion</div><strong>${escapeHtml(input.summary)}</strong></article>
        <article class="interactive-card evidence-card"><div class="meta">Generated</div><strong>${escapeHtml(generatedAt)}</strong></article>
        <article class="interactive-card evidence-card"><div class="meta">Render mode</div><strong>${escapeHtml(mode)}</strong></article>
      </div>
    </header>

    <nav class="report-nav" aria-label="Report sections">${nav}<a href="#evidence">Evidence</a><a href="#verification">Verification</a><a href="#next-actions">Next</a></nav>

    <div class="report-section-stack">
      ${sections.join("\n")}
      ${renderRuntimeDependencies(mode)}
      <section class="panel" id="evidence" data-section-type="evidence"><h2>Evidence</h2>${renderEvidence(input.evidence || [])}</section>
      <section class="panel" id="verification" data-section-type="verification"><h2>Verification</h2>${renderVerification(input.verification || [])}</section>
      <section class="panel" id="next-actions" data-section-type="actions"><div class="split-row"><h2>Next actions</h2><button data-copy-from="#next-action-list">Copy actions</button></div><ul id="next-action-list">${(input.nextActions || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>
    </div>
  </main>
  ${runtimeScriptTags(mode)}
  <script>${js}</script>
</body>
</html>`;
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
    const html = await createReport(input, { browserMermaid: args.browserMermaid });
    const outDir = path.resolve(args.outDir);
    fs.mkdirSync(outDir, { recursive: true });
    const slug = args.slug || slugify(input.title);
    const outputPath = path.join(outDir, `${slug}.html`);
    fs.writeFileSync(outputPath, html, "utf8");

    if (args.json) {
      console.log(JSON.stringify({ ok: true, outputPath, renderMode: input.renderMode || "pre-rendered", template: input.template || "implementation-handoff" }, null, 2));
    } else {
      console.log(outputPath);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1].replaceAll("\\", "/")}` || process.argv[1]?.endsWith("create-report.mjs")) {
  await main();
}

export { createReport, renderMarkdown, safeLink };
