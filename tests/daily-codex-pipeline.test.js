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
  spawnWithPrompt,
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

test("daily Codex runner records a bounded per-invocation timeout", () => {
  const plan = buildDailyCodexPipelinePlan({
    rootDir: path.join(os.tmpdir(), "daily-codex-timeout-plan"),
    reportDate: "2026-07-06",
    codexTimeoutMs: 75
  });

  assert.equal(plan.codex.timeout_ms, 75);
});

test("daily Codex timeout has a bounded kill grace even when tree termination hangs", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "daily-codex-timeout-hard-bound-"));
  const startedAt = Date.now();

  await assert.rejects(
    spawnWithPrompt(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
      cwd: rootDir,
      stdoutPath: path.join(rootDir, "stdout.log"),
      stderrPath: path.join(rootDir, "stderr.log"),
      prompt: "",
      timeoutMs: 30,
      terminationGraceMs: 40,
      terminateProcessTree: () => new Promise(() => {})
    }),
    (error) => error?.code === "codex_timeout" && error?.timeout_ms === 30
  );

  assert(Date.now() - startedAt < 1000, "timeout must settle after the bounded termination grace");
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
  assert.equal(summary.stage_timing.stage_count, 6);
  assert.equal(summary.artifact_sizes.plan_path.exists, true);
  assert.equal(summary.artifact_sizes.final_artifact.exists, true);
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
  ], {
    env: {
      ...process.env,
      npm_config_model: "gpt-5.6-sol"
    }
  });

  const result = JSON.parse(stdout);
  assert.equal(result.ok, true);
  assert.equal(result.final_status, "generated_only");
  assert.equal(result.execute_requested, true);
  assert.equal(result.publish_requested, true);
  assert(result.summary_path.endsWith(path.join(".tmp", "run-summary-2026-07-06.json")));

  const summary = JSON.parse(await fs.readFile(result.summary_path, "utf8"));
  assert.equal(summary.execute_requested, true);
  assert.equal(summary.publish_requested, true);
  assert.equal(summary.completed_stages.length, 7);
  assert.equal(summary.completed_stages.find((stage) => stage.id === "publish").status, "skipped");
  assert.equal(summary.completed_stages.find((stage) => stage.id === "publish").skipped_reason, "source_watch_admitted_artifact_not_provided");
  assert.equal(summary.failures.length, 0);
  assert.equal(summary.publication.ok, false);
  assert.equal(summary.publication.skipped_reason, "source_watch_admitted_artifact_not_provided");

  const plan = JSON.parse(await fs.readFile(path.join(rootDir, ".tmp", "daily-codex-mvp", "2026-07-06", "pipeline-plan.json"), "utf8"));
  assert.equal(plan.codex.bin, codexCmd);
  assert.equal(plan.codex.model, "");
  assert.equal(plan.codex.fixture_mode, "");
  assert.equal(plan.execute_requested, true);
  assert.equal(plan.publish_requested, true);
  const codexArgv = JSON.parse(await fs.readFile(path.join(plan.work_dir, "codex-argv.json"), "utf8"));
  assert(codexArgv.includes("--ignore-user-config"));
  const approvalConfigIndex = codexArgv.indexOf("-c");
  assert.notEqual(approvalConfigIndex, -1);
  assert.equal(codexArgv[approvalConfigIndex + 1].replaceAll('"', ""), "approval_policy=never");
  if (process.platform === "win32") {
    assert(codexArgv.some((arg) => arg.replaceAll('"', "") === "windows.sandbox=unelevated"));
  }
});

test("daily Codex DAG-lite CLI accepts a leading npm argument separator", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "daily-codex-mvp-cli-leading-separator-"));
  await writeMinimalRepoFiles(rootDir);
  const codexCmd = await writeSuccessfulCodexCommand(rootDir, "2026-07-06");

  const { stdout } = await execFileAsync(process.execPath, [
    path.join(repoRoot, "scripts", "run-daily-codex-pipeline.mjs"),
    "--",
    "--repo-root",
    rootDir,
    "--date",
    "2026-07-06",
    "--execute",
    "--publish",
    "--codex-bin",
    codexCmd
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
  assert.equal(summary.failures.length, 0);
});

test("daily Codex production orchestrator normalizes legacy daily publish summary", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "daily-codex-production-orchestrator-"));
  const reportDate = "2026-07-06";
  await writeMinimalRepoFiles(rootDir);
  const cleanRoot = path.join(rootDir, ".tmp", "publish-worktrees", "main");
  const reportJsonPath = path.join(cleanRoot, "reports-data", "2026", "07", `${reportDate}.json`);
  const candidatesJsonPath = path.join(cleanRoot, "reports-data", "internal", "candidates", "2026", "07", `${reportDate}.candidates.json`);
  const reportHtmlPath = path.join(cleanRoot, "docs", "reports", "2026", "07", `${reportDate}.html`);
  const docsDataJsonPath = path.join(cleanRoot, "docs", "data", "2026", "07", `${reportDate}.json`);
  const reportHtml = "<!doctype html><title>Daily</title>\n";
  await fs.mkdir(path.dirname(reportJsonPath), { recursive: true });
  await fs.mkdir(path.dirname(candidatesJsonPath), { recursive: true });
  await fs.mkdir(path.dirname(reportHtmlPath), { recursive: true });
  await fs.mkdir(path.dirname(docsDataJsonPath), { recursive: true });
  await fs.writeFile(reportJsonPath, `${JSON.stringify({
    report_date: reportDate,
    quality_status: {
      status: "degraded",
      degraded_sections: [{ code: "china_ai_no_recent_signal", section: "china_ai" }],
      blocking_issues: []
    }
  }, null, 2)}\n`, "utf8");
  await fs.writeFile(candidatesJsonPath, "{\"candidates\":[]}\n", "utf8");
  await fs.writeFile(reportHtmlPath, reportHtml, "utf8");
  await fs.writeFile(docsDataJsonPath, "{}\n", "utf8");

  const plan = await prepareDailyCodexPipeline({
    rootDir,
    reportDate,
    executeRequested: true,
    publishRequested: true,
    codexBin: "codex.cmd"
  });
  const workflowRunner = async ({ summaryPath }) => {
    const legacySummary = {
      report_date: reportDate,
      mode: "publish",
      final_status: "published_degraded",
      next_action: { kind: "none" },
      clean_repo_root: cleanRoot,
      stages: [
        { id: "report_write", status: "passed", updated_at: "2026-07-06T00:00:01.000Z", output: { report_path: "reports-data/2026/07/2026-07-06.json" } },
        { id: "build", status: "passed", updated_at: "2026-07-06T00:00:03.000Z" },
        { id: "quality_page_check", status: "passed", updated_at: "2026-07-06T00:00:06.000Z" },
        { id: "validate", status: "passed", updated_at: "2026-07-06T00:00:10.000Z" },
        { id: "publish_dry_run_daily", status: "passed", updated_at: "2026-07-06T00:00:15.000Z" },
        {
          id: "publish_real",
          status: "passed",
          started_at: "2026-07-06T00:00:15.000Z",
          finished_at: "2026-07-06T00:00:22.000Z",
          duration_ms: 7000,
          output: {
            publish_status: {
              repo_pushed: true,
              commit: "abc1234",
              pages_url: "https://example.com/reports/2026/07/2026-07-06.html"
            }
          }
        },
        {
          id: "pages_verify",
          status: "passed",
          updated_at: "2026-07-06T00:00:30.000Z",
          output: {
            pages_url: "https://example.com/reports/2026/07/2026-07-06.html",
            http_status: 200
          }
        }
      ]
    };
    await fs.mkdir(path.dirname(summaryPath), { recursive: true });
    await fs.writeFile(summaryPath, `${JSON.stringify(legacySummary, null, 2)}\n`, "utf8");
    return { summary: legacySummary, summaryPath };
  };

  const { summary } = await runDailyCodexPipeline(plan, { workflowRunner });

  assert.equal(summary.automation_pipeline_mode, "single_script_dag_orchestrator");
  assert.equal(summary.mode, "publish");
  assert.equal(summary.final_status, "published");
  assert.equal(summary.legacy_final_status, "published_degraded");
  assert.equal(summary.orchestration.node_count, 2);
  assert.equal(summary.orchestration_node_count, 2);
  assert.equal(
    summary.pipeline_plan_path,
    path.join(rootDir, ".tmp", "daily-codex-pipeline", reportDate, "pipeline-plan.json")
  );
  assert.equal(summary.structured_json_path, reportJsonPath);
  assert.equal(summary.html_path, reportHtmlPath);
  assert.equal(summary.docs_data_json_path, docsDataJsonPath);
  assert.equal(summary.artifact_sizes.pipeline_plan_path.exists, true);
  assert.equal(summary.artifact_sizes.structured_json_path.exists, true);
  assert.equal(summary.artifact_sizes.candidates_json_path.exists, true);
  assert.equal(summary.artifact_sizes.html_path.bytes, Buffer.byteLength(reportHtml));
  assert.equal(summary.stage_timing.stage_count, 7);
  assert(summary.stage_timing.known_stage_duration_ms > 0);
  assert.equal(summary.completed_stages.find((stage) => stage.id === "build").duration_source, "updated_at_delta");
  assert.equal(summary.completed_stages.find((stage) => stage.id === "publish_real").duration_ms, 7000);
  assert.equal(summary.completed_stages.find((stage) => stage.id === "publish_real").duration_source, "explicit");
  assert.deepEqual(summary.blocking_issues, []);
  assert.equal(summary.degraded_sections[0].code, "china_ai_no_recent_signal");
  assert.equal(summary.publication.repo_pushed, true);
  assert.equal(summary.publication.commit, "abc1234");
  assert.equal(summary.pages.verified, true);
  assert.equal(summary.source_watch_admitted_artifact_path, "");
  assert.deepEqual(summary.completed_stages.map((stage) => stage.id), [
    "report_write",
    "build",
    "quality_page_check",
    "validate",
    "publish_dry_run_daily",
    "publish_real",
    "pages_verify"
  ]);

  const saved = JSON.parse(await fs.readFile(plan.outputs.run_summary, "utf8"));
  assert.equal(saved.automation_pipeline_mode, "single_script_dag_orchestrator");
  assert.equal(saved.mode, "publish");
  assert.equal(saved.final_status, "published");
  assert.equal(saved.artifact_sizes.html_path.bytes, Buffer.byteLength(reportHtml));
});

test("daily Codex production orchestrator runs no-publish execute as production dry-run", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "daily-codex-production-dry-run-"));
  const reportDate = "2026-07-06";
  await writeMinimalRepoFiles(rootDir);
  const cleanRoot = path.join(rootDir, ".tmp", "publish-worktrees", "main");
  const reportJsonPath = path.join(cleanRoot, "reports-data", "2026", "07", `${reportDate}.json`);
  const candidatesJsonPath = path.join(cleanRoot, "reports-data", "internal", "candidates", "2026", "07", `${reportDate}.candidates.json`);
  const reportHtmlPath = path.join(cleanRoot, "docs", "reports", "2026", "07", `${reportDate}.html`);
  const docsDataJsonPath = path.join(cleanRoot, "docs", "data", "2026", "07", `${reportDate}.json`);
  await fs.mkdir(path.dirname(reportJsonPath), { recursive: true });
  await fs.mkdir(path.dirname(candidatesJsonPath), { recursive: true });
  await fs.mkdir(path.dirname(reportHtmlPath), { recursive: true });
  await fs.mkdir(path.dirname(docsDataJsonPath), { recursive: true });
  await fs.writeFile(reportJsonPath, `${JSON.stringify({
    report_date: reportDate,
    quality_status: {
      status: "ok",
      degraded_sections: [],
      blocking_issues: []
    }
  }, null, 2)}\n`, "utf8");
  await fs.writeFile(candidatesJsonPath, "{\"candidates\":[]}\n", "utf8");
  await fs.writeFile(reportHtmlPath, "<!doctype html><title>Dry run</title>\n", "utf8");
  await fs.writeFile(docsDataJsonPath, "{}\n", "utf8");

  const plan = await prepareDailyCodexPipeline({
    rootDir,
    reportDate,
    executeRequested: true,
    publishRequested: false,
    codexBin: "codex.cmd"
  });
  let seenPublishFlag = null;
  const workflowRunner = async ({ publish, summaryPath }) => {
    seenPublishFlag = publish;
    const legacySummary = {
      report_date: reportDate,
      mode: "dry-run",
      final_status: "generated_only",
      next_action: { kind: "none" },
      clean_repo_root: cleanRoot,
      stages: [
        { id: "report_write", status: "passed", updated_at: "2026-07-06T00:00:01.000Z" },
        { id: "build", status: "passed", updated_at: "2026-07-06T00:00:03.000Z" },
        { id: "quality_page_check", status: "passed", updated_at: "2026-07-06T00:00:06.000Z" },
        { id: "validate", status: "passed", updated_at: "2026-07-06T00:00:10.000Z" },
        { id: "publish_dry_run_daily", status: "passed", updated_at: "2026-07-06T00:00:15.000Z" }
      ]
    };
    await fs.mkdir(path.dirname(summaryPath), { recursive: true });
    await fs.writeFile(summaryPath, `${JSON.stringify(legacySummary, null, 2)}\n`, "utf8");
    return { summary: legacySummary, summaryPath };
  };

  const { summary } = await runDailyCodexPipeline(plan, { workflowRunner });

  assert.equal(seenPublishFlag, false);
  assert.equal(summary.automation_pipeline_mode, "single_script_dag_orchestrator");
  assert.equal(summary.mode, "dry-run");
  assert.equal(summary.final_status, "generated_only");
  assert.equal(summary.ok, true);
  assert.equal(summary.publish_requested, false);
  assert.equal(summary.execute_requested, true);
  assert.equal(summary.structured_json_path, reportJsonPath);
  assert.equal(summary.html_path, reportHtmlPath);
  assert.equal(summary.docs_data_json_path, docsDataJsonPath);
  assert.equal(summary.artifact_sizes.structured_json_path.exists, true);
  assert.equal(summary.artifact_sizes.html_path.exists, true);
  assert.equal(summary.publication.repo_pushed, false);
  assert.equal(summary.publication.skipped_reason, "publish_stage_not_reached");
  assert.deepEqual(summary.completed_stages.map((stage) => stage.id), [
    "report_write",
    "build",
    "quality_page_check",
    "validate",
    "publish_dry_run_daily"
  ]);

  const saved = JSON.parse(await fs.readFile(plan.outputs.run_summary, "utf8"));
  assert.equal(saved.mode, "dry-run");
  assert.equal(saved.publish_requested, false);
  assert.equal(saved.artifact_sizes.html_path.exists, true);
});

test("daily Codex production summary reports the latest unresolved failed stage", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "daily-codex-production-terminal-stage-"));
  const reportDate = "2026-07-06";
  await writeMinimalRepoFiles(rootDir);
  const plan = await prepareDailyCodexPipeline({
    rootDir,
    reportDate,
    executeRequested: true,
    publishRequested: false,
    codexBin: "codex.cmd"
  });
  const workflowRunner = async ({ summaryPath }) => {
    const legacySummary = {
      report_date: reportDate,
      mode: "dry-run",
      final_status: "blocked",
      next_action: { kind: "inspect_blocker" },
      clean_repo_root: path.join(rootDir, ".tmp", "publish-worktrees", "main"),
      stages: [
        { id: "quality_review", status: "failed", error: "first review needs repair" },
        { id: "quality_ai_repair", status: "passed" },
        { id: "quality_review", status: "passed" },
        { id: "report_write", status: "failed", error: "candidate coverage failed" }
      ]
    };
    await fs.writeFile(summaryPath, `${JSON.stringify(legacySummary, null, 2)}\n`, "utf8");
    return { summary: legacySummary, summaryPath };
  };

  const { summary } = await runDailyCodexPipeline(plan, { workflowRunner });

  assert.equal(summary.stage_id, "report_write");
  assert.equal(summary.failed_stage_id, "report_write");
  assert.equal(summary.error, "candidate coverage failed");
});

test("daily Codex successful fallback clears recovered failure metadata", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "daily-codex-production-recovered-publish-"));
  const reportDate = "2026-07-06";
  await writeMinimalRepoFiles(rootDir);
  const plan = await prepareDailyCodexPipeline({
    rootDir,
    reportDate,
    executeRequested: true,
    publishRequested: true,
    codexBin: "codex.cmd"
  });
  const workflowRunner = async ({ summaryPath }) => {
    const legacySummary = {
      report_date: reportDate,
      mode: "publish",
      final_status: "published",
      next_action: { kind: "none" },
      clean_repo_root: path.join(rootDir, ".tmp", "publish-worktrees", "main"),
      stages: [
        { id: "publish_real", status: "failed", error: "git push failed" },
        { id: "publish_github_api_fallback", status: "passed", output: { publish_status: { repo_pushed: true } } },
        { id: "pages_verify", status: "passed", output: { http_status: 200 } }
      ]
    };
    await fs.writeFile(summaryPath, `${JSON.stringify(legacySummary, null, 2)}\n`, "utf8");
    return { summary: legacySummary, summaryPath };
  };

  const { summary } = await runDailyCodexPipeline(plan, { workflowRunner });

  assert.equal(summary.final_status, "published");
  assert.equal(summary.stage_id, "pages_verify");
  assert.equal(summary.failed_stage_id, "");
  assert.equal(summary.error, "");
});

test("daily Codex structured summaries use the latest duplicate stage result", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "daily-codex-production-latest-stage-contract-"));
  const reportDate = "2026-07-06";
  await writeMinimalRepoFiles(rootDir);
  const plan = await prepareDailyCodexPipeline({
    rootDir,
    reportDate,
    executeRequested: true,
    publishRequested: true,
    codexBin: "codex.cmd"
  });
  const workflowRunner = async ({ summaryPath }) => {
    const legacySummary = {
      report_date: reportDate,
      mode: "publish",
      final_status: "published",
      next_action: { kind: "none" },
      clean_repo_root: path.join(rootDir, ".tmp", "publish-worktrees", "main"),
      stages: [
        { id: "report_write", status: "failed", error: "first write failed" },
        { id: "report_write", status: "passed" },
        { id: "publish_real", status: "failed", output: { repo_pushed: false } },
        { id: "publish_real", status: "passed", output: { repo_pushed: true, commit: "latest-commit" } },
        { id: "pages_verify", status: "failed", output: { http_status: 500, error: "first pages check failed" } },
        { id: "pages_verify", status: "passed", output: { http_status: 200 } }
      ]
    };
    await fs.writeFile(summaryPath, `${JSON.stringify(legacySummary, null, 2)}\n`, "utf8");
    return { summary: legacySummary, summaryPath };
  };

  const { summary } = await runDailyCodexPipeline(plan, { workflowRunner });

  assert.equal(summary.validation.report_write.status, "passed");
  assert.equal(summary.validation.report_write.ok, true);
  assert.equal(summary.publication.publish_real.status, "passed");
  assert.equal(summary.publication.repo_pushed, true);
  assert.equal(summary.publication.commit, "latest-commit");
  assert.equal(summary.pages.status, "passed");
  assert.equal(summary.pages.verified, true);
  assert.equal(summary.pages.http_status, 200);
  assert.equal(summary.pages.message, "");
});

test("daily Codex production orchestrator does not claim an unconsumed Source Watch artifact", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "daily-codex-production-source-watch-status-"));
  const reportDate = "2026-07-06";
  await writeMinimalRepoFiles(rootDir);
  const requestedArtifactPath = path.join(
    rootDir,
    ".tmp",
    "daily-codex-pipeline",
    reportDate,
    "artifacts",
    "admitted-candidates.json"
  );
  const plan = await prepareDailyCodexPipeline({
    rootDir,
    reportDate,
    executeRequested: true,
    publishRequested: true,
    sourceWatchAdmittedArtifactPath: requestedArtifactPath,
    codexBin: "codex.cmd"
  });
  const workflowRunner = async ({ summaryPath }) => {
    const runningSummary = JSON.parse(await fs.readFile(summaryPath, "utf8"));
    assert.equal(runningSummary.source_watch_admitted_artifact_path, "");
    assert.equal(runningSummary.source_watch_requested_artifact_path, requestedArtifactPath);
    assert.equal(runningSummary.source_watch.production_status, "not_connected");
    assert.equal(runningSummary.source_watch.consumed, false);
    const legacySummary = {
      report_date: reportDate,
      mode: "publish",
      final_status: "published",
      clean_repo_root: path.join(rootDir, ".tmp", "publish-worktrees", "main"),
      next_action: { kind: "none" },
      stages: [
        { id: "publish_real", status: "passed", output: { publish_status: { repo_pushed: true } } },
        { id: "pages_verify", status: "passed", output: { http_status: 200 } }
      ]
    };
    await fs.writeFile(summaryPath, `${JSON.stringify(legacySummary, null, 2)}\n`, "utf8");
    return { summary: legacySummary, summaryPath };
  };

  const { summary } = await runDailyCodexPipeline(plan, { workflowRunner });

  assert.equal(summary.source_watch_admitted_artifact_path, "");
  assert.equal(summary.source_watch.requested_artifact_path, requestedArtifactPath);
  assert.equal(summary.source_watch.consumed, false);
  assert.equal(summary.source_watch.production_status, "not_connected");
});

test("daily Codex production orchestrator preserves daily runner mode when automated AI repair is disabled", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "daily-codex-production-repair-mode-"));
  const reportDate = "2026-07-06";
  await writeMinimalRepoFiles(rootDir);
  const cleanRoot = path.join(rootDir, ".tmp", "publish-worktrees", "main");
  const contractPath = path.join(rootDir, ".tmp", `quality-ai-repair-${reportDate}.json`);

  const plan = await prepareDailyCodexPipeline({
    rootDir,
    reportDate,
    executeRequested: true,
    publishRequested: true,
    codexBin: "codex.cmd"
  });
  const legacySummary = {
    report_date: reportDate,
    mode: "publish",
    final_status: "needs_ai_repair",
    clean_repo_root: cleanRoot,
    next_action: {
      kind: "codex_ai_repair_contract",
      contract_path: contractPath,
      summary_path: plan.outputs.run_summary
    },
    stages: [
      { id: "report_draft", status: "passed" },
      { id: "quality_review", status: "failed" }
    ]
  };
  await fs.mkdir(path.dirname(plan.outputs.run_summary), { recursive: true });
  await fs.writeFile(plan.outputs.run_summary, `${JSON.stringify(legacySummary, null, 2)}\n`, "utf8");

  const workflowRunner = async ({ summaryPath }) => {
    const seen = JSON.parse(await fs.readFile(summaryPath, "utf8"));
    assert.equal(seen.final_status, "needs_ai_repair");
    assert.equal(seen.mode, "publish");
    assert.equal(seen.automation_pipeline_mode, "single_script_dag_orchestrator");
    assert.equal(seen.next_action.contract_path, contractPath);
    return { summary: seen, summaryPath };
  };

  const { summary } = await runDailyCodexPipeline(plan, {
    workflowRunner,
    maxAutomatedAiRepairAttempts: 0
  });

  assert.equal(summary.final_status, "needs_ai_repair");
  assert.equal(summary.ok, false);
  assert.equal(summary.mode, "publish");
  assert.equal(summary.automation_pipeline_mode, "single_script_dag_orchestrator");
  assert.equal(summary.next_action.contract_path, contractPath);

  const saved = JSON.parse(await fs.readFile(plan.outputs.run_summary, "utf8"));
  assert.equal(saved.ok, false);
  assert.equal(saved.mode, "publish");
  assert.equal(saved.automation_pipeline_mode, "single_script_dag_orchestrator");
});

test("daily Codex production orchestrator authors a repair contract and resumes within one entrypoint run", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "daily-codex-production-auto-repair-"));
  const reportDate = "2026-07-10";
  await writeMinimalRepoFiles(rootDir);
  const cleanRoot = path.join(rootDir, ".tmp", "publish-worktrees", "main");
  const contractPath = path.join(rootDir, ".tmp", `quality-ai-repair-${reportDate}.json`);
  const sourceReportPath = path.join(cleanRoot, ".tmp", "daily-report.json");
  const candidatePoolPath = path.join(cleanRoot, ".tmp", `source-candidates-${reportDate}.json`);
  const qualityReviewPath = path.join(cleanRoot, ".tmp", `quality-review-${reportDate}.json`);
  await fs.mkdir(path.dirname(sourceReportPath), { recursive: true });
  await fs.writeFile(sourceReportPath, `${JSON.stringify({ report_date: reportDate })}\n`, "utf8");
  await fs.writeFile(candidatePoolPath, `${JSON.stringify({ report_date: reportDate, candidates: [] })}\n`, "utf8");
  await fs.writeFile(qualityReviewPath, `${JSON.stringify({ report_date: reportDate, ok: false })}\n`, "utf8");
  const plan = await prepareDailyCodexPipeline({
    rootDir,
    reportDate,
    executeRequested: true,
    publishRequested: true,
    codexBin: "codex.cmd"
  });
  let workflowCalls = 0;
  let authorCalls = 0;

  const workflowRunner = async ({ summaryPath }) => {
    workflowCalls += 1;
    if (workflowCalls === 1) {
      const needsRepair = {
        report_date: reportDate,
        mode: "publish",
        final_status: "needs_ai_repair",
        clean_repo_root: cleanRoot,
        next_action: {
          kind: "codex_ai_repair_contract",
          contract_path: contractPath,
          summary_path: summaryPath,
          source_report_path: sourceReportPath,
          candidate_pool_path: candidatePoolPath,
          quality_review_path: qualityReviewPath,
          ai_review_tasks: [
            { path: "stories[0].what_happened", kind: "public_editorial_rewrite" }
          ]
        },
        stages: [
          { id: "report_draft", status: "passed" },
          { id: "quality_review", status: "failed" }
        ]
      };
      await fs.mkdir(path.dirname(summaryPath), { recursive: true });
      await fs.writeFile(summaryPath, `${JSON.stringify(needsRepair, null, 2)}\n`, "utf8");
      return { summary: needsRepair, summaryPath };
    }

    const contract = JSON.parse(await fs.readFile(contractPath, "utf8"));
    assert.equal(contract.status, "ready");
    assert.equal(contract.report_date, reportDate);
    assert.equal(contract.edits.length, 1);
    const published = {
      report_date: reportDate,
      mode: "publish",
      final_status: "published",
      clean_repo_root: cleanRoot,
      next_action: { kind: "none" },
      stages: [
        { id: "quality_ai_repair", status: "passed" },
        { id: "quality_review", status: "passed" },
        { id: "publish_real", status: "passed", output: { publish_status: { repo_pushed: true } } },
        { id: "pages_verify", status: "passed", output: { http_status: 200 } }
      ]
    };
    await fs.writeFile(summaryPath, `${JSON.stringify(published, null, 2)}\n`, "utf8");
    return { summary: published, summaryPath };
  };

  const aiRepairContractAuthor = async ({ nextAction, attempt }) => {
    authorCalls += 1;
    assert.equal(attempt, 1);
    assert.equal(nextAction.contract_path, contractPath);
    return {
      schema_version: 1,
      report_date: reportDate,
      status: "ready",
      edits: [
        {
          path: "stories[0].what_happened",
          value: "修复后的事实描述。",
          reason: "移除重复叙事。"
        }
      ]
    };
  };

  const { summary } = await runDailyCodexPipeline(plan, {
    workflowRunner,
    aiRepairContractAuthor,
    maxAutomatedAiRepairAttempts: 1
  });

  assert.equal(workflowCalls, 2);
  assert.equal(authorCalls, 1);
  assert.equal(summary.final_status, "published");
  assert.equal(summary.automation_ai_repair.attempted, 1);
  assert.equal(summary.automation_ai_repair.completed, 1);
  assert.equal(summary.automation_ai_repair.terminal_reason, "workflow_completed");
});

test("daily Codex production repair author returns schema-constrained UTF-8 JSON without sandbox writes", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "daily-codex-production-structured-repair-"));
  const reportDate = "2026-07-10";
  await writeMinimalRepoFiles(rootDir);
  const cleanRoot = path.join(rootDir, ".tmp", "publish-worktrees", "main");
  const contractPath = path.join(rootDir, ".tmp", `quality-ai-repair-${reportDate}.json`);
  const sourceReportPath = path.join(cleanRoot, ".tmp", "daily-report.json");
  const candidatePoolPath = path.join(cleanRoot, ".tmp", `source-candidates-${reportDate}.json`);
  const qualityReviewPath = path.join(cleanRoot, ".tmp", `quality-review-${reportDate}.json`);
  await fs.mkdir(path.dirname(sourceReportPath), { recursive: true });
  await fs.writeFile(sourceReportPath, `${JSON.stringify({ report_date: reportDate })}\n`, "utf8");
  await fs.writeFile(candidatePoolPath, `${JSON.stringify({ report_date: reportDate, candidates: [] })}\n`, "utf8");
  await fs.writeFile(qualityReviewPath, `${JSON.stringify({ report_date: reportDate, ok: false })}\n`, "utf8");
  const codexBin = await writeStructuredRepairCodexCommand(rootDir, reportDate);
  const plan = await prepareDailyCodexPipeline({
    rootDir,
    reportDate,
    executeRequested: true,
    publishRequested: true,
    codexBin
  });
  let workflowCalls = 0;

  const workflowRunner = async ({ summaryPath }) => {
    workflowCalls += 1;
    const summary = workflowCalls === 1
      ? {
          report_date: reportDate,
          mode: "publish",
          final_status: "needs_ai_repair",
          clean_repo_root: cleanRoot,
          next_action: {
            kind: "codex_ai_repair_contract",
            contract_path: contractPath,
            summary_path: summaryPath,
            source_report_path: sourceReportPath,
            candidate_pool_path: candidatePoolPath,
            quality_review_path: qualityReviewPath,
            ai_review_tasks: [{ path: "stories[0].what_happened", kind: "public_editorial_rewrite" }]
          },
          stages: [{ id: "quality_review", status: "failed" }]
        }
      : {
          report_date: reportDate,
          mode: "publish",
          final_status: "published",
          clean_repo_root: cleanRoot,
          next_action: { kind: "none" },
          stages: [
            { id: "quality_ai_repair", status: "passed" },
            { id: "quality_review", status: "passed" },
            { id: "publish_real", status: "passed", output: { publish_status: { repo_pushed: true } } },
            { id: "pages_verify", status: "passed", output: { http_status: 200 } }
          ]
        };
    await fs.mkdir(path.dirname(summaryPath), { recursive: true });
    await fs.writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
    return { summary, summaryPath };
  };

  const { summary } = await runDailyCodexPipeline(plan, {
    workflowRunner,
    maxAutomatedAiRepairAttempts: 1
  });

  assert.equal(workflowCalls, 2);
  assert.equal(summary.final_status, "published");
  const contract = JSON.parse(await fs.readFile(contractPath, "utf8"));
  assert.equal(contract.edits[0].value, "修复后的事实描述。");
  const codexArgv = JSON.parse(await fs.readFile(path.join(plan.work_dir, "structured-repair-codex-argv.json"), "utf8"));
  assert(codexArgv.includes("--ignore-user-config"));
  assert.equal(codexArgv[codexArgv.indexOf("--sandbox") + 1], "read-only");
  assert.notEqual(codexArgv.indexOf("--output-schema"), -1);
  assert.notEqual(codexArgv.indexOf("--output-last-message"), -1);
  const prompt = await fs.readFile(path.join(plan.work_dir, "structured-repair-prompt.txt"), "utf8");
  assert.match(prompt, /Return one JSON object as the final response/);
  assert.match(prompt, /Chinese-character ratio of at least 0\.45/);
  assert.doesNotMatch(prompt, /Set-Content|fs\.writeFileSync/);
});

test("daily Codex production repair author times out and terminates the spawned process tree", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "daily-codex-production-repair-timeout-"));
  const reportDate = "2026-07-10";
  await writeMinimalRepoFiles(rootDir);
  const cleanRoot = path.join(rootDir, ".tmp", "publish-worktrees", "main");
  const contractPath = path.join(rootDir, ".tmp", `quality-ai-repair-${reportDate}.json`);
  const sourceReportPath = path.join(cleanRoot, ".tmp", "daily-report.json");
  const candidatePoolPath = path.join(cleanRoot, ".tmp", `source-candidates-${reportDate}.json`);
  const qualityReviewPath = path.join(cleanRoot, ".tmp", `quality-review-${reportDate}.json`);
  await fs.mkdir(path.dirname(sourceReportPath), { recursive: true });
  await fs.writeFile(sourceReportPath, `${JSON.stringify({ report_date: reportDate })}\n`, "utf8");
  await fs.writeFile(candidatePoolPath, `${JSON.stringify({ report_date: reportDate, candidates: [] })}\n`, "utf8");
  await fs.writeFile(qualityReviewPath, `${JSON.stringify({ report_date: reportDate, ok: false })}\n`, "utf8");
  const codexBin = await writeDelayedStructuredRepairCodexCommand(rootDir, reportDate, 400);
  const plan = await prepareDailyCodexPipeline({
    rootDir,
    reportDate,
    executeRequested: true,
    publishRequested: true,
    codexBin,
    codexTimeoutMs: 75
  });
  let workflowCalls = 0;

  const workflowRunner = async ({ summaryPath }) => {
    workflowCalls += 1;
    const summary = workflowCalls === 1
      ? {
          report_date: reportDate,
          mode: "publish",
          final_status: "needs_ai_repair",
          clean_repo_root: cleanRoot,
          next_action: {
            kind: "codex_ai_repair_contract",
            contract_path: contractPath,
            summary_path: summaryPath,
            source_report_path: sourceReportPath,
            candidate_pool_path: candidatePoolPath,
            quality_review_path: qualityReviewPath,
            ai_review_tasks: [{ path: "stories[0].what_happened", kind: "public_editorial_rewrite" }]
          },
          stages: [{ id: "quality_review", status: "failed" }]
        }
      : {
          report_date: reportDate,
          mode: "publish",
          final_status: "published",
          clean_repo_root: cleanRoot,
          next_action: { kind: "none" },
          stages: [{ id: "publish_real", status: "passed", output: { publish_status: { repo_pushed: true } } }]
        };
    await fs.mkdir(path.dirname(summaryPath), { recursive: true });
    await fs.writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
    return { summary, summaryPath };
  };

  const { summary } = await runDailyCodexPipeline(plan, {
    workflowRunner,
    maxAutomatedAiRepairAttempts: 1
  });

  assert.equal(workflowCalls, 1);
  assert.equal(summary.final_status, "blocked");
  assert.equal(summary.error_code, "codex_timeout");
  assert.equal(summary.automation_ai_repair.attempts[0].error_code, "codex_timeout");
  await new Promise((resolve) => setTimeout(resolve, 500));
  await assert.rejects(fs.access(path.join(plan.work_dir, "delayed-codex-completed.txt")));
});

test("daily Codex production orchestrator blocks an invalid automated repair contract before resume", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "daily-codex-production-invalid-repair-"));
  const reportDate = "2026-07-10";
  await writeMinimalRepoFiles(rootDir);
  const cleanRoot = path.join(rootDir, ".tmp", "publish-worktrees", "main");
  const contractPath = path.join(rootDir, ".tmp", `quality-ai-repair-${reportDate}.json`);
  const sourceReportPath = path.join(cleanRoot, ".tmp", "daily-report.json");
  const candidatePoolPath = path.join(cleanRoot, ".tmp", `source-candidates-${reportDate}.json`);
  const qualityReviewPath = path.join(cleanRoot, ".tmp", `quality-review-${reportDate}.json`);
  await fs.mkdir(path.dirname(sourceReportPath), { recursive: true });
  await fs.writeFile(sourceReportPath, "{}\n", "utf8");
  await fs.writeFile(candidatePoolPath, "{}\n", "utf8");
  await fs.writeFile(qualityReviewPath, "{}\n", "utf8");
  const plan = await prepareDailyCodexPipeline({
    rootDir,
    reportDate,
    executeRequested: true,
    publishRequested: true,
    codexBin: "codex.cmd"
  });
  let workflowCalls = 0;
  const workflowRunner = async ({ summaryPath }) => {
    workflowCalls += 1;
    return {
      summaryPath,
      summary: {
        report_date: reportDate,
        mode: "publish",
        final_status: "needs_ai_repair",
        clean_repo_root: cleanRoot,
        next_action: {
          kind: "codex_ai_repair_contract",
          contract_path: contractPath,
          source_report_path: sourceReportPath,
          candidate_pool_path: candidatePoolPath,
          quality_review_path: qualityReviewPath,
          ai_review_tasks: [{ path: "stories[0].what_happened", kind: "public_editorial_rewrite" }]
        },
        stages: []
      }
    };
  };

  const { summary } = await runDailyCodexPipeline(plan, {
    workflowRunner,
    aiRepairContractAuthor: async () => ({
      schema_version: 1,
      report_date: reportDate,
      status: "ready",
      edits: [{ path: "stories[1].what_happened", value: "undeclared edit" }]
    }),
    maxAutomatedAiRepairAttempts: 1
  });

  assert.equal(workflowCalls, 1);
  assert.equal(summary.final_status, "blocked");
  assert.equal(summary.error_code, "automated_ai_repair_contract_invalid");
  assert.equal(summary.automation_ai_repair.completed, 0);
  assert.equal(summary.automation_ai_repair.terminal_reason, "repair_failed");
  await assert.rejects(fs.access(contractPath));
});

test("daily Codex production orchestrator rejects an out-of-scope repair contract path before authoring", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "daily-codex-production-unsafe-repair-path-"));
  const reportDate = "2026-07-10";
  await writeMinimalRepoFiles(rootDir);
  const cleanRoot = path.join(rootDir, ".tmp", "publish-worktrees", "main");
  const unsafeContractPath = path.join(rootDir, "outside", `quality-ai-repair-${reportDate}.json`);
  const sourceReportPath = path.join(cleanRoot, ".tmp", "daily-report.json");
  const candidatePoolPath = path.join(cleanRoot, ".tmp", `source-candidates-${reportDate}.json`);
  const qualityReviewPath = path.join(cleanRoot, ".tmp", `quality-review-${reportDate}.json`);
  await fs.mkdir(path.dirname(sourceReportPath), { recursive: true });
  await fs.writeFile(sourceReportPath, "{}\n", "utf8");
  await fs.writeFile(candidatePoolPath, "{}\n", "utf8");
  await fs.writeFile(qualityReviewPath, "{}\n", "utf8");
  const plan = await prepareDailyCodexPipeline({
    rootDir,
    reportDate,
    executeRequested: true,
    publishRequested: true,
    codexBin: "codex.cmd"
  });
  let authorCalls = 0;
  const workflowRunner = async ({ summaryPath }) => ({
    summaryPath,
    summary: {
      report_date: reportDate,
      mode: "publish",
      final_status: "needs_ai_repair",
      clean_repo_root: cleanRoot,
      next_action: {
        kind: "codex_ai_repair_contract",
        contract_path: unsafeContractPath,
        source_report_path: sourceReportPath,
        candidate_pool_path: candidatePoolPath,
        quality_review_path: qualityReviewPath,
        ai_review_tasks: [{ path: "stories[0].what_happened", kind: "public_editorial_rewrite" }]
      },
      stages: []
    }
  });

  const { summary } = await runDailyCodexPipeline(plan, {
    workflowRunner,
    aiRepairContractAuthor: async () => {
      authorCalls += 1;
      return {
        schema_version: 1,
        report_date: reportDate,
        status: "ready",
        edits: [{ path: "stories[0].what_happened", value: "safe copy" }]
      };
    },
    maxAutomatedAiRepairAttempts: 1
  });

  assert.equal(authorCalls, 0);
  assert.equal(summary.final_status, "blocked");
  assert.equal(summary.error_code, "automated_ai_repair_handoff_invalid");
  assert.equal(summary.automation_ai_repair.completed, 0);
  await assert.rejects(fs.access(unsafeContractPath));
});

test("daily Codex production orchestrator rejects repair evidence outside the clean publish root", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "daily-codex-production-unsafe-repair-input-"));
  const reportDate = "2026-07-10";
  await writeMinimalRepoFiles(rootDir);
  const cleanRoot = path.join(rootDir, ".tmp", "publish-worktrees", "main");
  const contractPath = path.join(rootDir, ".tmp", `quality-ai-repair-${reportDate}.json`);
  const unsafeSourceReportPath = path.join(rootDir, "host-secret.json");
  const candidatePoolPath = path.join(cleanRoot, ".tmp", `source-candidates-${reportDate}.json`);
  const qualityReviewPath = path.join(cleanRoot, ".tmp", `quality-review-${reportDate}.json`);
  await fs.mkdir(path.dirname(candidatePoolPath), { recursive: true });
  await fs.writeFile(unsafeSourceReportPath, "{}\n", "utf8");
  await fs.writeFile(candidatePoolPath, "{}\n", "utf8");
  await fs.writeFile(qualityReviewPath, "{}\n", "utf8");
  const plan = await prepareDailyCodexPipeline({
    rootDir,
    reportDate,
    executeRequested: true,
    publishRequested: true,
    codexBin: "codex.cmd"
  });
  let authorCalls = 0;
  const workflowRunner = async ({ summaryPath }) => ({
    summaryPath,
    summary: {
      report_date: reportDate,
      mode: "publish",
      final_status: "needs_ai_repair",
      clean_repo_root: cleanRoot,
      next_action: {
        kind: "codex_ai_repair_contract",
        contract_path: contractPath,
        source_report_path: unsafeSourceReportPath,
        candidate_pool_path: candidatePoolPath,
        quality_review_path: qualityReviewPath,
        ai_review_tasks: [{ path: "stories[0].what_happened", kind: "public_editorial_rewrite" }]
      },
      stages: []
    }
  });

  const { summary } = await runDailyCodexPipeline(plan, {
    workflowRunner,
    aiRepairContractAuthor: async () => {
      authorCalls += 1;
      return {};
    },
    maxAutomatedAiRepairAttempts: 1
  });

  assert.equal(authorCalls, 0);
  assert.equal(summary.final_status, "blocked");
  assert.equal(summary.error_code, "automated_ai_repair_handoff_invalid");
  assert.match(summary.error, /source_report_path must stay inside clean_repo_root/);
});

test("daily Codex production orchestrator rejects the launcher repository as clean_repo_root", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "daily-codex-production-launcher-as-clean-root-"));
  const reportDate = "2026-07-10";
  await writeMinimalRepoFiles(rootDir);
  const sourceReportPath = path.join(rootDir, ".tmp", "daily-report.json");
  const candidatePoolPath = path.join(rootDir, ".tmp", `source-candidates-${reportDate}.json`);
  const qualityReviewPath = path.join(rootDir, ".tmp", `quality-review-${reportDate}.json`);
  await fs.mkdir(path.dirname(sourceReportPath), { recursive: true });
  await fs.writeFile(sourceReportPath, "{}\n", "utf8");
  await fs.writeFile(candidatePoolPath, "{}\n", "utf8");
  await fs.writeFile(qualityReviewPath, "{}\n", "utf8");
  const plan = await prepareDailyCodexPipeline({
    rootDir,
    reportDate,
    executeRequested: true,
    publishRequested: true,
    codexBin: "codex.cmd"
  });
  let authorCalls = 0;
  const workflowRunner = async ({ summaryPath }) => ({
    summaryPath,
    summary: {
      report_date: reportDate,
      mode: "publish",
      final_status: "needs_ai_repair",
      clean_repo_root: rootDir,
      next_action: {
        kind: "codex_ai_repair_contract",
        contract_path: path.join(rootDir, ".tmp", `quality-ai-repair-${reportDate}.json`),
        source_report_path: sourceReportPath,
        candidate_pool_path: candidatePoolPath,
        quality_review_path: qualityReviewPath,
        ai_review_tasks: [{ path: "stories[0].what_happened", kind: "public_editorial_rewrite" }]
      },
      stages: []
    }
  });

  const { summary } = await runDailyCodexPipeline(plan, {
    workflowRunner,
    aiRepairContractAuthor: async () => {
      authorCalls += 1;
      return {};
    },
    maxAutomatedAiRepairAttempts: 1
  });

  assert.equal(authorCalls, 0);
  assert.equal(summary.final_status, "blocked");
  assert.equal(summary.error_code, "automated_ai_repair_handoff_invalid");
  assert.match(summary.error, /clean_repo_root must stay inside the launcher publish-worktrees directory/);
});

test("daily Codex production orchestrator stops after the automated repair budget is exhausted", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "daily-codex-production-repair-budget-"));
  const reportDate = "2026-07-10";
  await writeMinimalRepoFiles(rootDir);
  const cleanRoot = path.join(rootDir, ".tmp", "publish-worktrees", "main");
  const sourceReportPath = path.join(cleanRoot, ".tmp", "daily-report.json");
  const candidatePoolPath = path.join(cleanRoot, ".tmp", `source-candidates-${reportDate}.json`);
  const qualityReviewPath = path.join(cleanRoot, ".tmp", `quality-review-${reportDate}.json`);
  await fs.mkdir(path.dirname(sourceReportPath), { recursive: true });
  await fs.writeFile(sourceReportPath, "{}\n", "utf8");
  await fs.writeFile(candidatePoolPath, "{}\n", "utf8");
  await fs.writeFile(qualityReviewPath, "{}\n", "utf8");
  const plan = await prepareDailyCodexPipeline({
    rootDir,
    reportDate,
    executeRequested: true,
    publishRequested: true,
    codexBin: "codex.cmd"
  });
  let workflowCalls = 0;
  let authorCalls = 0;
  const workflowRunner = async ({ summaryPath }) => {
    workflowCalls += 1;
    return {
      summaryPath,
      summary: {
        report_date: reportDate,
        mode: "publish",
        final_status: "needs_ai_repair",
        clean_repo_root: cleanRoot,
        next_action: {
          kind: "codex_ai_repair_contract",
          contract_path: path.join(rootDir, ".tmp", `quality-ai-repair-${reportDate}-attempt-${workflowCalls}.json`),
          source_report_path: sourceReportPath,
          candidate_pool_path: candidatePoolPath,
          quality_review_path: qualityReviewPath,
          ai_review_tasks: [{ path: "stories[0].what_happened", kind: "public_editorial_rewrite" }]
        },
        stages: []
      }
    };
  };

  const { summary } = await runDailyCodexPipeline(plan, {
    workflowRunner,
    aiRepairContractAuthor: async () => {
      authorCalls += 1;
      return {
        schema_version: 1,
        report_date: reportDate,
        status: "ready",
        edits: [{ path: "stories[0].what_happened", value: `repair ${authorCalls}` }]
      };
    },
    maxAutomatedAiRepairAttempts: 2
  });

  assert.equal(workflowCalls, 3);
  assert.equal(authorCalls, 2);
  assert.equal(summary.final_status, "needs_ai_repair");
  assert.equal(summary.automation_ai_repair.attempted, 2);
  assert.equal(summary.automation_ai_repair.authored, 2);
  assert.equal(summary.automation_ai_repair.completed, 0);
  assert.equal(summary.automation_ai_repair.terminal_reason, "budget_exhausted");
});

test("daily Codex production orchestrator does not report recovery when repair is followed by a blocked workflow", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "daily-codex-production-repair-blocked-"));
  const reportDate = "2026-07-10";
  await writeMinimalRepoFiles(rootDir);
  const cleanRoot = path.join(rootDir, ".tmp", "publish-worktrees", "main");
  const sourceReportPath = path.join(cleanRoot, ".tmp", "daily-report.json");
  const candidatePoolPath = path.join(cleanRoot, ".tmp", `source-candidates-${reportDate}.json`);
  const qualityReviewPath = path.join(cleanRoot, ".tmp", `quality-review-${reportDate}.json`);
  await fs.mkdir(path.dirname(sourceReportPath), { recursive: true });
  await fs.writeFile(sourceReportPath, "{}\n", "utf8");
  await fs.writeFile(candidatePoolPath, "{}\n", "utf8");
  await fs.writeFile(qualityReviewPath, "{}\n", "utf8");
  const plan = await prepareDailyCodexPipeline({
    rootDir,
    reportDate,
    executeRequested: true,
    publishRequested: true,
    codexBin: "codex.cmd"
  });
  let workflowCalls = 0;
  const workflowRunner = async ({ summaryPath }) => {
    workflowCalls += 1;
    if (workflowCalls === 2) {
      return {
        summaryPath,
        summary: {
          report_date: reportDate,
          mode: "publish",
          final_status: "blocked",
          clean_repo_root: cleanRoot,
          next_action: { kind: "inspect_publish_failure" },
          stages: []
        }
      };
    }
    return {
      summaryPath,
      summary: {
        report_date: reportDate,
        mode: "publish",
        final_status: "needs_ai_repair",
        clean_repo_root: cleanRoot,
        next_action: {
          kind: "codex_ai_repair_contract",
          contract_path: path.join(rootDir, ".tmp", `quality-ai-repair-${reportDate}.json`),
          source_report_path: sourceReportPath,
          candidate_pool_path: candidatePoolPath,
          quality_review_path: qualityReviewPath,
          ai_review_tasks: [{ path: "stories[0].what_happened", kind: "public_editorial_rewrite" }]
        },
        stages: []
      }
    };
  };

  const { summary } = await runDailyCodexPipeline(plan, {
    workflowRunner,
    aiRepairContractAuthor: async () => ({
      schema_version: 1,
      report_date: reportDate,
      status: "ready",
      edits: [{ path: "stories[0].what_happened", value: "safe copy" }]
    }),
    maxAutomatedAiRepairAttempts: 1
  });

  assert.equal(summary.final_status, "blocked");
  assert.equal(summary.automation_ai_repair.authored, 1);
  assert.equal(summary.automation_ai_repair.completed, 0);
  assert.equal(summary.automation_ai_repair.terminal_reason, "workflow_failed");
});

test("daily Codex DAG-lite CLI publishes explicit Source Watch admitted artifact into public articles", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "daily-codex-mvp-cli-source-watch-publish-"));
  const reportDate = "2026-07-03";
  await writeMinimalRepoFiles(rootDir);
  await writeReportSourceFixture(rootDir);
  const artifactPath = path.join(rootDir, ".tmp", "daily-codex-pipeline", reportDate, "artifacts", "admitted-candidates.json");
  await writeAdmittedSourceWatchFixture(artifactPath, reportDate);

  const { stdout } = await execFileAsync(process.execPath, [
    path.join(repoRoot, "scripts", "run-daily-codex-pipeline.mjs"),
    "--repo-root",
    rootDir,
    "--date",
    reportDate,
    "--fixture",
    "success",
    "--publish",
    "--source-watch-admitted-artifact",
    artifactPath,
    "--input",
    "reports-source",
    "--data-input",
    "reports-data",
    "--out",
    "docs",
    "--trend-config",
    path.join(repoRoot, "config", "trends.json"),
    "--generated-at",
    `${reportDate}T08:00:00.000Z`
  ], { maxBuffer: 20 * 1024 * 1024 });

  const result = JSON.parse(stdout);
  assert.equal(result.ok, true);
  assert.equal(result.final_status, "published");
  assert.equal(result.publish_requested, true);
  assert.equal(result.source_watch_admitted_artifact_path, artifactPath);

  const summary = JSON.parse(await fs.readFile(result.summary_path, "utf8"));
  assert.equal(summary.final_status, "published");
  assert.equal(summary.publication.ok, true);
  assert.equal(summary.publication.source_watch_articles, 2);
  assert.equal(summary.publication.source_watch_admitted_artifact_path, artifactPath);
  assert.equal(summary.completed_stages.find((stage) => stage.id === "publish").status, "success");

  const articles = JSON.parse(await fs.readFile(path.join(rootDir, "docs", "articles.json"), "utf8"));
  assert.equal(articles.filter((article) => article.section === "source_watch").length, 2);
  assert(articles.some((article) => article.url === "https://aify-news.pages.dev/"));
  const serialized = JSON.stringify(articles);
  assert.equal(serialized.includes("source_lane"), false);
  assert.equal(serialized.includes("latest_commit="), false);
});

test("daily Codex DAG-lite publish stage records structured failure for unsafe Source Watch artifact paths", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "daily-codex-mvp-cli-source-watch-bad-path-"));
  const reportDate = "2026-07-03";
  await writeMinimalRepoFiles(rootDir);
  await writeReportSourceFixture(rootDir);
  const artifactPath = path.join(rootDir, "admitted-candidates.json");
  await writeAdmittedSourceWatchFixture(artifactPath, reportDate);

  await assert.rejects(execFileAsync(process.execPath, [
    path.join(repoRoot, "scripts", "run-daily-codex-pipeline.mjs"),
    "--repo-root",
    rootDir,
    "--date",
    reportDate,
    "--fixture",
    "success",
    "--publish",
    "--source-watch-admitted-artifact",
    artifactPath,
    "--input",
    "reports-source",
    "--data-input",
    "reports-data",
    "--out",
    "docs",
    "--trend-config",
    path.join(repoRoot, "config", "trends.json")
  ], { maxBuffer: 20 * 1024 * 1024 }), (error) => {
    const result = JSON.parse(error.stdout);
    assert.equal(result.ok, false);
    assert.equal(result.final_status, "blocked");
    assert.equal(result.stage_id, "publish");
    assert.equal(result.publish_requested, true);
    assert.match(result.failures.join("\n"), /must stay under \.tmp[\\/]daily-codex-pipeline/);
    return true;
  });
  await assert.rejects(fs.stat(path.join(rootDir, "docs")), /ENOENT/);
});

test("daily Codex DAG-lite publish stage records structured failure for invalid Source Watch artifacts", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "daily-codex-mvp-cli-source-watch-bad-kind-"));
  const reportDate = "2026-07-03";
  await writeMinimalRepoFiles(rootDir);
  await writeReportSourceFixture(rootDir);
  const artifactPath = path.join(rootDir, ".tmp", "daily-codex-pipeline", reportDate, "artifacts", "admitted-candidates.json");
  await fs.mkdir(path.dirname(artifactPath), { recursive: true });
  await fs.writeFile(artifactPath, `${JSON.stringify({
    kind: "source_watch_quality_candidates",
    report_date: reportDate,
    candidates: []
  }, null, 2)}\n`, "utf8");

  await assert.rejects(execFileAsync(process.execPath, [
    path.join(repoRoot, "scripts", "run-daily-codex-pipeline.mjs"),
    "--repo-root",
    rootDir,
    "--date",
    reportDate,
    "--fixture",
    "success",
    "--publish",
    "--source-watch-admitted-artifact",
    artifactPath,
    "--input",
    "reports-source",
    "--data-input",
    "reports-data",
    "--out",
    "docs",
    "--trend-config",
    path.join(repoRoot, "config", "trends.json")
  ], { maxBuffer: 20 * 1024 * 1024 }), (error) => {
    const result = JSON.parse(error.stdout);
    assert.equal(result.ok, false);
    assert.equal(result.final_status, "blocked");
    assert.equal(result.stage_id, "publish");
    assert.match(result.failures.join("\n"), /kind source_watch_admitted_candidates/);
    assert.equal(result.publication.ok, false);
    assert.equal(result.publication.source_watch_admitted_artifact_path, artifactPath);
    return true;
  });
  await assert.rejects(fs.stat(path.join(rootDir, "docs")), /ENOENT/);
});

test("daily Codex DAG-lite publish stage rejects stale Source Watch admitted artifacts", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "daily-codex-mvp-cli-source-watch-stale-"));
  const reportDate = "2026-07-03";
  await writeMinimalRepoFiles(rootDir);
  await writeReportSourceFixture(rootDir);
  const artifactPath = path.join(rootDir, ".tmp", "daily-codex-pipeline", reportDate, "artifacts", "admitted-candidates.json");
  await writeAdmittedSourceWatchFixture(artifactPath, "2026-07-02");

  await assert.rejects(execFileAsync(process.execPath, [
    path.join(repoRoot, "scripts", "run-daily-codex-pipeline.mjs"),
    "--repo-root",
    rootDir,
    "--date",
    reportDate,
    "--fixture",
    "success",
    "--publish",
    "--source-watch-admitted-artifact",
    artifactPath,
    "--input",
    "reports-source",
    "--data-input",
    "reports-data",
    "--out",
    "docs",
    "--trend-config",
    path.join(repoRoot, "config", "trends.json")
  ], { maxBuffer: 20 * 1024 * 1024 }), (error) => {
    const result = JSON.parse(error.stdout);
    assert.equal(result.ok, false);
    assert.equal(result.final_status, "blocked");
    assert.equal(result.stage_id, "publish");
    assert.match(result.failures.join("\n"), /report_date must match 2026-07-03/);
    assert.equal(result.publication.ok, false);
    return true;
  });
  await assert.rejects(fs.stat(path.join(rootDir, "docs")), /ENOENT/);
});

test("daily Codex DAG-lite publish stage rejects out dirs outside the repository", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "daily-codex-mvp-cli-source-watch-bad-out-"));
  const reportDate = "2026-07-03";
  await writeMinimalRepoFiles(rootDir);
  await writeReportSourceFixture(rootDir);
  const artifactPath = path.join(rootDir, ".tmp", "daily-codex-pipeline", reportDate, "artifacts", "admitted-candidates.json");
  const outsideDir = path.join(path.dirname(rootDir), `${path.basename(rootDir)}-published-outside`);
  await writeAdmittedSourceWatchFixture(artifactPath, reportDate);

  await assert.rejects(execFileAsync(process.execPath, [
    path.join(repoRoot, "scripts", "run-daily-codex-pipeline.mjs"),
    "--repo-root",
    rootDir,
    "--date",
    reportDate,
    "--fixture",
    "success",
    "--publish",
    "--source-watch-admitted-artifact",
    artifactPath,
    "--input",
    "reports-source",
    "--data-input",
    "reports-data",
    "--out",
    outsideDir,
    "--trend-config",
    path.join(repoRoot, "config", "trends.json")
  ], { maxBuffer: 20 * 1024 * 1024 }), (error) => {
    const result = JSON.parse(error.stdout);
    assert.equal(result.ok, false);
    assert.equal(result.final_status, "blocked");
    assert.equal(result.stage_id, "publish");
    assert.match(result.failures.join("\n"), /publish out dir must stay inside the repository/);
    assert.equal(result.publication.ok, false);
    return true;
  });
  await assert.rejects(fs.stat(path.join(outsideDir, "articles.json")), /ENOENT/);
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
  const artifactPath = path.join(rootDir, ".tmp", "daily-codex-pipeline", "2026-07-06", "artifacts", "admitted-candidates.json");

  try {
    await execFileAsync(process.execPath, [
      path.join(repoRoot, "scripts", "run-daily-codex-pipeline.mjs"),
      "--repo-root",
      rootDir,
      "--date",
      "2026-07-06",
      "--source-watch-admitted-artifact",
      artifactPath,
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
    assert.equal(result.source_watch_admitted_artifact_path, "");
    assert.equal(result.source_watch_requested_artifact_path, artifactPath);
    assert.equal(result.source_watch.production_status, "not_connected");
    assert.equal(result.source_watch.consumed, false);
    assert.equal(result.publication, null);
    assert.match(result.failures.join("\n"), /flag --codex-bin requires a value/);
    assert(result.summary_path.endsWith(path.join(".tmp", "run-summary-2026-07-06.json")));

    const summary = JSON.parse(await fs.readFile(result.summary_path, "utf8"));
    assert.equal(summary.stage_id, "parse-args");
    assert.equal(summary.execute_requested, true);
    assert.equal(summary.publish_requested, true);
    assert.equal(summary.source_watch_admitted_artifact_path, "");
    assert.equal(summary.source_watch_requested_artifact_path, artifactPath);
    assert.equal(summary.source_watch.production_status, "not_connected");
    assert.equal(summary.source_watch.consumed, false);
    assert.equal(summary.publication, null);
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

async function writeReportSourceFixture(rootDir) {
  const inputDir = path.join(rootDir, "reports-source");
  await fs.mkdir(inputDir, { recursive: true });
  await fs.copyFile(
    path.join(repoRoot, "tests", "fixtures", "reports", "good", "official-release.md"),
    path.join(inputDir, "official-release.md")
  );
}

async function writeAdmittedSourceWatchFixture(filePath, reportDate) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify({
    schema_version: 1,
    kind: "source_watch_admitted_candidates",
    mode: "source_watch_admit_fixture_output",
    report_date: reportDate,
    public_surface: false,
    admission_audit: {
      public_surface: false,
      admitted_only: true
    },
    candidates: [
      {
        id: "candidate-ml-news",
        canonical_id: "source-watch:ml-news",
        source_id: "repo-ml-news-of-the-week",
        signal: "github_watch",
        title: "SalvatoreRa/ML-news-of-the-week",
        url: "https://github.com/SalvatoreRa/ML-news-of-the-week",
        canonical_url: "https://github.com/SalvatoreRa/ML-news-of-the-week",
        source: "GitHub repo watch: SalvatoreRa/ML-news-of-the-week",
        event_date: reportDate,
        category: "project",
        decision: "admitted",
        quality_score: 88,
        verification_status: "primary_confirmed",
        source_level: "github",
        editorial_category: "open_source",
        repo: "SalvatoreRa/ML-news-of-the-week",
        evidence: "GitHub repo SalvatoreRa/ML-news-of-the-week stars=3210 forks=210 pushed_at=2026-07-05T12:00:00Z",
        notes: "stars=3210; forks=210; pushed_at=2026-07-05T12:00:00Z; latest_commit=bbbbbbbbbbbb",
        repo_delta: { status: "changed", latest_commit_changed: true },
        freshness: { status: "fresh" },
        summary_template: {
          purpose: "SalvatoreRa/ML-news-of-the-week tracks open-source ML news.",
          change: "Historical snapshot changed: latest_commit.",
          evidence: "stars=3210; forks=210; latest_commit=bbbbbbbbbbbb",
          fit: "Internal Source Watch candidate only; public promotion still needs downstream gates."
        },
        tags: ["ml-news", "weekly"]
      },
      {
        id: "candidate-aify",
        canonical_id: "source-watch:aify-news",
        source_id: "site-aify-news",
        signal: "site_watch",
        title: "Aify News",
        url: "https://aify-news.pages.dev/",
        canonical_url: "https://aify-news.pages.dev/",
        source: "Site watch: Aify News",
        event_date: reportDate,
        category: "community_lead",
        decision: "admitted",
        quality_score: 91,
        verification_status: "first_class_source_confirmed",
        source_level: "ai_news_aggregator",
        source_lane: "aify",
        source_tier: "first_class",
        verification_policy: "no_secondary_review_required",
        editorial_category: "community",
        evidence: "Site metadata title=Aify News",
        notes: "feeds=1; discovered_github_repositories=1",
        summary_template: null,
        tags: ["ai-news"]
      }
    ]
  }, null, 2)}\n`, "utf8");
}

async function writeStructuredRepairCodexCommand(rootDir, reportDate) {
  const fakeScriptPath = path.join(rootDir, "structured-repair-codex.mjs");
  await fs.writeFile(fakeScriptPath, `
import fs from "node:fs";
import path from "node:path";

const rootDir = ${JSON.stringify(rootDir)};
const args = process.argv.slice(2);
const prompt = fs.readFileSync(0, "utf8");
const schemaIndex = args.indexOf("--output-schema");
const outputIndex = args.indexOf("--output-last-message");
if (schemaIndex === -1 || outputIndex === -1) process.exit(2);
const schema = JSON.parse(fs.readFileSync(args[schemaIndex + 1], "utf8"));
if (schema.type !== "object" || schema.properties?.status?.const !== "ready") process.exit(3);
const outputPath = path.resolve(args[outputIndex + 1]);
const workDir = path.dirname(path.dirname(outputPath));
fs.mkdirSync(workDir, { recursive: true });
fs.writeFileSync(path.join(workDir, "structured-repair-codex-argv.json"), JSON.stringify(args));
fs.writeFileSync(path.join(workDir, "structured-repair-prompt.txt"), prompt, "utf8");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify({
  schema_version: 1,
  report_date: ${JSON.stringify(reportDate)},
  status: "ready",
  edits: [{
    path: "stories[0].what_happened",
    value: "修复后的事实描述。",
    reason: "移除重复叙事。"
  }]
}, null, 2), "utf8");
`, "utf8");

  if (process.platform === "win32") {
    const commandPath = path.join(rootDir, "structured-repair-codex.cmd");
    await fs.writeFile(commandPath, `@echo off\r\n"${process.execPath}" "%~dp0structured-repair-codex.mjs" %*\r\n`, "utf8");
    return commandPath;
  }

  const commandPath = path.join(rootDir, "structured-repair-codex");
  await fs.writeFile(commandPath, `#!/usr/bin/env sh\nexec "${process.execPath}" "$(dirname "$0")/structured-repair-codex.mjs" "$@"\n`, "utf8");
  await fs.chmod(commandPath, 0o755);
  return commandPath;
}

async function writeDelayedStructuredRepairCodexCommand(rootDir, reportDate, delayMs) {
  const fakeScriptPath = path.join(rootDir, "delayed-structured-repair-codex.mjs");
  await fs.writeFile(fakeScriptPath, `
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
fs.readFileSync(0, "utf8");
const outputIndex = args.indexOf("--output-last-message");
if (outputIndex === -1) process.exit(2);
const outputPath = path.resolve(args[outputIndex + 1]);
const workDir = path.dirname(path.dirname(outputPath));
setTimeout(() => {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify({
    schema_version: 1,
    report_date: ${JSON.stringify(reportDate)},
    status: "ready",
    edits: [{
      path: "stories[0].what_happened",
      value: "超时前不应写出的修复文本。",
      reason: "timeout fixture"
    }]
  }, null, 2), "utf8");
  fs.writeFileSync(path.join(workDir, "delayed-codex-completed.txt"), "completed", "utf8");
}, ${Number(delayMs)});
`, "utf8");

  if (process.platform === "win32") {
    const commandPath = path.join(rootDir, "delayed-structured-repair-codex.cmd");
    await fs.writeFile(commandPath, `@echo off\r\n"${process.execPath}" "%~dp0delayed-structured-repair-codex.mjs" %*\r\n`, "utf8");
    return commandPath;
  }

  const commandPath = path.join(rootDir, "delayed-structured-repair-codex");
  await fs.writeFile(commandPath, `#!/usr/bin/env sh\nexec "${process.execPath}" "$(dirname "$0")/delayed-structured-repair-codex.mjs" "$@"\n`, "utf8");
  await fs.chmod(commandPath, 0o755);
  return commandPath;
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
fs.writeFileSync(path.join(path.dirname(outputPath), "codex-argv.json"), JSON.stringify(process.argv.slice(2)));
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
