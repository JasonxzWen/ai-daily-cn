import fs from "node:fs/promises";
import path from "node:path";
import { DEFAULT_SITE } from "./config.js";
import { PublisherError } from "./errors.js";
import { parseDailyMarkdown } from "./parser.js";
import { defaultStyleCss, renderIndexHtml, renderReportHtml } from "./render.js";
import { reportRelativePaths, toPosixRelative } from "./paths.js";
import { defaultGeneratedAt } from "./time.js";
import { validateFeed, validateReport } from "./schema.js";

export async function buildSite(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const inputDir = path.resolve(rootDir, options.inputDir || "reports-source");
  const dataInputDir = path.resolve(rootDir, options.dataInputDir || "reports-data");
  const outDir = path.resolve(rootDir, options.outDir || "docs");
  const siteUrl = options.siteUrl || DEFAULT_SITE.siteUrl;
  const siteTitle = options.siteTitle || DEFAULT_SITE.title;
  const generatedAt = options.generatedAt || defaultGeneratedAt();
  const markdownFiles = await collectMarkdownFiles(inputDir);
  const reportJsonFiles = await collectJsonFiles(dataInputDir);
  const reports = [];
  const writtenFiles = [];

  await fs.mkdir(outDir, { recursive: true });
  await writeFileTracked(outDir, ".nojekyll", "", writtenFiles);
  await writeFileTracked(outDir, "assets/style.css", defaultStyleCss, writtenFiles);

  for (const file of markdownFiles) {
    const markdown = await fs.readFile(file, "utf8");
    const report = parseDailyMarkdown(markdown, { siteUrl, generatedAt });
    await writeReportArtifacts(outDir, report, writtenFiles, markdown);
    reports.push(report);
  }

  for (const file of reportJsonFiles) {
    const report = await readReportJson(file);
    await writeReportArtifacts(outDir, report, writtenFiles);
    reports.push(report);
  }

  const existingFeed = await readExistingFeed(outDir, siteTitle, siteUrl, generatedAt);
  const feed = mergeFeed(existingFeed, reports, { siteTitle, siteUrl, updatedAt: generatedAt });
  const feedValidation = validateFeed(feed);
  if (!feedValidation.valid) {
    throw new PublisherError("feed_schema_validation_failed", "生成的 feed.json 未通过 schema 校验。", {
      errors: feedValidation.errors
    });
  }

  await writeJsonTracked(outDir, "feed.json", feedValidation.value, writtenFiles);
  await writeFileTracked(outDir, "index.html", renderIndexHtml(feedValidation.value), writtenFiles);

  return {
    outDir,
    reports,
    feed: feedValidation.value,
    writtenFiles: uniqueSorted(writtenFiles)
  };
}

export async function collectMarkdownFiles(inputDir) {
  try {
    const stat = await fs.stat(inputDir);
    if (!stat.isDirectory()) {
      return [];
    }
  } catch {
    return [];
  }

  const files = [];
  await walk(inputDir, files);
  return files.filter((file) => file.toLowerCase().endsWith(".md")).sort();
}

export async function collectJsonFiles(inputDir) {
  try {
    const stat = await fs.stat(inputDir);
    if (!stat.isDirectory()) {
      return [];
    }
  } catch {
    return [];
  }

  const files = [];
  await walk(inputDir, files);
  return files.filter((file) => file.toLowerCase().endsWith(".json")).sort();
}

export async function planGeneratedFiles(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const inputDir = path.resolve(rootDir, options.inputDir || "reports-source");
  const dataInputDir = path.resolve(rootDir, options.dataInputDir || "reports-data");
  const outDir = path.resolve(rootDir, options.outDir || "docs");
  const siteUrl = options.siteUrl || DEFAULT_SITE.siteUrl;
  const generatedAt = options.generatedAt || defaultGeneratedAt();
  const markdownFiles = await collectMarkdownFiles(inputDir);
  const reportJsonFiles = await collectJsonFiles(dataInputDir);
  const files = [".nojekyll", "assets/style.css", "feed.json", "index.html"];
  const reports = [];

  for (const file of markdownFiles) {
    const markdown = await fs.readFile(file, "utf8");
    const report = parseDailyMarkdown(markdown, { siteUrl, generatedAt });
    const paths = reportRelativePaths(report.report_date);
    files.push(paths.markdownPath, paths.dataPath, paths.htmlPath);
    reports.push(report);
  }

  for (const file of reportJsonFiles) {
    const report = await readReportJson(file);
    const paths = reportRelativePaths(report.report_date);
    files.push(paths.dataPath, paths.htmlPath);
    if (report.markdown_path) {
      files.push(report.markdown_path);
    }
    reports.push(report);
  }

  return {
    reports,
    files: uniqueSorted(files),
    absoluteFiles: uniqueSorted(files.map((file) => path.join(outDir, ...file.split("/"))))
  };
}

export function mergeFeed(existingFeed, reports, options = {}) {
  const siteTitle = options.siteTitle || existingFeed?.site_title || DEFAULT_SITE.title;
  const siteUrl = options.siteUrl || existingFeed?.site_url || DEFAULT_SITE.siteUrl;
  const updatedAt = reports.length === 0 && existingFeed?.updated_at ? existingFeed.updated_at : options.updatedAt || defaultGeneratedAt();
  const byDate = new Map();

  for (const item of existingFeed?.reports || []) {
    byDate.set(item.report_date, item);
  }

  for (const report of reports) {
    const paths = reportRelativePaths(report.report_date);
    const entry = {
      report_date: report.report_date,
      title: report.title,
      summary: report.summary,
      url: paths.htmlPath,
      data_url: paths.dataPath,
      main_items: report.main_items.length,
      builder_observations: report.builder_observations.length,
      generated_at: report.generated_at
    };
    if (report.markdown_path) {
      entry.markdown_url = report.markdown_path;
    }
    byDate.set(report.report_date, entry);
  }

  return {
    schema_version: 1,
    site_title: siteTitle,
    site_url: siteUrl,
    updated_at: updatedAt,
    reports: [...byDate.values()].sort((a, b) => b.report_date.localeCompare(a.report_date))
  };
}

async function walk(dir, files) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const current = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(current, files);
    } else if (entry.isFile()) {
      files.push(current);
    }
  }
}

async function readExistingFeed(outDir, siteTitle, siteUrl, generatedAt) {
  try {
    const raw = await fs.readFile(path.join(outDir, "feed.json"), "utf8");
    return JSON.parse(raw);
  } catch {
    return {
      schema_version: 1,
      site_title: siteTitle,
      site_url: siteUrl,
      updated_at: generatedAt,
      reports: []
    };
  }
}

async function writeFileTracked(outDir, relativePath, content, writtenFiles) {
  const target = path.join(outDir, ...relativePath.split("/"));
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, "utf8");
  writtenFiles.push(relativePath);
}

async function writeReportArtifacts(outDir, report, writtenFiles, markdown = null) {
  const paths = reportRelativePaths(report.report_date);
  const reportHtml = renderReportHtml(report);
  await writeJsonTracked(outDir, paths.dataPath, report, writtenFiles);
  await writeFileTracked(outDir, paths.htmlPath, reportHtml, writtenFiles);
  if (markdown !== null && report.markdown_path) {
    await writeFileTracked(outDir, report.markdown_path, markdown.replace(/\r\n/g, "\n"), writtenFiles);
  }
}

async function readReportJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  const candidate = JSON.parse(raw);
  const validation = validateReport(candidate);
  if (!validation.valid) {
    throw new PublisherError("schema_validation_failed", `结构化日报 JSON 未通过 schema 校验：${filePath}`, {
      errors: validation.errors
    });
  }

  return validation.value;
}

async function writeJsonTracked(outDir, relativePath, value, writtenFiles) {
  await writeFileTracked(outDir, relativePath, `${JSON.stringify(value, null, 2)}\n`, writtenFiles);
}

function uniqueSorted(items) {
  return [...new Set(items)].sort((a, b) => String(a).localeCompare(String(b)));
}

export function relativeWrittenFiles(rootDir, files) {
  return files.map((file) => toPosixRelative(rootDir, file)).sort();
}
