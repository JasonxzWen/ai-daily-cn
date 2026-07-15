#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalStoryUrl, isTemplatedStoryTitle, STORY_FIRST_MAX } from "../src/story-first.js";

const REQUIRED_GITHUB_LANGUAGES = ["all", "Python", "TypeScript", "Rust", "Go", "Java"];
const DEFAULT_DATA_INPUT = "reports-data";
const DEFAULT_HTML_INPUT = path.join("docs", "reports");
const DEFAULT_LATEST_COUNT = 3;
const MAIN_FILLER_PATTERN = /材料覆盖|边界落在|后续观察|读者可核对|可继续关注|本轮材料|信息较为有限|公开描述提到|需要结合|已披露事实集中在|已披露细节覆盖|公开材料仍需要回到原文核对|更新agent\s*工作流和开发工具能力|更新AI\s*产品、平台或工程实践|当前公开的是代码接口|当前公开的是实验设置|这会影响研发团队是否|这会影响产品团队判断|这会改变模型和平台团队/i;
const HOT_BLOG_FILLER_PATTERN = /原文说明|读者可核对|继续留意|本文可作为|信息较为有限|后续观察|可继续关注|材料覆盖|\u66f4\u6709\u4ef7\u503c\u7684\u4fe1\u606f\u662f|\u5224\u65ad\u8fd9\u7c7b\u65b9\u6848\u65f6\u8fd8\u8981\u770b|\u6587\u7ae0\u68b3\u7406\u4e00\u4e2a AI \u4ea7\u54c1|\u6587\u7ae0\u62c6\u89e3 agent/i;
const GITHUB_FILLER_PATTERN = /公开描述提到|进入 GitHub Trending|需要结合仓库页面确认|优先核对 README|实现线索|值得关注的项目|本轮开源榜单|公开页面显示|读者应看项目说明|公开信息只能说明开发者关注度增加|这类项目不应只看星标变化/i;
const TRACKING_FAKE_PATTERN = /openrouter-mini-card|artificial-analysis-mini-card|local_simplified|simplified_metric|simplified_bars|fake benchmark|toy component/i;
const PUBLIC_COPY_GATE_START_DATE = "2026-06-30";
const GITHUB_FAILED_README_METADATA_GATE_START_DATE = "2026-07-09";
const PUBLIC_COPY_BANNED_TERMS = [
  "准入门槛",
  "候选池",
  "信源审计",
  "信源覆盖与缺口",
  "发布质量说明",
  "source_audit",
  "source_effectiveness",
  "source effectiveness",
  "self_check",
  "candidate_id",
  "材料覆盖",
  "边界落在",
  "落地质量取决于",
  "已披露事实集中在",
  "已披露细节覆盖",
  "更新AI 产品、平台或工程实践",
  "更新 AI 产品、平台或工程实践",
  "\u66f4\u65b0AI \u4ea7\u54c1\u3001\u5e73\u53f0\u6216\u5de5\u7a0b",
  "\u66f4\u65b0 AI \u4ea7\u54c1\u3001\u5e73\u53f0\u6216\u5de5\u7a0b",
  "说明 AI 产品、平台或工程变化",
  "内容包括功能变化、使用场景、接入方式、限制条件和后续部署边界",
  "公开材料仍需要回到原文核对入口",
  "仍需要回到原文核对入口",
  "今天最值得看的主线有",
  "信号集中在",
  "价值集中在",
  "可用于比较",
  "接口形态",
  "可用于了解项目代码入口",
  "同类方案差异",
  "面向AI 工程实践的开源项目",
  "面向 AI 工程实践的开源项目",
  "README 显示核心能力",
  "给出README 说明和使用入口",
  "给出 README 说明和使用入口",
  "读者应先确认快速开始",
  "这类项目适合先从最小示例复现",
  "测试或评估资产",
  "README 主要围绕",
  "阅读时先看",
  "当前只能确认榜单动量",
  "正式采用前还要核对 README",
  "正式采用前还要核对README",
  "核对 README",
  "核对README",
  "复现门槛",
  "优先核对",
  "需要结合仓库页面确认",
  "进入 GitHub Trending Top",
  "今天进入 GitHub Trending",
  "本轮开源榜单",
  "公开页面显示",
  "读者应看项目说明",
  "公开信息只能说明开发者关注度增加",
  "这类项目不应只看星标变化",
  "面向agent 工作流和自动化工程",
  "面向 agent 工作流和自动化工程",
  "核心能力是",
  "沉淀为代码、示例和集成入口",
  "方便和同类方案做功能与工程成本比较",
  "热度指标是",
  "页面还标出",
  "\u672c\u5468\u699c\u5355\u8bb0\u5f55",
  "downloads\u3001likes",
  "\u793e\u533a\u4f7f\u7528\u70ed\u5ea6",
  "\u5931\u8d25\u6062\u3002",
  "\u914d\u5408\u3002\u6210\u672c",
  "published this intermediary lead entry",
  "This is an intermediary/self-media lead",
  "This is an intermediary/self-media le",
  "trace it to a primary source",
  "\u66f4\u6709\u4ef7\u503c\u7684\u4fe1\u606f\u662f",
  "\u5224\u65ad\u8fd9\u7c7b\u65b9\u6848\u65f6\u8fd8\u8981\u770b",
  "\u6587\u7ae0\u68b3\u7406\u4e00\u4e2a AI \u4ea7\u54c1",
  "\u6587\u7ae0\u62c6\u89e3 agent",
  "\u5df2\u62ab\u9732\u4e8b\u5b9e\u96c6\u4e2d\u5728",
  "\u5df2\u62ab\u9732\u7ec6\u8282\u8986\u76d6",
  "\u516c\u5f00\u6750\u6599\u4ecd\u9700\u8981\u56de\u5230\u539f\u6587\u6838\u5bf9",
  "\u66f4\u65b0agent \u5de5\u4f5c\u6d41\u548c\u5f00\u53d1\u5de5\u5177\u80fd\u529b",
  "\u66f4\u65b0AI \u4ea7\u54c1\u3001\u5e73\u53f0\u6216\u5de5\u7a0b\u5b9e\u8df5",
  "No previous component snapshot was available for comparison."
];
const PUBLIC_COPY_BANNED_PATTERN = new RegExp(PUBLIC_COPY_BANNED_TERMS.map(escapeRegExp).join("|"), "i");

export function evaluateDailyContentContract(report, options = {}) {
  const issues = [];
  const degraded = [];
  const html = String(options.html || "");

  checkStoryFirst(report, issues);
  checkStoryNarrative(report, degraded);
  checkMainItems(report, issues);
  checkGitHubTrending(report, issues);
  checkHotBlogs(report, { html }, issues);
  checkBuilderX(report, issues, degraded);
  checkTrackingComponents(report, { html }, issues, degraded);
  checkPublicCopy(report, { html, enforcePublicCopyGate: options.enforcePublicCopyGate }, issues);

  return {
    ok: issues.length === 0,
    blocking: issues.length > 0,
    issues,
    degraded,
    summary: {
      requirements: {
        "REQ-001": "main news detail bullets",
        "REQ-006": "GitHub Trending Top20 README summaries",
        "REQ-007": "Builder/X eligible selection",
        "REQ-008": "hot blog public summaries",
        "REQ-010": "tracking official component snapshots",
        "REQ-PUBLIC-COPY": "public reader copy does not expose audit wording or banned AI-flavored templates"
      },
      checked: {
        main_items: asArray(report?.main_items).length,
        github_trending: asArray(report?.github_trending).length,
        hot_blogs: asArray(report?.hot_blogs).length,
        builder_observations: asArray(report?.builder_observations).length,
        daily_tracking: asArray(report?.daily_tracking).length,
        public_copy_gate: shouldRunPublicCopyGate(report, { enforcePublicCopyGate: options.enforcePublicCopyGate })
      }
    }
  };
}

export async function evaluateRealArtifactContentContract(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const dataInput = options.dataInput || DEFAULT_DATA_INPUT;
  const htmlInput = options.htmlInput || DEFAULT_HTML_INPUT;
  const latest = normalizeLatestCount(options.latest);
  const artifacts = await discoverReportArtifacts({ rootDir, dataInput, htmlInput, latest });

  if (artifacts.length === 0) {
    const issue = blockingIssue({
      code: "real_artifact_reports_missing",
      requirement: "REQ-003",
      section: "reports-data",
      message: `No real report JSON artifacts found under ${dataInput}.`
    });
    return {
      ok: false,
      blocking: true,
      issues: [issue],
      degraded: [],
      reports: [],
      summary: {
        mode: "real-artifacts",
        data_input: dataInput,
        html_input: htmlInput,
        latest,
        artifacts_checked: 0,
        blocking_reports: 0,
        degraded_reports: 0
      }
    };
  }

  const reports = [];
  const issues = [];
  const degraded = [];

  for (const artifact of artifacts) {
    const report = JSON.parse(await fs.readFile(artifact.reportPath, "utf8"));
    const reportPath = normalizePath(path.relative(rootDir, artifact.reportPath));
    const htmlPath = artifact.htmlPath ? normalizePath(path.relative(rootDir, artifact.htmlPath)) : null;
    const htmlExists = artifact.htmlPath ? await fileExists(artifact.htmlPath) : false;
    const html = htmlExists ? await fs.readFile(artifact.htmlPath, "utf8") : "";
    const result = evaluateDailyContentContract(report, {
      html,
      enforcePublicCopyGate: options.enforcePublicCopyGate
    });
    const reportIssues = [...result.issues];
    if (artifact.htmlPath && !htmlExists) {
      reportIssues.unshift(blockingIssue({
        code: "real_artifact_html_missing",
        requirement: "REQ-003",
        section: "public_html",
        message: `Real report artifact ${reportPath} must have matching public HTML at ${htmlPath}.`,
        details: { expected_html_path: htmlPath }
      }));
    }
    const reportEntry = {
      report_date: artifact.reportDate,
      report_path: reportPath,
      html_path: htmlPath,
      ok: reportIssues.length === 0,
      blocking: reportIssues.length > 0,
      issue_count: reportIssues.length,
      degraded_count: result.degraded.length,
      issues: reportIssues,
      degraded: result.degraded,
      summary: result.summary
    };
    reports.push(reportEntry);
    for (const issue of reportIssues) {
      issues.push({ report_date: artifact.reportDate, report_path: reportEntry.report_path, ...issue });
    }
    for (const issue of result.degraded) {
      degraded.push({ report_date: artifact.reportDate, report_path: reportEntry.report_path, ...issue });
    }
  }

  return {
    ok: issues.length === 0,
    blocking: issues.length > 0,
    issues,
    degraded,
    reports,
    summary: {
      mode: "real-artifacts",
      data_input: dataInput,
      html_input: htmlInput,
      latest,
      artifacts_checked: reports.length,
      blocking_reports: reports.filter((report) => report.issue_count > 0).length,
      degraded_reports: reports.filter((report) => report.degraded_count > 0).length
    }
  };
}

async function discoverReportArtifacts(options) {
  const rootDir = options.rootDir || process.cwd();
  const dataRoot = path.resolve(rootDir, options.dataInput || DEFAULT_DATA_INPUT);
  const htmlRoot = path.resolve(rootDir, options.htmlInput || DEFAULT_HTML_INPUT);
  const files = [];
  await collectReportJsonFiles(dataRoot, dataRoot, files);
  files.sort((a, b) => a.reportDate.localeCompare(b.reportDate) || a.reportPath.localeCompare(b.reportPath));
  return files.slice(-normalizeLatestCount(options.latest)).map((artifact) => ({
    ...artifact,
    htmlPath: matchingHtmlPath(htmlRoot, artifact.reportDate)
  }));
}

async function collectReportJsonFiles(dir, dataRoot, files) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectReportJsonFiles(absolutePath, dataRoot, files);
      continue;
    }
    const relativePath = normalizePath(path.relative(dataRoot, absolutePath));
    const match = relativePath.match(/^(\d{4})\/(\d{2})\/(\d{4}-\d{2}-\d{2})\.json$/);
    if (!match) {
      continue;
    }
    const [, year, month, reportDate] = match;
    if (!reportDate.startsWith(`${year}-${month}-`)) {
      continue;
    }
    files.push({ reportDate, reportPath: absolutePath });
  }
}

function matchingHtmlPath(htmlRoot, reportDate) {
  const [year, month] = reportDate.split("-");
  return path.join(htmlRoot, year, month, `${reportDate}.html`);
}

async function fileExists(filePath) {
  try {
    return (await fs.stat(filePath)).isFile();
  } catch {
    return false;
  }
}

function normalizeLatestCount(value) {
  const number = Number(value ?? DEFAULT_LATEST_COUNT);
  if (!Number.isFinite(number) || number < 1) {
    return DEFAULT_LATEST_COUNT;
  }
  return Math.floor(number);
}

// Deterministic story-narrative templates emitted by story-first.js fallback.
// On a real report these mean the story was not authored from its source; we
// surface it as DEGRADED (visible, non-blocking) rather than letting the
// structural contract silently pass templated prose.
const STORY_TEMPLATE_NARRATIVE_RE = /材料覆盖|材料把[^。]*落到|边界落在落地质量取决于|已披露事实集中在|更新agent\s*工作流和开发工具能力|更新AI\s*产品、平台或工程实践|披露模型能力和评估方法更新/u;

function checkStoryNarrative(report, degraded) {
  const stories = asArray(report?.stories);
  const templated = [];
  stories.forEach((story, index) => {
    for (const field of ["title", "what_happened", "why_it_matters"]) {
      const text = textValue(story?.[field]);
      if (text && STORY_TEMPLATE_NARRATIVE_RE.test(text)) {
        templated.push(`stories[${index}].${field}`);
      }
    }
  });
  if (templated.length > 0) {
    degraded.push(degradedIssue({
      code: "story_template_narrative",
      requirement: "REQ-003",
      section: "stories",
      message: `${templated.length} story field(s) still use deterministic template prose instead of source-grounded authoring: ${templated.slice(0, 8).join(", ")}.`
    }));
  }
}

function checkStoryFirst(report, issues) {
  const stories = asArray(report?.stories);
  const mainItems = asArray(report?.main_items);
  if (mainItems.length > 0 && stories.length === 0) {
    issues.push(blockingIssue({
      code: "story_first_stories_missing",
      requirement: "REQ-STORY-001",
      section: "stories",
      message: "Daily reports with main_items must expose the edited story-first list in stories[]."
    }));
    return;
  }

  if (stories.length > STORY_FIRST_MAX) {
    issues.push(blockingIssue({
      code: "story_first_story_limit_exceeded",
      requirement: "REQ-STORY-001",
      section: "stories",
      message: `The main story list must not exceed ${STORY_FIRST_MAX} stories.`,
      count: stories.length
    }));
  }

  const weakStories = [];
  const storyUrlOwners = new Map();
  for (const [index, story] of stories.entries()) {
    const sources = asArray(story?.sources);
    const requiredMissing = !textValue(story?.title) ||
      !textValue(story?.what_happened) ||
      !textValue(story?.why_it_matters) ||
      !textValue(story?.evidence_level) ||
      sources.length === 0;
    const templatedTitle = isTemplatedStoryTitle(story?.title);
    if (requiredMissing || templatedTitle) {
      weakStories.push({
        index,
        title: textValue(story?.title),
        required_missing: requiredMissing,
        templated_title: templatedTitle
      });
    }
    for (const source of sources) {
      const url = canonicalStoryUrl(source?.url);
      if (!url) continue;
      const storyId = textValue(story?.story_id) || `stories[${index}]`;
      const existing = storyUrlOwners.get(url);
      if (existing && existing !== storyId) {
        issues.push(blockingIssue({
          code: "story_first_duplicate_story_url",
          requirement: "REQ-STORY-002",
          section: "stories",
          message: "The same canonical source URL cannot belong to more than one story.",
          details: { url, first_story: existing, duplicate_story: storyId }
        }));
      }
      storyUrlOwners.set(url, storyId);
    }
  }

  if (weakStories.length > 0) {
    issues.push(blockingIssue({
      code: "story_first_story_shape_failed",
      requirement: "REQ-STORY-001",
      section: "stories",
      message: "Each story needs a concrete title, what_happened, why_it_matters, evidence_level, and sources[].",
      count: weakStories.length,
      examples: weakStories.slice(0, 5)
    }));
  }

  const mainUrls = new Set(mainItems.flatMap((item) => itemUrls(item)));
  const duplicateLowerUrls = [];
  for (const sectionName of [
    "model_releases",
    "hot_blogs",
    "community_leads",
    "builder_observations",
    "projects",
    "official_org_updates",
    "wechat_items",
    "zhihu_items",
    "reddit_items"
  ]) {
    for (const item of asArray(report?.[sectionName])) {
      const duplicates = itemUrls(item).filter((url) => mainUrls.has(url));
      if (duplicates.length > 0) {
        duplicateLowerUrls.push({ section: sectionName, url: duplicates[0], title: textValue(item?.title || item?.name || item?.repo) });
      }
    }
  }
  if (duplicateLowerUrls.length > 0) {
    issues.push(blockingIssue({
      code: "story_first_main_url_repeated_in_appendix",
      requirement: "REQ-STORY-002",
      section: "stories",
      message: "Main story URLs must not be repeated as separate lower-priority leads or project cards.",
      count: duplicateLowerUrls.length,
      examples: duplicateLowerUrls.slice(0, 5)
    }));
  }

  // GitHub-matching projects may remain as structured metadata for the compact
  // GitHub Trending module. The public renderer must not turn them into a
  // standalone project-card grid.
}

function checkMainItems(report, issues) {
  const mainItems = asArray(report?.main_items);
  const failing = mainItems.filter((item) => {
    const bullets = asArray(item?.bullets)
      .map((bullet) => textValue(bullet))
      .filter(Boolean);
    const usefulBullets = bullets.filter((bullet) => chineseCharCount(bullet) >= 24 && !MAIN_FILLER_PATTERN.test(bullet));
    return bullets.length < 2 || usefulBullets.length < 2;
  });

  if (failing.length > 0) {
    issues.push(blockingIssue({
      code: "main_news_bullet_contract_failed",
      requirement: "REQ-001",
      section: "main_items",
      message: "Main news details need at least two concrete news-writing bullets and cannot rely on process/filler copy.",
      count: failing.length,
      examples: failing.slice(0, 3).map((item) => textValue(item?.title) || textValue(item?.url))
    }));
  }

  const unauthoredSummaries = mainItems.filter((item) => mainItemSummaryNotAuthored(item));
  if (unauthoredSummaries.length > 0) {
    issues.push(blockingIssue({
      code: "main_news_summary_not_authored",
      requirement: "REQ-001",
      section: "main_items",
      message: "Main news summaries must be reader-facing news copy, not a title repeat, repo slug, or nearly empty placeholder.",
      count: unauthoredSummaries.length,
      examples: unauthoredSummaries.slice(0, 5).map((item) => textValue(item?.title) || textValue(item?.url))
    }));
  }
}

function mainItemSummaryNotAuthored(item) {
  const title = normalizeWhitespace(textValue(item?.title)).replace(/[。.!！?？\s]+$/u, "").toLowerCase();
  const summary = normalizeWhitespace(textValue(item?.summary)).replace(/[。.!！?？\s]+$/u, "");
  const normalizedSummary = summary.toLowerCase();
  if (!summary) {
    return true;
  }
  if (title && normalizedSummary === title) {
    return true;
  }
  if (/^[\w.-]+\/[\w.-]+$/u.test(summary)) {
    return true;
  }
  return chineseCharCount(summary) < 18;
}

function checkGitHubTrending(report, issues) {
  const entries = asArray(report?.github_trending);
  if (entries.length < 20) {
    issues.push(blockingIssue({
      code: "github_trending_top20_missing",
      requirement: "REQ-006",
      section: "github_trending",
      message: "GitHub Trending must merge weekly all-language/Python/TypeScript/Rust/Go/Java Top10 lists and publish up to Top20 after dedupe.",
      count: entries.length
    }));
  }

  const scope = githubScope(report, entries);
  const missingLanguages = REQUIRED_GITHUB_LANGUAGES.filter((language) => !scope.languages.has(language.toLowerCase()));
  const hasOnlyWeekly = entries.length > 0 && entries.every((item) => textValue(item?.window).toLowerCase() === "weekly" || /weekly/i.test(textValue(item?.source)));
  if (missingLanguages.length > 0 || !hasOnlyWeekly) {
    issues.push(blockingIssue({
      code: "github_trending_weekly_scope_incomplete",
      requirement: "REQ-006",
      section: "github_trending",
      message: "GitHub Trending scope must be weekly all-language plus Python, TypeScript, Rust, Go, and Java.",
      details: { missing_languages: missingLanguages, weekly_only: hasOnlyWeekly }
    }));
  }

  const weakSummaries = [];
  const inventedReadmeFailures = [];
  const failedReadmeMetadataMissing = [];
  const enforceFailedReadmeMetadata = isAtOrAfterDate(
    report?.report_date,
    GITHUB_FAILED_README_METADATA_GATE_START_DATE
  );
  for (const item of entries.slice(0, Math.max(entries.length, 20))) {
    if (isReadmeFetchFailed(item)) {
      const description = textValue(item?.description);
      if (description && !/README拉取失败/i.test(description) && chineseCharCount(description) >= 20) {
        inventedReadmeFailures.push(repoName(item));
      }
      if (enforceFailedReadmeMetadata && !hasFailedReadmeTrendMetadata(item)) {
        failedReadmeMetadataMissing.push(repoName(item));
      }
      continue;
    }

    const summary = textValue(item?.readme_summary || item?.readmeSummary || item?.description);
    if (chineseCharCount(summary) < 80 || chineseCharCount(summary) > 220 || GITHUB_FILLER_PATTERN.test(summary)) {
      weakSummaries.push(repoName(item));
    }
  }

  if (weakSummaries.length > 0) {
    issues.push(blockingIssue({
      code: "github_trending_readme_summary_missing",
      requirement: "REQ-006",
      section: "github_trending",
      message: "GitHub Trending items need README-grounded Chinese summaries around 100 characters, unless README fetch explicitly failed.",
      count: weakSummaries.length,
      examples: weakSummaries.slice(0, 5)
    }));
  }

  if (inventedReadmeFailures.length > 0) {
    issues.push(blockingIssue({
      code: "github_trending_failed_readme_description_invented",
      requirement: "REQ-006",
      section: "github_trending",
      message: "When README fetch fails, keep rank/star/trend metadata and mark README fetch failed instead of inventing a project description.",
      count: inventedReadmeFailures.length,
      examples: inventedReadmeFailures.slice(0, 5)
    }));
  }

  if (failedReadmeMetadataMissing.length > 0) {
    issues.push(blockingIssue({
      code: "github_trending_failed_readme_metadata_missing",
      requirement: "REQ-006",
      section: "github_trending",
      message: "When README fetch fails, GitHub Trending items must keep rank, star velocity, and trend metadata.",
      count: failedReadmeMetadataMissing.length,
      examples: failedReadmeMetadataMissing.slice(0, 5)
    }));
  }
}

function hasFailedReadmeTrendMetadata(item) {
  return hasPositiveNumber(item?.rank ?? item?.source_rank) &&
    hasStarVelocity(item) &&
    /^(new|up|down|same)$/i.test(textValue(item?.trend));
}

function hasStarVelocity(item) {
  return [
    item?.stars_this_week,
    item?.stars_today,
    item?.weekly_stars,
    item?.daily_stars,
    item?.star_growth,
    item?.stars_delta,
    item?.weekly_star_delta,
    item?.daily_star_delta
  ].some((value) => hasNonNegativeNumber(value));
}

function hasPositiveNumber(value) {
  const number = numericMetadataValue(value);
  return Number.isFinite(number) && number > 0;
}

function hasNonNegativeNumber(value) {
  const number = numericMetadataValue(value);
  return Number.isFinite(number) && number >= 0;
}

function numericMetadataValue(value) {
  const text = textValue(value).replace(/,/g, "");
  if (!text) return NaN;
  return Number(text);
}

function checkHotBlogs(report, options, issues) {
  const hotBlogs = asArray(report?.hot_blogs);
  const weakSummaries = hotBlogs.filter((item) => {
    const summary = textValue(item?.summary || item?.description);
    const length = chineseCharCount(summary);
    return length < 100 || length > 200 || HOT_BLOG_FILLER_PATTERN.test(summary);
  });

  if (weakSummaries.length > 0) {
    issues.push(blockingIssue({
      code: "hot_blog_summary_contract_failed",
      requirement: "REQ-008",
      section: "hot_blogs",
      message: "Public hot blogs need only a 100-200 Chinese-character article summary plus source, not low-information filler.",
      count: weakSummaries.length,
      examples: weakSummaries.slice(0, 3).map((item) => textValue(item?.title) || textValue(item?.url))
    }));
  }

  const html = normalizeWhitespace(options.html || "");
  if (!html) {
    return;
  }
  const renderedKeyPoint = hotBlogs.some((item) => {
    return asArray(item?.key_points).some((point) => {
      const normalizedPoint = normalizeWhitespace(point);
      return normalizedPoint.length >= 4 && html.includes(normalizedPoint);
    });
  });
  if (renderedKeyPoint || /data-public-key-points|hot-blog-key-points|key_points/i.test(html)) {
    issues.push(blockingIssue({
      code: "hot_blog_public_key_points_rendered",
      requirement: "REQ-008",
      section: "hot_blogs",
      message: "Public hot blog cards must not render key_points; render only the article summary and source."
    }));
  }
}

function checkBuilderX(report, issues, degraded) {
  const audit = report?.source_audit?.builder_sources || {};
  const sources = asArray(audit.sources);
  const checkedXFeed = sources.some((source) => {
    const sourceText = `${textValue(source?.name)} ${textValue(source?.url)}`;
    return /follow-builders x feed|feed-x\.json/i.test(sourceText) && /^checked$/i.test(textValue(source?.status));
  });

  if (!checkedXFeed) {
    return;
  }

  const selection = report?.self_check?.selection_snapshot?.builder_observations || {};
  const eligible = firstNumber(
    selection.eligible_after_filter,
    selection.eligible_after_ai_filter,
    selection.filtered_eligible,
    selection.eligible_candidates_after_filter,
    selection.eligible_candidates,
    parseEligibleCountFromSources(sources)
  );
  const selected = firstNumber(selection.selected, selection.included, asArray(report?.builder_observations).length) ?? 0;

  if (eligible == null) {
    degraded.push(degradedIssue({
      code: "builder_x_eligible_count_missing",
      requirement: "REQ-007",
      section: "builder_observations",
      message: "follow-builders X feed was checked, but eligible-after-filter count was not recorded for deterministic gating."
    }));
    return;
  }

  if (eligible >= 3 && selected === 0) {
    issues.push(blockingIssue({
      code: "builder_x_selection_empty",
      requirement: "REQ-007",
      section: "builder_observations",
      message: "If the X feed has at least 3 eligible AI/tech candidates after filtering, Builder observations cannot select 0.",
      details: { eligible_after_filter: eligible, selected }
    }));
  }
}

function checkTrackingComponents(report, options, issues, degraded) {
  const trackingItems = asArray(report?.daily_tracking).filter((item) => {
    const name = textValue(item?.name || item?.source || item?.id);
    return /openrouter|artificial analysis|swe[-\s]?bench/i.test(name);
  });
  const html = String(options.html || "");

  if (hasPublicTrackingDebugTrace(html)) {
    issues.push(blockingIssue({
      code: "tracking_public_debug_trace_visible",
      requirement: "REQ-010",
      section: "daily_tracking",
      message: "Public tracking cards must not render selector/hash/Trace debug provenance; keep it in JSON evidence only."
    }));
  }

  for (const item of trackingItems) {
    const name = textValue(item?.name || item?.source || item?.id) || "tracking source";
    const publishToPublic = item?.publish_to_public !== false;
    const hasOfficialSnapshot = hasOfficialTrackingSnapshot(item);
    const sourceUnavailableNote = textValue(item?.source_unavailable_note || item?.unavailable_note || item?.verification_note);

    if (!hasOfficialSnapshot && publishToPublic) {
      degraded.push(degradedIssue({
        code: "tracking_official_component_missing",
        requirement: "REQ-010",
        section: "daily_tracking",
        message: `${name} is visible but does not carry a sanitized official DOM/CSS snapshot.`
      }));
    }

    if (/artificial analysis/i.test(name) && !hasOfficialSnapshot && !publishToPublic && !sourceUnavailableNote) {
      degraded.push(degradedIssue({
        code: "artificial_analysis_source_unavailable_note_missing",
        requirement: "REQ-010",
        section: "daily_tracking",
        message: "Artificial Analysis must show a source-unavailable note when its official snapshot is absent and the data card is hidden."
      }));
    }

    if (publishToPublic && (isFakeTrackingComponent(item) || TRACKING_FAKE_PATTERN.test(html))) {
      issues.push(blockingIssue({
        code: "tracking_fake_component_rendered",
        requirement: "REQ-010",
        section: "daily_tracking",
        message: `${name} cannot be rendered as a fake simplified component; use official sanitized snapshots or hide the card.`
      }));
    }
  }
}

function checkPublicCopy(report, options, issues) {
  if (!shouldRunPublicCopyGate(report, options)) {
    return;
  }
  const hits = publicCopyHits(report, options);
  if (hits.length === 0) {
    return;
  }
  issues.push(blockingIssue({
    code: "public_copy_banned_audit_or_template_wording",
    requirement: "REQ-PUBLIC-COPY",
    section: "public_copy",
    message: "Public daily copy must not expose machine-audit wording, source-gate wording, or user-banned AI-flavored templates.",
    count: hits.length,
    examples: hits.slice(0, 8)
  }));
}

function shouldRunPublicCopyGate(report, options = {}) {
  if (options.enforcePublicCopyGate === false) {
    return false;
  }
  return isAtOrAfterDate(report?.report_date, PUBLIC_COPY_GATE_START_DATE);
}

function isAtOrAfterDate(value, cutoff) {
  const date = textValue(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= cutoff;
}

function publicCopyHits(report, options = {}) {
  const fields = collectPublicReportFields(report);
  const htmlText = visibleHtmlText(options.html || "");
  if (htmlText) {
    fields.push({ path: "html", text: htmlText });
  }
  const hits = [];
  for (const field of fields) {
    const text = normalizeWhitespace(field.text);
    const match = text.match(PUBLIC_COPY_BANNED_PATTERN);
    if (!match) {
      continue;
    }
    hits.push({
      path: field.path,
      term: match[0],
      excerpt: excerptAround(text, match.index || 0, match[0].length)
    });
  }
  return hits;
}

function collectPublicReportFields(report = {}) {
  const fields = [];
  for (const field of ["title", "summary", "hero_summary", "report_date"]) {
    pushPublicText(fields, field, report?.[field]);
  }
  for (const sectionName of [
    "stories",
    "main_items",
    "model_releases",
    "hot_blogs",
    "chinese_media_dynamics",
    "daily_tracking",
    "projects",
    "github_trending",
    "huggingface_trending",
    "builder_observations",
    "official_org_updates",
    "community_leads"
  ]) {
    asArray(report?.[sectionName]).forEach((item, index) => {
      collectPublicItemFields(fields, `${sectionName}[${index}]`, item);
    });
  }
  return fields;
}

function collectPublicItemFields(fields, basePath, item) {
  if (!item || typeof item !== "object") {
    pushPublicText(fields, basePath, item);
    return;
  }
  for (const [key, value] of Object.entries(item)) {
    if (isInternalPublicCopyKey(key)) {
      continue;
    }
    const nextPath = `${basePath}.${key}`;
    if (Array.isArray(value)) {
      value.forEach((entry, index) => collectPublicItemFields(fields, `${nextPath}[${index}]`, entry));
    } else if (value && typeof value === "object") {
      collectPublicItemFields(fields, nextPath, value);
    } else {
      pushPublicText(fields, nextPath, value);
    }
  }
}

function isInternalPublicCopyKey(key) {
  return /^(?:candidate_id|source_audit|self_check|quality_status|selection_snapshot|debug|raw|notes|status|source_id|rule_id|verification_status|verification_note|matched_terms|included_in|published_by|degraded_sections|evidence|evidence_assets|readme_summary|github_readme_summary|tracking_component_snapshot|component_snapshot|source_component_snapshot|public_trace|diff|key_points)$/i.test(String(key || ""));
}

function pushPublicText(fields, pathName, value) {
  if (typeof value !== "string" && typeof value !== "number") {
    return;
  }
  const text = textValue(value);
  if (text) {
    fields.push({ path: pathName, text });
  }
}

function visibleHtmlText(html) {
  return stripHtmlToVisibleText(String(html || ""))
    .replace(/&(?:nbsp|#160|#x[aA]0);/gi, " ");
}

function stripHtmlToVisibleText(input) {
  const ignoredRawTextTags = new Set(["script", "style", "template"]);
  let output = "";
  let index = 0;
  let skippedTag = "";

  while (index < input.length) {
    const nextTagStart = input.indexOf("<", index);
    if (nextTagStart === -1) {
      if (!skippedTag) {
        output += input.slice(index);
      }
      break;
    }

    if (!skippedTag) {
      output += `${input.slice(index, nextTagStart)} `;
    }

    const tagEnd = input.indexOf(">", nextTagStart + 1);
    if (tagEnd === -1) {
      break;
    }

    const tag = parseHtmlTag(input.slice(nextTagStart + 1, tagEnd));
    if (skippedTag) {
      if (tag.closing && tag.name === skippedTag) {
        skippedTag = "";
      }
    } else if (!tag.closing && !tag.selfClosing && ignoredRawTextTags.has(tag.name)) {
      skippedTag = tag.name;
    }

    index = tagEnd + 1;
  }

  return output;
}

function parseHtmlTag(rawTag) {
  const trimmed = String(rawTag || "").trim();
  const closing = trimmed.startsWith("/");
  const body = closing ? trimmed.slice(1).trimStart() : trimmed;
  const name = (body.match(/^[A-Za-z][A-Za-z0-9:-]*/) || [""])[0].toLowerCase();
  return {
    name,
    closing,
    selfClosing: /\/\s*$/.test(body)
  };
}

function excerptAround(text, index, length) {
  const start = Math.max(0, index - 24);
  const end = Math.min(text.length, index + length + 36);
  return text.slice(start, end);
}

function hasPublicTrackingDebugTrace(html) {
  if (!html) {
    return false;
  }
  return /<details\b[^>]*class=["'][^"']*\btracking-trace\b|data-tracking-trace|tracking-component-meta[^>]*>[^<]*(selector:|sha256:)/i.test(html);
}

function githubScope(report, entries) {
  const languages = new Set();
  for (const item of entries) {
    const language = textValue(item?.language || item?.lang);
    if (language) languages.add(language.toLowerCase());
    const source = textValue(item?.source);
    for (const required of REQUIRED_GITHUB_LANGUAGES) {
      if (required === "all" && /GitHub Trending (all[- ]language|weekly)$/i.test(source)) {
        languages.add("all");
      } else if (new RegExp(`\\b${escapeRegExp(required)}\\b`, "i").test(source)) {
        languages.add(required.toLowerCase());
      }
    }
  }

  const configuredLanguages = asArray(report?.self_check?.github_trending_scope?.languages);
  for (const language of configuredLanguages) {
    const text = textValue(language);
    if (text) languages.add(text.toLowerCase());
  }

  return { languages };
}

function hasOfficialTrackingSnapshot(item) {
  const snapshot = item?.component_snapshot || item?.source_component_snapshot || item?.tracking_component_snapshot || {};
  const official = item?.official_component_snapshot || item?.snapshot?.official_component_snapshot || snapshot?.official_component_snapshot;
  if (official && isPublishableOfficialSnapshot(official)) {
    return true;
  }
  const directOfficial = textValue(item?.official_dom_snapshot || snapshot?.official_dom_snapshot || snapshot?.official_html_snapshot);
  const directSanitized = textValue(item?.sanitized_dom_snapshot || snapshot?.sanitized_dom_snapshot || snapshot?.sanitized_html_snapshot);
  const kind = textValue(snapshot?.kind || snapshot?.source || item?.snapshot_kind);
  return Boolean(directOfficial && directSanitized) || /official_dom_snapshot|official_snapshot/i.test(kind);
}

function isPublishableOfficialSnapshot(official) {
  const html = textValue(official?.sanitized_html || official?.html || official?.sanitizedHtml);
  const selector = textValue(official?.source_selector || official?.sourceSelector).toLowerCase().replace(/\s+/g, " ");
  if (!html || !textValue(official?.dom_hash || official?.domHash)) {
    return false;
  }
  if (["html", "body", "main", "#root", "#__next"].includes(selector)) {
    return false;
  }
  if (html.length > 30000 || /^<\s*(html|body|main)(?:\s|>)/i.test(html)) {
    return false;
  }
  const rowLikeCount = (html.match(/<\s*tr\b|role\s*=\s*["']row["']|<\s*li\b/gi) || []).length;
  const hasStructuredSurface = /<\s*table\b|role\s*=\s*["']table["']/i.test(html) || rowLikeCount > 0;
  const hasComponentMarker = /data-[^=]*(openrouter|ranking|leaderboard|analysis|index|aa)|class\s*=\s*["'][^"']*(ranking|leaderboard|analysis|index|card)/i.test(html);
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text.length >= 20 && (hasStructuredSurface || hasComponentMarker);
}

function isFakeTrackingComponent(item) {
  const serialized = JSON.stringify(item || {});
  return TRACKING_FAKE_PATTERN.test(serialized);
}

function isReadmeFetchFailed(item) {
  const status = textValue(item?.readme_fetch_status || item?.readme_status || item?.readme?.status);
  return /fail|failed|error|unavailable|blocked|timeout/i.test(status) || Boolean(item?.readme_error);
}

function parseEligibleCountFromSources(sources) {
  for (const source of sources) {
    const notes = textValue(source?.notes);
    const match = notes.match(/(\d+)\s+(?:eligible|合格|AI\/tech)/i);
    if (match) return Number(match[1]);
  }
  return null;
}

function blockingIssue(input) {
  return {
    severity: "blocking",
    ...input
  };
}

function degradedIssue(input) {
  return {
    severity: "degraded",
    ...input
  };
}

function repoName(item) {
  return textValue(item?.repo || item?.name || item?.url) || "unknown repo";
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function textValue(value) {
  return String(value ?? "").trim();
}

function normalizePath(value) {
  return String(value || "").replace(/\\/g, "/");
}

function itemUrls(item) {
  return [
    item?.url,
    item?.primary_url,
    item?.source_url,
    ...(Array.isArray(item?.verification_sources) ? item.verification_sources : [])
  ].map((value) => canonicalStoryUrl(value)).filter(Boolean);
}

function normalizeWhitespace(value) {
  return textValue(value).replace(/\s+/g, " ");
}

function chineseCharCount(value) {
  return (textValue(value).match(/[\u3400-\u9fff]/g) || []).length;
}

function firstNumber(...values) {
  for (const value of values) {
    if (value == null || value === "") continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function runCli(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    printUsage();
    return 0;
  }

  if (!args.selfTest && !args.report) {
    const result = await evaluateRealArtifactContentContract({
      dataInput: args.dataInput,
      htmlInput: args.htmlInput,
      latest: args.latest
    });
    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printHumanResult(result);
    }
    return result.ok ? 0 : 1;
  }

  let report;
  let html = "";
  if (args.selfTest) {
    report = selfTestReport();
    html = '<section id="hot-blogs"><article><p>合规摘要只展示文章概括和来源。</p></article></section>';
  } else {
    if (!args.report) {
      throw new Error("Missing --report <path>. Use --self-test for the no-network smoke gate.");
    }
    report = JSON.parse(await fs.readFile(args.report, "utf8"));
    if (args.html) {
      html = await fs.readFile(args.html, "utf8");
    }
  }

  const result = evaluateDailyContentContract(report, { html });
  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printHumanResult(result);
  }
  return result.ok ? 0 : 1;
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--report") {
      args.report = argv[++index];
    } else if (arg === "--html") {
      args.html = argv[++index];
    } else if (arg === "--data-input") {
      args.dataInput = argv[++index];
    } else if (arg === "--html-input") {
      args.htmlInput = argv[++index];
    } else if (arg === "--latest") {
      args.latest = argv[++index];
    } else if (arg === "--json") {
      args.json = true;
    } else if (arg === "--self-test") {
      args.selfTest = true;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function printUsage() {
  console.log([
    "Usage:",
    "  node scripts/check-daily-content-contract.mjs [--data-input reports-data] [--html-input docs/reports] [--latest 3] [--json]",
    "  node scripts/check-daily-content-contract.mjs --report <report.json> [--html <report.html>] [--json]",
    "  node scripts/check-daily-content-contract.mjs --self-test [--json]"
  ].join("\n"));
}

function printHumanResult(result) {
  const status = result.ok ? "passed" : "failed";
  console.log(`Daily content contract ${status}.`);
  if (result.summary?.mode === "real-artifacts") {
    console.log(`Checked ${result.summary.artifacts_checked} real report artifact(s); blocking reports: ${result.summary.blocking_reports}; degraded reports: ${result.summary.degraded_reports}.`);
  }
  for (const issue of result.issues) {
    const prefix = issue.report_date ? `${issue.report_date} ` : "";
    console.log(`BLOCKING ${prefix}${issue.requirement} ${issue.code}: ${issue.message}`);
  }
  for (const issue of result.degraded) {
    const prefix = issue.report_date ? `${issue.report_date} ` : "";
    console.log(`DEGRADED ${prefix}${issue.requirement} ${issue.code}: ${issue.message}`);
  }
}

function selfTestReport() {
  const github = Array.from({ length: 20 }, (_, index) => {
    const language = REQUIRED_GITHUB_LANGUAGES[index % REQUIRED_GITHUB_LANGUAGES.length];
    const repo = `example/self-test-agent-${index + 1}`;
    const summary = `${repo} 把任务编排、浏览器自动化、失败截图和本地调试入口组织成可复现的 agent 工作流，README 展示安装命令、示例任务、扩展点和权限边界，适合团队先跑通小范围自动化，再评估是否接入内部研发平台。它的价值在于让操作日志、错误恢复和结果校验都能被审计。`;
    return {
      name: repo,
      repo,
      readme_summary: summary,
      description: summary,
      readme_fetch_status: "ok",
      url: `https://github.com/example/self-test-agent-${index + 1}`,
      source: `GitHub Trending ${language} weekly`,
      language,
      window: "weekly",
      rank: (index % 10) + 1,
      trend: "new"
    };
  });

  return {
    report_date: "2026-06-17",
    stories: [
      {
        story_id: "story-content-platform-signal",
        title: "Content platform ships personalized creator controls",
        event_date: "2026-06-17",
        what_happened: "平台发布新的个性化控制功能，并披露可观察的内容分发变化。",
        why_it_matters: "内容和产品团队可以据此判断推荐权重、创作者分发和广告库存是否需要跟进。",
        evidence_level: "primary",
        sources: [{ label: "Example", url: "https://example.com/news", type: "primary" }]
      }
    ],
    main_items: [
      {
        candidate_id: "story-content-platform-signal",
        title: "Content platform signal",
        url: "https://example.com/news",
        source: "Example",
        summary: "平台发布新的个性化控制功能，并披露内容分发入口出现可观察变化。对产品和内容团队来说，这会影响用户停留、创作者分发和广告库存，需要继续跟踪推荐权重和功能使用数据。",
        bullets: [
          "平台发布新的个性化控制功能，并披露关键增长数据，说明内容分发入口正在发生可观察变化。",
          "该变化会影响用户停留、创作者分发和广告库存，产品与内容团队需要跟踪后续推荐权重。"
        ]
      }
    ],
    github_trending: github,
    hot_blogs: [
      {
        title: "Agent engineering",
        url: "https://example.com/blog",
        publisher: "Example",
        summary: "这篇文章围绕长运行 agent 的工程化落地展开，先说明任务规划、上下文压缩、工具权限、失败重试和结果校验为什么必须拆成独立边界，再用真实自动化流程解释如何记录证据、回放决策和隔离高风险操作。对研发团队而言，它提供的是可用于评估代理平台的架构清单。"
      }
    ],
    builder_observations: [
      {
        author: "Builder",
        translation: "作者分享了面向 coding agent 的确定性评估 harness，重点是把任务输入、工具调用、失败证据和回放日志放在同一条链路里。",
        url: "https://x.com/example/status/1800000000000000000",
        source: "follow-builders X feed"
      }
    ],
    daily_tracking: [
      {
        name: "OpenRouter",
        publish_to_public: true,
        component_snapshot: {
          kind: "official_dom_snapshot",
          official_dom_snapshot: "<section data-openrouter-rankings></section>",
          sanitized_dom_snapshot: "<section class=\"tracking-snapshot\"></section>"
        }
      },
      {
        name: "Artificial Analysis",
        publish_to_public: false,
        source_unavailable_note: "官方 snapshot 不可用，本轮隐藏数据卡。"
      }
    ],
    source_audit: {
      builder_sources: {
        checked: true,
        candidates_found: 3,
        sources: [{ name: "follow-builders X feed", status: "checked", notes: "3 eligible AI/tech candidates after filtering." }]
      }
    },
    self_check: {
      github_trending_scope: {
        window: "weekly",
        languages: REQUIRED_GITHUB_LANGUAGES,
        per_source_top_n: 10,
        deduped_limit: 20
      },
      selection_snapshot: {
        builder_observations: { eligible_after_filter: 3, selected: 1 }
      }
    }
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  runCli(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(error?.stack || error?.message || String(error));
      process.exitCode = 1;
    });
}
