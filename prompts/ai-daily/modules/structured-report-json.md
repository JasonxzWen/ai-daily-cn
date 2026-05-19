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
- `model_releases`
- `hot_blogs`
- `projects`
- `builder_observations`
- `community_leads`
- `self_check`
- `publish_status`
- `generated_at`

`model_releases` 用于独立追踪开源/闭源模型发布。没有模型发布时使用空数组；有数据时每项包含：

- `name`
- `provider`
- `availability`：只能使用 `open_weights`、`closed_api`、`closed_product`、`research_preview`
- `event_date`
- `url`
- `source`
- `summary`
- `notes`

`hot_blogs` 用于独立追踪高质量工程博客、研究博客、agent/coding/eval/harness/design 文章。没有博客时使用空数组；有数据时每项包含：

- `title`
- `url`
- `publisher`
- `author`
- `event_date`
- `topic`
- `summary`
- `why_it_matters`

没有模型发布、热门博客、项目、Builder 观察或社区线索时使用空数组，不要猜测内容。
不要让工具猜测事实性内容；`title`、`summary`、`main_items`、来源链接和 `self_check` 必须由采样和判断结果明确给出。
