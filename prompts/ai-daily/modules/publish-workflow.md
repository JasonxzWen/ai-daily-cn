## 本地发布工作流

定时任务假定已经在本仓库根目录启动，不需要切换目录。

> Git 传输兜底：如果 `publish:prepare-worktree`、`publish:preflight`、`publish:dry-run` 或真实 `publish` 返回 `git_fetch_unavailable` / `git_push_unavailable`，并且当日日报 HTML/JSON 已生成且通过 `npm run validate`，没有 `remote_ahead`，则改用 `npm run publish:github-api -- confirm-push YYYY-MM-DD` 发布 `docs/` 与 `reports-data/` 产物。不要用 API 兜底绕过远端领先、非发布器文件脏改动或校验失败。

> 严格覆盖发布门：从 `2026-06-02` 起，`publish:dry-run`、真实 `publish` 和 GitHub API 兜底都会阻断缺少固定覆盖证明的日报。最终 `reports-data` JSON 必须包含有效 `self_check.automation_revision`、固定 A-F 信源面的 `source_audit`、GitHub Trending Top 10、至少 3 条 Builder 观察且包含 follow-builders X 原始 status、至少 1 个匹配正文条目的本地 `evidence_assets` 图片，并保持模型发布已合并进 `main_items`。这些不是反思建议，缺失时只能修复日报或保留未发布状态。

> 固定信源审计口径：固定 A-F 信源面的要求是“已检查并写入最终 `source_audit`”。如果公开源在当前环境返回 403/5xx，必须保留 `status:"blocked"`、HTTP/error notes 和原始 URL；这可证明 source surface 已尝试检查，但不得把 blocked 来源的未核验事实写入正文。

> 发布计划精确性：`publish:dry-run` 必须证明所有 `current_dirty_files` 中的发布器管理文件都出现在 `will_stage_files`。如果返回 `publisher_dirty_outside_publish_plan`，不要真实发布；先修复发布计划或归档与本次日期无关的悬空 `docs/` / `reports-data/` 产物。特别确认当日 `evidence_assets[*].local_path` 对应的 `docs/assets/evidence/**` 图片进入 `will_stage_files`。

执行顺序：

1. 运行 `npm run publish:prepare-worktree -- --message "chore: save local changes before AI daily report YYYY-MM-DD"`；如果当前分支有本地改动，先提交到当前分支；如果当前分支不是 `main`，再切回 `main` 并执行发布预检。`wrong_branch` 和非发布产物脏改动必须先用本步骤消解，不能直接拦截日报生成。
2. 如果 `publish:prepare-worktree` 返回 `publish_status.publish_error`，但命令本身 `ok: true`，继续生成、构建和验证日报；该错误只表示真实发布暂时不可用。只有提交本地改动失败、切分支失败、无法回到可写工作区等会破坏用户改动的情况，才停止。
3. 生成 `.tmp/daily-report.json` 草稿。
4. 运行 `npm run report:write -- .tmp/daily-report.json reports-data YYYY-MM-DD` 写入 `reports-data/`。
5. 运行 `npm run build` 生成 `docs/` 静态站点。
5a. 如果本轮在 `report:write` 之后提交并 push 了发布器、质量门、渲染器、提示词或信源配置改动，必须重新运行 `npm run report:write -- .tmp/daily-report.json reports-data YYYY-MM-DD` 和 `npm run build`，让 `self_check.automation_revision.git_commit` 等于当前 `HEAD`。
6. 运行 `npm run validate`。
7. 运行 `npm run publish:dry-run` 查看将写入、将暂存、commit message 和预期 Pages URL；如果 dry-run 失败，保留已生成日报并报告 `publish_error`，不要丢弃产物。若失败码为 `automation_revision_gate_failed`、`fixed_source_surface_gate_failed`、`github_trending_top10_gate_failed`、`builder_x_coverage_gate_failed` 或 `evidence_assets_gate_failed`，说明不是发布环境问题，而是日报缺少固定覆盖证明，必须回到发现/草稿阶段修复。
8. 真实发布优先运行 `npm run publish -- confirm-push YYYY-MM-DD`，使用本机 Git 进行普通 commit/push。
9. 如果本机 Git 发布失败原因是 `.git` 不可写、`index.lock` 无法创建、无法切回 `main`、本机 Git 元数据权限问题，或 Git 远端传输失败（`git_fetch_unavailable` / `git_push_unavailable`），改用 `npm run publish:github-api -- confirm-push YYYY-MM-DD`。该兜底通道只通过 GitHub API 写入远端 `main`，不会写本机 `.git`，允许从当前工作树发布 `docs/` 与 `reports-data/` 下的产物，并使用 `force:false` 更新远端分支；token 来自 `GH_TOKEN`、`GITHUB_TOKEN` 或可用的 `gh auth token`。`remote_ahead` 不能用 API 兜底绕过。
10. 如果 API 发布缺少 token、远端分支已并发变化或 GitHub API 返回错误，保留本地产物并报告 `publish_error`；不要重试破坏性操作。
11. 真实发布后必须验证当日 Pages URL 返回 HTTP 200，并确认页面内容包含当日 `report_date`；如果仍是 404 或内容不匹配，报告 `publish_error`，不要宣称发布成功。

禁止执行 `git reset --hard`、`git push --force`、自动 stash 或覆盖用户未提交改动。
