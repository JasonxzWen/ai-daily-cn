---
name: source-to-insight-blog
description: "Load when turning an external article, blog, release note, interview, or report into a source-backed insight blog with Chinese fidelity, media references, an effective-interact summary layer, and project-iteration review; do not load for ordinary summaries, full copyrighted reposts, or production site design."
license: MIT
metadata:
  source: "local-original"
---

# Source To Insight Blog

Use this skill when source material must become a publishable insight blog, not just a chat summary.

## Workflow

1. Capture the source before writing: title, author, date, canonical URL, access date, article structure, tables, footnotes, glossary, links, images, charts, video, downloads, and known access limits.
2. Set the fidelity boundary. Preserve claims, structure, numbers, terms, links, and media references. Do not publish a full copyrighted repost or full translation unless the user owns the rights or provides licensed source text.
3. Define the reader job before drafting: what should a human understand in the first minute, what structure helps them, and what decision or project implication they should leave with.
4. Write the reader-facing blog before the evidence apparatus. Lead with a short article narrative, then the simplest source structure needed for orientation, then analysis. Put source ledger, copyright boundary, and validation details after the reader understands the source.
5. Use `effective-interact` only as a secondary summary or visualization layer. Do not use a raw generated interaction report as the blog body.
6. Add a project-iteration review: what the source confirms, what should change in this repo, what was already changed, what may be redundant, what should stay out of scope, and what needs a later SDD/spec.
7. Validate the generated post with `scripts/validate-source-blog.mjs`, the normal insight validation, a rendered screenshot, and repo gates proportionate to changed files.

## Reader-First Shape

Prefer normal article flow over dashboard flow. The default public blog shape is:

1. **One-minute answer**: one short paragraph saying what the source is and why this repo cares.
2. **Source structure**: one tree, outline, or compact table that lets the reader orient quickly.
3. **Core ideas**: prose bullets that explain the source's argument or system.
4. **Local iteration**: what this repo already changed or should change because of the source.
5. **Reflection**: explicit verdict on effectiveness, redundancy, and next optimization.
6. **Sources and validation**: attribution, copyright boundary, source ledger, and generated artifacts.

Use a table only when rows are genuinely comparable. If a table cell becomes a paragraph, rewrite that section as prose. Use at most one early visual structure before the article explains why it matters.

## Output Contract

- The blog must have a readable article layout, not raw evidence/code blocks.
- A reader should be able to answer these in 60 seconds: what is the source, how is it organized, what did this repo change, and was that change worth it?
- Source metadata, copyright limits, and evidence ledgers must not be the lead unless the user's main request is source audit or licensing.
- Original media must remain visible or linked with alt text, caption, and source URL.
- Source claims, project judgments, assumptions, and copyright limits must be labeled.
- The effective-interact artifact must be linked or embedded as a summary layer after the fidelity layer.
- The post must include an iteration decision even when the decision is "no repo change."
- If the user asks for reflection, include direct labels: `effective`, `redundant risk`, and `next optimization`.

## Progressive Loading

- Read `references/workflow.md` for the detailed step sequence and acceptance checklist.
- Read `references/copyright-and-fidelity.md` before publishing translated or paraphrased third-party material.
- Use `assets/source-blog-checklist.md` as the authoring checklist.
- Run `scripts/validate-source-blog.mjs <post-dir>` before handoff.

## Gotchas

- A source-backed blog is not the same thing as an effective-interact report. Effective-interact lowers summary and decision cost; it does not replace the translated or reconstructed source layer.
- Do not mistake high information density for readability. Dense pages still need a human reading order: answer, structure, implications, reflection, sources.
- Do not lead with authorization mechanics, source-ledger implementation, or generated-component details when the reader asked to understand the source.
- Do not turn article sections into repeated `summary-cards` or `data-table` blocks just because the generator supports them.
- Browser screenshots are part of acceptance for public HTML. A passing JSON validator does not prove the page is readable.
- If the primary site blocks automated fetches, use an indexed or browser-readable copy only after recording the access limitation and checking the canonical URL.
- Keep UTF-8 end to end. Mojibake in a public post is a failed delivery, even if tests pass.
