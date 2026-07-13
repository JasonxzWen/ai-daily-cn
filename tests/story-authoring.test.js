// Proves the Phase-1 durable seam: story narrative (the reader-facing unit) is
// now routed through the same LLM editorial loop builders already use.
//
// Run: node --test tests/story-authoring.test.js

import assert from "node:assert/strict";
import test from "node:test";
import {
  applyQualityRepairContract,
  buildFirstPassAuthoringTasks,
  reviewReportQuality,
  validateFirstPassAuthoringContract
} from "../src/quality-loop.js";

function templatedStoryReport() {
  return {
    report_date: "2026-06-24",
    summary: "今日 AI 主线。",
    stories: [
      {
        story_id: "s1",
        title: "Alibaba Cloud发布 AIGC 创作工作流",
        what_happened:
          "Alibaba Cloud更新agent 工作流和开发工具能力，材料覆盖任务编排、上下文、权限控制、工程集成和失败恢复，边界落在落地质量取决于权限模型、评估回放、团队流程和可观测性。",
        why_it_matters: "内容侧价值集中在素材生成、创作者工具链成本和交付方式",
        sources: [{ label: "Alibaba Cloud Blog", url: "https://www.alibabacloud.com/blog/happyhorse" }]
      }
    ],
    main_items: [],
    builder_observations: []
  };
}

function assertFirstPassAuthoringTask(task) {
  assert.equal(task.phase, "first_pass_authoring");
  assert.equal(task.intent, "source_grounded_public_authoring");
  assert.equal(task.authoring_contract, "public_prose_authoring_v1");
  assert.equal(task.requires_source_grounding, true);
}

test("first-pass plan proactively authors every reader-facing narrative lane before review", () => {
  const report = {
    report_date: "2026-07-13",
    stories: [{
      story_id: "story-openai",
      title: "OpenAI 发布新推理接口",
      what_happened: "OpenAI 发布了一项更新。",
      why_it_matters: "开发者可以关注这项变化。",
      source_item_refs: ["candidate-openai"],
      sources: [{ label: "OpenAI News", url: "https://openai.com/news/example" }]
    }],
    main_items: [],
    hot_blogs: [{
      candidate_id: "candidate-blog",
      title: "一篇关于智能体评测的文章",
      summary: "文章讨论了智能体评测。",
      url: "https://example.com/blog"
    }],
    github_trending: [{
      candidate_id: "candidate-repo",
      repo: "example/agent-kit",
      description: "Agent toolkit",
      url: "https://github.com/example/agent-kit"
    }],
    builder_observations: [{
      candidate_id: "candidate-builder",
      original_text: "We shipped a smaller model with faster tool calling.",
      translation: "这条 Builder 动态值得关注。",
      content: "这条 Builder 动态值得关注。",
      url: "https://x.com/example/status/1"
    }]
  };

  const tasks = buildFirstPassAuthoringTasks(report);
  const byPath = new Map(tasks.map((task) => [task.path, task]));

  assert.deepEqual([...byPath.keys()], [
    "stories[0].title",
    "stories[0].what_happened",
    "stories[0].why_it_matters",
    "hot_blogs[0].summary",
    "github_trending[0].description",
    "builder_observations[0].translation"
  ]);
  tasks.forEach(assertFirstPassAuthoringTask);
  assert.equal(byPath.get("builder_observations[0].translation").kind, "builder_translation_rewrite");
  assert.deepEqual(byPath.get("stories[0].what_happened").evidence_urls, ["https://openai.com/news/example"]);
  assert.equal(byPath.get("github_trending[0].description").kind, "github_description_authoring");
});

test("first-pass contract requires exact full task coverage", () => {
  const tasks = [
    { path: "stories[0].what_happened" },
    { path: "builder_observations[0].translation" }
  ];
  const base = {
    schema_version: 1,
    report_date: "2026-07-13",
    status: "ready"
  };

  const missing = validateFirstPassAuthoringContract({
    ...base,
    edits: [{ path: tasks[0].path, value: "具体事实" }]
  }, { reportDate: "2026-07-13", tasks });
  assert.equal(missing.ok, false);
  assert(missing.failures.some((failure) => failure.includes(tasks[1].path)));

  const extra = validateFirstPassAuthoringContract({
    ...base,
    edits: [
      { path: tasks[0].path, value: "具体事实" },
      { path: tasks[1].path, value: "具体翻译" },
      { path: "stories[0].sources[0].url", value: "https://evil.example" }
    ]
  }, { reportDate: "2026-07-13", tasks });
  assert.equal(extra.ok, false);
  assert(extra.failures.some((failure) => failure.includes("not a declared first-pass task")));
});

test("review routes templated story narrative to the editorial loop", () => {
  const review = reviewReportQuality(templatedStoryReport());
  const storyTasks = review.ai_review_tasks.filter(
    (t) => /^stories\[\d+\]\.what_happened$/.test(t.path) && t.kind === "public_editorial_rewrite"
  );
  assert.ok(
    storyTasks.length >= 1,
    "expected a public_editorial_rewrite task on a story what_happened path, got: " +
      JSON.stringify(review.ai_review_tasks)
  );
  storyTasks.forEach(assertFirstPassAuthoringTask);
});

test("applier now accepts authored story edits (previously path_not_allowed)", () => {
  const report = templatedStoryReport();
  const authored =
    "阿里云为视频生成模型 HappyHorse 升级运动表现力与生成一致性，面向 AIGC 创作工作流提升画面稳定度。";
  const result = applyQualityRepairContract(report, {
    schema_version: 1,
    report_date: "2026-06-24",
    edits: [{ path: "stories[0].what_happened", value: authored, reason: "author from source" }]
  });
  assert.deepEqual(result.rejected, []);
  assert.equal(result.applied.length, 1);
  assert.equal(result.report.stories[0].what_happened, authored);
});

test("applier still refuses to touch story facts/links", () => {
  const report = templatedStoryReport();
  const result = applyQualityRepairContract(report, {
    schema_version: 1,
    report_date: "2026-06-24",
    edits: [{ path: "stories[0].sources[0].url", value: "https://evil.example/x" }]
  });
  assert.equal(result.applied.length, 0);
  assert.equal(result.rejected[0].code, "path_not_allowed");
});

test("full loop: every templated story is flagged, authored, and cleared", () => {
  const report = {
    report_date: "2026-06-24",
    summary: "今日 AI 主线。",
    stories: [
      {
        story_id: "s1",
        title: "Alibaba Cloud发布 AIGC 创作工作流",
        what_happened: "Alibaba Cloud更新agent 工作流和开发工具能力，材料覆盖任务编排、上下文、权限控制、工程集成和失败恢复，边界落在落地质量取决于权限模型、评估回放、团队流程和可观测性。",
        why_it_matters: "内容侧价值集中在素材生成",
        sources: [{ label: "Alibaba Cloud Blog", url: "https://www.alibabacloud.com/blog/a" }]
      },
      {
        story_id: "s2",
        title: "OpenAI公布模型评估和研究结果",
        what_happened: "OpenAI披露模型能力和评估方法更新，材料覆盖能力边界、评估设置、数据来源、使用场景和限制说明，已披露事实集中在模型能力。",
        why_it_matters: "研究价值集中在评测设置",
        sources: [{ label: "OpenAI News", url: "https://openai.com/index/b" }]
      },
      {
        story_id: "s3",
        title: "Microsoft更新agent 可观测平台更新",
        what_happened: "微软研究院发布生产 agent 观测面板，材料覆盖工具调用轨迹、事故时间线、成本归因、回滚状态和发布健康度，边界落在观测价值取决于能否把失败记录、成本和发布状态串进同一条链路。",
        why_it_matters: "工程侧价值集中在 agent",
        sources: [{ label: "Microsoft Blog", url: "https://blogs.microsoft.com/c" }]
      }
    ],
    main_items: [],
    builder_observations: []
  };

  // 1) every templated story narrative is routed to the authoring loop
  const review = reviewReportQuality(report);
  const storyTasks = review.ai_review_tasks.filter(
    (t) => /^stories\[\d+\]\.what_happened$/.test(String(t.path || "")) && t.kind === "public_editorial_rewrite"
  );
  assert.equal(storyTasks.length, 3, "all three templated stories must be flagged for authoring");
  storyTasks.forEach(assertFirstPassAuthoringTask);

  // 2) author EVERY flagged story field (what_happened and why_it_matters) and
  // apply through the real applier
  const allStoryTasks = review.ai_review_tasks.filter(
    (t) => /^stories\[\d+\]\.(what_happened|why_it_matters|title)$/.test(String(t.path || "")) && t.kind === "public_editorial_rewrite"
  );
  allStoryTasks.forEach(assertFirstPassAuthoringTask);
  const edits = allStoryTasks.map((t, i) => ({
    path: t.path,
    value: `编辑已根据原始来源改写的具体事实与读者影响片段 ${i + 1}。`,
    reason: "author from source"
  }));
  const result = applyQualityRepairContract(report, { schema_version: 1, report_date: "2026-06-24", edits });
  assert.deepEqual(result.rejected, []);
  assert.equal(result.applied.length, allStoryTasks.length);

  // 3) after authoring, no story narrative remains in the loop
  const remaining = reviewReportQuality(result.report).ai_review_tasks.filter((t) => /^stories\[/.test(String(t.path || "")));
  assert.equal(remaining.length, 0, "no story tasks should remain after authoring");
});

test("review routes deterministic templated story TITLE to the editorial loop", () => {
  const report = {
    report_date: "2026-06-26",
    summary: "今日 AI 主线。",
    stories: [
      {
        story_id: "t1",
        // Generic, deterministic-template title that escaped the prior phrase list.
        title: "Alibaba Cloud更新agent 与开发者工具能力",
        // Concrete narrative so the test isolates TITLE routing.
        what_happened: "阿里云为视频生成模型 HappyHorse 升级动作表现力与跨帧一致性。",
        why_it_matters: "为 AIGC 创作工作流提供更稳定的画面输出，降低重渲染成本。",
        sources: [{ label: "Alibaba Cloud Blog", url: "https://www.alibabacloud.com/blog/happyhorse" }]
      },
      {
        story_id: "t2",
        title: "OpenAI公布模型能力和推理入口变化",
        what_happened: "OpenAI 宣布企业 API 增加新的推理控制开关并调整可用区域。",
        why_it_matters: "影响企业团队的接入方式与迁移节奏。",
        sources: [{ label: "OpenAI News", url: "https://openai.com/index/inference" }]
      }
    ],
    main_items: [],
    builder_observations: []
  };
  const review = reviewReportQuality(report);
  const titleTasks = review.ai_review_tasks.filter(
    (t) => /^stories\[\d+\]\.title$/.test(String(t.path || "")) && t.kind === "public_editorial_rewrite"
  );
  assert.equal(
    titleTasks.length,
    2,
    "both deterministic templated story titles must be routed to authoring, got: " +
      JSON.stringify(review.ai_review_tasks)
  );
  titleTasks.forEach(assertFirstPassAuthoringTask);
});

test("review keeps a concrete story title out of the editorial loop", () => {
  const report = {
    report_date: "2026-06-26",
    summary: "今日 AI 主线。",
    stories: [
      {
        story_id: "c1",
        title: "Google 为 Gemini 3.5 Flash 新增电脑操作能力",
        what_happened: "Google 让 Gemini 3.5 Flash 可以直接操作浏览器与桌面完成任务。",
        why_it_matters: "把 computer-use 能力下放到更轻量的模型，降低自动化门槛。",
        sources: [{ label: "Google Blog", url: "https://blog.google/technology/ai/gemini-computer-use" }]
      }
    ],
    main_items: [],
    builder_observations: []
  };
  const review = reviewReportQuality(report);
  const titleTasks = review.ai_review_tasks.filter(
    (t) => /^stories\[\d+\]\.title$/.test(String(t.path || "")) && t.kind === "public_editorial_rewrite"
  );
  assert.equal(titleTasks.length, 0, "a concrete story title must not be flagged as template prose");
});

test("review flags deterministic boilerplate why_it_matters (价值/信号集中在)", () => {
  // The exact reader-impact boilerplate from draft.js that escaped the gate and
  // shipped as flat facts. It must now route to the editorial loop.
  const report = {
    report_date: "2026-06-26",
    summary: "今日 AI 主线。",
    stories: [
      {
        story_id: "b1",
        title: "某开源模型登上热门榜",
        what_happened: "该模型在社区榜单热度靠前，下载量与点赞数较高。",
        why_it_matters: "工程价值集中在代码、权重、示例和生态复用条件",
        sources: [{ label: "Source", url: "https://example.com/b1" }]
      },
      {
        story_id: "b2",
        title: "另一模型进入榜单",
        what_happened: "另一模型出现在文本生成热门列表。",
        why_it_matters: "信号集中在 AI 产品、模型或平台策略的实际变化",
        sources: [{ label: "Source", url: "https://example.com/b2" }]
      }
    ],
    main_items: [],
    builder_observations: []
  };
  const review = reviewReportQuality(report);
  const tasks = review.ai_review_tasks.filter(
    (t) => /^stories\[\d+\]\.why_it_matters$/.test(String(t.path || "")) && t.kind === "public_editorial_rewrite"
  );
  assert.equal(tasks.length, 2, "both boilerplate why_it_matters must route to authoring, got: " + JSON.stringify(review.ai_review_tasks));
  tasks.forEach(assertFirstPassAuthoringTask);
});

test("review routes content-contract hot blog filler to editorial repair", () => {
  const report = {
    report_date: "2026-07-09",
    summary: "今日 AI 主线。",
    main_items: [],
    hot_blogs: [
      {
        title: "Google Keyword调整开发者 agent 工作流",
        summary:
          "Google Keyword调整开发者 agent 工作流，重点落在任务编排、上下文、权限控制、工程集成和失败恢复。更有价值的信息是agent 工作流、开发工具入口、权限控制和工程集成，判断这类方案时还要看实际效果要看权限模型、评估回放、团队流程和可观测性。文章梳理一个 AI 产品、平台或工程实践的具体变化，而不是只给观点。"
      }
    ],
    builder_observations: []
  };

  const review = reviewReportQuality(report);
  const tasks = review.ai_review_tasks.filter(
    (task) => task.kind === "hot_blog_editorial_rewrite" && task.path === "hot_blogs[0].summary"
  );
  assert.equal(tasks.length, 1, "content-contract hot blog filler must route to repair: " + JSON.stringify(review));
  assert(review.issues.some((issue) => issue.code === "hot_blog_summary_template"));
  tasks.forEach(assertFirstPassAuthoringTask);
});

test("review routes content-contract main item filler bullets to editorial repair", () => {
  const report = {
    report_date: "2026-07-09",
    summary: "今日 AI 主线。",
    main_items: [
      {
        title: "Microsoft介绍 agent 与开发者工具能力",
        summary: "微软研究院调整开发者 agent 工作流，重点包括任务编排、上下文、权限控制、工程集成和失败恢复。",
        bullets: [
          "**Microsoft介绍 agent 与开发者工具能力**：开发者 agent 工作流对应任务编排、上下文、权限控制、工程集成和失败恢复，可核对事实包括agent 工作流、开发工具入口、权限控制和工程集成。",
          "当前公开的是代码接口、许可证、维护节奏、集成门槛和团队可复用边界。",
          "这会影响研发团队是否把它放进 PoC、评估清单、现有工作流或长期维护计划。"
        ]
      }
    ],
    hot_blogs: [],
    builder_observations: []
  };

  const review = reviewReportQuality(report);
  const tasks = review.ai_review_tasks.filter(
    (task) => task.kind === "main_item_editorial_rewrite" && /^main_items\[0\]\.bullets\[\d+\]$/.test(task.path)
  );
  assert(tasks.length >= 2, "content-contract main item filler bullets must route to repair: " + JSON.stringify(review));
  assert(review.issues.some((issue) => issue.code === "main_item_template_bullet"));
  tasks.forEach(assertFirstPassAuthoringTask);
});
