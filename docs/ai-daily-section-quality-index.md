# AI 日报来源与追踪能力索引

> **2026-07-14 适用范围：来源能力盘点。** 本索引不定义公共 occurrence 或 `docs/signals/**` 的准入、配额、年龄窗口和排序。凡能安全标准化的观察都进入公共流；source/content/credibility/health/access 只作标签、筛选和诊断。
>
> 下文关于完整榜单、事实核验、故事去重和编辑质量的要求，只适用于专门的追踪组件或可选 **legacy edited report**，不能擦除对应来源的原始观察，也不能阻塞公共信号发布。

本索引只记录仓库内能力和公开来源；不得写入本机绝对路径、访问 token 或临时工作树路径。

## 每日追踪来源

目标是保存“模型使用、模型能力榜单、coding agent 能力今天发生了什么变化”的可追溯观察，并在来源受限或快照不完整时明确标注状态。

### OpenRouter

信源：

- `content-openrouter-rankings`: `https://openrouter.ai/rankings`
- 官方 API 文档：`https://openrouter.ai/docs/api/api-reference/datasets/get-rankings-daily`
- 官方 API：`https://openrouter.ai/api/v1/datasets/rankings-daily`

当前能力：

- 无 key 路径使用 `source_kind: "openrouter_rankings_public_playwright"`。
- `discover:content-sources` 可从公开 Rankings 页面抽取 `This Week` 排名。
- 完整榜单可生成结构化追踪组件；不完整或抓取失败时仍保留来源观察及 health/access 状态，不伪造缺失行。

追踪组件要求：

- 有数据时展示 rank、model、provider、tokens、change。
- 说明这是 OpenRouter 平台内使用热度，不代表全市场份额或模型能力。
- 不在读者文案中暴露 Playwright、DOM 抽取、重试等运行日志。
- 不凭模型名推断详情 URL；没有可靠详情链接时保留榜单源 URL。

### Artificial Analysis

信源：

- `content-artificial-analysis-intelligence-index`: `https://artificialanalysis.ai/evaluations/artificial-analysis-intelligence-index`

当前能力：

- 已进入 source registry。
- 通用 `html_index` 可记录页面观察；专用解析器完成后再生成结构化榜单组件。
- 页面可访问但无法解析榜单时，不删除观察，标记解析/健康状态。

结构化组件可展示模型、供应商、分数，以及页面可得的速度、价格或 token 成本，并说明综合榜单不等于生产选型。

### SWE-bench Pro

信源：

- `content-swe-bench-pro-public`: `https://scale.com/leaderboard/swe_bench_pro_public`
- Scale 背景页：`https://scale.com/blog/swe-bench-pro`
- Hugging Face dataset：`https://huggingface.co/datasets/ScaleAI/SWE-bench_Pro`

当前环境可能遇到 403。403 只形成 `health: blocked` / `access: restricted` 观察，不能生成虚假的最新榜单变化，也不能成为其他来源的发布阻断。

结构化组件可展示 model/agent、Resolve Rate、rank，并说明 public、held-out、commercial/private subset，以及 scaffold、成本上限、任务集和置信区间对分数的影响。

## GitHub 报告、RSS/API 与聚合来源

目标是扩大公共观察面。聚合、中介、社区和官方来源都可以产生 occurrence；可信度和 directness 由标签表达，不以“是否能进入事实栏目”决定是否记录。

### GitHub 报告与周报

- `follow-builders`：读取公开的 `feed-x.json`、`feed-podcasts.json`、`feed-blogs.json`；尽量保留 X 原帖、博客原文和播客单集链接。
- `ML-Papers-of-the-Week`：使用 `github_report_markdown` 从 raw README 定位具体周报小节并解析条目。
- `Awesome AI News`：raw README 本身是开源 AI 信息聚合/工具目录观察；能回到具体 repo、产品页或公告时补 direct link。
- `ML & AI News of the Week`：使用 same-file anchor 定位报告小节；内容较旧时用事件时间和来源标签表达，不因年龄删除。

落地规则：

- `source_kind: "github_report_markdown"` 描述“README 索引 -> Markdown 报告 -> 报告条目”的抓取方式。
- 不使用全局 48 小时、源级 `lookback_days` 或报告周期作为公共过滤条件。事件时间只用于显示和默认时序。
- 聚合来源使用 `intermediary` / `indirect` 等标签，并保留 `source_report_url`；回链成功后可补 direct link。
- 表格中的 `Paper`、`Tweet`、`Code` 链接可以作为同一观察的相关链接；若其自身包含可安全标准化的独立内容，也可成为独立 occurrence。

### 官方 RSS 与公开页面

- OpenAI Blog RSS、Google DeepMind RSS、Google Research RSS、Microsoft Research、AWS ML Blog、Hugging Face Blog。
- Anthropic News、Meta AI Blog 等公开页面；RSS 不可用时保留页面入口和访问状态。
- TechCrunch AI、The Verge、MIT Technology Review、Ars Technica、VentureBeat AI、HNRSS、量子位、36Kr、InfoQ 中文等媒体与社区入口。

“官方”“媒体”“社区”“中文”只是 source tag。所有可访问来源都参与监听；feed 返回 HTML、404、403 或网络失败时记录 health/access，不以来源等级替代真实状态。

### 公开 API、论文与趋势

- arXiv / OpenAlex / Semantic Scholar：论文与研究观察。
- Hacker News Firebase / HNRSS：社区讨论和工程趋势。
- Hugging Face Daily Papers / Trending：论文、模型、数据集与 Space 趋势。
- GitHub Trending / Releases：项目与发布观察。
- Product Hunt：产品与社区热度观察。

Top 10、页面条数和 API page size 都只属于视图或传输批次，不是公共 occurrence 上限。应通过分页或后续恢复继续拉取。

### AI 新闻聚合站与 Newsletter

- Smol AI News、Latent Space、Interconnects 等适合发现遗漏和观点脉络。
- 聚合条目本身可公开，并标记 intermediary/secondary；能回链到公告、论文、仓库、产品页或采访原文时补充 direct source。
- 同一 URL 被多个来源提及应保留来源差异和独立观察身份，不在公共流中做故事级去重。

## 公共输出质量要求

- occurrence 输入满足 `input = occurrence + coalesced + normalization_error`。
- `coalesced` 只合并同一 observation 的重复行；同 URL 的不同来源/时间观察不合并。
- 未核验、间接链接、未知标签、不完整榜单和来源受限都不能成为公共成员门槛。
- health/access 只描述实际可达性，不把失败包装成来源“不够格”。
- 页面按来源属性组织，卡片展示摘要、链接、来源、时间和少量标签；raw audit、重试日志、内部评分和候选池不公开。
- 初始 48 小时视图只是前端默认范围；同页可懒加载全部更早记录，底层数据无年龄过滤。

## legacy edited report 边界

legacy 报告或专门的榜单组件可以要求完整行、事实核验、原始链接、故事合并和读者文案质量。其结果是 occurrence 之上的可选衍生物：失败、缺项或未入选不能回写 occurrence，也不能阻塞 `docs/signals/**`。

## 后续优先级

1. 实现 Artificial Analysis 专用解析器，同时保留通用页面观察兜底。
2. 为 SWE-bench Pro 使用稳定、公开、合规的官方入口或镜像，并准确标注访问状态。
3. 给追踪组件增加历史快照对比，例如 `rank_delta` 和 `new_entry`。
4. 展示“多个来源提到同一链接”的关联信息，同时保留每个 occurrence。
