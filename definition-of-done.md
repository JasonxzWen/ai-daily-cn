# Definition Of Done

A Codex task is done only when the repository proves it.

- `tasks/current-task.md` is the single authoritative current-task spec.
- Non-trivial tasks state `Task Class`, spec, acceptance criteria, allowed paths, forbidden paths, validation commands, and handoff requirements before implementation.
- Non-trivial tasks record a pre-implementation `Red Test` failure, or a justified `Deterministic Substitute` when direct red testing is not practical.
- Trivial tasks include `Task Class: trivial` and a concrete `Trivial Justification`.
- Acceptance criteria are satisfied by direct evidence.
- Changed files stay within allowed paths and avoid forbidden paths.
- The dev server, smoke command, build, test, or equivalent validation path has been run when relevant.
- `session-handoff.md` records the outcome, validation, residual risk, and next action.
- `node scripts/harness-validate.mjs` passes and enforces the current-task SDD/TDD contract.
- User-confirmed persistent feedback is recorded in `config/feedback-ledger.json` as P1 by default and is bound to existing scope files, a validation command covered by `npm run validate`, and an existing test assertion or runtime gate.
- Daily publish work records source discovery coverage, report-write status, build/validate status, dry-run result, and Pages verification when real publish is approved.
- Production daily HTML remains generated through `.codex/skills/effective-interact` in `pre-rendered` mode.
