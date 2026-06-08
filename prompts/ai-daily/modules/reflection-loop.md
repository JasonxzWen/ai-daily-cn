## 反思与迭代建议

发布后比较：

- 今日采样结果。
- 实际入选条目。
- 被降级或排除的条目。
- `source_policy`、`selection_rules` 和 `output-html` 的规则。
- `self_check` 和发布错误。

输出最多 3 条提示词或规则迭代建议。每条建议必须包含：

- `issue`：观察到的问题。
- `evidence`：证据或触发条件。
- `module`：建议修改的提示词模块、质量门或脚本。
- `suggestion`：具体建议修改。
- `expected_benefit`：改完能解决什么。
- `requires_user_confirmation`：是否需要用户确认，必须是 boolean。

这些建议必须同时写入结构化日报的 `self_check.optimization_suggestions`，且只使用上述 6 个 canonical 字段；公开页面把 `expected_benefit` 展示为“为什么要改”。最终回复使用“反思与自动化迭代建议”小节单独列出。即使没有建议，也要说明“本轮无新增建议”，避免建议只存在于内部推理或被 HTML 渲染隐藏。

`self_check.notes` 和 `optimization_suggestions` 都属于公开文本，必须写成简洁中文，不要混入 shell 日志、超时信息、命令名、内部状态机或候选池处理过程。允许说“搜索源超时导致备选不足”，不允许直接写 `timed out twice in the current shell` 这类执行日志。

不得自动修改实际自动化配置。用户明确确认后，才允许按 `docs/codex-automation-setup.md` 同步目标自动化任务；用户确认需要长期生效的反馈默认为 P1，必须写入 `config/feedback-ledger.json`，并绑定真实 scope 文件、`npm run validate` 覆盖的命令和真实测试断言或运行时质量门后，才算项目层面落地；不得自动把建议写回提示词模块，除非用户明确确认。
