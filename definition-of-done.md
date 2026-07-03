# Definition Of Done

A Codex task is done only when the worktree proves it.

- The goal and non-goals are stated in `.harness-hub/state/current-task.md`.
- Requirement intake, selected direction, rejected alternatives, target spec, open questions, and alignment status are recorded for change work.
- Acceptance criteria are satisfied by direct evidence.
- The P0/P1/P2 test matrix was defined before implementation; P0 passed, P1 was run or risk-assessed, and P2 was run or explicitly deferred.
- Changed files stay within allowed paths and avoid forbidden paths.
- P0 validation has passed before handoff; P1 checks are run or risk-assessed; P2 hardening is run or explicitly deferred.
- Static checks, runtime checks, and the relevant user-flow or end-to-end path have been run when relevant.
- Web user-visible changes include agent-run browser acceptance against the local app, with URL, scenario, viewport, console/network findings, and screenshot or trace evidence when useful.
- Read-only Harness Hub startup check (`harness-hub check . --json`) has been run or explicitly skipped with a reason.
- Standard startup path still works or has an explicit, recorded blocker.
- Validation evidence records each command's status, exit code, passed/failed counts when available, output summary or path, and related checkpoint commit.
- Runtime logs, health checks, or failure messages that informed the result are captured in progress or handoff state.
- Material work has Agentic loop evidence or an explicit skip reason: producer/verifier/arbiter separation, delegated-agent or deterministic-check evidence, and the main agent's decision.
- If a PR was created or updated, PR status records mergeability, CI/check-run status, conflicts, branch-protection blockers, any in-scope fixes, validation reruns, and whether the remaining blocker requires user/external action.
- Material changes have finish closeout evidence: final independent review or explicit skip reason, technical-debt/drift findings, PR/merge-readiness status, and `insight` audit recommendations or skip reason.
- If commits are permitted, completed atomic work is saved as verified checkpoint commits instead of one large end-of-task commit.
- Material implementation or review work has an evaluator rubric verdict and any quality snapshot updates.
- Decision-level changes are recorded in `.harness-hub/state/decisions.md`.
- `.harness-hub/state/session-handoff.md` records the outcome, validation, residual risk, and next action.
- OpenSpec is used only when the task affects public contracts, cross-module architecture, publishing side effects, irreversible decisions, or long-lived specs.
