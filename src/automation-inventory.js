import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export async function inspectAutomationInventory(options = {}) {
  const automationsDir = options.automationsDir || defaultAutomationsDir();
  const projectCwds = normalizePathSet(options.projectCwds || []);
  if (!automationsDir) {
    return { available: false, automations_dir: "", error: "CODEX_HOME is not set" };
  }

  let entries;
  try {
    entries = await fs.readdir(automationsDir, { withFileTypes: true });
  } catch (error) {
    return { available: false, automations_dir: automationsDir, error: error.message };
  }

  const automations = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const filePath = path.join(automationsDir, entry.name, "automation.toml");
    try {
      const text = await fs.readFile(filePath, "utf8");
      const automation = parseAutomationToml(text, filePath);
      if (projectCwds.size > 0 && !matchesProjectCwd(automation, projectCwds)) {
        continue;
      }
      automations.push(automation);
    } catch {
      // Ignore non-automation directories.
    }
  }

  const activePublish = automations.filter((automation) => automation.active && automation.daily_publish);
  const activeSelfCheck = automations.filter((automation) => automation.active && automation.status_self_check);
  return {
    available: true,
    automations_dir: automationsDir,
    automations,
    active_publish_automations: activePublish,
    active_self_check_automations: activeSelfCheck
  };
}

export function defaultAutomationsDir() {
  return process.env.CODEX_HOME
    ? path.join(process.env.CODEX_HOME, "automations")
    : path.join(os.homedir(), ".codex", "automations");
}

function parseAutomationToml(text, filePath) {
  const id = tomlString(text, "id") || path.basename(path.dirname(filePath));
  const status = tomlString(text, "status") || "ACTIVE";
  const kind = tomlString(text, "kind") || "";
  const name = tomlString(text, "name") || "";
  const rrule = tomlString(text, "rrule") || "";
  const cwds = tomlStringArray(text, "cwds");
  const active = status.toUpperCase() === "ACTIVE";
  const statusSelfCheck = /status:self-check|status self-check|状态自检/i.test(text);
  const legacyFlow = /publish:prepare-worktree|npm run publish:dry-run(?!:daily)|node src\/cli\.js publish:dry-run(?!:daily)/i.test(text);
  const dailyPublish =
    !statusSelfCheck &&
    (/daily:run[\s\S]*--publish/i.test(text) ||
      /confirm-push|publish:github-api|publish:prepare-worktree/i.test(text) ||
      (/AI 日报|AI 鏃ユ姤/.test(text) && /GitHub Pages|publish|发布|鍙戝竷/.test(text)));
  return {
    id,
    name,
    kind,
    status,
    active,
    rrule,
    cwds,
    path: filePath,
    daily_publish: dailyPublish,
    status_self_check: statusSelfCheck,
    legacy_flow: legacyFlow
  };
}

function tomlString(text, key) {
  const match = String(text || "").match(new RegExp(`^${key}\\s*=\\s*"([^"]*)"`, "m"));
  return match ? decodeTomlString(match[1]) : "";
}

function tomlStringArray(text, key) {
  const match = String(text || "").match(new RegExp(`^${key}\\s*=\\s*\\[(.*)\\]`, "m"));
  if (!match) return [];
  return [...match[1].matchAll(/"([^"]*)"/g)].map((item) => decodeTomlString(item[1]));
}

function decodeTomlString(value) {
  return String(value || "").replace(/\\\\/g, "\\").replace(/\\"/g, '"');
}

function matchesProjectCwd(automation, projectCwds) {
  return automation.cwds.some((cwd) => projectCwds.has(normalizePath(cwd)));
}

function normalizePathSet(values) {
  const set = new Set();
  for (const value of Array.isArray(values) ? values : [values]) {
    if (!value) continue;
    set.add(normalizePath(value));
  }
  return set;
}

function normalizePath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/\/$/, "").toLowerCase();
}
