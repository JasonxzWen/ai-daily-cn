---
type: log
title: AI Daily CN 知识更新日志
---
# AI Daily CN 知识更新日志

## 2026-07-16

- 记录 Phase 1A 信源影子链路：新增按日 raw observations 与 source funnel，失败不阻断旧发布器。
- 记录 Phase 1B 确定性准入影子链路：三态逐项回执、跨日内容去重、内部 signal pool 与同代 public-ready 伴随投影均不改变当前公开页面。
- 记录展示语义边界：Aify“今日精选”通过机械门后原样复用；普通来源摘要必须是原文证据约束的一句话，而非入选理由。
- 记录 Aify 首页“今日精选”独立内容回执与站点健康回执的分离边界；既有 archive 信源不切换。

## 2026-07-15

- 初始化 Google OKF v0.1 的最小项目索引，为 repository-first Harness Hub 迁移提供项目知识合同。
- 将既有官方博客结构化 JSON 逐字节迁移到 `curated-data/official-blogs/`，为 OKF 释放根 `knowledge/` 路径。

## Sources

- [项目 README](../README.md)
- [项目包定义](../package.json)
- [日更工作流合同](../config/daily-workflow-contract.json)
- [影子信源编排](../src/curated-source-shadow.js)
- [信号准入合同](../config/signal-admission-contract.json)
- [信号池原子编排与验证](../src/signal-pool.js)
