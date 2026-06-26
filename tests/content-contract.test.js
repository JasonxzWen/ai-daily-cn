// Binds the daily content contract to generation-first quality on real reports.
//
// The structural contract used to pass templated story prose silently. It now
// surfaces templated story narrative as a DEGRADED (non-blocking) signal, so a
// real report that ships deterministic template prose is visibly flagged rather
// than passing clean. Also guards that real committed reports carry no BLOCKING
// content-contract issues.
//
// Run: node --test tests/content-contract.test.js

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { evaluateDailyContentContract, evaluateRealArtifactContentContract } from "../scripts/check-daily-content-contract.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.join(__dirname, "..", "reports-data");

const storyFixture = (whatHappened) => ({
  report_date: "2026-06-24",
  stories: [
    { story_id: "s1", title: "阿里云发布视频生成升级", what_happened: whatHappened, why_it_matters: "面向 AIGC 创作", sources: [{ label: "Alibaba Cloud Blog", url: "https://www.alibabacloud.com/blog/a" }] }
  ],
  main_items: [{ title: "阿里云发布视频生成升级", url: "https://www.alibabacloud.com/blog/a", bullets: ["阿里云升级视频生成模型，提升一致性与画质。"] }],
  github_trending: [],
  hot_blogs: [],
  builder_observations: []
});

test("content contract flags templated story narrative as degraded (non-blocking)", () => {
  const report = storyFixture("Alibaba Cloud更新agent 工作流和开发工具能力，材料覆盖任务编排、上下文、权限控制，边界落在落地质量取决于权限模型、评估回放、团队流程和可观测性。");
  const result = evaluateDailyContentContract(report);
  const story = result.degraded.filter((d) => d.code === "story_template_narrative");
  assert.equal(story.length, 1, "templated story narrative must be flagged as degraded");
  assert.ok(!result.issues.some((i) => i.code === "story_template_narrative"), "story narrative must not hard-block");
});

test("content contract is clean for authored story narrative", () => {
  const report = storyFixture("阿里云公布视频生成模型 HappyHorse 的新版本，提升人物动作表现力、跨帧生成一致性和整体画面质量。");
  const result = evaluateDailyContentContract(report);
  assert.equal(result.degraded.filter((d) => d.code === "story_template_narrative").length, 0);
});

test("real artifact content contract scans report directory and surfaces blocking issues", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ai-daily-content-contract-"));
  const dataDir = path.join(tmp, "reports-data", "2026", "06");
  const htmlDir = path.join(tmp, "docs", "reports", "2026", "06");
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(htmlDir, { recursive: true });
  const realTemplatedReport = JSON.parse(fs.readFileSync(path.join(REPORTS_DIR, "2026", "06", "2026-06-24.json"), "utf8"));
  realTemplatedReport.github_trending = [];
  fs.writeFileSync(path.join(dataDir, "2026-06-26.json"), JSON.stringify(realTemplatedReport), "utf8");
  fs.writeFileSync(path.join(htmlDir, "2026-06-26.html"), "<html><body><section id=\"story-list\"></section></body></html>", "utf8");

  const result = await evaluateRealArtifactContentContract({
    rootDir: tmp,
    dataInput: "reports-data",
    htmlInput: path.join("docs", "reports"),
    latest: 1
  });

  assert.equal(result.ok, false);
  assert.equal(result.summary.artifacts_checked, 1);
  assert(result.issues.some((issue) => issue.code === "github_trending_top20_missing"));
  assert(result.issues.some((issue) => issue.report_path === "reports-data/2026/06/2026-06-26.json"));
  assert(result.degraded.some((issue) => issue.code === "story_template_narrative"));
});

test("latest committed report carries no BLOCKING content-contract issues", () => {
  const found = [];
  const dirs = (p) => { try { return fs.readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort(); } catch { return []; } };
  for (const y of dirs(REPORTS_DIR)) {
    for (const m of dirs(path.join(REPORTS_DIR, y))) {
      for (const f of fs.readdirSync(path.join(REPORTS_DIR, y, m))) {
        if (/^\d{4}-\d{2}-\d{2}\.json$/.test(f)) found.push(path.join(REPORTS_DIR, y, m, f));
      }
    }
  }
  found.sort();
  const latest = found[found.length - 1];
  assert.ok(latest, "a committed report must exist");
  const result = evaluateDailyContentContract(JSON.parse(fs.readFileSync(latest, "utf8")));
  assert.deepEqual(
    result.issues.map((i) => i.code),
    [],
    `${path.basename(latest)} has blocking content-contract issues`
  );
});
