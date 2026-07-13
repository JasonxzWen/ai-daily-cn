# Source-First IA Handbook

<!-- source-display-governance:v1 -->

Status: `phase-4-governance`

Machine contract: `config/source-display-contract.json`

Full inventory order reference: `docs/source-inventory-order.md`

Maintenance owner: `user-reviewed-fixed-source-order`

This handbook is the human-facing maintenance guide for source-first governance and optional diagnostics. The JSON contract is the executable authority; this document explains how to change the fixed source order without making the public daily report expose internal audit panels by default.

## 目标

日报公开页默认保持 story-first。信源运行概况、显式状态焦点、固定顺序信源图谱和全量采集入口属于内部治理/诊断表面，不能作为公开日报首屏或正文默认区块输出。

The fixed order is intentionally editorial and stable. It answers “which sources should governance track consistently” rather than “which source happened to update today.” In operational terms: do not reorder by daily status.

## 固定排序维护者与修改边界

The maintenance owner is `user-reviewed-fixed-source-order`.

实际维护方式：

1. Codex 可以在 PR 中提出新的排序建议。
2. 用户可以基于个人重要性微调 section 和 source rank。
3. 合并后的 `config/source-display-contract.json` 是唯一机器可读权威。
4. 当日状态只能改变 `status_label`、计数和可见状态，不得改变 section 或 rank。
5. 阻塞、未配置、跳过、无近期更新的源仍保留在固定顺序里，不能因为今天没有贡献内容而从图谱消失。

## 建议基线排序

<!-- baseline-fixed-order -->

Section rank 使用 10 点间隔。Source rank 默认也使用 10 点间隔；插入新源时优先使用中间空位，例如 15、25、35。若某个 section 没有空位，在同一个 PR 中按 10 点间隔重排该 section，并说明原因。

| Section | Rank | 默认展示 | 用途 |
|---|---:|---|---|
| `core_primary` | 10 | expanded | 官方公司、实验室、研究组织的一手公告和技术博客 |
| `china_models` | 20 | expanded | 中国模型厂商、平台和官方技术博客的预留主段 |
| `open_source_platforms` | 30 | expanded | GitHub、Hugging Face、论文和开源生态 |
| `tracking_metrics` | 40 | expanded | OpenRouter、Artificial Analysis、SWE-Bench 等持续指标 |
| `builder_community` | 50 | collapsed | Builder、HN、个人博客和社区原始信号 |
| `platform_cn_media` | 60 | expanded | WeChat、Zhihu、Jike、QbitAI、机器之心、36Kr、InfoQ CN 等中文平台与媒体线索 |
| `english_media_search` | 70 | collapsed | 英文媒体、搜索和新闻聚合 |

### `core_primary`

| Rank | Logical source | 规则 |
|---:|---|---|
| 10 | `openai-news` | OpenAI 官方新闻和 RSS，默认最高优先级 |
| 20 | `anthropic-news` | Anthropic 官方新闻 |
| 25 | `anthropic-research-engineering` | Anthropic Research and Engineering，官方研究与工程子频道 |
| 30 | `google-deepmind` | Google DeepMind 官方博客 |
| 40 | `google-research` | Google Research Blog |
| 50 | `microsoft-research` | Microsoft Research Blog |
| 55 | `apple-ml-research` | Apple Machine Learning Research，官方机器学习研究入口 |
| 60 | `meta-ai` | Meta AI Blog |
| 65 | `meta-engineering` | Meta Engineering，官方工程与基础设施入口 |
| 70 | `aws-ml` | AWS ML Blog |
| 75 | `nvidia-ai-developer` | NVIDIA AI Developer Blog，开发者和平台技术入口 |
| 80 | `hugging-face-blog` | Hugging Face 官方博客 |
| 85 | `xai-news` | xAI 官方新闻与公司新闻入口 |

### `china_models`

| Rank | Logical source | 规则 |
|---:|---|---|
| 10 | `deepseek-official` | DeepSeek 官方新闻/API 更新；只归并官方新闻入口，不吸收 GitHub/Hugging Face 镜像 |
| 20 | `qwen-official` | Qwen 官方博客与模型/平台发布；归并 Qwen 官方博客重复入口 |
| 30 | `kimi-official` | Kimi/Moonshot 官方博客、平台博客和技术博客 |
| 40 | `minimax-official` | MiniMax 官方博客与新闻入口 |
| 50 | `zhipu-official` | Zhipu/Z.ai 官方中文新闻与研究入口 |

后续 Tencent Hunyuan、ByteDance Seed、Baidu AI、Alibaba Cloud AI 等源按“原创模型发布和平台影响力优先”的规则继续插入。

### `open_source_platforms`

| Rank | Logical source | 规则 |
|---:|---|---|
| 10 | `github-trending` | GitHub Trending，公开项目趋势入口 |
| 20 | `github-org-watch` | GitHub 官方组织和仓库 watch |
| 25 | `github-watch-ai-news-radar` | ai-news-radar repository/Page updates as editorial direction reference. |
| 30 | `github-watch-follow-builders` | follow-builders repository and raw feed updates; X feed is the core Builder signal. |
| 35 | `github-watch-ai-news-agent` | ai-news-agent repository updates for curated mainstream media changes. |
| 40 | `arxiv-papers` | arXiv AI/ML/CL paper API streams |
| 50 | `huggingface-daily-papers` | Hugging Face Daily Papers API |
| 80 | `ml-papers-week` | 长尾论文聚合，默认可折叠 |
| 90 | `github-watch-ml-news-of-the-week` | ML-news-of-the-week weekly README/commit updates as recommended research context. |

### `tracking_metrics`

| Rank | Logical source | 规则 |
|---:|---|---|
| 10 | `openrouter-rankings` | OpenRouter usage and market rankings，必须来自结构化 public trace |
| 20 | `artificial-analysis-index` | Artificial Analysis model intelligence index，必须保留可复核表格数据 |
| 30 | `swe-bench-pro` | SWE-Bench Pro coding benchmark，必须保留结构化指标来源 |

### `builder_community`

| Rank | Logical source | 规则 |
|---:|---|---|
| 10 | `follow-builders` | 一手 builder/X 观察，关键源可 expanded |
| 20 | `hacker-news` | HN 社区信号，默认作为弱信号 |

### `platform_cn_media`

| Rank | Logical source | 规则 |
|---:|---|---|
| 10 | `chinese-direct-rss` | Direct Chinese RSS / feed sources such as QbitAI, InfoQ CN, 36Kr, and verified Machine Heart endpoints. |
| 20 | `community-hotspots` | Bottom community pulse sources such as HNRSS/Hacker News; repeatedly blocked subreddit feeds stay out of the default reset unless a reliable ingestion path is proven. |

### `english_media_search`

| Rank | Logical source | 规则 |
|---:|---|---|
| 10 | `techcrunch-ai` | 英文媒体 AI 频道 |
| 20 | `the-verge` | 英文科技媒体线索 |
| 30 | `mit-technology-review` | MIT Technology Review |
| 40 | `ars-technica` | Ars Technica |
| 50 | `venturebeat-ai` | VentureBeat AI |
| 60 | `aify-news` | First-class aggregator governance; every factual claim still requires a primary-source backtrace. |

## 新增信源插入规则

<!-- new-source-insertion-rules -->

<!-- source-insertion-handbook:v1 -->

### Source Insertion Decision Tree

This is the fixed source insertion handbook for new sources. The goal is to keep source visibility predictable: choose the source's stable editorial home first, then record daily runtime status separately. Daily status must not reorder rows.

1. If the source is an official first-party company, lab, product, model, research, safety, pricing, or platform announcement source, add or promote it as a first-class logical source in `core_primary`.
2. If the source is an official Chinese model vendor, Chinese AI lab, Chinese model platform, or official Chinese technical blog, add or promote it as a first-class logical source in `china_models`.
3. If the source is a code, model, package, paper, benchmark artifact, GitHub, Hugging Face, or open ecosystem signal, place it in `open_source_platforms`.
4. If the source is a structured leaderboard, status feed, benchmark tracker, pricing tracker, adoption tracker, or recurring metrics source, place it in `tracking_metrics`.
5. If the source is an individual builder, researcher, maintainer, social feed, community thread, or raw community signal, place it in `builder_community`.
6. If the source is a Chinese platform bridge, Chinese media feed, WeChat/Zhihu-style channel, or China-focused media clue source, place it in `platform_cn_media`.
7. If the source is English media, search, or a third-party news aggregation entry, place it in `english_media_search`.

### Insertion Rank Rules

- Keep `section_rank_step` at 10. A new display section is only allowed when the user explicitly approves a new stable editorial category.
- Keep `baseline_source_rank_step` at 10 for normal baseline ordering inside a section.
- Use `insertion_rank_step` 5 when a new source naturally belongs between two existing adjacent sources, such as rank 15 between rank 10 and rank 20.
- If a section has no available gap, renumber only that section in the same PR, keep 10-point spacing, and explain why the relative order changed.
- Runtime fields such as included, blocked, skipped, no recent update, candidate count, score, tier, or authority may affect collection and review, but must not change public display rank.

### Collection Entry Only

Use a collection-only entry when the new source is a feed, org page, API endpoint, search query, bridge, or manual input that supports an existing logical source. In that case, update the source registry and regenerate `docs/source-inventory-order.md`; do not add a new row to `config/source-display-contract.json` unless source governance should track it as a first-class identity.

### Promotion To Logical Source

Promote a collection entry only when source governance should track it as a named source. Promotion is appropriate when the source has distinct editorial importance, stable identity, or an independently meaningful blocked/skipped/no-update state. The same PR must update `config/source-display-contract.json`, this handbook if the insertion rule is new, focused tests, and the source inventory reference when registry entries move.

### User Review

Codex may propose the baseline placement, but the fixed importance order is user-reviewed. The user may tune section placement or rank before merge. Once merged, the JSON contract is the executable authority and daily status remains only a status label.

新增信源先判断“逻辑源”，再判断“采集入口”。多个 RSS、HTML index、GitHub org、Hugging Face org、RSSHub 或人工入口可以汇总到同一个 logical source；public source graph 展示 logical source，不展示每个底层 URL。

插入流程：

1. 判断是否是官方一手源。是则优先进入 `core_primary` 或 `china_models`。
2. 判断是否是开源、模型平台、论文或代码生态。是则进入 `open_source_platforms`。
3. 判断是否是持续指标或榜单。是则进入 `tracking_metrics`，并确认可以结构化复核。
4. 判断是否是 builder 或社区原始信号。是则进入 `builder_community`。
5. 判断是否是中文平台或中文媒体线索。是则进入 `platform_cn_media`。
6. 判断是否是英文媒体或搜索聚合。是则进入 `english_media_search`。
7. 选择 rank：优先使用相邻源之间的空位；没有空位时重排该 section，保持 10 点间隔。
8. 在同一 PR 中补充测试，证明新 logical source 有 section、rank、display mode 和可推导状态。
9. 若新增或移动底层采集入口，运行 `node scripts/generate-source-inventory-order.mjs` 刷新 `docs/source-inventory-order.md`，并用 `corepack pnpm run sources:display-contract` 确认 153+ 全量入口参考表仍完整。

不要把 source `tier`、`authority`、当日候选数或当天是否阻塞作为 public display rank 的动态输入。它们可以影响采集和候选排序，但不能改变固定图谱顺序。

## 状态保留规则

<!-- source-status-preservation -->

`status_label` 只描述今天的运行状态，不参与 rank 计算。

| status_label | 展示含义 | 维护规则 |
|---|---|---|
| `included` | 今天有内容进入公开页 | 保留原 rank，不上浮 |
| `updated_not_selected` | 抓到候选但未进入公开页 | 保留原 rank，在状态焦点中显式出现 |
| `parsed_not_candidate` | 解析到近期内容但未形成候选 | 保留原 rank，后续优化采集或候选准入 |
| `no_recent_update` | 可访问但无近期有效更新 | 保留原 rank，避免静默误判 |
| `blocked` | 已配置但不可达或解析阻塞 | 保留原 rank，并在 public 状态中披露 |
| `not_configured_or_skipped` | 未配置、缺 token/base URL、手动源、kill switch 或占位源 | 保留原 rank，尤其是 WeChat/Zhihu 平台源 |

## 验证命令

<!-- validation-commands -->

修改 source display order、handbook 或新增 logical source 时至少运行：

```powershell
corepack pnpm run sources:display-contract
node --test --test-name-pattern "source display contract governance" tests/unit.test.js
corepack pnpm run validate
```

如果改动影响公开页面内容或生成 HTML，还要运行：

```powershell
corepack pnpm run build:check-clean
corepack pnpm run test:e2e
```

## Source-First V2 Operating Contract

<!-- source-first-v2-contract:v1 -->

Status: `phase-18-contract`

Source-first runtime is internal governance by default. Source visibility remains important for maintenance and optional diagnostics, but public daily pages remain story-first and exclude source runtime audit sections unless the user explicitly requests a diagnostic surface.

<!-- source-first-v2-layering -->

### Logical Source Layer

The Logical Source Layer is the reader-facing source graph. A logical source is a named editorial source identity such as `openai-news`, `github-trending`, `chinese-direct-rss`, `community-hotspots`, or `openrouter-rankings`. It can group multiple collection entries when those entries serve the same reader-visible source identity.

Logical sources are ordered by fixed editorial importance in `config/source-display-contract.json`. Daily runtime status may change tags and counts, but it must not move logical sources.

### Collection Entry Layer

The Collection Entry Layer is the complete registered inventory. Collection entries are concrete feed, page, bridge, manual, API, or platform inputs. They are visible so blocked, skipped, unconfigured, manual, or no-update rows do not disappear from review.

153 collection entries are complete inventory rows, not public daily story content. They remain grouped and expanded in fixed source sections inside the internal source-first runtime with non-hiding search/highlight behavior.

Internal source-first inventory rows project a runtime layer onto this fixed inventory: mapped collection entries inherit the daily `status_label` from their logical source; mapped entries whose logical source is missing from today's runtime table show `unreported`; unmapped entries show `collection_only`. The generated `docs/source-inventory-order.md` reference remains a static order and configuration review surface, so runtime status must never reorder it.

<!-- internal-source-runtime-order -->

### Internal Source Runtime Order

The internal source-first runtime puts source signal story before source metrics dashboard in internal source-first runtime. When explicitly enabled, the renderer inserts the `system-operating-dashboard` immediately after `source_first_dashboard` and before `source_status_focus`; it is not part of `source_first_section_order`, so the fixed source order remains controlled only by the JSON contract.

The source-first section order is:

1. `source_signal_story`
2. `source_first_dashboard`
3. `source_status_focus`
4. `source_map`
5. `source_inventory`

The source signal story is a compact narrative rollup of effective, updated, blocked, skipped, and full-inventory source coverage. The source metrics dashboard is the numeric operating view. The status focus appears before the full graph so blocked or stale lanes are noticeable before the long inventory.

The source metrics dashboard has two required metric bands:

- Logical-source operating cards keep the fixed reader-facing source graph visible: total logical sources, public included, updated but not selected, blocked, not configured or skipped, and low-signal sources.
- Collection-entry runtime cards summarize the complete inventory before readers reach the long inventory: `INVENTORY_TOTAL`, `RUNTIME_KNOWN`, `INHERITED_RUNTIME`, `UNREPORTED_RUNTIME`, and `COLLECTION_ONLY`.

These collection-entry metrics are internal coverage indicators. They are derived from the same 153-row inventory runtime projection used by the full inventory, but they do not replace the expanded `source-inventory-group-*` sections and must not reorder, hide, or filter any collection entry.

The system operating dashboard is an internal metrics layer. It must show exactly five diagnostic cards: `公开内容规模`, `信号模块`, `趋势与追踪`, `信源覆盖`, and `运行质量`. The cards use tags `SYSTEM_CONTENT`, `SYSTEM_SIGNALS`, `SYSTEM_TRENDS`, `SYSTEM_SOURCES`, and `SYSTEM_QUALITY`. They may summarize public arrays and reader-safe quality status, but they must not be rendered into the public daily page by default.

<!-- public-daily-source-audit-exclusion -->

### Public Daily Source Audit Exclusion

Public daily pages remain story-first and exclude source runtime audit sections by default. The public renderer must not output `source_signal_story`, `source_first_dashboard`, `system_operating_dashboard`, `source_status_focus`, `source_map`, `source_inventory`, or their `source-map-group-*` / `source-inventory-group-*` detail groups unless a future user-approved diagnostic mode explicitly requests them.

<!-- full-inventory-expansion-semantics -->

### Full Inventory Expansion Semantics

All collection entries stay present in the internal source-first runtime. Search, quick links, and focus lanes may help navigation, but they must not remove, hide, or reorder rows.

Full expansion means:

- every registered collection entry appears exactly once in the inventory detail groups;
- groups follow fixed section rank;
- entries keep their logical-source mapping or `unmapped` status;
- blocked, skipped, manual, disabled, unconfigured, and no-update entries remain visible;
- search highlights matches without hiding non-matching rows.

<!-- baseline-source-importance-2026-06 -->

### Baseline Source Importance 2026-06

The baseline source importance order is:

1. `core_primary`
2. `china_models`
3. `open_source_platforms`
4. `tracking_metrics`
5. `builder_community`
6. `platform_cn_media`
7. `english_media_search`

Within each section, existing rank values remain the baseline until the user reviews a change. Codex may propose a rank, but merged JSON is the executable authority.

Story-centered content remains the fact carrier. Stories explain what happened and why it matters. Source-first sections explain coverage, reliability, gaps, and provenance only in internal governance or explicit diagnostic contexts.

<!-- source-promotion-review-loop -->

### Source Promotion Review Loop

Promote a collection entry only when source governance should track it as a named source.

Default loop:

1. Decide whether the new input belongs to an existing logical source.
2. If it is collection-only, update the registry and regenerate the inventory reference.
3. If it deserves named reader visibility, add a logical source contract, section rank, handbook row, focused tests, and order-tuning review updates.
4. Keep mirrors, duplicate org feeds, broad aggregators, and private/manual bridges collection-only unless the user explicitly promotes them.
5. Run the source display validator and full validation before merging.

The 2026-07 evidence decision promoted nine named identities without changing story admission or authority:

- `azure-ai-blog`, `cloudflare-ai-platform`, and `google-keyword-ai` in `core_primary`;
- `baidu-ai` and `alibaba-cloud-ai` in `china_models`;
- `latent-space` and `nature-machine-learning` in `builder_community`;
- `sspai-ai` and `leiphone-ai` in `platform_cn_media`.

The remaining original proposals are explicitly `defer` or `retire` in `docs/source-order-tuning-review.md` and stay collection-only.

<!-- source-first-v2-validation -->

### Source-First V2 Validation

Required commands:

```powershell
corepack pnpm run sources:display-contract
corepack pnpm run validate
```

Contract checks must reject:

- missing or renamed source-first v2 markers;
- internal source-first runtime order that does not start with `source_signal_story` then `source_first_dashboard`;
- a source metrics dashboard that omits full-inventory runtime metric cards for `INVENTORY_TOTAL`, `RUNTIME_KNOWN`, `INHERITED_RUNTIME`, `UNREPORTED_RUNTIME`, and `COLLECTION_ONLY`;
- a public daily page that renders source-first runtime audit sections by default;
- a missing logical source vs collection entry distinction;
- documentation that treats the 153-entry inventory as first-viewport story content;
- runtime status being used to reorder fixed source rows.

验收时必须确认：

- `config/source-display-contract.json` 覆盖 `buildSourceEffectivenessTable` 输出的每个 logical source。
- Handbook 包含所有 section id 和 logical source id。
- `corepack pnpm run validate` 包含 `corepack pnpm run sources:display-contract`。
- Public data 和 HTML 不暴露 `source_audit`、candidate pool、selection snapshot、score、repair 或 debug 信息。
