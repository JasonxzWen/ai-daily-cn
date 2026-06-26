---
name: insight
description: "Load when the user asks for a repository interaction insight audit, cross-session Codex or Claude Code work trace review, agent task profile, tool-call decision audit, or project collaboration bottleneck analysis; do not load for public source-backed insight blog posts, single-run agent failure debugging, or ordinary summaries."
license: MIT
metadata:
  source: "local-original"
---

# Insight

Use this skill to audit recent human-agent collaboration for the current repository across Codex and Claude Code traces.

The goal is not a status summary. The goal is a private, evidence-backed interaction audit: what the user has been asking for, how agent work has actually progressed, where the collaboration is getting stuck, whether tool-call decisions were reasonable, and which few changes would improve the next iterations.

## Boundaries

- Default to read-only analysis. Do not edit project files, memory, schedules, tasks, remotes, PRs, or tracked docs.
- Read project-related local evidence broadly. Sensitive local evidence may be used in the private report.
- Write report output to an ignored or outside-repo local path by default. Do not publish, push, post, or place raw evidence in tracked docs unless the user explicitly asks.
- Support Codex and Claude Code in v1. Treat other hosts as out of scope unless the user provides a trace export.
- Keep the skill portable. Do not assume Harness Hub files exist in the target repository.

## Workflow

1. Establish the audit window. Default to the last 30 days unless the user specifies another range.
2. Identify the repository: current path, project name, package metadata when present, and git remote when available.
3. Collect evidence with `scripts/collect-insight-events.mjs`. Include repo-local context and project-related host traces. Keep source class, repo affinity, confidence, confirmed relevance, and candidate relevance separate.
4. Build a private report with `scripts/build-insight-report.mjs`.
5. Read the report before answering. Do not rely on memory-only impressions.
6. Give the user the answer-first summary: collaboration health, top bottlenecks, top recommendations, evidence limits, and questions that cannot be inferred.

## Progressive Loading

- Read `references/data-sources.md` before deciding what evidence is in scope.
- Read `references/host-adapters.md` when host trace discovery, overrides, or missing directories matter.
- Read `references/analysis-rubric.md` before judging tool decisions, user expectations, project drift, or bottlenecks.
- Read `references/report-shape.md` before writing or revising a report.

## Default Commands

Collect events:

```bash
node skills/insight/scripts/collect-insight-events.mjs --repo . --since 30d --hosts codex,claude-code --json
```

Build the report:

```bash
node skills/insight/scripts/build-insight-report.mjs --ledger <events.jsonl> --manifest <manifest.json> --json
```

If the user supplies `--out`, choose an ignored local report directory. If no output path is supplied, the scripts use the operating-system temp directory.

## Report Contract

The report must include:

1. BLUF: whether recent collaboration appears healthy, mixed, blocked, or under-evidenced.
2. Evidence coverage: host roots, source classes, confidence, repo affinity, and missing-host limits.
3. Top 3 bottlenecks with evidence IDs.
4. Top 3 recommendations that are precise enough to become follow-up work.
5. Task profile: request types, task clusters, change trends, validation closure, and repeated needs.
6. Trace audit: tool calls, branch decisions, repeated failed tools, context drift, failures, and recoveries.
7. Core positioning and drift risk, only when evidence supports it.
8. Unknowns: user preferences or expectations that cannot be inferred.

## Gotchas

- Do not confuse this with `source-to-insight-blog`; that skill turns external sources into public insight posts.
- Do not confuse this with `agent-introspection-debugging`; that skill diagnoses a single agent run or tool loop.
- Do not turn a weak candidate trace into a strong conclusion. Use candidate evidence for leads, not verdicts.
- Do not treat ordinary repo source files as interaction evidence. Repo state is context unless it is explicit task, decision, progress, handoff, or host trace state.
- If the user expectation is not recoverable from evidence, ask directly instead of inventing a preference.
