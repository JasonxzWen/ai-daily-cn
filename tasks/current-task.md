# Current Task

## Task Class

non-trivial

## Spec

### Goal

Harden this repository for strict SDD-first and TDD-first Codex iteration while keeping interactive "vibe coding" usable.

### User-Visible Behavior

- `tasks/current-task.md` is the single authoritative specification for every active non-trivial iteration.
- Before a non-trivial task spec is ready, Codex may only perform read-only exploration.
- Non-trivial implementation must record a `Red Test` with a real failing command before code changes, or a `Deterministic Substitute` with a reason when a direct red test is not practical.
- Trivial work is exempt only when `Task Class` is `trivial` and `Trivial Justification` is present.
- `node scripts/harness-validate.mjs` enforces the current-task SDD/TDD contract.
- OpenSpec is removed from the active workflow and validation chain.

### Boundaries

- Keep daily publish safety rules and automation contracts intact.
- Keep `npm run validate` as the broad repository verification gate.
- Do not commit, push, create a PR, change remote Pages settings, or modify Codex automation configuration.
- Do not edit generated public daily report HTML by hand.

### Non-Goals

- Do not redesign daily report rendering.
- Do not change publishing behavior except removing OpenSpec validation from the local validation chain.
- Do not introduce a new external spec system.

## Acceptance Criteria

- `tasks/current-task.md` contains explicit task class, spec, acceptance criteria, Red Test or deterministic substitute, allowed paths, forbidden paths, validation commands, and handoff requirements.
- `scripts/harness-validate.mjs` rejects non-trivial current tasks missing `Red Test` or `Deterministic Substitute`.
- `scripts/harness-validate.mjs` accepts `trivial` tasks only when a `Trivial Justification` is present.
- `npm run validate` runs `npm run harness:validate` before the broader validation chain.
- `package.json#scripts.validate` no longer runs `validate:openspec`, and `package.json#scripts.test` no longer references `tests/openspec.test.js`.
- The OpenSpec validator, OpenSpec tests, and `openspec/` tree are removed from the repository.
- Project guidance no longer tells Codex to use OpenSpec as an active workflow.
- A reusable SDD/TDD task template exists under `tasks/templates/`.
- Focused red tests fail before implementation and pass after implementation.
- `node scripts/harness-validate.mjs`, `npm run test`, `npm run build`, `npm run test:e2e`, and `npm run validate` pass.

## Red Test

Run before implementation after adding tests:

```powershell
node --test tests/unit.test.js --test-name-pattern "harness SDD TDD|OpenSpec removed"
```

Actual initial failure recorded before implementation:

- Fails because `scripts/harness-validate.mjs` does not enforce SDD/TDD task fields.
- Fails because OpenSpec remains in package scripts, tests, validator script, and repository files.

## Deterministic Substitute

Not used. This change is directly testable with unit tests around harness validation and package workflow assertions.

## Allowed Paths

- `AGENTS.md`
- `clean-state-checklist.md`
- `definition-of-done.md`
- `docs/ai-daily-report-github-pages-plan.md`
- `docs/skill-hub-frontend-html-capability-evaluation.md`
- `feature_list.json`
- `package.json`
- `package-lock.json`
- `progress.md`
- `scripts/harness-validate.mjs`
- `session-handoff.md`
- `tasks/current-task.md`
- `tasks/templates/**`
- `tests/unit.test.js`
- `tests/openspec.test.js`
- `scripts/validate-openspec.mjs`
- `openspec/**`

## Forbidden Paths

- Do not modify generated public daily report HTML by hand.
- Do not change remote Pages settings.
- Do not modify Codex automation configuration.
- Do not commit, push, or create a PR unless explicitly requested.
- Do not reset hard or overwrite unrelated user changes.

## Validation Commands

- `node --test tests/unit.test.js --test-name-pattern "harness SDD TDD|OpenSpec removed"`
- `npm run harness:validate`
- `node scripts/harness-validate.mjs`
- `npm run test`
- `npm run build`
- `npm run test:e2e`
- `npm run validate`
- `git diff --check`

## Parallel Writes

- No parallel writes. Manual edits use `apply_patch`; generated output is inspected and reverted unless it is part of this task.

## Handoff Requirements

- Report removed OpenSpec files and remaining historical references, if any.
- Report SDD/TDD validator behavior and red/green test evidence.
- Report full validation command results.
- Report residual risks and follow-up cleanup, if any.

## Spec Updates

- None yet.
