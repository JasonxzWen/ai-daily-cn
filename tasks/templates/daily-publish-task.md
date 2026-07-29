# Daily Publish Task

## 目标

- 日期：`YYYY-MM-DD`（`Asia/Shanghai`）
- 唯一生产入口：`corepack pnpm run daily:codex-pipeline`
- 模式：生成 / 已明确授权的真实发布
- 权威内容边界：`prompts/ai-daily/modules/editorial-authority.md`

## 不可变边界

- 公共信号流保留所有安全、可公开的规范化观察。
- 信源、内容、可信度、健康与访问状态只打标签，不建立内容准入门。
- legacy 编辑报告是 signal 之后的可选派生，不能改变 `docs/signals/**` 的成员、默认时序或发布结果。
- 只支持 `1280x900` 桌面视口；本任务不设计移动、平板、窄屏或触摸变体。

## 启动检查

- [ ] launcher 工作树状态已记录，用户无关改动未被覆盖。
- [ ] 本次发布工作树来自最新 `origin/main`，HEAD 与 bootstrap mainSha 一致。
- [ ] 只有一个 active publish automation；不存在 `multiple_active_daily_publish_automations`。
- [ ] `config/daily-resilience-policy.json` 与 runner 阶段一致。
- [ ] 已运行 `corepack pnpm run resilience:validate`。

## 执行

dry run：

```powershell
corepack pnpm run daily:codex-pipeline -- --date YYYY-MM-DD --execute
```

真实发布（仅在已授权时）：

```powershell
corepack pnpm run daily:codex-pipeline -- --date YYYY-MM-DD --execute --publish
```

不要另行执行底层 discovery、build、`publish:dry-run:daily`、publish 或 `status:self-check`；runner 负责 `sources:phase5-audit`、验证、发布与恢复。

## 公共信号验收

阶段顺序：

```text
signals_write
  -> signals_build
  -> signals_validate
  -> signals_publish_dry_run
  -> signals_publish_real
```

- [ ] `reports-data/occurrences/YYYY/MM/YYYY-MM-DD.json.gz` 存在且 schema/lineage 有效。
- [ ] `docs/signals/index.json` 与分页 union、计数一致。
- [ ] tag/filter 未改变 signal membership 或默认时序。
- [ ] legacy admit/quality/candidate rules 没有成为 signal ancestor 或发布前提。

- [ ] `reports-data/occurrences/baseline-v1/*.json.gz` 与 `reports-data/occurrence-baseline-manifest.json` 仍可读取，且每日构建没有回退扫描 legacy 候选池、报告或旧 public JSON。

## Summary 验收

唯一事实源：`.tmp/run-summary-YYYY-MM-DD.json`。同日恢复目录为 `.tmp/daily-codex-pipeline/YYYY-MM-DD`，但不得扫描目录猜测产物。

- [ ] `completed_stages` 已读取。
- [ ] `signals.status` 已读取。
- [ ] `legacy_report.status` 已读取。
- [ ] `source_watch.production_status` 已读取。
- [ ] `source_watch.connected` 与 `source_watch.consumed` 类型正确且一致。
- [ ] Source Watch producer、occurrence store、signal index 的 path/SHA/lineage 一致。
- [ ] `next_action` 已执行或明确交接。

Source Watch 正确 lineage：`discover_source_watch` → `signals_write` → `signals_build` → `signals_validate`。零条观察可以是有效 consumed；legacy 报告结果不参与连接判定。

## 终态

- [ ] `generated_only` / `generated_degraded` / `generated_signals_only` 已按实际记录。
- [ ] `published` / `published_signals_only` / `published_pending_pages_verification` 已按实际记录。
- [ ] `published_degraded` 只按 legacy 状态解释，不误当成 signal admission。
- [ ] `infrastructure_blocked_after_fallback_exhausted` 仅在允许的 fallback 全部耗尽后使用。
- [ ] signal-only 成功没有被 legacy 失败覆盖。

## 验证与交接

- [ ] `corepack pnpm run workflow:validate`
- [ ] `corepack pnpm run resilience:validate`
- [ ] 受影响测试通过。
- [ ] bootstrap main SHA、publish root、summary 与 pipeline plan 路径已记录。
- [ ] `completed_stages`、signal/legacy 双状态、Source Watch 证据、publish/fallback、Pages 状态、阻断/降级与 `next_action` 已交接。
