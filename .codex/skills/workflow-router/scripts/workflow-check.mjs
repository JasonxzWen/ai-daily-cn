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
    hasHtmlHandoff: false,
    handoffWaiver: null,
    htmlHandoffWaiver: null,
    hasCloseoutReview: false,
    hasInsight: false,
    hasPrReadiness: false,
    hasAgenticLoopPlan: false,
    hasAcceptanceArbiter: false,
    hasFinalReviewArbiter: false,
    materialChanges: false,
    willMutate: false,
    expectedOutputMode: null,
    currentTaskPath: null,
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
    } else if (arg === '--has-html-handoff') {
      options.hasHtmlHandoff = true;
      options.hasHandoff = true;
    } else if (arg === '--handoff-waiver') {
      options.handoffWaiver = readValue(argv, ++index, arg);
    } else if (arg === '--html-handoff-waiver') {
      options.htmlHandoffWaiver = readValue(argv, ++index, arg);
    } else if (arg === '--has-closeout-review') {
      options.hasCloseoutReview = true;
    } else if (arg === '--has-insight') {
      options.hasInsight = true;
    } else if (arg === '--has-pr-readiness') {
      options.hasPrReadiness = true;
    } else if (arg === '--has-agentic-loop-plan') {
      options.hasAgenticLoopPlan = true;
    } else if (arg === '--has-acceptance-arbiter') {
      options.hasAcceptanceArbiter = true;
    } else if (arg === '--has-final-review-arbiter') {
      options.hasFinalReviewArbiter = true;
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
    hasHtmlHandoff: Boolean(options.hasHtmlHandoff),
    handoffWaiver: options.handoffWaiver,
    htmlHandoffWaiver: options.htmlHandoffWaiver,
    hasCloseoutReview: Boolean(options.hasCloseoutReview),
    hasInsight: Boolean(options.hasInsight),
    hasPrReadiness: Boolean(options.hasPrReadiness),
    hasAgenticLoopPlan: Boolean(options.hasAgenticLoopPlan),
    hasAcceptanceArbiter: Boolean(options.hasAcceptanceArbiter),
    hasFinalReviewArbiter: Boolean(options.hasFinalReviewArbiter),
    materialChanges: Boolean(options.materialChanges),
    willMutate: Boolean(options.willMutate),
    expectedOutputMode: options.expectedOutputMode || route.expectedOutputMode,
    currentTaskPath: options.currentTaskPath,
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
  --has-html-handoff
  --handoff-waiver <reason>
  --html-handoff-waiver <reason>
  --has-closeout-review
  --has-insight
  --has-pr-readiness
  --has-agentic-loop-plan
  --has-acceptance-arbiter
  --has-final-review-arbiter
  --material-changes
  --will-mutate
  --expected-output-mode <mode>
  --current-task <path>

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
  console.log(`EXPECTED_OUTPUT_MODE: ${result.advisory.expectedOutputMode || result.route.expectedOutputMode || 'none'}`);
  console.log(`HTML_REQUIRED: ${result.advisory.htmlRequired ? 'yes' : 'no'}`);
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
