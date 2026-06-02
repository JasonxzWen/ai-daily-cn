# Definition Of Done

A Codex task is done only when the repository proves it.

- The goal and non-goals are stated in `tasks/current-task.md`.
- Acceptance criteria are satisfied by direct evidence.
- Changed files stay within allowed paths and avoid forbidden paths.
- The dev server, smoke command, build, test, or equivalent validation path has been run when relevant.
- `session-handoff.md` records the outcome, validation, residual risk, and next action.
- OpenSpec is used only when the task affects public contracts, cross-module architecture, publishing side effects, irreversible decisions, or long-lived specs.
- User-confirmed persistent feedback is recorded in `config/feedback-ledger.json` as P1 by default and is bound to existing scope files, a validation command covered by `npm run validate`, and an existing test assertion or runtime gate.
- Daily publish work records source discovery coverage, report-write status, build/validate status, dry-run result, and Pages verification when real publish is approved.
- Production daily HTML remains generated through `.codex/skills/effective-interact` in `pre-rendered` mode.
