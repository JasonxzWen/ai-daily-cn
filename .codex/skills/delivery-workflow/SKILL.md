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
5. If a PR was created or updated, check remote PR state after push: mergeability, CI/check runs, conflicts, and branch protection blockers.
6. Resolve actionable PR blockers in scope, rerun relevant validation, and push updates; stop only for user decisions, credentials, permissions, reviewer action, protected-branch overrides, or external outages.
7. Report the PR URL or number, branch, target base, commit, validation status, skipped checks, PR blockers, fixes pushed, residual risk, and next action.
8. Produce release notes, handoff, or environment cleanup notes as requested.
9. Use `effective-interact` for material handoffs with changes, evidence, validation, cleanup, PR status, and next actions.

## Helper Atoms

- Use `internal-comms` for accepted internal announcements, status updates, incident follow-ups, or FAQs.
- Use `doc-coauthoring` for final PRDs, decision records, or handoff docs that need reader testing.
- Use `theme-factory` only when a delivered artifact needs a final visual theme pass.

## Boundaries

- Do not start new feature work.
- Do not hide failed or skipped verification.
- Do not push, publish, merge, post, or mutate third-party resources unless the user explicitly asks; PR status checks are read-only, while PR updates require the user's requested delivery scope.
- Do not merge a pull request unless the user explicitly asks for that remote mutation.
- Do not mark a PR ready, resolve review threads, or reply on the remote unless the user explicitly asks.
- Use lock-backed ownership for Harness Hub managed cleanup.
- Follow `workflow-router/references/orchestration-policy.md` for any subagent verification or advisory hook checks; the main agent owns the final handoff.
