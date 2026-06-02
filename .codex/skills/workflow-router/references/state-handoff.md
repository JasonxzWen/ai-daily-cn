# State Handoff

After classification, hand off with this compact structure.

```text
STATE: <question | sdd-change | diagnosis | review | delivery | harness-hub-maintenance | clarify | none>
CONFIDENCE: <high | medium | low>
REASON: <one sentence grounded in the user request>
OWNER: <skill name or none>
NEXT GATE: <first gate the owner must satisfy>
HELPERS: <optional helper skills>
EFFECTIVE_INTERACT: <required | default-consider | not-needed>
```

## Next Gate Defaults

| State | Next gate |
|---|---|
| question | Gather required material and answer from evidence. |
| sdd-change | Align user need before spec, plan, cleanup, implementation, and tests. |
| diagnosis | Reproduce or bound the symptom before fixing. |
| review | Gather review evidence and report findings first. |
| delivery | Verify acceptance, PR status when relevant, and residual risks before declaring done. |
| harness-hub-maintenance | Gather source, capability, and lifecycle evidence before changing Harness Hub. |
| clarify | Ask one concise question. |

## Examples

```text
STATE: sdd-change
CONFIDENCE: high
REASON: The user asked to implement a workflow refactor.
OWNER: sdd-workflow
NEXT GATE: Align user need before spec and plan.
HELPERS: product-capability, tdd-workflow, verification-loop
EFFECTIVE_INTERACT: required
```

```text
STATE: review
CONFIDENCE: high
REASON: The user asked whether the plan is risky and did not request edits.
OWNER: review-workflow
NEXT GATE: Gather review evidence and report findings first.
HELPERS: compound-code-review, security-review
EFFECTIVE_INTERACT: default-consider
```
