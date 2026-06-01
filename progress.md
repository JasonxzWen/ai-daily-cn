# Progress

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

## Recent Validation

- Before this merge retry, 2026-06-01 automation had `npm run validate` passing and Phase 5 audit passing for 2026-06-01 through 2026-05-30.
- After resolving this merge, rerun `npm run build`, `npm run validate`, `npm run sources:phase5-audit -- --date 2026-06-01 --history-dir reports-data --days 3`, and publish dry-run.
