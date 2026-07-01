---
name: hub-maintenance-workflow
description: Load when workflow-router selects the harness-hub-maintenance state for Harness Hub source evaluation, personal workflow distribution, routing overlay, capabilities, npm lifecycle, or managed update/remove behavior; preserve local adaptations and upstream skill bodies.
---

# Hub Maintenance Workflow

Use this owner for Harness Hub repository work.

## Workflow

1. Align the maintenance goal and whether it is docs, skill, capability metadata, CLI lifecycle, or source evaluation work.
2. Gather required material: `docs/personal-workflow-distribution.md`, `docs/source-projects.md`, `docs/skill-routing.md`, `capabilities/index.json`, relevant skills, and tests.
3. Write or update spec and acceptance before mutating installable behavior; keep formal artifacts optional for ordinary curation.
4. Write an executable plan with cleanup decisions and validation commands.
5. Clean unneeded files only when ownership is clear; preserve source evidence, upstream skill bodies, and unrelated user edits.
6. Apply narrow changes.
7. Validate with routing tests, `scripts/validate-skills.ps1 -SkipExternal`, and `bun run validate` when TypeScript, tests, capabilities, or CLI behavior changed.
8. Finish closeout: run a final independent review when material, expose any routing/spec drift or technical debt, and run or explicitly skip `insight` for tool-calling quality and skill/workflow improvement candidates.
9. Use `effective-interact` for material handoff reports.

Use agentic loops from `workflow-router/references/agentic-loops.md` for material Harness Hub changes. Prefer `plan-review` for workflow or harness architecture changes, `implementation-review` for routing/CLI/template changes, `docs-consistency` when docs, templates, tests, and implementation must stay aligned, `pr-closeout` for release-bound work, and `insight-retro` when repeated corrections or tool-calling lessons should become rules, eval cases, source records, or workflow changes. Verifiers may be `delegated-agent` passes or deterministic checks; record `iteration`, `maxIterations`, and a stop condition when a loop may repeat.

## Source And Evaluation Inputs

Use repo-local source records and deterministic project files instead of delegating to removed library skills:

- `docs/personal-workflow-distribution.md` for the personal distribution rules, TODOs, and acceptance criteria.
- `docs/source-projects.md` for upstream URLs, versions, license notes, import decisions, and reference-only candidates.
- `docs/harness-vocabulary.md` for local concept boundaries when maintaining Harness Hub-owned skills, reports, or validation language.
- `docs/workflow-source-dossier.md` for lifecycle-stage comparisons across Matt Pocock skills, Superpowers, ECC, OpenSpec, Effective Interact, Vercel, retired Ralph source notes, and local docs.
- `docs/skill-routing.md` for overlap and trigger decisions.
- `capabilities/index.json` for the installable component surface.
- `harness-hub` CLI dry-runs for target-repo analyze/install/status/update/remove behavior.
- `skill-creator` for standard skill authoring and routing-evaluation details when local skills are created or changed.
- `doc-coauthoring` for durable proposals or decision records when the maintenance change needs a reviewed document.

For any parallel source review, hook proposal, or lifecycle smoke split, follow `workflow-router/references/orchestration-policy.md`: subagents must have independent scopes, hooks stay advisory by default, and lock-backed lifecycle checks remain deterministic.

Do not rewrite imported skill bodies for local style. Do not wholesale replace local skills or the local workflow overlay with upstream text. Do not bypass lock-backed install, update, status, or remove behavior.
