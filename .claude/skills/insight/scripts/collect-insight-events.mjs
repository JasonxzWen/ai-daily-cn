#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const TEXT_EXTENSIONS = new Set(['.md', '.markdown', '.txt', '.log', '.json', '.jsonl', '.yaml', '.yml']);
const CORE_REPO_FILES = new Set([
  'AGENTS.md',
  'CLAUDE.md',
  'README.md',
  'README.zh-CN.md',
  'package.json',
  'progress.md',
  'session-handoff.md',
]);
const REPO_STATE_NAMES = new Set([
  'current-task.md',
  'decisions.md',
  'progress.md',
  'session-handoff.md',
  'clean-state-checklist.md',
  'definition-of-done.md',
  'evaluator-rubric.md',
  'quality-document.md',
  'feature_list.json',
]);
const COMMON_SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '__pycache__',
  '.pytest_cache',
  '.cache',
  'cache',
  'reports',
]);
const REPO_SKIP_DIRS = new Set([
  ...COMMON_SKIP_DIRS,
  '.tmp',
  'tmp',
  'src',
  'tests',
  'skills',
  'site',
]);
const AUTOMATION_SKIP_DIRS = new Set([
  ...COMMON_SKIP_DIRS,
  '.tmp',
  'tmp',
  'git-cache',
  'npm-cache',
  'run-worktrees',
  'worktrees',
]);
const HOST_SKIP_DIRS = new Set([
  ...COMMON_SKIP_DIRS,
  'source-cache',
  'plugins',
  'cache',
]);
const DEFAULT_MAX_FILES = 1200;
const MAX_FILE_BYTES = 250_000;
const DEFAULT_JSONL_TAIL_BYTES = 2_000_000;
const AFFINITY_RANK = {
  none: 0,
  weak: 1,
  background: 2,
  strong: 3,
  exact: 4,
};

function usage() {
  return `Usage: node skills/insight/scripts/collect-insight-events.mjs --repo <path> [--since 30d] [--hosts codex,claude-code] [--out <dir>] [--json]

Options:
  --repo <path>          Repository to audit. Defaults to cwd.
  --since <range>        Duration like 30d, 12h, 90m, or an ISO date. Defaults to 30d.
  --hosts <list>         Comma-separated hosts: codex, claude-code. Defaults to both.
  --codex-root <path>    Extra Codex trace root. Repeat or use the OS path separator.
  --claude-root <path>   Extra Claude Code trace root. Repeat or use the OS path separator.
  --out <dir>            Output directory. Defaults to an OS temp directory.
  --max-files <n>        Maximum files scanned across selected roots. Defaults to ${DEFAULT_MAX_FILES}.
  --jsonl-tail-bytes <n> Maximum tail bytes read from each JSONL trace. Defaults to ${DEFAULT_JSONL_TAIL_BYTES}.
  --json                 Print machine-readable output.
`;
}

function parseArgs(argv) {
  const options = {
    repo: process.cwd(),
    since: '30d',
    hosts: 'codex,claude-code',
    out: null,
    codexRoots: [],
    claudeRoots: [],
    maxFiles: DEFAULT_MAX_FILES,
    jsonlTailBytes: DEFAULT_JSONL_TAIL_BYTES,
    json: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--repo') {
      options.repo = readValue(argv, ++index, arg);
    } else if (arg === '--since') {
      options.since = readValue(argv, ++index, arg);
    } else if (arg === '--hosts') {
      options.hosts = readValue(argv, ++index, arg);
    } else if (arg === '--out') {
      options.out = readValue(argv, ++index, arg);
    } else if (arg === '--codex-root') {
      options.codexRoots.push(...splitPathList(readValue(argv, ++index, arg)));
    } else if (arg === '--claude-root') {
      options.claudeRoots.push(...splitPathList(readValue(argv, ++index, arg)));
    } else if (arg === '--max-files') {
      options.maxFiles = Number.parseInt(readValue(argv, ++index, arg), 10);
      if (!Number.isFinite(options.maxFiles) || options.maxFiles <= 0) {
        throw new Error('--max-files must be a positive integer.');
      }
    } else if (arg === '--jsonl-tail-bytes') {
      options.jsonlTailBytes = Number.parseInt(readValue(argv, ++index, arg), 10);
      if (!Number.isFinite(options.jsonlTailBytes) || options.jsonlTailBytes <= 0) {
        throw new Error('--jsonl-tail-bytes must be a positive integer.');
      }
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unsupported option '${arg}'.`);
    }
  }

  return options;
}

function readValue(argv, index, flag) {
  const value = argv[index];
  if (!value) {
    throw new Error(`Missing value for ${flag}.`);
  }
  return value;
}

function splitPathList(value) {
  return String(value)
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseSince(value, now = new Date()) {
  const text = String(value || '30d').trim().toLowerCase();
  const match = text.match(/^(\d+)([dhm])$/);
  if (match) {
    const amount = Number.parseInt(match[1], 10);
    const unit = match[2];
    const multiplier = unit === 'd' ? 24 * 60 * 60 * 1000 : unit === 'h' ? 60 * 60 * 1000 : 60 * 1000;
    return new Date(now.getTime() - amount * multiplier);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid --since value '${value}'. Use 30d or an ISO date.`);
  }
  return parsed;
}

function normalizeHosts(value) {
  const hosts = String(value || '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  const allowed = new Set(['codex', 'claude-code']);
  for (const host of hosts) {
    if (!allowed.has(host)) {
      throw new Error(`Unsupported host '${host}'. Use codex or claude-code.`);
    }
  }
  return [...new Set(hosts)];
}

function discoverRepoIdentity(repoPath) {
  const repo = path.resolve(repoPath);
  const packagePath = path.join(repo, 'package.json');
  let packageName = null;
  if (fs.existsSync(packagePath)) {
    try {
      packageName = JSON.parse(fs.readFileSync(packagePath, 'utf8')).name || null;
    } catch {
      packageName = null;
    }
  }

  const gitRoot = runGit(repo, ['rev-parse', '--show-toplevel']) || null;
  const remoteUrl = runGit(repo, ['config', '--get', 'remote.origin.url']) || null;
  const remoteName = remoteUrl ? remoteUrl.split(/[\\/]/).pop()?.replace(/\.git$/i, '') || null : null;
  const basename = path.basename(repo);

  return {
    repo,
    gitRoot,
    basename,
    packageName,
    remoteUrl,
    remoteName,
    exactTerms: unique(compact([repo, gitRoot]).flatMap(pathTermVariants)),
    strongTerms: unique(compact([packageName, remoteUrl])),
    weakTerms: unique(compact([basename, remoteName])),
  };
}

function runGit(cwd, args) {
  const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', shell: false });
  if (result.status !== 0) {
    return null;
  }
  return result.stdout.trim() || null;
}

function compact(values) {
  return values.filter((value) => typeof value === 'string' && value.trim().length > 0);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function pathTermVariants(value) {
  const text = String(value || '');
  return unique([
    text,
    text.replace(/\\/g, '/'),
    text.replace(/\\/g, '\\\\'),
  ]);
}

function slugify(value) {
  const slug = String(value || 'repo')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || 'repo';
}

function defaultOutDir(identity) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(os.tmpdir(), 'insight-reports', `${slugify(identity.packageName || identity.basename)}-${stamp}`);
}

function discoverRoots(options, identity, hosts, warnings) {
  const roots = [{
    root: identity.repo,
    host: 'repo',
    sourceType: 'repo-context',
    sourceClass: 'repo-state',
    scanMode: 'repo-state',
    required: true,
  }];
  const home = os.homedir();

  if (hosts.includes('codex')) {
    roots.push({
      root: path.join(identity.repo, '.codex'),
      host: 'codex',
      sourceType: 'repo-host-workdir',
      sourceClass: 'host-trace',
      scanMode: 'host-trace',
      required: false,
      repoAffinityHint: 'exact',
    });
    for (const root of options.codexRoots) {
      roots.push({
        root: path.resolve(root),
        host: 'codex',
        sourceType: 'override-host-root',
        sourceClass: 'host-trace',
        scanMode: 'host-trace',
        required: false,
      });
    }
    roots.push({
      root: path.join(home, '.codex', 'sessions'),
      host: 'codex',
      sourceType: 'user-host-trace',
      sourceClass: 'host-trace',
      scanMode: 'host-trace',
      required: false,
    });
    roots.push({
      root: path.join(home, '.codex', 'automations'),
      host: 'codex',
      sourceType: 'automation-memory',
      sourceClass: 'automation-memory',
      scanMode: 'automation-memory',
      required: false,
    });
  }

  if (hosts.includes('claude-code')) {
    roots.push({
      root: path.join(identity.repo, '.claude'),
      host: 'claude-code',
      sourceType: 'repo-host-workdir',
      sourceClass: 'host-trace',
      scanMode: 'host-trace',
      required: false,
      repoAffinityHint: 'exact',
    });
    for (const root of options.claudeRoots) {
      roots.push({
        root: path.resolve(root),
        host: 'claude-code',
        sourceType: 'override-host-root',
        sourceClass: 'host-trace',
        scanMode: 'host-trace',
        required: false,
      });
    }

    const claudeHome = path.join(home, '.claude');
    roots.push(...discoverClaudeProjectRoots(path.join(claudeHome, 'projects'), identity, warnings));
    roots.push({
      root: path.join(claudeHome, 'history.jsonl'),
      host: 'claude-code',
      sourceType: 'user-host-history',
      sourceClass: 'host-trace',
      scanMode: 'single-file',
      required: false,
    });
    roots.push({
      root: path.join(claudeHome, 'tasks'),
      host: 'claude-code',
      sourceType: 'user-host-task',
      sourceClass: 'host-trace',
      scanMode: 'host-trace',
      required: false,
    });
  }

  const seen = new Set();
  return roots.filter((entry) => {
    const key = path.resolve(entry.root).toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    if (!fs.existsSync(entry.root) && entry.required) {
      warnings.push(`Required root missing: ${entry.root}`);
    }
    return true;
  });
}

function discoverClaudeProjectRoots(projectsRoot, identity, warnings) {
  if (!fs.existsSync(projectsRoot)) {
    return [{
      root: projectsRoot,
      host: 'claude-code',
      sourceType: 'user-host-project',
      sourceClass: 'host-trace',
      scanMode: 'host-trace',
      required: false,
    }];
  }

  const exactKeys = new Set(compact([identity.repo, identity.gitRoot]).map(normalizeProjectKey));
  const weakKeys = new Set(compact([identity.basename, identity.remoteName]).map(normalizeProjectKey));
  const roots = [];
  let projectCount = 0;
  for (const entry of fs.readdirSync(projectsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    projectCount += 1;
    const key = normalizeProjectKey(entry.name);
    const exact = exactKeys.has(key);
    const weak = [...weakKeys].some((weakKey) => weakKey && key.includes(weakKey));
    if (exact || weak) {
      roots.push({
        root: path.join(projectsRoot, entry.name),
        host: 'claude-code',
        sourceType: 'user-host-project',
        sourceClass: 'host-trace',
        scanMode: 'host-trace',
        required: false,
        repoAffinityHint: exact ? 'exact' : 'weak',
      });
    }
  }

  if (projectCount > 0 && roots.length === 0) {
    warnings.push(`No Claude Code project directory matched current repo identity under ${projectsRoot}.`);
  }
  return roots;
}

function normalizeProjectKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function listCandidateFiles(rootEntry, identity, sinceDate, maxRemaining, warnings) {
  if (!fs.existsSync(rootEntry.root)) {
    warnings.push(`Skipped missing ${rootEntry.host} root: ${rootEntry.root}`);
    return [];
  }

  const rootStat = safeStat(rootEntry.root, warnings);
  if (!rootStat) {
    return [];
  }

  if (rootStat.isFile()) {
    return includeFile(rootEntry, identity, rootEntry.root, rootStat, sinceDate) ? [{
      path: rootEntry.root,
      stat: rootStat,
      rootEntry,
    }] : [];
  }

  const files = [];
  const stack = [rootEntry.root];
  while (stack.length > 0 && files.length < maxRemaining) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      warnings.push(`Unreadable directory: ${current} (${error.message})`);
      continue;
    }

    for (const entry of entries) {
      const child = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (shouldDescend(rootEntry, entry.name)) {
          stack.push(child);
        }
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }

      const stat = safeStat(child, warnings);
      if (!stat || !includeFile(rootEntry, identity, child, stat, sinceDate)) {
        continue;
      }
      files.push({ path: child, stat, rootEntry });
      if (files.length >= maxRemaining) {
        break;
      }
    }
  }
  return files;
}

function safeStat(filePath, warnings) {
  try {
    return fs.statSync(filePath);
  } catch (error) {
    warnings.push(`Unreadable file stat: ${filePath} (${error.message})`);
    return null;
  }
}

function shouldDescend(rootEntry, name) {
  const lower = name.toLowerCase();
  if (rootEntry.scanMode === 'repo-state') {
    return !REPO_SKIP_DIRS.has(lower);
  }
  if (rootEntry.scanMode === 'automation-memory') {
    return !AUTOMATION_SKIP_DIRS.has(lower);
  }
  return !HOST_SKIP_DIRS.has(lower);
}

function includeFile(rootEntry, identity, filePath, stat, sinceDate) {
  const name = path.basename(filePath);
  const ext = path.extname(name).toLowerCase();
  if (!TEXT_EXTENSIONS.has(ext) && !CORE_REPO_FILES.has(name)) {
    return false;
  }

  if (rootEntry.scanMode === 'repo-state' && !isRepoStateFile(identity, filePath)) {
    return false;
  }
  if (rootEntry.scanMode === 'automation-memory' && name.toLowerCase() !== 'memory.md') {
    return false;
  }

  const alwaysInclude = rootEntry.scanMode === 'repo-state' && isRepoStateFile(identity, filePath);
  return alwaysInclude || stat.mtime >= sinceDate;
}

function isRepoStateFile(identity, filePath) {
  if (!isInside(filePath, identity.repo)) {
    return false;
  }
  const rel = path.relative(identity.repo, filePath).replace(/\\/g, '/');
  const name = path.basename(filePath);
  const lowerName = name.toLowerCase();
  if (CORE_REPO_FILES.has(name) || REPO_STATE_NAMES.has(lowerName)) {
    return true;
  }
  if (rel.startsWith('.harness-hub/state/')) {
    return TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase());
  }
  if (rel.startsWith('docs/')) {
    return /(architecture|roadmap|requirement|workflow|routing|handoff|decision|capability-map|source-projects)/i.test(lowerName);
  }
  return false;
}

function readTextFile(filePath, warnings, options = {}) {
  const stat = safeStat(filePath, warnings);
  if (!stat) {
    return '';
  }
  const isJsonl = path.extname(filePath).toLowerCase() === '.jsonl';
  const maxBytes = isJsonl ? (options.jsonlTailBytes || DEFAULT_JSONL_TAIL_BYTES) : MAX_FILE_BYTES;
  const fd = fs.openSync(filePath, 'r');
  try {
    const length = Math.min(stat.size, maxBytes);
    const buffer = Buffer.alloc(length);
    const offset = isJsonl && stat.size > length ? stat.size - length : 0;
    fs.readSync(fd, buffer, 0, length, offset);
    let text = buffer.toString('utf8').replace(/\u0000/g, '');
    if (stat.size > length) {
      if (isJsonl) {
        warnings.push(`Sampled tail of large JSONL file: ${filePath}`);
        const firstNewline = Math.min(
          ...[text.indexOf('\n'), text.indexOf('\r')].filter((index) => index >= 0),
        );
        if (Number.isFinite(firstNewline) && firstNewline >= 0) {
          text = text.slice(firstNewline + 1);
        }
      } else {
        warnings.push(`Truncated large file: ${filePath}`);
      }
    }
    return text;
  } catch (error) {
    warnings.push(`Unreadable file: ${filePath} (${error.message})`);
    return '';
  } finally {
    fs.closeSync(fd);
  }
}

function assessRepoAffinity(filePath, content, rootEntry, identity) {
  if (rootEntry.repoAffinityHint === 'exact') {
    return {
      repoAffinity: 'exact',
      relevance: 'confirmed',
      confidence: 'high',
      matchedTerms: ['repo-local-host-root'],
    };
  }

  if (rootEntry.scanMode === 'repo-state' && isInside(filePath, identity.repo)) {
    return {
      repoAffinity: 'background',
      relevance: 'confirmed',
      confidence: 'medium',
      matchedTerms: ['repo-state'],
    };
  }

  const haystacks = [filePath, content];
  const exact = findMatchedTerms(haystacks, identity.exactTerms);
  if (exact.length > 0) {
    return {
      repoAffinity: 'exact',
      relevance: 'confirmed',
      confidence: 'high',
      matchedTerms: exact,
    };
  }

  const strong = findMatchedTerms(haystacks, identity.strongTerms);
  if (strong.length > 0) {
    return {
      repoAffinity: 'strong',
      relevance: 'confirmed',
      confidence: 'high',
      matchedTerms: strong,
    };
  }

  if (rootEntry.repoAffinityHint === 'weak') {
    return {
      repoAffinity: 'weak',
      relevance: 'candidate',
      confidence: 'low',
      matchedTerms: ['matched-claude-project-name'],
    };
  }

  const weak = findMatchedTerms(haystacks, identity.weakTerms);
  if (weak.length > 0) {
    return {
      repoAffinity: 'weak',
      relevance: 'candidate',
      confidence: 'low',
      matchedTerms: weak,
    };
  }

  return {
    repoAffinity: 'none',
    relevance: 'unrelated',
    confidence: 'low',
    matchedTerms: [],
  };
}

function findMatchedTerms(haystacks, terms) {
  const matched = [];
  for (const term of terms) {
    if (!term) {
      continue;
    }
    if (haystacks.some((haystack) => containsTerm(haystack, term))) {
      matched.push(term);
    }
  }
  return matched.slice(0, 8);
}

function containsTerm(haystack, term) {
  const source = String(haystack || '').toLowerCase();
  const needle = String(term || '').toLowerCase();
  if (!needle) {
    return false;
  }
  return source.includes(needle) || source.replace(/\\/g, '/').includes(needle.replace(/\\/g, '/'));
}

function mergeAffinity(primary, secondary) {
  const first = primary || { repoAffinity: 'none', relevance: 'unrelated', confidence: 'low', matchedTerms: [] };
  const second = secondary || { repoAffinity: 'none', relevance: 'unrelated', confidence: 'low', matchedTerms: [] };
  const winner = AFFINITY_RANK[second.repoAffinity] > AFFINITY_RANK[first.repoAffinity] ? second : first;
  return {
    ...winner,
    matchedTerms: unique([...(first.matchedTerms || []), ...(second.matchedTerms || [])]).slice(0, 8),
  };
}

function classifySignals(content, eventType = 'file-evidence') {
  const text = String(content || '').toLowerCase();
  return {
    userRequest: eventType === 'user-message' || includesAny(text, ['user:', 'human:', 'request', 'asked', 'user_message']),
    toolTrace: ['tool-call', 'tool-result'].includes(eventType) || includesAny(text, ['tool', 'tool_call', 'exec_command', 'bash', 'shell', 'function call', 'trace']),
    validation: includesAny(text, ['test', 'typecheck', 'validate', 'validation', 'passed', 'failed', 'smoke']),
    blocker: includesAny(text, ['blocked', 'blocker', 'error', 'failed', 'failure', 'timeout', 'conflict', 'stuck', 'iserror', 'createprocesswithlogonw']),
    decision: includesAny(text, ['decision', 'decided', 'accepted', 'rejected', 'tradeoff', 'acceptance']),
    handoff: eventType === 'handoff' || includesAny(text, ['handoff', 'summary', 'next action', 'resume', 'task_complete']),
  };
}

function includesAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

function buildExcerpt(content, terms) {
  const collapsed = String(content || '').replace(/\s+/g, ' ').trim();
  if (!collapsed) {
    return '';
  }
  const lower = collapsed.toLowerCase();
  const term = terms.find((entry) => entry && lower.includes(String(entry).toLowerCase()));
  const index = term ? lower.indexOf(String(term).toLowerCase()) : 0;
  const start = Math.max(0, index - 120);
  return collapsed.slice(start, start + 360);
}

function eventId(filePath, stat, index, eventType) {
  const hash = crypto
    .createHash('sha1')
    .update(`${filePath}:${stat.mtimeMs}:${stat.size}:${index}:${eventType}`)
    .digest('hex')
    .slice(0, 10);
  return `evt-${hash}`;
}

function extractEvents(candidate, content, identity, warnings, baseIndex) {
  const ext = path.extname(candidate.path).toLowerCase();
  if (candidate.rootEntry.sourceClass === 'host-trace' && ext === '.jsonl') {
    const structured = extractJsonlEvents(candidate, content, identity, warnings, baseIndex);
    if (structured.length > 0) {
      return structured;
    }
  }

  const affinity = assessRepoAffinity(candidate.path, content, candidate.rootEntry, identity);
  if (affinity.relevance === 'unrelated') {
    return [];
  }
  return [makeEvent(candidate, {
    ts: candidate.stat.mtime.toISOString(),
    eventType: 'file-evidence',
    text: content,
    affinity,
    index: baseIndex,
  }, identity)];
}

function extractJsonlEvents(candidate, content, identity, warnings, baseIndex) {
  const records = [];
  for (const [lineIndex, line] of content.split(/\r?\n/).entries()) {
    if (!line.trim()) {
      continue;
    }
    try {
      records.push({ lineIndex, value: JSON.parse(line) });
    } catch (error) {
      warnings.push(`Invalid JSONL in ${candidate.path}:${lineIndex + 1} (${error.message})`);
    }
  }

  if (records.length === 0) {
    return [];
  }

  let sessionAffinity = assessRepoAffinity(candidate.path, content, candidate.rootEntry, identity);
  for (const record of records) {
    const cwd = extractCwd(record.value);
    if (cwd) {
      sessionAffinity = mergeAffinity(sessionAffinity, assessRepoAffinity(candidate.path, cwd, candidate.rootEntry, identity));
    }
  }

  const events = [];
  for (const record of records) {
    const extracted = candidate.rootEntry.host === 'claude-code'
      ? extractClaudeRecord(record.value)
      : extractCodexRecord(record.value);
    if (!extracted) {
      continue;
    }

    const recordAffinity = mergeAffinity(
      sessionAffinity,
      assessRepoAffinity(candidate.path, `${extracted.text} ${extractCwd(record.value) || ''}`, candidate.rootEntry, identity),
    );
    if (recordAffinity.relevance === 'unrelated') {
      continue;
    }

    events.push(makeEvent(candidate, {
      ts: extracted.ts || candidate.stat.mtime.toISOString(),
      eventType: extracted.eventType,
      text: extracted.text,
      affinity: recordAffinity,
      signals: extracted.signals,
      index: baseIndex + record.lineIndex,
    }, identity));
  }
  return events;
}

function extractCwd(record) {
  return record?.payload?.cwd
    || record?.payload?.session_meta?.cwd
    || record?.payload?.item?.cwd
    || record?.payload?.context?.cwd
    || record?.payload?.session?.cwd
    || record?.cwd
    || record?.message?.cwd
    || record?.toolUseResult?.cwd
    || null;
}

function extractCodexRecord(record) {
  const timestamp = record.timestamp || record?.payload?.timestamp || null;
  if (record.type === 'event_msg') {
    const payload = record.payload || {};
    if (payload.type === 'user_message') {
      return {
        ts: timestamp,
        eventType: 'user-message',
        text: payload.message || '',
        signals: { userRequest: true },
      };
    }
    if (payload.type === 'task_complete') {
      return {
        ts: timestamp,
        eventType: 'handoff',
        text: payload.last_agent_message || '',
        signals: { handoff: true },
      };
    }
    if (payload.type === 'mcp_tool_call_end') {
      const invocation = payload.invocation || {};
      const toolName = [invocation.server, invocation.tool].filter(Boolean).join(':') || 'unknown-tool';
      const resultText = compactJson(payload.result);
      const failed = isFailureText(resultText);
      return {
        ts: timestamp,
        eventType: 'tool-call',
        text: `${toolName} ${resultText}`,
        signals: { toolTrace: true, blocker: failed },
      };
    }
    if (payload.type === 'patch_apply_end') {
      const failed = payload.success === false;
      return {
        ts: timestamp,
        eventType: 'tool-call',
        text: `apply_patch success=${payload.success} ${payload.stdout || ''} ${payload.stderr || ''}`,
        signals: { toolTrace: true, blocker: failed },
      };
    }
  }
  return null;
}

function extractClaudeRecord(record) {
  const timestamp = record.timestamp || null;
  const message = record.message || {};
  const contentText = contentToText(message.content);
  if (record.type === 'user') {
    const isToolResult = Array.isArray(message.content)
      && message.content.some((item) => item?.type === 'tool_result' || item?.tool_use_id);
    return {
      ts: timestamp,
      eventType: isToolResult ? 'tool-result' : 'user-message',
      text: contentText || compactJson(record.toolUseResult || record),
      signals: isToolResult ? { toolTrace: true, blocker: isFailureText(contentText) } : { userRequest: true },
    };
  }

  if (record.type === 'assistant' || message.role === 'assistant') {
    const toolUses = Array.isArray(message.content)
      ? message.content.filter((item) => item?.type === 'tool_use')
      : [];
    if (toolUses.length > 0) {
      return {
        ts: timestamp,
        eventType: 'tool-call',
        text: toolUses.map((item) => `${item.name || 'tool'} ${compactJson(item.input || {})}`).join(' '),
        signals: { toolTrace: true },
      };
    }
  }
  return null;
}

function contentToText(content) {
  if (typeof content === 'string') {
    return content;
  }
  if (!Array.isArray(content)) {
    return '';
  }
  return content.map((item) => {
    if (typeof item === 'string') {
      return item;
    }
    return item?.text || item?.content || item?.name || compactJson(item?.input || {});
  }).join(' ');
}

function compactJson(value) {
  try {
    return JSON.stringify(value || {}).replace(/\s+/g, ' ').slice(0, 800);
  } catch {
    return String(value || '').slice(0, 800);
  }
}

function isFailureText(value) {
  return includesAny(String(value || '').toLowerCase(), ['iserror":true', '"iserror":true', 'error:', 'failed', 'failure', 'timeout', 'createprocesswithlogonw']);
}

function makeEvent(candidate, details, identity) {
  const sourceClass = sourceClassFor(candidate);
  const text = String(details.text || '');
  const mergedSignals = {
    ...classifySignals(text, details.eventType),
    ...(details.signals || {}),
  };
  const relPath = isInside(candidate.path, identity.repo)
    ? path.relative(identity.repo, candidate.path)
    : candidate.path;
  const matchedTerms = (details.affinity.matchedTerms || []).slice(0, 8);
  return {
    schemaVersion: 2,
    id: eventId(candidate.path, candidate.stat, details.index, details.eventType),
    ts: normalizeTimestamp(details.ts, candidate.stat.mtime),
    host: candidate.rootEntry.host,
    sourceType: candidate.rootEntry.sourceType,
    sourceClass,
    evidenceRole: evidenceRoleFor(sourceClass, details.eventType),
    eventType: details.eventType,
    path: relPath,
    relevance: details.affinity.relevance,
    repoAffinity: details.affinity.repoAffinity,
    confidence: details.affinity.confidence,
    matchedTerms,
    signals: mergedSignals,
    excerpt: buildExcerpt(text, matchedTerms),
  };
}

function sourceClassFor(candidate) {
  const lowerPath = candidate.path.toLowerCase();
  if (includesAny(lowerPath, ['source-cache', `${path.sep}cache${path.sep}`, `${path.sep}run-worktrees${path.sep}`, `${path.sep}git-cache${path.sep}`])) {
    return 'cache-noise';
  }
  return candidate.rootEntry.sourceClass;
}

function evidenceRoleFor(sourceClass, eventType) {
  if (sourceClass === 'repo-state') {
    return 'context';
  }
  if (sourceClass === 'automation-memory' || sourceClass === 'host-trace') {
    return ['user-message', 'tool-call', 'tool-result', 'handoff'].includes(eventType) ? 'interaction' : 'context';
  }
  if (sourceClass === 'env-state') {
    return 'environment';
  }
  return 'context';
}

function normalizeTimestamp(value, fallback) {
  const parsed = value ? new Date(value) : fallback;
  return Number.isNaN(parsed.getTime()) ? fallback.toISOString() : parsed.toISOString();
}

function isInside(child, parent) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function collectInsightEvents(options) {
  const repoPath = path.resolve(options.repo || process.cwd());
  if (!fs.existsSync(repoPath) || !fs.statSync(repoPath).isDirectory()) {
    throw new Error(`Repository path does not exist or is not a directory: ${repoPath}`);
  }

  const sinceDate = parseSince(options.since || '30d');
  const hosts = normalizeHosts(options.hosts || 'codex,claude-code');
  const identity = discoverRepoIdentity(repoPath);
  const warnings = [];
  const roots = discoverRoots(options, identity, hosts, warnings);
  const outDir = path.resolve(options.out || defaultOutDir(identity));
  fs.mkdirSync(outDir, { recursive: true });

  const candidates = [];
  for (const rootEntry of roots) {
    const remaining = Math.max(0, (options.maxFiles || DEFAULT_MAX_FILES) - candidates.length);
    if (remaining <= 0) {
      warnings.push(`Stopped scanning after ${options.maxFiles || DEFAULT_MAX_FILES} files.`);
      break;
    }
    candidates.push(...listCandidateFiles(rootEntry, identity, sinceDate, remaining, warnings));
  }

  const events = [];
  for (const candidate of candidates) {
    const content = readTextFile(candidate.path, warnings, options);
    if (!content.trim()) {
      continue;
    }
    events.push(...extractEvents(candidate, content, identity, warnings, events.length));
  }

  const filteredEvents = events
    .filter((event) => event.relevance !== 'unrelated' && event.sourceClass !== 'cache-noise')
    .sort((a, b) => a.ts.localeCompare(b.ts) || a.path.localeCompare(b.path) || a.id.localeCompare(b.id));

  const ledgerPath = path.join(outDir, 'insight-events.jsonl');
  const manifestPath = path.join(outDir, 'insight-manifest.json');
  fs.writeFileSync(ledgerPath, `${filteredEvents.map((event) => JSON.stringify(event)).join('\n')}${filteredEvents.length ? '\n' : ''}`);

  if (filteredEvents.length === 0) {
    warnings.push('No project-related events were collected for the selected window.');
  }

  const manifest = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    repo: identity.repo,
    since: sinceDate.toISOString(),
    hosts,
    identity: {
      basename: identity.basename,
      packageName: identity.packageName,
      gitRoot: identity.gitRoot,
      remoteName: identity.remoteName,
      remoteUrl: identity.remoteUrl,
    },
    roots: roots.map((entry) => ({
      host: entry.host,
      sourceType: entry.sourceType,
      sourceClass: entry.sourceClass,
      scanMode: entry.scanMode,
      root: entry.root,
      exists: fs.existsSync(entry.root),
    })),
    outputs: {
      outDir,
      ledgerPath,
      manifestPath,
    },
    counts: summarizeEvents(filteredEvents),
    warnings,
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  return { manifest, events: filteredEvents };
}

function summarizeEvents(events) {
  const byHost = {};
  const byRelevance = {};
  const bySignal = {};
  const bySourceClass = {};
  const byConfidence = {};
  const byRepoAffinity = {};
  const byEventType = {};
  const byEvidenceRole = {};
  for (const event of events) {
    byHost[event.host] = (byHost[event.host] || 0) + 1;
    byRelevance[event.relevance] = (byRelevance[event.relevance] || 0) + 1;
    bySourceClass[event.sourceClass] = (bySourceClass[event.sourceClass] || 0) + 1;
    byConfidence[event.confidence] = (byConfidence[event.confidence] || 0) + 1;
    byRepoAffinity[event.repoAffinity] = (byRepoAffinity[event.repoAffinity] || 0) + 1;
    byEventType[event.eventType] = (byEventType[event.eventType] || 0) + 1;
    byEvidenceRole[event.evidenceRole] = (byEvidenceRole[event.evidenceRole] || 0) + 1;
    for (const [name, active] of Object.entries(event.signals || {})) {
      if (active) {
        bySignal[name] = (bySignal[name] || 0) + 1;
      }
    }
  }
  return {
    total: events.length,
    byHost,
    byRelevance,
    bySignal,
    bySourceClass,
    byConfidence,
    byRepoAffinity,
    byEventType,
    byEvidenceRole,
  };
}

function printText(result) {
  const { manifest } = result;
  console.log(`Collected ${manifest.counts.total} project-related events.`);
  console.log(`Ledger: ${manifest.outputs.ledgerPath}`);
  console.log(`Manifest: ${manifest.outputs.manifestPath}`);
  if (manifest.warnings.length > 0) {
    console.log('Warnings:');
    for (const warning of manifest.warnings) {
      console.log(`- ${warning}`);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log(usage());
      process.exitCode = 0;
    } else {
      const result = collectInsightEvents(options);
      if (options.json) {
        console.log(JSON.stringify({
          ok: true,
          manifestPath: result.manifest.outputs.manifestPath,
          ledgerPath: result.manifest.outputs.ledgerPath,
          outDir: result.manifest.outputs.outDir,
          counts: result.manifest.counts,
          warnings: result.manifest.warnings,
        }, null, 2));
      } else {
        printText(result);
      }
    }
  } catch (error) {
    if (process.argv.includes('--json')) {
      console.log(JSON.stringify({ ok: false, error: error.message }, null, 2));
    } else {
      console.error(`collect-insight-events: ${error.message}`);
    }
    process.exitCode = 1;
  }
}
