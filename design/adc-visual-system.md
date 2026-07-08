# ADC. Visual System

ADC. is the product identity for `ai-daily-cn`. The web app should feel like a focused AI news room: compact, readable, and decisively editorial, with an original black-and-white line-art character used as a recurring visual anchor.

## Scope

- Applies to the React/Vite homepage under `apps/web`.
- Keeps search, comparison, favorites, right rail, and topic dashboard out of scope.
- Uses Astryx for component primitives, while local CSS tokens define the ADC. skin.
- Targets desktop-first GitHub Pages publishing. Mobile-specific redesign is intentionally deferred.

## Visual Language

- Palette: paper base `#f8f5ec`, ink `#111111`, muted ink `#57514a`, ruled line `#d9d1c1`, card paper `#fffdf7`.
- Shape: rounded cards with visibly drawn 2px ink borders. Radius should be friendly but not bubbly.
- Texture: paper grain and light rule lines can sit in the page background. Avoid gradient orbs, dark Dracula remnants, and heavy glass effects.
- Typography: body uses a Chinese sans stack; large identity text may use a serif display stack for editorial weight.
- Motion: low intensity. Prefer short entrance fade/slide and subtle card lift/rotation on hover. Respect `prefers-reduced-motion`.

## Character Asset

- Source asset: `apps/web/public/assets/adc-character.svg`.
- Build output: Vite copies it to `docs/assets/adc-character.svg`.
- The asset is original. Do not copy upstream illustration IP or user-provided samples directly.
- Future character prompts should ask for rough black-and-white ink line work, rounded face geometry, glasses, paper-label identity, and sparse hatching. Keep color limited to paper and ink unless a specific product need exists.

## Implementation Rules

- Keep the homepage as a data product, not a marketing landing page.
- The first viewport must show navigation, identity, latest report summary, key metrics, and the start of the news grid.
- Each article card should preserve source, date, score, tags, and outbound/report links.
- New static assets that ship through Vite must be listed in `WEB_APP_GENERATED_FILES` so generated-file planning and GitHub Pages publication stay accurate.
