# Clean State Checklist

Use this checklist before handoff.

- `git status --short` has been reviewed.
- Read-only Harness Hub startup check (`harness-hub check . --json`) has been run or explicitly skipped with a reason.
- Standard startup path has been run or explicitly skipped with a reason.
- Requirement intake, selected direction, rejected alternatives, target spec, open questions, and alignment status are recorded for change work.
- The P0/P1/P2 test matrix in `.harness-hub/state/current-task.md` matches the validation commands and recorded results.
- Changed files match the current task's allowed paths.
- Forbidden paths were not modified.
- Temporary logs or generated artifacts are in ignored locations.
- Validation commands from `.harness-hub/state/current-task.md` have been run or explicitly skipped with a reason.
- `.harness-hub/state/progress.md` and `.harness-hub/state/session-handoff.md` record each validation command's status, exit code, passed/failed counts when available, evidence, and checkpoint commit state.
- Runtime signals, health checks, or failure messages that affected the work are recorded.
- P0 validation passed before handoff, including behavior tests, nearest suite, static/runtime gates, and Web browser acceptance when required.
- P1 checks are run or risk-assessed for affected module, integration, system, API, data-flow, or cross-boundary behavior.
- P2 hardening checks are run or explicitly deferred with a reason.
- Web browser acceptance records local URL, scenario, viewport, console/network findings, and screenshot or trace evidence when the task touches Web user-visible behavior.
- PR status is checked and recorded after any PR creation or update, including mergeability, CI/check-run status, conflicts, branch-protection blockers, fixes pushed, validation reruns, and any user/external blocker.
- Agentic loop records are captured for material work: loop type, producer, verifier, read-only arbiter, evidence, main-agent decision, and follow-up or explicit skip reason.
- Finish closeout is recorded for material changes: final independent review findings or skip reason, technical-debt/drift warnings, PR/merge readiness, conflict decisions surfaced to the user, and `insight` recommendations or skip reason.
- Review Feedback To Rules entries are updated when a repeated comment should become a durable harness rule.
- Repeated review feedback has been promoted to a rule, validation command, or explicit follow-up.
- Each completed atomic work unit has a verified checkpoint commit when commits are permitted, or the skip reason is recorded.
- If a PR was created or updated, progress and handoff state record the PR URL or number, branch, base, commit, validation status, skipped checks, residual risk, and next action.
- `evaluator-rubric.md` and `quality-document.md` were updated when material validation or quality evidence changed.
- `.harness-hub/state/decisions.md` records decision-level changes or explicitly remains unchanged.
- `.harness-hub/state/progress.md` and `.harness-hub/state/session-handoff.md` reflect the current state.
- `node scripts/harness-validate.mjs` passes.
