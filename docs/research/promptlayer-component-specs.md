# PromptLayer Component Specs For AI Daily

These specs translate the authorized PromptLayer component grammar into AI Daily components. Public text must be replaced with AI Daily report content.

## 1. Fixed Header / Navigation

- Source screenshots:
  - `output/playwright/promptlayer-clone/promptlayer-desktop1440-full.png`
  - `output/playwright/promptlayer-clone/promptlayer-mobile390-full.png`
- Purpose in AI Daily: replace the current dashboard-like hero toolbar/nav with a calmer fixed report chrome.
- Layout:
  - Height around `64px` on desktop.
  - Left rail `64px` with hamburger strokes.
  - Brand/report name aligned left after rail.
  - Right links are uppercase monospace/sans, separated by small square bullets.
  - Thin bottom rule; header is dark over hero and light over paper sections.
- Visual tokens:
  - Dark state background `rgb(20, 20, 19)`.
  - Light state background near `rgb(238, 233, 223)`.
  - Rule color `rgb(216, 208, 194)` on paper and low-alpha white on dark.
  - Labels are small, uppercase, letter-spaced, and quiet.
- Interactions:
  - Fixed/sticky.
  - Active section link changes background to yellow and ink color.
  - Hover should be color/background only, no large shadow.
- AI Daily adaptation:
  - Brand text: `AI Daily`.
  - Nav items: `MAIN`, `TRACKING`, `GITHUB`, `BLOGS`, `CHINA`, `QUALITY`.

## 2. Dark Editorial Hero

- Source screenshot: `output/playwright/promptlayer-elements/promptlayer-element-hero.png`.
- Purpose in AI Daily: keep first viewport dramatic but less dashboard-like.
- Layout:
  - Two-column desktop hero, dark background, vertical divider at center.
  - Left column: large serif headline, compact body copy, CTA/action row.
  - Right column: framed/tilted preview panel. For AI Daily this can become a small paper preview of today's report topology rather than a copied PromptLayer image.
  - Logo/metric rail at bottom with equal-width cells and vertical rules.
- Typography:
  - Hero heading uses editorial serif, very large, line-height around `0.95`.
  - Body copy is muted serif, constrained width.
  - Buttons are uppercase mono/sans labels.
- Interactions:
  - Scroll reveal / fade-up on hero sub-elements.
  - CTA hover uses yellow fill or border inversion.
- AI Daily adaptation:
  - Date can stay as primary headline but should be paired with an editorial title like `AI Daily` and coverage window.
  - Hero metrics should become rail cells rather than boxed dashboard stat cards.

## 3. Visual Editor / Paper Preview Section

- Source screenshots:
  - `output/playwright/promptlayer-scroll/promptlayer-scroll-01.png`
  - `output/playwright/promptlayer-scroll/promptlayer-scroll-03.png`
- Purpose in AI Daily: introduce an optional report-map preview, not as copied art.
- Layout:
  - Paper surface over dark background.
  - Large arc outline and curved labels.
  - Center illustration can be replaced with a simple AI Daily mark or omitted.
  - Bottom three cells summarize major report lanes.
- Important behavior:
  - The section is scroll-driven; wheel movement changes arc label positions and visual state while `window.scrollY` may remain unchanged.
- AI Daily adaptation:
  - Use CSS-only arcs and section labels where possible.
  - Do not require complex scroll hijack in production; a subtle static arc plus reveal animation is acceptable unless it blocks page usability.

## 4. Result / Case Ticket Grid

- Source reference from user screenshots and extraction:
  - centered heading, small eyebrow dot, 2x4 grid on desktop;
  - each card is a border-only ticket with circular notch details at intersections;
  - pale paper background and tiny icon/label above title.
- Purpose in AI Daily:
  - Main news stream should use this ticket grid, not the current long white panel with numbered bullet blocks.
- Layout:
  - Desktop: 2 or 4 columns depending section density; fixed row rhythm.
  - Each ticket: rank/number, title, two factual lines, source/date row, quiet source link.
  - No visible rationale or metadata in the body.
- Visual:
  - Border `1px solid rgb(216, 208, 194)`.
  - Background paper `rgb(240, 235, 226)`.
  - Notch: pseudo-elements or radial gradients at card corners/intersections.
  - Hover: slight paper lift, stronger border, optional text color shift.
- AI Daily adaptation:
  - Main items, GitHub rows, and community leads can share variants of this ticket family.

## 5. Feature Split Section

- Source reference:
  - left editorial heading/body/list/action;
  - right framed product-like panel with paper border;
  - large whitespace, not a dense dashboard.
- Purpose in AI Daily:
  - Daily tracking and quality/source sections can use split sections: narrative summary left, structured table/component right.
- Layout:
  - Desktop two columns with 45/55 or 50/50 split.
  - Mobile stacks summary above component.
  - Right panel uses inset border and section header strip.
- Interactions:
  - Tables/components keep local interaction; hover rows remain restrained.
  - If a section is collapsible, fold details under a ticket-like summary.

## 6. Use-Case Arc Cards

- Source reference:
  - oversized overlapping circular outlines;
  - three large content blocks;
  - centered serif headings and small uppercase category labels.
- Purpose in AI Daily:
  - Good fit for topic clusters such as AI industry, product/platform, open source, China, and quality.
- Layout:
  - Desktop: two top arcs and one lower centered arc.
  - Mobile: stacked rounded/arc cards, preserving large circle motif without overflow.
- AI Daily adaptation:
  - Use it sparingly for section overview, not every item.

## 7. Testimonial / Logo Rail

- Source reference:
  - left active quote/content panel;
  - right muted logo cells in a horizontal rail;
  - inactive cells are pale and low contrast.
- Purpose in AI Daily:
  - Could carry Builder/X or community observations: one selected observation in detail, others as muted tabs/logos.
- Interaction:
  - Click/hover can switch active item.
  - Reduced-motion mode disables animated switching.
- AI Daily adaptation:
  - No customer logos; use source icons or initials through existing icon resolver.

## 8. Editorial Thoughts / Article Rows

- Source reference:
  - large page heading;
  - first feature row in a bordered rectangle with text left and image right;
  - subsequent rows are separated by dotted/thin rules with title left and thumbnail right.
- Purpose in AI Daily:
  - Best fit for hot blogs and Chinese media dynamics.
- Layout:
  - Full-width list rows, no highlighted square `READ` block.
  - Right media only when semantic and readable; otherwise omit.
  - Link action stays quiet uppercase with arrow.
- AI Daily adaptation:
  - Preserve 100-200 character Chinese summaries and source/date tags.

## Implementation Implications

- Move away from the current single generic `.panel` look.
- Add section-specific CSS families:
  - `.daily-ticket-grid`
  - `.daily-ticket`
  - `.daily-split-section`
  - `.daily-arc-grid`
  - `.daily-editorial-list`
  - `.daily-logo-rail`
- Keep all styles under `html[data-ai-daily-theme="promptlayer-inspired"]`.
- Add reduced-motion coverage for reveal, hover transform, and any scroll-linked effects.
