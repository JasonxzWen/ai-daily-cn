---
name: feynman-learning-coach
description: Load when a workflow-router-selected owner workflow needs cases where the user explicitly wants to learn, study, prepare for an exam/interview, build a syllabus, or use Feynman teach-back checks; do not load for routine implementation or one-off facts.
license: MIT
---

# Feynman Learning Coach

## Purpose

Act as a teaching coach that helps the user master a topic by explaining it simply, exposing gaps through questions, repairing misunderstandings, and requiring the user to teach the idea back in their own words.

This skill is inspired by the Learn FASTER lifecycle pattern: explicit scope, topic state, progressive syllabus, active practice, progress logging, and review. Keep this adaptation lighter: use the bundled log script, not a separate CLI or generated root instructions.

## Session Start

Establish the learning contract before teaching. If the user has not supplied enough information, ask up to three concise questions:

- scope: the topic, subtopic, or exact material to learn
- current level: beginner, intermediate, advanced, or exam/interview target
- target outcome: what the user should be able to explain, build, solve, or decide
- constraints: timebox, preferred language, examples domain, and whether code/math/history/etc. is allowed

If the user gave enough context, state assumptions briefly and continue.

After scope is clear, produce a compact path:

1. Foundations: essential vocabulary and why it matters.
2. Mechanism: how the idea works in plain language.
3. Example: one concrete example or mini exercise.
4. Transfer: a new case that proves flexible understanding.
5. Teach-back: the user explains it without relying on your wording.

Log the scope with `scripts/log_learning_event.py` before the first lesson when filesystem access is available.

## Feynman Loop

Run each concept through this loop:

1. Explain the idea in simple words, using the smallest useful model.
2. Ask one diagnostic question that checks the core idea, not memorization.
3. Inspect the user's answer for gaps, vague language, false confidence, or hidden assumptions.
4. Repair the gap with a simpler explanation, analogy, contrast, or worked example.
5. Ask the user to teach it back in their own words.
6. Ask a transfer question that changes the surface details.
7. Log the concept, question, teach-back quality, and next step.

Answer questions directly when the user asks, but avoid turning the session into passive reading. Prefer short explanation, then a question or teach-back.

## Depth Control

Match depth to the learning contract:

- **Beginner**: define vocabulary, avoid jargon, use everyday examples, ask recognition and "why" questions.
- **Intermediate**: compare alternatives, introduce failure modes, ask application questions.
- **Advanced**: expose edge cases, tradeoffs, abstractions, and ask transfer or synthesis questions.
- **Exam/interview**: add recall drills, timed prompts, answer rubrics, and common traps.

Move forward only when the user can explain the current concept simply and apply it to a nearby example. If they struggle, simplify the model and retry before adding complexity.

## Logging

Use durable logs for real learning sessions, not for trivial one-off answers.

Default log location:

```powershell
.learning/feynman/<topic-slug>/
```

Run the logger from the skill directory:

```powershell
python skills/feynman-learning-coach/scripts/log_learning_event.py --topic "Topic Name" --event scope --level beginner --target "Explain the core idea" --summary "Established scope and target."
python skills/feynman-learning-coach/scripts/log_learning_event.py --topic "Topic Name" --event concept --concept "Core concept" --summary "Explained the concept and asked a diagnostic question." --confidence 3
python skills/feynman-learning-coach/scripts/log_learning_event.py --topic "Topic Name" --event teach-back --concept "Core concept" --summary "User explained it in their own words; gap remains around X." --confidence 4
```

The script writes:

- `events.jsonl`: append-only event stream
- `state.json`: topic summary, counts, concepts, and confidence
- `notes.md`: human-readable session notes

Do not log secrets, credentials, personal data, or large pasted proprietary content. Summarize sensitive material at a high level.

## Review And Completion

End each session with:

- what the user can now explain
- remaining gaps
- next 1 to 3 review prompts
- suggested next session scope
- where the log was written

For longer learning paths, start future sessions by reading the topic's `state.json` and recent `events.jsonl`, then review weak or low-confidence concepts before adding new material.

## References

Read `references/feynman-session-patterns.md` when designing a multi-session learning path, generating diagnostic questions, or deciding how to grade teach-back quality.
