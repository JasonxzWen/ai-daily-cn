# Effective Interact Patterns

## Interaction Workflow

Use this workflow every time the skill loads:

1. Treat loading as permission to run an HTML-worthiness check, not as an obligation to emit HTML.
2. Choose one primary pattern from [Pattern Selection](#pattern-selection). If no pattern fits, answer in chat or Markdown instead.
3. Start with the generator and the closest template. Use hand-written HTML only when the generator cannot express the required local editor or visualization.
4. Add rich sections only when the chosen pattern requires them. Do not add charts, Mermaid, code, diff, tabs, filters, claims, or controls just to make the page look richer or silence an advisory warning.
5. Validate the HTML and hand off the artifact link with validation status and any kept advisory warnings.

## Default Session Routing

The skill may load in every non-trivial session. The decision is whether to produce an artifact:

| Checkpoint | Produce HTML when | Chat/Markdown remains enough when |
|---|---|---|
| Session start | The user is comparing paths, reviewing evidence, learning a complex system, or asking for a durable alignment surface. | The task is a short factual answer, permission pause, or one-command status. |
| During work | The next useful user input depends on seeing options, blockers, file evidence, validation state, or a process map together. | The user only needs a concise status sentence before work continues. |
| Final handoff | Material repo or skill behavior changed, validation evidence matters, or the final answer would become a long linear file list. | The work is tiny, self-evident, and has no durable evidence beyond one command result. |

For material repo or skill changes, default to an `implementation-handoff` or `conclusion-dashboard` artifact. It should include the why, changed contract, file evidence, validation, remaining risks, and next action. This rule is meant to catch changes where a plain final answer hides the decision trail.

## HTML Usefulness Gate

Use this quick gate before choosing a pattern:

| Gate | Use HTML when | Markdown default |
|---|---|---|
| Strong signal | Options, structures, evidence, or controls become faster to compare, inspect, or act on in a browser. | A short answer, plain list, or compact table answers the user's question. |
| Comparison | There are 2 or more comparable options, statuses, files, findings, or scenarios with meaningful tradeoffs. | There is one item, or two items with no meaningful side-by-side decision. |
| Structure | The content is a flow, state, timeline, map, call path, architecture, dependency, or ownership model. | The sequence is linear and shorter than a small diagram. |
| Action | The user must choose, tune, sort, filter, copy, export, or return structured input. | The user only needs to read and acknowledge. |
| Evidence | Source anchors, code, diff, citations, evidence, or validation need local navigation. | One or two inline references are enough. |
| Density | Markdown would hide the main point in long linear text. | The main point remains obvious in a short Markdown reply. |

Do not generate HTML just because the topic is important. Generate HTML only when the artifact changes how quickly the user can understand, compare, verify, decide, or act.

## Pattern Selection

Use these Case-Derived Patterns as a routing and design checklist before choosing components. They adapt the 20 linked HTML effectiveness examples to this skill's single-file interaction-artifact boundary.

| Pattern | Use when | Required behavior | Boundary |
|---|---|---|---|
| `option-gallery` | The reader must choose between implementation, product, design, or rollout options. | Put options side by side with recommendation, tradeoffs, assumptions, and copyable next action. | Do not hide the recommendation in a long comparison table. |
| `module-map` | The user needs to understand a codebase area, architecture, trust boundary, or call path. | Show boxes/arrows, entry points, hot path, source anchors, and gotchas. | Use Mermaid or inline SVG only when the map is faster than prose. |
| `flow-drilldown` | A process, deploy path, incident path, request path, or state machine has steps and failure branches. | Show the route first, then step details, timings, failures, and owner/action metadata. | Avoid decorative diagrams without drilldown value. |
| `pr-writeup` | The author needs a reviewer-facing artifact, not just findings. | Lead with motivation, before/after, file tour, review focus, test plan, and rollout notes. | Do not replace the code review skill; this is the author-side handoff. |
| `explorable-explainer` | A concept or feature is easier to learn by toggling parameters, comparing examples, or seeing a live model. | Keep a readable TL;DR, then add controls, examples, glossary, and citations. | The page must still make sense without interaction or CDN runtime success. |
| `status-timeline` | Recurring status, release, or incident work needs quick scanning. | Use metric cards, timeline, risk/follow-up table, and owner/status filters only when useful. | Do not invent unsourced metrics or hide slipped work. |
| `disposable-export-editor` | The user needs to sort, triage, toggle, tune, or fill a small structured decision surface. | Every editor-like artifact must end with an export path: Markdown, JSON, diff, or checklist text in a visible fallback. | Never write files, call network APIs, store secrets, or mutate third-party resources from the page. |

Skip or route elsewhere:

- Production UI, websites, or reusable app surfaces -> `frontend-design`.
- Bundled React/Tailwind/shadcn artifacts -> `web-artifacts-builder`.
- Slide decks -> `frontend-slides`; this skill may discuss deck findings but should not generate the deck.
- Throwaway interaction experiments whose main purpose is selecting an interaction model -> `prototype`.

## Template Catalogue

Use the closest asset and delete sections that do not apply:

| Template | Use when | Core blocks |
|---|---|---|
| `assets/templates/implementation-handoff.html` | Completed implementation work needs changed areas, file evidence, verification gates, risks, and next actions. | conclusion strip, changed-area cards, evidence cards, verification gates, risk cards |
| `assets/templates/conclusion-dashboard.html` | A non-trivial task is complete and the user needs the conclusion, files, verification, and next actions in one place. | conclusion strip, metric cards, timeline, file evidence, highlighted snippet, Mermaid/SVG diagram slot |
| `assets/templates/review-findings.html` | A PR/code/doc review has multiple findings, severity levels, or reviewer focus areas. | severity filters, finding cards, annotated code panel, file tour, action export |
| `assets/templates/research-explainer.html` | Research, architecture, or module understanding needs citations, diagrams, examples, and a glossary. | TL;DR grid, rendered rich-text sections, tabbed examples, diagram panel, source rail |
| `assets/templates/decision-matrix.html` | Multiple options, product choices, or implementation approaches need trade-off comparison. | option cards, recommendation, risk notes, confirmation questions |
| `assets/components/interaction-ui.css` | A custom page needs common visual primitives. | cards, chips, source links, data tables, code blocks, diff panels, Mermaid evidence panels, focus/dim effects, responsive grids |
| `assets/components/interaction-ui.js` | A custom page needs simple interactions. | filters, tabs, search, copy/export buttons, evidence spotlight, data-table row/column hover, selected-state focus |
| `assets/components/rich-render-runtime.css` | An artifact needs runtime-rendered Markdown, Mermaid, or highlighted code. | rendered Markdown styling, Mermaid fallback styling, highlight token affordances |
| `assets/components/rich-render-runtime.js` | An artifact needs runtime-rendered Markdown, Mermaid, or highlighted code. | Marked + DOMPurify bridge, per-diagram Mermaid `render`, highlight.js tokenization, status badges |

## Static Component Boundary

Interaction components must preserve the single-file static HTML contract. Use inlineable HTML, CSS, and vanilla JS only for artifact components. Runtime-cdn artifacts may reference pinned browser libraries for Mermaid, Markdown parsing, sanitization, and code highlighting. If a visual idea requires React, Tailwind compilation, Vite, bundling, or a long-lived app runtime, do not add that dependency to this skill; port only the static shape that can be embedded in one static HTML file, or skip it.

## Generator Contract

Use the generator first for normal interaction artifacts:

```powershell
bun .codex/skills/effective-interact/scripts/create-interaction.mjs --input interaction.json --slug my-artifact --json
bun .codex/skills/effective-interact/scripts/validate-interaction.mjs .codex/skills/effective-interact/artifacts/my-artifact.html --json
```

Omit `--out-dir` for ignored skill-local intermediate artifacts. Add `--out-dir reports` only for durable examples that should be reviewed as repository artifacts.

Input is JSON and follows `references/interaction-input-schema.json`. The minimum useful shape is content-first and has no required evidence, code, diagram, verification, or action block:

```json
{
  "title": "简洁中文交互产物",
  "summary": "一句话先给结论。",
  "status": "complete",
  "renderMode": "runtime-cdn",
  "sections": [
    { "type": "markdown", "title": "结论", "group": "summary", "content": "- 只保留读者需要的内容。" }
  ]
}
```

Add richer sections only when they shorten the explanation:

```json
{
  "sections": [
    { "type": "mermaid", "title": "调用链", "group": "details", "content": "graph LR\n  A --> B" },
    { "type": "code", "title": "关键改动", "group": "details", "language": "typescript", "filePath": "src/file.ts", "startLine": 42, "highlightLines": [42], "content": "export const ok = true;" },
    { "type": "diff", "title": "行为差异", "group": "verification", "filePath": "src/file.ts", "startLine": 42, "content": "- return oldValue;\n+ return newValue;" }
  ],
  "evidence": [
    { "kind": "file", "label": "实现位置", "value": "src/file.ts", "status": "info" }
  ],
  "verification": [
    { "label": "聚焦测试", "status": "pass", "detail": "bun test ./tests/example.test.ts" }
  ]
}
```

Supported section types: `summary-cards`, `data-table`, `markdown`, `mermaid`, `code`, `diff`, `timeline`, `evidence`, `decision-matrix`, `actions`, `tabs`, `filterable-cards`, and `chart`. Optional section fields `group`, `priority`, `summary`, `status`, `richId`, and `trustLevel` drive grouped navigation, runtime state, and sanitization. Optional root fields `intent`, `claims`, `evidence`, `verification`, and `nextActions` are rendered only when useful or non-empty.

## Decision Quality Contract

Intent is optional but preferred. Use it before choosing components:

```json
{
  "intent": {
    "audience": "maintainer",
    "primaryQuestion": "Can we accept this change?",
    "decision": "Review and archive when validation stays green.",
    "timeBudget": "3m",
    "artifactKind": "decision",
    "successCriteria": ["Conclusion is first", "Important claims link to evidence"]
  }
}
```

When intent is omitted, the generator infers conservative defaults from the template, sections, evidence, verification, and render mode. The first reading area must still answer the primary question before evidence, runtime dependency details, or component plumbing.

Claims make conclusions auditable:

```json
{
  "claims": [
    {
      "id": "claim-ready",
      "statement": "The fixture path validates the artifact contract.",
      "kind": "conclusion",
      "evidenceIds": ["evidence-fixture"],
      "confidence": "high",
      "dateRange": "2026-05-18",
      "knownLimits": ["Browser checks depend on local Chrome availability."]
    }
  ],
  "evidence": [
    {
      "id": "evidence-fixture",
      "kind": "file",
      "label": "Fixture artifact",
      "value": ".codex/skills/effective-interact/assets/fixtures/chart-accessibility-stress-report.json",
      "status": "info",
      "filePath": ".codex/skills/effective-interact/assets/fixtures/chart-accessibility-stress-report.json",
      "line": 1,
      "trustLevel": "mixed-trust"
    }
  ]
}
```

Important claim kinds are `conclusion`, `metric`, `trend`, `risk`, and `recommendation`. They need `evidenceIds` unless intentionally marked as an `assumption` or low-confidence inference.

Use `chart` only for small explanatory visuals. Supported chart types are `bar`, `line`, `sparkline`, `bullet`, `slope`, and `matrix`. Every chart needs title, takeaway, data, encoding, source, alt text, and table fallback:

```json
{
  "type": "chart",
  "title": "Validation coverage",
  "chart": {
    "type": "bar",
    "title": "Validation coverage",
    "takeaway": "Each contract area has deterministic checks.",
    "data": [{ "area": "Intent", "checks": 4 }],
    "encoding": { "label": "area", "value": "checks" },
    "source": { "label": "Fixture matrix", "accessedAt": "2026-05-18" },
    "altText": "Bar chart showing validation checks by contract area.",
    "tableFallback": {
      "columns": ["area", "checks"],
      "rows": [{ "area": "Intent", "checks": 4 }]
    }
  }
}
```

Unsupported or malformed charts degrade to a table fallback instead of emitting arbitrary SVG, script, or canvas content.

## Decision Briefing Contract

HTML interaction artifacts exist to lower the reader's decision cost. Use the Pyramid principle for structure, BLUF for the first sentence, and SCQA only as the hidden reasoning path when background is needed.

- First sentence: answer the primary question in one direct sentence, ideally under 90 characters.
- Support: keep the top layer to Top 3 mutually distinct points; push detail into evidence, code, diagrams, or appendix-style sections.
- Boundary: label important statements as fact / inference / assumption through claim kind, confidence, and evidence links.
- Density: prefer data, contrast, status counts, or source anchors over adjectives.
- Ending: include a CTA or next action when the reader must approve, review, unblock, or continue work.

The validator exposes `decision-brief-scan` as a non-blocking quality check. Treat its warnings as prompts to rewrite the artifact before handoff.

## Information Architecture Contract

Use communication theory as a design constraint, not as decoration:

| Principle | Artifact move | Failure symptom |
|---|---|---|
| BLUF / Pyramid | Put the conclusion and decision request first, then reveal support by priority. | The reader must scroll before knowing what happened. |
| SCQA | Use Situation, Complication, Question, Answer to explain why the artifact exists. | Context feels like a pile of facts with no tension. |
| PREP | For each major claim, state Point, Reason, Evidence, and Practical next step. | Cards repeat conclusions without proof or action. |
| MECE | Split sections into mutually distinct buckets such as trigger, rendering, typography, navigation, validation. | Cards overlap and lower information entropy. |
| LATCH | Order details by Location, Alphabet, Time, Category, or Hierarchy; pick one order and keep it visible. | Navigation feels random or disconnected. |
| DIKW | Separate raw data, interpreted information, knowledge, and decision wisdom. | Evidence and recommendation blur together. |
| OODA | Show observation, orientation, decision, and next action when a workflow is still moving. | The page explains history but not what to do next. |
| Cognitive load | Use progressive disclosure, filters, tabs, and tables only when they reduce working memory. | Controls exist but do not shorten reading. |
| Information scent | Nav labels, section titles, and cards must promise the exact detail they contain. | Clicking a section does not answer the expected question. |
| Information entropy | Each block should add a new decision-relevant bit: status, contrast, evidence, risk, or action. | Multiple blocks paraphrase the same vague reassurance. |

When the artifact feels low-entropy, cut duplicated claims before adding components. When it feels dense but hard to use, add structure: grouped navigation, a data table, a rendered diagram, or code evidence.

## Warning Policy

Validator warnings are advisory prompts, not a checklist to clear. In short: warning != required fix.

- Fix the warning when the change lowers decision cost, shortens reading, or makes evidence easier to trust.
- Keep the warning when the richer rendering, extra claim, or extra CTA would add noise.
- If a warning is kept, mention the reason in the handoff instead of hiding it or adding decorative content.
- Never add Mermaid, code, diff, charts, claims, or controls just to silence a warning.

## Writing Density Contract

- Lead with the conclusion. Prefer one sentence before supporting detail.
- Prefer `data-table` for structured, segmented, point-by-point, status, comparison, checklist, metric, or ownership data.
- Keep section summaries to one short line; do not use them as paragraphs.
- Keep table cells as phrases. Move long explanation to a short Markdown note or a dedicated detail section.
- Keep each bullet to one judgment or one action. Split mixed risk/action/context bullets.
- Mark key conclusions, risks, changes, and verification results with `**...**` or `==...==` so the page has visible reading anchors.

Use `data-table` for structured, segmented, point-by-point, status, checklist, metric, comparison, or ownership data. A table section accepts `columns` as strings or `{ "key": "...", "label": "...", "align": "left|center|right" }` objects and `rows` as arrays or objects keyed by column. Cell values may be strings, numbers, arrays, or simple objects. Keep the table semantically useful: if the data has no stable row/column relationship, use bullets or cards instead.

Generator and validator scripts are internal `effective-interact` assets. Do not expose them as a separate installable capability unless a later OpenSpec change approves that boundary.

## Artifact Selection

| Work type | HTML pattern | Useful controls |
|---|---|---|
| Planning | timeline + risk matrix + dependency sketch | filter by owner, copy checklist |
| Code review | source-linked code evidence + annotated diff + file tour + severity index | jump links, collapse low-risk notes |
| Code understanding | module boxes + arrows + entry point list | highlight hot path |
| Design reference | swatches + type scale + component contact sheet | copy token, state tabs |
| Decision prototype | isolated interaction or animation inside the artifact | sliders, toggles, reset, visible export |
| Research | TL;DR + tabs + glossary + citations | search, expand all |
| Status update | summary cards + chart + timeline | filter by status |
| Incident timeline | minute-by-minute timeline + logs + follow-ups | severity tags, owner filters |
| Custom editor | board/form/table for a specific decision | export Markdown/JSON/diff |

## Data Table Component

- Use a `data-table` section when the artifact has repeated fields across multiple items, because the reader can compare rows faster than scanning separate cards.
- The component highlights the hovered or focused cell, its row, and its column. The hovered cell receives both row and column highlight classes plus a small `transform: scale(...)` emphasis; neighboring cells use color and outline only, so the table does not reflow.
- Keep column labels short, use `align: "right"` only for numbers, and let long text wrap inside cells. On narrow screens the table must scroll inside its own wrapper rather than widening the page.
- Do not use the table component as decoration. A two-column key/value table is useful for status summaries; a single row of large prose is usually better as normal Markdown.

## Rich Content Contract

- **Language/encoding**: generated artifacts are Chinese-first UTF-8. Continuous half-width question marks or replacement characters are validation failures because they usually indicate a non-UTF-8 shell/stdin path corrupted the interaction input.
- **Markdown**: convert headings, lists, tables, callouts, links, `**strong**`, `*emphasis*`, and `==highlight==` into semantic HTML. Do not make the user read raw Markdown unless it is an explicit source excerpt.
- **Mermaid**: use it only when a non-trivial sequence, architecture, call-path, or data-flow diagram is faster than text. For dynamic diagrams, pin Mermaid and call `mermaid.render`; keep Mermaid source in hidden machine-verifiable fallback data, not a visible source block. A Mermaid section that remains failed or degraded after browser validation is not handoff-ready.
- **Code**: show code only when the artifact needs exact implementation evidence. Use the smallest useful snippet with source file link, line number or range, copied snippet, highlighted decisive lines, and a one-line reason. Code should use a rounded editor-like monospace stack and a broad, vivid token palette so the snippet is faster to scan than plain text.
- **Diff**: include a `diff` section only for review findings, behavioral changes, or before/after examples where prose would be ambiguous.
- **File references**: render as clickable local-path anchors when the host supports them, or as copyable path chips otherwise; do not create a separate evidence section when one sentence is enough.
- **Citations**: keep source cards short and optional: title, source, date/accessed, and why it matters.

## Rich Content Opportunity

The default is not "always add diagrams and snippets"; it is "do not flatten naturally rich evidence into generic cards." Choose rich rendering when it reduces reasoning effort:

- Use Mermaid for trigger routing, workflow, call path, dependency, state-machine, architecture, or data-flow explanations.
- Use `code` when a file-and-line anchor is central to the claim, especially for skill descriptions, config, schema, or decisive implementation snippets.
- Use `diff` when the artifact is about before/after behavior, a review finding, or a patch boundary.
- Use Markdown for short prose, bullets, command lists, compact tables, and callouts that need semantic structure but not a bespoke component.

The validator emits non-blocking rich-content opportunity warnings when it sees flow/routing language without Mermaid or central file-line evidence without a code/diff section. Treat those warnings as a prompt to revise the fixture unless the richer section would be noise.

## Runtime Rendering Support

Use `runtime-cdn` as the default Codex-visible artifact path. It keeps the artifact as one static HTML file, but lets the browser use pinned libraries for rich rendering. Use `pre-rendered` only when primary rich content must not depend on CDN scripts. Use `fallback-only` only for constrained environments where readable source is acceptable.

Render modes:

- `runtime-cdn` is the default. It declares pinned runtime dependencies in a hidden machine-readable manifest, keeps hidden source fallback data, and exposes ready/degraded/failed state through attributes rather than visible effect tags. Set `showRuntimeDependencies: true` only when dependency loading is part of the artifact.
- `pre-rendered` is explicit. Critical CSS/JS is inlined, Markdown becomes semantic HTML, Mermaid should become real inline SVG, and code gets static highlight spans. If Mermaid cannot render, do not treat the fallback as a successful diagram.
- `fallback-only` is explicit degraded output. It keeps source text readable without claiming rich rendering success.
- `runtime` is a legacy alias accepted by the generator and normalized to `runtime-cdn`.

Pinned runtime bundle pattern:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@highlightjs/cdn-assets@11.11.1/styles/github-dark.min.css">
<script src="https://cdn.jsdelivr.net/npm/dompurify@3.4.2/dist/purify.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@highlightjs/cdn-assets@11.11.1/highlight.min.js"></script>
<script type="module">
  import { marked } from "https://cdn.jsdelivr.net/npm/marked@18.0.3/lib/marked.esm.js";
  window.marked = marked;
  window.dispatchEvent(new Event("rich-render-libs-ready"));
</script>
<script type="module">
  import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11.15.0/dist/mermaid.esm.min.mjs";
  window.mermaid = mermaid;
  window.dispatchEvent(new Event("rich-render-libs-ready"));
</script>
```

Runtime rules:

- Marked parses Markdown but does not sanitize output; sanitize with DOMPurify unless the Markdown is trusted generated content.
- Mermaid should initialize with `startOnLoad: false` and a strict security level, then render each diagram into its own target with independent failure state. Browser-required validation fails when any Mermaid section is not `ready` with an SVG.
- highlight.js should use explicit language classes such as `language-typescript`; line-number wrappers and highlighted lines are applied by local interaction JS around highlighted token markup. Do not insert text newlines between block line wrappers; that creates fake blank rows in `<pre>`.
- Every runtime-rendered block still needs hidden source fallback data for audit and degraded states, but do not show `Source fallback`, `Code source`, `Markdown rendered`, or `Code highlighted` labels during normal successful rendering.
- CDN runtime use is a conscious tradeoff: better Codex-visible rendering, but weaker offline guarantees than pre-rendered output.
- Runtime dependencies must stay pinned and auditable. Include integrity metadata when available; otherwise declare an explicit `data-runtime-dependency-integrity-exemption` in the manifest and generated tags.
- Browser, Mermaid pre-render, and validator diagnostics must be sanitized before entering HTML or JSON output. Replace local absolute paths, `file:///` URLs, home-directory paths, and GitHub-style tokens with placeholders, strip raw HTML/script, and keep only the short actionable error.

## Grouped Navigation Contract

- Derive a grouped index from `section.group`; infer missing groups conservatively as `main`.
- Prefer content groups such as `summary`, `main`, `changes`, `impact`, `risks`, `decision`, `verification`, `next`, and `details`.
- Use component groups such as `diagrams`, `code`, or `evidence` only when the artifact intentionally contains those components and the group helps the reader.
- Desktop artifacts should keep navigation visually separate from the reading column.
- Narrow artifacts should wrap, collapse, or scroll navigation without body-level horizontal overflow.
- Navigation, tab, and filter controls should read as joined segmented groups, not scattered buttons. Include a return-to-overview path for long artifacts.
- Long section names need wrapping, truncation with `title`, or an equivalent accessible affordance. Navigation labels are Chinese by default and should describe the argument, not the widget inventory.

## Visual Quality Contract

- Body text, metadata, card text, code, table cells, and diagram labels need explicit font size, line height, and font weight.
- Engineering artifacts should be dense but readable; avoid oversized gaps and ultra-light text.
- Code line height should stay near normal editor density; blank vertical gaps between consecutive code lines are a bug.
- Code highlighting should distinguish keywords, strings, numbers, attributes, properties, comments, types, functions, tags, additions, and deletions with clearly different colors.
- Code panels own their overflow and must not expand the page width.
- Mermaid panels own their overflow and must not cover adjacent sections.
- Hover and focus states may change color, outline, border, and shadow, but must not shift neighboring layout.
- Muted text, code comments, line numbers, status pills, and highlighted lines must remain legible in Codex.

## Interaction And Motion Contract

- Use hover/focus to reveal affordances, not to hide essential evidence.
- Apply dim/blur to non-focused cards during filtering or hover comparison, but never make text unreadable.
- Use transitions for opacity, transform, color, and outline; keep durations around 120-220ms.
- Support keyboard state with `:focus-visible`.
- Include `@media (prefers-reduced-motion: reduce)` and remove transform/animation there.
- Keep animation purposeful: draw attention to changed state, selected findings, copied output, or active filters.

## Validation Contract

Run `scripts/validate-interaction.mjs` on generated or custom HTML before handoff. The validator checks:

- artifact root, non-empty content, and safe content boundaries
- UTF-8/mojibake guardrails, including continuous half-width question marks
- render mode, grouped navigation, section group metadata, source fallback, and runtime state
- runtime dependency manifest and pinned versions for runtime-cdn artifacts
- intent metadata for audience, primary question, decision density, and time budget
- claim/evidence relationships, including claim id in failure output
- chart accessibility fields: takeaway, alt text, source metadata, and table fallback
- runtime dependency integrity metadata or documented exemptions
- trust-model boundaries and unsafe sinks for mixed-trust or untrusted content
- Markdown table/list rendering or explicit runtime fallback
- Mermaid ready SVG in browser-required validation; degraded or failed Mermaid is blocking
- code highlight markup, language classes, line wrappers, and inert file path labels
- evidence, verification status, filter, tab, and copy controls only when the artifact contains those optional modules
- browser checks across narrow, medium, and desktop viewports for body overflow, major overlap, Mermaid containment, code tokens, chart containment, visible focus, reduced-motion CSS, primary conclusion visibility, and control state changes

If Playwright/Chrome is unavailable, browser-only coverage must be reported as `degraded`; with `--require-browser`, validation must fail instead of silently claiming browser checks passed.

Security rules are generator defaults, not optional polish:

- Escape user-controlled text in cards, evidence, file chips, and actions.
- Sanitize Markdown output and strip unsupported HTML/event-handler content.
- Restrict rendered links to `http`, `https`, `mailto`, or local anchors; neutralize `javascript:` links.
- Treat file paths and code snippets as inert text unless a host-specific safe file link is intentionally created.
- Treat diagnostic strings as mixed-trust content: sanitize local paths, `file:///` URLs, token-shaped secrets, raw HTML, and event handlers before they are embedded in artifact fallback SVGs or validator JSON.

## Layout Skeleton

Use this structure unless the task clearly needs something else:

```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Report title</title>
  <style>
    :root { color-scheme: light; }
    body { margin: 0; font-family: system-ui, sans-serif; line-height: 1.5; }
    main { max-width: 1120px; margin: 0 auto; padding: 24px; }
    nav a { display: block; }
    section { margin-block: 28px; }
    .summary { border-left: 4px solid #2563eb; padding-left: 16px; }
    @media (max-width: 720px) { main { padding: 16px; } }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>Report title</h1>
      <p>Generated YYYY-MM-DD. Scope and assumptions.</p>
    </header>
    <aside class="summary">Top finding or decision.</aside>
    <div class="report-layout">
      <nav aria-label="Report sections"></nav>
      <section id="main-workspace"></section>
    </div>
    <!-- Optional evidence, verification, and next-action sections appear only when non-empty. -->
  </main>
</body>
</html>
```

## Interaction Rules

- Keep JavaScript small and local to the artifact.
- Make controls obvious: buttons for commands, checkboxes/toggles for binary state, select inputs for modes, text input for search.
- Never hide the source data so thoroughly that the artifact cannot be audited.
- For export buttons, produce plain text in a visible `<textarea>` as a fallback to clipboard APIs.
- Do not build credential or token tools in this skill. If the workflow needs credentials, network writes, repo writes, or durable persistence, route it outside `effective-interact`.

## Visual Rules

- Engineering artifacts should be dense but calm.
- Use color to encode severity, status, ownership, or grouping.
- Avoid decorative backgrounds that make evidence harder to read.
- Use responsive grids and allow tables to scroll horizontally on small screens.
- Prefer inline SVG for diagrams that need precise labels or arrows.
- Replace paragraphs longer than 3 short lines with cards, bullets, or progressive disclosure.
- Let the page do work Markdown cannot: spatial comparison, sticky context, direct code emphasis, filters, copy/export, and rendered diagrams.
