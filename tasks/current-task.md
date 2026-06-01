# Current Task

## Goal

Fix the remaining source icon regression in the 2026-06-01 AI daily page: external links must resolve to cached bitmap favicons instead of generated letter SVG fallbacks, and the regression test must cover both main items and source-audit feed rows.

## Status

Completed locally; no publish, push, commit, reset, or stash was run.

## Root Cause

- The previous repair treated "has any icon" as success, so generated `data:image/svg+xml` letter badges passed.
- The coverage focused on main items and missed source-audit/feed rows such as `36Kr`, `QbitAI`, `HNRSS Frontpage`, `Ars Technica`, `Tencent Hunyuan Blog`, and `Andrej Karpathy Blog`.
- Legacy fallback maps in `src/interaction-report.js` could still win unless the generated favicon cache was overlaid after those maps.

## Scope

- Add/refresh the generated favicon cache.
- Ensure cached favicons override legacy generated letter fallbacks.
- Add regression coverage for high-frequency source names in both main-item and source-audit rendering.
- Regenerate affected HTML pages.
- Verify by unit tests, full validation, static HTML icon audit, and in-app browser DOM checks.

## Acceptance Criteria

- `docs/reports/2026/06/2026-06-01.html` has 0 external `data:image/svg+xml` source icon fallbacks.
- Browser DOM check reports 0 broken inline site icons.
- Remaining SVG icons, if any, are limited to internal controls such as `日报导航` and `结构化 JSON`.
- `tests/unit.test.js` fails if the high-frequency source list falls back to generated SVG initials.
- `npm run validate` passes.

## Validation Commands

- `node --test tests\unit.test.js`
- `npm run build`
- Static icon audit against `docs/reports/2026/06/2026-06-01.html`
- `npm run validate`
- In-app browser verification through a temporary localhost server serving `D:\ai-daily-cn\docs`

## Completion Notes

- Added `src/source-icon-cache.js` with 69 source aliases and 50 normalized domains.
- Updated `src/interaction-report.js` to overlay `CACHED_SOURCE_ICONS` and `CACHED_DOMAIN_ICONS` after legacy fallback maps.
- Added/covered missing aliases:
  - `Andrej Karpathy Blog`
  - `Tencent Hunyuan Blog`
  - `Ars Technica`
  - `HNRSS Frontpage`
  - `36Kr`
  - `QbitAI`
- `npm run validate` passed.
- Browser DOM metrics for 2026-06-01:
  - 123 inline site icons
  - 0 external SVG fallback icons
  - 0 broken icons
  - SVG fallback remains only for internal controls: `日报导航`, `结构化 JSON`
