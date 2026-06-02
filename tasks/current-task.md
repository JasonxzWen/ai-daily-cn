# Current Task

## Goal

Implement the automation publishing hardening plan requested in this session:

- scheduled AI daily runs use a worktree execution environment;
- scheduled runs treat the latest `origin/main` as the only authoritative baseline;
- publish quality is split into blocking `blocking_issues` and publishable `degraded_sections`;
- degraded quality is disclosed in structured JSON and public HTML;
- GitHub API fallback reports `publish_mode` and `base_commit_sha`;
- the actual `ai-daily` automation prompt is synchronized after user approval.

## Status

In progress on branch `codex/automation-worktree-publish-hardening` in `C:\Users\Admin\.codex\worktrees\0744\ai-daily-cn`.

Implemented code/test changes:

- `src/quality-status.js` now classifies publish quality into `blocking_issues` and `degraded_sections`.
- Fixed source, GitHub Trending, Builder X, evidence asset, empty-section, and model-release mirroring gaps are degraded instead of blocking.
- Automation revision/version proof issues remain blocking.
- Public HTML and effective-interact reports include a `发布质量说明` section when quality is degraded or blocked.
- Publish outputs include `degraded_sections`; publish/GitHub API paths expose `publish_mode`.
- `report:write` no longer blocks otherwise publishable reports solely because model-release mirroring or Builder X coverage is degraded.
- Unit and publish tests were updated for the two-level gate.

Documentation updates are in progress for automation setup, runbook, prompt modules, publisher decisions, and task templates.

## Allowed paths

- `docs/**`
- `prompts/ai-daily/modules/**`
- `schemas/**`
- `src/**`
- `tests/**`
- `tasks/daily-publish-runbook.md`
- `tasks/templates/**`
- `tasks/current-task.md`
- `progress.md`
- `session-handoff.md`

## Forbidden paths

- Generated daily publish artifacts unless needed for local visual verification.
- `.github/**`
- Remote GitHub Pages settings.
- Destructive git operations: `git reset --hard`, `git push --force`, automatic stash, or overwriting user changes.

## Acceptance criteria

- `publish:dry-run`, local `publish`, and `publish:github-api` block only true `blocking_issues`.
- Coverage gaps are retained as `degraded_sections`, included in JSON, shown in public HTML, and summarized in publish plans.
- Automation/runbook prompts state that scheduled runs only use latest `origin/main`.
- Automation/runbook prompts state that scheduled runs do not modify `progress.md`, `session-handoff.md`, or `tasks/current-task.md`.
- GitHub API fallback uses remote `main` commit/tree, `force:false`, publisher-managed paths only, and reports `publish_mode: github-api-fallback` plus `base_commit_sha`.
- Actual `ai-daily` automation config is updated after approval.
- Validation and visual checks pass or blockers are explicitly reported.

## Validation commands

- `node --test tests\unit.test.js tests\publish.test.js`
- `npm run validate`
- `node scripts\harness-validate.mjs`
- Browser/Playwright desktop and mobile visual check for the public `发布质量说明` section.
- `git diff --check`

## Parallel writes

- No parallel writes while this branch has uncommitted changes.
- Read-only file inspection and independent validation commands may run in parallel.
- Automation updates, git operations, and patch edits must run serially.

## Handoff requirements

- Summarize code, prompt, automation, validation, and visual-check status.
- Explicitly list any remaining blocker or degraded behavior.
