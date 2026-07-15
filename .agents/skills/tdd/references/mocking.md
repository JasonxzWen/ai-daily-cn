# Mocking

Mocking is a seam decision.

Mock when:

- the dependency is outside the process or not owned by the repo
- the dependency is slow, flaky, paid, credentialed, or destructive
- the project already has a stable test double at that boundary

Do not mock internal collaborators just to make a test easier to write. That usually proves wiring, not behavior.

When a test needs many mocks, treat that as design feedback: the public interface may be too shallow or the behavior may be spread across too many modules.

At external boundaries, prefer specific adapter methods over one generic fetcher with conditional mock logic. A small SDK-style interface such as `getUser`, `getOrders`, and `createOrder` is easier to mock honestly than a single `fetch(endpoint, options)` wrapper that makes each test reimplement routing rules.
