# Evaluator Rubric

Use this rubric for REC-332, truthful GitHub Trending enrichment facts.

| Dimension | Score 0-2 | Evidence |
| --- | --- | --- |
| Problem match | 2 | The 2026-07-09 real Top20 proved three false facts: public `language=all`, cross-scope/public-rank trend comparison, and 19 false README cache hits with unknown SHA. |
| Correctness | 2 | Repository language is independent from ranking scope, movement accepts only a positive same-scope `source_rank`, and cache identity is the README content SHA-256. |
| Language semantics | 2 | Raw `language/window` remain ranking scope; `repository_language` is independently collected from Trending HTML or GitHub REST and becomes the existing public language value. |
| Rank correctness | 2 | History keys include repo plus source scope and prefer `source_rank`; a different or unknown scope cannot create previous-rank movement. |
| Cache truth | 2 | README content is SHA-256 keyed; first network fetch is `hit:false`, and only an exact prior key with a usable summary can become `hit:true`. |
| Failure behavior | 2 | API failure preserves scraped language; unknown history fails closed to `new`; README failure keeps rank/star/trend/error and does not invent a description. |
| Candidate durability | 2 | Candidate schema and normalization persist scope `language/window` plus `repository_language` instead of relying only on transient raw metadata. |
| Public compatibility | 2 | The report continues to use its existing `language` and `source_scope` fields, so current render/interaction contracts gain the right value without a new UI shape. |
| Selection compatibility | 2 | Weekly all-language and five language pools still merge/dedupe into Top20 using scope language; repository language never affects selection. |
| Verification | 2 | RED/GREEN covered HTML/API language, candidate/report/interaction projection, scope-aware source-rank movement, and first/second-run README cache behavior; focused tests pass 16/16 and the affected unit suite passes 253/253. |
| Full validation | 2 | Final validation passes 905 total / 903 pass / 0 fail / 2 skipped, including build-clean, 194-file privacy scan, desktop E2E, Harness, source/design/workflow/DAG and diff gates. |
| Current-state honesty | 2 | REC-332 remains `locally_verified`; historical broken artifacts are evidence, not rewritten proof. Three fresh merged-main runs are required for production verification. |
| Scope discipline | 2 | No UI layout, mobile/tablet/narrow/touch support, scheduler, automation prompt, admission, backfill, publication, or historical artifact is changed. |
| Runtime reliability | 2 | Unknown legacy scope/rank fails closed to `new`; API failure preserves scraped language; README failure retains known rank/star/trend/error facts without inventing prose. |
| Browser acceptance | 2 | Explicitly skipped because no Web composition changed; production report interaction and legacy render behavior are covered deterministically, and `1280x900` remains the sole supported viewport. |
| Validation efficiency | 2 | Development used focused tests, one affected suite, one final full validation, and one bounded P0/P1 review. |
| Agentic loops | 2 | Two bounded read-only discovery passes found the real gaps; main-agent RED/GREEN implementation plus one final read-only reviewer form the closeout loop. |
| Finish closeout | 2 | The sole reviewer P1—falling back to public merged `rank`—was reproduced by RED, fixed to require positive `source_rank`, and revalidated without opening another generic review. |
| Insight recommendations | 2 | Existing session insight is reused; the false cache/rank/language evidence is promoted into REC-332 and deterministic contracts instead of another generic audit. |
| Handoff readiness | 2 | Feature inventory, roadmap, REC-332/S-81, quality snapshot, Harness state, PR head, CI/mergeability, and three-run thresholds form one closeout record. |

## Verdict

- Ready for PR preparation: the bounded reviewer reported one P1, its regression is now GREEN, and no unresolved P0/P1 remains.
- Merge only when final-head required checks are green and GitHub reports the PR conflict-free.
- Keep REC-332 at `locally_verified` after merge; only three consecutive real runs meeting the stated thresholds may advance it to `production_verified`.

## Residual risk

- Existing reports keep their historical `all`, cross-scope trend, and `sha:unknown` values; they are not rewritten to manufacture green history.
- REST topics/license/total stars still depend on a GitHub token, while HTML language and weekly star velocity remain credential-free fallbacks.
- PR #299 has wired first-pass GitHub prose, but only fresh scheduled output can prove non-generic Chinese explanations in production.
