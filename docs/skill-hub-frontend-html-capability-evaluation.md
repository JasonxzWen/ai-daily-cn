# Skill Hub 前端与 HTML 汇报能力评估

## 结论

可以通过 `skill-hub` 增强本仓库后续的前端开发、HTML 汇报、浏览器验证和测试规范能力。当前已选择性安装 `html-work-reports`，但不安装完整 `web` profile。

推荐策略：

- 已落地 `html-work-reports` 的技能说明、模板、生成器、校验器、schema、fixture 和 smoke 测试。
- 生产 AI 日报 HTML 仍由本仓库 `src/render.js` 和 `src/site.js` 生成；`html-work-reports` 只用于实现交接、评审、研究说明、状态看板等工作汇报。
- 继续新增能力前，仍先用 `skill-hub install ... --dry-run` 查看将写入的技能文件。
- 第一批只考虑与本仓库目标强相关的能力：`html-work-reports`、`webapp-testing`、`e2e-testing`、`frontend-patterns`、`web-design-guidelines`。
- 暂缓 `frontend-design` 和 `web-artifacts-builder`，除非后续从静态日报站点升级为复杂交互应用或 React/Tailwind artifact。

## 当前落地状态

- 已新增 `.codex/skills/html-work-reports/`，来源为 `D:\skill-hub` 的 `html-work-reports` 技能资产。
- 已新增根级 `AGENTS.md`，把中文回复、仓库边界、HTML 工作汇报路由和验证门写入 agent 指令面。
- 已新增 `tests/skills.test.js`，用内置 fixture 生成单文件 HTML，并运行 `validate-html-report.mjs --skip-browser` 校验结构、证据、代码行号、diff、自包含与交互控制。
- 已把技能 smoke 测试纳入 `npm test`，因此 `npm run validate` 会覆盖该能力。
- 未安装完整 `web` profile，未引入 `frontend-design`、`web-artifacts-builder`、`frontend-slides` 等与当前日报发布目标无直接关系的技能。

## 调研来源

检查对象：

- 远端仓库：`https://github.com/JasonxzWen/skill-hub`
- 本地 checkout：`D:\skill-hub`
- 当前仓库：`D:\ai-daily-cn`

已执行只读检查：

```powershell
node bin\skill-hub.mjs analyze D:\ai-daily-cn --profile web --agent codex --agent-readiness --json
```

初次分析结果摘要：

- `web` profile 推荐了 HTML 报告、前端模式、浏览器测试、E2E、UI/a11y 审计等能力。
- 当时仓库缺少 agent 指令面，现已补充根级 `AGENTS.md`。
- 当时仓库缺少明确成功标准、OpenSpec tasks 或 Definition of Done，现已有 OpenSpec change 与 `npm run validate` 门。
- 当时仓库缺少可重复验证命令，现已有 `build`、`test`、`test:e2e`、`validate`，并新增技能 smoke 测试。
- 当时仓库缺少 skill routing、agent roles 或 OpenSpec change 等路由资产，现已补充 `html-work-reports` repo-local 技能路由。
- 自动化候选应保持手动，直到存在可检查的 `build/test/validate` gate。

## 可复用能力矩阵

| 能力 | 来源 | 对本仓库的价值 | 当前建议 |
|---|---|---|---|
| HTML work reports | `html-work-reports` | 把日报、发布报告、失败分析做成可浏览 HTML 产物；强调自包含、证据、导出、可审计 | 已选择性安装为工作汇报技能 |
| One-off browser testing | `webapp-testing` | 用浏览器打开 `file://` 或本地站点，验证 HTML 非空、布局、交互、链接 | 作为实现阶段验收门 |
| Durable Playwright suites | `e2e-testing` | 为首页、日报页、feed、移动视口建立稳定 E2E | 实现阶段建立 `test:e2e` |
| Frontend patterns | `frontend-patterns` | 如果引入 React/Vite 或交互 UI，可约束状态、表单、路由、a11y | 静态 HTML 阶段只作参考 |
| UI/a11y audit | `web-design-guidelines` | 发布前检查可读性、对比度、键盘访问、信息密度 | 实现阶段加入人工/半自动审计 |
| Frontend design | `frontend-design` | 适合生产级视觉 UI，不适合常规日报汇报 | 暂缓 |
| Web artifacts builder | `web-artifacts-builder` | 适合复杂 React/Tailwind 单文件 artifact | 暂缓 |

## 对本仓库的工程启发

`skill-hub` 的关键价值不是“复制技能文件”，而是它把能力拆成清晰的工程层：

1. `build`
   - 生成或重建静态站点产物。
   - 对本仓库应对应“从日报 Markdown/JSON 生成 `docs/`”。

2. `test`
   - 运行可重复单元测试、解析测试、schema 测试。
   - 对本仓库应覆盖 Markdown 解析、JSON schema、feed 更新、HTML escaping。

3. `test:e2e`
   - 用真实浏览器验证发布页面。
   - 对本仓库应覆盖 `index.html`、日报页、移动视口、链接、搜索/筛选等交互。

4. `validate`
   - 聚合 typecheck、test、build、E2E 或静态检查。
   - 对本仓库应作为进入自动发布前的统一 gate。

5. routing eval
   - 每个技能或提示词边界都有 positive、negative、forbidden-load。
   - 对本仓库应迁移为 prompt good case、bad case、forbidden content、source fallback case。

## 建议的后续仓库脚本合同

实现阶段可以建立如下脚本名，但当前不实现：

```json
{
  "scripts": {
    "build": "生成 docs/ 静态站点产物",
    "test": "运行 parser/schema/feed/html 单元测试",
    "test:e2e": "用 Playwright 验证 docs/ 页面",
    "validate": "顺序运行 test、build、test:e2e 和 git 安全检查",
    "publish:dry-run": "生成发布计划，不写 git commit",
    "publish": "仅在用户授权后执行普通 commit/push"
  }
}
```

脚本命名应保持语义稳定：

- `build` 不访问远端，不执行 git 操作。
- `test` 不依赖网络。
- `test:e2e` 可以启动本地静态服务器或打开 `file://`。
- `validate` 不 push。
- `publish:dry-run` 不 commit。
- `publish` 必须检查工作树、分支、远端状态和用户授权。

## 能力安装策略

后续若要继续从 `skill-hub` 增加能力，建议先执行 dry-run：

```powershell
npx skill-hub install D:\ai-daily-cn --profile web --agent codex --dry-run --json
```

已落地：

- `html-work-reports`

后续候选：

- `webapp-testing`
- `e2e-testing`
- `frontend-patterns`
- `web-design-guidelines`

暂缓候选：

- `frontend-design`：日报静态站点应以信息密度、可读性和证据优先，不需要强视觉创作姿态。
- `web-artifacts-builder`：除非站点升级为复杂 React/Tailwind artifact，否则会增加不必要构建复杂度。
- `frontend-slides`：除非日报需要演示 deck。
- `prototype`：只在明确需要一次性探索交互方案时使用。

## 当前仓库已补的基础

当前已具备：

- `docs/` 方案文档。
- OpenSpec 风格 proposal/design/spec/tasks。
- Prompt 构建规范。
- JSON/HTML/feed 数据契约。
- Good case / bad case / forbidden case fixtures。
- 测试矩阵与验收门。
- Git 发布安全边界。
- Pages 配置确认清单。

这与 `skill-hub` 的 agent-readiness 结果一致：先建立可审计目标和验证门，再进入实现。

## 不采纳的做法

- 不把 `skill-hub` 全量 vendor 到本仓库。
- 不在当前阶段安装 web profile。
- 不把日报静态站点立即升级为 React 应用。
- 不把 HTML 报告做成依赖 CDN 的复杂前端。
- 不在没有 `validate` gate 前接入自动 commit/push。
- 不把 prompt 自动迭代和发布流水线实现混在同一个第一版改动里。
