# Progress

## Current State

- Active task: complete the content-upgrade rollout, then regenerate, verify, PR, and publish the `2026-06-08` daily report.
- Branch state: `codex/daily-content-upgrade`.
- Release state: content and test changes are ready for PR, but final artifact generation is blocked on the repository rule that `report:write` must run from the latest `origin/main`.
- Current focus: commit the branch changes, push, open a PR, then continue from a clean `origin/main` checkout for the final generation and publish path.

## Completed

- Reviewed `config/feedback-ledger.json` and `docs/feedback-buglist-quick-reference.md`, then rewrote `tasks/current-task.md` into an execution spec with ROI ordering, validation gates, and browser acceptance criteria.
- Kept the public-report direction aligned with `docs/daily-content-iteration-history.md` and `docs/daily-content-good-bad-cases.md`.
- Tightened `src/draft.js` so that:
  - main news stays in `3-5` factual bullets instead of `变化 / 落点 / 为什么重要 / watch_next`
  - low-value consumer AI feature rollouts stay out of `main_items`
  - hot blogs prefer concrete article material over generic feed announcements
  - community leads dedupe same-topic repeats and use cleaner reader-facing summaries
  - specific main-item and hot-blog cases use less generic, more concrete copy
- Extended regression coverage in `tests/unit.test.js` for:
  - specific hot-blog preference
  - duplicate community-topic dedupe
  - minor consumer AI rollout exclusion from main items
- Re-ran discovery-backed drafting for `2026-06-08` and confirmed the generated draft now:
  - removes the Amazon Alexa merch item from `main_items`
  - keeps only the WhatsApp spyware and UK sovereign AI items in main news
  - upgrades the hot-blog set to RocketMQ / AgentScope Java / Tokenmaxxing
  - removes duplicate `OpenAI super app` community leads
  - upgrades weak generic community fallback copy for the Ars climate/AI article

## Validation Records

| Command | Status | Evidence |
|---|---|---|
| `node --test tests/unit.test.js --test-name-pattern "report:draft rewrites Builder English fallbacks and strips community intermediary boilerplate|report:draft prefers specific hot blog evidence over generic feed announcements|report:draft filters unreadable blog titles and low-signal community leads|report:draft dedupes duplicate community topics and keeps reader-facing summaries|report:draft keeps minor consumer AI feature rollouts out of main_items|report:draft limits low-signal vendor partnership items in main coverage|quality review flags generic main item reader-guidance bullets|quality review rejects templated hot blog summaries even when length and Chinese ratio pass"` | pass | All targeted draft/quality regressions passed after the selection and copy fixes. |
| `node --test tests/e2e/site.e2e.js` | pass | Public card layout, media rendering, and mobile collapse behavior remained green. |
| `node src/cli.js report:draft --date 2026-06-08 --input .tmp/github-trending-2026-06-08.json,.tmp/builders-2026-06-08.json,.tmp/content-sources-2026-06-08.json,.tmp/statuspage-incidents-2026-06-08.json,.tmp/search-news-2026-06-08.json,.tmp/sources-health-2026-06-08.json --output .tmp/daily-report-2026-06-08.json --candidate-output .tmp/source-candidates-2026-06-08.json` | pass | Draft regenerated with `main_items: 2`, `hot_blogs: 3`, `community_leads: 8`, `evidence_assets: 13`. |
| `npm run quality:review -- .tmp/daily-report-2026-06-08.json .tmp/quality-review-2026-06-08.json .tmp/source-candidates-2026-06-08.json` | pass with warning | Only remaining issue is `highlight_missing` warning; editorial-quality checks passed. |
| `npm run report:write -- .tmp/daily-report-2026-06-08.json reports-data 2026-06-08` | blocked by gate | Fails with `automation_revision_gate_failed` because the draft is not being written from the latest `origin/main`. |
| `npm run validate` | pass | Full repository validation passed, including harness validation, all tests, build, privacy scan, e2e, and `git diff --check`. |

## Pending

- Stage the current branch changes and create a commit for the content-upgrade work.
- Push `codex/daily-content-upgrade` and open a PR.
- Merge the branch so the new logic exists on `origin/main`.
- From the clean publish checkout on latest `origin/main`, rerun:
  - `report:draft`
  - `quality:review`
  - `report:write`
  - `build`
  - `quality:page-check`
  - browser acceptance for `docs/reports/2026/06/2026-06-08.html`
  - `publish:dry-run:daily`
  - real publish

## Blockers

- No product or test blocker remains on the content-upgrade logic itself.
- Final artifact generation and publish remain blocked until the changes are present on latest `origin/main`, because `report:write` enforces the automation revision / baseline proof gate.
