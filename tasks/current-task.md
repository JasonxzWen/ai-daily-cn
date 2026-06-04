# Current Task

## Goal

Harden the daily automation workflow so scheduled report generation and publishing run from a dedicated clean `origin/main` checkout, while preserving the AI-ready quality review loop before publish.

## Worktree

- Path: `C:\Users\Admin\.codex\worktrees\3e2a\ai-daily-cn`
- Git state: branch `codex/daily-report-feedback-hardening` at `392077c` (`origin/main`, includes PR #32)

## User Decisions

- Token cost is acceptable for quality review.
- AI/Codex may improve public wording, but must not change URLs, dates, source names, `candidate_id`, `source_audit`, evidence paths, or publish metadata.
- Real publish is allowed through the explicit runner publish mode: `npm run daily:run -- --date YYYY-MM-DD --publish`.
- The runner has two explicit modes: default dry-run-only and `--publish`; publish mode may run at most 5 review -> AI repair contract -> repair -> review loops, while non-publish defaults to 1 loop.
- User accepted moving scheduled daily runs behind a runner-managed dedicated clean main checkout / temporary clone, with workflow and code iteration handled by separate PRs.
- User authorized updating the scheduled automation prompt to use the Codex-native runner boundary.

## Scope

- Add local quality review and repair commands.
- Add a restricted AI repair contract gate.
- Require automatic `report:draft` reviews to include the source candidate pool and flag remaining autodraft template wording.
- Add a Playwright page checklist for affected daily HTML pages.
- Update daily runbook and P1 feedback ledger so the workflow is durable.
- Add a scheduled automation entrypoint that starts from the launcher worktree, lets the runner prepare `.tmp/publish-worktrees/main` from current `origin/main`, and avoids committing, stashing, switching, or cleaning the launcher worktree.
- Sync the runbook, automation prompt, prompt module, and task template so scheduled runs use `daily:run`, runner state, and date-scoped `publish:dry-run:daily`.
- Preserve existing report schema, source gates, publish safety gates, and effective-interact rendering mode.

## Allowed paths

- `config/feedback-ledger.json`
- `config/daily-workflow-contract.json`
- `package.json`
- `schemas/report.schema.json`
- `src/**`
- `scripts/**`
- `tests/**`
- `tasks/current-task.md`
- `tasks/daily-publish-runbook.md`
- `tasks/templates/daily-publish-task.md`
- `docs/codex-automation-setup.md`
- `docs/ai-daily-publish-hardening.md`
- `prompts/ai-daily/modules/publish-workflow.md`
- `progress.md`
- `session-handoff.md`
- `C:\Users\Admin\.codex\automations\ai-daily\automation.toml` only for the authorized clean checkout prompt update
- generated `docs/reports/**` only when produced by `npm run build` during validation

## Forbidden paths

- Do not modify remote Pages settings.
- Do not modify schedule, model, CWD, or other automation metadata beyond the authorized prompt update.
- Do not hand-edit generated public report HTML.
- Do not commit, push, or publish unless the user explicitly authorizes it.

## Validation commands

- `node --test tests/unit.test.js --test-name-pattern "quality"`
- `node --test tests/unit.test.js --test-name-pattern "daily workflow contract|daily runner|report:draft"`
- `node --test tests/publish.test.js --test-name-pattern "daily dry-run"`
- `npm run workflow:validate`
- `npm run test:e2e`
- `npm run feedback:validate`
- `npm run validate`
- `node scripts/harness-validate.mjs`
- `node --test tests/publish.test.js --test-name-pattern "prepare-clean-worktree"`

## Parallel writes

- No parallel writes. Manual edits use `apply_patch`; generated output may come from validation/build commands.

## Handoff requirements

- Summarize added commands and workflow order.
- Report all validation commands and results.
- Call out any generated public HTML changes from `npm run build`.
- Do not report publish or PR actions unless they were explicitly requested and completed.

## Current Status

- Tests for quality review, safe repair, restricted repair contracts, and page checklist have been added.
- Implementation is complete.
- Added `publish:prepare-clean-worktree` to prepare a dedicated clean checkout under `.tmp/publish-worktrees/main`; it is now an internal runner step and manual diagnostic command, not the scheduled entrypoint.
- Updated the scheduled automation prompt, runbook, prompt module, task template, and publish hardening doc to use launcher-started `daily:run`, runner state, quality review, `sources:phase5-audit`, and date-scoped `publish:dry-run:daily`.
- Cleaned residual harness artifacts from `.tmp/`: effective-interact scratch runs, page-check screenshots/JSON, quality smoke JSON, and optimized draft smoke files. Preserved `.tmp/source-cache`.
- Added `config/daily-workflow-contract.json`, `src/workflow-contract.js`, and `scripts/validate-daily-workflow-contract.mjs`; `npm run workflow:validate` is now part of `npm run validate` and also smoke-checks the local automation prompt when present.
- Added `src/daily-runner.js` and `daily:run`. The runner starts from the launcher worktree, prepares the clean checkout, runs deterministic stages in the clean checkout, writes `.tmp/run-summary-YYYY-MM-DD.json`, emits `next_action` for Codex-native AI repair contracts, resumes from completed repair contracts, and supports explicit `--restart`.
- Added `publish:dry-run:daily`, a strict date-required scheduled dry-run wrapper around the publish plan; old `publish:dry-run` remains for manual diagnostics.
- Updated `report:draft` automatic public prose so generated drafts no longer trip the autodraft template quality gate, and allowed `community_leads[].candidate_id` in the report schema so all selected public items can back-reference the candidate pool.
- Replaced the local scheduled automation prompt at `C:\Users\Admin\.codex\automations\ai-daily\automation.toml` with a thin Codex-native runner prompt; schedule/model/CWD metadata were preserved.
- Final validation passed: `node --test tests/unit.test.js --test-name-pattern "daily workflow contract|daily runner|report:draft 从发现候选池"` (full unit file, 143/143), `node --test tests/publish.test.js --test-name-pattern "daily dry-run"` (full publish file, 40/40), `npm run workflow:validate`, external automation contract smoke, `node scripts/harness-validate.mjs`, and full `npm run validate` (200 tests; build wrote no files).
- Post-validation cleanup removed the regenerated `.tmp/effective-interact-daily-*` scratch directory; `.tmp` only keeps `source-cache`.
- Validation passed for this update: `node --test tests/publish.test.js --test-name-pattern "prepare-clean-worktree"` (Node ran the full publish test file; 39/39 passed), `node --check src/publish.js`, `node --check src/cli.js`, `node scripts/harness-validate.mjs`, and `npm run validate` (196 tests; build wrote no files).
- Latest PR baseline checked: PR #32 `[codex] Automate AI daily drafting` was merged into `main` at `2026-06-04T05:30:06Z`; local branch fast-forwarded to `392077c`.
- Incremental checklist decision: added stage-one checks for autodraft template prose and candidate-pool back-references; no new stage-two page checklist item was needed because existing page checks cover evidence images, layout, sections, links, and overflow.
- Validation passed: `node --test tests/unit.test.js --test-name-pattern "quality review|quality repair|AI repair contract"`, `npm run quality:review -- tests/fixtures/reports/good/structured-draft.json .tmp/quality-review-candidate-smoke.json tests/fixtures/reports/good/structured-draft.candidates.json`, `npm run quality:repair -- tests/fixtures/reports/good/structured-draft.json .tmp/structured-draft.optimized.json .tmp/quality-repair-candidate-smoke.json tests/fixtures/reports/good/structured-draft.candidates.json`, `npm run validate`, `npm run quality:page-check -- 2026-06-03 docs .tmp/page-check-2026-06-03-after-pr32.json`, screenshot inspection for `.tmp/page-check-2026-06-03-desktop.png` and `.tmp/page-check-2026-06-03-mobile.png`, `node scripts/harness-validate.mjs`, and `git diff --check`.
- `npm run validate` regenerated historical `docs/reports/**` HTML files from existing report data; these are generated artifacts, not manual edits.
- Latest runner completion: `daily:run` now resumes after Codex writes the AI repair contract, preserves review budget across resumes, uses `.tmp/daily-report.optimized.json` for post-repair `report:write`, runs `sources:phase5-audit` before dry-run/publish completion, and supports explicit `--restart`.
- Latest validation passed: `node --test tests/unit.test.js --test-name-pattern "daily runner"`, `node --test tests/unit.test.js --test-name-pattern "prompt:build"`, `npm run workflow:validate`, `node scripts/harness-validate.mjs`, and full `npm run validate` (203 tests; build wrote no files).
- Post-validation cleanup removed the regenerated `.tmp/effective-interact-daily-84228` scratch directory; `.tmp` only keeps `source-cache`.
