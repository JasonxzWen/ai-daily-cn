# Evaluator Rubric

Use this rubric for the S-73 exhausted-repair advisory-isolation slice.

| Dimension | Score 0-2 | Evidence |
| --- | --- | --- |
| Problem match | 2 | The real failure mixed four error-covered public-editorial blockers with ten advisory fidelity tasks; the sibling retry classifier was already fixed, but the terminal degradation classifier still treated every task as a veto. |
| Correctness | 2 | Safe degradation now requires at least one authorized editorial task and full coverage of every error-severity path; unrelated blockers remain fail-closed. |
| Authority boundary | 2 | Advisory tasks stay in the review artifact but cannot authorize writes, veto degradation, inflate residual counts, or create affected sections. |
| Failure behavior | 2 | Empty editorial sets and any non-covered or explicitly non-degradable blocking issue still return the existing hard block. |
| Compatibility | 2 | Publish commands, scheduler configuration, review schemas, retry budget, and report generation are unchanged. |
| Runtime reliability | 2 | The fix is inside the repository-owned terminal classifier, so every production invocation uses the same authority rule without scheduler prompt logic. |
| Verification | 2 | The mixed-task regression (including an unmatched stale editorial task), related runner cases, isolated unit suite (540/540), and full repository gate (911 total / 909 pass / 0 fail / 2 skipped) pass. |
| Scope discipline | 2 | The slice changes one classifier, one regression, and the existing recovery/evidence records; no Web or generated public artifact changed. |
| Browser acceptance | 2 | Explicitly skipped because no Web composition changed; `1280x900` remains the sole supported viewport. |
| Validation efficiency | 2 | Development used one exact RED, one GREEN, one related-pattern batch, one affected suite, and reserves a single full validation for PR preparation. |
| Agentic loops | 2 | Main-agent Producer, deterministic focused tests, one bounded independent reviewer, and final-head CI form the closeout loop. |
| Finish closeout | 2 | The bounded independent re-review is Ready with P0/P1=0 after closing stale-task scope and evidence-count findings. |
| Insight recommendations | 2 | Retry and terminal degradation now reuse one error-covered task helper; the next slices address monotonic progress and real-artifact contract drift. |
| Handoff readiness | 1 | Local implementation and closeout evidence are complete; PR/CI and fresh scheduled proof remain. |

## Verdict

- The behavior fix passed final repository validation and bounded independent review.
- Do not call the issue production-verified until a merged-main scheduled run reaches the expected terminal state.
- Merge only with explicit user authorization after required checks are green and GitHub reports the PR conflict-free.

## Residual risk

- This slice does not solve stale feedback, non-monotonic repair, or artifact-schema drift; those remain the next two stacked PRs.
- A later `report_write` contract failure can still block an otherwise degradable run until the production artifact replay slice lands.
