# AI 日报三层信源接入开发计划

## 目标

把 AI 日报的发现面扩展成三层稳定系统：

1. 默认 RSS / 新闻源：每天自动检查官方、工程博客、科技媒体、社区和中文中介源。
2. 新闻 / 搜索工具：用 GDELT、Brave、Tavily、Exa、SerpAPI、OpenAlex、Semantic Scholar、arXiv 等补漏和回源。
3. RSS 生成 / 聚合工具：用自托管 RSSHub、RSS-Bridge、Miniflux/FreshRSS 接入 X、公众号、播客、无 RSS 页面和内部 curated feed。

核心边界不变：公众号、自媒体、聚合站、X 热点和搜索结果都是发现线索；事实性入选必须优先回到一手来源。

## 当前执行落点

本计划已落到以下仓库能力：

- `config/sources/*.json`：配置化信源注册表，区分 `core`、`optional`、`manual`。
- `schemas/sources.schema.json` 与 `npm run sources:validate`：校验新增源必须带 `source_kind`、`candidate_category`、`tier`、`authority`、`enablement`、`verification_policy`。
- `npm run discover:content-sources`：默认运行 `core,optional`，覆盖广义科技、Product Hunt 和聚合源；公众号/中文自媒体等 `manual` 来源需要显式打开或人工录入。
- `npm run discover:search-news -- --shadow`：GDELT、OpenAlex、arXiv 默认影子运行；Brave/Tavily/Exa/SerPAPI/Semantic Scholar 只在有环境变量时启用。
- `npm run sources:health`：检查配置源 HTTP 状态、feed 形态、近 48 小时条目数和原始 URL 要求。
- `npm run sources:audit-merge`：把独立发现命令输出的 `source_audit` 固定组合并进最终日报 JSON，避免 Phase 5 只能看到临时 stdout。
- `npm run sources:phase5-audit`：读取最近 N 个 `reports-data` 日报和候选池，判断连续运行验证是否达标。
- 候选池支持 `intermediary_url`、`primary_url`、`original_url`、`verification_status`、`verification_sources`；`report:write` 会阻止未完成一手/多源核验的中介候选进入事实栏目。

## 本轮 Grill-Me 修订

这轮压测后，最需要修改的是五个会直接影响健壮性的地方：

1. **把“命令跑过”改成“日报 JSON 留痕”**：`discover:search-news` 和 `sources:health` 的 stdout 不算连续运行证据，必须通过 `sources:audit-merge` 或等价写入流程合并进最终 `reports-data/YYYY/MM/YYYY-MM-DD.json` 的 `source_audit.search_sources` 与 `source_audit.sources_health`。否则 Phase 5 会持续显示缺审计组。
2. **把“计划阶段”拆成状态表**：Phase 0-4 可以用单测和命令证明已落地；Phase 5 只能用连续日报日证明，不能因为当天 `npm run validate` 通过就宣称完成。
3. **把“搜索补漏”固定为影子运行**：搜索命中只能先进入候选池和审计；进入事实栏目必须另有 `primary_confirmed` 或 `multi_source_confirmed`。
4. **把“内容质量”纳入验收**：高信源不等于高信息熵。每条公开内容必须有具体事实锚点、变化、限制或工程用途；泛化判断和执行痕迹不得进入正文。
5. **把“重点标注”作为渲染能力计划**：正文 Markdown 已支持 `**加粗**` 和 `==高亮==`；卡片类 body 也需要安全 inline Markdown 后才能要求每日草稿稳定使用重点标注。

修订后的关键口径：发布当天可以在 `phase5_complete:false` 时继续发布，但不能宣称 Phase 5 完成；公开日报必须说明缺的是日报天数、必要审计组，还是中介/T3 候选误入事实栏目。

## Grill-Me 结论

这版计划最需要修的不是“再加更多源”，而是下面几个落地风险：

1. 范围过大：默认 RSS、搜索 API、自托管 RSS 工具同时推进，容易变成一次性大改，失败时很难定位是哪一层引入噪音。
2. 字段语义混乱：原计划用 `category` 同时表达 source 类型和 candidate 目标区，后续会让质量门难以判断“这是来源属性还是入选栏目”。
3. 搜索工具太容易放大噪音：GDELT、Brave、Tavily、Exa 等应该先影子运行，只写审计和候选，不直接影响日报正文。
4. 验收不够可重复：只说“能生成 feed”“能检查 N 类源”不够，必须区分离线 fixture 测试、在线 smoke 测试和连续运行指标。
5. 缺少运行预算：源越多越慢、越贵、越容易被限流。必须定义超时、并发、候选上限和 API key 缺失时的降级行为。
6. 回源结果没有结构化：只靠 notes 记录“已回源”不可审计，后续应增加 `primary_url`、`intermediary_url`、`verification_status` 等字段或等价结构。

因此实施策略改为：先配置化和核心 RSS，搜索工具只影子运行，自托管工具只在显式配置后启用，最后再把质量门收紧。

## 非目标

- 不一次性默认启用所有新闻、社区、中文媒体和搜索工具。
- 不把搜索摘要、公众号正文、媒体转载或 X 热点写成事实来源。
- 不要求公开日报新增固定“搜索发现”“Twitter 热点”“Product Hunt”大栏目；它们先按质量进入已有栏目。
- 不把依赖 API key 的 provider 作为日报生成硬依赖。

## 开发规范

### 1. 信源注册规范

后续应把硬编码的默认源逐步迁到配置化注册表，例如 `config/sources/*.json`。每个 source 至少包含：

```json
{
  "id": "content-apple-machine-learning",
  "name": "Apple Machine Learning Research",
  "url": "https://machinelearning.apple.com/rss.xml",
  "source_kind": "rss",
  "candidate_category": "hot_blog",
  "tier": "T0",
  "authority": "primary",
  "enablement": "core",
  "verification_policy": "primary_allowed",
  "requires_original_url": false,
  "max_items_per_run": 3,
  "timeout_ms": 15000,
  "notes": "Official Apple ML research feed."
}
```

字段规则：

- `source_kind` 描述怎么抓取：`rss`、`html_index`、`rsshub`、`rss_bridge`、`aggregator`、`search_api`、`manual`.
- `candidate_category` 描述默认候选去向：`hot_blog`、`project`、`community_lead`、`builder_observation`、`main_item`。
- `tier` 描述信源优先级：`T0` 官方/论文/release，`T1` 原始 builder，`T2` 平台/社区/产品榜，`T3` 媒体/自媒体/聚合。
- `authority` 描述事实权威性：`primary`、`secondary`、`intermediary`、`aggregator`、`community`。
- `enablement` 描述默认启用策略：`core` 默认每日运行，`optional` 只在配置开启或专项运行时检查，`manual` 只作为人工/临时输入。
- `verification_policy` 描述升格门槛：
  - `primary_allowed`：可直接作为一手候选，但仍需去重和新鲜度检查。
  - `primary_required`：必须解析出一手 URL 才能进入事实栏目。
  - `multi_source_required`：融资、并购、监管或传闻类至少需要官方/投资方/监管文件或两个独立可信来源。
  - `community_only`：只能进入 `community_lead` 或被丢弃。
- `requires_original_url:true` 的源必须在候选 `url` 或 `original_url` 中保留原始 URL。
- 新增源必须带离线 fixture 测试；在线可用性只作为 smoke，不作为唯一验收。

兼容要求：当前 `src/discovery.js` 可继续接受旧字段 `category`，但新配置和新测试应使用 `source_kind` / `candidate_category`，避免继续扩大歧义。

### 2. 候选回源字段规范

为了让质量门可执行，后续候选应逐步增加这些字段，旧候选可缺省：

```json
{
  "url": "https://openai.com/news/example",
  "source": "WeChat Tech Media Example",
  "intermediary_url": "https://mp.weixin.qq.com/s/example",
  "primary_url": "https://openai.com/news/example",
  "original_url": "https://x.com/example/status/1234567890",
  "verification_status": "primary_confirmed",
  "verification_sources": [
    "https://openai.com/news/example"
  ]
}
```

允许的 `verification_status`：

- `primary_confirmed`：已回到官方、论文、GitHub release、监管文件、公司公告、投资方公告或原始帖子。
- `multi_source_confirmed`：两个以上独立可信来源确认，但没有更直接一手源。
- `intermediary_only`：只有媒体、公众号、自媒体或聚合站。
- `original_social_only`：只有原始 X/Reddit/HN 等社区帖。
- `unverified`：尚未核验。

升格规则：

- `main_items`、`model_releases`、事实性 `projects` 必须是 `primary_confirmed` 或 `multi_source_confirmed`。
- `hot_blogs` 必须是原文链接，不能只指向聚合页。
- `builder_observations` 可以是 `original_social_only`，但必须保留 `original_url`。
- `community_leads` 可以保留 `intermediary_only`，但公开文案必须标明待验证或只作为线索。

### 2a. 日报 source_audit 合同

连续运行验收只读取最终日报 JSON，不读取临时命令输出。因此每天写入 `reports-data/YYYY/MM/YYYY-MM-DD.json` 前，必须把各发现命令的审计结果合并进同一个 `source_audit`：

```json
{
  "github_trending": { "checked": true, "sources": [], "candidates_found": 0, "included": 0, "notes": "" },
  "builder_sources": { "checked": true, "sources": [], "candidates_found": 0, "included": 0, "blocked_reason": "", "last_successful_feed_at": null, "notes": "" },
  "content_sources": { "checked": true, "sources": [], "candidates_found": 0, "included": 0, "notes": "" },
  "search_sources": { "checked": true, "sources": [], "candidates_found": 0, "included": 0, "shadow": true, "notes": "" },
  "sources_health": { "checked": true, "sources": [], "candidates_found": 0, "included": 0, "notes": "" }
}
```

规则：

- `github_trending`、`builder_sources`、`content_sources` 是内容候选证据。
- `search_sources` 是补漏和回源证据；`shadow:true` 表示默认不自动升格入正文。
- `sources_health` 是发现面可用性证据；不产生内容候选也必须记录。
- `sources[].status` 允许 `checked`、`no_signal`、`blocked`、`skipped_missing_token`、`skipped_missing_base_url`、`skipped_manual_source`、`skipped_manual_review_required`；跳过类状态必须写在 `notes` 或 status 中，不能静默缺失。
- 只有这些组出现在最终日报 JSON 中，`sources:phase5-audit` 才能把当天算作连续运行证据。

独立发现命令输出可用以下命令合并；该命令只改 `source_audit`，写回前会校验 report schema，不改正文和候选池：

```powershell
npm run sources:audit-merge -- --date YYYY-MM-DD --input .tmp/search-news-YYYY-MM-DD.json,.tmp/sources-health-YYYY-MM-DD.json
```

### 3. 发现器规范

所有发现命令遵守同一行为：

- 网络失败、408、429、5xx 默认延迟重试一次，结果写入 `source_audit.sources[].notes`。
- 单源默认最多贡献 3 条候选，避免大源挤掉长尾源；需要调整时用 `--per-source-limit`。
- 每个候选必须有 `source_id`、`category`、`title`、`url`、`source`、`event_date`、`status`、`evidence`。
- 所有入选条目必须回指 `.tmp/source-candidates-YYYY-MM-DD.json` 中 `status:"included"` 的候选。
- 发现器只能产生候选；是否进入日报正文由质量门和人工/模型筛选决定。
- 每个 provider 必须有 `timeout_ms`，默认 15 秒；单个 provider 超时不阻塞整轮日报生成。
- 整体发现流程默认运行预算为 5 分钟；超出预算时按源优先级停止低优先级源，并在 `source_audit` 记录 `budget_exceeded`。
- API key 缺失时 provider 状态为 `blocked` 或 `skipped_missing_token`，不得让日报失败。

### 4. 搜索工具规范

搜索工具不是替代 RSS，而是用于：

- 检查是否漏掉重大新闻。
- 为中介来源追一手来源。
- 给融资、监管、事故、产品发布做多源确认。
- 给论文和研究趋势补 citation / recency / related work。

实现上建议新增统一命令：

```powershell
npm run discover:search-news -- --date YYYY-MM-DD --providers gdelt,openalex --queries config/search-queries.json --limit 40 --shadow
```

Provider 规则：

- 无 key provider 可影子运行：GDELT、OpenAlex、arXiv、HNRSS。
- 有 key provider 可选启用：Brave、Tavily、Exa、SerpAPI、Semantic Scholar。
- API key 只从环境变量读取，例如 `BRAVE_SEARCH_API_KEY`、`TAVILY_API_KEY`、`EXA_API_KEY`、`SERPAPI_API_KEY`、`SEMANTIC_SCHOLAR_API_KEY`。
- 日志和 `source_audit` 不得输出 token、完整鉴权 header 或带签名 URL。
- 搜索命中默认产出 `community_lead`；不要引入新的 `search_lead` 枚举，除非先更新 schema、parser 和 coverage gate。
- 搜索 provider 先连续 3 次影子运行，只写候选池和审计，不允许自动升格；通过质量指标后再允许参与正文筛选。

### 5. RSSHub / RSS-Bridge / 聚合器规范

自托管工具只负责把不稳定页面转成可审计 feed，不改变来源等级。

- RSSHub：用于 X、YouTube、播客平台、Product Hunt 补充路由、GitHub release/search 等。X 路由必须保留原始 status URL。
- RSS-Bridge：用于没有 RSS 的网页、中文媒体专题页、公众号镜像页、公司 newsroom 页面。
- Miniflux/FreshRSS：用于内部聚合、去重、打标签、保存抓取历史和输出 curated feed。
- 公共 RSSHub/RSS-Bridge 实例不得作为默认生产依赖；默认只允许用户显式配置自托管 base URL。
- 遵守目标站点 robots/ToS、合理 User-Agent、低并发和缓存；抓取失败不得重试轰炸。

计划中的统一命令：

```powershell
npm run sources:health -- --sources config/sources --date YYYY-MM-DD
```

健康检查必须输出：

- HTTP status / fetch error。
- 是否 feed-like。
- 近 48 小时条目数。
- 是否包含原始链接。
- 是否命中 `verification_policy` 或 `requires_original_url` 规则。
- 是否超过超时、速率或候选上限。

## 第一批接入源

第一批源分成三种启用级别：

- `core`：默认每日运行。
- `optional`：健康检查和专项扩展时运行；连续稳定后再进入 core。
- `manual`：只作为用户给定链接、搜索命中或临时 sources 文件输入。

### Core：官方 / 工程 / 研究源

| Source | URL | Tier | 处理 |
|---|---|---:|---|
| Apple Machine Learning Research | `https://machinelearning.apple.com/rss.xml` | T0 | 可直接作为研究/工程博客候选 |
| NVIDIA Developer Blog | `https://developer.nvidia.com/blog/feed/` | T0 | 重点看推理、CUDA、GPU、TensorRT、GenAI |
| AWS Machine Learning Blog | `https://aws.amazon.com/blogs/machine-learning/feed/` | T0 | 云与企业 AI 供给 |
| Azure Blog | `https://azure.microsoft.com/en-us/blog/feed/` | T0 | Azure AI、Copilot、企业云 |
| Meta Engineering | `https://engineering.fb.com/feed/` | T0 | 工程、infra、AI 系统 |
| Cloudflare Blog | `https://blog.cloudflare.com/rss/` | T0/T2 | AI Gateway、Workers、网络/安全基础设施 |
| Nature Machine Learning | `https://www.nature.com/subjects/machine-learning.rss` | T0/T2 | 研究发现；入选前看论文或原文 |

### Optional：科技媒体 / 行业源

| Source | URL | Tier | 处理 |
|---|---|---:|---|
| MIT Technology Review AI | `https://www.technologyreview.com/topic/artificial-intelligence/feed/` | T3 | 发现源，事实回官方/论文 |
| VentureBeat AI | `https://venturebeat.com/category/ai/feed` | T3 | 产品/企业 AI 线索，需回源 |
| Wired AI | `https://www.wired.com/feed/tag/ai/latest/rss` | T3 | 行业与政策线索，需回源 |
| The New Stack | `https://thenewstack.io/feed` | T3 | 云原生/开发者工具线索，需回源 |

### Optional：社区 / 趋势源

| Source | URL | Tier | 处理 |
|---|---|---:|---|
| Hacker News official | `https://news.ycombinator.com/rss` | T2 | 发现源 |
| HNRSS frontpage | `https://hnrss.org/frontpage` | T2 | 可加 points/comment 过滤 |
| HNRSS AI query | `https://hnrss.org/newest?q=AI` | T2 | 关键词发现，避免直接写事实 |
| Reddit MachineLearning | `https://www.reddit.com/r/MachineLearning/.rss` | T2/T3 | 社区线索 |
| Reddit LocalLLaMA | `https://www.reddit.com/r/LocalLLaMA/.rss` | T2/T3 | 开源模型/本地推理线索 |

### Manual / Optional：中文中介源

| Source | URL | Tier | 处理 |
|---|---|---:|---|
| 36Kr | `https://www.36kr.com/feed` | T3 | 中介线索，融资/商业化需回源 |
| 量子位 | `https://www.qbitai.com/feed` | T3 | 中介线索，技术事实需回源 |
| 雷峰网 | `https://www.leiphone.com/feed` | T3 | 中介线索 |
| InfoQ 中文 | `https://www.infoq.cn/feed` | T3 | 技术线索，尽量回原始公告/项目 |
| 少数派 | `https://sspai.com/feed` | T3 | 产品体验/工具线索 |
| 爱范儿 | `https://www.ifanr.com/feed` | T3 | 产品/行业线索 |

中文源默认 `authority:"intermediary"`、`verification_policy:"primary_required"`，只能先进入 `community_lead`。

## 搜索 / 新闻工具接入计划

### Provider 优先级

1. GDELT：影子运行，覆盖全球新闻和多语言报道；用于“是否有多源报道”。
2. OpenAlex + arXiv：影子运行，覆盖研究趋势；用于论文、benchmark、模型方法。
3. Brave Search：有 key 时影子运行，作为通用 web/news 搜索。
4. Tavily：有 key 时影子运行，适合 agent 检索和按 domain include/exclude。
5. Exa：有 key 时影子运行，适合语义搜索原始博客、产品页和论文。
6. SerPAPI / Google News：有 key 时影子运行，作为新闻补漏，不作为唯一证据。
7. Semantic Scholar：有 key 时影子运行，补 citation、相关论文、TLDR；无 key 可限制速率试用。

### 查询集

建议维护 `config/search-queries.json`：

```json
[
  {
    "id": "frontier-labs-release",
    "query": "(OpenAI OR Anthropic OR Google DeepMind OR Meta AI OR xAI OR Mistral) (release OR launches OR announces)",
    "candidate_category": "community_lead",
    "verification_policy": "primary_required",
    "allowed_primary_domains": ["openai.com", "anthropic.com", "deepmind.google", "ai.meta.com", "x.ai", "mistral.ai"]
  },
  {
    "id": "ai-infra-business",
    "query": "(NVIDIA OR AWS OR Azure OR Google Cloud OR Cloudflare) (AI OR agent OR inference OR GPU)",
    "candidate_category": "community_lead",
    "verification_policy": "primary_required"
  },
  {
    "id": "ai-funding-ma",
    "query": "(AI startup OR foundation model OR agent) (funding OR acquisition OR IPO)",
    "candidate_category": "community_lead",
    "verification_policy": "multi_source_required"
  },
  {
    "id": "ai-papers-systems",
    "query": "(LLM OR agent OR inference OR evaluation OR retrieval) published after YYYY-MM-DD",
    "candidate_category": "community_lead",
    "providers": ["arxiv", "openalex", "semantic_scholar"],
    "verification_policy": "primary_allowed"
  }
]
```

### 搜索候选升格规则

- 搜索结果命中官方域名、论文、GitHub release、产品文档时，可标记 `primary_confirmed`。
- 搜索结果命中媒体/自媒体/聚合站时，只生成 `community_lead`。
- 融资类至少需要官方公告、投资方公告、监管文件或两个独立可信媒体来源；否则不进 `main_items`。
- 搜索工具给出的摘要不得直接复制进日报事实字段；必须读取目标 URL 后再改写。

## RSS 生成 / 聚合接入计划

### 自托管组件

| 组件 | 用途 | 验收 |
|---|---|---|
| RSSHub | X、YouTube、播客、平台页、GitHub 搜索等 route | 自托管 base URL 配置后，至少 5 条源可生成 feed；X 条目保留原始 status URL |
| RSS-Bridge | 无 RSS 网页和中文媒体专题页 | 自托管 base URL 配置后，至少 3 条 CSS/bridge 源可生成 feed |
| Miniflux/FreshRSS | 聚合、去重、标签、历史 | 能导出 curated RSS 或通过 API 读取 unread/tagged entries |

### 配置建议

```json
{
  "id": "x-ai-hotspots-rsshub",
  "name": "RSSHub X AI Hotspots",
  "url": "https://rsshub.example.com/twitter/list/...",
  "source_kind": "rsshub",
  "candidate_category": "community_lead",
  "tier": "T2",
  "authority": "community",
  "verification_policy": "primary_required",
  "requires_original_url": true,
  "enablement": "optional"
}
```

默认不启用需要账号或不稳定公共实例的 route；需要用户配置自托管 URL 后再启用。

## 分阶段实施

### 阶段状态与验收口径

| 阶段 | 当前状态 | 不能混淆的验收口径 |
|---|---|---|
| Phase 0：基线和配置化 | 已有命令与 schema | 以 `npm run sources:validate`、registry fixture 和 `npm run validate` 为准 |
| Phase 1：Core RSS / 新闻源扩容 | 已接入 core/optional/manual | 以 `discover:content-sources` 的候选与 `source_audit.content_sources` 为准 |
| Phase 2：搜索 / 新闻工具影子运行 | 已有 `discover:search-news` | 只证明补漏和审计，不证明可自动进入正文 |
| Phase 3：RSSHub / RSS-Bridge / 聚合器 | 已有健康检查入口 | 以 `sources:health` 和跳过/阻塞原因留痕为准 |
| Phase 4：生成质量门 | 已有候选回源字段和事实栏目门禁 | 以中介候选 fixture 被拒绝、`npm run validate` 通过为准 |
| Phase 5：连续运行验证 | 需要真实连续日报证据；合并命令已补齐 | 只有 `sources:phase5-audit` 返回 `phase5_complete:true` 才算完成 |

### Phase 0：基线和配置化

任务：

- 新增 `config/sources/default-content-sources.json`、`config/sources/intermediary-sources.json`、`config/search-queries.json`。
- 新增 source registry schema，字段使用 `source_kind`、`candidate_category`、`authority`、`enablement`、`verification_policy`。
- `src/discovery.js` 支持从配置读取默认源，同时保留当前硬编码源作为 fallback。
- 增加 `npm run sources:validate`。

验收：

- `npm run validate` 通过。
- registry schema 拒绝缺少 `tier`、`authority`、`candidate_category`、`source_kind`、`url` 的源。
- 当前硬编码默认源和配置默认源输出一致或配置源为超集。
- 旧 `category` 输入仍兼容，但新增 fixture 使用新字段。

### Phase 1：Core RSS / 新闻源扩容

任务：

- 只把官方、工程、研究类 core 源加入每日默认发现。
- 媒体、社区、中文中介源进入 optional/manual 配置，不直接进 core。
- 给每类源补 fixture 和单测。
- `source_audit.content_sources.notes` 输出 core/optional/manual 的检查摘要。

验收：

- `discover:content-sources --limit 80 --per-source-limit 3` 至少检查官方/工程/研究 core 源。
- optional 源只有显式开启时才检查。
- T3 中文/媒体源候选默认是 `community_lead`，并带 `verification_status:"intermediary_only"` 或等价 notes。
- 单源贡献不超过 `--per-source-limit`。

### Phase 2：搜索 / 新闻工具影子运行

任务：

- 新增 provider interface：`search(query, options) -> candidates + source_audit`。
- 首批实现 GDELT、OpenAlex、arXiv；Brave/Tavily/Exa/SerPAPI/Semantic Scholar 按 env key 可选启用。
- 新增 `discover:search-news --shadow` 命令，输出候选池片段和 `source_audit.search_sources`。

验收：

- 无 API key 时命令仍可用，至少运行 GDELT/OpenAlex/arXiv 或明确记录 provider skipped。
- 有 API key 时启用对应 provider，并在 audit 中标明 provider `checked`。
- 影子运行结果不得被 `report:write` 要求引用，也不得自动进入正文。
- token 不出现在 stdout、candidate notes、source_audit 或测试快照中。
- 连续 3 次影子运行记录 precision proxy：候选总数、官方域名命中数、重复率、无日期率。

### Phase 3：RSSHub / RSS-Bridge / 聚合器

任务：

- 增加 `source_kind:"rsshub"`、`source_kind:"rss_bridge"`、`source_kind:"aggregator"` 支持。
- 增加 `sources:health` 命令。
- 支持 Miniflux/FreshRSS API 或 curated RSS 输出作为输入。

验收：

- `sources:health` 能识别 feed-like、非 feed HTML、HTTP 失败和近 48 小时条目数。
- X 类 feed 缺少原始 status URL 时候选数为 0，audit notes 记录 skipped count。
- RSSHub/RSS-Bridge 不可用时不阻塞日报生成，只记录 `blocked` 和失败原因。
- 未配置自托管 base URL 时，相关源状态为 `skipped_missing_base_url`，不是失败。

### Phase 4：生成质量门

任务：

- 扩展 candidate coverage，支持新回源字段和 `source_audit.search_sources`。
- 增加中介源升格检查：没有一手 URL 不得进入 `main_items`、`model_releases`、事实性 `projects`。
- 更新提示词和自动化 runbook。

验收：

- 构造一个公众号/媒体候选直接进 `main_items` 的 fixture，必须失败。
- 构造一个媒体候选带官方公告 URL 且 `verification_status:"primary_confirmed"` 的 fixture，可以通过。
- 构造一个 X 热点缺原始 URL 的 fixture，必须不生成候选。
- 构造一个搜索命中只有媒体 URL 的 fixture，只能进入 `community_lead`。

### Phase 5：连续运行验证

任务：

- 连续 3 个日报日运行扩展发现流程，但不自动放宽入选门槛。
- 每天把 `github_trending`、`builder_sources`、`content_sources`、`search_sources`、`sources_health` 合并进最终日报 JSON 的 `source_audit`。
- 记录每类源 checked / candidates_found / included / skipped_primary_verification。
- 对比旧流程：空板块数量、候选多样性、回源成功率、重复率。
- 每天运行 `npm run sources:phase5-audit -- --date YYYY-MM-DD --history-dir reports-data --days 3`，把结果作为 Phase 5 是否完成的机器证据。

验收：

- 连续 3 次 `npm run validate` 通过。
- `sources:phase5-audit` 返回 `phase5_complete:true`。
- 如果返回 `phase5_complete:false`，当天发布可以继续，但自检或汇报必须列出缺失的日期、审计组和 T3/中介事实栏目泄漏数量。
- `source_audit` 能解释每个空板块，不出现“命令失败但空板块无说明”。
- 每天至少有官方/工程源、社区/项目源、广义科技/媒体源三类被检查，其中媒体/社区源可以是 optional 影子运行。
- T3 源直接进入事实栏目数量为 0；带一手来源升格时，最终条目的 `primary_url` 必须指向 T0/T1/T2 来源。
- 完整发现流程 P95 耗时不超过 5 分钟；超过时低优先级源降级，不阻塞日报。

## 质量指标

每次扩展发现运行都应在 `source_audit` 或后续 telemetry 中记录：

- `sources_checked`：检查源数量，按 `tier` 和 `source_kind` 分组。
- `candidates_found`：候选数量，按 `candidate_category` 分组。
- `primary_verified`：已回源候选数量。
- `intermediary_only`：只能作为中介线索的候选数量。
- `duplicates_removed`：重复 URL / 重复事件数量。
- `skipped_original_url`：缺少原始 X/status/episode URL 被跳过数量。
- `provider_runtime_ms`：每个 provider 运行耗时。
- `provider_cost_units`：如 provider 计费，记录请求数或 credit 估算，不记录 token。

最低验收阈值：

- core RSS 源在线 smoke 成功率连续 3 次不低于 80%。
- T3 候选事实栏目误入率为 0。
- 搜索影子运行候选重复率低于 50%，否则必须先调 query 或 domain 过滤。
- API key 缺失不导致日报生成失败。

## 最终完成定义

该计划完成时应满足：

- 日报发现流程覆盖默认 RSS / 新闻源、搜索工具、RSS 生成/聚合三层。
- 所有新增源可配置、可禁用、可健康检查。
- 自媒体、公众号、媒体和 X 热点不会绕过一手来源门禁。
- `source_audit` 可以回答：查了哪些源、失败了哪些源、重试结果是什么、候选为什么没入选、哪些候选完成一手回源。
- `npm run validate` 通过，且新增 unit/e2e 覆盖三层发现流程。
