# Host Adapters

The v1 host adapters support Codex and Claude Code. They are discovery rules, not permission grants for mutation.

## Codex Adapter

Collect current-repo traces from standard repo-level and user-level Codex work locations. Prefer repo-local host work directories, user-level session roots, automation logs, and Codex prompt/rule roots. User-level sessions must have cwd or workspace metadata inside `--repo`, or inside another checkout with the same logical Git/package identity, unless `--include-cross-repo` is explicit. Package, remote, or repo-name text matches in message content are not enough to include an external session.

Large Codex JSONL traces should be sampled from the tail by default so recent work is preserved. If older lines matter, rerun collection with a larger `--jsonl-tail-bytes` value.

Codex prompt context includes repository agent instruction files plus repo-local and user-level Codex prompt files when available. Treat it as context, not primary interaction evidence.

## Claude Code Adapter

Collect current-repo traces from standard repo-level and user-level Claude Code work locations. Prefer repo-local host work directories, exact encoded project roots, history exports, task state, and Claude prompt/rule roots. Treat project-name-only matches as out of scope unless the source has already passed the current-repo or same-logical-repo cwd/workspace gate, or `--include-cross-repo` is explicit.

Large Claude Code JSONL traces follow the same tail-sampling rule as Codex traces.

Claude Code prompt context includes repository Claude instruction files plus repo-local and user-level Claude Code prompt files when available. Treat it as context, not primary interaction evidence.

## Overrides

Use script overrides when the host stores traces somewhere nonstandard:

```bash
node skills/agent-interaction-audit/scripts/collect-agent-interaction-events.mjs \
  --repo . \
  --hosts codex,claude-code \
  --codex-root <path> \
  --claude-root <path> \
  --prompt-root <path> \
  --automation-root <path> \
  --include-cross-repo \
  --jsonl-tail-bytes <bytes>
```

Use multiple overrides by repeating the option or by using the operating system path separator inside one value. Use `--prompt-root` for nonstandard user/project instruction layers and `--automation-root` for scheduled task logs outside the default Codex automation directory. Overrides still remain current-repo scoped by default; add `--include-cross-repo` only for deliberate cross-checkout or cross-repository audits.

## Degraded Mode

If a host directory is missing or unreadable:

- keep scanning other sources;
- record a warning in the manifest;
- avoid conclusions that depend on the missing host;
- state when a supported host has no current-repo interaction evidence;
- ask the user for the trace location only if the missing source would change the decision.
