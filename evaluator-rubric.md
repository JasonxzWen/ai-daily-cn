# Evaluator Rubric

Use this rubric after implementation and before acceptance.

| Dimension | Question | Score 0-2 | Notes |
| --- | --- | --- | --- |
| Alignment | Were requirement intake, selected direction, target spec, open questions, and acceptance criteria recorded before implementation? | 2 | Harness state was reset for the node result contract slice before product edits; design review P0s were adopted before implementation. |
| Correctness | Does the implemented behavior match the active task and feature state? | 2 | Adds a standalone executable DAG node result schema, fixture, helper, and semantic validator without changing dry-run summaries, package scripts, workflows, or production runner behavior. |
| TDD discipline | Did the work follow the agreed P0/P1/P2 test matrix, with RED/GREEN evidence where practical? | 2 | Added node result contract tests for success fixture/helper output, final failure, blocked, skipped, fanout item, barrier, schema-invalid envelopes, schema-pass/semantic-fail contradictions, and malformed no-throw inputs. |
| Verification | Were the required checks actually run with recorded evidence? | 2 | Targeted `node --test tests/daily-codex-dag.test.js` passed 19/19 after P1 fixes; `dag:validate`, pipeline compatibility, harness validation, `git diff --check`, and full `npm run validate` passed, including a re-run after final-closeout P1 fixes. |
| Scope discipline | Did this session stay within the selected task and allowed paths? | 2 | Current tracked changes are limited to DAG contract source, schema, fixture, tests, and quality docs; no package/workflow/production runner changes. |
| Runtime reliability | Can the standard startup path, health checks, or user flow run again? | 2 | Targeted DAG tests, `dag:validate`, pipeline compatibility, harness validation, and full regression pass. |
| Browser acceptance | For Web changes, did agent-run browser acceptance prove the local user flow with URL, viewport, console/network, and artifact evidence? | 2 | Explicitly deferred because no UI behavior changed. |
| Agentic loops | Were producer, verifier, read-only arbiter, evidence, and main-agent decision recorded for material loop work? | 1 | Design review completed with Fermat; implementation/tests review completed with Leibniz/Kepler after P1 fixes; spec/docs review found state P0/P1 and re-review is pending. |
| Finish closeout | Did final review, technical-debt/drift inspection, and PR/merge-readiness handling run or have explicit skip reasons? | 2 | Final closeout found P1 issues that were fixed; Singer re-review found no code P0/P1 and only this rubric wording fix before PR gates. |
| Insight recommendations | Did the session produce or explicitly skip an insight audit for tool calling, AI infrastructure, docs/code conflicts, and skill/workflow extraction candidates? | 2 | Full insight trace audit explicitly skipped for this narrow contract slice; concrete workflow lesson recorded from final closeout. |
| Maintainability | Are code and repo-local docs clear enough for the next session? | 2 | The contract separates dry-run summaries from final node results and names run/date, fanout, barrier, retry, artifact, dependency, issue, and audit semantics explicitly. |
| Handoff readiness | Can a new session continue from repo-local state without guessing? | 2 | Current-task, progress, and handoff describe this node-result slice with validation, review, residual risk, and remaining PR/merge gate details. |

## Verdict

- Accept for PR

## Follow-up

- Missing evidence: PR checks and merge status.
- Required fixes: none known after Singer final closeout re-review and this rubric wording fix.
- Closed gaps: executable node results now have a deterministic schema-backed object model before side effects are introduced.
- Deferred P2: live node execution, package/workflow wiring, real per-node artifact writes, and production runner migration remain future work.
- Next review trigger: full validation failure or final closeout review.
