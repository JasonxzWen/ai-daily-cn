---
name: apple-design
description: Load when a frontend task needs Apple-platform design guidance or physical, gesture-driven, velocity-aware, interruptible interaction; skip generic visual styling and use review-animations for report-only motion review.
license: MIT
metadata:
  source: "emilkowalski/skills skills/apple-design"
  upstream_commit: "7bb7061b5cf7de15ea1aeaf00fbd9e6592a20fce"
  adaptation: "Narrow routing and progressive disclosure; volatile API and browser claims require current evidence."
---

# Apple Design

Use Apple interface principles when the platform context or interaction genuinely benefits from direct manipulation, velocity continuity, interruptibility, spatial consistency, or physical feedback. Do not apply Apple visual styling by default.

Read [references/interface-principles.md](references/interface-principles.md) when designing or implementing gesture-driven UI, springs, drag or sheet interactions, momentum, translucent materials, typography, or accessibility adaptations.

## Core Contract

- Start feedback at the causal input and keep direct manipulation continuous.
- Animate from the current presentation value and preserve velocity when an interaction is interrupted.
- Project momentum before choosing a snap target; resist softly at boundaries.
- Preserve spatial origin, reversible paths, user agency, and reduced-motion alternatives.
- Match the product's existing design system and interaction language before importing a platform convention.
- Reference examples do not authorize dependency additions; prefer existing project primitives and evaluate any new package under the task's normal dependency policy.
- Verify current browser and animation-library behavior before relying on version-sensitive API or performance claims.

## Boundaries

This Skill owns Apple and physical-interaction guidance. It does not own general frontend styling, animation terminology, or review verdicts. Use `frontend-design` for production UI, `animation-vocabulary` for naming, and `review-animations` for report-only motion review.
