# PromptLayer Visual Gap Matrix

> Historical evidence note: mobile rows, screenshots, and checks below preserve the 2026-06-22 fidelity-pass record. REC-330 and `docs/desktop-only-support-policy.md` supersede them for all current design and acceptance work.

## Evidence

- Reference extraction: `docs/research/promptlayer/promptlayer-extraction.json`
- Reference scroll evidence: `docs/research/promptlayer/promptlayer-scroll-frames.json`
- Current page capture: `docs/research/promptlayer/current-daily-capture.json`
- Current desktop screenshot: `output/playwright/promptlayer-current-daily/daily-desktop1440-full.png`
- Current mobile screenshot: `output/playwright/promptlayer-current-daily/daily-mobile390-full.png`

## Current State Summary

The 2026-06-17 AI Daily sample now carries a scoped PromptLayer-inspired visual system rather than the original generic report shell. The page still keeps AI Daily's content and source contracts, but the visible grammar has moved closer to the reference:

- a fixed PromptLayer-like top chrome with hamburger rail and brand signal;
- a dark editorial hero with a tilted paper preview and bottom rail cells instead of dashboard stat boxes;
- main news and GitHub sections use ticket/card grids with notch details and compact metadata;
- tracking cards keep local structured tables/components while using full-width editorial title rhythm;
- blog/community rows use thin separators and editorial row spacing rather than generic cards;
- scroll reveal, hover lift, sticky nav, and reduced-motion fallbacks are scoped to the target theme;
- mobile kept the same visual language stacked without horizontal overflow in the historical capture.

The remaining differences are intentional or queued rather than accidental: AI Daily does not copy PromptLayer text, scripts, customer/logo content, or scroll hijacking; the site still favors long-report scanning over a pure landing-page journey.

## Gap Matrix

| Area | Reference Behavior | Current Behavior | Status / Next Direction |
|---|---|---|---|
| Header | Fixed 64px chrome, hamburger rail, brand, uppercase link cluster, dark/light state | Scoped theme now adds sticky top chrome and separate scrollable report nav | Mostly addressed; optional next pass can add right-side nav links if useful |
| Hero | Dark two-column editorial composition with preview panel and bottom rail | Dark two-column hero with tilted paper preview, left summary, and bottom rail cells | Historically addressed; mobile density was monitored in the superseded pass, while current acceptance is desktop-only |
| Main items | Ticket/case-study grid with notches and compact cards | Main stream renders PromptLayer-like ticket cards with source/date metadata first | Addressed |
| Section headings | Centered or editorial serif with small uppercase eyebrow dot | Section headings are shorter, centered/editorial, and explanation copy is removed from public sections | Addressed |
| Tracking | Feature/split component rhythm with large titles and table-like UI | Tracking cards use full-width title flow and bounded local official snapshots/tables | Addressed after fixing Artificial Analysis title wrapping |
| GitHub | Ticket/list cards with source/rank metadata first | GitHub Top20 renders card grid with repo title, source/date, rank, stars, and no duplicated README/template body | Addressed; future data quality depends on better upstream README extraction |
| Blogs | Editorial rows with thin separators and right media/action | Blog cards use editorial row layout; first item gets a light feature frame | Mostly addressed; can add media rhythm when stronger local evidence exists |
| Use-case arcs | Large circular outlines and centered text | Not copied; AI Daily does not currently need a pure marketing use-case overview | Deferred intentionally |
| Testimonial rail | Active detail plus muted cells | Not copied; Builder/community observations remain report content, not customer proof | Deferred intentionally |
| Motion | Staggered transform transitions, scroll-driven visual section | Scoped hover lift plus view-timeline reveal with reduced-motion fallback | Partially addressed; no scroll hijacking by design |
| Mobile | Same visual grammar stacked with full-width rule cells | Historical 375/390px screenshots had no horizontal overflow and readable stacked cards | Historical evidence only; retired by REC-330 |

## Implemented In The Fidelity Pass

> Superseded on 2026-07-10: this section records the earlier fidelity pass. `src/daily-theme.js` and its source-shape tests were later removed after the shared ADC paper/ink visual contract replaced the PromptLayer-specific layer across React, static shells, and every historical daily report. Reports keep their self-contained content rendering but load one shared `docs/assets/adc-theme.css` visual asset.

1. `src/daily-theme.js` previously added scoped PromptLayer-like header chrome, hero preview, rail cells, ticket grids, editorial rows, tracking title layout, hover/reveal motion, and mobile collapse; that module is no longer active.
2. `src/interaction-report.js` now emits cleaner GitHub card bodies and degrades old saved README boilerplate into rank/stars movement copy.
3. `src/github-readme.js` now avoids the old generic "README 将 / 核心能力集中 / 它的价值在于" template for future generated reports.
4. At the time, `tests/unit.test.js` covered scoped theme selectors, GitHub card fallback text, and README summary template avoidance; current visual-contract coverage lives in `tests/adc-visual-contract.test.js` and browser acceptance evidence.
5. `docs/reports/2026/06/2026-06-17.html` was regenerated; non-target historical HTML diffs were reverted after builds.
6. Playwright screenshots and `scripts/check-daily-page.mjs` historically verified desktop/mobile no-overflow, no key overlap, tracking component containment, and GitHub reader-facing card quality. Current acceptance is desktop-only at `1280x900`; the earlier multi-viewport evidence is preserved but superseded by `docs/desktop-only-support-policy.md`.

## Known Reference Gaps We Should Not Copy 1:1

- PromptLayer uses a scroll-hijacked visual editor section where `window.scrollY` can stay `0`; AI Daily should not adopt scroll hijacking because the report is long and reader-scannable.
- PromptLayer page includes brand/customer/logo content; AI Daily must use its own source icons and report data.
- PromptLayer includes cookie consent and third-party scripts; these must not be copied.
