---
name: review-workflow
description: Load when workflow-router selects the review state for code, plan, release, UI, or security review; produce findings first and do not implement fixes unless the user explicitly redirects.
---

# Review Workflow

Use this owner for review-only work.

## Contract

1. Confirm the review scope and artifact under review.
2. Gather required material: diffs, specs, tests, release notes, UI screenshots, or security-sensitive paths.
3. Report Findings first, ordered by severity and grounded in file/line or source evidence.
4. Do not implement fixes unless the user explicitly redirects into `sdd-workflow`.
5. Default-consider `effective-interact` for material reviews, severity filters, option comparison, or evidence tours.

## Helpers

- `compound-code-review` for deep pre-PR or CE-style code review.
- `security-review` for focused security-sensitive review.
- `claude-api` for Anthropic API or SDK reviews.
- `mcp-builder` for MCP server or tool-contract reviews.
- `doc-coauthoring` for document structure and reader-risk review.
- `internal-comms` for internal update, FAQ, incident, or leadership communication review.
- `theme-factory` for theme consistency review of existing artifacts.
- `web-design-guidelines` for UI/UX audits only when that helper is relevant and available.
- `verification-loop` only for final command gates, not finding analysis.

For parallel review lenses, follow `workflow-router/references/orchestration-policy.md`: subagents can run independent read-only passes, but the main agent owns severity, synthesis, and final conclusions.

Use agentic loops from `workflow-router/references/agentic-loops.md` for material reviews: delegated-agent lenses may act as verifiers, a read-only arbiter deduplicates and ranks evidence, and the main agent owns the final findings-first report.

## Output

Findings first. Then open questions, residual risk, and a short summary if useful.

Do not implement fixes inside this workflow.
