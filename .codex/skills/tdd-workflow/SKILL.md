---
name: tdd-workflow
description: Load when a workflow-router-selected owner workflow needs implementing features, fixing confirmed bugs, or refactoring production code with tests through red-green-refactor; diagnose first for unknown root causes and prototype for throwaway exploration.
license: MIT
metadata:
  source: "mattpocock/skills skills/engineering/tdd"
  upstream_commit: "d54c497aa94400a496d3f2c38be10fa5f284c5a9"
---

# TDD Workflow

## Purpose

Use this skill for production feature work, confirmed bug fixes, and refactors where tests should guide the change.

The core rule is one observable behavior at a time:

```text
RED: write one failing behavior test
GREEN: write the smallest production change that passes it
REFACTOR: clean up only while green
```

Do not use this skill to find an unknown root cause. Use `diagnose` first, then return here once the failing behavior is understood. Do not use it for disposable design learning; use `prototype` first.

## Test Through Public Behavior

Prefer tests that exercise the public interface a caller or user actually depends on.

Good tests:

- describe what the system does, not how internals are arranged
- survive internal refactors
- use project vocabulary from existing docs and code
- fail for a reason that would matter to a user, caller, or maintainer

Avoid tests that lock down private methods, incidental data shapes, internal collaborators, or implementation order. If a refactor breaks the test while behavior is unchanged, the test was too coupled.

Read `references/tests.md` and `references/mocking.md` when choosing seams or mocks.

## Workflow

### 1. Confirm The Slice

Before editing production code:

- identify the public interface or user flow being changed
- list the first behavior to prove
- inspect nearby tests and project conventions
- name any design uncertainty that should be prototyped first

If the user asked for a broad feature, split it into vertical tracer bullets. Each slice should be independently verifiable through the real integration path that matters.

### 2. Write One Failing Test

Write exactly one test for one behavior.

Run it and confirm:

- it fails before the implementation
- the failure matches the missing behavior, not a setup error
- the test name reads like a capability statement

Do not write every imagined test up front. Bulk RED creates tests for guessed designs and usually bakes in the wrong shape.

### 3. Make It Pass

Write the smallest production change that makes the current test pass.

Stay narrow:

- no speculative branches
- no extra options or configurability
- no broad cleanup
- no abstraction unless this test exposes real duplication or interface pressure

### 4. Repeat Vertically

Add the next behavior only after the current test is green.

Each cycle should respond to what the last cycle taught you. If the next test forces an awkward interface, stop and consider whether the module needs to be deepened; read `references/interface-design.md`.

### 5. Refactor Only While Green

After the relevant behavior tests pass, refactor in small steps.

Keep tests green between steps. Use `references/refactoring.md` when deciding whether cleanup is actually justified.

### 6. Verify The Change

Before declaring done:

- run the new or changed tests
- run the nearest existing suite that covers the touched surface
- run broader project gates when the blast radius warrants it
- report any missing test seam instead of adding a shallow test

Use `verification-loop` for final build, typecheck, lint, and full validation gates.

## Guardrails

- One failing test at a time.
- Tests should describe behavior through public interfaces.
- Mock only boundaries you do not own or cannot run locally.
- Coverage targets come from the project, not from this skill.
- Refactor only while green.
- Delete throwaway harnesses unless they become real tests.