import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Ajv from "ajv/dist/2020.js";
import {
  createDailyCodexDagContractRun,
  createDailyCodexDagNodeResult,
  createDailyCodexDagDryRun,
  createDailyCodexDagPlan,
  resolveDailyCodexDagCommandRuntimePlan,
  validateDailyCodexDag,
  validateDailyCodexDagNodeResult,
  validateDailyCodexDagRunSummary,
  validateDailyCodexDagDryRunSummary
} from "../src/daily-codex-dag.js";

const rootDir = process.cwd();
const manifestPath = path.join(rootDir, "config", "daily-codex-dag.json");
const dagCliPath = path.join(rootDir, "scripts", "run-daily-codex-dag.mjs");
const dagSchemaPath = path.join(rootDir, "schemas", "daily-codex-dag.schema.json");
const dagRunSchemaPath = path.join(rootDir, "schemas", "daily-codex-dag-run.schema.json");
const dagNodeResultSchemaPath = path.join(rootDir, "schemas", "daily-codex-dag-node-result.schema.json");
const dryRunSummaryFixturePath = path.join(rootDir, "tests", "fixtures", "daily-codex-dag", "dry-run-summary.json");
const nodeResultSuccessFixturePath = path.join(rootDir, "tests", "fixtures", "daily-codex-dag", "node-result-success.json");
const fixedNow = "2026-07-03T08:00:00.000Z";
const shellishCommandTokens = ["&&", "||", ";", "|", "&", "`cmd`", "<", ">", "line\rbreak", "line\nbreak", "$(whoami)"];
let dagManifestValidator = null;
let dagRunSummaryValidator = null;
let dagNodeResultValidator = null;

test("daily codex DAG manifest validates target node contract", async () => {
  const result = await validateDailyCodexDag({ rootDir });
  const manifest = await loadManifest();

  assert.equal(result.ok, true, result.failures.join("\n"));
  assert.equal(result.node_ids.length, 16);
  assert(result.node_ids.includes("fetch-source-health"));
  assert(result.node_ids.includes("publish-cleanup"));
  assert(result.checked_files.some((file) => file.endsWith("config/daily-codex-dag.json")));
  assert(result.checked_files.some((file) => file.endsWith("config/daily-resilience-policy.json")));
  assert.equal(
    manifest.nodes.some((item) => Object.hasOwn(item.execution_contract || {}, "node_execution_spec")),
    false,
    "production manifest must not carry node_execution_spec before executor migration"
  );
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
    "execution_contract",
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
  assert.deepEqual(score.execution_contract, {
    readiness: "planned_only",
    summary: "Planned-only DAG node; contract-run validates declared shape but must not execute this node."
  });
  const admitReject = plan.nodes.find((item) => item.id === "admit-reject");
  assert.equal(admitReject.plan_status, "mapped");
  assert.deepEqual(admitReject.execution_contract, {
    readiness: "legacy_mapped",
    summary: "Legacy mapped runner stage; contract-run validates declared shape but this is not standalone node execution."
  });
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

test("daily codex DAG future node execution spec is schema-recognized but still disabled", async () => {
  const manifest = await loadManifest();
  const score = node(manifest, "score");
  score.execution_contract = {
    readiness: "node_executable",
    summary: "Synthetic future executable node for schema-only coverage.",
    node_execution_spec: buildFutureNodeExecutionSpec(score)
  };

  await assertValidDagManifestSchemaOnly(manifest);

  const result = await validateDailyCodexDag({ rootDir, manifest });
  assert.equal(result.ok, false);
  assert(
    result.failures.some((failure) => failure.includes("node score execution_contract.readiness node_executable is reserved until executor migration enables standalone node execution")),
    result.failures.join("\n")
  );
});

test("daily codex DAG future node execution spec validates executor invocation pairing", async () => {
  const codexManifest = await loadManifest();
  const codexNode = node(codexManifest, "classify-tag-entity");
  codexNode.execution_contract = {
    readiness: "node_executable",
    summary: "Synthetic future Codex CLI node for schema-only coverage.",
    node_execution_spec: buildFutureNodeExecutionSpec(codexNode, {
      executor: "codex_cli",
      invocation: {
        kind: "codex_cli",
        prompt_template: "prompts/future-dag-node.md",
        args: ["--node", codexNode.id]
      }
    })
  };
  await assertValidDagManifestSchemaOnly(codexManifest);

  const mismatchedManifest = await loadManifest();
  const score = node(mismatchedManifest, "score");
  score.execution_contract = {
    readiness: "node_executable",
    summary: "Synthetic mismatched execution spec.",
    node_execution_spec: buildFutureNodeExecutionSpec(score, {
      executor: "command",
      invocation: {
        kind: "codex_cli",
        prompt_template: "prompts/future-dag-node.md",
        args: ["--node", score.id]
      }
    })
  };

  await assertInvalidDagManifestSchemaOnly(mismatchedManifest);
});

test("daily codex DAG future node execution preflight accepts safe paths but keeps execution disabled", async () => {
  for (const cwd of [".", "scripts"]) {
    const manifest = await loadManifest();
    const codexNode = node(manifest, "classify-tag-entity");
    codexNode.execution_contract = {
      readiness: "node_executable",
      summary: "Synthetic future Codex CLI node for preflight coverage.",
      node_execution_spec: buildFutureNodeExecutionSpec(codexNode, {
        executor: "codex_cli",
        cwd,
        invocation: {
          kind: "codex_cli",
          prompt_template: "prompts/ai-daily/modules/base.md",
          args: ["--node", codexNode.id]
        }
      })
    };

    const result = await validateDailyCodexDag({ rootDir, manifest });
    assert.equal(result.ok, false);
    assert(
      result.failures.some((failure) => failure.includes("node classify-tag-entity execution_contract.readiness node_executable is reserved until executor migration enables standalone node execution")),
      result.failures.join("\n")
    );
    assert(
      !result.failures.some((failure) => failure.includes("node_execution_spec.cwd") || failure.includes("node_execution_spec.invocation.prompt_template")),
      result.failures.join("\n")
    );
    assert(
      result.checked_files.some((filePath) => filePath.endsWith("prompts/ai-daily/modules/base.md")),
      result.checked_files.join("\n")
    );
  }
});

test("daily codex DAG future node execution runtime policy accepts valid synthetic specs but keeps execution disabled", async () => {
  const cases = [
    {
      nodeId: "score",
      specOverrides: {}
    },
    {
      nodeId: "persist-article-db",
      specOverrides: {
        sandbox: {
          filesystem: "public_artifact_write",
          network: "disabled",
          secrets: "none"
        }
      }
    }
  ];

  for (const item of cases) {
    const manifest = await loadManifest();
    const target = node(manifest, item.nodeId);
    target.execution_contract = {
      readiness: "node_executable",
      summary: "Synthetic future executable node for runtime-policy coverage.",
      node_execution_spec: buildFutureNodeExecutionSpec(target, item.specOverrides)
    };

    const result = await validateDailyCodexDag({ rootDir, manifest });
    assert.equal(result.ok, false);
    assert.deepEqual(result.failures, [
      `config/daily-codex-dag.json: node ${item.nodeId} execution_contract.readiness node_executable is reserved until executor migration enables standalone node execution.`
    ]);
  }
});

test("daily codex DAG command runtime plan resolves controlled node runtime without execution", async () => {
  const manifest = await loadManifest();
  const score = node(manifest, "score");
  const spec = buildFutureNodeExecutionSpec(score, {
    cwd: "scripts",
    invocation: {
      kind: "command",
      argv: ["node", "scripts/validate-daily-codex-dag.mjs", "--node", score.id]
    }
  });

  const result = resolveDailyCodexDagCommandRuntimePlan({
    rootDir,
    node: score,
    spec,
    nodeExecutablePath: process.execPath
  });

  const expectedScriptPath = path.resolve(rootDir, "scripts", "validate-daily-codex-dag.mjs");
  assert.equal(result.ok, true, result.failures.join("\n"));
  assert.deepEqual(result.plan, {
    runner: "node",
    command: process.execPath,
    args: [expectedScriptPath, "--node", score.id],
    cwd: path.resolve(rootDir, "scripts"),
    shell: false,
    script_path: expectedScriptPath,
    argv_tail: ["--node", score.id]
  });
  assert.notEqual(result.plan.script_path, path.resolve(rootDir, "scripts", "scripts", "validate-daily-codex-dag.mjs"));
});

test("daily codex DAG command runtime plan rejects unsafe or unsupported command inputs", async () => {
  const manifest = await loadManifest();
  const score = node(manifest, "score");
  const baseSpec = buildFutureNodeExecutionSpec(score);
  const cases = [
    {
      name: "mismatched executor",
      overrides: {
        executor: "codex_cli",
        invocation: {
          kind: "command",
          argv: ["node", "scripts/validate-daily-codex-dag.mjs", score.id]
        }
      },
      expected: "executor must be command"
    },
    {
      name: "unsupported runner",
      overrides: {
        invocation: {
          kind: "command",
          argv: ["npm", "run", "future-node"]
        }
      },
      expected: "invocation.argv[0] must be node"
    },
    {
      name: "shell-ish token",
      overrides: {
        invocation: {
          kind: "command",
          argv: ["node", "scripts/validate-daily-codex-dag.mjs", "$(whoami)"]
        }
      },
      expected: "entries must not contain shell control operators"
    },
    {
      name: "unsafe script path",
      overrides: {
        invocation: {
          kind: "command",
          argv: ["node", "../scripts/validate-daily-codex-dag.mjs"]
        }
      },
      expected: "invocation.argv[1] must be a repo-relative Node script path"
    },
    {
      name: "non-scripts path",
      overrides: {
        invocation: {
          kind: "command",
          argv: ["node", "src/daily-codex-dag.js"]
        }
      },
      expected: "invocation.argv[1] must be under scripts/"
    },
    {
      name: "invalid script extension",
      overrides: {
        invocation: {
          kind: "command",
          argv: ["node", "scripts/future-dag-node.txt"]
        }
      },
      expected: "invocation.argv[1] must end with .mjs or .js"
    },
    {
      name: "unsafe cwd",
      overrides: {
        cwd: "../outside"
      },
      expected: 'cwd must be "." or a safe repo-relative path'
    }
  ];

  for (const item of cases) {
    const result = resolveDailyCodexDagCommandRuntimePlan({
      rootDir,
      node: score,
      spec: {
        ...baseSpec,
        ...item.overrides
      }
    });
    assert.equal(result.ok, false, item.name);
    assert.equal(result.plan, null, item.name);
    assert(
      result.failures.some((failure) => failure.includes(item.expected)),
      `${item.name}\nexpected: ${item.expected}\nactual:\n${result.failures.join("\n")}`
    );
  }

  for (const nodeExecutablePath of ["node", ""]) {
    const invalidRuntime = resolveDailyCodexDagCommandRuntimePlan({
      rootDir,
      node: score,
      spec: baseSpec,
      nodeExecutablePath
    });
    assert.equal(invalidRuntime.ok, false);
    assert.equal(invalidRuntime.plan, null);
    assert(
      invalidRuntime.failures.some((failure) => failure.includes("nodeExecutablePath must be an absolute path")),
      invalidRuntime.failures.join("\n")
    );
  }
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
  assert.equal(Object.hasOwn(first, "node_runtime_plans"), false);
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
      name: "planned node readiness mismatch",
      mutate: (value) => {
        value.plan.nodes[0].execution_contract.readiness = "legacy_mapped";
      },
      failure: "with execution_status planned must use execution_contract.readiness planned_only"
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

test("daily codex DAG contract-run helper emits validated skipped node results", async () => {
  const manifest = await loadManifest();
  const result = await createDailyCodexDagContractRun({
    rootDir,
    manifest,
    reportDate: "2026-07-03",
    now: fixedNow
  });

  assert.equal(result.ok, true, result.failures.join("\n"));
  assert.equal(result.mode, "daily_codex_dag_contract_run");
  assert.equal(result.report_date, "2026-07-03");
  assert.equal(result.generated_at, fixedNow);
  assert.equal(result.run_id, "daily-codex-dag:2026-07-03:contract-run");
  assert.equal(result.run.final_status, "contract_validated_only");
  assert.equal(result.plan.node_count, 16);
  assert.equal(result.node_results.length, result.plan.node_count);
  assert.equal(result.node_result_validation.ok, true, result.node_result_validation.failures.join("\n"));
  assert.equal(result.node_result_validation.checked_results, result.node_results.length);
  assert.deepEqual(result.run.planned_nodes, result.plan.nodes.map((item) => item.id));
  assert.deepEqual(result.run.contract_validated_nodes, result.run.planned_nodes);
  assert.deepEqual(result.run.skipped_nodes, result.run.planned_nodes);
  assert.deepEqual(result.run.blocked_nodes, []);
  assert(!Object.prototype.hasOwnProperty.call(result.run, "completed_nodes"));
  assert.equal(Object.hasOwn(result, "node_runtime_plans"), false);
  assert.deepEqual(result.executed_commands, []);
  assert.deepEqual(result.codex_invocations, []);
  await assertValidDagRunSummary(result);
  assert.equal(result.plan.nodes.find((item) => item.id === "score").execution_contract.readiness, "planned_only");
  assert.equal(result.plan.nodes.find((item) => item.id === "admit-reject").execution_contract.readiness, "legacy_mapped");

  const resultByNodeId = new Map(result.node_results.map((item) => [item.node_id, item]));
  for (const [index, nodeResult] of result.node_results.entries()) {
    const planNode = result.plan.nodes[index];
    assert.equal(nodeResult.node_id, planNode.id);
    assert.equal(nodeResult.node_kind, planNode.kind);
    assert.equal(nodeResult.result_scope, "node");
    assert.equal(nodeResult.status, "skipped");
    assert.equal(nodeResult.downstream_disposition, "continue");
    assert.equal(nodeResult.started_at, null);
    assert.equal(nodeResult.finished_at, null);
    assert.equal(nodeResult.attempts_started, 0);
    assert.deepEqual(nodeResult.resolved_inputs, []);
    assert.deepEqual(nodeResult.resolved_outputs, []);
    assert.equal(nodeResult.fanout, null);
    assert.equal(nodeResult.barrier, null);
    assert(nodeResult.warnings.some((warning) => warning.code === "contract_only_not_executed"));
    await assertValidDagNodeResult(nodeResult);

    assert.equal(nodeResult.dependency_results.length, planNode.dependencies.length);
    for (const [dependencyIndex, dependencyId] of planNode.dependencies.entries()) {
      const dependencyResult = resultByNodeId.get(dependencyId);
      const dependencySnapshot = nodeResult.dependency_results[dependencyIndex];
      assert.equal(dependencySnapshot.node_id, dependencyId);
      assert.equal(dependencySnapshot.execution_id, dependencyResult.execution_id);
      assert.equal(dependencySnapshot.status, "skipped");
      assert.equal(dependencySnapshot.downstream_disposition, "continue");
      assert.equal(dependencySnapshot.required, true);
    }
  }

  const perItemSummary = resultByNodeId.get("per-item-summary");
  const qualityAudit = resultByNodeId.get("quality-audit");
  assert.equal(perItemSummary.node_kind, "fanout");
  assert.equal(perItemSummary.result_scope, "node");
  assert.equal(perItemSummary.fanout, null);
  assert.equal(qualityAudit.node_kind, "barrier");
  assert.equal(qualityAudit.result_scope, "node");
  assert.equal(qualityAudit.barrier, null);
  assert.deepEqual(result.fanout_expansions, [
    {
      node_id: "per-item-summary",
      kind: "fanout",
      status: "not_expanded",
      item_count: null
    },
    {
      node_id: "quality-audit",
      kind: "barrier",
      status: "not_expanded",
      item_count: null
    }
  ]);
});

test("daily codex DAG contract-run semantic validator rejects misleading execution evidence", async () => {
  const base = await createDailyCodexDagContractRun({
    rootDir,
    manifest: await loadManifest(),
    reportDate: "2026-07-03",
    now: fixedNow
  });
  assert.equal(base.ok, true, base.failures.join("\n"));

  const cases = [
    {
      name: "completed nodes are not allowed",
      mutate(value) {
        value.run.completed_nodes = [value.plan.nodes[0].id];
      },
      failure: "additional field completed_nodes"
    },
    {
      name: "executed commands are not allowed",
      mutate(value) {
        value.executed_commands = [{ command: "npm run build" }];
      },
      failure: "executed_commands must be empty"
    },
    {
      name: "node result success is not allowed",
      mutate(value) {
        value.node_results[0].status = "success";
      },
      failure: "status must be skipped"
    },
    {
      name: "fanout item result is not allowed",
      mutate(value) {
        value.node_results.find((item) => item.node_id === "per-item-summary").result_scope = "fanout_item";
      },
      failure: "result_scope must be node"
    },
    {
      name: "dependency must reference skipped continue evidence",
      mutate(value) {
        const score = value.node_results.find((item) => item.node_id === "score");
        score.dependency_results[0].status = "success";
      },
      failure: "dependency_results must reference skipped dependencies"
    },
    {
      name: "fanout expansions must include dynamic nodes",
      mutate(value) {
        value.fanout_expansions = [];
      },
      failure: "fanout_expansions must list fanout/barrier plan nodes"
    },
    {
      name: "node executable readiness is not allowed",
      mutate(value) {
        value.plan.nodes.find((item) => item.id === "admit-reject").execution_contract.readiness = "node_executable";
      },
      failure: "execution_contract.readiness node_executable is reserved until executor migration enables standalone node execution"
    }
  ];

  for (const item of cases) {
    const value = structuredCloneJson(base);
    item.mutate(value);
    assertInvalidSemanticDagRunSummary(value, item.failure, item.name);
  }
});

test("daily codex DAG contract-run schema rejects execution-like node result evidence", async () => {
  const base = await createDailyCodexDagContractRun({
    rootDir,
    manifest: await loadManifest(),
    reportDate: "2026-07-03",
    now: fixedNow
  });
  assert.equal(base.ok, true, base.failures.join("\n"));

  const cases = [
    {
      name: "missing started_at",
      mutate(value) {
        delete value.node_results[0].started_at;
      }
    },
    {
      name: "dependency success",
      mutate(value) {
        const score = value.node_results.find((item) => item.node_id === "score");
        score.dependency_results[0].status = "success";
      }
    },
    {
      name: "fanout metadata",
      mutate(value) {
        const fanoutNode = value.node_results.find((item) => item.node_id === "per-item-summary");
        fanoutNode.fanout = { item_id: "item-001", fanout_key: "item-001" };
      }
    },
    {
      name: "execution timestamp",
      mutate(value) {
        value.node_results[0].started_at = fixedNow;
      }
    },
    {
      name: "extra node result field",
      mutate(value) {
        value.node_results[0].stdout = "leaked execution log";
      }
    }
  ];

  for (const item of cases) {
    const value = structuredCloneJson(base);
    item.mutate(value);
    await assertInvalidDagRunSummary(value);
  }
});

test("daily codex DAG contract-run helper returns a standard failure envelope when node result validation fails", async () => {
  const result = await createDailyCodexDagContractRun({
    rootDir,
    manifest: await loadManifest(),
    reportDate: "2026-07-03",
    runId: "bad run id",
    now: fixedNow
  });

  assert.equal(result.ok, false);
  assert.equal(result.validation, null);
  assert.equal(result.plan, null);
  assert.equal(result.run, null);
  assert(result.failures.some((failure) => failure.includes("run_id must be a stable identifier")));
  await assertValidDagRunSummary(result);
});

test("daily codex DAG node result helper and fixture validate executable result contract", async () => {
  const fixture = await loadNodeResultSuccessFixture();
  await assertValidDagNodeResult(fixture);

  const options = {
    reportDate: fixture.report_date,
    runId: fixture.run_id,
    manifestName: fixture.manifest_name,
    manifestSchemaVersion: fixture.manifest_schema_version,
    nodeId: fixture.node_id,
    nodeKind: fixture.node_kind,
    runnerStageRef: fixture.runner_stage_ref,
    resultScope: fixture.result_scope,
    status: fixture.status,
    startedAt: fixture.started_at,
    finishedAt: fixture.finished_at,
    maxAttempts: fixture.max_attempts,
    attemptsExhausted: fixture.attempts_exhausted,
    dependencyResults: fixture.dependency_results,
    declaredInputs: fixture.declared_inputs,
    declaredOutputs: fixture.declared_outputs,
    resolvedInputs: fixture.resolved_inputs,
    resolvedOutputs: fixture.resolved_outputs,
    failures: fixture.failures,
    warnings: fixture.warnings,
    audit: fixture.audit
  };
  const originalOptions = structuredCloneJson(options);
  const helperResult = createDailyCodexDagNodeResult(options);

  assert.deepEqual(helperResult, fixture);
  assert.deepEqual(options, originalOptions, "node result helper must not mutate input options");
  await assertValidDagNodeResult(helperResult);
});

test("daily codex DAG node result contract supports failure, blocked, skipped, fanout, and barrier results", async () => {
  const failure = buildNodeResult({
    status: "failure",
    attemptsStarted: 2,
    maxAttempts: 2,
    attemptsExhausted: true,
    downstreamDisposition: "block",
    failures: [nodeResultIssue("score_failed", "Scoring command failed.", "runner", false)],
    resolvedOutputs: []
  });
  await assertValidDagNodeResult(failure);

  const blocked = buildNodeResult({
    status: "blocked",
    startedAt: null,
    finishedAt: null,
    dependencyResults: [{
      node_id: "classify-tag-entity",
      execution_id: "daily-codex-dag:2026-07-03:test:classify-tag-entity:node",
      status: "failure",
      required: true,
      downstream_disposition: "block"
    }],
    failures: [nodeResultIssue("dependency_blocked", "Required dependency failed.", "dependency", false)],
    resolvedOutputs: []
  });
  await assertValidDagNodeResult(blocked);

  const skipped = buildNodeResult({
    status: "skipped",
    startedAt: null,
    finishedAt: null,
    declaredInputs: [],
    declaredOutputs: [],
    resolvedInputs: [],
    resolvedOutputs: [],
    dependencyResults: [],
    warnings: [nodeResultIssue("skip_no_items", "No admitted items require this node.", "policy", false)]
  });
  await assertValidDagNodeResult(skipped);

  const fanoutItem = buildNodeResult({
    nodeId: "per-item-summary",
    nodeKind: "fanout",
    runnerStageRef: "summarize:*",
    resultScope: "fanout_item",
    executionId: "daily-codex-dag:2026-07-03:test:per-item-summary:fanout_item:item-001",
    fanout: {
      item_id: "item-001",
      fanout_key: "item-001"
    },
    declaredInputs: [{
      path: ".tmp/daily-codex-pipeline/2026-07-03/artifacts/admission.json",
      required: true
    }],
    declaredOutputs: [{
      path: ".tmp/daily-codex-pipeline/2026-07-03/artifacts/summaries/item-001.json",
      required: true
    }],
    resolvedInputs: [resolvedArtifact(".tmp/daily-codex-pipeline/2026-07-03/artifacts/admission.json")],
    resolvedOutputs: [resolvedArtifact(".tmp/daily-codex-pipeline/2026-07-03/artifacts/summaries/item-001.json")],
    audit: {
      parallel_group: "item-lanes",
      resilience_policy_ref: "quality_review",
      owner_path_scope: "internal_workdir",
      public_artifact: false,
      validator_version: "daily-codex-dag-node-result-v1"
    }
  });
  await assertValidDagNodeResult(fanoutItem);

  const expectedFanoutExecutions = [
    "daily-codex-dag:2026-07-03:test:per-item-summary:fanout_item:item-001",
    "daily-codex-dag:2026-07-03:test:per-item-summary:fanout_item:item-002"
  ];
  const barrier = buildNodeResult({
    nodeId: "quality-audit",
    nodeKind: "barrier",
    runnerStageRef: "quality-review",
    resultScope: "barrier",
    executionId: "daily-codex-dag:2026-07-03:test:quality-audit:barrier",
    dependencyResults: expectedFanoutExecutions.map((executionId) => ({
      node_id: "per-item-summary",
      execution_id: executionId,
      status: "success",
      required: true,
      downstream_disposition: "continue"
    })),
    declaredInputs: expectedFanoutExecutions.map((_, index) => ({
      path: `.tmp/daily-codex-pipeline/2026-07-03/artifacts/summaries/item-00${index + 1}.json`,
      required: true
    })),
    declaredOutputs: [{
      path: ".tmp/daily-codex-pipeline/2026-07-03/artifacts/quality-audit.json",
      required: true
    }],
    resolvedInputs: expectedFanoutExecutions.map((_, index) => resolvedArtifact(`.tmp/daily-codex-pipeline/2026-07-03/artifacts/summaries/item-00${index + 1}.json`)),
    resolvedOutputs: [resolvedArtifact(".tmp/daily-codex-pipeline/2026-07-03/artifacts/quality-audit.json")],
    barrier: {
      expected_execution_ids: expectedFanoutExecutions,
      observed_execution_ids: expectedFanoutExecutions,
      missing_execution_ids: []
    },
    audit: {
      parallel_group: "serial",
      resilience_policy_ref: "quality_review",
      owner_path_scope: "internal_workdir",
      public_artifact: false,
      validator_version: "daily-codex-dag-node-result-v1"
    }
  });
  await assertValidDagNodeResult(barrier);
});

test("daily codex DAG node result schema rejects invalid envelopes", async () => {
  const fixture = await loadNodeResultSuccessFixture();
  const additionalTopLevel = structuredCloneJson(fixture);
  additionalTopLevel.prompt = "must not be stored in node results";
  await assertInvalidDagNodeResult(additionalTopLevel);

  const looseAudit = structuredCloneJson(fixture);
  looseAudit.audit.stdout = "must not be stored in audit metadata";
  await assertInvalidDagNodeResult(looseAudit);

  const stringFailure = structuredCloneJson(fixture);
  stringFailure.failures = ["plain strings are not executable result issues"];
  await assertInvalidDagNodeResult(stringFailure);
});

test("daily codex DAG node result semantic validator rejects schema-valid contradictions", async () => {
  const fixture = await loadNodeResultSuccessFixture();
  const barrierBase = buildNodeResult({
    nodeId: "quality-audit",
    nodeKind: "barrier",
    runnerStageRef: "quality-review",
    resultScope: "barrier",
    executionId: "daily-codex-dag:2026-07-03:test:quality-audit:barrier",
    dependencyResults: [
      "fanout:item-001",
      "fanout:item-002"
    ].map((executionId) => ({
      node_id: "per-item-summary",
      execution_id: executionId,
      status: "success",
      required: true,
      downstream_disposition: "continue"
    })),
    barrier: {
      expected_execution_ids: ["fanout:item-001", "fanout:item-002"],
      observed_execution_ids: ["fanout:item-001"],
      missing_execution_ids: ["fanout:item-002"]
    }
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
      name: "non-canonical started_at",
      mutate: (value) => {
        value.started_at = "2026-07-03T16:00:00+08:00";
      },
      failure: "started_at must be a canonical UTC"
    },
    {
      name: "duration mismatch",
      mutate: (value) => {
        value.duration_ms += 1;
      },
      failure: "duration_ms must equal finished_at - started_at"
    },
    {
      name: "success has failures",
      mutate: (value) => {
        value.failures = [nodeResultIssue("unexpected_failure", "Unexpected failure.", "validator", false)];
      },
      failure: "success failures must be empty"
    },
    {
      name: "success attempts exhausted",
      mutate: (value) => {
        value.attempts_exhausted = true;
      },
      failure: "success attempts_exhausted must be false"
    },
    {
      name: "failure is not exhausted",
      mutate: (value) => {
        value.status = "failure";
        value.downstream_disposition = "block";
        value.failures = [nodeResultIssue("failed", "Node failed.", "runner", true)];
        value.attempts_exhausted = false;
      },
      failure: "failure attempts_exhausted must be true"
    },
    {
      name: "blocked has execution timestamps",
      mutate: (value) => {
        value.status = "blocked";
        value.downstream_disposition = "block";
        value.failures = [nodeResultIssue("blocked", "Dependency blocked.", "dependency", false)];
        value.attempts_started = 0;
      },
      failure: "blocked must not include execution timestamps"
    },
    {
      name: "blocked attempts exhausted",
      mutate: (value) => {
        value.status = "blocked";
        value.downstream_disposition = "block";
        value.started_at = null;
        value.finished_at = null;
        value.duration_ms = 0;
        value.attempts_started = 0;
        value.attempts_exhausted = true;
        value.failures = [nodeResultIssue("blocked", "Dependency blocked.", "dependency", false)];
      },
      failure: "blocked attempts_exhausted must be false"
    },
    {
      name: "skipped blocks downstream",
      mutate: (value) => {
        value.status = "skipped";
        value.downstream_disposition = "block";
        value.started_at = null;
        value.finished_at = null;
        value.duration_ms = 0;
        value.attempts_started = 0;
        value.warnings = [nodeResultIssue("skip", "Skipped by policy.", "policy", false)];
      },
      failure: "skipped downstream_disposition must be continue"
    },
    {
      name: "success missing required output",
      mutate: (value) => {
        value.resolved_outputs = [];
      },
      failure: "resolved_outputs must include required artifact"
    },
    {
      name: "success dependency blocks downstream",
      mutate: (value) => {
        value.dependency_results[0].downstream_disposition = "block";
      },
      failure: "success requires required dependency"
    },
    {
      name: "success dependency failed but continues",
      mutate: (value) => {
        value.dependency_results[0].status = "failure";
      },
      failure: "success requires required dependency"
    },
    {
      name: "dependency result status disposition mismatch",
      mutate: (value) => {
        value.dependency_results[0].status = "failure";
        value.dependency_results[0].downstream_disposition = "continue";
      },
      failure: "dependency_results entry.failure downstream_disposition must be block"
    },
    {
      name: "fanout item missing fanout metadata",
      mutate: (value) => {
        value.result_scope = "fanout_item";
        value.node_kind = "fanout";
        value.fanout = null;
      },
      failure: "fanout_item requires fanout metadata"
    },
    {
      name: "barrier missing list mismatch",
      value: structuredCloneJson(barrierBase),
      mutate: (value) => {
        value.barrier.missing_execution_ids = [];
      },
      failure: "missing_execution_ids must equal expected minus observed"
    },
    {
      name: "barrier missing dependency evidence",
      value: structuredCloneJson(barrierBase),
      mutate: (value) => {
        value.dependency_results = [];
        value.barrier.observed_execution_ids = value.barrier.expected_execution_ids;
        value.barrier.missing_execution_ids = [];
      },
      failure: "expected_execution_ids must have matching dependency_results entries"
    },
    {
      name: "barrier observed dependency blocks",
      value: structuredCloneJson(barrierBase),
      mutate: (value) => {
        value.dependency_results = value.barrier.expected_execution_ids.map((executionId) => ({
          node_id: "per-item-summary",
          execution_id: executionId,
          status: "failure",
          required: true,
          downstream_disposition: "block"
        }));
        value.barrier.observed_execution_ids = value.barrier.expected_execution_ids;
        value.barrier.missing_execution_ids = [];
      },
      failure: "observed_execution_ids must reference successful dependency results"
    }
  ];

  for (const item of cases) {
    const value = item.value || structuredCloneJson(fixture);
    if (item.mutate) item.mutate(value);
    await assertValidDagNodeResultSchemaOnly(value);
    assertInvalidSemanticDagNodeResult(value, item.failure, item.name);
  }
});

test("daily codex DAG node result semantic validator does not throw on malformed inputs", async () => {
  const fixture = await loadNodeResultSuccessFixture();
  const malformedBarrierIds = structuredCloneJson(fixture);
  malformedBarrierIds.result_scope = "barrier";
  malformedBarrierIds.node_kind = "barrier";
  malformedBarrierIds.barrier = {
    expected_execution_ids: [1n],
    observed_execution_ids: [Symbol("observed")],
    missing_execution_ids: []
  };
  const cases = [
    null,
    [],
    "not an object",
    { schema_version: 1 },
    { ...structuredCloneJson(fixture), audit: null },
    { ...structuredCloneJson(fixture), dependency_results: [{ execution_id: 1n }] },
    { ...structuredCloneJson(fixture), resolved_outputs: [{ path: Symbol("artifact") }] },
    malformedBarrierIds
  ];

  for (const value of cases) {
    const result = validateDailyCodexDagNodeResult(value);
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

  const dryRunExecute = await runDagCli(["--dry-run", "--execute", "--date", "2026-07-03", "--json"]);
  assert.equal(dryRunExecute.code, 1);
  assert.equal(dryRunExecute.stderr, "");
  assert.equal(JSON.parse(dryRunExecute.stdout).failures[0], "Unsupported argument: --execute");

  const dryRunPublish = await runDagCli(["--dry-run", "--publish", "--date", "2026-07-03", "--json"]);
  assert.equal(dryRunPublish.code, 1);
  assert.equal(dryRunPublish.stderr, "");
  assert.equal(JSON.parse(dryRunPublish.stdout).failures[0], "Unsupported argument: --publish");
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

test("daily codex DAG contract-run CLI writes JSON to stdout only", async () => {
  const forbiddenBefore = await forbiddenPathSnapshot();
  const result = await runDagCli(["--contract-run", "--date", "2026-07-03", "--json"]);

  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stderr, "");
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, true, parsed.failures?.join("\n"));
  assert.equal(parsed.mode, "daily_codex_dag_contract_run");
  assert.equal(parsed.report_date, "2026-07-03");
  assert.equal(parsed.run.final_status, "contract_validated_only");
  assert.equal(parsed.node_results.length, parsed.plan.node_count);
  assert(parsed.node_results.every((item) => item.status === "skipped"));
  await assertValidDagRunSummary(parsed);
  assert.deepEqual(await forbiddenPathSnapshot(), forbiddenBefore, "stdout-only contract-run must not mutate production or scratch paths");
});

test("daily codex DAG contract-run CLI writes opt-in summaries under .tmp only", async () => {
  const tempName = `contract-summary-${process.pid}-${Date.now()}.json`;
  const summaryPath = path.join(".tmp", "daily-codex-pipeline", "dag-contract-run-test", tempName);
  const absoluteSummaryPath = path.join(rootDir, summaryPath);
  await fs.rm(absoluteSummaryPath, { force: true });

  const result = await runDagCli([
    "--contract-run",
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
  assert.equal(fileJson.mode, "daily_codex_dag_contract_run");
  await assertValidDagRunSummary(fileJson);

  await fs.rm(absoluteSummaryPath, { force: true });
});

test("daily codex DAG contract-run CLI rejects unsafe or executable invocations", async () => {
  const cases = [
    {
      args: ["--summary-path", "../x.json"],
      expected: "daily codex DAG summary path must stay under .tmp/daily-codex-pipeline"
    },
    {
      args: ["--summary-path", path.join("docs", "reports", "dag-contract-summary.json")],
      expected: "daily codex DAG summary path must stay under .tmp/daily-codex-pipeline"
    },
    {
      args: ["--summary-path", path.join("reports-data", "dag-contract-summary.json")],
      expected: "daily codex DAG summary path must stay under .tmp/daily-codex-pipeline"
    },
    {
      args: ["--summary-path", path.join(".tmp", "daily-codex-pipeline", "dag-contract-summary.txt")],
      expected: "daily codex DAG summary path must end with .json"
    },
    {
      args: ["--execute"],
      expected: "daily codex DAG CLI contract-run does not support --execute or --publish"
    },
    {
      args: ["--publish"],
      expected: "daily codex DAG CLI contract-run does not support --execute or --publish"
    }
  ];

  for (const item of cases) {
    const forbiddenBefore = await forbiddenPathSnapshot();
    const result = await runDagCli(["--contract-run", "--date", "2026-07-03", "--json", ...item.args]);
    assert.equal(result.code, 1, item.expected);
    assert.equal(result.stderr, "");
    assert.equal(JSON.parse(result.stdout).failures[0], item.expected);
    assert.deepEqual(await forbiddenPathSnapshot(), forbiddenBefore, item.expected);
  }

  const mixed = await runDagCli(["--dry-run", "--contract-run", "--date", "2026-07-03", "--json"]);
  assert.equal(mixed.code, 1);
  assert.equal(JSON.parse(mixed.stdout).failures[0], "daily codex DAG CLI cannot combine --dry-run and --contract-run");

  const executeBeforeMode = await runDagCli(["--execute", "--contract-run", "--date", "2026-07-03", "--json"]);
  assert.equal(executeBeforeMode.code, 1);
  assert.equal(JSON.parse(executeBeforeMode.stdout).failures[0], "daily codex DAG CLI contract-run does not support --execute or --publish");
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
      name: "planned node with legacy mapped readiness",
      mutate(manifest) {
        node(manifest, "score").execution_contract.readiness = "legacy_mapped";
      },
      expected: "planned node score must use execution_contract.readiness planned_only"
    },
    {
      name: "mapped node with planned-only readiness",
      mutate(manifest) {
        node(manifest, "admit-reject").execution_contract.readiness = "planned_only";
      },
      expected: "mapped node admit-reject must use execution_contract.readiness legacy_mapped"
    },
    {
      name: "node executable readiness is reserved until executor migration",
      mutate(manifest) {
        node(manifest, "admit-reject").execution_contract.readiness = "node_executable";
      },
      expected: "node admit-reject execution_contract.readiness node_executable is reserved until executor migration enables standalone node execution"
    },
    {
      name: "planned-only node cannot carry execution spec",
      mutate(manifest) {
        const target = node(manifest, "score");
        target.execution_contract.node_execution_spec = buildFutureNodeExecutionSpec(target);
      },
      expected: "node score execution_contract.node_execution_spec is only allowed for future node_executable nodes"
    },
    {
      name: "legacy-mapped node cannot carry execution spec",
      mutate(manifest) {
        const target = node(manifest, "admit-reject");
        target.execution_contract.node_execution_spec = buildFutureNodeExecutionSpec(target);
      },
      expected: "node admit-reject execution_contract.node_execution_spec is only allowed for future node_executable nodes"
    },
    {
      name: "execution spec input binding must reference declared input artifact",
      mutate(manifest) {
        const target = node(manifest, "score");
        target.execution_contract.readiness = "node_executable";
        target.execution_contract.node_execution_spec = buildFutureNodeExecutionSpec(target);
        target.execution_contract.node_execution_spec.inputs[0].artifact_path = ".tmp/daily-codex-pipeline/{report_date}/artifacts/not-declared.json";
      },
      expected: "node score node_execution_spec.inputs references undeclared input artifact .tmp/daily-codex-pipeline/{report_date}/artifacts/not-declared.json"
    },
    {
      name: "execution spec output binding must reference declared output artifact",
      mutate(manifest) {
        const target = node(manifest, "score");
        target.execution_contract.readiness = "node_executable";
        target.execution_contract.node_execution_spec = buildFutureNodeExecutionSpec(target);
        target.execution_contract.node_execution_spec.outputs[0].artifact_path = ".tmp/daily-codex-pipeline/{report_date}/artifacts/not-declared-output.json";
      },
      expected: "node score node_execution_spec.outputs references undeclared output artifact .tmp/daily-codex-pipeline/{report_date}/artifacts/not-declared-output.json"
    },
    ...["/tmp", "C:/tmp", "../x", "a/../b", "a//b", "https://x", "a\\b", "foo/C:/bar", "foo/a:b"].map((cwd) => ({
      name: `execution spec cwd rejects unsafe path ${cwd}`,
      mutate(manifest) {
        const target = node(manifest, "score");
        target.execution_contract.readiness = "node_executable";
        target.execution_contract.node_execution_spec = buildFutureNodeExecutionSpec(target, { cwd });
      },
      expected: "node score node_execution_spec.cwd must be \".\" or a repo-relative path without absolute paths, drive letters, URLs, parent traversal, empty segments, backslashes, or colon-containing path segments"
    })),
    ...["/tmp/prompt.md", "C:/tmp/prompt.md", "../prompt.md", "a/../prompt.md", "a//prompt.md", "https://example.test/prompt.md", "prompts\\future.md", "prompts/C:/future.md", "prompts/future:node.md"].map((promptTemplate) => ({
      name: `execution spec codex prompt rejects unsafe path ${promptTemplate}`,
      mutate(manifest) {
        const target = node(manifest, "classify-tag-entity");
        target.execution_contract.readiness = "node_executable";
        target.execution_contract.node_execution_spec = buildFutureNodeExecutionSpec(target, {
          executor: "codex_cli",
          invocation: {
            kind: "codex_cli",
            prompt_template: promptTemplate,
            args: ["--node", target.id]
          }
        });
      },
      expected: "node classify-tag-entity node_execution_spec.invocation.prompt_template must be a repo-relative path without absolute paths, drive letters, URLs, parent traversal, empty segments, backslashes, or colon-containing path segments",
      notExpected: "node classify-tag-entity node_execution_spec.invocation.prompt_template missing",
      uncheckedPath: promptTemplate.replace(/\\/g, "/")
    })),
    {
      name: "execution spec codex prompt template must exist",
      mutate(manifest) {
        const target = node(manifest, "classify-tag-entity");
        target.execution_contract.readiness = "node_executable";
        target.execution_contract.node_execution_spec = buildFutureNodeExecutionSpec(target, {
          executor: "codex_cli",
          invocation: {
            kind: "codex_cli",
            prompt_template: "prompts/ai-daily/modules/missing-future-node.md",
            args: ["--node", target.id]
          }
        });
      },
      expected: "node classify-tag-entity node_execution_spec.invocation.prompt_template missing prompts/ai-daily/modules/missing-future-node.md"
    },
    {
      name: "execution spec codex prompt template must be a file",
      mutate(manifest) {
        const target = node(manifest, "classify-tag-entity");
        target.execution_contract.readiness = "node_executable";
        target.execution_contract.node_execution_spec = buildFutureNodeExecutionSpec(target, {
          executor: "codex_cli",
          invocation: {
            kind: "codex_cli",
            prompt_template: "prompts/ai-daily/modules",
            args: ["--node", target.id]
          }
        });
      },
      expected: "node classify-tag-entity node_execution_spec.invocation.prompt_template must be a file prompts/ai-daily/modules"
    },
    {
      name: "execution spec command argv rejects blank token",
      mutate(manifest) {
        const target = node(manifest, "score");
        target.execution_contract.readiness = "node_executable";
        target.execution_contract.node_execution_spec = buildFutureNodeExecutionSpec(target, {
          invocation: {
            kind: "command",
            argv: ["node", " "]
          }
        });
      },
      expected: "node score node_execution_spec.invocation.argv entries must be non-empty strings"
    },
    {
      name: "execution spec command argv rejects unsupported runner",
      mutate(manifest) {
        const target = node(manifest, "score");
        target.execution_contract.readiness = "node_executable";
        target.execution_contract.node_execution_spec = buildFutureNodeExecutionSpec(target, {
          invocation: {
            kind: "command",
            argv: ["npm", "run", "future-node"]
          }
        });
      },
      expected: "node score node_execution_spec.invocation.argv[0] must be node until live executor command policy supports additional runners"
    },
    ...shellishCommandTokens.map((token) => ({
      name: `execution spec command argv rejects shell-ish token ${JSON.stringify(token)}`,
      mutate(manifest) {
        const target = node(manifest, "score");
        target.execution_contract.readiness = "node_executable";
        target.execution_contract.node_execution_spec = buildFutureNodeExecutionSpec(target, {
          invocation: {
            kind: "command",
            argv: ["node", "scripts/validate-daily-codex-dag.mjs", token]
          }
        });
      },
      expected: "node score node_execution_spec.invocation.argv entries must not contain shell control operators or redirection tokens"
    })),
    {
      name: "execution spec command argv requires safe node script path",
      mutate(manifest) {
        const target = node(manifest, "score");
        target.execution_contract.readiness = "node_executable";
        target.execution_contract.node_execution_spec = buildFutureNodeExecutionSpec(target, {
          invocation: {
            kind: "command",
            argv: ["node", "../scripts/validate-daily-codex-dag.mjs"]
          }
        });
      },
      expected: "node score node_execution_spec.invocation.argv[1] must be a repo-relative Node script path without absolute paths"
    },
    {
      name: "execution spec command argv requires scripts path",
      mutate(manifest) {
        const target = node(manifest, "score");
        target.execution_contract.readiness = "node_executable";
        target.execution_contract.node_execution_spec = buildFutureNodeExecutionSpec(target, {
          invocation: {
            kind: "command",
            argv: ["node", "src/daily-codex-dag.js"]
          }
        });
      },
      expected: "node score node_execution_spec.invocation.argv[1] must be under scripts/"
    },
    {
      name: "execution spec command argv requires javascript script extension",
      mutate(manifest) {
        const target = node(manifest, "score");
        target.execution_contract.readiness = "node_executable";
        target.execution_contract.node_execution_spec = buildFutureNodeExecutionSpec(target, {
          invocation: {
            kind: "command",
            argv: ["node", "scripts/future-dag-node.txt"]
          }
        });
      },
      expected: "node score node_execution_spec.invocation.argv[1] must end with .mjs or .js"
    },
    {
      name: "execution spec command argv requires existing node script",
      mutate(manifest) {
        const target = node(manifest, "score");
        target.execution_contract.readiness = "node_executable";
        target.execution_contract.node_execution_spec = buildFutureNodeExecutionSpec(target, {
          invocation: {
            kind: "command",
            argv: ["node", "scripts/missing-future-dag-node.mjs"]
          }
        });
      },
      expected: "node score node_execution_spec.invocation.argv[1] missing scripts/missing-future-dag-node.mjs"
    },
    {
      name: "execution spec command argv requires node script file",
      mutate(manifest) {
        const target = node(manifest, "score");
        target.execution_contract.readiness = "node_executable";
        target.execution_contract.node_execution_spec = buildFutureNodeExecutionSpec(target, {
          invocation: {
            kind: "command",
            argv: ["node", "scripts"]
          }
        });
      },
      expected: "node score node_execution_spec.invocation.argv[1] must be a file scripts"
    },
    {
      name: "execution spec codex args reject blank token",
      mutate(manifest) {
        const target = node(manifest, "classify-tag-entity");
        target.execution_contract.readiness = "node_executable";
        target.execution_contract.node_execution_spec = buildFutureNodeExecutionSpec(target, {
          executor: "codex_cli",
          invocation: {
            kind: "codex_cli",
            prompt_template: "prompts/ai-daily/modules/base.md",
            args: ["--node", " "]
          }
        });
      },
      expected: "node classify-tag-entity node_execution_spec.invocation.args entries must be non-empty strings"
    },
    {
      name: "execution spec idempotency key must be node scoped and deterministic",
      mutate(manifest) {
        const target = node(manifest, "score");
        target.execution_contract.readiness = "node_executable";
        target.execution_contract.node_execution_spec = buildFutureNodeExecutionSpec(target, {
          idempotency_key: "daily-codex-dag:{report_date}:wrong-node"
        });
      },
      expected: "node score node_execution_spec.idempotency_key must be daily-codex-dag:{report_date}:score"
    },
    {
      name: "execution spec concurrency group must match node parallel group",
      mutate(manifest) {
        const target = node(manifest, "score");
        target.execution_contract.readiness = "node_executable";
        target.execution_contract.node_execution_spec = buildFutureNodeExecutionSpec(target, {
          concurrency_group: "serial"
        });
      },
      expected: "node score node_execution_spec.concurrency_group must match node parallel_group item-lanes"
    },
    {
      name: "execution spec retry backoff length must match attempts",
      mutate(manifest) {
        const target = node(manifest, "score");
        target.execution_contract.readiness = "node_executable";
        target.execution_contract.node_execution_spec = buildFutureNodeExecutionSpec(target, {
          retry_policy: {
            max_attempts: 3,
            backoff_seconds: [0, 5]
          }
        });
      },
      expected: "node score node_execution_spec.retry_policy.backoff_seconds must contain one entry per max_attempts"
    },
    {
      name: "execution spec retry backoff must start at zero",
      mutate(manifest) {
        const target = node(manifest, "score");
        target.execution_contract.readiness = "node_executable";
        target.execution_contract.node_execution_spec = buildFutureNodeExecutionSpec(target, {
          retry_policy: {
            max_attempts: 2,
            backoff_seconds: [1, 5]
          }
        });
      },
      expected: "node score node_execution_spec.retry_policy.backoff_seconds must start with 0"
    },
    {
      name: "execution spec retry backoff must be nondecreasing",
      mutate(manifest) {
        const target = node(manifest, "score");
        target.execution_contract.readiness = "node_executable";
        target.execution_contract.node_execution_spec = buildFutureNodeExecutionSpec(target, {
          retry_policy: {
            max_attempts: 3,
            backoff_seconds: [0, 10, 5]
          }
        });
      },
      expected: "node score node_execution_spec.retry_policy.backoff_seconds must be nondecreasing"
    },
    {
      name: "execution spec reuse valid outputs requires declared output schema from manifest outputs",
      mutate(manifest) {
        const target = node(manifest, "score");
        target.execution_contract.readiness = "node_executable";
        target.execution_contract.node_execution_spec = buildFutureNodeExecutionSpec(target, {
          outputs: [],
          artifact_verification: {
            schema: "none",
            existence: "required_outputs",
            privacy_scan: "none"
          }
        });
      },
      expected: "node score node_execution_spec.artifact_verification.schema must be declared_outputs when reuse_valid_outputs is used for a node with manifest outputs"
    },
    {
      name: "execution spec reuse valid outputs requires output existence from manifest outputs",
      mutate(manifest) {
        const target = node(manifest, "score");
        target.execution_contract.readiness = "node_executable";
        target.execution_contract.node_execution_spec = buildFutureNodeExecutionSpec(target, {
          outputs: [],
          artifact_verification: {
            schema: "declared_outputs",
            existence: "none",
            privacy_scan: "none"
          }
        });
      },
      expected: "node score node_execution_spec.artifact_verification.existence must be required_outputs when reuse_valid_outputs is used for a node with manifest outputs"
    },
    {
      name: "execution spec public artifact node requires public publish boundary",
      mutate(manifest) {
        const target = node(manifest, "persist-article-db");
        target.execution_contract.readiness = "node_executable";
        target.execution_contract.node_execution_spec = buildFutureNodeExecutionSpec(target, {
          sandbox: {
            filesystem: "public_artifact_write",
            network: "disabled",
            secrets: "none"
          },
          publish_boundary: "internal_only"
        });
      },
      expected: "node persist-article-db node_execution_spec.publish_boundary must be public_artifacts for public artifact nodes"
    },
    {
      name: "execution spec public artifact node requires public filesystem sandbox",
      mutate(manifest) {
        const target = node(manifest, "persist-article-db");
        target.execution_contract.readiness = "node_executable";
        target.execution_contract.node_execution_spec = buildFutureNodeExecutionSpec(target);
      },
      expected: "node persist-article-db node_execution_spec.sandbox.filesystem must be public_artifact_write for public artifact nodes"
    },
    {
      name: "execution spec public artifact node requires public privacy scan",
      mutate(manifest) {
        const target = node(manifest, "persist-article-db");
        target.execution_contract.readiness = "node_executable";
        target.execution_contract.node_execution_spec = buildFutureNodeExecutionSpec(target, {
          sandbox: {
            filesystem: "public_artifact_write",
            network: "disabled",
            secrets: "none"
          },
          artifact_verification: {
            schema: "declared_outputs",
            existence: "required_outputs",
            privacy_scan: "none"
          }
        });
      },
      expected: "node persist-article-db node_execution_spec.artifact_verification.privacy_scan must be public_outputs for public artifact nodes"
    },
    {
      name: "execution spec non public node rejects public publish boundary",
      mutate(manifest) {
        const target = node(manifest, "score");
        target.execution_contract.readiness = "node_executable";
        target.execution_contract.node_execution_spec = buildFutureNodeExecutionSpec(target, {
          publish_boundary: "public_artifacts"
        });
      },
      expected: "node score node_execution_spec.publish_boundary cannot be public_artifacts for non-public nodes"
    },
    {
      name: "execution spec non public node rejects public filesystem sandbox",
      mutate(manifest) {
        const target = node(manifest, "score");
        target.execution_contract.readiness = "node_executable";
        target.execution_contract.node_execution_spec = buildFutureNodeExecutionSpec(target, {
          sandbox: {
            filesystem: "public_artifact_write",
            network: "disabled",
            secrets: "none"
          }
        });
      },
      expected: "node score node_execution_spec.sandbox.filesystem cannot be public_artifact_write for non-public nodes"
    },
    {
      name: "execution spec non public node rejects public privacy scan",
      mutate(manifest) {
        const target = node(manifest, "score");
        target.execution_contract.readiness = "node_executable";
        target.execution_contract.node_execution_spec = buildFutureNodeExecutionSpec(target, {
          artifact_verification: {
            schema: "declared_outputs",
            existence: "required_outputs",
            privacy_scan: "public_outputs"
          }
        });
      },
      expected: "node score node_execution_spec.artifact_verification.privacy_scan cannot be public_outputs for non-public nodes"
    },
    {
      name: "execution spec source allowlist network is reserved",
      mutate(manifest) {
        const target = node(manifest, "score");
        target.execution_contract.readiness = "node_executable";
        target.execution_contract.node_execution_spec = buildFutureNodeExecutionSpec(target, {
          sandbox: {
            filesystem: "workspace_write",
            network: "source_allowlist",
            secrets: "none"
          }
        });
      },
      expected: "node score node_execution_spec.sandbox.network source_allowlist is reserved until live executor network policy is defined"
    },
    {
      name: "execution spec enabled network is reserved",
      mutate(manifest) {
        const target = node(manifest, "score");
        target.execution_contract.readiness = "node_executable";
        target.execution_contract.node_execution_spec = buildFutureNodeExecutionSpec(target, {
          sandbox: {
            filesystem: "workspace_write",
            network: "enabled",
            secrets: "none"
          }
        });
      },
      expected: "node score node_execution_spec.sandbox.network enabled is reserved until live executor network policy is defined"
    },
    {
      name: "execution spec runtime scoped secrets are reserved",
      mutate(manifest) {
        const target = node(manifest, "score");
        target.execution_contract.readiness = "node_executable";
        target.execution_contract.node_execution_spec = buildFutureNodeExecutionSpec(target, {
          sandbox: {
            filesystem: "workspace_write",
            network: "disabled",
            secrets: "runtime_scoped"
          }
        });
      },
      expected: "node score node_execution_spec.sandbox.secrets runtime_scoped is reserved until live executor secret policy is defined"
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
    if (item.notExpected) {
      assert(
        !result.failures.some((failure) => failure.includes(item.notExpected)),
        `${item.name}\nunexpected: ${item.notExpected}\nactual:\n${result.failures.join("\n")}`
      );
    }
    if (item.uncheckedPath) {
      assert(
        !result.checked_files.some((filePath) => filePath.includes(item.uncheckedPath)),
        `${item.name}\nunexpected checked file: ${item.uncheckedPath}\nactual:\n${result.checked_files.join("\n")}`
      );
    }
  }
});

async function loadManifest() {
  return JSON.parse(await fs.readFile(manifestPath, "utf8"));
}

async function loadDryRunSummaryFixture() {
  return JSON.parse(await fs.readFile(dryRunSummaryFixturePath, "utf8"));
}

async function loadNodeResultSuccessFixture() {
  return JSON.parse(await fs.readFile(nodeResultSuccessFixturePath, "utf8"));
}

async function assertValidDagRunSummary(value) {
  await assertValidDagRunSummarySchemaOnly(value);
  const semanticResult = validateDailyCodexDagRunSummary(value);
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
  const result = validateDailyCodexDagRunSummary(value);
  if (result.ok) {
    assert.fail(`daily codex DAG run summary semantic validator accepted invalid case: ${label}`);
  }
  assert(
    result.failures.some((failure) => failure.includes(expectedFailure)),
    `${label} failures:\n${result.failures.join("\n")}`
  );
}

async function assertValidDagManifestSchemaOnly(value) {
  const validate = await getDagManifestValidator();
  if (!validate(value)) {
    assert.fail(`daily codex DAG manifest should match schema:\n${formatAjvErrors(validate.errors)}`);
  }
}

async function assertInvalidDagManifestSchemaOnly(value) {
  const validate = await getDagManifestValidator();
  if (validate(value)) {
    assert.fail("daily codex DAG manifest schema accepted an invalid manifest");
  }
}

async function assertValidDagNodeResult(value) {
  await assertValidDagNodeResultSchemaOnly(value);
  const semanticResult = validateDailyCodexDagNodeResult(value);
  if (!semanticResult.ok) {
    assert.fail(`daily codex DAG node result should pass semantic validation:\n${semanticResult.failures.join("\n")}`);
  }
}

async function assertValidDagNodeResultSchemaOnly(value) {
  const validate = await getDagNodeResultValidator();
  if (!validate(value)) {
    assert.fail(`daily codex DAG node result should match schema:\n${formatAjvErrors(validate.errors)}`);
  }
}

async function assertInvalidDagNodeResult(value) {
  const validate = await getDagNodeResultValidator();
  if (validate(value)) {
    assert.fail("daily codex DAG node result schema accepted an invalid envelope");
  }
}

function assertInvalidSemanticDagNodeResult(value, expectedFailure, label) {
  const result = validateDailyCodexDagNodeResult(value);
  if (result.ok) {
    assert.fail(`daily codex DAG node result semantic validator accepted invalid case: ${label}`);
  }
  assert(
    result.failures.some((failure) => failure.includes(expectedFailure)),
    `${label} failures:\n${result.failures.join("\n")}`
  );
}

async function getDagManifestValidator() {
  if (!dagManifestValidator) {
    const schema = JSON.parse(await fs.readFile(dagSchemaPath, "utf8"));
    const ajv = new Ajv({ allErrors: true, strict: false });
    dagManifestValidator = ajv.compile(schema);
  }
  return dagManifestValidator;
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

async function getDagNodeResultValidator() {
  if (!dagNodeResultValidator) {
    const schema = JSON.parse(await fs.readFile(dagNodeResultSchemaPath, "utf8"));
    const ajv = new Ajv({ allErrors: true, strict: false });
    for (const format of ["date", "date-time", "uri", "uri-reference", "email"]) {
      ajv.addFormat(format, true);
    }
    dagNodeResultValidator = ajv.compile(schema);
  }
  return dagNodeResultValidator;
}

function formatAjvErrors(errors = []) {
  return errors
    .map((error) => `${error.instancePath || "/"} ${error.message}`)
    .join("\n");
}

function structuredCloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildFutureNodeExecutionSpec(manifestNode, overrides = {}) {
  return {
    executor: "command",
    cwd: ".",
    invocation: {
      kind: "command",
      argv: ["node", "scripts/validate-daily-codex-dag.mjs", manifestNode.id]
    },
    inputs: (manifestNode.inputs || []).map((artifact) => ({ artifact_path: artifact.path })),
    outputs: (manifestNode.outputs || []).map((artifact) => ({ artifact_path: artifact.path })),
    timeout_seconds: 300,
    retry_policy: {
      max_attempts: 1,
      backoff_seconds: [0]
    },
    concurrency_group: manifestNode.parallel_group || "serial",
    sandbox: {
      filesystem: "workspace_write",
      network: "disabled",
      secrets: "none"
    },
    artifact_verification: {
      schema: "declared_outputs",
      existence: "required_outputs",
      privacy_scan: manifestNode.public_artifact ? "public_outputs" : "none"
    },
    idempotency_key: `daily-codex-dag:{report_date}:${manifestNode.id}`,
    resume_policy: "reuse_valid_outputs",
    publish_boundary: manifestNode.public_artifact ? "public_artifacts" : "internal_only",
    ...overrides
  };
}

function buildNodeResult(overrides = {}) {
  return createDailyCodexDagNodeResult({
    reportDate: "2026-07-03",
    runId: "daily-codex-dag:2026-07-03:test",
    manifestName: "daily-codex-dag-contract",
    manifestSchemaVersion: 1,
    nodeId: "score",
    nodeKind: "command",
    runnerStageRef: "admit",
    resultScope: "node",
    status: "success",
    startedAt: "2026-07-03T08:00:00.000Z",
    finishedAt: "2026-07-03T08:00:01.000Z",
    maxAttempts: 2,
    dependencyResults: [{
      node_id: "classify-tag-entity",
      execution_id: "daily-codex-dag:2026-07-03:test:classify-tag-entity:node",
      status: "success",
      required: true,
      downstream_disposition: "continue"
    }],
    declaredInputs: [{
      path: ".tmp/daily-codex-pipeline/2026-07-03/artifacts/classified-candidates.json",
      required: true
    }],
    declaredOutputs: [{
      path: ".tmp/daily-codex-pipeline/2026-07-03/artifacts/scored-candidates.json",
      required: true
    }],
    resolvedInputs: [resolvedArtifact(".tmp/daily-codex-pipeline/2026-07-03/artifacts/classified-candidates.json")],
    resolvedOutputs: [resolvedArtifact(".tmp/daily-codex-pipeline/2026-07-03/artifacts/scored-candidates.json")],
    audit: {
      parallel_group: "item-lanes",
      resilience_policy_ref: "",
      owner_path_scope: "internal_workdir",
      public_artifact: false,
      validator_version: "daily-codex-dag-node-result-v1"
    },
    ...overrides
  });
}

function resolvedArtifact(artifactPath) {
  return {
    path: artifactPath,
    required: true,
    exists: true,
    schema_valid: true,
    bytes: 128,
    sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  };
}

function nodeResultIssue(code, message, source, retryable) {
  return { code, message, source, retryable };
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
