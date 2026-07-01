---
name: grill-me
description: Load when a workflow-router-selected owner workflow needs cases where the user says grill me, asks to be challenged, or wants assumptions surfaced through a one-question-at-a-time interview; do not use for routine implementation.
license: MIT
metadata:
  source: "mattpocock/skills skills/productivity/grill-me"
  upstream_commit: "9fecab929abb904c68ce3366a1781df31ab22832"
---

# Grill Me

## Purpose

Use this skill to turn a vague plan, design, product idea, or implementation approach into a sharper decision set before any code or artifact work starts.

The goal is shared understanding, not a long questionnaire. Ask one high-leverage question at a time, explain why it matters, and include your recommended answer so the user can accept, reject, or refine it quickly.

## When To Use

Use this skill when the user:

- says "grill me" or asks to be grilled
- asks you to challenge, pressure-test, sanity-check, or poke holes in a plan
- has a design with unclear tradeoffs, dependencies, scope, or success criteria
- wants assumptions surfaced before committing to implementation

Do not use this skill when:

- the user already gave clear implementation instructions and wants execution
- a normal brainstorming session is enough
- the next step is producing an implementation-ready capability plan; use `product-capability`
- the user asks for a code review; use the normal review posture or `verification-loop`

## Workflow

1. Restate the current plan in two or three sentences.
2. List the assumptions you are about to test.
3. If a question can be answered by inspecting the repository, inspect the repository first instead of asking the user.
4. Ask exactly one question.
5. For that question, include:
   - why this decision matters
   - your recommended answer
   - the main tradeoff or alternative
6. Wait for the user's answer before asking the next question.
7. Update your understanding after each answer and follow the next unresolved branch of the decision tree.

## Question Style

Prefer questions that force a decision:

- "Should this optimize for first-use clarity or repeat-use speed?"
- "Is this state authoritative, derived, or cached?"
- "What is the smallest version that would prove the design works?"
- "Which failure mode is acceptable, and which one is not?"

Avoid vague prompts:

- "Can you tell me more?"
- "What are your thoughts?"
- "Any preferences?"

## Stopping Rule

Stop grilling when the remaining uncertainty no longer changes the next action. Then summarize:

- decisions made
- assumptions still open
- recommended next step
- verification criteria for the next step

Do not start implementation unless the user explicitly asks you to continue into execution.
