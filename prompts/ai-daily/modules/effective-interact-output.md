## Effective Interact 日报生成规范

> 范围声明：本模块仅适用于公共信号流完成后的可选遗留编辑报告（legacy report）。它不治理 `docs/signals/**`，不得改变公共信号流的成员集合、默认时序或发布结果；这里的 HTML 和成稿质量要求不构成公共信号发布门槛。

可选遗留编辑日报 HTML 必须通过本仓库内的 `.codex/skills/effective-interact` 生成，不再直接手写生产日报模板，也不得用独立公开 renderer 伪装成 `pre-rendered` 产物。

执行边界：

- 结构化草稿可以由 `corepack pnpm run daily:codex-pipeline -- --date YYYY-MM-DD --execute` 分阶段生成；该入口会把信息收集、legacy 选稿判断、逐条新闻概括和组装拆成独立 Codex CLI 上下文。旧的 `corepack pnpm run report:draft -- --date YYYY-MM-DD --input <discovery-jsons> --output .tmp/daily-report.json --candidate-output .tmp/source-candidates-YYYY-MM-DD.json` 仍保留为确定性回退路径。两条路径最终都必须用 `corepack pnpm run report:write -- .tmp/daily-report.json reports-data YYYY-MM-DD` 标准化。
- `corepack pnpm run build` 会把标准化后的日报 JSON 转成 effective-interact interaction input，并调用 `.codex/skills/effective-interact/scripts/create-interaction.mjs` 生成公开 HTML。
- 公开日报使用 `renderMode: "pre-rendered"`，不得依赖远程脚本、远程字体或 CDN runtime。
- interaction input 必须保留日报日期、覆盖时间范围、摘要、主体信息、非空热门博客、GitHub Trending weekly Top20、Builder 观察、社区线索、公开“信源覆盖与缺口”摘要、结构化 JSON 链接和 effective-interact 组件能力；空数组对应板块不要渲染到正文和导航中；国内/中文动态并入现有栏目，不生成独立“国内动态”导航项。
- 正文证据图和热门博客/卡片图片必须通过 effective-interact 的 lightbox 交互支持点开放大；内嵌来源 icon 不参与放大。
- 榜单类内容优先用 effective-interact 的结构化表格、本地 tracking component 或 sanitized official DOM/CSS snapshot 呈现；OpenRouter、Artificial Analysis 等公开页面不得把整页截图、浏览器截图或 viewport 截图作为正文主内容。Artificial Analysis 抓不到 official snapshot 时隐藏数据卡并显示源不可用说明；不得渲染 fake/simple/toy component。
- `model_releases` 只保留为结构化 JSON 索引，不渲染公开“模型发布”正文板块；相关模型新闻必须先进入 `main_items`。
- `projects` 只作为 GitHub Trending 条目内的领域、用途和信号数据来源；不渲染公开“今日值得关注的项目”独立板块，也不渲染“项目 highlight / 项目 highlights”标签、子标题或额外项目列表。未匹配到 GitHub Trending Top20 的 `projects` 不公开展示。
- 非一手来源进入观点、产品、Builder 或社区板块时，interaction input 必须在结构化数据里保留 `source_level` / `verification_status`，但公开卡片不要用“已核查事实 / 官方一手来源 / 第三方报道 / 社区线索 / 原始社交动态”等通用来源桶做重复 tag 或详情格；读者可见信息优先使用真实来源名、标题、正文、日期、原文链接和必要的具体披露。
- `stories` 是生产日报主新闻流：默认 8 条、最多 12 条，允许少于 8；每个主题分组公开渲染为默认展开的大 cell，内部展示具体标题、2-3 条读者事实 bullet、`evidence_level` 和来源链接。`what_happened` / `why_it_matters` 可作为结构化素材，但公开页不得显示“发生了什么：/ 为什么值得看：”字段标签，也不得给每条 story 生成默认折叠详情。`main_items` 仅作为兼容映射，不得重新作为独立事实池；公开页不渲染 `reader_relevance`、入选条件、候选分数或 watch-next。
- 热门博客公开卡片只呈现 100-200 个中文字符的文章概括和来源；不要渲染 `key_points`。当结构化草稿摘要不足、模板化或重复时，生成阶段应裁剪/降级或阻塞，不要在页面模板里临时造解释性废话。
- 图片不是必填项；只有尺寸、语义和可读性合格的网页内部图片资产可公开展示，tiny icon、favicon、logo、头像、装饰图和不可读截图都不得展示。
- 公开日报默认隐藏 source audit、自检、ledger、quality status 详情、candidate diagnostics、执行命令、remediation、parsed_count 和失败案例复盘；这些只留在 `reports-data`、质量报告或交接材料中。
- 今日缺口只能是短的读者说明，例如固定来源不可用、相关栏目缩减或省略；不要公开候选数、抓取日志、修复建议或内部字段名。
- 不要把工作汇报式的文件行号、实现细节或本地绝对路径写入公开日报；公开日报只展示面向读者的新闻、工程判断和可公开来源。
- 如果 effective-interact 生成失败，报告 `publish_error`，保留结构化 JSON，不要回退到旧手写 HTML 模板悄悄发布。
