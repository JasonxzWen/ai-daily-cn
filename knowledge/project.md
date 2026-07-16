---
type: project
title: AI Daily CN 项目概览
---
# AI Daily CN 项目概览

## 稳定事实

- AI Daily CN 是一个把结构化报告生成可审计、可归档 GitHub Pages 站点的中文 AI 日报发布器。
- 站点是静态产物，不依赖后端、数据库、队列或托管运行时。
- `reports-data/` 保存完整报告数据，`docs/` 保存面向读者的静态页面、公开 JSON、Feed 与趋势数据。
- `curated-data/` 保存用于生成公开投影的已审阅内部来源记录，`knowledge/` 只保存 Markdown 格式的项目 Wiki。
- 日更 runner 在旧公开信号持久化前运行一个不改变公开页面的 Phase 1A 影子阶段：按日保存 repo-safe 原始观察与 `registered → fetched → parsed` 信源漏斗；正常影子失败及有确定性 recovery evidence 的原子事务失败只记录降级，不阻断旧发布器。无恢复证据的 receipt 损坏、canonical reconciliation、lineage 或 privacy 漂移继续按仓库完整性失败阻断。
- Aify 首页“今日精选”由独立严格适配器解析，内容回执 `aify_today_picks` 与站点健康回执 `site-aify-news` 分离；既有 `content-aify-news` archive 配置仍保持原样。
- 根包使用 Node.js ESM，并通过 Corepack 管理的 pnpm workspace 执行构建、测试与发布前验证。

## 推断边界

- 本页只记录仓库文档与包定义直接支持的稳定事实；不把临时任务状态、候选来源或未落地路线写入项目知识。

## Sources

- [项目 README](../README.md)
- [项目包定义](../package.json)
- [命令行入口](../src/cli.js)
- [日更工作流合同](../config/daily-workflow-contract.json)
- [影子信源编排](../src/curated-source-shadow.js)
- [Aify 今日精选适配器](../src/aify-today-picks.js)
