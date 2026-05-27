# Codex 自动化创建参数

## 推荐参数

| 字段 | 值 |
|---|---|
| Name | `AI 日报生成、push 与 GitHub Pages 发布` |
| Kind | `cron` |
| Execution environment | `local` |
| CWD | 当前项目目录；如界面要求显式路径，使用 `D:\ai-daily-cn` |
| Schedule | 每日 02:30 |
| RRULE | `FREQ=DAILY;BYHOUR=2;BYMINUTE=30;BYSECOND=0` |
| Timezone | `Asia/Shanghai` |
| Model | 默认 Codex 模型即可；需要更稳时用高推理模型 |
| Reasoning effort | `high` |
| Status | `ACTIVE` |

## 自动化提示词

```text
始终用中文回复。

你在 ai-daily-cn 项目根目录内运行；不要切换到其他固定路径。不要修改 C:\Users\Admin\.codex\automations\ai-2\automation.toml，除非用户明确确认。不要执行 git reset --hard、git push --force、自动 stash 或覆盖用户未提交改动。

目标：按今天的 Asia/Shanghai 日期生成中文 AI 日报，最终发布主产物是由 `.codex/skills/effective-interact` 生成的高度可读、自包含、适合人类浏览的静态 HTML；验证通过后自动提交并 push 到 `main`，由 GitHub Actions Pages workflow 发布到 GitHub Pages。Markdown 不是每日主产物。

执行流程：

1. 计算今天的 `YYYY-MM-DD` 日期。
2. 运行 `npm run publish:prepare-worktree -- --message "chore: save local changes before AI daily report YYYY-MM-DD"`；如果当前分支存在本地改动，先在当前分支提交这些改动；如果当前分支不是 `main`，再切回 `main`。不要使用 `stash`、`reset --hard`、`push --force` 或覆盖用户改动。`wrong_branch` 和非发布产物脏改动不再作为日报生成前的拦截理由，必须先用本步骤归档并回到发布分支。
3. `publish:prepare-worktree` 会在切回 `main` 后执行发布预检；如果远端领先或 `.git` 不可写，它会返回 `publish_status.publish_error` 和 `prepared.publish_ready:false`，但不要因此停止日报生成。只有提交本地改动失败、切分支失败或无法保护用户改动时，才停止。
4. 运行 `npm run prompt:build -- YYYY-MM-DD`，把输出作为本次日报生成与发布的完整工作契约。
5. 按 repo 内提示词模块采样最近 AI 产品、模型、论文、开源项目、工程工具动态和高质量工程博客；优先一手来源。模型发布优先写入 `model_releases`，热门技术博客写入 `hot_blogs`，只有重大工程影响才同时进入 `main_items`。主体信息不足时先拓展信源覆盖，再从 24h 扩展到 48h；48h 仍不足时，才允许补入最近 5 天内与工程工作流直接相关的开源 release 或官方研究/产品更新，并在 `source_window` 和 self_check notes 里记录，不要把日报长期滚成周报。
6. 先写入 `.tmp/source-candidates-YYYY-MM-DD.json` 候选池；所有来源成功、失败、无近期内容都要留痕。允许板块为空，但正文不得绕过候选池。
7. 写入 `.tmp/daily-report.json` 前执行去重和新鲜度检查：最近 7 天出现过的 URL 默认不能再进 `main_items`；同一 URL 不得同时进入 `main_items`、`model_releases` 或 `hot_blogs`；48 小时外内容不得进入摘要或主体信息，只能作为补充/背景且每天最多 1 条。严格筛完只有 2-3 条也正常发布。
8. 写入 `.tmp/daily-report.json` 前执行去套话检查：删掉“高信号”“核心信号”“可观察信号”“更多信号”“其他信号”“预期收益”等泛化或工作汇报式措辞；摘要只写用户需要快速判断的事实、日期、来源和变化。
9. 同一厂商同日或同一 48h 窗口内的多条小更新默认合并成一条厂商动态；官方 docs 没有 dated changelog、release note、RSS、commit 或官方 dated post 交叉确认时，不写入主体信息，只作为社区线索并标记待验证。
10. 生成结构化日报草稿 `.tmp/daily-report.json`。必须包含 `title`、`summary`、`main_items`、来源链接、`model_releases`、`hot_blogs`、`self_check`；没有模型发布、热门技术博客、项目、Builder 观察或社区线索时使用空数组。`main_items`、`model_releases`、`hot_blogs`、`projects`、`builder_observations` 的每个入选条目必须填写候选池中的 `candidate_id`。
11. 运行 `npm run report:write -- .tmp/daily-report.json reports-data YYYY-MM-DD`；该命令会同时写入 `reports-data/YYYY/MM/YYYY-MM-DD.candidates.json`。如果返回 `candidate_pool_missing`、`candidate_pool_reference_invalid` 或 `freshness_gate_failed`，修正候选池、条目回指或重复/旧内容，不要绕过门禁。
12. 运行 `npm run build`，生成 `docs/reports/YYYY/MM/YYYY-MM-DD.html`、`docs/data/YYYY/MM/YYYY-MM-DD.json`、`docs/data/YYYY/MM/YYYY-MM-DD.candidates.json`、`docs/feed.json` 和 `docs/index.html`。日报 HTML 必须由 `.codex/skills/effective-interact/scripts/create-interaction.mjs` 以 `pre-rendered` 模式生成，并展示 `self_check.optimization_suggestions` 中的提示词/规则迭代建议；没有建议时明确显示本轮无新增建议。
13. 运行 `npm run validate`。
14. 运行 `npm run publish:dry-run`，输出将写入文件、将暂存文件、commit message 和预期 GitHub Pages URL；如果 dry-run 失败，保留已生成日报并报告 `publish_error`，不要丢弃产物。
15. 真实发布优先运行 `npm run publish -- confirm-push YYYY-MM-DD`。该命令只允许提交 `docs/` 与 `reports-data/` 发布产物，并执行普通 push；push 到 `main` 后，仓库内 `.github/workflows/deploy-pages.yml` 会运行 `npm run build`，上传 `docs/` artifact，并通过 GitHub Actions 发布 GitHub Pages。发布后必须验证当日 Pages URL 返回 HTTP 200 且页面内容包含当日 `YYYY-MM-DD`。
16. 如果真实发布失败原因是 `.git` 不可写、无法创建 `index.lock`、无法切回 `main` 或本机 Git 元数据权限问题，运行 `npm run publish:github-api -- confirm-push YYYY-MM-DD` 作为兜底发布。该命令不写本机 `.git`，允许从当前工作树把发布器管理的 `docs/` 与 `reports-data/` 产物写入远端 `main`，并使用 `force:false`，不得用于提交非发布器管理文件。它优先使用 `GH_TOKEN` 或 `GITHUB_TOKEN`，环境变量缺失时会尝试 `gh auth token`；用于兜底的 token 必须能触发仓库 workflow。
17. 如果 validate、真实 publish 或 API 兜底发布失败，只报告 `publish_error`、失败原因和修复建议，不做破坏性恢复；如果 prepare-worktree 或 dry-run 只暴露发布环境不可用，继续保留本地日报 HTML/JSON 产物。
18. 根据今日采样、入选/降级内容、自检结果和 repo 内提示词模块，输出最多 3 条提示词或规则迭代建议。建议只给用户人工确认，不自动写回提示词模块；这些建议必须同时进入 `self_check.optimization_suggestions`，并在最终回复的“反思与自动化迭代建议”小节单独列出。

最终回复必须包含：

- 今日日报 HTML 路径。
- 结构化 JSON 路径。
- `validate` 结果。
- `publish:dry-run` 结果和预期 Pages URL。
- 真实发布后的 Pages URL HTTP 验证结果。
- 今日采样与提示词规则的差距。
- 最多 3 条需要用户确认的提示词/规则迭代建议。
```

## 当前发布边界

当前仓库已具备本地生成、effective-interact HTML 渲染、验证、`publish:dry-run`、显式确认后的安全本机 Git `publish`、不依赖本机 `.git` 写入权限的 GitHub API 兜底发布能力，以及 push 后由 GitHub Actions 发布 `docs/` artifact 到 GitHub Pages 的 workflow。远端 Pages 设置必须使用 `GitHub Actions` source；如果仍是 `main /docs` legacy source，先不要切换到“只依赖 workflow”的发布假设。

发布前工作树整理与预检命令：

```powershell
npm run publish:prepare-worktree -- --message "chore: save local changes before AI daily report YYYY-MM-DD"
```

该命令不会生成日报，也不会 push；它会先把当前分支本地改动提交到当前分支，再切回 `main` 并检查远端状态和 `.git` 写权限。远端领先或 `.git` 不可写只会标记真实发布暂不可用，不再阻塞后续日报生成和验证。

底层只读预检命令仍保留给人工诊断：

```powershell
npm run publish:preflight
```

真实发布命令：

```powershell
npm run publish -- confirm-push YYYY-MM-DD
```

该命令只允许提交 `docs/` 与 `reports-data/` 下的发布产物；如果存在 `src/`、`prompts/`、`schemas/` 等非发布器管理改动，会停止并返回 `dirty_worktree`。

push 成功后，`.github/workflows/deploy-pages.yml` 会在 `main` 上自动执行 GitHub Pages 发布。该 workflow 会安装依赖、运行 `npm run build`、上传 `docs/` 目录作为 Pages artifact，并使用 `actions/deploy-pages` 发布；仓库 Pages source 需要配置为 `GitHub Actions`。

本机 Git 元数据不可写时的兜底发布命令：

```powershell
npm run publish:github-api -- confirm-push YYYY-MM-DD
```

该命令需要 `GH_TOKEN`、`GITHUB_TOKEN` 或当前机器可用的 `gh auth token` 具备当前仓库 `contents:write` 权限。它读取本地生成的发布产物，比较远端 `main` 当前 tree，只把远端缺失或内容不同的 `docs/` 与 `reports-data/` 文件写成一个远端提交，并用 `force:false` 更新分支；本机 `.git` 不会被写入，因此即使当前工作树没能切回 `main`，也可以作为发布兜底。

## 发现源与审计补充

后续定时任务生成日报时，除了官方发布、模型、论文和工程博客，还必须固定检查：

- `github-ai-trending`：先运行 `npm run discover:github-trending -- --date YYYY-MM-DD --limit 50`，再检查 GitHub Trending daily/weekly、Python/TypeScript/Rust/Go trending；这些榜单前列项目是每日必查路径。命令会默认读取 `reports-data` 中近 7 天本地历史，为每个候选补充 `github_trending_history` 备注，标出是新进入观察池还是过去一周反复出现；需要调试其他历史目录时使用 `--history-root <path>`，需要调整窗口时使用 `--history-lookback-days <n>`。该命令在 GitHub Trending 全部抓取失败或没有解析出仓库时，会自动用 OSSInsight `List trending repos` API 兜底。浏览器可保存 HTML/JSON 时，运行 `npm run discover:github-trending -- --date YYYY-MM-DD --browser-export <path>` 复用同一解析器。
- `content-sources`：运行 `npm run discover:content-sources -- --date YYYY-MM-DD --limit 20` 检查官方博客、工程博客、访谈源和 Product Hunt developer-tools feed。Product Hunt 项目候选会自动打开产品页，并优先用 GitHub、docs、README 或官网确认用途；确认成功时候选 `url` 指向确认页，`notes` 保留原始 Product Hunt URL 与确认链接，确认失败时不得把 Product Hunt 条目直接写入项目区。
- `follow-builders`：只把 builder/researcher/founder/maintainer 的原始帖子、个人博客、公开视频或播客片段写入 `builder_observations`；没有原始 URL 时不得收录。中心 feed 抓取失败时，运行 `npm run discover:builders -- --date YYYY-MM-DD --limit 20`，用固定原始 RSS/Atom 源生成可审计 Builder 候选。
- `statuspage-incidents`：运行 `npm run discover:statuspage-incidents -- --date YYYY-MM-DD --limit 20`，把 OpenAI/Claude 等 Statuspage Atom/RSS 的近期 incident 转成候选池条目；这些条目仍需通过去重、新鲜度和 `candidate_id` 回指门禁后才能进入正文。

结构化草稿必须包含 `source_audit.github_trending` 与 `source_audit.builder_sources`，记录 `checked:true`、检查过的来源、候选数、入选数和未入选原因。GitHub trending 项目进入 `projects` 时应填写 `event_date`、`source`、`signal`、`evidence`；如果 shell 网络受限但浏览器能保存 GitHub Trending HTML 或采样 JSON，可运行 `npm run discover:github-trending -- --browser-export <path>` 复用同一解析器。Builder 来源受阻时必须在 `source_audit.builder_sources` 填写 `blocked_reason` 与 `last_successful_feed_at`，不要只写进 notes。Builder 条目进入 `builder_observations` 时应填写 `role`、`event_date`、`source`、`evidence`。没有合格候选时保持空数组，但必须在 `source_audit` 说明已经检查过什么。
