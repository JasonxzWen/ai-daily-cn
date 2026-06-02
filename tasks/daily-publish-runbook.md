# Daily Publish Runbook

Use this runbook for daily AI report generation and GitHub Pages publishing.

## Preflight

- Confirm the target date in `Asia/Shanghai` as `YYYY-MM-DD`.
- Review `git status --short --branch` before mutating files.
- Preserve unrelated user changes; do not use `git reset --hard`, force push, or automatic stash.
- For automation or publish runs, start with:

```powershell
npm run publish:prepare-worktree -- --message "chore: save local changes before AI daily report YYYY-MM-DD"
```

- Use `npm run publish:preflight` as the read-only publish boundary check when generation is not yet needed.

## Source Discovery

- Build the run contract:

```powershell
npm run prompt:build -- YYYY-MM-DD
```

- Check source lanes before writing the draft:

```powershell
npm run discover:github-trending -- --date YYYY-MM-DD --limit 50 --history-root reports-data
npm run discover:builders -- --date YYYY-MM-DD --limit 20
npm run discover:content-sources -- --date YYYY-MM-DD --limit 20
npm run discover:statuspage-incidents -- --date YYYY-MM-DD --limit 20
```

- Write source successes, failures, and empty results into `.tmp/source-candidates-YYYY-MM-DD.json`.
- Before selecting items, compare every collected candidate against the previous reports and candidate pools in `reports-data` for at least the recent 7 daily report dates. Dedupe by URL first, then by same event/title/vendor/source topic; keep repeated items excluded unless the new candidate adds a concrete new dated development.
- Keep `main_items`, `github_trending`, `model_releases`, `hot_blogs`, `projects`, and `builder_observations` tied to `candidate_id` values.
- Do not bypass freshness, duplicate URL, or source-window gates.

## Report Write

- Write the structured draft to `.tmp/daily-report.json`.
- Normalize it with:

```powershell
npm run report:write -- .tmp/daily-report.json reports-data YYYY-MM-DD
```

- Stop and repair the draft when `candidate_pool_missing`, `candidate_pool_reference_invalid`, or `freshness_gate_failed` appears.

## Build And Validate

- Generate static Pages output:

```powershell
npm run build
```

- The daily HTML must come from `.codex/skills/effective-interact/scripts/create-interaction.mjs` in `pre-rendered` mode.
- Run the full gate before any real publish:

```powershell
npm run validate
```

## Dry Run

- Preview the publish plan:

```powershell
npm run publish:dry-run
```

- Capture changed files, commit message, and expected Pages URL.
- If dry-run fails, keep the generated local HTML/JSON artifacts and report the blocker.

## Real Publish

- Only publish after explicit confirmation:

```powershell
npm run publish -- confirm-push YYYY-MM-DD
```

- This path may commit and push only publisher-managed `docs/` and `reports-data/` files.
- After push, verify the daily Pages URL returns HTTP 200 and contains `YYYY-MM-DD`.

## GitHub API Fallback

- Use this only when local git metadata, branch switching, or Git transport (`git_fetch_unavailable` / `git_push_unavailable`) blocks real publish after report artifacts passed validation. Do not use it to bypass `remote_ahead`:

```powershell
npm run publish:github-api -- confirm-push YYYY-MM-DD
```

- Required token source: `GH_TOKEN`, `GITHUB_TOKEN`, or `gh auth token`.
- The fallback must still write only publisher-managed `docs/` and `reports-data/` files with `force:false`.

## Handoff

- Final response must include the daily HTML path, structured JSON path, validate result, dry-run result, expected Pages URL, real publish verification, and at most three prompt or rule iteration suggestions.
- Update `progress.md` and `session-handoff.md` when the run changes repo state or publish status.
