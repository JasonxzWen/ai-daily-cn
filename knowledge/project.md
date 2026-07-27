---
type: project
title: AI Daily CN 项目概览
---
# AI Daily CN 项目概览

## 稳定事实

- AI Daily CN 是一个把结构化报告生成可审计、可归档 GitHub Pages 站点的中文 AI 日报发布器。
- 站点是静态产物，不依赖后端、数据库、队列或托管运行时。
- `reports-data/` 保存完整报告数据，`docs/` 保存面向读者的静态页面、公开 JSON、Feed 与趋势数据。
- 遗留编辑报告的完整候选池以无损 gzip JSON 保存在 `reports-data/internal/candidates/YYYY/MM/YYYY-MM-DD.candidates.json.gz`；默认站点构建不公开候选池，读取层只为迁移兼容旧 JSON 路径。
- `curated-data/` 保存用于生成公开投影的已审阅内部来源记录，`knowledge/` 只保存 Markdown 格式的项目 Wiki。
- 日更 runner 在旧公开信号持久化前运行一个不改变公开页面的 Phase 1A 影子阶段：按日保存 repo-safe 原始观察与 `registered → fetched → parsed` 信源漏斗；正常影子失败及有确定性 recovery evidence 的原子事务失败只记录降级，不阻断旧发布器。无恢复证据的 receipt 损坏、canonical reconciliation、lineage 或 privacy 漂移继续按仓库完整性失败阻断。
- Phase 1B 在 Phase 1A 后运行不阻断旧发布器的确定性准入影子阶段：逐项记录 `admitted / rejected / needs_review` 回执，将跨日去重后的信号保存到内部 signal pool，并生成同代、可校验但不进入当前站点发现与公开信号 schema 的 public-ready 伴随投影。
- Aify“今日精选”在 URL、安全、时效、去重等机械门通过后，原样复用其标题、描述、链接与标签；普通来源必须提供由原文证据约束的一句话事实摘要，不能把入选理由写成读者摘要。
- Aify 首页“今日精选”由独立严格适配器解析，内容回执 `aify_today_picks` 与站点健康回执 `site-aify-news` 分离；既有 `content-aify-news` archive 配置仍保持原样。
- 发布器在执行生成产物的 Git commit 时通过单次命令参数提供项目发布身份，显式 `GIT_AUTHOR_*` / `GIT_COMMITTER_*` 环境变量仍可覆盖；该机制不写用户、全局或仓库 Git 配置。
- legacy 日报的 AI repair contract 部分应用时，只要至少一个编辑已安全应用、剩余问题仍有公开文案修复任务且进度严格减少，runner 会保留成功编辑并生成下一轮 contract；外层 summary 也会从明确的嵌套 legacy handoff 恢复该状态，全部编辑被拒或没有进度时仍按既有安全门阻断或降级。
- 信号历史按产品契约持续保留；总 tracked payload 的硬上限为 384 MiB，reports-data、单文件、重复资产和 Git pack 仍受各自独立门槛约束，不能通过删除已发布信号历史绕过体积治理。
- 根包使用 Node.js ESM，并通过 Corepack 管理的 pnpm workspace 执行构建、测试与发布前验证。

## 推断边界

- 本页只记录仓库文档与包定义直接支持的稳定事实；不把临时任务状态、候选来源或未落地路线写入项目知识。

## Sources

- [项目 README](../README.md)
- [项目包定义](../package.json)
- [命令行入口](../src/cli.js)
- [候选池持久化](../src/candidates.js)
- [候选池路径布局](../src/reports-data-layout.js)
- [日更工作流合同](../config/daily-workflow-contract.json)
- [影子信源编排](../src/curated-source-shadow.js)
- [信号准入合同](../config/signal-admission-contract.json)
- [信号准入规则](../src/signal-admission.js)
- [信号池原子编排与验证](../src/signal-pool.js)
- [一句话摘要约束](../src/signal-summary.js)
- [Aify 今日精选适配器](../src/aify-today-picks.js)
- [站点与发布身份配置](../src/config.js)
- [Git 发布实现](../src/publish.js)
- [日更 runner](../src/daily-runner.js)
