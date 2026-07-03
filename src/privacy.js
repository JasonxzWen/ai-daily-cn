import fs from "node:fs/promises";
import path from "node:path";

export const PUBLIC_ARTIFACT_PATHS = [
  "docs/reports",
  "docs/data",
  "docs/feed.json",
  "docs/articles.json",
  "docs/index.html",
  "docs/trends.json",
  "reports-data"
];

const TEXT_EXTENSIONS = new Set([".html", ".json", ".txt", ".xml"]);
const LOCAL_INFO_PATTERNS = [
  { name: "codex_home_variable", pattern: /\$CODEX_HOME|%CODEX_HOME%/i },
  { name: "windows_user_path", pattern: /\b[A-Za-z]:[\\/](?:Users|Documents and Settings)[\\/][^"'<>\\/\s]+/i },
  { name: "windows_local_system_path", pattern: /\b[A-Za-z]:[\\/](?:Windows|ProgramData|Temp|tmp)[\\/]/i },
  { name: "unix_user_path", pattern: /(?:^|[^A-Za-z0-9_])\/(?:Users|home)\/[^"' <>\n\r/]+/i },
  { name: "codex_automation_path", pattern: /\.codex[\\/]automations|automations[\\/]ai-daily[\\/]inputs/i },
  { name: "file_url_local_path", pattern: /file:\/\/\/?(?:[A-Za-z]:|\/(?:Users|home|tmp)\b)/i }
];

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

export async function scanPublicArtifactsForLocalInfo(options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const targets = options.targets || PUBLIC_ARTIFACT_PATHS;
  const extraForbidden = Array.isArray(options.extraForbidden) ? options.extraForbidden : [];
  const patterns = [
    ...LOCAL_INFO_PATTERNS,
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
      ? [...patterns, ...PUBLIC_DOCS_FORBIDDEN_PATTERNS]
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
  }

  return {
    ok: findings.length === 0,
    files_checked: files.length,
    findings
  };
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
