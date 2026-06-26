# Reviewer Lens Catalog

Apply the smallest reviewer set that covers the actual diff.

## Core Lenses

These run on every review:

| Lens | Focus |
|---|---|
| correctness | Logic errors, edge cases, state bugs, error propagation, intent mismatch. |
| testing | Missing coverage, weak assertions, brittle tests, behavioral changes with no tests. |
| maintainability | Coupling, complexity, naming, dead code, unnecessary abstraction. |
| project-standards | Local instructions, naming conventions, portability, skill or config contracts. |

## Conditional Lenses

Select these only when the diff touches the area:

| Lens | Select when the diff touches |
|---|---|
| security | Auth, permissions, public endpoints, user input, secrets, payments. |
| performance | Database queries, caching, loops over large data, async or I/O-heavy paths. |
| api-contract | Routes, serializers, exported types, public function signatures, event schemas. |
| data-migration | Schema changes, migrations, backfills, production data transformations. |
| reliability | Retries, timeouts, background jobs, health checks, error handling. |
| frontend-races | DOM timing, async UI state, animation, event listeners, client lifecycle code. |
| language-specific | TypeScript, Python, Rails/Ruby, Swift, or another stack with local conventions. |
| agent-native | User-facing actions that should also be reachable by an agent or API surface. |
| adversarial | Large diffs or high-risk domains where cross-component failure scenarios matter. |

## Selection Rules

Start with the core lenses. Add conditionals by reading the diff, not by keyword matching alone.

If a conditional lens is selected, include a one-line reason in the report header.

If sub-agents are used, pass each lens a bounded read-only task and require output that matches `findings-schema.json`. If sub-agents are not used, run the same lenses locally and still emit the same schema-shaped findings.
