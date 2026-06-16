# Codex 自动化创建参数

## 21:30 状态自检自动化

每天 21:30 另设一个 `status:self-check` 定时任务，输出 `.tmp/status-self-check-YYYY-MM-DD.json`。它只做状态自检，不生成新日报、不真实 publish；检查 `sources:phase5-audit`、`publish:dry-run:daily`、Pages HTTP、信源健康和自动化清单。若发现 `multiple_active_daily_publish_automations`，必须作为 blocking issue 报告。

## 推荐参数

| 字段 | 值 |
|---|---|
| Name | `AI 日报生成、push 与 GitHub Pages 发布` |
| Kind | `cron` |
| Execution environment | `worktree` |
| CWD | 当前项目目录；如界面要求显式路径，使用 `D:\ai-daily-cn` |
| Schedule | 每日 02:30 |
| RRULE | `FREQ=DAILY;BYHOUR=2;BYMINUTE=30;BYSECOND=0` |
| Timezone | `Asia/Shanghai` |
| Model | 默认 Codex 模型即可；需要更稳时用高推理模型 |
| Reasoning effort | `xhigh` |
| Status | `ACTIVE` |

## 自动化提示词

```text
始终用中文回复。

你在 ai-daily-cn 项目根目录内运行。定时任务必须以最新 `origin/main` 为权威基线生成和发布日报；未合并 PR、本地分支、detached HEAD 和临时改动都不能影响定时日报。用户确认需要长期生效的反馈默认为 P1，必须写入 `config/feedback-ledger.json`，并绑定真实存在的 scope 文件、`npm run validate` 覆盖的验证命令和真实测试断言或运行时质量门，否则只算本会话建议。不要执行 `git reset --hard`、`git push --force`、自动 `stash` 或覆盖用户改动。定时日报任务不要修改或提交 `progress.md`、`session-handoff.md`、`tasks/current-task.md`；这些只留给人工会话或明确项目迭代任务。

目标：按今天的 Asia/Shanghai 日期生成中文 AI 日报。主产物是由 `.codex/skills/effective-interact` 以 `pre-rendered` 模式生成的自包含静态 HTML 和结构化 JSON；验证通过后只发布 `docs/` 与 `reports-data/`，由 GitHub Actions Pages workflow 部署到 GitHub Pages。

执行准则：先阅读并遵守唯一权威资产 `prompts/ai-daily/modules/editorial-authority.md`，再按 `docs/codex-automation-setup.md` 与 `tasks/daily-publish-runbook.md` 执行。始终从 launcher worktree 调用 `npm run daily:run -- --date YYYY-MM-DD --publish`；runner 负责 clean checkout、阶段顺序、contract、状态、校验、`sources:phase5-audit`、`publish:dry-run:daily`、真实 publish 或 GitHub API 兜底。定时任务不要展开旧手工流水线，不要使用 `publish:prepare-worktree`，不要提交、stash、切换或清理 launcher worktree。若无法确认远端 `main` 最新基线或存在 `remote_ahead`，真实发布必须停止。

必须运行并记录：`npm run daily:run -- --date YYYY-MM-DD --publish` 和 `.tmp/run-summary-YYYY-MM-DD.json`。读取 summary 中的 `final_status`、`stages` 和 `next_action`；当 `next_action.kind` 为 `codex_ai_repair_contract` 时，由 Codex 根据 `ai_review_tasks`、候选池、`source_audit`、`original_text` 和原始链接写入 runner 指定的 contract 路径，contract 必须包含 `schema_version`、`report_date`、`status:"ready"` 和非空 `edits`，且只修改 public text 字段，然后用同一 runner 命令继续。如果 runner 已创建 `status:"template"` attempt 文件，只在该新文件里补齐必要 edits 并改为 `ready`，不要覆盖上一轮 contract。publish 模式最多 5 次 `review -> AI repair contract -> repair -> review`；如果同日状态需要丢弃，显式使用 `--restart`。涉及页面元素时必须确认 runner 的 page-check/validate 结果；如果浏览器环境阻塞，必须报告阻塞原因。

日报公开页面必须遵守固定展示合同：顶部日期区显示本期覆盖时间范围；主体信息只用 icon/link 表示来源，不显示来源名称；主体标题不加下划线；正文 `==...==` 关键词渲染为加粗变色文字而不是 tag；tag 只用于重要级别、趋势、star 变化、主题和项目 highlight，并且必须按类型区分颜色且去重；`model_releases` 只保留结构化 JSON 索引，不渲染公开“模型发布”板块，相关新闻合入 `main_items`；`projects` 只作为 GitHub Trending 的 `项目 highlight` 元数据，不渲染公开“今日值得关注的项目”板块、“项目 highlights”子标题或额外项目列表；国内/中文动态并入现有主体分组、热门博客、GitHub Trending 或共享“社区线索”，不渲染独立“国内动态”导航项；热门博客摘要为约 100-160 个中文字符的 2-4 个分点，原文有信息密度高的证据图时通过 `evidence_assets` 贴图；正文证据图和热门博客卡片图片必须可点开放大，来源 icon 不参与放大；GitHub Trending 默认展示 Top 10，star 变化必须做成 tag，项目 highlight 只能作为匹配 Top 10 条目的 tag，并把领域和作用压进行内说明。

固定信源面的目标是证明“已检查并写入最终 `source_audit`”。公开源在当前环境返回 403/5xx 或抓取失败时，必须保留 `status:"blocked"`、HTTP/error notes 和原始 URL；这可作为 source-surface proof，但不得把 blocked 来源的未核验事实写入正文。

发布质量分两级处理：`blocking_issues` 必须阻断发布，包括 validate 失败、`self_check.automation_revision.git_commit` 未证明来自当前 `origin/main` / `origin_main_sha`、schema 或候选池回指失败、最近 7 天重复旧闻、正文事实缺少一手/可信来源、无法确认远端 `main` 基线、`remote_ahead`、非发布产物会被提交、GitHub API 兜底无法读取 `base_commit_sha` 或 token 权限不足、Pages HTTP 200 验证失败。`degraded_sections` 允许发布但必须公开标注，包括固定信源面部分不可用、GitHub Trending / Builder X / evidence asset 覆盖不足、某个板块为空、模型发布未同步进入主体条目、截图验收受阻但静态校验通过。降级信息必须写入 `quality_status.degraded_sections`，并在公开 HTML 的“发布质量说明”和最终回复中列出。

真实发布由 runner 在 `--publish` 模式内执行。runner 内部的 `publish:dry-run:daily` 必须证明 `current_dirty_files` 中所有发布器管理文件都出现在 `will_stage_files`；如果出现 `publisher_dirty_outside_publish_plan`，runner 必须停止并报告 blocker。特别确认 `docs/trends.json`、`docs/feed.json`、`docs/index.html`、当日 `docs/data/**`、`docs/reports/**`、`reports-data/**`、日报引用的 `docs/assets/evidence/**` 图片和 Builder 头像 `docs/assets/avatars/**` 都进入本次 stage 计划。如果 clean checkout 已通过验证和 dry-run，但本机 Git 元数据或 Git 传输失败阻塞发布且不存在 `remote_ahead`，runner 可使用 GitHub API 兜底；允许使用 `GH_TOKEN`、`GITHUB_TOKEN` 或 `gh auth token`。API 兜底必须通过 GitHub API 读取远端 `main` 的当前 commit/tree，使用 `force:false`，只写 `docs/` 与 `reports-data/`，并在输出中记录 `publish_mode: github-api-fallback` 和 `base_commit_sha`。

发布后必须验证当日 Pages URL 返回 HTTP 200 且包含 `YYYY-MM-DD`。如果同一会话随后要做项目迭代，必须新建 `codex/...` 分支或独立工作树；发布工作树只用于日报发布，不继续写项目改动。

最终回复必须包含：`.tmp/run-summary-YYYY-MM-DD.json`、HTML 路径、结构化 JSON 路径、`validate` 结果、`publish:dry-run:daily` 结果、真实发布或 API 兜底结果、Pages HTTP 验证、`blocking_issues` / `degraded_sections` 摘要、今日采样与规则差距、最多 3 条提示词或规则迭代建议。
```

## 当前发布边界

当前仓库已具备本地生成、effective-interact HTML 渲染、验证、调度 dry-run `publish:dry-run:daily`、显式确认后的安全本机 Git `publish`、不依赖本机 `.git` 写入权限的 GitHub API 兜底发布能力，以及 push 后由 GitHub Actions 发布 `docs/` artifact 到 GitHub Pages 的 workflow。旧命令 `publish:dry-run -- --date YYYY-MM-DD` 只保留给人工诊断。远端 Pages 设置必须使用 `GitHub Actions` source；如果仍是 `main /docs` legacy source，先不要切换到“只依赖 workflow”的发布假设。

## 定时任务网络设置提醒

定时任务如果在 `source_audit` 中出现多个固定信源组几乎全部 `status:"blocked"`，并且 notes 集中为 `fetch failed`、`retry_failed_after_1`、DNS、timeout 或 network error，应优先判断为 Codex 定时任务运行环境网络不可用，而不是信源同时失效。

请检查 `$CODEX_HOME/config.toml`、当前项目 `.codex/config.toml` 或 Codex 自动化设置。当沙盒模式为 `workspace-write` 时，需要允许网络访问：

```toml
sandbox_mode = "workspace-write"

[sandbox_workspace_write]
network_access = true
```

在 Codex UI 中对应的提醒文案是：设置“当沙盒设置为工作区写入时允许网络访问”。日报质量门会把这类情况写入 `quality_status.degraded_sections` 的 `source_discovery_network_unavailable`，并在公开 HTML 的发布质量说明中展示。

如果全部活跃固定信源都因网络错误阻塞，并且没有任何事实可以被一手或可信来源核验，结构化草稿应显式使用 `report_status:"empty_due_to_network_outage"` 与 `main_items: []`。这只能作为降级日报发布，必须保留最终 `source_audit` 的 blocked 证据，并在 `quality_status.degraded_sections` 中公开标注 `empty_due_to_network_outage`；不要为了通过 schema 添加占位主体条目。

保存发现命令输出时优先使用脚本级 `--output` 参数，例如：

```powershell
node src/cli.js discover:content-sources --date YYYY-MM-DD --limit 60 --per-source-limit 3 --output .tmp/content-sources-YYYY-MM-DD.json
```

不要依赖 `Tee-Object` 保存 JSON；PowerShell 编码、BOM 或 npm 横幅可能污染 stdout。搜索影子运行应使用 `--provider-timeout-ms`，即使某个 provider 失败，也要保留其他 provider 的候选、耗时和错误计数。

runner 内部会准备 clean checkout；下面的命令只保留给人工诊断 clean checkout 准备问题：

```powershell
npm run publish:prepare-clean-worktree
```

该命令不会生成日报，也不会 push；它会在 `.tmp/publish-worktrees/main` 准备一个独立 clean clone，确认远端 `main` 当前 SHA，并输出 `prepared.next_cwd`。如需用 `AI_DAILY_PUBLISH_WORKTREE` 或 `--worktree-dir` 指向仓库外目录，必须同时传入 `--allow-external-worktree`。定时任务不要手工切换目录；只从 launcher worktree 调用 `daily:run`，由 runner 使用 clean checkout 执行生成、验证和发布。launcher worktree 中的未提交改动、detached HEAD 或实验分支不得被提交、stash、清理或切换。

旧命令 `npm run publish:prepare-worktree` 会保存并切换当前工作树，只保留给人工恢复场景；定时任务不要使用它。

底层只读预检命令仍保留给人工诊断：

```powershell
npm run publish:preflight
```

真实发布命令：

```powershell
npm run publish -- confirm-push YYYY-MM-DD
```

该命令只允许提交 `docs/` 与 `reports-data/` 下的发布产物；如果存在 `src/`、`prompts/`、`schemas/` 等非发布器管理改动，会停止并返回 `dirty_worktree`。

push 成功后，`.github/workflows/deploy-pages.yml` 会在 `main` 上自动执行 GitHub Pages 发布。该 workflow 会安装依赖、运行 `npm run build`、上传 `docs/` 目录作为 Pages artifact，并使用 `actions/deploy-pages` 发布；仓库 Pages source 需要配置为 `GitHub Actions`。

本机 Git 元数据不可写时的兜底发布命令：

```powershell
npm run publish:github-api -- confirm-push YYYY-MM-DD
```

该命令需要 `GH_TOKEN`、`GITHUB_TOKEN` 或当前机器可用的 `gh auth token` 具备当前仓库 `contents:write` 权限。它只允许发布由最新 `origin/main` 发布工作树生成并通过验证的产物；执行时通过 GitHub API 读取远端 `main` 当前 commit/tree，比较 `docs/` 与 `reports-data/`，只把远端缺失或内容不同的发布文件写成一个远端提交，并用 `force:false` 更新分支。输出必须包含 `publish_mode: github-api-fallback` 与 `base_commit_sha`，本机 `.git` 不会被写入。

## 发现源与审计补充

三层信源接入的开发规范、阶段计划和验收标准见 `docs/ai-daily-source-integration-plan.md`。该计划覆盖默认 RSS / 新闻源、搜索 / 新闻工具、RSSHub/RSS-Bridge/聚合器三部分。

后续定时任务生成日报时，除了官方发布、模型、论文和工程博客，还必须固定检查：

- `github-ai-trending`：先运行 `npm run discover:github-trending -- --date YYYY-MM-DD --limit 50 --history-root reports-data`，再检查 GitHub Trending daily/weekly、Python/TypeScript/Rust/Go trending；这些榜单前列项目是每日必查路径。发现命令默认对可重试的网络失败延迟重试一次，并把 `retry_succeeded_after_1` 或 `retry_failed_after_1` 写进对应 `source_audit.sources[].notes`。命令会默认读取 `reports-data` 中近 7 天本地历史，为每个候选补充 `github_trending_history` 备注，并在有昨日排名时生成 `new` / 上升 / 下降 / 持平。需要调试其他历史目录时使用 `--history-root <path>`，需要调整窗口时使用 `--history-lookback-days <n>`。该命令在 GitHub Trending 全部抓取失败或没有解析出仓库时，会自动用 OSSInsight `List trending repos` API 兜底。浏览器可保存 HTML/JSON 时，运行 `npm run discover:github-trending -- --date YYYY-MM-DD --browser-export <path>` 复用同一解析器。日报必须把 Top 10 GitHub Trending 条目放进独立 `github_trending` 数据板块；只有经过额外核验的项目才再进入 `projects`，但公开 HTML 只能在匹配的 Top 10 条目上显示 `项目 highlight` tag 和行内用途说明，不得生成单独项目板块或 `项目 highlights` 子标题。
- `content-sources`：运行 `npm run discover:content-sources -- --date YYYY-MM-DD --limit 60 --per-source-limit 3` 默认检查 `config/sources/*.json` 中 `enablement:"core"` 和 `enablement:"optional"` 的官方/工程/研究源、广义科技、大厂 newsroom、AIGC/图片/视频/游戏创作产品源、行业趋势源、Product Hunt、Latent.Space、Interconnects、Planet AI，以及用户固定要求的中文 AI 媒体线索 `Jiqizhixin`、`QbitAI`、`36Kr`、`InfoQ CN`。这些中文源只作为中介线索，入选事实栏目前仍必须回到一手来源。其他公众号、自媒体和临时来源保留为 `manual` 或 `--sources <json>`，需要显式加 `--enablement core,optional,manual` 或人工录入。Product Hunt 项目候选会自动打开产品页，并优先用 GitHub、docs、README 或官网确认用途；确认成功时候选 `url` 指向确认页，`notes` 保留原始 Product Hunt URL 与确认链接，确认失败时不得把 Product Hunt 条目直接写入项目区。arXiv 和 Reddit 等易限流源成功抓取后会写入 `.tmp/source-cache`，后续 429/5xx/timeout 时可使用未过期缓存并在 `source_audit` notes 记录 `cache_fallback_used` 与原始错误。
- `wechat article input`：稳定可发布的公众号入口是日期级文章链接输入文件，默认读取私有自动化输入目录下的 `wechat/YYYY-MM-DD.json`，也可用 `npm run discover:content-sources -- --date YYYY-MM-DD --wechat-input <json>` 显式指定。文件可为数组或 `{ "articles": [...] }`，每条必须含 `url`、`account_name`、`published_at`、`title`、`summary`、`risk_level` 和 `verification_notes`；可选 `primary_urls`、`allowed_sections`、`reader_relevance`、`source_level`。发现器只接受 `https://mp.weixin.qq.com` 原文链接，清理跟踪参数，把本地输入路径从 `source_audit` 中隐藏，并在候选 notes 中写入 `input_path_redacted=true` 与 `primary_verification_required=true`。输入正文、备注和 URL 中如出现本机路径、私有自动化根目录或本地自动化目录等信息会直接拒绝。
- `wechat RSS / aggregator`：公众号自动抓取只能使用用户显式配置的自托管/私有 feed。`config/sources/wechat-whitelist.json` 预置 `RSSHub NewRank WeChat Route` 与 `Wechat2RSS Private Feed` 模板；分别通过 `AI_DAILY_RSSHUB_BASE_URL` + `NEWRANK_COOKIE` 或 `AI_DAILY_WECHAT2RSS_FEED_URL` 启用。未配置时记录 `skipped_missing_base_url` 或 `skipped_missing_token`，不是发布阻塞；抓到的内容仍是 T3/白名单线索，高风险事实必须回到一手或多源验证。
- `search-news`：运行 `npm run discover:search-news -- --date YYYY-MM-DD --providers gdelt,openalex,arxiv --queries config/search-queries.json --limit 40 --shadow` 做新闻/搜索补漏和回源。Brave、Tavily、Exa、SerPAPI、Semantic Scholar 只在对应环境变量存在时启用；缺 key 记录 `skipped_missing_token`，不阻断日报。搜索结果默认只进候选池和 `source_audit.search_sources`，不得自动进入正文。
- `sources-health`：运行 `npm run sources:health -- --date YYYY-MM-DD --sources config/sources --enablement core,optional,manual` 检查 feed 形态、HTTP 状态、近 48 小时条目数和原始 URL 要求。RSSHub/RSS-Bridge/聚合器没有自托管 base URL 时记录 `skipped_missing_base_url`，`manual` 来源记录 `skipped_manual_source`，不视为日报失败。
- `privacy validate`：`npm run validate` 会运行 `npm run privacy:validate`，扫描公开 `docs/` 与 `reports-data/` 中的 HTML/JSON/TXT/XML，阻断本机路径、本地 file URL、私有自动化根目录或自动化输入目录泄露。输入文件、私有 RSS URL、cookie、token 和本机绝对路径不得写进公开 JSON/HTML。
- `sources-audit-merge`：运行 `npm run sources:audit-merge -- --date YYYY-MM-DD --input .tmp/search-news-YYYY-MM-DD.json,.tmp/sources-health-YYYY-MM-DD.json`，把独立发现命令输出中的 `source_audit` 固定组合并进最终日报 JSON，并在写回前校验 report schema；该命令不改正文、不改候选池。
- `sources-phase5-audit`：运行 `npm run sources:phase5-audit -- --date YYYY-MM-DD --history-dir reports-data --days 3`，读取最近 3 个日报日的 `source_audit` 和候选池，统计 `sources_checked`、`candidates_found`、`primary_verified`、`intermediary_only`、T3/中介候选误入事实栏目等指标。它是连续运行验收证据，不替代当天 `validate`。
- `intermediary/self-media`：微信公众号、华尔街见闻、自媒体和中文科技媒体可以通过 `--sources <json>` 加入 `category:"intermediary"` 作为发现入口，但它们只是中介线索，不是事实报道实体。生成日报时必须先追溯文中引用的一手来源，例如公司公告、官方博客、监管文件、论文、GitHub、投资方公告或原始帖子；无法回源时只能进入 `community_leads` 并标明 `primary_verification_required=true`，不得写入 `main_items`、`model_releases` 或事实性项目结论。
- `podcast platforms`：小宇宙、喜马拉雅等平台可以作为播客发现入口，但只收录具体节目/单集页、RSS episode、原始音频或可信 transcript；平台首页不作为报道来源。访谈或播客入选前必须能确认受访者身份、发布日期和技术/工程内容。
- `X 热点`：不要默认依赖不稳定的公共 X RSS；可把自托管 RSSHub、twscrape、列表导出或其他内部工具输出通过 `--sources <json>` 加入 `category:"x_hotspot"`。该类源必须保留原始 `x.com/.../status/...` 或 `twitter.com/.../status/...` URL；没有原始帖 URL 的聚合摘要会被发现器跳过。X 热点只作为社区/Builder 线索，事实结论仍需一手来源核实。
- `follow-builders`：只把 builder/researcher/founder/maintainer 的原始帖子、个人博客、公开视频或播客片段写入 `builder_observations`；没有原始 URL、没有 `original_text` 或无法提供完整精确中文 `translation` 时不得收录。中心 feed 抓取失败时，运行 `npm run discover:builders -- --date YYYY-MM-DD --limit 20`，用固定原始 RSS/Atom 源生成可审计 Builder 候选；当候选池有至少 5 条合格 Builder 候选时，公开入选目标为 5-20 条，少于 5 条必须公开标注为 Builder 覆盖不足。
- `statuspage-incidents`：运行 `npm run discover:statuspage-incidents -- --date YYYY-MM-DD --limit 20`，把 OpenAI/Claude 等 Statuspage Atom/RSS 的近期 incident 转成候选池条目；这些条目仍需通过去重、新鲜度和 `candidate_id` 回指门禁后才能进入正文。

结构化草稿必须把 `github_trending`、`builder_sources`、`content_sources`、`search_sources`、`sources_health` 都合并进最终 `source_audit`，记录 `checked:true`、检查过的来源、候选数、入选数和未入选原因；只保留命令 stdout 不算连续运行证据。GitHub trending 条目进入 `github_trending` 时应填写 `rank`、`previous_rank`、`rank_delta`、`trend`、`event_date`、`source`、`evidence`；进入 `projects` 时还应填写 `domains`、`use_case`、`signal`，并确保它会作为 GitHub Trending highlight 呈现。如果 shell 网络受限但浏览器能保存 GitHub Trending HTML 或采样 JSON，可运行 `npm run discover:github-trending -- --browser-export <path>` 复用同一解析器。Builder 来源受阻时必须在 `source_audit.builder_sources` 填写 `blocked_reason` 与 `last_successful_feed_at`，不要只写进 notes；如果 Builder 候选存在但未入选，也必须写明过滤原因。Builder 条目进入 `builder_observations` 时必须填写 `original_text`、`translation`、`role`、`event_date`、`source`、`evidence`，并让 `content` 等于完整中文 `translation`；有 handle/头像时填写 `handle` 和 `avatar_url`，构建器会 best-effort 缓存为本地头像。合格候选足够时公开入选 5-20 条；没有合格候选时保持空数组，但必须在 `source_audit` 说明已经检查过什么。
## Codex-native runner prompt

定时任务 prompt 应保持很薄：从 launcher worktree 调用 `npm run daily:run -- --date YYYY-MM-DD`，真实发布时调用 `npm run daily:run -- --date YYYY-MM-DD --publish`。runner 固定写 `.tmp/run-summary-YYYY-MM-DD.json`，定时任务只读取 `final_status` 和 `next_action`；当 `next_action.kind` 是 `codex_ai_repair_contract` 时，由 Codex 写 runner 指定 contract 路径，设置 `status:"ready"` 且提供非空 `edits` 后用同一命令继续 runner。`status:"template"` attempt 文件只作空模板，不会被 runner 执行；需要丢弃同日未完成状态时显式加 `--restart`。调度 dry-run 只允许 `publish:dry-run:daily`，旧 `publish:dry-run -- --date YYYY-MM-DD` 只保留给人工诊断。
