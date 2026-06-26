// Proves the Phase-1 durable seam: story narrative (the reader-facing unit) is
// now routed through the same LLM editorial loop builders already use.
//
// Run: node --test tests/story-authoring.test.js

import assert from "node:assert/strict";
import test from "node:test";
import { reviewReportQuality, applyQualityRepairContract } from "../src/quality-loop.js";

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

  // 2) author EVERY flagged story field (what_happened and why_it_matters) and
  // apply through the real applier
  const allStoryTasks = review.ai_review_tasks.filter(
    (t) => /^stories\[\d+\]\.(what_happened|why_it_matters|title)$/.test(String(t.path || "")) && t.kind === "public_editorial_rewrite"
  );
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
});
