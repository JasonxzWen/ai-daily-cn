# Progress

## Current State

- Active task: strict SDD/TDD harness hardening and OpenSpec cleanup.
- Branch: `codex/sdd-tdd-harness-hardening`.
- Task class: non-trivial.
- Red test evidence captured: focused `node --test tests/unit.test.js --test-name-pattern "harness SDD TDD|OpenSpec removed"` failed before implementation because SDD/TDD harness checks and OpenSpec cleanup were not yet in place.

## Completed

- Replaced stale `tasks/current-task.md` with the active SDD/TDD hardening spec.
- Created branch `codex/sdd-tdd-harness-hardening` from `origin/main`.
- Added focused tests for non-trivial Red Test enforcement, trivial-task justification, template Task Class guidance compatibility, and OpenSpec removal from active workflow.
- Hardened `scripts/harness-validate.mjs` to enforce current-task SDD/TDD fields, trivial justification, Red Test or deterministic substitute, and OpenSpec artifact removal.
- Removed OpenSpec from `package.json` active scripts.
- Deleted `scripts/validate-openspec.mjs`, `tests/openspec.test.js`, and tracked `openspec/**` files.
- Added `tasks/templates/sdd-tdd-task.md`.
- Updated AGENTS, Definition of Done, clean-state checklist, and active docs to route work through `tasks/current-task.md`.

## Validation Records

| Command | Status | Evidence |
|---|---|---|
| `node --test tests/unit.test.js --test-name-pattern "harness SDD TDD|OpenSpec removed"` before implementation | fail | Red evidence: missing SDD/TDD enforcement and OpenSpec still active. |
| `node --test tests/unit.test.js --test-name-pattern "harness SDD TDD|OpenSpec removed"` after implementation | pass | 192 tests executed under the pattern run; focused SDD/TDD, Red Test failure-evidence, template compatibility, and OpenSpec tests passed. |
| `node scripts/harness-validate.mjs` | pass | Harness validation passed with new SDD/TDD rules. |
| `npm run validate` | pass | Ran `harness:validate`, feedback, workflow, sources, 252 tests, build, privacy scan, e2e, and `git diff --check`. |
| OpenSpec reference audit | pass | Remaining OpenSpec references are limited to cleanup notes, negative validator/test assertions, and the active task spec; historical generated reports were excluded from cleanup. |

## Pending

- None.

## Blockers

- None.
