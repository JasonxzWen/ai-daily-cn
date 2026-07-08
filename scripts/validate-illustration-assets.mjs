#!/usr/bin/env node
import path from "node:path";
import { validateIllustrationAssets } from "../src/illustration-assets.js";

const args = parseArgs(process.argv.slice(2));
const rootDir = path.resolve(args["repo-root"] || process.cwd());

const result = await validateIllustrationAssets({ rootDir });
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!result.ok) {
  process.exitCode = 1;
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
    } else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}
