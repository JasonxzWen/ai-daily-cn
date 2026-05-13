# AI 日报静态发布决策记录

## 已确认

- 目标仓库：当前仓库 `JasonxzWen/ai-daily-cn`。
- 发布分支：`main`。
- Pages 目录：`docs/`。
- 站点 URL：使用 GitHub Pages 默认 project site，当前配置为 `https://jasonxzwen.github.io/ai-daily-cn/`。
- 定时任务启动目录：由用户在项目内启动；自动化提示词不需要再切换到指定路径。
- 提示词：由 repo 内 `prompts/ai-daily/` 分模块存储，并通过 `npm run prompt:build` 组装。
- 每日主产物：高度可读、对人类界面友好的自包含静态 HTML。
- 结构化输入：优先生成 `reports-data/YYYY/MM/YYYY-MM-DD.json`，由 repo 工具渲染 HTML、feed 和 data JSON。
- Markdown 原文：允许公开，但不再作为每日任务的主产物；仅作为兼容输入保留。
- 历史日报：允许长期保留。
- 主体条目格式：接受显式 `[tier: T0|T1|T2|T3]` 字段。

## 当前仍保持禁用

- 不自动提交。
- 不自动推送。
- 不自动修改 GitHub Pages 远端设置。
- 不自动修改 `C:\Users\Admin\.codex\automations\ai-2\automation.toml`。

真实 `publish` 已实现为需要显式 `--confirm-push` 的普通 commit/push 命令。它只允许提交 `docs/` 与 `reports-data/` 下的发布产物；如果存在非发布器管理改动，会停止并返回错误。`publish:dry-run` 仍用于发布前计划检查。
