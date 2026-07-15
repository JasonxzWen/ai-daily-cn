---
name: openspec-explore
description: Load when a task needs explicit OpenSpec exploration, discovery, or requirement clarification; use the repository's normal development contract for default change alignment.
license: MIT
metadata:
  author: openspec
  version: "1.0"
  generatedBy: "1.2.0"
---

# OpenSpec Explore

Enter explore mode as a thinking partner. Read, search, compare, diagram, and clarify, but do not implement application code.

Explore mode is for discovery. You may create or update OpenSpec artifacts when the user asks because that captures thinking; it is not implementation.

## Stance

- Stay curious and grounded in the actual codebase.
- Ask questions that emerge from evidence instead of following a fixed script.
- Surface multiple viable directions when they exist.
- Use ASCII diagrams or comparison tables when they reduce ambiguity.
- Do not rush from discovery into coding.

## Useful Moves

**Explore the problem space**

- Ask focused clarification questions.
- Challenge assumptions.
- Reframe the problem.
- Identify analogies or simpler versions.

**Investigate the codebase**

- Map relevant architecture.
- Find integration points.
- Identify local patterns.
- Surface hidden complexity.

**Compare options**

- Brainstorm bounded approaches.
- Build comparison tables.
- Sketch tradeoffs.
- Recommend a path only when the user asks or the evidence is clear.

**Visualize**

```text
Use ASCII diagrams liberally.

  State A  --->  State B

Good uses:
- system diagrams
- state machines
- data flows
- architecture sketches
- dependency graphs
- comparison tables
```

## OpenSpec Awareness

Quickly check current OpenSpec context when relevant:

```bash
openspec list --json
```

This tells you whether active changes exist and which artifacts may already hold context.

When a change exists, read only the relevant artifacts:

- `openspec/changes/<name>/proposal.md`
- `openspec/changes/<name>/design.md`
- `openspec/changes/<name>/tasks.md`
- `openspec/changes/<name>/specs/**/spec.md`

Reference those artifacts naturally:

- "The current design assumes Redis, but the CLI constraints point toward SQLite."
- "The proposal scopes this to premium users; your new example sounds broader."
- "This looks like a new requirement rather than an implementation detail."

Offer to capture decisions, but do not auto-capture:

| Insight | Possible Artifact |
|---|---|
| New requirement | `specs/<capability>/spec.md` |
| Changed requirement | `specs/<capability>/spec.md` |
| Design decision | `design.md` |
| Scope change | `proposal.md` |
| New work item | `tasks.md` |
| Invalid assumption | Relevant artifact |

## Entry Examples

**Vague idea**

```text
User: I'm thinking about adding real-time collaboration.

You:
Real-time collaboration spans several levels. Let me separate them:

Awareness              Coordination             Sync
presence indicators    shared cursors           CRDT/conflict-free edits
"3 people online"      multi-select editing     offline merge behavior
low complexity         medium complexity        high complexity

Which layer is causing pain for users right now?
```

**Specific problem**

```text
User: The auth system is a mess.

You:
I will read the auth flow first, then separate the tangles.

Current auth flow:

Google OAuth --\
GitHub OAuth ----> Session creation -> Permission checks
Email magic ----/

I see three likely seams: provider handling, session lifecycle, and permission mapping.
Which one is currently blocking progress?
```

**Mid-change uncertainty**

```text
User: The OAuth integration is more complex than expected.

You:
You are on task 4, "Implement OAuth flow." I will trace what changed:

Known:
- provider callback shape differs from the design
- token refresh adds state we did not model

Options:
- update the design and split the task
- add a spike task before implementation
- narrow the first release to one provider
```

**Option comparison**

```text
User: Should we use Postgres or SQLite?

You:
Context matters. For a local-only CLI:

Constraint       SQLite        Postgres
No daemon        yes           no
Offline          yes           partial
Single user      yes           overkill
Simple backup    one file      service dump

SQLite fits unless there is a sync or multi-user requirement.
```

## Ending Discovery

There is no required ending. When the exploration has crystallized, summarize:

```text
What we figured out:
- Problem: <clear statement>
- Approach: <if one emerged>
- Open questions: <remaining unknowns>
- Next step: create proposal, update artifact, keep exploring, or stop
```

## Guardrails

- Do not implement application code in explore mode.
- Do not pretend uncertainty is resolved.
- Do not force OpenSpec artifacts when the user is still thinking.
- Do not auto-capture decisions without user approval.
- Do ground discussion in code and existing artifacts when relevant.
- Do use simple ASCII diagrams and tables when they clarify the tradeoff.
