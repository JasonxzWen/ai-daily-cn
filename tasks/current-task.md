# Current Task

## Task Class

non-trivial

## Spec

### Goal

把 2026-06-11 日报审阅暴露的问题固化为当前生成系统的硬门禁、数据契约、渲染规范和回归测试。重点不是修某一天 HTML，而是修生成链路：采集、候选池、草稿选择、质量门、公开渲染、发布前验证都必须能阻止同类问题复发。

### Implemented Contract

- 中国 AI 覆盖成为严格日报硬门禁：`report_date >= 2026-06-11` 的 strict 报告必须有 `source_audit.china_ai_sources`，未执行为 blocking，执行但无候选为 degraded，并公开披露检查结果。
- 新增中国 AI 固定信源配置与发现入口：腾讯、阿里、Qwen、DeepSeek、智谱、Kimi、MiniMax、字节 Seed、百度等优先中文官方入口；缺 token 的搜索 provider 不能等价为“未检查”。
- 新增 Hugging Face Trending discovery、schema、draft selection、公开 section 和 runner 阶段，形成类似 GitHub Trending 的趋势板块。
- 正文图片改为语义准入：只允许 benchmark、表格、图表、架构、产品/演示截图、局部榜单截图等信息图；hero/cover/banner、stock、logo、favicon、头像、泛化计算机/机房装饰图等不进入公开正文。
- OpenRouter 和 Artificial Analysis 使用结构化数据渲染榜单/表格，不把整页截图或文本图标当主内容。
- `hot_blogs` 增加中文/中国 AI 分层兜底；存在合格中文技术博客候选时必须入选或在 coverage 中体现排除原因。
- X/Twitter Builder 讨论改为紧凑 feed：正文摘要保留，原文截断，减少卡片空白。
- 公开“信源覆盖与缺口”恢复可读可视化：摘要图标、状态 tag、折叠明细、实际访问状态和缺口说明。
- 长期反馈写入 `config/feedback-ledger.json` 和 `docs/feedback-buglist-quick-reference.md`，所有新增 P1 均绑定 `npm run validate` 覆盖的真实测试或质量门。
- 发布凭据 fallback 测试补充环境隔离；`resolveGitHubToken` 支持 `options.env`，避免本机 `GH_TOKEN` 让 credential-helper fallback 测试失真。

### User-Visible Behavior

- 每日 runner 会执行 `discover:china-ai` 与 `discover:huggingface-trending`，产物传入 `report:draft` 和 `report:write`。
- 中国公司新闻优先中文官方页；英文页可作兜底或交叉验证，但不能让中文信源 lane 消失。
- 如果中国 AI lane 已执行但没有高质量事实信号，日报可以 degraded 发布；未执行 lane 时不能声称 strict 发布成功。
- 公开页不会展示装饰性正文图片；类似 Anthropic 模型发布应优先展示性能表/评测图，Meta compute 这类泛化配图会被拒绝。
- 榜单类追踪以表格/指标组件呈现；截图仅允许局部表格裁剪且优先级低于结构化渲染。
- 中文博客、Hugging Face Trending、Builder 讨论和信源覆盖的公开布局均有确定性测试约束。

### Boundaries

- 不手工编辑单日公开 HTML 来伪造效果；所有页面变化来自生成链路和 `npm run build`。
- 不修改 `.codex/automations/**`、远端 Pages 设置、GitHub branch protection 或自动化调度配置。
- 不自动 commit、push 或发布；本轮只改当前工作树源码、配置、测试、文档和构建产物。
- 中国 AI 硬门禁约束的是“必须检查、必须披露、合格信号必须可见”，不是强行塞低质量中文内容。
- 搜索 provider/token 不稳定时，系统应记录跳过/失败原因，并继续使用固定中文官方源或其它可用 provider。

## Acceptance Criteria

- `config/feedback-ledger.json` 新增 7 个 P1：`feedback/p1-semantic-evidence-images`、`feedback/p1-china-ai-hard-gate`、`feedback/p1-tracking-visual-tables`、`feedback/p1-chinese-hot-blog-slot`、`feedback/p1-huggingface-trending-section`、`feedback/p1-compact-builder-discussion`、`feedback/p1-public-source-coverage-visualization`。
- `docs/feedback-buglist-quick-reference.md` 同步新增上述规则。
- `config/sources/china-ai-sources.json` 存在，`npm run sources:validate` 通过且 source count 更新为 148。
- `src/daily-runner.js` 包含 `discover_huggingface_trending` 与 `discover_china_ai` 阶段，并将 `.tmp/huggingface-trending-<date>.json`、`.tmp/china-ai-<date>.json` 纳入 draft inputs。
- `src/quality-status.js` 对 2026-06-11 及之后 strict 日报启用中国 AI source audit blocking/degraded 门，并检查非语义公开图片。
- `src/media-policy.js`、`src/evidence-cache.js`、`src/site.js` 共同限制公开 evidence asset 只能是有信息量的图片。
- `src/discovery.js`、`src/cli.js`、`package.json` 支持 `discover:huggingface-trending` 与 `discover:china-ai`。
- `src/draft.js` 能选择 Hugging Face Trending 条目，并为中文/中国 AI 博客保留合格入口。
- `src/interaction-report.js` 渲染 Hugging Face Trending、结构化榜单、紧凑 Builder 讨论和可折叠信源覆盖明细。
- `tests/unit.test.js` 覆盖中国 AI 硬门禁、语义图片门、榜单表格、HF Trending、中文博客 slot、紧凑 Builder、信源覆盖可视化。
- `tests/publish.test.js` 覆盖 gh auth 不可用时 fallback 到 Git credential helper，且不受本机环境 token 干扰。
- `npm run validate` 通过。

## Feedback Ledger Review

- 已审阅 `config/feedback-ledger.json` 与 `docs/feedback-buglist-quick-reference.md`，本轮新增反馈均按 P1 固化，并绑定真实测试或质量门。
- `feedback/p1-ledger-validation-binding`：新增 P1 不能只写 prompt，已通过 `node scripts/validate-feedback-contract.mjs` 绑定测试与 scope。
- `feedback/p1-domestic-dynamics-public-visibility`：升级为中国 AI lane 必检、缺口公开、strict 未执行 blocking。
- `feedback/p1-public-media-contract`：扩展为语义图片门，拒绝装饰图、整页截图、小图标、logo、头像。
- `feedback/p1-editorial-importance-density-source-visibility`：恢复公开 coverage 可视化和折叠访问明细。
- `feedback/p1-public-signal-layering`：中文博客和中国 AI 信号独立分层，不再被海外英文源挤掉。
- `feedback/p1-ai-quality-review-loop`：页面检查和 unit 测试覆盖图片语义、榜单结构化、coverage、X 紧凑布局等复发点。
- `feedback/p1-platform-exempt-public-rendering`：Builder/X 保留原始状态但做截断和公开安全渲染，不回退到内部 thread dump。

## Regression Self-Check

- Regression self-check summary: this section maps each known feedback regression to a concrete test, quality gate, page-check, or validation command.
- 新增 ledger/quick reference 后运行 `node scripts/validate-feedback-contract.mjs`，结果 pass。
- `feedback/p1-semantic-evidence-images` 对应 `semantic evidence asset gate rejects decorative article images` 与 `public_content_media_valid` page-check。
- `feedback/p1-china-ai-hard-gate` 对应 `china ai hard gate blocks strict publish when China lane is missing` 与 strict quality gate。
- `feedback/p1-tracking-visual-tables` 对应 `tracking visual tables render OpenRouter and Artificial Analysis without screenshots` 与 `daily_tracking_structured_not_screenshot` page-check。
- `feedback/p1-chinese-hot-blog-slot` 对应 `report:draft reserves Chinese hot blog slot when qualified`。
- `feedback/p1-huggingface-trending-section` 对应 `huggingface trending discovery and public section`。
- `feedback/p1-compact-builder-discussion` 对应 `compact builder discussion truncates original posts`。
- `feedback/p1-public-source-coverage-visualization` 对应 `public source coverage visualization uses tags and collapsed details`。
- 新增/修改 schema、source registry 后运行 JSON parse、`npm run sources:validate`，结果 pass。
- 新增 runner/workflow 入口后运行 `npm run workflow:validate`，结果 pass。
- 新增 unit/publish 测试后运行 `npm run test`，308 tests pass。
- 涉及公开 HTML/CSS/渲染后运行 `npm run build` 和 `npm run quality:page-check -- 2026-06-10 docs .tmp/page-check-2026-06-10-hard-gates.json`，桌面 1280x900 与移动 375x812 均 pass。
- 用 Playwright 额外截图验收最新可构建日报 `2026-06-10`，确认首屏、榜单区域、移动榜单区域无明显遮挡、错位或横向溢出。
- 运行 `npm run privacy:validate`，105 public files checked，0 findings。
- 运行 `npm run test:e2e`，pass。
- 运行 `npm run validate`，完整仓库级门 pass。
- 当前仓库本地 reports-data 只到 `2026-06-10`，因此页面验收使用最新可构建页面；`2026-06-11` 真实日报需在下一次 runner 生成后再按同一 page-check 门验收。

## Red Test

本轮在实现前定义的红灯边界如下，旧实现无法满足这些断言；最终已把对应断言纳入 `tests/unit.test.js` 和 `tests/publish.test.js` 并跑绿：

```powershell
node --test tests/unit.test.js --test-name-pattern "china ai hard gate|semantic evidence asset gate|tracking visual tables|huggingface trending|public source coverage visualization|compact builder discussion|Chinese hot blog"
```

预期旧实现失败点：

- `china ai hard gate`：旧 runner/report quality 没有独立中国 AI audit group，strict 发布不会因 lane 未执行而 blocking。
- `semantic evidence asset gate`：旧图片过滤主要按 URL/尺寸/角色，不能稳定拒绝 hero 装饰图或泛化配图。
- `tracking visual tables`：旧公开追踪卡片不保证 OpenRouter/Artificial Analysis 用源站式表格组件呈现。
- `huggingface trending`：旧链路没有 HF Trending discovery/schema/section。
- `public source coverage visualization`：旧 coverage 是纯文本列表，可读性差且缺少折叠访问明细。
- `compact builder discussion`：旧 Builder/X 卡片可能展示大块原文和空白。
- `Chinese hot blog`：旧 `hot_blogs` 没有中文/中国 AI slot 兜底。

## Deterministic Substitute

未保留独立的旧代码红灯运行输出；替代证据是本轮新增测试直接断言旧实现不存在的导出、schema 字段、runner 阶段、quality issue code 和公开 DOM 结构，且这些断言全部被 `npm run validate` 覆盖。后续若需要审计红灯，可在临时 worktree 中把本轮实现回退到 HEAD、保留新增测试运行上述 pattern，预期失败。

## Allowed Paths

- `config/feedback-ledger.json`
- `config/search-queries.json`
- `config/sources/**`
- `docs/data/**`
- `docs/feedback-buglist-quick-reference.md`
- `docs/reports/**`
- `package.json`
- `prompts/**`
- `progress.md`
- `schemas/**`
- `session-handoff.md`
- `src/**`
- `tasks/current-task.md`
- `tasks/daily-publish-runbook.md`
- `tests/**`

## Forbidden Paths

- 不修改 `.codex/automations/**`、远端 Pages 设置、GitHub Actions 发布配置或自动化调度配置。
- 不使用 `git reset --hard`、`git checkout --`、`git clean`、stash 或覆盖用户工作的命令。
- 不绕过、弱化或删除 `node scripts/harness-validate.mjs`、`node scripts/validate-feedback-contract.mjs`、`npm run validate`。
- 不把新增长期要求仅写进 prompt 或会话回复；必须绑定测试或运行时质量门。

## Validation Commands

- `node --check src/media-policy.js src/evidence-cache.js src/draft.js src/discovery.js src/cli.js src/daily-runner.js src/interaction-report.js src/quality-status.js src/report.js src/site.js src/publish.js tests/unit.test.js tests/publish.test.js`: pass。
- JSON parse for changed config/schema/prompt files: pass。
- `node scripts/validate-feedback-contract.mjs`: pass。
- `node scripts/harness-validate.mjs`: pass。
- `npm run sources:validate`: pass。
- `npm run workflow:validate`: pass。
- `git diff --check`: pass。
- `node --test tests/publish.test.js`: pass, 45/45。
- `npm run test`: pass, 308/308。
- `npm run build`: pass。
- `npm run quality:page-check -- 2026-06-10 docs .tmp/page-check-2026-06-10-hard-gates.json`: pass。
- Playwright screenshots: pass, desktop and mobile latest build checked.
- `npm run privacy:validate`: pass。
- `npm run test:e2e`: pass。
- `npm run validate`: pass。

## Parallel Writes

No parallel writes. Manual edits used `apply_patch`; generated docs/data/report changes came from `npm run build`; page-check and screenshots are under ignored `.tmp/`.

## Handoff Requirements

- 汇报硬门禁和规范变更已落地到源码、schema、ledger、prompt、runbook 和测试。
- 汇报完整验证门通过，以及页面验收使用 `2026-06-10` 的原因。
- 汇报未执行真实日报发布、未改自动化配置、未推送远端。
- 汇报残余风险：中文站点访问/动态渲染、provider token、HF Trending 页面结构变化、2026-06-11 真实 runner 生成后仍需按同一 page-check 门验收。
