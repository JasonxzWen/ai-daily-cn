#!/usr/bin/env node
import path from "node:path";
import { DEFAULT_SITE } from "./config.js";
import { PublisherError, toPublishError } from "./errors.js";
import {
  checkPublishPreflight,
  createPublishPlan,
  preparePublishWorktree,
  publishGeneratedArtifacts
} from "./publish.js";
import { assemblePrompt } from "./prompt.js";
import { collectGitHubTrending } from "./discovery.js";
import { writeReportDraft } from "./report.js";
import { buildSite } from "./site.js";

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
  } else if (command === "publish:dry-run") {
    const args = parseArgs(argv);
    const plan = await createPublishPlan({
      repoRoot: path.resolve(args["repo-root"] || process.cwd()),
      inputDir: args.input || "reports-source",
      dataInputDir: args["data-input"] || "reports-data",
      outDir: args.out || "docs",
      siteUrl: args["site-url"] || DEFAULT_SITE.siteUrl,
      allowedBranch: args.branch || DEFAULT_SITE.publishBranch,
      generatedAt: args["generated-at"]
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
      reportDate: args.date || firstPositionalDate(argv),
      siteUrl: args["site-url"] || DEFAULT_SITE.siteUrl,
      generatedAt: args["generated-at"] || firstPositionalDateTime(argv)
    });
    printJson({
      ok: true,
      report_date: result.report.report_date,
      path: result.path,
      canonical_url: result.report.canonical_url
    });
  } else if (command === "discover:github-trending") {
    const args = parseArgs(argv);
    const positional = positionalArgs(argv);
    const result = await collectGitHubTrending({
      limit: Number.parseInt(args.limit || positional[0] || "50", 10)
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
        repo_updated: result.committed,
        repo_pushed: result.pushed,
        pages_url: result.pages_url || "",
        publish_error: result.verification_error || ""
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
  printJson({
    ok: false,
    error: error instanceof PublisherError ? error.code : "unexpected_error",
    message: error.message,
    details: error.details || undefined,
    publish_status: {
      html_generated: false,
      repo_updated: false,
      repo_pushed: false,
      pages_url: "",
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

function positionalArgs(args) {
  return args.filter((token) => !token.startsWith("--"));
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}
