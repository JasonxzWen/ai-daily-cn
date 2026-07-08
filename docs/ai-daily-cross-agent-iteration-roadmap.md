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
| 7 Frontend IA | yes after content slices | Desktop and mobile screenshots show dense sections, no overlap, no hidden source-quality failures, and no public internal diagnostics. |

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

- One PR should own one slice unless the slice is explicitly a documentation/test binding like slice 0.
- Any slice that touches generation, rendering, source discovery, or public HTML must update `tasks/current-task.md` with concrete allowed paths and a red test or deterministic substitute.
- A slice may be called implemented only when it has a ledger item or existing ledger coverage, a validation command covered by `corepack pnpm run validate`, and a real artifact or fixture proving the target behavior.
- If a slice only improves documentation, do not claim the generated daily report has improved.

## Not In This Phase

- Do not rewrite the whole daily pipeline before real artifact validation exists.
- Do not add broad new sources without source-health evidence and a selection path.
- Do not beautify the public page before addressing admission and authoring.
- Do not use AI repair as the primary proof that generation is high quality.
- Do not call `.claude` or Codex chat memory the durable source of truth; promote durable decisions into repository files.
