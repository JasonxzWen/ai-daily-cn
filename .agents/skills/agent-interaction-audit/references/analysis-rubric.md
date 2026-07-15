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
- prompt/rule drift: stale, wrong, contradictory, or host-specific instructions that mislead agents;
- user-friction language: repeated corrections, ambiguity, "not what I meant" language, or request patterns that cause the agent to optimize the wrong target;
- environment readiness: missing dependencies, worktree bootstrap, sandbox startup, local indexes, or host trace roots blocking progress;
- tool-call branch mistakes: repeated commands, wrong working directory, stale state, unnecessary retries;
- script/SOP loss: shell, encoding, GitHub, PR, check-run, validation, or CLI lessons rediscovered instead of recorded;
- validation gaps: completion claimed before tests, smoke checks, or handoff evidence;
- context drift: agent optimizes a subtask after losing the user's actual goal;
- knowledge-cache gaps: project facts, file locations, invariants, and decisions repeatedly rediscovered from scratch;
- automation drift: scheduled task logs, monitors, or recurring jobs hiding repeated failures or stale assumptions;
- project drift: work moves away from the repository's stated purpose or accepted project procedure.

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

## Prompt And Rule Audit

Judge prompt/rule files as context evidence:

- Does the rule still match current implementation and repo policy?
- Is the rule host-specific when the distributed skill should remain portable?
- Did a trace show the agent following stale or misleading guidance?
- Is the instruction too broad, causing trigger noise or repeated unnecessary work?
- Would a narrower existing Skill, project rule, Eval case, SOP, or OKF entry reduce future cost?

## SOP And Knowledge Audit

Look for durable lessons:

- shell and encoding conventions, especially when Chinese text, PowerShell, JSONL, or terminal output is involved;
- GitHub/PR/check-run status sequences and failure handling;
- validation command ordering and known local prerequisites;
- facts repeatedly located from scratch, such as key scripts, lifecycle commands, generated paths, or ownership boundaries.

SOP and cache recommendations should remain proposals unless the user explicitly asks to mutate project memory, docs, rules, or automation.

## Improvement Queue Bar

The improvement queue is not a dump of every signal. It is an executable candidate list.

Queue items should use the intended destination as the primary category and problem type as tags. V1 categories are:

- `project-rule-candidate`
- `stale-info-removal-candidate`
- `sop-candidate`
- `knowledge-cache-candidate`
- `eval-case-candidate`

Actionable queue items require a concrete `validationSignal`. Findings without a validation signal stay in report observations.

Prioritize after evidence gating by expected future cost reduction, not by raw evidence count. Each item needs a `costRationale` with `frequency`, `timeLostPerOccurrence`, `blastRadius`, `fixEffort`, and `verificationClarity`.

Every queue item must include `counterEvidence` and `rejectionReasons` so necessary project policy, one-off incidents, or already-covered rules are not accidentally converted into process churn.

Patch drafts are allowed only after the queue item passes the normal gate: strong evidence, `new` status, P0/P1 priority, explicit repo-local target file, and a reversible edit shape. Weak leads, vague destinations, missing target files, or risky changes must keep `patchDraftPath: null`.

## Recommendation Bar

Recommendations should be few and sharp:

- at most three primary recommendations;
- each recommendation maps to a bottleneck and evidence IDs;
- each recommendation names the likely main-Agent or atomic-Skill owner for implementation;
- avoid broad style advice unless it would change future agent behavior.

## User Preference Boundary

Do not infer personal preferences from sparse traces. If preference, tolerance, or desired tradeoff is not explicit, put it under unknowns and ask.
