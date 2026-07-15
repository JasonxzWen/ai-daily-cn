# Visual Language

This reference captures the reusable visual language for
`effective-interact` reports.

## Tokens

| Token | Value | Use |
| --- | --- | --- |
| Page | `#FAF9F5` | Artifact background |
| Paper | `#FFFFFF` | Panels, cards, tables |
| Ink | `#141413` | Headings and primary text |
| Body ink | `#3D3D3A` | Body copy |
| Muted | `#87867F` | Metadata and secondary text |
| Line | `#D1CFC5` at `1.5px` | Borders, dividers, table rules |
| Soft band | `#F0EEE6` | Headers, prompts, inactive controls |
| Clay | `#D97757` | Active state, recommendation, focus |
| Oat | `#E3DACC` | Quiet fills |
| Olive | `#788C5D` | Pass/success |
| Rust | `#B04A3F` | Fail/danger |

## Typography

- Body/UI: system sans.
- H1 may use serif for the html-effectiveness feel.
- Section H2 defaults to system sans for Chinese-heavy engineering reports.
- Code, labels, counters, paths, and exports use monospace.
- Letter spacing is `0` for readable text. Use uppercase tracking only for
  tiny metadata labels.

## Density

- Default report width: `min(1280px, calc(100vw - 28px))`.
- Default desktop top padding: `20-28px`.
- Default mobile side padding: `9-18px`.
- Default panel radius: `8px`; use `12px` only for visual-gallery surfaces.
- Prefer compact tables and source panels over repeated card grids.

## Navigation

Navigation should lean toward the `html-effectiveness` index page:

- pill-like links;
- `translateY(-2px to -3px)` on hover;
- border darkens on hover;
- clay active/arrow affordance;
- subtle shadow only on hover/focus.

But keep it compact:

- overview plus 4-6 primary targets by default;
- no long row of every section when the page is long;
- group secondary audit sections or omit them from primary navigation.

## Interactions

Keep and strengthen local report interactions:

- data-table row, column, and cell hover;
- evidence spotlight following pointer position;
- card hover with small lift and shadow;
- copy buttons with visible success/fail state;
- details/source toggles for code and audit evidence;
- `prefers-reduced-motion` coverage.

Motion must explain focus, selection, navigation, or copy feedback. It is never
decorative spectacle.

## Code Panels

Code is a first-class evidence surface:

- dark panel;
- visible file/source label;
- line numbers;
- highlighted lines;
- syntax tokens for supported languages;
- explicit degraded state when tokenization is unavailable.
