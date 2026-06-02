# Coding Standards Review Checklist

Use this reference when `SKILL.md` identifies a cross-project code quality review and you need a compact checklist before inspecting files.

- Prefer clear names, short functions, and explicit data shapes.
- Keep implementation simple; avoid speculative abstractions and unused flexibility.
- Use immutable updates unless a local mutation is intentional and documented.
- Validate inputs at trust boundaries and return predictable error shapes.
- Keep comments focused on why a decision exists, not what each line does.
- Add behavior-focused tests for changed public behavior and regression cases.
- Route framework-specific frontend concerns to `frontend-patterns`.
- Route security-sensitive auth, secrets, payment, or injection concerns to `security-review`.
