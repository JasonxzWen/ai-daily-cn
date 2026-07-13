# Evaluator Rubric

Use this rubric for REC-324, first-pass public authoring before formal quality review.

| Dimension | Score 0-2 | Evidence |
| --- | --- | --- |
| Problem match | 2 | Routine public prose was produced by deterministic templates and then repaired after review; available real evidence showed repair on 2/2 observed dates and 11-12 tasks per run. |
| Stage order | 2 | The production wrapper injects authoring after `report_draft` and before the first `quality_review`; direct runner callers remain backward compatible. |
| Correctness | 2 | Story title/narrative, hot-blog summary, GitHub description, and Builder translation paths are enumerated up front and must each be edited exactly once. |
| Write safety | 2 | The existing JSON Schema, path allowlist, task identity checks, and host-side applier remain the only mutation boundary; facts, links, source identity, dates, and audit data are not authorable. |
| Fail-closed behavior | 2 | Unavailable, invalid, extra, duplicate, missing, partially applied, or rejected contracts leave the original draft as the formal-review input. |
| Artifact truth | 2 | `.tmp/daily-report.authored.json` is consumed only after full acceptance; a partial private artifact cannot become current report state. |
| Accounting truth | 2 | `automation_first_pass_authoring` reports attempt, task/edit/applied/rejected counts, first-review result, exceptional-repair count, and reason independently of `automation_ai_repair`. |
| Repair authority | 2 | Initial and follow-up repair contracts contain only error-covered public-editorial tasks; `translation_fidelity` remains advisory evidence and cannot trigger writes. |
| Compatibility | 2 | Existing exceptional repair/resume, retry budget, terminal summary, Source Watch, selection, report-write, and publish boundaries remain unchanged. |
| Verification | 2 | RED/GREEN covers proactive four-lane planning, exact coverage, stage order, authored-state preservation, repair accounting, partial fallback, advisory exclusion, and legacy task compatibility; focused tests pass 53/53, affected daily-runner tests 36/36, and final validation 903 total / 901 pass / 0 fail / 2 skipped. |
| Policy synchronization | 2 | `first_pass_authoring` is one shared runtime stage in the resilience contract; its plan/apply artifacts do not create parallel stage vocabulary. |
| Current-state honesty | 2 | Repository evidence may establish local correctness only; the feature remains `locally_verified` until three future real runs satisfy the production thresholds. |
| Runtime reliability | 2 | Over three consecutive real non-publish runs, at least two must pass first review directly; exceptional-repair tasks must have median 0 and daily maximum 2, with zero plain-language blockers. |
| Scope discipline | 2 | No UI, mobile/tablet/narrow/touch support, source admission, scheduler definition, automation prompt, backfill, or publication is changed. |
| Browser acceptance | 2 | Explicitly skipped because no Web composition changed; the only supported viewport remains `1280x900`. |
| Validation efficiency | 2 | Development uses focused affected tests, one bounded P0/P1 review, and one final full validation at PR preparation. |
| Agentic loops | 2 | Main-agent implementation, deterministic RED/GREEN verification, and one read-only P0/P1 reviewer form the single closeout loop. |
| Finish closeout | 2 | Final diff, contract synchronization, project-rule drift, CI, mergeability, and residual real-run boundary are checked once before delivery. |
| Insight recommendations | 2 | Existing session insight is reused; no duplicate 14-day scan or second generic audit is performed. |
| Handoff readiness | 2 | REC-324, feature state, quality snapshot, Harness state, PR head, CI/mergeability, and post-merge observation thresholds form one closeout record. |

## Verdict

- Ready for PR preparation: the one final full validation passed and the bounded re-review reports no unresolved P0/P1.
- Merge only when final-head required checks are green and GitHub reports the PR conflict-free.
- Keep REC-324 at `locally_verified` after merge; only three consecutive real runs meeting the stated thresholds may advance it to `production_verified`.

## Residual risk

- A full authoring plan can be larger than the previous exceptional-repair contract; production observation must measure call duration and failure rate without weakening exact coverage.
- Authoring quality is still model-dependent, so the deterministic formal review and bounded exceptional repair remain mandatory safety nets.
- Historical replay can prove contract behavior but cannot establish that future scheduled runs make repair exceptional.
