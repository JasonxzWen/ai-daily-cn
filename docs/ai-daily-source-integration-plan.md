# AI 日报三层信源接入开发计划

<!-- curated-edition-contract-ref:v1 -->

> **术语与状态说明（2026-07-15）：** 本文“三层”是 RSS/公开页面、API/搜索、RSS 生成/聚合三类采集传输，不是新的三层数据生命周期。采集适配器与安全规则继续作为当前实现输入；公共成员资格目标已由 [AI Daily 精选首页三层迁移规格](ai-daily-curated-homepage-migration-spec.md) 替换为 `raw_observation → admitted_signal → edition_item`。聚合/newsletter 的具体内容页可以直接成为材料，发现外部材料时则与真实发布者分开记为采集器。Aify 首页「今日精选」必须迁到专用 HTML adapter，原样解析上游有序 title/description/link/tag payload 并绕过二次语义处理；当前全量 `articles.json/search_api/community_lead` 路径只属于待替换 runtime，不能定义目标行为。本文余下的无准入公共流规则是迁移基线，不是未来首页权威。

> **2026-07-14 适用范围：公共监听优先。** 公共 occurrence 存储和 `docs/signals/**` 受 `public-signal-stream-contract:v1` 约束：凡能安全标准化的发现记录都应持久化并公开，不设来源等级、内容类别、可信度、健康状态、访问方式、新鲜度、观察期或人工复核准入门槛，也不设单源配额或总量上限。来源、内容、可信度、健康和访问状态只用于标签、筛选与诊断。
>
> 本文提到的事实核验、选题、合并、去重和篇幅规则，只能用于下游可选的 **legacy edited report**。它不能删除、延迟、降级、重排公共 occurrence，也不能成为公共监听 authority。需要账号、密钥或自托管地址的来源若暂时不可访问，应记录访问/健康状态；这是技术可达性，不是内容准入。

## 目标

把 AI 日报的发现面扩展成三层持续监听系统：

1. RSS / 公开页面：持续检查官方博客、工程博客、个人站点、科技媒体、社区和中文资讯源。
2. 公开 API / 搜索：用 Hacker News、GDELT、OpenAlex、arXiv，以及已配置凭据的搜索服务补充发现面。
3. RSS 生成 / 聚合：用 RSSHub、RSS-Bridge、Miniflux/FreshRSS 接入无原生 RSS 的公开页面、播客和 curated feed。

扩展原则是“先记录，再标注，再呈现”。未知或较弱的元数据使用兜底标签，不因无法证明权威性、重要性或一手性而丢弃记录。

## 公共监听合同

公共路径按以下顺序工作：

1. 发现器读取所有当前技术上可访问且允许抓取的已配置来源。
2. 每次观察生成独立 occurrence；同一 URL 被不同来源或不同时间观察到时仍保留独立观察身份。
3. 标准化 source、content、credibility、health、access 标签；未知值映射到公开兜底标签。
4. 写入不可变 occurrence 存储。
5. 从 occurrence 投影 `docs/signals/**`，按来源属性分板块，默认按时间排序并分页。
6. 下游可选编辑报告从同一存储读取副本；其失败不影响公共信号发布。

以下规则明确禁止用于公共 occurrence 成员判断：

- `core` / `optional` / `manual` 等历史 enablement 分级；
- `T0`–`T3`、authority 或 verification 状态；
- 单源候选数、页面条数、总候选数或“热门 Top N”；
- 48/72 小时、`lookback_days`、观察期、连续运行达标期；
- “先影子运行再升格”、人工批准、质量评分或正文栏目的容量；
- 因重复 URL、低相关性、弱可信度或中介来源进行的静默删除。

传输层可以分页、限速、重试和断点续跑，但这些机制不得被解释为内容配额；尚未拉取的记录应留待后续拉取，而不是被算作不准入。

## 信源注册规范

注册表字段只描述“怎么获取”和“怎么展示”，不决定公共成员资格：

- `source_kind`：抓取适配器，例如 `rss`、`html_index`、`github_report_markdown`、`rsshub`、`rss_bridge`、`aggregator`、`search_api`。
- `candidate_category`：采集适配提示；公共输出归一化为标准 content tag。
- `source_group`、`content_tags`、`credibility_tag`：注册表直接声明的非评分标签，只用于分板块、筛选和解释。
- 注册表不再接受或输出 `tier`、`authority`、`verification_policy`、`enablement` 或 `source_level`。历史 candidate、report 或 occurrence 导入仍可在边界读取旧分类元数据并映射为公开标签，但不得回写注册表。
- `requires_original_url`：用于判断能否提供 direct link。缺少原始链接时可使用安全的来源/中介链接，并标记 `indirect`、`unverified` 或 `original_url_missing`；不得因此静默丢弃可安全标准化的观察。

`sources:validate` 只校验配置结构、URL 和适配器契约，不评价来源是否“够好”、是否可以公开监听。

## 公开标签

每条公开记录至少可以表达以下维度；标签不参与准入、配额和默认排序：

- 来源：官方博客、GitHub、社区、媒体/Newsletter、X/Builder、论文/模型、其他。
- 内容：发布、研究、项目、观点、讨论、榜单、教程、融资/产业等。
- 可信度：官方/原始、直接来源、二手来源、社区线索、未核验、未知。
- 健康：正常、无新条目、受限、失败、未知。
- 访问：直接、间接、需要凭据、需要自托管、不可达、未知。

标签必须能处理新枚举和未知值。新增来源不应因为 schema 尚未认识其精细类别而从公共流消失。

## 发现器规范

- 网络失败、408、429、5xx 可有界重试，并记录 health/access 状态。
- API key 只从环境变量读取；日志、公开数据和审计不得输出 token、鉴权 header 或签名 URL。
- 搜索结果、聚合条目、媒体报道和社区帖子都可以生成公共 occurrence；原始内容、来源链接和中介关系应尽量保留。
- 同一事件的不同观察不在公共存储中做故事级去重。确需合并同一次抓取产生的完全相同行时，必须保留可证明的 observation identity 和合并计数。
- 抓取批大小、API page size、并发数和超时属于传输参数，不是单源贡献上限。
- 运行预算耗尽时应保存已完成进度并可恢复；不得按来源等级静默截断剩余来源。

## 搜索与公开 API

搜索不是只供“影子观察”的隔离层。只要结果可安全标准化，就与 RSS 观察一样进入 occurrence 存储，并通过标签说明其来源和可信度。

- 无 key 可用：Hacker News、GDELT、OpenAlex、arXiv、Hugging Face 公开 API 等。
- 有 key 后可用：Brave、Tavily、Exa、SerpAPI、Semantic Scholar 等。
- 缺 key 只表示该 provider 当前 `access: credential_required`，不影响其他 provider，也不构成来源资格判断。
- provider 的 `limit` / page size 只是单次请求页大小；应支持翻页或后续恢复，不能充当公共输出上限。
- 搜索摘要可以作为观察内容，但必须标明搜索/中介来源；读取到目标页后可补 direct link 和更高可信度标签。

legacy edited report 若要把搜索命中改写成事实故事，可以另外要求一手或多源确认；该要求不回写公共 occurrence。

## RSSHub、RSS-Bridge 与聚合器

- RSSHub：用于公开且允许抓取的 X/YouTube/播客/Product Hunt/GitHub 等路由；优先保留原始条目 URL。
- RSS-Bridge：用于无 RSS 的公开网页和 newsroom/专题页。
- Miniflux/FreshRSS：用于聚合、保存抓取历史和输出 curated feed。
- 缺少自托管 base URL 时标记 `access: self_hosted_endpoint_required`；配置后立即参与监听，不需要稳定观察期或升格审批。
- 公共实例不稳定、目标站阻断或 ToS 不允许自动抓取时记录状态并停止该次访问；不得伪造内容或把状态扩散成其他来源的发布阻断。

## 第一批来源目录

下表按来源属性组织，不表示优先级或启用等级。表内所有公开、合法且技术可访问的来源都应被监听。

### 官方、工程与研究

| Source | URL | 公开标签建议 |
|---|---|---|
| Apple Machine Learning Research | `https://machinelearning.apple.com/rss.xml` | 官方 / 研究 |
| NVIDIA Developer Blog | `https://developer.nvidia.com/blog/feed/` | 官方 / 工程 |
| AWS Machine Learning Blog | `https://aws.amazon.com/blogs/machine-learning/feed/` | 官方 / 工程 |
| Azure Blog | `https://azure.microsoft.com/en-us/blog/feed/` | 官方 / 工程 |
| Meta Engineering | `https://engineering.fb.com/feed/` | 官方 / 工程 |
| Cloudflare Blog | `https://blog.cloudflare.com/rss/` | 官方 / 工程 |
| Nature Machine Learning | `https://www.nature.com/subjects/machine-learning.rss` | 研究 / 出版物 |

### 媒体、Newsletter 与行业观察

| Source | URL | 公开标签建议 |
|---|---|---|
| MIT Technology Review AI | `https://www.technologyreview.com/topic/artificial-intelligence/feed/` | 媒体 / 二手来源 |
| VentureBeat AI | `https://venturebeat.com/category/ai/feed` | 媒体 / 二手来源 |
| Wired AI | `https://www.wired.com/feed/tag/ai/latest/rss` | 媒体 / 二手来源 |
| The New Stack | `https://thenewstack.io/feed` | 媒体 / 工程 |
| Latent Space | 公开 Newsletter / podcast feed | Newsletter / 观点 |
| Interconnects | 公开文章 feed | Newsletter / 观点 |

### 社区与趋势

| Source | URL | 公开标签建议 |
|---|---|---|
| Hacker News official | `https://news.ycombinator.com/rss` | 社区 / 讨论 |
| HNRSS frontpage | `https://hnrss.org/frontpage` | 聚合 / 社区 |
| HNRSS AI query | `https://hnrss.org/newest?q=AI` | 聚合 / 社区 |
| Reddit MachineLearning | `https://www.reddit.com/r/MachineLearning/.rss` | 社区 / 需要确认访问状态 |
| Reddit LocalLLaMA | `https://www.reddit.com/r/LocalLLaMA/.rss` | 社区 / 需要确认访问状态 |
| Hugging Face Trending / Daily Papers | 公开 API / 页面 | 模型、论文 / 趋势 |
| GitHub Trending / Releases | 公开页面 / API | GitHub / 项目 |

### 中文与中介来源

| Source | URL | 公开标签建议 |
|---|---|---|
| 36Kr | `https://www.36kr.com/feed` | 媒体 / 二手来源 |
| 量子位 | `https://www.qbitai.com/feed` | 媒体 / 二手来源 |
| 雷峰网 | `https://www.leiphone.com/feed` | 媒体 / 二手来源 |
| InfoQ 中文 | `https://www.infoq.cn/feed` | 媒体 / 工程 |
| 少数派 | `https://sspai.com/feed` | 媒体 / 产品体验 |
| 爱范儿 | `https://www.ifanr.com/feed` | 媒体 / 行业观察 |

这些来源不因“中介”身份被排除。公共卡片展示原链接、摘要和可信度标签；若下游 legacy edited report 要写确定性事实，再独立回溯原始公告或多源证据。

## 实施与验收

### 公共路径 P0

- 每个可安全标准化的发现记录先写 occurrence，再执行任何 legacy 编辑逻辑。
- occurrence 输入数满足守恒：`input = occurrence + coalesced + normalization_error`。
- `docs/signals/**` 全部分页并集与 occurrence 投影一致；分页只是导航机制，不是数量上限。
- 来源、内容、可信度、健康和访问标签的任意合法/未知值都不改变成员资格或默认时间排序。
- 缺凭据、来源阻断和 legacy 报告失败不会阻止已有公共 occurrence 发布。

### 来源扩展 P1

- 官方、GitHub、社区、媒体/Newsletter、X/Builder、论文/模型等来源组均有公开、合法来源。
- 搜索和聚合来源不需要观察期；可访问后直接产出带标签 occurrence。
- 健康检查回答“当前能否访问、最后成功时间、失败原因”，不回答“是否准入”。
- 运行时 page size、超时、并发和重试有明确诊断，但不存在单源内容配额。

### legacy edited report 边界

legacy 报告可为事实故事使用一手/多源核验、相关性排序、合并、去重、时间窗口和篇幅控制。所有这些规则都必须：

1. 在 occurrence 持久化之后运行；
2. 只改变 legacy 报告自身；
3. 不删除或改写 occurrence；
4. 失败时仍允许公共信号流独立发布。

## 完成定义

- 三层发现来源均可进入公共 occurrence 路径。
- 公共路径无 `core/optional/manual` 准入、无单源/总量配额、无年龄窗口、无影子升格期。
- 来源、内容、可信度、健康和访问属性只作为公开标签、筛选和诊断。
- 所有技术不可达状态都有原因，且不会误伤其他来源或公共发布。
- legacy 编辑报告的选择与事实核验规则已明确隔离，不能成为公共监听 authority。
