# Feedback Buglist Quick Reference

This file is the human-readable companion to `config/feedback-ledger.json`. Treat the JSON ledger as the machine contract and this document as the pre-work scan list.

## Mandatory Flow

- Before any repository modification, review `config/feedback-ledger.json` and this quick reference.
- Record the applicable items in `tasks/current-task.md` under `Feedback Ledger Review`.
- Before handoff, record the concrete checks performed under `Regression Self-Check`.
- If the user confirms a new issue should persist, add or update a P1 ledger item with scope files, a validation command covered by `npm run validate`, and an existing test or runtime gate. Also update this quick reference.
- If a feedback item cannot yet be bound to a test or gate, mark it as a session-local note instead of claiming durable memory.

## Quick List

| Ledger ID | Problem To Avoid | Fixed Rule | Self-Check Before Delivery | Validation |
|---|---|---|---|---|
| `feedback/p1-optimization-suggestions-contract` | Follow-up suggestions used incompatible field shapes. | Normalize `self_check.optimization_suggestions` to one canonical contract and reject arbitrary objects. | Check new report suggestions use `issue`, `evidence`, `module`, `suggestion`, `expected_benefit`, and `requires_user_confirmation`. | `node --test tests/unit.test.js` |
| `feedback/p1-ledger-validation-binding` | User feedback could remain advice without a durable gate. | P1 feedback must bind to real scope files, a validation command, and a test/runtime gate. | Check every user-confirmed persistent issue has a ledger entry and validation binding. | `node scripts/validate-feedback-contract.mjs` |
| `feedback/p1-origin-main-baseline` | New runs could start from stale local `main`. | Report and publish quality must prove current `origin/main` baseline. | Check daily publish outputs include current `origin_main_sha` and block stale baselines. | `node --test tests/unit.test.js tests/publish.test.js` |
| `feedback/p1-clean-publish-checkout` | Scheduled publishes could run from dirty or detached worktrees. | Scheduled runs use a dedicated clean checkout from current `origin/main`. | Check launcher worktree changes are not committed, stashed, switched, cleaned, or used as publish source. | `npm run test` |
| `feedback/p1-source-outage-disclosure` | Source outages could be hidden by old populated sections. | Network-wide source discovery outage is exposed as degraded quality. | Check blocked fixed-source groups are visible in `source_audit` and public quality status. | `node --test tests/unit.test.js` |
| `feedback/p1-search-provider-partials` | One search provider failure could obscure healthy partial results. | Preserve provider-level partial candidates, timing, and errors. | Check search discovery keeps healthy provider output and records failed provider counts. | `node --test tests/unit.test.js` |
| `feedback/p1-discovery-output-json` | PowerShell stdout capture could pollute JSON with BOM, encoding, or npm banners. | JSON-producing discovery commands support direct clean UTF-8 `--output`. | Prefer command-native `--output` for JSON artifacts; do not rely on `Tee-Object` for machine JSON. | `node --test tests/unit.test.js` |
| `feedback/p1-main-visible-bullets-no-generic-watch-next` | Public main bullets showed repeated generic metadata. | Keep generic `watch_next` and `why_it_matters` out of visible main bullets. | Inspect generated report body for repeated generic watch-next prose and mojibake. | `node --test tests/unit.test.js` |
| `feedback/p1-main-groups-first-level-navigation` | Main-topic groups were hidden under a noisy parent navigation item. | Promote main item groups to first-level navigation; omit parent `主体信息`. | Check public navigation labels are actual topic groups, not a generic wrapper. | `node --test tests/unit.test.js` |
| `feedback/p1-domestic-dynamics-public-visibility` | Qualified domestic China AI signals could be buried. | Surface verified domestic signals inside existing public sections without weakening source gates. | Check Chinese/domestic candidates are visible when qualified, and intermediary-only facts are not promoted. | `node --test tests/unit.test.js` |
| `feedback/p1-ai-quality-review-loop` | Drafts could pass structure while retaining AI tone, thin bullets, translation drift, or noisy highlights. | Run AI-ready quality review, safe repair, candidate back-reference checks, and page checklist before publish. | Check daily publish includes quality review results and targeted page checklist evidence. | `node --test tests/unit.test.js` |
| `feedback/p1-feedback-memory-self-check` | Fixes could be forgotten because each new task did not force ledger review or regression self-check. | Every task spec must include meaningful `Feedback Ledger Review` and `Regression Self-Check`; harness validation fails otherwise. | Check current-task sections name applicable ledger items and concrete anti-regression checks before final handoff. | `node --test tests/unit.test.js` |
