# AI 日报板块质量索引

本索引用于后续迭代日报生成、固定信源扩展和质量验收。只记录仓库内规则、公开信源和实现状态；不得写入本机绝对路径、内部文档链接、访问 token 或临时工作树路径。

## 每日追踪板块

目标：回答“模型使用、模型能力榜单、coding agent 能力今天有没有值得关注的变化”，不是展示抓取运行日志。

### OpenRouter

信源：
- `content-openrouter-rankings`: `https://openrouter.ai/rankings`
- 官方 API 文档：`https://openrouter.ai/docs/api/api-reference/datasets/get-rankings-daily`
- 官方 API：`https://openrouter.ai/api/v1/datasets/rankings-daily`

当前实现：
- 无 key 路径已落地为 `source_kind: "openrouter_rankings_public_playwright"`。
- `discover:content-sources` 用 Playwright 打开公开 Rankings 页面，抽取 `This Week` Top 10。
- 快照写入 `source_audit.content_sources.sources[].snapshot`，再由 `report:draft` 转成 `daily_tracking` 公开卡片。
- 完整 Top 10 才可 `publish_to_public:true`；Top 10 不完整或抓取失败时只保留降级审计，不写公开榜单事实。

公开内容要求：
- 必须包含 Top 10 的 rank、model、provider、tokens、change。
- 必须说明这是 OpenRouter 平台内使用热度信号，不代表全市场份额，也不代表模型能力。
- 不得在正文写 “Playwright”“DOM 抽取”“抓取成功”等运行日志。
- 不得凭模型名推断模型详情 URL；没有可靠链接时只保留榜单源 URL。

### Artificial Analysis

信源：
- `content-artificial-analysis-intelligence-index`: `https://artificialanalysis.ai/evaluations/artificial-analysis-intelligence-index`

当前状态：
- 已作为固定追踪入口进入 source registry。
- 尚未实现专用解析器；通用 `html_index` 只能证明页面检查，不能产出榜单快照。

达标内容：
- Intelligence Index Top 10，至少包含模型名、供应商和分数。
- 如页面可得，补充速度、价格或 token 成本信息，突出能力和成本 trade-off。
- 说明综合榜单适合 shortlist，不等同于生产选型。

### SWE-bench Pro

信源：
- `content-swe-bench-pro-public`: `https://scale.com/leaderboard/swe_bench_pro_public`
- Scale 背景页：`https://scale.com/blog/swe-bench-pro`
- Hugging Face dataset：`https://huggingface.co/datasets/ScaleAI/SWE-bench_Pro`

当前状态：
- 已作为固定追踪入口进入 source registry。
- 当前环境可能遇到 403；blocked 可以证明检查过入口，但不能写最新榜单变化。

达标内容：
- Public leaderboard Top 10，至少包含 model/agent、Resolve Rate、rank。
- 必须区分 public、held-out、commercial/private subset。
- 必须说明分数受 scaffold、成本上限、任务集和置信区间影响，不能直接等同团队代码库修复率。

## GitHub 报告、RSS/API 与聚合源能力索引

目标：扩大候选池，降低日报单调和遗漏风险。允许重复入池，但聚合源和中介源不得直接作为事实写入 `main_items`；正文事实仍要回到一手或可信来源。

### GitHub 报告/周报项目

- `follow-builders`: Builder 观察的一手线索入口，优先读取 raw `feed-x.json`、`feed-podcasts.json`、`feed-blogs.json`。X 原帖、博客原文和播客原始链接可进入候选池；上游错误必须写入 `source_audit`。
- `ML-Papers-of-the-Week`: 不再读取 commits Atom，改为 `github_report_markdown`，从 raw README 定位最新 `years/YYYY.md#...` 小节，再解析论文表格。适合补齐“本周论文/研究趋势”线索。
- `HelloGitHub`: 不再读取 commits Atom，改为 `github_report_markdown`，从 raw README 定位最新 `content/HelloGitHubNNN.md`。适合补齐开源项目、工具、开发者实用项目线索，点击跳转链接会还原为真实 GitHub repo URL。
- `RuanYF Weekly`: 不再读取 commits Atom，改为 `github_report_markdown`，从 raw README 定位最新 `docs/issue-NNN.md`。适合补齐技术文章、工具、社会技术观察线索。

落地规则：
- `source_kind: "github_report_markdown"` 用于“README 索引 -> 最新 Markdown 报告 -> 报告条目”的二段抓取。
- 支持 `latest_report_link_pattern` 和源级 `lookback_days`，避免周报/月报被 48 小时窗口误杀。
- 候选 `verification_status` 默认为 `intermediary_only`，`notes` 保留 `source_report_url`。
- 通用链接标签如 `Paper`、`Tweet`、`Code` 不单独生成候选，避免把表格辅助链接当成独立新闻。

### 官方 RSS 与公开页面

已检查并适合继续作为核心官方/可信源的入口：
- OpenAI Blog RSS、Google DeepMind RSS、Google Research RSS、Microsoft Research、AWS ML Blog、Hugging Face Blog。
- Anthropic News、Meta AI Blog 使用 `html_index`；其中用户给出的 Meta AI RSS URL 当前返回 404，应保留页面入口而非假装 RSS 可用。
- TechCrunch AI、The Verge、MIT Technology Review、Ars Technica、VentureBeat AI、HNRSS、量子位、36Kr、InfoQ 中文适合作为 `community_lead` 或 `hot_blog` 线索来源。

需要显式记录降级的入口：
- 机器之心 RSS 当前返回 HTML 非 feed-like，抓取失败时应保留 `status:"blocked"` 或 `no_signal`，不得写未核验事实。
- Reddit `r/MachineLearning/.json` 当前可能 403；允许 cache fallback，但正文不得使用 blocked 响应中的未核验内容。

### 公开 API/论文与榜单

- arXiv cs.AI: 可作为论文候选入口，适合补“研究/模型方法”线索。
- Hacker News Firebase topstories: 需要二段 hydrate item，适合补社区讨论和工程趋势线索。
- Hugging Face Daily Papers: 页面可达，当前用 `html_index` 作为论文发现入口。
- Papers with Code API: 默认请求 `/api/v1/papers/`，若返回形态异常必须记录 blocked/no_signal。
- GitHub Trending: 仍是项目板块主入口；Top 10 覆盖、rank 和 star 变化是公开展示合同的一部分。

### AI 新闻聚合站

- Smol AI News、AI News Buttondown、Latent Space、Ben's Bites 都适合作为“遗漏兜底”和选题扩展。
- 这些来源的职责是告诉日报“哪些话题有人在关注”，不是替代一手来源。入正文前必须回链到原始公告、论文、代码仓库、产品页或采访原文。
- 允许重复，但候选池应保留来源差异：同一 URL 可重复出现为“多个来源同时提到”的信号；最终公开正文仍由去重和相关性规则控制。

## 测试索引

已覆盖：
- `parseOpenRouterRankingsText extracts public Top 10 rows`
- `collectContentSources stores OpenRouter public page snapshot without candidate pollution`
- `collectContentSources degrades OpenRouter snapshot when Top 10 is incomplete`
- `report:draft publishes OpenRouter snapshot as reader-facing daily tracking card`
- `GitHub report markdown parser extracts report links as discovery leads`
- `content source discovery reads latest GitHub markdown report instead of commit feed`
- `registered discovery sources cover the user requested AI source list`

必跑命令：
- `npm run sources:validate`
- `node --test tests/unit.test.js --test-name-pattern "GitHub report markdown|latest GitHub markdown|registered discovery sources cover the user requested AI source list"`
- `npm run validate`

## 质量要求

- 不再把 GitHub 报告项目的 commits Atom 当作内容源；commit feed 只能证明仓库有人提交，不能证明报告内容已被读取。
- 对长周期报告源，不用全局 48 小时窗口做硬过滤；改用源级 `lookback_days`。
- 聚合源入池时必须写 `source_report_url`、`intermediary_only` 和 primary verification 提醒。
- 若分类成本过高，优先保证“哪些来源有更新、内容是什么”进入候选池；分类和去重可以在 draft 阶段再做。

## 后续优先级

1. 实现 Artificial Analysis 专用解析器。
2. 为 SWE-bench Pro 寻找稳定公开镜像或官方可解析入口。
3. 给 `daily_tracking` 增加历史快照对比，输出 `rank_delta` 和 `new_entry`。
4. 将聚合源“多源同时提到同一 URL”转成候选权重，而不是只做最终去重。
