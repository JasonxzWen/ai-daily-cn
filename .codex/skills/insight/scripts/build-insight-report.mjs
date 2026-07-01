#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function usage() {
  return `Usage: node skills/insight/scripts/build-insight-report.mjs --ledger <events.jsonl> [--manifest <manifest.json>] [--out <report.md>] [--effective-interact-input <input.json>] [--json]

Builds a private Markdown report from an insight event ledger.
Optionally writes an effective-interact JSON input for a visual HTML handoff.`;
}

function parseArgs(argv) {
  const options = {
    ledger: null,
    manifest: null,
    out: null,
    effectiveInteractInput: null,
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
  const missingClaude = manifest?.hosts?.includes('claude-code')
    && !events.some((event) => event.host === 'claude-code' && isInteractionEvent(event));

  if (strong.length < 2 && candidate > 0) {
    recs.push({
      title: 'Make project identity explicit in handoffs and host traces',
      owner: 'delivery-workflow or the target repo workflow',
      evidence: events.filter((event) => event.relevance === 'candidate').slice(0, 3).map((event) => event.id),
    });
  }

  if (missingClaude) {
    recs.push({
      title: 'Locate or configure the Claude Code project trace root before judging Claude behavior',
      owner: 'insight',
      evidence: events.filter((event) => event.host === 'claude-code').slice(0, 3).map((event) => event.id),
    });
  }

  if (environmentBlockers.length > 0) {
    recs.push({
      title: 'Treat environment readiness as a first-class audit category',
      owner: 'diagnosis-workflow or hub-maintenance-workflow',
      evidence: environmentBlockers.slice(0, 3).map((event) => event.id),
    });
  }

  if (blockers > 0 && toolTrace > 0) {
    recs.push({
      title: 'Review failed tool-call branches before retrying the same action',
      owner: 'diagnosis-workflow or agent-introspection-debugging',
      evidence: strong.filter((event) => event.signals?.blocker || event.signals?.toolTrace).slice(0, 3).map((event) => event.id),
    });
  }

  if (validation === 0 && strong.length > 0) {
    recs.push({
      title: 'Record validation gates in session handoffs before claiming progress',
      owner: 'verification-loop or delivery-workflow',
      evidence: strong.slice(0, 3).map((event) => event.id),
    });
  }

  if (bottlenecks.some((item) => item.key === 'requirement alignment')) {
    recs.push({
      title: 'Force acceptance criteria alignment before implementation resumes',
      owner: 'sdd-workflow',
      evidence: bottlenecks.find((item) => item.key === 'requirement alignment')?.ids.slice(0, 3) || [],
    });
  }

  if (recs.length === 0) {
    recs.push({
      title: 'Keep the current workflow and rerun this audit after more trace evidence accumulates',
      owner: 'insight',
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
    title: 'Insight 交互审计可视化汇报',
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
        statement: `Insight verdict is ${verdict.label}: ${verdict.text}`,
        kind: 'conclusion',
        evidenceIds: strong.slice(0, 5).map((event) => event.id),
        confidence: strong.length >= 2 ? 'medium' : 'low',
        knownLimits: warnings,
      },
      ...insights.map((item, index) => ({
        id: `claim-insight-${index + 1}`,
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
        label: 'Insight event ledger',
        value: path.basename(outPath),
        status: 'info',
        knownLimits: ['Ledger location may be temporary or ignored by design.'],
      },
      {
        id: 'evidence-manifest',
        kind: 'file',
        label: 'Insight manifest',
        value: manifest ? 'manifest provided' : 'manifest missing',
        status: manifest ? 'pass' : 'warn',
      },
    ],
    verification: [
      {
        label: 'Insight Markdown report generated',
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

export function buildInsightReport(options) {
  const ledger = readLedger(options.ledger);
  const manifest = readManifest(options.manifest);
  const events = ledger.events;
  const warnings = [...ledger.warnings, ...(manifest?.warnings || [])];
  const verdict = healthVerdict(events);
  const strong = strongInteractionEvents(events);
  const bottlenecks = topBottlenecks(events);
  const insights = topInsights(events, bottlenecks, manifest);
  const recs = recommendations(events, bottlenecks, manifest);
  const outPath = path.resolve(options.out || path.join(path.dirname(path.resolve(options.ledger)), 'insight-report.md'));
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const hostRows = countBy(events, (event) => event.host);
  const relevanceRows = countBy(events, (event) => event.relevance);
  const sourceRows = countBy(events, (event) => event.sourceType);
  const sourceClassRows = countBy(events, (event) => event.sourceClass);
  const confidenceRows = countBy(events, (event) => event.confidence);
  const repoAffinityRows = countBy(events, (event) => event.repoAffinity);
  const eventTypeRows = countBy(events, (event) => event.eventType);
  const evidenceRoleRows = countBy(events, (event) => event.evidenceRole || inferEvidenceRole(event));
  const signalRows = ['userRequest', 'toolTrace', 'validation', 'blocker', 'decision', 'handoff']
    .map((signal) => [signal, signalCount(events, signal)])
    .filter(([, count]) => count > 0);
  const clusters = taskClusters(events);

  const report = `# Insight Interaction Audit

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
## Top Insights

${insights.map((item, index) => `${index + 1}. **${item.title}** (${item.tier}, confidence=${item.confidence}): ${item.text} Evidence: ${formatEvidenceIds(item.evidence)}.`).join('\n')}

## Top Bottlenecks

${bottlenecks.map((item, index) => `${index + 1}. **${item.key}**: ${item.text} Evidence: ${formatEvidenceIds(item.ids.slice(0, 5))}.`).join('\n')}

## Top Recommendations

${recs.map((item, index) => `${index + 1}. **${item.title}**. Suggested owner: ${item.owner}. Evidence: ${formatEvidenceIds(item.evidence)}.`).join('\n')}

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

${signalCount(strong, 'toolTrace') === 0 ? '- Tool-call traces are absent or not recognized in confirmed interaction evidence; avoid judging branch quality strongly.\n' : '- Confirmed tool-call traces exist; inspect blocker-linked events before changing workflow rules.\n'}
${signalCount(strong, 'validation') === 0 ? '- Validation closure is under-evidenced in confirmed interaction traces.\n' : '- Validation evidence exists in confirmed interaction traces.\n'}
Tool branch review:

${toolBranchRows(events)}
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
    effectiveInteractInputPath,
    verdict: verdict.label,
    counts: {
      total: events.length,
      confirmed: events.filter((event) => event.relevance === 'confirmed').length,
      candidate: events.filter((event) => event.relevance === 'candidate').length,
      strongInteraction: strong.length,
      warnings: warnings.length,
    },
  };
}

function printText(result) {
  console.log(`Insight report: ${result.reportPath}`);
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
      const result = buildInsightReport(options);
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
      console.error(`build-insight-report: ${error.message}`);
    }
    process.exitCode = 1;
  }
}
