#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_SITE } from "./config.js";
import { PublisherError, toPublishError } from "./errors.js";
import {
  checkPublishPreflight,
  createDailyPublishPlan,
  createPublishPlan,
  isGitHubApiFallbackEligibleError,
  prepareCleanPublishWorktree,
  preparePublishWorktree,
  publishGeneratedArtifactsViaGitHubApi,
  publishGeneratedArtifacts,
  resumePublishPush
} from "./publish.js";
import { assemblePrompt } from "./prompt.js";
import {
  collectBuilderFallbacks,
  collectContentSources,
  collectGitHubTrending,
  collectStatuspageIncidents
} from "./discovery.js";
import { collectSearchNews } from "./search-news.js";
import { checkSourcesHealth } from "./source-health.js";
import { auditSourceRunHistory } from "./source-phase5.js";
import { mergeSourceAuditIntoReport } from "./source-audit.js";
import { validateSourceRegistryPath } from "./source-registry.js";
import { generateReportDraft } from "./draft.js";
import { cacheEvidenceImages } from "./evidence-cache.js";
import { writeReportDraft } from "./report.js";
import { buildSite } from "./site.js";
import {
  applyQualityRepairContract,
  repairReportQuality,
  reviewReportQuality
} from "./quality-loop.js";
import { runDailyWorkflow } from "./daily-runner.js";
import { runStatusSelfCheck } from "./status-self-check.js";

const [command, ...argv] = process.argv.slice(2);

try {
  if (command === "build") {
    const args = parseArgs(argv);
    const result = await buildSite({
      rootDir: path.resolve(args["repo-root"] || process.cwd()),
      inputDir: args.input || "reports-source",
      dataInputDir: args["data-input"] || "reports-data",
      outDir: args.out || "docs",
      siteUrl: args["site-url"] || DEFAULT_SITE.siteUrl,
      generatedAt: args["generated-at"]
    });
    printJson({
      ok: true,
      out_dir: result.outDir,
      reports: result.reports.map((report) => report.report_date),
      written_files: result.writtenFiles
    });
  } else if (command === "publish:dry-run:daily") {
    const args = parseArgs(argv);
    const plan = await createDailyPublishPlan({
      repoRoot: path.resolve(args["repo-root"] || process.cwd()),
      inputDir: args.input || "reports-source",
      dataInputDir: args["data-input"] || "reports-data",
      outDir: args.out || "docs",
      siteUrl: args["site-url"] || DEFAULT_SITE.siteUrl,
      allowedBranch: args.branch || DEFAULT_SITE.publishBranch,
      generatedAt: args["generated-at"],
      reportDate: args.date || firstPositionalDate(argv)
    });
    printJson({
      ok: true,
      publish_status: {
        html_generated: false,
        repo_updated: false,
        repo_pushed: false,
        pages_url: plan.expected_pages_url,
        publish_error: ""
      },
      plan
    });
  } else if (command === "publish:dry-run") {
    const args = parseArgs(argv);
    const plan = await createPublishPlan({
      repoRoot: path.resolve(args["repo-root"] || process.cwd()),
      inputDir: args.input || "reports-source",
      dataInputDir: args["data-input"] || "reports-data",
      outDir: args.out || "docs",
      siteUrl: args["site-url"] || DEFAULT_SITE.siteUrl,
      allowedBranch: args.branch || DEFAULT_SITE.publishBranch,
      generatedAt: args["generated-at"],
      reportDate: args.date || firstPositionalDate(argv)
    });
    printJson({
      ok: true,
      publish_status: {
        html_generated: false,
        repo_updated: false,
        repo_pushed: false,
        pages_url: plan.expected_pages_url,
        publish_error: ""
      },
      plan
    });
  } else if (command === "daily:run") {
    const args = parseArgs(argv);
    const result = await runDailyWorkflow({
      launcherRoot: path.resolve(args["launcher-root"] || args["repo-root"] || process.cwd()),
      reportDate: args.date || firstPositionalDate(argv),
      publish: Boolean(args.publish),
      maxReviewRepairLoops: args["max-review-repair-loops"],
      allowedBranch: args.branch || DEFAULT_SITE.publishBranch,
      worktreeDir: args["worktree-dir"],
      restart: Boolean(args.restart)
    });
    const ok = !["blocked", "failed"].includes(result.summary.final_status);
    printJson({
      ok,
      summary_path: result.summaryPath,
      final_status: result.summary.final_status,
      next_action: result.summary.next_action,
      summary: result.summary
    });
    if (!ok) {
      process.exitCode = 1;
    }
  } else if (command === "status:self-check") {
    const args = parseArgs(argv);
    const result = await runStatusSelfCheck({
      rootDir: path.resolve(args["repo-root"] || process.cwd()),
      reportDate: args.date || firstPositionalDate(argv),
      generatedAt: args["generated-at"],
      automationsDir: args["automations-dir"],
      automationPromptPath: args["automation-prompt"],
      projectCwds: args["automation-cwd"] ? [args["automation-cwd"]] : undefined,
      sourcesPath: args.sources,
      enablement: args.enablement,
      inputDir: args.input,
      dataInputDir: args["data-input"],
      outDir: args.out,
      siteUrl: args["site-url"],
      outputPath: args.output,
      worktreeDir: args["worktree-dir"],
      allowExternalWorktree: Boolean(args["allow-external-worktree"]),
      installDependencies: args["no-install"] !== true,
      forceInstall: Boolean(args["force-install"]),
      cleanWorktree: args["skip-clean-worktree"] !== true
    });
    printJson(result);
    if (result.status === "blocked") {
      process.exitCode = 1;
    }
  } else if (command === "publish:preflight") {
    const args = parseArgs(argv);
    const preflight = await checkPublishPreflight({
      repoRoot: path.resolve(args["repo-root"] || process.cwd()),
      allowedBranch: args.branch || DEFAULT_SITE.publishBranch
    });
    printJson({
      ok: true,
      publish_status: {
        html_generated: false,
        repo_updated: false,
        repo_pushed: false,
        pages_url: "",
        publish_error: ""
      },
      preflight
    });
  } else if (command === "publish:prepare-worktree") {
    const args = parseArgs(argv);
    const prepared = await preparePublishWorktree({
      repoRoot: path.resolve(args["repo-root"] || process.cwd()),
      allowedBranch: args.branch || DEFAULT_SITE.publishBranch,
      commitMessage: args.message
    });
    printJson({
      ok: true,
      publish_status: {
        html_generated: false,
        repo_updated: prepared.committed_local_changes,
        repo_pushed: false,
        pages_url: "",
        publish_error: prepared.publish_blocker
          ? `${prepared.publish_blocker.code}: ${prepared.publish_blocker.message}`
          : ""
      },
      prepared
    });
  } else if (command === "publish:prepare-clean-worktree") {
    const args = parseArgs(argv);
    const prepared = await prepareCleanPublishWorktree({
      repoRoot: path.resolve(args["repo-root"] || process.cwd()),
      allowedBranch: args.branch || DEFAULT_SITE.publishBranch,
      worktreeDir: args["worktree-dir"],
      remoteUrl: args["remote-url"],
      allowExternalWorktree: Boolean(args["allow-external-worktree"]),
      installDependencies: args["no-install"] !== true,
      forceInstall: Boolean(args["force-install"])
    });
    printJson({
      ok: true,
      publish_status: {
        html_generated: false,
        repo_updated: false,
        repo_pushed: false,
        pages_url: "",
        publish_error: ""
      },
      prepared
    });
  } else if (command === "prompt:build") {
    const args = parseArgs(argv);
    const prompt = await assemblePrompt({
      rootDir: path.resolve(args["repo-root"] || process.cwd()),
      promptDir: args["prompt-dir"] || "prompts/ai-daily",
      reportDate: args.date || firstPositionalDate(argv),
      generatedAt: args["generated-at"]
    });
    process.stdout.write(prompt);
  } else if (command === "report:write") {
    const args = parseArgs(argv);
    const positional = positionalArgs(argv);
    const result = await writeReportDraft({
      rootDir: path.resolve(args["repo-root"] || process.cwd()),
      inputPath: args.input || positional[0],
      outputDir: args.out || positional[1] || "reports-data",
      candidatePoolPath: args["candidate-pool"],
      reportDate: args.date || firstPositionalDate(argv),
      siteUrl: args["site-url"] || DEFAULT_SITE.siteUrl,
      generatedAt: args["generated-at"] || firstPositionalDateTime(argv)
    });
    printJson({
      ok: true,
      report_date: result.report.report_date,
      path: result.path,
      source_status_history_path: result.sourceStatusHistoryPath,
      canonical_url: result.report.canonical_url
    });
  } else if (command === "report:draft") {
    const args = parseArgs(argv);
    const reportDate = args.date || firstPositionalDate(argv);
    const outputPath = args.output || args.out || path.join(".tmp", "daily-report.json");
    const candidateOutputPath = args["candidate-output"] || args["candidate-pool"] || path.join(".tmp", `source-candidates-${reportDate}.json`);
    const result = await generateReportDraft({
      rootDir: path.resolve(args["repo-root"] || process.cwd()),
      reportDate,
      generatedAt: args["generated-at"] || firstPositionalDateTime(argv),
      inputPaths: draftInputPaths(argv, args, { outputPath, candidateOutputPath }),
      outputPath,
      candidateOutputPath,
      evidenceOutDir: args["evidence-out"] || "docs",
      maxEvidenceAssets: args["max-evidence-assets"] ? Number.parseInt(args["max-evidence-assets"], 10) : undefined,
      cacheEvidence: args["no-evidence-cache"] !== true
    });
    printJson({
      ok: true,
      report_date: result.report.report_date,
      path: result.path,
      candidate_pool_path: result.candidatePoolPath,
      source_status_history_path: result.sourceStatusHistoryPath,
      evidence_assets: result.evidence_assets,
      evidence_skipped: result.evidence_skipped,
      counts: result.counts
    });
  } else if (command === "evidence:cache") {
    const args = parseArgs(argv);
    const result = await cacheEvidenceImages({
      rootDir: path.resolve(args["repo-root"] || process.cwd()),
      reportDate: args.date || firstPositionalDate(argv),
      candidatePoolPath: args["candidate-pool"],
      outDir: args.out || "docs",
      maxAssets: Number.parseInt(args.max || args.limit || "3", 10)
    });
    printJson({
      ok: true,
      report_date: args.date || firstPositionalDate(argv),
      evidence_assets: result.assets,
      skipped: result.skipped
    });
  } else if (command === "quality:review") {
    const args = parseArgs(argv);
    const positional = positionalArgs(argv);
    const inputPath = args.input || positional[0];
    const reviewOutputPath = args.output || positional[1] || "";
    const candidatePoolPath = args["candidate-pool"] || positional[2] || "";
    if (!inputPath) {
      throw new PublisherError("quality_review_input_required", "quality:review requires --input <daily-report.json>.");
    }
    const report = JSON.parse(fs.readFileSync(path.resolve(inputPath), "utf8"));
    const candidatePool = candidatePoolPath
      ? JSON.parse(fs.readFileSync(path.resolve(candidatePoolPath), "utf8"))
      : null;
    const review = reviewReportQuality(report, { candidatePool });
    printJson({
      ok: review.ok,
      review
    }, reviewOutputPath);
    if (!review.ok && args["fail-on-issues"]) {
      process.exitCode = 1;
    }
  } else if (command === "quality:repair") {
    const args = parseArgs(argv);
    const positional = positionalArgs(argv);
    const inputPath = args.input || positional[0];
    if (!inputPath) {
      throw new PublisherError("quality_repair_input_required", "quality:repair requires --input <daily-report.json>.");
    }
    const outPath = args.out || positional[1] || (args["in-place"] ? inputPath : "");
    const repairOutputPath = args.output || positional[2] || "";
    if (!outPath) {
      throw new PublisherError("quality_repair_output_required", "quality:repair requires --out <daily-report.optimized.json> or --in-place.");
    }
    const qualityRepairPaths = resolveQualityRepairExtras(args, positional.slice(3));
    const candidatePool = qualityRepairPaths.candidatePoolPath
      ? JSON.parse(fs.readFileSync(path.resolve(qualityRepairPaths.candidatePoolPath), "utf8"))
      : null;
    const report = JSON.parse(fs.readFileSync(path.resolve(inputPath), "utf8"));
    const safeRepair = repairReportQuality(report, null, { candidatePool });
    let finalReport = safeRepair.report;
    let contractResult = null;
    const contractPath = qualityRepairPaths.contractPath;
    if (contractPath) {
      const contract = JSON.parse(fs.readFileSync(path.resolve(contractPath), "utf8"));
      contractResult = applyQualityRepairContract(finalReport, contract);
      finalReport = contractResult.report;
    }
    const resolvedOut = path.resolve(outPath);
    fs.mkdirSync(path.dirname(resolvedOut), { recursive: true });
    fs.writeFileSync(resolvedOut, `${JSON.stringify(finalReport, null, 2)}\n`, "utf8");
    const finalReview = reviewReportQuality(finalReport, { candidatePool });
    printJson({
      ok: finalReview.ok,
      path: resolvedOut,
      safe_repairs: safeRepair.repairs,
      contract_applied: contractResult?.applied || [],
      contract_rejected: contractResult?.rejected || [],
      review: finalReview
    }, repairOutputPath);
  } else if (command === "discover:github-trending") {
    const args = parseArgs(argv);
    const positional = positionalArgs(argv);
    const result = await collectGitHubTrending({
      limit: Number.parseInt(args.limit || firstPositiveInteger(argv) || "50", 10),
      reportDate: args.date || firstPositionalDate(argv),
      historyDir: args["history-dir"] || "reports-data",
      browserExportPath: args["browser-export"],
      browserExportName: args["browser-export-name"],
      browserExportUrl: args["browser-export-url"],
      browserExportLanguage: args["browser-export-language"],
      browserExportWindow: args["browser-export-window"],
      historyRoot: args["history-root"],
      historyLookbackDays: Number.parseInt(args["history-lookback-days"] || "7", 10),
      fetchRetries: Number.parseInt(args["fetch-retries"] || "1", 10),
      retryDelayMs: Number.parseInt(args["retry-delay-ms"] || "1500", 10)
    });
    printJson({
      ok: true,
      ...result
    });
  } else if (command === "discover:builders") {
    const args = parseArgs(argv);
    const result = await collectBuilderFallbacks({
      reportDate: args.date || firstPositionalDate(argv),
      generatedAt: args["generated-at"],
      sourcesPath: args.sources,
      limit: Number.parseInt(args.limit || firstPositiveInteger(argv) || "20", 10),
      perSourceLimit: Number.parseInt(args["per-source-limit"] || "3", 10),
      fetchRetries: Number.parseInt(args["fetch-retries"] || "1", 10),
      retryDelayMs: Number.parseInt(args["retry-delay-ms"] || "1500", 10)
    });
    printJson({
      ok: true,
      ...result
    });
  } else if (command === "discover:content-sources") {
    const args = parseArgs(argv);
    const positionalNumbers = positiveIntegers(argv);
    const result = await collectContentSources({
      rootDir: path.resolve(args["repo-root"] || process.cwd()),
      reportDate: args.date || firstPositionalDate(argv),
      generatedAt: args["generated-at"],
      sourcesPath: args.sources,
      registryPath: args.registry,
      enablement: args.enablement || firstEnablement(argv) || "core,optional",
      wechatInputPath: args["wechat-input"],
      limit: Number.parseInt(args.limit || positionalNumbers[0] || "20", 10),
      perSourceLimit: Number.parseInt(args["per-source-limit"] || positionalNumbers[1] || "3", 10),
      budgetMs: Number.parseInt(args["budget-ms"] || positionalNumbers[2] || "300000", 10),
      fetchRetries: Number.parseInt(args["fetch-retries"] || "1", 10),
      retryDelayMs: Number.parseInt(args["retry-delay-ms"] || "1500", 10)
    });
    printJson({
      ok: true,
      ...result
    });
  } else if (isPlatformDiscoverCommand(command)) {
    const platform = platformDiscoverCommandPlatform(command);
    const args = parseArgs(argv);
    const positionalNumbers = positiveIntegers(argv);
    const result = await collectContentSources({
      rootDir: path.resolve(args["repo-root"] || process.cwd()),
      reportDate: args.date || firstPositionalDate(argv),
      generatedAt: args["generated-at"],
      platformExempt: platform,
      sourcesPath: args.sources || path.join("config", "sources", `${platform}-platform-sources.json`),
      enablement: args.enablement || firstEnablement(argv) || "manual,core,optional",
      includeWeChatInput: false,
      limit: Number.parseInt(args.limit || positionalNumbers[0] || "20", 10),
      perSourceLimit: Number.parseInt(args["per-source-limit"] || positionalNumbers[1] || "3", 10),
      budgetMs: Number.parseInt(args["budget-ms"] || positionalNumbers[2] || "300000", 10),
      fetchRetries: Number.parseInt(args["fetch-retries"] || "1", 10),
      retryDelayMs: Number.parseInt(args["retry-delay-ms"] || "1500", 10)
    });
    printJson({
      ok: true,
      ...result
    });
  } else if (command === "discover:search-news") {
    const args = parseArgs(argv);
    const positionalNumbers = positiveIntegers(argv);
    const result = await collectSearchNews({
      rootDir: path.resolve(args["repo-root"] || process.cwd()),
      reportDate: args.date || firstPositionalDate(argv),
      generatedAt: args["generated-at"],
      providers: args.providers || inferProviderList(argv),
      queriesPath: args.queries || firstJsonPath(argv),
      limit: Number.parseInt(args.limit || positionalNumbers[0] || "40", 10),
      timeoutMs: Number.parseInt(args["timeout-ms"] || positionalNumbers[1] || "15000", 10),
      providerTimeoutMs: Number.parseInt(args["provider-timeout-ms"] || "0", 10),
      budgetMs: Number.parseInt(args["budget-ms"] || positionalNumbers[2] || "300000", 10),
      shadow: args.shadow !== false,
      fetchRetries: Number.parseInt(args["fetch-retries"] || "1", 10),
      retryDelayMs: Number.parseInt(args["retry-delay-ms"] || "1500", 10)
    });
    printJson({
      ok: true,
      ...result
    });
  } else if (command === "sources:health") {
    const args = parseArgs(argv);
    const result = await checkSourcesHealth({
      rootDir: path.resolve(args["repo-root"] || process.cwd()),
      reportDate: args.date || firstPositionalDate(argv),
      sourcesPath: args.sources || firstSourcePath(argv),
      enablement: args.enablement || firstEnablement(argv) || "core,optional,manual",
      fetchRetries: Number.parseInt(args["fetch-retries"] || "1", 10),
      retryDelayMs: Number.parseInt(args["retry-delay-ms"] || "1500", 10)
    });
    printJson({
      ok: true,
      ...result
    });
  } else if (command === "sources:phase5-audit") {
    const args = parseArgs(argv);
    const positionalNumbers = positiveIntegers(argv);
    const result = await auditSourceRunHistory({
      rootDir: path.resolve(args["repo-root"] || process.cwd()),
      reportDate: args.date || firstPositionalDate(argv),
      historyDir: args["history-dir"] || firstHistoryPath(argv) || "reports-data",
      days: Number.parseInt(args.days || positionalNumbers[0] || "3", 10)
    });
    printJson(result);
  } else if (command === "sources:audit-merge") {
    const args = parseArgs(argv);
    const result = await mergeSourceAuditIntoReport({
      rootDir: path.resolve(args["repo-root"] || process.cwd()),
      reportDate: args.date || firstPositionalDate(argv),
      historyDir: args["history-dir"] || firstHistoryPath(argv) || "reports-data",
      reportPath: args.report,
      inputPaths: auditInputPaths(argv, args)
    });
    printJson({
      ok: true,
      ...result
    });
  } else if (command === "sources:validate") {
    const args = parseArgs(argv);
    const registry = await validateSourceRegistryPath({
      rootDir: path.resolve(args["repo-root"] || process.cwd()),
      sourcesPath: args.sources || firstSourcePath(argv)
    });
    printJson({
      ok: true,
      source_count: registry.sources.length,
      enablement_counts: countBy(registry.sources, "enablement"),
      tier_counts: countBy(registry.sources, "tier"),
      source_kind_counts: countBy(registry.sources, "source_kind")
    });
  } else if (command === "discover:statuspage-incidents") {
    const args = parseArgs(argv);
    const result = await collectStatuspageIncidents({
      reportDate: args.date || firstPositionalDate(argv),
      generatedAt: args["generated-at"],
      sourcesPath: args.sources,
      limit: Number.parseInt(args.limit || firstPositiveInteger(argv) || "20", 10),
      fetchRetries: Number.parseInt(args["fetch-retries"] || "1", 10),
      retryDelayMs: Number.parseInt(args["retry-delay-ms"] || "1500", 10)
    });
    printJson({
      ok: true,
      ...result
    });
  } else if (command === "publish") {
    const args = parseArgs(argv);
    const positional = positionalArgs(argv);
    const result = await publishGeneratedArtifacts({
      repoRoot: path.resolve(args["repo-root"] || process.cwd()),
      allowedBranch: args.branch || DEFAULT_SITE.publishBranch,
      confirmPush: Boolean(args["confirm-push"]) || positional.includes("confirm-push"),
      reportDate: args.date || firstPositionalDate(argv),
      commitMessage: args.message,
      verifyPages: true
    });
    const publishOk = !result.verification_error;
    printJson({
      ok: publishOk,
      publish_status: {
        html_generated: true,
        repo_updated: Boolean(result.repo_updated ?? result.committed),
        repo_pushed: result.pushed,
        pages_url: result.pages_url || "",
        publish_error: result.verification_error || "",
        publish_mode: result.publish_mode || result.mode || "publish"
      },
      result
    });
    if (!publishOk) {
      process.exitCode = 1;
    }
  } else if (command === "publish:github-api") {
    const args = parseArgs(argv);
    const positional = positionalArgs(argv);
    const result = await publishGeneratedArtifactsViaGitHubApi({
      repoRoot: path.resolve(args["repo-root"] || process.cwd()),
      allowedBranch: args.branch || DEFAULT_SITE.publishBranch,
      confirmPush: Boolean(args["confirm-push"]) || positional.includes("confirm-push"),
      reportDate: args.date || firstPositionalDate(argv),
      commitMessage: args.message,
      repository: args.repo,
      inputDir: args.input || "reports-source",
      dataInputDir: args["data-input"] || "reports-data",
      outDir: args.out || "docs",
      siteUrl: args["site-url"] || DEFAULT_SITE.siteUrl,
      generatedAt: args["generated-at"],
      verifyPages: true
    });
    const publishOk = !result.verification_error;
    printJson({
      ok: publishOk,
      publish_status: {
        html_generated: true,
        repo_updated: Boolean(result.repo_updated ?? result.committed),
        repo_pushed: result.pushed,
        pages_url: result.pages_url || "",
        publish_error: result.verification_error || "",
        publish_mode: result.publish_mode || result.mode || "publish-github-api"
      },
      result
    });
    if (!publishOk) {
      process.exitCode = 1;
    }
  } else if (command === "publish:resume-push") {
    const args = parseArgs(argv);
    const positional = positionalArgs(argv);
    const result = await resumePublishPush({
      repoRoot: path.resolve(args["repo-root"] || process.cwd()),
      allowedBranch: args.branch || DEFAULT_SITE.publishBranch,
      confirmPush: Boolean(args["confirm-push"]) || positional.includes("confirm-push"),
      reportDate: args.date || firstPositionalDate(argv),
      verifyPages: true
    });
    const publishOk = !result.verification_error;
    printJson({
      ok: publishOk,
      publish_status: {
        html_generated: true,
        repo_updated: Boolean(result.repo_updated ?? result.committed),
        repo_pushed: result.pushed,
        pages_url: result.pages_url || "",
        publish_error: result.verification_error || "",
        publish_mode: result.publish_mode || result.mode || "publish-resume-push"
      },
      result
    });
    if (!publishOk) {
      process.exitCode = 1;
    }
  } else {
    throw new PublisherError("unknown_command", `未知命令：${command || "(empty)"}`);
  }
} catch (error) {
  const publishError = toPublishError(error);
  const details = error.details ? { ...error.details } : {};
  if (isGitHubApiFallbackEligibleError(error)) {
    details.github_api_fallback_eligible = true;
  }
  printJson({
    ok: false,
    error: error instanceof PublisherError ? error.code : "unexpected_error",
    message: error.message,
    details: Object.keys(details).length > 0 ? details : undefined,
    publish_status: {
      html_generated: false,
      repo_updated: Boolean(details.repo_updated),
      repo_pushed: Boolean(details.repo_pushed),
      pages_url: details.pages_url || "",
      publish_error: publishError
    }
  });
  process.exitCode = 1;
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const next = args[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
    } else {
      parsed[key] = next;
      index += 1;
    }
  }

  return parsed;
}

function firstPositionalDate(args) {
  return args.find((token) => /^\d{4}-\d{2}-\d{2}$/.test(token));
}

function firstPositionalDateTime(args) {
  return args.find((token) => /^\d{4}-\d{2}-\d{2}T/.test(token));
}

function firstPositiveInteger(args) {
  return args.find((token) => /^[1-9]\d*$/.test(token));
}

function positiveIntegers(args) {
  return args.filter((token) => /^[1-9]\d*$/.test(token));
}

function firstEnablement(args) {
  return args.find((token) => /^(core|optional|manual)(,(core|optional|manual))*$/.test(token));
}

function isPlatformDiscoverCommand(value) {
  return /^discover:(wechat|zhihu|reddit)-platform$/.test(String(value || ""));
}

function platformDiscoverCommandPlatform(value) {
  return String(value || "").match(/^discover:(wechat|zhihu|reddit)-platform$/)?.[1] || "";
}

function firstJsonPath(args) {
  return positionalArgs(args).find((token) => /\.json$/i.test(token));
}

function firstSourcePath(args) {
  return positionalArgs(args).find((token) => /\.json$/i.test(token) || /(^|[\\/])sources([\\/]|$)/i.test(token));
}

function firstHistoryPath(args) {
  return positionalArgs(args).find((token) => /(^|[\\/])reports-data([\\/]|$)|^reports-data$/i.test(token));
}

function inferProviderList(args) {
  const providerNames = new Set(["gdelt", "openalex", "arxiv", "brave", "tavily", "exa", "serpapi", "semantic_scholar"]);
  const providers = args
    .flatMap((token) => String(token).split(","))
    .map((token) => token.trim())
    .filter((token) => providerNames.has(token));
  return providers.length > 0 ? providers.join(",") : undefined;
}

function auditInputPaths(args, parsed) {
  const explicit = [parsed.input, parsed.inputs].filter(Boolean).flatMap(splitInputPathToken);
  const positional = positionalArgs(args).flatMap(splitInputPathToken).filter((token) => /\.json$/i.test(token));
  const excluded = new Set([parsed.report].filter(Boolean).map((value) => path.resolve(value)));
  return [...explicit, ...positional].filter((value) => !excluded.has(path.resolve(value)));
}

function draftInputPaths(args, parsed, options = {}) {
  const explicit = [parsed.input, parsed.inputs].filter(Boolean).flatMap(splitInputPathToken);
  const positional = positionalArgs(args).flatMap(splitInputPathToken).filter((token) => /\.json$/i.test(token));
  const excluded = new Set([options.outputPath, options.candidateOutputPath]
    .filter(Boolean)
    .map((value) => path.resolve(value)));
  return [...explicit, ...positional].filter((value) => !excluded.has(path.resolve(value)));
}

function resolveQualityRepairExtras(parsed, extraPositionals) {
  let contractPath = parsed["repair-contract"] || parsed.repair || "";
  let candidatePoolPath = parsed["candidate-pool"] || "";
  for (const item of extraPositionals) {
    if (!candidatePoolPath && /(?:source-candidates|\.candidates\.json$)/i.test(String(item))) {
      candidatePoolPath = item;
      continue;
    }
    if (!contractPath) {
      contractPath = item;
      continue;
    }
    if (!candidatePoolPath) {
      candidatePoolPath = item;
    }
  }
  return { contractPath, candidatePoolPath };
}

function splitInputPathToken(value) {
  return String(value).split(/[,\s]+/).map((token) => token.trim()).filter(Boolean);
}

function positionalArgs(args) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token.startsWith("--")) {
      const next = args[index + 1];
      if (next && !next.startsWith("--")) {
        index += 1;
      }
      continue;
    }
    values.push(token);
  }
  return values;
}

function printJson(value, explicitOutputPath = "") {
  const json = `${JSON.stringify(value, null, 2)}\n`;
  const outputPath = explicitOutputPath || outputPathFromArgs(argv);
  if (outputPath) {
    const resolved = path.resolve(outputPath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, json, "utf8");
  }
  process.stdout.write(json);
}

function outputPathFromArgs(args) {
  if (command === "report:draft") {
    return "";
  }
  const parsed = parseArgs(args);
  return typeof parsed.output === "string" && parsed.output.trim() ? parsed.output : "";
}

function countBy(items, key) {
  const counts = {};
  for (const item of items) {
    const value = item?.[key] || "unspecified";
    counts[value] = (counts[value] || 0) + 1;
  }
  return counts;
}
