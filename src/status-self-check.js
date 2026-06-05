import fs from "node:fs/promises";
import path from "node:path";
import { defaultAutomationsDir, inspectAutomationInventory } from "./automation-inventory.js";
import { DEFAULT_SITE } from "./config.js";
import { PublisherError } from "./errors.js";
import { createDailyPublishPlan, prepareCleanPublishWorktree } from "./publish.js";
import { buildSite } from "./site.js";
import { checkSourcesHealth } from "./source-health.js";
import { validateSourceRegistryPath } from "./source-registry.js";
import { isValidDateString } from "./time.js";
import { validateDailyWorkflowContract } from "./workflow-contract.js";

const REQUIRED_DOC_FILES = ["docs/index.html", "docs/feed.json", "docs/trends.json"];

export async function runStatusSelfCheck(options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const reportDate = requireReportDate(options.reportDate || defaultShanghaiDate());
  const generatedAt = options.generatedAt || new Date().toISOString();
  const blockingIssues = [];
  const degradedSections = [];
  const checks = [];

  const cleanWorktree = await resolveCheckRoot({ rootDir, options, checks });
  if (cleanWorktree.failed) {
    blockingIssues.push({
      code: "prepare_clean_publish_worktree_failed",
      section: "publish",
      message: "clean publish worktree preparation failed",
      error: cleanWorktree.error
    });
  }
  const checkRoot = cleanWorktree.repoRoot;
  const [year, month] = reportDate.split("-");
  const paths = {
    report_json: path.join(checkRoot, "reports-data", year, month, `${reportDate}.json`),
    docs_json: path.join(checkRoot, "docs", "data", year, month, `${reportDate}.json`),
    html: path.join(checkRoot, "docs", "reports", year, month, `${reportDate}.html`),
    index: path.join(checkRoot, "docs", "index.html"),
    feed: path.join(checkRoot, "docs", "feed.json"),
    trends: path.join(checkRoot, "docs", "trends.json")
  };

  const report = await readReport(paths.report_json, blockingIssues);
  await checkRequiredFiles({ rootDir: checkRoot, reportDate, paths, blockingIssues, checks });
  collectQualityIssues(report, blockingIssues, degradedSections);

  const workflow = await runCheck("workflow_validate", checks, () =>
    (options.validateWorkflowImpl || validateDailyWorkflowContract)({
      rootDir: checkRoot,
      automationPromptPath: options.automationPromptPath,
      automationsDir: options.automationsDir
    })
  );
  if (workflow.failed || workflow.output?.ok === false) {
    blockingIssues.push({
      code: "workflow_validate_failed",
      section: "workflow",
      message: "workflow contract validation failed",
      failures: workflow.output?.failures || [workflow.error].filter(Boolean)
    });
  }

  const sourcesValidate = await runCheck("sources_validate", checks, () =>
    (options.validateSourcesImpl || validateSourceRegistryPath)({
      rootDir: checkRoot,
      sourcesPath: options.sourcesPath || "config/sources"
    })
  );
  if (sourcesValidate.failed || sourcesValidate.output?.ok === false) {
    blockingIssues.push({
      code: "sources_validate_failed",
      section: "sources",
      message: "source registry validation failed",
      failures: sourcesValidate.output?.failures || [sourcesValidate.error].filter(Boolean)
    });
  }

  const build = await runCheck("build", checks, () =>
    (options.buildSiteImpl || buildSite)({
      rootDir: checkRoot,
      inputDir: options.inputDir || "reports-source",
      dataInputDir: options.dataInputDir || "reports-data",
      outDir: options.outDir || "docs",
      siteUrl: options.siteUrl || DEFAULT_SITE.siteUrl,
      generatedAt
    })
  );
  if (build.failed) {
    blockingIssues.push({
      code: "build_failed",
      section: "build",
      message: "static site build failed",
      error: build.error
    });
  } else if (Array.isArray(build.output?.writtenFiles) && build.output.writtenFiles.length > 0) {
    degradedSections.push({
      code: "build_wrote_files",
      section: "build",
      count: build.output.writtenFiles.length,
      message: "self-check build wrote files in the worktree"
    });
  }

  const health = await runCheck("sources_health", checks, () =>
    (options.checkSourcesHealthImpl || checkSourcesHealth)({
      rootDir: checkRoot,
      reportDate,
      sourcesPath: options.sourcesPath || "config/sources",
      enablement: options.enablement || "core,optional,manual",
      fetchImpl: options.sourceFetchImpl || options.fetchImpl
    })
  );
  const sourceHealth = summarizeSourcesHealth(health.output);
  if (health.failed) {
    blockingIssues.push({
      code: "sources_health_failed",
      section: "sources_health",
      message: "sources health check failed",
      error: health.error
    });
  } else if ((sourceHealth.status_counts.blocked || 0) > 0) {
    degradedSections.push({
      code: "sources_health_blocked",
      section: "sources_health",
      count: sourceHealth.status_counts.blocked,
      message: "one or more configured sources are blocked"
    });
  }

  const dryRun = await runCheck("publish_dry_run_daily", checks, () =>
    (options.createDailyPublishPlanImpl || createDailyPublishPlan)({
      repoRoot: checkRoot,
      inputDir: options.inputDir || "reports-source",
      dataInputDir: options.dataInputDir || "reports-data",
      outDir: options.outDir || "docs",
      siteUrl: options.siteUrl || DEFAULT_SITE.siteUrl,
      generatedAt,
      reportDate
    })
  );
  if (dryRun.failed) {
    blockingIssues.push({
      code: "publish_dry_run_daily_failed",
      section: "publish",
      message: "date-scoped publish dry-run failed",
      error: dryRun.error
    });
  }

  const pages = await checkPages({
    report,
    reportDate,
    fetchImpl: options.fetchImpl || globalThis.fetch
  });
  checks.push(pages);
  if (pages.status === "failed") {
    blockingIssues.push({
      code: "pages_verification_failed",
      section: "pages",
      message: pages.message,
      url: pages.url
    });
  }

  const automation = await inspectAutomationInventory({
    automationsDir: options.automationsDir || defaultAutomationsDir(),
    projectCwds: options.projectCwds
  });
  checks.push({
    id: "automation_inventory",
    status: automation.available ? "passed" : "warning",
    output: automation
  });
  if (!automation.available) {
    degradedSections.push({
      code: "automation_inventory_unavailable",
      section: "automation",
      message: automation.error || "automation inventory was not available"
    });
  } else {
    if (automation.active_publish_automations.length > 1) {
      blockingIssues.push({
        code: "multiple_active_daily_publish_automations",
        section: "automation",
        count: automation.active_publish_automations.length,
        ids: automation.active_publish_automations.map((item) => item.id),
        message: "multiple active daily publish automations are configured"
      });
    }
    const legacy = automation.active_publish_automations.filter((item) => item.legacy_flow);
    if (legacy.length > 0) {
      blockingIssues.push({
        code: "legacy_daily_publish_automation_active",
        section: "automation",
        ids: legacy.map((item) => item.id),
        message: "legacy daily publish automation is still active"
      });
    }
  }

  const status = blockingIssues.length > 0
    ? "blocked"
    : degradedSections.length > 0
      ? "degraded"
      : "ok";
  const result = {
    ok: status !== "blocked",
    status,
    report_date: reportDate,
    generated_at: generatedAt,
    launcher_root: rootDir.replace(/\\/g, "/"),
    checked_repo_root: checkRoot.replace(/\\/g, "/"),
    clean_worktree: cleanWorktree.output || null,
    paths: portablePaths(paths),
    quality_status: report?.quality_status || null,
    source_health: sourceHealth,
    automation,
    checks,
    blocking_issues: uniqueIssues(blockingIssues),
    degraded_sections: uniqueIssues(degradedSections)
  };

  if (options.outputPath) {
    const outputPath = path.resolve(rootDir, options.outputPath);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  }
  return result;
}

async function resolveCheckRoot({ rootDir, options, checks }) {
  if (options.cleanWorktree === false) {
    const output = {
      mode: "launcher-worktree",
      repo_root: rootDir,
      launcher_repo_root: rootDir
    };
    checks.push({
      id: "prepare_clean_publish_worktree",
      status: "skipped",
      output
    });
    return { failed: false, repoRoot: rootDir, output };
  }

  const prepared = await runCheck("prepare_clean_publish_worktree", checks, () =>
    (options.prepareCleanPublishWorktreeImpl || prepareCleanPublishWorktree)({
      repoRoot: rootDir,
      allowedBranch: options.allowedBranch || DEFAULT_SITE.publishBranch,
      worktreeDir: options.worktreeDir,
      allowExternalWorktree: options.allowExternalWorktree,
      installDependencies: options.installDependencies,
      forceInstall: options.forceInstall,
      npmCache: options.npmCache
    })
  );
  const repoRoot = path.resolve(prepared.output?.repo_root || prepared.output?.next_cwd || rootDir);
  return {
    failed: prepared.failed,
    error: prepared.error,
    repoRoot,
    output: prepared.output || null
  };
}

async function readReport(reportPath, blockingIssues) {
  try {
    return JSON.parse(await fs.readFile(reportPath, "utf8"));
  } catch (error) {
    blockingIssues.push({
      code: error.code === "ENOENT" ? "report_json_missing" : "report_json_unreadable",
      section: "report",
      path: reportPath,
      message: error.message
    });
    return null;
  }
}

async function checkRequiredFiles({ rootDir, reportDate, paths, blockingIssues, checks }) {
  const files = [
    { id: "reports_data_json", path: paths.report_json, mustContain: reportDate },
    { id: "docs_data_json", path: paths.docs_json, mustContain: reportDate },
    { id: "daily_html", path: paths.html, mustContain: reportDate },
    ...REQUIRED_DOC_FILES.map((file) => ({
      id: file.replace(/[/.]/g, "_"),
      path: path.join(rootDir, file),
      mustContain: reportDate
    }))
  ];

  for (const file of files) {
    try {
      const text = await fs.readFile(file.path, "utf8");
      const containsDate = text.includes(file.mustContain);
      checks.push({
        id: file.id,
        status: containsDate ? "passed" : "failed",
        path: file.path,
        contains_date: containsDate
      });
      if (!containsDate) {
        blockingIssues.push({
          code: "artifact_date_missing",
          section: "artifacts",
          path: file.path,
          message: `${file.id} does not contain ${file.mustContain}`
        });
      }
    } catch (error) {
      checks.push({
        id: file.id,
        status: "failed",
        path: file.path,
        error: error.message
      });
      blockingIssues.push({
        code: "artifact_missing",
        section: "artifacts",
        path: file.path,
        message: error.message
      });
    }
  }
}

function collectQualityIssues(report, blockingIssues, degradedSections) {
  if (!report) return;
  const quality = report.quality_status || {};
  if (quality.status === "blocked") {
    blockingIssues.push({
      code: "quality_status_blocked",
      section: "quality_status",
      message: "report quality_status is blocked"
    });
  }
  for (const issue of Array.isArray(quality.blocking_issues) ? quality.blocking_issues : []) {
    blockingIssues.push({
      code: issue.code || issue.error_code || "quality_blocking_issue",
      section: issue.section || "quality_status",
      ...issue
    });
  }
  for (const issue of Array.isArray(quality.degraded_sections) ? quality.degraded_sections : []) {
    degradedSections.push({
      code: issue.code || issue.error_code || "quality_degraded_section",
      section: issue.section || "quality_status",
      ...issue
    });
  }
}

async function runCheck(id, checks, fn) {
  try {
    const output = await fn();
    const failed = output?.ok === false;
    const check = {
      id,
      status: failed ? "failed" : "passed",
      output: trimOutput(output)
    };
    checks.push(check);
    return { failed, output };
  } catch (error) {
    const check = {
      id,
      status: "failed",
      error: error.message,
      error_code: error.code || ""
    };
    checks.push(check);
    return { failed: true, error: error.message };
  }
}

function summarizeSourcesHealth(output) {
  const results = Array.isArray(output?.results)
    ? output.results
    : Array.isArray(output?.source_audit?.sources_health?.sources)
      ? output.source_audit.sources_health.sources
      : [];
  return {
    checked: output?.source_audit?.sources_health?.checked === true || results.length > 0,
    total: results.length,
    status_counts: countBy(results, "status")
  };
}

async function checkPages({ report, reportDate, fetchImpl }) {
  const url = report?.canonical_url || "";
  if (!url) {
    return {
      id: "pages_http",
      status: "failed",
      url,
      message: "report canonical_url is missing"
    };
  }
  if (typeof fetchImpl !== "function") {
    return {
      id: "pages_http",
      status: "failed",
      url,
      message: "fetch is not available"
    };
  }
  try {
    const response = await fetchImpl(url);
    const text = typeof response.text === "function" ? await response.text() : "";
    const ok = response.ok === true && text.includes(reportDate);
    return {
      id: "pages_http",
      status: ok ? "passed" : "failed",
      url,
      http_status: response.status || null,
      contains_date: text.includes(reportDate),
      message: ok ? "Pages URL returned the report date" : "Pages URL did not return HTTP 200 with the report date"
    };
  } catch (error) {
    return {
      id: "pages_http",
      status: "failed",
      url,
      message: error.message
    };
  }
}

function countBy(items, key) {
  const counts = {};
  for (const item of items || []) {
    const value = item?.[key] || "unspecified";
    counts[value] = (counts[value] || 0) + 1;
  }
  return counts;
}

function uniqueIssues(issues) {
  const seen = new Set();
  return issues.filter((issue) => {
    const key = `${issue.code || ""}:${issue.section || ""}:${issue.path || ""}:${issue.message || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function trimOutput(output) {
  const json = JSON.stringify(output);
  if (!json || json.length <= 8000) return output;
  return {
    truncated: true,
    bytes: Buffer.byteLength(json),
    preview: `${json.slice(0, 8000)}...`
  };
}

function portablePaths(paths) {
  return Object.fromEntries(Object.entries(paths).map(([key, value]) => [key, value.replace(/\\/g, "/")]));
}

function defaultShanghaiDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function requireReportDate(reportDate) {
  if (!isValidDateString(reportDate || "")) {
    throw new PublisherError("status_self_check_date_required", "status:self-check requires --date YYYY-MM-DD.");
  }
  return reportDate;
}
