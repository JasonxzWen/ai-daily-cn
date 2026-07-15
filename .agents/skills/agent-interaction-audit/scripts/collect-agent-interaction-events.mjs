#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TEXT_EXTENSIONS = new Set(['.md', '.markdown', '.txt', '.log', '.json', '.jsonl', '.yaml', '.yml']);
const CORE_REPO_FILES = new Set([
  'AGENTS.md',
  'CLAUDE.md',
  'CODEX.md',
  'GEMINI.md',
  'README.md',
  'README.zh-CN.md',
  'package.json',
  'progress.md',
  'session-handoff.md',
]);
const PROMPT_CONTEXT_FILES = new Set([
  'AGENTS.md',
  'AGENTS.local.md',
  'CLAUDE.md',
  'CLAUDE.local.md',
  'CODEX.md',
  'CODEX.local.md',
  'GEMINI.md',
  'GEMINI.local.md',
  'instructions.md',
  'system-prompt.md',
  'project-instructions.md',
  '.cursorrules',
  '.windsurfrules',
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
  'automations',
]);
const PROMPT_SKIP_DIRS = new Set([
  ...COMMON_SKIP_DIRS,
  '.tmp',
  'tmp',
  'sessions',
  'automations',
  'tasks',
  'projects',
  'worktrees',
  'run-worktrees',
  'plugins',
  'source-cache',
  'git-cache',
  'npm-cache',
  'logs',
  'src',
  'tests',
  'skills',
  'site',
  'vendor',
  'harness',
  'reports',
]);
const DEFAULT_MAX_FILES = 1200;
const MAX_FILE_BYTES = 250_000;
const DEFAULT_JSONL_TAIL_BYTES = 2_000_000;
const MAX_SCOPE_SAMPLES = 8;
const AFFINITY_RANK = {
  none: 0,
  weak: 1,
  background: 2,
  strong: 3,
  exact: 4,
};
const USER_FRICTION_TERMS = [
  'misunderstood',
  'misread',
  'ambiguous',
  'unclear request',
  'not what i asked',
  'i meant',
  'wasted time',
  'confusing wording',
  '\u8bef\u89e3',
  '\u6ca1\u7406\u89e3',
  '\u6b67\u4e49',
  '\u4e0d\u662f\u6211\u8981',
  '\u6d6a\u8d39\u65f6\u95f4',
];
const GUIDANCE_DRIFT_TERMS = [
  'stale',
  'outdated',
  'obsolete',
  'wrong guidance',
  'incorrect guidance',
  'misleading',
  'docs disagree',
  'doc/code conflict',
  'rule drift',
  'garbage info',
  '\u8fc7\u65f6',
  '\u8bef\u5bfc',
  '\u9519\u8bef\u4fe1\u606f',
  '\u5783\u573e\u4fe1\u606f',
];
const REPEATED_MISTAKE_TERMS = [
  'same mistake',
  'repeated mistake',
  'kept retrying',
  'keeps retrying',
  'again and again',
  'repeat lookup',
  'low-value lookup',
  'tool loop',
  '\u91cd\u590d\u72af\u9519',
  '\u53cd\u590d',
  '\u4ece0\u52301',
];
const SOP_TERMS = [
  'sop',
  'runbook',
  'script tip',
  'script trick',
  'powershell',
  'encoding',
  'utf-8',
  'utf8',
  'gbk',
  'cp936',
  'github',
  'gh ',
  'pull request',
  'check run',
  'mergeability',
  '\u4e2d\u6587\u7f16\u7801',
  '\u4e71\u7801',
  '\u8c03\u7528\u6280\u5de7',
];
const KNOWLEDGE_CACHE_TERMS = [
  'cache this',
  'knowledge cache',
  'remember that',
  'wiki',
  'relearn',
  'learned again',
  'from scratch',
  'where is',
  'where are',
  'locate',
  '\u77e5\u8bc6\u7f13\u5b58',
  '\u7f13\u5b58',
  '\u6bcf\u6b21\u5bf9\u8bdd',
  '\u5b9a\u4f4d',
];
const AUTOMATION_TERMS = [
  'automation',
  'scheduled',
  'schedule',
  'cron',
  'timer',
  'recurring',
  'monitor',
  '\u5b9a\u65f6',
  '\u81ea\u52a8\u5316',
];

function usage() {
  return `Usage: node skills/agent-interaction-audit/scripts/collect-agent-interaction-events.mjs --repo <path> [--since 30d] [--hosts codex,claude-code] [--out <dir>] [--json]

Options:
  --repo <path>          Repository to audit. Defaults to cwd.
  --since <range>        Duration like 30d, 12h, 90m, or an ISO date. Defaults to 30d.
  --hosts <list>         Comma-separated hosts: codex, claude-code. Defaults to both.
  --codex-root <path>    Extra Codex trace root. Repeat or use the OS path separator.
  --claude-root <path>   Extra Claude Code trace root. Repeat or use the OS path separator.
  --prompt-root <path>   Extra prompt/rule context root. Repeat or use the OS path separator.
  --automation-root <path> Extra automation log root. Repeat or use the OS path separator.
  --include-cross-repo   Allow text-based matches from sessions or automations outside --repo.
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
    promptRoots: [],
    automationRoots: [],
    includeCrossRepo: false,
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
    } else if (arg === '--prompt-root') {
      options.promptRoots.push(...splitPathList(readValue(argv, ++index, arg)));
    } else if (arg === '--automation-root') {
      options.automationRoots.push(...splitPathList(readValue(argv, ++index, arg)));
    } else if (arg === '--include-cross-repo') {
      options.includeCrossRepo = true;
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
    scopePathCache: new Map(),
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
  return path.join(os.tmpdir(), 'agent-interaction-audit-reports', `${slugify(identity.packageName || identity.basename)}-${stamp}`);
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

  roots.push({
    root: identity.repo,
    host: 'repo',
    sourceType: 'repo-prompt-context',
    sourceClass: 'prompt-context',
    scanMode: 'prompt-context',
    required: true,
    repoAffinityHint: 'repo-prompt-context',
  });
  for (const root of options.promptRoots || []) {
    roots.push({
      root: path.resolve(root),
      host: 'prompt-context',
      sourceType: 'override-prompt-context',
      sourceClass: 'prompt-context',
      scanMode: 'prompt-context',
      required: false,
      repoAffinityHint: 'global-prompt-context',
    });
  }

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
    roots.push({
      root: path.join(identity.repo, '.codex'),
      host: 'codex',
      sourceType: 'repo-prompt-context',
      sourceClass: 'prompt-context',
      scanMode: 'prompt-context',
      required: false,
      repoAffinityHint: 'repo-prompt-context',
    });
    roots.push({
      root: path.join(identity.repo, '.codex', 'automations'),
      host: 'codex',
      sourceType: 'repo-automation-log',
      sourceClass: 'automation-log',
      scanMode: 'automation-log',
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
        requiresRepoScope: !options.includeCrossRepo,
      });
    }
    roots.push({
      root: path.join(home, '.codex', 'sessions'),
      host: 'codex',
      sourceType: 'user-host-trace',
      sourceClass: 'host-trace',
      scanMode: 'host-trace',
      required: false,
      requiresRepoScope: !options.includeCrossRepo,
    });
    roots.push({
      root: path.join(home, '.codex', 'automations'),
      host: 'codex',
      sourceType: 'user-automation-log',
      sourceClass: 'automation-log',
      scanMode: 'automation-log',
      required: false,
      requiresRepoScope: !options.includeCrossRepo,
    });
    roots.push({
      root: path.join(home, '.codex'),
      host: 'codex',
      sourceType: 'user-prompt-context',
      sourceClass: 'prompt-context',
      scanMode: 'prompt-context',
      required: false,
      repoAffinityHint: 'global-prompt-context',
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
    roots.push({
      root: path.join(identity.repo, '.claude'),
      host: 'claude-code',
      sourceType: 'repo-prompt-context',
      sourceClass: 'prompt-context',
      scanMode: 'prompt-context',
      required: false,
      repoAffinityHint: 'repo-prompt-context',
    });
    for (const root of options.claudeRoots) {
      roots.push({
        root: path.resolve(root),
        host: 'claude-code',
        sourceType: 'override-host-root',
        sourceClass: 'host-trace',
        scanMode: 'host-trace',
        required: false,
        requiresRepoScope: !options.includeCrossRepo,
      });
    }

    const claudeHome = path.join(home, '.claude');
    roots.push(...discoverClaudeProjectRoots(path.join(claudeHome, 'projects'), identity, warnings, options.includeCrossRepo));
    roots.push({
      root: path.join(claudeHome, 'history.jsonl'),
      host: 'claude-code',
      sourceType: 'user-host-history',
      sourceClass: 'host-trace',
      scanMode: 'single-file',
      required: false,
      requiresRepoScope: !options.includeCrossRepo,
    });
    roots.push({
      root: path.join(claudeHome, 'tasks'),
      host: 'claude-code',
      sourceType: 'user-host-task',
      sourceClass: 'host-trace',
      scanMode: 'host-trace',
      required: false,
      requiresRepoScope: !options.includeCrossRepo,
    });
    roots.push({
      root: claudeHome,
      host: 'claude-code',
      sourceType: 'user-prompt-context',
      sourceClass: 'prompt-context',
      scanMode: 'prompt-context',
      required: false,
      repoAffinityHint: 'global-prompt-context',
    });
  }

  for (const root of options.automationRoots || []) {
    roots.push({
      root: path.resolve(root),
      host: 'automation',
      sourceType: 'override-automation-log',
      sourceClass: 'automation-log',
      scanMode: 'automation-log',
      required: false,
      requiresRepoScope: !options.includeCrossRepo,
    });
  }

  const seen = new Set();
  return roots.filter((entry) => {
    const key = [
      path.resolve(entry.root).toLowerCase(),
      entry.host,
      entry.sourceType,
      entry.scanMode,
    ].join('|');
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

function discoverClaudeProjectRoots(projectsRoot, identity, warnings, includeCrossRepo = false) {
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
  const weakKeys = includeCrossRepo
    ? new Set(compact([identity.basename, identity.remoteName]).map(normalizeProjectKey))
    : new Set();
  const roots = [];
  let projectCount = 0;
  for (const entry of fs.readdirSync(projectsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    projectCount += 1;
    const key = normalizeProjectKey(entry.name);
    const exact = exactKeys.has(key);
    const weak = includeCrossRepo && [...weakKeys].some((weakKey) => weakKey && key.includes(weakKey));
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

function listCandidateFiles(rootEntry, identity, sinceDate, maxRemaining, warnings, scopeStats) {
  if (!fs.existsSync(rootEntry.root)) {
    warnings.push(`Skipped missing ${rootEntry.host} root: ${rootEntry.root}`);
    return [];
  }

  const rootStat = safeStat(rootEntry.root, warnings);
  if (!rootStat) {
    return [];
  }

  if (rootStat.isFile()) {
    return includeFile(rootEntry, identity, rootEntry.root, rootStat, sinceDate, warnings, scopeStats) ? [{
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
      if (!stat || !includeFile(rootEntry, identity, child, stat, sinceDate, warnings, scopeStats)) {
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
  if (rootEntry.scanMode === 'automation-memory' || rootEntry.scanMode === 'automation-log') {
    return !AUTOMATION_SKIP_DIRS.has(lower);
  }
  if (rootEntry.scanMode === 'prompt-context') {
    return !PROMPT_SKIP_DIRS.has(lower);
  }
  return !HOST_SKIP_DIRS.has(lower);
}

function includeFile(rootEntry, identity, filePath, stat, sinceDate, warnings, scopeStats) {
  const name = path.basename(filePath);
  const ext = path.extname(name).toLowerCase();
  const isPromptContext = rootEntry.scanMode === 'prompt-context' && isPromptContextFile(identity, filePath);
  if (!TEXT_EXTENSIONS.has(ext) && !CORE_REPO_FILES.has(name) && !isPromptContext) {
    return false;
  }

  if (rootEntry.scanMode === 'repo-state' && !isRepoStateFile(identity, filePath)) {
    return false;
  }
  if (rootEntry.scanMode === 'host-trace' && isPromptContext) {
    return false;
  }
  if (rootEntry.scanMode === 'automation-memory' && name.toLowerCase() !== 'memory.md') {
    return false;
  }
  if (rootEntry.scanMode === 'automation-log' && !isAutomationEvidenceFile(filePath)) {
    return false;
  }
  if (rootEntry.scanMode === 'automation-log' && rootEntry.requiresRepoScope) {
    const automationScope = automationScopePathMatch(rootEntry, identity, filePath, warnings);
    if (!automationScope.scoped) {
      scopeStats.skippedOutOfScopeAutomations += 1;
      recordScopeSample(scopeStats.skippedOutOfScopeAutomationSamples, {
        kind: 'automation',
        reason: automationScope.reason,
        host: rootEntry.host,
        sourceType: rootEntry.sourceType,
        sourceClass: rootEntry.sourceClass,
        path: filePath,
        configPath: automationScope.configPath,
        scopePath: automationScope.scopePath,
      });
      return false;
    }
  }
  if (rootEntry.scanMode === 'prompt-context' && !isPromptContext) {
    return false;
  }

  const alwaysInclude = rootEntry.scanMode === 'repo-state' && isRepoStateFile(identity, filePath);
  return alwaysInclude || isPromptContext || stat.mtime >= sinceDate;
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

function isAutomationEvidenceFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return TEXT_EXTENSIONS.has(ext);
}

function isScopedAutomationFile(rootEntry, identity, filePath, warnings) {
  return automationScopePathMatch(rootEntry, identity, filePath, warnings).scoped;
}

function automationScopePathMatch(rootEntry, identity, filePath, warnings) {
  if (isInside(filePath, identity.repo)) {
    return { scoped: true, reason: 'repo-scoped-path', configPath: null, scopePath: filePath };
  }
  const configPath = findAutomationConfigPath(rootEntry, filePath);
  if (!configPath) {
    return { scoped: false, reason: 'missing-automation-config', configPath: null, scopePath: null };
  }
  const config = readSmallTextFile(configPath, warnings);
  const cwds = extractAutomationCwds(config);
  if (cwds.length === 0) {
    return { scoped: false, reason: 'missing-automation-cwd', configPath, scopePath: null };
  }
  for (const cwd of cwds) {
    const scopeMatch = repoScopePathMatch(cwd, identity);
    if (scopeMatch.scoped) {
      return { scoped: true, reason: scopeMatch.reason || 'repo-scoped-cwd', configPath, scopePath: cwd };
    }
  }
  return { scoped: false, reason: 'automation-cwd-outside-current-repo', configPath, scopePath: cwds[0] || null };
}

function findAutomationConfigPath(rootEntry, filePath) {
  const root = path.resolve(rootEntry.root);
  let current = path.dirname(path.resolve(filePath));
  while (isInside(current, root)) {
    const configPath = path.join(current, 'automation.toml');
    if (fs.existsSync(configPath)) {
      return configPath;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return null;
}

function readSmallTextFile(filePath, warnings) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    warnings.push(`Unreadable automation config: ${filePath} (${error.message})`);
    return '';
  }
}

function extractAutomationCwds(config) {
  const values = [];
  const pattern = /^\s*cwd[s]?\s*=\s*(\[[^\]]*\]|"[^"]*"|'[^']*')/gmi;
  for (const match of config.matchAll(pattern)) {
    const raw = match[1] || '';
    for (const quoted of raw.matchAll(/"((?:\\"|[^"])*)"|'((?:\\'|[^'])*)'/g)) {
      values.push((quoted[1] || quoted[2] || '')
        .replace(/\\\\/g, '\\')
        .replace(/\\(["'])/g, '$1'));
    }
  }
  return values;
}

function isPromptContextFile(identity, filePath) {
  const name = path.basename(filePath);
  const lowerName = name.toLowerCase();
  const rel = isInside(filePath, identity.repo)
    ? path.relative(identity.repo, filePath).replace(/\\/g, '/')
    : filePath.replace(/\\/g, '/');
  if (PROMPT_CONTEXT_FILES.has(name)) {
    return true;
  }
  if (PROMPT_CONTEXT_FILES.has(lowerName)) {
    return true;
  }
  if (lowerName.endsWith('.prompt.md') || lowerName.endsWith('.instructions.md')) {
    return true;
  }
  if (rel.startsWith('knowledge/')) {
    return TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase());
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

  if (rootEntry.requiresRepoScope && rootEntry.scanMode === 'automation-log') {
    return repoScopedAffinity(['repo-scoped-automation']);
  }

  if (rootEntry.scanMode === 'repo-state' && isInside(filePath, identity.repo)) {
    return {
      repoAffinity: 'background',
      relevance: 'confirmed',
      confidence: 'medium',
      matchedTerms: ['repo-state'],
    };
  }

  if (rootEntry.scanMode === 'prompt-context' && isInside(filePath, identity.repo)) {
    return {
      repoAffinity: 'background',
      relevance: 'confirmed',
      confidence: 'medium',
      matchedTerms: ['repo-prompt-context'],
    };
  }

  if (rootEntry.repoAffinityHint === 'global-prompt-context') {
    return {
      repoAffinity: 'background',
      relevance: 'confirmed',
      confidence: 'medium',
      matchedTerms: ['global-prompt-context'],
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

function repoScopedAffinity(matchedTerms = ['repo-scoped-cwd']) {
  return {
    repoAffinity: 'exact',
    relevance: 'confirmed',
    confidence: 'high',
    matchedTerms,
  };
}

function isRepoScopePath(value, identity) {
  return repoScopePathMatch(value, identity).scoped;
}

function repoScopePathMatch(value, identity) {
  const text = String(value || '').trim();
  if (!text) {
    return { scoped: false, reason: null };
  }
  const normalized = text.startsWith('file://') ? fileURLToPathSafe(text) : text;
  if (!normalized) {
    return { scoped: false, reason: null };
  }
  const resolved = path.resolve(normalized);
  if (isInside(resolved, identity.repo)) {
    return { scoped: true, reason: 'repo-scoped-cwd' };
  }
  const logicalMatch = sameLogicalRepoPath(resolved, identity);
  return logicalMatch
    ? { scoped: true, reason: logicalMatch }
    : { scoped: false, reason: null };
}

function sameLogicalRepoPath(candidatePath, identity) {
  const cacheKey = path.resolve(candidatePath);
  if (identity.scopePathCache?.has(cacheKey)) {
    return identity.scopePathCache.get(cacheKey);
  }

  if (!fs.existsSync(candidatePath)) {
    identity.scopePathCache?.set(cacheKey, null);
    return null;
  }
  const candidateGitRoot = runGit(candidatePath, ['rev-parse', '--show-toplevel']);
  const candidateRemoteUrl = runGit(candidatePath, ['config', '--get', 'remote.origin.url']);
  if (sameNormalizedRemote(candidateRemoteUrl, identity.remoteUrl)) {
    identity.scopePathCache?.set(cacheKey, 'repo-scoped-git-remote');
    return 'repo-scoped-git-remote';
  }
  if (candidateGitRoot && identity.gitRoot && path.resolve(candidateGitRoot) === path.resolve(identity.gitRoot)) {
    identity.scopePathCache?.set(cacheKey, 'repo-scoped-git-root');
    return 'repo-scoped-git-root';
  }
  const candidatePackageName = readPackageName(candidateGitRoot || candidatePath);
  const candidateBase = path.basename(candidateGitRoot || candidatePath);
  if (candidatePackageName
    && identity.packageName
    && candidatePackageName === identity.packageName
    && candidateBase === identity.basename) {
    identity.scopePathCache?.set(cacheKey, 'repo-scoped-package');
    return 'repo-scoped-package';
  }
  identity.scopePathCache?.set(cacheKey, null);
  return null;
}

function readPackageName(repoPath) {
  const packagePath = path.join(repoPath, 'package.json');
  if (!fs.existsSync(packagePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(packagePath, 'utf8')).name || null;
  } catch {
    return null;
  }
}

function sameNormalizedRemote(first, second) {
  const normalizedFirst = normalizeRemoteUrl(first);
  const normalizedSecond = normalizeRemoteUrl(second);
  return Boolean(normalizedFirst && normalizedSecond && normalizedFirst === normalizedSecond);
}

function normalizeRemoteUrl(value) {
  const text = String(value || '').trim().replace(/\\/g, '/');
  if (!text) {
    return null;
  }
  const github = text.match(/github\.com[:/]([^/]+\/.+?)(?:\.git)?$/i);
  if (github) {
    return `github.com/${github[1].replace(/\.git$/i, '').toLowerCase()}`;
  }
  return text
    .replace(/^git\+/, '')
    .replace(/\.git$/i, '')
    .toLowerCase();
}

function fileURLToPathSafe(value) {
  try {
    return fileURLToPath(value);
  } catch {
    return null;
  }
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
    userFriction: includesAny(text, USER_FRICTION_TERMS),
    guidanceDrift: includesAny(text, GUIDANCE_DRIFT_TERMS),
    repeatedMistake: includesAny(text, REPEATED_MISTAKE_TERMS),
    sopLesson: includesAny(text, SOP_TERMS),
    encodingIssue: includesAny(text, ['encoding', 'utf-8', 'utf8', 'gbk', 'cp936', '\u4e2d\u6587\u7f16\u7801', '\u4e71\u7801']),
    githubSop: includesAny(text, ['github', 'gh ', 'pull request', 'pr status', 'mergeability', 'check run', 'status check']),
    knowledgeCache: includesAny(text, KNOWLEDGE_CACHE_TERMS),
    automation: includesAny(text, AUTOMATION_TERMS),
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

function extractEvents(candidate, content, identity, warnings, scopeStats, baseIndex) {
  const ext = path.extname(candidate.path).toLowerCase();
  if (candidate.rootEntry.sourceClass === 'host-trace' && ext === '.jsonl') {
    return extractJsonlEvents(candidate, content, identity, warnings, scopeStats, baseIndex);
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

function extractJsonlEvents(candidate, content, identity, warnings, scopeStats, baseIndex) {
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
  let hasScopedCwd = false;
  let includedSameRepoWorktree = false;
  const primaryScopePaths = [];
  const workspaceRootScopePaths = [];
  for (const record of records) {
    const scopePaths = extractScopePathGroups(record.value);
    primaryScopePaths.push(...scopePaths.primary);
    workspaceRootScopePaths.push(...scopePaths.workspaceRoots);
  }

  const scopePaths = candidate.rootEntry.requiresRepoScope && primaryScopePaths.length > 0
    ? unique(primaryScopePaths)
    : unique([...primaryScopePaths, ...workspaceRootScopePaths]);
  for (const scopePath of scopePaths) {
    const scopeMatch = repoScopePathMatch(scopePath, identity);
    if (scopeMatch.scoped) {
      hasScopedCwd = true;
      if (scopeMatch.reason && scopeMatch.reason !== 'repo-scoped-cwd') {
        includedSameRepoWorktree = true;
      }
      sessionAffinity = mergeAffinity(sessionAffinity, repoScopedAffinity([scopeMatch.reason || 'repo-scoped-cwd']));
    } else if (!candidate.rootEntry.requiresRepoScope) {
      sessionAffinity = mergeAffinity(sessionAffinity, assessRepoAffinity(candidate.path, scopePath, candidate.rootEntry, identity));
    }
  }

  if (candidate.rootEntry.requiresRepoScope && !hasScopedCwd) {
    scopeStats.skippedOutOfScopeSessions += 1;
    recordScopeSample(scopeStats.skippedOutOfScopeSessionSamples, {
      kind: 'session',
      reason: scopePaths.length > 0 ? 'scope-path-outside-current-repo' : 'missing-cwd-or-workspace',
      host: candidate.rootEntry.host,
      sourceType: candidate.rootEntry.sourceType,
      sourceClass: candidate.rootEntry.sourceClass,
      path: candidate.path,
      scopePath: scopePaths[0] || null,
    });
    return [];
  }
  if (includedSameRepoWorktree) {
    scopeStats.includedSameRepoWorktreeSessions += 1;
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
      candidate.rootEntry.requiresRepoScope
        ? { repoAffinity: 'none', relevance: 'unrelated', confidence: 'low', matchedTerms: [] }
        : assessRepoAffinity(candidate.path, `${extracted.text} ${extractCwd(record.value) || ''}`, candidate.rootEntry, identity),
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
      resourceUsage: extracted.resourceUsage,
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

function extractScopePaths(record) {
  const scopePaths = extractScopePathGroups(record);
  return unique(compact([...scopePaths.primary, ...scopePaths.workspaceRoots]));
}

function extractScopePathGroups(record) {
  const candidates = [
    extractCwd(record),
    record?.payload?.workspace,
    record?.payload?.workspaceRoot,
    record?.payload?.workspace_root,
    record?.payload?.workspace?.root,
    record?.workspace,
    record?.workspaceRoot,
    record?.workspace_root,
  ];
  const workspaceRoots = [];
  const rootArrays = [
    record?.payload?.workspace_roots,
    record?.payload?.workspaceRoots,
    record?.workspace_roots,
    record?.workspaceRoots,
  ];
  for (const roots of rootArrays) {
    if (Array.isArray(roots)) {
      workspaceRoots.push(...roots);
    }
  }
  return {
    primary: unique(compact(candidates)),
    workspaceRoots: unique(compact(workspaceRoots)),
  };
}

function recordScopeSample(samples, sample) {
  if (!Array.isArray(samples) || samples.length >= MAX_SCOPE_SAMPLES) {
    return;
  }
  const normalized = Object.fromEntries(
    Object.entries(sample)
      .filter(([, value]) => value !== null && value !== undefined && value !== '')
      .map(([key, value]) => [key, typeof value === 'string' ? value.slice(0, 500) : value]),
  );
  const key = `${normalized.kind}:${normalized.reason}:${normalized.path}`;
  if (samples.some((entry) => `${entry.kind}:${entry.reason}:${entry.path}` === key)) {
    return;
  }
  samples.push(normalized);
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
    if (payload.type === 'task_started') {
      return {
        ts: timestamp,
        eventType: 'agent-call',
        text: 'Codex task started',
        resourceUsage: { mode: 'incremental', callCount: 1 },
      };
    }
    if (payload.type === 'task_complete') {
      return {
        ts: timestamp,
        eventType: 'handoff',
        text: payload.last_agent_message || '',
        signals: { handoff: true },
        resourceUsage: compactResourceUsage('incremental', {
          durationMs: payload.duration_ms,
        }),
      };
    }
    if (payload.type === 'token_count') {
      const usage = payload.info?.total_token_usage;
      const resourceUsage = compactResourceUsage('cumulative', {
        inputTokens: usage?.input_tokens,
        outputTokens: usage?.output_tokens,
      });
      return resourceUsage ? {
        ts: timestamp,
        eventType: 'resource-usage',
        text: 'Codex cumulative token usage',
        resourceUsage,
      } : null;
    }
    if (payload.type === 'sub_agent_activity' && payload.kind === 'started') {
      return {
        ts: timestamp,
        eventType: 'agent-call',
        text: 'Codex subagent started',
        resourceUsage: { mode: 'incremental', callCount: 1 },
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
    return {
      ts: timestamp,
      eventType: toolUses.length > 0 ? 'tool-call' : 'agent-call',
      text: toolUses.length > 0
        ? toolUses.map((item) => `${item.name || 'tool'} ${compactJson(item.input || {})}`).join(' ')
        : 'Claude assistant response',
      signals: toolUses.length > 0 ? { toolTrace: true } : {},
      resourceUsage: compactResourceUsage('incremental', {
        callCount: 1,
        inputTokens: claudeInputTokens(message.usage),
        outputTokens: message.usage?.output_tokens,
      }),
    };
  }

  if (record.type === 'result') {
    return {
      ts: timestamp,
      eventType: 'cli-call',
      text: `Claude CLI result ${record.subtype || ''}`.trim(),
      resourceUsage: compactResourceUsage('cumulative', {
        callCount: 1,
        durationMs: record.duration_ms,
        inputTokens: claudeInputTokens(record.usage),
        outputTokens: record.usage?.output_tokens,
        costUsd: record.total_cost_usd,
      }),
    };
  }
  return null;
}

function finiteNonNegative(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function compactResourceUsage(mode, values) {
  const resourceUsage = { mode };
  for (const [key, value] of Object.entries(values)) {
    const numericValue = finiteNonNegative(value);
    if (numericValue !== undefined) {
      resourceUsage[key] = numericValue;
    }
  }
  return Object.keys(resourceUsage).length > 1 ? resourceUsage : undefined;
}

function claudeInputTokens(usage) {
  const values = [
    usage?.input_tokens,
    usage?.cache_creation_input_tokens,
    usage?.cache_read_input_tokens,
  ].map(finiteNonNegative).filter((value) => value !== undefined);
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) : undefined;
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
    ...sourceSignalsFor(sourceClass, candidate.rootEntry.sourceType),
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
    ...(details.resourceUsage ? { resourceUsage: details.resourceUsage } : {}),
  };
}

function sourceSignalsFor(sourceClass, sourceType) {
  return {
    promptContext: sourceClass === 'prompt-context',
    automation: sourceClass === 'automation-log'
      || sourceClass === 'automation-memory'
      || String(sourceType || '').includes('automation'),
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
  if (sourceClass === 'automation-memory' || sourceClass === 'automation-log' || sourceClass === 'host-trace') {
    return ['user-message', 'tool-call', 'tool-result', 'handoff'].includes(eventType) ? 'interaction' : 'context';
  }
  if (sourceClass === 'prompt-context') {
    return 'context';
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

export function collectAgentInteractionEvents(options) {
  const repoPath = path.resolve(options.repo || process.cwd());
  if (!fs.existsSync(repoPath) || !fs.statSync(repoPath).isDirectory()) {
    throw new Error(`Repository path does not exist or is not a directory: ${repoPath}`);
  }

  const sinceDate = parseSince(options.since || '30d');
  const hosts = normalizeHosts(options.hosts || 'codex,claude-code');
  const identity = discoverRepoIdentity(repoPath);
  const warnings = [];
  const scopeStats = {
    skippedOutOfScopeSessions: 0,
    skippedOutOfScopeAutomations: 0,
    includedSameRepoWorktreeSessions: 0,
    skippedOutOfScopeSessionSamples: [],
    skippedOutOfScopeAutomationSamples: [],
  };
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
    candidates.push(...listCandidateFiles(rootEntry, identity, sinceDate, remaining, warnings, scopeStats));
  }

  const events = [];
  for (const candidate of candidates) {
    const content = readTextFile(candidate.path, warnings, options);
    if (!content.trim()) {
      continue;
    }
    events.push(...extractEvents(candidate, content, identity, warnings, scopeStats, events.length));
  }

  const filteredEvents = events
    .filter((event) => event.relevance !== 'unrelated' && event.sourceClass !== 'cache-noise')
    .sort((a, b) => a.ts.localeCompare(b.ts) || a.path.localeCompare(b.path) || a.id.localeCompare(b.id));

  const ledgerPath = path.join(outDir, 'agent-interaction-events.jsonl');
  const manifestPath = path.join(outDir, 'agent-interaction-manifest.json');
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
      requiresRepoScope: Boolean(entry.requiresRepoScope),
      root: entry.root,
      exists: fs.existsSync(entry.root),
    })),
    outputs: {
      outDir,
      ledgerPath,
      manifestPath,
    },
    counts: summarizeEvents(filteredEvents),
    scope: scopeStats,
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
      const result = collectAgentInteractionEvents(options);
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
      console.error(`collect-agent-interaction-events: ${error.message}`);
    }
    process.exitCode = 1;
  }
}
