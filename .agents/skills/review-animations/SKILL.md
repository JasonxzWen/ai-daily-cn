---
name: review-animations
description: Load when existing animation or motion code, a motion diff, or a rendered interaction needs an evidence-backed craft review; report findings only and use code-review for general source review.
license: MIT
metadata:
  source: "emilkowalski/skills skills/review-animations"
  upstream_commit: "7bb7061b5cf7de15ea1aeaf00fbd9e6592a20fce"
  adaptation: "Removed Host metadata and merge-gate posture; findings require product context, evidence, and report-only output."
---

# Reviewing Animations

Review only animation and motion behavior. Report only: do not edit source, install packages, or turn an aesthetic preference into a deterministic failure. Use `code-review` for general source defects and `frontend-design` only after the user separately authorizes implementation.

Read [references/standards.md](references/standards.md) when a finding needs a concrete curve, duration, spring, gesture, performance, or accessibility starting point. Treat those values as craft criteria that require product context and current evidence.

## Evidence Boundary

Inspect the relevant diff, source, rendered interaction, frequency, input mode, motion preferences, and product motion system. Cite `file:line` when source is available; otherwise anchor the finding to a route, component, state, viewport, or recording.

Separate observed behavior from inference. Do not claim dropped frames, compositor behavior, browser support, accessibility conformance, or interaction frequency without evidence. When feel is uncertain, request slow-motion, frame-by-frame, profiling, or real-device verification instead of guessing.

## Review Criteria

Apply only criteria relevant to the interaction. A clue becomes a finding only when evidence connects it to user feedback, continuity, comprehension, efficiency, accessibility, performance, or product cohesion.

1. **Purpose.** Motion should orient, explain state, provide feedback, preserve continuity, or prevent a jarring change.
2. **Frequency.** Repeated and keyboard-driven actions usually need less motion than rare or explanatory moments.
3. **Easing and timing.** Response should begin promptly and settle at a pace appropriate to the element, consequence, and product.
4. **Origin and physicality.** Trigger-anchored surfaces should preserve the spatial relationship to their source; avoid motion that appears to come from nowhere.
5. **Interruptibility.** Rapidly triggered or gesture-driven motion should retarget from its current state without visible jumps.
6. **Property cost.** Investigate layout, paint, style-recalculation, and main-thread work; verify with profiling before making a performance claim.
7. **Accessibility.** Provide a non-vestibular alternative for movement and gate hover-only motion to suitable input modes.
8. **Asymmetry.** Deliberate input and system response may need different timing; symmetry is not automatically wrong.
9. **Cohesion.** Motion should match the component, task, platform, and established product language.
10. **Deletion.** Prefer removing motion that has no supported purpose or whose cost exceeds its value.

## High-Signal Checks

Investigate these when present, but confirm context before reporting:

- `transition: all`, layout-property animation, or broad parent CSS-variable updates;
- `scale(0)`, center-origin trigger surfaces, or pure fades that lose spatial continuity;
- long or delayed response on frequent or keyboard-driven actions;
- keyframes that visibly restart during rapid retriggering;
- missing reduced-motion handling on movement;
- hover motion without pointer/input gating;
- large simultaneous entrances that delay interaction;
- version-sensitive library acceleration claims made without current documentation or profiling.

## Remedial Preference

Recommend the smallest coherent correction:

1. delete motion without a supported purpose;
2. reduce distance, duration, frequency, or animated properties;
3. correct easing, origin, spatial path, or interruption behavior;
4. use the project's existing motion primitives before adding a library;
5. add reduced-motion and appropriate input-mode handling;
6. profile before proposing performance-specific rewrites.

## Required Output

Use one findings table, ordered by impact and confidence:

| Location | Observed | Impact / confidence | Recommendation | Verification |
| --- | --- | --- | --- | --- |
| `file:line` or rendered state | Direct evidence | User consequence and confidence | Smallest contextual correction | Completed result or `Not run — <specific check>` |

After the table, state one of:

- **Evidence-backed motion findings remain**, followed by the highest-risk unresolved check.
- **No evidence-backed motion finding found**, followed by any material evidence gap.

Do not issue a merge approval or block from taste alone. Deterministic tests, accessibility checks, profiling, and project requirements outrank this review.
