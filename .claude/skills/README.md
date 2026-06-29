# .claude/skills - curated from .codex/skills

These skills are curated from `.codex/skills/` for working on this AI daily
repository as a Claude Code agent. Codex-specific scaffolding is intentionally
excluded from this tree:

- `_harness-hub/`
- `agents/openai.yaml`
- skill-local ignored artifacts

`.codex/skills/` remains the source of truth. Re-curate from there when Harness
Hub is updated.

## Included (17)

Editorial quality:

- `stop-slop` - remove AI-writing tells from English prose
- `source-post` - turn a source article or release into a grounded public post
- `grill-me` - one-question-at-a-time stress testing for a plan or design

Engineering discipline:

- `tdd-workflow`
- `coding-standards`
- `compound-code-review`
- `verification-loop`
- `diagnose`
- `handoff`
- `karpathy-guidelines`
- `security-review`

Frontend and page quality:

- `design-taste-frontend`
- `e2e-testing`
- `webapp-testing`

Repository operation and audit:

- `harness-quality-check` - advisory harness/readiness HTML audit
- `insight` - private Codex / Claude Code interaction trace audit

Domain:

- `package-release-sniffer` - track newly published model/package releases for the daily

## Intentionally Not Copied

- `effective-interact` stays single-sourced at `.codex/skills/effective-interact`.
  It is a production runtime dependency wired into `src/site.js`, where
  `create-interaction.mjs` generates daily HTML. Duplicating the full runtime in
  `.claude/skills` would invite drift.
- `html-work-reports` is superseded by `effective-interact` for this repository.
- `workflow-router` and thin `*-workflow` owner skills are Codex orchestration
  plumbing for this workspace. Claude Code can still use the curated helper
  skills directly.
- `openspec-*` are intentionally omitted because `AGENTS.md` says OpenSpec is no
  longer the active spec flow here.
- `.claude-plugin/` from the Harness Hub source repository is not copied into
  this target repository. It is plugin packaging metadata, not a target-local
  skill body.
- Upstream Harness Hub root docs, package files, source code, tests, and site
  files are not copied into this target repository.
