# Claude API Live Sources

Use current primary sources before implementing or migrating API behavior.

## Official Docs

- Anthropic API docs: `https://docs.anthropic.com/`
- Claude models: `https://docs.anthropic.com/en/docs/about-claude/models`
- Messages API: `https://docs.anthropic.com/en/api/messages`
- Tool use: `https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/overview`
- Prompt caching: `https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching`
- Streaming: `https://docs.anthropic.com/en/docs/build-with-claude/streaming`
- Batch processing: `https://docs.anthropic.com/en/docs/build-with-claude/batch-processing`

## SDK Source

- Python SDK: `https://github.com/anthropics/anthropic-sdk-python`
- TypeScript SDK: `https://github.com/anthropics/anthropic-sdk-typescript`
- Java SDK: `https://github.com/anthropics/anthropic-sdk-java`
- Go SDK: `https://github.com/anthropics/anthropic-sdk-go`
- Ruby SDK: `https://github.com/anthropics/anthropic-sdk-ruby`

## Lookup Rule

When a binding, enum, model ID, beta flag, or migration target is not present in the target repo, verify it from an official source before writing code. If the live source conflicts with cached examples or memory, prefer the live source and mention the discrepancy.
