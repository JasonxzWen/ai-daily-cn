# AI Daily Cross-Agent Iteration Roadmap

This document is the durable repository home for the 2026-06-26 cross-agent diagnosis. It consolidates Codex and Claude Code session analysis, PR/commit history, scheduled-run retrospectives, automation summaries, and user intent into an implementation order. It is a planning and acceptance contract, not proof that downstream behavior is fixed.

## Highest Priority

The highest-priority change is not a generator rewrite. It is to keep the user's intent, pain, and accepted diagnosis inside the repository before further implementation.

Future agents must treat this file together with `docs/ai-daily-requirements-reconciliation.md`, `config/feedback-ledger.json`, and `docs/feedback-buglist-quick-reference.md` as the starting context for ai-daily improvement work. Raw Codex or Claude Code chat history can be used as evidence during diagnosis, but durable instructions must be promoted into repository files before the work is claimed stable.

## User Intent

- Publish automatically with minimal rescue work; degraded source lanes are acceptable when disclosed, but routine manual recovery is not.
- Produce a high-signal Chinese AI daily that answers what matters today, why it matters, and what to inspect next.
- Prioritize first-party research, engineering, builder, and project signals over low-value vendor PR.
- Keep GitHub Trending as a first-class lane with repo-specific context, star/trend metadata, README understanding, and visible Top items.
- Make the public page dense and scannable like a working document, but only after the content/admission layer improves.
- Convert user feedback into ledger-backed tests or runtime gates; do not rely on model memory or chat summaries.

## Current Diagnosis

The repository has improved reliability more than content judgment. Recent scheduled runs can reach `published_degraded`, and several PRs improved repair, source coverage, and rendering. The unresolved pain is that the generated report can still look structurally valid while retaining templated prose, low-signal item selection, weak GitHub descriptions, and unstable source lanes.

The main bottleneck is target mismatch: previous work often optimized schema compliance, post-generation repair, and publish survival, while the user expected editorial selection and concise human-readable synthesis. This mismatch must be corrected in the order below.

## Dependency Order

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

## Independently Verifiable

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

## Slice Execution Policy

- Treat each roadmap slice as the PR unit. Open one main PR per slice and use multiple commits inside that PR for audit, tags, guards, runtime changes, schema sync, tests, and docs.
- Do not open separate PRs for each small audit/tag/guard increment unless the user explicitly approves an exception.
- During development, run focused tests plus the affected suite. Before preparing a slice PR or final material delivery, run full `corepack pnpm run validate`.
- Before implementing a slice, review the completion definition table below, state how many slices still have unresolved implementation or evidence gaps, and confirm the current path has not drifted into partial increments.
- Centralize repeated contracts before expanding them. Stage vocabulary, role vocabulary, reject reasons, schema enums, runtime guards, and tests should come from one shared source or an explicitly documented synchronization point.
- Keep `.harness-hub/state/` writes low-frequency during implementation: record decision-level changes as they happen, then write complete progress, validation evidence, and restart notes during final handoff.

## Slice Completion Definition Table

This table is the pre-development checkpoint. A slice is not "done" because a partial guard, audit field, or renderer patch landed; it is done only when the completion definition and evidence boundary are satisfied.

| Slice | Completion Definition | Current Gap / Next Evidence |
|---|---|---|
| 0 Cross-agent memory and roadmap contract | Repository-owned roadmap, requirement reconciliation, ledger binding, quick reference, tests, and operating rules preserve accepted diagnosis before implementation. | This update closes the missing execution policy/completion-table gap; continue treating slice 0 as the durable planning contract, not product behavior evidence. |
| 1 Real artifact validation gate | Full validation includes real generated report artifacts that fail on templated prose, blank GitHub metadata, self-test-only coverage, stale public claims, and public/internal diagnostic leaks. | Partial: content contracts check real artifacts, but the gate still needs broader latest-report evidence before later slices can claim public quality is stable. |
| 2 Admission and scoring rewrite | Unified candidate admission ranks first-party research/engineering and strong builder/project/community signals above low-value vendor availability PRs, records `main_selection_stage` or `main_reject_reason` for every evaluated candidate, captures duplicate/merge/source-health/window-fill evidence, and proves behavior on real dated drafts. | Partial and currently at risk of PR fragmentation: story merge audit, stage labels, roles, and `window_fill` WIP are useful but do not complete scoring/admission. Next Slice 2 main PR should centralize vocabularies first, then finish admission, audit, and tests in one PR. |
| 3 LLM authoring before repair | First-pass report authoring produces story, hot-blog, GitHub, and Builder copy before repair; repair becomes a fallback, and real daily runs show public prose no longer depends on routine AI cleanup. | Locally implemented under REC-324: one complete source-grounded contract runs after draft and before first review, with exact-path coverage, safe fallback, and separate repair accounting. Three consecutive merged-main runs remain required before production verification. |
| 4 GitHub Trending enrichment | GitHub Trending Top items carry repo-specific stars, star growth/trend, topics/language, README status, failed-README metadata preservation, and non-generic Chinese explanations in public and interaction outputs. | Locally implemented under REC-332: repository language is separated from ranking scope, trend compares only same-scope source ranks, and README cache hit/SHA evidence is truthful. PR #299 supplies first-pass GitHub prose; three fresh merged-main runs must still prove metadata coverage and non-generic Chinese explanations before production verification. |
| 5 Source lane health repair | Each source lane records configured/reachable/parsed_recent/candidate_created/public_included/not_included_reason evidence or an explicit blocked/no-signal state, lane by lane. | Partial: REC-314 locally fixes GitHub canonical candidate/inclusion counts and stale-flag false positives, but official labs, HF, builders, Chinese RSS/WeChat/Zhihu, Reddit/community, and blogs still need lane-specific repair evidence. |
| 6 Automation observability cleanup | Automation inventory, status, and run summaries produce a consistent published/degraded/repaired/stage-failure view with enough evidence for unattended operation and recovery. | Locally complete for the current contract: one `ai-2` publisher remains, dated summaries are read explicitly as UTF-8, and semantic stage failures project stable terminal evidence. Fresh merged-main scheduled evidence is still required before production verification. |
| 7 Frontend information architecture | After content/admission/authoring improve, the `1280x900` desktop page presents dense scannable sections with source quality visible, no overlap, no public internal diagnostics, and browser acceptance evidence. Mobile, tablet, narrow-screen, and touch-only surfaces are not part of the slice. | Deferred: do not spend major effort here until slices 1, 2, 3, and 4 produce content worth compressing into the UI. |

## Current Path Review

As of 2026-07-09, 7 of the 8 roadmap slices still have material implementation or real-evidence gaps. Slice 0 is the only slice that can be completed mainly through repository governance and tests; this update is part of that closeout.

The recent implementation path improved Slice 2 auditability through small increments, but it drifted toward partial audit PRs instead of one completed admission/scoring slice. The correction is to stop opening narrow audit/tag/guard PRs and fold remaining Slice 2 work into a single main Slice 2 PR with commits for shared vocabulary, audit completion, scoring behavior, and focused plus affected-suite validation.

## Recommended Sequence

1. Finish slice 0 as a small documentation/test/ledger change.
2. Implement slice 1 next. Without real artifact validation, every later PR can pass while the public report still looks wrong.
3. Implement slice 2 before broad authoring work. Bad admission plus better prose will make low-value items sound more convincing.
4. Implement slice 4 in parallel or immediately after slice 2 if a smaller independent win is needed.
5. Implement slice 3 once admission and artifact gates can say whether authoring improved real output.
6. Implement slice 5 lane by lane; do not batch all external sources into one risky change.
7. Implement slice 6 whenever automation status becomes confusing or blocks unattended publish work.
8. Implement slice 7 last among the major content work, because layout changes should amplify signal, not mask weak selection.

## Scope Rules

- One main PR owns one slice. A slice PR may contain multiple commits, but small audit, tag, or guard increments should not become separate PRs.
- Any slice that touches generation, rendering, source discovery, or public HTML must update `.harness-hub/state/current-task.md` with concrete allowed paths and a red test or deterministic substitute.
- A slice may be called implemented only when it has a ledger item or existing ledger coverage, a validation command covered by `corepack pnpm run validate`, and a real artifact or fixture proving the target behavior.
- If a slice only improves documentation, do not claim the generated daily report has improved.
- During development, run focused validation plus the affected suite; run full `corepack pnpm run validate` when preparing the slice PR or final material delivery.
- Before adding another copy of a vocabulary or audit contract, centralize it or document the synchronization point across runtime, schema, and tests.

## Not In This Phase

- Do not rewrite the whole daily pipeline before real artifact validation exists.
- Do not add broad new sources without source-health evidence and a selection path.
- Do not beautify the public page before addressing admission and authoring.
- Do not use AI repair as the primary proof that generation is high quality.
- Do not call `.claude` or Codex chat memory the durable source of truth; promote durable decisions into repository files.
