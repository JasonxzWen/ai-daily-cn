---
name: adc-frontend-quality
description: Load when changing the ADC web frontend, visual system, React/Astryx product UI, or frontend PR acceptance; do not load for backend-only source ingestion, routine report generation, or non-UI documentation edits.
license: Project local rules in AGENTS.md
metadata:
  source: "ADC project-local integration of Leonxlnx/taste-skill and pbakaus/impeccable"
  upstream_sources:
    - "https://github.com/Leonxlnx/taste-skill"
    - "https://github.com/pbakaus/impeccable"
  adaptation: "Project-specific frontend quality gate; external sources are evidence and review vocabulary, not production dependencies."
---

# ADC Frontend Quality

Use this skill as the ADC-specific frontend quality gate. It keeps product UI work grounded in the local React/Astryx stack while allowing taste-skill and Impeccable to inform visual decisions and review evidence.

ADC is desktop-only. Design and browser acceptance use `1280x900`; do not introduce mobile, tablet, narrow-screen, touch-only, or width-breakpoint variants. Generic compatibility inside React/Astryx is not product support evidence.

## Startup

1. Read `design/frontend-quality-workflow.md`.
2. Read `design/design-quality-sources.json`.
3. Inspect the affected React/Astryx components before choosing a visual direction.

## Taste-Skill Boundary

Use `design-taste-frontend` for anti-template visual direction, redesign calibration, prototype critique, and final visual preflight. Do not let it own dashboards, data tables, dense data-product flows, or routine React logic. For those surfaces, borrow only its design-read and anti-default checks.

## Impeccable Boundary

Use Impeccable as optional design audit evidence when the local host supports it. `npx impeccable install` and `/impeccable init` are setup commands, not CI requirements. Translate findings into ADC components; do not copy unreviewed generated output or external patches into production.

## PR Evidence

Before frontend handoff, include:

- design read and `DESIGN_VARIANCE`, `MOTION_INTENSITY`, `VISUAL_DENSITY`;
- source/tool evidence or a skip reason;
- component-system fit for React and Astryx;
- interaction states and `prefers-reduced-motion` handling when relevant;
- browser acceptance evidence at `1280x900` with scenario, console/network result, and screenshot or trace when UI changes;
- Impeccable audit result or explicit skip reason.
