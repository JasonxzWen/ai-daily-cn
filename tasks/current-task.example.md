# Current Task

## Task Class

non-trivial

Use `trivial` only for typo, pure copy, one-line no-behavior config, or read-only diagnostic tasks. Trivial tasks must include `## Trivial Justification`.

## Trivial Justification

Remove this section for non-trivial work.

## Spec

### Goal

State the concrete outcome.

### User-Visible Behavior

- Describe observable behavior or artifact changes.

### Boundaries

- State constraints, ownership, and integration boundaries.

### Non-Goals

- State what this task will not do.

## Acceptance Criteria

- Each criterion must be directly verifiable.

## Feedback Ledger Review

Feedback-ledger review summary: review `config/feedback-ledger.json` and `docs/feedback-buglist-quick-reference.md` before implementation.

- Record applicable prior feedback items and how this task avoids repeating them.
- If no item applies, explain why.

## Regression Self-Check

Regression self-check summary: list the concrete checks to run before handoff against applicable prior feedback.

- Include relevant commands, files, UI pages, or generated artifacts.
- If the user reported a new durable issue, add/update the ledger and quick reference before handoff.

## Red Test

Run before implementation:

```powershell
<command expected to fail before implementation>
```

Expected initial failure:

- Explain the exact failure signal.

## Deterministic Substitute

Use only when a direct red test is not practical. Explain the reason and the deterministic check that replaces it.

## Allowed Paths

- `<path>`

## Forbidden Paths

- Do not modify unrelated user work.
- Do not reset hard or overwrite unrelated changes.

## Validation Commands

- `corepack pnpm run harness:init`
- `node scripts/harness-validate.mjs`
- `corepack pnpm run validate`
- `git diff --check`

## Parallel Writes

- No parallel writes unless the task explicitly defines independent worktrees, non-overlapping paths, and an integration point.

## Retrospective Plan

- For non-trivial deliveries, write or update one sanitized record under `retrospectives/YYYY/MM/` with the correct `run_type`.
- Update `retrospectives/index.json` so it remains the lightweight authority.
- If the task is trivial, state why no retrospective record is required.

## Handoff Requirements

- Report red/green evidence.
- Report validation command results.
- Report changed files, risks, and follow-up work.

## Spec Updates

- Record only decision-level changes that alter assumptions, acceptance criteria, allowed paths, validation commands, user-visible behavior, or risk.
