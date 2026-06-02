#!/usr/bin/env node

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
    materialChanges: false,
    willMutate: false,
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
    } else if (arg === '--material-changes') {
      options.materialChanges = true;
    } else if (arg === '--will-mutate') {
      options.willMutate = true;
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

  if (options.state === 'delivery' && options.phase !== 'pre-delivery') {
    warnings.push({
      id: 'phase-state-mismatch',
      message: 'Delivery closeout checks should run in pre-delivery phase, not pre-implementation.',
    });
  }

  if (options.phase === 'pre-delivery' && options.state !== 'delivery') {
    warnings.push({
      id: 'phase-state-mismatch',
      message: `${options.state} is not the delivery owner; route closeout checks through delivery-workflow.`,
    });
  }

  if ((options.state === 'question' || options.state === 'review') && options.willMutate) {
    warnings.push({
      id: 'read-only-owner-mutation',
      message: `${options.state} is a read-only owner; redirect into sdd-workflow before implementation or file edits.`,
    });
  }

  if ((options.state === 'sdd-change' || options.state === 'harness-hub-maintenance') && options.phase === 'pre-implementation') {
    if (!options.hasScope) {
      warnings.push({
        id: 'missing-scope',
        message: `${options.state} implementation should not start before the user need, scope, constraints, and non-goals are aligned.`,
      });
    }
    if (!options.hasSpec) {
      warnings.push({
        id: 'missing-spec',
        message: `${options.state} implementation should not start before the target spec is aligned.`,
      });
    }
    if (!options.hasAcceptance) {
      warnings.push({
        id: 'missing-acceptance',
        message: `${options.state} implementation should not start before acceptance criteria are aligned.`,
      });
    }
    if (!options.hasPlan) {
      warnings.push({
        id: 'missing-plan',
        message: `${options.state} implementation should not start before an executable plan is aligned.`,
      });
    }
  }

  if (options.state === 'diagnosis' && options.phase === 'pre-implementation') {
    if (!options.hasReproduction) {
      warnings.push({
        id: 'missing-reproduction',
        message: 'Diagnosis fixes should not start before the symptom is reproduced or bounded.',
      });
    }
    if (!options.hasEvidence) {
      warnings.push({
        id: 'missing-evidence',
        message: 'Diagnosis fixes should not start before the relevant logs, command output, or code path evidence is gathered.',
      });
    }
  }

  if (options.state === 'delivery' && options.phase === 'pre-delivery' && !options.hasValidation) {
    warnings.push({
      id: 'missing-validation',
      message: 'Delivery should not close out before accepted validation commands or checks are run or explicitly skipped.',
    });
  }

  if (options.phase === 'pre-delivery' && options.materialChanges && !options.hasHandoff) {
    warnings.push({
      id: 'missing-effective-interact-handoff',
      message: 'Material work should produce an effective-interact handoff unless explicitly waived.',
    });
  }

  return {
    ok: warnings.length === 0,
    blocking: false,
    mutates: false,
    state: options.state,
    phase: options.phase,
    warnings,
  };
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
  --material-changes
  --will-mutate

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
