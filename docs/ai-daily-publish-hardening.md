# AI 日报发布链路加固

本文记录定时任务发布链路的稳健性约束，配合 `docs/codex-automation-setup.md` 使用。

## 失败模式

1. Windows 旧产物 ACL 可能导致历史 `docs/` 或 `.tmp/` 文件不可写。构建必须跳过内容未变化的文件，并避免复用固定 scratch 路径。
2. 本地 `origin/main` tracking ref 不能证明真实 push 通道可用。发布前必须用 `git push --dry-run origin main` 检查 SSH/HTTPS 凭据和网络。
3. `publish` 已经创建本地提交后，如果最终 push 失败，不能把状态报告成“未更新仓库”。错误必须包含本地提交已创建、Pages 未部署、可恢复命令。
4. GitHub API 兜底不能只看 dirty worktree。工作树干净但本地产物已生成或已提交时，也要能按计划文件比对远端 tree 并发布 `docs/` 与 `reports-data/`。

## 推荐恢复顺序

1. `npm run publish:preflight`
   先检查分支、远端领先、`.git` 写权限和 push dry-run。
2. `npm run publish:resume-push -- confirm-push YYYY-MM-DD`
   当本地 `main` 已领先远端且工作树干净时，优先续推已有提交，并验证 Pages。
3. `npm run publish:github-api -- confirm-push YYYY-MM-DD`
   当本机 Git 元数据或 push 通道不可用，但 `GH_TOKEN`、`GITHUB_TOKEN` 或 `gh auth token` 可用时，用 API 写入远端 `main`。该路径只发布发布器管理的 `docs/` 与 `reports-data/` 文件。
4. 仍失败时只报告 `publish_error`、失败原因和修复建议，不执行 `reset --hard`、`push --force`、自动 `stash` 或覆盖用户改动。

## 验收要求

发布链路变更完成后至少运行：

```powershell
npm run test
npm run validate
npm run publish:dry-run -- YYYY-MM-DD
npm run publish:preflight
```

如果本地存在已提交但未推送的日报提交，还要运行：

```powershell
npm run publish:resume-push -- confirm-push YYYY-MM-DD
```

最后必须确认当日 Pages URL 返回 HTTP 200，且页面内容包含 `YYYY-MM-DD`。
