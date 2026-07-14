## 遗留编辑报告候选池（legacy-only）

> 范围声明：本模块仅适用于公共信号流完成后的可选遗留编辑报告（legacy report）。它不治理 `docs/signals/**`，不得改变公共信号流的成员集合、默认时序或发布结果；候选池不是公共信号的准入门槛。

可选遗留编辑报告的正文只能从候选池中选条目。`signals:write` 是 occurrence store 的唯一 writer；独立运行 legacy fallback 时，先用同一批 discovery inputs 和同一个 `generated-at` 写 signal store，再让 `report:draft` 只验证并消费它：

```powershell
$reportDate = "YYYY-MM-DD"
$generatedAt = (Get-Date).ToUniversalTime().ToString("o")
$workflow = Get-Content config/daily-workflow-contract.json -Raw -Encoding utf8 | ConvertFrom-Json
$signalInputs = ($workflow.daily_runner.public_signals.discovery_lanes | ForEach-Object { $_.artifact_path_template.Replace("YYYY-MM-DD", $reportDate) }) -join ","
$legacyInputs = "$signalInputs,.tmp/sources-health-$reportDate.json"
corepack pnpm run signals:write -- --date $reportDate --generated-at $generatedAt --input $signalInputs --allow-degraded-inputs
corepack pnpm run report:draft -- --date $reportDate --generated-at $generatedAt --input $legacyInputs --output .tmp/daily-report.json --candidate-output .tmp/source-candidates-YYYY-MM-DD.json
```

`signals:write` 的 canonical 输入由 `daily_runner.public_signals.discovery_lanes` 唯一声明，且不得包含只作诊断的 `sources-health`。单路暂时缺失时使用 `--allow-degraded-inputs` 留下局部降级并继续写入已成功观察；随后从该路 checkpoint 续跑并以同日全量输入补充 store。写入器不得缩减或改写已有 occurrence。`report:draft` 可以额外消费第九个 `sources-health` 审计输入，但它无权重写 occurrence store。

`report:draft` 不写 occurrence store。它会验证 store 与发现输入一致，再合并 legacy `source_audit`、写入 `.tmp/source-candidates-YYYY-MM-DD.json`、为入选候选标记 `status:"included"` / `included_in`，并生成 `.tmp/daily-report.json`。不要再用临时手工脚本绕过这个步骤。

候选池必须记录：

- 固定来源清单：每个 source 有 `id`、`name`、`url`、`category`、`status`，可选 `checked_at` 和 `notes`。
- 所有候选：每个 candidate 有 `id`、`source_id`、`category`、`title`、`url`、`source`、`event_date`、`status`；入选时填写 `included_in`。
- 失败来源：允许 `blocked` 或 `no_signal`，但必须留在 `sources` 与最终 `source_audit` 中；不要用人工判断抹掉失败记录。
- 证据图片：候选带 `image_url` 时，`report:draft` 会 best-effort 缓存到 `docs/assets/evidence/**` 并写入 `evidence_assets`；缓存失败不得伪造图片。
- 历史比较：记录已和 `reports-data` 最近至少 7 个日报日的正文与候选池比较；重复候选保留 `status:"excluded"`、`exclusion_reason` 和对应历史日期或历史 URL。

遗留编辑报告规则：

- `main_items`、`github_trending`、`model_releases`、`hot_blogs`、`projects`、`builder_observations` 中的每个入选条目都必须填写 `candidate_id`。
- `candidate_id` 必须指向候选池中 `status:"included"` 的候选。
- 条目的 `url` 和 `event_date` 必须与候选池一致。
- 允许板块为空；不允许为了补满页面绕过候选池。
- 任何来源采集到的候选，进入正文前都必须完成跨日去重；不能只对 GitHub Trending 做历史比较。
- 候选池会作为 `reports-data/YYYY/MM/YYYY-MM-DD.candidates.json` 与 `docs/data/YYYY/MM/YYYY-MM-DD.candidates.json` 随日报保留。

执行顺序：

1. 运行发现命令并写出 `.tmp/*-YYYY-MM-DD.json`。
2. 运行 `signals:write` 写入唯一 occurrence store。
3. 运行 `corepack pnpm run report:draft ...` 生成 `.tmp/source-candidates-YYYY-MM-DD.json` 和 `.tmp/daily-report.json`。
4. 运行 `corepack pnpm run report:write -- .tmp/daily-report.json reports-data YYYY-MM-DD`。
5. 如果返回 `candidate_pool_missing`、`candidate_pool_reference_invalid` 或 schema 错误，修正候选池或正文回指，不要绕过遗留报告的编辑门禁；该错误不得阻止已经验证的公共信号发布。
