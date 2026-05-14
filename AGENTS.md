# AGENTS.md

## 语言

始终使用中文回复用户。技术标识符、命令、路径、schema 字段名和 URL 保持原文。

## 当前仓库边界

本仓库负责中文 AI 日报的结构化数据、静态 HTML 渲染、GitHub Pages 发布产物和本地发布安全门。

- 生产日报页面由 `src/render.js`、`src/site.js` 和 `docs/` 产物链生成。
- 工作汇报、实现交接、评审结论、研究说明和状态看板使用 `.agents/skills/html-work-reports`。
- 不要把工作汇报技能混入每日公开日报模板，除非任务明确要求升级生产页面能力。
- 不要自动 commit、push、改远端 Pages 设置或修改自动化配置，除非用户明确授权。

## HTML 工作汇报技能

当一个非平凡任务已经完成，并且需要交付可浏览的结论、证据、文件行号、验证结果、风险或后续动作时，优先使用本地技能：

```powershell
node .agents/skills/html-work-reports/scripts/create-report.mjs --input <report.json> --out-dir reports --slug <name> --json
node .agents/skills/html-work-reports/scripts/validate-html-report.mjs reports/<name>.html --json
```

默认使用 `pre-rendered` 模式，保持单文件 HTML 的主要阅读内容自包含。只有明确需要运行时编辑、源码切换或动态渲染时，才使用 `runtime` 模式。

代码相关汇报必须包含文件路径、行号、最小必要代码片段和验证命令。涉及架构、流程或数据流时，优先加入 Mermaid 或等价的可审计图示。

## 验证门

完成仓库改动前至少运行：

```powershell
npm run validate
```

如果只改动 `.agents/skills/html-work-reports`，还要确认技能 smoke 测试通过；该测试已包含在 `npm test` 中。
