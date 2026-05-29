# Current Task

## Goal

Implement the AI daily quality-status repair plan and run all required tests.

## Status

Completed. Implementation and generated docs are updated; final `npm run validate`, harness validation, and browser render checks passed.

## Assumptions

- The public daily report should distinguish startup failures, external source degradation, selection degradation, and true low-signal days.
- Startup/runtime dependency failures should block publishing before report generation.
- External feed/network failures may still publish a report only when the report exposes a machine-readable degraded state.
- Existing historical reports must continue to build without requiring new fields.

## Scope

- Add a top-level `quality_status` contract.
- Add quality-status derivation and regression tests for source degradation, selection degradation, and low-signal days.
- Improve report rendering for link icons/tags where needed by the repair plan.
- Add an `evidence_assets` schema/rendering contract for source-backed figures/tables.
- Run the repository validation suite before handoff.

## Non-goals

- Do not publish, commit, push, or change GitHub Pages settings.
- Do not rewrite historical daily report prose except where generated build output requires it.
- Do not implement broad fully automatic chart extraction in this task.

## Allowed paths

- `schemas/**`
- `src/**`
- `tests/**`
- `prompts/**`
- `docs/**`
- `reports-data/**`
- `tasks/current-task.md`
- `progress.md`
- `session-handoff.md`
- `package-lock.json`
- `package.json`

## Forbidden paths

- Remote repository settings and automation configuration.
- Unrelated user changes.
- Any path outside the active task's allowed paths unless required by the validation suite.

## Acceptance Criteria

- Missing dependencies or CLI startup failures are treated as blocked in the publish/preflight path.
- Reports like 2026-05-29 with blocked Builder and content sources are marked `quality_status.status = "degraded"`.
- Normal low-signal source checks are not misclassified as degraded.
- Candidate-rich but low-inclusion scenarios are marked as selection degraded.
- Link icons and cross-section tags are covered by unit/render tests.
- Evidence assets can be represented in schema and rendered safely.
- `npm run validate` passes.

## Validation commands

- `npm ci`
- `npm test`
- `npm run build`
- `npm run test:e2e`
- `npm run validate`
- `node scripts\harness-validate.mjs`
- Browser render check for `docs/reports/2026/05/2026-05-29.html`

## Parallel writes

- Default: blocked for this implementation task.
- Read-only inspection and independent validation commands may run in parallel.

## Handoff requirements

- Update `progress.md` and `session-handoff.md`.
- Record all validation evidence and any remaining limitations.
