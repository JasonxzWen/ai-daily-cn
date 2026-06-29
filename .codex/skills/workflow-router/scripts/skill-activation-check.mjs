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

function includesAny(text, values) {
  return values.some((value) => text.includes(value));
}

function matchesAny(text, values) {
  return values.some((value) => value.test(text));
}

function readSkillMetadata(skillsRoot = DEFAULT_SKILLS_ROOT) {
  const metadata = new Map();

  for (const entry of fs.readdirSync(skillsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const skillPath = path.join(skillsRoot, entry.name, 'SKILL.md');
    if (!fs.existsSync(skillPath)) {
      continue;
    }

    const skill = fs.readFileSync(skillPath, 'utf8');
    const description = skill.match(/^description:\s*(?:"([^"]+)"|'([^']+)'|(.+))$/m);

    metadata.set(entry.name, {
      description: (description?.[1] || description?.[2] || description?.[3] || '').toLowerCase(),
      path: skillPath,
    });
  }

  return metadata;
}

function canLoad(metadata, skill, requiredTerms) {
  const description = metadata.get(skill)?.description;

  return Boolean(description && requiredTerms.some((term) => description.includes(term)));
}

function buildActivationResult(prompt, metadata, skillsRoot) {
  const selectedSkill = selectSkillForPrompt(prompt, metadata);

  return {
    schemaVersion: 1,
    mutates: false,
    dispatchesSubagents: false,
    skillsRoot,
    metadataSkillCount: metadata.size,
    selectedSkill,
    confidence: selectedSkill ? 'medium' : 'low',
    reason: selectedSkill
      ? 'Selected from installed SKILL.md trigger metadata and boundary signals.'
      : 'No installed skill trigger metadata matched the prompt strongly enough.',
  };
}

export function selectSkillForPrompt(prompt, metadata = readSkillMetadata()) {
  const text = String(prompt || '').toLowerCase();
  const effectiveInteractSignal = includesAny(text, [
    'acceptance report',
    'approval board',
    'architecture',
    'collapsible findings',
    'complex communication',
    'copyable action items',
    'copyable prompt',
    'codebase overview',
    'dependency map',
    'design system',
    'describe this repo',
    'describe this repository',
    'effective interaction',
    'effective report',
    'effective-report',
    'export editor',
    'html acceptance',
    'html editor',
    'html 汇报',
    'html 报告',
    'html 交付',
    'html handoff',
    'html option',
    'html report',
    'implementation plan',
    'information loss',
    'incident report',
    'ledger',
    'long-task',
    'milestone',
    'multi-option',
    'option gallery',
    'pause report',
    'pauses to report',
    'prompt tuning',
    'relatively complex information',
    'reasoning, changed areas',
    'review artifact',
    'self-contained html',
    'status board',
    'structure tree',
    'structured markdown',
    'visual handoff',
    'visual language',
    'visual markdown',
  ]) || matchesAny(text, [
    /(?:\u63cf\u8ff0|\u8bf4\u660e|\u89e3\u91ca|\u4ecb\u7ecd|\u68b3\u7406).*(?:\u672c\u4ed3\u5e93|\u8fd9\u4e2a\u4ed3\u5e93|\u4ed3\u5e93|repo|repository|codebase).*(?:\u80fd\u529b|\u7ed3\u6784|\u529f\u80fd|\u5b9e\u73b0|\u67b6\u6784)/,
    /(?:\u672c\u4ed3\u5e93|\u8fd9\u4e2a\u4ed3\u5e93|\u4ed3\u5e93|repo|repository|codebase).*(?:\u80fd\u529b|\u7ed3\u6784).*(?:\u529f\u80fd|\u5b9e\u73b0|\u67b6\u6784)/,
    /\u72b6\u6001/,
    /html\s*[\u6c47\u62a5\u544a\u4ea4\u4ed8]+/,
    /[\u751f\u6210\u8f93\u51fa\u5236\u4f5c].*html.*\u6c47\u62a5/,
    /\u6c47\u62a5.*html/,
    /\u505c\u4e0b\u6765.*\u6c47\u62a5/,
    /\u590d\u6742.*\u6c47\u62a5/,
    /\u6c47\u62a5.*\u590d\u6742/,
    /\u7eaf\u6587\u672c/,
    /\u5ba1\u6279/,
    /\u76ee\u5f55\u6811/,
    /\u4e00\u773c\u770b\u61c2/,
    /\u6280\u672f\u65b9\u6848/,
    /\u53ef\u89c6\u5316\u8bed\u8a00/,
    /\u4fe1\u606f\u635f\u5931/,
    /\u4eba\u673a\u4ea4\u4e92.*\u65f6\u95f4/,
    /\u4ea4\u4e92\u65f6\u95f4.*\u5f00\u9500/,
    /\u89c6\u89c9\u98ce\u683c/,
  ]);
  const finalGateSignal = (
    includesAny(text, [
      'before completion',
      'before declaring',
      'artifact validation',
      'branch is ready',
      'build, typecheck',
      'final build',
      'final validation',
      'lint',
      'open the pr',
      'smoke checks',
      'tests, validation',
      'typecheck',
      'validation commands',
    ]) || (text.startsWith('run ') && includesAny(text, ['build', 'tests', 'validation']))
  ) && !includesAny(text, ['copyable', 'editor', 'fix with tests', 'implement']);
  const failureSignal = includesAny(text, [
    'broken',
    'bug',
    'crash',
    'error',
    'failed',
    'fails',
    'flaky',
    'performance',
    'reproduce',
    'returns 500',
    'root cause',
    'timeout',
  ]) && !includesAny(text, ['failing behavior test first', 'failing test first', 'incident report', 'review artifact', 'test first']);
  const securitySignal = includesAny(text, [
    'auth',
    'authentication',
    'injection',
    'middleware',
    'payment',
    'secret',
    'secrets',
    'security',
    'unsafe input',
    'unsafe io',
    'webhook',
  ]);
  const cloneWebsiteSignal = includesAny(text, [
    'clone our authorized',
    'clone website',
    'clone a website',
    'clone the website',
    'clone this website',
    'copy of this site',
    'rebuild an authorized website',
    'rebuild this page',
    'reverse-engineer',
    'website clone',
  ]) || (
    includesAny(text, ['clone', 'rebuild'])
    && includesAny(text, ['site', 'url', 'web page', 'website'])
    && includesAny(text, ['authorized', 'own', 'public', 'replace the content'])
  );
  const agentSignal = includesAny(text, [
    'agent is stuck',
    'agent keeps',
    'agent run',
    'burning context',
    'context drift',
    'harness',
    'recoverable tool',
    'tool calls',
    'tool limits',
    'tool loop',
  ]);
  const hubMaintenanceSignal = includesAny(text, [
    'harness hub',
    'harness-hub',
  ]) && includesAny(text, [
    'capability metadata',
    'install policy',
    'maintain',
    'maintaining',
    'npm',
    'quality',
    'routing',
    'source records',
  ]);
  const prototypeSignal = includesAny(text, [
    'before choosing',
    'compare two',
    'disposable',
    'mock interaction',
    'playable design',
    'prototype',
    'sanity check',
    'throwaway prototype',
  ]);
  const reviewSignal = includesAny(text, [
    'code review',
    'confidence',
    'missing tests',
    'pre-pr',
    'pr review',
    'regressions',
    'review',
    'structured findings',
  ]);
  const learningSignal = includesAny(text, [
    'coached',
    'exam',
    'explain it back',
    'interview',
    'learn',
    'master',
    'study',
    'syllabus',
    'teach me',
    'tutoring',
  ]);
  const productUiSignal = includesAny(text, [
    'branded product landing',
    'html/css layouts',
    'landing page',
    'marketing blog site',
    'polished saas dashboard',
    'product ui',
    'production marketing',
    'production dashboard',
    'production-grade visual',
    'react components',
    'styling',
    'web pages',
  ]) || (includesAny(text, ['dashboard page', 'product page']) && includesAny(text, ['build', 'polished', 'production']));
  const grillSignal = includesAny(text, [
    'challenge my assumptions',
    'grill me',
    'one-question-at-a-time',
    'pressure test',
    'pressure-test',
    'push back on this plan',
  ]);
  const productCapabilitySignal = includesAny(text, [
    'capability plan',
    'implementation-ready capability',
    'invariants',
    'product constraints',
    'roadmap item',
    'unresolved decisions',
  ]) && includesAny(text, ['acceptance', 'constraints', 'interfaces', 'prd', 'product']);
  const documentationLookupSignal = includesAny(text, [
    'api docs',
    'cloud-service docs',
    'current docs',
    'current documentation',
    'framework docs',
    'latest docs',
    'library docs',
    'official docs',
    'sdk docs',
  ]) || (includesAny(text, ['docs', 'documentation']) && includesAny(text, ['current', 'latest', 'official']));
  const packageReleaseSignal = (
    includesAny(text, [
      'new package',
      'new packages',
      'new release',
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
        'ai',
        'developer-tool',
        'latest version',
        'new release',
        'new version',
        'package',
        'packages',
        'published',
        'release',
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
  ) && !documentationLookupSignal;
  const webArtifactsSignal = includesAny(text, [
    'browser artifact',
    'bundled components',
    'react/tailwind',
    'shadcn',
    'standalone react',
    'stateful browser artifact',
  ]) && !includesAny(text, ['report', 'handoff', 'production ui']);
  const frontendSlidesSignal = includesAny(text, [
    'html presentation',
    'pitch slides',
    'ppt',
    'pptx',
    'slide deck',
    'talk slides',
  ]);
  const frontendPatternsSignal = includesAny(text, [
    'component patterns',
    'form state',
    'frontend logic',
    'next.js routing',
    'react state',
    'responsive behavior',
  ]) && includesAny(text, ['accessibility', 'forms', 'hooks', 'implement', 'react', 'routing', 'state']);
  const e2eTestingSignal = includesAny(text, [
    'ci browser test',
    'durable playwright',
    'e2e suite',
    'page object',
    'playwright e2e',
  ]);
  const webappTestingSignal = includesAny(text, [
    'console logs',
    'local web app inspection',
    'one-off browser',
    'running dev server',
    'screenshot',
    'ui reproduction',
  ]);
  const webDesignGuidelinesSignal = includesAny(text, [
    'accessibility audit',
    'check ui',
    'check ux',
    'ui audit',
    'ux audit',
    'web interface guideline',
  ]);
  const designTasteSignal = (
    includesAny(text, [
      'anti-slop',
      'anti-template',
      'design read',
      'design taste',
      'generic landing',
      'make it not look templated',
      'marketing landing',
      'non-templated',
      'portfolio',
      'taste-skill',
      'visual direction',
    ]) || (
      includesAny(text, ['landing page', 'marketing page', 'redesign'])
      && includesAny(text, ['anti-template', 'design direction', 'not generic', 'not templated', 'visual direction'])
    )
  ) && !includesAny(text, [
    'dashboard',
    'data table',
    'html report',
    'multi-step',
    'react state',
    'slide deck',
  ]);
  const openspecExploreSignal = includesAny(text, [
    'openspec discovery',
    'openspec exploration',
    'openspec explore',
  ]);
  const openspecProposeSignal = includesAny(text, [
    'new openspec proposal',
    'openspec proposal',
    'spec deltas',
  ]);
  const openspecApplySignal = includesAny(text, [
    'apply openspec change',
    'existing openspec change',
    'implement openspec change',
  ]);
  const openspecArchiveSignal = includesAny(text, [
    'archive openspec',
    'completed openspec change',
    'finalize openspec',
    'openspec archive',
  ]);
  const ralphPrdSignal = includesAny(text, [
    'ralph-ready prd',
    'scripts/ralph/prd.json',
    'story breakdown',
  ]);
  const ralphLoopSignal = includesAny(text, [
    'ralph loop',
    'ralph-style',
    'repeated autonomous agent iterations',
  ]);
  const claudeApiSignal = includesAny(text, [
    'anthropic sdk',
    'claude api',
    'claude sdk',
  ]);
  const mcpBuilderSignal = includesAny(text, [
    'build an mcp server',
    'mcp resource',
    'mcp server',
    'mcp tool schema',
  ]);
  const skillCreatorSignal = includesAny(text, [
    'adapt a standard agent skill',
    'create a skill',
    'evaluate a standard skill',
    'skill authoring',
    'update a skill',
  ]);
  const sourcePostSignal = includesAny(text, [
    'external openai article',
    'preserve figures and links',
    'source-backed public post',
    'source-backed post',
    'turn this external',
  ]) && includesAny(text, [
    'article',
    'blog',
    'effective-interact summary',
    'repo should change',
  ]);
  const insightSignal = (
    includesAny(text, [
      'agent task profile',
      'collaboration bottleneck',
      'cross-session codex',
      'cross-session claude code',
      'human-agent collaboration',
      'interaction insight audit',
      'project interaction audit',
      'repository interaction audit',
      'tool-call decision audit',
      'work trace review',
    ]) || matchesAny(text, [
      /\bhuman-agent\b.*\b(?:audit|bottleneck|collaboration|interaction|trace)\b/,
      /\b(?:codex|claude code)\b.*\b(?:session|trace|work history)\b.*\b(?:audit|review|profile)\b/,
      /\b(?:agent|tool-call)\b.*\b(?:decision|trace)\b.*\b(?:audit|review)\b/,
      /(?:\u4eba\u673a\u4ea4\u4e92|\u4eba\u673a\u534f\u4f5c).*(?:\u590d\u76d8|\u5ba1\u8ba1|\u5361\u70b9|\u753b\u50cf)/,
      /(?:\u4f1a\u8bdd\u8bb0\u5f55|\u5de5\u4f5c\u8bb0\u5f55).*(?:codex|claude code).*(?:\u68b3\u7406|\u590d\u76d8|\u5ba1\u8ba1)/,
    ])
  ) && !sourcePostSignal && !includesAny(text, [
    'external article',
    'public post',
    'source-backed post',
    'source-backed public post',
  ]);
  const docCoauthoringSignal = includesAny(text, [
    'collaboratively draft',
    'decision record',
    'draft prd',
    'reader-test',
    'restructure this doc',
    'write an rfc',
  ]);
  const internalCommsSignal = includesAny(text, [
    '3p update',
    'faq for the team',
    'internal newsletter',
    'leadership update',
    'project update',
    'status report for leadership',
  ]);
  const stopSlopSignal = includesAny(text, [
    'ai tells',
    'ai-writing tells',
    'formulaic contrast',
    'generic business prose',
    'remove ai tells',
    'throat-clearing',
  ]) && includesAny(text, [
    'draft',
    'edit',
    'english essay',
    'english prose',
    'prose',
    'review',
  ]);
  const themeFactorySignal = includesAny(text, [
    'apply a visual theme',
    'choose a coherent visual theme',
    'theme for this deck',
    'theme for this doc',
    'theme for this report',
    'visual theme',
  ]);
  const slackGifSignal = includesAny(text, [
    'animated gif for slack',
    'slack emoji',
    'slack gif',
  ]);
  const codingStandardsSignal = includesAny(text, [
    'code quality conventions',
    'coding standards',
    'cross-project naming',
    'cross-project code quality',
    'layering conventions',
  ]);
  const harnessQualityCheckSignal = (
    includesAny(text, [
      'harness quality audit',
      'harness quality check',
      'harness-quality-check',
      'harness readiness audit',
      'quality readiness check',
      'quality/readiness check',
      'target repo harness quality',
    ]) || (
      includesAny(text, ['harness hub', 'harness-hub', 'hub checkout', 'target repo', 'target repository'])
      && includesAny(text, [
        'advisory',
        'agent readiness',
        'audit',
        'quality',
        'readiness',
        'self-check',
        'skill-quality',
        'validate-harness',
      ])
      && includesAny(text, ['findings', 'html', 'report'])
    )
  ) && !finalGateSignal && !codingStandardsSignal && !skillCreatorSignal;
  const karpathyGuidelinesSignal = includesAny(text, [
    'avoid overcomplication',
    'coding behavior baseline',
    'karpathy',
    'simple, surgical',
    'surgical',
    'verifiable success',
  ]) && includesAny(text, [
    'implementation scope',
    'owner workflow',
    'patch',
    'refactor',
    'review',
    'scope',
    'selected',
  ]);
  const handoffSignal = includesAny(text, [
    'compact this conversation',
    'create a handoff',
    'handoff for',
    'next agent',
    'restart notes',
    'session handoff',
  ]);
  const implementationSignal = includesAny(text, [
    'add validation',
    'feature',
    'fix',
    'production feature',
    'production implementation',
    'refactor',
    'with tests',
  ]) || matchesAny(text, [/\bimplement(?:ed|ing)?\b/]);

  if (harnessQualityCheckSignal && canLoad(metadata, 'harness-quality-check', ['harness quality', 'advisory HTML'])) {
    return 'harness-quality-check';
  }

  if (effectiveInteractSignal && canLoad(metadata, 'effective-interact', ['complex communication', 'handoff'])) {
    return 'effective-interact';
  }

  if (finalGateSignal && canLoad(metadata, 'verification-loop', ['final build', 'artifact checks'])) {
    return 'verification-loop';
  }

  if (cloneWebsiteSignal && canLoad(metadata, 'clone-website', ['clone', 'reverse-engineer'])) {
    return 'clone-website';
  }

  if (securitySignal && canLoad(metadata, 'security-review', ['security-sensitive', 'injection'])) {
    return 'security-review';
  }

  if (hubMaintenanceSignal) {
    return null;
  }

  if (insightSignal && canLoad(metadata, 'insight', ['interaction insight audit', 'claude code'])) {
    return 'insight';
  }

  if (agentSignal && canLoad(metadata, 'agent-introspection-debugging', ['agent run', 'harness/tool'])) {
    return 'agent-introspection-debugging';
  }

  if (prototypeSignal && canLoad(metadata, 'prototype', ['throwaway prototype', 'production feature'])) {
    return 'prototype';
  }

  if (grillSignal && canLoad(metadata, 'grill-me', ['grill me', 'one-question-at-a-time'])) {
    return 'grill-me';
  }

  if (productCapabilitySignal && canLoad(metadata, 'product-capability', ['implementation-ready capability'])) {
    return 'product-capability';
  }

  if (codingStandardsSignal && canLoad(metadata, 'coding-standards', ['code quality conventions'])) {
    return 'coding-standards';
  }

  if (karpathyGuidelinesSignal && canLoad(metadata, 'karpathy-guidelines', ['coding behavior baseline', 'verifiable success'])) {
    return 'karpathy-guidelines';
  }

  if (documentationLookupSignal && canLoad(metadata, 'documentation-lookup', ['current library', 'documentation'])) {
    return 'documentation-lookup';
  }

  if (packageReleaseSignal && canLoad(metadata, 'package-release-sniffer', ['newly published package', 'release feeds'])) {
    return 'package-release-sniffer';
  }

  if (claudeApiSignal && canLoad(metadata, 'claude-api', ['claude api', 'anthropic sdk'])) {
    return 'claude-api';
  }

  if (skillCreatorSignal && canLoad(metadata, 'skill-creator', ['standard agent skill'])) {
    return 'skill-creator';
  }

  if (sourcePostSignal && canLoad(metadata, 'source-post', ['source-backed public post'])) {
    return 'source-post';
  }

  if (openspecArchiveSignal && canLoad(metadata, 'openspec-archive-change', ['archive a completed openspec change'])) {
    return 'openspec-archive-change';
  }

  if (reviewSignal && !failureSignal && canLoad(metadata, 'compound-code-review', ['deep pre-pr', 'structured findings'])) {
    return 'compound-code-review';
  }

  if (failureSignal && canLoad(metadata, 'diagnose', ['hard bugs', 'unknown root causes'])) {
    return 'diagnose';
  }

  if (learningSignal && !implementationSignal && canLoad(metadata, 'feynman-learning-coach', ['learn', 'feynman'])) {
    return 'feynman-learning-coach';
  }

  if (webArtifactsSignal && canLoad(metadata, 'web-artifacts-builder', ['standalone react', 'browser artifacts'])) {
    return 'web-artifacts-builder';
  }

  if (frontendSlidesSignal && canLoad(metadata, 'frontend-slides', ['html presentation', 'slide deck'])) {
    return 'frontend-slides';
  }

  if (frontendPatternsSignal && canLoad(metadata, 'frontend-patterns', ['react', 'frontend logic'])) {
    return 'frontend-patterns';
  }

  if (e2eTestingSignal && canLoad(metadata, 'e2e-testing', ['durable playwright', 'e2e'])) {
    return 'e2e-testing';
  }

  if (webappTestingSignal && canLoad(metadata, 'webapp-testing', ['one-off local web app inspection'])) {
    return 'webapp-testing';
  }

  if (webDesignGuidelinesSignal && canLoad(metadata, 'web-design-guidelines', ['ui, ux, accessibility'])) {
    return 'web-design-guidelines';
  }

  if (designTasteSignal && canLoad(metadata, 'design-taste-frontend', ['anti-template frontend visual direction', 'landing pages'])) {
    return 'design-taste-frontend';
  }

  if (productUiSignal && canLoad(metadata, 'frontend-design', ['polished product ui', 'styling'])) {
    return 'frontend-design';
  }

  if (handoffSignal && !includesAny(text, ['context-limit timing', 'html', 'report', 'should i compact', 'visual'])
    && canLoad(metadata, 'handoff', ['hand off current work', 'restart notes'])) {
    return 'handoff';
  }

  if (openspecExploreSignal && canLoad(metadata, 'openspec-explore', ['openspec exploration'])) {
    return 'openspec-explore';
  }

  if (openspecProposeSignal && canLoad(metadata, 'openspec-propose', ['openspec proposal'])) {
    return 'openspec-propose';
  }

  if (openspecApplySignal && canLoad(metadata, 'openspec-apply-change', ['existing openspec change'])) {
    return 'openspec-apply-change';
  }

  if (ralphLoopSignal && canLoad(metadata, 'ralph-loop', ['ralph-style'])) {
    return 'ralph-loop';
  }

  if (ralphPrdSignal && canLoad(metadata, 'ralph-prd', ['ralph-ready prd'])) {
    return 'ralph-prd';
  }

  if (mcpBuilderSignal && canLoad(metadata, 'mcp-builder', ['mcp server'])) {
    return 'mcp-builder';
  }

  if (docCoauthoringSignal && canLoad(metadata, 'doc-coauthoring', ['collaboratively draft'])) {
    return 'doc-coauthoring';
  }

  if (internalCommsSignal && canLoad(metadata, 'internal-comms', ['internal communications'])) {
    return 'internal-comms';
  }

  if (stopSlopSignal && canLoad(metadata, 'stop-slop', ['english prose', 'ai-writing tells'])) {
    return 'stop-slop';
  }

  if (themeFactorySignal && canLoad(metadata, 'theme-factory', ['coherent visual theme'])) {
    return 'theme-factory';
  }

  if (slackGifSignal && canLoad(metadata, 'slack-gif-creator', ['slack emoji'])) {
    return 'slack-gif-creator';
  }

  if (implementationSignal && canLoad(metadata, 'tdd-workflow', ['implementing features', 'red-green-refactor'])) {
    return 'tdd-workflow';
  }

  return null;
}

export function checkSkillActivation(options) {
  const skillsRoot = path.resolve(options.skillsRoot || DEFAULT_SKILLS_ROOT);
  const metadata = readSkillMetadata(skillsRoot);

  return buildActivationResult(options.prompt, metadata, skillsRoot);
}

export function checkSkillActivationCases(options) {
  const skillsRoot = path.resolve(options.skillsRoot || DEFAULT_SKILLS_ROOT);
  const metadata = readSkillMetadata(skillsRoot);
  const fixture = JSON.parse(fs.readFileSync(options.casesFile, 'utf8'));
  if (!Array.isArray(fixture.cases)) {
    throw new Error(`Cases file '${options.casesFile}' must contain a cases array.`);
  }

  const cases = fixture.cases.map((entry) => {
    const selectedSkill = selectSkillForPrompt(entry.prompt, metadata);
    const expectedSkill = entry.expectedSkill ?? null;
    const passed = expectedSkill === null
      ? selectedSkill === null
      : selectedSkill === expectedSkill;

    return {
      id: entry.id,
      kind: entry.kind,
      skill: entry.skill,
      expectedSkill,
      selectedSkill,
      passed,
    };
  });
  const failedCases = cases.filter((entry) => !entry.passed);
  const coveredSkills = [...new Set(cases.map((entry) => entry.skill))]
    .filter((skill) => metadata.has(skill))
    .sort();
  const helperSkills = [...metadata.keys()]
    .filter((skill) => !TOP_LEVEL_WORKFLOW_SKILLS.has(skill));
  const uncoveredSkills = helperSkills
    .filter((skill) => !coveredSkills.includes(skill))
    .sort();
  const boundaryCoveredSkills = helperSkills
    .filter((skill) => {
      const skillCases = cases.filter((entry) => entry.skill === skill);
      const hasPositive = skillCases.some((entry) => entry.kind === 'positive');
      const hasBoundary = skillCases.some((entry) => entry.kind === 'negative' || entry.kind === 'forbidden-load');
      return hasPositive && hasBoundary;
    })
    .sort();
  const boundaryUncoveredSkills = helperSkills
    .filter((skill) => !boundaryCoveredSkills.includes(skill))
    .sort();
  const excludedTopLevelWorkflowSkills = [...metadata.keys()]
    .filter((skill) => TOP_LEVEL_WORKFLOW_SKILLS.has(skill))
    .sort();

  return {
    schemaVersion: 1,
    mutates: false,
    dispatchesSubagents: false,
    skillsRoot,
    casesFile: path.resolve(options.casesFile),
    metadataSkillCount: metadata.size,
    summary: {
      caseCount: cases.length,
      passedCount: cases.length - failedCases.length,
      failedCount: failedCases.length,
      coveredSkillCount: coveredSkills.length,
      uncoveredSkillCount: uncoveredSkills.length,
      boundaryCoveredSkillCount: boundaryCoveredSkills.length,
      boundaryUncoveredSkillCount: boundaryUncoveredSkills.length,
      excludedTopLevelWorkflowSkillCount: excludedTopLevelWorkflowSkills.length,
    },
    coveredSkills,
    uncoveredSkills,
    boundaryCoveredSkills,
    boundaryUncoveredSkills,
    excludedTopLevelWorkflowSkills,
    ok: failedCases.length === 0 && boundaryUncoveredSkills.length === 0,
    cases,
  };
}

function parseArgs(argv) {
  const options = {
    prompt: '',
    promptFile: null,
    casesFile: null,
    skillsRoot: null,
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
    } else if (arg === '--cases-file') {
      options.casesFile = readValue(argv, ++index, arg);
    } else if (arg === '--skills-root') {
      options.skillsRoot = readValue(argv, ++index, arg);
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
  console.log(`Usage: skill-activation-check.mjs --prompt <request> [--skills-root <dir>] [--json]
       skill-activation-check.mjs --prompt-file <file> [--skills-root <dir>] [--json]
       skill-activation-check.mjs --cases-file <file> [--skills-root <dir>] [--json]

Checks helper skill activation and boundary coverage from installed SKILL.md trigger metadata. The command is side-effect free:
it never edits files, dispatches subagents, calls tools, or starts implementation.`);
}

function printText(result) {
  if (result.summary) {
    console.log(`CASES: ${result.summary.caseCount}`);
    console.log(`PASSED: ${result.summary.passedCount}`);
    console.log(`FAILED: ${result.summary.failedCount}`);
    console.log(`COVERED_SKILLS: ${result.summary.coveredSkillCount}`);
    console.log(`UNCOVERED_SKILLS: ${result.summary.uncoveredSkillCount}`);
    console.log(`BOUNDARY_COVERED_SKILLS: ${result.summary.boundaryCoveredSkillCount}`);
    console.log(`BOUNDARY_UNCOVERED_SKILLS: ${result.summary.boundaryUncoveredSkillCount}`);
    console.log(`EXCLUDED_TOP_LEVEL_WORKFLOW_SKILLS: ${result.summary.excludedTopLevelWorkflowSkillCount}`);
    if (!result.ok) {
      console.log('FAILED_CASES:');
      for (const entry of result.cases.filter((item) => !item.passed)) {
        console.log(`- ${entry.id}: expected ${entry.expectedSkill || `not ${entry.skill}`}, got ${entry.selectedSkill || 'none'}`);
      }
      if (result.boundaryUncoveredSkills?.length > 0) {
        console.log(`BOUNDARY_UNCOVERED: ${result.boundaryUncoveredSkills.join(', ')}`);
      }
    }
    return;
  }

  console.log(`SELECTED_SKILL: ${result.selectedSkill || 'none'}`);
  console.log(`CONFIDENCE: ${result.confidence}`);
  console.log(`SKILLS_ROOT: ${result.skillsRoot}`);
  console.log(`METADATA_SKILL_COUNT: ${result.metadataSkillCount}`);
  console.log(`REASON: ${result.reason}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      printHelp();
      process.exitCode = 0;
    } else {
      const result = options.casesFile
        ? checkSkillActivationCases(options)
        : checkSkillActivation(options);
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        printText(result);
      }
      process.exitCode = result.ok === false ? 1 : 0;
    }
  } catch (error) {
    console.error(`skill-activation-check: ${error.message}`);
    process.exitCode = 2;
  }
}
