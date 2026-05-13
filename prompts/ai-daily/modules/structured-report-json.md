## 结构化数据

先生成一个结构化日报 JSON 草稿，再用仓库命令标准化写入：

```powershell
npm run report:write -- .tmp/daily-report.json reports-data YYYY-MM-DD
```

命令会校验 `schemas/report.schema.json`，补齐稳定的发布路径、`canonical_url`、`publish_status` 和 `generated_at`，并写入 `reports-data/YYYY/MM/YYYY-MM-DD.json`。

关键字段：

- `schema_version: 1`
- `report_date`
- `title`
- `summary`
- `canonical_url`
- `html_path`
- `source_window`
- `main_items`
- `projects`
- `builder_observations`
- `community_leads`
- `self_check`
- `publish_status`
- `generated_at`

没有项目、Builder 观察或社区线索时使用空数组，不要猜测内容。
不要让工具猜测事实性内容；`title`、`summary`、`main_items`、来源链接和 `self_check` 必须由采样和判断结果明确给出。
