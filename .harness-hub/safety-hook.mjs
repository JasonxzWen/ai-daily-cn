#!/usr/bin/env node

import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const REMOTE_WRITE_PATTERNS = [
  /(?:^|[;&|()\n])\s*git\s+push\b/i,
  /(?:^|[;&|()\n])\s*gh\s+pr\s+(create|edit|merge|comment|review|close|reopen|ready|lock|unlock)\b/i,
  /(?:^|[;&|()\n])\s*gh\s+issue\s+(create|edit|comment|close|reopen|delete|lock|unlock)\b/i,
  /(?:^|[;&|()\n])\s*gh\s+release\s+(create|upload|delete|edit)\b/i,
  /(?:^|[;&|()\n])\s*gh\s+api\b[^\n]*(?:--method|-X)\s+(?:POST|PUT|PATCH|DELETE)\b/i,
  /(?:^|[;&|()\n])\s*(?:npm|pnpm)\s+(?:publish|unpublish|deprecate|dist-tag|access|owner|token)\b/i,
  /(?:^|[;&|()\n])\s*yarn\s+(?:publish|npm\s+publish|npm\s+tag|npm\s+dist-tag)\b/i,
  /(?:^|[;&|()\n])\s*(?:vercel|firebase|wrangler|netlify|fly|railway)\s+(?:deploy|promote|up)\b/i,
];

const DESTRUCTIVE_PATTERNS = [
  /(?:^|[;&|()\n])\s*rm\s+-[^\n\s]*(?:r[^\n\s]*f|f[^\n\s]*r)\b/i,
  /(?:^|[;&|()\n])\s*git\s+reset\s+--hard\b/i,
  /(?:^|[;&|()\n])\s*git\s+clean\s+-[^\n\s]*(?:f[^\n\s]*d|d[^\n\s]*f)\b/i,
  /(?:^|[;&|()\n])\s*(?:Remove-Item|rm|ri|del)\b[^\n]*(?:-Recurse|-Force)\b/i,
  /(?:^|[;&|()\n])\s*rmdir\s+\/s\b/i,
  /(?:^|[;&|()\n])\s*del\s+\/[sq]\b/i,
];

const CREDENTIAL_PATTERNS = [
  /(?:^|[;&|()\n])\s*(?:export\s+)?[A-Z_][A-Z0-9_]*(?:SECRET|TOKEN|API_?KEY|PRIVATE_?KEY)[A-Z0-9_]*\s*=/i,
  /(^|[\s"'=\\/])\.env(?:$|[\s"'\\/]|\.((?!example\b|sample\b|template\b)[A-Za-z0-9_-]+))/i,
  /(^|[\s"'=\\/])id_(?:rsa|dsa|ecdsa|ed25519)(?:$|[\s"'\\/])/i,
];

const HOST_CONFIG_PATTERNS = [
  /(^|[\s"'=\\/])\.codex([\\/]|$)/i,
  /(^|[\s"'=\\/])\.claude([\\/]|$)/i,
  /hooks?\.json/i,
  /settings\.json/i,
  /config\.toml/i,
];

export function evaluateSafetyHook(input = {}) {
  if (!isRecord(input)) throw new Error('Hook input must be a JSON object.');
  const tool = normalizeToolInput(input);
  const text = [tool.name, tool.command, tool.filePath, tool.patch].filter(Boolean).join('\n');
  const findings = [];

  addFinding(text, REMOTE_WRITE_PATTERNS, findings, 'remote-write', 'remote write');
  addFinding(text, DESTRUCTIVE_PATTERNS, findings, 'destructive-command', 'destructive filesystem or Git operation');
  addFinding(text, CREDENTIAL_PATTERNS, findings, 'credential-sensitive', 'credential or secret mutation');
  if (isLikelyMutation(tool)) {
    addFinding(text, HOST_CONFIG_PATTERNS, findings, 'host-config-mutation', 'Codex or Claude Code configuration mutation');
  }

  return {
    ok: findings.length === 0,
    dispatchesAgents: false,
    mutates: false,
    findings,
  };
}

function normalizeToolInput(input) {
  const raw = isRecord(input.tool_input)
    ? input.tool_input
    : isRecord(input.toolInput)
      ? input.toolInput
      : isRecord(input.tool)
        ? input.tool
        : input;
  return {
    name: stringField(input, 'tool_name') || stringField(input, 'toolName') || stringField(raw, 'tool_name') || stringField(raw, 'toolName'),
    command: stringField(raw, 'command') || stringField(raw, 'cmd') || stringField(input, 'command'),
    patch: stringField(raw, 'patch') || stringField(input, 'patch'),
    filePath: stringField(raw, 'file_path') || stringField(raw, 'filePath') || stringField(raw, 'path') || stringField(input, 'file_path') || stringField(input, 'filePath') || stringField(input, 'path'),
  };
}

function isLikelyMutation(tool) {
  return /bash|apply_patch|edit|write/i.test(tool.name || '')
    || /\b(write|set-content|add-content|out-file|new-item|copy-item|move-item|remove-item|mkdir|touch|tee|sed\s+-i|git\s+commit)\b/i.test(tool.command || '')
    || /(^|[^>])>{1,2}[^>]/.test(tool.command || '');
}

function addFinding(text, patterns, findings, id, message) {
  if (patterns.some((pattern) => pattern.test(text))) findings.push({ id, message });
}

function stringField(record, field) {
  if (!isRecord(record)) return '';
  const value = record[field];
  return typeof value === 'string' ? value.trim() : '';
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readInput() {
  if (process.stdin.isTTY) return {};
  const text = fs.readFileSync(0, 'utf8').trim();
  return text ? JSON.parse(text) : {};
}

function hostOutput(result) {
  if (result.ok) return null;
  const reason = `Harness Hub safety hook warning: ${result.findings.map((item) => item.id).join(', ')}.`;
  return {
    systemMessage: reason,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const input = readInput();
    const output = hostOutput(evaluateSafetyHook(input));
    if (output) console.log(JSON.stringify(output));
  } catch (error) {
    console.error(`harness-safety-hook: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  }
}
