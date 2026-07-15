---
name: grill-me
description: Load when beginning every repository mutation task to run one dependency-layered batch interview; a fully aligned task takes the zero-question path, while durable documentation work uses grill-with-docs to reuse the same decision graph.
license: MIT
metadata:
  source: "mattpocock/skills skills/productivity/grill-me and skills/productivity/grilling"
  upstream_commit: "e9fcdf95b402d360f90f1db8d776d5dd450f9234"
---

# Grill Me

## Purpose

Run one compact alignment pass before changing a repository. Surface only unresolved decisions that can change the work, arrange them by dependency, and minimize user interruption.

This is an atomic prompt capability for the native Host main Agent. It is not a workflow owner, implementation phase, state machine, or permission grant.

## Activation

Run once per mutation task, not once per file, edit, or tool call.

If the task creates or materially changes durable project contracts, OKF knowledge, specifications, ADRs, architecture/API/design documents, load `grill-with-docs`; it loads and applies this protocol through one shared graph, so do not conduct a second interview. Temporary `.harness-hub/state/` maintenance alone does not qualify.

Explicit `grill me` requests still use this skill. Read-only explanation or status work does not require it unless it turns into a mutation task.

## Alignment Protocol

1. Restate the intended outcome, allowed scope, non-goals, and acceptance evidence.
2. If a fact can be learned locally, inspect the repository first instead of asking the user.
3. Separate facts, accepted decisions, reasonable reversible assumptions, and unresolved decisions.
4. Ask only about decisions that can change behavior, ownership, safety, material cost, remote state, or acceptance criteria.
5. Build a lightweight dependency graph for those unresolved decisions.
6. Ask every unresolved decision whose complete row—question, options, recommendation, rationale, tradeoff, and downstream impact—can be stated without another open answer.
7. Defer a decision when any part of that row depends on an unresolved answer.
8. Apply the user's answers, prune invalid branches, recompute the current frontier, and repeat only while a consequential decision remains.

If no unresolved decision can change the next action, ask zero questions, state that alignment is complete, and continue with the user's authorized work.

Never infer that silence means acceptance. Facts are for the Agent to investigate; decisions with meaningful user-visible consequences remain with the user.

## Batch Format

Present the current dependency frontier in one table:

| ID | Decision question | Options | Recommended | Why / tradeoff | Downstream impact | Answer |
|---|---|---|---|---|---|---|
| D1 | A decision that is answerable now | A / B / C | A | Why A is the best default and its cost | What this unlocks, constrains, or prunes | Pending |

Every row must include a recommended default, short rationale, main tradeoff, and likely downstream consequence. Keep options mutually exclusive. Do not impose an arbitrary batch-size cap. Group a large frontier by theme or priority without serializing independent questions across turns.

Show dependency-bound topics only as a waiting list:

| Deferred topic | Prerequisite | Why it waits |
|---|---|---|
| Cache authority | D1 source choice | Valid options depend on the authoritative source |

Do not finalize the wording or options for a deferred question until its prerequisite is resolved.

Invite one compact reply, for example:

```text
D1: choose A
D2: accept recommendation
D3: pause until <condition>
```

The user may say `accept this batch`, answer in prose, or use `default`, `defaults`, and `defer`. Do not silently apply a recommendation to an unanswered row.

Treat `pause until ...` as an explicit deferral. Record its reason and re-entry condition, and omit it from later batches until that condition becomes true or the user explicitly reopens it. The same lifecycle applies to the `defer` alias.

After each reply, show only the useful resolution summary:

| ID | Decision | Consequence | Status |
|---|---|---|---|
| D1 | Accepted choice | What it resolved, unlocked, or pruned | Resolved |

Batching is the default. If the user explicitly asks for one question at a time, honor that request without changing the dependency or evidence rules.

## Boundaries And Handoff

- Do not ask vague preference questions when repository evidence or a reversible default is enough.
- Do not create a run ledger, retry counter, workflow, hook, or hidden state.
- Do not expand authorization. Remote writes, destructive work, security boundaries, and data ownership still require their normal authority.
- Do not start implementation unless the user explicitly asks you to continue into execution.

When stopping, return decisions made, assumptions used, deferred questions and their prerequisites, the next authorized action, and verification criteria for the next step.
