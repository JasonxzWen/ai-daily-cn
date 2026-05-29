import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PublisherError } from "../src/errors.js";
import {
  checkPublishPreflight,
  createPublishPlan,
  parsePorcelain,
  preparePublishWorktree,
  publishGeneratedArtifactsViaGitHubApi,
  publishGeneratedArtifacts,
  resumePublishPush,
  verifyPublishedUrl
} from "../src/publish.js";
import { buildSite } from "../src/site.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const fixedGeneratedAt = "2026-05-13T02:35:00+08:00";

test("publish dry-run 在干净工作树输出发布计划", async () => {
  const repoRoot = await tempRepoWithFixture();
  const plan = await createPublishPlan({
    repoRoot,
    inputDir: "reports-source",
    dataInputDir: "reports-data",
    outDir: "docs",
    generatedAt: fixedGeneratedAt,
    git: fakeGit()
  });

  assert.equal(plan.mode, "dry-run");
  assert.equal(plan.branch, "main");
  assert.equal(plan.commit_message, "chore: publish AI daily report 2026-05-13");
  assert.equal(plan.expected_pages_url, "https://jasonxzwen.github.io/ai-daily-cn/reports/2026/05/2026-05-13.html");
  assert(plan.will_write_files.includes("docs/reports/2026/05/2026-05-13.html"));
  assert(plan.will_stage_files.includes("docs/feed.json"));
});

test("publish dry-run 允许仅包含发布产物的 dirty worktree", async () => {
  const repoRoot = await tempRepoWithFixture();
  const plan = await createPublishPlan({
    repoRoot,
    inputDir: "reports-source",
    dataInputDir: "reports-data",
    generatedAt: fixedGeneratedAt,
    git: fakeGit({ status: " M docs/index.html\n?? reports-data/2026/05/2026-05-13.json" })
  });

  assert.deepEqual(plan.current_dirty_files, ["docs/index.html", "reports-data/2026/05/2026-05-13.json"]);
  assert(plan.will_stage_files.includes("docs/index.html"));
});

test("publish dry-run 遇到非发布器管理改动时停止", async () => {
  const repoRoot = await tempRepoWithFixture();
  await assert.rejects(
    createPublishPlan({
      repoRoot,
      inputDir: "reports-source",
      dataInputDir: "reports-data",
      generatedAt: fixedGeneratedAt,
      git: fakeGit({ status: " M src/cli.js\n M docs/index.html" })
    }),
    (error) => error instanceof PublisherError && error.code === "dirty_worktree"
  );
});

test("publish dry-run 遇到 wrong branch 停止", async () => {
  const repoRoot = await tempRepoWithFixture();
  await assert.rejects(
    createPublishPlan({
      repoRoot,
      inputDir: "reports-source",
      dataInputDir: "reports-data",
      generatedAt: fixedGeneratedAt,
      git: fakeGit({ branch: "feature/test" })
    }),
    (error) => error instanceof PublisherError && error.code === "wrong_branch"
  );
});

test("publish dry-run 遇到 remote ahead 停止", async () => {
  const repoRoot = await tempRepoWithFixture();
  await assert.rejects(
    createPublishPlan({
      repoRoot,
      inputDir: "reports-source",
      dataInputDir: "reports-data",
      generatedAt: fixedGeneratedAt,
      git: fakeGit({ remoteAhead: 1 })
    }),
    (error) => error instanceof PublisherError && error.code === "remote_ahead"
  );
});

test("publish preflight 检查分支、远端、工作树和 git 写权限", async () => {
  const result = await checkPublishPreflight({
    git: fakeGit({ status: " M docs/index.html", pushDryRunOutput: "dry-run ok" }),
    gitWritableCheck: async () => ({ ok: true, git_dir: ".git" })
  });

  assert.equal(result.mode, "preflight");
  assert.equal(result.git_writable, true);
  assert.equal(result.push_transport.ok, true);
  assert.deepEqual(result.current_dirty_files, ["docs/index.html"]);
});

test("publish preflight fails early when push transport is unavailable", async () => {
  await assert.rejects(
    checkPublishPreflight({
      git: fakeGit({
        pushDryRunError: new Error("ssh: connect to host github.com port 22: Permission denied")
      }),
      gitWritableCheck: async () => ({ ok: true, git_dir: ".git" })
    }),
    (error) => error instanceof PublisherError && error.code === "git_push_unavailable"
  );
});

test("publish preflight fails early when remote tracking cannot be refreshed", async () => {
  await assert.rejects(
    checkPublishPreflight({
      git: fakeGit({
        fetchError: new Error("fatal: unable to access remote")
      }),
      gitWritableCheck: async () => ({ ok: true, git_dir: ".git" })
    }),
    (error) => error instanceof PublisherError && error.code === "git_fetch_unavailable"
  );
});

test("publish preflight 在 git 元数据不可写时停止", async () => {
  await assert.rejects(
    checkPublishPreflight({
      git: fakeGit({ status: " M docs/index.html" }),
      gitWritableCheck: async () => {
        throw new PublisherError("git_not_writable", "当前环境不能写入 Git 元数据目录，真实发布无法创建 index.lock。");
      }
    }),
    (error) => error instanceof PublisherError && error.code === "git_not_writable"
  );
});

test("publish prepare-worktree defers git_not_writable so report generation can continue", async () => {
  const result = await preparePublishWorktree({
    git: fakeGit(),
    gitWritableCheck: async () => {
      throw new PublisherError("git_not_writable", "当前环境不能写入 Git 元数据目录，真实发布无法创建 index.lock。", {
        gitDir: "D:\\ai-daily-cn\\.git"
      });
    }
  });

  assert.equal(result.publish_ready, false);
  assert.equal(result.publish_blocker.code, "git_not_writable");
  assert.equal(result.publish_blocker.details.gitDir, "D:\\ai-daily-cn\\.git");
  assert.equal(result.preflight, null);
  assert.equal(result.current_branch, "main");
});

test("publish prepare-worktree defers git push transport failures so report generation can continue", async () => {
  const result = await preparePublishWorktree({
    git: fakeGit({
      pushDryRunError: new Error("ssh: connect to host github.com port 22: Permission denied")
    }),
    gitWritableCheck: async () => ({ ok: true, git_dir: ".git" })
  });

  assert.equal(result.publish_ready, false);
  assert.equal(result.publish_blocker.code, "git_push_unavailable");
  assert.match(result.publish_blocker.details.cause, /Permission denied/);
});

test("publish prepare-worktree defers checkout index.lock failure so generation can continue", async () => {
  let branch = "codex/discovery-fallbacks";

  const result = await preparePublishWorktree({
    git: {
      async status() {
        return "";
      },
      async branch() {
        return branch;
      },
      async checkout() {
        throw new Error("fatal: Unable to create 'D:/repo/.git/index.lock': Permission denied");
      }
    }
  });

  assert.equal(result.publish_ready, false);
  assert.equal(result.publish_blocker.code, "git_not_writable");
  assert.match(result.publish_blocker.message, /index\.lock/);
  assert.equal(result.current_branch, "codex/discovery-fallbacks");
  assert.equal(result.switched_branch, false);
});

test("publish prepare-worktree 先提交本地改动再切回发布分支", async () => {
  const calls = [];
  let branch = "feature/report-sections";
  let status = " M src/cli.js\n?? notes.md";

  const result = await preparePublishWorktree({
    commitMessage: "chore: save local changes before daily report",
    git: {
      async status() {
        return status;
      },
      async branch() {
        return branch;
      },
      async remoteStatus() {
        return {
          status: "ok",
          upstream: "origin/main",
          localAhead: 0,
          remoteAhead: 0
        };
      },
      async addAll() {
        calls.push({ name: "addAll" });
      },
      async commit(message) {
        calls.push({ name: "commit", message });
        status = "";
        return "[feature/report-sections abc123] save";
      },
      async checkout(targetBranch) {
        calls.push({ name: "checkout", branch: targetBranch });
        branch = targetBranch;
      }
    }
  });

  assert.equal(result.committed_local_changes, true);
  assert.equal(result.switched_branch, true);
  assert.equal(result.current_branch, "main");
  assert.deepEqual(calls.map((call) => call.name), ["addAll", "commit", "checkout"]);
});

test("publish 需要显式确认参数", async () => {
  await assert.rejects(
    publishGeneratedArtifacts({ git: fakeGit({ status: " M docs/index.html" }) }),
    (error) => error instanceof PublisherError && error.code === "publish_confirmation_required"
  );
});

test("github api publish 需要显式确认参数", async () => {
  await assert.rejects(
    publishGeneratedArtifactsViaGitHubApi({ git: fakeGit({ status: " M docs/index.html" }) }),
    (error) => error instanceof PublisherError && error.code === "publish_confirmation_required"
  );
});

test("github api publish 通过远端 API 提交发布产物且不写本机 git 元数据", async () => {
  const repoRoot = await tempRepoWithFixture();
  await fs.mkdir(path.join(repoRoot, "docs"), { recursive: true });
  await fs.writeFile(path.join(repoRoot, "docs/index.html"), "<!doctype html><title>AI 日报 2026-05-13</title>");

  const calls = [];
  const result = await publishGeneratedArtifactsViaGitHubApi({
    repoRoot,
    confirmPush: true,
    reportDate: "2026-05-13",
    token: "test-token",
    repository: "owner/repo",
    verifyPages: true,
    verificationAttempts: 1,
    verificationIntervalMs: 0,
    git: fakeGit({ status: " M docs/index.html" }),
    fetchImpl: fakeGitHubFetch({ calls })
  });

  assert.equal(result.committed, true);
  assert.equal(result.pushed, true);
  assert.equal(result.commit_sha, "commit-new");
  assert.deepEqual(result.published_files, ["docs/index.html"]);
  assert.equal(result.pages_verified, true);
  assert.equal(calls.find((call) => call.method === "PATCH").body.force, false);
  assert.equal(
    calls.find((call) => call.url.endsWith("/git/trees")).body.tree[0].content,
    "<!doctype html><title>AI 日报 2026-05-13</title>"
  );
});

test("github api publish 允许从非 main 工作树发布到远端 main", async () => {
  const repoRoot = await tempRepoWithFixture();
  await fs.mkdir(path.join(repoRoot, "docs"), { recursive: true });
  await fs.writeFile(path.join(repoRoot, "docs/index.html"), "<!doctype html><title>AI 日报 2026-05-13</title>");

  const calls = [];
  const result = await publishGeneratedArtifactsViaGitHubApi({
    repoRoot,
    confirmPush: true,
    reportDate: "2026-05-13",
    token: "test-token",
    repository: "owner/repo",
    verifyPages: false,
    git: fakeGit({ branch: "codex/discovery-fallbacks", status: " M docs/index.html" }),
    fetchImpl: fakeGitHubFetch({ calls })
  });

  assert.equal(result.branch, "main");
  assert.equal(result.source_branch, "codex/discovery-fallbacks");
  assert.equal(result.committed, true);
  assert.equal(calls.find((call) => call.method === "PATCH").body.force, false);
});

test("github api publish 可从 token resolver 读取凭据", async () => {
  const repoRoot = await tempRepoWithFixture();
  await fs.mkdir(path.join(repoRoot, "docs"), { recursive: true });
  await fs.writeFile(path.join(repoRoot, "docs/index.html"), "<!doctype html><title>AI 日报 2026-05-13</title>");

  const result = await publishGeneratedArtifactsViaGitHubApi({
    repoRoot,
    confirmPush: true,
    repository: "owner/repo",
    verifyPages: false,
    tokenResolver: async () => "resolved-token",
    git: fakeGit({ status: " M docs/index.html" }),
    fetchImpl: fakeGitHubFetch()
  });

  assert.equal(result.committed, true);
  assert.equal(result.pushed, true);
});

test("github api publish 跳过远端已一致的发布产物", async () => {
  const repoRoot = await tempRepoWithFixture();
  await fs.mkdir(path.join(repoRoot, "docs"), { recursive: true });
  const content = "<!doctype html><title>same</title>";
  await fs.writeFile(path.join(repoRoot, "docs/index.html"), content);

  const calls = [];
  const result = await publishGeneratedArtifactsViaGitHubApi({
    repoRoot,
    confirmPush: true,
    token: "test-token",
    repository: "owner/repo",
    verifyPages: false,
    git: fakeGit({ status: " M docs/index.html" }),
    fetchImpl: fakeGitHubFetch({
      calls,
      remoteTree: [{ path: "docs/index.html", type: "blob", sha: gitBlobSha(content) }]
    })
  });

  assert.equal(result.committed, false);
  assert.equal(result.pushed, false);
  assert.equal(result.message, "远端已经包含相同发布产物，没有需要提交的变更。");
  assert.equal(calls.some((call) => call.method === "POST"), false);
});

test("github api publish can use planned generated files when the worktree is clean", async () => {
  const repoRoot = await tempRepoWithFixture();
  await buildSite({
    rootDir: repoRoot,
    inputDir: "reports-source",
    dataInputDir: "reports-data",
    outDir: "docs",
    generatedAt: fixedGeneratedAt
  });
  await fs.mkdir(path.join(repoRoot, "reports-data/2026/05"), { recursive: true });
  await fs.copyFile(
    path.join(repoRoot, "docs/data/2026/05/2026-05-13.json"),
    path.join(repoRoot, "reports-data/2026/05/2026-05-13.json")
  );

  const calls = [];
  const result = await publishGeneratedArtifactsViaGitHubApi({
    repoRoot,
    confirmPush: true,
    reportDate: "2026-05-13",
    token: "test-token",
    repository: "owner/repo",
    verifyPages: false,
    git: fakeGit({ status: "" }),
    fetchImpl: fakeGitHubFetch({ calls })
  });

  assert.equal(result.committed, true);
  assert(result.published_files.includes("docs/reports/2026/05/2026-05-13.html"));
  assert(result.published_files.includes("docs/data/2026/05/2026-05-13.json"));
  assert(result.published_files.includes("reports-data/2026/05/2026-05-13.json"));
});

test("github api publish 遇到非发布器管理改动时停止", async () => {
  const repoRoot = await tempRepoWithFixture();
  await fs.mkdir(path.join(repoRoot, "docs"), { recursive: true });
  await fs.mkdir(path.join(repoRoot, "src"), { recursive: true });
  await fs.writeFile(path.join(repoRoot, "docs/index.html"), "<!doctype html>");
  await fs.writeFile(path.join(repoRoot, "src/cli.js"), "console.log('dirty');");

  await assert.rejects(
    publishGeneratedArtifactsViaGitHubApi({
      repoRoot,
      confirmPush: true,
      token: "test-token",
      repository: "owner/repo",
      git: fakeGit({ status: " M src/cli.js\n M docs/index.html" }),
      fetchImpl: fakeGitHubFetch()
    }),
    (error) => error instanceof PublisherError && error.code === "dirty_worktree"
  );
});

test("publish 只提交发布器管理的文件", async () => {
  const calls = [];
  const result = await publishGeneratedArtifacts({
    confirmPush: true,
    reportDate: "2026-05-13",
    git: fakeGit({
      status: " M docs/index.html\n?? reports-data/2026/05/2026-05-13.json",
      calls
    })
  });

  assert.equal(result.committed, true);
  assert.equal(result.pushed, true);
  assert.deepEqual(result.staged_files, ["docs/index.html", "reports-data/2026/05/2026-05-13.json"]);
  assert.deepEqual(calls.map((call) => call.name), ["fetch", "pushDryRun", "add", "commit", "push"]);
});

test("publish checks push transport before creating a new publish commit", async () => {
  const calls = [];
  await assert.rejects(
    publishGeneratedArtifacts({
      confirmPush: true,
      reportDate: "2026-05-13",
      git: fakeGit({
        status: " M docs/index.html",
        calls,
        pushDryRunError: new Error("ssh: connect to host github.com port 22: Permission denied")
      })
    }),
    (error) => error instanceof PublisherError && error.code === "git_push_unavailable"
  );

  assert.deepEqual(calls.map((call) => call.name), ["fetch"]);
});

test("publish reports committed local state when the final push fails", async () => {
  const calls = [];
  await assert.rejects(
    publishGeneratedArtifacts({
      confirmPush: true,
      reportDate: "2026-05-13",
      git: fakeGit({
        status: " M docs/index.html",
        calls,
        pushError: new Error("fatal: Could not read from remote repository.")
      })
    }),
    (error) =>
      error instanceof PublisherError &&
      error.code === "git_push_failed" &&
      error.details.repo_updated === true
  );

  assert.deepEqual(calls.map((call) => call.name), ["fetch", "pushDryRun", "add", "commit", "push"]);
});

test("publish 可在 push 后验证 Pages URL", async () => {
  const calls = [];
  const result = await publishGeneratedArtifacts({
    confirmPush: true,
    reportDate: "2026-05-13",
    verifyPages: true,
    verificationAttempts: 1,
    verificationIntervalMs: 0,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      text: async () => "<title>AI 日报 2026-05-13</title>"
    }),
    git: fakeGit({
      status: " M docs/index.html\n?? reports-data/2026/05/2026-05-13.json",
      calls
    })
  });

  assert.equal(result.pages_verified, true);
  assert.equal(result.verification_error, "");
  assert.equal(result.pages_url, "https://jasonxzwen.github.io/ai-daily-cn/reports/2026/05/2026-05-13.html");
});

test("publish resume pushes existing local commits and verifies Pages", async () => {
  const calls = [];
  const result = await resumePublishPush({
    confirmPush: true,
    reportDate: "2026-05-13",
    verifyPages: true,
    verificationAttempts: 1,
    verificationIntervalMs: 0,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      text: async () => "<title>AI 鏃ユ姤 2026-05-13</title>"
    }),
    git: fakeGit({
      status: "",
      localAhead: 3,
      calls
    })
  });

  assert.equal(result.pushed, true);
  assert.equal(result.pushed_existing_commits, true);
  assert.equal(result.pages_verified, true);
  assert.deepEqual(calls.map((call) => call.name), ["fetch", "pushDryRun", "push"]);
});

test("publish 遇到非发布器管理改动时停止", async () => {
  await assert.rejects(
    publishGeneratedArtifacts({
      confirmPush: true,
      git: fakeGit({ status: " M src/cli.js\n M docs/index.html" })
    }),
    (error) => error instanceof PublisherError && error.code === "dirty_worktree"
  );
});

test("parsePorcelain 保留首行前导状态列并兼容单状态输出", () => {
  assert.deepEqual(parsePorcelain(" M docs/feed.json\n?? reports-data/2026/05/2026-05-14.json"), [
    { code: " M", path: "docs/feed.json" },
    { code: "??", path: "reports-data/2026/05/2026-05-14.json" }
  ]);
  assert.deepEqual(parsePorcelain("M docs/feed.json"), [{ code: "M ", path: "docs/feed.json" }]);
});

test("verifyPublishedUrl 重试直到页面可访问且包含目标日期", async () => {
  const statuses = [404, 200];
  const result = await verifyPublishedUrl("https://example.com/report.html", {
    attempts: 2,
    intervalMs: 0,
    expectedText: "2026-05-13",
    fetchImpl: async () => {
      const status = statuses.shift();
      return {
        ok: status === 200,
        status,
        text: async () => "AI 日报 2026-05-13"
      };
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
});

test("verifyPublishedUrl 在页面持续不可用时返回错误", async () => {
  const result = await verifyPublishedUrl("https://example.com/missing.html", {
    attempts: 1,
    intervalMs: 0,
    fetchImpl: async () => ({
      ok: false,
      status: 404,
      text: async () => "not found"
    })
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /HTTP 404/);
});

function fakeGit(overrides = {}) {
  const calls = overrides.calls || [];
  return {
    async status() {
      return overrides.status || "";
    },
    async branch() {
      return overrides.branch || "main";
    },
    async remoteStatus() {
      return {
        status: "ok",
        upstream: "origin/main",
        localAhead: overrides.localAhead || 0,
        remoteAhead: overrides.remoteAhead || 0
      };
    },
    async fetch(branch) {
      if (overrides.fetchError) {
        throw overrides.fetchError;
      }
      calls.push({ name: "fetch", branch });
      return overrides.fetchOutput || "";
    },
    async add(files) {
      calls.push({ name: "add", files });
      return "";
    },
    async commit(message) {
      calls.push({ name: "commit", message });
      return "[main abc123] test";
    },
    async pushDryRun(branch) {
      if (overrides.pushDryRunError) {
        throw overrides.pushDryRunError;
      }
      calls.push({ name: "pushDryRun", branch });
      return overrides.pushDryRunOutput || "dry-run ok";
    },
    async push(branch) {
      calls.push({ name: "push", branch });
      if (overrides.pushError) {
        throw overrides.pushError;
      }
      return "pushed";
    },
    async remoteUrl() {
      return overrides.remoteUrl || "git@github.com:owner/repo.git";
    }
  };
}

function fakeGitHubFetch(options = {}) {
  const calls = options.calls || [];
  const remoteTree = options.remoteTree || [];
  return async (url, init = {}) => {
    const method = init.method || "GET";
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ url, method, body });

    if (url.endsWith("/git/ref/heads/main")) {
      return jsonResponse({ object: { sha: "commit-base" } });
    }
    if (url.endsWith("/git/commits/commit-base")) {
      return jsonResponse({ sha: "commit-base", tree: { sha: "tree-base" } });
    }
    if (url.endsWith("/git/trees/tree-base?recursive=1")) {
      return jsonResponse({ tree: remoteTree });
    }
    if (url.endsWith("/git/trees") && method === "POST") {
      return jsonResponse({ sha: "tree-new" });
    }
    if (url.endsWith("/git/commits") && method === "POST") {
      return jsonResponse({ sha: "commit-new" });
    }
    if (url.endsWith("/git/refs/heads/main") && method === "PATCH") {
      return jsonResponse({ object: { sha: "commit-new" } });
    }
    if (url.includes("github.io")) {
      return {
        ok: true,
        status: 200,
        text: async () => "AI 日报 2026-05-13"
      };
    }
    return jsonResponse({ message: `unexpected ${method} ${url}` }, 404);
  };
}

function jsonResponse(value, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(value),
    json: async () => value
  };
}

function gitBlobSha(content) {
  return crypto.createHash("sha1").update(`blob ${Buffer.byteLength(content)}\0${content}`).digest("hex");
}

async function tempRepoWithFixture() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-publish-"));
  const inputDir = path.join(tmp, "reports-source");
  await fs.mkdir(path.join(tmp, "reports-data"), { recursive: true });
  await fs.mkdir(inputDir, { recursive: true });
  await fs.copyFile(
    path.join(rootDir, "tests/fixtures/reports/good/official-release.md"),
    path.join(inputDir, "official-release.md")
  );
  return tmp;
}
