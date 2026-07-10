# @adc/web

Production React/Vite homepage for the ADC static site. It reads the generated `articles.json` and `feed.json`, then renders the latest, previous-day, and history views with Astryx primitives.

The visual contract comes from `@adc/design/theme.css`; page-specific composition and responsive rules stay in `src/styles.css`. The Vite build writes into `docs/` without deleting static reports or operations pages.

Use `corepack pnpm --filter @adc/web run typecheck` and `corepack pnpm run web:build` for local validation. Public UI changes also require desktop and narrow-viewport browser acceptance.
