#!/usr/bin/env node
import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";

const REQUIRED_GITHUB_LANGUAGES = ["all", "Python", "TypeScript", "Rust", "Go", "Java"];
const MAIN_FILLER_PATTERN = /材料覆盖|边界落在|后续观察|读者可核对|可继续关注|本轮材料|信息较为有限|公开描述提到|需要结合/i;
const HOT_BLOG_FILLER_PATTERN = /原文说明|读者可核对|继续留意|本文可作为|信息较为有限|后续观察|可继续关注|材料覆盖/i;
const GITHUB_FILLER_PATTERN = /公开描述提到|进入 GitHub Trending|需要结合仓库页面确认|优先核对 README|实现线索|值得关注的项目/i;
const TRACKING_FAKE_PATTERN = /openrouter-mini-card|artificial-analysis-mini-card|local_simplified|simplified_metric|simplified_bars|fake benchmark|toy component/i;

export function evaluateDailyContentContract(report, options = {}) {
  const issues = [];
  const degraded = [];
  const html = String(options.html || "");

  checkMainItems(report, issues);
  checkGitHubTrending(report, issues);
  checkHotBlogs(report, { html }, issues);
  checkBuilderX(report, issues, degraded);
  checkTrackingComponents(report, { html }, issues, degraded);

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
        "REQ-010": "tracking official component snapshots"
      },
      checked: {
        main_items: asArray(report?.main_items).length,
        github_trending: asArray(report?.github_trending).length,
        hot_blogs: asArray(report?.hot_blogs).length,
        builder_observations: asArray(report?.builder_observations).length,
        daily_tracking: asArray(report?.daily_tracking).length
      }
    }
  };
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
  for (const item of entries.slice(0, Math.max(entries.length, 20))) {
    if (isReadmeFetchFailed(item)) {
      const description = textValue(item?.description);
      if (description && !/README拉取失败/i.test(description) && chineseCharCount(description) >= 20) {
        inventedReadmeFailures.push(repoName(item));
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
    return /openrouter|artificial analysis/i.test(name);
  });
  const html = String(options.html || "");

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
    "  node scripts/check-daily-content-contract.mjs --report <report.json> [--html <report.html>] [--json]",
    "  node scripts/check-daily-content-contract.mjs --self-test [--json]"
  ].join("\n"));
}

function printHumanResult(result) {
  const status = result.ok ? "passed" : "failed";
  console.log(`Daily content contract ${status}.`);
  for (const issue of result.issues) {
    console.log(`BLOCKING ${issue.requirement} ${issue.code}: ${issue.message}`);
  }
  for (const issue of result.degraded) {
    console.log(`DEGRADED ${issue.requirement} ${issue.code}: ${issue.message}`);
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
    main_items: [
      {
        title: "Content platform signal",
        url: "https://example.com/news",
        source: "Example",
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
