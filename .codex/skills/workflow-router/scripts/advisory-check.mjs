#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const VALID_STATES = new Set([
  'question',
  'sdd-change',
  'diagnosis',
  'review',
  'delivery',
  'harness-hub-maintenance',
  'clarify',
  'none',
]);

const VALID_PHASES = new Set([
  'pre-implementation',
  'pre-delivery',
]);

const VALID_OUTPUT_MODES = new Set([
  'plain-brief',
  'structured-markdown',
  'visual-markdown',
  'html-artifact',
]);

function parseArgs(argv) {
  const options = {
    state: 'none',
    phase: 'pre-implementation',
    hasSpec: false,
    hasAcceptance: false,
    hasPlan: false,
    hasHandoff: false,
    hasScope: false,
    hasEvidence: false,
    hasReproduction: false,
    hasValidation: false,
    hasHtmlHandoff: false,
    materialChanges: false,
    willMutate: false,
    expectedOutputMode: null,
    currentTaskPath: null,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--state') {
      options.state = readValue(argv, ++index, arg);
    } else if (arg === '--phase') {
      options.phase = readValue(argv, ++index, arg);
    } else if (arg === '--has-spec') {
      options.hasSpec = true;
    } else if (arg === '--has-acceptance') {
      options.hasAcceptance = true;
    } else if (arg === '--has-plan') {
      options.hasPlan = true;
    } else if (arg === '--has-handoff') {
      options.hasHandoff = true;
    } else if (arg === '--has-scope') {
      options.hasScope = true;
    } else if (arg === '--has-evidence') {
      options.hasEvidence = true;
    } else if (arg === '--has-reproduction') {
      options.hasReproduction = true;
    } else if (arg === '--has-validation') {
      options.hasValidation = true;
    } else if (arg === '--has-html-handoff') {
      options.hasHtmlHandoff = true;
      options.hasHandoff = true;
    } else if (arg === '--material-changes') {
      options.materialChanges = true;
    } else if (arg === '--will-mutate') {
      options.willMutate = true;
    } else if (arg === '--expected-output-mode') {
      options.expectedOutputMode = readValue(argv, ++index, arg);
    } else if (arg === '--current-task') {
      options.currentTaskPath = readValue(argv, ++index, arg);
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unsupported option '${arg}'`);
    }
  }

  if (!VALID_STATES.has(options.state)) {
    throw new Error(`Unsupported state '${options.state}'`);
  }
  if (!VALID_PHASES.has(options.phase)) {
    throw new Error(`Unsupported phase '${options.phase}'`);
  }
  if (options.expectedOutputMode && !VALID_OUTPUT_MODES.has(options.expectedOutputMode)) {
    throw new Error(`Unsupported expected output mode '${options.expectedOutputMode}'`);
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

export function evaluateAdvisory(options) {
  const warnings = [];
  const { hydratedOptions, detection } = hydrateFromCurrentTask(options);
  const expectedOutputMode = inferExpectedOutputMode(hydratedOptions);
  const htmlRequired = expectedOutputMode === 'html-artifact';

  if (hydratedOptions.state === 'delivery' && hydratedOptions.phase !== 'pre-delivery') {
    warnings.push({
      id: 'phase-state-mismatch',
      message: 'Delivery closeout checks should run in pre-delivery phase, not pre-implementation.',
    });
  }

  if (hydratedOptions.phase === 'pre-delivery' && hydratedOptions.state !== 'delivery') {
    warnings.push({
      id: 'phase-state-mismatch',
      message: `${hydratedOptions.state} is not the delivery owner; route closeout checks through delivery-workflow.`,
    });
  }

  if ((hydratedOptions.state === 'question' || hydratedOptions.state === 'review') && hydratedOptions.willMutate) {
    warnings.push({
      id: 'read-only-owner-mutation',
      message: `${hydratedOptions.state} is a read-only owner; redirect into sdd-workflow before implementation or file edits.`,
    });
  }

  if ((hydratedOptions.state === 'sdd-change' || hydratedOptions.state === 'harness-hub-maintenance') && hydratedOptions.phase === 'pre-implementation') {
    if (!hydratedOptions.hasScope) {
      warnings.push({
        id: 'missing-scope',
        message: `${hydratedOptions.state} implementation should not start before the user need, scope, constraints, and non-goals are aligned.`,
      });
    }
    if (!hydratedOptions.hasSpec) {
      warnings.push({
        id: 'missing-spec',
        message: `${hydratedOptions.state} implementation should not start before the target spec is aligned.`,
      });
    }
    if (!hydratedOptions.hasAcceptance) {
      warnings.push({
        id: 'missing-acceptance',
        message: `${hydratedOptions.state} implementation should not start before acceptance criteria are aligned.`,
      });
    }
    if (!hydratedOptions.hasPlan) {
      warnings.push({
        id: 'missing-plan',
        message: `${hydratedOptions.state} implementation should not start before an executable plan is aligned.`,
      });
    }
  }

  if (hydratedOptions.state === 'diagnosis' && hydratedOptions.phase === 'pre-implementation') {
    if (!hydratedOptions.hasReproduction) {
      warnings.push({
        id: 'missing-reproduction',
        message: 'Diagnosis fixes should not start before the symptom is reproduced or bounded.',
      });
    }
    if (!hydratedOptions.hasEvidence) {
      warnings.push({
        id: 'missing-evidence',
        message: 'Diagnosis fixes should not start before the relevant logs, command output, or code path evidence is gathered.',
      });
    }
  }

  if (hydratedOptions.state === 'delivery' && hydratedOptions.phase === 'pre-delivery' && !hydratedOptions.hasValidation) {
    warnings.push({
      id: 'missing-validation',
      message: 'Delivery should not close out before accepted validation commands or checks are run or explicitly skipped.',
    });
  }

  if (hydratedOptions.phase === 'pre-delivery' && hydratedOptions.materialChanges && htmlRequired && !hydratedOptions.hasHtmlHandoff) {
    warnings.push({
      id: 'missing-effective-interact-html-handoff',
      message: 'Material work with expected html-artifact output should produce a validated effective-interact HTML handoff unless explicitly waived.',
    });
  } else if (hydratedOptions.phase === 'pre-delivery' && hydratedOptions.materialChanges && !hydratedOptions.hasHandoff) {
    warnings.push({
      id: 'missing-effective-interact-handoff',
      message: 'Material work should produce an effective-interact handoff unless explicitly waived.',
    });
  }

  return {
    ok: warnings.length === 0,
    blocking: false,
    mutates: false,
    state: hydratedOptions.state,
    phase: hydratedOptions.phase,
    expectedOutputMode,
    htmlRequired,
    detection,
    warnings,
  };
}

function inferExpectedOutputMode(options) {
  if (options.expectedOutputMode) {
    return options.expectedOutputMode;
  }
  if (
    options.materialChanges
    && ['delivery', 'harness-hub-maintenance', 'sdd-change'].includes(options.state)
  ) {
    return 'html-artifact';
  }
  return null;
}

function hydrateFromCurrentTask(options) {
  const detection = detectCurrentTask(options.currentTaskPath);
  if (!detection.currentTaskExists) {
    return {
      hydratedOptions: { ...options },
      detection,
    };
  }

  const currentTask = fs.readFileSync(detection.currentTaskPath, 'utf8');
  const inferred = inferCurrentTaskGates(currentTask);
  detection.inferred = inferred;

  return {
    hydratedOptions: {
      ...options,
      hasScope: Boolean(options.hasScope || inferred.hasScope),
      hasSpec: Boolean(options.hasSpec || inferred.hasSpec),
      hasAcceptance: Boolean(options.hasAcceptance || inferred.hasAcceptance),
      hasPlan: Boolean(options.hasPlan || inferred.hasPlan),
      hasHtmlHandoff: Boolean(options.hasHtmlHandoff),
      hasHandoff: Boolean(options.hasHandoff || options.hasHtmlHandoff),
    },
    detection,
  };
}

function detectCurrentTask(explicitPath) {
  if (explicitPath) {
    const resolved = path.resolve(explicitPath);
    return {
      currentTaskSource: 'explicit',
      currentTaskPath: resolved,
      currentTaskExists: fs.existsSync(resolved),
      inferred: null,
    };
  }

  const cwdTaskPath = path.resolve(process.cwd(), '.harness-hub', 'state', 'current-task.md');
  if (fs.existsSync(cwdTaskPath)) {
    return {
      currentTaskSource: 'cwd',
      currentTaskPath: cwdTaskPath,
      currentTaskExists: true,
      inferred: null,
    };
  }

  return {
    currentTaskSource: 'none',
    currentTaskPath: null,
    currentTaskExists: false,
    inferred: null,
  };
}

function inferCurrentTaskGates(markdown) {
  return {
    hasScope: [
      'Goal',
      'Non-goals',
      'Allowed paths',
      'Forbidden paths',
    ].every((heading) => sectionHasMeaningfulContent(markdown, heading)),
    hasSpec: sectionHasMeaningfulContent(markdown, 'Target spec'),
    hasAcceptance: sectionHasMeaningfulContent(markdown, 'Acceptance criteria'),
    hasPlan: sectionHasMeaningfulContent(markdown, 'Test matrix')
      || sectionHasMeaningfulContent(markdown, 'Validation commands'),
  };
}

function sectionHasMeaningfulContent(markdown, heading) {
  return sectionText(markdown, heading)
    .split(/\r?\n/)
    .some((line) => isMeaningfulLine(line));
}

function sectionText(markdown, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`^##\\s+${escaped}\\s*$`, 'im').exec(markdown);
  if (!match) {
    return '';
  }

  const start = match.index + match[0].length;
  const tail = markdown.slice(start);
  const nextHeadingIndex = tail.search(/^##\s+/m);
  return nextHeadingIndex === -1 ? tail : tail.slice(0, nextHeadingIndex);
}

function isMeaningfulLine(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed) {
    return false;
  }
  if (/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(trimmed)) {
    return false;
  }
  if (/^\|\s*(priority|question|command|phase|url|pr|signal|date)\s*\|/i.test(trimmed)) {
    return false;
  }

  const normalized = trimmed
    .replace(/^[*-]\s+/, '')
    .replace(/^\|\s*/, '')
    .toLowerCase();

  const placeholderFragments = [
    'state the concrete outcome',
    'add assumptions',
    'actor:',
    'outcome:',
    'pain or trigger:',
    'constraints:',
    'success target:',
    'repo evidence inspected:',
    'existing behavior or source decisions:',
    'option a:',
    'option b:',
    'option c:',
    'recommended direction:',
    'rejected alternatives and why:',
    'user-visible behavior:',
    'boundaries:',
    'interfaces or data implications:',
    'compatibility constraints:',
    'failure behavior:',
    'rollout or rollback notes:',
    'list what this task',
    'record the worktree',
    'add exact files',
    'add files or directories',
    'add observable checks',
    'add the first public behavior',
    'add command',
    'add failure expected',
    'add pass condition',
    'add affected boundary',
    'add broader regression',
    'add only blocking questions',
    'explain behavior',
    'add recommendation',
    'add the command',
    'add commands',
    'fill current task first',
    'n/a',
    'yes/no',
    'not run yet',
    'not required yet',
    'none recorded',
    'nothing recorded',
    'no active task',
  ];

  return !placeholderFragments.some((fragment) => normalized.includes(fragment));
}

function printHelp() {
  console.log(`Usage: advisory-check.mjs --state <state> --phase <phase> [flags] [--json]

Flags:
  --has-spec
  --has-acceptance
  --has-plan
  --has-handoff
  --has-scope
  --has-evidence
  --has-reproduction
  --has-validation
  --has-html-handoff
  --material-changes
  --will-mutate
  --expected-output-mode <mode>
  --current-task <path>

When --current-task is provided, that file is inspected first. Without it, the command only checks
the current working directory's .harness-hub/state/current-task.md; it does not recurse upward.
This command is advisory and side-effect free. It never dispatches agents or mutates local or remote state.`);
}

function printText(result) {
  if (result.ok) {
    console.log('Advisory check passed.');
    return;
  }
  console.log('Advisory warnings:');
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
      const result = evaluateAdvisory(options);
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        printText(result);
      }
      process.exitCode = 0;
    }
  } catch (error) {
    console.error(`advisory-check: ${error.message}`);
    process.exitCode = 2;
  }
}
