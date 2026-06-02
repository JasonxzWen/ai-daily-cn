---
name: answer-workflow
description: Load when workflow-router selects the question state for read-only explanation, evidence lookup, feasibility, or comparison; answer from evidence and do not edit files unless rerouted.
---

# Answer Workflow

Use this owner for read-only answers.

## Contract

1. Clarify the exact question only when needed.
2. Gather required material from the repo, docs, cited sources, or current official docs when the fact may have changed.
3. Answer directly with evidence and concrete dates/paths when relevant.
4. Do not edit files, run mutating commands, or start implementation unless the user redirects into `sdd-workflow`.
5. Default-consider `effective-interact` when a visual comparison, source map, evidence dashboard, or final handoff lowers interaction cost; route pressure testing to `grill-me` or review owner first.

## Helper Atoms

- Use `claude-api` only for read-only Anthropic API or SDK questions that require provider-specific current docs.
- Use `doc-coauthoring` when the answer should become a durable proposal, RFC, PRD, spec, or decision record.
- Use `internal-comms` when the output is an internal update, FAQ, incident note, or leadership summary.

## Output

- Put the direct conclusion first.
- Separate fact, inference, and assumption when uncertainty matters.
- Mention residual gaps and how to verify them.
- For material repo explanations, include file anchors or an `effective-interact` report.
