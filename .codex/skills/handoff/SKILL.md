---
name: handoff
description: Load when a workflow-router-selected owner workflow needs to hand off current work, compact a conversation for another agent/session, or create restart notes; do not load for visual HTML repo reports.
license: MIT
metadata:
  source: "mattpocock/skills skills/productivity/handoff"
  upstream_commit: "d54c497aa94400a496d3f2c38be10fa5f284c5a9"
---

# Handoff

## Purpose

Write a concise handoff document so a fresh agent or later session can continue from verified facts instead of replaying chat history.

Save the document to the operating system temp directory, not the current workspace:

- Windows: `$env:TEMP`
- macOS/Linux: `$TMPDIR` when set, otherwise `/tmp`

Use a filename like `agent-handoff-YYYYMMDD-HHmm-<slug>.md`.

## Workflow

1. Identify the next-session focus from the user's request. If they gave arguments, treat them as the handoff focus.
2. Inspect current repo state only when it affects the handoff: branch, changed files, relevant artifacts, and recent validation results.
3. Write the temp Markdown document.
4. Link the created file in the response and summarize the restart path in one or two sentences.

## Document Contract

Include only sections that add useful restart context:

- Goal and current status.
- Verified facts and evidence paths.
- Decisions already made.
- Files changed or likely relevant.
- Commands run and results.
- Open questions, risks, and blockers.
- Suggested skills for the next agent.
- Next concrete actions.

Reference existing PRDs, plans, ADRs, issues, commits, diffs, reports, or HTML artifacts by path or URL instead of duplicating them.

## Safety

- Redact secrets, credentials, tokens, passwords, and personally identifiable information.
- Do not include hidden reasoning or private chain-of-thought.
- Label assumptions as assumptions.
- Do not write to the repo unless the user explicitly asks for a durable repository handoff.

Use `effective-interact` instead when the user asks for a visual final report, material repo-change handoff, review artifact, or HTML artifact. Use `strategic-compact` when the question is whether to compact context, not when the user needs restart notes.