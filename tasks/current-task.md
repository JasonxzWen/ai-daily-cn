# Current Task

## Task Class

non-trivial

## Spec

### Goal

Add a durable feedback-memory and regression self-check mechanism so user-reported issues are not only recorded, but are reviewed at the start of future work and checked before delivery.

### User-Visible Behavior

- A human-readable quick reference lists prior user-confirmed problems, fixes, validation hooks, and future self-check prompts.
- Project instructions require Codex to review `config/feedback-ledger.json` and the quick reference before non-trivial edits, and to record the review in the active task spec.
- `tasks/current-task.md` and the reusable SDD/TDD template include mandatory `Feedback Ledger Review` and `Regression Self-Check` sections.
- `node scripts/harness-validate.mjs` fails non-trivial tasks that omit meaningful feedback review or regression self-check content.
- `config/feedback-ledger.json` records this new P1 rule and binds it to a real test/validation gate.

### Boundaries

- Keep existing daily publish and feedback-ledger contracts intact.
- Do not execute `git pull`, commit, push, change remotes, or change automation configuration.
- Treat "update to latest version" as updating this repository's active norms to the latest feedback-memory contract, not syncing a remote branch.

### Non-Goals

- Do not redesign the daily report UI or source-discovery pipeline.
- Do not edit generated public daily report HTML by hand.
- Do not invent persistent model memory outside repository files and validation gates.

## Acceptance Criteria

- `docs/feedback-buglist-quick-reference.md` summarizes all current `config/feedback-ledger.json` items as problem, fix, validation, and self-check reminders.
- `AGENTS.md`, `definition-of-done.md`, `clean-state-checklist.md`, and `tasks/templates/sdd-tdd-task.md` document the mandatory feedback review and regression self-check flow.
- `scripts/harness-validate.mjs` requires non-trivial tasks to include meaningful `Feedback Ledger Review` and `Regression Self-Check` sections.
- `tests/unit.test.js` contains focused red/green tests for the new harness requirements and for the ledger item binding.
- `config/feedback-ledger.json` includes a P1 item for the mandatory feedback-memory/self-check mechanism, with validation covered by `npm run validate`.
- Focused red tests fail before implementation and pass after implementation.
- `node scripts/harness-validate.mjs`, `node scripts/validate-feedback-contract.mjs`, `npm run validate`, and `git diff --check` pass.

## Feedback Ledger Review

- Existing durable feedback memory is `config/feedback-ledger.json`; it already contains P1 items for optimization suggestions, ledger validation, origin/main freshness, clean publish checkout, source outages, search partials, clean JSON output, visible main bullets, first-level main navigation, domestic visibility, and AI-ready quality review.
- Missing mechanism found in this review: non-trivial task specs are not yet forced to record that the ledger was reviewed, and future self-checks are not yet a harness-enforced section.
- This task will add a human quick reference and harness validation so future work must explicitly compare against the ledger before implementation and before handoff.

## Regression Self-Check

- Before implementation, add tests that prove a non-trivial current task without `Feedback Ledger Review` or without `Regression Self-Check` fails harness validation.
- After implementation, confirm this task's own `Feedback Ledger Review` and `Regression Self-Check` sections are meaningful and pass `node scripts/harness-validate.mjs`.
- Before final handoff, verify the quick reference covers every current ledger item and that the new P1 ledger entry is bound to an existing test.
- Actual self-check completed: `docs/feedback-buglist-quick-reference.md` lists every current ledger item including `feedback/p1-feedback-memory-self-check`; strict follow-up found that this coverage was only checked by a one-off command, so `scripts/harness-validate.mjs` now enforces quick-reference coverage for every ledger ID. Focused drift test passes; `node scripts/harness-validate.mjs` passes; `node scripts/validate-feedback-contract.mjs` passes; `npm run validate` passes with 258 tests and build `written_files: []`.

## Red Test

Run before implementation after adding focused tests:

```powershell
node --test tests/unit.test.js --test-name-pattern "feedback memory self-check"
```

Expected initial failure:

- The new tests fail because `scripts/harness-validate.mjs` does not yet require `Feedback Ledger Review` or `Regression Self-Check`, and the new P1 ledger binding does not yet exist.

Actual initial failure before implementation:

- First run failed before test execution because local dependencies were missing: `ERR_MODULE_NOT_FOUND` for package `ajv`. Ran `npm install` from the checked-in lockfile to restore the test environment.
- Second run reached the focused tests and failed as expected: `node --test tests/unit.test.js --test-name-pattern "feedback memory self-check"` exited non-zero with 196 subtests, 193 pass, 3 fail. The failing tests were the missing `Feedback Ledger Review` rejection, missing `Regression Self-Check` rejection, and missing `feedback/p1-feedback-memory-self-check` ledger binding.

## Deterministic Substitute

Not used. The new contract is directly testable through unit tests and the harness validator.

## Allowed Paths

- `AGENTS.md`
- `clean-state-checklist.md`
- `config/feedback-ledger.json`
- `definition-of-done.md`
- `docs/feedback-buglist-quick-reference.md`
- `progress.md`
- `scripts/harness-validate.mjs`
- `session-handoff.md`
- `tasks/current-task.md`
- `tasks/templates/sdd-tdd-task.md`
- `tests/unit.test.js`
- `.codex/skills/effective-interact/artifacts/**`

## Forbidden Paths

- Do not modify generated public daily report HTML by hand.
- Do not change remote Pages settings.
- Do not modify Codex automation configuration.
- Do not commit, push, or create a PR unless explicitly requested.
- Do not reset hard, stash, clean, or overwrite unrelated user changes.

## Validation Commands

- `node --test tests/unit.test.js --test-name-pattern "feedback memory self-check"`
- `node scripts/harness-validate.mjs`
- `node scripts/validate-feedback-contract.mjs`
- `npm run validate`
- `git diff --check`

## Parallel Writes

- No parallel writes. Manual edits use `apply_patch`; generated ignored artifacts may be produced only for final reporting.

## Handoff Requirements

- Report the direct answer: implicit model memory is not sufficient; repository ledger plus harness validation is the durable mechanism.
- Report quick reference location and the new mandatory current-task sections.
- Report red/green evidence and validation command results.
- Report changed files, residual risks, and any follow-up needed.

## Spec Updates

- Strict self-check found that quick-reference/ledger coverage needed to be a durable validation gate, not a one-off command. Added harness validation and focused test coverage for missing ledger IDs in `docs/feedback-buglist-quick-reference.md`.
