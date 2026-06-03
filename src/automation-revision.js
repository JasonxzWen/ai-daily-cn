import fs from "node:fs/promises";
import path from "node:path";
import { loadSourceRegistry } from "./source-registry.js";

const PROMPT_MANIFEST = "prompts/ai-daily/manifest.json";

export const AUTOMATION_REVISION_RULES = [
  "main_items_min_8_when_candidates_available",
  "content_units_min_27_when_candidates_available",
  "model_releases_must_mirror_main_items",
  "github_api_fallback_for_git_transport",
  "fixed_source_checklist"
];

export const AUTOMATION_REVISION_RULE_ALIASES = {
  content_units_min_27_when_candidates_available: [
    "content_units_min_18_when_candidates_available"
  ]
};

export function defaultAutomationRevision(overrides = {}) {
  return {
    schema_version: 1,
    git_commit: "unknown",
    git_commit_short: "unknown",
    git_branch: "unknown",
    origin_main_sha: "unknown",
    origin_main_short: "unknown",
    prompt_manifest: PROMPT_MANIFEST,
    prompt_modules: [],
    source_registry_count: null,
    source_registry_enablement_counts: {},
    rules: AUTOMATION_REVISION_RULES,
    ...overrides,
    rules: Array.isArray(overrides.rules) ? overrides.rules : AUTOMATION_REVISION_RULES
  };
}

export async function buildAutomationRevision(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const [gitRevision, promptManifest, sourceRegistry] = await Promise.all([
    readGitRevision(rootDir),
    readPromptManifest(rootDir),
    readSourceRegistrySummary(rootDir)
  ]);

  return defaultAutomationRevision({
    ...gitRevision,
    ...promptManifest,
    ...sourceRegistry
  });
}

async function readGitRevision(rootDir) {
  const gitDir = await resolveGitDir(rootDir);
  if (!gitDir) {
    return {};
  }

  try {
    const originMain = await readGitRef(gitDir, "refs/remotes/origin/main");
    const head = (await fs.readFile(path.join(gitDir, "HEAD"), "utf8")).trim();
    if (head.startsWith("ref:")) {
      const ref = head.slice("ref:".length).trim();
      const commit = await readGitRef(gitDir, ref);
      return {
        git_commit: commit || "unknown",
        git_commit_short: commit ? commit.slice(0, 12) : "unknown",
        git_branch: ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : ref,
        origin_main_sha: originMain || "unknown",
        origin_main_short: originMain ? originMain.slice(0, 12) : "unknown"
      };
    }
    if (/^[0-9a-f]{40}$/i.test(head)) {
      return {
        git_commit: head,
        git_commit_short: head.slice(0, 12),
        git_branch: "detached",
        origin_main_sha: originMain || "unknown",
        origin_main_short: originMain ? originMain.slice(0, 12) : "unknown"
      };
    }
  } catch {
    return {};
  }

  return {};
}

async function resolveGitDir(rootDir) {
  const dotGit = path.join(rootDir, ".git");
  try {
    const stat = await fs.stat(dotGit);
    if (stat.isDirectory()) {
      return dotGit;
    }
    if (stat.isFile()) {
      const content = await fs.readFile(dotGit, "utf8");
      const match = /^gitdir:\s*(.+)$/im.exec(content);
      if (match) {
        return path.resolve(rootDir, match[1].trim());
      }
    }
  } catch {
    return null;
  }
  return null;
}

async function readGitRef(gitDir, ref) {
  const commonDir = await resolveCommonGitDir(gitDir);
  for (const baseDir of [gitDir, commonDir]) {
    try {
      const value = (await fs.readFile(path.join(baseDir, ref), "utf8")).trim();
      if (/^[0-9a-f]{40}$/i.test(value)) {
        return value;
      }
    } catch {
      // Packed refs are checked below.
    }
  }

  try {
    const packedRefs = await fs.readFile(path.join(commonDir, "packed-refs"), "utf8");
    const line = packedRefs
      .split(/\r?\n/)
      .find((item) => item && !item.startsWith("#") && item.endsWith(` ${ref}`));
    const commit = line?.split(" ")[0];
    return /^[0-9a-f]{40}$/i.test(commit || "") ? commit : null;
  } catch {
    return null;
  }
}

async function resolveCommonGitDir(gitDir) {
  try {
    const content = (await fs.readFile(path.join(gitDir, "commondir"), "utf8")).trim();
    return path.resolve(gitDir, content);
  } catch {
    return gitDir;
  }
}

async function readPromptManifest(rootDir) {
  try {
    const manifest = JSON.parse(await fs.readFile(path.join(rootDir, PROMPT_MANIFEST), "utf8"));
    return {
      prompt_manifest: PROMPT_MANIFEST,
      prompt_modules: Array.isArray(manifest.modules) ? manifest.modules : []
    };
  } catch {
    return {};
  }
}

async function readSourceRegistrySummary(rootDir) {
  try {
    const registry = await loadSourceRegistry({
      rootDir,
      includeEnablement: "core,optional,manual"
    });
    return {
      source_registry_count: registry.sources.length,
      source_registry_enablement_counts: countBy(registry.sources, "enablement")
    };
  } catch {
    return {};
  }
}

function countBy(items, field) {
  return items.reduce((counts, item) => {
    const value = item?.[field] || "unknown";
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}
