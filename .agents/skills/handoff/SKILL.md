---
name: handoff
description: Load when a task needs to hand off current work, compact a conversation for another agent/session, or create restart notes; do not load for visual HTML repo reports.
argument-hint: "What will the next session be used for?"
license: MIT
metadata:
  source: "mattpocock/skills skills/productivity/handoff"
  upstream_commit: "e9fcdf95b402d360f90f1db8d776d5dd450f9234"
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
- Do not commit, push, publish, or mutate remote state while creating the handoff.

Use `effective-interact` instead when the user asks for a visual final report, material repo-change handoff, review artifact, or HTML artifact. Context compaction remains a native Host/main-Agent decision; this Skill only writes restart notes.
