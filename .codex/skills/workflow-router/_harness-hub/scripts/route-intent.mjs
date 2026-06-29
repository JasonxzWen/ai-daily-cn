#!/usr/bin/env node

import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const LIFECYCLE_GATES = Object.freeze([
  'align-user-need',
  'gather-required-material',
  'write-spec-and-acceptance',
  'write-executable-plan-and-align',
  'clean-unneeded-files',
  'implement',
  'test-and-accept',
  'deliver-report',
]);

const STATE_CONFIG = Object.freeze({
  question: {
    owner: 'answer-workflow',
    mutationAllowed: false,
    requiredGates: ['gather-required-material', 'deliver-report'],
    nextGate: 'Gather required material and answer from evidence.',
    helpers: ['documentation-lookup', 'package-release-sniffer'],
    effectiveInteract: 'default-consider',
    expectedOutputMode: null,
  },
  'sdd-change': {
    owner: 'sdd-workflow',
    mutationAllowed: true,
    requiredGates: LIFECYCLE_GATES,
    nextGate: 'Align user need before spec, plan, cleanup, implementation, and tests.',
    helpers: ['product-capability', 'tdd-workflow', 'verification-loop'],
    effectiveInteract: 'required',
    expectedOutputMode: null,
  },
  diagnosis: {
    owner: 'diagnosis-workflow',
    mutationAllowed: true,
    requiredGates: [
      'align-user-need',
      'gather-required-material',
      'write-executable-plan-and-align',
      'implement',
      'test-and-accept',
      'deliver-report',
    ],
    nextGate: 'Reproduce or bound the symptom before fixing.',
    helpers: ['diagnose', 'agent-introspection-debugging', 'webapp-testing'],
    effectiveInteract: 'default-consider',
    expectedOutputMode: null,
  },
  review: {
    owner: 'review-workflow',
    mutationAllowed: false,
    requiredGates: ['gather-required-material', 'deliver-report'],
    nextGate: 'Gather review evidence and report findings first.',
    helpers: ['compound-code-review', 'security-review', 'web-design-guidelines'],
    effectiveInteract: 'default-consider',
    expectedOutputMode: null,
  },
  delivery: {
    owner: 'delivery-workflow',
    mutationAllowed: true,
    requiredGates: ['clean-unneeded-files', 'test-and-accept', 'deliver-report'],
    nextGate: 'Verify acceptance, PR status when relevant, and residual risks before declaring done.',
    helpers: ['verification-loop', 'effective-interact', 'handoff'],
    effectiveInteract: 'required',
    expectedOutputMode: null,
  },
  'harness-hub-maintenance': {
    owner: 'hub-maintenance-workflow',
    mutationAllowed: true,
    requiredGates: LIFECYCLE_GATES,
    nextGate: 'Gather source, capability, and lifecycle evidence before changing Harness Hub.',
    helpers: ['skill-creator', 'documentation-lookup', 'verification-loop'],
    effectiveInteract: 'required',
    expectedOutputMode: 'html-artifact',
  },
  clarify: {
    owner: null,
    mutationAllowed: false,
    requiredGates: ['align-user-need'],
    nextGate: 'Ask one concise question.',
    helpers: [],
    effectiveInteract: 'not-needed',
    expectedOutputMode: null,
  },
  none: {
    owner: null,
    mutationAllowed: false,
    requiredGates: [],
    nextGate: 'No workflow owner needed.',
    helpers: [],
    effectiveInteract: 'not-needed',
    expectedOutputMode: null,
  },
});

const OWNER_STATE = Object.freeze({
  'answer-workflow': 'question',
  'sdd-workflow': 'sdd-change',
  'diagnosis-workflow': 'diagnosis',
  'review-workflow': 'review',
  'delivery-workflow': 'delivery',
  'hub-maintenance-workflow': 'harness-hub-maintenance',
});

const SIGNALS = Object.freeze({
  trivial: [
    'thanks',
    'thank you',
    'that makes sense',
    'ok',
    'okay',
    '\u597d\u7684',
    '\u8c22\u8c22',
    '\u660e\u767d',
    '\u6536\u5230',
  ],
  vagueNext: [
    'do the thing next',
    'the workflow-router thing next',
    'continue that',
    '\u7ee7\u7eed\u90a3\u4e2a',
    '\u63a5\u7740\u90a3\u4e2a',
    '\u4e0b\u4e00\u6b65\u505a\u90a3\u4e2a\u8def\u7531\u7684\u4e8b\u60c5',
    '\u505a\u90a3\u4e2a\u8def\u7531',
  ],
  noMutation: [
    'do not change',
    "don't change",
    'no edits',
    'read-only',
    '\u4e0d\u8981\u6539',
    '\u5148\u522b\u6539',
    '\u4e0d\u8981\u4fee\u6539',
    '\u4e0d\u6539\u6587\u4ef6',
    '\u53ea\u8bfb',
  ],
  question: [
    'where',
    'why',
    'can it',
    'can this',
    'compare',
    'describe',
    'explain',
    'look up',
    'what is',
    'what are',
    'evidence',
    '\u54ea\u91cc',
    '\u4e3a\u4ec0\u4e48',
    '\u80fd\u5426',
    '\u53ef\u4ee5\u5417',
    '\u5bf9\u6bd4',
    '\u63cf\u8ff0',
    '\u89e3\u91ca',
    '\u4ecb\u7ecd',
    '\u68b3\u7406',
    '\u67e5\u4e00\u4e0b',
    '\u8bc1\u636e',
    '\u8bf4\u660e',
    '\u56de\u7b54',
    '\u603b\u7ed3',
  ],
  sddChange: [
    'add',
    'change',
    'fix',
    'refactor',
    'implement',
    'build',
    'migrate',
    'remove',
    'delete',
    'alter behavior',
    'update code',
    'make it',
    'promote',
    'convert',
    'harden',
    'elevate',
    'turn into',
    'tighten',
    'normalize',
    '\u589e\u52a0',
    '\u65b0\u589e',
    '\u4fee\u6539',
    '\u4fee\u590d',
    '\u91cd\u6784',
    '\u5b9e\u73b0',
    '\u6784\u5efa',
    '\u8fc1\u79fb',
    '\u53bb\u6389',
    '\u79fb\u9664',
    '\u5220\u9664',
    '\u8986\u76d6',
    '\u52a0\u5165',
    '\u8865\u9f50',
    '\u6536\u655b',
    '\u89c4\u8303\u5316',
    '\u7edf\u4e00',
    '\u6539\u6210',
    '\u63d0\u5347',
    '\u6539\u9020',
    '\u56fa\u5316',
  ],
  diagnosis: [
    'fails',
    'failing',
    'failed',
    'error',
    'crash',
    'broken',
    'bug',
    'flaky',
    'hang',
    'stuck',
    'regression',
    'performance',
    'reproduce',
    'root cause',
    '\u5931\u8d25',
    '\u62a5\u9519',
    '\u5d29\u6e83',
    '\u5361\u4f4f',
    '\u590d\u73b0',
    '\u6839\u56e0',
    '\u6027\u80fd',
    '\u56de\u5f52',
    '\u547d\u4ee4\u5931\u8d25',
    '\u6d4b\u8bd5\u5931\u8d25',
    '\u5148\u590d\u73b0',
  ],
  review: [
    'review',
    'audit',
    'assess',
    'risk',
    'security',
    'missing tests',
    'check ui',
    'check ux',
    'confidence',
    '\u4e25\u683c\u5ba1\u67e5',
    '\u5ba1\u67e5',
    '\u8bc4\u5ba1',
    '\u8bc4\u4f30',
    '\u98ce\u9669',
    '\u5b89\u5168',
    '\u7f3a\u6d4b\u8bd5',
    '\u68c0\u67e5',
    '\u8fb9\u754c',
    '\u89e6\u53d1\u573a\u666f',
  ],
  delivery: [
    'finish',
    'validate',
    'clean up',
    'handoff',
    'release notes',
    'closeout',
    'accepted',
    'final',
    'create pr',
    'open pr',
    'create pull request',
    'open pull request',
    'post-pr',
    'after pr',
    'after the pr',
    'pr status',
    'pull request status',
    'mergeability',
    'mergeable',
    'merge state',
    'mergestatestatus',
    'status checks',
    'check runs',
    'ci status',
    'merge conflict',
    '\u5b8c\u6210',
    '\u6536\u5c3e',
    '\u9a8c\u8bc1',
    '\u6e05\u7406',
    '\u4ea4\u4ed8',
    '\u53d1\u5e03\u8bf4\u660e',
    '\u63d0pr',
    '\u63d0 pr',
    '\u521b\u5efapr',
    '\u521b\u5efa pr',
    '\u6253\u5f00pr',
    '\u6253\u5f00 pr',
    '\u63d0 pull request',
    '\u521b\u5efa pull request',
    '\u63d0\u4ea4pr',
    '\u63d0\u4ea4 pr',
    '\u5408\u5e76\u72b6\u6001',
    '\u53ef\u5408\u5e76',
    '\u68c0\u67e5\u72b6\u6001',
    '\u68c0\u67e5\u8fd0\u884c',
    'ci \u72b6\u6001',
    '\u5408\u5e76\u51b2\u7a81',
  ],
  prCloseout: [
    'create pr',
    'open pr',
    'create pull request',
    'open pull request',
    'post-pr',
    'after pr',
    'after the pr',
    'pr status',
    'pull request status',
    'mergeability',
    'mergeable',
    'merge state',
    'mergestatestatus',
    'status checks',
    'check runs',
    'ci status',
    'merge conflict',
    '\u63d0pr',
    '\u63d0 pr',
    '\u521b\u5efapr',
    '\u521b\u5efa pr',
    '\u6253\u5f00pr',
    '\u6253\u5f00 pr',
    '\u63d0 pull request',
    '\u521b\u5efa pull request',
    '\u63d0\u4ea4pr',
    '\u63d0\u4ea4 pr',
    '\u5408\u5e76\u72b6\u6001',
    '\u53ef\u5408\u5e76',
    'ci \u72b6\u6001',
    '\u5408\u5e76\u51b2\u7a81',
  ],
  hubMaintenance: [
    'harness hub',
    'skills',
    'skill',
    'capability',
    'capabilities',
    'routing',
    'router',
    'source projects',
    'upstream skill',
    'effective-interact',
    'effective report',
    'effective-report',
    'install/update/remove',
    'npm',
    'profile',
    'profiles',
    'install set',
    'activation smoke',
    'harness-hub',
    'skill activation',
    '\u6280\u80fd',
    '\u80fd\u529b',
    '\u80fd\u529b\u56fe',
    '\u8def\u7531',
    '\u8def\u7531\u5668',
    '\u89e6\u53d1',
    '\u5b89\u88c5',
    '\u5168\u91cf\u5b89\u88c5',
  ],
  hubMaintenanceAction: [
    'maintain',
    'evaluate',
    'import',
    'routing docs',
    'preserve',
    'remove profile',
    'remove profiles',
    'install profile',
    'install policy',
    'install option',
    'install options',
    'full install',
    'default full install',
    'overwrite same-name',
    'intent classifier',
    'host activation',
    'package',
    'packaging',
    'package artifacts',
    'package contents',
    'npm package',
    'npm pack',
    'skill quality',
    'quality inventory',
    'trigger boundary',
    'trigger boundaries',
    'user-perspective',
    'execution smoke',
    'executable script',
    'routing quality',
    'source dossier',
    'profile \u5b89\u88c5',
    '\u5b89\u88c5 profile',
    '\u5b89\u88c5\u8303\u5f0f',
    '\u5b89\u88c5\u9009\u9879',
    '\u9ed8\u8ba4\u5168\u91cf\u5b89\u88c5',
    '\u5168\u91cf\u5b89\u88c5',
    '\u8986\u76d6\u540c\u540d',
    '\u6253\u5305',
    '\u53d1\u5e03\u5305',
    '\u5305\u5185\u5bb9',
    '\u4ea7\u7269',
    '\u8d28\u91cf',
    '\u8d28\u91cf\u95e8\u7981',
    '\u89e6\u53d1\u8fb9\u754c',
    '\u89e6\u53d1\u573a\u666f',
    '\u8fb9\u754c\u548c\u89e6\u53d1',
    '\u7528\u6237\u89c6\u89d2',
    '\u53ef\u6267\u884c\u811a\u672c',
    '\u8fb9\u754c\u6536\u655b',
    '\u6536\u655b',
    '\u8865\u9f50',
    '\u7ef4\u62a4',
    '\u8bc4\u4f30',
    '\u5bfc\u5165',
    '\u66f4\u65b0\u8def\u7531',
    '\u5b89\u88c5\u7b56\u7565',
    '\u53bb\u6389 profile',
    '\u79fb\u9664 profile',
    '\u7f16\u6392',
    '\u8bc6\u522b\u610f\u56fe',
    '\u610f\u56fe\u8bc6\u522b',
    '\u9876\u5c42\u5de5\u4f5c\u6d41',
    '\u5e76\u884c',
    '\u8c03\u5ea6',
  ],
  hubMaintenanceChangeTarget: [
    'effective-interact',
    'effective report',
    'effective-report',
  ],
});

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function includesAny(text, values) {
  return values.some((value) => matchesSignal(text, value.toLowerCase()));
}

function hasPackageReleaseDiscoverySignal(text) {
  return (
    includesAny(text, [
      'new package',
      'new packages',
      'new version',
      'newly published',
      'package release',
      'package releases',
      'published package',
      'registry feed',
      'release feed',
      'release feeds',
      'release sniff',
      'release sniffing',
      'version sniff',
      'version sniffing',
      '\u7248\u672c\u55c5\u63a2',
      '\u53d1\u5e03\u55c5\u63a2',
      '\u65b0\u5305',
      '\u65b0\u7248\u672c',
      '\u5305\u53d1\u5e03',
      '\u7248\u672c\u53d1\u5e03',
      '\u65b0\u53d1\u5e03',
      '\u521a\u53d1\u5e03',
    ]) || (
      includesAny(text, ['npm', 'pypi', 'registry', 'registries', 'package', 'packages', '\u5305', '\u6a21\u578b\u5305'])
      && includesAny(text, [
        'latest version',
        'new release',
        'new version',
        'published',
        'release',
        'releases',
        'sniff',
        '\u55c5\u63a2',
        '\u6700\u65b0\u7248\u672c',
        '\u65b0\u7248\u672c',
        '\u53d1\u5e03',
        '\u66f4\u65b0',
      ])
    ) || (
      includesAny(text, ['sniff', '\u55c5\u63a2'])
      && includesAny(text, ['release', 'version', 'package', 'registry', 'npm', 'pypi', '\u7248\u672c', '\u53d1\u5e03', '\u5305'])
    )
  );
}

function matchesSignal(text, value) {
  if (/^[a-z0-9'/-]+(?:\s+[a-z0-9'/-]+)*$/.test(value)) {
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(text);
  }

  return text.includes(value);
}

function startsAsTrivial(text) {
  const stripped = text.replace(/[.!?\u3002\uff01\uff1f\s]+$/g, '');
  return SIGNALS.trivial.some((value) => stripped === value.toLowerCase());
}

function hasExplicitOwner(text) {
  for (const [owner, state] of Object.entries(OWNER_STATE)) {
    if (text.includes(owner)) {
      return { owner, state };
    }
  }
  return null;
}

function makeResult(state, confidence, reason, extras = {}) {
  const config = STATE_CONFIG[state];
  return {
    schemaVersion: 1,
    state,
    owner: config.owner,
    confidence,
    reason,
    mutationAllowed: config.mutationAllowed,
    requiredGates: [...config.requiredGates],
    nextGate: config.nextGate,
    allowedHelperSkills: [...config.helpers],
    effectiveInteract: config.effectiveInteract,
    expectedOutputMode: config.expectedOutputMode,
    mutates: false,
    ...extras,
  };
}

export function classifyIntent(prompt) {
  const raw = String(prompt || '').trim();
  const text = normalize(raw);

  if (!text) {
    return makeResult('none', 'high', 'The request is empty.');
  }

  if (startsAsTrivial(text)) {
    return makeResult('none', 'high', 'The request is trivial chat and does not need a workflow owner.');
  }

  const noMutation = includesAny(text, SIGNALS.noMutation);
  const reviewSignal = includesAny(text, SIGNALS.review);
  const questionSignal = includesAny(text, SIGNALS.question);
  const changeSignal = includesAny(text, SIGNALS.sddChange);
  const diagnosisSignal = includesAny(text, SIGNALS.diagnosis);
  const deliverySignal = includesAny(text, SIGNALS.delivery);
  const prCloseoutSignal = includesAny(text, SIGNALS.prCloseout);
  const hubSignal = includesAny(text, SIGNALS.hubMaintenance);
  const hubActionSignal = includesAny(text, SIGNALS.hubMaintenanceAction);
  const hubChangeTargetSignal = includesAny(text, SIGNALS.hubMaintenanceChangeTarget);
  const packageReleaseDiscoverySignal = hasPackageReleaseDiscoverySignal(text);
  const explicitOwner = hasExplicitOwner(text);
  const broadRepoExplainerSignal = (
    includesAny(text, [
      'describe this repo',
      'describe this repository',
      'describe the repo',
      'describe the repository',
      'codebase overview',
      'repo capability map',
      'repository capability map',
    ]) || (
      includesAny(text, ['describe', '\u63cf\u8ff0', '\u8bf4\u660e', '\u89e3\u91ca', '\u4ecb\u7ecd', '\u68b3\u7406'])
      && includesAny(text, ['repo', 'repository', 'codebase', '\u672c\u4ed3\u5e93', '\u8fd9\u4e2a\u4ed3\u5e93', '\u4ed3\u5e93', '\u4ee3\u7801\u5e93'])
      && includesAny(text, ['capability', 'capabilities', 'structure', 'function', 'functions', 'implementation', 'architecture', '\u80fd\u529b', '\u7ed3\u6784', '\u529f\u80fd', '\u5b9e\u73b0', '\u67b6\u6784'])
      && includesAny(text, ['structure', 'implementation', '\u7ed3\u6784', '\u5b9e\u73b0'])
    )
  );

  if (includesAny(text, SIGNALS.vagueNext) && !changeSignal && !explicitOwner) {
    return makeResult('clarify', 'medium', 'The request references prior work but does not say whether to review, plan, or implement.', {
      clarification: 'Should I review the current plan, continue implementation, or produce a delivery handoff?',
    });
  }

  if (noMutation && (reviewSignal || questionSignal)) {
    return makeResult(reviewSignal ? 'review' : 'question', 'high', 'The user requested evidence or review and explicitly blocked mutation.');
  }

  if (packageReleaseDiscoverySignal && !changeSignal && !reviewSignal && !diagnosisSignal) {
    return makeResult('question', 'high', 'The request is read-only package or model-package release discovery.');
  }

  if (broadRepoExplainerSignal) {
    return makeResult('question', 'high', 'The user asked for a broad read-only repository explainer where a navigable visual report lowers interpretation cost.', {
      effectiveInteract: 'required',
      expectedOutputMode: 'html-artifact',
    });
  }

  if (hubSignal && hubActionSignal) {
    return makeResult('harness-hub-maintenance', 'high', 'The request targets Harness Hub capability, routing, source, packaging, or lifecycle maintenance.');
  }

  if (hubSignal && changeSignal && hubChangeTargetSignal) {
    return makeResult('harness-hub-maintenance', 'high', 'The request changes a repo-owned skill, report, routing, or capability behavior.');
  }

  if (reviewSignal && changeSignal && !noMutation) {
    return makeResult('clarify', 'medium', 'The request mixes review and mutation without making the desired first step explicit.', {
      clarification: 'Should I review first without edits, or implement the accepted fix?',
    });
  }

  if (explicitOwner) {
    return makeResult(explicitOwner.state, 'high', `The user explicitly referenced ${explicitOwner.owner}.`);
  }

  if (prCloseoutSignal && !changeSignal) {
    return makeResult('delivery', 'high', 'The user asked for PR creation, mergeability, CI status, conflict triage, or post-PR closeout.');
  }

  if (diagnosisSignal) {
    return makeResult('diagnosis', 'high', 'The request starts from a failure, bug, flaky behavior, or performance symptom.');
  }

  if (deliverySignal && !changeSignal) {
    return makeResult('delivery', 'high', 'The user asked for validation, cleanup, handoff, or closeout of accepted work.');
  }

  if (reviewSignal) {
    return makeResult('review', 'high', 'The user asked for review, audit, risk assessment, security check, UI/UX check, or missing-test analysis.');
  }

  if (questionSignal && !changeSignal) {
    return makeResult('question', 'high', 'The user asked for explanation, comparison, lookup, feasibility, or evidence without requesting changes.');
  }

  if (changeSignal) {
    return makeResult('sdd-change', hubSignal ? 'medium' : 'high', 'The user asked to add, change, fix, refactor, implement, build, migrate, or alter behavior.');
  }

  if (hubSignal) {
    return makeResult('harness-hub-maintenance', 'medium', 'The request references Harness Hub routing or capabilities, but the action is not fully explicit.');
  }

  return makeResult('none', 'low', 'No non-trivial workflow owner signal was detected.');
}

function parseArgs(argv) {
  const options = {
    prompt: '',
    promptFile: null,
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
  console.log(`Usage: route-intent.mjs --prompt <request> [--json]
       route-intent.mjs --prompt-file <file> [--json]

Classifies a user request into one Workflow Router owner. The command is side-effect free:
it never edits files, dispatches subagents, calls tools, or starts implementation.`);
}

function printText(result) {
  console.log(`STATE: ${result.state}`);
  console.log(`CONFIDENCE: ${result.confidence}`);
  console.log(`REASON: ${result.reason}`);
  console.log(`OWNER: ${result.owner || 'none'}`);
  console.log(`NEXT GATE: ${result.nextGate}`);
  console.log(`HELPERS: ${result.allowedHelperSkills.join(', ') || 'none'}`);
  console.log(`EFFECTIVE_INTERACT: ${result.effectiveInteract}`);
  console.log(`EXPECTED_OUTPUT_MODE: ${result.expectedOutputMode || 'none'}`);
  if (result.clarification) {
    console.log(`CLARIFICATION: ${result.clarification}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      printHelp();
      process.exitCode = 0;
    } else {
      const result = classifyIntent(options.prompt);
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        printText(result);
      }
      process.exitCode = 0;
    }
  } catch (error) {
    console.error(`route-intent: ${error.message}`);
    process.exitCode = 2;
  }
}
