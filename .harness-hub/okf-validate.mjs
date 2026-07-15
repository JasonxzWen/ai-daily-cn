#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function validateOkf(options) {
  const targetDir = requireDirectory(options.targetDir, 'target');
  const knowledgeRoot = resolveInside(targetDir, options.knowledgeRoot || 'knowledge', 'knowledge root');
  const findings = [];
  const markdownFiles = [];
  const otherFiles = [];
  walkKnowledge(knowledgeRoot, knowledgeRoot, markdownFiles, otherFiles, findings);
  for (const relativePath of otherFiles) {
    findings.push(finding('unsupported-file', relativePath, 'OKF knowledge may contain only UTF-8 Markdown files.'));
  }

  const documents = new Map();
  for (const relativePath of markdownFiles) {
    const filePath = path.join(knowledgeRoot, relativePath);
    let content;
    try {
      content = new TextDecoder('utf-8', { fatal: true }).decode(fs.readFileSync(filePath));
    } catch {
      findings.push(finding('invalid-utf8', relativePath, 'File is not valid UTF-8.'));
      continue;
    }
    const frontmatter = parseFrontmatter(content, relativePath, findings);
    const links = parseMarkdownLinks(content);
    documents.set(relativePath, { relativePath, filePath, content, frontmatter, links });
  }

  const rootIndex = documents.get('index.md');
  const rootLog = documents.get('log.md');
  if (!rootIndex) {
    findings.push(finding('missing-root-index', 'index.md', 'Root knowledge/index.md is required.'));
  }
  if (!rootLog) {
    findings.push(finding('missing-root-log', 'log.md', 'Root knowledge/log.md is required.'));
  }
  if (rootIndex && rootIndex.frontmatter?.okf_version !== '0.1') {
    findings.push(finding('invalid-okf-version', 'index.md', 'Root index frontmatter must declare okf_version: "0.1".'));
  }
  if (rootLog && !/^##\s+\d{4}-\d{2}-\d{2}\b/m.test(rootLog.content)) {
    findings.push(finding('missing-update-record', 'log.md', 'Root log.md must contain at least one dated H2 update record.'));
  }

  const conceptPaths = markdownFiles.filter((relativePath) => {
    const basename = path.posix.basename(relativePath.replaceAll('\\', '/')).toLowerCase();
    return basename !== 'index.md' && basename !== 'log.md';
  });
  const conceptsByBody = new Map();
  for (const conceptPath of conceptPaths) {
    const body = normalizeKnowledgeBody(documents.get(conceptPath)?.content || '');
    if (!body) continue;
    const duplicates = conceptsByBody.get(body) || [];
    duplicates.push(conceptPath);
    conceptsByBody.set(body, duplicates);
  }
  for (const duplicatePaths of conceptsByBody.values()) {
    if (duplicatePaths.length < 2) continue;
    for (const duplicatePath of duplicatePaths) {
      findings.push(finding(
        'duplicate-concept-content',
        duplicatePath,
        `Concept content duplicates ${duplicatePaths.filter((item) => item !== duplicatePath).join(', ')}; keep one canonical owner page.`,
      ));
    }
  }
  const sourcePaths = new Set();
  const indexTargets = new Set();
  let linkCount = 0;
  for (const document of documents.values()) {
    const resolvedLinks = [];
    for (const link of document.links) {
      const resolved = resolveLocalLink(targetDir, document.filePath, link.target);
      if (!resolved) {
        continue;
      }
      linkCount += 1;
      if (!isWithin(targetDir, resolved)) {
        findings.push(finding('link-escapes-target', document.relativePath, `Link '${link.target}' escapes the target repository.`));
        continue;
      }
      if (hasLinkedAncestor(targetDir, resolved) || !realPathIsWithin(targetDir, resolved)) {
        findings.push(finding('link-escapes-target', document.relativePath, `Link '${link.target}' escapes through a symbolic link or junction.`));
        continue;
      }
      const stat = fs.statSync(resolved, { throwIfNoEntry: false });
      if (!stat?.isFile()) {
        findings.push(finding('broken-link', document.relativePath, `Link '${link.target}' does not resolve to a file.`));
        continue;
      }
      resolvedLinks.push({ ...link, resolved });
      if (document.relativePath === 'index.md' && isWithin(knowledgeRoot, resolved)) {
        indexTargets.add(portable(path.relative(knowledgeRoot, resolved)));
      }
    }

    if (conceptPaths.includes(document.relativePath)) {
      const sourceSection = extractSourcesSection(document.content);
      if (sourceSection === null) {
        findings.push(finding('missing-source-section', document.relativePath, 'Concept must contain a ## Sources section.'));
      } else {
        const sourceLinks = parseMarkdownLinks(sourceSection)
          .map((link) => ({ link, resolved: resolveLocalLink(targetDir, document.filePath, link.target) }))
          .filter((entry) => entry.resolved && isWithin(targetDir, entry.resolved) && !isWithin(knowledgeRoot, entry.resolved))
          .filter((entry) => !hasLinkedAncestor(targetDir, entry.resolved) && realPathIsWithin(targetDir, entry.resolved))
          .filter((entry) => fs.statSync(entry.resolved, { throwIfNoEntry: false })?.isFile());
        if (sourceLinks.length === 0) {
          findings.push(finding('missing-source', document.relativePath, 'Concept Sources must cite at least one existing target-repository file outside knowledge/.'));
        }
        for (const source of sourceLinks) {
          sourcePaths.add(portable(path.relative(targetDir, source.resolved)));
        }
      }
    }
  }

  for (const conceptPath of conceptPaths) {
    if (!indexTargets.has(conceptPath)) {
      findings.push(finding('unindexed-concept', conceptPath, 'Every concept must be linked from the root index.md.'));
    }
  }

  if (options.forbidTree) {
    const forbiddenRoot = requireDirectory(options.forbidTree, 'forbidden tree');
    const forbiddenHashes = collectFileHashes(forbiddenRoot);
    const forbiddenSegments = collectKnowledgeSegments(forbiddenRoot);
    for (const relativePath of markdownFiles) {
      const targetPath = path.join(knowledgeRoot, relativePath);
      const digest = hashFile(targetPath);
      if (forbiddenHashes.has(digest)) {
        findings.push(finding('forbidden-tree-copy', relativePath, 'Knowledge file is byte-identical to forbidden source-project content.'));
        continue;
      }
      const targetBody = normalizeKnowledgeBody(fs.readFileSync(targetPath, 'utf8'));
      if ([...forbiddenSegments].some((segment) => targetBody.includes(segment))) {
        findings.push(finding('forbidden-tree-copy', relativePath, 'Knowledge file reuses source-project internal body content.'));
      }
    }
  }

  const dedupedFindings = dedupeFindings(findings);
  return {
    schemaVersion: 1,
    ok: dedupedFindings.length === 0,
    status: dedupedFindings.length === 0 ? 'pass' : 'blocked',
    targetDir,
    knowledgeRoot,
    fileCount: markdownFiles.length,
    conceptCount: conceptPaths.length,
    linkCount,
    sourceCount: sourcePaths.size,
    sources: [...sourcePaths].sort(),
    findings: dedupedFindings,
  };
}

function walkKnowledge(root, current, markdownFiles, otherFiles, findings) {
  const rootStat = fs.lstatSync(current, { throwIfNoEntry: false });
  if (!rootStat) {
    findings.push(finding('missing-knowledge-root', portable(path.relative(root, current)) || '.', 'Knowledge root does not exist.'));
    return;
  }
  if (rootStat.isSymbolicLink()) {
    findings.push(finding('symlink-not-allowed', portable(path.relative(root, current)) || '.', 'Symlinks are not allowed inside OKF knowledge.'));
    return;
  }
  if (!rootStat.isDirectory()) {
    findings.push(finding('invalid-knowledge-root', '.', 'Knowledge root must be a directory.'));
    return;
  }
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const filePath = path.join(current, entry.name);
    const relativePath = portable(path.relative(root, filePath));
    const stat = fs.lstatSync(filePath);
    if (stat.isSymbolicLink()) {
      findings.push(finding('symlink-not-allowed', relativePath, 'Symlinks are not allowed inside OKF knowledge.'));
    } else if (stat.isDirectory()) {
      walkKnowledge(root, filePath, markdownFiles, otherFiles, findings);
    } else if (stat.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      markdownFiles.push(relativePath);
    } else if (stat.isFile()) {
      otherFiles.push(relativePath);
    }
  }
  markdownFiles.sort();
  otherFiles.sort();
}

function parseFrontmatter(content, relativePath, findings) {
  const normalized = content.replace(/^\uFEFF/, '').replaceAll('\r\n', '\n');
  if (!normalized.startsWith('---\n')) {
    findings.push(finding('missing-frontmatter', relativePath, 'Markdown file must start with YAML frontmatter.'));
    return null;
  }
  const closing = normalized.indexOf('\n---\n', 4);
  if (closing < 0) {
    findings.push(finding('invalid-frontmatter', relativePath, 'YAML frontmatter closing delimiter is missing.'));
    return null;
  }
  const values = {};
  const lines = normalized.slice(4, closing).split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim() || line.trimStart().startsWith('#')) {
      continue;
    }
    if (/^\s/.test(line) || line.includes('\t')) {
      findings.push(finding('invalid-frontmatter', relativePath, `Unsupported nested/tabbed YAML at frontmatter line ${index + 2}.`));
      continue;
    }
    const match = /^([A-Za-z_][A-Za-z0-9_-]*):\s*(.+)$/.exec(line);
    if (!match) {
      findings.push(finding('invalid-frontmatter', relativePath, `Invalid scalar YAML at frontmatter line ${index + 2}.`));
      continue;
    }
    const [, key, rawValue] = match;
    if (Object.prototype.hasOwnProperty.call(values, key)) {
      findings.push(finding('invalid-frontmatter', relativePath, `Duplicate frontmatter key '${key}'.`));
      continue;
    }
    values[key] = parseScalar(rawValue.trim());
  }
  if (typeof values.type !== 'string' || !values.type.trim()) {
    findings.push(finding('missing-type', relativePath, 'Frontmatter must contain a non-empty scalar type.'));
  }
  return values;
}

function parseScalar(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null' || value === '~') return null;
  return value;
}

function parseMarkdownLinks(content) {
  const links = [];
  const pattern = /\[([^\]]+)\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;
  for (const match of content.matchAll(pattern)) {
    links.push({ label: match[1], target: match[2].replace(/^<|>$/g, '') });
  }
  return links;
}

function resolveLocalLink(targetDir, sourceFile, target) {
  if (/^(?:https?:|mailto:|data:)/i.test(target) || target.startsWith('#')) {
    return null;
  }
  const pathPart = target.split('#', 1)[0];
  if (!pathPart) {
    return null;
  }
  let decoded;
  try {
    decoded = decodeURIComponent(pathPart);
  } catch {
    decoded = pathPart;
  }
  const resolved = path.resolve(path.dirname(sourceFile), decoded);
  return isWithin(targetDir, resolved) ? resolved : path.resolve(path.dirname(sourceFile), decoded);
}

function extractSourcesSection(content) {
  const match = /^##\s+Sources\s*$/im.exec(content);
  if (!match) {
    return null;
  }
  const rest = content.slice(match.index + match[0].length);
  const nextHeading = /^##\s+/m.exec(rest);
  return nextHeading ? rest.slice(0, nextHeading.index) : rest;
}

function collectFileHashes(root) {
  const hashes = new Set();
  const visit = (current) => {
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) return;
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(current)) visit(path.join(current, entry));
    } else if (stat.isFile()) {
      hashes.add(hashFile(current));
    }
  };
  visit(root);
  return hashes;
}

function collectKnowledgeSegments(root) {
  const segments = new Set();
  const visit = (current) => {
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) return;
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(current)) visit(path.join(current, entry));
      return;
    }
    if (!stat.isFile() || path.extname(current).toLowerCase() !== '.md') return;
    const body = normalizeKnowledgeBody(fs.readFileSync(current, 'utf8'));
    const windowLength = Math.min(64, body.length);
    for (let index = 0; windowLength > 0 && index <= body.length - windowLength; index += 1) {
      segments.add(body.slice(index, index + windowLength));
    }
  };
  visit(root);
  return segments;
}

function knowledgeBodyParagraphs(content) {
  const body = content
    .replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---\r?\n/, '')
    .split(/^##\s+Sources\s*$/im, 1)[0];
  return body.split(/\r?\n\s*\r?\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
    .filter((paragraph) => paragraph && !paragraph.startsWith('#'));
}

function normalizeKnowledgeBody(content) {
  return knowledgeBodyParagraphs(content).join('').replace(/\s+/g, '');
}

function finding(id, filePath, message) {
  return { id, path: portable(filePath), message };
}

function dedupeFindings(findings) {
  const seen = new Set();
  return findings.filter((item) => {
    const key = `${item.id}\0${item.path}\0${item.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((left, right) => `${left.path}:${left.id}`.localeCompare(`${right.path}:${right.id}`));
}

function resolveInside(root, value, label) {
  const resolved = path.isAbsolute(value) || path.win32.isAbsolute(value) ? path.resolve(value) : path.resolve(root, value);
  if (!isWithin(root, resolved)) {
    throw new Error(`${label} escapes target directory`);
  }
  return resolved;
}

function isWithin(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function realPathIsWithin(root, candidate) {
  try {
    return isWithin(fs.realpathSync.native(root), fs.realpathSync.native(candidate));
  } catch {
    return true;
  }
}

function hasLinkedAncestor(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  if (relative.startsWith('..') || path.isAbsolute(relative)) return true;
  let current = path.resolve(root);
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    const stat = fs.lstatSync(current, { throwIfNoEntry: false });
    if (!stat) return false;
    if (stat.isSymbolicLink()) return true;
  }
  return false;
}

function requireDirectory(value, label) {
  const resolved = path.resolve(value);
  if (!fs.statSync(resolved, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`${label} directory does not exist: ${resolved}`);
  }
  return resolved;
}

function hashFile(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function portable(value) {
  return value.replaceAll('\\', '/');
}

function parseArgs(argv) {
  const [targetDir, ...args] = argv;
  if (!targetDir) {
    throw new Error('Usage: okf-validate.mjs <target> [--knowledge <path>] [--forbid-tree <path>] [--json]');
  }
  const options = { targetDir, knowledgeRoot: 'knowledge', forbidTree: null, json: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--json') {
      options.json = true;
    } else if (arg === '--knowledge' || arg === '--forbid-tree') {
      const value = args[++index];
      if (!value) throw new Error(`Missing value for ${arg}`);
      if (arg === '--knowledge') options.knowledgeRoot = value;
      if (arg === '--forbid-tree') options.forbidTree = value;
    } else {
      throw new Error(`Unsupported option '${arg}'`);
    }
  }
  return options;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const json = process.argv.includes('--json');
  try {
    const result = validateOkf(parseArgs(process.argv.slice(2)));
    console.log(json ? JSON.stringify(result, null, 2) : `${result.status}: ${result.knowledgeRoot}`);
    process.exitCode = result.ok ? 0 : 3;
  } catch (error) {
    const report = { schemaVersion: 1, ok: false, status: 'error', message: error.message };
    console.error(json ? JSON.stringify(report) : `okf-validate: ${error.message}`);
    process.exitCode = 2;
  }
}
