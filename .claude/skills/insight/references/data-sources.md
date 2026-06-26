# Data Sources

Read project-related local evidence broadly. Use the widest project-related local evidence surface that remains read-only.

## Include

- Current repository files that explain identity, workflow, state, decisions, validation, and handoff.
- Repo-local host work directories for supported agent hosts.
- User-level host work directories when events mention the current project path, project name, package name, or git remote.
- Session logs, message exports, JSONL traces, tool-call records, task state, local memory files, report artifacts, validation logs, and schedule/task logs when they are project-related.
- Generated handoff and progress artifacts when they explain why the next session would behave differently.

## Evidence Model

Use layered evidence instead of a flat keyword scan:

- `sourceClass`: `host-trace`, `automation-memory`, `repo-state`, `env-state`, or `cache-noise`.
- `repoAffinity`: `exact`, `strong`, `background`, `weak`, or `none`.
- `confidence`: `high`, `medium`, or `low`.
- `confirmed`: evidence with exact/strong project identity, or repo-state background context.
- `candidate`: evidence that only references the repository name or another weak project term.

Strong conclusions should use `confirmed` evidence. `candidate` evidence is useful for trend discovery and missing-context warnings.

Primary bottleneck conclusions should be driven by `interaction` evidence with confirmed exact or strong repo affinity. Repo-state evidence explains background constraints and should not by itself become a top bottleneck or recommendation.

Repo files are not automatically interaction evidence. Treat ordinary source files, installed skill bodies, generated wrappers, builds, reports, and caches as noise unless they are explicit task, decision, progress, handoff, or host trace state.

## Output Boundary

Reading can be broad. Output must be controlled:

- Raw evidence may appear in the local private report.
- Tracked docs should receive only distilled conclusions unless the user explicitly requests otherwise.
- Public artifacts, PR comments, remote tasks, and published sites are out of scope by default.

## Missing Evidence

Missing host traces are not a failure by themselves. Record them as warnings and explain how they limit confidence.
