#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function usage() {
  return `Usage: node skills/insight/scripts/build-insight-report.mjs --ledger <events.jsonl> [--manifest <manifest.json>] [--out <report.md>] [--json]

Builds a private Markdown report from an insight event ledger.`;
}

function parseArgs(argv) {
  const options = {
    ledger: null,
    manifest: null,
    out: null,
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
  return {
    ok: true,
    reportPath: outPath,
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
