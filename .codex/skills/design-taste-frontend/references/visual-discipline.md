# Visual Discipline

Source: adapted from `Leonxlnx/taste-skill` at `3c7017d636c3a4aad378433ea6d0cfa6c921da4a` under MIT.

## Table Of Contents

- [Anti-Default Discipline](#anti-default-discipline)
- [Typography](#typography)
- [Color](#color)
- [Layout](#layout)
- [Cards And Materiality](#cards-and-materiality)
- [Interaction States](#interaction-states)
- [Media](#media)
- [Motion](#motion)
- [Common AI Tells](#common-ai-tells)

## Anti-Default Discipline

Avoid default LLM aesthetics unless the brief or brand evidence requires them:

- AI-purple gradients and blue-purple glows.
- Centered hero over dark mesh.
- three equal feature cards.
- Generic glassmorphism on every container.
- Infinite-loop micro-animations.
- Inter plus slate palette as the unexamined default.

The page should make sense for the audience and brand even if all placeholder copy were removed.

## Typography

- Pick type from the design read, not from habit.
- Pair display and body type only when the contrast improves hierarchy.
- Keep line length readable; adjust measure before shrinking text.
- Avoid using oversized hero type inside compact panels, cards, sidebars, or dashboards.
- Check mobile wrapping for long words, CTAs, and navigation labels.

## Color

- Build a palette with roles: background, surface, text, muted text, accent, success, warning, danger.
- Avoid one-note palettes dominated by one hue family.
- Use high contrast for primary content and focus states.
- Do not rely on gradient atmosphere when product, place, object, or state needs to be inspectable.

## Layout

- Vary section layouts across long pages. Repeating one card grid is a template tell.
- Use asymmetry or mixed grid tracks only when the content hierarchy supports it.
- Set stable dimensions for fixed-format UI: boards, grids, toolbars, tiles, counters, icon buttons, and media frames.
- Do not put cards inside cards. Use cards for repeated items, modals, and framed tools.
- Avoid decorative orbs, bokeh blobs, and generic gradient backgrounds.

## Cards And Materiality

- A card must clarify grouping, comparison, evidence, status, or action.
- Default rounded rectangles do not create design. Tune border, shadow, spacing, content density, and state.
- Keep card radii restrained unless the existing design system says otherwise.
- Use tables, timelines, or stepped flows when cards obscure relationships.

## Interaction States

- Every interactive element needs hover, focus-visible, disabled, loading, and error states when applicable.
- Buttons should use icons for common commands when a familiar symbol exists.
- Use toggles for binary state, segmented controls for modes, sliders or inputs for numeric values, menus for option sets, tabs for views.
- Focus order must follow the visual task order.

## Media

- Use real or generated bitmap images when the page depends on the product, person, place, or object being inspected.
- Avoid dark, blurred, cropped, stock-like media when users need to understand the actual subject.
- Give media stable aspect ratios and responsive bounds.
- Do not use SVG hero illustrations when a real or generated image would carry the subject better.

## Motion

- Motion must explain hierarchy, reveal state, or support delight at a key moment.
- Prefer one coherent choreography over scattered micro-animations.
- Respect `prefers-reduced-motion`; provide non-motion equivalents for scroll reveals and cinematic effects.
- Avoid scroll hijacking, cursor followers, and autoplay effects unless the brief explicitly asks for an experimental page.

## Common AI Tells

Check for these before handoff:

- Fake version footer, scroll cue, section numbers, or "crafted experience" copy.
- Placeholder names like Jane Doe, Acme, or generic SaaS metrics unless the project uses synthetic examples.
- Repeated icon cards with nearly identical copy.
- Feature sections that use the same heading, icon, paragraph rhythm in every row.
- Decorative gradients hiding weak hierarchy.
- Em dash-heavy marketing prose.
