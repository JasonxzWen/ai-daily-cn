---
name: design-taste-frontend
description: Load when a workflow-router-selected owner workflow needs anti-template frontend visual direction, design-read calibration, or pre-flight critique for landing pages, portfolios, marketing pages, or redesigns; do not load for dashboards, data tables, multi-step product UI, routine frontend logic, HTML reports, slide decks, or generic code explanation.
source: https://github.com/Leonxlnx/taste-skill
upstream_commit: 3c7017d636c3a4aad378433ea6d0cfa6c921da4a
license: MIT
metadata:
  source_skill: Leonxlnx/taste-skill skills/taste-skill
  adaptation: Standard Harness Hub integration with narrow routing; long upstream guidance split into references.
---

# Design Taste Frontend

Use this skill as a frontend taste layer, not as the whole frontend implementation lane. It helps set a deliberate visual direction for landing pages, portfolios, marketing pages, and redesigns so the result does not look templated.

Do not use it for dashboards, dense data tables, multi-step product UI, routine React/Next logic, HTML reports, decks, or code explanation. Those route to `frontend-design`, `frontend-patterns`, `web-artifacts-builder`, `effective-interact`, or `frontend-slides`.

## Core Workflow

1. Read the brief before choosing aesthetics. Identify page kind, audience, brand assets, references, constraints, and explicit vibe words.
2. State one design read before code: `Reading this as: <page kind> for <audience>, with a <vibe> language, leaning toward <system or aesthetic family>.`
3. If two plausible directions conflict, ask exactly one clarifying question. If the brief is clear enough, proceed.
4. Set three working dials: `DESIGN_VARIANCE`, `MOTION_INTENSITY`, and `VISUAL_DENSITY`. Let the brief override the default.
5. Choose a real foundation. If the brief maps to an official design system, use the official package and tokens. If it is an aesthetic rather than a system, say so and build honestly.
6. Design against AI tells: no AI-purple default, dark mesh hero, three equal feature cards, generic glassmorphism, or Inter/slate sameness unless the source material demands it.
7. Verify spacing, typography, responsiveness, media strategy, hover/focus states, reduced motion, and layout stability before handoff.

## References

- Use [references/design-read-and-systems.md](references/design-read-and-systems.md) when selecting the design read, dials, or design-system foundation.
- Use [references/visual-discipline.md](references/visual-discipline.md) while building or reviewing typography, color, layout, cards, motion, images, and common AI tells.
- Use [references/redesign-and-preflight.md](references/redesign-and-preflight.md) for existing-site redesigns and the final pre-flight checklist.

## Handoff Boundary

When handing off a design or implementation, state:

- the design read;
- the chosen dials;
- the foundation or system used;
- what was intentionally preserved or avoided;
- any unresolved visual, accessibility, or performance risks.
