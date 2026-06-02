---
name: workflow-router
description: Load when a non-trivial request needs intent recognition before work starts; classify it into exactly one workflow owner, or ask a clarification; do not load for explicit owner-skill invocations, trivial chat, or execution steps already routed.
---

# Workflow Router

Classify the user's request into exactly one workflow owner before substantive work starts.

This skill owns intent recognition and handoff only. It does not implement, test, review, deliver work, or replace the selected owner.

## Owners

| State | Owner |
|---|---|
| question | `answer-workflow` |
| sdd-change | `sdd-workflow` |
| diagnosis | `diagnosis-workflow` |
| review | `review-workflow` |
| delivery | `delivery-workflow` |
| harness-hub-maintenance | `hub-maintenance-workflow` |

## Workflow

1. For a concrete request, run or mirror `scripts/workflow-check.mjs --prompt "<user request>" --json` before substantive work when a terminal is available.
2. Use `scripts/route-intent.mjs --prompt "<user request>" --json` when only classification is needed.
3. Use `scripts/skill-activation-check.mjs --prompt "<user request>" --json` for one helper skill trigger audit, or `scripts/skill-activation-check.mjs --cases-file "<cases.json>" --json` for a prompt matrix, positive and boundary helper coverage report, and excluded owner summary from installed `SKILL.md` metadata.
4. Use `scripts/owner-contract-check.mjs --state "<state>" --json` only when auditing whether the installed owner `SKILL.md` still contains required sections, ordered gates, and boundary phrases.
5. Use `scripts/helper-contract-check.mjs --json` only when auditing whether high-risk helper skills still carry explicit side-effect boundaries.
6. Read `references/intent-taxonomy.md` when the state is still not obvious.
7. Select exactly one owner, or ask one concise clarification.
8. Use `references/state-handoff.md` to hand off:
   - selected state
   - confidence
   - reason
   - owner
   - next gate
   - allowed helper skills
   - whether `effective-interact` is required
9. If subagents or hooks are relevant, point the owner to `references/orchestration-policy.md`.
10. Stop. The selected owner drives the work.

## Guardrails

- If the user explicitly names an owner skill, do not re-route unless the request conflicts with that owner.
- If the request is trivial chat, no owner is needed.
- If the request is ambiguous between mutation and review/question, ask or choose the safer non-mutating state.
- The router classifier, workflow check, skill activation check, owner contract check, and helper contract check are side-effect free. They never edit files, dispatch subagents, call tools, or start implementation.
- `effective-interact` is a reporting layer, not a workflow owner.
- Atomic skills such as `doc-coauthoring`, `internal-comms`, `claude-api`, `mcp-builder`, `skill-creator`, `design-taste-frontend`, `theme-factory`, and `slack-gif-creator` are helper skills. Include them in the handoff only when they match the selected owner's task.
- Hooks and subagents stay under `references/orchestration-policy.md`; the router never dispatches them.
