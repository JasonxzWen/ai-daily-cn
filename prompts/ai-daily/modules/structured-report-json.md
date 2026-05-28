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
- `hero_highlights`
- `canonical_url`
- `html_path`
- `source_window`
- `source_audit`
- `github_trending`
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
- `release_scope`：新草稿必须填写，只能使用 `provider_official_launch`、`gateway_availability`、`preview_access`、`model_card_update`；历史数据可缺省
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
- 可选 `content_type`：`blog`、`interview`、`podcast`、`engineering_note`

`hot_blogs[*].summary` 必须是 300-500 字中文内容摘要，不要另写 `why_it_matters`；历史数据可保留该字段，但新草稿不需要填写。

`github_trending` 用于独立展示 GitHub Trending 趋势，不再埋在 `projects` 或信源审计里。默认展示 5-8 个仓库；没有可核验趋势时使用空数组。每项包含：

- `candidate_id`
- `repo`
- `name`
- `description`
- `url`
- `event_date`
- `source`
- `language`
- `window`：`daily`、`weekly` 或 `past_24_hours`
- `rank`
- `previous_rank`：昨天同口径名次；昨天未上榜用 `null`
- `rank_delta`：`previous_rank - rank`；新上榜用 `null`
- `trend`：`new`、`up`、`down`、`same`
- `evidence`

`github_trending` 只描述趋势和用途；只有经过额外 release、README、近期 commit 或工程影响核验的项目，才另行进入 `projects`。

`hero_highlights` 用于公开页面 header，最多 1-3 条。每项包含：

- `title`
- `url`
- `reason`

只放当天最重磅的消息、项目或观点。没有特大新闻时写 1 条今日主线，禁止写“其余条目见后文”或“本版只保留 N 条”。

没有模型发布、热门博客、GitHub Trending、项目、Builder 观察或社区线索时使用空数组，不要猜测内容。
不要让工具猜测事实性内容；`title`、`summary`、`main_items`、来源链接和 `self_check` 必须由采样和判断结果明确给出。

`source_audit` 是每日结构化草稿的必填审计字段，用于证明已经检查 GitHub trending 与 Builder 原始源。它包含：

- `github_trending.checked: true`
- `github_trending.sources[]`：每个来源包含 `name`、`url`、`status`、可选 `notes`
- `github_trending.candidates_found`
- `github_trending.included`
- `github_trending.notes`
- `builder_sources.checked: true`
- `builder_sources.sources[]`
- `builder_sources.candidates_found`
- `builder_sources.included`
- `builder_sources.blocked_reason`：当 Builder 来源被阻塞或为空时填写机器可读原因，例如 `fetch_failed`、`auth_required`、`empty_feed`、`rate_limited`、`no_recent_signal`
- `builder_sources.last_successful_feed_at`：记录上次成功获取中心 feed 的 ISO 时间；没有历史记录时用 `null`
- `builder_sources.notes`
- 可选 `content_sources`：记录热门博客、访谈、播客、Product Hunt 或聚合站检查结果，结构与其他审计组一致。

`main_items`、`github_trending`、`model_releases`、`hot_blogs`、`projects`、`builder_observations` 的每个入选条目必须填写 `candidate_id`，并且该 ID 必须存在于 `.tmp/source-candidates-YYYY-MM-DD.json`。

`projects` 必须尽量填写 `domains` 和 `use_case`：`domains` 说明领域，例如 `coding_agent`、`agent_memory`、`RAG`、`eval_harness`、`inference_serving`；`use_case` 说明作用，例如“给 coding agent 提供跨会话持久记忆”。项目也可额外填写 `event_date`、`source`、`signal`、`evidence`；GitHub trending 和 Product Hunt 发现的项目应优先填写这些字段。`builder_observations` 可额外填写 `role`、`event_date`、`source`、`evidence`；没有原始 URL 的 builder 内容不得写入。
