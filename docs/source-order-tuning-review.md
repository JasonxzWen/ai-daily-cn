# Source Order Tuning Review

<!-- source-order-tuning-review:v1 -->

Status: `phase-15-user-review-proposal`

Maintenance owner: `user-reviewed-fixed-source-order`

Machine contract: `config/source-display-contract.json`

Inventory reference: `docs/source-inventory-order.md`

## User Review Surface

This file is Codex's baseline proposal for user-tuned fixed source importance. It is intentionally a review surface, not an executable rank change. The user may tune section placement, suggested logical source ids, and ranks before a later PR updates `config/source-display-contract.json`.

Daily source status must not reorder review priorities. Blocked, skipped, unconfigured, no-update, or newly active sources stay in their fixed review position until the user approves a rank change.

## Unmapped Source Counts

<!-- order-tuning-unmapped-counts -->
<!-- order-tuning-total-unmapped:86 -->

These counts come from the 154-entry safe inventory. They show how many collection entries are visible but not yet represented as first-class logical sources.

| Section | Unmapped entries | Review stance |
|---|---:|---|
| `core_primary` | 7 | Promote the most durable official lab/company subchannels first. |
| `china_models` | 20 | Phase 17 promotes the first five official China model sources; continue with platform/lab sources in later batches. |
| `open_source_platforms` | 12 | Promote durable paper, model, and code ecosystem sources; keep org mirrors collection-only. |
| `tracking_metrics` | 0 | Completed in Phase 16; the three structured benchmark/ranking sources are now first-class logical sources. |
| `builder_community` | 39 | Promote named expert/community sources sparingly; keep broad aggregators collection-only. |
| `platform_cn_media` | 6 | Promote stable Chinese media/platform clue sources after WeChat/Zhihu. |
| `english_media_search` | 2 | Keep most search/media aggregation low priority; Product Hunt can be promoted if product discovery remains useful. |

## Promotion Candidate Review

<!-- promotion-candidate-review -->

These candidates are proposed first-class logical sources. They are not merged into the executable display contract in this slice.

| Source ID | Proposed logical source | Section | Suggested rank | Action | Rationale |
|---|---|---|---:|---|---|
| `content-apple-machine-learning` | `apple-ml-research` | `core_primary` | 55 | `promote` | Apple ML research is a durable official lab signal. |
| `content-meta-engineering` | `meta-engineering` | `core_primary` | 65 | `promote` | Meta Engineering can carry infrastructure releases separate from Meta AI Blog. |
| `content-nvidia-developer-blog` | `nvidia-ai-developer` | `core_primary` | 75 | `promote` | NVIDIA developer posts are high-impact AI platform signals. |
| `content-xai-news` | `xai-news` | `core_primary` | 85 | `promote` | xAI official news deserves independent visibility when model/platform updates land. |
| `content-tencent-hunyuan-blog` | `tencent-hunyuan` | `china_models` | 60 | `promote` | Hunyuan is the Tencent model/platform source that should not be hidden in generic company feeds. |
| `content-bytedance-seed-blog` | `bytedance-seed` | `china_models` | 70 | `promote` | ByteDance Seed is a distinct model/research source. |
| `china-ai-baidu-ai-news` | `baidu-ai` | `china_models` | 80 | `promote` | Baidu AI remains a recurring Chinese model/platform signal. |
| `content-alibaba-cloud-blog` | `alibaba-cloud-ai` | `china_models` | 90 | `promote` | Alibaba Cloud AI posts are useful platform signals next to Qwen. |
| `content-arxiv-cs-ai` | `arxiv-cs-ai` | `open_source_platforms` | 30 | `promote` | arXiv cs.AI is a durable paper stream. |
| `content-huggingface-daily-papers` | `huggingface-daily-papers` | `open_source_platforms` | 40 | `promote` | Hugging Face Daily Papers is a recognizable paper discovery surface. |
| `content-papers-with-code-api` | `papers-with-code` | `open_source_platforms` | 50 | `promote` | Papers with Code is a structured model/paper ecosystem source. |
| `content-builder-simon-willison` | `simon-willison` | `builder_community` | 30 | `promote` | Simon Willison is a high-signal builder/analyst source. |
| `content-builder-lilian-weng` | `lilian-weng` | `builder_community` | 40 | `promote` | Lilian Weng is a high-signal technical explainer source. |
| `content-latent-space` | `latent-space` | `builder_community` | 50 | `promote` | Latent Space is a recurring builder/research community source. |
| `content-interconnects` | `interconnects` | `builder_community` | 60 | `promote` | Interconnects is a high-signal analysis source. |
| `content-reddit-machinelearning` | `reddit-machinelearning` | `builder_community` | 70 | `promote` | r/MachineLearning is a broad community signal, below named expert sources. |
| `platform-reddit-local-llama-feed` | `reddit-local-llama` | `builder_community` | 80 | `promote` | LocalLLaMA is a distinct open-model community signal. |
| `intermediary-qbitai` | `qbitai` | `platform_cn_media` | 30 | `promote` | QbitAI is a stable Chinese AI media clue source. |
| `intermediary-jiqizhixin` | `machine-heart` | `platform_cn_media` | 40 | `promote` | Machine Heart is a durable Chinese AI media source. |
| `intermediary-infoq-cn` | `infoq-cn` | `platform_cn_media` | 50 | `promote` | InfoQ CN is useful for Chinese enterprise/engineering AI signals. |
| `intermediary-sspai` | `sspai-ai` | `platform_cn_media` | 60 | `promote` | SSPAI can surface China-facing product and tool signals. |
| `intermediary-36kr` | `36kr-ai` | `platform_cn_media` | 70 | `promote` | 36Kr is a lower-priority Chinese business/media clue source. |
| `content-product-hunt-trending` | `product-hunt-trending` | `english_media_search` | 60 | `promote` | Product Hunt can be useful for product discovery after major English media. |
| `content-product-hunt-devtools` | `product-hunt-devtools` | `english_media_search` | 70 | `promote` | Product Hunt developer tools is a narrower product-discovery lane. |

## Collection-Only Review

<!-- collection-only-review -->

Keep these classes collection-only unless the user explicitly promotes a source:

- Duplicate official subchannels that support a promoted logical source, such as company news plus research/engineering pages under the same lab.
- Organization mirrors on model/code hosting platforms when the parent company or model family already has a first-class logical source.
- Broad search/media aggregation feeds that are useful as discovery backfill but too noisy as named public sources.
- Investor-relations and company newsroom feeds that only matter when they produce a concrete AI story.
- Manual or bridge entries that exist to keep platform gaps visible rather than to become standalone editorial sources.

## Order Tuning Validation

<!-- order-tuning-validation -->

Run these before merging future source-order changes:

```powershell
npm run sources:display-contract
npm run validate
```

Acceptance before a later rank-changing PR:

- The user has reviewed the candidate table and tuned ranks if needed.
- New first-class logical sources have stable ids, sections, and 5-point insertion ranks.
- Collection-only entries remain in `docs/source-inventory-order.md`.
- Daily source status remains a status label and does not reorder fixed rows.
