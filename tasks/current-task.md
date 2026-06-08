# Current Task

## Task Class

non-trivial

## Spec

### Goal

Update this repository's Harness Hub aggregation to the latest local source checkout and make version-sniff capability both present and durably checkable.

### User-Visible Behavior

- The tracked Harness Hub aggregation manifest points at the current `D:/harness-hub` source commit instead of a stale commit.
- A repeatable local update script can sync imported Harness Hub skills into `.codex/skills/` while preserving this repository's local overlays and `_harness-hub` conflict copies.
- The installed skill set continues to route package/version release discovery prompts to `package-release-sniffer`.
- The final handoff reports every updated Harness Hub file and the validation evidence.

### Boundaries

- Preserve this repository's local skill overlays and `html-work-reports`; do not flatten everything into an upstream mirror.
- Do not modify daily report data, generated public HTML, publish automation, or unrelated workflow contracts.
- Do not change the upstream `D:/harness-hub` repository itself.
- Do not commit, push, or open a PR unless explicitly requested.

### Non-Goals

- Do not redesign the daily report pipeline.
- Do not introduce external package installs, schedulers, hooks, or registry clients.
- Do not make repository-wide portability depend on cloning `D:/harness-hub`; source freshness checks may stay local to the update workflow rather than the default validate path.

## Acceptance Criteria

- A repository-local script updates the Harness Hub aggregation from a provided source root and records the latest source branch/commit/status in `.codex/harness-hub-aggregation.json`.
- Running the update script against `D:/harness-hub` keeps local overlay skills active, refreshes imported skills, and refreshes `_harness-hub` copies for overlapping skills.
- `.codex/skills/package-release-sniffer/SKILL.md` remains installed and `workflow-router` still selects `package-release-sniffer` for a version/package release sniffing prompt.
- `tests/skills.test.js` contains focused coverage for the local Harness Hub updater behavior and for version-sniff skill activation.
- Focused red tests fail before implementation and pass after implementation.
- `npm test`, `node scripts/harness-validate.mjs`, and `git diff --check` pass after the update.

## Feedback Ledger Review

- Current durable feedback rules still apply: before changing repo behavior, verify the active task spec is current, keep validation real, and preserve explicit self-check evidence.
- Relevant ledger reminders for this task: do not report a one-off manual sync as durable automation, do not skip regression checks after a user raises process quality concerns, and keep machine-enforced evidence where repeated drift is plausible.
- This task answers those reminders by adding an explicit updater plus tests for Harness Hub freshness and version-sniff routing, instead of only editing copied skill files by hand.

## Regression Self-Check

- This regression self-check is task-specific: prevent stale Harness Hub sync metadata, preserve local overlay skills during updater runs, and keep package/version sniff routing validated after every sync.
- Before implementation, prove the current repo is stale relative to `D:/harness-hub` by checking that `.codex/harness-hub-aggregation.json` does not match the source HEAD commit.
- After implementation, rerun the updater and confirm the manifest source commit matches `git -C D:/harness-hub rev-parse HEAD`.
- Validate that a version-sniff prompt still resolves to `package-release-sniffer` after the sync.
- Before final handoff, list every changed tracked file and confirm no unrelated skills or daily report artifacts drifted.
- Actual self-check completed: `node scripts/update-harness-hub.mjs --source-root D:/harness-hub` updated the manifest to `b8a5d87ed9c5ad07b594feeea52de1a0b05759d3`; focused Harness Hub tests passed; `npm test` passed with 261 tests; `node scripts/harness-validate.mjs`, `git diff --check`, and `npm run validate` all passed.

## Red Test

Run before implementation after adding focused tests:

```powershell
node --test tests/skills.test.js --test-name-pattern "Harness Hub source commit matches local source HEAD|version sniff prompt routes to package-release-sniffer"
```

Expected initial failure:

- The source-commit freshness check fails because `.codex/harness-hub-aggregation.json` still records `eebf29ad5c67d23eef898528282c1e861ea09dd5` while `D:/harness-hub` is at a newer HEAD.

Actual initial failure before implementation:

- Direct deterministic check failed: manifest commit `eebf29ad5c67d23eef898528282c1e861ea09dd5` did not match source HEAD `b8a5d87ed9c5ad07b594feeea52de1a0b05759d3`.
- Read-only activation audit already passed and selected `package-release-sniffer`, which narrows the missing piece to stale Harness Hub aggregation rather than missing routing logic.

## Deterministic Substitute

Not used. The stale-source condition and skill-activation behavior are directly testable with local files and scripts.

## Allowed Paths

- `.codex/harness-hub-aggregation.json`
- `.codex/skills/**`
- `progress.md`
- `scripts/update-harness-hub.mjs`
- `session-handoff.md`
- `tasks/current-task.md`
- `tests/skills.test.js`

## Forbidden Paths

- Do not modify generated public daily report HTML by hand.
- Do not change publish commands, remote Pages settings, or automation configuration.
- Do not modify `D:/harness-hub`.
- Do not reset hard, stash, clean, or overwrite unrelated user changes.

## Validation Commands

- `node --test tests/skills.test.js --test-name-pattern "Harness Hub source commit matches local source HEAD|version sniff prompt routes to package-release-sniffer|Harness Hub updater preserves local overlays while refreshing upstream copies"`
- `node scripts/update-harness-hub.mjs --source-root D:/harness-hub`
- `npm test`
- `node scripts/harness-validate.mjs`
- `git diff --check`

## Parallel Writes

- No parallel writes. Manual edits use `apply_patch`; the Harness Hub updater script may rewrite only allowed tracked files.

## Handoff Requirements

- Report whether the repo now matches the latest local Harness Hub source commit.
- Report how the updater preserves local overlays versus imported skills.
- Report version-sniff activation evidence for `package-release-sniffer`.
- Report all changed tracked files and any residual risks.
