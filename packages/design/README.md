# @adc/design

Repository-owned ADC visual contract shared by the React homepage and generated static surfaces.

`src/adc-theme.css` exports the paper/ink tokens, public-surface shell, monochrome status treatment, focus behavior, and restrained rough-line styling. Consumers import `@adc/design/theme.css`; Node renderers read the same file through `src/adc-theme.js` so the public site does not maintain a second token source.

Prototype prompts, decisions, and screenshots belong under `design/prototypes/`. External generator output remains reference-only or translated into the accepted React/Astryx and static-renderer boundaries.
