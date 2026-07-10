import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Ajv from "ajv/dist/2020.js";
import {
  createDailyCodexDagContractRun,
  createDailyCodexDagNodeResult,
  createDailyCodexDagDryRun,
  createDailyCodexDagExecutableNodeMvp,
  createDailyCodexDagRealNodeAdapterMvp,
  createDailyCodexDagSourceWatchCollectMvp,
  createDailyCodexDagSourceWatchDownstreamMvp,
  createDailyCodexDagSourceWatchNormalizeMvp,
  createDailyCodexDagSourceWatchQualityMvp,
  createDailyCodexDagSourceWatchAdmitMvp,
  createDailyCodexDagSourceWatchArticleIndexMvp,
  createDailyCodexDagTwoNodeFixtureMvp,
  createDailyCodexDagPlan,
  executeDailyCodexDagCommandNode,
  resolveDailyCodexDagCodexRuntimePlan,
  resolveDailyCodexDagCommandRuntimePlan,
  resolveDailyCodexDagNodeRuntimePlan,
  validateDailyCodexDag,
  validateDailyCodexDagNodeResult,
  validateDailyCodexDagRunSummary,
  validateDailyCodexDagDryRunSummary
} from "../src/daily-codex-dag.js";
import { validateArticles } from "../src/schema.js";

const rootDir = process.cwd();
const manifestPath = path.join(rootDir, "config", "daily-codex-dag.json");
const dagCliPath = path.join(rootDir, "scripts", "run-daily-codex-dag.mjs");
const articleIndexFixtureCliPath = path.join(rootDir, "scripts", "run-source-watch-article-index-fixture.mjs");
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

  const nodeWithFallbackSpec = structuredCloneJson(score);
  nodeWithFallbackSpec.execution_contract = {
    readiness: "node_executable",
    summary: "Synthetic fallback spec that direct helper must not use when spec is explicit.",
    node_execution_spec: baseSpec
  };
  const explicitNull = resolveDailyCodexDagCommandRuntimePlan({
    rootDir,
    node: nodeWithFallbackSpec,
    spec: null,
    nodeExecutablePath: process.execPath
  });
  assert.equal(explicitNull.ok, false);
  assert.equal(explicitNull.plan, null);
  assert(
    explicitNull.failures.some((failure) => failure.includes("spec must be an object")),
    explicitNull.failures.join("\n")
  );

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

test("daily codex DAG Codex runtime plan resolves explicit runtime without execution", async () => {
  const manifest = await loadManifest();
  const codexNode = node(manifest, "classify-tag-entity");
  const codexExecutablePath = path.resolve(rootDir, ".tmp", "codex-bin", "codex");
  const promptTemplate = "prompts/future-missing-codex-node.md";
  const spec = buildFutureNodeExecutionSpec(codexNode, {
    executor: "codex_cli",
    cwd: "scripts",
    invocation: {
      kind: "codex_cli",
      prompt_template: promptTemplate,
      args: ["--node", codexNode.id, "--mode", "plan-only"]
    }
  });

  const result = resolveDailyCodexDagCodexRuntimePlan({
    rootDir,
    node: codexNode,
    spec,
    codexExecutablePath
  });

  const expectedPromptPath = path.resolve(rootDir, "prompts", "future-missing-codex-node.md");
  assert.equal(result.ok, true, result.failures.join("\n"));
  assert.deepEqual(result.plan, {
    runner: "codex_cli",
    command: codexExecutablePath,
    codex_args: ["--node", codexNode.id, "--mode", "plan-only"],
    invocation_args: ["--node", codexNode.id, "--mode", "plan-only"],
    cwd: path.resolve(rootDir, "scripts"),
    shell: false,
    prompt_template_path: expectedPromptPath,
    prompt_template: promptTemplate
  });
  assert.equal(Object.hasOwn(result.plan, "args"), false);
  assert.notEqual(result.plan.prompt_template_path, path.resolve(rootDir, "scripts", "prompts", "future-missing-codex-node.md"));
});

test("daily codex DAG Codex runtime plan rejects unsafe or unsupported Codex inputs", async () => {
  const manifest = await loadManifest();
  const codexNode = node(manifest, "classify-tag-entity");
  const codexExecutablePath = path.resolve(rootDir, ".tmp", "codex-bin", "codex");
  const cases = [
    {
      name: "mismatched executor",
      overrides: {
        executor: "command",
        invocation: {
          kind: "codex_cli",
          prompt_template: "prompts/ai-daily/modules/base.md",
          args: ["--node", codexNode.id]
        }
      },
      expected: "executor must be codex_cli"
    },
    {
      name: "mismatched invocation kind",
      overrides: {
        executor: "codex_cli",
        invocation: {
          kind: "command",
          argv: ["node", "scripts/validate-daily-codex-dag.mjs"]
        }
      },
      expected: "invocation.kind must be codex_cli"
    },
    {
      name: "unsafe prompt template",
      overrides: {
        executor: "codex_cli",
        invocation: {
          kind: "codex_cli",
          prompt_template: "../prompts/future-dag-node.md",
          args: ["--node", codexNode.id]
        }
      },
      expected: "invocation.prompt_template must be a repo-relative path"
    },
    {
      name: "blank arg",
      overrides: {
        executor: "codex_cli",
        invocation: {
          kind: "codex_cli",
          prompt_template: "prompts/ai-daily/modules/base.md",
          args: ["--node", ""]
        }
      },
      expected: "invocation.args entries must be non-empty strings"
    },
    {
      name: "unsafe cwd",
      overrides: {
        executor: "codex_cli",
        cwd: "../outside",
        invocation: {
          kind: "codex_cli",
          prompt_template: "prompts/ai-daily/modules/base.md",
          args: ["--node", codexNode.id]
        }
      },
      expected: 'cwd must be "." or a safe repo-relative path'
    }
  ];

  for (const item of cases) {
    const spec = buildFutureNodeExecutionSpec(codexNode, item.overrides);
    const result = resolveDailyCodexDagCodexRuntimePlan({
      rootDir,
      node: codexNode,
      spec,
      codexExecutablePath
    });

    assert.equal(result.ok, false, item.name);
    assert.equal(result.plan, null, item.name);
    assert(
      result.failures.some((failure) => failure.includes(item.expected)),
      `${item.name}\n${result.failures.join("\n")}`
    );
  }

  const fallbackSpec = buildFutureNodeExecutionSpec(codexNode, {
    executor: "codex_cli",
    invocation: {
      kind: "codex_cli",
      prompt_template: "prompts/ai-daily/modules/base.md",
      args: ["--node", codexNode.id]
    }
  });
  const nodeWithFallbackSpec = structuredCloneJson(codexNode);
  nodeWithFallbackSpec.execution_contract = {
    readiness: "node_executable",
    summary: "Synthetic fallback spec that direct helper must not use when spec is explicit.",
    node_execution_spec: fallbackSpec
  };
  const explicitNull = resolveDailyCodexDagCodexRuntimePlan({
    rootDir,
    node: nodeWithFallbackSpec,
    spec: null,
    codexExecutablePath
  });
  assert.equal(explicitNull.ok, false);
  assert.equal(explicitNull.plan, null);
  assert(
    explicitNull.failures.some((failure) => failure.includes("spec must be an object")),
    explicitNull.failures.join("\n")
  );

  for (const codexExecutablePathOverride of [undefined, "codex", ""]) {
    const spec = buildFutureNodeExecutionSpec(codexNode, {
      executor: "codex_cli",
      invocation: {
        kind: "codex_cli",
        prompt_template: "prompts/ai-daily/modules/base.md",
        args: ["--node", codexNode.id]
      }
    });
    const result = resolveDailyCodexDagCodexRuntimePlan({
      rootDir,
      node: codexNode,
      spec,
      codexExecutablePath: codexExecutablePathOverride
    });

    assert.equal(result.ok, false);
    assert.equal(result.plan, null);
    assert(
      result.failures.some((failure) => failure.includes("codexExecutablePath must be an absolute path")),
      result.failures.join("\n")
    );
  }
});

test("daily codex DAG node runtime plan dispatches executable command and Codex specs without execution", async () => {
  const manifest = await loadManifest();
  const score = structuredCloneJson(node(manifest, "score"));
  const commandSpec = buildFutureNodeExecutionSpec(score, {
    cwd: "scripts",
    invocation: {
      kind: "command",
      argv: ["node", "scripts/validate-daily-codex-dag.mjs", "--node", score.id]
    }
  });
  score.execution_contract = {
    readiness: "node_executable",
    summary: "Synthetic executable command node for generic runtime-plan dispatch.",
    node_execution_spec: commandSpec
  };

  const commandResult = resolveDailyCodexDagNodeRuntimePlan({
    rootDir,
    node: score,
    nodeExecutablePath: process.execPath
  });

  assert.equal(commandResult.ok, true, commandResult.failures.join("\n"));
  assert.equal(commandResult.plan.node_id, score.id);
  assert.equal(commandResult.plan.executor, "command");
  assert.deepEqual(commandResult.plan.runtime_plan, {
    runner: "node",
    command: process.execPath,
    args: [path.resolve(rootDir, "scripts", "validate-daily-codex-dag.mjs"), "--node", score.id],
    cwd: path.resolve(rootDir, "scripts"),
    shell: false,
    script_path: path.resolve(rootDir, "scripts", "validate-daily-codex-dag.mjs"),
    argv_tail: ["--node", score.id]
  });

  const codexNode = structuredCloneJson(node(manifest, "classify-tag-entity"));
  const codexExecutablePath = path.resolve(rootDir, ".tmp", "codex-bin", "codex");
  const codexSpec = buildFutureNodeExecutionSpec(codexNode, {
    executor: "codex_cli",
    cwd: "scripts",
    invocation: {
      kind: "codex_cli",
      prompt_template: "prompts/future-missing-codex-node.md",
      args: ["--node", codexNode.id]
    }
  });
  codexNode.execution_contract = {
    readiness: "node_executable",
    summary: "Synthetic executable Codex node for generic runtime-plan dispatch.",
    node_execution_spec: codexSpec
  };

  const codexResult = resolveDailyCodexDagNodeRuntimePlan({
    rootDir,
    node: codexNode,
    codexExecutablePath
  });

  assert.equal(codexResult.ok, true, codexResult.failures.join("\n"));
  assert.equal(codexResult.plan.node_id, codexNode.id);
  assert.equal(codexResult.plan.executor, "codex_cli");
  assert.deepEqual(codexResult.plan.runtime_plan, {
    runner: "codex_cli",
    command: codexExecutablePath,
    codex_args: ["--node", codexNode.id],
    invocation_args: ["--node", codexNode.id],
    cwd: path.resolve(rootDir, "scripts"),
    shell: false,
    prompt_template_path: path.resolve(rootDir, "prompts", "future-missing-codex-node.md"),
    prompt_template: "prompts/future-missing-codex-node.md"
  });
});

test("daily codex DAG node runtime plan rejects non-executable, unsupported, and explicit invalid specs", async () => {
  const manifest = await loadManifest();
  const score = structuredCloneJson(node(manifest, "score"));
  const commandSpec = buildFutureNodeExecutionSpec(score, {
    invocation: {
      kind: "command",
      argv: ["node", "scripts/validate-daily-codex-dag.mjs"]
    }
  });

  const plannedNodeResult = resolveDailyCodexDagNodeRuntimePlan({
    rootDir,
    node: score,
    spec: commandSpec,
    nodeExecutablePath: process.execPath
  });
  assert.equal(plannedNodeResult.ok, false);
  assert.equal(plannedNodeResult.plan, null);
  assert(
    plannedNodeResult.failures.some((failure) => failure.includes("execution_contract.readiness must be node_executable")),
    plannedNodeResult.failures.join("\n")
  );

  const executableNode = structuredCloneJson(score);
  executableNode.execution_contract = {
    readiness: "node_executable",
    summary: "Synthetic executable node for generic runtime-plan rejection.",
    node_execution_spec: commandSpec
  };

  const unsupportedExecutor = resolveDailyCodexDagNodeRuntimePlan({
    rootDir,
    node: executableNode,
    spec: {
      ...commandSpec,
      executor: "python"
    },
    nodeExecutablePath: process.execPath
  });
  assert.equal(unsupportedExecutor.ok, false);
  assert.equal(unsupportedExecutor.plan, null);
  assert(
    unsupportedExecutor.failures.some((failure) => failure.includes("executor must be command or codex_cli")),
    unsupportedExecutor.failures.join("\n")
  );

  const explicitNull = resolveDailyCodexDagNodeRuntimePlan({
    rootDir,
    node: executableNode,
    spec: null,
    nodeExecutablePath: process.execPath
  });
  assert.equal(explicitNull.ok, false);
  assert.equal(explicitNull.plan, null);
  assert(
    explicitNull.failures.some((failure) => failure.includes("spec must be an object")),
    explicitNull.failures.join("\n")
  );

  const delegatedCodexFailure = resolveDailyCodexDagNodeRuntimePlan({
    rootDir,
    node: executableNode,
    spec: {
      ...commandSpec,
      executor: "codex_cli",
      invocation: {
        kind: "codex_cli",
        prompt_template: "prompts/ai-daily/modules/base.md",
        args: ["--node", score.id]
      }
    }
  });
  assert.equal(delegatedCodexFailure.ok, false);
  assert.equal(delegatedCodexFailure.plan, null);
  assert(
    delegatedCodexFailure.failures.some((failure) => failure.includes("codexExecutablePath must be an absolute path")),
    delegatedCodexFailure.failures.join("\n")
  );
});

test("daily codex DAG command node executor runs a deterministic repo command and emits a valid success node result", async () => {
  const manifest = await loadManifest();
  const score = structuredCloneJson(node(manifest, "score"));
  const commandSpec = buildFutureNodeExecutionSpec(score, {
    cwd: ".",
    invocation: {
      kind: "command",
      argv: ["node", "scripts/validate-daily-codex-dag.mjs"]
    }
  });
  score.execution_contract = {
    readiness: "node_executable",
    summary: "Synthetic executable command node for command executor testing.",
    node_execution_spec: commandSpec
  };

  const result = await executeDailyCodexDagCommandNode({
    rootDir,
    node: score,
    reportDate: "2026-07-03",
    runId: "daily-codex-dag:2026-07-03:command-test",
    nodeExecutablePath: process.execPath,
    startedAt: "2026-07-03T08:00:00.000Z",
    finishedAt: "2026-07-03T08:00:01.000Z",
    resolvedInputs: (score.inputs || []).map((artifact) => resolvedArtifact(artifact.path)),
    resolvedOutputs: (score.outputs || []).map((artifact) => resolvedArtifact(artifact.path))
  });

  assert.equal(result.ok, true, result.failures.join("\n"));
  assert.deepEqual(result.runtime_plan, {
    runner: "node",
    command: process.execPath,
    args: [path.resolve(rootDir, "scripts", "validate-daily-codex-dag.mjs")],
    cwd: rootDir,
    shell: false,
    script_path: path.resolve(rootDir, "scripts", "validate-daily-codex-dag.mjs"),
    argv_tail: []
  });
  assert.equal(result.result.status, "success");
  assert.equal(result.result.downstream_disposition, "continue");
  assert.equal(result.result.duration_ms, 1000);
  assert.equal(result.result.attempts_started, 1);
  assert.equal(result.result.attempts_exhausted, false);
  assert.deepEqual(result.result.failures, []);
  assert.deepEqual(result.result.warnings, []);
  assert.equal(result.result.node_id, score.id);
  assert.equal(result.result.runner_stage_ref, score.runner_stage_ref);
  assert.equal(result.result.audit.parallel_group, score.parallel_group);
  assert.equal(Object.hasOwn(result.result, "stdout"), false);
  assert.equal(Object.hasOwn(result.result, "stderr"), false);

  const validation = validateDailyCodexDagNodeResult(result.result);
  assert.equal(validation.ok, true, validation.failures.join("\n"));
});

test("daily codex DAG command node executor emits a valid failure node result when execution fails", async () => {
  const manifest = await loadManifest();
  const score = structuredCloneJson(node(manifest, "score"));
  const commandSpec = buildFutureNodeExecutionSpec(score);
  score.execution_contract = {
    readiness: "node_executable",
    summary: "Synthetic executable command node for command failure testing.",
    node_execution_spec: commandSpec
  };
  const calls = [];

  const result = await executeDailyCodexDagCommandNode({
    rootDir,
    node: score,
    reportDate: "2026-07-03",
    runId: "daily-codex-dag:2026-07-03:command-failure-test",
    nodeExecutablePath: process.execPath,
    startedAt: "2026-07-03T08:00:00.000Z",
    finishedAt: "2026-07-03T08:00:02.000Z",
    executeCommand: async (invocation) => {
      calls.push(invocation);
      const error = new Error("SECRET_ERROR_SENTINEL");
      error.code = 7;
      error.stderr = "SECRET_STDERR_SENTINEL";
      throw error;
    }
  });

  assert.equal(result.ok, false);
  assert.equal(calls.length, 1);
  assert(
    result.failures.some((failure) => failure.includes("exit code 7")),
    result.failures.join("\n")
  );
  assert.equal(result.failures.some((failure) => failure.includes("SECRET_ERROR_SENTINEL")), false);
  assert.equal(result.failures.some((failure) => failure.includes("SECRET_STDERR_SENTINEL")), false);
  assert.equal(result.result.status, "failure");
  assert.equal(result.result.downstream_disposition, "block");
  assert.equal(result.result.duration_ms, 2000);
  assert.equal(result.result.attempts_started, 1);
  assert.equal(result.result.attempts_exhausted, true);
  assert.equal(result.result.failures.length, 1);
  assert.equal(result.result.failures[0].code, "command_execution_failed");
  assert(
    result.result.failures[0].message.includes("exit code 7"),
    result.result.failures[0].message
  );
  assert.equal(result.result.failures[0].message.includes("SECRET_ERROR_SENTINEL"), false);
  assert.equal(result.result.failures[0].message.includes("SECRET_STDERR_SENTINEL"), false);
  assert.equal(Object.hasOwn(result.result, "stdout"), false);
  assert.equal(Object.hasOwn(result.result, "stderr"), false);

  const validation = validateDailyCodexDagNodeResult(result.result);
  assert.equal(validation.ok, true, validation.failures.join("\n"));
});

test("daily codex DAG command node executor rejects preflight failures before execution", async () => {
  const manifest = await loadManifest();
  const score = structuredCloneJson(node(manifest, "score"));
  const commandSpec = buildFutureNodeExecutionSpec(score);
  let calls = 0;

  const result = await executeDailyCodexDagCommandNode({
    rootDir,
    node: score,
    spec: commandSpec,
    reportDate: "2026-07-03",
    runId: "daily-codex-dag:2026-07-03:command-preflight-test",
    nodeExecutablePath: process.execPath,
    executeCommand: async () => {
      calls += 1;
      return { exitCode: 0 };
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.result, null);
  assert.equal(result.runtime_plan, null);
  assert.equal(calls, 0);
  assert(
    result.failures.some((failure) => failure.includes("execution_contract.readiness must be node_executable")),
    result.failures.join("\n")
  );
});

test("daily codex DAG command node executor resolves real output artifact metadata from disk", async () => {
  const manifest = await loadManifest();
  const proofNode = structuredCloneJson(node(manifest, "fetch-source-health"));
  const artifactPath = [
    ".tmp",
    "daily-codex-pipeline",
    "command-artifact-proof",
    `summary-${process.pid}-${Date.now()}.json`
  ].join("/");
  const absoluteArtifactPath = path.join(rootDir, artifactPath);
  await fs.rm(absoluteArtifactPath, { force: true });

  proofNode.inputs = [];
  proofNode.outputs = [{ path: artifactPath, required: true }];
  const commandSpec = buildFutureNodeExecutionSpec(proofNode, {
    cwd: ".",
    invocation: {
      kind: "command",
      argv: [
        "node",
        "scripts/run-daily-codex-dag.mjs",
        "--dry-run",
        "--date",
        "2026-07-03",
        "--json",
        "--summary-path",
        artifactPath
      ]
    }
  });
  proofNode.execution_contract = {
    readiness: "node_executable",
    summary: "Synthetic executable command node that writes a real .tmp artifact.",
    node_execution_spec: commandSpec
  };

  const result = await executeDailyCodexDagCommandNode({
    rootDir,
    node: proofNode,
    reportDate: "2026-07-03",
    runId: "daily-codex-dag:2026-07-03:artifact-proof",
    nodeExecutablePath: process.execPath,
    startedAt: "2026-07-03T08:00:00.000Z",
    finishedAt: "2026-07-03T08:00:03.000Z"
  });

  const artifactBytes = await fs.readFile(absoluteArtifactPath);
  const artifactJson = JSON.parse(artifactBytes.toString("utf8"));
  assert.equal(artifactJson.mode, "daily_codex_dag_dry_run");
  assert.equal(result.ok, true, result.failures.join("\n"));
  assert.equal(result.result.status, "success");
  assert.deepEqual(result.result.resolved_inputs, []);
  assert.deepEqual(result.result.resolved_outputs, [{
    path: artifactPath,
    required: true,
    exists: true,
    schema_valid: true,
    bytes: artifactBytes.length,
    sha256: createHash("sha256").update(artifactBytes).digest("hex")
  }]);

  const validation = validateDailyCodexDagNodeResult(result.result);
  assert.equal(validation.ok, true, validation.failures.join("\n"));
  await fs.rm(absoluteArtifactPath, { force: true });
});

test("daily codex DAG command node executor fails structurally when a required output is missing", async () => {
  const manifest = await loadManifest();
  const proofNode = structuredCloneJson(node(manifest, "fetch-source-health"));
  const missingArtifactPath = [
    ".tmp",
    "daily-codex-pipeline",
    "command-artifact-proof",
    `missing-${process.pid}-${Date.now()}.json`
  ].join("/");
  const absoluteMissingArtifactPath = path.join(rootDir, missingArtifactPath);
  await fs.rm(absoluteMissingArtifactPath, { force: true });

  proofNode.inputs = [];
  proofNode.outputs = [{ path: missingArtifactPath, required: true }];
  const commandSpec = buildFutureNodeExecutionSpec(proofNode, {
    cwd: ".",
    invocation: {
      kind: "command",
      argv: ["node", "scripts/validate-daily-codex-dag.mjs"]
    }
  });
  proofNode.execution_contract = {
    readiness: "node_executable",
    summary: "Synthetic executable command node with a missing required output.",
    node_execution_spec: commandSpec
  };

  const result = await executeDailyCodexDagCommandNode({
    rootDir,
    node: proofNode,
    reportDate: "2026-07-03",
    runId: "daily-codex-dag:2026-07-03:artifact-missing",
    nodeExecutablePath: process.execPath,
    startedAt: "2026-07-03T08:00:00.000Z",
    finishedAt: "2026-07-03T08:00:01.000Z"
  });

  assert.equal(result.ok, false);
  assert(
    result.failures.some((failure) => failure.includes(`required output artifact ${missingArtifactPath} was not resolved`)),
    result.failures.join("\n")
  );
  assert.equal(result.result.status, "failure");
  assert.equal(result.result.downstream_disposition, "block");
  assert.equal(result.result.failures[0].code, "required_output_artifact_missing");
  assert.deepEqual(result.result.resolved_outputs, [{
    path: missingArtifactPath,
    required: true,
    exists: false,
    schema_valid: false,
    bytes: null,
    sha256: null
  }]);

  const validation = validateDailyCodexDagNodeResult(result.result);
  assert.equal(validation.ok, true, validation.failures.join("\n"));
});

test("daily codex DAG executable-node MVP runs one synthetic command node and emits a valid run summary", async () => {
  await removeExecutableNodeFixtureArtifacts();
  const result = await createDailyCodexDagExecutableNodeMvp({
    rootDir,
    reportDate: "2026-07-03",
    now: fixedNow,
    startedAt: "2026-07-03T08:00:00.000Z",
    finishedAt: "2026-07-03T08:00:01.000Z",
    nodeExecutablePath: process.execPath
  });

  assert.equal(result.ok, true, result.failures.join("\n"));
  assert.equal(result.mode, "daily_codex_dag_executable_node_mvp");
  assert.equal(result.run.final_status, "executed_one_node");
  assert.deepEqual(result.run.planned_nodes, ["synthetic-command-node"]);
  assert.deepEqual(result.run.completed_nodes, ["synthetic-command-node"]);
  assert.deepEqual(result.run.blocked_nodes, []);
  assert.equal(result.plan.node_count, 1);
  assert.equal(result.plan.nodes[0].execution_contract.readiness, "node_executable");
  assert.equal(Object.hasOwn(result.plan.nodes[0].execution_contract, "node_execution_spec"), false);
  assert.equal(result.node_results.length, 1);
  assert.equal(result.node_result_validation.ok, true, result.node_result_validation.failures.join("\n"));
  assert.equal(result.node_result_validation.checked_results, 1);
  const nodeResult = result.node_results[0];
  assert.equal(nodeResult.status, "success");
  assert.equal(nodeResult.downstream_disposition, "continue");
  assert.equal(nodeResult.node_id, "synthetic-command-node");
  assert.equal(nodeResult.duration_ms, 1000);
  assert.equal(nodeResult.declared_inputs.length, 1);
  assert.equal(nodeResult.declared_outputs.length, 1);
  assert.equal(nodeResult.resolved_inputs.length, 1);
  assert.equal(nodeResult.resolved_outputs.length, 1);
  assert.equal(nodeResult.resolved_inputs[0].path, nodeResult.declared_inputs[0].path);
  assert.equal(nodeResult.resolved_outputs[0].path, nodeResult.declared_outputs[0].path);
  assertResolvedArtifactMetadata(nodeResult.resolved_inputs[0]);
  assertResolvedArtifactMetadata(nodeResult.resolved_outputs[0]);
  assert.equal(Object.hasOwn(nodeResult, "stdout"), false);
  assert.equal(Object.hasOwn(nodeResult, "stderr"), false);
  assert.equal(result.executed_commands.length, 1);
  assert.deepEqual(Object.keys(result.executed_commands[0]).sort(), ["node_id", "runner", "script"]);
  assert.equal(result.codex_invocations.length, 0);

  const nodeResultValidation = validateDailyCodexDagNodeResult(nodeResult);
  assert.equal(nodeResultValidation.ok, true, nodeResultValidation.failures.join("\n"));
  await assertValidDagRunSummary(result);

  const manifest = await loadManifest();
  assert.equal(
    manifest.nodes.some((item) => Object.hasOwn(item.execution_contract || {}, "node_execution_spec")),
    false,
    "production manifest must remain untouched by executable-node MVP"
  );
  await removeExecutableNodeFixtureArtifacts();
});

test("daily codex DAG executable-node MVP records structured command failure without leaking streams", async () => {
  await removeExecutableNodeFixtureArtifacts();
  const result = await createDailyCodexDagExecutableNodeMvp({
    rootDir,
    reportDate: "2026-07-03",
    now: fixedNow,
    startedAt: "2026-07-03T08:00:00.000Z",
    finishedAt: "2026-07-03T08:00:01.000Z",
    nodeExecutablePath: process.execPath,
    executeCommand: async () => ({
      exitCode: 7,
      signal: null,
      stdout: "SECRET stdout payload",
      stderr: "SECRET stderr payload",
      errorMessage: "synthetic failure"
    })
  });

  assert.equal(result.ok, false);
  assert.equal(result.mode, "daily_codex_dag_executable_node_mvp");
  assert.equal(result.run.final_status, "blocked");
  assert.deepEqual(result.run.completed_nodes, []);
  assert.deepEqual(result.run.blocked_nodes, ["synthetic-command-node"]);
  assert.equal(result.node_results.length, 1);
  assert.equal(result.node_result_validation.ok, true, result.node_result_validation.failures.join("\n"));
  assert.equal(result.node_results[0].status, "failure");
  assert.equal(result.node_results[0].downstream_disposition, "block");
  assert.equal(result.node_results[0].attempts_exhausted, true);
  assert.equal(result.node_results[0].failures.length, 1);
  assert.equal(Object.hasOwn(result.node_results[0], "stdout"), false);
  assert.equal(Object.hasOwn(result.node_results[0], "stderr"), false);
  assert.equal(JSON.stringify(result).includes("SECRET"), false);

  const nodeResultValidation = validateDailyCodexDagNodeResult(result.node_results[0]);
  assert.equal(nodeResultValidation.ok, true, nodeResultValidation.failures.join("\n"));
  await assertValidDagRunSummary(result);
  await removeExecutableNodeFixtureArtifacts();
});

test("daily codex DAG executable-node MVP records structured artifact failure when output is missing", async () => {
  await removeExecutableNodeFixtureArtifacts();
  const result = await createDailyCodexDagExecutableNodeMvp({
    rootDir,
    reportDate: "2026-07-03",
    now: fixedNow,
    startedAt: "2026-07-03T08:00:00.000Z",
    finishedAt: "2026-07-03T08:00:01.000Z",
    nodeExecutablePath: process.execPath,
    executeCommand: async () => ({
      exitCode: 0,
      signal: null,
      stdout: "SECRET stdout payload",
      stderr: "SECRET stderr payload",
      errorMessage: ""
    })
  });

  assert.equal(result.ok, false);
  assert.equal(result.mode, "daily_codex_dag_executable_node_mvp");
  assert.equal(result.run.final_status, "blocked");
  assert.deepEqual(result.run.completed_nodes, []);
  assert.deepEqual(result.run.blocked_nodes, ["synthetic-command-node"]);
  assert.equal(result.node_results.length, 1);
  assert.equal(result.node_result_validation.ok, true, result.node_result_validation.failures.join("\n"));
  const nodeResult = result.node_results[0];
  assert.equal(nodeResult.status, "failure");
  assert.equal(nodeResult.downstream_disposition, "block");
  assert.equal(nodeResult.failures[0].code, "required_output_artifact_missing");
  assert.equal(nodeResult.resolved_inputs.length, 1);
  assert.equal(nodeResult.resolved_inputs[0].exists, true);
  assert.equal(nodeResult.resolved_inputs[0].schema_valid, true);
  assert.equal(nodeResult.resolved_outputs.length, 1);
  assert.equal(nodeResult.resolved_outputs[0].exists, false);
  assert.equal(nodeResult.resolved_outputs[0].schema_valid, false);
  assert.equal(Object.hasOwn(nodeResult, "stdout"), false);
  assert.equal(Object.hasOwn(nodeResult, "stderr"), false);
  assert.equal(JSON.stringify(result).includes("SECRET"), false);

  const nodeResultValidation = validateDailyCodexDagNodeResult(nodeResult);
  assert.equal(nodeResultValidation.ok, true, nodeResultValidation.failures.join("\n"));
  await assertValidDagRunSummary(result);
  await removeExecutableNodeFixtureArtifacts();
});

test("daily codex DAG executable-node MVP records structured artifact failure when output JSON is malformed", async () => {
  await removeExecutableNodeFixtureArtifacts();
  const result = await createDailyCodexDagExecutableNodeMvp({
    rootDir,
    reportDate: "2026-07-03",
    now: fixedNow,
    startedAt: "2026-07-03T08:00:00.000Z",
    finishedAt: "2026-07-03T08:00:01.000Z",
    nodeExecutablePath: process.execPath,
    executeCommand: async ({ runtime_plan }) => {
      const summaryPathIndex = runtime_plan.argv_tail.indexOf("--summary-path");
      const outputPath = runtime_plan.argv_tail[summaryPathIndex + 1];
      const absoluteOutputPath = path.resolve(rootDir, outputPath);
      await fs.mkdir(path.dirname(absoluteOutputPath), { recursive: true });
      await fs.writeFile(absoluteOutputPath, "{", "utf8");
      return {
        exitCode: 0,
        signal: null,
        stdout: "SECRET stdout payload",
        stderr: "SECRET stderr payload",
        errorMessage: ""
      };
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.run.final_status, "blocked");
  const nodeResult = result.node_results[0];
  assert.equal(nodeResult.status, "failure");
  assert.equal(nodeResult.failures[0].code, "required_output_artifact_invalid");
  assert.equal(nodeResult.resolved_outputs.length, 1);
  assert.equal(nodeResult.resolved_outputs[0].exists, true);
  assert.equal(nodeResult.resolved_outputs[0].schema_valid, false);
  assert(Number.isInteger(nodeResult.resolved_outputs[0].bytes) && nodeResult.resolved_outputs[0].bytes > 0);
  assert.match(nodeResult.resolved_outputs[0].sha256, /^[a-f0-9]{64}$/);
  assert.equal(Object.hasOwn(nodeResult, "stdout"), false);
  assert.equal(Object.hasOwn(nodeResult, "stderr"), false);
  assert.equal(JSON.stringify(result).includes("SECRET"), false);

  const nodeResultValidation = validateDailyCodexDagNodeResult(nodeResult);
  assert.equal(nodeResultValidation.ok, true, nodeResultValidation.failures.join("\n"));
  await assertValidDagRunSummary(result);
  await removeExecutableNodeFixtureArtifacts();
});

test("daily codex DAG real-node adapter MVP runs score fixture and emits a valid run summary", async () => {
  await removeRealNodeAdapterFixtureArtifacts();
  const result = await createDailyCodexDagRealNodeAdapterMvp({
    rootDir,
    reportDate: "2026-07-03",
    now: fixedNow,
    startedAt: "2026-07-03T08:00:00.000Z",
    finishedAt: "2026-07-03T08:00:01.000Z",
    nodeExecutablePath: process.execPath
  });

  assert.equal(result.ok, true, result.failures.join("\n"));
  assert.equal(result.mode, "daily_codex_dag_real_node_adapter_mvp");
  assert.equal(result.run.final_status, "executed_one_real_node");
  assert.deepEqual(result.run.planned_nodes, ["score"]);
  assert.deepEqual(result.run.completed_nodes, ["score"]);
  assert.deepEqual(result.run.blocked_nodes, []);
  assert.equal(result.plan.node_count, 1);
  assert.equal(result.plan.nodes[0].id, "score");
  assert.deepEqual(result.plan.nodes[0].dependencies, ["classify-tag-entity"]);
  assert.equal(result.plan.nodes[0].execution_contract.readiness, "node_executable");
  assert.equal(Object.hasOwn(result.plan.nodes[0].execution_contract, "node_execution_spec"), false);
  assert.equal(result.node_results.length, 1);
  assert.equal(result.node_result_validation.ok, true, result.node_result_validation.failures.join("\n"));
  const nodeResult = result.node_results[0];
  assert.equal(nodeResult.status, "success");
  assert.equal(nodeResult.node_id, "score");
  assert.equal(nodeResult.node_kind, "command");
  assert.equal(nodeResult.runner_stage_ref, "admit");
  assert.deepEqual(nodeResult.dependency_results.map((item) => item.node_id), ["classify-tag-entity"]);
  assert.equal(nodeResult.dependency_results[0].status, "success");
  assert.equal(nodeResult.audit.parallel_group, "item-lanes");
  assert.equal(nodeResult.declared_inputs[0].path, ".tmp/daily-codex-pipeline/{report_date}/artifacts/classified-candidates.json");
  assert.equal(nodeResult.declared_outputs[0].path, ".tmp/daily-codex-pipeline/{report_date}/artifacts/scored-candidates.json");
  assert.equal(nodeResult.resolved_inputs.length, 1);
  assert.equal(nodeResult.resolved_outputs.length, 1);
  assert.equal(nodeResult.resolved_inputs[0].path, nodeResult.declared_inputs[0].path);
  assert.equal(nodeResult.resolved_outputs[0].path, nodeResult.declared_outputs[0].path);
  assertResolvedArtifactMetadata(nodeResult.resolved_inputs[0]);
  assertResolvedArtifactMetadata(nodeResult.resolved_outputs[0]);
  assert.equal(Object.hasOwn(nodeResult, "stdout"), false);
  assert.equal(Object.hasOwn(nodeResult, "stderr"), false);
  assert.deepEqual(result.executed_commands, [{
    node_id: "score",
    runner: "node",
    script: "scripts/replay-daily-codex-dag-node-fixture.mjs"
  }]);
  assert.equal(result.codex_invocations.length, 0);

  await assertValidDagNodeResult(nodeResult);
  await assertValidDagRunSummary(result);

  const manifest = await loadManifest();
  assert.equal(
    manifest.nodes.some((item) => Object.hasOwn(item.execution_contract || {}, "node_execution_spec")),
    false,
    "production manifest must remain untouched by real-node adapter MVP"
  );
  await removeRealNodeAdapterFixtureArtifacts();
});

test("daily codex DAG real-node adapter MVP records structured artifact failure when output is missing", async () => {
  await removeRealNodeAdapterFixtureArtifacts();
  const result = await createDailyCodexDagRealNodeAdapterMvp({
    rootDir,
    reportDate: "2026-07-03",
    now: fixedNow,
    startedAt: "2026-07-03T08:00:00.000Z",
    finishedAt: "2026-07-03T08:00:01.000Z",
    nodeExecutablePath: process.execPath,
    executeCommand: async () => ({
      exitCode: 0,
      signal: null,
      stdout: "SECRET stdout payload",
      stderr: "SECRET stderr payload",
      errorMessage: ""
    })
  });

  assert.equal(result.ok, false);
  assert.equal(result.mode, "daily_codex_dag_real_node_adapter_mvp");
  assert.equal(result.run.final_status, "blocked");
  assert.deepEqual(result.run.completed_nodes, []);
  assert.deepEqual(result.run.blocked_nodes, ["score"]);
  assert.equal(result.node_results.length, 1);
  assert.equal(result.node_result_validation.ok, true, result.node_result_validation.failures.join("\n"));
  const nodeResult = result.node_results[0];
  assert.equal(nodeResult.node_id, "score");
  assert.equal(nodeResult.status, "failure");
  assert.equal(nodeResult.downstream_disposition, "block");
  assert.equal(nodeResult.failures[0].code, "required_output_artifact_missing");
  assert.equal(nodeResult.resolved_inputs[0].exists, true);
  assert.equal(nodeResult.resolved_inputs[0].schema_valid, true);
  assert.equal(nodeResult.resolved_outputs[0].exists, false);
  assert.equal(nodeResult.resolved_outputs[0].schema_valid, false);
  assert.equal(Object.hasOwn(nodeResult, "stdout"), false);
  assert.equal(Object.hasOwn(nodeResult, "stderr"), false);
  assert.equal(JSON.stringify(result).includes("SECRET"), false);

  await assertValidDagNodeResult(nodeResult);
  await assertValidDagRunSummary(result);
  await removeRealNodeAdapterFixtureArtifacts();
});

test("daily codex DAG real-node adapter MVP records structured artifact failure when output JSON is malformed", async () => {
  await removeRealNodeAdapterFixtureArtifacts();
  const result = await createDailyCodexDagRealNodeAdapterMvp({
    rootDir,
    reportDate: "2026-07-03",
    now: fixedNow,
    startedAt: "2026-07-03T08:00:00.000Z",
    finishedAt: "2026-07-03T08:00:01.000Z",
    nodeExecutablePath: process.execPath,
    executeCommand: async ({ runtime_plan }) => {
      const outputPathIndex = runtime_plan.argv_tail.indexOf("--output");
      const outputPath = runtime_plan.argv_tail[outputPathIndex + 1];
      const absoluteOutputPath = path.resolve(rootDir, outputPath);
      await fs.mkdir(path.dirname(absoluteOutputPath), { recursive: true });
      await fs.writeFile(absoluteOutputPath, "{", "utf8");
      return {
        exitCode: 0,
        signal: null,
        stdout: "SECRET stdout payload",
        stderr: "SECRET stderr payload",
        errorMessage: ""
      };
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.run.final_status, "blocked");
  const nodeResult = result.node_results[0];
  assert.equal(nodeResult.status, "failure");
  assert.equal(nodeResult.failures[0].code, "required_output_artifact_invalid");
  assert.equal(nodeResult.resolved_outputs[0].exists, true);
  assert.equal(nodeResult.resolved_outputs[0].schema_valid, false);
  assert(Number.isInteger(nodeResult.resolved_outputs[0].bytes) && nodeResult.resolved_outputs[0].bytes > 0);
  assert.match(nodeResult.resolved_outputs[0].sha256, /^[a-f0-9]{64}$/);
  assert.equal(Object.hasOwn(nodeResult, "stdout"), false);
  assert.equal(Object.hasOwn(nodeResult, "stderr"), false);
  assert.equal(JSON.stringify(result).includes("SECRET"), false);

  await assertValidDagNodeResult(nodeResult);
  await assertValidDagRunSummary(result);
  await removeRealNodeAdapterFixtureArtifacts();
});

test("daily codex DAG real-node adapter MVP summary validation pins the score production contract", async () => {
  await removeRealNodeAdapterFixtureArtifacts();
  const result = await createDailyCodexDagRealNodeAdapterMvp({
    rootDir,
    reportDate: "2026-07-03",
    now: fixedNow,
    startedAt: "2026-07-03T08:00:00.000Z",
    finishedAt: "2026-07-03T08:00:01.000Z",
    nodeExecutablePath: process.execPath
  });
  assert.equal(result.ok, true, result.failures.join("\n"));

  const tampered = structuredCloneJson(result);
  const replacementInput = ".tmp/daily-codex-pipeline/{report_date}/artifacts/other-candidates.json";
  tampered.plan.nodes[0].inputs[0].path = replacementInput;
  tampered.node_results[0].declared_inputs[0].path = replacementInput;
  tampered.node_results[0].resolved_inputs[0].path = replacementInput;

  await assertInvalidDagRunSummary(tampered);
  assertInvalidSemanticDagRunSummary(
    tampered,
    "real-node adapter MVP plan node.inputs must match the score production contract",
    "tampered score adapter summary"
  );
  await removeRealNodeAdapterFixtureArtifacts();
});

test("daily codex DAG source-watch collect MVP runs fetch-source-health fixture and summarizes source audit", async () => {
  const reportDate = "2026-07-06";
  await removeSourceWatchCollectFixtureArtifacts(reportDate);
  const result = await createDailyCodexDagSourceWatchCollectMvp({
    rootDir,
    reportDate,
    now: "2026-07-06T08:00:00.000Z",
    startedAt: "2026-07-06T08:00:00.000Z",
    finishedAt: "2026-07-06T08:00:01.000Z",
    nodeExecutablePath: process.execPath
  });

  assert.equal(result.ok, true, result.failures.join("\n"));
  assert.equal(result.mode, "daily_codex_dag_source_watch_collect_mvp");
  assert.equal(result.run.final_status, "executed_source_watch_collect");
  assert.deepEqual(result.run.planned_nodes, ["fetch-source-health"]);
  assert.deepEqual(result.run.completed_nodes, ["fetch-source-health"]);
  assert.deepEqual(result.run.blocked_nodes, []);
  assert.equal(result.plan.node_count, 1);
  assert.equal(result.plan.nodes[0].id, "fetch-source-health");
  assert.deepEqual(result.plan.nodes[0].dependencies, []);
  assert.equal(result.plan.nodes[0].execution_contract.readiness, "node_executable");
  assert.equal(Object.hasOwn(result.plan.nodes[0].execution_contract, "node_execution_spec"), false);
  assert.deepEqual(result.source_watch, {
    artifact_path: ".tmp/daily-codex-pipeline/{report_date}/artifacts/source-health.json",
    artifact_kind: "source_watch_candidates",
    watched_repos: 2,
    fetched_repos: 2,
    changed_repos: 0,
    watched_sites: 2,
    fetched_sites: 2,
    github_candidates_found: 2,
    site_candidates_found: 2,
    total_candidates_found: 4,
    failure_count: 0,
    empty: false,
    rate_limits: [{
      repo: "SalvatoreRa/ML-news-of-the-week",
      limit: "60",
      remaining: "58",
      used: "2",
      reset: "",
      resource: ""
    }, {
      repo: "taielab/awesome-ai-news",
      limit: "60",
      remaining: "54",
      used: "6",
      reset: "",
      resource: ""
    }]
  });
  assert.equal(result.node_results.length, 1);
  assert.equal(result.node_result_validation.ok, true, result.node_result_validation.failures.join("\n"));
  const nodeResult = result.node_results[0];
  assert.equal(nodeResult.node_id, "fetch-source-health");
  assert.equal(nodeResult.node_kind, "command");
  assert.equal(nodeResult.runner_stage_ref, "collect");
  assert.equal(nodeResult.status, "success");
  assert.deepEqual(nodeResult.dependency_results, []);
  assert.deepEqual(nodeResult.declared_inputs, []);
  assert.equal(nodeResult.declared_outputs[0].path, ".tmp/daily-codex-pipeline/{report_date}/artifacts/source-health.json");
  assert.deepEqual(nodeResult.resolved_inputs, []);
  assert.equal(nodeResult.resolved_outputs.length, 1);
  assertResolvedArtifactMetadata(nodeResult.resolved_outputs[0]);
  assert.equal(Object.hasOwn(nodeResult, "stdout"), false);
  assert.equal(Object.hasOwn(nodeResult, "stderr"), false);
  assert.deepEqual(result.executed_commands, [{
    node_id: "fetch-source-health",
    runner: "node",
    script: "scripts/run-source-watch-collect-fixture.mjs"
  }]);
  assert.equal(result.codex_invocations.length, 0);
  assert.equal(JSON.stringify(result).includes("ML news of the week tracks machine learning updates"), false);

  const artifactPath = path.join(rootDir, ".tmp", "daily-codex-pipeline", reportDate, "artifacts", "source-health.json");
  const artifact = JSON.parse(await fs.readFile(artifactPath, "utf8"));
  assert.equal(artifact.kind, "source_watch_candidates");
  assert.equal(artifact.candidates.length, 4);
  assert.equal(artifact.source_audit.github_watch.watched_repos, 2);
  assert.equal(artifact.source_audit.github_watch.fetched_repos, 2);
  assert.equal(artifact.source_audit.site_watch.watched_sites, 2);
  assert.equal(artifact.source_audit.site_watch.fetched_sites, 2);

  await assertValidDagNodeResult(nodeResult);
  await assertValidDagRunSummary(result);
  await removeSourceWatchCollectFixtureArtifacts(reportDate);
});

test("daily codex DAG source-watch collect MVP summary validation rejects inconsistent source-watch status", async () => {
  const reportDate = "2026-07-06";
  await removeSourceWatchCollectFixtureArtifacts(reportDate);
  const result = await createDailyCodexDagSourceWatchCollectMvp({
    rootDir,
    reportDate,
    now: "2026-07-06T08:00:00.000Z",
    startedAt: "2026-07-06T08:00:00.000Z",
    finishedAt: "2026-07-06T08:00:01.000Z",
    nodeExecutablePath: process.execPath
  });
  assert.equal(result.ok, true, result.failures.join("\n"));

  const wrongTotal = structuredCloneJson(result);
  wrongTotal.source_watch.total_candidates_found = 3;
  assertInvalidSemanticDagRunSummary(
    wrongTotal,
    "total_candidates_found must equal github_candidates_found plus site_candidates_found",
    "tampered source-watch total"
  );

  const wrongEmpty = structuredCloneJson(result);
  wrongEmpty.source_watch.empty = true;
  assertInvalidSemanticDagRunSummary(
    wrongEmpty,
    "empty must reflect whether total_candidates_found is zero",
    "tampered source-watch empty state"
  );

  const wrongFetchedRepos = structuredCloneJson(result);
  wrongFetchedRepos.source_watch.fetched_repos = 3;
  assertInvalidSemanticDagRunSummary(
    wrongFetchedRepos,
    "fetched_repos must not exceed watched_repos",
    "tampered source-watch fetched repos"
  );

  const wrongChangedRepos = structuredCloneJson(result);
  wrongChangedRepos.source_watch.changed_repos = 3;
  assertInvalidSemanticDagRunSummary(
    wrongChangedRepos,
    "changed_repos must not exceed fetched_repos",
    "tampered source-watch changed repos"
  );

  const wrongFetchedSites = structuredCloneJson(result);
  wrongFetchedSites.source_watch.fetched_sites = 3;
  assertInvalidSemanticDagRunSummary(
    wrongFetchedSites,
    "fetched_sites must not exceed watched_sites",
    "tampered source-watch fetched sites"
  );

  await removeSourceWatchCollectFixtureArtifacts(reportDate);
});

test("daily codex DAG source-watch downstream MVP consumes source-health artifact into parse-extract output", async () => {
  const reportDate = "2026-07-06";
  await removeSourceWatchDownstreamFixtureArtifacts(reportDate);
  const result = await createDailyCodexDagSourceWatchDownstreamMvp({
    rootDir,
    reportDate,
    now: "2026-07-06T08:00:00.000Z",
    startedAt: "2026-07-06T08:00:00.000Z",
    finishedAt: "2026-07-06T08:00:01.000Z",
    nodeExecutablePath: process.execPath
  });

  assert.equal(result.ok, true, result.failures.join("\n"));
  assert.equal(result.mode, "daily_codex_dag_source_watch_downstream_mvp");
  assert.equal(result.run.final_status, "executed_source_watch_downstream");
  assert.deepEqual(result.run.planned_nodes, ["fetch-source-health", "parse-extract"]);
  assert.deepEqual(result.run.completed_nodes, ["fetch-source-health", "parse-extract"]);
  assert.deepEqual(result.run.blocked_nodes, []);
  assert.equal(result.plan.node_count, 2);
  assert.deepEqual(result.plan.levels, [
    { level: 0, node_ids: ["fetch-source-health"] },
    { level: 1, node_ids: ["parse-extract"] }
  ]);
  assert.deepEqual(result.plan.nodes.map((node) => node.id), ["fetch-source-health", "parse-extract"]);
  assert.deepEqual(result.plan.nodes[0].dependencies, []);
  assert.deepEqual(result.plan.nodes[1].dependencies, ["fetch-source-health"]);
  assert.equal(result.source_watch.total_candidates_found, 4);
  assert.deepEqual(result.downstream, {
    artifact_path: ".tmp/daily-codex-pipeline/{report_date}/artifacts/extracted-candidates.json",
    artifact_kind: "source_watch_extracted_candidates",
    input_kind: "source_watch_candidates",
    total_candidates: 4,
    github_watch_candidates: 2,
    site_watch_candidates: 2,
    other_candidates: 0,
    empty: false,
    signals: ["github_watch", "site_watch"]
  });
  assert.equal(result.node_results.length, 2);
  assert.equal(result.node_result_validation.ok, true, result.node_result_validation.failures.join("\n"));

  const [collectResult, downstreamResult] = result.node_results;
  assert.equal(collectResult.node_id, "fetch-source-health");
  assert.equal(collectResult.status, "success");
  assert.equal(downstreamResult.node_id, "parse-extract");
  assert.equal(downstreamResult.node_kind, "command");
  assert.equal(downstreamResult.runner_stage_ref, "collect");
  assert.equal(downstreamResult.status, "success");
  assert.equal(downstreamResult.dependency_results[0].node_id, "fetch-source-health");
  assert.equal(downstreamResult.dependency_results[0].execution_id, collectResult.execution_id);
  assert.equal(downstreamResult.dependency_results[0].status, "success");
  assert.equal(downstreamResult.declared_inputs[0].path, ".tmp/daily-codex-pipeline/{report_date}/artifacts/source-health.json");
  assert.equal(downstreamResult.declared_outputs[0].path, ".tmp/daily-codex-pipeline/{report_date}/artifacts/extracted-candidates.json");
  assert.equal(downstreamResult.resolved_inputs[0].path, collectResult.resolved_outputs[0].path);
  assertResolvedArtifactMetadata(collectResult.resolved_outputs[0]);
  assertResolvedArtifactMetadata(downstreamResult.resolved_inputs[0]);
  assertResolvedArtifactMetadata(downstreamResult.resolved_outputs[0]);
  assert.equal(Object.hasOwn(collectResult, "stdout"), false);
  assert.equal(Object.hasOwn(collectResult, "stderr"), false);
  assert.equal(Object.hasOwn(downstreamResult, "stdout"), false);
  assert.equal(Object.hasOwn(downstreamResult, "stderr"), false);
  assert.deepEqual(result.executed_commands, [{
    node_id: "fetch-source-health",
    runner: "node",
    script: "scripts/run-source-watch-collect-fixture.mjs"
  }, {
    node_id: "parse-extract",
    runner: "node",
    script: "scripts/run-source-watch-downstream-fixture.mjs"
  }]);
  assert.equal(result.codex_invocations.length, 0);
  assert.equal(JSON.stringify(result).includes("ML news of the week tracks machine learning updates"), false);

  const artifactPath = path.join(rootDir, ".tmp", "daily-codex-pipeline", reportDate, "artifacts", "extracted-candidates.json");
  const artifact = JSON.parse(await fs.readFile(artifactPath, "utf8"));
  assert.equal(artifact.kind, "source_watch_extracted_candidates");
  assert.equal(artifact.input_kind, "source_watch_candidates");
  assert.equal(artifact.candidates.length, 4);
  assert.deepEqual(artifact.signal_counts, { github_watch: 2, site_watch: 2 });
  assert(artifact.candidates.some((candidate) => candidate.signal === "github_watch"));
  assert(artifact.candidates.some((candidate) => candidate.signal === "site_watch"));
  assertAifyLaneCandidate(artifact.candidates.find((candidate) => candidate.source_id === "site-aify-news"));
  assert.equal(JSON.stringify(artifact).includes("ML news of the week tracks machine learning updates"), false);

  const wrongTotal = structuredCloneJson(result);
  wrongTotal.downstream.total_candidates = 3;
  assertInvalidSemanticDagRunSummary(
    wrongTotal,
    "downstream.total_candidates must equal source_watch.total_candidates_found",
    "tampered downstream total"
  );

  await assertValidDagNodeResult(collectResult);
  await assertValidDagNodeResult(downstreamResult);
  await assertValidDagRunSummary(result);
  await removeSourceWatchDownstreamFixtureArtifacts(reportDate);
});

test("daily codex DAG source-watch downstream MVP blocks parse-extract when collect command fails", async () => {
  const reportDate = "2026-07-06";
  await removeSourceWatchDownstreamFixtureArtifacts(reportDate);
  const result = await createDailyCodexDagSourceWatchDownstreamMvp({
    rootDir,
    reportDate,
    now: "2026-07-06T08:00:00.000Z",
    startedAt: "2026-07-06T08:00:00.000Z",
    finishedAt: "2026-07-06T08:00:01.000Z",
    nodeExecutablePath: process.execPath,
    async executeCommand({ args }) {
      if (argsIncludeScript(args, "scripts/run-source-watch-collect-fixture.mjs")) {
        return { exitCode: 1, stdout: "{\"ok\":false,\"failures\":[\"fixture collect failed\"]}", stderr: "" };
      }
      assert.fail("parse-extract command must not run when collect fails");
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.mode, "daily_codex_dag_source_watch_downstream_mvp");
  assert.equal(result.run.final_status, "blocked");
  assert.deepEqual(result.run.completed_nodes, []);
  assert.deepEqual(result.run.blocked_nodes, ["fetch-source-health", "parse-extract"]);
  assert.equal(result.executed_commands.length, 1);
  assert.equal(result.executed_commands[0].node_id, "fetch-source-health");
  const [collectResult, downstreamResult] = result.node_results;
  assert.equal(collectResult.node_id, "fetch-source-health");
  assert.equal(collectResult.status, "failure");
  assert.equal(downstreamResult.node_id, "parse-extract");
  assert.equal(downstreamResult.status, "blocked");
  assert.equal(downstreamResult.audit.resilience_policy_ref, "discover_content_sources");
  assert.equal(downstreamResult.dependency_results[0].node_id, "fetch-source-health");
  assert.equal(downstreamResult.dependency_results[0].status, "failure");
  assert.equal(downstreamResult.resolved_inputs.length, 0);
  assert.equal(downstreamResult.resolved_outputs.length, 0);
  assert.equal(Object.hasOwn(collectResult, "stdout"), false);
  assert.equal(Object.hasOwn(downstreamResult, "stderr"), false);
  assert(result.failures.some((failure) => failure.includes("exit code 1")), result.failures.join("\n"));
  assert.equal(JSON.stringify(result).includes("fixture collect failed"), false);
  assert.equal(JSON.stringify(result.failures).includes("could not be summarized"), false);

  await assertValidDagNodeResult(collectResult);
  await assertValidDagNodeResult(downstreamResult);
  await assertValidDagRunSummary(result);
  await removeSourceWatchDownstreamFixtureArtifacts(reportDate);
});

test("daily codex DAG source-watch normalize MVP consumes extracted candidates into canonical candidates", async () => {
  const reportDate = "2026-07-06";
  await removeSourceWatchNormalizeFixtureArtifacts(reportDate);
  const result = await createDailyCodexDagSourceWatchNormalizeMvp({
    rootDir,
    reportDate,
    now: "2026-07-06T08:00:00.000Z",
    startedAt: "2026-07-06T08:00:00.000Z",
    finishedAt: "2026-07-06T08:00:01.000Z",
    nodeExecutablePath: process.execPath
  });

  assert.equal(result.ok, true, result.failures.join("\n"));
  assert.equal(result.mode, "daily_codex_dag_source_watch_normalize_mvp");
  assert.equal(result.run.final_status, "executed_source_watch_normalize");
  assert.deepEqual(result.run.planned_nodes, ["fetch-source-health", "parse-extract", "normalize-canonicalize"]);
  assert.deepEqual(result.run.completed_nodes, ["fetch-source-health", "parse-extract", "normalize-canonicalize"]);
  assert.deepEqual(result.run.blocked_nodes, []);
  assert.equal(result.plan.node_count, 3);
  assert.deepEqual(result.plan.levels, [
    { level: 0, node_ids: ["fetch-source-health"] },
    { level: 1, node_ids: ["parse-extract"] },
    { level: 2, node_ids: ["normalize-canonicalize"] }
  ]);
  assert.deepEqual(result.plan.nodes.map((node) => node.id), ["fetch-source-health", "parse-extract", "normalize-canonicalize"]);
  assert.deepEqual(result.plan.nodes[2].dependencies, ["parse-extract"]);
  assert.equal(result.source_watch.total_candidates_found, 4);
  assert.equal(result.downstream.total_candidates, 4);
  assert.deepEqual(result.normalized, {
    artifact_path: ".tmp/daily-codex-pipeline/{report_date}/artifacts/canonical-candidates.json",
    artifact_kind: "source_watch_canonical_candidates",
    input_kind: "source_watch_extracted_candidates",
    total_candidates: 4,
    github_watch_candidates: 2,
    site_watch_candidates: 2,
    other_candidates: 0,
    empty: false,
    signals: ["github_watch", "site_watch"]
  });
  assert.equal(result.node_results.length, 3);
  assert.equal(result.node_result_validation.ok, true, result.node_result_validation.failures.join("\n"));

  const [collectResult, downstreamResult, normalizeResult] = result.node_results;
  assert.equal(normalizeResult.node_id, "normalize-canonicalize");
  assert.equal(normalizeResult.node_kind, "command");
  assert.equal(normalizeResult.runner_stage_ref, "collect");
  assert.equal(normalizeResult.status, "success");
  assert.equal(normalizeResult.dependency_results[0].node_id, "parse-extract");
  assert.equal(normalizeResult.dependency_results[0].execution_id, downstreamResult.execution_id);
  assert.equal(normalizeResult.dependency_results[0].status, "success");
  assert.equal(normalizeResult.declared_inputs[0].path, ".tmp/daily-codex-pipeline/{report_date}/artifacts/extracted-candidates.json");
  assert.equal(normalizeResult.declared_outputs[0].path, ".tmp/daily-codex-pipeline/{report_date}/artifacts/canonical-candidates.json");
  assert.equal(normalizeResult.resolved_inputs[0].path, downstreamResult.resolved_outputs[0].path);
  assertResolvedArtifactMetadata(collectResult.resolved_outputs[0]);
  assertResolvedArtifactMetadata(downstreamResult.resolved_outputs[0]);
  assertResolvedArtifactMetadata(normalizeResult.resolved_inputs[0]);
  assertResolvedArtifactMetadata(normalizeResult.resolved_outputs[0]);
  assert.equal(Object.hasOwn(normalizeResult, "stdout"), false);
  assert.equal(Object.hasOwn(normalizeResult, "stderr"), false);
  assert.deepEqual(result.executed_commands, [{
    node_id: "fetch-source-health",
    runner: "node",
    script: "scripts/run-source-watch-collect-fixture.mjs"
  }, {
    node_id: "parse-extract",
    runner: "node",
    script: "scripts/run-source-watch-downstream-fixture.mjs"
  }, {
    node_id: "normalize-canonicalize",
    runner: "node",
    script: "scripts/run-source-watch-normalize-fixture.mjs"
  }]);
  assert.equal(result.codex_invocations.length, 0);
  assert.equal(JSON.stringify(result).includes("ML news of the week tracks machine learning updates"), false);

  const artifactPath = path.join(rootDir, ".tmp", "daily-codex-pipeline", reportDate, "artifacts", "canonical-candidates.json");
  const artifact = JSON.parse(await fs.readFile(artifactPath, "utf8"));
  assert.equal(artifact.kind, "source_watch_canonical_candidates");
  assert.equal(artifact.input_kind, "source_watch_extracted_candidates");
  assert.equal(artifact.candidates.length, 4);
  assert.deepEqual(artifact.signal_counts, { github_watch: 2, site_watch: 2 });
  assert(artifact.candidates.every((candidate) => typeof candidate.canonical_id === "string" && candidate.canonical_id.startsWith("source-watch:")));
  assert(artifact.candidates.every((candidate) => typeof candidate.canonical_url === "string"));
  assertAifyLaneCandidate(artifact.candidates.find((candidate) => candidate.source_id === "site-aify-news"));
  assert.equal(JSON.stringify(artifact).includes("ML news of the week tracks machine learning updates"), false);

  const wrongTotal = structuredCloneJson(result);
  wrongTotal.normalized.total_candidates = 3;
  assertInvalidSemanticDagRunSummary(
    wrongTotal,
    "normalized.total_candidates must equal downstream.total_candidates",
    "tampered normalized total"
  );

  await assertValidDagNodeResult(collectResult);
  await assertValidDagNodeResult(downstreamResult);
  await assertValidDagNodeResult(normalizeResult);
  await assertValidDagRunSummary(result);
  await removeSourceWatchNormalizeFixtureArtifacts(reportDate);
});

test("daily codex DAG source-watch normalize MVP blocks parse and normalize when collect fails", async () => {
  const reportDate = "2026-07-06";
  await removeSourceWatchNormalizeFixtureArtifacts(reportDate);
  const result = await createDailyCodexDagSourceWatchNormalizeMvp({
    rootDir,
    reportDate,
    now: "2026-07-06T08:00:00.000Z",
    startedAt: "2026-07-06T08:00:00.000Z",
    finishedAt: "2026-07-06T08:00:01.000Z",
    nodeExecutablePath: process.execPath,
    async executeCommand({ args }) {
      if (argsIncludeScript(args, "scripts/run-source-watch-collect-fixture.mjs")) {
        return { exitCode: 1, stdout: "{\"ok\":false,\"failures\":[\"fixture collect failed\"]}", stderr: "" };
      }
      assert.fail("downstream commands must not run when collect fails");
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.mode, "daily_codex_dag_source_watch_normalize_mvp");
  assert.equal(result.run.final_status, "blocked");
  assert.deepEqual(result.run.completed_nodes, []);
  assert.deepEqual(result.run.blocked_nodes, ["fetch-source-health", "parse-extract", "normalize-canonicalize"]);
  assert.equal(result.executed_commands.length, 1);
  assert.equal(result.executed_commands[0].node_id, "fetch-source-health");
  const [collectResult, downstreamResult, normalizeResult] = result.node_results;
  assert.equal(collectResult.status, "failure");
  assert.equal(downstreamResult.node_id, "parse-extract");
  assert.equal(downstreamResult.status, "blocked");
  assert.equal(normalizeResult.node_id, "normalize-canonicalize");
  assert.equal(normalizeResult.status, "blocked");
  assert.equal(normalizeResult.dependency_results[0].node_id, "parse-extract");
  assert.equal(normalizeResult.dependency_results[0].execution_id, downstreamResult.execution_id);
  assert.equal(normalizeResult.dependency_results[0].status, "blocked");
  assert.equal(normalizeResult.failures[0].source, "daily-codex-dag-source-watch-normalize-fixture");
  assert.equal(normalizeResult.resolved_inputs.length, 0);
  assert.equal(normalizeResult.resolved_outputs.length, 0);
  assert.equal(Object.hasOwn(collectResult, "stdout"), false);
  assert.equal(Object.hasOwn(normalizeResult, "stderr"), false);
  assert(result.failures.some((failure) => failure.includes("exit code 1")), result.failures.join("\n"));
  assert.equal(JSON.stringify(result).includes("fixture collect failed"), false);
  assert.equal(JSON.stringify(result.failures).includes("could not be summarized"), false);

  await assertValidDagNodeResult(collectResult);
  await assertValidDagNodeResult(downstreamResult);
  await assertValidDagNodeResult(normalizeResult);
  await assertValidDagRunSummary(result);
  await removeSourceWatchNormalizeFixtureArtifacts(reportDate);
});

test("daily codex DAG source-watch normalize MVP blocks normalize when parse-extract fails", async () => {
  const reportDate = "2026-07-06";
  await removeSourceWatchNormalizeFixtureArtifacts(reportDate);
  const result = await createDailyCodexDagSourceWatchNormalizeMvp({
    rootDir,
    reportDate,
    now: "2026-07-06T08:00:00.000Z",
    startedAt: "2026-07-06T08:00:00.000Z",
    finishedAt: "2026-07-06T08:00:01.000Z",
    nodeExecutablePath: process.execPath,
    async executeCommand(invocation) {
      if (argsIncludeScript(invocation.args, "scripts/run-source-watch-collect-fixture.mjs")) {
        return runCommandForTest(invocation);
      }
      if (argsIncludeScript(invocation.args, "scripts/run-source-watch-downstream-fixture.mjs")) {
        return { exitCode: 1, stdout: "{\"ok\":false,\"failures\":[\"SECRET parse failed\"]}", stderr: "SECRET parse stderr" };
      }
      assert.fail("normalize-canonicalize command must not run when parse-extract fails");
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.mode, "daily_codex_dag_source_watch_normalize_mvp");
  assert.equal(result.run.final_status, "blocked");
  assert.deepEqual(result.run.completed_nodes, ["fetch-source-health"]);
  assert.deepEqual(result.run.blocked_nodes, ["parse-extract", "normalize-canonicalize"]);
  assert.equal(result.source_watch.total_candidates_found, 4);
  assert.equal(result.downstream.total_candidates, 0);
  assert.equal(result.normalized.total_candidates, 0);
  assert.deepEqual(result.executed_commands.map((command) => command.node_id), ["fetch-source-health", "parse-extract"]);
  const [collectResult, downstreamResult, normalizeResult] = result.node_results;
  assert.equal(collectResult.status, "success");
  assert.equal(downstreamResult.status, "failure");
  assert.equal(normalizeResult.status, "blocked");
  assert.equal(normalizeResult.dependency_results[0].node_id, "parse-extract");
  assert.equal(normalizeResult.dependency_results[0].execution_id, downstreamResult.execution_id);
  assert.equal(normalizeResult.dependency_results[0].status, "failure");
  assert.equal(normalizeResult.failures[0].source, "daily-codex-dag-source-watch-normalize-fixture");
  assert.equal(Object.hasOwn(downstreamResult, "stdout"), false);
  assert.equal(Object.hasOwn(normalizeResult, "stderr"), false);
  assert(result.failures.some((failure) => failure.includes("exit code 1")), result.failures.join("\n"));
  assert.equal(JSON.stringify(result).includes("SECRET parse"), false);
  assert.equal(JSON.stringify(result.failures).includes("downstream.total_candidates must equal source_watch.total_candidates_found"), false);
  assert.equal(JSON.stringify(result.failures).includes("normalized.total_candidates must equal downstream.total_candidates"), false);

  await assertValidDagNodeResult(collectResult);
  await assertValidDagNodeResult(downstreamResult);
  await assertValidDagNodeResult(normalizeResult);
  await assertValidDagRunSummary(result);
  await removeSourceWatchNormalizeFixtureArtifacts(reportDate);
});

test("daily codex DAG source-watch normalize MVP records structured normalize failure after parse succeeds", async () => {
  const reportDate = "2026-07-06";
  await removeSourceWatchNormalizeFixtureArtifacts(reportDate);
  const result = await createDailyCodexDagSourceWatchNormalizeMvp({
    rootDir,
    reportDate,
    now: "2026-07-06T08:00:00.000Z",
    startedAt: "2026-07-06T08:00:00.000Z",
    finishedAt: "2026-07-06T08:00:01.000Z",
    nodeExecutablePath: process.execPath,
    async executeCommand(invocation) {
      if (
        argsIncludeScript(invocation.args, "scripts/run-source-watch-collect-fixture.mjs")
        || argsIncludeScript(invocation.args, "scripts/run-source-watch-downstream-fixture.mjs")
      ) {
        return runCommandForTest(invocation);
      }
      if (argsIncludeScript(invocation.args, "scripts/run-source-watch-normalize-fixture.mjs")) {
        return { exitCode: 1, stdout: "{\"ok\":false,\"failures\":[\"SECRET normalize failed\"]}", stderr: "SECRET normalize stderr" };
      }
      assert.fail(`unexpected command: ${invocation.args.join(" ")}`);
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.mode, "daily_codex_dag_source_watch_normalize_mvp");
  assert.equal(result.run.final_status, "blocked");
  assert.deepEqual(result.run.completed_nodes, ["fetch-source-health", "parse-extract"]);
  assert.deepEqual(result.run.blocked_nodes, ["normalize-canonicalize"]);
  assert.equal(result.source_watch.total_candidates_found, 4);
  assert.equal(result.downstream.total_candidates, 4);
  assert.equal(result.normalized.total_candidates, 0);
  assert.deepEqual(result.executed_commands.map((command) => command.node_id), ["fetch-source-health", "parse-extract", "normalize-canonicalize"]);
  const [collectResult, downstreamResult, normalizeResult] = result.node_results;
  assert.equal(collectResult.status, "success");
  assert.equal(downstreamResult.status, "success");
  assert.equal(normalizeResult.status, "failure");
  assert.equal(normalizeResult.dependency_results[0].node_id, "parse-extract");
  assert.equal(normalizeResult.dependency_results[0].execution_id, downstreamResult.execution_id);
  assert.equal(normalizeResult.dependency_results[0].status, "success");
  assert.equal(normalizeResult.resolved_inputs[0].path, downstreamResult.resolved_outputs[0].path);
  assert.equal(Object.hasOwn(normalizeResult, "stdout"), false);
  assert.equal(Object.hasOwn(normalizeResult, "stderr"), false);
  assert(result.failures.some((failure) => failure.includes("exit code 1")), result.failures.join("\n"));
  assert.equal(JSON.stringify(result).includes("SECRET normalize"), false);
  assert.equal(JSON.stringify(result.failures).includes("normalized.total_candidates must equal downstream.total_candidates"), false);

  await assertValidDagNodeResult(collectResult);
  await assertValidDagNodeResult(downstreamResult);
  await assertValidDagNodeResult(normalizeResult);
  await assertValidDagRunSummary(result);
  await removeSourceWatchNormalizeFixtureArtifacts(reportDate);
});

test("daily codex DAG source-watch quality MVP consumes canonical candidates into quality candidates", async () => {
  const reportDate = "2026-07-06";
  await removeSourceWatchQualityFixtureArtifacts(reportDate);
  const result = await createDailyCodexDagSourceWatchQualityMvp({
    rootDir,
    reportDate,
    now: "2026-07-06T08:00:00.000Z",
    startedAt: "2026-07-06T08:00:00.000Z",
    finishedAt: "2026-07-06T08:00:01.000Z",
    nodeExecutablePath: process.execPath
  });

  assert.equal(result.ok, true, result.failures.join("\n"));
  assert.equal(result.mode, "daily_codex_dag_source_watch_quality_mvp");
  assert.equal(result.run.final_status, "executed_source_watch_quality");
  assert.deepEqual(result.run.planned_nodes, ["fetch-source-health", "parse-extract", "normalize-canonicalize", "freshness-history-check"]);
  assert.deepEqual(result.run.completed_nodes, ["fetch-source-health", "parse-extract", "normalize-canonicalize", "freshness-history-check"]);
  assert.deepEqual(result.run.blocked_nodes, []);
  assert.equal(result.plan.node_count, 4);
  assert.deepEqual(result.plan.levels, [
    { level: 0, node_ids: ["fetch-source-health"] },
    { level: 1, node_ids: ["parse-extract"] },
    { level: 2, node_ids: ["normalize-canonicalize"] },
    { level: 3, node_ids: ["freshness-history-check"] }
  ]);
  assert.equal(result.source_watch.total_candidates_found, 4);
  assert.equal(result.downstream.total_candidates, 4);
  assert.equal(result.normalized.total_candidates, 4);
  assert.deepEqual(result.quality, {
    artifact_path: ".tmp/daily-codex-pipeline/{report_date}/artifacts/quality-candidates.json",
    artifact_kind: "source_watch_quality_candidates",
    input_kind: "source_watch_canonical_candidates",
    total_candidates: 4,
    admitted_candidates: 3,
    suppressed_candidates: 1,
    duplicate_candidates: 0,
    stale_candidates: 1,
    unchanged_repo_candidates: 1,
    github_watch_candidates: 2,
    site_watch_candidates: 2,
    other_candidates: 0,
    empty: false,
    signals: ["github_watch", "site_watch"],
    suppressed_reasons: ["repo_unchanged", "seen_recently"],
    public_surface: false
  });
  assert.equal(result.node_results.length, 4);
  assert.equal(result.node_result_validation.ok, true, result.node_result_validation.failures.join("\n"));

  const [collectResult, downstreamResult, normalizeResult, qualityResult] = result.node_results;
  assert.equal(qualityResult.node_id, "freshness-history-check");
  assert.equal(qualityResult.node_kind, "command");
  assert.equal(qualityResult.runner_stage_ref, "admit");
  assert.equal(qualityResult.status, "success");
  assert.equal(qualityResult.dependency_results[0].node_id, "normalize-canonicalize");
  assert.equal(qualityResult.dependency_results[0].execution_id, normalizeResult.execution_id);
  assert.equal(qualityResult.declared_inputs[0].path, ".tmp/daily-codex-pipeline/{report_date}/artifacts/canonical-candidates.json");
  assert.equal(qualityResult.declared_outputs[0].path, ".tmp/daily-codex-pipeline/{report_date}/artifacts/quality-candidates.json");
  assert.equal(qualityResult.resolved_inputs[0].path, normalizeResult.resolved_outputs[0].path);
  for (const artifact of [
    collectResult.resolved_outputs[0],
    downstreamResult.resolved_outputs[0],
    normalizeResult.resolved_outputs[0],
    qualityResult.resolved_inputs[0],
    qualityResult.resolved_outputs[0]
  ]) {
    assertResolvedArtifactMetadata(artifact);
  }
  assert.equal(Object.hasOwn(qualityResult, "stdout"), false);
  assert.equal(Object.hasOwn(qualityResult, "stderr"), false);
  assert.deepEqual(result.executed_commands, [{
    node_id: "fetch-source-health",
    runner: "node",
    script: "scripts/run-source-watch-collect-fixture.mjs"
  }, {
    node_id: "parse-extract",
    runner: "node",
    script: "scripts/run-source-watch-downstream-fixture.mjs"
  }, {
    node_id: "normalize-canonicalize",
    runner: "node",
    script: "scripts/run-source-watch-normalize-fixture.mjs"
  }, {
    node_id: "freshness-history-check",
    runner: "node",
    script: "scripts/run-source-watch-quality-fixture.mjs"
  }]);
  assert.equal(result.codex_invocations.length, 0);
  assert.equal(JSON.stringify(result).includes("ML news of the week tracks machine learning updates"), false);

  const artifactPath = path.join(rootDir, ".tmp", "daily-codex-pipeline", reportDate, "artifacts", "quality-candidates.json");
  const artifact = JSON.parse(await fs.readFile(artifactPath, "utf8"));
  assert.equal(artifact.kind, "source_watch_quality_candidates");
  assert.equal(artifact.input_kind, "source_watch_canonical_candidates");
  assert.equal(artifact.candidates.length, 4);
  assert.deepEqual(artifact.signal_counts, { github_watch: 2, site_watch: 2 });
  assert.equal(artifact.quality_audit.public_surface, false);
  const changedRepo = artifact.candidates.find((candidate) => candidate.repo === "SalvatoreRa/ML-news-of-the-week");
  const unchangedRepo = artifact.candidates.find((candidate) => candidate.repo === "taielab/awesome-ai-news");
  assert.equal(changedRepo.decision, "admitted");
  assert.equal(changedRepo.repo_delta.status, "changed");
  assert.equal(changedRepo.summary_template.purpose.includes("SalvatoreRa/ML-news-of-the-week"), true);
  assert.match(changedRepo.summary_template.evidence, /latest_commit=bbbbbbbbbbbb/);
  assert.equal(unchangedRepo.decision, "suppressed");
  assert.deepEqual(unchangedRepo.suppression_reasons, ["repo_unchanged", "seen_recently"]);
  assert.equal(JSON.stringify(artifact).includes("ML news of the week tracks machine learning updates"), false);

  const wrongTotal = structuredCloneJson(result);
  wrongTotal.quality.total_candidates = 3;
  assertInvalidSemanticDagRunSummary(
    wrongTotal,
    "quality.total_candidates must equal normalized.total_candidates",
    "tampered quality total"
  );

  await assertValidDagNodeResult(collectResult);
  await assertValidDagNodeResult(downstreamResult);
  await assertValidDagNodeResult(normalizeResult);
  await assertValidDagNodeResult(qualityResult);
  await assertValidDagRunSummary(result);
  await removeSourceWatchQualityFixtureArtifacts(reportDate);
});

test("daily codex DAG source-watch quality MVP records structured quality failure after normalize succeeds", async () => {
  const reportDate = "2026-07-06";
  await removeSourceWatchQualityFixtureArtifacts(reportDate);
  const result = await createDailyCodexDagSourceWatchQualityMvp({
    rootDir,
    reportDate,
    now: "2026-07-06T08:00:00.000Z",
    startedAt: "2026-07-06T08:00:00.000Z",
    finishedAt: "2026-07-06T08:00:01.000Z",
    nodeExecutablePath: process.execPath,
    async executeCommand(invocation) {
      if (
        argsIncludeScript(invocation.args, "scripts/run-source-watch-collect-fixture.mjs")
        || argsIncludeScript(invocation.args, "scripts/run-source-watch-downstream-fixture.mjs")
        || argsIncludeScript(invocation.args, "scripts/run-source-watch-normalize-fixture.mjs")
      ) {
        return runCommandForTest(invocation);
      }
      if (argsIncludeScript(invocation.args, "scripts/run-source-watch-quality-fixture.mjs")) {
        return { exitCode: 1, stdout: "{\"ok\":false,\"failures\":[\"SECRET quality failed\"]}", stderr: "SECRET quality stderr" };
      }
      assert.fail(`unexpected command: ${invocation.args.join(" ")}`);
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.mode, "daily_codex_dag_source_watch_quality_mvp");
  assert.equal(result.run.final_status, "blocked");
  assert.deepEqual(result.run.completed_nodes, ["fetch-source-health", "parse-extract", "normalize-canonicalize"]);
  assert.deepEqual(result.run.blocked_nodes, ["freshness-history-check"]);
  assert.equal(result.quality.total_candidates, 0);
  assert.deepEqual(result.executed_commands.map((command) => command.node_id), ["fetch-source-health", "parse-extract", "normalize-canonicalize", "freshness-history-check"]);
  const [collectResult, downstreamResult, normalizeResult, qualityResult] = result.node_results;
  assert.equal(collectResult.status, "success");
  assert.equal(downstreamResult.status, "success");
  assert.equal(normalizeResult.status, "success");
  assert.equal(qualityResult.status, "failure");
  assert.equal(qualityResult.dependency_results[0].node_id, "normalize-canonicalize");
  assert.equal(qualityResult.dependency_results[0].execution_id, normalizeResult.execution_id);
  assert.equal(Object.hasOwn(qualityResult, "stdout"), false);
  assert.equal(Object.hasOwn(qualityResult, "stderr"), false);
  assert(result.failures.some((failure) => failure.includes("exit code 1")), result.failures.join("\n"));
  assert.equal(JSON.stringify(result).includes("SECRET quality"), false);
  assert.equal(JSON.stringify(result.failures).includes("quality.total_candidates must equal normalized.total_candidates"), false);

  await assertValidDagNodeResult(collectResult);
  await assertValidDagNodeResult(downstreamResult);
  await assertValidDagNodeResult(normalizeResult);
  await assertValidDagNodeResult(qualityResult);
  await assertValidDagRunSummary(result);
  await removeSourceWatchQualityFixtureArtifacts(reportDate);
});

test("daily codex DAG source-watch admit MVP consumes quality candidates into admitted candidates", async () => {
  const reportDate = "2026-07-06";
  await removeSourceWatchAdmitFixtureArtifacts(reportDate);
  const result = await createDailyCodexDagSourceWatchAdmitMvp({
    rootDir,
    reportDate,
    now: "2026-07-06T08:00:00.000Z",
    startedAt: "2026-07-06T08:00:00.000Z",
    finishedAt: "2026-07-06T08:00:01.000Z",
    nodeExecutablePath: process.execPath
  });

  assert.equal(result.ok, true, result.failures.join("\n"));
  assert.equal(result.mode, "daily_codex_dag_source_watch_admit_mvp");
  assert.equal(result.run.final_status, "executed_source_watch_admit");
  assert.deepEqual(result.run.planned_nodes, ["fetch-source-health", "parse-extract", "normalize-canonicalize", "freshness-history-check", "admit-reject"]);
  assert.deepEqual(result.run.completed_nodes, ["fetch-source-health", "parse-extract", "normalize-canonicalize", "freshness-history-check", "admit-reject"]);
  assert.deepEqual(result.run.blocked_nodes, []);
  assert.equal(result.plan.node_count, 5);
  assert.deepEqual(result.plan.levels, [
    { level: 0, node_ids: ["fetch-source-health"] },
    { level: 1, node_ids: ["parse-extract"] },
    { level: 2, node_ids: ["normalize-canonicalize"] },
    { level: 3, node_ids: ["freshness-history-check"] },
    { level: 4, node_ids: ["admit-reject"] }
  ]);
  assert.equal(result.quality.admitted_candidates, 3);
  assert.deepEqual(result.admitted, {
    artifact_path: ".tmp/daily-codex-pipeline/{report_date}/artifacts/admitted-candidates.json",
    artifact_kind: "source_watch_admitted_candidates",
    input_kind: "source_watch_quality_candidates",
    total_candidates: 3,
    github_watch_candidates: 1,
    site_watch_candidates: 2,
    other_candidates: 0,
    empty: false,
    signals: ["github_watch", "site_watch"],
    public_surface: false
  });
  assert.equal(result.node_results.length, 5);
  assert.equal(result.node_result_validation.ok, true, result.node_result_validation.failures.join("\n"));

  const [collectResult, downstreamResult, normalizeResult, qualityResult, admitResult] = result.node_results;
  assert.equal(admitResult.node_id, "admit-reject");
  assert.equal(admitResult.node_kind, "command");
  assert.equal(admitResult.runner_stage_ref, "admit");
  assert.equal(admitResult.status, "success");
  assert.equal(admitResult.dependency_results[0].node_id, "freshness-history-check");
  assert.equal(admitResult.dependency_results[0].execution_id, qualityResult.execution_id);
  assert.equal(admitResult.declared_inputs[0].path, ".tmp/daily-codex-pipeline/{report_date}/artifacts/quality-candidates.json");
  assert.equal(admitResult.declared_outputs[0].path, ".tmp/daily-codex-pipeline/{report_date}/artifacts/admitted-candidates.json");
  assert.equal(admitResult.resolved_inputs[0].path, qualityResult.resolved_outputs[0].path);
  for (const artifact of [
    collectResult.resolved_outputs[0],
    downstreamResult.resolved_outputs[0],
    normalizeResult.resolved_outputs[0],
    qualityResult.resolved_outputs[0],
    admitResult.resolved_inputs[0],
    admitResult.resolved_outputs[0]
  ]) {
    assertResolvedArtifactMetadata(artifact);
  }
  assert.equal(Object.hasOwn(admitResult, "stdout"), false);
  assert.equal(Object.hasOwn(admitResult, "stderr"), false);
  assert.deepEqual(result.executed_commands, [{
    node_id: "fetch-source-health",
    runner: "node",
    script: "scripts/run-source-watch-collect-fixture.mjs"
  }, {
    node_id: "parse-extract",
    runner: "node",
    script: "scripts/run-source-watch-downstream-fixture.mjs"
  }, {
    node_id: "normalize-canonicalize",
    runner: "node",
    script: "scripts/run-source-watch-normalize-fixture.mjs"
  }, {
    node_id: "freshness-history-check",
    runner: "node",
    script: "scripts/run-source-watch-quality-fixture.mjs"
  }, {
    node_id: "admit-reject",
    runner: "node",
    script: "scripts/run-source-watch-admit-fixture.mjs"
  }]);
  assert.equal(result.codex_invocations.length, 0);
  assert.equal(JSON.stringify(result).includes("ML news of the week tracks machine learning updates"), false);

  const artifactPath = path.join(rootDir, ".tmp", "daily-codex-pipeline", reportDate, "artifacts", "admitted-candidates.json");
  const artifact = JSON.parse(await fs.readFile(artifactPath, "utf8"));
  assert.equal(artifact.kind, "source_watch_admitted_candidates");
  assert.equal(artifact.input_kind, "source_watch_quality_candidates");
  assert.equal(artifact.candidate_count, 3);
  assert.equal(artifact.public_surface, false);
  assert(artifact.candidates.every((candidate) => candidate.decision === "admitted"));
  assert.equal(artifact.candidates.some((candidate) => candidate.repo === "taielab/awesome-ai-news"), false);
  assertAifyLaneCandidate(artifact.candidates.find((candidate) => candidate.source_id === "site-aify-news"));

  const wrongTotal = structuredCloneJson(result);
  wrongTotal.admitted.total_candidates = 2;
  assertInvalidSemanticDagRunSummary(
    wrongTotal,
    "admitted.total_candidates must equal quality.admitted_candidates",
    "tampered admitted total"
  );

  await assertValidDagNodeResult(collectResult);
  await assertValidDagNodeResult(downstreamResult);
  await assertValidDagNodeResult(normalizeResult);
  await assertValidDagNodeResult(qualityResult);
  await assertValidDagNodeResult(admitResult);
  await assertValidDagRunSummary(result);
  await removeSourceWatchAdmitFixtureArtifacts(reportDate);
});

test("daily codex DAG source-watch admit MVP blocks admit when quality fails", async () => {
  const reportDate = "2026-07-06";
  await removeSourceWatchAdmitFixtureArtifacts(reportDate);
  const result = await createDailyCodexDagSourceWatchAdmitMvp({
    rootDir,
    reportDate,
    now: "2026-07-06T08:00:00.000Z",
    startedAt: "2026-07-06T08:00:00.000Z",
    finishedAt: "2026-07-06T08:00:01.000Z",
    nodeExecutablePath: process.execPath,
    async executeCommand(invocation) {
      if (
        argsIncludeScript(invocation.args, "scripts/run-source-watch-collect-fixture.mjs")
        || argsIncludeScript(invocation.args, "scripts/run-source-watch-downstream-fixture.mjs")
        || argsIncludeScript(invocation.args, "scripts/run-source-watch-normalize-fixture.mjs")
      ) {
        return runCommandForTest(invocation);
      }
      if (argsIncludeScript(invocation.args, "scripts/run-source-watch-quality-fixture.mjs")) {
        return { exitCode: 1, stdout: "{\"ok\":false,\"failures\":[\"SECRET quality failed\"]}", stderr: "SECRET quality stderr" };
      }
      assert.fail(`unexpected command: ${invocation.args.join(" ")}`);
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.mode, "daily_codex_dag_source_watch_admit_mvp");
  assert.equal(result.run.final_status, "blocked");
  assert.deepEqual(result.run.completed_nodes, ["fetch-source-health", "parse-extract", "normalize-canonicalize"]);
  assert.deepEqual(result.run.blocked_nodes, ["freshness-history-check", "admit-reject"]);
  assert.equal(result.admitted.total_candidates, 0);
  assert.deepEqual(result.executed_commands.map((command) => command.node_id), ["fetch-source-health", "parse-extract", "normalize-canonicalize", "freshness-history-check"]);
  const [collectResult, downstreamResult, normalizeResult, qualityResult, admitResult] = result.node_results;
  assert.equal(qualityResult.status, "failure");
  assert.equal(admitResult.status, "blocked");
  assert.equal(admitResult.dependency_results[0].node_id, "freshness-history-check");
  assert.equal(admitResult.dependency_results[0].execution_id, qualityResult.execution_id);
  assert.equal(Object.hasOwn(qualityResult, "stdout"), false);
  assert.equal(Object.hasOwn(admitResult, "stderr"), false);
  assert.equal(JSON.stringify(result).includes("SECRET quality"), false);
  assert.equal(JSON.stringify(result.failures).includes("admitted.total_candidates must equal quality.admitted_candidates"), false);

  await assertValidDagNodeResult(collectResult);
  await assertValidDagNodeResult(downstreamResult);
  await assertValidDagNodeResult(normalizeResult);
  await assertValidDagNodeResult(qualityResult);
  await assertValidDagNodeResult(admitResult);
  await assertValidDagRunSummary(result);
  await removeSourceWatchAdmitFixtureArtifacts(reportDate);
});

test("daily codex DAG source-watch admit MVP records structured admit failure after quality succeeds", async () => {
  const reportDate = "2026-07-06";
  await removeSourceWatchAdmitFixtureArtifacts(reportDate);
  const result = await createDailyCodexDagSourceWatchAdmitMvp({
    rootDir,
    reportDate,
    now: "2026-07-06T08:00:00.000Z",
    startedAt: "2026-07-06T08:00:00.000Z",
    finishedAt: "2026-07-06T08:00:01.000Z",
    nodeExecutablePath: process.execPath,
    async executeCommand(invocation) {
      if (
        argsIncludeScript(invocation.args, "scripts/run-source-watch-collect-fixture.mjs")
        || argsIncludeScript(invocation.args, "scripts/run-source-watch-downstream-fixture.mjs")
        || argsIncludeScript(invocation.args, "scripts/run-source-watch-normalize-fixture.mjs")
        || argsIncludeScript(invocation.args, "scripts/run-source-watch-quality-fixture.mjs")
      ) {
        return runCommandForTest(invocation);
      }
      if (argsIncludeScript(invocation.args, "scripts/run-source-watch-admit-fixture.mjs")) {
        return { exitCode: 1, stdout: "{\"ok\":false,\"failures\":[\"SECRET admit failed\"]}", stderr: "SECRET admit stderr" };
      }
      assert.fail(`unexpected command: ${invocation.args.join(" ")}`);
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.mode, "daily_codex_dag_source_watch_admit_mvp");
  assert.equal(result.run.final_status, "blocked");
  assert.deepEqual(result.run.completed_nodes, ["fetch-source-health", "parse-extract", "normalize-canonicalize", "freshness-history-check"]);
  assert.deepEqual(result.run.blocked_nodes, ["admit-reject"]);
  assert.equal(result.admitted.total_candidates, 0);
  assert.deepEqual(result.executed_commands.map((command) => command.node_id), ["fetch-source-health", "parse-extract", "normalize-canonicalize", "freshness-history-check", "admit-reject"]);
  const [collectResult, downstreamResult, normalizeResult, qualityResult, admitResult] = result.node_results;
  assert.equal(qualityResult.status, "success");
  assert.equal(admitResult.status, "failure");
  assert.equal(admitResult.dependency_results[0].node_id, "freshness-history-check");
  assert.equal(admitResult.dependency_results[0].execution_id, qualityResult.execution_id);
  assert.equal(Object.hasOwn(admitResult, "stdout"), false);
  assert.equal(Object.hasOwn(admitResult, "stderr"), false);
  assert(result.failures.some((failure) => failure.includes("exit code 1")), result.failures.join("\n"));
  assert.equal(JSON.stringify(result).includes("SECRET admit"), false);
  assert.equal(JSON.stringify(result.failures).includes("admitted.total_candidates must equal quality.admitted_candidates"), false);

  await assertValidDagNodeResult(collectResult);
  await assertValidDagNodeResult(downstreamResult);
  await assertValidDagNodeResult(normalizeResult);
  await assertValidDagNodeResult(qualityResult);
  await assertValidDagNodeResult(admitResult);
  await assertValidDagRunSummary(result);
  await removeSourceWatchAdmitFixtureArtifacts(reportDate);
});

test("daily codex DAG source-watch article-index MVP persists admitted candidates into articles artifact", async () => {
  const reportDate = "2026-07-06";
  await removeSourceWatchArticleIndexFixtureArtifacts(reportDate);
  const result = await createDailyCodexDagSourceWatchArticleIndexMvp({
    rootDir,
    reportDate,
    now: "2026-07-06T08:00:00.000Z",
    startedAt: "2026-07-06T08:00:00.000Z",
    finishedAt: "2026-07-06T08:00:01.000Z",
    nodeExecutablePath: process.execPath
  });

  assert.equal(result.ok, true, result.failures.join("\n"));
  assert.equal(result.mode, "daily_codex_dag_source_watch_article_index_mvp");
  assert.equal(result.run.final_status, "executed_source_watch_article_index");
  assert.deepEqual(result.run.planned_nodes, ["fetch-source-health", "parse-extract", "normalize-canonicalize", "freshness-history-check", "admit-reject", "persist-article-db"]);
  assert.deepEqual(result.run.completed_nodes, ["fetch-source-health", "parse-extract", "normalize-canonicalize", "freshness-history-check", "admit-reject", "persist-article-db"]);
  assert.deepEqual(result.run.blocked_nodes, []);
  assert.equal(result.plan.node_count, 6);
  assert.deepEqual(result.plan.levels, [
    { level: 0, node_ids: ["fetch-source-health"] },
    { level: 1, node_ids: ["parse-extract"] },
    { level: 2, node_ids: ["normalize-canonicalize"] },
    { level: 3, node_ids: ["freshness-history-check"] },
    { level: 4, node_ids: ["admit-reject"] },
    { level: 5, node_ids: ["persist-article-db"] }
  ]);
  assert.deepEqual(result.articles, {
    artifact_path: ".tmp/daily-codex-pipeline/{report_date}/artifacts/articles.json",
    artifact_kind: "articles",
    input_kind: "source_watch_admitted_candidates",
    total_articles: 3,
    source_watch_articles: 3,
    github_watch_articles: 1,
    site_watch_articles: 2,
    other_articles: 0,
    empty: false,
    public_surface: true
  });
  assert.equal(result.node_results.length, 6);
  assert.equal(result.node_result_validation.ok, true, result.node_result_validation.failures.join("\n"));

  const [collectResult, downstreamResult, normalizeResult, qualityResult, admitResult, articleResult] = result.node_results;
  assert.equal(articleResult.node_id, "persist-article-db");
  assert.equal(articleResult.node_kind, "command");
  assert.equal(articleResult.runner_stage_ref, "build");
  assert.equal(articleResult.status, "success");
  assert.equal(articleResult.dependency_results[0].node_id, "admit-reject");
  assert.equal(articleResult.dependency_results[0].execution_id, admitResult.execution_id);
  assert.equal(articleResult.declared_inputs[0].path, ".tmp/daily-codex-pipeline/{report_date}/artifacts/admitted-candidates.json");
  assert.equal(articleResult.declared_outputs[0].path, ".tmp/daily-codex-pipeline/{report_date}/artifacts/articles.json");
  assert.equal(articleResult.resolved_inputs[0].path, admitResult.resolved_outputs[0].path);
  for (const artifact of [
    collectResult.resolved_outputs[0],
    downstreamResult.resolved_outputs[0],
    normalizeResult.resolved_outputs[0],
    qualityResult.resolved_outputs[0],
    admitResult.resolved_outputs[0],
    articleResult.resolved_inputs[0],
    articleResult.resolved_outputs[0]
  ]) {
    assertResolvedArtifactMetadata(artifact);
  }
  assert.equal(Object.hasOwn(articleResult, "stdout"), false);
  assert.equal(Object.hasOwn(articleResult, "stderr"), false);
  assert.deepEqual(result.executed_commands, [{
    node_id: "fetch-source-health",
    runner: "node",
    script: "scripts/run-source-watch-collect-fixture.mjs"
  }, {
    node_id: "parse-extract",
    runner: "node",
    script: "scripts/run-source-watch-downstream-fixture.mjs"
  }, {
    node_id: "normalize-canonicalize",
    runner: "node",
    script: "scripts/run-source-watch-normalize-fixture.mjs"
  }, {
    node_id: "freshness-history-check",
    runner: "node",
    script: "scripts/run-source-watch-quality-fixture.mjs"
  }, {
    node_id: "admit-reject",
    runner: "node",
    script: "scripts/run-source-watch-admit-fixture.mjs"
  }, {
    node_id: "persist-article-db",
    runner: "node",
    script: "scripts/run-source-watch-article-index-fixture.mjs"
  }]);
  assert.equal(result.codex_invocations.length, 0);
  assert.equal(JSON.stringify(result).includes("ML news of the week tracks machine learning updates"), false);

  const articlePath = path.join(rootDir, ".tmp", "daily-codex-pipeline", reportDate, "artifacts", "articles.json");
  const articles = JSON.parse(await fs.readFile(articlePath, "utf8"));
  assert.equal(Array.isArray(articles), true);
  assert.equal(articles.length, 3);
  assert(articles.every((article) => article.section === "source_watch"));
  assert(articles.some((article) => article.url === "https://aify-news.pages.dev/"));
  assert.equal(articles.some((article) => article.url.includes("awesome-ai-news")), false);
  const articleValidation = validateArticles(articles);
  assert.equal(articleValidation.valid, true, JSON.stringify(articleValidation.errors, null, 2));
  const serializedArticles = JSON.stringify(articles);
  for (const forbidden of [
    "candidate_id",
    "canonical_id",
    "source_id",
    "source_lane",
    "source_tier",
    "verification_policy",
    "verification_status",
    "repo_delta",
    "freshness",
    "summary_template",
    "admission",
    "rationale",
    "notes",
    "raw"
  ]) {
    assert.equal(serializedArticles.includes(forbidden), false, `articles artifact leaked ${forbidden}`);
  }
  assert.doesNotMatch(serializedArticles, /latest_commit=|pushed_at=|stars=|forks=/);

  await assertValidDagNodeResult(collectResult);
  await assertValidDagNodeResult(downstreamResult);
  await assertValidDagNodeResult(normalizeResult);
  await assertValidDagNodeResult(qualityResult);
  await assertValidDagNodeResult(admitResult);
  await assertValidDagNodeResult(articleResult);
  await assertValidDagRunSummary(result);
  await removeSourceWatchArticleIndexFixtureArtifacts(reportDate);
});

test("daily codex DAG source-watch article-index MVP records structured persist failure after admit succeeds", async () => {
  const reportDate = "2026-07-06";
  await removeSourceWatchArticleIndexFixtureArtifacts(reportDate);
  const result = await createDailyCodexDagSourceWatchArticleIndexMvp({
    rootDir,
    reportDate,
    now: "2026-07-06T08:00:00.000Z",
    startedAt: "2026-07-06T08:00:00.000Z",
    finishedAt: "2026-07-06T08:00:01.000Z",
    nodeExecutablePath: process.execPath,
    async executeCommand(invocation) {
      if (
        argsIncludeScript(invocation.args, "scripts/run-source-watch-collect-fixture.mjs")
        || argsIncludeScript(invocation.args, "scripts/run-source-watch-downstream-fixture.mjs")
        || argsIncludeScript(invocation.args, "scripts/run-source-watch-normalize-fixture.mjs")
        || argsIncludeScript(invocation.args, "scripts/run-source-watch-quality-fixture.mjs")
        || argsIncludeScript(invocation.args, "scripts/run-source-watch-admit-fixture.mjs")
      ) {
        return runCommandForTest(invocation);
      }
      if (argsIncludeScript(invocation.args, "scripts/run-source-watch-article-index-fixture.mjs")) {
        return { exitCode: 1, stdout: "{\"ok\":false,\"failures\":[\"SECRET article failed\"]}", stderr: "SECRET article stderr" };
      }
      assert.fail(`unexpected command: ${invocation.args.join(" ")}`);
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.mode, "daily_codex_dag_source_watch_article_index_mvp");
  assert.equal(result.run.final_status, "blocked");
  assert.deepEqual(result.run.completed_nodes, ["fetch-source-health", "parse-extract", "normalize-canonicalize", "freshness-history-check", "admit-reject"]);
  assert.deepEqual(result.run.blocked_nodes, ["persist-article-db"]);
  assert.equal(result.articles.total_articles, 0);
  assert.deepEqual(result.executed_commands.map((command) => command.node_id), ["fetch-source-health", "parse-extract", "normalize-canonicalize", "freshness-history-check", "admit-reject", "persist-article-db"]);
  const [collectResult, downstreamResult, normalizeResult, qualityResult, admitResult, articleResult] = result.node_results;
  assert.equal(admitResult.status, "success");
  assert.equal(articleResult.status, "failure");
  assert.equal(articleResult.dependency_results[0].node_id, "admit-reject");
  assert.equal(articleResult.dependency_results[0].execution_id, admitResult.execution_id);
  assert.equal(Object.hasOwn(articleResult, "stdout"), false);
  assert.equal(Object.hasOwn(articleResult, "stderr"), false);
  assert(result.failures.some((failure) => failure.includes("exit code 1")), result.failures.join("\n"));
  assert.equal(JSON.stringify(result).includes("SECRET article"), false);
  assert.equal(JSON.stringify(result.failures).includes("articles.source_watch_articles must equal admitted.total_candidates"), false);

  await assertValidDagNodeResult(collectResult);
  await assertValidDagNodeResult(downstreamResult);
  await assertValidDagNodeResult(normalizeResult);
  await assertValidDagNodeResult(qualityResult);
  await assertValidDagNodeResult(admitResult);
  await assertValidDagNodeResult(articleResult);
  await assertValidDagRunSummary(result);
  await removeSourceWatchArticleIndexFixtureArtifacts(reportDate);
});

test("daily codex DAG two-node fixture MVP runs classify then score with artifact handoff", async () => {
  await removeTwoNodeFixtureArtifacts();
  const result = await createDailyCodexDagTwoNodeFixtureMvp({
    rootDir,
    reportDate: "2026-07-03",
    now: fixedNow,
    startedAt: "2026-07-03T08:00:00.000Z",
    finishedAt: "2026-07-03T08:00:01.000Z",
    nodeExecutablePath: process.execPath
  });

  assert.equal(result.ok, true, result.failures.join("\n"));
  assert.equal(result.mode, "daily_codex_dag_two_node_fixture_mvp");
  assert.equal(result.run.final_status, "executed_two_node_fixture");
  assert.deepEqual(result.run.planned_nodes, ["classify-tag-entity", "score"]);
  assert.deepEqual(result.run.completed_nodes, ["classify-tag-entity", "score"]);
  assert.deepEqual(result.run.blocked_nodes, []);
  assert.equal(result.plan.node_count, 2);
  assert.deepEqual(result.plan.levels, [
    { level: 0, node_ids: ["classify-tag-entity"] },
    { level: 1, node_ids: ["score"] }
  ]);
  assert.deepEqual(result.plan.nodes.map((node) => node.id), ["classify-tag-entity", "score"]);
  assert.deepEqual(result.plan.nodes[0].dependencies, []);
  assert.deepEqual(result.plan.nodes[1].dependencies, ["classify-tag-entity"]);
  assert.equal(result.node_results.length, 2);
  assert.equal(result.node_result_validation.ok, true, result.node_result_validation.failures.join("\n"));

  const [classifyResult, scoreResult] = result.node_results;
  assert.equal(classifyResult.node_id, "classify-tag-entity");
  assert.equal(classifyResult.node_kind, "codex_exec");
  assert.equal(classifyResult.status, "success");
  assert.deepEqual(classifyResult.dependency_results, []);
  assert.equal(classifyResult.declared_inputs[0].path, ".tmp/daily-codex-pipeline/{report_date}/artifacts/canonical-candidates.json");
  assert.equal(classifyResult.declared_outputs[0].path, ".tmp/daily-codex-pipeline/{report_date}/artifacts/classified-candidates.json");
  assert.equal(scoreResult.node_id, "score");
  assert.equal(scoreResult.node_kind, "command");
  assert.equal(scoreResult.status, "success");
  assert.equal(scoreResult.dependency_results[0].node_id, "classify-tag-entity");
  assert.equal(scoreResult.dependency_results[0].execution_id, classifyResult.execution_id);
  assert.equal(scoreResult.dependency_results[0].status, "success");
  assert.equal(scoreResult.declared_inputs[0].path, classifyResult.declared_outputs[0].path);
  assert.equal(scoreResult.resolved_inputs[0].path, classifyResult.resolved_outputs[0].path);
  for (const artifact of [
    classifyResult.resolved_inputs[0],
    classifyResult.resolved_outputs[0],
    scoreResult.resolved_inputs[0],
    scoreResult.resolved_outputs[0]
  ]) {
    assertResolvedArtifactMetadata(artifact);
  }
  assert.deepEqual(result.executed_commands, [{
    node_id: "classify-tag-entity",
    runner: "node",
    script: "scripts/replay-daily-codex-dag-node-fixture.mjs"
  }, {
    node_id: "score",
    runner: "node",
    script: "scripts/replay-daily-codex-dag-node-fixture.mjs"
  }]);
  assert.equal(result.codex_invocations.length, 0);
  assert.equal(JSON.stringify(result).includes("SECRET"), false);

  const scoredPath = path.join(rootDir, ".tmp", "daily-codex-pipeline", "2026-07-03", "artifacts", "scored-candidates.json");
  const scored = JSON.parse(await fs.readFile(scoredPath, "utf8"));
  assert.equal(scored.node_id, "score");
  assert.equal(scored.candidates[0].taxonomy.domain, "models");
  assert.equal(scored.candidates[0].score.rank, 1);

  await assertValidDagNodeResult(classifyResult);
  await assertValidDagNodeResult(scoreResult);
  await assertValidDagRunSummary(result);
  await removeTwoNodeFixtureArtifacts();
});

test("daily codex DAG two-node fixture MVP rejects misleading order and blocked evidence", async () => {
  await removeTwoNodeFixtureArtifacts();
  const result = await createDailyCodexDagTwoNodeFixtureMvp({
    rootDir,
    reportDate: "2026-07-03",
    now: fixedNow,
    startedAt: "2026-07-03T08:00:00.000Z",
    finishedAt: "2026-07-03T08:00:01.000Z",
    nodeExecutablePath: process.execPath
  });
  assert.equal(result.ok, true, result.failures.join("\n"));

  const swappedResults = structuredCloneJson(result);
  swappedResults.node_results.reverse();
  await assertInvalidDagRunSummary(swappedResults);

  const swappedCommands = structuredCloneJson(result);
  swappedCommands.executed_commands.reverse();
  await assertInvalidDagRunSummary(swappedCommands);

  const blockedAfterSuccess = structuredCloneJson(result);
  blockedAfterSuccess.ok = false;
  blockedAfterSuccess.failures = ["score blocked after classify success"];
  blockedAfterSuccess.run.final_status = "blocked";
  blockedAfterSuccess.run.completed_nodes = ["classify-tag-entity"];
  blockedAfterSuccess.run.blocked_nodes = ["score"];
  blockedAfterSuccess.executed_commands = [blockedAfterSuccess.executed_commands[0]];
  const scoreResult = blockedAfterSuccess.node_results[1];
  scoreResult.status = "blocked";
  scoreResult.downstream_disposition = "block";
  scoreResult.started_at = null;
  scoreResult.finished_at = null;
  scoreResult.duration_ms = 0;
  scoreResult.attempts_started = 0;
  scoreResult.attempts_exhausted = false;
  scoreResult.resolved_inputs = [];
  scoreResult.resolved_outputs = [];
  scoreResult.failures = [{
    code: "dependency_blocked",
    message: "score cannot be blocked after classify succeeds",
    source: "daily-codex-dag",
    retryable: false
  }];
  await assertValidDagRunSummarySchemaOnly(blockedAfterSuccess);
  assertInvalidSemanticDagRunSummary(
    blockedAfterSuccess,
    "score must not be blocked when classify succeeds",
    "score blocked after classify success"
  );

  await removeTwoNodeFixtureArtifacts();
});

test("daily codex DAG two-node fixture MVP blocks score when classify command fails", async () => {
  await removeTwoNodeFixtureArtifacts();
  const calls = [];
  const result = await createDailyCodexDagTwoNodeFixtureMvp({
    rootDir,
    reportDate: "2026-07-03",
    now: fixedNow,
    startedAt: "2026-07-03T08:00:00.000Z",
    finishedAt: "2026-07-03T08:00:01.000Z",
    nodeExecutablePath: process.execPath,
    executeCommand: async ({ node }) => {
      calls.push(node.id);
      return {
        exitCode: 1,
        signal: null,
        stdout: "SECRET stdout payload",
        stderr: "SECRET stderr payload",
        errorMessage: "classify fixture failed"
      };
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.run.final_status, "blocked");
  assert.deepEqual(result.run.completed_nodes, []);
  assert.deepEqual(result.run.blocked_nodes, ["classify-tag-entity", "score"]);
  assert.deepEqual(calls, ["classify-tag-entity"]);
  assert.deepEqual(result.executed_commands.map((command) => command.node_id), ["classify-tag-entity"]);
  assert.equal(result.node_results.length, 2);
  assert.equal(result.node_result_validation.ok, true, result.node_result_validation.failures.join("\n"));
  const [classifyResult, scoreResult] = result.node_results;
  assert.equal(classifyResult.status, "failure");
  assert.equal(classifyResult.failures[0].code, "command_execution_failed");
  assert.equal(scoreResult.node_id, "score");
  assert.equal(scoreResult.status, "blocked");
  assert.equal(scoreResult.attempts_started, 0);
  assert.equal(scoreResult.dependency_results[0].execution_id, classifyResult.execution_id);
  assert.equal(scoreResult.dependency_results[0].status, "failure");
  assert.equal(scoreResult.failures[0].code, "dependency_blocked");
  assert.equal(Object.hasOwn(classifyResult, "stdout"), false);
  assert.equal(Object.hasOwn(classifyResult, "stderr"), false);
  assert.equal(Object.hasOwn(scoreResult, "stdout"), false);
  assert.equal(Object.hasOwn(scoreResult, "stderr"), false);
  assert.equal(JSON.stringify(result).includes("SECRET"), false);

  await assertValidDagNodeResult(classifyResult);
  await assertValidDagNodeResult(scoreResult);
  await assertValidDagRunSummary(result);
  await removeTwoNodeFixtureArtifacts();
});

test("daily codex DAG two-node fixture MVP records structured score artifact failure", async () => {
  await removeTwoNodeFixtureArtifacts();
  const result = await createDailyCodexDagTwoNodeFixtureMvp({
    rootDir,
    reportDate: "2026-07-03",
    now: fixedNow,
    startedAt: "2026-07-03T08:00:00.000Z",
    finishedAt: "2026-07-03T08:00:01.000Z",
    nodeExecutablePath: process.execPath,
    executeCommand: async ({ node, runtime_plan }) => {
      const outputPathIndex = runtime_plan.argv_tail.indexOf("--output");
      const outputPath = runtime_plan.argv_tail[outputPathIndex + 1];
      const absoluteOutputPath = path.resolve(rootDir, outputPath);
      await fs.mkdir(path.dirname(absoluteOutputPath), { recursive: true });
      if (node.id === "classify-tag-entity") {
        await fs.writeFile(absoluteOutputPath, `${JSON.stringify({
          schema_version: 1,
          mode: "daily_codex_dag_two_node_fixture_classified_output",
          report_date: "2026-07-03",
          node_id: "classify-tag-entity",
          candidates: [{
            candidate_id: "fixture-candidate-001",
            title: "Fixture classified candidate",
            url: "https://example.com/daily-codex-dag-fixture",
            taxonomy: { domain: "models", flavor: "release", channel: "official" },
            tags: ["model-release"],
            entities: ["Fixture Labs"]
          }]
        }, null, 2)}\n`, "utf8");
      } else {
        await fs.writeFile(absoluteOutputPath, "{", "utf8");
      }
      return {
        exitCode: 0,
        signal: null,
        stdout: "SECRET stdout payload",
        stderr: "SECRET stderr payload",
        errorMessage: ""
      };
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.run.final_status, "blocked");
  assert.deepEqual(result.run.completed_nodes, ["classify-tag-entity"]);
  assert.deepEqual(result.run.blocked_nodes, ["score"]);
  assert.deepEqual(result.executed_commands.map((command) => command.node_id), ["classify-tag-entity", "score"]);
  const [classifyResult, scoreResult] = result.node_results;
  assert.equal(classifyResult.status, "success");
  assert.equal(scoreResult.status, "failure");
  assert.equal(scoreResult.failures[0].code, "required_output_artifact_invalid");
  assert.equal(scoreResult.dependency_results[0].execution_id, classifyResult.execution_id);
  assert.equal(scoreResult.resolved_outputs[0].exists, true);
  assert.equal(scoreResult.resolved_outputs[0].schema_valid, false);
  assert.match(scoreResult.resolved_outputs[0].sha256, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(result).includes("SECRET"), false);

  await assertValidDagNodeResult(classifyResult);
  await assertValidDagNodeResult(scoreResult);
  await assertValidDagRunSummary(result);
  await removeTwoNodeFixtureArtifacts();
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
  assert.equal(Object.hasOwn(first, "codex_runtime_plans"), false);
  assert.equal(Object.hasOwn(first, "codex_invocations"), false);
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
  assert.equal(Object.hasOwn(result, "codex_runtime_plans"), false);
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
        value.executed_commands = [{ command: "corepack pnpm run build" }];
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
  assert.equal(
    missingDryRunJson.failures[0],
    "daily codex DAG CLI requires one of --dry-run, --contract-run, --execute-node-fixture, --execute-real-node-fixture, --execute-source-watch-fixture, --execute-source-watch-downstream-fixture, --execute-source-watch-normalize-fixture, --execute-source-watch-quality-fixture, --execute-source-watch-admit-fixture, --execute-source-watch-article-index-fixture, or --execute-two-node-fixture"
  );
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

test("daily codex DAG executable-node MVP CLI writes JSON to stdout only", async () => {
  await removeExecutableNodeFixtureArtifacts();
  const forbiddenBefore = await forbiddenPathSnapshot();
  const result = await runDagCli(["--execute-node-fixture", "--date", "2026-07-03", "--json"]);

  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stderr, "");
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, true, parsed.failures?.join("\n"));
  assert.equal(parsed.mode, "daily_codex_dag_executable_node_mvp");
  assert.equal(parsed.report_date, "2026-07-03");
  assert.equal(parsed.run.final_status, "executed_one_node");
  assert.deepEqual(parsed.run.completed_nodes, ["synthetic-command-node"]);
  assert.equal(parsed.node_results.length, 1);
  assert.equal(parsed.node_results[0].mode, "daily_codex_dag_node_result");
  assert.equal(parsed.node_results[0].status, "success");
  assert.equal(parsed.node_results[0].resolved_inputs.length, 1);
  assert.equal(parsed.node_results[0].resolved_outputs.length, 1);
  assertResolvedArtifactMetadata(parsed.node_results[0].resolved_inputs[0]);
  assertResolvedArtifactMetadata(parsed.node_results[0].resolved_outputs[0]);
  assert.equal(Object.hasOwn(parsed.node_results[0], "stdout"), false);
  assert.equal(Object.hasOwn(parsed.node_results[0], "stderr"), false);
  assert.equal(JSON.stringify(parsed).includes("SECRET"), false);
  await assertValidDagRunSummary(parsed);
  const forbiddenAfter = await forbiddenPathSnapshot();
  assert.deepEqual(forbiddenAfter.docsReports, forbiddenBefore.docsReports, "stdout-only executable-node MVP must not mutate docs reports");
  assert.deepEqual(forbiddenAfter.reportsData, forbiddenBefore.reportsData, "stdout-only executable-node MVP must not mutate reports data");
  await removeExecutableNodeFixtureArtifacts();
});

test("daily codex DAG real-node adapter MVP CLI writes JSON to stdout only", async () => {
  await removeRealNodeAdapterFixtureArtifacts();
  const forbiddenBefore = await forbiddenPathSnapshot();
  const result = await runDagCli(["--execute-real-node-fixture", "--node", "score", "--date", "2026-07-03", "--json"]);

  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stderr, "");
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, true, parsed.failures?.join("\n"));
  assert.equal(parsed.mode, "daily_codex_dag_real_node_adapter_mvp");
  assert.equal(parsed.report_date, "2026-07-03");
  assert.equal(parsed.run.final_status, "executed_one_real_node");
  assert.deepEqual(parsed.run.completed_nodes, ["score"]);
  assert.equal(parsed.node_results.length, 1);
  assert.equal(parsed.node_results[0].mode, "daily_codex_dag_node_result");
  assert.equal(parsed.node_results[0].node_id, "score");
  assert.equal(parsed.node_results[0].status, "success");
  assert.equal(parsed.node_results[0].dependency_results[0].node_id, "classify-tag-entity");
  assert.equal(parsed.node_results[0].resolved_inputs.length, 1);
  assert.equal(parsed.node_results[0].resolved_outputs.length, 1);
  assertResolvedArtifactMetadata(parsed.node_results[0].resolved_inputs[0]);
  assertResolvedArtifactMetadata(parsed.node_results[0].resolved_outputs[0]);
  assert.equal(Object.hasOwn(parsed.node_results[0], "stdout"), false);
  assert.equal(Object.hasOwn(parsed.node_results[0], "stderr"), false);
  assert.equal(JSON.stringify(parsed).includes("SECRET"), false);
  await assertValidDagRunSummary(parsed);
  const forbiddenAfter = await forbiddenPathSnapshot();
  assert.deepEqual(forbiddenAfter.docsReports, forbiddenBefore.docsReports, "stdout-only real-node adapter MVP must not mutate docs reports");
  assert.deepEqual(forbiddenAfter.reportsData, forbiddenBefore.reportsData, "stdout-only real-node adapter MVP must not mutate reports data");
  await removeRealNodeAdapterFixtureArtifacts();
});

test("daily codex DAG source-watch collect MVP CLI writes source-health artifact under .tmp only", async () => {
  const reportDate = "2026-07-06";
  await removeSourceWatchCollectFixtureArtifacts(reportDate);
  const forbiddenBefore = await forbiddenPathSnapshot();
  const result = await runDagCli(["--execute-source-watch-fixture", "--date", reportDate, "--json"]);

  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stderr, "");
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, true, parsed.failures?.join("\n"));
  assert.equal(parsed.mode, "daily_codex_dag_source_watch_collect_mvp");
  assert.equal(parsed.report_date, reportDate);
  assert.equal(parsed.run.final_status, "executed_source_watch_collect");
  assert.deepEqual(parsed.run.completed_nodes, ["fetch-source-health"]);
  assert.equal(parsed.source_watch.watched_repos, 2);
  assert.equal(parsed.source_watch.fetched_repos, 2);
  assert.equal(parsed.source_watch.watched_sites, 2);
  assert.equal(parsed.source_watch.fetched_sites, 2);
  assert.equal(parsed.source_watch.total_candidates_found, 4);
  assert.equal(parsed.source_watch.empty, false);
  assert.equal(parsed.node_results.length, 1);
  assert.equal(parsed.node_results[0].node_id, "fetch-source-health");
  assert.equal(parsed.node_results[0].status, "success");
  assert.equal(parsed.node_results[0].declared_outputs[0].path, ".tmp/daily-codex-pipeline/{report_date}/artifacts/source-health.json");
  assertResolvedArtifactMetadata(parsed.node_results[0].resolved_outputs[0]);
  assert.equal(Object.hasOwn(parsed.node_results[0], "stdout"), false);
  assert.equal(Object.hasOwn(parsed.node_results[0], "stderr"), false);
  assert.equal(JSON.stringify(parsed).includes("SECRET"), false);

  const artifactPath = path.join(rootDir, ".tmp", "daily-codex-pipeline", reportDate, "artifacts", "source-health.json");
  const artifact = JSON.parse(await fs.readFile(artifactPath, "utf8"));
  assert.equal(artifact.source_audit.github_watch.fetched_repos, 2);
  assert.equal(artifact.source_audit.site_watch.fetched_sites, 2);
  assert(artifact.candidates.some((candidate) => candidate.signal === "github_watch"));
  assert(artifact.candidates.some((candidate) => candidate.signal === "site_watch"));

  await assertValidDagRunSummary(parsed);
  const forbiddenAfter = await forbiddenPathSnapshot();
  assert.deepEqual(forbiddenAfter.docsReports, forbiddenBefore.docsReports, "source-watch collect MVP must not mutate docs reports");
  assert.deepEqual(forbiddenAfter.reportsData, forbiddenBefore.reportsData, "source-watch collect MVP must not mutate reports data");
  await removeSourceWatchCollectFixtureArtifacts(reportDate);
});

test("daily codex DAG source-watch downstream MVP CLI writes collect and parse artifacts under .tmp only", async () => {
  const reportDate = "2026-07-06";
  await removeSourceWatchDownstreamFixtureArtifacts(reportDate);
  const forbiddenBefore = await forbiddenPathSnapshot();
  const result = await runDagCli(["--execute-source-watch-downstream-fixture", "--date", reportDate, "--json"]);

  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stderr, "");
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, true, parsed.failures?.join("\n"));
  assert.equal(parsed.mode, "daily_codex_dag_source_watch_downstream_mvp");
  assert.equal(parsed.report_date, reportDate);
  assert.equal(parsed.run.final_status, "executed_source_watch_downstream");
  assert.deepEqual(parsed.run.completed_nodes, ["fetch-source-health", "parse-extract"]);
  assert.deepEqual(parsed.downstream.signals, ["github_watch", "site_watch"]);
  assert.equal(parsed.downstream.total_candidates, 4);
  assert.equal(parsed.downstream.github_watch_candidates, 2);
  assert.equal(parsed.downstream.site_watch_candidates, 2);
  assert.equal(parsed.node_results.length, 2);
  assert.equal(parsed.node_results[0].node_id, "fetch-source-health");
  assert.equal(parsed.node_results[0].status, "success");
  assert.equal(parsed.node_results[1].node_id, "parse-extract");
  assert.equal(parsed.node_results[1].status, "success");
  assert.equal(parsed.node_results[1].dependency_results[0].execution_id, parsed.node_results[0].execution_id);
  assertResolvedArtifactMetadata(parsed.node_results[0].resolved_outputs[0]);
  assertResolvedArtifactMetadata(parsed.node_results[1].resolved_inputs[0]);
  assertResolvedArtifactMetadata(parsed.node_results[1].resolved_outputs[0]);
  assert.equal(Object.hasOwn(parsed.node_results[0], "stdout"), false);
  assert.equal(Object.hasOwn(parsed.node_results[0], "stderr"), false);
  assert.equal(Object.hasOwn(parsed.node_results[1], "stdout"), false);
  assert.equal(Object.hasOwn(parsed.node_results[1], "stderr"), false);
  assert.equal(JSON.stringify(parsed).includes("ML news of the week tracks machine learning updates"), false);

  const artifactPath = path.join(rootDir, ".tmp", "daily-codex-pipeline", reportDate, "artifacts", "extracted-candidates.json");
  const artifact = JSON.parse(await fs.readFile(artifactPath, "utf8"));
  assert.equal(artifact.kind, "source_watch_extracted_candidates");
  assert.equal(artifact.candidate_count, 4);

  await assertValidDagRunSummary(parsed);
  const forbiddenAfter = await forbiddenPathSnapshot();
  assert.deepEqual(forbiddenAfter.docsReports, forbiddenBefore.docsReports, "source-watch downstream MVP must not mutate docs reports");
  assert.deepEqual(forbiddenAfter.reportsData, forbiddenBefore.reportsData, "source-watch downstream MVP must not mutate reports data");
  await removeSourceWatchDownstreamFixtureArtifacts(reportDate);
});

test("daily codex DAG source-watch normalize MVP CLI writes collect parse and canonical artifacts under .tmp only", async () => {
  const reportDate = "2026-07-06";
  await removeSourceWatchNormalizeFixtureArtifacts(reportDate);
  const forbiddenBefore = await forbiddenPathSnapshot();
  const result = await runDagCli(["--execute-source-watch-normalize-fixture", "--date", reportDate, "--json"]);

  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stderr, "");
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, true, parsed.failures?.join("\n"));
  assert.equal(parsed.mode, "daily_codex_dag_source_watch_normalize_mvp");
  assert.equal(parsed.report_date, reportDate);
  assert.equal(parsed.run.final_status, "executed_source_watch_normalize");
  assert.deepEqual(parsed.run.completed_nodes, ["fetch-source-health", "parse-extract", "normalize-canonicalize"]);
  assert.deepEqual(parsed.normalized.signals, ["github_watch", "site_watch"]);
  assert.equal(parsed.normalized.total_candidates, 4);
  assert.equal(parsed.normalized.github_watch_candidates, 2);
  assert.equal(parsed.normalized.site_watch_candidates, 2);
  assert.equal(parsed.node_results.length, 3);
  assert.equal(parsed.node_results[2].node_id, "normalize-canonicalize");
  assert.equal(parsed.node_results[2].status, "success");
  assert.equal(parsed.node_results[2].dependency_results[0].execution_id, parsed.node_results[1].execution_id);
  assertResolvedArtifactMetadata(parsed.node_results[1].resolved_outputs[0]);
  assertResolvedArtifactMetadata(parsed.node_results[2].resolved_inputs[0]);
  assertResolvedArtifactMetadata(parsed.node_results[2].resolved_outputs[0]);
  assert.equal(Object.hasOwn(parsed.node_results[0], "stdout"), false);
  assert.equal(Object.hasOwn(parsed.node_results[1], "stdout"), false);
  assert.equal(Object.hasOwn(parsed.node_results[2], "stdout"), false);
  assert.equal(JSON.stringify(parsed).includes("ML news of the week tracks machine learning updates"), false);

  const artifactPath = path.join(rootDir, ".tmp", "daily-codex-pipeline", reportDate, "artifacts", "canonical-candidates.json");
  const artifact = JSON.parse(await fs.readFile(artifactPath, "utf8"));
  assert.equal(artifact.kind, "source_watch_canonical_candidates");
  assert.equal(artifact.candidate_count, 4);

  await assertValidDagRunSummary(parsed);
  const forbiddenAfter = await forbiddenPathSnapshot();
  assert.deepEqual(forbiddenAfter.docsReports, forbiddenBefore.docsReports, "source-watch normalize MVP must not mutate docs reports");
  assert.deepEqual(forbiddenAfter.reportsData, forbiddenBefore.reportsData, "source-watch normalize MVP must not mutate reports data");
  await removeSourceWatchNormalizeFixtureArtifacts(reportDate);
});

test("daily codex DAG source-watch quality MVP CLI writes internal quality artifact under .tmp only", async () => {
  const reportDate = "2026-07-06";
  await removeSourceWatchQualityFixtureArtifacts(reportDate);
  const forbiddenBefore = await forbiddenPathSnapshot();
  const result = await runDagCli(["--execute-source-watch-quality-fixture", "--date", reportDate, "--json"]);

  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stderr, "");
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, true, parsed.failures?.join("\n"));
  assert.equal(parsed.mode, "daily_codex_dag_source_watch_quality_mvp");
  assert.equal(parsed.report_date, reportDate);
  assert.equal(parsed.run.final_status, "executed_source_watch_quality");
  assert.deepEqual(parsed.run.completed_nodes, ["fetch-source-health", "parse-extract", "normalize-canonicalize", "freshness-history-check"]);
  assert.equal(parsed.quality.total_candidates, 4);
  assert.equal(parsed.quality.admitted_candidates, 3);
  assert.equal(parsed.quality.suppressed_candidates, 1);
  assert.equal(parsed.quality.public_surface, false);
  assert.equal(parsed.node_results.length, 4);
  assert.equal(parsed.node_results[3].node_id, "freshness-history-check");
  assert.equal(parsed.node_results[3].status, "success");
  assert.equal(parsed.node_results[3].dependency_results[0].execution_id, parsed.node_results[2].execution_id);
  assertResolvedArtifactMetadata(parsed.node_results[2].resolved_outputs[0]);
  assertResolvedArtifactMetadata(parsed.node_results[3].resolved_inputs[0]);
  assertResolvedArtifactMetadata(parsed.node_results[3].resolved_outputs[0]);
  assert.equal(Object.hasOwn(parsed.node_results[0], "stdout"), false);
  assert.equal(Object.hasOwn(parsed.node_results[3], "stderr"), false);
  assert.equal(JSON.stringify(parsed).includes("ML news of the week tracks machine learning updates"), false);

  const artifactPath = path.join(rootDir, ".tmp", "daily-codex-pipeline", reportDate, "artifacts", "quality-candidates.json");
  const artifact = JSON.parse(await fs.readFile(artifactPath, "utf8"));
  assert.equal(artifact.kind, "source_watch_quality_candidates");
  assert.equal(artifact.candidate_count, 4);
  assert.equal(artifact.suppressed_count, 1);
  assert.equal(artifact.quality_audit.public_surface, false);
  assertAifyLaneCandidate(artifact.candidates.find((candidate) => candidate.source_id === "site-aify-news"));

  await assertValidDagRunSummary(parsed);
  const forbiddenAfter = await forbiddenPathSnapshot();
  assert.deepEqual(forbiddenAfter.docsReports, forbiddenBefore.docsReports, "source-watch quality MVP must not mutate docs reports");
  assert.deepEqual(forbiddenAfter.reportsData, forbiddenBefore.reportsData, "source-watch quality MVP must not mutate reports data");
  await removeSourceWatchQualityFixtureArtifacts(reportDate);
});

test("daily codex DAG source-watch admit MVP CLI writes internal admitted artifact under .tmp only", async () => {
  const reportDate = "2026-07-06";
  await removeSourceWatchAdmitFixtureArtifacts(reportDate);
  const forbiddenBefore = await forbiddenPathSnapshot();
  const result = await runDagCli(["--execute-source-watch-admit-fixture", "--date", reportDate, "--json"]);

  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stderr, "");
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, true, parsed.failures?.join("\n"));
  assert.equal(parsed.mode, "daily_codex_dag_source_watch_admit_mvp");
  assert.equal(parsed.report_date, reportDate);
  assert.equal(parsed.run.final_status, "executed_source_watch_admit");
  assert.deepEqual(parsed.run.completed_nodes, ["fetch-source-health", "parse-extract", "normalize-canonicalize", "freshness-history-check", "admit-reject"]);
  assert.equal(parsed.quality.admitted_candidates, 3);
  assert.equal(parsed.admitted.total_candidates, 3);
  assert.equal(parsed.admitted.public_surface, false);
  assert.equal(parsed.node_results.length, 5);
  assert.equal(parsed.node_results[4].node_id, "admit-reject");
  assert.equal(parsed.node_results[4].status, "success");
  assert.equal(parsed.node_results[4].dependency_results[0].execution_id, parsed.node_results[3].execution_id);
  assertResolvedArtifactMetadata(parsed.node_results[3].resolved_outputs[0]);
  assertResolvedArtifactMetadata(parsed.node_results[4].resolved_inputs[0]);
  assertResolvedArtifactMetadata(parsed.node_results[4].resolved_outputs[0]);
  assert.equal(Object.hasOwn(parsed.node_results[0], "stdout"), false);
  assert.equal(Object.hasOwn(parsed.node_results[4], "stderr"), false);
  assert.equal(JSON.stringify(parsed).includes("ML news of the week tracks machine learning updates"), false);

  const artifactPath = path.join(rootDir, ".tmp", "daily-codex-pipeline", reportDate, "artifacts", "admitted-candidates.json");
  const artifact = JSON.parse(await fs.readFile(artifactPath, "utf8"));
  assert.equal(artifact.kind, "source_watch_admitted_candidates");
  assert.equal(artifact.candidate_count, 3);
  assert.equal(artifact.public_surface, false);
  assert(artifact.candidates.every((candidate) => candidate.decision === "admitted"));
  assert.equal(artifact.candidates.some((candidate) => candidate.repo === "taielab/awesome-ai-news"), false);
  assertAifyLaneCandidate(artifact.candidates.find((candidate) => candidate.source_id === "site-aify-news"));

  await assertValidDagRunSummary(parsed);
  const forbiddenAfter = await forbiddenPathSnapshot();
  assert.deepEqual(forbiddenAfter.docsReports, forbiddenBefore.docsReports, "source-watch admit MVP must not mutate docs reports");
  assert.deepEqual(forbiddenAfter.reportsData, forbiddenBefore.reportsData, "source-watch admit MVP must not mutate reports data");
  await removeSourceWatchAdmitFixtureArtifacts(reportDate);
});

test("daily codex DAG source-watch article-index MVP CLI writes articles artifact under .tmp only", async () => {
  const reportDate = "2026-07-06";
  await removeSourceWatchArticleIndexFixtureArtifacts(reportDate);
  const forbiddenBefore = await forbiddenPathSnapshot();
  const result = await runDagCli(["--execute-source-watch-article-index-fixture", "--date", reportDate, "--json"]);

  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stderr, "");
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, true, parsed.failures?.join("\n"));
  assert.equal(parsed.mode, "daily_codex_dag_source_watch_article_index_mvp");
  assert.equal(parsed.report_date, reportDate);
  assert.equal(parsed.run.final_status, "executed_source_watch_article_index");
  assert.deepEqual(parsed.run.completed_nodes, ["fetch-source-health", "parse-extract", "normalize-canonicalize", "freshness-history-check", "admit-reject", "persist-article-db"]);
  assert.equal(parsed.admitted.total_candidates, 3);
  assert.equal(parsed.articles.total_articles, 3);
  assert.equal(parsed.articles.source_watch_articles, 3);
  assert.equal(parsed.articles.public_surface, true);
  assert.equal(parsed.node_results.length, 6);
  assert.equal(parsed.node_results[5].node_id, "persist-article-db");
  assert.equal(parsed.node_results[5].status, "success");
  assert.equal(parsed.node_results[5].dependency_results[0].execution_id, parsed.node_results[4].execution_id);
  assertResolvedArtifactMetadata(parsed.node_results[4].resolved_outputs[0]);
  assertResolvedArtifactMetadata(parsed.node_results[5].resolved_inputs[0]);
  assertResolvedArtifactMetadata(parsed.node_results[5].resolved_outputs[0]);
  assert.equal(Object.hasOwn(parsed.node_results[5], "stdout"), false);
  assert.equal(Object.hasOwn(parsed.node_results[5], "stderr"), false);
  assert.equal(JSON.stringify(parsed).includes("ML news of the week tracks machine learning updates"), false);

  const artifactPath = path.join(rootDir, ".tmp", "daily-codex-pipeline", reportDate, "artifacts", "articles.json");
  const articles = JSON.parse(await fs.readFile(artifactPath, "utf8"));
  assert.equal(articles.length, 3);
  assert.equal(validateArticles(articles).valid, true);
  assert.equal(JSON.stringify(articles).includes("source_lane"), false);

  await assertValidDagRunSummary(parsed);
  const forbiddenAfter = await forbiddenPathSnapshot();
  assert.deepEqual(forbiddenAfter.docsReports, forbiddenBefore.docsReports, "source-watch article-index MVP must not mutate docs reports");
  assert.deepEqual(forbiddenAfter.reportsData, forbiddenBefore.reportsData, "source-watch article-index MVP must not mutate reports data");
  await removeSourceWatchArticleIndexFixtureArtifacts(reportDate);
});

test("source watch article-index fixture CLI returns structured failure for bad input", async () => {
  const reportDate = "2026-07-06";
  await removeSourceWatchArticleIndexFixtureArtifacts(reportDate);
  const inputPath = path.join(rootDir, ".tmp", "daily-codex-pipeline", reportDate, "artifacts", "admitted-candidates.json");
  const outputPath = path.join(rootDir, ".tmp", "daily-codex-pipeline", reportDate, "artifacts", "articles.json");
  await fs.mkdir(path.dirname(inputPath), { recursive: true });
  await fs.writeFile(inputPath, `${JSON.stringify({
    kind: "source_watch_admitted_candidates",
    report_date: "2026-07-05",
    public_surface: false,
    candidates: []
  }, null, 2)}\n`, "utf8");

  const result = await runArticleIndexFixtureCli([
    "--date",
    reportDate,
    "--input",
    path.relative(rootDir, inputPath),
    "--output",
    path.relative(rootDir, outputPath),
    "--json"
  ]);

  assert.equal(result.code, 1);
  assert.equal(result.stderr, "");
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, false);
  assert.deepEqual(Object.keys(parsed).sort(), ["failures", "ok"]);
  assert.match(parsed.failures[0], /input\.report_date must match --date/);
  await assert.rejects(fs.access(outputPath));
  await removeSourceWatchArticleIndexFixtureArtifacts(reportDate);
});

test("daily codex DAG two-node fixture MVP CLI writes JSON to stdout only", async () => {
  await removeTwoNodeFixtureArtifacts();
  const forbiddenBefore = await forbiddenPathSnapshot();
  const result = await runDagCli(["--execute-two-node-fixture", "--date", "2026-07-03", "--json"]);

  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stderr, "");
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, true, parsed.failures?.join("\n"));
  assert.equal(parsed.mode, "daily_codex_dag_two_node_fixture_mvp");
  assert.equal(parsed.report_date, "2026-07-03");
  assert.equal(parsed.run.final_status, "executed_two_node_fixture");
  assert.deepEqual(parsed.run.completed_nodes, ["classify-tag-entity", "score"]);
  assert.equal(parsed.node_results.length, 2);
  assert.equal(parsed.node_results[0].node_id, "classify-tag-entity");
  assert.equal(parsed.node_results[0].status, "success");
  assert.equal(parsed.node_results[1].node_id, "score");
  assert.equal(parsed.node_results[1].status, "success");
  assert.equal(parsed.node_results[1].dependency_results[0].execution_id, parsed.node_results[0].execution_id);
  assertResolvedArtifactMetadata(parsed.node_results[0].resolved_outputs[0]);
  assertResolvedArtifactMetadata(parsed.node_results[1].resolved_inputs[0]);
  assertResolvedArtifactMetadata(parsed.node_results[1].resolved_outputs[0]);
  assert.equal(Object.hasOwn(parsed.node_results[0], "stdout"), false);
  assert.equal(Object.hasOwn(parsed.node_results[1], "stderr"), false);
  assert.equal(JSON.stringify(parsed).includes("SECRET"), false);
  await assertValidDagRunSummary(parsed);
  const forbiddenAfter = await forbiddenPathSnapshot();
  assert.deepEqual(forbiddenAfter.docsReports, forbiddenBefore.docsReports, "stdout-only two-node fixture MVP must not mutate docs reports");
  assert.deepEqual(forbiddenAfter.reportsData, forbiddenBefore.reportsData, "stdout-only two-node fixture MVP must not mutate reports data");
  await removeTwoNodeFixtureArtifacts();
});

test("daily codex DAG executable-node MVP CLI writes opt-in summaries under .tmp only", async () => {
  await removeExecutableNodeFixtureArtifacts();
  const tempName = `execute-node-summary-${process.pid}-${Date.now()}.json`;
  const summaryPath = path.join(".tmp", "daily-codex-pipeline", "dag-execute-node-test", tempName);
  const absoluteSummaryPath = path.join(rootDir, summaryPath);
  await fs.rm(absoluteSummaryPath, { force: true });

  const result = await runDagCli([
    "--execute-node-fixture",
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
  assert.equal(fileJson.mode, "daily_codex_dag_executable_node_mvp");
  assert.equal(fileJson.node_result_validation.ok, true);
  assert.equal(fileJson.node_results[0].resolved_inputs.length, 1);
  assert.equal(fileJson.node_results[0].resolved_outputs.length, 1);
  await assertValidDagRunSummary(fileJson);

  await fs.rm(absoluteSummaryPath, { force: true });
  await removeExecutableNodeFixtureArtifacts();
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

async function removeExecutableNodeFixtureArtifacts() {
  await fs.rm(path.join(rootDir, ".tmp", "daily-codex-pipeline", "executable-node-mvp"), {
    recursive: true,
    force: true
  });
}

async function removeRealNodeAdapterFixtureArtifacts(reportDate = "2026-07-03") {
  await fs.rm(path.join(rootDir, ".tmp", "daily-codex-pipeline", reportDate, "artifacts", "classified-candidates.json"), {
    force: true
  });
  await fs.rm(path.join(rootDir, ".tmp", "daily-codex-pipeline", reportDate, "artifacts", "scored-candidates.json"), {
    force: true
  });
}

async function removeSourceWatchCollectFixtureArtifacts(reportDate = "2026-07-06") {
  await fs.rm(path.join(rootDir, ".tmp", "daily-codex-pipeline", reportDate, "artifacts", "source-health.json"), {
    force: true
  });
}

async function removeSourceWatchDownstreamFixtureArtifacts(reportDate = "2026-07-06") {
  await removeSourceWatchCollectFixtureArtifacts(reportDate);
  await fs.rm(path.join(rootDir, ".tmp", "daily-codex-pipeline", reportDate, "artifacts", "extracted-candidates.json"), {
    force: true
  });
}

async function removeSourceWatchNormalizeFixtureArtifacts(reportDate = "2026-07-06") {
  await removeSourceWatchDownstreamFixtureArtifacts(reportDate);
  await fs.rm(path.join(rootDir, ".tmp", "daily-codex-pipeline", reportDate, "artifacts", "canonical-candidates.json"), {
    force: true
  });
}

async function removeSourceWatchQualityFixtureArtifacts(reportDate = "2026-07-06") {
  await removeSourceWatchNormalizeFixtureArtifacts(reportDate);
  await fs.rm(path.join(rootDir, ".tmp", "daily-codex-pipeline", reportDate, "artifacts", "quality-candidates.json"), {
    force: true
  });
}

async function removeSourceWatchAdmitFixtureArtifacts(reportDate = "2026-07-06") {
  await removeSourceWatchQualityFixtureArtifacts(reportDate);
  await fs.rm(path.join(rootDir, ".tmp", "daily-codex-pipeline", reportDate, "artifacts", "admitted-candidates.json"), {
    force: true
  });
}

async function removeSourceWatchArticleIndexFixtureArtifacts(reportDate = "2026-07-06") {
  await removeSourceWatchAdmitFixtureArtifacts(reportDate);
  await fs.rm(path.join(rootDir, ".tmp", "daily-codex-pipeline", reportDate, "artifacts", "articles.json"), {
    force: true
  });
}

async function removeTwoNodeFixtureArtifacts(reportDate = "2026-07-03") {
  await fs.rm(path.join(rootDir, ".tmp", "daily-codex-pipeline", reportDate, "artifacts", "canonical-candidates.json"), {
    force: true
  });
  await removeRealNodeAdapterFixtureArtifacts(reportDate);
}

function assertResolvedArtifactMetadata(artifact) {
  assert.equal(artifact.required, true);
  assert.equal(artifact.exists, true);
  assert.equal(artifact.schema_valid, true);
  assert(Number.isInteger(artifact.bytes) && artifact.bytes > 0, "artifact bytes must be a positive integer");
  assert.match(artifact.sha256, /^[a-f0-9]{64}$/);
}

function assertAifyLaneCandidate(candidate) {
  assert(candidate, "expected site-aify-news candidate");
  assert.equal(candidate.source_lane, "aify");
  assert.equal(candidate.source_tier, "first_class");
  assert.equal(candidate.verification_policy, "no_secondary_review_required");
  assert.equal(candidate.verification_status, "intermediary_only");
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

function runArticleIndexFixtureCli(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [articleIndexFixtureCliPath, ...args], {
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

function runCommandForTest({ command, args, cwd, shell, timeoutMs }) {
  return new Promise((resolve) => {
    let settled = false;
    let stdout = "";
    let stderr = "";
    const child = spawn(command, args, {
      cwd,
      shell,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    const timeout = Number.isFinite(timeoutMs) && timeoutMs > 0
      ? setTimeout(() => child.kill(), timeoutMs)
      : null;
    const finish = (outcome) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      resolve(outcome);
    };
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      finish({ exitCode: 1, signal: null, stdout, stderr, errorMessage: error.message });
    });
    child.on("close", (code, signal) => {
      finish({
        exitCode: Number.isInteger(code) ? code : 1,
        signal: signal || null,
        stdout,
        stderr,
        errorMessage: ""
      });
    });
  });
}

function argsIncludeScript(args, scriptPath) {
  const normalizedScriptPath = scriptPath.replaceAll("\\", "/");
  return Array.isArray(args) && args.some((arg) => (
    typeof arg === "string"
    && arg.replaceAll("\\", "/").endsWith(normalizedScriptPath)
  ));
}
