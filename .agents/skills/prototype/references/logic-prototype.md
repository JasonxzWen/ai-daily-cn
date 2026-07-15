# Logic Prototype

Use a logic prototype when the question is about behavior rather than appearance.

Good fits:

- state machine edge cases
- lifecycle transitions
- data shape decisions
- command flow
- public interface feel

Process:

1. State the question in a README or top comment.
2. Use the host project's language and task runner.
3. Put the actual logic behind a pure interface.
4. Build a thin terminal shell that drives the logic.
5. Re-render or print the relevant state after each action.
6. Give the user one command to run.
7. Capture what the prototype proved.

The terminal shell should redraw a stable one-screen frame when possible: current state first, then available actions or keyboard shortcuts. Keep the logic module free of terminal I/O so the validated reducer, state machine, function set, or state-owning module can be lifted into production later.

Anti-patterns:

- adding tests for the prototype shell
- wiring to a real production database
- mixing terminal code into the reusable logic
- adding a new runtime or package manager just for the prototype
- leaving the throwaway shell in the repo after the decision is made
