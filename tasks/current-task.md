# Current Task

## Goal

Restore the AI daily automation quality hardening path so scheduled runs use the latest rules on `main`: merge PR #11 fixes with additional hard gates for source coverage, main-item density, model-release placement, GitHub API publish fallback, and Lark-document-aligned content coverage.

## Status

In progress in isolated worktree `D:\tmp\ai-daily-quality-hardening`; do not mix the generated 2026-06-02 artifacts from `D:\ai-daily-cn`.

## Allowed paths

- `config/sources/**`
- `docs/codex-automation-setup.md`
- `docs/ai-daily-publish-hardening.md`
- `prompts/ai-daily/modules/**`
- `src/**`
- `tests/**`
- `tasks/daily-publish-runbook.md`
- `tasks/current-task.md`
- `progress.md`
- `session-handoff.md`

## Forbidden paths

- Main worktree generated 2026-06-02 report artifacts unless the user explicitly asks to publish/regenerate today.
- `.github/**`
- Remote GitHub Pages settings.
- `git reset --hard`, `git push --force`, automatic stash, or overwriting user changes.

## Acceptance criteria

- PR branch explains why 2026-06-02 ran old-looking rules: draft PR #11 was not merged into `main`.
- `report:write` blocks candidate-rich reports with too few `main_items` or too few public content units.
- `model_releases` entries must also be represented in `main_items`.
- Git transport failures (`git_fetch_unavailable` / `git_push_unavailable`) are eligible for GitHub API fallback, but `remote_ahead` is not.
- AIGC/content-industry and product/funding sources are registered and tested.
- User-requested A-F source surface is registered or covered by dedicated discovery: follow-builders, ML Papers, HelloGitHub, RuanYF Weekly, official lab RSS/HTML, international/chinese media leads, arXiv/HN/HF/Papers with Code/Reddit/GitHub Trending, Smol AI News, AI News Archive, Latent.Space, and Ben's Bites.
- Prompt build includes Lark-document-aligned coverage: AIGC/content industry, Product Hunt, X/Twitter, follow-builders, 8-12 main items, and GitHub API fallback.
- `report:write` records an `self_check.automation_revision` fingerprint with git commit, branch, prompt modules, source registry count, and active hardening rules so scheduled runs can prove which repo version generated a report.
- Public report items carry an `importance` label (`major`, `notable`, `general`) that renders as “重大 / 值得关注 / 一般”, matching the user-provided item format.

## Validation commands

- `node --test tests\unit.test.js`
- `node --test tests\publish.test.js`
- `npm run sources:validate`
- `npm run prompt:build -- 2026-06-02`
- `node scripts\harness-validate.mjs`
- `npm run validate`
- `git diff --check`

## Parallel writes

- Do not write to the main worktree while this PR worktree is active.
- Parallel read-only checks are allowed.
- Publishing or PR update commands must be run serially.

## Handoff requirements

- Update automation memory before final response.
- Summarize PR #11 status, root cause, fixed gates, and validation results.
- Include any validation blocker explicitly.
