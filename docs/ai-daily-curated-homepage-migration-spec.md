# AI Daily 精选首页三层迁移规格

<!-- curated-edition-contract:v1 -->

Status: `accepted-target / implementation-pending`

Accepted: `2026-07-15`，覆盖已确认的 `D1-A / D2-A / D3-A`、`D1-B`、后续 `D4–D30` 逐批接受项，以及 Aify「今日精选」可信上游直通扩展。

Baseline: `origin/main@2c632d3881dc89e25d14f49889a5539dc49d69e0`，校验时 `HEAD...origin/main = 0 0`。该提交仍运行 `public-signal-stream-contract:v1`；本文是下一阶段产品与迁移权威，不是已实现证明。

## 1. 权威、目标与完成定义

`curated-edition-contract:v1` 是本文独占的 owner marker。其他文档只能使用 `curated-edition-contract-ref:v1` 引用本文，不得复制 owner marker 或另行定义行为。

本文同时拥有三项交付：

1. **可执行规格**：定义数据生命周期、准入、精选、摘要、专项模块、来源身份、AI 边界与失败行为。
2. **分阶段迁移计划**：定义每一阶段的前置依赖、文件落点、退出门、回滚点和不得提前删除的资产。
3. **验收清单**：以 P0/P1/P2 ID、真实 fixture、断言和命令约束实现，不接受“页面能打开”作为内容质量证明。

产品完成的判断不是“抓到了很多链接”，而是读者在不打开链接时，能从真实来源、真实日期、标题和事实摘要/上游编辑描述判断：**这是什么、发生了什么、是否值得打开**。

### 当前运行事实与目标权威

| 层面 | 当前运行事实 | 本文接受的目标 |
| --- | --- | --- |
| 原始采集 | 安全规范化 occurrence 直接进入公开 `docs/signals/**` | 原始 observation 私有保存并接受确定性低门槛准入 |
| 持久信源池 | 与原始公开 occurrence 基本同义 | `/signals` 只展示通过低门槛的干净持久池 |
| 默认首页 | 近 48 小时按 source group 的时间流 | `/` 展示当日高门槛精选 edition |
| 历史数据 | 旧 baseline 与新 occurrence 合并为公开流 | 切换日以前的现有数据冻结为只读 legacy archive |
| 卡片 | 一个通用 `SignalCard` | 通用基线 + GitHub/X/论文/模型/Benchmark 专用组件 |
| 摘要 | 可能为空、复述标题或混入内部核验话术 | 普通来源使用原文支撑的一句话事实摘要；可信 Aify Today Picks 原样使用上游编辑描述；入选理由单独且不公开 |

### 1.1 完整产品工作流与原始 11 点覆盖

本文不得再被缩写成单纯的“数据管线改造”。已接受范围由八条同时交付、分别验收的产品工作流组成；某条后端数据存在但读者表面没有正确呈现，或页面存在但数据语义仍错误，都不算完成。

| 工作流 | 原始问题 | 可观察交付 | 主要交付 PR |
| --- | --- | --- | --- |
| 编辑产品模型 | 2、6、11 | raw、低门槛持久池与高门槛 edition 分层；公开摘要只解释材料内容，内部入选理由永不冒充正文 | PR4、PR5 |
| 信源资产与效果 | 4、9、10 | 历史来源、用户明确链接和当前 registry 逐项对账；官方工程博客、repo/blog、Aify、newsletter/digest 与采集器角色清楚；有效性以 funnel 而非配置数量证明 | PR1、PR3 |
| 专项采集与语义 | 4、5、8、9 | Aify Today Picks、工程实践、GitHub Top10、X 白名单、Paper、Model、Benchmark 各自保留必要字段与诚实失败状态 | PR3、PR4、PR5 |
| 前端信息架构 | 2、5、7、8、9 | `A.D.C.` masthead、全局 ranked 双列流、分级 rail、日期/revision、`/editions`、`/signals`、`/legacy` | PR6 |
| 视觉系统 | 1、3、7、9 | 保留当前暖纸张视觉；修正首屏密度、可读字号、摘要截断、token 双权威、圆角来源 icon 与浏览器 favicon | PR1 记录、PR6 实施 |
| 历史能力存续 | 3、5、7、8、9 | route/component/data/asset/test 五层 `keep / move / retire` 清单；每个替换 PR 更新，不凭印象恢复或删除 | PR1、PR6 |
| 发布与迁移 | 6、7、10 | shadow 真实运行、last-good、不可变 revision、legacy manifest、完整 generation 原子切换与回滚 | PR3–PR7 |
| 质量与真实验收 | 全部 | 统一生产回放 fixture、source funnel、`1280x900` 浏览器证据、连续七次自然运行；不得把 schema 绿灯等同于读者价值 | PR1–PR7 |

八条工作流是范围视图，Phase 0–5 是依赖视图，PR1–PR7 是合并与回滚视图；三者不能再相互冒充。具体 PR 边界由第 13 节独占。

迁移完成前，当前 lossless 代码与数据仍是运行事实；任何文档、PR 或交付不得把本文的目标行为写成 `implemented`、`stable` 或 `production_verified`。

## 2. 产品范围

### 2.1 读者表面

- 产品是面向 AI 行业全局的中文日报，不是 builder-only、工程-only 或官方发布目录。产品/能力、工程/开源、研究/评测、商业/市场、政策/治理都可入选，但“覆盖全面”不降低硬排除、事实摘要和高门槛精选标准；显式 allowlist 的可信上游编辑直通是来源级合同，不是全局降门槛。
- `/`：当日精选 edition；读者意图组织，不按采集器或 source group 组织。
- `/editions/?date=YYYY-MM-DD`：切换日后的精选日报永久链接；`/editions/` 无日期时读取 edition index 并打开最新可用日期。首页提供前一日/后一日与日期选择，不让历史 edition 只剩 JSON。
- `/signals`：切换日后低门槛持久信源池的 public-ready 投影；按来源组、日期、主题与载体浏览/筛选，保留近况、历史和渐进加载。`pending/failed` 摘要成员留在内部池，不生成无摘要卡片。本版不提供全文搜索。
- `/legacy`：切换日前公开 occurrence 的只读归档，并提供旧 dated editorial report 的 React 只读适配视图。旧报告必须标为 `legacy / unverified`，不参与新 edition、新 pool、首页 rail 或默认发现结果；不得恢复旧 renderer。
- 内部诊断：repo-safe raw observation、拒绝码、rubric、`selection_reason`、source funnel 明细不投影到 Pages；短期 material/quarantine 只存在于 ignored `.tmp`。内部不等于可以保存秘密，所有仓库持久化内容都必须按公开 Git 历史的标准清洗。

### 2.2 非目标

- 不恢复旧静态 renderer、旧日报模板或第二套兼容 UI。
- 不把 source audit、候选分数、拒绝理由或机器日志搬到公开页。
- 不在前端提供 X 白名单、信源注册或编辑规则的修改入口；维护者直接改项目代码/config。
- 不为凑够条数发布无意义内容，不为“丰富”继续公开联系页、产品入口、合作稿或测试数据。
- 不新增移动、平板、窄屏或触摸专用设计；仓库当前唯一产品验收 viewport 仍为 `1280x900`。
- 本版不定义一个伪精确总分或固定权重；普通来源先用硬排除、五维编辑量表和栏目预算，可信上游直通使用上游顺序与机械版面门。
- 不实现跨数万条历史的全文搜索、静态搜索索引或“只搜当前已加载六条”的伪搜索；首页 rail 只筛选当期 10–14 条精选，不等同于历史搜索。

### 2.3 GitHub Pages 静态路由合同

这些 URL 不能依赖服务端 rewrite 或 React Router fallback。构建必须从同一 React bundle 生成真实目录入口：`docs/index.html`、`docs/editions/index.html`、`docs/signals/index.html`、`docs/legacy/index.html`。

- `src/web-app-build.js` 拥有四个 entrypoint 及 `WEB_APP_GENERATED_FILES`；嵌套入口必须把 bundle asset URL 确定性写为 `../assets/**`，根入口使用 `./assets/**`。
- `apps/web/src/data.ts` 按 pathname/query 选择数据：`/` 读 latest edition pointer；`/editions/?date=...` 先校验日期存在于 edition index 再读对应 dated JSON；`/signals/` 读同目录 clean-pool index；`/legacy/` 读 legacy manifest/index。不得用相对当前页面的裸 `signals/index.json` 猜测路径。
- `/signals`、`/legacy`、`/editions` 可以由 GitHub Pages 规范化为尾斜杠，但直达、刷新和站内链接必须保留语义；不存在/非法 edition 日期显示明确 404/empty state，不能回退到 latest 冒充该日。
- `src/site.js`、`src/publish.js` 和 managed-file cleanup 必须登记这些 HTML 入口、route data 与 assets；原子 generation 不得留下 HTML 指向旧 JSON 或新 JSON 配旧 bundle。
- `/` 与 dated edition 只能引用 edition item；`/signals/` 只能读取 post-cutover admitted pool 中 `summary_status: ready` 的成员；`/legacy/` 的成员集合、文件集与数量必须与 immutable manifest 完全一致。

### 2.4 日界线、窗口与修订

- 所有 edition 日期、截止时间和前后日导航以 `Asia/Shanghai` 为唯一业务时区；源材料保留原始时区并另存规范化时间。
- 当期候选窗口从**上一次成功 edition 的 cutoff（不含）**到当前计划 cutoff（含）；若中间停更超过 48 小时，窗口强制截到当前 cutoff 前 48 小时。更早材料仍可进入持久池，但不能冒充“今日新发生”进入 edition。
- 同一天的每次成功发布都生成不可变的 `edition_revision` 和递增 revision ID；latest pointer 可以前移，既有 revision 文件不得覆盖。进入下一个上海自然日后，前一日常规版冻结。
- 后续发现事实错误时只追加 `correction` 或 `tombstone`，记录替代对象、原因、时间和证据；不得静默重写历史 JSON。公开 dated view 默认展示最新有效 revision，并可查看修订/更正记录。

## 3. 三层数据生命周期

```text
collectors
  -> ephemeral material（ignored .tmp，最长 24 小时）
  -> raw_observation（内部、repo-safe 的观察元数据）
  -> deterministic admission
       -> rejected / needs_review（ignored quarantine + repo-safe receipt）
       -> admitted_signal（低门槛持久池）
            -> source_summary readiness
                 -> pending / failed（保留成员，不公开）
                 -> ready（投影到 /signals/）
            -> ordinary: material fetch + LLM-assisted editorial review
            -> trusted upstream: editorial_ready passthrough（零二次语义处理）
            -> deterministic budget / dedupe / schema gates
            -> edition_item（当日精选）
```

### 3.1 实体与所有权

| 实体 | 成员资格 | 必要字段 | 禁止字段 | 目标存储 |
| --- | --- | --- | --- | --- |
| `raw_observation` | 每次技术上安全且完成落盘前清洗的采集观察 | `observation_id`、安全 material URL 或不可逆 URL hash、publisher hint、collector、已清洗原始标题与短摘录、作者/handle、发布时间、采集时间、fetch/parse 状态、content hash | 凭据、签名参数、私网/本机 URL、cookie/header、secret text、完整响应正文、公开展示结论 | `reports-data/observations/YYYY/MM/YYYY-MM-DD.json.gz`；内部但必须 repo-safe |
| `admitted_signal` | 通过低门槛准入的内容材料，或通过显式 allowlist 的可信上游编辑直通合同 | `signal_id`、`canonical_url`、`event_cluster_id`、内容发布者/材料来源、`source_role`、`collected_via[]`、真实标题/日期、`summary_status`、可空 `source_summary`、`summary_origin`、`topic_path`、`content_format`、source identity、observation refs、admission receipt；可信上游另存 `editorial_source`、`upstream_selection_date`、`upstream_position`、`upstream_tags[]`、`upstream_snapshot_hash`、`review_policy` | rubric、`selection_reason`、内部 prompt、原始整页正文 | `reports-data/signals/YYYY/MM/YYYY-MM-DD.json.gz`；仅 `summary_status: ready` 投影到 `docs/signals/**` |
| `edition_item` | 通过高门槛编辑判断并满足版面合同 | `edition_date`、`item_id`、signal/event refs、全局 `rank`、display title、`one_line_summary`、可选 `why_it_matters`、`topic_path`、`content_format`、card variant、专项 DTO | 未证实数字、入选标准文案、候选分数、公开 core/supporting 等级 | `reports-data/editions/YYYY/MM/YYYY-MM-DD.json`；公开投影到 `docs/editions/**` |
| `edition_selection` | 每个被评估候选一条内部决定 | 普通候选的五维量表，或可信上游候选的 `review_policy/upstream_position`；证据 refs、`selected/rejected`、`selection_reason`、预算/去重决定 | 任何公开页面字段 | 私有 selection artifact |

`source_summary` 来自 feed 或材料本身的事实描述；`one_line_summary` 是 edition 的忠实中文概括；`why_it_matters` 解释不同于摘要的信息影响；`selection_reason` 只解释为什么入选。普通来源的 `source_summary` 若通过更严格的 edition 事实、语义、长度和标题重复校验，可以原样复用为 `one_line_summary`；上下文或事件聚合需要变化时才重写。Aify「今日精选」直通项是明确例外：`summary` 原样成为 `source_summary` 与公开摘要正文，不做重写、截写、翻译、claim-span 二次验证或长度改造；完整值必须保存在公开 DTO 并默认完整展示，本阶段禁止用不可展开的 line clamp 隐藏正文。

### 3.2 身份、规范化与去重

- `observation_id` 表示一次来源观察；同一内容被多个 collector 发现时保留所有 observation lineage。
- `canonical_url` 去除 fragment、跟踪参数和凭据，规范 query 顺序；同一 canonical URL 的无变化重复观察在 signal 层合并。
- 同一 canonical URL 的重复 observation 可合成一个 signal；不同 canonical URL 即使描述同一事件，也保持为持久池中的独立 signal，不因 `event_cluster_id` 改写 URL、抑制成员或丢失各自摘要/lineage。
- `event_cluster_id` 只供 edition 做**可逆聚类**：selection artifact 记录全部成员、代表 item、附加来源和撤销理由，首页只呈现一张代表卡并把其他来源附在该卡。模型只能提出 cluster；确定性 identity/schema gate 决定是否采用。无法确认同一事件时 fail-open，保持为独立卡片/候选，不在 pool 层强合并。
- Aify、Smol AI News、Latent Space、newsletter/digest 等站点发布的**具体文章或日报页**可以直接成为内容发布者/材料来源，卡片链接其自身材料即可，不要求逐条改链到其引用的原始新闻；除下述 Aify「今日精选」显式直通合同外，它们仍须通过同一低/高门槛，首页、搜索页、联系页和产品入口不因此合格。
- Aify「今日精选」是唯一首批 allowlist 成员，`review_policy: aify_today_passthrough_v1`。首页本身只是 collection endpoint，不成为 signal；只有首页内嵌、与公开「今日精选」有序集合一致的子条目可直通。`articles.json` 全量归档、其他 tab、搜索结果和站点外推集合均不属于该合同。
- 直通项通过机械安全门后直接写为 `admitted_signal + summary_status: ready + editorial_ready: true`，并成为 prequalified edition candidate；其标题、描述、材料 URL、publisher label 与上游 tags 原样保存。不得重新抓原文复核、调用 LLM 摘要/翻译/评分、追加“需回溯一手源”话术，或要求普通候选的 editor/critic/semantic verifier。
- 当同一 canonical URL 同时来自 Aify 与其他采集器时，Aify 标题、描述与 tags 是首选展示 payload，其他来源只追加 lineage；不同 URL 仍遵守 pool 保留、edition 可逆聚类的既有规则。
- 当 Aify、RSS、follow-builders、Tavily、搜索 provider 或其他渠道只是发现另一份材料时，真实内容发布者与 `collected_via` 必须分开；采集器不得冒充作者或内容发布者。同一站点可在一个 item 中是内容发布者、在另一个 item 中是采集器，角色按 item 判定。
- release、benchmark、榜单等持续页面以 `state_hash` 判断是否有实质更新；状态未变不生成新 signal 或新 edition item。
- 旧历史不按新规则重算。切换日 manifest 记录文件集、SHA-256、实际条数和 immutable 状态；`2026-07-15T03:34:30.755Z` 快照的 `27,038` 条只是迁移基线证据，不是硬编码的最终数量。
- 历史 Anthropic harness-engineering 等好内容只作为规则与回放 fixture，证明“同类新内容应进入工程实践”；它们不 seed/backfill 新 pool，也不产生 cutover 后的 edition item。只有 cutover 后真实发布或发生可验证新状态的材料才能进入生产 funnel；若未来需要精选旧文，必须另行接受显式 backfill 产品决策。

### 3.3 Raw、material 与 quarantine 隐私边界

“内部”只表示不进入 Pages，不表示仓库可承载秘密。仓库及其 Git 历史按可公开读取处理：

- fetch response、完整正文和待清洗提取结果只允许进入 ignored `.tmp/ai-daily/materials/<run-id>/`；成功或失败收尾都删除，下一次启动强制清理超过 **24 小时**的残留。
- admission quarantine 由 `src/signal-admission.js` 生成，受 `schemas/signal-quarantine.schema.json` 约束，目标路径是 ignored `.tmp/ai-daily/quarantine/<run-id>.json`；只含 observation ref、确定拒绝码、repo-safe host/URL hash、时间和安全短摘录，不含完整正文或原始请求数据，并遵守同一 24 小时清理上限。
- credential、cookie、authorization/header、签名/secret query、私网或本机 URL 在日志或任何磁盘写入前即删除；`unsafe_url` 只持久化不可逆 hash、可安全公开的 host（若有）和拒绝码，绝不保存原字符串。
- `reports-data/observations/**` 只保存已清洗的 repo-safe 元数据；持久 admission/source-funnel receipt 只保存安全 ID、计数和枚举原因。需要长期保存的事实摘要必须来自已准入 material，不复制完整原文。
- Phase 1A/1B 必须扩展现有 `src/privacy.js` / `scripts/scan-public-artifacts.mjs`，让 URL credential、secret query、私网 host、本机路径和内部 secret patterns 同时覆盖 `reports-data/observations/**`、新 signal/edition artifacts 与持久 receipts；任何 finding 阻断写入和发布。

## 4. 低门槛持久池合同

### 4.1 确定性准入

低门槛阶段不调用 LLM 决定成员资格。适配器、URL/page classifier、正文解析、日期/来源解析、规则和去重结果产生三态：`admitted`、`rejected`、`needs_review`。只有 `admitted` 进入新 `/signals`。Aify「今日精选」仍经过这一层的 URL、结构、新鲜度、隐私和重复机械门，但不接受内容质量再判断。

一条内容必须同时满足：

1. 有安全、可公开、指向材料本身的 HTTP(S) URL。
2. 能识别真实 publisher、标题和事件/发布时间；若只有采集时间，可留在 raw，但不能冒充发布时间进入精选。
3. 能抽取足以说明链接内容的正文、摘要、README、原帖或结构化榜单数据；Aify 直通项以其上游 `summary` 作为已经完成的编辑摘要，不再读取落地页正文。
4. 与 AI 产品、模型、研究、工程、开源、应用、产业或政策存在具体关系。
5. 相对已有 canonical/event/state 记录有新增信息。
6. 不命中下列硬排除。

### 4.2 硬排除与拒绝码

| 拒绝码 | 必须拒绝的情况 | 回放样例 |
| --- | --- | --- |
| `unsafe_url` | 非 HTTP(S)、带凭据、泄密参数、私网/本机 host 或无法安全公开；原字符串不得落盘 | secret/signature/private URL |
| `non_content_endpoint` | 首页、产品入口、联系页、登录页、邮箱保护、空栏目页；Aify 首页只可产生 lane health/snapshot receipt，不可作为内容 item | `pika.art/cdn-cgi/l/email-protection`、`Contact`、`Blog` |
| `empty_or_unparsed` | 无正文、只有导航/标题、原帖身份或 README/榜单数据无法取得 | 空 X 记录、空壳站点 |
| `test_or_placeholder` | TEST、fixture、占位、错误页、未完成草稿 | Aify `TEST2`、`TEST_S` |
| `internal_instruction_copy` | `Treat this as...`、`优先核查`、`trace it to...` 等给 AI/编辑看的内部话术 | 2026-07-15 production regression |
| `corporate_pr_without_substance` | 纯合作、签约、获奖、参会、品牌公关，且无具体产品/研究/工程变化 | 企业合作稿 |
| `promotion_or_hiring` | 招聘、活动报名、优惠、销售、泛营销 | careers/event landing |
| `off_topic` | 与 AI 目标范围无具体关系 | 泛科技/商业噪声 |
| `duplicate_no_new_state` | canonical/event/state 与既有 signal 相同，没有新事实 | 同一榜单重复行 |
| `stale_without_update` | 旧内容被重新抓取但没有新进展 | 历史首页重复收录 |

实际产品/模型发布即使来自官方也不是“产品入口”；它在能读到具体变更、能力、访问方式或限制时可以入池。社区观点和单源线索也可入池，但必须有可读原文、明确身份和恰当类型，不能用“待核”给空内容兜底。

### 4.3 持久池公开字段

`admitted_signal` 的持久成员资格与公开就绪状态分离。普通来源在准入后按以下顺序生成一句 grounded `source_summary`：优先使用通过语义/隐私校验的 source synopsis；否则在 admission 之后让 LLM 基于 content-hash 绑定的 material 提议一句摘要，再由确定性 copy/schema gate 校验。标题复读、内部话术、无证据概括和占位文案均不合格。

Aify「今日精选」不走上述摘要生成链：专用适配器把上游 `summary` 原样存为 `source_summary`，写 `summary_origin: upstream_editorial`、`editorial_source: Aify News`、`review_policy: aify_today_passthrough_v1`，机械门通过即为 `ready`。该文本不进入 prompt；只允许 Unicode/换行/控制字符安全规范化与 HTML escape，禁止内容改写。

- 摘要失败不会删除或拒绝 signal，而是写 `summary_status: pending | failed` 与安全失败码，继续保留在内部持久池并可重试。
- 公开 `docs/signals/**` 和 `/signals/` 只投影 `summary_status: ready` 且 `source_summary` 非空的成员；不得显示“摘要不可用”、标题复读或入选说明来凑卡片。
- source funnel 分开记录 `admitted` 与 `displayed`；`pending_summary` 是未展示的明确原因，不得把它计为 source effective。

公开 `/signals` 卡片只包含：真实标题、材料 URL、一句事实性 `source_summary`、内容发布者/作者、`source_role`、`collected_via[]`、发布时间、`content_format`、`topic_path`、source identity/icon、健康/访问状态和必要 lineage。`collected_via[].url` 可空/省略：有安全稳定地址才链接，没有则纯文本；绝不回退成 material URL 伪造采集器链接。拒绝码、raw text、rubric、分数、prompt、`selection_reason`、私有路径不得出现。

## 5. 高门槛精选合同

### 5.1 编辑量表

除显式可信上游直通候选外，每个候选按五个维度分别记录 `0 / 1 / 2`，但**不得求和后用单一阈值自动入选**：

| 维度 | 0 | 1 | 2 |
| --- | --- | --- | --- |
| 影响力 `impact` | 局部或无明确变化 | 对一个重要群体/产品有影响 | 改变广泛能力、生态、研究或工程方向 |
| 实用性 `utility` | 读完难以采取行动 | 提供可参考信息 | 可直接复用的方法、工具、决策或实现细节 |
| 新颖性 `novelty` | 重复/无新状态 | 有增量 | 新能力、新证据或显著状态变化 |
| 信息密度 `information_density` | 公关/空话 | 有具体事实 | 多个相互支持的关键事实且可压成清晰卡片 |
| 证据质量 `evidence_quality` | 不可追溯 | 单一可识别材料 | 一手材料或可交叉验证的高质量证据 |

LLM 可提出量表和 `selection_reason`，但确定性校验负责硬排除、证据引用存在、预算、公司上限、跨模块去重和 schema。候选证据不足时少发，不补位。

Aify「今日精选」直通项不生成五维量表、`core/supporting` 或新的 `selection_reason`；`editor/critic/semantic verifier` 调用数必须为 0。它以 `candidate_tier: trusted_editorial` 进入版面编排，并保留 `upstream_position` 与上游 `quality_score`（若存在）作为来源提供的排序证据，不把该分数公开或重解释。

### 5.2 两级入选、数量与重复约束

普通候选进入版面预算前先执行硬资格门：`novelty >= 1`、`information_density >= 1`、`evidence_quality >= 1`，任一为 0 都不得入选。通过后只分为两个**内部编辑层级**：

- `core`：`impact = 2` 或 `utility = 2`；优先按全局重要性选择。
- `supporting`：`impact = 1` 且 `utility = 1`；只能补充已具备价值但影响范围较窄的材料。

`core/supporting` 只存在于 `edition_selection`，不得显示为公开等级、徽标或 rail。`supporting` 最多占当期主编区的三分之一且绝对不超过 4 条；实现按 `min(4, floor(selected_count / 3))` 校验，并始终在 core 之后填入。

Aify 直通集合全部进入 ready pool 和 prequalified candidate 集合，不等于把上游整批铺到 `/`。edition 只执行确定性的 canonical/event 去重、公司/专项/总量上限、多样性与全局版面编排；这一步是展示容量控制，不是二次内容复核。排位优先级为“明确的重大一手 core → Aify `trusted_editorial`（保持上游顺序）→ 其他 core → supporting”；同一事件有 Aify payload 时优先使用其标题/描述/tags。Aify 不设硬展示配额，也不得挤掉重大一手变化或突破既有上限。

- 正常精选主编区为 **10–14 个唯一 edition item**；GitHub Top10 独立于这个总量。
- X 的软目标为 **1–2**、硬上限 **3**；论文/模型合计软目标为 **1–2**、硬上限 **3**；两个 lane 都允许为 0。Benchmark **最多 1**。
- **5–9 条**时发布诚实的 short edition 并记录 `qualified_shortfall`；**0–4 条**时不生成当日 edition 指针，保留带真实日期的 last-good edition，并将当前期标记为 `delayed/degraded`。任何区间都禁止以低质量内容补位。
- 同一公司最多 **3 个 item**，这是硬上限，不允许 override。同一事件的多来源 cluster 只算一个。
- 同一 `canonical_url` 或 `event_cluster_id` 只能有一个全局主排名，不得因主题、载体或 rail 筛选重复生成卡片。
- 每期先按重要性生成稳定的 `#01–#14` 全局顺序；主题、载体、X/Paper/Model 类型只负责解释与筛选，不改变该顺序。
- 先用 **7–14 天 shadow 校准**记录“采集覆盖不足、摘要失败、硬资格失败、版面上限”各自造成的短缺。只能据证据调整信源或人工复核规则，不得自动降低硬排除或资格门。

## 6. 摘要与来源展示标准

### 6.1 卡片公共文案

每个通用卡片依次展示：

1. 全局排名、真实内容发布者/作者、域名/handle、圆角 source icon、来源角色和真实发布时间。
2. 原始标题；需要中文时另存忠实 `display_title`，不得覆盖 `source_title`。
3. 一句 `one_line_summary`：回答“谁/什么做了什么，结果或范围是什么”，一条完整句，建议 25–120 个中文字符。普通来源中通过 edition 严格校验的 `source_summary` 可以直接复用；Aify 直通项显示其上游 description 原文，不受 120 字建议限制，也不得为了卡片长度改写。
4. 可选 `why_it_matters`：只在能提供不同于摘要的影响或可用性判断时显示。
5. 一组主题 + 载体标签、公开采集渠道和材料直链。

公开文案不得出现：

- “因为符合入选标准”“优先核查”“值得关注”“持续观察”等 admission/selection 语言；
- 标题原样复读、只说“某公司发布更新”、只说“链接显示……”；
- 无材料支撑的数字、比较、因果或用途；
- 以采集时间冒充发布时间；
- AI 内部指令、审计字段、candidate score 或拒绝理由。

正文读取或 LLM 失败时，不生成通用假摘要。signal 可带 `summary_status: pending | failed` 留在内部持久池，但未 ready 前不得投影到公开 `/signals/`，edition 也不得提升该条。edition 整体失败时，已 ready 的 `/signals/` 仍可发布，首页保留明确日期的 last-good edition，不能把 raw/pool 流伪装成今天精选。

公开首页不显示常态化的“一手”“单源转述”“社区线索”“待核”等可信度 pill；`pending/needs_review` 根本不得进入首页。只有确实改变读法的异常状态才允许徽标：`多源`、`已更正`、`来源不可用`、`数据降级`。

### 6.2 来源身份、采集器与 icon

- 复用 `src/link-icons.js`、`src/source-icon-cache.js` 的域名解析、GitHub 统一 icon 与首字母 fallback，不重新造第二套注册表。
- 后端在 DTO 写入 `source_identity.icon_url`、`icon_kind` 与 fallback 元数据；前端只负责呈现。
- 默认使用 `18×18` 图像置于 `22×22` wrapper，`border-radius: 6px`；首字母 fallback 使用相同圆角和尺寸。
- 图标是来源识别，不替代 publisher/域名文字，不得撑高标题行或成为大图。
- 每张公开卡必须同时显示内容发布者/作者及人类可读的 `source_role`、一项 L1/L2 主题路径、一个 `content_format`，以及所有促成发现的采集器。采集器有安全稳定 URL 时可点击；没有时显示纯文本“采集自 …”，不得伪造链接。
- 内容发布者、摘要编辑来源与采集器是三个可分离角色，不是可信度高低。Aify/Newsletter 可以是当前材料的发布者，也可以是另一材料的采集器；Aify「今日精选」外链条目使用行内 `source` 作为 publisher label、Aify 作为 `editorial_source` 与 `collected_via`，材料 URL 使用上游 `url`。只有材料 URL 本身属于 Aify 时，Aify 才同时是 publisher。角色必须逐 item 判断。

目标元信息示例：

```text
Aify News · AI 新闻聚合 | 工程与开源 / 工程实践 · 文章 / 博客 | 采集自 RSS
Anthropic · 官方工程博客 | 工程与开源 / 工程实践 · 文章 / 博客 | 采集自 Aify
Simon Willison @simonw · 独立开发者 | 工程与开源 / 工程实践 · X 帖子 / Thread | 采集自 follow-builders
```

## 7. 信息架构与专项模块

首页保留当前信息流的双列卡片节奏，但改为**一条全局重要性顺序**：主编区按 `#01–#14` 排列 10–14 个 edition item，X、Paper、Model 等类型留在该顺序中，不再各自分组后重新排序。GitHub Top10 是独立紧凑排行表；Benchmark 有变化时是独立锚点/聚合组件。首页不再设置“今日五条”或 lead/secondary 重复入口。

### 7.1 左侧 rail 双轴分类

rail 是当期 edition 的分层筛选器和专项锚点，不是来源组目录、公开重要性等级或全文搜索。目标树如下：

```text
本期
  全部精选 <count>

主题
  产品与能力
    模型 / 平台发布
    Agent / 应用
    多模态 / 具身
  工程与开源
    工程实践
    开发工具 / 框架
    推理与部署
    数据 / RAG
  研究与评测
    论文 / 方法
    模型 / 数据集
    评测 / Benchmark
    安全 / 对齐
  商业与市场
    定价 / 访问变化
    企业采用
    融资 / 并购
    算力市场 / 供应链
  政策与治理
    监管 / 合规
    版权 / 隐私
    地缘 / 出口管制

载体
  文章 / 博客
  Newsletter / Digest
  X 帖子 / Thread
  论文 / 模型卡
  GitHub 仓库 / Release

专项
  GitHub Top10
  Benchmark 变化
  持久信源池
```

- L1 主题始终可见；L2 只在当期至少有一个 item 时显示，避免空分类拉长 rail。
- 点击 L1/L2 或载体只筛选当前 edition，保留原有全局 rank，可使用 `?topic=` / `?format=` 形成可返回链接；不得跨 shard 拉取历史，也不得声称这是 D28 已拒绝的全文搜索。
- GitHub Top10 与 Benchmark 是页内锚点；“持久信源池”进入 `/signals/`，不是 edition filter。
- 每个 item 必须有一个 L1/L2 `topic_path` 与一个 `content_format`。X、Paper、Model 是载体/卡片类型，不是互斥主题。

2026-07-15 对 [Aify News](https://aify-news.pages.dev/) 的只读核对表明，其可参考之处是高密度信息流、明确来源/日期和不点链接也能理解的事实摘要；本文不复制其视觉。Aify 的具体文章/digest 可以作为直接内容材料，Aify 作为发现渠道时则公开标为采集器。

### 7.2 Aify「今日精选」可信上游直通

当前线上事实是：首页 HTML 内嵌 `const ARTICLES_TODAY = [...]` 作为「今日精选」成品集合；2026-07-15 只读快照包含 **80 条**（当日 21 条、前一日补位 59 条），而 `articles.json` 是 **4,501 条**全量归档。数量是观察证据而非永久常量；成员资格权威是上游当次 `ARTICLES_TODAY` 有序集合，不能把全量归档、本地重算结果或首页 shell 冒充为「今日精选」。

Phase 1A 必须使用专用 `aify_today_html`（命名可等价）适配器，而不是通用 `search_api`：

1. 只请求 `https://aify-news.pages.dev/`，要求同 host HTTPS redirect、`200 text/html` 和配置化响应体上限；不得执行/eval 页面脚本。
2. 以括号平衡扫描提取唯一的 `ARTICLES_TODAY` JSON literal，同时读取 `SITE.last_updated`/snapshot hash 并确认「今日精选」栏目标识。标记缺失、重复、JSON/schema 漂移、站点尚未更新或旧 cache 冒充今日时，整条 lane fail closed/degraded；**严禁静默回退到 `articles.json`**。
3. 每项原样保留 `title`、`summary`、`url`、`date`、`source`、`quality_score`、`flavors`、`domain`、`channels_l1`、`channels_l2`、`companies`、`products` 与上游位置。`flavors/domain/channels_*` 作为 `upstream_tags[]` 双存；到 ADC `topic_path/content_format` 的映射必须确定性、版本化，未知 tag 透明保留并标 `unmapped`，不得让 LLM 重分类。直通项不生成新的 `display_title` 或 `why_it_matters`；除安全 escape 外，读者看到的标题和描述就是 Aify 上游值。
4. 每项必须有非空纯文本 title/summary/source/date、安全公网 HTTP(S) material URL 和至少一个上游 tag；日期只能是本期或 Aify 自身随快照提供的前一日补位。未来日、更老日期、测试/占位、内部指令、HTML/script/NUL、超长异常字段、非内容 endpoint 与危险 URL 逐项隔离并记录拒绝码。
5. 通过项保持输入顺序，写 `upstream_selection_date`、`upstream_position`、`upstream_payload_hash`、`upstream_snapshot_hash`。同 URL+payload 重复只公开一次并保留全部位置；同 canonical URL 但 payload 冲突时整组隔离，不任取第一条。
6. Aify 首页 site-watch 只提供可达性/结构/新鲜度 receipt；不得再生成一张“打开 Aify 首页”的新闻卡。专用 content lane 与 site-watch lane 都要有独立 funnel 终态，不能互相掩盖。

这条直通合同只信任 Aify 对内容和摘要的编辑判断，不把 Aify 变成唯一事实发布者。外链 publisher、Aify 摘要编辑来源和 Aify 采集器三者同时公开可追溯。Aify 条目若也被 X 白名单、Paper/Model 或其他专项入口发现，专项 DTO 可以提供更丰富表现并与其 canonical URL 去重；仅由 Aify 提供时仍可作为普通 `StoryCard` 直接展示，不反向要求白名单或专项字段，也不得冒充 GitHub Top10/X 白名单/论文模型 lane 的采集健康证据。其 material format 仍计入 X/Paper/Model 既有版面上限。

### 7.3 官方内容与工程实践

- 官方重大产品、模型、研究和政策进入“重点动态”，不因 `official` 自动入选。
- “工程实践”只收可复用的问题、方法、架构、测量或经验，例如 Anthropic harness engineering 一类文章；历史文章只作类别 fixture，不自动回填。
- 新闻稿、合作、招聘、活动、联系页、产品入口和无技术内容的 routine update 不进入 edition；低门槛阶段也按硬排除处理纯噪声。
- 工程卡至少说明：解决的问题、核心做法、已报告结果/约束、读者可复用点。

### 7.4 GitHub 今日趋势

GitHub 模块必须来自同一天、同一全站 daily scope；语言榜、weekly 榜、release 或媒体文章可作发现材料，但不能混入 Top10 排名。

每行必含：

- `rank`，严格唯一 `1..10`；
- `repo`、owner、repository URL；
- 基于 GitHub description + README 的中文用途说明；
- `stars_today` 与 total stars；
- `previous_rank`（同 scope/date 可比时）；
- `trend: new | up | down | same`；
- repository language、topics、README status。

没有同 scope 前日数据时标 `new`，不能跨语言/周榜比较。README 失败时展示 description、排行、star 和明确 `readme_unavailable`，不得编造用途。上游有效但不足 10 条时展示实际数量和 degraded 状态，绝不造数据或混榜填满。

### 7.5 X 白名单监听

- `config/curated-x-handles.json`（或迁移时的同一项目内后继合同）是代码维护的唯一白名单；前端不提供编辑 UI。
- 每个账号每日产生 `checked / no_signal / blocked` receipt；`follow-builders` 作为补充发现与结构化解析能力，不替代逐账号监听。
- 展示项只接受白名单账号的原创 post/thread，或正文包含独立实质信息的 quote-post；必须有真人/组织名、`@handle`、头像、原帖时间、原文、忠实中文概括和精确 `x.com/<handle>/status/<id>` URL。quote-post 还要保留被引用对象与必要上下文。
- 纯 reply、纯 repost、Tavily/搜索结果、用户主页、缺 handle、缺原帖文本或泛称 `X builder` 的记录不得进入 edition。
- 白名单 lane 的软目标是 1–2、硬上限是 3，也允许为 0；健康空日不生成占位新闻或占用排名，失败/blocked 则进入 edition 状态而不是以垃圾结果填充。

### 7.6 论文、模型与 Benchmark

| 卡片 | 必须回答 |
| --- | --- |
| Paper | 研究问题、核心方法、主要结果、适用对象/场景；附 paper ID、作者/机构、发布日期和一手链接 |
| Model | 能力变化、获取方式（API/权重/许可）、关键评测、已知限制；附 provider 和模型卡/发布页 |
| Benchmark | 榜单/指标口径、数据日期、相对上次的实质变化、来源；整榜聚合，不把每一行拆成新闻 |

同一个 SWE-Bench、Artificial Analysis 或 OpenRouter snapshot 若 `state_hash` 未变，不得跨日重复生成相同卡片。

Paper/Model lane 只有在能用非专业读者可读的一句话说清贡献/能力变化、关键证据与适用边界时才具备高门槛资格；“又有一篇论文/又有一个模型”不是入选理由。该 lane 允许为 0，不用低影响条目填配额。

## 8. 信源与效果漏斗

### 8.1 来源角色

- **内容发布者/材料来源**：卡片所链接具体材料的发布者，可为官方发布、工程博客、论文、模型卡、仓库、原始 X status，也可为 Aify、Smol AI News、Latent Space、newsletter/digest 或独立博客自己的具体文章。直接内容来源不因“聚合”身份降级，也不免除内容门槛；Aify「今日精选」外链条目按 7.2 的专用直通合同处理。
- **摘要编辑来源**：公开标题/描述由谁完成编辑。普通材料通常与 publisher 相同；Aify「今日精选」外链项固定为 Aify News，不能把 Aify 的描述错误归因给落地站点。
- **采集器/发现渠道**：促成材料进入系统的 RSS、Aify、follow-builders、Tavily、搜索 provider、GitHub 列表、OpenAlex 等。它可以公开展示但不能冒充内容发布者或作者。
- **复合角色**：同一实体在不同 item 中可以分别担任内容发布者和采集器；DTO 必须逐 item 记录角色，不依赖全局固定标签覆盖事实。
- **研究/模型入口**：arXiv、OpenAlex、Semantic Scholar、Hugging Face Daily Papers/Models 与官方模型卡既可能提供材料，也可能只是发现渠道，按实际落地 URL 判定。

已有注册来源不因这份规格自动被称为“有效”。每个 `logical_source` 每日必须记录：

```text
registered -> fetched -> parsed -> admitted -> displayed
```

每个阶段包含 count、item IDs、status 和 failure reason。`registered` 只证明配置存在；只有 `displayed` 能证明读者看到了内容。Aify 的 site watch、`aify_today_picks` content lane 与旧全量 archive、X 白名单与 follow-builders 等复合来源必须分别记录，不能用其中一个成功掩盖另一个空跑。`aify_today_picks` 是最高采集/候选优先级的可信编辑 lane；旧 `english_media_search rank 60` 只属于切换前 source inventory，不得控制新 funnel 或 edition 优先级。

source funnel 的计数、失败原因和 disposition 是内部诊断，不进入公开卡片；公开卡片始终展示内容发布者/作者、`source_role`、主题 + 载体和 `collected_via`。采集器有安全 URL 时可链接，没有时只打标签；仅异常时显示来源不可用/数据降级状态。

### 8.2 Lane 终态与发布影响

- `config/edition-contract.json` 必须枚举 priority lane/family；每次运行的每个 lane 都以 `success_with_items | healthy_empty | blocked | failed | not_run` 之一收尾，不允许缺行或悬空 `running`。
- `healthy_empty` 是成功终态，不阻断 edition，也不得触发垃圾补位。
- 单个 lane 的 `blocked/failed` 使当期状态降为 `degraded`，但在其他资格与数量门通过时仍可发布。
- `aify_today_picks` 失败属于单 lane degraded，不把 Aify 变成首页单点故障；失败时本期 Aify 新条目为 0，禁止使用旧快照或全量 archive 冒充今日。
- 系统性失败是“任一配置声明的 required family 完全没有 `success_with_items/healthy_empty` 终态”或“多个独立 required family 命中配置中的 `systemic_failure_set`”；`not_run` 只能按失败参与判断，不能伪装为 healthy empty。命中后阻断新 edition pointer，但不阻断已 ready 的持久池发布。
- priority lane、family 和 `systemic_failure_set` 必须在版本化配置中显式列出并由 fixture 验证，运行时不得由 LLM 临时判断。

### 8.3 信源资产对账与证据边界

注册数量不是内容价值。2026-07-15 对 `config/sources/*.json` 的确定性盘点得到 **186** 个配置项，其中 `rss=110`、`html_index=54`、`search_api=7`，候选类别中 `community_lead=123`、`hot_blog=38`、`project=15`；这些只是当前 registry 快照，不证明可抓取、可解析、可准入或可展示。REC-315 的历史盘点则记录了当时 189 个 reachable source IDs、165 个仍在 registry、24 个缺失 ID；两个快照口径和时间不同，不能拿 186 覆盖或“修正”历史 165。

PR1/PR3 必须在现有 registry、`config/source-display-contract.json`、`docs/source-order-tuning-review.md` 与 REC-315/316 之上生成**派生对账视图**，不得另造第二个信源注册表。每个 `logical_source` 至少记录：

| 字段 | 合同 |
| --- | --- |
| `logical_source_id` / aliases | 当前 ID、历史 ID 与替代关系；同一来源不得因改名重复计数 |
| `evidence_origin[]` | `user_explicit`、`registry`、`historical_ref`、`runtime_artifact`、`external_reference`；附仓库 source anchor 或 repo-scoped trace receipt，不复制私密原文 |
| `roles[]` | publisher、editorial source、collector、site watch；按 item/lane 区分，不能全局覆盖 |
| `current_config_state` | active、shadow-only、collection-only、absent、retired |
| `transport_state` | fetched、healthy-empty、blocked、failed、not-run、unknown |
| `content_state` | parsed、admitted、displayed 的最新计数/时间/receipt；未运行新 funnel 时必须是 `unknown`，不能沿用旧 included 数冒充 |
| `decision` | `keep-active`、`repair-in-shadow`、`collection-only`、`cutover-add`、`retire`、`unknown` |
| `decision_reason` / `owner_pr` | 证据、缺失项、下一验证和唯一负责 PR |

必须覆盖的组合来源族包括 Aify Today Picks 与 site watch、官方工程博客、具体 aggregator/newsletter/digest、GitHub daily scope、项目 X 白名单与 follow-builders、论文/模型入口、中文 RSS/Wechat2RSS，以及非内容/危险 endpoint 负例。REC-315 的 24 个缺失历史 ID必须逐 ID 有终态，REC-316 的 24 个 promotion proposal 必须保留 9 promote / 12 defer / 3 retire 的逐项证据，不能只写聚合计数。

repo-scoped 历史交互审计只证明当前可读取 trace 中显式出现的链接，不保证覆盖已被裁剪、缺失或无法归属本仓库的旧会话。能够复核的用户链接必须进入对账；不能复核的部分标 `unknown / unavailable_evidence`，不得写成“已全部找回”。私密会话路径、原始消息和 token/cost 证据不进入 tracked 文档。

## 9. AI 与确定性职责边界

| 确定性负责 | LLM 仅负责 |
| --- | --- |
| URL 安全、canonicalization、page type、fetch/parse、日期/来源、低门槛准入、去重、source synopsis 优先与公开 copy/schema gate、预算、公司上限、跨模块唯一性、隐私 | admission 之后的 editor 基于 hash 绑定 material 提出 `source_summary`；对高潜 `admitted_signal` 提出忠实中文标题/`one_line_summary`/`why_it_matters`、专项结构化字段和五维编辑判断；独立 critic 只核查事实、语义和可读性，不改写 admission membership |

- LLM 不得决定 signal pool 成员资格，不得修补无正文材料，不得把入选理由写成摘要；摘要失败只改变 public display readiness，不改变 admission membership。
- 对进入普通生成链的候选，editor 与 critic 必须是两个独立调用/上下文，不能由同一响应自评自过；critic 失败或反对时该公开 copy fail closed，可进入重试但不得直接发布。
- 普通生成链的每个公开事实句必须产出 claim → source span 映射，引用 signal/material ID、content hash 和支撑文本位置；独立 semantic verifier 逐 claim 判断材料是否蕴含该说法。validator 只接受仍存在、hash 匹配且全部 claim 通过的材料。Aify 直通项以 `upstream_payload_hash + upstream_snapshot_hash` 证明原样转载，不伪造 claim-span receipt。
- LLM 失败、超时或证据不足时，该候选不进入 edition；不从 raw 或 legacy 自动补位。
- `selection_reason` 和五维量表只在 `edition_selection` 内部 artifact 中保存。
- Aify「今日精选」直通项永不进入上述 LLM 路径：摘要生成、翻译、editor、critic、semantic verifier、五维评分调用数均为 0；只运行 7.2 的机械安全门和 edition 版面约束。任何实现不得把直通文本送入 prompt 后再声称“原样复用”。

## 10. 前端呈现与特性存续矩阵

### 10.1 视觉与页面骨架

视觉基座继续使用当前 React 页面已经成立的暖纸张背景、衬线/无衬线层级、细分隔线、克制橙/绿强调、圆角卡片、当前 topbar/rail/card 语言和稳定的 1184px 桌面壳。不得恢复旧版大 lead + secondary 首页、黑重/粗粝旧稿，也不得另起“浅灰大面板 + 靛蓝”第三套风格。实现校准值为 `DESIGN_VARIANCE=4`、`MOTION_INTENSITY=1`、`VISUAL_DENSITY=8`。

- topbar 与 masthead 的公开品牌统一为 `A.D.C.`；masthead 只保留 `A.D.C.`、edition 日期、revision/status、前后日导航和必要入口。
- 删除“看见 AI 生态里正在发生的变化。”、`Public signals · Richness first`、大 hero 宣言、近期/历史库存大数字；这些不是产品主题，也不应把首条信息挤出首屏。
- 保留双列当前式卡片，不恢复旧版头条大卡。信息层级通过 `#rank`、标题、事实摘要、来源/角色、主题 + 载体和专项字段建立，而不是通过巨型卡片建立。
- 只在异常时显示 `delayed/degraded/stale/corrected/unavailable`；正常状态不堆 badge。角色插画若继续使用，只能作为小型品牌/空态元素，不得成为 hero。
- `1280x900` 首屏必须出现真实 ranked 信息流；不得有横向溢出、嵌套大卡、9–10px 不可读元数据，或需要逐条展开才能理解的工单式 UI。

当前页的浏览器审查必须转成可执行验收，而不是只保留“风格可以”的口头结论：

| 当前观察 | 决定 | PR6 可执行验收 |
| --- | --- | --- |
| 约 360px hero 加 topbar 把真实信息挤到首屏底部 | retire hero、口号与库存 snapshot | `1280x900` 下 `#01/#02` 已进入视口，`#01` 标题与摘要完整可读 |
| 首页按 source group 组织，rank 与读者意图缺失 | move source-group 浏览到 `/signals/`，首页使用全局 rank | DOM rank 严格递增；rail 筛选后保留原 rank，不局部重排 |
| 通用摘要约 13px 且统一三行 clamp | 卡片正文约 15px，公开 reader copy 默认完整 | computed summary font 不低于 15px；不存在不可展开 clamp |
| collector 元信息约 9px | 发布者、日期、provenance 元信息不低于约 12px | 四入口 computed metadata font 不低于 12px |
| Aify 描述可能超过三行 | 完整展示上游 description | DOM 文本与 payload 一致，`-webkit-line-clamp: none` 且正文没有被视觉裁掉 |
| 只有发布者首字母块，站点难辨认 | 真实 icon 优先、同尺寸 fallback | image `18×18`、wrapper `22×22`、radius `6px`，标题行不被撑高 |
| 浏览器 favicon 的位图四角不透明 | 保留现有图案，生成带透明圆角留白的 ICO 帧 | 六尺寸仍存在且 alpha-corner 检查通过；CSS 不冒充 favicon 圆角 |
| publisher、Aify editorial source 与 collector 混为同一来源 | 使用明确三角色 provenance | 复合 fixture 同时显示落地 publisher、Aify editorial source 和 Aify collector |
| 常态 credibility pill 与内部等级抢占层级 | retire 常态 pill | 正常卡没有 credibility/core/supporting/pending 文案；只保留真实异常状态 |
| 万能卡片抹平 GitHub/X/Paper/Model | typed variants + 独立排行/聚合组件 | 每种 variant 对必要字段有结构化 DOM 断言，不用一段通用标签代替 |
| 当前卡片为 14px 圆角，而旧设计文档要求不超过 8px | 保留获接受的当前视觉 | 单一 radius token 族：story card `14px`、control `8px`、source icon `6px`、pill `999px` |
| `@adc/design` 与 app CSS 各声明一套相反 palette | 把当前暖色值迁到 `@adc/design`，删第二权威 | app 不再声明 `--adc-*` palette；computed canvas/line/accent 与迁移前当前视觉一致 |
| 已成立的 skip link、focus、loading/error、reduced motion | keep | 键盘焦点可见、状态有可访问名称、reduced-motion 下无持续动画 |

### 10.2 Token 与组件所有权

- Astryx 继续作为唯一 primitive foundation；不新增第二套组件库、React Router 或生产依赖。
- `@adc/design` 成为唯一 `--adc-*` token owner。Phase 3 必须消除 `apps/web/src/styles.css` 的第二套调色板，并修复当前 `body[data-adc-public-surface]` 作用域没有被入口设置导致主题合同不生效的问题；选择设置该属性或移除多余作用域，但只保留一个权威。
- 领域组件只放在 `apps/web`，按真实数据差异最小化：`SourceIcon`、`ProvenanceLine`、`EditionNavigator`、带 typed variant 的 `StoryCard`、`GitHubTrendTable`、`BenchmarkPanel`、`StatePanel`。X/Paper/Model 可用 typed variant，不为每个字段制造微型组件。
- 复用 `src/link-icons.js`、`src/source-icon-cache.js`、`src/github-readme.js`、`src/presentation.js` 趋势语义、`src/tracking-components.js` 与既有 Astryx primitives；浏览器不得直接导入 Node resolver 或临时请求任意第三方 favicon。

| 层 | 现有/历史能力 | 决定 | 目标形式与验收 owner |
| --- | --- | --- | --- |
| route | `/` 当前 source-group monitor | move | PR6 原子改为 latest curated edition；`#01–#14` 双列信息流，PC-011 |
| route | 当前首页的来源组、历史展开与渐进加载 | move | 只在 `/signals/` 继续，读取新池 `summary_status: ready` 成员，PC-002/011 |
| route | 历史 latest/previous/archive edition 语义 | move | `/editions/?date=YYYY-MM-DD` 提供日期、revision、前后日和 permalink，PC-011/015 |
| route | 旧 dated report HTML | retire | 不恢复 `src/render.js`；`/legacy/` 用 React 只读适配旧 JSON，PC-008 |
| route | `/official-blogs/` 与 `/ops.html` | retire | 工程文章作为 pool/edition 材料；funnel、拒绝码和运行状态只留内部 artifact |
| route | 旧全文搜索/内联搜索 renderer | retire | D28 已拒绝；rail 只筛当期，不伪装历史搜索 |
| component | React/Vite/Astryx、Theme、暖纸张 shell、topbar、sticky rail、双列 grid | keep | 唯一 UI/runtime/primitive 与视觉基线 |
| component | skip link、focus-visible、loading/error/empty、reduced motion | keep | 跳转目标随路由更新；收敛为最小 `StatePanel`，四入口继续验收 |
| component | hero、口号、库存 snapshot、credibility legend/pills | retire | masthead 后直接进入 edition；正常状态不堆 badge |
| component | `SignalBoard` / `SignalGroupSection` | move | 仅服务 `/signals/` 的来源/历史浏览，不参与首页 edition |
| component | 万能 `SignalCard` 与 publisher 首字母块 | retire | `StoryCard` 基线 + typed variant，真实 `SourceIcon` 与 `ProvenanceLine` |
| component | GitHub rank/star/README/history | move | `GitHubTrendTable` 固定同日全站 Top10，PC-003 |
| component | X author/handle/avatar/original text | move | 白名单 typed variant，保留真人身份、原文、时间、status URL，PC-004 |
| component | hot-blog/官方博客卡片 | move | 高质量工程实践进入 ranked edition；不恢复“官方博客”独立废话区 |
| component | Paper/Model 与 tracking components | move | typed variants + 最多一个紧凑 `BenchmarkPanel`；不恢复图表工作台，PC-009 |
| component | 语义证据表/图片 | move | 仅在确实增强 Paper/Benchmark/工程理解时条件呈现；不恢复装饰 lightbox |
| component | 30 日 heat strip、source lane board、topic radar、public source audit/self-check | retire | 内部运行统计不重新公开 |
| data | `reports-data/occurrences/**` 与切换前 `docs/signals/**` | move | occurrence 保留为 raw lineage；公开历史按实际 cutover manifest 原样冻结到 `/legacy`，PC-008 |
| data | 当前 `home.json` lead/secondary schema | retire | 新 edition 使用独立 schema，不改名复用旧形状 |
| data | `articles.json`、`feed.json`、`trends.json` | move | 切换时进入 legacy/兼容清单；停止作为首页依赖，Phase 5 再按调用证据清理 |
| data | `data/official-blogs.json` 与旧 report JSON | keep | 作为工程 enrichment、历史证据和 `/legacy/` 输入；不恢复独立公开页 |
| data | source icon、Aify/X identity、rail query state | move | 后端 DTO 提供 icon/provenance/完整上游内容；rail 使用 `?topic=`/`?format=` |
| asset | `src/link-icons.js`、`source-icon-cache.js`、现有 favicon 图案、`adc-character.svg` | keep | resolver/cache 经 DTO 复用；favicon 只改透明圆角帧；角色只作小型品牌/空态 |
| asset | app 暖色 token 与 package 旧黑重 token | move | 当前暖色值进入 `@adc/design` 成为唯一 owner；app palette 与并行旧主题退役 |
| asset | 历史整包 avatar/evidence image 目录 | retire | 不整包恢复；新 X avatar 使用白名单绑定的有界缓存/fallback 并登记生成资产 |
| test | favicon 字节/尺寸、desktop-only、focus、console/network/overflow 守卫 | keep | 扩展到四入口和 alpha-corner，不恢复移动端矩阵 |
| test | 当前 source-group/hero/库存/credibility 首页断言 | retire | 替换为 ranked edition、来源角色、typed variants 和首屏几何断言 |
| test | 历史渐进加载与日期/edition 语义 | move | 渐进加载移到 `/signals/`；日期/revision 进入 `/editions/`；旧 lead 布局断言退役 |
| test | 旧 `page-checklist.js`、ops/official-blog UI E2E | retire | 不恢复通用检查框架；集中 fixture + focused unit + 单个 `1280x900` E2E 足够 |

`keep / move / retire` 表必须覆盖实际被修改的 route、component、data、asset、test；PR6 合入前不得存在“表里没有、代码却删除”的公开能力。`home.json/articles.json/feed.json/trends.json/data/official-blogs.json` 的最终停止写入只允许在 PR6 记录 consumer 终态、PR7 证明不可达后发生。

### 10.3 Harness Hub 前端能力边界

- 截至本规格校验，Harness Hub 默认分支 HEAD 为 `c88d8a9717a8d5d515413f1a7de1849ba4de31f3`，即已合并 PR #106；本仓库 manifest 仍记录旧 source commit `750550254dfc3c90d6da214e75c4809909c0d9bd`。
- 已从独立临时 checkout 执行规定的 `node bin/harness-hub.mjs migrate <current-repository> --yes`，但当前目录是 dirty linked worktree，工具按合同返回 `E_LINKED_WORKTREE`。本任务不得复制迁移产物或 Git 元数据绕过保护，因此 **Harness Hub 更新尚未完成**。
- 合法重入点：本规格变更落地后，在真正作为后续工作目标的 clean standalone checkout 中重新执行迁移，再验证 manifest、OKF、产品源码/依赖/`knowledge/**` 未被意外修改。必须先解决 `.codex/skills/{prototype,frontend-design,frontend-patterns}` 与 `.agents` 同名 Skill 的双权威冲突。
- PR #106 只把 prototype 证据改为“交互需要时才做最小可运行证据”，不再强制三方案/switcher；主要前端 Skill 增强来自 PR #104 的 `animation-vocabulary`、`apple-design`、`review-animations` 及相关更新。它们是设计/评审提示能力，不是 Astryx 组件、运行时或新增依赖，不能替代上述产品合同与组件实现。

## 11. 分阶段迁移计划

### Phase 0 — 契约与真实回放基线（本任务 / PR1）

**目标**：持久化本文、权威优先级、阶段顺序和真实事故 fixture 设计，不改变线上行为。

**修改**：本文、requirements reconciliation、cross-agent roadmap、feedback/recovery ledger、状态 banner、合同测试和 retrospective；补齐八条产品工作流、初始 11 点映射、source asset reconciliation、五层 feature survival、视觉诊断与七个 PR 回滚域。

**退出门**：新反馈为 `confirmed`；旧 lossless 默认首页反馈为 `closed`；文档测试证明目标是 `implementation-pending`；初始 11 点均映射到工作流/PR，24 个缺失历史 ID逐项终态化，无法复核的会话链接诚实标 unknown；feedback/docs/retrospective/harness/diff gate 全绿。

**回滚**：只回滚文档/合同测试；不触碰生产数据。

### Phase 1A — 信源资产、Raw 与 Funnel shadow（PR3）

**目标**：在不改变当前 active source 输入、`docs/index.html`、`docs/signals/**` 或 Web bundle 的前提下，让 source portfolio、raw observation 与 `registered → fetched → parsed` funnel 在定时 DAG 中真实运行并持久化 repo-safe receipts；这不是 dormant prototype。

**目标所有者**：

- 以现有 registry、display contract、source-order review 和 REC-315/316 生成第 8.3 节的派生 source asset reconciliation；不新建第二套 source registry；发布前必须复用同一 validator 对当前 registry 与 REC-315/316 重新做 exact reconciliation，不能只验 schema；
- 新增 `schemas/raw-observations.schema.json`、`schemas/source-funnel.schema.json` 与最小 raw/funnel 模块；扩展 `src/discovery.js`、`src/source-effectiveness.js`、`src/reports-data-layout.js`、`src/privacy.js`、`src/cli.js`、DAG/runner/workflow/resilience、`scripts/scan-public-artifacts.mjs` 和集中回放测试；signal-only publish 只允许把同日、已验证的两份内部 receipt 作为可选 companion 一并持久化，缺失时旧发布仍可继续，且不得扩大任何 Pages 输出；`src/site.js` 只增加内部 receipt 目录隔离，防止旧 builder 把它们误读为日报，不改变任何公开 projection；
- 新增 Aify 专用 `src/aify-today-picks.js`（或同职责模块）与 `aify_today_html` source kind。shadow adapter 复用当前 `config/source-watchlist.json` 的 Aify 首页 URL，分别产生 `aify_today_picks` content receipt 与 `site-aify-news` health receipt；
- **保持 `config/sources/aify-news.json` 及其他会改变旧 public listener 输入的 active endpoint 字节不变**。Aify active 路径从全量 archive 翻到 Today Picks 只在 PR6/Phase 4 原子切换时发生；
- 统一 tracer fixture 至少含一条 Aify Today Pick、一篇 Anthropic 类工程实践、一条 follow-builders 白名单 X status、一条 GitHub daily repo、一个 Paper/Model 或 Benchmark 变化，以及 Pika email-protection/合作稿/TEST 负例。

**不得做**：执行 admission/summary/edition；改当前公共 schema、默认首页、`docs/signals/**`、active Aify 内容源或公开 site/build 行为；增加公开 route、第二 registry 或生产依赖。

**退出门**：186 个当前 collection entries、REC-315 的 24 个历史 ID与 REC-316 的 24 个 promotion proposal 都有证据状态/终态或诚实 `unknown`；Aify 首页裁剪 fixture 的唯一 `ARTICLES_TODAY` 有序 payload 能被安全、保真地解析，首页 shell、全量 archive、旧 cache 与坏结构不成为 raw content item；所有 priority source receipts 终态化；相同输入下旧公共 generation 字节不变；采集、解析、schema 或原子 pair transaction 失败只降级且不阻断旧 publisher，原子回滚/清理失败必须保留严格命名的 recovery evidence 并由旧 publisher 忽略该失败 transaction；无 recovery evidence 的孤立 receipt、canonical reconciliation 漂移、lineage/privacy 损坏属于仓库完整性失败，仍须 fail closed；repo-safe raw/receipt privacy scan 为零 finding。

**回滚**：停用/移除 shadow DAG 节点与模块；旧采集、旧 public projection 和 active source config 完全不变。

### Phase 1B — 低门槛池、摘要与来源身份 shadow（PR4）

**目标**：基于 Phase 1A raw/funnel 生成 deterministic admission、quarantine、admitted pool、summary readiness、public-ready shadow DTO 与来源/icon 元数据，继续保持当前公开站点不变。

**目标所有者**：

- 新增 `config/signal-admission-contract.json`；
- 新增 `schemas/signal-quarantine.schema.json`、`schemas/signal-pool.schema.json`、`schemas/public-signal-pool.schema.json` 与普通 copy/claim-span/critic receipts；新的 public-ready schema 独占 `collected_via[]`、nullable collector URL、`source_role`、`topic_path`、`content_format` 与 `source_identity`。现有 `schemas/public-signals.schema.json` 只描述切换前 runtime/未来 legacy，不得继续治理新池；
- 新增 `src/signal-admission.js`、`src/signal-pool.js` 与最小 material/summary 模块；Aify adapter 在机械门后投影 `ready + editorial_ready`，普通来源在 admission 后生成 grounded summary；
- 复用 `src/link-icons.js`、`src/source-icon-cache.js` 写 DTO metadata；浏览器仍不消费新 DTO；
- 显式验证 `.tmp/ai-daily/materials/**` 与 `.tmp/ai-daily/quarantine/**` 均被忽略且执行 24 小时清理。

**不得做**：改 active Aify config、edition、前端、公开 publish projection/site build 行为、当前 `docs/signals/**` 或当前公共 schema 语义；调用 LLM 决定 admission membership。允许且必须做的最小运行接线仅限：让 signal-only publisher 把同代 pool/public-ready 作为可选内部伴随物成对复核与携带，并让旧 site JSON discovery 明确忽略两个新内部目录；两者均不得改变任何公开生成字节、路由或成员资格。

**退出门**：真实 Pika/Aify/内部话术/合作稿 fixture 全部给出确定拒绝码；Anthropic engineering 历史 fixture 在隔离回放中得到 `admitted + engineering_practice`，但不写生产 pool；Aify 有效项 title/description/URL/publisher/tags/位置/hash 保真并直接 `ready + editorial_ready`，二次语义调用为 0；普通摘要失败的成员保持 `pending/failed` 且不生成 public-ready DTO；`raw.observation_count = admitted + rejected + needs_review`，`raw.input_record_count = disposition represented inputs + normalization/parser pre-admission receipts`；同日重复回放 ID/决定/JSON 稳定，跨日同 canonical + observation content hash 得到 `duplicate_no_new_state`，内容变化可重新准入；多采集器、无链接采集器、publisher/editorial source/collector 与 icon metadata 通过；publisher 对 Phase 1A 与 Phase 1B 两个原子组分别 fail closed，pool recovery 不吞掉健康 raw/funnel；shadow failure 不阻断旧 publisher；`.tmp` 清理与 privacy gate 通过。

**回滚**：停用 pool shadow；Phase 1A raw/funnel 可继续运行；旧公共页面和生产路径不变。

### Phase 2 — Edition 后端与专项 DTO shadow（PR5）

**目标**：从 admitted pool 生成 shadow edition、selection receipt、GitHub/X/Paper/Model/Benchmark 专项 DTO 和 source-grounded public copy。

**目标所有者**：

- 新增 `config/edition-contract.json`；
- 新增 `schemas/edition.schema.json`、`schemas/edition-selection.schema.json`、公开 copy claim-span/critic receipt schema；
- 复用/扩展 Phase 1B 的 material/summary seam，新增 `src/edition.js`、`src/edition-output.js`；
- 复用 `src/github-readme.js`、`src/tracking-components.js`、`src/link-icons.js`；
- 将 `config/curated-x-handles.json` 从 legacy 排序提示提升为主动监听合同。

**退出门**：所有公开 signal DTO 都有 grounded `source_summary`；普通来源摘要失败的 admitted signal 只保持 `pending/failed` 且不公开，editor、独立 critic 与 claim-span semantic verifier 全部 fail closed；Aify Today Picks 的原 description 字节保真（仅允许已声明的安全规范化），相关 LLM/critic/verifier 调用数为 0，`summary_origin/editorial_source/upstream_*` provenance 完整；正常 10–14、short 5–9、延迟 0–4、supporting 上限、公司上限与跨模块唯一性通过；GitHub 同日全站 Top10 通过；X 白名单正例/quote-post/纯 reply-repost 负例和健康空日通过；论文/模型/Benchmark 专项回放通过；公开 DTO 不含 rubric/selection reason/core-supporting；AI 失败不会改变 pool membership。

**不得做**：改 active Aify config、前端、site/web build/publish、当前 `docs/index.html`、当前 `docs/signals/**` 或生成四个新公开入口。系统性 lane 失败只记录“若切换将阻断”的 shadow 决定，PR6 前不得阻断旧 publisher。

**回滚**：删除/停用 shadow edition；pool/raw 继续生产，旧公共页面不变。

### Phase 3 — Reader-intent React 前端（PR6 内部检查点，不单独合入）

**目标**：在当前 React/Astryx 暖纸张基座上实现 `/` latest edition、`/editions/?date=YYYY-MM-DD` 历史精选、`/signals/` 新池预览和 `/legacy/` fixture/旧日报只读适配，恢复专项信息，不恢复旧 renderer。由于 main 合入后定时任务会直接执行当前 Web build，本阶段只能在 PR6 分支内作为验收检查点存在；不得单独合入、发布 dormant preview、增加 feature flag 或第二 renderer。

**前置门**：在 clean standalone 目标 checkout 中合法完成 Harness Hub migration，解决 `.codex`/`.agents` 同名 Skill 权威冲突并验证产品文件未被迁移改写；不得把临时 clone 产物复制进 linked worktree。

**目标所有者**：`apps/web/src/main.tsx`、`apps/web/src/App.tsx`、`apps/web/src/styles.css`、`apps/web/src/data.ts`、`apps/web/vite.config.ts`、`packages/design/src/adc-theme.css`、`src/web-app-build.js`、`src/site.js`，以及最小领域组件；同步替换 `tests/adc-visual-contract.test.js`、`tests/e2e/site.e2e.js` 中故意锁定当前 source-group/旧口号/常态 credibility pill 的运行基线。无需引入 React Router。构建必须生成根、editions、signals、legacy 四个静态入口，并让嵌套入口的 asset/data URL 在 GitHub Pages 项目路径下正确。

**退出门**：真实 production-regression fixture 在 `1280x900` 通过；四个公开入口均可直达和刷新；首页日期/revision 导航与 dated permalink 正确；asset/data URL 全部 2xx 且无旧新 generation 混用；`/`/dated edition、clean pool、legacy 成员隔离通过；topbar/masthead 只显示 `A.D.C.` 品牌且无旧口号/库存 hero；首屏出现 globally ranked 双列内容；分层 rail 只筛当期并保持 rank；来源角色/主题/载体/采集器/摘要/排行/趋势/身份可读；`@adc/design` 是唯一 token owner；无伪全文搜索、横向溢出或 9–10px 元数据；console/network 无错误；typecheck、web build、visual contract 和 E2E 全绿。

**回滚**：合入前任何 UI/route gate 失败都不合并 PR6；不能只合入或只回滚 UI 半边。shadow data 不删除。

### Phase 4 — 生产编排、原子切换与 legacy 冻结（与 Phase 3 同属 PR6）

**目标**：生产顺序变为 raw → pool → edition；`/` 切 edition，`/signals` 切新池，现有公开历史原样冻结到 `/legacy`。Phase 3 与 Phase 4 必须在同一 PR6、同一完整站点 generation 中一次合入；两者不是两个可独立 merge 的 PR。

**必须同步**：`src/daily-runner.js`、`scripts/run-daily-codex-pipeline.mjs`、`config/daily-codex-dag.json`、`config/daily-workflow-contract.json`、resilience policy、publish/site/web build、CLI/package、runbook、automation docs 与 publish prompt；把 active `config/sources/aify-news.json` 从全量 archive 路径原子翻到已验证的 homepage `aify_today_html`，且不保留 archive fallback；应用 PR3 确认的其他 active source 终态。还必须更新 `config/source-display-contract.json`、`scripts/validate-source-display-contract.mjs`、`feature_list.json` 及其 unit/public-signals tests：完整 source inventory 继续作为内部治理，source grouping 只服务 `/signals`/legacy，不得再强制公开默认首页或 non-hiding full-history search。只改 planned DAG 不算完成。

**切换顺序**：

1. 生成并验证 legacy manifest（实际条数、文件集、SHA-256）。
2. 停止向旧 occurrence/public projection 写新记录。
3. 原子发布 `/legacy/`、新 `/signals/`、`/editions/`、dated edition 数据和四个静态 route entrypoint。
4. 最后切换首页指针。

**失败行为**：pool 成功而 edition 失败时发布 pool，并保留明确日期/revision 的 last-good edition；不得回退到 raw 首页。单 lane 失败为 degraded，系统性 priority-lane 失败/not-run 阻断新 edition pointer，healthy empty 不阻断。发布/隐私/schema 失败则维持上一个完整 generation。

**回滚**：切回上一个完整站点 generation；不修改 legacy manifest，不把 legacy 重新混入新池。不得只 revert UI、只 revert Aify config 或只 revert route。

### Phase 5 — 七次自然运行后清理（PR7）

**目标**：连续至少 7 次自然生产运行通过 P0 后，退役冲突的 active prompt/contract/renderer 路径；保留 legacy 数据、manifest、schema 和只读 validator。

**退出门**：七次 funnel/edition/publish receipt 连续完整；无 P0、无隐私泄漏、无 legacy hash drift；完整 `corepack pnpm run validate`、repo-size 和独立评审通过。

**禁止删除**：`reports-data/occurrences/**`、baseline、legacy manifest、冻结公开数据及其校验器。

## 12. 验收清单

### 12.1 Phase 0 当前交付

- [x] `HEAD == origin/main == 2c632d3881dc89e25d14f49889a5539dc49d69e0` 且 divergence 为 `0 0`。
- [x] 本文独占 `curated-edition-contract:v1` owner marker；引用文档只使用 `curated-edition-contract-ref:v1`，状态为 `implementation-pending`。
- [x] reconciliation、roadmap、quick reference、recovery ledger 和冲突规格 banner 指向本文。
- [x] 旧 `feedback/p1-lossless-public-signal-stream` 为 `closed`，新 `feedback/p1-curated-three-layer-homepage` 为 `confirmed`。
- [x] 合同测试只证明规格已接受，不伪造产品实现。
- [x] Harness Hub PR #106/commit `c88d8a…` 已核对并按规定尝试迁移；`E_LINKED_WORKTREE` 与 clean standalone 重入条件已记录，未伪称更新完成。
- [x] feedback、retrospective、docs、harness、diff validators 通过。
- [x] 八条产品工作流覆盖初始 11 点，Phase 0–5 与 PR1–PR7 的依赖/合并/回滚视图不再混用。
- [x] 当前 186-entry snapshot、REC-315 的 24 个历史 ID、REC-316 的 24 个 proposals 与可读取会话中的明确链接均有事实/unknown 边界；未运行的新 funnel 不伪称有效。
- [x] route/component/data/asset/test 五层 survival 与视觉问题→决定→可测验收矩阵完成，所有决定只使用 `keep / move / retire`。
- [x] Phase 1A/1B active Aify config 提前翻转与 Phase 3/4 可分别合入的时序矛盾已消除；合同测试锁定 shadow/public 不变量和 PR6 原子边界。

### 12.2 未来 P0/P1/P2 产品门

| ID | 级别 | Fixture / 场景 | 必须断言 | 未来测试 / 命令 | 阻断 |
| --- | --- | --- | --- | --- | --- |
| PC-001 | P0 | Pika Contact、email-protection、首页/登录/招聘/合作稿、credential/signature/private URL | 不进入 pool/edition；产生确定拒绝码；仓库 raw/receipt 不含原 secret/私网 URL；material/quarantine 仅在 ignored `.tmp` 且成功/失败/次日启动均满足 24 小时清理 | `public production fixture blocks non-content endpoints`; `raw quarantine artifacts are repo-safe and bounded` | 是 |
| PC-002 | P0 | 普通来源中的内部核验话术、有效材料、editor/critic/semantic verifier 失败，以及 Aify `TEST2/TEST_S` 结构负例 | TEST/internal copy 只留 raw/quarantine；普通有效材料先 admission，只有 grounded `source_summary` ready 后才进入公开 `/signals/`；普通公开 claim 有 hash 绑定 source span且独立 critic/verifier 全过；失败时成员保留但 `pending/failed` 不展示，绝不使用标题复读/入选说明。Aify 直通的独立例外由 PC-016 约束 | `public production fixture quarantines test rows and internal audit copy`; `public signal projection requires grounded source summary`; `public copy claims fail closed without source spans` | 是 |
| PC-003 | P0 | 真实 GitHub 日榜 10 条 + weekly/release 负例 | 严格 Rank 1–10、用途、README/description 依据、`stars_today`、趋势；不混榜 | `GitHub daily Top10 renders rank summary star delta and trend` | 是 |
| PC-004 | P0 | 白名单原创 status/thread、实质 quote-post、纯 reply/repost、零有效日 | 正例展示姓名、handle、原文、必要引用上下文和状态直链；纯 reply/repost 拒绝；健康空日允许 0，不由 Tavily/主页填充 | `X whitelist renders identity and honest empty state` | 是 |
| PC-005 | P0 | 186-entry current snapshot、REC-315 逐项 24 historical IDs、REC-316 逐项 24 proposals、用户明确 Aify/Wechat2RSS 等链接、cutover 后新鲜 Aify article/digest、Aify 发现 Anthropic 工程文、follow-builders、历史 Anthropic fixture | 资产对账区分 configured/history/new-funnel evidence，缺失会话证据标 unknown；Aify 自有具体文章可直接作内容来源；Aify Today Picks 外链项的 publisher/Aify editorial source/collector 分离且可安全链接；每个 priority lane 逐源 `registered→fetched→parsed→admitted→displayed` 闭环并有终态；历史 fixture 只在隔离回放断言 `admitted + engineering_practice` | `source asset reconciliation preserves explicit terminal decisions`; `priority sources close registered-to-display funnel`; `publisher and collector roles remain distinct`; `historical engineering fixture never backfills the clean pool` | 是 |
| PC-006 | P0 | core/supporting、主编区充分/短缺、同公司、跨模块重复 | 资格三维均 ≥1；正常 10–14；5–9 short；0–4 保留 last-good 并 delayed/degraded；supporting ≤三分之一且 ≤4；X ≤3、Paper/Model 合计 ≤3、公司 ≤3；canonical/event 唯一；不凑数 | `edition budgets cap companies and never refill with rejected signals` | 是 |
| PC-007 | P0 | editor/critic 超时、单 lane 失败、priority family 系统性失败/not-run、healthy empty | pool 继续发布；单 lane 降级但可发布；healthy empty 不阻断；系统性失败阻断新 edition pointer；last-good date/revision 不伪装为今日；raw 不顶替首页 | `edition failure publishes pool and preserves dated last-good edition`; `priority lanes terminalize before edition publication` | 是 |
| PC-008 | P0 | occurrence legacy manifest + 旧 dated report adapter | occurrence 文件集/数量/hash 完整；旧报告标 `legacy/unverified` 且只读；新 pool/edition 不含 legacy；重复运行不改变 manifest | `legacy archive freezes exact cutover generation`; `legacy dated reports remain isolated and read only` | 是 |
| PC-009 | P1 | 论文、模型、SWE-Bench/AA 混合 | Paper/Model 用普通读者语言回答贡献/能力/证据/边界；合计 ≤3 且可为 0；同一 benchmark 聚合为最多一个变化组件 | `papers models and benchmarks render typed reader-facing cards` | 对模块阻断 |
| PC-010 | P1 | icon cache、未知域名、GitHub、publisher/collector 复合角色 | 真实 icon 优先；统一圆角 wrapper；fallback 可识别且不撑高标题；来源角色、主题 + 载体和采集器始终可读，有安全 URL 才链接 | `source icons resolve and render rounded fallback consistently`; `provenance line distinguishes publisher and collector` | 对 UI 阻断 |
| PC-011 | P1 | 完整真实 fixture，`1280x900`，根/editions/signals/legacy 四入口 | 四 URL 直达/刷新与 nested URL 正确；首页前后日/revision 和 permalink 忠实；成员隔离；只有 `A.D.C.` 品牌、无旧口号/库存 hero；10–14 项按全局 rank 双列呈现；rail L1/L2/载体只筛当期并保持 rank；GitHub/Benchmark 锚点正确；无全文搜索假入口；`@adc/design` 是唯一 token owner；首屏有信息流、无 overflow、元数据可读、可访问名称完整 | `static routes load directly and preserve membership boundaries`; `1280x900 first viewport preserves feed density` + E2E | 是 |
| PC-012 | P1 | 相同输入重复 build + 边界不确定的相似事件 | IDs、admission、rank、edition 顺序与公开 JSON 字节稳定（明确的生成时间字段除外）；pool 保留不同 URL；cluster 仅 edition 可逆应用且保留成员/代表/附加来源；不确定时 fail-open 分开；重复执行不覆盖已发布 revision | `curated pipeline replay is deterministic`; `edition event clustering is reversible and pool preserving` | 是 |
| PC-013 | P2 | 稳定后的 `1280x900` 截图 | 当前暖纸张/topbar/rail/圆角卡片语言保留；圆角 icon、截断、层级和高密度漂移受控；无旧 lead/Today Five/大 hero | `1280x900 visual baseline remains stable` | 初期否 |
| PC-014 | P2 | 连续 7 次自然运行 | funnel、pool、edition、publish receipt 完整；无 P0/隐私/hash drift | production observation ledger | 清理门 |
| PC-015 | P0 | 上海日界线、停更 72h、同日两次发布、次日冻结、事后纠错 | 候选窗口从上次成功 cutoff 到当前且最多 48h；同日 revision 不可变且指针递增；次日常规版冻结；更正/下架只追加 correction/tombstone | `edition cutoff revision and correction history are append only` | 是 |
| PC-016 | P0 | 裁剪的真实 Aify 首页 Today Picks、全量 `articles.json`、旧 cache、缺失/重复 marker、坏 JSON、危险 URL、空 summary、相同 URL 冲突、普通/X/Paper 链接 | 只解析首页唯一 `ARTICLES_TODAY` 有序集合，不执行 JS/eval、不读取全量 archive；有效项 title/summary/url/date/source/tags/上游位置/hash 保真并直接 `ready + editorial_ready + trusted_editorial`；摘要/翻译/editor/critic/verifier/五维评分调用数为 0；首页 shell 仅 health receipt；publisher、Aify editorial source 与 collector 不混；结构/新鲜度失败整 lane degraded 且 0 新条目，逐项安全/schema 失败隔离并记 reason，绝不静默 fallback；全部通过项进入 pool/prequalified 集，最终 edition 只受 10–14、canonical/event、公司、专项和多样性机械约束；Aify-only X/Paper 可作普通 StoryCard，但不冒充专项采集健康 | `Aify Today Picks passthrough preserves upstream editorial payload`; `Aify archive and homepage shell never become Today Picks`; `Aify passthrough skips all secondary semantic processing` | 是 |

真实 fixture 目标目录：`tests/fixtures/product-contract/production-regression-2026-07-15/`。至少包含裁剪后的 observations、expected dispositions、priority-source funnel、GitHub Top10、edition/pool pages、Aify 首页 `ARTICLES_TODAY` + 全量 archive 负例 + 直通/发布者/摘要编辑来源/采集器多角色、白名单 X 正例/quote/reply/empty、短版/延迟、日界线/revision/correction 场景。fixture 必须保留生产 wire format 和原始 identity，但移除秘密与无关大正文。历史内容 fixture 只证明规则，不属于生产 backfill 输入。

### 12.3 Phase 0 可运行命令

```powershell
node --test --test-name-pattern "repository contract separates listener evidence from curated public surfaces" tests/public-signals.test.js
node --test --test-name-pattern "ai daily requirements reconciliation maps user requirements to ledger tests and runtime evidence" tests/unit.test.js
node scripts/validate-feedback-contract.mjs
node scripts/validate-retrospectives.mjs
node .harness-hub/okf-validate.mjs .
corepack pnpm run harness:validate
corepack pnpm run validate:docs
git diff --check
```

`okf-validate` 只证明本轮没有破坏项目知识；本文是未落地路线，因此 `knowledge/` 在 Phase 0 必须保持字节不变。首次生产行为改变后再更新项目知识。

## 13. 实施拆票原则

Phase 0–5 是依赖阶段，不是 PR 数量。所有 PR 都直接基于前一 PR 合入后的最新 `origin/main`，禁止 stacked PR；创建分支前必须证明 clean worktree 且 `HEAD...origin/main = 0 0`。当前规格工作树还没有创建、提交或推送任何 PR。

### 13.1 全局执行不变量

- PR3–PR5 的 shadow 路径必须进入真实定时 DAG 并产生 repo-safe receipts，不能只在测试或 dormant CLI 中存在；相同 fixture 下旧 `docs/index.html`、旧 `docs/signals/**`、当前 Web bundle 与 active Aify source 必须字节不变。
- PR3–PR5 的正常 shadow failure 必须终态化并可诊断，但 PR6 前不得阻断旧 publisher；原子事务恢复态须有确定性 recovery evidence 并从旧 publish plan 排除。无恢复证据的 receipt 损坏、canonical/lineage/privacy 漂移是仓库完整性失败而非可忽略的 lane failure，继续 fail closed。`reports-data/**` 可持久化 shadow receipts，但不得提前生成 Pages route。
- PR3–PR5 复用一个纵向 tracer fixture 和一个集中测试 owner `tests/curated-pipeline.test.js`；不要为每个实体制造一套测试框架，也不要继续把全部合同塞进 `tests/unit.test.js`。
- 每张票引用本文 Phase、PC ID、允许/禁止路径、RED fixture、退出命令和回滚边界。P0 fixture 先红后改生产逻辑；无法直接红测时记录 deterministic substitute。
- 每个替换 PR 更新第 10 节 route/component/data/asset/test survival inventory；决定列只使用 `keep / move / retire`，不能让行为默默消失。
- 每个实现 PR 合入前运行受影响测试、完整 `corepack pnpm run validate`、`git diff --check` 和独立只读评审；确定性失败高于评审意见。
- PR6 以前不得描述公开产品已改进；PR7 以前不得删除 legacy validator、冻结数据或冲突行为的回归证据。

### 13.2 七个最小合并与回滚域

| PR | 依赖与读者行为 | 主要允许/禁止边界 | 验收与回滚 |
| --- | --- | --- | --- |
| **PR1 规格、历史审计与回放基线** | 无依赖；公开行为不变 | 只改本文、roadmap/reconciliation、既有 source/design 引用、feedback/recovery/feature/test/retrospective、`apps/web/README.md` 与 `packages/design/README.md` 的 current/target 边界 banner，以及 ignored state；禁止 `src/**`、`apps/web/src/**`、`packages/design/src/**`、schemas、active sources、生成 Pages 与 `knowledge/**` | 初始 11 点、八工作流、source reconciliation、五层 survival、七 PR 均有唯一 owner；docs/feedback/OKF/harness/合同测试与 diff gate 绿；整体回滚文档和合同测试 |
| **PR2 Harness Hub 独立迁移** | PR1 合入；读者无变化 | 在 clean standalone target 从 Harness Hub 默认分支实际 HEAD 执行 manifest migration；只动 manifest 管理路径，禁止产品源码、配置、依赖、docs/design 与 knowledge | `harness:validate`、skills、OKF、docs/full validate；证明产品和 knowledge 未被迁移改写；整体 revert managed diff，禁止手工移植临时 clone 片段 |
| **PR3 信源资产、Raw 与 Funnel shadow** | PR2 合入；旧公开 generation 不变 | source audit、raw/funnel schema/module、Aify homepage parser、source/discovery/effectiveness/privacy、DAG/runner、同日内部 receipt 的可选 signal publish allowlist、publisher canonical 复核、旧 builder 的内部目录隔离与统一 fixture；禁止 admission/edition/frontend、公开 site/build/publish 行为、active Aify config 与公开 route | PC-005/016 的 transport 子集；186 entries、历史 24 IDs/24 proposals 与用户明确链接有证据状态；Aify payload 保真，旧输出字节不变；receipt 缺失或有证据的事务恢复态不阻断旧 signal publish；停用 shadow 即完整回滚 |
| **PR4 低门槛池、摘要与来源身份 shadow** | PR3 合入且 fixture replay 成功；旧公开页面不变 | admission/pool/quarantine/public-ready/copy receipts、普通 summary、Aify ready passthrough、provenance/icon DTO、signal-only 内部伴随物复核、旧 site discovery 隔离；禁止 edition、frontend、公开 site/build/publish 行为、active source 翻转和当前 `docs/signals/**` | PC-001/002/005/010/012/016 的 pool/copy 子集；普通失败 pending/failed、Aify 二次语义调用 0、privacy/determinism 绿；回滚 pool shadow，raw/funnel 保留 |
| **PR5 Edition 与专项 DTO shadow** | PR4 合入且 pool fixture 稳定；旧公开页面不变 | edition/selection、GitHub/X/Paper/Model/Benchmark DTO、主动 X 白名单、budget/dedupe/revision 与 shadow DAG；禁止 frontend/site/build/publish、active Aify config 和四公开入口 | PC-003/004/006/007/009/012/015/016；10–14/5–9/0–4、同 scope Top10、健康空日、last-good 与稳定排序通过；回滚 edition，pool/raw 保留 |
| **PR6 Reader UI、视觉、能力恢复与生产原子切换** | PR2/PR5 完成、PR3–5 至少一次完整 replay、全部 P0 绿；唯一一次公开行为切换 | 同一分支完成 Phase 3 UI/四入口/token/icon/typed cards/survival，再完成 Phase 4 runner/publish/active Aify 与已审计 source 翻转/legacy manifest；禁止第二 renderer、feature flag、dormant preview、Router/组件库/依赖、全文搜索、移动端、旧 lead/Today Five | typecheck、web build、dry-run publish、privacy、PC-008/010/011/013/016、四入口 `1280x900` E2E、console/network/overflow、完整 validate；只回滚整个站点 generation，禁止只回滚 UI/config/route 一部分 |
| **PR7 七次自然运行后清理** | PR6 后连续至少七次自然运行满足 PC-014；原则上无产品变化 | 只删调用图和 receipts 证明不可达的旧 prompt/contract/renderer/script/test；禁止 legacy 数据/manifest/schema/validator、新 artifacts、规则变化或新功能 | 七次 funnel/pool/edition/publish receipt、无 P0/隐私/hash drift、清理前后新 generation 等价、repo-size/full validate 与独立评审；清理 PR 可独立 revert |

### 13.3 为什么不能再少或再碎

- PR1 与 PR2 的 owner、环境和回滚不同；外部 managed migration 不能混入产品权威规格。
- PR3 与 PR4 分开，才能区分“没抓到/没解析”和“被准入拒绝/摘要失败”；PR4 与 PR5 分开，才能证明 pool membership 不依赖 edition 成功。
- GitHub、X、Paper/Model、Benchmark 不再各拆 PR；它们共享 edition schema、全局 rank、预算和跨模块去重。
- PR6 不能拆。main 合入即参与定时 Web build；提前接入会改变线上，不接入会成为 dormant code，另加 flag/renderer 又会制造第二体系。用 PR 内多个提交提高可审阅性，但只允许一次 merge/cutover。
- PR7 不能提前；七次自然运行是删除旧证据的硬门。

因此七个回滚域正好对应：规格、工具、采集、持久池、精选、公开产品、稳定后清理。少于七个会混淆失败层，多于七个会产生半成品或重复基础设施。
