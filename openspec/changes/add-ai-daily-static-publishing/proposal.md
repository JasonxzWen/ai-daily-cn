# Change: add-ai-daily-static-publishing

## Summary

Define a formal specification for publishing the existing `ai-2` Chinese AI daily report as static HTML through GitHub Pages.

This change is documentation and specification only. It does not implement the publisher, renderer, tests, GitHub Actions, or remote Pages settings.

## Motivation

The repository is currently empty aside from documentation. Before implementation, it needs a precise contract for:

- content generation
- prompt construction
- source validation
- static artifact layout
- HTML rendering
- feed and index generation
- distribution safety
- test gates
- publish failure handling
- prompt optimization loop

The user explicitly wants a detailed spec and related documents before development.

## Scope

In scope:

- GitHub Pages static publishing architecture.
- `report.md`, `report.json`, `report.html`, `index.html`, `feed.json`, and `style.css` contracts.
- Prompt modules, good cases, bad cases, source policy, and validation rule sets.
- Distribution and git safety rules.
- Required test layers and acceptance gates.
- Skill Hub reference evaluation for frontend and HTML reporting capabilities.

Out of scope:

- Implementing a publisher.
- Creating or changing GitHub Actions.
- Enabling Pages remotely.
- Installing the full Skill Hub web profile. A later follow-up may selectively install narrow repo-local capabilities such as `html-work-reports` when they are covered by validation.
- Modifying `C:\Users\Admin\.codex\automations\ai-2\automation.toml`.
- Committing or pushing changes.

## Deliverables

- `docs/ai-daily-report-github-pages-plan.md`
- `docs/skill-hub-frontend-html-capability-evaluation.md`
- `docs/ai-daily-distribution-testing-prompt-spec.md`
- `openspec/config.yaml`
- `openspec/changes/add-ai-daily-static-publishing/design.md`
- `openspec/changes/add-ai-daily-static-publishing/tasks.md`
- `openspec/changes/add-ai-daily-static-publishing/specs/ai-daily-static-publishing/spec.md`

## Open Questions

- Is the target repository definitely `JasonxzWen/ai-daily-cn`?
- Should Pages publish from `main` `/docs`, or should the project start with GitHub Actions?
- Should Markdown source files be publicly served?
- Is automatic commit/push allowed after validation is implemented?
- Should final push status be reflected in public JSON, or only in automation run logs?
- Should additional Skill Hub capabilities beyond the selectively installed `html-work-reports` skill be installed later, or kept as references only?
