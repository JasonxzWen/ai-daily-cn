---
name: effective-interact
description: Load when agent pauses to report relatively complex information needing Chinese-first clear complex communication, alignment, multi-option choice, status/incident, long-task fact ledgers, implementation plans, reviews, maps, explainers, evidence, risks, validation, or handoff; choose plain text/Markdown/visual Markdown/HTML by decision cost; do not load merely because answer is long; skip trivial chat/bundled apps.
---

# Effective Interact

Help complex communication: understand, compare, decide, continue. HTML is an escalation path, not the default goal.

## Default Load And Communication Gate

Default: load this skill whenever the agent is about to pause and report relatively complex information if structure lowers cost. It does not have to wait for an owner workflow to select it. It does not replace the owner workflow or decide substantive scope. Do not load merely because the answer may exceed roughly 200 Chinese characters. 200 Chinese characters and 3 or more independent points are auxiliary signals. The primary trigger is the user decision need: understand, compare, choose, verify, approve, continue, or take over. Loading runs a communication-worthiness check.

Use the skill only when linear reply raises decision cost:

- the agent is stopping to report material repo/skill implementation, review, migration, OpenSpec, research, or validation facts that need evidence, risks, and next actions.
- 2 or more comparable options, findings, files, statuses, or scenarios have tradeoffs.
- flow, state, timeline, map, call path, or architecture needs spatial structure.
- user must choose, tune, sort, filter, copy, export, or inspect source anchors, code, diff, citations, evidence, or validation.
- visual structure lowers cost: multi-option approval, visual style boards, plans, PR writeups, code tours, design-system references, component variants, incidents, milestones, module/dependency maps, structure trees, or triage/flag/prompt editors.
- long task state, checkpoints, data, or important tool-result summaries must stay stable for later status, handoff, or HTML reporting.
- plain text would hide the main point while a decision or continuation need remains.

If no strong signal and no handoff obligation is present, answer in chat or Markdown. Length is never sufficient by itself; long but routine answers, translations, simple explanations, ordinary summaries, and one-command status stay outside this skill.

Use this skill before, during, or after implementation for planning options, PR writeups, status or incident dashboards, prompt/config tuners, material-change reports, and final handoffs. It is for interaction points, not only final handoffs. The user does not need to say "HTML".

## Output Mode Ladder

Use the lightest mode that lowers decision cost:

1. `plain-brief`: chat text for one decision, Top 3 support points, and next action.
2. `structured-markdown`: headings, bullets, compact tables, and labels.
3. `visual-markdown`: Mermaid, tables, command blocks, file anchors, or decision matrices in chat.
4. `html-artifact`: one static HTML file when browser navigation, visualization, filtering, copy/export, or local interaction lowers decision cost.

HTML when browser navigation, visualization, or local interaction lowers decision cost; never because the topic is important, long, or validator-backed.

## Mode Selection Hard Rules

Do not load for a long but routine answer. If loaded, use the lower mode when in doubt.

- Use `plain-brief` for one conclusion, Top 3 support, and one next action.
- Use `structured-markdown` for grouped evidence, risks, status, options, or compact tables.
- Use `visual-markdown` when one Mermaid diagram, decision matrix, command block, or short source-anchor list is enough.
- Use `html-artifact` only when a hard HTML condition is true: more than 5 source anchors; user must filter, sort, compare, copy, or export; side-by-side options exceed a compact table; architecture, dependency, milestone, module, repo, or skill structure is too wide for one Mermaid diagram; visual style, component variant, design-system, illustration, prototype, or multi-option approval needs a browsable gallery; or a status/incident/editor surface needs drilldown or visible export.

HTML escalation is forbidden when one compact Markdown table, one Mermaid diagram, or one short file list is enough.

## Trigger Examples

Use for: 复杂状态汇报; long-task fact ledger; changed skill/repo behavior needing a plain-text handoff, file evidence, tests, risks, and validation gates; "Show the options so I can choose before you implement"; implementation plan with milestones; OpenSpec apply; PR review/PR writeup; HTML architecture walkthrough; side-by-side option gallery; design-system reference; component variant matrix; incident timeline; temporary triage, feature-flag, or prompt editor that exports Markdown, JSON, or diff.

Do not use this skill for:

- approval gates such as "ask before pushing" or "confirm before installing"
- doing code implementation, bug fixes, or test runs; use this for planning, progress, review, status, material-change reporting, or handoff
- short answers, simple explanations, ordinary chat summaries, one-command status, or a long but routine explanation
- product UI or website work; use `frontend-design`; complex bundled artifacts; use `web-artifacts-builder`; slide decks; use `frontend-slides`

## First-Principles Communication Contract

Before choosing output shape, identify Reader need, Decision frame, first principles, and Evidence boundary. Rebuild from goal, audience, constraints, facts, inferences, assumptions, tradeoffs, and next action; important claims trace to source, command, file, or assumption.

All modes start with BLUF and the smallest structure that preserves reasoning. SCQA/PREP may shape reasoning, but the first visible sentence answers directly.

## Output Contract

Start with the direct answer, not background. Keep support to Top 3 mutually distinct points. Mark important claims as 事实 / 推断 / 假设 when uncertainty matters. Explain tradeoffs, recommendation, rejected path, and a CTA or next action when approval, review, unblock, choice, or continuation is needed. Treat validator warnings as advisory: fix only when it lowers decision cost.

Handoff obligation exists only when changed behavior, multiple surfaces, validation evidence, remaining risk, or reviewer/user continuation matters. Tiny local work with one obvious command result stays brief.

## HTML Artifact Contract

Use only for `html-artifact` mode. Write one static UTF-8 Chinese `.html`, defaulting to `skills/effective-interact/artifacts/`; inlineable HTML/CSS and vanilla JS only; no build step.

For code evidence, include source file link, line number, smallest useful snippet, highlighted lines, and `diff` only when before/after matters. Use Mermaid for sequence, architecture, call-path, routing, or data flow only when faster than text; it must render to SVG before handoff.

Editors: no network/repo writes, credentials, or hidden persistence; always include Markdown, JSON, diff, or prompt export.

Use grouped navigation with a return-to-overview path. 流程、路由、调用链、命令、配置、代码或补丁证据优先用 Mermaid、Markdown、code 或 diff；不要外显 Source fallback.

## Long Task Fact Ledger

For long work where state may drift, keep optional JSONL at `skills/effective-interact/artifacts/session-ledgers/<task-slug>.jsonl`. Record checkpoints, data/status, tool-result summaries, decisions, assumptions, verification, blockers, and next actions for claims, evidence, timelines, status, handoff, or HTML artifacts. Never record secrets, credentials, raw large logs, copyrighted text, hidden persistence, or artifact writes. See `references/session-ledger-schema.json`.

## Generator First Workflow

For `html-artifact` mode:

1. Write UTF-8 JSON following `references/interaction-input-schema.json`; add intent, claims, evidence, chart, code, diff, or Mermaid only when useful.
2. Run `scripts/create-interaction.mjs --input <input.json> --slug <name> --json`; omit `--out-dir` so HTML lands in ignored skill-local artifacts. If overriding, choose only a gitignored directory.
3. Run `scripts/validate-interaction.mjs <outputPath> --json --require-browser`; failed/degraded Mermaid is blocking.
4. Hand off the artifact link, verification, and any kept advisory warning.

Hand-write HTML only when the generator cannot express the needed local editor or visualization.

## Failure Lessons

- 必须使用 UTF-8 中文输入和输出；连续问号乱码通常来自 shell/codepage.
- Mermaid、浏览器、validator 诊断必须脱敏：本地绝对路径、`file:///`、token、原始 HTML/script 都不能进入产物.

## Verification

Before HTML handoff, run `scripts/validate-interaction.mjs`; report degradation. Read `references/interaction-patterns.md`, `references/html-effectiveness-patterns.md`, `references/html-aesthetic-preflight.md`, `references/session-ledger-schema.json`, and `evals/routing-cases.json` before changing trigger or HTML rules.
