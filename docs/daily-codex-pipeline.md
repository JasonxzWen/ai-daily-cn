# Daily Codex DAG-Lite Pipeline

`daily:codex-pipeline` is now the MVP production-facing entrypoint for the Codex-driven daily generation flow. It intentionally replaces the older compatibility-first multi-stage runner with one coarse DAG-lite flow:

```text
prepare -> collect/context -> codex-generate -> validate -> repair-once -> summarize
```

The MVP goal is to prove a runnable end-to-end generation loop first, then split the coarse stages into the full DAG once the loop is useful.

## Command

Run the MVP pipeline:

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

The DAG-lite CLI rejects legacy publish-mode flags such as `--execute` and `--publish`. Publishing, Pages verification, and final report assembly are not part of MVP-1.

Fixture modes:

- `success`: generation validates without repair.
- `repair-success`: the first generation fails validation, then the single repair pass succeeds.
- `failure`: generation and the one repair pass both fail, and the command exits non-zero.

## Artifact Contract

The runner writes all MVP artifacts under `.tmp/daily-codex-mvp/YYYY-MM-DD/`.

- `pipeline-plan.json`: sanitized plan with the six DAG-lite stages.
- `context.json`: deterministic repository context used by the generation prompt.
- `generated.json`: first Codex generation output.
- `validation.json`: validation result for `generated.json`.
- `generated.repaired.json`: single repair output when validation fails.
- `repair-validation.json`: validation result for the repair output.
- `final.json`: final artifact selected by the runner.
- `stage-summary.json`: compact final-stage summary.
- `run-summary.json`: authoritative machine-readable run summary.

`run-summary.json` reports `mode:"daily_codex_dag_lite"`, `final_status`, `next_action`, `completed_stages`, validation state, repair state, and the final artifact path.

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

The old compatibility runner stages are not part of this MVP path. Publishing, Pages verification, full report-data normalization, multi-agent fanout, and the final 16-node DAG migration are later slices. They should build on this DAG-lite run summary instead of reintroducing a parallel legacy runner.
