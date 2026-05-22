# Review Output Template

Use this structure for the final report.

```markdown
## Compound Code Review

**Scope:** <base ref> -> current checkout (<N> files, <M> changed lines)
**Mode:** report-only
**Intent:** <one-line inferred intent, or "not provided">
**Reviewer lenses:** correctness, testing, maintainability, project-standards
- security: selected because <reason>
- api-contract: selected because <reason>

### P0 - Critical

| # | File | Issue | Reviewer | Confidence | Route |
|---|---|---|---|---:|---|
| 1 | `src/example.ts:42` | Missing authorization on export path | security | 100 | `gated_auto -> downstream-resolver` |

### P1 - High

| # | File | Issue | Reviewer | Confidence | Route |
|---|---|---|---|---:|---|
| 2 | `src/export.ts:87` | Loads unbounded result set into memory | performance | 75 | `safe_auto -> review-fixer` |

### Applied Fixes

- `safe_auto`: <only include when mode:autofix applied local fixes>

### Residual Actionable Work

| # | File | Issue | Route | Next Step |
|---|---|---|---|---|
| 1 | `src/example.ts:42` | Missing authorization on export path | `gated_auto -> downstream-resolver` | Requires explicit behavior decision before changing permissions |

### Pre-existing Issues

| File | Issue | Reviewer |
|---|---|---|
| `src/legacy.ts:12` | Existing broad rescue masks unrelated errors | correctness |

### Coverage

- Suppressed: <count> findings below confidence threshold
- Residual risks: <short list, or "none">
- Testing gaps: <short list, or "none">

---

> **Verdict:** Not ready
>
> **Reasoning:** <why the verdict follows from the highest-severity findings>
>
> **Fix order:** <ordered next steps>
```

## Formatting Rules

- Group primary findings by severity: `P0`, `P1`, `P2`, `P3`. Omit empty groups.
- Use pipe-delimited Markdown tables.
- Escape literal `|` characters inside table cells as `\|`.
- Assign stable finding numbers once. Do not restart numbering inside each severity group.
- Always include file and line for current-diff findings.
- Put pre-existing issues in their own section and do not mix them with blockers.
- Include `Applied Fixes` only when fixes were actually applied.
- Include `Residual Actionable Work` only for unresolved actionable findings.
- End with a verdict blockquote.
