# Evaluator Rubric

Use this rubric after implementation and before acceptance.

| Dimension | Question | Score 0-2 | Notes |
| --- | --- | --- | --- |
| Alignment | Were requirement intake, selected direction, target spec, open questions, and acceptance criteria recorded before implementation? | 2 | Harness state was reset for the Codex-runtime slice before product edits; Hegel design review found no P0 and its P1/P2 guidance was adopted. |
| Correctness | Does the implemented behavior match the active task and feature state? | 2 | Adds pure Codex CLI runtime-resolution data for future specs while keeping `node_executable` reserved, production manifest execution specs absent, and no-execution summaries unchanged. |
| TDD discipline | Did the work follow the agreed P0/P1/P2 test matrix, with RED/GREEN evidence where practical? | 2 | DAG tests cover explicit Codex executable mapping, repo-root prompt-template resolution independent of cwd, args-copy-only plan shape, direct helper rejection for unsupported executor/kind/path/arg/cwd/runtime inputs, explicit falsy-spec rejection, and no runtime-plan leakage into dry-run/contract-run summaries. |
| Verification | Were the required checks actually run with recorded evidence? | 2 | P0 local checks passed after rebasing onto latest `origin/main` at `53bef2a9abd7d880c0629a117ac1c42baceba9d0`: `node --test tests/daily-codex-dag.test.js` reported 34/34, `npm run dag:validate`, harness validation, and `git diff --check`. Post-#226 full `npm run validate` exited 0 with 711 tests / 709 pass / 0 fail / 2 skipped. PR checks and merge remain pending. |
| Scope discipline | Did this session stay within the selected task and allowed paths? | 2 | Tracked edits are limited to DAG semantic validator, DAG tests, and quality/rubric docs; production manifest, manifest schema, run-summary schema, package scripts, workflows, runner execution, and publish paths are untouched. |
| Runtime reliability | Can the standard startup path, health checks, or user flow run again? | 2 | DAG validation passes and the contract-run path remains no-execution: skipped node results only, empty command/Codex invocation arrays, no projected execution specs, no Codex runtime plans, and no completed-node semantics. |
| Browser acceptance | For Web changes, did agent-run browser acceptance prove the local user flow with URL, viewport, console/network, and artifact evidence? | 2 | Explicitly deferred because no UI behavior changed. |
| Agentic loops | Were producer, verifier, read-only arbiter, evidence, and main-agent decision recorded for material loop work? | 2 | Design review completed with Hegel; implementation/test review completed with Ptolemy after a P2 explicit-spec selection fix; consolidated complete-stage review completed with Mendel and found no P0/P1, only P2 state/doc cleanup; local final closeout is complete. PR closeout is pending. |
| Finish closeout | Did final review, technical-debt/drift inspection, and PR/merge-readiness handling run or have explicit skip reasons? | 1 | Ptolemy found one P2 direct-helper explicit-spec gap; it was fixed and re-reviewed with no P0/P1/P2. Mendel complete-stage review found no P0/P1 and only P2 state cleanup, now addressed. Local final closeout is complete; PR checks and merge remain pending. |
| Insight recommendations | Did the session produce or explicitly skip an insight audit for tool calling, AI infrastructure, docs/code conflicts, and skill/workflow extraction candidates? | 2 | Current Codex-runtime insight audit completed under `.tmp/insight-codex-runtime/insight-report.md`; verdict `mixed` over 9,117 events with 8,475 confirmed. Recommendations: tighten validation closure, treat environment readiness as an audit category, and review failed tool-call branches before retrying. |
| Maintainability | Are code and repo-local docs clear enough for the next session? | 2 | Runtime resolution is isolated in pure helpers and avoids process spawning, prompt reads, PATH/env lookup, env/stdio metadata, full flag parsing, live artifact proof, retry scheduling, network allowlists, and secret scopes before the executor exists. |
| Handoff readiness | Can a new session continue from repo-local state without guessing? | 1 | Current-task, progress, decisions, and handoff are updated through implementation/test review, post-#226 validation, review-cadence adjustment, insight, consolidated review, and local final closeout. PR status remains pending. |

## Verdict

- Codex-runtime implementation/tests, targeted validation, full `npm run validate`, insight, consolidated complete-stage review, and local final closeout are complete after implementation review. PR checks and merge remain pending.

## Follow-up

- Required fixes: none known after Ptolemy implementation/test re-review.
- Missing evidence: PR checks and merge status.
- Closed gaps: Future Codex CLI specs now resolve to deterministic explicit runtime plan data before execution can be enabled.
- Deferred P2: real Codex/node execution, prompt delivery, executable spawnability checks, full command flag parsing, live artifact verification, retry/concurrency scheduling, network allowlists, secret scopes, fanout expansion, barrier aggregation, and production runner migration remain future work.
