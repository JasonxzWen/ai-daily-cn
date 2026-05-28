import fs from "node:fs/promises";
import path from "node:path";
import { isValidDateString } from "./time.js";

const REQUIRED_AUDIT_GROUPS = ["github_trending", "builder_sources", "content_sources", "search_sources", "sources_health"];

export async function auditSourceRunHistory(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const historyDir = path.resolve(rootDir, options.historyDir || "reports-data");
  const reportDate = requireReportDate(options.reportDate);
  const days = positiveInt(options.days, 3);
  const records = await loadReportRecords(historyDir, reportDate);
  const recent = records.slice(0, days);
  const dayResults = [];

  for (const record of recent) {
    dayResults.push(await auditDay(record, historyDir));
  }

  const summary = summarizeDayResults(dayResults, days);
  return {
    ok: true,
    phase5_complete: summary.passed,
    report_date: reportDate,
    target_days: days,
    dates_checked: dayResults.map((day) => day.report_date),
    summary,
    days: dayResults
  };
}

async function loadReportRecords(historyDir, reportDate) {
  const files = await listJsonFiles(historyDir);
  const records = [];
  for (const filePath of files) {
    if (filePath.endsWith(".candidates.json")) {
      continue;
    }
    const fileName = path.basename(filePath);
    const date = fileName.replace(/\.json$/i, "");
    if (!isValidDateString(date) || date > reportDate) {
      continue;
    }
    try {
      const payload = JSON.parse(await fs.readFile(filePath, "utf8"));
      records.push({ report_date: payload.report_date || date, path: filePath, payload });
    } catch {
      // Ignore malformed historical files; they will not count toward phase 5 evidence.
    }
  }
  return records.sort((left, right) => right.report_date.localeCompare(left.report_date));
}

async function listJsonFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listJsonFiles(filePath));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(filePath);
    }
  }
  return files;
}

async function auditDay(record, historyDir) {
  const candidatePool = await readCandidatePoolForDate(historyDir, record.report_date);
  const candidates = Array.isArray(candidatePool?.candidates) ? candidatePool.candidates : [];
  const audit = record.payload.source_audit || {};
  const groups = {};
  for (const groupName of REQUIRED_AUDIT_GROUPS) {
    groups[groupName] = auditGroupStatus(audit[groupName]);
  }

  const duplicateUrls = countDuplicateUrls(candidates);
  const factLeakCandidates = candidates.filter((candidate) =>
    candidate.status === "included" &&
    ["main_items", "model_releases", "hot_blogs", "projects"].includes(candidate.included_in) &&
    candidate.verification_status &&
    !["primary_confirmed", "multi_source_confirmed"].includes(candidate.verification_status)
  );

  const metrics = {
    sources_checked: Object.values(groups).reduce((sum, group) => sum + group.sources_checked, 0),
    candidates_found: candidates.length,
    primary_verified: candidates.filter((candidate) => ["primary_confirmed", "multi_source_confirmed"].includes(candidate.verification_status)).length,
    intermediary_only: candidates.filter((candidate) => candidate.verification_status === "intermediary_only").length,
    skipped_primary_verification: candidates.filter((candidate) => ["intermediary_only", "unverified"].includes(candidate.verification_status)).length,
    duplicates_removed_proxy: duplicateUrls,
    t3_fact_leak_count: factLeakCandidates.length
  };

  const missingRequiredGroups = Object.entries(groups)
    .filter(([, group]) => group.checked !== true)
    .map(([groupName]) => groupName);

  return {
    report_date: record.report_date,
    report_path: record.path,
    candidate_pool_present: Boolean(candidatePool),
    groups,
    metrics,
    passed: missingRequiredGroups.length === 0 && metrics.t3_fact_leak_count === 0,
    missing_required_groups: missingRequiredGroups
  };
}

async function readCandidatePoolForDate(historyDir, reportDate) {
  const [year, month] = reportDate.split("-");
  const filePath = path.join(historyDir, year, month, `${reportDate}.candidates.json`);
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

function auditGroupStatus(group) {
  const sources = Array.isArray(group?.sources) ? group.sources : [];
  return {
    checked: group?.checked === true,
    sources_checked: sources.length,
    candidates_found: Number.isInteger(group?.candidates_found) ? group.candidates_found : 0,
    included: Number.isInteger(group?.included) ? group.included : 0,
    blocked_sources: sources.filter((source) => source.status === "blocked").length,
    no_signal_sources: sources.filter((source) => source.status === "no_signal").length
  };
}

function summarizeDayResults(dayResults, targetDays) {
  const missingDays = Math.max(0, targetDays - dayResults.length);
  const daysWithAllGroups = dayResults.filter((day) => day.missing_required_groups.length === 0).length;
  const t3FactLeakCount = dayResults.reduce((sum, day) => sum + day.metrics.t3_fact_leak_count, 0);
  const totalSourcesChecked = dayResults.reduce((sum, day) => sum + day.metrics.sources_checked, 0);
  const totalCandidatesFound = dayResults.reduce((sum, day) => sum + day.metrics.candidates_found, 0);
  const primaryVerified = dayResults.reduce((sum, day) => sum + day.metrics.primary_verified, 0);
  const intermediaryOnly = dayResults.reduce((sum, day) => sum + day.metrics.intermediary_only, 0);
  const passed = missingDays === 0 && daysWithAllGroups === targetDays && t3FactLeakCount === 0;

  return {
    passed,
    missing_days: missingDays,
    days_with_all_required_groups: daysWithAllGroups,
    t3_fact_leak_count: t3FactLeakCount,
    sources_checked: totalSourcesChecked,
    candidates_found: totalCandidatesFound,
    primary_verified: primaryVerified,
    intermediary_only: intermediaryOnly,
    notes: passed
      ? "Phase 5 audit passed for the requested report days."
      : "Phase 5 audit is not complete; missing days or required audit groups remain."
  };
}

function countDuplicateUrls(candidates) {
  const seen = new Set();
  let duplicates = 0;
  for (const candidate of candidates) {
    const url = candidate.url || "";
    if (!url) {
      continue;
    }
    if (seen.has(url)) {
      duplicates += 1;
    }
    seen.add(url);
  }
  return duplicates;
}

function requireReportDate(reportDate) {
  if (!isValidDateString(reportDate || "")) {
    throw new Error("reportDate must be YYYY-MM-DD");
  }
  return reportDate;
}

function positiveInt(value, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}
