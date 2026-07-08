import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createDailyDagReadinessReport
} from "../scripts/check-daily-dag-readiness.mjs";

const rootDir = process.cwd();

test("daily DAG readiness report classifies current manifest without counting planned nodes as production ready", async () => {
  const report = await createDailyDagReadinessReport({
    rootDir,
    generatedAt: "2026-07-08T00:00:00.000Z"
  });

  assert.equal(report.schema_version, 1);
  assert.equal(report.node_count, 16);
  assert.equal(report.nodes.length, 16);
  assert.equal(report.counts.planned, 9);
  assert.equal(report.counts.mapped, 7);
  assert.equal(report.counts.real, 0);
  assert.equal(report.counts.fixture, 0);
  assert.equal(report.counts.production_ready, 7);

  const score = report.nodes.find((node) => node.id === "score");
  assert(score);
  assert.equal(score.readiness_state, "planned");
  assert.equal(score.production_ready, false);
  assert.equal(score.standalone_executable, false);
  assert.match(score.blocking_reason, /planned/i);

  const admitReject = report.nodes.find((node) => node.id === "admit-reject");
  assert(admitReject);
  assert.equal(admitReject.readiness_state, "mapped");
  assert.equal(admitReject.production_ready, true);
  assert.equal(admitReject.standalone_executable, false);
  assert.match(admitReject.blocking_reason, /legacy/i);
});

test("daily DAG readiness report schema validates CLI JSON output", async () => {
  const schema = JSON.parse(await fs.readFile(path.join(rootDir, "schemas", "daily-dag-readiness.schema.json"), "utf8"));
  const cli = spawnSync(process.execPath, [
    path.join(rootDir, "scripts", "check-daily-dag-readiness.mjs"),
    "--repo-root",
    rootDir,
    "--generated-at",
    "2026-07-08T00:00:00.000Z",
    "--json"
  ], {
    cwd: rootDir,
    encoding: "utf8"
  });

  assert.equal(cli.status, 0, cli.stderr || cli.stdout);
  const report = JSON.parse(cli.stdout);
  assert.deepEqual(schema.required, [
    "schema_version",
    "generated_at",
    "manifest_path",
    "node_count",
    "counts",
    "production_ready_node_ids",
    "nodes"
  ]);
  assert.equal(schema.properties.nodes.items.$ref, "#/$defs/node");
  assert(report.nodes.every((node) => node.evidence_files.manifest.endsWith("config/daily-codex-dag.json")));
});

test("daily DAG readiness supports fixture and future real nodes without treating fixtures as production ready", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "daily-dag-readiness-"));
  await fs.mkdir(path.join(tmp, "config"), { recursive: true });
  const manifest = {
    schema_version: 1,
    name: "daily-codex-dag-contract",
    description: "Synthetic readiness manifest.",
    nodes: [
      {
        id: "real-node",
        title: "Real node",
        kind: "command",
        execution_status: "real",
        execution_contract: {
          readiness: "node_executable",
          summary: "Has a standalone execution contract.",
          node_execution_spec: { executor: "command" }
        },
        runner_stage_ref: "collect",
        schemas: { input: "schemas/in.json", output: "schemas/out.json" },
        fixture: "tests/fixtures/real.json",
        inputs: [],
        outputs: []
      },
      {
        id: "fixture-node",
        title: "Fixture node",
        kind: "command",
        execution_status: "fixture",
        execution_contract: {
          readiness: "node_executable",
          summary: "Fixture-only executable adapter.",
          node_execution_spec: { executor: "command" }
        },
        runner_stage_ref: "fixture",
        schemas: { input: "schemas/in.json", output: "schemas/out.json" },
        fixture: "tests/fixtures/fixture.json",
        inputs: [],
        outputs: []
      }
    ]
  };
  const manifestPath = path.join(tmp, "config", "daily-codex-dag.json");
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const report = await createDailyDagReadinessReport({
    rootDir: tmp,
    dagPath: manifestPath,
    generatedAt: "2026-07-08T00:00:00.000Z"
  });

  assert.equal(report.counts.real, 1);
  assert.equal(report.counts.fixture, 1);
  assert.equal(report.counts.production_ready, 1);
  assert.equal(report.nodes.find((node) => node.id === "real-node").production_ready, true);
  assert.equal(report.nodes.find((node) => node.id === "fixture-node").production_ready, false);

  const inMemoryReport = await createDailyDagReadinessReport({
    rootDir: tmp,
    manifest,
    generatedAt: "2026-07-08T00:00:00.000Z"
  });
  assert.equal(inMemoryReport.counts.real, 1);
  assert.equal(inMemoryReport.counts.fixture, 1);
});
