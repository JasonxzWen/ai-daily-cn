#!/usr/bin/env node
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import url from 'node:url';

const root = path.resolve('site');
const port = Number(process.env.PORT || 4173);
const types = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.svg', 'image/svg+xml'],
]);

const server = http.createServer((request, response) => {
  const parsed = url.parse(request.url || '/');
  const pathname = decodeURIComponent(parsed.pathname || '/');
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = path.resolve(root, relative);
  const relativeToRoot = path.relative(root, filePath);

  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }

  response.writeHead(200, {
    'content-type': types.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream',
  });
  fs.createReadStream(filePath).pipe(response);
});

server.listen(port, () => {
  console.log(`Website cloner harness serving http://127.0.0.1:${port}`);
});
