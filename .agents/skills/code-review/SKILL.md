---
name: code-review
description: Load when a task needs a deep, report-only review across independent Standards and Spec axes, using bounded read-only native Subagents when available and adding risk lenses only when the diff warrants them.
license: "MIT notices in LICENSE.txt and LICENSE.everyinc.txt"
metadata:
  source: "EveryInc/compound-engineering-plugin ce-code-review; mattpocock/skills skills/engineering/code-review"
  compound_upstream_commit: "d090bde0ff1bbc33ec3c3b2049cb4687e9d76532"
  matt_upstream_commit: "e9fcdf95b402d360f90f1db8d776d5dd450f9234"
---

# Code Review

Use this Skill for a substantive pre-delivery review. It reviews the current change; it does not own implementation, verification, Git delivery, or remote state.

## Establish Scope

Resolve a credible base, changed and untracked files, the accepted spec or task contract, relevant project instructions, and nearby tests. Do not switch a shared checkout. If intent or base cannot be established from repository facts, report the missing evidence instead of reviewing an invented diff.

## Two Required Axes

Review these independently so one kind of evidence does not mask the other:

### Standards axis

- repository instructions and local conventions
- correctness, robustness, observability, and error handling
- test value and public-behavior coverage
- maintainability, unnecessary complexity, and duplication

### Spec axis

- every accepted behavior and non-goal
- edge cases, ownership, authorization, and data boundaries
- whether implementation and tests demonstrate the requested outcome
- contradictions between the diff, current implementation, and durable docs

When the Host supports native parallel work, dispatch both axes as bounded, independent, read-only native Subagents. Give each the same base, diff, intent, and evidence boundary. Subagents do not edit, commit, publish, decide user tradeoffs, or own the final verdict. The main Agent integrates and deduplicates their evidence.

If native Subagents are unavailable or the diff is tiny, the main Agent applies both axes directly. Do not create a Harness Hub Agent fallback, adapter, fixed persona, or scheduler.

## Conditional Risk Lenses

Add only lenses justified by the touched surface:

- security and privacy
- API or compatibility contract
- data/schema migration and rollback
- concurrency, reliability, or performance
- frontend race, accessibility, or state behavior

Use the narrow domain Skill where appropriate, such as `security-review` or `ponytail`. Do not multiply reviewers without independent evidence value.

## Findings

Report only actionable, evidence-backed findings. For each finding include:

- `P0`–`P3` severity
- confidence: high, medium, or low
- exact file and tight line anchor
- violated behavior, rule, or invariant
- concrete failure mode and evidence
- smallest credible correction and required verification

Suppress style preferences, speculative cleanup, and pre-existing issues unrelated to the diff. Distinguish missing evidence from evidence of failure.

Deterministic failures remain failures and cannot be overridden by an Agent verdict.

## Result

Sort findings by severity, then confidence. State which axes/lenses ran, unresolved evidence, and one verdict: `Ready`, `Ready with fixes`, or `Not ready`.

Report only. Do not edit files. Do not commit, push, create a pull request, merge, file an issue, or mutate any external system. The main Agent decides what to fix and owns the final user report.

## Source Notes

This is a reduced fusion of the MIT-licensed review concepts from `EveryInc/compound-engineering-plugin` and `mattpocock/skills skills/engineering/code-review`. It keeps independent evidence axes, severity/confidence, and conditional risk review while removing owner routing, autofix modes, personas, and a review control plane.
