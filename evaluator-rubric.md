# Evaluator Rubric

Use this rubric for the clean publish clone recovery hotfix that follows PR #296.

| Dimension | Score 0-2 | Evidence |
| --- | --- | --- |
| Symptom match | 2 | A real merged-main non-publish run stops at prepare_clean_worktree with the exact checkout failure recorded in the dated summary. |
| Root cause | 2 | Fetch succeeds; the dedicated clone is 361 commits behind with tracked residue, and ordinary checkout runs before reset. Existing node_modules also predates the current pnpm lock contract. |
| Scope safety | 2 | Force applies only to the existing dedicated clone after its path passes the current .tmp boundary check; user worktrees and external paths are unchanged. |
| Correctness | 2 | Existing clones use checkout --force -B, retain hard reset/clean, and refresh dependencies with the frozen lockfile. |
| Regression coverage | 2 | The two confirmed failures are RED before implementation and GREEN after it; checkout argv and dependency invocation are deterministic. |
| Verification | 2 | Focused 2/2, affected publish 54/54, live workflow, Harness, diff, final-head CodeQL, and post-merge runtime are the acceptance chain. |
| Affected suite | 2 | Full tests/publish.test.js passes 54/54; live workflow contract passes without failures or warnings. |
| Data preservation | 2 | The old dirty clone is not reset or deleted before an absolute-path manifest and quarantine preserve its exact historical variants and run evidence. |
| Non-goals | 2 | No automation, Aify, Source Watch, report content, public UI, mobile surface, backfill, or publish command changes. |
| Scope discipline | 2 | The diff remains inside publish preparation, its tests, REC-006/quality evidence, and ignored Harness state. |
| Runtime reliability | 2 | Failed-run residue and stale dependencies are both addressed at the dedicated-clone boundary. |
| Browser acceptance | 2 | Explicitly skipped because no Web behavior, artifact, or 1280x900 surface changed. |
| Agentic loops | 2 | Main-agent producer, deterministic verifier, and one independent read-only diagnosis completed one bounded loop. |
| Finish closeout | 2 | No duplicate generic review; PR state and evidence-preserving runtime replay are the remaining closeout gates. |
| Insight recommendations | 2 | The reusable-clean-state rule is promoted into tests and REC-006; no new skill is needed. |
| Validation efficiency | 2 | Full validate is explicitly skipped as disproportionate immediately after PR #296's 893-test aggregate gate; focused, affected, workflow, Harness, diff, CI, and post-merge runtime evidence cover the changed boundary. |
| Handoff readiness | 2 | REC-006, quality state, Harness state, PR status, archive evidence, and post-merge terminal result are the required closeout record. |

## Verdict

- Ready for the narrow PR after Harness and diff checks pass.
- Merge only when final-head CodeQL is green and the PR is conflict-free.
- Production acceptance requires evidence archive first, then a merged-main non-publish rerun that advances beyond prepare_clean_worktree.

## Residual risk

- Git command stderr remains summarized by a generic publisher error; this is diagnostic debt, not a blocker for the confirmed recovery path.
- Reused clean clones now pay one idempotent frozen-lockfile install per run to avoid stale dependency false confidence.
- Downstream pipeline stages may still reveal independent failures after prepare succeeds; report their actual terminal state without attributing them to this fix.
