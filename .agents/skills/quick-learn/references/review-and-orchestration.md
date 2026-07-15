# Review And Orchestration

Use this reference for mandatory stage-level review and parallel work.

## Required Stage Reviews

Run review at these gates:

1. **Source Pack Review**: before diagnosis or syllabus.
2. **Syllabus Review**: before asking the user to confirm modules.
3. **Module Synthesis Review**: for long, source-heavy, or high-stakes modules before teaching from the synthesis.
4. **Final Handoff Review**: before declaring a learning project phase complete.

Use a delegated-agent read-only review when the active host and user scope allow it. The main agent remains responsible for final decisions, integration, and user-facing conclusions.

If delegated review is unavailable, blocked by the active host policy, explicitly forbidden by the user, or too expensive for a small stage, run the fallback checklist below and explicitly record that fallback in `reviews.jsonl`.

Do not treat lack of a separate user subagent request as a fallback reason by itself. The fallback reason must name the actual blocker: host policy, missing tool, user prohibition, cost/latency tradeoff, or small low-risk stage.

## Parallel Research Lanes

For broad topics, split source work into independent lanes:

- primary/official source lane;
- tutorial and worked-example lane;
- critique/misconception/failure-mode lane;
- assessment/exercise lane.

Each lane should return source IDs, quality/freshness grades, useful excerpts summarized in original words, gaps, and a syllabus recommendation. Do not let subagents make final syllabus decisions.

Before teaching from a specific article, documentation page, PDF section, repository, video, or course lesson, promote that item from a broad entry page into its own source record or source-index row. Directory pages are useful discovery sources, but they should not anchor detailed module claims by themselves.

## Review Checklist

For every stage, check:

- Does the output still match the learning contract?
- Are primary sources separated from secondary interpretation?
- Are source gaps visible instead of hidden?
- Are copyright/access limits respected?
- Are module boundaries based on user goals and prerequisites?
- Is there at least one active recall or transfer check per meaningful section?
- Are claims grounded in source evidence or marked as inference?
- Is the next user decision clear?

Verdict:

- **pass**: proceed;
- **warn**: proceed only after noting residual risk or adding a small repair;
- **fail**: repair before teaching or asking for confirmation.

## Anti-Drift Rules

- Do not turn source gathering into an article-writing project unless the user changes the goal.
- Do not mirror a book's chapters when the user's learning path needs a different order.
- Do not over-focus on tools and ignore conceptual prerequisites.
- Do not let quizzes become trivia; test usable understanding.
- Do not skip user confirmation for syllabus changes.
- Do not outsource final decisions to subagents.

## Review Log Pattern

Record:

```text
Stage:
Reviewer:
Verdict:
Evidence:
Drift risks:
Required repairs:
Main agent decision:
```
