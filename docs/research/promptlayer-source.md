# PromptLayer Source Capture

## Source

- URL: `https://www.promptlayer.com/`
- Capture date: 2026-06-22
- Permission assumption: the user stated they are authorized to use PromptLayer page components directly.
- Content rule: do not copy PromptLayer marketing text into AI Daily public pages; use AI Daily's own report content.
- Tooling: repo-local `clone-website` workflow adapted from `JCodesMore/ai-website-cloner-template`, plus Playwright extraction scripts in `.tmp/`.

## Upstream Template Notes

The upstream template was cloned into `.tmp/ai-website-cloner-template` and inspected. The reusable workflow is:

1. Reconnaissance with browser screenshots, tokens, topology, and interaction sweep.
2. Foundation extraction: fonts, colors, grid, assets, animation behavior.
3. Component specs before implementation.
4. Assembly and browser QA.

This repo is not a Next.js clone target, so the workflow is adapted to the existing effective-interact daily renderer instead of creating a new Next.js app.

## Artifacts

- Raw PromptLayer extraction JSON: `docs/research/promptlayer/promptlayer-extraction.json`
- Scroll-frame JSON: `docs/research/promptlayer/promptlayer-scroll-frames.json`
- Anchor capture JSON: `docs/research/promptlayer/promptlayer-anchor-captures.json`
- Element capture JSON: `docs/research/promptlayer/promptlayer-element-captures.json`
- Current AI Daily capture JSON: `docs/research/promptlayer/current-daily-capture.json`

## Reference Screenshots

> 下列移动端截图与行为仅保存 2026-06-22 的外部信源和历史取证；REC-330 后它们不构成 ai-daily-cn 的设计、维护或验收范围。

- PromptLayer desktop hero: `output/playwright/promptlayer-clone/promptlayer-desktop1440-full.png`
- PromptLayer mobile hero: `output/playwright/promptlayer-clone/promptlayer-mobile390-full.png`
- PromptLayer scroll frames: `output/playwright/promptlayer-scroll/promptlayer-scroll-00.png` through `promptlayer-scroll-12.png`
- PromptLayer hero element: `output/playwright/promptlayer-elements/promptlayer-element-hero.png`
- Current AI Daily desktop: `output/playwright/promptlayer-current-daily/daily-desktop1440-full.png`
- Current AI Daily mobile: `output/playwright/promptlayer-current-daily/daily-mobile390-full.png`

## Extracted Tokens

- Dark base: `rgb(20, 20, 19)`.
- Paper surfaces: `rgb(240, 235, 226)`, `rgb(238, 233, 223)`, `rgb(250, 245, 235)`.
- Ink: `rgb(67, 44, 16)`.
- Muted text: `rgb(135, 132, 127)`.
- Rule/border: `rgb(216, 208, 194)`.
- Accent yellow: `rgb(245, 207, 99)` / current CTA yellow family.
- Fonts observed: `gaisyr` for large editorial serif headings, `polysans` for sans/label UI, plus fallbacks.
- Dominant geometry: square corners, 1px rules, zero/near-zero radius, paper texture, thin grid lines, ticket notches/circular cut-outs.
- Motion: many elements expose `transform 0.5s` staggered transitions; links use color transitions around `0.3s cubic-bezier(0.5, 0, 0, 1)`.

## Topology

1. Fixed dark top navigation with left hamburger, brand, right CTA/link cluster, and thin bottom rule.
2. Dark first viewport with two columns: large editorial headline and CTA on the left, tilted light paper preview on the right.
3. Logo rail directly under hero with vertical rule cells.
4. Long scroll-driven paper preview / visual editor section, using arc text, central illustration, and three bottom feature cells.
5. Case-study/result grid with a centered serif heading and 2x4 ticket cards.
6. Feature split sections: left editorial copy/list, right framed UI illustration, repeated for multiple product capabilities.
7. Use-case arcs: large overlapping circular outlines carrying centered text blocks.
8. Testimonial/logo rail: one active quote panel plus pale inactive logo cells.
9. Editorial/thoughts rows: a large bordered feature row, then article list rows with right-side thumbnails.
10. Footer/model/community sections continue the paper/ticket language.

## Interaction Evidence

- The page uses a special scroll model: `window.scrollY` remains `0` in desktop captures while visible content changes; a large internal scroll/animation container has a long scroll height.
- The visual editor section responds to wheel progression by changing the arc label positions and paper preview state.
- Header stays fixed and swaps dark/light treatment depending on the visible section.
- Hover states are subtle: color/fill changes, background changes, and restrained transform transitions rather than heavy shadows.
- Mobile kept the same grammar but stacked the hero, logo rail, visual preview, and cards into narrow full-width rule cells in the historical capture; this is evidence only, not a current support requirement.

## Copied Versus Replaced

- Structural/component grammar may be reused under the user's authorization: grid, ticket geometry, notch details, typography rhythm, section topology, hover/scroll behavior.
- PromptLayer brand text, marketing copy, logos, customer names, and artwork should not be used in public AI Daily pages.
- AI Daily report data remains the content source for titles, facts, sources, dates, tables, and links.
