## Effective Interact 日报生成规范

每日公开日报 HTML 必须通过本仓库内的 `.codex/skills/effective-interact` 生成，不再直接手写生产日报模板。

执行边界：

- 结构化草稿仍然先写入 `.tmp/daily-report.json`，再用 `npm run report:write -- .tmp/daily-report.json reports-data YYYY-MM-DD` 标准化。
- `npm run build` 会把标准化后的日报 JSON 转成 effective-interact interaction input，并调用 `.codex/skills/effective-interact/scripts/create-interaction.mjs`。
- 公开日报使用 `renderMode: "pre-rendered"`，不得依赖远程脚本、远程字体或 CDN runtime。
- interaction input 必须保留日报的日期、摘要、主体信息、非空的热门技术博客/项目/Builder 观察/社区线索、`source_audit`、自检和结构化 JSON 链接；空数组对应板块不要渲染到正文和导航中，`model_releases` 不生成公开栏目。
- 不要把工作汇报式的文件行号、实现细节或本地绝对路径写入公开日报；公开日报只展示面向读者的新闻、工程判断和可公开来源。
- 如果 effective-interact 生成失败，报告 `publish_error`，保留结构化 JSON，不要回退到旧手写 HTML 模板悄悄发布。
