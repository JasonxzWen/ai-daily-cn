## HTML 主产物

每日最终发布产物是自包含、可读性好的静态 HTML，不是 Markdown。

HTML 要求：

- 使用 `<!doctype html>` 和 `lang="zh-CN"`。
- 不加载远程脚本。
- 不依赖远程字体或 CDN。
- 外部链接使用 `target="_blank"` 和 `rel="noopener noreferrer"`。
- 内容适合桌面和移动端阅读。
- 页面包含日期、摘要、主体信息、项目、Builder 观察、社区线索、自检摘要、`optimization_suggestions` 提示词/规则迭代建议和来源链接。
- Header 使用 `hero_highlights`，只展示当天最重磅的消息、项目或观点；不要从 `summary` 机械截句，也不要写“其余条目见后文”。
- 空数组对应板块不要渲染到正文和导航中；例如没有 Builder 观察时，不显示“Builder 观察”导航和“暂无 Builder 观察”正文。
- 热门技术博客只展示 300-500 字内容摘要，不展示“为什么重要”。
- 今日值得关注的项目必须展示“领域”和“作用”，说明可用于什么场景、解决什么问题。
- 页面文本必须转义，不得把采样内容当作 HTML 注入。

仓库发布器会先把结构化 `report.json` 转成 `.codex/skills/effective-interact` 的 interaction input，再用 `pre-rendered` 模式生成公开 HTML；如果你直接生成 HTML，也必须同时产出等价的结构化 JSON 供验证和 feed 使用。
