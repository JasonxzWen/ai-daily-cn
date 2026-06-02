---
name: diagnosis-workflow
description: Load when workflow-router selects the diagnosis state for a failing command, runtime bug, flaky behavior, performance regression, or agent/tool failure; reproduce or bound the symptom before fixing.
---

# Diagnosis Workflow

Use this owner when the task starts from a failure or regression.

## Workflow

1. Align the reported symptom and expected behavior.
2. Gather required material: command output, logs, recent diffs, relevant code paths, docs, and source constraints.
3. Reproduce or bound the symptom before fixing.
4. Rank hypotheses and choose the smallest useful probe.
5. Write the regression test or deterministic check when possible.
6. Fix only the confirmed cause.
7. Test and accept against the symptom and regression scope.
8. Deliver report with `effective-interact` when evidence, timeline, or validation is non-trivial.

## Helpers

- Use `diagnose` for product/runtime failures.
- Use `claude-api` for Anthropic API or SDK failures after confirming the target is provider-specific.
- Use `mcp-builder` for MCP server/tool-contract failures.
- Use `agent-introspection-debugging` for agent, context, or tool-loop failures.
- Use `webapp-testing` for one-off browser reproduction only when that helper is relevant and available.
- Use `verification-loop` after the fix.

For parallel probes, follow `workflow-router/references/orchestration-policy.md`: use subagents only for independent evidence or verification, keep critical-path reproduction local, and never rely on hooks to dispatch agents.

Do not apply broad refactors while diagnosing unless the accepted fix requires them.
