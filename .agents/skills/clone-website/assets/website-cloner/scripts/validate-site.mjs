#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const sitePath = path.resolve('site', 'index.html');
const failures = [];

if (!fs.existsSync(sitePath)) {
  failures.push('site/index.html is missing');
} else {
  const body = fs.readFileSync(sitePath, 'utf8');
  if (!body.includes('data-clone-report')) {
    failures.push('site/index.html must mark the primary report container with data-clone-report');
  }
  if (!body.includes('data-source-url=')) {
    failures.push('site/index.html must record the source URL with data-source-url');
  }
  if (!body.includes('data-report-content=')) {
    failures.push('site/index.html must record replacement content with data-report-content');
  }
  if (/<form[\s>]/i.test(body) || /type=["']password["']/i.test(body)) {
    failures.push('site/index.html must not include credential-collection forms in the smoke harness');
  }
  if (/analytics|googletagmanager|gtag\(|pixel/i.test(body)) {
    failures.push('site/index.html must not include analytics or tracking scripts');
  }
}

if (failures.length > 0) {
  console.error('Website cloner harness validation failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(3);
}

console.log('Website cloner harness validation passed.');
