# Progress

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
  - `docs/index.html` contains `近 7 日趋势`, `按年月周导航`, and `trends.json`.
  - `docs/reports/2026/05/2026-05-29.html` contains `日报导航` and scoped `coding agent: 7d ...` tags.
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

## 2026-05-29 Validation

- `node --test tests/unit.test.js tests/publish.test.js tests/skills.test.js` passed.
- `npm run validate` passed after final evidence asset and renderer changes.
- `node scripts\harness-validate.mjs` passed.
- Browser render check passed for the 2026-05-29 report: quality/evidence sections present, 2 evidence images loaded, 4 inline site icons loaded.
- `planGeneratedFiles` includes both `assets/evidence/*` files for publish planning.

## Current State

- Repo-local harness files have been initialized from the latest `JasonxzWen/skill-hub` `origin/main` template.
- Existing project `AGENTS.md` was preserved and extended with the minimal Codex harness markers.
- The installed `.codex/skills/effective-interact` skill was refreshed with compatible upstream Skill Hub updates.
- Daily publish operation is now the primary harness use case: feature inventory, runbook, task template, clean-state checklist, definition of done, and harness validation all reference the publish path.
- `tasks/current-task.md` has been reset to a neutral "no active task" entry point for future daily publish runs.

## Recent Validation

- `node scripts/harness-validate.mjs` passed.
- `feature_list.json` JSON parse passed.
- `git diff --check` passed.
- `harness-hub validate-harness <repo> --json` from a temporary Skill Hub `origin/main` export passed.
- `node --test tests/skills.test.js` passed.
- `npm run validate` passed.

## Notes

- `skill-hub init-harness --dry-run` identified existing `AGENTS.md` as a blocker, so the harness is integrated without overwriting project-specific instructions.
- The upstream `create-interaction.mjs` and `interaction-ui.css` changes were not retained because they regressed this project's existing hero and project-card smoke tests.
- `scripts/harness-validate.mjs` now checks daily publish package scripts, runbook sections, task template markers, and required daily publish feature IDs.
