# ADC Frontend Quality Workflow

<!-- adc-frontend-quality:v1 -->
<!-- taste-skill-boundary -->
<!-- impeccable-boundary -->
<!-- frontend-quality-validation -->

ADC frontend quality work uses external design systems as evidence and review language, not as unreviewed production source. The product remains a desktop-first AI news data product implemented with React, Astryx, and Vite.

## Adopted Sources

- `Leonxlnx/taste-skill`: adopted through the local `.codex/skills/design-taste-frontend` skill at upstream commit `3c7017d636c3a4aad378433ea6d0cfa6c921da4a` under MIT. Use it for design read, anti-template calibration, visual dials, and final critique. Respect its boundary: it is not for dashboards, data tables, multi-step product UI, or routine React logic.
- `pbakaus/impeccable`: adopted as an external design audit vocabulary and optional detector workflow under Apache-2.0. The documented entry is `npx impeccable install` followed by `/impeccable init` when a local agent host supports those commands. Its output is review evidence, not a direct production patch.

## Frontend PR Contract

Every material ADC frontend PR must record or surface:

- Design read: the page kind, audience, information density, and why the selected visual system fits a Chinese AI news data product.
- Working dials: `DESIGN_VARIANCE`, `MOTION_INTENSITY`, and `VISUAL_DENSITY`.
- Source/tool evidence: prototype source, manual sketch, Stitch/v0/Figma record, or explicit reason no external prototype was used.
- Implementation boundary: translate ideas into the ADC React/Astryx component system; do not commit generated code directly to production paths.
- Interaction evidence: hover, focus, loading, empty, error, and reduced-motion behavior, including `prefers-reduced-motion` where motion is introduced.
- Browser acceptance: Playwright or equivalent local browser run with scenario, viewport, console/network findings, and screenshot or trace when the UI changes.
- Audit evidence: Impeccable detector/review output when available, or an explicit skip reason when the tool is unavailable or not applicable.

## Standard Flow

1. Read the product surface and data shape before choosing aesthetics.
2. Load `adc-frontend-quality` for ADC frontend work. Load `design-taste-frontend` only when the task needs anti-template visual direction, redesign calibration, or a prototype critique.
3. Use Stitch, v0, Figma, image generation, or manual sketches as prototype evidence when they reduce uncertainty. Keep those records under `design/prototypes/`.
4. Implement with the local React/Astryx primitives. External code snippets, generated UI code, and Impeccable suggestions must be translated before landing.
5. Run `corepack pnpm run design-quality:validate` plus the nearest frontend checks. UI-changing PRs also need browser acceptance.
6. Preserve data-product utility over decorative novelty. The homepage can be expressive, but it must not become a landing page that hides the daily report.

## Rejected Defaults

- Directly installing external generated components into production paths.
- Treating taste-skill as the owner for dashboards, data tables, or dense data-product flows.
- Treating Impeccable as a mandatory network dependency in CI.
- Replacing ADC with a generic purple, glass, card-grid, or hero-first template.
- Shipping animation without reduced-motion handling.
