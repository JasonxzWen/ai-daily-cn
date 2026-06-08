## 结构化数据

先用候选池自动生成结构化日报 JSON 草稿，再用仓库命令标准化写入：

```powershell
npm run report:draft -- --date YYYY-MM-DD --input .tmp/github-trending-YYYY-MM-DD.json,.tmp/builders-YYYY-MM-DD.json,.tmp/content-sources-YYYY-MM-DD.json,.tmp/statuspage-incidents-YYYY-MM-DD.json,.tmp/search-news-YYYY-MM-DD.json,.tmp/sources-health-YYYY-MM-DD.json --output .tmp/daily-report.json --candidate-output .tmp/source-candidates-YYYY-MM-DD.json
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
- `report_status`：默认 `normal`。仅当全部活跃固定信源都因网络错误阻塞，且没有任何可核验事实可写入主体时，才使用 `empty_due_to_network_outage` 并保持 `main_items: []`。
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

各内容条目可选但强烈建议填写统一编辑/核验元数据：
- `editorial_category`：如 `ai_industry`、`engineering_toolchain`、`model_release`、`product_radar`、`open_source`、`viewpoint_analysis`、`podcast`、`x_discussion`、`community_signal`。
- `source_level`：事实主线优先使用 `primary`、`official`、`paper`、`github` 或 `multi_source`；观点、播客、社区、产品雷达线索可使用 `intermediary`、`community`、`original_social`、`wechat_industry_whitelist` 等，但必须披露。
- `verification_status`：`main_items` 和 `model_releases` 只接受 `primary_confirmed` 或 `multi_source_confirmed`；`hot_blogs`、`projects`、`builder_observations`、`community_leads` 可保留 `intermediary_only` 或 `original_social_only`，但要写 `verification_note` 或 `risk_note`。
- `why_it_matters` / `reader_relevance`：`main_items` 必须至少填写其一，说明为什么内容、产品、平台、策略或工程读者需要看；不要写“本日报后续跟进”之类的生产过程说明。
- `verification_note` / `risk_note` / `watch_next`：用于非一手观点、社区讨论、产品雷达和播客。公开 HTML 只展示必要的来源层级、待确认边界或风险说明；热门博客和社区线索不要把读者画像、后续跟进或风险模板渲染成重复卡片分点。

`main_items`、`model_releases`、`hot_blogs`、`projects`、`github_trending`、`builder_observations` 和 `community_leads` 的每个入选条目都应填写 `importance`。只能使用：

- `major`：公开页面显示为“重大”。
- `notable`：公开页面显示为“值得关注”。
- `general`：公开页面显示为“一般”。

如果草稿遗漏该字段，`report:write` 会按板块、tier、release_scope、rank/trend 和 signal 自动补默认值；但日报研究阶段仍应主动判断重要性，避免把普通运营项写成重大事件。

扩容逻辑栏目先映射到现有字段，不新增 schema：

- AI 核心动态：高信号模型类重大变化必须作为主体新闻写入 `main_items`，讲清楚能力、限制、可用性、成本或迁移影响；`model_releases` 仅作历史兼容字段，新草稿默认空数组，不生成公开栏目。平台、工程、算力、监管、企业采用和重大产品变化也写入 `main_items`。
- AIGC 与内容产业动态：覆盖图片生成、视频生成、创作者工具、AI 游戏资产/关卡/角色生成、Runway/Pika/Luma/Kling/Adobe/Unity 等公司产品动作；事实已回源时写入 `main_items` 并使用 `editorial_category:"content_aigc"`，只有中介线索或待验证时写入 `community_leads`。
- 产品与融资雷达：产品写入 `projects` 或 `community_leads`；融资、估值、ARR、并购和 IPO 只有官方公告、投资方公告、监管文件或两个独立可信来源确认时，才可写入 `main_items`。
- 精选博客与播客：长摘要写入 `hot_blogs`；只有一个 builder 原始观点时写入 `builder_observations`；无 transcript 或无原始单集页时写入 `community_leads` 或丢弃。
- X / 社区热点讨论：builder 原始帖写入 `builder_observations`；泛讨论写入 `community_leads`，并必须保留原始 X status URL。Builder 观点必须保留原文和完整中文翻译，不得写成概括。
- 参考用户给定的飞书日报板块结构做覆盖校验：`内容赛道动态` 映射 AIGC/内容产业，`AI行业动态` 映射大厂动作、平台政策、监管、算力和商业化，`观点与分析` 映射博客、播客、Builder/X 原始观点，`今天值得关注的产品` 映射 GitHub Trending、Product Hunt、融资和产品雷达，`今日热点的 Twitter 讨论` 映射 `builder_observations` 与 `community_leads`。这只是栏目契约，不代表直接复用该文档正文。

内容密度目标：

- 新日报目标为 33-45 个公开内容单元，计算口径是 `main_items + hot_blogs + github_trending + project highlights + builder_observations + community_leads`。`model_releases` 只作为结构化索引，不单独渲染公开板块；`projects` 只在 GitHub Trending 中作为 highlights 展示。
- `main_items` 目标为 8-12 条，默认 10 条；每条用 3-5 个短 bullet 分点汇报，并包含 `**...**` 或 `==...==` 重点标注。`==...==` 只用于正文关键词，公开页会渲染为加粗变色文字，不是 tag/chip。bullet 只写该新闻本身的事实、数据、限制、影响和对比，不写“日报跟踪口径”“后续跟进”“报道边界”“非技术板块价值”等对日报自身的反思建议。
- 只有 `report_status:"empty_due_to_network_outage"` 可以让 `main_items` 为空；该状态必须对应全源网络阻塞、最终 `source_audit` 已写入 blocked 证据、`quality_status.degraded_sections` 包含 `empty_due_to_network_outage`，并且不得写占位主体条目或未核验事实。
- `builder_observations` 目标为 5-20 条；当 follow-builders 或固定 Builder 源候选不足 5 条时保留实际数量并公开降级说明，不要用无原始 URL 的热度摘要补数。
- 低于 27 个内容单元时，`quality_status.status` 应为 `degraded`，并在 `reasons`、`affected_sections`、`degraded_sections`、`public_note` 或 `self_check.notes` 说明缺口。
- 不为达标伪造内容；候选不足或回源失败时写审计，不写空栏目。

`self_check.optimization_suggestions` 最多 3 条，必须使用 canonical 对象字段：`issue`、`evidence`、`module`、`suggestion`、`expected_benefit`、`requires_user_confirmation`。其中 `requires_user_confirmation` 必须是 boolean。不要输出 `suggested_module`、`needs_user_confirmation`、`area`、`title`、`why` 等历史兼容字段；`report:write` 会规范化兼容旧输入，但新草稿应直接满足 canonical schema。

`quality_status` 由 `report:write` 按发现审计和候选池自动派生；草稿也可显式填写。启动、依赖、schema 校验、候选池回指、远端 `main` 基线、重复旧闻或正文事实来源问题导致日报不能安全发布时使用 `blocked`，并把机器可读问题写入 `blocking_issues`。外部发现源失败、固定覆盖不足、GitHub Trending / Builder X / evidence asset 覆盖不足、某个板块为空或兼容字段非空但未进入主体新闻时使用 `degraded`，并填写 `reasons`、`affected_sections`、`degraded_sections` 和可公开的 `public_note`；核心源正常但低信号时保持 `ok`，可在 `reasons` 里记录 `low_signal`。`affected_sections` 保留为兼容字段；新草稿应优先使用结构化的 `degraded_sections` / `blocking_issues`，每项至少包含 `code`、`section`、`message`。

`evidence_assets` 用于把来源链接里的关键图、表或已转写数据挂到对应日报条目旁边；它不是独立图片展板。每项包含 `type`（`figure` 或 `table`）、`title`、`source_url`、可选 `local_path`、`caption`、`extraction_status` 和可选二维 `data`。只有确实来自原文图表、官方图片或人工转写并能回到 `source_url` 的数据才能填写；不能自动抽取时留空数组，不要臆造。

证据图表拉取与展示规范：
- 什么时候拉：只有当图表直接支撑已入选的 `main_items`、`hot_blogs` 或 `projects` 的关键判断，且纯文字转述会丢失比较维度、排名、曲线、表格或截图证据时才拉；装饰图、logo、人物照、封面图、无信息密度的 hero 图一律不拉。
- 拉哪些图：优先拉官方原文中的 benchmark 表、采用率/分布图、架构图、流程图、定价/配额表、实验结果图；每个来源默认最多 1 张，除非同一条目确实有两个互补证据。所有图片必须保留 `source_url`，且 `source_url` 必须等于对应日报条目的 `url`，这样页面才能把图放回那条报道下面。
- 主线条目、热门博客和项目都适用同一规则：只有原文图能帮助读者理解能力边界、架构、benchmark、监控链路、工作流或关键对比时才缓存为 `figure`；每个条目最多优先展示 1-2 张最重要图片。每张图的 `source_url` 必须等于对应日报条目的 `url`。模型相关图片必须挂在对应 `main_items` 或 `hot_blogs` 条目下展示；`model_releases` 不再单独渲染公开图片行。
- 如何展示：公开 HTML 会把证据图表放在匹配条目之后，不生成单独“证据图表”板块。若有 `local_path`，页面展示居中的图片和图片下方中文说明；只有没有图片时才用 `data` 退化为表格展示，表格说明必须在表格下方。`title` 必须是短中文图名或表名，`caption` 写清数据/图表来自原文哪个部分。
- 图片展示必须保持可点开放大；不要把来源 icon、站点 favicon 或低信息密度封面图当成证据图。
- 排版约束：图片必须是可读的原图或清晰裁切，避免整页截图；宽图优先裁到图表本体，移动端不能横向撑破页面。不要为了“有图”而展示图片，不能清晰增强读者理解的图宁可不放。

证据图表的选择必须克制：
- 原文已有架构图、流程图、benchmark 图、数据图或官方信息图时，优先把原文图片缓存为 `figure`，不要把同一信息再人工改写成表格。
- `manual_table` 只用于原文明确给出规格矩阵、价格/配额/benchmark 对比、步骤清单、指标对照等天然结构化内容；普通新闻叙述、影响分析或运营判断不能硬转成表格。
- 不追求每条主体信息都有图表。多数主体信息没有图表是正常状态；宁可留空 `evidence_assets`，也不要为了视觉覆盖率构造表格。
- 若同一批主体信息中 `manual_table` 覆盖大多数条目，应视为过度包装并重写，只保留真正提升理解的数据或原文图。

`model_releases` 是历史兼容和结构化索引字段，不作为公开日报的独立新闻池，新草稿默认使用空数组。模型类重大动态必须在 `main_items` 中讲清楚事实、能力、限制、可用性和影响；若兼容旧数据必须保留该字段，每项包含：

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

`hot_blogs[*].summary` 必须是约 100-160 个中文字符的分点式中文内容摘要，覆盖核心问题、方法或论证、关键结论、适用场景或局限；不要另写 `why_it_matters`。历史数据可保留该字段，但新草稿不需要填写。

`github_trending` 用于独立展示 GitHub Trending Top 10 榜单，并承载经过核验的项目 highlight tag。默认展示 Top 10 仓库；没有可核验趋势时使用空数组。每项包含：

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

`github_trending` 只描述趋势和用途；只有经过额外 release、README、近期 commit 或工程影响核验的项目，才另行进入 `projects` 作为 highlight 元数据，但公开页面仍合并在 GitHub Trending 中展示。
`github_trending[*].description` 必须是中文改写，避免直接复制 GitHub 英文描述；长度控制在 80-140 个中文字符以内，优先说明“是什么、解决什么问题、适合观察什么”，不要写来源审计或泛化热度判断。页面展示会隐藏来源、语言等审计字段，只保留榜位、变化、star 变化 tag、项目 highlight tag 和中文简介。

`hero_highlights` 用于公开页面 header，最多 1-3 条。每项包含：

- `title`
- `url`
- `reason`

只放当天最重磅的消息、项目或观点。没有特大新闻时写 1 条今日主线，禁止写“其余条目见后文”或“本版只保留 N 条”。

没有模型发布、热门博客、GitHub Trending、项目、Builder 观察或社区线索时使用空数组，不要猜测内容。空的 `model_releases` 或 `projects` 不应造成公开 HTML 出现空板块；`model_releases` 新草稿默认保持空数组。
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

`projects` 必须尽量填写 `domains` 和 `use_case`：`domains` 说明领域，例如 `coding_agent`、`agent_memory`、`RAG`、`eval_harness`、`inference_serving`；`use_case` 说明作用，例如“给 coding agent 提供跨会话持久记忆”。`description` 控制在 100 个中文字符以内，避免堆叠审计来源、长背景或重复 use_case。公开 HTML 只会把匹配 GitHub Trending Top 10 的项目作为对应条目的 `项目 highlight` tag 和行内说明，不生成单独项目卡片区、“项目 highlights”子标题或额外项目列表；未匹配 Top 10 的 `projects` 只保留在结构化 JSON 中。项目也可额外填写 `event_date`、`source`、`signal`、`evidence`；GitHub trending 和 Product Hunt 发现的项目应优先填写这些字段。

`builder_observations` 必须填写 `author`、`content`、`url`，新草稿还必须填写 `original_text` 和 `translation`。`original_text` 放原帖或原始连续摘录的完整英文/原文；`translation` 是完整、精确、忠于原意的中文翻译，不能压缩为观点摘要，不能添加原文没有的判断；`content` 为兼容字段，必须与 `translation` 保持同义，推荐直接填同一段完整翻译。可额外填写 `handle`、`role`、`event_date`、`source`、`evidence`、`avatar_url`、`avatar_local_path` 或 `avatar_data_uri`。如果有 X handle，应填写 `handle`；如果能取得头像 URL，填写 `avatar_url`，构建器会 best-effort 缓存到 `docs/assets/avatars/**` 并写入公开数据。没有原始 URL、没有原文或无法完整翻译的 builder 内容不得写入。

当 `source_audit.builder_sources.candidates_found >= 5` 或候选池中存在至少 5 条合格 `builder_observation` 候选时，`builder_observations` 目标为 5-20 条；少于 5 条必须把过滤口径写入 `source_audit.builder_sources.notes` 或 `self_check.notes`，并让 `quality_status.degraded_sections` 公开标注 Builder 覆盖不足。

Product Hunt 项目只有在官网、GitHub、README、文档或原始发布页完成交叉确认后才能写入 `projects`；否则写入 `community_leads` 或丢弃。融资类产品即使来自 Crunchbase、TechCrunch、36Kr 等来源，也必须满足 `primary_confirmed` 或 `multi_source_confirmed` 后才进入事实栏目。

AI 开发工具计费、配额、成本归因、usage dashboard、Service Quotas、seat/usage-based billing 和 credit 变化必须作为常规候选被记录；影响开发者工作流、团队预算、上线容量或采购口径时可写入 `main_items`，否则写入 `community_leads`。
