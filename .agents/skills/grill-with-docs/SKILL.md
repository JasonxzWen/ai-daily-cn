---
name: grill-with-docs
description: Load when a repository mutation creates or materially changes durable project contracts, OKF knowledge, specs, ADRs, or architecture/API/design documents; run a source-backed alignment pass that reuses grill-me's dependency-frontier batch protocol.
argument-hint: "<goal-or-draft>"
user-invocable: true
license: MIT
metadata:
  source: "mattpocock/skills skills/engineering/grill-with-docs and skills/engineering/domain-modeling"
  upstream_commit: "e9fcdf95b402d360f90f1db8d776d5dd450f9234"
---

# Grill With Docs

Use this as an atomic requirements skill called directly by the native Host main Agent. It adds durable-document evidence and consistency checks to `grill-me`; it is not a second interview or a documentation workflow.

## Scope

Use it when the mutation's input or expected output includes durable project contracts, `knowledge/`, specifications, ADRs, or architecture/API/design documents; temporary `.harness-hub/state/` maintenance alone does not trigger this skill.

Load and apply `grill-me`. Build one shared unresolved-decision graph and ask the current dependency frontier in one batch. Preserve its zero-question path, recommendations, pause/defer behavior, authorization boundaries, and stopping rule.

## Evidence Pass

Before asking:

1. Read the active task state, relevant implementation and tests, and `knowledge/index.md` when present.
2. Follow only relevant OKF links and their repository source anchors.
3. Separate accepted facts, user decisions, inferences, contradictions, vocabulary conflicts, and open questions.
4. Test important terms with concrete boundary scenarios and compare the proposed documentation with actual code behavior.
5. Add only consequential document conflicts or durable decisions to the shared graph.

Continue autonomously on local reversible details already covered by the project contract. Do not invent a question solely to prove that an interview occurred.

## Write Boundary

Do not edit knowledge or specifications during the interview. After alignment, let the main Agent update durable documents once, deduplicate facts, synchronize links/index/log where required, and run the project's deterministic validators.

Create an ADR or new knowledge page only when an existing canonical owner cannot carry the durable decision. Create no empty taxonomy or chat-derived project truth.

Return constraints, accepted details, contradictions, open questions, and source anchors to the main Agent. If nothing durable changed, say so and keep documents byte-for-byte unchanged; the project contract owns the write and deterministic OKF validation.

Read `references/domain-modeling.md` when the request changes vocabulary, concept relationships, or knowledge structure.
