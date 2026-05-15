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
2. 运行 `npm run prompt:build -- YYYY-MM-DD`，把输出作为本次日报生成与发布的完整工作契约。
3. 按 repo 内提示词模块采样最近 AI 产品、模型、论文、开源项目和工程工具动态；优先一手来源。主体信息不足时先拓展信源覆盖，再从 24h 扩展到 48h；48h 仍不足时，才允许补入最近 5 天内高信号开源 release 或官方研究/产品更新，并在 `source_window` 和 self_check notes 里记录，不要把日报长期滚成周报。
4. 同一厂商同日或同一 48h 窗口内的多条小更新默认合并成一条厂商动态；官方 docs 没有 dated changelog、release note、RSS、commit 或官方 dated post 交叉确认时，不写入主体信息，只作为社区线索并标记待验证。
5. 生成结构化日报草稿 `.tmp/daily-report.json`。必须包含 `title`、`summary`、`main_items`、来源链接、`self_check`；没有项目、Builder 观察或社区线索时使用空数组。
6. 运行 `npm run report:write -- .tmp/daily-report.json reports-data YYYY-MM-DD`。
7. 运行 `npm run build`，生成 `docs/reports/YYYY/MM/YYYY-MM-DD.html`、`docs/data/YYYY/MM/YYYY-MM-DD.json`、`docs/feed.json` 和 `docs/index.html`。HTML 页面必须展示 `self_check.optimization_suggestions` 中的提示词/规则迭代建议；没有建议时明确显示本轮无新增建议。
8. 运行 `npm run validate`。
9. 运行 `npm run publish:dry-run`，输出将写入文件、将暂存文件、commit message 和预期 GitHub Pages URL。
10. 如需真实发布，运行 `npm run publish -- confirm-push YYYY-MM-DD`。该命令只允许提交 `docs/` 与 `reports-data/` 发布产物，并执行普通 push；push 后必须验证当日 Pages URL 返回 HTTP 200 且页面内容包含当日 `YYYY-MM-DD`。
11. 如果 dry-run、validate 或 publish 失败，只报告 `publish_error`、失败原因和修复建议，不做破坏性恢复。
12. 根据今日采样、入选/降级内容、自检结果和 repo 内提示词模块，输出最多 3 条提示词或规则迭代建议。建议只给用户人工确认，不自动写回提示词模块；这些建议必须同时进入 `self_check.optimization_suggestions`，并在最终回复的“反思与自动化迭代建议”小节单独列出。

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

当前仓库已具备本地生成、HTML 渲染、验证、`publish:dry-run` 和显式确认后的安全 `publish` 能力。

真实发布命令：

```powershell
npm run publish -- confirm-push YYYY-MM-DD
```

该命令只允许提交 `docs/` 与 `reports-data/` 下的发布产物；如果存在 `src/`、`prompts/`、`schemas/` 等非发布器管理改动，会停止并返回 `dirty_worktree`。
