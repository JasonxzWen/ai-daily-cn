# Daily Publish Runbook

用于每日公开信号监听、可选编辑报告生成与 GitHub Pages 发布。

内容权威边界见 `prompts/ai-daily/modules/editorial-authority.md`。项目的迭代默认偏向扩大监听面：安全、可公开的记录先进入公共信号流，再用信源、内容、可信度、健康和访问标签帮助读者判断；不建立观察期、晋级、配额或内容准入门。

## 生产合同

定时任务只调用一个入口：

```powershell
corepack pnpm run daily:codex-pipeline -- --date YYYY-MM-DD --execute
corepack pnpm run daily:codex-pipeline -- --date YYYY-MM-DD --execute --publish
```

- 默认是 dry run；真实发布必须显式传入 `--publish`。
- `publish:dry-run:daily` 是 runner 内部的遗留整体验证阶段，调度器不得另行调用。
- `.tmp/run-summary-YYYY-MM-DD.json` 是唯一运行事实源，`completed_stages` 是阶段证据。
- `.tmp/daily-codex-pipeline/YYYY-MM-DD` 只保存同日恢复状态，不能由调度器扫描并猜测 sidecar。
- `status:self-check` 仅用于人工诊断。存在 `multiple_active_daily_publish_automations` 时必须停止。

## 两通道顺序

共享发现和规范化完成后，公共信号通道先执行：

1. `signals_write`：把所有安全、可公开的观察持久化到 `reports-data/occurrences/YYYY/MM/YYYY-MM-DD.json`。
2. `signals_build`：生成 `docs/signals/index.json` 与分组分页。
3. `signals_validate`：验证 schema、lineage、隐私与公开路径。
4. `signals_publish_dry_run`：检查仅包含 occurrence 与 `docs/signals/**` 的发布范围。
5. `signals_publish_real`：发布公共信号；Git transport 失败时按 resilience policy 尝试 GitHub API fallback。

公共信号没有内容准入门。以下信息只可作为 tag/filter，不得用于删除、延后或阻断信号：

- 信源板块与来源属性；
- 内容类别；
- 可信度；
- 信源健康状态；
- 访问状态；
- 是否为社区讨论、单一来源、旧内容、重复事件或缺少原始 X 链接。

唯一可阻断公共信号的条件是不可恢复的 schema/lineage 错误、内部或隐私字段泄漏、无法生成有效公开 artifact，或信号发布基础设施及允许的 fallback 均已耗尽。

公共信号完成后才运行可选 legacy 编辑报告。事实复核、选题、候选选择、数量目标、正文质量与来源回溯只约束该派生报告，绝不能改变 `docs/signals/**` 的成员集合、默认时序或已完成发布。

历史信号通过一次性迁移固化在 `reports-data/occurrences/baseline-v1/YYYY-MM.json.gz`，清单为 `reports-data/occurrence-baseline-manifest.json`。生产构建读取这份 immutable occurrence 基线和每日 occurrence store，但绝不重新扫描候选池、旧日报或旧 public JSON；`signals:migrate-baseline` 只用于可审计迁移，不是每日阶段。

## Source Watch 验收

Source Watch lineage 固定为：

```text
discover_source_watch -> signals_write -> signals_build -> signals_validate
```

只从 summary 检查：

- `source_watch.production_status`
- `source_watch.connected`
- `source_watch.consumed`
- producer artifact 的路径与 SHA-256
- occurrence store 的路径与 SHA-256
- signal index 的路径与 SHA-256
- producer observation 与 occurrence `observation_id` 的覆盖关系

零条观察只要同日 store、index 和 lineage 有效，也算 consumed。遗留报告的成功或失败不是 Source Watch 的连接条件。

## 运行前检查

1. 目标日期使用 `Asia/Shanghai` 的 `YYYY-MM-DD`。
2. 查看 `git status --short --branch`，保留 launcher 中用户的无关改动。
3. 生产运行只接受本次 fetch 后最新 `origin/main` 的干净发布工作树。
4. 先验证静态合同：

```powershell
corepack pnpm run sources:validate
corepack pnpm run sources:display-contract
corepack pnpm run dag:validate
corepack pnpm run workflow:validate
corepack pnpm run resilience:validate
```

信源扩展以公开、合法、可自动化为默认；抓取失败、受限或返回空结果都写健康/访问标签，不把源从配置中静默删除。人工诊断可以只跑局部源，但其结果不得覆盖当日 occurrence store 或影响公共 signal membership。

## 运行与读取结果

dry run：

```powershell
corepack pnpm run daily:codex-pipeline -- --date YYYY-MM-DD --execute
```

已获得真实发布授权时：

```powershell
corepack pnpm run daily:codex-pipeline -- --date YYYY-MM-DD --execute --publish
```

运行后用 UTF-8 读取 summary：

```powershell
$summaryPath = ".tmp/run-summary-YYYY-MM-DD.json"
$summary = Get-Content -LiteralPath $summaryPath -Raw -Encoding UTF8 | ConvertFrom-Json
```

至少检查：

- `automation_pipeline_mode`、orchestration node count 与 plan path；
- `completed_stages`；
- `signals.status` 和 `legacy_report.status`；
- Source Watch 的 production/connected/consumed 与 artifact hashes；
- `next_action`；
- publish dry run、真实 publish、GitHub API fallback 与 Pages verification。

`sources:phase5-audit` 属于 runner 维护的来源审计，不得成为公共信号内容准入门。

## 终态解释

- `generated_only`：公共信号和 legacy 报告均已生成。
- `generated_degraded`：legacy 报告带降级项，但公共信号独立有效。
- `generated_signals_only`：公共信号已生成，legacy 报告未完成。
- `published`：公共信号及 legacy 报告已发布。
- `published_signals_only`：公共信号已发布，legacy 报告未完成；这是部分成功，不是未发布。
- `published_pending_pages_verification`：仓库已经发布，Pages 暂未刷新；不要重复发布。
- `published_degraded`：可能出现在 `legacy_report.status`，外层 runner 会按其真实公共发布结果归一化。
- `needs_ai_repair`：legacy 报告等待可恢复修订；单独读取 `signals.status`。
- `infrastructure_blocked_after_fallback_exhausted`：允许的基础设施 fallback 已耗尽。

若 `next_action.kind` 是 `restart_latest_main`，从 launcher 重新执行同一命令；不要复用旧工作树或旧产物。若是 signal-only 终态，保留并如实报告公共信号结果，再描述 legacy 失败。

## 恢复与兜底

恢复策略以 `config/daily-resilience-policy.json` 为唯一机器合同。修改 runner 阶段、终态或 fallback 后必须运行：

```powershell
corepack pnpm run resilience:validate
```

- signal Git publish 失败：只对 signal scope 使用 GitHub API fallback。
- signal fallback 成功：终态可以是 `published_signals_only`，并要求下一次从最新 main 重启 legacy 工作。
- legacy 发布失败：不得回滚已发布的 signal。
- Pages verification pending：报告 pending，不重复 push。
- 所有基础设施恢复耗尽：使用 `infrastructure_blocked_after_fallback_exhausted`。

## 交接

最终交接必须包含：bootstrap main SHA、clean publish root、summary 与 pipeline plan 路径、`completed_stages` 摘要、`signals.status`、`legacy_report.status`、Source Watch occurrence/index 证据、真实 publish 或 fallback、Pages 状态、blocking/degraded 项和 `next_action`。不要用 legacy 报告失败掩盖公共信号已经生成或发布的事实。
