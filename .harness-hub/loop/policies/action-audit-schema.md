# Action Audit Schema

## Runtime Ledgers

Loop runtime state is target-local and append-only by default:

- `.harness-hub/state/loop-runs.jsonl`
- `.harness-hub/state/interrupt-decisions.jsonl`
- `.harness-hub/state/capability-events.jsonl`

Harness Hub may initialize missing ledgers, but updates must preserve existing ledger content.

## Interrupt Decision Record

Each JSONL line in `interrupt-decisions.jsonl` should follow this shape:

```json
{
  "schemaVersion": 1,
  "runId": "loop-run-id",
  "capabilityId": "capability-id",
  "action": "short action name",
  "targetPaths": ["relative/path"],
  "sideEffects": ["local-files"],
  "riskSignals": ["scope-clear", "validation-known"],
  "validation": {
    "planned": ["command or check"],
    "result": "passed|failed|skipped|pending"
  },
  "decision": "continue|interrupt",
  "reason": "why this decision is safe or why it needs review",
  "evidence": ["file, command, or source anchor"],
  "nextSafeAction": "what happens next"
}
```

## Capability Event Record

Each JSONL line in `capability-events.jsonl` should capture:

```json
{
  "schemaVersion": 1,
  "runId": "loop-run-id",
  "capabilityId": "capability-id",
  "invocation": "standalone|composable|loop-participant",
  "event": "planned|started|completed|failed|skipped",
  "inputs": ["stable input summary"],
  "outputs": ["stable output summary"],
  "validation": ["evidence"],
  "timestamp": "ISO-8601 timestamp when available"
}
```

## Loop Run Record

Each JSONL line in `loop-runs.jsonl` should capture:

```json
{
  "schemaVersion": 1,
  "runId": "loop-run-id",
  "loopId": "loop-id",
  "trigger": "manual|scheduled|event|continuation",
  "status": "running|completed|interrupted|failed",
  "summary": "short durable summary",
  "validation": ["evidence"],
  "nextAction": "next concrete action"
}
```
