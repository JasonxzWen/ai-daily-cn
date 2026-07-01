# Official Blog Workflow Runbook

## Scope

This runbook turns selected OpenAI and Anthropic official blog posts into durable Chinese knowledge records. It is for operator use when a new official blog appears in a daily run or source feed. It is not a general company-news archive and it must not publish full article translations.

The first-pass admission step uses title + opening preview only. It must not read full article text for first-pass admission. Full article reading is reserved for the later human authoring step after a candidate has passed triage or has been explicitly marked for review.

## Admission Standard

Include posts with durable product, model, or engineering value:

- new products or developer platform primitives
- new models with capability, evaluation, safety, deployment, or integration guidance
- technical practices such as harness engineering, evals, context engineering, tool use, MCP, computer use, memory, sandboxing, observability, and multi-agent workflows
- engineering implementation write-ups with reusable architecture, workflow, checklist, or failure-mode lessons
- safety or alignment engineering when the post explains methods, frameworks, deployment constraints, or evaluation practices

Exclude ordinary company news:

- ordinary partnerships without concrete implementation detail
- customer adoption stories that only say a company uses OpenAI or Claude
- funding, hiring, events, awards, regional availability, market expansion, sales copy, or broad company updates
- policy statements or news posts without reusable model, product, engineering, or safety methodology

Use `needs_review` when a partnership or customer story hints at concrete architecture, evals, permissions, workflow, rollout controls, or engineering tradeoffs, but the opening preview is not enough to prove durable knowledge value.

## Manual Review Resolution

Items marked `needs_review` require a human resolution checkpoint before authoring. At that checkpoint, read the full article, inspect whether it contains reusable implementation detail, and record an explicit `include` or `exclude` decision with the matched criteria. Do not move a `needs_review` item into `official_blog_authoring_brief` unless the human review has converted it to an accepted include decision.

## Artifact Rules

Write internal JSON artifacts with command-native `--output`; do not capture stdout through shell redirection for machine JSON. Keep all intermediate files outside public output paths.

Internal review, decision, authoring, and dry-run artifacts must not be written under:

- `docs/data`
- `docs/official-blogs`
- public .html paths

Use an internal scratch path such as `.tmp/official-blog-workflow/<date>/` or another ignored/private operator directory. Public projection is generated separately by the site build after curated records are committed.

## Operator Sequence

Use stable dated filenames so the artifacts can be reviewed and replayed.

1. Prepare a local review-session manifest.

   ```json
   {
     "report_date": "<YYYY-MM-DD>",
     "generated_at": "<ISO-8601 timestamp>",
     "feeds": [
       {
         "company": "openai",
         "source_label": "OpenAI official blog feed",
         "file": "<local-openai-rss-or-export.json>"
       },
       {
         "company": "anthropic",
         "source_label": "Anthropic official blog feed",
         "file": "<local-anthropic-rss-or-export.json>"
       }
     ]
   }
   ```

   The `file` values are local RSS, Atom, or exported JSON inputs. They may be absolute paths or paths relative to the manifest file. File paths are read by the CLI but are not written into the review-session artifact.

2. Preferred path: build the preview-to-review session.

   ```powershell
   node src/cli.js official-blog:review-session --input <internal-dir>/00-review-session-manifest.json --output <internal-dir>/03-review-session.json --date <YYYY-MM-DD>
   ```

   Expected artifact kind: `official_blog_review_session` under `session`. This artifact contains `preview_feeds`, `combined_preview_feed`, `intake_queue`, and `review_packet`. It stops before AI decisions, manual `needs_review` resolution, human authoring, dry-run, and curated record writes. It must not contain `official_blog_review_decisions`, `official_blog_authoring_brief`, `official_blog_reviewed_authoring`, `official_blog_knowledge_drafts`, `records_planned`, or `records_written`.

   The next step may use `<internal-dir>/03-review-session.json` directly as `--packet`; the CLI reads `session.review_packet` from the review-session artifact.

3. Split audit path: parse feed or exported source input.

   ```powershell
   node src/cli.js official-blog:parse-feed --company openai --input <rss-or-export.json> --output <internal-dir>/01-preview-feed.json --date <YYYY-MM-DD>
   ```

   Expected artifact kind: `official_blog_preview_feed`.

4. Split audit path: build the preview-only intake queue.

   ```powershell
   node src/cli.js official-blog:intake --input <internal-dir>/01-preview-feed.json --output <internal-dir>/02-intake-queue.json --date <YYYY-MM-DD>
   ```

   Expected artifact kind: `official_blog_intake_queue`. This step applies the admission standard from title + opening preview and keeps full text out of the queue.

5. Split audit path: produce the AI review packet.

   ```powershell
   node src/cli.js official-blog:review-packet --input <internal-dir>/02-intake-queue.json --output <internal-dir>/03-review-packet.json --date <YYYY-MM-DD>
   ```

   Expected artifact kind: `official_blog_review_packet`. The packet gives AI only the preview-safe material and the admission policy.

6. Normalize AI review decisions.

   ```powershell
   node src/cli.js official-blog:review-decisions --packet <internal-dir>/03-review-session.json --input <internal-dir>/04-ai-decisions.json --output <internal-dir>/05-review-decisions.json --date <YYYY-MM-DD>
   ```

   Expected artifact kind: `official_blog_review_decisions`. This step requires a separate AI decisions file and must not auto-promote deterministic `needs_review` items. If you used the split audit path, pass `<internal-dir>/03-review-packet.json` as `--packet` instead.

7. Create the human authoring brief.

   ```powershell
   node src/cli.js official-blog:authoring-brief --input <internal-dir>/05-review-decisions.json --output <internal-dir>/06-authoring-brief.json --date <YYYY-MM-DD>
   ```

   Expected artifact kind: `official_blog_authoring_brief`. Only accepted decisions become human authoring templates; manual-review items stay separate.

8. Complete the human fields, then validate reviewed authoring.

   ```powershell
   node src/cli.js official-blog:reviewed-authoring --input <internal-dir>/06-authoring-brief.completed.json --output <internal-dir>/07-reviewed-authoring.json --date <YYYY-MM-DD>
   ```

   Expected artifact kind: `official_blog_reviewed_authoring`. The completed template supplies the Chinese digest fields; the command validates required fields and keeps manual-review items out of promotion.

9. Validate final record writes without mutation.

   ```powershell
   node src/cli.js official-blog:author-records --dry-run --input <internal-dir>/07-reviewed-authoring.json --output-dir knowledge/official-blogs --output <internal-dir>/08-author-records-dry-run.json
   ```

   Expected output includes `official_blog_knowledge_drafts`, `records_planned`, and `records_written: []`. Dry-run does not create directories or record files. Review the planned ids, companies, canonical URLs, topics, related ids, and output paths before writing anything to the curated knowledge directory.

10. Write curated records only after dry-run review.

   Step marker: `official-blog:author-records --output-dir knowledge/official-blogs`.

   ```powershell
   node src/cli.js official-blog:author-records --input <internal-dir>/07-reviewed-authoring.json --output-dir knowledge/official-blogs --output <internal-dir>/09-author-records-written.json
   ```

   This is the only step that writes curated record JSON under `knowledge/official-blogs`. Do not run it until step 9 has been reviewed.

11. Build and validate the public projection separately.

   ```powershell
   node --test --test-name-pattern "official blog runbook replay fixtures" tests/official-blog-knowledge.test.js
   npm run build:check-clean
   npm run privacy:validate
   npm run validate
   ```

   The replay fixture test exercises OpenAI and Anthropic examples locally without live network access before the broader validation suite runs.
   The public projection may update generated `docs/data/official-blogs.json` and `docs/official-blogs/` only through the normal site build/publish path, never through internal review or authoring commands.

## Review Checklist

- Admission matches the include/exclude threshold above.
- `needs_review` items were not promoted into authoring or final records without explicit human completion.
- Dry-run output has `records_planned` and `records_written: []`.
- Dry-run output does not contain `opening_preview`, full article body, raw AI transcript, source audit, candidate pool, or private paths.
- No internal artifact was written to `docs/data`, `docs/official-blogs`, or public .html paths.
- Public projection validation was run after final curated records changed.
- Tests and docs validation do not depend on live network sources.
