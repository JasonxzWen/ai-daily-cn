## 本地发布工作流

定时任务假定已经在本仓库根目录启动，不需要切换目录。发布运行只以最新 `origin/main` 为权威基线；未合并 PR、本地实验分支、detached HEAD 和临时改动不得影响当日日报。

> Git 传输兜底：如果 `publish:prepare-worktree`、`publish:preflight`、`publish:dry-run` 或真实 `publish` 返回 `git_fetch_unavailable` / `git_push_unavailable`，并且当日日报 HTML/JSON 已从最新 `origin/main` 发布工作树生成、通过 `npm run validate`，没有 `remote_ahead`，则改用 `npm run publish:github-api -- confirm-push YYYY-MM-DD` 发布 `docs/` 与 `reports-data/` 产物。不要用 API 兜底绕过远端领先、非发布器文件脏改动或校验失败。

> 发布质量门：从 `2026-06-02` 起，`publish:dry-run`、真实 `publish` 和 GitHub API 兜底按两级质量处理。`blocking_issues` 必须阻断发布，包括无效或缺失的 `self_check.automation_revision`、`git_commit` 未证明来自当前 `origin/main`、schema/候选池回指失败、重复旧闻、新事实缺少一手或可信来源、无法确认远端 `main`、`remote_ahead`、非发布器文件脏改动、API 兜底 token/base commit 失败或 Pages 验证失败。固定 A-F 信源面、GitHub Trending Top 10、Builder X、Builder 观察少于 5 条、`evidence_assets`、空板块或兼容字段镜像不足属于 `degraded_sections`：允许发布，但必须写入 `quality_status.degraded_sections`，并在公开 HTML 的“发布质量说明”和最终回复中标注。

> 固定信源审计口径：固定 A-F 信源面的要求是“已检查并写入最终 `source_audit`”。如果公开源在当前环境返回 403/5xx，必须保留 `status:"blocked"`、HTTP/error notes 和原始 URL；这可证明 source surface 已尝试检查，但不得把 blocked 来源的未核验事实写入正文。

> 发布计划精确性：`publish:dry-run` 必须证明所有 `current_dirty_files` 中的发布器管理文件都出现在 `will_stage_files`。如果返回 `publisher_dirty_outside_publish_plan`，不要真实发布；先修复发布计划或归档与本次日期无关的悬空 `docs/` / `reports-data/` 产物。特别确认当日 `evidence_assets[*].local_path` 对应的 `docs/assets/evidence/**` 图片和 Builder 头像 `docs/assets/avatars/**` 进入 `will_stage_files`。

> 固定信源审计口径：固定 A-F 信源面的要求是“已检查并写入最终 `source_audit`”。如果公开源在当前环境返回 403/5xx，必须保留 `status:"blocked"`、HTTP/error notes 和原始 URL；这可证明 source surface 已尝试检查，但不得把 blocked 来源的未核验事实写入正文。

> 发布计划精确性：`publish:dry-run` 必须证明所有 `current_dirty_files` 中的发布器管理文件都出现在 `will_stage_files`。如果返回 `publisher_dirty_outside_publish_plan`，不要真实发布；先修复发布计划或归档与本次日期无关的悬空 `docs/` / `reports-data/` 产物。特别确认当日 `evidence_assets[*].local_path` 对应的 `docs/assets/evidence/**` 图片和 Builder 头像 `docs/assets/avatars/**` 进入 `will_stage_files`。

执行顺序：

1. 运行 `npm run publish:prepare-worktree -- --message "chore: save local changes before AI daily report YYYY-MM-DD"`；如果当前分支有本地改动，先提交到当前分支；如果当前分支不是 `main`，再切回 `main` 并执行发布预检。`wrong_branch` 和非发布产物脏改动必须先用本步骤消解，不能直接拦截日报生成。
2. 如果 `publish:prepare-worktree` 返回 `publish_status.publish_error`，但命令本身 `ok: true`，继续生成、构建和验证日报；该错误只表示真实发布暂时不可用。只有提交本地改动失败、切分支失败、无法回到可写工作区等会破坏用户改动的情况，才停止。
3. 运行 `npm run report:draft -- --date YYYY-MM-DD --input .tmp/github-trending-YYYY-MM-DD.json,.tmp/builders-YYYY-MM-DD.json,.tmp/content-sources-YYYY-MM-DD.json,.tmp/statuspage-incidents-YYYY-MM-DD.json,.tmp/search-news-YYYY-MM-DD.json,.tmp/sources-health-YYYY-MM-DD.json --output .tmp/daily-report.json --candidate-output .tmp/source-candidates-YYYY-MM-DD.json`，从候选池自动生成 `.tmp/daily-report.json` 草稿和 included 回写候选池；不要用临时手工脚本重写 JSON。
4. 运行 `npm run report:write -- .tmp/daily-report.json reports-data YYYY-MM-DD` 写入 `reports-data/`。
5. 运行 `npm run build` 生成 `docs/` 静态站点。
5a. 如果本轮在 `report:write` 之后提交并 push 了发布器、质量门、渲染器、提示词或信源配置改动，必须重新运行 `npm run report:write -- .tmp/daily-report.json reports-data YYYY-MM-DD` 和 `npm run build`，让 `self_check.automation_revision.git_commit` 等于当前 `HEAD`，并让 `origin_main_sha` 记录最新 `origin/main`。
6. 运行 `npm run validate`。
7. 运行 `npm run publish:dry-run` 查看将写入、将暂存、commit message 和预期 Pages URL；如果 dry-run 失败，保留已生成日报并报告 `publish_error`，不要丢弃产物。若仅存在固定信源、GitHub Trending、Builder X、evidence asset、板块为空或兼容字段镜像不足，dry-run 应通过并在 `quality_status.degraded_sections` 中暴露缺口；只有 `blocking_issues` 才停止发布。
8. 真实发布优先运行 `npm run publish -- confirm-push YYYY-MM-DD`，使用本机 Git 进行普通 commit/push。
9. 如果本机 Git 发布失败原因是 `.git` 不可写、`index.lock` 无法创建、无法切回 `main`、本机 Git 元数据权限问题，或 Git 远端传输失败（`git_fetch_unavailable` / `git_push_unavailable`），改用 `npm run publish:github-api -- confirm-push YYYY-MM-DD`。该兜底通道只通过 GitHub API 写入远端 `main`，不会写本机 `.git`，但必须先读取远端 `main` 当前 commit/tree，确认产物来自最新 `origin/main`，只写 `docs/` 与 `reports-data/` 下的产物，并使用 `force:false` 更新远端分支；token 来自 `GH_TOKEN`、`GITHUB_TOKEN` 或可用的 `gh auth token`。`remote_ahead` 不能用 API 兜底绕过，输出必须包含 `publish_mode: github-api-fallback` 和 `base_commit_sha`。
10. 如果 API 发布缺少 token、远端分支已并发变化或 GitHub API 返回错误，保留本地产物并报告 `publish_error`；不要重试破坏性操作。
11. 真实发布后必须验证当日 Pages URL 返回 HTTP 200，并确认页面内容包含当日 `report_date`；如果仍是 404 或内容不匹配，报告 `publish_error`，不要宣称发布成功。

禁止执行 `git reset --hard`、`git push --force`、自动 stash 或覆盖用户未提交改动。
