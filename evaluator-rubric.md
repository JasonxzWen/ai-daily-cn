# Evaluator Rubric

Use this rubric for the REC-324 repair-convergence slice stacked on S-73.

| Dimension | Score 0-2 | Evidence |
| --- | --- | --- |
| Problem match | 2 | Recent scheduled runs repeatedly consumed stale first-review feedback, rewrote already-cleared paths, spent numeric retry budget without monotonic progress, and could re-enter through the post-write content contract. |
| Correctness | 2 | Current feedback, strict path/problem subset progress, resolved state, checkpoint rollback, and fail-closed terminal branches are explicit and covered by regressions. |
| Current feedback | 2 | Every new handoff and template carries only matching error-severity issues plus `issue.details`, active tasks, count, deterministic path/problem keys, and SHA-256 fingerprint; the canonical artifact is updated after repair and synthetic content-contract review. |
| Monotonic convergence | 2 | A later attempt is accepted only when its blocking-signal set is a strict subset of the last accepted set; same, replaced, or expanded signals enter `stalled` immediately. |
| Rollback | 2 | A stalled safe-editorial attempt restores the exact pre-attempt report checkpoint before disclosure; a missing checkpoint fails closed instead of claiming rollback. |
| Path authority | 2 | Direct runner readiness rejects empty, duplicate, and paths absent from the current `ai_review_tasks`; resolved paths remain frozen while legacy summaries without comparable feedback may establish one baseline. |
| Structural safety | 2 | Only whitelisted editorial content-contract failures matching the stalled active paths may suppress re-entry; story/GitHub/tracking/shape and unrelated path failures retain the hard block. |
| Resolution semantics | 2 | A successful review clears active signals into `resolved`; a genuinely new later editorial failure creates a fresh baseline instead of being compared with stale blockers. |
| Artifact integrity | 2 | Production authoring verifies the current review artifact report date and recomputed fingerprint against `next_action` before invoking Codex; stale or overwritten evidence blocks authoring. |
| Runtime reliability | 2 | The repository-owned runner persists every transition and canonical artifact; the scheduler prompt does not own repair business logic or retry decisions. |
| Prompt accuracy | 2 | The repair author receives current `issue.details`, actual Han-character semantics, and dynamic validator requirements; the stale fixed Builder `0.45` assertion is removed. |
| Compatibility | 2 | Old handoffs without fingerprints remain accepted, while old task-only runner summaries get one non-comparable migration attempt; schedule, publish command, and automation configuration are unchanged. |
| Scope discipline | 2 | The slice changes only exceptional-repair runtime, quality diagnostics, prompt evidence, policy records, and focused tests; no Web, source-selection, schedule, or generated public artifact changes. |
| Verification | 2 | Focused RED/GREEN tests cover current feedback, strict reduction, path freeze, rollback, structural fail-closed, resolved re-baseline, legacy migration, artifact fingerprints, and one-call stalled completion; final validation passes 918 total / 916 pass / 0 fail / 2 skipped with build-clean, 194-file privacy, E2E, Harness, workflow/resilience, JSON, and diff gates. |
| Browser acceptance | 2 | Explicitly skipped because this slice changes no Web composition; `1280x900` remains the sole supported viewport. |
| Validation efficiency | 2 | Development used focused cases and affected suites, then one successful full repository validation at PR preparation; an earlier attempt stopped immediately at the evaluator marker gate before expensive suites. |
| Agentic loops | 2 | Producer implementation and deterministic tests are followed by a bounded independent P0/P1 review; every review finding is converted into a regression or fail-closed guard before final verdict. |
| Finish closeout | 2 | Independent re-review is Ready with P0=0/P1=0 after all five findings, including synthetic review persistence, were fixed and retested. |
| Insight recommendations | 2 | Keep current-review fingerprint validation in the production handoff; use the next real-artifact replay slice to detect source-level schema drift without duplicating repair predicates. |
| Handoff readiness | 2 | Local implementation, final repository gate, and independent closeout are complete; stacked PR/CI and merged-main scheduled evidence remain external delivery and production-verification gates. |

## Verdict

- The repair loop now has a current-feedback, strict-progress, rollback, and re-entry contract instead of relying on remaining retry count.
- Do not call REC-324 production-verified until consecutive merged-main non-publish or scheduled observations meet its existing acceptance window.
- Merge only with explicit user authorization after required checks are green and GitHub reports the stacked PR conflict-free.

## Residual risk

- This slice makes exceptional repair converge safely; it does not prove first-pass authoring is already good enough in production.
- The next stacked slice must replay real non-publish production artifacts and close source-level contract drift without weakening these fail-closed boundaries.
