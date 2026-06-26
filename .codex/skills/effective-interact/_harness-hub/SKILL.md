---
name: effective-interact
description: Load when agent pauses to report relatively complex information needing Chinese-first clear complex communication, alignment, multi-option choice, status/incident, long-task fact ledgers, implementation plans, reviews, maps, explainers, evidence, risks, validation, or handoff; choose plain text/Markdown/visual Markdown/HTML by decision cost; do not load merely because answer is long; skip trivial chat/bundled apps.
---

# Effective Interact

When loaded, think in visual language first: map/table/timeline/flow/evidence shapes reduce interaction time and information loss. HTML is an escalation path, not the default goal; material repo or skill behavior changes are the default HTML handoff exception.

## Default Load And Communication Gate

Default: load this skill whenever the agent is about to pause and report relatively complex information if structure lowers cost; it does not have to wait for an owner workflow to select it, and does not replace the owner workflow or decide substantive scope. Do not load merely because the answer may exceed roughly 200 Chinese characters; 200 Chinese characters and 3 or more independent points are auxiliary signals. The primary trigger is the user decision need; run communication-worthiness check plus visual-language check.

Use only when linear reply raises decision cost:

- material repo/skill implementation, review, migration, OpenSpec, research, or validation facts need evidence, risks, next actions.
- 2 or more comparable options or scenarios have tradeoffs.
- flow, state, timeline, map, call path, or architecture needs spatial structure.
- repo/module/skill explainers need capability, structure, implementation/source map.
- user must choose, tune, sort, filter, copy, export, or inspect source anchors, code, diff, citations, evidence, or validation.
- visual structure lowers cost: approvals, style boards, PR writeups, incidents, milestones, module maps, structure trees, or triage/prompt editors.
- long task state, checkpoints, data, or tool-result summaries must stay stable for later status or handoff.
- plain text would hide the main point while a decision or continuation need remains.

If no strong signal and no handoff obligation is present, answer in chat or Markdown. Length is never sufficient by itself; long routine answers, translations, simple explanations, summaries, and one-command status stay outside.

Use this skill before, during, or after implementation for planning options, PR writeups, status or incident dashboards, prompt/config tuners, material-change reports, and handoffs; it is for interaction points, not only final handoffs. The user does not need to say "HTML". When repo or skill behavior materially changes, create a validated `html-artifact` handoff by default unless waived or tiny.

## Output Mode Ladder

Use the lightest mode that lowers decision cost:

1. `plain-brief`: chat for one decision, Top 3 support, and next action.
2. `structured-markdown`: headings, bullets, compact tables, labels.
3. `visual-markdown`: Mermaid, tables, commands, file anchors, or decision matrices.
4. `html-artifact`: one static HTML file for browser navigation, visualization, filtering, copy/export, or local interaction.

Visual thinking happens before mode selection.
Unless you intentionally choose `plain-brief`, include at least one visible visual structure in the final output.

HTML when browser navigation, visualization, or local interaction lowers decision cost; never because the topic is important, long, or validator-backed.

## Mode Selection Hard Rules

Do not load for a long but routine answer.

- Use `plain-brief` for one conclusion, Top 3 support, and one next action.
- Use `structured-markdown` for grouped evidence, risks, status, options, or compact tables.
- Use `visual-markdown` when one Mermaid diagram, decision matrix, command block, or short source-anchor list is enough.
- Use `html-artifact` only when a hard HTML condition is true: material repo/skill behavior changed and handoff evidence matters; more than 5 source anchors; user must filter, sort, compare, copy, or export; architecture, dependency, milestone, module, repo capability/function/implementation map, or skill structure is too wide for one Mermaid diagram; visual style, component variant, design-system, illustration, prototype, or multi-option approval needs a browsable gallery; or status/incident/editor surface needs drilldown or visible export.
- Any mode other than `plain-brief` must show at least one visible visual structure before handoff.

HTML escalation is forbidden when one compact Markdown table, one Mermaid diagram, or one short file list is enough, except for material repo/skill handoffs where the workflow/advisory layer expects `html-artifact`.

## Trigger Examples

Use for: 复杂状态汇报; long-task fact ledger; changed skill/repo behavior with HTML handoff and validation gates; repo capability/structure/function/implementation explainers; "Show the options so I can choose before you implement"; implementation plan with milestones; OpenSpec apply; PR review; HTML architecture walkthrough; side-by-side option gallery; design-system reference; component variant matrix; incident timeline; temporary triage, feature-flag, or prompt editor that exports Markdown, JSON, or diff.

Do not use this skill for:

- approval gates such as "ask before pushing" or "confirm before installing"
- doing code implementation, bug fixes, or test runs; use this for planning, progress, review, status, material-change reporting, or handoff
- short answers, simple explanations, ordinary chat summaries, one-command status, or a long but routine explanation
- product UI or website work; use `frontend-design`; complex bundled artifacts; use `web-artifacts-builder`; slide decks; use `frontend-slides`

## First-Principles Communication Contract

Before choosing output shape, identify Reader need, Decision frame, first principles, and Evidence boundary. Rebuild from goal, audience, constraints, facts, inferences, assumptions, tradeoffs, and next action; trace claims to source.

All modes start with BLUF; SCQA/PREP may shape reasoning, but the first visible sentence answers directly.

## Output Contract

Start with the direct answer. Keep Top 3 distinct support. Mark important claims as 事实 / 推断 / 假设. Explain tradeoffs, recommendation, rejected path, and CTA/next action. Treat validator warnings as advisory.
If the skill is loaded and the answer is not `plain-brief`, show visual structure instead of linear paragraphs.

Handoff obligation exists only when changed behavior, evidence, risk, or continuation matters.

## HTML Artifact Contract

Use only for `html-artifact` mode. Write one static UTF-8 Chinese `.html`, defaulting to `skills/effective-interact/artifacts/`; inlineable HTML/CSS and vanilla JS only; no build step.

HTML handoff must be visualized with a table, map, timeline, flow, evidence layout, or comparison surface. Avoid Markdown-in-HTML handoffs and decorative visuals.

For code evidence, include source file link, line number, smallest useful snippet, and `diff` when before/after matters. Mermaid must render to SVG before handoff.

Editors: no network/repo writes, credentials, or hidden persistence; include Markdown, JSON, diff, or prompt export.

Use grouped navigation with a return-to-overview path. 流程、路由、调用链、命令、配置、代码或补丁证据优先用 Mermaid；不要外显 Source fallback.

## Long Task Fact Ledger

For long drifting work, keep JSONL at `skills/effective-interact/artifacts/session-ledgers/<task-slug>.jsonl`; record tool-result summaries, verification, blockers, and next actions. Never record secrets or raw large logs.

## Generator First Workflow

For `html-artifact` mode:

1. Write UTF-8 JSON for `references/interaction-input-schema.json`.
2. Run `scripts/create-interaction.mjs --input <input.json> --slug <name> --json`; omit `--out-dir` so HTML lands in ignored skill-local artifacts. If overriding, choose only a gitignored directory.
3. Check `outputPath` exists before browser handoff; regenerate if missing.
4. Run `scripts/validate-interaction.mjs <outputPath> --json --require-browser`; failed/degraded Mermaid is blocking.
5. Prefer `scripts/serve-artifact.mjs <outputPath> --host 127.0.0.1 --port <port> --json`; hand off localhost URL, source/regeneration command, validation, and warnings.
6. Hand-write HTML only when the generator cannot express the visualization.

## Failure Lessons

- 必须使用 UTF-8 中文输入和输出；连续问号乱码通常来自 shell/codepage.
- Mermaid/browser/validator 诊断要脱敏：本地绝对路径、`file:///`、token、原始 HTML/script 不进产物.

## Verification

Before HTML handoff, run `scripts/validate-interaction.mjs`; report degradation. Read `references/interaction-patterns.md`, `references/html-effectiveness-patterns.md`, `references/html-aesthetic-preflight.md`, ledger schema, and eval cases before changing trigger/HTML rules.
