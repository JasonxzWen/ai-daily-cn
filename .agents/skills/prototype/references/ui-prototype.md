# UI Prototype

Use a UI prototype when the question is about visual structure, interaction flow, density, or information hierarchy.

Choose the cheapest evidence that can answer the current question:

- visual brief when words can resolve the direction
- Host-native image when the open question is static appearance
- runnable UI when state, input, continuity, responsiveness, or accessibility must be experienced

Image-assisted prototypes:

- Use Host-native image generation when a visual reference answers the design question faster than code alone.
- Prompt only from public or generated material, or assets the user supplied or explicitly approved for this generation. Reduce private context to de-identified visual descriptors; never send source code, secrets, internal routes, customer or account data, private screenshots, or private copy.
- Compare the result against accepted design direction and constraints rather than treating it as the specification.
- Static images do not verify interaction, responsiveness, or accessibility.
- Do not add an SDK, API key, provider adapter, or pinned model name to the target project.
- When native generation or safe context is unavailable, return a visual brief instead of building another image runtime.
- Delete unselected images with the losing variants unless the user explicitly asks to preserve them.

Alternative rules:

- Generate only enough alternatives to distinguish unresolved choices; one is enough for a single hypothesis.
- make variants structurally different
- keep real data and app chrome when available
- avoid real mutations unless the question requires them
- Change only the affected direction while preserving accepted constraints.

Comparison aid:

- Reuse an existing page when runnable variants need its data, auth, params, or app chrome.
- Add a temporary switcher only when comparing multiple runnable variants in the same context materially reduces decision cost.
- Keep the control visibly prototype-only and remove it with losing variants.

Cleanup:

- keep the winning design decision
- delete losing variants
- harden the chosen implementation through normal feature workflow

Anti-patterns:

- variants that differ only in color or copy
- shared layout code that prevents variants from testing different structures
- real mutations unless the question is specifically about the mutation experience
- promoting prototype code directly to production without the normal implementation and verification workflow
