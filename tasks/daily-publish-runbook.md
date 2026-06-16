# Daily Publish Runbook

Use this runbook for daily AI report generation and GitHub Pages publishing.

- 唯一权威资产：`prompts/ai-daily/modules/editorial-authority.md`。如果与旧规范文档、旧 ROI 清单、旧 prompt 模块或历史说明冲突，以这份资产为准。
- 同一板块如果出现新旧两版要求，只执行唯一权威资产里的较新版本；旧文档只作归档参考。

## Codex-Native Runner Contract

- Scheduled and long-running publish tasks start from the launcher worktree and invoke `npm run daily:run -- --date YYYY-MM-DD`.
- Dry-run-only mode is the default. It stops after `publish:dry-run:daily`, writes `.tmp/run-summary-YYYY-MM-DD.json`, and reports `final_status:"generated_only"`.
- Real publish requires `npm run daily:run -- --date YYYY-MM-DD --publish`. Publish mode may run the final `publish` stage and uses max 5 review -> AI repair contract -> repair -> review loops.
- The runner owns stages, cwd, status, summary, validation, `sources:phase5-audit`, dry-run, and publish. Codex owns semantic AI repair when `next_action.kind` is `codex_ai_repair_contract`; save the requested contract path with `schema_version`, `report_date`, `status:"ready"`, and non-empty `edits` before resuming with the same `daily:run` command. If runner created a `status:"template"` contract, fill only the necessary public-text edits and then change the status to `ready`; do not overwrite prior attempt files.
- Use `--restart` only when you intentionally discard the same-date `.tmp/run-summary-YYYY-MM-DD.json` state and start over.
- Scheduled automation must use `publish:dry-run:daily` as the only dry-run command. The older `publish:dry-run -- --date YYYY-MM-DD` remains for manual diagnostics only.
- A separate 21:30 status self-check runs `npm run status:self-check -- --date YYYY-MM-DD --output .tmp/status-self-check-YYYY-MM-DD.json`.
- `status:self-check` checks current artifacts, Pages HTTP, `quality_status`, `sources:health`, `publish:dry-run:daily`, and active Codex automations; `multiple_active_daily_publish_automations` is a blocking issue.

## Preflight

- Confirm the target date in `Asia/Shanghai` as `YYYY-MM-DD`.
- 先按 `prompts/ai-daily/modules/editorial-authority.md` 校对当天内容合同，不要并行参考多份旧文档裁决冲突。
- 如果当天为了修正文风、板块、选题阈值或坏例复发而改 prompt / 规则，必须把 `editorial-authority.md` 里的 `本轮修改清单`、`Good Case`、`Bad Case`、`迭代历史` 一并更新，不要只改实现不留维护面。
- Review `git status --short --branch` before mutating files.
- For automation and publish runs, treat the latest `origin/main` as the only authoritative baseline. Unmerged PR branches, detached HEAD work, and local experiment branches must not affect the daily report.
- User-confirmed feedback that must persist is P1 by default. It must be recorded in `config/feedback-ledger.json` with existing scope files, a validation command covered by `npm run validate`, and an existing test assertion or runtime gate; otherwise it is only a session-local suggestion.
- Preserve unrelated user changes in the launcher worktree; do not run manual `git reset --hard`, force push, or automatic stash there.
- Automation runs must not modify or commit `progress.md`, `session-handoff.md`, or `tasks/current-task.md`; those files are for human handoff and project iteration sessions.
- The runner prepares a dedicated clean publish checkout internally before generation. Use the command below only for manual diagnostics or when debugging checkout preparation:

```powershell
npm run publish:prepare-clean-worktree
```

- When run manually, read `prepared.next_cwd` from the command output before executing lower-level generation commands. The default location is `.tmp/publish-worktrees/main` under the launcher repository; it is an isolated clone that may be reset to `origin/main` without touching user work in the launcher worktree.
- Do not use `publish:prepare-worktree` for scheduled automation. It is retained only for manual recovery sessions where the user explicitly wants to save and switch the current worktree.
- Use `npm run publish:preflight` as the read-only publish boundary check when generation is not yet needed.

## Source Discovery

- Build the run contract:

```powershell
npm run prompt:build -- YYYY-MM-DD
```

- Check source lanes before writing the draft:

```powershell
node src/cli.js discover:github-trending --date YYYY-MM-DD --limit 50 --history-root reports-data --output .tmp/github-trending-YYYY-MM-DD.json
node src/cli.js discover:huggingface-trending --date YYYY-MM-DD --limit 50 --output .tmp/huggingface-trending-YYYY-MM-DD.json
node src/cli.js discover:china-ai --date YYYY-MM-DD --limit 30 --per-source-limit 3 --output .tmp/china-ai-YYYY-MM-DD.json
node src/cli.js discover:builders --date YYYY-MM-DD --limit 20 --output .tmp/builders-YYYY-MM-DD.json
node src/cli.js discover:content-sources --date YYYY-MM-DD --limit 60 --per-source-limit 3 --output .tmp/content-sources-YYYY-MM-DD.json
node src/cli.js discover:statuspage-incidents --date YYYY-MM-DD --limit 20 --output .tmp/statuspage-incidents-YYYY-MM-DD.json
```

- Prefer discovery command `--output` over PowerShell `Tee-Object` or stdout redirection. The command writes UTF-8 JSON directly, so npm banners, shell encoding, or BOM handling cannot pollute the audit artifact.
- Run shadow search with provider-level timing and partial-result retention:

```powershell
node src/cli.js discover:search-news --date YYYY-MM-DD --providers gdelt,openalex,arxiv --queries config/search-queries.json --limit 40 --provider-timeout-ms 45000 --shadow --output .tmp/search-news-YYYY-MM-DD.json
node src/cli.js discover:wechat-platform --date YYYY-MM-DD --limit 20 --output .tmp/wechat-platform-YYYY-MM-DD.json
node src/cli.js discover:zhihu-platform --date YYYY-MM-DD --limit 20 --output .tmp/zhihu-platform-YYYY-MM-DD.json
node src/cli.js discover:reddit-platform --date YYYY-MM-DD --limit 20 --output .tmp/reddit-platform-YYYY-MM-DD.json
node src/cli.js sources:health --date YYYY-MM-DD --sources config/sources --enablement core,optional,manual --output .tmp/sources-health-YYYY-MM-DD.json
```

- Treat WeChat/Zhihu/Reddit as low-threshold weak-signal lanes, not factual source shortcuts. Kill-switched or empty platform configs must produce auditable no-signal JSON rather than being silently skipped or backfilled with invented items.

- Hugging Face Trending is a separate model/dataset/Space trend lane, not a substitute for GitHub Trending or ordinary Hugging Face organization pages.
- `discover:china-ai` is a hard checked lane for reports dated `2026-06-11` or later. Missing `source_audit.china_ai_sources` blocks strict publish; an executed lane with no qualified recent signal is degraded and must be publicly disclosed.

- Generate the draft and candidate pool from discovery outputs; do not hand-write the final draft:

```powershell
npm run report:draft -- --date YYYY-MM-DD --input .tmp/github-trending-YYYY-MM-DD.json,.tmp/huggingface-trending-YYYY-MM-DD.json,.tmp/china-ai-YYYY-MM-DD.json,.tmp/builders-YYYY-MM-DD.json,.tmp/content-sources-YYYY-MM-DD.json,.tmp/statuspage-incidents-YYYY-MM-DD.json,.tmp/search-news-YYYY-MM-DD.json,.tmp/wechat-platform-YYYY-MM-DD.json,.tmp/zhihu-platform-YYYY-MM-DD.json,.tmp/reddit-platform-YYYY-MM-DD.json,.tmp/sources-health-YYYY-MM-DD.json --output .tmp/daily-report.json --candidate-output .tmp/source-candidates-YYYY-MM-DD.json
```

- `report:draft` writes source successes, failures, empty results, selected `included` markers, and cached `image_url` evidence assets. If it cannot cache an image, keep the skipped reason in command output and let `quality_status.degraded_sections` disclose evidence coverage gaps.
- For reports dated `2026-06-02` or later, apply the two-level publish quality gate. `blocking_issues` stop dry-run and real publish: invalid automation revision, report generation commit not proving latest `origin/main` through `origin_main_sha`, schema or candidate back-reference failures, stale/duplicated stories, unverified factual claims, unconfirmed remote `main`, `remote_ahead`, dirty non-publisher files, API fallback token/base commit failures, or Pages verification failure. Fixed source surface gaps, GitHub Trending / Builder X / evidence asset coverage gaps, empty sections, and model-release mirroring gaps are `degraded_sections`: the report may publish, but the JSON and public HTML must disclose them in `quality_status`.
- Also for reports dated `2026-06-02` or later, enforce the long-form engineer daily gate: public `summary` must be an editorial lead, not a generation log; every `main_items` entry must include `why_it_matters` or `reader_relevance`; `main_items` must use primary, official, paper, GitHub, or multi-source confirmed evidence; non-primary leads may only appear in viewpoint/product/Builder/community sections with `source_level`, `verification_status`, and `verification_note` or `risk_note`; keep `model_releases` empty for new drafts unless preserving legacy data.
- A fixed source with `status:"blocked"` still counts as checked source-surface proof when the final `source_audit` records the source name, URL, HTTP/error detail, and notes. Do not promote facts from blocked sources; use them only as audit evidence that the source was attempted.
- If multiple fixed source groups are mostly `blocked` with `fetch failed`, treat it as a likely scheduled-task network outage. The public `quality_status.degraded_sections` must include `source_discovery_network_unavailable`, and the final response must tell the user to check `config.toml` or Codex settings and enable network access for workspace-write sandbox mode: `[sandbox_workspace_write] network_access = true`, also shown in the UI as `当沙盒设置为工作区写入时允许网络访问`.
- If all active fixed source lanes are blocked by network errors and no factual item can be verified, write `report_status:"empty_due_to_network_outage"` with `main_items: []`. The report is publishable only as degraded output: keep the blocked `source_audit`, disclose `empty_due_to_network_outage` in `quality_status.degraded_sections`, and do not add placeholder main items.
- Before selecting items, compare every collected candidate against the previous reports and candidate pools in `reports-data` for at least the recent 7 daily report dates. Dedupe by URL first, then by same event/title/vendor/source topic; keep repeated items excluded unless the new candidate adds a concrete new dated development.
- Keep `main_items`, `github_trending`, `hot_blogs`, `projects`, and `builder_observations` tied to `candidate_id` values.
- When `discover:builders` or the final candidate pool has at least five qualified Builder candidates, publish 5-20 `builder_observations`; fewer than five must be disclosed as degraded Builder coverage with the selection/filter reason.
- Do not bypass freshness, duplicate URL, or source-window gates.

## Public Report Contract

- The hero/date area must state the report coverage window, not only the publish date.
- Main-item source names are not written into the visible title/body; the source is represented by the source icon and link.
- Main-item titles are larger links without underline. Body `==...==` markers are inline bold colored keywords, not tag UI.
- Tags are reserved for importance, trend state, star velocity, topic, and project highlight; renderers must color these tag types differently and de-duplicate identical tags.
- `model_releases` remains a structured JSON index only. Do not render a public `模型发布` section; model news must be written into `main_items`.
- `projects` remains highlight metadata for GitHub Trending. Do not render a public `今日值得关注的项目` section, `项目 highlights` subheading, or extra project list; only add a `项目 highlight` tag plus compact domain/use-case text to matching GitHub Trending Top 10 entries.
- Domestic / Chinese dynamics remain visible inside existing main groups, hot blogs, GitHub Trending, or the shared `社区线索` section. Do not render a separate public `国内动态` navigation item.
- AIGC, image generation, video generation, creator tools, and AI-assisted game-creation signals should appear as the existing `AIGC 动态` main group when they pass primary/official/paper/GitHub/multi-source verification. Intermediary AIGC leads stay in community leads with verification notes.
- Hot tech blog summaries should be roughly 100-160 Chinese characters split into 2-4 point-style takeaways. Attach high-signal original evidence images through `evidence_assets` when available; do not invent decorative images.
- Body evidence images and hot blog/card media images must support click-to-enlarge lightbox behavior; source icons remain inert identifiers.
- GitHub Trending displays Top 10 with rank/trend/star tags and a Chinese description that explains what the repo is, what it solves, and why it is worth watching.
- Builder observations must preserve `original_text` and a complete, precise Chinese `translation`; `content` should match the translation, not a summary. Use `handle` and `avatar_url` when available so build can cache Twitter-like preview avatars into `docs/assets/avatars/**`. The target public count is 5-20 when qualified candidates exist.
- WeChat/Zhihu/Reddit platform-exempt items must render as disclosed weak-signal cards, not confirmed facts. Public cards may show concise reader-facing title, compact summary, source link, platform tag, date, and disclosure; they must not show `source_id`, `rule_id`, `source_level`, `verification_status`, `matched_terms`, `why_watch`, collection notes, feed-style machine titles, or long raw English excerpts.

## AI Quality Review And Repair

- After writing `.tmp/daily-report.json` and before `report:write`, run the local quality review:

```powershell
npm run quality:review -- .tmp/daily-report.json .tmp/quality-review-YYYY-MM-DD.json .tmp/source-candidates-YYYY-MM-DD.json
```

- The review checks public text for AI stock phrasing, automatic `report:draft` template wording, overly broad or missing inline `==...==` highlights, thin main-item bullets, Builder translation/content mismatches, and selected-item back-references to `.tmp/source-candidates-YYYY-MM-DD.json`. Treat `ai_review_tasks` as the Codex/AI semantic review checklist; translation fidelity and factual wording may be fixed only from existing `candidate_pool`, `source_audit`, original links, or `original_text`.
- Apply safe automatic repairs to a new optimized draft rather than mutating facts in place:

```powershell
npm run quality:repair -- .tmp/daily-report.json .tmp/daily-report.optimized.json .tmp/quality-repair-YYYY-MM-DD.json .tmp/source-candidates-YYYY-MM-DD.json
```

- If Codex or another AI reviewer proposes wording changes, save them as a repair contract and apply them through the restricted contract gate:

```powershell
npm run quality:repair -- .tmp/daily-report.json .tmp/daily-report.optimized.json .tmp/quality-repair-YYYY-MM-DD.json .tmp/quality-ai-repair-YYYY-MM-DD.json .tmp/source-candidates-YYYY-MM-DD.json
```

- AI repair contracts may edit only public text fields. They must include `status:"ready"` and non-empty `edits` before runner execution; `status:"template"` files are placeholders and the runner will keep `final_status:"needs_ai_repair"` without applying them. They must not change URLs, dates, source names, `candidate_id`, `source_audit`, `quality_status`, evidence paths, or publish metadata. If the optimized draft still has blocking review issues after the runner's mode budget is exhausted, stop and report `.tmp/run-summary-YYYY-MM-DD.json`, `.tmp/quality-review-YYYY-MM-DD.json`, and `.tmp/quality-repair-YYYY-MM-DD.json`; dry-run defaults to 1 review/repair loop, publish mode defaults to max 5.
- Use `.tmp/daily-report.optimized.json` as the input to `report:write` when repairs were applied.

## Report Write

- The structured draft should already be written by `npm run report:draft`; if you edit it manually, rerun `report:draft` or update `.tmp/source-candidates-YYYY-MM-DD.json` so every selected item still points to an included candidate.
- Normalize it with:

```powershell
npm run report:write -- .tmp/daily-report.json reports-data YYYY-MM-DD
```

- Stop and repair the draft when `candidate_pool_missing`, `candidate_pool_reference_invalid`, or `freshness_gate_failed` appears.
- Stop and repair the draft when `mainline_source_authority_gate_failed` appears. If `editorial_summary_gate_failed`, `editorial_context_gate_failed`, or `non_primary_source_disclosure_gate_failed` appears in `degraded_sections`, repair before publish unless the user explicitly accepts a degraded report.
- If you commit/push any workflow, prompt, source, renderer, or quality-gate code after `report:write`, rerun `report:write` and `npm run build` so `self_check.automation_revision.git_commit` matches current `HEAD` and `origin_main_sha` proves the latest remote baseline.

## Build And Validate

- Generate static Pages output:

```powershell
npm run build
```

- The daily HTML must come from `.codex/skills/effective-interact/scripts/create-interaction.mjs` in `pre-rendered` mode.
- Run the targeted page checklist for the affected daily page:

```powershell
npm run quality:page-check -- YYYY-MM-DD docs .tmp/page-check-YYYY-MM-DD.json
```
- After build, inspect the affected daily HTML and confirm it contains the coverage window, has no `模型发布` heading, has no `今日值得关注的项目` heading or `项目 highlights` subheading, has keyword spans/classes for inline highlights, has star/project highlight tags only inside GitHub Trending items, has no duplicate star tags on a single Trending item, and opens body/blog/card images in the lightbox on desktop and mobile.
- If the affected page includes WeChat/Zhihu/Reddit sections, inspect the HTML or interaction input and confirm no platform card exposes `source_id`, `rule_id`, `source_level`, `verification_status`, `matched_terms`, `why_watch`, collection notes, or raw thread dumps.
- Run the full gate before any real publish:

```powershell
npm run validate
```

## Dry Run

- Preview the publish plan:

```powershell
npm run publish:dry-run:daily -- --date YYYY-MM-DD
```

- Capture changed files, commit message, and expected Pages URL.
- Confirm every `current_dirty_files` publisher artifact is also present in `will_stage_files`. A `publisher_dirty_outside_publish_plan` error is a real safety gate: repair the publish plan or move unrelated stale artifacts out of the worktree before publishing.
- Check that every report-linked `evidence_assets[*].local_path` appears in `will_stage_files` as `docs/assets/evidence/...`; local file existence alone is not enough for GitHub Pages. If Builder avatars were cached, confirm `docs/assets/avatars/**` is also in `will_stage_files`.
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
- If the run changed any content contract, also report which `editorial-authority.md` sections were updated so the next iteration does not rely on chat history.
- Human-assisted publish runs update `progress.md` and `session-handoff.md` when the run changes repo state or publish status. Scheduled automation runs do not modify or commit `progress.md`, `session-handoff.md`, or `tasks/current-task.md`.
