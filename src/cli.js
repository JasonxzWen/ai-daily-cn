#!/usr/bin/env node
import { createHash } from "node:crypto";
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
  resumePublishPush,
  verifyPublishedUrl
} from "./publish.js";
import { canonicalReportUrl } from "./paths.js";
import { assemblePrompt } from "./prompt.js";
import {
  collectBuilderFallbacks,
  collectContentSources,
  collectGitHubTrending,
  collectHuggingFaceTrending,
  collectSourceWatch,
  createSourceWatchFixtureFetch,
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
import { buildWebApp } from "./web-app-build.js";
import { checkWorktreePreflight } from "./worktree-preflight.js";
import { checkSourceResetPreflight } from "./source-reset-preflight.js";
import {
  applyQualityRepairContract,
  repairReportQuality,
  reviewReportQuality
} from "./quality-loop.js";
import { runDailyWorkflow } from "./daily-runner.js";
import { runStatusSelfCheck } from "./status-self-check.js";
import {
  createOfficialBlogKnowledgeContext,
  createOfficialBlogAuthoringBrief,
  createOfficialBlogKnowledgeDrafts,
  createOfficialBlogPreviewFeed,
  createOfficialBlogReviewedAuthoring,
  createOfficialBlogAiReviewHandoff,
  createOfficialBlogReviewSession,
  createOfficialBlogIntakeQueue,
  createOfficialBlogRelationshipSuggestions,
  createOfficialBlogReviewDecisions,
  createOfficialBlogReviewPacket,
  loadOfficialBlogKnowledge,
  normalizeOfficialBlogUrl
} from "./official-blog-knowledge.js";

const [command, ...argv] = process.argv.slice(2);

try {
  if (command === "build") {
    const args = parseArgs(argv);
    const rootDir = path.resolve(args["repo-root"] || process.cwd());
    const outDir = args.out || "docs";
    const result = await buildSite({
      rootDir,
      inputDir: args.input || "reports-source",
      dataInputDir: args["data-input"] || "reports-data",
      outDir,
      siteUrl: args["site-url"] || DEFAULT_SITE.siteUrl,
      generatedAt: args["generated-at"],
      sourceWatchConsumptionReportDate: args["source-watch-report-date"]
    });
    const webApp = await buildWebApp({ rootDir, outDir });
    printJson({
      ok: true,
      out_dir: result.outDir,
      reports: result.reports.map((report) => report.report_date),
      source_watch_consumption: result.sourceWatchConsumption,
      written_files: uniqueStrings([...result.writtenFiles, ...webApp.writtenFiles]),
      web_app: {
        ok: webApp.ok,
        written_files: webApp.writtenFiles
      }
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
      pnpmStoreDir: args["pnpm-store-dir"],
      cleanWorktree: args["skip-clean-worktree"] !== true
    });
    printJson(result);
    if (result.status === "blocked") {
      process.exitCode = 1;
    }
  } else if (command === "official-blog:intake") {
    const args = parseArgs(argv);
    const inputPath = args.input || firstJsonPath(argv);
    if (!inputPath) {
      throw new PublisherError("official_blog_intake_input_required", "official-blog:intake requires --input <candidate-previews.json>.");
    }
    const rootDir = path.resolve(args["repo-root"] || process.cwd());
    const resolvedInputPath = path.resolve(inputPath);
    const outputPath = typeof args.output === "string" ? args.output : "";
    assertOfficialBlogIntakeOutputPath({ outputPath, rootDir });
    const inputRaw = fs.readFileSync(resolvedInputPath, "utf8");
    const input = JSON.parse(inputRaw);
    const existingIndex = await loadOfficialBlogKnowledge({
      rootDir,
      knowledgeDir: args["knowledge-dir"] ? path.resolve(args["knowledge-dir"]) : undefined
    });
    const queue = createOfficialBlogIntakeQueue(input, {
      existingIndex,
      reportDate: args.date || firstPositionalDate(argv),
      generatedAt: args["generated-at"]
    });
    printJson({
      ok: true,
      input_path: resolvedInputPath,
      queue
    }, outputPath);
  } else if (command === "official-blog:parse-feed") {
    const args = parseArgs(argv);
    const inputPath = args.input || firstJsonPath(argv);
    if (!inputPath) {
      throw new PublisherError("official_blog_parse_feed_input_required", "official-blog:parse-feed requires --input <rss-or-json>.");
    }
    if (!args.company) {
      throw new PublisherError("official_blog_parse_feed_company_required", "official-blog:parse-feed requires --company <openai|anthropic>.");
    }
    const rootDir = path.resolve(args["repo-root"] || process.cwd());
    const resolvedInputPath = path.resolve(inputPath);
    const outputPath = typeof args.output === "string" ? args.output : "";
    assertOfficialBlogParseFeedOutputPath({ outputPath, rootDir });
    const input = fs.readFileSync(resolvedInputPath, "utf8");
    const feed = createOfficialBlogPreviewFeed(input, {
      company: args.company,
      reportDate: args.date || firstPositionalDate(argv),
      generatedAt: args["generated-at"],
      sourceLabel: args["source-label"] || args.source || path.basename(resolvedInputPath)
    });
    printJson({
      ok: true,
      input_path: resolvedInputPath,
      feed
    }, outputPath);
  } else if (command === "official-blog:review-session") {
    const args = parseArgs(argv);
    const inputPath = args.input || args.manifest || firstJsonPath(argv);
    if (!inputPath) {
      throw new PublisherError("official_blog_review_session_input_required", "official-blog:review-session requires --input <review-session-manifest.json>.");
    }
    const rootDir = path.resolve(args["repo-root"] || process.cwd());
    const resolvedInputPath = path.resolve(inputPath);
    const outputPath = typeof args.output === "string" ? args.output : "";
    assertOfficialBlogReviewSessionOutputPath({ outputPath, rootDir });
    const manifest = JSON.parse(fs.readFileSync(resolvedInputPath, "utf8"));
    const session = createOfficialBlogReviewSession({
      report_date: manifest.report_date || manifest.reportDate,
      generated_at: manifest.generated_at || manifest.generatedAt,
      feeds: officialBlogReviewSessionManifestFeeds(manifest, path.dirname(resolvedInputPath))
    }, {
      reportDate: args.date || firstPositionalDate(argv) || manifest.report_date || manifest.reportDate,
      generatedAt: args["generated-at"] || manifest.generated_at || manifest.generatedAt
    });
    printJson({
      ok: true,
      session
    }, outputPath);
  } else if (command === "official-blog:review-handoff") {
    const args = parseArgs(argv);
    const inputPath = args.input || args.packet || firstJsonPath(argv);
    if (!inputPath) {
      throw new PublisherError("official_blog_review_handoff_input_required", "official-blog:review-handoff requires --input <review-session-or-review-packet.json>.");
    }
    const rootDir = path.resolve(args["repo-root"] || process.cwd());
    const resolvedInputPath = path.resolve(inputPath);
    const outputPath = typeof args.output === "string" ? args.output : "";
    assertOfficialBlogReviewHandoffOutputPath({ outputPath, rootDir });
    const inputRaw = fs.readFileSync(resolvedInputPath, "utf8");
    const input = JSON.parse(inputRaw);
    const handoff = createOfficialBlogAiReviewHandoff(input, {
      reportDate: args.date || firstPositionalDate(argv),
      generatedAt: args["generated-at"]
    });
    printJson({
      ok: true,
      handoff
    }, outputPath);
  } else if (command === "official-blog:author-records") {
    const args = parseArgs(argv);
    const inputPath = args.input || firstJsonPath(argv);
    if (!inputPath) {
      throw new PublisherError("official_blog_author_records_input_required", "official-blog:author-records requires --input <reviewed-official-blogs.json>.");
    }
    const dryRun = Boolean(args["dry-run"]);
    const outputDir = args["output-dir"];
    if (!outputDir && !dryRun) {
      throw new PublisherError("official_blog_author_records_output_dir_required", "official-blog:author-records requires --output-dir <knowledge/official-blogs>.");
    }
    const rootDir = path.resolve(args["repo-root"] || process.cwd());
    const resolvedInputPath = path.resolve(inputPath);
    const resolvedOutputDir = outputDir ? path.resolve(outputDir) : "";
    const outputPath = typeof args.output === "string" ? args.output : "";
    assertOfficialBlogAuthorRecordsOutputPath({
      outputPath,
      outputDir: resolvedOutputDir,
      rootDir
    });
    const input = JSON.parse(fs.readFileSync(resolvedInputPath, "utf8"));
    const existingIndex = await loadOfficialBlogKnowledge({
      rootDir,
      knowledgeDir: args["knowledge-dir"] ? path.resolve(args["knowledge-dir"]) : undefined
    });
    const drafts = createOfficialBlogKnowledgeDrafts(input, {
      existingIndex,
      generatedAt: args["generated-at"]
    });
    const recordsPlanned = drafts.records.map((record) => ({
      id: record.id,
      company: record.company,
      path: resolvedOutputDir ? path.join(resolvedOutputDir, record.company, `${record.id}.json`) : ""
    }));
    const recordsWritten = [];
    for (const record of drafts.records) {
      if (dryRun) {
        continue;
      }
      const recordPath = path.join(resolvedOutputDir, record.company, `${record.id}.json`);
      fs.mkdirSync(path.dirname(recordPath), { recursive: true });
      fs.writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
      recordsWritten.push({
        id: record.id,
        company: record.company,
        path: recordPath
      });
    }
    printJson({
      ok: true,
      input_path: resolvedInputPath,
      output_dir: resolvedOutputDir,
      dry_run: dryRun,
      drafts,
      records_planned: recordsPlanned,
      records_written: recordsWritten
    }, outputPath);
  } else if (command === "official-blog:suggest-relations") {
    const args = parseArgs(argv);
    const inputPath = args.input || firstJsonPath(argv);
    if (!inputPath) {
      throw new PublisherError("official_blog_suggest_relations_input_required", "official-blog:suggest-relations requires --input <reviewed-or-queue-official-blogs.json>.");
    }
    const rootDir = path.resolve(args["repo-root"] || process.cwd());
    const resolvedInputPath = path.resolve(inputPath);
    const outputPath = typeof args.output === "string" ? args.output : "";
    assertOfficialBlogSuggestRelationsOutputPath({ outputPath, rootDir });
    const input = JSON.parse(fs.readFileSync(resolvedInputPath, "utf8"));
    const existingIndex = await loadOfficialBlogKnowledge({
      rootDir,
      knowledgeDir: args["knowledge-dir"] ? path.resolve(args["knowledge-dir"]) : undefined
    });
    const relationshipSuggestions = createOfficialBlogRelationshipSuggestions(input, {
      existingIndex,
      generatedAt: args["generated-at"],
      maxSuggestions: args.limit || args["max-suggestions"]
    });
    printJson({
      ok: true,
      input_path: resolvedInputPath,
      relationship_suggestions: relationshipSuggestions
    }, outputPath);
  } else if (command === "official-blog:context") {
    const args = parseArgs(argv);
    const inputPath = args.input || firstJsonPath(argv);
    if (!inputPath) {
      throw new PublisherError("official_blog_context_input_required", "official-blog:context requires --input <local-report-or-candidates.json>.");
    }
    const rootDir = path.resolve(args["repo-root"] || process.cwd());
    const resolvedInputPath = path.resolve(inputPath);
    const outputPath = typeof args.output === "string" ? args.output : "";
    assertOfficialBlogContextOutputPath({ outputPath, rootDir });
    const inputRaw = fs.readFileSync(resolvedInputPath, "utf8");
    const input = JSON.parse(inputRaw);
    const existingIndex = await loadOfficialBlogKnowledge({
      rootDir,
      knowledgeDir: args["knowledge-dir"] ? path.resolve(args["knowledge-dir"]) : undefined
    });
    const context = createOfficialBlogKnowledgeContext(input, {
      existingIndex,
      generatedAt: args["generated-at"],
      limit: args.limit || args["max-records"]
    });
    const inputReportDate = input?.report_date || input?.reportDate || "";
    if (args.date && !inputReportDate) {
      throw new PublisherError(
        "official_blog_context_report_date_missing",
        "official-blog:context input must declare report_date when --date is provided."
      );
    }
    if (args.date && inputReportDate && args.date !== inputReportDate) {
      throw new PublisherError(
        "official_blog_context_report_date_mismatch",
        `official-blog:context input report_date ${inputReportDate} does not match --date ${args.date}.`
      );
    }
    const reportDate = args.date || inputReportDate;
    const bindings = officialBlogDailyContextBindings(input, context);
    const contextSha256 = createHash("sha256").update(JSON.stringify(context)).digest("hex");
    printJson({
      ok: true,
      kind: "official_blog_daily_context",
      ...(reportDate ? { report_date: reportDate } : {}),
      generated_at: args["generated-at"] || context.generated_at,
      input_path: resolvedInputPath,
      source_artifact_path: officialBlogArtifactPath(rootDir, resolvedInputPath),
      source_artifact_sha256: createHash("sha256").update(inputRaw).digest("hex"),
      context_sha256: contextSha256,
      bindings_sha256: createHash("sha256").update(JSON.stringify(bindings)).digest("hex"),
      bindings,
      context
    }, outputPath);
  } else if (command === "official-blog:review-packet") {
    const args = parseArgs(argv);
    const inputPath = args.input || firstJsonPath(argv);
    if (!inputPath) {
      throw new PublisherError("official_blog_review_packet_input_required", "official-blog:review-packet requires --input <candidate-previews-or-intake.json>.");
    }
    const rootDir = path.resolve(args["repo-root"] || process.cwd());
    const resolvedInputPath = path.resolve(inputPath);
    const outputPath = typeof args.output === "string" ? args.output : "";
    assertOfficialBlogReviewPacketOutputPath({ outputPath, rootDir });
    const input = JSON.parse(fs.readFileSync(resolvedInputPath, "utf8"));
    const existingIndex = await loadOfficialBlogKnowledge({
      rootDir,
      knowledgeDir: args["knowledge-dir"] ? path.resolve(args["knowledge-dir"]) : undefined
    });
    const reviewPacket = createOfficialBlogReviewPacket(input, {
      existingIndex,
      reportDate: args.date || firstPositionalDate(argv),
      generatedAt: args["generated-at"]
    });
    printJson({
      ok: true,
      input_path: resolvedInputPath,
      review_packet: reviewPacket
    }, outputPath);
  } else if (command === "official-blog:review-decisions") {
    const args = parseArgs(argv);
    const packetPath = args.packet || args["review-packet"];
    const inputPath = args.input || firstJsonPath(argv);
    if (!packetPath) {
      throw new PublisherError("official_blog_review_decisions_packet_required", "official-blog:review-decisions requires --packet <official-blog-review-packet.json>.");
    }
    if (!inputPath) {
      throw new PublisherError("official_blog_review_decisions_input_required", "official-blog:review-decisions requires --input <ai-review-decisions.json>.");
    }
    const rootDir = path.resolve(args["repo-root"] || process.cwd());
    const resolvedPacketPath = path.resolve(packetPath);
    const resolvedInputPath = path.resolve(inputPath);
    const outputPath = typeof args.output === "string" ? args.output : "";
    assertOfficialBlogReviewDecisionsOutputPath({ outputPath, rootDir });
    const packet = JSON.parse(fs.readFileSync(resolvedPacketPath, "utf8"));
    const input = JSON.parse(fs.readFileSync(resolvedInputPath, "utf8"));
    const reviewDecisionInput = Array.isArray(input)
      ? { review_packet: packet, decisions: input }
      : {
          ...input,
          review_packet: packet
        };
    const reviewDecisions = createOfficialBlogReviewDecisions(reviewDecisionInput, {
      reportDate: args.date || firstPositionalDate(argv),
      generatedAt: args["generated-at"]
    });
    printJson({
      ok: true,
      packet_path: resolvedPacketPath,
      input_path: resolvedInputPath,
      review_decisions: reviewDecisions
    }, outputPath);
  } else if (command === "official-blog:authoring-brief") {
    const args = parseArgs(argv);
    const inputPath = args.input || args.decisions || firstJsonPath(argv);
    if (!inputPath) {
      throw new PublisherError("official_blog_authoring_brief_input_required", "official-blog:authoring-brief requires --input <official-blog-review-decisions.json>.");
    }
    const rootDir = path.resolve(args["repo-root"] || process.cwd());
    const resolvedInputPath = path.resolve(inputPath);
    const relationsPath = args.relations || args["relationship-suggestions"] || args["relationship-suggestions-input"];
    const resolvedRelationsPath = relationsPath ? path.resolve(relationsPath) : "";
    const outputPath = typeof args.output === "string" ? args.output : "";
    assertOfficialBlogAuthoringBriefOutputPath({ outputPath, rootDir });
    const input = JSON.parse(fs.readFileSync(resolvedInputPath, "utf8"));
    const relationshipSuggestions = resolvedRelationsPath
      ? officialBlogAuthoringBriefRelationshipInput(JSON.parse(fs.readFileSync(resolvedRelationsPath, "utf8")))
      : null;
    const authoringBriefInput = input?.kind === "official_blog_review_decisions"
      ? { review_decisions: input }
      : { ...input };
    if (relationshipSuggestions) {
      authoringBriefInput.relationship_suggestions = relationshipSuggestions;
    }
    const authoringBrief = createOfficialBlogAuthoringBrief(authoringBriefInput, {
      reportDate: args.date || firstPositionalDate(argv),
      generatedAt: args["generated-at"]
    });
    printJson({
      ok: true,
      input_path: resolvedInputPath,
      relations_path: resolvedRelationsPath,
      authoring_brief: authoringBrief
    }, outputPath);
  } else if (command === "official-blog:reviewed-authoring") {
    const args = parseArgs(argv);
    const inputPath = args.input || args["authoring-brief"] || firstJsonPath(argv);
    if (!inputPath) {
      throw new PublisherError("official_blog_reviewed_authoring_input_required", "official-blog:reviewed-authoring requires --input <official-blog-authoring-brief.json>.");
    }
    const rootDir = path.resolve(args["repo-root"] || process.cwd());
    const resolvedInputPath = path.resolve(inputPath);
    const outputPath = typeof args.output === "string" ? args.output : "";
    assertOfficialBlogReviewedAuthoringOutputPath({ outputPath, rootDir });
    const input = JSON.parse(fs.readFileSync(resolvedInputPath, "utf8"));
    const reviewedAuthoring = createOfficialBlogReviewedAuthoring(input, {
      reportDate: args.date || firstPositionalDate(argv),
      generatedAt: args["generated-at"]
    });
    printJson({
      ok: true,
      input_path: resolvedInputPath,
      reviewed_authoring: reviewedAuthoring
    }, outputPath);
  } else if (command === "preflight:worktree") {
    const args = parseArgs(argv);
    const result = await checkWorktreePreflight({
      repoRoot: path.resolve(args["repo-root"] || process.cwd()),
      remote: args.remote || "origin",
      baseBranch: args["base-branch"] || "main",
      allowDirty: Boolean(args["allow-dirty"]),
      fetchRemote: !args["no-fetch"]
    });
    printJson(result);
    if (!result.ok) {
      process.exitCode = 1;
    }
  } else if (command === "source-reset:preflight") {
    const args = parseArgs(argv);
    const result = await checkSourceResetPreflight({
      rootDir: path.resolve(args["repo-root"] || process.cwd())
    });
    printJson(result);
    if (!result.ok) {
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
      forceInstall: Boolean(args["force-install"]),
      pnpmStoreDir: args["pnpm-store-dir"]
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
      canonical_url: result.report.canonical_url,
      quality_status: result.report.quality_status || null,
      degraded_sections: result.report.quality_status?.degraded_sections || []
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
      allowDegradedInputs: Boolean(args["allow-degraded-inputs"]),
      officialBlogContextPath: args["official-blog-context"],
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
      official_blog_context: result.officialBlogContextReceipt,
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
      retryDelayMs: Number.parseInt(args["retry-delay-ms"] || "1500", 10),
      env: process.env
    });
    printJson({
      ok: true,
      ...result
    });
  } else if (command === "discover:github-watch") {
    const args = parseArgs(argv);
    const reportDate = args.date || firstPositionalDate(argv);
    const generatedAt = args["generated-at"] || firstPositionalDateTime(argv);
    const watchlistPath = args.config || args.watchlist || firstSourceWatchConfigPath(argv);
    const fixtureDir = args["fixture-dir"] || firstSourceWatchFixtureDir(argv);
    const outputPath = args.output || args.out || path.join(".tmp", `source-candidates-${reportDate}.github-watch.json`);
    const fetchImpl = fixtureDir ? await createSourceWatchFixtureFetch(fixtureDir) : undefined;
    const result = await collectSourceWatch({
      rootDir: path.resolve(args["repo-root"] || process.cwd()),
      reportDate,
      generatedAt,
      watchlistPath,
      fixtureDir,
      fetchImpl,
      fetchRetries: Number.parseInt(args["fetch-retries"] || "1", 10),
      retryDelayMs: Number.parseInt(args["retry-delay-ms"] || "1500", 10),
      endpointLimit: Number.parseInt(args["endpoint-limit"] || "5", 10),
      env: process.env
    });
    const resolvedOutputPath = path.resolve(outputPath);
    const artifact = {
      ok: true,
      output_path: resolvedOutputPath,
      ...result
    };
    const artifactJson = `${JSON.stringify(artifact, null, 2)}\n`;
    fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true });
    fs.writeFileSync(resolvedOutputPath, artifactJson, "utf8");
    process.stdout.write(`${JSON.stringify({
      ok: true,
      kind: "source_watch_artifact_receipt",
      report_date: result.report_date,
      output_path: resolvedOutputPath,
      artifact_sha256: createHash("sha256").update(artifactJson).digest("hex"),
      candidate_count: Array.isArray(result.candidates) ? result.candidates.length : 0
    }, null, 2)}\n`);
  } else if (command === "discover:huggingface-trending") {
    const args = parseArgs(argv);
    const result = await collectHuggingFaceTrending({
      reportDate: args.date || firstPositionalDate(argv),
      generatedAt: args["generated-at"],
      limit: Number.parseInt(args.limit || firstPositiveInteger(argv) || "20", 10),
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
  } else if (command === "discover:china-ai") {
    const args = parseArgs(argv);
    const positionalNumbers = positiveIntegers(argv);
    const result = await collectContentSources({
      rootDir: path.resolve(args["repo-root"] || process.cwd()),
      reportDate: args.date || firstPositionalDate(argv),
      generatedAt: args["generated-at"],
      sourcesPath: args.sources || path.join("config", "sources", "china-ai-sources.json"),
      registryPath: args.registry,
      auditGroupName: "china_ai_sources",
      enablement: args.enablement || firstEnablement(argv) || "core,optional",
      includeWeChatInput: false,
      limit: Number.parseInt(args.limit || positionalNumbers[0] || "30", 10),
      perSourceLimit: Number.parseInt(args["per-source-limit"] || positionalNumbers[1] || "3", 10),
      budgetMs: Number.parseInt(args["budget-ms"] || positionalNumbers[2] || "180000", 10),
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
      sourceIds: splitCliList(args["source-id"] || args["source-ids"] || args.source || args.id),
      sourceKinds: splitCliList(args["source-kind"] || args["source-kinds"] || args.kind),
      tiers: splitCliList(args.tier || args.tiers),
      categories: splitCliList(args.category || args.categories || args["candidate-category"]),
      tags: splitCliList(args.tag || args.tags || args.signal || args["source-level"]),
      filterTokens: sourceHealthFilterTokens(argv),
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
      days: Number.parseInt(args.days || positionalNumbers[0] || "3", 10),
      logicalSourceId: args["logical-source"] || "",
      publicArticlesPath: args["public-articles"] || ""
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
      verifyPages: args["skip-pages-verify"] !== true
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
      verifyPages: args["skip-pages-verify"] !== true
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
  } else if (command === "publish:verify-pages") {
    const args = parseArgs(argv);
    const reportDate = args.date || firstPositionalDate(argv);
    const pagesUrl = args.url || (reportDate ? canonicalReportUrl(args["site-url"] || DEFAULT_SITE.siteUrl, reportDate) : "");
    if (!pagesUrl) {
      throw new PublisherError("pages_url_required", "publish:verify-pages requires --url or --date.");
    }
    const verification = await verifyPublishedUrl(pagesUrl, {
      attempts: Number.parseInt(args.attempts || "12", 10),
      intervalMs: Number.parseInt(args["interval-ms"] || "5000", 10),
      expectedText: args["expected-text"] || reportDate || "",
      fetchImpl: globalThis.fetch
    });
    const verificationError = verification.ok ? "" : `pages_verification_failed: ${verification.error || "unknown"}`;
    printJson({
      ok: Boolean(verification.ok),
      publish_status: {
        html_generated: false,
        repo_updated: false,
        repo_pushed: false,
        pages_url: pagesUrl,
        publish_error: verificationError,
        error_code: verification.ok ? "" : "pages_cache_delay",
        publish_mode: "pages-verify"
      },
      pages_url: pagesUrl,
      http_status: verification.status || 0,
      verification_error: verificationError,
      result: {
        pages_url: pagesUrl,
        pages_verified: Boolean(verification.ok),
        http_status: verification.status || 0,
        verification_error: verificationError
      }
    });
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

function firstJsonPath(args) {
  return positionalArgs(args).find((token) => /\.json$/i.test(token));
}

function firstSourcePath(args) {
  return positionalArgs(args).find((token) => /\.json$/i.test(token) || /(^|[\\/])sources([\\/]|$)/i.test(token));
}

function firstHistoryPath(args) {
  return positionalArgs(args).find((token) => /(^|[\\/])reports-data([\\/]|$)|^reports-data$/i.test(token));
}

function firstSourceWatchConfigPath(args) {
  return positionalArgs(args).find((token) =>
    /\.json$/i.test(token) &&
    !/source-candidates-\d{4}-\d{2}-\d{2}\.github-watch\.json$/i.test(path.basename(token))
  );
}

function firstSourceWatchFixtureDir(args) {
  return positionalArgs(args).find((token) => {
    if (/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(token) || /\.json$/i.test(token)) {
      return false;
    }
    return fs.existsSync(path.join(token, "fixtures.json"));
  });
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

function splitCliList(value) {
  if (!value || value === true) {
    return [];
  }
  return String(value).split(",").map((token) => token.trim()).filter(Boolean);
}

function sourceHealthFilterTokens(args) {
  return positionalArgs(args).filter((token) => {
    const value = String(token || "").trim();
    if (!value) {
      return false;
    }
    if (/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(value)) {
      return false;
    }
    if (/^(core|optional|manual)(,(core|optional|manual))*$/.test(value)) {
      return false;
    }
    if (/^\d+$/.test(value)) {
      return false;
    }
    if (/\.json$/i.test(value) || /(^|[\\/])sources([\\/]|$)/i.test(value) || /(^|[\\/])reports-data([\\/]|$)|^reports-data$/i.test(value)) {
      return false;
    }
    return true;
  });
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

function uniqueStrings(values) {
  return Array.from(new Set(values.filter(Boolean)));
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
  if (isOfficialBlogInternalCommand(command) && typeof parsed.output === "string" && parsed.output.trim()) {
    const rootDir = path.resolve(parsed["repo-root"] || process.cwd());
    return isOfficialBlogInternalPublicOutputPath(parsed.output, rootDir) ? "" : parsed.output;
  }
  return typeof parsed.output === "string" && parsed.output.trim() ? parsed.output : "";
}

function assertOfficialBlogIntakeOutputPath(options = {}) {
  assertOfficialBlogInternalOutputPath({
    ...options,
    errorCode: "official_blog_intake_public_output_forbidden",
    message: "official-blog:intake writes internal candidate and triage data; choose an internal output path outside docs/data, docs/official-blogs, and public HTML."
  });
}

function assertOfficialBlogParseFeedOutputPath(options = {}) {
  assertOfficialBlogInternalOutputPath({
    ...options,
    errorCode: "official_blog_parse_feed_public_output_forbidden",
    message: "official-blog:parse-feed writes internal preview candidate data; choose an internal output path outside docs/data, docs/official-blogs, and public HTML."
  });
}

function assertOfficialBlogReviewSessionOutputPath(options = {}) {
  assertOfficialBlogInternalOutputPath({
    ...options,
    errorCode: "official_blog_review_session_public_output_forbidden",
    message: "official-blog:review-session writes internal preview, triage, and AI review packet data; choose an internal output path outside docs/data, docs/official-blogs, and public HTML."
  });
}

function assertOfficialBlogReviewHandoffOutputPath(options = {}) {
  assertOfficialBlogInternalOutputPath({
    ...options,
    errorCode: "official_blog_review_handoff_public_output_forbidden",
    message: "official-blog:review-handoff writes internal AI review prompt and decision template data; choose an internal output path outside docs/data, docs/official-blogs, and public HTML."
  });
}

function assertOfficialBlogAuthorRecordsOutputPath(options = {}) {
  assertOfficialBlogInternalOutputPath({
    outputPath: options.outputPath,
    rootDir: options.rootDir,
    errorCode: "official_blog_author_records_public_output_forbidden",
    message: "official-blog:author-records writes reviewed knowledge authoring output; choose an output path outside docs/data, docs/official-blogs, and public HTML."
  });
  assertOfficialBlogInternalOutputPath({
    outputPath: options.outputDir,
    rootDir: options.rootDir,
    errorCode: "official_blog_author_records_public_output_forbidden",
    message: "official-blog:author-records writes reviewed knowledge authoring output; choose an output directory outside docs/data, docs/official-blogs, and public HTML."
  });
}

function assertOfficialBlogSuggestRelationsOutputPath(options = {}) {
  assertOfficialBlogInternalOutputPath({
    ...options,
    errorCode: "official_blog_suggest_relations_public_output_forbidden",
    message: "official-blog:suggest-relations writes internal relationship suggestion data; choose an internal output path outside docs/data, docs/official-blogs, and public HTML."
  });
}

function assertOfficialBlogContextOutputPath(options = {}) {
  assertOfficialBlogInternalOutputPath({
    ...options,
    errorCode: "official_blog_context_public_output_forbidden",
    message: "official-blog:context writes internal knowledge context data; choose an internal output path outside docs/data, docs/official-blogs, and public HTML."
  });
}

function assertOfficialBlogReviewPacketOutputPath(options = {}) {
  assertOfficialBlogInternalOutputPath({
    ...options,
    errorCode: "official_blog_review_packet_public_output_forbidden",
    message: "official-blog:review-packet writes internal AI review packet data; choose an internal output path outside docs/data, docs/official-blogs, and public HTML."
  });
}

function assertOfficialBlogReviewDecisionsOutputPath(options = {}) {
  assertOfficialBlogInternalOutputPath({
    ...options,
    errorCode: "official_blog_review_decisions_public_output_forbidden",
    message: "official-blog:review-decisions writes internal AI review decision data; choose an internal output path outside docs/data, docs/official-blogs, and public HTML."
  });
}

function officialBlogAuthoringBriefRelationshipInput(input = {}) {
  if (input?.kind === "official_blog_relationship_suggestions") {
    return input;
  }
  if (input?.relationship_suggestions?.kind === "official_blog_relationship_suggestions") {
    return input.relationship_suggestions;
  }
  if (input?.relationshipSuggestions?.kind === "official_blog_relationship_suggestions") {
    return input.relationshipSuggestions;
  }
  return input;
}

function officialBlogReviewSessionManifestFeeds(manifest = {}, manifestDir = process.cwd()) {
  const feeds = Array.isArray(manifest.feeds) ? manifest.feeds : [];
  if (feeds.length === 0) {
    throw new PublisherError("official_blog_review_session_feeds_required", "official-blog:review-session manifest requires a non-empty feeds array.");
  }

  return feeds.map((feed, index) => {
    const feedPath = officialBlogReviewSessionManifestFeedPath(feed);
    if (!feedPath) {
      throw new PublisherError("official_blog_review_session_feed_path_required", `official-blog:review-session feed at index ${index} requires file/path/feed_path/input.`);
    }
    const resolvedFeedPath = path.resolve(manifestDir, feedPath);
    return {
      company: feed.company,
      source_label: feed.source_label || feed.sourceLabel || feed.source || path.basename(resolvedFeedPath),
      feed_text: fs.readFileSync(resolvedFeedPath, "utf8")
    };
  });
}

function officialBlogReviewSessionManifestFeedPath(feed = {}) {
  return String(feed.file || feed.path || feed.feed_path || feed.feedPath || feed.input || "").trim();
}

function officialBlogArtifactPath(rootDir, filePath) {
  const resolvedRoot = path.resolve(rootDir);
  const resolvedFile = path.resolve(filePath);
  const relative = path.relative(resolvedRoot, resolvedFile);
  if (relative && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) {
    return relative.split(path.sep).join("/");
  }
  return resolvedFile.split(path.sep).join("/");
}

function officialBlogDailyContextBindings(input = {}, context = {}) {
  const entries = officialBlogDailyContextEntries(input);
  return (Array.isArray(context.records) ? context.records : []).map((record) => {
    const sourceEntries = (Array.isArray(record.source_entry_indexes) ? record.source_entry_indexes : [])
      .map((index) => entries[index])
      .filter((entry) => entry && typeof entry === "object");
    const candidateIds = uniqueStrings(sourceEntries.map((entry) => String(entry.id || entry.candidate_id || "").trim()));
    const normalizedUrls = uniqueStrings(sourceEntries.map((entry) => officialBlogBindingUrl(entry)).filter(Boolean));
    return {
      record_id: String(record.id || ""),
      content_type: String(record.content_type || ""),
      score: Number.isFinite(Number(record.score)) ? Number(record.score) : 0,
      candidate_ids: candidateIds,
      normalized_urls: normalizedUrls
    };
  }).filter((binding) => binding.record_id);
}

function officialBlogDailyContextEntries(input = {}) {
  if (Array.isArray(input)) return input;
  if (!input || typeof input !== "object") return [];
  const entries = [];
  for (const key of [
    "context_entries",
    "contextEntries",
    "entries",
    "reviewed_entries",
    "reviewedEntries",
    "review_queue",
    "reviewQueue",
    "records",
    "candidates",
    "items",
    "stories",
    "main_items",
    "hot_blogs",
    "official_org_updates"
  ]) {
    if (Array.isArray(input[key])) entries.push(...input[key]);
  }
  return entries;
}

function officialBlogBindingUrl(entry = {}) {
  const value = entry.normalized_url
    || entry.canonical_url
    || entry.url
    || entry.primary_url
    || entry.original_url
    || "";
  if (!value) return "";
  try {
    return normalizeOfficialBlogUrl(value);
  } catch {
    return "";
  }
}

function assertOfficialBlogAuthoringBriefOutputPath(options = {}) {
  assertOfficialBlogInternalOutputPath({
    ...options,
    errorCode: "official_blog_authoring_brief_public_output_forbidden",
    message: "official-blog:authoring-brief writes internal authoring handoff data; choose an internal output path outside docs/data, docs/official-blogs, and public HTML."
  });
}

function assertOfficialBlogReviewedAuthoringOutputPath(options = {}) {
  assertOfficialBlogInternalOutputPath({
    ...options,
    errorCode: "official_blog_reviewed_authoring_public_output_forbidden",
    message: "official-blog:reviewed-authoring writes internal reviewed authoring data; choose an internal output path outside docs/data, docs/official-blogs, and public HTML."
  });
}

function assertOfficialBlogInternalOutputPath(options = {}) {
  const outputPath = String(options.outputPath || "").trim();
  if (!outputPath) {
    return;
  }
  const rootDir = path.resolve(options.rootDir || process.cwd());
  if (isOfficialBlogInternalPublicOutputPath(outputPath, rootDir)) {
    throw new PublisherError(
      options.errorCode,
      options.message
    );
  }
}

function isOfficialBlogIntakePublicOutputPath(outputPath, rootDir) {
  return isOfficialBlogInternalPublicOutputPath(outputPath, rootDir);
}

function isOfficialBlogInternalCommand(value) {
  return value === "official-blog:intake" ||
    value === "official-blog:parse-feed" ||
    value === "official-blog:review-session" ||
    value === "official-blog:review-handoff" ||
    value === "official-blog:author-records" ||
    value === "official-blog:suggest-relations" ||
    value === "official-blog:context" ||
    value === "official-blog:review-packet" ||
    value === "official-blog:review-decisions" ||
    value === "official-blog:authoring-brief" ||
    value === "official-blog:reviewed-authoring";
}

function isOfficialBlogInternalPublicOutputPath(outputPath, rootDir) {
  const resolved = path.resolve(outputPath);
  const publicRoot = path.resolve(rootDir, "docs");
  const relative = path.relative(publicRoot, resolved).split(path.sep).join("/");
  const insidePublicRoot = relative === "" || (!relative.startsWith("../") && relative !== ".." && !path.isAbsolute(relative));
  if (!insidePublicRoot) {
    return false;
  }

  const normalized = relative.toLowerCase();
  return (
    normalized === "data" ||
    normalized.startsWith("data/") ||
    normalized === "official-blogs" ||
    normalized.startsWith("official-blogs/") ||
    normalized.endsWith(".html")
  );
}

function countBy(items, key) {
  const counts = {};
  for (const item of items) {
    const value = item?.[key] || "unspecified";
    counts[value] = (counts[value] || 0) + 1;
  }
  return counts;
}
