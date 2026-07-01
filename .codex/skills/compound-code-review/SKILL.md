---
name: compound-code-review
description: "Load when a workflow-router-selected owner workflow needs Compound Engineering-inspired code review for deep pre-PR, CE-style, or multi-perspective review with structured findings, lenses, confidence, and fix routing; skip ordinary verification."
license: MIT
metadata:
  source: "EveryInc/compound-engineering-plugin plugins/compound-engineering/skills/ce-code-review"
  upstream_commit: "d090bde0ff1bbc33ec3c3b2049cb4687e9d76532"
  upstream_plugin_version: "3.8.0"
---

# Compound Code Review

This is a narrow skill adaptation of `ce-code-review` from `EveryInc/compound-engineering-plugin`.

It preserves the useful review contract: reviewer lenses, evidence-backed findings, anchored confidence, severity grouping, and action routing. It deliberately omits the rest of the Compound Engineering plugin surface.

## Scope

Use this skill for deep code review before a PR or before declaring a change ready.

Do not use it for:

- normal final command gates; use `verification-loop`
- focused security-only checks; use `security-review`
- UI/accessibility audits; use `web-design-guidelines` only when that helper is relevant and available
- addressing GitHub review threads; this skill reports findings only
- committing, pushing, opening PRs, filing issues, or replying on external systems

## Modes

Default mode is report-only.

Accepted argument tokens:

| Token | Behavior |
|---|---|
| `mode:report-only` | Read-only review. This is the default. |
| `mode:autofix` | Apply only local, mechanical `safe_auto` fixes after the review. Never commit or push. |
| `base:<ref>` | Review current checkout against the provided base ref. |
| `plan:<path>` | Use a plan or requirements file as intent context. |

Do not commit, push, create a pull request, file issues, or change external resources from this skill. If the user wants follow-up action, stop after the review and let the normal git or PR workflow handle it.

## Workflow

### 1. Resolve Review Scope

Prefer an explicit `base:<ref>`. If absent, infer the merge base from the current branch and its upstream/default branch. If no credible base can be resolved, stop and ask for a base ref instead of reviewing an empty or ambiguous diff.

Collect:

- changed files
- unified diff with enough context
- untracked files relevant to the change
- optional plan or requirements context
- relevant project instructions such as `AGENTS.md`

Do not switch the shared checkout to another branch or PR. If the target is not already checked out, ask the user to run the review in an isolated checkout or provide `base:<ref>` for the current tree.

### 2. Select Reviewer Lenses

Read `references/persona-catalog.md`.

Always apply the core lenses:

- correctness
- testing
- maintainability
- project standards

Add conditional lenses only when the diff justifies them: security, performance, API contract, data migration, reliability, frontend races, language-specific review, or agent-native access.

When the user explicitly asks for multi-agent or parallel review and the platform supports it, split independent read-only lenses into sub-agents. Otherwise run the same lenses locally in sequence. Every lens uses the same findings schema.

### 3. Produce Structured Findings

Read `references/findings-schema.json`.

For each finding, record:

- severity: `P0`, `P1`, `P2`, or `P3`
- file and line
- concise title
- why it matters
- evidence from the diff or surrounding code
- confidence: one of `0`, `25`, `50`, `75`, `100`
- route: `safe_auto`, `gated_auto`, `manual`, or `advisory`
- owner: `review-fixer`, `downstream-resolver`, `human`, or `release`
- whether verification is required

Suppress findings below confidence `75`, except `P0` findings may survive at confidence `50` when the failure mode is critical and clearly named. Mark pre-existing issues separately; do not present them as current-diff blockers.

### 4. Route Findings

Use this routing taxonomy:

| Route | Meaning |
|---|---|
| `safe_auto -> review-fixer` | Local, deterministic fix that does not change public contracts, permissions, security posture, or intended behavior. |
| `gated_auto -> downstream-resolver` | Concrete fix exists, but it changes behavior, contracts, permissions, or other sensitive boundaries. |
| `manual -> downstream-resolver` | Actionable work requires design, product, or cross-module judgment. |
| `advisory -> human` | Useful observation, residual risk, or release note; no code change is implied. |

In `mode:autofix`, apply only `safe_auto -> review-fixer` fixes. Run targeted verification for each applied fix. Leave all other routes in the report as residual work.

### 5. Present The Report

Read `references/review-output-template.md`.

Sort by severity, then confidence, then file path. Assign stable finding numbers once and reuse those numbers in residual-work sections. Include reviewer lenses used and why conditional lenses were selected.

End with a clear verdict:

- `Ready`
- `Ready with fixes`
- `Not ready`

State the highest-signal next action. Do not include broad cleanup or speculative refactors unless they are directly tied to a finding.

## Source Notes

This skill is adapted from the MIT-licensed Compound Engineering `ce-code-review` workflow. The adaptation keeps the review model and structured contracts while replacing the full plugin's custom agent dependency with agent-compatible reviewer lenses and a read-only default.
