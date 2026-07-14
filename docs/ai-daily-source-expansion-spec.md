# AI 日报信源扩展与内容呈现规格

> **2026-07-14 适用范围：公共信号流。** 公共 occurrence 存储与 `docs/signals/**` 是 source-first listener，不是只陈述已复核事实的编辑摘要。凡能安全标准化的发现记录都应进入公共流；来源、内容、可信度、健康和访问属性只作标签、筛选与诊断，不作准入、配额、排序权重或发布门槛。
>
> 本文末尾保留少量 **legacy edited report** 内容规则，仅用于下游可选编辑报告。legacy 的核验、选题、篇幅、时间窗口、去重和质量门不得删除、延迟、降级或重排公共 occurrence，也不得阻塞公共信号发布。

## 目标

项目默认迭代方向是丰富、开放、可追溯：

- 激进扩展公开、合法、技术可访问的来源，不先设观察期或升格流程。
- 先保存观察，再补充摘要和标签；未知或未核验不等于不可公开。
- 按来源属性建立一级板块，卡片展示链接、摘要、可信度、内容类别、来源和必要的健康/访问状态。
- 同一 URL 的不同来源或不同时间观察可以并存；公共流不是故事级去重后的事实清单。
- 发现器、数据合同和前端都避免过度保守、过度设计和重复控制面。

三层接入细节见 [AI 日报三层信源接入开发计划](ai-daily-source-integration-plan.md)。

## 不可回退的公共监听原则

公共路径不得引入或恢复以下机制：

- `core` / `optional` / `manual` 来源准入或“显式开启才监听”；
- authority/tier/verification 级别控制成员资格；
- 单源条数、总条数、栏目容量、Top N 或候选池容量控制公共输出；
- 48/72 小时、`lookback_days`、新鲜度窗口、观察期、连续运行次数；
- “影子运行后再升格”、人工复核后再记录、事实性栏目资格前置到 occurrence；
- 因低可信度、中介来源、缺少原始链接、重复 URL 或低重要性静默丢弃可安全记录。

技术访问限制与内容准入必须分开：缺 API key、缺自托管地址、ToS/robots 限制、网络阻断或解析失败可以导致当次无法取得内容，但只能形成 access/health 状态，不能被包装成来源“不够格”。

## 来源板块

下列板块是前端一级分类和来源盘点方式，不是优先级。所有板块内可访问来源都参与公共监听。

### 官方博客与发布

- OpenAI News / RSS
- Anthropic News / Engineering
- Google DeepMind / Google Research
- Meta AI / Meta Engineering
- Microsoft Research / Azure Blog
- AWS Machine Learning Blog
- Apple Machine Learning Research / Apple Newsroom
- NVIDIA Developer Blog
- Hugging Face Blog
- Cloudflare Blog
- 其他模型实验室、云平台、硬件与开发工具官方 changelog/release

建议标签：`source: official`、`content: release|engineering|research|policy`、`credibility: original_or_official`。

### GitHub 与开源项目

- GitHub Trending
- 项目 Releases、README、Changelog、Discussion
- AI 周报/报告类仓库及其具体条目
- curated awesome list、RSS 索引仓库、开源工具目录

仓库索引或 awesome list 本身也是可公开观察的来源。能回到具体 repo/release 时补 direct link；不能回链时保留索引链接并标记 `indirect`，不得因此删除记录。

### 社区讨论

- Hacker News official / HNRSS
- Reddit 的公开可访问社区 feed
- Product Hunt
- 公开论坛、社区榜单、Discussion、issue/PR 讨论

社区热度、观点和传言都可以作为观察进入公共流，但必须通过 `content` 与 `credibility` 标签与官方事实区分。不要把“尚未核验”变成“不准记录”。

### X / Builder 动态

- `follow-builders` central feed
- builder、researcher、founder、maintainer 的公开原帖
- 播客、访谈、Newsletter 中的 builder 动态
- 可合法使用的自托管 RSSHub、列表导出或其他 relay

优先保留原始 X status URL、作者、handle、原文和时间。若 relay 暂时没有原始 URL，应保留安全的 relay/provider 链接，并标记 `access: indirect`、`credibility: unverified`、`original_url_missing`；只有连安全链接也无法生成时才算标准化错误。

### 新闻、Newsletter 与个人站点

- Latent Space / Smol AI News
- Interconnects
- Simon Willison、Chip Huyen、Karpathy 等个人技术站点
- MIT Technology Review、TechCrunch、The Verge、Ars Technica、VentureBeat、Wired、The New Stack
- 播客单集页、官方 transcript、YouTube 访谈

媒体、Newsletter、个人观点和聚合摘要直接进入公共流并标明来源属性。回链到原始公告可以提升 directness/credibility 标签，但不是存在资格。

### 论文、模型与榜单

- arXiv、OpenAlex、Semantic Scholar
- Hugging Face Daily Papers / Trending
- OpenRouter Rankings
- Artificial Analysis
- SWE-bench 等公开 benchmark/leaderboard
- Nature、研究机构博客和数据集发布

榜单页面、解析出的榜单行、方法说明和抓取异常可以分别建模。公开卡片应说明榜单口径；不完整快照仍可作为带状态的观察，不能因缺少完整 Top 10 擦除“该来源有变化/当前受限”的记录。

### 中文与其他中介来源

- 量子位、36Kr、机器之心、雷峰网、InfoQ 中文、少数派、爱范儿等公开源
- 公众号文章的合法公开入口、作者站点或公开 relay
- 行业资讯、财经媒体、中文个人博客与播客

中文、中介和二手来源不需要先成为一手来源才能被监听。卡片直接展示其链接、摘要和 `secondary|intermediary|unverified` 等可信度标签；legacy 编辑报告若要据此写确定性事实，再另行回源。

## 公共卡片数据合同

每个 occurrence 应尽量保留：

- 稳定 observation identity；
- 标题、摘要或原始可公开文本；
- 观察时间与来源声明的事件时间；
- direct/original URL，或安全的 intermediary/provider URL；
- publisher、collector、作者等来源归属；
- source、content、credibility、health、access 标签；
- 同一次标准化中发生的兜底或错误信息。

未知字段使用兜底标签，不得因为新枚举未进入白名单而拒绝记录。默认顺序按时间；标签筛选不改变底层成员集合。

### 最小守恒关系

每次输入都必须落到以下三类之一：

```text
input_record_count
  = occurrence_count
  + coalesced_record_count
  + normalization_error_count
```

`coalesced` 只用于同一 observation 的重复行，不等于故事去重；同一 URL 的不同观察仍是独立 occurrence。分页并集必须与 occurrence 投影一致，分页页大小不能成为总量上限。

## 来源标签与可信度标签

建议公开词汇保持简短、可理解：

- 来源：官方博客、GitHub、社区、X/Builder、媒体/Newsletter、论文/模型、其他。
- 内容：发布、项目、研究、观点、讨论、榜单、教程、产业动态、未知。
- 可信度：官方/原始、直接来源、二手来源、社区线索、未核验、未知。
- 健康：正常、无新条目、受限、失败、未知。
- 访问：直接、间接、需要凭据、需要自托管、不可达、未知。

标签含义只回答“这是什么、从哪里来、当前能否访问”，不回答“是否允许出现”。可信度标签也不是事实评分器。

## 前端信息架构

公共首页使用 source-first 的方案 C：

- 一级板块按来源属性组织，而不是按“已核验事实/候选/降级”组织。
- 卡片先展示标题、简明摘要、来源、时间和链接，再展示少量 source/content/credibility 标签。
- health/access 只在对读者有帮助时展示，不把页面做成抓取运维面板。
- 同页先展示最近 48 小时只是初始视图范围，不是数据准入或历史删除窗口；用户可在同页懒加载更早记录。
- 只支持并验收 `1280x900` 桌面视口，不设计移动端、平板或窄屏变体。

公开页面不展示 raw audit、候选池、重试日志、内部评分、ledger 或质量门过程。

## 实施边界

1. 发现器读取所有公开、合法且当前技术可访问的配置来源，不读取 `enablement` 作为成员门槛。
2. 搜索、RSS、GitHub、社区、X relay 等结果统一写 occurrence；provider page size 只是传输参数。
3. occurrence 先于 legacy report 写入，并独立构建、验证和发布 `docs/signals/**`。
4. 健康检查只产生诊断与标签，不删除来源或记录。
5. 前端从 `docs/signals/**` 消费来源分组和标签，不读取 legacy 选择原因。
6. authenticated X/Reddit 等来源可在具备合法凭据后接入；缺凭据时保留 access 状态，不虚构内容。

## 验收清单

- 公共路径无 `core/optional/manual` 准入、无单源/总量配额、无年龄窗口、无观察/升格期。
- 每个安全输入都由 occurrence、coalesced 或 normalization error 解释。
- `docs/signals/**` 分页并集与 occurrence 投影一致，未知标签仍可公开。
- 同 URL 的不同观察不会因故事级去重而消失。
- 来源、内容、可信度、健康和访问标签不影响成员资格或默认时间顺序。
- 缺 key、来源阻断、legacy 报告失败不阻止已有公共信号发布。
- 官方、GitHub、社区、X/Builder、媒体/Newsletter、论文/模型、中文来源都有明确公开板块。
- 页面在 `1280x900` 下完成 source-first 浏览、筛选、链接访问和同页历史懒加载验收。

## legacy edited report 附录

legacy 报告可以为有限篇幅的编辑故事使用：一手/多源核验、相关性判断、事实与观点区分、摘要质量、故事合并与去重、时间窗口、栏目容量和 HTML 文案规则。

这些规则只能作用于 legacy 报告自身，并且必须在 occurrence 持久化之后运行。legacy 候选未入选、质量检查失败或整份报告未生成，都不能回写或阻断公共信号流。PR3 删除旧单日报公开页面后，此附录只保留为兼容历史数据和可选衍生物的说明。
