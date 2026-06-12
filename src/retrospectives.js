import fs from "node:fs/promises";
import path from "node:path";

const RETROSPECTIVE_ROOT = "retrospectives";
const RETROSPECTIVE_INDEX = "retrospectives/index.json";
const RETROSPECTIVE_LEDGER_ID = "feedback/p1-authoritative-retrospectives";

export async function writeDailyPublishRetrospective(options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const summary = options.summary || {};
  const reportDate = requireReportDate(options.reportDate || summary.report_date);
  const status = normalizeRetrospectiveStatus(options.status || summary.final_status, summary.mode);
  const now = options.now || (() => new Date().toISOString());
  const id = `${reportDate}.daily_publish.daily-run`;
  const recordPath = retrospectiveRecordPath(reportDate, id);
  const record = buildDailyPublishRecord({
    id,
    reportDate,
    status,
    summary,
    now
  });

  return await writeRetrospectiveRecord({ rootDir, record, recordPath, now });
}

export async function writeDailyPublishCorrectionRetrospective(options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const summary = options.summary || {};
  const reportDate = requireReportDate(options.reportDate || summary.report_date);
  const status = normalizeRetrospectiveStatus(options.status || "blocked", "publish");
  const now = options.now || (() => new Date().toISOString());
  const id = `${reportDate}.rollup.daily-publish-correction`;
  const recordPath = retrospectiveRecordPath(reportDate, id);
  const record = buildDailyPublishCorrectionRecord({
    id,
    reportDate,
    status,
    summary
  });

  return await writeRetrospectiveRecord({ rootDir, record, recordPath, now });
}

function buildDailyPublishRecord({ id, reportDate, status, summary }) {
  const [year, month] = reportDate.split("-");
  const blockers = collectFailedStageBlockers(summary);

  return {
    schema_version: 1,
    id,
    run_type: "daily_publish",
    date: reportDate,
    title: `Daily publish retrospective ${reportDate}`,
    status,
    summary: `Daily publish ${summary.mode || "run"} completed for ${reportDate} with status ${status}.`,
    evidence: {
      report_json: `reports-data/${year}/${month}/${reportDate}.json`,
      html: `docs/reports/${year}/${month}/${reportDate}.html`,
      validation_commands: [
        "node scripts/validate-retrospectives.mjs",
        "npm run validate"
      ]
    },
    blockers,
    degraded_sections: collectDegradedSections(summary),
    lessons: [
      {
        lesson: "Daily publish runs must leave a sanitized project-level retrospective record.",
        evidence: "The daily runner generated this record from stage status and repo-relative artifacts only.",
        scope: "daily_publish",
        persistence: "implemented",
        recommended_action: "Review this record with the generated report and keep follow-up suggestions statused."
      }
    ],
    suggestions: blockers.length > 0
      ? [
          {
            status: "observed",
            issue: "Daily publish run ended with blocked stages.",
            evidence: blockers.map((item) => item.section).join(", "),
            module: "src/daily-runner.js",
            suggestion: "Inspect the failed stage evidence in the local run summary and promote durable fixes through the feedback ledger when confirmed.",
            expected_benefit: "Future scheduled runs can avoid repeating the same blocker.",
            requires_user_confirmation: true,
            promotion_path: "Confirm the blocker is durable before adding a P1 ledger item."
          }
        ]
      : [],
    ledger_links: [RETROSPECTIVE_LEDGER_ID],
    followups: blockers.length > 0
      ? [
          {
            status: "recommended",
            action: "Inspect blocked daily publish stage and decide whether it becomes a durable ledger item.",
            owner: "project"
          }
        ]
      : []
  };
}

function buildDailyPublishCorrectionRecord({ id, reportDate, status, summary }) {
  const [year, month] = reportDate.split("-");
  const blockers = collectFailedStageBlockers(summary);
  const effectiveBlockers = blockers.length > 0
    ? blockers
    : [
        {
          code: "publish_result_blocked",
          section: "daily_publish",
          message: "Daily publish ended blocked; inspect local run summary for detailed logs."
        }
      ];

  return {
    schema_version: 1,
    id,
    run_type: "rollup",
    date: reportDate,
    title: `Daily publish correction ${reportDate}`,
    status,
    summary: `Correction record for daily publish ${reportDate} after final publish status became ${status}.`,
    evidence: {
      report_json: `reports-data/${year}/${month}/${reportDate}.json`,
      html: `docs/reports/${year}/${month}/${reportDate}.html`,
      validation_commands: [
        "node scripts/validate-retrospectives.mjs",
        "npm run validate"
      ]
    },
    blockers: effectiveBlockers,
    degraded_sections: collectDegradedSections(summary),
    lessons: [
      {
        lesson: "Publish-result corrections must be stored as sanitized rollup records instead of mutating chat-only state.",
        evidence: "The daily runner generated this correction after publish and fallback did not complete.",
        scope: "daily_publish",
        persistence: "implemented",
        recommended_action: "Include this selected-date rollup in the next publish handoff or project review."
      }
    ],
    suggestions: [
      {
        status: "observed",
        issue: "Daily publish finalization required a correction rollup.",
        evidence: effectiveBlockers.map((item) => item.section).join(", "),
        module: "src/daily-runner.js",
        suggestion: "Inspect the failed publish path and promote a durable fix to the feedback ledger only after confirmation.",
        expected_benefit: "Future publish runs can avoid repeating confirmed infrastructure or workflow blockers.",
        requires_user_confirmation: true,
        promotion_path: "Confirm the blocker is durable before adding a P1 ledger item."
      }
    ],
    ledger_links: [RETROSPECTIVE_LEDGER_ID],
    followups: [
      {
        status: "recommended",
        action: "Review blocked publish correction and decide whether it needs a durable ledger item.",
        owner: "project"
      }
    ]
  };
}

async function writeRetrospectiveRecord({ rootDir, record, recordPath, now }) {
  await writeJson(path.join(rootDir, ...recordPath.split("/")), record);
  const index = await upsertRetrospectiveIndex(rootDir, {
    id: record.id,
    run_type: record.run_type,
    date: record.date,
    status: record.status,
    path: recordPath,
    title: record.title
  }, now);

  return {
    ok: true,
    id: record.id,
    run_type: record.run_type,
    status: record.status,
    record_path: recordPath,
    index_path: RETROSPECTIVE_INDEX,
    records_indexed: index.records.length
  };
}

async function upsertRetrospectiveIndex(rootDir, entry, now) {
  const indexPath = path.join(rootDir, ...RETROSPECTIVE_INDEX.split("/"));
  let index = {
    schema_version: 1,
    generated_at: now(),
    records: []
  };
  try {
    index = JSON.parse(await fs.readFile(indexPath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  const records = Array.isArray(index.records) ? index.records : [];
  index.records = [
    ...records.filter((item) => item?.id !== entry.id && item?.path !== entry.path),
    entry
  ].sort(compareIndexEntries);
  index.schema_version = 1;
  index.generated_at = now();

  await writeJson(indexPath, index);
  return index;
}

function collectFailedStageBlockers(summary) {
  return (Array.isArray(summary.stages) ? summary.stages : [])
    .filter((stage) => stage?.status === "failed")
    .map((stage) => ({
      code: String(stage.error_code || stage.output?.error || `${stage.id || "stage"}_failed`),
      section: String(stage.id || "daily_runner"),
      message: summarizeStageFailure(stage)
    }));
}

function collectDegradedSections(summary) {
  const issues = [];
  for (const stage of Array.isArray(summary.stages) ? summary.stages : []) {
    const output = stage?.output || {};
    const reports = output.plan?.reports || output.reports || [];
    for (const report of Array.isArray(reports) ? reports : []) {
      for (const section of report.degraded_sections || []) {
        issues.push({
          code: String(section.code || section.reason || "degraded_section"),
          section: String(section.section || stage.id || "daily_publish"),
          message: String(section.message || section.public_note || section.code || "Daily publish section degraded.")
        });
      }
    }
  }
  return issues;
}

function summarizeStageFailure(stage) {
  const code = String(stage?.error_code || stage?.output?.error || "").trim();
  const id = String(stage?.id || "daily_runner");
  return code
    ? `Stage ${id} failed with ${truncate(code, 120)}; inspect local run summary for detailed logs.`
    : `Stage ${id} failed; inspect local run summary for detailed logs.`;
}

function normalizeRetrospectiveStatus(status, mode) {
  const value = String(status || "").trim();
  if (["published", "blocked", "degraded", "completed", "generated_only", "rolled_up"].includes(value)) {
    return value;
  }
  if (value === "failed") {
    return "blocked";
  }
  return mode === "publish" ? "published" : "generated_only";
}

function retrospectiveRecordPath(reportDate, id) {
  const [year, month] = reportDate.split("-");
  return `${RETROSPECTIVE_ROOT}/${year}/${month}/${id}.json`;
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function compareIndexEntries(left, right) {
  const dateOrder = String(right.date || "").localeCompare(String(left.date || ""));
  if (dateOrder !== 0) {
    return dateOrder;
  }
  return String(left.id || "").localeCompare(String(right.id || ""));
}

function truncate(value, maxLength) {
  const text = String(value || "");
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function requireReportDate(reportDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(reportDate || ""))) {
    throw new Error("reportDate must be YYYY-MM-DD");
  }
  return reportDate;
}
