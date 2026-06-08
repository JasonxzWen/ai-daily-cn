# AI 日报内容改版 ROI 计划

> 状态：归档分析快照。当前唯一权威资产为 `prompts/ai-daily/modules/editorial-authority.md`；如与本文冲突，以该文件为准。

## 目的

这份文档不是另起炉灶，而是把仓库里已经存在但分散的内容规范、good case / bad case、发布合同和用户最新反馈收拢成一份可执行的内容改版清单。它只定义方向、优先级和落点，不替代 `tasks/current-task.md`。

## 本轮严格参考的现有资产

- [docs/ai-daily-distribution-testing-prompt-spec.md](/C:/Users/Admin/.codex/worktrees/ce7e/ai-daily-cn/docs/ai-daily-distribution-testing-prompt-spec.md:1)
  已有 `good case / bad case / forbidden case`，不需要重新发明评审口径。
- [docs/ai-daily-source-expansion-spec.md](/C:/Users/Admin/.codex/worktrees/ce7e/ai-daily-cn/docs/ai-daily-source-expansion-spec.md:1)
  已有信源扩展、去 AI 味、空板块处理和栏目映射规则。
- [docs/ai-daily-section-quality-index.md](/C:/Users/Admin/.codex/worktrees/ce7e/ai-daily-cn/docs/ai-daily-section-quality-index.md:1)
  已明确“不要展示抓取运行日志”，这条要继续放大。
- [docs/publisher-decisions.md](/C:/Users/Admin/.codex/worktrees/ce7e/ai-daily-cn/docs/publisher-decisions.md:1)
  已确认公开产物仍以结构化 HTML 为主，不退回手写长文档。
- [prompts/ai-daily/modules/plain-language.md](/C:/Users/Admin/.codex/worktrees/ce7e/ai-daily-cn/prompts/ai-daily/modules/plain-language.md:1)
  已有去套话合同，本轮只做扩展，不另起一套规则。

## 当前问题

### 仓库内已经暴露出来的 bad case

- 公开页仍会漏出英文执行说明和流程日志，例如 `Generated after syncing current main with strict coverage gates`。
- 主体新闻和卡片里会出现模板判断句，例如“读者应重点核对”“判断点”“把它当作……信号”。
- 读者口径仍写成“普通工程师”，导致内容会天然偏模型、工具、开源和工程实施，而不是内容、产品、平台和策略。
- `hot_blogs` 的公开名字曾经写成“热门技术博客”，实际限制了它的内容边界，也不符合当前“热门博客”的公开口径。
- 低价值厂商小动态会挤占头部注意力，尤其是没有能力边界、分发、价格、组织或工作流变化的轻量发布。

### 外部长日报里值得借鉴、但不能照搬的部分

- 值得借鉴：
  - `内容赛道动态`
  - `观点与分析`
  - `今天值得关注的产品`
  - `今日热点的 Twitter 讨论`
- 不建议照搬：
  - 固定 `Product Hunt` 栏目
  - 固定 `精选播客` 栏目
  - 固定 `Twitter 热点讨论` 栏目
  - 纯列表式“今天发生了什么”

原因很简单：本仓库的优势是结构化、可验证、可审计。可以吸收外部长日报的内容框架，但不该退回成手写信息流。

## Top 10 ROI

### 1. 收紧选题阈值，先砍低价值小新闻

- ROI：最高
- 为什么先做：
  信息质量低的核心原因不是板块少，而是主线里混入了太多“看起来像新闻、其实没有判断价值”的东西。
- 这轮怎么落：
  在 `selection-rules` 里明确拉黑轻量厂商更新、重复发布、例行上架、轻运营开放、泛合作稿。

### 2. 把 `hot_blogs` 公开改名为“热门博客”

- ROI：最高
- 为什么先做：
  这是把日报从“技术博客池”拉向“内容/产品型长日报”的最短路径，且不需要推翻 schema。
- 这轮怎么落：
  字段仍保留 `hot_blogs`，公开标题改成“热门博客”，允许承载产品拆解、平台策略、内容生态、组织方法和高质量访谈/播客。

### 3. 改读者合同，不再只服务“普通工程师”

- ROI：高
- 为什么先做：
  读者口径决定整份日报的选题和叙事角度。口径不改，后面所有优化都会被旧 prompt 拖回去。

### 4. 把机器日志和模板判断句加进质量门

- ROI：高
- 为什么先做：
  用户已经多次指出“机器日志”“AI 味”“工作汇报腔”，这类问题不能只靠人盯。

### 5. 主体新闻从“工程工具快讯”拉向“内容/产品/平台主线”

- ROI：高
- 为什么先做：
  读者要的是“今天该怎么看这个行业”，不是“又上了一个小 release”。

### 6. 国内/中文内容从补充项提升为稳定供给

- ROI：高
- 为什么先做：
  外部英文源已经够多，真正的差异化来自高质量中文/国内内容的稳态进入。

### 7. 保留完整 GitHub Trending Top 10，但下调它的叙事权重

- ROI：中高
- 为什么这样做：
  Top 10 是仓库合同，不能丢；但它不该变成整份日报的头条来源。

### 8. X/Builder 从“帖子流”改成“争议与信号”

- ROI：中高
- 为什么这样做：
  用户要的是争议点、分歧和早期信号，不是简单搬运原帖。

### 9. Hero / summary 改成真正的编辑导语

- ROI：中
- 为什么这样做：
  现在的 summary 偶尔还是标题串联和流程说明，缺少“今天到底该看什么”的编辑判断。

### 10. 建长期专题仓和能力地图

- ROI：中，但长期收益大
- 为什么这样做：
  外部长日报的真正优势不是栏目名，而是长期专题积累。

## 哪些板块“抄”起来 ROI 最高

### 高 ROI

- `观点与分析`
  最适合映射到“热门博客”。
- `内容赛道动态`
  最适合补齐当前仓库在 AIGC / 内容产业 / 创作者工具上的薄弱处。
- `今天值得关注的产品`
  最适合映射到 GitHub Trending Top 10 + 经过核验的 project highlights。

### 中 ROI

- `今日热点的 Twitter 讨论`
  可以借它的“争议议题”写法，但仍坚持原帖可追溯和结构化审计。
- `精选播客更新`
  只收录真正能服务产品、平台、组织或创作工作流判断的单集。

### 低 ROI

- 照搬整套栏目名
- 按榜单拆固定区
- 把产品、播客、Twitter 都做成每天必出的独立大板块

## 本轮落地清单

- 把 `hot_blogs` 的公开命名改成“热门博客”。
- 把读者口径改成“内容 / 产品 / 平台 / 策略 / 工程”的混合读者。
- 把低价值小新闻过滤、机器日志过滤和模板判断句过滤写进 prompt 合同和质量门。
- 保留 GitHub Trending Top 10，不动它的完整性合同。

## 暂不在本轮做的事

- 不手改历史日报。
- 不重写 schema。
- 不新增固定 `Product Hunt` / `播客` / `Twitter` 大栏目。
- 不为了模仿外部长日报而牺牲结构化 JSON、source_audit 和质量门。
