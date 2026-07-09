# AI 日报发布链路加固

> 状态：活跃配套文档。本文只记录发布链路的稳健性与恢复顺序；内容合同、板块口径和迭代覆盖关系以 `prompts/ai-daily/modules/editorial-authority.md` 为准，如与本文冲突，以该文件为准。

本文记录定时任务发布链路的稳健性约束，配合 `docs/codex-automation-setup.md` 使用。

## 失败模式

1. Windows 旧产物 ACL 可能导致历史 `docs/` 或 `.tmp/` 文件不可写。构建必须跳过内容未变化的文件，并避免复用固定 scratch 路径。
2. 定时任务只以最新 `origin/main` 为权威基线；本地实验分支、未合并 PR 或 detached HEAD 不能影响日报。发布前必须通过 `corepack pnpm run publish:prepare-clean-worktree` 进入专用 clean checkout，并在那里确认远端 `main` 基线与发布能力。
3. `publish` 已经创建本地提交后，如果最终 push 失败，不能把状态报告成“未更新仓库”。错误必须包含本地提交已创建、Pages 未部署、可恢复命令。
4. GitHub API 兜底不能只看 dirty worktree。工作树干净但本地产物已生成或已提交时，也要能按计划文件比对远端 tree 并发布 `docs/` 与 `reports-data/`。

## 推荐恢复顺序

1. `corepack pnpm run publish:prepare-clean-worktree`
   先准备专用 clean checkout，读取 `prepared.next_cwd`，后续生成、验证和发布都在该目录执行。
2. `corepack pnpm run publish:preflight`
   在 clean checkout 内检查分支、远端领先、`.git` 写权限和 push dry-run。
3. `corepack pnpm run publish:resume-push -- confirm-push YYYY-MM-DD`
   当本地 `main` 已领先远端且工作树干净时，优先续推已有提交，并验证 Pages。
4. `corepack pnpm run publish:github-api -- --confirm-push --date YYYY-MM-DD`
   GitHub API 兜底适用于本机 Git 元数据不可写，或 Git fetch/push 传输返回 `git_fetch_unavailable` / `git_push_unavailable` 的情况；该路径只发布由最新 `origin/main` 发布工作树生成并验证通过的 `docs/` 与 `reports-data/` 文件，使用 `force:false`，不得绕过 `remote_ahead`。
   当本机 Git 元数据或 push 通道不可用，但 `GH_TOKEN`、`GITHUB_TOKEN` 或 `gh auth token` 可用时，用 API 读取远端 `main` 当前 commit/tree 并写入远端提交。输出必须包含 `publish_mode: github-api-fallback` 和 `base_commit_sha`。
5. 仍失败时只报告 `publish_error`、失败原因和修复建议，不在 launcher worktree 执行 `reset --hard`、`push --force`、自动 `stash` 或覆盖用户改动。

## 验收要求

质量门禁分为两级：`blocking_issues` 必须阻断发布；固定信源面、GitHub Trending、Builder X、evidence asset、空板块或模型发布镜像不足属于 `degraded_sections`，允许发布但必须在 JSON 与公开 HTML 中标注。

发布链路变更完成后至少运行：

```powershell
corepack pnpm run test
corepack pnpm run validate
corepack pnpm run publish:dry-run:daily -- --date YYYY-MM-DD
corepack pnpm run publish:preflight
```

旧命令 `corepack pnpm run publish:dry-run -- --date YYYY-MM-DD` 只保留给人工诊断，不再作为调度或日常 dry-run 入口。

如果本地存在已提交但未推送的日报提交，还要运行：

```powershell
corepack pnpm run publish:resume-push -- --confirm-push --date YYYY-MM-DD
```

最后必须确认当日 Pages URL 返回 HTTP 200，且页面内容包含 `YYYY-MM-DD`。
