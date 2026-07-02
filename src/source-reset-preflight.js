import fs from "node:fs/promises";
import path from "node:path";

const REQUIRED_FILES = [
  "src/public-surface-policy.js",
  "config/sources/github-watchlist.json",
  "config/sources/community-hotspots.json"
];

const FORBIDDEN_FILES = [
  "config/sources/wechat-whitelist.json",
  "config/sources/wechat-platform-sources.json",
  "config/sources/zhihu-platform-sources.json",
  "config/sources/reddit-platform-sources.json"
];

const FORBIDDEN_PACKAGE_SCRIPTS = [
  "discover:wechat-platform",
  "discover:zhihu-platform",
  "discover:reddit-platform"
];

const REQUIRED_GITHUB_WATCH_SOURCE_IDS = [
  "github-watch-ai-news-radar-commits",
  "github-watch-follow-builders-commits",
  "github-watch-follow-builders-x",
  "github-watch-ai-news-agent-commits",
  "github-watch-ml-news-of-the-week-readme"
];

const REQUIRED_COMMUNITY_HOTSPOT_SOURCE_IDS = [
  "community-hn-frontpage-100",
  "community-hn-ai-newest"
];

const REQUIRED_DIRECT_CHINESE_SOURCE_IDS = [
  "intermediary-jiqizhixin",
  "intermediary-qbitai",
  "intermediary-infoq-cn",
  "intermediary-36kr"
];

export async function checkSourceResetPreflight(options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const result = {
    ok: false,
    mode: "source-reset-preflight",
    repo_root: rootDir,
    checked_files: [],
    required_files: REQUIRED_FILES,
    forbidden_files: FORBIDDEN_FILES,
    missing_files: [],
    forbidden_files_present: [],
    forbidden_package_scripts_present: [],
    missing_source_ids: [],
    invalid_source_policies: [],
    failures: []
  };

  await checkRequiredFiles({ rootDir, result });
  await checkForbiddenFiles({ rootDir, result });
  await checkPackageScripts({ rootDir, result });
  await checkSourceConfigIds({
    rootDir,
    result,
    filePath: "config/sources/github-watchlist.json",
    requiredIds: REQUIRED_GITHUB_WATCH_SOURCE_IDS
  });
  await checkSourceConfigIds({
    rootDir,
    result,
    filePath: "config/sources/community-hotspots.json",
    requiredIds: REQUIRED_COMMUNITY_HOTSPOT_SOURCE_IDS,
    validateSource: validateCommunityHotspotSource
  });
  await checkSourceConfigIds({
    rootDir,
    result,
    filePath: "config/sources/intermediary-sources.json",
    requiredIds: REQUIRED_DIRECT_CHINESE_SOURCE_IDS,
    validateSource: validateDirectChineseSource
  });
  await checkRetiredSourceIdsAbsent({ rootDir, result });

  result.ok = result.failures.length === 0;
  return result;
}

async function checkRequiredFiles({ rootDir, result }) {
  for (const relativePath of REQUIRED_FILES) {
    result.checked_files.push(relativePath);
    if (!(await fileExists(path.join(rootDir, relativePath)))) {
      result.missing_files.push(relativePath);
      addFailure(result, "missing_required_file", `${relativePath} is required for the public-surface source reset.`);
    }
  }
}

async function checkForbiddenFiles({ rootDir, result }) {
  for (const relativePath of FORBIDDEN_FILES) {
    result.checked_files.push(relativePath);
    if (await fileExists(path.join(rootDir, relativePath))) {
      result.forbidden_files_present.push(relativePath);
      addFailure(result, "retired_source_config_present", `${relativePath} is a retired platform source config.`);
    }
  }
}

async function checkPackageScripts({ rootDir, result }) {
  const relativePath = "package.json";
  const packageJson = await readJsonFile({ rootDir, relativePath, result });
  if (!packageJson) {
    return;
  }
  const scripts = packageJson.scripts && typeof packageJson.scripts === "object" ? packageJson.scripts : {};
  for (const scriptName of FORBIDDEN_PACKAGE_SCRIPTS) {
    if (Object.hasOwn(scripts, scriptName)) {
      result.forbidden_package_scripts_present.push(scriptName);
      addFailure(result, "retired_platform_script_present", `${scriptName} must not be available in default automation code.`);
    }
  }
}

async function checkSourceConfigIds({ rootDir, result, filePath, requiredIds, validateSource }) {
  const payload = await readJsonFile({ rootDir, relativePath: filePath, result });
  if (!payload) {
    return;
  }
  const sources = Array.isArray(payload.sources) ? payload.sources : [];
  const byId = new Map(sources.map((source) => [String(source?.id || ""), source]));
  for (const id of requiredIds) {
    const source = byId.get(id);
    if (!source) {
      result.missing_source_ids.push(id);
      addFailure(result, "missing_required_source_id", `${filePath} must include ${id}.`);
      continue;
    }
    if (validateSource) {
      validateSource({ source, filePath, result });
    }
  }
}

async function checkRetiredSourceIdsAbsent({ rootDir, result }) {
  const sourceDir = path.join(rootDir, "config", "sources");
  let files;
  try {
    files = await fs.readdir(sourceDir, { withFileTypes: true });
  } catch (error) {
    addFailure(result, "source_dir_unreadable", `config/sources cannot be read: ${error.message}`);
    return;
  }

  for (const entry of files) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }
    const relativePath = path.join("config", "sources", entry.name).split(path.sep).join("/");
    const payload = await readJsonFile({ rootDir, relativePath, result });
    if (!payload) {
      continue;
    }
    const sources = Array.isArray(payload.sources) ? payload.sources : [];
    for (const source of sources) {
      const id = String(source?.id || "");
      const sourceKind = String(source?.source_kind || source?.sourceKind || source?.format || "");
      if (/^(?:platform-(?:wechat|zhihu|reddit)|wechat-rsshub|.*rsshub.*)$/i.test(id) || sourceKind.toLowerCase() === "rsshub") {
        addFailure(result, "retired_platform_source_present", `${relativePath} contains retired platform/RSSHub source ${id || "(missing id)"}.`);
      }
    }
  }
}

function validateCommunityHotspotSource({ source, filePath, result }) {
  if (source.public_degraded_on_blocked !== false) {
    result.invalid_source_policies.push({
      file: filePath,
      id: source.id,
      field: "public_degraded_on_blocked",
      expected: false,
      actual: source.public_degraded_on_blocked
    });
    addFailure(result, "community_hotspot_public_degradation_enabled", `${source.id} must keep public_degraded_on_blocked:false.`);
  }
}

function validateDirectChineseSource({ source, filePath, result }) {
  const url = String(source?.url || "");
  if (!/^https:\/\//i.test(url)) {
    result.invalid_source_policies.push({
      file: filePath,
      id: source.id,
      field: "url",
      expected: "https direct source",
      actual: url
    });
    addFailure(result, "direct_chinese_source_not_https", `${source.id} must use an HTTPS direct source URL.`);
  }
}

async function readJsonFile({ rootDir, relativePath, result }) {
  const filePath = path.join(rootDir, relativePath);
  result.checked_files.push(relativePath);
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    addFailure(result, "json_file_unreadable", `${relativePath} cannot be read as JSON: ${error.message}`);
    return null;
  }
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function addFailure(result, code, message) {
  result.failures.push({ code, message });
}
