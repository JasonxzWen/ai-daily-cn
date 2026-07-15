---
name: prototype
description: Load when a task needs a throwaway prototype, state-model sanity check, UI variant, mock interaction, or playable design; do not use for production feature work.
license: MIT
metadata:
  source: "mattpocock/skills skills/engineering/prototype"
  upstream_commit: "e9fcdf95b402d360f90f1db8d776d5dd450f9234"
---

# Prototype

## Purpose

A prototype is throwaway code that answers one design question. It should make uncertainty visible before production implementation starts.

Use the smallest prototype that lets the user or agent learn something concrete. Delete it or absorb the validated decision when done.

## Pick The Branch

First identify the question.

- Logic prototype: use when the question is about business rules, data shape, state transitions, command flow, or API feel.
- UI prototype: use when the question is about layout, interaction, hierarchy, density, or visual alternatives.

If the question is ambiguous, inspect the surrounding code and state the assumption before writing anything.

Read `references/logic-prototype.md` or `references/ui-prototype.md` after choosing the branch when implementation details matter.

## Rules For Both Branches

1. Mark the prototype as throwaway in the file name, route, README, or top comment.
2. Keep it near the relevant module or page so context is obvious.
3. Use the project's existing runtime and task runner.
4. Add one command or URL that starts the prototype.
5. Avoid persistence unless persistence is the exact question. When it is, use a disposable local file or scratch database whose name makes cleanup obvious.
6. Skip production polish, broad error handling, and abstractions.
7. Surface the state, variant, or decision being tested.
8. Capture the answer in an existing project artifact or the final summary; preserve the prototype itself as durable evidence only when the user explicitly asks.
9. Delete the prototype or fold the winning decision into production code.

## Logic Prototype

Build a tiny interactive terminal app when the question is about behavior.

Keep the reusable logic behind a pure interface:

- reducer
- explicit state machine
- pure functions over plain data
- small state-owning module with clear methods

The terminal shell is disposable. The reducer, state machine, or function shape can become the real implementation if it survives the prototype.

Show the current state after every action. Keep the UI on one screen when possible.

## UI Prototype

Build several structurally different UI variants when the question is visual or interaction-heavy.

Prefer mounting variants inside an existing route or page, controlled by a query parameter such as `?variant=A`. Use a new prototype route only when no existing host page fits.

Each variant must differ in structure or interaction model, not just color or copy. Default to 3 variants and avoid more than 5.

Add a small switcher for cycling variants. The switcher must be visibly marked as prototype-only and must not ship in production builds.

## Handoff

When handing off, include:

- the design question
- how to run or open the prototype
- what to inspect while using it
- cleanup expectation

Do not promote prototype code directly to production. Rewrite or harden the chosen path under the normal implementation and verification workflow.

Do not create a branch, commit, push, or publish the prototype unless the user explicitly authorizes that separate delivery action.
