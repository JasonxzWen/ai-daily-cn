# Redesign And Preflight

Source: adapted from `Leonxlnx/taste-skill` at `3c7017d636c3a4aad378433ea6d0cfa6c921da4a` under MIT.

## Table Of Contents

- [Redesign Protocol](#redesign-protocol)
- [Preservation Rules](#preservation-rules)
- [Modernization Levers](#modernization-levers)
- [Out Of Scope](#out-of-scope)
- [Final Pre-Flight](#final-pre-flight)

## Redesign Protocol

For existing projects, audit before touching code:

1. Identify whether the user wants preservation, targeted evolution, or full overhaul.
2. Capture the current visual system: layout, typography, colors, density, nav, cards, forms, media, and motion.
3. Name the main failures: hierarchy, spacing, contrast, generic palette, weak content density, missing state, broken responsiveness, or brand drift.
4. Decide what must be preserved: brand assets, product mental model, key flows, existing component API, accessibility behavior.
5. Make the smallest visual move that solves the stated problem unless the user asked for a full redesign.

## Preservation Rules

Do not silently change:

- brand logo, brand color, or official type;
- route structure and component ownership;
- form behavior or data semantics;
- accessibility semantics and keyboard paths;
- product screenshots or content meaning;
- domain-specific density requirements.

If a preservation rule conflicts with taste guidance, preserve first and explain the tradeoff.

## Modernization Levers

Apply in this order:

1. Typography scale and line length.
2. Spacing rhythm and section density.
3. Color roles and contrast.
4. Layout variety and hierarchy.
5. Card/container purpose.
6. Media quality and aspect ratios.
7. Interaction states.
8. Motion and transitions.

## Out Of Scope

This skill is not the owner for:

- dashboards, dense data tables, cockpit UIs, or operational tools;
- multi-step product flows or form-heavy app logic;
- routine React/Next state, routing, or data-fetching patterns;
- communication HTML reports or review handoffs;
- slide decks and presentations;
- image-generation-only creative boards.

## Final Pre-Flight

Before handoff, verify:

- The design read still matches the page and audience.
- Dials explain the chosen variance, motion, and density.
- The foundation is real, current, and not a fake official package.
- The page avoids AI-purple/default-card/generic-glass defaults unless justified.
- Typography wraps cleanly on mobile and desktop.
- Layout does not overlap, shift, or resize unpredictably.
- Cards, tables, and sections use the right component for the information.
- Images reveal the real subject or useful state.
- Hover, focus-visible, disabled, loading, and error states are present where needed.
- Motion has `prefers-reduced-motion` coverage.
- Contrast, landmarks, alt text, and keyboard order are acceptable.
- The final report names remaining visual or accessibility risks.
