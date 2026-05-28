# HTML Effectiveness Pattern Library

Use this reference when a request resembles the linked HTML effectiveness examples. Do not copy page-specific labels, layouts, or copy. Generalize the communication job, then choose the lightest artifact that reduces decision cost.

## Anti-Overfit Rules

- Treat each source page as one example of a broader pattern, not as a template to reproduce exactly.
- Trigger on reader need: compare, approve, understand, review, plan, monitor, explain, triage, tune, or export.
- Keep production UI, full app building, slide decks, and long-lived prototypes in their own skills.
- Use HTML only when navigation, side-by-side comparison, visual inspection, drilldown, filtering, local controls, or export makes the next decision faster.
- Keep artifacts source-backed: claims should trace to files, commands, explicit assumptions, or linked sources.

## Source-Derived Case Families

| Case family | General trigger | Preferred artifact shape | Useful components | Boundary |
| --- | --- | --- | --- | --- |
| Code approach exploration | Compare implementation approaches with snippets, tradeoffs, and recommendation. | `approach-comparison` | option cards, code snippets, tradeoff table, copyable next step | Use Markdown if fewer than 3 short options and no code evidence. |
| Visual direction exploration | Approve or reject visual directions before production UI work. | `visual-style-board` | artboards, tone/density notes, palette/type tokens, risk comparison | Do not implement the product UI here. |
| Implementation plan | Align on milestones, risks, files, sequencing, and acceptance gates. | `implementation-plan` | milestone timeline, dependency diagram, risk/open-question table | Do not pretend a plan is completed work. |
| PR review | Review multiple findings with severity, evidence, and action export. | `review-findings` | severity filters, annotated code, diff, action checklist | Deep bug finding still belongs to review skills; this shapes the handoff. |
| PR writeup | Produce an author-side reviewer artifact. | `pr-writeup` | motivation, before/after, file tour, test plan, rollout notes | Do not hide known risks in marketing prose. |
| Code understanding | Explain a module, call path, auth flow, or dependency boundary. | `module-map` | architecture diagram, file anchors, snippets, glossary | Use one Mermaid diagram in chat when the map is small. |
| Design system reference | Explain tokens, type, spacing, components, and usage constraints. | `design-system-reference` | swatches, type samples, spacing scale, do/don't notes | Building reusable UI assets routes to frontend work. |
| Component variant matrix | Compare state/variant permutations for a component. | `component-variant-matrix` | variant grid, controls, props/status table | Keep it as review/approval, not production component implementation. |
| Prototype animation approval | Inspect timing, easing, states, and accessibility of a micro-interaction. | `prototype-approval` | replay/reset controls, timeline, reduced-motion note | Use `prototype` when the task is to build an experiment to answer one design question. |
| Prototype interaction approval | Try a tiny interaction model and export the decision. | `prototype-approval` | drag/toggle controls, state list, export checklist | Never persist hidden state or mutate repo data. |
| SVG illustration options | Compare explanatory illustrations or header visuals. | `illustration-gallery` | SVG panels, palette chips, usage notes | Do not create a production brand system here. |
| Annotated flowchart | Explain a process with branches, gates, owners, or failure paths. | `flow-drilldown` | flow diagram, step cards, failure notes, owner/action table | One simple linear flow can stay as visual Markdown. |
| Feature research explainer | Explain a feature or internal mechanism with citations and examples. | `explorable-explainer` | TL;DR cards, tabs, source rail, code/config examples | Do not overclaim beyond evidence. |
| Concept research explainer | Teach a concept with a small interactive model. | `explorable-explainer` | sliders/toggles, glossary, example states, fallback explanation | The page must make sense without controls. |
| Engineering status report | Show current state, progress, risks, owners, and next actions. | `status-dashboard` | metric cards, risk table, timeline, owner/status filters | Do not invent metrics or greenwash blockers. |
| Incident report | Explain timeline, impact, root cause, mitigations, and follow-ups. | `incident-report` | timeline, impact cards, action item table, diff/config evidence | Keep dates/times concrete and distinguish facts from assumptions. |
| Triage board editor | Sort or filter a small work queue and export decisions. | `triage-board-editor` | board, filters, priority chips, Markdown export | No network writes or hidden persistence. |
| Feature flag editor | Review flag states and produce a JSON/diff export. | `feature-flag-editor` | toggles, warning states, JSON preview, diff export | Do not write to production config. |
| Prompt tuner editor | Tune prompt sections and copy the resulting prompt/config. | `prompt-tuner-editor` | segmented controls, preview, metrics checklist, text export | Do not call models or store prompts externally. |

## Visual Direction

Default visual language should feel like a dense engineering workbench, not a marketing page:

- Warm neutral base: off-white page, white panels, muted taupe lines, dark warm ink.
- Clay accent for focus, active controls, highlighted paths, and call-to-action affordances.
- Olive success, umber warning, brick danger, and deep teal information states.
- Typography: system sans for UI and report text; editor-like monospace only for code, paths, config, and exports.
- Cards stay compact with 8px radius or less, clear borders, restrained shadows, and hover focus only when it improves scanning.
- Use color to encode status, severity, grouping, ownership, or selected state. Do not use decorative gradients or color-only meaning.

## Taste-Derived Aesthetic Preflight

Selective source: `Leonxlnx/taste-skill` at `3c7017d636c3a4aad378433ea6d0cfa6c921da4a` (MIT). Use only the report-safe checks below for `effective-interact`; anti-template frontend visual direction now routes separately to `design-taste-frontend`.

- Anti-default check: no generic AI-purple, blue glow, mesh-gradient hero, or default card grid unless the artifact subject or brand evidence requires it.
- Layout diversity check: long reports should vary section shapes. Avoid six repeated card stacks when a table, timeline, diagram, code block, evidence rail, or action list would scan faster.
- Hero discipline: the hero should answer the reader's first question in compact form. Do not turn report pages into landing-page billboard layouts.
- Section discipline: avoid decorative split headers, redundant eyebrows, scroll cues, fake version labels, and decorative dots. Use labels only when they encode state, group, severity, or ownership.
- Spacing and typography check: compact sections, stable grid tracks, readable line height, no viewport-scaled type, no clipped code rows, and no button or chip text overflow.
- Motion check: motion must explain focus, state, filtering, navigation, or copy feedback. Provide `prefers-reduced-motion`; avoid spectacle-only animation.
- Pre-flight before handoff: palette, card purpose, section repetition, hero density, contrast, reduced motion, mobile collapse, overflow, and visible copy/export path.

## Template Mapping

| Template | Best source families | Notes |
| --- | --- | --- |
| `decision-matrix` | code approach exploration, multi-option approval | Compare-first; recommendation visible before details. |
| `visual-exploration` | visual directions, design systems, component variants, SVG illustration options | Shows visual inspection surfaces without becoming production UI. |
| `implementation-plan` | implementation plan, milestone/dependency planning | Separates plan, gates, risks, and owner/action details. |
| `review-findings` | PR review, review evidence tours | Keeps findings filterable and code evidence adjacent. |
| `implementation-handoff` | PR writeup, completed implementation handoff | Author-side story, file tour, test plan, rollout notes. |
| `research-explainer` | code understanding, feature/concept research, flow drilldown | Explains mechanisms with citations, diagrams, examples, and glossary. |
| `conclusion-dashboard` | status report, incident report, release acceptance | Fast scan of current state, timeline, risks, and follow-ups. |
| `editor-workbench` | triage board, feature flags, prompt tuner | Local-only interaction plus visible Markdown, JSON, diff, or prompt export. |

## HTML Escalation Checklist

Escalate to HTML when at least one is true:

- Side-by-side visual inspection or more than three meaningful options is central to the decision.
- The reader needs filters, tabs, controls, copy/export, or a sticky overview to stay oriented.
- The artifact combines at least two dense layers, such as diagram plus code, timeline plus owners, or options plus acceptance gates.
- A local editor is useful, and it can export text without writing files, calling network APIs, using credentials, or hiding persistence.
- A durable browser handoff lets the user or reviewer inspect evidence faster than a chat response.

Stay in chat or Markdown when a compact table, one Mermaid diagram, or a short file list preserves the full decision trail.
