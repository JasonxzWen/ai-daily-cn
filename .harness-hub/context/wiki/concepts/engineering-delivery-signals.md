# Engineering Delivery Signals

Status: active

## Summary

PR delivery for this repository should treat validation, PR status, GitHub security findings, and generated artifact repair as separate gates. The durable rule is to fix the source of reproducible failures, verify with deterministic local checks, then rely on remote PR state only after mergeability and checks are confirmed.

## Source References

- `AGENTS.md`: defines PR closeout, merge authorization, harness validation, and wiki update rules.
- `.harness-hub/state/progress.md`: records the initial public-copy replay failure, source-level fallback repair, and the fresh-worktree `pnpm` race signal.
- `scripts/check-public-copy-replay.mjs`: owns the public-copy replay gate and the CodeQL-driven HTML parsing hardening.
- `tests/public-copy-replay.test.js`: covers real-style replay failures and loose `script` / `style` end tags.
- `https://github.com/JasonxzWen/ai-daily-cn/pull/262`: confirms the PR delivery path, CodeQL blocker, fix, green checks, and merge.

## Durable Knowledge

- Public generated artifact repairs are not complete until the generation source is checked. If `build:check-clean` regenerates the bad copy, fix the source first and then regenerate artifacts.
- Do not run multiple `corepack pnpm` commands in parallel on a fresh worktree. Dependency installation and symlink creation can race with `EEXIST` or `EBUSY`; run validation commands sequentially when installation may occur.
- Treat GitHub Advanced Security's aggregate `CodeQL` check as a real blocker when it has annotations, even if the language-specific `Analyze (...)` jobs pass.
- For public-copy replay over HTML, avoid regex-only `script` / `style` stripping and chained entity decoding. Prefer a bounded parser-style removal for raw text element blocks and a single-pass entity map, with tests for loose end tags such as `</script >`.
- A process-level `GH_TOKEN` can shadow GitHub CLI keyring credentials and still lack PR or merge GraphQL permissions. If `gh` reports `Resource not accessible by personal access token`, use the approved GitHub connector when available, and do not report PR creation or merge success until the connector/API confirms it.

## Boundaries

- This page does not record active PR state, current blockers, or validation timestamps; those belong in `.harness-hub/state/`.
- This page does not replace source code, tests, or GitHub checks as authority.
- This page does not authorize remote mutations by itself; user authorization and AGENTS rules still apply.

## Related Pages

- [Index](../index.md)

## Contradictions

- None known.
