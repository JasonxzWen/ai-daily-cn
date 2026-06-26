# Analysis Rubric

Analyze from evidence first. Separate facts, inferences, assumptions, and unknowns.

## Health Verdict

Use these labels:

- `healthy`: recent work shows clear requirements, validated changes, few repeated blockers, and stable handoffs.
- `mixed`: progress exists but there are repeated bottlenecks, unclear validation, or recurring user corrections.
- `blocked`: repeated failures, missing context, tool loops, or unresolved decisions dominate the window.
- `under-evidenced`: there is not enough confirmed evidence to judge.

## Bottleneck Lenses

Look for:

- requirement churn: repeated restatement, missing acceptance criteria, late scope changes;
- evidence gaps: conclusions from memory without source anchors;
- evidence pollution: repo source files, generated wrappers, caches, or other worktrees treated as interaction evidence;
- environment readiness: missing dependencies, worktree bootstrap, sandbox startup, local indexes, or host trace roots blocking progress;
- tool-call branch mistakes: repeated commands, wrong working directory, stale state, unnecessary retries;
- validation gaps: completion claimed before tests, smoke checks, or handoff evidence;
- context drift: agent optimizes a subtask after losing the user's actual goal;
- project drift: work moves away from the repository's stated purpose or accepted workflow.

Successful handoff or state-update activity is not a bottleneck by itself. Treat it as a context-continuity bottleneck only when there is blocker, missing-context, stale-context, resume, compaction, or drift evidence.

## Tool Decision Audit

Judge a tool decision by the local conditions at that moment:

- Was the next observation needed, or was the agent guessing?
- Was the command scoped to the repository and task?
- Did the agent stop after a failed hypothesis and update the plan?
- Did it preserve user changes and avoid unrelated cleanup?
- Did it verify claims before reporting completion?

For tool branch counts, prefer parsed tool-call or tool-result records. Do not count a handoff or summary as a tool branch merely because its text mentions tools.

Do not punish a branch merely because a later result made it look inefficient. Explain what evidence was available at the time.

## Recommendation Bar

Recommendations should be few and sharp:

- at most three primary recommendations;
- each recommendation maps to a bottleneck and evidence IDs;
- each recommendation names the likely owner workflow for implementation;
- avoid broad style advice unless it would change future agent behavior.

## User Preference Boundary

Do not infer personal preferences from sparse traces. If preference, tolerance, or desired tradeoff is not explicit, put it under unknowns and ask.
