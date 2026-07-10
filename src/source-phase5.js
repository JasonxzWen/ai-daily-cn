import fs from "node:fs/promises";
import path from "node:path";
import { candidatePoolRelativePaths } from "./reports-data-layout.js";
import { isValidDateString } from "./time.js";
import { evaluatePublicSourceAdmission } from "./candidates.js";
import { effectiveCandidateVerification } from "./source-verification.js";

const REQUIRED_AUDIT_GROUPS = ["github_trending", "builder_sources", "content_sources", "search_sources", "sources_health"];
const FACT_SECTION_NAMES = ["main_items", "model_releases", "hot_blogs", "projects"];

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
    violations: dayResults.flatMap((day) => day.violations),
    verification_upgrades: dayResults.flatMap((day) => day.verification_upgrades),
    candidate_only_included: dayResults.flatMap((day) => day.candidate_only_included),
    missing_candidate_backrefs: dayResults.flatMap((day) => day.missing_candidate_backrefs),
    selection_metadata_mismatches: dayResults.flatMap((day) => day.selection_metadata_mismatches),
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
  const effectiveCandidates = candidates.map(effectiveCandidateVerification);
  const factAudit = auditFactSectionAdmissions(record.payload, candidates, record.report_date);

  const metrics = {
    sources_checked: Object.values(groups).reduce((sum, group) => sum + group.sources_checked, 0),
    candidates_found: candidates.length,
    primary_verified: effectiveCandidates.filter((candidate) => ["primary_confirmed", "multi_source_confirmed"].includes(candidate.verification_status)).length,
    intermediary_only: effectiveCandidates.filter((candidate) => candidate.verification_status === "intermediary_only").length,
    skipped_primary_verification: effectiveCandidates.filter((candidate) => ["intermediary_only", "unverified"].includes(candidate.verification_status)).length,
    duplicates_removed_proxy: duplicateUrls,
    t3_fact_leak_count: factAudit.violations.length,
    verification_upgrade_count: factAudit.verificationUpgrades.length,
    candidate_only_included_count: factAudit.candidateOnlyIncluded.length,
    missing_candidate_backref_count: factAudit.missingCandidateBackrefs.length,
    selection_metadata_mismatch_count: factAudit.selectionMetadataMismatches.length
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
    passed:
      Boolean(candidatePool) &&
      missingRequiredGroups.length === 0 &&
      metrics.t3_fact_leak_count === 0 &&
      metrics.candidate_only_included_count === 0 &&
      metrics.missing_candidate_backref_count === 0 &&
      metrics.selection_metadata_mismatch_count === 0,
    missing_required_groups: missingRequiredGroups,
    violations: factAudit.violations,
    verification_upgrades: factAudit.verificationUpgrades,
    candidate_only_included: factAudit.candidateOnlyIncluded,
    missing_candidate_backrefs: factAudit.missingCandidateBackrefs,
    selection_metadata_mismatches: factAudit.selectionMetadataMismatches
  };
}

function auditFactSectionAdmissions(report, candidates, reportDate) {
  const byId = new Map(candidates.map((candidate) => [String(candidate?.id || ""), candidate]));
  const referencedCandidateIds = new Set();
  const violations = [];
  const verificationUpgrades = [];
  const missingCandidateBackrefs = [];
  const selectionMetadataMismatches = [];

  for (const sectionName of FACT_SECTION_NAMES) {
    const items = Array.isArray(report?.[sectionName]) ? report[sectionName] : [];
    for (const item of items) {
      const candidateId = String(item?.candidate_id || "").trim();
      if (!candidateId) {
        missingCandidateBackrefs.push({
          report_date: reportDate,
          candidate_id: "",
          section: sectionName,
          reason_code: "candidate_id_missing",
          title: String(item?.title || ""),
          url: String(item?.url || "")
        });
        continue;
      }
      const candidate = byId.get(candidateId);
      if (!candidate) {
        missingCandidateBackrefs.push({
          report_date: reportDate,
          candidate_id: candidateId,
          section: sectionName,
          reason_code: "candidate_not_found",
          title: String(item?.title || ""),
          url: String(item?.url || "")
        });
        continue;
      }
      referencedCandidateIds.add(candidateId);

      if (candidate.status !== "included" || candidate.included_in !== sectionName) {
        selectionMetadataMismatches.push({
          report_date: reportDate,
          candidate_id: candidateId,
          section: sectionName,
          reason_code: candidate.status !== "included"
            ? "candidate_not_marked_included"
            : "candidate_included_in_mismatch",
          candidate_status: String(candidate.status || ""),
          candidate_included_in: String(candidate.included_in || ""),
          title: String(item?.title || candidate.title || ""),
          url: String(item?.url || candidate.url || "")
        });
      }

      const admission = evaluatePublicSourceAdmission({ sectionName, candidate, item });
      if (admission.verification_upgraded) {
        verificationUpgrades.push({
          report_date: reportDate,
          candidate_id: candidateId,
          source_id: String(candidate.source_id || ""),
          section: sectionName,
          verdict: admission.verdict,
          effective_verification_status: admission.effective_verification_status,
          effective_source_level: admission.effective_source_level,
          primary_url: admission.primary_url,
          title: String(item?.title || candidate.title || ""),
          url: String(item?.url || candidate.url || "")
        });
      }
      if (!admission.allowed) {
        violations.push({
          report_date: reportDate,
          candidate_id: candidateId,
          source_id: String(candidate.source_id || ""),
          section: sectionName,
          verification_status: String(candidate.verification_status || ""),
          source_level: String(candidate.source_level || ""),
          reason_code: admission.reason_code,
          verdict: admission.verdict,
          high_risk: admission.high_risk,
          disclosure_complete: admission.disclosure_complete,
          title: String(item?.title || candidate.title || ""),
          url: String(item?.url || candidate.url || "")
        });
      }
    }
  }

  const candidateOnlyIncluded = candidates
    .filter((candidate) =>
      candidate?.status === "included" &&
      FACT_SECTION_NAMES.includes(candidate?.included_in) &&
      !referencedCandidateIds.has(String(candidate?.id || ""))
    )
    .map((candidate) => ({
      report_date: reportDate,
      candidate_id: String(candidate.id || ""),
      source_id: String(candidate.source_id || ""),
      section: String(candidate.included_in || ""),
      reason_code: "candidate_marked_included_without_report_backref",
      title: String(candidate.title || ""),
      url: String(candidate.url || "")
    }));

  return {
    violations,
    verificationUpgrades,
    candidateOnlyIncluded,
    missingCandidateBackrefs,
    selectionMetadataMismatches
  };
}

async function readCandidatePoolForDate(historyDir, reportDate) {
  for (const relativePath of candidatePoolRelativePaths(reportDate)) {
    const filePath = path.join(historyDir, ...relativePath.split(path.sep));
    try {
      return JSON.parse(await fs.readFile(filePath, "utf8"));
    } catch {
      // Try the next layered or legacy location.
    }
  }
  return null;
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
  const verificationUpgradeCount = dayResults.reduce((sum, day) => sum + day.metrics.verification_upgrade_count, 0);
  const candidateOnlyIncludedCount = dayResults.reduce((sum, day) => sum + day.metrics.candidate_only_included_count, 0);
  const missingCandidateBackrefCount = dayResults.reduce((sum, day) => sum + day.metrics.missing_candidate_backref_count, 0);
  const selectionMetadataMismatchCount = dayResults.reduce((sum, day) => sum + day.metrics.selection_metadata_mismatch_count, 0);
  const totalSourcesChecked = dayResults.reduce((sum, day) => sum + day.metrics.sources_checked, 0);
  const totalCandidatesFound = dayResults.reduce((sum, day) => sum + day.metrics.candidates_found, 0);
  const primaryVerified = dayResults.reduce((sum, day) => sum + day.metrics.primary_verified, 0);
  const intermediaryOnly = dayResults.reduce((sum, day) => sum + day.metrics.intermediary_only, 0);
  const passed =
    missingDays === 0 &&
    dayResults.length === targetDays &&
    daysWithAllGroups === targetDays &&
    dayResults.every((day) => day.passed);

  return {
    passed,
    missing_days: missingDays,
    days_with_all_required_groups: daysWithAllGroups,
    t3_fact_leak_count: t3FactLeakCount,
    verification_upgrade_count: verificationUpgradeCount,
    candidate_only_included_count: candidateOnlyIncludedCount,
    missing_candidate_backref_count: missingCandidateBackrefCount,
    selection_metadata_mismatch_count: selectionMetadataMismatchCount,
    sources_checked: totalSourcesChecked,
    candidates_found: totalCandidatesFound,
    primary_verified: primaryVerified,
    intermediary_only: intermediaryOnly,
    notes: phase5SummaryNotes({
      passed,
      missingDays,
      missingGroupDays: targetDays - daysWithAllGroups,
      t3FactLeakCount,
      candidateOnlyIncludedCount,
      missingCandidateBackrefCount,
      selectionMetadataMismatchCount
    })
  };
}

function phase5SummaryNotes({
  passed,
  missingDays,
  missingGroupDays,
  t3FactLeakCount,
  candidateOnlyIncludedCount,
  missingCandidateBackrefCount,
  selectionMetadataMismatchCount
}) {
  if (passed) {
    return "Phase 5 audit passed for the requested report days.";
  }
  const reasons = [];
  if (missingDays > 0) {
    reasons.push(missingDays + " missing report " + plural(missingDays, "day", "days"));
  }
  if (missingGroupDays > 0) {
    reasons.push(missingGroupDays + " " + plural(missingGroupDays, "day", "days") + " missing required audit groups");
  }
  if (t3FactLeakCount > 0) {
    reasons.push(t3FactLeakCount + " source admission " + plural(t3FactLeakCount, "violation", "violations"));
  }
  if (missingCandidateBackrefCount > 0) {
    reasons.push(missingCandidateBackrefCount + " missing candidate " + plural(missingCandidateBackrefCount, "backref", "backrefs"));
  }
  if (candidateOnlyIncludedCount > 0) {
    reasons.push(candidateOnlyIncludedCount + " candidate-only included " + plural(candidateOnlyIncludedCount, "flag", "flags"));
  }
  if (selectionMetadataMismatchCount > 0) {
    reasons.push(selectionMetadataMismatchCount + " selection metadata " + plural(selectionMetadataMismatchCount, "mismatch", "mismatches"));
  }
  return "Phase 5 audit incomplete: " + reasons.join("; ") + ".";
}

function plural(count, singular, pluralValue) {
  return count === 1 ? singular : pluralValue;
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
