# Clone Website Extraction Checklist

Use this checklist after the safety gate and before implementation.

## Browser Evidence

- Desktop screenshot, ideally 1440px wide.
- Mobile screenshot, ideally 390px wide.
- Source URL and capture timestamp.
- Page title and top-level navigation labels.

## Visual Tokens

- Background colors and section bands.
- Text colors, muted colors, borders, and dividers.
- Font families, weights, sizes, and line heights for hero, section headings, body, labels, and buttons.
- Container widths, major spacing steps, section padding, and card radius.

## Topology

- Header behavior: static, sticky, transparent, shrinking, or hidden.
- Hero layout and first-viewport composition.
- Repeated content sections, cards, grids, editorial blocks, and footer groups.
- Mobile layout changes and breakpoints.

## Interaction Sweep

- Scroll-triggered changes.
- Hover states for links, cards, and buttons.
- Click targets: menus, tabs, dialogs, accordions, carousels.
- Animations, transition durations, and reduced-motion fallback.

## Implementation Notes

- Save one component spec per meaningful section.
- Use local replacement content if the target brand/content is not owned.
- Download only assets that are authorized for reuse; otherwise use generated/local placeholders.
- Run the build/check command after each major assembly step.
