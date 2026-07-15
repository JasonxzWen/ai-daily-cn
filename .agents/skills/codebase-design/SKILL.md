---
name: codebase-design
description: Load when a change needs module-boundary, dependency-direction, interface-depth, or architecture simplification decisions; do not use for routine style or formatting rules.
license: MIT
metadata:
  source: "mattpocock/skills skills/engineering/codebase-design"
  upstream_commit: "e9fcdf95b402d360f90f1db8d776d5dd450f9234"
---

# Codebase Design

Use this Skill to improve the shape of code, not to impose generic language style. Prefer the smallest design that makes the current behavior easy to understand, test, replace, and delete.

## Start From Pressure

Name the concrete pressure before proposing structure:

- which behavior is hard to change or test
- which dependency leaks across boundaries
- which concept has more than one competing owner
- which repeated call pattern proves an interface is missing

Do not redesign a module because a textbook pattern could fit. Use `ponytail` to challenge speculative seams and entity growth.

## Seek Deep Modules

A deep module offers a small, stable interface while hiding meaningful complexity. Move volatile policy, integration quirks, and invariants behind the narrowest owner that can enforce them. Avoid shallow wrappers that merely rename another call or spread one operation across extra files.

Prefer:

- one canonical owner for each durable rule
- dependencies that point toward stable domain behavior
- explicit inputs, outputs, errors, and side effects
- public seams that support behavior tests
- direct control flow when only one implementation exists

## Prove An Abstraction

One adapter means a hypothetical seam; two adapters make it real. Before adding an interface, registry, factory, plugin point, or compatibility layer, show the second concrete use or an unavoidable external boundary.

Apply the deletion test: if the new entity disappeared, would required behavior or a real boundary become harder to express? If not, delete it or inline it.

Duplication is cheaper than the wrong shared abstraction when examples do not yet agree. Extract only the stable part demonstrated by current callers.

## Review A Proposed Shape

For each new or changed module, answer:

1. What rule or volatility does it own?
2. Why is the existing owner insufficient?
3. Which dependencies become simpler or disappear?
4. What public behavior test crosses this seam?
5. What is the smallest alternative?
6. Can an entity, branch, option, or file be removed now?

Return a concise recommendation, rejected alternatives, and the evidence that makes the chosen boundary real. Do not create architecture documents, new frameworks, or broad refactors unless the task explicitly requires them.
