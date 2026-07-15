---
name: diagnose
description: Load when a task needs hard bugs and performance regressions, failing commands, hard-to-reproduce behavior, or unknown root causes diagnosed; use agent-introspection-debugging instead for agent/tool harness failures.
license: MIT
metadata:
  source: "mattpocock/skills skills/engineering/diagnosing-bugs"
  upstream_commit: "e9fcdf95b402d360f90f1db8d776d5dd450f9234"
---

# Diagnose

## Purpose

Use this skill for product, code, test, and runtime failures where the cause is not obvious. The core discipline is to build a fast, trusted pass/fail loop before fixing anything.

Do not use this for agent self-recovery, repeated tool loops, or context drift. Use `agent-introspection-debugging` for those.

## Workflow

### 1. Build The Feedback Loop

Find the smallest repeatable signal that shows the bug.

Prefer, in order:

1. A failing test at the seam that reaches the bug.
2. A CLI command, fixture, or HTTP request that reproduces the symptom.
3. A browser automation script for UI, console, or network failures.
4. A replayed artifact such as a log, event payload, HAR file, trace, or saved input.
5. A throwaway harness that exercises the failing code path in isolation.
6. A stress, property, fuzz, or looped reproduction for nondeterministic failures.
7. A bisection or differential loop when the bug appeared between known commits, versions, datasets, or configs.
8. A human-in-the-loop script only when manual steps cannot be automated; adapt `scripts/hitl-loop.template.ps1`.

Before moving on, name one command that has already been run and can catch this exact bug. A manual-loop script is acceptable only when automation is impossible. The loop must be red-capable, deterministic or high-reproduction for flaky bugs, fast enough to iterate, and runnable without hidden human judgment.

If no credible loop can be built, stop and report what was tried. Ask for the missing artifact, environment access, or permission for temporary instrumentation.

### 2. Minimize The Reproduction

Run the loop until it shows the user's failure, not a nearby failure. Remove unrelated inputs, steps, services, and timing while preserving the symptom. For flaky bugs, loop, stress, or control the suspected timing until you raise the reproduction rate enough to compare probes honestly.

Confirm:

- the symptom matches the user's report
- the failure is repeatable, or frequent enough to debug
- the exact error, wrong output, or slow timing is captured

### 3. Rank Hypotheses

Write 3 to 5 ranked hypotheses before probing.

Each hypothesis must be falsifiable:

```text
If X is the cause, then changing or observing Y will make Z happen.
```

Share the ranked list when useful, then test the highest-signal hypothesis first.

### 4. Instrument Narrowly

Each probe must test one hypothesis.

Prefer:

- debugger or REPL inspection when available
- targeted logs at decision points that distinguish hypotheses
- timing, profiling, query plans, or bisection for performance regressions

Tag any temporary log or probe with a unique prefix such as `[DEBUG-a4f2]` so it can be removed reliably.

### 5. Fix And Lock It Down

When the cause is known:

1. Convert the minimized reproduction into a failing regression test if a correct seam exists.
2. Apply the smallest fix that addresses the cause.
3. Run the regression test.
4. Re-run the original feedback loop.

If no correct test seam exists, record that as an architecture finding instead of adding a shallow test that gives false confidence.

### 6. Clean Up

Before declaring done:

- original repro no longer fails
- regression test passes, or missing test seam is documented
- temporary debug logs and probes are removed
- throwaway harnesses are deleted or clearly marked as debug artifacts
- the final summary states which hypothesis was correct

Use `verification` after code changes to run the broader build, type, lint, and test gates.
