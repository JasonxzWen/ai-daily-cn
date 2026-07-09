import { execFile, spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";
import { DEFAULT_SITE } from "./config.js";
import { PublisherError } from "./errors.js";
import { canonicalReportUrl, reportRelativePaths } from "./paths.js";
import { classifyPublishQuality, requirePublishableQuality } from "./quality-status.js";
import { planGeneratedFiles, reportManagedAssetPaths } from "./site.js";
import { buildAutomationRevision } from "./automation-revision.js";
import { mergeCommandEnv, pnpmCommandText, pnpmInvocationForArgs } from "./process-runner.js";

const execFileAsync = promisify(execFile);
const SOURCE_STATUS_HISTORY_REPO_PATH = "reports-data/source-status-history.json";
const DEFAULT_GIT_COMMAND_TIMEOUT_MS = 2 * 60 * 1000;
const GIT_AUTH_COMMAND_TIMEOUT_MS = 10 * 1000;
const NON_INTERACTIVE_GIT_ENV = {
  GIT_TERMINAL_PROMPT: "0",
  GCM_INTERACTIVE: "Never"
};

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

  await refreshRemoteTracking(repoRoot, git, allowedBranch);
  const remote = await git.remoteStatus();
  if (remote.remoteAhead > 0) {
    throw new PublisherError("remote_ahead", `远端 ${remote.upstream} 领先 ${remote.remoteAhead} 个提交，不能继续发布。`, remote);
  }
  await requirePublishableReportDate(repoRoot, options.reportDate, {
    currentAutomationRevision: await resolveCurrentAutomationRevision(options, repoRoot)
  });

  const statusEntries = await expandedStatusEntries(repoRoot, parsePorcelain(await git.status()));
  const unrelated = statusEntries.filter((entry) => !isPublisherOwnedPath(entry.path));
  if (unrelated.length > 0) {
    throw new PublisherError("dirty_worktree", "工作树存在非发布器管理的未提交改动，发布预检已停止。", {
      status: unrelated.map((entry) => `${entry.code} ${entry.path}`)
    });
  }

  const gitWritable = await assertGitDirectoryWritable(repoRoot, git, options.gitWritableCheck);
  const pushTransport = await checkPushTransport(repoRoot, git, allowedBranch);

  return {
    mode: "preflight",
    repo_root: repoRoot,
    branch,
    allowed_branch: allowedBranch,
    remote,
    git_writable: gitWritable.ok,
    git_dir: gitWritable.git_dir,
    push_transport: pushTransport,
    current_dirty_files: statusEntries.map((entry) => entry.path).sort()
  };
}

export async function preparePublishWorktree(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || process.cwd());
  const allowedBranch = options.allowedBranch || DEFAULT_SITE.publishBranch;
  const git = options.git || createGitAdapter(repoRoot);

  const startingBranch = await git.branch();
  const statusEntries = await expandedStatusEntries(repoRoot, parsePorcelain(await git.status()));
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
    try {
      await git.checkout(allowedBranch);
      switchedBranch = true;
    } catch (error) {
      if (!isGitMetadataWriteFailure(error)) {
        throw error;
      }

      return prepareResultWithBlocker({
        repoRoot,
        startingBranch,
        currentBranch: branchAfterCommit,
        allowedBranch,
        statusEntries,
        commitMessage,
        commitOutput,
        switchedBranch,
        blocker: new PublisherError(
          "git_not_writable",
          `切换到发布分支失败，本机 Git 元数据不可写或无法创建 index.lock：${error.message}`,
          {
            branch: branchAfterCommit,
            allowedBranch,
            cause: error.message
          }
        )
      });
    }
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

export async function prepareCleanPublishWorktree(options = {}) {
  const launcherRepoRoot = path.resolve(options.repoRoot || process.cwd());
  const allowedBranch = options.allowedBranch || DEFAULT_SITE.publishBranch;
  const run = options.commandRunner || runExternalCommand;
  const remoteUrl =
    options.remoteUrl ||
    (await runGitCommand(launcherRepoRoot, ["remote", "get-url", "origin"], {
      run,
      errorCode: "git_remote_unavailable",
      errorMessage: "Unable to read origin remote URL from the launcher worktree."
    }));
  const worktreeDir = resolveCleanPublishWorktreeDir({
    launcherRepoRoot,
    allowedBranch,
    worktreeDir: options.worktreeDir
  });
  assertSafeCleanPublishWorktreeDir(launcherRepoRoot, worktreeDir, options.allowExternalWorktree);

  const remoteMainSha = await resolveRemoteBranchSha({
    launcherRepoRoot,
    remoteUrl,
    allowedBranch,
    run
  });
  const targetExists = await pathExists(worktreeDir);
  const targetIsGitCheckout = targetExists && (await pathExists(path.join(worktreeDir, ".git")));
  const cloneReferenceRoot =
    options.cloneReferenceRoot === false ? "" : path.resolve(options.cloneReferenceRoot || launcherRepoRoot);

  if (targetExists && !targetIsGitCheckout) {
    throw new PublisherError(
      "publish_worktree_invalid",
      "Clean publish worktree path exists but is not a git checkout.",
      { worktreeDir }
    );
  }

  if (!targetExists) {
    await fs.mkdir(path.dirname(worktreeDir), { recursive: true });
    const cloneArgs = ["clone"];
    if (cloneReferenceRoot) {
      cloneArgs.push("--reference-if-able", cloneReferenceRoot, "--dissociate");
    }
    cloneArgs.push("--branch", allowedBranch, "--single-branch", remoteUrl, worktreeDir);
    await runGitCommand(launcherRepoRoot, cloneArgs, {
      run,
      errorCode: "git_clone_unavailable",
      errorMessage: "Unable to clone the clean publish worktree.",
      timeoutMs: options.cloneTimeoutMs || 10 * 60 * 1000
    });
  } else {
    await runGitCommand(worktreeDir, ["fetch", "origin", allowedBranch, "--prune"], {
      run,
      errorCode: "git_fetch_unavailable",
      errorMessage: "Unable to fetch origin/main in the clean publish worktree.",
      timeoutMs: options.fetchTimeoutMs || 5 * 60 * 1000
    });
    await runGitCommand(worktreeDir, ["checkout", "-B", allowedBranch, `origin/${allowedBranch}`], {
      run,
      errorCode: "git_not_writable",
      errorMessage: "Unable to checkout origin/main in the clean publish worktree."
    });
    await runGitCommand(worktreeDir, ["reset", "--hard", `origin/${allowedBranch}`], {
      run,
      errorCode: "git_not_writable",
      errorMessage: "Unable to reset the clean publish worktree to origin/main."
    });
    await runGitCommand(worktreeDir, ["clean", "-fd"], {
      run,
      errorCode: "git_not_writable",
      errorMessage: "Unable to clean untracked files in the clean publish worktree."
    });
  }

  const branch = await runGitCommand(worktreeDir, ["rev-parse", "--abbrev-ref", "HEAD"], {
    run,
    errorCode: "git_not_writable",
    errorMessage: "Unable to read the clean publish worktree branch."
  });
  const headSha = await runGitCommand(worktreeDir, ["rev-parse", "HEAD"], {
    run,
    errorCode: "git_not_writable",
    errorMessage: "Unable to read the clean publish worktree HEAD."
  });

  if (branch !== allowedBranch || headSha !== remoteMainSha) {
    throw new PublisherError(
      "publish_worktree_not_at_remote_main",
      "Clean publish worktree is not checked out at the current remote main commit.",
      {
        branch,
        allowedBranch,
        headSha,
        remoteMainSha
      }
    );
  }

  const statusEntries = parsePorcelain(
    await runGitCommand(worktreeDir, ["status", "--porcelain"], {
      run,
      errorCode: "git_not_writable",
      errorMessage: "Unable to inspect the clean publish worktree status."
    })
  );
  if (statusEntries.length > 0) {
    throw new PublisherError(
      "publish_worktree_dirty",
      "Clean publish worktree still has local changes after reset and clean.",
      { status: statusEntries.map((entry) => `${entry.code} ${entry.path}`) }
    );
  }

  const dependencyStatus = await ensurePublishWorktreeDependencies(worktreeDir, {
    run,
    installDependencies: options.installDependencies !== false,
    forceInstall: Boolean(options.forceInstall),
    pnpmStoreDir: options.pnpmStoreDir,
    timeoutMs: options.installTimeoutMs || 10 * 60 * 1000
  });

  return {
    mode: "prepare-clean-worktree",
    launcher_repo_root: launcherRepoRoot,
    repo_root: worktreeDir,
    branch,
    allowed_branch: allowedBranch,
    remote_main_sha: remoteMainSha,
    remote_url: redactRemoteUrl(remoteUrl),
    cloned: !targetExists,
    clone_reference_root: !targetExists && cloneReferenceRoot ? cloneReferenceRoot : "",
    reset_to_remote: targetExists,
    clean: true,
    dependency_status: dependencyStatus,
    next_cwd: worktreeDir,
    next_steps: [
      `Set-Location ${quotePowerShellPath(worktreeDir)}`,
      "corepack pnpm run prompt:build -- YYYY-MM-DD",
      "corepack pnpm run publish:dry-run:daily -- --date YYYY-MM-DD"
    ]
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

  await refreshRemoteTracking(repoRoot, git, allowedBranch);
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

  const statusEntries = await expandedStatusEntries(repoRoot, parsePorcelain(await git.status()));
  const unrelated = statusEntries.filter((entry) => !isPublisherOwnedPath(entry.path));
  if (unrelated.length > 0) {
    throw new PublisherError("dirty_worktree", "工作树存在非发布器管理的未提交改动，dry-run 已停止。", {
      status: unrelated.map((entry) => `${entry.code} ${entry.path}`)
    });
  }

  const reports = options.reportDate
    ? generated.reports.filter((report) => report.report_date === options.reportDate)
    : generated.reports;
  if (reports.length === 0) {
    throw new PublisherError("no_reports", `未发现可发布的日报：${options.reportDate || "(any)"}`);
  }
  const currentAutomationRevision = await resolveCurrentAutomationRevision(options, repoRoot);
  for (const report of reports) {
    requirePublishableQuality(report, { rootDir: repoRoot, currentAutomationRevision });
  }

  const blockedReports = reports.filter((report) => report.quality_status?.status === "blocked");
  if (blockedReports.length > 0) {
    throw new PublisherError("report_quality_blocked", "日报质量状态为 blocked，dry-run 已停止。", {
      reports: blockedReports.map((report) => ({
        report_date: report.report_date,
        reasons: report.quality_status?.reasons || [],
        public_note: report.quality_status?.public_note || ""
      }))
    });
  }

  const dates = reports.map((report) => report.report_date).sort();
  const generatedRepoFiles = toRepoRelativeFiles(repoRoot, options.outDir || "docs", generated.files);
  const repoFiles = filterDocsForReportDate(
    generatedRepoFiles,
    options.outDir || "docs",
    options.reportDate,
    generated.reports
  );
  const dirtyGeneratedFiles = generatedPublisherDirtyFiles(statusEntries, generatedRepoFiles);
  const dirtyDateScopedEvidenceFiles = dateScopedEvidenceAssetDirtyFiles(
    statusEntries,
    options.outDir || "docs",
    options.reportDate
  );
  const stageFiles = uniqueSorted([
    ...repoFiles,
    ...dirtyGeneratedFiles,
    ...dirtyDateScopedEvidenceFiles,
    ...(await plannedReportsDataFiles(repoRoot, dates)),
    ...(await plannedRetrospectiveFiles(repoRoot, dates)),
    ...dirtyRetrospectiveFiles(statusEntries, dates)
  ]);
  assertDirtyPublisherFilesCovered(statusEntries, stageFiles);
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
    will_stage_files: stageFiles,
    current_dirty_files: statusEntries.map((entry) => entry.path).sort(),
    commit_message: commitMessage,
    expected_pages_url: reports.length === 1 ? reports[0].canonical_url : DEFAULT_SITE.siteUrl,
    reports: reports.map((report) => ({
      report_date: report.report_date,
      title: report.title,
      canonical_url: report.canonical_url,
      quality_status: report.quality_status?.status || "ok",
      degraded_sections: classifyPublishQuality(report, { rootDir: repoRoot, currentAutomationRevision }).degraded_sections
    }))
  };
}

export async function createDailyPublishPlan(options = {}) {
  const reportDate = requireDailyReportDate(options.reportDate);
  const plan = await createPublishPlan({
    ...options,
    reportDate
  });
  return {
    ...plan,
    mode: "daily-dry-run"
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

  await refreshRemoteTracking(repoRoot, git, branch);
  const remote = await git.remoteStatus();
  if (remote.remoteAhead > 0) {
    throw new PublisherError("remote_ahead", `远端 ${remote.upstream} 领先 ${remote.remoteAhead} 个提交，不能继续发布。`, remote);
  }

  const statusEntries = await expandedStatusEntries(repoRoot, parsePorcelain(await git.status()));
  const publishFiles = dirtyPublisherFilesForPublish(statusEntries, options.reportDate);
  const unrelated = statusEntries.filter((entry) => !isPublisherOwnedPath(entry.path));

  if (unrelated.length > 0) {
    throw new PublisherError("dirty_worktree", "工作树存在非发布器管理的未提交改动，已停止发布。", {
      status: unrelated.map((entry) => `${entry.code} ${entry.path}`)
    });
  }

  assertDirtyPublisherFilesCovered(statusEntries, publishFiles);

  if (publishFiles.length === 0) {
    return {
      mode: "publish",
      publish_mode: "git",
      branch,
      remote,
      repo_updated: false,
      committed: false,
      pushed: false,
      message: "没有发布产物变更需要提交。"
    };
  }

  await requirePublishableReportDate(repoRoot, options.reportDate, {
    currentAutomationRevision: await resolveCurrentAutomationRevision(options, repoRoot)
  });

  if (typeof git.gitDir === "function") {
    await assertGitDirectoryWritable(repoRoot, git, options.gitWritableCheck);
  }
  await checkPushTransport(repoRoot, git, branch);

  const commitMessage =
    options.commitMessage || `chore: publish AI daily report${options.reportDate ? ` ${options.reportDate}` : ""}`;
  await git.add(publishFiles);
  const commitOutput = await git.commit(commitMessage);
  const pagesUrl = options.reportDate ? canonicalReportUrl(DEFAULT_SITE.siteUrl, options.reportDate) : "";
  let pushOutput = "";
  try {
    pushOutput = await git.push(branch);
  } catch (error) {
    throw new PublisherError("git_push_failed", `发布提交已在本地创建，但推送到 origin/${branch} 失败：${error.message}`, {
      branch,
      repo_updated: true,
      repo_pushed: false,
      staged_files: publishFiles.sort(),
      commit_message: commitMessage,
      commit_output: commitOutput,
      pages_url: pagesUrl,
      cause: error.message,
      remediation: "修复 Git 远端 push 通道后运行 publish:resume-push，或使用 publish:github-api 兜底。"
    });
  }
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
    publish_mode: "git",
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
  const sourceBranch = await git.branch();

  const statusEntries = await expandedStatusEntries(repoRoot, parsePorcelain(await git.status()));
  const hasPublisherDirtyFiles = statusEntries.some((entry) => isPublisherOwnedPath(entry.path));
  const dirtyPublishFiles = dirtyPublisherFilesForPublish(statusEntries, options.reportDate);
  const unrelated = statusEntries.filter((entry) => !isPublisherOwnedPath(entry.path));

  if (unrelated.length > 0) {
    throw new PublisherError("dirty_worktree", "工作树存在非发布器管理的未提交改动，GitHub API 发布已停止。", {
      status: unrelated.map((entry) => `${entry.code} ${entry.path}`)
    });
  }
  await requirePublishableReportDate(repoRoot, options.reportDate, {
    currentAutomationRevision: await resolveCurrentAutomationRevision(options, repoRoot)
  });
  assertDirtyPublisherFilesCovered(statusEntries, dirtyPublishFiles);

  const publishFiles = uniqueSorted(
    hasPublisherDirtyFiles
      ? dirtyPublishFiles
      : await plannedPublisherFiles(repoRoot, options)
  );

  if (publishFiles.length === 0) {
    return {
      mode: "publish-github-api",
      publish_mode: "github-api-fallback",
      branch,
      source_branch: sourceBranch,
      committed: false,
      pushed: false,
      message: "没有发布产物变更需要提交。"
    };
  }

  const token = await resolveGitHubToken(options, repoRoot, git);
  if (!token) {
    throw new PublisherError(
      "github_token_missing",
      "GitHub API 发布需要 GH_TOKEN、GITHUB_TOKEN、可用的 gh auth token 或 Git credential helper 中的 GitHub token。"
    );
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
      publish_mode: "github-api-fallback",
      branch,
      source_branch: sourceBranch,
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
    publish_mode: "github-api-fallback",
    branch,
    source_branch: sourceBranch,
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

export async function resumePublishPush(options = {}) {
  if (!options.confirmPush) {
    throw new PublisherError(
      "publish_confirmation_required",
      "继续推送已存在的本地发布提交需要显式传入 --confirm-push。"
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

  const statusEntries = await expandedStatusEntries(repoRoot, parsePorcelain(await git.status()));
  if (statusEntries.length > 0) {
    throw new PublisherError("dirty_worktree", "工作树仍有未提交改动，不能直接续推已有发布提交。", {
      status: statusEntries.map((entry) => `${entry.code} ${entry.path}`)
    });
  }

  await refreshRemoteTracking(repoRoot, git, branch);
  const remote = await git.remoteStatus();
  if (remote.remoteAhead > 0) {
    throw new PublisherError("remote_ahead", `远端 ${remote.upstream} 领先 ${remote.remoteAhead} 个提交，不能继续推送。`, remote);
  }
  await requirePublishableReportDate(repoRoot, options.reportDate, {
    currentAutomationRevision: await resolveCurrentAutomationRevision(options, repoRoot)
  });
  if (remote.localAhead <= 0) {
    return {
      mode: "publish-resume-push",
      branch,
      remote,
      committed: false,
      pushed: false,
      pushed_existing_commits: false,
      message: "本地没有领先远端的提交需要继续推送。"
    };
  }

  await checkPushTransport(repoRoot, git, branch);
  const pagesUrl = options.reportDate ? canonicalReportUrl(DEFAULT_SITE.siteUrl, options.reportDate) : "";
  const pushOutput = await git.push(branch);
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
    mode: "publish-resume-push",
    branch,
    remote,
    repo_updated: true,
    committed: false,
    pushed: true,
    pushed_existing_commits: true,
    push_output: pushOutput,
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

async function checkPushTransport(repoRoot, git, branch) {
  const remoteUrl = typeof git.remoteUrl === "function" ? await git.remoteUrl() : "";
  if (typeof git.pushDryRun !== "function") {
    return {
      ok: true,
      checked: false,
      remote_url: remoteUrl,
      detail: "git adapter does not expose pushDryRun"
    };
  }

  try {
    const output = await git.pushDryRun(branch);
    return {
      ok: true,
      checked: true,
      remote_url: remoteUrl,
      output
    };
  } catch (error) {
    throw new PublisherError("git_push_unavailable", `Git 远端 push 通道不可用：${error.message}`, {
      branch,
      remoteUrl,
      cause: error.message,
      remediation: "修复 SSH/HTTPS 凭据或改用 GitHub API 兜底；不要等到日报提交后才发现 push 不可用。"
    });
  }
}

async function refreshRemoteTracking(repoRoot, git, branch) {
  if (typeof git.fetch !== "function") {
    return {
      ok: true,
      checked: false,
      detail: "git adapter does not expose fetch"
    };
  }

  try {
    const output = await git.fetch(branch);
    return {
      ok: true,
      checked: true,
      output
    };
  } catch (error) {
    throw new PublisherError("git_fetch_unavailable", `无法刷新远端 ${branch}：${error.message}`, {
      branch,
      cause: error.message,
      remediation: "修复网络或 Git 远端读取权限；不能用过期的 origin/main 判断发布安全性。"
    });
  }
}

function filterDocsForReportDate(files, outDir, reportDate, reports = []) {
  if (!reportDate) {
    return files;
  }

  const outPrefix = outDir.replaceAll("\\", "/").replace(/\/$/, "");
  const paths = reportRelativePaths(reportDate);
  const keep = new Set([
    `${outPrefix}/.nojekyll`,
    `${outPrefix}/articles.json`,
    `${outPrefix}/assets/style.css`,
    `${outPrefix}/feed.json`,
    `${outPrefix}/index.html`,
    `${outPrefix}/ops.html`,
    `${outPrefix}/trends.json`,
    `${outPrefix}/data/official-blogs.json`,
    `${outPrefix}/official-blogs/index.html`,
    `${outPrefix}/${paths.dataPath}`,
    `${outPrefix}/${paths.htmlPath}`
  ]);
  if (paths.markdownPath) {
    keep.add(`${outPrefix}/${paths.markdownPath}`);
  }
  const report = reports.find((item) => item.report_date === reportDate);
  for (const evidencePath of reportEvidenceAssetPaths(report)) {
    keep.add(`${outPrefix}/${evidencePath}`);
  }

  return files.filter((file) => keep.has(file));
}

async function plannedPublisherFiles(repoRoot, options = {}) {
  const generated = await planGeneratedFiles({
    rootDir: repoRoot,
    inputDir: options.inputDir || "reports-source",
    dataInputDir: options.dataInputDir || "reports-data",
    outDir: options.outDir || "docs",
    siteUrl: options.siteUrl || DEFAULT_SITE.siteUrl,
    generatedAt: options.generatedAt
  });
  const reports = options.reportDate
    ? generated.reports.filter((report) => report.report_date === options.reportDate)
    : generated.reports;
  const dates = reports.map((report) => report.report_date).sort();
  const docsFiles = filterDocsForReportDate(
    toRepoRelativeFiles(repoRoot, options.outDir || "docs", generated.files),
    options.outDir || "docs",
    options.reportDate,
    generated.reports
  );
  const candidates = uniqueSorted([
    ...docsFiles,
    ...(await plannedReportsDataFiles(repoRoot, dates)),
    ...(await plannedRetrospectiveFiles(repoRoot, dates))
  ]);
  const existing = [];
  for (const file of candidates) {
    if (await exists(path.join(repoRoot, ...file.split("/")))) {
      existing.push(file);
    }
  }
  return existing;
}

function requireDailyReportDate(reportDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(reportDate || ""))) {
    throw new PublisherError(
      "daily_report_date_required",
      "publish:dry-run:daily requires an explicit --date YYYY-MM-DD."
    );
  }
  return reportDate;
}

async function requirePublishableReportDate(repoRoot, reportDate, qualityOptions = {}) {
  if (!reportDate) {
    return;
  }

  const [year, month] = reportDate.split("-");
  const reportPath = path.join(repoRoot, "reports-data", year, month, `${reportDate}.json`);
  try {
    const report = JSON.parse(await fs.readFile(reportPath, "utf8"));
    requirePublishableQuality(report, { rootDir: repoRoot, ...qualityOptions });
  } catch (error) {
    if (error.code === "ENOENT") {
      return;
    }
    throw error;
  }
}

async function resolveCurrentAutomationRevision(options, repoRoot) {
  return options.currentAutomationRevision || buildAutomationRevision({ rootDir: repoRoot });
}

async function plannedReportsDataFiles(repoRoot, dates) {
  const files = [];
  if (await exists(path.join(repoRoot, ...SOURCE_STATUS_HISTORY_REPO_PATH.split("/")))) {
    files.push(SOURCE_STATUS_HISTORY_REPO_PATH);
  }
  for (const date of dates) {
    const [year, month] = date.split("-");
    const base = `reports-data/${year}/${month}/${date}`;
    for (const file of [`${base}.json`, `${base}.candidates.json`]) {
      if (await exists(path.join(repoRoot, ...file.split("/")))) {
        files.push(file);
      }
    }
  }
  return uniqueSorted(files);
}

async function plannedRetrospectiveFiles(repoRoot, dates) {
  const files = [];
  if (await exists(path.join(repoRoot, "retrospectives", "index.json"))) {
    files.push("retrospectives/index.json");
  }
  for (const date of dates) {
    const [year, month] = date.split("-");
    const dir = path.join(repoRoot, "retrospectives", year, month);
    let entries = [];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }
      const repoPath = `retrospectives/${year}/${month}/${entry.name}`;
      if (isPublishRetrospectiveRecordPath(repoPath) && entry.name.startsWith(`${date}.`)) {
        files.push(repoPath);
      }
    }
  }
  return uniqueSorted(files);
}

function dirtyRetrospectiveFiles(statusEntries, dates) {
  const dateSet = new Set(dates);
  return statusEntries
    .map((entry) => entry.path)
    .filter((file) => file === "retrospectives/index.json" || isPublishRetrospectiveRecordPath(file))
    .filter((file) => {
      if (file === "retrospectives/index.json") {
        return true;
      }
      const date = path.posix.basename(file).split(".")[0];
      return dateSet.has(date);
    });
}

async function expandedStatusEntries(repoRoot, statusEntries) {
  const expanded = [];
  for (const entry of statusEntries) {
    if (entry.code !== "??" || !entry.path.endsWith("/")) {
      expanded.push(entry);
      continue;
    }
    const files = await listUntrackedDirectoryFiles(repoRoot, entry.path);
    if (files.length === 0) {
      expanded.push(entry);
      continue;
    }
    expanded.push(...files.map((filePath) => ({ ...entry, path: filePath })));
  }
  return expanded;
}

async function listUntrackedDirectoryFiles(repoRoot, repoDir) {
  const absoluteDir = path.join(repoRoot, ...repoDir.replace(/\/+$/, "").split("/"));
  const files = [];
  async function visit(currentDir) {
    let entries = [];
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") {
        return;
      }
      throw error;
    }
    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await visit(absolutePath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      files.push(path.relative(repoRoot, absolutePath).replaceAll("\\", "/"));
    }
  }
  await visit(absoluteDir);
  return uniqueSorted(files);
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function createGitAdapter(repoRoot) {
  return {
    async status() {
      return runGit(repoRoot, ["status", "--porcelain=v1", "-uall"], { trim: false });
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
    async fetch(branch) {
      return runGit(repoRoot, ["fetch", "origin", branch, "--prune"], { trim: false });
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
    async pushDryRun(branch) {
      return runGit(repoRoot, ["push", "--dry-run", "origin", branch], { trim: false });
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

export function isGitHubApiFallbackEligibleError(error) {
  return (
    error instanceof PublisherError &&
    ["git_not_writable", "git_fetch_unavailable", "git_push_unavailable"].includes(error.code)
  );
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
    filePath === "docs/articles.json" ||
    filePath === "docs/feed.json" ||
    filePath === "docs/index.html" ||
    filePath === "docs/ops.html" ||
    filePath === "docs/trends.json" ||
    filePath === "retrospectives/index.json" ||
    isPublishRetrospectiveRecordPath(filePath) ||
    filePath.startsWith("docs/assets/") ||
    filePath.startsWith("docs/data/") ||
    filePath.startsWith("docs/reports/") ||
    filePath.startsWith("reports-data/")
  );
}

function isPublishRetrospectiveRecordPath(filePath) {
  return /^retrospectives\/\d{4}\/\d{2}\/\d{4}-\d{2}-\d{2}\.(?:daily_publish|rollup)\.[a-z0-9][a-z0-9-]*\.json$/.test(String(filePath || ""));
}

function dirtyPublisherFilesForPublish(statusEntries, reportDate) {
  const files = statusEntries
    .map((entry) => entry.path)
    .filter((file) => isPublisherOwnedPath(file));
  if (!reportDate) {
    return uniqueSorted(files);
  }
  return uniqueSorted(files.filter((file) => isPublishFileForReportDate(file, reportDate)));
}

function isPublishFileForReportDate(filePath, reportDate) {
  if (filePath === "retrospectives/index.json") {
    return true;
  }
  if (isPublishRetrospectiveRecordPath(filePath)) {
    return path.posix.basename(filePath).split(".")[0] === reportDate;
  }
  return true;
}

function reportEvidenceAssetPaths(report) {
  return reportManagedAssetPaths(report);
}

function assertDirtyPublisherFilesCovered(statusEntries, stageFiles) {
  const planned = new Set(stageFiles);
  const uncovered = statusEntries
    .map((entry) => entry.path)
    .filter((file) => isPublisherOwnedPath(file))
    .filter((file) => !planned.has(file));
  if (uncovered.length > 0) {
    throw new PublisherError(
      "publisher_dirty_outside_publish_plan",
      "发布器管理的脏文件未出现在本次 dry-run stage 计划中，已停止发布预演。",
      {
        files: uniqueSorted(uncovered),
        remediation: "重新构建本日报，确认 evidence/trends/feed/data/report 输出都进入 will_stage_files；清理或归档与本次日期无关的悬空发布产物。"
      }
    );
  }
}

function generatedPublisherDirtyFiles(statusEntries, generatedRepoFiles) {
  const generated = new Set(generatedRepoFiles);
  return statusEntries
    .map((entry) => entry.path)
    .filter((file) => isPublisherOwnedPath(file))
    .filter((file) => generated.has(file));
}

function dateScopedEvidenceAssetDirtyFiles(statusEntries, outDir, reportDate) {
  if (!reportDate) {
    return [];
  }
  const outPrefix = outDir.replaceAll("\\", "/").replace(/\/$/, "");
  const evidencePrefix = `${outPrefix}/assets/evidence/`;
  return statusEntries
    .map((entry) => entry.path)
    .filter((file) => file.startsWith(evidencePrefix))
    .filter((file) => path.posix.basename(file).includes(reportDate))
    .filter((file) => /\.(?:png|jpe?g|webp|gif|avif)$/i.test(file));
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
    env: mergeCommandEnv(NON_INTERACTIVE_GIT_ENV, { baseEnv: options.env || process.env }),
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    timeout: options.timeoutMs || DEFAULT_GIT_COMMAND_TIMEOUT_MS,
    windowsHide: true
  });
  return options.trim === false ? stdout : stdout.trim();
}

async function runExternalCommand(file, args, options = {}) {
  if (Object.prototype.hasOwnProperty.call(options, "input")) {
    return runExternalCommandWithInput(file, args, options);
  }

  const { stdout } = await execFileAsync(file, args, {
    cwd: options.cwd,
    env: mergeCommandEnv(options.env),
    encoding: "utf8",
    maxBuffer: options.maxBuffer || 10 * 1024 * 1024,
    timeout: options.timeoutMs,
    windowsHide: true
  });
  return options.trim === false ? stdout : stdout.trim();
}

async function runExternalCommandWithInput(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      cwd: options.cwd,
      env: mergeCommandEnv(options.env),
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"]
    });
    const maxBuffer = options.maxBuffer || 10 * 1024 * 1024;
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (error, value) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timer) {
        clearTimeout(timer);
      }
      if (error) {
        reject(error);
      } else {
        resolve(options.trim === false ? value : value.trim());
      }
    };
    const timer = options.timeoutMs
      ? setTimeout(() => {
          child.kill();
          const error = new Error(`Command timed out after ${options.timeoutMs}ms: ${file} ${args.join(" ")}`);
          error.code = "ETIMEDOUT";
          error.stdout = stdout;
          error.stderr = stderr;
          finish(error);
        }, options.timeoutMs)
      : null;

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (stdout.length + stderr.length > maxBuffer) {
        const error = new Error(`Command output exceeded maxBuffer: ${file} ${args.join(" ")}`);
        error.code = "ERR_CHILD_PROCESS_STDIO_MAXBUFFER";
        error.stdout = stdout;
        error.stderr = stderr;
        child.kill();
        finish(error);
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      if (stdout.length + stderr.length > maxBuffer) {
        const error = new Error(`Command output exceeded maxBuffer: ${file} ${args.join(" ")}`);
        error.code = "ERR_CHILD_PROCESS_STDIO_MAXBUFFER";
        error.stdout = stdout;
        error.stderr = stderr;
        child.kill();
        finish(error);
      }
    });
    child.on("error", (error) => {
      error.stdout = stdout;
      error.stderr = stderr;
      finish(error);
    });
    child.on("close", (code) => {
      if (settled) {
        return;
      }
      if (code !== 0) {
        const error = new Error(`Command failed with exit code ${code}: ${file} ${args.join(" ")}`);
        error.code = code;
        error.stdout = stdout;
        error.stderr = stderr;
        finish(error);
        return;
      }
      finish(null, stdout);
    });
    child.stdin.end(options.input);
  });
}

async function runGitCommand(cwd, args, options = {}) {
  try {
    return await options.run("git", args, {
      cwd,
      timeoutMs: options.timeoutMs,
      trim: options.trim
    });
  } catch (error) {
    throw new PublisherError(options.errorCode || "git_command_failed", options.errorMessage || error.message, {
      cwd,
      args,
      cause: error.message
    });
  }
}

async function resolveRemoteBranchSha(options) {
  const output = await runGitCommand(
    options.launcherRepoRoot,
    ["ls-remote", options.remoteUrl, `refs/heads/${options.allowedBranch}`],
    {
      run: options.run,
      errorCode: "git_fetch_unavailable",
      errorMessage: "Unable to read the current remote main commit.",
      timeoutMs: options.timeoutMs || 2 * 60 * 1000
    }
  );
  const [sha] = output.trim().split(/\s+/);
  if (!/^[0-9a-f]{40}$/i.test(sha || "")) {
    throw new PublisherError("remote_main_unavailable", "Remote main did not return a valid commit SHA.", {
      allowedBranch: options.allowedBranch,
      output
    });
  }
  return sha;
}

function resolveCleanPublishWorktreeDir(options) {
  if (options.worktreeDir) {
    return path.resolve(options.worktreeDir);
  }
  if (process.env.AI_DAILY_PUBLISH_WORKTREE) {
    return path.resolve(process.env.AI_DAILY_PUBLISH_WORKTREE);
  }
  return path.join(
    options.launcherRepoRoot,
    ".tmp",
    "publish-worktrees",
    sanitizePathSegment(options.allowedBranch)
  );
}

function assertSafeCleanPublishWorktreeDir(launcherRepoRoot, worktreeDir, allowExternalWorktree) {
  if (worktreeDir === launcherRepoRoot) {
    throw new PublisherError("publish_worktree_invalid", "Clean publish worktree cannot be the launcher worktree.", {
      launcherRepoRoot,
      worktreeDir
    });
  }

  if (allowExternalWorktree) {
    return;
  }

  const relative = path.relative(launcherRepoRoot, worktreeDir);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new PublisherError(
      "publish_worktree_outside_repo",
      "Clean publish worktree must be under the launcher repo unless --allow-external-worktree is set.",
      { launcherRepoRoot, worktreeDir }
    );
  }

  const parts = relative.split(path.sep);
  if (!parts.includes(".tmp")) {
    throw new PublisherError(
      "publish_worktree_outside_tmp",
      "Clean publish worktree must live under .tmp unless --allow-external-worktree is set.",
      { launcherRepoRoot, worktreeDir }
    );
  }
}

async function ensurePublishWorktreeDependencies(repoRoot, options = {}) {
  if (!(await pathExists(path.join(repoRoot, "package.json")))) {
    return {
      required: false,
      installed: false,
      ok: true
    };
  }

  const nodeModulesPath = path.join(repoRoot, "node_modules");
  if (!options.forceInstall && (await pathExists(nodeModulesPath))) {
    return {
      required: true,
      installed: false,
      ok: true,
      reason: "node_modules_present"
    };
  }

  if (!options.installDependencies) {
    return {
      required: true,
      installed: false,
      ok: false,
      reason: "node_modules_missing",
      command: "corepack pnpm install --frozen-lockfile"
    };
  }

  const pnpmStoreDir = options.pnpmStoreDir || process.env.PNPM_STORE_DIR || process.env.pnpm_store_dir || "";
  const pnpmArgs = ["install", "--frozen-lockfile"];
  const pnpmEnv = {};
  if (pnpmStoreDir) {
    pnpmArgs.push("--store-dir", pnpmStoreDir);
    pnpmEnv.PNPM_STORE_DIR = pnpmStoreDir;
  }
  const pnpmCommand = pnpmCommandText(pnpmArgs);
  const pnpmInvocation = pnpmInvocationForArgs(pnpmArgs);

  try {
    await options.run(pnpmInvocation.file, pnpmInvocation.args, {
      cwd: repoRoot,
      env: pnpmEnv,
      timeoutMs: options.timeoutMs,
      trim: false
    });
  } catch (error) {
    throw new PublisherError("dependency_install_failed", "Unable to install dependencies in the clean publish worktree.", {
      repoRoot,
      command: pnpmCommand,
      pnpm_store_dir: pnpmStoreDir || null,
      cause: error.message
    });
  }

  return {
    required: true,
    installed: true,
    ok: true,
    command: pnpmCommand,
    pnpm_store_dir: pnpmStoreDir || null
  };
}

async function pathExists(filePath) {
  try {
    await fs.stat(filePath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function sanitizePathSegment(value) {
  return String(value || "main").replace(/[^a-z0-9._-]+/gi, "-");
}

function quotePowerShellPath(filePath) {
  return `'${filePath.replaceAll("'", "''")}'`;
}

function redactRemoteUrl(remoteUrl) {
  try {
    const parsed = new URL(remoteUrl);
    parsed.username = parsed.username ? "REDACTED" : "";
    parsed.password = parsed.password ? "REDACTED" : "";
    return parsed.toString();
  } catch {
    return remoteUrl;
  }
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
  return (
    error instanceof PublisherError &&
    ["git_not_writable", "git_fetch_unavailable", "git_push_unavailable", "remote_ahead"].includes(error.code)
  );
}

function isGitMetadataWriteFailure(error) {
  if (error instanceof PublisherError && error.code === "git_not_writable") {
    return true;
  }
  const message = String(error?.message || "");
  return /index\.lock|permission denied|cannot lock ref|unable to create/i.test(message);
}

function prepareResultWithBlocker(options) {
  const blocker = toPrepareBlocker(options.blocker);
  return {
    mode: "prepare-worktree",
    repo_root: options.repoRoot,
    starting_branch: options.startingBranch,
    current_branch: options.currentBranch,
    allowed_branch: options.allowedBranch,
    committed_local_changes: options.statusEntries.length > 0,
    commit_message: options.statusEntries.length > 0 ? options.commitMessage : "",
    commit_output: options.commitOutput,
    saved_dirty_files: options.statusEntries.map((entry) => `${entry.code} ${entry.path}`),
    switched_branch: options.switchedBranch,
    publish_ready: false,
    publish_blocker: blocker,
    preflight: null
  };
}

function toPrepareBlocker(error) {
  return {
    code: error instanceof PublisherError ? error.code : "unexpected_error",
    message: error.message,
    details: error.details || {}
  };
}

async function resolveGitHubToken(options, repoRoot, git) {
  const env = options.env || process.env;
  if (options.token) {
    return options.token;
  }
  const ghToken = envValue(env, "GH_TOKEN");
  if (ghToken) {
    return ghToken;
  }
  const githubToken = envValue(env, "GITHUB_TOKEN");
  if (githubToken) {
    return githubToken;
  }
  if (typeof options.tokenResolver === "function") {
    return String((await options.tokenResolver()) || "").trim();
  }

  const run = options.commandRunner || runExternalCommand;
  const authCommandEnv = mergeCommandEnv(NON_INTERACTIVE_GIT_ENV, { baseEnv: env });
  try {
    const stdout = await run("gh", ["auth", "token"], {
      cwd: repoRoot,
      env: authCommandEnv,
      timeoutMs: GIT_AUTH_COMMAND_TIMEOUT_MS
    });
    const token = String(stdout || "").trim();
    if (token) {
      return token;
    }
  } catch {
    // Fall through to Git's credential helper. This keeps scheduled publishes
    // recoverable when the GitHub CLI config file is unreadable.
  }

  const remoteUrl =
    options.remoteUrl ||
    (typeof git?.remoteUrl === "function" ? await git.remoteUrl().catch(() => "") : "");
  return resolveGitCredentialToken({ repoRoot, remoteUrl, run, env: authCommandEnv });
}

function envValue(env, key) {
  if (!env) {
    return "";
  }
  if (Object.prototype.hasOwnProperty.call(env, key)) {
    return String(env[key] || "").trim();
  }
  const matchingKey = Object.keys(env).find((candidate) => candidate.toLowerCase() === key.toLowerCase());
  return matchingKey ? String(env[matchingKey] || "").trim() : "";
}

async function resolveGitCredentialToken({ repoRoot, remoteUrl, run, env }) {
  if (!isGitHubRemoteUrl(remoteUrl)) {
    return "";
  }

  try {
    const stdout = await run("git", ["credential", "fill"], {
      cwd: repoRoot,
      env,
      input: "protocol=https\nhost=github.com\n\n",
      timeoutMs: GIT_AUTH_COMMAND_TIMEOUT_MS,
      trim: false
    });
    return parseGitCredentialToken(stdout);
  } catch {
    return "";
  }
}

function isGitHubRemoteUrl(remoteUrl) {
  return /(^|[@/:])github\.com[:/]/i.test(String(remoteUrl || ""));
}

function parseGitCredentialToken(output) {
  const fields = new Map();
  for (const line of String(output || "").split(/\r?\n/)) {
    const match = /^([^=]+)=(.*)$/.exec(line);
    if (match) {
      fields.set(match[1], match[2]);
    }
  }
  return String(fields.get("password") || fields.get("oauth_token") || "").trim();
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
