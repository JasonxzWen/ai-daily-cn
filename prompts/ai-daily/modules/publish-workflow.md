## 本地发布工作流

定时任务假定已经在本仓库根目录启动，不需要切换目录。

执行顺序：

1. 运行 `npm run publish:prepare-worktree -- --message "chore: save local changes before AI daily report YYYY-MM-DD"`；如果当前分支有本地改动，先提交到当前分支；如果当前分支不是 `main`，再切回 `main` 并执行发布预检。`wrong_branch` 和非发布产物脏改动必须先用本步骤消解，不能直接拦截日报生成。
2. 如果 `publish:prepare-worktree` 返回 `publish_status.publish_error`，但命令本身 `ok: true`，继续生成、构建和验证日报；该错误只表示真实发布暂时不可用。只有提交本地改动失败、切分支失败、无法回到可写工作区等会破坏用户改动的情况，才停止。
3. 生成 `.tmp/daily-report.json` 草稿。
4. 运行 `npm run report:write -- .tmp/daily-report.json reports-data YYYY-MM-DD` 写入 `reports-data/`。
5. 运行 `npm run build` 生成 `docs/` 静态站点。
6. 运行 `npm run validate`。
7. 运行 `npm run publish:dry-run` 查看将写入、将暂存、commit message 和预期 Pages URL；如果 dry-run 失败，保留已生成日报并报告 `publish_error`，不要丢弃产物。
8. 只有在真实发布命令已被用户授权且发布环境可用后，才允许普通 commit/push。
9. 真实发布后必须验证当日 Pages URL 返回 HTTP 200，并确认页面内容包含当日 `report_date`；如果仍是 404 或内容不匹配，报告 `publish_error`，不要宣称发布成功。

禁止执行 `git reset --hard`、`git push --force`、自动 stash 或覆盖用户未提交改动。
