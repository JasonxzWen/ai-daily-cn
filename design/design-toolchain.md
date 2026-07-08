# ADC Design Toolchain

This project uses AI design tools as prototype accelerators, not as direct production code sources.

## Supported Inputs

- Google Stitch: useful for fast UI ideation from natural language, images, or code. Official references: <https://stitch.withgoogle.com/> and <https://developers.googleblog.com/stitch-a-new-way-to-design-uis/>.
- Vercel v0: useful for high-fidelity UI/code prototypes from prompts, wireframes, and mockups. Official references: <https://v0.app/docs/> and <https://vercel.com/blog/maximizing-outputs-with-v0-from-ui-generation-to-code-creation>.
- Image generation: useful for visual mood, character drafts, and background texture exploration.
- Manual/Figma sketches: useful when the design intent is clearer as a drawn layout than a prompt.

## Production Boundary

- Generated code is not committed directly to production.
- Prototype output must be translated into React, Astryx components, and ADC CSS tokens by the maintainer.
- GitHub Pages remains the deployment target; no prototype tool may introduce a hosted runtime requirement.
- Prototype decisions must preserve the current product scope: no search, comparison, favorites, right rail, topic dashboard, or mobile-specific redesign unless explicitly reopened.

## Required Record

Each design-generation run that influences implementation must leave a `design/` scoped repository record:

- prompt text or prompt file
- compressed screenshot reference when a visual output is accepted
- decision record with accepted and rejected parts
- source metadata: tool, URL when useful, date, and operator notes
- production boundary: allowed reference use and forbidden direct outputs
- translation notes for Astryx/ADC implementation

Use `design/prototypes/_template.design.json` as the starting point.

## Review Checklist

- Does the artifact explain what changed in the intended user experience?
- Does it identify which generated parts are accepted, rejected, or unresolved?
- Does it keep generated code outside production paths?
- Does it translate visual decisions into ADC tokens, component responsibilities, or layout constraints?
- Does it avoid copying third-party illustration IP or private screenshots?
