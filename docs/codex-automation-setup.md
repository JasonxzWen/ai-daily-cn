# Codex 自动化配置

当前 macOS 自动化每天 `13:05`（`Asia/Shanghai`）运行一次非发布真实链路。它运行在 Codex-owned `worktree`，只负责取得最新 `origin/main`、验证 bootstrap、调用唯一 pipeline 并读取 summary；业务阶段、恢复和发布范围仍由仓库代码负责。

这台 Mac 没有配置自动唤醒。机器在计划时间休眠时，任务可能在恢复后补跑，不能据此声称 13:05 准时完成。

## 当前唯一入口

Automation 不依赖全局 Corepack 或 Codex 临时 pnpm 路径。先用 npm 的临时执行环境提供项目锁定的 `pnpm@11.10.0`，安装当前 main 的依赖：

```bash
npm exec --yes --package=pnpm@11.10.0 -- pnpm install --frozen-lockfile
```

再用项目锁定的 Playwright 安装测试所需 Chromium；该命令可重复执行，已存在的匹配版本会直接复用：

```bash
npm exec --yes --package=pnpm@11.10.0 -- pnpm run browser:install
```

最后在同一个精确 pnpm 环境中直接调用 Node 入口：

```bash
npm exec --yes --package=pnpm@11.10.0 -- node scripts/run-daily-codex-pipeline.mjs --date YYYY-MM-DD --execute
```

真实发布仍是同一个入口加 `--publish`，但当前 Automation 不得传入该参数；启用它需要新的持续发布授权。

- `publish:dry-run:daily` 是 pipeline 内部阶段，Automation 不单独调用。
- 不直接调用发现、写入、build、publish 或旧 runner。
- 不另行调度 `status:self-check`。
- 当前只允许一个 active daily-run Automation，且 active publish Automation 数量必须为零。
- 将来启用发布时仍只允许一个 publisher；`multiple_active_daily_publish_automations` 是阻断项。

## macOS Bootstrap

每次运行都使用 Automation 自己拥有的 worktree：

1. 按 `Asia/Shanghai` 计算 `YYYY-MM-DD`。
2. 仅在当前进程内 fetch 最新 `origin/main`；SSH agent 对 Codex 不可见时，可对公开仓库临时使用 HTTPS，不写持久 Git 配置。
3. 验证 worktree 干净，并让本次执行代码与 fetch 后的 `origin/main` 相同。
4. 使用 `pnpm@11.10.0` 在 Automation-owned worktree 安装项目依赖，不执行全局安装。
5. 运行 `pnpm run browser:install`，确保完整验证使用与项目 Playwright 版本匹配的 Chromium。
6. 记录 `bootstrap mainSha`，并确认 pipeline summary 中的 clean publish root 来自该版本。
7. 只在 Automation-owned worktree 运行唯一入口，不 reset、stash、clean 或切换用户的 launcher checkout。
8. 不复用其他 checkout 或 `.tmp/daily-codex-pipeline/YYYY-MM-DD` 的旧运行目录猜测结果。

## 公共信号优先

共享发现完成后，runner 依次执行：

```text
signals_write
  -> signals_build
  -> signals_validate
  -> signals_publish_dry_run
  -> signals_publish_real
```

当前非发布模式只允许走到真实远端写入之前：

- `signals_write` 把所有安全、可公开的规范化观察持久化到 `reports-data/occurrences/YYYY/MM/YYYY-MM-DD.json.gz`。
- `signals_build` 生成 `docs/signals/index.json` 与分组分页。
- `signals_validate` 验证 schema、lineage、隐私和公开路径。
- 信源类别、内容类别、可信度、健康和访问状态仅是标签/筛选维度，不是准入条件。
- 可选 legacy 编辑报告在 signal 之后运行；其 admit、quality gate 与 `sources:phase5-audit` 不能改变 signal membership。

历史信号来自 immutable `reports-data/occurrences/baseline-v1/*.json.gz` 和 `reports-data/occurrence-baseline-manifest.json`。Automation 不得运行 `signals:migrate-baseline`，也不得扫描 legacy 候选池、报告或旧 public JSON 补数。

## Summary 合同

唯一事实源是 `.tmp/run-summary-YYYY-MM-DD.json`。按 UTF-8 读取并执行 `JSON.parse`；不要扫描运行目录猜测 sidecar：

```bash
node -e 'const fs=require("node:fs");const p=".tmp/run-summary-YYYY-MM-DD.json";const s=JSON.parse(fs.readFileSync(p,"utf8"));console.log(JSON.stringify(s,null,2))'
```

至少检查：

- `automation_pipeline_mode`、orchestration node count 和 pipeline plan path；
- `completed_stages`；
- `signals.status` 与 `legacy_report.status`；
- `source_watch.production_status`、`source_watch.connected`、`source_watch.consumed`；
- producer、occurrence store、signal index 的路径、SHA-256 与 lineage；
- `next_action`；
- `publish_requested` 必须为 false。

Source Watch 的生产 lineage 是 `discover_source_watch` → `signals_write` → `signals_build` → `signals_validate`。零条观察只要同日 store/index 与 lineage 有效，也可以 consumed。

## 合法终态

当前 dry run：

- `generated_only`
- `generated_degraded`
- `generated_signals_only`

未来获授权的 publish：

- `published`
- `published_signals_only`
- `published_pending_pages_verification`

`published_degraded` 可以出现在 `legacy_report.status`；`infrastructure_blocked_after_fallback_exhausted` 只表示允许的基础设施 fallback 已耗尽。signal-only 成功不能被 legacy 失败覆盖。

## 恢复与验证

- 始终服从 summary 的 `next_action`。
- `restart_latest_main`：放弃当前运行 worktree，从最新 main 重新 bootstrap；不复用旧产物。
- 当前非发布模式不得执行 Git push、GitHub API 发布或 Pages 验证。
- 恢复机器合同位于 `config/daily-resilience-policy.json`。

仓库验证：

```bash
node scripts/validate-daily-workflow-contract.mjs
node scripts/validate-daily-resilience-policy.mjs
```

Automation 提示词只负责 bootstrap、调用一次 pipeline、读取 summary、验证 signal/legacy 双结果与 Source Watch 证据，并按 final status、`next_action` 和 `completed_stages` 用中文报告。不要在提示词里复制第二套业务 DAG。
