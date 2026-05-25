# ai-daily-static-publishing Specification

## Purpose

Define the contract for publishing the `ai-2` Chinese AI daily report as a static GitHub Pages site with deterministic content artifacts, validation gates, prompt construction rules, and safe distribution behavior.

## ADDED Requirements

### Requirement: Static artifact layout

The system SHALL publish daily report artifacts under a stable static directory layout.

#### Scenario: Daily report artifacts are written by date
- **WHEN** a report has `report_date` `2026-05-13`
- **THEN** the Markdown is written to `docs/reports/2026/05/2026-05-13.md`
- **AND** the HTML is written to `docs/reports/2026/05/2026-05-13.html`
- **AND** the JSON is written to `docs/data/2026/05/2026-05-13.json`

#### Scenario: Site-level artifacts are updated
- **WHEN** a report is successfully rendered
- **THEN** `docs/index.html` is regenerated
- **AND** `docs/feed.json` is updated
- **AND** `docs/assets/style.css` exists

### Requirement: Report JSON contract

The system SHALL produce a deterministic `report.json` object for each report.

#### Scenario: Structured draft is normalized locally
- **WHEN** the scheduled task creates a daily structured report draft
- **THEN** the repository provides a command to validate and write it under `reports-data/YYYY/MM/YYYY-MM-DD.json`
- **AND** the command fills deterministic publishing metadata without guessing factual content

#### Scenario: Required fields are present
- **WHEN** a report JSON file is generated
- **THEN** it includes `schema_version`, `report_date`, `title`, `summary`, `canonical_url`, `main_items`, `projects`, `builder_observations`, `community_leads`, `self_check`, `publish_status`, and `generated_at`

#### Scenario: Dates are normalized
- **WHEN** a report or item date is serialized
- **THEN** it uses `YYYY-MM-DD`

#### Scenario: Missing optional sections
- **WHEN** a report has no projects, builder observations, or community leads
- **THEN** the corresponding JSON fields are empty arrays rather than guessed content

### Requirement: Feed contract

The system SHALL maintain an idempotent `feed.json`.

#### Scenario: Same date rerun updates existing feed entry
- **WHEN** `feed.json` already contains `report_date` `2026-05-13`
- **AND** the publisher reruns for `2026-05-13`
- **THEN** the existing entry is replaced
- **AND** no duplicate entry is added

#### Scenario: Feed order is deterministic
- **WHEN** multiple reports exist
- **THEN** `reports` are sorted by `report_date` descending

### Requirement: HTML rendering contract

The system SHALL render accessible, auditable static HTML pages.

#### Scenario: Daily report primary artifact is HTML
- **WHEN** the scheduled task finishes a daily report
- **THEN** the human-facing artifact is a static HTML page under `docs/reports/YYYY/MM/YYYY-MM-DD.html`
- **AND** Markdown is not required as the daily primary artifact

#### Scenario: Report page contains core sections
- **WHEN** report HTML is generated
- **THEN** it contains the report title, report date, summary, main items, source links, self-check summary, and JSON link

#### Scenario: Report page is self-contained
- **WHEN** report HTML is generated
- **THEN** it includes the CSS required to read the page without loading remote assets
- **AND** it remains readable on desktop and mobile viewports

#### Scenario: External links are safe
- **WHEN** a report includes an external URL
- **THEN** the rendered anchor uses `rel="noopener noreferrer"`

#### Scenario: Remote scripts are not used
- **WHEN** HTML is rendered
- **THEN** it does not include remote script tags

### Requirement: Prompt package construction

The system SHALL keep the report-generation prompt contract modular and reviewable.

#### Scenario: Prompt modules are represented
- **WHEN** the prompt contract is documented or generated
- **THEN** it includes modules for `base`, `date_scope`, `source_policy`, `watchlist`, `selection_rules`, `output_markdown`, `structured_candidates`, `validation_rules`, `publish_status`, and `optimization_loop`

#### Scenario: Prompt can be assembled inside the repository
- **WHEN** the local scheduled task runs from the repository root
- **THEN** the repository provides a prompt assembly command
- **AND** the command reads versioned prompt modules from the repository
- **AND** the task does not need to change into another path before running

#### Scenario: Prompt optimization requires confirmation
- **WHEN** a self-check suggests changing the automation prompt
- **THEN** the system records the suggestion
- **AND** does not modify `automation.toml` until the user explicitly confirms

### Requirement: Source validation

The system SHALL prioritize first-hand sources and reject unverifiable claims.

#### Scenario: Official source is available
- **WHEN** an event has an official blog, paper, model card, GitHub release, or original benchmark
- **THEN** that source is preferred as the final citation

#### Scenario: Media-only item lacks original source
- **WHEN** an item is based only on media coverage and cannot be traced to a primary source
- **THEN** it is not included as a main item
- **AND** it may only appear as a clearly marked community lead if useful

#### Scenario: Official docs lack a dated release source
- **WHEN** an official docs page shows a changed product state but lacks a dated changelog, release note, RSS entry, commit, or official dated post
- **THEN** it is not included as a main item
- **AND** it may only appear as a community lead marked as awaiting dated-source confirmation

#### Scenario: Unsourced number is detected
- **WHEN** a claim contains a numeric performance, cost, count, or benchmark value without a source
- **THEN** validation fails or the number is removed before publishing

### Requirement: Content quality rules

The system SHALL preserve the existing AI daily report quality contract.

#### Scenario: Builder observations are separate
- **WHEN** a builder observation is included
- **THEN** it is not counted in `main_items`

#### Scenario: Main item quota is not force-filled
- **WHEN** fewer than five high-quality main items are available in the default window
- **THEN** the system may widen the window and record the decision in self-check notes
- **AND** it does not add low-quality filler

#### Scenario: Source coverage is broadened before time expansion
- **WHEN** the default window has fewer than five high-quality main items
- **THEN** the system checks additional first-hand source categories before expanding beyond 48 hours
- **AND** any item older than 48 hours must be an open-source release or official research/product update from the recent five-day window that directly changes an engineering workflow

### Requirement: Candidate pool hard gate

The system SHALL require a replayable candidate pool before accepting a new structured daily report.

#### Scenario: Report entries reference candidates
- **WHEN** `report:write` accepts a structured daily report
- **THEN** it also reads a candidate pool for the same report date
- **AND** every `main_items`, `model_releases`, `hot_blogs`, `projects`, and `builder_observations` entry references an included candidate by `candidate_id`
- **AND** each referenced candidate has the same URL and event date as the report entry

#### Scenario: Candidate pool is missing or inconsistent
- **WHEN** a new structured daily report lacks a candidate pool or references a missing candidate
- **THEN** `report:write` fails before writing publish artifacts
- **AND** the error identifies the missing or invalid candidate reference

#### Scenario: Candidate pool is retained
- **WHEN** a report is written and built
- **THEN** the candidate pool is stored beside the structured report data
- **AND** the generated site includes a public `docs/data/YYYY/MM/YYYY-MM-DD.candidates.json` copy

#### Scenario: Same-vendor small updates are merged
- **WHEN** one vendor publishes multiple small updates in the same day or 48-hour window
- **THEN** the report combines them into one vendor item by default
- **AND** it only splits them when the updates change different engineering workflows, sources, or risk surfaces

#### Scenario: Recent duplicate URLs are blocked from main items
- **WHEN** a candidate URL has appeared in any report section during the previous seven days
- **THEN** `report:write` rejects a new report that puts the same URL into `main_items`
- **AND** the report may still publish with fewer main items instead of filling with repeated material

#### Scenario: Same-day cross-section duplicates are blocked
- **WHEN** the same URL appears in more than one of `main_items`, `model_releases`, or `hot_blogs`
- **THEN** `report:write` rejects the draft before writing artifacts

#### Scenario: Old items are kept out of the lead
- **WHEN** an item is more than 48 hours older than the report date
- **THEN** it cannot appear in `summary` or `main_items`
- **AND** old background/community material is limited to one included candidate per report

#### Scenario: Banned phrases are detected
- **WHEN** the report contains banned stock phrases from the prompt contract
- **THEN** validation fails before publishing

### Requirement: Publish status

The system SHALL record publish status explicitly.

#### Scenario: Publish succeeds
- **WHEN** HTML is generated, repo files are updated, and push succeeds
- **THEN** `publish_status.html_generated`, `publish_status.repo_updated`, and `publish_status.repo_pushed` are `true`
- **AND** `publish_status.pages_url` is populated
- **AND** `publish_status.publish_error` is an empty string

#### Scenario: Publish fails
- **WHEN** any publish step fails
- **THEN** the failed step is reflected in `publish_status`
- **AND** `publish_status.publish_error` contains a concise error code and message

### Requirement: Git safety

The system SHALL avoid destructive git operations.

#### Scenario: Real publish requires explicit confirmation
- **WHEN** the real publish command is run without an explicit confirmation flag
- **THEN** publishing stops
- **AND** no commit or push is attempted

#### Scenario: Worktree contains unrelated changes
- **WHEN** `git status --porcelain` shows changes outside the publisher-owned file set
- **THEN** publishing stops
- **AND** no commit or push is attempted

#### Scenario: Remote is ahead
- **WHEN** the remote branch contains commits not present locally
- **THEN** publishing stops
- **AND** no force push is attempted

#### Scenario: Push fails
- **WHEN** ordinary push fails
- **THEN** the system records `push_failed`
- **AND** does not run `git reset --hard`
- **AND** does not run `git push --force`

### Requirement: Verification gates

The system SHALL provide repeatable verification before automated publishing is enabled.

#### Scenario: Build command exists
- **WHEN** implementation begins
- **THEN** a `build` command is defined to generate static site artifacts without git operations

#### Scenario: Test command exists
- **WHEN** parser, schema, renderer, or feed behavior is implemented
- **THEN** a `test` command verifies those behaviors

#### Scenario: Browser verification exists
- **WHEN** HTML output is implemented
- **THEN** a browser test verifies at least `index.html` and one report page

#### Scenario: Validate command gates publishing
- **WHEN** automatic publish is enabled
- **THEN** a `validate` command passes before commit or push

### Requirement: Skill Hub adoption remains gated

The system SHALL treat Skill Hub as an optional capability source until explicitly adopted.

#### Scenario: Skill Hub is used for planning
- **WHEN** the repository references Skill Hub capabilities
- **THEN** it records which capabilities are relevant and why
- **AND** does not install them as part of this documentation-only change

#### Scenario: Skill Hub is installed later
- **WHEN** the user authorizes installation
- **THEN** the system first runs a dry-run and reviews the write set before applying changes
