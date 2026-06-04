## Codex-native runner contract

定时任务和长程发布任务必须从 launcher worktree 启动，只调用 runner：

```powershell
npm run daily:run -- --date YYYY-MM-DD
npm run daily:run -- --date YYYY-MM-DD --publish
```

- 默认不带 `--publish` 是 dry-run-only 模式，只允许 runner 内部执行 `publish:dry-run:daily`，终态为 `final_status:"generated_only"`。
- 真实发布必须显式传入 `--publish`；publish 模式最多 5 次 `review -> AI repair contract -> repair -> review`，并允许 runner 在全部质量门通过后执行真实发布。
- runner 负责 clean checkout、阶段顺序、contract、状态、校验、`sources:phase5-audit`、`publish:dry-run:daily`、真实 publish 或 GitHub API 兜底。
- runner 固定写 `.tmp/run-summary-YYYY-MM-DD.json`；定时任务只读取 `final_status`、`stages` 和 `next_action`。
- 当 `next_action.kind` 是 `codex_ai_repair_contract` 时，Codex 作为 AI 执行者写入 `.tmp/quality-ai-repair-YYYY-MM-DD.json`，然后用同一命令继续 runner；runner 会从 summary 恢复，应用 contract，复查质量，并把 `.tmp/daily-report.optimized.json` 作为后续 `report:write` 输入。
- 如果需要丢弃同日未完成的 runner 状态，显式使用 `npm run daily:run -- --date YYYY-MM-DD --restart` 或 `npm run daily:run -- --date YYYY-MM-DD --publish --restart`。
- 不要在定时任务 prompt 中展开旧手工流水线；`publish:dry-run -- --date YYYY-MM-DD` 只保留给人工诊断，不是 scheduled dry-run 入口。

阻塞处理：

- `final_status:"needs_ai_repair"`：写 runner 输出的 repair contract，继续 runner；不要手工跳到 `report:write`。
- `final_status:"blocked"`：报告 `.tmp/run-summary-YYYY-MM-DD.json`、失败 stage、错误码、已生成 HTML/JSON 路径和可恢复动作；不要伪称发布成功。
- `final_status:"generated_only"`：说明 dry-run-only 已完成，并汇报 `publish:dry-run:daily` 结果和 expected Pages URL。
- `final_status:"published"`：汇报真实 publish、Pages HTTP 验证、`blocking_issues` / `degraded_sections` 摘要和最终 URL。
