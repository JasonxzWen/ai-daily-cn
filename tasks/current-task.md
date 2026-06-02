# Current Task

## Goal

Implement the 2026-06-02 daily report presentation and workflow fixes after pulling latest `origin/main`, then regenerate the Chinese AI daily report locally.

## Requested Fixes

- Hero date area must show the covered time window to avoid gaps or overlap between reports.
- Main-item highlight words must render as bold colored text, not tag UI.
- Tags must have visible type/importance color differences.
- Main-item body should not show source names; source identity is represented by the icon/link.
- Main-item titles should be larger and should not be underlined.
- Public `模型发布` section must be removed; related model news belongs in `主体信息`.
- Hot tech blogs need richer roughly 100-character point summaries and should preserve evidence images when available.
- GitHub star deltas should render as tags; `今日值得关注的项目` is merged into GitHub Trending as project highlights.

## Status

Completed locally in `D:\ai-daily-cn` after `git pull --ff-only origin main` fast-forwarded to latest `main`.

Implemented code, prompt, doc, test, JSON, and static HTML updates. No commit, push, publish, reset, stash, force push, or remote Pages setting change was performed.

Final visual review also found and fixed duplicate star tags when a GitHub Trending item was also a project highlight.

Follow-up hardening completed: the same rules are now written into the automation setup prompt, daily publish runbook, source expansion spec, prompt modules, renderer code, CSS, and tests. They are no longer only a one-off fix to the 2026-06-02 generated report.

Latest follow-up: image click-to-enlarge has been added to the effective-interact renderer so body evidence images and hot blog/card media images open in a self-contained lightbox. Source icons remain inert.

Latest follow-up: GitHub Trending project highlights are now tag-only. The renderer no longer outputs a `项目 highlights` subheading, extra project list, or hero `项目高亮` stat; unmatched `projects` stay in structured JSON and only matched Top 10 Trending items get the `项目 highlight` tag plus compact inline detail.

## Allowed paths

- `.codex/skills/effective-interact/**`
- `docs/**`
- `prompts/ai-daily/modules/**`
- `reports-data/2026/06/2026-06-02.json`
- `src/**`
- `tests/**`
- `tasks/current-task.md`
- `progress.md`
- `session-handoff.md`

## Forbidden paths

- `.github/**`
- Remote GitHub Pages settings.
- Destructive git operations: `git reset --hard`, `git push --force`, automatic stash, or overwriting user changes.

## Validation

- `npm run report:write -- .tmp\daily-report.json reports-data 2026-06-02` passed.
- `npm run build` passed and regenerated `docs/` output.
- `npm run test` passed with 153 tests.
- `npm run validate` passed: source validation, 153 tests, build, e2e, OpenSpec, and `git diff --check`.
- Playwright desktop/mobile visual checks passed for `docs/reports/2026/06/2026-06-02.html`.
- Image loading check passed: no visible broken images.
- GitHub Trending star-tag de-duplication passed with zero duplicate star tags.
- Prompt-build regression checks cover coverage-window text, no public model-release section, no public standalone project section, star-change tags, and inline keyword rendering.

## Validation commands

- `npm run report:write -- .tmp\daily-report.json reports-data 2026-06-02`
- `npm run build`
- `npm run test`
- `npm run validate`
- `node scripts\harness-validate.mjs`
- Playwright desktop/mobile visual check for `docs/reports/2026/06/2026-06-02.html`.
- Playwright desktop/mobile click-to-enlarge check for report images.

## Parallel writes

- No parallel writes while this worktree has uncommitted changes.
- Read-only inspection may run in parallel.
- Patch edits, publish commands, and git operations must run serially.

## Handoff requirements

- Review local changes before deciding whether to commit, push, publish, or open a PR.
- If publishing is requested later, run `npm run publish:dry-run -- confirm-push 2026-06-02` before real publish.
