# Progress

## 2026-06-02 Automation Version Recovery

- Root cause: `main`/`origin/main` were aligned at `ccdd5cd`, but the broad source/quality fixes were still draft in PR #11, so scheduled runs on `main` could not see them.
- Confirmed the referenced Lark doc (`QjqfdnpPaosaaxxzRWRcMKhSnxe`, rev `26111`) covers AIGC/content industry, products, podcasts, and X/Twitter discussion.
- Added repo hard gates for thin candidate-rich reports: `main_items_coverage_gate_failed`, `content_units_coverage_gate_failed`, and `model_releases_missing_main_item`.
- Extended GitHub API fallback to `git_fetch_unavailable` / `git_push_unavailable`, while keeping `remote_ahead` non-bypassable.
- Added AIGC/content-industry and funding/product sources: The Magnifier AI, Fast Company Creator Economy, and Crunchbase News AI.
- Updated docs, runbook, prompts, and tests so the rules are enforced in the generation/publish flow, not only remembered in chat.
- Validation passed: unit tests, publish tests, sources validate, prompt build grep, harness validate, full `npm run validate`, and `git diff --check`.

## 2026-06-01 Daily Rerun Source Expansion

- Regenerated the 2026-06-01 AI daily report locally without publishing, pushing, or changing remote Pages.
- Expanded the report from 2 to 10 `main_items`, covering AI devtool cost tracking, enterprise agent platforms, model launches, physical AI, BI/data applications, AIGC content tools, and applied ML research.
- Moved model availability/status items out of `model_releases`:
  - Claude Status Opus 4.7 incidents are recorded as lightweight operations/community leads.
  - Claude Opus 4.8 availability in GitHub Copilot is recorded as product availability/community lead, not as a model launch.
- Added regular tracking coverage for AI development tool pricing/quota/cost attribution, including GitHub Copilot usage-based billing and Vercel AI Gateway spend caps.
- Rebuilt local artifacts:
  - `reports-data/2026/06/2026-06-01.json`
  - `reports-data/2026/06/2026-06-01.candidates.json`
  - `docs/data/2026/06/2026-06-01.json`
  - `docs/data/2026/06/2026-06-01.candidates.json`
  - `docs/reports/2026/06/2026-06-01.html`
- Added source/prompt rules for content expansion, model availability separation, AI devtool cost tracking, WeChat whitelist handling, Product Hunt/funding search, and podcast source handling.
- Added HTML rendering support and a unit test for `**bold**` and `==highlight==` markers in main item bullets.
- Discovery notes:
  - Product Hunt coverage exists in registered/default discovery tests, but this rerun did not include a Product Hunt item because no selected Product Hunt candidate passed the local discovery and cross-check path.
  - 小宇宙 can be used via public RSS when available.
  - 喜马拉雅 was not used because the current local environment has no `XIMALAYA_TOKEN` or reliable public transcript/API path; this is recorded in `self_check.optimization_suggestions`.
  - `discover:search-news` timed out in this local run, so search providers are recorded as blocked shadow discovery and were not used as factual input.
- Validation:
  - `npm run report:write -- .tmp/daily-report-2026-06-01.json reports-data 2026-06-01` passed.
  - `npm run build` passed.
  - `npm run validate` passed after all edits.
  - `npm run sources:phase5-audit -- --date 2026-06-01 --history-dir reports-data --days 3` passed.
  - `node scripts\harness-validate.mjs` passed.
  - Additional invariant check passed: 10 main items, only true model launches in `model_releases`, model availability in community leads, cost tracking present, HTML highlight rendering present, no `???` mojibake runs, quality status `ok`.

## 2026-06-01 Publish Retry

- Retried publishing accumulated daily artifacts after SSH fetch became available.
- `npm run publish:dry-run -- --date 2026-06-01` advanced past the previous `git_fetch_unavailable` blocker, then stopped with `remote_ahead` because `origin/main` contains `b226e31 add navigation and trend index (#8)`.
- Committed the local 2026-06-01 publisher-managed artifacts as `1908fce chore: publish AI daily report 2026-06-01` before merging remote changes, avoiding stash/reset.
- Started merging `origin/main`; only handoff Markdown files conflicted and were resolved by preserving both the trend-index work and the daily-publish retry state.
- Post-merge `npm run build` regenerated `docs/trends.json`, `docs/index.html`, and the 2026-05-30/2026-05-31/2026-06-01 report HTML.
- `npm run validate` passed after the merge resolution.
- `npm run sources:phase5-audit -- --date 2026-06-01 --history-dir reports-data --days 3` passed.
- `npm run publish:dry-run -- --date 2026-06-01` passed after the merge.
- `npm run publish -- confirm-push 2026-06-01` found no new artifact commit was needed, then `npm run publish:resume-push -- confirm-push 2026-06-01` pushed existing local commits.
- Pages verification passed for `https://jasonxzwen.github.io/ai-daily-cn/reports/2026/06/2026-06-01.html`; direct `Invoke-WebRequest` returned HTTP 200 with `2026-06-01` and `AI 日报 2026-06-01` present.
- Final publish state after the retry: local `main` and `origin/main` aligned at `ca8f081`; worktree clean before this handoff update.

## 2026-05-31 Daily Publish Automation

- Generated 2026-05-31 structured report and candidate pool:
  - `reports-data/2026/05/2026-05-31.json`
  - `reports-data/2026/05/2026-05-31.candidates.json`
  - `docs/reports/2026/05/2026-05-31.html`
  - `docs/data/2026/05/2026-05-31.json`
  - `docs/data/2026/05/2026-05-31.candidates.json`
- `npm run validate` passed.
- `npm run sources:phase5-audit -- --date 2026-05-31 --history-dir reports-data --days 3` passed.
- `npm run publish:dry-run -- --date 2026-05-31` failed with `git_fetch_unavailable` because SSH to `github.com:22` was denied in that environment.
- No real publish, push, reset, stash, force-push, or API fallback was run in that automation run.

## 2026-05-29 Navigation and Trend Index

- Added controlled trend vocabulary in `config/trends.json`, split into `topics` and `entities`.
- Added `schemas/trends.schema.json` and `validateTrends(...)`.
- Added `src/trends.js` for deterministic site-index trend generation:
  - rolling 7-day window
  - conservative `watching` / `active` / `hot` thresholds
  - automatic candidates retained as non-displayed `candidate_topics`
  - annotations limited to `main_items` and `github_trending`
- Updated `src/site.js` to generate `docs/trends.json` and inject per-date annotations into report rendering.
- Updated homepage rendering with a Top trend overview and year/month/week navigation.
- Added `日报导航` hero link on generated daily report pages.
- Confirmed trend data is not written back into `reports-data/**/*.json` or `docs/data/**/*.json`.

## 2026-05-29 Trend Validation

- `node --test tests/unit.test.js` passed.
- `npm run test:e2e` passed.
- `npm run build` passed and generated `docs/trends.json`.
- `npm run validate` passed; its build step reported `written_files: []`.
- `node scripts\harness-validate.mjs` passed.
- Manual artifact checks:
  - `docs/trends.json` contains `coding-agent` as `hot`.
  - `docs/index.html` contains trend overview/navigation and `trends.json`.
  - `docs/reports/2026/05/2026-05-29.html` contains `日报导航` and scoped trend tags.
  - `git diff -- reports-data docs/data --stat` is empty.

## 2026-05-29 Trend Config Fail-Fast

- Removed silent fallback from trend vocabulary loading.
- `loadTrendConfig(...)` now throws `PublisherError` for missing, unreadable, invalid, or empty trend vocabulary.
- Added regression coverage for missing/invalid vocabulary and for `buildSite(...)` failing when the build root has no trend config.
- Updated temporary publish test fixtures to include `config/trends.json`, matching the real repository contract.
- Validation:
  - `node --test tests/unit.test.js` passed.
  - `npm test` passed.
  - `npm run build` passed with `written_files: []`.
  - `npm run validate` passed.
  - `node scripts\harness-validate.mjs` passed.

## 2026-05-29 Quality-Status Repair

- Implemented top-level `quality_status` and `evidence_assets` schema support.
- Added quality derivation for blocked external sources, candidate-rich selection degradation, and low-signal checked sources.
- Added publish dry-run blocking for reports whose `quality_status.status` is `blocked`.
- Added inline site icons for rendered links/cards and safe external Markdown image rendering in the effective-interact renderer.
- Added local evidence assets for the 2026-05-29 Anthropic examples:
  - `docs/assets/evidence/anthropic-coding-agents-social-sciences-figure-1.jpg`
  - `docs/assets/evidence/anthropic-claude-opus-4-8-benchmark-table.png`
- Updated 2026-05-29 report data and generated docs to expose degraded source coverage plus the two evidence assets and transcribed tables.

## Current State

- Daily publish operation is the primary harness use case.
- The current work is merging remote trend-index support with accumulated unpublished daily report artifacts.
- `tasks/current-task.md`, `progress.md`, and `session-handoff.md` should reflect the publish retry until the retry completes.

## 2026-06-01 Daily Report Browser Repair

- Checked repo-local capability status:
  - `skill-hub status D:\ai-daily-cn --json`
  - `skill-hub analyze D:\ai-daily-cn --profile web --agent codex --agent-readiness --json`
  - `skill-hub install D:\ai-daily-cn --profile web --agent codex --dry-run --json`
  - `skill-hub update D:\ai-daily-cn --dry-run --json`
- Did not run a broad reinstall. The active daily page renderer is `.codex/skills/effective-interact`; the web profile dry-run targets `.agents/skills/*` and would add broader frontend skills not used by the production daily pipeline. The current renderer already includes a `taste-skill`-derived HTML aesthetic preflight reference.
- Repaired `src/interaction-report.js`:
  - Added cached source icons for Microsoft, NVIDIA, MiniMax, Alibaba Cloud, Vercel/X, Nature, Claude/Anthropic, AWS, GitHub, OpenAI, and Hugging Face domains/sources.
  - Removed hot-blog card detail points for `发布方` / `作者` / `日期`.
  - Renamed the signal section to explicit `X/Twitter 讨论`; when X sources are checked but no original status is included, it now renders a degradation note instead of silently omitting the section.
  - Moved inline evidence table/image captions below the table/image and includes the evidence title in the caption.
- Repaired `.codex/skills/effective-interact/scripts/create-interaction.mjs` so Markdown tables render inside `.markdown-table-scroll`; mobile page width no longer expands when evidence tables are wider than the viewport.
- Updated prompt modules to forbid main-item meta commentary such as "日报跟踪口径", "报道边界", and "后续跟进" inside news bullets, and to require 2-4 useful fact/data bullets plus X/Twitter degradation handling.
- Regenerated 2026-06-01 report:
  - 10 `main_items`, each with 3 bullets.
  - 10 `evidence_assets` tables attached to the matching source URL.
  - 3 hot blogs without visible publisher/author/date metadata.
  - 3 X/Twitter builder observations and 3 community/light-operations leads.
  - `quality_status.status: ok`.
- Added regression coverage:
  - high-frequency icon cache coverage.
  - X/Twitter degradation section when checked sources yield no included status.
  - hot-blog metadata removal.
  - evidence table caption ordering.
  - effective-interact Markdown table scroll wrapper.
- Validation passed:
  - `npm run report:write -- .tmp/daily-report-2026-06-01-fixed.json reports-data 2026-06-01`
  - `npm run build`
  - `npm run validate`
  - `npm run sources:phase5-audit -- --date 2026-06-01 --history-dir reports-data --days 3`
  - `node scripts\harness-validate.mjs`
- Browser/Playwright verification:
  - Desktop screenshot: `D:\ai-daily-cn\.tmp\verify-2026-06-01-after-table-fix.png`
  - Mobile screenshot: `D:\ai-daily-cn\.tmp\verify-2026-06-01-final-mobile.png`
  - Desktop: `X/Twitter 讨论` present, 10 evidence tables, 12 matched cached source icons, no hot-blog metadata, no overflow.
  - Mobile: document/body scroll width stays 390px; 10 evidence tables fit the 338px content width inside `.markdown-table-scroll` wrappers.

## Recent Validation

- Before this merge retry, 2026-06-01 automation had `npm run validate` passing and Phase 5 audit passing for 2026-06-01 through 2026-05-30.
- After resolving this merge, rerun `npm run build`, `npm run validate`, `npm run sources:phase5-audit -- --date 2026-06-01 --history-dir reports-data --days 3`, and publish dry-run.

## 2026-06-01 Evidence Over-Padding Correction

- User rejected the previous 10-table evidence treatment as forced visual padding.
- Removed all 10 `manual_table` evidence assets from the 2026-06-01 report.
- Added four source-backed figures only where the original pages contain relevant images:
  - `docs/assets/evidence/minimax-m3-paper-reproduction.png`
  - `docs/assets/evidence/nvidia-cosmos-3-architecture.webp`
  - `docs/assets/evidence/nvidia-doca-argus-architecture.webp`
  - `docs/assets/evidence/nvidia-alpamayo-workflow.webp`
- Added `evidence_assets_overpadded` in `src/report.js` so `report:write` rejects drafts that cover most main items with `manual_table` assets.
- Added unit coverage for that gate in `tests/unit.test.js`.
- Updated prompt/source rules to require original source figures first and to use constructed tables only for naturally structured data such as pricing, quota, benchmark, spec, or step matrices.
- Regenerated `reports-data/2026/06/2026-06-01.json`, `docs/data/2026/06/2026-06-01.json`, and `docs/reports/2026/06/2026-06-01.html`.
- Validation passed:
  - `npm run report:write -- .tmp/daily-report-2026-06-01-evidence-fixed.json reports-data 2026-06-01`
  - `npm run build`
  - `node --test tests\unit.test.js`
  - `node --test tests\skills.test.js`
  - `npm run validate`
  - `npm run sources:phase5-audit -- --date 2026-06-01 --history-dir reports-data --days 3`
  - `node scripts\harness-validate.mjs`
- Static artifact check: `manual_table_json:false`, `html_tables:0`, `markdown_images:4`, `evidence_image_paths_rendered:4`, `question_runs:false`.
- In-app browser could not automate the already-open `file://` page because Browser policy blocks file URL page actions. Visual E2E used a temporary localhost server serving the same `docs` directory, then closed it.
- Browser E2E metrics:
  - Desktop 1280x900: 0 tables, 4 images, 4 loaded images, all centered, no horizontal overflow.
  - Mobile 390x844: 0 tables, 4 images, 4 loaded images, all centered, no horizontal overflow.
- Screenshots:
  - `D:\ai-daily-cn\.tmp\evidence-check-2026-06-01-desktop.png`
  - `D:\ai-daily-cn\.tmp\evidence-check-2026-06-01-mobile.png`

## 2026-06-01 Source Icon Regression Fix

- Root cause: the previous icon fix accepted generated letter SVGs as "has an icon" and only covered several main-item sources. It did not verify that source-audit/feed rows resolved to cached bitmap favicons.
- Added `src/source-icon-cache.js` with cached bitmap favicons for high-frequency daily sources and domains. The cache now includes 69 source aliases and 50 normalized domains.
- Updated `src/interaction-report.js` to overlay the generated cache after legacy static fallback maps, so cached favicons win over generated letter SVGs.
- Added missing high-frequency source/feed aliases:
  - `Andrej Karpathy Blog`
  - `Tencent Hunyuan Blog`
  - `Ars Technica`
  - `HNRSS Frontpage`
  - `36Kr`
  - `QbitAI`
- Tightened `tests/unit.test.js`: the icon regression test now covers both main items and source-audit feed rows, requires bitmap data URIs, and rejects `data:image/svg+xml` fallback for those sources.
- Regenerated affected report HTML.
- Validation passed:
  - `node --test tests\unit.test.js`
  - `npm run build`
  - static HTML icon audit for `docs/reports/2026/06/2026-06-01.html`
  - `npm run validate`
  - in-app browser verification through temporary localhost serving `docs`
- Browser verification metrics for `2026-06-01.html`:
  - 123 inline site icons
  - 0 external SVG fallback icons
  - 0 broken icon images
  - remaining SVG icons are only internal controls: `日报导航`, `结构化 JSON`
