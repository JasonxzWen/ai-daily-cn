# Current Task

## Goal

Add a daily 21:30 status self-check for AI daily publishing and harden the recent daily automation flow so duplicate/legacy publish automations are detected before they can conflict.

## Scope

- Add `status:self-check` CLI/script support.
- Reuse shared helpers for npm command construction and URL identity normalization.
- Validate the Codex-native daily runner contract against repository markers and external Codex automation inventory.
- Pause the old legacy publish automation and create one active 21:30 status self-check automation.

## Non-goals

- Do not commit, push, or change GitHub Pages settings.
- Do not generate or publish a new daily report as part of this implementation.
- Do not hand-edit generated public report HTML.

## Allowed paths

- `config/daily-workflow-contract.json`
- `docs/codex-automation-setup.md`
- `package.json`
- `prompts/ai-daily/modules/publish-workflow.md`
- `scripts/validate-daily-workflow-contract.mjs`
- `src/**`
- `tasks/current-task.md`
- `tasks/daily-publish-runbook.md`
- `tasks/templates/daily-publish-task.md`
- `progress.md`
- `session-handoff.md`
- `tests/unit.test.js`

## Forbidden paths

- Do not change remote Pages settings.
- Do not commit, push, or create a PR unless explicitly requested.
- Do not keep generated `docs/data/**` changes produced only by validation.
- Do not modify generated public report HTML by hand.
- Do not reset hard or overwrite unrelated user changes.

## Acceptance Criteria

- `npm run workflow:validate` passes with exactly one active daily publish automation and one active status self-check automation.
- `status:self-check` reports artifact, Pages, quality, source health, dry-run, and automation inventory status.
- Multiple active daily publish automations produce `multiple_active_daily_publish_automations`.
- Unit coverage exists for shared URL identity, Windows npm invocation, and status self-check behavior.
- `npm run validate` passes before handoff.

## Validation commands

- `node --test tests/unit.test.js --test-name-pattern "status:self-check|shared URL identity|shared npm invocation|daily workflow contract|report:draft skips recent"`
- `npm run workflow:validate`
- `npm run validate`
- `node scripts/harness-validate.mjs`
- `git diff --check`

## Parallel writes

- No parallel writes. Manual edits use `apply_patch`; generated validation output is reverted unless it is part of the requested change.

## Handoff requirements

- Report code, documentation, and automation changes.
- Report validation command results.
- Clearly state that no daily report was generated/published and no GitHub Pages setting was changed.

## Current Status

- Implementation and automation updates are complete.
- Focused unit tests, `npm run workflow:validate`, and `npm run validate` pass.
- Harness validation is being rerun after restoring the required task-state sections.
