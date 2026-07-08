# ADC Illustration Assets

This directory stores the manifest, prompt, and decision records for ADC illustration assets.

Current asset:

- `adc-character.v1.asset.json`

Validation:

- `corepack pnpm run illustration:validate`
- `corepack pnpm run validate:docs`

Rules:

- The manifest references source assets under `apps/web/public/assets/`.
- The manifest references generated public assets under `docs/assets/`.
- Prompt and decision records stay in `design/illustrations/`.
- Decision records must include `Accepted`, `Rejected`, `Usage`, and `Rights` sections.
