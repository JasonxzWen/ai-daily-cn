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
<!-- order-tuning-total-unmapped:68 -->

These counts come from the 153-entry safe inventory. They show how many collection entries are visible but not yet represented as first-class logical sources.

| Section | Unmapped entries | Review stance |
|---|---:|---|
| `core_primary` | 3 | Phase 22 promotes the reviewed Apple, Meta Engineering, NVIDIA Developer, and xAI official sources; keep reviewing the remaining durable company/platform blogs. |
| `china_models` | 20 | Phase 17 promotes the first five official China model sources; continue with platform/lab sources in later batches. |
| `open_source_platforms` | 1 | Promote durable paper, model, and code ecosystem sources; keep org mirrors collection-only. |
| `tracking_metrics` | 0 | Completed in Phase 16; the three structured benchmark/ranking sources are now first-class logical sources. |
| `builder_community` | 41 | Promote named expert/community sources sparingly; keep broad aggregators collection-only. |
| `platform_cn_media` | 1 | Promote stable direct Chinese RSS/media clue sources only after they prove durable reader value. |
| `english_media_search` | 2 | Keep most search/media aggregation low priority; Product Hunt can be promoted if product discovery remains useful. |

## Promotion Candidate Review

<!-- promotion-candidate-review -->

These candidates are proposed first-class logical sources. They are not merged into the executable display contract in this slice.

| Source ID | Proposed logical source | Section | Suggested rank | Action | Rationale |
|---|---|---|---:|---|---|
| `content-azure-blog` | `azure-ai-blog` | `core_primary` | 95 | `promote` | Azure platform posts can carry durable Microsoft AI infrastructure signals separate from Microsoft Research. |
| `content-tiktok-developers-blog` | `tiktok-developer-ai` | `core_primary` | 105 | `promote` | TikTok developer posts can surface platform and applied AI developer changes. |
| `content-cloudflare-blog` | `cloudflare-ai-platform` | `core_primary` | 115 | `promote` | Cloudflare platform posts can surface Workers AI, edge inference, and developer infrastructure signals. |
| `content-google-keyword` | `google-keyword-ai` | `core_primary` | 125 | `promote` | Google Keyword can carry corporate and product AI announcements outside DeepMind and Research. |
| `content-tencent-hunyuan-blog` | `tencent-hunyuan` | `china_models` | 60 | `promote` | Hunyuan is the Tencent model/platform source that should not be hidden in generic company feeds. |
| `content-bytedance-seed-blog` | `bytedance-seed` | `china_models` | 70 | `promote` | ByteDance Seed is a distinct model/research source. |
| `china-ai-baidu-ai-news` | `baidu-ai` | `china_models` | 80 | `promote` | Baidu AI remains a recurring Chinese model/platform signal. |
| `content-alibaba-cloud-blog` | `alibaba-cloud-ai` | `china_models` | 90 | `promote` | Alibaba Cloud AI posts are useful platform signals next to Qwen. |
| `content-builder-simon-willison` | `simon-willison` | `builder_community` | 30 | `promote` | Simon Willison is a high-signal builder/analyst source. |
| `content-builder-lilian-weng` | `lilian-weng` | `builder_community` | 40 | `promote` | Lilian Weng is a high-signal technical explainer source. |
| `content-latent-space` | `latent-space` | `builder_community` | 50 | `promote` | Latent Space is a recurring builder/research community source. |
| `content-interconnects` | `interconnects` | `builder_community` | 60 | `promote` | Interconnects is a high-signal analysis source. |
| `content-nature-machine-learning` | `nature-machine-learning` | `builder_community` | 70 | `promote` | Nature Machine Learning can surface durable paper and research-context signals. |
| `content-runway-changelog` | `runway-ai-products` | `builder_community` | 80 | `promote` | Runway product changes are useful AIGC workflow signals when dated and concrete. |
| `content-luma-changelog` | `luma-ai-products` | `builder_community` | 90 | `promote` | Luma changelog entries can carry useful image/video generation product updates. |
| `content-smol-ai-news` | `smol-ai-news` | `builder_community` | 100 | `promote` | Smol AI News is a maintained AI news feed suitable for low-threshold discovery review. |
| `content-the-magnifier-ai` | `the-magnifier-ai` | `builder_community` | 110 | `promote` | The Magnifier AI can remain a low-threshold analysis and discovery review candidate. |
| `content-pika-product` | `pika-ai-products` | `builder_community` | 120 | `promote` | Pika product updates can carry concrete AIGC/video workflow signals when dated and source-backed. |
| `content-kling-product` | `kling-ai-products` | `builder_community` | 130 | `promote` | Kling product updates can carry China-facing AIGC/video product signals when concrete. |
| `intermediary-sspai` | `sspai-ai` | `platform_cn_media` | 60 | `promote` | SSPAI can surface China-facing product and tool signals. |
| `intermediary-leiphone` | `leiphone-ai` | `platform_cn_media` | 80 | `promote` | Leiphone can remain a lower-priority Chinese technology clue source if it proves useful. |
| `intermediary-ifanr` | `ifanr-ai` | `platform_cn_media` | 90 | `promote` | iFanr can remain manual/review-only for product and consumer AI signals. |
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
corepack pnpm run sources:display-contract
corepack pnpm run validate
```

Acceptance before a later rank-changing PR:

- The user has reviewed the candidate table and tuned ranks if needed.
- New first-class logical sources have stable ids, sections, and 5-point insertion ranks.
- Collection-only entries remain in `docs/source-inventory-order.md`.
- Daily source status remains a status label and does not reorder fixed rows.
