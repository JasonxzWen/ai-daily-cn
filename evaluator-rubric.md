# Evaluator Rubric

Use this rubric for the REC-314 GitHub Trending canonical source-effectiveness closeout.

| Dimension | Score 0-2 | Evidence |
| --- | --- | --- |
| Problem match | 2 | The immutable 2026-07-09 report says 70 candidates / 30 included while the candidate pool and final sections prove 50 / 20 canonical repositories. |
| Correctness | 2 | Candidate facts canonicalize by owner/repo; final `github_trending` plus matching `projects` own inclusion truth; stale flags cannot create public inclusion. |
| Count semantics | 2 | `candidate_count` represents canonical collected repositories; `included_count` represents canonical final report-section union; renderer Top10 remains a presentation cap. |
| Shared contract | 2 | Source effectiveness and draft source audit reuse one exported canonical identity/count helper instead of duplicating the definition. |
| Compatibility | 2 | Non-GitHub logical sources retain the existing raw-candidate behavior; GitHub selection, Top20 report, Top10 render, rank, cache and language logic are unchanged. |
| Failure behavior | 2 | Missing final report identities fail closed to not included; unknown candidate identity remains a distinct record rather than being silently collapsed. |
| Verification | 2 | Three RED/GREEN paths cover original/derived dedupe, stale included flags and the weekly Top20 integration; affected source-effectiveness tests pass 14/14 and the full unit suite passes. |
| Real evidence | 2 | Running the new counter against the committed 2026-07-09 report + candidate pool returns exactly 50 candidates / 20 included / public true without rewriting history. |
| Scope discipline | 2 | Only source-effectiveness, draft audit wiring, deterministic tests and governance records change; no Web/mobile/automation/publish/backfill surface changes. |
| Runtime reliability | 2 | The report is assembled before effectiveness is computed, so production no longer asks a candidate flag to stand in for the final public artifact. |
| Browser acceptance | 2 | Explicitly skipped because no Web composition changed; `1280x900` remains the sole supported viewport and existing E2E remains in the final gate. |
| Validation efficiency | 2 | Development uses three REDs, one affected suite, one full unit run and one final repository gate; no repeated generic review. |
| Agentic loops | 2 | Main-agent Producer, deterministic Verifier and CI Arbiter form one bounded closeout loop; prior evidence work is reused. |
| Finish closeout | 2 | Final diff, real artifact probe, full validation, PR mergeability/checks and residual lane-health gaps are checked once before delivery. |
| Insight recommendations | 2 | The repeated false-green pattern becomes a shared deterministic contract under REC-314 rather than a new audit or memory-only warning. |
| Handoff readiness | 2 | REC-314/S-82, feature inventory, roadmap, quality snapshot, Harness state and PR status share one closeout record. |

## Verdict

- Implementation and the single final repository gate are complete; no unresolved product ambiguity remains.
- Merge only when final-head required checks are green and GitHub reports the PR conflict-free.
- Keep REC-314 `locally_verified` until a fresh merged-main production report persists canonical counts.

## Residual risk

- Historical 70/30 artifacts remain unchanged as evidence.
- Other logical source lanes still require their own per-source production evidence; this PR does not assume GitHub's derived-record pattern applies globally.
- Final validation passes 907 total / 905 pass / 0 fail / 2 skipped; PR/CI and fresh merged-main production evidence remain.
