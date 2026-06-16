# AI 日报分发、测试与提示词构建规范

> 状态：归档/参考。当前唯一权威资产为 `prompts/ai-daily/modules/editorial-authority.md`；如与本文冲突，以该文件为准。

> 2026-06-15 后续覆盖：主体目标已改为 5-30 条短新闻流；Builder/X、热门博客、GitHub、社区弱信号和白名单公众号等低风险候选可参与 sparse-day 主体补位；主体不足时生成端可扩展到 72 小时并记录短缺质量事件。本文中旧的 5-10 条、48 小时 fallback 或 Builder 永不计入 `main_items` 规则只作为历史背景，不再作为当前执行合同。

## 目标

本文定义“每日 AI 日报自动发布为 GitHub Pages 静态站点”的实现前规格，覆盖：

- 分发路径与发布安全边界。
- Markdown、JSON、HTML、feed 的产物契约。
- 测试分层与验收门。
- 提示词构建模块。
- good case、bad case、forbidden case。
- 信源优先级与校验规则集。
- 自检与提示词优化闭环。

本文件是开发前规格，不包含实现代码。

相关扩展规格：

- [AI 日报信源扩展与内容质量规格](ai-daily-source-expansion-spec.md)：定义 Builder/X、热门博客、访谈/播客、Product Hunt、新产品和空板块处理的后续实现规则。

## 范围

包含：

- `ai-daily` 生成中文 AI 日报。
- 日报 Markdown 转结构化 JSON。
- 通过 `.codex/skills/effective-interact` 进行静态 HTML 渲染。
- 首页和 `feed.json` 更新。
- 写入 GitHub Pages 发布目录。
- 安全 git commit/push 策略设计。
- 发布状态写入自检字段。
- prompt 质量闭环。

不包含：

- 当前阶段不实现发布脚本。
- 当前阶段不创建 GitHub Actions。
- 当前阶段不修改 GitHub Pages 远端设置。
- 当前阶段不自动改 `automation.toml`。
- 当前生产日报渲染链路使用 `.codex/skills/effective-interact`，不再使用旧手写单篇日报模板。

## 核心术语

| 名称 | 含义 |
|---|---|
| 日报原文 | `report.md`，由 `ai-daily` 输出的中文 Markdown |
| 结构化数据 | `report.json`，从日报原文和自检字段解析得到 |
| 发布页面 | `report.html`，单篇日报静态 HTML |
| 首页索引 | `index.html`，列出最新和历史日报 |
| 聚合 feed | `feed.json`，机器可读日报索引 |
| 发布目录 | 默认 `docs/`，供 GitHub Pages 从分支发布 |
| 发布器 | 后续实现的本地程序，负责转换、渲染、写文件和安全 git 操作 |
| 自检字段 | 日报末尾 `## 自检与优化建议` 中的 JSON |
| prompt 包 | 由 base、信源、格式、校验、发布状态等模块拼接成的提示词 |
| effective-interact | 公开日报 HTML 生成技能，输入为仓库转换出的 interaction JSON，输出为 `pre-rendered` 静态 HTML |

## 分发架构

### 推荐拓扑

第一阶段：

```text
ai-daily cron
  -> report.md
  -> report.json
  -> report.html
  -> docs/index.html + docs/feed.json
  -> git commit
  -> git push
  -> GitHub Pages branch source: main /docs
```

第二阶段备选：

```text
ai-daily cron
  -> report.md + report.json
  -> commit source artifacts
  -> GitHub Actions build
  -> upload Pages artifact
  -> GitHub Pages Actions source
```

当前推荐第一阶段，因为：

- 当前仓库为空，没有构建链路。
- 日报可直接生成静态 HTML。
- `docs/` 发布路径最短。
- 失败面少，容易审计。

### 发布目录

```text
docs/
  .nojekyll
  index.html
  feed.json
  assets/
    style.css
  reports/
    YYYY/
      MM/
        YYYY-MM-DD.html
        YYYY-MM-DD.md
  data/
    YYYY/
      MM/
        YYYY-MM-DD.json
```

### URL 规则

默认站点根：

```text
https://jasonxzwen.github.io/ai-daily-cn/
```

单篇日报：

```text
https://jasonxzwen.github.io/ai-daily-cn/reports/YYYY/MM/YYYY-MM-DD.html
```

结构化数据：

```text
https://jasonxzwen.github.io/ai-daily-cn/data/YYYY/MM/YYYY-MM-DD.json
```

聚合 feed：

```text
https://jasonxzwen.github.io/ai-daily-cn/feed.json
```

### 幂等规则

- 同一 `report_date` 重跑时，覆盖同日期 Markdown、JSON、HTML。
- `feed.json` 以 `report_date` 为唯一键更新，不重复追加。
- `index.html` 总是从 `feed.json` 或规范化报告列表重建。
- 同一日期重跑的 commit message 可以包含 rerun 标记，但不能删除历史日期。
- 发布器只管理自己声明的路径，不触碰未声明文件。

### Git 安全规则

发布器必须：

- push 前执行 `git status --porcelain`。
- 识别本次将写入的文件列表。
- 若存在非发布器生成的未提交改动，停止。
- 若远端领先，停止。
- 只执行普通 commit。
- 只执行普通 push。
- 不执行 `git reset --hard`。
- 不执行 `git push --force`。
- 不自动 stash。
- 不自动删除用户文件。
- 失败后只记录 `publish_error` 和建议。

## 数据契约

### Markdown 契约

日报 Markdown 必须包含：

- `# AI 日报`
- 摘要行：`> 今日主体信息 N 条 ...`
- 主体信息：`## 1. 标题 [event_date: YYYY-MM-DD]`
- 每条主体信息下至少一个来源链接。
- 可选 `今日值得关注的项目`。
- 可选 `Builder 观察`。
- 可选 `社区线索`。
- 必须包含 `## 自检与优化建议`。
- 自检区必须包含一个可解析 JSON code block。

### JSON 契约

`report.json` 必须包含：

- `schema_version`
- `report_date`
- `title`
- `summary`
- `canonical_url`
- `main_items`
- `projects`
- `builder_observations`
- `community_leads`
- `self_check`
- `publish_status`
- `generated_at`

关键约束：

- `report_date` 使用 `YYYY-MM-DD`。
- `event_date` 使用 `YYYY-MM-DD`。
- URL 必须是绝对 URL。
- `main_items` 目标为 5-30 条；5 是低信号日最低值，5-20 是常规舒适区，21-30 是高信号日可接受区间。不能为了凑数引入低质量内容。
- Builder 观察优先独立展示；符合黑名单过滤、信息密度和低风险边界的 Builder/X 候选可作为 sparse-day `main_items` 补位来源。
- 没有可靠来源时数组为空，不写猜测。
- 没有发布错误时 `publish_error` 为空字符串。

### Feed 契约

`feed.json` 必须：

- 使用稳定 schema。
- `reports` 按 `report_date` 倒序。
- 每个日期只出现一次。
- 相对 URL 不以 `/` 开头，便于 Pages project site 路径部署。
- 每条记录包含 `report_date`、`title`、`summary`、`url`、`data_url`、`markdown_url`、`main_items`、`builder_observations`、`generated_at`。

### HTML 契约

HTML 必须：

- 使用 `<!doctype html>`。
- 设置 `lang="zh-CN"`。
- 设置 viewport。
- 引用本地 `assets/style.css`。
- 不注入远程脚本。
- 不加载远程字体。
- 所有外链加 `rel="noopener noreferrer"`。
- 保留原始来源链接。
- 展示自检摘要。
- 提供 Markdown 和 JSON 链接。
- 在移动视口不出现明显内容重叠。

## 提示词构建规范

提示词应拆成可维护模块，不把所有逻辑堆进一段长 prompt。

推荐模块：

| 模块 | 目的 |
|---|---|
| `base` | 角色、语言、受众、阅读时长、总体目标 |
| `date_scope` | 当前日期、时区、24h 默认窗口、72h sparse-day 补位和 7 天历史去重规则 |
| `source_policy` | T0/T1/T2/T3 信源优先级 |
| `watchlist` | 公司、模型、GitHub 项目、coding/agent 工具、builder 名单 |
| `selection_rules` | 主体信息计数、去重、降级、不可凑数 |
| `output_markdown` | Markdown 结构和章节模板 |
| `structured_candidates` | 候选条目的中间 JSON 字段 |
| `validation_rules` | 自检前必须执行的内容校验 |
| `publish_status` | 发布状态字段契约 |
| `optimization_loop` | 何时提出 prompt 优化建议，何时需要用户确认 |

### Base 模块

必须表达：

```text
你是技术团队的 AI 日报主编。
输出中文。
目标读者是 3-10 年经验的研发工程师与技术管理者。
读者应在 5-8 分钟内获得事实、数据、观点来源和可追溯链接。
只写可验证内容。
```

### 日期窗口模块

规则：

- 默认关注最近 24 小时。
- 如果有效主体信息少于 5 条，可放宽到 72 小时补位。
- 进一步放宽必须在 `notes` 中明确说明。
- 所有条目必须保留 `event_date`。
- 不能把旧事件包装成“今日发布”。

### 信源模块

信源分级：

| Tier | 类型 | 处理规则 |
|---|---|---|
| T0 | 官方博客、论文、GitHub release、模型卡、官方公告、原始 benchmark | 优先作为最终引用 |
| T1 | Builder、研究者、founder、maintainer 原始帖子或视频 | 可作 Builder 观察或事实线索 |
| T2 | GitHub、Hugging Face、arXiv、HN、Reddit、Product Hunt | 可作发现源，需尽量回溯 |
| T3 | 媒体报道 | 只作发现线索，最终尽量回到 T0/T1/T2 |

禁止：

- 只引用二手媒体转述而不回源。
- 写没有来源的数字。
- 写无法验证的“业内认为”“广泛关注”。
- 把 X thread 情绪化观点当事实。

### 输出模块

主体信息结构：

```markdown
## 1. {标题} [event_date: YYYY-MM-DD]

- {事实 / 数据 / 机制 / 原话}
- {事实 / 数据 / 机制 / 原话}

来源：[原文](URL)
```

Builder 观察结构：

```markdown
- {作者名}：{具体观点 / 发布内容 / 实测结论}。来源：[原文](URL)
```

自检结构：

```json
{
  "report_date": "YYYY-MM-DD",
  "main_items": 0,
  "builder_observations": 0,
  "builder_skill_used": [],
  "fallback_sources": [],
  "primary_links": true,
  "no_banned_words": true,
  "no_unsourced_numbers": true,
  "notes": "",
  "publish_status": {
    "html_generated": false,
    "repo_updated": false,
    "repo_pushed": false,
    "pages_url": "",
    "publish_error": ""
  },
  "optimization_suggestions": []
}
```

## Good Case

### Good Case: 官方发布

输入事实：

- 官方博客发布新模型。
- 有发布日期。
- 有官方 URL。
- 有明确功能、API、限制或 benchmark。

期望输出：

- 计入 `main_items`。
- `tier` 为 `T0`。
- `event_date` 为官方发布日期。
- 要点只写事实、数字、机制、限制。
- 来源使用官方 URL。

### Good Case: GitHub Release

输入事实：

- 目标项目发布 release。
- release notes 有功能变更和 breaking changes。

期望输出：

- 如果与 AI 工程相关，计入主体信息。
- 记录 repo、tag、release URL。
- 不写 star 数，除非来源明确且有意义。
- 如只是普通 patch，进入项目表或省略。

### Good Case: Builder 原始观察

输入事实：

- maintainer 发布技术 thread。
- 内容是具体实测或设计解释。

期望输出：

- 放入 Builder 观察。
- 如果只是观点观察，保留在 Builder 观察；如果同时具备具体事实、来源、低风险边界和信息密度，可作为 sparse-day `main_items` 补位候选。
- 只摘具体观点。
- 来源指向原帖或原视频。

### Good Case: 24h 信息不足

输入事实：

- 最近 24 小时只有 4 条高质量 T0/T1/T2。

期望输出：

- 放宽到 72 小时补位，并记录内部短缺/补位证据。
- `notes` 明确说明窗口扩大。
- `fallback_sources` 记录 fallback。
- 不凑低质量条目。

## Bad Case

### Bad Case: 媒体二手转述

输入：

- 媒体称某公司“即将发布重大模型”。
- 没有官方来源。

处理：

- 不计入主体信息。
- 可作为社区线索，且标明“待验证”。
- 不写确定性标题。

### Bad Case: 无来源数字

输入：

- “性能提升 30%”，但没有原始 benchmark。

处理：

- 删除数字。
- 或改写为“官方未给出可核验数字”，如果这本身有意义。

### Bad Case: 重复事件

输入：

- 官方博客、GitHub release、媒体报道都指向同一事件。

处理：

- 只保留一条主体信息。
- 来源优先官方或 GitHub。
- 媒体不作为最终引用。

### Bad Case: Builder 情绪观点

输入：

- “某 builder 说这个产品很震撼”。

处理：

- 不收录。
- 除非有具体实测、repo、数据或设计观点。

## Forbidden Case

以下内容不得进入最终日报：

- 没有来源的数字。
- 没有原始链接的媒体搬运。
- “对我们的影响”“工程意义”“启示”“总之”“赋能”“深度融合”等模板化段落。
- 把预测写成事实。
- 把广告、公关稿、招聘营销内容写成技术动态。
- 把同一事件拆成多条凑数。
- 把 Builder 观察计入主体信息数量。
- 把站点发布失败掩盖为成功。
- 发布失败后继续 push 或执行破坏性 git 操作。

## 校验规则集

### 内容校验

| 规则 | 失败处理 |
|---|---|
| `main_items` 默认 5-30 条 | 少于 5 条时允许 fallback，并写生成期短缺事件 |
| 每条主体信息有 URL | 缺失则删除该条或降级为线索 |
| 每条主体信息有 `event_date` | 缺失则停止结构化转换 |
| 无禁止词 | 失败则要求重写 |
| 无无源数字 | 失败则删除数字或补来源 |
| 去重 | 合并同事件 |
| Builder 默认独立展示，但合格低风险候选可参与主体补位 | 失败则修正角色标签和计数 |

### Schema 校验

| 规则 | 失败处理 |
|---|---|
| `report.json` 可解析 | 停止 HTML 渲染 |
| required fields 不为空 | 停止发布 |
| URL 格式合法 | 停止发布或删除条目 |
| 日期格式合法 | 停止发布 |
| `feed.json` 日期唯一 | 重建 feed |

### HTML 校验

| 规则 | 失败处理 |
|---|---|
| HTML 非空 | 停止发布 |
| 主要章节存在 | 停止发布 |
| 外链 rel 合规 | 修复后再发布 |
| 无远程脚本 | 停止发布 |
| 移动/桌面无明显重叠 | 修复后再发布 |
| 本地 CSS 可加载 | 修复后再发布 |

### Git 校验

| 规则 | 失败处理 |
|---|---|
| 工作树无非自动化改动 | 记录 `dirty_worktree` |
| 当前分支允许发布 | 记录 `wrong_branch` |
| 远端未领先 | 记录 `remote_ahead` |
| commit 成功 | 否则不 push |
| push 成功 | 记录 push 错误，不 force |

## 测试策略

### Unit Tests

必须覆盖：

- Markdown 标题解析。
- 主体条目解析。
- 来源链接解析。
- 自检 JSON 提取。
- JSON schema 校验。
- HTML escaping。
- feed 插入、更新、排序、去重。
- Pages URL 生成。
- `publish_status` 默认值。

### Golden Fixtures

建议目录：

```text
tests/
  fixtures/
    reports/
      good/
        official-release.md
        github-release.md
        sparse-72h-refill.md
      bad/
        media-only.md
        unsourced-number.md
        duplicate-event.md
        missing-self-check.md
      expected/
        official-release.json
        github-release.json
```

Golden 规则：

- good fixture 必须稳定通过。
- bad fixture 必须失败在预期错误码。
- expected JSON 字段顺序稳定。
- 日期和 URL 不依赖当前时间。

### Integration Tests

必须覆盖：

- 从 Markdown 生成 JSON 和 HTML。
- 从多篇 JSON 生成 feed 和 index。
- 同一日期重跑保持 feed 唯一。
- 输出目录不存在时创建目录。
- 输出目录已有同日期文件时安全覆盖。
- 非发布器管理文件不被修改。

### Browser Tests

必须覆盖：

- 打开 `docs/index.html`。
- 打开一篇日报 HTML。
- 验证标题、日期、主体信息、来源链接可见。
- 验证 JSON/Markdown 链接存在。
- 验证移动视口宽度 375px 下没有明显横向破版。
- 验证桌面视口宽度 1280px 下主内容宽度可读。
- 验证如果有筛选或展开控件，交互有效。

### Publish Dry Run Tests

必须覆盖：

- 干净工作树：输出将写入文件、将提交文件、commit message。
- dirty worktree：停止并返回 `publish_error`。
- wrong branch：停止并返回 `publish_error`。
- remote ahead：停止并返回 `publish_error`。
- push denied：本地 commit 保留，错误被记录，不 force。

## 发布状态契约

`publish_status` 字段：

```json
{
  "html_generated": true,
  "repo_updated": true,
  "repo_pushed": false,
  "pages_url": "",
  "publish_error": "push_failed: remote rejected non-fast-forward"
}
```

语义：

- `html_generated`：本地 HTML 是否成功生成。
- `repo_updated`：目标仓库文件是否成功写入。
- `repo_pushed`：是否成功推送远端。
- `pages_url`：预计或实际页面 URL。
- `publish_error`：空字符串表示无错误；非空表示失败原因。

第一版建议：

- 公开 `report.json` 中记录到“生成与本地写入”阶段。
- 最终 push 结果写入自动化运行摘要。
- 如果要求页面公开最终 push 状态，再设计二阶段状态提交。

## 自检与提示词优化闭环

优化建议只允许针对真实发生的问题：

- 信源不足。
- 24h 窗口不足。
- Builder 原始来源不可访问。
- 重复事件过滤失败。
- 自检 JSON 字段缺失。
- 禁止词遗漏。
- 无源数字遗漏。
- 发布状态字段缺失。

不得把工程 bug 伪装成 prompt 优化：

- HTML 模板 bug 应进入工程修复。
- git push 权限问题应进入发布错误。
- schema parser bug 应进入测试修复。

用户确认规则：

- prompt 自动迭代必须等待用户确认。
- 用户明确说“确认”“可以”“按建议改”“开始优化”等，才允许修改 `automation.toml`。
- 修改时只改 `prompt` 字段，并保留任务配置字段。

## 实现阶段入口条件

进入开发前必须确认：

- 目标 GitHub 仓库。
- 发布分支。
- Pages 发布目录。
- 站点 URL。
- 是否允许自动 commit/push。
- 是否公开 Markdown 原文。
- 是否保留全部历史日报。
- 是否采用 `skill-hub` 安装 profile。
- 是否使用 Node/Bun/Python 作为发布器实现语言。
- 是否要求 GitHub Actions 第二阶段发布。

进入自动发布前必须具备：

- `build`。
- `test`。
- `test:e2e`。
- `validate`。
- `publish:dry-run`。
- dirty worktree 保护。
- push 失败保护。
- 至少一轮真实浏览器验证。
