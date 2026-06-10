## HTML 主产物

每日最终发布产物是自包含、可读性好的静态 HTML，不是 Markdown。

HTML 要求：

- 使用 `<!doctype html>` 和 `lang="zh-CN"`。
- 不加载远程脚本。
- 不依赖远程字体或 CDN。
- 外部链接使用 `target="_blank"` 和 `rel="noopener noreferrer"`。
- 内容适合桌面和移动端阅读。
- 页面包含日期、覆盖时间范围、摘要、主体信息、热门博客、GitHub Trending Top 10、X/Twitter 讨论、社区线索、自检摘要、`optimization_suggestions` 提示词/规则迭代建议和来源链接；国内/中文动态并入现有事实分组、热门博客、GitHub Trending 或社区线索，不生成独立“国内动态”栏目。
- 公共 HTML 必须保留我们相对参考文档的优势：结构化 JSON、source_audit 附录、候选回指、证据图片、GitHub Trending Top 10、Builder 观点卡片和响应式导航；不要为了模仿长日报而退回手写 Markdown 或纯文档形态。
- `summary` 和 Header 必须是读者可读的编辑导语，不得出现“最新 main”“重新生成”“结构化 JSON”“内容单元”等生产过程文案；这些信息只放在 `self_check` 或审计附录。
- 非一手来源进入观点、产品、Builder 或社区板块时，公开卡片必须展示来源层级、待确认边界或风险说明；事实主线不得展示中介来源作为报道实体。不要把 `reader_relevance` / `watch_next` 渲染成“看点/风险”等模板化分点；社区线索卡片用正文自然句披露待确认和边界。
- Header 使用 `hero_highlights`，只展示当天最重磅的消息、项目或观点；不要从 `summary` 机械截句，也不要写“其余条目见后文”。
- 主体信息目标为 8-12 条，默认 10 条；每条只展示标题、2-3 句/行可追溯事实概括和来源链接，实体、变化、限制或关键结论用 `**加粗**` 和 `==高亮词==` 标出。公开页会把高亮词渲染成加粗变色文字，不得把正文关键词做成 tag/chip；tag/chip 只用于重要级别、趋势、星标变化和项目 highlight。不要展示入选条件、候选分数、`why_it_matters`、`reader_relevance` 或 watch-next。
- 主体信息标题不显示来源文字，不加下划线；来源只通过站点 icon 和链接表达。不要把“日报如何跟进/报道边界/信源处理”写进每条新闻。
- 空数组对应板块不要渲染到正文和导航中；例如没有社区线索时，不显示“暂无社区线索”正文。X/Twitter 来源已经检查但没有可入选原始 status 时，必须渲染 `X/Twitter 讨论` 降级说明，不能静默缺板块。
- X/Twitter / Builder 观点必须渲染成类似 Twitter 的预览卡片：头像或字母头像、作者、handle、重要级别/角色/日期 tag、完整中文翻译正文和可审计原文。不得把 Builder 原帖改写成观点概括；有 `avatar_url` 时构建器应尽量缓存为本地 `docs/assets/avatars/**` 资产，失败时使用生成头像。
- AIGC 与内容产业、图片生成、视频生成、创作者工具和 AI 辅助游戏创作在有合格事实主体条目时渲染为现有一级 `AIGC 动态` 分组；只有中介线索或待核验时进入 `community_leads` 并披露核验边界。不要为了模仿外部日报新增静态空板块或手写 HTML 分区。
- `model_releases` 不渲染成公开“模型发布”板块；相关新闻必须合入主体信息，`model_releases` 只作为结构化索引。
- 热门博客每条必须展示 3-5 个分点式要点，正文和 `key_points` 合计要能说明核心问题、方法或论证、关键结论、适用场景和局限；不要只写一句话，也不要展示“为什么重要”、读者画像、后续跟进或风险模板字段。原文有能直接支撑判断的架构图、流程图、benchmark 或关键截图时，通过 `evidence_assets` 贴图；没有信息密度的封面/装饰图不贴。
- 公共 HTML 必须保留“信源覆盖与缺口”摘要，尤其说明微信、知乎、Reddit/X、Builder、热门博客源本轮是否检查、是否 `no_signal`、是否因 kill switch、token、base URL 或人工输入缺失而跳过；但不得公开候选池、筛选分数、内部附录或发布调试日志。
- 正文证据图和热门博客/卡片图片必须可点开放大；来源 icon 只作为标识，不触发图片放大。
- 榜单类公开内容优先渲染结构化表格，例如 OpenRouter / Artificial Analysis 的排名、模型、供应商、分数/token 和周变化；整页截图、浏览器截图或 viewport 截图不得作为公开正文主内容。真正网页内部图片资产只有在尺寸、语义和可读性合格时才展示；无图日报可以通过。
- GitHub Trending 默认展示 Top 10，排名变化、重要级别和 star 变化必须做成不同颜色的 tag；`description` 要比审计短句更完整，说明“是什么、解决什么问题、适合观察什么”。
- `projects` 不渲染独立“今日值得关注的项目”板块，也不渲染“项目 highlights”子标题或额外项目列表；经过额外核验且匹配 GitHub Trending Top 10 的项目，只在对应 Trending 条目上增加 `项目 highlight` tag，并把领域、作用和 star/release 等信号压进行内说明。
- 加粗和高亮只用于一眼重点：实体、变化、限制、状态、排名变化或结论；不要把整段正文高亮。生产渲染器已支持安全 inline Markdown，卡片 body 可使用 `**...**` 和 `==...==`，但单条最多 3 处重点。
- 模型可用性、Statuspage、网关上架、preview access 和区域/账号开放如果出现，默认在社区线索或轻量运营文案中展示，不渲染为独立模型栏目。
- 页面文本必须转义，不得把采样内容当作 HTML 注入。

- 证据图表只能跟随真实证据：原文有图表时优先展示原文图片；只有原文内容天然适合对比、规格、配额、价格、benchmark 或步骤矩阵时才渲染表格。严禁为了每条新闻看起来“更丰富”而批量构造表格。
仓库发布器会先把结构化 `report.json` 转成 `.codex/skills/effective-interact` 的 interaction input，再用 `pre-rendered` 模式生成公开 HTML；如果你直接生成 HTML，也必须同时产出等价的结构化 JSON 供验证和 feed 使用。
