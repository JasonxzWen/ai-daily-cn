---
name: claude-api
description: Load when a workflow-router-selected owner workflow needs Claude API or Anthropic SDK build, debug, migration, or tuning work; skip provider-neutral, OpenAI, or non-Anthropic model work.
license: Complete terms in LICENSE.txt
metadata:
  source: "anthropics/skills skills/claude-api"
  upstream_commit: "690f15cac7f7b4c055c5ab109c79ed9259934081"
  adaptation: "Slim platform-neutral routing and source lookup; volatile API tables are not copied."
---

# Claude API

Use this skill for provider-specific Claude API and Anthropic SDK work. Keep it explicit: if the target file is provider-neutral or already uses another provider, stop and ask whether the user wants an Anthropic-specific implementation.

## Workflow

1. Detect the project language, runtime, and existing SDK usage.
2. Read `references/live-sources.md`, then verify current Anthropic docs or SDK source before relying on API names, model IDs, headers, beta flags, or migration details that may have changed.
3. Prefer the official Anthropic SDK for the project language. Use raw HTTP only when the user asks for REST/cURL or no suitable SDK exists.
4. Keep secrets in environment variables or the target repo's existing secret manager. Never place API keys, tokens, or credentials in prompts, committed files, examples, or logs.
5. Preserve existing provider boundaries. Do not introduce Anthropic SDK calls into OpenAI, generic, or multi-provider files unless the accepted change is to add an Anthropic lane.
6. Run the nearest compile, typecheck, unit, or smoke check after changing code.

## Implementation Checks

- Confirm exact package names, imports, client constructors, method names, request fields, streaming helpers, and response shapes from current docs or SDK source.
- Treat model names, pricing, context windows, rate limits, prompt caching behavior, and migration guidance as live facts.
- Make cost, latency, timeout, and retry tradeoffs explicit when changing generation behavior.
- Add tests or fixtures around request construction, response parsing, and error handling where the project already has a test surface.

## Boundaries

- Use `documentation-lookup` for general API/library questions that are not Anthropic-specific.
- Use `mcp-builder` for MCP server design or tool schemas.
- Use `security-review` when auth, secret handling, sandboxing, or untrusted tool execution is central.
