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
- `quality_status`
- `github_trending`
- `main_items`
- `model_releases`
- `hot_blogs`
- `projects`
- `builder_observations`
- `community_leads`
- `evidence_assets`
- `self_check`
- `publish_status`
- `generated_at`

扩容逻辑栏目先映射到现有字段，不新增 schema：

- AI 核心动态：高信号真实模型发布必须先作为主体新闻写入 `main_items`，并可同步写入 `model_releases` 作为结构化索引；`model_releases` 不能替代主体信息。平台、工程、算力、监管、企业采用和重大产品变化也写入 `main_items`。
- AIGC 与内容产业动态：事实已回源时写入 `main_items`；只有中介线索或待验证时写入 `community_leads`。
- 产品与融资雷达：产品写入 `projects` 或 `community_leads`；融资、估值、ARR、并购和 IPO 只有官方公告、投资方公告、监管文件或两个独立可信来源确认时，才可写入 `main_items`。
- 精选博客与播客：长摘要写入 `hot_blogs`；只有一个 builder 原始观点时写入 `builder_observations`；无 transcript 或无原始单集页时写入 `community_leads` 或丢弃。
- X / 社区热点讨论：builder 原始帖写入 `builder_observations`；泛讨论写入 `community_leads`，并必须保留原始 X status URL。

内容密度目标：

- 新日报目标为 22-30 个公开内容单元，计算口径是 `main_items + model_releases + hot_blogs + projects + builder_observations + community_leads + github_trending`。
- `main_items` 目标为 8-12 条，默认 10 条；每条用 2-4 个短 bullet 分点汇报，并包含 `**...**` 或 `==...==` 重点标注。bullet 只写该新闻本身的事实、数据、限制、影响和对比，不写“日报跟踪口径”“后续跟进”“报道边界”“非技术板块价值”等对日报自身的反思建议。
- 低于 18 个内容单元时，`quality_status.status` 应为 `degraded`，并在 `reasons`、`affected_sections`、`public_note` 或 `self_check.notes` 说明缺口。
- 不为达标伪造内容；候选不足或回源失败时写审计，不写空栏目。

`quality_status` 由 `report:write` 按发现审计和候选池自动派生；草稿也可显式填写。启动、依赖或 schema 校验导致日报不能生成时使用 `blocked` 并停止发布；外部发现源失败但日报可生成时使用 `degraded`，并填写 `reasons`、`affected_sections` 和可公开的 `public_note`；核心源正常但低信号时保持 `ok`，可在 `reasons` 里记录 `low_signal`。

`evidence_assets` 用于把来源链接里的关键图、表或已转写数据挂到对应日报条目旁边；它不是独立图片展板。每项包含 `type`（`figure` 或 `table`）、`title`、`source_url`、可选 `local_path`、`caption`、`extraction_status` 和可选二维 `data`。只有确实来自原文图表、官方图片或人工转写并能回到 `source_url` 的数据才能填写；不能自动抽取时留空数组，不要臆造。

证据图表拉取与展示规范：
- 什么时候拉：只有当图表直接支撑已入选的 `main_items`、`model_releases`、`hot_blogs` 或 `projects` 的关键判断，且纯文字转述会丢失比较维度、排名、曲线、表格或截图证据时才拉；装饰图、logo、人物照、封面图、无信息密度的 hero 图一律不拉。
- 拉哪些图：优先拉官方原文中的 benchmark 表、采用率/分布图、架构图、流程图、定价/配额表、实验结果图；每个来源默认最多 1 张，除非同一条目确实有两个互补证据。所有图片必须保留 `source_url`，且 `source_url` 必须等于对应日报条目的 `url`，这样页面才能把图放回那条报道下面。
- 模型发布和热门技术博客也适用同一规则：只有原文图能帮助读者理解模型能力、架构、benchmark、监控链路、工作流或关键对比时才缓存为 `figure`；每个板块最多优先展示 1-2 张最重要图片。模型发布中两张来自不同模型条目的关键图会在公开 HTML 中同排展示，但每张图的 `source_url` 仍必须等于对应模型条目的 `url`。
- 如何展示：公开 HTML 会把证据图表放在匹配条目之后，不生成单独“证据图表”板块。若有 `local_path`，页面展示居中的图片和图片下方中文说明；只有没有图片时才用 `data` 退化为表格展示，表格说明必须在表格下方。`title` 必须是短中文图名或表名，`caption` 写清数据/图表来自原文哪个部分。
- 排版约束：图片必须是可读的原图或清晰裁切，避免整页截图；宽图优先裁到图表本体，移动端不能横向撑破页面。不要为了“有图”而展示图片，不能清晰增强读者理解的图宁可不放。

证据图表的选择必须克制：
- 原文已有架构图、流程图、benchmark 图、数据图或官方信息图时，优先把原文图片缓存为 `figure`，不要把同一信息再人工改写成表格。
- `manual_table` 只用于原文明确给出规格矩阵、价格/配额/benchmark 对比、步骤清单、指标对照等天然结构化内容；普通新闻叙述、影响分析或运营判断不能硬转成表格。
- 不追求每条主体信息都有图表。多数主体信息没有图表是正常状态；宁可留空 `evidence_assets`，也不要为了视觉覆盖率构造表格。
- 若同一批主体信息中 `manual_table` 覆盖大多数条目，应视为过度包装并重写，只保留真正提升理解的数据或原文图。

`model_releases` 用于结构化追踪真实开源/闭源模型发布，不作为公开日报中替代主体信息的独立新闻池。重大模型发布应在 `main_items` 中讲清楚事实、能力、限制、可用性和影响；没有模型发布时使用空数组；有数据时每项包含：

- `name`
- `provider`
- `availability`：只能使用 `open_weights`、`closed_api`、`closed_product`、`research_preview`
- `release_scope`：新草稿必须填写。新日报只能把真实发布写成 `provider_official_launch`，或把有实质能力/边界变化的官方模型卡更新写成 `model_card_update`；`gateway_availability`、`preview_access` 仅为历史兼容枚举，新草稿不得使用。
- `event_date`
- `url`
- `source`
- `summary`
- `notes`

不要把第三方网关上架、产品内可用、preview access、区域/账号开放、Statuspage incident/恢复、短时限流或配额变更写入 `model_releases`。这些内容默认进入 `community_leads`，文案标为 `**模型可用性**`、`**状态页**` 或 `**网关上架**`，并用 `==轻量运营==` 或 `==待观察==` 说明级别；影响重大时可升格为 `main_items`，但仍不进入 `model_releases`。

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

`github_trending` 用于独立展示 GitHub Trending 榜单，不再埋在 `projects` 或信源审计里。默认展示 Top 10 仓库；没有可核验趋势时使用空数组。每项包含：

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
`github_trending[*].description` 必须是中文改写，避免直接复制 GitHub 英文描述；长度控制在 100 个中文字符以内，优先说明“是什么、解决什么问题、适合观察什么”，不要写来源审计或泛化热度判断。页面展示会隐藏来源、语言等审计字段，只保留榜位、变化和中文简介，并把排名/星标变化拆成短 bullet。

`hero_highlights` 用于公开页面 header，最多 1-3 条。每项包含：

- `title`
- `url`
- `reason`

只放当天最重磅的消息、项目或观点。没有特大新闻时写 1 条今日主线，禁止写“其余条目见后文”或“本版只保留 N 条”。

没有模型发布、热门博客、GitHub Trending、项目、Builder 观察或社区线索时使用空数组，不要猜测内容。
不要让工具猜测事实性内容；`title`、`summary`、`main_items`、来源链接和 `self_check` 必须由采样和判断结果明确给出。

`source_audit` 是每日结构化草稿的必填审计字段。它必须合并各发现命令的审计结果，而不是只把命令 stdout 留在本地临时文件里；需要在 `report:write` 后补充独立发现命令审计时，使用 `npm run sources:audit-merge -- --date YYYY-MM-DD --input <audit-output.json>[,<audit-output.json>]` 写回最终 `reports-data` JSON。连续运行验收读取最终 `reports-data` JSON，因此新日报至少包含这些审计组：

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
- `content_sources.checked: true`：记录热门博客、访谈、播客、Product Hunt developer-tools/trending、广义科技媒体、大厂 newsroom、行业趋势源、X 热点 feed、微信公众号/自媒体中介线索或聚合站检查结果，结构与其他审计组一致。中介源必须在 notes 中保留 `primary_verification_required=true` 或等价说明；白名单公众号必须保留 `source_level`、公众号名和待核验点；X 热点必须保留原始 X status URL。
- `search_sources.checked: true`：记录 `discover:search-news` 的影子运行结果，必须包含 `shadow:true`，缺 key provider 记录为 `skipped_missing_token` 或在 notes 中说明。
- `sources_health.checked: true`：记录 `sources:health` 的健康检查结果；未配置自托管 RSSHub/RSS-Bridge base URL 时记录 `skipped_missing_base_url`，不是日报失败。
- 可选但推荐的审计指标：`pricing_quota_cost_items`、`model_availability_ops`、`wechat_whitelist_items`、`provider_cost_units`。这些字段只记录数量、请求数或 credit 估算，不记录 token、密钥或鉴权 header。

`source_audit.*.sources[].status` 允许 `checked`、`no_signal`、`blocked`、`skipped_missing_token`、`skipped_missing_base_url`、`skipped_manual_source`、`skipped_manual_review_required`。如果某组没有候选，也必须说明检查过哪些源以及为什么未入选。

`main_items`、`github_trending`、`model_releases`、`hot_blogs`、`projects`、`builder_observations` 的每个入选条目必须填写 `candidate_id`，并且该 ID 必须存在于 `.tmp/source-candidates-YYYY-MM-DD.json`。

`projects` 必须尽量填写 `domains` 和 `use_case`：`domains` 说明领域，例如 `coding_agent`、`agent_memory`、`RAG`、`eval_harness`、`inference_serving`；`use_case` 说明作用，例如“给 coding agent 提供跨会话持久记忆”。`description` 控制在 100 个中文字符以内，避免堆叠审计来源、长背景或重复 use_case；公开 HTML 会把项目渲染成横向卡片，过长文本会造成布局不均。项目也可额外填写 `event_date`、`source`、`signal`、`evidence`；GitHub trending 和 Product Hunt 发现的项目应优先填写这些字段。`builder_observations` 可额外填写 `role`、`event_date`、`source`、`evidence`；没有原始 URL 的 builder 内容不得写入。

Product Hunt 项目只有在官网、GitHub、README、文档或原始发布页完成交叉确认后才能写入 `projects`；否则写入 `community_leads` 或丢弃。融资类产品即使来自 Crunchbase、TechCrunch、36Kr 等来源，也必须满足 `primary_confirmed` 或 `multi_source_confirmed` 后才进入事实栏目。

AI 开发工具计费、配额、成本归因、usage dashboard、Service Quotas、seat/usage-based billing 和 credit 变化必须作为常规候选被记录；影响开发者工作流、团队预算、上线容量或采购口径时可写入 `main_items`，否则写入 `community_leads`。
