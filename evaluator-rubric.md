# Evaluator Rubric

Use this rubric after implementation and before acceptance.

| Dimension | Question | Score 0-2 | Notes |
| --- | --- | --- | --- |
| Alignment | Were requirement intake, selected direction, target spec, open questions, and acceptance criteria recorded before implementation? | 2 | Harness state was reset for the DAG plan projection slice before product edits. |
| Correctness | Does the implemented behavior match the active task and feature state? | 2 | Adds read-only deterministic DAG plan projection without changing runner execution semantics. |
| TDD discipline | Did the work follow the agreed P0/P1/P2 test matrix, with RED/GREEN evidence where practical? | 2 | Added targeted tests for deterministic projection, topological levels, manifest-order tie breaking, invalid manifest handling, and non-mutation. |
| Verification | Were the required checks actually run with recorded evidence? | 2 | Full `npm run validate` passed after targeted DAG planner tests, `dag:validate`, pipeline compatibility tests, harness validation, and diff check. |
| Scope discipline | Did this session stay within the selected task and allowed paths? | 2 | Tracked changes are limited to DAG planner/tests and quality docs. |
| Runtime reliability | Can the standard startup path, health checks, or user flow run again? | 2 | Runner compatibility tests pass; no production execution path was made dependent on the manifest. |
| Browser acceptance | For Web changes, did agent-run browser acceptance prove the local user flow with URL, viewport, console/network, and artifact evidence? | 2 | Explicitly deferred because no UI behavior changed. |
| Agentic loops | Were producer, verifier, read-only arbiter, evidence, and main-agent decision recorded for material loop work? | 2 | Design, implementation/tests/spec, post-fix, and final closeout subagent reviews completed with no remaining P0/P1. |
| Finish closeout | Did final review, technical-debt/drift inspection, and PR/merge-readiness handling run or have explicit skip reasons? | 2 | Final closeout review found no P0/P1; PR/merge readiness is proceeding after full validation. |
| Insight recommendations | Did the session produce or explicitly skip an insight audit for tool calling, AI infrastructure, docs/code conflicts, and skill/workflow extraction candidates? | 2 | Insight report generated; recommendations recorded in state. |
| Maintainability | Are code and repo-local docs clear enough for the next session? | 2 | Manifest fields make planned vs mapped nodes, policy refs, and artifact ownership explicit. |
| Handoff readiness | Can a new session continue from repo-local state without guessing? | 2 | Progress records PR #209 merge and the current DAG plan projection branch/task. |

## Verdict

- Accept

## Follow-up

- Missing evidence: none for this read-only plan projection slice.
- Required fixes: none known after full validation and final closeout review.
- Next review trigger: before the next executable DAG runner migration slice, review design/code/tests/spec changes with subagents.
