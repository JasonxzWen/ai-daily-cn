import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { PublisherError } from "./errors.js";
import { prepareCleanPublishWorktree } from "./publish.js";
import { mergeCommandEnv, npmInvocationForArgs } from "./process-runner.js";
import {
  writeDailyPublishCorrectionRetrospective,
  writeDailyPublishRetrospective
} from "./retrospectives.js";

const execFileAsync = promisify(execFile);
const DEFAULT_PUBLISH_MAX_REVIEW_REPAIR_LOOPS = 5;
const DEFAULT_DRY_RUN_MAX_REVIEW_REPAIR_LOOPS = 1;
const DEFAULT_REPORT_PATH = ".tmp/daily-report.json";
const OPTIMIZED_REPORT_PATH = ".tmp/daily-report.optimized.json";
const CONTENT_SOURCE_DISCOVERY_LIMIT = 240;
const CONTENT_SOURCE_PER_SOURCE_LIMIT = 3;
const PUBLIC_EDITORIAL_REPAIR_TASK_KINDS = new Set([
  "public_editorial_rewrite",
  "main_item_editorial_rewrite",
  "hot_blog_editorial_rewrite",
  "builder_translation_rewrite"
]);

export async function runDailyWorkflow(options = {}) {
  const reportDate = requireReportDate(options.reportDate);
  const launcherRoot = path.resolve(options.launcherRoot || options.repoRoot || process.cwd());
  const publish = Boolean(options.publish);
  const mode = publish ? "publish" : "dry-run";
  const explicitMaxReviewRepairLoops = hasExplicitValue(options.maxReviewRepairLoops);
  const maxReviewRepairLoops = parseReviewRepairLoopBudget(
    explicitMaxReviewRepairLoops
      ? options.maxReviewRepairLoops
      : (publish ? DEFAULT_PUBLISH_MAX_REVIEW_REPAIR_LOOPS : DEFAULT_DRY_RUN_MAX_REVIEW_REPAIR_LOOPS)
  );
  const summaryPath = path.resolve(
    options.summaryPath || path.join(launcherRoot, ".tmp", `run-summary-${reportDate}.json`)
  );
  const now = options.now || (() => new Date().toISOString());
  const runStage = options.runStage || defaultRunStage;
  const existingSummary = options.restart ? null : await readJsonIfExists(summaryPath);
  if (existingSummary?.final_status === "needs_ai_repair") {
    return await resumeDailyWorkflowFromAiRepair({
      summary: existingSummary,
      summaryPath,
      launcherRoot,
      reportDate,
      publish,
      mode,
      maxReviewRepairLoops,
      explicitMaxReviewRepairLoops,
      runStage,
      now
    });
  }

  const summary = {
    schema_version: 1,
    report_date: reportDate,
    mode,
    launcher_root: launcherRoot,
    clean_repo_root: "",
    summary_path: summaryPath,
    max_review_repair_loops: maxReviewRepairLoops,
    review_repair_attempts: 0,
    current_report_path: DEFAULT_REPORT_PATH,
    candidate_pool_path: candidatePoolPath(reportDate),
    quality_review_path: qualityReviewPath(reportDate),
    quality_repair_path: qualityRepairPath(reportDate),
    stages: [],
    started_at: now(),
    updated_at: now(),
    final_status: "running",
    next_action: { kind: "none" }
  };

  await writeSummary(summaryPath, summary);

  const prepareCleanWorktree = options.prepareCleanWorktree || defaultPrepareCleanWorktree;
  let prepared;
  try {
    prepared = await prepareCleanWorktree({
      launcherRoot,
      reportDate,
      publish,
      allowedBranch: options.allowedBranch,
      worktreeDir: options.worktreeDir
    });
    summary.clean_repo_root = path.resolve(prepared.next_cwd || prepared.clean_repo_root || prepared.repo_root || "");
    recordStage(summary, {
      id: "prepare_clean_worktree",
      status: "passed",
      output: {
        next_cwd: summary.clean_repo_root,
        remote_main_sha: prepared.remote_main_sha || prepared.remoteMainSha || ""
      },
      now
    });
  } catch (error) {
    recordStage(summary, {
      id: "prepare_clean_worktree",
      status: "failed",
      error,
      now
    });
    summary.final_status = "blocked";
    summary.next_action = blockedNextAction(error);
    await writeSummary(summaryPath, summary);
    return { summary, summaryPath };
  }

  const context = {
    launcherRoot,
    cleanRoot: summary.clean_repo_root,
    reportDate,
    publish,
    mode,
    summaryPath,
    maxReviewRepairLoops,
    writeRetrospective: options.writeRetrospective !== false,
    now
  };

  for (const stage of buildInitialWorkflowStages({ reportDate })) {
    const outcome = await runAndRecordStage({ stage, context, summary, runStage, now });
    if (outcome.blocked) {
      summary.final_status = "blocked";
      summary.next_action = blockedNextAction(outcome.error);
      await writeSummary(summaryPath, summary);
      return { summary, summaryPath };
    }

    if (stage.id === "quality_review") {
      const repairDecision = classifyQualityReviewResult(outcome.normalized, {
        summary,
        reportDate,
        maxReviewRepairLoops,
        reportPath: DEFAULT_REPORT_PATH
      });
      if (repairDecision) {
        summary.final_status = repairDecision.final_status;
        summary.next_action = repairDecision.next_action;
        await writeSummary(summaryPath, summary);
        return { summary, summaryPath };
      }
    } else if (!outcome.normalized.ok) {
      summary.final_status = "blocked";
      summary.next_action = {
        kind: "inspect_stage_failure",
        stage_id: stage.id,
        summary_path: summaryPath
      };
      await writeSummary(summaryPath, summary);
      return { summary, summaryPath };
    }

    await writeSummary(summaryPath, summary);
  }

  return await runPostQualityStages({
    summary,
    summaryPath,
    context,
    runStage,
    now,
    reportDate,
    publish,
    reportPath: DEFAULT_REPORT_PATH
  });
}

async function resumeDailyWorkflowFromAiRepair({
  summary,
  summaryPath,
  launcherRoot,
  reportDate,
  publish,
  mode,
  maxReviewRepairLoops,
  explicitMaxReviewRepairLoops,
  runStage,
  now
}) {
  summary.summary_path = summaryPath;
  summary.updated_at = now();
  if (summary.report_date !== reportDate || summary.mode !== mode) {
    return {
      summary: {
        ...summary,
        final_status: "blocked",
        next_action: {
          kind: "restart_required",
          summary_path: summaryPath,
          existing_mode: summary.mode,
          requested_mode: mode,
          message: "Existing AI repair state belongs to a different report date or runner mode. Re-run daily:run with --restart to discard it."
        }
      },
      summaryPath
    };
  }

  const previousNextAction = summary.next_action || {};
  const contractPath = previousNextAction.contract_path;
  if (!contractPath || !(await fileExists(contractPath))) {
    summary.final_status = "needs_ai_repair";
    await writeSummary(summaryPath, summary);
    return { summary, summaryPath };
  }

  const contract = await readJsonIfExists(contractPath);
  const contractReadiness = classifyAiRepairContractReadiness(contract);
  if (!contractReadiness.ready) {
    summary.final_status = "needs_ai_repair";
    summary.next_action = {
      ...previousNextAction,
      kind: "codex_ai_repair_contract",
      contract_path: contractPath,
      summary_path: summaryPath,
      contract_status: contractReadiness.status,
      message: contractReadiness.message
    };
    await writeSummary(summaryPath, summary);
    return { summary, summaryPath };
  }

  if (!summary.clean_repo_root) {
    summary.final_status = "blocked";
    summary.next_action = {
      kind: "inspect_blocker",
      error_code: "daily_runner_clean_root_missing",
      message: "Cannot resume AI repair without clean_repo_root in the run summary."
    };
    await writeSummary(summaryPath, summary);
    return { summary, summaryPath };
  }

  summary.launcher_root = launcherRoot;
  const effectiveMaxReviewRepairLoops = parseReviewRepairLoopBudget(
    explicitMaxReviewRepairLoops ? maxReviewRepairLoops : (summary.max_review_repair_loops ?? maxReviewRepairLoops)
  );
  summary.max_review_repair_loops = effectiveMaxReviewRepairLoops;
  summary.final_status = "running";
  summary.next_action = { kind: "none" };
  const rawSourceReportPath = summary.current_report_path || previousNextAction.source_report_path || DEFAULT_REPORT_PATH;
  summary.current_report_path = stagePath(rawSourceReportPath, path.resolve(summary.clean_repo_root)) || DEFAULT_REPORT_PATH;
  summary.candidate_pool_path = summary.candidate_pool_path || candidatePoolPath(reportDate);
  summary.quality_review_path = summary.quality_review_path || qualityReviewPath(reportDate);
  summary.quality_repair_path = summary.quality_repair_path || qualityRepairPath(reportDate);

  const context = {
    launcherRoot,
    cleanRoot: path.resolve(summary.clean_repo_root),
    reportDate,
    publish,
    mode,
    summaryPath,
    maxReviewRepairLoops: effectiveMaxReviewRepairLoops,
    writeRetrospective: true,
    now
  };
  const sourceReportPath = stagePath(summary.current_report_path, context.cleanRoot) || DEFAULT_REPORT_PATH;
  const repairStages = buildAiRepairWorkflowStages({
    reportDate,
    sourceReportPath,
    outputReportPath: OPTIMIZED_REPORT_PATH,
    contractPath,
    candidatePoolPath: summary.candidate_pool_path
  });

  for (const stage of repairStages) {
    const outcome = await runAndRecordStage({ stage, context, summary, runStage, now });
    if (outcome.blocked) {
      summary.final_status = "blocked";
      summary.next_action = blockedNextAction(outcome.error);
      await writeSummary(summaryPath, summary);
      return { summary, summaryPath };
    }

    if (stage.id === "quality_ai_repair") {
      if (!outcome.normalized.ok) {
        const repairReviewDecision = await classifyAiRepairReviewFailure(outcome.normalized, {
          summary,
          reportDate,
          maxReviewRepairLoops: effectiveMaxReviewRepairLoops,
          reportPath: OPTIMIZED_REPORT_PATH
        });
        if (repairReviewDecision) {
          summary.final_status = repairReviewDecision.final_status;
          summary.next_action = repairReviewDecision.next_action;
        } else {
          summary.final_status = "blocked";
          summary.next_action = {
            kind: "inspect_stage_failure",
            stage_id: stage.id,
            summary_path: summaryPath
          };
        }
        await writeSummary(summaryPath, summary);
        return { summary, summaryPath };
      }
      summary.current_report_path = OPTIMIZED_REPORT_PATH;
    } else if (stage.id === "quality_review") {
      const repairDecision = classifyQualityReviewResult(outcome.normalized, {
        summary,
        reportDate,
        maxReviewRepairLoops: effectiveMaxReviewRepairLoops,
        reportPath: OPTIMIZED_REPORT_PATH
      });
      if (repairDecision) {
        summary.final_status = repairDecision.final_status;
        summary.next_action = repairDecision.next_action;
        await writeSummary(summaryPath, summary);
        return { summary, summaryPath };
      }
      if (!outcome.normalized.ok) {
        summary.final_status = "blocked";
        summary.next_action = {
          kind: "inspect_stage_failure",
          stage_id: stage.id,
          summary_path: summaryPath
        };
        await writeSummary(summaryPath, summary);
        return { summary, summaryPath };
      }
    }

    await writeSummary(summaryPath, summary);
  }

  return await runPostQualityStages({
    summary,
    summaryPath,
    context,
    runStage,
    now,
    reportDate,
    publish,
    reportPath: OPTIMIZED_REPORT_PATH
  });
}

async function runPostQualityStages({
  summary,
  summaryPath,
  context,
  runStage,
  now,
  reportDate,
  publish,
  reportPath
}) {
  for (const stage of buildPostQualityWorkflowStages({ reportDate, publish, reportPath })) {
    if (stage.id === "validate") {
      const retrospectiveOutcome = await writeRetrospectiveStage({
        summary,
        context,
        reportDate,
        status: "generated_only",
        now
      });
      if (retrospectiveOutcome.blocked) {
        summary.final_status = "blocked";
        summary.next_action = {
          kind: "inspect_stage_failure",
          stage_id: "retrospective_write",
          summary_path: summaryPath
        };
        await writeSummary(summaryPath, summary);
        return { summary, summaryPath };
      }
      await writeSummary(summaryPath, summary);
    }

    if (publish && stage.id === "publish_real") {
      const finalized = await finalizeRetrospectiveBeforePublish({
        summary,
        summaryPath,
        context,
        runStage,
        now,
        reportDate
      });
      if (finalized.blocked) {
        return { summary, summaryPath };
      }
    }

    const outcome = await runAndRecordStage({ stage, context, summary, runStage, now });
    if (publish && stage.id === "publish_real" && (outcome.blocked || !outcome.normalized.ok)) {
      const fallbackStage = buildPublishFallbackStage(reportDate);
      const fallbackOutcome = await runAndRecordStage({ stage: fallbackStage, context, summary, runStage, now });
      if (fallbackOutcome.blocked) {
        summary.final_status = "blocked";
        summary.next_action = {
          ...blockedNextAction(fallbackOutcome.error),
          failed_stage_id: fallbackStage.id,
          previous_stage_id: stage.id
        };
        await writePublishCorrectionForBlockedRun({
          summary,
          context,
          reportDate,
          now,
          runStage
        });
        await writeSummary(summaryPath, summary);
        return { summary, summaryPath };
      }
      if (!fallbackOutcome.normalized.ok) {
        summary.final_status = "blocked";
        summary.next_action = {
          kind: "inspect_stage_failure",
          stage_id: fallbackStage.id,
          previous_stage_id: stage.id,
          summary_path: summaryPath
        };
        await writePublishCorrectionForBlockedRun({
          summary,
          context,
          reportDate,
          now,
          runStage
        });
        await writeSummary(summaryPath, summary);
        return { summary, summaryPath };
      }
      await writeSummary(summaryPath, summary);
      continue;
    }
    if (outcome.blocked) {
      summary.final_status = "blocked";
      summary.next_action = blockedNextAction(outcome.error);
      await writeSummary(summaryPath, summary);
      return { summary, summaryPath };
    }
    if (!outcome.normalized.ok) {
      summary.final_status = "blocked";
      summary.next_action = {
        kind: "inspect_stage_failure",
        stage_id: stage.id,
        summary_path: summaryPath
      };
      await writeSummary(summaryPath, summary);
      return { summary, summaryPath };
    }
    await writeSummary(summaryPath, summary);
  }

  summary.final_status = publish ? "published" : "generated_only";
  summary.next_action = { kind: "none" };
  summary.updated_at = now();
  await writeSummary(summaryPath, summary);
  return { summary, summaryPath };
}

async function finalizeRetrospectiveBeforePublish({
  summary,
  summaryPath,
  context,
  runStage,
  now,
  reportDate
}) {
  const retrospectiveOutcome = await writeRetrospectiveStage({
    summary,
    context,
    reportDate,
    status: "published",
    now,
    stageId: "retrospective_finalize",
    summaryKey: "retrospective_finalization"
  });
  if (retrospectiveOutcome.blocked) {
    summary.final_status = "blocked";
    summary.next_action = {
      kind: "inspect_stage_failure",
      stage_id: "retrospective_finalize",
      summary_path: summaryPath
    };
    await writeSummary(summaryPath, summary);
    return { blocked: true };
  }
  if (retrospectiveOutcome.skipped) {
    await writeSummary(summaryPath, summary);
    return { blocked: false, skipped: true };
  }

  const validationOutcome = await runAndRecordStage({
    stage: buildRetrospectiveValidateStage("retrospective_validate"),
    context,
    summary,
    runStage,
    now
  });
  if (validationOutcome.blocked) {
    summary.final_status = "blocked";
    summary.next_action = blockedNextAction(validationOutcome.error);
    await writeSummary(summaryPath, summary);
    return { blocked: true };
  }
  if (!validationOutcome.normalized.ok) {
    summary.final_status = "blocked";
    summary.next_action = {
      kind: "inspect_stage_failure",
      stage_id: "retrospective_validate",
      summary_path: summaryPath
    };
    await writeSummary(summaryPath, summary);
    return { blocked: true };
  }

  await writeSummary(summaryPath, summary);
  return { blocked: false };
}

async function writeRetrospectiveStage({
  summary,
  context,
  reportDate,
  status,
  now,
  stageId = "retrospective_write",
  summaryKey = "retrospective"
}) {
  if (context.writeRetrospective === false) {
    return { blocked: false, skipped: true };
  }
  try {
    const output = await writeDailyPublishRetrospective({
      rootDir: context.cleanRoot,
      summary,
      reportDate,
      status,
      now
    });
    summary[summaryKey] = output;
    summary.retrospective = output;
    recordStage(summary, {
      id: stageId,
      status: "passed",
      output,
      now
    });
    return { blocked: false, output };
  } catch (error) {
    summary.retrospective = {
      ok: false,
      error_code: error.code || "retrospective_write_failed",
      message: error.message
    };
    summary[summaryKey] = summary.retrospective;
    recordStage(summary, {
      id: stageId,
      status: "failed",
      error,
      now
    });
    return { blocked: true, error };
  }
}

async function writePublishCorrectionForBlockedRun({ summary, context, reportDate, now, runStage }) {
  if (context.writeRetrospective === false) {
    return { blocked: false, skipped: true };
  }
  try {
    const output = await writeDailyPublishCorrectionRetrospective({
      rootDir: context.cleanRoot,
      summary,
      reportDate,
      status: "blocked",
      now
    });
    summary.retrospective_correction = output;
    recordStage(summary, {
      id: "retrospective_correction_write",
      status: "passed",
      output,
      now
    });
    const validationOutcome = await runAndRecordStage({
      stage: buildRetrospectiveValidateStage("retrospective_correction_validate"),
      context,
      summary,
      runStage,
      now
    });
    return validationOutcome.blocked || !validationOutcome.normalized.ok
      ? { blocked: true, validationOutcome }
      : { blocked: false, output };
  } catch (error) {
    summary.retrospective_correction = {
      ok: false,
      error_code: error.code || "retrospective_correction_failed",
      message: error.message
    };
    recordStage(summary, {
      id: "retrospective_correction_write",
      status: "failed",
      error,
      now
    });
    return { blocked: true, error };
  }
}

export function buildDailyWorkflowStages({ reportDate, publish }) {
  return [
    ...buildInitialWorkflowStages({ reportDate }),
    ...buildPostQualityWorkflowStages({ reportDate, publish, reportPath: DEFAULT_REPORT_PATH })
  ];
}

function buildInitialWorkflowStages({ reportDate }) {
  const tmp = (name) => `.tmp/${name}-${reportDate}.json`;
  const discoveryInputs = [
    tmp("github-trending"),
    tmp("huggingface-trending"),
    tmp("builders"),
    tmp("china-ai"),
    tmp("content-sources"),
    tmp("statuspage-incidents"),
    tmp("search-news"),
    tmp("wechat-platform"),
    tmp("zhihu-platform"),
    tmp("reddit-platform"),
    tmp("sources-health")
  ].join(",");
  const stages = [
    npmStage("prompt_build", ["run", "prompt:build", "--", reportDate]),
    npmStage("sources_validate", ["run", "sources:validate"]),
    nodeCliStage("discover_github_trending", [
      "discover:github-trending",
      "--date",
      reportDate,
      "--limit",
      "50",
      "--history-root",
      "reports-data",
      "--output",
      tmp("github-trending")
    ]),
    nodeCliStage("discover_huggingface_trending", [
      "discover:huggingface-trending",
      "--date",
      reportDate,
      "--limit",
      "20",
      "--output",
      tmp("huggingface-trending")
    ]),
    nodeCliStage("discover_builders", [
      "discover:builders",
      "--date",
      reportDate,
      "--limit",
      "20",
      "--output",
      tmp("builders")
    ]),
    nodeCliStage("discover_china_ai", [
      "discover:china-ai",
      "--date",
      reportDate,
      "--limit",
      "30",
      "--per-source-limit",
      "3",
      "--output",
      tmp("china-ai")
    ]),
    nodeCliStage("discover_content_sources", [
      "discover:content-sources",
      "--date",
      reportDate,
      "--limit",
      String(CONTENT_SOURCE_DISCOVERY_LIMIT),
      "--per-source-limit",
      String(CONTENT_SOURCE_PER_SOURCE_LIMIT),
      "--output",
      tmp("content-sources")
    ]),
    nodeCliStage("discover_statuspage_incidents", [
      "discover:statuspage-incidents",
      "--date",
      reportDate,
      "--limit",
      "20",
      "--output",
      tmp("statuspage-incidents")
    ]),
    nodeCliStage("discover_search_news", [
      "discover:search-news",
      "--date",
      reportDate,
      "--providers",
      "gdelt,openalex,arxiv",
      "--queries",
      "config/search-queries.json",
      "--limit",
      "40",
      "--provider-timeout-ms",
      "45000",
      "--shadow",
      "--output",
      tmp("search-news")
    ]),
    nodeCliStage("discover_wechat_platform", [
      "discover:wechat-platform",
      "--date",
      reportDate,
      "--limit",
      "20",
      "--output",
      tmp("wechat-platform")
    ]),
    nodeCliStage("discover_zhihu_platform", [
      "discover:zhihu-platform",
      "--date",
      reportDate,
      "--limit",
      "20",
      "--output",
      tmp("zhihu-platform")
    ]),
    nodeCliStage("discover_reddit_platform", [
      "discover:reddit-platform",
      "--date",
      reportDate,
      "--limit",
      "20",
      "--output",
      tmp("reddit-platform")
    ]),
    nodeCliStage("sources_health", [
      "sources:health",
      "--date",
      reportDate,
      "--sources",
      "config/sources",
      "--enablement",
      "core,optional,manual",
      "--output",
      tmp("sources-health")
    ]),
    nodeCliStage("report_draft", [
      "report:draft",
      "--date",
      reportDate,
      "--input",
      discoveryInputs,
      "--output",
      DEFAULT_REPORT_PATH,
      "--candidate-output",
      candidatePoolPath(reportDate)
    ]),
    nodeCliStage("quality_review", [
      "quality:review",
      DEFAULT_REPORT_PATH,
      tmp("quality-review"),
      candidatePoolPath(reportDate)
    ])
  ];
  return stages;
}

function buildAiRepairWorkflowStages({
  reportDate,
  sourceReportPath,
  outputReportPath,
  contractPath,
  candidatePoolPath
}) {
  const tmp = (name) => `.tmp/${name}-${reportDate}.json`;
  return [
    nodeCliStage("quality_ai_repair", [
      "quality:repair",
      sourceReportPath,
      outputReportPath,
      qualityRepairPath(reportDate),
      contractPath,
      candidatePoolPath
    ]),
    nodeCliStage("quality_review", [
      "quality:review",
      outputReportPath,
      tmp("quality-review"),
      candidatePoolPath
    ])
  ];
}

function buildPostQualityWorkflowStages({ reportDate, publish, reportPath }) {
  const tmp = (name) => `.tmp/${name}-${reportDate}.json`;
  const stages = [
    nodeCliStage("report_write", [
      "report:write",
      reportPath,
      "reports-data",
      reportDate
    ]),
    npmStage("build", ["run", "build"]),
    npmStage("quality_page_check", [
      "run",
      "quality:page-check",
      "--",
      reportDate,
      "docs",
      tmp("page-check")
    ]),
    npmStage("validate", ["run", "validate"]),
    npmStage("sources_phase5_audit", [
      "run",
      "sources:phase5-audit",
      "--",
      "--date",
      reportDate,
      "--history-dir",
      "reports-data",
      "--days",
      "3",
      "--output",
      tmp("sources-phase5-audit")
    ]),
    npmStage("publish_dry_run_daily", ["run", "publish:dry-run:daily", "--", "--date", reportDate])
  ];
  if (publish) {
    stages.push(npmStage("publish_real", ["run", "publish", "--", "confirm-push", reportDate]));
  }
  return stages;
}

function buildPublishFallbackStage(reportDate) {
  return npmStage("publish_github_api_fallback", ["run", "publish:github-api", "--", "confirm-push", reportDate]);
}

function buildRetrospectiveValidateStage(id) {
  return {
    id,
    command: {
      tool: "node",
      args: ["scripts/validate-retrospectives.mjs"]
    }
  };
}

async function defaultPrepareCleanWorktree({ launcherRoot, allowedBranch, worktreeDir }) {
  return await prepareCleanPublishWorktree({
    repoRoot: launcherRoot,
    allowedBranch,
    worktreeDir
  });
}

async function runAndRecordStage({ stage, context, summary, runStage, now }) {
  let stageResult;
  try {
    stageResult = await runStage(stage, context);
  } catch (error) {
    recordStage(summary, {
      id: stage.id,
      status: "failed",
      command: stage.command,
      error,
      now
    });
    return { blocked: true, error };
  }

  const normalized = normalizeStageResult(stageResult);
  recordStage(summary, {
    id: stage.id,
    status: normalized.ok ? "passed" : "failed",
    command: stage.command,
    output: normalized.output,
    now
  });
  return { blocked: false, normalized };
}

async function defaultRunStage(stage, context) {
  const command = resolveStageCommand(stage);
  const { stdout, stderr } = await execFileAsync(command.file, command.args, {
    cwd: context.cleanRoot,
    env: mergeCommandEnv(command.env),
    timeout: stage.timeout_ms || 20 * 60 * 1000,
    maxBuffer: 50 * 1024 * 1024
  });
  return {
    ok: true,
    output: parseJsonOutput(stdout) || { stdout: trimOutput(stdout), stderr: trimOutput(stderr) }
  };
}

function classifyQualityReviewResult(stageResult, { summary, reportDate, maxReviewRepairLoops, reportPath }) {
  const review = stageResult.output?.review || stageResult.output;
  const hasReviewPayload =
    Boolean(stageResult.output?.review) ||
    Object.prototype.hasOwnProperty.call(stageResult.output || {}, "ok") ||
    Array.isArray(stageResult.output?.ai_review_tasks) ||
    Array.isArray(review?.ai_review_tasks);
  if (!hasReviewPayload && stageResult.ok) {
    return null;
  }
  const reviewOk = review?.ok === true || stageResult.output?.ok === true;
  if (reviewOk && stageResult.ok) {
    return null;
  }

  const reviewRepairAttempt = Number(summary.review_repair_attempts || 0) + 1;
  summary.review_repair_attempts = reviewRepairAttempt;
  const aiTasks = Array.isArray(review?.ai_review_tasks)
    ? review.ai_review_tasks
    : Array.isArray(stageResult.output?.ai_review_tasks)
      ? stageResult.output.ai_review_tasks
      : [];
  if (aiTasks.length > 0 && reviewRepairAttempt <= maxReviewRepairLoops) {
    const contractPath = aiRepairContractPath(summary.launcher_root, reportDate, reviewRepairAttempt);
    return {
      final_status: "needs_ai_repair",
      next_action: {
        kind: "codex_ai_repair_contract",
        contract_path: contractPath,
        summary_path: summary.summary_path,
        source_report_path: absoluteCleanPath(summary.clean_repo_root, reportPath),
        candidate_pool_path: absoluteCleanPath(summary.clean_repo_root, summary.candidate_pool_path || candidatePoolPath(reportDate)),
        quality_review_path: absoluteCleanPath(summary.clean_repo_root, summary.quality_review_path || qualityReviewPath(reportDate)),
        max_review_repair_loops: maxReviewRepairLoops,
        remaining_review_repair_loops: maxReviewRepairLoops - reviewRepairAttempt,
        ai_review_tasks: aiTasks,
        required_contract_status: "ready",
        required_contract_fields: ["schema_version", "report_date", "status", "edits"],
        message: "Write the AI repair contract with status:\"ready\" and non-empty edits before resuming daily:run."
      }
    };
  }

  return {
    final_status: "blocked",
    next_action: {
      kind: "report_quality_blocked",
      summary_path: summary.summary_path,
      quality_review_path: absoluteCleanPath(summary.clean_repo_root, summary.quality_review_path || qualityReviewPath(reportDate)),
      max_review_repair_loops: maxReviewRepairLoops,
      remaining_review_repair_loops: Math.max(0, maxReviewRepairLoops - reviewRepairAttempt)
    }
  };
}

function classifyAiRepairContractReadiness(contract) {
  if (!contract || typeof contract !== "object") {
    return {
      ready: false,
      status: "invalid",
      message: "AI repair contract must be a JSON object."
    };
  }
  const status = String(contract.status || "missing").trim() || "missing";
  const edits = Array.isArray(contract.edits) ? contract.edits : [];
  if (status === "ready" && edits.length > 0) {
    return { ready: true, status };
  }
  return {
    ready: false,
    status,
    message: "AI repair contract template is waiting for status:\"ready\" and at least one edit."
  };
}

async function classifyAiRepairReviewFailure(stageResult, {
  summary,
  reportDate,
  maxReviewRepairLoops,
  reportPath
}) {
  const output = stageResult.output || {};
  const contractRejected = Array.isArray(output.contract_rejected) ? output.contract_rejected : null;
  const contractApplied = Array.isArray(output.contract_applied) ? output.contract_applied : null;
  if (!contractRejected || contractRejected.length > 0 || !contractApplied || contractApplied.length === 0) {
    return null;
  }

  const review = output.review && typeof output.review === "object" ? output.review : null;
  const aiTasks = Array.isArray(review?.ai_review_tasks) ? review.ai_review_tasks : [];
  if (!review || review.ok === true || aiTasks.length === 0 || !aiTasks.every(isPublicEditorialRepairTask)) {
    return null;
  }

  const nextAttempt = await nextAiRepairAttempt({
    launcherRoot: summary.launcher_root,
    reportDate,
    startAttempt: Number(summary.review_repair_attempts || 0) + 1,
    maxReviewRepairLoops
  });
  if (!nextAttempt) {
    return {
      final_status: "blocked",
      next_action: {
        kind: "report_quality_blocked",
        summary_path: summary.summary_path,
        quality_review_path: absoluteCleanPath(summary.clean_repo_root, summary.quality_review_path || qualityReviewPath(reportDate)),
        max_review_repair_loops: maxReviewRepairLoops,
        remaining_review_repair_loops: 0
      }
    };
  }

  summary.review_repair_attempts = nextAttempt.attempt;
  summary.current_report_path = reportPath;
  await writeAiRepairContractTemplate(nextAttempt.contractPath, {
    reportDate,
    review,
    aiTasks
  });

  return {
    final_status: "needs_ai_repair",
    next_action: {
      kind: "codex_ai_repair_contract",
      contract_path: nextAttempt.contractPath,
      summary_path: summary.summary_path,
      source_report_path: absoluteCleanPath(summary.clean_repo_root, reportPath),
      candidate_pool_path: absoluteCleanPath(summary.clean_repo_root, summary.candidate_pool_path || candidatePoolPath(reportDate)),
      quality_review_path: absoluteCleanPath(summary.clean_repo_root, summary.quality_review_path || qualityReviewPath(reportDate)),
      max_review_repair_loops: maxReviewRepairLoops,
      remaining_review_repair_loops: maxReviewRepairLoops - nextAttempt.attempt,
      ai_review_tasks: aiTasks,
      contract_status: "template",
      required_contract_status: "ready",
      required_contract_fields: ["schema_version", "report_date", "status", "edits"],
      message: "Fill this template with public-text edits, set status:\"ready\", and resume daily:run."
    }
  };
}

function isPublicEditorialRepairTask(task) {
  return task && PUBLIC_EDITORIAL_REPAIR_TASK_KINDS.has(String(task.kind || ""));
}

async function nextAiRepairAttempt({ launcherRoot, reportDate, startAttempt, maxReviewRepairLoops }) {
  for (let attempt = Math.max(1, startAttempt); attempt <= maxReviewRepairLoops; attempt += 1) {
    const contractPath = aiRepairContractPath(launcherRoot, reportDate, attempt);
    if (!(await fileExists(contractPath))) {
      return { attempt, contractPath };
    }
  }
  return null;
}

async function writeAiRepairContractTemplate(contractPath, { reportDate, review, aiTasks }) {
  const template = {
    schema_version: 1,
    report_date: reportDate,
    status: "template",
    edits: [],
    review_issues: summarizeAiRepairReviewIssues(review, aiTasks),
    bad_examples: [
      {
        value: "它的价值在于……",
        comment: "泛化价值判断；改为来源中的具体机制、证据、边界或适用条件。"
      },
      {
        value: "读者应关注……",
        comment: "泛化建议；改为这条来源实际披露了什么，以及能被验证的变化。"
      },
      {
        value: "它的工程意义是……",
        comment: "库存短语；改为具体影响对象、限制条件和可观察结果。"
      },
      {
        value: "落地前需要评估……",
        comment: "空泛风险提醒；只有来源给出限制、成本、许可或风险时才写具体条件。"
      }
    ]
  };
  await fs.mkdir(path.dirname(contractPath), { recursive: true });
  await fs.writeFile(contractPath, `${JSON.stringify(template, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx"
  });
}

function summarizeAiRepairReviewIssues(review, aiTasks) {
  const taskByPath = new Map(
    aiTasks
      .filter((task) => task?.path)
      .map((task) => [task.path, task])
  );
  const issues = Array.isArray(review?.issues) ? review.issues : [];
  if (issues.length > 0) {
    return issues.map((issue) => {
      const task = taskByPath.get(issue?.path);
      return {
        code: String(issue?.code || ""),
        severity: String(issue?.severity || ""),
        path: String(issue?.path || ""),
        message: String(issue?.message || ""),
        task_kind: String(task?.kind || ""),
        instruction: String(task?.instruction || "")
      };
    });
  }
  return aiTasks.map((task) => ({
    code: "",
    severity: "",
    path: String(task?.path || ""),
    message: "",
    task_kind: String(task?.kind || ""),
    instruction: String(task?.instruction || "")
  }));
}

function normalizeStageResult(stageResult) {
  if (!stageResult || typeof stageResult !== "object") {
    return { ok: Boolean(stageResult), output: {} };
  }
  const output = stageResult.output || stageResult;
  return {
    ok: stageResult.ok !== false && output?.ok !== false,
    output
  };
}

function recordStage(summary, { id, status, command, output, error, now }) {
  const errorOutput = error ? extractErrorOutput(error) : null;
  summary.stages.push({
    id,
    status,
    ...(command ? { command } : {}),
    ...(output ? { output: sanitizeStageOutput(output) } : {}),
    ...(errorOutput ? { output: sanitizeStageOutput(errorOutput) } : {}),
    ...(error ? { error: error.message, error_code: error.code || "" } : {}),
    updated_at: now()
  });
  summary.updated_at = now();
}

function extractErrorOutput(error) {
  const output = {};
  if (error && Object.prototype.hasOwnProperty.call(error, "stdout")) {
    output.stdout = trimOutput(error.stdout);
  }
  if (error && Object.prototype.hasOwnProperty.call(error, "stderr")) {
    output.stderr = trimOutput(error.stderr);
  }
  return Object.keys(output).length > 0 ? output : null;
}

async function writeSummary(summaryPath, summary) {
  await fs.mkdir(path.dirname(summaryPath), { recursive: true });
  await fs.writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function candidatePoolPath(reportDate) {
  return `.tmp/source-candidates-${reportDate}.json`;
}

function qualityReviewPath(reportDate) {
  return `.tmp/quality-review-${reportDate}.json`;
}

function qualityRepairPath(reportDate) {
  return `.tmp/quality-repair-${reportDate}.json`;
}

function aiRepairContractPath(launcherRoot, reportDate, attempt) {
  const suffix = attempt <= 1 ? "" : `-attempt-${attempt}`;
  return path.join(launcherRoot, ".tmp", `quality-ai-repair-${reportDate}${suffix}.json`);
}

function absoluteCleanPath(cleanRoot, filePath) {
  if (!filePath) return "";
  return path.isAbsolute(filePath) ? filePath : path.join(cleanRoot, filePath);
}

function stagePath(filePath, cleanRoot) {
  if (!filePath) return "";
  if (!path.isAbsolute(filePath)) return normalizeStagePath(filePath);
  const relative = path.relative(cleanRoot, filePath);
  if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
    return normalizeStagePath(relative);
  }
  return filePath;
}

function normalizeStagePath(filePath) {
  return filePath.split(/[\\/]/).join("/");
}

function hasExplicitValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function parseReviewRepairLoopBudget(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new PublisherError(
      "daily_runner_invalid_review_repair_loop_budget",
      "--max-review-repair-loops must be a non-negative integer."
    );
  }
  return parsed;
}

function blockedNextAction(error) {
  return {
    kind: "inspect_blocker",
    error_code: error.code || "unexpected_error",
    message: error.message
  };
}

function npmStage(id, args) {
  return {
    id,
    command: {
      tool: "npm",
      args
    }
  };
}

function nodeCliStage(id, args) {
  return {
    id,
    command: {
      tool: "node",
      args: ["src/cli.js", ...args]
    }
  };
}

function resolveStageCommand(stage) {
  if (stage.command.tool === "npm") {
    const npmCache = process.env.NPM_CONFIG_CACHE || process.env.npm_config_cache || "";
    const env = {
      NPM_CONFIG_AUDIT: process.env.NPM_CONFIG_AUDIT || "false",
      NPM_CONFIG_FUND: process.env.NPM_CONFIG_FUND || "false"
    };
    if (npmCache) {
      env.NPM_CONFIG_CACHE = npmCache;
    }
    const invocation = npmInvocationForArgs(stage.command.args);
    return {
      ...invocation,
      env
    };
  }
  if (stage.command.tool === "node") {
    return {
      file: process.execPath,
      args: stage.command.args
    };
  }
  throw new PublisherError("daily_runner_unknown_stage_tool", `Unknown stage tool: ${stage.command.tool}`);
}

function parseJsonOutput(stdout) {
  const trimmed = String(stdout || "").trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function trimOutput(value) {
  const text = String(value || "").trim();
  return text.length > 4000 ? `${text.slice(0, 4000)}...` : text;
}

function sanitizeStageOutput(output) {
  const json = JSON.stringify(output);
  if (json.length <= 12000) return output;
  return {
    truncated: true,
    bytes: Buffer.byteLength(json),
    preview: `${json.slice(0, 12000)}...`
  };
}

function requireReportDate(reportDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(reportDate || ""))) {
    throw new PublisherError("daily_report_date_required", "daily:run requires --date YYYY-MM-DD.");
  }
  return reportDate;
}
