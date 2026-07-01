# LLM Wiki Schema

## Purpose

LLM Wiki is a persistent Markdown knowledge layer. Each useful reading pass should compile durable knowledge into stable pages so future agents read the wiki first instead of reconstructing everything from raw fragments.

## Three Layers

1. Raw sources
   - Source of truth.
   - Examples: source code, tests, README files, package metadata, specs, external links, current task state.
   - Never rewrite raw sources just to fit the wiki.
2. Wiki
   - Structured Markdown knowledge middle layer.
   - Stores stable summaries, relationships, contradictions, source indexes, and reusable judgments.
   - Must cite raw source paths or URLs for material claims.
3. Schema and agent rules
   - This file and `.harness-hub/context/AGENTS.md`.
   - Define naming, update protocol, contradiction handling, and lint rules.

## Stable Knowledge Boundary

Allowed:

- Product purpose and capability expectations.
- Architecture intent and subsystem responsibilities.
- Durable design principles and iteration rules.
- Accepted decision history that remains valid across tasks.
- Cross-source synthesis with citations.
- Good and bad cases that improve future judgment.

Avoid:

- Current implementation details that change with ordinary edits.
- Task progress, blockers, validation runs, and PR state.
- Content already loaded by the agent as native memory or root instructions.
- Raw source dumps, long quotes, copied docs, or large generated reports.
- Unverified guesses about APIs, config names, paths, or commands.

## Page Layout

- `wiki/index.md`: navigation and current stable map.
- `wiki/sources/`: source cards that point to raw material and record what was extracted.
- `wiki/concepts/`: durable concept pages.
- `wiki/topics/`: project topic summaries.
- `wiki/people/`: people, roles, and ownership notes when relevant.
- `wiki/templates/`: page templates.
- `wiki/contradictions.md`: conflicts, stale claims, and resolution status.
- `wiki/update-log.md`: human-confirmed wiki changes.

## Page Naming

- Use lowercase kebab-case filenames.
- Use one concept or topic per page.
- Prefer short titles that remain stable after implementation changes.
- Rename only when the old name would mislead future agents.

## Link Rules

- Use relative Markdown links so GitHub, editors, and Obsidian can all read the wiki.
- Link pages from `wiki/index.md` when they become useful navigation nodes.
- Link source records from pages that rely on them.

## Update Protocol

1. Source scan: list raw sources and existing wiki pages consulted.
2. Stability test: decide whether the knowledge is durable enough for the wiki.
3. Redundancy test: skip facts that are cheaper to read from source code or agent native memory.
4. Contradiction test: record conflicts before rewriting conclusions.
5. Human checkpoint: get confirmation before writing knowledge content.
6. File-level edit: change the smallest set of wiki files.
7. Audit: update `wiki/update-log.md` with source references, changed files, and confirmation evidence.
8. Validate: run the harness validation entrypoint.

## Contradictions

Record a contradiction when:

- Two raw sources disagree.
- Wiki knowledge conflicts with current code or tests.
- A durable decision is superseded but still appears in old pages.
- A repeated good or bad case changes the recommended rule.

Each contradiction entry must include source references, impact, proposed resolution, status, and owner or next action when known.

## Lint Rules

- Every non-placeholder concept or topic page should cite at least one raw source path or URL.
- `wiki/index.md` must link important concept and topic pages.
- `wiki/update-log.md` must mention human confirmation for write updates.
- `wiki/contradictions.md` must exist even when there are no open contradictions.
- The Obsidian profile must stay portable: no absolute paths, sync credentials, installed community plugins, or workspace-local state.
