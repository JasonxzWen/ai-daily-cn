# Evaluator Rubric

Use this rubric after implementation and before acceptance.

| Dimension | Question | Score 0-2 | Notes |
| --- | --- | --- | --- |
| Alignment | Were requirement intake, selected direction, target spec, open questions, and acceptance criteria recorded before implementation? | 2 | Harness state was reset for the package/workflow entrypoint slice before product edits; Hilbert's design P1/P2 feedback was adopted before implementation. |
| Correctness | Does the implemented behavior match the active task and feature state? | 2 | Adds a non-publishing `daily:codex-dag:contract-run` npm script and workflow contract requirement for the existing `--contract-run --json` CLI path without changing production `daily:codex-pipeline`. |
| TDD discipline | Did the work follow the agreed P0/P1/P2 test matrix, with RED/GREEN evidence where practical? | 2 | Unit tests now assert the production workflow contract and package script both register the entrypoint, and reject missing or wrong-command package drift. |
| Verification | Were the required checks actually run with recorded evidence? | 2 | `npm run workflow:validate`, `node --test tests/unit.test.js --test-name-pattern "daily workflow contract"` (ran 505/505), npm contract-run smoke, harness validation, `git diff --check`, and full `npm run validate` passed. Full validation included 699 tests: 697 passed and 2 skipped. |
| Scope discipline | Did this session stay within the selected task and allowed paths? | 2 | Tracked edits are limited to `package.json`, `config/daily-workflow-contract.json`, `tests/unit.test.js`, and quality/rubric docs; runner source and production publish wiring are untouched. |
| Runtime reliability | Can the standard startup path, health checks, or user flow run again? | 2 | Workflow validation passes and the npm entrypoint reaches the existing contract-run JSON path. Current npm/PowerShell smoke form is `npm run daily:codex-dag:contract-run -- -- --date YYYY-MM-DD`. |
| Browser acceptance | For Web changes, did agent-run browser acceptance prove the local user flow with URL, viewport, console/network, and artifact evidence? | 2 | Explicitly deferred because no UI behavior changed. |
| Agentic loops | Were producer, verifier, read-only arbiter, evidence, and main-agent decision recorded for material loop work? | 2 | Design review completed with Hilbert, code/tests review completed with Bohr, and spec/docs review completed with Bernoulli after stale-state fix. Final closeout is still pending. |
| Finish closeout | Did final review, technical-debt/drift inspection, and PR/merge-readiness handling run or have explicit skip reasons? | 2 | Nietzsche completed final closeout and found no code/test/spec P0/P1/P2; only closeout/insight state needed recording and is now complete. |
| Insight recommendations | Did the session produce or explicitly skip an insight audit for tool calling, AI infrastructure, docs/code conflicts, and skill/workflow extraction candidates? | 2 | Full insight trace audit was skipped because no cross-tool failure pattern appeared; the durable recommendation is to pair each new runner/package entrypoint with exact package-script contract gates, real package/contract registration assertions, missing/wrong-command drift tests, and documented npm argument passthrough. |
| Maintainability | Are code and repo-local docs clear enough for the next session? | 2 | The npm script name and workflow contract make the non-publishing entrypoint discoverable while keeping production runner wiring separate. |
| Handoff readiness | Can a new session continue from repo-local state without guessing? | 1 | Current-task describes this entrypoint slice; progress and handoff still need final validation, review, PR, and merge status. |

## Verdict

- PR-ready after final closeout; PR checks and merge are pending.

## Follow-up

- Missing evidence: PR checks and merge status.
- Required fixes: none known after Bohr code/test review.
- Final closeout: Nietzsche found no code/test/spec P0/P1/P2; only closeout/insight state was required and is now recorded.
- Closed gaps: DAG contract-run now has a workflow-validated npm entrypoint.
- Deferred P2: real node execution, package/workflow production migration, per-node artifact writes, retries, fanout expansion, barrier aggregation, and npm argument ergonomics remain future work.
- Next review trigger: spec/docs review or full validation failure.
