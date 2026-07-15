# Test Shape

Use tests as executable behavior descriptions.

Prefer:

- integration-style tests through public APIs, CLI commands, component behavior, or user flows
- names that read as capabilities
- assertions on observable outcomes
- setup that mirrors the smallest real use case

Avoid:

- private method tests
- assertions on incidental internal calls
- mocks for collaborators inside the same module boundary
- tests that only check the current file layout or object shape
- tautological assertions where the expected value is recomputed the same way the production code computes it
- verifying through a side channel when the public interface can observe the behavior

If a test would fail after a harmless refactor, it is probably testing implementation rather than behavior.

Expected values should come from an independent source of truth: a known literal, a worked example, fixture, spec, or observed external contract. A test that calculates the expected value by repeating the implementation can pass even when the behavior is wrong.
