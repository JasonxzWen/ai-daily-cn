# Agent Context Pack

This pack provides a durable LLM Wiki for stable project knowledge.

The wiki is a middle layer between raw sources and agent startup rules:

- Raw sources are the authority: code, tests, README files, specs, issues, release notes, external sources, and current task state.
- Wiki pages are maintained Markdown summaries that reduce repeated discovery and token cost.
- Schema and agent rules explain how to organize, update, and lint the wiki.

The default vault lives at `.harness-hub/context/wiki/`. Open that folder in Obsidian when visual navigation is useful. The `.obsidian/` profile inside the vault is portable configuration only; it does not include complete local app state, sync credentials, community plugins, or personal workspace history.

## What Belongs Here

- Durable product and architecture intent.
- Stable project vocabulary and concept relationships.
- Long-lived iteration rules and review heuristics.
- Source indexes that point back to raw material without copying it.
- Contradictions, stale facts, rejected interpretations, and good or bad cases worth reusing.

## What Stays Out

- Current task progress, validation evidence, blockers, and handoff. Use `.harness-hub/state/`.
- Full raw source copies or long excerpts.
- Implementation facts that are cheaper and safer to read directly from code.
- Private credentials, tokens, local paths, or host-specific state.
- Personal preferences already captured by the coding agent's native memory.

## Update Flow

1. Read raw sources first.
2. Read existing wiki pages and contradiction records.
3. Propose a file-level update plan.
4. Write only after human confirmation.
5. Update `wiki/update-log.md`, and update `wiki/index.md` or `wiki/contradictions.md` when needed.
6. Run `node scripts/harness-validate.mjs` or `harness-hub validate-harness . --json`.
