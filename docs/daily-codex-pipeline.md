# Daily Codex Pipeline

`daily:codex-pipeline` is the planned script entrypoint for AI-assisted daily report generation. It keeps collection, admission, per-item summaries, and assembly in separate Codex CLI contexts so each stage can be debugged independently.

## Commands

Dry-run plan only:

```powershell
npm run daily:codex-pipeline -- --date YYYY-MM-DD --dry-run
```

Execute the staged pipeline:

```powershell
npm run daily:codex-pipeline -- --date YYYY-MM-DD --execute
```

Execute and publish from the clean automation checkout:

```powershell
npm run daily:codex-pipeline -- --date YYYY-MM-DD --execute --publish
```

Use a specific model or working directory:

```powershell
npm run daily:codex-pipeline -- --date YYYY-MM-DD --dry-run --model gpt-5 --work-dir .tmp/daily-codex-pipeline/YYYY-MM-DD
```

## Stage Contract

The script writes `pipeline-plan.json` and stage prompts under the selected work directory.

- `collect`: runs in an ephemeral Codex context and writes raw candidates plus source audit. It does not choose items and does not write public copy.
- `admit`: runs in a new ephemeral Codex context and writes accepted/rejected items. Admission reasons stay internal.
- `summarize:*`: runs one ephemeral Codex context per accepted item. Each output is reader-facing copy for one item only.
- `assemble`: maps admitted items and summary JSON into a structured report draft without re-deciding admission.
- `quality-review`, `report:write`, `sources-phase5-audit`, `build`, `content:contract`, and `quality:page-check`: deterministic repository commands. `quality-review` runs with `--fail-on-issues`; `sources-phase5-audit` records the recent source-run audit before build and publish validation.
- `publish-dry-run`, `publish`, and `pages-verify`: only run when `--publish` is present. The publish stage first uses the normal git publish command with Pages verification skipped, falls back to `publish:github-api` if that channel fails, and then runs Pages verification as an independent allow-failure stage.

The script writes `.tmp/run-summary-YYYY-MM-DD.json` with `final_status`, `next_action`, stage log paths, report JSON/HTML paths, and publish mode. If repository publish succeeds but Pages verification is still delayed by cache or network propagation, the final status is `published_pending_pages_verification` and `next_action.kind` is `verify_pages_later`. The automation prompt should call the script with date and publish intent, then read that summary. It should not inline the old hand-written discovery, repair, build, and publish sequence.

## Public Copy Boundary

The per-item summary stage is the only stage allowed to write public news copy. It must follow `DESIGN.md`:

- no source-first machine logs;
- no admission rationale in public text;
- no visible labels such as `发生了什么：` or `为什么值得看：`;
- 2-3 concrete reader-facing bullets per news item;
- GitHub and Hugging Face entries explain what the project is and why a reader should understand it.

If a summary cannot be grounded in the input evidence, it must set `insufficient_evidence: true` instead of inventing content.
