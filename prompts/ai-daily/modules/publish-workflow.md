# 发布工作流

`public-signal-stream-contract:v1`

Codex-native runner 的唯一生产入口是：

```powershell
corepack pnpm run daily:codex-pipeline -- --date YYYY-MM-DD --execute
corepack pnpm run daily:codex-pipeline -- --date YYYY-MM-DD --execute --publish
```

默认命令只生成；只有显式 `--publish` 才允许真实发布。调度器不得展开底层命令，也不得绕过 runner 单独拼接发布步骤。

## 两条互不倒置的通道

共享发现与规范化完成后，公共信号通道必须先运行：

1. `signals_write`：把所有安全、可公开的规范化观察写入 `reports-data/occurrences/YYYY/MM/YYYY-MM-DD.json`。
2. `signals_build`：生成 `docs/signals/index.json` 和分组分页文件。
3. `signals_validate`：验证 schema、跨文件 lineage、隐私与公开路径。
4. `signals_publish_dry_run`：执行信号发布预检。
5. `signals_publish_real`：真实发布信号；传输失败时由 resilience policy 决定 GitHub API fallback。

公共信号通道没有内容准入门。信源类别、内容类别、可信度、健康与访问状态都只是标签或筛选维度，不得改变信号成员集合、默认时序或发布结果。低可信、重复事件、旧内容、社区讨论、缺少原始 X 链接等情况可以带标签，但不能因此从公共信号通道删除。

可选遗留编辑报告在信号生成或发布之后运行。候选选择、事实复核、质量审查、正文数量目标和 `published_degraded` 等规则只约束该派生产物；它们不得阻断或回滚已经有效的公共信号。

`signals_build` 同时读取已提交的 immutable 历史 occurrence 基线 `reports-data/occurrences/baseline-v1/*.json.gz`，并以 `reports-data/occurrence-baseline-manifest.json` 校验分片清单、哈希、大小、日期范围与记录数。这只是一次性迁移后的数据分片；每日运行不得调用 `signals:migrate-baseline`，也不得从候选池、编辑报告或旧 public JSON 反向补数。

## Source Watch 证据

生产 Source Watch 的真实 lineage 是 `discover_source_watch` → `signals_write` → `signals_build` → `signals_validate`。只从 `.tmp/run-summary-YYYY-MM-DD.json` 读取：

- `source_watch.production_status`
- `source_watch.connected`
- `source_watch.consumed`
- occurrence store 的路径与 SHA-256
- signal index 的路径与 SHA-256

即使当天是零条观察，只要同日 occurrence store、signal index 和 lineage 均有效，也算已消费。不得扫描 `.tmp/daily-codex-pipeline/YYYY-MM-DD` 猜测最新 sidecar，也不得把遗留报告产物当作 Source Watch 的消费证明。

## 终态与恢复

runner 将每个阶段写入 `completed_stages`，并在 summary 中分别写 `signals.status` 与 `legacy_report.status`：

- `generated_only` / `published`：两条通道均完成。
- `generated_degraded`：遗留报告生成完成但带降级项。
- `generated_signals_only`：公共信号已生成，遗留报告未完成。
- `published_signals_only`：公共信号已发布，遗留报告未完成；不得把它误报为“什么都没发布”。
- `published_pending_pages_verification`：仓库发布完成，Pages 仍待验证。
- `infrastructure_blocked_after_fallback_exhausted`：允许的基础设施兜底均已耗尽。
- `needs_ai_repair`：遗留编辑报告可恢复；公共信号结果仍按 `signals.status` 单独判断。

始终遵循 summary 的 `next_action`。若要求 `restart_latest_main`，回到 launcher 重新运行同一入口，不复用旧生成物。

`publish:dry-run:daily`、`sources:phase5-audit`、真实 publish、Pages 验证都由 runner 编排。`status:self-check` 仅保留为人工诊断，不另设定时任务。恢复与重试以 `config/daily-resilience-policy.json` 为准，修改后运行：

```powershell
corepack pnpm run resilience:validate
```

最终交接至少报告 `.tmp/run-summary-YYYY-MM-DD.json`、pipeline plan、`completed_stages`、`signals.status`、`legacy_report.status`、Source Watch 证据、真实发布或 fallback 结果、Pages 状态、阻断/降级项与 `next_action`。
