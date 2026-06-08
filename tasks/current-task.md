# Current Task

## Task Class

non-trivial

## Spec

### Goal

完成这轮 AI 日报内容升级，并基于新合同重新生成 `2026-06-08` 日报，经过质量门、页面验收、PR 和主线发布流程后再落地正式产物。

更细的内容方向参考：

- `prompts/ai-daily/modules/editorial-authority.md`
- `docs/ai-daily-content-refactor-roi-plan.md`

### User-Visible Behavior

- 主新闻不再写成“变化 / 落点 / 为什么重要 / 判断点 / watch_next”，而是 `3-5` 条短 bullet，直接概括事实和影响。
- `hot_blogs` 的公开标题统一为“热门博客”，内容边界放宽到内容、产品、平台、策略、组织方法和高质量访谈，不再只像工程博客池。
- Builder / X 卡片同时展示干净原文和完整中文，不混入点赞、回复、图片占位、按钮文案等网页噪音。
- `daily_tracking` 对 OpenRouter 和 Artificial Analysis 优先展示 `3-5` 张高信息量图；抓图失败时只降级，不写流程日志。
- `community_leads` 改成一行一条新闻的高密度线索流，保留图片，去掉同题重复、长英文标题直出和流程腔。
- 最终页面 `docs/reports/2026/06/2026-06-08.html` 在桌面和移动端都不出现机器日志、旧栏目名、乱码、坏图或横向溢出。

### Boundaries

- 保留现有公开板块骨架，不重做整站信息架构。
- 保留 GitHub Trending Top 10 的完整展示合同。
- 国内 / 中文内容放进现有板块，不单独新增“国内动态”导航。
- 不手改 `docs/**`、`reports-data/**` 公开产物，只能通过仓库命令生成。
- 不使用 `reset`、`stash`、`clean` 或覆盖无关脏改动。
- 不绕过 `origin/main`、clean checkout、`publish:dry-run:daily` 的发布门。

### Non-Goals

- 本轮不重写 schema。
- 本轮不新增固定 `Product Hunt`、播客或 Twitter 大栏目。
- 本轮不为了凑数量硬塞低质量新闻。

### Workstreams

1. 主新闻合同
   - 收紧选题阈值，过滤低价值小发布、弱合作稿和泛 consumer AI 小功能。
   - 输出合同改成 `3-5` 条事实 bullet，并由 `quality:review` 拦截旧模板腔。
2. 热门博客升级
   - 公开命名统一为“热门博客”。
   - 摘要改成“读完后的要点”，优先具体文章证据，不接受 generic feed announcement。
3. Builder / X 清洗
   - 保留干净原文、完整中文和来源头像。
   - 禁止网页元信息漏进公开卡片。
4. 社区线索重排
   - 改成单行新闻流，支持图片和 lightbox。
   - 用正文中文 lead 替换不适合公开展示的英文长标题。
5. Tracking 图证
   - OpenRouter / Artificial Analysis 成功时各保留 `3-5` 张图。
   - 图不稳时降级为文字和来源说明，不伪造覆盖。
6. 发布门和验收
   - 固定顺序：`report:draft -> quality:review -> report:write -> build -> page-check -> browser -> validate -> publish:dry-run:daily -> publish`。
   - 若 `report:write` 因 `current_not_origin_main` 或 `automation_revision_gate_failed` 被拦截，则改走 PR -> merge -> clean main 重跑。

### Execution Notes

- 当前功能分支允许先完成代码、测试和 PR。
- 正式 `report:write`、最终 build 和真实 publish 仍必须回到最新 `origin/main` 执行。

## Acceptance Criteria

- 主新闻公开层是 `3-5` 条短 bullet，没有旧模板包装词。
- “热门博客”在所有公开路径命名一致，摘要像内容提炼，不像评审意见或推荐语。
- Builder / X 卡片原文干净、中文完整，没有网页按钮文案、点赞数、占位文本。
- 社区线索是一行一条新闻流，能显示图片，去掉同题重复和流程腔。
- OpenRouter / Artificial Analysis 成功时页面展示 `3-5` 张可点击放大的证据图。
- `2026-06-08` 报告和页面只能通过仓库命令生成，不手改产物。
- `npm run validate` 和 `npm run publish:dry-run:daily -- --date 2026-06-08` 通过后，才允许真实发布。

## Feedback Ledger Review

已先审阅 `config/feedback-ledger.json` 和 `docs/feedback-buglist-quick-reference.md`。这次明确回放了 feedback-ledger 中已经固化的 P1 反馈，重点覆盖主新闻模板腔、板块命名、国内内容可见性、AI 质检闭环和反馈记忆自检。本轮直接对应的长期问题包括：

- `feedback/p1-main-visible-bullets-no-generic-watch-next`
- `feedback/p1-main-groups-first-level-navigation`
- `feedback/p1-domestic-dynamics-public-visibility`
- `feedback/p1-ai-quality-review-loop`
- `feedback/p1-feedback-memory-self-check`

本轮处理方式不是只改页面文案，而是同时收紧 `src/draft.js`、`src/interaction-report.js`、`src/quality-loop.js`、`src/page-checklist.js` 与对应测试。这样可以持续拦截主新闻模板腔、旧栏目名、Builder 噪音、社区流程语和公开页机器日志复发。

## Regression Self-Check

本轮回归自检围绕“用户已经明确指出的问题不能再回潮”展开，检查点包括：

- 已检查 `src/draft.js` 与 `src/quality-loop.js`：主新闻、热门博客、Builder、社区线索的公开文案约束落在生成和质量门两层，而不是只靠手工挑稿。
- 已检查 `tests/unit.test.js` 与 `tests/e2e/site.e2e.js`：覆盖低价值小新闻过滤、热门博客标题收口、Builder 网页噪音清洗、社区线索去重与图片展示。
- 已检查真实 `2026-06-08` draft：主新闻不再混入 Amazon Alexa merch 这类低信号小动态，`OpenAI super app` 社区重复已去掉，热门博客公开标题已改成中文读者口径。
- 已检查 `npm run validate`：harness、feedback、workflow、sources、unit、build、privacy、e2e 和 `git diff --check` 全部通过。
- 已检查发布门行为：`report:write` 在当前功能分支被 `automation_revision_gate_failed` 和 `current_not_origin_main` 拦截，说明最终正式产物必须回最新 `origin/main` 重跑，不能绕过。
- 已检查预览页浏览器验收：基于 `.tmp/daily-report-2026-06-08.json` 生成 `.tmp/preview-site-2026-06-08/reports/2026/06/2026-06-08.html`，桌面和移动端都没有 `技不止术 / 热门技术博客 / 变化： / 判断点：` 等旧口径，也没有横向溢出；OpenRouter 多图、Builder 双语卡片和社区线索新闻流已按新合同展示。

## Red Test

实现前先跑：

```powershell
node --test tests/unit.test.js --test-name-pattern "report:draft|热门博客|Builder original_text shell metadata|community leads|OpenRouter|Artificial Analysis|strict section minimums when selection snapshot"
```

失败证据：

- `report:draft prefers specific hot blog evidence over generic feed announcements` 初始不通过，说明热门博客仍在吃泛 feed 公告。
- 真实 `2026-06-08` draft 里，`Customers can now design merch with Alexa for Shopping on Amazon` 曾进入 `main_items`，说明主新闻阈值过低。
- 真实 `2026-06-08` draft 里，`community_leads` 曾出现 `OpenAI super app` 同题重复，说明社区去重和公开摘要合同不够硬。

实现后应回归：

```powershell
node --test tests/unit.test.js --test-name-pattern "report:draft rewrites Builder English fallbacks and strips community intermediary boilerplate|report:draft prefers specific hot blog evidence over generic feed announcements|report:draft filters unreadable blog titles and low-signal community leads|report:draft dedupes duplicate community topics and keeps reader-facing summaries|report:draft keeps minor consumer AI feature rollouts out of main_items|report:draft limits low-signal vendor partnership items in main coverage|quality review flags generic main item reader-guidance bullets|quality review rejects templated hot blog summaries even when length and Chinese ratio pass"
node --test tests/e2e/site.e2e.js
node src/cli.js report:draft --date 2026-06-08 --input .tmp/github-trending-2026-06-08.json,.tmp/builders-2026-06-08.json,.tmp/content-sources-2026-06-08.json,.tmp/statuspage-incidents-2026-06-08.json,.tmp/search-news-2026-06-08.json,.tmp/sources-health-2026-06-08.json --output .tmp/daily-report-2026-06-08.json --candidate-output .tmp/source-candidates-2026-06-08.json
npm run quality:review -- .tmp/daily-report-2026-06-08.json .tmp/quality-review-2026-06-08.json .tmp/source-candidates-2026-06-08.json
```

## Deterministic Substitute

Not used.

## Allowed Paths

- `config/feedback-ledger.json`
- `docs/feedback-buglist-quick-reference.md`
- `docs/ai-daily-content-refactor-roi-plan.md`
- `docs/daily-content-iteration-history.md`
- `docs/daily-content-good-bad-cases.md`
- `progress.md`
- `session-handoff.md`
- `prompts/ai-daily/**`
- `scripts/check-daily-page.mjs`
- `src/discovery.js`
- `src/draft.js`
- `src/interaction-report.js`
- `src/page-checklist.js`
- `src/quality-loop.js`
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
- 不允许 `reset`、`stash`、`clean` 或覆盖无关脏改动。
- 不允许修改远端 Pages 或自动化配置来绕过现有发布流程。

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

No parallel writes. 手工改动只用 `apply_patch`；公开产物只通过仓库命令生成。

## Handoff Requirements

- 说明主新闻、热门博客、Builder / X、daily tracking、社区线索分别改了什么。
- 说明 `report:draft`、`quality:review`、`report:write`、`build`、`page-check`、browser、`validate`、`publish:dry-run:daily`、PR、真实发布各自的结果。
- 明确剩余风险，尤其是截图稳定性、Builder 源波动，以及正式发布必须回最新 `origin/main` 的约束。
