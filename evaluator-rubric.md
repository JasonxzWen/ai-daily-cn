# Evaluator Rubric

Use this rubric after implementation and before acceptance.

| Dimension | Question | Score 0-2 | Notes |
| --- | --- | --- | --- |
| Alignment | Were requirement intake, selected direction, target spec, open questions, and acceptance criteria recorded before implementation? | 2 | `tasks/current-task.md` recorded SDD scope, red test, allowed paths, validation commands, and migration boundaries. |
| Correctness | Does the implemented behavior match the active task and feature state? | 2 | Manifest is current at `047365688dcdeeb5ef0489095a4b8b1c65f0122b`; context/loop/harness resources are present and validated. |
| TDD discipline | Did the work follow the agreed P0/P1/P2 test matrix, with RED/GREEN evidence where practical? | 2 | Manifest stale check failed before migration and passed after migration. |
| Verification | Were the required checks actually run with recorded evidence? | 2 | `npm run validate` passed after targeted fixes; `npm run test` showed 621 tests, 619 pass, 2 skipped. |
| Scope discipline | Did this session stay within the selected task and allowed paths? | 2 | Changes are limited to Harness Hub aggregation, harness/context/loop docs, validation, state, and retrospective files. |
| Runtime reliability | Can the standard startup path, health checks, or user flow run again? | 2 | `npm run harness:init`, `node scripts/harness-validate.mjs`, and full validation pass. |
| Browser acceptance | For Web changes, did agent-run browser acceptance prove the local user flow with URL, viewport, console/network, and artifact evidence? | 2 | No Web UI change; `npm run validate` still ran E2E. |
| Agentic loops | Were producer, verifier, read-only arbiter, evidence, and main-agent decision recorded for material loop work? | 1 | Deterministic verification replaced delegated loop review; no subagent was needed. |
| Finish closeout | Did final review, technical-debt/drift inspection, and PR/merge-readiness handling run or have explicit skip reasons? | 2 | Closeout recorded the `effective-interact` overwrite risk and follow-up. No PR was created. |
| Insight recommendations | Did the session produce or explicitly skip an insight audit for tool calling, AI infrastructure, docs/code conflicts, and skill/workflow extraction candidates? | 1 | Recommendation captured in retrospective; explicit `insight` skill run was skipped because deterministic validation exposed the actionable process gap. |
| Maintainability | Are code and repo-local docs clear enough for the next session? | 2 | `.harness-hub` templates, validator checks, quality snapshot, and handoff state were updated. |
| Handoff readiness | Can a new session continue from repo-local state without guessing? | 2 | `progress.md`, `session-handoff.md`, `.harness-hub/state/*`, and retrospective were updated. |

## Verdict

Accept

## Follow-up

- Missing evidence: none for this migration.
- Required fixes: none before handoff.
- Next review trigger: next Harness Hub sync or any change to `scripts/update-harness-hub.mjs` / `.codex/skills/effective-interact`.
