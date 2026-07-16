# @adc/design

> Transition boundary: the package below is the current runtime token source. At the accepted PR6 cutover, `@adc/design` becomes the sole owner of the preserved warm-paper `--adc-*` palette and the role-specific 14px story-card / 8px control / 6px source-icon / 999px pill radii defined by [`DESIGN.md`](../../DESIGN.md). Implementation is still pending; `apps/web` must not create a competing palette in the meantime.

Repository-owned ADC visual contract for the React public signal monitor.

`src/adc-theme.css` exports the paper/ink tokens, public-surface shell, monochrome status treatment, focus behavior, and restrained rough-line styling. The React app imports `@adc/design/theme.css`; Vite is the only public HTML owner.

Prototype prompts, decisions, and screenshots belong under `design/prototypes/`. External generator output remains reference-only or is translated into the accepted React/Astryx boundary.
