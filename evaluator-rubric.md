# Evaluator Rubric

Use this rubric after implementation and before acceptance.

| Dimension | Question | Score 0-2 | Notes |
| --- | --- | --- | --- |
| Alignment | Were requirement intake, selected direction, target spec, open questions, and acceptance criteria recorded before implementation? | 2 | Harness state records adjusted scope and acceptance before product edits. |
| Correctness | Does the implemented behavior match the active task and feature state? | 2 | Public article artifact privacy coverage, contract tests, and publish staging match the accepted slice. |
| TDD discipline | Did the work follow the agreed P0/P1/P2 test matrix, with RED/GREEN evidence where practical? | 2 | Added targeted tests for schema rejection, determinism, privacy scan, and regular/daily publish-plan inclusion. |
| Verification | Were the required checks actually run with recorded evidence? | 2 | `npm run validate` passed, plus targeted article/publish/privacy/build checks. |
| Scope discipline | Did this session stay within the selected task and allowed paths? | 2 | Tracked product changes are limited to privacy scanning, publish staging, contract tests, and quality docs. |
| Runtime reliability | Can the standard startup path, health checks, or user flow run again? | 2 | Harness validation, build-clean, privacy scan, test suite, and E2E passed. |
| Browser acceptance | For Web changes, did agent-run browser acceptance prove the local user flow with URL, viewport, console/network, and artifact evidence? | 2 | Explicitly deferred because no UI behavior changed. |
| Agentic loops | Were producer, verifier, read-only arbiter, evidence, and main-agent decision recorded for material loop work? | 2 | Read-only plan, implementation, and post-fix reviews are recorded. |
| Finish closeout | Did final review, technical-debt/drift inspection, and PR/merge-readiness handling run or have explicit skip reasons? | 2 | Local validation and post-fix subagent review passed; PR/merge readiness will be checked before merge. |
| Insight recommendations | Did the session produce or explicitly skip an insight audit for tool calling, AI infrastructure, docs/code conflicts, and skill/workflow extraction candidates? | 2 | Insight report generated; recommendations recorded in state. |
| Maintainability | Are code and repo-local docs clear enough for the next session? | 2 | Tests name the contract boundaries directly. |
| Handoff readiness | Can a new session continue from repo-local state without guessing? | 2 | Progress and handoff state updated. |

## Verdict

- Accept

## Follow-up

- Missing evidence: none for this slice.
- Required fixes: none known.
- Next review trigger: before the next DAG-node or homepage PR, verify per-node artifact schemas and browser acceptance where applicable.
