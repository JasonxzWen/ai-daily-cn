# Progress

## 2026-06-02 Durable Daily Workflow PR

- Current worktree: `D:\ai-daily-cn`.
- Current branch: `codex/durable-ai-daily-workflow`.
- User requested updating to latest `origin/main`, resolving conflicts, and opening a PR that can merge cleanly.
- Local fixes were committed as `222b66d fix: codify durable AI daily workflow`, then latest `origin/main` (`3859b07`) was merged into this branch.
- Conflict resolution preserves upstream PR #17 long-form engineer daily changes and PR #18 Harness Hub skill aggregation, while keeping this branch's durable daily presentation/workflow fixes.

## Preserved Upstream Changes

- Harness Hub aggregation files and tests from `origin/main`.
- Long-form AI daily contract for ordinary engineers: editorial summaries, engineer relevance, source levels, verification status, risk notes, and watch-next fields.
- Mainline authority gates for factual `main_items` and non-primary source disclosure for lower-authority sections.

## Preserved This Branch

- Public daily hero shows the coverage window.
- Main-item keyword highlights render as inline bold colored text, while tags/chips remain typed and color-coded.
- Public `模型发布` section remains removed; model news belongs in `main_items`, with `model_releases` kept as JSON index/compatibility only.
- GitHub Trending renders Top 10; star changes are tags; project highlights are tag-only inside matching Trending items, not a standalone project section/list.
- Body evidence images and hot blog/card images support click-to-enlarge lightbox; source icons stay inert.
- Builder observations keep `original_text`, complete Chinese `translation`, `content = translation`, handle/avatar fields, and Twitter-like cards.
- Publish quality now blocks strict daily reports whose Builder observations are missing original text/translation or whose `content` is a summary instead of the complete translation.

## Validation Status

- Pre-merge validation passed before the merge: `node --test tests/unit.test.js`, `npm run validate`, `node scripts/harness-validate.mjs`, and Playwright desktop/mobile checks.
- After conflict resolution, rerun required: `npm run validate`, `node scripts/harness-validate.mjs`, and desktop/mobile visual checks for `docs/reports/2026/06/2026-06-02.html`.
