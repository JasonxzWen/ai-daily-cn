import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

test("OpenSpec 校验不依赖全局 openspec CLI", () => {
  const result = spawnSync(process.execPath, ["scripts/validate-openspec.mjs", "add-ai-daily-static-publishing"], {
    cwd: rootDir,
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.ok, true);
  assert(output.checked_files.includes("openspec/config.yaml"));
  assert(output.checked_files.some((file) => file.endsWith("/spec.md")));
});
