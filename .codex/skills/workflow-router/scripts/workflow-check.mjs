#!/usr/bin/env node

import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { classifyIntent } from './route-intent.mjs';
import { evaluateAdvisory } from './advisory-check.mjs';
import { checkOwnerContract } from './owner-contract-check.mjs';

const VALID_PHASES = new Set([
  'pre-implementation',
  'pre-delivery',
]);

function parseArgs(argv) {
  const options = {
    prompt: '',
    promptFile: null,
    phase: null,
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
    help: false,
  };
  const positional = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--prompt') {
      options.prompt = readValue(argv, ++index, arg);
    } else if (arg === '--prompt-file') {
      options.promptFile = readValue(argv, ++index, arg);
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
    } else if (arg.startsWith('-')) {
      throw new Error(`Unsupported option '${arg}'`);
    } else {
      positional.push(arg);
    }
  }

  if (options.promptFile) {
    options.prompt = fs.readFileSync(options.promptFile, 'utf8');
  } else if (!options.prompt && positional.length > 0) {
    options.prompt = positional.join(' ');
  }

  if (options.phase && !VALID_PHASES.has(options.phase)) {
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

function defaultPhaseForState(state) {
  return state === 'delivery' ? 'pre-delivery' : 'pre-implementation';
}

export function checkWorkflow(options) {
  const route = classifyIntent(options.prompt);
  const phase = options.phase || defaultPhaseForState(route.state);
  const advisory = evaluateAdvisory({
    state: route.state,
    phase,
    hasSpec: Boolean(options.hasSpec),
    hasAcceptance: Boolean(options.hasAcceptance),
    hasPlan: Boolean(options.hasPlan),
    hasHandoff: Boolean(options.hasHandoff),
    hasScope: Boolean(options.hasScope),
    hasEvidence: Boolean(options.hasEvidence),
    hasReproduction: Boolean(options.hasReproduction),
    hasValidation: Boolean(options.hasValidation),
    materialChanges: Boolean(options.materialChanges),
    willMutate: Boolean(options.willMutate),
  });
  const ownerContract = checkOwnerContract({ state: route.state });

  return {
    schemaVersion: 1,
    mutates: false,
    dispatchesSubagents: false,
    route,
    advisory,
    ownerContract,
    nextAction: route.state === 'clarify'
      ? route.clarification
      : advisory.ok && ownerContract.ok
        ? `Proceed with ${route.owner || 'no owner'} at ${route.nextGate}`
        : 'Resolve advisory warnings before proceeding.',
  };
}

function printHelp() {
  console.log(`Usage: workflow-check.mjs --prompt <request> [--phase <phase>] [flags] [--json]
       workflow-check.mjs --prompt-file <file> [--phase <phase>] [flags] [--json]

Flags mirror advisory-check.mjs:
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

This command composes intent routing, advisory gates, and owner contract checks. It is side-effect free:
it never edits files, dispatches subagents, calls remote services, or starts implementation.`);
}

function printText(result) {
  console.log(`STATE: ${result.route.state}`);
  console.log(`OWNER: ${result.route.owner || 'none'}`);
  console.log(`PHASE: ${result.advisory.phase}`);
  console.log(`ADVISORY_OK: ${result.advisory.ok}`);
  if (result.advisory.warnings.length > 0) {
    console.log('WARNINGS:');
    for (const warning of result.advisory.warnings) {
      console.log(`- ${warning.id}: ${warning.message}`);
    }
  }
  if (result.ownerContract.warnings.length > 0) {
    console.log('OWNER_CONTRACT_WARNINGS:');
    for (const warning of result.ownerContract.warnings) {
      console.log(`- ${warning.id}: ${warning.message}`);
    }
  }
  console.log(`NEXT_ACTION: ${result.nextAction}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      printHelp();
      process.exitCode = 0;
    } else {
      const result = checkWorkflow(options);
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        printText(result);
      }
      process.exitCode = 0;
    }
  } catch (error) {
    console.error(`workflow-check: ${error.message}`);
    process.exitCode = 2;
  }
}
