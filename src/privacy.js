import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { isPublicNetworkHost, isSensitivePrivateNetworkHost } from "./public-url.js";

export const PUBLIC_ARTIFACT_PATHS = [
  "docs/data",
  "docs/feed.json",
  "docs/articles.json",
  "docs/home.json",
  "docs/signals",
  "docs/index.html",
  "docs/trends.json",
  "reports-data"
];

const TEXT_EXTENSIONS = new Set([".html", ".json", ".txt", ".xml"]);
const LOCAL_INFO_PATTERNS = [
  { name: "codex_home_variable", pattern: /\$CODEX_HOME|%CODEX_HOME%/i },
  { name: "windows_local_system_path", pattern: /\b[A-Za-z]:[\\/](?:Windows|ProgramData|Temp|tmp)[\\/]/i },
  { name: "codex_automation_path", pattern: /\.codex[\\/]automations|automations[\\/]ai-daily[\\/]inputs/i },
  { name: "file_url_local_path", pattern: /file:\/\/\/?(?:[A-Za-z]:|\/(?:Users|home|tmp)\b)/i }
];

const PUBLIC_URL_FORBIDDEN_PATTERNS = [
  { name: "public_url_credentials", pattern: /https?:\/\/[^\s/?:#]+:[^\s/@]+@/i },
  { name: "public_url_secret_query", pattern: /[?&](?:access[_-]?token|api[_-]?key|auth(?:orization)?|client[_-]?secret|credential|key|pass(?:word|wd)?|secret|sig(?:nature)?|token|x-amz-(?:credential|security-token|signature)|x-goog-(?:credential|signature))=/i }
];
const PUBLIC_URL_RE = /https?:\/\/[^\s"'<>\\]+/gi;
const HTML_PUBLIC_URL_ATTRIBUTE_RE = /\b(?:href|src|action)\s*=\s*["'](https?:\/\/[^"'<>]+)["']/gi;
const XML_PUBLIC_URL_ELEMENT_RE = /<(?:link|url|uri)>\s*(https?:\/\/[^<\s]+)\s*<\//gi;

const PUBLIC_DOCS_FORBIDDEN_PATTERNS = [
  { name: "public_source_effectiveness", pattern: /\bsource_effectiveness\b/i },
  { name: "public_source_coverage_wording", pattern: /\bsource\s+coverage\b/i },
  { name: "public_source_audit", pattern: /\bsource_audit\b/i },
  { name: "public_self_check", pattern: /\bself_check\b/i },
  { name: "public_internal_audit_field", pattern: /"(?:candidate_id|candidate_pool_path|publish_status|selection_snapshot|automation_revision|reader_relevance|admission|rationale|debug|raw|notes)"\s*:/i },
  { name: "public_retired_platform_section", pattern: /\b(?:wechat_items|zhihu_items|reddit_items)\b/i },
  { name: "public_retired_platform_degradation", pattern: /\b(?:wechat_sources_blocked|zhihu_sources_blocked|reddit_sources_blocked)\b/i },
  { name: "public_source_blocked_code", pattern: /\b[a-z0-9_]+_sources_blocked\b/i }
];

const INTERNAL_SOURCE_TOKEN_PATTERN = /(?:\bAI_DAILY_[A-Z0-9_]+\b|\b[A-Z][A-Z0-9_]*(?:_API_KEY|_TOKEN|_COOKIE|_SECRET|_BASE_URL|_FEED_URL|_URL)\b|required_env|url_env|base_url_env|\burl\b|env_required|allowed_hosts|include_keywords|exclude_keywords|\bkeywords\b|source_audit|candidate_pool|selection_snapshot|self_check|score|debug)/i;
const INTERNAL_NOTES_FIELD_PATTERNS = [
  /["'`]notes["'`]\s*:/i,
  /(?:^|\r?\n)\s*(?:[-*]\s*)?`?notes`?\s*(?=$|[:=|])/im,
  /\|\s*`?notes`?\s*\|/i
];

export function containsInternalSourceField(value) {
  const text = String(value || "");
  return INTERNAL_SOURCE_TOKEN_PATTERN.test(text)
    || INTERNAL_NOTES_FIELD_PATTERNS.some((pattern) => pattern.test(text));
}

export async function scanPublicArtifactsForLocalInfo(options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const targets = options.targets || PUBLIC_ARTIFACT_PATHS;
  const extraForbidden = Array.isArray(options.extraForbidden) ? options.extraForbidden : [];
  const patterns = [
    ...LOCAL_INFO_PATTERNS,
    ...localEnvironmentPathPatterns(rootDir),
    ...extraForbidden.filter(Boolean).map((value) => ({
      name: "explicit_forbidden_value",
      pattern: new RegExp(escapeRegExp(String(value)), "i")
    }))
  ];
  const files = [];
  for (const target of targets) {
    const resolved = path.resolve(rootDir, target);
    if (!isInside(rootDir, resolved)) {
      throw new Error(`Refusing to scan outside repository: ${target}`);
    }
    files.push(...await listTextFiles(resolved));
  }

  const findings = [];
  for (const filePath of files) {
    const text = await fs.readFile(filePath, "utf8");
    const relativeFile = path.relative(rootDir, filePath).replace(/\\/g, "/");
    const filePatterns = relativeFile.startsWith("docs/")
      ? [...patterns, ...PUBLIC_URL_FORBIDDEN_PATTERNS, ...PUBLIC_DOCS_FORBIDDEN_PATTERNS]
      : relativeFile.startsWith("reports-data/occurrences/")
        ? [...patterns, ...PUBLIC_URL_FORBIDDEN_PATTERNS]
        : patterns;
    for (const { name, pattern } of filePatterns) {
      const match = pattern.exec(text);
      if (match) {
        findings.push({
          file: relativeFile,
          pattern: name,
          excerpt: redactExcerpt(text, match.index)
        });
      }
    }
    if (relativeFile.startsWith("docs/") || relativeFile.startsWith("reports-data/occurrences/")) {
      const privateUrlIndex = findPrivatePublicUrlIndex(text, relativeFile);
      if (privateUrlIndex >= 0) {
        findings.push({
          file: relativeFile,
          pattern: "public_url_private_host",
          excerpt: redactExcerpt(text, privateUrlIndex)
        });
      }
    }
  }

  return {
    ok: findings.length === 0,
    files_checked: files.length,
    findings
  };
}

function localEnvironmentPathPatterns(rootDir) {
  const patterns = [];
  const localRoots = new Set([
    rootDir,
    os.homedir(),
    process.env.HOME,
    process.env.USERPROFILE,
    process.env.CODEX_HOME
  ].filter(Boolean).map((value) => path.resolve(String(value))));
  const localIdentities = new Set([
    process.env.USERNAME,
    process.env.USER,
    process.env.LOGNAME
  ].filter(Boolean).map((value) => String(value).trim()).filter(Boolean));

  for (const localRoot of localRoots) {
    const normalized = localRoot.replace(/\\/g, "/");
    const identityMatch = normalized.match(/\/(?:Users|home)\/([^/]+)/i);
    if (identityMatch?.[1]) localIdentities.add(identityMatch[1]);
    const exactPattern = exactLocalPathPattern(normalized);
    if (exactPattern) {
      patterns.push({ name: "local_environment_path", pattern: exactPattern });
    }
  }

  for (const identity of localIdentities) {
    const escapedIdentity = escapeRegExp(identity);
    patterns.push({
      name: "windows_user_path",
      pattern: new RegExp(`\\b[A-Za-z]:[\\\\/](?:Users|Documents and Settings)[\\\\/]${escapedIdentity}(?=[\\\\/"' <>\\n\\r]|$)`, "i")
    });
    patterns.push({
      name: "unix_user_path",
      pattern: new RegExp(`(?:^|[^A-Za-z0-9_])\\/(?:Users|home)\\/${escapedIdentity}(?=[/"' <>\\n\\r]|$)`, "i")
    });
  }
  return patterns;
}

function exactLocalPathPattern(normalizedPath) {
  const trimmed = String(normalizedPath || "").replace(/\/+$/, "");
  if (!trimmed || trimmed === "/" || /^[A-Za-z]:$/.test(trimmed)) return null;
  const isWindows = /^[A-Za-z]:\//.test(trimmed);
  const segments = trimmed.split("/").filter(Boolean).map(escapeRegExp);
  if (segments.length === 0) return null;
  const prefix = isWindows ? "\\b" : "(?:^|[^A-Za-z0-9_])\\/";
  const body = segments.join("[\\\\/]");
  return new RegExp(`${prefix}${body}(?=[\\\\/"' <>\\n\\r]|$)`, "i");
}

function findPrivatePublicUrlIndex(text, relativeFile) {
  const extension = path.extname(relativeFile).toLowerCase();
  if (extension === ".json") {
    try {
      const parsed = JSON.parse(text);
      const privateUrl = privateUrlInJsonValue(parsed) || sensitivePrivateUrlInJsonValue(parsed);
      return privateUrl ? text.indexOf(privateUrl) : -1;
    } catch {
      return -1;
    }
  }
  const patterns = extension === ".xml"
    ? [HTML_PUBLIC_URL_ATTRIBUTE_RE, XML_PUBLIC_URL_ELEMENT_RE]
    : extension === ".html"
      ? [HTML_PUBLIC_URL_ATTRIBUTE_RE]
      : [];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const rawUrl = match[1] || match[0];
      if (hasPrivateHost(rawUrl)) return (match.index || 0) + match[0].indexOf(rawUrl);
    }
  }
  return -1;
}

function sensitivePrivateUrlInJsonValue(value) {
  if (typeof value === "string") {
    for (const match of value.matchAll(PUBLIC_URL_RE)) {
      try {
        if (isSensitivePrivateNetworkHost(new URL(match[0]).hostname)) return match[0];
      } catch {
        // Ignore malformed prose fragments; URL/schema validators own structured fields.
      }
    }
    return "";
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = sensitivePrivateUrlInJsonValue(item);
      if (found) return found;
    }
    return "";
  }
  if (!value || typeof value !== "object") return "";
  for (const item of Object.values(value)) {
    const found = sensitivePrivateUrlInJsonValue(item);
    if (found) return found;
  }
  return "";
}

function privateUrlInJsonValue(value, parentKey = "") {
  if (typeof value === "string") {
    if (!/(?:^|_)(?:url|urls|uri|uris)$/.test(parentKey)) return "";
    for (const match of value.matchAll(PUBLIC_URL_RE)) {
      if (hasPrivateHost(match[0])) return match[0];
    }
    return "";
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = privateUrlInJsonValue(item, parentKey);
      if (found) return found;
    }
    return "";
  }
  if (!value || typeof value !== "object") return "";
  for (const [key, item] of Object.entries(value)) {
    const found = privateUrlInJsonValue(item, key);
    if (found) return found;
  }
  return "";
}

function hasPrivateHost(value) {
  try {
    return !isPublicNetworkHost(new URL(value).hostname);
  } catch {
    return false;
  }
}

async function listTextFiles(target) {
  let stat;
  try {
    stat = await fs.stat(target);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  }
  if (stat.isFile()) {
    return TEXT_EXTENSIONS.has(path.extname(target).toLowerCase()) ? [target] : [];
  }
  if (!stat.isDirectory()) {
    return [];
  }
  const entries = await fs.readdir(target, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = path.join(target, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listTextFiles(child));
    } else if (entry.isFile() && TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(child);
    }
  }
  return files;
}

function isInside(rootDir, target) {
  const relative = path.relative(rootDir, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function redactExcerpt(text, index) {
  const start = Math.max(0, index - 30);
  const end = Math.min(text.length, index + 90);
  return text.slice(start, end).replace(/\s+/g, " ").replace(/[A-Za-z]:[\\/][^"' <>\n\r]+/g, "[local-path]");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
