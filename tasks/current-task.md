# Current Task

## Goal

Update the durable AI daily workflow branch to the latest `origin/main`, resolve merge conflicts, validate the result, push the branch, and open a PR that is mergeable.

## Branch

- Worktree: `D:\ai-daily-cn`
- Branch: `codex/durable-ai-daily-workflow`
- Base after update: latest `origin/main` at `3859b07`
- Local pre-merge commit: `222b66d fix: codify durable AI daily workflow`

## Scope

This PR should preserve both upstream work and this branch's durable fixes:

- upstream Harness Hub skill aggregation from PR #18;
- upstream long-form engineer daily source/editorial contract from PR #17;
- coverage-window hero text;
- inline keyword highlights as bold colored text, not tag UI;
- typed color tags/chips for importance, stars, project highlights, topics, and trend state;
- no public `模型发布` section;
- GitHub Trending Top 10 with star tags and project highlight tags only inside matching items;
- hot blog point summaries with evidence images and lightbox behavior;
- Builder original text, complete Chinese translation, handle/avatar data, Twitter-like card rendering, and strict publish-quality blocking when the contract is violated.

## Allowed paths

- `.codex/**` Harness Hub and effective-interact skill files already changed by upstream or this branch.
- `prompts/ai-daily/**` durable daily-generation rules and output contracts.
- `src/**` renderer, quality gate, discovery, and publish workflow fixes needed by the durable contract.
- `schemas/**` contract fields needed by the durable report JSON.
- `tests/**` unit, e2e, publish, skills, and harness coverage for the durable contract.
- `reports-data/2026/06/2026-06-02.json` and generated `docs/**` outputs for the regenerated daily report.
- `tasks/current-task.md`, `progress.md`, and `session-handoff.md` for this human-assisted PR handoff.

## Forbidden paths

- Do not reset hard, force push, auto stash, or overwrite unrelated user changes.
- Do not change GitHub Pages settings or scheduled automation configuration.
- Do not publish the daily report in this task; the user asked for a PR.

## Validation commands

Run before final PR handoff:

- `npm run validate`
- `node scripts/harness-validate.mjs`
- Playwright desktop/mobile visual check on `docs/reports/2026/06/2026-06-02.html`
- Confirm `git status` has no unresolved conflicts.
- Push branch and confirm the PR merge state is clean/mergeable.

## Parallel writes

- Parallel read-only inspection and independent validation is allowed.
- Concurrent writes are blocked; source, generated docs, and task-state files should be edited or regenerated in a single controlled sequence.

## Handoff requirements

- Commit the resolved merge and durable workflow changes on `codex/durable-ai-daily-workflow`.
- Push the branch to `origin`.
- Open a PR against `main`; add `codex` and `codex-automation` labels when those labels exist.
- Report validation, visual-check result, PR URL, and mergeability state.

## Current status

- PR opened: https://github.com/JasonxzWen/ai-daily-cn/pull/19
- Validation completed: `node --test tests/unit.test.js`, `npm run validate`, `node scripts/harness-validate.mjs`, conflict-marker scan, `git diff --check`, and Playwright desktop/mobile visual check.
- GitHub initially reported the PR as non-draft, `mergeable=MERGEABLE`, `mergeStateStatus=CLEAN`.
- Repository labels `codex` and `codex-automation` do not currently exist, so no PR labels were applied.
