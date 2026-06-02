# Feynman Session Patterns

Use this reference when a learning session needs more structure than a short explanation.

## Learning Contract Template

Capture this before teaching:

```text
Topic:
Current level:
Target outcome:
Timebox:
Preferred examples:
Non-goals:
First checkpoint:
Log root:
```

If the user is vague, ask only for the missing fields that materially change the path.

## Progressive Ladder

Use these stages in order, skipping only when the user already demonstrates mastery.

1. Name: define the concept in one sentence.
2. Purpose: explain the problem it solves.
3. Mechanism: describe how it works without jargon.
4. Example: walk through a concrete case.
5. Contrast: compare it with a nearby concept or common misconception.
6. Failure: identify where it breaks or gets misused.
7. Transfer: apply it to a new scenario.
8. Teach-back: user explains it as if teaching a beginner.

## Diagnostic Question Types

- Vocabulary: "What does X mean in your own words?"
- Purpose: "What problem does X solve?"
- Mechanism: "What happens first, then next?"
- Contrast: "How is X different from Y?"
- Prediction: "If we change this input, what should happen?"
- Debug: "This explanation is wrong because of one detail. Which one?"
- Transfer: "How would this idea show up in a different domain?"
- Compression: "Explain this in two sentences without jargon."

Ask one question at a time when the answer determines the next step. Use short batches only for final review.

## Teach-Back Rubric

Grade internally before responding:

- 1: repeats terms but cannot explain meaning
- 2: partial explanation with important gaps
- 3: correct core idea, weak example or missing caveat
- 4: clear explanation plus useful example
- 5: clear, simple, transferable explanation with caveats

If the score is below 4, repair one gap and ask for a revised teach-back.

## Answer Pattern

When the user asks a direct question:

1. Give the answer in 3 to 7 sentences.
2. Add one concrete example.
3. Ask one diagnostic or teach-back question.
4. Log the concept or answer if this is part of an active session.

Avoid long lectures. Feynman learning depends on the learner producing explanations, not just consuming them.

## Review Prompt Pattern

Use recent logs to generate review prompts:

```text
Last time you studied: <concept>.
Before we add anything new, explain:
1. What problem does it solve?
2. What is the simplest example?
3. What is one common mistake?
```

If confidence is low, review the same concept with a simpler analogy before moving forward.
