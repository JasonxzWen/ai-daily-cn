# AI 日报 Story-Centered 生成合同

状态：`implemented / publish-run-validation-pending`

本文记录 2026-06-23 用户确认的 AI 日报新契约。当前分支已把该契约落到 schema、draft 生成、report 写入、public rendering、page checklist 和回归测试；但某个真实日报是否发布成功，仍只由当次 `daily:run --publish` 的 run summary、Pages 验证和 blocking/degraded 结果证明。

## 读者目标

日报服务“每天用 3 分钟判断 AI 动态的人”。页面首先帮助读者判断今天发生了什么、哪些趋势值得继续看、哪些开发者生态信号需要留意；随后保留每条新闻的简明概括和可点击来源链接。

这不是“更少内容”，而是“更强编辑层级”：

- 顶部给判断，但必须能回链到正文 item。
- 主列表给可核验 story，不用模板句凑数。
- GitHub Trending 作为一等固定模块，直接展示开发者生态信号。
- 媒体、博客、社区、X/Reddit 主要提供来源、解释和线索，不再按来源类型铺成多个同权大区块。

## 核心决策

| 决策 | 规则 | 非目标 |
|---|---|---|
| 主列表单位 | 使用编辑后合并的 `story`，一个 story 可挂多个来源链接。 | 不把原始 RSS item、博客 item、社区 item 直接平铺成主列表。 |
| 主列表数量 | 默认 8 条，最多 12 条；允许少于 8。 | 不为了凑满 8 条使用模板化、不可核验或低信息内容。 |
| Story 资格 | 必须有具体标题、具体事件、`what_happened`、`why_it_matters`、至少一个来源链接。 | 不允许“某机构更新 AI 产品、平台或工程实践”这类模板 story 进入主列表。 |
| 单来源 | 强一手来源可单独成 story；二手/社区单来源默认进入线索或补充模块。 | 不为凑多源把不相关链接硬挂到同一个 story。 |
| 合并依据 | 以事实身份合并：主体、事件类型、对象、日期、核心事实、权威 URL。 | 不按标题/摘要模板相似度合并。相似但事实不同的内容只能归同一 trend。 |
| 同日去重 | 同 URL 只能归属一个 story；同事件多 URL 合并到 `sources[]`。 | 不允许相同 URL 在主 story 和其他模块用同样标题/摘要重复出现。 |
| 跨日报去重 | 过去 7 期主列表出现过的 URL 或 story fingerprint 默认不再进主列表，除非有明确新进展。 | 不把 RSS 延迟、重推、旧内容重新包装为今天的新 story。 |
| GitHub Trending | 一等固定模块，默认 Top 5-8 直接展示，不折叠。 | 不把 GitHub 降级成附录；也不让 GitHub 信号污染主 story 的事实口径。 |
| 媒体/博客 | 优先作为 story sources；未进入主 story 但仍值得看的内容进入紧凑补充模块。 | 不再把每日追踪、博客、中文媒体、社区等平铺为多个同权大 section。 |
| 顶部判断 | `summary`、`today_brief`、`trend_clusters` 从 stories + GitHub Top + signals 派生。 | 顶部判断不能独立生成后和正文脱节。 |
| 质量门 | 默认自动降级：移出不合格主 story、保留来源线索并发布降级日报。 | 不把 story 数不足、趋势不足、图片缺失、社区为空变成发布阻塞。 |

## 建议数据形态

第一版优先保持简单，不新增复杂 story-repo 关系图。

```json
{
  "stories": [
    {
      "story_id": "openai-daybreak-security-2026-06-22",
      "title": "OpenAI 推出 Daybreak 开源安全项目",
      "importance": "major",
      "trend": "AI 编程与开源安全",
      "event_date": "2026-06-22",
      "primary_entity": "OpenAI",
      "event_type": "launch",
      "object": "Daybreak",
      "what_happened": "OpenAI 发布面向开源漏洞发现和修复的项目，材料说明了参与方式、适用边界和安全目标。",
      "why_it_matters": "它把模型能力、开源维护和安全修复连接起来，影响开发者工具和安全团队的 agent 落地路径。",
      "evidence_level": "primary",
      "sources": [
        {
          "label": "OpenAI",
          "url": "https://openai.com/index/daybreak-securing-the-world",
          "type": "official"
        }
      ],
      "source_item_refs": [
        "https://openai.com/index/daybreak-securing-the-world"
      ]
    }
  ],
  "github_trending_top": [
    {
      "repo": "owner/name",
      "url": "https://github.com/owner/name",
      "summary": "一句话说明项目是什么。",
      "why_today": "说明增长、版本、README 信号或生态位置。",
      "signal": "weekly stars / language / rank / topic",
      "covered_by_main_story": false
    }
  ]
}
```

字段边界：

- `story_id` 可以由 canonical URL、事实身份字段和日期确定，不要求新建全局实体库。
- `sources[]` 是公开可点击来源；内部 candidate id、selection reason、source audit 不进入公开正文。
- `covered_by_main_story` 是 GitHub 侧的轻量展示提示；主 story 不需要反向引用 GitHub item。
- 兼容期可以继续输出 `main_items`，但它应由 `stories` 映射得到；不能继续让 `main_items` 作为独立事实池。

## Story 资格门

主列表 story 必须同时满足：

- 标题能说清具体事件或对象，不能只是来源机构 + 泛化动作。
- `what_happened` 至少说明事件、对象、动作和公开材料边界。
- `why_it_matters` 说明对产品、工程、研究、生态、监管、资本或产业判断的价值。
- 至少一个可打开来源链接。
- 来源证据等级清楚：
  - `primary`：官方博客、论文、GitHub release/changelog、模型卡、监管/公司公告；可单来源进入主列表。
  - `multi_source`：多来源指向同一事实；优先进入主列表。
  - `secondary`：媒体报道；默认需要一手回源或多源确认。
  - `community_signal`：X、Reddit、社区讨论；默认进入信号模块，除非指向一手材料且一手材料成为 story 主来源。

禁止进入主列表：

- 模板标题：`.*更新AI 产品、平台或工程实践`、`.*披露模型能力和评估方法更新`、`相关团队更新agent 工作流和开发工具能力` 等泛化表达。
- 无来源、坏 URL、不可回源内容。
- 同一 URL 或同一事实身份已经被更高优先级 story 覆盖。
- 过去 7 期主列表已覆盖且没有明确新进展的内容。
- 高风险事实只有二手或社区单源：融资、估值、监管、安全事故、价格、benchmark、模型能力等。

## 去重和合并

生成阶段必须先保留原始身份，再做合并，不能先模板化。

1. URL canonical 去重：去掉 tracking 参数、规范化尾部斜杠、统一大小写域名。
2. 事实身份提取：`primary_entity`、`event_type`、`object`、`event_date`、`claim_fingerprint`。
3. 同 URL 合并：相同 canonical URL 只能进入一个 story 或一个非主模块。
4. 同事实合并：不同来源报道同一事实时，合并到一个 story 的 `sources[]`。
5. 同主题不合并：只是都属于 agent、模型评测、AI 编程等主题时，归入同一 trend，但保持不同 story。
6. 跨日报去重：读取最近 7 期已发布 JSON 或 story registry，命中 URL/fingerprint 且无新进展时拒绝进主列表。

如果合并器只能得到模板标题，处理方式是重写或移出主列表，而不是发布模板 story。

## 页面结构目标

第一版信息架构：

```text
今日判断
主 story 列表，默认 5-8 条，最多 12 条，允许少于 8

项目/代码动态
GitHub Trending Top 5-8，直接展示，不折叠

社区与讨论信号
X / Reddit / Builder / 中文社区 Top 3-5，直接展示摘要，其余进入更多线索

媒体/博客补充
未进入主 story 但值得看的文章、访谈、深度解析

来源附录
来源覆盖、被合并/去重/未采用原因，只展示读者需要知道的公开摘要
```

GitHub Trending 高密度展示字段：

- repo/name
- 一句话说明项目是什么
- 为什么今天值得看：增长、版本、能力、生态位置
- 信号：stars delta、language、rank、topic、README 状态
- 链接：GitHub
- 如已被主 story 覆盖，只保留热度/生态信号，不重复事件摘要

## 质量门与降级

质量门目标是“不发布坏主列表”，不是“不完美就阻塞”。

自动降级：

- 合格 story 少于 8 条：发布较短主列表。
- 趋势不足：写“今天主线分散”或减少趋势数量。
- 媒体/博客/社区为空：隐藏空模块或显示简短覆盖缺口。
- 模板/重复/低证据 item：移出主列表，进入更多线索或未采用来源摘要。
- GitHub README 失败：保留 rank/star/trend 元数据，明确 README 失败，不编造项目描述。

阻塞发布：

- 没有可发布 HTML/JSON。
- 主列表存在无链接 story。
- 主列表存在无法核验的高风险事实。
- JSON schema 破损导致页面不可渲染。
- publish dry-run、真实发布安全门或 Pages 验证失败。
- 公开页面泄露内部候选池、source audit、self_check、repair contract、私有路径或密钥。

## 分阶段 TODO

| Phase | 目标 | 主要改动 | 必须验证 |
|---|---|---|---|
| 0. 规范落地 | 固定 story 契约、TODO 和反馈记忆。 | 本文档、reconciliation addendum、ledger/quick reference、规范锚点测试。 | 已落地；由 `story-centered daily contract is implemented with generator and rendering gates` 锚定。 |
| 1. 生成闭环 | 从 source items 生成 `stories`，主列表默认 8、最多 12。 | `src/draft.js`、schema/prompt 兼容层、同日去重、模板标题拒绝。 | 已落地；story 数量、来源链接、模板拒绝、强一手单源、弱单源降级都有单测。 |
| 2. 跨日报去重 | 最近 7 期 URL/fingerprint 去重。 | 读取近期 `docs/data` story/source/url/fingerprint 历史；记录 reject reason。 | 已落地；7-run history fixture 覆盖旧 story 无新进展不进主列表。 |
| 3. GitHub 一等模块 | Top 5-8 直接展示，不折叠，和主 story 避免重复摘要。 | `src/interaction-report.js` public view 最多渲染 Top 8；JSON/内容合同仍保留 Top20。 | 已落地；page checklist 验收公开 Top 5-8，内容合同继续约束 Top20 采集。 |
| 4. 顶部派生 | summary/trends 从正文 item 派生并回链。 | draft summary、trend cluster、hero compatibility。 | 已落地；单测断言 summary/trends 引用可见 story 或 signal item。 |
| 5. 页面信息架构 | 压缩视觉层级，提升新闻阅读密度。 | `src/interaction-report.js`、story source links、page checklist。 | 已落地；仍要求每次改前端后跑桌面/移动 Playwright 截图。 |
| 6. 发布质量门 | 自动降级优先，阻塞范围收紧到不可发布/不可核验/发布安全。 | quality loop、content contract、daily runner 摘要。 | 部分沿用现有 publish quality/content contract；真实 `daily:run --publish` 仍必须报告 blocking/degraded。 |

## 测试边界

Phase 1 起必须新增或调整的测试：

- `report:draft builds story list from merged source items`
- `report:draft rejects templated story titles instead of filling to eight`
- `report:draft allows fewer than eight stories when only fewer are qualified`
- `report:draft caps story list at twelve`
- `report:draft merges same URL into one story with multiple sources`
- `report:draft does not merge same-template different-fact items`
- `report:draft excludes stories published in the previous seven reports unless materially updated`
- `report:draft keeps strong primary single-source stories`
- `report:draft keeps secondary or community single-source items out of main stories`
- `summary and trend clusters reference existing story or signal items`
- `GitHub Trending renders Top 5 to 8 as a visible first-class section`
- `GitHub item covered by a main story keeps only ecosystem signal copy`
- `daily quality downgrades invalid story candidates without blocking publish`

验收样本：

- 使用 2026-06-23 线上问题作为回归样本。
- 主 story 不超过 8 条，最多不超过 12 条。
- 不能出现重复的 `OpenAI更新AI 产品、平台或工程实践`、`Alibaba Cloud披露模型能力和评估方法更新` 等模板 story。
- 相同 URL 不得在主列表和社区线索中重复同样标题/摘要。
- GitHub Trending 直接展示 Top 5-8，不折叠。
- 顶部判断可以回链到正文 story 或 GitHub/signal item。

## 验收声明边界

只有同时具备以下证据，才能说某个分支里的 story-centered 生成能力已实现：

- 红灯测试先失败，实施后同名测试通过。
- 至少一个真实日期重新生成的 JSON/HTML 产物。
- 2026-06-23 失败样本通过 story 去重和模板拒绝回归。
- 桌面和移动截图证明主列表、GitHub 模块和补充模块可读。
- `npm run validate` 通过。
- handoff 明确报告 blocking/degraded、自动降级和剩余风险。

当次真实发布仍有单独边界：不能仅凭这些本地实现证据声称某天日报发布成功；必须以该日期 `daily:run --publish` 的 run summary、`publish:dry-run:daily`、真实发布或兜底结果、Pages 验证为准。
