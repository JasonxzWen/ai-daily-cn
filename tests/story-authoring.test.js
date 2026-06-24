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
