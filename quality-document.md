# Quality Snapshot

Use this document to track product areas and architecture layers across sessions.

Update after material sessions, before a new phase, or when validation evidence changes the quality picture.

## Rating Standard

- A: all required validation passes, boundaries are clean, agent-readable, and tests are stable.
- B: validation passes with minor readability, coverage, or stability gaps.
- C: partially usable with known gaps or areas that are hard for agents to reason about.
- D: unusable or structurally unsafe for continued work.

## Product Areas

| Area | Rating | P0/P1/P2 validation status | Browser acceptance status | Agent readability | Test stability | Key gaps | Last updated |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Public article index artifact | A | P0 passed: article contract, privacy scan, build-clean, regular and daily publish-plan assertions, full validate | Deferred; no UI behavior changed | Good | Stable in `tests/article-index.test.js` and `tests/publish.test.js` | Future DAG node schemas still need per-node replay | 2026-07-03 |
| Daily Codex DAG manifest contract | B | P0 targeted manifest validator, DAG negative tests, workflow contract, and existing pipeline compatibility passed | Deferred; no UI behavior changed | Good | New `tests/daily-codex-dag.test.js` covers manifest regressions | Full executable 16-node runner migration and per-node real schemas remain future work | 2026-07-03 |

## Architecture Layers

| Layer | Rating | Boundary health | Agent readability | Key gaps | Last updated |
| --- | --- | --- | --- | --- | --- |
| Public/private artifact boundary | A | `docs/articles.json` is now included in public scans with internal audit field denylist coverage | Good | DAG audit artifacts are not yet formalized per node | 2026-07-03 |
| DAG contract layer | B | `config/daily-codex-dag.json` references resilience policy instead of duplicating failure rules, and validates artifact path ownership | Good | Manifest is a contract skeleton; runner still uses coarse stages | 2026-07-03 |

## Change History

### YYYY-MM-DD

- Change:
- Improved:
- Regressed:
- New gaps:
- Closed gaps:

### 2026-07-03

- Change: Added a validated daily Codex DAG manifest contract and `dag:validate` gate.
- Improved: Future DAG nodes now have auditable IDs, dependency boundaries, schema refs, fixture refs, artifact ownership, and resilience policy references before runner migration.
- Regressed: None known.
- New gaps: Full executable DAG runner, true per-node I/O schemas, and replay fixtures still need later stages.
- Closed gaps: DAG refactor now has a durable manifest gate in `npm run validate`.

### 2026-07-03

- Change: Added public privacy scanning coverage for `docs/articles.json` and tests for article schema negative cases, deterministic index generation, and regular/daily publish plan staging.
- Improved: Public article index boundary is validation-backed, including the date-scoped daily publish path.
- Regressed: None known.
- New gaps: Full Codex CLI DAG still needs per-node schemas and replay fixtures.
- Closed gaps: `docs/articles.json` is no longer outside the default public artifact privacy scan.
