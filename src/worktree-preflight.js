import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function checkWorktreePreflight(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || process.cwd());
  const remote = options.remote || "origin";
  const baseBranch = options.baseBranch || "main";
  const baseRef = `${remote}/${baseBranch}`;
  const runner = options.commandRunner || defaultCommandRunner;
  const env = options.env || process.env;
  const allowDirty = Boolean(options.allowDirty);
  const fetchRemote = options.fetchRemote !== false;

  const result = {
    ok: false,
    mode: "worktree-preflight",
    repo_root: repoRoot,
    remote,
    base_branch: baseBranch,
    base_ref: baseRef,
    branch: "",
    head_sha: "",
    upstream: "",
    remote_url: "",
    dirty: false,
    dirty_entries: [],
    base: {
      origin_main_sha: "",
      includes_origin_main: null,
      head_in_origin_main: null,
      ahead: null,
      behind: null
    },
    main_worktree: {
      checked_out_elsewhere: false,
      path: ""
    },
    github_cli: {
      available: null,
      ok: null,
      env_token_present: Boolean(env.GH_TOKEN || env.GITHUB_TOKEN)
    },
    warnings: [],
    failures: []
  };

  const runGit = (args) => runCommand(runner, "git", args, repoRoot, env);
  const runGh = (args) => runCommand(runner, "gh", args, repoRoot, env);

  const repoCheck = await runGit(["rev-parse", "--show-toplevel"]);
  if (repoCheck.exitCode !== 0) {
    addFailure(result, "not_git_repository", "The current directory is not inside a Git repository.");
    result.ok = false;
    return result;
  }

  if (fetchRemote) {
    const fetch = await runGit(["fetch", remote, baseBranch, "--prune"]);
    if (fetch.exitCode !== 0) {
      addWarning(result, "remote_fetch_failed", `Could not refresh ${baseRef}; continuing with local refs.`);
    }
  }

  const branch = await runGit(["rev-parse", "--abbrev-ref", "HEAD"]);
  if (branch.exitCode !== 0) {
    addFailure(result, "branch_unreadable", "Could not determine the current branch.");
  } else {
    result.branch = cleanStdout(branch.stdout);
    if (result.branch === "HEAD") {
      addFailure(result, "detached_head", "The worktree is on a detached HEAD.");
    }
  }

  const head = await runGit(["rev-parse", "HEAD"]);
  if (head.exitCode === 0) {
    result.head_sha = cleanStdout(head.stdout);
  } else {
    addFailure(result, "head_unreadable", "Could not determine HEAD SHA.");
  }

  const status = await runGit(["status", "--porcelain"]);
  if (status.exitCode !== 0) {
    addFailure(result, "status_unreadable", "Could not read worktree status.");
  } else {
    result.dirty_entries = parseDirtyEntries(status.stdout);
    result.dirty = result.dirty_entries.length > 0;
    if (result.dirty && allowDirty) {
      addWarning(result, "dirty_worktree_allowed", "The worktree has local changes, but --allow-dirty was set.");
    } else if (result.dirty) {
      addFailure(result, "dirty_worktree", "The worktree has uncommitted changes.");
    }
  }

  const upstream = await runGit(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
  if (upstream.exitCode === 0) {
    result.upstream = cleanStdout(upstream.stdout);
  } else {
    addWarning(result, "missing_upstream", "The current branch has no readable upstream.");
  }

  const remoteUrl = await runGit(["remote", "get-url", remote]);
  if (remoteUrl.exitCode === 0) {
    result.remote_url = sanitizeRemoteUrl(cleanStdout(remoteUrl.stdout));
  } else {
    addWarning(result, "missing_remote_url", `Could not read remote URL for ${remote}.`);
  }

  const baseSha = await runGit(["rev-parse", baseRef]);
  if (baseSha.exitCode === 0) {
    result.base.origin_main_sha = cleanStdout(baseSha.stdout);
  } else {
    addFailure(result, "missing_origin_main", `Could not read ${baseRef}.`);
  }

  const includesBase = await runGit(["merge-base", "--is-ancestor", baseRef, "HEAD"]);
  if (includesBase.exitCode === 0) {
    result.base.includes_origin_main = true;
  } else if (includesBase.exitCode === 1) {
    result.base.includes_origin_main = false;
    addFailure(result, "stale_origin_main", `The branch does not include the latest ${baseRef}.`);
  } else {
    addFailure(result, "origin_main_compare_failed", `Could not compare HEAD with ${baseRef}.`);
  }

  const headInBase = await runGit(["merge-base", "--is-ancestor", "HEAD", baseRef]);
  if (headInBase.exitCode === 0) {
    result.base.head_in_origin_main = true;
    addWarning(result, "branch_already_in_origin_main", `HEAD is already contained in ${baseRef}.`);
  } else if (headInBase.exitCode === 1) {
    result.base.head_in_origin_main = false;
  } else {
    addWarning(result, "head_origin_main_compare_failed", `Could not determine whether HEAD is contained in ${baseRef}.`);
  }

  const aheadBehind = await runGit(["rev-list", "--left-right", "--count", `${baseRef}...HEAD`]);
  if (aheadBehind.exitCode === 0) {
    const counts = cleanStdout(aheadBehind.stdout).split(/\s+/).map((value) => Number.parseInt(value, 10));
    if (counts.length >= 2 && counts.every((value) => Number.isInteger(value))) {
      result.base.behind = counts[0];
      result.base.ahead = counts[1];
    }
  } else {
    addWarning(result, "ahead_behind_unreadable", `Could not compute ahead/behind counts against ${baseRef}.`);
  }

  const worktrees = await runGit(["worktree", "list", "--porcelain"]);
  if (worktrees.exitCode === 0) {
    const mainWorktree = findBranchWorktree(parseWorktreePorcelain(worktrees.stdout), baseBranch, repoRoot);
    if (mainWorktree) {
      result.main_worktree.checked_out_elsewhere = true;
      result.main_worktree.path = mainWorktree.path;
      addWarning(result, "main_checked_out_elsewhere", `${baseBranch} is checked out in another worktree.`);
    }
  } else {
    addWarning(result, "worktree_list_unreadable", "Could not inspect sibling Git worktrees.");
  }

  if (result.github_cli.env_token_present) {
    addWarning(result, "github_token_env_present", "GH_TOKEN or GITHUB_TOKEN is set and may override keyring GitHub CLI auth.");
  }

  const ghAuth = await runGh(["auth", "status"]);
  result.github_cli.available = ghAuth.errorCode !== "ENOENT";
  result.github_cli.ok = ghAuth.exitCode === 0;
  if (result.github_cli.available && ghAuth.exitCode !== 0) {
    addWarning(result, "github_cli_auth_unhealthy", "GitHub CLI auth status returned a non-zero exit code.");
  } else if (!result.github_cli.available) {
    addWarning(result, "github_cli_unavailable", "GitHub CLI is not available on PATH.");
  }

  result.ok = result.failures.length === 0;
  return result;
}

export function parseWorktreePorcelain(stdout) {
  const entries = [];
  let current = {};

  for (const line of String(stdout || "").split(/\r?\n/)) {
    if (line.trim() === "") {
      pushWorktree(entries, current);
      current = {};
      continue;
    }

    if (line.startsWith("worktree ")) {
      current.path = line.slice("worktree ".length).trim();
    } else if (line.startsWith("branch ")) {
      const branchRef = line.slice("branch ".length).trim();
      current.branch = branchRef.replace(/^refs\/heads\//, "");
    } else if (line === "detached") {
      current.detached = true;
    }
  }

  pushWorktree(entries, current);
  return entries;
}

async function defaultCommandRunner(command, args, options) {
  try {
    const result = await execFileAsync(command, args, {
      cwd: options.cwd,
      env: options.env,
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024
    });
    return {
      stdout: result.stdout || "",
      stderr: result.stderr || "",
      exitCode: 0
    };
  } catch (error) {
    return {
      stdout: error.stdout || "",
      stderr: error.stderr || "",
      exitCode: Number.isInteger(error.code) ? error.code : 127,
      errorCode: typeof error.code === "string" ? error.code : ""
    };
  }
}

async function runCommand(runner, command, args, cwd, env) {
  try {
    const result = await runner(command, args, { cwd, env });
    return {
      stdout: result?.stdout || "",
      stderr: result?.stderr || "",
      exitCode: Number.isInteger(result?.exitCode) ? result.exitCode : 0,
      errorCode: result?.errorCode || ""
    };
  } catch (error) {
    return {
      stdout: error.stdout || "",
      stderr: error.stderr || "",
      exitCode: Number.isInteger(error.code) ? error.code : 127,
      errorCode: typeof error.code === "string" ? error.code : ""
    };
  }
}

function parseDirtyEntries(stdout) {
  return String(stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => ({
      status: line.slice(0, 2).trim(),
      path: line.slice(3).trim()
    }));
}

function findBranchWorktree(entries, branch, currentPath) {
  const normalizedCurrent = normalizeComparablePath(currentPath);
  return entries.find((entry) => {
    return entry.branch === branch
      && normalizeComparablePath(entry.path) !== normalizedCurrent;
  });
}

function pushWorktree(entries, current) {
  if (current.path) {
    entries.push(current);
  }
}

function normalizeComparablePath(value) {
  return path.resolve(String(value || "")).replace(/\\/g, "/").toLowerCase();
}

function cleanStdout(value) {
  return String(value || "").trim();
}

function sanitizeRemoteUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    if (url.username || url.password) {
      url.username = "";
      url.password = "";
      return url.toString();
    }
  } catch {
    return value;
  }
  return value;
}

function addFailure(result, code, message) {
  result.failures.push({ code, message });
}

function addWarning(result, code, message) {
  result.warnings.push({ code, message });
}
