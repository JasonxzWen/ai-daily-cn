# Product UI Review Lenses

Use the smallest set that can explain the observed experience. Lenses guide inspection; they are not a mandatory checklist.

## Experience Lenses

### Task model

Can users recognize the primary job, next action, progress, completion, and escape paths? Check whether the interface matches the user's mental model rather than its internal data model.

### Information architecture

Can users predict where things live and distinguish global, local, and contextual navigation? Look for duplicated destinations, hidden scope changes, and labels that reflect implementation rather than intent.

### Content and comprehension

Check labels, instructions, empty states, formatting, terminology, and information order. Prefer language that helps a user decide or act over labels that merely describe a component.

### State and feedback

Inspect loading, empty, success, partial, error, disabled, stale, and destructive states when evidence exposes them. Feedback should explain what happened, whether work was preserved, and what the user can do next.

### Hierarchy and density

Ask whether emphasis follows task importance and whether density supports comparison, scanning, and repeated work. More whitespace is not automatically better for expert or data-heavy products.

### Responsive and input behavior

Check the evidenced viewport and input modes. Look for loss of meaning, unreachable controls, accidental reordering, touch-target problems, and interactions that depend on hover or pointer precision.

### Accessibility

Use only evidence that can be inspected: semantics, labels, focus behavior, keyboard reachability, contrast, zoom, motion, and announcements. Do not claim conformance from appearance or source fragments alone.

### Performance feedback

Separate measured performance from perceived waiting. Review whether the interface acknowledges actions, preserves context, prevents duplicate work, and gives useful progress without fabricating timing data.

### Trust and safety

Inspect permissions, destructive actions, privacy cues, irreversible consequences, sensitive data, and recovery. Strong warnings should be proportional and should not replace safer defaults or undo paths.

## Confidence

- **High**: direct, reproducible evidence supports both the observation and its consequence.
- **Medium**: the observation is direct, but impact or cause depends on a reasonable inference.
- **Low**: limited evidence exposes a plausible risk that needs targeted verification.

Lower confidence instead of overstating missing user research, analytics, browser coverage, or hidden product states.

## Visual Pattern Discipline

Style match is not a finding. Compare contextual intent before treating a familiar pattern as a problem:

| Pattern | Unintentional default | Intentional use |
| --- | --- | --- |
| Gradient | A generic wash competes with content without encoding priority. | A brand transition or state range carries a defined meaning. |
| Badge | Every item receives a pill, so no state is distinguishable. | A rare exception or operational status needs compact emphasis. |
| Serif | A decorative swap weakens scanning in repeated product tasks. | Display text expresses an established editorial or brand voice. |
| Terminal | A faux console decorates an audience that never uses commands. | Commands, logs, or monospaced values are part of the real task. |

Rounded cards, glass effects, or sparse layouts follow the same rule. They matter only when their use creates an evidenced problem such as weak hierarchy, misleading affordance, reduced legibility, wasted density, inconsistent meaning, or brand mismatch.

Likewise, visual novelty is not a proxy for quality. State what already works before recommending a change, and prefer a system-level correction over replacing isolated surface details.
