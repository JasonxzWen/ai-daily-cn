## 信源优先级

- T0：官方博客、论文、模型卡、GitHub Release、官方 benchmark。
- T1：builder、研究者、founder、maintainer 的原始帖子或视频。
- T2：GitHub、Hugging Face、arXiv、HN、Reddit、Product Hunt、播客原始单集页、可追溯社区讨论。
- T3：媒体报道、微信公众号、自媒体、华尔街见闻、行业资讯站和聚合摘要，只作为发现线索或交叉验证，最终尽量回到 T0/T1/T2。

优先扩展信源：

- 信源注册表：固定源统一维护在 `config/sources/*.json`，新增源必须带 `source_kind`、`candidate_category`、`tier`、`authority`、`enablement` 和 `verification_policy`，并通过 `npm run sources:validate`。默认日报只运行 `core`，`optional/manual` 需要显式启用或用户提供。
- Builder/X/播客：优先使用 `follow-builders central feed`，再回到原始 X URL、公开视频、播客页或个人博客；Follow AI Builders 可作为 builder 名录和标签线索。需要更大 X 覆盖面时，只使用能保留原始 X status URL 的自托管 RSSHub、twscrape、列表导出或等价工具。
- 官方与实验室工程博客：OpenAI News/RSS、Anthropic Engineering/News、Google DeepMind、Google Research、Meta AI、Microsoft Research、Hugging Face Blog。
- 广义科技、大厂和行业趋势：TechCrunch AI/Enterprise、The Verge AI/main、Ars Technica、Google Keyword Blog、Official Microsoft Blog、Apple Newsroom、Meta Newsroom、Amazon News 等可以作为候选源；只有当它们影响 AI 供给、开发者工作流、平台政策、算力/云、产品分发、监管或产业结构时才入选。
- 高质量个人/社区技术博客与访谈：Latent.Space、Interconnects、Simon Willison、Chip Huyen、Karpathy、BAIR Blog，以及对 OpenAI、Anthropic、Google、Meta 等大型实验室工程师的原始访谈或 transcript。
- 产品发现：Product Hunt、新产品榜单、项目官网和 GitHub README 可作为候选源；最终事实尽量回到产品官网、GitHub、官方文档或原始发布页。
- 播客平台：小宇宙、喜马拉雅等只作为具体节目或单集发现入口；最终需要单集页、RSS episode、原始音频或可信 transcript。
- 中介媒体：微信公众号、自媒体和行业媒体是重要线索源，但不是最终报道实体；必须先尝试拿到其引用的一手信源。无法回源时只进入 `community_leads` 并标记待验证。
- 聚合站：Planet AI、RSS 索引仓库等只作发现和交叉验证，最终链接尽量回到原文。

禁止：

- 使用没有来源的数字。
- 只引用二手媒体而不回源。
- 把微信公众号、自媒体或聚合摘要当作事实最终来源。
- 使用没有原始 X status URL 的 X 热点摘要。
- 把搜索结果摘要、公众号正文、媒体转载或聚合页直接写成事实来源；搜索命中必须先回到一手 URL 或保留为 `community_lead`。
- 把预测、传闻或情绪化观点写成事实。
- 把没有原文链接或可确认发布日期的博客写入 `hot_blogs`。
- 把 builder 观察计入主体信息数量。
- 官方 docs 页面没有 dated changelog、release note、RSS、commit 或官方 dated post 交叉确认时，不写入主体信息；可降级为社区线索，并固定说明“官方文档状态存在但发布日期待交叉确认”。

博客收录要求：

- `hot_blogs` 必须使用原文链接，且能确认 `event_date`。
- 没有明确发布日期、发布时间或可交叉确认日期的博客，只能作为社区线索或待验证线索，不进入 `hot_blogs`。
- 工程博客、研究博客和设计文章可以来自官方工程博客、研究团队、项目维护者或高质量个人站点；最终链接必须回到原文。
- `hot_blogs[*].summary` 必须是 300-500 字中文内容摘要，覆盖核心问题、方法或论证、关键结论、适用场景或局限；不要写“为什么重要”。
- 访谈和播客如果有原始链接、受访者身份和明确技术/工程内容，可作为 `hot_blogs`、`builder_observations` 或 `community_leads` 候选。
