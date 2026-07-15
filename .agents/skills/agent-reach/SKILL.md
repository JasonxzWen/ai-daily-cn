---
name: agent-reach
description: Load when a task needs read-only internet research or content retrieval through an already installed Agent Reach CLI; diagnose available backends first, never install, upgrade, authenticate, configure, or copy credentials on the user's behalf.
license: MIT
metadata:
  source: https://github.com/Panniantong/Agent-Reach
  revision: e825f6740d24c6c315c3b0dc41907e6c87ff39a5
---

# Agent Reach

Use Agent Reach only as a router to read-only internet backends that already
exist in the user's environment.

## Availability gate

1. Tell the user that Agent Reach is being checked.
2. Run agent-reach doctor --json.
3. Use only a backend that the returned evidence marks active for the requested
   channel.
4. If the CLI or required backend is unavailable, report the missing user-level
   prerequisite. Do not claim that migration installed or configured it.
5. When another installed project or Host capability already owns the source,
   prefer that narrower capability.

Before invoking an active backend, inspect its local --help output when the
exact read-only command is not already proven by the doctor result. Do not guess
commands, configuration keys, or login state.

## Hard boundaries

- Read and search only. Do not post, comment, like, follow, submit forms, open
  pull requests, or perform any other remote write.
- Do not run Agent Reach install, update, uninstall, configure, login, or
  check-update commands.
- Do not install or upgrade Python, Node.js, GitHub CLI, mcporter, browser
  tooling, platform CLIs, system packages, or MCP servers.
- Do not write ~/.agent-reach, Host global configuration, shell profiles, or
  credential stores.
- Do not copy, export, request, or persist cookies, tokens, browser profiles, QR
  sessions, or other login state.
- Do not weaken sandbox, approval, or repository authorization boundaries.

If an unavailable channel is still required, stop at a concise prerequisite
report: missing component, why it is required, and the user-level action the
user may choose to take outside Harness Hub. Continue with an already available
read-only source only when it can honestly satisfy the request.

## Evidence

In the final answer, distinguish:

- sources actually retrieved;
- channels unavailable or skipped;
- authentication or dependency status reported by doctor;
- any fallback source used instead.

Never infer availability from this Skill being present.
