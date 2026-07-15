---
name: quick-learn
description: Load when a task needs an explicit source-backed learning project, study plan, syllabus, book/technical topic coaching, teach-back, quizzes, or staged review; do not load for routine implementation, one-off facts, or article writing.
license: MIT
metadata:
  source: local-original
  adaptation: "Synthesizes evaluated learning-skill patterns without importing upstream bodies or host-specific runtimes."
---

# Quick Learn

## Purpose

Run a personal, source-backed learning project. Build enough source context first, confirm the custom syllabus with the user, then teach in short sections with questions, teach-back, assessment, progress tracking, and stage-level review.

Use this skill when the user explicitly wants to learn a book, paper, codebase, technology, exam/interview topic, or domain over one or more sessions. Do not use it for one-off factual answers, routine implementation, ordinary article research, or public reposting.

## Non-Negotiables

- Source first: gather and index useful materials before designing the syllabus unless the user explicitly asks for a quick unaided explanation.
- Download when learning needs it and the material is reachable through normal access. Do not bypass paywalls, login walls, robots/anti-scraping controls, or technical access restrictions. Keep downloaded material local for learning and do not reproduce large copyrighted text in responses.
- Confirm the syllabus before teaching. The module boundaries should fit the user's current level and target outcome, not blindly mirror a book or tutorial table of contents.
- Promote concrete module sources before teaching from them. Directory or hub pages can be discovery sources, but specific lesson claims should anchor to article, docs, PDF, repo, or course-page source records.
- Run stage-level review at source pack, syllabus, long module synthesis, and final handoff. Use an independent delegated-agent review when available; otherwise run the deterministic checklist in `references/review-and-orchestration.md` and state the fallback.
- Keep durable state current. After the user confirms a syllabus or teaching starts, clear stale `pending_user_confirmation` state and record the current phase plus next action.
- For beginners, make explanation and demonstration the majority of each teaching turn. Questions are evidence, not the delivery mechanism.
- Define unfamiliar vocabulary in plain language before using it in graded checks. A diagnostic may probe vocabulary only when it is explicitly ungraded.
- Interpret requests to go faster as less repetition, wider coverage, or fewer checks; do not remove prerequisite explanations.
- Keep teaching-quality feedback separate from learner mastery. When the user critiques pacing, wording, examples, or lesson design, repair the teaching plan and log it as `teaching-review` without learner mastery evidence.
- Treat immediate mastery as current understanding, not durable retention. Keep it in the existing review queue until a successful retrieval after intervening material, a later session, or a meaningful delay is logged with `retrieval=delayed`.
- Keep the first teaching unit small. Use active recall, teach-back, transfer questions, and zero-hint checks after the learner has enough explanation to answer.
- Do not build an HTML course artifact in v1 unless the user explicitly asks for that output.

## Session Start

Establish the learning contract. Ask only for missing fields that materially change the plan:

- topic or exact material;
- current level and relevant background;
- target outcome level: recognize, use, modify/debug, design, or transfer;
- timebox, pace, preferred examples, and output needs; distinguish desired breadth, explanation depth, and question cadence;
- constraints, non-goals, and allowed source scope.

When enough context exists, state assumptions and log the contract with:

```powershell
python skills/quick-learn/scripts/log_quick_learn_event.py --topic "Topic Name" --event contract --level beginner --target "Use the idea in real decisions" --summary "Established learning contract."
```

## Project Lifecycle

1. Build a source pack with authority tiers, freshness, local paths or URLs, and open gaps. Use `references/source-strategy.md`.
2. Review the source pack before teaching. Record pass/warn/fail evidence.
3. Build a concept map and custom syllabus. Include prerequisites, short bridge modules when shared vocabulary or numeracy is missing, objectives, source anchors, assessments, and expected artifacts.
4. Ask the user to confirm or adjust module boundaries and depth before the first lesson.
5. Teach one module section at a time: explain, demonstrate, ask, evaluate, repair, teach-back, transfer, assess.
6. Update project state, weak concepts, review queue, and next action after each meaningful section.
7. Finish each session with mastered points, remaining gaps, next review prompts, and the state path.

Default state root:

```text
.quick-learn/projects/<topic-slug>/
```

## Teaching Loop

For each meaningful section:

1. Give the smallest useful plain-language model and define new terms.
2. Demonstrate one concrete example from a source or the user's context.
3. Ask one or two checks using only taught concepts; use batches only for stage tests or an explicitly requested broad scan.
4. Evaluate core judgment, reasoning, decision-relevant caveats, and wording separately.
5. Repair the highest-impact gap with a contrast, worked example, analogy, or source excerpt summary.
6. Use teach-back and transfer at a meaningful section boundary rather than after every micro-term.
7. Grade only learner evidence: the target outcome controls task difficulty, while the 1-to-5 mastery score records evidence quality. Route pedagogy feedback to `teaching-review` instead.

Read `references/teaching-and-assessment.md` before generating quizzes, teach-back checks, stage tests, or remediation plans.

## Logging

Use durable logs for real learning projects, not trivial chat.

```powershell
python skills/quick-learn/scripts/log_quick_learn_event.py --topic "Investment Basics" --event source --source-title "Official book page" --source-url "https://example.com/book" --quality A --summary "Recorded official source."
python skills/quick-learn/scripts/log_quick_learn_event.py --topic "Investment Basics" --event syllabus --module "Risk basics" --summary "Proposed custom module after source review."
python skills/quick-learn/scripts/log_quick_learn_event.py --topic "Investment Basics" --event assessment --concept "Risk premium" --mastery 3 --summary "Teach-back correct, transfer example still weak."
python skills/quick-learn/scripts/log_quick_learn_event.py --topic "Investment Basics" --event assessment --concept "Risk premium" --mastery 4 --metadata retrieval=delayed --summary "Delayed retrieval remained correct."
python skills/quick-learn/scripts/log_quick_learn_event.py --topic "Investment Basics" --event teaching-review --module "Risk basics" --review-status warn --metadata issue_owner=teaching --summary "Learner needs plain-language definitions before checks."
```

The logger writes `events.jsonl`, `project.json`, `progress.json`, `sources.json`, `reviews.jsonl`, and `notes.md`.

Do not log secrets, credentials, private personal details, or raw large proprietary content. Summarize sensitive material and record source pointers instead.

## References

- `references/source-strategy.md`: source tiers, download policy, freshness, source pack fields, and book/technology collection patterns.
- `references/learning-project-lifecycle.md`: project state layout, lifecycle gates, syllabus confirmation, and session handoff.
- `references/teaching-and-assessment.md`: active recall, Feynman teach-back, zero-hint quizzes, mastery levels, and error taxonomy.
- `references/review-and-orchestration.md`: mandatory stage reviews, delegated-agent boundaries, fallback checklist, and anti-drift criteria.
