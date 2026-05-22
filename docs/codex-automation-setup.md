# Codex 自动化创建参数

## 推荐参数

| 字段 | 值 |
|---|---|
| Name | `AI 日报生成与 GitHub Pages 发布` |
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

目标：按今天的 Asia/Shanghai 日期生成中文 AI 日报，最终发布主产物是高度可读、自包含、适合人类浏览的静态 HTML，并准备 GitHub Pages 发布计划。Markdown 不是每日主产物。

执行流程：

1. 计算今天的 `YYYY-MM-DD` 日期。
2. 运行 `npm run publish:prepare-worktree -- --message "chore: save local changes before AI daily report YYYY-MM-DD"`；如果当前分支存在本地改动，先在当前分支提交这些改动；如果当前分支不是 `main`，再切回 `main`。不要使用 `stash`、`reset --hard`、`push --force` 或覆盖用户改动。`wrong_branch` 和非发布产物脏改动不再作为日报生成前的拦截理由，必须先用本步骤归档并回到发布分支。
3. `publish:prepare-worktree` 会在切回 `main` 后执行发布预检；如果远端领先或 `.git` 不可写，它会返回 `publish_status.publish_error` 和 `prepared.publish_ready:false`，但不要因此停止日报生成。只有提交本地改动失败、切分支失败或无法保护用户改动时，才停止。
4. 运行 `npm run prompt:build -- YYYY-MM-DD`，把输出作为本次日报生成与发布的完整工作契约。
5. 按 repo 内提示词模块采样最近 AI 产品、模型、论文、开源项目、工程工具动态和高质量工程博客；优先一手来源。模型发布优先写入 `model_releases`，热门技术博客写入 `hot_blogs`，只有重大工程影响才同时进入 `main_items`。主体信息不足时先拓展信源覆盖，再从 24h 扩展到 48h；48h 仍不足时，才允许补入最近 5 天内高信号开源 release 或官方研究/产品更新，并在 `source_window` 和 self_check notes 里记录，不要把日报长期滚成周报。
6. 同一厂商同日或同一 48h 窗口内的多条小更新默认合并成一条厂商动态；官方 docs 没有 dated changelog、release note、RSS、commit 或官方 dated post 交叉确认时，不写入主体信息，只作为社区线索并标记待验证。
7. 生成结构化日报草稿 `.tmp/daily-report.json`。必须包含 `title`、`summary`、`main_items`、来源链接、`model_releases`、`hot_blogs`、`self_check`；没有模型发布、热门技术博客、项目、Builder 观察或社区线索时使用空数组。
8. 运行 `npm run report:write -- .tmp/daily-report.json reports-data YYYY-MM-DD`。
9. 运行 `npm run build`，生成 `docs/reports/YYYY/MM/YYYY-MM-DD.html`、`docs/data/YYYY/MM/YYYY-MM-DD.json`、`docs/feed.json` 和 `docs/index.html`。HTML 页面必须展示 `self_check.optimization_suggestions` 中的提示词/规则迭代建议；没有建议时明确显示本轮无新增建议。
10. 运行 `npm run validate`。
11. 运行 `npm run publish:dry-run`，输出将写入文件、将暂存文件、commit message 和预期 GitHub Pages URL；如果 dry-run 失败，保留已生成日报并报告 `publish_error`，不要丢弃产物。
12. 如需真实发布，优先运行 `npm run publish -- confirm-push YYYY-MM-DD`。该命令只允许提交 `docs/` 与 `reports-data/` 发布产物，并执行普通 push；push 后必须验证当日 Pages URL 返回 HTTP 200 且页面内容包含当日 `YYYY-MM-DD`。
13. 如果真实发布失败原因是 `.git` 不可写、无法创建 `index.lock` 或本机 Git 元数据权限问题，并且环境变量 `GH_TOKEN` 或 `GITHUB_TOKEN` 可用，运行 `npm run publish:github-api -- confirm-push YYYY-MM-DD` 作为兜底发布。该命令不写本机 `.git`，只通过 GitHub API 把发布产物写入远端 `main`，并使用 `force:false`，不得用于提交非发布器管理文件。
14. 如果 validate、真实 publish 或 API 兜底发布失败，只报告 `publish_error`、失败原因和修复建议，不做破坏性恢复；如果 prepare-worktree 或 dry-run 只暴露发布环境不可用，继续保留本地日报 HTML/JSON 产物。
15. 根据今日采样、入选/降级内容、自检结果和 repo 内提示词模块，输出最多 3 条提示词或规则迭代建议。建议只给用户人工确认，不自动写回提示词模块；这些建议必须同时进入 `self_check.optimization_suggestions`，并在最终回复的“反思与自动化迭代建议”小节单独列出。

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

当前仓库已具备本地生成、HTML 渲染、验证、`publish:dry-run`、显式确认后的安全本机 Git `publish`，以及不依赖本机 `.git` 写入权限的 GitHub API 兜底发布能力。

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

本机 Git 元数据不可写时的兜底发布命令：

```powershell
npm run publish:github-api -- confirm-push YYYY-MM-DD
```

该命令需要 `GH_TOKEN` 或 `GITHUB_TOKEN` 具备当前仓库 `contents:write` 权限。它读取本地生成的发布产物，比较远端 `main` 当前 tree，只把远端缺失或内容不同的 `docs/` 与 `reports-data/` 文件写成一个远端提交，并用 `force:false` 更新分支；本机 `.git` 不会被写入。

## 发现源与审计补充

后续定时任务生成日报时，除了官方发布、模型、论文和工程博客，还必须固定检查：

- `github-ai-trending`：先运行 `npm run discover:github-trending -- 50`，再检查 GitHub Trending daily/weekly、Python/TypeScript/Rust/Go trending，并至少交叉 OSSInsight AI / AI Agent Frameworks collection、Trendshift GitHub trending repositories 或等价趋势源。
- `follow-builders`：只把 builder/researcher/founder/maintainer 的原始帖子、个人博客、公开视频或播客片段写入 `builder_observations`；没有原始 URL 时不得收录。

结构化草稿必须包含 `source_audit.github_trending` 与 `source_audit.builder_sources`，记录 `checked:true`、检查过的来源、候选数、入选数和未入选原因。GitHub trending 项目进入 `projects` 时应填写 `event_date`、`source`、`signal`、`evidence`；Builder 条目进入 `builder_observations` 时应填写 `role`、`event_date`、`source`、`evidence`。没有合格候选时保持空数组，但必须在 `source_audit` 说明已经检查过什么。
