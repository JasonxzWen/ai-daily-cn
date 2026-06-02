#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const MOJIBAKE = new RegExp(['\\?{3,}', '\\u951f', '\\u9359', '\\u6d93', '\\u7ed7', '\\u7487', '\\uFFFD'].join('|'));
const READER_MARKER_GROUPS = [
  {
    code: 'reader-entry',
    label: 'one-minute answer, summary, or reading conclusion',
    markers: ['\u4e00\u5206\u949f', '\u9605\u8bfb\u7ed3\u8bba', '\u6458\u8981', 'TL;DR', 'One-minute', '60-second'],
  },
  {
    code: 'source-structure',
    label: 'source structure or taxonomy',
    markers: ['\u539f\u4ed3\u5e93\u5185\u5bb9\u6811', '\u5185\u5bb9\u6811', '\u6309\u539f\u6587\u7ed3\u6784', '\u539f\u6587\u7ed3\u6784', 'source structure', 'taxonomy'],
  },
  {
    code: 'project-iteration',
    label: 'local project iteration mapping',
    markers: ['\u672c\u5730\u5df2\u505a', '\u672c\u5730\u53d8\u66f4', '\u9879\u76ee\u8fed\u4ee3', '\u8fed\u4ee3\u5224\u65ad', 'Project iteration', 'local iteration'],
  },
  {
    code: 'reflection',
    label: 'effectiveness, redundancy, or next optimization reflection',
    markers: ['\u53cd\u601d', '\u6709\u6548', '\u5197\u4f59', '\u540e\u7eed\u89c2\u5bdf', '\u4e0b\u4e00\u6b65\u4f18\u5316', 'effective', 'redundant', 'next optimization'],
  },
];
const RAW_INTERNAL_MARKERS = [
  '<h2>Source Claims</h2>',
  '<h2>Viewpoint Extraction</h2>',
  '<h2>Project Mapping</h2>',
];
const EVIDENCE_LEAD_MARKERS = [
  '<h2>Source Claims</h2>',
  '<h2>Viewpoint Extraction</h2>',
  '<h2>Project Mapping</h2>',
  'source-ledger.json',
  'sourceClaims',
  'source-ledger',
];

function usage() {
  return `Usage: node skills/source-to-insight-blog/scripts/validate-source-blog.mjs <post-dir> [--json]\n\nValidates a source-backed insight blog post directory for reader-first shape, source coverage, and UTF-8 hygiene.`;
}

function firstMarkerIndex(text, markers) {
  const indexes = markers.map((marker) => text.indexOf(marker)).filter((index) => index >= 0);
  return indexes.length > 0 ? Math.min(...indexes) : -1;
}

function readJsonFile(filePath) {
  try {
    return { ok: true, value: JSON.parse(fs.readFileSync(filePath, 'utf8')) };
  } catch (error) {
    return { ok: false, error };
  }
}

function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function collectSources(post, ledger) {
  if (Array.isArray(post?.sources) && post.sources.length > 0) {
    return post.sources;
  }

  if (Array.isArray(ledger?.sources) && ledger.sources.length > 0) {
    return ledger.sources;
  }

  if (Array.isArray(ledger?.references) && ledger.references.length > 0) {
    return ledger.references;
  }

  return [];
}

function checkPost(postDir) {
  const htmlPath = path.join(postDir, 'index.html');
  const effectiveInteractPath = path.join(postDir, 'effective-interact-summary.html');
  const effectiveInteractInputPath = path.join(postDir, 'effective-interact.input.json');
  const ledgerPath = path.join(postDir, 'source-ledger.json');
  const postJsonPath = path.join(postDir, 'post.json');
  const checks = [];
  let post = null;
  let ledger = null;

  function push(code, state, reason, evidence = []) {
    checks.push({ code, state, reason, evidence });
  }

  if (!fs.existsSync(htmlPath)) {
    push('html-file', 'fail', 'index.html is missing.');
    return checks;
  }

  const html = fs.readFileSync(htmlPath, 'utf8');
  push('utf8', MOJIBAKE.test(html) ? 'fail' : 'pass', MOJIBAKE.test(html) ? 'HTML contains likely mojibake.' : 'HTML has no common mojibake markers.');

  for (const group of READER_MARKER_GROUPS) {
    const found = group.markers.filter((marker) => html.includes(marker));
    push(group.code, found.length > 0 ? 'pass' : 'fail', found.length > 0 ? `Found ${group.label}.` : `Missing ${group.label}.`, found.length > 0 ? found : group.markers);
  }

  const readerStart = firstMarkerIndex(html, READER_MARKER_GROUPS.flatMap((group) => group.markers));
  const evidenceStart = firstMarkerIndex(html, EVIDENCE_LEAD_MARKERS);
  const readerFirst = evidenceStart < 0 || (readerStart >= 0 && readerStart <= evidenceStart);
  push(
    'reader-before-evidence',
    readerFirst ? 'pass' : 'fail',
    readerFirst ? 'Reader-facing article layer appears before evidence ledger or internal source records.' : 'Evidence ledger or internal source records appear before the reader-facing article layer.',
    readerFirst ? [] : ['evidence marker appears before reader marker'],
  );

  const forbidden = RAW_INTERNAL_MARKERS.filter((marker) => html.includes(marker));
  push('raw-internal-shape', forbidden.length === 0 ? 'pass' : 'fail', forbidden.length === 0 ? 'Blog does not expose raw source-claim internals as the main shape.' : `Raw internal markers found: ${forbidden.join(', ')}.`, forbidden);

  const imageCount = (html.match(/<img\b/gi) || []).length;
  push('media-visible', imageCount > 0 ? 'pass' : 'warn', imageCount > 0 ? `${imageCount} image references are visible in the public post.` : 'No visible image references found; acceptable when the source has no relevant media.');

  const hasEffectiveInteract = fs.existsSync(effectiveInteractPath) || fs.existsSync(effectiveInteractInputPath) || html.includes('Effective Interact');
  push('effective-interact-artifact', hasEffectiveInteract ? 'pass' : 'warn', hasEffectiveInteract ? 'Effective-interact layer or input is present.' : 'No effective-interact artifact found; acceptable when it would not improve the reader flow.');

  if (!fs.existsSync(postJsonPath)) {
    push('post-json', 'fail', 'post.json is missing.');
  } else {
    const postText = fs.readFileSync(postJsonPath, 'utf8');
    const parsedPost = readJsonFile(postJsonPath);
    if (!parsedPost.ok) {
      push('post-json', 'fail', `post.json is not valid JSON: ${parsedPost.error.message}`);
    } else {
      post = parsedPost.value;
      push('post-json', 'pass', 'post.json is valid JSON.');
      push('post-json-utf8', MOJIBAKE.test(postText) ? 'fail' : 'pass', MOJIBAKE.test(postText) ? 'post.json contains likely mojibake.' : 'post.json has no common mojibake markers.');
    }
  }

  if (!fs.existsSync(ledgerPath)) {
    push('source-ledger', 'fail', 'source-ledger.json is missing.');
  } else {
    const ledgerText = fs.readFileSync(ledgerPath, 'utf8');
    const parsedLedger = readJsonFile(ledgerPath);
    if (!parsedLedger.ok) {
      push('source-ledger', 'fail', `source-ledger.json is not valid JSON: ${parsedLedger.error.message}`);
    } else {
      ledger = parsedLedger.value;
      push('source-ledger', 'pass', 'source-ledger.json is valid JSON.');
      push('source-ledger-utf8', MOJIBAKE.test(ledgerText) ? 'fail' : 'pass', MOJIBAKE.test(ledgerText) ? 'source-ledger.json contains likely mojibake.' : 'source-ledger.json has no common mojibake markers.');
      const media = Array.isArray(ledger.media) ? ledger.media : [];
      push('ledger-media', media.length > 0 ? 'pass' : 'warn', media.length > 0 ? `${media.length} media entries recorded.` : 'Source ledger has no media entries; acceptable when the source has no relevant media.');
    }
  }

  const sources = collectSources(post, ledger);
  push('source-coverage', sources.length > 0 ? 'pass' : 'fail', sources.length > 0 ? `${sources.length} source entries recorded.` : 'No source entries recorded in post.json or source-ledger.json.');

  const invalidLinks = sources.filter((source) => typeof source.url !== 'string' || !/^https?:\/\//.test(source.url));
  push('source-links', invalidLinks.length === 0 ? 'pass' : 'fail', invalidLinks.length === 0 ? 'All source links use http or https.' : `${invalidLinks.length} source links are missing or unsafe.`, invalidLinks.map((source) => source.id || source.title || '<unknown>'));

  const oversizedExcerpts = sources.filter((source) => typeof source.excerpt === 'string' && wordCount(source.excerpt) > 220);
  push('source-excerpts', oversizedExcerpts.length === 0 ? 'pass' : 'fail', oversizedExcerpts.length === 0 ? 'Source excerpts stay within the 220-word copyright boundary.' : `${oversizedExcerpts.length} source excerpts exceed 220 words.`, oversizedExcerpts.map((source) => source.id || source.title || '<unknown>'));

  return checks;
}

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(usage());
  process.exit(0);
}

const json = args.includes('--json');
const postDirArg = args.find((arg) => !arg.startsWith('-'));
if (!postDirArg) {
  console.error(usage());
  process.exit(2);
}

const postDir = path.resolve(postDirArg);
const checks = checkPost(postDir);
const failures = checks.filter((check) => check.state === 'fail');
const warnings = checks.filter((check) => check.state === 'warn');
const result = {
  schemaVersion: 1,
  postDir,
  exitCode: failures.length > 0 ? 3 : 0,
  checks,
  reason: failures.length > 0 ? `${failures.length} source blog checks failed.` : warnings.length > 0 ? `Source blog validation passed with ${warnings.length} warnings.` : 'Source blog validation passed.',
};

if (json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(result.reason);
  for (const check of checks) {
    console.log(`${check.state.toUpperCase()} ${check.code}: ${check.reason}`);
  }
}

process.exitCode = result.exitCode;
