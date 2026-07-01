# Interrupt Policy

## Purpose

Loop runs should reduce avoidable human interruption while keeping risky action decisions auditable. The agent may continue low-risk local actions when the target, scope, and validation path are clear. It must interrupt when the next action changes durable rules, has unclear ownership, exceeds the active task boundary, cannot be verified, or creates remote or destructive side effects.

## Capability Invocation

Capabilities are not required to belong to a fixed workflow.

- `standalone`: can be triggered directly by the user or agent.
- `composable`: can be used by a higher-level workflow when useful.
- `loop-participant`: participates in a recurring or autonomous loop with explicit run state.

Each capability should describe its inputs, outputs, possible side effects, validation signals, interruption hints, and suggested loops. The loop runtime decides whether to continue or interrupt for the concrete action.

## Continue By Default

Continue without human interruption when all conditions are true:

- The action is inside the active task scope and allowed paths.
- The action is local and reversible.
- The action does not change long-lived project rules, external state, or non-managed content.
- The agent can name the validation signal before acting.
- The action and result will be recorded in `.harness-hub/state/loop-runs.jsonl`, `.harness-hub/state/interrupt-decisions.jsonl`, or `.harness-hub/state/capability-events.jsonl`.

## Interrupt

Interrupt before acting when any condition is true:

- Requirements, ownership, or expected behavior are ambiguous.
- The action changes `AGENTS.md`, `CLAUDE.md`, routing, project rules, long-lived wiki decisions, or other canonical governance content.
- The action writes remote services, publishes content, opens or updates PRs/issues/comments, or calls external APIs with side effects.
- The action deletes, overwrites, migrates, or rewrites non-managed content.
- The action exceeds the active task boundary or touches forbidden paths.
- The action cannot be verified with a concrete local signal.
- Verification fails and the next step would expand scope.
- The agent is relying on unverified API names, paths, scripts, config keys, protocol fields, or package capabilities.

## Audit Requirement

Every continue or interrupt decision must be explainable after the fact. At minimum, record:

- `runId`
- `capabilityId`
- `action`
- `targetPaths`
- `sideEffects`
- `riskSignals`
- `validation`
- `decision`
- `reason`
- `evidence`
- `nextSafeAction`

Good and bad cases are executable eval assets under `.harness-hub/loop/evals/interrupt-policy/`. Update them when a repeated judgment mistake should become a durable rule.
