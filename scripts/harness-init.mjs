#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const force = process.argv.includes('--force');
const json = process.argv.includes('--json');

const seeds = [
  ['progress.example.md', 'progress.md'],
  ['session-handoff.example.md', 'session-handoff.md'],
  ['tasks/current-task.example.md', 'tasks/current-task.md'],
];

const results = [];
const failures = [];

for (const [source, target] of seeds) {
  const sourcePath = path.join(root, source);
  const targetPath = path.join(root, target);

  if (!fs.existsSync(sourcePath)) {
    failures.push(`${source}: missing harness state example`);
    continue;
  }

  if (fs.existsSync(targetPath) && !force) {
    results.push({ target, status: 'kept' });
    continue;
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
  results.push({ target, status: fs.existsSync(targetPath) && force ? 'created_or_replaced' : 'created' });
}

if (json) {
  console.log(JSON.stringify({ ok: failures.length === 0, force, results, failures }, null, 2));
} else {
  for (const result of results) {
    console.log(`${result.status}: ${result.target}`);
  }
  for (const failure of failures) {
    console.error(failure);
  }
}

if (failures.length > 0) {
  process.exit(3);
}
