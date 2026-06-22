import { createHash } from "node:crypto";

const MAX_HTML_LENGTH = 50000;
const MAX_CSS_LENGTH = 25000;
const SUPPORTED_COMPONENT_KINDS = new Set(["openrouter_rankings", "artificial_analysis_index", "swe_bench_pro"]);
const BROAD_SOURCE_SELECTORS = new Set(["html", "body", "main", "#root", "#__next"]);
const MAX_PUBLIC_HTML_LENGTH = 30000;

export function createOfficialComponentSnapshot(input = {}) {
  const sanitizedHtml = sanitizeOfficialHtmlFragment(input.html || input.sanitized_html || input.sanitizedHtml);
  if (!sanitizedHtml) {
    return null;
  }
  const sanitizedCss = sanitizeOfficialCssFragment(input.css || input.sanitized_css || input.sanitizedCss);
  const componentKind = String(input.componentKind || input.component_kind || "").trim();
  const sourceUrl = String(input.sourceUrl || input.source_url || "").trim();
  const selectorVersion = String(input.selectorVersion || input.selector_version || "").trim();
  const sourceSelector = String(input.sourceSelector || input.source_selector || "").trim();
  if (!SUPPORTED_COMPONENT_KINDS.has(componentKind) || !isHttpUrl(sourceUrl) || !selectorVersion) {
    return null;
  }
  if (!isPublishableOfficialComponentFragment({ html: sanitizedHtml, sourceSelector })) {
    return null;
  }
  return {
    status: "available",
    source: "official_dom",
    component_kind: componentKind,
    source_url: sourceUrl,
    captured_at: String(input.capturedAt || input.captured_at || new Date().toISOString()),
    selector_version: selectorVersion,
    source_selector: sourceSelector,
    sanitized_html: sanitizedHtml,
    sanitized_css: sanitizedCss,
    dom_hash: sha256(sanitizedHtml),
    css_hash: sha256(sanitizedCss)
  };
}

export function isPublishableOfficialComponentFragment(input = {}) {
  const html = String(input.html || input.sanitized_html || input.sanitizedHtml || "").trim();
  const selector = normalizeSelector(input.sourceSelector || input.source_selector || "");
  if (!html || html.length > MAX_PUBLIC_HTML_LENGTH) {
    return false;
  }
  if (BROAD_SOURCE_SELECTORS.has(selector)) {
    return false;
  }
  if (/^<\s*(html|body|main)(?:\s|>)/i.test(html)) {
    return false;
  }
  const rowLikeCount = (html.match(/<\s*tr\b|role\s*=\s*["']row["']|<\s*li\b/gi) || []).length;
  const hasComponentMarker = /data-[^=]*(openrouter|ranking|leaderboard|analysis|index|aa|swe|bench)|class\s*=\s*["'][^"']*(ranking|leaderboard|analysis|index|card|swe|bench)/i.test(html);
  const hasStructuredSurface = /<\s*table\b|role\s*=\s*["']table["']/i.test(html) || rowLikeCount > 0;
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text.length >= 20 && (hasStructuredSurface || hasComponentMarker);
}

export function normalizeOfficialComponentSnapshot(input = {}, defaults = {}) {
  if (!input || typeof input !== "object") {
    return null;
  }
  const normalized = createOfficialComponentSnapshot({
    ...input,
    html: input.sanitized_html || input.sanitizedHtml || input.html,
    css: input.sanitized_css || input.sanitizedCss || input.css,
    componentKind: input.component_kind || input.componentKind || defaults.componentKind,
    sourceUrl: input.source_url || input.sourceUrl || defaults.sourceUrl,
    capturedAt: input.captured_at || input.capturedAt || defaults.capturedAt,
    selectorVersion: input.selector_version || input.selectorVersion || defaults.selectorVersion,
    sourceSelector: input.source_selector || input.sourceSelector || defaults.sourceSelector
  });
  return normalized;
}

export function sanitizeOfficialHtmlFragment(value) {
  let html = String(value || "").replace(/\0/g, "").slice(0, MAX_HTML_LENGTH);
  if (!html.trim()) {
    return "";
  }
  html = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\s*(script|style|iframe|object|embed|form|input|textarea|select|option|link|meta|base|canvas)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed|form|input|textarea|select|option|link|meta|base|canvas)[^>]*\/?>/gi, "")
    .replace(/\s(on[a-z]+|style|srcdoc)\s*=\s*"[^"]*"/gi, "")
    .replace(/\s(on[a-z]+|style|srcdoc)\s*=\s*'[^']*'/gi, "")
    .replace(/\s(on[a-z]+|style|srcdoc)\s*=\s*[^\s>]+/gi, "")
    .replace(/\s(href|src)\s*=\s*"(?!(?:https?:|\/|#))[^"]*"/gi, "")
    .replace(/\s(href|src)\s*=\s*'(?!(?:https?:|\/|#))[^']*'/gi, "")
    .replace(/\s(href|src)\s*=\s*(?!(?:https?:|\/|#))[^\s>]+/gi, "");
  return html.trim();
}

export function sanitizeOfficialCssFragment(value) {
  let css = String(value || "").replace(/\0/g, "").slice(0, MAX_CSS_LENGTH);
  if (!css.trim()) {
    return "";
  }
  css = css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/@import[^;]+;/gi, "")
    .replace(/url\s*\([^)]*\)/gi, "none")
    .replace(/expression\s*\([^)]*\)/gi, "")
    .replace(/behavior\s*:[^;]+;/gi, "")
    .replace(/position\s*:\s*(fixed|sticky)\s*;?/gi, "")
    .replace(/<\/?style[^>]*>/gi, "")
    .trim();
  return css;
}

export function officialSnapshotForInteraction(input = {}) {
  const normalized = normalizeOfficialComponentSnapshot(input);
  if (!normalized) {
    return null;
  }
  return {
    status: normalized.status,
    source: normalized.source,
    componentKind: normalized.component_kind,
    sourceUrl: normalized.source_url,
    capturedAt: normalized.captured_at,
    selectorVersion: normalized.selector_version,
    sourceSelector: normalized.source_selector,
    html: normalized.sanitized_html,
    css: normalized.sanitized_css,
    domHash: normalized.dom_hash,
    cssHash: normalized.css_hash
  };
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(String(value || "")).digest("hex")}`;
}

function normalizeSelector(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function isHttpUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
