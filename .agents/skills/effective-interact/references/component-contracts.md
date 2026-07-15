# Component Contracts

This file defines the report component input contracts. The generator and
validator should enforce these contracts together.

## Shared Section Fields

Every section requires:

- `type`: supported component type.
- `title`: visible section heading.

Common optional fields:

- `group`: short navigation group.
- `summary`: one-line reason the section exists.
- `status`: `ready`, `warn`, `failed`, `info`, `pending`, `degraded`,
  `complete`, `review`, `blocked`, or `draft`.
- `trustLevel`: `trusted-generated`, `mixed-trust`, or `untrusted`.

Do not use a component if its required visible content is empty.

## Components

| Type | Required Fields | Visible Content Rule | Use When |
| --- | --- | --- | --- |
| `summary-cards` | `cards[].label`, `cards[].value` | Every card must show both label and value. | Top 3 scan, status band, gate totals. |
| `data-table` | `columns[]`, `rows[]` | At least one column, one row, and one non-empty body cell. | Shared fields, evidence maps, issue/status tables. |
| `timeline` | `items[].label`, `items[].detail` | Every item must show an anchor label and detail. | Sequence, incident, validation, rollout. |
| `code` | `language`, `content`, source label/path | Content must render line wrappers and highlight tokens or degraded state. | Exact source evidence. |
| `diff` | `content` | Must show added or removed lines. | Before/after behavior matters. |
| `mermaid` | `content` | Browser-required validation must render SVG or mark degraded. | Flow, dependency, state, architecture. |
| `decision-matrix` | `options[].name`, `options[].points[]` | Each option must show name and at least one point. | Tradeoff choice. |
| `filterable-cards` | `items[].title`, `items[].body` | Every visible card must show title and body. | Review findings, option sets, triage. |
| `tabs` | `tabs[].label`, `tabs[].content` | The first tab must show visible content without interaction. | Alternate views or examples. |
| `actions` | `items[]` | Every action must be concrete and copyable. | Hand-off actions or export path. |
| `chart` | chart contract in schema | Must include takeaway, source, alt text, and table fallback. | Real data comparison, not decoration. |
| `markdown` | `content` | Must contain visible structure when used in HTML. | Short rich explanation, not generic prose. |

## Root Blocks

Root `claims`, `evidence`, `verification`, and `nextActions` are optional.
They are machine/audit data by default, not visible report slots. Render them
only when the input explicitly opts in through `presentation.showClaims`,
`presentation.showEvidence`, `presentation.showVerification`, or
`presentation.showNextActions` and the content adds distinct value not already
carried by sections.

Rules:

- Important claims need evidence IDs.
- Evidence cards need a visible label and value/source/command/path.
- Verification cards need label, status, and detail.
- `complete` reports cannot include `not-run` or `pending` verification unless
  the report is explicitly a draft/review.

## Empty State Policy

Empty required content is an error, not a warning. The generator should reject
bad input before writing HTML when possible. The validator should still fail
HTML that contains empty visible component shells.
