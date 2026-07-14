# AI 日报主体流生成修复规格

> **2026-07-14 适用范围变更：仅保留为可选遗留编辑报告的主体生成规格。** 本文中的最少 5 条、目标 8 条、最多 12 条、黑名单、补位、排序、合并、去重、拒绝原因和质量事件都不得控制 `docs/signals/**` 的成员集合、默认时序或发布。公共产品只由 `public-signal-stream-contract:v1` 约束：无内容准入门槛，分类与可信度仅作标签和筛选；PR3 将删除本文对应的遗留公开渲染面。
>
> 2026-07-13 遗留编辑报告收敛说明：该遗留主体合同为最少 5 条、目标 8 条、最多 12 条，且只支持 `1280x900` 桌面视口。早期宽松数量与多端验收口径已被此遗留合同取代。

状态：legacy-spec-locked / implementation-validation-pending。本文仅是遗留编辑报告后续实现与验收的控制性规格，不表示当前代码已经稳定完成。`feedback/p1-main-stream-blacklist-refill` 是 legacy confirmed durable requirement：需求、范围和测试绑定已经固定，但不是生成修复已稳定的声明。当前已经确认的事实是：2026-06-15 的生成结果只有 3 条 `main_items`，页面已经能如实显示 `主体偏少`，但生成端是否真正解决主体不足，必须等真实日期重跑、页面检查、截图验收和 `corepack pnpm run validate` 都通过后才能声称完成。

当前执行门禁：本轮只落成计划、规范、测试标准和交接状态；不得继续修改 `src/**`、`tests/**`、生成报告数据、公开 HTML、发布流程或自动化配置。已有脏改动必须在后续实现阶段用红灯测试、真实日期重跑、页面检查、浏览器截图和完整验证重新证明，不能因为本规格存在就被视为正确。

## 背景证据

2026-06-15 的数据说明，问题不是单纯缺内容：

- `reports-data/2026/06/2026-06-15.candidates.json` 中有 185 条候选，最终收录 50 条。
- `reports-data/2026/06/2026-06-15.json` 中 `main_items` 只有 3 条。
- `self_check.selection_snapshot.main_items.eligible_candidates` 也是 3，说明主新闻池在生成阶段被过度收窄。
- GitHub、community、builder、project 等栏目有内容，但基本不能反哺主体流。
- 多个源处于 degraded 或 blocked：Hugging Face Trending 400、DeepSeek 404、Reddit 403、WeChat/Zhihu kill switch、热门博客 0、官方大厂源多处 no signal。

当前主矛盾：生成端把主体流当成白名单事实池，导致候选池很大但主体极少；后续补救又容易把内部字段、来源标签和模板废话渲染到公开页面。

## 目标形态

主体流改成短新闻流，不再是官方/一手白名单池。

- 主体最低 5 条、目标 8 条、最多 12 条；低于 5 条记录生成期短缺事件。
- 超过 12 条视为过量，需要合并、去重或降级到附属栏目。
- 官方、一手、多源确认不再是准入门票，而是排序和保留优先级。
- 公开页仍然只展示标题、2-3 行事实摘要和来源链接，不展示生成过程、选择理由、source audit、自检、候选池、通用来源标签或模板解释。

## 设计原则

1. 默认接纳，黑名单剔除  
   AI/科技相关候选默认可进入主体流，只有命中明确黑名单才排除。

2. 统一候选池，栏目是标签  
   GitHub、Builder、博客、社区、官方动态、媒体线索都先进入统一候选池，再按角色标签分发。栏目不再是隔离水池。

3. 排序决定优先级，去重决定保留谁  
   官方/一手、公共重要性、大厂声量、行业影响、近期热度、README/正文信息密度都用于排序，而不是硬门禁。

4. 严格发生在生成过程  
   严格抓取、清洗、去重、排序、摘要和垃圾句过滤；事后校验只兜底页面损坏、严重重复、主体为 0、公开泄漏等事故级问题。

5. 源健康是产品能力  
   源失败不应只在日报里 degraded，要能定位到哪个源、哪类失败、替代入口是什么、是否影响主体流。

## 本轮十点修复落地矩阵

| 用户确认的问题 | 规格决定 | 后续实现边界 | 必须验证的证据 |
|---|---|---|---|
| 1. 去掉“必须偏官方/一手/公共重要性才放行”的硬准入 | 主体准入改为黑名单制；官方、一手、公共重要性只影响排序、去重和保留优先级 | `report:draft` 不能用 primary/official whitelist 作为 `main_items` 基础门槛 | 黑名单 fixture 中低风险 GitHub、Builder、博客、社区候选可补位进入主体 |
| 2. 栏目隔离太硬 | 栏目改成角色标签；候选先入统一池，再分发到主体和附属栏目 | GitHub、Builder/X、hot blog、community、official update 可同时拥有多角色；公开页同一事件只渲染一次 | 同一候选跨栏目可参与主体补位，重复事件合并为证据 |
| 3. 同日窗口太窄 | 主体不足 5 条时扩展到 72 小时；近 7 天已正文发布的内容默认去重 | `window_fill:true` 只保留在内部数据，公开页不解释“补位” | 72 小时补位测试、7 天历史去重测试和真实日期重跑证据 |
| 4. 官方源覆盖实际失效 | 官方源必须有健康记录和替代入口，不以 registry 存在冒充有效覆盖 | source health 记录 `last_checked_at`、`last_success_at`、`last_effective_item_at`、`candidate_count`、`included_count`、`fallback` | OpenAI/Anthropic/Google/Meta/Microsoft/HF/国内模型公司源组有 checked/no_signal/blocked/unconfigured 证据 |
| 5. “严格生成”没有落地 | 严格点前移到 draft：选题、摘要、去重、垃圾句、密度和质量事件在生成期完成 | 事后 gate 只兜底事故级问题，不用硬门禁卡住低风险日报 | draft 质量检查能在写 HTML 前发现并处理公开垃圾句 |
| 6. 主新闻补位循环 | 第一轮不足 5 条时按官方/一手、GitHub、Builder、hot blog、72 小时、低风险弱信号顺序补位 | 补位后再次去重、重写摘要、剔除垃圾句 | `strict_selected`、`refill_selected`、`remaining_shortfall` 可审计 |
| 7. 每个候选写清楚为什么没进主体 | 每个被评估候选都要写 `main_reject_reason` 或 `main_selection_stage` | 公开页隐藏这些字段；候选池和 self_check 保留 per-candidate 与汇总统计 | `.candidates.json` 可追踪候选入选、补位、合并、拒绝原因 |
| 8. 修复源而不是只修页面 | 页面只展示生成结果和 degraded 状态；真正修复点在 discovery、source registry、daily-runner 和候选标准化 | 不允许通过公开模板填充假内容或隐藏源失败 | source health 能解释源失败如何影响主体、附属栏目和替代路径 |
| 9. 主体不足是生成期质量事件 | 主体不足不直接阻塞日报，但必须记录 `main_stream_shortfall` | 只有主体为 0 且无可信来源支撑时才升级为阻塞 | 真实日期不足时有 selected/refill/shortfall/rejection/source impact 事件 |
| 10. 回归测试 | 单元、E2E、page-check、真实日期重跑和浏览器截图共同构成验收 | 不能只用 fixture 或一次页面静态检查声称稳定 | `corepack pnpm run validate`、date-specific page-check、`1280x900` 桌面截图和 runtime artifacts 同时存在 |

## 黑名单制准入规范

候选命中以下任一类，不进入主体流：

| 黑名单原因 | 说明 | 处理 |
|---|---|---|
| `blacklisted_not_ai_or_tech` | 与 AI/科技/平台/算力/内容产业/开发者生态无明确关系 | 丢弃 |
| `blacklisted_missing_source` | 没有可点击来源、来源不可追溯或 URL 无效 | 丢弃或保留内部诊断 |
| `blacklisted_missing_substance` | 只有标题、榜单名、情绪判断，没有事实摘要 | 丢弃 |
| `blacklisted_generic_trending` | 只有“进入 GitHub Trending Top 10”一类榜单废话，没有 README 归纳和价值判断 | 不进主体，可留 GitHub 榜单 |
| `blacklisted_public_filler` | 包含“这条动态主要围绕”“来源 第三方报道”“序号 1/2/3”“后续继续跟进”等公开垃圾句 | 退回重写；重写失败则丢弃 |
| `blacklisted_unverified_high_risk` | 融资、估值、价格、benchmark、安全事故、监管、模型能力等高风险事实未回到一手或多源 | 降级为弱信号 |
| `blacklisted_ad_or_marketing` | 招聘、课程、活动营销、普通公关稿、缺少实质变化的合作稿 | 丢弃或低优先级线索 |
| `blacklisted_duplicate_lower_priority` | 同一事件已有更高优先级版本 | 合并证据，保留高优先级版本 |
| `blacklisted_recently_published` | 最近 7 天已经进入日报正文且无新增实质变化 | 丢弃或合并为追踪 |
| `blacklisted_future_or_bad_date` | 日期未来、无法确认发布日期、窗口异常 | 丢弃或降级 |

每个进入主体评估流程的候选都必须留下内部审计结果：

- 入选：记录 `main_selection_stage`，例如 `strict`、`refill_github`、`refill_builder`、`refill_hot_blog`、`refill_window`、`refill_weak_signal`。
- 未入选：记录 `main_reject_reason`，并在可适用时记录 `duplicate_of`、`merged_into`、`source_impact` 或 `rewrite_failed_reason`。
- 这些字段只允许留在候选池、`self_check` 或质量事件里，不得渲染到公开日报正文。

## 排序和保留优先级

排序按“公共重要性 + 信息密度 + 可验证性 + 新鲜度 + 多样性”组合，不按抓取顺序。

优先级从高到低：

1. 大模型、AI 平台、核心 API、模型能力、价格/配额、分发渠道、监管、安全、算力和重大资本/组织变化。
2. OpenAI、Anthropic、Google/DeepMind、Meta、Microsoft、Hugging Face、NVIDIA、AWS、Apple、国内大模型公司等高声量主体。
3. 原始发布、官方公告、论文、GitHub release、模型卡、产品文档、可验证 benchmark。
4. 多源同时指向同一事件。
5. GitHub/开源项目中有 README 归纳、增长信号、release 或明确使用场景的项目。
6. Builder/X 中有原始 URL、具体事实、争议点或早期产品信号的内容。
7. 热门博客、访谈、播客中有 3-5 个具体要点或 200-500 字摘要价值的内容。
8. 微信、知乎、Reddit 等弱信号只在标注后低优先级进入，不替代事实主线。

同一事件保留顺序：

1. 原始发布方。
2. 官方工程/研究/产品博客。
3. GitHub release、论文、模型卡、文档 changelog。
4. 多源确认的媒体报道。
5. 高质量博客/访谈。
6. 社区弱信号。

## 栏目隔离处理

后续实现要把“栏目先行”改成“统一池 + 多角色标签”。

候选可以同时拥有多个角色：

```json
{
  "roles": [
    "main_stream_candidate",
    "github_trending",
    "hot_blog",
    "builder_signal",
    "community_signal",
    "official_update"
  ]
}
```

主体流从统一池里选最多 12 条，目标 8 条，低于 5 条记录短缺。附属栏目继续存在，但不再阻止优质内容进入主体。

处理规则：

- GitHub Trending 必查 Top 10；其中 1-3 条高价值项目可进入主体，但不能用榜单废话填充主体。
- Builder/X 可进入主体，但必须是具体产品、模型、实验、发布、架构变化、争议或行业早期信号。
- 热门博客可进入主体，但必须是高信息密度文章、访谈、播客或工程分析。
- 微信/知乎/Reddit 默认是弱信号；只有追到一手来源或属于低风险观点/行业观察时，才可进入主体并明确标注。
- 官方组织更新可进入主体，也可以同时保留在官方更新视角，但公开页不能重复渲染同一事件。

## 时间窗口和历史去重

生成端使用滚动窗口，而不是只看当天。

- 默认窗口：当天。
- 主体不足 5 条时：扩展到 72 小时。
- 热门博客、GitHub 项目、研究/工程深读可按源级 `lookback_days` 放宽，但不能重复包装旧内容。
- 最近 7 天已进入日报正文的 URL，默认不再进入 `main_items`。
- 同一事件不同 URL 只保留一条，其他来源合并为证据或引用。
- 72 小时补位内容需要在内部数据里标记 `window_fill:true`，但公开页不写“为了补位”。

## 生成端主新闻补位循环

后续 `report:draft` 应执行以下流程：

1. 收集所有候选。
2. 标准化来源、日期、URL、标题、正文摘要、角色标签。
3. 应用黑名单剔除明显差内容。
4. 对同 URL、同事件、同主题做合并。
5. 计算排序分。
6. 选出第一轮主体流。
7. 如果少于 5 条，依次补位：
   - 官方/一手/多源候选中未入选的 AI 相关内容。
   - GitHub 高价值项目。
   - Builder/X 高信号内容。
   - 热门博客/访谈/播客高信息密度内容。
   - 72 小时窗口内未重复的重要内容。
   - 标注后的低风险弱信号。
8. 再次去重和合并。
9. 重写摘要，剔除公开垃圾句。
10. 写入生成期质量事件和拒绝原因统计。

## 生成期质量事件

主体不足、源失败、补位失败都应该在生成期记录，不应该靠页面校验猜。

建议结构：

```json
{
  "type": "main_stream_shortfall",
  "target_min": 5,
  "target_max": 30,
  "selected": 3,
  "strict_selected": 3,
  "expanded_selected": 0,
  "remaining_shortfall": 2,
  "top_rejection_reasons": {
    "blacklisted_duplicate_lower_priority": 12,
    "blacklisted_generic_trending": 8
  },
  "source_impacts": [
    {
      "source_group": "huggingface_trending",
      "status": "blocked",
      "reason": "http_400",
      "affects_main_stream": true
    }
  ]
}
```

质量事件不阻塞日报，除非主体为 0 且没有可信来源支撑。

## 源健康治理

每个源组都要有健康状态，而不是只在失败后写一句 degraded。

最小字段：

```json
{
  "source_id": "huggingface_trending_models",
  "source_group": "huggingface_trending",
  "last_checked_at": "ISO-8601",
  "last_success_at": "ISO-8601|null",
  "last_effective_item_at": "YYYY-MM-DD|null",
  "status": "checked|no_signal|blocked|unconfigured|degraded",
  "failure_code": "http_400|null",
  "candidate_count": 0,
  "included_count": 0,
  "affects_sections": ["main_items", "huggingface_trending"],
  "fallback": "rss|html|manual_input|none"
}
```

优先修复：

1. Hugging Face Trending：修 API 参数或换稳定页面/备用接口。
2. DeepSeek：替换 404 新闻页，维护官方公告、模型页、GitHub/org feed 或可验证发布页。
3. 国内大模型公司：维护 Qwen、Kimi、智谱、MiniMax、百川、阶跃、零一万物等稳定入口。
4. WeChat/Zhihu：没有真实入口时必须标注 unconfigured，不得假装健康；有白名单输入时进入弱信号或可回源内容。
5. Reddit：403 时使用 RSS、缓存或代理入口；仍作为弱信号，不直接写事实主线。
6. OpenAI/Anthropic/Google/Meta/Microsoft/HF：区分官方 newsroom、engineering blog、research blog、changelog、model card，不能混成 intermediary lead。

## 公开渲染边界

实现时仍然保持生产日报由 `.codex/skills/effective-interact` 的 `pre-rendered` 模式生成。

公开页禁止出现：

- `source_audit`
- `self_check`
- `candidate_id`
- `included_in`
- `verification_status`
- `source_level`
- `selection_snapshot`
- `quality_status` 内部字段
- “来源 第三方报道”
- “今天进入 GitHub Trending Top 10”
- “这条动态主要围绕”
- “序号 1/2/3”
- “后续继续跟进”
- “读者应重点核对”

这些信息可以留在结构化 JSON、候选池、质量事件或交接材料中，但不进入公开正文。

## 实施计划

### Phase 0：规格冻结

本阶段只做文件工作，不能把计划当成实现完成：

- 写入本文。
- 在需求矩阵加入控制性 addendum。
- 在 `config/feedback-ledger.json` 和 quick reference 中绑定这条长期要求；如果没有真实测试名，不得写成 `implemented`。
- 同步 prompt 合同，避免生成端继续被“官方/一手白名单”和“Builder 不计入主体”等旧规则拉回去。
- 更新 `tasks/current-task.md`、`progress.md`、`session-handoff.md`。
- 不继续扩大生产实现代码；已有实现改动必须在后续阶段用测试和真实生成产物证明，或者按用户指令回退。

### Phase 1：测试先行

先写失败测试，不改生产实现：

- 主体默认黑名单准入。
- 统一候选池跨栏目补位。
- 72 小时窗口补位和 7 天历史去重。
- 候选拒绝原因统计。
- 主体不足质量事件。
- 源健康状态。
- 公开垃圾句过滤。
- 5–12 条主体不被判为 oversized，13 条及以上必须标记为 oversized。

红灯命令固定为：

```powershell
node --test tests/unit.test.js --test-name-pattern "main stream candidates by blacklist|sparse main stream from unified candidate roles|generic GitHub trending text|main stream rejection reason counts|main stream shortfall|more than twelve story-first main items"
```

红灯证据必须保存在 `.tmp/red-main-stream-output.tap` 或同等临时文件中；绿灯证据必须记录在 `tasks/current-task.md` 的 `Regression Self-Check`。

### Phase 1.5：实现入口门

只有同时满足以下条件，才允许把 `tasks/current-task.md` 从 file-only 改成 implementation scope：

- 用户明确授权进入实现，或后续请求明确要求修复代码、测试、生成器、页面或真实产物。
- `tasks/current-task.md` 重新写入 implementation 规格，包含允许路径、禁止路径、红灯测试、确定性替代证据、验证命令和回归自检。
- 红灯测试已经实际运行并保存失败证据；如果 fixture 已经被脏实现改绿，必须使用真实日期产物作为 deterministic red substitute。
- 当前 2026-06-15 真实产物状态必须被记录：`main_items` 数量、`strict_selected`、`refill_selected`、`shortfall`、候选池数量、top rejection reasons。
- 已明确处理 48 小时与 72 小时的边界：48 小时只能作为默认新鲜度或源健康活跃度指标；主体不足补位以 72 小时 sparse-day refill 和 7 天历史去重为准。
- 不得把 PR、publish、merge、push、GitHub Pages 设置或自动化配置纳入实现阶段，除非用户单独授权。

### Phase 2：数据模型和选择器

调整候选结构和 `src/draft.js`：

- 增加 `roles`、`main_stream_candidate`、`main_reject_reason`、`main_selection_stage`、`window_fill`。
- 将 `canPromoteToMain` 从白名单门禁改为黑名单剔除。
- 将栏目分流改为统一池排序。
- 实现补位循环。
- 输出 rejection counts。

### Phase 3：源健康和源修复

调整 discovery/daily-runner/quality-status：

- 每个源组记录健康状态。
- 修 Hugging Face Trending、DeepSeek、Reddit、WeChat/Zhihu 配置状态。
- 把官方源从 intermediary lead 误分类中拆出来。
- 把源失败变成可诊断的生成期质量事件。

### Phase 4：公开输入清洗

调整 interaction input 和质量循环：

- 不让内部字段进入公开页。
- 阻断垃圾句。
- GitHub、Builder、hot blog、weak signal 进入主体时使用读者可读摘要。
- 保持 effective-interact 组件体系。

### Phase 5：真实重跑和视觉验收

使用真实日期重跑：

- 生成 `.candidates.json` 和日报 JSON。
- 检查主体流达到 5–12 条，并以 8 条为目标。
- 检查补位原因和拒绝原因可审计。
- 构建 HTML。
- 用页面检查和浏览器截图验证日报页与 index 页。

## 测试标准

### Unit

必须新增或改造的测试：

- `report:draft admits main stream candidates by blacklist instead of primary-only whitelist`
- `report:draft fills sparse main stream from unified candidate roles`
- `report:draft does not fill main stream with generic GitHub trending text`
- `report:draft deduplicates same event and keeps the highest-priority source`
- `report:draft uses 72 hour refill without republishing recent history`
- `report:draft records main stream rejection reason counts`
- `report:draft records per-candidate main rejection reasons`
- `report:draft records main stream shortfall as generation quality event`
- `source health records blocked unconfigured no-signal and effective candidate counts`
- `public interaction input strips source bucket labels and generation diagnostics`
- `date index treats more than twelve story-first main items as oversized`

### E2E / Page Checklist

必须覆盖：

- 3 条主体：页面可渲染，但显示 `主体偏少`，不阻塞。
- 5 条主体：达标。
- 5–12 条主体：不显示 oversized。
- 13 条以上主体：显示过量或要求合并。
- 公开 HTML 不包含内部字段和垃圾句。
- compact main list 仍然在详细折叠块之前。
- index 页同时显示整体质量和主体流状态。

### Evidence Matrix

| 要求 | 最小测试证据 | 最小运行时证据 | 不足以证明完成的证据 |
|---|---|---|---|
| 黑名单准入替代官方/一手白名单 | 低风险 GitHub、Builder、hot blog、community fixture 能从统一池进入补位；高风险未核验事实仍被拒绝 | 真实日期 `selection_snapshot.main_items` 显示 `strict_selected`、`refill_selected`、target 边界和 rejection counts | 只看到页面有 5 条，或只看到某个 fixture 通过 |
| 栏目隔离解除 | 同一候选可同时拥有 `main_stream_candidate` 与 GitHub/Builder/blog/community role；重复事件只渲染一次 | `.candidates.json` 能追踪 role、selection stage、duplicate/merge 关系 | 单独栏目有内容，但没有进入统一候选池审计 |
| 72 小时 sparse-day 补位 | 72h 内候选可补位；7 天已发布 URL 不再进入主体 | 真实日期产物记录 `window_fill:true` 或等价内部证据，并保留真实 `event_date` | 公开页写“补位”解释，或仍用 48h 作为主体硬上限 |
| 生成端严格去垃圾 | 单测覆盖标题、summary、bullets 不复读、不出现模板套话、不泄漏 source bucket | 真实日期主新闻抽样检查：每条有源支持的 2-3 行事实摘要，且公开 HTML 无垃圾短语 | 事后 page-check 把坏句挡住，或 `report:write` 失败但 draft 仍产出垃圾 |
| 候选拒绝原因完整 | 每个被评估候选都有 `main_selection_stage` 或 `main_reject_reason` | `.candidates.json` missing audit count 为 0，并能汇总 top rejection reasons | 只有 selected 项有审计，未入选候选不可追踪 |
| 源健康与降级 | blocked、no_signal、unconfigured、degraded、effective candidate count 均有 fixture | `source_audit` / source health 记录 source group、last checked、candidate count、included count、fallback、source impact | registry 里有 URL，或公开页只写 degraded 但无法定位源 |
| effective-interact 生产渲染 | 单测确认 `buildSite` 调用 effective-interact pre-rendered，并保留组件 affordance | 构建后的单日报 HTML 含 effective-interact generator marker、filterable cards、导航/组件能力 | 手写模板伪造 marker，或只检查 HTML 文件存在 |
| index 影响 | E2E/page-check 覆盖 1–4、5–12、13+ 主体数量状态 | `docs/index.html` 对真实报告显示正确主体流状态，不把 13+ 判为达标 | 只看单日报页，不检查 index |
| 完整完成声明 | 目标测试、真实日期 draft/write/build、page-check、`1280x900` 桌面截图、`corepack pnpm run validate` 全部存在 | handoff 引用具体文件、命令、截图和计数 | 只跑 `corepack pnpm run validate`，或只跑真实日期但没有截图/page-check |

### Runtime Evidence

不能只用 fixture 声称稳定。实现完成后至少提供：

- 一个真实日期的 `.candidates.json`。
- 一个真实日期的 `reports-data/YYYY/MM/YYYY-MM-DD.json`。
- `selection_snapshot.main_items` 中的 selected、expanded、rejection counts。
- `quality_status` 或等价质量事件。
- `docs/reports/YYYY/MM/YYYY-MM-DD.html`。
- `docs/index.html`。
- `1280x900` 桌面截图。

### Claim Boundary

只能在同时具备以下证据后说“已修复”：

- ledger 项存在，且 `node scripts/validate-feedback-contract.mjs` 通过。
- 红灯测试先失败、实现后同名测试通过。
- 真实日期重跑后 `reports-data/YYYY/MM/YYYY-MM-DD.json` 的 `main_items` 达到 5–12 条（目标 8 条），或不足时有 `main_stream_shortfall` 质量事件。
- `docs/reports/YYYY/MM/YYYY-MM-DD.html` 与 `docs/index.html` 已由 build 更新。
- page-check 和浏览器截图证明公开页没有内部字段、垃圾句、遮挡、溢出或 index 状态误判。

## 验收命令

后续实现完成前，至少运行：

```powershell
node --test tests/unit.test.js
node --test tests/e2e/site.e2e.js
corepack pnpm run build
node scripts/check-daily-page.mjs --date YYYY-MM-DD --out docs --output .tmp/page-check-main-stream-generation-repair.json
node scripts/harness-validate.mjs
corepack pnpm run validate
```

如果修改 `.codex/skills/effective-interact`，还要确认技能 smoke 测试包含在 `corepack pnpm test` 中并通过。

## 明确非目标

- 不把事后 page check 改成新的硬门禁。
- 不因为补位而发布未核验的高风险事实。
- 不绕过 effective-interact。
- 不把 GitHub 榜单、source audit、候选池、自检或质量事件当作公开正文。
- 不自动发布、commit、push、PR 或改定时任务。

## 完成定义

只有同时满足以下条件，才能说这轮主体偏少修复完成：

- 真实生成结果主体流达到 5–12 条（目标 8 条），或不足时有清楚的生成期短缺事件。
- 候选拒绝原因可审计。
- GitHub、Builder、hot blog、社区弱信号能按规则参与补位。
- 官方源健康表能解释失败和替代入口。
- 公开页没有内部诊断字段和垃圾句。
- index 页不把整体强信号和主体达标混为一谈。
- 单元、E2E、页面检查、浏览器视觉验收和 `corepack pnpm run validate` 都通过。
