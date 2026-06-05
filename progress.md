# Progress

## Current State

- Active task: 21:30 AI daily status self-check and automation hardening.
- Branch: `codex/status-self-check-hardening`.
- App-visible 02:30 daily generation automation is active as `ai-2`.
- New 21:30 status self-check automation is active as `ai`.
- Old legacy automations `ai-daily` and `ai-push-github-pages` are paused.

## Completed

- Added `src/status-self-check.js` and `npm run status:self-check`.
- Added external automation inventory inspection and wired it into workflow contract validation.
- Updated workflow contract, runbook, automation setup docs, prompt module, and task template with the 21:30 self-check contract.
- Refactored duplicated npm invocation helpers into `src/process-runner.js`.
- Refactored duplicated URL identity normalization into `src/url.js`.
- Updated affected draft, quality, evidence, report, and render paths to use the shared URL helper.
- Added unit tests for self-check blocking/degraded outcomes, clean-worktree dry-run roots, shared URL identity, Windows npm invocation, and deterministic workflow contract validation.
- Created active 02:30 daily generation automation `ai-2`, created active 21:30 `status:self-check` automation `ai`, and paused legacy `ai-daily` / `ai-push-github-pages` automations.
- Restored `docs/data/**` changes produced by validation/build because they only added generated empty `daily_tracking` defaults and are unrelated to this task.

## Validation Records

| Command | Status | Evidence |
|---|---|---|
| `node --test tests/unit.test.js --test-name-pattern "status:self-check|shared URL identity|shared npm invocation|daily workflow contract|report:draft skips recent"` | pass | 155 tests passed, 0 failed. |
| `npm run workflow:validate` | pass | Contract and real automation inventory passed; active publish is `ai-2`, active self-check is `ai`. |
| `npm run validate` | pass | Feedback, workflow, sources, 213 tests, build, privacy, e2e, OpenSpec, and diff-check passed. |
| `git diff --check` | pass | No whitespace errors. |
| `node scripts/harness-validate.mjs` | pass | Harness validation passed after required task-state sections were restored. |

## Pending

- None.

## Blockers

- None.
