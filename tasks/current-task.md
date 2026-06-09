# Current Task

## Task Class

non-trivial

## Spec

### Goal

Implement three independent platform-level exempt content channels for WeChat, Zhihu, and Reddit. Each channel must have its own candidate category, report section, source audit group, discovery command, render section, and deterministic gate.

### User-Visible Behavior

- The public daily report can show three new independent sections: `wechat_items`, `zhihu_items`, and `reddit_items`.
- These sections publish platform signals automatically after deterministic checks, but every item uses weak-claim wording and publicly discloses `platform`, `source_id`, `rule_id`, `source_level`, `verification_status`, and the no-primary-verification disclosure.
- Platform exempt items never enter `main_items`, `model_releases`, `hot_blogs`, `projects`, `builder_observations`, `community_leads`, or `hero_highlights`.
- Platform exempt items do not count toward `SECTION_MINIMUMS`, `CONTENT_UNIT_MINIMUM`, or main publish coverage.
- Discovery rules are stored in versioned source registry config; runtime secrets may provide feed URLs, but the matching rules themselves stay in the repository.

### Boundaries

- Phase 1 only supports stable parseable source kinds already in the repository: `rss`, `html_index`, `rsshub`, `rss_bridge`, `aggregator`, and `search_api`.
- Do not add AI/LLM classifiers.
- Do not add dynamic page scraping, login-state scraping, cookie-dependent scraping, or Playwright collection for these channels.
- Do not call these channels strict whitelists; the accepted design is platform-level exempt discovery with versioned deterministic rules.
- Do not weaken existing source authority gates for factual sections.
- Do not commit, push, open PR, or merge until validation passes.

### Non-Goals

- Do not redesign the whole daily publish pipeline.
- Do not make these channels part of `main_items` or `hero_highlights`.
- Do not introduce broad platform search without repository-configured include/exclude/host/date/max-item gates.
- Do not require live third-party credentials for tests.

## Acceptance Criteria

- `schemas/sources.schema.json` accepts platform source rules for WeChat, Zhihu, and Reddit with platform, allowed hosts, include/exclude keywords, disclosure label, kill switch, and max item settings.
- `schemas/candidates.schema.json` accepts `wechat_item`, `zhihu_item`, and `reddit_item` categories plus `wechat_items`, `zhihu_items`, and `reddit_items` destinations.
- `schemas/report.schema.json` accepts the three new top-level sections and `source_audit.wechat_sources`, `source_audit.zhihu_sources`, and `source_audit.reddit_sources`.
- `report:write` enforces platform item candidate back-references, section/category matching, public disclosure fields, deterministic weak-claim wording, host/rule consistency, and source audit consistency.
- Platform items are not counted by strict section minimums, content unit density, or selection degradation.
- Public rendering shows three independent sections with platform, date, title, weak claim, source/rule id, and no-primary-verification disclosure.
- Discovery commands exist for the three channels and can write clean JSON output through the existing CLI output path.
- Unit/schema/render tests cover valid items, wrong-section failures, missing disclosure failures, fact-claim wording failures, kill-switch/source-rule failures, and non-counting in quality gates.
- `npm run validate` passes before PR creation.
- A PR is created from `codex/platform-exempt-channels`, merged into `main`, and the merge result is confirmed against remote `origin/main`.

## Feedback Ledger Review

- `feedback/p1-origin-main-baseline`: start from current `origin/main` before implementation and confirm remote main after merge.
- `feedback/p1-clean-publish-checkout`: do not stash, reset, clean, or modify other worktrees; keep branch/PR operations scoped to this worktree.
- `feedback/p1-source-outage-disclosure`: new source audit groups must expose blocked/no_signal platform discovery instead of hiding source outages.
- `feedback/p1-search-provider-partials`: preserve provider/source-level partial output and audit counts for platform discovery.
- `feedback/p1-discovery-output-json`: new discovery commands must support clean direct JSON output through the CLI.
- `feedback/p1-main-visible-bullets-no-generic-watch-next`: platform sections must not render generic metadata as repeated public prose.
- `feedback/p1-domestic-dynamics-public-visibility`: platform signals increase domestic/community visibility without weakening factual source gates.
- `feedback/p1-ai-quality-review-loop`: keep candidate back-reference and page/render checks in the validation path.
- `feedback/p1-feedback-memory-self-check`: this task records ledger review and concrete regression self-check before handoff.

## Regression Self-Check

- Branch baseline checked: `codex/platform-exempt-channels` was created from fetched `origin/main` commit `946bb3d`.
- Factual-section gates checked in `tests/unit.test.js`: platform candidates are rejected when routed to `main_items`, and existing intermediary factual-section tests still run in the same unit suite.
- Non-counting checked in `src/quality-status.js`: `SECTION_MINIMUMS` and `countContentUnits()` still list only existing factual/community sections and omit `wechat_items`, `zhihu_items`, and `reddit_items`.
- Public disclosure checked in `src/report.js`, `src/candidates.js`, `src/platform-exempt.js`, and `src/interaction-report.js`: platform items must keep `platform`, `source_id`, `rule_id`, `source_level`, `verification_status`, `claim_text`, `why_watch`, `disclosure`, `matched_terms`, `exemption_policy`, and `published_by_gate`.
- Source audit merge checked in `src/source-audit.js`, `src/discovery.js`, and `src/draft.js`: `wechat_sources`, `zhihu_sources`, and `reddit_sources` are discoverable, mergeable, and counted when selected.
- Focused tests checked: `node --test tests/unit.test.js --test-name-pattern "platform exempt|platform-draft|platform draft"` passed with 220/220 unit tests reported by Node's test runner.
- Source command checks passed: `npm run sources:validate`, three `discover:*platform` commands, and platform `sources:health` kill-switch smoke test.
- Feedback regression self-check: `feedback/p1-origin-main-baseline`, `feedback/p1-clean-publish-checkout`, `feedback/p1-source-outage-disclosure`, `feedback/p1-search-provider-partials`, `feedback/p1-discovery-output-json`, `feedback/p1-main-visible-bullets-no-generic-watch-next`, `feedback/p1-domestic-dynamics-public-visibility`, `feedback/p1-ai-quality-review-loop`, and `feedback/p1-feedback-memory-self-check` are covered by the branch baseline check, source audit disclosure, clean JSON command smoke tests, platform render disclosure tests, candidate back-reference tests, and harness validate gate.
- Final pending check: run npm run validate as the harness/validation regression gate, then commit, push, open PR, merge it, and verify remote `main` includes the merge.

## Red Test

Run before implementation after adding focused failing tests:

```powershell
node --test tests/unit.test.js --test-name-pattern "platform exempt"
```

Expected initial failure:

- Current schemas reject `wechat_item`, `zhihu_item`, `reddit_item`, `wechat_items`, `zhihu_items`, `reddit_items`, and platform source audit groups.
- Current report gates do not know how to validate or render the new sections.

## Deterministic Substitute

If the focused red test name cannot isolate all new cases before implementation, use schema validation failures against dedicated fixtures and a direct `report:write` failure for a valid platform item draft as deterministic substitutes. No network dependency is required.

## Allowed Paths

- `config/sources/**`
- `package.json`
- `progress.md`
- `schemas/candidates.schema.json`
- `schemas/report.schema.json`
- `schemas/sources.schema.json`
- `session-handoff.md`
- `src/**`
- `tasks/current-task.md`
- `tests/**`

## Forbidden Paths

- Do not modify generated public daily report HTML by hand.
- Do not modify remote Pages settings or scheduled automation configuration.
- Do not reset hard, stash, clean, or overwrite unrelated user changes.
- Do not modify unrelated Harness Hub skill files.

## Validation Commands

- `node --test tests/unit.test.js --test-name-pattern "platform exempt"`
- `npm run validate`
- `git diff --check`

## Parallel Writes

- No parallel writes. Manual edits use `apply_patch`; formatting or test commands may generate temporary output only when required by existing scripts.

## Handoff Requirements

- Report implemented sections, commands, and gates.
- Report validation evidence.
- Report PR URL, merge confirmation, and final `origin/main` commit.
- Report residual risks and any deferred Phase 2/3 work.
