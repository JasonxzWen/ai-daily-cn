# Codex 自动化配置

生产自动化只负责取得最新 `origin/main`、进入本次新建的干净发布工作树、调用唯一入口并读取 summary；业务阶段、恢复和发布范围都由仓库代码负责。

## 唯一入口

```powershell
corepack pnpm run daily:codex-pipeline -- --date YYYY-MM-DD --execute --publish
```

- 不发布时去掉 `--publish`。
- `publish:dry-run:daily` 是 pipeline 内部阶段，自动化不单独调用。
- 不直接调用发现、写入、build、publish 或旧 runner。
- 不另行调度 `status:self-check`。
- 项目只允许一个 active publish automation；`multiple_active_daily_publish_automations` 是阻断项。

## Bootstrap

自动化先运行 `$env:CODEX_HOME\automations\ai-daily\bootstrap-latest-main.ps1`，并验证：

1. bootstrap 成功返回 `mainSha`、`publishRoot` 和 `reportDate`；
2. `publishRoot` 是本次新建的工作树；
3. 工作树 HEAD 与 bootstrap mainSha 完全一致；
4. 只在该工作树运行生产入口；
5. 不复用其他 checkout、其他 worktree 或 `.tmp/daily-codex-pipeline/YYYY-MM-DD` 的旧运行目录。

自动化不得 reset 或 stash launcher 工作树中的用户改动。

## 公共信号优先

共享发现后，runner 先执行：

```text
signals_write
  -> signals_build
  -> signals_validate
  -> signals_publish_dry_run
  -> signals_publish_real
```

- `signals_write` 持久化所有安全、可公开的规范化观察到 `reports-data/occurrences/YYYY/MM/YYYY-MM-DD.json`。
- `signals_build` 生成 `docs/signals/index.json` 与分组分页。
- `signals_validate` 验证 schema、lineage、隐私和公开路径。
- 信源类别、内容类别、可信度、健康和访问状态仅是标签/筛选维度，不是准入条件。
- 低可信、旧内容、重复事件、社区讨论或缺少原始 X URL 不得阻断公共信号。

可选 legacy 编辑报告在 signal 之后运行。其 admit、候选选择、事实复核、quality gate 和 `sources:phase5-audit` 只影响 legacy 派生产物，不能改变 signal membership 或发布结果。

`signals_build` 还会读取已提交的 immutable occurrence 基线 `reports-data/occurrences/baseline-v1/*.json.gz`，其清单位于 `reports-data/occurrence-baseline-manifest.json`。这是一次性历史迁移结果；自动化不得运行 `signals:migrate-baseline`，生产也不得扫描 legacy 候选池、编辑报告或旧 public JSON 补数。

## Summary 合同

路径模板固定为 `.tmp/run-summary-YYYY-MM-DD.json`。运行时按 report date 展开，并显式用 UTF-8 读取：

```powershell
$summaryPath = ".tmp/run-summary-$($bootstrapInfo.reportDate).json"
$summary = Get-Content -LiteralPath $summaryPath -Raw -Encoding UTF8 | ConvertFrom-Json
```

必须检查：

- `automation_pipeline_mode`；
- orchestration node count 与 pipeline plan path；
- `completed_stages`；
- `signals.status`；
- `legacy_report.status`；
- `source_watch.production_status`；
- `source_watch.connected`；
- `source_watch.consumed`；
- Source Watch producer、occurrence store 和 signal index 的路径、SHA-256 与 lineage；
- `next_action`。

Source Watch 的生产 lineage 是 `discover_source_watch` → `signals_write` → `signals_build` → `signals_validate`。connected/consumed 为 true 时，summary 必须提供匹配的 occurrence store 与 signal index 证据；为 false 时必须提供 reason。零条观察只要同日 store/index 与 lineage 有效，也可以为 true。

## 合法终态

dry run：

- `generated_only`
- `generated_degraded`
- `generated_signals_only`

publish：

- `published`
- `published_signals_only`
- `published_pending_pages_verification`

`published_degraded` 可以出现在 `legacy_report.status`，外层 summary 仍按公共发布结果归一化。`generated_signals_only` / `published_signals_only` 表示公共信号成功、legacy 未完成，自动化必须如实报告，不能声称整次运行没有产物。`infrastructure_blocked_after_fallback_exhausted` 表示允许的 transport/API fallback 已耗尽。

## 恢复规则

- 始终执行 summary 的 `next_action`。
- `restart_latest_main`：回到 launcher 再走一次 bootstrap，不复用旧产物。
- signal Git transport 失败：由 runner 执行 signal-scope GitHub API fallback。
- signal 已发布后 legacy 失败：保留 signal 成功，不回滚、不重复发布。
- Pages pending：报告 `published_pending_pages_verification`，等待复查。

恢复机器合同位于 `config/daily-resilience-policy.json`。更新自动化、runner 阶段或终态时运行：

```powershell
corepack pnpm run workflow:validate
corepack pnpm run resilience:validate
```

## 自动化提示词最小责任

提示词只应：

1. 指定始终中文；
2. 执行 bootstrap 并验证 main SHA；
3. 调用 `corepack pnpm run daily:codex-pipeline` 一次；
4. 读取 summary；
5. 验证 signal/legacy 双结果与 Source Watch 证据；
6. 按 final status、`next_action` 和 `completed_stages` 报告。

不得把业务 stage 重新写成第二套流程，也不得让遗留内容门槛成为 signal 发布条件。
