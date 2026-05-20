---
name: effective-interact
description: Load broadly for non-trivial sessions when a Chinese-first self-contained HTML artifact can clarify planning, implementation/review progress, research, architecture, learning, validation, status, or handoff better than chat; default-consider every session, especially final reports after material repo changes; skip permission-only pauses, trivial chat, production UI, slides, bundled apps.
---

# Effective Interact

Create Chinese `.html` when it makes alignment, choice, review, explanation, or handoff shorter, clearer, visual, or easier to act on.

## Default Load And HTML Usefulness Gate

Default posture: consider this skill in every non-trivial session. Loading does not force an artifact, but it does force an HTML-worthiness check at planning, after material work, and before final handoff.

Use HTML when at least one strong signal is present and HTML makes a user communication point more effective than Markdown:

- material repo or skill implementation, review, migration, OpenSpec, research, or validation work needs a browsable report with changed areas, evidence, validation, risks, and next actions.
- 2 or more comparable options, findings, files, statuses, or scenarios with meaningful tradeoffs; compare them side by side.
- flow, state, timeline, map, call path, or architecture; show spatial structure.
- user must choose, tune, sort, filter, copy, or export; collect a user decision through a local export.
- source anchors, code, diff, citations, evidence, or validation must stay inspectable.
- Markdown would hide the main point in long linear text.

If no strong signal and no handoff obligation is present, answer in chat or Markdown. Use this skill before, during, or after implementation when an HTML artifact can replace or supplement a Markdown reply: planning options, architecture maps, review tours, research explainers, status dashboards, triage boards, prompt/config tuners, material-change reports, or final handoffs. It is for interaction points, not only final handoffs. The user does not need to say "HTML".

## Trigger Examples

Use this skill for requests like:

- "Turn this implementation state into a visual HTML interaction artifact with file evidence."
- "I changed a skill or repo behavior; produce a final HTML report with the reasoning, file evidence, validation, and remaining risks."
- "Show the options as an interactive page so I can choose before you implement."
- "Finish an OpenSpec apply change and generate an HTML acceptance artifact with tasks, changed files, fixture outputs, and validation gates."
- "Create an interactive PR review artifact with severity filters and highlighted snippets."
- "Explain this module call path as a self-contained page with a rendered diagram."
- "Compare these approaches in a side-by-side option gallery before I choose."
- "Convert the research result into a skimmable HTML explainer with citations."
- "Make a temporary editor that exports Markdown, JSON, or diff for me to paste back."

Do not use this skill for:

- approval gates such as "ask before pushing" or "confirm before installing"
- doing code implementation, bug fixes, or test runs; use this skill for the HTML artifact around planning, implementation progress, review, status, material-change reporting, or handoff
- short answers, simple explanations, or ordinary chat summaries
- product UI or website work; use `frontend-design`
- complex bundled React/Tailwind artifacts; use `web-artifacts-builder`
- slide decks; use `frontend-slides`

## Output Contract

Write one static UTF-8 Chinese `.html`. Default to ignored `.codex/skills/effective-interact/artifacts/`; use `--out-dir reports` only for durable repository examples. Link the file and verification.

Start with BLUF: one-sentence conclusion plus reader intent. Add claims, evidence, charts, controls, or editor affordances only when they reduce effort.

Use inlineable HTML/CSS and vanilla JS only. Runtime-cdn may reference pinned Mermaid, Markdown, sanitizer, and code-highlighting libraries, but never React, Tailwind, Vite, build steps, or bundled app runtime.

For code evidence, include source file link, line number, decisive snippet, highlighted lines, and `diff` only when before/after matters. Artifacts do not need code by default.

For complex sequence, architecture, call-path, routing, or data-flow changes, render Mermaid only when it is faster than text. Mermaid must render to SVG before handoff; hidden source fallback is audit only.

For lightweight editors, keep them local and disposable: no network writes, no repo writes, no credentials, no hidden persistence. Always include a visible export path such as Markdown, JSON, or diff.

## Generator First Workflow

Prefer the internal generator:

1. Write a UTF-8 JSON input following `references/interaction-input-schema.json`; add optional `intent`, `claims`, `evidence`, and bounded `chart` only when useful.
2. Run `scripts/create-interaction.mjs --input <input.json> --slug <name> --json`; omit `--out-dir` for ignored skill-local intermediate artifacts.
3. Run `scripts/validate-interaction.mjs <outputPath> --json --require-browser` for runtime-cdn artifacts; failed/degraded Mermaid is blocking.
4. Hand off the artifact link and the verification result.

Use hand-written HTML only when the generator cannot express the needed local editor or visualization.

## Template Assets

Start from the closest template: `implementation-handoff`, `conclusion-dashboard`, `review-findings`, `research-explainer`, or `decision-matrix`. Use `assets/components/interaction-ui.*` for shared UI behavior.

## Visual And Rich Content Rules

- Use SCQA/PREP only to shape content, but the first visible sentence still gives the answer.
- Organize with information architecture, not filler: BLUF/Pyramid for answer-first hierarchy, SCQA for context tension, PREP for claims, MECE for section boundaries, LATCH for ordering, DIKW for evidence-to-decision, OODA for feedback loops, and information scent/progressive disclosure for navigation.
- Keep support to Top 3, mark 事实 / 推断 / 假设, and end with CTA or next action when needed.
- Raise information entropy: each visible block must add a new decision-relevant bit, not restate the same conclusion in another card.
- Treat validator warnings as advisory: fix them only when the change lowers decision cost; otherwise keep them and explain why.
- Keep important claims traceable to evidence. Unsupported conclusions become assumptions, open questions, or low-confidence inferences.
- Use `chart` only for bounded static bar, line, sparkline, bullet, slope, or matrix visuals with takeaway, source, alt text, and table fallback.
- Prefer `data-table` sections for structured, segmented, point-by-point, status, comparison, or checklist-like data.
- Render Markdown, Mermaid, and code through pinned runtime-cdn libraries by default; preserve machine-readable state, but do not show effect tags such as `Markdown rendered`, `code highlighted`, or `Source fallback`.
- 当内容天然是流程、路由、调用链、命令、配置、代码或补丁证据时，优先用 Mermaid、Markdown、code 或 diff；不要压扁成泛化卡片/表格。
- Use rounded monospace and rich token colors for code.
- Escape/sanitize mixed-trust and untrusted content; code and paths stay inert.
- Use grouped navigation that follows the artifact's argument; join nav/tabs/filters and include a return-to-overview path.

## Failure Lessons

- 必须使用 UTF-8 中文输入和输出；连续问号乱码通常来自 shell/codepage，把输入写成 UTF-8 JSON 文件。
- 不要外显 Source fallback、Code source 或 rich render status；它们只做隐藏 fallback 和校验状态。
- Mermaid、浏览器、validator 诊断必须脱敏：本地绝对路径、`file:///`、token、原始 HTML/script 都不能进入产物。
- Mermaid 降级不是成功；修到 `ready` SVG 或移除。
- 代码行保持紧凑，不要在逐行 `<span>` 之间插入换行文本节点。
- 不要硬加图表、代码、证据、Mermaid 或效果标签；组件必须服务内容。

## Verification

Before handoff, run `scripts/validate-interaction.mjs`. For runtime-cdn artifacts, prefer `--require-browser` so rendering, overflow, Mermaid, code tokens, focus, and controls are checked. If browser checks degrade or fail for a validator/UI reason, report that honestly.

For patterns, schema, template selection, rich-content handling, case-derived artifact shapes, and validation, read `references/interaction-patterns.md`.
