# Daily Codex Pipeline

`daily:codex-pipeline` is the production-facing entrypoint for the Codex-driven daily generation flow. In local fixture mode it can still run the coarse DAG-lite MVP flow:

```text
prepare -> collect/context -> codex-generate -> validate -> repair-once -> summarize -> publish
```

In production mode (`--execute --publish` without a fixture), the script runs as a single-script DAG orchestrator. It writes `.tmp/daily-codex-pipeline/YYYY-MM-DD/pipeline-plan.json`, calls the existing daily workflow implementation, and normalizes `.tmp/run-summary-YYYY-MM-DD.json` with:

- `automation_pipeline_mode:"single_script_dag_orchestrator"`
- `orchestration.node_count`
- `source_watch_admitted_artifact_path`
- report JSON, docs data JSON, and HTML paths
- validation, publish, Pages, blocking, and degraded summaries

## Command

Run the local DAG-lite pipeline:

```powershell
npm run daily:codex-pipeline -- --date YYYY-MM-DD
```

Use a specific Codex model or work directory:

```powershell
npm run daily:codex-pipeline -- --date YYYY-MM-DD --model gpt-5 --work-dir .tmp/daily-codex-mvp/YYYY-MM-DD
```

Custom work directories must stay under `.tmp/daily-codex-mvp/` and must name a child run directory. The runner refuses to clean or write arbitrary repository paths.

Run the deterministic fixture path for local validation:

```powershell
npm run daily:codex-pipeline -- --date YYYY-MM-DD --fixture success
```

Production execution and publishing use the same entrypoint:

```powershell
npm run daily:codex-pipeline -- --date YYYY-MM-DD --execute --publish --codex-bin codex.cmd
```

`--execute` records the production intent and configures the Codex command. `codex.cmd` and arguments after `--` are command configuration, not fixture modes. In a full repository checkout this command runs the single-script production orchestrator and may publish.

When `.tmp/daily-codex-pipeline/YYYY-MM-DD/artifacts/admitted-candidates.json` exists, callers may pass it explicitly:

```powershell
npm run daily:codex-pipeline -- --date YYYY-MM-DD --execute --publish --source-watch-admitted-artifact .tmp/daily-codex-pipeline/YYYY-MM-DD/artifacts/admitted-candidates.json
```

The runner does not scan `.tmp` for the newest artifact. The summary records `source_watch_admitted_artifact_path` so scheduled automation can report which admitted artifact was used. If the artifact is not provided, the field remains empty; the normal daily publish flow still runs.

Fixture modes:

- `success`: generation validates without repair.
- `repair-success`: the first generation fails validation, then the single repair pass succeeds.
- `failure`: generation and the one repair pass both fail, and the command exits non-zero.

## Artifact Contract

The DAG-lite fixture runner writes MVP artifacts under `.tmp/daily-codex-mvp/YYYY-MM-DD/`.

The production orchestrator writes its plan under `.tmp/daily-codex-pipeline/YYYY-MM-DD/` and the authoritative run summary at `.tmp/run-summary-YYYY-MM-DD.json`.

- `pipeline-plan.json`: sanitized plan with the six DAG-lite stages.
- `context.json`: deterministic repository context used by the generation prompt.
- `generated.json`: first Codex generation output.
- `validation.json`: validation result for `generated.json`.
- `generated.repaired.json`: single repair output when validation fails.
- `repair-validation.json`: validation result for the repair output.
- `final.json`: final artifact selected by the runner.
- `stage-summary.json`: compact final-stage summary.
- `publish-summary.json`: publish-stage metadata when `--publish` is requested.
- `run-summary.json`: authoritative machine-readable run summary.

Fixture `run-summary.json` reports `mode:"daily_codex_dag_lite"`, `final_status`, `next_action`, `completed_stages`, validation state, repair state, the final artifact path, `publish_requested`, `execute_requested`, `source_watch_admitted_artifact_path`, and `publication`.

Production `run-summary.json` reports `mode:"single_script_dag_orchestrator"`, `automation_pipeline_mode:"single_script_dag_orchestrator"`, `orchestration.node_count`, `completed_stages`, validation and publish summaries, Pages status, `blocking_issues`, `degraded_sections`, `structured_json_path`, `docs_data_json_path`, and `html_path`.

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

If validation fails, the runner invokes exactly one repair pass. If the repair output still fails validation, the runner writes a blocked summary and exits non-zero.

## Replacement Boundary

The production entrypoint must remain `npm run daily:codex-pipeline`. The legacy daily workflow is invoked only behind that single script so scheduled automation does not expand old manual stage commands.
