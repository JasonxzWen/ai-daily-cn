---
schema_version: 1
surface: ai-daily-public-report
audience:
  - AI 产品和工程从业者
  - 内容平台和 AIGC 观察者
  - 策略、投资和组织决策读者
layout:
  report_shell_max_width: 1180px
  story_track_default_open: true
  story_track_cell: single-large-cell
  nested_story_details: forbidden
typography:
  body_font_size: 16px
  body_line_height: 1.65
  card_body_font_size: 15px
  tag_font_size_max: 13px
  nav_font_size: 13px
  letter_spacing: 0
icons:
  inline_site_icon: 16px
  card_title_icon: 18px
  max_public_source_icon: 22px
tags:
  border_radius: 999px
  hover_required: true
  background_required: true
  topic: "#e8f2ff"
  major: "#ffe8d4"
  notable: "#e9f7ef"
  date: "#f1f5f9"
navigation:
  left_rail_levels:
    - category
    - section
  story_item_links: hidden
public_copy:
  mode: story-first
  admission_copy_separation: required
  per_item_independent_summary: required
  banned_public_labels:
    - 发生了什么：
    - 为什么值得看：
    - 入选理由
    - 准入
    - 候选池
    - 信源审计
validation:
  page_checks:
    - story_first_sections_expanded
    - source_icon_size_stable
    - tag_visual_treatment_stable
  content_gates:
    - content:contract
    - generation-first
---

# AI 日报公开页设计规范

## 设计目标

AI 日报是给读者快速判断当天 AI 生态变化的新闻产品，不是生成流程审计页。公开页面必须先回答“今天发生了什么、对谁有什么影响、原文在哪里”，而不是展示候选池、信源准入、运行日志或模型自评。

视觉气质是高密度、克制、可扫描的编辑型工作台：信息密度高，但不堆卡片；层级清楚，但不把每条新闻折叠成需要展开的工单；强调来自标题、摘要、来源和标签，而不是装饰性 hero、巨型 icon 或花哨动效。

## 信息架构

- 首屏摘要必须是编辑导语：用 2-4 句归纳当天主线、变化和读者应该关注的差异。禁止写“今天最值得看的主线有……”这类流水账。
- “总览”左栏只展示一级分类和必要二级 section。单条 story 不进入左栏导航，避免顶部分类和底部子标题混成同一级。
- 大标题下面默认只有一个展开的大 cell，内部包含该分组所有新闻。可以在大 cell 内用小块区分条目，但不得默认折叠每条新闻。
- GitHub Trending、热门博客、Builder/X 和社区线索是附属模块，不可反向污染主体主线，也不可用来凑主线数量。

## 公开文案

信息准入和公开概括是两个阶段：

- 准入阶段只判断是否选入，准入理由留在内部字段。
- 概括阶段只面向读者写正文，每条新闻独立处理，优先由独立 Codex 上下文或 subagent 完成。
- 公开文本不得出现“发生了什么：”“为什么值得看：”“入选理由”“候选池”“信源审计”“判断时还要看公开材料”等后台话术。
- 每条新闻用标题加 2-3 条事实 bullet 表达：时间、产品/模型/项目、变化、限制、影响对象、来源。不要写抽象“价值集中在”“信号集中在”“接口形态”。
- GitHub/Hugging Face 项目必须说清楚“它是什么、解决什么问题、适合谁观察”，不能复读 repo slug 或 README 抓取状态。
- 热门博客摘要是 100-200 个中文字符的文章概括，只保留核心问题、方法或论证、关键结论、适用场景或局限。

## 视觉规则

- 正文字号以 16px 为基准；卡片正文约 15px；标签不超过 13px。不要用 viewport width 缩放字号。
- source icon 是辅助识别，不是视觉主角：inline icon 16px，标题 icon 18px，任何公开来源 icon 不得超过 22px。
- tag 必须有背景色、紧凑字号和 hover 状态；topic、major、notable、date 使用不同颜色族，避免全部灰或全部同色。
- 卡片半径保持 8px 或更小；不要嵌套卡片，不要把页面 section 做成浮动大卡。
- 不使用装饰性渐变球、bokeh、巨大 hero 插画或营销式 split hero。日报首屏以内容密度取胜。
- 外链必须新窗口打开并带 `noopener noreferrer`；图片只有在能增强理解时才进入正文。

## 公开状态一致性

- `reports-data/YYYY/MM/YYYY-MM-DD.json` 是单篇日报质量状态的事实来源；站点构建不得用新版渲染代码把已落盘的 `quality_status.status` 从 `degraded` 改成 `blocked`，或从 `ok` 改成其他状态。
- `docs/data/YYYY/MM/YYYY-MM-DD.json`、`docs/index.html` 和单篇 HTML 的状态徽标必须与源报告一致。新版质量规则只能在生成阶段拦截或写入报告，不能在公开站点构建阶段倒推重判历史日报。
- 如果老报告缺少 `quality_status`，构建可以补派生值；补值后必须在测试中覆盖 `reports-data`、`docs/data`、首页三者的一致性。

## 组件约束

- `story_track`：默认展开，一个 track 一个大 cell；内部条目用标题链接、2-3 条 bullet 和来源行组成。
- `left_rail`：分类优先，二级 section 缩进或左边框区分；隐藏单条 story anchors。
- `tag/chip`：紧凑、彩色、有 hover；不能承载候选池、来源桶或内部审计标签。
- `source_icon`：只作为链接身份标识；不能被 lightbox 捕获，也不能撑高标题行。
- `hot_blog_card`：只渲染 summary 和来源，不渲染 `key_points`。
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
