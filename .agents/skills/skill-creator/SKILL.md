---
name: skill-creator
description: "Load when creating, updating, adapting, or evaluating a standard agent skill; do not load for ordinary documentation edits or one-off prompt advice."
license: "Anthropic primary terms in LICENSE.txt; Matt Pocock additions in LICENSE.mattpocock.txt"
metadata:
  source: "anthropics/skills skills/skill-creator"
  upstream_commit: "690f15cac7f7b4c055c5ab109c79ed9259934081"
  additional_source: "mattpocock/skills skills/productivity/writing-great-skills"
  additional_upstream_commit: "e9fcdf95b402d360f90f1db8d776d5dd450f9234"
  additional_license: "MIT; complete terms in LICENSE.mattpocock.txt"
  adaptation: "Platform-neutral Anthropic base with selected Matt Pocock completion, context-load, leading-word, and pruning guidance; host-specific eval scripts and UI metadata are excluded."
---

# Skill Creator

Use this skill to create or improve a standard skill folder with `SKILL.md` plus optional `references/`, `scripts/`, and `assets/`.

## Creation Workflow

1. Define the trigger contract: real user phrases, positive cases, negative cases, and forbidden loads.
2. Decide whether a skill is warranted. Prefer project docs or root instructions when the behavior is broad, obvious, or already covered.
3. Budget context load before choosing invocation. A model-routed description is present in the Host's initial Skill inventory, so each word and each new Skill must earn its recurring cost; side-effect-heavy or rarely used Skills stay explicit-only.
4. Write a concise `description` that front-loads a useful leading word, starts from user intent, includes the nearest dangerous overlap, and avoids workflow internals or duplicate synonyms.
5. Give every ordered step a checkable completion criterion. State the evidence that distinguishes complete from merely attempted, especially where premature completion would be costly.
6. Keep `SKILL.md` short. Move branch-specific examples, schemas, API tables, templates, or scripts behind precise context pointers in spokes.
7. Record source, license, and upstream commit when adapting third-party material.
8. Register the Skill in the install graph only after path, routing, overlap, and risk are clear.
9. Validate with the repository's nearest Skill validator, routing tests, install checks, and the declared completion criteria.

## Quality Gates

- The skill changes agent behavior in a recurring, bounded way.
- The name is lowercase hyphen-case and matches the folder.
- The description is narrow enough to avoid trigger noise.
- The body contains decisions and gotchas, not generic advice.
- Heavy or volatile content uses progressive disclosure.
- Side-effect-heavy workflows are explicit-only until safety boundaries are documented.
- Each meaning has one canonical owner; references point to it instead of restating it.

## Pruning Gate

Run the no-op test on the Skill and then on each sentence: if removing it would not change recurring agent behavior, delete it instead of polishing it. Reject or remove the Skill when project instructions, an existing Skill, or a native Host capability already produces the same behavior.

Split only when a branch has an independently useful trigger or later steps repeatedly cause premature completion. Do not split merely to shorten a file; progressive disclosure is cheaper than another model-routed description.

## Evaluation Story

Before making a skill default-route material, capture at least:

- positive routing cases;
- negative routing cases;
- forbidden-load cases;
- one progressive-loading case for each spoke file that matters;
- one completion check showing the workflow reaches the intended output.

Use the active project's skill-quality rules when they exist.
