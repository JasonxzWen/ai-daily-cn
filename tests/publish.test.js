import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PublisherError } from "../src/errors.js";
import { createPublishPlan, parsePorcelain, publishGeneratedArtifacts, verifyPublishedUrl } from "../src/publish.js";

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

test("publish 需要显式确认参数", async () => {
  await assert.rejects(
    publishGeneratedArtifacts({ git: fakeGit({ status: " M docs/index.html" }) }),
    (error) => error instanceof PublisherError && error.code === "publish_confirmation_required"
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
  assert.deepEqual(calls.map((call) => call.name), ["add", "commit", "push"]);
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
    async add(files) {
      calls.push({ name: "add", files });
      return "";
    },
    async commit(message) {
      calls.push({ name: "commit", message });
      return "[main abc123] test";
    },
    async push(branch) {
      calls.push({ name: "push", branch });
      return "pushed";
    }
  };
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
