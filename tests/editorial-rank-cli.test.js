import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { validateEditorialRankArtifact } from "../src/editorial-rank.js";

const execFileAsync = promisify(execFile);
const rootDir = process.cwd();
const scriptPath = path.join(rootDir, "scripts", "build-editorial-rank-artifact.mjs");
const fixturePath = path.join(rootDir, "tests", "fixtures", "editorial-rank", "mixed-candidates.json");
const generatedAt = "2026-07-08T00:00:00.000Z";

test("editorial rank artifact CLI writes a validated artifact to stdout", async () => {
  const { stdout, stderr } = await execFileAsync(process.execPath, [
    scriptPath,
    "--input",
    fixturePath,
    "--generated-at",
    generatedAt,
    "--source-date",
    "2026-07-08"
  ], { cwd: rootDir });

  assert.equal(stderr, "");
  const artifact = JSON.parse(stdout);
  const validation = validateEditorialRankArtifact(artifact, { rootDir });
  assert.equal(validation.valid, true);
  assert.equal(artifact.generated_at, generatedAt);
  assert.deepEqual(artifact.source_window, { date: "2026-07-08" });
  assert.equal(artifact.items.some((item) => item.source_id === "github-momentum-only-repo"), true);
});

test("editorial rank artifact CLI writes explicit output only to internal paths", async () => {
  const artifactDir = path.join(rootDir, ".tmp", "editorial-rank-cli-test");
  const inputPath = path.join(artifactDir, "input.json");
  const outputPath = path.join(artifactDir, "rank-artifact.json");
  const candidates = JSON.parse(await fs.readFile(fixturePath, "utf8"));
  await fs.mkdir(artifactDir, { recursive: true });
  await fs.writeFile(inputPath, `${JSON.stringify({
    generated_at: generatedAt,
    source_window: { relative_hours: 24 },
    candidates
  }, null, 2)}\n`, "utf8");

  const { stdout, stderr } = await execFileAsync(process.execPath, [
    scriptPath,
    "--input",
    path.relative(rootDir, inputPath),
    "--out",
    path.relative(rootDir, outputPath)
  ], { cwd: rootDir });

  assert.equal(stderr, "");
  const summary = JSON.parse(stdout);
  const artifact = JSON.parse(await fs.readFile(outputPath, "utf8"));
  assert.equal(summary.ok, true);
  assert.equal(summary.output_kind, "editorial_rank_artifact");
  assert.equal(summary.output_path, outputPath);
  assert.equal(summary.item_count, artifact.items.length);
  assert.equal(validateEditorialRankArtifact(artifact, { rootDir }).valid, true);

  await fs.rm(artifactDir, { recursive: true, force: true });
});

test("editorial rank artifact CLI rejects public docs output paths", async () => {
  await assert.rejects(
    execFileAsync(process.execPath, [
      scriptPath,
      "--input",
      fixturePath,
      "--out",
      "docs/editorial-rank-artifact.json"
    ], { cwd: rootDir }),
    (error) => {
      assert.equal(error.code, 1);
      assert.equal(error.stderr, "");
      const payload = JSON.parse(error.stdout);
      assert.equal(payload.ok, false);
      assert.match(payload.failures.join("\n"), /must not be written under docs\//);
      return true;
    }
  );
});

test("editorial rank artifact CLI rejects output paths outside the repository", async () => {
  const outsidePath = path.join(os.tmpdir(), "editorial-rank-outside.json");
  await assert.rejects(
    execFileAsync(process.execPath, [
      scriptPath,
      "--input",
      fixturePath,
      "--out",
      outsidePath
    ], { cwd: rootDir }),
    (error) => {
      assert.equal(error.code, 1);
      assert.equal(error.stderr, "");
      const payload = JSON.parse(error.stdout);
      assert.equal(payload.ok, false);
      assert.match(payload.failures.join("\n"), /must stay inside the repository/);
      return true;
    }
  );
});

test("editorial rank artifact package scripts expose CLI and focused tests", async () => {
  const packageJson = JSON.parse(await fs.readFile(path.join(rootDir, "package.json"), "utf8"));
  assert.equal(packageJson.scripts["content:editorial-rank:build"], "node scripts/build-editorial-rank-artifact.mjs");
  assert.match(packageJson.scripts["content:editorial-rank"], /tests\/editorial-rank-cli\.test\.js/);
  assert.match(packageJson.scripts.test, /tests\/editorial-rank-cli\.test\.js/);
});
