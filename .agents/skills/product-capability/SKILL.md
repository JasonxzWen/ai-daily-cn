---
name: product-capability
description: Load when accepted product intent must become a concise, implementation-ready local capability specification with explicit constraints, non-goals, test seams, and unresolved decisions.
license: MIT
metadata:
  source: "Harness Hub; mattpocock/skills skills/engineering/to-spec"
  upstream_commit: "e9fcdf95b402d360f90f1db8d776d5dd450f9234"
---

# Product Capability

Turn accepted product intent into a local engineering contract. This Skill specifies one capability; it does not own implementation, ticketing, or delivery.

Use `grill-me` first when consequential decisions remain. Use `grill-with-docs` when this work creates or changes a durable specification so the same decision graph is reconciled with repository evidence.

## Inputs

Read only relevant sources:

- accepted source facts from the user, current task, issues, PRDs, or roadmap notes
- existing behavior, tests, schemas, interfaces, and durable docs
- project instructions and ownership/security/rollout constraints

Do not invent product truth. Label an inference or unresolved decision instead of smoothing over missing evidence.

## Specification

Write the smallest artifact that makes implementation unambiguous:

```text
CAPABILITY
- actor, new behavior, and observable outcome

ACCEPTED SOURCE FACTS
- source anchor and fact

CONSTRAINTS
- invariants, ownership, trust, lifecycle, failure, migration, and rollout rules

INTERFACES
- inputs, outputs, states, errors, side effects, and compatibility boundaries

TEST SEAMS
- public behaviors and deterministic evidence that will prove acceptance

OUT OF SCOPE
- explicit non-goals and rejected expansion

OPEN DECISIONS
- unresolved choices that can still change implementation or acceptance

HANDOFF
- ready for implementation, needs alignment, or needs focused design review
```

Prefer updating the project's existing canonical spec or planning location. Do not create a new planning stack when the repository already owns one.

## Quality Gate

The result is ready only when:

- every required behavior traces to accepted source facts
- boundaries and failure behavior are explicit
- test seams demonstrate user/caller-visible outcomes rather than private structure
- non-goals prevent likely scope drift
- contradictions with current implementation are surfaced
- a competent implementer can proceed without rediscovering hidden product decisions

Use `to-tickets` only when the accepted spec needs project-owned execution slices. Do not publish an issue, apply a label, or mutate a remote tracker from this Skill.
