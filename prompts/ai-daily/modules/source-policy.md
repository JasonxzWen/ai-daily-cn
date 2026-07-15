## 公共信号标签与遗留报告信源策略

> 范围声明：公共信号流是独立且先行的监听层；本模块的优先级、回源、筛选和事实核验要求仅适用于公共信号流完成后的可选遗留编辑报告（legacy report），不得改变 `docs/signals/**` 的成员集合、默认时序或发布结果。

两条链路使用同一批来源，但治理方式不同：

- **公共信号流**：所有已发现、标准化且可安全公开的记录都应保留。来源属性、内容类别、可信度、健康、访问性、`manual`、回源状态和原始 X URL 完整度都是非门槛标签，只用于展示、筛选和理解边界。
- **可选遗留编辑报告**：可以把 T0/T1/T2/T3、回源、多源核验和高风险事实规则用于排序、筛选与成稿。未入选 legacy 报告不等于从公共信号流删除。

公共信号只使用 canonical 可信度标签：`primary_material`、`multi_source_material`、`single_source_relay`、`community_lead`、`monitoring_lead`、`pending_review`。它们只解释材料形态，不评分、不排序、不准入。

以下 T0-T3 仅是遗留编辑报告的历史优先级，不是注册表字段，也不是公共信号标签：

- T0：官方博客、论文、模型卡、GitHub Release、官方 benchmark。
- T1：builder、研究者、founder、maintainer 的原始帖子或视频。
- T2：GitHub、Hugging Face、arXiv、HN、Product Hunt、播客原始单集页、可追溯社区讨论。
- T3：媒体报道、普通微信公众号、自媒体、华尔街见闻、行业资讯站和聚合摘要，默认不作为事实主线来源；可作为 `hot_blogs`、`community_leads`、AIGC/产业线索或交叉验证，并在结构化数据中保留来源层级。公开页使用真实来源名、原文链接和日期，不把“第三方报道”或“社区线索”作为重复 chip 或详情格。用户确认的公众号白名单可按 `wechat_primary_like` 或 `wechat_industry_whitelist` 单独标注。

优先扩展信源：

- 信源注册表：固定源统一维护在 `config/sources/*.json`，每个来源直接声明 `source_group`、标准 `content_tags` 和 `credibility_tag`，并通过 `corepack pnpm run sources:validate`。注册表不再接受 `tier`、`authority`、`verification_policy`、`enablement` 或 `source_level`；`manual` 只可作为采集通道 `source_kind`，不得用于跳过来源。监听命令不得在 occurrence 持久化前取样，遗留编辑报告只能消费完整 occurrence 后另行编排。
- Builder/X/播客：优先使用 `follow-builders central feed`，再回到原始 X URL、公开视频、播客页或个人博客；Follow AI Builders 可作为 builder 名录和标签线索。遗留报告需要更强可审计性时，优先使用能保留原始 X status URL 的自托管 RSSHub、twscrape、列表导出或等价工具；缺原始 status URL 的安全记录仍保留在公共信号流，并标记可追溯性和访问边界。Builder 观点进入遗留报告时必须保留完整 `original_text` 并提供忠实中文 `translation`，不能用二手摘要或自己概括替代；能拿到 handle/头像时同步写入 `handle` 和 `avatar_url`。
- 官方与实验室工程博客：OpenAI News/RSS、Anthropic Engineering/News、Google DeepMind、Google Research、Meta AI、Microsoft Research、Hugging Face Blog。
- 广义科技、大厂和行业趋势：TechCrunch AI/Enterprise、The Verge AI/main、Ars Technica、Google Keyword Blog、Official Microsoft Blog、Apple Newsroom、Meta Newsroom、Amazon News 等可以作为候选源；只有当它们影响 AI 供给、开发者工作流、平台政策、算力/云、产品分发、监管或产业结构时才入选。
- 高质量个人/社区技术博客与访谈：Latent.Space、Interconnects、Simon Willison、Chip Huyen、Karpathy、BAIR Blog，以及对 OpenAI、Anthropic、Google、Meta 等大型实验室工程师的原始访谈或 transcript。
- 产品发现：Product Hunt、新产品榜单、项目官网和 GitHub README 可作为候选源；最终事实尽量回到产品官网、GitHub、官方文档或原始发布页。
- AI 开发工具商业化：固定检查 coding agent、IDE、API gateway、云平台、评测/观测工具的价格页、changelog、Service Quotas、usage dashboard、rate limit 和 credit/seat/usage-based billing 变化。
- AIGC 与内容产业：Runway、Pika、Luma、Kling、Unity Muse、RCTV、The Magnifier AI、Crunchbase News AI，以及中文内容产业媒体、平台公告、活动页面和公司公告可作为候选源。覆盖图片生成、视频生成、短剧/漫剧、音乐/配音、广告创意、创作者工具、AI 辅助游戏创作、内容平台政策和商业化，但事实性入选必须回到官方、产品页、监管文件、投资方公告或多源确认。
- 播客平台：小宇宙、喜马拉雅等只作为具体节目或单集发现入口；最终需要单集页、RSS episode、原始音频或可信 transcript。小宇宙可通过 RSSHub `/xiaoyuzhou/podcast/:id`；喜马拉雅可通过 RSSHub `/ximalaya/:type/:id/:all/:shownote?`，但通常需要 `XIMALAYA_TOKEN` 且默认不输出 ShowNote，缺少授权或单集证据时必须说明不可用。
- 公众号与中介媒体：普通微信公众号、自媒体和行业媒体是重要线索源，但不是事实主线的最终报道实体；必须先尝试拿到其引用的一手信源。`wechat_primary_like` 可作为半一手，`wechat_industry_whitelist` 可用于低风险行业动态和观点分析进入主体信息；无法回源且不在白名单时可进入 `community_leads`，高质量长文/访谈/播客可进入 `hot_blogs`，但公开页不得用“第三方报道”或“社区线索”tag 刷屏，来源层级留在结构化数据。
- 公众号文章链接输入：优先使用日期级输入 `$CODEX_HOME/automations/ai-daily/inputs/wechat/YYYY-MM-DD.json` 或 `--wechat-input <json>`；每条必须保留原始 `mp.weixin.qq.com` URL、账号名、发布时间、风险等级、验证备注和可选一手回源 URL。候选池和公开页面只能展示清洗后的公众号 URL、账号与验证状态，不能暴露本机路径、输入文件路径、私有 feed URL、cookie、token 或自动化目录。
- 公众号 RSS/聚合器：RSSHub NewRank、Wechat2RSS、RSS-Bridge、Miniflux/FreshRSS 等只能作为用户显式配置的私有发现源；未配置时记录 `skipped_missing_base_url` / `skipped_missing_token`，不阻断日报。聚合器内容不提升事实等级，高风险事实仍需 T0/T1/T2 或多源确认。
- 聚合站：Planet AI、RSS 索引仓库等只作发现和交叉验证，最终链接尽量回到原文。

扩容目标：

- 新日报目标是 55-75 个公开内容单元/天，逻辑上覆盖 AI 核心动态、AIGC 与内容产业、产品与融资雷达、精选博客/播客、X / 社区热点讨论和 GitHub Trending。`model_releases` 是结构化索引，不单独计作公开板块；`projects` 只作为 GitHub Trending highlights 展示。
- `stories` 目标是默认 8 条、最多 12 条；允许少于 8，但不能用模板化或低核验内容凑数。每条公开正文展示具体标题、`what_happened`、紧凑 `why_it_matters`、`evidence_level` 和来源链接，并使用 `**加粗**` / `==高亮词==` 标重点。高亮词会渲染成加粗变色文字，不是 tag/chip。主体信息只写新闻事实、数据、图表、限制、变化和具体影响，不写对日报自身的“启示/后续跟进/报道口径/扩容建议”。
- 高信号真实模型发布必须纳入 `stories`，`model_releases` 只作为结构化索引和可用性字段集合，不能让主体信息因此减少。
- 遗留编辑报告的扩容通过增加候选池和信源标签分层展示实现，不通过降低高风险事实核验要求实现。正文少于 45 个内容单元时，不凑旧内容；在 legacy `quality_status` 或 `self_check.notes` 写明缺口来源。公共信号流继续保留全部安全记录，不受这个数量或事实门槛影响。

禁止：

- 使用没有来源的数字。
- 只引用二手媒体而不回源。
- 把普通微信公众号、自媒体或聚合摘要当作事实最终来源。
- 把白名单公众号里的融资金额、估值、价格、benchmark、安全事故、监管或模型能力断言当作无须核验的事实。
- 在遗留报告中把没有原始 X status URL 的 X 热点摘要写成已核验事实；公共信号流可以保留该安全记录，但必须标记原始链接缺失、可信度和可追溯性边界。
- 把搜索结果摘要、公众号正文、媒体转载或聚合页直接写成事实来源；搜索命中必须先回到一手 URL 或保留为 `community_lead`。
- 把预测、传闻或情绪化观点写成事实。
- 把没有原文链接或可确认发布日期的博客写入 `hot_blogs`。
- 把 builder 观察计入主体信息数量。
- 官方 docs 页面没有 dated changelog、release note、RSS、commit 或官方 dated post 交叉确认时，不写入主体信息；可降级为社区线索，并固定说明“官方文档状态存在但发布日期待交叉确认”。
- 把 Statuspage、第三方网关上架、preview access、区域/账号开放或模型短时可用性变化写入 `model_releases`；这些默认是 `community_leads` 轻量运营项。
- 漏采 AI 开发工具的计费、配额、成本归因、usage dashboard、Service Quotas、seat/usage-based billing 或 credit 变化。
- 为了视觉覆盖率给普通新闻批量构造 `manual_table`；表格只能来自原文表格、明确结构化数据，或确实适合对比呈现的价格/配额/benchmark/规格/步骤信息。原文有图表时优先引用并缓存原文图片。

博客收录要求：

- `hot_blogs` 必须使用原文链接，且能确认 `event_date`。
- 没有明确发布日期、发布时间或可交叉确认日期的博客，只能作为社区线索或待验证线索，不进入 `hot_blogs`。
- 工程博客、研究博客和设计文章可以来自官方工程博客、研究团队、项目维护者或高质量个人站点；最终链接必须回到原文。
- `hot_blogs[*].summary` 必须是 100-200 个中文字符的文章概括，覆盖核心问题、方法或论证、关键结论、适用场景或局限；公开页面只展示摘要和来源，不渲染 `key_points`，也不要写空泛“为什么重要”。如果原文有直接支撑理解的架构图、流程图、benchmark 图或关键截图，应通过 `evidence_assets` 缓存并贴图；没有信息密度的封面图不贴。
- 访谈和播客如果有原始链接、受访者身份和明确技术/工程内容，可作为 `hot_blogs`、`builder_observations` 或 `community_leads` 候选。
