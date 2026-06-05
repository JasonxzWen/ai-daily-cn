import fs from "node:fs/promises";
import path from "node:path";
import { PublisherError } from "./errors.js";
import { normalizeUrlIdentity } from "./url.js";

const CURRENT_SECTIONS = ["main_items", "model_releases", "hot_blogs"];
const MODEL_MAIN_DUPLICATE_SECTIONS = new Set(["main_items", "model_releases"]);
const HISTORY_SECTIONS = ["main_items", "github_trending", "model_releases", "hot_blogs", "projects", "builder_observations"];

export async function requireFreshReport(report, options = {}) {
  const errors = [
    ...findSameReportUrlDuplicates(report),
    ...findOldMainItems(report),
    ...findOldDatesInSummary(report),
    ...findOldBackgroundCandidates(report, options.candidatePool)
  ];

  const history = await readRecentReports(options.historyDir, report.report_date, options.historyDays ?? 7);
  errors.push(...findRecentMainItemDuplicates(report, history));

  if (errors.length > 0) {
    throw new PublisherError("freshness_gate_failed", "日报未通过去重和新鲜度门禁。", {
      errors
    });
  }
}

export function findFreshnessIssues(report, history = [], candidatePool = null) {
  return [
    ...findSameReportUrlDuplicates(report),
    ...findOldMainItems(report),
    ...findOldDatesInSummary(report),
    ...findOldBackgroundCandidates(report, candidatePool),
    ...findRecentMainItemDuplicates(report, history)
  ];
}

async function readRecentReports(historyDir, reportDate, days) {
  if (!historyDir) {
    return [];
  }

  const result = [];
  for (const date of recentDateStrings(reportDate, days)) {
    const [year, month] = date.split("-");
    const file = path.join(historyDir, year, month, `${date}.json`);
    try {
      const report = JSON.parse(await fs.readFile(file, "utf8"));
      result.push(report);
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
  }
  return result;
}

function findSameReportUrlDuplicates(report) {
  const seen = new Map();
  const errors = [];
  for (const section of CURRENT_SECTIONS) {
    for (const [index, item] of (report[section] || []).entries()) {
      const url = normalizeUrl(item.url);
      if (!url) {
        continue;
      }
      const current = `${section}[${index}]`;
      const previous = seen.get(url);
      if (previous) {
        const previousSection = previous.split("[")[0];
        if (
          previousSection !== section &&
          MODEL_MAIN_DUPLICATE_SECTIONS.has(previousSection) &&
          MODEL_MAIN_DUPLICATE_SECTIONS.has(section)
        ) {
          seen.set(url, current);
          continue;
        }
        errors.push({
          code: "same_report_duplicate_url",
          path: current,
          url,
          message: `同一 URL 已在本日报的 ${previous} 出现，不能跨 main/model/blog 重复包装。`
        });
      } else {
        seen.set(url, current);
      }
    }
  }
  return errors;
}

function findRecentMainItemDuplicates(report, history) {
  const historyUrls = new Map();
  for (const oldReport of history) {
    for (const section of HISTORY_SECTIONS) {
      for (const [index, item] of (oldReport[section] || []).entries()) {
        const url = normalizeUrl(item.url);
        if (url && !historyUrls.has(url)) {
          historyUrls.set(url, `${oldReport.report_date}:${section}[${index}]`);
        }
      }
    }
  }

  const errors = [];
  for (const [index, item] of (report.main_items || []).entries()) {
    const url = normalizeUrl(item.url);
    if (!url) {
      continue;
    }
    const previous = historyUrls.get(url);
    if (previous) {
      errors.push({
        code: "recent_duplicate_main_item",
        path: `main_items[${index}]`,
        url,
        previous,
        message: `最近 7 天已出现过该 URL，不能再次进入主体信息。`
      });
    }
  }
  return errors;
}

function findOldMainItems(report) {
  const cutoff = dateToDayNumber(report.report_date) - 2;
  const errors = [];
  for (const [index, item] of (report.main_items || []).entries()) {
    if (dateToDayNumber(item.event_date) < cutoff) {
      errors.push({
        code: "old_main_item",
        path: `main_items[${index}].event_date`,
        event_date: item.event_date,
        message: "48 小时外条目不能进入主体信息；只能降级为补充或背景。"
      });
    }
  }
  return errors;
}

function findOldDatesInSummary(report) {
  const cutoff = dateToDayNumber(report.report_date) - 2;
  const dates = [...String(report.summary || "").matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)].map((match) => match[0]);
  return dates
    .filter((date) => dateToDayNumber(date) < cutoff)
    .map((date) => ({
      code: "old_date_in_summary",
      path: "summary",
      event_date: date,
      message: "摘要不能强调 48 小时外旧日期；旧内容应放在补充或背景。"
    }));
}

function findOldBackgroundCandidates(report, candidatePool) {
  if (!candidatePool) {
    return [];
  }

  const cutoff = dateToDayNumber(report.report_date) - 2;
  const oldBackground = candidatePool.candidates.filter(
    (candidate) =>
      candidate.status === "included" &&
      candidate.category === "community_lead" &&
      dateToDayNumber(candidate.event_date) < cutoff
  );

  if (oldBackground.length <= 1) {
    return [];
  }

  return [
    {
      code: "too_many_old_background_items",
      path: "community_leads",
      count: oldBackground.length,
      message: "48 小时外补充或背景条目每天最多 1 条。"
    }
  ];
}

function recentDateStrings(reportDate, days) {
  const dates = [];
  const base = new Date(`${reportDate}T00:00:00Z`);
  for (let offset = 1; offset <= days; offset += 1) {
    const date = new Date(base);
    date.setUTCDate(base.getUTCDate() - offset);
    dates.push(date.toISOString().slice(0, 10));
  }
  return dates;
}

function dateToDayNumber(date) {
  return Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 86400000);
}

function normalizeUrl(value) {
  return normalizeUrlIdentity(value);
}
