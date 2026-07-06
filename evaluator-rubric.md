# Evaluator Rubric

Use this rubric after implementation and before acceptance.

| Dimension | Question | Score 0-2 | Notes |
| --- | --- | --- | --- |
| Alignment | Were requirement intake, selected direction, target spec, open questions, and acceptance criteria recorded before implementation? | 2 | Harness state was reset for the command artifact-proof slice before product edits; user cadence update is honored by deferring subagent review until the complete local stage. |
| Correctness | Does the implemented behavior match the active task and feature state? | 2 | Extends command execution so synthetic nodes can derive `resolved_inputs`/`resolved_outputs` from disk metadata after a real command writes `.tmp` JSON. Codex, prompts, production manifest specs, schemas, package scripts, workflows, dry-run, and contract-run execution remain untouched. |
| TDD discipline | Did the work follow the agreed P0/P1/P2 test matrix, with RED/GREEN evidence where practical? | 2 | DAG tests cover real `.tmp` JSON artifact production, disk-derived bytes/sha256/schema_valid metadata, missing required output failure, structured command failure, preflight failure without execution, and existing no-execution summary boundaries. |
| Verification | Were the required checks actually run with recorded evidence? | 2 | P0 local checks passed: `node --test tests/daily-codex-dag.test.js` reported 41/41, `npm run dag:validate`, harness validation, and `git diff --check`. Full `npm run validate` exited 0 with 718 tests / 716 pass / 0 fail / 2 skipped. Complete-stage review found no P0/P1 findings. PR checks and merge remain pending. |
| Scope discipline | Did this session stay within the selected task and allowed paths? | 2 | Tracked edits are limited to DAG command artifact proof, DAG tests, and quality/rubric docs; production manifest, schemas, package scripts, workflows, dry-run/contract-run behavior, and publish paths are untouched. |
| Runtime reliability | Can the standard startup path, health checks, or user flow run again? | 2 | DAG validation passes and dry-run/contract-run remain no-execution while helper-level synthetic command execution now returns validated node-result evidence with live artifact metadata. |
| Browser acceptance | For Web changes, did agent-run browser acceptance prove the local user flow with URL, viewport, console/network, and artifact evidence? | 2 | Explicitly deferred because no UI behavior changed. |
| Agentic loops | Were producer, verifier, read-only arbiter, evidence, and main-agent decision recorded for material loop work? | 2 | One batched complete-stage review ran after code, tests, docs/state, and local validation. It found no P0/P1 issues and one P2 status-doc mismatch, which was fixed directly without a second review. |
| Finish closeout | Did final review, technical-debt/drift inspection, and PR/merge-readiness handling run or have explicit skip reasons? | 1 | Local P0, full validation, complete-stage review, and insight are complete; PR checks and merge remain pending. |
| Insight recommendations | Did the session produce or explicitly skip an insight audit for tool calling, AI infrastructure, docs/code conflicts, and skill/workflow extraction candidates? | 2 | Current-slice insight audit completed under `.tmp/insight-command-artifact-proof/insight-report.md`; verdict `mixed` over 9,284 events with 8,642 confirmed. Recommendations remain validation closure, environment readiness, and failed tool-branch review. |
| Maintainability | Are code and repo-local docs clear enough for the next session? | 2 | Artifact proof reuses existing command execution and node-result contracts, with only small disk metadata helpers added. |
| Handoff readiness | Can a new session continue from repo-local state without guessing? | 1 | Current-task, progress, and handoff record the active artifact-proof scope, validation, review, and insight evidence; PR status remains pending. |

## Verdict

- Command artifact-proof implementation, P0 validation, full validation, complete-stage review, and insight are complete. PR checks and merge remain pending.

## Follow-up

- Required fixes: none known after complete-stage review and local validation.
- Missing evidence: PR checks and merge status.
- Closed gaps: Command execution can now prove a real `.tmp` JSON output through disk-derived `resolved_outputs` metadata.
- Deferred P2: Codex execution, prompt rendering, production manifest specs, dry-run/contract-run execution, business-schema artifact validation, retry/concurrency scheduling, network allowlists, secret scopes, fanout expansion, barrier aggregation, and production runner migration remain future work.
