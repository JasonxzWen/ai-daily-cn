# Source Post Workflow

## 1. Source Capture

Collect the canonical source before drafting:

- canonical URL, title, author, publish date, access date;
- section headings and order;
- tables, footnotes, glossary entries, captions, and callouts;
- media URLs, alt text, media type, dimensions if available, and licensing/caption notes;
- source links and named references;
- access limitations such as paywall, challenge page, missing assets, or indexed-only access.

Save enough metadata in the public source ledger for a reader to verify provenance without archiving the whole source article.

## 2. Fidelity Boundary

For third-party copyrighted material, do not publish a full article repost or full line-by-line translation unless rights are clear. Use a high-fidelity Chinese reconstruction instead:

- preserve every material claim, number, named entity, table row, term, footnote, and media reference;
- use new wording and structure when possible;
- link readers to the original for exact phrasing;
- explicitly label source facts, project judgments, assumptions, and open questions.

## 3. Blog Shape

The public post should be reader-first:

1. direct one-minute answer: what the source is, why it matters, and why this repo cares;
2. source structure: a tree, outline, compact table, or section map that lets the reader orient;
3. core ideas or Chinese reconstruction in the source order, depending on the user's requested depth;
4. local iteration: what this repo already changed, what should change now, and what stays out of scope;
5. reflection: whether the change is effective, where it is redundant, and what to optimize next;
6. source metadata, copyright boundary, media ledger, glossary, footnotes, and verification links;
7. effective-interact summary/visualization layer only if it lowers decision cost.

Do not put generated raw Markdown/code fallback blocks in the main reading path.
Do not put source ledger, authorization mechanics, or validation output before the reader understands the source. If the page opens like an audit log, rewrite it as an article.
Do not use repeated dashboards for article sections. One early tree or visual map is usually enough; use tables only for comparable rows.

## 4. Effective-Interact Layer

Use effective-interact for summary, comparison, map, decision matrix, or handoff. It must be secondary to the source-fidelity layer.

Recommended sections:

- summary cards for core thesis, integration fit, and risk;
- a data table for source-to-project mapping;
- a Mermaid or chart section for the evaluation/reporting flow;
- claims/evidence only when it lowers reader cost;
- next actions and validation evidence.

Validate the artifact and link it from the blog.

## 5. Project Iteration Review

Answer these explicitly:

- Which changes already happened because of the source?
- Were those changes effective for this repo?
- Which parts are redundant or overbuilt?
- What should be optimized or removed next?
- Which ideas should change the repo now?
- Which ideas should become later SDD/spec work?
- Which ideas are rejected or out of scope?
- Which materials should be kept only as source references?
- Which validation would prove the iteration is complete?

## 6. Acceptance Checklist

- Source metadata, links, media, footnotes, glossary, and access limitations are present.
- Chinese reconstruction follows the original structure and preserves material information.
- The public article passes the 60-second reader test: source identity, source structure, local change, and effectiveness verdict are clear without opening the source ledger.
- Copyright boundary is explicit.
- Effective-interact summary exists and is not the main blog body.
- Project-iteration decision is present.
- Public page screenshot shows readable article layout.
- `validate-source-post.mjs`, source-post validation, diff check, and relevant repo gates pass.
