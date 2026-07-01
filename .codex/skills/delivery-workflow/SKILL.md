---
name: delivery-workflow
description: Load when workflow-router selects the delivery state for accepted validation closeout, PR status triage, cleanup, handoff, release notes, environment reset, or reporting; do not start new scope.
---

# Delivery Workflow

Use this owner after work has been accepted or implemented and needs closure.

## Workflow

1. Confirm the accepted scope and delivery target.
2. Clean only approved or owned local artifacts; preserve unrelated user edits.
3. Run agreed validation commands and acceptance checks.
4. Record failures, skipped checks, and residual risk honestly.
5. Run finish closeout for material work before final handoff: use a subagent or independent review pass when scope-safe to inspect technical debt, first-principles implementation fit, project-rule drift, and refactor or warning recommendations.
6. If a PR was created or updated, check remote PR state after push: mergeability, CI/check runs, conflicts, and branch protection blockers.
7. Resolve actionable PR blockers in scope, rerun relevant validation, and push updates; expose conflict decisions and risk to the user instead of handling them silently. Stop only for user decisions, credentials, permissions, reviewer action, protected-branch overrides, or external outages.
8. Run or explicitly skip `insight` for material sessions. Use it to audit tool-calling quality, repeated low-value lookup loops, misleading evidence, code/docs conflicts, AI infrastructure improvements, and whether the workflow should become a skill, source record, eval case, or existing workflow change.
9. Report the PR URL or number, branch, target base, commit, validation status, skipped checks, final review outcome, insight recommendations, PR blockers, fixes pushed, residual risk, and next action.
10. Produce release notes, handoff, or environment cleanup notes as requested.
11. Use `effective-interact` for material handoffs with changes, evidence, validation, cleanup, PR status, final review, insight recommendations, and next actions.

## Agentic Loops

Use agentic loops from `workflow-router/references/agentic-loops.md` during delivery when they lower acceptance risk:

- `frontend-acceptance`: a fresh-context verifier gathers browser/user-flow evidence, then a read-only arbiter judges the original task, acceptance criteria, current evidence, and residual risk.
- `implementation-review`: parallel read-only review lenses inspect correctness, maintainability, tests, security, performance, and harness compliance when relevant.
- `docs-consistency`: a documentation/code verifier compares changed docs, installable templates, tests, and implementation; a read-only arbiter reports drift, accepted exceptions, or required fixes.
- `pr-closeout`: a PR status verifier gathers mergeability, CI/check-run, conflict, and branch-protection evidence; a release-risk arbiter decides which blockers are in-scope and which require user interrupt.
- `insight-retro`: `insight` produces trace evidence; a workflow-learning arbiter recommends rule, eval, source-record, skill, or no-op outcomes.

Record loop evidence in progress and handoff state. Verifiers may be `delegated-agent` passes or deterministic checks. Record `iteration`, `maxIterations`, and a stop condition when a loop may repeat. Arbiters remain read-only; the main agent owns synthesis, fixes, and final user-facing decisions.

## Helper Atoms

- Use `internal-comms` for accepted internal announcements, status updates, incident follow-ups, or FAQs.
- Use `doc-coauthoring` for final PRDs, decision records, or handoff docs that need reader testing.
- Use `theme-factory` only when a delivered artifact needs a final visual theme pass.
- Use `insight` for private closeout audits of repository interaction traces and tool-call decisions.

## Boundaries

- Do not start new feature work.
- Do not hide failed or skipped verification.
- Do not push, publish, merge, post, or mutate third-party resources unless the user explicitly asks; PR status checks are read-only, while PR updates require the user's requested delivery scope.
- Do not merge a pull request unless the user explicitly asks for that remote mutation.
- Do not mark a PR ready, resolve review threads, or reply on the remote unless the user explicitly asks.
- Do not silently resolve conflicts that change behavior, ownership, compatibility, release risk, or user-visible semantics; surface the decision and recommendation first.
- Use lock-backed ownership for Harness Hub managed cleanup.
- Follow `workflow-router/references/orchestration-policy.md` for any subagent verification or advisory hook checks; the main agent owns the final handoff.
