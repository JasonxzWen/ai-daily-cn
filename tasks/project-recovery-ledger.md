# Project Recovery Ledger

This is the single durable issue ledger for the ai-daily-cn recovery program. Do not create another recovery review or issue list. Update the stable IDs here as implementation and evidence advance.

## State Contract

- Normal flow: discovered -> implementing -> locally_verified -> runtime_verified -> production_verified -> closed.
- Explicit terminal decisions: replaced or retired.
- closed requires all five layers: implementation exists; production entrypoint is wired; automated tests pass; browser or real scheduled acceptance passes; docs, feature state, generated artifacts, and Handoff agree.
- A TODO, fixture, mock, file-presence check, uncommitted worktree, or recommendation is not closure evidence.

## Current Slice

### REC-001 - Production repair/resume closure

- Type: production workflow / security.
- Fact evidence: the scheduler owns one repository invocation; the prior entrypoint could return needs_ai_repair for manual continuation. The current diff adds bounded author, host validation, and same-run resume.
- Root cause: repair continuation and terminal-state ownership were split between repository code and human prompt steps.
- State: runtime_verified.
- Implementation path: scripts/run-daily-codex-pipeline.mjs and tests/daily-codex-pipeline.test.js.
- Validation commands: node --test tests/daily-codex-pipeline.test.js; corepack pnpm run validate.
- Runtime/production evidence: a real 2026-07-10 nested-Codex run produced a schema-constrained UTF-8 repair contract and passed the second quality review. The 2026-07-13 scheduled run then exposed a narrower follow-up defect: after a valid repair was applied, advisory `translation_fidelity` tasks were treated as write-authorized blockers and stopped the bounded loop after one attempt. This Slice filters the next handoff to safe public-editorial tasks that cover every error path; fresh scheduled closure remains post-merge.
- Blocker: PR #294 and REC-323 are merged, but the first merged-main non-publish proof stopped before content stages because the reused clean publish clone could not overwrite tracked residue. REC-006 owns the force-checkout/dependency-refresh repair; fresh scheduled evidence follows that merge.
- Recurrence prevention: one production entrypoint, capped attempts, exact path contracts, truthful terminal reasons, and regression tests.

### REC-002 - Source Watch truth convergence

- Type: evidence semantics / scheduler drift.
- Fact evidence: the earlier production truth correctly reported a disconnected/unconsumed state while no producer-consumer existed. REC-301 now implements a real same-run path, and the authorized live `ai-2` prompt update has replaced that historical hard assertion with dynamic validation.
- Root cause: fixture capability and requested paths were treated as production consumption evidence; scheduler text duplicated repository assumptions.
- State: locally_verified through REC-301/REC-401; historical false-green semantics are replaced and the live scheduler contract now validates, while real-run evidence remains pending.
- Implementation path: production entrypoint, workflow contract, repository docs/prompts/tests, and C:/Users/Admin/.codex/automations/ai-2/automation.toml.
- Validation commands: focused workflow-contract tests; node --test tests/daily-codex-pipeline.test.js; literal drift search; corepack pnpm run validate.
- Runtime/production evidence: historical summaries remain valid for the pre-REC-301 state. The supported automation interface updated only `ai-2` prompt semantics; field-by-field reread preserved ACTIVE/schedule/cwd/project/bootstrap/model/reasoning/worktree/`--publish`. This Slice made its sole additional prompt change explicit UTF-8 reading of the dated run summary and re-proved the same field invariants. The same supported interface removed `ai-7`; evidence-backed orphan cleanup removed the stale `ai-daily` and `ai-daily-status-self-check` definitions while preserving the `ai-daily` bootstrap/cache/evidence support root. Live file inventory now contains exactly one `D:\ai-daily-cn` automation and the workflow validator passes with zero failures/warnings.
- Blocker: the first merged-main non-publish pipeline proof stopped in `prepare_clean_worktree`; REC-006 must land and produce a fresh terminal summary before Source Watch can advance beyond `locally_verified`.
- Recurrence prevention: semantic contract tests and a thin scheduler prompt with no business state machine.

### REC-003 - All-history ADC shared asset

- Type: frontend / generated archive.
- Fact evidence: src/site.js contains ADC_PUBLIC_THEME_START_DATE 2026-07-09; earlier report regeneration can retain legacy visuals and the current overlay is duplicated into report HTML.
- Root cause: visual rollout was date-gated and optimized for a partial migration rather than one durable generation contract.
- State: runtime_verified.
- Implementation path: src/site.js, src/render.js, src/adc-theme.js, packages/design/src/adc-theme.css, docs/assets/style.css, generated reports, and tests/adc-visual-contract.test.js.
- Validation commands: focused visual/unit tests; corepack pnpm run build; browser acceptance for early/latest reports and public shells; corepack pnpm run validate.
- Runtime/production evidence: all 49 generated report pages reference the same shared ADC asset; current REC-330 acceptance covers home, ops, official blog, and representative reports at the canonical `1280x900` desktop viewport with no console, network, HTTP, or overflow failures. Earlier narrow-screen evidence remains historical only.
- Blocker: none known.
- Recurrence prevention: remove date eligibility, make the shared asset a generation invariant, and cover early/latest fixtures.

### REC-004 - Proven dead-weight removal

- Type: technical debt / workspace hygiene.
- Fact evidence: src/daily-theme.js had no runtime consumer; @astryxdesign/cli was unused; packages/contracts, packages/pipeline, and packages/sources contained only placeholder package/README files.
- Root cause: superseded experiments and future placeholders remained after the production path changed.
- State: runtime_verified.
- Implementation path: delete the dead files/packages, update package/workspace manifests and lockfile, retain only required bridges.
- Validation commands: corepack pnpm run preflight:worktree; focused repo-size and negative PromptLayer tests; typecheck; build; corepack pnpm run validate.
- Runtime/production evidence: workspace install, static generation, React build, and browser acceptance run without the deleted items.
- Blocker: preflight reports dirty_worktree by design because the recovery diff is not committed yet.
- Recurrence prevention: delete placeholders only with reference proof; no speculative packages or compatibility layers.

### REC-005 - Durable recovery state

- Type: workflow / governance.
- Fact evidence: recovery progress previously depended on chat, feature_list, and ignored Harness state without one stable issue state machine.
- Root cause: completion and blockers were reported in summaries rather than tracked by stable issue IDs and evidence layers.
- State: locally_verified.
- Implementation path: this ledger plus feature_list.json, quality-document.md, evaluator-rubric.md, and Harness state.
- Validation commands: node scripts/harness-validate.mjs; ledger link/marker tests added to the affected suite; git diff --check.
- Runtime/production evidence: later sessions update these REC IDs rather than creating another audit.
- Blocker: cross-session behavior requires repository adoption and review.
- Recurrence prevention: one tracked ledger and five-layer closure semantics.

### REC-006 - Slice delivery and observation

- Type: delivery / production acceptance.
- Fact evidence: PRs #294, #295, and #296 are merged through `origin/main@d1c7ee3`. The first post-merge non-publish run wrote `.tmp/run-summary-2026-07-13.json` and truthfully stopped at `prepare_clean_worktree`: the dedicated clone was at `20e6751`, 361 commits behind, with 10 tracked modifications from the legitimate 2026-06-24 failed dry-run. Fetch succeeded; ordinary checkout failed before the promised hard reset. The same clone carried pre-pnpm-lock `node_modules`, so directory presence was also not valid dependency freshness evidence.
- Root cause: the reusable clean-clone recovery sequence was not idempotent: ordinary checkout ran before reset, and dependency installation trusted any existing `node_modules` regardless of the current frozen lockfile.
- State: implementing.
- Implementation path: force checkout only inside the bounded dedicated clean clone; refresh frozen-lockfile dependencies whenever that clone is reused; preserve the current dirty clone manifest/archive before recovery; then rerun the real non-publish pipeline from merged main.
- Validation commands: focused RED/GREEN prepare-clean-worktree tests; full publish suite; workflow/Harness/diff checks; PR CodeQL/mergeability; post-merge real non-publish summary.
- Runtime/production evidence: current failure is bounded and non-publishing. The old clone will be quarantined with path/status/hash evidence before the repaired entrypoint creates a fresh current-main clone.
- Blocker: repair PR, evidence archive, and post-merge non-publish rerun remain. Backfill previews are still a later consolidated acceptance batch.
- Recurrence prevention: force/reset only within the validated `.tmp` clean-clone boundary, do not use `node_modules` existence as lockfile freshness, and keep a deterministic command/dependency regression.

## Later Slice 1 - External Runtime Recovery

### REC-101 - Backfill three confirmed missing reports

- Type: production data recovery.
- Fact evidence: 2026-06-27, 2026-07-07, and 2026-07-10 are confirmed missing.
- Root cause: prior blocked/degraded runs did not converge automatically.
- State: discovered; final acceptance batch pending.
- Implementation path: reconstruct inputs, run validated generation, publish, and verify Pages/summary consistency.
- Validation commands: per-date quality/build/privacy/publish checks plus browser verification.
- Runtime/production evidence: each remote report URL and terminal summary agrees.
- Blocker: preview and publish remain pending until the one consolidated final batch passes.
- Recurrence prevention: missing-date monitor and bounded recovery entrypoint.

### REC-102 - Terminalize stale runs and consolidate health evidence

- Type: automation operations.
- Fact evidence: stale `running`/interrupted summaries and an unused standalone self-check definition were observed; running a second scheduled health workflow would duplicate the production run summary and recreate split truth.
- Root cause: external state and interrupt/finalization paths did not reliably converge.
- State: runtime_verified for evidence-certain histories and scheduler consolidation; ambiguous histories remain implementing.
- Implementation path: inspect each run lineage, terminalize with evidence, remove the orphan scheduled self-check definition, and keep `status:self-check` as an explicit manual diagnostic while the dated production run summary owns scheduled health truth.
- Validation commands: run-summary schema/semantic checks and live scheduler evidence.
- Runtime/production evidence: eight evidence-certain superseded runs were backed up, hash-checked, and terminalized as `blocked` with `automation_interrupted_superseded`, exact successor evidence, and no next action. The applied manifest is `C:/Users/Admin/.codex/automations/ai-daily/cleanup-evidence/2026-07-10-a6/writeback-manifest.json`; three later-deleted run directories retain their terminalized summaries in the A5 evidence archive.
- Remaining action: ambiguous records were intentionally untouched; prove a new terminal production summary after the merged real run and retain manual self-check only for operator diagnosis.
- Blocker: no standalone self-check repair remains; ambiguous histories stay fail-closed until successor evidence exists.
- Recurrence prevention: stale-run alerts plus a single scheduled health truth source.

## Later Slice 2 - External State Cleanup

### REC-201 - Archive and bound automation memory/run-worktrees

- Type: storage / external state.
- Fact evidence: automation memory is about 157 KB with encoding corruption; run-worktrees occupy about 24.7 GiB.
- Root cause: no enforced retention days, disk budget, compaction, or GC.
- State: implementing; the A5 cleanup sub-action is runtime_verified, while retention automation and bounded-growth acceptance remain open.
- Implementation path: create archive and keep/delete inventories with size/last-use evidence, apply the user-authorized cleanup, then add retention controls.
- Validation commands: inventory reconciliation, archive readability, post-cleanup disk/worktree counts.
- Runtime/production evidence: the applied A5 manifest at `C:/Users/Admin/.codex/automations/ai-daily/cleanup-evidence/2026-07-10-a5/cleanup-manifest.json` inventoried 142 directories / 26,586,678,305 logical bytes. After evidence export, 94 registered, detached, clean, terminal worktrees outside the retention window were removed through Git, releasing 15,538,376,923 bytes (14.471 GiB). Forty-eight directories / 11,048,301,382 bytes remain: 7 orphan/unregistered, 17 missing/invalid summaries, 4 nonterminal, 7 dirty/untracked, 12 inside the retention window, and 1 protected current publish root.
- Remaining action: classify retained ambiguous items, define/enforce retention and disk-budget monitoring, and observe bounded growth for seven days. Historical public HTML remains because deleting 9.9 MB would break URLs without a separate retention design.
- Blocker: none for the completed cleanup; retained risky/ambiguous items stay fail-closed.
- Recurrence prevention: retention days, disk budget, and automatic GC alerting.

## Later Slice 3 - Remaining Design and Capability Debt

### REC-301 - Real Source Watch producer-consumer

- Type: production capability.
- Fact evidence: the baseline had four configured targets but only fixture/local DAG capability; `docs/articles.json` had 1,053 records and zero `section:source_watch` records. Partial GitHub endpoint success could also emit a false change, a stale release could hide a newer commit, and historical pool aggregation could make the run receipt grow until summary truncation.
- Root cause: no production producer, consumed artifact contract, or end-to-end evidence.
- State: locally_verified with full/browser acceptance; release still requires the merged real-run proof.
- Implementation path: `discover_source_watch` writes a dated artifact and returns a bounded stage receipt for its exact path/SHA-256; draft classifies material changes; report_write persists the normal dated candidate pool; build publishes privacy-safe source-linked records and emits one same-date fixed-size consumption receipt; the production summary proves stage receipt, exact producer/pool `target_id:snapshot_fingerprint` set equality, pool SHA-256, and build-consumed path/hash.
- Validation commands: the current affected Source Watch/article/pipeline/official-blog batch passes 116/116; final full validation passes 900 tests / 898 pass / 0 fail / 2 skipped, including privacy/build-clean/E2E; the production-pipeline subset includes receipt/lineage negatives.
- Runtime/production evidence: local fixtures prove valid zero-inclusion consumption, mismatch disconnection, partial material-endpoint suppression, newest commit selection, public backrefs/dedupe, and fixed-size same-date receipt. Current browser acceptance proves the public rail, paper-on-ink contrast, original-source links, no-search behavior, and no overflow at canonical `1280x900`. A real non-publish run is not yet claimed.
- Blocker: production clones remote `origin/main`; run the real non-publish proof after this PR merges.
- Recurrence prevention: never infer consumption from a requested path.

### REC-302 - Official-blog knowledge_refs wiring

- Type: designed but incomplete feature.
- Fact evidence: the official-blog knowledge_refs connection is missing from production; six curated records exist, the newest is dated 2025-05-16, and all six related_report_dates arrays are empty.
- Root cause: design/schema intent did not reach the final renderer/consumer.
- State: discovered.
- Implementation path: trace schema to renderer and public artifact, then implement or explicitly retire.
- Validation commands: focused schema/render tests and browser artifact evidence.
- Runtime/production evidence: a real official-blog artifact exposes the intended references.
- Blocker: REC-321 now supplies typed daily context, but public knowledge_refs rendering/backlinks remain a distinct unimplemented capability and are not claimed by this Slice.
- Recurrence prevention: design-to-production wiring checks.

### REC-303 - Decide nine planned-only DAG nodes

- Type: architecture / roadmap debt.
- Fact evidence: nine of sixteen DAG nodes remain planned-only.
- Root cause: contract-first migration progressed faster than production execution evidence.
- State: discovered.
- Implementation path: decide implement, replace, or retire per node; do not force standalone execution where it does not fit.
- Validation commands: per-node contract/runtime evidence and full DAG validation.
- Runtime/production evidence: real node outputs or explicit retirement records.
- Blocker: depends on admission, authoring, source, and publish priorities.
- Recurrence prevention: planned-only age and evidence gates.

## Later Slice 4 - Recurrence Prevention

### REC-401 - Promote recurrent failures into automated gates and monitoring

- Type: workflow / observability.
- Fact evidence: stale baseline, template-only false green, docs/entrypoint drift, fake Source Watch consumption, repair path escapes, generated artifact drift, missing reports, blocked/stale runs, Pages failures, and disk growth recurred. The 2026-07-14 non-publish candidate artifact added a concrete case: 32 live `source_level` values passed registry validation but failed the downstream candidate schema, including three already-selected Wechat2RSS items.
- Root cause: repeated review feedback was not consistently converted into CI, state-machine checks, alerts, or fixtures.
- State: implementing.
- Implementation path: centralize contracts; add CI/contract tests and monitors; keep one production entrypoint.
- Validation commands: full validate plus alert/fixture simulations.
- Runtime/production evidence: seven days without unexpected blocked, missing, stale, Pages mismatch, or budget breach.
- Current-Slice action: the workflow validator requires evidence-backed Source Watch fields, rejects permanent old scheduler assertions and extra project automations, and treats `status:self-check` as manual-only. Focused/full gates cover producer-stage path/hash receipt, producer/pool fingerprints, fixed-date proof, material endpoints, latest event, official-blog source date/context/bindings hashes and relationships, score precedence, public/private fields, E2E schema freshness, Source Watch contrast, and canonical `1280x900` desktop layout. The 2026-07-14 slice historically synchronized a closed `source_level` vocabulary and validated the full candidate pool before authoring. The current public-signal contract supersedes that classification behavior: raw metadata accepts new non-empty values, public labels use explicit fallbacks, and neither vocabulary membership nor editorial validation governs occurrence membership or chronology. A provenance-bound 2026-07-14 replay fixture remains `production_verified:false` while the exact external 336-candidate artifact passes read-only validation at its original SHA-256. Final validation passes 923/921/0/2.
- Blocker: source-level recurrence prevention and PR #305 landed through PR #306; a fresh merged-main non-publish run, broader latest-report artifact coverage, and longer-term alerts/retention monitoring remain.
- Recurrence prevention: this issue is the prevention program.

## Later Slice 3A - Source Survival and Effectiveness

### REC-311 - Converge admission, verification, quality, and Phase5

- Type: production admission / source truth.
- Fact evidence: the three-day Phase5 audit for 2026-07-09 reports `phase5_complete:false` and seven T3 fact leaks. Wechat2RSS PaperWeekly entered 2026-07-09 hot_blogs as intermediary-only; six non-primary records entered fact surfaces on 2026-07-06. A real 2026-07-10 run selected Simon Willison's intermediary-only OpenAI quotation into main_items and passed quality before report_write blocked it. The 2026-07-14 pool exposed the adjacent structural form of the same delayed-truth problem: 32 candidates used configured levels absent from candidate/report enums, while the registry schema did not validate the field.
- Root cause: source ownership, claim verification, blacklist refill, Phase5, quality review, and report_write evolved as separate predicates. A vendor keyword in a third-party URL path could infer official ownership, while quality only checked ID/status/included_in.
- State: locally_verified.
- Current-Slice action: claim-level status overrides misleading source level; quality/report_write share `collectCandidateCoverageIssues`; Phase5 joins final report backrefs and consumes the same source-admission decision; canonical paper/GitHub targets upgrade explicitly; high-risk Chinese access terms block; concrete violations, upgrades, orphan included flags, missing backrefs, and accurate notes are emitted. These admission and verification checks now govern only the optional legacy editorial report. They cannot reject, hide, rank, or delay a safely normalized occurrence in the public signal stream. Raw `source_level` metadata remains open, public labels fall back explicitly, and legacy candidate schema/reference validation stays at the draft producer boundary for that report artifact only.
- Focused/runtime evidence: the prior 12 focused admission/Phase5/effectiveness tests pass. Five new source-level RED/GREEN regressions pass; the affected unit/source/Aify/content suite passes 577/577; final validation passes 923 total / 921 pass / 0 fail / 2 skipped. The exact 2026-07-14 external pool validates 336 candidates at SHA-256 `2f25b523189c78ed424f23e055fe17ab49c22071acf312b28eda4c0e41d7fb0e`, and the optimized report has zero remaining source-level errors. The replay is historical read-only evidence, not production verification.
- Remaining action: final real non-publish pipeline must prove newly generated artifacts satisfy the shared policy; do not rewrite the immutable 2026-07-06 raw report merely to manufacture a green history.
- Acceptance: for the legacy editorial report, high-risk WeChat/SSPAI fixtures block; disclosed low-risk signals remain attributable; verified GitHub/bioRxiv targets upgrade; Phase5 reports only final-report truth; candidate producer validation precedes report authoring; quality pass implies report_write cannot later fail candidate coverage. For the public signal stream, the same records remain visible as monitoring occurrences with reader-safe labels regardless of editorial admission or verification outcome.

### REC-312 - Repair real official-source effectiveness, China first

- Type: configured-only / parser effectiveness.
- Fact evidence: all ten China AI HTML sources returned HTTP 200 on 2026-07-10 but all produced `parsed_count:0/no_signal`. Alibaba Group/Cloud CN were 0/18 historically; Qwen and Kimi 0/24; Zhipu 0/19; ByteDance Seed 0/18; Tencent 6/18; Baidu 4/18. Anthropic Engineering was 0/11; DeepMind blog 0/24 while its RSS was 9/24.
- Root cause: current telemetry cannot distinguish selector/date/link-pattern drift from a legitimate no-update day.
- State: discovered.
- Action: classify each high-value source as parser_failure, no_update, blocked, or productive; repair the highest-value China/Anthropic/DeepMind sources; retire redundant mirrors that cannot form evidence.
- Acceptance: real discover runs emit per-source parse evidence and distinguish no-update from parser failure for three consecutive runs.

### REC-313 - Turn curated Builder coverage into real ingestion

- Type: partially effective / configured-only.
- Fact evidence: six curated X handles have no feed_url. On 2026-07-09 the central follow-builders feed produced 20 candidates, but only swyx matched the curated list; Karpathy, Simon Willison, Chip Huyen, Jason Wei, and Lilian Weng had zero coverage. The documented Follow AI Builders roster has no runtime consumer.
- Root cause: the allowlist tags coincidental upstream candidates but does not subscribe to the named builders.
- State: discovered.
- Action: add these accounts to the upstream follow-builders collector or add only reliable feeds; report per-handle window coverage and original X URLs.
- Acceptance: a real builder artifact reports checked/skipped/covered state for every curated handle without claiming tag-only coverage as ingestion.

### REC-314 - Remove fake-positive source effectiveness

- Type: observability correctness.
- Fact evidence: (1) group-level candidate totals formerly made zero-signal sibling sources look parsed; (2) the real 2026-07-09 GitHub Trending row reported 70 candidates / 30 included although its candidate pool contained 50 canonical repositories and its final `github_trending` + `projects` union contained 20 canonical repositories. The 10 project items were duplicates of the first 10 trending items.
- Root cause: group success was attributed to every source, and GitHub effectiveness counted raw original + derived candidate records plus stale `included_in` flags instead of canonical repository identities joined to final report sections.
- State: merged to main through PR #301 and locally verified; a fresh persisted merged-main production proof remains open.
- Action completed: `parsed_recent` uses only per-source `parsed_count/recent_48h_entries`; GitHub candidate rows canonicalize by repository; the final `github_trending` plus matching `projects` union owns only optional legacy edited-report inclusion and its source-effectiveness metric; draft source audit reuses the same canonical counter. Public occurrence membership comes exclusively from the pre-selection occurrence store.
- Evidence: the two-source regression keeps the productive source true and the zero-signal sibling false. Three GitHub RED/GREEN paths cover derived duplicates, stale included flags, and the full weekly Top20 draft; the affected source-effectiveness suite passes 14/14; the immutable 2026-07-09 artifact replays to 50 candidates / 20 legacy-report included without rewriting history. Final validation passes 907 total / 905 pass / 0 fail / 2 skipped; PR #301 and CI are landed, while fresh production observation remains pending.
- Acceptance: in a two-source group only the productive source is parsed; each GitHub repository counts once across original/derived records; identities absent from the final report cannot count as legacy edited-report inclusions; source effectiveness and source audit agree with that final canonical section union, while docs/signals membership remains lossless and independent.

### REC-315 - Preserve terminal decisions for 24 historical source IDs

- Type: source survival / explicit terminal decisions.
- Fact evidence: 189 source IDs existed across reachable refs and snapshots; 165 remain; 24 are absent from the current registry.
- State: discovered, with the per-source terminal decisions below treated as authoritative until new evidence changes them.

| Decision | Historical source | Current disposition |
| --- | --- | --- |
| replaced | content-ai-news-buttondown | content-smol-ai-news |
| replaced | content-hn-frontpage | community-hn-frontpage-100 and community-hn-ai-newest |
| replaced | content-papers-with-code-api | Hugging Face Daily Papers API |
| replaced | content-themagnifier-ai / content-crunchbase-news-ai | corrected current Magnifier and Crunchbase IDs |
| replaced | generic wechat-wechat2rss-feed and old WeChat platform inputs | 12 curated public Wechat2RSS feeds plus date-scoped input |
| retired-broken | Adobe AI blog, FastCompany creator economy, Reddit MachineLearning, four community Reddit feeds | repeated 404/403/blocked evidence |
| historical-default-removal | Bens Bites, HelloGitHub, RuanYF Weekly | removed from an earlier edited-report default; breadth/noise is now expressed by source/content/credibility tags and is not a categorical listener ban |
| historical-retirement | Earlier default-only Zhihu/Jike/RSSHub collectors | no longer governed by a categorical source-reset ban; any future public/legal collector enters as a tagged listener source and is judged only by transport/safety validity |
| deferred-collector | platform-reddit-local-llama-feed | the old authenticated/platform-specific collector remains absent, but a public/legal feed may re-enter as a tagged listener without a trust/noise admission review |
| investigate-then-decide | content-rctv-generative-video | existed only in snapshot d63ebd8 and never landed on main |

- Acceptance: registry/docs preserve replace/retire/investigate state so later sessions do not blindly restore removed IDs.

### REC-316 - Decide 24 unexecuted logical-source promotion proposals

- Type: source ranking / planned-only configuration.
- Fact evidence: at that review phase, none of the 24 proposal IDs in source-order-tuning-review had entered the display contract and 78 collection entries were unmapped. Eleven of the 24 produced candidates on 2026-07-09, but only Google Keyword, Alibaba Cloud, and Leiphone contributed included items.
- Root cause: a review proposal was later read as implementation progress without a production promotion decision.
- State: locally_verified.
- Decision: 38 stored daily artifacts support 9 promotions (`azure-ai-blog`, `cloudflare-ai-platform`, `google-keyword-ai`, `baidu-ai`, `alibaba-cloud-ai`, `latent-space`, `nature-machine-learning`, `sspai-ai`, `leiphone-ai`), 12 deferrals, and 3 retired promotion proposals. Retired proposals keep their collection entries.
- Implementation: 49 logical sources now map through `CORE_SOURCE_CONTRACTS` and the display contract; after the public-listener expansion, 98 collection entries remain unmapped. Unmapped means internal inventory-only mapping, not exclusion from collection or publication. `docs/source-order-tuning-review.md` records every historical per-source decision and evidence; the validator rejects invalid actions or mapped defer/retire rows. Aify News is the separately user-directed 49th identity and remains in observation under REC-331 rather than being counted as production-proven by this historical promotion review.
- Evidence: source display validation passes; 8 focused governance/promotion/inventory tests pass.
- Acceptance: the internal display contract, source_effectiveness, and candidate output agree per logical source; promotion never raises source authority, changes public occurrence membership/order, or bypasses factual verification inside the optional legacy edited report.

### REC-317 - Accept configured public RSSHub/RSS-Bridge listeners

- Type: public listener capability.
- Fact evidence: the current registry supports direct RSS, relay feeds, and environment-resolved RSSHub/RSS-Bridge routes. The former source-reset preflight and its categorical placeholder ban were removed because source shape is already validated by the registry contract.
- Root cause: the earlier default-only source diet conflated collector configuration with public content admission.
- State: implementing.
- Action: keep missing base URLs and access failures as health/access metadata, not membership policy. Any explicitly configured public/legal route is eligible for collection; authenticated or private routes remain deployment choices rather than repository-wide bans.

### REC-318 - Make all eight search-provider states explicit

- Type: shadow discovery / provider configuration.
- Fact evidence: code implements GDELT, OpenAlex, arXiv, Brave, Tavily, Exa, SerpAPI, and Semantic Scholar; daily production invokes only GDELT/OpenAlex/arXiv. Semantic Scholar is declared by a query but never called. Provider outcomes vary between timeout, 429, and useful candidates across days.
- Root cause: implemented providers and production-enabled providers have no shared key-aware state inventory.
- State: discovered.
- Action: emit checked/skipped/disabled plus runtime, cost, and precision proxy for every declared provider; retain shadow mode and independent budgets instead of enabling all blindly.
- Acceptance: three consecutive audits enumerate all declared providers and their actual state.

### REC-319 - Retire fake-green official open-source mirrors

- Type: configured-only / low-yield mirror coverage.
- Fact evidence: 29 official-open-source entries include 17 GitHub Atom and 12 Hugging Face HTML sources; on 2026-07-09 only four were checked and 25 were no_signal. OpenAI, Anthropic, and DeepMind org mirrors were each 24/24 no_signal historically; tests prove only config shape, not parsing.
- Root cause: file presence and URL shape were treated as runtime coverage.
- State: discovered.
- Action: convert a small set of high-value organizations to reliable release/repo watches; retire or leave the rest collection-only; bind tests to real parse fixtures.
- Acceptance: each retained priority organization either produces a candidate or records a truthful no-update state in consecutive runs.

## Later Slice 3B - Lost Feature and Design Survival

### REC-320 - Restore official-blog knowledge discovery from the React home

- Type: confirmed UI regression.
- Fact evidence: commit 79b4c3f landed a home navigation/module; React rebuild 489fc87 retained only Today/Run/Reports/Data. The knowledge page and ops link survive, but the home discovery path is gone; the official-blog plan still requires it.
- State: runtime_verified through canonical `1280x900` desktop browser acceptance; earlier mobile evidence is historical only.
- Action completed: restored a minimal ADC-aligned home navigation/card to the existing official-blog knowledge page without re-importing the superseded homepage.
- Acceptance: the canonical `1280x900` desktop home discovers the official-blog knowledge page, and the final browser fixture proves six public records, OpenAI/Anthropic coverage, related links, no private-field leakage, and no horizontal overflow.

### REC-321 - Connect the official-blog knowledge workflow to daily production

- Type: half-landed, operator-only workflow.
- Fact evidence: about 22 stage retrospectives and roughly 20 commits produced preview, review, authoring, and context commands, but feed/decision preparation is manual. The 2026-07-13 scheduled run reached the new producer/consumer, but the real `discover:content-sources` artifact omitted its root business date, so the wrapper correctly remained `consumed:false` with `source_artifact_report_date_mismatch`. Only six static records exist, newest 2025-05-16, all with empty related_report_dates.
- State: locally_verified; real non-publish run pending.
- Action completed: daily production now creates a private `official_blog_daily_context` immediately after content discovery, and the real content-source producer emits `report_date` plus `generated_at` at the artifact root. The context command rejects a dated request when that source date is absent or different, binds existing reviewed knowledge records to same-run candidates, classifies accepted content types without changing `official-blog-admission-v1`, and passes the artifact explicitly to report_draft. Producer/consumer verify dates, input membership, source/context/bindings SHA-256, binding-to-context/source relationships, highest-score type precedence, and internal visibility before recording a sanitized receipt; stale/invalid context is explicit unconsumed degradation and never auto-writes curated knowledge.
- Scope boundary: REC-302 continues to own knowledge_refs rendering/backlinks; this Slice does not claim or synthesize those links.
- Acceptance: a real daily run records the same-day reviewed compact context and typed candidate bindings it consumed without public leakage or manual file surgery.

### REC-322 - Restore reader filtering without restoring the legacy search renderer

- Type: product decision conflict.
- Fact evidence: README still promises a searchable archive; commit 3172371 implemented search, domain/channel/source/min-score filters and full history. The modernization roadmap later declared search/comparison/favorites non-goals. Current React shows today/yesterday/history and truncates history with `slice(0, 60)`; the legacy search renderer remains unreachable because Vite overwrites the page.
- Historical action: D1 selected deliberate no-search and removed an unreachable Vite-overwritten static renderer. That deletion remains correct; the dead renderer must not return.
- State: implementing under the 2026-07-14 scheme-C decision.
- Current action: PR3 adds same-page reader filtering/search over source groups, content tags, credibility tags, and complete lazy-loaded history. `discover:search-news` remains a separate internal collection capability.
- Acceptance: one reachable React surface filters the complete occurrence dataset without changing its default membership or chronology; no parallel legacy renderer, truncated history, mobile variant, or hidden search implementation remains.

### REC-323 - Finish admission/scoring as one production Slice

- Type: half-landed selection design.
- Fact evidence: the retired post-quality rank artifact scored the real 2026-07-09 Top 100 identically, admitted zero items, and overlapped zero of eight published main stories; the same historical pool also contained 39 candidates with simultaneous selection/rejection metadata and undercounted those rejections. Draft generation was already the actual selector, while report_write silently ignored missing rank rows.
- State: locally_verified; fresh merged-main non-publish production acceptance remains.
- Action completed: made draft scoring the single production fact for the optional legacy edited report, persisted private score/rank plus one terminal disposition, centralized rejection vocabulary and 5/8/12 story bounds, and bound its quality, report_write, Phase5, source effectiveness, and privacy checks to the same receipts. The public occurrence stream branches before this subsystem and ignores all of these fields for membership and chronology.
- Real-date evidence: a cleaned replay of the 2026-07-09 source candidates produced 370 final candidates and 342 evaluated source receipts: 12 selected sources (including supporting evidence), 330 exact rejections, zero dual or missing dispositions, 40 globally ranked eligible candidates, and eight public story projections. The shared collector returned zero issues, quality was `ok`, report_write/build and Phase5 completed, and public output exposed no private audit fields. Directly replaying the old final pool was intentionally blocked because it attempted to reselect historical derived items.
- Acceptance: legacy selection/rejection reasons, target bounds, quality, Phase5, report_write, and source effectiveness agree on real dates; independently, the public signal page union equals all safely normalized occurrences. PR2 must prove a blocked legacy report cannot block scheduled signal publication.

### REC-324 - Make first-pass authoring real; keep repair exceptional

- Type: designed but not achieved.
- Fact evidence: real 2026-07-10 runs emitted 11-12 translation/editorial tasks; the preserved 2026-07-13 non-publish review contained four error-covered public-editorial tasks plus ten advisory `translation_fidelity` tasks, while different Builder posts still shared generic translations. Repair therefore remained the normal writing phase.
- State: PR #304 landed through PR #306 and is locally_verified; consecutive merged-main production observation remains.
- Action completed: the single production entrypoint now injects one schema-constrained first-pass author after `report_draft` and before the first formal `quality_review`. A shared plan proactively declares story title/narrative, hot-blog summary, GitHub description, and Builder translation paths; the host requires exact full coverage, applies through the existing public-text allowlist, and feeds only the fully authored report to review. Invalid, unavailable, or partial contracts fall back to the untouched deterministic draft. First-pass facts are reported separately from bounded exceptional repair, and advisory translation-fidelity tasks cannot gain repair write authority. Exceptional repair now carries the current matching `issue.details`, fingerprints path/problem signals, freezes cleared paths, continues only on a strict signal-set reduction, and on the first stalled attempt restores the last accepted report while suppressing `content_contract` re-entry.
- Local evidence: focused story/pipeline tests pass 53/53; the repair-convergence RED/GREEN cases prove current-feedback replacement, strict reduction, cleared-path rejection, stalled rollback, structural fail-closed, resolved re-baselining, legacy migration, artifact fingerprints, and single-call terminal completion. Final validation passes 918 total / 916 pass / 0 fail / 2 skipped with build-clean, 194-file privacy, E2E, Harness, workflow/resilience, JSON, and diff gates. Independent PR2 re-review is Ready with P0/P1=0. Browser acceptance is skipped because no Web composition changed. PR #304 and CI are landed through PR #306; only consecutive merged-main production observation remains as the production-verification gate.
- Acceptance: after merge, three consecutive real non-publish or scheduled runs must show at least 2/3 first reviews passing directly; an exception day may expose at most two error-covered public-editorial tasks and one repair loop. Median error-covered repair tasks must be zero, daily maximum two, `translation_fidelity` must remain advisory on 3/3 days, and `plain_language_stock_phrase` blockers must be zero before `production_verified`.

### REC-325 - Preserve the long-term topic repository and capability map

- Type: valuable idea, deliberately deferred.
- Fact evidence: the content-refactor ROI plan records the concept, but there is no data model, page, or production writer. Existing trends and official-blog knowledge are reusable foundations.
- State: discovered, P2.
- Action: write a minimal product spec later and reuse existing trend/knowledge data before creating another subsystem.

### REC-326 - Keep financing as evidence-driven, not an empty fixed track

- Type: intentionally deferred feature.
- Fact evidence: the original Feishu-style design included financing, but Stage D omitted a dedicated track because reliable funding density was insufficient; discovery can still collect funding candidates into the industry track.
- State: replaced by industry-track inclusion pending evidence.
- Action: measure qualified funding density on real dates; add a dedicated non-empty track only if density is sustained.

### REC-327 - Add a feature-survival matrix to every replacement PR

- Type: workflow recurrence gap.
- Fact evidence: the official-blog home entry and search/filter behavior were lost or contradicted during large homepage replacements. Earlier design tooling had templates but no accepted candidate/decision records.
- State: implementing.
- Current-Slice action: accepted ADC design evidence and a recovery ledger now exist.
- Remaining action: every replacement PR must list existing behavior as keep/move/retire and attach browser assertions for retained/moved entry points.
- Acceptance: CI/review rejects replacement changes without the matrix and matching acceptance evidence.

### REC-328 - Make the public product a lossless source-first signal listener

- Type: current product-direction replacement.
- Historical phase: this stable REC originally recorded the 2026-06-30 rollback from machine-log source dashboards to a story-first public page. That rollback remains valid evidence against exposing raw audit panels, but its story-first conclusion was explicitly superseded by the user's 2026-07-14 reader-safe source-listener decision.
- Fact evidence: the 2026-06-30 source-first attempt failed because it exposed machine audit inventory, not because readers should see only selected stories. The user clarified on 2026-07-14 that richness and monitoring coverage are the product: official, GitHub, community, X, news/newsletter, paper/model, and unknown signals should remain discoverable with content and credibility labels instead of qualification gates.
- Root cause: the repository conflated three different layers—raw observations, internal source operations, and an edited story summary—then let story quotas, authority, verification, dedupe, quality gates, and source-runtime diagnostics decide the public member set.
- State: implementing through PR1/PR2/PR3.
- Current action: PR1 assigns observed `observation_id` before selection, preserves publisher/time/group/content metadata through discovery merge, persists merged observations with transparent repeated-row counts, uses open metadata plus visible fallbacks, publishes paginated reader-safe signal data, and retains historical structured records with explicit origin. PR2 expands public/legal inputs and makes signal publication independent from legacy editorial blocking. PR3 migrates every public page to scheme C and deletes obsolete rendered pages and compatibility paths while preserving useful structured information.
- Acceptance: no content-admission gate; labels and filters never change membership/default chronology; same-URL observations from distinct collectors or observation IDs remain distinct; repeated input rows for one observation are counted instead of acquiring order-dependent IDs; unknown values fall back; raw audit/private/editorial fields stay internal; the public page groups by source attributes and supports complete history beyond its 48-hour preview.
- Guardrail: do not restore a machine audit dashboard, but do not use that ban to hide reader-safe source, content, credibility, health, access, or attribution metadata. Do not reintroduce story-first, qualified/capped, authority-ranked, or report-quality-dependent public membership.

### REC-329 - Preserve explicit retirement of superseded frontend directions

- Type: technical-debt terminal state.
- Fact evidence: PromptLayer, dark/glass, old shadcn/no-daily-HTML directions, empty workspace packages, unused Astryx CLI, and dead daily-theme were replaced or unused. Astryx runtime components remain genuinely used.
- State: locally_verified.
- Current-Slice action: dead theme, unused CLI dependency, and three empty packages were removed; ADC shared visual contract replaced duplicate dated rollout behavior.
- Guardrail: do not restore the deleted legacy search renderer. Implement the user-approved scheme-C filtering/search once in the current React occurrence surface, with complete lazy-loaded history and no compatibility UI stack.

### REC-330 - Retire mobile and narrow-screen support

- Type: product-scope terminal state and technical-debt removal.
- Fact evidence: the user explicitly classified mobile support as over-design and requested removal of its workflows, logic, code, tests, and generated artifacts.
- State: merged to main through PR #293 and runtime_verified at `1280x900`; final full validation and two independent reviews passed with P0=0/P1=0, and no merge action remains pending.
- Implemented action: the product now has one supported `1280x900` desktop viewport. Project-owned width breakpoints, viewport meta tags, mobile/touch layout branches, multi-viewport page checks, E2E scenarios, report-Skill templates/validators, and two unreferenced generated reports were removed; all 49 public reports were regenerated.
- Evidence boundary: historical/news prose, raw source snapshots, and generic React/Astryx compatibility remain factual/dependency evidence only and are not mobile support, design, or acceptance claims.
- Guardrail: `docs/desktop-only-support-policy.md`, AGENTS/DoD/feature/Skill rules, and the `desktop-only` visual-contract test prevent reintroduction. Reversal requires a new explicit product-scope decision.

### REC-331 - Make Aify News first-class in governance and observable in production

- Type: logical-source promotion / evidence closure.
- Fact evidence: `site-aify-news` was already watched as a shell signal, but the public article feed initially had no collection entry, stable logical identity, preserved original-publisher lineage, or consecutive-day production proof. After the first fix, the production `sources_phase5_audit` still omitted `--logical-source aify-news`, and the logical audit's aggregate `some` semantics allowed a site-only three-day shell to report verified.
- State: locally_verified; deterministic contracts, production-runner structured evidence, two-entry Phase5 fail-closed binding, and real endpoint replay are verified, while real consecutive production observation remains open.
- Implementation path: retain the Aify `/articles.json` content entry and shared logical identity, preserve original publisher plus `ai_news_aggregator`/`intermediary_only` authority, require `content-aify-news` and `site-aify-news` separately every day, and persist the structured logical-source audit in the terminal run summary.
- Validation boundary: fixtures and date-scoped endpoint replays prove parser and contract behavior only. `production_verified` requires at least three consecutive persisted production days whose safe Aify observations are present in the occurrence store and whose IDs form an exact, duplicate-free subset of the `docs/signals` page union, with publisher and collector lineage preserved. Endpoint reachability or legacy editorial inclusion alone never counts as production proof.
- Acceptance: Aify is first-class for observability and source governance without becoming primary factual authority; the occurrence store and `docs/signals` page union agree for the same dates. Source effectiveness, legacy candidate dispositions, persisted edited reports, and the legacy public article index remain diagnostic evidence only and never gate public signal membership.
- Recurrence prevention: the feature inventory and public-signal artifact validator fail closed on missing occurrence stores, missing or duplicate public signal IDs, page-union drift, or conflicting publisher/collector lineage. The production stage and Phase5 audit may continue to report legacy source-health and disposition diagnostics, but those labels and diagnostics never suppress a safe occurrence from the public stream.
- Local evidence: focused Aify 8/8, affected Aify/Source Watch 21/21, runner Phase5 2/2, final aggregate 910 total / 908 pass / 0 fail / 2 skipped, build-clean, 194-file privacy and desktop E2E pass. The bounded review found one hybrid-identity P1; its exact RED/GREEN fix was re-reviewed Ready with P0/P1=0.

### REC-332 - Make GitHub Trending enrichment facts truthful

- Type: GitHub discovery / public metadata / observability correctness.
- Fact evidence: the 2026-07-09 Top20 had weekly stars and trend on 20/20 items, but the public Top10 came entirely from `weekly:all`, so 0/10 exposed a real repository language. At least one repository compared a current source rank against a previous public rank from another scope. Nineteen successful README entries all reported `hit:true` with `sha:unknown` even though no cache was read.
- Root cause: one `language` field represented both ranking scope and repository language; history keyed only by repo and preferred public `rank`; README summary application defaulted to a cache hit while discovery supplied no content identity or historical lookup.
- State: merged to main through PR #300 and locally verified; fresh merged-main production observation remains pending.
- Current-Slice action: preserve raw scope `language/window` plus schema-backed `repository_language`; project repository language into the public report while keeping `source_scope`; key rank history by repo + scope and compare `source_rank`; compute README content SHA-256, default to cache miss, and reuse a prior summary only for an exact historical key.
- Local evidence: RED covered missing HTML/API language, public `all` leakage, candidate persistence, cross-scope rank drift, legacy public-rank fallback, and false cache hit/unknown SHA. GREEN passes the focused regressions and the full affected `tests/unit.test.js` dot run. The bounded reviewer found the one public-rank fallback P1; its dedicated RED/GREEN is fixed. Final validation passes 905 total / 903 pass / 0 fail / 2 skipped with build-clean, 194-file privacy, desktop E2E, Harness, source/design/workflow/DAG, and diff gates.
- Acceptance: three consecutive merged-main runs show Top10 language on every API/HTML-supported repository, same-scope trend math only, non-unknown README SHA for every successful README, truthful miss/hit semantics, failed README items retaining rank/star/trend/error without invented descriptions, and GitHub first-pass prose passing the existing quality gates.
- Recurrence prevention: feature inventory and deterministic fixtures bind scope, source rank, repository language, cache key/hit/SHA, candidate schema, report, render, and interaction behavior.

## Confirmed Surviving Value

- Product/content: source-grouped public occurrences, concise safe summaries, direct links, publisher/collector attribution, content tags, credibility tags, and complete chronological history are the active target. The prior four-track story layout remains only until PR3 removes the legacy surface.
- Visual: scheme C is the accepted target—light-gray canvas, white large rounded panels, restrained shadows, indigo accent, and a 1→2→3 density rhythm at the sole supported `1280x900` viewport. The prior black/white paper-and-ink system is migration input, not surviving public authority.
- Source capability: GitHub Trending, Hugging Face Trending, central follow-builders X, HNRSS, 12 curated Wechat2RSS feeds, seven general-news sources, Smol AI News, Hugging Face Daily Papers, and corrected Magnifier/Crunchbase entries remain effective or correctly replaced.
- Governance: raw source diagnostics remain internal, while reader-safe source-first cards are public. Useful official-blog/source JSON and typed production context survive; obsolete rendered official-blog/daily/archive/ops pages do not. Public knowledge_refs/backlinks remain explicitly open under REC-302.
- Deferred ideas: long-term topic/capability maps and evidence-driven financing remain recorded instead of being silently forgotten.

## This-Session Issue and Action Register

This table is part of the same ledger, not a second review. `fixed` means implemented on this branch; it does not mean post-merge production_verified.

| ID | Evidence-backed issue found this session | Action taken | State |
| --- | --- | --- | --- |
| S-01 | Harness task/progress/handoff and evaluator claims lagged behind the real diff | rewrote active task, progress, decisions, handoff and JSONL evidence against final validation/PR/monitor state | fixed |
| S-02 | ADC rollout was date-gated at 2026-07-09, leaving older reports visually divergent | removed the date gate, generated one versioned shared asset, rebuilt all 49 reports | fixed; runtime_verified locally |
| S-03 | visual contract was duplicated between React/static/report paths | made packages/design CSS the source, added adc-theme bridge/hash, linked static and generated surfaces | fixed |
| S-04 | dead theme, unused Astryx CLI, and three empty packages inflated the repo | removed only reference-proven dead weight; retained active Astryx components | fixed |
| S-05 | live ai-2 prompt duplicated workflow logic and implied fake Source Watch consumption | an earlier fix made the then-current disconnected state truthful; the newer REC-301 producer/consumer contract required and received the dynamic prompt update recorded in S-49 | superseded by S-49 |
| S-06 | needs_ai_repair required manual continuation and split terminal ownership | added bounded in-process contract authoring, host validation, exact-path copy, and same-run resume | fixed; real nested author exercised |
| S-07 | inherited/user-config model selection could choose a CLI-incompatible model | removed environment fallback and use `--ignore-user-config`; explicit model only when requested | fixed |
| S-08 | Windows write sandbox behavior was unreliable and apply_patch was unavailable to nested repair | changed production repair author to read-only structured output; host owns all writes | fixed |
| S-09 | PowerShell here-string JSON writes corrupted Chinese | eliminated shell-authored repair JSON; Codex CLI writes schema-constrained UTF-8 final output | fixed and real-probed |
| S-10 | repair contracts could be invalid, out of scope, or unbounded | added JSON Schema, exact task/path/date checks, five-attempt cap, and negative tests | fixed |
| S-11 | builder translation could remain mostly English while barely passing | required at least 10 Han characters and 0.45 Han ratio in repair author contract | fixed |
| S-12 | `official + intermediary_only` candidates bypassed story admission | claim verification now wins over source-level inference for single-source story admission | fixed |
| S-13 | a vendor keyword in a third-party URL path inferred official ownership | ownership inference now uses source identity and URL hostname, not arbitrary path | fixed |
| S-14 | quality candidate_backrefs passed while report_write rejected the same artifact | extracted shared candidate coverage collection and consumed it in quality and report_write | fixed |
| S-15 | summary selected the first historical failure and could report stale error text after repair | derive stage/error from latest unresolved failure; clear failure metadata on successful fallback | fixed |
| S-16 | nested Codex had no single-call timeout and one live call exceeded 12 minutes | added configurable timeout, 20-minute default, Windows process-tree kill, and no-orphan test | fixed |
| S-17 | real acceptance used clean origin/main, so unmerged branch fixes could not appear there | replayed the same real discovery artifacts through current code; reserved scheduled proof for post-merge observation | boundary recorded |
| S-18 | HTTP/check/config presence was repeatedly treated as source effectiveness | completed 165-source and all-history inventory; opened REC-312/314/316/319 with concrete evidence | discovered; later Slice |
| S-19 | three reports are missing; stale running summaries, absent self-check evidence, 24.7 GiB run-worktrees, and corrupt memory remain | recorded REC-101/102/201; later authorization and execution are captured by S-47/S-48, while backfill/self-check/ambiguous memory remain | partially fixed |
| S-20 | 24 historical source IDs had no durable replacement/retirement record | recorded the source survival matrix under REC-315 | fixed at decision layer |
| S-21 | official-blog home discovery and production intake were lost/half-landed | recorded REC-320/321 with exact surviving assets; implementation is captured by S-44/S-45 | fixed locally; browser accepted, real production run pending |
| S-22 | README search promise, old searchable renderer, and React no-search roadmap conflict | recorded REC-322, obtained D1, and applied the retirement under S-46 | retired by product decision |
| S-23 | large replacements lacked keep/move/retire migration evidence | created accepted ADC design evidence and REC-327 feature-survival gate | partially fixed |
| S-24 | quality/rubric/feature evidence still contained old rollout and no-external-change claims | synchronized 49-report rollout, live prompt mutation, validation counts, review and delivery boundary | fixed |
| S-25 | final full validation exposed an obsolete no-stylesheet assertion and a real admission regression: a paper lead already resolved to an arXiv primary URL was still rejected because its upstream verification label remained `intermediary_only` | updated the visual contract test to require the shared ADC asset and made direct primary publication URLs override stale intermediary labels for declared paper sources | fixed; focused and full validation passed |
| S-26 | E2E still required historical reports to have zero stylesheet links after the accepted shared-asset migration | replaced the obsolete assertion with an exact one-link, versioned `data-adc-public-theme` contract | fixed; E2E passed |
| S-27 | final whitespace validation found that the shared-style generator emitted a second trailing newline | removed the extra newline from the source template and regenerated artifact so `git diff --check` remains a repeatable gate | fixed; Harness and diff checks passed |
| S-28 | fresh-context review found the direct-paper exception trusted a publication hostname without proving a publication path, so arXiv search/root or OpenReview group pages could override `intermediary_only` | replaced hostname-only trust with per-host publication identifier/path contracts and added a negative arXiv search-page regression beside the positive paper test | fixed; focused regression passed |
| S-29 | Windows timeout could still wait forever if `taskkill` hung, while an overly fast direct-child fallback could orphan the real Codex grandchild | added a bounded one-second Windows termination grace, non-zero/error fallback, force settlement for a non-resolving terminator, and kept the real process-tree sentinel test | fixed; 38/38 entrypoint tests passed |
| S-30 | top-level terminal fields used the latest duplicate stage, but validation/publication/Pages sub-summaries still selected the first occurrence | changed the shared stage lookup to reverse order and added a duplicate report_write/publish/pages summary regression | fixed; 38/38 entrypoint tests passed |
| S-31 | candidate quality normalized malformed `candidates` to an empty list, then the shared coverage collector called `.map()` on the original non-array value | made the shared collector array-safe and added a structured `candidate_pool_empty` regression | fixed; focused and full validation passed |
| S-32 | final review confirmed progress/handoff/rubric still carried pre-Handoff claims about no external mutation, stale live prompt, 31 tests, partial ADC rollout, and no PR authority | rewrote Harness state and tracked evidence after 878-test validation, three commits, PR #289, HTML report and monitor creation | fixed |
| S-33 | re-review found that malformed percent encoding in a nominal publication path could make `decodeURIComponent` throw and abort the entire draft | moved URL construction and pathname decoding into the same fail-closed guard and added a `%ZZ` arXiv negative fixture | fixed; focused and full validation passed |
| S-34 | the default `GH_TOKEN` and same-user keyring PAT could push but lacked GraphQL `createPullRequest` permission | preserved the pushed branch, switched to an already authenticated repo-scoped account, and created Draft PR #289 without merging | fixed |
| S-35 | the automation creation API rejected `worktree` execution for a new cron monitor, and its first role label could be confused with a second publisher | followed the tool contract, created project-scoped local `ai-7`, then the old `d879` closeout explicitly converged it to `readonly insight` so exactly-one-publisher validation passed with the 878-test baseline; it produced 0 runs and was later retired by S-61 | superseded by S-61; historical role transition preserved |
| S-36 | the Advanced Security CodeQL PR gate flagged two high-severity regular-expression-injection alerts where the validated report date was interpolated into a contract-name regex | removed both dynamic regexes and replaced them with exact name, fixed prefix/suffix, and digit-only attempt parsing | fixed; 38/38 focused tests and all four CodeQL checks passed |
| S-37 | Phase5, admission, quality, and report_write used divergent predicates, while group success created per-source fake greens | centralized source-admission/coverage truth, repaired final-report lineage, and removed group-derived parsed signals | fixed at checkpoint `83ca25d`; final real run pending |
| S-38 | 24 logical-source proposals were repeatedly discussed as if implemented despite no display-contract promotion | evaluated stored multi-day evidence per source: 9 promoted, 12 deferred, 3 promotion proposals retired | fixed at decision/config layer in `83ca25d` |
| S-39 | Source Watch existed as fixture/config but had no real daily producer-consumer or public records | wired discovery -> draft -> dated candidate pool -> build/article index -> evidence-derived production summary | fixed locally; scheduler compatibility resolved, final real run pending |
| S-40 | a GitHub watch could emit a material change when releases/tags/commits were only partially fetched | require all material endpoints before emitting a candidate/fingerprint; README remains non-material | fixed; regression added |
| S-41 | the first/old release could hide a newer repository commit | compare release publish time and commit author time, then project the newest event consistently to candidate and public record | fixed; two-day regression added |
| S-42 | matching only pool path/hash did not prove that producer snapshots survived into the persisted candidate pool | compare exact `target_id:snapshot_fingerprint` sets and disconnect on mismatch | fixed; production-pipeline negative test added |
| S-43 | Source Watch build receipts aggregated all historical candidate pools, inflating counts and risking the production summary size cap | restrict the receipt to the requested report date (or latest for manual builds) while keeping the public article index all-history | fixed; fixed-size two-day regression added |
| S-44 | the first official-blog change only restored UI/type mapping and would have repeated the half-landed production gap | added an explicit private daily context stage, source/context SHA checks, typed candidate bindings, degraded semantics, and internal receipt | fixed locally; real run pending |
| S-45 | the official-blog knowledge page survived but its React-home discovery entry had been dropped by a replacement build | restored the minimal home entry and added focused frontend/type checks | fixed; desktop/mobile browser accepted |
| S-46 | README promised public search while the only search renderer was unreachable and the current product decision was no-search | applied D1: removed 699 lines of dead renderer/UI/CSS and its synthetic E2E, updated the promise, preserved `discover:search-news` | retired by product decision |
| S-47 | interrupted/superseded historical runs remained nonterminal and polluted operational truth | backed up and hash-verified eight evidence-certain summaries, wrote exact terminal/successor state, and left ambiguous items untouched | fixed for certain items; self-check/ambiguity remain REC-102 |
| S-48 | 24.7 GiB-class external run-worktree debt had no manifest-first cleanup evidence | inventoried 142 dirs, exported evidence, removed 94 safe Git worktrees, released 14.471 GiB, and preserved 48 risky/current/recent items with reasons | cleanup runtime_verified; retention automation remains REC-201 |
| S-49 | the live `ai-2` prompt hard-asserted a permanent old Source Watch state, contradicting the real producer/consumer contract | after explicit authorization, used the supported automation interface for a prompt-only dynamic validator; reread proved all non-prompt fields unchanged and workflow validation passed | fixed externally; real run pending |
| S-50 | a public-field leakage regression searched for the word `notes` anywhere and falsely flagged a legitimate commit title | changed the assertion to the exact JSON key token `"notes":` | fixed; focused privacy regression passes |
| S-51 | Source Watch docs named the receipt field inconsistently and under-specified producer/pool lineage | standardized the correct `source_watch.consumption.candidate_pool_hashes` path and documented same-date hash/fingerprint proof | fixed |
| S-52 | the selected workflow-router skill referenced a missing `scripts/workflow-check.mjs` in this repository | used the recorded deterministic fallback classification and kept this as a workflow-maintenance recommendation instead of widening the product Slice | mitigated; follow-up under insight/REC-401 |
| S-53 | official-blog context could claim same-day consumption when `--date` changed only the wrapper and the source artifact itself belonged to another day | producer now rejects wrapper/source date mismatch and draft independently rechecks the parsed source `report_date` | fixed; positive and negative regressions pass |
| S-54 | Source Watch could reuse a stale final-path artifact because production checked stage success plus disk content but no producer-stage path/hash receipt | `discover:github-watch` now writes the full artifact and returns a bounded path/SHA-256 receipt; production requires that exact receipt before lineage checks | fixed; receipt mismatch regression passes |
| S-55 | multiple official-blog matches for one candidate were consumed in array order, letting a later low-score topical match overwrite an exact high-score content type | bindings now carry score and the consumer deterministically keeps the highest-score valid type | fixed; score-precedence regression passes |
| S-56 | official-blog context hash covered records but not the bindings actually consumed, so a recomputed malicious binding could claim an unrelated type/candidate | added bindings SHA-256 plus record/type/score/source-entry structural validation and fail-closed degraded reason | fixed; forged-binding regression passes |
| S-57 | Source Watch header kept a 240px + 320px two-column grid at 390px because the mobile rule changed flex direction on a grid element | mobile CSS now uses one minmax(0,1fr) column; visual contract and a 390px E2E no-overflow assertion were added | fixed; desktop/mobile browser accepted |
| S-58 | the first post-update workflow validation exposed 19 missing explicit markers in four already-edited repository guidance files | restored the exact Source Watch fields and candidate-pool path template in docs/prompts only; no JS/config/runtime behavior changed | fixed; validator passes 0 failures / 0 warnings |
| S-59 | the supported automation updater refused an immediate worktree update until local environment configuration intent was explicit | retried with `localEnvironmentConfigPath:null`, matching the existing absence of extra local environment config; bootstrap and execution environment remained unchanged | fixed through supported interface |
| S-60 | automation inventory classified the only publisher as a self-check merely because its prompt said “do not run status:self-check” | made publish detection authoritative and limited self-check classification to standalone self-check commands; added the negative regression | fixed; focused automation/workflow tests pass |
| S-61 | four disk definitions represented one valid publisher, one expired observer, and two unsupported/orphan tasks, while a stale SQLite cache row could be mistaken for a live scheduler | archived definitions/hashes/memory, deleted `ai-7` through the supported tool, removed only the two proven orphan TOMLs, preserved the support root, and enforced exactly one allowed project automation (`ai-2`) in the repository contract | fixed externally and contract-guarded; stale unmanaged DB cache row retained without hand-editing SQLite |
| S-62 | full validation still encoded an obsolete Aify “first-class confirmed” claim after Source Watch deliberately standardized it as intermediary-only | aligned the DAG fixture with the current verification contract and reran the affected 79-test DAG suite | fixed; DAG suite and full validation pass |
| S-63 | logical-source promotion moved nine entries from `collection_only` to `unreported`, but dashboard tests kept hard-coded counts and still expected Azure to be unmapped | derived expected counts from inventory/runtime IDs, asserted Azure as `unreported`, and kept TikTok as the `collection_only` boundary | fixed; focused 2/2 and full suite pass |
| S-64 | E2E constructed an old Source Watch site snapshot that no longer satisfied the strict category/metadata schema | updated the fixture to `community_lead`, `ai_news_aggregator`, and the complete canonical URL/fingerprint/feed/repository snapshot shape; did not weaken production validation | fixed; E2E and full validation pass |
| S-65 | real browser inspection found the Source Watch heading inherited black text on its black ink panel, making the public section title nearly invisible | added an explicit paper-color heading rule plus visual-contract regression; verified computed `rgb(255, 253, 247)` on desktop and 390px with no overflow | fixed; browser screenshots and 5/5 visual contracts pass |
| S-66 | the first browser probe hit an already-running Vite server from old worktree `d879` on port 4173, producing stale-page evidence | preserved the user process, switched to verified isolated ports whose owning PID/path matched the current build, and repeated all browser assertions | fixed at verification workflow level; stale worktree evidence was discarded |
| S-67 | local HTTP acceptance surfaces requested a missing `/favicon.ico`, producing one non-blocking 404 in a fresh homepage session | converted the user-provided character image into one six-size ICO, copied it byte-for-byte through the Web build, linked it from home/Ops/official-blog/all generated report surfaces, and added build/publish/browser contracts | fixed locally; favicon HTTP/link/ICO tests and 1280x900 browser acceptance pass |
| S-68 | PR #290 CodeQL treated an untyped `.includes(repositoryUrl)` assertion as incomplete URL-substring sanitization and raised one High alert despite all three language analyses completing | made the test prove `verification_sources` is an array and then require exact URL equality, eliminating any arbitrary-host prefix/suffix interpretation without weakening production behavior | fixed locally; focused regression passes and merge remains gated on clean CodeQL re-analysis |
| S-69 | the first merged-main non-publish run proved Source Watch end to end but `quality_page_check` blocked a legitimate news-card title containing “模型发布” because retired section labels were matched as substrings across every section heading | narrowed retired-section text detection to exact normalized labels while retaining structural selectors; added browser-backed allow/reject regressions and replayed the exact generated desktop/mobile page | fixed locally; RED/GREEN 2/2 and real generated-page gate pass, with follow-up PR and fresh merged-main run required |
| S-70 | the 7/7 backfill preview exposed that Anthropic's Alberta case-study anchor inherited the next Fable card through the HTML-index forward window; identity-blind Fable rules then injected model-launch facts, and the same mismatch was already public in the 7/8 report while quality/backref gates stayed green | bounded HTML-index facts to the exact anchor or same-URL JSON-LD, restricted Fable topic/prose to identity fields and the original Anthropic launch, added RED/GREEN parser/draft/history regressions, corrected the 7/8 candidates/report, and rebuilt dependent public artifacts | fix is on merged main and focused 7/7 tests pass; fresh merged-main replay remains pending |
| S-71 | mobile, tablet, narrow-screen, and touch-only support survived across runtime CSS, report generators, page checks, E2E, local Skills, design guidance, and generated public artifacts even though it was not product value | established REC-330, removed project-owned branches and artifacts, promoted the desktop rail to the unconditional baseline, added a deterministic guard, rebuilt 49 reports, and accepted home/ops/blog/report at `1280x900` with zero console/network/overflow failures | fixed, runtime_verified, and merged through PR #293 |
| S-72 | the final full-suite load exposed a Windows race where asynchronous `taskkill` could outlive the one-second grace and let a delayed descendant write after the parent timed out | changed the exceptional Windows process-tree termination to bounded synchronous `taskkill /T /F` and started the hard timer before termination so both share one grace budget | fixed locally; real timeout probes 5/5, pipeline 40/40, and final full validation pass; synchronous 1-5 second exceptional-path wait remains accepted P2 |
| S-73 | the 2026-07-13 and 2026-07-14 scheduled runs applied valid repairs, but mixed advisory `translation_fidelity` tasks first stopped retries and then vetoed the terminal safe-degradation classifier | derive retry and exhausted-budget degradation truth only from public-editorial tasks that cover every error-severity path; retain advisory tasks as review evidence without granting write or veto authority | terminal classifier fixed locally; focused runner regressions pass, fresh scheduled proof pending |
| S-74 | the real content-source producer omitted `report_date`/`generated_at`, so the official-blog wrapper could not prove same-day lineage and report draft recorded it unconsumed | emit both root fields from `collectContentSources`, reject dated wrapper creation when the source date is missing, and exercise the real producer through context into draft | fixed locally; positive/missing/mismatch regressions pass, fresh scheduled proof pending |
| S-75 | semantic stage failures could leave a blocked root summary with empty `error`, null `error_code`, empty `failures`, and no blocking issue even though `output.review.issues` named the defect | normalize error-severity stage issues into stage/root error code, message, failures, and deduplicated blocking evidence; provide a stable generic fallback for non-semantic blocks and clear stale failure state on success | fixed locally; full production-entrypoint suite passes |
| S-76 | live `ai-2` used PowerShell's implicit text encoding when reading the UTF-8 run summary, allowing Windows PowerShell 5.1 to corrupt Chinese terminal evidence | used the supported updater for one prompt-only change to `Get-Content -LiteralPath ... -Encoding UTF8`, added a workflow-contract guard, and reread every non-prompt field plus the otherwise byte-equivalent prompt | fixed externally and contract-guarded; workflow validator passes 0 failures / 0 warnings |
| S-77 | the React homepage loaded the 1,197,407-byte article archive and grouped by event date, so 23 older events in the latest 72-record edition could be detached from their report while only 2 of 8 editorial main stories appeared in the former “today” view | added a schema-validated, privacy-scanned `home.json` projection keyed by `report_date`, retained report story order, implemented lead/secondary/compact hierarchy, and made homepage requests independent of `articles.json`/`feed.json` | fixed locally; focused schema/build/publish tests and desktop E2E/browser evidence pass |
| S-78 | the first home-artifact self-check reused the selected publish date containment rule, which would falsely block a legitimate historical backfill once that date fell outside the bounded homepage window | removed target-date containment for `home.json`; self-check now proves schema validity, truthful file byte size, and `latest_edition.report_date` equality with the latest feed entry | fixed locally; a 2026-06-04 backfill against a 2026-07-09 homepage passes the focused status regression |
| S-79 | Aify News carried a `first_class` intent label while only a site-watch shell existed; the first fix still left production Phase5 unaware of Aify and allowed site-only or hybrid-identity aggregate evidence to pass | retained the governed content entry/original publisher/aggregator authority, wired Aify into the production run summary, required both content and site-watch candidates with terminal dispositions, and rejected conflicting source/watch identity from both entries | merged through PR #302 and locally_verified; focused 8/8, affected 21/21, runner Phase5 2/2 and final 910/908/0/2 validation pass; three real production days remain pending |
| S-80 | the real non-publish pipeline spent minutes hashing its own fresh `.tmp` clone and quarantine during repository-guard snapshots before Codex repair | retained the truthful `needs_ai_repair` result, stopped the low-value 20-minute repair tail for this development pass, and recorded exclusion/bounded-snapshot work as a later workflow optimization | discovered; intentionally not mixed into REC-331 |
| S-81 | GitHub Trending exposed ranking scope as repository language, compared ranks across incompatible scopes/surfaces, and labelled first network README fetches as cache hits with unknown SHA | added `repository_language` without changing scope selection, keyed history by repo + source_scope and positive source_rank only, and made README cache keys content-SHA based with fail-closed miss/hit semantics | merged through PR #300 and locally_verified under REC-332; 905/903/0/2 final validation passes, fresh merged-main runs pending |
| S-82 | GitHub Trending source effectiveness counted 50 canonical repositories as 70 candidates and 20 final included repositories as 30 because original/derived/project surfaces were added as raw rows | centralized canonical repo identity, deduped candidate facts, made final report sections own legacy inclusion only, and reused the counter for source audit without governing docs/signals membership | merged through PR #301 and locally_verified under REC-314; focused 14/14, real 50/20 replay and final 907/905/0/2 validation pass; fresh production proof pending |
| S-83 | the 2026-07-14 non-publish run produced 32 candidates with four configured `source_level` values rejected by candidate/report schemas; registry validation ignored snake_case and let camelCase unknowns bypass the first fix, while three invalid candidates had already entered `community_leads`. Moving validation earlier also exposed three runtime story-audit fields missing from schema and eight legacy editorial aliases | historically added a strict synchronized registry/candidate/report vocabulary and producer validation; the later public-signal contract supersedes the closed classification behavior with open raw metadata and explicit public fallbacks, while retaining the replay as evidence for the optional legacy editorial artifact | historical fix locally verified under REC-401/REC-311; current public occurrences are no longer governed by vocabulary membership or editorial admission; exact 336-candidate SHA-bound replay remains provenance evidence |

## Production Acceptance

- REC-006 may become production_verified only after seven natural days with no unexpected blocked state, no new missing report, no stale running summary, at least one real repair/resume closure, Pages/terminal-summary consistency, bounded memory/worktree growth, and actionable failure next steps.
- The seven-day observation does not block creation or review of the current Slice PR.
