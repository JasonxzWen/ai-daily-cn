import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import {
  buildDailyCodexPipelinePlan,
  prepareDailyCodexPipeline,
  runDailyCodexPipeline
} from "../scripts/run-daily-codex-pipeline.mjs";

const execFileAsync = promisify(execFile);

test("daily codex pipeline plans independent codex contexts per stage", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "daily-codex-pipeline-"));
  const workDir = path.join(rootDir, ".tmp", "pipeline");
  const admissionInput = path.join(workDir, "fixture-admission.json");
  await fs.mkdir(path.dirname(admissionInput), { recursive: true });
  await fs.writeFile(admissionInput, JSON.stringify({
    accepted_items: [
      { candidate_id: "google-nyc-summit", title: "Google NYC AI Summit", url: "https://example.com/google" },
      { candidate_id: "microsoft-harc", title: "Microsoft HARC", url: "https://example.com/harc" }
    ]
  }), "utf8");

  const plan = await prepareDailyCodexPipeline({
    rootDir,
    reportDate: "2026-07-02",
    workDir,
    admissionInputPath: admissionInput,
    codexBin: "codex-test",
    model: "gpt-test"
  });

  const codexStages = plan.stages.filter((stage) => stage.kind === "codex_exec");
  assert(codexStages.some((stage) => stage.id === "collect"));
  assert(codexStages.some((stage) => stage.id === "admit"));

  const summaryStages = codexStages.filter((stage) => stage.id.startsWith("summarize:"));
  assert.equal(summaryStages.length, 2);
  assert.deepEqual(summaryStages.map((stage) => stage.item.candidate_id), ["google-nyc-summit", "microsoft-harc"]);

  for (const stage of codexStages) {
    assert.equal(stage.command[0], "codex-test");
    assert(stage.command.includes("--ephemeral"));
    assert(stage.command.includes("--json"));
    assert(stage.command.includes("-C"));
    assert(stage.command.includes(rootDir));
    assert(stage.command.includes("--output-last-message"));
    assert.equal(stage.command.at(-1), "-");
    assert.equal(stage.cwd, rootDir);
  }

  for (const stage of summaryStages) {
    assert(fsSync.existsSync(stage.prompt_path), `${stage.prompt_path} should exist`);
    assert(fsSync.existsSync(stage.item_path), `${stage.item_path} should exist`);
    const prompt = await fs.readFile(stage.prompt_path, "utf8");
    assert(prompt.includes("story-first"));
    assert(prompt.includes("insufficient_evidence"));
  }

  const planFile = JSON.parse(await fs.readFile(path.join(workDir, "pipeline-plan.json"), "utf8"));
  assert.equal(planFile.codex.independent_context_per_stage, true);
  assert(planFile.stages.every((stage) => !Object.hasOwn(stage, "prompt")));
});

test("daily codex pipeline dry-run exposes a summary placeholder without admission output", () => {
  const rootDir = fsSync.mkdtempSync(path.join(os.tmpdir(), "daily-codex-pipeline-placeholder-"));
  const plan = buildDailyCodexPipelinePlan({
    rootDir,
    reportDate: "2026-07-02",
    workDir: path.join(rootDir, ".tmp", "pipeline"),
    includePlaceholderSummaries: true
  });

  const summaryStages = plan.stages.filter((stage) => stage.id.startsWith("summarize:"));
  assert.equal(summaryStages.length, 1);
  assert.equal(summaryStages[0].item.candidate_id, "accepted-item-placeholder");
  assert(plan.stages.some((stage) => stage.id === "quality-review"));
  assert(plan.stages.some((stage) => stage.id === "sources-phase5-audit"));
  assert(plan.stages.some((stage) => stage.command?.includes("content:contract")));
  assert(plan.stages.some((stage) => stage.command?.includes("quality:page-check")));
});

test("daily codex pipeline execute mode without publish skips publish stages", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "daily-codex-pipeline-generated-only-"));
  const { fakeCodex, fakeNpm } = await writePipelineCommandShims(rootDir);
  const plan = await prepareDailyCodexPipeline({
    rootDir,
    reportDate: "2026-07-02",
    workDir: path.join(rootDir, ".tmp", "pipeline"),
    codexBin: fakeCodex,
    npmBin: fakeNpm,
    publish: false
  });

  await runDailyCodexPipeline(plan);

  const summary = JSON.parse(await fs.readFile(path.join(rootDir, ".tmp", "run-summary-2026-07-02.json"), "utf8"));
  const completedIds = summary.completed_stages.map((stage) => stage.id);
  assert.equal(summary.final_status, "generated_only");
  assert(completedIds.includes("quality-review"));
  assert(completedIds.includes("sources-phase5-audit"));
  assert(completedIds.includes("content-contract"));
  assert(completedIds.includes("page-check"));
  assert(!completedIds.includes("publish-dry-run"));
  assert(!completedIds.includes("publish"));
  assert(!completedIds.includes("pages-verify"));
});

test("daily codex pipeline execute mode publishes with fallback and writes run summary", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "daily-codex-pipeline-execute-"));
  const binDir = path.join(rootDir, "bin");
  await fs.mkdir(binDir, { recursive: true });
  const fakeCodex = await writeNodeCommandShim(binDir, "fake-codex", `
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const prompt = await new Promise((resolve) => {
  let value = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => { value += chunk; });
  process.stdin.on("end", () => resolve(value));
});

function outputPathFor(label) {
  const match = prompt.match(new RegExp(label + "\\\\s*([^\\\\n]+)"));
  return match ? match[1].trim() : "";
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\\n", "utf8");
}

const lastMessageIndex = args.indexOf("--output-last-message");
if (lastMessageIndex >= 0) {
  writeJson(args[lastMessageIndex + 1], { ok: true });
}

if (prompt.includes("信息收集阶段")) {
  writeJson(outputPathFor("输出文件："), {
    report_date: "2026-07-02",
    stage: "collect",
    raw_candidates: [{ candidate_id: "fixture-item", title: "Fixture Item", url: "https://example.com/item" }],
    source_audit: {},
    warnings: []
  });
} else if (prompt.includes("信息准入阶段")) {
  writeJson(outputPathFor("输出准入文件："), {
    report_date: "2026-07-02",
    stage: "admit",
    accepted_items: [{ candidate_id: "fixture-item", title: "Fixture Item", url: "https://example.com/item" }],
    rejected_items: []
  });
} else if (prompt.includes("单条新闻概括阶段")) {
  writeJson(outputPathFor("条目输出文件："), {
    candidate_id: "fixture-item",
    title: "Fixture Item ships a concrete change",
    summary: "Fixture Item 发布了可验证的新能力。",
    bullets: ["读者可以看到明确变化。", "来源和范围保持可追溯。"],
    source: { label: "Fixture", url: "https://example.com/item" },
    insufficient_evidence: false,
    evidence_notes: []
  });
} else if (prompt.includes("结构化组装阶段")) {
  writeJson(outputPathFor("输出草稿："), {
    report_date: "2026-07-02",
    summary: "Fixture Item 发布了可验证的新能力。",
    main_items: []
  });
}

process.stdout.write(JSON.stringify({ type: "done" }) + "\\n");
`);
  const fakeNpm = await writeNodeCommandShim(binDir, "fake-npm", `
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const script = args[0] === "run" ? args[1] : args[0];
const outputIndex = args.indexOf("--output");
if (outputIndex >= 0) {
  const outputPath = args[outputIndex + 1];
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify({ ok: true, script }, null, 2) + "\\n", "utf8");
}
if (script === "publish" && process.env.FAKE_NPM_FAIL_PUBLISH === "1") {
  process.stderr.write("simulated publish failure\\n");
  process.exit(2);
}
process.stdout.write(JSON.stringify({ ok: true, script }) + "\\n");
`);

  const plan = await prepareDailyCodexPipeline({
    rootDir,
    reportDate: "2026-07-02",
    workDir: path.join(rootDir, ".tmp", "pipeline"),
    codexBin: fakeCodex,
    npmBin: fakeNpm,
    publish: true
  });

  process.env.FAKE_NPM_FAIL_PUBLISH = "1";
  try {
    await runDailyCodexPipeline(plan);
  } finally {
    delete process.env.FAKE_NPM_FAIL_PUBLISH;
  }

  const summary = JSON.parse(await fs.readFile(path.join(rootDir, ".tmp", "run-summary-2026-07-02.json"), "utf8"));
  assert.equal(summary.final_status, "published");
  assert.equal(summary.publish.enabled, true);
  assert(summary.completed_stages.some((stage) => stage.id === "publish-dry-run"));
  assert(summary.completed_stages.some((stage) => stage.id === "publish" && stage.fallback_used));
  assert(summary.completed_stages.some((stage) => stage.id === "pages-verify" && stage.result_json?.ok === true));
  assert.equal(summary.next_action.kind, "none");
});

test("daily codex pipeline records published pending when Pages verification is delayed", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "daily-codex-pipeline-pages-"));
  const { fakeCodex, fakeNpm } = await writePipelineCommandShims(rootDir);
  const plan = await prepareDailyCodexPipeline({
    rootDir,
    reportDate: "2026-07-02",
    workDir: path.join(rootDir, ".tmp", "pipeline"),
    codexBin: fakeCodex,
    npmBin: fakeNpm,
    publish: true
  });

  process.env.FAKE_NPM_PAGES_PENDING = "1";
  try {
    await runDailyCodexPipeline(plan);
  } finally {
    delete process.env.FAKE_NPM_PAGES_PENDING;
  }

  const summary = JSON.parse(await fs.readFile(path.join(rootDir, ".tmp", "run-summary-2026-07-02.json"), "utf8"));
  assert.equal(summary.final_status, "published_pending_pages_verification");
  assert.equal(summary.next_action.kind, "verify_pages_later");
  const pagesStage = summary.completed_stages.find((stage) => stage.id === "pages-verify");
  assert.equal(pagesStage.ok, true);
  assert.equal(pagesStage.result_json.ok, false);
  assert.equal(pagesStage.result_json.diagnostics.length, 200000);
});

test("daily codex pipeline records published pending when Pages verification lacks JSON evidence", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "daily-codex-pipeline-pages-no-json-"));
  const { fakeCodex, fakeNpm } = await writePipelineCommandShims(rootDir);
  const plan = await prepareDailyCodexPipeline({
    rootDir,
    reportDate: "2026-07-02",
    workDir: path.join(rootDir, ".tmp", "pipeline"),
    codexBin: fakeCodex,
    npmBin: fakeNpm,
    publish: true
  });

  process.env.FAKE_NPM_PAGES_NO_JSON = "1";
  try {
    await runDailyCodexPipeline(plan);
  } finally {
    delete process.env.FAKE_NPM_PAGES_NO_JSON;
  }

  const summary = JSON.parse(await fs.readFile(path.join(rootDir, ".tmp", "run-summary-2026-07-02.json"), "utf8"));
  assert.equal(summary.final_status, "published_pending_pages_verification");
  assert.equal(summary.next_action.kind, "verify_pages_later");
  const pagesStage = summary.completed_stages.find((stage) => stage.id === "pages-verify");
  assert.equal(pagesStage.ok, true);
  assert.equal(pagesStage.result_json, null);
});

test("daily codex pipeline CLI treats --publish=false as false", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "daily-codex-pipeline-cli-publish-false-"));
  const workDir = path.join(rootDir, ".tmp", "pipeline");
  const { stdout } = await execFileAsync(process.execPath, [
    path.resolve("scripts/run-daily-codex-pipeline.mjs"),
    "--repo-root",
    rootDir,
    "--date",
    "2026-07-02",
    "--work-dir",
    workDir,
    "--dry-run",
    "--publish=false"
  ], { cwd: path.resolve(".") });

  const result = JSON.parse(stdout);
  assert.equal(result.publish, false);
  assert(!result.stages.some((stage) => stage.id === "publish-dry-run"));
  assert(!result.stages.some((stage) => stage.id === "publish"));
  assert(!result.stages.some((stage) => stage.id === "pages-verify"));
});

test("daily codex pipeline blocks when a codex stage does not write JSON", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "daily-codex-pipeline-missing-output-"));
  const binDir = path.join(rootDir, "bin");
  await fs.mkdir(binDir, { recursive: true });
  const fakeCodex = await writeNodeCommandShim(binDir, "fake-codex-no-output", `
process.stdout.write(JSON.stringify({ type: "done_without_output" }) + "\\n");
`);
  const fakeNpm = await writeNodeCommandShim(binDir, "fake-npm", `
process.stdout.write(JSON.stringify({ ok: true }) + "\\n");
`);
  const plan = await prepareDailyCodexPipeline({
    rootDir,
    reportDate: "2026-07-02",
    workDir: path.join(rootDir, ".tmp", "pipeline"),
    codexBin: fakeCodex,
    npmBin: fakeNpm
  });

  await assert.rejects(runDailyCodexPipeline(plan), /valid JSON|no such file/i);
  const summary = JSON.parse(await fs.readFile(path.join(rootDir, ".tmp", "run-summary-2026-07-02.json"), "utf8"));
  assert.equal(summary.final_status, "blocked");
  assert.equal(summary.next_action.stage_id, "collect");
});

async function writeNodeCommandShim(binDir, name, moduleSource) {
  const modulePath = path.join(binDir, `${name}.mjs`);
  await fs.writeFile(modulePath, moduleSource, "utf8");
  if (process.platform === "win32") {
    const commandPath = path.join(binDir, `${name}.cmd`);
    await fs.writeFile(commandPath, `@echo off\r\n"${process.execPath}" "${modulePath}" %*\r\n`, "utf8");
    return commandPath;
  }
  const commandPath = path.join(binDir, name);
  await fs.writeFile(commandPath, `#!/bin/sh\nexec "${process.execPath}" "${modulePath}" "$@"\n`, "utf8");
  await fs.chmod(commandPath, 0o755);
  return commandPath;
}

async function writePipelineCommandShims(rootDir) {
  const binDir = path.join(rootDir, "bin");
  await fs.mkdir(binDir, { recursive: true });
  const fakeCodex = await writeNodeCommandShim(binDir, "fake-codex", `
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const prompt = await new Promise((resolve) => {
  let value = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => { value += chunk; });
  process.stdin.on("end", () => resolve(value));
});

function outputPathFor(label) {
  const match = prompt.match(new RegExp(label + "\\\\s*([^\\\\n]+)"));
  return match ? match[1].trim() : "";
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\\n", "utf8");
}

const lastMessageIndex = args.indexOf("--output-last-message");
if (lastMessageIndex >= 0) {
  writeJson(args[lastMessageIndex + 1], { ok: true });
}

if (prompt.includes("信息收集阶段")) {
  writeJson(outputPathFor("输出文件："), {
    report_date: "2026-07-02",
    stage: "collect",
    raw_candidates: [{ candidate_id: "fixture-item", title: "Fixture Item", url: "https://example.com/item" }],
    source_audit: {},
    warnings: []
  });
} else if (prompt.includes("信息准入阶段")) {
  writeJson(outputPathFor("输出准入文件："), {
    report_date: "2026-07-02",
    stage: "admit",
    accepted_items: [{ candidate_id: "fixture-item", title: "Fixture Item", url: "https://example.com/item" }],
    rejected_items: []
  });
} else if (prompt.includes("单条新闻概括阶段")) {
  writeJson(outputPathFor("条目输出文件："), {
    candidate_id: "fixture-item",
    title: "Fixture Item ships a concrete change",
    summary: "Fixture Item 发布了可验证的新能力。",
    bullets: ["读者可以看到明确变化。", "来源和范围保持可追溯。"],
    source: { label: "Fixture", url: "https://example.com/item" },
    insufficient_evidence: false,
    evidence_notes: []
  });
} else if (prompt.includes("结构化组装阶段")) {
  writeJson(outputPathFor("输出草稿："), {
    report_date: "2026-07-02",
    summary: "Fixture Item 发布了可验证的新能力。",
    main_items: []
  });
}

process.stdout.write(JSON.stringify({ type: "done" }) + "\\n");
`);
  const fakeNpm = await writeNodeCommandShim(binDir, "fake-npm", `
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const script = args[0] === "run" ? args[1] : args[0];
const outputIndex = args.indexOf("--output");
if (outputIndex >= 0) {
  const outputPath = args[outputIndex + 1];
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify({ ok: true, script }, null, 2) + "\\n", "utf8");
}
if (script === "publish" && process.env.FAKE_NPM_FAIL_PUBLISH === "1") {
  process.stderr.write("simulated publish failure\\n");
  process.exit(2);
}
if (script === "publish:verify-pages" && process.env.FAKE_NPM_PAGES_PENDING === "1") {
  process.stdout.write(JSON.stringify({
    ok: false,
    script,
    verification_error: "pages_verification_failed: HTTP 404",
    diagnostics: "x".repeat(200000)
  }) + "\\n");
} else if (script === "publish:verify-pages" && process.env.FAKE_NPM_PAGES_NO_JSON === "1") {
  process.stdout.write("pages verification produced no structured JSON\\n");
} else {
  process.stdout.write(JSON.stringify({ ok: true, script }) + "\\n");
}
`);
  return { fakeCodex, fakeNpm };
}
