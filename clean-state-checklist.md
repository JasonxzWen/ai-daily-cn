# Clean State Checklist

Use this checklist before handoff.

- `git status --short` has been reviewed.
- `tasks/current-task.md` is current, not a stale handoff from a previous task.
- Non-trivial work has recorded Red Test failure evidence or a justified deterministic substitute before implementation.
- Changed files match the current task's allowed paths.
- Forbidden paths were not modified.
- Temporary logs or generated artifacts are in ignored locations.
- Validation commands from `tasks/current-task.md` have been run or explicitly skipped with a reason.
- `progress.md` and `session-handoff.md` reflect the current state.
- `node scripts/harness-validate.mjs` passes.
- Daily publish runs have captured `npm run publish:dry-run` output before real publish.
- Real publish is not attempted unless the user explicitly confirmed it.
- Any `publish_error` keeps generated local HTML/JSON artifacts intact for inspection.
