## 去套话检查

在写入 `.tmp/daily-report.json` 前，先做一次公开文本改写。

保留：

- 事实、日期、产品名、模型名、项目名、来源和可验证动作。
- 对读者有用的判断，但必须落到具体变化，例如“增加 OpenAI-compatible endpoint”“扩展到 2026-05-19 官方发布”。

删除或改写：

- “高信号”“核心信号”“可观察信号”“更多信号”“其他信号”等泛化判断。
- “赋能”“范式转变”“生态闭环”“价值闭环”“想象空间”等空泛包装。
- “重点 1 / 重点 2”“预期收益”“未命名建议”等工作汇报腔；改成具体条目名和“为什么要改”。
- 用户不需要关心的执行细节。网络失败、扩窗、空数组只在自检或信源审计中用一句话说明，不进入摘要。

检查顺序：

1. 先读 `summary`、`main_items[*].bullets`、`model_releases[*].summary`、`hot_blogs[*].summary`、`projects[*].description`、`self_check.notes` 和 `optimization_suggestions`。
2. 删掉重复解释，只保留会影响读者判断的信息。
3. 再运行 `npm run report:write`；如果返回 `plain_language_failed`，按错误路径改写，不要绕过校验。
