---
name: sdd-workflow
description: Load when workflow-router selects the sdd-change state for feature, bug fix, refactor, product/spec change, or implementation work; run SDD-first lifecycle with embedded TDD.
---

# SDD Workflow

Use this owner for change work. SDD is the spine; TDD is embedded inside the accepted spec.

## Canonical Lifecycle

Do not start implementation until the user-visible gates are aligned.

1. **Align user need**: outcome, actor, pain, constraints, non-goals, and success target.
2. **Gather required material and explore directions**: repo docs, code paths, existing source decisions, referenced repos/blogs, and 2-3 viable directions from evidence. Recommend one and record rejected alternatives. Use `grill-me` for pressure questions, `prototype` for disposable proof, and `product-capability` for implementation constraints when useful. Do not require a standalone brainstorming skill.
3. **Write spec and acceptance**: target behavior, boundaries, acceptance criteria, verification strategy, and open questions.
4. **Write executable plan and align**: file targets, task order, tests, cleanup list, subagent use, hook checks, and validation commands.
5. **Clean unneeded files**: delete, demote, archive, or retain only after ownership and safety are clear.
6. **Implement**: make the smallest scoped change that satisfies the accepted spec.
7. **Test and accept**: run agreed unit, integration, E2E, or deterministic checks.
8. **Finish closeout**: after tests pass or residual risk is known, run a final independent review pass when material, drive requested PR work to merge-ready or explicitly authorized merge completion, and run or explicitly skip `insight` to audit tool-calling quality, workflow drift, and skill/workflow improvement candidates.
9. **Deliver report**: use `effective-interact` for material work, with changes, evidence, final review outcome, insight recommendations, validation, risks, and next actions.

During implementation, update the active task's `Spec updates` only for decision-level changes that alter assumptions, acceptance criteria, allowed paths, validation commands, user-visible behavior, or risk. Do not turn it into a progress log; progress belongs in the harness progress file when a repo harness is active.

## Repo Harness State

When `.harness-hub/state/` exists, persist the plan before implementation instead of relying on chat memory:

- `current-task.md`: goal, assumptions, non-goals, allowed paths, forbidden paths, discovery/brainstorming, target spec, P0/P1/P2 test matrix, validation commands, open questions, alignment status, and checkpoint policy.
- `decisions.md`: accepted direction, rationale, rejected alternatives, and any decision-level changes.
- `progress.md`: current phase, completed work, validation records, runtime signals, blockers, PR status, and checkpoint commit state.
- `session-handoff.md`: restart status, changed files, validation evidence, final review, insight recommendations, residual risk, and next action before ending the session.

Ask only blocking open questions before implementation. A blocking question is one whose answer changes user-visible behavior, safety, data ownership, compatibility, cost, release/rollback behavior, external side effects, allowed paths, or acceptance criteria.

## TDD

- Write or identify the failing test before implementation when behavior is testable.
- If a direct test is not practical, define the deterministic substitute before implementation.
- Keep test scope tied to the accepted spec; do not add speculative coverage.

## Helper Skills

Use helpers only under this owner:

- `product-capability` for implementation-ready constraints.
- `doc-coauthoring` for PRDs, RFCs, proposals, specs, or decision records that need collaborative drafting before implementation.
- `tdd-workflow` for test-first implementation detail.
- `claude-api` for Anthropic API or SDK changes; verify current provider docs before writing code.
- `mcp-builder` for MCP server, tool schema, resource, prompt, or evaluation work.
- `skill-creator` for standard skill creation or adaptation inside a change.
- `theme-factory` when an accepted artifact needs visual theming; use `frontend-design` for production UI.
- `slack-gif-creator` only for explicit Slack GIF deliverables.
- `e2e-testing` when user-visible flows require durable browser checks.
- `verification-loop` before delivery.
- `insight` during finish closeout when material work should be audited for tool-calling quality, repeated manual corrections, doc/code conflicts, AI infrastructure lessons, or possible skill/workflow extraction.
- Native goal/story workflows only when the user explicitly asks for repeated execution; do not start autonomous repeated execution without approval.
- `effective-interact` for alignment and handoff artifacts.

## Agentic Loops

Use host-neutral agentic loops from `workflow-router/references/agentic-loops.md` when context isolation or arbitration reduces risk:

- `plan-review` before implementation for material plans, especially architecture, data, workflow, or UI changes.
- `test-design` before implementation when P0/P1/P2 coverage or deterministic substitutes are uncertain.
- `implementation-review` after a behavior slice when a delegated-agent or independent review can inspect technical debt, first-principles fit, test gaps, and rule drift.
- `frontend-acceptance` when Web UI work needs fresh-context browser evidence and a separate acceptance arbiter.
- `docs-consistency` during closeout when workflow, public behavior, templates, tests, and docs/code drift matter.

Record planned loops in `current-task.md` and actual loop evidence in `progress.md`. The main agent owns final synthesis and user-facing decisions.

## Subagents

Use subagents only for independent source gathering, docs lookup, review, verification, or disjoint write scopes. Follow `workflow-router/references/orchestration-policy.md`: the main agent owns final synthesis and user-facing conclusions, and hooks stay advisory until separately approved.

During finish closeout, prefer a subagent or independent review pass for material changes when the scope is read-only and independent. The review should look for technical debt, first-principles implementation fit, drift from project rules, and refactor or warning recommendations. Do not hide review findings, PR conflicts, merge risks, or insight recommendations from the user.
