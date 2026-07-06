# Evaluator Rubric

Use this rubric after implementation and before acceptance.

| Dimension | Question | Score 0-2 | Notes |
| --- | --- | --- | --- |
| Alignment | Were requirement intake, selected direction, target spec, open questions, and acceptance criteria recorded before implementation? | 2 | Current task was reset to PR-A: one synthetic command node execution loop, no production manifest changes, artifact I/O deferred. |
| Correctness | Does the implemented behavior match the active task and feature state? | 2 | `--execute-node-fixture` runs one synthetic `node_executable` command node and emits one validated `daily_codex_dag_node_result`. |
| TDD discipline | Did the work follow the agreed P0/P1/P2 test matrix, with RED/GREEN evidence where practical? | 2 | Tests cover helper success, injected command failure, CLI stdout-only behavior, opt-in `.tmp` summary writes, schema validation, semantic validation, and dry-run/contract-run no-execution preservation. |
| Verification | Were the required checks actually run with recorded evidence? | 2 | Required gates passed before and after review fixes: targeted DAG test 45/45, `npm run dag:validate`, harness validation, `git diff --check`, and full `npm run validate` with 721 tests / 719 pass / 0 fail / 2 skipped. |
| Scope discipline | Did this session stay within the selected task and allowed paths? | 2 | Production `config/daily-codex-dag.json` was not modified; no Codex CLI, prompt rendering, package/workflow, or production runner behavior was added. |
| Runtime reliability | Can the standard startup path, health checks, or user flow run again? | 2 | The MVP command uses `execFile` with `shell: false`, executes `scripts/validate-daily-codex-dag.mjs`, and converts non-zero exits into structured failure node results without stdout/stderr leakage. |
| Browser acceptance | For Web changes, did agent-run browser acceptance prove the local user flow with URL, viewport, console/network, and artifact evidence? | 2 | Deferred because no UI behavior changed. |
| Agentic loops | Were producer, verifier, read-only arbiter, evidence, and main-agent decision recorded for material loop work? | 2 | Faraday completed one complete-stage review, found no P0/P1 blockers, and three P2 findings were fixed directly. |
| Finish closeout | Did final review, technical-debt/drift inspection, and PR/merge-readiness handling run or have explicit skip reasons? | 1 | Complete-stage review and post-review validation are done; PR gates remain pending. |
| Insight recommendations | Did the session produce or explicitly skip an insight audit for tool calling, AI infrastructure, docs/code conflicts, and skill/workflow extraction candidates? | 2 | Explicitly skipped after the narrow PR-A review to preserve speed; no workflow extraction is needed from this slice. |
| Maintainability | Are code and repo-local docs clear enough for the next session? | 2 | PR-A has a named summary mode and CLI flag, isolated synthetic fixture, and explicit next action toward PR-B artifact I/O. |
| Handoff readiness | Can a new session continue from repo-local state without guessing? | 1 | Progress, decisions, and handoff are being updated; PR status remains pending. |

## Verdict

- PR-A implementation, local validation gates, complete-stage review, and post-review validation are complete.
- Remaining: PR creation, CI/mergeability checks, and merge.

## Follow-up

- Required next gate: create PR and inspect CI/mergeability/conflicts.
- Deferred by design: artifact I/O contract, first real DAG node adapter, Codex CLI execution, prompt rendering, and production manifest migration.
