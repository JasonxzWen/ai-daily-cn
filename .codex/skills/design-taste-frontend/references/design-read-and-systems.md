# Design Read And Systems

Source: adapted from `Leonxlnx/taste-skill` at `3c7017d636c3a4aad378433ea6d0cfa6c921da4a` under MIT. Scope is narrowed for Harness Hub routing.

## Table Of Contents

- [Brief Inference](#brief-inference)
- [Design Dials](#design-dials)
- [Design-System Map](#design-system-map)
- [Aesthetic Directions](#aesthetic-directions)

## Brief Inference

Read these signals before touching code:

- Page kind: landing page, marketing page, portfolio, redesign, editorial page, or brand page.
- Audience: buyer, recruiter, consumer, developer, public-sector visitor, or accessibility-critical user.
- Vibe words: minimalist, calm, Linear-style, Awwwards, brutalist, premium consumer, Apple-y, playful, serious B2B, editorial, agency, glassy, dark tech.
- References: URLs, screenshots, named products, competitor brands, existing design system.
- Existing assets: logo, colors, type, photography, icon style, product screenshots.
- Quiet constraints: regulated industry, public sector, kids' product, trust-first commerce, low-motion audience.

Before generating UI, write one sentence:

`Reading this as: <page kind> for <audience>, with a <vibe> language, leaning toward <system or aesthetic family>.`

Ask one question only when the brief genuinely splits between two different directions.

## Design Dials

Use these as working variables:

| Dial | Meaning | Default |
|---|---|---:|
| `DESIGN_VARIANCE` | 1 is symmetrical and conservative; 10 is experimental and asymmetric. | 8 |
| `MOTION_INTENSITY` | 1 is static; 10 is cinematic or physics-driven. | 6 |
| `VISUAL_DENSITY` | 1 is gallery-airy; 10 is cockpit-dense. | 4 |

Use-case presets:

| Use case | Variance | Motion | Density |
|---|---:|---:|---:|
| SaaS landing | 7 | 6 | 4 |
| Agency or creative landing | 9 | 8 | 3 |
| Premium consumer landing | 7 | 6 | 3 |
| Designer or studio portfolio | 8 | 7 | 3 |
| Developer portfolio | 6 | 5 | 4 |
| Editorial or blog | 6 | 4 | 3 |
| Public-sector service | 3 | 2 | 5 |
| Redesign preserving brand | match existing | existing + 1 | match existing |
| Redesign overhaul | existing + 2 | existing + 2 | match existing |

## Design-System Map

Use the official design system when the brief clearly points there:

| Brief reads as | Prefer |
|---|---|
| Microsoft or enterprise SaaS | Fluent UI |
| Google or Material-flavored product | Material Web / Material 3 |
| IBM-style B2B analytics | Carbon |
| Shopify admin surface | Polaris |
| Atlassian or Jira-style product | Atlassian Design System |
| GitHub-style developer tool | Primer |
| UK public-sector service | GOV.UK Frontend |
| US public-sector service | USWDS |
| Fast local-business MVP | Bootstrap |
| Modern accessible React foundation | Radix Themes |
| Modern SaaS with owned components | shadcn/ui |

Do not mix design systems in one project. Do not import system tokens and then override most of them.

For package choices, verify current official docs when the dependency affects implementation.

## Aesthetic Directions

These are aesthetics, not official systems. Build them honestly with CSS, Tailwind, maintained components, or source-specific assets:

- Glassmorphism: backdrop filters, layered borders, solid-fill fallback.
- Bento: mixed-size CSS grid, not uniform cards.
- Brutalism: raw borders, strong type, deliberate roughness.
- Editorial: serif or distinctive display type, asymmetric grid, measured whitespace.
- Dark tech: mono, terminal motifs, neon accents only when the brand supports them.
- Kinetic typography: CSS or animation library used with reduced-motion coverage.
- Apple Liquid Glass on web: an approximation only; do not claim there is an official web CSS package.
