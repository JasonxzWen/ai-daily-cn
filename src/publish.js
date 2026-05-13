import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { DEFAULT_SITE } from "./config.js";
import { PublisherError } from "./errors.js";
import { planGeneratedFiles } from "./site.js";

const execFileAsync = promisify(execFile);

export async function createPublishPlan(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || process.cwd());
  const allowedBranch = options.allowedBranch || DEFAULT_SITE.publishBranch;
  const git = options.git || createGitAdapter(repoRoot);

  const status = await git.status();
  if (status.trim()) {
    throw new PublisherError("dirty_worktree", "工作树存在未提交改动，dry-run 已停止。", {
      status: status.trim().split(/\r?\n/)
    });
  }

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

  const commitMessage =
    options.commitMessage || `chore: publish AI daily report${options.reportDate ? ` ${options.reportDate}` : ""}`;
  await git.add(publishFiles);
  const commitOutput = await git.commit(commitMessage);
  const pushOutput = await git.push(branch);

  return {
    mode: "publish",
    branch,
    remote,
    committed: true,
    pushed: true,
    staged_files: publishFiles.sort(),
    commit_message: commitMessage,
    commit_output: commitOutput,
    push_output: pushOutput
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
      return runGit(repoRoot, ["status", "--porcelain=v1"]);
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
    async add(files) {
      return runGit(repoRoot, ["add", "--", ...files]);
    },
    async commit(message) {
      return runGit(repoRoot, ["commit", "-m", message]);
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
      const code = line.slice(0, 2);
      let filePath = line.slice(3).trim();
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

async function runGit(cwd, args) {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 1024 * 1024
  });
  return stdout.trim();
}
