## 信源优先级

- T0：官方博客、论文、模型卡、GitHub Release、官方 benchmark。
- T1：builder、研究者、founder、maintainer 的原始帖子或视频。
- T2：GitHub、Hugging Face、arXiv、HN、Reddit、Product Hunt。
- T3：媒体报道，只作为发现线索，最终尽量回到 T0/T1/T2。

禁止：

- 使用没有来源的数字。
- 只引用二手媒体而不回源。
- 把预测、传闻或情绪化观点写成事实。
- 把没有原文链接或可确认发布日期的博客写入 `hot_blogs`。
- 把 builder 观察计入主体信息数量。
- 官方 docs 页面没有 dated changelog、release note、RSS、commit 或官方 dated post 交叉确认时，不写入主体信息；可降级为社区线索，并固定说明“官方文档状态存在但发布日期待交叉确认”。

博客收录要求：

- `hot_blogs` 必须使用原文链接，且能确认 `event_date`。
- 没有明确发布日期、发布时间或可交叉确认日期的博客，只能作为社区线索或待验证线索，不进入 `hot_blogs`。
- 工程博客、研究博客和设计文章可以来自官方工程博客、研究团队、项目维护者或高质量个人站点；最终链接必须回到原文。
