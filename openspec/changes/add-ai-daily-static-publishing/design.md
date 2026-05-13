# Design: AI Daily Static Publishing

## Current State

Repository `D:\ai-daily-cn` has no implementation code, no `package.json`, no test harness, and no static site build pipeline.

Existing automation:

- ID: `ai-2`
- Config: `C:\Users\Admin\.codex\automations\ai-2\automation.toml`
- Memory: `C:\Users\Admin\.codex\automations\ai-2\memory.md`
- Schedule: daily 02:30
- Output: Chinese AI daily report with self-check and optimization suggestions

Remote repository:

- `JasonxzWen/ai-daily-cn`
- default branch: `main`
- public
- Pages site not currently detected

## Architecture Decision

Use branch-source GitHub Pages from `main` `/docs` for the first implementation phase.

Rationale:

- Static report output does not require a frontend build system.
- `docs/` keeps published files visible and easy to audit.
- Avoids adding GitHub Actions before validation gates exist.
- Keeps the first publisher local and deterministic.

Migration path:

- If the site later needs search indexing, RSS generation, React UI, screenshots, or pre-publish CI checks, move to GitHub Actions Pages deployment.

## Publisher Phases

### Phase 1: Content Contract

Input:

- Markdown daily report from `ai-2`.

Output:

- parsed structured report object
- extracted self-check JSON
- validation errors if contract fails

### Phase 2: Rendering

Input:

- structured report object

Output:

- single report HTML
- report JSON
- normalized Markdown copy

Renderer constraints:

- no remote scripts
- local CSS only
- escaped user/content text
- stable section anchors
- readable mobile and desktop layout

### Phase 3: Indexing

Input:

- current report JSON
- existing `feed.json`

Output:

- updated `feed.json`
- regenerated `index.html`

Indexing constraints:

- idempotent by `report_date`
- date-descending order
- stable relative URLs

### Phase 4: Distribution

Input:

- generated files
- publish config

Output:

- ordinary git commit
- ordinary git push
- publish status

Safety constraints:

- no force push
- no reset hard
- no stash
- no overwrite of unrelated user changes
- stop on dirty worktree
- stop on remote ahead

## Prompt System Design

Prompt should be managed as modules:

- `base`
- `date_scope`
- `source_policy`
- `watchlist`
- `selection_rules`
- `output_markdown`
- `structured_candidates`
- `validation_rules`
- `publish_status`
- `optimization_loop`

The implementation may store these modules as text files, JSON fragments, or a single generated prompt. The contract is that each module remains independently reviewable.

## Test Design

Validation layers:

1. Unit tests for parsing and schema.
2. Golden fixture tests for good and bad reports.
3. Integration tests for full static site generation.
4. Browser tests for rendered HTML.
5. Publish dry-run tests for git safety.
6. Manual Pages configuration verification.

No automatic publish should be enabled until `validate` exists and passes locally.

## Skill Hub Decision

Skill Hub should be treated as a reference and later optional installer.

Useful concepts:

- web profile
- HTML work reports
- browser verification
- E2E test suites
- skill routing evals
- build/test/validate gates

Do not install Skill Hub capabilities in this change.

## Data Compatibility

Use schema versioning:

- `report.json.schema_version = 1`
- `feed.json.schema_version = 1`

Future schema changes must either:

- preserve backward compatibility, or
- add a migration step for existing report JSON files.

## Failure Handling

All failures should be explicit and non-destructive.

Examples:

- `content_validation_failed`
- `schema_validation_failed`
- `html_render_failed`
- `dirty_worktree`
- `wrong_branch`
- `remote_ahead`
- `commit_failed`
- `push_failed`
- `pages_not_configured`

The publisher must write the error into `publish_status.publish_error` or the automation run summary without attempting destructive recovery.
