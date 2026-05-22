# HTML Work Report Patterns

## Current Limits To Correct

The previous version was too passive:

- **Trigger debt**: it waited for explicit "make an HTML report" wording and missed substantial completed-task handoffs.
- **Asset debt**: it described report shapes but offered no templates, so every page started from scratch.
- **Visual debt**: it allowed Markdown-like pages with long paragraphs instead of requiring scan-first structure.
- **Rich-text debt**: Mermaid, Markdown, and code snippets were mentioned but not enforced as rendered content.
- **Evidence debt**: file paths, command output, and code anchors were preserved only as generic notes.
- **Interaction debt**: hover focus, filters, dim/blur states, copy buttons, and motion were optional instead of reusable defaults.
- **Code-review debt**: source-linked code evidence, line numbers, highlighted snippets, and diff views were not treated as mandatory when reports discuss code changes.

## Source Inspiration

The main pattern comes from "The unreasonable effectiveness of HTML" by Thariq Shihipar: replace skimmable walls of Markdown with self-contained HTML artifacts that can show comparisons, diagrams, timelines, reports, decks, and task-specific editors directly in a browser.

Related third-party skills were evaluated as references:

- `michalvavra/agents/archive/skills/html-tools`: strong single-file utility guidance, but focused on converters and developer tools rather than work reports.
- `Cocoon-AI/architecture-diagram-generator`: useful architecture diagram conventions, but too narrow and visually opinionated for the default reporting layer.
- Anthropic `web-artifacts-builder`: already present in this repo for complex bundled artifacts.

Live docs checked while strengthening this skill:

- Mermaid usage docs prefer `mermaid.run` for DOM rendering and `mermaid.render` for programmatic SVG output.
- MDN documents CSS transitions as the standard way to animate element state changes such as hover, focus, and scripted selection.

Keep volatile library details out of `SKILL.md`. If a report depends on a CDN library, pin the exact version inside the generated HTML and keep a readable fallback.

## Template Catalogue

Use the closest asset and delete sections that do not apply:

| Template | Use when | Core blocks |
|---|---|---|
| `assets/templates/implementation-handoff.html` | Completed implementation work needs changed areas, file evidence, verification gates, risks, and next actions. | conclusion strip, changed-area cards, evidence cards, verification gates, risk cards |
| `assets/templates/conclusion-dashboard.html` | A non-trivial task is complete and the user needs the conclusion, files, verification, and next actions in one place. | conclusion strip, metric cards, timeline, file evidence, highlighted snippet, Mermaid/SVG diagram slot |
| `assets/templates/review-findings.html` | A PR/code/doc review has multiple findings, severity levels, or reviewer focus areas. | severity filters, finding cards, annotated code panel, file tour, action export |
| `assets/templates/research-explainer.html` | Research, architecture, or module understanding needs citations, diagrams, examples, and a glossary. | TL;DR grid, rendered rich-text sections, tabbed examples, diagram panel, source rail |
| `assets/templates/decision-matrix.html` | Multiple options, product choices, or implementation approaches need trade-off comparison. | option cards, recommendation, risk notes, confirmation questions |
| `assets/components/report-ui.css` | A custom page needs common visual primitives. | cards, chips, source links, code blocks, diff panels, Mermaid evidence panels, focus/dim effects, responsive grids |
| `assets/components/report-ui.js` | A custom page needs simple interactions. | filters, tabs, search, copy/export buttons, evidence spotlight, selected-state focus |
| `assets/components/rich-render-runtime.css` | A report needs runtime-rendered Markdown, Mermaid, or highlighted code. | rendered Markdown styling, Mermaid fallback styling, highlight token affordances |
| `assets/components/rich-render-runtime.js` | A report needs runtime-rendered Markdown, Mermaid, or highlighted code. | Marked + DOMPurify bridge, Mermaid `run`, highlight.js `highlightElement`, status badges |

## Static Component Boundary

Report components must preserve the self-contained static HTML contract. Use inlineable HTML, CSS, and vanilla JS only. If a visual idea requires React, Tailwind compilation, Vite, bundling, or a long-lived app runtime, do not add that dependency to this skill; port only the static shape that can be embedded in a single report file, or skip the idea.

## Generator Contract

Use the generator first for normal reports:

```powershell
bun .agents/skills/html-work-reports/scripts/create-report.mjs --input report.json --out-dir reports --slug my-report --json
bun .agents/skills/html-work-reports/scripts/validate-html-report.mjs reports/my-report.html --json
```

Input is JSON and follows `references/report-input-schema.json`. The minimum useful shape is:

```json
{
  "title": "Report title",
  "summary": "Conclusion first.",
  "status": "complete",
  "template": "implementation-handoff",
  "renderMode": "pre-rendered",
  "sections": [
    { "type": "markdown", "title": "What changed", "content": "- Short bullet" },
    { "type": "mermaid", "title": "Flow", "content": "graph LR\n  A --> B" },
    { "type": "code", "title": "Snippet", "language": "typescript", "filePath": "src/file.ts", "startLine": 42, "highlightLines": [42], "content": "export const ok = true;" },
    { "type": "diff", "title": "Behavior diff", "filePath": "src/file.ts", "startLine": 42, "content": "- return oldValue;\n+ return newValue;" }
  ],
  "evidence": [
    { "kind": "file", "label": "Implementation", "value": "src/file.ts", "status": "info" }
  ],
  "verification": [
    { "label": "Focused tests", "status": "pass", "detail": "bun test ./tests/example.test.ts" }
  ]
}
```

Supported section types: `summary-cards`, `markdown`, `mermaid`, `code`, `diff`, `timeline`, `evidence`, `decision-matrix`, `actions`, `tabs`, and `filterable-cards`.

Generator and validator scripts are internal `html-work-reports` assets. Do not expose them as a separate installable capability unless a later OpenSpec change approves that boundary.

## Artifact Selection

| Work type | HTML pattern | Useful controls |
|---|---|---|
| Planning | timeline + risk matrix + dependency sketch | filter by owner, copy checklist |
| Code review | source-linked code evidence + annotated diff + file tour + severity index | jump links, collapse low-risk notes |
| Code understanding | module boxes + arrows + entry point list | highlight hot path |
| Design system | swatches + type scale + component contact sheet | copy token, state tabs |
| Prototype | isolated interaction or animation | sliders, toggles, reset |
| Research | TL;DR + tabs + glossary + citations | search, expand all |
| Status report | summary cards + chart + timeline | filter by status |
| Incident report | minute-by-minute timeline + logs + follow-ups | severity tags, owner filters |
| Custom editor | board/form/table for a specific decision | export Markdown/JSON/diff |

## Rich Content Contract

- **Markdown**: convert headings, lists, tables, callouts, and links into semantic HTML. Do not make the user read raw Markdown unless it is an explicit source excerpt.
- **Mermaid**: use it for non-trivial sequence, architecture, call-path, and data-flow explanations; prefer pre-rendered inline SVG for stable reports. For dynamic diagrams, pin Mermaid and call `mermaid.run` or `mermaid.render`; always include the Mermaid source in a collapsed `<details>` block.
- **Code**: show only the smallest useful snippet. Include source-linked code evidence: a source file link, line number or range, copied snippet, highlighted decisive lines, and a one-line reason beside the snippet.
- **Diff**: include a `diff` section for code-review findings, behavioral changes, or before/after examples where a snippet alone would hide the change.
- **File references**: render as clickable local-path anchors when the host supports them, or as copyable path chips otherwise.
- **Citations**: keep source cards short: title, source, date/accessed, and why it matters.

## Runtime Rendering Support

Use runtime rendering only when the page needs live editing, source toggles, or post-load conversion. Otherwise pre-render Markdown to HTML, Mermaid to inline SVG, and code highlighting to static spans.

Render modes:

- `pre-rendered` is the default. Critical CSS/JS is inlined, Markdown becomes semantic HTML, Mermaid becomes inline SVG, and code gets static highlight spans. Primary reading content must not depend on CDN scripts.
- `runtime` is explicit. It declares pinned versions, keeps source fallback blocks, and preserves summary/evidence content if a runtime enhancement fails.

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
- Mermaid should initialize with `startOnLoad: false` and a strict security level, then render only targeted nodes.
- highlight.js should use explicit language classes such as `language-typescript` and call `highlightElement` after dynamic content is present.
- Every runtime-rendered block still needs a visible source fallback in `<details>`.
- CDN runtime use is a conscious tradeoff: faster templates and live editing, but weaker offline guarantees than pre-rendered output.

## Interaction And Motion Contract

- Use hover/focus to reveal affordances, not to hide essential evidence.
- Apply dim/blur to non-focused cards during filtering or hover comparison, but never make text unreadable.
- Use transitions for opacity, transform, color, and outline; keep durations around 120-220ms.
- Support keyboard state with `:focus-visible`.
- Include `@media (prefers-reduced-motion: reduce)` and remove transform/animation there.
- Keep animation purposeful: draw attention to changed state, selected findings, copied output, or active filters.

## Validation Contract

Run `scripts/validate-html-report.mjs` on generated or custom HTML before handoff. The validator checks:

- report root, non-empty content, and safe content boundaries
- Markdown table/list rendering or explicit runtime fallback
- Mermaid inline SVG or explicit runtime fallback
- code highlight markup and inert file path labels
- evidence, verification status, filter, tab, copy, focus/motion support
- optional browser checks for narrow viewport and basic control state changes

If Playwright/Chrome is unavailable, browser-only coverage must be reported as `degraded`; do not silently claim browser checks passed.

Security rules are generator defaults, not optional polish:

- Escape user-controlled text in cards, evidence, file chips, and actions.
- Sanitize Markdown output and strip unsupported HTML/event-handler content.
- Restrict rendered links to `http`, `https`, `mailto`, or local anchors; neutralize `javascript:` links.
- Treat file paths and code snippets as inert text unless a host-specific safe file link is intentionally created.

## Layout Skeleton

Use this structure unless the task clearly needs something else:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Report title</title>
  <style>
    :root { color-scheme: light; }
    body { margin: 0; font-family: system-ui, sans-serif; line-height: 1.5; }
    main { max-width: 1120px; margin: 0 auto; padding: 24px; }
    nav a { margin-right: 12px; }
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
    <nav aria-label="Report sections"></nav>
    <section id="main-workspace"></section>
    <section id="evidence"></section>
    <section id="next-actions"></section>
  </main>
</body>
</html>
```

## Interaction Rules

- Keep JavaScript small and local to the artifact.
- Make controls obvious: buttons for commands, checkboxes/toggles for binary state, select inputs for modes, text input for search.
- Never hide the source data so thoroughly that the artifact cannot be audited.
- For export buttons, produce plain text in a visible `<textarea>` as a fallback to clipboard APIs.
- Avoid storing secrets. If a tool genuinely needs a token, keep it in user-controlled localStorage and never embed it in source.

## Visual Rules

- Engineering reports should be dense but calm.
- Use color to encode severity, status, ownership, or grouping.
- Avoid decorative backgrounds that make evidence harder to read.
- Use responsive grids and allow tables to scroll horizontally on small screens.
- Prefer inline SVG for diagrams that need precise labels or arrows.
- Replace paragraphs longer than 3 short lines with cards, bullets, or progressive disclosure.
- Let the page do work Markdown cannot: spatial comparison, sticky context, direct code emphasis, filters, copy/export, and rendered diagrams.
