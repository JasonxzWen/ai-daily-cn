# AI 日报 GitHub Pages 发布方案

## 目标

把现有 `ai-2` 每日 AI 日报自动化扩展为可发布的静态站点流程：

- 每日生成中文 AI 日报 Markdown 原文。
- 将日报标准化为结构化 JSON。
- 渲染单篇静态 HTML。
- 更新首页索引、聚合 feed 和样式资源。
- 将发布产物写入目标 GitHub 仓库。
- 在安全边界内执行 `git commit` 和 `git push`。
- 由 GitHub Pages 对外发布静态 HTML。
- 发布失败时只记录 `publish_error` 和修复建议，不执行破坏性 git 操作。

本方案只做调研和设计，不实现发布流水线，不创建 GitHub Actions，不提交、不推送、不修改远端 Pages 设置。

相关细化文档：

- [Skill Hub 前端与 HTML 汇报能力评估](skill-hub-frontend-html-capability-evaluation.md)
- [AI 日报分发、测试与提示词构建规范](ai-daily-distribution-testing-prompt-spec.md)
- [OpenSpec 风格规格](../openspec/changes/add-ai-daily-static-publishing/proposal.md)

## 当前仓库观察

当前仓库路径：`D:\ai-daily-cn`。

本地仓库状态：

- 当前工作树几乎为空，根目录只发现 `.git`。
- 未发现 `docs/`、`site/`、`pages/`、`public/` 目录。
- 未发现 `.github/workflows/`。
- 未发现 `package.json`、Vite、Jekyll、Astro、Next.js 或其他静态站点构建配置。
- 当前本地 `main` 配置跟踪 `origin/main`，但仓库还没有提交，远端也没有可见分支头。
- 远端为 `git@github.com:JasonxzWen/ai-daily-cn.git`。
- 通过 GitHub 仓库元数据只读查询确认仓库名为 `JasonxzWen/ai-daily-cn`，默认分支为 `main`，仓库可见性为 public。
- 通过 GitHub Pages API 只读查询返回 `404 Not Found`，可判断当前远端尚未启用 Pages 站点，或至少没有已创建的 Pages site 记录。

本地自动化上下文：

- 自动化 ID：`ai-2`。
- 自动化配置路径：`C:\Users\Admin\.codex\automations\ai-2\automation.toml`。
- 自动化 memory 路径：`C:\Users\Admin\.codex\automations\ai-2\memory.md`。
- `ai-2` 当前是 `ACTIVE` 的本地 cron 自动化，计划时间为每日 02:30。
- memory 已记录：日报已支持“自检与优化建议”，用户确认后可继续优化自动化 prompt。
- memory 也已记录：用户希望后续把日报自动渲染为静态 HTML，推送到指定 GitHub 仓库，并通过 GitHub Pages 发布。

基于以上观察：

- 当前仓库还不是静态站点仓库。
- 当前仓库内没有既有 Pages 构建流程可复用。
- 当前阶段最适合先采用 `docs/` 目录作为 GitHub Pages 发布源。
- 不建议一开始引入复杂前端构建链路；日报页面是内容型静态 HTML，直接生成 HTML、JSON、CSS 更容易审计和回滚。
- GitHub Actions 构建发布适合作为第二阶段方案，等出现模板编译、全文搜索、RSS/Atom、多语言或站内搜索等复杂需求时再引入。

## 推荐发布架构

推荐采用“本地自动化生成 + 仓库内静态文件 + GitHub Pages 从 `docs/` 发布”的架构。

核心角色：

- `ai-2`：每日采集、筛选、生成 AI 日报正文，并输出自检 JSON。
- 发布器：把日报 Markdown 转为结构化 JSON 和 HTML，更新首页、feed 和样式资源。
- 目标仓库：保存所有可发布静态产物和历史日报。
- GitHub Pages：从 `main` 分支的 `/docs` 目录发布站点。

推荐理由：

- 当前仓库为空，没有既有构建工具约束。
- 日报是静态内容，直接发布 HTML 足够稳定。
- `docs/` 发布源不需要额外构建动作，降低自动化失败面。
- 历史日报可直接按日期归档，URL 稳定。
- 后续如果需要更复杂构建，可平滑迁移到 GitHub Actions 发布。

官方约束参考：

- GitHub Pages 支持从指定分支的根目录或 `/docs` 目录发布。
- GitHub Pages 也支持通过 GitHub Actions 发布自定义构建产物。
- 如果使用 branch source 且由 GitHub Actions 的 `GITHUB_TOKEN` 推送提交，可能不会触发 Pages build；本方案默认 `ai-2` 是本地自动化，用用户本地 git 凭据推送，因此优先选择 `/docs` 分支源。
- 参考 GitHub 官方文档：[Configuring a publishing source for your GitHub Pages site](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)。

## 目录结构

推荐结构：

```text
docs/
  .nojekyll
  index.html
  feed.json
  assets/
    style.css
  reports/
    2026/
      05/
        2026-05-13.html
        2026-05-13.md
  data/
    2026/
      05/
        2026-05-13.json
```

说明：

- `docs/index.html`：站点首页，展示最新日报、历史日报列表、更新时间和入口链接。
- `docs/reports/YYYY/MM/YYYY-MM-DD.html`：每日可访问 HTML 页面。
- `docs/reports/YYYY/MM/YYYY-MM-DD.md`：每日 Markdown 原文，保留可审计内容来源。
- `docs/data/YYYY/MM/YYYY-MM-DD.json`：每日结构化数据。
- `docs/feed.json`：聚合索引，供首页、外部脚本或订阅客户端读取。
- `docs/assets/style.css`：全站样式。
- `docs/.nojekyll`：禁用 Jekyll 处理，避免下划线目录、Markdown 或静态资源被 GitHub Pages 默认构建规则影响。

如果后续不希望 Markdown 原文被 Pages 直接访问，可以把 Markdown 改放到仓库根目录下的 `reports-source/YYYY/MM/YYYY-MM-DD.md`，`docs/` 只保留 HTML、JSON 和 CSS。当前推荐先保留在 `docs/reports/`，便于透明审计和历史追踪。

## 自动化流程

推荐执行流程：

1. `ai-2` 每日 02:30 运行，生成 AI 日报 Markdown。
2. 从日报正文中提取：
   - 标题。
   - `report_date`。
   - 主体信息条目。
   - 今日值得关注项目。
   - Builder 观察。
   - 社区线索。
   - `## 自检与优化建议` JSON。
3. 将日报转为标准化 `report.json`。
4. 使用固定 HTML 模板渲染 `report.html`。
5. 将当日产物写入目标路径：
   - `docs/reports/YYYY/MM/YYYY-MM-DD.md`
   - `docs/reports/YYYY/MM/YYYY-MM-DD.html`
   - `docs/data/YYYY/MM/YYYY-MM-DD.json`
6. 读取既有 `docs/feed.json`，按 `report_date` 更新或插入当日记录。
7. 重新生成 `docs/index.html`，最新日报排在最前。
8. 确保 `docs/assets/style.css` 存在；如果样式契约变化，再更新样式文件。
9. 执行发布前 git 检查：
   - 确认当前分支是允许发布的分支。
   - 执行 `git status --porcelain`。
   - 如果存在非自动化生成的未提交改动，停止发布并记录 `publish_error`。
10. 仅暂存本次自动化生成或更新的文件。
11. 创建普通 commit，例如：
    - `chore: publish AI daily report 2026-05-13`
12. 执行普通 `git push`。
13. GitHub Pages 从 `main` 分支 `/docs` 自动发布。
14. 自动化运行结果写入自检字段：
    - HTML 是否生成。
    - 仓库是否更新。
    - 是否成功 push。
    - 预计或实际 Pages URL。
    - 失败错误和建议。

失败流程：

- 日报生成失败：不写入发布目录，记录内容生成错误。
- JSON 解析失败：保留 Markdown，停止 HTML 发布，记录解析错误。
- HTML 渲染失败：不 commit，不 push，记录渲染错误。
- 工作树不干净：不覆盖、不 stash、不 reset，记录 dirty worktree。
- commit 失败：不 push，记录 commit 错误。
- push 失败：保留本地 commit，不 force push，不 reset，记录 push 错误和下一步建议。
- Pages 未启用或配置不匹配：不修改远端设置，只记录配置待确认。

## HTML / JSON 数据契约

每日 Markdown 原文：

````text
# AI 日报

> 今日主体信息 N 条 ...

## 1. 标题 [event_date: YYYY-MM-DD]

- 事实要点
- 事实要点

来源：[原文](URL)

## 今日值得关注的项目

## Builder 观察

## 社区线索

## 自检与优化建议

```json
{}
```
````

每日 `report.json` 推荐契约：

```json
{
  "schema_version": 1,
  "report_date": "2026-05-13",
  "title": "AI 日报 2026-05-13",
  "summary": "今日主体信息 N 条 ...",
  "canonical_url": "https://jasonxzwen.github.io/ai-daily-cn/reports/2026/05/2026-05-13.html",
  "markdown_path": "reports/2026/05/2026-05-13.md",
  "html_path": "reports/2026/05/2026-05-13.html",
  "source_window": {
    "date_from": "2026-05-13",
    "date_to": "2026-05-13",
    "fallback_window_used": false,
    "notes": ""
  },
  "main_items": [
    {
      "title": "",
      "event_date": "2026-05-13",
      "url": "",
      "source": "",
      "tier": "T0",
      "entities": [],
      "summary": "",
      "bullets": []
    }
  ],
  "projects": [
    {
      "name": "",
      "description": "",
      "url": ""
    }
  ],
  "builder_observations": [
    {
      "author": "",
      "content": "",
      "url": ""
    }
  ],
  "community_leads": [
    {
      "content": "",
      "url": ""
    }
  ],
  "self_check": {
    "main_items": 0,
    "builder_observations": 0,
    "builder_skill_used": [],
    "fallback_sources": [],
    "primary_links": true,
    "no_banned_words": true,
    "no_unsourced_numbers": true,
    "notes": "",
    "optimization_suggestions": []
  },
  "publish_status": {
    "html_generated": true,
    "repo_updated": true,
    "repo_pushed": true,
    "pages_url": "https://jasonxzwen.github.io/ai-daily-cn/reports/2026/05/2026-05-13.html",
    "publish_error": ""
  },
  "generated_at": "2026-05-13T02:30:00+08:00"
}
```

`feed.json` 推荐契约：

```json
{
  "schema_version": 1,
  "site_title": "AI 日报",
  "site_url": "https://jasonxzwen.github.io/ai-daily-cn/",
  "updated_at": "2026-05-13T02:35:00+08:00",
  "reports": [
    {
      "report_date": "2026-05-13",
      "title": "AI 日报 2026-05-13",
      "summary": "今日主体信息 N 条 ...",
      "url": "reports/2026/05/2026-05-13.html",
      "data_url": "data/2026/05/2026-05-13.json",
      "markdown_url": "reports/2026/05/2026-05-13.md",
      "main_items": 0,
      "builder_observations": 0,
      "generated_at": "2026-05-13T02:30:00+08:00"
    }
  ]
}
```

HTML 契约：

- 所有正文内容从结构化 JSON 或 Markdown AST 渲染，不用脆弱字符串拼接。
- 外部链接保留来源 URL，并设置 `rel="noopener noreferrer"`。
- 页面必须包含：
  - 日期。
  - 主体信息数量。
  - 主体信息列表。
  - 项目列表。
  - Builder 观察。
  - 社区线索。
  - 自检摘要。
  - 原始 Markdown 和 JSON 链接。
- 页面不注入远程脚本，默认只使用本地 CSS。

## GitHub Pages 配置方案

推荐第一阶段配置：

- Pages source：`Deploy from a branch`。
- Branch：`main`。
- Folder：`/docs`。
- 发布 URL 预期为：`https://jasonxzwen.github.io/ai-daily-cn/`。

需要仓库管理员在 GitHub 网页端完成一次性设置：

1. 打开仓库 `JasonxzWen/ai-daily-cn`。
2. 进入 `Settings`。
3. 进入 `Pages`。
4. `Build and deployment` 选择 `Deploy from a branch`。
5. 分支选择 `main`，目录选择 `/docs`。
6. 保存后等待首次 Pages 部署完成。

第二阶段备选方案：

- Pages source 改为 `GitHub Actions`。
- 新增 workflow 负责构建或上传静态产物。
- 适合需要前端构建、站内搜索、全文索引、RSS 生成、多模板主题或部署前验证时使用。

当前不建议马上使用 GitHub Actions 的原因：

- 仓库为空，没有构建链路。
- 日报发布产物可以直接生成为静态文件。
- 分支 `/docs` 发布更简单，失败面更小。
- 用户要求当前只做方案，不直接实现发布流水线。

## Git 推送与失败处理

必须遵守的安全边界：

- 不自动 `force push`。
- 不自动 `git reset --hard`。
- 不自动覆盖用户未提交改动。
- 不自动删除非本次自动化生成的文件。
- push 前必须检查 `git status --porcelain`。
- push 前必须确认当前分支是允许发布的分支。
- 如果工作树已有用户改动，自动化必须停止发布，并记录 `publish_error`。
- 如果远端领先，本地不能强推；应停止并记录需要人工同步。
- 发布失败时只记录错误和建议，不做破坏性恢复。
- prompt 自动迭代必须等待用户明确确认。
- 低风险格式修复可以进入 `optimization_suggestions`，但不能直接改 prompt。

推荐错误结构：

```json
{
  "publish_status": {
    "html_generated": false,
    "repo_updated": false,
    "repo_pushed": false,
    "pages_url": "",
    "publish_error": {
      "code": "dirty_worktree",
      "message": "目标仓库存在非自动化生成的未提交改动，已停止发布。",
      "suggestion": "请先确认、提交或移走这些改动，再重新运行发布。"
    }
  }
}
```

如果需要严格匹配用户给出的字段形态，也可以把 `publish_error` 保持为字符串：

```json
{
  "publish_status": {
    "html_generated": false,
    "repo_updated": false,
    "repo_pushed": false,
    "pages_url": "",
    "publish_error": "dirty_worktree: 目标仓库存在非自动化生成的未提交改动，已停止发布。"
  }
}
```

推荐第一版使用字符串，减少解析和展示复杂度；内部日志可以保留结构化错误对象。

关于 `repo_pushed` 字段：

- 自动化最终运行摘要可以准确记录 `repo_pushed: true/false`。
- 已提交到仓库的当日 `report.json` 在 push 前生成，因此如果要求公开 JSON 也反映最终 push 结果，需要设计二阶段状态更新。
- 第一版建议把 `report.json` 作为内容与生成状态记录，把最终 push 结果写入自动化运行摘要和 `memory.md`。
- 如果后续要求页面公开展示最终推送状态，可以增加独立的 `docs/publish-status/YYYY-MM-DD.json`，在 push 成功后用第二个普通 commit 更新；但这会增加一次额外提交。

## 自检与提示词优化闭环

现有“自检与优化建议”继续保留，新增发布状态字段。

推荐最终自检结构：

```json
{
  "report_date": "2026-05-13",
  "main_items": 0,
  "builder_observations": 0,
  "builder_skill_used": [],
  "fallback_sources": [],
  "primary_links": true,
  "no_banned_words": true,
  "no_unsourced_numbers": true,
  "notes": "",
  "publish_status": {
    "html_generated": true,
    "repo_updated": true,
    "repo_pushed": true,
    "pages_url": "https://jasonxzwen.github.io/ai-daily-cn/reports/2026/05/2026-05-13.html",
    "publish_error": ""
  },
  "optimization_suggestions": [
    {
      "problem": "",
      "suggestion": "",
      "prompt_change": "",
      "requires_confirmation": true
    }
  ]
}
```

闭环规则：

- `optimization_suggestions` 最多 3 条。
- 建议必须来自本次真实问题，不硬凑。
- 建议必须可执行、可验证。
- prompt 自动迭代必须等待用户确认。
- 用户确认后才允许修改 `C:\Users\Admin\.codex\automations\ai-2\automation.toml` 的 `prompt` 字段。
- 修改 prompt 时必须保留 `id`、`status`、`rrule`、`model`、`reasoning_effort`、`execution_environment`、`cwds` 等配置字段。
- 低风险格式修复，例如“补充 publish_status 字段默认值”“统一日期路径格式”“缺少 pages_url 时给空字符串”，可以列为建议，但不能绕过确认直接改 prompt。
- 如果只是发布脚本内部 bug，不应写入 prompt 优化建议；应写入 `publish_error` 和工程修复清单。

## 实施步骤

建议分阶段实施。

第一阶段：仓库静态站点骨架

1. 创建 `docs/`。
2. 创建 `docs/.nojekyll`。
3. 创建 `docs/assets/style.css`。
4. 创建初始 `docs/index.html`。
5. 创建初始 `docs/feed.json`。
6. 手动配置 GitHub Pages 从 `main` 的 `/docs` 发布。
7. 验证站点首页可访问。

第二阶段：日报产物契约

1. 固化 `report.md`、`report.json`、`report.html` 的字段契约。
2. 为 Markdown 到 JSON 的转换定义解析规则。
3. 为 HTML 渲染定义模板。
4. 为 `feed.json` 和首页定义排序、覆盖、去重规则。
5. 增加本地 dry-run 验证，不执行 git 写入。

第三阶段：本地发布器

1. 接入 `ai-2` 的输出。
2. 生成当日 Markdown、JSON、HTML。
3. 更新首页和 feed。
4. 执行 git 安全检查。
5. dry-run 展示将写入和将提交的文件。
6. 用户确认后再允许实际 commit/push。

第四阶段：自动发布

1. 在用户明确允许自动 commit/push 后，把发布器接入 `ai-2`。
2. 每次发布前检查工作树和远端状态。
3. 普通 commit。
4. 普通 push。
5. 记录 `publish_status`。
6. 发布失败时只记录错误和建议。

第五阶段：增强能力

1. 增加历史归档页。
2. 增加按月份索引。
3. 增加 RSS 或 Atom。
4. 增加客户端搜索或预生成搜索索引。
5. 需要构建链路时迁移到 GitHub Actions Pages 发布。

## 风险与待确认项

主要风险：

- 当前远端仓库没有提交和分支头，首次发布需要创建初始提交。
- 当前 GitHub Pages 尚未启用，需要管理员在 GitHub 设置中确认发布源。
- 如果自动化运行目录不是目标仓库，必须明确目标 repo checkout 路径。
- 如果本地自动化使用不同 git 凭据，push 可能失败。
- 如果未来改为 GitHub Actions 内部推送，再使用 branch source 可能遇到 Pages build 触发限制，需要改为 Actions 发布。
- 如果公开站点包含未验证来源或错误信息，历史页面会长期可访问，需要保留修正策略。
- 如果 Markdown 直接发布到 `docs/`，原文也会公开；如不希望公开原文，应把 Markdown 放到非 Pages 目录。
- 如果每天覆盖同一文件名而不是按日期归档，会丢失历史，因此默认按日期保留。

进入实现阶段前必须确认：

- 目标 GitHub 仓库名：当前推断为 `JasonxzWen/ai-daily-cn`，需要最终确认。
- 发布分支：当前建议为 `main`，需要确认。
- Pages 发布目录：当前建议为 `/docs`，需要确认。
- 最终站点 URL：当前预期为 `https://jasonxzwen.github.io/ai-daily-cn/`，需要确认。
- 是否允许自动 commit/push：当前未授权，不能实现自动推送。
- 是否需要保留历史日报页面：当前建议保留，需要确认保留周期。
- Markdown 原文是否允许公开访问。
- 是否需要 RSS/Atom，还是 `feed.json` 即可。
- 首页是否只展示最近 N 篇，还是展示完整归档。
- 自动化失败时是否需要额外通知渠道。
- 是否允许发布器在用户确认后修改 `ai-2` 的 prompt。
- 是否要求公开 JSON 中准确展示最终 `repo_pushed` 状态；如果要求，需要确认是否接受二阶段状态提交。
