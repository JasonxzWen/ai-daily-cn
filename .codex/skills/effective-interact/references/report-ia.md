# Report Information Architecture

Use this reference to decide what belongs in an HTML report before choosing
components.

## First Screen

The first screen should answer three questions:

1. What is the current conclusion?
2. What must the reader decide, verify, or continue?
3. What is the first useful structure for doing that?

Keep the hero compact. A normal handoff should show the title, one conclusion,
one small status band when useful, and the first meaningful section before the
reader has to scroll far. Avoid landing-page hero scale for routine reports.

## Information Budget

- Default to Top 3 conclusions. Use Top 4 or Top 5 only when they are all
  distinct and necessary.
- Default navigation budget: overview plus 4-6 primary targets.
- Default body budget for handoffs: 3-5 major sections.
- Put detailed file lists, commands, or source tours behind tables, details, or
  secondary groups when they are audit material rather than decisions.
- Do not repeat the same fact in Top cards, claims, evidence, verification, and
  next actions. Pick the one place where it changes reader behavior.
- Agent-internal acceptance criteria, validation commands, evidence ledgers,
  root next actions, and hero counters stay hidden by default. Show them only
  when the reader must inspect them to decide or continue.

## Section Rules

Use a section only when it adds one of these:

- a decision or recommendation;
- a comparison;
- a sequence, dependency, flow, or ownership map;
- source-linked proof;
- a validation result;
- a risk or boundary;
- an action the reader may take.

Delete a section when it exists only because a previous template had a slot.

## Disclosure

Progressive disclosure is preferred over long pages:

- Put the answer and the first structure up front.
- Fold exhaustive evidence behind data tables, details, tabs, or source rails.
- Keep non-blocking validation details secondary unless they change acceptance.
- Use copy/export blocks only when the reader will actually copy something.
