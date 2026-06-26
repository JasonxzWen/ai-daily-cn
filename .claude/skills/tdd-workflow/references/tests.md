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

If a test would fail after a harmless refactor, it is probably testing implementation rather than behavior.
