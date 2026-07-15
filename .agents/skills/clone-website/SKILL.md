---
name: clone-website
description: "Load when the user explicitly asks to clone, reverse-engineer, or rebuild a website they own or are authorized to reproduce; do not load for generic redesign, inspiration, scraping, phishing, impersonation, or copying third-party brands."
argument-hint: "<authorized-url> [replacement-content-or-brief]"
user-invocable: true
license: MIT
metadata:
  source: "JCodesMore/ai-website-cloner-template clone-website skill"
  upstream_commit: "c9b4fea5b257370af339abedad727c8903490dac"
  license: "MIT"
  adaptation: "Safety-first Skill Hub wrapper; upstream workflow is summarized in references and host-specific platform metadata is excluded."
---

# Clone Website

Use this skill for explicit website reconstruction requests where the user has authority to reproduce the target page. Treat it as a side-effect-heavy workflow: it uses browser inspection, network access, local file writes, asset handling, and build validation.

## Required Gates

1. Confirm the user supplied a URL and a legitimate reproduction purpose. If ownership or permission is unclear, ask before continuing.
2. Use `assets/website-cloner` from this skill or an equivalent isolated app workspace. Do not run this inside an unrelated production app unless the user explicitly asks.
3. Inspect the live page with browser automation before building. If browser automation is unavailable, stop and report that the clone cannot be verified.
4. Write durable extraction notes before implementation: topology, visual tokens, interaction behavior, and component specs.
5. Replace third-party brand copy/assets with the user's requested content unless they explicitly own the original material.
6. Build and inspect the result before handoff. At minimum run the harness check command and capture one desktop screenshot.

## Default Scope

- Clone one URL at a time unless the user explicitly asks for multiple sites.
- Match layout, rhythm, typography scale, color mood, and interaction model.
- Do not copy logos, trademarks, proprietary images, tracking scripts, forms, accounts, or backend behavior.
- Prefer local/generated content and simple assets when the target is only a visual reference.
- Record gaps rather than guessing hidden behavior.

## Progressive Files

- Read `references/safety-and-permissions.md` before any external site clone.
- Read `references/extraction-checklist.md` during browser inspection.
- Read `references/upstream-workflow.md` when adapting the full upstream pipeline.
- Use `assets/component-spec-template.md` for section handoffs or research notes.

## Validation

For the local harness, run:

```bash
npm run check
```

When using a framework app, also run the nearest build/typecheck/lint commands. A clone that does not build or cannot be opened in a browser is not complete.
