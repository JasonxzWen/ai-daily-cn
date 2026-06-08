# Current Task

## Task Class

non-trivial

## Spec

### Goal

按用户确认的方向完成这轮内容升级，然后从 0 到 1 重生成 `2026-06-08` 日报，完成质量审查、浏览器验收、PR 和真实发布。

### User-Visible Behavior

- 主新闻公开层改成 `3-5` 条事实 bullet，不再写 `变化 / 落点 / 为什么重要 / watch_next`。
- `hot_blogs` 公开标题统一为 `热门博客`，摘要要像“替读者读完了文章”，不是空泛表态。
- Builder / X 卡片同时展示干净原文和完整中文，不混入点赞、回复、图片占位、按钮文案等网页壳信息。
- `daily_tracking` 中 OpenRouter 和 Artificial Analysis 成功抓图时显示 `3-5` 张图。
- `community_leads` 做成一行一个新闻的高密度线索流，去掉流程语、同题重复和低价值噪音。
- 最终页面 `docs/reports/2026/06/2026-06-08.html` 在桌面和移动端都没有机器日志、旧标题、乱码、坏图和横向溢出。

### Boundaries

- 保留现有公共板块骨架，不重做整站信息架构。
- 保留 GitHub Trending Top 10 完整展示。
- 不新增独立“国内新闻”导航；合格国内内容仍放进现有板块。
- 不手改 `docs/**`、`reports-data/**` 产物；只能通过仓库命令重生成。
- 不 reset、stash、clean 或覆盖无关脏变更。
- 不绕过 `origin/main`、clean checkout、dry-run-first 的发布门。

### Non-Goals

- 本轮不做通用截图平台。
- 候选池不足时不为凑数量硬塞低质量内容。

### Workstreams

1. 主新闻
   - `src/draft.js`, `src/quality-loop.js`, `tests/unit.test.js`
   - 改 bullet 合同，过滤低价值小发布，补具体 scope / impact 文案。
2. 热门博客
   - `src/draft.js`, `src/render.js`, `src/interaction-report.js`, `tests/unit.test.js`, `tests/skills.test.js`
   - 统一公开标题，优先具体文章材料，拒绝 generic feed announcement。
3. Builder / X
   - `src/draft.js`, `src/quality-loop.js`, `tests/unit.test.js`, `tests/e2e/site.e2e.js`
   - 清掉网页壳文本，保留原文和完整中文。
4. 社区线索
   - `src/draft.js`, `src/interaction-report.js`, `src/page-checklist.js`, `tests/unit.test.js`, `tests/e2e/site.e2e.js`
   - 高密度行式展示、同题去重、图片可展示、摘要去流程语。
5. Tracking 图证
   - `src/discovery.js`, `tests/unit.test.js`
   - OpenRouter / Artificial Analysis 成功时抓 `3-5` 张图，失败时降级不拖垮流程。
6. 发布门
   - `src/quality-loop.js`, `src/page-checklist.js`, `tasks/daily-publish-runbook.md`
   - 固定顺序：`report:draft -> quality:review -> report:write -> build -> page-check -> browser -> validate -> dry-run -> publish`。

## Acceptance Criteria

- 主新闻公开 bullets 为 `3-5` 条事实摘要，没有旧模板包裹词。
- `热门博客` 标题在所有公开渲染路径中一致。
- Builder / X 卡片原文干净、中文完整、无网页壳文本。
- 社区线索是高密度新闻流，去掉同题重复和流程语。
- OpenRouter / Artificial Analysis 成功时展示 `3-5` 张证据图。
- `2026-06-08` 报告与页面通过仓库命令重生成，不手改产物。
- `npm run validate` 和 `publish:dry-run:daily` 通过后，才允许真实发布。

## Test Matrix

### Draft / Quality

- `report:draft` 相关 focused tests
  - 主新闻模板腔
  - 热门博客具体材料优先
  - Builder 原文清洗
  - 社区线索去流程语、去重
  - 低价值 consumer AI feature 不入主新闻
- `quality:review`
  - 不再报旧标题、主新闻模板腔、热博客薄摘要、Builder 未翻译、内部流程语外漏

### Render / E2E

- `tests/skills.test.js`
  - 公开标题为 `热门博客`
- `tests/e2e/site.e2e.js`
  - Builder 双语卡片
  - community 行式展示
  - tracking 多图与 lightbox
  - 移动端无横向溢出

### Release Gates

- `report:write`
  - 必须记录当前 automation revision / `origin_main_sha`
- `build`, `quality:page-check`
  - 页面无旧标题、无流程语、无坏图、无横向溢出
- `npm run validate`
- `npm run publish:dry-run:daily -- --date 2026-06-08`

## Browser Acceptance Checklist

- Target: `docs/reports/2026/06/2026-06-08.html`
- Desktop:
  - 主新闻每条是 `3-5` 条短 bullet
  - `热门博客` 标题正确
  - OpenRouter / Artificial Analysis 多图正常
  - Builder 原文干净，中文完整
  - 社区线索是一行一个新闻
- Mobile:
  - 无水平滚动
  - Builder、社区线索、tracking 图片不炸布局
- Copy:
  - 页面上没有 `变化 / 落点 / 为什么重要 / 判断点 / watch_next`
  - 没有机器日志、source-audit 口吻、`技不止术`

## Execution Order and Failure Boundaries

1. 先修 selection / draft 合同，focused tests 不绿不继续。
2. 再修 render / card shape，e2e 不绿不继续。
3. 再重生成 `2026-06-08` draft 并过 `quality:review`。
4. `report:write` 若被 `origin/main` 门拦住，不绕过，改走 PR -> merge -> clean main 生成路径。
5. 只有 page-check、browser、validate、dry-run 都绿了，才允许真实发布。

## Publish Authorization Addendum

- 用户已明确授权本轮在条件满足时执行 commit、push、PR 和真实发布。
- 真实发布仍必须服从最新 `origin/main`、clean checkout、dry-run-first 约束。

## Feedback Ledger Review

- 已审阅 feedback-ledger 清单（`config/feedback-ledger.json`）和 `docs/feedback-buglist-quick-reference.md`。
- 本轮直接适用：
  - `feedback/p1-main-visible-bullets-no-generic-watch-next`
  - `feedback/p1-main-groups-first-level-navigation`
  - `feedback/p1-domestic-dynamics-public-visibility`
  - `feedback/p1-ai-quality-review-loop`
  - `feedback/p1-feedback-memory-self-check`
- 处理方式：
  - 用 draft / render / quality gate 联动约束公开文案
  - 用 tests + page-check 防止旧标题、AI 腔、Builder 壳文本和社区流程语复发

## Regression Self-Check

- 已检查 `src/draft.js`、`src/quality-loop.js`、`tests/unit.test.js`、`tests/e2e/site.e2e.js`：主新闻、热门博客、Builder、社区线索改动都落在 selection 和验证门，不是只改页面文案。
- 已检查 `2026-06-08` 新 draft：Amazon Alexa merch 已被踢出主新闻，`OpenAI super app` 社区重复已去掉，Ars 气象 AI 条目不再落回泛化摘要。
- 已检查 `npm run validate`：通过。
- 已检查发布门：`report:write` 在当前功能分支被 `automation_revision_gate_failed` / `current_not_origin_main` 拦截，说明后续必须在最新 `origin/main` 上重跑最终生成和发布。

## Red Test

实现前先跑：

```powershell
node --test tests/unit.test.js --test-name-pattern "report:draft|热门博客|Builder original_text shell metadata|community leads|OpenRouter|Artificial Analysis|strict section minimums when selection snapshot"
```

失败证据：

- `report:draft prefers specific hot blog evidence over generic feed announcements`
  - 原测试还期待 RocketMQ 标题被过度截断。
- 真实 `2026-06-08` draft
  - `Customers can now design merch with Alexa for Shopping on Amazon` 仍被补进 `main_items`
  - `community_leads` 里 `OpenAI super app` 同题重复

实现后已回归：

```powershell
node --test tests/unit.test.js --test-name-pattern "report:draft rewrites Builder English fallbacks and strips community intermediary boilerplate|report:draft prefers specific hot blog evidence over generic feed announcements|report:draft filters unreadable blog titles and low-signal community leads|report:draft dedupes duplicate community topics and keeps reader-facing summaries|report:draft keeps minor consumer AI feature rollouts out of main_items|report:draft limits low-signal vendor partnership items in main coverage|quality review flags generic main item reader-guidance bullets|quality review rejects templated hot blog summaries even when length and Chinese ratio pass"
node --test tests/e2e/site.e2e.js
node src/cli.js report:draft --date 2026-06-08 --input .tmp/github-trending-2026-06-08.json,.tmp/builders-2026-06-08.json,.tmp/content-sources-2026-06-08.json,.tmp/statuspage-incidents-2026-06-08.json,.tmp/search-news-2026-06-08.json,.tmp/sources-health-2026-06-08.json --output .tmp/daily-report-2026-06-08.json --candidate-output .tmp/source-candidates-2026-06-08.json
npm run quality:review -- .tmp/daily-report-2026-06-08.json .tmp/quality-review-2026-06-08.json .tmp/source-candidates-2026-06-08.json
npm run validate
```

- 结果：全部通过；当前剩余阻塞只在 `origin/main` 发布基线门。

## Deterministic Substitute

Not used.

## Allowed Paths

- `config/feedback-ledger.json`
- `docs/feedback-buglist-quick-reference.md`
- `docs/daily-content-iteration-history.md`
- `docs/daily-content-good-bad-cases.md`
- `progress.md`
- `prompts/ai-daily/**`
- `reports-data/**`
- `docs/**`
- `schemas/report.schema.json`
- `scripts/check-daily-page.mjs`
- `session-handoff.md`
- `src/discovery.js`
- `src/draft.js`
- `src/interaction-report.js`
- `src/page-checklist.js`
- `src/quality-loop.js`
- `src/quality-status.js`
- `src/render.js`
- `src/report.js`
- `tasks/current-task.md`
- `tasks/daily-publish-runbook.md`
- `tests/e2e/site.e2e.js`
- `tests/skills.test.js`
- `tests/unit.test.js`
- `.tmp/**`

## Forbidden Paths

- 不允许手改公开产物。
- 不允许 reset、stash、clean 或覆盖无关脏变更。
- 不允许改远端 Pages 或自动化配置来绕过现有发布流程。

## Validation Commands

- `node --test tests/unit.test.js --test-name-pattern "report:draft|热门博客|Builder original_text shell metadata|community leads|OpenRouter|Artificial Analysis|strict section minimums when selection snapshot"`
- `node --test tests/e2e/site.e2e.js`
- `node src/cli.js report:draft --date 2026-06-08 --input .tmp/github-trending-2026-06-08.json,.tmp/builders-2026-06-08.json,.tmp/content-sources-2026-06-08.json,.tmp/statuspage-incidents-2026-06-08.json,.tmp/search-news-2026-06-08.json,.tmp/sources-health-2026-06-08.json --output .tmp/daily-report-2026-06-08.json --candidate-output .tmp/source-candidates-2026-06-08.json`
- `npm run quality:review -- .tmp/daily-report-2026-06-08.json .tmp/quality-review-2026-06-08.json .tmp/source-candidates-2026-06-08.json`
- `npm run report:write -- .tmp/daily-report-2026-06-08.json reports-data 2026-06-08`
- `npm run build`
- `npm run quality:page-check -- 2026-06-08 docs .tmp/page-check-2026-06-08.json`
- `npm run validate`
- `npm run publish:dry-run:daily -- --date 2026-06-08`

## Parallel Writes

No parallel writes. Manual edits use `apply_patch`; generated artifacts come only from repository commands.

## Handoff Requirements

- 说明主新闻、热门博客、Builder/X、daily tracking、社区线索分别改了什么。
- 说明重生成、quality review、report:write、page-check、browser、dry-run、PR、真实发布的命令和结果。
- 说明剩余风险，尤其是截图稳定性、Builder/X 源波动和 `origin/main` 发布基线要求。
