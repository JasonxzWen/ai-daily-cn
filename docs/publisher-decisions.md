# AI 日报静态发布决策记录

> 状态：归档/参考。当前唯一权威资产为 `prompts/ai-daily/modules/editorial-authority.md`；如与本文冲突，以该文件为准。

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

- 不自动修改 GitHub Pages 远端设置。
- 不自动修改自动化配置，除非用户明确授权。授权后以 `docs/codex-automation-setup.md` 的提示词为源头同步实际自动化。
- 不执行 `git reset --hard`、`git push --force`、自动 stash 或覆盖用户未提交改动。

## 当前发布通道

真实 `publish` 已实现为需要显式 `--confirm-push` 的普通 commit/push 命令。它只允许提交 `docs/` 与 `reports-data/` 下的发布产物；如果存在非发布器管理改动，会停止并返回错误。`publish:dry-run` 仍用于发布前计划检查。

为避免本机定时任务再次被 `.git/index.lock`、ACL 或无法切回 `main` 阻断，仓库同时提供 `publish:github-api` 兜底通道。它同样需要显式 `confirm-push`，并要求 `GH_TOKEN`、`GITHUB_TOKEN` 或当前机器可用的 `gh auth token` 具备 `contents:write` 权限；实现上直接通过 GitHub API 读取远端 `main` 当前 commit/tree，比较 `docs/` 与 `reports-data/`，只写入远端缺失或内容不同的发布产物，并用 `force:false` 更新分支。该通道不会写本机 `.git`，但只适合发布由最新 `origin/main` 发布工作树生成并验证通过的产物；不得绕过 `remote_ahead`，输出必须记录 `publish_mode: github-api-fallback` 和 `base_commit_sha`。

发布质量采用两级门禁：`blocking_issues` 阻断发布，`degraded_sections` 允许发布但必须写入结构化 JSON，并在公开 HTML 的“发布质量说明”中标注。
