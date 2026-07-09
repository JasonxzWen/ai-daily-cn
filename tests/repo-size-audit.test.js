import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import {
  auditRepoSize,
  evaluateRepoSizeBudget
} from "../scripts/audit-repo-size.mjs";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(".");

test("repo size audit measures tracked payload and duplicate docs assets", async () => {
  const rootDir = await createFixtureRepo();
  const audit = await auditRepoSize({ rootDir });

  assert.equal(audit.tracked.file_count, 6);
  assert(audit.tracked.total_bytes > 0);
  assert.equal(audit.notable_paths.docs_assets.files, 3);
  assert.equal(audit.notable_paths.reports_data_candidates_json.files, 1);
  assert.equal(audit.notable_paths.source_status_history_json.files, 1);
  assert.equal(audit.duplicate_assets.group_count, 1);
  assert.equal(audit.duplicate_assets.duplicate_file_count, 2);
  assert.equal(audit.duplicate_assets.wasted_bytes, Buffer.byteLength("same-image"));
  assert(audit.docs_assets_by_extension.some((group) => group.path === ".png" && group.files === 2));
  assert.equal(audit.largest_files[0].path, "reports-data/internal/source-status-history.json");
});

test("repo size budget reports warnings separately from blocking errors", async () => {
  const rootDir = await createFixtureRepo();
  const audit = await auditRepoSize({ rootDir });
  const result = evaluateRepoSizeBudget(audit, {
    thresholds: {
      tracked_total_bytes: { warning: 1, error: audit.tracked.total_bytes + 1 },
      duplicate_docs_assets_waste_bytes: { warning: 1, error: audit.duplicate_assets.wasted_bytes + 1 },
      single_file_bytes: { warning: 1, error: audit.largest_files[0].bytes + 1 }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
  assert.equal(result.warnings.length, 3);
  assert.deepEqual(result.warnings.map((warning) => warning.metric).sort(), [
    "duplicate_docs_assets_waste_bytes",
    "single_file_bytes",
    "tracked_total_bytes"
  ]);
});

test("repo size audit CLI fails only when selected budget severity is exceeded", async () => {
  const rootDir = await createFixtureRepo();
  const budgetPath = path.join(rootDir, "repo-size-budget.json");
  await fs.writeFile(budgetPath, JSON.stringify({
    thresholds: {
      tracked_total_bytes: { warning: 1, error: 1 }
    }
  }, null, 2), "utf8");

  await assert.rejects(execFileAsync(process.execPath, [
    path.join(repoRoot, "scripts", "audit-repo-size.mjs"),
    "--root",
    rootDir,
    "--budget",
    "repo-size-budget.json",
    "--json"
  ]), (error) => {
    const output = JSON.parse(error.stdout);
    assert.equal(output.budget.ok, false);
    assert.equal(output.budget.errors[0].metric, "tracked_total_bytes");
    return true;
  });

  const { stdout } = await execFileAsync(process.execPath, [
    path.join(repoRoot, "scripts", "audit-repo-size.mjs"),
    "--root",
    rootDir,
    "--budget",
    "repo-size-budget.json",
    "--fail-on",
    "none",
    "--json"
  ]);
  const output = JSON.parse(stdout);
  assert.equal(output.budget.ok, false);
});

async function createFixtureRepo() {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "repo-size-audit-"));
  await fs.mkdir(path.join(rootDir, "docs", "assets"), { recursive: true });
  await fs.mkdir(path.join(rootDir, "docs", "reports", "2026", "07"), { recursive: true });
  await fs.mkdir(path.join(rootDir, "reports-data", "2026", "07"), { recursive: true });
  await fs.writeFile(path.join(rootDir, "docs", "assets", "a.png"), "same-image", "utf8");
  await fs.writeFile(path.join(rootDir, "docs", "assets", "b.png"), "same-image", "utf8");
  await fs.writeFile(path.join(rootDir, "docs", "assets", "c.webp"), "different-image", "utf8");
  await fs.writeFile(path.join(rootDir, "docs", "reports", "2026", "07", "2026-07-09.html"), "<!doctype html>\n", "utf8");
  await fs.mkdir(path.join(rootDir, "reports-data", "internal", "candidates", "2026", "07"), { recursive: true });
  await fs.writeFile(path.join(rootDir, "reports-data", "internal", "candidates", "2026", "07", "2026-07-09.candidates.json"), "{\"items\":[]}\n", "utf8");
  await fs.writeFile(path.join(rootDir, "reports-data", "internal", "source-status-history.json"), "x".repeat(2048), "utf8");

  await execFileAsync("git", ["init"], { cwd: rootDir });
  await execFileAsync("git", ["add", "."], { cwd: rootDir });
  return rootDir;
}
