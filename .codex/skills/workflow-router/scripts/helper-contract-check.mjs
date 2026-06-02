#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SKILLS_ROOT = path.resolve(SCRIPT_DIR, '../..');

const TOP_LEVEL_WORKFLOW_SKILLS = new Set([
  'workflow-router',
  'answer-workflow',
  'sdd-workflow',
  'diagnosis-workflow',
  'review-workflow',
  'delivery-workflow',
  'hub-maintenance-workflow',
]);

const FORBIDDEN_HELPER_PHRASES = [
  'spawn_agent',
  'subagent_type',
  'Task(',
  '.codex/agents',
  '.claude/skills',
  '.opencode',
];

const HIGH_RISK_HELPER_CONTRACTS = Object.freeze({
  'compound-code-review': {
    required: [
      'Default mode is report-only',
      'Do not commit, push, create a pull request, file issues, or change external resources',
      'user explicitly asks for multi-agent or parallel review',
      'independent read-only lenses',
      'Otherwise run the same lenses locally in sequence',
    ],
  },
  'e2e-testing': {
    required: [
      'Do not add or change CI workflows unless the accepted parent workflow plan explicitly includes CI changes',
      'CI/CD examples are templates only',
      'Do not run critical, payment, wallet, or production flows against real money or production accounts',
    ],
  },
});

function normalize(value) {
  return String(value || '').toLowerCase();
}

function readSkill(skillsRoot, skillName) {
  const skillPath = path.join(skillsRoot, skillName, 'SKILL.md');
  if (!fs.existsSync(skillPath)) {
    return { skillPath, body: null };
  }

  return {
    skillPath,
    body: fs.readFileSync(skillPath, 'utf8'),
  };
}

function listInstalledSkillNames(skillsRoot) {
  if (!fs.existsSync(skillsRoot)) {
    return [];
  }

  return fs.readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((skillName) => fs.existsSync(path.join(skillsRoot, skillName, 'SKILL.md')))
    .sort();
}

export function checkHelperContracts(options = {}) {
  const skillsRoot = path.resolve(options.skillsRoot || DEFAULT_SKILLS_ROOT);
  const installedSkillNames = listInstalledSkillNames(skillsRoot);
  const helperSkillNames = installedSkillNames.filter((skillName) => !TOP_LEVEL_WORKFLOW_SKILLS.has(skillName));
  const checkedHelpers = helperSkillNames.filter((skillName) => HIGH_RISK_HELPER_CONTRACTS[skillName]);
  const warnings = [];

  for (const skillName of checkedHelpers) {
    const contract = HIGH_RISK_HELPER_CONTRACTS[skillName];
    const { skillPath, body } = readSkill(skillsRoot, skillName);

    if (!body) {
      warnings.push({
        id: 'helper-skill-missing',
        skill: skillName,
        path: skillPath,
        message: `${skillName} SKILL.md is missing from the installed skills root.`,
      });
      continue;
    }

    const normalizedBody = normalize(body);
    for (const phrase of contract.required) {
      if (!normalizedBody.includes(normalize(phrase))) {
        warnings.push({
          id: 'helper-contract-missing-phrase',
          skill: skillName,
          path: skillPath,
          message: `${skillName} is missing required helper side-effect phrase: ${phrase}`,
        });
      }
    }

    for (const phrase of FORBIDDEN_HELPER_PHRASES) {
      if (body.includes(phrase)) {
        warnings.push({
          id: 'helper-contract-forbidden-phrase',
          skill: skillName,
          path: skillPath,
          message: `${skillName} contains forbidden host-specific helper phrase: ${phrase}`,
        });
      }
    }
  }

  return {
    schemaVersion: 1,
    mutates: false,
    dispatchesSubagents: false,
    skillsRoot,
    helperSkillCount: helperSkillNames.length,
    checkedHelperCount: checkedHelpers.length,
    checkedHelpers,
    excludedTopLevelWorkflowSkills: installedSkillNames.filter((skillName) => TOP_LEVEL_WORKFLOW_SKILLS.has(skillName)).sort(),
    ok: warnings.length === 0,
    warnings,
  };
}

function parseArgs(argv) {
  const options = {
    skillsRoot: null,
    json: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--skills-root') {
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
  console.log(`Usage: helper-contract-check.mjs [--skills-root <dir>] [--json]

Checks high-risk helper skills for side-effect boundaries. The command is side-effect free:
it never edits files, dispatches subagents, calls tools, or starts implementation.`);
}

function printText(result) {
  console.log(`HELPERS: ${result.helperSkillCount}`);
  console.log(`CHECKED_HIGH_RISK_HELPERS: ${result.checkedHelperCount}`);
  console.log(`EXCLUDED_TOP_LEVEL_WORKFLOW_SKILLS: ${result.excludedTopLevelWorkflowSkills.length}`);
  if (result.ok) {
    console.log('Helper contract check passed.');
    return;
  }

  console.log('WARNINGS:');
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
      const result = checkHelperContracts(options);
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        printText(result);
      }
      process.exitCode = result.ok ? 0 : 1;
    }
  } catch (error) {
    console.error(`helper-contract-check: ${error.message}`);
    process.exitCode = 2;
  }
}
