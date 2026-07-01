# Effective Interact Patterns

## Table of Contents

- [Interaction Workflow](#interaction-workflow)
- [Visual Language First](#visual-language-first)
- [Component-First Design Contract](#component-first-design-contract)
- [Output Mode Gate](#output-mode-gate)
- [Plain-Text And Markdown Patterns](#plain-text-and-markdown-patterns)
- [Pattern Selection](#pattern-selection)
- [Component Catalogue](#component-catalogue)
- [Generator Contract](#generator-contract)
- [Long Task Session Ledger](#long-task-session-ledger)
- [Decision Quality Contract](#decision-quality-contract)
- [Artifact Selection](#artifact-selection)
- [Rich Content Contract](#rich-content-contract)
- [Runtime Rendering Support](#runtime-rendering-support)
- [Validation Contract](#validation-contract)
- [Layout Skeleton](#layout-skeleton)
- [Interaction Rules](#interaction-rules)
- [Visual Rules](#visual-rules)

## Interaction Workflow

Use this workflow every time the skill loads:

1. Treat loading as permission to run a communication-worthiness check, not as an obligation to emit HTML, except when the selected workflow expects an HTML handoff for material repo or skill changes.
2. Identify the reader need, decision frame, and visual language that could reduce interaction time and information loss.
3. Choose one primary pattern from [Plain-Text And Markdown Patterns](#plain-text-and-markdown-patterns) or [Pattern Selection](#pattern-selection). If no pattern fits, answer in ordinary chat or Markdown.
4. Unless the chosen mode is intentionally `plain-brief`, commit to at least one visible visual structure: compact table, matrix, timeline, flow, cards, source-linked code/diff, or grouped evidence layout.
5. Use the generator only for `html-artifact` mode. Start from component contracts when HTML is justified.
6. Add rich sections only when the chosen pattern requires them. Do not add charts, Mermaid, code, diff, tabs, filters, claims, or controls just to make the response look richer or silence an advisory warning.
7. Validate HTML artifacts and hand off the artifact link with validation status and any kept advisory warnings.

## Visual Language First

HTML handoff is a visual communication artifact, not Markdown wrapped in a browser. When the skill loads for a material report, organize the thinking around the visual shape before drafting the prose:

- comparisons become matrices or side-by-side option cards;
- process, routing, lifecycle, and failure paths become flows or timelines;
- validation and risk become status tables or dashboards;
- code and source evidence become source-linked tours, diffs, or evidence maps;
- broad repo, module, or skill explainers become capability maps, structure trees, implementation flows, and source-linked tours;
- long continuation state becomes grouped navigation with stable anchors.

This is not a license to decorate. A visual structure is justified only when it reduces reader interaction time, information loss, or rework. If a visual idea does not change how quickly the user can understand, compare, verify, decide, or continue, use `plain-brief`, `structured-markdown`, or `visual-markdown` instead.

Do not draft a linear handoff first and ask at the end whether it deserves visualization. Start by asking which relationship the reader needs to see: priority, sequence, ownership, dependency, contrast, evidence, state, risk, or next action. The output mode follows that information architecture.

## Component-First Design Contract

For HTML artifacts, read `../DESIGN.md`, `report-ia.md`, `visual-language.md`, `component-contracts.md`, and `generator-validation-contract.md` before writing the input JSON. The default path is component composition:

1. Start from the reader's decision, verification, approval, or continuation need.
2. Pick the smallest set of components that makes the hard relationship visible: table, timeline, flow, map, code/diff, evidence rail, status band, option cards, or export block.
3. Delete any section that only fills a legacy template slot.
4. Keep optional claims, evidence, verification, next actions, hero counters, and visible success criteria hidden by default; use `presentation.show*` only when the reader must inspect them to decide or continue.

Legacy template inputs are not supported. Compose the page from explicit components that follow `component-contracts.md` and pass validation.

## Default Session Routing

The skill loads only when clear complex communication would reduce the user's decision or continuation cost. Length is never sufficient by itself; a long but routine explanation should stay ordinary chat.

| Checkpoint | Strong signal | Plain text or Markdown default |
|---|---|---|
| Session start | The user is comparing paths, reviewing evidence, learning a complex system, asking for alignment, or needs first-principles structure to decide. | The task is a short factual answer, long but routine explanation, permission pause, or one-command status. |
| During work | The next useful user input depends on seeing options, blockers, file evidence, validation state, or a process map together. | The user only needs a concise status sentence before work continues. |
| Final handoff | Material repo or skill behavior changed, validation evidence matters, or the final answer would become a long linear file list. | The work is tiny, self-evident, and has no durable evidence beyond one command result. |

For material repo or skill changes, default to a validated component-composed HTML artifact unless the user explicitly waives HTML or the work is tiny and has no durable evidence trail. Plain text or Markdown can still be used for interim status, but final material handoff should keep evidence, validation, risks, and next actions inspectable in the ignored local artifact.

## Output Mode Gate

Use this quick gate before choosing a pattern:

| Gate | Escalate output when | Plain text or Markdown default |
|---|---|---|
| Strong signal | Options, structures, evidence, or controls become faster to compare, inspect, or act on through structure. | A short answer, plain list, or compact table answers the user's question. |
| Comparison | There are 2 or more comparable options, statuses, files, findings, or scenarios with meaningful tradeoffs. | There is one item, or two items with no meaningful side-by-side decision. |
| Structure | The content is a flow, state, timeline, map, call path, architecture, dependency, milestone, module, repo, skill, or ownership model. | The sequence is linear and shorter than a small diagram. |
| Action | The user must choose, tune, sort, filter, copy, export, or return structured input. | The user only needs to read and acknowledge. |
| Evidence | Source anchors, code, diff, citations, evidence, or validation need local navigation. | One or two inline references are enough. |
| Density | Plain text would hide the main point in long linear text. | The main point remains obvious in a short Markdown reply. |

200 Chinese characters is only an auxiliary signal. The primary trigger is the user's decision need: understand, compare, choose, verify, approve, continue, or take over with less ambiguity. Do not generate HTML just because the topic is important. Generate HTML only when the artifact changes how quickly the user can understand, compare, verify, decide, or act.

Output modes:

| Mode | Use when | Boundary |
|---|---|---|
| `plain-brief` | A 200-500 Chinese-character answer needs BLUF, Top 3 support, and next action but no separate artifact. | Do not add tables or diagrams if a direct paragraph is faster. |
| `structured-markdown` | Complex communication needs headings, bullets, compact tables, or evidence labels inside chat. | Do not create HTML when Markdown keeps the decision trail obvious. |
| `visual-markdown` | The answer needs Mermaid, a decision matrix, command blocks, or source anchors but not browser controls. | Keep it readable in the chat transcript. |
| `html-artifact` | Browser navigation, visualization, filtering, copy/export, option approval, structure browsing, local interaction, or material repo/skill handoff evidence lowers decision cost. | Keep the page single-file, static, and disposable. |

Use the lower mode when in doubt.
Once the skill loads, non-`plain-brief` outputs should not collapse back into linear prose. The minimum acceptable shape is one visible structure that lowers decision cost: a compact table, matrix, flow, timeline, source-linked evidence block, cards, or equivalent.
For non-HTML rehearsals, fixtures, or smoke checks, run `scripts/check-mode-structure.mjs` so `structured-markdown` and `visual-markdown` outputs do not silently fall back to paragraph stacks.

Hard HTML conditions:

- More than 5 source anchors, files, findings, or citations need local navigation.
- A repo or codebase explainer spans capabilities, structure, functions, implementation, architecture, and source evidence.
- Material repo or skill behavior changed and the final handoff needs changed areas, evidence, validation, risks, and next actions.
- The user must filter, sort, compare, copy, export, or return structured input.
- Side-by-side options have enough dimensions that one compact Markdown table becomes hard to scan.
- Architecture, workflow, timeline, dependency graph, milestone plan, module map, repo tree, or skill structure is too wide for one compact Mermaid diagram.
- Multi-option approval or visual style approval needs a browsable gallery rather than a production UI.
- A durable browser handoff is explicitly useful for review, acceptance, or continuation.

HTML escalation is forbidden when one compact Markdown table, one Mermaid diagram, or one short file list is enough, except for material repo/skill handoffs where the workflow/advisory layer expects `html-artifact`.

## Plain-Text And Markdown Patterns

Use these before escalating to HTML:

| Pattern | Use when | Required behavior |
|---|---|---|
| `plain-brief` | The user needs a direct update, feasibility answer, or handoff under a few paragraphs. | First sentence answers the question; include Top 3 support and the next action. |
| `structured-handoff` | Work changed and the user needs to review or continue without opening a browser. | Group by conclusion, changed contract, evidence, verification, risk, and next action. |
| `decision-brief` | The user must choose between options. | Lead with recommendation, compare tradeoffs, call out assumptions, and ask only the decision that matters. |
| `architecture-brief` | A system shape, call path, or workflow can fit in Markdown. | Use a Mermaid block or ordered flow only when it is faster than prose. |
| `review-brief` | A review has multiple findings but no need for filtering or source navigation. | Sort by severity, anchor findings to files/lines, and keep summary secondary. |

## Pattern Selection

Use these Case-Derived Patterns as a routing and design checklist before choosing components. They adapt the linked HTML effectiveness examples to this skill's single-file interaction-artifact boundary. For the full source-derived family table, visual direction, and anti-overfit rules, read `references/html-effectiveness-patterns.md`.

| Pattern | Use when | Required behavior | Boundary |
|---|---|---|---|
| `approach-comparison` | The reader must choose between code, product, design, or rollout approaches. | Put options side by side with recommendation, tradeoffs, assumptions, snippets when relevant, and copyable next action. | Do not hide the recommendation in a long comparison table. |
| `visual-style-board` | The reader must approve visual directions, design-system choices, component variants, or illustration options before implementation. | Show artboards or specimens, palette/type tokens, density/tone notes, risks, and recommendation. | Do not implement production UI inside this skill. |
| `implementation-plan` | The user needs sequencing, milestones, dependencies, owners, files, gates, and risks before work starts or continues. | Separate plan, acceptance gates, risk/open-question table, and dependency map. | Do not present planned work as completed validation. |
| `review-findings` | Review output has multiple findings, severities, evidence anchors, or action exports. | Sort by severity, show evidence beside findings, and make actions copyable. | Bug finding itself may belong to a review skill; this shapes the artifact. |
| `pr-writeup` | The author needs a reviewer-facing artifact, not just findings. | Lead with motivation, before/after, file tour, review focus, test plan, and rollout notes. | Do not replace the code review skill; this is the author-side handoff. |
| `module-map` | The user needs to understand a codebase area, architecture, trust boundary, or call path. | Show boxes/arrows, entry points, hot path, source anchors, and gotchas. | Use Mermaid or inline SVG only when the map is faster than prose. |
| `repo-capability-map` | The user asks to understand a whole repository's capabilities, structure, functions, implementation, and source evidence. | Start with a capability/structure map, then provide file-role tables, implementation-flow drilldowns, evidence anchors, and gotchas. | Do not use for one-file explanations or routine summaries where a short Markdown answer is faster. |
| `flow-drilldown` | A process, deploy path, incident path, request path, or state machine has steps and failure branches. | Show the route first, then step details, timings, failures, and owner/action metadata. | Avoid decorative diagrams without drilldown value. |
| `explorable-explainer` | A concept or feature is easier to learn by comparing adjacent terms, toggling parameters, inspecting examples, or seeing a live model. | Keep a readable TL;DR, then add definition cards, adjacent-concept boundaries, avoid/use-instead notes, usage scenarios, examples, glossary, and citations. | The page must still make sense without interaction or CDN runtime success. Do not copy external glossary text into the artifact. |
| `status-dashboard` | Recurring status, release, or milestone work needs quick scanning. | Use metric cards, timeline, risk/follow-up table, and owner/status filters only when useful. | Do not invent unsourced metrics or hide slipped work. |
| `incident-report` | The user needs impact, timeline, root cause, mitigations, and follow-ups in one place. | Keep times concrete, facts/inferences separated, and actions owner-linked. | Do not overstate root cause if evidence is incomplete. |
| `disposable-export-editor` | The user needs to sort, triage, toggle, tune, or fill a small structured decision surface. | Every editor-like artifact must end with an export path: Markdown, JSON, diff, or checklist text in a visible fallback. | Never write files, call network APIs, store secrets, or mutate third-party resources from the page. |

Skip or route elsewhere:

- Production UI, websites, or reusable app surfaces -> `frontend-design`.
- Bundled React/Tailwind/shadcn artifacts -> `web-artifacts-builder`.
- Slide decks -> `frontend-slides`; this skill may discuss deck findings but should not generate the deck.
- Throwaway interaction experiments whose main purpose is selecting an interaction model -> `prototype`.

## Component Catalogue

Use `../DESIGN.md` and `component-contracts.md`, then choose the smallest component set that answers the reader's decision. Component contracts replace legacy template inputs:

| Component | Use when | Core behavior |
|---|---|---|
| `summary-cards` | The first scan needs Top 3 facts, counts, or gate state. | cards require visible `label` and `value`; empty cards fail validation. |
| `data-table` | Items share stable fields such as file, signal, status, owner, risk, or action. | table requires columns, rows, hoverable cells, and non-empty body content. |
| `timeline` | Order, phase, incident, rollout, or validation history matters. | each step requires visible label and detail. |
| `code` / `diff` | Exact source or before/after behavior is decisive. | source label, line wrappers, highlight tokens or explicit degraded state. |
| `mermaid` | A flow, state, dependency, or architecture path is faster than prose. | browser validation requires ready SVG or explicit degraded state. |
| `decision-matrix` | The reader must choose among options. | option names and tradeoff points must be visible. |
| `filterable-cards` / `tabs` | The reader needs inspection or alternate views. | first view must make sense without interaction. |
| `actions` | The reader needs a copyable next step or export. | actions must be concrete and visible. |
| `chart` | Real data comparison matters. | requires takeaway, source, alt text, and table fallback. |

Shared components live in `assets/components/interaction-ui.css`, `assets/components/interaction-ui.js`, `assets/components/rich-render-runtime.css`, and `assets/components/rich-render-runtime.js`.

For Harness Hub vocabulary explainers, use `docs/harness-vocabulary.md` as the local term source. Keep definitions local-original, show adjacent-concept contrasts, and cite glossary-like upstream repositories only as structure inspiration.

## Static Component Boundary

Interaction components must preserve the single-file static HTML contract. Use inlineable HTML, CSS, and vanilla JS only for artifact components. Runtime-cdn artifacts may reference pinned browser libraries for Mermaid, Markdown parsing, sanitization, and code highlighting. If a visual idea requires React, Tailwind compilation, Vite, bundling, or a long-lived app runtime, do not add that dependency to this skill; port only the static shape that can be embedded in one static HTML file, or skip it.

## Generator Contract

Use the generator first for normal interaction artifacts, but compose from `../DESIGN.md` and the component contracts before writing JSON:

```powershell
bun skills/effective-interact/scripts/create-interaction.mjs --input interaction.json --slug my-artifact --json
bun skills/effective-interact/scripts/validate-interaction.mjs skills/effective-interact/artifacts/my-artifact.html --json
```

Omit `--out-dir` for ignored skill-local intermediate artifacts and HTML reports. If an explicit `--out-dir` is necessary, choose a directory already covered by `.gitignore`; do not put generated reports in tracked source paths.

Input is JSON and follows `references/interaction-input-schema.json`. The minimum useful shape is content-first, component-first, and has no required evidence, code, diagram, verification, or action block:

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

Supported section types: `summary-cards`, `data-table`, `markdown`, `mermaid`, `code`, `diff`, `timeline`, `evidence`, `decision-matrix`, `actions`, `tabs`, `filterable-cards`, and `chart`. Optional section fields `group`, `priority`, `summary`, `status`, `richId`, and `trustLevel` drive grouped navigation, runtime state, and sanitization. Optional root fields `intent`, `claims`, `evidence`, `verification`, and `nextActions` can stay as audit data; `claims`, `evidence`, `verification`, `nextActions`, hero counters, and visible success criteria are rendered only with explicit `presentation.show*` opt-in. `template` is not supported.

### Handoff Durability

Generated HTML under `skills/effective-interact/artifacts/` is a disposable inspection output. It can disappear when a fresh Codex worktree is created, ignored files are cleaned, or local state is reset. For any report the user is expected to reopen later, keep the JSON input in a durable source location such as `skills/effective-interact/assets/fixtures/` when the content is safe to track, or another approved tracked path owned by the task. If the content is private or unsuitable for tracking, record the regeneration command in `.harness-hub/state/session-handoff.md` and the final response.

Before final handoff:

- Check that the generated HTML still exists at the path you plan to share.
- Regenerate from the durable JSON source if the file is missing.
- Include the regeneration command beside the artifact path when continuity matters.
- Do not cite an ignored HTML file as the only durable deliverable.

For Codex in-app browser review, prefer a localhost URL over a raw `file://` path. Use:

```powershell
node skills/effective-interact/scripts/serve-artifact.mjs skills/effective-interact/artifacts/report.html --host 127.0.0.1 --port 4173 --json
```

The helper serves only the selected artifact, not the whole workspace. Open or hand off the returned `http://127.0.0.1:<port>/...` URL after validating the artifact with `validate-interaction.mjs --require-browser`.

## Long Task Session Ledger

Use a local fact ledger when complex communication depends on state that could drift during a long task. The ledger is not required for short replies, one-command status, or routine explanations. It is useful when a later status update, handoff, or HTML artifact will need stable facts instead of reconstructed memory.

Default location:

```text
skills/effective-interact/artifacts/session-ledgers/<task-slug>.jsonl
```

Each line should follow `references/session-ledger-schema.json`. Keep entries compact and factual:

```json
{"ts":"2026-05-21T20:45:00+08:00","kind":"tool-result","status":"pass","summary":"Focused tests passed for effective-interact routing and generator fixtures.","source":{"tool":"shell_command","command":"bun test ./tests/effectiveInteractSkill.test.ts"},"evidence":["102 tests passed"],"next":["Generate the durable report fixture."]}
```

Create or update the ledger when:

- the task is likely to span many tool calls, more than one major checkpoint, or enough time that chat memory becomes unreliable.
- the user needs long task status, milestone progress, architecture/module/dependency reporting, review evidence, or later HTML generation.
- important tool results, source anchors, dates, decisions, assumptions, blockers, or verification states would otherwise be scattered across the transcript.

Record only what helps a later artifact or handoff:

| Entry kind | Record |
|---|---|
| `checkpoint` | milestone reached, changed scope, current state |
| `tool-result` | command/tool name, pass/fail/degraded status, short result, important path or line anchor |
| `decision` | chosen path, rejected path, rationale |
| `assumption` | unresolved premise that affects the report |
| `risk` / `blocker` | impact, evidence, next action |
| `verification` | gate, command, result, residual risk |
| `handoff-source` | facts that must feed the final Markdown or HTML report |

Safety boundary:

- Do not record secrets, credentials, token-shaped strings, private keys, full environment dumps, raw large logs, or full copyrighted text.
- Summarize tool output; keep source commands, file paths, line anchors, and counts instead of raw output.
- Do not write ledgers outside the ignored skill-local `artifacts/` tree unless the user explicitly asks.
- If the skill directory is unavailable or unwritable, keep a concise chat-visible status trail and mention that the ledger was skipped.

Before generating HTML from a long task, scan the ledger and map entries into `claims`, `evidence`, `verification`, `timeline`, and `data-table` sections. Treat root claims/evidence/verification as hidden audit data unless the reader must inspect them. Treat the ledger as a source of preserved facts, not as proof by itself; claims still need source anchors, commands, or explicit assumptions.

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
      "value": "skills/effective-interact/assets/fixtures/chart-accessibility-stress-report.json",
      "status": "info",
      "filePath": "skills/effective-interact/assets/fixtures/chart-accessibility-stress-report.json",
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

Effective communication exists to lower the reader's decision cost. Use the Pyramid principle for structure, BLUF for the first sentence, and SCQA only as the hidden reasoning path when background is needed.

- First sentence: answer the primary question in one direct sentence, ideally under 90 characters.
- Support: keep the top layer to Top 3 mutually distinct points; push detail into evidence, code, diagrams, appendix-style sections, or HTML only when that lowers effort.
- Boundary: label important statements as fact / inference / assumption through claim kind, confidence, and evidence links.
- Density: prefer data, contrast, status counts, or source anchors over adjectives.
- Ending: include a CTA or next action when the reader must approve, review, unblock, or continue work.

The validator exposes `decision-brief-scan` as a non-blocking quality check. Treat its warnings as prompts to rewrite the artifact before handoff.

## Information Architecture Contract

Use communication theory as a design constraint, not as decoration:

| Principle | Artifact move | Failure symptom |
|---|---|---|
| First-principles communication | Rebuild from goal, audience, constraints, facts, inferences, assumptions, tradeoffs, and next action. | The response starts from available content instead of the user's decision need. |
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
| Repository capability explainer | capability map + structure tree + implementation flow + source anchors | group by surface, jump to source evidence |
| Design reference | swatches + type scale + component contact sheet | copy token, state tabs |
| Decision prototype | isolated interaction or animation inside the artifact | sliders, toggles, reset, visible export |
| Research | TL;DR + definition/boundary cards + tabs + glossary + citations | search, expand all |
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

- Use Mermaid for trigger routing, workflow, call path, dependency, state-machine, architecture, milestone, module, repo, skill-structure, or data-flow explanations.
- Use `code` when a file-and-line anchor is central to the claim, especially for skill descriptions, config, schema, or decisive implementation snippets.
- Use `diff` when the artifact is about before/after behavior, a review finding, or a patch boundary.
- Use Markdown for short prose, bullets, command lists, compact tables, and callouts that need semantic structure but not a bespoke component.

The validator emits non-blocking rich-content opportunity warnings when it sees flow/routing language without Mermaid or central file-line evidence without a code/diff section. Treat those warnings as a prompt to revise the fixture unless the richer section would be noise.

## Runtime Rendering Support

Use `pre-rendered` as the default handoff artifact path. It keeps Markdown and code rendering deterministic and avoids browser/CDN dependency for primary content. Use `runtime-cdn` only when browser-required validation is available and dynamic rich rendering is worth the tradeoff. Use `fallback-only` only for constrained environments where readable source is acceptable.

Render modes:

- `pre-rendered` is the default. Critical CSS/JS is inlined, Markdown becomes semantic HTML, Mermaid should become real inline SVG, and code gets static highlight spans. If Mermaid cannot render, do not treat the fallback as a successful diagram.
- `runtime-cdn` is explicit. It declares pinned runtime dependencies in a hidden machine-readable manifest, keeps hidden source fallback data, and exposes ready/degraded/failed state through attributes rather than visible effect tags. Set `showRuntimeDependencies: true` only when dependency loading is part of the artifact. Browser-required validation must pass before handoff.
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
- advisory visual-structure gate for HTML reports that still read like linear prose even though the skill was loaded

If Playwright/Chrome is unavailable, browser-only coverage must be reported as `degraded`; with `--require-browser`, validation must fail instead of silently claiming browser checks passed.

For non-HTML mode rehearsals or executable fixtures, run `scripts/check-mode-structure.mjs`. It is advisory-only and checks whether `structured-markdown` and `visual-markdown` still expose visible structure instead of linear prose.

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
