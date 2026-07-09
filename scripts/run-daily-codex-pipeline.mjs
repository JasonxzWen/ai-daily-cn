#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { finished } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { runDailyWorkflow } from "../src/daily-runner.js";
import {
  internalCandidatePoolRelativePath,
  legacyCandidatePoolRelativePath
} from "../src/reports-data-layout.js";
import { buildSite } from "../src/site.js";
import { buildWebApp } from "../src/web-app-build.js";

const DEFAULT_WORK_DIR = path.join(".tmp", "daily-codex-mvp");
const DEFAULT_SANDBOX = "workspace-write";
const SINGLE_SCRIPT_AUTOMATION_PIPELINE_MODE = "single_script_dag_orchestrator";
const STAGE_IDS = ["prepare", "collect-context", "codex-generate", "validate", "repair-once", "summarize"];
const PUBLISH_STAGE_ID = "publish";
const REPOSITORY_GUARD_EXCLUDED_DIRS = new Set([".git", ".codegraph", "node_modules"]);

export async function prepareDailyCodexPipeline(options = {}) {
  const plan = buildDailyCodexPipelinePlan(options);
  assertSafeWorkDir(plan);
  await fs.rm(plan.work_dir, { recursive: true, force: true });
  await fs.mkdir(plan.work_dir, { recursive: true });
  await writePlan(plan);
  return plan;
}

export function buildDailyCodexPipelinePlan(options = {}) {
  const rootDir = path.resolve(options.rootDir || options["repo-root"] || process.cwd());
  const reportDate = requiredDate(options.reportDate || options.date);
  const workDir = path.resolve(rootDir, options.workDir || options["work-dir"] || path.join(DEFAULT_WORK_DIR, reportDate));
  const codexBin = options.codexBin || options["codex-bin"] || defaultCodexBin();
  const sandbox = options.sandbox || DEFAULT_SANDBOX;
  const model = options.model || "";
  const fixtureMode = normalizeFixtureMode(options.fixtureMode || options.fixture || "");
  const executeRequested = Boolean(options.executeRequested ?? options.execute ?? false);
  const publishRequested = Boolean(options.publishRequested ?? options.publish ?? false);
  const outputs = buildOutputs({ rootDir, workDir, reportDate });
  const publish = buildPublishConfig(options);
  const stageIds = publishRequested ? [...STAGE_IDS, PUBLISH_STAGE_ID] : STAGE_IDS;
  return {
    version: 2,
    mode: "daily_codex_dag_lite",
    report_date: reportDate,
    root_dir: rootDir,
    work_dir: workDir,
    execute_requested: executeRequested,
    publish_requested: publishRequested,
    codex: {
      bin: codexBin,
      model,
      sandbox,
      fixture_mode: fixtureMode
    },
    publish,
    outputs,
    stages: stageIds.map((id) => buildStage({ id, rootDir, workDir, outputs }))
  };
}

export async function runDailyCodexPipeline(plan, options = {}) {
  if (await shouldRunSingleScriptDagOrchestrator(plan, options)) {
    return await runSingleScriptDagOrchestrator(plan, options);
  }

  const state = {
    plan,
    completedStages: [],
    context: null,
    generation: null,
    validation: null,
    repair: null,
    repairValidation: null,
    repairAttempted: false,
    finalArtifactPath: "",
    finalValidation: null,
    publication: null
  };
  await writeRunSummary(state, { finalStatus: "running" });

  await recordStage(state, "prepare", () => runPrepareStage(state));
  await recordStage(state, "collect-context", () => runCollectContextStage(state, options));
  await recordStage(state, "codex-generate", () => runGenerateStage(state, options));
  await recordStage(state, "validate", () => runValidateStage(state));
  await recordStage(state, "repair-once", () => runRepairStage(state, options));
  await recordStage(state, "summarize", () => runSummarizeStage(state));
  if (state.plan.publish_requested) {
    await recordStage(state, PUBLISH_STAGE_ID, () => runPublishStage(state));
  }

  const finalStatus = finalStatusFor(state);
  const summary = await writeRunSummary(state, { finalStatus });
  return { plan, summary };
}

async function shouldRunSingleScriptDagOrchestrator(plan, options = {}) {
  if (!plan.execute_requested || plan.codex?.fixture_mode) {
    return false;
  }
  if (typeof options.workflowRunner === "function") {
    return true;
  }
  return await productionDailyWorkflowAvailable(plan.root_dir);
}

async function productionDailyWorkflowAvailable(rootDir) {
  const packageJson = await readJsonOrNull(path.join(rootDir, "package.json"));
  return Boolean(
    packageJson?.scripts?.["daily:run"] &&
    await fileExists(path.join(rootDir, "src", "daily-runner.js")) &&
    await fileExists(path.join(rootDir, "src", "cli.js"))
  );
}

async function runSingleScriptDagOrchestrator(plan, options = {}) {
  const dagManifest = await readJsonOrNull(path.join(plan.root_dir, "config", "daily-codex-dag.json"));
  const pipelinePlanPath = singleScriptPipelinePlanPath(plan);
  const orchestration = buildSingleScriptOrchestration({ plan, dagManifest, pipelinePlanPath });
  await writeJson(pipelinePlanPath, {
    schema_version: 1,
    mode: SINGLE_SCRIPT_AUTOMATION_PIPELINE_MODE,
    automation_pipeline_mode: SINGLE_SCRIPT_AUTOMATION_PIPELINE_MODE,
    report_date: plan.report_date,
    root_dir: plan.root_dir,
    execute_requested: true,
    publish_requested: Boolean(plan.publish_requested),
    codex: {
      bin: plan.codex?.bin || defaultCodexBin(),
      model: plan.codex?.model || "",
      sandbox: plan.codex?.sandbox || DEFAULT_SANDBOX
    },
    source_watch_admitted_artifact_path: plan.publish?.source_watch_admitted_artifact_path || "",
    orchestration,
    legacy_runner: {
      module: "src/daily-runner.js",
      export: "runDailyWorkflow",
      publish: Boolean(plan.publish_requested)
    }
  });
  const existingSummary = await readJsonOrNull(plan.outputs.run_summary);
  const shouldResumeAiRepair = existingSummary?.final_status === "needs_ai_repair";
  await writeJson(plan.outputs.run_summary, shouldResumeAiRepair
    ? {
        ...existingSummary,
        automation_pipeline_mode: SINGLE_SCRIPT_AUTOMATION_PIPELINE_MODE,
        summary_path: plan.outputs.run_summary,
        pipeline_plan_path: pipelinePlanPath,
        plan_path: pipelinePlanPath,
        orchestration,
        orchestration_node_count: orchestration.node_count,
        source_watch_admitted_artifact_path: plan.publish?.source_watch_admitted_artifact_path || "",
        updated_at: new Date().toISOString()
      }
    : {
        ok: false,
        mode: SINGLE_SCRIPT_AUTOMATION_PIPELINE_MODE,
        automation_pipeline_mode: SINGLE_SCRIPT_AUTOMATION_PIPELINE_MODE,
        report_date: plan.report_date,
        final_status: "running",
        stage_id: "initialize",
        next_action: { kind: "none" },
        summary_path: plan.outputs.run_summary,
        pipeline_plan_path: pipelinePlanPath,
        plan_path: pipelinePlanPath,
        orchestration,
        orchestration_node_count: orchestration.node_count,
        completed_stages: [],
        source_watch_admitted_artifact_path: plan.publish?.source_watch_admitted_artifact_path || "",
        publish_requested: Boolean(plan.publish_requested),
        execute_requested: true,
        updated_at: new Date().toISOString()
      });

  const workflowRunner = options.workflowRunner || runDailyWorkflow;
  let result;
  let legacySummary;
  try {
    result = await workflowRunner({
      launcherRoot: plan.root_dir,
      reportDate: plan.report_date,
      publish: Boolean(plan.publish_requested),
      summaryPath: plan.outputs.run_summary,
      allowedBranch: options.allowedBranch,
      worktreeDir: options.publishWorktreeDir,
      maxReviewRepairLoops: options.maxReviewRepairLoops,
      restart: options.restart
    });
    legacySummary = result?.summary || await readJsonOrNull(plan.outputs.run_summary) || {};
  } catch (error) {
    legacySummary = await readJsonOrNull(plan.outputs.run_summary) || {
      report_date: plan.report_date,
      final_status: "blocked",
      next_action: blockedNextActionFromError(error),
      stages: [],
      failures: [error instanceof Error ? error.message : String(error || "daily workflow failed")]
    };
    if (!legacySummary.final_status || legacySummary.final_status === "running") {
      legacySummary.final_status = "blocked";
    }
    legacySummary.next_action ||= blockedNextActionFromError(error);
    legacySummary.error = legacySummary.error || (error instanceof Error ? error.message : String(error || "daily workflow failed"));
    legacySummary.error_code = legacySummary.error_code || error?.code || "daily_workflow_failed";
  }

  const summary = await normalizeSingleScriptRunSummary({
    plan,
    legacySummary,
    pipelinePlanPath,
    orchestration
  });
  return { plan, summary };
}

async function normalizeSingleScriptRunSummary({ plan, legacySummary, pipelinePlanPath, orchestration }) {
  const legacyFinalStatus = legacySummary.final_status || "blocked";
  const finalStatus = normalizeProductionFinalStatus(legacyFinalStatus);
  const cleanRoot = path.resolve(legacySummary.clean_repo_root || plan.root_dir);
  const artifactPaths = buildDailyReportArtifactPaths({ cleanRoot, reportDate: plan.report_date });
  const artifactSizes = await collectArtifactSizes({
    pipeline_plan_path: pipelinePlanPath,
    ...artifactPaths,
    ...(plan.publish?.source_watch_admitted_artifact_path
      ? { source_watch_admitted_artifact_path: plan.publish.source_watch_admitted_artifact_path }
      : {})
  });
  const report = await readJsonOrNull(artifactPaths.structured_json_path);
  const qualityStatus = report?.quality_status && typeof report.quality_status === "object"
    ? report.quality_status
    : {};
  const completedStages = normalizeCompletedStages(legacySummary.stages || legacySummary.completed_stages || []);
  const publication = buildPublicationSummary({ legacySummary, completedStages, finalStatus });
  const pages = buildPagesSummary({ completedStages, finalStatus, publication });
  const validation = buildValidationSummary(completedStages);
  const blockingIssues = Array.isArray(qualityStatus.blocking_issues) ? qualityStatus.blocking_issues : [];
  const degradedSections = Array.isArray(qualityStatus.degraded_sections) ? qualityStatus.degraded_sections : [];
  const failures = collectLegacyFailures(legacySummary, completedStages);
  const summary = {
    ...legacySummary,
    ok: productionSummaryOk(finalStatus),
    mode: legacySummary.mode || (plan.publish_requested ? "publish" : "dry-run"),
    automation_pipeline_mode: SINGLE_SCRIPT_AUTOMATION_PIPELINE_MODE,
    report_date: plan.report_date,
    final_status: finalStatus,
    legacy_final_status: legacyFinalStatus,
    stage_id: failedStageId(completedStages) || latestStageId(completedStages) || legacySummary.stage_id || "initialize",
    next_action: legacySummary.next_action || { kind: "none" },
    summary_path: plan.outputs.run_summary,
    pipeline_plan_path: pipelinePlanPath,
    plan_path: pipelinePlanPath,
    orchestration,
    orchestration_node_count: orchestration.node_count,
    completed_stages: completedStages,
    stage_timing: buildStageTimingSummary(completedStages),
    failures,
    publish_requested: Boolean(plan.publish_requested),
    execute_requested: true,
    source_watch_admitted_artifact_path: plan.publish?.source_watch_admitted_artifact_path || "",
    clean_repo_root: cleanRoot,
    structured_json_path: artifactPaths.structured_json_path,
    html_path: artifactPaths.html_path,
    docs_data_json_path: artifactPaths.docs_data_json_path,
    artifacts: artifactPaths,
    artifact_sizes: artifactSizes,
    validation,
    publication,
    publish: publication,
    pages,
    blocking_issues: blockingIssues,
    degraded_sections: degradedSections,
    updated_at: new Date().toISOString()
  };
  if (finalStatus !== "published" && finalStatus !== "published_pending_pages_verification") {
    summary.failed_stage_id = failedStageId(completedStages) || legacySummary.failed_stage_id || summary.stage_id;
    summary.error = legacySummary.error || failures[0] || "";
  } else {
    summary.failed_stage_id = legacySummary.failed_stage_id || "";
    summary.error = legacySummary.error || "";
  }
  await writeJson(plan.outputs.run_summary, summary);
  return summary;
}

function productionSummaryOk(finalStatus) {
  return [
    "generated_only",
    "generated_degraded",
    "published",
    "published_pending_pages_verification"
  ].includes(String(finalStatus || ""));
}

export function validateDailyCodexMvpArtifact(value, { reportDate } = {}) {
  const failures = [];
  if (!isPlainObject(value)) {
    return { ok: false, failures: ["artifact must be a JSON object"] };
  }
  if (value.report_date !== reportDate) {
    failures.push(`report_date must be ${reportDate}`);
  }
  if (!nonEmptyString(value.headline)) {
    failures.push("headline is required");
  }
  if (!nonEmptyString(value.summary)) {
    failures.push("summary is required");
  }
  if (!Array.isArray(value.items) || value.items.length < 1) {
    failures.push("items must contain at least one item");
  } else {
    value.items.forEach((item, index) => {
      if (!isPlainObject(item)) {
        failures.push(`items[${index}] must be an object`);
        return;
      }
      if (!nonEmptyString(item.title)) failures.push(`items[${index}].title is required`);
      if (!nonEmptyString(item.url)) failures.push(`items[${index}].url is required`);
      if (!nonEmptyString(item.note)) failures.push(`items[${index}].note is required`);
    });
  }
  return { ok: failures.length === 0, failures };
}

async function recordStage(state, stageId, fn) {
  const stage = state.plan.stages.find((item) => item.id === stageId);
  const startedAt = new Date();
  let result;
  try {
    result = await fn(stage);
  } catch (error) {
    result = {
      status: "failure",
      failures: [{ code: error.code || "stage_failed", message: error.message }]
    };
  }
  const finishedAt = new Date();
  const summary = {
    id: stageId,
    status: result.status || "success",
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    duration_ms: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
    artifacts: result.artifacts || [],
    failures: result.failures || [],
    skipped_reason: result.skipped_reason || ""
  };
  state.completedStages.push(summary);
  await writeRunSummary(state, {
    finalStatus: summary.status === "failure" && stageId !== "validate" && stageId !== "repair-once" ? "blocked" : "running"
  });
  if (summary.status === "failure" && stageId !== "validate" && stageId !== "repair-once") {
    const error = new Error(summary.failures[0]?.message || `${stageId} failed`);
    error.code = summary.failures[0]?.code || "stage_failed";
    error.stage_id = stageId;
    throw error;
  }
  return summary;
}

async function runPrepareStage(state) {
  await fs.mkdir(path.dirname(state.plan.outputs.run_summary), { recursive: true });
  await fs.mkdir(path.dirname(state.plan.outputs.context), { recursive: true });
  await fs.mkdir(path.dirname(state.plan.outputs.generate_stdout), { recursive: true });
  await fs.mkdir(path.dirname(state.plan.outputs.generate_stderr), { recursive: true });
  await writePlan(state.plan);
  return { status: "success", artifacts: await artifactRecords([state.plan.outputs.plan]) };
}

async function runCollectContextStage(state, options) {
  const context = options.context || await buildLocalContext(state.plan);
  state.context = context;
  await writeJson(state.plan.outputs.context, context);
  return { status: "success", artifacts: await artifactRecords([state.plan.outputs.context]) };
}

async function runGenerateStage(state) {
  if (state.plan.codex.fixture_mode) {
    state.generation = fixtureGeneration({
      mode: state.plan.codex.fixture_mode,
      reportDate: state.plan.report_date,
      repaired: false
    });
    await writeJson(state.plan.outputs.generated, state.generation);
    return { status: "success", artifacts: await artifactRecords([state.plan.outputs.generated]) };
  }

  const prompt = buildGeneratePrompt(state);
  await writeText(state.plan.outputs.generate_prompt, prompt);
  await runCodexStage({
    plan: state.plan,
    prompt,
    stdoutPath: state.plan.outputs.generate_stdout,
    stderrPath: state.plan.outputs.generate_stderr
  });
  state.generation = await readJson(state.plan.outputs.generated);
  return {
    status: "success",
    artifacts: await artifactRecords([state.plan.outputs.generated])
  };
}

async function runValidateStage(state) {
  const artifact = state.generation || await readJsonOrNull(state.plan.outputs.generated);
  const validation = validateDailyCodexMvpArtifact(artifact, { reportDate: state.plan.report_date });
  state.validation = validation;
  await writeJson(state.plan.outputs.validation, validation);
  return {
    status: validation.ok ? "success" : "failure",
    artifacts: await artifactRecords([state.plan.outputs.validation]),
    failures: validation.ok ? [] : validation.failures.map((message) => ({
      code: "mvp_validation_failed",
      message
    }))
  };
}

async function runRepairStage(state) {
  if (state.validation?.ok) {
    state.finalArtifactPath = state.plan.outputs.generated;
    state.finalValidation = state.validation;
    return {
      status: "skipped",
      skipped_reason: "validation_passed",
      artifacts: []
    };
  }

  state.repairAttempted = true;
  if (state.plan.codex.fixture_mode) {
    state.repair = fixtureGeneration({
      mode: state.plan.codex.fixture_mode,
      reportDate: state.plan.report_date,
      repaired: true
    });
    await writeJson(state.plan.outputs.repaired, state.repair);
  } else {
    const prompt = buildRepairPrompt(state);
    await writeText(state.plan.outputs.repair_prompt, prompt);
    await runCodexStage({
      plan: state.plan,
      prompt,
      stdoutPath: state.plan.outputs.repair_stdout,
      stderrPath: state.plan.outputs.repair_stderr
    });
    state.repair = await readJson(state.plan.outputs.repaired);
  }

  state.repairValidation = validateDailyCodexMvpArtifact(state.repair, { reportDate: state.plan.report_date });
  state.finalArtifactPath = state.plan.outputs.repaired;
  state.finalValidation = state.repairValidation;
  await writeJson(state.plan.outputs.repair_validation, state.repairValidation);
  return {
    status: state.repairValidation.ok ? "success" : "failure",
    artifacts: await artifactRecords([state.plan.outputs.repaired, state.plan.outputs.repair_validation]),
    failures: state.repairValidation.ok ? [] : state.repairValidation.failures.map((message) => ({
      code: "mvp_repair_validation_failed",
      message
    }))
  };
}

async function runSummarizeStage(state) {
  if (state.finalArtifactPath) {
    await fs.copyFile(state.finalArtifactPath, state.plan.outputs.final);
  }
  const summaryPayload = {
    ok: Boolean(state.finalValidation?.ok),
    report_date: state.plan.report_date,
    final_artifact: state.plan.outputs.final,
    validation: state.finalValidation || state.validation || { ok: false, failures: ["validation did not run"] },
    repair_attempted: state.repairAttempted
  };
  await writeJson(state.plan.outputs.stage_summary, summaryPayload);
  return {
    status: summaryPayload.ok ? "success" : "failure",
    artifacts: await artifactRecords([state.plan.outputs.final, state.plan.outputs.stage_summary]),
    failures: summaryPayload.ok ? [] : summaryPayload.validation.failures.map((message) => ({
      code: "mvp_final_validation_failed",
      message
    }))
  };
}

async function runPublishStage(state) {
  const publishConfig = state.plan.publish || {};
  const sourceWatchAdmittedArtifactPath = String(publishConfig.source_watch_admitted_artifact_path || "").trim();
  if (!sourceWatchAdmittedArtifactPath) {
    state.publication = {
      ok: false,
      skipped_reason: "source_watch_admitted_artifact_not_provided",
      source_watch_admitted_artifact_path: "",
      article_count: 0,
      source_watch_articles: 0,
      articles_path: ""
    };
    await writeJson(state.plan.outputs.publish_summary, state.publication);
    return {
      status: "skipped",
      skipped_reason: "source_watch_admitted_artifact_not_provided",
      artifacts: await artifactRecords([state.plan.outputs.publish_summary])
    };
  }

  try {
    await preflightSourceWatchAdmittedArtifactForPublish(
      state.plan.root_dir,
      sourceWatchAdmittedArtifactPath,
      state.plan.report_date
    );
    assertPublishOutDirInsideRepo(state.plan.root_dir, publishConfig.out_dir);
    const result = await buildSite({
      rootDir: state.plan.root_dir,
      inputDir: publishConfig.input_dir,
      dataInputDir: publishConfig.data_input_dir,
      outDir: publishConfig.out_dir,
      siteUrl: publishConfig.site_url || undefined,
      generatedAt: publishConfig.generated_at || undefined,
      trendConfigPath: publishConfig.trend_config_path || undefined,
      sourceWatchAdmittedArtifactPath
    });
    const webApp = await buildWebApp({
      rootDir: state.plan.root_dir,
      outDir: publishConfig.out_dir,
      skipUnavailable: true
    });
    const articlesPath = path.resolve(state.plan.root_dir, publishConfig.out_dir || "docs", "articles.json");
    state.publication = {
      ok: true,
      report_date: state.plan.report_date,
      out_dir: result.outDir,
      articles_path: articlesPath,
      source_watch_admitted_artifact_path: sourceWatchAdmittedArtifactPath,
      article_count: result.articles.length,
      source_watch_articles: result.articles.filter((article) => article.section === "source_watch").length,
      written_files: uniqueStrings([...result.writtenFiles, ...webApp.writtenFiles]),
      web_app: webApp.skipped
        ? { ok: true, skipped: true, skipped_reason: webApp.skipped_reason }
        : { ok: true, skipped: false, written_files: webApp.writtenFiles }
    };
    await writeJson(state.plan.outputs.publish_summary, state.publication);
    return {
      status: "success",
      artifacts: await artifactRecords([state.plan.outputs.publish_summary, articlesPath])
    };
  } catch (error) {
    state.publication = {
      ok: false,
      report_date: state.plan.report_date,
      source_watch_admitted_artifact_path: sourceWatchAdmittedArtifactPath,
      failures: [error instanceof Error ? error.message : String(error)]
    };
    await writeJson(state.plan.outputs.publish_summary, state.publication);
    throw error;
  }
}

async function preflightSourceWatchAdmittedArtifactForPublish(rootDir, artifactPath, expectedReportDate) {
  if (!String(artifactPath).toLowerCase().endsWith(".json")) {
    const error = new Error("Source Watch admitted artifact path must end with .json.");
    error.code = "source_watch_admitted_artifact_path_invalid";
    throw error;
  }
  const allowedRoot = path.resolve(rootDir, ".tmp", "daily-codex-pipeline");
  const resolved = path.resolve(rootDir, artifactPath);
  const relative = path.relative(allowedRoot, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    const error = new Error(`Source Watch admitted artifact path must stay under ${path.join(".tmp", "daily-codex-pipeline")}.`);
    error.code = "source_watch_admitted_artifact_path_out_of_scope";
    throw error;
  }
  let payload;
  try {
    payload = JSON.parse(await fs.readFile(resolved, "utf8"));
  } catch (readError) {
    const error = new Error(`Source Watch admitted artifact could not be read: ${readError.message}`);
    error.code = "source_watch_admitted_artifact_read_failed";
    throw error;
  }
  if (!isPlainObject(payload) || payload.kind !== "source_watch_admitted_candidates") {
    const error = new Error("Source Watch admitted artifact must have kind source_watch_admitted_candidates.");
    error.code = "source_watch_admitted_artifact_invalid";
    throw error;
  }
  if (payload.report_date !== expectedReportDate) {
    const error = new Error(`Source Watch admitted artifact report_date must match ${expectedReportDate}.`);
    error.code = "source_watch_admitted_artifact_report_date_mismatch";
    throw error;
  }
  if (payload.public_surface === true || payload.admission_audit?.public_surface === true) {
    const error = new Error("Source Watch admitted artifact must remain an internal input before article publication.");
    error.code = "source_watch_admitted_artifact_public_surface_invalid";
    throw error;
  }
}

function assertPublishOutDirInsideRepo(rootDir, outDir) {
  const resolved = path.resolve(rootDir, outDir || "docs");
  if (!isPathInside(rootDir, resolved)) {
    const error = new Error("daily Codex publish out dir must stay inside the repository.");
    error.code = "daily_codex_publish_out_dir_out_of_scope";
    throw error;
  }
}

async function writeRunSummary(state, { finalStatus }) {
  const failedStage = [...state.completedStages].reverse().find((stage) => stage.status === "failure") || null;
  const latestStage = state.completedStages[state.completedStages.length - 1] || null;
  const failures = state.completedStages.flatMap((stage) => (
    Array.isArray(stage.failures)
      ? stage.failures.map((failure) => failure.message || failure.code || String(failure)).filter(Boolean)
      : []
  ));
  const artifactSizes = await collectArtifactSizes(buildDagLiteArtifactSizePaths(state.plan));
  const summary = {
    ok: finalStatus === "generated_only" || finalStatus === "published",
    mode: "daily_codex_dag_lite",
    report_date: state.plan.report_date,
    final_status: finalStatus,
    stage_id: failedStage?.id || latestStage?.id || "initialize",
    next_action: nextActionFor({ finalStatus, state }),
    work_dir: state.plan.work_dir,
    plan_path: state.plan.outputs.plan,
    final_artifact: state.plan.outputs.final,
    completed_stages: state.completedStages,
    stage_timing: buildStageTimingSummary(state.completedStages),
    failures,
    summary_path: state.plan.outputs.run_summary,
    publish_requested: Boolean(state.plan.publish_requested),
    execute_requested: Boolean(state.plan.execute_requested),
    source_watch_admitted_artifact_path: state.plan.publish?.source_watch_admitted_artifact_path || "",
    artifact_sizes: artifactSizes,
    publication: state.publication,
    validation: state.finalValidation || state.validation || null,
    repair_attempted: state.repairAttempted,
    updated_at: new Date().toISOString()
  };
  await writeJson(state.plan.outputs.run_summary, summary);
  return summary;
}

function finalStatusFor(state) {
  if (!state.finalValidation?.ok) return "blocked";
  if (state.publication?.ok) return "published";
  return "generated_only";
}

function nextActionFor({ finalStatus, state }) {
  if (finalStatus === "running") return { kind: "none" };
  if (finalStatus === "published") {
    return {
      kind: "published_articles",
      articles_path: state.publication?.articles_path || ""
    };
  }
  if (finalStatus === "generated_only") {
    if (state.plan.publish_requested && !state.plan.publish?.source_watch_admitted_artifact_path) {
      return {
        kind: "provide_source_watch_admitted_artifact",
        expected_flag: "--source-watch-admitted-artifact"
      };
    }
    return { kind: "promote_mvp_artifact", artifact_path: state.plan.outputs.final };
  }
  return {
    kind: "inspect_mvp_failure",
    summary_path: state.plan.outputs.run_summary,
    validation_path: state.repairValidation ? state.plan.outputs.repair_validation : state.plan.outputs.validation
  };
}

function singleScriptPipelinePlanPath(plan) {
  return path.join(plan.root_dir, ".tmp", "daily-codex-pipeline", plan.report_date, "pipeline-plan.json");
}

function buildSingleScriptOrchestration({ plan, dagManifest, pipelinePlanPath }) {
  const nodes = Array.isArray(dagManifest?.nodes) ? dagManifest.nodes : [];
  return {
    mode: SINGLE_SCRIPT_AUTOMATION_PIPELINE_MODE,
    node_count: nodes.length,
    plan_path: pipelinePlanPath,
    manifest_path: path.join(plan.root_dir, "config", "daily-codex-dag.json"),
    mapped_node_count: nodes.filter((node) => node.execution_status === "mapped").length,
    planned_node_count: nodes.filter((node) => node.execution_status === "planned").length,
    node_ids: nodes.map((node) => node.id).filter(Boolean)
  };
}

function normalizeProductionFinalStatus(value) {
  if (value === "published" || value === "published_degraded") return "published";
  if (value === "published_pending_pages_verification") return "published_pending_pages_verification";
  return value || "blocked";
}

function buildDailyReportArtifactPaths({ cleanRoot, reportDate }) {
  const year = reportDate.slice(0, 4);
  const month = reportDate.slice(5, 7);
  return {
    structured_json_path: path.join(cleanRoot, "reports-data", year, month, `${reportDate}.json`),
    candidates_json_path: path.join(cleanRoot, "reports-data", ...internalCandidatePoolRelativePath(reportDate).split(path.sep)),
    legacy_candidates_json_path: path.join(cleanRoot, "reports-data", ...legacyCandidatePoolRelativePath(reportDate).split(path.sep)),
    html_path: path.join(cleanRoot, "docs", "reports", year, month, `${reportDate}.html`),
    docs_data_json_path: path.join(cleanRoot, "docs", "data", year, month, `${reportDate}.json`)
  };
}

function normalizeCompletedStages(stages) {
  let previousFinishedAt = "";
  return stages.map((stage) => {
    const normalized = {
      id: stage.id || stage.stage || "",
      status: stage.status || "",
      ...(stage.command ? { command: stage.command } : {}),
      ...(stage.output ? { output: stage.output } : {}),
      ...(stage.error ? { error: stage.error } : {}),
      ...(stage.error_code ? { error_code: stage.error_code } : {}),
      ...(stage.updated_at ? { updated_at: stage.updated_at } : {}),
      ...(Array.isArray(stage.failures) ? { failures: stage.failures } : {})
    };
    applyStageTiming(normalized, stage, previousFinishedAt);
    previousFinishedAt = normalized.finished_at || normalized.updated_at || previousFinishedAt;
    return normalized;
  }).filter((stage) => stage.id);
}

function applyStageTiming(normalized, sourceStage, previousFinishedAt) {
  const explicitStartedAt = nonEmptyString(sourceStage.started_at) ? sourceStage.started_at : "";
  const explicitFinishedAt = nonEmptyString(sourceStage.finished_at) ? sourceStage.finished_at : "";
  const updatedAt = nonEmptyString(sourceStage.updated_at) ? sourceStage.updated_at : "";
  const explicitDurationMs = Number(sourceStage.duration_ms);
  if (explicitStartedAt) normalized.started_at = explicitStartedAt;
  if (explicitFinishedAt) normalized.finished_at = explicitFinishedAt;
  if (Number.isFinite(explicitDurationMs) && explicitDurationMs >= 0) {
    normalized.duration_ms = explicitDurationMs;
    normalized.duration_source = "explicit";
    return;
  }

  const startCandidate = explicitStartedAt || previousFinishedAt;
  const finishCandidate = explicitFinishedAt || updatedAt;
  if (!finishCandidate) return;
  normalized.finished_at = normalized.finished_at || finishCandidate;
  if (!startCandidate) return;
  const startedMs = Date.parse(startCandidate);
  const finishedMs = Date.parse(finishCandidate);
  if (!Number.isFinite(startedMs) || !Number.isFinite(finishedMs) || finishedMs < startedMs) return;
  normalized.started_at = normalized.started_at || startCandidate;
  normalized.duration_ms = finishedMs - startedMs;
  normalized.duration_source = explicitStartedAt || explicitFinishedAt ? "timestamp_delta" : "updated_at_delta";
}

function buildStageTimingSummary(stages) {
  const timedStages = stages.map((stage) => ({
    id: stage.id,
    status: stage.status || "",
    ...(stage.started_at ? { started_at: stage.started_at } : {}),
    ...(stage.finished_at ? { finished_at: stage.finished_at } : {}),
    ...(Number.isFinite(stage.duration_ms) ? { duration_ms: stage.duration_ms } : {}),
    ...(stage.duration_source ? { duration_source: stage.duration_source } : {})
  })).filter((stage) => stage.started_at || stage.finished_at || Number.isFinite(stage.duration_ms));
  return {
    stage_count: stages.length,
    timed_stage_count: timedStages.length,
    known_stage_duration_ms: timedStages.reduce((total, stage) => total + (Number.isFinite(stage.duration_ms) ? stage.duration_ms : 0), 0),
    stages: timedStages
  };
}

function buildValidationSummary(completedStages) {
  return {
    report_write: summarizeStageForContract(completedStages, "report_write"),
    build: summarizeStageForContract(completedStages, "build"),
    content_contract: summarizeStageForContract(completedStages, "content_contract"),
    quality_page_check: summarizeStageForContract(completedStages, "quality_page_check"),
    npm_validate: summarizeStageForContract(completedStages, "validate"),
    sources_phase5_audit: summarizeStageForContract(completedStages, "sources_phase5_audit"),
    publish_dry_run_daily: summarizeStageForContract(completedStages, "publish_dry_run_daily")
  };
}

function buildPublicationSummary({ legacySummary, completedStages, finalStatus }) {
  const dryRunStage = findStage(completedStages, "publish_dry_run_daily");
  const publishRealStage = findStage(completedStages, "publish_real");
  const fallbackStage = findStage(completedStages, "publish_github_api_fallback");
  const publishStage = stagePassed(fallbackStage) ? fallbackStage : publishRealStage;
  const output = stageOutput(publishStage);
  const publishStatus = plainObject(output.publish_status) ? output.publish_status : {};
  const result = plainObject(output.result) ? output.result : {};
  const repoPushed = firstDefined([
    publishStatus.repo_pushed,
    output.repo_pushed,
    result.repo_pushed,
    legacySummary.repo_pushed
  ]);
  return {
    ok: finalStatus === "published" || finalStatus === "published_pending_pages_verification",
    mode: stagePassed(fallbackStage) ? "github_api_fallback" : (stagePassed(publishRealStage) ? "git" : ""),
    dry_run: summarizeStageForContract(completedStages, "publish_dry_run_daily"),
    publish_real: summarizeStageForContract(completedStages, "publish_real"),
    github_api_fallback: summarizeStageForContract(completedStages, "publish_github_api_fallback"),
    repo_pushed: Boolean(repoPushed),
    commit: stringFirst([
      publishStatus.commit,
      publishStatus.commit_hash,
      output.commit,
      output.commit_hash,
      result.commit,
      result.commit_hash,
      legacySummary.commit
    ]),
    pages_url: stringFirst([
      publishStatus.pages_url,
      output.pages_url,
      result.pages_url,
      legacySummary.pages_url
    ]),
    skipped_reason: !publishStage ? "publish_stage_not_reached" : ""
  };
}

function buildPagesSummary({ completedStages, finalStatus, publication }) {
  const pagesStage = findStage(completedStages, "pages_verify");
  const output = stageOutput(pagesStage);
  const publishStatus = plainObject(output.publish_status) ? output.publish_status : {};
  const result = plainObject(output.result) ? output.result : {};
  return {
    verified: stagePassed(pagesStage) && finalStatus === "published",
    pending: finalStatus === "published_pending_pages_verification",
    status: pagesStage?.status || "",
    pages_url: stringFirst([
      output.pages_url,
      publishStatus.pages_url,
      result.pages_url,
      publication.pages_url
    ]),
    http_status: firstDefined([
      output.http_status,
      output.status,
      result.http_status,
      result.status
    ]),
    message: stringFirst([
      output.verification_error,
      output.error,
      output.message,
      result.verification_error
    ])
  };
}

function summarizeStageForContract(stages, id) {
  const stage = findStage(stages, id);
  if (!stage) return { reached: false, status: "not_reached" };
  return {
    reached: true,
    status: stage.status || "",
    ok: stagePassed(stage),
    ...(Number.isFinite(stage.duration_ms) ? { duration_ms: stage.duration_ms } : {}),
    ...(stage.error ? { error: stage.error } : {}),
    ...(stage.error_code ? { error_code: stage.error_code } : {})
  };
}

function collectLegacyFailures(legacySummary, completedStages) {
  const stageFailures = completedStages.flatMap((stage) => {
    const failures = [];
    if (Array.isArray(stage.failures)) {
      failures.push(...stage.failures.map((failure) => (
        typeof failure === "string" ? failure : failure?.message || failure?.code || JSON.stringify(failure)
      )));
    }
    if (stage.error) failures.push(stage.error);
    return failures;
  });
  return uniqueExistingStrings([
    ...(Array.isArray(legacySummary.failures) ? legacySummary.failures : []),
    ...stageFailures
  ]);
}

function findStage(stages, id) {
  return stages.find((stage) => stage.id === id) || null;
}

function stagePassed(stage) {
  return ["passed", "success"].includes(stage?.status);
}

function stageOutput(stage) {
  return plainObject(stage?.output) ? stage.output : {};
}

function plainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function failedStageId(stages) {
  return stages.find((stage) => ["failed", "failure", "blocked"].includes(stage.status))?.id || "";
}

function latestStageId(stages) {
  return stages.length ? stages[stages.length - 1].id : "";
}

function blockedNextActionFromError(error) {
  return {
    kind: "inspect_blocker",
    error_code: error?.code || "daily_workflow_failed",
    message: error instanceof Error ? error.message : String(error || "daily workflow failed")
  };
}

function firstDefined(values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function uniqueExistingStrings(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function stringFirst(values) {
  const value = firstDefined(values.map((item) => typeof item === "string" ? item.trim() : ""));
  return value || "";
}

async function buildLocalContext(plan) {
  const packageJson = await readJson(path.join(plan.root_dir, "package.json"));
  const dagManifest = await readJsonOrNull(path.join(plan.root_dir, "config", "daily-codex-dag.json"));
  return {
    report_date: plan.report_date,
    project: {
      name: packageJson.name || "",
      description: packageJson.description || ""
    },
    available_scripts: Object.keys(packageJson.scripts || {}).filter((name) => (
      name.startsWith("discover:") ||
      name.startsWith("sources:") ||
      name.startsWith("quality:") ||
      name.startsWith("report:")
    )).sort(),
    dag_nodes: Array.isArray(dagManifest?.nodes) ? dagManifest.nodes.map((node) => node.id).filter(Boolean) : [],
    mvp_contract: {
      stages: STAGE_IDS,
      output_schema: {
        report_date: "YYYY-MM-DD",
        headline: "string",
        summary: "string",
        items: [{ title: "string", url: "string", note: "string" }]
      }
    }
  };
}

function buildGeneratePrompt(state) {
  return `${boundaryPrompt(state.plan.outputs.generated)}
You are running the MVP daily Codex DAG-lite generation stage.
Read the context JSON at ${state.plan.outputs.context}.
Write one JSON object to ${state.plan.outputs.generated}.
Required shape:
{
  "report_date": "${state.plan.report_date}",
  "headline": "short Chinese headline",
  "summary": "one concise Chinese paragraph",
  "items": [
    { "title": "item title", "url": "https://example.com/source", "note": "why this item matters" }
  ]
}
Keep this MVP factual and conservative. If the context lacks live news, state that this is an MVP dry generation artifact and use repository-local context only.
`;
}

function buildRepairPrompt(state) {
  return `${boundaryPrompt(state.plan.outputs.repaired)}
You are repairing the MVP daily Codex DAG-lite JSON artifact.
Invalid artifact: ${state.plan.outputs.generated}
Validation failures: ${JSON.stringify(state.validation?.failures || [], null, 2)}
Context: ${state.plan.outputs.context}
Write a corrected JSON object to ${state.plan.outputs.repaired} with:
{
  "report_date": "${state.plan.report_date}",
  "headline": "string",
  "summary": "string",
  "items": [
    { "title": "string", "url": "string", "note": "string" }
  ]
}
Do not edit any other file.
`;
}

function boundaryPrompt(outputPath) {
  return `Execution boundary:
- OUTPUT_PATH=${outputPath}
- Write only the required JSON output file.
- Do not edit repository files, docs, reports-data, output, tasks, progress logs, handoff notes, or harness state.
- Put scratch files only under the pipeline work directory.
`;
}

async function runCodexStage({ plan, prompt, stdoutPath, stderrPath }) {
  const before = await snapshotRepositoryFiles(plan.root_dir, { allowedDir: plan.work_dir });
  let spawnError = null;
  try {
    const args = [
      "exec",
      "--ephemeral",
      "--json",
      "-C",
      plan.root_dir,
      "--sandbox",
      plan.codex.sandbox,
      "-"
    ];
    if (plan.codex.model) {
      args.splice(args.length - 1, 0, "--model", plan.codex.model);
    }
    await spawnWithPrompt(plan.codex.bin, args, {
      cwd: plan.root_dir,
      prompt,
      stdoutPath,
      stderrPath
    });
  } catch (error) {
    spawnError = error;
  }
  const changes = await diffRepositoryFiles(plan.root_dir, { allowedDir: plan.work_dir, before });
  if (changes.length) {
    const error = new Error(`Codex stage modified repository paths outside work dir: ${changes.map((item) => `${item.change}:${item.path}`).join(", ")}`);
    error.code = "codex_repository_write";
    throw error;
  }
  if (spawnError) throw spawnError;
}

async function spawnWithPrompt(command, args, options) {
  await fs.mkdir(path.dirname(options.stdoutPath), { recursive: true });
  await fs.mkdir(path.dirname(options.stderrPath), { recursive: true });
  await new Promise((resolve, reject) => {
    const stdout = fsSync.createWriteStream(options.stdoutPath, { flags: "a" });
    const stderr = fsSync.createWriteStream(options.stderrPath, { flags: "a" });
    const stdoutFinished = finished(stdout);
    const stderrFinished = finished(stderr);
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      shell: shouldUseShell(command)
    });
    child.stdout.pipe(stdout);
    child.stderr.pipe(stderr);
    child.on("error", (error) => {
      stdout.destroy();
      stderr.destroy();
      reject(error);
    });
    child.on("close", async (code) => {
      try {
        await Promise.all([stdoutFinished, stderrFinished]);
      } catch (error) {
        reject(error);
        return;
      }
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with ${code}`));
      }
    });
    child.stdin.end(options.prompt || "");
  });
}

async function snapshotRepositoryFiles(rootDir, { allowedDir }) {
  const root = path.resolve(rootDir);
  const allowed = path.resolve(allowedDir);
  const snapshot = new Map();
  await walkRepositoryFiles(root, "", { root, allowed, snapshot });
  return snapshot;
}

async function diffRepositoryFiles(rootDir, { allowedDir, before }) {
  const after = await snapshotRepositoryFiles(rootDir, { allowedDir });
  const keys = new Set([...before.keys(), ...after.keys()]);
  const changes = [];
  for (const key of [...keys].sort()) {
    const oldValue = before.get(key) || null;
    const newValue = after.get(key) || null;
    if (oldValue === newValue) continue;
    changes.push({
      path: key,
      change: oldValue === null ? "created" : (newValue === null ? "deleted" : "modified")
    });
  }
  return changes;
}

async function walkRepositoryFiles(dirPath, relativeDir, context) {
  let entries;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  for (const entry of entries) {
    const relativePath = path.join(relativeDir, entry.name);
    const absolutePath = path.join(dirPath, entry.name);
    const normalizedRelativePath = normalizeRelativePath(relativePath);
    if (isPathInsideOrEqual(context.allowed, absolutePath)) {
      continue;
    }
    if (entry.isDirectory()) {
      if (REPOSITORY_GUARD_EXCLUDED_DIRS.has(entry.name)) continue;
      await walkRepositoryFiles(absolutePath, relativePath, context);
    } else if (entry.isFile()) {
      context.snapshot.set(normalizedRelativePath, await fileFingerprint(absolutePath));
    } else if (entry.isSymbolicLink()) {
      context.snapshot.set(normalizedRelativePath, await symlinkFingerprint(absolutePath));
    }
  }
}

async function artifactRecords(filePaths) {
  const records = [];
  for (const filePath of filePaths.filter(Boolean)) {
    records.push(await artifactRecord(filePath));
  }
  return records;
}

async function artifactRecord(filePath) {
  try {
    const bytes = await fs.readFile(filePath);
    return {
      path: filePath,
      exists: true,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex")
    };
  } catch {
    return {
      path: filePath,
      exists: false,
      bytes: null,
      sha256: null
    };
  }
}

async function fileFingerprint(filePath) {
  try {
    const content = await fs.readFile(filePath);
    return createHash("sha256").update(content).digest("hex");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function symlinkFingerprint(filePath) {
  try {
    return `symlink:${await fs.readlink(filePath)}`;
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function fixtureGeneration({ mode, reportDate, repaired }) {
  if (mode === "failure" || (mode === "repair-success" && !repaired)) {
    return {
      report_date: reportDate,
      headline: repaired ? "" : "Fixture invalid MVP artifact",
      summary: "",
      items: []
    };
  }
  return {
    report_date: reportDate,
    headline: "DAG-lite MVP generated a bounded daily artifact",
    summary: "This fixture proves the coarse daily Codex orchestration path can prepare context, generate JSON, validate it, and summarize the run.",
    items: [
      {
        title: "DAG-lite MVP runner",
        url: "https://example.com/dag-lite-mvp",
        note: "The artifact is deterministic and validates the MVP execution contract."
      }
    ]
  };
}

function buildStage({ id, rootDir, workDir, outputs }) {
  const stage = {
    id,
    kind: id === "codex-generate" || id === "repair-once" ? "codex_or_fixture" : "internal",
    cwd: rootDir,
    work_dir: workDir
  };
  if (id === "collect-context") stage.output_path = outputs.context;
  if (id === "codex-generate") stage.output_path = outputs.generated;
  if (id === "validate") stage.output_path = outputs.validation;
  if (id === "repair-once") stage.output_path = outputs.repaired;
  if (id === "summarize") stage.output_path = outputs.stage_summary;
  if (id === PUBLISH_STAGE_ID) stage.output_path = outputs.publish_summary;
  return stage;
}

function buildOutputs({ rootDir, workDir, reportDate }) {
  return {
    plan: path.join(workDir, "pipeline-plan.json"),
    context: path.join(workDir, "context.json"),
    generated: path.join(workDir, "generated.json"),
    repaired: path.join(workDir, "generated.repaired.json"),
    final: path.join(workDir, "final.json"),
    validation: path.join(workDir, "validation.json"),
    repair_validation: path.join(workDir, "repair-validation.json"),
    stage_summary: path.join(workDir, "stage-summary.json"),
    publish_summary: path.join(workDir, "publish-summary.json"),
    run_summary: path.join(rootDir, ".tmp", `run-summary-${reportDate}.json`),
    generate_prompt: path.join(workDir, "prompts", "generate.md"),
    repair_prompt: path.join(workDir, "prompts", "repair.md"),
    generate_stdout: path.join(workDir, "logs", "codex-generate.stdout.jsonl"),
    generate_stderr: path.join(workDir, "logs", "codex-generate.stderr.log"),
    repair_stdout: path.join(workDir, "logs", "repair-once.stdout.jsonl"),
    repair_stderr: path.join(workDir, "logs", "repair-once.stderr.log")
  };
}

function uniqueStrings(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildPublishConfig(options = {}) {
  return {
    source_watch_admitted_artifact_path: String(options.sourceWatchAdmittedArtifactPath || options["source-watch-admitted-artifact"] || "").trim(),
    input_dir: options.inputDir || options.input || "reports-source",
    data_input_dir: options.dataInputDir || options["data-input"] || "reports-data",
    out_dir: options.outDir || options.out || "docs",
    site_url: options.siteUrl || options["site-url"] || "",
    generated_at: options.generatedAt || options["generated-at"] || "",
    trend_config_path: options.trendConfigPath || options["trend-config"] || ""
  };
}

function assertSafeWorkDir(plan) {
  const rootDir = path.resolve(plan.root_dir);
  const workDir = path.resolve(plan.work_dir);
  const safeRoot = path.resolve(rootDir, DEFAULT_WORK_DIR);
  if (samePath(workDir, rootDir)) {
    throw new Error("daily Codex work dir cannot be the repository root");
  }
  if (samePath(workDir, safeRoot)) {
    throw new Error(`daily Codex work dir must be a child of ${path.join(DEFAULT_WORK_DIR, "<run>")}`);
  }
  if (!isPathInside(safeRoot, workDir)) {
    throw new Error(`daily Codex work dir must be inside ${path.join(DEFAULT_WORK_DIR, "<run>")}`);
  }
}

async function writePlan(plan) {
  await writeJson(plan.outputs.plan, publicPlan(plan));
}

function publicPlan(plan) {
  return {
    ...plan,
    stages: plan.stages.map((stage) => ({ ...stage }))
  };
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeText(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, value, "utf8");
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function readJsonOrNull(filePath) {
  try {
    return await readJson(filePath);
  } catch {
    return null;
  }
}

function buildDagLiteArtifactSizePaths(plan) {
  return {
    plan_path: plan.outputs.plan,
    context_path: plan.outputs.context,
    generated_path: plan.outputs.generated,
    repaired_path: plan.outputs.repaired,
    final_artifact: plan.outputs.final,
    validation_path: plan.outputs.validation,
    repair_validation_path: plan.outputs.repair_validation,
    stage_summary_path: plan.outputs.stage_summary,
    publish_summary_path: plan.outputs.publish_summary,
    ...(plan.publish?.source_watch_admitted_artifact_path
      ? { source_watch_admitted_artifact_path: plan.publish.source_watch_admitted_artifact_path }
      : {})
  };
}

async function collectArtifactSizes(pathsByKey) {
  const result = {};
  for (const [key, filePath] of Object.entries(pathsByKey || {})) {
    if (!filePath) continue;
    result[key] = await statArtifact(filePath);
  }
  return result;
}

async function statArtifact(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return {
      path: filePath,
      exists: true,
      bytes: stat.isFile() ? stat.size : 0,
      mtime: stat.mtime.toISOString()
    };
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    return {
      path: filePath,
      exists: false,
      bytes: 0
    };
  }
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function normalizeFixtureMode(value) {
  const mode = String(value || "").trim();
  if (!mode) return "";
  if (!["success", "repair-success", "failure"].includes(mode)) {
    throw new Error(`unsupported fixture mode: ${mode}`);
  }
  return mode;
}

function requiredDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) {
    throw new Error("daily codex pipeline requires --date YYYY-MM-DD");
  }
  return String(value);
}

function defaultCodexBin() {
  return process.platform === "win32" ? "codex.cmd" : "codex";
}

function shouldUseShell(command) {
  return process.platform === "win32" && /\.(cmd|bat)$/i.test(String(command || ""));
}

function isPathInside(parentPath, childPath) {
  const relativePath = path.relative(path.resolve(parentPath), path.resolve(childPath));
  return Boolean(relativePath) && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}

function isPathInsideOrEqual(parentPath, childPath) {
  return samePath(parentPath, childPath) || isPathInside(parentPath, childPath);
}

function samePath(left, right) {
  const normalizedLeft = normalizeComparablePath(path.resolve(left));
  const normalizedRight = normalizeComparablePath(path.resolve(right));
  return normalizedLeft === normalizedRight;
}

function normalizeComparablePath(value) {
  const normalized = normalizeRelativePath(value);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function normalizeRelativePath(relativePath) {
  return String(relativePath || "").replace(/\\/g, "/").replace(/^\/+/, "");
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function parseArgs(argv) {
  const valueFlags = new Set([
    "repo-root",
    "date",
    "work-dir",
    "codex-bin",
    "model",
    "sandbox",
    "fixture",
    "source-watch-admitted-artifact",
    "input",
    "data-input",
    "out",
    "site-url",
    "generated-at",
    "trend-config"
  ]);
  const booleanFlags = new Set(["execute", "publish"]);
  const parsed = {
    positionals: [],
    codexArgv: []
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--") {
      if (index === 0) {
        continue;
      }
      parsed.codexArgv = argv.slice(index + 1);
      break;
    }
    if (!token.startsWith("--")) {
      parsed.positionals.push(token);
      continue;
    }
    const equalIndex = token.indexOf("=");
    if (equalIndex > 2) {
      const key = token.slice(2, equalIndex);
      if (booleanFlags.has(key)) {
        parsed[key] = parseBooleanFlag(token.slice(equalIndex + 1));
      } else if (valueFlags.has(key)) {
        parsed[key] = token.slice(equalIndex + 1);
      } else {
        throw new Error(`unsupported daily Codex DAG-lite flag: --${key}`);
      }
      continue;
    }
    const key = token.slice(2);
    if (booleanFlags.has(key)) {
      parsed[key] = true;
      continue;
    }
    if (!valueFlags.has(key)) throw new Error(`unsupported daily Codex DAG-lite flag: --${key}`);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      throw new Error(`daily Codex DAG-lite flag --${key} requires a value`);
    }
    parsed[key] = next;
    index += 1;
  }
  return parsed;
}

function dateFromArgs(args) {
  return validReportDate(args.date)
    ? args.date
    : validReportDate(process.env.npm_config_date)
      ? process.env.npm_config_date
      : firstDate(args.positionals || []);
}

function fixtureFromArgs(args) {
  return validFixtureMode(args.fixture)
    ? args.fixture
    : validFixtureMode(process.env.npm_config_fixture)
      ? process.env.npm_config_fixture
      : firstFixturePositional(args.positionals || []);
}

function firstDate(argv) {
  return argv.find((token) => validReportDate(token)) || "";
}

function firstFixturePositional(argv) {
  return argv.find((token) => validFixtureMode(token)) || "";
}

function parseBooleanFlag(value) {
  if (value === "" || value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  throw new Error(`unsupported boolean flag value: ${value}`);
}

function validReportDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function validFixtureMode(value) {
  return ["success", "repair-success", "failure"].includes(String(value || "").trim());
}

function fallbackDateFromArgv(argv) {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--") break;
    if (token === "--date" && validReportDate(argv[index + 1])) return argv[index + 1];
    if (token.startsWith("--date=")) {
      const value = token.slice("--date=".length);
      if (validReportDate(value)) return value;
    }
    if (validReportDate(token)) return token;
  }
  return validReportDate(process.env.npm_config_date) ? process.env.npm_config_date : "";
}

function fallbackRootDirFromArgv(argv) {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--") break;
    if (token === "--repo-root" && argv[index + 1]) return argv[index + 1];
    if (token.startsWith("--repo-root=")) return token.slice("--repo-root=".length);
  }
  return process.cwd();
}

function fallbackRequestedFlag(argv, flagName, parsedValue) {
  if (typeof parsedValue === "boolean") return parsedValue;
  const flag = `--${flagName}`;
  return argv.some((token) => token === flag || token === `${flag}=true` || token === `${flag}=1`);
}

function fallbackValueFlag(argv, flagName) {
  const flag = `--${flagName}`;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--") break;
    if (token.startsWith(`${flag}=`)) return token.slice(flag.length + 1);
    if (token === flag) {
      const next = argv[index + 1];
      return next && !next.startsWith("--") ? next : "";
    }
  }
  return "";
}

async function writeEntryFailureRunSummary({
  rootDir,
  reportDate,
  error,
  stageId,
  executeRequested,
  publishRequested,
  sourceWatchAdmittedArtifactPath
}) {
  if (!validReportDate(reportDate)) return "";
  const summaryPath = path.resolve(rootDir, ".tmp", `run-summary-${reportDate}.json`);
  await writeJson(summaryPath, {
    ok: false,
    mode: "daily_codex_dag_lite",
    report_date: reportDate,
    final_status: "initialization_failed",
    stage_id: stageId,
    completed_stages: [],
    failures: [error instanceof Error ? error.message : String(error || "daily codex pipeline failed")],
    summary_path: summaryPath,
    publish_requested: Boolean(publishRequested),
    execute_requested: Boolean(executeRequested),
    source_watch_admitted_artifact_path: sourceWatchAdmittedArtifactPath || "",
    publication: null,
    updated_at: new Date().toISOString()
  });
  return summaryPath;
}

function isMainModule(metaUrl) {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(metaUrl);
}

if (isMainModule(import.meta.url)) {
  let plan = null;
  let args = null;
  const rawArgv = process.argv.slice(2);
  try {
    args = parseArgs(rawArgv);
    plan = await prepareDailyCodexPipeline({
      rootDir: args["repo-root"] || process.cwd(),
      reportDate: dateFromArgs(args),
      workDir: args["work-dir"] || process.env.npm_config_work_dir || "",
      codexBin: args["codex-bin"] || process.env.npm_config_codex_bin || "",
      model: args.model || process.env.npm_config_model || "",
      sandbox: args.sandbox || process.env.npm_config_sandbox || DEFAULT_SANDBOX,
      fixtureMode: fixtureFromArgs(args),
      executeRequested: Boolean(args.execute),
      publishRequested: Boolean(args.publish),
      sourceWatchAdmittedArtifactPath: args["source-watch-admitted-artifact"] || process.env.npm_config_source_watch_admitted_artifact || "",
      inputDir: args.input || process.env.npm_config_input || "reports-source",
      dataInputDir: args["data-input"] || process.env.npm_config_data_input || "reports-data",
      outDir: args.out || process.env.npm_config_out || "docs",
      siteUrl: args["site-url"] || process.env.npm_config_site_url || "",
      generatedAt: args["generated-at"] || process.env.npm_config_generated_at || "",
      trendConfigPath: args["trend-config"] || process.env.npm_config_trend_config || ""
    });
    const { summary } = await runDailyCodexPipeline(plan);
    process.stdout.write(`${JSON.stringify({
      ok: summary.ok,
      mode: summary.mode,
      automation_pipeline_mode: summary.automation_pipeline_mode || "",
      orchestration_node_count: summary.orchestration?.node_count || summary.orchestration_node_count || null,
      report_date: summary.report_date,
      final_status: summary.final_status,
      stage_id: summary.stage_id,
      completed_stages: summary.completed_stages.map((stage) => stage.id),
      failures: summary.failures,
      summary_path: plan.outputs.run_summary,
      pipeline_plan_path: summary.pipeline_plan_path || summary.plan_path || plan.outputs.plan,
      structured_json_path: summary.structured_json_path || "",
      html_path: summary.html_path || "",
      docs_data_json_path: summary.docs_data_json_path || "",
      publish_requested: summary.publish_requested,
      execute_requested: summary.execute_requested,
      source_watch_admitted_artifact_path: summary.source_watch_admitted_artifact_path,
      publication: summary.publication,
      validation: summary.validation,
      publish: summary.publish,
      pages: summary.pages,
      blocking_issues: summary.blocking_issues,
      degraded_sections: summary.degraded_sections,
      final_artifact: summary.final_artifact,
      work_dir: plan.work_dir
    }, null, 2)}\n`);
    if (!summary.ok && summary.final_status !== "generated_only") {
      process.exitCode = 1;
    }
  } catch (error) {
    const reportDate = plan?.report_date || (args ? dateFromArgs(args) : fallbackDateFromArgv(rawArgv));
    const rootDir = path.resolve(plan?.root_dir || args?.["repo-root"] || fallbackRootDirFromArgv(rawArgv));
    const existingSummary = plan?.outputs?.run_summary ? await readJsonOrNull(plan.outputs.run_summary) : null;
    const sourceWatchAdmittedArtifactPath = existingSummary?.source_watch_admitted_artifact_path
      || args?.["source-watch-admitted-artifact"]
      || fallbackValueFlag(rawArgv, "source-watch-admitted-artifact")
      || process.env.npm_config_source_watch_admitted_artifact
      || "";
    const summaryPath = plan?.outputs?.run_summary || await writeEntryFailureRunSummary({
      rootDir,
      reportDate,
      error,
      stageId: error.stage_id || (args ? "initialize" : "parse-args"),
      executeRequested: fallbackRequestedFlag(rawArgv, "execute", args?.execute),
      publishRequested: fallbackRequestedFlag(rawArgv, "publish", args?.publish),
      sourceWatchAdmittedArtifactPath
    });
    process.stdout.write(`${JSON.stringify({
      ok: false,
      mode: existingSummary?.mode || "daily_codex_dag_lite",
      automation_pipeline_mode: existingSummary?.automation_pipeline_mode || "",
      orchestration_node_count: existingSummary?.orchestration?.node_count || existingSummary?.orchestration_node_count || null,
      report_date: existingSummary?.report_date || reportDate || "",
      final_status: existingSummary?.final_status || "initialization_failed",
      error: error.code || "daily_codex_pipeline_failed",
      message: error.message,
      stage_id: existingSummary?.stage_id || error.stage_id || (args ? "initialize" : "parse-args"),
      completed_stages: Array.isArray(existingSummary?.completed_stages)
        ? existingSummary.completed_stages.map((stage) => stage.id).filter(Boolean)
        : [],
      failures: Array.isArray(existingSummary?.failures) && existingSummary.failures.length
        ? existingSummary.failures
        : [error.message],
      summary_path: summaryPath,
      pipeline_plan_path: existingSummary?.pipeline_plan_path || existingSummary?.plan_path || "",
      structured_json_path: existingSummary?.structured_json_path || "",
      html_path: existingSummary?.html_path || "",
      publish_requested: existingSummary?.publish_requested ?? fallbackRequestedFlag(rawArgv, "publish", args?.publish),
      execute_requested: existingSummary?.execute_requested ?? fallbackRequestedFlag(rawArgv, "execute", args?.execute),
      source_watch_admitted_artifact_path: sourceWatchAdmittedArtifactPath,
      publication: existingSummary?.publication || null,
      validation: existingSummary?.validation || null,
      publish: existingSummary?.publish || null,
      pages: existingSummary?.pages || null,
      blocking_issues: existingSummary?.blocking_issues || null,
      degraded_sections: existingSummary?.degraded_sections || null
    }, null, 2)}\n`);
    process.exitCode = 1;
  }
}
