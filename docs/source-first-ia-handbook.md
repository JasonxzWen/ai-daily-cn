# Source-First IA Handbook

状态：`phase-1-contract`

本文定义 AI 日报“信源优先”信息架构的固定排序和后续加信源规则。机器可读合同在 `config/source-display-contract.json`，本手册解释如何维护它。

## 目标

日报不再把“订阅了哪些信源、哪些平台可用、哪些阻塞或未更新”放在后置调试区。读者应先看到：

- 今天有效信息汇总成的 story 判断。
- 系统运行仪表盘：配置源、已检查、有效更新、已入选、有更新未入选、无近期更新、阻塞、未配置或跳过。
- 固定排序的信源图谱：核心源默认展开，长尾源折叠。

Phase 1 只落数据合同。页面首屏和视觉改造属于后续阶段。

## 固定分组

排序由 `section.rank` 和 `source.rank` 决定，不按当天状态动态重排。

| Section | Rank | 用途 | 默认展开 |
|---|---:|---|---|
| `core_primary` 核心一手源 | 10 | OpenAI、Anthropic、Google/DeepMind、Microsoft、Meta、AWS、Hugging Face 等直接一手源 | 是 |
| `china_models` 中国模型与厂商 | 20 | DeepSeek、Qwen、Kimi、MiniMax、Zhipu、Tencent、ByteDance、Baidu 等 | 是 |
| `open_source_platforms` 开源、模型平台与代码生态 | 30 | GitHub Trending、GitHub org watch、Hugging Face、arXiv、Papers with Code、开源周报 | 重要源展开，长尾折叠 |
| `tracking_metrics` 榜单与持续指标 | 40 | OpenRouter、Artificial Analysis、SWE-Bench Pro 等持续追踪源 | 是 |
| `builder_community` Builder 与社区原始信号 | 50 | follow-builders、HN、Reddit、个人 builder 博客/通讯 | 否，关键源可覆盖为展开 |
| `platform_cn_media` 中文平台与媒体线索 | 60 | WeChat、Zhihu、Jike、QbitAI、机器之心、36Kr、InfoQ CN 等 | 是 |
| `english_media_search` 英文媒体与搜索聚合 | 70 | TechCrunch、The Verge、MIT TR、Ars、VentureBeat、Google News 等 | 否 |

## 状态标签

`src/source-effectiveness.js` 输出的 `status_label` 只用读者可理解的状态：

| status_label | 含义 |
|---|---|
| `included` | 该逻辑源今天有内容进入公开页面 |
| `updated_not_selected` | 抓到候选，但没有进入公开页面 |
| `parsed_not_candidate` | 解析到近期内容，但没有形成候选 |
| `no_recent_update` | 可访问，但没有近期更新 |
| `blocked` | 已配置但不可达、HTTP/解析阻塞或同类错误 |
| `not_configured_or_skipped` | 未配置、缺少 RSSHub base URL、手动源跳过、kill switch 或占位源 |

## 新增信源规则

1. 先确定逻辑源归属，再确定采集入口。多个 RSS、HTML、GitHub org、Hugging Face org 可以汇总到同一个逻辑源。
2. 必须在 `config/source-display-contract.json` 选择 `section`，并用 10、20、30 这样的间隔设置 `rank`。
3. `tier` 和 `authority` 只辅助采集权重；公开页面排序以 display contract 为准。
4. 核心一手源、中文核心模型厂商、平台缺口源默认可见。媒体、搜索、泛社区长尾默认折叠。
5. WeChat、Zhihu、Jike 等平台源即使未配置也必须保留可见行，状态为 `not_configured_or_skipped`，不得静默消失。
6. 新增逻辑源后，必须补测试，证明它进入正确 section、rank 稳定、状态标签可推导。
7. public `docs/data` 可以保留 `source_effectiveness` 的显示字段和聚合计数，但不能暴露 `source_audit`、candidate pool、selection score、repair/debug 信息。

## Phase 1 验收边界

Phase 1 完成只表示：

- display contract 已存在。
- `source_effectiveness` 行带有固定展示元数据。
- schema 和 public data projection 允许这些字段。
- 单元测试证明排序、状态标签和 public projection 稳定。

它不表示首屏仪表盘、信源图谱 UI 或移动端视觉已经上线。那些必须在后续 PR 中通过 Playwright 端到端截图验收。
