---
name: doc-coauthoring
description: Load when a workflow-router-selected owner workflow needs to collaboratively draft, restructure, or reader-test docs, PRDs, RFCs, proposals, specs, or decision records; skip implementation itself.
license: MIT
metadata:
  source: "local-original; Anthropic doc-coauthoring was reviewed but not copied because the refreshed upstream directory had no per-skill license file."
---

# Doc Coauthoring

Use this skill to help a user turn rough context into a document that works for its intended readers.

## Workflow

1. Establish the document contract: doc type, audience, desired decision or action, constraints, deadline, and existing template.
2. Gather context before drafting. Ask only for missing facts that change structure, claims, or acceptance.
3. Propose a short outline with section intent, not polished prose.
4. Draft in passes: structure first, then claims and evidence, then wording.
5. Maintain an assumptions and open-questions list while drafting.
6. Reader-test before handoff: check whether a fresh reader can identify the decision, rationale, tradeoffs, owner, next action, and evidence.
7. Deliver the final doc plus unresolved questions and suggested review focus.

## Boundaries

- Use `sdd-workflow` or `product-capability` when the doc is an implementation spec that must drive code changes.
- Use `internal-comms` for status reports, newsletters, incident updates, FAQs, or leadership updates.
- Use `answer-workflow` for read-only explanations that do not need a durable document.
- Do not invent facts, metrics, commitments, dates, owners, or approvals.
