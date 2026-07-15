#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const migrationManifestPath = path.join(root, '.harness-hub', 'manifest.json');
if (fs.existsSync(migrationManifestPath)) {
  const migrationFailures = await validateRepositoryMigration(root, migrationManifestPath);
  if (migrationFailures.length > 0) {
    console.error('Harness validation failed:');
    for (const failure of migrationFailures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }
  console.log('Harness validation passed.');
  process.exit(0);
}

const requiredFiles = [
  'AGENTS.md',
  'feature_list.json',
  '.harness-hub/.gitignore',
  '.harness-hub/state/decisions.md',
  '.harness-hub/state/progress.md',
  '.harness-hub/state/session-handoff.md',
  '.harness-hub/state/loop-runs.jsonl',
  '.harness-hub/state/interrupt-decisions.jsonl',
  '.harness-hub/state/capability-events.jsonl',
  '.harness-hub/loop/policies/interrupt-policy.md',
  '.harness-hub/loop/policies/action-audit-schema.md',
  '.harness-hub/loop/evals/interrupt-policy/good-cases.jsonl',
  '.harness-hub/loop/evals/interrupt-policy/bad-cases.jsonl',
  '.harness-hub/loop/evals/interrupt-policy/regression-cases.jsonl',
  '.harness-hub/context/AGENTS.md',
  '.harness-hub/context/README.md',
  '.harness-hub/context/llm-wiki-schema.md',
  '.harness-hub/context/wiki/index.md',
  '.harness-hub/context/wiki/sources/README.md',
  '.harness-hub/context/wiki/concepts/README.md',
  '.harness-hub/context/wiki/topics/README.md',
  '.harness-hub/context/wiki/people/README.md',
  '.harness-hub/context/wiki/contradictions.md',
  '.harness-hub/context/wiki/update-log.md',
  '.harness-hub/context/wiki/templates/wiki-page.md',
  '.harness-hub/context/wiki/.obsidian/app.json',
  '.harness-hub/context/wiki/.obsidian/core-plugins.json',
  '.harness-hub/context/wiki/.obsidian/graph.json',
  'clean-state-checklist.md',
  'definition-of-done.md',
  'evaluator-rubric.md',
  'quality-document.md',
  '.harness-hub/state/current-task.md',
  'scripts/harness-validate.mjs',
];
const forbiddenFiles = ['CLAUDE.md'];
const sizeLimits = {
  'AGENTS.md': 32 * 1024,
  '.harness-hub/state/decisions.md': 16 * 1024,
  '.harness-hub/state/progress.md': 16 * 1024,
  '.harness-hub/state/session-handoff.md': 16 * 1024,
  '.harness-hub/state/current-task.md': 16 * 1024,
  '.harness-hub/state/loop-runs.jsonl': 64 * 1024,
  '.harness-hub/state/interrupt-decisions.jsonl': 64 * 1024,
  '.harness-hub/state/capability-events.jsonl': 64 * 1024,
};
const requiredMarkers = {
  'AGENTS.md': ['Codex', 'Initialization Gate', 'Loop Control Plane', 'Interrupt Policy', 'harness-validate.mjs', 'harness-hub check', 'LLM Wiki', '.harness-hub/context/wiki', 'current-task.md', 'checkpoint commit', 'quality snapshot', 'worktree', 'decisions.md', 'session-handoff', 'P0/P1/P2', 'agent-run browser', 'PR status', 'PR handoff', 'mergeability', 'CI/check-run', 'agentic loops', 'delegated-agent', 'Arbiters are read-only', 'finish closeout', 'insight', 'origin/main', 'Every PR must target', 'merge every PR into'],
  '.harness-hub/.gitignore': ['state/', 'reports/'],
  '.harness-hub/context/AGENTS.md': ['LLM Wiki', 'Raw sources', 'No Redundant Facts', 'human confirmation', 'Contradiction Register'],
  '.harness-hub/context/README.md': ['Agent Context Pack', 'Raw sources', 'Wiki pages', 'Obsidian', 'Update Flow'],
  '.harness-hub/context/llm-wiki-schema.md': ['LLM Wiki Schema', 'Raw sources', 'Wiki', 'Stable Knowledge Boundary', 'Update Protocol', 'Contradictions'],
  '.harness-hub/context/wiki/index.md': ['LLM Wiki Index', 'Raw sources', 'Stable Knowledge Map'],
  '.harness-hub/context/wiki/contradictions.md': ['Contradiction Register', 'Resolution status', 'Next action'],
  '.harness-hub/context/wiki/update-log.md': ['Update Log', 'Human confirmation', 'Sources consulted'],
  '.harness-hub/loop/policies/interrupt-policy.md': ['Interrupt Policy', 'standalone', 'composable', 'loop-participant', 'Continue By Default', 'Interrupt', 'Audit Requirement'],
  '.harness-hub/loop/policies/action-audit-schema.md': ['Runtime Ledgers', 'loop-runs.jsonl', 'interrupt-decisions.jsonl', 'capability-events.jsonl', 'continue|interrupt'],
  '.harness-hub/state/decisions.md': ['Active Decisions', 'Resolved Decisions', 'Decision', 'Rationale', 'Status', 'Follow-up'],
  '.harness-hub/state/progress.md': ['Recent Validation', 'Validation Records', 'Command', 'Status', 'Exit code', 'Passed', 'Failed', 'Evidence', 'Commit', 'Runtime Signals', 'Web browser acceptance', 'PR Status', 'Mergeability', 'CI/check runs', 'Agentic Loop Records', 'Main Agent Decision', 'Finish Closeout', 'Insight Recommendations', 'Review Feedback To Rules'],
  '.harness-hub/state/session-handoff.md': ['Validation Evidence', 'Validation Records', 'Command', 'Status', 'Exit code', 'Passed', 'Failed', 'Evidence', 'Commit', 'Runtime Signals', 'Web browser acceptance', 'PR Status', 'Mergeability', 'CI/check runs', 'Agentic Loop Records', 'Main Agent Decision', 'Finish Closeout', 'Insight Recommendations', 'Review Feedback To Rules'],
  '.harness-hub/state/current-task.md': [
    'Goal',
    'Assumptions',
    'Non-goals',
    'Allowed paths',
    'Forbidden paths',
    'Acceptance criteria',
    'Standard startup path',
    'harness-hub check',
    'Validation commands',
    'Validation tiers',
    'P0',
    'P1',
    'P2',
    'Web browser acceptance',
    'agent-run browser',
    'Runtime signals',
    'Agentic loops',
    'Producer',
    'Verifier',
    'Arbiter',
    'Main Agent Decision',
    'PR closeout',
    'Mergeability',
    'CI/check-run status',
    'Finish closeout',
    'Insight audit',
    'Checkpoint policy',
    'Spec updates',
    'Decision log',
    'Parallel writes',
    'Handoff requirements',
  ],
  'clean-state-checklist.md': ['Standard startup path', 'harness-hub check', 'Runtime signals', 'P0', 'P1', 'P2', 'Web browser acceptance', 'Agentic loop records', 'main-agent decision', 'PR status', 'PR URL', 'mergeability', 'CI/check-run', 'Finish closeout', 'insight', 'Review Feedback', 'evaluator-rubric.md', 'quality-document.md'],
  'definition-of-done.md': ['Static checks', 'runtime checks', 'end-to-end', 'P0', 'P1', 'P2', 'agent-run browser', 'Standard startup path', 'harness-hub check', 'Runtime logs', 'Agentic loop evidence', 'producer/verifier/arbiter', 'PR status', 'mergeability', 'CI/check-run', 'finish closeout', 'insight', 'evaluator rubric', 'quality snapshot'],
  'evaluator-rubric.md': ['Correctness', 'Verification', 'Scope discipline', 'Runtime reliability', 'Browser acceptance', 'Agentic loops', 'Finish closeout', 'Insight recommendations', 'Handoff readiness', 'Verdict'],
  'quality-document.md': ['Quality Snapshot', 'Rating Standard', 'Product Areas', 'P0/P1/P2 validation status', 'Browser acceptance status', 'Architecture Layers', 'Change History'],
};
const agentContractPath = path.join(root, 'AGENTS.md');
const usesRepositoryFirstContract = fs.existsSync(agentContractPath)
  && fs.readFileSync(agentContractPath, 'utf8').includes('# Project Agent Contract');
if (usesRepositoryFirstContract) {
  requiredMarkers['AGENTS.md'] = [
    'Project Agent Contract',
    'Native Host execution',
    'Harness Hub updates',
    'Project knowledge (Google OKF v0.1)',
    'Use concise Chinese by default',
  ];
  requiredMarkers['.harness-hub/.gitignore'] = ['state/'];
}
const agentArchitectureMarkers = [
  'worktree_policy',
  'parallel_write_policy',
  'read_only_parallel_work',
  'single integration review point',
  'non-overlapping',
];

const failures = [];

for (const file of requiredFiles) {
  const filePath = path.join(root, file);
  if (!fs.existsSync(filePath)) {
    failures.push(`${file}: missing required harness file`);
  }
}

for (const file of forbiddenFiles) {
  if (fs.existsSync(path.join(root, file))) {
    failures.push(`${file}: non-Codex platform instruction file is present`);
  }
}

for (const [file, limit] of Object.entries(sizeLimits)) {
  const filePath = path.join(root, file);
  if (fs.existsSync(filePath)) {
    const size = fs.statSync(filePath).size;
    if (size > limit) {
      failures.push(`${file}: size ${size} exceeds limit ${limit}`);
    }
  }
}

for (const [file, markers] of Object.entries(requiredMarkers)) {
  const filePath = path.join(root, file);
  if (!fs.existsSync(filePath)) {
    continue;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const missing = markers.filter((marker) => !content.includes(marker));
  if (missing.length > 0) {
    failures.push(`${file}: missing markers ${missing.join(', ')}`);
  }
}

const architectureText = [
  'AGENTS.md',
  '.harness-hub/state/current-task.md',
  'feature_list.json',
]
  .map((file) => {
    const filePath = path.join(root, file);
    return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  })
  .join('\n');
const missingArchitectureMarkers = agentArchitectureMarkers.filter((marker) => !architectureText.includes(marker));
if (missingArchitectureMarkers.length > 0) {
  failures.push(`agent architecture boundary: missing markers ${missingArchitectureMarkers.join(', ')}`);
}

const skillsDir = path.join(root, 'skills');
if (fs.existsSync(skillsDir) && fs.statSync(skillsDir).isDirectory()) {
  const triggerIssues = [];
  for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const skillPath = path.join(skillsDir, entry.name, 'SKILL.md');
    if (!fs.existsSync(skillPath)) {
      continue;
    }
    const description = parseSkillDescription(fs.readFileSync(skillPath, 'utf8'));
    if (!description) {
      triggerIssues.push(`${entry.name}: missing description`);
      continue;
    }
    if (!/(load when|use when|when|asks|needs|requests|trigger)/i.test(description)) {
      triggerIssues.push(`${entry.name}: description lacks an activation condition`);
    }
    if (/(always use|every request|all requests|all tasks|any task|whenever possible)/i.test(description)) {
      triggerIssues.push(`${entry.name}: description uses broad activation wording`);
    }
  }
  if (triggerIssues.length > 0) {
    failures.push(`skill trigger hygiene: ${triggerIssues.slice(0, 8).join('; ')}${triggerIssues.length > 8 ? `; +${triggerIssues.length - 8} more` : ''}`);
  }
}

const featureStatePath = path.join(root, 'feature_list.json');
if (fs.existsSync(featureStatePath)) {
  try {
    const featureState = JSON.parse(fs.readFileSync(featureStatePath, 'utf8'));
    const missing = [];
    if (!isRecord(featureState) || !Array.isArray(featureState.features)) {
      missing.push('features array');
    }
    if (!isRecord(featureState) || !isRecord(featureState.feature_state_policy)) {
      missing.push('feature_state_policy object');
    }
    if (!isRecord(featureState) || !isRecord(featureState.validation_priority_policy)) {
      missing.push('validation_priority_policy object');
    }
    if (!isRecord(featureState) || !isRecord(featureState.web_acceptance_policy)) {
      missing.push('web_acceptance_policy object');
    }
    if (!isRecord(featureState) || !isRecord(featureState.pr_closeout_policy)) {
      missing.push('pr_closeout_policy object');
    }
    if (!isRecord(featureState) || !isRecord(featureState.finish_closeout_policy)) {
      missing.push('finish_closeout_policy object');
    }
    if (!isRecord(featureState) || !isRecord(featureState.agentic_loop_policy)) {
      missing.push('agentic_loop_policy object');
    }
    if (!isRecord(featureState) || !isRecord(featureState.loop_control_policy)) {
      missing.push('loop_control_policy object');
    }
    if (!isRecord(featureState) || !isRecord(featureState.context_engineering_policy)) {
      missing.push('context_engineering_policy object');
    }
    if (!isRecord(featureState) || !isRecord(featureState.parallel_write_policy)) {
      missing.push('parallel_write_policy object');
    }
    if (isRecord(featureState) && Array.isArray(featureState.features)) {
      const invalidFeatures = featureState.features
        .map((feature, index) => ({ feature, index }))
        .filter(({ feature }) => !isValidFeatureRecord(feature))
        .map(({ index }) => `features[${index}]`);
      if (invalidFeatures.length > 0) {
        missing.push(`valid feature records ${invalidFeatures.join(', ')}`);
      }
    }
    if (missing.length > 0) {
        failures.push(`feature_list.json: missing required structure ${missing.join(', ')}`);
    }
  } catch {
    failures.push('feature_list.json: must be valid JSON');
  }
}

for (const file of [
  '.harness-hub/state/loop-runs.jsonl',
  '.harness-hub/state/interrupt-decisions.jsonl',
  '.harness-hub/state/capability-events.jsonl',
]) {
  const issues = parseJsonlIssues(file);
  if (issues.length > 0) {
    failures.push(`${file}: invalid JSONL ${issues.join(', ')}`);
  }
}

for (const evalCase of [
  { file: '.harness-hub/loop/evals/interrupt-policy/good-cases.jsonl', expectedDecision: 'continue' },
  { file: '.harness-hub/loop/evals/interrupt-policy/bad-cases.jsonl', expectedDecision: 'interrupt' },
  { file: '.harness-hub/loop/evals/interrupt-policy/regression-cases.jsonl' },
]) {
  const issues = validateInterruptEvalFile(evalCase.file, evalCase.expectedDecision);
  if (issues.length > 0) {
    failures.push(`${evalCase.file}: interrupt policy eval issues ${issues.slice(0, 6).join('; ')}${issues.length > 6 ? `; +${issues.length - 6} more` : ''}`);
  }
}

const obsidianIssues = validateObsidianPortableProfile();
if (obsidianIssues.length > 0) {
  failures.push(`.harness-hub/context/wiki/.obsidian: ${obsidianIssues.join('; ')}`);
}

if (failures.length > 0) {
  console.error('Harness validation failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(3);
}

console.log('Harness validation passed.');

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJsonlIssues(relativePath) {
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath)) {
    return ['missing'];
  }
  const lines = fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const issues = [];
  lines.forEach((line, index) => {
    try {
      JSON.parse(line);
    } catch {
      issues.push(`line ${index + 1}`);
    }
  });
  return issues;
}

function validateInterruptEvalFile(relativePath, expectedDecision) {
  const parseIssues = parseJsonlIssues(relativePath);
  if (parseIssues.length > 0) {
    return parseIssues;
  }
  const records = fs.readFileSync(path.join(root, relativePath), 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const issues = [];
  if (records.length === 0) {
    issues.push('file must contain at least one eval case');
  }
  records.forEach((record, index) => {
    const prefix = `line ${index + 1}`;
    if (!isRecord(record)) {
      issues.push(`${prefix}: record must be an object`);
      return;
    }
    if (typeof record.id !== 'string' || record.id.trim().length === 0) {
      issues.push(`${prefix}: missing id`);
    }
    if (typeof record.summary !== 'string' || record.summary.trim().length === 0) {
      issues.push(`${prefix}: missing summary`);
    }
    if (record.expectedDecision !== 'continue' && record.expectedDecision !== 'interrupt') {
      issues.push(`${prefix}: expectedDecision must be continue or interrupt`);
    }
    if (expectedDecision && record.expectedDecision !== expectedDecision) {
      issues.push(`${prefix}: expectedDecision must be ${expectedDecision}`);
    }
    if (!Array.isArray(record.riskSignals) || record.riskSignals.length === 0) {
      issues.push(`${prefix}: missing riskSignals`);
    }
    if (!Array.isArray(record.requiredEvidence) || record.requiredEvidence.length === 0) {
      issues.push(`${prefix}: missing requiredEvidence`);
    }
  });
  return issues;
}

function validateObsidianPortableProfile() {
  const profileDir = '.harness-hub/context/wiki/.obsidian';
  const files = [
    `${profileDir}/app.json`,
    `${profileDir}/core-plugins.json`,
    `${profileDir}/graph.json`,
  ];
  const issues = [];
  for (const file of files) {
    const filePath = path.join(root, file);
    if (!fs.existsSync(filePath)) {
      issues.push(`${file}: missing`);
      continue;
    }
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      issues.push(`${file}: invalid JSON`);
      continue;
    }
    const jsonText = JSON.stringify(parsed);
    if (/[A-Za-z]:\\\\|[A-Za-z]:\/|"\/Users\/|"\/home\/|sync|community-plugins|workspace/i.test(jsonText)) {
      issues.push(`${file}: contains non-portable local state marker`);
    }
  }
  return issues;
}

function parseSkillDescription(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    return null;
  }
  const descriptionMatch = match[1].match(/^description:\s*(.+)$/m);
  return descriptionMatch ? descriptionMatch[1].replace(/^['"]|['"]$/g, '').trim() : null;
}

function isValidFeatureRecord(value) {
  if (!isRecord(value)) {
    return false;
  }
  return typeof value.id === 'string'
    && value.id.trim().length > 0
    && typeof value.behavior === 'string'
    && value.behavior.trim().length > 0
    && typeof value.status === 'string'
    && Object.prototype.hasOwnProperty.call(value, 'acceptance')
    && Object.prototype.hasOwnProperty.call(value, 'validation')
    && Object.prototype.hasOwnProperty.call(value, 'evidence');
}

async function validateRepositoryMigration(targetRoot, manifestPath) {
  const failures = [];
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    return ['.harness-hub/manifest.json: must be valid JSON'];
  }

  if (manifest.schemaVersion !== 1) {
    failures.push('.harness-hub/manifest.json: schemaVersion must be 1');
  }
  if (manifest.source?.url !== 'https://github.com/JasonxzWen/harness-hub') {
    failures.push('.harness-hub/manifest.json: source URL must be the canonical Harness Hub repository');
  }
  if (!/^[0-9a-f]{40}$/.test(manifest.source?.commit || '')) {
    failures.push('.harness-hub/manifest.json: source commit must be a full Git SHA');
  }
  if (JSON.stringify(manifest.hosts) !== JSON.stringify(['codex']) || manifest.primaryHost !== 'codex') {
    failures.push('.harness-hub/manifest.json: this repository must use Codex as its only and primary Host');
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    failures.push('.harness-hub/manifest.json: files must be a non-empty array');
  }

  const claudePath = path.join(targetRoot, 'CLAUDE.md');
  if (!fs.existsSync(claudePath) || fs.readFileSync(claudePath, 'utf8') !== '@AGENTS.md\n') {
    failures.push('CLAUDE.md: must contain exactly @AGENTS.md followed by one newline');
  }

  const seen = new Set();
  for (const file of Array.isArray(manifest.files) ? manifest.files : []) {
    const relativePath = typeof file?.path === 'string' ? file.path : '';
    if (!relativePath || relativePath.includes('\\') || path.posix.isAbsolute(relativePath)
      || relativePath.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')) {
      failures.push(`.harness-hub/manifest.json: unsafe managed path '${relativePath}'`);
      continue;
    }
    if (seen.has(relativePath)) {
      failures.push(`.harness-hub/manifest.json: duplicate managed path '${relativePath}'`);
      continue;
    }
    seen.add(relativePath);

    const absolutePath = path.resolve(targetRoot, ...relativePath.split('/'));
    const relativeFromRoot = path.relative(targetRoot, absolutePath);
    if (relativeFromRoot.startsWith('..') || path.isAbsolute(relativeFromRoot)) {
      failures.push(`.harness-hub/manifest.json: managed path escapes repository '${relativePath}'`);
      continue;
    }
    if (hasLinkedPath(targetRoot, absolutePath)) {
      failures.push(`${relativePath}: symlinks and junctions are not allowed in managed paths`);
      continue;
    }
    const stat = fs.lstatSync(absolutePath, { throwIfNoEntry: false });
    if (!stat?.isFile()) {
      failures.push(`${relativePath}: missing managed file`);
      continue;
    }
    const digest = crypto.createHash('sha256').update(fs.readFileSync(absolutePath)).digest('hex');
    if (digest !== file.sha256) {
      failures.push(`${relativePath}: SHA-256 differs from the migration manifest`);
    }
  }

  const validatorPath = path.join(targetRoot, '.harness-hub', 'okf-validate.mjs');
  if (fs.existsSync(validatorPath)) {
    try {
      const { validateOkf } = await import(`${pathToFileURL(validatorPath).href}?validate=${Date.now()}`);
      const result = validateOkf({ targetDir: targetRoot });
      for (const finding of result.findings || []) {
        failures.push(`knowledge/${finding.path}: ${finding.message}`);
      }
    } catch (error) {
      failures.push(`.harness-hub/okf-validate.mjs: ${error.message}`);
    }
  } else {
    failures.push('.harness-hub/okf-validate.mjs: missing managed validator');
  }

  return failures;
}

function hasLinkedPath(targetRoot, filePath) {
  const relativePath = path.relative(targetRoot, filePath);
  let current = targetRoot;
  for (const segment of relativePath.split(path.sep)) {
    current = path.join(current, segment);
    const stat = fs.lstatSync(current, { throwIfNoEntry: false });
    if (stat?.isSymbolicLink()) {
      return true;
    }
  }
  return false;
}
