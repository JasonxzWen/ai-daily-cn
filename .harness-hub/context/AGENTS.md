# LLM Wiki Agent Rules

This directory defines the project context pack. It is not a second README, not a raw-source mirror, and not a replacement for code search or the agent's native memory.

## Read Order

1. Read `.harness-hub/context/README.md` for the context pack boundary.
2. Read `.harness-hub/context/llm-wiki-schema.md` before writing or reorganizing wiki pages.
3. Read `.harness-hub/context/wiki/index.md` before answering broad project questions that depend on durable project context.
4. Return to raw sources when the wiki cites them, looks stale, or conflicts with code, README files, tests, or current task state.

## No Redundant Facts

- Do not copy implementation details that are already discoverable from source code, tests, package metadata, or generated docs.
- Do not store active task progress here. Use `.harness-hub/state/` for active task status, validation, decisions, and handoff.
- Do not store personal preferences that Codex, Claude Code, or another host already maintains in its native memory.
- Store stable project knowledge: design principles, product expectations, architecture intent, iteration rules, accepted durable decisions, recurring good or bad cases, and contradiction records.

## Update Rule

All wiki writes require human confirmation. A chat confirmation is enough only when the agent records what changed in the managed state or wiki update log.

Before writing:

1. Name the raw sources consulted.
2. Name the wiki files that will change.
3. State whether the update is stable knowledge, a contradiction, or a source index update.
4. Ask for confirmation when the write changes knowledge content.

After writing:

1. Update `.harness-hub/context/wiki/update-log.md`.
2. Update `.harness-hub/context/wiki/index.md` when a page is added, renamed, or materially reframed.
3. Update `.harness-hub/context/wiki/contradictions.md` when sources disagree or current code invalidates old knowledge.
4. Update `.harness-hub/state/decisions.md` when the change is decision-level governance, not just wiki maintenance.

## Raw Sources And Contradiction Register

Raw sources are the fact authority. The Contradiction Register is the audit trail for conflicts between raw sources, wiki pages, and current implementation.

## Conflict Rule

Facts First: raw sources win over wiki pages. If raw sources and wiki content disagree, do not silently choose one. Record the conflict in the contradiction register, cite the source paths or URLs, and propose the smallest update.
