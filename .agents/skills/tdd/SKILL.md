---
name: tdd
description: Load when implementing a confirmed behavior change through red-green-refactor; diagnose first when the root cause is unknown, and use prototype for throwaway exploration.
license: MIT
metadata:
  source: "mattpocock/skills skills/engineering/tdd"
  upstream_commit: "e9fcdf95b402d360f90f1db8d776d5dd450f9234"
---

# TDD

## Purpose

Implement one observable behavior at a time through the narrowest public seam:

```text
RED: one test fails for the missing target behavior
GREEN: the smallest production change makes it pass
REFACTOR: improve structure only while green
```

Use this for production features, confirmed bug fixes, and behavior-preserving refactors. Use `diagnose` first when the root cause is unknown. Use `prototype` when the code is disposable design learning.

## Choose A Vertical Slice

Before editing production code:

- identify the user or caller-visible outcome
- identify the public interface and nearest real integration path
- inspect adjacent tests and project conventions
- select one vertical tracer bullet that can be independently proven

Prefer a narrow end-to-end behavior over a broad layer-by-layer implementation. Read `references/interface-design.md` when the public seam is awkward or missing.

## RED

Write exactly one test for one behavior. Do not write every imagined test up front.

Run the actual test command and confirm:

- the test fails before production code changes
- the failure is caused by the missing target behavior, not syntax, fixture, environment, or setup failure
- the assertion describes public behavior rather than private implementation shape

If the test is already green, it is not RED evidence. Correct the seam or demonstrate that the requested behavior already exists before proceeding.

Read `references/tests.md` and `references/mocking.md` when choosing assertions or boundaries. Mock only an external or impractical boundary; do not mock the behavior being proved.

## GREEN

Write the smallest production change that makes the current test pass:

- no speculative options or fallback paths
- no unrelated cleanup
- no abstraction without observed duplication or real interface pressure
- no implementation beyond the current behavior slice

Run the test and preserve its output as GREEN evidence.

## Repeat And Refactor

Choose the next observable behavior only after the current slice is green. Let each cycle refine the design instead of committing to every imagined test up front.

Refactor in small steps while the relevant suite remains green. Use `references/refactoring.md` to distinguish justified simplification from opportunistic redesign.

## Completion

Before handing back:

- run every changed/new test
- run the nearest existing suite for the touched public surface
- confirm the original behavior or bug scenario through its real path
- delete throwaway harnesses unless they became durable tests
- report any missing test seam instead of adding a shallow implementation-detail test

Use `verification` for final build, typecheck, lint, broader test, diff, and artifact gates. Deterministic failures remain failures; this Skill cannot waive them.

Do not commit, push, publish, or expand scope merely because a TDD cycle is green.
