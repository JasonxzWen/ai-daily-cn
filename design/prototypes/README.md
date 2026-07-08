# Prototype Records

Store AI design and prototype records here when they influence product implementation.

Use the template files:

- `_template.design.json`
- `_template.prompt.md`
- `_template.decision.md`

Rules:

- Keep generated source code out of this directory unless it is a short quoted reference inside a decision note.
- Prefer compressed screenshots: `.webp`, `.jpg`, `.jpeg`, or `.png`.
- Keep screenshots local to the repository and avoid private account data.
- Record generated-code policy as `forbidden`, `reference_only`, or `translated`.
- Run `corepack pnpm run design:validate` before a PR that adds or changes prototype records.
