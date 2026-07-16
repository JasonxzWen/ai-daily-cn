# @adc/web

> Current runtime boundary: this README describes the pre-cutover public-signal monitor. The accepted curated-edition target, route/component/data/asset/test survival decisions and atomic PR6 cutover are owned by [`docs/ai-daily-curated-homepage-migration-spec.md`](../../docs/ai-daily-curated-homepage-migration-spec.md). Until PR6, the current renderer remains factual runtime behavior; this file must not be used as authority for the future homepage IA.

Production React/Vite public-signal monitor for the ADC static site. It reads `signals/index.json`, renders source-group previews, and loads older group pages in place through each artifact's `first_page_url` / `next_url` chain. Credibility, content, health, and access fields remain descriptive metadata; they never filter membership or reorder the default chronology.

The visual contract comes from `@adc/design/theme.css`; page-specific desktop composition rules stay in `src/styles.css`. Vite owns the only public HTML page and writes it with the shared favicon into `docs/`; historical report, operations, and official-blog information remains available as JSON rather than separate HTML surfaces.

Use `corepack pnpm --filter @adc/web run typecheck` and `corepack pnpm run web:build` for local validation. Public UI changes require browser acceptance only at the canonical `1280x900` desktop viewport; mobile, tablet, narrow-screen, and touch-only variants are unsupported.
