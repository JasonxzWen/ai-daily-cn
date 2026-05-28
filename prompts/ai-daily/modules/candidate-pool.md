## 候选池硬门禁

日报正文只能从候选池中选条目。候选池先写入 `.tmp/source-candidates-YYYY-MM-DD.json`，再生成 `.tmp/daily-report.json`。

候选池必须记录：

- 固定来源清单：每个 source 有 `id`、`name`、`url`、`category`、`status`、可选 `checked_at` 和 `notes`。
- 所有候选：每个 candidate 有 `id`、`source_id`、`category`、`title`、`url`、`source`、`event_date`、`status`，入选时填写 `included_in`。
- 失败来源：允许 `blocked` 或 `no_signal`，但必须留在 `sources` 中；不要用人工判断抹掉失败记录。

硬规则：

- `main_items`、`github_trending`、`model_releases`、`hot_blogs`、`projects`、`builder_observations` 中的每个入选条目都必须填写 `candidate_id`。
- `candidate_id` 必须指向候选池中 `status: "included"` 的候选。
- 条目的 `url` 和 `event_date` 必须与候选池一致。
- 允许板块为空；不允许为了补满页面绕过候选池。
- 候选池会作为 `reports-data/YYYY/MM/YYYY-MM-DD.candidates.json` 与 `docs/data/YYYY/MM/YYYY-MM-DD.candidates.json` 随日报保留。

执行顺序：

1. 采样并写入 `.tmp/source-candidates-YYYY-MM-DD.json`。
2. 只从候选池中选择入选条目，写入 `.tmp/daily-report.json`。
3. 运行 `npm run report:write -- .tmp/daily-report.json reports-data YYYY-MM-DD`。
4. 如果返回 `candidate_pool_missing` 或 `candidate_pool_reference_invalid`，修正候选池或正文回指，不要绕过门禁。
