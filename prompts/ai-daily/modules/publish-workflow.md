## Codex-native runner contract

Daily resilience policy: `config/daily-resilience-policy.json` is the authoritative retry/fallback/degrade/block table for the Codex-native runner. Workflow, prompt, and automation changes must pass `corepack pnpm run resilience:validate`; safe public source/coverage failures may end as `published_degraded`; successful repository publish with delayed Pages propagation may end as `published_pending_pages_verification`; unsafe content, unrecoverable rendering/schema failures, internal leakage, fake tracking components, and exhausted publish infrastructure end as `infrastructure_blocked_after_fallback_exhausted` or another whitelisted blocker.

Status self-check is no longer separately scheduled. The production `.tmp/run-summary-YYYY-MM-DD.json` is the single publish and health truth source. Keep `status:self-check` as a manual diagnostic for `sources:phase5-audit`, `publish:dry-run:daily`, Pages, source health, and automation inventory; `multiple_active_daily_publish_automations` remains blocking.

定时任务和长程发布任务必须从 launcher worktree 启动，统一调用可调试的 Codex 分阶段 pipeline：

```powershell
corepack pnpm run daily:codex-pipeline -- --date YYYY-MM-DD --dry-run
corepack pnpm run daily:codex-pipeline -- --date YYYY-MM-DD --execute
corepack pnpm run daily:codex-pipeline -- --date YYYY-MM-DD --execute --publish
```

Production Source Watch runs through `discover_source_watch`, `report_draft`, `report_write`, and `build`. Read `source_watch.production_status`, `source_watch.connected`, and `source_watch.consumed` from `.tmp/run-summary-YYYY-MM-DD.json`; connected/consumed requires the producer stage's exact artifact path/SHA-256 receipt, equal producer/pool snapshot sets, `reports-data/internal/candidates/YYYY/MM/YYYY-MM-DD.candidates.json`, and matching `source_watch.consumption.candidate_pool_hashes`. A valid zero-inclusion run is still consumed. Missing/mismatched evidence remains false. Scheduled runs pass no artifact argument and never scan `.tmp` for a newest handoff.

- 该脚本把 collect、admit、每条 summarize 和 assemble 拆成独立 `codex exec --ephemeral` 上下文；定时任务迁移到该入口后，只传日期和执行意图，不在 automation prompt 中内联信息收集、准入、逐条概括或发布流水线。
- 默认不带 `--publish` 只生成和验证，终态为 `final_status:"generated_only"`。
- 真实发布必须显式传入 `--publish`；脚本在全部质量门通过后先执行 `publish:dry-run:daily`，再执行真实 publish；普通 git publish 失败时允许 GitHub API 兜底。
- pipeline 负责阶段顺序、独立 Codex 上下文、contract、状态、校验、`publish:dry-run:daily`、真实 publish 或 GitHub API 兜底。
- pipeline 固定写 `.tmp/run-summary-YYYY-MM-DD.json`；定时任务只读取 `final_status`、`completed_stages`、`next_action`、报告 JSON/HTML 路径和 publish 日志路径。
- 如果需要丢弃同日未完成的 pipeline 状态，删除或换用 `.tmp/daily-codex-pipeline/YYYY-MM-DD` 工作目录后重新运行同一命令；不要回退到旧 `daily:run` 手工修复链路。
- 不要在定时任务 prompt 中展开旧手工流水线；`publish:dry-run -- --date YYYY-MM-DD` 只保留给人工诊断，不是 scheduled dry-run 入口。

阻塞处理：

- `final_status:"blocked"`：报告 `.tmp/run-summary-YYYY-MM-DD.json`、失败 stage、错误码、已生成 HTML/JSON 路径和可恢复动作；不要伪称发布成功。
- `final_status:"generated_only"`：说明仅完成生成与本地质量验证，不汇报 publish dry-run；汇报已通过的 `quality-review`、`sources-phase5-audit`、`content:contract`、`quality:page-check`、报告 JSON/HTML 路径和后续是否需要人工发布。
- `final_status:"published"`：汇报真实 publish、Pages HTTP 验证、`blocking_issues` / `degraded_sections` 摘要和最终 URL。
- `final_status:"published_pending_pages_verification"`：仓库发布已成功但 Pages 验证仍在缓存/网络延迟中；汇报 URL、`pages_verify` 尝试次数和 `next_action.kind:"verify_pages_later"`，不要重复 publish 或声称 Pages 已确认。
