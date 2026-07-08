## 候选池硬门槛

日报正文只能从候选池中选条目。默认流程是先运行固定发现命令，再运行：

```powershell
corepack pnpm run report:draft -- --date YYYY-MM-DD --input .tmp/github-trending-YYYY-MM-DD.json,.tmp/builders-YYYY-MM-DD.json,.tmp/content-sources-YYYY-MM-DD.json,.tmp/statuspage-incidents-YYYY-MM-DD.json,.tmp/search-news-YYYY-MM-DD.json,.tmp/sources-health-YYYY-MM-DD.json --output .tmp/daily-report.json --candidate-output .tmp/source-candidates-YYYY-MM-DD.json
```

`report:draft` 会从发现输出合并 `source_audit`、写入 `.tmp/source-candidates-YYYY-MM-DD.json`、为入选候选标记 `status:"included"` / `included_in`，并生成 `.tmp/daily-report.json`。不要再用临时手工脚本绕过这个步骤。

候选池必须记录：

- 固定来源清单：每个 source 有 `id`、`name`、`url`、`category`、`status`，可选 `checked_at` 和 `notes`。
- 所有候选：每个 candidate 有 `id`、`source_id`、`category`、`title`、`url`、`source`、`event_date`、`status`；入选时填写 `included_in`。
- 失败来源：允许 `blocked` 或 `no_signal`，但必须留在 `sources` 与最终 `source_audit` 中；不要用人工判断抹掉失败记录。
- 证据图片：候选带 `image_url` 时，`report:draft` 会 best-effort 缓存到 `docs/assets/evidence/**` 并写入 `evidence_assets`；缓存失败不得伪造图片。
- 历史比较：记录已和 `reports-data` 最近至少 7 个日报日的正文与候选池比较；重复候选保留 `status:"excluded"`、`exclusion_reason` 和对应历史日期或历史 URL。

硬规则：

- `main_items`、`github_trending`、`model_releases`、`hot_blogs`、`projects`、`builder_observations` 中的每个入选条目都必须填写 `candidate_id`。
- `candidate_id` 必须指向候选池中 `status:"included"` 的候选。
- 条目的 `url` 和 `event_date` 必须与候选池一致。
- 允许板块为空；不允许为了补满页面绕过候选池。
- 任何来源采集到的候选，进入正文前都必须完成跨日去重；不能只对 GitHub Trending 做历史比较。
- 候选池会作为 `reports-data/YYYY/MM/YYYY-MM-DD.candidates.json` 与 `docs/data/YYYY/MM/YYYY-MM-DD.candidates.json` 随日报保留。

执行顺序：

1. 运行发现命令并写出 `.tmp/*-YYYY-MM-DD.json`。
2. 运行 `corepack pnpm run report:draft ...` 生成 `.tmp/source-candidates-YYYY-MM-DD.json` 和 `.tmp/daily-report.json`。
3. 运行 `corepack pnpm run report:write -- .tmp/daily-report.json reports-data YYYY-MM-DD`。
4. 如果返回 `candidate_pool_missing`、`candidate_pool_reference_invalid` 或 schema 错误，修正候选池或正文回指，不要绕过门禁。
