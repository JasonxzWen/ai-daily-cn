import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";
import { DEFAULT_SITE } from "./config.js";
import { PublisherError } from "./errors.js";
import { canonicalReportUrl } from "./paths.js";
import { planGeneratedFiles } from "./site.js";

const execFileAsync = promisify(execFile);

export async function checkPublishPreflight(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || process.cwd());
  const allowedBranch = options.allowedBranch || DEFAULT_SITE.publishBranch;
  const git = options.git || createGitAdapter(repoRoot);

  const branch = await git.branch();
  if (branch !== allowedBranch) {
    throw new PublisherError("wrong_branch", `当前分支是 ${branch || "(detached)"}，允许发布分支是 ${allowedBranch}。`, {
      branch,
      allowedBranch
    });
  }

  const remote = await git.remoteStatus();
  if (remote.remoteAhead > 0) {
    throw new PublisherError("remote_ahead", `远端 ${remote.upstream} 领先 ${remote.remoteAhead} 个提交，不能继续发布。`, remote);
  }

  const statusEntries = parsePorcelain(await git.status());
  const unrelated = statusEntries.filter((entry) => !isPublisherOwnedPath(entry.path));
  if (unrelated.length > 0) {
    throw new PublisherError("dirty_worktree", "工作树存在非发布器管理的未提交改动，发布预检已停止。", {
      status: unrelated.map((entry) => `${entry.code} ${entry.path}`)
    });
  }

  const gitWritable = await assertGitDirectoryWritable(repoRoot, git, options.gitWritableCheck);

  return {
    mode: "preflight",
    repo_root: repoRoot,
    branch,
    allowed_branch: allowedBranch,
    remote,
    git_writable: gitWritable.ok,
    git_dir: gitWritable.git_dir,
    current_dirty_files: statusEntries.map((entry) => entry.path).sort()
  };
}

export async function preparePublishWorktree(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || process.cwd());
  const allowedBranch = options.allowedBranch || DEFAULT_SITE.publishBranch;
  const git = options.git || createGitAdapter(repoRoot);

  const startingBranch = await git.branch();
  const statusEntries = parsePorcelain(await git.status());
  const commitMessage =
    options.commitMessage || `chore: save local changes before AI daily publish`;
  let commitOutput = "";

  if (statusEntries.length > 0) {
    await git.addAll();
    commitOutput = await git.commit(commitMessage);
  }

  const branchAfterCommit = await git.branch();
  let switchedBranch = false;
  if (branchAfterCommit !== allowedBranch) {
    await git.checkout(allowedBranch);
    switchedBranch = true;
  }

  let preflight = null;
  let publishBlocker = null;

  try {
    preflight = await checkPublishPreflight({
      ...options,
      repoRoot,
      allowedBranch,
      git
    });
  } catch (error) {
    if (!isDeferredPrepareBlocker(error)) {
      throw error;
    }
    publishBlocker = toPrepareBlocker(error);
  }

  const currentBranch = preflight?.branch || (await git.branch());

  return {
    mode: "prepare-worktree",
    repo_root: repoRoot,
    starting_branch: startingBranch,
    current_branch: currentBranch,
    allowed_branch: allowedBranch,
    committed_local_changes: statusEntries.length > 0,
    commit_message: statusEntries.length > 0 ? commitMessage : "",
    commit_output: commitOutput,
    saved_dirty_files: statusEntries.map((entry) => `${entry.code} ${entry.path}`),
    switched_branch: switchedBranch,
    publish_ready: !publishBlocker,
    publish_blocker: publishBlocker,
    preflight
  };
}

export async function createPublishPlan(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || process.cwd());
  const allowedBranch = options.allowedBranch || DEFAULT_SITE.publishBranch;
  const git = options.git || createGitAdapter(repoRoot);

  const branch = await git.branch();
  if (branch !== allowedBranch) {
    throw new PublisherError("wrong_branch", `当前分支是 ${branch || "(detached)"}，允许发布分支是 ${allowedBranch}。`, {
      branch,
      allowedBranch
    });
  }

  const remote = await git.remoteStatus();
  if (remote.remoteAhead > 0) {
    throw new PublisherError("remote_ahead", `远端 ${remote.upstream} 领先 ${remote.remoteAhead} 个提交，不能继续发布。`, remote);
  }

  const generated = await planGeneratedFiles({
    rootDir: repoRoot,
    inputDir: options.inputDir || "reports-source",
    dataInputDir: options.dataInputDir || "reports-data",
    outDir: options.outDir || "docs",
    siteUrl: options.siteUrl || DEFAULT_SITE.siteUrl,
    generatedAt: options.generatedAt
  });

  if (generated.reports.length === 0) {
    throw new PublisherError("no_reports", "未发现可发布的结构化日报 JSON 或兼容 Markdown 日报。");
  }

  const statusEntries = parsePorcelain(await git.status());
  const unrelated = statusEntries.filter((entry) => !isPublisherOwnedPath(entry.path));
  if (unrelated.length > 0) {
    throw new PublisherError("dirty_worktree", "工作树存在非发布器管理的未提交改动，dry-run 已停止。", {
      status: unrelated.map((entry) => `${entry.code} ${entry.path}`)
    });
  }

  const dates = generated.reports.map((report) => report.report_date).sort();
  const repoFiles = toRepoRelativeFiles(repoRoot, options.outDir || "docs", generated.files);
  const commitMessage =
    dates.length === 1
      ? `chore: publish AI daily report ${dates[0]}`
      : `chore: publish AI daily reports ${dates[0]}..${dates.at(-1)}`;

  return {
    mode: "dry-run",
    repo_root: repoRoot,
    branch,
    allowed_branch: allowedBranch,
    remote,
    will_write_files: repoFiles,
    will_stage_files: repoFiles,
    current_dirty_files: statusEntries.map((entry) => entry.path).sort(),
    commit_message: commitMessage,
    expected_pages_url: generated.reports.length === 1 ? generated.reports[0].canonical_url : DEFAULT_SITE.siteUrl,
    reports: generated.reports.map((report) => ({
      report_date: report.report_date,
      title: report.title,
      canonical_url: report.canonical_url
    }))
  };
}

export async function publishGeneratedArtifacts(options = {}) {
  if (!options.confirmPush) {
    throw new PublisherError(
      "publish_confirmation_required",
      "真实发布需要显式传入 --confirm-push；不会默认 commit/push。"
    );
  }

  const repoRoot = path.resolve(options.repoRoot || process.cwd());
  const branch = options.allowedBranch || DEFAULT_SITE.publishBranch;
  const git = options.git || createGitAdapter(repoRoot);
  const currentBranch = await git.branch();
  if (currentBranch !== branch) {
    throw new PublisherError("wrong_branch", `当前分支是 ${currentBranch || "(detached)"}，允许发布分支是 ${branch}。`, {
      branch: currentBranch,
      allowedBranch: branch
    });
  }

  const remote = await git.remoteStatus();
  if (remote.remoteAhead > 0) {
    throw new PublisherError("remote_ahead", `远端 ${remote.upstream} 领先 ${remote.remoteAhead} 个提交，不能继续发布。`, remote);
  }

  const statusEntries = parsePorcelain(await git.status());
  const publishFiles = statusEntries
    .map((entry) => entry.path)
    .filter((file) => isPublisherOwnedPath(file));
  const unrelated = statusEntries.filter((entry) => !isPublisherOwnedPath(entry.path));

  if (unrelated.length > 0) {
    throw new PublisherError("dirty_worktree", "工作树存在非发布器管理的未提交改动，已停止发布。", {
      status: unrelated.map((entry) => `${entry.code} ${entry.path}`)
    });
  }

  if (publishFiles.length === 0) {
    return {
      mode: "publish",
      branch,
      remote,
      committed: false,
      pushed: false,
      message: "没有发布产物变更需要提交。"
    };
  }

  if (typeof git.gitDir === "function") {
    await assertGitDirectoryWritable(repoRoot, git, options.gitWritableCheck);
  }

  const commitMessage =
    options.commitMessage || `chore: publish AI daily report${options.reportDate ? ` ${options.reportDate}` : ""}`;
  await git.add(publishFiles);
  const commitOutput = await git.commit(commitMessage);
  const pushOutput = await git.push(branch);
  const pagesUrl = options.reportDate ? canonicalReportUrl(DEFAULT_SITE.siteUrl, options.reportDate) : "";
  const verification =
    pagesUrl && options.verifyPages
      ? await verifyPublishedUrl(pagesUrl, {
          attempts: options.verificationAttempts,
          intervalMs: options.verificationIntervalMs,
          expectedText: options.reportDate,
          fetchImpl: options.fetchImpl
        })
      : { ok: false, error: "" };

  return {
    mode: "publish",
    branch,
    remote,
    committed: true,
    pushed: true,
    staged_files: publishFiles.sort(),
    commit_message: commitMessage,
    commit_output: commitOutput,
    push_output: pushOutput,
    pages_url: pagesUrl,
    pages_verified: Boolean(verification.ok),
    verification_error: verification.error ? `pages_verification_failed: ${verification.error}` : ""
  };
}

export async function publishGeneratedArtifactsViaGitHubApi(options = {}) {
  if (!options.confirmPush) {
    throw new PublisherError(
      "publish_confirmation_required",
      "真实发布需要显式传入 --confirm-push；不会默认通过 GitHub API 写入远端。"
    );
  }

  const repoRoot = path.resolve(options.repoRoot || process.cwd());
  const branch = options.allowedBranch || DEFAULT_SITE.publishBranch;
  const git = options.git || createGitAdapter(repoRoot);
  const currentBranch = await git.branch();
  if (currentBranch !== branch) {
    throw new PublisherError("wrong_branch", `当前分支是 ${currentBranch || "(detached)"}，允许发布分支是 ${branch}。`, {
      branch: currentBranch,
      allowedBranch: branch
    });
  }

  const statusEntries = parsePorcelain(await git.status());
  const publishFiles = uniqueSorted(
    statusEntries
      .map((entry) => entry.path)
      .filter((file) => isPublisherOwnedPath(file))
  );
  const unrelated = statusEntries.filter((entry) => !isPublisherOwnedPath(entry.path));

  if (unrelated.length > 0) {
    throw new PublisherError("dirty_worktree", "工作树存在非发布器管理的未提交改动，GitHub API 发布已停止。", {
      status: unrelated.map((entry) => `${entry.code} ${entry.path}`)
    });
  }

  if (publishFiles.length === 0) {
    return {
      mode: "publish-github-api",
      branch,
      committed: false,
      pushed: false,
      message: "没有发布产物变更需要提交。"
    };
  }

  const token = options.token || process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) {
    throw new PublisherError("github_token_missing", "GitHub API 发布需要 GH_TOKEN 或 GITHUB_TOKEN。");
  }

  const repository = options.repository || process.env.GITHUB_REPOSITORY || parseGitHubRepository(await git.remoteUrl());
  if (!repository) {
    throw new PublisherError("github_repository_missing", "无法识别 GitHub 仓库，请传入 --repo owner/name 或设置 GITHUB_REPOSITORY。");
  }

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new PublisherError("github_api_unavailable", "当前 Node 环境没有可用 fetch，无法调用 GitHub API。");
  }

  const client = createGitHubApiClient({
    fetchImpl,
    token,
    repository,
    apiBaseUrl: options.apiBaseUrl
  });
  const ref = await client.request("GET", `/git/ref/heads/${branch}`);
  const baseCommitSha = ref.object?.sha;
  if (!baseCommitSha) {
    throw new PublisherError("github_api_invalid_ref", `无法读取远端分支 ${branch} 的 commit SHA。`, { repository, branch });
  }

  const baseCommit = await client.request("GET", `/git/commits/${baseCommitSha}`);
  const baseTreeSha = baseCommit.tree?.sha;
  if (!baseTreeSha) {
    throw new PublisherError("github_api_invalid_commit", `无法读取远端分支 ${branch} 的 tree SHA。`, {
      repository,
      branch,
      baseCommitSha
    });
  }

  const remoteTree = await client.request("GET", `/git/trees/${baseTreeSha}?recursive=1`);
  const remoteBlobShas = new Map(
    (remoteTree.tree || [])
      .filter((entry) => entry.type === "blob")
      .map((entry) => [entry.path, entry.sha])
  );
  const treeEntries = await createChangedTreeEntries(repoRoot, publishFiles, remoteBlobShas);

  if (treeEntries.length === 0) {
    return {
      mode: "publish-github-api",
      branch,
      repository,
      base_commit_sha: baseCommitSha,
      committed: false,
      pushed: false,
      published_files: [],
      message: "远端已经包含相同发布产物，没有需要提交的变更。"
    };
  }

  const commitMessage =
    options.commitMessage || `chore: publish AI daily report${options.reportDate ? ` ${options.reportDate}` : ""}`;
  const newTree = await client.request("POST", "/git/trees", {
    base_tree: baseTreeSha,
    tree: treeEntries
  });
  const newCommit = await client.request("POST", "/git/commits", {
    message: commitMessage,
    tree: newTree.sha,
    parents: [baseCommitSha]
  });
  await client.request("PATCH", `/git/refs/heads/${branch}`, {
    sha: newCommit.sha,
    force: false
  });

  const pagesUrl = options.reportDate ? canonicalReportUrl(DEFAULT_SITE.siteUrl, options.reportDate) : "";
  const verification =
    pagesUrl && options.verifyPages
      ? await verifyPublishedUrl(pagesUrl, {
          attempts: options.verificationAttempts,
          intervalMs: options.verificationIntervalMs,
          expectedText: options.reportDate,
          fetchImpl
        })
      : { ok: false, error: "" };

  return {
    mode: "publish-github-api",
    branch,
    repository,
    base_commit_sha: baseCommitSha,
    commit_sha: newCommit.sha,
    committed: true,
    pushed: true,
    published_files: treeEntries.map((entry) => entry.path).sort(),
    commit_message: commitMessage,
    pages_url: pagesUrl,
    pages_verified: Boolean(verification.ok),
    verification_error: verification.error ? `pages_verification_failed: ${verification.error}` : ""
  };
}

export async function verifyPublishedUrl(url, options = {}) {
  const attempts = options.attempts ?? 12;
  const intervalMs = options.intervalMs ?? 5000;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const expectedText = options.expectedText || "";
  let lastError = "";

  if (typeof fetchImpl !== "function") {
    return {
      ok: false,
      error: "当前 Node 环境没有可用 fetch，无法验证 Pages URL。"
    };
  }

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(url, { method: "GET" });
      if (response.ok) {
        if (expectedText) {
          const body = await response.text();
          if (!body.includes(expectedText)) {
            lastError = `HTTP ${response.status} 但页面内容未包含 ${expectedText}`;
          } else {
            return { ok: true, status: response.status };
          }
        } else {
          return { ok: true, status: response.status };
        }
      } else {
        lastError = `HTTP ${response.status}`;
      }
    } catch (error) {
      lastError = error.message;
    }

    if (attempt < attempts && intervalMs > 0) {
      await delay(intervalMs);
    }
  }

  return {
    ok: false,
    error: `${url} 在 ${attempts} 次检查后仍不可用：${lastError || "unknown error"}`
  };
}

function toRepoRelativeFiles(repoRoot, outDir, files) {
  const absoluteOut = path.resolve(repoRoot, outDir);
  return files
    .map((file) => path.relative(repoRoot, path.join(absoluteOut, ...file.split("/"))).split(path.sep).join(path.posix.sep))
    .sort();
}

export function createGitAdapter(repoRoot) {
  return {
    async status() {
      return runGit(repoRoot, ["status", "--porcelain=v1"], { trim: false });
    },
    async branch() {
      return runGit(repoRoot, ["branch", "--show-current"]);
    },
    async remoteStatus() {
      let upstream = "";
      try {
        upstream = await runGit(repoRoot, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
      } catch (error) {
        return {
          status: "no_upstream",
          upstream: "",
          localAhead: 0,
          remoteAhead: 0,
          detail: error.message
        };
      }

      try {
        const output = await runGit(repoRoot, ["rev-list", "--left-right", "--count", `HEAD...${upstream}`]);
        const [localAheadRaw, remoteAheadRaw] = output.split(/\s+/);
        return {
          status: "ok",
          upstream,
          localAhead: Number.parseInt(localAheadRaw, 10) || 0,
          remoteAhead: Number.parseInt(remoteAheadRaw, 10) || 0
        };
      } catch (error) {
        return {
          status: "remote_unknown",
          upstream,
          localAhead: 0,
          remoteAhead: 0,
          detail: error.message
        };
      }
    },
    async gitDir() {
      return runGit(repoRoot, ["rev-parse", "--git-dir"]);
    },
    async remoteUrl() {
      return runGit(repoRoot, ["remote", "get-url", "origin"]);
    },
    async add(files) {
      return runGit(repoRoot, ["add", "--", ...files]);
    },
    async addAll() {
      return runGit(repoRoot, ["add", "--all"]);
    },
    async commit(message) {
      return runGit(repoRoot, ["commit", "-m", message]);
    },
    async checkout(branch) {
      return runGit(repoRoot, ["checkout", branch]);
    },
    async push(branch) {
      return runGit(repoRoot, ["push", "origin", branch]);
    }
  };
}

export function disabledPublishStatus() {
  return {
    publish_status: {
      html_generated: false,
      repo_updated: false,
      repo_pushed: false,
      pages_url: "",
      publish_error: "publish_disabled: 当前版本未启用真实 commit/push，请先运行 publish:dry-run 并等待用户明确授权。"
    }
  };
}

export function parsePorcelain(output) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const separatorIndex = line.indexOf(" ");
      const code = line.slice(0, 2).padEnd(2, " ");
      let filePath = separatorIndex === 1 ? line.slice(2).trim() : line.slice(3).trim();
      if (filePath.includes(" -> ")) {
        filePath = filePath.split(" -> ").at(-1).trim();
      }
      return {
        code,
        path: filePath.replaceAll("\\", "/")
      };
    });
}

function isPublisherOwnedPath(filePath) {
  return (
    filePath === "docs/.nojekyll" ||
    filePath === "docs/feed.json" ||
    filePath === "docs/index.html" ||
    filePath.startsWith("docs/assets/") ||
    filePath.startsWith("docs/data/") ||
    filePath.startsWith("docs/reports/") ||
    filePath.startsWith("reports-data/")
  );
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

async function createChangedTreeEntries(repoRoot, publishFiles, remoteBlobShas) {
  const entries = [];

  for (const filePath of publishFiles) {
    const absolutePath = path.join(repoRoot, ...filePath.split("/"));
    let fileBuffer = null;
    try {
      fileBuffer = await fs.readFile(absolutePath);
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }

    if (!fileBuffer) {
      if (remoteBlobShas.has(filePath)) {
        entries.push({
          path: filePath,
          mode: "100644",
          type: "blob",
          sha: null
        });
      }
      continue;
    }

    const localSha = gitBlobSha(fileBuffer);
    if (remoteBlobShas.get(filePath) === localSha) {
      continue;
    }

    entries.push({
      path: filePath,
      mode: "100644",
      type: "blob",
      content: fileBuffer.toString("utf8")
    });
  }

  return entries;
}

function gitBlobSha(buffer) {
  return crypto
    .createHash("sha1")
    .update(Buffer.concat([Buffer.from(`blob ${buffer.length}\0`), buffer]))
    .digest("hex");
}

function parseGitHubRepository(remoteUrl) {
  if (!remoteUrl) {
    return "";
  }

  const sshMatch = remoteUrl.match(/^git@github\.com:([^/]+\/[^/]+?)(?:\.git)?$/);
  if (sshMatch) {
    return sshMatch[1];
  }

  const sshUrlMatch = remoteUrl.match(/^ssh:\/\/git@github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/);
  if (sshUrlMatch) {
    return sshUrlMatch[1];
  }

  try {
    const parsed = new URL(remoteUrl);
    if (parsed.hostname !== "github.com") {
      return "";
    }
    const [owner, repo] = parsed.pathname.replace(/^\/+/, "").replace(/\.git$/, "").split("/");
    return owner && repo ? `${owner}/${repo}` : "";
  } catch {
    return "";
  }
}

function createGitHubApiClient({ fetchImpl, token, repository, apiBaseUrl }) {
  const baseUrl = apiBaseUrl || `https://api.github.com/repos/${repository}`;

  return {
    async request(method, resourcePath, body) {
      const response = await fetchImpl(`${baseUrl}${resourcePath}`, {
        method,
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28"
        },
        body: body ? JSON.stringify(body) : undefined
      });
      const text = await response.text();
      const payload = parseJsonPayload(text);

      if (!response.ok) {
        throw new PublisherError(
          "github_api_error",
          `GitHub API ${method} ${resourcePath} 返回 HTTP ${response.status}。`,
          {
            status: response.status,
            message: payload.message || text || "unknown error"
          }
        );
      }

      return payload;
    }
  };
}

function parseJsonPayload(text) {
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

async function runGit(cwd, args, options = {}) {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 1024 * 1024
  });
  return options.trim === false ? stdout : stdout.trim();
}

async function assertGitDirectoryWritable(repoRoot, git, gitWritableCheck) {
  if (typeof gitWritableCheck === "function") {
    return gitWritableCheck(repoRoot, git);
  }

  if (typeof git.gitDir !== "function") {
    return {
      ok: true,
      git_dir: ""
    };
  }

  const gitDirRaw = await git.gitDir();
  const gitDir = path.resolve(repoRoot, gitDirRaw);
  const probePath = path.join(gitDir, `codex-publish-write-test-${process.pid}-${Date.now()}.tmp`);

  try {
    await fs.writeFile(probePath, "publish-write-check", { flag: "wx" });
    await fs.unlink(probePath);
  } catch (error) {
    try {
      await fs.unlink(probePath);
    } catch {
      // Best effort cleanup only; the original permission error is the useful signal.
    }

    throw new PublisherError(
      "git_not_writable",
      "当前环境不能写入 Git 元数据目录，真实发布无法创建 index.lock。",
      {
        gitDir,
        cause: error.message,
        remediation: "修复 .git 目录 ACL，或改用已授权的 GitHub API/CI 发布通道。"
      }
    );
  }

  return {
    ok: true,
    git_dir: path.relative(repoRoot, gitDir).split(path.sep).join(path.posix.sep) || gitDir
  };
}

function isDeferredPrepareBlocker(error) {
  return error instanceof PublisherError && ["git_not_writable", "remote_ahead"].includes(error.code);
}

function toPrepareBlocker(error) {
  return {
    code: error instanceof PublisherError ? error.code : "unexpected_error",
    message: error.message,
    details: error.details || {}
  };
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
