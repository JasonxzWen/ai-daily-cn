# Clean State Checklist

Use this checklist before handoff.

- `git status --short` has been reviewed.
- Fresh worktrees have run `npm run harness:init`.
- Read-only Harness Hub startup check (`harness-hub check . --json` or source CLI equivalent) has been run or explicitly skipped with a reason when harness maintenance is in scope.
- `tasks/current-task.md` is current, not a stale handoff from a previous task.
- `.harness-hub/state/current-task.md` exists for host-neutral harness state; use it when a task needs context/loop engineering state beyond the project-local SDD file.
- `Feedback Ledger Review` records the applicable items from `config/feedback-ledger.json` and `docs/feedback-buglist-quick-reference.md`.
- `Regression Self-Check` records the concrete anti-regression checks performed before handoff.
- Non-trivial work has recorded Red Test failure evidence or a justified deterministic substitute before implementation.
- Requirement intake, selected direction, rejected alternatives, target spec, open questions, and alignment status are recorded for material change work.
- Changed files match the current task's allowed paths.
- Forbidden paths were not modified.
- Temporary logs or generated artifacts are in ignored locations.
- Local harness state files are present but not tracked by Git.
- Validation commands from `tasks/current-task.md` have been run or explicitly skipped with a reason.
- P0 validation passed before handoff; P1 checks are run or risk-assessed; P2 hardening is run or explicitly deferred.
- Agentic loop records are captured for material work, or the skip reason is explicit.
- Finish closeout is recorded for material changes: independent review or skip reason, drift warnings, and insight recommendations or skip reason.
- `evaluator-rubric.md` and `quality-document.md` were updated when material validation or quality evidence changes the quality picture.
- `progress.md` and `session-handoff.md` reflect the current state.
- `node scripts/harness-validate.mjs` passes.
- Daily publish runs have captured `npm run publish:dry-run` output before real publish.
- Real publish is not attempted unless the user explicitly confirmed it.
- Any `publish_error` keeps generated local HTML/JSON artifacts intact for inspection.
