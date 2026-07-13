# Evaluator Rubric

Use this rubric after implementation and before acceptance. The active Slice delivers an edition-first desktop homepage, a bounded public data projection, and one shared favicon without reopening mobile, search, scoring, or source-promotion scope.

| Dimension | Question | Score 0-2 | Notes |
| --- | --- | --- | --- |
| Alignment | Were requirement intake, selected direction, target spec, open questions, and acceptance criteria recorded before implementation? | 2 | Harness state records the `home.json` fact projection, favicon provenance, feature-survival boundary, design dials, and explicit deferment of REC-323/Aify promotion. |
| Correctness | Does the implemented behavior match the active task and feature state? | 2 | `report_date` and `report.stories` own edition membership/order; one lead, three secondary stories, compact continuation, and Source Watch-after-main replace client-side date/score inference. |
| TDD discipline | Did the work follow the agreed P0/P1/P2 matrix, with RED/GREEN evidence where practical? | 2 | Missing home export, favicon, public links, and generated-file ownership first failed focused tests; the reviewer-found historical-backfill false block gained a window-outside regression before closure. |
| Verification | Were the required checks actually run with recorded evidence? | 2 | Typecheck, focused 74/74, focused status tests, build, durable E2E, local browser acceptance, and one final `corepack pnpm run validate` all pass. |
| Scope discipline | Did this session stay within the selected task and allowed paths? | 2 | Changes are limited to homepage projection/composition, favicon links/build/publish ownership, generated public artifacts, tests, and existing governance records; no automation, mobile, search, REC-323, or Aify source behavior changed. |
| Runtime reliability | Can the standard startup path, health checks, or user flow run again? | 2 | Build emits a truthful 19,524-byte home artifact, publish plans include home/favicon, privacy scans both, and status self-check validates schema/bytes/feed-latest without blocking old backfills. |
| Browser acceptance | For Web changes, did agent-run browser acceptance prove URL, viewport, console/network, and artifact behavior? | 2 | Home, Ops, official blogs, and a representative report pass at the sole supported `1280x900`; screenshots show the new hierarchy, console/page errors are empty, and durable E2E proves home-only bootstrap plus favicon HTTP/link behavior. |
| Agentic loops | Were producer, verifier, read-only arbiter, evidence, and main-agent decision recorded for material loop work? | 2 | Main implementation, deterministic tests, one bounded read-only review, P1 correction, reviewer recheck, and browser evidence are recorded. |
| Finish closeout | Did final review, technical-debt/drift inspection, and PR/merge-readiness handling run or have explicit skip reasons? | 2 | One independent P0/P1 review found S-78; the fix was rechecked closed, and no further P0/P1 remained before the full gate. |
| Insight recommendations | Did the session produce or explicitly skip an insight audit for tool calling, AI infrastructure, docs/code conflicts, and skill/workflow extraction candidates? | 2 | A repeated broad insight pass was intentionally skipped; the existing recovery insight was converted into REC-328/S-77, while the new false-block lesson became S-78 plus a deterministic self-check regression. |
| Maintainability | Are code and repo-local docs clear enough for the next session? | 2 | A dedicated schema, one same-build producer, a single README contract, the accepted design record, feature inventory, and stable REC ledger describe the reader/runtime boundary. |
| Handoff readiness | Can a new session continue from repo-local state without guessing? | 2 | Validation, browser evidence, review/fix history, deferred boundaries, provenance hashes, and the next PR sequence are recorded in existing repo/Harness state. |

## Verdict

- The Slice is locally delivery-ready: public homepage facts now follow the edition instead of event-date/score inference, and the supplied favicon is connected end to end.
- No P0/P1 remains after the bounded independent review and final full validation.

## Residual risk

- `home.json` intentionally contains only latest, previous, four Source Watch items, and twelve archive entries; `articles.json`/`feed.json` remain the complete public data contracts.
- Cross-browser and deeper desktop accessibility hardening remain P2; mobile, tablet, narrow-screen, and touch-only variants remain explicitly unsupported.
- Repository-size validation retains the three pre-existing advisory warnings for duplicate docs assets, Git pack size, and source-status history.
