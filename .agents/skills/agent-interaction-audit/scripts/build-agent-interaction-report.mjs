#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PRIMARY_SIGNALS = ['userRequest', 'toolTrace', 'validation', 'blocker', 'decision', 'handoff'];
const LEARNING_SIGNALS = [
  'promptContext',
  'userFriction',
  'guidanceDrift',
  'repeatedMistake',
  'sopLesson',
  'encodingIssue',
  'githubSop',
  'knowledgeCache',
  'automation',
];
const QUEUE_CATEGORIES = [
  'project-rule-candidate',
  'stale-info-removal-candidate',
  'sop-candidate',
  'knowledge-cache-candidate',
  'eval-case-candidate',
];
const QUEUE_STATUSES = [
  'new',
  'seen-before',
  'accepted',
  'rejected',
  'needs-more-evidence',
  'superseded',
  'applied-outside-agent-interaction-audit',
];
const QUEUE_PRIORITY_SCORE = { P0: 3, P1: 2, P2: 1 };
const COST_REDUCTION_SCORE = { high: 3, medium: 2, low: 1, unknown: 0 };
const EVIDENCE_TIER_SCORE = { strong: 3, medium: 2, weak: 1, unknown: 0 };
const RISK_SCORE = { low: 3, medium: 2, high: 1, unknown: 0 };
const PATCH_DRAFT_PRIORITIES = new Set(['P0', 'P1']);

function usage() {
  return `Usage: node skills/agent-interaction-audit/scripts/build-agent-interaction-report.mjs --ledger <events.jsonl> [--manifest <manifest.json>] [--out <report.md>] [--effective-interact-input <input.json>] [--no-patch-drafts] [--json]

Builds a private Markdown report from an agent interaction event ledger.
Optionally writes an effective-interact JSON input for a visual HTML handoff.
Use --no-patch-drafts for strict report + queue runs that should not create draft patch artifacts.`;
}

function parseArgs(argv) {
  const options = {
    ledger: null,
    manifest: null,
    out: null,
    effectiveInteractInput: null,
    noPatchDrafts: false,
    json: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--ledger') {
      options.ledger = readValue(argv, ++index, arg);
    } else if (arg === '--manifest') {
      options.manifest = readValue(argv, ++index, arg);
    } else if (arg === '--out') {
      options.out = readValue(argv, ++index, arg);
    } else if (arg === '--effective-interact-input') {
      options.effectiveInteractInput = readValue(argv, ++index, arg);
    } else if (arg === '--no-patch-drafts') {
      options.noPatchDrafts = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unsupported option '${arg}'.`);
    }
  }

  return options;
}

function readValue(argv, index, flag) {
  const value = argv[index];
  if (!value) {
    throw new Error(`Missing value for ${flag}.`);
  }
  return value;
}

function readLedger(ledgerPath) {
  if (!ledgerPath) {
    throw new Error('--ledger is required.');
  }
  const body = fs.readFileSync(ledgerPath, 'utf8');
  const events = [];
  const warnings = [];
  for (const [index, line] of body.split(/\r?\n/).entries()) {
    if (!line.trim()) {
      continue;
    }
    try {
      events.push(JSON.parse(line));
    } catch (error) {
      warnings.push(`Invalid ledger line ${index + 1}: ${error.message}`);
    }
  }
  return { events, warnings };
}

function readManifest(manifestPath) {
  if (!manifestPath) {
    return null;
  }
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

function countBy(events, getter) {
  const counts = new Map();
  for (const event of events) {
    const key = getter(event) || 'unknown';
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function signalCount(events, signal) {
  return events.filter((event) => event.signals?.[signal]).length;
}

function isInteractionEvent(event) {
  return (event.evidenceRole || inferEvidenceRole(event)) === 'interaction';
}

function inferEvidenceRole(event) {
  if (event.sourceClass === 'repo-state') {
    return 'context';
  }
  if (event.sourceClass === 'prompt-context') {
    return 'context';
  }
  if (event.sourceClass === 'automation-log' && !['user-message', 'tool-call', 'tool-result', 'handoff'].includes(event.eventType)) {
    return 'context';
  }
  if (['user-message', 'tool-call', 'tool-result', 'handoff'].includes(event.eventType)) {
    return 'interaction';
  }
  return 'context';
}

function strongInteractionEvents(events) {
  return events.filter((event) => (
    isInteractionEvent(event)
    && event.relevance === 'confirmed'
    && event.confidence !== 'low'
    && ['exact', 'strong'].includes(event.repoAffinity || '')
  ));
}

function isEnvironmentBlocker(event) {
  if (!event.signals?.blocker) {
    return false;
  }
  const text = `${event.path || ''} ${event.excerpt || ''}`.toLowerCase();
  return [
    'createprocesswithlogonw',
    'sandbox',
    'codegraph not initialized',
    'tsc',
    'bun install',
    'dependency',
    'permission',
    'worktree',
    'missing',
    'not initialized',
  ].some((needle) => text.includes(needle));
}

function eventExcerptText(event) {
  return String(event.excerpt || '').toLowerCase();
}

function isParsedToolEvent(event) {
  return ['tool-call', 'tool-result'].includes(event.eventType || '');
}

function hasContextContinuityConcern(event) {
  const text = eventExcerptText(event);
  const contextTerms = ['context', 'handoff', 'resume', 'compact'];
  if (!contextTerms.some((needle) => text.includes(needle))) {
    return false;
  }
  if (event.signals?.blocker) {
    return true;
  }
  return [
    'lost context',
    'context drift',
    'stale context',
    'missing context',
    'unclear context',
    'handoff gap',
    'handoff missing',
    'resume failed',
    'resume issue',
    'context window',
    'ran out of context',
  ].some((needle) => text.includes(needle));
}

function hasRequirementAlignmentConcern(event) {
  const text = eventExcerptText(event);
  const requirementTerms = ['scope', 'acceptance', 'requirement'];
  if (!requirementTerms.some((needle) => text.includes(needle))) {
    return false;
  }
  if (event.signals?.blocker) {
    return true;
  }
  return [
    'unclear requirement',
    'missing requirement',
    'missing acceptance',
    'acceptance criteria missing',
    'scope drift',
    'scope creep',
    'late scope',
  ].some((needle) => text.includes(needle));
}

function isBottleneckLead(event) {
  return isEnvironmentBlocker(event)
    || Boolean(event.signals?.blocker)
    || hasContextContinuityConcern(event)
    || hasRequirementAlignmentConcern(event);
}

function healthVerdict(events) {
  const strong = strongInteractionEvents(events);
  const blockers = signalCount(strong, 'blocker');
  const validation = signalCount(strong, 'validation');
  const decisions = signalCount(strong, 'decision');
  const environmentBlockers = strong.filter(isEnvironmentBlocker).length;

  if (strong.length < 2) {
    return {
      label: 'under-evidenced',
      text: 'Confirmed interaction evidence is too thin to judge collaboration health strongly.',
    };
  }
  if (blockers > validation && blockers >= 2) {
    return {
      label: 'blocked',
      text: 'Confirmed interaction blockers dominate validation closure in the selected window.',
    };
  }
  if (environmentBlockers > 0 || blockers > 0 || validation === 0 || decisions === 0) {
    return {
      label: 'mixed',
      text: 'Progress evidence exists, but environment readiness, closure, decisions, or blockers need attention.',
    };
  }
  return {
    label: 'healthy',
    text: 'Recent confirmed interaction traces show decisions and validation without repeated blocker dominance.',
  };
}

function bottleneckCategory(event) {
  if (isEnvironmentBlocker(event)) {
    return 'environment readiness';
  }
  if (event.signals?.validation && event.signals?.blocker) {
    return 'validation closure';
  }
  if (isParsedToolEvent(event) && event.signals?.blocker) {
    return 'tool-call branch friction';
  }
  if (hasContextContinuityConcern(event)) {
    return 'context continuity';
  }
  if (hasRequirementAlignmentConcern(event)) {
    return 'requirement alignment';
  }
  if (event.signals?.blocker) {
    return 'execution blocker';
  }
  if (event.signals?.decision) {
    return 'decision capture';
  }
  if (event.signals?.handoff) {
    return 'handoff closure';
  }
  return 'evidence coverage';
}

function topBottlenecks(events) {
  const strong = strongInteractionEvents(events);
  const relevant = strong.filter(isBottleneckLead);
  const groups = new Map();
  for (const event of relevant) {
    const key = bottleneckCategory(event);
    const group = groups.get(key) || { key, count: 0, ids: [], relevance: new Set(), confidence: new Set() };
    group.count += 1;
    if (!group.ids.includes(event.id)) {
      group.ids.push(event.id);
    }
    group.relevance.add(event.relevance);
    group.confidence.add(event.confidence || 'unknown');
    groups.set(key, group);
  }

  if (groups.size === 0) {
    return [{
      key: 'evidence coverage',
      count: 0,
      ids: [],
      text: 'No repeated bottleneck pattern was evident from confirmed interaction traces; the main risk is insufficient trace coverage.',
    }];
  }

  return [...groups.values()]
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, 3)
    .map((group) => ({
      ...group,
      text: `${group.key} appears in ${group.count} high-relevance event(s).`,
    }));
}

function topInsights(events, bottlenecks, manifest) {
  const strong = strongInteractionEvents(events);
  const insights = [];
  const candidate = events.filter((event) => event.relevance === 'candidate');
  const validation = signalCount(strong, 'validation');
  const decisions = signalCount(strong, 'decision');
  const toolTrace = signalCount(strong, 'toolTrace');
  const userFriction = signalCount(strong, 'userFriction');
  const repeatedMistakes = signalCount(strong, 'repeatedMistake');
  const knowledgeCache = signalCount(events, 'knowledgeCache');
  const missingClaude = manifest?.hosts?.includes('claude-code')
    && !events.some((event) => event.host === 'claude-code' && isInteractionEvent(event));
  const repeatedBottleneck = bottlenecks.find((item) => item.count > 0 && item.key !== 'evidence coverage');

  if (strong.length < 2) {
    insights.push({
      tier: 'weak lead',
      title: 'Evidence is too thin for a strong collaboration pattern',
      text: 'Use this audit as an instrumentation read, not as proof of user or agent behavior.',
      evidence: [...strong, ...candidate].slice(0, 3).map((event) => event.id),
      confidence: 'low',
    });
  }

  if (repeatedBottleneck) {
    insights.push({
      tier: 'strong insight',
      title: `${repeatedBottleneck.key} is the clearest friction pattern`,
      text: `${repeatedBottleneck.count} confirmed interaction event(s) point to this pattern before any recommendation is selected.`,
      evidence: repeatedBottleneck.ids.slice(0, 5),
      confidence: repeatedBottleneck.count >= 2 ? 'high' : 'medium',
    });
  }

  if (userFriction > 0) {
    insights.push({
      tier: 'strong insight',
      title: 'User wording friction is visible in confirmed interaction traces',
      text: 'At least one confirmed interaction contains misunderstanding, ambiguity, or correction language that should be reviewed before changing prompts.',
      evidence: signalEvents(strong, 'userFriction', 5).map((event) => event.id),
      confidence: userFriction >= 2 ? 'high' : 'medium',
    });
  }

  if (repeatedMistakes > 0) {
    insights.push({
      tier: 'strong insight',
      title: 'Recurring agent mistakes should be converted into guardrails or SOP',
      text: 'Confirmed traces mention repeated mistakes, retries, or low-value lookup loops.',
      evidence: signalEvents(strong, 'repeatedMistake', 5).map((event) => event.id),
      confidence: repeatedMistakes >= 2 ? 'high' : 'medium',
    });
  }

  if (knowledgeCache > 0) {
    insights.push({
      tier: strong.length > 0 ? 'weak lead' : 'unknown',
      title: 'Some project knowledge may deserve a durable cache',
      text: 'The ledger contains cache, wiki, relearning, or repeated locating signals; verify them against confirmed interactions before writing durable memory.',
      evidence: signalEvents(events, 'knowledgeCache', 5).map((event) => event.id),
      confidence: signalCount(strong, 'knowledgeCache') > 0 ? 'medium' : 'low',
    });
  }

  if (strong.length > 0 && validation === 0) {
    insights.push({
      tier: 'strong insight',
      title: 'Validation closure is not visible in confirmed traces',
      text: 'Recent work may still be valid, but the trace does not give the user durable proof of closure.',
      evidence: strong.slice(0, 5).map((event) => event.id),
      confidence: strong.length >= 3 ? 'high' : 'medium',
    });
  }

  if (strong.length > 0 && toolTrace === 0) {
    insights.push({
      tier: 'weak lead',
      title: 'Tool-branch quality cannot be judged from the current ledger',
      text: 'The audit should not claim failed tool strategy without parsed tool-call or tool-result evidence.',
      evidence: strong.slice(0, 3).map((event) => event.id),
      confidence: 'low',
    });
  }

  if (strong.length >= 3 && decisions > 0 && validation > 0 && !repeatedBottleneck) {
    insights.push({
      tier: 'strong insight',
      title: 'The visible pattern is mostly healthy execution, not repeated friction',
      text: 'Confirmed traces show decision and validation signals without a repeated bottleneck lead.',
      evidence: strong.slice(0, 5).map((event) => event.id),
      confidence: 'medium',
    });
  }

  if (missingClaude) {
    insights.push({
      tier: 'unknown',
      title: 'Claude Code behavior is under-evidenced',
      text: 'The requested host is in scope, but no confirmed Claude Code interaction event was collected.',
      evidence: events.filter((event) => event.host === 'claude-code').slice(0, 3).map((event) => event.id),
      confidence: 'unknown',
    });
  }

  if (insights.length === 0) {
    insights.push({
      tier: 'unknown',
      title: 'No strong insight should be forced from this ledger',
      text: 'The correct output is a bounded evidence summary plus next instrumentation, not a padded narrative.',
      evidence: strong.slice(0, 3).map((event) => event.id),
      confidence: 'unknown',
    });
  }

  return dedupeInsights(insights).slice(0, 3);
}

function dedupeInsights(insights) {
  const seen = new Set();
  return insights.filter((insight) => {
    if (seen.has(insight.title)) {
      return false;
    }
    seen.add(insight.title);
    return true;
  });
}

function recommendations(events, bottlenecks, manifest) {
  const recs = [];
  const strong = strongInteractionEvents(events);
  const candidate = events.filter((event) => event.relevance === 'candidate').length;
  const validation = signalCount(strong, 'validation');
  const toolTrace = signalCount(strong, 'toolTrace');
  const blockers = signalCount(strong, 'blocker');
  const environmentBlockers = strong.filter(isEnvironmentBlocker);
  const userFriction = signalEvents(strong, 'userFriction', 3);
  const guidanceDrift = signalEvents(events, 'guidanceDrift', 3);
  const repeatedMistakes = signalEvents(strong, 'repeatedMistake', 3);
  const sopLessons = signalEvents(events, 'sopLesson', 3);
  const knowledgeCache = signalEvents(events, 'knowledgeCache', 3);
  const missingClaude = manifest?.hosts?.includes('claude-code')
    && !events.some((event) => event.host === 'claude-code' && isInteractionEvent(event));

  if (strong.length < 2 && candidate > 0) {
    recs.push({
      title: 'Make project identity explicit in handoffs and host traces',
      owner: 'native Host main Agent',
      evidence: events.filter((event) => event.relevance === 'candidate').slice(0, 3).map((event) => event.id),
    });
  }

  if (missingClaude) {
    recs.push({
      title: 'Locate or configure the Claude Code project trace root before judging Claude behavior',
      owner: 'agent-interaction-audit',
      evidence: events.filter((event) => event.host === 'claude-code').slice(0, 3).map((event) => event.id),
    });
  }

  if (environmentBlockers.length > 0) {
    recs.push({
      title: 'Treat environment readiness as a first-class audit category',
      owner: 'native Host main Agent or diagnose',
      evidence: environmentBlockers.slice(0, 3).map((event) => event.id),
    });
  }

  if (userFriction.length > 0) {
    recs.push({
      title: 'Add a request-friction review before changing project rules or Skills',
      owner: 'native Host main Agent or agent-interaction-audit',
      evidence: userFriction.map((event) => event.id),
    });
  }

  if (guidanceDrift.length > 0) {
    recs.push({
      title: 'Review stale or misleading project guidance before the next agent session',
      owner: 'native Host main Agent',
      evidence: guidanceDrift.map((event) => event.id),
    });
  }

  if (repeatedMistakes.length > 0) {
    recs.push({
      title: 'Convert repeated agent mistakes into a guardrail, eval case, or SOP note',
      owner: 'agent-interaction-audit',
      evidence: repeatedMistakes.map((event) => event.id),
    });
  }

  if (sopLessons.length > 0) {
    recs.push({
      title: 'Extract durable tool and script SOP from repeated command evidence',
      owner: 'native Host main Agent',
      evidence: sopLessons.map((event) => event.id),
    });
  }

  if (knowledgeCache.length > 0) {
    recs.push({
      title: 'Promote repeatedly rediscovered project facts into the project knowledge cache',
      owner: 'native Host main Agent under the OKF contract',
      evidence: knowledgeCache.map((event) => event.id),
    });
  }

  if (blockers > 0 && toolTrace > 0) {
    recs.push({
      title: 'Review failed tool-call branches before retrying the same action',
      owner: 'diagnose or agent-introspection-debugging',
      evidence: strong.filter((event) => event.signals?.blocker || event.signals?.toolTrace).slice(0, 3).map((event) => event.id),
    });
  }

  if (validation === 0 && strong.length > 0) {
    recs.push({
      title: 'Record validation gates in session handoffs before claiming progress',
      owner: 'verification or native Host main Agent',
      evidence: strong.slice(0, 3).map((event) => event.id),
    });
  }

  if (bottlenecks.some((item) => item.key === 'requirement alignment')) {
    recs.push({
      title: 'Force acceptance criteria alignment before implementation resumes',
      owner: 'native Host main Agent',
      evidence: bottlenecks.find((item) => item.key === 'requirement alignment')?.ids.slice(0, 3) || [],
    });
  }

  if (recs.length === 0) {
    recs.push({
      title: 'Keep the current project rules and rerun this audit after more trace evidence accumulates',
      owner: 'agent-interaction-audit',
      evidence: strong.slice(0, 3).map((event) => event.id),
    });
  }

  return dedupeRecommendations(recs).slice(0, 3);
}

function dedupeRecommendations(recs) {
  const seen = new Set();
  return recs.filter((rec) => {
    if (seen.has(rec.title)) {
      return false;
    }
    seen.add(rec.title);
    return true;
  });
}

function tableRows(rows) {
  if (rows.length === 0) {
    return '- None.\n';
  }
  return rows.map(([key, count]) => `- ${key}: ${count}`).join('\n') + '\n';
}

function resourceEvidence(events) {
  const toolCalls = events.filter((event) => event.eventType === 'tool-call').length;
  const groups = new Map();
  for (const event of events.filter((entry) => entry.resourceUsage)) {
    const key = `${event.host || 'unknown'}\0${event.path || event.id}`;
    const group = groups.get(key) || [];
    group.push(event);
    groups.set(key, group);
  }
  const callCount = [...groups.values()].reduce((total, group) => total + group.reduce((sum, event) => {
    const value = event.resourceUsage?.callCount;
    return sum + (typeof value === 'number' && Number.isFinite(value) ? value : 0);
  }, 0), 0);
  const sumMetricWhenComplete = (metric) => {
    if (callCount === 0) return 'unknown';
    let total = 0;
    for (const group of groups.values()) {
      const groupCallCount = group.reduce((sum, event) => {
        const value = event.resourceUsage?.callCount;
        return sum + (typeof value === 'number' && Number.isFinite(value) ? value : 0);
      }, 0);
      if (groupCallCount === 0) continue;
      const cumulative = group
        .filter((event) => event.resourceUsage?.mode === 'cumulative'
          && typeof event.resourceUsage?.[metric] === 'number'
          && Number.isFinite(event.resourceUsage[metric]))
        .sort((left, right) => String(left.ts).localeCompare(String(right.ts)))
        .at(-1);
      if (cumulative) {
        total += cumulative.resourceUsage[metric];
        continue;
      }
      const incremental = group.filter((event) => event.resourceUsage?.mode === 'incremental'
        && typeof event.resourceUsage?.[metric] === 'number'
        && Number.isFinite(event.resourceUsage[metric]));
      if (incremental.length < groupCallCount) return 'unknown';
      total += incremental.reduce((sum, event) => sum + event.resourceUsage[metric], 0);
    }
    return Number(total.toFixed(6));
  };
  return {
    toolCalls,
    agentOrCliCalls: callCount > 0 ? callCount : 'unknown',
    durationMs: sumMetricWhenComplete('durationMs'),
    inputTokens: sumMetricWhenComplete('inputTokens'),
    outputTokens: sumMetricWhenComplete('outputTokens'),
    costUsd: sumMetricWhenComplete('costUsd'),
  };
}

function hostCoverageRows(manifest, events) {
  if (!manifest?.roots) {
    return '- Manifest root coverage unavailable.\n';
  }
  const rows = manifest.roots.map((root) => {
    const count = events.filter((event) => event.host === root.host && event.sourceType === root.sourceType).length;
    const exists = root.exists ? 'exists' : 'missing';
    return `- ${root.host}/${root.sourceType}: ${exists}, events=${count}, root=${root.root}`;
  });
  return rows.join('\n') + '\n';
}

function taskClusters(events) {
  const groups = new Map();
  for (const event of events.filter(isInteractionEvent)) {
    const key = event.path || event.id;
    const group = groups.get(key) || {
      key,
      firstTs: event.ts,
      lastTs: event.ts,
      events: [],
      user: 0,
      tool: 0,
      blockers: 0,
      validation: 0,
      handoff: 0,
      confirmed: 0,
      high: 0,
    };
    group.events.push(event);
    group.firstTs = group.firstTs && group.firstTs < event.ts ? group.firstTs : event.ts;
    group.lastTs = group.lastTs && group.lastTs > event.ts ? group.lastTs : event.ts;
    if (event.eventType === 'user-message') {
      group.user += 1;
    }
    if (isParsedToolEvent(event)) {
      group.tool += 1;
    }
    if (event.signals?.blocker) {
      group.blockers += 1;
    }
    if (event.signals?.validation) {
      group.validation += 1;
    }
    if (event.signals?.handoff) {
      group.handoff += 1;
    }
    if (event.relevance === 'confirmed') {
      group.confirmed += 1;
    }
    if (event.confidence === 'high') {
      group.high += 1;
    }
    groups.set(key, group);
  }

  return [...groups.values()]
    .sort((a, b) => b.blockers - a.blockers || b.events.length - a.events.length || a.key.localeCompare(b.key))
    .slice(0, 8)
    .map((group) => ({
      ...group,
      title: taskTitle(group),
    }));
}

function taskTitle(group) {
  const userEvent = group.events.find((event) => event.eventType === 'user-message' && event.excerpt);
  if (userEvent) {
    return userEvent.excerpt.slice(0, 140);
  }
  return group.key;
}

function formatTaskClusters(clusters) {
  if (clusters.length === 0) {
    return '- No interaction task clusters found.\n';
  }
  return clusters.map((group) => {
    const confidence = group.high > 0 ? 'high' : group.confirmed > 0 ? 'medium' : 'low';
    return `- ${group.title}: events=${group.events.length}, user=${group.user}, tools=${group.tool}, blockers=${group.blockers}, validation=${group.validation}, handoff=${group.handoff}, confidence=${confidence}, source=${group.key}`;
  }).join('\n') + '\n';
}

function toolBranchRows(events) {
  const toolEvents = strongInteractionEvents(events).filter(isParsedToolEvent);
  const failed = toolEvents.filter((event) => event.signals?.blocker);
  const byTool = countBy(failed, (event) => toolName(event));
  const repeatedFailures = byTool.filter(([, count]) => count > 1);
  const rows = [
    `- Tool-call interaction events: ${toolEvents.length}.`,
    `- Failed or blocker-linked tool events: ${failed.length}.`,
    `- Environment-linked tool failures: ${failed.filter(isEnvironmentBlocker).length}.`,
  ];
  if (repeatedFailures.length > 0) {
    rows.push(`- Repeated failed tools: ${repeatedFailures.map(([name, count]) => `${name}=${count}`).join(', ')}.`);
  } else {
    rows.push('- Repeated failed tools: none detected from parsed interaction traces.');
  }
  return rows.join('\n') + '\n';
}

function toolName(event) {
  const text = String(event.excerpt || '').trim();
  const match = text.match(/^([A-Za-z0-9_.:-]+)/);
  return match?.[1] || event.eventType || 'unknown-tool';
}

function evidenceRank(event) {
  let score = 0;
  if (event.relevance === 'confirmed') score += 6;
  if (['exact', 'strong'].includes(event.repoAffinity || '')) score += 4;
  if ((event.evidenceRole || inferEvidenceRole(event)) === 'interaction') score += 3;
  if (event.confidence === 'high') score += 2;
  if (event.confidence === 'medium') score += 1;
  if (event.relevance === 'candidate') score -= 1;
  return score;
}

function signalEvents(events, signal, limit = 8) {
  return events
    .filter((event) => event.signals?.[signal])
    .sort((a, b) => evidenceRank(b) - evidenceRank(a) || String(a.ts || '').localeCompare(String(b.ts || '')))
    .slice(0, limit);
}

function signalCountRows(events) {
  return [...PRIMARY_SIGNALS, ...LEARNING_SIGNALS]
    .map((signal) => [signal, signalCount(events, signal)])
    .filter(([, count]) => count > 0);
}

function formatSignalEvidence(events, signal, emptyText) {
  const rows = signalEvents(events, signal);
  if (rows.length === 0) {
    return `- ${emptyText}\n`;
  }
  return rows.map((event) => {
    const role = event.evidenceRole || inferEvidenceRole(event);
    const meta = [
      event.relevance || 'unknown',
      event.confidence || 'unknown',
      event.repoAffinity || 'unknown',
      role,
      event.sourceClass || event.sourceType || 'unknown',
    ].join('/');
    return `- \`${event.id}\` [${meta}] ${event.path}: ${event.excerpt || '(no excerpt)'}`;
  }).join('\n') + '\n';
}

function formatLearningMap(events) {
  const rows = LEARNING_SIGNALS
    .map((signal) => ({ signal, count: signalCount(events, signal), ids: signalEvents(events, signal, 4).map((event) => event.id) }))
    .filter((row) => row.count > 0);
  if (rows.length === 0) {
    return '- No learning-oriented signals were detected.\n';
  }
  return rows.map((row) => `- ${row.signal}: ${row.count} event(s). Evidence: ${formatEvidenceIds(row.ids)}.`).join('\n') + '\n';
}

function buildImprovementQueue(events, manifest, warnings, outputDir = null, options = {}) {
  const itemConfigs = [
    {
      category: 'project-rule-candidate',
      signals: ['userFriction', 'guidanceDrift', 'promptContext', 'repeatedMistake', 'blocker', 'validation', 'decision'],
      requiredSignals: ['userFriction', 'guidanceDrift', 'repeatedMistake', 'blocker'],
      tags: ['misunderstanding', 'stale-guidance', 'validation-gap', 'repeated-tool-failure'],
      scope: 'project',
      targetDestination: 'project agent instructions or an existing atomic Skill',
      summary: 'Clarify project-specific agent instructions where traces or prompt context show misunderstanding or stale guidance.',
      suggestedChange: 'Review the cited evidence and add, narrow, or correct the project rule that would prevent the same interpretation error.',
      validationSignal: 'An agent-interaction-audit Eval fixture reproduces the phrase/pattern and selects the intended Skill, rule, or recommendation category.',
      expectedFutureCostReduction: 'high',
      risk: 'medium',
      patchDraft: {
        targetPath: 'AGENTS.md',
        kind: 'markdown-append',
        heading: 'Agent Interaction Audit Project Rule Candidate',
      },
      costRationale: {
        frequency: 'medium',
        timeLostPerOccurrence: 'medium',
        blastRadius: 'project',
        fixEffort: 'medium',
        verificationClarity: 'high',
      },
      counterEvidence: ['Project rules may already require some repeated checks; avoid removing required gates without policy evidence.'],
      rejectionReasons: ['required-by-project-policy', 'already-covered-by-existing-rule', 'high-risk-to-generalize'],
    },
    {
      category: 'stale-info-removal-candidate',
      signals: ['guidanceDrift'],
      requiredSignals: ['guidanceDrift'],
      tags: ['stale-guidance'],
      scope: 'project',
      targetDestination: 'stale project guidance, source records, or local task state',
      summary: 'Review stale, wrong, contradictory, or misleading guidance that may waste future agent time.',
      suggestedChange: 'Remove or correct the stale statement, then add a validation or search check proving the outdated reference is gone.',
      validationSignal: 'Repository search no longer finds the stale reference, and the nearest Skill or project-rule validation still passes.',
      expectedFutureCostReduction: 'medium',
      risk: 'low',
      confirmationPolicy: 'agent-actionable-after-review',
      costRationale: {
        frequency: 'medium',
        timeLostPerOccurrence: 'medium',
        blastRadius: 'project',
        fixEffort: 'low',
        verificationClarity: 'high',
      },
      counterEvidence: ['A stale-looking rule can be intentionally retained for backward compatibility or host portability.'],
      rejectionReasons: ['required-by-project-policy', 'too-little-evidence', 'not-worth-fixing'],
    },
    {
      category: 'sop-candidate',
      signals: ['sopLesson', 'encodingIssue', 'githubSop'],
      requiredSignals: ['sopLesson', 'encodingIssue', 'githubSop'],
      tags: ['script-sop', 'encoding', 'github-sop'],
      scope: 'project',
      targetDestination: 'project SOP, runbook, validation docs, or agent instructions',
      summary: 'Extract durable tool, script, encoding, GitHub, PR, or validation handling into a reusable SOP candidate.',
      suggestedChange: 'Write the smallest SOP note that names the command pattern, failure mode, and validation signal.',
      validationSignal: 'The native Host main Agent can follow the SOP without rediscovering the command or encoding/GitHub handling detail.',
      expectedFutureCostReduction: 'medium',
      risk: 'low',
      confirmationPolicy: 'agent-actionable-after-review',
      patchDraft: {
        targetPath: 'AGENTS.md',
        kind: 'markdown-append',
        heading: 'Agent Interaction Audit SOP Candidate',
      },
      costRationale: {
        frequency: 'medium',
        timeLostPerOccurrence: 'medium',
        blastRadius: 'project',
        fixEffort: 'low',
        verificationClarity: 'medium',
      },
      counterEvidence: ['Some command repetition is required by freshness, stale-read, or validation gates.'],
      rejectionReasons: ['required-by-project-policy', 'one-off-incident', 'already-covered-by-existing-rule'],
    },
    {
      category: 'knowledge-cache-candidate',
      signals: ['knowledgeCache'],
      requiredSignals: ['knowledgeCache'],
      tags: ['knowledge-rediscovery'],
      scope: 'project',
      targetDestination: 'project knowledge cache, wiki, or restart handoff',
      summary: 'Promote repeatedly rediscovered project facts, file locations, or accepted decisions into a durable knowledge-cache candidate.',
      suggestedChange: 'Record the fact only after confirming it is stable, source-backed, and useful across future sessions.',
      validationSignal: 'A later agent interaction audit shows fewer repeated lookup or relearning events for the same project fact.',
      expectedFutureCostReduction: 'medium',
      risk: 'medium',
      costRationale: {
        frequency: 'medium',
        timeLostPerOccurrence: 'medium',
        blastRadius: 'project',
        fixEffort: 'medium',
        verificationClarity: 'medium',
      },
      counterEvidence: ['The fact may be session-specific or already discoverable through nearby docs and code search.'],
      rejectionReasons: ['high-risk-to-generalize', 'already-covered-by-existing-rule', 'not-worth-fixing'],
    },
    {
      category: 'eval-case-candidate',
      signals: ['repeatedMistake', 'userFriction', 'toolTrace'],
      requiredSignals: ['repeatedMistake', 'userFriction'],
      tags: ['repeated-agent-mistake', 'misunderstanding'],
      scope: 'project',
      targetDestination: 'an existing Skill, project rule, Eval, SOP, OKF entry, or native Host instruction',
      summary: 'Convert repeated agent mistakes or misunderstood user phrasing into a deterministic eval or fixture candidate.',
      suggestedChange: 'Create the smallest fixture that fails before the fix and passes after the accepted Skill, project-rule, SOP, OKF, or native Host adjustment.',
      validationSignal: 'The new fixture fails on the old behavior and passes after the accepted change.',
      expectedFutureCostReduction: 'high',
      risk: 'low',
      costRationale: {
        frequency: 'medium',
        timeLostPerOccurrence: 'high',
        blastRadius: 'project',
        fixEffort: 'medium',
        verificationClarity: 'high',
      },
      counterEvidence: ['A single misunderstood session may not justify a durable eval without repeated or high-impact evidence.'],
      rejectionReasons: ['too-little-evidence', 'one-off-incident', 'not-worth-fixing'],
    },

  ];

  const items = itemConfigs
    .map((config) => buildQueueItem(events, config))
    .filter(Boolean)
    .sort(compareQueueItems);
  const configByCategory = new Map(itemConfigs.map((config) => [config.category, config]));

  const queue = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    repo: manifest?.repo || null,
    window: {
      since: manifest?.since || null,
      hosts: manifest?.hosts || [],
    },
    policy: {
      defaultMutation: 'none',
      artifact: 'private-local',
      authoritativeSource: 'agent-interaction-improvement-queue.json',
      reportRole: 'human-summary',
      historyMerge: 'not-in-v1',
      allowedStatuses: QUEUE_STATUSES,
      allowedCategories: QUEUE_CATEGORIES,
      rawExcerptPolicy: 'report-only',
      patchDraftPolicy: options.noPatchDrafts
        ? 'disabled-by-request'
        : 'optional-separate-artifact-never-auto-applied',
    },
    counts: {
      total: items.length,
      byCategory: Object.fromEntries(countBy(items, (item) => item.category)),
      byStatus: Object.fromEntries(countBy(items, (item) => item.status)),
      byPriority: Object.fromEntries(countBy(items, (item) => item.priority)),
      patchDrafts: 0,
    },
    warnings,
    items,
  };

  if (!options.noPatchDrafts) {
    attachPatchDraftArtifacts(queue, events, manifest, configByCategory, outputDir);
  }
  return queue;
}

function buildQueueItem(events, config) {
  const matched = uniqueEvents(config.signals.flatMap((signal) => signalEvents(events, signal, 16)));
  const requiredMatched = uniqueEvents(config.requiredSignals.flatMap((signal) => signalEvents(events, signal, 16)));
  if (matched.length === 0 || requiredMatched.length === 0) {
    return null;
  }

  const strong = strongInteractionEvents(matched);
  const confirmedContext = matched.filter((event) => (
    !isInteractionEvent(event)
    && event.relevance === 'confirmed'
    && event.confidence !== 'low'
  ));
  const supportingTrace = strong.length > 0 ? strong : strongInteractionEvents(events).slice(0, 3);
  const actionable = strong.length > 0 || (confirmedContext.length > 0 && supportingTrace.length > 0);
  const evidence = uniqueEvents([
    ...strong,
    ...requiredMatched,
    ...confirmedContext,
    ...supportingTrace,
  ]).slice(0, 8);
  if (evidence.length === 0) {
    return null;
  }

  const evidenceTier = evidenceTierFor(evidence, actionable);
  const status = actionable && evidenceTier !== 'weak' ? 'new' : 'needs-more-evidence';
  const actionability = status === 'new' ? 'actionable' : 'needs-more-evidence';
  const evidenceIds = evidence.map((event) => event.id);
  const sourceClasses = unique(evidence.map((event) => event.sourceClass || event.sourceType || 'unknown'));
  const targetDestination = config.targetDestination;
  const summary = config.summary;
  const priority = derivePriority(config.expectedFutureCostReduction, evidenceTier, config.risk, status);

  return {
    schemaVersion: 1,
    id: queueItemId(config.category, targetDestination, summary, evidenceIds),
    category: config.category,
    tags: config.tags,
    status,
    actionability,
    scope: config.scope,
    targetDestination,
    summary,
    suggestedChange: config.suggestedChange,
    executionLevel: 'level-2-actionable-candidate',
    patchDraftPath: null,
    evidenceIds,
    evidenceTier,
    sourceClasses,
    privacy: 'private-local',
    rawExcerptPolicy: 'report-only',
    confirmationPolicy: config.confirmationPolicy || 'needs-human-confirmation',
    costRationale: config.costRationale,
    expectedFutureCostReduction: config.expectedFutureCostReduction,
    risk: config.risk,
    priority,
    validationSignal: config.validationSignal,
    counterEvidence: config.counterEvidence || [],
    rejectionReasons: config.rejectionReasons || [],
  };
}

function attachPatchDraftArtifacts(queue, events, manifest, configByCategory, outputDir) {
  if (!outputDir) {
    return;
  }

  const draftDir = path.join(outputDir, 'patch-drafts');
  for (const item of queue.items) {
    const config = configByCategory.get(item.category);
    const artifact = buildPatchDraftArtifact(item, events, manifest, config?.patchDraft);
    if (!artifact) {
      continue;
    }

    fs.mkdirSync(draftDir, { recursive: true });
    const relativePath = toPosixPath(path.join('patch-drafts', `${item.id}.patch.md`));
    fs.writeFileSync(path.join(outputDir, relativePath), artifact, 'utf8');
    item.patchDraftPath = relativePath;
    queue.counts.patchDrafts += 1;
  }
}

function buildPatchDraftArtifact(item, events, manifest, patchDraft) {
  if (!isPatchDraftEligible(item, manifest, patchDraft)) {
    return null;
  }
  const repoRoot = path.resolve(manifest.repo);
  const targetPath = toPosixPath(patchDraft.targetPath);
  const targetAbs = safeResolveUnder(repoRoot, targetPath);
  if (!targetAbs || !fs.existsSync(targetAbs) || !fs.statSync(targetAbs).isFile()) {
    return null;
  }

  const targetText = fs.readFileSync(targetAbs, 'utf8');
  const evidenceEvents = item.evidenceIds
    .map((id) => events.find((event) => event.id === id))
    .filter(Boolean);
  const diff = buildMarkdownAppendDiff(targetPath, targetText, markdownPatchDraftLines(item, patchDraft, evidenceEvents));

  return [
    `# Agent Interaction Audit Patch Draft: ${item.id}`,
    '',
    'Status: draft-only; do not apply automatically.',
    `Target file: \`${targetPath}\``,
    `Queue category: \`${item.category}\``,
    `Evidence tier: \`${item.evidenceTier}\``,
    `Evidence IDs: ${formatEvidenceIds(item.evidenceIds)}`,
    `Counter-evidence: ${formatShortList(item.counterEvidence)}`,
    `Rejection reasons: ${formatShortList(item.rejectionReasons)}`,
    '',
    '```diff',
    diff.trimEnd(),
    '```',
    '',
  ].join('\n');
}

function formatShortList(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return 'none';
  }
  return values.map((value) => `\`${String(value)}\``).join(', ');
}

function isPatchDraftEligible(item, manifest, patchDraft) {
  return Boolean(
    patchDraft
    && patchDraft.kind === 'markdown-append'
    && manifest?.repo
    && item.status === 'new'
    && item.evidenceTier === 'strong'
    && PATCH_DRAFT_PRIORITIES.has(item.priority)
  );
}

function safeResolveUnder(root, relativePath) {
  const resolved = path.resolve(root, relativePath);
  const rootWithSep = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  return resolved === root || resolved.startsWith(rootWithSep) ? resolved : null;
}

function markdownPatchDraftLines(item, patchDraft, evidenceEvents) {
  const sourceClasses = unique(evidenceEvents.map((event) => event.sourceClass || event.sourceType || 'unknown'));
  return [
    '',
    `## ${patchDraft.heading}`,
    '',
    `- Candidate: \`${item.id}\``,
    `- Destination: ${item.targetDestination}`,
    `- Summary: ${item.summary}`,
    `- Suggested change: ${item.suggestedChange}`,
    `- Evidence IDs: ${formatEvidenceIds(item.evidenceIds)}`,
    `- Source classes: ${sourceClasses.join(', ') || item.sourceClasses.join(', ')}`,
    `- Validation signal: ${item.validationSignal}`,
    '',
  ];
}

function buildMarkdownAppendDiff(targetPath, targetText, additionLines) {
  const normalized = targetText.replace(/\r\n/g, '\n');
  const body = normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized;
  const lines = body.length > 0 ? body.split('\n') : [];
  const context = lines.slice(-3);
  const startLine = context.length > 0 ? Math.max(1, lines.length - context.length + 1) : 0;
  const oldRange = context.length > 0 ? `${startLine},${context.length}` : '0,0';
  const newStart = context.length > 0 ? startLine : 1;
  const newRange = `${newStart},${context.length + additionLines.length}`;
  return [
    `diff --git a/${targetPath} b/${targetPath}`,
    `--- a/${targetPath}`,
    `+++ b/${targetPath}`,
    `@@ -${oldRange} +${newRange} @@`,
    ...context.map((line) => ` ${line}`),
    ...additionLines.map((line) => `+${line}`),
    '',
  ].join('\n');
}

function toPosixPath(filePath) {
  return String(filePath).replaceAll(path.sep, '/');
}

function evidenceTierFor(events, actionable) {
  const strong = strongInteractionEvents(events).length;
  const confirmed = events.filter((event) => event.relevance === 'confirmed' && event.confidence !== 'low').length;
  if (strong >= 2 || (strong >= 1 && confirmed >= 2)) {
    return 'strong';
  }
  if (actionable && confirmed > 0) {
    return 'medium';
  }
  return 'weak';
}

function derivePriority(expectedFutureCostReduction, evidenceTier, risk, status) {
  if (status !== 'new') {
    return 'P2';
  }
  if (expectedFutureCostReduction === 'high' && evidenceTier === 'strong' && risk !== 'high') {
    return 'P0';
  }
  if (expectedFutureCostReduction !== 'low' && evidenceTier !== 'weak') {
    return 'P1';
  }
  return 'P2';
}

function compareQueueItems(first, second) {
  return COST_REDUCTION_SCORE[second.expectedFutureCostReduction] - COST_REDUCTION_SCORE[first.expectedFutureCostReduction]
    || QUEUE_PRIORITY_SCORE[second.priority] - QUEUE_PRIORITY_SCORE[first.priority]
    || EVIDENCE_TIER_SCORE[second.evidenceTier] - EVIDENCE_TIER_SCORE[first.evidenceTier]
    || RISK_SCORE[second.risk] - RISK_SCORE[first.risk]
    || first.category.localeCompare(second.category);
}

function queueItemId(category, targetDestination, summary, evidenceIds) {
  const basis = [
    category,
    normalizeForId(targetDestination),
    normalizeForId(summary),
    [...evidenceIds].sort().slice(0, 5).join(','),
  ].join('|');
  const hash = crypto.createHash('sha1').update(basis).digest('hex').slice(0, 10);
  const prefix = category.replace(/-candidate$/, '').replace(/[^a-z0-9]+/g, '-');
  return `iq-${prefix}-${hash}`;
}

function normalizeForId(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9\u4e00-\u9fff ]+/g, '')
    .trim();
}

function uniqueEvents(events) {
  const seen = new Set();
  const result = [];
  for (const event of events) {
    if (!event?.id || seen.has(event.id)) {
      continue;
    }
    seen.add(event.id);
    result.push(event);
  }
  return result;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function formatQueueSummary(queue) {
  if (!queue.items || queue.items.length === 0) {
    return '- No actionable improvement queue items were generated. Weak leads remain in the observation sections.\n';
  }
  return queue.items.map((item) => [
    `- \`${item.id}\` [${item.priority}/${item.status}/${item.evidenceTier}] ${item.category}: ${item.summary}`,
    `  - Target: ${item.targetDestination}`,
    `  - Expected future cost reduction: ${item.expectedFutureCostReduction}; risk=${item.risk}; confirmation=${item.confirmationPolicy}`,
    `  - Evidence: ${formatEvidenceIds(item.evidenceIds)}`,
    `  - Validation: ${item.validationSignal}`,
  ].join('\n')).join('\n') + '\n';
}

function formatEvidenceIds(ids) {
  return ids.length > 0 ? ids.map((id) => `\`${id}\``).join(', ') : 'no direct event IDs';
}

function formatPlainEvidenceIds(ids) {
  return ids.length > 0 ? ids.join(', ') : 'no direct event IDs';
}

function confidenceForCluster(group) {
  if (group.high > 0) {
    return 'high';
  }
  if (group.confirmed > 0) {
    return 'medium';
  }
  return 'low';
}

function objectRows(rows, dimension) {
  return rows.map(([value, count]) => ({ dimension, value, count }));
}

function statusForVerdict(label) {
  if (label === 'healthy') return 'ready';
  if (label === 'blocked') return 'blocked';
  if (label === 'under-evidenced') return 'review';
  return 'review';
}

function buildEffectiveInteractInput({
  events,
  manifest,
  warnings,
  verdict,
  strong,
  insights,
  bottlenecks,
  recs,
  clusters,
  sourceClassRows,
  confidenceRows,
  repoAffinityRows,
  evidenceRoleRows,
  eventTypeRows,
  signalRows,
  outPath,
}) {
  const confirmedCount = events.filter((event) => event.relevance === 'confirmed').length;
  const candidateCount = events.filter((event) => event.relevance === 'candidate').length;
  const traceAuditRows = [
    { metric: 'Strong confirmed interaction events', value: strong.length, note: 'Primary evidence tier for strong claims.' },
    { metric: 'Confirmed events', value: confirmedCount, note: 'Confirmed relevance, including context.' },
    { metric: 'Candidate events', value: candidateCount, note: 'Weak support or instrumentation leads only.' },
    { metric: 'Parsed tool-call/result events', value: events.filter(isParsedToolEvent).length, note: 'Used for tool branch judgment.' },
    { metric: 'Blocker or failure events', value: signalCount(events, 'blocker'), note: 'Broad signal; strong claims still require primary interaction evidence.' },
    { metric: 'Validation events', value: signalCount(events, 'validation'), note: 'Closure visibility.' },
    { metric: 'Decision events', value: signalCount(events, 'decision'), note: 'Decision capture visibility.' },
    { metric: 'Warnings', value: warnings.length, note: 'Collection/report limits.' },
  ];

  return {
    title: 'Agent Interaction Audit 交互审计可视化汇报',
    summary: `结论：${verdict.label}。${verdict.text}`,
    status: statusForVerdict(verdict.label),
    renderMode: 'pre-rendered',
    intent: {
      audience: 'Repository maintainer reviewing human-agent collaboration traces',
      primaryQuestion: '哪些交互模式、瓶颈和改进建议有证据支持？',
      decision: '先处理最高证据强度的改进项，不用薄弱证据硬编结论。',
      timeBudget: '2-5 minutes',
      artifactKind: 'status',
      successCriteria: [
        'Separate strong insights from weak leads and unknowns.',
        'Show evidence coverage before recommendations.',
        'Make bottlenecks, recommendations, and next actions scan-first.',
      ],
    },
    sections: [
      {
        type: 'data-table',
        title: '结论与证据强度',
        group: 'summary',
        status: statusForVerdict(verdict.label),
        summary: '先看 verdict、证据层级和报告边界。',
        columns: [
          { key: 'metric', label: '指标' },
          { key: 'value', label: '值' },
          { key: 'note', label: '含义' },
        ],
        rows: [
          { metric: 'Verdict', value: verdict.label, note: verdict.text },
          { metric: 'Total events', value: events.length, note: 'Collected ledger events.' },
          { metric: 'Strong interaction', value: strong.length, note: 'Can support strong insight when pattern repeats.' },
          { metric: 'Confirmed', value: confirmedCount, note: 'Project-related evidence.' },
          { metric: 'Candidate', value: candidateCount, note: 'Weak leads only.' },
          { metric: 'Warnings', value: warnings.length, note: 'Missing or degraded evidence limits.' },
        ],
      },
      {
        type: 'data-table',
        title: 'Top Insights',
        group: 'main',
        status: 'info',
        summary: '洞察按证据层级分级；薄弱证据只给弱线索。',
        columns: [
          { key: 'tier', label: '层级' },
          { key: 'title', label: '洞察' },
          { key: 'confidence', label: '置信度' },
          { key: 'evidence', label: '证据 ID' },
          { key: 'text', label: '解释' },
        ],
        rows: insights.map((item) => ({
          tier: item.tier,
          title: item.title,
          confidence: item.confidence,
          evidence: formatPlainEvidenceIds(item.evidence),
          text: item.text,
        })),
      },
      {
        type: 'data-table',
        title: 'Top Bottlenecks',
        group: 'main',
        status: bottlenecks.some((item) => item.count > 0) ? 'warn' : 'info',
        summary: '瓶颈只从主要交互证据中归纳。',
        columns: [
          { key: 'category', label: '瓶颈' },
          { key: 'count', label: '次数', align: 'right' },
          { key: 'evidence', label: '证据 ID' },
          { key: 'impact', label: '影响' },
        ],
        rows: bottlenecks.map((item) => ({
          category: item.key,
          count: item.count,
          evidence: formatPlainEvidenceIds(item.ids.slice(0, 5)),
          impact: item.text,
        })),
      },
      {
        type: 'data-table',
        title: 'Top Recommendations',
        group: 'decision',
        status: 'info',
        summary: '建议必须可执行，并能追溯到瓶颈或证据限制。',
        columns: [
          { key: 'recommendation', label: '建议' },
          { key: 'owner', label: '建议 owner' },
          { key: 'evidence', label: '证据 ID' },
        ],
        rows: recs.map((item) => ({
          recommendation: item.title,
          owner: item.owner,
          evidence: formatPlainEvidenceIds(item.evidence),
        })),
      },
      {
        type: 'data-table',
        title: 'Evidence Coverage',
        group: 'evidence',
        status: warnings.length > 0 ? 'warn' : 'info',
        summary: '来源、置信度、repo 关联和证据角色分布。',
        columns: [
          { key: 'dimension', label: '维度' },
          { key: 'value', label: '值' },
          { key: 'count', label: '数量', align: 'right' },
        ],
        rows: [
          ...objectRows(sourceClassRows, 'sourceClass'),
          ...objectRows(confidenceRows, 'confidence'),
          ...objectRows(repoAffinityRows, 'repoAffinity'),
          ...objectRows(evidenceRoleRows, 'evidenceRole'),
        ],
      },
      {
        type: 'data-table',
        title: 'Task Clusters',
        group: 'details',
        status: clusters.length > 0 ? 'info' : 'warn',
        summary: '把会话按 trace/source 聚合，避免只看全局计数。',
        columns: [
          { key: 'task', label: '任务/会话线索' },
          { key: 'events', label: '事件', align: 'right' },
          { key: 'tools', label: '工具', align: 'right' },
          { key: 'blockers', label: '阻塞', align: 'right' },
          { key: 'validation', label: '验证', align: 'right' },
          { key: 'confidence', label: '置信度' },
          { key: 'source', label: '来源' },
        ],
        rows: clusters.map((group) => ({
          task: group.title,
          events: group.events.length,
          tools: group.tool,
          blockers: group.blockers,
          validation: group.validation,
          confidence: confidenceForCluster(group),
          source: group.key,
        })),
      },
      {
        type: 'data-table',
        title: 'Trace Audit',
        group: 'details',
        status: 'info',
        summary: '工具、验证、决策和阻塞信号的可见性。',
        columns: [
          { key: 'metric', label: '指标' },
          { key: 'value', label: '值', align: 'right' },
          { key: 'note', label: '解释' },
        ],
        rows: traceAuditRows,
      },
      {
        type: 'data-table',
        title: 'Event Type And Signal Mix',
        group: 'details',
        status: 'info',
        summary: '用于判断这次审计是否偏向某类 trace。',
        columns: [
          { key: 'dimension', label: '维度' },
          { key: 'value', label: '值' },
          { key: 'count', label: '数量', align: 'right' },
        ],
        rows: [
          ...objectRows(eventTypeRows, 'eventType'),
          ...objectRows(signalRows, 'signal'),
        ],
      },
      {
        type: 'markdown',
        title: '证据边界',
        group: 'risks',
        status: warnings.length > 0 ? 'warn' : 'info',
        summary: '哪些结论不能从当前 ledger 里推出。',
        content: [
          '- 强洞察只能来自 confirmed、非 low-confidence、exact/strong repo affinity 的 interaction evidence。',
          '- Candidate、repo-state、low-confidence 或稀疏样本只支持 weak lead、unknown 或 next instrumentation。',
          '- 普通源码文件不是 interaction evidence；它只能解释背景，不能单独成为瓶颈。',
          '- 如果 host trace 根缺失或不可读，需要先修采集面，再判断该 host 的代理行为。',
          warnings.length > 0 ? `- 当前 warnings: ${warnings.join('; ')}` : '- 当前没有采集或报告 warning。',
        ].join('\n'),
      },
      {
        type: 'actions',
        title: '下一步',
        group: 'next',
        status: 'info',
        summary: '优先处理最高证据强度的改进项。',
        items: recs.map((item) => `${item.title} (${item.owner})`),
      },
    ],
    claims: [
      {
        id: 'claim-verdict',
        statement: `Agent interaction audit verdict is ${verdict.label}: ${verdict.text}`,
        kind: 'conclusion',
        evidenceIds: strong.slice(0, 5).map((event) => event.id),
        confidence: strong.length >= 2 ? 'medium' : 'low',
        knownLimits: warnings,
      },
      ...insights.map((item, index) => ({
        id: `claim-agent-interaction-audit-${index + 1}`,
        statement: item.title,
        kind: item.tier === 'unknown' ? 'assumption' : 'trend',
        evidenceIds: item.evidence,
        confidence: item.confidence,
      })),
    ],
    evidence: [
      {
        id: 'evidence-ledger',
        kind: 'file',
        label: 'Agent interaction event ledger',
        value: path.basename(outPath),
        status: 'info',
        knownLimits: ['Ledger location may be temporary or ignored by design.'],
      },
      {
        id: 'evidence-manifest',
        kind: 'file',
        label: 'Agent interaction audit manifest',
        value: manifest ? 'manifest provided' : 'manifest missing',
        status: manifest ? 'pass' : 'warn',
      },
    ],
    verification: [
      {
        label: 'Agent interaction audit Markdown report generated',
        status: 'pass',
        detail: outPath,
      },
      {
        label: 'Effective Interact input generated',
        status: 'pass',
        detail: 'Run create-interaction.mjs and validate-interaction.mjs before handoff.',
      },
    ],
    nextActions: recs.map((item) => `${item.title} (${item.owner})`),
  };
}

function formatEvidenceAppendix(events) {
  if (events.length === 0) {
    return '- No events collected.';
  }
  return events.slice(0, 24).map((event) => {
    const meta = [
      event.relevance || 'unknown',
      event.confidence || 'unknown',
      event.sourceClass || event.sourceType || 'unknown',
      event.host || 'unknown',
      event.eventType || 'file-evidence',
    ].join('/');
    return `- \`${event.id}\` [${meta}] ${event.path}: ${event.excerpt || '(no excerpt)'}`;
  }).join('\n');
}

export function buildAgentInteractionReport(options) {
  const ledger = readLedger(options.ledger);
  const manifest = readManifest(options.manifest);
  const events = ledger.events;
  const warnings = [...ledger.warnings, ...(manifest?.warnings || [])];
  const verdict = healthVerdict(events);
  const strong = strongInteractionEvents(events);
  const bottlenecks = topBottlenecks(events);
  const insights = topInsights(events, bottlenecks, manifest);
  const recs = recommendations(events, bottlenecks, manifest);
  const outPath = path.resolve(options.out || path.join(path.dirname(path.resolve(options.ledger)), 'agent-interaction-report.md'));
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const improvementQueue = buildImprovementQueue(events, manifest, warnings, path.dirname(outPath), {
    noPatchDrafts: Boolean(options.noPatchDrafts),
  });
  const improvementQueuePath = path.join(path.dirname(outPath), 'agent-interaction-improvement-queue.json');

  const hostRows = countBy(events, (event) => event.host);
  const relevanceRows = countBy(events, (event) => event.relevance);
  const sourceRows = countBy(events, (event) => event.sourceType);
  const sourceClassRows = countBy(events, (event) => event.sourceClass);
  const confidenceRows = countBy(events, (event) => event.confidence);
  const repoAffinityRows = countBy(events, (event) => event.repoAffinity);
  const eventTypeRows = countBy(events, (event) => event.eventType);
  const evidenceRoleRows = countBy(events, (event) => event.evidenceRole || inferEvidenceRole(event));
  const signalRows = signalCountRows(events);
  const clusters = taskClusters(events);
  const resources = resourceEvidence(events);

  const report = `# Agent Interaction Audit

Generated: ${new Date().toISOString()}
Repository: ${manifest?.repo || 'unknown'}
Window start: ${manifest?.since || 'unknown'}

## BLUF

Verdict: **${verdict.label}**. ${verdict.text}

Strong confirmed interaction events: ${strong.length}. Confirmed events: ${events.filter((event) => event.relevance === 'confirmed').length}. Candidate events: ${events.filter((event) => event.relevance === 'candidate').length}. Total events: ${events.length}.

## Evidence Coverage

By source class:

${tableRows(sourceClassRows)}
By confidence:

${tableRows(confidenceRows)}
By repo affinity:

${tableRows(repoAffinityRows)}
By evidence role:

${tableRows(evidenceRoleRows)}
Host roots:

${hostCoverageRows(manifest, events)}
## Resource Evidence

- Host-visible tool calls: ${resources.toolCalls}.
- Agent/CLI calls: ${resources.agentOrCliCalls}.
- Elapsed milliseconds: ${resources.durationMs}.
- Input tokens: ${resources.inputTokens}.
- Output tokens: ${resources.outputTokens}.
- Cost USD: ${resources.costUsd}.

Only explicit Host evidence is aggregated. Missing or incomplete evidence remains unknown; the audit never estimates usage or cost.

## Top Insights

${insights.map((item, index) => `${index + 1}. **${item.title}** (${item.tier}, confidence=${item.confidence}): ${item.text} Evidence: ${formatEvidenceIds(item.evidence)}.`).join('\n')}

## Top Bottlenecks

${bottlenecks.map((item, index) => `${index + 1}. **${item.key}**: ${item.text} Evidence: ${formatEvidenceIds(item.ids.slice(0, 5))}.`).join('\n')}

## Top Recommendations

${recs.map((item, index) => `${index + 1}. **${item.title}**. Suggested owner: ${item.owner}. Evidence: ${formatEvidenceIds(item.evidence)}.`).join('\n')}

## Improvement Queue Summary

Authoritative queue artifact: ${improvementQueuePath}

Queue policy: private local artifact, no automatic mutation, raw excerpts stay report-only.

${formatQueueSummary(improvementQueue)}
## Task Profile

By host:

${tableRows(hostRows)}
By relevance:

${tableRows(relevanceRows)}
By source type:

${tableRows(sourceRows)}
By event type:

${tableRows(eventTypeRows)}
By signal:

${tableRows(signalRows)}
Task clusters:

${formatTaskClusters(clusters)}
## Trace Audit

- Strong confirmed interaction events: ${strong.length}.
- Broad tool-trace signal events: ${signalCount(events, 'toolTrace')}.
- Parsed tool-call/result events: ${events.filter(isParsedToolEvent).length}.
- Blocker or failure events: ${signalCount(events, 'blocker')}.
- Environment blocker events from primary interaction evidence: ${strong.filter(isEnvironmentBlocker).length}.
- Environment blocker leads from context or weak evidence: ${Math.max(0, events.filter(isEnvironmentBlocker).length - strong.filter(isEnvironmentBlocker).length)}.
- Validation events: ${signalCount(events, 'validation')}.
- Decision events: ${signalCount(events, 'decision')}.
- Handoff events: ${signalCount(events, 'handoff')}.

${signalCount(strong, 'toolTrace') === 0 ? '- Tool-call traces are absent or not recognized in confirmed interaction evidence; avoid judging branch quality strongly.\n' : '- Confirmed tool-call traces exist; inspect blocker-linked events before changing project rules or Skills.\n'}
${signalCount(strong, 'validation') === 0 ? '- Validation closure is under-evidenced in confirmed interaction traces.\n' : '- Validation evidence exists in confirmed interaction traces.\n'}
Tool branch review:

${toolBranchRows(events)}
## Learning Opportunity Map

${formatLearningMap(events)}
## Prompt And Rule Audit

Prompt/rule context is background evidence. It can explain friction, stale instructions, and Skill-selection pressure, but it should not become a strong interaction conclusion without trace support.

${formatSignalEvidence(events, 'promptContext', 'No prompt or rule context evidence was collected.')}
## User Friction Patterns

Misunderstanding, ambiguity, correction, or wasted-time language should be reviewed as a request-shape signal before changing prompts, project rules, or Skills.

${formatSignalEvidence(events, 'userFriction', 'No user-friction signal was detected.')}
## Project Guidance Garbage And Drift

Use this section to find stale, wrong, contradictory, or misleading rules and docs that may waste agent time.

${formatSignalEvidence(events, 'guidanceDrift', 'No stale or misleading guidance signal was detected.')}
## SOP And Script Lessons

This section collects tool, script, encoding, GitHub, PR, and validation runbook hints that should become durable SOP only after evidence review.

SOP/script signals:

${formatSignalEvidence(events, 'sopLesson', 'No SOP or script-lesson signal was detected.')}
Encoding-specific signals:

${formatSignalEvidence(events, 'encodingIssue', 'No encoding-specific signal was detected.')}
GitHub-specific signals:

${formatSignalEvidence(events, 'githubSop', 'No GitHub-specific SOP signal was detected.')}
## Repeated Agent Mistakes

Repeated retries, low-value lookup patterns, and same-mistake evidence are candidates for changes to an existing Skill, project rule, Eval, SOP, or OKF entry.

${formatSignalEvidence(events, 'repeatedMistake', 'No repeated-mistake signal was detected.')}
## Knowledge Cache Candidates

Facts repeatedly rediscovered from scratch should become project OKF candidates only after the user or native Host main Agent accepts them.

${formatSignalEvidence(events, 'knowledgeCache', 'No knowledge-cache candidate signal was detected.')}
## Automation Trace Review

Automation and recurring task logs can reveal silent drift, stale schedules, or repeated background failures.

${formatSignalEvidence(events, 'automation', 'No automation signal was detected.')}
## Core Positioning

Project identity: ${manifest?.identity?.packageName || manifest?.identity?.basename || 'unknown'}.

Drift verdict: ${strong.length < 3 ? 'under-evidenced' : 'no strong drift claim from the generated ledger alone'}. Use repository strategy docs and confirmed decision traces before declaring that the project has moved away from its core purpose.

## Unknowns

- User preferences that are not explicit in the traces should be asked directly.
- Candidate-only evidence should not be treated as proof of user intent.
- Missing host roots or unreadable files may hide important work.
- Host coverage gaps above limit confidence for that host.

## Evidence Appendix

${formatEvidenceAppendix(events)}

## Warnings

${warnings.length > 0 ? warnings.map((warning) => `- ${warning}`).join('\n') : '- None.'}
`;

  fs.writeFileSync(outPath, report);
  fs.writeFileSync(improvementQueuePath, `${JSON.stringify(improvementQueue, null, 2)}\n`, 'utf8');
  let effectiveInteractInputPath = null;
  if (options.effectiveInteractInput) {
    effectiveInteractInputPath = path.resolve(options.effectiveInteractInput);
    fs.mkdirSync(path.dirname(effectiveInteractInputPath), { recursive: true });
    const input = buildEffectiveInteractInput({
      events,
      manifest,
      warnings,
      verdict,
      strong,
      insights,
      bottlenecks,
      recs,
      clusters,
      sourceClassRows,
      confidenceRows,
      repoAffinityRows,
      evidenceRoleRows,
      eventTypeRows,
      signalRows,
      outPath,
    });
    fs.writeFileSync(effectiveInteractInputPath, `${JSON.stringify(input, null, 2)}\n`, 'utf8');
  }
  return {
    ok: true,
    reportPath: outPath,
    improvementQueuePath,
    effectiveInteractInputPath,
    verdict: verdict.label,
    counts: {
      total: events.length,
      confirmed: events.filter((event) => event.relevance === 'confirmed').length,
      candidate: events.filter((event) => event.relevance === 'candidate').length,
      strongInteraction: strong.length,
      improvementQueueItems: improvementQueue.items.length,
      warnings: warnings.length,
    },
    resources,
  };
}

function printText(result) {
  console.log(`Agent interaction audit report: ${result.reportPath}`);
  console.log(`Improvement queue: ${result.improvementQueuePath}`);
  console.log(`Verdict: ${result.verdict}`);
  console.log(`Events: ${result.counts.total}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log(usage());
      process.exitCode = 0;
    } else {
      const result = buildAgentInteractionReport(options);
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        printText(result);
      }
    }
  } catch (error) {
    if (process.argv.includes('--json')) {
      console.log(JSON.stringify({ ok: false, error: error.message }, null, 2));
    } else {
      console.error(`build-agent-interaction-report: ${error.message}`);
    }
    process.exitCode = 1;
  }
}
