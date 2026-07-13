# Evaluator Rubric

Use this rubric for the REC-331 Aify production-evidence closeout.

| Dimension | Score 0-2 | Evidence |
| --- | --- | --- |
| Problem match | 2 | Aify promotion existed, but the production Phase5 stage omitted the logical source and aggregate `some` semantics allowed a site-only shell to pass. |
| Correctness | 2 | Production explicitly audits `aify-news`; `content-aify-news` and `site-aify-news` are both required per day. |
| Evidence semantics | 2 | Each required entry reports observation, candidate count, included/excluded counts, reasons, unresolved items and completeness. |
| Failure behavior | 2 | Missing entries/candidates fail closed; site-only evidence cannot verify; a hybrid candidate with conflicting source and watch identities satisfies neither required entry. |
| Public truth | 2 | Included candidates still require dated `docs/articles.json` matches and all non-included candidates require persisted reasons. |
| Shared Phase5 | 2 | A logical-source day cannot pass when the same day's shared admission/lineage Phase5 fails. |
| Runtime reliability | 2 | The runner copies the full logical-source evidence projection into the trusted terminal run summary before stage output sanitization. |
| Authority boundary | 2 | Original publisher, `ai_news_aggregator`, `intermediary_only` and primary-source confirmation requirements remain unchanged. |
| Compatibility | 2 | Non-Aify logical sources retain their existing behavior; Source Watch producer, selection and publication logic are untouched. |
| Real evidence | 2 | The current 2026-07-11..13 audit reports both required entries, 0/3 complete days, 0 matches and `production_verified=false` without rewriting history. |
| Verification | 2 | Aify 8/8, affected Aify/Source Watch 21/21, runner Phase5 2/2, workflow/Harness/diff gates pass; final aggregate is 910 total / 908 pass / 0 fail / 2 skipped with build-clean, 194-file privacy and desktop E2E green. |
| Scope discipline | 2 | No Web, mobile/tablet/narrow/touch, automation definition, official-blog, generated report or backfill changes. |
| Browser acceptance | 2 | Explicitly skipped because no Web composition changed; `1280x900` remains the sole supported viewport. |
| Validation efficiency | 2 | Development used exact RED failures, one affected batch, one runner pattern batch and one final repository gate; only the E2E tail was repeated after its terminal exit code was lost. |
| Agentic loops | 2 | Main-agent Producer, deterministic Verifier, one bounded reviewer and final-head CI form the closeout loop. |
| Finish closeout | 2 | One bounded P0/P1 review and one final repository gate cover the changed runner/evidence boundary without a second generic review. |
| Insight recommendations | 2 | The durable lesson is encoded in code/tests: a first-class label requires persisted per-entry production receipts. |
| Handoff readiness | 2 | REC-331/S-79, feature inventory, roadmap, quality snapshot, Harness state and PR status share one record. |

## Verdict

- The implementation passed the final repository gate and the bounded hybrid-fix re-review returned Ready with P0/P1=0; no product ambiguity remains.
- Merge only when final-head required checks are green and GitHub reports the PR conflict-free.
- Keep Aify status `observing` / REC-331 `locally_verified` until three consecutive post-merge production days pass with at least one public match.

## Residual risk

- The current history truthfully contains no qualifying Aify production day; this PR must not manufacture or backfill one.
- Any unrelated shared Phase5 failure correctly invalidates that day's Aify evidence.
- PR/CI and post-merge production evidence remain.
