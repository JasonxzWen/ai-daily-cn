# UI Prototype

Use a UI prototype when the question is about visual structure, interaction flow, density, or information hierarchy.

Prefer an existing page:

- keep existing data fetching, auth, params, and route context
- switch only the rendered subtree by query parameter, such as `?variant=A`

Use a new prototype route only when the idea has no natural host page.

Variant rules:

- default to 3 variants
- cap at 5 variants
- make variants structurally different
- keep real data and app chrome when available
- avoid real mutations unless the question requires them

Switcher rules:

- fixed bottom bar or similarly obvious control
- previous and next controls
- URL updates so variants are shareable
- keyboard shortcuts when practical
- hidden or removed before production

Cleanup:

- keep the winning design decision
- delete losing variants
- delete the switcher
- harden the chosen implementation through normal feature workflow
