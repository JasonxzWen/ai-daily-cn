# Data Sources

Read current-repository local evidence broadly. Use the widest read-only evidence surface that remains scoped to the repository passed with `--repo`.

## Include

- Current repository files that explain identity, project procedures, state, decisions, validation, and handoff.
- Layered prompt and rule context: user-level, repository-level, host-local, and project-local `AGENTS.md`, `CLAUDE.md`, host instruction files, and harness context packs when present.
- Repo-local host work directories for supported agent hosts.
- User-level host work directories only for sessions whose cwd, workspace, or explicit repo metadata resolves inside the current repository, or to another checkout of the same logical repository by Git remote, Git root, or package identity.
- Session logs, message exports, JSONL traces, tool-call records, task state, local memory files, report artifacts, validation logs, and schedule/task logs when they are scoped to the current repository.
- Automation logs, recurring task state, monitor output, and scheduled-task memory when their automation config or storage path resolves inside the current repository or another checkout of the same logical repository, or when the user explicitly opts into cross-repo collection.
- Generated handoff and progress artifacts when they explain why the next session would behave differently.

## Evidence Model

Use layered evidence instead of a flat keyword scan:

- `sourceClass`: `host-trace`, `automation-log`, `automation-memory`, `prompt-context`, `repo-state`, `env-state`, or `cache-noise`.
- `repoAffinity`: `exact`, `strong`, `background`, `weak`, or `none`.
- `confidence`: `high`, `medium`, or `low`.
- `confirmed`: evidence with exact current-repo identity, or repo-state background context.
- `candidate`: evidence that passed the current-repo scope gate but only has weak project terms in the specific event text.

Strong conclusions should use `confirmed` evidence. `candidate` evidence is useful for trend discovery and missing-context warnings only after the source has passed the current-repo scope gate.

The manifest should make scope decisions debuggable. It records aggregate skipped counts plus bounded samples for out-of-scope sessions and automations. Samples should include source path, source class/type, cwd/workspace/config path when available, and a short reason. They must not include long raw message excerpts.

Primary bottleneck conclusions should be driven by `interaction` evidence with confirmed exact or strong repo affinity. Repo-state evidence explains background constraints and should not by itself become a top bottleneck or recommendation.

Repo files are not automatically interaction evidence. Treat ordinary source files, installed skill bodies, generated wrappers, builds, reports, and caches as noise unless they are explicit task, decision, progress, handoff, or host trace state.

Prompt and rule files are context evidence. They can support stale-guidance, contradiction, or SOP recommendations when paired with trace evidence or explicit stale/wrong markers, but they should not by themselves prove user frustration or agent failure.

Automation logs are context unless they contain parsed interaction records. They can still reveal recurring background failures, stale schedules, or script/SOP lessons.

## Output Boundary

Reading can be broad. Output must be controlled:

- Raw evidence may appear in the local private report.
- Tracked docs should receive only distilled conclusions unless the user explicitly requests otherwise.
- Public artifacts, PR comments, remote tasks, and published sites are out of scope by default.

## Missing Evidence

Missing host traces are not a failure by themselves. Record them as warnings and explain how they limit confidence.
