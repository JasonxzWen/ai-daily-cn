# Progress

## 2026-06-02 Daily Report Presentation Workflow Fixes

- Pulled latest `origin/main` before editing; local worktree fast-forwarded to current `main`.
- Updated `src/interaction-report.js` so the public daily page shows the coverage window in the hero, hides the standalone `模型发布` section, merges project recommendations into GitHub Trending highlights, removes visible source-name labels from main items, and keeps source identity through icons/links.
- Updated effective-interact rendering so `keyword-*` markers become bold colored text without backgrounds or borders, while `tag-*` markers render as typed colored tags.
- Updated daily CSS so main-item titles are larger and not underlined, keyword highlights are inline text, and tags/chips have distinct colors for importance, star deltas, project highlights, topics, and trend state.
- Updated legacy `src/render.js` so old helper rendering follows the same public section contract.
- Updated prompt modules and source-expansion documentation to lock in the new rules: no public model-release section, richer hot blog point summaries, GitHub stars as tags, and project highlights inside GitHub Trending.
- Expanded the 2026-06-02 hot blog summaries in `.tmp\daily-report.json`, regenerated `reports-data/2026/06/2026-06-02.json`, and rebuilt `docs/reports/2026/06/2026-06-02.html`.
- Updated tests for the new renderer contract and section structure.
- Added shared tag de-duplication so GitHub Trending items that are also project highlights do not show duplicate star tags.
- Follow-up hardening wrote the public report contract into `docs/codex-automation-setup.md` and `tasks/daily-publish-runbook.md`, and aligned `docs/ai-daily-source-expansion-spec.md` so model releases are a structured index and projects are GitHub Trending highlights.
- Added prompt-build assertions so future prompt edits must keep coverage-window wording, no public `模型发布`, no public `今日值得关注的项目`, star-change tags, and inline bold colored keyword rules.

## Validation

- `npm run report:write -- .tmp\daily-report.json reports-data 2026-06-02` passed.
- `npm run build` passed.
- `npm run test` passed with 153 tests.
- `npm run validate` passed: `sources:validate`, 153 tests, build, e2e, OpenSpec validation, and `git diff --check`.
- Playwright desktop and mobile checks passed for the 2026-06-02 page: coverage window present, no `模型发布`, no `今日值得关注的项目`, keyword highlights present, star tags present, project highlight present, no horizontal overflow.
- Final Playwright desktop and mobile checks passed for the 2026-06-02 page: zero duplicate star-tag items, zero visible broken images, and no horizontal overflow.
- After hardening docs/workflow/tests, rerun `node scripts\harness-validate.mjs` and `npm run validate`.

## Current State

- Changes are local and uncommitted.
- No publish or PR was performed in this run because the latest user request asked to update, optimize, and regenerate, not to push or publish.

## 2026-06-02 Image Lightbox Fix

- Added effective-interact lightbox support for body evidence images and hot blog/card media images.
- Kept source icons inert so favicon-style inline icons do not become clickable preview images.
- Updated prompt modules, automation setup docs, source expansion spec, and the daily runbook so future reports require clickable enlarged images.
- Added generator-level and e2e regression coverage for image lightbox behavior.

## 2026-06-02 GitHub Trending Highlight Fix

- Changed GitHub Trending project highlighting from a separate `项目 highlights` subheading/list to tag-only treatment on matching Top 10 Trending items.
- Removed the hero-level `项目高亮` stat so project highlight no longer feels like its own board.
- Updated prompt modules, automation docs, source expansion spec, daily runbook, unit tests, and e2e checks to forbid standalone project highlight subsections or extra project lists.
