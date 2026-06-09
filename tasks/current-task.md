# Current Task

## Task Class

non-trivial

## Spec

### Goal

修复这一轮 AI 日报内容升级在 `2026-06-09` 正式稿上的主线欠选问题，并基于修正后的合同重新生成、验收、发布 `2026-06-09` 日报。

### Authority

本轮内容合同与维护面严格参考以下资产，冲突时按先后顺序执行：

1. `prompts/ai-daily/modules/editorial-authority.md`
2. `docs/ai-daily-content-refactor-roi-plan.md`
3. `docs/daily-content-iteration-history.md`
4. `docs/daily-content-good-bad-cases.md`
5. `config/feedback-ledger.json`
6. `docs/feedback-buglist-quick-reference.md`

### Current Execution Target

- `2026-06-08`：固定回归样本，只用于分支内逻辑回归、fixture 验证和预览验收。
- `2026-06-09`：已发布稿存在主新闻数量明显偏低的问题；修正后仍只能在 latest `origin/main` clean checkout 上重新生成、验收和发布。

### User-Visible Behavior

- 主新闻不再写成“变化 / 落点 / 判断点 / why it matters / watch_next”模板，而是 `3-5` 条短 bullet，直接讲事实、范围、影响，并保留重点词高亮。
- 官方产品 / 平台 / 开源深读，只要明确影响产品判断、工作流、成本、可用范围或企业接入路径，不能仅因为来源长得像 blog 就被默认压进“热门博客”或“社区线索”。
- `hot_blogs` 对外统一显示为“热门博客”，内容边界扩到内容、产品、平台、策略、组织方法、访谈和高质量播客，不再局限“工程博客”。
- Builder / X 卡片必须同时展示干净原文和完整中文，不混入点赞、回复、图片占位、按钮文案或网页壳信息。
- `daily_tracking` 对 OpenRouter、Artificial Analysis 优先展示 `3-5` 张高信息密度图片；抓图失败时允许降级，但不把抓取过程写进公开页。
- `community_leads` 改成“一行一条新闻”的高密度线索流，保留图片，去掉同题重复、长英文标题直出和流程腔。
- 公开页面不能再出现机器日志、工作汇报腔、旧栏目名、乱码、坏图、远程直链图或横向溢出。

### Boundaries

- 保留现有公开栏目框架，不重做整站信息架构。
- 保留 GitHub Trending Top 10 的完整展示合同。
- 国内/中文内容并入现有栏目，不单开“国内动态”空导航。
- 不手改 `docs/**`、`reports-data/**` 正式产物，只能通过仓库命令生成。
- 不使用 `reset`、`stash`、`clean` 或覆盖无关脏改动。
- 不绕过 `origin/main`、clean checkout、`publish:dry-run:daily` 的发布门。

### Non-Goals

- 本轮不重做 schema。
- 本轮不为了凑数量保留低价值小新闻。
- 本轮不新增固定的 Product Hunt / 播客 / Twitter 独立大栏目。

### Workstreams

1. 主新闻改写合同
   - `src/draft.js`：收紧候选升主规则，过滤低价值小发布、弱合作稿、轻运营更新、无能力边界变化的厂商小新闻，同时把符合“官方产品 / 平台 / 开源深读”条件的条目补回主线。
   - `src/interaction-report.js`：主新闻公开形态固定为 `3-5` 条 bullet，不再渲染旧模板话术。
   - `src/quality-loop.js`：拦截“读者应重点看”“判断点”“把它当作信号”“后续继续跟踪”等模板腔。
2. 热门博客扩边界
   - 对外命名统一为“热门博客”。
   - 允许产品拆解、平台策略、组织方法、内容生态、访谈、播客进入。
   - 过滤不可读标题、feed/changelog 索引页、泛公告和空泛推荐语。
3. Builder / X 清洗
   - 保留原文、中文、头像、本地证据图。
   - 去掉点赞、回复、关注按钮、查看原帖按钮、图片占位和网页元信息。
   - 只保留与产品、工程、agent、评测、团队实践直接相关的帖子。
4. 社区线索重排
   - 压成“一行一条新闻”。
   - 做同题去重、标题可读性过滤、中文摘要收敛。
   - 有本地图优先挂本地图；无图可降级，但不能回退成流程说明。
5. Tracking 图证
   - OpenRouter / Artificial Analysis 在可抓图时优先各展示 `3-5` 张本地证据图。
   - 不直渲远程 `http(s)` 图。
   - 图证不足时允许降级成文字版，但必须显式体现为质量降级，不伪装成多图覆盖。
6. 发布门与验收
   - 顺序固定为：`report:draft -> quality:review -> report:write -> build -> quality:page-check -> Browser 验收 -> validate -> publish:dry-run:daily -> publish`
   - 若分支上被 `current_not_origin_main` 或 revision gate 拦截，则先 PR/merge，再回 latest `origin/main` clean checkout 重跑正式链路。

## Acceptance Criteria

- 主新闻公开层全部是 `3-5` 条短 bullet，没有旧模板前缀和空判断句。
- 当天存在多条官方产品 / 平台 / 开源动作时，`main_items` 不能被误筛到只剩 1 条；这类条目应优先进入主线，而不是被默认压到 `hot_blogs`。
- “热门博客”在所有公开路径命名一致，摘要像内容提炼，不像推荐语。
- Builder / X 卡片原文干净、中文完整，没有网页元信息噪音。
- 社区线索是一行一条新闻流，保留图片，去掉同题重复和流程腔。
- OpenRouter / Artificial Analysis 成功抓图时页面各展示 `3-5` 张可点击放大的本地证据图。
- 公开页面没有机器日志、旧栏目名、乱码、坏图、远程直链图和横向溢出。
- 正式 `2026-06-09` 发布前，`npm run validate` 与 `npm run publish:dry-run:daily -- --date 2026-06-09` 通过。

## Test Boundaries

### 1. 单元测试

- 只验证规则、筛选、清洗、渲染转换，不依赖当天外部网站可访问性。
- 必须覆盖：
  - 主新闻 `3-5` bullet 合同和旧模板拦截。
  - “热门博客”命名、可读性和空泛摘要拦截。
  - Builder / X 原文噪音清洗。
  - 社区线索去重、摘要收敛、图片保留。
  - Tracking 只接受本地证据图，且为社区线索保留图位。

### 2. E2E / fixture

- `tests/e2e/site.e2e.js` 只验证公开页结构和展示合同，不承担当天抓取成功率验证。
- 必须断言：
  - 页面只出现“热门博客”，不出现旧栏目名。
  - Builder / X 不含 `Likes`、`Replies`、`Follow`、`View post` 等噪音。
  - 社区线索按新闻流展示。
  - 公开卡片不直渲远程 `http(s)` 图片。

### 3. 固定回归样本

- 分支内内容回归统一用 `.tmp/publish-worktrees/main/.tmp/*2026-06-08*.json`。
- 这一层只回答“新合同有没有落到真实样本上”，不验证 discovery 抓取器本身。

### 4. 页面验收

- 自动层：`quality:page-check` 检查无旧口径、无远程图、无坏图、无横向溢出、Tracking 图数达标。
- 人工层：用 Browser 在桌面和移动端确认主新闻 bullet、Tracking 多图、Builder 原文、社区新闻流都按新合同落地。
- 任一端出现机器日志、旧栏目名、坏图或横向溢出，都算失败。

### 5. 发布边界

- 分支上的 `docs/**` 预览只用于回归，不作为正式发布验收对象。
- 只有 latest `origin/main` clean checkout 重新生成的 `reports-data/**` 和 `docs/**` 才能作为正式验收对象。
- 第三方抓图源当日 blocked 不直接算实现失败，但降级行为和质量标记必须符合合同。

## Feedback Ledger Review

已审阅 `config/feedback-ledger.json` 和 `docs/feedback-buglist-quick-reference.md`。本轮直接对应并回放以下长期问题：

这次不是泛泛检查，而是按 feedback-ledger 台账逐条回放与本轮改造直接相关的公开内容回归风险。

- `feedback/p1-main-visible-bullets-no-generic-watch-next`
- `feedback/p1-main-groups-first-level-navigation`
- `feedback/p1-domestic-dynamics-public-visibility`
- `feedback/p1-ai-quality-review-loop`
- `feedback/p1-feedback-memory-self-check`

本轮处理方式不是只改文案，而是同时收紧候选筛选、公开渲染、质量门和页面验收，避免主新闻模板腔、旧栏目名、Builder 噪音、社区流程腔和机器日志再次回流到公开页。
这次新增回放的具体风险是：不能把大量官方产品 / 平台 / 开源条目因为“看起来像 blog”而误压到边栏，导致正式稿主新闻只剩 1 条。

## Regression Self-Check

- 已执行 `node --test tests/unit.test.js --test-name-pattern "report:draft promotes official product and platform deep dives into main_items|report:draft prefers specific hot blog evidence over generic feed announcements"`，确认主线补回 RocketMQ / AgentScope，Nemotron 继续留在 `hot_blogs`。
- 已执行 `node src/cli.js report:draft --date 2026-06-09 --input .tmp/publish-worktrees/main/.tmp/github-trending-2026-06-09.json,.tmp/publish-worktrees/main/.tmp/builders-2026-06-09.json,.tmp/publish-worktrees/main/.tmp/content-sources-2026-06-09.json,.tmp/publish-worktrees/main/.tmp/statuspage-incidents-2026-06-09.json,.tmp/publish-worktrees/main/.tmp/search-news-2026-06-09.json,.tmp/publish-worktrees/main/.tmp/sources-health-2026-06-09.json --output .tmp/daily-report-2026-06-09.json --candidate-output .tmp/source-candidates-2026-06-09.json`，确认 `main_items` 从已发布稿的 `1` 条恢复到 `3` 条。
- 已执行 `npm run quality:review -- .tmp/daily-report-2026-06-09.json .tmp/quality-review-2026-06-09.json .tmp/source-candidates-2026-06-09.json`，结果为 `status: ok`；当前只剩主新闻高亮密度 warning，不是阻塞项。

- 本轮回归自检聚焦“用户已经指出的问题不能再次回流到公开日报”。
- 检查 `src/draft.js`：低价值小新闻不过主线；社区线索去重并保持可读摘要。
- 检查 `src/draft.js`：官方产品 / 平台 / 开源深读在具备明确工作流、成本、可用范围或接入影响时，可以进入 `main_items`，而不是被 `isBlogLikeCandidate()` 一刀误杀。
- 检查 `src/interaction-report.js`：主新闻、热门博客、Builder / X、社区线索、Tracking 的公开形态都按新合同输出。
- 检查 `src/evidence-cache.js`：已有本地图不重复抓取，并为 `community_leads` 预留证据图名额。
- 检查 `src/page-checklist.js`：公开页远程图、旧口径、Tracking 图数、坏图和加载超时都有显式检查。
- 检查 `tests/unit.test.js`、`tests/skills.test.js`、`tests/e2e/site.e2e.js`：覆盖上述合同和回归风险。
- 检查正式发布门：最终日报必须回 latest `origin/main` clean checkout 重跑，不能在功能分支直接落正式产物。

## Red Test

本轮新增红灯证据：

```powershell
node --test tests/unit.test.js --test-name-pattern "report:draft promotes official product and platform deep dives into main_items"
```

失败点是：`official NotebookLM product update should enter main_items`，证明旧规则会把该进主线的官方产品 / 平台深读误压到边栏。

实现前先以固定样本和既有失败点做红灯约束：

```powershell
node --test tests/unit.test.js --test-name-pattern "report:draft|hot blog|Builder|community leads|OpenRouter|Artificial Analysis|quality review"
```

失败证据以三类问题为准：

- 主新闻曾混入低价值小发布。
- 热门博客曾吃到 feed/changelog 公告或不可读标题。
- 社区线索和 Builder 曾出现重复话题、网页元信息和流程腔。

实现后必须回归：

```powershell
node --test tests/unit.test.js --test-name-pattern "report:draft rewrites Builder English fallbacks and strips community intermediary boilerplate|report:draft prefers specific hot blog evidence over generic feed announcements|report:draft filters unreadable blog titles and low-signal community leads|report:draft dedupes duplicate community topics and keeps reader-facing summaries|report:draft keeps minor consumer AI feature rollouts out of main_items|report:draft limits low-signal vendor partnership items in main coverage|quality review flags generic main item reader-guidance bullets|quality review rejects templated hot blog summaries even when length and Chinese ratio pass|public card media prefers local evidence assets and drops remote fallbacks|evidence cache preserves a community image slot when hot blogs would otherwise take every new asset"
node --test tests/skills.test.js --test-name-pattern "effective-interact renders up to five card media items for daily tracking cards"
node --test tests/e2e/site.e2e.js
node src/cli.js report:draft --date 2026-06-08 --input .tmp/publish-worktrees/main/.tmp/github-trending-2026-06-08.json,.tmp/publish-worktrees/main/.tmp/builders-2026-06-08.json,.tmp/publish-worktrees/main/.tmp/content-sources-2026-06-08.json,.tmp/publish-worktrees/main/.tmp/statuspage-incidents-2026-06-08.json,.tmp/publish-worktrees/main/.tmp/search-news-2026-06-08.json,.tmp/publish-worktrees/main/.tmp/sources-health-2026-06-08.json --output .tmp/daily-report-2026-06-08-main-inputs.json --candidate-output .tmp/source-candidates-2026-06-08-main-inputs.json
npm run quality:review -- .tmp/daily-report-2026-06-08-main-inputs.json .tmp/quality-review-2026-06-08-main-inputs.json .tmp/source-candidates-2026-06-08-main-inputs.json
```

## Deterministic Substitute

Not used.

## Allowed Paths

- `config/feedback-ledger.json`
- `docs/feedback-buglist-quick-reference.md`
- `docs/ai-daily-content-refactor-roi-plan.md`
- `docs/daily-content-iteration-history.md`
- `docs/daily-content-good-bad-cases.md`
- `.codex/skills/effective-interact/assets/components/interaction-ui.css`
- `.codex/skills/effective-interact/scripts/create-interaction.mjs`
- `progress.md`
- `session-handoff.md`
- `prompts/ai-daily/**`
- `scripts/check-daily-page.mjs`
- `src/discovery.js`
- `src/draft.js`
- `src/evidence-cache.js`
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

- `node scripts/harness-validate.mjs`
- `node --test tests/unit.test.js --test-name-pattern "report:draft|hot blog|Builder|community leads|OpenRouter|Artificial Analysis|quality review"`
- `node --test tests/skills.test.js --test-name-pattern "effective-interact renders up to five card media items for daily tracking cards"`
- `node --test tests/e2e/site.e2e.js`
- `node src/cli.js report:draft --date 2026-06-08 --input .tmp/publish-worktrees/main/.tmp/github-trending-2026-06-08.json,.tmp/publish-worktrees/main/.tmp/builders-2026-06-08.json,.tmp/publish-worktrees/main/.tmp/content-sources-2026-06-08.json,.tmp/publish-worktrees/main/.tmp/statuspage-incidents-2026-06-08.json,.tmp/publish-worktrees/main/.tmp/search-news-2026-06-08.json,.tmp/publish-worktrees/main/.tmp/sources-health-2026-06-08.json --output .tmp/daily-report-2026-06-08-main-inputs.json --candidate-output .tmp/source-candidates-2026-06-08-main-inputs.json`
- `npm run quality:review -- .tmp/daily-report-2026-06-08-main-inputs.json .tmp/quality-review-2026-06-08-main-inputs.json .tmp/source-candidates-2026-06-08-main-inputs.json`
- `npm run build`
- `npm run quality:page-check -- 2026-06-08 docs .tmp/page-check-2026-06-08.json`
- `npm run validate`
- `npm run publish:dry-run:daily -- --date 2026-06-09`

## Parallel Writes

No parallel writes. 手工改动只用 `apply_patch`；公开产物只通过仓库命令生成。

## Handoff Requirements

- 说明主新闻、热门博客、Builder / X、daily tracking、社区线索分别改了什么。
- 说明 `report:draft`、`quality:review`、`report:write`、`build`、`page-check`、Browser、`validate`、`publish:dry-run:daily`、PR、正式发布各自结果。
- 明确剩余风险，尤其是第三方抓图稳定性、Builder 源波动和正式发布必须回 latest `origin/main` 的约束。
