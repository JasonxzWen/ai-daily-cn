# Learning Project Lifecycle

Use this reference for multi-session learning projects, books, technologies, or source-heavy topics.

## State Layout

Default root:

```text
.quick-learn/projects/<topic-slug>/
  events.jsonl
  project.json
  progress.json
  sources.json
  reviews.jsonl
  notes.md
  materials/
  source-index.md
  syllabus.json
  misconceptions.md
```

Generated state is local runtime data and should stay ignored by git.

## Phase 1: Learning Contract

Capture:

- topic/material;
- current level;
- target outcome level;
- user context and intended use;
- pace/timebox;
- preferred examples and language;
- non-goals;
- source permissions and access constraints.

Do not over-interview. Ask only questions that change source collection, syllabus shape, depth, or assessment.

## Phase 2: Source Pack

Gather sources before designing the syllabus. For broad or difficult topics, split research into lanes:

- authority and primary sources;
- practical tutorials and examples;
- critiques, common misconceptions, and failure modes;
- assessments, exercises, and case studies.

Each lane returns citations, local paths when downloaded, quality/freshness grades, gaps, and a recommendation for how much weight to give the source.

Run source review before moving on.

## Phase 3: Diagnosis

Ask a short diagnostic set after the source pack:

- one background/current-use question;
- one vocabulary question;
- one mechanism or prediction question;
- one transfer or practical scenario question;
- one preference question if it changes examples or pacing.

Diagnostic answers calibrate the syllabus. They do not count as mastered evidence unless followed by a teach-back or transfer check.

Separate diagnosis results into domain knowledge, vocabulary, numeracy/procedure, and transfer ability. If a later module depends on a shared gap, insert a short prerequisite bridge rather than letting every lesson rediscover it.

## Phase 4: Custom Syllabus

Create a proposed syllabus with:

- module title and objective;
- prerequisites;
- source anchors;
- key concepts and confusion pairs;
- exercises/quiz types;
- target outcome level;
- estimated effort;
- acceptance criteria.

Order modules by prerequisites, not only by source chapters or topic breadth. A bridge can be shorter than a normal module, but it must teach the common language or mechanism needed by several later sections.

Ask the user to confirm module boundaries, order, and depth before teaching. If the user changes the goal, revise the syllabus and log the decision.

When the user confirms the syllabus, update durable state before teaching:

- mark the syllabus/project status as `confirmed` or `in_progress`;
- record the confirmation decision and next action;
- clear or supersede `pending_user_confirmation` so later sessions do not ask for a decision that already happened.

## Phase 5: Module Session

For each confirmed module:

1. Start with a small retrieval from `review_queue`, prioritizing concepts also present in `weak_concepts`.
2. For beginners, teach one plain-language model and a worked example before graded questions.
3. Ask one or two diagnostic, prediction, or application questions using taught vocabulary.
4. Repair the highest-impact gap.
5. Require teach-back at a meaningful section boundary, not after every micro-term.
6. Ask one transfer or application question when it adds new evidence.
7. Log mastery, weak points, next review, and source coverage.

Do not let a session become a passive summary. If the user asks a direct question, answer clearly, then return to active checking.

Before the first explanation in a source-heavy module, check that the concrete module sources are recorded. If the module will rely on a specific article, docs page, repository example, PDF section, or course lesson that is not yet in `sources.json` or `source-index.md`, add it first rather than relying only on a broad entry page.

When teaching begins, update project state to `in_progress` and record the current module plus next action. Keep handoff state aligned with the active phase.

If the learner changes the desired pace or critiques wording, examples, questions, or sequencing, treat that as a lesson-design decision. Update the durable teaching plan, record a `teaching-review`, and do not encode the issue as learner mastery.

## Phase 6: Assessment And Review

Use a mix of:

- multiple choice with plausible distractors;
- short written explanation;
- teach-back;
- compare/contrast;
- scenario application;
- debugging or correction when learning technology;
- mini project or decision memo when the target is practical mastery.

Update `progress.json`, weak concepts, and review queue after assessment.

When an answer, teach-back, or assessment reaches mastery 4 or 5, remove the concept from the weak queue but keep it in the review queue. Remove it from the review queue only after another 4 or 5 result follows intervening material, a later session, or a meaningful delay and is logged with `--metadata retrieval=delayed`. An immediate retry is repair evidence, not delayed retrieval. Source or teaching review metadata is never learner evidence. Preserve event history without preserving stale weakness. Apply this queue behavior to new mastery evidence; do not infer or backfill delayed-review state from historical logs.

## Phase 7: Handoff

End with:

- what was covered;
- evidence of mastery;
- remaining gaps;
- next 1 to 3 review prompts;
- next module recommendation;
- state path and source index path.

Use `effective-interact` only for dense source maps, syllabus comparisons, progress reports, or final handoffs where structure lowers reading cost.
