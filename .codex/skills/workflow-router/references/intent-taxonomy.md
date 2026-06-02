# Intent Taxonomy

Use this taxonomy only to classify the request. Do not execute the work here.

## States

| State | Signals | Owner |
|---|---|---|
| question | asks "where", "why", "can it", "compare", "explain", "look up", or asks for evidence without asking for changes | `answer-workflow` |
| sdd-change | asks to add, change, fix, refactor, implement, build, migrate, or alter behavior | `sdd-workflow` |
| diagnosis | reports a failing command, runtime bug, flaky behavior, performance regression, or agent/tool failure | `diagnosis-workflow` |
| review | asks to review, audit, assess risk, check security, check UI/UX, or find missing tests without requesting fixes | `review-workflow` |
| delivery | asks to finish, validate, clean up, hand off, produce release notes, reset local environment, open or update a PR, check PR status/mergeability/CI, or close accepted work | `delivery-workflow` |
| harness-hub-maintenance | asks to maintain Harness Hub, evaluate skill sources, change routing, update capabilities, or preserve install/update/remove lifecycle | `hub-maintenance-workflow` |

## Ambiguity Rules

- If the user says "continue" after planning and implementation has not been approved, route to `sdd-workflow` only when the accepted plan already exists.
- If the user asks "what do you think" or "is this enough", route to `review-workflow` or `answer-workflow`, not mutation.
- If a request mixes review and implementation, ask whether to review first or implement the accepted fix.
- If a request references source projects or skill packs, route to `hub-maintenance-workflow` when the target is this repository.
- If no state is credible, return `none` and answer normally.

## Non-Owners

- `effective-interact` lowers interaction cost through Chinese-first structure, reports, and visual artifacts. It is an expression and handoff layer, not the pressure-test owner.
- `doc-coauthoring`, `internal-comms`, `claude-api`, `mcp-builder`, `skill-creator`, `design-taste-frontend`, `theme-factory`, and `slack-gif-creator` are helper atoms selected by an owner workflow, not top-level owners.
- TDD is embedded in `sdd-workflow`.
- Native goal/story loops are outside Harness Hub's distributed skill set; repeated execution still requires explicit user approval.
- OpenSpec stays explicit formal mode.
- Superpowers, ECC, and Matt Pocock skills are source references or helper skills, not top-level owners.
