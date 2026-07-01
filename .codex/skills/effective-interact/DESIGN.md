# Effective Interact Design Contract

This is the short contract for future `effective-interact` HTML artifacts.
Read it before writing JSON input or custom HTML.

The artifact is not a template fill exercise. Compose the smallest set of
validated components that helps the reader understand, compare, verify, decide,
or continue with less effort.

Source basis: `ThariqS/html-effectiveness` at
`0e8d447494c81c661f2458b329e076a7ff7d75ec`, Apache-2.0. Reuse the visual
language and interaction ideas only. Do not copy example business copy,
fictional sample data, tracking code, or page-specific labels.

## Operating Principles

1. Start with the reader decision, not the section list.
2. Use Top 3 by default; use Top 4 or 5 only when the evidence naturally needs it.
3. Prefer compact engineering density. Use spacious gallery layouts only for
   visual approval or option inspection.
4. Delete any section that does not add a new decision-relevant fact,
   verification path, risk, or action.
5. Treat validation as part of generation. A report that passes only because it
   has empty structure has failed.
6. Keep static single-file HTML with inlineable CSS and vanilla JS. Do not add
   React, Tailwind, shadcn, persistence, credentials, analytics, or network
   writes.

## Upstream/Local Aggregation Policy

Treat upstream Harness Hub `effective-interact` as the style and component
reference, not as a safe wholesale replacement for this repository. Keep the
upstream component-first visual language: compact panels, grouped navigation,
filterable cards, source-linked evidence, static single-file output, and
validation-first handoff. Preserve local AI daily production extensions when
they provide stricter public-report behavior: title links, safe external links,
semantic media with lightbox support, hero stats/links, tracking components,
official snapshot containment, and richer card details.

When upstream and local behavior conflict, prefer the stricter local production
contract if it is bound to `npm run test` or `npm run validate`. In particular,
do not import hover patterns that dim, blur, grayscale, or suppress sibling
card text in public-reader reports; hover/focus can lift, outline, shadow, or
spotlight the active item without making neighboring evidence harder to read.

## Required References

- `references/report-ia.md` - information budget, first screen, navigation,
  repetition, and disclosure rules.
- `references/visual-language.md` - colors, type, density, hover, motion,
  code panels, and index-like navigation.
- `references/component-contracts.md` - component inputs, visible-content
  requirements, empty states, and boundaries.
- `references/generator-validation-contract.md` - schema, renderer, validation,
  browser checks, and final handoff rules.

## Non-Negotiables

- Root `status: "complete"` cannot coexist with pending or not-run verification
  in the same final report.
- Component cards, tables, timelines, hero decisions, claims, evidence, and
  verification blocks must have visible non-empty content.
- Code blocks must either contain real highlight tokens or be explicitly marked
  degraded; `class="hljs"` alone is not enough.
- Navigation should help orientation. If it becomes a long horizontal checklist,
  group, shorten, or remove items.
- Optional root blocks (`claims`, `evidence`, `verification`, `nextActions`),
  hero counters, and visible success criteria require explicit
  `presentation.show*` opt-in. They are not default report slots.
