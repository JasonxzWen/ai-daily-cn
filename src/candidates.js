import fs from "node:fs/promises";
import path from "node:path";
import { PublisherError } from "./errors.js";
import { reportRelativePaths } from "./paths.js";
import { validateCandidatePool } from "./schema.js";

const REQUIRED_SECTIONS = {
  main_items: "main_item",
  github_trending: "github_trending",
  model_releases: "model_release",
  hot_blogs: "hot_blog",
  projects: "project",
  builder_observations: "builder_observation"
};

export async function readCandidatePool(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const reportDate = options.reportDate;
  const inputPath =
    options.inputPath || path.join(".tmp", `source-candidates-${reportDate}.json`);
  const candidatePath = path.resolve(rootDir, inputPath);

  let raw = "";
  try {
    raw = await fs.readFile(candidatePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new PublisherError("candidate_pool_missing", `缺少候选池文件：${candidatePath}`, {
        path: candidatePath
      });
    }
    throw error;
  }

  return {
    path: candidatePath,
    candidatePool: normalizeCandidatePool(JSON.parse(raw), reportDate)
  };
}

export function normalizeCandidatePool(candidatePool, reportDate) {
  const validation = validateCandidatePool(candidatePool);
  if (!validation.valid) {
    throw new PublisherError("candidate_pool_schema_validation_failed", "候选池 JSON 未通过 schema 校验。", {
      errors: validation.errors
    });
  }

  const value = validation.value;
  const errors = [];
  if (value.report_date !== reportDate) {
    errors.push({
      path: "$.report_date",
      message: `候选池日期 ${value.report_date} 必须等于日报日期 ${reportDate}。`
    });
  }

  const sourceIds = new Set();
  for (const source of value.sources) {
    if (sourceIds.has(source.id)) {
      errors.push({ path: `$.sources[${source.id}]`, message: `source id 重复：${source.id}` });
    }
    sourceIds.add(source.id);
  }

  const candidateIds = new Set();
  for (const candidate of value.candidates) {
    if (candidateIds.has(candidate.id)) {
      errors.push({ path: `$.candidates[${candidate.id}]`, message: `candidate id 重复：${candidate.id}` });
    }
    candidateIds.add(candidate.id);
    if (!sourceIds.has(candidate.source_id)) {
      errors.push({
        path: `$.candidates[${candidate.id}].source_id`,
        message: `候选引用了不存在的 source_id：${candidate.source_id}`
      });
    }
  }

  if (errors.length > 0) {
    throw new PublisherError("candidate_pool_invalid", "候选池内部引用无效。", { errors });
  }

  return value;
}

export function requireCandidateCoverage(report, candidatePool) {
  if (!candidatePool) {
    throw new PublisherError("candidate_pool_missing", "结构化日报必须提供候选池，正文条目不得绕过候选池。");
  }

  const byId = new Map(candidatePool.candidates.map((candidate) => [candidate.id, candidate]));
  const errors = [];

  for (const [sectionName, expectedCategory] of Object.entries(REQUIRED_SECTIONS)) {
    const items = Array.isArray(report[sectionName]) ? report[sectionName] : [];
    items.forEach((item, index) => {
      const pathName = `${sectionName}[${index}]`;
      if (!item.candidate_id) {
        errors.push({ path: `${pathName}.candidate_id`, message: "入选条目必须回指 candidate_id。" });
        return;
      }

      const candidate = byId.get(item.candidate_id);
      if (!candidate) {
        errors.push({ path: `${pathName}.candidate_id`, message: `candidate_id 不存在：${item.candidate_id}` });
        return;
      }

      if (candidate.status !== "included") {
        errors.push({ path: `${pathName}.candidate_id`, message: `candidate_id 未标记 included：${item.candidate_id}` });
      }
      if (candidate.category !== expectedCategory) {
        errors.push({
          path: `${pathName}.candidate_id`,
          message: `candidate category 必须是 ${expectedCategory}，实际是 ${candidate.category}。`
        });
      }
      if (candidate.included_in && candidate.included_in !== sectionName) {
        errors.push({
          path: `${pathName}.candidate_id`,
          message: `candidate included_in 必须是 ${sectionName}，实际是 ${candidate.included_in}。`
        });
      }
      if (item.url !== candidate.url) {
        errors.push({ path: `${pathName}.url`, message: `条目 URL 必须与候选 URL 一致：${item.candidate_id}` });
      }
      if (item.event_date && item.event_date !== candidate.event_date) {
        errors.push({
          path: `${pathName}.event_date`,
          message: `条目 event_date 必须与候选 event_date 一致：${item.candidate_id}`
        });
      }
    });
  }

  if (errors.length > 0) {
    throw new PublisherError("candidate_pool_reference_invalid", "日报条目没有全部回指有效候选。", {
      errors
    });
  }
}

export async function writeCandidatePool(outputDir, reportDate, candidatePool) {
  const [year, month] = reportDate.split("-");
  const target = path.join(outputDir, year, month, `${reportDate}.candidates.json`);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(candidatePool, null, 2)}\n`, "utf8");
  return target;
}

export function candidatePoolOutputPath(reportDate) {
  const [year, month] = reportDate.split("-");
  return path.join(year, month, `${reportDate}.candidates.json`);
}

export function reportCandidatePoolPublicPath(reportDate) {
  return reportRelativePaths(reportDate).candidateDataPath;
}
