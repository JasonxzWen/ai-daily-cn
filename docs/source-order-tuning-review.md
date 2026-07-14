# Source Order Tuning Review

<!-- source-order-tuning-review:v1 -->

Status: `phase-15-evidence-decided`

Maintenance owner: `user-reviewed-fixed-source-order`

Machine contract: `config/source-display-contract.json`

Inventory reference: `docs/source-inventory-order.md`

## User Review Surface

This file is the evidence-backed decision record for the 24 original logical-source proposals. `promoted` rows are now executable, `defer` rows remain collection-only pending stronger evidence, and `retire` rows retire only the promotion proposal while preserving the collection entry.

Daily source status must not reorder review priorities. Blocked, skipped, unconfigured, no-update, or newly active sources stay in their fixed review position until the user approves a rank change.

## Unmapped Source Counts

<!-- order-tuning-unmapped-counts -->
<!-- order-tuning-total-unmapped:98 -->

These counts come from the current 186-entry safe inventory. They show how many collection entries are visible but not yet represented as first-class logical sources. A collection-only entry still participates in the public listener; logical-source promotion is internal inventory governance, never a publishing gate.

| Section | Unmapped entries | Review stance |
|---|---:|---|
| `core_primary` | 8 | Existing promoted identities stay mapped; eight collection entries, including new official release channels, remain collection-only without losing listener coverage. |
| `china_models` | 19 | Baidu AI and Alibaba Cloud are promoted; zero-signal model/platform entries remain deferred until parser versus no-update status is known. |
| `open_source_platforms` | 16 | Existing promoted identities stay mapped; repository releases and trend endpoints remain collection-only without losing listener coverage. |
| `tracking_metrics` | 0 | Completed in Phase 16; the three structured benchmark/ranking sources are now first-class logical sources. |
| `builder_community` | 53 | Latent Space and Nature Machine Learning are promoted; newsletters, media, and community channels remain collection-only without losing listener coverage. |
| `platform_cn_media` | 0 | SSPAI is promoted as a governance identity without higher fact authority. |
| `english_media_search` | 2 | Product Hunt promotion proposals are retired while collection continues. |

## Promotion Candidate Review

<!-- promotion-candidate-review -->

These 24 proposals have one explicit decision based on 38 stored daily candidate artifacts from 2026-05-25 through 2026-07-09 and final-report backrefs. Promotion never changes normal story admission or source authority.

| Source ID | Proposed logical source | Section | Suggested rank | Action | Rationale |
|---|---|---|---:|---|---|
| `content-azure-blog` | `azure-ai-blog` | `core_primary` | 95 | `promoted` | 31 observed days, 4 candidate days, and 2 final-report inclusion days support separate governance. |
| `content-tiktok-developers-blog` | `tiktok-developer-ai` | `core_primary` | 105 | `defer` | 30 observed days produced no parsed or selected signal; parser failure and no-update are not yet distinguishable. |
| `content-cloudflare-blog` | `cloudflare-ai-platform` | `core_primary` | 115 | `promoted` | 31 observed days, 21 candidate days, and 5 final-report inclusion days show durable platform value. |
| `content-google-keyword` | `google-keyword-ai` | `core_primary` | 125 | `promoted` | 26 observed days, 23 candidate days, and 15 final-report inclusion days provide strong production evidence. |
| `content-tencent-hunyuan-blog` | `tencent-hunyuan` | `china_models` | 60 | `defer` | 30 observed days produced no signal; wait for parser-versus-no-update classification. |
| `content-bytedance-seed-blog` | `bytedance-seed` | `china_models` | 70 | `defer` | 30 observed days produced no signal; wait for parser-versus-no-update classification. |
| `china-ai-baidu-ai-news` | `baidu-ai` | `china_models` | 80 | `promoted` | 20 observed days, 4 candidate days, and 4 final-report inclusion days justify named governance after REC-314. |
| `content-alibaba-cloud-blog` | `alibaba-cloud-ai` | `china_models` | 90 | `promoted` | 30 observed days, 29 candidate days, and 27 final-report inclusion days provide the strongest China-platform evidence. |
| `content-builder-simon-willison` | `simon-willison` | `builder_community` | 30 | `defer` | 13 candidate days but only 1 final-report inclusion remains entangled with REC-311 claim-level admission. |
| `content-builder-lilian-weng` | `lilian-weng` | `builder_community` | 40 | `defer` | 13 observed days produced no parsed or selected signal. |
| `content-latent-space` | `latent-space` | `builder_community` | 50 | `promoted` | 29 observed days, 22 candidate days, and 3 final-report inclusion days support a builder-analysis identity, not higher authority. |
| `content-interconnects` | `interconnects` | `builder_community` | 60 | `defer` | 29 observed days, 9 candidate days, and only 1 inclusion day are insufficient for first-class governance. |
| `content-nature-machine-learning` | `nature-machine-learning` | `builder_community` | 70 | `promoted` | 31 observed days, 30 candidate days, and 6 inclusion days show durable research-context value. |
| `content-runway-changelog` | `runway-ai-products` | `builder_community` | 80 | `defer` | 28 observed days produced no signal; classify the changelog parser before promotion. |
| `content-luma-changelog` | `luma-ai-products` | `builder_community` | 90 | `defer` | 28 observed days produced no signal; classify the changelog parser before promotion. |
| `content-smol-ai-news` | `smol-ai-news` | `builder_community` | 100 | `retire` | 29 observed days and 14 candidate days produced no final-report inclusion; retain collection-only discovery. |
| `content-the-magnifier-ai` | `the-magnifier-ai` | `builder_community` | 110 | `defer` | 29 observed days produced no candidate and included a blocked run; repair or retire the entry first. |
| `content-pika-product` | `pika-ai-products` | `builder_community` | 120 | `defer` | 28 observed days produced no candidate and included a blocked run; repair or retire the entry first. |
| `content-kling-product` | `kling-ai-products` | `builder_community` | 130 | `defer` | 28 observed days produced no parsed or selected signal. |
| `intermediary-sspai` | `sspai-ai` | `platform_cn_media` | 60 | `promoted` | 20 candidate days and 13 inclusion days justify governance visibility; intermediary authority and REC-311 gates remain unchanged. |
| `intermediary-leiphone` | `leiphone-ai` | `platform_cn_media` | 80 | `promoted` | 29 observed days, 21 candidate days, and 19 inclusion days show durable Chinese media clue value. |
| `intermediary-ifanr` | `ifanr-ai` | `platform_cn_media` | 90 | `defer` | Manual enablement has no production observation, so promotion would be configuration-only. |
| `content-product-hunt-trending` | `product-hunt-trending` | `english_media_search` | 60 | `retire` | 23 candidate days produced only 1 inclusion day; retain the existing product-discovery collection role. |
| `content-product-hunt-devtools` | `product-hunt-devtools` | `english_media_search` | 70 | `retire` | 24 candidate days produced no final-report inclusion; retain collection-only discovery. |

### User-directed promotion after the original 24-source review

`aify-news` is a separately approved promotion, not a retroactive change to the 24-source decision table above. Its `content-aify-news` JSON entry and `site-aify-news` observation entry share one logical identity at rank 60. The feature remains `observing` until three consecutive persisted production days close collection, admission, disposition reason, and public-output evidence; endpoint replay alone is not production verification.

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
