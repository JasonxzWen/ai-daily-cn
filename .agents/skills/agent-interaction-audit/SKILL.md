---
name: agent-interaction-audit
description: "Load when the user asks for private agent interaction audits from local Codex/Claude Code traces, task profiles, tool-call decisions, collaboration bottlenecks, prompt/rule or automation-log audits, closeout retrospectives, or evidence-backed Skill/project-rule/Eval/SOP/OKF improvements."
license: MIT
metadata:
  source: "local-original"
---

# Agent Interaction Audit

Use this skill to audit recent human-agent collaboration for a repository across Codex and Claude Code traces, automation logs, and layered prompt/rule context.

The goal is not a status summary. The goal is a private, evidence-backed interaction audit: what the user has been asking for, how agent work has actually progressed, where the collaboration is getting stuck, whether tool-call decisions were reasonable, which prompt or project rules are stale or misleading, which scripts and tool SOPs should be preserved, which repeated agent mistakes should become guardrails, which project facts are repeatedly rediscovered from scratch, and which few changes would improve the next iterations.

If this skill is loaded, the answer must contain actual insights and recommendations, not just a timeline. A compliant report explains "so what": repeated request patterns, mismatch between user expectations and agent behavior, tool or Skill-selection decisions that created friction, and the highest-leverage changes for the next session.

Use layered evidence and confidence levels. Strong insights require confirmed, non-low-confidence interaction evidence with exact or strong repository affinity. Candidate traces, ordinary repo state, low-confidence evidence, or sparse samples can support only weak leads, unknowns, or next-instrumentation recommendations. Do not fabricate patterns to fill the report shape.

Default scope: last 30 days, current repository, Codex and Claude Code. User-level sessions and scheduled tasks are in scope only when their cwd, workspace, or automation config resolves inside the repository passed with `--repo`, or to another checkout of the same logical repository by Git remote, Git root, or package identity. Text mentions of the repository name, package, or remote do not pull an otherwise external run into scope. The user may override the window, repository, host roots, prompt roots, automation roots, or explicitly allow cross-repo collection.

Current executable capabilities:

- collect current-repo Codex and Claude Code events into a local JSONL ledger;
- collect repository state, prompt/rule context, and automation log evidence as separate source classes;
- record bounded skipped-scope samples in the manifest for out-of-scope session and automation debugging;
- classify evidence by relevance, repo affinity, confidence, evidence role, event type, and learning signals;
- build a private Markdown report, machine-readable improvement queue JSON, and optional `effective-interact` input;
- separate strong conclusions from weak leads, unknowns, and next-instrumentation gaps.

## Boundaries

- Default to read-only analysis. Do not edit project files, memory, schedules, tasks, remotes, PRs, or tracked docs.
- Read current-repo local evidence broadly. Sensitive local evidence may be used in the private report, but default collection must not cross into unrelated sessions or automations just because their text mentions this repository.
- Write report output to an ignored or outside-repo local path by default. Do not publish, push, post, or place raw evidence in tracked docs unless the user explicitly asks.
- Support Codex and Claude Code in v1. Treat other hosts as out of scope unless the user provides a trace export.
- Keep the skill portable. Do not assume optional host-specific files exist.
- Treat prompt/rule files and ordinary repo state as context by default. They can explain friction but should not be the sole basis for a strong bottleneck verdict.

## Workflow

1. Establish the audit window. Default to the last 30 days unless the user specifies another range.
2. Identify the repository: current path, project name, package metadata when present, and git remote when available.
3. Collect evidence with `scripts/collect-agent-interaction-events.mjs`. Include repo-local context, layered prompt/rule context, automation logs, and current-repo host traces. Keep source class, repo affinity, confidence, confirmed relevance, and candidate relevance separate.
4. Build a private report with `scripts/build-agent-interaction-report.mjs`.
5. Read both `agent-interaction-report.md` and `agent-interaction-improvement-queue.json` before answering. Do not rely on memory-only impressions.
6. For high-volume, multi-session, multi-case, or option-heavy audits, also generate an `effective-interact` input with `--effective-interact-input <input.json>` and use a validated HTML artifact as the presentation layer. `agent-interaction-audit` still owns the analysis.
7. Give the user the answer-first summary: collaboration health, top insights, top bottlenecks, top recommendations, improvement queue priorities, evidence limits, and questions that cannot be inferred.
8. If evidence is thin, label the result under-evidenced and still provide a small "next instrumentation" section: what trace source, task state, or handoff record would make the next audit sharper.

## Progressive Loading

- Read `references/data-sources.md` before deciding what evidence is in scope.
- Read `references/host-adapters.md` when host trace discovery, overrides, or missing directories matter.
- Read `references/analysis-rubric.md` before judging tool decisions, user expectations, project drift, or bottlenecks.
- Read `references/report-shape.md` before writing or revising a report.

## Default Commands

Collect events:

```bash
node skills/agent-interaction-audit/scripts/collect-agent-interaction-events.mjs --repo . --since 30d --hosts codex,claude-code --json
```

Collect with explicit nonstandard roots:

```bash
node skills/agent-interaction-audit/scripts/collect-agent-interaction-events.mjs --repo . --since 30d --prompt-root <path> --automation-root <path> --codex-root <path> --claude-root <path> --json
```

Explicit host and automation roots remain repo-scoped by default. Use `--include-cross-repo` only when the intended audit is deliberately cross-checkout or cross-repository.

Build the report:

```bash
node skills/agent-interaction-audit/scripts/build-agent-interaction-report.mjs --ledger <events.jsonl> --manifest <manifest.json> --json
```

This writes `agent-interaction-report.md` and `agent-interaction-improvement-queue.json` in the output directory. When evidence is strong and a target file is explicit, it may also write separate `patch-drafts/*.patch.md` draft artifacts. The Markdown report is for humans; the JSON queue is the authoritative machine-readable action queue.

For strict report + queue audits that should not create patch draft artifacts, add `--no-patch-drafts`:

```bash
node skills/agent-interaction-audit/scripts/build-agent-interaction-report.mjs --ledger <events.jsonl> --manifest <manifest.json> --no-patch-drafts --json
```

Build the report plus an `effective-interact` visual-report input:

```bash
node skills/agent-interaction-audit/scripts/build-agent-interaction-report.mjs --ledger <events.jsonl> --manifest <manifest.json> --effective-interact-input <agent-interaction-visual.input.json> --json
```

If the user supplies `--out`, choose an ignored local report directory. If no output path is supplied, the scripts use the operating-system temp directory.

## Report Contract

The report must include:

1. BLUF: whether recent collaboration appears healthy, mixed, blocked, or under-evidenced.
2. Evidence coverage: host roots, source classes, confidence, repo affinity, and missing-host limits.
3. Top 3 insights: behavior patterns or mismatches that explain why sessions felt productive, stuck, or generic. Each insight needs evidence IDs or an explicit under-evidenced label.
4. Top 3 bottlenecks with evidence IDs and impact on user time, trust, or delivery quality.
5. Top 3 recommendations that are precise enough to become follow-up work. Each recommendation must include the target change, expected effect, and the next validation signal.
6. Improvement queue summary: top queue items from `agent-interaction-improvement-queue.json`, sorted by expected future cost reduction after evidence gating.
7. Task profile: request types, task clusters, change trends, validation closure, and repeated needs.
8. Trace audit: tool calls, branch decisions, repeated failed tools, context drift, failures, and recoveries.
9. Prompt and rule audit: user-level, project-level, and local prompt context, plus stale, wrong, or misleading rules when evidence supports the claim.
10. User-friction patterns: wording, ambiguity, expectation mismatch, or repeated corrections that likely shaped agent behavior.
11. Project guidance garbage and drift: obsolete docs, contradictory instructions, misleading comments, stale local state, or noise that wasted agent time.
12. SOP and script lessons: shell, encoding, GitHub/PR/check-run, validation, and tool usage patterns worth preserving.
13. Repeated agent mistakes and guardrail candidates.
14. Knowledge cache candidates: project facts, code locations, procedures, or decisions repeatedly rediscovered from scratch.
15. Automation trace review: scheduled task logs, monitors, and recurring background failures.
16. Core positioning and drift risk, only when evidence supports it.
17. Unknowns: user preferences or expectations that cannot be inferred.

## Improvement Queue Contract

The queue is private and read-only by default. It must not mutate rules, memory, tasks, schedules, docs, or remotes. Queue items use primary categories for the intended destination and tags for the problem type.

V1 categories:

- `project-rule-candidate`
- `stale-info-removal-candidate`
- `sop-candidate`
- `knowledge-cache-candidate`
- `eval-case-candidate`

Each item must include stable `id`, `status`, `actionability`, `scope`, `targetDestination`, `summary`, `suggestedChange`, `executionLevel`, `patchDraftPath`, `evidenceIds`, `evidenceTier`, `sourceClasses`, `privacy`, `rawExcerptPolicy`, `confirmationPolicy`, `costRationale`, `expectedFutureCostReduction`, `risk`, `priority`, `validationSignal`, `counterEvidence`, and `rejectionReasons`.

Do not include long raw excerpts in queue items. Raw excerpts belong only in the local private report appendix. Findings without a concrete `validationSignal` stay in the report observations and do not become actionable queue items.

Patch drafts are optional level-2-plus artifacts, not applied changes. Generate a draft only when the item has strong evidence, status `new`, P0/P1 priority, an explicit target file under the audited repo, and a reversible change shape. Store the draft as a separate local `patch-drafts/<queue-id>.patch.md` artifact and leave `patchDraftPath: null` for weak, vague, or untargeted items.

## Output Quality Bar

- Bad: "The collaboration had some issues; improve communication."
- Good: "The repeated gap is not task execution but handoff visibility: three sessions ended with validation facts in logs but no durable report, so the user had to infer status. Add a mandatory handoff checkpoint after material repo changes and verify it with the next session's trace."
- Recommendations should be operational: change an existing Skill or project rule, add an Eval case, update an SOP or OKF page, run a validation command, ask a narrower intake question, or improve the native Host handoff.
- SOP recommendations should name one durable target: an existing Skill, project rule, validation script, SOP/runbook, Eval case, or OKF page.
- Knowledge-cache recommendations should cite repeated rediscovery evidence and should not write memory by default.
- Improvement queue items should be actionable enough for a later human-confirmed patch, eval case, SOP, or knowledge-cache update, but `agent-interaction-audit` must not apply them automatically. Patch drafts are review artifacts only.
- It is acceptable to return fewer than three strong insights or recommendations when evidence is thin. Label weak findings by evidence tier instead of padding the report.
- Use `effective-interact` for dense final reports when navigation, visual comparison, evidence coverage, trace clusters, or option tradeoffs would reduce human interpretation cost. Use it as the presentation layer only; `agent-interaction-audit` still owns the analysis and recommendations.
- When an `effective-interact` artifact is generated, validate it before handoff. If HTML is waived, unavailable, or the audit is thin enough for Markdown, say why.

## Gotchas

- Do not confuse this with `source-post`; that skill turns external sources into public source posts.
- Do not confuse this with `agent-introspection-debugging`; that skill diagnoses a single agent run or tool loop.
- Do not turn a weak candidate trace into a strong conclusion. Use candidate evidence for leads, not verdicts.
- Do not treat ordinary repo source files as interaction evidence. Repo state is context unless it is explicit task, decision, progress, handoff, or host trace state.
- If the user expectation is not recoverable from evidence, ask directly instead of inventing a preference.
