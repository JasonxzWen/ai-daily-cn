# Quality Snapshot

Use this document to track product areas and architecture layers across sessions.

Update after material sessions, before a new phase, or when validation evidence changes the quality picture.

## Rating Standard

- A: all required validation passes, boundaries are clean, agent-readable, and tests are stable.
- B: validation passes with minor readability, coverage, or stability gaps.
- C: partially usable with known gaps or areas that are hard for agents to reason about.
- D: unusable or structurally unsafe for continued work.

## Product Areas

| Area | Rating | P0/P1/P2 validation status | Browser acceptance status | Agent readability | Test stability | Key gaps | Last updated |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Public article index artifact | A | P0 passed: article contract, privacy scan, build-clean, regular and daily publish-plan assertions, full validate | Deferred; no UI behavior changed | Good | Stable in `tests/article-index.test.js` and `tests/publish.test.js` | Future DAG node schemas still need per-node replay | 2026-07-03 |
| Daily Codex DAG manifest contract | B | P0 targeted manifest validator, lineage negative tests, deterministic plan projection tests, guarded dry-run summary tests, dry-run summary schema tests, dry-run semantic validator tests, existing workflow contract, pipeline compatibility, and full validate passed | Deferred; no UI behavior changed | Good | `tests/daily-codex-dag.test.js` covers manifest, lineage, plan projection, dry-run CLI, dry-run summary schema, and semantic summary regressions | Full executable 16-node runner migration and per-node real schemas remain future work | 2026-07-03 |

## Architecture Layers

| Layer | Rating | Boundary health | Agent readability | Key gaps | Last updated |
| --- | --- | --- | --- | --- | --- |
| Public/private artifact boundary | A | `docs/articles.json` is now included in public scans with internal audit field denylist coverage | Good | DAG audit artifacts are not yet formalized per node | 2026-07-03 |
| DAG contract layer | B | `config/daily-codex-dag.json` references resilience policy instead of duplicating failure rules, validates artifact path ownership, checks input paths against upstream outputs, projects deterministic execution levels, exposes opt-in `.tmp/daily-codex-pipeline/**/*.json` dry-run summaries, validates dry-run run-summary envelopes with a dedicated schema, and checks strict dates plus plan/run invariants with a semantic validator | Good | Dry-run CLI does not execute nodes; production runner still uses coarse stages | 2026-07-03 |

## Change History

### YYYY-MM-DD

- Change:
- Improved:
- Regressed:
- New gaps:
- Closed gaps:

### 2026-07-03

- Change: Added a dry-run summary semantic validator for daily Codex DAG artifacts.
- Improved: Dry-run summaries now reject schema-invalid direct-call envelopes, non-real `report_date` values, non-canonical UTC `Date#toISOString()` timestamps, inconsistent plan/run node lists, malformed level partitions, dependency-level regressions, and non-throw malformed JS inputs.
- Regressed: None known.
- New gaps: The dry-run validator is intentionally scoped to dry-run summaries; executable node results, per-node artifacts, and production DAG runner migration remain future work.
- Closed gaps: PR #213's deferred stricter date-format and cross-field invariant risks are now covered by targeted semantic tests.

### 2026-07-03

- Change: Added a dedicated daily Codex DAG dry-run run-summary schema and minimal contract fixture.
- Improved: Helper output, CLI stdout, CLI catch failures, semantic dry-run failures, and fixture JSON now share one validated success/failure envelope contract.
- Regressed: None known.
- New gaps: The schema is still a dry-run contract; executable node results, per-node artifacts, stricter date-format validation without disabled Ajv formats, and cross-field invariant checks remain future work.
- Closed gaps: Persisted dry-run summaries now have a replayable JSON contract instead of only ad hoc test assertions.

### 2026-07-03

- Change: Added guarded opt-in summary-file output for the daily Codex DAG dry-run CLI.
- Improved: Dry-run summaries can now be persisted under `.tmp/daily-codex-pipeline/**/*.json` for local replay and debugging while stdout remains the primary machine-readable result.
- Regressed: None known.
- New gaps: The CLI still does not execute Codex, shell commands, production publish, or per-node real replay fixtures; symlink hardening under `.tmp` is deferred until the runner accepts less-trusted paths.
- Closed gaps: The DAG dry-run runner can now produce a controlled local artifact without changing production runner or public artifact behavior.

### 2026-07-03

- Change: Added a stdout-only daily Codex DAG dry-run runner skeleton.
- Improved: The validated DAG plan can now be consumed by a CLI that emits deterministic, machine-readable dry-run summaries and structured failures.
- Regressed: None known.
- New gaps: The CLI still does not execute Codex, shell commands, `.tmp` summaries, production publish, or per-node real replay fixtures.
- Closed gaps: The DAG has moved from pure plan projection to a non-mutating runner contract suitable for the next executable-node slice.

### 2026-07-03

- Change: Added read-only deterministic DAG execution-plan projection from the validated manifest.
- Improved: Future runner migration now has stable node descriptors and topological levels without executing commands or changing production runner semantics.
- Regressed: None known.
- New gaps: Full executable DAG runner, real per-node I/O schemas, and replay fixtures still need later stages.
- Closed gaps: The manifest can now be projected into a deterministic execution plan before runner migration.

### 2026-07-03

- Change: Added DAG input-output lineage validation to the manifest semantic validator.
- Improved: Non-root node inputs must now be produced by direct or transitive dependency outputs, with exact template-string matching for fanout artifact paths.
- Regressed: None known.
- New gaps: Full executable DAG runner, true per-node I/O schemas, and replay fixtures still need later stages.
- Closed gaps: The PR #208 P2 lineage hardening item is now covered by targeted negative tests.

### 2026-07-03

- Change: Added a validated daily Codex DAG manifest contract and `dag:validate` gate.
- Improved: Future DAG nodes now have auditable IDs, dependency boundaries, schema refs, fixture refs, artifact ownership, and resilience policy references before runner migration.
- Regressed: None known.
- New gaps: Full executable DAG runner, true per-node I/O schemas, and replay fixtures still need later stages.
- Closed gaps: DAG refactor now has a durable manifest gate in `npm run validate`.

### 2026-07-03

- Change: Added public privacy scanning coverage for `docs/articles.json` and tests for article schema negative cases, deterministic index generation, and regular/daily publish plan staging.
- Improved: Public article index boundary is validation-backed, including the date-scoped daily publish path.
- Regressed: None known.
- New gaps: Full Codex CLI DAG still needs per-node schemas and replay fixtures.
- Closed gaps: `docs/articles.json` is no longer outside the default public artifact privacy scan.
