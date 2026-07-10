# Evaluator Rubric

Use this rubric after implementation and before acceptance. The current scores are pre-delivery: local deterministic and browser gates are green, while PR/merge and post-merge production evidence remain.

| Dimension | Question | Score 0-2 | Notes |
| --- | --- | --- | --- |
| Alignment | Were requirement intake, selected direction, target spec, open questions, and acceptance criteria recorded before implementation? | 2 | The authoritative acceleration Handoff, D1-D5, automation freeze, final-batch policy, A5/A6 boundaries, and one-ledger rule are recorded in current-task/decisions. |
| Correctness | Does the implemented behavior match the active task and feature state? | 2 | Local behavior, one-automation scheduler semantics, Source Watch lineage, official-blog context, D1 retirement, and public UI all match the active decisions; production proof remains a delivery-stage gate rather than a known correctness defect. |
| TDD discipline | Did the work follow the agreed P0/P1/P2 matrix, with RED/GREEN evidence where practical? | 2 | RED/GREEN and review regressions cover shared admission truth, per-source effectiveness, partial Source Watch endpoints, latest event, fingerprint lineage, fixed-date receipt, blog hashes/types, and dead-search removal. |
| Verification | Were the required checks actually run with recorded evidence? | 2 | Final full validation passes 900 / 898 / 0 / 2, including build-clean, privacy and E2E; 116/116 affected tests, 5/5 visual contracts, workflow/Harness/diff, and desktop/mobile browser scenarios are recorded. Real pipeline/previews correctly wait for merged remote main. |
| Scope discipline | Did this session stay within the selected task and allowed paths? | 2 | No repeated generic audit, second ledger, public search, stricter blog gate, D5, historical HTML deletion, credential mutation, or unrelated automation change occurred. `ai-2` retained all non-prompt fields; `ai-7` and two proven orphan definitions were evidence-backed cleanup within authorization. A5/A6 stayed within authorized absolute roots/manifests. |
| Runtime reliability | Can the standard startup path, health checks, or user flow run again? | 1 | Harness/startup and focused runtime contracts are repeatable; A5/A6 are reconciled. Real Source Watch/blog consumption and the three backfill previews remain unproven. |
| Browser acceptance | For Web changes, did agent-run browser acceptance prove URL, viewport, console/network, and artifact behavior? | 2 | Isolated current-build and generated-fixture servers were verified at 1440x1000 and 390x844. Source Watch, original links, title contrast, official-blog entry/page, no-search state, privacy, and overflow passed; one non-blocking favicon 404 is recorded as P2. |
| Agentic loops | Were producer, verifier, read-only arbiter, evidence, and main-agent decision recorded for material loop work? | 2 | Targeted investigations, code/state reviews, test-contract diagnosis, browser verification, and main-agent fixes are recorded; final delivery review is running separately. |
| Finish closeout | Did final review, technical-debt/drift inspection, and PR/merge-readiness handling run or have explicit skip reasons? | 1 | Independent implementation/state reviews and local full/browser gates are complete; PR, CI, conflict handling, merge, and post-merge runtime closeout are still pending. |
| Insight recommendations | Did the session produce or explicitly skip an insight audit for tool calling, AI infrastructure, docs/code conflicts, and skill/workflow extraction candidates? | 1 | Earlier insight recommendations are implemented in contracts and the ledger; the final current-session trace collector/report still needs to run after delivery facts stabilize. |
| Maintainability | Are code and repo-local docs clear enough for the next session? | 2 | The sole REC ledger, feature status, workflow/resilience contracts, Source Watch lineage, private blog receipt, D1 terminal state, and A5/A6 manifests explain both completed and retained work. |
| Handoff readiness | Can a new session continue from repo-local state without guessing? | 1 | Repo-local state is being synchronized with the green local gates, but PR/merged SHA, real-run, previews, local-main backup/sync, and final insight facts are not available yet. |

## Verdict

- Local implementation, external automation consolidation, A5/A6 operations, full validation, and browser acceptance are green with no known P0/P1.
- The Slice is ready for PR delivery, but production acceptance remains conditional on merged-main real-run and preview evidence.

## Follow-up

- Create the verified checkpoint and PR, resolve checks/conflicts, and merge under the user's explicit authorization.
- From merged `origin/main`, run the real non-publish pipeline and three previews; only then publish/backfill and close production evidence.
