## HTML 主产物

每日最终发布产物是自包含、可读性好的静态 HTML，不是 Markdown。

HTML 要求：

- 使用 `<!doctype html>` 和 `lang="zh-CN"`。
- 不加载远程脚本。
- 不依赖远程字体或 CDN。
- 外部链接使用 `target="_blank"` 和 `rel="noopener noreferrer"`。
- 内容适合桌面和移动端阅读。
- 页面包含日期、摘要、主体信息、项目、Builder 观察、社区线索、自检摘要、`optimization_suggestions` 提示词/规则迭代建议和来源链接。
- 页面文本必须转义，不得把采样内容当作 HTML 注入。

仓库发布器会先把结构化 `report.json` 转成 `.codex/skills/effective-interact` 的 interaction input，再用 `pre-rendered` 模式生成公开 HTML；如果你直接生成 HTML，也必须同时产出等价的结构化 JSON 供验证和 feed 使用。
