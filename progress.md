# Progress

## 2026-06-02 Strict Publish Coverage Gate

- Current branch: `codex/harden-daily-publish-coverage` in `D:\ai-daily-cn`.
- PR #11 and PR #13 are already merged into `main`; PR #14 remains open for the suggestion-rendering follow-up. This branch adds the next global guardrail: 2026-06-02+ reports cannot publish unless the final JSON proves the fixed source surface and version state.
- Added strict publish issues in `src/quality-status.js` for missing/stale `self_check.automation_revision`, missing A-F source audit proof, GitHub Trending Top 10/source audit gaps, missing follow-builders X coverage, missing linked local evidence assets, and model releases not mirrored in `main_items`.
- Updated prompt/runbook/docs so automations treat these as publish blockers, not reflection suggestions or environment failures. Also corrected the runbook content-source command to use `--limit 60 --per-source-limit 3`.
- Validation passed: `node --test tests\unit.test.js`, `npm run validate`, and `node scripts\harness-validate.mjs`.
- Boundary: no 2026-06-02 report publish/regeneration was performed, and the untracked evidence images remain intentionally untouched.

## 2026-06-02 AI Daily Automation Recovery

- Root cause: `main`/`origin/main` were aligned at `ccdd5cd`, but the broad source/quality fixes were still draft/unmerged in PR #11, so scheduled runs on `main` could not see them. This is why the 2026-06-02 scheduled report looked like an old version.
- Work is isolated in `D:\tmp\ai-daily-quality-hardening` on branch `codex/ai-daily-quality-hardening`. Do not mix main worktree 2026-06-02 generated publish artifacts into this PR.
- Confirmed referenced Lark doc `QjqfdnpPaosaaxxzRWRcMKhSnxe` revision `26111` covers AIGC/content industry, product/tool movement, podcasts, and X/Twitter discussion; encoded that coverage into prompts/docs/tests.

## Fixes In PR #11

- Added candidate-rich hard gates:
  - `main_items_coverage_gate_failed`
  - `content_units_coverage_gate_failed`
  - `model_releases_missing_main_item`
- Extended GitHub API fallback eligibility to Git transport failures:
  - `git_fetch_unavailable`
  - `git_push_unavailable`
  - `remote_ahead` remains non-bypassable.
- Registered/pinned the requested source surface, including ML Papers of the Week, HelloGitHub, RuanYF Weekly, OpenAI Blog RSS, Google DeepMind RSS, MIT Technology Review, VentureBeat AI, arXiv cs.AI, HN API, Hugging Face Daily Papers, Papers with Code API, Reddit r/MachineLearning, Smol AI News, AI News Archive, Ben's Bites, plus Chinese intermediary leads such as 36Kr, QbitAI, Jiqizhixin, and InfoQ CN.
- Added `prompts/ai-daily/modules/fixed-source-checklist.md` and prompt tests requiring the source surface plus six output buckets: `Big-company moves`, `Models and papers`, `Products and tools`, `Industry and funding`, `Open-source projects`, and `Opinions and long-form reads`.
- Added `src/automation-revision.js` and wired `writeReportDraft(...)` to populate `self_check.automation_revision` with git commit, branch, prompt manifest/modules, source registry count, and active hardening rules. Future report JSON can prove exactly which repo revision generated it.
- Added item-level `importance` labels across public content sections. `report:write` now fills `major`, `notable`, or `general` defaults; schema validates those values; public HTML/effective-interact render them as `重大`, `值得关注`, or `一般`.

## Validation

- `npm run sources:validate` passed with `source_count: 63`, enablement counts `core: 28`, `optional: 32`, `manual: 3`.
- `npm run prompt:build -- 2026-06-02` confirmed the fixed source list and six buckets are present.
- `node --test tests\unit.test.js --test-name-pattern "automation revision|report:write records automation"` ran the unit file and passed 89 subtests.
- Full `npm run validate` passed after the latest revision fingerprint change: source validation, 136 tests, build, e2e, OpenSpec, and `git diff --check`.
- `node scripts\harness-validate.mjs` passed after compacting this progress file.
- After the importance-label patch, full `npm run validate` passed with 137 tests. Playwright visual acceptance on a temporary effective-interact report passed for desktop 1280x900 and mobile 390x844: the `重大` label rendered and there was no horizontal overflow.

## Current State

- PR #11 is the recovery PR for the scheduled automation quality/source fixes.
- The automation will continue running old `main` behavior until PR #11 is merged into `main`.
- No reset, stash, force push, remote Pages setting change, or generated 2026-06-02 publish artifact mixing was performed in this PR worktree.
