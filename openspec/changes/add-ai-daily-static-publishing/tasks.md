# Tasks: add-ai-daily-static-publishing

## Documentation

- [x] Document initial GitHub Pages publishing plan.
- [x] Evaluate Skill Hub frontend and HTML reporting capabilities.
- [x] Document distribution, testing, prompt construction, source policy, and validation rules.
- [x] Create formal OpenSpec-style proposal, design, tasks, and specification.

## Pre-Implementation Decisions

- [x] Confirm target GitHub repository.
- [x] Confirm publish branch.
- [x] Confirm Pages publish directory.
- [x] Confirm final site URL.
- [x] Confirm whether Markdown source should be public.
- [x] Confirm whether historical daily report pages should be retained indefinitely.
- [x] Confirm whether automatic commit/push is allowed.
- [x] Confirm whether Skill Hub capabilities should be installed or kept as reference.
- [x] Confirm publisher implementation language and runtime.

## Implementation Readiness

- [x] Define `report.json` schema file.
- [x] Define `feed.json` schema file.
- [x] Define Markdown parser fixture set.
- [x] Define HTML template contract.
- [x] Define prompt module storage format.
- [x] Add prompt assembly command.
- [x] Add structured report write command.
- [x] Define publish config format.
- [x] Define generated-file ownership boundary.

## Test Plan

- [x] Add parser unit tests.
- [x] Add self-check JSON extraction tests.
- [x] Add good report fixtures.
- [x] Add bad report fixtures.
- [x] Add forbidden content fixtures.
- [x] Add schema validation tests.
- [x] Add feed idempotency tests.
- [x] Add HTML escaping tests.
- [x] Add structured JSON input tests.
- [x] Add structured report write tests.
- [x] Add prompt assembly tests.
- [x] Add browser smoke tests.
- [x] Add dry-run publish safety tests.

## Safety Gates

- [x] Add `build` command.
- [x] Add `test` command.
- [x] Add `test:e2e` command.
- [x] Add `validate` command.
- [x] Add `publish:dry-run` command.
- [x] Keep `publish` gated by explicit confirmation.
- [x] Document Codex automation prompt and parameters.

## Deferred Implementation

- [x] Implement Markdown to JSON conversion.
- [x] Implement HTML rendering.
- [x] Implement index and feed generation.
- [x] Implement git safety checks.
- [x] Implement normal commit.
- [x] Implement normal push.
- [x] Add publish status recording.
- [ ] Add prompt optimization update flow after user confirmation.
