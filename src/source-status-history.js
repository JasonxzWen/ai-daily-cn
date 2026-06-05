import fs from "node:fs/promises";
import path from "node:path";
import { isValidDateString } from "./time.js";

const DEFAULT_HISTORY_FILE = "source-status-history.json";
const TRACKED_AUDIT_GROUPS = ["github_trending", "builder_sources", "content_sources", "search_sources", "sources_health"];
const EFFECTIVE_SIGNAL_STATUSES = new Set(["checked"]);
const NO_SIGNAL_STATUSES = new Set(["blocked", "no_signal"]);

export async function prepareSourceStatusHistoryUpdate(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const outputDir = path.resolve(rootDir, options.outputDir || "reports-data");
  const reportDate = requireReportDate(options.reportDate);
  const historyPath = path.join(outputDir, DEFAULT_HISTORY_FILE);
  const currentHistory = await readSourceStatusHistory(historyPath);
  const currentRecords = extractSourceStatusRecords(options.sourceAudit, {
    reportDate,
    generatedAt: options.generatedAt
  });
  const history = mergeSourceStatusRecords(currentHistory, currentRecords, {
    reportDate,
    generatedAt: options.generatedAt
  });
  const staleSources = findSourcesWithoutEffectiveSignal(history, {
    reportDate,
    days: options.days || 10
  });

  return {
    historyPath,
    history,
    currentRecords,
    staleSources,
    suggestions: staleSourceOptimizationSuggestions(staleSources, { days: options.days || 10 }),
    summary: {
      tracked_sources: currentRecords.length,
      no_signal_or_blocked: currentRecords.filter((record) => NO_SIGNAL_STATUSES.has(record.status)).length,
      stale_sources: staleSources.length,
      window_days: options.days || 10
    }
  };
}

export async function writeSourceStatusHistory(update) {
  if (!update?.historyPath || !update?.history) {
    return null;
  }
  await fs.mkdir(path.dirname(update.historyPath), { recursive: true });
  await fs.writeFile(update.historyPath, `${JSON.stringify(update.history, null, 2)}\n`, "utf8");
  return update.historyPath;
}

export function appendSourceStatusSuggestionsToDraft(draft, update) {
  const suggestions = Array.isArray(update?.suggestions) ? update.suggestions : [];
  const selfCheck = draft.self_check && typeof draft.self_check === "object" ? draft.self_check : {};
  const existing = Array.isArray(selfCheck.optimization_suggestions) ? selfCheck.optimization_suggestions : [];
  const seen = new Set(existing.map((item) => suggestionIdentity(item)));
  const appended = [...existing];
  for (const suggestion of suggestions) {
    const identity = suggestionIdentity(suggestion);
    if (seen.has(identity)) {
      continue;
    }
    seen.add(identity);
    appended.push(suggestion);
  }
  return {
    ...draft,
    self_check: {
      ...selfCheck,
      optimization_suggestions: appended,
      source_status_history: {
        path: DEFAULT_HISTORY_FILE,
        tracked_sources: update?.summary?.tracked_sources || 0,
        no_signal_or_blocked: update?.summary?.no_signal_or_blocked || 0,
        stale_sources: update?.summary?.stale_sources || 0,
        window_days: update?.summary?.window_days || 10
      }
    }
  };
}

export function extractSourceStatusRecords(sourceAudit, options = {}) {
  const reportDate = requireReportDate(options.reportDate);
  const observedAt = options.generatedAt || new Date().toISOString();
  const records = [];
  for (const group of TRACKED_AUDIT_GROUPS) {
    const auditGroup = sourceAudit?.[group];
    const sources = Array.isArray(auditGroup?.sources) ? auditGroup.sources : [];
    for (const source of sources) {
      const name = String(source?.name || "").trim();
      const url = String(source?.url || "").trim();
      const status = normalizeStatus(source?.status);
      if (!name && !url) {
        continue;
      }
      records.push({
        date: reportDate,
        group,
        source_key: sourceKey({ group, name, url }),
        name,
        url,
        status,
        notes: String(source?.notes || "").trim(),
        parsed_count: Number.isInteger(source?.parsed_count) ? source.parsed_count : undefined,
        candidates_found: Number.isInteger(auditGroup?.candidates_found) ? auditGroup.candidates_found : undefined,
        included: Number.isInteger(auditGroup?.included) ? auditGroup.included : undefined,
        observed_at: observedAt
      });
    }
  }
  return records.map((record) => Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)));
}

export function mergeSourceStatusRecords(history, records, options = {}) {
  const reportDate = requireReportDate(options.reportDate);
  const next = {
    schema_version: 1,
    generated_at: options.generatedAt || new Date().toISOString(),
    notes: "Daily source status history; one record per date/group/source. Repeated generation for the same day overwrites the same source key.",
    records: []
  };
  const byKey = new Map();
  for (const record of Array.isArray(history?.records) ? history.records : []) {
    if (!isValidHistoryRecord(record)) {
      continue;
    }
    byKey.set(historyRecordKey(record), normalizeHistoryRecord(record));
  }
  for (const record of records) {
    if (!isValidHistoryRecord(record)) {
      continue;
    }
    byKey.set(historyRecordKey(record), normalizeHistoryRecord(record));
  }
  next.records = [...byKey.values()]
    .filter((record) => record.date <= reportDate)
    .sort((left, right) =>
      left.date.localeCompare(right.date) ||
      left.group.localeCompare(right.group) ||
      left.source_key.localeCompare(right.source_key)
    );
  return next;
}

export function findSourcesWithoutEffectiveSignal(history, options = {}) {
  const reportDate = requireReportDate(options.reportDate);
  const days = positiveInt(options.days, 10);
  const dates = recentDates(reportDate, days);
  const targetDates = new Set(dates);
  const bySource = new Map();
  for (const record of Array.isArray(history?.records) ? history.records : []) {
    if (!targetDates.has(record.date) || !isValidHistoryRecord(record)) {
      continue;
    }
    const key = `${record.group}|${record.source_key}`;
    const item = bySource.get(key) || {
      group: record.group,
      source_key: record.source_key,
      name: record.name,
      url: record.url,
      dates: new Set(),
      statuses: [],
      checked_count: 0,
      blocked_count: 0,
      no_signal_count: 0
    };
    item.dates.add(record.date);
    item.statuses.push({ date: record.date, status: record.status, notes: record.notes || "" });
    if (EFFECTIVE_SIGNAL_STATUSES.has(record.status)) item.checked_count += 1;
    if (record.status === "blocked") item.blocked_count += 1;
    if (record.status === "no_signal") item.no_signal_count += 1;
    bySource.set(key, item);
  }

  return [...bySource.values()]
    .filter((item) => item.dates.size >= days && item.checked_count === 0)
    .map((item) => ({
      group: item.group,
      source_key: item.source_key,
      name: item.name,
      url: item.url,
      dates_observed: [...item.dates].sort(),
      blocked_count: item.blocked_count,
      no_signal_count: item.no_signal_count,
      statuses: item.statuses.sort((left, right) => left.date.localeCompare(right.date))
    }))
    .sort((left, right) =>
      (right.blocked_count + right.no_signal_count) - (left.blocked_count + left.no_signal_count) ||
      left.group.localeCompare(right.group) ||
      left.name.localeCompare(right.name)
    );
}

function staleSourceOptimizationSuggestions(staleSources, options = {}) {
  if (!Array.isArray(staleSources) || staleSources.length === 0) {
    return [];
  }
  const days = positiveInt(options.days, 10);
  const listed = staleSources.slice(0, 12).map((source) =>
    `${source.group}/${source.name || source.url}: blocked=${source.blocked_count}, no_signal=${source.no_signal_count}`
  );
  const more = staleSources.length > listed.length ? `；另有 ${staleSources.length - listed.length} 个来源未展开` : "";
  return [
    {
      issue: `过去 ${days} 天存在持续无有效信号的固定信源`,
      evidence: `${listed.join("；")}${more}。这些来源在追踪窗口内没有 checked 记录。`,
      module: "config/sources/default-content-sources.json",
      suggestion: "逐一检查这些来源是否已改版、失效、被反爬、过于低频，必要时改抓取方式、降级为 optional/manual，或替换为更稳定的一手/API/RSS 来源。",
      expected_benefit: "降低 no_signal/blocked 噪声，让日报主题生成优先利用持续产出有效信号的信源。",
      requires_user_confirmation: true
    }
  ];
}

async function readSourceStatusHistory(historyPath) {
  try {
    return JSON.parse(await fs.readFile(historyPath, "utf8"));
  } catch {
    return { schema_version: 1, records: [] };
  }
}

function normalizeHistoryRecord(record) {
  return {
    date: record.date,
    group: record.group,
    source_key: record.source_key || sourceKey(record),
    name: String(record.name || "").trim(),
    url: String(record.url || "").trim(),
    status: normalizeStatus(record.status),
    notes: String(record.notes || "").trim(),
    ...(Number.isInteger(record.parsed_count) ? { parsed_count: record.parsed_count } : {}),
    ...(Number.isInteger(record.candidates_found) ? { candidates_found: record.candidates_found } : {}),
    ...(Number.isInteger(record.included) ? { included: record.included } : {}),
    observed_at: String(record.observed_at || "").trim()
  };
}

function isValidHistoryRecord(record) {
  return isValidDateString(record?.date || "") &&
    TRACKED_AUDIT_GROUPS.includes(record?.group) &&
    Boolean(String(record?.source_key || record?.name || record?.url || "").trim());
}

function historyRecordKey(record) {
  return `${record.date}|${record.group}|${record.source_key || sourceKey(record)}`;
}

function sourceKey(record) {
  const url = normalizeUrl(record.url);
  if (url) {
    return url;
  }
  return String(record.name || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeUrl(value) {
  return String(value || "").trim().replace(/\/+$/g, "").toLowerCase();
}

function normalizeStatus(value) {
  const status = String(value || "").trim();
  return status || "unknown";
}

function recentDates(reportDate, days) {
  const dates = [];
  const start = new Date(`${reportDate}T00:00:00Z`);
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() - offset);
    dates.push(date.toISOString().slice(0, 10));
  }
  return dates;
}

function positiveInt(value, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function requireReportDate(reportDate) {
  if (!isValidDateString(reportDate || "")) {
    throw new Error("reportDate must be YYYY-MM-DD");
  }
  return reportDate;
}

function suggestionIdentity(item) {
  return [
    item?.issue || item?.observed_issue || "",
    item?.module || item?.suggested_module || item?.area || ""
  ].map((value) => String(value || "").trim()).join("|");
}
