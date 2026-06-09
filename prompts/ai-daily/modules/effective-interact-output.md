## Effective Interact 日报生成规范

每日公开日报 HTML 必须通过本仓库内的 `.codex/skills/effective-interact` 生成，不再直接手写生产日报模板。

执行边界：

- 结构化草稿先由 `npm run report:draft -- --date YYYY-MM-DD --input <discovery-jsons> --output .tmp/daily-report.json --candidate-output .tmp/source-candidates-YYYY-MM-DD.json` 从候选池自动选取并写入 `.tmp/daily-report.json`，再用 `npm run report:write -- .tmp/daily-report.json reports-data YYYY-MM-DD` 标准化。
- `npm run build` 会把标准化后的日报 JSON 转成 effective-interact interaction input，并调用 `.codex/skills/effective-interact/scripts/create-interaction.mjs`。
- 公开日报使用 `renderMode: "pre-rendered"`，不得依赖远程脚本、远程字体或 CDN runtime。
- interaction input 必须保留日报的日期、覆盖时间范围、摘要、主体信息、非空的热门博客、GitHub Trending Top 10、Builder 观察、社区线索、`source_audit`、自检和结构化 JSON 链接；空数组对应板块不要渲染到正文和导航中；国内/中文动态并入现有栏目，不生成独立“国内动态”导航项。
- 正文证据图和热门博客/卡片图片必须通过 effective-interact 的 lightbox 交互支持点开放大；内嵌来源 icon 不参与放大。
- `model_releases` 只保留为结构化 JSON 索引，不渲染公开“模型发布”正文板块；相关模型新闻必须先进入 `main_items`。
- `projects` 只作为 GitHub Trending 条目内的项目 highlight tag 和行内说明数据来源；不渲染公开“今日值得关注的项目”独立板块，也不渲染“项目 highlights”子标题或额外项目列表。未匹配到 GitHub Trending Top 10 的 `projects` 不公开展示。
- 非一手来源进入观点、产品、Builder 或社区板块时，interaction input 必须保留来源层级、待确认边界或风险说明，但不要把读者画像、后续跟进和风险模板渲染成重复卡片分点。
- `main_items` 渲染为 8-12 条短新闻流：标题、2-3 句/行事实概括和来源链接；公开页不渲染 `why_it_matters`、`reader_relevance`、入选条件、候选分数或 watch-next。
- 榜单类内容优先用结构化表格呈现；OpenRouter、Artificial Analysis 等公开页面不得把整页截图、浏览器截图或 viewport 截图作为正文主内容。
- 图片不是必填项；只有尺寸、语义和可读性合格的网页内部图片资产可公开展示，tiny icon、favicon、logo、头像、装饰图和不可读截图都不得展示。
- 公开日报默认隐藏 source audit、自检、ledger、degradation、candidate diagnostics、执行命令和失败案例复盘；这些只留在 JSON、质量报告或交接材料中。
- 不要把工作汇报式的文件行号、实现细节或本地绝对路径写入公开日报；公开日报只展示面向读者的新闻、工程判断和可公开来源。
- 如果 effective-interact 生成失败，报告 `publish_error`，保留结构化 JSON，不要回退到旧手写 HTML 模板悄悄发布。
