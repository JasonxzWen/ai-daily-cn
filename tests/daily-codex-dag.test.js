import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Ajv from "ajv/dist/2020.js";
import {
  createDailyCodexDagDryRun,
  createDailyCodexDagPlan,
  validateDailyCodexDag,
  validateDailyCodexDagDryRunSummary
} from "../src/daily-codex-dag.js";

const rootDir = process.cwd();
const manifestPath = path.join(rootDir, "config", "daily-codex-dag.json");
const dagCliPath = path.join(rootDir, "scripts", "run-daily-codex-dag.mjs");
const dagRunSchemaPath = path.join(rootDir, "schemas", "daily-codex-dag-run.schema.json");
const dryRunSummaryFixturePath = path.join(rootDir, "tests", "fixtures", "daily-codex-dag", "dry-run-summary.json");
const fixedNow = "2026-07-03T08:00:00.000Z";
let dagRunSummaryValidator = null;

test("daily codex DAG manifest validates target node contract", async () => {
  const result = await validateDailyCodexDag({ rootDir });

  assert.equal(result.ok, true, result.failures.join("\n"));
  assert.equal(result.node_ids.length, 16);
  assert(result.node_ids.includes("fetch-source-health"));
  assert(result.node_ids.includes("publish-cleanup"));
  assert(result.checked_files.some((file) => file.endsWith("config/daily-codex-dag.json")));
  assert(result.checked_files.some((file) => file.endsWith("config/daily-resilience-policy.json")));
});

test("daily codex DAG plan projection is deterministic and topological", async () => {
  const manifest = await loadManifest();
  const originalManifest = JSON.stringify(manifest);
  const first = await createDailyCodexDagPlan({ rootDir, manifest });
  const second = await createDailyCodexDagPlan({ rootDir, manifest });

  assert.equal(first.ok, true, first.failures.join("\n"));
  assert.equal(second.ok, true, second.failures.join("\n"));
  assert.deepEqual(first.plan, second.plan);
  assert.equal(JSON.stringify(manifest), originalManifest, "planner must not mutate manifest input");

  const plan = first.plan;
  assert.equal(plan.node_count, 16);
  assert.equal(plan.nodes.length, 16);
  assert.equal(new Set(plan.nodes.map((item) => item.id)).size, 16);

  const levelById = new Map(plan.nodes.map((item) => [item.id, item.level]));
  for (const item of plan.nodes) {
    for (const dep of item.dependencies) {
      assert(
        levelById.get(dep) < item.level,
        `${item.id} should be after dependency ${dep}`
      );
    }
  }

  const articleAndEditionLevel = plan.levels.find((level) => level.node_ids.includes("persist-article-db"));
  assert.deepEqual(
    articleAndEditionLevel.node_ids.filter((id) => id === "persist-article-db" || id === "assemble-daily-edition"),
    ["persist-article-db", "assemble-daily-edition"],
    "same-level nodes should preserve manifest order"
  );

  assert(levelById.get("per-item-summary") > levelById.get("admit-reject"));
  assert(levelById.get("quality-audit") > levelById.get("per-item-summary"));
  assert(levelById.get("build-cards-page") > levelById.get("persist-article-db"));
  assert(levelById.get("build-cards-page") > levelById.get("assemble-daily-edition"));

  const score = plan.nodes.find((item) => item.id === "score");
  assert.deepEqual(Object.keys(score).sort(), [
    "dependencies",
    "execution_status",
    "id",
    "inputs",
    "kind",
    "level",
    "outputs",
    "owner_path_scope",
    "parallel_group",
    "plan_status",
    "public_artifact",
    "runner_stage_ref",
    "title"
  ]);
  assert.equal(score.plan_status, "planned");
  assert.equal(plan.nodes.find((item) => item.id === "admit-reject").plan_status, "mapped");
});

test("daily codex DAG plan projection refuses invalid manifests without throwing", async () => {
  const manifest = await loadManifest();
  node(manifest, "score").inputs[0].path = ".tmp/daily-codex-pipeline/{report_date}/artifacts/missing-plan-input.json";

  const result = await createDailyCodexDagPlan({ rootDir, manifest });

  assert.equal(result.ok, false);
  assert.equal(result.plan, null);
  assert(result.validation);
  assert(
    result.failures.some((failure) => failure.includes("node score input .tmp/daily-codex-pipeline/{report_date}/artifacts/missing-plan-input.json is not produced")),
    result.failures.join("\n")
  );

  const structurallyInvalid = await loadManifest();
  node(structurallyInvalid, "score").inputs = { path: "not-an-array.json", required: true };
  const structuralResult = await createDailyCodexDagPlan({ rootDir, manifest: structurallyInvalid });

  assert.equal(structuralResult.ok, false);
  assert.equal(structuralResult.plan, null);
  assert(structuralResult.validation);
  assert(
    structuralResult.failures.some((failure) => failure.includes("/nodes/4/inputs must be array")),
    structuralResult.failures.join("\n")
  );
});

test("daily codex DAG dry-run helper is deterministic and level ordered", async () => {
  const manifest = await loadManifest();
  const first = await createDailyCodexDagDryRun({
    rootDir,
    manifest,
    reportDate: "2026-07-03",
    now: fixedNow
  });
  const second = await createDailyCodexDagDryRun({
    rootDir,
    manifest,
    reportDate: "2026-07-03",
    now: fixedNow
  });

  assert.equal(first.ok, true, first.failures.join("\n"));
  assert.deepEqual(first, second);
  assert.equal(first.mode, "daily_codex_dag_dry_run");
  assert.equal(first.report_date, "2026-07-03");
  assert.equal(first.generated_at, fixedNow);
  assert.equal(first.run.final_status, "dry_run_only");
  assert.equal(first.plan.node_count, 16);
  assert.deepEqual(first.run.levels, first.plan.levels);
  assert.deepEqual(first.run.completed_nodes, []);
  assert.deepEqual(first.run.blocked_nodes, []);
  assert.deepEqual(first.run.planned_nodes, first.plan.nodes.map((item) => item.id));
  assert.equal(first.next_action.kind, "implement_executable_node_runner");
  await assertValidDagRunSummary(first);

  const levelById = new Map();
  for (const level of first.run.levels) {
    for (const nodeId of level.node_ids) {
      levelById.set(nodeId, level.level);
    }
  }
  for (const item of first.plan.nodes) {
    for (const dep of item.dependencies) {
      assert(levelById.get(dep) < levelById.get(item.id), `${item.id} should follow ${dep}`);
    }
  }
});

test("daily codex DAG dry-run summary schema validates fixture and rejects mixed envelopes", async () => {
  const fixture = await loadDryRunSummaryFixture();
  await assertValidDagRunSummary(fixture);

  const successWithNullPlan = structuredCloneJson(fixture);
  successWithNullPlan.plan = null;
  await assertInvalidDagRunSummary(successWithNullPlan);

  const successWithFailedValidation = structuredCloneJson(fixture);
  successWithFailedValidation.validation.ok = false;
  successWithFailedValidation.validation.failures = ["forced validation contradiction"];
  await assertInvalidDagRunSummary(successWithFailedValidation);

  const failureWithRunObject = {
    ok: false,
    failures: ["forced failure"],
    warnings: [],
    validation: null,
    plan: null,
    run: fixture.run
  };
  await assertInvalidDagRunSummary(failureWithRunObject);
});

test("daily codex DAG dry-run summary semantic validator rejects schema-valid contradictions", async () => {
  const fixture = await loadDryRunSummaryFixture();
  const fullSummary = await createDailyCodexDagDryRun({
    rootDir,
    manifest: await loadManifest(),
    reportDate: "2026-07-03",
    now: fixedNow
  });
  const cases = [
    {
      name: "non-real report date",
      mutate: (value) => {
        value.report_date = "2026-02-31";
      },
      failure: "report_date must be a real YYYY-MM-DD date"
    },
    {
      name: "non-canonical generated_at",
      mutate: (value) => {
        value.generated_at = "2026-07-03T16:00:00+08:00";
      },
      failure: "generated_at must be a canonical UTC Date#toISOString() string"
    },
    {
      name: "node count mismatch",
      mutate: (value) => {
        value.plan.node_count += 1;
      },
      failure: "plan.node_count must equal plan.nodes.length"
    },
    {
      name: "planned node mismatch",
      mutate: (value) => {
        value.run.planned_nodes = [...value.run.planned_nodes, "unknown-node"];
      },
      failure: "run.planned_nodes must equal plan.nodes ids"
    },
    {
      name: "run levels mismatch",
      mutate: (value) => {
        value.run.levels[0].node_ids = [...value.run.levels[0].node_ids, "unknown-node"];
      },
      failure: "run.levels must equal plan.levels"
    },
    {
      name: "plan levels unknown node",
      mutate: (value) => {
        value.plan.levels[0].node_ids = [...value.plan.levels[0].node_ids, "unknown-node"];
      },
      failure: "plan.levels references unknown node"
    },
    {
      name: "plan levels duplicate node across levels",
      mutate: (value) => {
        value.plan.levels.push({ level: 1, node_ids: [value.plan.nodes[0].id] });
      },
      failure: "plan.levels repeats node"
    },
    {
      name: "plan levels missing node",
      base: "full",
      mutate: (value) => {
        const level = value.plan.levels.find((item) => item.node_ids.length > 1);
        assert(level, "fixture must include a multi-node level for schema-valid missing-node case");
        level.node_ids = level.node_ids.slice(1);
      },
      failure: "plan.levels flattened node_ids must equal plan.nodes ids"
    },
    {
      name: "plan node level mismatch",
      mutate: (value) => {
        value.plan.nodes[0].level += 1;
      },
      failure: "level must match plan.levels"
    },
    {
      name: "completed nodes are non-empty",
      mutate: (value) => {
        value.run.completed_nodes = [value.plan.nodes[0].id];
      },
      failure: "run.completed_nodes must be empty"
    },
    {
      name: "failure envelope validation claims success",
      value: {
        ok: false,
        failures: ["forced failure"],
        warnings: [],
        validation: {
          ok: true,
          failures: [],
          warnings: [],
          node_ids: [],
          checked_files: []
        },
        plan: null,
        run: null
      },
      failure: "validation.ok must be false"
    }
  ];

  for (const item of cases) {
    const base = item.base === "full" ? fullSummary : fixture;
    const value = item.value || structuredCloneJson(base);
    if (item.mutate) item.mutate(value);
    await assertValidDagRunSummarySchemaOnly(value);
    assertInvalidSemanticDagRunSummary(value, item.failure, item.name);
  }
});

test("daily codex DAG dry-run summary semantic validator does not throw on malformed inputs", async () => {
  const fixture = await loadDryRunSummaryFixture();
  const failureValidationMissingFields = {
    ok: false,
    failures: ["forced failure"],
    warnings: [],
    validation: { ok: false },
    plan: null,
    run: null
  };
  const successValidationMissingFields = structuredCloneJson(fixture);
  successValidationMissingFields.validation = { ok: true };
  const successMissingNextAction = structuredCloneJson(fixture);
  delete successMissingNextAction.next_action;
  const successPlanNodeMissingTitle = structuredCloneJson(fixture);
  delete successPlanNodeMissingTitle.plan.nodes[0].title;
  const successBigIntLevelNodeId = structuredCloneJson(fixture);
  successBigIntLevelNodeId.plan.levels[0].node_ids = [1n];
  const successSymbolDependency = structuredCloneJson(fixture);
  successSymbolDependency.plan.nodes[0].dependencies = [Symbol("dep")];
  const cases = [
    null,
    [],
    "not an object",
    { ok: true },
    { ok: false, failures: [], validation: null, plan: {}, run: {} },
    { ok: false, failures: ["forced failure"], validation: "bad", plan: null, run: null },
    { ok: false, failures: ["forced failure"], validation: null, plan: null, run: null },
    {
      ...structuredCloneJson(fixture),
      validation: null
    },
    {
      ...structuredCloneJson(fixture),
      failures: ["unexpected success failure"]
    },
    {
      ...structuredCloneJson(fixture),
      warnings: "bad"
    },
    failureValidationMissingFields,
    successValidationMissingFields,
    successMissingNextAction,
    successPlanNodeMissingTitle,
    successBigIntLevelNodeId,
    successSymbolDependency
  ];

  for (const value of cases) {
    const result = validateDailyCodexDagDryRunSummary(value);
    assert.equal(result.ok, false);
    assert(result.failures.length > 0);
  }
});

test("daily codex DAG dry-run helper refuses invalid manifests without throwing", async () => {
  const manifest = await loadManifest();
  node(manifest, "score").inputs[0].path = ".tmp/daily-codex-pipeline/{report_date}/artifacts/missing-dry-run-input.json";

  const result = await createDailyCodexDagDryRun({
    rootDir,
    manifest,
    reportDate: "2026-07-03",
    now: fixedNow
  });

  assert.equal(result.ok, false);
  assert.equal(result.plan, null);
  assert.equal(result.run, null);
  assert.deepEqual(result.warnings, []);
  assert(result.validation);
  await assertValidDagRunSummary(result);
  assert(
    result.failures.some((failure) => failure.includes("missing-dry-run-input.json is not produced")),
    result.failures.join("\n")
  );
});

test("daily codex DAG dry-run CLI writes JSON to stdout only", async () => {
  const forbiddenBefore = await forbiddenPathSnapshot();
  const result = await runDagCli(["--dry-run", "--date", "2026-07-03", "--json"]);

  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stderr, "");
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, true, parsed.failures?.join("\n"));
  assert.equal(parsed.mode, "daily_codex_dag_dry_run");
  assert.equal(parsed.report_date, "2026-07-03");
  assert.equal(parsed.run.final_status, "dry_run_only");
  assert.equal(parsed.plan.node_count, 16);
  await assertValidDagRunSummary(parsed);
  assert.deepEqual(await forbiddenPathSnapshot(), forbiddenBefore, "stdout-only dry-run must not mutate production or scratch paths");
});

test("daily codex DAG dry-run CLI rejects invalid invocations with structured JSON", async () => {
  const missingDryRun = await runDagCli(["--date", "2026-07-03", "--json"]);
  assert.equal(missingDryRun.code, 1);
  assert.equal(missingDryRun.stderr, "");
  const missingDryRunJson = JSON.parse(missingDryRun.stdout);
  assert.equal(missingDryRunJson.failures[0], "daily codex DAG CLI requires --dry-run");
  assert.equal(missingDryRunJson.validation, null);
  await assertValidDagRunSummary(missingDryRunJson);

  const missingJson = await runDagCli(["--dry-run", "--date", "2026-07-03"]);
  assert.equal(missingJson.code, 1);
  assert.equal(missingJson.stderr, "");
  const missingJsonJson = JSON.parse(missingJson.stdout);
  assert.equal(missingJsonJson.failures[0], "daily codex DAG CLI requires --json");
  assert.equal(missingJsonJson.validation, null);
  await assertValidDagRunSummary(missingJsonJson);

  const invalidDate = await runDagCli(["--dry-run", "--date", "20260703", "--json"]);
  assert.equal(invalidDate.code, 1);
  assert.equal(invalidDate.stderr, "");
  const invalidDateJson = JSON.parse(invalidDate.stdout);
  assert.equal(invalidDateJson.failures[0], "daily codex DAG CLI requires --date YYYY-MM-DD");
  assert.equal(invalidDateJson.validation, null);
  await assertValidDagRunSummary(invalidDateJson);
});

test("daily codex DAG dry-run CLI writes opt-in summaries under .tmp only", async () => {
  const tempName = `summary-${process.pid}-${Date.now()}.json`;
  const summaryPath = path.join(".tmp", "daily-codex-pipeline", "dag-dry-run-test", tempName);
  const absoluteSummaryPath = path.join(rootDir, summaryPath);
  await fs.rm(absoluteSummaryPath, { force: true });

  const result = await runDagCli([
    "--dry-run",
    "--date",
    "2026-07-03",
    "--json",
    "--summary-path",
    summaryPath
  ]);

  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stderr, "");
  const stdoutJson = JSON.parse(result.stdout);
  const fileJson = JSON.parse(await fs.readFile(absoluteSummaryPath, "utf8"));
  assert.deepEqual(fileJson, stdoutJson);
  assert.equal(fileJson.ok, true);
  await assertValidDagRunSummary(fileJson);

  await fs.rm(absoluteSummaryPath, { force: true });
});

test("daily codex DAG dry-run CLI rejects unsafe summary paths", async () => {
  const cases = [
    {
      args: ["--summary-path"],
      expected: "daily codex DAG CLI requires --summary-path value"
    },
    {
      args: ["--summary-path", "--json"],
      expected: "daily codex DAG CLI requires --summary-path value"
    },
    {
      args: ["--summary-path", "../x.json"],
      expected: "daily codex DAG summary path must stay under .tmp/daily-codex-pipeline"
    },
    {
      args: ["--summary-path", ".tmp/daily-codex-pipeline/../../x.json"],
      expected: "daily codex DAG summary path must stay under .tmp/daily-codex-pipeline"
    },
    {
      args: ["--summary-path", path.resolve(rootDir, "..", "x.json")],
      expected: "daily codex DAG summary path must stay under .tmp/daily-codex-pipeline"
    },
    {
      args: ["--summary-path", path.join("docs", "reports", "dag-summary.json")],
      expected: "daily codex DAG summary path must stay under .tmp/daily-codex-pipeline"
    },
    {
      args: ["--summary-path", path.join("reports-data", "dag-summary.json")],
      expected: "daily codex DAG summary path must stay under .tmp/daily-codex-pipeline"
    },
    {
      args: ["--summary-path", path.join(".tmp", "daily-codex-pipeline", "dag-summary.txt")],
      expected: "daily codex DAG summary path must end with .json"
    }
  ];

  for (const item of cases) {
    const forbiddenBefore = await forbiddenPathSnapshot();
    const result = await runDagCli(["--dry-run", "--date", "2026-07-03", "--json", ...item.args]);
    assert.equal(result.code, 1, item.expected);
    assert.equal(result.stderr, "");
    assert.equal(JSON.parse(result.stdout).failures[0], item.expected);
    assert.deepEqual(await forbiddenPathSnapshot(), forbiddenBefore, item.expected);
  }
});

test("daily codex DAG dry-run CLI returns structured JSON for invalid manifest roots", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "daily-codex-dag-"));
  const summaryPath = path.join(".tmp", "daily-codex-pipeline", "dag-summary.json");
  const absoluteSummaryPath = path.join(tempRoot, summaryPath);
  const result = await runDagCli([
    "--dry-run",
    "--date",
    "2026-07-03",
    "--json",
    "--summary-path",
    summaryPath
  ], { cwd: tempRoot });

  assert.equal(result.code, 1);
  assert.equal(result.stderr, "");
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.plan, null);
  assert.equal(parsed.run, null);
  assert.equal(parsed.validation, null);
  await assertValidDagRunSummary(parsed);
  assert(
    parsed.failures.some((failure) => failure.includes("config") && failure.includes("daily-codex-dag.json")),
    parsed.failures.join("\n")
  );
  assert.equal(await pathExists(absoluteSummaryPath), false, "invalid manifest dry-run must not write summary");
});

test("daily codex DAG validator catches structural and boundary regressions", async () => {
  const cases = [
    {
      name: "duplicate node id",
      mutate(manifest) {
        manifest.nodes[1].id = manifest.nodes[0].id;
      },
      expected: "duplicate node id"
    },
    {
      name: "missing dependency",
      mutate(manifest) {
        node(manifest, "parse-extract").dependencies = ["missing-node"];
      },
      expected: "depends on missing node missing-node"
    },
    {
      name: "dependency cycle",
      mutate(manifest) {
        node(manifest, "fetch-source-health").dependencies = ["publish-cleanup"];
      },
      expected: "dependency cycle detected"
    },
    {
      name: "missing schema ref",
      mutate(manifest) {
        node(manifest, "score").schemas.output = "schemas/missing-dag-output.schema.json";
      },
      expected: "node score.schemas.output failed to read JSON"
    },
    {
      name: "missing schema fragment",
      mutate(manifest) {
        node(manifest, "score").schemas.output = "schemas/daily-codex-dag.schema.json#/$defs/doesNotExist";
      },
      expected: "node score.schemas.output references missing schema fragment /$defs/doesNotExist"
    },
    {
      name: "prototype schema fragment",
      mutate(manifest) {
        node(manifest, "score").schemas.output = "schemas/daily-codex-dag.schema.json#/__proto__";
      },
      expected: "node score.schemas.output references missing schema fragment /__proto__"
    },
    {
      name: "missing fixture ref",
      mutate(manifest) {
        node(manifest, "score").fixture = "tests/fixtures/daily-codex-dag/missing.json";
      },
      expected: "node score.fixture missing"
    },
    {
      name: "unsafe absolute artifact path",
      mutate(manifest) {
        node(manifest, "score").outputs[0].path = "C:/temp/score.json";
      },
      expected: "must be a safe repo-relative template path"
    },
    {
      name: "unsafe parent artifact path",
      mutate(manifest) {
        node(manifest, "score").outputs[0].path = "../score.json";
      },
      expected: "must be a safe repo-relative template path"
    },
    {
      name: "public output marked private",
      mutate(manifest) {
        node(manifest, "persist-article-db").public_artifact = false;
      },
      expected: "has public_artifact false but writes docs/articles.json"
    },
    {
      name: "mapped node without resilience policy mode",
      mutate(manifest) {
        node(manifest, "admit-reject").failure_policy.mode = "planned";
      },
      expected: "mapped node admit-reject must use failure_policy.mode resilience_policy_ref"
    },
    {
      name: "mapped node without resilience policy ref",
      mutate(manifest) {
        node(manifest, "admit-reject").resilience_policy_ref = "";
      },
      expected: "node admit-reject uses resilience_policy_ref mode without resilience_policy_ref"
    },
    {
      name: "missing resilience policy stage",
      mutate(manifest) {
        node(manifest, "admit-reject").resilience_policy_ref = "missing_policy_stage";
      },
      expected: "references missing resilience policy stage missing_policy_stage"
    },
    {
      name: "planned node missing resilience policy stage",
      mutate(manifest) {
        node(manifest, "fetch-source-health").resilience_policy_ref = "missing_policy_stage";
      },
      expected: "references missing resilience policy stage missing_policy_stage"
    },
    {
      name: "fanout without fanout config",
      mutate(manifest) {
        delete node(manifest, "per-item-summary").fanout;
      },
      expected: "fanout node per-item-summary requires fanout config"
    },
    {
      name: "fanout references missing source",
      mutate(manifest) {
        node(manifest, "per-item-summary").fanout.from = "missing-fanout-source";
      },
      expected: "fanout node per-item-summary references missing source missing-fanout-source"
    },
    {
      name: "non fanout declares fanout config",
      mutate(manifest) {
        node(manifest, "score").fanout = { from: "admit-reject", item_id_field: "accepted_items[].id" };
      },
      expected: "non-fanout node score cannot declare fanout config"
    },
    {
      name: "barrier without wait config",
      mutate(manifest) {
        delete node(manifest, "quality-audit").barrier;
      },
      expected: "barrier node quality-audit requires barrier config"
    },
    {
      name: "barrier waits for missing source",
      mutate(manifest) {
        node(manifest, "quality-audit").barrier.wait_for = ["missing-barrier-source"];
      },
      expected: "barrier node quality-audit waits for missing node missing-barrier-source"
    },
    {
      name: "non barrier declares barrier config",
      mutate(manifest) {
        node(manifest, "score").barrier = { wait_for: ["admit-reject"] };
      },
      expected: "non-barrier node score cannot declare barrier config"
    },
    {
      name: "publish without public quality gate",
      mutate(manifest) {
        node(manifest, "publish-cleanup").dependencies = [];
      },
      expected: "publish-cleanup must transitively depend on quality-audit"
    },
    {
      name: "input without dependencies",
      mutate(manifest) {
        node(manifest, "parse-extract").dependencies = [];
      },
      expected: "node parse-extract declares inputs but has no dependency outputs to read from"
    },
    {
      name: "input missing upstream output",
      mutate(manifest) {
        node(manifest, "score").inputs[0].path = ".tmp/daily-codex-pipeline/{report_date}/artifacts/missing-scored-input.json";
      },
      expected: "node score input .tmp/daily-codex-pipeline/{report_date}/artifacts/missing-scored-input.json is not produced by any direct or transitive dependency output"
    },
    {
      name: "input from non ancestor sibling",
      mutate(manifest) {
        node(manifest, "build-cards-page").dependencies = ["assemble-daily-edition"];
      },
      expected: "node build-cards-page input docs/articles.json is not produced by any direct or transitive dependency output"
    },
    {
      name: "self output does not satisfy input lineage",
      mutate(manifest) {
        const target = node(manifest, "score");
        target.inputs[0].path = target.outputs[0].path;
      },
      expected: "node score input .tmp/daily-codex-pipeline/{report_date}/artifacts/scored-candidates.json is not produced by any direct or transitive dependency output"
    },
    {
      name: "fanout input template is exact",
      mutate(manifest) {
        node(manifest, "quality-audit").inputs[0].path = ".tmp/daily-codex-pipeline/{report_date}/artifacts/summaries/{candidate_id}.json";
      },
      expected: "node quality-audit input .tmp/daily-codex-pipeline/{report_date}/artifacts/summaries/{candidate_id}.json is not produced by any direct or transitive dependency output"
    },
    {
      name: "input path cannot prefix match upstream output",
      mutate(manifest) {
        node(manifest, "score").inputs[0].path = ".tmp/daily-codex-pipeline/{report_date}/artifacts/classified-candidates.json.backup";
      },
      expected: "node score input .tmp/daily-codex-pipeline/{report_date}/artifacts/classified-candidates.json.backup is not produced by any direct or transitive dependency output"
    },
    {
      name: "input path cannot be prefix of upstream output",
      mutate(manifest) {
        node(manifest, "score").inputs[0].path = ".tmp/daily-codex-pipeline/{report_date}/artifacts/classified-candidates";
      },
      expected: "node score input .tmp/daily-codex-pipeline/{report_date}/artifacts/classified-candidates is not produced by any direct or transitive dependency output"
    },
    {
      name: "optional input still needs upstream output",
      mutate(manifest) {
        node(manifest, "score").inputs.push({
          path: ".tmp/daily-codex-pipeline/{report_date}/artifacts/optional-sidecar.json",
          required: false
        });
      },
      expected: "node score input .tmp/daily-codex-pipeline/{report_date}/artifacts/optional-sidecar.json is not produced by any direct or transitive dependency output"
    }
  ];

  for (const item of cases) {
    const manifest = await loadManifest();
    item.mutate(manifest);
    const result = await validateDailyCodexDag({ rootDir, manifest });
    assert.equal(result.ok, false, item.name);
    assert(
      result.failures.some((failure) => failure.includes(item.expected)),
      `${item.name}\nexpected: ${item.expected}\nactual:\n${result.failures.join("\n")}`
    );
  }
});

async function loadManifest() {
  return JSON.parse(await fs.readFile(manifestPath, "utf8"));
}

async function loadDryRunSummaryFixture() {
  return JSON.parse(await fs.readFile(dryRunSummaryFixturePath, "utf8"));
}

async function assertValidDagRunSummary(value) {
  await assertValidDagRunSummarySchemaOnly(value);
  const semanticResult = validateDailyCodexDagDryRunSummary(value);
  if (!semanticResult.ok) {
    assert.fail(`daily codex DAG run summary should pass semantic validation:\n${semanticResult.failures.join("\n")}`);
  }
}

async function assertValidDagRunSummarySchemaOnly(value) {
  const validate = await getDagRunSummaryValidator();
  if (!validate(value)) {
    assert.fail(`daily codex DAG run summary should match schema:\n${formatAjvErrors(validate.errors)}`);
  }
}

async function assertInvalidDagRunSummary(value) {
  const validate = await getDagRunSummaryValidator();
  if (validate(value)) {
    assert.fail("daily codex DAG run summary schema accepted an invalid envelope");
  }
}

function assertInvalidSemanticDagRunSummary(value, expectedFailure, label) {
  const result = validateDailyCodexDagDryRunSummary(value);
  if (result.ok) {
    assert.fail(`daily codex DAG run summary semantic validator accepted invalid case: ${label}`);
  }
  assert(
    result.failures.some((failure) => failure.includes(expectedFailure)),
    `${label} failures:\n${result.failures.join("\n")}`
  );
}

async function getDagRunSummaryValidator() {
  if (!dagRunSummaryValidator) {
    const schema = JSON.parse(await fs.readFile(dagRunSchemaPath, "utf8"));
    const ajv = new Ajv({ allErrors: true, strict: false });
    for (const format of ["date", "date-time", "uri", "uri-reference", "email"]) {
      ajv.addFormat(format, true);
    }
    dagRunSummaryValidator = ajv.compile(schema);
  }
  return dagRunSummaryValidator;
}

function formatAjvErrors(errors = []) {
  return errors
    .map((error) => `${error.instancePath || "/"} ${error.message}`)
    .join("\n");
}

function structuredCloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function node(manifest, id) {
  const found = manifest.nodes.find((item) => item.id === id);
  assert(found, `missing fixture node ${id}`);
  return found;
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function forbiddenPathSnapshot() {
  return {
    tmp: await pathSnapshot(path.join(rootDir, ".tmp")),
    docsReports: await pathSnapshot(path.join(rootDir, "docs", "reports")),
    reportsData: await pathSnapshot(path.join(rootDir, "reports-data"))
  };
}

async function pathSnapshot(filePath) {
  try {
    const stat = await fs.lstat(filePath);
    if (!stat.isDirectory()) {
      return { exists: true, kind: "file", entries: [] };
    }
    const entries = await recursiveEntries(filePath);
    return { exists: true, kind: "dir", entries };
  } catch {
    return { exists: false, kind: "", entries: [] };
  }
}

async function recursiveEntries(baseDir, prefix = "") {
  const entries = await fs.readdir(path.join(baseDir, prefix), { withFileTypes: true });
  const results = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = path.join(prefix, entry.name);
    const normalizedPath = relativePath.split(path.sep).join("/");
    results.push(normalizedPath);
    if (entry.isDirectory()) {
      results.push(...await recursiveEntries(baseDir, relativePath));
    }
  }
  return results;
}

function runDagCli(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [dagCliPath, ...args], {
      cwd: options.cwd || rootDir,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}
