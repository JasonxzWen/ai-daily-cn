---
name: to-tickets
description: Load when an accepted specification must be decomposed into dependency-aware, project-owned implementation slices without creating a new tracker or publishing remote issues by default.
license: MIT
metadata:
  source: "mattpocock/skills skills/engineering/to-tickets"
  upstream_commit: "e9fcdf95b402d360f90f1db8d776d5dd450f9234"
---

# To Tickets

Convert an accepted specification into the fewest independently verifiable execution slices the project can actually own. This Skill decomposes work; it does not become a task tracker, scheduler, or implementation workflow.

## Choose The Existing Owner

Write into the existing project task, issue, or plan convention when one exists and the user authorized local mutation. If no durable project convention exists, use the existing `.harness-hub/state/current-task.md` as the local fallback when available.

If neither exists, return the proposed decomposition to the main Agent without creating a storage system. Do not create `.harness-hub/tasks/`, a new registry, or hidden run state.

Remote publication requires explicit authorization. Do not create, label, assign, comment on, or close remote issues merely because a decomposition is ready.

## Decompose Vertically

Start with one vertical tracer-bullet that crosses the real user or caller path and proves the architecture. Each subsequent slice must deliver observable behavior or unlock a named dependent slice.

For every slice record:

- outcome and accepted spec anchors
- included behavior and explicit non-goals
- touched public seam or integration path
- deterministic acceptance evidence
- blocking edges to other slices
- risks or decisions that prevent safe execution

Avoid layer tickets such as “build database,” “build API,” and “build UI” when none is independently useful or verifiable.

## Order By Dependency

Build only the dependency graph needed for execution. The current frontier is the set of slices whose blocking edges are already resolved. Prefer a wide frontier of independent slices after the tracer bullet rather than a false serial chain.

Use expand/contract only when a broad refactor genuinely requires a compatibility window; otherwise change the direct path once. Do not invent adapters or migration stages for hypothetical consumers.

## Handoff

Return:

```text
TRACER BULLET
- smallest end-to-end proof

CURRENT FRONTIER
- independently executable slices

WAITING
- slice -> unresolved blocking edge

ACCEPTANCE
- exact project-defined evidence per slice
```

The main Agent owns slice implementation, integration, and user reporting. Native Subagents may perform only bounded, independent, read-only investigation, review, or verification under the Host and project contracts.
