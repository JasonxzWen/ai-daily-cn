# Current Task

## Goal

Update this repository's local `.codex/skills` from the latest `D:/harness-hub` while preserving both sides when a local skill and a Harness Hub skill share the same skill name.

## Status

Completed in `C:\Users\Admin\.codex\worktrees\94c6\ai-daily-cn`.

Completed so far:

- Fast-forwarded local `D:/harness-hub` `main` to `origin/main` at `586950abb086828bca7361ec3f17c5397bdd05c3`.
- Imported Harness Hub-only skills into `.codex/skills`.
- Preserved local-only `html-work-reports`.
- For same-name skills, kept existing local active files, copied Hub-only files into the skill directory, and preserved same-path Hub conflicts under `_harness-hub/`.
- Wrote `.codex/harness-hub-aggregation.json` as the source/merge manifest.
- Added `tests/skills.test.js` coverage for the aggregation contract.
- Merged low-risk active `effective-interact` updates from Harness Hub without dropping the AI Daily renderer extensions.
- Passed `npm run validate`, `node scripts\harness-validate.mjs`, `git diff --check`, and Chromium desktop/mobile visual acceptance.

## Allowed paths

- `.codex/harness-hub-aggregation.json`
- `.codex/skills/**`
- `tests/skills.test.js`
- `tasks/current-task.md`
- `progress.md`
- `session-handoff.md`

## Forbidden paths

- Generated daily publish artifacts.
- `.github/**`
- Remote GitHub Pages settings.
- Destructive git operations: `git reset --hard`, `git checkout --`, force push, or automatic stash.
- Automatic commit or push unless the user explicitly asks.

## Acceptance criteria

- Harness Hub latest source commit is recorded.
- Hub-only skills are present in `.codex/skills`.
- Local-only skills are preserved.
- Same-name skill conflicts preserve both the local active file and the Harness Hub copy.
- `effective-interact` still passes the existing generator/schema/layout smoke tests.
- Repository validation and harness validation pass or blockers are explicitly reported.

## Validation commands

- `node --test tests\skills.test.js`
- `npm run validate`
- `node scripts\harness-validate.mjs`
- `git diff --check`

## Parallel writes

- No parallel file writes.
- Read-only inspection and independent validation commands may run in parallel.

## Handoff requirements

- Report the Harness Hub source commit.
- Summarize imported, overlapping, local-only, and conflict-preserved counts.
- List validation commands and outcomes.
- Call out that no commit, push, Pages setting change, or daily publish was performed.
