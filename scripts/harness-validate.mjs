#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const requiredFiles = [
  'AGENTS.md',
  'feature_list.json',
  'config/feedback-ledger.json',
  'docs/feedback-buglist-quick-reference.md',
  'progress.example.md',
  'session-handoff.example.md',
  'clean-state-checklist.md',
  'definition-of-done.md',
  'tasks/current-task.example.md',
  'tasks/daily-publish-runbook.md',
  'tasks/templates/daily-publish-task.md',
  'tasks/templates/sdd-tdd-task.md',
  'schemas/retrospective.schema.json',
  'scripts/validate-retrospectives.mjs',
  'scripts/check-daily-content-contract.mjs',
  'retrospectives/index.json',
  'prompts/ai-daily/modules/editorial-authority.md',
  'scripts/harness-init.mjs',
  'scripts/harness-validate.mjs',
];
const requiredLocalStateFiles = [
  'progress.md',
  'session-handoff.md',
  'tasks/current-task.md',
];
const forbiddenPaths = [
  { path: 'CLAUDE.md', reason: 'non-Codex platform instruction file is present' },
  { path: 'openspec', reason: 'OpenSpec workflow artifacts must be removed from the active repository' },
  { path: 'scripts/validate-openspec.mjs', reason: 'OpenSpec validator must be removed from the active workflow' },
  { path: 'tests/openspec.test.js', reason: 'OpenSpec tests must be removed from the active workflow' },
];
const sizeLimits = {
  'AGENTS.md': 32 * 1024,
  'progress.md': 16 * 1024,
  'session-handoff.md': 16 * 1024,
  'tasks/current-task.md': 16 * 1024,
};
const requiredMarkers = {
  'AGENTS.md': [
    'Codex',
    'worktree',
    'session-handoff',
    'tasks/daily-publish-runbook.md',
    'publish:dry-run',
    'SDD/TDD',
    'Red Test',
    'Feedback Ledger Review',
    'Regression Self-Check',
  ],
  'tasks/current-task.md': [
    'Task Class',
    'Spec',
    'Acceptance Criteria',
    'Allowed Paths',
    'Forbidden Paths',
    'Validation Commands',
    'Parallel Writes',
    'Retrospective Plan',
    'Handoff Requirements',
  ],
  'tasks/current-task.example.md': [
    'Task Class',
    'Spec',
    'Acceptance Criteria',
    'Allowed Paths',
    'Forbidden Paths',
    'Validation Commands',
    'Parallel Writes',
    'Retrospective Plan',
    'Handoff Requirements',
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
    'editorial-authority.md',
  ],
  'tasks/templates/daily-publish-task.md': [
    'YYYY-MM-DD',
    'Asia/Shanghai',
    'Real publish requires explicit confirmation',
    'npm run validate',
    'npm run publish:dry-run',
    'editorial-authority.md',
  ],
  'tasks/templates/sdd-tdd-task.md': [
    'Task Class',
    'Trivial Justification',
    'Spec',
    'Acceptance Criteria',
    'Red Test',
    'Deterministic Substitute',
    'Feedback Ledger Review',
    'Regression Self-Check',
    'Retrospective Plan',
    'Allowed Paths',
    'Forbidden Paths',
    'Validation Commands',
    'Handoff Requirements',
  ],
  'prompts/ai-daily/modules/editorial-authority.md': [
    '迭代维护机制',
    '本轮修改清单',
    'Good Case',
    'Bad Case',
    '迭代历史',
  ],
};
const requiredPackageScripts = {
  'prompt:build': ['src/cli.js', 'prompt:build'],
  'report:write': ['src/cli.js', 'report:write'],
  build: ['src/cli.js', 'build', '--out docs'],
  test: ['node --test'],
  'test:e2e': ['scripts/run-e2e.mjs'],
  'harness:init': ['scripts/harness-init.mjs'],
  'harness:validate': ['scripts/harness-validate.mjs'],
  'retrospectives:validate': ['scripts/validate-retrospectives.mjs'],
  'content:contract': ['scripts/check-daily-content-contract.mjs'],
  'content:contract:self-test': ['scripts/check-daily-content-contract.mjs', '--self-test'],
  validate: ['npm run harness:init', 'npm run harness:validate', 'npm run retrospectives:validate', 'npm run content:contract:self-test', 'npm run test', 'npm run build', 'npm run test:e2e', 'git diff --check'],
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

for (const file of requiredLocalStateFiles) {
  const filePath = path.join(root, file);
  if (!fs.existsSync(filePath)) {
    failures.push(`${file}: missing local harness state; run npm run harness:init`);
  }
}

for (const entry of forbiddenPaths) {
  if (fs.existsSync(path.join(root, entry.path))) {
    failures.push(`${entry.path}: ${entry.reason}`);
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
validateFeedbackQuickReference(failures);
validateCurrentTask(failures);

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
  for (const [scriptName, command] of Object.entries(scripts)) {
    if (scriptName.toLowerCase().includes('openspec')) {
      failures.push(`package.json#scripts.${scriptName}: OpenSpec scripts are not part of the active workflow`);
    }
    if (typeof command === 'string' && /openspec/i.test(command)) {
      failures.push(`package.json#scripts.${scriptName}: OpenSpec command references are not part of the active workflow`);
    }
  }
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

function validateFeedbackQuickReference(failures) {
  const ledgerPath = path.join(root, 'config', 'feedback-ledger.json');
  const quickReferencePath = path.join(root, 'docs', 'feedback-buglist-quick-reference.md');
  if (!fs.existsSync(ledgerPath) || !fs.existsSync(quickReferencePath)) {
    return;
  }

  let ledger;
  try {
    ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
  } catch {
    failures.push('config/feedback-ledger.json: must be valid JSON');
    return;
  }

  const items = Array.isArray(ledger.items) ? ledger.items : [];
  const quickReference = fs.readFileSync(quickReferencePath, 'utf8');
  const missingIds = items
    .map((item) => String(item?.id || '').trim())
    .filter(Boolean)
    .filter((id) => !quickReference.includes(id));

  if (missingIds.length > 0) {
    failures.push(`docs/feedback-buglist-quick-reference.md: missing feedback ledger IDs ${missingIds.join(', ')}`);
  }
}

function validateCurrentTask(failures) {
  const taskPath = path.join(root, 'tasks/current-task.md');
  if (!fs.existsSync(taskPath)) return;

  const content = fs.readFileSync(taskPath, 'utf8');
  const taskClass = firstNonEmptyLine(sectionText(content, 'Task Class')).toLowerCase();
  if (!['non-trivial', 'trivial'].includes(taskClass)) {
    failures.push('tasks/current-task.md: first non-empty Task Class line must be "non-trivial" or "trivial"');
    return;
  }

  validateFeedbackMemorySections(content, failures);

  if (taskClass === 'trivial') {
    const justification = sectionText(content, 'Trivial Justification').trim();
    if (justification.length < 20) {
      failures.push('tasks/current-task.md: trivial tasks require a meaningful Trivial Justification');
    }
    return;
  }

  const redTest = sectionText(content, 'Red Test').trim();
  const substitute = sectionText(content, 'Deterministic Substitute').trim();
  if (redTest.length === 0 && substitute.length === 0) {
    failures.push('tasks/current-task.md: non-trivial tasks require Red Test or Deterministic Substitute');
  }
  if (redTest.length > 0 && !/(node|npm|git|pwsh|powershell|curl|Invoke-)/i.test(redTest)) {
    failures.push('tasks/current-task.md: Red Test must include an executable command or deterministic check');
  }
  if (redTest.length > 0 && !hasFailureEvidence(redTest)) {
    failures.push('tasks/current-task.md: Red Test must record the expected or actual failing result');
  }
  if (redTest.length === 0 && substitute.length > 0 && !/reason|\u7406\u7531|\u4e0d\u53ef|\u65e0\u6cd5|\u56e0\u4e3a|not practical|not feasible/i.test(substitute)) {
    failures.push('tasks/current-task.md: Deterministic Substitute must explain why a direct red test is not practical');
  }
  validateRetrospectivePlanSection(content, failures);
  validateDailyContentContractTask(content, failures);
}

function validateFeedbackMemorySections(content, failures) {
  const feedbackReview = sectionText(content, 'Feedback Ledger Review').trim();
  const regressionSelfCheck = sectionText(content, 'Regression Self-Check').trim();

  if (!hasMeaningfulFeedbackReview(feedbackReview)) {
    failures.push('tasks/current-task.md: Feedback Ledger Review must record reviewed feedback-ledger items or explain why none apply');
  }
  if (!hasMeaningfulRegressionSelfCheck(regressionSelfCheck)) {
    failures.push('tasks/current-task.md: Regression Self-Check must record the task-specific checks that prevent known feedback regressions');
  }
}

function hasMeaningfulFeedbackReview(value) {
  const text = normalizedSectionText(value);
  return text.length >= 40 && /(config\/feedback-ledger\.json|feedback-ledger|反馈|ledger)/i.test(text);
}

function hasMeaningfulRegressionSelfCheck(value) {
  const text = normalizedSectionText(value);
  return text.length >= 40 && /(自检|self-check|regression|回归|检查|validate|harness|验证)/i.test(text);
}

function validateRetrospectivePlanSection(content, failures) {
  const retrospectivePlan = sectionText(content, 'Retrospective Plan').trim();
  if (!hasMeaningfulRetrospectivePlan(retrospectivePlan)) {
    failures.push('tasks/current-task.md: non-trivial tasks require a meaningful Retrospective Plan covering retrospective records, run_type, or index updates');
  }
}

function validateDailyContentContractTask(content, failures) {
  const normalized = normalizedSectionText(content);
  const touchesDailyContentContract = /(daily content contract|REQ-00[1678]|REQ-010|GitHub Trending|Builder\/X|hot blogs|daily_tracking|daily tracking|每日追踪|今日判断|趋势主题|重点 story|精选博客)/i.test(normalized);
  if (!touchesDailyContentContract) {
    return;
  }

  const validationCommands = sectionText(content, 'Validation Commands');
  if (!/check-daily-content-contract\.mjs|content:contract/i.test(validationCommands)) {
    failures.push('tasks/current-task.md: daily content contract work must list scripts/check-daily-content-contract.mjs or npm run content:contract in Validation Commands');
  }
}

function hasMeaningfulRetrospectivePlan(value) {
  const text = normalizedSectionText(value);
  return text.length >= 40
    && /(retrospective|retrospectives|\u590d\u76d8|run_type|daily_publish|project_iteration|rollup)/i.test(text)
    && /(retrospectives\/index\.json|record|index|daily_publish|project_iteration|rollup|non-trivial|\u975e\u5e73\u51e1)/i.test(text);
}

function normalizedSectionText(value) {
  return String(value)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasFailureEvidence(value) {
  return /fail|failed|failing|red evidence|expected initial|not ok|AssertionError|ERR_|exit code|non-zero|\u5931\u8d25|\u672a\u901a\u8fc7/i.test(value);
}

function firstNonEmptyLine(value) {
  return String(value)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0) || '';
}

function sectionText(content, heading) {
  const lines = content.split(/\r?\n/);
  const headingPattern = new RegExp(`^##\\s+${escapeRegExp(heading)}\\s*$`, 'i');
  const nextHeadingPattern = /^##\s+\S/;
  const start = lines.findIndex((line) => headingPattern.test(line));
  if (start === -1) return '';

  const collected = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (nextHeadingPattern.test(lines[index])) break;
    collected.push(lines[index]);
  }
  return collected.join('\n');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
