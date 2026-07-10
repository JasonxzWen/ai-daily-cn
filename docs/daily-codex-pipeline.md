# Daily Codex Pipeline

`daily:codex-pipeline` is the production-facing entrypoint for the Codex-driven daily generation flow. In local fixture mode it can still run the coarse DAG-lite MVP flow:

```text
prepare -> collect/context -> codex-generate -> validate -> repair-once -> summarize -> publish
```

In production mode (`--execute --publish` without a fixture), the script runs as a single-script DAG orchestrator. It writes `.tmp/daily-codex-pipeline/YYYY-MM-DD/pipeline-plan.json`, calls the existing daily workflow implementation, and normalizes `.tmp/run-summary-YYYY-MM-DD.json` with:

- `automation_pipeline_mode:"single_script_dag_orchestrator"`
- `orchestration.node_count`
- `source_watch.production_status`, `connected`, `consumed`, and same-run producer/persistence/build evidence
- report JSON, docs data JSON, and HTML paths
- validation, publish, Pages, blocking, and degraded summaries

## Command

Run the local DAG-lite pipeline:

```powershell
corepack pnpm run daily:codex-pipeline -- --date YYYY-MM-DD
```

Use a specific Codex model or work directory:

```powershell
corepack pnpm run daily:codex-pipeline -- --date YYYY-MM-DD --model gpt-5 --work-dir .tmp/daily-codex-mvp/YYYY-MM-DD
```

The runner does not inherit `npm_config_model` or user Codex model configuration. Pass `--model` only when an explicit compatible model is required. Every Codex invocation is bounded to 20 minutes by default; diagnosis or tests may override it with `--codex-timeout-ms 600000` (1..3600000 ms). A timeout requests complete process-tree termination and permits only a bounded grace (one second on Windows) before recording `codex_timeout`, even if the tree-kill command hangs or fails. Windows non-zero/error paths fall back to direct child termination; tests cover successful tree cleanup and a non-resolving terminator.

Custom work directories must stay under `.tmp/daily-codex-mvp/` and must name a child run directory. The runner refuses to clean or write arbitrary repository paths.

Run the deterministic fixture path for local validation:

```powershell
corepack pnpm run daily:codex-pipeline -- --date YYYY-MM-DD --fixture success
```

Production execution and publishing use the same entrypoint:

```powershell
corepack pnpm run daily:codex-pipeline -- --date YYYY-MM-DD --execute --publish --codex-bin codex.cmd
```

`--execute` records the production intent and configures the Codex command. `codex.cmd` and arguments after `--` are command configuration, not fixture modes. In a full repository checkout this command runs the single-script production orchestrator and may publish.

When production quality returns `needs_ai_repair`, the same entrypoint owns the continuation. Codex runs with `--ignore-user-config` in a read-only sandbox and returns a JSON-Schema-constrained final object; the CLI writes that object as UTF-8, and the host validates report date, declared task paths, evidence roots, output path, status, and edits before copying the contract and resuming. The model never writes report or repository files directly. Dry-run permits one automated repair attempt; publish permits at most five.

Source Watch now uses the normal production candidate path: `discover_source_watch` writes `.tmp/source-watch-YYYY-MM-DD.json` and returns a bounded stage receipt containing that exact path and SHA-256; `report:draft` classifies material snapshot changes; `report:write` persists them to `reports-data/internal/candidates/YYYY/MM/YYYY-MM-DD.candidates.json`; and `build` projects `included_in:"source_watch"` records into the public article index. There is no production sidecar flag. A summary reports `connected:true` and `consumed:true` only when the same run proves the producer stage receipt, successful draft/write stages, exact equality of the producer and persisted `target_id:snapshot_fingerprint` sets, the dated persistent pool, build consumption of that exact path, and a matching SHA-256. The consumption receipt contains only the requested report date (or the latest date for an undated manual build), so proof size and counts do not grow with history; the public article index still remains all-history. A valid zero-change day may still be consumed with zero included/public items. Missing or mismatched evidence remains disconnected with a concrete reason. The local DAG-lite fixture chain remains an internal contract test and is not a production handoff.

The daily runner also creates `.tmp/official-blog-context-YYYY-MM-DD.json` after `discover_content_sources` and passes it explicitly to `report:draft`. This reuses only already reviewed official-blog knowledge and keeps `official-blog-admission-v1` unchanged. The producer rejects a requested date that differs from the source artifact's own `report_date`; draft consumption rechecks both dates, source-artifact SHA-256, context SHA-256, bindings SHA-256, and each binding's record/type/score/source-entry relationship. When one candidate matches several reviewed records, the highest-score binding owns its content type instead of a later weak topical match overwriting an exact match. The receipt remains under internal `self_check` data and is removed from public site data. Zero matched records is a valid consumed empty state. Missing, stale, or malformed context degrades to `consumed:false` without promoting a candidate or blocking the rest of the daily.

Fixture modes:

- `success`: generation validates without repair.
- `repair-success`: the first generation fails validation, then the single repair pass succeeds.
- `failure`: generation and the one repair pass both fail, and the command exits non-zero.

## Artifact Contract

The DAG-lite fixture runner writes MVP artifacts under `.tmp/daily-codex-mvp/YYYY-MM-DD/`.

The production orchestrator writes its plan under `.tmp/daily-codex-pipeline/YYYY-MM-DD/` and the authoritative run summary at `.tmp/run-summary-YYYY-MM-DD.json`.

- `pipeline-plan.json`: sanitized production orchestration plan; fixture mode still uses the six DAG-lite stages.
- `context.json`: deterministic repository context used by the generation prompt.
- `generated.json`: first Codex generation output.
- `validation.json`: validation result for `generated.json`.
- `generated.repaired.json`: single repair output when validation fails.
- `repair-validation.json`: validation result for the repair output.
- `final.json`: final artifact selected by the runner.
- `stage-summary.json`: compact final-stage summary.
- `publish-summary.json`: publish-stage metadata when `--publish` is requested.
- `run-summary.json`: authoritative machine-readable run summary.

Fixture `run-summary.json` reports `mode:"daily_codex_dag_lite"`, `final_status`, `next_action`, `completed_stages`, validation state, repair state, the final artifact path, `publish_requested`, `execute_requested`, and `publication`.

Production `run-summary.json` reports `mode:"single_script_dag_orchestrator"`, `automation_pipeline_mode:"single_script_dag_orchestrator"`, `orchestration.node_count`, `completed_stages`, validation and publish summaries, Pages status, `blocking_issues`, `degraded_sections`, `structured_json_path`, `docs_data_json_path`, `html_path`, automated repair attempts, and evidence-derived Source Watch status. The connected record includes the producer path, persistent candidate-pool path and hash, plus normalized `source_watch_consumption`; incomplete evidence remains false instead of inferring consumption from path presence. `stage_id`, `failed_stage_id`, and `error` describe the latest unresolved failure; a later successful retry/fallback clears stale failure metadata.

## Validation Contract

MVP validation is deliberately narrow. The final artifact must be a JSON object with:

```json
{
  "report_date": "YYYY-MM-DD",
  "headline": "string",
  "summary": "string",
  "items": [
    { "title": "string", "url": "string", "note": "string" }
  ]
}
```

In fixture mode, validation failure invokes exactly one repair pass. In production, the mode budget above applies. Candidate coverage is one shared contract used by quality review and report_write, so a quality pass cannot later become a candidate-category/URL/date/verification/disclosure failure at write time.

## Replacement Boundary

The production entrypoint must remain `corepack pnpm run daily:codex-pipeline`. The legacy daily workflow is invoked only behind that single script so scheduled automation does not expand old manual stage commands.

Production generation intentionally runs in a clean latest-origin/main worktree. Therefore an unmerged branch can prove its fix with tests and real-artifact replay, but it cannot claim scheduled production acceptance from that clean worktree until the PR lands. Post-merge automation observation is the production verification boundary.

External automation may validate the evidence-backed `source_watch.connected`, `source_watch.consumed`, and `source_watch.consumption.candidate_pool_hashes` fields, but it must not hard-code `not_connected` or `consumed:false` as permanent expectations. The workflow contract treats a publish prompt that does not understand these evidence fields as stale. A Source Watch producer/consumer change must not be released to that scheduler until the prompt compatibility gate passes.

The next accepted infrastructure slice migrates repository commands to `corepack pnpm`. After that migration lands, scheduled automation must call `corepack pnpm run daily:codex-pipeline` and old `npm run` scheduler instructions are intentionally unsupported.
