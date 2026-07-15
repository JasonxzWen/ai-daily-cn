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
| Public source signal stream | B | PR1 RED/GREEN covers lossless pre-selection persistence, malformed-record isolation at the real writer boundary, stable native/fallback `observation_id`, same-URL occurrence retention, transparent repeated-row coalescing, publisher/collector separation, open metadata, URL sanitation, canonical clusters, real chronology, visible future anomalies, exact artifact/file-set pagination, input-derived generation IDs, interrupted-swap recovery, privacy scanning, and safe managed cleanup. Final validation passes 954 total / 952 pass / 0 fail / 2 skipped with build-clean, 418-file privacy and desktop E2E; the persisted historical projection is 10,966 unique records across 224 JSON files (1 index + 223 pages) | No UI composition changes in PR1; browser acceptance correctly waits for PR3 and the sole supported `1280x900` viewport | Good | One public taxonomy, one occurrence schema, one public page schema, and repository-level anti-admission regression replace implicit story selection as the public member contract | PR2 production independence/source expansion and PR3 complete scheme-C migration remain | 2026-07-14 |
| Daily production entrypoint | B | S-73 isolates advisory tasks from terminal degradation; the REC-324 convergence slice adds current issue/details/fingerprint evidence, strict signal reduction, path freezing, resolved state, stalled rollback, structural fail-closed, legacy migration, artifact integrity, and re-entry suppression. Final validation passes 918 total / 916 pass / 0 fail / 2 skipped with build-clean, 194-file privacy, E2E, Harness, workflow/resilience, JSON, and diff gates; bounded re-review is Ready with P0/P1=0; PR #304/#305 landed through #306 | No Web behavior changed; browser acceptance is correctly skipped under the supported `1280x900` desktop-only policy | Good | Repair state now distinguishes baseline/progressing/resolved/stalled and binds the author to one canonical current review artifact | Fresh scheduled proof and the real production-artifact replay slice remain | 2026-07-14 |
| Main selection fact contract | B | Existing score/rank/disposition/lineage tests remain green for the optional legacy edited report | Existing legacy Ops acceptance remains historical evidence; no PR1 visual change | Good | The selection vocabulary is centralized, but it is explicitly downstream of occurrence persistence and cannot govern public signal membership or chronology | PR3 may delete public consumers; internal editorial retention will be reassessed then | 2026-07-14 |
| Candidate artifact and source-level contract | B | Open-metadata regressions accept new non-empty source level, editorial category, and verification values; the historical 336-candidate replay remains provenance evidence; structural/reference validation still protects the legacy report artifact | Skipped: no Web composition changed, and `1280x900` remains the only supported viewport | Good | Raw metadata is open across registry/candidate/report/occurrence; canonical public values are centralized and unknowns visibly fall back instead of failing the pool | PR2 must prove independent scheduled publication; historical replay is not production verification | 2026-07-14 |
| ADC public frontend | C | The legacy edition-first frontend remains buildable, but it is no longer the accepted product target | Prior home/ops/official-blog/report screenshots are historical only; PR3 must accept the complete scheme-C site at `1280x900` | Good for the old surface | Existing tests are stable but many become deletion/migration work in PR3 | Current UI is too dense and visually misaligned; all public pages, routes, tests, and obsolete outputs require one complete migration | 2026-07-14 |
| Automation operating state | B | Exactly one live project definition (`ai-2`) remains; its dated run summary is now read with explicit PowerShell UTF-8 through a supported prompt-only update. Field-by-field reread preserved ACTIVE/schedule/cwd/project/bootstrap/model/reasoning/worktree/`--publish`, and live workflow validation passes without warnings | Not applicable | Improved by permanent manifests and a repository single-automation/encoding contract | Automation role, inventory, stale-assertion, and missing-encoding regressions are green | 48 retained dirs (11.0 GB), ambiguous/dirty/nonterminal histories, unmanaged stale DB cache row, retention automation, and three backfills remain | 2026-07-13 |
| Public article index artifact | B | Article-index tests plus full build-clean/privacy validation pass for Source Watch projection, dedupe, newest event, denylist, determinism, and fixed-date receipt | Source Watch rail/backrefs and `1280x900` desktop overflow accepted on the generated public fixture | Good | Stable focused, contract, and E2E tests | Real same-run receipt is proven; overall pipeline still needs a fresh terminal rerun after the unrelated S-69 page-gate fix | 2026-07-13 |
| Aify logical-source lane | B | Focused Aify contracts pass 8/8, affected Aify/Source Watch tests pass 21/21, runner Phase5 tests pass 2/2, final aggregate passes 910 total / 908 pass / 0 fail / 2 skipped, build-clean, privacy and desktop E2E; historical edited-report evidence remains 0/3 complete / not verified | Skipped: no Web composition changed, and the only supported viewport remains `1280x900` | Good | Publisher and aggregator identity remain distinct labels; every safe Aify observation belongs in the public signal projection, while primary confirmation and terminal dispositions govern only optional legacy factual stories | PR2 must prove three post-merge collection days project occurrences even when the legacy report has no match or is blocked | 2026-07-14 |
| GitHub Trending fact lane | B | REC-332 enrichment and REC-314 canonical effectiveness landed through PR #300/#301; RED/GREEN passes 3/3, the affected source suite passes 14/14, the real 2026-07-09 artifact replays from false 70/30 to canonical 50/20, and final validation passes 907 total / 905 pass / 0 fail / 2 skipped with build-clean, 194-file privacy and desktop E2E | Skipped: no Web composition changed; only `1280x900` is supported | Good | Scope/language, same-scope rank, README SHA cache, canonical repository identity, legacy final-section inclusion and audit/effectiveness parity now have deterministic contracts without governing public occurrence membership | A fresh persisted merged-main 50/20-style production proof remains; historical bad facts stay immutable | 2026-07-14 |
| Daily Codex DAG-lite MVP runner | B | P0/P1 focused and full validation pass; DAG stale Aify contract was repaired, while live `ai-2` workflow compatibility and automation inventory agree | Public effects accepted; production execution waits for merged remote main | Good | Fixture and production modes cover safe paths, host writes, repair limits, terminal truth, Source Watch semantics, and publish boundaries | Real non-publish/Pages evidence and full 16-node migration remain open | 2026-07-10 |
| Daily Codex DAG manifest contract | B | P0/P1 passed for PR-D two-node fixture sequencing; full `corepack pnpm run validate` passed | Deferred; no UI behavior changed | Good | `tests/daily-codex-dag.test.js` covers manifest/run-summary readiness projection, future node execution spec shape, executor/invocation pairing, cwd/prompt path preflight, Codex prompt existence and file-type rejection, blank argv/args token rejection, command invocation policy, controlled command runtime resolution, Codex CLI runtime resolution, generic node runtime dispatch, real deterministic command execution into a validated node result, live `.tmp` JSON input/output metadata resolution, missing-output and malformed-output failure, runtime-policy invariants, production manifest spec absence, mismatch rejection, no-execution contract-run semantics, artifact binding guards, the PR-B synthetic executable-node MVP CLI summary, the PR-C `score` real-node adapter fixture, and the PR-D fixture-only `classify-tag-entity -> score` sequence with ordered dependency evidence, artifact handoff, upstream blocking, downstream artifact failure, CLI stdout-only coverage, schema-only ordering rejection, and semantic rejection of score blocked after classify success; targeted DAG test reported 57/57; full validate exited 0 with 733 tests / 731 pass / 0 fail / 2 skipped | Codex execution, prompt delivery, retry/repair integration, artifact business-schema validation, production manifest execution specs, and full 16-node runner migration remain future work; production `config/daily-codex-dag.json` still carries no `node_execution_spec` | 2026-07-06 |

## Architecture Layers

| Layer | Rating | Boundary health | Agent readability | Key gaps | Last updated |
| --- | --- | --- | --- | --- | --- |
| Lossless occurrence boundary | B | `mergeDiscoveryPayloads().candidates` persists before selection into dated stores; technical invalidity is isolated per record; IDs, chronology, counts, URL sanitation, open metadata, labels, and pagination have deterministic contracts | Good | Scheduled build/publish independence is PR2; current runner still reaches public build through the legacy report path | 2026-07-14 |
| Shared ADC visual layer | A | `@adc/design/theme.css` and the Scheme C app styles feed the single Vite-owned React surface; legacy report, ops, official-blog HTML, Node renderers, duplicated CSS assets, and project-owned responsive branches are removed | Good | Desktop cross-browser/a11y coverage remains P2; third-party generic compatibility is not a support claim | 2026-07-14 |
| Automated authoring/repair boundary | B | Codex is read-only and returns JSON-Schema-constrained UTF-8 output. First-pass authoring covers every declared path exactly once; exceptional repair receives only current error evidence, cannot edit cleared paths, continues only after strict signal reduction, restores the accepted checkpoint on stall, and verifies artifact date/fingerprint before authoring. Candidate producer validation now runs before either path. | Good | Three consecutive post-merge first-pass observations remain; historical artifact replay cannot substitute for them | 2026-07-14 |
| Public/private artifact boundary | B | Internal dated occurrence stores retain raw classification hints; `docs/signals/**` exposes only reader-safe IDs, links, summaries, publisher/collector attribution, normalized tags, time, health, access, and explicit legacy origin. Candidate IDs, audit, scores, selection/rejection, repair, notes, private paths, URL credentials, secret query parameters, and embedded sensitive private-network links stay private | Good | PR2 must keep the same 418-file privacy gate while adding new public/legal collectors | 2026-07-14 |
| Selection fact boundary | B | Draft still owns scoring and selection for the optional legacy edited report. Occurrence persistence precedes it, and metamorphic tests prove classification, authority, selection, rejection, and score changes cannot alter the public member set or default chronology | Good | PR2 must ensure a blocked legacy report cannot prevent scheduled signal publication | 2026-07-14 |
| Logical-source evidence boundary | B | Aify's content entry and site watch share one stable internal governance identity while candidates preserve their original publisher and aggregator metadata. Production Phase5 records both collection evidence and a separate legacy editorial disposition; the latter cannot govern public occurrence membership | Good | PR2 must prove three complete post-merge days with lossless public projection; endpoint replay or a legacy edited-report match alone cannot close it | 2026-07-14 |
| HTML-index collection boundary | B | Title, summary, and image facts are restricted to the exact anchor or same-URL JSON-LD; date fallback is restricted to the exact anchor, page metadata, or the anchor's containing `article`/`li`, and high-specificity Fable prose requires identity fields plus the original Anthropic news URL | Good | Generic anchors without structured metadata now fail closed; 63 HTML-index sources still need real per-source productivity classification under REC-312 | 2026-07-10 |
| DAG-lite runner layer | B | Without production flags, `daily:codex-pipeline` runs the six-stage fixture/MVP path under `.tmp/daily-codex-mvp/YYYY-MM-DD/`; with `--execute`/`--publish`, the same entrypoint selects the single-script production orchestrator and bounded repair/resume path | Good | The fixture path proves deterministic orchestration; live nested-Codex CI and full 16-node production migration remain open | 2026-07-10 |
| DAG contract layer | B | `config/daily-codex-dag.json` references resilience policy instead of duplicating failure rules, validates artifact path ownership, checks input paths against upstream outputs, requires per-node `execution_contract.readiness`, projects deterministic execution levels and readiness into dry-run/contract-run summaries, validates run-summary envelopes with a dedicated schema plus semantic validators, defines schema/semantic validation for executable node result contracts, defines a future `execution_contract.node_execution_spec` shape with semantic cwd/prompt path preflight, invocation input policy, command policy, controlled command runtime resolution, explicit Codex CLI runtime resolution, generic node runtime dispatch, command-only executable node closed loop, live helper-level artifact metadata proof, a PR-B synthetic executable-node MVP CLI summary, a PR-C fixture-only `score` adapter, and a PR-D fixture-only `classify-tag-entity -> score` sequence proving dependency ordering, artifact handoff, and structured downstream blocking | Good | `node_executable` readiness is still rejected in the production manifest; PR-D deliberately has no Codex execution, prompt rendering, production manifest specs, retry/repair integration, or full production runner migration | 2026-07-06 |

## Change History

### 2026-07-14 (REC-328 lossless public signal contract)

- Change: Replaced story-first public admission as the controlling product contract with a source-first occurrence stream. Added dated pre-selection stores, centralized source/content/credibility taxonomy, reader-safe grouped pagination, open raw metadata, visible fallbacks, historical adapters, and repository-level precedence rules.
- Improved: Missing titles now receive source/URL fallbacks; unsafe URLs are isolated; URL credentials and secret/tracking parameters are removed; IDs are stable across input order; chronology uses parsed timestamps; source grouping is independent from credibility; empty/partial source history falls back by URL; counts, uniqueness, sort order, pagination, and coverage receive semantic validation.
- Regressed: No intended product regression. The old frontend remains temporarily available in PR1 and is explicitly a migration surface, not the accepted final design.
- New gaps: PR2 must expand public/legal sources and make scheduled signal publication independent from legacy report quality. PR3 must complete scheme C and delete old rendered surfaces/compatibility code.
- Closed gaps: Unknown source metadata no longer fails the pool, same-URL observations no longer disappear by default, and old story/qualified/capped rules can no longer claim public precedence without failing a repository contract test.

### 2026-07-14 (REC-401 source-level artifact replay gate)

- Historical change: Added strict optional `source_level` and legacy `sourceLevel` contracts to the source registry, synchronized the source/candidate/report vocabularies, classified the six production levels as third-party, and moved full candidate-pool normalization to the draft producer boundary. That closed-vocabulary behavior is superseded by PR1: raw metadata is open and unknown public labels fall back without rejecting occurrences; the replay remains evidence for the optional legacy editorial artifact.
- Improved: A provenance-bound fixture records the failed 2026-07-14 run without copying its 566 KB candidate pool or claiming production verification. Focused RED/GREEN passes 5/5, the affected unit/source/Aify/content suite passes 577/577, and the exact external artifact replays 336/336 with its original SHA-256. Final validation passes 923 total / 921 pass / 0 fail / 2 skipped with build-clean, 194-file privacy and E2E. The optimized report has zero source-level errors; its remaining three raw-schema errors are the expected fields added by report finalization. Independent closeout is Ready with P0/P1=0.
- Regressed: No selection thresholds, source authority, Web composition, automation, publishing, or supported viewport behavior changed. Browser acceptance is skipped under the desktop-only policy.
- New gaps: PR #305 landed through #306; one fresh merged-main non-publish production run remains.
- Closed gaps: A configured source level can no longer pass `sources:validate`, enter a candidate artifact, and wait until `report_write` to fail; malformed pools cannot be written by report draft.

### 2026-07-14 (REC-324 repair convergence)

- Change: Replaced numeric-budget-only exceptional repair with a persisted `baseline -> progressing -> resolved/stalled` contract. Each handoff now carries current matching issues, `issue.details`, active paths, deterministic path/problem keys, and a fingerprint bound to the canonical current review artifact.
- Improved: Cleared paths are frozen; later attempts continue only after strict signal-set reduction. The first non-improving safe-editorial attempt restores the prior accepted report and degrades with disclosure, while unsafe or structurally unrelated failures remain blocked. A resolved review clears old blockers, a later new issue starts a fresh baseline, legacy task-only summaries may establish one real baseline, and `content_contract` cannot reopen a stalled loop. The production author validates artifact date/fingerprint and the stale fixed Builder threshold is removed from its prompt. Final validation passes 918 total / 916 pass / 0 fail / 2 skipped with build-clean, 194-file privacy, E2E, Harness, workflow/resilience, JSON, and diff gates; independent re-review is Ready with P0/P1=0.
- Regressed: No Web, source-selection, scheduler, publish-command, or supported viewport behavior changed. Browser acceptance is skipped under the desktop-only policy.
- New gaps: PR #304 landed through #306; a real non-publish artifact replay and consecutive merged-main production observations remain.
- Closed gaps: Stale initial feedback, rewrites of resolved fields, unchanged-signal budget burn, worse-attempt publication, structural-error degradation, stale artifact authoring, legacy false stall, and content-contract repair re-entry are closed locally.

### 2026-07-14 (S-73 exhausted-budget advisory isolation)

- Change: Filtered terminal safe-degradation evidence through the same public-editorial authority boundary already used for repair retries.
- Improved: Advisory `translation_fidelity` tasks remain visible in review evidence but can no longer veto degradation or inflate residual task counts and affected sections.
- Regressed: No Web, publication command, scheduler, schema, or mobile behavior changed.
- New gaps: Repair convergence and a captured real production-artifact replay remain separate stacked slices; a fresh post-merge scheduled run is still required for production verification.
- Closed gaps: The exact mixed four editorial blockers plus ten advisory tasks seen in the failed run now proceeds to `report_write` as `published_degraded` under a deterministic regression.

### 2026-07-13 (REC-331 Aify production evidence wiring)

- Change: Made the production Phase5 stage explicitly audit `aify-news`, retained its structured evidence in the run summary, and required both content and site-watch entries to produce a candidate with a terminal disposition every day.
- Improved: Focused Aify tests pass 8/8, affected Aify/Source Watch tests pass 21/21, runner Phase5 tests pass 2/2, final aggregate passes 910 total / 908 pass / 0 fail / 2 skipped with build-clean, 194-file privacy and desktop E2E. Site-only and hybrid-single-candidate three-day fixtures with a public match both fail closed; the bounded re-review is Ready with P0/P1=0.
- Regressed: No known authority, selection, publication, automation, Web, historical artifact or desktop behavior changed; browser acceptance is skipped because no composition changed.
- New gaps: PR #302 is merged; three consecutive post-merge production days remain.
- Closed gaps: The scheduled production path can no longer omit the Aify logical audit; neither the old site-watch shell nor one candidate carrying two conflicting entry identities can manufacture `production_verified=true`.

### 2026-07-13 (REC-314 canonical GitHub source effectiveness)

- Change: Deduped GitHub original/derived candidates by canonical repository, scoped the final `github_trending` plus matching `projects` union to optional legacy edited-report inclusion and source effectiveness, and kept public occurrence membership exclusively in the lossless pre-selection store.
- Improved: The committed 2026-07-09 report/candidate pool now replays to 50 candidates / 20 included instead of 70/30. Three focused RED/GREEN paths and the 14-test affected suite pass; final validation passes 907 total / 905 pass / 0 fail / 2 skipped with build-clean, 194-file privacy and desktop E2E.
- Regressed: No known selection, Top20/Top10, rendering, automation, publication, historical artifact or desktop behavior changed. Browser acceptance is skipped because there is no Web composition change.
- New gaps: PR #301 is merged; one fresh persisted merged-main production proof remains.
- Closed gaps: Derived trend rows and overlapping project rows no longer inflate candidate/included effectiveness; stale candidate flags cannot manufacture legacy edited-report inclusion or source-effectiveness counts.

### 2026-07-13 (REC-332 truthful GitHub Trending facts)

- Change: Split ranking-scope language from repository primary language, keyed historical movement by repo plus source scope and source rank, and replaced README `hit:true/sha:unknown` defaults with content-SHA cache misses plus exact historical-key reuse.
- Improved: HTML and REST can supply repository language while weekly pool selection remains unchanged. Cross-scope records no longer manufacture up/down movement. First README fetch is a truthful miss and the next identical historical key is a hit. Focused tests pass 16/16, affected unit tests pass 253/253, and full validation passes 905 total / 903 pass / 0 fail / 2 skipped with build-clean, 194-file privacy, E2E, Harness, source/design/workflow/DAG and diff gates.
- Regressed: No known selection, public-layout, automation, publication, or desktop behavior regressed. Browser acceptance is skipped because no Web composition changed.
- New gaps: Three fresh merged-main runs are still required to prove real Top10 language/topics/license coverage, same-scope trend evidence, non-unknown README SHA/hit semantics, safe failed-README cards, and PR #299's non-generic GitHub prose.
- Closed gaps: Public `all` language loss, repo-only/public-rank trend drift, candidate scope-language loss, and false README cache hits are closed locally.

### 2026-07-13 (REC-324 first-pass public authoring)

- Change: Added one proactive public-prose authoring pass after deterministic draft and before the first formal quality review. It covers story title/narrative, hot-blog summary, GitHub description, and Builder translation through the existing schema, allowlist, and host-side applier rather than a second write protocol.
- Improved: Required paths must be covered exactly once; extra, duplicate, missing, or unsafe edits fail closed. Only a fully accepted authored report becomes review input and that authored state survives through repair, degrade annotation, and report_write. First-pass attempts do not consume exceptional-repair budget, advisory `translation_fidelity` tasks cannot acquire repair authority, and legacy `rewrite_autodraft_template` remains compatible. Focused tests pass 53/53, affected daily-runner tests pass 36/36, and final validation passes 903 total / 901 pass / 0 fail / 2 skipped with build-clean, 194-file privacy, E2E, Harness, workflow/resilience/DAG, JSON, and diff gates.
- Regressed: No known Web, source-selection, fact, link, schedule, or publish behavior changed. Browser acceptance is skipped because there is no UI composition change and the sole supported viewport remains `1280x900`.
- New gaps: PR #299 is merged. Three consecutive real non-publish observations must show at least two first-review direct passes, median exceptional-repair tasks of zero, no more than two on any day, and zero plain-language blockers before REC-324 can become `production_verified`.
- Closed gaps: Routine public-prose work no longer has to masquerade as post-review repair, partial authoring cannot leak into the formal review input, and Builder fidelity advisories no longer inflate or authorize repair.

### 2026-07-13 (REC-331 Aify logical-source observability)

- Change: Added Aify's public article JSON as a core T3 aggregator collection entry, mapped it with the existing site watch to `aify-news`, preserved original publisher and source level across live/cache paths, and extended Phase5 with consecutive-day logical-source evidence.
- Improved: Focused and affected contracts pass 41/41; final validation passes 898 total / 896 pass / 0 fail / 2 skipped with build-clean, 194-file privacy, E2E, Harness, source, design, and diff gates. Source validation reports 166 entries and the display contract reports 49 logical sources. Live read-only replays for 2026-07-11/12/13 each produced five date-correct candidates while retaining publisher names and `intermediary_only` authority. The logical proof is also bound to the same day's shared Phase5 admission/lineage verdict, so a T3 fact leak cannot pass a nested production flag.
- Regressed: No known reader, automation, publication, or desktop UI behavior changed. Browser acceptance is skipped because this is a data/governance Slice.
- New gaps: The current committed history contains none of the three required persisted days, so the audit correctly returns `production_verified=false`. Natural production observation and at least one public match remain post-merge work.
- Closed gaps: Aify is no longer a label-only site watch; config, logical identity, source effectiveness, terminal disposition, and public-output evidence now share one auditable contract.

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
