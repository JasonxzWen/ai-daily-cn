# Progress

## Current State

- Active task: 固化公开 AI 日报内容合同，修复 2026-06-09 复盘暴露的主体太少、公开页调试化、整页截图主内容、坏图片、AI 腔和反馈记忆失效问题。
- Baseline: 已确认 `origin/main` 最新合入 PR #68，当前基线为 `b7bcd06 Merge pull request #68 from JasonxzWen/codex/platform-exempt-channels`。
- Task class: non-trivial.

## Completed

- 已审阅 `config/feedback-ledger.json` 与 `docs/feedback-buglist-quick-reference.md`，并在 `tasks/current-task.md` 写入本轮规格、红灯证据和回归自检。
- 已新增 P1 ledger 项，覆盖公开日报短新闻合同、公开媒体门禁、公开/内部报告分离、公共 AI 重要性排序、2026-06-09 坏日报回放。
- 已新增 2026-06-09 坏样本 fixture，回放 `main_items: 3`、`28x28` 小图标和 OpenRouter / Artificial Analysis 整页截图。
- 已调整质量门：主体不再要求 `why_it_matters` / `reader_relevance`，但 `8-12` 条短新闻、来源链接、可追溯事实线和公开媒体合同成为硬约束。
- 已调整公开渲染：默认隐藏 source audit/self-check/ledger/degradation/candidate diagnostics，榜单类内容优先结构化表格，不把整页截图作为正文媒体。
- 已调整证据缓存：只保存尺寸、语义和可读性合格的公开内容图；小图标、logo、avatar、favicon 和整页截图不会进入公开正文。
- 已调整草稿排序：按公共 AI 重要性、大厂/模型/产品/API/价格/监管/资本/泛 AI 热点信号排序，不再按个人工作相关性剔除。
- 已修复截图验收发现的移动端 daily tracking 表格行高异常；`src/site.js` 为日报注入本地 CSS override，`src/page-checklist.js` 新增 `daily_tracking_table_compact` 门禁。
- 已重新构建 `docs` 公开页面产物。
- 已从发现结果重新生成 2026-06-09 日报：`reports-data/2026/06/2026-06-09.json` 与 `docs/reports/2026/06/2026-06-09.html` 均已由命令链路生成。
- 今日新报告包含 `10` 条主体短新闻、`10` 条 GitHub Trending、`3` 条热门博客、`3` 条 daily tracking、`6` 条 Builder 观察和 `8` 条社区线索。
- 今日公开 evidence 只引用 2 张合格原网页资产，均为 `600x337` `source_asset`；OpenRouter 截图和 `28x28` 图标没有进入公开正文。
- OpenRouter 在公开页以结构化榜单展示；Artificial Analysis 与 SWE-bench Pro 本轮抓取受阻，只作为内部降级状态保留，不发布未核验事实。
- PR #68 已合入当前 `origin/main`；之前低门槛平台板块未生效，是因为平台发现产物没有接入 `daily-runner` 和生成输入。现已接入，Reddit 源已启用并选入 2 条，微信/知乎仍是占位源加 kill switch，所以正确产出 0 条。
- Reddit 公开卡片已清洗为中文短标题和事实概括，只保留平台线索披露；公开 HTML 不再展示 `source_id`、`rule_id`、`verification_status`、`matched_terms`、`why_watch` 或英文长摘录。
- 本次问题已追加为长期档案 `feedback/p1-platform-exempt-public-rendering`，并同步到 quick reference 与 `tasks/daily-publish-runbook.md`；runbook 已要求手动流程执行三条平台发现命令、把平台 JSON 传入 `report:draft`，并在构建后检查平台卡片无内部字段泄露。

## Validation Records

| Command | Status | Evidence |
|---|---|---|
| `node --test tests/unit.test.js --test-name-pattern "public daily contract"` before implementation | fail | 旧质量门仍要求解释字段、未拒绝 `28x28` 图标/整页截图、公开渲染仍尝试展示截图媒体。 |
| `node --test tests/unit.test.js tests/publish.test.js tests/skills.test.js` | pass | 293/293 passing；public daily contract、platform-exempt wiring、公开数据清洗和平台卡片清洗回归测试通过。 |
| `node scripts/validate-feedback-contract.mjs` | pass | `{"ok": true, "failures": []}`。 |
| `node --test --test-name-pattern "platform exempt report sections require public audit disclosure\|daily runner wires platform exempt" tests/unit.test.js` | pass | 平台发现接入和平台公开卡片清洗均有回归覆盖。 |
| `npm run test:e2e` | pass | 页面级 e2e 通过，公开媒体与调试区检查生效。 |
| `npm run build` | pass | 重新生成 2026-05-13 至 2026-06-09 的公开日报 HTML。 |
| `npm run quality:page-check -- 2026-06-09 docs .tmp/page-check-2026-06-09-after.json` | pass | 1280x900 与 375x812 视口均通过；OpenRouter / Artificial Analysis 为结构化表格，无公开截图媒体；公开调试区隐藏；公开内容图全合格；`daily_tracking_table_compact` 通过。 |
| Playwright screenshot `.tmp/visual-2026-06-09-mobile.png` | pass | 裁剪检查 `.tmp/visual-2026-06-09-mobile-crop-tracking.png`，移动端 tracking 表格行高为 `38-39px`，无长空白块。 |
| `npm run validate` | pass | 覆盖 harness、feedback、workflow、sources、unit、build、privacy、e2e 和 `git diff --check`。 |
| `npm run quality:review -- .tmp/daily-report.json .tmp/quality-review-2026-06-09.json .tmp/source-candidates-2026-06-09.json` | pass | `ok: true`, `issues: []`; Builder translation remains an `ai_review_required` semantic checklist but does not block. |
| `npm run quality:page-check -- 2026-06-09 docs .tmp/page-check-2026-06-09.json` | pass | Desktop and mobile both pass; structured tracking table, no screenshot media, no public debug sections, valid local media, no horizontal overflow. |
| Playwright screenshots `.tmp/visual-2026-06-09-desktop.png` and `.tmp/visual-2026-06-09-mobile.png` | pass | Both screenshots show OpenRouter table and Reddit platform signals, no horizontal overflow, no public debug keywords, and no platform internal-field leakage. |
| `npm run publish:dry-run:daily -- --date 2026-06-09` | blocked | Publish safety gate returned `wrong_branch` because this worktree is detached HEAD; no publish action was performed. |

## Pending

- 用户确认后可在允许的 `main` publish worktree 中重跑 `publish:dry-run:daily` 或执行真实发布。
- 未自动 commit、push、改远端 Pages 设置或修改自动化配置。

## Blockers

- `publish:dry-run:daily` 当前在本 detached HEAD worktree 被 `wrong_branch` 安全门阻塞；这不影响本地 JSON/HTML 产物，但阻止发布计划生成。
