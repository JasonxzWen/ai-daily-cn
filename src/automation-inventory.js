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
  const role = automationRole({ id, name, text });
  const statusSelfCheck = role === "status_self_check"
    ? true
    : role
      ? false
      : /status:self-check|status self-check/i.test(text);
  const legacyFlow = /publish:prepare-worktree|(?:npm|pnpm|corepack\s+pnpm)\s+run\s+publish:dry-run(?!:daily)|node src\/cli\.js publish:dry-run(?!:daily)/i.test(text);
  const dailyPublish = role === "daily_publish"
    ? true
    : role
      ? false
      : !statusSelfCheck &&
        (/daily:run[\s\S]*--publish/i.test(text) ||
          /daily:codex-pipeline[\s\S]*(--publish|\bpublish\b)/i.test(text) ||
          /confirm-push|publish:github-api|publish:prepare-worktree/i.test(text) ||
          (/AI[\s\S]*Daily|AI[\s\S]*daily|AI[\s\S]*日报/i.test(text) && /GitHub Pages|publish|发布/i.test(text)));
  return {
    id,
    name,
    kind,
    status,
    active,
    role: role || (dailyPublish ? "daily_publish" : statusSelfCheck ? "status_self_check" : ""),
    rrule,
    cwds,
    path: filePath,
    daily_publish: dailyPublish,
    status_self_check: statusSelfCheck,
    legacy_flow: legacyFlow
  };
}

function automationRole({ id, name, text }) {
  const declared = normalizeAutomationRole(
    tomlString(text, "role") ||
    tomlString(text, "automation_role") ||
    tomlString(text, "codex_role")
  );
  if (declared) {
    return declared;
  }
  const normalizedId = String(id || "").trim().toLowerCase();
  const haystack = `${name || ""}\n${text || ""}`;
  if (normalizedId === "ai-daily-2" || /每日重构洞察|重构洞察|refactor insight|readonly insight/i.test(haystack)) {
    return "readonly_insight";
  }
  return "";
}

function normalizeAutomationRole(value) {
  const role = String(value || "").trim().toLowerCase().replace(/[-\s]+/g, "_");
  if (["daily_publish", "publish", "publisher"].includes(role)) {
    return "daily_publish";
  }
  if (["status_self_check", "self_check", "status_check"].includes(role)) {
    return "status_self_check";
  }
  if (["readonly_insight", "read_only_insight", "refactor_insight", "insight"].includes(role)) {
    return "readonly_insight";
  }
  return "";
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
