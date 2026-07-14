import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { PublisherError } from "./errors.js";
import { prepareCleanPublishWorktree } from "./publish.js";
import { mergeCommandEnv, pnpmInvocationForArgs } from "./process-runner.js";
import { createPublicDegradationEvent } from "./degradation-events.js";
import {
  writeDailyPublishCorrectionRetrospective,
  writeDailyPublishRetrospective
} from "./retrospectives.js";
import {
  FIRST_PASS_AUTHORING_CONTRACT,
  FIRST_PASS_AUTHORING_INTENT,
  FIRST_PASS_AUTHORING_PHASE,
  annotateAuthoringTasks,
  buildFirstPassAuthoringTasks,
  validateFirstPassAuthoringContract,
  reviewReportQuality
} from "./quality-loop.js";

const execFileAsync = promisify(execFile);
const DEFAULT_PUBLISH_MAX_REVIEW_REPAIR_LOOPS = 5;
const DEFAULT_DRY_RUN_MAX_REVIEW_REPAIR_LOOPS = 1;
const DEFAULT_REPORT_PATH = ".tmp/daily-report.json";
const AUTHORED_REPORT_PATH = ".tmp/daily-report.authored.json";
const OPTIMIZED_REPORT_PATH = ".tmp/daily-report.optimized.json";
const CONTENT_SOURCE_DISCOVERY_LIMIT = 240;
const CONTENT_SOURCE_PER_SOURCE_LIMIT = 3;
const RESILIENCE_POLICY_PATH = path.join("config", "daily-resilience-policy.json");
const DISCOVERY_DEGRADE_FALLBACKS = {
  discover_github_trending: {
    auditGroup: "github_trending",
    sourceName: "GitHub Trending",
    sourceUrl: "https://github.com/trending",
    sourceCategory: "github_trending"
  },
  discover_source_watch: {
    fallbackKind: "persistent_candidate_history_only",
    groups: [
      {
        auditGroup: "github_watch",
        sourceName: "GitHub Source Watch targets",
        sourceUrl: "https://github.com/JasonxzWen/ai-daily-cn/blob/main/config/source-watchlist.json",
        sourceCategory: "project"
      },
      {
        auditGroup: "site_watch",
        sourceName: "Site Source Watch targets",
        sourceUrl: "https://github.com/JasonxzWen/ai-daily-cn/blob/main/config/source-watchlist.json",
        sourceCategory: "community"
      }
    ]
  },
  discover_huggingface_trending: {
    auditGroup: "huggingface_trending",
    sourceName: "Hugging Face Trending",
    sourceUrl: "https://huggingface.co/models?sort=trending",
    sourceCategory: "project"
  },
  discover_builders: {
    auditGroup: "builder_sources",
    sourceName: "Builder discovery",
    sourceUrl: "https://x.com/",
    sourceCategory: "builder"
  },
  discover_china_ai: {
    auditGroup: "china_ai_sources",
    sourceName: "China AI discovery",
    sourceUrl: "https://www.qbitai.com/",
    sourceCategory: "community"
  },
  discover_content_sources: {
    auditGroup: "content_sources",
    sourceName: "Content source discovery",
    sourceUrl: "https://openai.com/news/",
    sourceCategory: "community"
  },
  discover_statuspage_incidents: {
    auditGroup: "content_sources",
    sourceName: "Statuspage incident discovery",
    sourceUrl: "https://status.openai.com/",
    sourceCategory: "official_release"
  },
  discover_search_news: {
    auditGroup: "search_sources",
    sourceName: "Search/news discovery",
    sourceUrl: "https://www.google.com/search?q=AI",
    sourceCategory: "community"
  },
  discover_wechat_platform: {
    auditGroup: "wechat_sources",
    sourceName: "WeChat platform discovery",
    sourceUrl: "https://weixin.qq.com/",
    sourceCategory: "community",
    platform: "wechat"
  },
  discover_zhihu_platform: {
    auditGroup: "zhihu_sources",
    sourceName: "Zhihu platform discovery",
    sourceUrl: "https://www.zhihu.com/",
    sourceCategory: "community",
    platform: "zhihu"
  },
  sources_health: {
    auditGroup: "sources_health",
    sourceName: "Source health check",
    sourceUrl: "https://github.com/JasonxzWen/ai-daily-cn/tree/main/config/sources",
    sourceCategory: "community"
  }
};
const SUMMARY_ONLY_DEGRADE_FALLBACK_KINDS = new Set(["summary_only_degraded_audit"]);
const PUBLIC_EDITORIAL_REPAIR_TASK_KINDS = new Set([
  "public_editorial_rewrite",
  "rewrite_autodraft_template",
  "main_item_editorial_rewrite",
  "hot_blog_editorial_rewrite",
  "builder_translation_rewrite"
]);

// Error-severity issues that must keep the hard block even if they share a path
// with an editorial task — they are not safely degradable editorial residue.
const NON_DEGRADABLE_ISSUE_CODES = new Set([
  "plain_language_stock_phrase",
  "builder_translation_missing",
  "builder_content_translation_mismatch",
  "candidate_pool_not_checked",
  "candidate_pool_reference_invalid"
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
  const firstPassAuthoringContractAuthor = typeof options.firstPassAuthoringContractAuthor === "function"
    ? options.firstPassAuthoringContractAuthor
    : null;
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
      resiliencePolicy: options.resiliencePolicy,
      retryDelayMs: options.retryDelayMs,
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
    automation_first_pass_authoring: initialFirstPassAuthoringSummary(Boolean(firstPassAuthoringContractAuthor)),
    stages: [],
    started_at: now(),
    updated_at: now(),
    final_status: "running",
    next_action: { kind: "none" }
  };

  await writeSummary(summaryPath, summary);

  const launcherResiliencePolicy = options.resiliencePolicy || await loadRunnerResiliencePolicy({ launcherRoot });
  const prepareCleanWorktree = options.prepareCleanWorktree || defaultPrepareCleanWorktree;
  const prepareArgs = {
    launcherRoot,
    reportDate,
    publish,
    allowedBranch: options.allowedBranch,
    worktreeDir: options.worktreeDir
  };
  let prepared;
  let prepareOutcome;
  try {
    prepareOutcome = await prepareCleanWorktreeWithRetry({
      prepareCleanWorktree,
      prepareArgs,
      resiliencePolicy: launcherResiliencePolicy,
      retryDelayMs: options.retryDelayMs
    });
    prepared = prepareOutcome.prepared;
    summary.clean_repo_root = path.resolve(prepared.next_cwd || prepared.clean_repo_root || prepared.repo_root || "");
    recordStage(summary, {
      id: "prepare_clean_worktree",
      status: "passed",
      output: stageAttemptOutput({
        output: {
          next_cwd: summary.clean_repo_root,
          remote_main_sha: prepared.remote_main_sha || prepared.remoteMainSha || ""
        },
        attempts: prepareOutcome.attempts,
        retryAttempts: prepareOutcome.retryAttempts
      }),
      now
    });
  } catch (error) {
    recordStage(summary, {
      id: "prepare_clean_worktree",
      status: "failed",
      output: stageAttemptOutput({
        output: extractErrorOutput(error) || {},
        attempts: error.attempts || 1,
        retryAttempts: Array.isArray(error.retryAttempts) ? error.retryAttempts : []
      }),
      error,
      now
    });
    summary.final_status = "blocked";
    summary.next_action = blockedNextAction(error);
    await writeSummary(summaryPath, summary);
    return { summary, summaryPath };
  }

  const resiliencePolicy = options.resiliencePolicy || await loadRunnerResiliencePolicy({
    cleanRoot: summary.clean_repo_root,
    launcherRoot
  });
  const context = {
    launcherRoot,
    cleanRoot: summary.clean_repo_root,
    reportDate,
    publish,
    mode,
    summaryPath,
    maxReviewRepairLoops,
    writeRetrospective: options.writeRetrospective !== false,
    resiliencePolicy,
    retryDelayMs: options.retryDelayMs,
    now
  };

  for (const plannedStage of buildInitialWorkflowStages({ reportDate })) {
    const stage = plannedStage.id === "quality_review"
      ? qualityReviewStageForReport(plannedStage, summary.current_report_path || DEFAULT_REPORT_PATH)
      : plannedStage;
    const outcome = await runAndRecordStage({ stage, context, summary, runStage, now });
    const remoteAheadAction = remoteAheadRestartNextAction({
      outcome,
      stage,
      context,
      summary,
      summaryPath,
      reportDate
    });
    if (remoteAheadAction) {
      summary.final_status = "blocked";
      summary.next_action = remoteAheadAction;
      await writeSummary(summaryPath, summary);
      return { summary, summaryPath };
    }
    if (outcome.blocked) {
      summary.final_status = "blocked";
      summary.next_action = blockedNextAction(outcome.error);
      await writeSummary(summaryPath, summary);
      return { summary, summaryPath };
    }

    if (stage.id === "report_draft" && outcome.normalized.ok) {
      await runFirstPassAuthoring({
        summary,
        context,
        runStage,
        authorContract: firstPassAuthoringContractAuthor,
        now
      });
    }

    if (stage.id === "quality_review") {
      recordFirstReviewResult(summary, outcome.normalized);
      const currentReportPath = summary.current_report_path || DEFAULT_REPORT_PATH;
      const repairDecision = classifyQualityReviewResult(outcome.normalized, {
        summary,
        reportDate,
        maxReviewRepairLoops,
        reportPath: currentReportPath
      });
      if (repairDecision?.degrade) {
        markStageDegraded(summary, stage.id, repairDecision);
        await annotateReportDegraded(absoluteCleanPath(summary.clean_repo_root, currentReportPath), repairDecision);
        await writeSummary(summaryPath, summary);
      } else if (repairDecision) {
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
    reportPath: summary.current_report_path || DEFAULT_REPORT_PATH
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
  resiliencePolicy: providedResiliencePolicy,
  retryDelayMs,
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

  const loadedResiliencePolicy = providedResiliencePolicy || await loadRunnerResiliencePolicy({
    cleanRoot: path.resolve(summary.clean_repo_root),
    launcherRoot
  });
  const context = {
    launcherRoot,
    cleanRoot: path.resolve(summary.clean_repo_root),
    reportDate,
    publish,
    mode,
    summaryPath,
    maxReviewRepairLoops: effectiveMaxReviewRepairLoops,
    writeRetrospective: true,
    resiliencePolicy: loadedResiliencePolicy,
    retryDelayMs,
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
        if (repairReviewDecision?.degrade) {
          summary.current_report_path = OPTIMIZED_REPORT_PATH;
          markStageDegraded(summary, stage.id, repairReviewDecision);
          await annotateReportDegraded(absoluteCleanPath(summary.clean_repo_root, OPTIMIZED_REPORT_PATH), repairReviewDecision);
          await writeSummary(summaryPath, summary);
        } else if (repairReviewDecision) {
          summary.final_status = repairReviewDecision.final_status;
          summary.next_action = repairReviewDecision.next_action;
          await writeSummary(summaryPath, summary);
          return { summary, summaryPath };
        } else {
          summary.final_status = "blocked";
          summary.next_action = {
            kind: "inspect_stage_failure",
            stage_id: stage.id,
            summary_path: summaryPath
          };
          await writeSummary(summaryPath, summary);
          return { summary, summaryPath };
        }
      } else {
        summary.current_report_path = OPTIMIZED_REPORT_PATH;
      }
    } else if (stage.id === "quality_review") {
      const repairDecision = classifyQualityReviewResult(outcome.normalized, {
        summary,
        reportDate,
        maxReviewRepairLoops: effectiveMaxReviewRepairLoops,
        reportPath: OPTIMIZED_REPORT_PATH
      });
      if (repairDecision?.degrade) {
        markStageDegraded(summary, stage.id, repairDecision);
        await annotateReportDegraded(absoluteCleanPath(summary.clean_repo_root, summary.current_report_path || OPTIMIZED_REPORT_PATH), repairDecision);
        await writeSummary(summaryPath, summary);
      } else if (repairDecision) {
        summary.final_status = repairDecision.final_status;
        summary.next_action = repairDecision.next_action;
        await writeSummary(summaryPath, summary);
        return { summary, summaryPath };
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
        status: finalWorkflowStatus({ publish: false, summary }),
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
    if (stage.id === "sources_phase5_audit") {
      recordSourcesPhase5Audit(summary, outcome.normalized);
    }
    const remoteAheadAction = remoteAheadRestartNextAction({
      outcome,
      stage,
      context,
      summary,
      summaryPath,
      reportDate
    });
    if (remoteAheadAction) {
      summary.final_status = "blocked";
      summary.next_action = remoteAheadAction;
      await writeSummary(summaryPath, summary);
      return { summary, summaryPath };
    }
    // Editorial weak-card page-check failures degrade instead of hard-blocking.
    // quality_page_check runs after build, so to publish WITH disclosure we
    // annotate the written report and re-render docs (deriveQualityStatus merges
    // the injected degraded_sections), then mark the run degraded — keeping the
    // run summary and the public artifact consistent. Structural page-check
    // failures still exit non-zero and hard-block below.
    if (
      stage.id === "quality_page_check" &&
      !outcome.blocked &&
      outcome.normalized.ok &&
      Array.isArray(outcome.normalized.output?.degraded_checks) &&
      outcome.normalized.output.degraded_checks.length > 0
    ) {
      const decision = {
        degraded_sections: Array.isArray(outcome.normalized.output.degraded_sections)
          ? outcome.normalized.output.degraded_sections
          : [],
        residual_editorial_tasks: 0
      };
      const [year, month] = String(reportDate).split("-");
      await annotateReportDegraded(
        absoluteCleanPath(summary.clean_repo_root, `reports-data/${year}/${month}/${reportDate}.json`),
        decision
      );
      const rerender = await runAndRecordStage({ stage: pnpmStage("build_disclosure", ["run", "build"]), context, summary, runStage, now });
      if (rerender.blocked || !rerender.normalized.ok) {
        summary.final_status = "blocked";
        summary.next_action = { kind: "inspect_stage_failure", stage_id: "build_disclosure", summary_path: summaryPath };
        await writeSummary(summaryPath, summary);
        return { summary, summaryPath };
      }
      markStageDegraded(summary, stage.id, decision);
      await writeSummary(summaryPath, summary);
      continue;
    }
    if (stage.id === "content_contract" && !outcome.blocked && !outcome.normalized.ok) {
      const repairDecision = await classifyContentContractRepairResult(outcome.normalized, {
        summary,
        reportDate,
        maxReviewRepairLoops: context.maxReviewRepairLoops,
        reportPath: reportDataPath(reportDate)
      });
      if (repairDecision?.degrade) {
        markStageDegraded(summary, stage.id, repairDecision);
        await annotateReportDegraded(absoluteCleanPath(summary.clean_repo_root, reportDataPath(reportDate)), repairDecision);
        await writeSummary(summaryPath, summary);
        continue;
      }
      if (repairDecision) {
        summary.final_status = repairDecision.final_status;
        summary.next_action = repairDecision.next_action;
        await writeSummary(summaryPath, summary);
        return { summary, summaryPath };
      }
      summary.final_status = "blocked";
      summary.next_action = {
        kind: "inspect_stage_failure",
        stage_id: stage.id,
        summary_path: summaryPath
      };
      await writeSummary(summaryPath, summary);
      return { summary, summaryPath };
    }
    if (publish && stage.id === "publish_real" && (outcome.blocked || !outcome.normalized.ok)) {
      const fallbackStage = buildPublishFallbackStage(reportDate);
      const fallbackOutcome = await runAndRecordStage({ stage: fallbackStage, context, summary, runStage, now });
      if (fallbackOutcome.blocked) {
        summary.final_status = "infrastructure_blocked_after_fallback_exhausted";
        summary.next_action = infrastructurePublishRecoveryNextAction({
          outcome: fallbackOutcome,
          stageId: fallbackStage.id,
          previousStageId: stage.id,
          summaryPath
        });
        await writePublishCorrectionForBlockedRun({
          summary,
          context,
          reportDate,
          status: summary.final_status,
          now,
          runStage
        });
        await writeSummary(summaryPath, summary);
        return { summary, summaryPath };
      }
      if (!fallbackOutcome.normalized.ok) {
        summary.final_status = "infrastructure_blocked_after_fallback_exhausted";
        summary.next_action = infrastructurePublishRecoveryNextAction({
          outcome: fallbackOutcome,
          stageId: fallbackStage.id,
          previousStageId: stage.id,
          summaryPath
        });
        await writePublishCorrectionForBlockedRun({
          summary,
          context,
          reportDate,
          status: summary.final_status,
          now,
          runStage
        });
        await writeSummary(summaryPath, summary);
        return { summary, summaryPath };
      }
      await writeSummary(summaryPath, summary);
      continue;
    }
    if (publish && stage.id === "pages_verify" && (outcome.blocked || !outcome.normalized.ok)) {
      summary.final_status = "published_pending_pages_verification";
      summary.next_action = pagesVerifyPendingNextAction({ outcome, summaryPath });
      summary.updated_at = now();
      await writeSummary(summaryPath, summary);
      return { summary, summaryPath };
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

  summary.final_status = finalWorkflowStatus({ publish, summary });
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
    status: finalWorkflowStatus({ publish: true, summary }),
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

async function writePublishCorrectionForBlockedRun({ summary, context, reportDate, status = "blocked", now, runStage }) {
  if (context.writeRetrospective === false) {
    return { blocked: false, skipped: true };
  }
  try {
    const output = await writeDailyPublishCorrectionRetrospective({
      rootDir: context.cleanRoot,
      summary,
      reportDate,
      status,
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
  const initialStages = buildInitialWorkflowStages({ reportDate });
  return [
    ...initialStages.flatMap((stage) => stage.id === "report_draft"
      ? [stage, { id: "first_pass_authoring", command: { tool: "internal", args: [] } }]
      : [stage]),
    ...buildPostQualityWorkflowStages({ reportDate, publish, reportPath: DEFAULT_REPORT_PATH })
  ];
}

function buildInitialWorkflowStages({ reportDate }) {
  const tmp = (name) => `.tmp/${name}-${reportDate}.json`;
  const discoveryInputs = [
    tmp("github-trending"),
    tmp("source-watch"),
    tmp("huggingface-trending"),
    tmp("builders"),
    tmp("china-ai"),
    tmp("content-sources"),
    tmp("statuspage-incidents"),
    tmp("search-news"),
    tmp("sources-health")
  ].join(",");
  const stages = [
    nodeCliStage("source_reset_preflight", [
      "source-reset:preflight"
    ]),
    pnpmStage("prompt_build", ["run", "prompt:build", "--", reportDate]),
    pnpmStage("sources_validate", ["run", "sources:validate"]),
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
    nodeCliStage("discover_source_watch", [
      "discover:github-watch",
      "--date",
      reportDate,
      "--config",
      "config/source-watchlist.json",
      "--output",
      tmp("source-watch")
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
    nodeCliStage("official_blog_context", [
      "official-blog:context",
      "--input",
      tmp("content-sources"),
      "--output",
      tmp("official-blog-context"),
      "--date",
      reportDate,
      "--limit",
      "8"
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
      "--allow-degraded-inputs",
      "--official-blog-context",
      tmp("official-blog-context"),
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

function initialFirstPassAuthoringSummary(enabled) {
  return {
    enabled,
    status: enabled ? "pending" : "disabled",
    attempted: 0,
    task_count: 0,
    edit_count: 0,
    applied_count: 0,
    rejected_count: 0,
    first_review_ok: null,
    exceptional_repair_task_count: 0,
    reason: enabled ? "awaiting_report_draft" : "author_contract_callback_not_configured"
  };
}

async function runFirstPassAuthoring({ summary, context, runStage, authorContract, now }) {
  if (typeof authorContract !== "function") {
    return;
  }

  const reportDate = context.reportDate;
  const sourceReportPath = absoluteCleanPath(context.cleanRoot, DEFAULT_REPORT_PATH);
  const candidatePath = absoluteCleanPath(context.cleanRoot, summary.candidate_pool_path || candidatePoolPath(reportDate));
  const planPath = absoluteCleanPath(context.cleanRoot, firstPassAuthoringPlanPath(reportDate));
  const contractPath = absoluteCleanPath(context.cleanRoot, firstPassAuthoringContractPath(reportDate));
  const firstPass = summary.automation_first_pass_authoring || initialFirstPassAuthoringSummary(true);
  summary.automation_first_pass_authoring = firstPass;

  try {
    const [report, candidatePool] = await Promise.all([
      readJsonIfExists(sourceReportPath),
      readJsonIfExists(candidatePath)
    ]);
    if (!report || typeof report !== "object") {
      throw new PublisherError("first_pass_authoring_report_missing", "First-pass authoring requires the generated report artifact.");
    }
    if (!candidatePool || typeof candidatePool !== "object") {
      throw new PublisherError("first_pass_authoring_candidate_pool_missing", "First-pass authoring requires the same-run candidate pool.");
    }

    const tasks = buildFirstPassAuthoringTasks(report);
    firstPass.task_count = tasks.length;
    firstPass.plan_path = firstPassAuthoringPlanPath(reportDate);
    firstPass.source_report_path = DEFAULT_REPORT_PATH;
    firstPass.candidate_pool_path = summary.candidate_pool_path || candidatePoolPath(reportDate);
    await fs.mkdir(path.dirname(planPath), { recursive: true });
    await fs.writeFile(planPath, `${JSON.stringify({
      schema_version: 1,
      report_date: reportDate,
      phase: FIRST_PASS_AUTHORING_PHASE,
      intent: FIRST_PASS_AUTHORING_INTENT,
      authoring_contract: FIRST_PASS_AUTHORING_CONTRACT,
      tasks
    }, null, 2)}\n`, "utf8");
    if (tasks.length === 0) {
      firstPass.status = "not_needed";
      firstPass.reason = "no_reader_facing_authoring_paths";
      recordStage(summary, {
        id: "first_pass_authoring",
        status: "passed",
        output: { attempts: 0, task_count: 0, plan_path: firstPass.plan_path, reason: firstPass.reason },
        now
      });
      return;
    }

    firstPass.attempted = 1;
    firstPass.status = "authoring";
    firstPass.reason = "author_contract_requested";
    const contract = await authorContract({
      reportDate,
      sourceReportPath,
      candidatePoolPath: candidatePath,
      authoringPlanPath: planPath,
      editorialAuthorityPath: absoluteCleanPath(context.cleanRoot, "prompts/ai-daily/modules/editorial-authority.md"),
      tasks
    });
    const validation = validateFirstPassAuthoringContract(contract, { reportDate, tasks });
    if (!validation.ok) {
      throw new PublisherError("first_pass_authoring_contract_invalid", validation.failures.join("; "));
    }
    firstPass.edit_count = contract.edits.length;
    await fs.writeFile(contractPath, `${JSON.stringify(contract, null, 2)}\n`, "utf8");

    const applyStage = buildFirstPassAuthoringApplyStage({
      reportDate,
      sourceReportPath: DEFAULT_REPORT_PATH,
      outputReportPath: AUTHORED_REPORT_PATH,
      contractPath: firstPassAuthoringContractPath(reportDate),
      candidatePoolPath: summary.candidate_pool_path || candidatePoolPath(reportDate)
    });
    let normalized;
    try {
      normalized = normalizeStageResult(await runStage(applyStage, context));
    } catch (error) {
      recordStage(summary, {
        id: applyStage.id,
        status: "degraded",
        command: applyStage.command,
        error,
        output: { attempts: 1, fallback_used: true, fallback_report_path: DEFAULT_REPORT_PATH },
        now
      });
      throw error;
    }
    const appliedPaths = new Set((Array.isArray(normalized.output?.contract_applied)
      ? normalized.output.contract_applied
      : []).map((entry) => String(entry?.path || "").trim()).filter(Boolean));
    const rejected = Array.isArray(normalized.output?.contract_rejected) ? normalized.output.contract_rejected : [];
    firstPass.applied_count = appliedPaths.size;
    firstPass.rejected_count = rejected.length;
    const expectedPaths = new Set(tasks.map((task) => task.path));
    const fullyApplied = rejected.length === 0 && appliedPaths.size === expectedPaths.size
      && [...expectedPaths].every((taskPath) => appliedPaths.has(taskPath));
    if (!fullyApplied) {
      recordStage(summary, {
        id: applyStage.id,
        status: "degraded",
        command: applyStage.command,
        output: {
          ...normalized.output,
          attempts: 1,
          fallback_used: true,
          fallback_report_path: DEFAULT_REPORT_PATH,
          reason: "first_pass_contract_not_fully_applied"
        },
        now
      });
      firstPass.status = "fallback";
      firstPass.reason = "first_pass_contract_not_fully_applied";
      return;
    }

    recordStage(summary, {
      id: applyStage.id,
      status: "passed",
      command: applyStage.command,
      output: {
        ...normalized.output,
        attempts: 1,
        authoring_complete: true,
        residual_review_ok: normalized.output?.review?.ok === true
      },
      now
    });
    summary.current_report_path = AUTHORED_REPORT_PATH;
    firstPass.status = "completed";
    firstPass.reason = "all_declared_paths_applied";
    firstPass.authored_report_path = AUTHORED_REPORT_PATH;
  } catch (error) {
    if (!summary.stages.some((stage) => stage.id === "first_pass_authoring" && stage.status === "degraded")) {
      recordStage(summary, {
        id: "first_pass_authoring",
        status: "degraded",
        output: {
          fallback_used: true,
          attempts: firstPass.attempted,
          fallback_report_path: DEFAULT_REPORT_PATH,
          error_code: error?.code || "first_pass_authoring_failed",
          reason: error?.message || "first-pass authoring failed"
        },
        now
      });
    }
    firstPass.status = "fallback";
    firstPass.reason = error?.code || "first_pass_authoring_failed";
    firstPass.error = error?.message || String(error || "first-pass authoring failed");
    summary.current_report_path = DEFAULT_REPORT_PATH;
  }
}

function buildFirstPassAuthoringApplyStage({ reportDate, sourceReportPath, outputReportPath, contractPath, candidatePoolPath }) {
  return nodeCliStage("first_pass_authoring", [
    "quality:repair",
    sourceReportPath,
    outputReportPath,
    firstPassAuthoringResultPath(reportDate),
    contractPath,
    candidatePoolPath
  ]);
}

function qualityReviewStageForReport(stage, reportPath) {
  const args = [...(stage?.command?.args || [])];
  if (args.length > 2) args[2] = reportPath;
  return {
    ...stage,
    command: {
      ...stage.command,
      args
    }
  };
}

function recordFirstReviewResult(summary, stageResult) {
  const firstPass = summary.automation_first_pass_authoring;
  if (!firstPass || firstPass.status === "disabled") return;
  const review = stageResult.output?.review || stageResult.output || {};
  const reviewOk = stageResult.ok && (review.ok === true || stageResult.output?.ok === true || !Object.prototype.hasOwnProperty.call(review, "ok"));
  firstPass.first_review_ok = Boolean(reviewOk);
  const tasks = annotateAuthoringTasks(Array.isArray(review.ai_review_tasks) ? review.ai_review_tasks : []);
  firstPass.exceptional_repair_task_count = retryablePublicEditorialTasks(review, tasks).length;
}

function recordSourcesPhase5Audit(summary, stageResult) {
  const output = stageResult?.output || {};
  const logicalSourceEvidence = output.logical_source_evidence;
  if (!logicalSourceEvidence || typeof logicalSourceEvidence !== "object" || Array.isArray(logicalSourceEvidence)) {
    return;
  }
  summary.sources_phase5_audit = {
    phase5_complete: output.phase5_complete === true,
    report_date: String(output.report_date || ""),
    target_days: Number(output.target_days || 0),
    logical_source_evidence: logicalSourceEvidence
  };
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
    pnpmStage("build", ["run", "build", "--", "--source-watch-report-date", reportDate]),
    pnpmStage("quality_page_check", [
      "run",
      "quality:page-check",
      "--",
      reportDate,
      "docs",
      tmp("page-check")
    ]),
    nodeStage("content_contract", [
      "scripts/check-daily-content-contract.mjs",
      "--report",
      reportDataPath(reportDate),
      "--html",
      reportHtmlPath(reportDate),
      "--json"
    ], { parse_json_failure: true }),
    pnpmStage("validate", ["run", "validate"]),
    nodeCliStage("sources_phase5_audit", [
      "sources:phase5-audit",
      "--date",
      reportDate,
      "--history-dir",
      "reports-data",
      "--days",
      "3",
      "--logical-source",
      "aify-news",
      "--output",
      tmp("sources-phase5-audit")
    ]),
    pnpmStage("publish_dry_run_daily", ["run", "publish:dry-run:daily", "--", "--date", reportDate])
  ];
  if (publish) {
    stages.push(pnpmStage("publish_real", [
      "run",
      "publish",
      "--",
      "--confirm-push",
      "--date",
      reportDate,
      "--skip-pages-verify"
    ]));
    stages.push(buildPagesVerifyStage(reportDate));
  }
  return stages;
}

function buildPublishFallbackStage(reportDate) {
  return pnpmStage("publish_github_api_fallback", [
    "run",
    "publish:github-api",
    "--",
    "--confirm-push",
    "--date",
    reportDate,
    "--skip-pages-verify"
  ]);
}

function buildPagesVerifyStage(reportDate) {
  return nodeCliStage("pages_verify", [
    "publish:verify-pages",
    "--date",
    reportDate,
    "--attempts",
    "1",
    "--interval-ms",
    "0"
  ]);
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

async function loadRunnerResiliencePolicy({ cleanRoot, launcherRoot } = {}) {
  const candidateRoots = uniqueExistingStrings([cleanRoot, launcherRoot, process.cwd()]);
  for (const root of candidateRoots) {
    try {
      const policyPath = path.join(root, RESILIENCE_POLICY_PATH);
      const policy = JSON.parse(await fs.readFile(policyPath, "utf8"));
      return normalizeRunnerResiliencePolicy(policy, policyPath);
    } catch (error) {
      if (error.code === "ENOENT") continue;
      return {
        policy_path: path.join(root, RESILIENCE_POLICY_PATH),
        stage_policies: new Map(),
        error: error.message
      };
    }
  }
  return {
    policy_path: "",
    stage_policies: new Map(),
    error: "daily_resilience_policy_not_found"
  };
}

function normalizeRunnerResiliencePolicy(policy, policyPath = "") {
  const stagePolicies = new Map();
  if (Array.isArray(policy?.stages)) {
    for (const stage of policy.stages) {
      if (stage?.id) stagePolicies.set(stage.id, stage);
    }
  }
  return {
    policy_path: policyPath,
    stage_policies: stagePolicies
  };
}

async function prepareCleanWorktreeWithRetry({
  prepareCleanWorktree,
  prepareArgs,
  resiliencePolicy,
  retryDelayMs
}) {
  const retryPolicy = getStageRetryPolicy(resiliencePolicy, "prepare_clean_worktree");
  const maxAttempts = retryMaxAttempts(retryPolicy);
  const retryAttempts = [];
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const prepared = await prepareCleanWorktree(prepareArgs);
      const normalized = normalizeStageResult({
        ok: prepared?.ok !== false,
        output: prepared || {}
      });
      retryAttempts.push(summarizeRetryAttempt({ attempt, normalized }));
      if (normalized.ok) {
        return {
          prepared,
          attempts: retryAttempts.length,
          retryAttempts
        };
      }
      lastError = new PublisherError(
        "prepare_clean_worktree_failed",
        normalized.output?.error || normalized.output?.message || "prepare_clean_worktree returned ok:false."
      );
      if (attempt >= maxAttempts || !shouldRetryStageFailure({ retryPolicy, normalized, error: lastError })) break;
    } catch (error) {
      lastError = error;
      retryAttempts.push(summarizeRetryAttempt({ attempt, error }));
      if (attempt >= maxAttempts || !shouldRetryStageFailure({ retryPolicy, error })) break;
    }
    await waitForRetryAttempt({
      context: { retryDelayMs },
      retryPolicy,
      attempt
    });
  }

  lastError.attempts = retryAttempts.length;
  lastError.retryAttempts = retryAttempts;
  throw lastError;
}

async function runAndRecordStage({ stage, context, summary, runStage, now }) {
  const retryPolicy = getStageRetryPolicy(context.resiliencePolicy, stage.id);
  const maxAttempts = retryMaxAttempts(retryPolicy);
  const retryAttempts = [];
  let lastError = null;
  let normalized = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const stageResult = await runStage(stage, context);
      normalized = normalizeStageResult(stageResult);
      retryAttempts.push(summarizeRetryAttempt({ attempt, normalized }));
      if (
        normalized.ok ||
        attempt >= maxAttempts ||
        !shouldRetryStageFailure({ retryPolicy, normalized })
      ) {
        break;
      }
    } catch (error) {
      lastError = error;
      normalized = null;
      retryAttempts.push(summarizeRetryAttempt({ attempt, error }));
      if (attempt >= maxAttempts || !shouldRetryStageFailure({ retryPolicy, error })) break;
    }
    await waitForRetryAttempt({ context, retryPolicy, attempt });
  }

  if (lastError && !normalized) {
    const fallback = await applyDegradedStageFallback({
      stage,
      context,
      stagePolicy: retryPolicy,
      error: lastError,
      retryAttempts
    });
    if (fallback) {
      const output = stageAttemptOutput({
        output: fallback.output,
        attempts: retryAttempts.length,
        retryAttempts
      });
      recordStage(summary, {
        id: stage.id,
        status: "degraded",
        command: stage.command,
        output,
        now
      });
      return {
        blocked: false,
        degraded: true,
        normalized: {
          ok: true,
          output
        }
      };
    }
    recordStage(summary, {
      id: stage.id,
      status: "failed",
      command: stage.command,
      output: stageAttemptOutput({
        output: extractErrorOutput(lastError) || {},
        attempts: retryAttempts.length,
        retryAttempts
      }),
      error: lastError,
      now
    });
    return { blocked: true, error: lastError };
  }

  if (!normalized.ok) {
    const fallback = await applyDegradedStageFallback({
      stage,
      context,
      stagePolicy: retryPolicy,
      normalized,
      retryAttempts
    });
    if (fallback) {
      const output = stageAttemptOutput({
        output: fallback.output,
        attempts: retryAttempts.length,
        retryAttempts
      });
      recordStage(summary, {
        id: stage.id,
        status: "degraded",
        command: stage.command,
        output,
        now
      });
      return {
        blocked: false,
        degraded: true,
        normalized: {
          ok: true,
          output
        }
      };
    }
  }

  const output = stageAttemptOutput({
    output: normalized.output,
    attempts: retryAttempts.length,
    retryAttempts
  });
  recordStage(summary, {
    id: stage.id,
    status: normalized.ok ? "passed" : "failed",
    command: stage.command,
    output,
    now
  });
  return {
    blocked: false,
    normalized: {
      ...normalized,
      output
    }
  };
}

function getStageRetryPolicy(resiliencePolicy, stageId) {
  if (!resiliencePolicy || !stageId) return null;
  if (resiliencePolicy.stage_policies instanceof Map) {
    return resiliencePolicy.stage_policies.get(stageId) || null;
  }
  if (resiliencePolicy.stagePolicies instanceof Map) {
    return resiliencePolicy.stagePolicies.get(stageId) || null;
  }
  if (Array.isArray(resiliencePolicy.stages)) {
    return resiliencePolicy.stages.find((stage) => stage?.id === stageId) || null;
  }
  return null;
}

function retryMaxAttempts(stagePolicy) {
  const attempts = Number(stagePolicy?.retry?.max_attempts || 1);
  if (!Number.isFinite(attempts) || attempts < 1) return 1;
  return Math.floor(attempts);
}

function shouldRetryStageFailure({ retryPolicy, normalized, error }) {
  const retrySignals = Array.isArray(retryPolicy?.retry?.on) ? retryPolicy.retry.on : [];
  if (retrySignals.length === 0) return true;
  const signalText = retrySignalText({ normalized, error });
  if (!signalText) return true;
  return retrySignals.some((signal) => retrySignalMatches(signal, signalText));
}

function retrySignalText({ normalized, error }) {
  const output = normalized?.output && typeof normalized.output === "object" ? normalized.output : {};
  const publishStatus = output.publish_status && typeof output.publish_status === "object" ? output.publish_status : {};
  const parts = [
    error?.code,
    error?.message,
    error?.stdout,
    error?.stderr,
    output.error_code,
    output.code,
    output.error,
    output.message,
    output.stdout,
    output.stderr,
    publishStatus.publish_error,
    publishStatus.error_code
  ];
  return parts
    .filter((part) => part !== undefined && part !== null && String(part).trim().length > 0)
    .map((part) => String(part).toLowerCase())
    .join(" ");
}

function retrySignalMatches(signal, signalText) {
  const normalizedSignal = String(signal || "").toLowerCase();
  const candidates = [
    normalizedSignal,
    normalizedSignal.replace(/_/g, " "),
    ...retrySignalAliases(normalizedSignal)
  ];
  return candidates.some((candidate) => candidate && signalText.includes(candidate));
}

function retrySignalAliases(signal) {
  const aliases = {
    api_timeout: ["api timeout", "timeout", "timedout", "etimedout"],
    feed_parse_error: ["feed parse", "parse error"],
    git_fetch_timeout: ["git fetch timeout", "fetch timeout", "timedout", "etimedout"],
    git_push_timeout: ["git push timeout", "push timeout", "timedout", "etimedout"],
    network_error: [
      "network error",
      "econnreset",
      "econnrefused",
      "enotfound",
      "eai_again",
      "etimedout",
      "fetch failed",
      "socket hang up"
    ],
    provider_timeout: ["provider timeout", "timeout", "timedout", "etimedout"],
    pages_cache_delay: ["pages cache delay", "pages_verification_failed", "http 404", "http 403"],
    rate_limit: ["rate limit", "rate-limited", "too many requests", " 429 "],
    timeout: ["timeout", "timedout", "etimedout"]
  };
  return aliases[signal] || [];
}

async function waitForRetryAttempt({ context, retryPolicy, attempt }) {
  const overrideDelay = Number(context.retryDelayMs);
  const delayMs = Number.isFinite(overrideDelay)
    ? overrideDelay
    : retryBackoffMs(retryPolicy, attempt);
  if (delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

function retryBackoffMs(retryPolicy, attempt) {
  const values = Array.isArray(retryPolicy?.retry?.backoff_ms) ? retryPolicy.retry.backoff_ms : [];
  const raw = values[Math.min(attempt, Math.max(0, values.length - 1))] || 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

async function applyDegradedStageFallback({ stage, context, stagePolicy, normalized, error, retryAttempts }) {
  if (stagePolicy?.degrade?.allowed !== true) {
    return null;
  }
  if (stageFailureMatchesBlockReason({ stagePolicy, normalized, error })) {
    return null;
  }
  const fallbackSpec = DISCOVERY_DEGRADE_FALLBACKS[stage.id];
  const outputPath = outputArgValue(stage);
  if (fallbackSpec) {
    if (!outputPath) {
      return null;
    }
    return await writeDegradedDiscoveryArtifact({
      stage,
      context,
      fallbackSpec,
      outputPath,
      normalized,
      error,
      retryAttempts
    });
  }
  const fallbackKind = String(stagePolicy?.fallback?.kind || "").trim();
  if (SUMMARY_ONLY_DEGRADE_FALLBACK_KINDS.has(fallbackKind)) {
    if (!outputPath) {
      return null;
    }
    return await writeSummaryOnlyDegradedArtifact({
      stage,
      context,
      fallbackKind,
      outputPath,
      normalized,
      error,
      retryAttempts
    });
  }
  return null;
}

function stageFailureMatchesBlockReason({ stagePolicy, normalized, error }) {
  const blockReasons = Array.isArray(stagePolicy?.block?.reasons) ? stagePolicy.block.reasons : [];
  if (blockReasons.length === 0) {
    return false;
  }
  const signalText = retrySignalText({ normalized, error });
  if (!signalText) {
    return false;
  }
  return blockReasons.some((reason) => retrySignalMatches(reason, signalText));
}

async function writeDegradedDiscoveryArtifact({
  stage,
  context,
  fallbackSpec,
  outputPath,
  normalized,
  error,
  retryAttempts
}) {
  const generatedAt = typeof context.now === "function" ? context.now() : new Date().toISOString();
  const errorCode = degradedFallbackErrorCode({ normalized, error });
  const reason = degradedFallbackReason({ normalized, error });
  const fallbackGroups = Array.isArray(fallbackSpec.groups) && fallbackSpec.groups.length > 0
    ? fallbackSpec.groups
    : [fallbackSpec];
  const fallbackKind = fallbackSpec.fallbackKind || "degraded_discovery_artifact";
  const sourceAudit = {};
  const sources = [];
  const degradationEvents = [];
  for (const group of fallbackGroups) {
    const sourceId = `${group.platform || group.auditGroup}-${slugStageId(group.sourceName) || "source"}`;
    const sourceUrl = requireFallbackSourceUrl(group);
    const auditSource = {
      name: group.sourceName,
      url: sourceUrl,
      status: "blocked",
      notes: reason
    };
    if (group.platform) {
      auditSource.platform = group.platform;
    }
    sourceAudit[group.auditGroup] = {
      checked: true,
      sources: [auditSource],
      candidates_found: 0,
      included: 0,
      blocked_reason: errorCode,
      notes: `Degraded fallback generated after ${stage.id} failed: ${reason}`
    };
    sources.push({
      id: sourceId,
      name: group.sourceName,
      url: sourceUrl,
      category: group.sourceCategory || "community",
      status: "blocked",
      checked_at: generatedAt,
      notes: reason,
      ...(group.platform ? { platform: group.platform } : {})
    });
    const degradationEvent = createPublicDegradationEvent({
      audit_group: group.auditGroup,
      source: {
        name: group.sourceName,
        url: sourceUrl
      }
    });
    if (degradationEvent) {
      degradationEvents.push(degradationEvent);
    }
  }
  const payload = {
    ok: true,
    degraded: true,
    fallback_used: true,
    fallback_kind: fallbackKind,
    report_date: context.reportDate,
    generated_at: generatedAt,
    source_audit: sourceAudit,
    sources,
    degradation_events: degradationEvents,
    candidates: []
  };
  const resolvedOutputPath = absoluteCleanPath(context.cleanRoot, outputPath);
  await fs.mkdir(path.dirname(resolvedOutputPath), { recursive: true });
  await fs.writeFile(resolvedOutputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return {
    output: {
      ok: true,
      degraded: true,
      fallback_used: true,
      fallback_kind: fallbackKind,
      fallback_path: stagePath(outputPath, context.cleanRoot),
      ...(fallbackGroups.length === 1
        ? { source_audit_group: fallbackGroups[0].auditGroup }
        : { source_audit_groups: fallbackGroups.map((group) => group.auditGroup) }),
      candidate_count: 0,
      error_code: errorCode,
      degraded_reason: reason,
      retry_attempts_exhausted: retryAttempts.length,
      degradation_events: degradationEvents
    }
  };
}

async function writeSummaryOnlyDegradedArtifact({
  stage,
  context,
  fallbackKind,
  outputPath,
  normalized,
  error,
  retryAttempts
}) {
  const generatedAt = typeof context.now === "function" ? context.now() : new Date().toISOString();
  const errorCode = degradedFallbackErrorCode({ normalized, error });
  const reason = degradedFallbackReason({ normalized, error });
  const degradationEvent = createPublicDegradationEvent({
    code: errorCode,
    error_code: errorCode,
    section: stage.id,
    severity: "degraded",
    message: reason,
    remediation: "Review the degraded audit stage output before relying on this lane for public coverage."
  });
  const payload = {
    ok: true,
    degraded: true,
    fallback_used: true,
    fallback_kind: fallbackKind,
    stage_id: stage.id,
    report_date: context.reportDate,
    generated_at: generatedAt,
    error_code: errorCode,
    degraded_reason: reason,
    retry_attempts_exhausted: retryAttempts.length,
    degradation_events: degradationEvent ? [degradationEvent] : [],
    audit_status: {
      status: "degraded",
      stage_id: stage.id,
      error_code: errorCode,
      notes: reason
    }
  };
  const resolvedOutputPath = absoluteCleanPath(context.cleanRoot, outputPath);
  await fs.mkdir(path.dirname(resolvedOutputPath), { recursive: true });
  await fs.writeFile(resolvedOutputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return {
    output: {
      ok: true,
      degraded: true,
      fallback_used: true,
      fallback_kind: fallbackKind,
      fallback_path: stagePath(outputPath, context.cleanRoot),
      audit_path: stagePath(outputPath, context.cleanRoot),
      error_code: errorCode,
      degraded_reason: reason,
      retry_attempts_exhausted: retryAttempts.length,
      degradation_events: degradationEvent ? [degradationEvent] : []
    }
  };
}

function requireFallbackSourceUrl(fallbackSpec) {
  const sourceUrl = String(fallbackSpec?.sourceUrl || "").trim();
  if (!/^https?:\/\//i.test(sourceUrl)) {
    throw new PublisherError(
      "degraded_discovery_fallback_missing_source_url",
      `Degraded discovery fallback for ${fallbackSpec?.sourceName || "source"} must declare a public sourceUrl.`
    );
  }
  return sourceUrl;
}

function outputArgValue(stage) {
  const args = Array.isArray(stage?.command?.args) ? stage.command.args : [];
  const index = args.indexOf("--output");
  if (index < 0 || index >= args.length - 1) {
    return "";
  }
  return String(args[index + 1] || "").trim();
}

function degradedFallbackErrorCode({ normalized, error }) {
  const output = normalized?.output && typeof normalized.output === "object" ? normalized.output : {};
  return String(error?.code || output.error_code || output.code || "source_discovery_failed").trim() || "source_discovery_failed";
}

function degradedFallbackReason({ normalized, error }) {
  const output = normalized?.output && typeof normalized.output === "object" ? normalized.output : {};
  const publishStatus = output.publish_status && typeof output.publish_status === "object" ? output.publish_status : {};
  return trimOutput(
    error?.message ||
    output.error ||
    output.message ||
    publishStatus.publish_error ||
    degradedFallbackErrorCode({ normalized, error })
  );
}

function slugStageId(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function summarizeRetryAttempt({ attempt, normalized, error }) {
  const output = normalized?.output && typeof normalized.output === "object" ? normalized.output : {};
  const summary = {
    attempt,
    ok: Boolean(normalized?.ok) && !error
  };
  const errorCode = error?.code || output.error_code || output.code || "";
  const message =
    error?.message ||
    output.error ||
    output.message ||
    output.publish_status?.publish_error ||
    "";
  if (errorCode) summary.error_code = String(errorCode);
  if (message) summary.error = trimOutput(message);
  return summary;
}

function stageAttemptOutput({ output, attempts, retryAttempts }) {
  const retryHistory = retryAttempts.length > 1 || retryAttempts.some((attempt) => !attempt.ok);
  const retryFields = {
    attempts,
    ...(retryHistory ? { retry_attempts: retryAttempts } : {})
  };
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return {
      result: output,
      ...retryFields
    };
  }
  return {
    ...output,
    ...retryFields
  };
}

async function defaultRunStage(stage, context) {
  const command = resolveStageCommand(stage);
  try {
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
  } catch (error) {
    if (stage.parse_json_failure) {
      const parsed = parseJsonOutput(error.stdout);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return {
          ok: false,
          output: {
            ...parsed,
            ...(error.stderr ? { stderr: trimOutput(error.stderr) } : {})
          }
        };
      }
    }
    throw error;
  }
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
  const aiTasks = annotateAuthoringTasks(Array.isArray(review?.ai_review_tasks)
    ? review.ai_review_tasks
    : Array.isArray(stageResult.output?.ai_review_tasks)
      ? stageResult.output.ai_review_tasks
      : []);
  const retryTasks = retryablePublicEditorialTasks(review, aiTasks);
  if (retryTasks.length > 0 && reviewRepairAttempt <= maxReviewRepairLoops) {
    const contractPath = aiRepairContractPath(summary.launcher_root, reportDate, reviewRepairAttempt);
    const authoringHandoff = authoringHandoffMetadata(retryTasks);
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
        ...authoringHandoff,
        ai_review_tasks: retryTasks,
        required_contract_status: "ready",
        required_contract_fields: ["schema_version", "report_date", "status", "edits"],
        message: authoringHandoff.handoff_phase
          ? "Author the public prose fields from source evidence, write the compatible AI repair contract with status:\"ready\" and non-empty edits, then resume daily:run."
          : "Write the AI repair contract with status:\"ready\" and non-empty edits before resuming daily:run."
      }
    };
  }

  const exhaustedDegradation = residualEditorialDegradation(review);
  if (exhaustedDegradation) {
    return {
      degrade: true,
      degraded_sections: exhaustedDegradation.degraded_sections,
      residual_editorial_tasks: exhaustedDegradation.residual_editorial_tasks,
      max_review_repair_loops: maxReviewRepairLoops
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
  const aiTasks = annotateAuthoringTasks(Array.isArray(review?.ai_review_tasks) ? review.ai_review_tasks : []);
  const retryTasks = retryablePublicEditorialTasks(review, aiTasks);
  if (!review || review.ok === true || retryTasks.length === 0) {
    return null;
  }

  const nextAttempt = await nextAiRepairAttempt({
    launcherRoot: summary.launcher_root,
    reportDate,
    startAttempt: Number(summary.review_repair_attempts || 0) + 1,
    maxReviewRepairLoops
  });
  if (!nextAttempt) {
    const degradation = residualEditorialDegradation(review);
    if (degradation) {
      return {
        degrade: true,
        degraded_sections: degradation.degraded_sections,
        residual_editorial_tasks: degradation.residual_editorial_tasks,
        max_review_repair_loops: maxReviewRepairLoops
      };
    }
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
    aiTasks: retryTasks
  });

  const authoringHandoff = authoringHandoffMetadata(retryTasks);
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
      ...authoringHandoff,
      ai_review_tasks: retryTasks,
      contract_status: "template",
      required_contract_status: "ready",
      required_contract_fields: ["schema_version", "report_date", "status", "edits"],
      message: authoringHandoff.handoff_phase
        ? "Author the public prose fields from source evidence, fill this compatible AI repair template with edits, set status:\"ready\", and resume daily:run."
        : "Fill this template with public-text edits, set status:\"ready\", and resume daily:run."
    }
  };
}

async function classifyContentContractRepairResult(stageResult, {
  summary,
  reportDate,
  maxReviewRepairLoops,
  reportPath
}) {
  const output = stageResult.output || {};
  const contractIssues = collectContentContractIssues(output);
  if (stageResult.ok || output.ok === true || contractIssues.length === 0) {
    return null;
  }

  const absoluteReportPath = absoluteCleanPath(summary.clean_repo_root, reportPath);
  const report = await readJsonIfExists(absoluteReportPath);
  if (!report || typeof report !== "object") {
    return null;
  }

  const candidatePool = await readJsonIfExists(
    absoluteCleanPath(summary.clean_repo_root, summary.candidate_pool_path || candidatePoolPath(reportDate))
  );
  const qualityReview = reviewReportQuality(report, {
    ...(candidatePool ? { candidatePool } : {})
  });
  const matchingTasks = annotateAuthoringTasks(
    (Array.isArray(qualityReview.ai_review_tasks) ? qualityReview.ai_review_tasks : [])
      .filter((task) => contentContractIssueMatchesTask(contractIssues, task))
  );
  if (matchingTasks.length === 0) {
    return null;
  }

  const matchingIssues = (Array.isArray(qualityReview.issues) ? qualityReview.issues : [])
    .filter((issue) => contentContractIssueMatchesPath(contractIssues, issue?.path));
  const review = {
    ...qualityReview,
    ok: false,
    status: "content_contract_failed",
    report_date: reportDate,
    issues: matchingIssues.length > 0
      ? matchingIssues
      : contractIssues.map(contentContractIssueToQualityIssue),
    ai_review_tasks: matchingTasks,
    safe_repair_available: true,
    content_contract: {
      issues: contractIssues,
      summary: output.summary || {}
    }
  };

  summary.current_report_path = reportPath;
  return classifyQualityReviewResult({ ok: false, output: { review } }, {
    summary,
    reportDate,
    maxReviewRepairLoops,
    reportPath
  });
}

function collectContentContractIssues(output) {
  const issues = [];
  if (Array.isArray(output?.issues)) {
    issues.push(...output.issues);
  }
  if (Array.isArray(output?.reports)) {
    for (const report of output.reports) {
      if (Array.isArray(report?.issues)) {
        issues.push(...report.issues);
      }
    }
  }
  return issues.filter((issue) => issue && typeof issue === "object");
}

function contentContractIssueMatchesTask(issues, task) {
  if (!task?.path) return false;
  return issues.some((issue) => contentContractIssueMatchesPath([issue], task.path, task));
}

function contentContractIssueMatchesPath(issues, pathName, task = null) {
  const text = String(pathName || "");
  if (!text) return false;
  return issues.some((issue) => {
    const explicitPaths = contentContractIssuePaths(issue);
    if (explicitPaths.has(text)) return true;
    const sections = contentContractIssueSections(issue);
    if ([...sections].some((section) => sectionPathMatches(section, text))) return true;
    if (sections.has("public_copy") && isPublicEditorialRepairTask(task)) return true;
    return false;
  });
}

function contentContractIssuePaths(issue) {
  const paths = new Set();
  if (issue?.path) paths.add(String(issue.path));
  if (Array.isArray(issue?.examples)) {
    for (const example of issue.examples) {
      if (example && typeof example === "object" && example.path) {
        paths.add(String(example.path));
      }
    }
  }
  return paths;
}

function contentContractIssueSections(issue) {
  const sections = new Set();
  const section = String(issue?.section || "");
  if (section) sections.add(section);
  const code = String(issue?.code || "");
  if (/main_news|main_item/i.test(code)) sections.add("main_items");
  if (/hot_blog/i.test(code)) sections.add("hot_blogs");
  if (/public_copy/i.test(code)) sections.add("public_copy");
  return sections;
}

function sectionPathMatches(section, pathName) {
  if (!section || section === "public_copy") return false;
  return pathName === section || pathName.startsWith(`${section}.`) || pathName.startsWith(`${section}[`);
}

function contentContractIssueToQualityIssue(issue) {
  const explicitPath = [...contentContractIssuePaths(issue)][0] || String(issue?.section || "content_contract");
  return {
    code: String(issue?.code || "content_contract_failed"),
    severity: "error",
    path: explicitPath,
    message: String(issue?.message || "Daily content contract failed."),
    repairable: true
  };
}

function isPublicEditorialRepairTask(task) {
  return task && PUBLIC_EDITORIAL_REPAIR_TASK_KINDS.has(String(task.kind || ""));
}

function retryablePublicEditorialTasks(review, tasks) {
  const editorialTasks = tasks.filter(isPublicEditorialRepairTask);
  if (editorialTasks.length === 0) return [];

  const blockingIssues = (Array.isArray(review?.issues) ? review.issues : [])
    .filter((issue) => String(issue?.severity || "") === "error");
  if (blockingIssues.length === 0) return editorialTasks;

  const taskPaths = new Set(editorialTasks.map((task) => String(task?.path || "")).filter(Boolean));
  const issuePaths = blockingIssues.map((issue) => String(issue?.path || ""));
  if (issuePaths.some((issuePath) => !issuePath || !taskPaths.has(issuePath))) {
    return [];
  }
  const blockingPaths = new Set(issuePaths);
  return editorialTasks.filter((task) => blockingPaths.has(String(task?.path || "")));
}

// Phase 3 degrade-not-block: when the review/repair loop is exhausted and EVERY
// remaining issue is a low-risk public-editorial rewrite (not a fact/link/source
// or structural failure), publishing degraded with disclosure beats blocking the
// whole daily. Returns the degraded sections, or null when any residual issue is
// not safely degradable (then the caller keeps the hard block).
function residualEditorialDegradation(review) {
  const tasks = annotateAuthoringTasks(Array.isArray(review?.ai_review_tasks) ? review.ai_review_tasks : []);
  const coveredEditorialTasks = retryablePublicEditorialTasks(review, tasks);
  if (coveredEditorialTasks.length === 0) {
    return null;
  }
  // Every blocking (error-severity) issue must be COVERED by one of those
  // editorial tasks (same path) and not a known hard-fail code. Coverage — not
  // the issue's own `repairable` flag — is the low-risk signal: hot-blog/main-
  // item editorial residue legitimately carries repairable:false issues paired
  // with editorial rewrite tasks, while non-editorial blockers
  // (plain_language_stock_phrase, candidate_pool_*, missing/mismatched builder
  // translation) keep the hard block.
  const editorialPaths = new Set(coveredEditorialTasks.map((task) => String(task?.path || "")));
  const blockingIssues = (Array.isArray(review?.issues) ? review.issues : []).filter(
    (issue) => String(issue?.severity) === "error"
  );
  const allBlockingEditorial = blockingIssues.every(
    (issue) =>
      !NON_DEGRADABLE_ISSUE_CODES.has(String(issue?.code || "")) &&
      editorialPaths.has(String(issue?.path || ""))
  );
  if (!allBlockingEditorial) {
    return null;
  }
  const sections = [...new Set(coveredEditorialTasks.map((task) => editorialSectionFromPath(task?.path)).filter(Boolean))];
  return { degraded_sections: sections, residual_editorial_tasks: coveredEditorialTasks.length };
}

function editorialSectionFromPath(pathName) {
  const text = String(pathName || "");
  const match = /^([A-Za-z_]+)/.exec(text);
  return match ? match[1] : null;
}

function markStageDegraded(summary, stageId, decision) {
  const stages = Array.isArray(summary?.stages) ? summary.stages : [];
  for (let index = stages.length - 1; index >= 0; index -= 1) {
    if (stages[index]?.id === stageId) {
      stages[index].status = "degraded";
      const output = stages[index].output && typeof stages[index].output === "object" ? stages[index].output : {};
      output.degraded = true;
      output.quality_status = { status: "degraded", degraded_sections: decision?.degraded_sections || [] };
      output.residual_editorial_tasks = decision?.residual_editorial_tasks || 0;
      stages[index].output = output;
      return true;
    }
  }
  return false;
}

// Persist the editorial degradation into the report file that report:write will
// consume, so the public page carries a "发布质量说明" rather than only the run
// summary. deriveQualityStatus merges explicit.degraded_sections, so these
// survive the recompute. Tolerant: if the report file is absent (e.g. unit
// harness), the summary-level degrade still stands.
async function annotateReportDegraded(reportAbsPath, decision) {
  if (!reportAbsPath) {
    return;
  }
  let report;
  try {
    report = JSON.parse(await fs.readFile(reportAbsPath, "utf8"));
  } catch {
    return;
  }
  const sections = Array.isArray(decision?.degraded_sections) ? decision.degraded_sections : [];
  const existing = report.quality_status && typeof report.quality_status === "object" ? report.quality_status : {};
  if (existing.status === "blocked") {
    return;
  }
  const entries = sections.map((section) => ({
    code: "residual_editorial_degraded",
    error_code: "residual_editorial_degraded",
    section,
    message: "公开文案在多轮编辑修复后仍有残留，已按降级披露发布。"
  }));
  report.quality_status = {
    ...existing,
    status: "degraded",
    reasons: [...new Set([...(Array.isArray(existing.reasons) ? existing.reasons : []), "residual_editorial_degraded"])],
    affected_sections: [...new Set([...(Array.isArray(existing.affected_sections) ? existing.affected_sections : []), ...sections])],
    degraded_sections: [...(Array.isArray(existing.degraded_sections) ? existing.degraded_sections : []), ...entries],
    public_note: existing.public_note
      ? `${existing.public_note} 另有部分公开文案在多轮编辑修复后仍有残留，已按降级披露发布。`
      : "部分公开文案在多轮编辑修复后仍有残留，已按降级披露发布。"
  };
  try {
    await fs.writeFile(reportAbsPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  } catch {
    // tolerant: summary-level degrade already applied
  }
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
  const authoringHandoff = authoringHandoffMetadata(aiTasks);
  const template = {
    schema_version: 1,
    report_date: reportDate,
    status: "template",
    ...authoringHandoff,
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

function authoringHandoffMetadata(aiTasks) {
  return (Array.isArray(aiTasks) ? aiTasks : []).some((task) => task?.phase === FIRST_PASS_AUTHORING_PHASE)
    ? {
        handoff_phase: FIRST_PASS_AUTHORING_PHASE,
        handoff_intent: FIRST_PASS_AUTHORING_INTENT,
        authoring_contract: FIRST_PASS_AUTHORING_CONTRACT
      }
    : {};
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
        phase: String(task?.phase || ""),
        intent: String(task?.intent || ""),
        authoring_contract: String(task?.authoring_contract || ""),
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
    phase: String(task?.phase || ""),
    intent: String(task?.intent || ""),
    authoring_contract: String(task?.authoring_contract || ""),
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
  const combinedOutput = mergeStageOutput(output, errorOutput);
  summary.stages.push({
    id,
    status,
    ...(command ? { command } : {}),
    ...(combinedOutput ? { output: sanitizeStageOutput(combinedOutput) } : {}),
    ...(error ? { error: error.message, error_code: error.code || "" } : {}),
    updated_at: now()
  });
  summary.updated_at = now();
}

function mergeStageOutput(output, errorOutput) {
  if (!output) return errorOutput;
  if (!errorOutput) return output;
  if (isPlainStageObject(output) && isPlainStageObject(errorOutput)) {
    return {
      ...output,
      ...errorOutput
    };
  }
  return {
    result: output,
    ...errorOutput
  };
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

function isPlainStageObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function uniqueExistingStrings(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim().length > 0))];
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

function reportDataPath(reportDate) {
  const [year, month] = String(reportDate).split("-");
  return `reports-data/${year}/${month}/${reportDate}.json`;
}

function reportHtmlPath(reportDate) {
  const [year, month] = String(reportDate).split("-");
  return `docs/reports/${year}/${month}/${reportDate}.html`;
}

function qualityReviewPath(reportDate) {
  return `.tmp/quality-review-${reportDate}.json`;
}

function qualityRepairPath(reportDate) {
  return `.tmp/quality-repair-${reportDate}.json`;
}

function firstPassAuthoringPlanPath(reportDate) {
  return `.tmp/first-pass-authoring-plan-${reportDate}.json`;
}

function firstPassAuthoringContractPath(reportDate) {
  return `.tmp/first-pass-authoring-contract-${reportDate}.json`;
}

function firstPassAuthoringResultPath(reportDate) {
  return `.tmp/first-pass-authoring-result-${reportDate}.json`;
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

function finalWorkflowStatus({ publish, summary }) {
  const degraded = summaryHasDegradedOutput(summary);
  if (publish) {
    return degraded ? "published_degraded" : "published";
  }
  return degraded ? "generated_degraded" : "generated_only";
}

function summaryHasDegradedOutput(summary) {
  return (summary?.stages || []).some((stage) => {
    if (stage?.status === "degraded") {
      return true;
    }
    const output = stage?.output && typeof stage.output === "object" ? stage.output : {};
    if (output.degraded === true) {
      return true;
    }
    const qualityStatus = output.quality_status && typeof output.quality_status === "object" ? output.quality_status : {};
    return qualityStatus.status === "degraded";
  });
}

function pagesVerifyPendingNextAction({ outcome, summaryPath }) {
  const output = outcome?.normalized?.output || extractErrorOutput(outcome?.error) || {};
  const publishStatus = output.publish_status && typeof output.publish_status === "object"
    ? output.publish_status
    : {};
  const result = output.result && typeof output.result === "object" ? output.result : {};
  const pagesUrl = output.pages_url || publishStatus.pages_url || result.pages_url || "";
  const message =
    output.verification_error ||
    output.error ||
    output.message ||
    publishStatus.publish_error ||
    result.verification_error ||
    outcome?.error?.message ||
    "Pages verification did not confirm the published report yet.";
  return {
    kind: "verify_pages_later",
    stage_id: "pages_verify",
    summary_path: summaryPath,
    pages_url: pagesUrl,
    message
  };
}

function remoteAheadRestartNextAction({ outcome, stage, context, summary, summaryPath, reportDate }) {
  if (!isRemoteAheadOutcome(outcome)) {
    return null;
  }
  const output = stageOutcomeOutput(outcome);
  const mode = context.mode || summary.mode || "dry-run";
  const publishFlag = mode === "publish" ? " --publish" : "";
  return {
    kind: "restart_latest_main",
    stage_id: stage.id,
    summary_path: summaryPath,
    launcher_root: context.launcherRoot || summary.launcher_root || "",
    clean_repo_root: context.cleanRoot || summary.clean_repo_root || "",
    report_date: reportDate,
    mode,
    remote: remoteAheadDetails(output, outcome?.error),
    command: `corepack pnpm run daily:codex-pipeline -- --date ${reportDate} --execute${publishFlag}`,
    message: "Remote origin/main advanced after this run started. Restart daily:codex-pipeline from the latest origin/main clean checkout; do not use GitHub API fallback for remote_ahead."
  };
}

function isRemoteAheadOutcome(outcome) {
  const output = stageOutcomeOutput(outcome);
  const remote = remoteAheadDetails(output, outcome?.error);
  if (remote.remoteAhead > 0) {
    return true;
  }
  if (!isFailedStageOutcome(outcome)) {
    return false;
  }
  if (hasRemoteAheadCode(output, outcome?.error)) {
    return true;
  }
  const signalText = remoteAheadMessageText(output, outcome?.error);
  return /\bremote[_ -]?ahead\b|远端.+领先/i.test(signalText);
}

function isFailedStageOutcome(outcome) {
  return Boolean(outcome?.blocked || outcome?.error || outcome?.normalized?.ok === false);
}

function hasRemoteAheadCode(output, error) {
  const publishStatus = output.publish_status && typeof output.publish_status === "object"
    ? output.publish_status
    : {};
  return [
    output.error_code,
    output.code,
    publishStatus.error_code,
    error?.code
  ].some((value) => String(value || "").toLowerCase() === "remote_ahead");
}

function remoteAheadMessageText(output, error) {
  const publishStatus = output.publish_status && typeof output.publish_status === "object"
    ? output.publish_status
    : {};
  return [
    error?.message,
    output.error,
    output.message,
    publishStatus.publish_error
  ]
    .filter((part) => part !== undefined && part !== null && String(part).trim().length > 0)
    .map((part) => String(part).toLowerCase())
    .join(" ");
}

function stageOutcomeOutput(outcome) {
  const output = outcome?.normalized?.output;
  return output && typeof output === "object" && !Array.isArray(output) ? output : {};
}

function remoteAheadDetails(output, error) {
  const errorDetails = error?.details && typeof error.details === "object" ? error.details : {};
  const outputDetails = output.details && typeof output.details === "object" ? output.details : {};
  const details = { ...errorDetails, ...outputDetails };
  const remote = output.remote && typeof output.remote === "object" ? output.remote : {};
  const publishStatus = output.publish_status && typeof output.publish_status === "object"
    ? output.publish_status
    : {};
  const remoteAhead = firstFiniteNumber([
    details.remoteAhead,
    details.remote_ahead,
    remote.remoteAhead,
    remote.remote_ahead,
    output.remoteAhead,
    output.remote_ahead,
    publishStatus.remoteAhead,
    publishStatus.remote_ahead
  ]);
  return {
    upstream:
      stringValue(details.upstream) ||
      stringValue(remote.upstream) ||
      stringValue(output.upstream) ||
      stringValue(publishStatus.upstream) ||
      "origin/main",
    remoteAhead,
    error_code: stringValue(output.error_code) || stringValue(output.code) || stringValue(error?.code) || "remote_ahead"
  };
}

function firstFiniteNumber(values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) {
      return number;
    }
  }
  return 0;
}

function stringValue(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function infrastructurePublishRecoveryNextAction({ outcome, stageId, previousStageId, summaryPath }) {
  const output = outcome?.normalized?.output || extractErrorOutput(outcome?.error) || {};
  const publishStatus = output.publish_status && typeof output.publish_status === "object"
    ? output.publish_status
    : {};
  const message =
    output.error ||
    output.message ||
    publishStatus.publish_error ||
    outcome?.error?.message ||
    "Git publish and GitHub API publish fallback both failed.";
  return {
    kind: "recover_infrastructure_publish",
    stage_id: stageId,
    previous_stage_id: previousStageId,
    summary_path: summaryPath,
    message
  };
}

function pnpmStage(id, args) {
  return {
    id,
    command: {
      tool: "pnpm",
      args
    }
  };
}

function nodeCliStage(id, args) {
  return nodeStage(id, ["src/cli.js", ...args]);
}

function nodeStage(id, args, options = {}) {
  return {
    id,
    ...options,
    command: {
      tool: "node",
      args
    }
  };
}

function resolveStageCommand(stage) {
  if (stage.command.tool === "pnpm") {
    const pnpmStoreDir = process.env.PNPM_STORE_DIR || process.env.pnpm_store_dir || "";
    const env = {};
    if (pnpmStoreDir) {
      env.PNPM_STORE_DIR = pnpmStoreDir;
    }
    const invocation = pnpmInvocationForArgs(stage.command.args);
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
  if (text.length <= 4000) return text;
  return `${text.slice(0, 2000)}\n...[truncated ${text.length - 4000} chars]...\n${text.slice(-2000)}`;
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
