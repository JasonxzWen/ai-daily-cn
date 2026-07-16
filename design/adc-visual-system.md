# A.D.C. Visual System

<!-- curated-edition-contract-ref:v1 -->

Status: `current-visual-foundation / curated-edition-target-aligned / implementation-pending`

The target behavior is owned by [AI Daily 精选首页三层迁移规格](../docs/ai-daily-curated-homepage-migration-spec.md). `A.D.C.` is the public masthead for `ai-daily-cn`. The web app should feel like a compact, readable editorial information stream; the current warm-paper topbar, rail and two-column card language survives while information architecture and semantics change.

## Scope

- Applies to the React/Vite homepage under `apps/web`.
- Keeps full-history search, comparison, favorites and a second right rail out of scope. A hierarchical topic/format rail that filters only the current edition is in scope.
- Uses Astryx for component primitives and `@adc/design` as the sole `--adc-*` token owner. `apps/web` owns only domain components and layout; it must not define a competing palette.
- Targets desktop-only GitHub Pages publishing at `1280x900`. Mobile, tablet, narrow-screen, and touch-only design is permanently outside the current product scope.

## Visual Language

- Palette: retain the current warm paper, readable ink, thin ruled lines and restrained orange/green accents. Do not replace it with the older black-heavy draft or a light-gray/white-panel/indigo scheme.
- Shape: retain the current 14px story-card radius and thin editorial separators. Controls/navigation use 8px, source icons use 6px, and pills alone use 999px; avoid a single global radius, nested large cards, or bubbly sections.
- Texture: subtle paper character may remain in the page background. Avoid gradient orbs, dark Dracula remnants, heavy glass effects and decorative landing-page hero treatments.
- Typography: body uses a Chinese sans stack; large identity text may use a serif display stack for editorial weight.
- Motion: low intensity. Prefer short entrance fade/slide and subtle card lift/rotation on hover. Respect `prefers-reduced-motion`.

## Character Asset

- Source asset: `apps/web/public/assets/adc-character.svg`.
- Build output: Vite copies it to `docs/assets/adc-character.svg`.
- The asset is original. Do not copy upstream illustration IP or user-provided samples directly.
- Use the character only as a small brand or empty-state element. It must not displace ranked content in the first viewport or decorate every story.

## Implementation Rules

- Keep the homepage as a data product, not a marketing landing page.
- The masthead contains only `A.D.C.`, edition date, revision/status, previous/next navigation and necessary route links. Remove the old slogan, `Richness first` and inventory metrics.
- The first viewport must place ranked editorial content ahead of decorative or inventory content and show the start of the globally ranked 10–14-item edition in the current two-column rhythm; do not restore lead/secondary or Today Five duplication.
- Each story card shows rank, real content publisher/author and role, date, title, grounded reader copy, topic + format, public collector lineage and the material link. Aify Today Picks preserve and fully display the upstream title/description and show Aify separately as editorial source/collector; this phase forbids an inaccessible visual clamp or payload mutation. Internal score, core/supporting level, admission language and constant credibility pills never display.
- The rail exposes populated L1/L2 topics, formats and GitHub/Benchmark/pool anchors. Filtering preserves global rank and never pretends to search historical shards.
- Story summaries render at no less than 15px and metadata at no less than 12px at `1280x900`; 9–10px labels are not acceptable. Respect focus-visible and `prefers-reduced-motion`.
- Source icons render at 18px in card titles, never exceed 22px on public surfaces, use a 6px radius and keep the same box size when the resolver falls back. Aify descriptions remain fully accessible without an irreversible line clamp.
- New static assets that ship through Vite must be listed in `WEB_APP_GENERATED_FILES` so generated-file planning and GitHub Pages publication stay accurate.
