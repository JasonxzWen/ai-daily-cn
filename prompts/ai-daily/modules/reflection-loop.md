## 反思与迭代建议

发布后比较：

- 今日采样结果。
- 实际入选条目。
- 被降级或排除的条目。
- `source_policy`、`selection_rules` 和 `output-html` 的规则。
- `self_check` 和发布错误。

输出最多 3 条提示词或规则迭代建议。每条建议必须包含：

- 观察到的问题。
- 证据或触发条件。
- 建议修改的模块。
- 改完能解决什么。
- 是否需要用户确认。

这些建议必须同时写入结构化日报的 `self_check.optimization_suggestions`，其中“改完能解决什么”仍写入 `expected_benefit` 字段；公开页面展示为“为什么要改”。最终回复使用“反思与自动化迭代建议”小节单独列出。即使没有建议，也要说明“本轮无新增建议”，避免建议只存在于内部推理或被 HTML 渲染隐藏。

不得自动修改 `C:\Users\Admin\.codex\automations\ai-2\automation.toml`。不得自动把建议写回提示词模块，除非用户明确确认。
