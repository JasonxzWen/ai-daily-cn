# Current Task

## Task Class

non-trivial

## Spec

完成用户已对齐的 AI 日报质量改造规划，并把要求固化到代码、schema、测试、反馈 ledger 和验证门中。本轮继续完成 Batch 3：OpenRouter / Artificial Analysis live adapter 数据层。

Batch 1 已落地：

- 统一 link icon resolver，GitHub 链接统一 GitHub icon，首字母 fallback 必须带 metadata。
- GitHub README enrichment/cache contract。
- 中文媒体动态：机器之心、量子位、少数派按当天窗口有几条放几条，源挂了保留 degraded。
- 官方组织动态独立成区。
- WeChat/Zhihu 未配置真实入口时可发布但必须明确 degraded。

Batch 2 已落地：

- `tracking_component_snapshot` schema。
- OpenRouter / Artificial Analysis 本地 tracking component foundation。
- public trace、tabs、linear/log、tooltip、renderer、E2E 和 page check。
- 不运行第三方 runtime JS，不用截图当公开主载体，不暴露 raw DOM。

Batch 3 本轮目标：

- OpenRouter source snapshot 保留 `history_entries`，用于 Top Models 历史/周序列 stacked rows。
- Artificial Analysis source snapshot 保留 `component_tabs`，包括 Score、Token Usage、Cost、Score vs. Token Usage、Score vs. Cost、Score vs. Compute。
- `src/draft.js` sanitizer 不得丢失这些扩展 snapshot 字段。
- `src/tracking-components.js` 在源数据存在时使用 AA 非 Score tab 数据，不再显示 `source_tab_not_collected`；源数据确实缺失时继续 fallback，不伪造值。
- effective-interact 渲染历史 stacked rows、hover trace 和移动端安全布局。

## Acceptance Criteria

- `schemas/report.schema.json` 接受 `daily_tracking.snapshot.history_entries` 和 `daily_tracking.snapshot.component_tabs`。
- `src/discovery.js` 能从 page text / HTML-like capture 中解析 OpenRouter history rows 和 AA token/cost/scatter rows。
- `src/draft.js` 保留扩展 snapshot 字段进入公开 `daily_tracking`。
- `src/tracking-components.js` 将扩展字段映射为 tab-specific `series.rows`。
- effective-interact 输出 `data-tracking-stack`、tabs、linear/log、hover tooltip、trace，且无 `raw_dom` 泄露。
- 桌面 1280x900 和移动 375x812 page check 通过，无横向溢出和 tracking card overlap。
- 不运行 daily publish runner，不 commit/push，不手工编辑单日报 HTML。

## Feedback Ledger Review

Feedback ledger review: reviewed config/feedback-ledger.json and docs/feedback-buglist-quick-reference.md before implementation; the applicable ledger items are listed below and this task updates the tracking component ledger binding.

已在实现前复核：

- `config/feedback-ledger.json`
- `docs/feedback-buglist-quick-reference.md`

适用长期问题：

- `feedback/p1-ledger-validation-binding`
- `feedback/p1-public-media-contract`
- `feedback/p1-tracking-visual-tables`
- `feedback/p1-tracking-component-reconstruction`
- `feedback/p1-feedback-memory-self-check`

本轮已更新 `feedback/p1-tracking-component-reconstruction`，要求不只保留组件壳，还要保留 OpenRouter history 和 AA score/token/cost/scatter 源数据。

## Red Test

实际红灯命令：

```powershell
node --test tests/unit.test.js --test-name-pattern "collectContentSources stores OpenRouter weekly history|collectContentSources stores Artificial Analysis token cost and scatter tabs"
```

初始失败：

- `snapshot.history_entries` 为 `undefined`。
- `snapshot.component_tabs` 为 `undefined`。

渲染层补充覆盖：

```powershell
node --test tests/skills.test.js --test-name-pattern "effective-interact filterable cards render local tracking components|effective-interact renders Artificial Analysis collected tabs"
```

## Deterministic Substitute

无替代。本轮使用真实 Node unit tests、effective-interact generation/validation、build、page check、E2E 和仓库级 validate。

## Allowed Paths

- `.codex/skills/effective-interact/**`
- `config/feedback-ledger.json`
- `docs/feedback-buglist-quick-reference.md`
- `docs/data/**`
- `docs/reports/**`
- `schemas/report.schema.json`
- `src/**`
- `tests/**`
- `tasks/current-task.md`
- `progress.md`
- `session-handoff.md`
- `$CODEX_HOME/automations/ai-2/memory.md`

## Forbidden Paths

- `.codex/automations/**`
- GitHub Pages settings, branch protection, automation scheduling
- 手工编辑单日报 HTML
- 第三方 runtime JS 作为 OpenRouter / AA 公开组件依赖
- 未配置真实入口时声称 WeChat/Zhihu 已接入
- `git reset --hard`、`git checkout --`、`git clean`
- daily publish runner、commit、push，除非用户明确要求

## Validation Commands

已通过：

```powershell
node --test tests/unit.test.js --test-name-pattern "collectContentSources stores OpenRouter weekly history|collectContentSources stores Artificial Analysis token cost and scatter tabs"
node --test tests/skills.test.js --test-name-pattern "effective-interact filterable cards render local tracking components|effective-interact renders Artificial Analysis collected tabs"
node --test tests/unit.test.js tests/skills.test.js
npm run build
npm run quality:page-check -- 2026-06-12 docs .tmp/page-check-2026-06-12-batch3.json
npm run test:e2e
npm run validate
git diff --check
```

## Parallel Writes

无并行写入。文件修改串行完成；只读检查可并行。

## Regression Self-Check

Regression self-check: task-specific checks below prevent known feedback regressions for screenshot tracking visuals, raw DOM exposure, missing AA non-score tabs, lost OpenRouter history rows, and mobile layout overflow.

- 已确认 OpenRouter history rows 进入 `snapshot.history_entries`，并映射到 `tracking_component_snapshot.series[].rows`。
- 已确认 AA `component_tabs.token_usage/cost/score_vs_*` 在源数据存在时为 complete，不再 fallback。
- 已确认 public trace 不包含 `raw_dom`。
- 已确认 effective-interact 可渲染 `data-tracking-stack`。
- 已确认 2026-06-12 桌面和移动 page check 通过。

## Handoff Requirements

- 汇报 Batch 1、Batch 2 foundation、Batch 3 live adapter layer 均已落地。
- 明确说明本轮未运行 daily publish runner、未 commit/push。
- 汇报最终 `npm run validate` 结果。
- 若最终 validate 失败，只报告真实失败门和可恢复动作，不声称完成。
