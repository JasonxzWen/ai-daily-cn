# Daily Codex Pipeline

`daily:codex-pipeline` 是每日公开信号与可选 legacy 编辑报告的唯一生产入口。调度器只调用这个脚本，仓库负责阶段顺序、恢复、发布范围和终态。

## 运行模式

本地 fixture 模式保留轻量 DAG，用于验证 Codex 生成与一次修复：

```text
prepare -> collect/context -> codex-generate -> validate -> repair-once -> summarize -> publish
```

生产模式使用同一入口：

```powershell
corepack pnpm run daily:codex-pipeline -- --date YYYY-MM-DD --execute
corepack pnpm run daily:codex-pipeline -- --date YYYY-MM-DD --execute --publish --codex-bin codex.cmd
```

`--execute` 表示真实生产编排；`--publish` 必须由明确的发布授权触发。生产计划写入 `.tmp/daily-codex-pipeline/YYYY-MM-DD/pipeline-plan.json`，唯一事实源写入 `.tmp/run-summary-YYYY-MM-DD.json`。

runner 不继承 `npm_config_model` 或用户 Codex 模型配置。只有确需兼容模型时才传 `--model`。每次 Codex 调用默认最多 20 分钟，可用 `--codex-timeout-ms` 在 1..3600000 毫秒内调整；超时会终止整个子进程树并记录 `codex_timeout`。

自定义 fixture 工作目录必须位于 `.tmp/daily-codex-mvp/` 的子目录，runner 拒绝清理或写入任意仓库路径。

## 生产双通道

共享发现和规范化后，DAG 分成两条支路：

```text
normalize
  ├─ signals_write
  │    -> signals_build
  │    -> signals_validate
  │    -> signals_publish_dry_run
  │    -> signals_publish_real
  └─ legacy admit / summarize / quality / report / page
```

公共信号通道先完成，且没有内容准入门：每条安全、可公开的规范化观察都写入 occurrence store。信源、内容、可信度、健康与访问状态只作为标签和筛选维度，不改变成员集合或默认时序。

legacy 支路是可选派生。选题、去重、新鲜度、事实复核、正文质量、候选回指和数量目标仅约束 legacy 报告；任何 legacy 节点都不得成为 `signals_publish_real` 的祖先，也不得回滚有效 signal。

PR2 的一次性迁移把既有 10,966 条公开信号无损写入 `reports-data/occurrences/baseline-v1/YYYY-MM.json.gz`，并在 `reports-data/occurrence-baseline-manifest.json` 记录来源 hash、分片和数量。每日生产只读取 immutable baseline 与每日 occurrence store；它不再读取候选池、编辑报告或旧 public signal 文件，因此保留历史不等于恢复 legacy 回流。

## Source Watch

Source Watch 使用公共信号 lineage：

```text
discover_source_watch
  -> signals_write
  -> signals_build
  -> signals_validate
```

`discover_source_watch` 写 `.tmp/source-watch-YYYY-MM-DD.json` 并返回精确 path/SHA receipt。`signals_write` 将观察按持久 `observation_id` 写到 `reports-data/occurrences/YYYY/MM/YYYY-MM-DD.json.gz`；`signals_build` 生成 `docs/signals/index.json` 与分页；`signals_validate` 验证 schema、跨文件 lineage、隐私和公开路径。

summary 只有在同一次运行证明 producer receipt、occurrence store、observation lineage、build、validate 与 signal index 全部一致时，才报告：

- `source_watch.production_status:"connected"`
- `source_watch.connected:true`
- `source_watch.consumed:true`

零条观察也可以是有效 consumed。缺失或不匹配时保持 false 并给出 `reason`，不得从文件存在性推断消费，也不得使用 legacy 报告产物作为连接证据。

## Official Blog Context

`.tmp/official-blog-context-YYYY-MM-DD.json` 只服务于可选 legacy 编辑报告。`official-blog-admission-v1` 继续验证日期、source/context/bindings SHA、记录关系、最高分绑定和 internal visibility；无匹配可以是合法空状态，失效时只降级 legacy，不影响公共信号 membership 或发布。

## Summary 合同

生产 summary 至少包含：

- `automation_pipeline_mode:"single_script_dag_orchestrator"`
- `orchestration.node_count` 与 plan path
- `completed_stages`
- `signals.status`
- `legacy_report.status`
- Source Watch producer/occurrence/index 证据
- validation、publish、fallback 与 Pages 状态
- `blocking_issues`、`degraded_sections` 与 `next_action`

外层终态包括：

- `generated_only`
- `generated_degraded`
- `generated_signals_only`
- `published`
- `published_signals_only`
- `published_pending_pages_verification`

`published_degraded` 是可能的 legacy 状态，外层按真实公共发布结果归一化。signal-only 状态表示公共信号已成功，不得被 legacy 失败覆盖。后续基础设施恢复耗尽时使用 `infrastructure_blocked_after_fallback_exhausted`。

## Codex 修复

生产 quality 返回 `needs_ai_repair` 时仍由同一入口恢复。Codex 使用 `--ignore-user-config`、只读 sandbox 和 JSON Schema 输出；host 校验日期、任务路径、证据根、输出路径、状态与 edits 后才写文件。模型不直接写报告或仓库文件。dry run 最多一次自动修复，publish 最多五次。

这套修复只治理 legacy 编辑报告，不能修改 occurrence store 或 `docs/signals/**` 的成员与时序。

## Fixture Artifact

fixture 运行示例：

```powershell
corepack pnpm run daily:codex-pipeline -- --date YYYY-MM-DD --fixture success
```

模式：

- `success`：首次生成即通过。
- `repair-success`：首次失败，单次修复成功。
- `failure`：生成和单次修复均失败。

fixture artifact 位于 `.tmp/daily-codex-mvp/YYYY-MM-DD/`，包括 context、generated、validation、repair、final、stage summary 与 run summary。MVP final artifact 必须含 `report_date`、`headline`、`summary` 和至少一条带 `title`、`url`、`note` 的 item。

## 替换与自动化边界

生产入口必须保持为 `corepack pnpm run daily:codex-pipeline`。旧 daily workflow 只允许藏在这个入口之后，调度器不得展开旧手工阶段。

生产始终在最新 `origin/main` 的干净工作树运行。因此未合并分支可以通过测试和 artifact replay 证明实现，但只有合并后的自动化运行才是生产验收。

外部自动化显式用 UTF-8 读取 summary，检查 `source_watch.connected`、`source_watch.consumed`、occurrence/index hashes、`signals.status` 与 `legacy_report.status`。它不能硬编码 disconnected，也不能把 legacy gate 重新引入 signal 发布路径。
