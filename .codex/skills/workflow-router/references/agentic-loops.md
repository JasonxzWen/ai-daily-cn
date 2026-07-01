# Agentic Loops

Agentic loops are workflow-stage mechanics, not a top-level workflow owner and not the Loop Control Plane.

```text
Producer -> Verifier -> Arbiter -> Main Agent Decision
```

- **Producer** prepares the work under the active workflow owner.
- **Verifier** gathers evidence. It can be a delegated-agent review, browser run, deterministic command, CI check, or explicit skip reason.
- **Arbiter** judges the original task, acceptance criteria, current diff or artifact, verifier evidence, and risk. It is read-only.
- **Main Agent Decision** integrates the verdict, fixes or delegates scoped work, interrupts for user decisions when required, and owns the final user-facing handoff.

Use `delegated-agent` as the host-neutral term. It may map to a host-native subagent, isolated session, browser run, CI check, deterministic command, or bounded worker depending on the host. Host-specific invocation details belong outside generic skill bodies.

## Standard Loop Types

- `plan-review`
- `test-design`
- `implementation-review`
- `frontend-acceptance`
- `diagnosis-regression`
- `docs-consistency`
- `pr-closeout`
- `insight-retro`

## Required Evidence

Record loop evidence with:

- loop type and stage;
- producer, verifier, and arbiter;
- original task or target spec;
- acceptance criteria;
- producer output or current diff/artifact;
- verifier evidence or explicit skip reason;
- arbiter verdict or explicit skip reason;
- stop condition when the loop may repeat or iteration controls are recorded;
- iteration and maxIterations when the loop may repeat;
- main-agent decision and follow-up.

## Boundaries

- Arbiters must not edit files, resolve conflicts, push, publish, merge, post, mutate third-party resources, or make final user-facing decisions.
- Hooks and deterministic checks may request or validate loop evidence, but must not auto-dispatch delegated agents.
- A failing deterministic check outranks a delegated-agent pass.
- A failing or blocked arbiter verdict must not be marked as deliver/complete.
- When `iteration` or `maxIterations` is recorded, both values must be positive integers, `iteration` must not exceed `maxIterations`, and `stopCondition` must be recorded.
