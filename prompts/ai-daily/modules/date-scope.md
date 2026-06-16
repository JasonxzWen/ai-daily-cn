## 日期窗口

- 默认关注最近 24 小时。
- 如果高质量主体信息少于 5 条，可以扩展到 72 小时补位。
- 扩展时间范围前，先拓展信源覆盖：官方发布页、开发者博客、云厂商 changelog、GitHub Release、Hugging Face、arXiv 和工程工具。
- 72 小时内仍不足 5 条时，允许发布 degraded 日报，但必须写入生成期 `main_stream_shortfall` 或等价质量事件；不要继续用低质量内容凑数。
- 扩展窗口必须写入 `source_window`、`window_fill` 或等价内部字段；公开页不解释“为了补位”。
- 每个主体条目必须保留真实 `event_date`。
- 不能把旧事件包装成“今日发布”。
