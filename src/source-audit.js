import fs from "node:fs/promises";
import path from "node:path";
import { PublisherError } from "./errors.js";
import { validateReport } from "./schema.js";
import { isValidDateString } from "./time.js";

export const MERGEABLE_SOURCE_AUDIT_GROUPS = [
  "github_trending",
  "builder_sources",
  "content_sources",
  "search_sources",
  "sources_health"
];

export async function mergeSourceAuditIntoReport(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const reportDate = requireReportDate(options.reportDate);
  const reportPath = resolveReportPath(rootDir, reportDate, options);
  const inputPaths = normalizeInputPaths(rootDir, options.inputPaths || options.inputs || []);
  if (inputPaths.length === 0) {
    throw new PublisherError("source_audit_input_missing", "至少需要一个包含 source_audit 的发现命令输出 JSON。");
  }

  const report = await readJson(reportPath);
  if (report.report_date && report.report_date !== reportDate) {
    throw new PublisherError("source_audit_report_date_mismatch", `日报日期 ${report.report_date} 与目标日期 ${reportDate} 不一致。`);
  }

  report.source_audit = report.source_audit && typeof report.source_audit === "object" ? report.source_audit : {};
  const mergedGroups = [];
  for (const inputPath of inputPaths) {
    const payload = await readJson(inputPath);
    if (payload.report_date && payload.report_date !== reportDate) {
      throw new PublisherError("source_audit_input_date_mismatch", `${inputPath} 的日期 ${payload.report_date} 与目标日期 ${reportDate} 不一致。`);
    }
    const audit = payload.source_audit;
    if (!audit || typeof audit !== "object") {
      throw new PublisherError("source_audit_input_missing", `${inputPath} 缺少 source_audit。`);
    }
    for (const groupName of MERGEABLE_SOURCE_AUDIT_GROUPS) {
      if (audit[groupName]) {
        report.source_audit[groupName] = audit[groupName];
        mergedGroups.push(groupName);
      }
    }
  }

  const uniqueMergedGroups = [...new Set(mergedGroups)];
  if (uniqueMergedGroups.length === 0) {
    throw new PublisherError("source_audit_input_empty", "输入 JSON 没有可合并的固定 source_audit 组。");
  }

  const validation = validateReport(report);
  if (!validation.valid) {
    throw new PublisherError("schema_validation_failed", "合并 source_audit 后的日报 JSON 未通过 schema 校验。", {
      errors: validation.errors
    });
  }

  await fs.writeFile(reportPath, `${JSON.stringify(validation.value, null, 2)}\n`, "utf8");
  return {
    report_date: reportDate,
    path: reportPath,
    merged_groups: uniqueMergedGroups,
    source_audit_keys: Object.keys(validation.value.source_audit || {})
  };
}

function resolveReportPath(rootDir, reportDate, options) {
  if (options.reportPath) {
    return path.resolve(rootDir, options.reportPath);
  }
  const [year, month] = reportDate.split("-");
  return path.join(path.resolve(rootDir, options.historyDir || "reports-data"), year, month, `${reportDate}.json`);
}

function normalizeInputPaths(rootDir, inputPaths) {
  const values = Array.isArray(inputPaths) ? inputPaths : String(inputPaths).split(",");
  return values.map((value) => String(value).trim()).filter(Boolean).map((value) => path.resolve(rootDir, value));
}

function requireReportDate(reportDate) {
  if (!reportDate || !isValidDateString(reportDate)) {
    throw new PublisherError("invalid_report_date", "必须提供 YYYY-MM-DD 格式的日报日期。");
  }
  return reportDate;
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw.replace(/^\uFEFF/, ""));
}
