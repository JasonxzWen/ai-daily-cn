# Host Adapters

The v1 host adapters support Codex and Claude Code. They are discovery rules, not permission grants for mutation.

## Codex Adapter

Collect project-related traces from standard repo-level and user-level Codex work locations. Prefer repo-local host work directories, user-level session roots, and automation memory files. Use explicit cwd, repo path, package, or remote matches to classify evidence as high-confidence confirmed.

Large Codex JSONL traces should be sampled from the tail by default so recent work is preserved. If older lines matter, rerun collection with a larger `--jsonl-tail-bytes` value.

## Claude Code Adapter

Collect project-related traces from standard repo-level and user-level Claude Code work locations. Prefer repo-local host work directories, matching encoded project roots, history exports, and task state. Treat project-name-only matches as candidates; classify as confirmed only when cwd, repo path, package, or remote identity is present.

Large Claude Code JSONL traces follow the same tail-sampling rule as Codex traces.

## Overrides

Use script overrides when the host stores traces somewhere nonstandard:

```bash
node skills/insight/scripts/collect-insight-events.mjs \
  --repo . \
  --hosts codex,claude-code \
  --codex-root <path> \
  --claude-root <path> \
  --jsonl-tail-bytes <bytes>
```

Use multiple overrides by repeating the option or by using the operating system path separator inside one value.

## Degraded Mode

If a host directory is missing or unreadable:

- keep scanning other sources;
- record a warning in the manifest;
- avoid conclusions that depend on the missing host;
- state when a supported host has no current-repo interaction evidence;
- ask the user for the trace location only if the missing source would change the decision.
