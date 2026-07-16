---
name: animation-vocabulary
description: Load when a user describes a Web animation or motion effect without knowing its name and needs the precise term or close alternatives; use only for naming, not design, implementation, or review.
license: MIT
metadata:
  source: "emilkowalski/skills skills/animation-vocabulary"
  upstream_commit: "7bb7061b5cf7de15ea1aeaf00fbd9e6592a20fce"
  adaptation: "Progressive disclosure and removal of the upstream project's internal vocabulary-page sync instruction."
---

# Animation Vocabulary

Turn a vague description of a motion or effect into the precise term, so the user knows what to ask for.

## Quick Start

The user describes an effect loosely. You return the matching term(s) in this format:

```
**Stagger** — Animate several items one after another with a small delay between each, creating a cascade.
```

If several terms could fit, list the best match first, then 1–2 alternates with a one-line note on how they differ.

## Instructions

1. **Read for intent, not keywords.** Users describe what they *see* or *feel* ("springy", "slides off", "draws itself in"), not the technical name. Map the sensation to the glossary below.
2. **Quote the glossary verbatim.** Its descriptions are authoritative — use them as-is, don't paraphrase.
3. **Disambiguate close terms.** When two compete (*Clip-path* vs *Mask*, *Pop in* vs *Bounce*, *Shared element transition* vs *Layout animation*), contrast them so the user can pick.
4. **When nothing matches exactly,** name the closest term and say plainly it's an approximation, or describe the effect in the glossary's vocabulary (e.g. "that's a *stagger* of *scale-in* entrances").
5. **Stay within this glossary.** If a term genuinely isn't here, say so rather than inventing one — though you may explain the concept using these words.
6. **Keep it tight.** A naming question wants a name, not an essay. Lead with the term; expand only if asked.

## Examples

**Example 1 — feel-based**
User: "What's it called when a popover seems to grow out of the button you clicked instead of from its middle?"
Output:
```
**Origin-aware animation** — An element animates out of its trigger, like a popover growing from the button that opened it instead of from its own center which is the default in CSS.
```

**Example 2 — disambiguation**
User: "The thing where one image turns into another image."
Output:
```
**Morph** — One shape smoothly turns into another shape, e.g. Dynamic Island.

Close alternates:
- **Crossfade** — if they simply fade over each other in the same spot.
- **Shared element transition** — if an element travels and transforms from one position into another.
```

**Example 3 — physics feel**
User: "That iOS scroll where it resists and snaps back when you pull too far."
Output:
```
**Rubber-banding** — Resistance and snap-back when you drag past a boundary (the iOS overscroll feel).
```

## Glossary

Read [references/glossary.md](references/glossary.md) for the curated terms. Load only the relevant section when the description already narrows the family.
