import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import {
  buildDailyCodexPipelinePlan,
  prepareDailyCodexPipeline,
  runDailyCodexPipeline,
  validateDailyCodexMvpArtifact
} from "../scripts/run-daily-codex-pipeline.mjs";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(".");

test("daily Codex DAG-lite runner plans the six MVP stages", () => {
  const rootDir = path.join(os.tmpdir(), "daily-codex-mvp-plan");
  const plan = buildDailyCodexPipelinePlan({
    rootDir,
    reportDate: "2026-07-06",
    fixtureMode: "success"
  });

  assert.equal(plan.mode, "daily_codex_dag_lite");
  assert.deepEqual(plan.stages.map((stage) => stage.id), [
    "prepare",
    "collect-context",
    "codex-generate",
    "validate",
    "repair-once",
    "summarize"
  ]);
  assert(plan.outputs.run_summary.endsWith(path.join(".tmp", "run-summary-2026-07-06.json")));
});

test("daily Codex DAG-lite runner produces a successful fixture summary", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "daily-codex-mvp-success-"));
  await writeMinimalRepoFiles(rootDir);
  const plan = await prepareDailyCodexPipeline({
    rootDir,
    reportDate: "2026-07-06",
    fixtureMode: "success"
  });

  const { summary } = await runDailyCodexPipeline(plan);
  assert.equal(summary.final_status, "generated_only");
  assert.equal(summary.ok, true);
  assert.equal(summary.mode, "daily_codex_dag_lite");
  assert.equal(summary.report_date, "2026-07-06");
  assert.equal(summary.summary_path, plan.outputs.run_summary);
  assert.equal(summary.execute_requested, false);
  assert.equal(summary.publish_requested, false);
  assert.equal(summary.completed_stages.length, 6);
  assert.deepEqual(summary.completed_stages.map((stage) => stage.id), [
    "prepare",
    "collect-context",
    "codex-generate",
    "validate",
    "repair-once",
    "summarize"
  ]);
  assert.equal(summary.completed_stages.find((stage) => stage.id === "repair-once").status, "skipped");
  assert.equal(summary.repair_attempted, false);

  const finalArtifact = JSON.parse(await fs.readFile(plan.outputs.final, "utf8"));
  const validation = validateDailyCodexMvpArtifact(finalArtifact, { reportDate: "2026-07-06" });
  assert.equal(validation.ok, true, validation.failures.join("\n"));
});

test("daily Codex DAG-lite runner rejects unsafe work dirs before cleanup", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "daily-codex-mvp-work-dir-"));
  await writeMinimalRepoFiles(rootDir);

  await assert.rejects(prepareDailyCodexPipeline({
    rootDir,
    reportDate: "2026-07-06",
    workDir: rootDir,
    fixtureMode: "success"
  }), /work dir cannot be the repository root/);
  await assert.rejects(prepareDailyCodexPipeline({
    rootDir,
    reportDate: "2026-07-06",
    workDir: path.join(rootDir, ".tmp", "daily-codex-mvp"),
    fixtureMode: "success"
  }), /work dir must be a child/);
  await assert.rejects(prepareDailyCodexPipeline({
    rootDir,
    reportDate: "2026-07-06",
    workDir: path.join(rootDir, "..", "outside-daily-codex-mvp"),
    fixtureMode: "success"
  }), /work dir must be inside/);

  const packageJson = JSON.parse(await fs.readFile(path.join(rootDir, "package.json"), "utf8"));
  assert.equal(packageJson.name, "fixture-daily");
});

test("daily Codex DAG-lite runner repairs once after validation failure", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "daily-codex-mvp-repair-"));
  await writeMinimalRepoFiles(rootDir);
  const plan = await prepareDailyCodexPipeline({
    rootDir,
    reportDate: "2026-07-06",
    fixtureMode: "repair-success"
  });

  const { summary } = await runDailyCodexPipeline(plan);
  const validateStage = summary.completed_stages.find((stage) => stage.id === "validate");
  const repairStage = summary.completed_stages.find((stage) => stage.id === "repair-once");

  assert.equal(summary.final_status, "generated_only");
  assert.equal(validateStage.status, "failure");
  assert.equal(repairStage.status, "success");
  assert.equal(summary.repair_attempted, true);
  assert.equal(summary.validation.ok, true);
  assert(!JSON.stringify(summary).includes("stdout"));
  assert(!JSON.stringify(summary).includes("stderr"));
  assert(!JSON.stringify(summary).includes("prompts"));

  const initialValidation = JSON.parse(await fs.readFile(plan.outputs.validation, "utf8"));
  const repairValidation = JSON.parse(await fs.readFile(plan.outputs.repair_validation, "utf8"));
  assert.equal(initialValidation.ok, false);
  assert.equal(repairValidation.ok, true);
});

test("daily Codex DAG-lite runner rejects Codex repository writes outside work dir", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "daily-codex-mvp-codex-guard-"));
  await writeMinimalRepoFiles(rootDir);
  const codexBin = await writeFakeCodexCommand(rootDir);
  const plan = await prepareDailyCodexPipeline({
    rootDir,
    reportDate: "2026-07-06",
    codexBin
  });

  await assert.rejects(runDailyCodexPipeline(plan), /modified repository paths outside work dir/);
  const summary = JSON.parse(await fs.readFile(plan.outputs.run_summary, "utf8"));
  const generateStage = summary.completed_stages.find((stage) => stage.id === "codex-generate");

  assert.equal(summary.final_status, "blocked");
  assert.equal(summary.ok, false);
  assert.equal(summary.stage_id, "codex-generate");
  assert.equal(summary.failures.some((failure) => failure.includes("package.json")), true);
  assert.equal(generateStage.status, "failure");
  assert.match(generateStage.failures[0].message, /package\.json/);
});

test("daily Codex DAG-lite runner fails after one unsuccessful repair", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "daily-codex-mvp-failure-"));
  await writeMinimalRepoFiles(rootDir);
  const plan = await prepareDailyCodexPipeline({
    rootDir,
    reportDate: "2026-07-06",
    fixtureMode: "failure"
  });

  await assert.rejects(runDailyCodexPipeline(plan), /summary|required|items/i);
  const summary = JSON.parse(await fs.readFile(plan.outputs.run_summary, "utf8"));
  assert.equal(summary.final_status, "blocked");
  assert.equal(summary.completed_stages.length, 6);
  assert.equal(summary.completed_stages.find((stage) => stage.id === "repair-once").status, "failure");
  assert.equal(summary.completed_stages.find((stage) => stage.id === "summarize").status, "failure");
  assert.equal(summary.next_action.kind, "inspect_mvp_failure");
});

test("daily Codex DAG-lite CLI exits zero for fixture success and writes summary", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "daily-codex-mvp-cli-success-"));
  await writeMinimalRepoFiles(rootDir);
  const { stdout } = await execFileAsync(process.execPath, [
    path.join(repoRoot, "scripts", "run-daily-codex-pipeline.mjs"),
    "--repo-root",
    rootDir,
    "--date",
    "2026-07-06",
    "--fixture",
    "success"
  ]);

  const result = JSON.parse(stdout);
  assert.equal(result.ok, true);
  assert.equal(result.final_status, "generated_only");
  assert.equal(result.execute_requested, false);
  assert.equal(result.publish_requested, false);
  assert(result.summary_path.endsWith(path.join(".tmp", "run-summary-2026-07-06.json")));
  const summary = JSON.parse(await fs.readFile(result.summary_path, "utf8"));
  assert.equal(summary.completed_stages.length, 6);
  assert.equal(summary.summary_path, result.summary_path);
});

test("daily Codex DAG-lite CLI accepts npm-style positional date and fixture", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "daily-codex-mvp-cli-positional-"));
  await writeMinimalRepoFiles(rootDir);
  const { stdout } = await execFileAsync(process.execPath, [
    path.join(repoRoot, "scripts", "run-daily-codex-pipeline.mjs"),
    "--repo-root",
    rootDir,
    "2026-07-06",
    "success"
  ], {
    env: {
      ...process.env,
      npm_config_date: "true",
      npm_config_fixture: "true"
    }
  });

  const result = JSON.parse(stdout);
  assert.equal(result.ok, true);
  assert.equal(result.final_status, "generated_only");
});

test("daily Codex DAG-lite CLI exits non-zero for unrepaired fixture failure", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "daily-codex-mvp-cli-failure-"));
  await writeMinimalRepoFiles(rootDir);

  await assert.rejects(execFileAsync(process.execPath, [
    path.join(repoRoot, "scripts", "run-daily-codex-pipeline.mjs"),
    "--repo-root",
    rootDir,
    "--date",
    "2026-07-06",
    "--fixture",
    "failure"
  ]), (error) => {
    const result = JSON.parse(error.stdout);
    assert.equal(result.ok, false);
    assert.equal(result.mode, "daily_codex_dag_lite");
    assert.equal(result.final_status, "blocked");
    assert(result.summary_path.endsWith(path.join(".tmp", "run-summary-2026-07-06.json")));
    return true;
  });
});

test("daily Codex DAG-lite CLI accepts production execute publish flags with codex.cmd", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "daily-codex-mvp-cli-production-"));
  await writeMinimalRepoFiles(rootDir);
  const codexCmd = await writeSuccessfulCodexCommand(rootDir, "2026-07-06");

  const { stdout } = await execFileAsync(process.execPath, [
    path.join(repoRoot, "scripts", "run-daily-codex-pipeline.mjs"),
    "--repo-root",
    rootDir,
    "--date",
    "2026-07-06",
    "--execute",
    "--publish",
    "--codex-bin",
    codexCmd,
    "--",
    "codex.cmd",
    "--fake-codex-argv"
  ]);

  const result = JSON.parse(stdout);
  assert.equal(result.ok, true);
  assert.equal(result.final_status, "generated_only");
  assert.equal(result.execute_requested, true);
  assert.equal(result.publish_requested, true);
  assert(result.summary_path.endsWith(path.join(".tmp", "run-summary-2026-07-06.json")));

  const summary = JSON.parse(await fs.readFile(result.summary_path, "utf8"));
  assert.equal(summary.execute_requested, true);
  assert.equal(summary.publish_requested, true);
  assert.equal(summary.completed_stages.length, 6);
  assert.equal(summary.failures.length, 0);

  const plan = JSON.parse(await fs.readFile(path.join(rootDir, ".tmp", "daily-codex-mvp", "2026-07-06", "pipeline-plan.json"), "utf8"));
  assert.equal(plan.codex.bin, codexCmd);
  assert.equal(plan.codex.fixture_mode, "");
  assert.equal(plan.execute_requested, true);
  assert.equal(plan.publish_requested, true);
});

test("daily Codex DAG-lite CLI writes root summary for unsupported args", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "daily-codex-mvp-cli-bad-arg-"));
  await writeMinimalRepoFiles(rootDir);

  try {
    await execFileAsync(process.execPath, [
      path.join(repoRoot, "scripts", "run-daily-codex-pipeline.mjs"),
      "--repo-root",
      rootDir,
      "--date",
      "2026-07-06",
      "--unsupported-flag"
    ]);
    assert.fail("unsupported args should fail");
  } catch (error) {
    const result = JSON.parse(error.stdout);
    assert.equal(result.ok, false);
    assert.equal(result.final_status, "initialization_failed");
    assert.equal(result.stage_id, "parse-args");
    assert.equal(result.execute_requested, false);
    assert.equal(result.publish_requested, false);
    assert.match(result.failures.join("\n"), /unsupported daily Codex DAG-lite flag: --unsupported-flag/);
    assert(result.summary_path.endsWith(path.join(".tmp", "run-summary-2026-07-06.json")));

    const summary = JSON.parse(await fs.readFile(result.summary_path, "utf8"));
    assert.equal(summary.final_status, "initialization_failed");
    assert.equal(summary.stage_id, "parse-args");
    assert.deepEqual(summary.completed_stages, []);
  }
});

test("daily Codex DAG-lite CLI writes root summary for missing value flags", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "daily-codex-mvp-cli-missing-value-"));
  await writeMinimalRepoFiles(rootDir);

  try {
    await execFileAsync(process.execPath, [
      path.join(repoRoot, "scripts", "run-daily-codex-pipeline.mjs"),
      "--repo-root",
      rootDir,
      "--date",
      "2026-07-06",
      "--codex-bin",
      "--execute",
      "--publish"
    ]);
    assert.fail("missing value flag should fail");
  } catch (error) {
    const result = JSON.parse(error.stdout);
    assert.equal(result.ok, false);
    assert.equal(result.final_status, "initialization_failed");
    assert.equal(result.stage_id, "parse-args");
    assert.equal(result.execute_requested, true);
    assert.equal(result.publish_requested, true);
    assert.match(result.failures.join("\n"), /flag --codex-bin requires a value/);
    assert(result.summary_path.endsWith(path.join(".tmp", "run-summary-2026-07-06.json")));

    const summary = JSON.parse(await fs.readFile(result.summary_path, "utf8"));
    assert.equal(summary.stage_id, "parse-args");
    assert.equal(summary.execute_requested, true);
    assert.equal(summary.publish_requested, true);
  }
});

test("daily Codex DAG-lite CLI writes root summary for initialization failures", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "daily-codex-mvp-cli-bad-init-"));
  await writeMinimalRepoFiles(rootDir);

  try {
    await execFileAsync(process.execPath, [
      path.join(repoRoot, "scripts", "run-daily-codex-pipeline.mjs"),
      "--repo-root",
      rootDir,
      "--date",
      "2026-07-06",
      "--work-dir",
      rootDir,
      "--execute",
      "--publish",
      "--codex-bin",
      "codex.cmd"
    ]);
    assert.fail("initialization failure should fail");
  } catch (error) {
    const result = JSON.parse(error.stdout);
    assert.equal(result.ok, false);
    assert.equal(result.final_status, "initialization_failed");
    assert.equal(result.stage_id, "initialize");
    assert.equal(result.execute_requested, true);
    assert.equal(result.publish_requested, true);
    assert.match(result.failures.join("\n"), /work dir cannot be the repository root/);
    assert(result.summary_path.endsWith(path.join(".tmp", "run-summary-2026-07-06.json")));

    const summary = JSON.parse(await fs.readFile(result.summary_path, "utf8"));
    assert.equal(summary.execute_requested, true);
    assert.equal(summary.publish_requested, true);
    assert.deepEqual(summary.completed_stages, []);
  }
});

test("daily:codex-pipeline remains the production-facing DAG-lite entrypoint", async () => {
  const packageJson = JSON.parse(await fs.readFile(path.join(repoRoot, "package.json"), "utf8"));
  assert.equal(packageJson.scripts["daily:codex-pipeline"], "node scripts/run-daily-codex-pipeline.mjs");
});

async function writeMinimalRepoFiles(rootDir) {
  await fs.mkdir(path.join(rootDir, "config"), { recursive: true });
  await fs.writeFile(path.join(rootDir, "package.json"), JSON.stringify({
    name: "fixture-daily",
    description: "Fixture daily project",
    scripts: {
      "discover:example": "node example.js",
      "sources:validate": "node sources.js",
      "quality:review": "node quality.js",
      "report:write": "node report.js"
    }
  }, null, 2), "utf8");
  await fs.writeFile(path.join(rootDir, "config", "daily-codex-dag.json"), JSON.stringify({
    nodes: [
      { id: "prepare" },
      { id: "codex-generate" }
    ]
  }, null, 2), "utf8");
}

async function writeFakeCodexCommand(rootDir) {
  const fakeScriptPath = path.join(rootDir, "fake-codex.mjs");
  await fs.writeFile(fakeScriptPath, `
import fs from "node:fs";
import path from "node:path";

const prompt = fs.readFileSync(0, "utf8");
const match = prompt.match(/OUTPUT_PATH=([^\\r\\n]+)/);
if (!match) process.exit(2);
const outputPath = match[1].trim();
fs.writeFileSync(path.resolve("package.json"), JSON.stringify({ name: "mutated", scripts: {} }, null, 2));
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify({
  report_date: "2026-07-06",
  headline: "Fake Codex output",
  summary: "This output is valid, but the command also mutates the repository.",
  items: [{ title: "Mutation", url: "https://example.com/mutation", note: "Repository mutation should be rejected." }]
}, null, 2));
`, "utf8");

  if (process.platform === "win32") {
    const commandPath = path.join(rootDir, "fake-codex.cmd");
    await fs.writeFile(commandPath, `@echo off\r\n"${process.execPath}" "%~dp0fake-codex.mjs" %*\r\n`, "utf8");
    return commandPath;
  }

  const commandPath = path.join(rootDir, "fake-codex");
  await fs.writeFile(commandPath, `#!/usr/bin/env sh\nexec "${process.execPath}" "$(dirname "$0")/fake-codex.mjs" "$@"\n`, "utf8");
  await fs.chmod(commandPath, 0o755);
  return commandPath;
}

async function writeSuccessfulCodexCommand(rootDir, reportDate) {
  const fakeScriptPath = path.join(rootDir, "successful-codex.mjs");
  await fs.writeFile(fakeScriptPath, `
import fs from "node:fs";
import path from "node:path";

const prompt = fs.readFileSync(0, "utf8");
const match = prompt.match(/OUTPUT_PATH=([^\\r\\n]+)/);
if (!match) process.exit(2);
const outputPath = match[1].trim();
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify({
  report_date: "${reportDate}",
  headline: "Fake Codex output",
  summary: "This output proves production execute and publish flags reach the DAG-lite entrypoint.",
  items: [{ title: "Production entrypoint", url: "https://example.com/production-entrypoint", note: "codex.cmd is command configuration, not a fixture mode." }]
}, null, 2));
`, "utf8");

  const commandPath = path.join(rootDir, "codex.cmd");
  if (process.platform === "win32") {
    await fs.writeFile(commandPath, `@echo off\r\n"${process.execPath}" "%~dp0successful-codex.mjs" %*\r\n`, "utf8");
  } else {
    await fs.writeFile(commandPath, `#!/usr/bin/env sh\nexec "${process.execPath}" "$(dirname "$0")/successful-codex.mjs" "$@"\n`, "utf8");
    await fs.chmod(commandPath, 0o755);
  }
  return commandPath;
}
