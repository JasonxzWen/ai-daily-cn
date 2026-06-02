# Codex 自动化创建参数

## 推荐参数

| 字段 | 值 |
|---|---|
| Name | `AI 日报生成、push 与 GitHub Pages 发布` |
| Kind | `cron` |
| Execution environment | `local` |
| CWD | 当前项目目录；如界面要求显式路径，使用 `D:\ai-daily-cn` |
| Schedule | 每日 02:30 |
| RRULE | `FREQ=DAILY;BYHOUR=2;BYMINUTE=30;BYSECOND=0` |
| Timezone | `Asia/Shanghai` |
| Model | 默认 Codex 模型即可；需要更稳时用高推理模型 |
| Reasoning effort | `high` |
| Status | `ACTIVE` |

## 自动化提示词

```text
始终用中文回复。

你在 ai-daily-cn 项目根目录内运行；不要切换到其他固定路径。不要修改 C:\Users\Admin\.codex\automations\ai-2\automation.toml，除非用户明确确认。不要执行 git reset --hard、git push --force、自动 stash 或覆盖用户未提交改动。

目标：按今天的 Asia/Shanghai 日期生成中文 AI 日报，最终发布主产物是由 `.codex/skills/effective-interact` 生成的高度可读、自包含、适合人类浏览的静态 HTML；验证通过后自动提交并 push 到 `main`，由 GitHub Actions Pages workflow 发布到 GitHub Pages。Markdown 不是每日主产物。

执行流程：

1. 计算今天的 `YYYY-MM-DD` 日期。
2. 运行 `npm run publish:prepare-worktree -- --message "chore: save local changes before AI daily report YYYY-MM-DD"`；如果当前分支存在本地改动，先在当前分支提交这些改动；如果当前分支不是 `main`，再切回 `main`。不要使用 `stash`、`reset --hard`、`push --force` 或覆盖用户改动。`wrong_branch` 和非发布产物脏改动不再作为日报生成前的拦截理由，必须先用本步骤归档并回到发布分支。
3. `publish:prepare-worktree` 会在切回 `main` 后执行发布预检；如果远端领先、`.git` 不可写，或 Git 远端传输失败（`git_fetch_unavailable` / `git_push_unavailable`），它会返回 `publish_status.publish_error` 和 `prepared.publish_ready:false`，但不要因此停止日报生成。只有提交本地改动失败、切分支失败或无法保护用户改动时，才停止。
4. 运行 `npm run prompt:build -- YYYY-MM-DD`，把输出作为本次日报生成与发布的完整工作契约。
4a. 运行 `npm run sources:validate`，确认 `config/sources/*.json` 的 `source_kind`、`candidate_category`、`tier`、`authority`、`enablement` 和 `verification_policy` 都有效；失败时先修配置，不要继续用硬编码源绕过。
5. 按 repo 内提示词模块采样最近 AI 产品、模型、论文、开源项目、工程工具动态和高质量工程博客；优先一手来源。高信号真实模型发布必须先写入 `main_items`，并可同步写入 `model_releases` 作为结构化索引；GitHub Trending 单独写入 `github_trending`，热门技术博客写入 `hot_blogs`。主体信息不足时先拓展信源覆盖，再从 24h 扩展到 48h；48h 仍不足时，才允许补入最近 5 天内与工程工作流直接相关的开源 release 或官方研究/产品更新，并在 `source_window` 和 self_check notes 里记录，不要把日报长期滚成周报。
5a. 所有资讯收集都必须和前几天信息比较并去重：读取 `reports-data` 中最近至少 7 个日报日的日报 JSON 和 `.candidates.json`，对每个候选按 URL、同一事件、标题、厂商、来源主题和发布时间做历史比较。重复项保留在候选池中并标记 `status:"excluded"`、`exclusion_reason` 与历史日期/URL；只有出现新的 dated release、版本、政策、价格、可用范围、基准或工程结论时，才允许同一来源/事件再次入选，并在 notes/evidence 中说明新增变化。
6. 先写入 `.tmp/source-candidates-YYYY-MM-DD.json` 候选池；所有来源成功、失败、无近期内容都要留痕。允许板块为空，但正文不得绕过候选池。
7. 写入 `.tmp/daily-report.json` 前执行去重和新鲜度检查：最近 7 天出现过的 URL 默认不能再进 `main_items`；同一 URL 不得同时进入 `main_items` 与 `hot_blogs` 重复包装；真实模型发布可以用同一 URL 同时出现在 `main_items` 和 `model_releases`，其中 `main_items` 承载新闻正文，`model_releases` 只作结构化索引；48 小时外内容不得进入摘要或主体信息，只能作为补充/背景且每天最多 1 条。严格筛完只有 2-3 条也正常发布。
8. 写入 `.tmp/daily-report.json` 前执行去套话检查：删掉“高信号”“核心信号”“可观察信号”“更多信号”“其他信号”“预期收益”等泛化或工作汇报式措辞；摘要只写用户需要快速判断的事实、日期、来源和变化。
9. 同一厂商同日或同一 48h 窗口内的多条小更新默认合并成一条厂商动态；官方 docs 没有 dated changelog、release note、RSS、commit 或官方 dated post 交叉确认时，不写入主体信息，只作为社区线索并标记待验证。
10. 生成结构化日报草稿 `.tmp/daily-report.json`。必须包含 `title`、`summary`、`main_items`、来源链接、`github_trending`、`model_releases`、`hot_blogs`、`self_check`；没有 GitHub Trending、模型发布、热门技术博客、项目、Builder 观察或社区线索时使用空数组。`main_items`、`github_trending`、`model_releases`、`hot_blogs`、`projects`、`builder_observations` 的每个入选条目必须填写候选池中的 `candidate_id`。
10a. 如原文包含能支撑已入选条目判断的官方图表或表格，才填写 `evidence_assets`；不要拉装饰图、logo、人物照、封面图或低信息量 hero 图。每个 `evidence_assets[*].source_url` 必须等于对应 `main_items`、`model_releases`、`hot_blogs` 或 `projects` 条目的 `url`，`title` 必须是短中文图名，`local_path` 必须指向可发布的 repo 内相对路径。模型发布和热门技术博客可以各优先保留 1-2 张最重要的原文关键图；模型发布双图由渲染器同排展示。公开页只会把图片放在匹配条目或对应板块下方，居中显示图片和中文图名，不生成独立“证据图表”板块；`caption` 和 `data` 只作 JSON 审计，只有没有图片时才允许用 `data` 退化为表格。
11. 运行 `npm run report:write -- .tmp/daily-report.json reports-data YYYY-MM-DD`；该命令会同时写入 `reports-data/YYYY/MM/YYYY-MM-DD.candidates.json`。如果返回 `candidate_pool_missing`、`candidate_pool_reference_invalid` 或 `freshness_gate_failed`，修正候选池、条目回指或重复/旧内容，不要绕过门禁。
11a. 如果 `discover:search-news`、`sources:health` 等发现命令的审计结果是独立 JSON，运行 `npm run sources:audit-merge -- --date YYYY-MM-DD --input .tmp/search-news-YYYY-MM-DD.json,.tmp/sources-health-YYYY-MM-DD.json`，把 `search_sources`、`sources_health` 等固定审计组合并进最终 `reports-data` 日报；只保留命令 stdout 不算连续运行证据。
12. 运行 `npm run build`，生成 `docs/reports/YYYY/MM/YYYY-MM-DD.html`、`docs/data/YYYY/MM/YYYY-MM-DD.json`、`docs/data/YYYY/MM/YYYY-MM-DD.candidates.json`、`docs/feed.json` 和 `docs/index.html`。日报 HTML 必须由 `.codex/skills/effective-interact/scripts/create-interaction.mjs` 以 `pre-rendered` 模式生成，并展示 `self_check.optimization_suggestions` 中的提示词/规则迭代建议；没有建议时明确显示本轮无新增建议。
12a. build 后检查当日 HTML：不得出现独立 `证据图表` section 或可视 `证据图表：` 前缀；每张证据图必须位于匹配条目所在 section 下方，图片居中且下方中文图名可见。
13. 运行 `npm run validate`。
13a. 运行 `npm run sources:phase5-audit -- --date YYYY-MM-DD --history-dir reports-data --days 3`，把结果作为连续运行验收证据；`phase5_complete:false` 不阻塞当天日报发布，但必须在自检/汇报中说明缺失的是天数、审计组还是 T3 事实栏目泄漏。
14. 运行 `npm run publish:dry-run`，输出将写入文件、将暂存文件、commit message 和预期 GitHub Pages URL；如果 dry-run 失败，保留已生成日报并报告 `publish_error`，不要丢弃产物。
15. 真实发布优先运行 `npm run publish -- confirm-push YYYY-MM-DD`。该命令只允许提交 `docs/` 与 `reports-data/` 发布产物，并执行普通 push；push 到 `main` 后，仓库内 `.github/workflows/deploy-pages.yml` 会运行 `npm run build`，上传 `docs/` artifact，并通过 GitHub Actions 发布 GitHub Pages。发布后必须验证当日 Pages URL 返回 HTTP 200 且页面内容包含当日 `YYYY-MM-DD`。
16. 如果真实发布失败原因是 `.git` 不可写、无法创建 `index.lock`、无法切回 `main`、本机 Git 元数据权限问题，或 Git 远端传输失败（`git_fetch_unavailable` / `git_push_unavailable`），运行 `npm run publish:github-api -- confirm-push YYYY-MM-DD` 作为兜底发布。该命令不写本机 `.git`，允许从当前工作树把发布器管理的 `docs/` 与 `reports-data/` 产物写入远端 `main`，并使用 `force:false`，不得用于提交非发布器管理文件，也不得绕过 `remote_ahead`。它优先使用 `GH_TOKEN` 或 `GITHUB_TOKEN`，环境变量缺失时会尝试 `gh auth token`；用于兜底的 token 必须能触发仓库 workflow。
17. 如果 validate、真实 publish 或 API 兜底发布失败，只报告 `publish_error`、失败原因和修复建议，不做破坏性恢复；如果 prepare-worktree 或 dry-run 只暴露发布环境不可用，继续保留本地日报 HTML/JSON 产物。
18. 根据今日采样、入选/降级内容、自检结果和 repo 内提示词模块，输出最多 3 条提示词或规则迭代建议。建议只给用户人工确认，不自动写回提示词模块；这些建议必须同时进入 `self_check.optimization_suggestions`，并在最终回复的“反思与自动化迭代建议”小节单独列出。

最终回复必须包含：

- 今日日报 HTML 路径。
- 结构化 JSON 路径。
- `validate` 结果。
- `publish:dry-run` 结果和预期 Pages URL。
- 真实发布后的 Pages URL HTTP 验证结果。
- 今日采样与提示词规则的差距。
- 最多 3 条需要用户确认的提示词/规则迭代建议。
```

## 当前发布边界

当前仓库已具备本地生成、effective-interact HTML 渲染、验证、`publish:dry-run`、显式确认后的安全本机 Git `publish`、不依赖本机 `.git` 写入权限的 GitHub API 兜底发布能力，以及 push 后由 GitHub Actions 发布 `docs/` artifact 到 GitHub Pages 的 workflow。远端 Pages 设置必须使用 `GitHub Actions` source；如果仍是 `main /docs` legacy source，先不要切换到“只依赖 workflow”的发布假设。

发布前工作树整理与预检命令：

```powershell
npm run publish:prepare-worktree -- --message "chore: save local changes before AI daily report YYYY-MM-DD"
```

该命令不会生成日报，也不会 push；它会先把当前分支本地改动提交到当前分支，再切回 `main` 并检查远端状态、`.git` 写权限和 Git 传输可用性。远端领先、`.git` 不可写或 Git fetch/push 传输不可用只会标记真实发布暂不可用，不再阻塞后续日报生成和验证。

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

该命令需要 `GH_TOKEN`、`GITHUB_TOKEN` 或当前机器可用的 `gh auth token` 具备当前仓库 `contents:write` 权限。它读取本地生成的发布产物，比较远端 `main` 当前 tree，只把远端缺失或内容不同的 `docs/` 与 `reports-data/` 文件写成一个远端提交，并用 `force:false` 更新分支；本机 `.git` 不会被写入，因此即使当前工作树没能切回 `main`，也可以作为发布兜底。

## 发现源与审计补充

三层信源接入的开发规范、阶段计划和验收标准见 `docs/ai-daily-source-integration-plan.md`。该计划覆盖默认 RSS / 新闻源、搜索 / 新闻工具、RSSHub/RSS-Bridge/聚合器三部分。

后续定时任务生成日报时，除了官方发布、模型、论文和工程博客，还必须固定检查：

- `github-ai-trending`：先运行 `npm run discover:github-trending -- --date YYYY-MM-DD --limit 50 --history-root reports-data`，再检查 GitHub Trending daily/weekly、Python/TypeScript/Rust/Go trending；这些榜单前列项目是每日必查路径。发现命令默认对可重试的网络失败延迟重试一次，并把 `retry_succeeded_after_1` 或 `retry_failed_after_1` 写进对应 `source_audit.sources[].notes`。命令会默认读取 `reports-data` 中近 7 天本地历史，为每个候选补充 `github_trending_history` 备注，并在有昨日排名时生成 `new` / 上升 / 下降 / 持平。需要调试其他历史目录时使用 `--history-root <path>`，需要调整窗口时使用 `--history-lookback-days <n>`。该命令在 GitHub Trending 全部抓取失败或没有解析出仓库时，会自动用 OSSInsight `List trending repos` API 兜底。浏览器可保存 HTML/JSON 时，运行 `npm run discover:github-trending -- --date YYYY-MM-DD --browser-export <path>` 复用同一解析器。日报必须把 Top 10 GitHub Trending 条目放进独立 `github_trending` 板块；只有经过额外核验的项目才再进入 `projects`。
- `content-sources`：运行 `npm run discover:content-sources -- --date YYYY-MM-DD --limit 60 --per-source-limit 3` 默认检查 `config/sources/*.json` 中 `enablement:"core"` 和 `enablement:"optional"` 的官方/工程/研究源、广义科技、大厂 newsroom、行业趋势源、Product Hunt、Latent.Space、Interconnects、Planet AI 等已注册源；中文媒体、公众号、自媒体和临时来源保留为 `manual` 或 `--sources <json>`，需要显式加 `--enablement core,optional,manual` 或人工录入。Product Hunt 项目候选会自动打开产品页，并优先用 GitHub、docs、README 或官网确认用途；确认成功时候选 `url` 指向确认页，`notes` 保留原始 Product Hunt URL 与确认链接，确认失败时不得把 Product Hunt 条目直接写入项目区。
- `search-news`：运行 `npm run discover:search-news -- --date YYYY-MM-DD --providers gdelt,openalex,arxiv --queries config/search-queries.json --limit 40 --shadow` 做新闻/搜索补漏和回源。Brave、Tavily、Exa、SerPAPI、Semantic Scholar 只在对应环境变量存在时启用；缺 key 记录 `skipped_missing_token`，不阻断日报。搜索结果默认只进候选池和 `source_audit.search_sources`，不得自动进入正文。
- `sources-health`：运行 `npm run sources:health -- --date YYYY-MM-DD --sources config/sources --enablement core,optional,manual` 检查 feed 形态、HTTP 状态、近 48 小时条目数和原始 URL 要求。RSSHub/RSS-Bridge/聚合器没有自托管 base URL 时记录 `skipped_missing_base_url`，`manual` 来源记录 `skipped_manual_source`，不视为日报失败。
- `sources-audit-merge`：运行 `npm run sources:audit-merge -- --date YYYY-MM-DD --input .tmp/search-news-YYYY-MM-DD.json,.tmp/sources-health-YYYY-MM-DD.json`，把独立发现命令输出中的 `source_audit` 固定组合并进最终日报 JSON，并在写回前校验 report schema；该命令不改正文、不改候选池。
- `sources-phase5-audit`：运行 `npm run sources:phase5-audit -- --date YYYY-MM-DD --history-dir reports-data --days 3`，读取最近 3 个日报日的 `source_audit` 和候选池，统计 `sources_checked`、`candidates_found`、`primary_verified`、`intermediary_only`、T3/中介候选误入事实栏目等指标。它是连续运行验收证据，不替代当天 `validate`。
- `intermediary/self-media`：微信公众号、华尔街见闻、自媒体和中文科技媒体可以通过 `--sources <json>` 加入 `category:"intermediary"` 作为发现入口，但它们只是中介线索，不是事实报道实体。生成日报时必须先追溯文中引用的一手来源，例如公司公告、官方博客、监管文件、论文、GitHub、投资方公告或原始帖子；无法回源时只能进入 `community_leads` 并标明 `primary_verification_required=true`，不得写入 `main_items`、`model_releases` 或事实性项目结论。
- `podcast platforms`：小宇宙、喜马拉雅等平台可以作为播客发现入口，但只收录具体节目/单集页、RSS episode、原始音频或可信 transcript；平台首页不作为报道来源。访谈或播客入选前必须能确认受访者身份、发布日期和技术/工程内容。
- `X 热点`：不要默认依赖不稳定的公共 X RSS；可把自托管 RSSHub、twscrape、列表导出或其他内部工具输出通过 `--sources <json>` 加入 `category:"x_hotspot"`。该类源必须保留原始 `x.com/.../status/...` 或 `twitter.com/.../status/...` URL；没有原始帖 URL 的聚合摘要会被发现器跳过。X 热点只作为社区/Builder 线索，事实结论仍需一手来源核实。
- `follow-builders`：只把 builder/researcher/founder/maintainer 的原始帖子、个人博客、公开视频或播客片段写入 `builder_observations`；没有原始 URL 时不得收录。中心 feed 抓取失败时，运行 `npm run discover:builders -- --date YYYY-MM-DD --limit 20`，用固定原始 RSS/Atom 源生成可审计 Builder 候选。
- `statuspage-incidents`：运行 `npm run discover:statuspage-incidents -- --date YYYY-MM-DD --limit 20`，把 OpenAI/Claude 等 Statuspage Atom/RSS 的近期 incident 转成候选池条目；这些条目仍需通过去重、新鲜度和 `candidate_id` 回指门禁后才能进入正文。

结构化草稿必须把 `github_trending`、`builder_sources`、`content_sources`、`search_sources`、`sources_health` 都合并进最终 `source_audit`，记录 `checked:true`、检查过的来源、候选数、入选数和未入选原因；只保留命令 stdout 不算连续运行证据。GitHub trending 条目进入 `github_trending` 时应填写 `rank`、`previous_rank`、`rank_delta`、`trend`、`event_date`、`source`、`evidence`；进入 `projects` 时还应填写 `domains`、`use_case`、`signal`。如果 shell 网络受限但浏览器能保存 GitHub Trending HTML 或采样 JSON，可运行 `npm run discover:github-trending -- --browser-export <path>` 复用同一解析器。Builder 来源受阻时必须在 `source_audit.builder_sources` 填写 `blocked_reason` 与 `last_successful_feed_at`，不要只写进 notes；如果 Builder 候选存在但未入选，也必须写明过滤原因。Builder 条目进入 `builder_observations` 时应填写 `role`、`event_date`、`source`、`evidence`。没有合格候选时保持空数组，但必须在 `source_audit` 说明已经检查过什么。
