# Generator And Validation Contract

This reference defines the execution contract that prevents future reports from
silently passing with broken content.

## Input Contract

- Input is component-first JSON.
- `template` is not supported. Use `intent.artifactKind`, `sections`, and
  component contracts instead.
- Unknown root fields should be rejected.
- Section fields may be component-specific, but known components must satisfy
  their required visible-content contract.
- The generator should fail before writing HTML when required visible content is
  missing.

## Renderer Contract

- Render only non-empty sections.
- Do not render empty cards, empty timeline steps, empty tabs, empty actions, or
  empty hero decision cards.
- Do not render root `claims`, `evidence`, `verification`, `nextActions`, hero
  counters, or visible success criteria unless `presentation.show*` explicitly
  opts in.
- Use compact defaults.
- Add navigation for primary sections only. Long audit material may exist in the
  page without becoming a primary nav item.
- Code sections must either contain highlight tokens or carry a visible
  degraded state.

## Validation Contract

Static validation must fail on:

- empty cards, strong labels, headings, timeline steps, tabs, actions, evidence,
  verification, and hero decisions;
- `complete` reports with pending, not-run, failed, or degraded verification
  unless the report explicitly explains the degraded state and is not final;
- code sections with `tokenCount === 0` when render state is `ready`;
- data tables with no body rows or no non-empty body cells;
- nav with too many primary links unless grouped or marked secondary;
- missing reduced-motion coverage;
- unsafe HTML, scripts, links, or source fallbacks exposed as user-facing text.

Browser validation must fail on:

- blank or incomplete viewports;
- horizontal overflow;
- clipped text;
- broken hover/focus/copy interactions;
- code with missing line wrappers or missing source fallback;
- Mermaid sections not ready when browser rendering was required.

## Final Handoff Rule

Generate the final report after final validation evidence is known. If
validation happens after HTML generation, regenerate or patch the JSON input and
regenerate. Do not hand off a `complete` report that contains stale pending
validation rows.
