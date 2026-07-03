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
| Public article index artifact | A | P0 passed: article contract, privacy scan, build-clean, regular and daily publish-plan assertions, full validate | Deferred; no UI behavior changed | Good | Stable in `tests/article-index.test.js` and `tests/publish.test.js` | Future DAG execution still needs live per-node replay | 2026-07-03 |
| Daily Codex DAG manifest contract | B | P0/P1 passed after final-closeout P1 fix: targeted future runtime-policy checks and full `npm run validate` passed | Deferred; no UI behavior changed | Good | `tests/daily-codex-dag.test.js` covers manifest/run-summary readiness projection, future node execution spec shape, executor/invocation pairing, cwd/prompt path preflight, Codex prompt existence and file-type rejection, blank argv/args token rejection, runtime-policy invariants, production manifest spec absence, mismatch rejection, no-execution contract-run semantics, and artifact binding guards; targeted DAG test reported 30/30 and full regression reported 703 tests, 701 passed, 2 skipped after the final-closeout P1 fix | Full executable 16-node runner migration and live per-node command/Codex execution remain future work; no production node may carry `node_execution_spec` yet | 2026-07-03 |

## Architecture Layers

| Layer | Rating | Boundary health | Agent readability | Key gaps | Last updated |
| --- | --- | --- | --- | --- | --- |
| Public/private artifact boundary | A | `docs/articles.json` is now included in public scans with internal audit field denylist coverage; node result audit metadata is schema-whitelisted before live execution exists | Good | Node result audit is not manifest-aware ownership enforcement; future live node execution still needs artifact emission, manifest/path-scope checks, and privacy checks against real outputs | 2026-07-03 |
| DAG contract layer | B | `config/daily-codex-dag.json` references resilience policy instead of duplicating failure rules, validates artifact path ownership, checks input paths against upstream outputs, requires per-node `execution_contract.readiness`, projects deterministic execution levels and readiness into dry-run/contract-run summaries, validates run-summary envelopes with a dedicated schema plus semantic validators, defines schema/semantic validation for executable node result contracts, defines a future `execution_contract.node_execution_spec` shape with semantic cwd/prompt path preflight, invocation input policy, and runtime policy, and exposes the non-publishing contract-run through a workflow-validated npm script | Good | Contract-run deliberately emits skipped node-scope results only; `node_executable` readiness is reserved and rejected even with a schema-valid future execution spec until executor migration enables standalone node execution; real command/Codex execution, command allowlists or executable lookup, live artifact existence/schema/privacy proof, retry execution, network allowlists, secret scopes, fanout item expansion, barrier aggregation, package/workflow production migration, and npm argument ergonomics remain future work | 2026-07-03 |

## Change History

### YYYY-MM-DD

- Change:
- Improved:
- Regressed:
- New gaps:
- Closed gaps:

### 2026-07-03

- Change: Added semantic runtime-policy validation for future DAG node execution specs without enabling execution.
- Improved: Future specs now validate deterministic node-scoped idempotency keys, concurrency group alignment, retry backoff shape, manifest-output artifact verification for reusable outputs, public/non-public publish and sandbox boundaries, and reserved network/secret modes. Targeted tests include valid synthetic public and non-public specs that fail exactly on the `node_executable` reserved gate; full `npm run validate` passed after the final-closeout P1 fix with 703 tests, 701 passed, 2 skipped.
- Regressed: None known.
- New gaps: This still does not execute DAG nodes, does not define command allowlists or flag parsing, does not implement live retry/concurrency scheduling, does not define network allowlist or secret-scope runtime semantics, and does not verify real artifacts.
- Closed gaps: The previously schema-only runtime-policy fields now have deterministic manifest-local semantic checks before live executor migration.

### 2026-07-03

- Change: Added semantic invocation input policy for future DAG node execution specs without enabling execution.
- Improved: Future Codex CLI `invocation.prompt_template` now must be a safe repo-relative path that exists as a repository file, unsafe prompt paths do not fall through to existence checks, command `argv` and Codex `args` reject blank tokens, and the production manifest is explicitly tested to carry no `node_execution_spec`.
- Regressed: None known.
- New gaps: This still does not execute DAG nodes, does not check command executability or allowlists, does not parse command flags, and does not define sandbox/publish combinations, retry/idempotency runtime behavior, real artifact verification, or production manifest specs.
- Closed gaps: The previously deferred prompt-existence, prompt file-type, and blank invocation-token semantic checks are now covered by targeted DAG tests.

### 2026-07-03

- Change: Added semantic preflight guards for future DAG node execution spec paths without enabling execution.
- Improved: Future `node_execution_spec.cwd` now accepts only `.` or deterministic repo-relative paths, and Codex CLI `invocation.prompt_template` must also be repo-relative. The validator rejects absolute paths, Windows drive paths, URL-like paths, parent traversal, empty segments, raw backslashes, and colon-containing path segments before any later executor migration can run commands.
- Regressed: None known.
- New gaps: Previous slice gap at the time: this still did not execute DAG nodes and did not check command argv, prompt file existence, sandbox/publish combinations, retry/idempotency runtime behavior, or production manifest specs. The later invocation-policy slice closes prompt existence and blank invocation-token checks.
- Closed gaps: The previously noted cwd/path preflight gap is now covered by semantic validation, targeted DAG tests, and full validation.

### 2026-07-03

- Change: Added a future DAG node execution spec contract shape without enabling node execution.
- Improved: `execution_contract.node_execution_spec` now has a schema-backed shape for executor type, cwd, command or Codex CLI invocation, declared input/output artifact bindings, timeout, retry policy, concurrency group, sandbox, artifact verification, idempotency key, resume policy, and publish boundary. Semantic validation keeps `node_executable` reserved, rejects specs on `planned_only` and `legacy_mapped` production nodes, and checks spec bindings against declared node inputs and outputs.
- Regressed: None known.
- New gaps: No production node may carry the spec yet, dry-run/contract-run summaries do not project it, and the runner still does not execute command or Codex node specs. Future slices must enable standalone node execution, instantiate specs per node, verify real outputs, and migrate publish orchestration deliberately.
- Closed gaps: The next executor migration now has a durable manifest-level contract shape and negative tests instead of an undefined `node_executable` payload.

### 2026-07-03

- Change: Added explicit DAG node execution readiness contracts.
- Improved: Every manifest node now declares `execution_contract.readiness`; planned nodes must be `planned_only`, legacy mapped nodes must be `legacy_mapped`, and `node_executable` is reserved until executor migration enables standalone node execution. Plan projection, dry-run/contract-run schema validation, semantic validators, fixture replay, and negative tests all carry the same readiness contract.
- Regressed: None known.
- New gaps: This still does not execute DAG nodes. Future work must enable the now-defined node execution spec deliberately before accepting `node_executable`, including real command/Codex invocation, artifact verification, retry/concurrency behavior, result envelopes, resume/idempotency behavior, and publish boundaries.
- Closed gaps: Planned and legacy-mapped DAG nodes can no longer be mistaken for standalone executable nodes by manifest or run-summary consumers.

### 2026-07-03

- Change: Added a workflow-validated npm entrypoint for the daily Codex DAG contract-run.
- Improved: `daily:codex-dag:contract-run` now runs `scripts/run-daily-codex-dag.mjs --contract-run --json`, `config/daily-workflow-contract.json` requires that exact script, and unit tests prove both the production contract registration and missing/wrong command drift failures.
- Regressed: None known.
- New gaps: The entrypoint remains contract validation only; it does not execute real DAG nodes or publish. In the current npm/PowerShell environment the smoke command uses `npm run daily:codex-dag:contract-run -- -- --date YYYY-MM-DD`; future human-facing ergonomics can improve separately.
- Closed gaps: The contract-run is no longer only a direct script flag; it has a stable npm-level bridge guarded by workflow validation.

### 2026-07-03

- Change: Added a non-publishing daily Codex DAG contract-run adapter.
- Improved: The DAG runner can now emit a validated `daily_codex_dag_contract_run` summary with one skipped node-scope result per manifest node, direct skipped/continue dependency evidence, explicit `not_expanded` fanout/barrier records, empty `executed_commands` and `codex_invocations`, and `.tmp`-guarded optional summary output.
- Regressed: None known.
- New gaps: This is still not real execution; success node results, command/Codex spawning, artifact existence/schema proof, retries, fanout item expansion, barrier aggregation, package/workflow wiring, and production runner migration remain future work.
- Closed gaps: The DAG has moved from standalone node result contracts to a non-executing runner adapter that proves plan-to-node-result wiring without side effects or fake success semantics.

### 2026-07-03

- Change: Added a standalone executable daily Codex DAG node result contract.
- Improved: Node results now have a schema, fixture, helper, and semantic validator for run/date identity, normal/fanout/barrier scopes, final-result retry fields, status/downstream semantics, declared/resolved artifacts, dependency snapshots, issue objects, strict timing, and whitelisted audit metadata.
- Regressed: None known.
- New gaps: The contract is not yet wired into a live node executor, package script, workflow gate, or production runner; real per-node artifact writes and replay remain future work; node result audit/path fields are not yet checked against the manifest's owner path scope.
- Closed gaps: The previous executable-node-result gap now has a deterministic schema-backed object model before side effects are introduced.

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
