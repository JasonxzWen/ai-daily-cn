---
name: skill-creator
description: "Load when creating, updating, adapting, or evaluating a standard agent skill; do not load for ordinary documentation edits or one-off prompt advice."
license: Complete terms in LICENSE.txt
metadata:
  source: "anthropics/skills skills/skill-creator"
  upstream_commit: "690f15cac7f7b4c055c5ab109c79ed9259934081"
  adaptation: "Platform-neutral Harness Hub version; host-specific eval scripts and UI metadata are excluded."
---

# Skill Creator

Use this skill to create or improve a standard skill folder with `SKILL.md` plus optional `references/`, `scripts/`, and `assets/`.

## Creation Workflow

1. Define the trigger contract: real user phrases, positive cases, negative cases, and forbidden loads.
2. Decide whether a skill is warranted. Prefer project docs or root instructions when the behavior is broad, obvious, or already covered.
3. Write a concise `description` that starts from user intent, includes the nearest dangerous overlap, and avoids workflow internals.
4. Keep `SKILL.md` short. Move heavy examples, schemas, API tables, templates, or scripts into spokes.
5. Record source, license, and upstream commit when adapting third-party material.
6. Register the skill in the install graph only after path, routing, overlap, and risk are clear.
7. Validate with the repository's nearest skill validator, routing tests, and install checks.

## Quality Gates

- The skill changes agent behavior in a recurring, bounded way.
- The name is lowercase hyphen-case and matches the folder.
- The description is narrow enough to avoid trigger noise.
- The body contains decisions and gotchas, not generic advice.
- Heavy or volatile content uses progressive disclosure.
- Side-effect-heavy workflows are explicit-only until safety boundaries are documented.

## Evaluation Story

Before making a skill default-route material, capture at least:

- positive routing cases;
- negative routing cases;
- forbidden-load cases;
- one progressive-loading case for each spoke file that matters;
- one completion check showing the workflow reaches the intended output.

Use `docs/skill-quality-guide.md` when working inside Harness Hub.
