# Evaluator Rubric

Use this rubric for the REC-401 source-level artifact replay slice stacked on REC-324.

| Dimension | Score 0-2 | Evidence |
| --- | --- | --- |
| Problem match | 2 | The 2026-07-14 scheduled artifact contains 32 candidate source-level enum failures across four live values; three affected Wechat2RSS candidates were already selected, while `sources:validate` falsely passed because the registry schema ignored the field. |
| Correctness | 2 | The synchronized vocabulary, constrained snake/camel aliases, fallback propagation, third-party classification, producer normalization, negative guards, and exact artifact replay address the full delayed-failure chain rather than only widening one enum. |
| Root-cause correction | 2 | Source registry, candidate, and report schemas now expose an order-identical vocabulary guarded by one synchronization regression; all six configured production values are covered, both declared key spellings are validated, and unknown values fail closed. |
| Producer boundary | 2 | `generateReportDraft` normalizes schema plus internal source/candidate references immediately after selection and before evidence caching, source-status writes, authoring, or report/candidate artifact writes. |
| Runtime semantics | 2 | Snake-case and legacy camelCase levels survive collection, and the six added levels keep third-party disclosure semantics rather than gaining primary authority from schema acceptance. |
| Runtime reliability | 2 | Structural source-level defects now stop before evidence fetches, Codex authoring, quality/repair loops, and artifact writes, avoiding a repeat of the expensive delayed `report_write` failure. |
| Historical replay | 2 | A small fixture preserves run ID, date, candidate count, original SHA-256, pre-fix error counts, and three selected IDs. It is explicitly `production_verified:false`; the full external 336-candidate artifact is replayed read-only rather than committed. |
| Negative safety | 2 | Unknown registry and candidate values are rejected; a draft containing one cannot write either producer artifact. Schema expansion remains enum-bound rather than accepting arbitrary strings. |
| Compatibility | 2 | Existing Aify, source-effectiveness, content-contract, and full unit behavior remain green. Producer validation also forced three already-emitted story-audit fields into schema and normalized eight explicit legacy editorial aliases without changing source priority, admission thresholds, authority, scheduler, or publish behavior. |
| Scope discipline | 2 | The slice changes only schemas, discovery metadata propagation, candidate producer validation, focused tests/fixture, and durable contract records. It adds no replay CLI or second production entrypoint. |
| Browser acceptance | 2 | Explicitly skipped because no Web composition changed; `1280x900` remains the sole supported viewport and mobile/touch variants remain unsupported. |
| Validation efficiency | 2 | Five focused RED tests failed for the intended source-level reasons. The first PR-preparation full run then exposed eight legitimate producer/schema mismatches; focused diagnosis fixed the shared story/audit and editorial-alias boundary, the affected suite passed 577/577, and only one successful full retry was run. |
| Verification | 2 | Focused 5/5, affected 577/577, 166-source registry validation, exact external replay, and final validation all pass. Final aggregate: 923 total / 921 pass / 0 fail / 2 skipped, including Harness, build-clean, 194-file privacy, E2E, JSON, and diff gates. |
| Agentic loops | 2 | Three independent read-only analyses agreed on the source-level drift, delayed failure boundary, REC ownership, and minimal no-new-entrypoint implementation before the producer change. |
| Production truth | 2 | The exact candidate artifact now validates 336/336 at SHA-256 `2f25b5...fb0e`; the optimized report has zero source-level errors. Historical replay remains evidence only, not a merged-main production claim. |
| Finish closeout | 2 | Final independent review is Ready with P0=0/P1=0 after its camelCase fail-closed and task-path findings were corrected; only two non-blocking P2 hardening suggestions remain. |
| Insight recommendations | 2 | The 15-day audit identifies validation closure, environment readiness, and tool-branch friction as the top collaboration costs. Keep exact artifact replay and contract synchronization in the existing delivery/verification workflow; do not create another standalone skill or entrypoint. |
| Handoff readiness | 1 | Local delivery is green and independently reviewed. Stacked PR/CI and fresh merged-main non-publish evidence remain before remote delivery/production verification. |

## Verdict

- The hidden post-repair blocker is corrected at the earliest stable producer boundary without weakening REC-324 repair safety.
- Do not call REC-401 or REC-311 production-verified from this historical replay; require a fresh run from merged `origin/main`.
- Merge only with explicit user authorization after required checks are green and GitHub reports the stacked PR conflict-free.

## Residual risk

- The six new values preserve current taxonomy; a future authority/lane/transport field split remains separate technical debt.
- Broader latest-report prose, public/internal leak, and final HTML artifact validation still keep roadmap Slice 1 partially open.
