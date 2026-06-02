# Daily Publish Runbook

Use this runbook for daily AI report generation and GitHub Pages publishing.

## Preflight

- Confirm the target date in `Asia/Shanghai` as `YYYY-MM-DD`.
- Review `git status --short --branch` before mutating files.
- For automation and publish runs, treat the latest `origin/main` as the only authoritative baseline. Unmerged PR branches, detached HEAD work, and local experiment branches must not affect the daily report.
- Preserve unrelated user changes; do not use `git reset --hard`, force push, or automatic stash.
- Automation runs must not modify or commit `progress.md`, `session-handoff.md`, or `tasks/current-task.md`; those files are for human handoff and project iteration sessions.
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
npm run discover:content-sources -- --date YYYY-MM-DD --limit 60 --per-source-limit 3
npm run discover:statuspage-incidents -- --date YYYY-MM-DD --limit 20
```

- Write source successes, failures, and empty results into `.tmp/source-candidates-YYYY-MM-DD.json`.
- For reports dated `2026-06-02` or later, apply the two-level publish quality gate. `blocking_issues` stop dry-run and real publish: invalid automation revision, schema or candidate back-reference failures, stale/duplicated stories, unverified factual claims, unconfirmed remote `main`, `remote_ahead`, dirty non-publisher files, API fallback token/base commit failures, or Pages verification failure. Fixed source surface gaps, GitHub Trending / Builder X / evidence asset coverage gaps, empty sections, and model-release mirroring gaps are `degraded_sections`: the report may publish, but the JSON and public HTML must disclose them in `quality_status`.
- Also for reports dated `2026-06-02` or later, enforce the long-form engineer daily gate: public `summary` must be an editorial lead, not a generation log; every `main_items` entry must include `why_it_matters` or `reader_relevance`; `main_items` must use primary, official, paper, GitHub, or multi-source confirmed evidence; non-primary leads may only appear in viewpoint/product/Builder/community sections with `source_level`, `verification_status`, and `verification_note` or `risk_note`; keep `model_releases` empty for new drafts unless preserving legacy data.
- A fixed source with `status:"blocked"` still counts as checked source-surface proof when the final `source_audit` records the source name, URL, HTTP/error detail, and notes. Do not promote facts from blocked sources; use them only as audit evidence that the source was attempted.
- Before selecting items, compare every collected candidate against the previous reports and candidate pools in `reports-data` for at least the recent 7 daily report dates. Dedupe by URL first, then by same event/title/vendor/source topic; keep repeated items excluded unless the new candidate adds a concrete new dated development.
- Keep `main_items`, `github_trending`, `hot_blogs`, `projects`, and `builder_observations` tied to `candidate_id` values.
- Do not bypass freshness, duplicate URL, or source-window gates.

## Report Write

- Write the structured draft to `.tmp/daily-report.json`.
- Normalize it with:

```powershell
npm run report:write -- .tmp/daily-report.json reports-data YYYY-MM-DD
```

- Stop and repair the draft when `candidate_pool_missing`, `candidate_pool_reference_invalid`, or `freshness_gate_failed` appears.
- Stop and repair the draft when `mainline_source_authority_gate_failed` appears. If `editorial_summary_gate_failed`, `editorial_context_gate_failed`, or `non_primary_source_disclosure_gate_failed` appears in `degraded_sections`, repair before publish unless the user explicitly accepts a degraded report.
- If you commit/push any workflow, prompt, source, renderer, or quality-gate code after `report:write`, rerun `report:write` and `npm run build` so `self_check.automation_revision.git_commit` matches current `HEAD`.

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
- Confirm every `current_dirty_files` publisher artifact is also present in `will_stage_files`. A `publisher_dirty_outside_publish_plan` error is a real safety gate: repair the publish plan or move unrelated stale artifacts out of the worktree before publishing.
- Check that every report-linked `evidence_assets[*].local_path` appears in `will_stage_files` as `docs/assets/evidence/...`; local file existence alone is not enough for GitHub Pages.
- If dry-run fails, keep the generated local HTML/JSON artifacts and report the blocker. If it succeeds with `quality_status.status: "degraded"`, capture the `degraded_sections` summary and make sure the public HTML includes `发布质量说明`.

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
- The fallback must read the remote `main` commit/tree through the GitHub API, publish only artifacts generated from the latest `origin/main`, write only publisher-managed `docs/` and `reports-data/` files with `force:false`, and report `publish_mode: github-api-fallback` plus `base_commit_sha`.

## Handoff

- Final response must include the daily HTML path, structured JSON path, validate result, dry-run result, expected Pages URL, real publish verification, and at most three prompt or rule iteration suggestions.
- Human-assisted publish runs update `progress.md` and `session-handoff.md` when the run changes repo state or publish status. Scheduled automation runs do not modify or commit `progress.md`, `session-handoff.md`, or `tasks/current-task.md`.
