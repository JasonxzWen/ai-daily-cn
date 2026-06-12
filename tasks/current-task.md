# Current Task

## Task Class

non-trivial

## Spec

修复 GitHub Pages 裸地址 `https://jasonxzwen.github.io/ai-daily-cn/` 上新版首页样式可能不生效的问题。页面 URL 必须保持稳定，不要求用户打开带随机参数或 worktree 本地 `file://` URL。

根因假设：`docs/index.html` 已发布新版 HTML，但首页仍引用未版本化的 `assets/style.css`，浏览器或 GitHub Pages 边缘缓存可能继续复用旧 CSS，导致用户在裸地址看到旧视觉。

本轮只做首页 CSS 资源缓存失效控制：

- `buildSite` 根据 `defaultStyleCss` 内容生成短 SHA-256 hash。
- `renderIndexHtml` 支持可选 `styleVersion`，生成 `assets/style.css?v=<hash>`。
- `docs/index.html` 由 `npm run build` 生成，不手写日报页面或单日报告 HTML。
- 保持 GitHub Pages 访问地址不变，缓存失效只发生在内部 CSS 资源 URL。

## Acceptance Criteria

- `docs/index.html` 的 stylesheet href 为 `assets/style.css?v=<12位hex>`。
- `renderIndexHtml` 在未传 `styleVersion` 时仍保持兼容，输出 `assets/style.css`。
- `buildSite` 每次基于 stylesheet 内容生成稳定版本号，不依赖日期、随机数或本地路径。
- `npm run build` 后产物稳定；重复 validate 不应产生额外 docs diff。
- 推送到 `main` 后，裸 GitHub Pages URL 返回带版本号的 stylesheet href。

## Feedback Ledger Review

Feedback-ledger review summary: reviewed the repository feedback ledger and applied the relevant origin-main, public-page, and self-check regression rules for this hotfix.

已在实现前复核：

- `config/feedback-ledger.json`
- `docs/feedback-buglist-quick-reference.md`

适用的长期问题：

- `feedback/p1-origin-main-baseline`：本次 hotfix 从最新 `origin/main` 创建分支，避免基于旧 main 发布。
- `feedback/p1-feedback-memory-self-check`：本次仓库修改更新当前任务规格，并在交付前记录具体验证。
- `feedback/p1-public-internal-report-separation`：本次只修改首页资源引用，不把内部审核或候选池内容暴露到公开页面。
- `feedback/p1-public-data-minimization`：本次不修改 `docs/data/**`，不新增公开数据字段。

## Red Test

线上裸 URL 的 HTML 已能返回新版结构，但 stylesheet href 仍为未版本化的 `assets/style.css`，这是用户反馈“裸 GitHub Pages 地址没有更新”的可复现失败面。新增的单元断言会在修复前失败，因为 `buildSite` 生成的 `index.html` 不包含 `assets/style.css?v=<hash>`。

目标测试：

```powershell
node --test tests/unit.test.js --test-name-pattern "buildSite"
```

## Deterministic Substitute

外部浏览器缓存命中不可稳定地在 CI 中强制复现，因此用确定性产物断言替代：`buildSite` 必须生成内容 hash 版 CSS href。线上验收再用裸 URL HTTP 响应验证该 href 已发布。

## Allowed Paths

- `src/site.js`
- `src/render.js`
- `tests/unit.test.js`
- `docs/index.html`
- `tasks/current-task.md`
- `progress.md`
- `session-handoff.md`

## Forbidden Paths

- `docs/reports/**`
- `docs/data/**`
- `reports-data/**`
- `.github/workflows/**`
- GitHub Pages settings
- `.playwright-cli/**`
- 手工编辑单日报告 HTML
- `git reset --hard`
- `git clean`

## Validation Commands

已通过：

```powershell
node --test tests/unit.test.js --test-name-pattern "buildSite"
node --check src/site.js
node --check src/render.js
npm run build
npm run validate
```

发布后还需验证：

```powershell
Invoke-WebRequest -UseBasicParsing -Uri "https://jasonxzwen.github.io/ai-daily-cn/" -Headers @{ "Cache-Control" = "no-cache" }
```

## Parallel Writes

无并行写入。文件修改串行完成；只读 diff、status 和认证检查可并行。

## Regression Self-Check

Regression self-check validate summary: checked that this hotfix only changes the index stylesheet cache key, keeps public report/data content unchanged, and passes the repository validate gate.

- 已确认当前分支基于 `origin/main` 的 #81 合并提交。
- 已确认 `docs/index.html` 只改 stylesheet href，没有改变页面正文数据。
- 已确认未修改 `docs/data/**`、`docs/reports/**`、`reports-data/**` 或 GitHub Pages 设置。
- 已确认 `.playwright-cli/` 是未跟踪目录，不纳入 stage。
- 已确认 `npm run validate` 通过。

## Handoff Requirements

- 汇报根因：裸 URL 页面内部 CSS 未版本化，导致缓存可能遮蔽新版样式。
- 汇报修复：CSS href 改为内容 hash query，页面 URL 不变。
- 汇报本地验证和线上裸 URL 验证结果。
- 若 push 或 Pages 部署失败，明确报告失败 run、错误和下一步恢复动作。
