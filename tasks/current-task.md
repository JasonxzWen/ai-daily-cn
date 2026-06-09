# Current Task

## Task Class

non-trivial

## Spec

### Goal

固化 2026-06-09 日报复盘中用户确认的公开日报合同，先用机器可验证的 ledger、fixture、测试和质量门固定回归边界，再调整生成与公开渲染，使日报稳定产出多板块高密度情报页。

### User-Visible Behavior

- 公开日报是多板块高密度情报页，不是调试面板或候选池说明。
- 主体新闻使用 `8-12` 条短新闻流，按公共 AI 重要性排序，不按个人工作相关性过滤。
- 每条主体短新闻展示标题、`2-3` 句可追溯事实概括和原文链接；不展示“为什么重要”“启示”“入选原因”“后续观察”等解释型废话。
- OpenRouter、Artificial Analysis 等榜单/价格/模型排名板块优先展示从 DOM、JSON 或页面文本解析出的结构化表格；整页截图不能作为公开正文主内容。
- 正文图片是可选增强，不是必需品；没有合格图片也允许成功发布。
- 公开正文图片必须通过硬门禁；小图标、favicon、logo、头像、不可读图、尺寸不足图和整页截图不进入公开正文。
- GitHub、博客、Builder、社区、国内动态、平台豁免内容等其他重要板块继续保留，但必须用紧凑列表或表格呈现，不用废话凑数。
- 公开页不展示重要性分数、入选理由、候选池解释、抓取状态长列表、ledger 命中项、降级日志或调试审计。
- 内部质量报告保留评分、候选池、降级项、失败回放、截图证据、发布日志和可追溯字段。

### Boundaries

- 不回滚 PR #68 的 platform exempt channels。
- 不手工编辑 `docs/` 下已发布日报 HTML 来伪造效果；产物必须由生成/渲染逻辑产生。
- 不修改远程 Pages 设置、定时任务配置或 GitHub automation，除非用户另行授权。
- 不把用户确认的规则只写进 prompt；必须绑定 ledger 和验证门。
- 不要求固定图片数量；只要求出现的公开图片合格。
- 不为通过数量门生成空泛占位内容；主体 `8-12` 是硬合同，其他板块宁缺毋滥并在内部报告记录不足。
- 不让 LLM 决定页面结构、条数、图片展示、榜单形态或发布是否阻塞；LLM 只可生成可追溯事实摘要草稿。

### Non-Goals

- 不在本轮重新设计所有信源发现器。
- 不新增需要登录态、cookie 或第三方密钥的采集。
- 不自动 commit、push、创建 PR 或修改线上发布设置。
- 不把内部质量报告做成最终视觉设计，只需先形成清晰的产物边界和验证依据。

## Acceptance Criteria

- `config/feedback-ledger.json` 增加本轮用户确认的 P1 反馈项，并绑定 `npm run validate` 覆盖的真实测试或运行时质量门。
- `docs/feedback-buglist-quick-reference.md` 同步新增速查项，后续任务能在开始前回放本轮问题。
- 2026-06-09 坏日报表现形成 fixture 或确定性测试输入，覆盖主体条数不足、公开图片无效、整页截图主内容、公开页调试化、AI 腔和低重要性排序复发风险。
- 质量门要求主体新闻 `8-12` 条；少于 8 条且无网络全阻塞解释时为硬失败。
- 质量门或渲染门禁止公开正文使用整页截图作为主内容，榜单类数据必须优先结构化呈现。
- 质量门或渲染门禁止不合格图片进入公开正文；`28x28` 等小图标不能作为 evidence 图展示。
- `report:draft` / `report:write` / 渲染路径不再要求主体新闻具备 `why_it_matters` 或 `reader_relevance`，也不把这类字段作为公开正文必需项。
- 主体短新闻公开渲染为紧凑新闻流，不展示入选原因、为什么重要、后续观察、评分或候选池解释。
- OpenRouter / Artificial Analysis 等 daily tracking 内容在公开页以结构化表格或结构化指标呈现；截图最多作为内部或折叠证据，不作为主内容。
- 自动发布允许非关键图片/榜单/板块局部降级，降级项进入内部质量报告；公开页硬合同失败才阻塞。
- `npm run validate` 通过。
- 涉及公开页渲染、CSS 或图片展示的改动完成本地构建和浏览器/Playwright 页面验收，并记录结果。

## Feedback Ledger Review

- `feedback/p1-ledger-validation-binding`: 本轮用户明确确认所有长期问题必须进入 ledger 并绑定验证门；新增项必须满足该合同。
- `feedback/p1-origin-main-baseline`: 已确认当前工作区更新到 `origin/main` commit `b7bcd06`，包含 PR #68。
- `feedback/p1-clean-publish-checkout`: 本轮不修改 automation，不 stash/reset/clean，不触碰其他 worktree。
- `feedback/p1-main-visible-bullets-no-generic-watch-next`: 本轮扩展为公开主体短新闻不得展示 `why_it_matters`、`watch_next`、入选原因和泛化解释。
- `feedback/p1-ai-quality-review-loop`: 现有质量循环能抓部分 AI 腔，但未覆盖 2026-06-09 的坏图、整页截图和公开页调试化，需要新增回归门。
- `feedback/p1-feedback-memory-self-check`: 本任务先写规格和回归自检，交付前必须列出对应 ledger、fixture、命令和页面验收。
- `feedback/p1-source-outage-disclosure`: 非关键采集失败应进入内部降级报告，不应污染公开正文或阻塞合格主体。
- `feedback/p1-search-provider-partials`: 局部信源/榜单解析失败应保留健康部分并记录 provider/source 级降级项。
- `feedback/p1-domestic-dynamics-public-visibility`: 多板块高密度页继续保留国内动态和平台内容，不能因主体改短新闻流而隐藏。

## Regression Self-Check

- `feedback/p1-public-daily-content-contract`: `node --test tests/unit.test.js --test-name-pattern "public daily contract"` 通过；新增测试覆盖 8-12 条主体短新闻、无解释字段也可合格、少于 8 条坏样本会被拒绝。
- `feedback/p1-public-media-contract`: `tests/fixtures/reports/bad/public-daily-2026-06-09-regression.json` 回放 `28x28` 图标和 `1280x900` 整页截图；`src/quality-status.js` 与 `src/page-checklist.js` 均检查公开媒体尺寸、角色和截图语义；无图日报可通过。
- `feedback/p1-public-internal-report-separation`: `src/interaction-report.js` 默认隐藏 source audit/self-check/ledger/degradation/candidate diagnostics；`npm run quality:page-check -- 2026-06-09 docs .tmp/page-check-2026-06-09-after.json` 验证 `public_debug_sections_absent` 通过。
- `feedback/p1-public-importance-selection`: `src/draft.js` 使用 public AI importance 加权，允许大厂、模型、产品、API、价格、监管、资本和泛 AI 热点进入主体，不再要求个人工作相关。
- `feedback/p1-2026-06-09-regression-replay`: 坏日报 fixture 已绑定单测；页面回放验证 OpenRouter / Artificial Analysis 公开呈现为结构化表格，且 `daily_tracking_structured_not_screenshot` 通过。
- Prompt contract sync: `prompts/ai-daily/modules/editorial-authority.md` 和其它 prompt 模块已同步 8-12 条短新闻流、公共 AI 重要性排序、榜单结构化表格优先、公开/内部报告分离和图片质量门，避免生成入口继续使用旧合同。
- `feedback/p1-ledger-validation-binding` 与 `feedback/p1-feedback-memory-self-check`: `config/feedback-ledger.json` 新增 P1 项全部绑定真实 scope、`npm run validate` 覆盖命令和测试名；`node scripts/validate-feedback-contract.mjs` 与 `npm run validate` 均通过。
- 前端/页面验收：已运行 `npm run build`；已运行 `npm run quality:page-check -- 2026-06-09 docs .tmp/page-check-2026-06-09-after.json`，覆盖 1280x900 与 375x812 视口，无横向溢出、无远程媒体、图片全部加载、公开内容图全部合格，且新增 `daily_tracking_table_compact` 防止移动端榜单行高被拉成大空白。
- 截图验收：`.tmp/visual-2026-06-09-mobile.png` 与裁剪图 `.tmp/visual-2026-06-09-mobile-crop-tracking.png` 已检查；移动端 OpenRouter / Artificial Analysis 表格行高从异常大空白修复为 `38-39px` 紧凑行高。

## Red Test

先运行当前代码下的确定性失败验证：

```powershell
node --test tests/unit.test.js --test-name-pattern "public daily contract"
```

预期初始失败：

- 当前测试尚未存在，或新增测试会证明当前质量门允许 `28x28` evidence 图、允许整页截图作为 daily tracking 公开主媒体、允许公开页暴露调试审计/入选解释、并仍要求主体解释字段。

实际红灯证据：

- `node --test tests/unit.test.js --test-name-pattern "public daily contract"` 返回 exit code `1`。
- 失败 1：`public daily contract accepts no-image short news without explanation fields` 命中 `editorial_context_gate_failed`，说明旧质量门仍要求主体解释字段。
- 失败 2：`public daily contract rejects invalid public media but allows missing media` 未产生 `public_media_contract_failed`，说明旧质量门没有识别 `28x28` 图标和整页截图。
- 失败 3：`public daily contract renders tables instead of screenshots and hides audit appendices` 在 `formatCardMedia` 尝试渲染截图媒体时失败，说明公开交互输入仍把截图当正文媒体处理。

## Deterministic Substitute

如果无法在新增测试前执行指定 pattern，则先运行以下现状验证作为替代红灯证据：

```powershell
npm run quality:page-check -- 2026-06-09 docs .tmp/page-check-2026-06-09-current-review.json
```

当前已知现状：该命令可通过，但 2026-06-09 数据里仍存在 `main_items: 3`、`28x28` evidence 图和 OpenRouter/Artificial Analysis `1280x900` 整页截图。该通过结果证明旧页面质量门无法捕捉用户确认的问题。

## Allowed Paths

- `config/feedback-ledger.json`
- `docs/feedback-buglist-quick-reference.md`
- `package.json`
- `prompts/**`
- `progress.md`
- `schemas/**`
- `scripts/**`
- `session-handoff.md`
- `src/**`
- `tasks/current-task.md`
- `tests/**`

## Forbidden Paths

- 不手工修改 `docs/YYYY/**` 公开日报 HTML 产物来伪造修复。
- 不修改 `.codex/automations/**`、GitHub Pages 设置、远端分支保护或定时任务配置。
- 不使用 `git reset --hard`、`git checkout --`、`git clean`、stash 或任何会覆盖用户工作的命令。
- 不绕过、弱化或删除 `node scripts/harness-validate.mjs`、`node scripts/validate-feedback-contract.mjs`、`npm run validate`。

## Validation Commands

- `node --test tests/unit.test.js --test-name-pattern "public daily contract"`
- `node --test tests/unit.test.js --test-name-pattern "prompt:build"`
- `node scripts/validate-feedback-contract.mjs`
- `npm run build`
- `npm run test:e2e`
- `npm run quality:page-check -- 2026-06-09 docs .tmp/page-check-2026-06-09-after.json`
- Playwright screenshot: `.tmp/visual-2026-06-09-mobile.png`
- `npm run validate`
- `git diff --check`

## Parallel Writes

No parallel writes. Manual edits use `apply_patch`; generated temporary output is allowed only under ignored temp/cache locations or existing validation outputs.

## Handoff Requirements

- Report ledger IDs added or updated.
- Report fixture/test names and the original red/failing evidence.
- Report implementation files changed at a high level.
- Report validation commands and browser/page-check evidence.
- Report residual risks, especially any remaining source discovery or automation behavior not changed in this iteration.

## Generation Addendum

User requested a fresh 2026-06-09 report from the repaired worktree. Safety boundary: do not publish, commit, push, change automation, or hand-edit generated HTML; regenerate through repo commands only.

## Generation Result 2026-06-09

- Regenerated discovery, draft, quality review, `reports-data/2026/06/2026-06-09.json`, `docs/data/2026/06/2026-06-09.json`, and `docs/reports/2026/06/2026-06-09.html` through repo commands.
- Final counts after platform wiring: `main_items=10`, `github_trending=10`, `hot_blogs=3`, `daily_tracking=3`, `builder_observations=6`, `community_leads=8`, `reddit_items=2`, `wechat_items=0`, `zhihu_items=0`.
- Public data has no forbidden internal keys and no public candidate pool file; public evidence assets are valid `source_asset` images only.
- `quality:review` returned `ok: true`, `issues: []`; `quality:page-check` passed desktop/mobile, including structured tracking tables, no screenshot media, no debug sections, valid local media, and no overflow.
- `publish:dry-run:daily -- --date 2026-06-09` was blocked by `wrong_branch` because this worktree is detached HEAD; no publish or remote/automation change happened.

## Follow-up Fix Addendum

Follow-up findings fixed: public `docs/data` internal leakage, split main sections, public-importance sorting, platform discovery not wired into `daily-runner`, and Reddit public card leakage. PR #68 is present at `b7bcd06`; Reddit is now enabled and selected, while WeChat/Zhihu remain placeholder kill-switched sources with no real feed. Platform cards now render reader-facing titles/summaries and hide `source_id`, `rule_id`, `verification_status`, `matched_terms`, and `why_watch` from public HTML.

## Archive And Workflow Addendum

User requested durable archiving and workflow/checklist hardening for this incident. Added `feedback/p1-platform-exempt-public-rendering` to capture the remaining platform-card presentation failure: platform sections can be wired and selected but still be unacceptable if public cards expose discovery internals, machine feed titles, or raw English thread dumps. Updated the quick reference and `tasks/daily-publish-runbook.md` so future manual runs must execute WeChat/Zhihu/Reddit discovery, pass those JSON outputs into `report:draft`, and inspect public platform cards for internal-field leakage.

Regression self-check for this addendum: `node scripts/validate-feedback-contract.mjs`, `node --test --test-name-pattern "platform exempt report sections require public audit disclosure|daily runner wires platform exempt" tests/unit.test.js`, and `npm run validate`.
