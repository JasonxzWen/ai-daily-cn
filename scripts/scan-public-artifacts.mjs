#!/usr/bin/env node
import { scanPublicArtifactsForLocalInfo } from "../src/privacy.js";

const args = parseArgs(process.argv.slice(2));
const result = await scanPublicArtifactsForLocalInfo({
  rootDir: args["repo-root"] || process.cwd(),
  targets: args.path ? [].concat(args.path) : undefined,
  extraForbidden: args["forbid"] ? [].concat(args["forbid"]) : []
});

console.log(JSON.stringify(result, null, 2));
if (!result.ok) {
  process.exitCode = 1;
}

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const value = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[++index] : true;
    if (out[key]) {
      out[key] = [].concat(out[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}
