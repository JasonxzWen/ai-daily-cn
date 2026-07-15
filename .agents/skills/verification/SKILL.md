---
name: verification
description: Load when claiming completion requires the repository's actual deterministic build, type, lint, test, diff, smoke, and artifact gates; use diagnose while a failure's root cause is unknown.
license: MIT
---

# Verification

Verification is evidence collection, not a generic command recipe or a verdict generator.

## Discover The Gates

Discover the project's actual gates from repository instructions, package/task manifests, CI configuration, existing scripts, and nearby tests. Do not invent commands, coverage thresholds, or required tools. Prefer the same entry points maintainers and CI already use.

Classify checks by the accepted task boundary:

- targeted behavior tests for the changed surface
- nearest relevant suite
- build, type, lint, format, schema, or generated-artifact checks
- broader repository validation when blast radius warrants it
- smoke or manual checks that prove the real user path
- Git diff/status checks for unintended files and whitespace errors

Run independent read-only checks in parallel only when they do not compete for mutable artifacts.

## Execute And Record

For every applicable gate, record:

- exact command or reproducible manual procedure
- exit status and concise result
- scope covered
- whether evidence is fresh for the current checkout

Report a required gate that cannot run as `unavailable or unknown`, with the missing dependency or access. Do not translate absence of evidence into a pass.

Deterministic failures cannot be waived by Agent judgment. If the root cause is unclear, use `diagnose`; if a confirmed code behavior needs a test-led fix, use `tdd`. Re-run affected gates after any mutation.

## Artifact And Diff Checks

Inspect produced artifacts when correctness depends on rendering, packaging, generated files, migrations, or browser behavior. A successful command is not evidence that the artifact itself is usable.

Before completion, review current Git status and diff for:

- unintended or missing changes
- stale generated output
- accidental credentials or project-specific data
- incomplete renames and stale references
- whitespace errors

## Handoff

Return the smallest truthful verification table:

| Gate | Evidence | Result |
|---|---|---|
| Project-defined check | Exact command/procedure and scope | pass / fail / unavailable or unknown |

State residual risk and the highest-signal next action. Do not commit, push, publish, merge, or modify remote state merely because verification passed.
