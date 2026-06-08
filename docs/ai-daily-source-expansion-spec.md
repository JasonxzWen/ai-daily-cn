# AI 日报信源扩展与内容质量规格

> 状态：归档/参考。当前唯一权威资产为 `prompts/ai-daily/modules/editorial-authority.md`；如与本文冲突，以该文件为准。

## 目标

本规格把“拓展信源”和近期日报质量反馈转成可实现、可验证的规则。生产提示词和发现器应按本规格演进；旧历史日报保持兼容。

目标不是照搬其他日报的栏目，而是吸收其高信号来源和行文方式：以事实、来源、可用场景和工程判断为核心，避免凑数、空板块和模板化“为什么重要”。

三层信源接入的开发规范、阶段计划和验收标准见 [AI 日报三层信源接入开发计划](ai-daily-source-integration-plan.md)。

## 问题归因

当前 Builder 观察断流的根因不是“审核标准过严”本身，而是信源入口和审核标准不匹配：

- 规则要求 Builder 观察必须来自 builder、researcher、founder、maintainer 的原始内容。
- 实际自动发现入口主要依赖少量固定 RSS/Atom fallback。
- `follow-builders` central feed 中的 X/Twitter、播客、博客内容没有作为第一优先候选池稳定进入日报流程。
- 结果是审核标准变严后，候选供给没有扩容，尤其丢失 X 上的 builder 动态。

修复方向：保留“原始链接、可审计、非二手转述”的质量门，同时把 `follow-builders` central feed、优质技术博客、访谈/播客和产品发现源纳入候选池。

## 信源分层

### P0：必须机器检查

| 信源 | 类型 | 用途 | 处理规则 |
|---|---|---|---|
| `follow-builders` central feed | X/Twitter、播客、官方博客聚合 | Builder 观察、访谈精选、X 讨论线索 | 优先读取 central JSON；保留每条原始 URL；不可用时记录 `blocked_reason` |
| OpenAI News / RSS | 官方发布、工程、安全、产品 | 主体信息、模型索引、热门技术博客 | 优先一手引用；公开模型新闻仍进入主体信息 |
| Anthropic Engineering / News | 工程文章、Claude Code、agent、harness、eval | 热门技术博客、主体信息、访谈背景 | 页面可抓取；若无 RSS，使用页面解析或 `follow-builders` blogs |
| Google DeepMind / Google Research Blog | 模型、研究、系统、开源 | 主体信息、模型索引、研究/工程博客 | Google Research RSS 可用；DeepMind 页面解析；公开页不单列模型发布 |
| Hugging Face Blog / RSS | 开源模型、agent、推理、训练、社区文章 | 热门技术博客、项目线索 | 原文可作为最终来源 |
| GitHub Trending / Release / README | 开源项目 | GitHub Trending / 项目 highlight | 必须补领域、作用、信号证据 |

### P1：高优先发现源

| 信源 | 类型 | 用途 | 处理规则 |
|---|---|---|---|
| Follow AI Builders | builder 名录与活跃度 | 扩展 builder 白名单、角色标签 | 只作名录和发现，不替代原始帖子 |
| Latent.Space | AI Engineer Newsletter / podcast / X recap | 热门博客、访谈、X 线索 | 优先回溯到原始帖子/项目/官方源；无法回溯时标为观点/综述 |
| Interconnects | frontier labs、开源模型、技术观点 | 热门博客、观点与分析 | 作为高质量个人/研究博客原文 |
| Microsoft Research Blog | 研究与系统文章 | 热门技术博客、研究线索 | 原文可入选 |
| BAIR Blog | 学术/agent/robotics/eval | 热门技术博客 | 原文可入选 |
| Product Hunt | 新产品发现 | 新产品/项目线索 | 需要产品页或官网交叉确认，不直接写成事实 |
| Product Hunt Trending | 新产品趋势 | 项目候选、产品趋势 | 必须和 developer-tools feed 一起看；上榜只说明热度，项目事实仍需官网/GitHub/文档确认 |
| TechCrunch AI / Enterprise | 科技媒体、创业与企业软件 | 行业趋势、大厂动态、融资线索 | 作为发现源；事实尽量回到公司公告、监管文件、产品页或一手访谈 |
| The Verge AI / main feed | 科技媒体、平台动态 | 大厂产品、平台政策、消费端 AI 分发 | 作为发现源；不直接替代官方来源 |
| Ars Technica | 技术媒体 | 平台、安全、硬件、政策背景 | 只收录对 AI 工程或行业结构有影响的内容 |
| Google Keyword Blog / Microsoft Official Blog / Apple Newsroom / Meta Newsroom / Amazon News | 大厂官方 newsroom | 大厂动态、云/硬件/平台政策、产品分发 | 官方来源可作为事实来源，但仍需筛掉无 AI 关联的普通公关稿 |

### P2：辅助聚合与交叉验证

| 信源 | 类型 | 用途 | 处理规则 |
|---|---|---|---|
| Planet AI | AI RSS 聚合 | 发现官方/博客条目 | 最终链接应回到原文 |
| 0xSMW/rss-feeds 等 RSS 聚合仓库 | RSS 索引 | 补缺失 RSS | 只能作为抓取配置线索 |
| 微信公众号/媒体号/自媒体 | 二手或半一手报道 | 中文行业线索 | 重要中介源；必须先追溯其引用的一手来源。若原始源不可回溯，不能当作报道实体，只能进入社区线索或观点综述 |
| 华尔街见闻/行业资讯站 | 财经与产业媒体 | 融资、商业化、大厂经营线索 | 作为中介或交叉验证；融资入选主体信息前需要官方公告、投资方公告、监管文件或多源确认 |
| 小宇宙/喜马拉雅 | 播客平台 | 访谈、builder 观点、行业讨论 | 只接受具体节目/单集页、RSS episode、原始音频或 transcript；平台首页不作为来源 |
| X 热点 feed | 社区讨论、builder 动态 | Builder 观察、社区线索、早期热点 | 默认不依赖不稳定公共 RSS；可接入自托管 RSSHub、twscrape、列表导出等工具，但必须保留原始 X status URL |

## 内容契约

### 信息密度与重点标注

近期页面反馈暴露出两个内容问题：正文容易出现“AI 味”和低信息熵，卡片里也缺少稳定的一眼重点。因此新日报公开文本必须按下面规则写：

- 每条主体信息、博客、项目或 Builder 观察至少包含 2 个事实锚点：发布日期、版本号、仓库名、API/模型名、功能边界、性能/限制、价格/权限、发布方或原始链接。
- 每条只保留一个判断句，且判断必须落到工程用途、迁移风险、成本/权限边界、部署限制或可复现实验；不要写泛泛的“值得关注”“体现趋势”“具有启发”。
- 每条卡片最多标 1-3 个重点。优先加粗实体、变化和限制；高亮只用于状态、排名变化、关键门槛或结论，不用于整句铺色。
- 允许的标记语法是 `**加粗**` 和 `==高亮==`。如果某个渲染区域还不支持安全 inline Markdown，只能先在开发计划中补渲染能力，不能要求日报草稿强行依赖。
- 公开正文不展示执行痕迹：命令失败、扩窗、候选为空、审计组缺失只写入自检或默认折叠的附录。

验收：

- `summary`、`main_items[*].bullets`、`hot_blogs[*].summary`、`projects[*].description/use_case` 不出现“高信号”“核心信号”“可观察信号”“更多信号”“预期收益”等泛化词。
- 每个 `main_items` 条目至少有日期/来源/实体/变化中的 2 类信息。
- 热门博客和项目卡片在渲染支持后，至少能安全展示 `strong` 或 `mark.text-highlight`，且原始 `<script>` 等 HTML 仍会被转义。
- 单条卡片高亮不超过 3 处，避免和正文混在一起。

### Header

新增 `hero_highlights` 概念，最多 1-3 条。

规则：

- 只放当天最重磅的消息、项目或观点。
- 可以是“GPT-5.5 发布”“Claude Code 重大安全事件”“某项目爆发式上榜”“一篇高质量观点改变今日主线”等。
- 没有特大新闻时，写 1 条“今日主线”，而不是从 `summary` 机械切句。
- 禁止出现“其余条目见后文”“本版只保留 N 条主体信息”这类执行痕迹。

验收：

- HTML header 不包含“其余条目见后文”。
- Header 条目数不超过 3。
- Header 每条都能在正文或来源审计中找到对应来源。

### 热门技术博客

栏目目标：让读者不点开原文也能理解文章核心内容。

规则：

- 每条 `summary` 为约 100-160 个中文字符，拆成 2-4 个分点式要点。
- 摘要必须覆盖：核心问题、方法/论证、关键结论、适用场景或局限。
- 不再公开渲染 `why_it_matters`，也不再要求新日报写“为什么重要”。
- 可收录官方工程博客、研究博客、项目维护者博客、知名 builder 个人博客、实验室工程师访谈整理稿。
- 访谈类内容应说明受访者身份、访谈主题、可验证原始链接。

验收：

- 新日报 `hot_blogs[*].summary` 中文长度在约 100-160 个中文字符范围内。
- HTML 中不出现“为什么重要”。
- 每条博客有原文 URL 和可确认日期。
- 贴出的证据图、博客图和卡片 media 图必须能点开放大；来源 icon 和低信息密度封面图不计入合格证据图。

### Builder 观察

栏目目标：恢复并强化 X/Twitter 和 builder 原始动态。

入选标准：

- 作者是 builder、researcher、founder、maintainer、frontier lab 工程/产品负责人，或高信号开源项目维护者。
- 内容是原创观点、工程经验、产品发布、技术路线、成本/组织实践、agent 工作流、模型工程或可复现实验。
- 必须有原始 URL。`follow-builders` central feed 中的 X URL 视为原始 URL。
- 必须保留 `original_text` 原文和完整、精确、忠于原意的中文 `translation`；`content` 只作为兼容字段，必须与 `translation` 保持一致，不得写成观点摘要。
- 有 X handle 时填写 `handle`；能取得头像 URL 时填写 `avatar_url`，构建器会 best-effort 缓存为 `docs/assets/avatars/**` 并写入公开数据。

排除标准：

- 纯转推、纯情绪、招聘/营销、生活内容。
- 只有媒体转述且没有原始帖子/视频/博客。
- 无法区分事实和推测的传言。

发现顺序：

1. `follow-builders/scripts/prepare-digest.js` 输出的 central feed。
2. `follow-builders` raw `feed-x.json`、`feed-podcasts.json`、`feed-blogs.json`。
3. 本地新鲜缓存，过期缓存只可用于说明最近成功时间，不可直接入选。
4. 固定 RSS/Atom fallback，如 Simon Willison、Chip Huyen、Karpathy 等。
5. Follow AI Builders 名录补充的 builder 个人站点或平台链接。

验收：

- 当 central feed 可用且含近日报文时，`builder_observations` 不应因为固定 RSS 失败而为空。
- `source_audit.builder_sources` 记录 central feed、fallback、候选数、入选数、失败原因和最近成功时间。
- Builder 观察不计入 `main_items`。
- 新日报的每条 `builder_observations` 都必须有 `original_text` 和 `translation`，且 `content` 等于完整中文翻译；缺失或概括会被发布质量门阻断。
- HTML 中 Builder 观察使用类似 Twitter/X 预览的卡片：头像、作者、handle、标签、完整中文翻译正文和可展开原文，不展示 evidence 摘要作为正文替代品。

### GitHub Trending / 项目 highlight

栏目目标：不仅列 GitHub Trending 项目，还说明高价值项目能用在哪、解决什么问题。公开 HTML 不再生成“今日值得关注的项目”独立板块或“项目 highlights”子标题；`projects` 只作为匹配 GitHub Trending Top 10 条目的 highlight tag 和行内说明元数据。

规则：

- 每个项目必须说明 `domain` 或 `domains`：例如 `agent memory`、`coding agent`、`RAG`、`eval harness`、`inference serving`、`voice translation`。
- 每个项目必须说明 `use_case` 或 `usage`：例如“给 coding agent 提供跨会话记忆”“把代码库打包为 LLM 可读上下文”“用于生产事故调试训练”。
- 必须保留信号证据：release、trending、star velocity、notable PR、产品榜单、项目 README、官方公告之一。
- Product Hunt 上榜产品可以作为候选，但需要官网、GitHub、文档或产品页交叉确认后才进入项目 highlight。

验收：

- HTML 中每个项目 highlight 都只出现在对应 GitHub Trending 条目内，并可见“领域”和“作用/用途”。
- 无法说明用途的项目不得入选项目 highlight，只能进入社区线索或丢弃。

### 访谈与播客

栏目定位：优质访谈可以进入热门技术博客、Builder 观察或社区线索，不一定新增固定大栏目。

入选标准：

- 受访者是 OpenAI、Anthropic、Google、Meta、Microsoft、Hugging Face、知名开源项目或高信号创业团队的工程师、研究员、产品负责人、founder。
- 内容包含技术路线、工程实践、组织实践、成本结构、模型/agent 经验，而不是泛泛宣传。
- 具备原始链接：播客页面、YouTube、官方 transcript、RSS episode 或可信 podcast 页面。

处理规则：

- 单个访谈足够重要时，可作为 `hot_blogs` 的长摘要。
- 只有一个具体观点高信号时，可作为 `builder_observations`。
- 只是线索或二手摘要时，放入 `community_leads`。

### Twitter/X 热点讨论

栏目定位：可作为“社区讨论”或“Builder 观察”补充，不作为事实来源本身。

规则：

- 必须区分“事实”和“舆论/观点”。
- 讨论总结必须列出至少 2 个原始帖子或 `follow-builders` central feed 原始 URL。
- 不把“讨论很热”写成事实结论。
- 可参考 Latent.Space AINews 的聚合思路，但最终尽量回溯原始帖子。

### 空板块

规则：

- 空的 `model_releases`、`hot_blogs`、`projects`、`builder_observations`、`community_leads` 不进入正文 section。
- 空板块不进入导航。
- 信源审计仍保留“检查过但无入选”的事实。

验收：

- HTML 正文和导航中不出现“暂无 Builder 观察”“暂无社区线索”“暂无热门技术博客”等空态内容。
- `source_audit` 仍说明检查状态和原因。

## 数据结构建议

向后兼容原则：旧 JSON 继续通过；新日报通过 `report:write` 或质量门强制更高标准。

建议新增或调整字段：

```json
{
  "hero_highlights": [
    {
      "title": "string",
      "url": "https://example.com",
      "reason": "为什么这是今日头条级别的信号"
    }
  ],
  "hot_blogs": [
    {
      "title": "string",
      "url": "https://example.com",
      "publisher": "string",
      "author": "string",
      "event_date": "YYYY-MM-DD",
      "topic": "agent_harness",
      "summary": "约 100-160 个中文字符的分点式摘要",
      "content_type": "blog|interview|podcast|engineering_note"
    }
  ],
  "projects": [
    {
      "name": "string",
      "description": "string",
      "url": "https://example.com",
      "domains": ["coding_agent"],
      "use_case": "可用于什么领域、解决什么问题",
      "signal": "release|star_velocity|trending|notable_pr|product_hunt|official_update",
      "evidence": "string"
    }
  ],
  "builder_observations": [
    {
      "author": "string",
      "handle": "string",
      "role": "builder|researcher|founder|maintainer",
      "url": "https://x.com/example/status/...",
      "original_text": "原帖或原始连续摘录",
      "translation": "完整精确的中文翻译",
      "content": "与 translation 相同的兼容字段",
      "avatar_url": "https://example.com/avatar.png"
    }
  ]
}
```

`why_it_matters` 可保留历史兼容，但新日报不再要求填写，公开 HTML 不渲染。

## 实施计划

1. 提示词规格：更新 `source-policy`、`discovery-audit`、`structured-report-json`、`output-html`、`plain-language`，把本规格转成每日生成规则。
2. 发现器：扩展 `discover:builders`，优先消费 `follow-builders` central JSON，再退到 raw feed、本地缓存和固定 RSS。
3. 博客/访谈发现：`discover:content-sources` 从 `config/sources/*.json` 读取默认源，默认跑 `core,optional`，覆盖 Product Hunt、广义科技媒体、Latent.Space、Interconnects、Planet AI 等候选源；公众号/中文自媒体保留为 `manual`，需要显式打开或人工录入。
4. 项目发现：扩展项目候选结构，补 `domains`、`use_case`、`signal`、`evidence`。
5. Schema：新增向后兼容字段和新日报质量门。
6. 渲染：动态生成 sections；空数组不渲染；header 使用 `hero_highlights`；博客不渲染“为什么重要”；项目展示领域/作用。
7. 卡片重点标注：让热门博客、项目等卡片 body 使用安全 inline Markdown 渲染 `**加粗**` 与 `==高亮==`，同时保持 HTML 转义。
8. Builder 质量门：`report:write` 和发布质量检查必须阻断缺 `original_text`、缺 `translation` 或 `content` 不等于完整翻译的新日报。
9. 测试：添加 unit/golden/browser 断言覆盖本规格。
10. 搜索与健康检查：`discover:search-news --shadow` 只生成候选和 `source_audit.search_sources`；`sources:health` 检查配置源可用性、feed 形态、48 小时条目数和原始 URL 要求。
11. 审计合并：把 `github_trending`、`builder_sources`、`content_sources`、`search_sources`、`sources_health` 合并进最终日报 JSON，而不是只保留临时命令输出。
12. 发布前验证：运行 `npm run validate`；连续运行验收另跑 `npm run sources:phase5-audit -- --date YYYY-MM-DD --history-dir reports-data --days 3`。

## 验收清单

- `npm run validate` 通过。
- `npm run sources:validate` 通过；缺少 `tier`、`authority`、`candidate_category` 或 `source_kind` 的信源会失败。
- 最终日报 JSON 的 `source_audit` 包含 `github_trending`、`builder_sources`、`content_sources`、`search_sources`、`sources_health`；`phase5_complete:false` 时说明缺失项，但不冒充完成。
- 新日报 HTML header 不包含“其余条目见后文”。
- 新日报 HTML 不包含“为什么重要”。
- 新日报 HTML 不包含空板块占位文案。
- 新日报公开正文不包含“高信号”“核心信号”“可观察信号”“更多信号”“预期收益”等泛化词。
- `hot_blogs[*].summary` 每条约 100-160 个中文字符。
- 热门博客和项目卡片支持安全加粗/高亮后，页面中重点标记能和正文区分，且 HTML 注入仍被转义。
- 每个项目在 JSON 和 HTML 中都有领域和用途说明。
- Builder 发现器在 `follow-builders` central feed 可用时能产出 X/播客/博客候选。
- `source_audit.builder_sources` 记录 central feed 检查、候选数、入选数、失败原因和最近成功时间。
- Product Hunt、新产品、访谈、X 热点讨论只作为候选源；最终事实尽量回到原始页面。
- 微信公众号、自媒体、华尔街见闻等中介源不会被写成事实报道实体；无法回源时只进入社区线索。
- 带 `verification_status:"intermediary_only"` 的候选不得进入 `main_items`、`model_releases`、事实性 `projects` 或 `hot_blogs`。
- 搜索 provider 缺少 API key 时记录 `skipped_missing_token`，不导致日报失败。
- X 热点候选必须有原始 `x.com/.../status/...` 或 `twitter.com/.../status/...` URL。
- 广义科技、大厂动态和行业趋势只在影响 AI 生态、开发者工作流、算力/平台/监管/产业结构时入选。
- 旧历史日报仍能构建和验证。

## 默认决策

1. `follow-builders` central feed 中带原始 X URL 的内容，默认视为可审计 Builder 一手候选。
2. 热门技术博客摘要对新日报执行约 100-160 个中文字符门禁；旧日报不 retroactive 修复。
3. 不新增固定“Product Hunt”“精选播客”“Twitter 热点讨论”大栏目；它们先作为候选源，按内容质量进入 GitHub Trending 项目 highlight、博客、Builder 或社区线索。
4. 微信公众号等中文媒体源可以作为发现源，但无法回源时不作为事实最终来源。
