import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  evaluatePublicCopyReplay,
  PUBLIC_COPY_REPLAY_BANNED_TERMS
} from "../scripts/check-public-copy-replay.mjs";

const rootDir = process.cwd();

test("public copy replay catches confirmed GitHub momentum machine wording in real-style docs data", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "public-copy-replay-"));
  const dataDir = path.join(tmp, "docs", "data", "2026", "07");
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(path.join(dataDir, "2026-07-08.json"), JSON.stringify({
    report_date: "2026-07-08",
    github_trending: [
      {
        repo: "elastic/elasticsearch",
        description: "elastic/elasticsearch 本周出现在开源榜单 Java weekly #20，本周 +391 stars；当前只能确认榜单动量，正式采用前还要核对 README、许可证、维护状态和 issue 反馈。"
      }
    ]
  }, null, 2), "utf8");

  const result = await evaluatePublicCopyReplay({
    rootDir: tmp,
    currentDate: "2026-07-08",
    latestDays: 14
  });

  assert.equal(result.ok, false);
  assert.equal(result.summary.artifacts_checked, 1);
  assert(result.issues.some((issue) => issue.term === "当前只能确认榜单动量"));
  assert(result.issues.some((issue) => issue.term === "正式采用前还要核对 README"));
  assert(result.issues.every((issue) => issue.path.endsWith("docs/data/2026/07/2026-07-08.json")));
});

test("public copy replay scans docs data and reports data inside the 14-day window", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "public-copy-replay-window-"));
  await writeText(tmp, "docs/data/2026/07/2026-07-08.json", JSON.stringify({ report_date: "2026-07-08", summary: "阅读时先看 README。" }));
  await writeText(tmp, "reports-data/2026/07/2026-07-07.json", JSON.stringify({ report_date: "2026-07-07", summary: "这个项目存在复现门槛。" }));
  await writeText(tmp, "docs/data/2026/06/2026-06-10.json", JSON.stringify({ report_date: "2026-06-10", summary: "阅读时先看旧文。" }));
  await writeText(tmp, "reports-data/occurrences/2026/07/2026-07-08.json", JSON.stringify({
    report_date: "2026-07-08",
    title: "苹果新 Siri AI 设三层准入门槛"
  }));

  const result = await evaluatePublicCopyReplay({
    rootDir: tmp,
    currentDate: "2026-07-08",
    latestDays: 14
  });

  assert.equal(result.summary.artifacts_checked, 2);
  assert.deepEqual(new Set(result.issues.map((issue) => issue.term)), new Set(["阅读时先看", "复现门槛"]));
  assert(result.issues.every((issue) => !issue.path.includes("2026-06-10")));
});

test("public copy replay ignores retired report HTML roots", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "public-copy-replay-html-"));
  await writeText(tmp, "docs/reports/2026/07/2026-07-08.html", `
    <main>阅读时先看 README，当前只能确认榜单动量。</main>
  `);

  const result = await evaluatePublicCopyReplay({
    rootDir: tmp,
    currentDate: "2026-07-08",
    latestDays: 14
  });

  assert.equal(result.ok, true);
  assert.equal(result.summary.artifacts_checked, 0);
  assert.deepEqual(result.issues, []);
});

test("public copy replay CLI exits non-zero with JSON issue output when banned wording is found", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "public-copy-replay-cli-"));
  await writeText(tmp, "docs/data/2026/07/2026-07-08.json", JSON.stringify({
    report_date: "2026-07-08",
    summary: "这个公开摘要暴露了准入门槛。"
  }));

  const cli = spawnSync(process.execPath, [
    path.join(rootDir, "scripts", "check-public-copy-replay.mjs"),
    "--repo-root",
    tmp,
    "--current-date",
    "2026-07-08",
    "--latest-days",
    "14",
    "--json"
  ], {
    cwd: rootDir,
    encoding: "utf8"
  });

  assert.equal(cli.status, 1, cli.stdout || cli.stderr);
  const result = JSON.parse(cli.stdout);
  assert.equal(result.ok, false);
  assert(result.issues.some((issue) => issue.term === "准入"));
});

test("public copy replay exposes the handoff-confirmed banned term set", () => {
  for (const term of [
    "当前只能确认榜单动量",
    "正式采用前还要核对 README",
    "核对 README",
    "准入",
    "复现门槛",
    "优先核对",
    "阅读时先看"
  ]) {
    assert(PUBLIC_COPY_REPLAY_BANNED_TERMS.includes(term), `${term} should be banned`);
  }
});

async function writeText(root, relativePath, content) {
  const target = path.join(root, ...relativePath.split("/"));
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${content}\n`, "utf8");
}
