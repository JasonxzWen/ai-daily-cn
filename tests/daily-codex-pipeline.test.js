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
  assert.equal(summary.completed_stages.length, 7);
  assert.equal(summary.completed_stages.find((stage) => stage.id === "publish").status, "skipped");
  assert.equal(summary.completed_stages.find((stage) => stage.id === "publish").skipped_reason, "source_watch_admitted_artifact_not_provided");
  assert.equal(summary.failures.length, 0);
  assert.equal(summary.publication.ok, false);
  assert.equal(summary.publication.skipped_reason, "source_watch_admitted_artifact_not_provided");

  const plan = JSON.parse(await fs.readFile(path.join(rootDir, ".tmp", "daily-codex-mvp", "2026-07-06", "pipeline-plan.json"), "utf8"));
  assert.equal(plan.codex.bin, codexCmd);
  assert.equal(plan.codex.fixture_mode, "");
  assert.equal(plan.execute_requested, true);
  assert.equal(plan.publish_requested, true);
});

test("daily Codex production orchestrator normalizes legacy daily publish summary", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "daily-codex-production-orchestrator-"));
  const reportDate = "2026-07-06";
  await writeMinimalRepoFiles(rootDir);
  const cleanRoot = path.join(rootDir, ".tmp", "publish-worktrees", "main");
  const reportJsonPath = path.join(cleanRoot, "reports-data", "2026", "07", `${reportDate}.json`);
  const reportHtmlPath = path.join(cleanRoot, "docs", "reports", "2026", "07", `${reportDate}.html`);
  const docsDataJsonPath = path.join(cleanRoot, "docs", "data", "2026", "07", `${reportDate}.json`);
  await fs.mkdir(path.dirname(reportJsonPath), { recursive: true });
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
  await fs.writeFile(reportHtmlPath, "<!doctype html><title>Daily</title>\n", "utf8");
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
        { id: "report_write", status: "passed", output: { report_path: "reports-data/2026/07/2026-07-06.json" } },
        { id: "build", status: "passed" },
        { id: "quality_page_check", status: "passed" },
        { id: "validate", status: "passed" },
        { id: "publish_dry_run_daily", status: "passed" },
        {
          id: "publish_real",
          status: "passed",
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
});

test("daily Codex production orchestrator preserves daily runner mode for AI repair resume", async () => {
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
  const workflowRunner = async ({ summaryPath }) => {
    const legacySummary = {
      report_date: reportDate,
      mode: "publish",
      final_status: "needs_ai_repair",
      clean_repo_root: cleanRoot,
      next_action: {
        kind: "codex_ai_repair_contract",
        contract_path: contractPath,
        summary_path: summaryPath
      },
      stages: [
        { id: "report_draft", status: "passed" },
        { id: "quality_review", status: "failed" }
      ]
    };
    await fs.mkdir(path.dirname(summaryPath), { recursive: true });
    await fs.writeFile(summaryPath, `${JSON.stringify(legacySummary, null, 2)}\n`, "utf8");
    return { summary: legacySummary, summaryPath };
  };

  const { summary } = await runDailyCodexPipeline(plan, { workflowRunner });

  assert.equal(summary.final_status, "needs_ai_repair");
  assert.equal(summary.mode, "publish");
  assert.equal(summary.automation_pipeline_mode, "single_script_dag_orchestrator");
  assert.equal(summary.next_action.contract_path, contractPath);

  const saved = JSON.parse(await fs.readFile(plan.outputs.run_summary, "utf8"));
  assert.equal(saved.mode, "publish");
  assert.equal(saved.automation_pipeline_mode, "single_script_dag_orchestrator");
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
    assert.equal(result.source_watch_admitted_artifact_path, artifactPath);
    assert.equal(result.publication, null);
    assert.match(result.failures.join("\n"), /flag --codex-bin requires a value/);
    assert(result.summary_path.endsWith(path.join(".tmp", "run-summary-2026-07-06.json")));

    const summary = JSON.parse(await fs.readFile(result.summary_path, "utf8"));
    assert.equal(summary.stage_id, "parse-args");
    assert.equal(summary.execute_requested, true);
    assert.equal(summary.publish_requested, true);
    assert.equal(summary.source_watch_admitted_artifact_path, artifactPath);
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
