## 本地发布工作流

定时任务假定已经在本仓库根目录启动，不需要切换目录。

执行顺序：

1. 生成 `.tmp/daily-report.json` 草稿。
2. 运行 `npm run report:write -- .tmp/daily-report.json reports-data YYYY-MM-DD` 写入 `reports-data/`。
3. 运行 `npm run build` 生成 `docs/` 静态站点。
4. 运行 `npm run validate`。
5. 运行 `npm run publish:dry-run` 查看将写入、将暂存、commit message 和预期 Pages URL。
6. 只有在真实发布命令已被用户授权后，才允许普通 commit/push。
7. 真实发布后必须验证当日 Pages URL 返回 HTTP 200，并确认页面内容包含当日 `report_date`；如果仍是 404 或内容不匹配，报告 `publish_error`，不要宣称发布成功。

禁止执行 `git reset --hard`、`git push --force`、自动 stash 或覆盖用户未提交改动。
