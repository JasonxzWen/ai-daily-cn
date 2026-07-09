// Binds the daily content contract to generation-first quality on real reports.
//
// The structural contract used to pass templated story prose silently. It now
// surfaces templated story narrative as a DEGRADED (non-blocking) signal, so a
// real report that ships deterministic template prose is visibly flagged rather
// than passing clean. Also guards that real committed reports carry no BLOCKING
// content-contract issues.
//
// Run: node --test tests/content-contract.test.js

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { evaluateDailyContentContract, evaluateRealArtifactContentContract } from "../scripts/check-daily-content-contract.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.join(__dirname, "..", "reports-data");

const storyFixture = (whatHappened) => ({
  report_date: "2026-06-24",
  stories: [
    { story_id: "s1", title: "阿里云发布视频生成升级", what_happened: whatHappened, why_it_matters: "面向 AIGC 创作", sources: [{ label: "Alibaba Cloud Blog", url: "https://www.alibabacloud.com/blog/a" }] }
  ],
  main_items: [{
    title: "阿里云发布视频生成升级",
    url: "https://www.alibabacloud.com/blog/a",
    summary: "阿里云发布视频生成模型升级，重点改善人物动作表现、跨帧一致性和整体画面质量。",
    bullets: [
      "阿里云升级视频生成模型，提升一致性与画质。",
      "这条信息来自阿里云原始博客，适合内容和产品团队评估生成视频能力。"
    ]
  }],
  github_trending: [],
  hot_blogs: [],
  builder_observations: []
});

test("content contract flags templated story narrative as degraded (non-blocking)", () => {
  const report = storyFixture("Alibaba Cloud更新agent 工作流和开发工具能力，材料覆盖任务编排、上下文、权限控制，边界落在落地质量取决于权限模型、评估回放、团队流程和可观测性。");
  const result = evaluateDailyContentContract(report);
  const story = result.degraded.filter((d) => d.code === "story_template_narrative");
  assert.equal(story.length, 1, "templated story narrative must be flagged as degraded");
  assert.ok(!result.issues.some((i) => i.code === "story_template_narrative"), "story narrative must not hard-block");
});

test("content contract is clean for authored story narrative", () => {
  const report = storyFixture("阿里云公布视频生成模型 HappyHorse 的新版本，提升人物动作表现力、跨帧生成一致性和整体画面质量。");
  const result = evaluateDailyContentContract(report);
  assert.equal(result.degraded.filter((d) => d.code === "story_template_narrative").length, 0);
});

test("GitHub Trending README failure keeps trend metadata", () => {
  const languages = ["all", "Python", "TypeScript", "Rust", "Go", "Java"];
  const reportDate = "2026-07-09";
  const readmeSummary = "example/repo 是面向 AI 工程团队的开源项目，README 展示核心能力、安装入口、运行示例、集成边界和维护信号，适合先验证依赖、许可证、示例质量和团队接入成本后再进入试点。";
  const githubEntry = (index, overrides = {}) => ({
    repo: `example/github-metadata-${index}`,
    name: `example/github-metadata-${index}`,
    url: `https://github.com/example/github-metadata-${index}`,
    event_date: reportDate,
    source: `GitHub Trending ${languages[index % languages.length]} weekly`,
    language: languages[index % languages.length],
    window: "weekly",
    rank: index + 1,
    stars_this_week: 1000 - index,
    trend: index === 0 ? "new" : "same",
    readme_fetch_status: "ok",
    readme_summary: readmeSummary,
    ...overrides
  });

  const validReport = {
    ...storyFixture("阿里云公布视频生成模型 HappyHorse 的新版本，提升人物动作表现力、跨帧生成一致性和整体画面质量。"),
    report_date: reportDate,
    github_trending: Array.from({ length: 20 }, (_unused, index) => githubEntry(index))
  };
  validReport.github_trending[0] = githubEntry(0, {
    readme_fetch_status: "failed",
    readme_error: "timeout",
    stars_this_week: "1,000",
    description: undefined,
    readme_summary: undefined
  });

  const validResult = evaluateDailyContentContract(validReport);
  assert.equal(
    validResult.issues.some((issue) => issue.code === "github_trending_failed_readme_metadata_missing"),
    false,
    "failed README item with rank, star velocity, and trend should pass this gate"
  );

  const invalidReport = structuredClone(validReport);
  delete invalidReport.github_trending[0].rank;
  delete invalidReport.github_trending[0].stars_this_week;
  delete invalidReport.github_trending[0].trend;
  const invalidResult = evaluateDailyContentContract(invalidReport);
  const issue = invalidResult.issues.find((item) => item.code === "github_trending_failed_readme_metadata_missing");

  assert(issue, "missing rank/star/trend metadata on README failure must block");
  assert.equal(issue.requirement, "REQ-006");
  assert(issue.examples.includes("example/github-metadata-0"));
});

test("public copy gate blocks user-banned audit and AI-flavored wording from 2026-06-30", () => {
  const report = {
    ...storyFixture("OpenAI 披露模型能力更新，材料覆盖评测设置和候选池筛选。"),
    report_date: "2026-06-30"
  };
  const result = evaluateDailyContentContract(report, {
    html: "<main><h2>信源覆盖与缺口</h2><p>准入门槛通过。</p></main>"
  });
  const issues = result.issues.filter((issue) => issue.code === "public_copy_banned_audit_or_template_wording");
  assert.equal(issues.length, 1);
  assert(issues[0].examples.some((example) => example.term === "材料覆盖"));
  assert(issues[0].examples.some((example) => example.term === "信源覆盖与缺口" || example.term === "准入门槛"));
});

test("public copy gate blocks source-first machine log summaries for new reports", () => {
  const report = {
    ...storyFixture("Google 说明 AI 产品、平台或工程变化，内容包括功能变化、使用场景、接入方式、限制条件和后续部署边界。"),
    report_date: "2026-07-02",
    summary: "今天最值得看的主线有 Google Keyword说明 AI 产品、平台或工程变化；热门博客这轮主要看 agent 和开发工具的落地边界。",
    main_items: [
      {
        title: "Google Keyword Blog: Nyc AI Summit",
        summary: "Google Keyword说明 AI 产品、平台或工程变化，内容包括功能变化、使用场景、接入方式、限制条件和后续部署边界，判断时还要看公开材料仍需要回到原文核对入口、权限、价格和适用范围。",
        bullets: [
          "Google 在纽约 AI Summit 中介绍教育机构、供应商和学校如何讨论 AI 培训与课堂试点。",
          "材料涉及教育场景下的采购节奏、教师支持和合作安排。"
        ],
        url: "https://blog.google/products-and-platforms/products/education/nyc-ai-summit/"
      },
      {
        title: "microsoft/HARC-Qwen2.5-7B-Instruct",
        summary: "microsoft/HARC-Qwen2.5-7B-Instruct。",
        bullets: [
          "模型卡显示该仓库发布了基于 Qwen2.5-7B-Instruct 的 HARC 变体。",
          "读者需要看到任务、数据或许可证等具体信息后才能判断是否值得使用。"
        ],
        url: "https://huggingface.co/microsoft/HARC-Qwen2.5-7B-Instruct"
      }
    ]
  };
  const result = evaluateDailyContentContract(report);
  const codes = result.issues.map((issue) => issue.code);

  assert(codes.includes("public_copy_banned_audit_or_template_wording"));
  assert(codes.includes("main_news_summary_not_authored"));
});

test("main news bullets reject deterministic audit follow-up lines", () => {
  const report = storyFixture("OpenAI 发布基础设施复盘，说明崩溃样本如何进入结构化分析。");
  report.main_items[0].bullets = [
    "OpenAI 工程团队把多个 core dump 汇总成可查询数据集，用群体分析定位基础设施崩溃的共性线索。",
    "当前公开的是代码接口、许可证、维护节奏、集成门槛和团队可复用边界。",
    "这会影响研发团队是否把它放进 PoC、评估清单、现有工作流或长期维护计划。"
  ];

  const result = evaluateDailyContentContract(report);

  assert(result.issues.some((issue) => issue.code === "main_news_bullet_contract_failed"));
});

test("public copy gate blocks GitHub/HF template summaries and Chinese-media English fallback", () => {
  const report = {
    ...storyFixture("OpenAI 发布模型能力更新，说明评测设置和使用范围。"),
    report_date: "2026-07-02",
    github_trending: [
      {
        repo: "xbtlin/ai-berkshire",
        description: "ai-berkshire 是面向agent 工作流和自动化工程的开源项目，核心能力是Agent 构建；它把相关能力沉淀为代码、示例和集成入口，方便和同类方案做功能与工程成本比较。"
      }
    ],
    projects: [
      {
        repo: "google-labs-code/design.md",
        description: "google-labs-code/design.md 是本轮开源榜单中的项目，公开页面显示它与工程工具、自动化、基础设施或开发者工作流相关。读者应看项目说明、安装步骤、示例质量、许可证、最近提交、问题区反馈和维护者回应，再判断是否适合试用或继续跟踪。"
      },
      {
        repo: "ogulcancelik/herdr",
        description: "herdr 是终端里的 agent multiplexer，真正可用性取决于任务面板、日志保留、失败恢复和与本地 worktree 策略的配合。成本。"
      }
    ],
    huggingface_trending: [
      {
        repo: "deepseek-ai/DeepSeek-R1",
        description: "deepseek-ai/DeepSeek-R1 是 Hugging Face 上的文本生成模型，热度指标是 7849894 downloads、13425 likes；页面还标出 task: text-generation。"
      },
      {
        repo: "black-forest-labs/FLUX.1-dev",
        description: "black-forest-labs/FLUX.1-dev 是 Hugging Face 上的图像生成模型。本周榜单记录 1090527 downloads、13429 likes，说明仍有较高社区使用热度；真正选型还要看模型卡、许可证、推理成本和限制。"
      }
    ],
    hot_blogs: [
      {
        title: "OpenAI 更新 agent 工作流和开发工具能力",
        summary: "更有价值的信息是agent 工作流、开发工具入口、权限控制和工程集成，判断这类方案时还要看实际效果取决于权限模型、评估回放、团队流程和可观测性。文章梳理一个 AI 产品、平台或工程实践的具体变化，而不是只给观点。"
      }
    ],
    daily_tracking: [
      {
        title: "OpenRouter",
        summary: "No previous component snapshot was available for comparison."
      }
    ],
    chinese_media_dynamics: [
      {
        title: "QbitAI 线索",
        summary: "QbitAI published this intermediary lead entry. This is an intermediary/self-media lead; trace it to a primary source before treating it as a reported fact."
      }
    ]
  };
  const result = evaluateDailyContentContract(report);
  const issue = result.issues.find((item) => item.code === "public_copy_banned_audit_or_template_wording");

  assert(issue);
  const terms = issue.examples.map((example) => example.term);
  assert(terms.some((term) => ["面向agent 工作流和自动化工程", "核心能力是"].includes(term)));
  assert(terms.some((term) => ["本轮开源榜单", "公开页面显示", "读者应看项目说明"].includes(term)));
  assert(terms.some((term) => ["配合。成本"].includes(term)));
  assert(terms.some((term) => ["热度指标是", "页面还标出"].includes(term)));
  assert(terms.some((term) => ["本周榜单记录", "downloads、likes", "社区使用热度"].includes(term)));
  assert(terms.some((term) => ["published this intermediary lead entry", "This is an intermediary/self-media lead", "trace it to a primary source"].includes(term)));
  assert(terms.some((term) => ["更有价值的信息是", "判断这类方案时还要看", "文章梳理一个 AI 产品"].includes(term)));
  assert(terms.includes("No previous component snapshot was available for comparison."));
});

test("public copy gate ignores internal source audit fields", () => {
  const report = {
    ...storyFixture("OpenAI 发布模型能力更新，说明评测设置和使用范围。"),
    report_date: "2026-07-01",
    source_audit: {
      content_sources: {
        notes: "内部信源审计可以记录披露、候选池和准入门槛这类诊断词。"
      }
    }
  };
  const result = evaluateDailyContentContract(report);
  assert.equal(result.issues.filter((issue) => issue.code === "public_copy_banned_audit_or_template_wording").length, 0);
});

test("public copy gate blocks source effectiveness snake case wording", () => {
  const report = {
    ...storyFixture("OpenAI 发布模型能力更新，说明评测设置和使用范围。"),
    report_date: "2026-07-01"
  };
  const result = evaluateDailyContentContract(report, {
    html: "<main><p>source_effectiveness is internal diagnostics.</p></main>"
  });
  const issue = result.issues.find((item) => item.code === "public_copy_banned_audit_or_template_wording");

  assert(issue);
  assert(issue.examples.some((example) => example.term === "source_effectiveness"));
});

test("public copy gate blocks source effectiveness spaced wording", () => {
  const report = {
    ...storyFixture("OpenAI 发布模型能力更新，说明评测设置和使用范围。"),
    report_date: "2026-07-01"
  };
  const result = evaluateDailyContentContract(report, {
    html: "<main><p>source effectiveness is internal diagnostics.</p></main>"
  });
  const issue = result.issues.find((item) => item.code === "public_copy_banned_audit_or_template_wording");

  assert(issue);
  assert(issue.examples.some((example) => example.term === "source effectiveness"));
});

test("real artifact content contract scans report directory and surfaces blocking issues", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ai-daily-content-contract-"));
  const dataDir = path.join(tmp, "reports-data", "2026", "06");
  const htmlDir = path.join(tmp, "docs", "reports", "2026", "06");
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(htmlDir, { recursive: true });
  const realTemplatedReport = JSON.parse(fs.readFileSync(path.join(REPORTS_DIR, "2026", "06", "2026-06-24.json"), "utf8"));
  realTemplatedReport.github_trending = [];
  fs.writeFileSync(path.join(dataDir, "2026-06-26.json"), JSON.stringify(realTemplatedReport), "utf8");
  fs.writeFileSync(path.join(htmlDir, "2026-06-26.html"), "<html><body><section id=\"story-list\"></section></body></html>", "utf8");

  const result = await evaluateRealArtifactContentContract({
    rootDir: tmp,
    dataInput: "reports-data",
    htmlInput: path.join("docs", "reports"),
    latest: 1
  });

  assert.equal(result.ok, false);
  assert.equal(result.summary.artifacts_checked, 1);
  assert(result.issues.some((issue) => issue.code === "github_trending_top20_missing"));
  assert(result.issues.some((issue) => issue.report_path === "reports-data/2026/06/2026-06-26.json"));
  assert(result.degraded.some((issue) => issue.code === "story_template_narrative"));
});

test("real artifact content contract enforces public copy gate by default", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ai-daily-public-copy-real-"));
  const dataDir = path.join(tmp, "reports-data", "2026", "07");
  const htmlDir = path.join(tmp, "docs", "reports", "2026", "07");
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(htmlDir, { recursive: true });

  const report = {
    ...storyFixture("OpenAI 发布模型能力更新，说明评测设置和使用范围。"),
    report_date: "2026-07-01",
    summary: "今天的候选池显示，OpenAI 披露模型能力和评估方法更新。"
  };
  fs.writeFileSync(path.join(dataDir, "2026-07-01.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(htmlDir, "2026-07-01.html"), "<main>候选池</main>", "utf8");

  const result = await evaluateRealArtifactContentContract({
    rootDir: tmp,
    dataInput: "reports-data",
    htmlInput: path.join("docs", "reports"),
    latest: 1
  });

  assert.equal(result.ok, false);
  assert(result.issues.some((issue) => issue.code === "public_copy_banned_audit_or_template_wording"));
  assert.equal(result.reports[0].summary.checked.public_copy_gate, true);
});

test("latest committed report carries no BLOCKING content-contract issues", () => {
  const found = [];
  const dirs = (p) => { try { return fs.readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort(); } catch { return []; } };
  for (const y of dirs(REPORTS_DIR)) {
    for (const m of dirs(path.join(REPORTS_DIR, y))) {
      for (const f of fs.readdirSync(path.join(REPORTS_DIR, y, m))) {
        if (/^\d{4}-\d{2}-\d{2}\.json$/.test(f)) found.push(path.join(REPORTS_DIR, y, m, f));
      }
    }
  }
  found.sort();
  const latest = found[found.length - 1];
  assert.ok(latest, "a committed report must exist");
  const result = evaluateDailyContentContract(JSON.parse(fs.readFileSync(latest, "utf8")), {
    enforcePublicCopyGate: false
  });
  assert.deepEqual(
    result.issues.map((i) => i.code),
    [],
    `${path.basename(latest)} has blocking content-contract issues`
  );
});
