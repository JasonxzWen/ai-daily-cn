#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const requiredFiles = [
  'AGENTS.md',
  'feature_list.json',
  'progress.md',
  'session-handoff.md',
  'clean-state-checklist.md',
  'definition-of-done.md',
  'tasks/current-task.md',
  'tasks/daily-publish-runbook.md',
  'tasks/templates/daily-publish-task.md',
  'scripts/harness-validate.mjs',
];
const forbiddenFiles = ['CLAUDE.md'];
const sizeLimits = {
  'AGENTS.md': 32 * 1024,
  'progress.md': 16 * 1024,
  'session-handoff.md': 16 * 1024,
  'tasks/current-task.md': 16 * 1024,
};
const requiredMarkers = {
  'AGENTS.md': ['Codex', 'worktree', 'session-handoff', 'tasks/daily-publish-runbook.md', 'publish:dry-run'],
  'tasks/current-task.md': [
    'Goal',
    'Allowed paths',
    'Forbidden paths',
    'Validation commands',
    'Parallel writes',
    'Handoff requirements',
  ],
  'tasks/daily-publish-runbook.md': [
    'Preflight',
    'Source Discovery',
    'Report Write',
    'Build And Validate',
    'Dry Run',
    'Real Publish',
    'GitHub API Fallback',
    'Handoff',
    'npm run publish:dry-run',
    'npm run publish -- confirm-push YYYY-MM-DD',
    'npm run publish:github-api -- confirm-push YYYY-MM-DD',
  ],
  'tasks/templates/daily-publish-task.md': [
    'YYYY-MM-DD',
    'Asia/Shanghai',
    'Real publish requires explicit confirmation',
    'npm run validate',
    'npm run publish:dry-run',
  ],
};
const requiredPackageScripts = {
  'prompt:build': ['src/cli.js', 'prompt:build'],
  'report:write': ['src/cli.js', 'report:write'],
  build: ['src/cli.js', 'build', '--out docs'],
  test: ['node --test'],
  'test:e2e': ['scripts/run-e2e.mjs'],
  'validate:openspec': ['scripts/validate-openspec.mjs'],
  validate: ['npm run test', 'npm run build', 'npm run test:e2e', 'npm run validate:openspec', 'git diff --check'],
  'publish:prepare-worktree': ['src/cli.js', 'publish:prepare-worktree'],
  'publish:prepare-clean-worktree': ['src/cli.js', 'publish:prepare-clean-worktree'],
  'publish:preflight': ['src/cli.js', 'publish:preflight'],
  'publish:dry-run': ['src/cli.js', 'publish:dry-run', '--out docs'],
  'publish:github-api': ['src/cli.js', 'publish:github-api'],
  publish: ['src/cli.js', 'publish'],
  'discover:github-trending': ['src/cli.js', 'discover:github-trending'],
  'discover:builders': ['src/cli.js', 'discover:builders'],
  'discover:content-sources': ['src/cli.js', 'discover:content-sources'],
  'discover:statuspage-incidents': ['src/cli.js', 'discover:statuspage-incidents'],
};
const requiredFeatureIds = [
  'daily-source-discovery',
  'structured-report-write',
  'static-html-build',
  'publish-preflight',
  'publish-dry-run',
  'publish-execute',
  'daily-publish-harness',
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

const featureStatePath = path.join(root, 'feature_list.json');
if (fs.existsSync(featureStatePath)) {
  try {
    const featureState = JSON.parse(fs.readFileSync(featureStatePath, 'utf8'));
    const missing = [];
    if (!isRecord(featureState) || !Array.isArray(featureState.features)) {
      missing.push('features array');
    }
    if (!isRecord(featureState) || !isRecord(featureState.parallel_write_policy)) {
      missing.push('parallel_write_policy object');
    }
    if (missing.length > 0) {
      failures.push(`feature_list.json: missing required structure ${missing.join(', ')}`);
    }
    if (isRecord(featureState) && Array.isArray(featureState.features)) {
      validateFeatureList(featureState.features, failures);
    }
  } catch {
    failures.push('feature_list.json: must be valid JSON');
  }
}

validatePackageScripts(failures);

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

function validateFeatureList(features, failures) {
  const featureById = new Map();

  for (const feature of features) {
    if (!isRecord(feature) || typeof feature.id !== 'string') {
      failures.push('feature_list.json: every feature must be an object with a string id');
      continue;
    }
    featureById.set(feature.id, feature);
  }

  for (const id of requiredFeatureIds) {
    if (!featureById.has(id)) {
      failures.push(`feature_list.json: missing required daily publish feature ${id}`);
    }
  }

  for (const id of requiredFeatureIds) {
    const feature = featureById.get(id);
    if (!feature) continue;
    if (!['active', 'planned', 'blocked', 'complete'].includes(feature.status)) {
      failures.push(`feature_list.json: ${id} has invalid status`);
    }
    if (typeof feature.summary !== 'string' || feature.summary.trim().length === 0) {
      failures.push(`feature_list.json: ${id} must include a summary`);
    }
    if (!Array.isArray(feature.commands) || feature.commands.length === 0) {
      failures.push(`feature_list.json: ${id} must list commands`);
    }
    if (!Array.isArray(feature.artifacts) || feature.artifacts.length === 0) {
      failures.push(`feature_list.json: ${id} must list artifacts`);
    }
    if (!Array.isArray(feature.acceptance) || feature.acceptance.length < 2) {
      failures.push(`feature_list.json: ${id} must include at least two acceptance checks`);
    }
    if (!Array.isArray(feature.stop_conditions) || feature.stop_conditions.length === 0) {
      failures.push(`feature_list.json: ${id} must include stop conditions`);
    }
  }
}

function validatePackageScripts(failures) {
  const packagePath = path.join(root, 'package.json');
  if (!fs.existsSync(packagePath)) {
    failures.push('package.json: missing required project manifest');
    return;
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  } catch {
    failures.push('package.json: must be valid JSON');
    return;
  }

  const scripts = isRecord(manifest.scripts) ? manifest.scripts : {};
  for (const [scriptName, markers] of Object.entries(requiredPackageScripts)) {
    const command = scripts[scriptName];
    if (typeof command !== 'string' || command.trim().length === 0) {
      failures.push(`package.json: missing required script ${scriptName}`);
      continue;
    }
    const missing = markers.filter((marker) => !command.includes(marker));
    if (missing.length > 0) {
      failures.push(`package.json#scripts.${scriptName}: missing markers ${missing.join(', ')}`);
    }
  }
}
