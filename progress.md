# Progress

## 2026-06-04 Codex-Native Daily Runner

- User chose a full automation runner instead of a thin checklist-only workflow. Real publish is allowed only through explicit runner publish mode.
- Cleaned residual harness artifacts from `.tmp/` after verifying targets stayed inside the workspace; preserved `.tmp/source-cache`.
- Added `daily:run`, backed by `src/daily-runner.js`. The runner starts from the launcher worktree, prepares a clean publish checkout, runs deterministic stages from that clean checkout, writes `.tmp/run-summary-YYYY-MM-DD.json`, and reports `next_action`.
- Extended `daily:run` into a resumable state machine: if `final_status:"needs_ai_repair"` and Codex writes the requested repair contract, rerunning the same command applies `quality:repair`, reviews `.tmp/daily-report.optimized.json`, and continues through `report:write`, `build`, `quality:page-check`, `validate`, `sources:phase5-audit`, `publish:dry-run:daily`, and real publish when `--publish` is set.
- Added explicit `--restart` handling for intentionally discarding same-date runner state, while preserving pending repair state if a rerun uses the wrong mode.
- Added `config/daily-workflow-contract.json`, `src/workflow-contract.js`, and `scripts/validate-daily-workflow-contract.mjs`; `npm run workflow:validate` is included in `npm run validate`.
- Added strict `publish:dry-run:daily`, which requires `--date YYYY-MM-DD` and is the only dry-run command allowed for scheduled runs; legacy `publish:dry-run` remains for manual diagnostics.
- Updated the local automation prompt at `C:\Users\Admin\.codex\automations\ai-daily\automation.toml` to call `npm run daily:run -- --date YYYY-MM-DD --publish` and handle runner `next_action`.
- Replaced the old manual publish prompt module with a thin Codex-native runner contract and updated the runbook, automation setup doc, task template, and workflow contract markers to require `daily:run`, `publish:dry-run:daily`, `sources:phase5-audit`, and `--restart`.
- Updated `report:draft` output so generated auto drafts no longer trigger autodraft template wording issues, and synchronized schema support for `community_leads[].candidate_id`.
- Validation passed: `node --test tests/unit.test.js --test-name-pattern "daily workflow contract|daily runner|report:draft 从发现候选池"` (Node ran the full unit file, 143/143), `node --test tests/publish.test.js --test-name-pattern "daily dry-run"` (full publish file, 40/40), `npm run workflow:validate`, external automation contract smoke via `node scripts\validate-daily-workflow-contract.mjs --automation-prompt C:\Users\Admin\.codex\automations\ai-daily\automation.toml`, `node scripts\harness-validate.mjs`, and full `npm run validate` (200 tests; build wrote no files).
- Post-validate cleanup removed the regenerated `.tmp/effective-interact-daily-*` scratch directory; `.tmp` now only retains `source-cache`.
- Latest validation passed after runner resume and documentation convergence: `node --test tests/unit.test.js --test-name-pattern "daily runner"`, `node --test tests/unit.test.js --test-name-pattern "prompt:build"`, `npm run workflow:validate`, `node scripts\harness-validate.mjs`, and full `npm run validate` (203 tests; build wrote no files).
- Post-validation cleanup removed `.tmp/effective-interact-daily-84228`; `.tmp` now only retains `source-cache`.

## 2026-06-04 Dedicated Publish Checkout

- User accepted moving scheduled daily report generation and publishing to a dedicated clean `origin/main` checkout, with workflow/code/checklist iteration handled separately from scheduled runs.
- Added `publish:prepare-clean-worktree`, which prepares `.tmp/publish-worktrees/main` from remote `main` without committing, stashing, switching, or cleaning the launcher worktree.
- Updated scheduled automation prompt, `tasks/daily-publish-runbook.md`, `docs/codex-automation-setup.md`, `docs/ai-daily-publish-hardening.md`, `tasks/templates/daily-publish-task.md`, and `prompts/ai-daily/modules/publish-workflow.md` so automation switches to `prepared.next_cwd` before generation and uses date-scoped `publish:dry-run -- --date YYYY-MM-DD`.
- Synced the new workflow with the quality review loop: scheduled runs must record `quality:review`, optional `quality:repair`, `quality:page-check`, full `validate`, and publish result.
- Validation passed: `node --test tests/publish.test.js --test-name-pattern "prepare-clean-worktree"` (Node ran the full publish test file, 39/39 passing), `node --check src/publish.js`, `node --check src/cli.js`, `node scripts/harness-validate.mjs`, and `npm run validate` (196 tests; build wrote no files).

## 2026-06-04 AI Quality Review Loop

- Worktree: `C:\Users\Admin\.codex\worktrees\3e2a\ai-daily-cn`.
- User request: implement the proposed AI-ready quality review and automatic page checklist workflow for daily reports.
- Follow-up request: update the branch to the latest PR, inspect incremental changes for checklist gaps, and report the two-stage checklist by section.
- Updated branch `codex/daily-report-feedback-hardening` from `73ef2b5` to `392077c` (`origin/main`), which includes merged PR #32 `[codex] Automate AI daily drafting`.
- Planned behavior: after `.tmp/daily-report.json`, run draft quality review; apply safe repairs or restricted AI repair contracts only to public text fields; then run `report:write`, `build`, targeted Playwright page checklist, `npm run validate`, and `publish:dry-run` before any real publish.
- Added tests for detecting AI-tone/stock phrasing, oversized highlights, Builder translation/content drift, safe repairs, and repair-contract field restrictions.
- Added incremental stage-one checklist coverage for PR #32: automatic `report:draft` template prose is now a blocking quality issue with an AI rewrite task, and automatic draft reviews require `.tmp/source-candidates-YYYY-MM-DD.json` so selected public items are checked against included candidate-pool entries.
- Added e2e coverage hook for a reusable daily page checklist.
- Added P1 feedback ledger entry `feedback/p1-ai-quality-review-loop` so the workflow remains durable.
- Added npm scripts: `quality:review`, `quality:repair`, and `quality:page-check`.
- Validation passed: `node --test tests/unit.test.js --test-name-pattern "quality review|quality repair|AI repair contract"`, `npm run quality:review -- tests/fixtures/reports/good/structured-draft.json .tmp/quality-review-candidate-smoke.json tests/fixtures/reports/good/structured-draft.candidates.json`, `npm run quality:repair -- tests/fixtures/reports/good/structured-draft.json .tmp/structured-draft.optimized.json .tmp/quality-repair-candidate-smoke.json tests/fixtures/reports/good/structured-draft.candidates.json`, `npm run validate`, `npm run quality:page-check -- 2026-06-03 docs .tmp/page-check-2026-06-03-after-pr32.json`, desktop/mobile screenshot inspection for `.tmp/page-check-2026-06-03-*.png`, `node scripts/harness-validate.mjs`, and `git diff --check`.
- `npm run validate` regenerated historical `docs/reports/**` HTML from existing data; these are generated artifacts, not manual edits.

## 2026-06-02 Feedback Durability Gate PR

- Worktree: `C:\Users\Admin\.codex\worktrees\406c\ai-daily-cn`.
- Branch: `codex/feedback-durability-gates`.
- PR: https://github.com/JasonxzWen/ai-daily-cn/pull/20
- User request: create a PR against `main` and merge it when repository policy allows.
- Latest base after fetch: `origin/main` at `1e0681e [codex] Codify durable AI daily workflow (#19)`.
- Rebase conflict scope: only harness state files (`progress.md`, `session-handoff.md`, `tasks/current-task.md`).
- Goal: make user-confirmed recurring feedback durable across new sessions, PR merges, and scheduled AI daily publish runs.
- User decisions encoded: persistent feedback is P1 by default; P1 gates must run in `npm run validate`; `report:write` and `publish:dry-run` must reuse checks where they affect generation or publishing.
- Added `config/feedback-ledger.json` with three implemented P1 items: canonical `optimization_suggestions`, ledger validation binding, and latest `origin/main` generation proof.
- Added `src/feedback-contract.js` and `scripts/validate-feedback-contract.mjs`; `npm run validate` now starts with `npm run feedback:validate`.
- Tightened `self_check.optimization_suggestions`: new report writes normalize to `issue`, `evidence`, `module`, `suggestion`, `expected_benefit`, `requires_user_confirmation`; schema still accepts observed historical shapes so old reports continue to build.
- Added `origin_main_sha` / `origin_main_short` to automation revision metadata and made strict publish quality block reports not generated from the current `origin/main` baseline.
- Wired `publish:dry-run`, real `publish`, GitHub API fallback, preflight, and resume-push to use the same current automation revision proof.
- Updated prompt modules, runbook, automation setup docs, Definition of Done, and feature list so future sessions see the same durability contract.
- Validation before PR creation passed: `npm run feedback:validate`, `node --test tests\unit.test.js tests\publish.test.js`, `npm run build`, `npm run validate` (170 tests; build wrote no files), and `node scripts\harness-validate.mjs`.
- Effective-interact handoff report generated and validated at `.codex/skills/effective-interact/artifacts/feedback-durability-gate-implementation.html`; browser validation covered 390, 768, and 1440 px viewports with no overlaps, clipped text, or horizontal overflow.
- Post-rebase validation passed: `npm run feedback:validate`, `node --test tests\unit.test.js tests\publish.test.js`, `npm run validate` (172 tests; build wrote no files), and `node scripts\harness-validate.mjs`.

## 2026-06-02 Durable Daily Workflow PR

- PR #19 is now on `origin/main` at `1e0681e`.
- Preserved upstream durable daily workflow behavior remains part of the base: coverage-window hero text, inline keyword highlights, typed tags/chips, no public model-release section, GitHub Trending Top 10, evidence-image lightbox, Builder original text/full translation handling, and strict Builder publish-quality blocking.
- Prior PR #19 validation covered `node --test tests/unit.test.js`, `npm run validate`, `node scripts/harness-validate.mjs`, conflict-marker scan, `git diff --check`, and desktop/mobile Playwright visual checks for `docs/reports/2026/06/2026-06-02.html`.
