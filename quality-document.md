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
| Daily production entrypoint | B | Earlier runner/collector/context gates remain green; the clean-clone hotfix adds 2/2 focused RED/GREEN coverage, 54/54 publish tests, and a warning-free live workflow-contract check | No Web behavior changed; browser acceptance is correctly skipped under the supported `1280x900` desktop-only policy | Good | Bounded clone paths, force/reset sequencing, dependency refresh, stage receipts, safe repair paths, terminal projection, source/context lineage, and explicit UTF-8 scheduler reads are contract-covered | Repair PR/CI plus a preserved-evidence post-merge non-publish rerun remain; REC-324 and backfills are separate | 2026-07-13 |
| Main selection fact contract | B | Affected draft/quality/Phase5/runner/source tests pass 143/143; publish tests pass 54/54; final aggregate tests pass 893 total / 891 pass / 0 fail / 2 skipped; build-clean, 194-file privacy, E2E, workflow/resilience/Harness, and diff gates pass; a 2026-07-09 replay returns zero consistency issues across 342 audited sources and eight public stories | Existing Ops status consumption passed once at the sole supported `1280x900`, with no console warning/error or horizontal overflow; no visual composition changed | Good | Explicit paired version markers, shared rejection vocabulary, 5/8/12 bounds, global score/rank/disposition/lineage receipts, and one consistency collector replace the synthetic post-quality rank chain | Fresh merged-main non-publish entrypoint evidence remains before `production_verified` | 2026-07-13 |
| ADC public frontend | A | Edition-first `home.json`, favicon, desktop-only guard, 7/7 ADC visual contracts, affected 74/74 tests, typecheck, E2E, build-clean, privacy, design gates, and final full validation pass | Home, ops, official blogs, and 2026-07-09 report pass at `1280x900`; 4/4 have no console/page errors, the homepage does not request `articles.json`/`feed.json`, and screenshots are retained under `.tmp` | Good | Schema, build, publish, status-self-check, request, relative-link, ICO-size, privacy, and browser contracts are stable | Generic third-party Astryx compatibility remains outside support; desktop cross-browser/a11y hardening remains P2 | 2026-07-13 |
| Automation operating state | B | Exactly one live project definition (`ai-2`) remains; its dated run summary is now read with explicit PowerShell UTF-8 through a supported prompt-only update. Field-by-field reread preserved ACTIVE/schedule/cwd/project/bootstrap/model/reasoning/worktree/`--publish`, and live workflow validation passes without warnings | Not applicable | Improved by permanent manifests and a repository single-automation/encoding contract | Automation role, inventory, stale-assertion, and missing-encoding regressions are green | 48 retained dirs (11.0 GB), ambiguous/dirty/nonterminal histories, unmanaged stale DB cache row, retention automation, and three backfills remain | 2026-07-13 |
| Public article index artifact | B | Article-index tests plus full build-clean/privacy validation pass for Source Watch projection, dedupe, newest event, denylist, determinism, and fixed-date receipt | Source Watch rail/backrefs and `1280x900` desktop overflow accepted on the generated public fixture | Good | Stable focused, contract, and E2E tests | Real same-run receipt is proven; overall pipeline still needs a fresh terminal rerun after the unrelated S-69 page-gate fix | 2026-07-13 |
| Daily Codex DAG-lite MVP runner | B | P0/P1 focused and full validation pass; DAG stale Aify contract was repaired, while live `ai-2` workflow compatibility and automation inventory agree | Public effects accepted; production execution waits for merged remote main | Good | Fixture and production modes cover safe paths, host writes, repair limits, terminal truth, Source Watch semantics, and publish boundaries | Real non-publish/Pages evidence and full 16-node migration remain open | 2026-07-10 |
| Daily Codex DAG manifest contract | B | P0/P1 passed for PR-D two-node fixture sequencing; full `corepack pnpm run validate` passed | Deferred; no UI behavior changed | Good | `tests/daily-codex-dag.test.js` covers manifest/run-summary readiness projection, future node execution spec shape, executor/invocation pairing, cwd/prompt path preflight, Codex prompt existence and file-type rejection, blank argv/args token rejection, command invocation policy, controlled command runtime resolution, Codex CLI runtime resolution, generic node runtime dispatch, real deterministic command execution into a validated node result, live `.tmp` JSON input/output metadata resolution, missing-output and malformed-output failure, runtime-policy invariants, production manifest spec absence, mismatch rejection, no-execution contract-run semantics, artifact binding guards, the PR-B synthetic executable-node MVP CLI summary, the PR-C `score` real-node adapter fixture, and the PR-D fixture-only `classify-tag-entity -> score` sequence with ordered dependency evidence, artifact handoff, upstream blocking, downstream artifact failure, CLI stdout-only coverage, schema-only ordering rejection, and semantic rejection of score blocked after classify success; targeted DAG test reported 57/57; full validate exited 0 with 733 tests / 731 pass / 0 fail / 2 skipped | Codex execution, prompt delivery, retry/repair integration, artifact business-schema validation, production manifest execution specs, and full 16-node runner migration remain future work; production `config/daily-codex-dag.json` still carries no `node_execution_spec` | 2026-07-06 |

## Architecture Layers

| Layer | Rating | Boundary health | Agent readability | Key gaps | Last updated |
| --- | --- | --- | --- | --- | --- |
| Shared ADC visual layer | A | `@adc/design/theme.css` remains the single visual-contract source; `src/adc-theme.js` versions the shared asset used by React, static shells, and all 49 regenerated desktop-only reports; project-owned responsive branches are removed and guarded | Good | Desktop cross-browser/a11y coverage remains P2; third-party generic compatibility is not a support claim | 2026-07-13 |
| Automated repair boundary | B | Codex is read-only and returns JSON-Schema-constrained UTF-8 output; host preflight restricts handoff kind, real evidence roots, schema/date/task paths, contract destination, attempts, and per-call time. Follow-up retries now authorize only safe public-editorial tasks that cover every error path while leaving advisory tasks as evidence | Good | Scheduled post-merge evidence, first-pass authoring under REC-324, cost tracking, and signal-interrupt finalization remain | 2026-07-13 |
| Public/private artifact boundary | B | Source Watch and `home.json` expose only schema-bound reader fields; internal quality scores, candidate paths/hashes, admission reasons, and self-check data are excluded. Official-blog context remains internal and hash-bound; full privacy/build-clean/E2E gates pass | Good | Post-merge real same-run proof and future live DAG node ownership remain | 2026-07-13 |
| Selection fact boundary | B | Draft owns scoring and selection; candidates persist private score/rank plus one terminal disposition; report_write, quality, Phase5, source effectiveness, and index status consume or validate those facts. The duplicate post-quality rank/classifier/public-lane chain is retired | Good | Production verification waits for a fresh merged-main non-publish run; historical rank artifacts remain as immutable evidence only | 2026-07-13 |
| HTML-index collection boundary | B | Title, summary, and image facts are restricted to the exact anchor or same-URL JSON-LD; date fallback is restricted to the exact anchor, page metadata, or the anchor's containing `article`/`li`, and high-specificity Fable prose requires identity fields plus the original Anthropic news URL | Good | Generic anchors without structured metadata now fail closed; 63 HTML-index sources still need real per-source productivity classification under REC-312 | 2026-07-10 |
| DAG-lite runner layer | B | Without production flags, `daily:codex-pipeline` runs the six-stage fixture/MVP path under `.tmp/daily-codex-mvp/YYYY-MM-DD/`; with `--execute`/`--publish`, the same entrypoint selects the single-script production orchestrator and bounded repair/resume path | Good | The fixture path proves deterministic orchestration; live nested-Codex CI and full 16-node production migration remain open | 2026-07-10 |
| DAG contract layer | B | `config/daily-codex-dag.json` references resilience policy instead of duplicating failure rules, validates artifact path ownership, checks input paths against upstream outputs, requires per-node `execution_contract.readiness`, projects deterministic execution levels and readiness into dry-run/contract-run summaries, validates run-summary envelopes with a dedicated schema plus semantic validators, defines schema/semantic validation for executable node result contracts, defines a future `execution_contract.node_execution_spec` shape with semantic cwd/prompt path preflight, invocation input policy, command policy, controlled command runtime resolution, explicit Codex CLI runtime resolution, generic node runtime dispatch, command-only executable node closed loop, live helper-level artifact metadata proof, a PR-B synthetic executable-node MVP CLI summary, a PR-C fixture-only `score` adapter, and a PR-D fixture-only `classify-tag-entity -> score` sequence proving dependency ordering, artifact handoff, and structured downstream blocking | Good | `node_executable` readiness is still rejected in the production manifest; PR-D deliberately has no Codex execution, prompt rendering, production manifest specs, retry/repair integration, or full production runner migration | 2026-07-06 |

## Change History

### 2026-07-13 (clean publish clone recovery)

- Change: Made reused dedicated clean publish clones force-checkout the current remote branch before the existing hard reset, and made reused clones refresh dependencies from the current frozen lockfile even when `node_modules` already exists.
- Improved: The confirmed RED cases now pass 2/2; the complete publish suite passes 54/54; the live workflow contract remains green with no warnings. The fix is restricted to the already validated `.tmp` clean-clone boundary and does not touch user worktrees or publication semantics.
- Regressed: No known product or Web regression. Reused clean clones perform one additional idempotent pnpm install instead of trusting directory presence.
- New gaps: The old 2026-06-24 clone must be manifested and quarantined before recovery because it contains exact historical variants, different-hash evidence images, and internal run artifacts. Git stderr projection remains a separate diagnostic-hardening opportunity.
- Closed gaps: Tracked residue can no longer block the reset it was supposed to precede, and stale pre-lockfile dependencies can no longer survive solely because `node_modules` exists.

### 2026-07-13 (REC-323 selection-fact convergence)

- Change: Replaced the unused synthetic post-quality classifier/rank artifact with the draft selector as the only production fact. Persisted private score/rank and terminal dispositions, centralized rejection reasons and 5/8/12 bounds, and bound quality, report_write, Phase5, source effectiveness, homepage status, and public privacy to one consistency contract.
- Improved: Affected tests pass 143/143, publish tests pass 54/54, and the final aggregate test run passes 893 total / 891 pass / 0 fail / 2 skipped; build-clean, 194-file privacy, E2E, workflow/resilience/Harness, and diff gates pass. A 2026-07-09 replay produced 342 audited source receipts (12 selected sources, 330 exact rejections), zero dual/missing dispositions, 40 monotonic global ranks, and eight public stories. The shared collector returned zero issues, quality was `ok`, report_write/build and Phase5 succeeded, and public output contains none of the internal audit fields. The gate also corrected one stale official-blog report-date fixture and replaced a load-sensitive timeout marker race with direct child-PID termination proof.
- Regressed: No reader-facing data or layout was added. Historical editorial-rank artifacts remain committed only as evidence and are no longer staged or consumed.
- New gaps: Fresh merged-main non-publish entrypoint evidence remains before production verification; routine builder translation review remains REC-324.
- Closed gaps: Uniform fake scores, zero-overlap rank admission, 39 dual dispositions, incomplete rejection counts, inconsistent 1/5/12/30 public status thresholds, and the dead public editorial-selection/daily-lane projections are closed locally.

### 2026-07-13 (edition-first public homepage and favicon)

- Change: Replaced the homepage's event-date/quality-score inference with a schema-validated `home.json` projection owned by report edition and editorial story order. Added lead/secondary/compact hierarchy, kept Source Watch after main content, removed public score presentation, and shipped the user-supplied character as one six-size favicon across all public surfaces.
- Improved: Current homepage bootstrap data fell from 1,197,407 bytes to 19,524 bytes (61.3× smaller). Affected tests pass 74/74, browser acceptance covers four public surfaces at `1280x900` without console/page errors, and the final full validation passes all Harness/content/source/design/build-clean/privacy/E2E/diff gates.
- Regressed: No known product regression. Independent review found and closed a pre-PR P1 where status self-check would have rejected historical backfills outside the bounded home window.
- New gaps: The latest committed edition is still 2026-07-09 and missing-date backfills remain a separate delivery slice; this PR does not claim REC-323 scoring or Aify first-class promotion.
- Closed gaps: S-67 favicon 404, S-77 full-archive/event-date homepage drift, and S-78 historical-backfill self-check false block are closed locally.

### 2026-07-13 (production truth closure)

- Change: Fixed the natural 2026-07-13 run's three production-fact gaps: mixed advisory tasks no longer stop a valid bounded repair retry; real content-source artifacts now carry the business date consumed by official-blog context; blocked summaries project semantic stage errors into non-empty terminal evidence. Updated only `ai-2` through the supported interface so PowerShell reads the UTF-8 summary explicitly.
- Improved: Focused batches pass 47/47 and 50/50; the live workflow validator passes with no failures or warnings; final full validation passes 912 total / 910 pass / 0 fail / 2 skipped with Harness, content, source, design, build-clean, privacy, E2E, JSON, and whitespace gates.
- Regressed: No Web or publication behavior changed. A first full-validation attempt caught and corrected a stable feedback-ledger test-name mismatch before delivery.
- New gaps: Natural post-merge proof is still required. REC-324 continues to own first-pass authoring quality; this Slice makes exceptional repair reliable but does not claim repair is now exceptional.
- Closed gaps: One-of-five false stop, missing official-blog source business date, empty blocked terminal evidence, and implicit PowerShell summary encoding are closed locally or contract-guarded externally.

### 2026-07-13 (REC-330 desktop-only scope retirement)

- Change: Retired project-owned mobile, tablet, narrow-screen, and touch-only support across Web CSS, static/report renderers, page checks, E2E, effective-interact/html-work-reports, design guidance, Claude/Codex Skill mirrors, and generated public artifacts. Added the canonical `1280x900` policy and deterministic regression guard; deleted two unreferenced generated reports.
- Improved: Removed roughly 16k lines, regenerated all 49 reports, and accepted home/ops/official-blog/representative-report at `1280x900` with zero console/network/overflow failures. Full validation passes 908 total / 906 pass / 0 fail / 2 skipped, build-clean, 193-file privacy scan, E2E, Harness, design, JSON, and whitespace gates.
- Regressed: No known product regression. One E2E reload formerly hidden inside the removed mobile block was made explicit in the remaining desktop flow.
- New gaps: Generic Astryx/React bundle compatibility remains by dependency design and is explicitly not product support. Repo-size validation still reports the pre-existing duplicate-assets, git-pack, and source-status-history warnings. Windows exceptional timeout termination can synchronously wait for the bounded 1-5 second grace.
- Closed gaps: Mobile/narrow CSS, viewport meta, touch-only scroll rules, device viewports, multi-viewport report validation, stale active mobile design instructions, and a full-suite Windows async taskkill race are closed locally. External PromptLayer screenshots and superseded mobile observations remain preserved as historical evidence, not support.

### 2026-07-10 (S-70 source-identity correction)

- Change: Fixed cross-card HTML-index evidence bleed, added identity-only guards for Fable model-launch grouping/prose, corrected the already-public 2026-07-08 Alberta case study, and rebuilt its article/trend/ops/report dependents.
- Improved: Three P0 regressions went RED then GREEN; nine focused parser/draft/history tests pass; the corrected public page passes both viewports with 0 blocking/degraded checks; full validation passes 907 tests / 905 pass / 0 fail / 2 skipped, build-clean, privacy, E2E, Harness, and diff checks.
- Regressed: Generic `Read more` HTML-index anchors without exact JSON-LD now fail closed instead of borrowing a neighboring title or summary; this may reduce yield on poorly structured sources but prevents false attribution.
- New gaps: Fresh merged-main 2026-07-07 replay and systematic semantic URL/title/body consistency remain; historical backfill publication is still blocked by dynamic-source time-travel risk.
- Closed gaps: Alberta/Fable cross-binding, evidence-only activation of Fable-specific facts, and the known incorrect 2026-07-08 public artifact are closed locally.

### 2026-07-10 (current follow-up Slice)

- Change: Converged source admission/effectiveness truth, evidence-decided 24 logical-source promotions, connected real Source Watch production/public projection, restored official-blog home and typed private daily context, retired dead public search, terminalized eight certain runs, and removed 94 safe external run worktrees.
- Improved: final full validation passed 900 tests / 898 pass / 0 fail / 2 skipped with build-clean, privacy and E2E; the then-current multi-viewport browser evidence proved official-blog entry/page, Source Watch backrefs/contrast/layout, no-search state, privacy, and overflow. That viewport policy is superseded by REC-330. Source Watch requires complete endpoints, newest event, producer-stage receipt, exact fingerprints, dated pool hash/path, and a fixed-size receipt. A5 released 15,538,376,923 bytes while preserving 48 risky/current/recent items; A6 preserved backups/hashes and exact successors. External automation state is consolidated to one supported `ai-2` definition.
- Regressed: the first merged-main real dry-run exposed S-69, where substring matching treated a legitimate card title containing “模型发布” as the retired section; RED/GREEN and exact generated-page replay close the local defect. The retained browser finding remains a non-blocking missing favicon request.
- New gaps: follow-up PR/CI/merge, fresh terminal real dry-run, backfill previews, retained storage classification, stale unmanaged DB cache reconciliation, favicon polish, and automatic retention remain.
- Closed gaps: group-level per-source fake green, Source Watch fixture-only truth, partial-endpoint false changes, stale-release event masking, unbounded historical receipts, blog nav/type-only half-landing, unreachable public-search code, duplicate/invalid automation definitions, stale test contracts, and Source Watch title contrast are closed.

### 2026-07-10

- Change: Recovered the bounded production repair/resume path, converged claim verification with candidate quality/write gates, introduced truthful terminal and timeout behavior, migrated all historical public reports to one ADC visual contract, removed proven dead weight, and created one durable recovery/source/design ledger.
- Improved: A real nested Codex call produced schema-valid UTF-8 edits; 38/38 entrypoint and focused admission/quality tests passed; current code replay of the same real 2026-07-10 discovery inputs excluded the misclassified Simon Willison item before main selection; exact arXiv publication paths survived stale intermediary labels while search/root/malformed-percent paths failed closed; all 49 reports passed the shared-asset build contract and the then-current multi-viewport samples passed. REC-330 supersedes that viewport policy. Latest full validation reported 878 tests / 876 pass / 0 fail / 2 skipped and passed build-clean, privacy, E2E, Harness, JSONL, and whitespace gates.
- Regressed: No known repository-local regression. A real clean origin/main continuation still used pre-PR code and correctly remained blocked at report_write; this is delivery-boundary evidence, not current-branch production acceptance.
- New gaps: Source-effectiveness fake positives, official-source parser effectiveness, curated-builder ingestion, official-blog home/intake, the search/no-search decision, stale external runs, three missing reports, and storage/memory retention remain tracked REC items.
- Closed gaps: Date-gated ADC rollout, direct nested model writes, PowerShell UTF-8 corruption, inherited incompatible model choice, unbounded nested Codex calls, first-failure terminal misreporting, candidate quality false green, and three empty workspace packages are closed on this branch.

### YYYY-MM-DD

- Change:
- Improved:
- Regressed:
- New gaps:
- Closed gaps:

### 2026-07-06

- Change: Added PR-D minimal two-node fixture DAG sequencing for `classify-tag-entity -> score` and repaired the current latest report builder-copy gate so repository validation can run cleanly.
- Improved: `scripts/run-daily-codex-dag.mjs --execute-two-node-fixture --date YYYY-MM-DD --json` now reads the real production `classify-tag-entity` and `score` nodes without modifying the manifest, prepares a fixture canonical-candidates input, executes classify first, passes the classified artifact into score, records two ordered node results, pins the score dependency result to classify's actual execution id/status, validates resolved artifact metadata, and converts upstream command failure or downstream malformed output into structured node results without stdout/stderr leakage. Review P2 findings were fixed by binding two-node `node_results` / `executed_commands` order in schema and rejecting score blocked after classify success in semantic validation. The 2026-07-06 builder observations now have distinct authored copy and the generated docs data/ops dashboard are rebuilt from source. Targeted DAG tests passed 57/57; full validate exited 0 with 733 tests / 731 pass / 0 fail / 2 skipped.
- Regressed: None known.
- New gaps: This is still fixture replay, not production DAG execution. Codex CLI execution, prompt delivery, business-schema artifact validation, retry/repair orchestration, production manifest node execution specs, and full 16-node runner migration remain future PRs.
- Closed gaps: PR-D closes the gap where PR-C proved only a single real node and did not exercise dependency ordering, upstream-to-downstream artifact handoff, or downstream blocking semantics.

### 2026-07-06

- Change: Added PR-C first real DAG node adapter for the `score` node.
- Improved: `scripts/run-daily-codex-dag.mjs --execute-real-node-fixture --node score --date YYYY-MM-DD --json` now reads the production `score` node contract without modifying the manifest, materializes fixture input under `.tmp/daily-codex-pipeline/{report_date}/artifacts/classified-candidates.json`, executes `scripts/replay-daily-codex-dag-node-fixture.mjs`, writes the declared scored-candidates output, records real `score` node identity, `admit` stage, `item-lanes` audit metadata, `classify-tag-entity` dependency evidence, resolved input/output artifact metadata, and schema/semantic-valid run summary. Missing-output and malformed-output cases remain structured failure node results without stdout/stderr leakage, and validation now rejects summaries that drift away from the real `score` artifact contract. Targeted DAG tests passed 52/52; full validate exited 0 with 728 tests / 726 pass / 0 fail / 2 skipped.
- Regressed: None known.
- New gaps: This is still fixture replay, not production manifest migration; Codex execution, prompt delivery, business-schema artifact validation, retry/repair orchestration, multi-node execution, and publishing remain future PRs.
- Closed gaps: PR-C closes the gap where only synthetic nodes had exercised the executable DAG node summary path.

### 2026-07-06

- Change: Added PR-B artifact I/O contract to the synthetic executable-node MVP fixture.
- Improved: `--execute-node-fixture` now materializes a required `.tmp` JSON input artifact, runs a synthetic command that writes a required `.tmp` dry-run summary output artifact, validates both artifacts into `resolved_inputs` / `resolved_outputs` metadata, and keeps stdout/stderr out of public summaries. The executable-node run-summary schema now requires one resolved input and one resolved output artifact for the synthetic node. Command-success/missing-output and malformed-output paths emit structured failure node results and blocked run summaries. Targeted DAG tests passed 47/47; full validate exited 0 with 723 tests / 721 pass / 0 fail / 2 skipped.
- Regressed: None known.
- New gaps: First real DAG node adapter, Codex execution, prompt delivery, retry/repair orchestration, and production manifest migration remain future PRs.
- Closed gaps: PR-B closes the gap where the first executable node could succeed without proving declared artifact input/output metadata.

### 2026-07-06

- Change: Added PR-A executable-node MVP summary mode for one synthetic command node.
- Improved: `scripts/run-daily-codex-dag.mjs --execute-node-fixture --date YYYY-MM-DD --json` now runs one synthetic `node_executable` command node through the existing runtime plan and command executor, emits `daily_codex_dag_executable_node_mvp`, includes one validated `daily_codex_dag_node_result`, records exactly one executed command, leaves `codex_invocations` empty, and keeps stdout/stderr out of public summaries. Injected command failure returns a structured failure node result and blocked run summary instead of throwing. Targeted DAG tests passed 45/45; full validate exited 0 with 721 tests / 719 pass / 0 fail / 2 skipped.
- Regressed: None known.
- New gaps: Artifact I/O contract validation, first real DAG node adapter, retry/repair orchestration, and production manifest migration remain future PRs.
- Closed gaps: PR-A now proves a runnable `execute -> node_result` path at the DAG summary/CLI boundary without touching the production manifest.

### 2026-07-06

- Change: Replaced the compatibility-first daily Codex pipeline implementation with a six-stage DAG-lite MVP runner.
- Improved: `daily:codex-pipeline` now runs `prepare -> collect-context -> codex-generate -> validate -> repair-once -> summarize`, writes bounded `.tmp/daily-codex-mvp/YYYY-MM-DD/` artifacts, supports deterministic success/repair/failure fixtures, rejects unsafe work directories before cleanup, fails real Codex stages that mutate repository files outside the work dir, emits structured blocked summaries for unrepaired failures, keeps stdout/stderr content and paths out of public run summaries, handles npm positional date/fixture arguments, and rejects legacy `--execute`/`--publish` flags. Targeted runner tests passed 11/11, a 2026-07-06 repair-success fixture run passed, and final full `corepack pnpm run validate` exited 0 with 717 tests / 715 pass / 0 fail / 2 skipped.
- Regressed: None known.
- New gaps: The MVP path does not yet exercise live Codex CLI in CI, assemble final public report data/HTML, publish, verify Pages, run multi-agent fanout, or migrate the full 16-node DAG.
- Closed gaps: The production-facing daily Codex entrypoint now proves a real end-to-end coarse DAG loop instead of accumulating pre-execution helper slices.

### 2026-07-06

- Change: Added live artifact metadata proof for synthetic command node execution.
- Improved: When explicit resolved artifacts are not supplied, command execution now resolves declared inputs/outputs from disk with exists, JSON validity for `.json`, byte count, and sha256 metadata. A synthetic node uses existing `scripts/run-daily-codex-dag.mjs --dry-run --summary-path` to write a real `.tmp` JSON artifact, and the validated node result gets `resolved_outputs` from the file just written. Missing required outputs produce a structured failure node result instead of a false success. Targeted DAG tests passed 41/41; full validate exited 0 with 718 tests / 716 pass / 0 fail / 2 skipped.
- Regressed: None known.
- New gaps: This is not business-schema artifact validation, does not execute Codex, does not wire production DAG execution, and does not change schemas/package/workflows.
- Closed gaps: Command success is no longer proven only by exit code or caller-supplied resolved output metadata.

### 2026-07-06

- Change: Added the first command-only executable node closed loop for a synthetic fixture.
- Improved: A synthetic `node_executable` command spec can now resolve to a runtime plan, execute a deterministic repo validator script through `execFile` with `shell: false`, and produce a schema/semantic-valid `daily_codex_dag_node_result`. Failure execution is normalized into structured failure node results with stable exit-code/signal messages, preflight failures return before execution, and stdout/stderr are not stored on node results or failure messages. Dry-run and contract-run remain no-execution, and production `config/daily-codex-dag.json` still has no `node_execution_spec`. Targeted DAG tests passed 39/39; full validate exited 0 with 716 tests / 714 pass / 0 fail / 2 skipped.
- Regressed: None known.
- New gaps: This does not execute Codex CLI, render prompts, wire production DAG execution, verify live artifacts, schedule retries, or update schemas/package/workflows.
- Closed gaps: The first low-risk command node can complete `node_execution_spec -> runtime plan -> controlled execution -> validated node result`.

### 2026-07-06

- Change: Added a pure generic DAG node runtime-plan dispatcher for future executable node specs without enabling execution.
- Improved: Future executor callers can now use one helper to route synthetic `node_executable` command and Codex specs into the existing executor-specific runtime plans. The dispatcher preserves explicit spec override semantics, rejects non-`node_executable` nodes and unsupported executors, and still does not execute commands, spawn Codex, read prompts, mutate summaries, or add production node specs. Targeted DAG tests passed 36/36; full `corepack pnpm run validate` exited 0 with 713 tests / 711 pass / 0 fail / 2 skipped.
- Regressed: None known.
- New gaps: This still does not execute DAG nodes, does not emit successful node results, does not define prompt delivery, and does not verify live artifacts.
- Closed gaps: The command/Codex runtime-plan helpers now have a single generic dispatch boundary for future executor integration.

### 2026-07-06

- Change: Added a pure Codex CLI runtime-resolution helper for future DAG node execution specs without enabling execution.
- Improved: Future Codex CLI specs can now resolve to deterministic plan data with an explicit absolute Codex executable path, repo-root-based prompt-template resolution, independently resolved repo-root cwd, `shell: false`, args-copy-only `codex_args`/`invocation_args`, direct executor/invocation pairing checks, shared Codex invocation shape validation, and no prompt content reads. Dry-run and contract-run summaries still do not expose runtime plans or execution evidence. Targeted DAG tests passed 34/34; post-#226 full `corepack pnpm run validate` exited 0 with 711 tests / 709 pass / 0 fail / 2 skipped.
- Regressed: None known.
- New gaps: This still does not execute Codex CLI, does not define prompt delivery, does not prove executable spawnability, does not verify live artifacts, does not schedule retries/concurrency, and does not add production node specs.
- Closed gaps: The previously deferred Codex executable/cwd/prompt-template runtime mapping is now deterministic before live Codex spawning is introduced.

### 2026-07-03

- Change: Added a pure controlled command runtime-resolution helper for future DAG node execution specs without enabling execution.
- Improved: Future command specs can now resolve to deterministic spawn-ready data with a controlled absolute Node runtime (`process.execPath` by default), repo-root-based script resolution, independently resolved repo-root cwd, `shell: false`, preserved argv tail, direct executor/invocation pairing checks, direct command-policy rejection, and absolute-path containment checks. Dry-run and contract-run summaries still do not expose runtime plans or execution evidence. Targeted DAG tests passed 32/32, and post-review full `corepack pnpm run validate` passed with 705 tests, 703 passed, 0 failed, and 2 skipped.
- Regressed: None known.
- New gaps: This still does not execute DAG nodes, does not verify live artifacts, does not schedule retries/concurrency, does not define Codex CLI runtime resolution, and does not add production node specs.
- Closed gaps: The previously deferred `node` runtime mapping and root-based command path resolution are now deterministic before live command spawning is introduced.

### 2026-07-03

- Change: Added semantic command invocation policy for future DAG node execution specs without enabling execution.
- Improved: Future command specs now validate that `argv[0]` is the reserved `node` runner, reject shell-ish argv tokens (`&&`, `||`, `;`, `|`, `&`, backticks, redirection, CR/LF, and `$(`), require `argv[1]` to be a safe repo-relative script under `scripts/`, require `.js`/`.mjs`, and verify the script exists as a file. Positive synthetic specs use an existing repo script and still fail only on the reserved `node_executable` gate; full `corepack pnpm run validate` passed with 703 tests, 701 passed, 0 failed, and 2 skipped.
- Regressed: None known.
- New gaps: This still does not execute DAG nodes, does not parse full command flags, does not map `node` to a controlled runtime, does not implement live artifact verification, and does not add production node specs.
- Closed gaps: The previously broad schema-valid command argv shape now has deterministic pre-execution semantics before a live executor can spawn commands.

### 2026-07-03

- Change: Added semantic runtime-policy validation for future DAG node execution specs without enabling execution.
- Improved: Future specs now validate deterministic node-scoped idempotency keys, concurrency group alignment, retry backoff shape, manifest-output artifact verification for reusable outputs, public/non-public publish and sandbox boundaries, and reserved network/secret modes. Targeted tests include valid synthetic public and non-public specs that fail exactly on the `node_executable` reserved gate; full `corepack pnpm run validate` passed after the final-closeout P1 fix with 703 tests, 701 passed, 2 skipped.
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
- New gaps: The entrypoint remains contract validation only; it does not execute real DAG nodes or publish. In the current pnpm/PowerShell environment the smoke command uses `corepack pnpm run daily:codex-dag:contract-run -- -- --date YYYY-MM-DD`; future human-facing ergonomics can improve separately.
- Closed gaps: The contract-run is no longer only a direct script flag; it has a stable pnpm-level bridge guarded by workflow validation.

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
- Closed gaps: DAG refactor now has a durable manifest gate in `corepack pnpm run validate`.

### 2026-07-03

- Change: Added public privacy scanning coverage for `docs/articles.json` and tests for article schema negative cases, deterministic index generation, and regular/daily publish plan staging.
- Improved: Public article index boundary is validation-backed, including the date-scoped daily publish path.
- Regressed: None known.
- New gaps: Full Codex CLI DAG still needs per-node schemas and replay fixtures.
- Closed gaps: `docs/articles.json` is no longer outside the default public artifact privacy scan.
