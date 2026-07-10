always respond in Chinese unless the user explicitly asks for another language.
始终使用中文回复用户。

## Project Local Rules

- Route interaction-reporting and handoff artifact work through `.codex/skills/effective-interact`.
- During development, run focused tests plus the affected suite; reserve full `corepack pnpm run validate` for slice PR preparation or final material delivery.

# Codex Harness

This repository is prepared for Codex-driven development. Treat tracked harness files as the stable rules, and use ignored local state under `.harness-hub/state/` for the active task, progress, decisions, and handoff.

## Initialization Gate

Do not start implementation until the harness is fully landed and the active task is goal-ready.

- Required files must exist: `AGENTS.md`, `feature_list.json`, `clean-state-checklist.md`, `definition-of-done.md`, `evaluator-rubric.md`, `quality-document.md`, `scripts/harness-validate.mjs`, `.harness-hub/state/{current-task.md,decisions.md,progress.md,session-handoff.md}`, and `.harness-hub/context/{AGENTS.md,README.md,llm-wiki-schema.md,wiki/index.md}`.
- If any required file is missing, stop and run the approved harness init path before coding.
- Run `harness-hub check . --json` as a read-only startup check when the command is available; if it is unavailable, use `npx @jasonwen/harness-hub@latest check . --json`. Treat CLI updates, target updates, missing locks, missing project-local Codex activation, and registry failures as advisory unless the current task explicitly requires updating.
- If startup check recommends `harness-hub activate-codex`, run the dry-run first and then confirm only when local Codex skill activation is needed: `harness-hub activate-codex . --dry-run --json`, then `harness-hub activate-codex . --yes`.
- Run `node scripts/harness-validate.mjs`; fix harness failures before changing product files.
- Fill `.harness-hub/state/current-task.md` with goal, assumptions, non-goals, allowed paths, forbidden paths, acceptance criteria, validation tiers, runtime signals, standard startup path, and checkpoint policy before editing.
- For feature, bug-fix, refactor, or product/spec change work, fill requirement intake, discovery/brainstorming, target spec, P0/P1/P2 test matrix, open questions, and alignment status before editing.
- Review recent progress, decisions, handoff, feature state, quality snapshot, branch/worktree, and `git status --short`.
- For current-state audits and write tasks, run `git fetch origin main --prune`, record `git rev-list --left-right --count HEAD...origin/main`, and run `corepack pnpm run preflight:worktree`. Do not implement against a stale local baseline.

## Operating Rules

- Keep this file short. Move detailed or historical context to task files, docs, or archives.
- Use `feature_list.json` as the stable feature and parallel-write policy inventory.
- For ai-daily recovery work, use `tasks/project-recovery-ledger.md` as the only durable issue ledger; update stable REC IDs and five-layer evidence instead of creating another audit or TODO list.
- Use the LLM Wiki under `.harness-hub/context/wiki/` as the stable knowledge middle layer. Raw sources remain authoritative; do not duplicate code facts or native agent memory. Follow `.harness-hub/context/AGENTS.md` and `.harness-hub/context/llm-wiki-schema.md`; write wiki knowledge only after human confirmation and record updates in `wiki/update-log.md`.
- Treat Loop Control Plane rules as the top-level automation boundary. Prompt, context, harness, and tool capabilities may be `standalone`, `composable`, or `loop-participant`; do not force standalone capabilities into fixed workflows.
- Keep workflow and Loop separate: workflow stages define how development moves from requirement intake to handoff; Loop only decides whether concrete capability actions continue or interrupt and records auditable decisions.
- Follow the Interrupt Policy in `.harness-hub/loop/policies/interrupt-policy.md`: continue low-risk local work when scope and validation are clear, but interrupt when risk signals require human review.
- Record auditable loop decisions in `.harness-hub/state/interrupt-decisions.jsonl`, loop runs in `.harness-hub/state/loop-runs.jsonl`, and capability events in `.harness-hub/state/capability-events.jsonl`.
- Use a separate git worktree or branch for each write task.
- Treat roadmap slices as PR units: open one main PR per slice and use multiple commits inside it instead of separate PRs for small audit, tag, or guard increments.
- Start from `.harness-hub/state/current-task.md` before changing files.
- Respect the task's allowed paths and forbidden paths.
- Before slice implementation, review the 8-slice completion definition table in `docs/ai-daily-cross-agent-iteration-roadmap.md`, record what remains unsolved, and check whether the implementation path is still aligned.
- Centralize repeated runtime, schema, and test contracts before expanding them; for example, do not duplicate main-stream stage vocabulary across schema/runtime/tests without a shared source or explicit synchronization point.
- Treat Harness Hub source-repo packaging as non-target material: do not copy `.claude-plugin/`, root `openspec/`, `docs/`, `config/`, `package.json`, `README*`, source `AGENTS.md`, or this repo's source tree into target projects. Use the managed outputs from `harness-hub init-harness`, `install`, and `activate-codex` instead.
- Do not run parallel writes against the same file, module, or feature state.
- Run `pnpm` install/build/test commands serially inside one worktree; concurrent pnpm processes can corrupt or lock the shared virtual store state on Windows.
- Use read-only parallel work only for research, review, log analysis, or validation.
- Use agentic loops for material planning, implementation, acceptance, PR closeout, and workflow-learning work when they reduce risk: Producer -> Verifier -> Arbiter -> Main Agent Decision.
- Keep loop roles host-neutral in repo state: `delegated-agent` may be a host-native subagent, isolated session, browser run, CI check, deterministic command, or bounded worker. Arbiters are read-only and must not edit files, resolve conflicts, push, publish, merge, or make final user-facing decisions.
- Do not let hooks auto-dispatch delegated agents. Hooks and deterministic checks may only remind, validate evidence, or interrupt for human review.
- Use P0/P1/P2 validation priorities for implementation tasks: P0 must pass before handoff, P1 is run or risk-assessed for affected boundaries, and P2 is hardening that may be deferred with a reason.
- Treat lightweight brainstorming as part of SDD: inspect repo evidence, compare 2-3 viable directions, recommend one, record rejected alternatives, and ask only blocking open questions before implementation.
- For Web user-visible changes, record and run agent-run browser acceptance against the local app before handoff, including URL, scenario, viewport, console or network findings, and screenshot or trace evidence when useful.
- Design templates are authoring aids, not shipped evidence. A design gate passes only with a non-template candidate/accepted record or an explicit scoped skip decision, plus browser evidence for accepted Web changes.
- Scheduled automation calls one production entrypoint. The repository-owned entrypoint must own bounded repair/resume transitions and write the terminal summary; automation prompts must not reimplement stage business logic or claim an unconsumed artifact handoff.
- After creating or updating a PR, treat PR status as a delivery gate: check mergeability, CI/check-run status, conflicts, and branch-protection blockers before declaring done; resolve in-scope blockers, rerun validation, and push updates unless a user decision, credential, permission, reviewer action, protected-branch override, or external outage is required.
- Do not merge a PR unless the user explicitly asks for that remote mutation.
- Before final handoff for material changes, run finish closeout: use a subagent or independent review pass when scope-safe to look for technical debt, first-principles implementation fit, project-rule drift, and refactor or warning recommendations; expose findings instead of burying them.
- During finish closeout, run or explicitly skip `insight` to review tool-calling quality, repeated low-value lookup loops, misleading evidence, code/docs conflicts, AI infrastructure lessons, and whether this workflow should become a skill, source record, eval case, or change to an existing workflow.
- Use verified checkpoint commits for completed atomic work units when the task permits commits. Do not commit failing, unrelated, or half-done work. Record each checkpoint commit hash, or the reason commits were skipped, in progress and handoff state.
- Promote repeated review feedback into a harness rule, validation command, or documented follow-up instead of relying on memory.
- After creating or updating a PR, record the PR URL or number, branch, base, commit, validation status, skipped checks, residual risk, and next action in progress and handoff state.
- Keep harness state writes low-frequency during implementation: record decision-level changes as they happen, then write complete progress, validation evidence, and restart notes during final handoff.
- Record decision-level changes in `.harness-hub/state/decisions.md`.
- Run `node scripts/harness-validate.mjs` before handoff.

## Required Handoff

Before ending a session, update `.harness-hub/state/session-handoff.md` with the current status, changed files, validation evidence, agentic loop records, finish closeout findings, insight recommendations, PR status and PR handoff details when a PR was created or updated, blockers, and the next concrete action. Update `.harness-hub/state/decisions.md` when assumptions, acceptance criteria, allowed paths, validation, user-visible behavior, or risk changed.
