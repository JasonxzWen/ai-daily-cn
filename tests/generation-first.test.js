// Generation-first contract, bound to a REAL report (not a self-test fixture).
//
// `stories` is the reader-facing unit. Its narrative must be authored from each
// story's own source, not produced by story-first.js deterministic templates.
// This test enforces, against the latest committed report (or GEN_FIRST_REPORT):
//   1. builder translations are real, per-post, mutually distinct;
//   2. non-story public copy (summary / builders / hot blogs) carries no
//      machine-template slop;
//   3. the authoring gate COVERS every templated story — reviewReportQuality
//      flags each templated story field with a public_editorial_rewrite task,
//      so nothing escapes to the reader un-authored;
//   4. (strict) when pointed at an already-authored report via GEN_FIRST_REPORT,
//      no story narrative matches the deterministic template families.
//
// Run: node --test tests/generation-first.test.js
//   or GEN_FIRST_REPORT=.tmp/2026-06-24.authored.json node --test tests/generation-first.test.js

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { reviewReportQuality } from "../src/quality-loop.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.join(__dirname, "..", "reports-data");
const STRICT = Boolean(process.env.GEN_FIRST_REPORT);

function safeDirs(p) {
  try {
    return fs.readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  } catch {
    return [];
  }
}

function latestReportFile() {
  if (process.env.GEN_FIRST_REPORT) return path.resolve(process.env.GEN_FIRST_REPORT);
  const found = [];
  for (const y of safeDirs(REPORTS_DIR)) {
    for (const m of safeDirs(path.join(REPORTS_DIR, y))) {
      const dir = path.join(REPORTS_DIR, y, m);
      for (const f of fs.readdirSync(dir)) {
        if (/^\d{4}-\d{2}-\d{2}\.json$/.test(f)) found.push(path.join(dir, f));
      }
    }
  }
  found.sort();
  return found[found.length - 1] || null;
}

const norm = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();

const FORBIDDEN_PUBLIC_PHRASES = [
  "材料把",
  "材料覆盖",
  "已披露事实集中在",
  "已披露细节覆盖",
  "边界落在落地质量取决于",
  "说明 AI 产品、平台或工程变化",
  "内容包括功能变化、使用场景、接入方式、限制条件和后续部署边界",
  "仍需要回到原文核对入口",
  "今天最值得看的主线有",
  "信号集中在",
  "价值集中在",
  "可用于比较",
  "接口形态",
  "可用于了解项目代码入口",
  "同类方案差异",
  "面向AI 工程实践的开源项目",
  "面向 AI 工程实践的开源项目",
  "README 显示核心能力",
  "给出README 说明和使用入口",
  "给出 README 说明和使用入口",
  "读者应先确认快速开始",
  "这类项目适合先从最小示例复现",
  "测试或评估资产",
  "本轮开源榜单",
  "公开页面显示",
  "读者应看项目说明",
  "公开信息只能说明开发者关注度增加",
  "这类项目不应只看星标变化",
  "面向agent 工作流和自动化工程",
  "面向 agent 工作流和自动化工程",
  "核心能力是",
  "沉淀为代码、示例和集成入口",
  "方便和同类方案做功能与工程成本比较",
  "热度指标是",
  "页面还标出",
  "published this intermediary lead entry",
  "This is an intermediary/self-media lead",
  "trace it to a primary source",
  "更有价值的信息是",
  "判断这类方案时还要看",
  "文章梳理一个 AI 产品",
  "文章拆解 agent",
  "No previous component snapshot was available for comparison.",
  "这会影响产品团队判断路线优先级",
  "读者可把它作为 Builder/X 讨论信号",
  "这条动态主要围绕",
];

// story-first.js deterministic narrative templates.
const STORY_TEMPLATE_RE =
  /材料覆盖|材料把[^。]*落到|边界落在落地质量取决于|已披露事实集中在|更新agent\s*工作流和开发工具能力|更新AI\s*产品、平台或工程实践|披露模型能力和评估方法更新/u;

const reportFile = latestReportFile();
const report = reportFile && fs.existsSync(reportFile) ? JSON.parse(fs.readFileSync(reportFile, "utf8")) : {};
const stories = Array.isArray(report.stories) ? report.stories : [];
const builders = Array.isArray(report.builder_observations) ? report.builder_observations : [];
const hotBlogs = Array.isArray(report.hot_blogs) ? report.hot_blogs : [];

test("a report exists to validate", () => {
  assert.ok(reportFile && fs.existsSync(reportFile), `report not found: ${reportFile}`);
});

test("REQ-GF-1: builder translations are mutually distinct", () => {
  const texts = builders.map((b) => norm(b.translation || b.content)).filter(Boolean);
  const counts = new Map();
  for (const t of texts) counts.set(t, (counts.get(t) || 0) + 1);
  const dupes = [...counts.entries()].filter(([, n]) => n > 1);
  assert.equal(dupes.length, 0, `${dupes.length} duplicated builder translations; sample:\n` +
    dupes.slice(0, 3).map(([t, n]) => `x${n}: ${t.slice(0, 80)}`).join("\n"));
});

test("REQ-GF-2: non-story public copy has no machine-template slop", () => {
  const strings = [norm(report.summary)];
  for (const b of builders) { if (b?.translation) strings.push(norm(b.translation)); if (b?.content) strings.push(norm(b.content)); }
  for (const h of hotBlogs) if (h?.summary) strings.push(norm(h.summary));
  const hits = [];
  for (const s of strings.filter(Boolean)) {
    for (const p of FORBIDDEN_PUBLIC_PHRASES) if (s.includes(p)) hits.push(`[${p}] -> ${s.slice(0, 90)}`);
  }
  assert.equal(hits.length, 0, `${hits.length} forbidden phrase hits:\n` + hits.slice(0, 10).join("\n"));
});

test("REQ-GF-3: the authoring gate covers every templated story (none escapes un-authored)", () => {
  const review = reviewReportQuality(report);
  const flagged = new Set(
    review.ai_review_tasks
      .filter((t) => t.kind === "public_editorial_rewrite" && /^stories\[\d+\]\./.test(String(t.path || "")))
      .map((t) => t.path)
  );
  const escaped = [];
  stories.forEach((s, i) => {
    for (const f of ["title", "what_happened", "why_it_matters"]) {
      const t = norm(s?.[f]);
      if (t && STORY_TEMPLATE_RE.test(t) && !flagged.has(`stories[${i}].${f}`)) {
        escaped.push(`stories[${i}].${f}: ${t.slice(0, 80)}`);
      }
    }
  });
  assert.equal(escaped.length, 0, `${escaped.length} templated story fields not routed to authoring:\n` + escaped.slice(0, 12).join("\n"));
});

test("REQ-GF-4 (strict, authored report only): no templated story narrative remains", { skip: !STRICT }, () => {
  const bad = [];
  stories.forEach((s, i) => {
    for (const f of ["title", "what_happened", "why_it_matters"]) {
      const t = norm(s?.[f]);
      if (t && STORY_TEMPLATE_RE.test(t)) bad.push(`stories[${i}].${f}: ${t.slice(0, 80)}`);
    }
  });
  assert.equal(bad.length, 0, `${bad.length} templated story fields remain:\n` + bad.slice(0, 12).join("\n"));
});
