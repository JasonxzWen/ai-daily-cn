# Evaluator Rubric

Use this rubric for REC-323: converge main-stream ranking, terminal disposition, snapshot, quality, Phase5, report-write, and public projection on one production fact chain.

| Dimension | Score 0-2 | Evidence |
| --- | --- | --- |
| Alignment | 2 | The task explicitly excludes Aify, automations, publishing, search, layout work, and every mobile/tablet/narrow/touch variant. |
| Correctness | 2 | `draft.js` is the sole production scorer/selector; score, global rank, terminal selection/rejection, story lineage, snapshot counts, and report order are persisted and cross-checked. |
| Contract safety | 2 | New report/pool pairs declare audit contract version 1 and fail closed on missing/mismatched receipts; historical pairs with neither marker remain readable. |
| Dead-path removal | 2 | The post-quality synthetic editorial-rank/classification producer, schemas, CLI, runner stage, policies, scripts, fixtures, and tests are retired together. |
| Verification | 2 | Affected unit suite 143/143 and publish suite 54/54 pass. The final aggregate gate completed with 893 total / 891 pass / 0 fail / 2 skipped, followed by green build-clean, 194-file privacy, E2E, Harness, and diff checks; one stale official-blog date fixture and one load-sensitive timeout fixture were corrected without production changes. |
| Real-data proof | 2 | Cleaned 2026-07-09 replay: 342 audited sources, 12 selected sources, 330 rejected, 0 dual, 0 missing, 40 globally ranked, 8 public stories, monotonic score/rank, zero consistency issues, and no public internal-field leak. |
| Browser acceptance | 2 | Existing Ops status consumption was checked once at the sole supported `1280x900`; no console warning/error or horizontal overflow, screenshot under `.tmp/rec323-real/`. |
| Runtime reliability | 2 | Shared fail-closed checks cover quality, report-write, and Phase5; the cleaned real-date replay remains runnable without publishing. |
| Agentic loops | 2 | Main-agent producer, deterministic verifier, and one independent read-only arbiter completed one bounded loop. |
| Finish closeout | 2 | The independent review found four P1 groups; each was fixed and the affected suites were rerun without another generic review. |
| Insight recommendations | 2 | The broader recovery insight already identified this fact split; its lesson is now encoded as versioned receipts, one collector, tests, and REC-323. |
| Handoff readiness | 2 | Branch, validation, review findings, CI boundary, post-merge runtime proof, and next Aify PR are recorded in Harness state. |
| Independent review | 2 | One bounded read-only review found 0 P0 and four P1 groups; explicit versioning, score/rank ordering, source-to-story lineage, and 5/8/12 drift were fixed and revalidated. |
| Scope discipline | 2 | No automation definition, external prompt, Aify source behavior, public IA, favicon, or mobile artifact changed. |
| Maintainability | 2 | Shared vocabularies and the consistency collector replace duplicated boundary logic; the stable REC ledger, feature inventory, quality record, and Harness handoff are updated. |

## Verdict

- PR #296 is ready for final CI and mergeability validation.
- No known P0/P1 remains after the single independent review and affected-suite replay.
- Merge is allowed only after required CI is green and the PR is conflict-free.

## Residual risk

- Historical candidate/report pairs intentionally skip the new collector only when both version markers are absent; one-sided or malformed markers fail closed.
- Historical editorial-rank artifacts remain immutable evidence, but no production stage generates or consumes new ones.
- A merged-main non-publish production entrypoint remains the post-merge runtime proof; until then REC-323 is `locally_verified`, not `production_verified`.
