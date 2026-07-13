# Evaluator Rubric

Use this rubric for REC-331, the Aify News logical-source observability Slice.

| Dimension | Score 0-2 | Evidence |
| --- | --- | --- |
| Problem match | 2 | The previous `first_class` intent had only a homepage watch, no article collection entry, stable logical identity, or multi-day production proof. |
| Authority safety | 2 | Aify remains T3 `aggregator` / `ai_news_aggregator` with `intermediary_only` verification and primary-source confirmation requirements. |
| Publisher truth | 2 | Generic JSON live and cache paths retain the payload's original publisher instead of attributing every item to Aify. |
| Collection wiring | 2 | `content-aify-news` collects the real `/articles.json` endpoint and maps with `site-aify-news` to one `aify-news` logical source. |
| Effectiveness truth | 2 | Stable audit IDs and parsed counts survive Source Watch; persisted main rejection reasons take precedence and non-main exclusion reasons remain visible. |
| Correctness | 2 | Phase5 checks three exact consecutive dates across source effectiveness, persisted candidate pool, terminal disposition, and dated public article URLs. |
| False-green resistance | 2 | Missing days/rows/reachability/parse/candidates/reasons, effectiveness-inclusion drift, and included/public URL mismatches all keep `production_verified=false`. |
| Public proof threshold | 2 | A passing window requires every day complete and at least one unique public URL match; fixture or endpoint replay cannot satisfy production proof. |
| Contract synchronization | 2 | Registry, generated inventory, handbook, display contract, feature state, REC-331, and unit counts agree on 166 entries / 49 logical sources. |
| Regression coverage | 2 | Focused RED/GREEN covers live/cache publisher truth, authority, exclusion reason, positive three-day closure, and negative missing/mismatched evidence. |
| Verification | 2 | Aify, Source Watch producer/draft, Phase5, effectiveness, display, and inventory checks pass 41/41; final validation passes 898 total / 896 pass / 0 fail / 2 skipped with build-clean, privacy, E2E, Harness, source, design, and diff gates. |
| Runtime reliability | 2 | Read-only 2026-07-11/12/13 endpoint replays each return five date-correct candidates with original publishers and intermediary authority. |
| Current-state honesty | 2 | The committed-history audit reports 0/3 complete days, zero public matches, and `production_verified=false`; the feature remains `observing`. |
| Scope discipline | 2 | No automation prompt, schedule, publish behavior, reports-data, backfill, public UI, or unrelated source promotion is changed. |
| Browser acceptance | 2 | Explicitly skipped because no Web composition changed; the only supported viewport remains `1280x900`, and no mobile/tablet/narrow/touch logic or artifacts are introduced. |
| Validation efficiency | 2 | Development uses focused/affected checks and one final full validate at PR preparation, with one bounded read-only review. |
| Agentic loops | 2 | Main-agent producer, deterministic RED/GREEN verifier, and one bounded read-only P0/P1 reviewer form a single closeout loop. |
| Finish closeout | 2 | Final diff, project-rule drift, authority safety, CI, conflict status, and residual production-observation boundary are checked once before delivery. |
| Insight recommendations | 2 | Record the repository-guard `.tmp` hashing cost and workflow-router wording false positive as workflow/eval follow-ups; do not widen REC-331. |
| Handoff readiness | 2 | REC-331, feature state, quality snapshot, Harness state, PR head, CI/mergeability, and post-merge observation boundary form the closeout record. |

## Verdict

- Ready for final full validation and PR preparation after the bounded read-only review reports no unresolved P0/P1.
- Merge only when final-head CodeQL is green and GitHub reports the PR conflict-free.
- Keep the feature at `observing` after merge; only three future persisted production days with at least one public match may advance it to `production_verified`.

## Residual risk

- Aify is a third-party aggregator whose payload shape and availability can change; generic parser/cache behavior is covered, but natural production observation remains necessary.
- Preserving original publisher text improves attribution but does not prove factual authority; admission must continue to require primary evidence.
- Historical committed reports predate this collection entry, so replay demonstrates capability only and must never be presented as scheduled-run evidence.
