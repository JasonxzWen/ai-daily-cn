# PromptLayer Visual Gap Matrix

## Evidence

- Reference extraction: `docs/research/promptlayer/promptlayer-extraction.json`
- Reference scroll evidence: `docs/research/promptlayer/promptlayer-scroll-frames.json`
- Current page capture: `docs/research/promptlayer/current-daily-capture.json`
- Current desktop screenshot: `output/playwright/promptlayer-current-daily/daily-desktop1440-full.png`
- Current mobile screenshot: `output/playwright/promptlayer-current-daily/daily-mobile390-full.png`

## Current State Summary

The current 2026-06-17 AI Daily page has the right high-level direction but still reads as a dark dashboard with large white report panels. Its content is dense and source-backed, which is valuable, but its section grammar is too generic:

- the hero uses boxed stat cards instead of PromptLayer-like rail cells;
- the main news body is one long white document panel, not ticket/grid information architecture;
- the navigation is a tab strip, not a fixed PromptLayer-like header;
- most sections reuse the same panel/card treatment;
- hover/reveal exists but is weak compared with the reference's section-specific motion and staggered transitions;
- the page lacks ticket notches, circular arcs, logo/source rails, and editorial article-row rhythm.

## Gap Matrix

| Area | Reference Behavior | Current Behavior | Upgrade Direction |
|---|---|---|---|
| Header | Fixed 64px chrome, hamburger rail, brand, uppercase link cluster, dark/light state | Hero-local toolbar and tab strip after hero | Add fixed PromptLayer-style top chrome under theme; keep in-page nav but restyle as rail |
| Hero | Dark two-column editorial composition with preview panel and bottom rail | Dark hero but date dominates and stats are boxed dashboard cards | Convert stats to rail cells; add report-preview panel; reduce dashboard feel |
| Main items | Ticket/case-study grid with notches and compact cards | Long white panel with numbered bullets | Render main detail as PromptLayer ticket grid in theme CSS/interaction input |
| Section headings | Centered or editorial serif with small uppercase eyebrow dot | Large section headings inside generic panels | Add section-specific heading treatments and hide explanation summaries |
| Tracking | Could map to feature split: explanation left, table/component right | Cards exist but live in generic paper panels | Use split/ticket component styling for tracking cards |
| GitHub | Should use ticket/list cards with source/rank metadata first | Dense list is useful but visually cramped and line-like | Use ticket-grid/list hybrid; preserve README summary |
| Blogs | Reference uses editorial rows with thin separators and right media | Current screenshot shows dense list/card mismatch depending scroll position | Convert to editorial rows; no highlighted action block |
| Use-case arcs | Large circular outlines and centered text | No equivalent | Add optional arc overview for group summaries or source coverage |
| Testimonial rail | Active detail plus muted cells | No equivalent | Adapt to Builder/community/source observations if useful |
| Motion | Staggered transform transitions, scroll-driven visual section | Minimal hover lift and reveal | Add stronger reveal/stagger CSS and reduced-motion fallback |
| Mobile | Same visual grammar stacked with full-width rule cells | Good no-overflow, but still dashboard/card-heavy | Preserve no-overflow while using rail/ticket stack |

## First Implementation Slice

This slice should make the final state materially more true without rewriting the whole renderer:

1. Upgrade `src/daily-theme.js`:
   - switch from generic paper panels to PromptLayer-style paper/ticket system;
   - add fixed header/nav treatment, rail cells, ticket notches, editorial rows, and section-specific rules;
   - keep all CSS scoped to `promptlayer-inspired`.
2. Lightly adjust `src/interaction-report.js` only if CSS alone cannot expose needed component hooks for main/news/blog sections.
3. Keep theme scoped to `2026-06-17` in `src/site.js` unless user broadens rollout.
4. Add/adjust tests for:
   - theme contains ticket/grid/editorial component selectors;
   - older reports do not receive the theme;
   - built 2026-06-17 remains effective-interact and no remote PromptLayer assets/scripts.
5. Rebuild `docs/reports/2026/06/2026-06-17.html`, then restore unrelated historical HTML if `npm run build` rewrites it.
6. Run Playwright page check and screenshot review at desktop and mobile.

## Known Reference Gaps We Should Not Copy 1:1

- PromptLayer uses a scroll-hijacked visual editor section where `window.scrollY` can stay `0`; AI Daily should not adopt scroll hijacking because the report is long and reader-scannable.
- PromptLayer page includes brand/customer/logo content; AI Daily must use its own source icons and report data.
- PromptLayer includes cookie consent and third-party scripts; these must not be copied.
