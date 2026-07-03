# Evaluator Rubric

Use this rubric after implementation and before acceptance.

| Dimension | Question | Score 0-2 | Notes |
| --- | --- | --- | --- |
| Alignment | Were requirement intake, selected direction, target spec, open questions, and acceptance criteria recorded before implementation? | 2 | Harness state was reset for the DAG lineage contract slice before product edits. |
| Correctness | Does the implemented behavior match the active task and feature state? | 2 | Adds input-output lineage validation to the independent DAG manifest validator without changing runner execution semantics. |
| TDD discipline | Did the work follow the agreed P0/P1/P2 test matrix, with RED/GREEN evidence where practical? | 2 | Added targeted negative tests for dependency-less inputs, missing upstream outputs, sibling-only outputs, self outputs, exact fanout templates, and optional inputs. |
| Verification | Were the required checks actually run with recorded evidence? | 2 | `npm run validate` passed, including `dag:validate`, 674 tests, build-clean, privacy, E2E, and `git diff --check`. |
| Scope discipline | Did this session stay within the selected task and allowed paths? | 2 | Tracked changes are limited to DAG lineage validator/tests and quality docs. |
| Runtime reliability | Can the standard startup path, health checks, or user flow run again? | 2 | Runner compatibility tests pass; no production execution path was made dependent on the manifest. |
| Browser acceptance | For Web changes, did agent-run browser acceptance prove the local user flow with URL, viewport, console/network, and artifact evidence? | 2 | Explicitly deferred because no UI behavior changed. |
| Agentic loops | Were producer, verifier, read-only arbiter, evidence, and main-agent decision recorded for material loop work? | 2 | Design and implementation/tests/spec reviews completed with no P0/P1; P2 exact-match regression coverage was added. |
| Finish closeout | Did final review, technical-debt/drift inspection, and PR/merge-readiness handling run or have explicit skip reasons? | 2 | Final closeout review found no P0/P1; P2 reverse-prefix coverage was added and revalidated. |
| Insight recommendations | Did the session produce or explicitly skip an insight audit for tool calling, AI infrastructure, docs/code conflicts, and skill/workflow extraction candidates? | 2 | Insight report generated; recommendations recorded in state. |
| Maintainability | Are code and repo-local docs clear enough for the next session? | 2 | Manifest fields make planned vs mapped nodes, policy refs, and artifact ownership explicit. |
| Handoff readiness | Can a new session continue from repo-local state without guessing? | 2 | Progress records PR #208 merge and the current DAG lineage branch/task. |

## Verdict

- Accept

## Follow-up

- Missing evidence: none for this lineage contract slice.
- Required fixes: none known after full validation and final closeout.
- Next review trigger: before the next executable DAG runner migration slice, review design/code/tests/spec changes with subagents.
