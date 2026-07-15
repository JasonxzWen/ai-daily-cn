# Interface Design

TDD works best when tests exercise a deep module: a small interface with meaningful behavior behind it.

Use these checks when a test feels awkward:

- Can callers describe the behavior without knowing the implementation steps?
- Would deleting this module remove complexity or just move it to every caller?
- Is there one real adapter or multiple real adapters? One adapter may mean the seam is hypothetical.
- Does the interface expose decisions that should stay internal?

If tests are hard because behavior is scattered, deepen the module before adding more cases. If tests are hard because the desired behavior is still unclear, use `prototype` or `grill-me` before continuing.
