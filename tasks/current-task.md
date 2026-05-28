# Current Task

## Goal

No active task is in progress.

For daily publishing work, start from `tasks/templates/daily-publish-task.md` and follow `tasks/daily-publish-runbook.md`.

## Assumptions

- The existing project `AGENTS.md` is authoritative.
- Real publish requires explicit user confirmation.
- Date-sensitive daily publishing work uses `Asia/Shanghai` unless the user says otherwise.

## Non-goals

- Do not change GitHub Pages settings or automation config unless explicitly requested.
- Do not replace the daily report rendering path.
- Do not force-overwrite existing project instructions.
- Do not use `git reset --hard`, force push, or automatic stash to handle dirty state.

## Worktree / Branch

- Record `git status --short --branch` when a new task starts.
- Use a dedicated branch or worktree for write tasks.

## Allowed paths

- No write paths are active until a concrete task starts.
- For daily publish runs, copy the allowed paths from `tasks/templates/daily-publish-task.md`.

## Forbidden paths

- Remote repository settings and automation configuration.
- Unrelated user changes.
- Any path outside the active task's allowed paths.

## Acceptance criteria

- A new task replaces this neutral state with a concrete goal, scope, validation commands, and handoff requirements.
- `node scripts/harness-validate.mjs` passes after any harness change.
- Daily publish tasks include dry-run evidence before real publish.

## Validation commands

- `node scripts/harness-validate.mjs`
- Add task-specific commands before implementation or publish work starts.

## Parallel writes

- Default: blocked for this task.
- Allowed only with independent worktrees or branches, non-overlapping paths, independent validation, and one integration review point.

## Handoff requirements

- Update `progress.md` and `session-handoff.md` when the next task changes repo state.
- Record validation evidence before handoff.
