## HTML 主产物

每日最终发布产物是自包含、可读性好的静态 HTML，不是 Markdown。

HTML 要求：

- 使用 `<!doctype html>` 和 `lang="zh-CN"`。
- 不加载远程脚本。
- 不依赖远程字体或 CDN。
- 外部链接使用 `target="_blank"` 和 `rel="noopener noreferrer"`。
- 内容适合桌面和移动端阅读。
- 页面包含日期、覆盖时间范围、摘要、主体信息、热门技术博客、GitHub Trending Top 10、X/Twitter 讨论、社区线索、自检摘要、`optimization_suggestions` 提示词/规则迭代建议和来源链接。
- Header 使用 `hero_highlights`，只展示当天最重磅的消息、项目或观点；不要从 `summary` 机械截句，也不要写“其余条目见后文”。
- 主体信息目标为 8-12 条，默认 10 条；每条 2-4 个短 bullet 分点展示，实体、变化、限制或关键结论用 `**加粗**` 和 `==高亮词==` 标出。公开页会把高亮词渲染成加粗变色文字，不得把正文关键词做成 tag/chip；tag/chip 只用于重要级别、趋势、星标变化和项目 highlight。
- 主体信息标题不显示来源文字，不加下划线；来源只通过站点 icon 和链接表达。不要把“日报如何跟进/报道边界/信源处理”写进每条新闻。
- 空数组对应板块不要渲染到正文和导航中；例如没有社区线索时，不显示“暂无社区线索”正文。X/Twitter 来源已经检查但没有可入选原始 status 时，必须渲染 `X/Twitter 讨论` 降级说明，不能静默缺板块。
- X/Twitter / Builder 观点必须渲染成类似 Twitter 的预览卡片：头像或字母头像、作者、handle、重要级别/角色/日期 tag、完整中文翻译正文和可审计原文。不得把 Builder 原帖改写成观点概括；有 `avatar_url` 时构建器应尽量缓存为本地 `docs/assets/avatars/**` 资产，失败时使用生成头像。
- AIGC 与内容产业、产品与融资雷达、精选播客、X 热点讨论先按现有字段渲染；不要为了模仿外部日报新增静态空板块或手写 HTML 分区。
- `model_releases` 不渲染成公开“模型发布”板块；相关新闻必须合入主体信息，`model_releases` 只作为结构化索引。
- 热门技术博客每条展示约 100-160 个中文字符，拆成 2-4 个分点式要点；不展示“为什么重要”，也不展示发布方、作者、日期等卡片细节字段。原文有能直接支撑判断的架构图、流程图、benchmark 或关键截图时，通过 `evidence_assets` 贴图；没有信息密度的封面/装饰图不贴。
- 正文证据图和热门技术博客/卡片图片必须可点开放大；来源 icon 只作为标识，不触发图片放大。
- GitHub Trending 默认展示 Top 10，排名变化、重要级别和 star 变化必须做成不同颜色的 tag；`description` 要比审计短句更完整，说明“是什么、解决什么问题、适合观察什么”。
- `projects` 不渲染独立“今日值得关注的项目”板块，也不渲染“项目 highlights”子标题或额外项目列表；经过额外核验且匹配 GitHub Trending Top 10 的项目，只在对应 Trending 条目上增加 `项目 highlight` tag，并把领域、作用和 star/release 等信号压进行内说明。
- 加粗和高亮只用于一眼重点：实体、变化、限制、状态、排名变化或结论；不要把整段正文高亮。生产渲染器已支持安全 inline Markdown，卡片 body 可使用 `**...**` 和 `==...==`，但单条最多 3 处重点。
- 模型可用性、Statuspage、网关上架、preview access 和区域/账号开放如果出现，默认在社区线索或轻量运营文案中展示，不渲染到模型发布区。
- 页面文本必须转义，不得把采样内容当作 HTML 注入。

- 证据图表只能跟随真实证据：原文有图表时优先展示原文图片；只有原文内容天然适合对比、规格、配额、价格、benchmark 或步骤矩阵时才渲染表格。严禁为了每条新闻看起来“更丰富”而批量构造表格。
仓库发布器会先把结构化 `report.json` 转成 `.codex/skills/effective-interact` 的 interaction input，再用 `pre-rendered` 模式生成公开 HTML；如果你直接生成 HTML，也必须同时产出等价的结构化 JSON 供验证和 feed 使用。
