# Official Blog Knowledge Base Plan

## Purpose

The official blog knowledge base turns selected OpenAI and Anthropic official posts into durable Chinese digests that can be reused by the homepage, daily reports, and future report-generation context. It is not a company-news archive and it does not publish full article translations.

Operator workflow: `tasks/official-blog-workflow-runbook.md`.

## Stage 1 Scope

Stage 1 implements only the validated data layer:

- `schemas/official-blog.schema.json`
- `src/official-blog-knowledge.js`
- curated seed records under `curated-data/official-blogs/openai/` and `curated-data/official-blogs/anthropic/`
- unit tests in `tests/official-blog-knowledge.test.js`

No homepage, report rendering, source discovery, or publish workflow behavior changes are included in this stage.

## Admission Rules

Include posts that introduce or explain durable technical or product knowledge:

- new products or developer platform primitives
- new models with capability, evaluation, safety, or integration guidance
- technical practices such as harness engineering, evals, context engineering, tool use, MCP, computer use, memory, sandboxing, observability, and multi-agent workflows
- engineering implementation write-ups with reusable architecture, workflow, checklist, or failure-mode lessons
- safety or alignment engineering when methods, frameworks, deployment constraints, or evaluation practices are explained

Exclude posts that are ordinary company news:

- partnerships or customer adoption announcements without implementation detail
- funding, hiring, events, awards, market expansion, regional availability, or sales copy
- policy statements or company news without reusable model, product, engineering, or safety methodology
- customer stories that only say a company adopted OpenAI or Claude

Use `needs_review` during AI preview triage when a partnership or customer story hints at concrete architecture, evals, permissions, workflow, or rollout controls, but the first excerpt is not enough to prove durable knowledge value.

## Public Content Boundary

Knowledge records are public-safe digests:

- Chinese title
- original title
- canonical source URL
- short Chinese summary
- key ideas
- practice checklist
- topics and related records

They must not contain full-text translations, prompt logs, candidate scoring, private paths, or internal publishing diagnostics.

## Follow-Up Stages

1. Generate `docs/official-blogs/index.html`, company pages, and `official-blog-index.json`.
2. Add homepage entry between topic radar and date index.
3. Derive reverse links from existing daily report URLs without changing report schema.
4. Add optional `knowledge_refs` to report items after the reverse-link model is stable.
5. Let daily generation consume a compact knowledge context, capped to a small number of related records.
