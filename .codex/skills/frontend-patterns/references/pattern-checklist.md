# Frontend Pattern Checklist

Use this reference when `SKILL.md` routes implementation into broad React or Next.js frontend engineering patterns.

- Prefer component composition over inheritance and avoid prop bags that hide contracts.
- Extract custom hooks only when stateful behavior is reused or clarified by a named boundary.
- Keep server/client boundaries explicit in Next.js and avoid leaking secrets to the browser.
- Use reducers or external state stores only when local state stops being understandable.
- Validate forms near input boundaries and keep error rendering accessible.
- Memoize only expensive computations or stable callbacks passed to memoized children.
- Split heavy UI with lazy loading when it improves initial load or interaction latency.
- Preserve keyboard navigation, focus management, ARIA semantics, and responsive layout constraints.
- Route polished visual direction to `frontend-design`.
- Route one-off browser verification to `webapp-testing` and durable suites to `e2e-testing`.
