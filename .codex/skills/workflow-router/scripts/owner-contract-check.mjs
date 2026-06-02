#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SKILLS_ROOT = path.resolve(SCRIPT_DIR, '../..');

const OWNER_CONTRACTS = Object.freeze({
  question: {
    owner: 'answer-workflow',
    headings: ['Contract', 'Helper Atoms', 'Output'],
    ordered: [
      'Clarify the exact question',
      'Gather required material',
      'Answer directly',
      'Do not edit files',
    ],
    required: [
      'Use this owner for read-only answers',
      'Gather required material',
      'Do not edit files',
      'effective-interact',
    ],
  },
  'sdd-change': {
    owner: 'sdd-workflow',
    headings: ['Canonical Lifecycle', 'TDD', 'Helper Skills', 'Subagents'],
    ordered: [
      'Align user need',
      'Gather required material',
      'Write spec and acceptance',
      'Write executable plan and align',
      'Clean unneeded files',
      'Implement',
      'Test and accept',
      'Deliver report',
    ],
    required: [
      'Align user need',
      'Gather required material',
      'Write spec and acceptance',
      'Write executable plan and align',
      'Clean unneeded files',
      'Implement',
      'Test and accept',
      'Deliver report',
      'Do not start implementation',
      'TDD',
      'workflow-router/references/orchestration-policy.md',
    ],
  },
  diagnosis: {
    owner: 'diagnosis-workflow',
    headings: ['Workflow', 'Helpers'],
    ordered: [
      'Align the reported symptom',
      'Gather required material',
      'Reproduce or bound the symptom before fixing',
      'Rank hypotheses',
      'Write the regression test',
      'Fix only the confirmed cause',
      'Test and accept',
      'Deliver report',
    ],
    required: [
      'Reproduce or bound the symptom before fixing',
      'regression test or deterministic check',
      'Fix only the confirmed cause',
      'workflow-router/references/orchestration-policy.md',
    ],
  },
  review: {
    owner: 'review-workflow',
    headings: ['Contract', 'Helpers', 'Output'],
    ordered: [
      'Confirm the review scope',
      'Gather required material',
      'Report Findings first',
      'Do not implement fixes',
    ],
    required: [
      'Findings first',
      'Do not implement fixes',
      'file/line or source evidence',
      'workflow-router/references/orchestration-policy.md',
    ],
  },
  delivery: {
    owner: 'delivery-workflow',
    headings: ['Workflow', 'Helper Atoms', 'Boundaries'],
    ordered: [
      'Confirm the accepted scope',
      'Clean only approved',
      'Run agreed validation commands',
      'Record failures',
      'If a PR was created or updated',
      'Resolve actionable PR blockers',
      'Produce release notes',
      'Use `effective-interact`',
    ],
    required: [
      'accepted scope',
      'Run agreed validation commands',
      'check remote PR state',
      'mergeability',
      'CI/check runs',
      'Do not merge a pull request',
      'Do not hide failed or skipped verification',
      'Do not push, publish, merge, post, or mutate third-party resources',
      'effective-interact',
    ],
  },
  'harness-hub-maintenance': {
    owner: 'hub-maintenance-workflow',
    headings: ['Workflow', 'Source And Evaluation Inputs'],
    ordered: [
      'Align the maintenance goal',
      'Gather required material',
      'Write or update spec and acceptance',
      'Write an executable plan',
      'Clean unneeded files',
      'Apply narrow changes',
      'Validate with routing tests',
      'Use `effective-interact`',
    ],
    required: [
      'docs/source-projects.md',
      'docs/skill-routing.md',
      'capabilities/index.json',
      'spec and acceptance',
      'validation commands',
      'scripts/validate-skills.ps1 -SkipExternal',
      'bun run validate',
      'Do not wholesale replace local skills',
      'workflow-router/references/orchestration-policy.md',
    ],
  },
});

const VALID_STATES = new Set([
  ...Object.keys(OWNER_CONTRACTS),
  'clarify',
  'none',
]);

function normalize(value) {
  return String(value || '').toLowerCase();
}

function hasHeading(body, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^##\\s+${escaped}\\s*$`, 'im').test(body);
}

function findMissingOrderedPhrases(body, phrases) {
  const normalizedBody = normalize(body);
  let lastIndex = -1;
  const missingOrOutOfOrder = [];

  for (const phrase of phrases) {
    const index = normalizedBody.indexOf(normalize(phrase), lastIndex + 1);
    if (index === -1 || index < lastIndex) {
      missingOrOutOfOrder.push(phrase);
    } else {
      lastIndex = index;
    }
  }

  return missingOrOutOfOrder;
}

function readSkill(skillsRoot, owner) {
  const skillPath = path.join(skillsRoot, owner, 'SKILL.md');
  if (!fs.existsSync(skillPath)) {
    return { skillPath, body: null };
  }

  return {
    skillPath,
    body: fs.readFileSync(skillPath, 'utf8'),
  };
}

export function checkOwnerContract(options) {
  const state = options.state || 'none';
  if (!VALID_STATES.has(state)) {
    throw new Error(`Unsupported state '${state}'`);
  }

  const skillsRoot = path.resolve(options.skillsRoot || DEFAULT_SKILLS_ROOT);
  const contract = OWNER_CONTRACTS[state];
  if (!contract) {
    return {
      schemaVersion: 1,
      mutates: false,
      dispatchesSubagents: false,
      state,
      owner: null,
      skillsRoot,
      ok: true,
      warnings: [],
    };
  }

  const { skillPath, body } = readSkill(skillsRoot, contract.owner);
  const warnings = [];

  if (!body) {
    warnings.push({
      id: 'owner-skill-missing',
      message: `${contract.owner} SKILL.md is missing from the installed skills root.`,
      owner: contract.owner,
      path: skillPath,
    });
  } else {
    const normalizedBody = normalize(body);
    for (const heading of contract.headings || []) {
      if (!hasHeading(body, heading)) {
        warnings.push({
          id: 'owner-contract-missing-heading',
          message: `${contract.owner} is missing required section heading: ${heading}`,
          owner: contract.owner,
          path: skillPath,
        });
      }
    }

    for (const phrase of findMissingOrderedPhrases(body, contract.ordered || [])) {
      warnings.push({
        id: 'owner-contract-out-of-order',
        message: `${contract.owner} is missing required ordered workflow phrase or has it out of order: ${phrase}`,
        owner: contract.owner,
        path: skillPath,
      });
    }

    for (const phrase of contract.required) {
      if (!normalizedBody.includes(normalize(phrase))) {
        warnings.push({
          id: 'owner-contract-missing-phrase',
          message: `${contract.owner} is missing required contract phrase: ${phrase}`,
          owner: contract.owner,
          path: skillPath,
        });
      }
    }
  }

  return {
    schemaVersion: 1,
    mutates: false,
    dispatchesSubagents: false,
    state,
    owner: contract.owner,
    skillsRoot,
    ok: warnings.length === 0,
    warnings,
  };
}

function parseArgs(argv) {
  const options = {
    state: 'none',
    skillsRoot: null,
    json: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--state') {
      options.state = readValue(argv, ++index, arg);
    } else if (arg === '--skills-root') {
      options.skillsRoot = readValue(argv, ++index, arg);
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unsupported option '${arg}'`);
    }
  }

  return options;
}

function readValue(argv, index, flag) {
  const value = argv[index];
  if (!value) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function printHelp() {
  console.log(`Usage: owner-contract-check.mjs --state <state> [--skills-root <dir>] [--json]

Checks installed workflow owner SKILL.md files for required execution contracts. The command is side-effect free:
it never edits files, dispatches subagents, calls tools, or starts implementation.`);
}

function printText(result) {
  if (result.ok) {
    console.log(`Owner contract check passed for ${result.state}.`);
    return;
  }

  console.log(`Owner contract warnings for ${result.state}:`);
  for (const warning of result.warnings) {
    console.log(`- ${warning.id}: ${warning.message}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      printHelp();
      process.exitCode = 0;
    } else {
      const result = checkOwnerContract(options);
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        printText(result);
      }
      process.exitCode = 0;
    }
  } catch (error) {
    console.error(`owner-contract-check: ${error.message}`);
    process.exitCode = 2;
  }
}
