import fs from "node:fs/promises";
import path from "node:path";

export const PUBLIC_ARTIFACT_PATHS = [
  "docs/reports",
  "docs/data",
  "docs/feed.json",
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
    for (const { name, pattern } of patterns) {
      const match = pattern.exec(text);
      if (match) {
        findings.push({
          file: path.relative(rootDir, filePath).replace(/\\/g, "/"),
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
