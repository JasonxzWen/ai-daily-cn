import fs from "node:fs/promises";
import path from "node:path";
import { candidatePoolRelativePaths } from "./reports-data-layout.js";
import { isValidDateString } from "./time.js";
import { evaluatePublicSourceAdmission } from "./candidates.js";
import { effectiveCandidateVerification } from "./source-verification.js";
import { collectMainAuditConsistencyIssues } from "./main-audit-consistency.js";
import { normalizeUrlIdentity } from "./url.js";

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
  const logicalSourceId = String(options.logicalSourceId || "").trim();
  const logicalSourceEvidence = logicalSourceId
    ? await auditLogicalSourceEvidence({
        rootDir,
        historyDir,
        reportDate,
        days,
        records,
        phase5Days: dayResults,
        logicalSourceId,
        publicArticlesPath: options.publicArticlesPath
      })
    : null;
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
    days: dayResults,
    ...(logicalSourceEvidence ? { logical_source_evidence: logicalSourceEvidence } : {})
  };
}

async function auditLogicalSourceEvidence({
  rootDir,
  historyDir,
  reportDate,
  days,
  records,
  phase5Days,
  logicalSourceId,
  publicArticlesPath
}) {
  const expectedDates = consecutiveDatesEnding(reportDate, days);
  const recordsByDate = new Map(records.map((record) => [record.report_date, record]));
  const phase5DaysByDate = new Map(phase5Days.map((day) => [day.report_date, day]));
  const publicArticles = await readPublicArticles(rootDir, publicArticlesPath);
  const dayResults = [];
  for (const date of expectedDates) {
    dayResults.push(await auditLogicalSourceDay({
      record: recordsByDate.get(date),
      phase5Day: phase5DaysByDate.get(date),
      reportDate: date,
      historyDir,
      logicalSourceId,
      publicArticles
    }));
  }
  const violations = dayResults.flatMap((day) => day.violations);
  if (days < 3) {
    violations.push({
      report_date: reportDate,
      logical_source_id: logicalSourceId,
      code: "insufficient_evidence_window",
      message: "Logical source production verification requires at least three consecutive days."
    });
  }
  const totalPublicMatches = new Set(
    dayResults.flatMap((day) => day.public_output.matched_urls)
  ).size;
  const productionVerified =
    days >= 3 &&
    dayResults.length === days &&
    dayResults.every((day) => day.complete) &&
    totalPublicMatches > 0 &&
    violations.length === 0;

  return {
    logical_source_id: logicalSourceId,
    expected_dates: expectedDates,
    days: dayResults,
    consecutive_complete_days: dayResults.filter((day) => day.complete).length,
    total_public_matches: totalPublicMatches,
    production_verified: productionVerified,
    violations
  };
}

async function auditLogicalSourceDay({ record, phase5Day, reportDate, historyDir, logicalSourceId, publicArticles }) {
  if (!record) {
    const violation = logicalSourceViolation(reportDate, logicalSourceId, "missing_report_day", "No persisted report exists for the expected date.");
    return emptyLogicalSourceDay(reportDate, violation);
  }

  const row = (Array.isArray(record.payload?.source_effectiveness) ? record.payload.source_effectiveness : [])
    .find((item) => item?.id === logicalSourceId);
  const sourceIds = uniqueStrings(row?.source_ids || []);
  const candidatePool = await readCandidatePoolForDate(historyDir, reportDate);
  const candidates = (Array.isArray(candidatePool?.candidates) ? candidatePool.candidates : [])
    .filter((candidate) => logicalSourceCandidateMatches(candidate, sourceIds));
  const included = candidates.filter(candidateIncludedPublicly);
  const notIncluded = candidates.filter((candidate) => !candidateIncludedPublicly(candidate));
  const reasons = uniqueStrings(notIncluded.map(candidateDispositionReason).filter(Boolean));
  const unresolved = notIncluded
    .filter((candidate) => !candidateDispositionReason(candidate))
    .map((candidate) => String(candidate?.id || candidate?.url || "unknown"));
  const expectedUrls = uniqueStrings(included.map(logicalSourceCandidatePublicUrl).map(normalizeUrlIdentity).filter(Boolean));
  const publicUrls = new Set(
    publicArticles
      .filter((article) => String(article?.report_date || article?.date || "") === reportDate)
      .map((article) => normalizeUrlIdentity(article?.url))
      .filter(Boolean)
  );
  const matchedUrls = expectedUrls.filter((url) => publicUrls.has(url));
  const missingUrls = expectedUrls.filter((url) => !publicUrls.has(url));
  const violations = [];

  if (!row) {
    violations.push(logicalSourceViolation(reportDate, logicalSourceId, "logical_source_not_reported", "The report has no source_effectiveness row for the logical source."));
  } else {
    if (row.configured !== true) {
      violations.push(logicalSourceViolation(reportDate, logicalSourceId, "collection_not_configured", "The logical source was not configured."));
    }
    if (row.reachable !== true) {
      violations.push(logicalSourceViolation(reportDate, logicalSourceId, "collection_unreachable", "The logical source was not reachable."));
    }
    if (row.parsed_recent !== true) {
      violations.push(logicalSourceViolation(reportDate, logicalSourceId, "collection_not_parsed", "The logical source had no recent parsed signal."));
    }
    if (row.candidate_created !== true || candidates.length === 0) {
      violations.push(logicalSourceViolation(reportDate, logicalSourceId, "candidate_not_created", "The persisted candidate pool has no candidate for the logical source."));
    }
    if ((row.public_included === true) !== (included.length > 0)) {
      violations.push(logicalSourceViolation(
        reportDate,
        logicalSourceId,
        "effectiveness_public_included_mismatch",
        `Source effectiveness reports public_included=${row.public_included === true}, but the persisted candidate pool has ${included.length} included candidate(s).`
      ));
    }
  }
  if (unresolved.length > 0) {
    violations.push(logicalSourceViolation(reportDate, logicalSourceId, "missing_disposition_reason", `Non-included candidates have no persisted reason: ${unresolved.join(", ")}.`));
  }
  if (missingUrls.length > 0) {
    violations.push(logicalSourceViolation(reportDate, logicalSourceId, "included_public_output_mismatch", `Included candidate URLs are missing from public output: ${missingUrls.join(", ")}.`));
  }
  if (phase5Day?.passed !== true) {
    violations.push(logicalSourceViolation(reportDate, logicalSourceId, "phase5_day_incomplete", "The report day's shared Phase5 admission and lineage audit did not pass."));
  }

  return {
    report_date: reportDate,
    report_present: true,
    phase5_day_passed: phase5Day?.passed === true,
    collection: {
      configured: row?.configured === true,
      reachable: row?.reachable === true,
      parsed_recent: row?.parsed_recent === true,
      statuses: uniqueStrings(row?.statuses || []),
      source_ids: sourceIds
    },
    admission: {
      candidate_count: candidates.length
    },
    disposition: {
      included_count: included.length,
      excluded_count: notIncluded.length,
      reasons,
      unresolved
    },
    public_output: {
      expected_urls: expectedUrls,
      matched_urls: matchedUrls,
      missing_urls: missingUrls
    },
    complete: violations.length === 0,
    violations
  };
}

function emptyLogicalSourceDay(reportDate, violation) {
  return {
    report_date: reportDate,
    report_present: false,
    phase5_day_passed: false,
    collection: { configured: false, reachable: false, parsed_recent: false, statuses: [], source_ids: [] },
    admission: { candidate_count: 0 },
    disposition: { included_count: 0, excluded_count: 0, reasons: [], unresolved: [] },
    public_output: { expected_urls: [], matched_urls: [], missing_urls: [] },
    complete: false,
    violations: [violation]
  };
}

function logicalSourceCandidateMatches(candidate, sourceIds) {
  if (sourceIds.length === 0) return false;
  return [candidate?.source_id, candidate?.source_watch?.target_id]
    .map((value) => String(value || "").trim())
    .some((value) => value && sourceIds.includes(value));
}

function candidateIncludedPublicly(candidate) {
  if (String(candidate?.status || "") === "included") return true;
  if (Array.isArray(candidate?.included_in)) return candidate.included_in.length > 0;
  return Boolean(String(candidate?.included_in || "").trim());
}

function candidateDispositionReason(candidate) {
  return String(candidate?.main_reject_reason || candidate?.exclusion_reason || "").trim();
}

function logicalSourceCandidatePublicUrl(candidate) {
  return String(candidate?.source_watch?.event_url || candidate?.url || "").trim();
}

function logicalSourceViolation(reportDate, logicalSourceId, code, message) {
  return {
    report_date: reportDate,
    logical_source_id: logicalSourceId,
    code,
    message
  };
}

function consecutiveDatesEnding(reportDate, days) {
  const end = new Date(`${reportDate}T00:00:00.000Z`);
  const dates = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(end);
    date.setUTCDate(end.getUTCDate() - offset);
    dates.push(date.toISOString().slice(0, 10));
  }
  return dates;
}

async function readPublicArticles(rootDir, publicArticlesPath) {
  const filePath = path.resolve(rootDir, publicArticlesPath || path.join("docs", "articles.json"));
  try {
    const payload = JSON.parse(await fs.readFile(filePath, "utf8"));
    return Array.isArray(payload) ? payload : (Array.isArray(payload?.articles) ? payload.articles : []);
  } catch {
    return [];
  }
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
  const factAudit = auditFactSectionAdmissions(record.payload, candidatePool, record.report_date);

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

function auditFactSectionAdmissions(report, candidatePool, reportDate) {
  const candidates = Array.isArray(candidatePool?.candidates) ? candidatePool.candidates : [];
  const byId = new Map(candidates.map((candidate) => [String(candidate?.id || ""), candidate]));
  const referencedCandidateIds = new Set();
  const violations = [];
  const verificationUpgrades = [];
  const missingCandidateBackrefs = [];
  const selectionMetadataMismatches = [];

  for (const issue of collectMainAuditConsistencyIssues(report, candidatePool)) {
    selectionMetadataMismatches.push({
      report_date: reportDate,
      candidate_id: String(issue.candidate_id || ""),
      section: "main_items",
      reason_code: issue.code,
      path: issue.path,
      title: "",
      url: ""
    });
  }

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

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => String(value || "").trim()).filter(Boolean))];
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
