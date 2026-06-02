# Current Task

## Goal

Create and merge a PR against `main` for the first P1 feedback durability gate for AI daily generation, so user-confirmed recurring feedback survives new sessions, PR merges, and scheduled publish runs.

## Branch

- Worktree: `C:\Users\Admin\.codex\worktrees\406c\ai-daily-cn`
- Branch: `codex/feedback-durability-gates`
- PR: https://github.com/JasonxzWen/ai-daily-cn/pull/20
- Base after update: latest `origin/main` at `1e0681e [codex] Codify durable AI daily workflow (#19)`
- Local commit being rebased: `265986f fix: add durable feedback validation gates`

## User Decisions

- User-confirmed feedback that must persist is P1 by default.
- P1 feedback gates must run in `npm run validate`.
- `report:write` and `publish:dry-run` must reuse the same checks where they affect report generation or publishing.
- First scope is limited to:
  - normalize `self_check.optimization_suggestions`;
  - require confirmed feedback to live in a ledger and bind to tests or gates;
  - require daily generation/publish metadata to prove the latest `origin/main` baseline, not only local `main`.

## Acceptance Criteria

- `optimization_suggestions` has a concrete schema and normalizer; historical compatible shapes may render, but new report writes produce canonical fields.
- A committed feedback ledger records the three P1 feedback items and each item has deterministic validation evidence.
- `npm run validate` fails if a P1 ledger item lacks existing scope files, a validation command covered by the validate chain, a real test/gate binding, or if prompt module metadata drifts from the real prompt manifest.
- `report:write` records current revision metadata including `origin_main_sha` when available.
- `publish:dry-run` blocks selected strict reports whose revision metadata does not match current repo metadata, including the `origin_main_sha` check.
- PR #20 is rebased onto latest `origin/main`, pushed, and mergeable before attempting to merge.

## Allowed paths

- `tasks/current-task.md`
- `progress.md`
- `session-handoff.md`
- `definition-of-done.md`
- `feature_list.json`
- `package.json`
- `schemas/report.schema.json`
- `src/**`
- `scripts/**`
- `tests/**`
- `prompts/ai-daily/**`
- `tasks/daily-publish-runbook.md`
- `docs/codex-automation-setup.md`
- `config/**`

## Forbidden paths

- Do not change remote Pages settings.
- Do not modify scheduled automation configuration directly.
- Do not hand-edit generated public report HTML.
- Do not reset hard or overwrite unrelated user changes.

## Validation commands

Run after rebase and before updating/merging PR #20:

- `npm run feedback:validate`
- `node --test tests\unit.test.js tests\publish.test.js`
- `npm run validate`
- `node scripts\harness-validate.mjs`
- Confirm `git status` has no unresolved conflicts.
- Confirm PR #20 merge state is clean/mergeable after force-with-lease push.

## Parallel writes

- No parallel writes. Manual edits use `apply_patch`; generated output comes from validation/build commands.

## Handoff requirements

- Resolve rebase conflicts on `codex/feedback-durability-gates`.
- Rerun validation after the rebase.
- Push the rebased branch with `--force-with-lease`.
- Attempt merge into `main` only after GitHub reports the PR is mergeable or allows auto-merge.
- Report validation, PR URL, and mergeability/merge result.

## Current Status

- PR opened: https://github.com/JasonxzWen/ai-daily-cn/pull/20
- Initial PR state before rebase: non-draft, `mergeable=CONFLICTING`, `mergeStateStatus=DIRTY`, no status checks reported.
- Rebase conflict scope: `progress.md`, `session-handoff.md`, and `tasks/current-task.md`.
- Functional/source conflicts did not require manual resolution.
- Post-rebase validation passed: `npm run feedback:validate`, `node --test tests\unit.test.js tests\publish.test.js`, `npm run validate` (172 tests; build wrote no files), and `node scripts\harness-validate.mjs`.
