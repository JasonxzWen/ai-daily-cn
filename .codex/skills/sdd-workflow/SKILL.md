---
name: sdd-workflow
description: Load when workflow-router selects the sdd-change state for feature, bug fix, refactor, product/spec change, or implementation work; run SDD-first lifecycle with embedded TDD.
---

# SDD Workflow

Use this owner for change work. SDD is the spine; TDD is embedded inside the accepted spec.

## Canonical Lifecycle

Do not start implementation until the user-visible gates are aligned.

1. **Align user need**: outcome, actor, pain, constraints, non-goals, and success target.
2. **Gather required material**: repo docs, code paths, existing source decisions, and referenced repos/blogs needed for the change.
3. **Write spec and acceptance**: target behavior, boundaries, acceptance criteria, verification strategy, and open questions.
4. **Write executable plan and align**: file targets, task order, tests, cleanup list, subagent use, hook checks, and validation commands.
5. **Clean unneeded files**: delete, demote, archive, or retain only after ownership and safety are clear.
6. **Implement**: make the smallest scoped change that satisfies the accepted spec.
7. **Test and accept**: run agreed unit, integration, E2E, or deterministic checks.
8. **Deliver report**: use `effective-interact` for material work, with changes, evidence, validation, risks, and next actions.

During implementation, update the active task's `Spec updates` only for decision-level changes that alter assumptions, acceptance criteria, allowed paths, validation commands, user-visible behavior, or risk. Do not turn it into a progress log; progress belongs in the harness progress file when a repo harness is active.

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
- Native goal/story workflows only when the user explicitly asks for repeated execution; do not start autonomous repeated execution without approval.
- `effective-interact` for alignment and handoff artifacts.

## Subagents

Use subagents only for independent source gathering, docs lookup, review, verification, or disjoint write scopes. Follow `workflow-router/references/orchestration-policy.md`: the main agent owns final synthesis and user-facing conclusions, and hooks stay advisory until separately approved.
