# Progress

## 2026-06-12 Index CSS Cache Bust Hotfix

- Status: implemented locally; full validation passed; ready to publish to `main`.
- Root cause: deployed `index.html` referenced `assets/style.css` without a content version, so browsers could keep using a cached old stylesheet even when the bare Pages URL had new HTML.
- Fix: `buildSite` now passes a SHA-256 content hash of `defaultStyleCss` into `renderIndexHtml`, which emits `assets/style.css?v=<hash>` for the homepage stylesheet.
- Generated `docs/index.html` now references `assets/style.css?v=e5713fe52f44`.
- Validation so far: target `buildSite` unit test passed, `node --check src/site.js`, `node --check src/render.js`, `npm run build`, and `npm run validate` passed.
- Next: commit, push to `main`, and confirm `https://jasonxzwen.github.io/ai-daily-cn/` returns the versioned stylesheet href without requiring a URL query.

## 2026-06-12 Effective-Interact Index PR

- Status: index UI rewrite PR is open as draft PR #81.
- Branch: `codex/effective-interact-index`.
- PR: `https://github.com/JasonxzWen/ai-daily-cn/pull/81`.
- Validation before PR update: `npm run validate` passed after the rebase conflict notes were recorded.
- Publish dry-run was captured before real publish and blocked with `wrong_branch`; direct Pages publish is still gated to `main`.
- Direct Pages publish was not forced from the feature branch; update the public site after merge to `main` or by rerunning the approved publish flow from `main`.
- Existing `.playwright-cli/` remains unrelated and was not staged.

## 2026-06-12 Batch 3 Live Tracking Adapters

- Status: Batch 3 live tracking adapters are implemented and verified.
- Added source-backed snapshot extensions:
  - OpenRouter `history_entries` for weekly stacked usage rows.
  - Artificial Analysis `component_tabs` for Score, Token Usage, Cost, Score vs. Token Usage, Score vs. Cost, and Score vs. Compute when source text exposes those values.
- Updated `src/discovery.js` to parse those extended source snapshots from page text/HTML-like captures.
- Updated `src/draft.js` sanitizer so extended snapshot fields survive source audit to `daily_tracking`.
- Updated `src/tracking-components.js` so OpenRouter top-models uses historical rows when present and AA tabs stop falling back when source tab rows exist.
- Extended effective-interact renderer/CSS for grouped stacked rows with hover data and mobile-safe layout.
- Updated `schemas/report.schema.json`, `config/feedback-ledger.json`, and `docs/feedback-buglist-quick-reference.md`.

### Batch 3 Red Evidence

| Command | Status | Evidence |
|---|---|---|
| `node --test tests/unit.test.js --test-name-pattern "collectContentSources stores OpenRouter weekly history|collectContentSources stores Artificial Analysis token cost and scatter tabs"` | red | Failed because `snapshot.history_entries` and `snapshot.component_tabs` were undefined. |

### Batch 3 Green Evidence So Far

| Command | Status | Evidence |
|---|---|---|
| `node --test tests/unit.test.js --test-name-pattern "collectContentSources stores OpenRouter weekly history|collectContentSources stores Artificial Analysis token cost and scatter tabs"` | pass | Both extended source snapshot tests passed. |
| `node --test tests/skills.test.js --test-name-pattern "effective-interact filterable cards render local tracking components|effective-interact renders Artificial Analysis collected tabs"` | pass | OpenRouter stacked rows and AA non-fallback tabs rendered and validated. |
| `node --test tests/unit.test.js tests/skills.test.js` | pass | 274 passed, 1 skipped. |
| `npm run build` | pass | Rebuilt public docs after schema/render changes. |
| `npm run quality:page-check -- 2026-06-12 docs .tmp/page-check-2026-06-12-batch3.json` | pass | Desktop 1280x900 and mobile 375x812 page checks passed. |
| `npm run test:e2e` | pass | Public page E2E passed. |
| `npm run validate` | pass | Full repository gate passed: harness, feedback, workflow, sources, tests, build, privacy, E2E, and `git diff --check`. |

## 2026-06-12 Batch 2 Tracking Components

- Status: Batch 2 foundation is implemented and verified.
- Implemented `src/tracking-components.js` for deterministic `tracking_component_snapshot` generation, public trace shaping, data hashes, fallback reasons, and interaction-card component input.
- Wired component snapshots through `src/draft.js`, `src/report.js`, `src/interaction-report.js`, and `schemas/report.schema.json`.
- Added effective-interact rendering for local tracking components: tabs, linear/log scale buttons, hover tooltip attributes, leaderboard/table view, fallback panels, and trace details without third-party runtime JS.
- Added CSS/JS support in `.codex/skills/effective-interact/assets/components/interaction-ui.css` and `.codex/skills/effective-interact/assets/components/interaction-ui.js`.
- Added durable feedback item `feedback/p1-tracking-component-reconstruction` and quick-reference row.
- Added tests in `tests/unit.test.js`, `tests/skills.test.js`, and `tests/e2e/site.e2e.js`.

### Batch 2 Red Evidence

| Command | Status | Evidence |
|---|---|---|
| `node --test tests/unit.test.js --test-name-pattern "tracking component snapshot exposes OpenRouter and Artificial Analysis trace data"` | red | Failed with `ERR_MODULE_NOT_FOUND` for `src/tracking-components.js`. |
| `node --test tests/skills.test.js --test-name-pattern "effective-interact filterable cards render local tracking components and public trace"` | red | Generated HTML lacked `data-tracking-component`. |

### Batch 2 Green Evidence

| Command | Status | Evidence |
|---|---|---|
| `node scripts/validate-feedback-contract.mjs` | pass | Returned `{ ok: true, failures: [] }`. |
| `node --test tests/unit.test.js tests/skills.test.js` | pass | 271 passed, 1 skipped. |
| `npm run sources:validate` | pass | 148 source registry entries validated. |
| `npm run build` | pass | Rebuilt public docs for 30 report dates. |
| `npm run quality:page-check -- 2026-06-12 docs .tmp/page-check-2026-06-12-batch2.json` | pass | Desktop 1280x900 and mobile 375x812 checks passed. |
| `npm run test:e2e` | pass | E2E passed, including tracking component tabs/scale/tooltip/trace checks. |
| `npm run validate` | pass | Full repository gate passed: harness, feedback, workflow, sources, tests, build, privacy, E2E, and `git diff --check`. |

### Batch 2 Residual Risk

- Artificial Analysis Token Usage/Cost/Scatter tabs are now explicit component tabs with `source_tab_not_collected` fallback when source snapshots do not yet carry those values.
- OpenRouter local component currently reconstructs ranked usage bars and leaderboard from available snapshot rows; historical stacked-by-week series still needs a stable source-data adapter.

## Current State

- Active task: implement AI daily content quality plan Batch 1 plus Batch 2 tracking component foundation.
- Status: Batch 1 and Batch 2 foundation implementation are complete; final full `npm run validate` passed after harness updates.
- No daily publish runner was executed in this task.
- Batch 2 local tracking component foundation is implemented. Remaining work is deeper live source adapters for Artificial Analysis token/cost/scatter tabs and OpenRouter historical stacked-by-week series.

## Completed

- Reviewed `config/feedback-ledger.json` and `docs/feedback-buglist-quick-reference.md` before implementation.
- Rewrote the active SDD/TDD spec in `tasks/current-task.md` around the user-aligned plan.
- Added red unit tests before production implementation.
- Recorded the initial red failure for the icon resolver contract.
- Implemented Batch 1 production modules:
  - `src/link-icons.js`
  - `src/github-readme.js`
  - `src/chinese-media.js`
  - `src/official-updates.js`
- Wired Batch 1 into report generation and rendering:
  - `src/draft.js`
  - `src/report.js`
  - `src/site.js`
  - `src/interaction-report.js`
  - `src/importance.js`
- Updated schema support in `schemas/report.schema.json`.
- Updated source configuration:
  - QbitAI direct RSS remains enabled.
  - SSPAI direct RSS is enabled.
  - Machine Heart uses `https://www.jiqizhixin.com/articles` as a non-RSS source entry.
- Added long-lived feedback ledger coverage:
  - `feedback/p1-link-icon-resolver`
  - `feedback/p1-github-readme-enrichment`
  - `feedback/p1-chinese-media-dynamics`
  - `feedback/p1-official-org-updates-section`
  - `feedback/p1-platform-unconfigured-degraded`
- Updated `docs/feedback-buglist-quick-reference.md`.
- Ran build and refreshed generated public report JSON/HTML under `docs/data/**` and `docs/reports/**`.
- Ran desktop and mobile page check for the 2026-06-12 report.
- Refreshed harness files to match actual Batch 1 implementation state.

## Not Included In This Task

- Daily publish runner.
- Git commit, push, or GitHub Pages settings changes.
- Artificial Analysis live Token Usage, Cost, and scatter extraction adapter.
- OpenRouter historical stacked-by-week extraction adapter.

## Batch 2 Red/Green Flow

### Contract And Static Tests

- Red: missing `tracking_component_snapshot` module/schema and public trace fields.
- Green: schema/static validators accept normalized snapshots and public trace while keeping raw DOM out of public output.

### Unit Tests

- Red: OpenRouter/AA tracking component helpers and trace diff helpers are missing.
- Green: available snapshot data produces stable tabs, rows, hashes, cache status, and fallback reasons.

### Integration Tests

- Red: draft/build paths do not emit component snapshots.
- Green: report JSON includes OpenRouter/AA component snapshots and public trace objects.

### E2E And Visual Tests

- Red: public page lacks local interactive components or hover/tabs.
- Green: desktop/mobile checks prove components are nonblank, not screenshot-dependent, have tabs/scale/tooltip/trace, and have no overlap.

## Validation Records

| Command | Status | Evidence |
|---|---|---|
| `node --test tests/unit.test.js --test-name-pattern "icon resolver uses link domain icons and records fallback metadata"` | red | Failed with `ERR_MODULE_NOT_FOUND` for `src/link-icons.js`, proving the new resolver contract was absent before implementation. |
| `node --test tests/unit.test.js` | pass | 248 tests passed after implementing Batch 1 modules and schema wiring. |
| `node scripts/validate-feedback-contract.mjs` | pass | Returned `{ ok: true, failures: [] }`. |
| `npm run sources:validate` | pass | Source registry validated; QbitAI/SSPAI/Machine Heart source decisions accepted. |
| `npm run build` | pass | Generated public `docs/data/**` and `docs/reports/**` artifacts without build failure. |
| `npm run quality:page-check -- 2026-06-12 docs .tmp/page-check-2026-06-12-batch1.json` | pass | Desktop 1280x900 and mobile 375x812 checks passed; no overlap or horizontal overflow reported. |
| `npm run test:e2e` | pass | E2E suite completed successfully. |
| `git diff --check` | pass | No whitespace errors. |
| `npm run validate` | pass | Full repository gate passed: harness, feedback, workflow, sources, tests, build, privacy, E2E, and `git diff --check`. |
| `node scripts/harness-validate.mjs` | pass | Included in `npm run validate`; `Harness validation passed.` |

## Blockers

- None for Batch 1.

## Residual Risk

- Machine Heart extraction is currently configured as a non-RSS source entry; a dedicated dynamic adapter may still be needed if the static HTML route changes or blocks extraction.
- GitHub README enrichment has deterministic/cache contract wiring; live README fetching and LLM generation policy should be hardened in the next data-collection pass.
- OpenRouter/AA local component foundation is landed, but the current data adapters do not yet provide every original-site data series. Do not describe AA Token Usage/Cost/scatter or OpenRouter historical stacked-by-week as fully sourced until those adapters are added.
- Generated historical report artifacts changed because `npm run build` refreshed public outputs after schema/render changes.
