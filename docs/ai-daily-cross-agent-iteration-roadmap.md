# AI Daily Cross-Agent Iteration Roadmap

This document is the durable repository home for the 2026-06-26 cross-agent diagnosis. It consolidates Codex and Claude Code session analysis, PR/commit history, scheduled-run retrospectives, automation summaries, and user intent into an implementation order. It is a planning and acceptance contract, not proof that downstream behavior is fixed.

<!-- curated-edition-contract-ref:v1 -->

## 2026-07-15 Current Product Direction

Status: `accepted-target / implementation-pending`.

The controlling behavior and acceptance authority is [AI Daily 精选首页三层迁移规格](ai-daily-curated-homepage-migration-spec.md). The current lossless source-listener implementation remains the migration baseline, but it no longer controls default-homepage membership, ordering or information architecture.

### Active Dependency Order

| Order | Phase | Depends on | Completion boundary |
| ---: | --- | --- | --- |
| 0 | Contract and real regression baseline | none | One target authority, initial 11-point/eight-workstream coverage, source asset reconciliation, five-layer feature survival, production-derived fixture design, no implementation claim. |
| 1A | Source assets, raw observation and funnel shadow | 0 | Current registry/historical links have fact/unknown states; `registered→fetched→parsed` receipts and Aify Today Picks extraction run in the real DAG without changing active Aify config or any current public output. |
| 1B | Deterministic admission, low-threshold pool and summary shadow | 1A | Admission/quarantine/pool/public-ready replay passes; ordinary grounded summaries and Aify `ready + editorial_ready` passthrough are distinct; current public site remains byte-identical. |
| 2 | Edition backend and specialized DTO shadow | 1B | Ordinary-source claim-span summaries and editor/critic receipts, Aify zero-secondary-processing receipts, 10–14/5–9/0–4 budgets, lane terminalization, GitHub/X/Paper/Model/Benchmark contracts and last-good failure behavior pass. |
| 3 | Reader-intent React frontend | 2 plus legal Harness Hub migration in a clean standalone target | PR6 internal checkpoint only: latest/dated revision, clean pool and legacy fixtures pass direct-load/refresh, membership isolation and `1280x900` acceptance while preserving the current warm-paper style. It may not merge separately or ship as dormant/flagged UI. |
| 4 | Production orchestration, atomic cutover and legacy freeze | 1A, 1B, 2, 3 | In the same PR6 and site generation as Phase 3, active Aify/source config flips, `/` serves edition, `/signals` serves the new clean pool, `/legacy` is immutable, and pool remains independent from edition failure. |
| 5 | Stable-run cleanup | 4 plus seven natural runs | Conflicting active contracts/prompts/render paths retire; legacy data and validators remain. |

### Active Merge Packaging

Phase count is not PR count. The minimal complete delivery has seven direct-to-main, non-stacked merge/revert domains; each starts only after its predecessor merges and freshness returns `0 0`.

| PR | Outcome | Public behavior |
| --- | --- | --- |
| PR1 | Specification, interaction/source history evidence, full feature-survival and regression baseline | unchanged |
| PR2 | Legal Harness Hub migration from the source default-branch current HEAD in a clean standalone target | unchanged |
| PR3 | Source asset audit plus raw/funnel shadow in the scheduled DAG | unchanged |
| PR4 | Admission/pool/summary/provenance/icon shadow | unchanged |
| PR5 | Edition plus GitHub/X/Paper/Model/Benchmark shadow | unchanged |
| PR6 | Reader UI, visual/token/icon work, historical capability recovery, routes, runner/publish, active source flip and legacy freeze | one atomic cutover |
| PR7 | Cleanup after seven natural successful runs | no intended product change |

PR3–PR5 must prove the old public generation is unchanged and shadow failures do not block the old publisher. PR6 cannot be split: main merge immediately participates in the scheduled Web build, so a separate frontend merge would either change production early, create dormant code, or require a second renderer/feature flag. The canonical specification Section 13 owns detailed paths, gates and rollback boundaries.

### Roadmap Ownership Boundary

- This roadmap owns phase order, dependencies and completion boundaries.
- The curated-edition specification owns entities, fields, admission/selection behavior, section budgets, feature-survival decisions and PC acceptance IDs.
- The curated-edition specification also owns the seven-PR merge packaging. This roadmap summarizes dependencies only and must not invent another PR sequence.
- Requirements reconciliation owns current status and evidence mapping.
- `tasks/project-recovery-ledger.md` owns the stable recovery issue ID; do not create another issue list.
- No phase may switch the default route or delete old data before its predecessor exit gate passes.

<!-- public-signal-stream-contract:v1 -->

## 2026-07-14 Product Direction (Current Runtime Baseline)

Status: `implemented-runtime / target-superseded`.

The repository currently runs a broad, source-first AI signal listener. This section remains factual evidence for occurrence identity, raw lineage, source expansion, privacy and the pre-cutover archive. Its no-admission, no-dedupe, chronology and default-homepage clauses were superseded as the target by the accepted 2026-07-15 direction above.

- No content-admission gate exists in the public signal path. Every safely normalizable occurrence with a usable title and HTTP(S) material URL remains publicly discoverable.
- Credibility, content, source, health, and access metadata are labels and filters only. They cannot change membership or default chronology.
- Duplicate URLs from distinct collectors or `observation_id` values remain distinct occurrences. Repeated input rows for one observation are transparently coalesced and counted; URL clustering supports navigation and is never a content dedupe or suppression rule.
- Unknown classification values fall back visibly to `other` / `pending_review`; new metadata never fails the full pool.
- Raw `source_audit`, candidate scores, selection/rejection reasons, repair state, private paths, and machine logs remain internal. Reader-safe source group, publisher, collection channel, content tag, credibility tag, health, access, summary, and time fields are public.
- Pagination and the 48-hour homepage preview are transport and presentation devices, never total-count limits.

### Landed / Historical PR Sequence

| PR | Product slice | Completion boundary |
|---|---|---|
| PR1 | Lossless occurrence and public projection | Assign stable observed `observation_id` before selection; preserve collection metadata through merge; persist merged discovery observations with transparent repeat counts; centralize taxonomy and fallback; publish exact paginated `docs/signals/**`; retain historical structured records with explicit origin labels. |
| PR2 | Aggressive public/legal source expansion and production independence | Add official blogs, GitHub, communities, X through the existing public path, news/newsletters, RSS, papers, and model feeds without observation periods; let signal persistence/build/publication complete independently of legacy editorial quality gates. New authenticated X/Reddit connectors stay deferred. |
| PR3 | Complete scheme-C public frontend migration | Replace every public page at the sole supported `1280x900` viewport with the source-grouped light-gray/white-panel/indigo system, 48-hour grouped preview, same-page lazy loading, and full history; delete obsolete daily/archive/ops/official-blog rendered pages and compatibility code while preserving useful structured information. |
| PR4 | Evidence-driven hardening only if needed | Add performance or observability work only after real runtime evidence identifies a concrete problem; do not pre-build another control plane. |

### Historical Iteration Style

- Prefer listening coverage and explicit uncertainty labels over proving content worthy of entry.
- Prefer a direct data contract and one fallback over observation periods, tier matrices, compatibility gates, duplicated vocabularies, or speculative abstractions.
- Treat safety, privacy, URL validity, provenance, escaping, and renderability as technical boundaries, not content admission.
- Delete superseded paths when the migration PR reaches them; do not keep parallel public surfaces merely to avoid making a decision.
- Preserve historical evidence without letting historical rules remain active authority.

The remaining sections document prior plans. They are not the active implementation order after 2026-07-15.

## Historical Highest Priority

The highest-priority change is not a generator rewrite. It is to keep the user's intent, pain, and accepted diagnosis inside the repository before further implementation.

Future agents must treat this file together with `docs/ai-daily-requirements-reconciliation.md`, `config/feedback-ledger.json`, and `docs/feedback-buglist-quick-reference.md` as the starting context for ai-daily improvement work. Raw Codex or Claude Code chat history can be used as evidence during diagnosis, but durable instructions must be promoted into repository files before the work is claimed stable.

## Historical User Intent

- Publish automatically with minimal rescue work; degraded source lanes are acceptable when disclosed, but routine manual recovery is not.
- Produce a high-signal Chinese AI daily that answers what matters today, why it matters, and what to inspect next.
- Prioritize first-party research, engineering, builder, and project signals over low-value vendor PR.
- Keep GitHub Trending as a first-class lane with repo-specific context, star/trend metadata, README understanding, and visible Top items.
- Make the public page dense and scannable like a working document, but only after the content/admission layer improves.
- Convert user feedback into ledger-backed tests or runtime gates; do not rely on model memory or chat summaries.

## Current Diagnosis (Historical Eight-Slice Baseline)

The repository has improved reliability more than content judgment. Recent scheduled runs can reach `published_degraded`, and several PRs improved repair, source coverage, and rendering. The unresolved pain is that the generated report can still look structurally valid while retaining templated prose, low-signal item selection, weak GitHub descriptions, and unstable source lanes.

The main bottleneck is target mismatch: previous work often optimized schema compliance, post-generation repair, and publish survival, while the user expected editorial selection and concise human-readable synthesis. This mismatch must be corrected in the order below.

## Historical Dependency Order

| Order | Slice | Depends On | Scope | Why This Order |
|---|---|---|---|---|
| 0 | Cross-agent memory and roadmap contract | none | docs, ledger, tests, retrospective | Prevents future agents from rediscovering the same pain and making local-only plans. |
| 1 | Real artifact validation gate | 0 | content contract scripts, tests, package validation | Makes real generated reports part of validation before changing selection logic. |
| 2 | Admission and scoring rewrite | 1 | `src/draft.js`, selection prompts, candidate audit tests | Stops low-value vendor updates from winning before authoring expands their prose. |
| 3 | LLM authoring before repair | 1, 2 | authoring pipeline, quality loop, story/hot-blog/GitHub copy tests | Moves model work from fallback repair into first-pass report writing. |
| 4 | GitHub Trending enrichment | 1 | GitHub discovery, README cache, public rendering tests | Independent high-ROI lane; can improve without waiting for source-lane fixes. |
| 5 | Source lane health repair | 1 | Anthropic/OpenAI/DeepMind/builders/HF/WeChat/Zhihu health and fixtures | Turns configured sources into effective sources with visible checked/no-signal/blocked states. |
| 6 | Automation observability cleanup | 0 | automation docs, inventory, run-summary dashboard | Independent reliability work; should not block content-quality slices. |
| 7 | Frontend information architecture | 1, 2, 3, 4 | interaction input, CSS, Playwright page checks | Dense UI is valuable only after the content it compresses is worth scanning. |

## Historical Independently Verifiable Matrix

| Slice | Independently Verifiable | Minimum Evidence |
|---|---|---|
| 0 Cross-agent roadmap | yes | This document, REQ mapping, ledger scope, quick reference row, unit test, retrospective index entry. |
| 1 Real artifact validation | yes | A fixture or latest-report command that fails on templated phrases, blank GitHub metadata, and self-test-only coverage; `corepack pnpm run validate` must include it. |
| 2 Admission rewrite | mostly yes | Candidate fixtures where Anthropic/OpenAI/DeepMind research or engineering beats or explicitly rejects low-value vendor availability PR; real dated draft evidence before claiming stable. |
| 3 LLM authoring | partly | A bounded slice can prove stories or hot blogs are authored before repair; full success needs real daily runs with no routine AI repair for public prose. |
| 4 GitHub Trending enrichment | yes | Top items include stars, star growth or trend, topics/language where available, README summary status, and non-generic Chinese description. |
| 5 Source lanes | yes per lane | Each lane has configured/reachable/parsed_recent/candidate_created/public_included/not_included_reason evidence or a documented blocked/no-signal state. |
| 6 Automation observability | yes | Automation config is readable, status is consistent, and run summaries produce a simple published/degraded/repaired/stage-failure view. |
| 7 Frontend IA | yes after content slices | `1280x900` desktop screenshots show dense sections, no overlap, no hidden source-quality failures, and no public internal diagnostics. |

## Historical Slice Execution Policy

- Treat each roadmap slice as the PR unit. Open one main PR per slice and use multiple commits inside that PR for audit, tags, guards, runtime changes, schema sync, tests, and docs.
- Do not open separate PRs for each small audit/tag/guard increment unless the user explicitly approves an exception.
- During development, run focused tests plus the affected suite. Before preparing a slice PR or final material delivery, run full `corepack pnpm run validate`.
- Before implementing a slice, review the completion definition table below, state how many slices still have unresolved implementation or evidence gaps, and confirm the current path has not drifted into partial increments.
- Centralize repeated contracts before expanding them. Stage vocabulary, role vocabulary, reject reasons, schema enums, runtime guards, and tests should come from one shared source or an explicitly documented synchronization point.
- Keep `.harness-hub/state/` writes low-frequency during implementation: record decision-level changes as they happen, then write complete progress, validation evidence, and restart notes during final handoff.

## Historical Slice Completion Definition Table

This table is the pre-development checkpoint. A slice is not "done" because a partial guard, audit field, or renderer patch landed; it is done only when the completion definition and evidence boundary are satisfied.

| Slice | Completion Definition | Current Gap / Next Evidence |
|---|---|---|
| 0 Cross-agent memory and roadmap contract | Repository-owned roadmap, requirement reconciliation, ledger binding, quick reference, tests, and operating rules preserve accepted diagnosis before implementation. | This update closes the missing execution policy/completion-table gap; continue treating slice 0 as the durable planning contract, not product behavior evidence. |
| 1 Real artifact validation gate | Full validation includes real generated report artifacts that fail on templated prose, blank GitHub metadata, self-test-only coverage, stale public claims, public/internal diagnostic leaks, and producer schema drift. | Partial: content contracts check real reports, and the 2026-07-14 SHA-bound historical candidate replay now closes the source-level producer-drift sublane without claiming production verification. Broader latest-report/HTML evidence and one fresh merged-main non-publish artifact still remain before later slices can claim public quality is stable. |
| 2 Admission and scoring rewrite | Unified candidate admission ranks first-party research/engineering and strong builder/project/community signals above low-value vendor availability PRs, records `main_selection_stage` or `main_reject_reason` for every evaluated candidate, captures duplicate/merge/source-health/window-fill evidence, and proves behavior on real dated drafts. | Partial and currently at risk of PR fragmentation: story merge audit, stage labels, roles, and `window_fill` WIP are useful but do not complete scoring/admission. Next Slice 2 main PR should centralize vocabularies first, then finish admission, audit, and tests in one PR. |
| 3 LLM authoring before repair | First-pass report authoring produces story, hot-blog, GitHub, and Builder copy before repair; repair becomes a fallback, and real daily runs show public prose no longer depends on routine AI cleanup. | Locally implemented under REC-324: one complete source-grounded contract runs after draft and before first review, with exact-path coverage, safe fallback, and separate repair accounting. Three consecutive merged-main runs remain required before production verification. |
| 4 GitHub Trending enrichment | GitHub Trending Top items carry repo-specific stars, star growth/trend, topics/language, README status, failed-README metadata preservation, and non-generic Chinese explanations in public and interaction outputs. | Locally implemented under REC-332: repository language is separated from ranking scope, trend compares only same-scope source ranks, and README cache hit/SHA evidence is truthful. PR #299 supplies first-pass GitHub prose; three fresh merged-main runs must still prove metadata coverage and non-generic Chinese explanations before production verification. |
| 5 Source lane health repair | Each source lane records configured/reachable/parsed_recent/candidate_created/public_included/not_included_reason evidence or an explicit blocked/no-signal state, lane by lane. | Partial: REC-314 fixes GitHub canonical candidate/inclusion counts. REC-331 now requires both Aify content and site-watch entries per day and wires its audit into the production run summary, but three post-merge production days and the remaining official labs, HF, builders, Chinese RSS/WeChat/Zhihu, Reddit/community, and blogs still need lane-specific evidence. |
| 6 Automation observability cleanup | Automation inventory, status, and run summaries produce a consistent published/degraded/repaired/stage-failure view with enough evidence for unattended operation and recovery. | Locally complete for the current contract: one `ai-2` publisher remains, dated summaries are read explicitly as UTF-8, and semantic stage failures project stable terminal evidence. Fresh merged-main scheduled evidence is still required before production verification. |
| 7 Frontend information architecture | After content/admission/authoring improve, the `1280x900` desktop page presents dense scannable sections with source quality visible, no overlap, no public internal diagnostics, and browser acceptance evidence. Mobile, tablet, narrow-screen, and touch-only surfaces are not part of the slice. | Deferred: do not spend major effort here until slices 1, 2, 3, and 4 produce content worth compressing into the UI. |

## Historical Path Review

As of 2026-07-14, 7 of the 8 roadmap slices still have material implementation or real-evidence gaps. Slice 0 remains the only closed planning contract. The current source-level replay work stays within Slice 1 and closes one candidate producer-drift sublane; it does not close broader report/HTML evidence or count a historical replay as merged-main production verification. Aify remains within Slice 5 and still requires three post-merge days plus the other source lanes.

The recent implementation path improved Slice 2 auditability through small increments, but it drifted toward partial audit PRs instead of one completed admission/scoring slice. The correction is to stop opening narrow audit/tag/guard PRs and fold remaining Slice 2 work into a single main Slice 2 PR with commits for shared vocabulary, audit completion, scoring behavior, and focused plus affected-suite validation.

## Historical Recommended Sequence

1. Finish slice 0 as a small documentation/test/ledger change.
2. Implement slice 1 next. Without real artifact validation, every later PR can pass while the public report still looks wrong.
3. Implement slice 2 before broad authoring work. Bad admission plus better prose will make low-value items sound more convincing.
4. Implement slice 4 in parallel or immediately after slice 2 if a smaller independent win is needed.
5. Implement slice 3 once admission and artifact gates can say whether authoring improved real output.
6. Implement slice 5 lane by lane; do not batch all external sources into one risky change.
7. Implement slice 6 whenever automation status becomes confusing or blocks unattended publish work.
8. Implement slice 7 last among the major content work, because layout changes should amplify signal, not mask weak selection.

## Historical Scope Rules

- One main PR owns one slice. A slice PR may contain multiple commits, but small audit, tag, or guard increments should not become separate PRs.
- Any slice that touches generation, rendering, source discovery, or public HTML must update `.harness-hub/state/current-task.md` with concrete allowed paths and a red test or deterministic substitute.
- A slice may be called implemented only when it has a ledger item or existing ledger coverage, a validation command covered by `corepack pnpm run validate`, and a real artifact or fixture proving the target behavior.
- If a slice only improves documentation, do not claim the generated daily report has improved.
- During development, run focused validation plus the affected suite; run full `corepack pnpm run validate` when preparing the slice PR or final material delivery.
- Before adding another copy of a vocabulary or audit contract, centralize it or document the synchronization point across runtime, schema, and tests.

## Historical Not In This Phase

- Do not rewrite the whole daily pipeline before real artifact validation exists.
- Do not add broad new sources without source-health evidence and a selection path.
- Do not beautify the public page before addressing admission and authoring.
- Do not use AI repair as the primary proof that generation is high quality.
- Do not call `.claude` or Codex chat memory the durable source of truth; promote durable decisions into repository files.
