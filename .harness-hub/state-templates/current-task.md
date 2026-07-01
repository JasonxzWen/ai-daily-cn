# Current Task

## Goal

State the concrete outcome for the active agent task.

## Assumptions

- Add assumptions before implementation starts.

## Requirement intake

- Actor:
- Outcome:
- Pain or trigger:
- Constraints:
- Success target:

## Discovery and brainstorming

- Repo evidence inspected:
- Existing behavior or source decisions:
- Option A:
- Option B:
- Option C:
- Recommended direction:
- Rejected alternatives and why:

## Target spec

- User-visible behavior:
- Boundaries:
- Interfaces or data implications:
- Compatibility constraints:
- Failure behavior:
- Rollout or rollback notes:

## Non-goals

- List what this task must not change.

## Worktree / Branch

- Record the worktree or branch used for this write task.

## Allowed paths

- Add exact files or directories the task may modify.

## Forbidden paths

- Add files or directories the task must not modify.

## Acceptance criteria

- Add observable checks that prove the task is done.

## Test matrix

| Priority | Test type | Behavior or boundary | Command or method | Expected RED | Expected GREEN | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| P0 | Unit / integration / E2E / deterministic | Add the first public behavior to prove. | Add command. | Add failure expected before implementation. | Add pass condition. | Pending. |
| P1 | Integration / cross-boundary | Add affected boundary confidence check. | Add command or risk assessment. | n/a | Add pass condition. | Pending. |
| P2 | Hardening | Add broader regression, accessibility, performance, repeated run, or viewport check. | Add command or defer reason. | n/a | Add pass condition. | Pending. |

## Open questions

| Question | Why it matters | Recommended answer | Status |
| --- | --- | --- | --- |
| Add only blocking questions. | Explain behavior, safety, data, compatibility, cost, release, path, or acceptance impact. | Add recommendation. | open |

## Alignment status

- User-visible details aligned: no
- Spec aligned: no
- Acceptance criteria aligned: no
- Test matrix aligned: no
- Blocking open questions resolved: no
- Implementation may start: no

## Standard startup path

- Run `harness-hub check . --json` as a read-only Harness Hub startup check; if the command is unavailable, use `npx @jasonwen/harness-hub@latest check . --json`.
- Treat `cli.update-available`, `target.update-available`, `target.not-managed`, and `cli.unavailable` as advisory unless this task explicitly includes updating Harness Hub.
- Add the project command or steps that prove the project can restart from a clean checkout.

## Validation commands

- Add commands that must run before handoff.

## Validation tiers

- P0: Must pass before handoff. Include the new or changed behavior test, nearest relevant suite, required static/runtime gates, and Web browser acceptance when this task changes Web user-visible behavior.
- P1: Run or risk-assess affected module, integration, system, API, data-flow, or cross-boundary checks.
- P2: Hardening checks such as broader regression, repeated runs, cross-browser/mobile viewport, accessibility, or performance. Defer only with a recorded reason.
- Static: lint, typecheck, format, or structural checks.
- Runtime: tests, build, startup, smoke, or health checks.
- User flow: end-to-end, integration, browser, CLI, or scenario checks.

## Agentic loops

Use host-neutral loop roles from `skills/workflow-router/references/agentic-loops.md`: Producer, Verifier, Arbiter, and Main Agent Decision. `delegated-agent` may map to a host-native subagent, another isolated session, a browser run, a CI check, or a deterministic command. Arbiters are read-only and must not edit code, resolve conflicts, push, publish, merge, or make final user-facing decisions.

| Stage | Loop | Iteration | Max iterations | Producer | Verifier | Arbiter | Evidence | Stop condition |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Add stage. | plan-review / test-design / implementation-review / frontend-acceptance / diagnosis-regression / docs-consistency / pr-closeout / process-retro | 1 | 1-3, or leave blank for a single-pass loop | Add owner. | delegated-agent / deterministic-check / browser / CI / explicit skip | delegated-agent arbiter / local read-only arbiter / explicit skip | Add evidence path or summary. | continue / revise / interrupt / deliver / handoff / complete |

When a loop may repeat, record `iteration`, `maxIterations`, and a stop condition. Single-pass loops may leave those fields blank in Markdown records; JSON loop records should omit unused fields rather than write `n/a`. Do not continue another loop iteration after the maximum is reached without interrupting for a user-visible decision.

## Web browser acceptance

- Required: yes/no.
- Dev server command:
- Local URL:
- agent-run browser path: `webapp-testing` for one-off local acceptance; `e2e-testing` only for durable Playwright suites.
- Scenario:
- Viewports:
- Console/network checks:
- Evidence: screenshot, trace, video, log, or explicit skip reason.
- Production/credential boundary: do not use production accounts, real payments, or external writes unless explicitly approved.

## Runtime signals

- Logs:
- Traces:
- Health checks:
- Failure messages to preserve:

## PR closeout

- PR expected: yes/no.
- PR URL:
- Remote status command:
- Mergeability:
- CI/check-run status:
- Conflict status:
- Branch-protection blockers:
- In-scope fix policy: resolve conflicts, failing checks, or other actionable blockers; rerun relevant validation and push updates.
- Stop policy: ask the user only for decisions, credentials, permissions, reviewer action, protected-branch overrides, or external outages.
- Merge policy: do not merge unless explicitly requested.

## Finish closeout

- Final independent review required: yes/no.
- Review method: subagent / independent local pass / explicit skip.
- Review focus: technical debt, first-principles implementation fit, project-rule drift, refactor or warning recommendations.
- Review findings:
- Insight audit required: yes/no.
- Insight focus: tool-calling quality, repeated low-value lookup loops, misleading evidence, docs/code conflicts, AI infrastructure lessons, and project process improvements.
- Insight recommendations:
- Process improvement candidate: none / project rule / validation case / documentation / automation check / follow-up task.
- PR or merge readiness:
- Conflict decisions surfaced to user:
- Closeout blockers:

## Checkpoint policy

- Commits permitted: yes/no.
- Checkpoint rule: after each validated atomic work unit, create a small commit or record why committing is skipped.
- Last safe checkpoint: commit hash or `none yet`.

## Spec updates

- Add only decision-level changes that alter assumptions, acceptance, allowed paths, validation, user-visible behavior, or risk.

## Decision log

- Update `.harness-hub/state/decisions.md` for durable decisions that should survive a session restart.

## Parallel writes

- Default: blocked for this task.
- Allowed only with independent worktrees or branches, non-overlapping paths, independent validation, and one integration review point.

## Handoff requirements

- Update `.harness-hub/state/progress.md`.
- Update `.harness-hub/state/decisions.md` when decision-level changes occurred.
- Update `.harness-hub/state/session-handoff.md`.
- Update `quality-document.md` when validation evidence changes the quality snapshot.
- Fill `evaluator-rubric.md` for material implementation or review work.
- Record validation command status, passed/failed counts when available, output location or summary, and checkpoint commit state.
- Record standard startup status, runtime signals, agentic loop records, finish closeout findings, insight recommendations, PR status when a PR was created or updated, and review feedback that should become a rule or follow-up.
- Run `node scripts/harness-validate.mjs`.
