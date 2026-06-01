# AGENTS.md

## Codex Harness

- Treat this repository as the active Codex worktree for AI daily publishing work.
- Keep task state in `tasks/current-task.md`, `progress.md`, and `session-handoff.md` when work is non-trivial.
- Run `node scripts/harness-validate.mjs` before handoff when harness files change.
- For daily publish runs, follow `tasks/daily-publish-runbook.md`; capture `publish:dry-run` before any real publish.

## 语言

始终使用中文回复用户。技术标识符、命令、路径、schema 字段名和 URL 保持原文。

## 当前仓库边界

本仓库负责中文 AI 日报的结构化数据、静态 HTML 渲染、GitHub Pages 发布产物和本地发布安全门。

- 生产日报页面由 `src/site.js` 调用 `.codex/skills/effective-interact/scripts/create-interaction.mjs` 生成；`src/render.js` 只保留首页和旧渲染辅助能力。
- 工作汇报、实现交接、评审结论、研究说明、状态看板和中间对齐材料使用 `.codex/skills/effective-interact`。
- 每日公开日报也使用 `.codex/skills/effective-interact` 的 `pre-rendered` 模式生成 HTML；不要把日报切回手写模板，除非用户明确要求回滚。
- 不要自动 commit、push、改远端 Pages 设置或修改自动化配置，除非用户明确授权。

## Effective Interact 交互报告技能

当一个非平凡任务需要交付可浏览的结论、证据、文件行号、验证结果、风险、后续动作、选项比较、架构说明或状态看板时，优先使用本地技能：

```powershell
node .codex/skills/effective-interact/scripts/create-interaction.mjs --input <interaction.json> --slug <name> --json
node .codex/skills/effective-interact/scripts/validate-interaction.mjs <outputPath> --json
```

默认把临时交互报告写入被忽略的 `.codex/skills/effective-interact/artifacts/`。只有需要长期保留的仓库示例，才显式使用 `--out-dir reports`。

默认使用 skill 推荐的模式。需要 Mermaid、Markdown、代码高亮等富内容真实运行时渲染时，使用 `runtime-cdn` 并运行 `validate-interaction.mjs --require-browser`；生产日报必须使用 `pre-rendered`，避免公开页面依赖远程脚本或 CDN。

代码相关交互报告必须包含文件路径、行号、最小必要代码片段和验证命令。涉及架构、流程或数据流时，优先加入 Mermaid 或等价的可审计图示。

## 前端与页面元素验证

凡是改动前端构建、HTML 渲染、CSS、页面布局、交互状态、图表、图片展示或页面元素，都必须做端到端视觉验收：

- 先运行对应构建命令，确保本地 HTML 或站点产物已更新。
- 用浏览器或 Playwright 打开受影响页面，覆盖目标桌面/移动断点或用户反馈中的具体视口。
- 截图检查是否达成目标，并主动检查是否引入不合理的空白、遮挡、错位、溢出、过度拥挤、颜色不可读或交互失效。
- 最终汇报必须说明截图验收结果；如果浏览器或截图环境被安全策略、依赖或权限阻塞，必须报告阻塞原因，不能把静态检查说成端到端验收。

## 验证门

完成仓库改动前至少运行：

```powershell
npm run validate
```

如果只改动 `.codex/skills/effective-interact`，还要确认技能 smoke 测试通过；该测试已包含在 `npm test` 中。
