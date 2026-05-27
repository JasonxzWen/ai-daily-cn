# AI 日报信源扩展与内容质量规格

## 目标

本规格把“拓展信源”和近期日报质量反馈转成可实现、可验证的规则。它只定义后续实现边界，不直接修改生产提示词、schema、渲染器或发布脚本。

目标不是照搬其他日报的栏目，而是吸收其高信号来源和行文方式：以事实、来源、可用场景和工程判断为核心，避免凑数、空板块和模板化“为什么重要”。

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
| OpenAI News / RSS | 官方发布、工程、安全、产品 | 主体信息、模型发布、热门技术博客 | 优先一手引用 |
| Anthropic Engineering / News | 工程文章、Claude Code、agent、harness、eval | 热门技术博客、主体信息、访谈背景 | 页面可抓取；若无 RSS，使用页面解析或 `follow-builders` blogs |
| Google DeepMind / Google Research Blog | 模型、研究、系统、开源 | 模型发布、研究/工程博客 | Google Research RSS 可用；DeepMind 页面解析 |
| Hugging Face Blog / RSS | 开源模型、agent、推理、训练、社区文章 | 热门技术博客、项目线索 | 原文可作为最终来源 |
| GitHub Trending / Release / README | 开源项目 | 今日值得关注的项目 | 必须补领域、作用、信号证据 |

### P1：高优先发现源

| 信源 | 类型 | 用途 | 处理规则 |
|---|---|---|---|
| Follow AI Builders | builder 名录与活跃度 | 扩展 builder 白名单、角色标签 | 只作名录和发现，不替代原始帖子 |
| Latent.Space | AI Engineer Newsletter / podcast / X recap | 热门博客、访谈、X 线索 | 优先回溯到原始帖子/项目/官方源；无法回溯时标为观点/综述 |
| Interconnects | frontier labs、开源模型、技术观点 | 热门博客、观点与分析 | 作为高质量个人/研究博客原文 |
| Microsoft Research Blog | 研究与系统文章 | 热门技术博客、研究线索 | 原文可入选 |
| BAIR Blog | 学术/agent/robotics/eval | 热门技术博客 | 原文可入选 |
| Product Hunt | 新产品发现 | 新产品/项目线索 | 需要产品页或官网交叉确认，不直接写成事实 |

### P2：辅助聚合与交叉验证

| 信源 | 类型 | 用途 | 处理规则 |
|---|---|---|---|
| Planet AI | AI RSS 聚合 | 发现官方/博客条目 | 最终链接应回到原文 |
| 0xSMW/rss-feeds 等 RSS 聚合仓库 | RSS 索引 | 补缺失 RSS | 只能作为抓取配置线索 |
| 微信公众号/媒体号 | 二手或半一手报道 | 中文行业线索 | 若原始源不可回溯，不能当作 T0/T1；可以进入社区线索或观点综述 |

## 内容契约

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

- 每条 `summary` 为 300-500 中文字。
- 摘要必须覆盖：核心问题、方法/论证、关键结论、适用场景或局限。
- 不再公开渲染 `why_it_matters`，也不再要求新日报写“为什么重要”。
- 可收录官方工程博客、研究博客、项目维护者博客、知名 builder 个人博客、实验室工程师访谈整理稿。
- 访谈类内容应说明受访者身份、访谈主题、可验证原始链接。

验收：

- 新日报 `hot_blogs[*].summary` 中文长度在 300-500 字范围内。
- HTML 中不出现“为什么重要”。
- 每条博客有原文 URL 和可确认日期。

### Builder 观察

栏目目标：恢复并强化 X/Twitter 和 builder 原始动态。

入选标准：

- 作者是 builder、researcher、founder、maintainer、frontier lab 工程/产品负责人，或高信号开源项目维护者。
- 内容是原创观点、工程经验、产品发布、技术路线、成本/组织实践、agent 工作流、模型工程或可复现实验。
- 必须有原始 URL。`follow-builders` central feed 中的 X URL 视为原始 URL。

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

### 今日值得关注的项目

栏目目标：不仅列项目，还说明它能用在哪、解决什么问题。

规则：

- 每个项目必须说明 `domain` 或 `domains`：例如 `agent memory`、`coding agent`、`RAG`、`eval harness`、`inference serving`、`voice translation`。
- 每个项目必须说明 `use_case` 或 `usage`：例如“给 coding agent 提供跨会话记忆”“把代码库打包为 LLM 可读上下文”“用于生产事故调试训练”。
- 必须保留信号证据：release、trending、star velocity、notable PR、产品榜单、项目 README、官方公告之一。
- Product Hunt 上榜产品可以作为候选，但需要官网、GitHub、文档或产品页交叉确认后才进入项目区。

验收：

- HTML 中每个项目都可见“领域”和“作用/用途”。
- 无法说明用途的项目不得入选项目区，只能进入社区线索或丢弃。

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
      "summary": "300-500 字中文摘要",
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
  ]
}
```

`why_it_matters` 可保留历史兼容，但新日报不再要求填写，公开 HTML 不渲染。

## 实施计划

1. 提示词规格：更新 `source-policy`、`discovery-audit`、`structured-report-json`、`output-html`、`plain-language`，把本规格转成每日生成规则。
2. 发现器：扩展 `discover:builders`，优先消费 `follow-builders` central JSON，再退到 raw feed、本地缓存和固定 RSS。
3. 博客/访谈发现：新增或扩展 discover 命令，读取官方 RSS、Substack RSS、Hugging Face RSS、Google Research RSS、Microsoft Research RSS；对无 RSS 的 Anthropic News、Google DeepMind、Meta AI 使用页面解析；Product Hunt feed 只产生项目候选。
4. 项目发现：扩展项目候选结构，补 `domains`、`use_case`、`signal`、`evidence`。
5. Schema：新增向后兼容字段和新日报质量门。
6. 渲染：动态生成 sections；空数组不渲染；header 使用 `hero_highlights`；博客不渲染“为什么重要”；项目展示领域/作用。
7. 测试：添加 unit/golden/browser 断言覆盖本规格。
8. 发布前验证：运行 `npm run validate`，必要时运行 `npm test`。

## 验收清单

- `npm run validate` 通过。
- 新日报 HTML header 不包含“其余条目见后文”。
- 新日报 HTML 不包含“为什么重要”。
- 新日报 HTML 不包含空板块占位文案。
- `hot_blogs[*].summary` 每条 300-500 中文字。
- 每个项目在 JSON 和 HTML 中都有领域和用途说明。
- Builder 发现器在 `follow-builders` central feed 可用时能产出 X/播客/博客候选。
- `source_audit.builder_sources` 记录 central feed 检查、候选数、入选数、失败原因和最近成功时间。
- Product Hunt、新产品、访谈、X 热点讨论只作为候选源；最终事实尽量回到原始页面。
- 旧历史日报仍能构建和验证。

## 待确认默认决策

1. `follow-builders` central feed 中带原始 X URL 的内容，默认视为可审计 Builder 一手候选。
2. 热门技术博客摘要对新日报执行 300-500 中文字门禁；旧日报不 retroactive 修复。
3. 不新增固定“Product Hunt”“精选播客”“Twitter 热点讨论”大栏目；它们先作为候选源，按内容质量进入项目、博客、Builder 或社区线索。
4. 微信公众号等中文媒体源可以作为发现源，但无法回源时不作为事实最终来源。
