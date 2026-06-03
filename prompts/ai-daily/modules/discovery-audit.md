## 发现源与审计

每天生成日报前，必须先完成固定发现面，并把结果写入结构化草稿的 `source_audit`。信源配置来自 `config/sources/*.json`，新增或修改信源后先运行 `npm run sources:validate`。

1. GitHub Trending / 开源趋势面：
   - 必查 `github-ai-trending` 技能规则。
   - 优先运行 `npm run discover:github-trending -- --date YYYY-MM-DD --limit 50 --history-root reports-data`，把输出的 `source_audit.github_trending` 和 `candidates` 作为开源趋势候选池。
   - 如果 shell 网络受限但浏览器可以保存 GitHub Trending HTML 或采样 JSON，改用 `npm run discover:github-trending -- --browser-export <path>`，让同一解析器处理浏览器导出的内容。
   - 至少检查 GitHub Trending daily 与 weekly：`https://github.com/trending?since=daily`、`https://github.com/trending?since=weekly`。
   - 对 AI 工程常用语言补扫 Python、TypeScript、Rust、Go 的 daily/weekly trending。
   - 至少补看一个趋势交叉源：OSSInsight AI / AI Agent Frameworks collection、Trendshift GitHub trending repositories，或等价可访问来源。
   - GitHub Trending 必须单独生成 `github_trending` 板块，默认展示 Top 10 仓库，保留 `rank`、`previous_rank`、`rank_delta`、`trend`（`new`、`up`、`down`、`same`）和 star velocity 证据。展示文案用“GitHub Trending”，不要再写成“GitHub Trending 趋势”；`description` 必须翻译或改写成中文，不要直接复制英文 README/GitHub 描述。
   - 候选项目只有在具备 release、明确 trending 记录、star velocity、notable PR、近期 commit 或可运行 README 时，才能额外进入 `projects`；公开页面只会把匹配 GitHub Trending Top 10 的 `projects` 渲染为对应条目的 `项目 highlight` tag 和行内说明，否则只进入结构化 JSON、`github_trending`、`community_leads` 或丢弃。
   - GitHub trending 来源的 `projects` 必须尽量填写 `event_date`、`source`、`signal`、`evidence`，其中 `signal` 使用 `release`、`star_velocity`、`trending`、`notable_pr`、`ecosystem` 或 `official_update`。

2. Builder 原始源面：
   - 必查 `follow-builders` 技能规则，但不要把二手转述当成 Builder 观察。
   - `npm run discover:builders -- --date YYYY-MM-DD --limit 20` 必须优先检查 `follow-builders central feed` 的 X、podcast、blog JSON；central feed 中带原始 X URL 的内容视为可审计 Builder 一手候选。
   - central feed 不可用时，才退到 raw feed、本地新鲜缓存和固定 RSS/Atom fallback；过期缓存只用于 `last_successful_feed_at` 和阻塞说明，不直接入选。
   - Builder 观察只收录 builder、researcher、founder、maintainer 的原始帖子、个人博客、公开视频或播客片段；没有原始 URL 就不收录。
   - 如果 X/YouTube/feed 无法访问，`builder_observations` 保持空数组，但 `source_audit.builder_sources` 必须记录 `checked:true`、检查过的来源、阻塞状态和原因，并填写 `blocked_reason` 与 `last_successful_feed_at`。
   - 如果 `discover:builders` 解析出候选但最终未入选，必须在 `source_audit.builder_sources.notes` 或 `self_check.notes` 写明过滤口径；不要只把 Builder 计数写成 0。
   - 如果 `discover:builders` 或候选池提供至少 5 条合格 Builder 候选，最终 `builder_observations` 必须入选 5-20 条；少于 5 条属于 Builder 覆盖不足，应写入 `quality_status.degraded_sections`。
   - Builder 条目必须尽量填写 `role`、`event_date`、`source`、`evidence`；不要把 Builder 条目计入 `main_items`。

3. 热门博客、访谈、新产品和广义科技发现面：
   - 至少检查 OpenAI、Anthropic Engineering/News、GitHub Changelog、Google DeepMind/Research、Meta AI、Microsoft Research、Hugging Face Blog 中可访问的官方或工程博客源。
   - AI 日报不局限在狭义 AI：也要检查科技行业、大厂动态、平台政策、开发者生态、算力/芯片、云服务、产品分发和产业趋势。广义来源已注册为 `optional`，包括 TechCrunch AI/Enterprise、The Verge AI/main、Ars Technica、Product Hunt、Latent.Space、Interconnects、Planet AI 等。
   - 至少检查一个高质量博客/访谈聚合源，例如 Latent.Space、Interconnects、Planet AI、Product Hunt、TechCrunch AI、The Verge AI 或 Follow AI Builders。
   - 优先运行 `npm run discover:content-sources -- --date YYYY-MM-DD --limit 60 --per-source-limit 3`，默认检查 `core,optional` 官方/工程/研究源、广义科技/大厂来源、Product Hunt 和聚合源。公众号/中文自媒体等 `manual` 来源必须显式加 `--enablement core,optional,manual` 或通过人工白名单录入。`--per-source-limit` 用于避免单一大源挤掉其他来源。
   - Product Hunt 和新产品榜单只产生候选；入选项目区前必须用官网、GitHub、文档或 README 交叉确认，并补充“领域”和“作用”。
   - Product Hunt 必须同时覆盖 developer-tools feed 和 Product Hunt Trending feed；Product Hunt 本身只证明“上榜/热度”，不证明产品事实。
   - 普通微信公众号、华尔街见闻、自媒体和中文科技媒体默认作为 `category:"intermediary"` 的中介发现源；入选事实性栏目之前，必须先追溯它们引用的一手来源。用户确认的公众号白名单可使用 `source_level:"wechat_primary_like"` 或 `source_level:"wechat_industry_whitelist"`，低风险行业动态可进入 `main_items`，但必须保留公众号名、发布时间、待核验点和风险等级。
   - 小宇宙、喜马拉雅等播客平台只能作为具体节目/单集入口；平台首页或无日期页面不能作为最终来源。小宇宙可通过 RSSHub `/xiaoyuzhou/podcast/:id`；喜马拉雅可通过 RSSHub `/ximalaya/:type/:id/:all/:shownote?`，但通常需要 `XIMALAYA_TOKEN` 且默认不输出 ShowNote，缺少单集、音频、transcript 或授权时说明不可用原因。

4. 热点讨论、播客和融资发现面：
   - 参考飞书周报做法，允许保留“热点讨论”和“融资/商业化”候选，但必须有原始帖子、节目主页、原始音频、公司公告、投资方公告或可信 dated source。
   - 通用 Twitter/X 热议没有稳定 API 时，不要臆造热度；优先使用 follow-builders central feed 中带原始 X URL 的帖子。需要扩展覆盖面时，只使用自托管 RSSHub、twscrape、列表导出或等价工具中能保留原始 `x.com/.../status/...` / `twitter.com/.../status/...` 的 feed，并在 `community_leads` 或 `builder_observations` 标明来源。
   - 播客或访谈必须保留节目主页/原始音频/转录链接之一；没有原始链接不进入 `hot_blogs` 或 `builder_observations`。
   - 融资信息优先放 `community_leads`，只有官方公告或多源交叉确认且影响模型/算力/产品供给时才进入 `main_items`。
   - AI 开发工具计费、配额、成本归因、usage dashboard、Service Quotas、seat/usage-based billing 和 credit 变化是常规候选；影响开发工作流、团队预算、上线容量或采购口径时进 `main_items`，否则进 `community_leads`。

5. 搜索 / 新闻影子发现面：
   - 用 `npm run discover:search-news -- --date YYYY-MM-DD --providers gdelt,openalex,arxiv --queries config/search-queries.json --limit 40 --shadow` 补漏和回源。
   - 搜索结果默认只进入候选池和 `source_audit.search_sources`，不得直接进入正文；连续影子运行质量稳定前，不放宽正文入选门槛。
   - Brave、Tavily、Exa、SerPAPI、Semantic Scholar 只在对应环境变量存在时启用；缺 key 记录 `skipped_missing_token`，不得让日报失败。
   - 搜索命中官方域名、论文、GitHub release 或产品文档时才可标记 `primary_confirmed`；媒体/自媒体/聚合站命中只能作为 `community_lead`。

6. RSSHub / RSS-Bridge / 聚合健康检查：
   - 用 `npm run sources:health -- --date YYYY-MM-DD --sources config/sources --enablement core,optional,manual` 检查 feed 形态、HTTP 状态、近 48 小时条目数和原始 URL 要求；`manual` 来源应记录跳过原因，不做自动抓取失败处理。
   - 自托管 RSSHub/RSS-Bridge 未配置 base URL 时记录 `skipped_missing_base_url`，不是日报失败。

7. 连续运行验收：
   - 发现命令输出保存为临时 JSON 后，用 `npm run sources:audit-merge -- --date YYYY-MM-DD --input <search-news.json>,<sources-health.json>` 把 `search_sources` 与 `sources_health` 合并进最终 `reports-data` 日报；只保留 stdout 不算连续运行证据。
   - 用 `npm run sources:phase5-audit -- --date YYYY-MM-DD --history-dir reports-data --days 3` 审计最近 3 个日报日的 `source_audit` 和候选池。
   - `phase5_complete:false` 不阻塞当天日报发布，但必须说明缺失的是日报天数、必要审计组、还是中介/T3 候选误入事实栏目。

结构化草稿必须包含：

```json
"source_audit": {
  "github_trending": {
    "checked": true,
    "sources": [
      {
        "name": "GitHub Trending daily",
        "url": "https://github.com/trending?since=daily",
        "status": "checked",
        "notes": ""
      }
    ],
    "candidates_found": 0,
    "included": 0,
    "notes": ""
  },
  "builder_sources": {
    "checked": true,
    "sources": [
      {
        "name": "follow-builders",
        "url": "https://github.com/zarazhangrui/follow-builders",
        "status": "checked",
        "notes": ""
      }
    ],
    "candidates_found": 0,
    "included": 0,
    "blocked_reason": "",
    "last_successful_feed_at": null,
    "notes": ""
  },
  "content_sources": {
    "checked": true,
    "sources": [],
    "candidates_found": 0,
    "included": 0,
    "notes": ""
  },
  "search_sources": {
    "checked": true,
    "shadow": true,
    "sources": [],
    "candidates_found": 0,
    "included": 0,
    "notes": ""
  },
  "sources_health": {
    "checked": true,
    "sources": [],
    "candidates_found": 0,
    "included": 0,
    "notes": ""
  }
}
```

`sources[].status` 只能使用 `checked`、`blocked`、`no_signal`、`skipped_missing_token`、`skipped_missing_base_url`、`skipped_manual_source`、`skipped_manual_review_required`。没有合格候选时不要凑数，但必须在 `source_audit` 里说明已经检查过什么以及为什么未收录。

### 内容扩容验收

- 目标公开内容单元为 33-45 个，计算口径为 `main_items + hot_blogs + projects + builder_observations + community_leads + github_trending`。
- `main_items` 目标为 8-12 条，默认 10 条；每条用 2-4 个短 bullet 分点汇报，并包含 `**...**` 或 `==...==` 重点标注。bullet 只写候选事实、数据、图表、限制和影响，不写“日报跟踪/报道边界/后续建议”类元评论。
- 低于 27 个内容单元时，`quality_status.status` 应为 `degraded`，或在 `self_check.notes` 明确说明低信号、网络阻塞、回源失败或人工未选入。
- 每日候选池应至少尝试覆盖：AIGC/内容产业 6 条、大厂动作/平台政策/监管/算力/商业化 8 条、产品/融资 8 条、博客/播客 5 条、Builder/X 原始观察 10-20 条、泛 X/社区讨论 4 个事件。候选不足时记录 `no_signal`，不要伪造。
- 参考用户给定的飞书日报板块结构做发现面覆盖：内容赛道动态、AI 行业动态、观点与分析、值得关注的产品、精选播客更新、Twitter 讨论都必须在候选池中有对应检查记录；没有候选时写 `no_signal` 或阻塞原因。
- `content_sources` 至少记录 core 官方/工程源、Product Hunt、一个博客/访谈聚合源、一个广义科技/产业源的检查结果或阻塞原因。

### 固定兜底命令

- `npm run discover:github-trending -- --date YYYY-MM-DD --limit 50 --history-root reports-data` 现在会先抓 GitHub Trending daily/weekly 与 Python/TypeScript/Rust/Go 页面；对 `fetch failed`、超时、429 或 5xx 默认延迟重试一次，并把重试结果写入 `source_audit.github_trending.sources[].notes`。如果这些页面全部失败或没有解析出仓库，会自动调用 OSSInsight `List trending repos` API 作为机器可复现的项目候选兜底，并尽量和前一日日报的 `github_trending` 做排名变化比较。浏览器导出仍使用 `npm run discover:github-trending -- --date YYYY-MM-DD --browser-export <path>`。
- `npm run discover:builders -- --date YYYY-MM-DD --limit 20` 优先消费 `follow-builders central feed`，再用少量固定原始 RSS/Atom 源补充 Builder 候选。它只产生带原始 URL 的候选；候选足够时最终 `builder_observations` 入选 5-20 条；没有近期条目时记录 `no_signal`，不要手工改写成入选。
- `npm run discover:content-sources -- --date YYYY-MM-DD --limit 100 --per-source-limit 3` 默认解析 `config/sources` 中 `enablement:"core"` 和 `enablement:"optional"` 的官方/工程/研究 RSS/Atom、HTML index、广义科技、AIGC 内容产业、Product Hunt、Latent.Space、Interconnects、Planet AI 等候选，并自动检查日期级公众号文章输入 `$CODEX_HOME/automations/ai-daily/inputs/wechat/YYYY-MM-DD.json`；也可用 `--wechat-input <json>` 显式指定输入。Product Hunt 候选会自动尝试打开产品页并用 GitHub、docs、README 或官网确认用途；确认成功的候选优先使用确认页 URL，确认失败的候选不得直接入选项目区。通过 `--sources` 追加普通微信公众号/自媒体时使用 `category:"intermediary"`；追加白名单公众号时必须带 `source_level:"wechat_primary_like"` 或 `source_level:"wechat_industry_whitelist"`，或使用日期级文章输入；追加 X 热点 feed 时使用 `category:"x_hotspot"` 并保留原始 X status URL。
- 日期级公众号文章输入每条必须包含 `url`、`account_name`、`published_at`、`title`、`summary`、`risk_level`、`verification_notes`，可选 `primary_urls`、`allowed_sections`、`reader_relevance`、`source_level`。发现器只接受 `https://mp.weixin.qq.com` 原文链接，必须在 `source_audit.content_sources` 写入 `WeChat Article Link Input`，并保留 `input_path_redacted=true`、`primary_verification_required=true`，不得把本机绝对路径、`$CODEX_HOME`、私有 feed URL、cookie 或 token 写入候选池、日报 JSON 或 HTML。
- `npm run discover:search-news -- --date YYYY-MM-DD --providers gdelt,openalex,arxiv --queries config/search-queries.json --limit 40 --shadow` 影子运行搜索/新闻补漏；结果默认是 `community_lead` 候选和 `source_audit.search_sources`，不得自动进入正文。
- `npm run sources:health -- --date YYYY-MM-DD --sources config/sources --enablement core,optional,manual` 检查配置源健康状态；用于解释空板块、发现抓取失败和确认 RSSHub/RSS-Bridge 自托管依赖是否可用，`manual` 来源只记录 `skipped_manual_source`。
- `npm run sources:audit-merge -- --date YYYY-MM-DD --input .tmp/search-news-YYYY-MM-DD.json,.tmp/sources-health-YYYY-MM-DD.json` 把独立发现命令输出中的审计组合并进最终日报 JSON，并在写回前运行 report schema 校验。
- `npm run sources:phase5-audit -- --date YYYY-MM-DD --history-dir reports-data --days 3` 读取最近 3 个日报日的 source audit 和候选池，输出连续运行验收状态；只有返回 `phase5_complete:true` 才能宣称 Phase 5 完成。
- `npm run discover:statuspage-incidents -- --date YYYY-MM-DD --limit 20` 解析 OpenAI/Claude 等 Statuspage Atom/RSS，把近期 incident 转成 `community_lead` 轻量运营候选。状态页、模型网关上架、preview access、区域/账号可用性和短时限流默认不写入 `model_releases`；只有影响生产迁移、成本边界或上线排期时才可人工升格为 `main_items`。
