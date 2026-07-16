---
schema_version: 1
surface: ai-daily-curated-edition-target
audience:
  - AI 产品和工程从业者
  - 内容平台和 AIGC 观察者
  - 策略、投资和组织决策读者
layout:
  report_shell_max_width: 1184px
  edition_grid_columns: 2
  global_rank_required: true
  nested_story_details: forbidden
typography:
  body_font_size: 16px
  body_line_height: 1.65
  card_body_font_size: 15px
  metadata_font_size_min: 12px
  tag_font_size_max: 13px
  nav_font_size: 13px
  letter_spacing: 0
icons:
  inline_site_icon: 16px
  card_title_icon: 18px
  max_public_source_icon: 22px
  source_icon_border_radius: 6px
radii:
  story_card: 14px
  control: 8px
  source_icon: 6px
  pill: 999px
tags:
  border_radius: 999px
  hover_required: true
  topic_format_only: true
  constant_credibility_pills: forbidden
  topic_l1: "current-warm-accent"
  topic_l2: "current-warm-muted"
  format: "current-paper-muted"
  exception: "state-specific"
navigation:
  left_rail_levels:
    - topic_l1
    - topic_l2_when_populated
    - format
    - special_anchor
  story_item_links: hidden
public_copy:
  mode: grounded-reader-copy
  admission_copy_separation: required
  per_item_independent_summary: ordinary-sources-required
  trusted_upstream_passthrough: aify_today_passthrough_v1
  upstream_description_clamp: forbidden
  source_role_required: true
  editorial_source_required_when_distinct: true
  collector_lineage_required: true
  banned_public_labels:
    - 发生了什么：
    - 为什么值得看：
    - 入选理由
    - 准入
    - 候选池
    - 信源审计
validation:
  page_checks:
    - globally_ranked_two_column_edition
    - current_edition_rail_preserves_rank
    - adc_design_single_token_owner
    - source_icon_size_stable
    - tag_visual_treatment_stable
  content_gates:
    - content:contract
    - generation-first
---

# AI 日报公开页设计规范

<!-- curated-edition-contract-ref:v1 -->

> **2026-07-15 accepted target / implementation pending.** Future public IA, edition budgets, specialized GitHub/X/Paper/Model/Benchmark components, rounded source icons, summary/source-role semantics and feature-survival decisions are owned by [`docs/ai-daily-curated-homepage-migration-spec.md`](docs/ai-daily-curated-homepage-migration-spec.md). The target preserves the current warm-paper topbar/rail/two-column card language, uses only `A.D.C.` in the masthead, and changes information density and semantics without restoring the old lead/secondary layout or introducing the light-gray/white-panel/indigo proposal. The target rail is a hierarchical topic/format filter over the current edition; it is not full-history search or an importance-level display. `@adc/design` becomes the sole token owner over Astryx primitives. Story-first/lossless wording below describes historical or current runtime only until phased cutover.

## 设计目标

AI 日报是给读者快速判断当天 AI 生态变化的新闻产品，不是生成流程审计页。公开页面必须先回答“今天发生了什么、对谁有什么影响、原文在哪里”，而不是展示候选池、信源准入、运行日志或模型自评。

视觉气质是高密度、克制、可扫描的编辑型工作台：信息密度高，但不堆卡片；层级清楚，但不把每条新闻折叠成需要展开的工单；强调来自标题、摘要、来源和标签，而不是装饰性 hero、巨型 icon 或花哨动效。

## 信息架构

- 首屏不放编辑宣言、库存指标、Today Five 或 lead/secondary 重复入口；masthead 只显示 `A.D.C.`、日期、revision/status 和前后日导航，随后立即进入 ranked 信息流。
- 主编区在当前双列卡片语言中按全局重要性显示 10–14 条；X、Paper、Model 保留各自 typed 语义，但不另起一套局部排序。GitHub Top10 独立成紧凑排行表，Benchmark 仅在变化时出现聚合组件。
- 左 rail 展示当前期的 L1/L2 主题、载体和专项锚点；空 L2 隐藏。筛选只作用于当前 edition 并保持原 rank，不承担全文历史搜索，也不展示 core/supporting 等内部重要性等级。
- `/signals` 是二级持久池浏览面，保留来源组、日期/历史和渐进加载；它不反向决定首页 IA。

## 公开文案

信息准入和公开概括是两个阶段：

- 准入阶段只判断是否选入，准入理由留在内部字段。
- 概括阶段只面向读者写正文，每条普通新闻独立处理，优先由独立 Codex 上下文或 subagent 完成。Aify「今日精选」是显式可信上游直通例外，不进入任何二次摘要、翻译、critic、semantic verifier 或评分上下文。
- 公开文本不得出现“发生了什么：”“为什么值得看：”“入选理由”“候选池”“信源审计”“判断时还要看公开材料”等后台话术。
- 每条普通新闻用标题加一句事实摘要表达主体、动作/结论与必要范围；通过 edition 严格校验的 `source_summary` 可直接复用。Aify「今日精选」原样完整显示上游 title/description，不受普通摘要 120 字建议限制；数据层不得截写，本阶段也不得用不可展开的 line clamp 隐藏正文。`why_it_matters` 只在能增加不同影响信息时显示，不写 2–3 条模板 bullet。
- 每张卡始终显示内容发布者/作者与角色、主题 + 载体、采集器和材料直链；采集器有安全 URL 才链接。Aify/newsletter/digest 的具体文章可以直接作为材料来源；Aify「今日精选」外链项还要显示 Aify 是摘要编辑来源，不能把其描述归因给落地站点。
- 只在异常时显示多源、已更正、来源不可用或数据降级；不显示一手/单源转述/社区线索/待核等常态可信度 pill，`pending/needs_review` 不进入首页。
- GitHub/Hugging Face 项目必须说清楚“它是什么、解决什么问题、适合谁观察”，不能复读 repo slug 或 README 抓取状态。
- 热门博客摘要是 100-200 个中文字符的文章概括，只保留核心问题、方法或论证、关键结论、适用场景或局限。

## 视觉规则

- 正文字号以 16px 为基准；卡片正文约 15px；元数据不得小于 12px；标签不超过 13px。不要用 viewport width 缩放字号。
- source icon 是辅助识别，不是视觉主角：inline icon 16px，标题 icon 18px，任何公开来源 icon 不得超过 22px，统一使用 6px 圆角与同尺寸 fallback。
- tag 用于主题与载体，并延续当前克制色彩与 hover；不得用一排高饱和 badge 代替信息层级。
- 保留当前视觉基线：story card 使用 14px 圆角，control/nav 使用 8px，source icon 使用 6px，pill 使用 999px；不要把这些角色合并成一个全局 radius，也不要嵌套卡片或把页面 section 做成浮动大卡。
- 不使用装饰性渐变球、bokeh、巨大 hero 插画或营销式 split hero。日报首屏以内容密度取胜。
- 外链必须新窗口打开并带 `noopener noreferrer`；图片只有在能增强理解时才进入正文。

## 公开状态一致性

- `reports-data/YYYY/MM/YYYY-MM-DD.json` 是单篇日报质量状态的事实来源；站点构建不得用新版渲染代码把已落盘的 `quality_status.status` 从 `degraded` 改成 `blocked`，或从 `ok` 改成其他状态。
- `docs/data/YYYY/MM/YYYY-MM-DD.json`、`docs/index.html` 和单篇 HTML 的状态徽标必须与源报告一致。新版质量规则只能在生成阶段拦截或写入报告，不能在公开站点构建阶段倒推重判历史日报。
- 如果老报告缺少 `quality_status`，构建可以补派生值；补值后必须在测试中覆盖 `reports-data`、`docs/data`、首页三者的一致性。

## 组件约束

- `story_card`：同一当前视觉基线下使用 typed variant；包含 rank、来源行、标题、一句话摘要和必要专项字段，不嵌套大卡。
- `left_rail`：L1 主题常显、只显示有内容的 L2、载体筛选和专项锚点；隐藏单条 story anchors，筛选保持全局 rank。
- `tag/chip`：紧凑、克制、有 hover；只承载主题、载体和少量异常状态，不能承载候选池、内部评分或 credibility 等级。
- `source_icon`：只作为链接身份标识；不能被 lightbox 捕获，也不能撑高标题行。
- `provenance_line`：明确区分内容发布者/作者与采集器；无安全 collector URL 时只渲染纯文本。
- `github_trending_row`：优先 README-grounded 中文用途说明；README 失败时展示榜单元数据和失败标记，不编造用途。

## 验证绑定

任何触碰日报渲染、文案生成、准入逻辑或自动化 prompt 的改动，至少运行：

```powershell
corepack pnpm run content:contract
node --test tests/generation-first.test.js tests/content-contract.test.js
node --test tests/unit.test.js
corepack pnpm run quality:page-check -- --date YYYY-MM-DD
```

涉及页面结构、icon、tag、左栏或折叠行为时，还要跑相关 unit/e2e，并只保留 `1280x900` 桌面 viewport 的浏览器验收记录。移动、平板、窄屏和触摸专用设计不在产品范围内。
