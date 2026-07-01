#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ALLOWED_LOOPS = new Set([
  'plan-review',
  'test-design',
  'implementation-review',
  'frontend-acceptance',
  'diagnosis-regression',
  'docs-consistency',
  'pr-closeout',
  'insight-retro',
]);

const ALLOWED_VERDICTS = new Set([
  'pass',
  'fail',
  'warn',
  'blocked',
  'skipped',
]);

const DELIVERY_DECISIONS = new Set([
  'deliver',
  'handoff',
  'complete',
]);

const ALLOWED_STOP_CONDITIONS = new Set([
  'continue',
  'revise',
  'interrupt',
  'deliver',
  'handoff',
  'complete',
]);

function parseArgs(argv) {
  const options = {
    file: null,
    json: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--file') {
      options.file = readValue(argv, ++index, arg);
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

export function evaluateAgenticLoopRecords(input) {
  const records = normalizeRecords(input);
  const findings = [];

  if (records.length === 0) {
    findings.push(finding('missing-loop-records', 'Loop evidence must contain at least one record.', '$'));
  }

  records.forEach((record, index) => {
    const pathPrefix = `$.loops[${index}]`;
    if (!isRecord(record)) {
      findings.push(finding('invalid-loop-record', 'Loop record must be an object.', pathPrefix));
      return;
    }

    const loop = stringField(record, 'loop');
    if (!loop) {
      findings.push(finding('missing-loop', 'Loop record must name the loop type.', `${pathPrefix}.loop`));
    } else if (!ALLOWED_LOOPS.has(loop)) {
      findings.push(finding('unknown-loop', `Unsupported loop '${loop}'.`, `${pathPrefix}.loop`));
    }

    for (const field of ['stage', 'evidence', 'mainAgentDecision']) {
      if (!stringField(record, field)) {
        findings.push(finding(`missing-${kebab(field)}`, `Loop record must include ${field}.`, `${pathPrefix}.${field}`));
      }
    }

    if (!hasAnyEvidenceField(record, ['task', 'targetSpec'])) {
      findings.push(finding('missing-task-or-target-spec', 'Loop record must include task or targetSpec evidence.', `${pathPrefix}.task`));
    }

    if (!hasEvidenceValue(record.acceptanceCriteria)) {
      findings.push(finding('missing-acceptance-criteria', 'Loop record must include acceptanceCriteria evidence.', `${pathPrefix}.acceptanceCriteria`));
    }

    const verdict = stringField(record, 'verdict');
    if (!verdict) {
      findings.push(finding('missing-verdict', 'Loop record must include verdict.', `${pathPrefix}.verdict`));
    } else if (!ALLOWED_VERDICTS.has(verdict)) {
      findings.push(finding('invalid-verdict', `Unsupported verdict '${verdict}'.`, `${pathPrefix}.verdict`));
    }

    validateIterationControls(record, pathPrefix, findings);

    validateParticipant(record, 'producer', pathPrefix, findings);
    validateParticipant(record, 'verifier', pathPrefix, findings);
    validateParticipant(record, 'arbiter', pathPrefix, findings);

    if (isRecord(record.producer) && !hasAnyEvidenceField(record.producer, ['output', 'artifact', 'currentDiff', 'currentVersion'])) {
      findings.push(finding('missing-producer-output', 'producer must include output, artifact, currentDiff, or currentVersion evidence.', `${pathPrefix}.producer`));
    }

    if (isRecord(record.arbiter)) {
      if (record.arbiter.readOnly !== true) {
        findings.push(finding('arbiter-not-read-only', 'Arbiter must be explicitly readOnly: true.', `${pathPrefix}.arbiter.readOnly`));
      }
      const mutates = record.arbiter.mutates === true
        || arrayIncludesUnsafeAction(record.arbiter.actions);
      if (mutates) {
        findings.push(finding('arbiter-mutates', 'Arbiter must not edit, push, publish, merge, or mutate external resources.', `${pathPrefix}.arbiter`));
      }
    }

    const mainDecision = stringField(record, 'mainAgentDecision');
    if ((verdict === 'fail' || verdict === 'blocked') && DELIVERY_DECISIONS.has(mainDecision)) {
      findings.push(finding('unsafe-delivery-after-failed-loop', 'Failing or blocked loop verdict must not be marked as deliver/complete.', `${pathPrefix}.mainAgentDecision`));
    }

    const stopCondition = stringField(record, 'stopCondition');
    if ((verdict === 'fail' || verdict === 'blocked') && DELIVERY_DECISIONS.has(stopCondition)) {
      findings.push(finding('unsafe-stop-after-failed-loop', 'Failing or blocked loop verdict must not use a delivery stop condition.', `${pathPrefix}.stopCondition`));
    }
  });

  return {
    schemaVersion: 1,
    ok: findings.length === 0,
    mutates: false,
    dispatchesDelegatedAgents: false,
    recordsChecked: records.length,
    findings,
  };
}

function validateIterationControls(record, pathPrefix, findings) {
  const hasIteration = Object.prototype.hasOwnProperty.call(record, 'iteration');
  const hasMaxIterations = Object.prototype.hasOwnProperty.call(record, 'maxIterations');
  const hasStopCondition = Object.prototype.hasOwnProperty.call(record, 'stopCondition');

  if (hasIteration || hasMaxIterations) {
    if (!isPositiveInteger(record.iteration)) {
      findings.push(finding('invalid-iteration', 'iteration must be a positive integer when loop iteration controls are used.', `${pathPrefix}.iteration`));
    }
    if (!isPositiveInteger(record.maxIterations)) {
      findings.push(finding('invalid-max-iterations', 'maxIterations must be a positive integer when loop iteration controls are used.', `${pathPrefix}.maxIterations`));
    }
    if (isPositiveInteger(record.iteration) && isPositiveInteger(record.maxIterations) && record.iteration > record.maxIterations) {
      findings.push(finding('iteration-exceeds-max', 'iteration must be less than or equal to maxIterations.', `${pathPrefix}.iteration`));
    }
    if (!hasStopCondition) {
      findings.push(finding('missing-stop-condition', 'stopCondition must be recorded when loop iteration controls are used.', `${pathPrefix}.stopCondition`));
    }
  }

  if (hasStopCondition) {
    const stopCondition = stringField(record, 'stopCondition');
    if (!stopCondition) {
      findings.push(finding('missing-stop-condition', 'stopCondition must be non-empty when present.', `${pathPrefix}.stopCondition`));
    } else if (!ALLOWED_STOP_CONDITIONS.has(stopCondition)) {
      findings.push(finding('invalid-stop-condition', `Unsupported stopCondition '${stopCondition}'.`, `${pathPrefix}.stopCondition`));
    }
  }
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function normalizeRecords(input) {
  if (Array.isArray(input)) {
    return input;
  }
  if (isRecord(input) && Array.isArray(input.loops)) {
    return input.loops;
  }
  if (isRecord(input) && Array.isArray(input.loopRecords)) {
    return input.loopRecords;
  }
  if (isRecord(input) && typeof input.loop === 'string') {
    return [input];
  }
  return [];
}

function validateParticipant(record, field, pathPrefix, findings) {
  const value = record[field];
  if (!isRecord(value)) {
    findings.push(finding(`missing-${field}`, `Loop record must include ${field} as an object.`, `${pathPrefix}.${field}`));
    return;
  }
  if (!stringField(value, 'type')) {
    findings.push(finding(`missing-${field}-type`, `${field} must include type.`, `${pathPrefix}.${field}.type`));
  }
  if (!stringField(value, 'evidence') && field !== 'arbiter') {
    findings.push(finding(`missing-${field}-evidence`, `${field} must include evidence.`, `${pathPrefix}.${field}.evidence`));
  }
}

function stringField(record, field) {
  const value = record[field];
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function hasAnyEvidenceField(record, fields) {
  return fields.some((field) => hasEvidenceValue(record[field]));
}

function hasEvidenceValue(value) {
  if (typeof value === 'string') {
    return Boolean(value.trim());
  }
  if (Array.isArray(value)) {
    return value.some((item) => hasEvidenceValue(item));
  }
  if (isRecord(value)) {
    return Object.values(value).some((item) => hasEvidenceValue(item));
  }
  return false;
}

function arrayIncludesUnsafeAction(value) {
  if (!Array.isArray(value)) {
    return false;
  }
  return value.some((item) => /edit|write|push|publish|merge|post|resolve-thread|mutate/i.test(String(item || '')));
}

function finding(id, message, pathValue) {
  return { id, message, path: pathValue };
}

function kebab(value) {
  return value.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readInput(file) {
  if (!file) {
    throw new Error('Missing --file <path>');
  }
  const resolved = path.resolve(file);
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

function printHelp() {
  console.log(`Usage: agentic-loop-check.mjs --file <loop-records.json> [--json]

Validates recorded agentic loop evidence without dispatching agents or mutating state.

Each record requires:
  loop, stage, producer{type,evidence}, verifier{type,evidence}, arbiter{type,readOnly:true},
  task or targetSpec, acceptanceCriteria, producer output/artifact/currentDiff/currentVersion,
  evidence, verdict, and mainAgentDecision.

Optional bounded-loop fields:
  single-pass records may omit iteration, maxIterations, and stopCondition;
  when either iteration field is present, iteration and maxIterations must be positive integers and stopCondition is required;
  stopCondition may be continue, revise, interrupt, deliver, handoff, or complete.

Supported loops:
  ${[...ALLOWED_LOOPS].join(', ')}`);
}

function printText(result) {
  if (result.ok) {
    console.log(`Agentic loop check passed for ${result.recordsChecked} record${result.recordsChecked === 1 ? '' : 's'}.`);
    return;
  }
  console.log('Agentic loop findings:');
  for (const item of result.findings) {
    console.log(`- ${item.id}: ${item.message} (${item.path})`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      printHelp();
      process.exitCode = 0;
    } else {
      const result = evaluateAgenticLoopRecords(readInput(options.file));
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        printText(result);
      }
      process.exitCode = result.ok ? 0 : 1;
    }
  } catch (error) {
    console.error(`agentic-loop-check: ${error.message}`);
    process.exitCode = 2;
  }
}
