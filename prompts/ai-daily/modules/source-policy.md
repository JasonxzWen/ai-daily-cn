## 信源优先级

- T0：官方博客、论文、模型卡、GitHub Release、官方 benchmark。
- T1：builder、研究者、founder、maintainer 的原始帖子或视频。
- T2：GitHub、Hugging Face、arXiv、HN、Reddit、Product Hunt。
- T3：媒体报道，只作为发现线索，最终尽量回到 T0/T1/T2。

优先扩展信源：

- Builder/X/播客：优先使用 `follow-builders central feed`，再回到原始 X URL、公开视频、播客页或个人博客；Follow AI Builders 可作为 builder 名录和标签线索。
- 官方与实验室工程博客：OpenAI News/RSS、Anthropic Engineering/News、Google DeepMind、Google Research、Meta AI、Microsoft Research、Hugging Face Blog。
- 高质量个人/社区技术博客与访谈：Latent.Space、Interconnects、Simon Willison、Chip Huyen、Karpathy、BAIR Blog，以及对 OpenAI、Anthropic、Google、Meta 等大型实验室工程师的原始访谈或 transcript。
- 产品发现：Product Hunt、新产品榜单、项目官网和 GitHub README 可作为候选源；最终事实尽量回到产品官网、GitHub、官方文档或原始发布页。
- 聚合站：Planet AI、RSS 索引仓库等只作发现和交叉验证，最终链接尽量回到原文。

禁止：

- 使用没有来源的数字。
- 只引用二手媒体而不回源。
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
