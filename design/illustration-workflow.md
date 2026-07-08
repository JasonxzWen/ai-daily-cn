# ADC Illustration Workflow

ADC illustration assets are original black-and-white rough-line assets used to support the product identity without turning the site into an illustration-first landing page.

## Contract

- Assets must be original ADC work, not copied from third-party illustration IP.
- The default style is black-and-white line art on paper-toned backgrounds.
- Source assets for the web app live under `apps/web/public/assets/`.
- Vite copies public assets into `docs/assets/` for GitHub Pages publication.
- Every shipped illustration needs a manifest, prompt, and decision record under `design/illustrations/`.

## Required Manifest

Each `*.asset.json` record must include:

- source asset and generated public asset paths
- prompt path
- decision record path
- rights flags proving the asset is original and not a third-party copy
- allowed surfaces and forbidden uses
- build note explaining how the generated asset is produced

## Review Rules

- Do not embed remote images, base64 images, or screenshots inside SVG assets.
- Keep SVG assets small enough for static GitHub Pages delivery.
- Keep accessible `<title>` and `<desc>` tags in SVG sources.
- Compare the source asset and generated `docs/assets` copy before handoff.
- Use the design prototype workflow for broad visual direction; use this workflow for assets that actually ship.
