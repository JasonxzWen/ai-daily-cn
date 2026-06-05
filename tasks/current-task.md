# Current Task

## Goal

Update Harness Hub and the current AI daily Codex skill snapshot so agents have a package release sniffing helper for newly published AI/developer-tool packages, then open draft pull requests for the touched repositories.

## Scope

- Source Hub repo: `D:\harness-hub`
- Target snapshot repo: `C:\Users\Admin\.codex\worktrees\7fb3\ai-daily-cn`
- New helper: `package-release-sniffer`

## Assumptions

- "New package release sniffing" means source-first agent guidance for registry and release-feed discovery, not an automated scheduled monitor.
- The target AI daily worktree should receive the new `.codex/skills` helper because its existing aggregation snapshot comes from `D:\harness-hub`.
- The user request `提PR` authorizes commit, push, and draft PR creation for the current task scope.

## Non-goals

- Do not publish npm packages, change GitHub Pages settings, or edit scheduled automation.
- Do not implement product scraping logic in the AI daily app.
- Do not add registry credentials, hooks, monitor jobs, or remote side effects.

## Allowed paths

- `tasks/current-task.md`
- `progress.md`
- `session-handoff.md`
- `.codex/harness-hub-aggregation.json`
- `.codex/skills/package-release-sniffer/**`
- `.codex/skills/workflow-router/scripts/skill-activation-check.mjs`
- `.codex/skills/effective-interact/assets/fixtures/harness-vocabulary-explainer-report.json`
- generated `docs/reports/**` only if produced by `npm run build` during validation

## Forbidden paths

- Do not change remote Pages settings.
- Do not modify scheduled automation configuration directly.
- Do not hand-edit generated public report HTML.
- Do not reset hard or overwrite unrelated user changes.

## Acceptance Criteria

- Harness Hub source repo contains `skills/package-release-sniffer/SKILL.md`.
- Hub capability metadata, routing docs, workflow-router activation, and routing fixtures cover the new helper.
- Target snapshot contains `.codex/skills/package-release-sniffer/SKILL.md`.
- Target aggregation manifest reflects the additional imported Hub skill.
- Hub targeted tests and full validation pass.
- Target `node scripts\harness-validate.mjs` and `npm run validate` pass.
- Representative generated report HTML receives desktop/mobile visual smoke coverage.
- Draft PRs are opened after staging only the task-scoped changes.

## Validation commands

- Hub: `bun test ./tests/skillRoutingCases.test.ts ./tests/skillQualityInventory.test.ts ./tests/fullInstallSet.test.ts`
- Hub: `powershell -ExecutionPolicy Bypass -File scripts\validate-skills.ps1 -SkipExternal`
- Hub: `bun skills\workflow-router\scripts\skill-activation-check.mjs --cases-file tests\fixtures\skill-routing-cases.json --json`
- Hub: `bun run validate`
- Target: `node scripts\harness-validate.mjs`
- Target: `npm run validate`
- Target: Playwright visual smoke for `docs/reports/2026/06/2026-06-03.html` at desktop and mobile viewports

## Parallel writes

- No parallel writes. Manual edits use `apply_patch`; generated setup/build output comes from validation or Hub worktree setup only.

## Handoff requirements

- Report changed Hub and target files.
- Report validation command results.
- Report PR branch, commit, push, and PR URL when completed.
- Clearly state that no npm publish, automation change, or Pages setting change was performed.

## Current Status

- Hub source skill, metadata, routing docs, routing fixtures, and activation logic have been added.
- Target snapshot skill and aggregation manifest have been updated.
- Hub and target validation gates passed.
- After rebasing the target snapshot branch onto latest `origin/main`, `npm run validate` wrote no generated report HTML and the target PR diff no longer includes `docs/reports/**`.
- PR creation is in progress on fresh branches based on `origin/main`.
