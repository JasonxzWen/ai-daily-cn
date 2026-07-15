# Project Agent Contract

This file is the shared contract for every repository-local coding agent. `CLAUDE.md` must contain only `@AGENTS.md`; Claude Code uses `.claude/`, while Codex discovers skills from `.agents/skills/` and reads hooks from `.codex/hooks.json`.

## Operating principles

1. Facts first. Inspect current code, tests, Git state, and project knowledge before deciding. Do not invent APIs, paths, commands, configuration, or user acceptance.
2. Simplicity first. Prefer the smallest complete design. Reuse existing mechanisms and avoid compatibility layers, duplicate registries, optional packs, speculative abstractions, or process for its own sake.
3. Surgical scope. Preserve unrelated user changes. Expand scope only when required by accepted behavior or deterministic failure.
4. Deterministic evidence wins. A failing test, validator, build, Git check, or security gate cannot be waived by Agent opinion.
5. Autonomy within boundaries. Continue local, reversible, in-scope work without asking. Ask only for a choice that changes user-visible behavior, acceptance criteria, data ownership, security, material cost, remote mutation, or destructive scope.
6. No unrequested remote mutation. Do not commit, push, publish, deploy, create or merge a PR, change credentials, or modify user/global configuration without the required authorization. Never merge without explicit authorization.

## Native Host execution

Claude Code or Codex is the only main-Agent runtime. The main Agent owns requirements alignment, planning, Subagent delegation, parallel work, conflict resolution, integration, validation, and the final user report.

Harness Hub supplies atomic Skills and project rules. It does not supply a Router, Workflow/Loop runtime, Producer/Verifier/Arbiter scheduler, retry or pause state machine, lease system, Agent dispatcher, or internal metrics backend.

Skill selection and composition are native main-Agent decisions. No Hook selects or sequences Skills; the repository safety Hook remains a deterministic local guard only.

Do not create a Harness Hub Agent fallback.

- Select the narrowest atomic Skill that adds domain value; explicit user invocation remains supported.
- Skills may request bounded, independent, read-only native Subagents. The main Agent performs mutations and keeps final decisions, safety boundaries, integration, and user communication.
- Prefer independent read-only review for material changes. Deterministic failures outrank every review verdict.
- Compose `tdd`, `codebase-design`, `to-tickets`, `code-review`, and `verification` only when their narrow trigger fits. They are optional prompt capabilities, not a fixed lifecycle.
- Low-risk implementation details remain autonomous. Use `decision-ui` on Codex only for genuinely blocking, high-impact, or external-authorization choices; if native structured input is unavailable, fall back honestly to concise text.
- Do not modify Host trust. Codex project hooks run only when the user already trusts the project.

## Development and delivery

Run one `grill-me` alignment pass for every repository mutation task. A fully aligned task exits with zero user questions. For durable contracts, specifications, ADRs, architecture, or OKF changes, use `grill-with-docs`, which reuses the same decision graph and replaces a separate interview.

For non-trivial mutation work:

1. Inspect Git freshness, the nearest implementation, tests, project rules, and `knowledge/`.
2. Record the goal, accepted behavior, non-goals, scope, acceptance criteria, validation, and unresolved decisions before broad edits.
3. Use the native Host main Agent to plan, implement, test, review, and close out. Use `ponytail` to check YAGNI, minimum change, and entity count. Use `to-tickets` only when accepted work needs multiple independently verifiable tracer-bullet tickets; follow the project's existing task, issue, or plan convention rather than creating a Harness task registry.
4. Test public behavior and failure boundaries. Prove failures are caused by the missing behavior before changing production code when practical.
5. Before handoff, review the final diff, rerun proportionate deterministic validation, and re-read task-critical files to avoid stale conclusions.
6. Never claim cleanup, rollback, CI, PR, or delivery success without direct evidence.

For complex delivery summaries,方案比较, or important handoffs, load `effective-interact` and use the lightest structure that reduces interpretation cost. Simple results return as plain text.

Use `agent-interaction-audit` for failed, long-running, high-cost, tool-abnormal, or explicitly requested retrospectives. It may recommend changes to an existing Skill, project rule, Eval, SOP, or OKF page, but it must not create a new entity by default. Missing trace, duration, token, or cost evidence is `unknown`, never estimated.

## Harness Hub updates

When an update request includes `https://github.com/JasonxzWen/harness-hub`, clone it into a temporary standalone checkout outside this repository, use the source default branch current HEAD, keep this repository as the target, and read its existing `.harness-hub/manifest.json`. From the temporary Harness Hub checkout run:

```text
node bin/harness-hub.mjs migrate <current-repository> --yes
```

With a valid schemaVersion 1 manifest, omitted Host mode and primary inherit `hosts` and `primaryHost`; do not ask the user to repeat them. Explicit `--host` and `--primary` take priority. Without a manifest, first migration still requires `--host`, and first migration in `both` mode also requires `--primary`. Use the source default branch current HEAD and preserve the actual source commit recorded by the new manifest. Migration must not commit, push, publish, merge, or otherwise modify remote state.

## Durable task state

For non-trivial mutation work, maintain ignored project-local state under `.harness-hub/state/` when it materially improves restartability:

- `current-task.md`: goal, non-goals, scope, accepted behavior, acceptance criteria, validation, and open questions.
- `decisions.md`: accepted and rejected choices with reasons.
- `progress.md`: completed work, current phase, evidence, blockers, and delivery state.
- `session-handoff.md`: restart-ready status, changed files, validation, residual risk, and next action.

Do not create `.harness-hub/state/runs/`, leases, integrations, Agent traces, or a parallel execution control plane. Task state is project-owned and is not proof of a tracked product change.

## Git, filesystem, and security

- Start by inspecting branch, upstream, `git status --short`, and relevant recent remote state. Fetching is read-only; remote writes are not implied.
- A dirty or diverged worktree is evidence to preserve, not permission to reset, clean, overwrite, or discard.
- Reject path traversal, symlinks, junctions, and writes outside declared ownership when managing repository content.
- The repository-local safety hook is deterministic and must not dispatch Agents, write state, modify credentials, or perform remote actions.
- Do not install global tools, change Host config, copy credentials, or reuse browser/login state on the user's behalf.
- Agent Reach is only a prompt-level router to an already installed user-level CLI. Run its doctor first; if unavailable, report prerequisites honestly and do not install, configure, authenticate, or copy state.

## Project knowledge (Google OKF v0.1)

`knowledge/` is this project's source-traceable LLM-Wiki and belongs to this project.

- Every Markdown document has parseable YAML frontmatter with a non-empty `type`.
- `knowledge/index.md` declares OKF `0.1` and links every project concept.
- `knowledge/log.md` records dated knowledge changes.
- Concepts link to real repository sources with relative links and distinguish fact from inference.
- Update an existing canonical owner page before adding another; deduplicate facts and synchronize related links, index, and log.
- Run `node .harness-hub/okf-validate.mjs .` after knowledge changes.
- If no durable project fact changed, leave the wiki byte-for-byte unchanged.
- Repository migration may validate this tree but normal and force migration must preserve its complete path-and-byte set.
- Project tasks, sessions, Eval cases, product facts, and private preferences remain in this repository. Never copy another project's knowledge or examples here.

## Real-task evaluation

Keep Eval task cards and results in this project, derived from this project's own sessions, audits, and failures. Measure:

1. primary: real-task first-attempt success rate;
2. guardrails: human interventions, Agent/CLI calls, elapsed time, token usage, cost, migration safety, and project-knowledge protection.

Do not improve the primary metric by hiding retries, weakening deterministic gates, moving work to the user, or excluding failures. Unknown cost evidence stays `unknown`.

## Communication

- Lead with the result, decision, blocker, or current status.
- Use concise Chinese by default unless the project or user requests another language.
- Surface premise corrections, tradeoffs, residual risks, and evidence directly.
- A handoff includes outcome, changed behavior, validation, unresolved risk, and next action without dumping raw Agent context.
