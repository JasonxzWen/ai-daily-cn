---
name: prototype
description: Load when a task needs a throwaway prototype, state-model sanity check, UI variant, image-assisted visual mockup, mock interaction, or playable design; do not use for production feature work.
license: MIT
metadata:
  source: "mattpocock/skills skills/engineering/prototype"
  upstream_commit: "e9fcdf95b402d360f90f1db8d776d5dd450f9234"
---

# Prototype

## Purpose

A prototype is disposable evidence that answers one design question. It should make uncertainty visible before production implementation starts.

Use the smallest evidence that lets the user or agent learn something concrete. Delete it or absorb the validated decision when done.

## Pick The Branch

First identify the question.

- Logic prototype: use when the question is about business rules, data shape, state transitions, command flow, or API feel.
- UI prototype: use when the question is about layout, interaction, hierarchy, density, or visual alternatives.

If the question is ambiguous, inspect the surrounding code and state the assumption before writing anything.

Read `references/logic-prototype.md` or `references/ui-prototype.md` after choosing the branch when implementation details matter.

## Rules For Both Branches

1. Mark every created artifact or code path as throwaway in its name, route, README, top comment, or handoff.
2. When the evidence is runnable code, keep it near the relevant module, reuse the project's runtime and task runner, and provide one command or URL that starts it.
3. Avoid persistence unless persistence is the exact question. When it is, use a disposable local file or scratch database whose name makes cleanup obvious.
4. Skip production polish, broad error handling, and abstractions.
5. Surface the state, variant, or decision being tested.
6. Capture the answer in an existing project artifact or the final summary; preserve the prototype itself as durable evidence only when the user explicitly asks.
7. Delete the prototype or fold the winning decision into production code.

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

Choose the cheapest evidence that can answer the current question: a visual brief for a describable direction, a Host-native image for a static visual question, or runnable UI only when behavior must be experienced. Static images do not verify interaction, responsiveness, or accessibility.

Use Host-native image generation only when a bitmap mockup or reference materially reduces visual uncertainty. Use only public or generated material, or assets the user supplied or explicitly approved for this generation. Reduce private context to de-identified visual descriptors; never send source code, secrets, internal routes, customer or account data, private screenshots, or private copy. Do not add a provider SDK, API key, model adapter, or model-specific runtime to the project. Treat generated images as prototype evidence rather than production UI; if the Host has no native image capability or safe context is unavailable, provide a visual brief and continue without a fallback runtime.

Generate only enough alternatives to distinguish unresolved choices; one direction is enough when validating a single hypothesis. Make each alternative differ in structure or interaction, not just color or copy.

Change only the affected direction while preserving accepted constraints. Reuse the existing page when runnable code needs product context, and add a temporary switcher only when comparing multiple runnable variants in place materially reduces decision cost.

Delete losing alternatives and any comparison control when the question is answered.

## Handoff

When handing off, include:

- the design question
- how to run or open the prototype
- what to inspect while using it
- cleanup expectation

Do not promote prototype code directly to production. Rewrite or harden the chosen path under the normal implementation and verification workflow.

Do not create a branch, commit, push, or publish the prototype unless the user explicitly authorizes that separate delivery action.
