# Current Task

## Goal

Generate the 2026-05-31 Chinese AI daily report and publish it to GitHub Pages when release gates pass.

## Status

Report generation and validation completed. Publishing is blocked at `publish:dry-run` by `git_fetch_unavailable` because the current environment cannot connect to `github.com:22`.

## Assumptions

- The active report date is `2026-05-31` in `Asia/Shanghai`.
- The report may use web fallback sources when fixed discovery commands fail, but blocked discovery must remain visible in `source_audit`.
- API fallback is only appropriate for local `.git` metadata/write failures with a usable token, not for this SSH fetch failure.

## Scope

- Generate `.tmp/source-candidates-2026-05-31.json` and `.tmp/daily-report.json`.
- Write `reports-data/2026/05/2026-05-31.json` and candidate JSON.
- Build `docs/` publish artifacts.
- Run `npm run validate`, Phase 5 audit, and publish dry-run.
- Stop before real publish when dry-run reports `publish_error`.

## Non-goals

- Do not reset, force-push, stash, or overwrite user changes.
- Do not change remote GitHub Pages settings.
- Do not use API fallback unless the failure is a `.git` not-writable case and credentials are available.

## Allowed paths

- `docs/**`
- `reports-data/**`
- `tasks/current-task.md`
- `progress.md`
- `session-handoff.md`
- `package-lock.json`
- `package.json`

## Forbidden paths

- Remote repository settings and automation configuration.
- Unrelated user changes.
- Any path outside the active task's allowed paths unless required by the validation suite.

## Acceptance Criteria

- 2026-05-31 report JSON and self-contained HTML are generated.
- `npm run validate` passes.
- Phase 5 audit passes or any gap is reported.
- `publish:dry-run` result is reported.
- If publish is blocked, report `publish_error`, cause, and remediation without destructive recovery.

## Validation commands

- `npm run report:write -- .tmp/daily-report.json reports-data 2026-05-31`
- `npm run build`
- `npm run validate`
- `npm run sources:phase5-audit -- --date 2026-05-31 --history-dir reports-data --days 3`
- `npm run publish:dry-run -- --date 2026-05-31`

## Parallel writes

- Default: blocked for this implementation task.
- Read-only inspection and independent validation commands may run in parallel.

## Handoff requirements

- Update `progress.md` and `session-handoff.md`.
- Record all validation evidence and any remaining limitations.
