---
name: harness-quality-check
description: Load when explicitly asked to audit Harness Hub or target repo harness quality/readiness and produce advisory HTML findings; do not load for ordinary code review, final implementation validation, skill authoring, or direct lifecycle command execution.
license: MIT
metadata:
  source: "local-original"
---

# Harness Quality Check

Use this skill to compose existing Harness Hub checks into an advisory HTML quality/readiness report for the Hub itself, a target repository, or both.

## Workflow

1. Identify scope: Harness Hub source checkout, target repository, or both.
2. State the audit is advisory-only. Do not treat findings as blocking gates unless the user separately asks for enforcement.
3. Gather deterministic evidence before judgment:
   - `harness-hub self-check <target> --json`
   - `harness-hub analyze <target> --agent-readiness --harness --json`
   - `harness-hub validate-harness <target> --json` when the target is initialized or strict harness validation is requested
   - `bun ./scripts/skill-quality-inventory.ts --json` when auditing the Harness Hub source skill set
   - nearest repo validation commands only when the user wants freshness evidence, not as a hidden requirement
4. If a command is unavailable, not applicable, or too expensive for the user's time budget, record that as coverage status instead of inventing a result.
5. Produce an HTML report, preferably through `effective-interact` when available. Use a local ignored report path such as `.harness-hub/reports/harness-quality-check-<date>.html` or `reports/harness-quality-check-<date>.html`; never overwrite an existing report without confirmation.
6. Validate the HTML enough to know it opens and preserves the main conclusion. If the report uses `effective-interact`, run its nearest artifact validator.

## Audit Categories

Cover these categories when evidence is available:

- Instruction and context budget: root `AGENTS.md`, duplicated always-loaded instructions, vague guidance, and missing commands or forbidden paths.
- Harness initialization: required root harness files, lock-managed ownership, state templates, and `validate-harness` status.
- Task contract quality: goal, non-goals, allowed and forbidden paths, acceptance criteria, P0/P1/P2 validation, checkpoint policy, decisions, progress, and session handoff.
- Verification readiness: test, lint, typecheck, build, browser acceptance, PR closeout, and validation evidence.
- Skill routing health: trigger hygiene, helper boundaries, source metadata, progressive loading, and routing fixture coverage.
- Automation and orchestration risk: unbounded goals, schedules, hooks, subagent dispatch, remote writes, credentials, and unclear approval boundaries.
- Learning capture: quality snapshot, evaluator rubric, repeated review feedback, source records, and durable follow-up locations.

## Report Shape

The HTML report should include:

- scope and target paths;
- commands run, skipped, unavailable, and their exit status;
- advisory findings grouped by category and severity;
- evidence anchors such as file paths, command summaries, or report ids;
- concrete next actions, separated into quick fixes, planned improvements, and explicit user decisions;
- residual risk and coverage gaps;
- a clear note that no remote writes, schedules, commits, pushes, or enforcement changes were performed.

Use severity labels as advisory triage:

- `high`: likely to cause wrong agent behavior, unsafe side effects, or unreviewable delivery if ignored;
- `medium`: weakens repeatability, routing clarity, validation confidence, or handoff quality;
- `low`: cleanup, polish, or documentation improvement;
- `info`: useful context with no immediate action.

## Boundaries

- Use `verification-loop` for final build, typecheck, lint, test, smoke, or artifact gates after implementation.
- Use `coding-standards` for ordinary cross-project code quality conventions.
- Use `skill-creator` when creating or changing a skill.
- Use `hub-maintenance-workflow` for actual Harness Hub source, routing, capability, or lifecycle changes.
- Use direct CLI lifecycle commands when the user asks only to run `check`, `analyze`, `self-check`, `validate-harness`, `install`, `status`, `update`, or `remove`.
- Do not create schedules, hooks, subagents, commits, PRs, pushes, npm publishes, credentials, MCP config, or remote writes.
- Do not silently modify target repository files other than an explicitly requested local HTML report.
