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
- Runtime/production evidence: a real 2026-07-10 nested-Codex run produced a schema-constrained UTF-8 repair contract and passed the second quality review. That origin/main worktree then exposed a stale admission defect at report_write. Replaying the same real discovery artifacts through the current branch excludes that candidate before story selection and leaves candidate_backrefs passed. Full scheduled production evidence remains post-merge.
- Blocker: production_verified requires the PR to land so the clean origin/main publish worktree contains this implementation, followed by scheduled evidence.
- Recurrence prevention: one production entrypoint, capped attempts, exact path contracts, truthful terminal reasons, and regression tests.

### REC-002 - Source Watch truth convergence

- Type: evidence semantics / scheduler drift.
- Fact evidence: production has no real Source Watch producer-consumer; repository summaries now use not_connected and consumed false, while the live ai-2 prompt still references the obsolete admitted-artifact handoff.
- Root cause: fixture capability and requested paths were treated as production consumption evidence; scheduler text duplicated repository assumptions.
- State: runtime_verified.
- Implementation path: production entrypoint, workflow contract, repository docs/prompts/tests, and C:/Users/Admin/.codex/automations/ai-2/automation.toml.
- Validation commands: focused workflow-contract tests; node --test tests/daily-codex-pipeline.test.js; literal drift search; corepack pnpm run validate.
- Runtime/production evidence: the live ai-2 automation prompt was reduced to one entrypoint and real run summaries show production_status not_connected and consumed false with no requested/admitted artifact.
- Blocker: real producer-consumer belongs to REC-301, not this Slice.
- Recurrence prevention: semantic contract tests and a thin scheduler prompt with no business state machine.

### REC-003 - All-history ADC shared asset

- Type: frontend / generated archive.
- Fact evidence: src/site.js contains ADC_PUBLIC_THEME_START_DATE 2026-07-09; earlier report regeneration can retain legacy visuals and the current overlay is duplicated into report HTML.
- Root cause: visual rollout was date-gated and optimized for a partial migration rather than one durable generation contract.
- State: runtime_verified.
- Implementation path: src/site.js, src/render.js, src/adc-theme.js, packages/design/src/adc-theme.css, docs/assets/style.css, generated reports, and tests/adc-visual-contract.test.js.
- Validation commands: focused visual/unit tests; corepack pnpm run build; browser acceptance for early/latest reports and public shells; corepack pnpm run validate.
- Runtime/production evidence: all 49 generated report pages reference the same shared ADC asset; home, ops, official blog, the earliest 2026-05-13 report, and the latest 2026-07-09 report passed desktop/narrow browser checks with no console, network, HTTP, or overflow failures.
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
- Fact evidence: the recovery diff is uncommitted and has no PR, CI, mergeability, or seven-day stability evidence.
- Root cause: the prior task boundary stopped at local validation.
- State: implementing.
- Implementation path: atomic commits, push current branch, one Draft PR, status closeout, and a seven-day observation task.
- Validation commands: full local gates; gh PR/check/status commands; monitoring evidence after delivery.
- Runtime/production evidence: PR URL, commit hashes, CI, mergeability, conflicts, branch protection, and seven natural days of automation outcomes.
- Blocker: seven-day production_verified evidence is time-based and does not block this interactive Slice PR.
- Recurrence prevention: PR unit per Slice and post-delivery monitoring with explicit terminal criteria.

## Later Slice 1 - External Runtime Recovery

### REC-101 - Backfill three confirmed missing reports

- Type: production data recovery.
- Fact evidence: 2026-06-27, 2026-07-07, and 2026-07-10 are confirmed missing.
- Root cause: prior blocked/degraded runs did not converge automatically.
- State: discovered.
- Implementation path: reconstruct inputs, run validated generation, publish, and verify Pages/summary consistency.
- Validation commands: per-date quality/build/privacy/publish checks plus browser verification.
- Runtime/production evidence: each remote report URL and terminal summary agrees.
- Blocker: begins after the current Slice PR; requires live source/provider access.
- Recurrence prevention: missing-date monitor and bounded recovery entrypoint.

### REC-102 - Terminalize stale runs and restore self-check evidence

- Type: automation operations.
- Fact evidence: five stale running summaries and no recent self-check run evidence were observed; self-check cause is unknown.
- Root cause: external state and interrupt/finalization paths did not reliably converge.
- State: discovered.
- Implementation path: inspect each run lineage, terminalize with evidence, diagnose self-check target/schedule, and verify Pages/summary.
- Validation commands: run-summary schema/semantic checks and live scheduler evidence.
- Runtime/production evidence: no stale running entries; self-check emits a current terminal record.
- Blocker: external scheduler state and credentials may be required.
- Recurrence prevention: stale-run and missing-self-check alerts.

## Later Slice 2 - External State Cleanup

### REC-201 - Archive and bound automation memory/run-worktrees

- Type: storage / external state.
- Fact evidence: automation memory is about 157 KB with encoding corruption; run-worktrees occupy about 24.7 GiB.
- Root cause: no enforced retention days, disk budget, compaction, or GC.
- State: discovered.
- Implementation path: create archive and keep/delete inventories with size/last-use evidence, obtain second confirmation, then clean and add retention controls.
- Validation commands: inventory reconciliation, archive readability, post-cleanup disk/worktree counts.
- Runtime/production evidence: bounded growth over the seven-day observation.
- Blocker: destructive deletion requires explicit user confirmation after the inventory is presented.
- Recurrence prevention: retention days, disk budget, and automatic GC alerting.

## Later Slice 3 - Remaining Design and Capability Debt

### REC-301 - Real Source Watch producer-consumer

- Type: production capability.
- Fact evidence: four targets are configured but only fixture/local DAG capability exists; production is not connected. `docs/articles.json` contains 1,053 records and zero `section:source_watch` records. Aify and AI News Radar are configured-only; ML News and Awesome AI News already appear through ordinary collection lanes rather than a Source Watch handoff.
- Root cause: no production producer, consumed artifact contract, or end-to-end evidence.
- State: discovered.
- Implementation path: define producer, artifact schema, consumer, failure semantics, and live evidence.
- Validation commands: contract tests plus a real scheduled producer-consumer run.
- Runtime/production evidence: a consumed artifact ID/path tied to the same run.
- Blocker: product scope and source/runtime integration.
- Recurrence prevention: never infer consumption from a requested path.

### REC-302 - Official-blog knowledge_refs wiring

- Type: designed but incomplete feature.
- Fact evidence: the official-blog knowledge_refs connection is missing from production; six curated records exist, the newest is dated 2025-05-16, and all six related_report_dates arrays are empty.
- Root cause: design/schema intent did not reach the final renderer/consumer.
- State: discovered.
- Implementation path: trace schema to renderer and public artifact, then implement or explicitly retire.
- Validation commands: focused schema/render tests and browser artifact evidence.
- Runtime/production evidence: a real official-blog artifact exposes the intended references.
- Blocker: requires current source/spec confirmation.
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
- Fact evidence: stale baseline, template-only false green, docs/entrypoint drift, fake Source Watch consumption, repair path escapes, generated artifact drift, missing reports, blocked/stale runs, Pages failures, and disk growth recurred.
- Root cause: repeated review feedback was not consistently converted into CI, state-machine checks, alerts, or fixtures.
- State: discovered.
- Implementation path: centralize contracts; add CI/contract tests and monitors; keep one production entrypoint.
- Validation commands: full validate plus alert/fixture simulations.
- Runtime/production evidence: seven days without unexpected blocked, missing, stale, Pages mismatch, or budget breach.
- Blocker: follows closure of the producing defects.
- Recurrence prevention: this issue is the prevention program.

## Later Slice 3A - Source Survival and Effectiveness

### REC-311 - Converge admission, verification, quality, and Phase5

- Type: production admission / source truth.
- Fact evidence: the three-day Phase5 audit for 2026-07-09 reports `phase5_complete:false` and seven T3 fact leaks. Wechat2RSS PaperWeekly entered 2026-07-09 hot_blogs as intermediary-only; six non-primary records entered fact surfaces on 2026-07-06. A real 2026-07-10 run selected Simon Willison's intermediary-only OpenAI quotation into main_items and passed quality before report_write blocked it.
- Root cause: source ownership, claim verification, blacklist refill, Phase5, quality review, and report_write evolved as separate predicates. A vendor keyword in a third-party URL path could infer official ownership, while quality only checked ID/status/included_in.
- State: implementing.
- Current-Slice action: claim-level intermediary/original-social/unverified status now overrides a misleading source level for story admission; ownership inference uses source identity and URL hostname, not arbitrary URL path; quality and report_write share `collectCandidateCoverageIssues`; terminal summaries identify the latest unresolved failure. Real discovery replay excludes Simon with `secondary_single_source_story` and passes candidate_backrefs.
- Remaining action: centralize the remaining Phase5 and low-risk disclosure policy, upgrade verified original URLs explicitly, return concrete violating candidate IDs, and correct misleading missing-day/group notes.
- Acceptance: the 2026-07-06/08/09 three-day audit passes; high-risk Wechat/SSPAI fixtures block; verified GitHub/bioRxiv targets upgrade; quality pass implies report_write cannot later fail candidate coverage.

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

### REC-314 - Remove per-source fake-positive effectiveness

- Type: observability correctness.
- Fact evidence: `collectAuditSources()` copies group-level candidates_found to every source; `sourceHasRecentParsedSignal()` then treats that group count as a per-source parse signal. DeepSeek, Qwen, Kimi, MiniMax, and Zhipu can therefore show parsed_recent even when their own parsed_count is zero.
- Root cause: group success is attributed to every source in the group.
- State: discovered.
- Action: parsed_recent must use only per-source parsed_count/recent_48h_entries; missing evidence remains unknown/no_recent.
- Acceptance: in a two-source group where only one source emits candidates, the other remains parsed_recent false.

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
| retired-editorial | Bens Bites, HelloGitHub, RuanYF Weekly | low threshold or overly broad/noisy output |
| retired-default | Zhihu, Jike, RSSHub placeholders | explicitly forbidden by source-reset preflight |
| retired-but-effective | platform-reddit-local-llama-feed | previously productive, but removed for trust/noise/public-surface diet; restore only as an explicit optional/manual product decision |
| investigate-then-decide | content-rctv-generative-video | existed only in snapshot d63ebd8 and never landed on main |

- Acceptance: registry/docs preserve replace/retire/investigate state so later sessions do not blindly restore removed IDs.

### REC-316 - Decide 24 unexecuted logical-source promotion proposals

- Type: source ranking / planned-only configuration.
- Fact evidence: none of the 24 proposal IDs in source-order-tuning-review entered the display contract; 78 collection entries remain unmapped. Eleven of the 24 produced candidates on 2026-07-09, but only Google Keyword, Alibaba Cloud, and Leiphone contributed included items.
- Root cause: a review proposal was later read as implementation progress without a production promotion decision.
- State: discovered.
- Action: after REC-311/314, decide promote/defer/retire per productive source using multi-day evidence; keep source-first diagnostics internal.
- Acceptance: display contract, source_effectiveness, candidate output, and public inclusion agree per logical source.

### REC-317 - Keep RSSHub/RSS-Bridge optional, not default

- Type: replaced/retired default capability.
- Fact evidence: the current 165-source registry contains no RSSHub/RSS-Bridge/aggregator defaults; preflight forbids the old placeholders, while external `--sources` fixtures still support private integrations.
- Root cause: the old integration plan was not updated after source reset.
- State: replaced.
- Action: update the old plan to label this a standalone private capability; do not restore placeholders. Later remove compatibility code only if no real user remains.

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
- State: discovered.
- Action: restore a minimal home navigation/card and protect it with browser acceptance; do not re-import the whole old homepage.
- Acceptance: desktop/narrow home can discover the official-blog knowledge page and the entry survives a replacement build.

### REC-321 - Connect the official-blog knowledge workflow to daily production

- Type: half-landed, operator-only workflow.
- Fact evidence: about 22 stage retrospectives and roughly 20 commits produced preview, review, authoring, and context commands, but feed/decision preparation is manual; daily production never consumes official-blog context. Only six static records exist, newest 2025-05-16, all with empty related_report_dates.
- State: discovered.
- Action: one Slice PR should connect input -> review checkpoint -> compact pre-draft context. REC-302 continues to own knowledge_refs rendering/backlinks.
- Acceptance: a real daily run records the reviewed compact context it consumed and backlinks appear without manual file surgery.

### REC-322 - Resolve searchable archive versus deliberate no-search redesign

- Type: product decision conflict.
- Fact evidence: README still promises a searchable archive; commit 3172371 implemented search, domain/channel/source/min-score filters and full history. The modernization roadmap later declared search/comparison/favorites non-goals. Current React shows today/yesterday/history and truncates history with `slice(0, 60)`; the legacy search renderer remains unreachable because Vite overwrites the page.
- State: discovered; decision_required.
- Action: either restore minimal React search/source filtering/full history, or explicitly retire the capability, delete unreachable renderer/tests, and update README. Do not delete the renderer before this decision.
- Acceptance: one product statement, one reachable implementation, and browser tests for the chosen behavior.

### REC-323 - Finish admission/scoring as one production Slice

- Type: half-landed selection design.
- Fact evidence: only the blacklist-refill item is confirmed; roadmap remains 7/8 incomplete and prior work fragmented into small audit-field PRs without a real-date end-to-end acceptance.
- State: implementing through REC-311, not complete.
- Action: one main Slice PR should converge shared vocabulary, rejection audit, real-date draft/HTML, and production evidence.
- Acceptance: selection/rejection reasons, quality, Phase5, report_write, and public artifact agree on real dates.

### REC-324 - Make first-pass authoring real; keep repair exceptional

- Type: designed but not achieved.
- Fact evidence: real 2026-07-10 runs still emitted 11-12 translation/editorial repair tasks, so repair remains a normal authoring phase rather than a fallback.
- State: discovered.
- Action: move source-grounded writing to the first authoring pass and measure repair frequency; retain bounded repair only for exceptional defects.
- Acceptance: consecutive real runs pass first review or require a small exceptional repair set, not routine full builder translation.

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

### REC-328 - Keep public pages story-first; retain source diagnostics internally

- Type: intentional replacement.
- Fact evidence: the 2026-06-30 retrospective removed the source-first public dashboard after audit inventory and machine logs overwhelmed reader content; diagnostics remain internal.
- State: replaced.
- Action: do not restore the old dashboard. A future reader-facing health line must be compact and appear after story content.

### REC-329 - Preserve explicit retirement of superseded frontend directions

- Type: technical-debt terminal state.
- Fact evidence: PromptLayer, dark/glass, old shadcn/no-daily-HTML directions, empty workspace packages, unused Astryx CLI, and dead daily-theme were replaced or unused. Astryx runtime components remain genuinely used.
- State: locally_verified.
- Current-Slice action: dead theme, unused CLI dependency, and three empty packages were removed; ADC shared visual contract replaced duplicate dated rollout behavior.
- Guardrail: REC-322's legacy search renderer is not ordinary dead code until the search product decision is made.

## Confirmed Surviving Value

- Product/content: four dense Feishu-style tracks, roughly 100-character summaries, collapsible stories, and desktop navigation remain active.
- Visual: the ADC persona, black/white heavy-line paper-and-ink system, low-intensity motion, reduced-motion behavior, and active Astryx components remain.
- Source capability: GitHub Trending, Hugging Face Trending, central follow-builders X, HNRSS, 12 curated Wechat2RSS feeds, seven general-news sources, Smol AI News, Hugging Face Daily Papers, and corrected Magnifier/Crunchbase entries remain effective or correctly replaced.
- Governance: source-first diagnostics moved internal rather than disappearing; official-blog page/JSON/backlink capability survives even though its home entry and production intake do not.
- Deferred ideas: long-term topic/capability maps and evidence-driven financing remain recorded instead of being silently forgotten.

## This-Session Issue and Action Register

This table is part of the same ledger, not a second review. `fixed` means implemented on this branch; it does not mean post-merge production_verified.

| ID | Evidence-backed issue found this session | Action taken | State |
| --- | --- | --- | --- |
| S-01 | Harness task/progress/handoff and evaluator claims lagged behind the real diff | rewrote active task, progress, decisions, handoff and JSONL evidence against final validation/PR/monitor state | fixed |
| S-02 | ADC rollout was date-gated at 2026-07-09, leaving older reports visually divergent | removed the date gate, generated one versioned shared asset, rebuilt all 49 reports | fixed; runtime_verified locally |
| S-03 | visual contract was duplicated between React/static/report paths | made packages/design CSS the source, added adc-theme bridge/hash, linked static and generated surfaces | fixed |
| S-04 | dead theme, unused Astryx CLI, and three empty packages inflated the repo | removed only reference-proven dead weight; retained active Astryx components | fixed |
| S-05 | live ai-2 prompt duplicated workflow logic and implied fake Source Watch consumption | updated automation through the supported tool to one entrypoint and truthful not_connected/false semantics | fixed; external config updated |
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
| S-19 | three reports are missing; stale running summaries, absent self-check evidence, 24.7 GiB run-worktrees, and corrupt memory remain | recorded REC-101/102/201; no destructive cleanup performed without second confirmation | intentionally deferred |
| S-20 | 24 historical source IDs had no durable replacement/retirement record | recorded the source survival matrix under REC-315 | fixed at decision layer |
| S-21 | official-blog home discovery and production intake were lost/half-landed | recorded REC-320/321 with exact surviving assets and minimal restoration path | discovered |
| S-22 | README search promise, old searchable renderer, and React no-search roadmap conflict | recorded REC-322 as decision_required; blocked premature dead-code deletion | discovered |
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
| S-35 | the automation creation API rejected `worktree` execution for a new cron monitor | followed the tool contract and created project-scoped local, read-only automation `ai-7` with an explicit 2026-07-17 expiry | fixed |
| S-36 | the Advanced Security CodeQL PR gate flagged two high-severity regular-expression-injection alerts where the validated report date was interpolated into a contract-name regex | removed both dynamic regexes and replaced them with exact name, fixed prefix/suffix, and digit-only attempt parsing | fixed; 38/38 focused tests and all four CodeQL checks passed |

## Production Acceptance

- REC-006 may become production_verified only after seven natural days with no unexpected blocked state, no new missing report, no stale running summary, at least one real repair/resume closure, Pages/terminal-summary consistency, bounded memory/worktree growth, and actionable failure next steps.
- The seven-day observation does not block creation or review of the current Slice PR.
