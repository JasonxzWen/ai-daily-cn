import fs from "node:fs/promises";
import path from "node:path";
import Ajv from "ajv/dist/2020.js";

const DEFAULT_DAG_PATH = path.join("config", "daily-codex-dag.json");
const DAG_SCHEMA_PATH = path.join("schemas", "daily-codex-dag.schema.json");
const NODE_RESULT_VALIDATOR_VERSION = "daily-codex-dag-node-result-v1";
const NODE_RESULT_STATUSES = ["success", "failure", "blocked", "skipped"];
const NODE_RESULT_SCOPES = ["node", "fanout_item", "barrier"];
const NODE_RESULT_DOWNSTREAM_DISPOSITIONS = ["continue", "block"];
const NODE_KINDS = ["command", "codex_exec", "fanout", "barrier"];
const EXECUTION_READINESS_VALUES = ["planned_only", "legacy_mapped", "node_executable"];

const REQUIRED_NODE_IDS = [
  "fetch-source-health",
  "parse-extract",
  "normalize-canonicalize",
  "classify-tag-entity",
  "score",
  "dedupe-cross-language",
  "freshness-history-check",
  "verify-source-authority",
  "admit-reject",
  "per-item-summary",
  "quality-audit",
  "repair-regenerate",
  "persist-article-db",
  "assemble-daily-edition",
  "build-cards-page",
  "publish-cleanup"
];

export async function loadDailyCodexDag(options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const dagPath = path.resolve(rootDir, options.dagPath || DEFAULT_DAG_PATH);
  const raw = await fs.readFile(dagPath, "utf8");
  return {
    dagPath,
    manifest: JSON.parse(raw)
  };
}

export async function validateDailyCodexDag(options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const failures = [];
  const warnings = [];
  const checkedFiles = [];
  const ajv = createAjv();

  let dagPath = path.resolve(rootDir, options.dagPath || DEFAULT_DAG_PATH);
  let manifest = options.manifest || null;
  if (!manifest) {
    try {
      const loaded = await loadDailyCodexDag({ rootDir, dagPath: options.dagPath });
      dagPath = loaded.dagPath;
      manifest = loaded.manifest;
      checkedFiles.push(toPortablePath(dagPath));
    } catch (error) {
      failures.push(`${DEFAULT_DAG_PATH}: ${error.message}`);
    }
  }

  const dagSchema = await readJsonFile({
    rootDir,
    relativePath: DAG_SCHEMA_PATH,
    failures,
    checkedFiles
  });
  let manifestSchemaValid = false;
  if (manifest && dagSchema) {
    const failureCount = failures.length;
    validateAgainstDagSchema({ manifest, schema: dagSchema, ajv, failures });
    manifestSchemaValid = failures.length === failureCount;
  }

  let resiliencePolicy = null;
  if (manifestSchemaValid && manifest?.resilience_policy_path) {
    resiliencePolicy = await readJsonFile({
      rootDir,
      relativePath: manifest.resilience_policy_path,
      failures,
      checkedFiles
    });
  }

  if (manifestSchemaValid && manifest?.nodes) {
    await validateDagSemantics({
      rootDir,
      manifest,
      resiliencePolicy,
      ajv,
      failures,
      warnings,
      checkedFiles
    });
  }

  return {
    ok: failures.length === 0,
    failures,
    warnings,
    node_ids: Array.isArray(manifest?.nodes) ? manifest.nodes.map((node) => node?.id).filter(Boolean).sort() : [],
    checked_files: uniqueSorted(checkedFiles)
  };
}

export async function createDailyCodexDagPlan(options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  let manifest = options.manifest || null;

  if (!manifest) {
    try {
      const loaded = await loadDailyCodexDag({ rootDir, dagPath: options.dagPath });
      manifest = loaded.manifest;
    } catch (error) {
      const failure = `${DEFAULT_DAG_PATH}: ${error.message}`;
      return {
        ok: false,
        failures: [failure],
        warnings: [],
        validation: null,
        plan: null
      };
    }
  }

  const validation = await validateDailyCodexDag({ rootDir, dagPath: options.dagPath, manifest });
  if (!validation.ok) {
    return {
      ok: false,
      failures: validation.failures,
      warnings: validation.warnings,
      validation,
      plan: null
    };
  }

  return {
    ok: true,
    failures: [],
    warnings: validation.warnings,
    validation,
    plan: projectDailyCodexDagPlan(manifest)
  };
}

export async function createDailyCodexDagDryRun(options = {}) {
  const reportDate = requiredReportDate(options.reportDate || options.date);
  const generatedAt = toIsoTimestamp(options.now || new Date());
  const planResult = await createDailyCodexDagPlan(options);

  if (!planResult.ok) {
    return {
      ok: false,
      failures: planResult.failures,
      warnings: planResult.warnings,
      validation: planResult.validation,
      plan: null,
      run: null
    };
  }

  const plan = planResult.plan;
  return {
    ok: true,
    failures: [],
    warnings: planResult.warnings,
    validation: planResult.validation,
    mode: "daily_codex_dag_dry_run",
    report_date: reportDate,
    generated_at: generatedAt,
    plan,
    run: {
      final_status: "dry_run_only",
      levels: plan.levels.map(copyLevel),
      planned_nodes: plan.nodes.map((node) => node.id),
      completed_nodes: [],
      blocked_nodes: []
    },
    next_action: {
      kind: "implement_executable_node_runner",
      message: "Dry-run only; implement executable DAG node execution before using this as a production runner."
    }
  };
}

export async function createDailyCodexDagContractRun(options = {}) {
  const reportDate = requiredReportDate(options.reportDate || options.date);
  const generatedAt = toIsoTimestamp(options.now || new Date());
  const runId = options.runId || options.run_id || `daily-codex-dag:${reportDate}:contract-run`;
  const planResult = await createDailyCodexDagPlan(options);

  if (!planResult.ok) {
    return {
      ok: false,
      failures: planResult.failures,
      warnings: planResult.warnings,
      validation: planResult.validation,
      plan: null,
      run: null
    };
  }

  const plan = planResult.plan;
  const nodeResults = createContractRunNodeResults({ plan, reportDate, runId });
  const nodeResultValidation = validateContractRunNodeResults({ plan, reportDate, runId, nodeResults });
  if (!nodeResultValidation.ok) {
    return {
      ok: false,
      failures: nodeResultValidation.failures,
      warnings: [...planResult.warnings, ...nodeResultValidation.warnings],
      validation: null,
      plan: null,
      run: null
    };
  }
  const nodeIds = plan.nodes.map((node) => node.id);

  return {
    ok: true,
    failures: [],
    warnings: planResult.warnings,
    validation: planResult.validation,
    mode: "daily_codex_dag_contract_run",
    report_date: reportDate,
    generated_at: generatedAt,
    run_id: runId,
    plan,
    run: {
      final_status: "contract_validated_only",
      levels: plan.levels.map(copyLevel),
      planned_nodes: nodeIds,
      contract_validated_nodes: nodeIds,
      skipped_nodes: nodeIds,
      blocked_nodes: []
    },
    node_results: nodeResults,
    node_result_validation: nodeResultValidation,
    fanout_expansions: plan.nodes
      .filter((node) => node.kind === "fanout" || node.kind === "barrier")
      .map((node) => ({
        node_id: node.id,
        kind: node.kind,
        status: "not_expanded",
        item_count: null
      })),
    executed_commands: [],
    codex_invocations: [],
    next_action: {
      kind: "implement_executable_node_runner",
      message: "Contract-run only; no DAG node commands or Codex contexts were executed."
    }
  };
}

export function validateDailyCodexDagRunSummary(summary) {
  const failures = [];
  const warnings = [];

  if (!isPlainObject(summary)) {
    failures.push("daily codex DAG run summary must be an object.");
    return { ok: false, failures, warnings };
  }

  if (summary.ok === false) {
    validateDagRunFailureSummary(summary, failures);
    return { ok: failures.length === 0, failures, warnings };
  }
  if (summary.ok !== true) {
    failures.push("daily codex DAG run summary ok must be true or false.");
    return { ok: false, failures, warnings };
  }

  if (summary.mode === "daily_codex_dag_dry_run") {
    validateDryRunSuccessSummary(summary, failures);
  } else if (summary.mode === "daily_codex_dag_contract_run") {
    validateContractRunSuccessSummary(summary, failures);
  } else {
    failures.push("daily codex DAG run summary mode is unsupported.");
  }

  return { ok: failures.length === 0, failures, warnings };
}

export function validateDailyCodexDagDryRunSummary(summary) {
  const failures = [];
  const warnings = [];

  if (!isPlainObject(summary)) {
    failures.push("daily codex DAG dry-run summary must be an object.");
    return { ok: false, failures, warnings };
  }

  if (summary.ok === false) {
    validateDryRunFailureSummary(summary, failures);
    return { ok: failures.length === 0, failures, warnings };
  }
  if (summary.ok !== true) {
    failures.push("daily codex DAG dry-run summary ok must be true or false.");
    return { ok: false, failures, warnings };
  }

  validateDryRunSuccessSummary(summary, failures);
  return { ok: failures.length === 0, failures, warnings };
}

export function createDailyCodexDagNodeResult(options = {}) {
  const status = options.status || "success";
  const reportDate = requiredReportDate(options.reportDate || options.report_date || options.date);
  const runId = options.runId || options.run_id || `daily-codex-dag:${reportDate}`;
  const nodeId = options.nodeId || options.node_id;
  const resultScope = options.resultScope || options.result_scope || "node";
  const executionId = options.executionId || options.execution_id || defaultNodeExecutionId({ runId, nodeId, resultScope, options });
  const startedAt = toNullableIsoTimestamp(options.startedAt ?? options.started_at ?? null);
  const finishedAt = toNullableIsoTimestamp(options.finishedAt ?? options.finished_at ?? null);
  const durationMs = options.durationMs ?? options.duration_ms ?? durationBetweenTimestamps(startedAt, finishedAt) ?? 0;
  const attemptsStarted = options.attemptsStarted ?? options.attempts_started ?? (status === "blocked" || status === "skipped" ? 0 : 1);
  const maxAttempts = options.maxAttempts ?? options.max_attempts ?? Math.max(1, attemptsStarted);
  const attemptsExhausted = options.attemptsExhausted ?? options.attempts_exhausted ?? (status === "failure");
  const downstreamDisposition = options.downstreamDisposition
    || options.downstream_disposition
    || (status === "success" || status === "skipped" ? "continue" : "block");
  const runnerStageRef = options.runnerStageRef || options.runner_stage_ref || "";
  const declaredInputs = copyDeclaredArtifacts(options.declaredInputs || options.declared_inputs || []);
  const declaredOutputs = copyDeclaredArtifacts(options.declaredOutputs || options.declared_outputs || []);

  return {
    schema_version: 1,
    mode: "daily_codex_dag_node_result",
    report_date: reportDate,
    run_id: runId,
    manifest_name: options.manifestName || options.manifest_name || "daily-codex-dag-contract",
    manifest_schema_version: options.manifestSchemaVersion || options.manifest_schema_version || 1,
    node_id: nodeId,
    node_kind: options.nodeKind || options.node_kind || "command",
    runner_stage_ref: runnerStageRef,
    result_scope: resultScope,
    execution_id: executionId,
    status,
    downstream_disposition: downstreamDisposition,
    started_at: startedAt,
    finished_at: finishedAt,
    duration_ms: durationMs,
    attempts_started: attemptsStarted,
    max_attempts: maxAttempts,
    attempts_exhausted: attemptsExhausted,
    dependency_results: copyDependencyResults(options.dependencyResults || options.dependency_results || []),
    declared_inputs: declaredInputs,
    declared_outputs: declaredOutputs,
    resolved_inputs: copyResolvedArtifacts(options.resolvedInputs || options.resolved_inputs || []),
    resolved_outputs: copyResolvedArtifacts(options.resolvedOutputs || options.resolved_outputs || []),
    fanout: copyFanoutResult(options.fanout || null),
    barrier: copyBarrierResult(options.barrier || null),
    failures: copyIssueObjects(options.failures || []),
    warnings: copyIssueObjects(options.warnings || []),
    audit: copyNodeResultAudit({
      ...(options.audit || {}),
      parallel_group: options.parallelGroup ?? options.parallel_group ?? options.audit?.parallel_group,
      resilience_policy_ref: options.resiliencePolicyRef ?? options.resilience_policy_ref ?? options.audit?.resilience_policy_ref,
      owner_path_scope: options.ownerPathScope ?? options.owner_path_scope ?? options.audit?.owner_path_scope,
      public_artifact: options.publicArtifact ?? options.public_artifact ?? options.audit?.public_artifact,
      validator_version: options.validatorVersion ?? options.validator_version ?? options.audit?.validator_version
    })
  };
}

export function validateDailyCodexDagNodeResult(result) {
  const failures = [];
  const warnings = [];

  if (!isPlainObject(result)) {
    failures.push("daily codex DAG node result must be an object.");
    return { ok: false, failures, warnings };
  }

  validateNodeResultShape(result, failures);
  validateNodeResultSemantics(result, failures);
  return { ok: failures.length === 0, failures, warnings };
}

async function validateDagSemantics({ rootDir, manifest, resiliencePolicy, ajv, failures, checkedFiles }) {
  const nodes = manifest.nodes;
  if (!Array.isArray(nodes)) return;

  const nodeById = new Map();
  for (const node of nodes) {
    if (!node?.id) continue;
    if (nodeById.has(node.id)) {
      failures.push(`config/daily-codex-dag.json: duplicate node id ${JSON.stringify(node.id)}.`);
    }
    nodeById.set(node.id, node);
  }

  for (const nodeId of REQUIRED_NODE_IDS) {
    if (!nodeById.has(nodeId)) {
      failures.push(`config/daily-codex-dag.json: missing required node ${nodeId}.`);
    }
  }

  for (const node of nodes) {
    if (!node?.id) continue;
    validateNodeDependencies({ node, nodeById, failures });
    await validateNodeRefsAndPaths({ rootDir, node, ajv, failures, checkedFiles });
    validateNodeExecutionPolicy({ node, resiliencePolicy, failures });
    validateFanoutBarrier({ node, nodeById, failures });
  }

  validateAcyclicGraph({ nodes, nodeById, failures });
  validateInputLineage({ nodes, nodeById, failures });
  validatePublishCleanupGate({ nodeById, failures });
}

function projectDailyCodexDagPlan(manifest) {
  const nodes = Array.isArray(manifest.nodes) ? manifest.nodes : [];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const manifestIndex = new Map(nodes.map((node, index) => [node.id, index]));
  const levelById = new Map();

  const computeLevel = (nodeId) => {
    if (levelById.has(nodeId)) return levelById.get(nodeId);
    const node = nodeById.get(nodeId);
    const dependencies = node?.dependencies || [];
    const level = dependencies.length === 0
      ? 0
      : Math.max(...dependencies.map((dep) => computeLevel(dep) + 1));
    levelById.set(nodeId, level);
    return level;
  };

  for (const node of nodes) {
    computeLevel(node.id);
  }

  const comparePlanNodeOrder = (left, right) => {
    const leftIndex = manifestIndex.get(left.id) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = manifestIndex.get(right.id) ?? Number.MAX_SAFE_INTEGER;
    return leftIndex - rightIndex || left.id.localeCompare(right.id);
  };

  const projectedNodes = nodes
    .map((node) => projectPlanNode({ node, level: levelById.get(node.id) ?? 0 }))
    .sort(comparePlanNodeOrder);
  const maxLevel = Math.max(...projectedNodes.map((node) => node.level));
  const levels = [];
  for (let level = 0; level <= maxLevel; level += 1) {
    const nodeIds = projectedNodes
      .filter((node) => node.level === level)
      .sort(comparePlanNodeOrder)
      .map((node) => node.id);
    if (nodeIds.length > 0) {
      levels.push({ level, node_ids: nodeIds });
    }
  }

  return {
    schema_version: 1,
    manifest_name: manifest.name,
    description: manifest.description,
    node_count: projectedNodes.length,
    levels,
    nodes: projectedNodes
  };
}

function projectPlanNode({ node, level }) {
  return {
    id: node.id,
    title: node.title,
    kind: node.kind,
    execution_status: node.execution_status,
    execution_contract: copyExecutionContract(node.execution_contract),
    plan_status: node.execution_status === "mapped" ? "mapped" : "planned",
    level,
    dependencies: [...(node.dependencies || [])],
    inputs: (node.inputs || []).map(copyArtifact),
    outputs: (node.outputs || []).map(copyArtifact),
    runner_stage_ref: node.runner_stage_ref,
    parallel_group: node.parallel_group,
    public_artifact: node.public_artifact,
    owner_path_scope: node.owner_path_scope
  };
}

function copyArtifact(artifact) {
  return {
    path: artifact.path,
    required: artifact.required
  };
}

function copyExecutionContract(contract) {
  return {
    readiness: contract.readiness,
    summary: contract.summary
  };
}

function copyLevel(level) {
  return {
    level: level.level,
    node_ids: [...level.node_ids]
  };
}

function createContractRunNodeResults({ plan, reportDate, runId }) {
  const resultByNodeId = new Map();
  const results = [];

  for (const node of plan.nodes) {
    const dependencyResults = node.dependencies.map((dependencyId) => {
      const dependencyResult = resultByNodeId.get(dependencyId);
      return {
        node_id: dependencyId,
        execution_id: dependencyResult?.execution_id || `${runId}:${dependencyId}:node`,
        status: dependencyResult?.status || "skipped",
        required: true,
        downstream_disposition: dependencyResult?.downstream_disposition || "continue"
      };
    });
    const result = createDailyCodexDagNodeResult({
      reportDate,
      runId,
      manifestName: plan.manifest_name,
      manifestSchemaVersion: plan.schema_version,
      nodeId: node.id,
      nodeKind: node.kind,
      runnerStageRef: node.runner_stage_ref,
      resultScope: "node",
      status: "skipped",
      downstreamDisposition: "continue",
      startedAt: null,
      finishedAt: null,
      durationMs: 0,
      attemptsStarted: 0,
      maxAttempts: 1,
      attemptsExhausted: false,
      dependencyResults,
      declaredInputs: node.inputs,
      declaredOutputs: node.outputs,
      resolvedInputs: [],
      resolvedOutputs: [],
      fanout: null,
      barrier: null,
      failures: [],
      warnings: [nodeResultIssue({
        code: "contract_only_not_executed",
        message: "Contract-run validated runner wiring without executing this DAG node.",
        source: "contract-run",
        retryable: false
      })],
      audit: {
        parallel_group: node.parallel_group,
        resilience_policy_ref: "",
        owner_path_scope: node.owner_path_scope,
        public_artifact: node.public_artifact,
        validator_version: NODE_RESULT_VALIDATOR_VERSION
      }
    });
    resultByNodeId.set(node.id, result);
    results.push(result);
  }

  return results;
}

function validateContractRunNodeResults({ plan, reportDate, runId, nodeResults }) {
  const failures = [];
  const warnings = [];
  if (!Array.isArray(nodeResults)) {
    failures.push("daily codex DAG contract-run node_results must be an array.");
    return nodeResultValidationSummary({ failures, warnings, checkedResults: 0 });
  }

  const planNodes = Array.isArray(plan?.nodes) ? plan.nodes : [];
  const planNodeById = new Map(planNodes.map((node) => [node.id, node]));
  const resultByNodeId = new Map();

  if (nodeResults.length !== planNodes.length) {
    failures.push("daily codex DAG contract-run node_results length must equal plan.node_count.");
  }

  for (let index = 0; index < nodeResults.length; index += 1) {
    const result = nodeResults[index];
    const resultValidation = validateDailyCodexDagNodeResult(result);
    failures.push(...resultValidation.failures);
    warnings.push(...resultValidation.warnings);

    const expectedNode = planNodes[index];
    if (!isPlainObject(result)) continue;
    if (expectedNode && result.node_id !== expectedNode.id) {
      failures.push(`daily codex DAG contract-run node_results[${index}].node_id must match plan node order.`);
    }
    if (resultByNodeId.has(result.node_id)) {
      failures.push(`daily codex DAG contract-run node_results duplicate node_id ${formatSummaryValue(result.node_id)}.`);
    }
    resultByNodeId.set(result.node_id, result);
    validateContractRunNodeResultAgainstPlan({
      result,
      resultByNodeId,
      planNode: planNodeById.get(result.node_id),
      reportDate,
      runId,
      failures
    });
  }

  for (const node of planNodes) {
    if (!resultByNodeId.has(node.id)) {
      failures.push(`daily codex DAG contract-run missing node result for ${node.id}.`);
    }
  }

  return nodeResultValidationSummary({ failures, warnings, checkedResults: nodeResults.length });
}

function validateContractRunNodeResultAgainstPlan({ result, resultByNodeId, planNode, reportDate, runId, failures }) {
  const label = "daily codex DAG contract-run node result";
  if (!planNode) {
    failures.push(`${label} ${formatSummaryValue(result.node_id)} must match a plan node.`);
    return;
  }
  if (result.report_date !== reportDate) failures.push(`${label} ${result.node_id}.report_date must match run report_date.`);
  if (result.run_id !== runId) failures.push(`${label} ${result.node_id}.run_id must match run_id.`);
  if (result.manifest_name !== "daily-codex-dag-contract") failures.push(`${label} ${result.node_id}.manifest_name must match DAG manifest.`);
  if (result.manifest_schema_version !== 1) failures.push(`${label} ${result.node_id}.manifest_schema_version must be 1.`);
  if (result.node_kind !== planNode.kind) failures.push(`${label} ${result.node_id}.node_kind must match plan node kind.`);
  if (result.runner_stage_ref !== planNode.runner_stage_ref) failures.push(`${label} ${result.node_id}.runner_stage_ref must match plan node.`);
  if (result.result_scope !== "node") failures.push(`${label} ${result.node_id}.result_scope must be node.`);
  if (result.status !== "skipped") failures.push(`${label} ${result.node_id}.status must be skipped.`);
  if (result.downstream_disposition !== "continue") failures.push(`${label} ${result.node_id}.downstream_disposition must be continue.`);
  if (result.fanout !== null) failures.push(`${label} ${result.node_id}.fanout must be null in contract-run.`);
  if (result.barrier !== null) failures.push(`${label} ${result.node_id}.barrier must be null in contract-run.`);
  if (!sameArtifactArray(result.declared_inputs, planNode.inputs)) failures.push(`${label} ${result.node_id}.declared_inputs must match plan inputs.`);
  if (!sameArtifactArray(result.declared_outputs, planNode.outputs)) failures.push(`${label} ${result.node_id}.declared_outputs must match plan outputs.`);
  if (Array.isArray(result.resolved_inputs) && result.resolved_inputs.length !== 0) failures.push(`${label} ${result.node_id}.resolved_inputs must be empty in contract-run.`);
  if (Array.isArray(result.resolved_outputs) && result.resolved_outputs.length !== 0) failures.push(`${label} ${result.node_id}.resolved_outputs must be empty in contract-run.`);
  if (!Array.isArray(result.warnings) || !result.warnings.some((warning) => warning?.code === "contract_only_not_executed")) {
    failures.push(`${label} ${result.node_id}.warnings must include contract_only_not_executed.`);
  }
  if (result.audit?.parallel_group !== planNode.parallel_group) failures.push(`${label} ${result.node_id}.audit.parallel_group must match plan node.`);
  if (result.audit?.owner_path_scope !== planNode.owner_path_scope) failures.push(`${label} ${result.node_id}.audit.owner_path_scope must match plan node.`);
  if (result.audit?.public_artifact !== planNode.public_artifact) failures.push(`${label} ${result.node_id}.audit.public_artifact must match plan node.`);

  const expectedDependencies = planNode.dependencies || [];
  const actualDependencies = Array.isArray(result.dependency_results) ? result.dependency_results : [];
  if (actualDependencies.length !== expectedDependencies.length) {
    failures.push(`${label} ${result.node_id}.dependency_results must match direct dependencies.`);
  }
  for (let index = 0; index < expectedDependencies.length; index += 1) {
    const expectedDependencyId = expectedDependencies[index];
    const actualDependency = actualDependencies[index];
    if (!actualDependency) continue;
    if (actualDependency.node_id !== expectedDependencyId) {
      failures.push(`${label} ${result.node_id}.dependency_results must preserve dependency order.`);
    }
    const expectedDependencyResult = resultByNodeId.get(expectedDependencyId);
    if (!expectedDependencyResult || actualDependency.execution_id !== expectedDependencyResult.execution_id) {
      failures.push(`${label} ${result.node_id}.dependency_results must reference dependency execution_id evidence.`);
    }
    if (actualDependency.status !== "skipped" || actualDependency.downstream_disposition !== "continue" || actualDependency.required !== true) {
      failures.push(`${label} ${result.node_id}.dependency_results must reference skipped dependencies that continue.`);
    }
  }
}

function nodeResultValidationSummary({ failures, warnings, checkedResults }) {
  return {
    ok: failures.length === 0,
    failures: uniqueSorted(failures),
    warnings: uniqueSorted(warnings),
    checked_results: checkedResults,
    validator_version: NODE_RESULT_VALIDATOR_VERSION
  };
}

function nodeResultIssue({ code, message, source, retryable }) {
  return { code, message, source, retryable };
}

function validateDagRunFailureSummary(summary, failures) {
  validateExactKeys({
    value: summary,
    allowed: ["ok", "failures", "warnings", "validation", "plan", "run"],
    label: "daily codex DAG run failure summary",
    failures
  });
  if (!Array.isArray(summary.failures) || summary.failures.length === 0) {
    failures.push("daily codex DAG run failure summary must include at least one failure.");
  } else {
    validateMessageArray(summary.failures, "daily codex DAG run failure summary failures", failures);
  }
  if (!Array.isArray(summary.warnings)) {
    failures.push("daily codex DAG run failure summary warnings must be an array.");
  } else {
    validateMessageArray(summary.warnings, "daily codex DAG run failure summary warnings", failures);
  }
  if (summary.plan !== null) {
    failures.push("daily codex DAG run failure summary plan must be null.");
  }
  if (summary.run !== null) {
    failures.push("daily codex DAG run failure summary run must be null.");
  }
  if (summary.validation !== null && !isPlainObject(summary.validation)) {
    failures.push("daily codex DAG run failure summary validation must be null or an object.");
  } else if (isPlainObject(summary.validation)) {
    validateValidationShape({
      validation: summary.validation,
      expectedOk: false,
      label: "daily codex DAG run failure summary validation",
      failures
    });
  }
}

function validateDryRunFailureSummary(summary, failures) {
  validateExactKeys({
    value: summary,
    allowed: ["ok", "failures", "warnings", "validation", "plan", "run"],
    label: "daily codex DAG dry-run failure summary",
    failures
  });
  if (!Array.isArray(summary.failures) || summary.failures.length === 0) {
    failures.push("daily codex DAG dry-run failure summary must include at least one failure.");
  } else {
    validateMessageArray(summary.failures, "daily codex DAG dry-run failure summary failures", failures);
  }
  if (!Array.isArray(summary.warnings)) {
    failures.push("daily codex DAG dry-run failure summary warnings must be an array.");
  } else {
    validateMessageArray(summary.warnings, "daily codex DAG dry-run failure summary warnings", failures);
  }
  if (summary.plan !== null) {
    failures.push("daily codex DAG dry-run failure summary plan must be null.");
  }
  if (summary.run !== null) {
    failures.push("daily codex DAG dry-run failure summary run must be null.");
  }
  if (summary.validation !== null && !isPlainObject(summary.validation)) {
    failures.push("daily codex DAG dry-run failure summary validation must be null or an object.");
  } else if (isPlainObject(summary.validation)) {
    validateValidationShape({
      validation: summary.validation,
      expectedOk: false,
      label: "daily codex DAG dry-run failure summary validation",
      failures
    });
  }
}

function validateDryRunSuccessSummary(summary, failures) {
  validateExactKeys({
    value: summary,
    allowed: [
      "ok",
      "failures",
      "warnings",
      "validation",
      "mode",
      "report_date",
      "generated_at",
      "plan",
      "run",
      "next_action"
    ],
    label: "daily codex DAG dry-run success summary",
    failures
  });
  if (!Array.isArray(summary.failures) || summary.failures.length !== 0) {
    failures.push("daily codex DAG dry-run success summary failures must be empty.");
  }
  if (!Array.isArray(summary.warnings)) {
    failures.push("daily codex DAG dry-run success summary warnings must be an array.");
  } else {
    validateMessageArray(summary.warnings, "daily codex DAG dry-run success summary warnings", failures);
  }
  if (summary.mode !== "daily_codex_dag_dry_run") {
    failures.push("daily codex DAG dry-run success summary mode must be daily_codex_dag_dry_run.");
  }
  if (!isStrictIsoDate(summary.report_date)) {
    failures.push("daily codex DAG dry-run success summary report_date must be a real YYYY-MM-DD date.");
  }
  if (!isCanonicalIsoTimestamp(summary.generated_at)) {
    failures.push("daily codex DAG dry-run success summary generated_at must be a canonical UTC Date#toISOString() string.");
  }
  if (!isPlainObject(summary.validation)) {
    failures.push("daily codex DAG dry-run success summary validation must be an object.");
  } else {
    validateValidationShape({
      validation: summary.validation,
      expectedOk: true,
      label: "daily codex DAG dry-run success summary validation",
      failures
    });
  }
  validateNextActionShape(summary.next_action, failures);

  const plan = isPlainObject(summary.plan) ? summary.plan : null;
  const run = isPlainObject(summary.run) ? summary.run : null;
  if (!plan) {
    failures.push("daily codex DAG dry-run success summary plan must be an object.");
  }
  if (!run) {
    failures.push("daily codex DAG dry-run success summary run must be an object.");
  }
  if (!plan || !run) return;

  validatePlanShape(plan, failures);
  validateRunShape(run, failures);

  const planNodes = Array.isArray(plan.nodes) ? plan.nodes : null;
  const planLevels = Array.isArray(plan.levels) ? plan.levels : null;
  if (!planNodes) {
    failures.push("daily codex DAG dry-run success summary plan.nodes must be an array.");
  }
  if (!planLevels) {
    failures.push("daily codex DAG dry-run success summary plan.levels must be an array.");
  }
  if (!planNodes || !planLevels) return;

  const planNodeIds = planNodes.map((node) => isPlainObject(node) ? node.id : undefined);
  if (plan.node_count !== planNodes.length) {
    failures.push("daily codex DAG dry-run success summary plan.node_count must equal plan.nodes.length.");
  }

  const levelPartition = validatePlanLevelPartition({ planNodes, planLevels, failures });
  validateDryRunSuccessRun({ run, planLevels, planNodeIds, failures });
  validatePlanDependencyLevels({ planNodes, levelByNodeId: levelPartition.levelByNodeId, failures });
}

function validateContractRunSuccessSummary(summary, failures) {
  validateExactKeys({
    value: summary,
    allowed: [
      "ok",
      "failures",
      "warnings",
      "validation",
      "mode",
      "report_date",
      "generated_at",
      "run_id",
      "plan",
      "run",
      "node_results",
      "node_result_validation",
      "fanout_expansions",
      "executed_commands",
      "codex_invocations",
      "next_action"
    ],
    label: "daily codex DAG contract-run success summary",
    failures
  });
  if (!Array.isArray(summary.failures) || summary.failures.length !== 0) {
    failures.push("daily codex DAG contract-run success summary failures must be empty.");
  }
  if (!Array.isArray(summary.warnings)) {
    failures.push("daily codex DAG contract-run success summary warnings must be an array.");
  } else {
    validateMessageArray(summary.warnings, "daily codex DAG contract-run success summary warnings", failures);
  }
  if (summary.mode !== "daily_codex_dag_contract_run") {
    failures.push("daily codex DAG contract-run success summary mode must be daily_codex_dag_contract_run.");
  }
  if (!isStrictIsoDate(summary.report_date)) {
    failures.push("daily codex DAG contract-run success summary report_date must be a real YYYY-MM-DD date.");
  }
  if (!isCanonicalIsoTimestamp(summary.generated_at)) {
    failures.push("daily codex DAG contract-run success summary generated_at must be a canonical UTC Date#toISOString() string.");
  }
  if (!isStableIdentifier(summary.run_id)) {
    failures.push("daily codex DAG contract-run success summary run_id must be a stable identifier.");
  }
  if (!isPlainObject(summary.validation)) {
    failures.push("daily codex DAG contract-run success summary validation must be an object.");
  } else {
    validateValidationShape({
      validation: summary.validation,
      expectedOk: true,
      label: "daily codex DAG contract-run success summary validation",
      failures
    });
  }
  validateNextActionShape(summary.next_action, failures, "daily codex DAG contract-run success summary next_action");

  const plan = isPlainObject(summary.plan) ? summary.plan : null;
  const run = isPlainObject(summary.run) ? summary.run : null;
  if (!plan) failures.push("daily codex DAG contract-run success summary plan must be an object.");
  if (!run) failures.push("daily codex DAG contract-run success summary run must be an object.");
  if (!plan || !run) return;

  validatePlanShape(plan, failures);
  validateContractRunShape(run, failures);
  validateContractRunNodeResultValidation(summary.node_result_validation, failures);
  validateContractRunExpansionArray(summary.fanout_expansions, failures);

  if (!Array.isArray(summary.executed_commands) || summary.executed_commands.length !== 0) {
    failures.push("daily codex DAG contract-run success summary executed_commands must be empty.");
  }
  if (!Array.isArray(summary.codex_invocations) || summary.codex_invocations.length !== 0) {
    failures.push("daily codex DAG contract-run success summary codex_invocations must be empty.");
  }
  if (!Array.isArray(summary.node_results)) {
    failures.push("daily codex DAG contract-run success summary node_results must be an array.");
    return;
  }

  const planNodes = Array.isArray(plan.nodes) ? plan.nodes : null;
  const planLevels = Array.isArray(plan.levels) ? plan.levels : null;
  if (!planNodes) failures.push("daily codex DAG contract-run success summary plan.nodes must be an array.");
  if (!planLevels) failures.push("daily codex DAG contract-run success summary plan.levels must be an array.");
  if (!planNodes || !planLevels) return;

  const planNodeIds = planNodes.map((node) => isPlainObject(node) ? node.id : undefined);
  if (plan.node_count !== planNodes.length) {
    failures.push("daily codex DAG contract-run success summary plan.node_count must equal plan.nodes.length.");
  }

  const levelPartition = validatePlanLevelPartition({ planNodes, planLevels, failures });
  validateContractRunSuccessRun({ run, planLevels, planNodeIds, failures });
  validatePlanDependencyLevels({ planNodes, levelByNodeId: levelPartition.levelByNodeId, failures });
  validateContractRunExpansionSemantics({ expansions: summary.fanout_expansions, planNodes, failures });

  const nodeResultValidation = validateContractRunNodeResults({
    plan,
    reportDate: summary.report_date,
    runId: summary.run_id,
    nodeResults: summary.node_results
  });
  failures.push(...nodeResultValidation.failures);
  if (isPlainObject(summary.node_result_validation)) {
    if (summary.node_result_validation.ok !== true) {
      failures.push("daily codex DAG contract-run success summary node_result_validation.ok must be true.");
    }
    if (summary.node_result_validation.checked_results !== summary.node_results.length) {
      failures.push("daily codex DAG contract-run success summary node_result_validation.checked_results must equal node_results length.");
    }
  }
}

function validateNodeResultShape(result, failures) {
  const label = "daily codex DAG node result";
  validateExactKeys({
    value: result,
    allowed: [
      "schema_version",
      "mode",
      "report_date",
      "run_id",
      "manifest_name",
      "manifest_schema_version",
      "node_id",
      "node_kind",
      "runner_stage_ref",
      "result_scope",
      "execution_id",
      "status",
      "downstream_disposition",
      "started_at",
      "finished_at",
      "duration_ms",
      "attempts_started",
      "max_attempts",
      "attempts_exhausted",
      "dependency_results",
      "declared_inputs",
      "declared_outputs",
      "resolved_inputs",
      "resolved_outputs",
      "fanout",
      "barrier",
      "failures",
      "warnings",
      "audit"
    ],
    label,
    failures
  });
  if (result.schema_version !== 1) failures.push(`${label}.schema_version must be 1.`);
  if (result.mode !== "daily_codex_dag_node_result") failures.push(`${label}.mode must be daily_codex_dag_node_result.`);
  if (!isStrictIsoDate(result.report_date)) failures.push(`${label}.report_date must be a real YYYY-MM-DD date.`);
  if (!isStableIdentifier(result.run_id)) failures.push(`${label}.run_id must be a stable identifier.`);
  if (!nonEmptyString(result.manifest_name)) failures.push(`${label}.manifest_name must be a non-empty string.`);
  if (result.manifest_schema_version !== 1) failures.push(`${label}.manifest_schema_version must be 1.`);
  if (!isNodeId(result.node_id)) failures.push(`${label}.node_id must be a node id.`);
  if (!NODE_KINDS.includes(result.node_kind)) failures.push(`${label}.node_kind is invalid.`);
  if (typeof result.runner_stage_ref !== "string") failures.push(`${label}.runner_stage_ref must be a string.`);
  if (!NODE_RESULT_SCOPES.includes(result.result_scope)) failures.push(`${label}.result_scope is invalid.`);
  if (!isStableIdentifier(result.execution_id)) failures.push(`${label}.execution_id must be a stable identifier.`);
  if (!NODE_RESULT_STATUSES.includes(result.status)) failures.push(`${label}.status is invalid.`);
  if (!NODE_RESULT_DOWNSTREAM_DISPOSITIONS.includes(result.downstream_disposition)) failures.push(`${label}.downstream_disposition is invalid.`);
  validateNullableTimestamp(result.started_at, `${label}.started_at`, failures);
  validateNullableTimestamp(result.finished_at, `${label}.finished_at`, failures);
  if (!Number.isInteger(result.duration_ms) || result.duration_ms < 0) failures.push(`${label}.duration_ms must be a non-negative integer.`);
  if (!Number.isInteger(result.attempts_started) || result.attempts_started < 0) failures.push(`${label}.attempts_started must be a non-negative integer.`);
  if (!Number.isInteger(result.max_attempts) || result.max_attempts < 1) failures.push(`${label}.max_attempts must be a positive integer.`);
  if (typeof result.attempts_exhausted !== "boolean") failures.push(`${label}.attempts_exhausted must be a boolean.`);
  validateDependencyResultArray(result.dependency_results, `${label}.dependency_results`, failures);
  validateNodeResultDeclaredArtifactArray(result.declared_inputs, `${label}.declared_inputs`, failures);
  validateNodeResultDeclaredArtifactArray(result.declared_outputs, `${label}.declared_outputs`, failures);
  validateNodeResultResolvedArtifactArray(result.resolved_inputs, `${label}.resolved_inputs`, failures);
  validateNodeResultResolvedArtifactArray(result.resolved_outputs, `${label}.resolved_outputs`, failures);
  validateIssueObjectArray(result.failures, `${label}.failures`, failures);
  validateIssueObjectArray(result.warnings, `${label}.warnings`, failures);
  validateFanoutResultShape(result.fanout, `${label}.fanout`, failures);
  validateBarrierResultShape(result.barrier, `${label}.barrier`, failures);
  validateNodeResultAuditShape(result.audit, `${label}.audit`, failures);
}

function validateNodeResultSemantics(result, failures) {
  const label = "daily codex DAG node result";
  if (Number.isInteger(result.attempts_started) && Number.isInteger(result.max_attempts) && result.attempts_started > result.max_attempts) {
    failures.push(`${label}.attempts_started must not exceed max_attempts.`);
  }

  validateNodeResultTiming(result, failures);
  validateNodeResultStatusSemantics(result, failures);
  validateNodeResultScopeSemantics(result, failures);

  if (result.status === "success") {
    validateRequiredArtifactsResolved({
      declared: result.declared_inputs,
      resolved: result.resolved_inputs,
      label: `${label}.resolved_inputs`,
      failures
    });
    validateRequiredArtifactsResolved({
      declared: result.declared_outputs,
      resolved: result.resolved_outputs,
      label: `${label}.resolved_outputs`,
      failures
    });
    if (Array.isArray(result.dependency_results)) {
      for (const dependency of result.dependency_results) {
        if (dependency?.required && (dependency.status !== "success" || dependency.downstream_disposition !== "continue")) {
          failures.push(`${label} success requires required dependency ${formatSummaryValue(dependency.node_id)} to allow downstream continuation.`);
        }
      }
    }
  }
}

function validateNodeResultTiming(result, failures) {
  const label = "daily codex DAG node result";
  const hasStarted = isCanonicalIsoTimestamp(result.started_at);
  const hasFinished = isCanonicalIsoTimestamp(result.finished_at);
  if (result.status === "success" || result.status === "failure") {
    if (!hasStarted) failures.push(`${label}.${result.status} started_at must be a canonical UTC Date#toISOString() string.`);
    if (!hasFinished) failures.push(`${label}.${result.status} finished_at must be a canonical UTC Date#toISOString() string.`);
  }
  if (result.status === "blocked" || result.status === "skipped") {
    if (result.started_at !== null || result.finished_at !== null) {
      failures.push(`${label}.${result.status} must not include execution timestamps.`);
    }
    if (result.duration_ms !== 0) {
      failures.push(`${label}.${result.status} duration_ms must be 0.`);
    }
  }
  if (hasStarted && hasFinished) {
    const durationMs = Date.parse(result.finished_at) - Date.parse(result.started_at);
    if (durationMs < 0) {
      failures.push(`${label}.finished_at must be greater than or equal to started_at.`);
    } else if (result.duration_ms !== durationMs) {
      failures.push(`${label}.duration_ms must equal finished_at - started_at.`);
    }
  }
}

function validateNodeResultStatusSemantics(result, failures) {
  const label = "daily codex DAG node result";
  if (!NODE_RESULT_STATUSES.includes(result.status)) return;
  const failureCount = Array.isArray(result.failures) ? result.failures.length : 0;
  const warningCount = Array.isArray(result.warnings) ? result.warnings.length : 0;

  if (result.status === "success") {
    if (failureCount !== 0) failures.push(`${label}.success failures must be empty.`);
    if (result.downstream_disposition !== "continue") failures.push(`${label}.success downstream_disposition must be continue.`);
    if (!Number.isInteger(result.attempts_started) || result.attempts_started < 1) failures.push(`${label}.success attempts_started must be at least 1.`);
    if (result.attempts_exhausted !== false) failures.push(`${label}.success attempts_exhausted must be false.`);
  }
  if (result.status === "failure") {
    if (failureCount === 0) failures.push(`${label}.failure failures must be non-empty.`);
    if (result.downstream_disposition !== "block") failures.push(`${label}.failure downstream_disposition must be block.`);
    if (!Number.isInteger(result.attempts_started) || result.attempts_started < 1) failures.push(`${label}.failure attempts_started must be at least 1.`);
    if (result.attempts_exhausted !== true) failures.push(`${label}.failure attempts_exhausted must be true.`);
  }
  if (result.status === "blocked") {
    if (failureCount === 0) failures.push(`${label}.blocked failures must be non-empty.`);
    if (result.downstream_disposition !== "block") failures.push(`${label}.blocked downstream_disposition must be block.`);
    if (result.attempts_started !== 0) failures.push(`${label}.blocked attempts_started must be 0.`);
    if (result.attempts_exhausted !== false) failures.push(`${label}.blocked attempts_exhausted must be false.`);
  }
  if (result.status === "skipped") {
    if (failureCount !== 0) failures.push(`${label}.skipped failures must be empty.`);
    if (result.downstream_disposition !== "continue") failures.push(`${label}.skipped downstream_disposition must be continue.`);
    if (warningCount === 0) failures.push(`${label}.skipped warnings must include a skip reason.`);
    if (result.attempts_started !== 0) failures.push(`${label}.skipped attempts_started must be 0.`);
    if (result.attempts_exhausted !== false) failures.push(`${label}.skipped attempts_exhausted must be false.`);
  }
}

function validateNodeResultScopeSemantics(result, failures) {
  const label = "daily codex DAG node result";
  if (result.result_scope === "fanout_item") {
    if (result.node_kind !== "fanout") failures.push(`${label}.fanout_item node_kind must be fanout.`);
    if (!isPlainObject(result.fanout)) {
      failures.push(`${label}.fanout_item requires fanout metadata.`);
    }
  } else if (result.fanout !== null) {
    failures.push(`${label}.fanout must be null unless result_scope is fanout_item.`);
  }

  if (result.result_scope === "barrier") {
    if (result.node_kind !== "barrier") failures.push(`${label}.barrier node_kind must be barrier.`);
    if (!isPlainObject(result.barrier)) {
      failures.push(`${label}.barrier result requires barrier metadata.`);
    } else {
      validateBarrierResultSemantics(result, failures);
    }
  } else if (result.barrier !== null) {
    failures.push(`${label}.barrier must be null unless result_scope is barrier.`);
  }
}

function validateBarrierResultSemantics(result, failures) {
  const label = "daily codex DAG node result.barrier";
  const expected = result.barrier.expected_execution_ids;
  const observed = result.barrier.observed_execution_ids;
  const missing = result.barrier.missing_execution_ids;
  if (!Array.isArray(expected) || !Array.isArray(observed) || !Array.isArray(missing)) return;

  const expectedSet = new Set(expected);
  const dependencyResults = Array.isArray(result.dependency_results) ? result.dependency_results : [];
  const dependencyByExecutionId = new Map();
  for (const dependency of dependencyResults) {
    if (isPlainObject(dependency) && isStableIdentifier(dependency.execution_id)) {
      dependencyByExecutionId.set(dependency.execution_id, dependency);
    }
  }
  for (const executionId of expected) {
    if (!dependencyByExecutionId.has(executionId)) {
      failures.push(`${label}.expected_execution_ids must have matching dependency_results entries.`);
      break;
    }
  }
  for (const executionId of observed) {
    if (!expectedSet.has(executionId)) {
      failures.push(`${label}.observed_execution_ids must be a subset of expected_execution_ids.`);
      break;
    }
    const dependency = dependencyByExecutionId.get(executionId);
    if (!dependency) {
      failures.push(`${label}.observed_execution_ids must have matching dependency_results entries.`);
      break;
    }
    if (dependency.downstream_disposition !== "continue" || dependency.status !== "success") {
      failures.push(`${label}.observed_execution_ids must reference successful dependency results that allow downstream continuation.`);
      break;
    }
  }
  const expectedMissing = expected.filter((executionId) => !observed.includes(executionId));
  if (!sameOrderedStringArray(missing, expectedMissing)) {
    failures.push(`${label}.missing_execution_ids must equal expected minus observed execution ids.`);
  }
  if (result.status === "success" && missing.length !== 0) {
    failures.push(`${label}.success must not have missing execution ids.`);
  }
}

function validateRequiredArtifactsResolved({ declared, resolved, label, failures }) {
  if (!Array.isArray(declared) || !Array.isArray(resolved)) return;
  for (const artifact of declared) {
    if (!isPlainObject(artifact) || artifact.required !== true || !nonEmptyString(artifact.path)) continue;
    const resolvedArtifact = resolved.find((item) => isPlainObject(item) && item.path === artifact.path);
    if (!resolvedArtifact) {
      failures.push(`${label} must include required artifact ${artifact.path}.`);
      continue;
    }
    if (resolvedArtifact.exists !== true) {
      failures.push(`${label} required artifact ${artifact.path} must exist.`);
    }
    if (resolvedArtifact.schema_valid !== true) {
      failures.push(`${label} required artifact ${artifact.path} must be schema_valid.`);
    }
  }
}

function validateDependencyResultArray(values, label, failures) {
  if (!Array.isArray(values)) {
    failures.push(`${label} must be an array.`);
    return;
  }
  const executionIds = new Set();
  for (const value of values) {
    if (!isPlainObject(value)) {
      failures.push(`${label} entries must be objects.`);
      continue;
    }
    validateExactKeys({
      value,
      allowed: ["node_id", "execution_id", "status", "required", "downstream_disposition"],
      label: `${label} entry`,
      failures
    });
    if (!isNodeId(value.node_id)) failures.push(`${label} entry.node_id must be a node id.`);
    if (!isStableIdentifier(value.execution_id)) failures.push(`${label} entry.execution_id must be a stable identifier.`);
    if (!NODE_RESULT_STATUSES.includes(value.status)) failures.push(`${label} entry.status is invalid.`);
    if (typeof value.required !== "boolean") failures.push(`${label} entry.required must be a boolean.`);
    if (!NODE_RESULT_DOWNSTREAM_DISPOSITIONS.includes(value.downstream_disposition)) failures.push(`${label} entry.downstream_disposition is invalid.`);
    if (value.status === "success" && value.downstream_disposition !== "continue") {
      failures.push(`${label} entry.success downstream_disposition must be continue.`);
    }
    if ((value.status === "failure" || value.status === "blocked") && value.downstream_disposition !== "block") {
      failures.push(`${label} entry.${value.status} downstream_disposition must be block.`);
    }
    if (value.status === "skipped" && value.downstream_disposition !== "continue") {
      failures.push(`${label} entry.skipped downstream_disposition must be continue.`);
    }
    if (isStableIdentifier(value.execution_id)) {
      if (executionIds.has(value.execution_id)) failures.push(`${label} entry.execution_id values must be unique.`);
      executionIds.add(value.execution_id);
    }
  }
}

function validateNodeResultDeclaredArtifactArray(values, label, failures) {
  if (!Array.isArray(values)) {
    failures.push(`${label} must be an array.`);
    return;
  }
  for (const artifact of values) {
    if (!isPlainObject(artifact)) {
      failures.push(`${label} entries must be objects.`);
      continue;
    }
    validateExactKeys({ value: artifact, allowed: ["path", "required"], label: `${label} entry`, failures });
    if (!nonEmptyString(artifact.path)) failures.push(`${label} entry.path must be a non-empty string.`);
    if (typeof artifact.required !== "boolean") failures.push(`${label} entry.required must be a boolean.`);
  }
}

function validateNodeResultResolvedArtifactArray(values, label, failures) {
  if (!Array.isArray(values)) {
    failures.push(`${label} must be an array.`);
    return;
  }
  for (const artifact of values) {
    if (!isPlainObject(artifact)) {
      failures.push(`${label} entries must be objects.`);
      continue;
    }
    validateExactKeys({
      value: artifact,
      allowed: ["path", "required", "exists", "schema_valid", "bytes", "sha256"],
      label: `${label} entry`,
      failures
    });
    if (!nonEmptyString(artifact.path)) failures.push(`${label} entry.path must be a non-empty string.`);
    if (typeof artifact.required !== "boolean") failures.push(`${label} entry.required must be a boolean.`);
    if (typeof artifact.exists !== "boolean") failures.push(`${label} entry.exists must be a boolean.`);
    if (typeof artifact.schema_valid !== "boolean") failures.push(`${label} entry.schema_valid must be a boolean.`);
    if (artifact.bytes !== null && (!Number.isInteger(artifact.bytes) || artifact.bytes < 0)) failures.push(`${label} entry.bytes must be null or a non-negative integer.`);
    if (artifact.sha256 !== null && !(typeof artifact.sha256 === "string" && /^[a-f0-9]{64}$/.test(artifact.sha256))) failures.push(`${label} entry.sha256 must be null or a lowercase sha256 hex string.`);
  }
}

function validateIssueObjectArray(values, label, failures) {
  if (!Array.isArray(values)) {
    failures.push(`${label} must be an array.`);
    return;
  }
  for (const issue of values) {
    if (!isPlainObject(issue)) {
      failures.push(`${label} entries must be objects.`);
      continue;
    }
    validateExactKeys({ value: issue, allowed: ["code", "message", "source", "retryable"], label: `${label} entry`, failures });
    if (!nonEmptyString(issue.code)) failures.push(`${label} entry.code must be a non-empty string.`);
    if (!nonEmptyString(issue.message)) failures.push(`${label} entry.message must be a non-empty string.`);
    if (!nonEmptyString(issue.source)) failures.push(`${label} entry.source must be a non-empty string.`);
    if (typeof issue.retryable !== "boolean") failures.push(`${label} entry.retryable must be a boolean.`);
  }
}

function validateFanoutResultShape(value, label, failures) {
  if (value === null) return;
  if (!isPlainObject(value)) {
    failures.push(`${label} must be null or an object.`);
    return;
  }
  validateExactKeys({ value, allowed: ["item_id", "fanout_key"], label, failures });
  if (!nonEmptyString(value.item_id)) failures.push(`${label}.item_id must be a non-empty string.`);
  if (!isStableIdentifier(value.fanout_key)) failures.push(`${label}.fanout_key must be a stable identifier.`);
}

function validateBarrierResultShape(value, label, failures) {
  if (value === null) return;
  if (!isPlainObject(value)) {
    failures.push(`${label} must be null or an object.`);
    return;
  }
  validateExactKeys({
    value,
    allowed: ["expected_execution_ids", "observed_execution_ids", "missing_execution_ids"],
    label,
    failures
  });
  validateStableIdentifierArray(value.expected_execution_ids, `${label}.expected_execution_ids`, failures);
  validateStableIdentifierArray(value.observed_execution_ids, `${label}.observed_execution_ids`, failures);
  validateStableIdentifierArray(value.missing_execution_ids, `${label}.missing_execution_ids`, failures);
}

function validateNodeResultAuditShape(value, label, failures) {
  if (!isPlainObject(value)) {
    failures.push(`${label} must be an object.`);
    return;
  }
  validateExactKeys({
    value,
    allowed: ["parallel_group", "resilience_policy_ref", "owner_path_scope", "public_artifact", "validator_version"],
    label,
    failures
  });
  if (typeof value.parallel_group !== "string") failures.push(`${label}.parallel_group must be a string.`);
  if (typeof value.resilience_policy_ref !== "string") failures.push(`${label}.resilience_policy_ref must be a string.`);
  if (!["internal_workdir", "docs", "reports_data", "none"].includes(value.owner_path_scope)) failures.push(`${label}.owner_path_scope is invalid.`);
  if (typeof value.public_artifact !== "boolean") failures.push(`${label}.public_artifact must be a boolean.`);
  if (value.validator_version !== NODE_RESULT_VALIDATOR_VERSION) failures.push(`${label}.validator_version must be ${NODE_RESULT_VALIDATOR_VERSION}.`);
}

function validateValidationShape({ validation, expectedOk, label, failures }) {
  validateExactKeys({
    value: validation,
    allowed: ["ok", "failures", "warnings", "node_ids", "checked_files"],
    label,
    failures
  });
  if (validation.ok !== expectedOk) {
    failures.push(`${label}.ok must be ${expectedOk}.`);
  }
  if (!Array.isArray(validation.failures)) {
    failures.push(`${label}.failures must be an array.`);
  } else {
    validateMessageArray(validation.failures, `${label}.failures`, failures);
    if (expectedOk === true && validation.failures.length !== 0) {
      failures.push(`${label}.failures must be empty when validation.ok is true.`);
    }
  }
  if (!Array.isArray(validation.warnings)) {
    failures.push(`${label}.warnings must be an array.`);
  } else {
    validateMessageArray(validation.warnings, `${label}.warnings`, failures);
  }
  validateNodeIdArray(validation.node_ids, `${label}.node_ids`, failures);
  validateStringArray(validation.checked_files, `${label}.checked_files`, failures);
}

function validatePlanShape(plan, failures) {
  validateExactKeys({
    value: plan,
    allowed: ["schema_version", "manifest_name", "description", "node_count", "levels", "nodes"],
    label: "daily codex DAG dry-run success summary plan",
    failures
  });
  if (plan.schema_version !== 1) {
    failures.push("daily codex DAG dry-run success summary plan.schema_version must be 1.");
  }
  if (!nonEmptyString(plan.manifest_name)) {
    failures.push("daily codex DAG dry-run success summary plan.manifest_name must be a non-empty string.");
  }
  if (!nonEmptyString(plan.description)) {
    failures.push("daily codex DAG dry-run success summary plan.description must be a non-empty string.");
  }
  if (!Number.isInteger(plan.node_count) || plan.node_count < 0) {
    failures.push("daily codex DAG dry-run success summary plan.node_count must be a non-negative integer.");
  }
  if (Array.isArray(plan.levels)) {
    for (const level of plan.levels) {
      validateLevelShape(level, "daily codex DAG dry-run success summary plan.levels entry", failures);
    }
  }
  if (Array.isArray(plan.nodes)) {
    for (const node of plan.nodes) {
      validatePlanNodeShape(node, failures);
    }
  }
}

function validatePlanNodeShape(node, failures) {
  const label = "daily codex DAG dry-run success summary plan.nodes entry";
  if (!isPlainObject(node)) {
    failures.push(`${label} must be an object.`);
    return;
  }
  validateExactKeys({
    value: node,
    allowed: [
      "id",
      "title",
      "kind",
      "execution_status",
      "execution_contract",
      "plan_status",
      "level",
      "dependencies",
      "inputs",
      "outputs",
      "runner_stage_ref",
      "parallel_group",
      "public_artifact",
      "owner_path_scope"
    ],
    label,
    failures
  });
  if (!isNodeId(node.id)) failures.push(`${label}.id must be a node id.`);
  if (!nonEmptyString(node.title)) failures.push(`${label}.title must be a non-empty string.`);
  if (!["command", "codex_exec", "fanout", "barrier"].includes(node.kind)) failures.push(`${label}.kind is invalid.`);
  if (!["planned", "mapped"].includes(node.execution_status)) failures.push(`${label}.execution_status is invalid.`);
  validateExecutionContractShape(node.execution_contract, `${label}.execution_contract`, failures);
  validateExecutionReadiness({
    nodeId: node.id,
    executionStatus: node.execution_status,
    readiness: node.execution_contract?.readiness,
    label,
    failures
  });
  if (!["planned", "mapped"].includes(node.plan_status)) failures.push(`${label}.plan_status is invalid.`);
  if (!Number.isInteger(node.level) || node.level < 0) failures.push(`${label}.level must be a non-negative integer.`);
  validateNodeIdArray(node.dependencies, `${label}.dependencies`, failures);
  validateArtifactArray(node.inputs, `${label}.inputs`, failures);
  validateArtifactArray(node.outputs, `${label}.outputs`, failures);
  if (typeof node.runner_stage_ref !== "string") failures.push(`${label}.runner_stage_ref must be a string.`);
  if (typeof node.parallel_group !== "string") failures.push(`${label}.parallel_group must be a string.`);
  if (typeof node.public_artifact !== "boolean") failures.push(`${label}.public_artifact must be a boolean.`);
  if (!["internal_workdir", "docs", "reports_data", "none"].includes(node.owner_path_scope)) failures.push(`${label}.owner_path_scope is invalid.`);
}

function validateExecutionContractShape(contract, label, failures) {
  if (!isPlainObject(contract)) {
    failures.push(`${label} must be an object.`);
    return;
  }
  validateExactKeys({
    value: contract,
    allowed: ["readiness", "summary"],
    label,
    failures
  });
  if (!EXECUTION_READINESS_VALUES.includes(contract.readiness)) {
    failures.push(`${label}.readiness is invalid.`);
  }
  if (!nonEmptyString(contract.summary)) {
    failures.push(`${label}.summary must be a non-empty string.`);
  }
}

function validateExecutionReadiness({ nodeId, executionStatus, readiness, label, failures }) {
  if (executionStatus === "planned" && readiness !== "planned_only") {
    failures.push(`${label} ${formatSummaryValue(nodeId)} with execution_status planned must use execution_contract.readiness planned_only.`);
  }
  if (executionStatus === "mapped" && readiness !== "legacy_mapped") {
    failures.push(`${label} ${formatSummaryValue(nodeId)} with execution_status mapped must use execution_contract.readiness legacy_mapped; legacy mapped is not node-level execution.`);
  }
  if (readiness === "node_executable") {
    failures.push(`${label} ${formatSummaryValue(nodeId)} execution_contract.readiness node_executable is reserved until executor migration enables standalone node execution.`);
  }
}

function validateRunShape(run, failures) {
  validateExactKeys({
    value: run,
    allowed: ["final_status", "levels", "planned_nodes", "completed_nodes", "blocked_nodes"],
    label: "daily codex DAG dry-run success summary run",
    failures
  });
  if (Array.isArray(run.levels)) {
    for (const level of run.levels) {
      validateLevelShape(level, "daily codex DAG dry-run success summary run.levels entry", failures);
    }
  }
  validateNodeIdArray(run.planned_nodes, "daily codex DAG dry-run success summary run.planned_nodes", failures);
  validateNodeIdArray(run.completed_nodes, "daily codex DAG dry-run success summary run.completed_nodes", failures);
  validateNodeIdArray(run.blocked_nodes, "daily codex DAG dry-run success summary run.blocked_nodes", failures);
}

function validateContractRunShape(run, failures) {
  validateExactKeys({
    value: run,
    allowed: ["final_status", "levels", "planned_nodes", "contract_validated_nodes", "skipped_nodes", "blocked_nodes"],
    label: "daily codex DAG contract-run success summary run",
    failures
  });
  if (Array.isArray(run.levels)) {
    for (const level of run.levels) {
      validateLevelShape(level, "daily codex DAG contract-run success summary run.levels entry", failures);
    }
  }
  validateNodeIdArray(run.planned_nodes, "daily codex DAG contract-run success summary run.planned_nodes", failures);
  validateNodeIdArray(run.contract_validated_nodes, "daily codex DAG contract-run success summary run.contract_validated_nodes", failures);
  validateNodeIdArray(run.skipped_nodes, "daily codex DAG contract-run success summary run.skipped_nodes", failures);
  validateNodeIdArray(run.blocked_nodes, "daily codex DAG contract-run success summary run.blocked_nodes", failures);
}

function validateContractRunNodeResultValidation(value, failures) {
  const label = "daily codex DAG contract-run success summary node_result_validation";
  if (!isPlainObject(value)) {
    failures.push(`${label} must be an object.`);
    return;
  }
  validateExactKeys({
    value,
    allowed: ["ok", "failures", "warnings", "checked_results", "validator_version"],
    label,
    failures
  });
  if (value.ok !== true) failures.push(`${label}.ok must be true.`);
  if (!Array.isArray(value.failures) || value.failures.length !== 0) {
    failures.push(`${label}.failures must be empty.`);
  } else {
    validateMessageArray(value.failures, `${label}.failures`, failures);
  }
  if (!Array.isArray(value.warnings)) {
    failures.push(`${label}.warnings must be an array.`);
  } else {
    validateMessageArray(value.warnings, `${label}.warnings`, failures);
  }
  if (!Number.isInteger(value.checked_results) || value.checked_results < 0) {
    failures.push(`${label}.checked_results must be a non-negative integer.`);
  }
  if (value.validator_version !== NODE_RESULT_VALIDATOR_VERSION) {
    failures.push(`${label}.validator_version must be ${NODE_RESULT_VALIDATOR_VERSION}.`);
  }
}

function validateContractRunExpansionArray(values, failures) {
  const label = "daily codex DAG contract-run success summary fanout_expansions";
  if (!Array.isArray(values)) {
    failures.push(`${label} must be an array.`);
    return;
  }
  const seen = new Set();
  for (const value of values) {
    if (!isPlainObject(value)) {
      failures.push(`${label} entries must be objects.`);
      continue;
    }
    validateExactKeys({ value, allowed: ["node_id", "kind", "status", "item_count"], label: `${label} entry`, failures });
    if (!isNodeId(value.node_id)) failures.push(`${label} entry.node_id must be a node id.`);
    if (!["fanout", "barrier"].includes(value.kind)) failures.push(`${label} entry.kind must be fanout or barrier.`);
    if (value.status !== "not_expanded") failures.push(`${label} entry.status must be not_expanded.`);
    if (value.item_count !== null) failures.push(`${label} entry.item_count must be null.`);
    if (seen.has(value.node_id)) failures.push(`${label} entry.node_id values must be unique.`);
    seen.add(value.node_id);
  }
}

function validateNextActionShape(nextAction, failures, label = "daily codex DAG dry-run success summary next_action") {
  if (!isPlainObject(nextAction)) {
    failures.push(`${label} must be an object.`);
    return;
  }
  validateExactKeys({
    value: nextAction,
    allowed: ["kind", "message"],
    label,
    failures
  });
  if (nextAction.kind !== "implement_executable_node_runner") {
    failures.push(`${label}.kind must be implement_executable_node_runner.`);
  }
  if (!nonEmptyString(nextAction.message)) {
    failures.push(`${label}.message must be a non-empty string.`);
  }
}

function validateLevelShape(level, label, failures) {
  if (!isPlainObject(level)) {
    failures.push(`${label} must be an object.`);
    return;
  }
  validateExactKeys({ value: level, allowed: ["level", "node_ids"], label, failures });
  if (!Number.isInteger(level.level) || level.level < 0) {
    failures.push(`${label}.level must be a non-negative integer.`);
  }
  validateNodeIdArray(level.node_ids, `${label}.node_ids`, failures, { minItems: 1 });
}

function validateArtifactArray(artifacts, label, failures) {
  if (!Array.isArray(artifacts)) {
    failures.push(`${label} must be an array.`);
    return;
  }
  for (const artifact of artifacts) {
    if (!isPlainObject(artifact)) {
      failures.push(`${label} entries must be objects.`);
      continue;
    }
    validateExactKeys({ value: artifact, allowed: ["path", "required"], label: `${label} entry`, failures });
    if (!nonEmptyString(artifact.path)) failures.push(`${label} entry.path must be a non-empty string.`);
    if (typeof artifact.required !== "boolean") failures.push(`${label} entry.required must be a boolean.`);
  }
}

function validatePlanLevelPartition({ planNodes, planLevels, failures }) {
  const planNodeIds = planNodes.map((node) => isPlainObject(node) ? node.id : undefined);
  const planNodeIdSet = new Set(planNodeIds.filter((id) => typeof id === "string"));
  const levelByNodeId = new Map();
  const flattened = [];
  const levelValues = new Set();

  for (const level of planLevels) {
    if (!isPlainObject(level)) {
      failures.push("daily codex DAG dry-run success summary plan.levels entries must be objects.");
      continue;
    }
    if (!Number.isInteger(level.level)) {
      failures.push("daily codex DAG dry-run success summary plan.levels entries must have integer level.");
    } else if (levelValues.has(level.level)) {
      failures.push(`daily codex DAG dry-run success summary plan.levels duplicate level ${level.level}.`);
    } else {
      levelValues.add(level.level);
    }
    if (!Array.isArray(level.node_ids)) {
      failures.push("daily codex DAG dry-run success summary plan.levels entries must include node_ids arrays.");
      continue;
    }
    for (const nodeId of level.node_ids) {
      flattened.push(nodeId);
      if (!planNodeIdSet.has(nodeId)) {
        failures.push(`daily codex DAG dry-run success summary plan.levels references unknown node ${formatSummaryValue(nodeId)}.`);
        continue;
      }
      if (levelByNodeId.has(nodeId)) {
        failures.push(`daily codex DAG dry-run success summary plan.levels repeats node ${nodeId}.`);
        continue;
      }
      levelByNodeId.set(nodeId, level.level);
    }
  }

  if (!sameOrderedStringArray(flattened, planNodeIds)) {
    failures.push("daily codex DAG dry-run success summary plan.levels flattened node_ids must equal plan.nodes ids.");
  }

  for (const node of planNodes) {
    if (!isPlainObject(node) || typeof node.id !== "string") {
      failures.push("daily codex DAG dry-run success summary plan.nodes entries must include string ids.");
      continue;
    }
    if (levelByNodeId.get(node.id) !== node.level) {
      failures.push(`daily codex DAG dry-run success summary plan node ${node.id} level must match plan.levels.`);
    }
  }

  return { levelByNodeId };
}

function validateDryRunSuccessRun({ run, planLevels, planNodeIds, failures }) {
  if (run.final_status !== "dry_run_only") {
    failures.push("daily codex DAG dry-run success summary run.final_status must be dry_run_only.");
  }
  if (!sameOrderedStringArray(run.planned_nodes, planNodeIds)) {
    failures.push("daily codex DAG dry-run success summary run.planned_nodes must equal plan.nodes ids.");
  }
  if (!Array.isArray(run.completed_nodes) || run.completed_nodes.length !== 0) {
    failures.push("daily codex DAG dry-run success summary run.completed_nodes must be empty.");
  }
  if (!Array.isArray(run.blocked_nodes) || run.blocked_nodes.length !== 0) {
    failures.push("daily codex DAG dry-run success summary run.blocked_nodes must be empty.");
  }
  if (!levelsMatch(run.levels, planLevels)) {
    failures.push("daily codex DAG dry-run success summary run.levels must equal plan.levels.");
  }
}

function validateContractRunSuccessRun({ run, planLevels, planNodeIds, failures }) {
  if (run.final_status !== "contract_validated_only") {
    failures.push("daily codex DAG contract-run success summary run.final_status must be contract_validated_only.");
  }
  if (!sameOrderedStringArray(run.planned_nodes, planNodeIds)) {
    failures.push("daily codex DAG contract-run success summary run.planned_nodes must equal plan.nodes ids.");
  }
  if (!sameOrderedStringArray(run.contract_validated_nodes, planNodeIds)) {
    failures.push("daily codex DAG contract-run success summary run.contract_validated_nodes must equal plan.nodes ids.");
  }
  if (!sameOrderedStringArray(run.skipped_nodes, planNodeIds)) {
    failures.push("daily codex DAG contract-run success summary run.skipped_nodes must equal plan.nodes ids.");
  }
  if (!Array.isArray(run.blocked_nodes) || run.blocked_nodes.length !== 0) {
    failures.push("daily codex DAG contract-run success summary run.blocked_nodes must be empty.");
  }
  if (!levelsMatch(run.levels, planLevels)) {
    failures.push("daily codex DAG contract-run success summary run.levels must equal plan.levels.");
  }
}

function validateContractRunExpansionSemantics({ expansions, planNodes, failures }) {
  if (!Array.isArray(expansions) || !Array.isArray(planNodes)) return;
  const expected = planNodes
    .filter((node) => node.kind === "fanout" || node.kind === "barrier")
    .map((node) => ({ node_id: node.id, kind: node.kind }));
  const actual = expansions.map((item) => isPlainObject(item) ? { node_id: item.node_id, kind: item.kind } : item);
  if (actual.length !== expected.length || !actual.every((item, index) => item?.node_id === expected[index].node_id && item?.kind === expected[index].kind)) {
    failures.push("daily codex DAG contract-run success summary fanout_expansions must list fanout/barrier plan nodes as not_expanded in plan order.");
  }
}

function validatePlanDependencyLevels({ planNodes, levelByNodeId, failures }) {
  for (const node of planNodes) {
    if (!isPlainObject(node) || typeof node.id !== "string" || !Array.isArray(node.dependencies)) continue;
    const nodeLevel = levelByNodeId.get(node.id);
    if (!Number.isInteger(nodeLevel)) continue;
    for (const dependencyId of node.dependencies) {
      const dependencyLevel = levelByNodeId.get(dependencyId);
      if (!Number.isInteger(dependencyLevel)) {
        failures.push(`daily codex DAG dry-run success summary plan node ${node.id} dependency ${formatSummaryValue(dependencyId)} is missing from plan.levels.`);
        continue;
      }
      if (dependencyLevel >= nodeLevel) {
        failures.push(`daily codex DAG dry-run success summary plan node ${node.id} dependency ${formatSummaryValue(dependencyId)} must be in an earlier level.`);
      }
    }
  }
}

function validateNodeDependencies({ node, nodeById, failures }) {
  for (const dep of node.dependencies || []) {
    if (!nodeById.has(dep)) {
      failures.push(`config/daily-codex-dag.json: node ${node.id} depends on missing node ${dep}.`);
    }
    if (dep === node.id) {
      failures.push(`config/daily-codex-dag.json: node ${node.id} cannot depend on itself.`);
    }
  }
}

async function validateNodeRefsAndPaths({ rootDir, node, ajv, failures, checkedFiles }) {
  for (const [field, ref] of Object.entries(node.schemas || {})) {
    await validateSchemaRef({ rootDir, nodeId: node.id, field, ref, ajv, failures, checkedFiles });
  }
  await validateExistingRelativeFile({
    rootDir,
    relativePath: node.fixture,
    label: `node ${node.id}.fixture`,
    failures,
    checkedFiles
  });

  for (const artifact of [...(node.inputs || []), ...(node.outputs || [])]) {
    if (!isSafeRelativeTemplatePath(artifact.path)) {
      failures.push(`config/daily-codex-dag.json: node ${node.id} artifact path ${JSON.stringify(artifact.path)} must be a safe repo-relative template path.`);
    }
  }
  for (const artifact of node.outputs || []) {
    validateOutputOwnership({ node, artifactPath: artifact.path, failures });
  }
}

async function validateSchemaRef({ rootDir, nodeId, field, ref, ajv, failures, checkedFiles }) {
  const [schemaPath, fragment = ""] = String(ref || "").split("#");
  const schema = await readJsonFile({
    rootDir,
    relativePath: schemaPath,
    failures,
    checkedFiles,
    label: `node ${nodeId}.schemas.${field}`
  });
  if (!schema) return;
  if (fragment) {
    const target = resolveJsonPointer(schema, fragment);
    if (target === undefined) {
      failures.push(`config/daily-codex-dag.json: node ${nodeId}.schemas.${field} references missing schema fragment ${fragment} in ${schemaPath}.`);
      return;
    }
    try {
      createAjv().compile(target);
    } catch (error) {
      failures.push(`config/daily-codex-dag.json: node ${nodeId}.schemas.${field} failed to compile ${schemaPath}#${fragment}: ${error.message}`);
    }
    return;
  }
  try {
    createAjv().compile(schema);
  } catch (error) {
    failures.push(`config/daily-codex-dag.json: node ${nodeId}.schemas.${field} failed to compile ${schemaPath}: ${error.message}`);
  }
}

function validateOutputOwnership({ node, artifactPath, failures }) {
  const normalized = normalizePortablePath(artifactPath);
  if (!node.public_artifact && (normalized.startsWith("docs/") || normalized.startsWith("reports-data/"))) {
    failures.push(`config/daily-codex-dag.json: node ${node.id} has public_artifact false but writes ${artifactPath}.`);
  }
  if (node.public_artifact && !(normalized.startsWith("docs/") || normalized.startsWith("reports-data/"))) {
    failures.push(`config/daily-codex-dag.json: node ${node.id} has public_artifact true but output ${artifactPath} is not under docs/ or reports-data/.`);
  }

  const scope = node.owner_path_scope;
  if (scope === "internal_workdir" && !normalized.startsWith(".tmp/daily-codex-pipeline/")) {
    failures.push(`config/daily-codex-dag.json: node ${node.id} output ${artifactPath} is outside internal_workdir scope.`);
  }
  if (scope === "docs" && !normalized.startsWith("docs/")) {
    failures.push(`config/daily-codex-dag.json: node ${node.id} output ${artifactPath} is outside docs scope.`);
  }
  if (scope === "reports_data" && !normalized.startsWith("reports-data/")) {
    failures.push(`config/daily-codex-dag.json: node ${node.id} output ${artifactPath} is outside reports_data scope.`);
  }
  if (scope === "none" && (node.outputs || []).length > 0) {
    failures.push(`config/daily-codex-dag.json: node ${node.id} owner_path_scope none cannot declare outputs.`);
  }
}

function validateNodeExecutionPolicy({ node, resiliencePolicy, failures }) {
  const policyStageIds = new Set((resiliencePolicy?.stages || []).map((stage) => stage?.id).filter(Boolean));
  const policyMode = node.failure_policy?.mode;
  const readiness = node.execution_contract?.readiness;
  const hasNodeExecutionSpec = Object.prototype.hasOwnProperty.call(node.execution_contract || {}, "node_execution_spec");
  validateNodeExecutionSpecReferences({ node, failures });
  if (node.resilience_policy_ref && !policyStageIds.has(node.resilience_policy_ref)) {
    failures.push(`config/daily-codex-dag.json: node ${node.id} references missing resilience policy stage ${node.resilience_policy_ref}.`);
  }
  if (node.execution_status === "planned" && readiness !== "planned_only") {
    failures.push(`config/daily-codex-dag.json: planned node ${node.id} must use execution_contract.readiness planned_only.`);
  }
  if (node.execution_status === "mapped") {
    if (readiness !== "legacy_mapped") {
      failures.push(`config/daily-codex-dag.json: mapped node ${node.id} must use execution_contract.readiness legacy_mapped; legacy mapped is not node-level execution.`);
    }
    if (!node.runner_stage_ref) {
      failures.push(`config/daily-codex-dag.json: mapped node ${node.id} requires runner_stage_ref.`);
    }
    if (policyMode !== "resilience_policy_ref") {
      failures.push(`config/daily-codex-dag.json: mapped node ${node.id} must use failure_policy.mode resilience_policy_ref.`);
    }
  }
  if (readiness === "node_executable") {
    failures.push(`config/daily-codex-dag.json: node ${node.id} execution_contract.readiness node_executable is reserved until executor migration enables standalone node execution.`);
  } else if (hasNodeExecutionSpec) {
    failures.push(`config/daily-codex-dag.json: node ${node.id} execution_contract.node_execution_spec is only allowed for future node_executable nodes.`);
  }
  if (readiness === "legacy_mapped" && !node.runner_stage_ref) {
    failures.push(`config/daily-codex-dag.json: node ${node.id} legacy_mapped readiness requires runner_stage_ref because legacy mapped is not node-level execution.`);
  }
  if (policyMode === "resilience_policy_ref") {
    if (!node.resilience_policy_ref) {
      failures.push(`config/daily-codex-dag.json: node ${node.id} uses resilience_policy_ref mode without resilience_policy_ref.`);
    }
  }
  if (policyMode === "planned" && !node.failure_policy?.summary) {
    failures.push(`config/daily-codex-dag.json: planned node ${node.id} requires failure_policy.summary.`);
  }
}

function validateNodeExecutionSpecReferences({ node, failures }) {
  const spec = node.execution_contract?.node_execution_spec;
  if (!spec) return;

  validateNodeExecutionSpecPreflight({ node, spec, failures });

  const inputPaths = new Set((node.inputs || []).map((artifact) => artifact.path));
  const outputPaths = new Set((node.outputs || []).map((artifact) => artifact.path));
  for (const binding of spec.inputs || []) {
    if (!inputPaths.has(binding.artifact_path)) {
      failures.push(`config/daily-codex-dag.json: node ${node.id} node_execution_spec.inputs references undeclared input artifact ${binding.artifact_path}.`);
    }
  }
  for (const binding of spec.outputs || []) {
    if (!outputPaths.has(binding.artifact_path)) {
      failures.push(`config/daily-codex-dag.json: node ${node.id} node_execution_spec.outputs references undeclared output artifact ${binding.artifact_path}.`);
    }
  }
}

function validateNodeExecutionSpecPreflight({ node, spec, failures }) {
  if (!isSafeExecutionRelativePath(spec.cwd, { allowDot: true })) {
    failures.push(`config/daily-codex-dag.json: node ${node.id} node_execution_spec.cwd must be "." or a repo-relative path without absolute paths, drive letters, URLs, parent traversal, empty segments, backslashes, or colon-containing path segments.`);
  }
  if (spec.invocation?.kind === "codex_cli" && !isSafeExecutionRelativePath(spec.invocation.prompt_template)) {
    failures.push(`config/daily-codex-dag.json: node ${node.id} node_execution_spec.invocation.prompt_template must be a repo-relative path without absolute paths, drive letters, URLs, parent traversal, empty segments, backslashes, or colon-containing path segments.`);
  }
}

function validateFanoutBarrier({ node, nodeById, failures }) {
  if (node.kind === "fanout") {
    if (!node.fanout) {
      failures.push(`config/daily-codex-dag.json: fanout node ${node.id} requires fanout config.`);
    } else {
      if (!nodeById.has(node.fanout.from)) {
        failures.push(`config/daily-codex-dag.json: fanout node ${node.id} references missing source ${node.fanout.from}.`);
      }
      if (!(node.dependencies || []).includes(node.fanout.from)) {
        failures.push(`config/daily-codex-dag.json: fanout node ${node.id} must depend on fanout.from ${node.fanout.from}.`);
      }
    }
  } else if (node.fanout) {
    failures.push(`config/daily-codex-dag.json: non-fanout node ${node.id} cannot declare fanout config.`);
  }

  if (node.kind === "barrier") {
    if (!node.barrier) {
      failures.push(`config/daily-codex-dag.json: barrier node ${node.id} requires barrier config.`);
    } else {
      for (const waitFor of node.barrier.wait_for || []) {
        if (!nodeById.has(waitFor)) {
          failures.push(`config/daily-codex-dag.json: barrier node ${node.id} waits for missing node ${waitFor}.`);
        }
        if (!(node.dependencies || []).includes(waitFor)) {
          failures.push(`config/daily-codex-dag.json: barrier node ${node.id} must depend on wait_for node ${waitFor}.`);
        }
      }
    }
  } else if (node.barrier) {
    failures.push(`config/daily-codex-dag.json: non-barrier node ${node.id} cannot declare barrier config.`);
  }
}

function validateAcyclicGraph({ nodes, nodeById, failures }) {
  const state = new Map();
  const stack = [];

  const visit = (nodeId) => {
    const currentState = state.get(nodeId);
    if (currentState === "done") return;
    if (currentState === "visiting") {
      const cycleStart = stack.indexOf(nodeId);
      const cycle = [...stack.slice(cycleStart), nodeId].join(" -> ");
      failures.push(`config/daily-codex-dag.json: dependency cycle detected: ${cycle}.`);
      return;
    }
    const node = nodeById.get(nodeId);
    if (!node) return;
    state.set(nodeId, "visiting");
    stack.push(nodeId);
    for (const dep of node.dependencies || []) {
      visit(dep);
    }
    stack.pop();
    state.set(nodeId, "done");
  };

  for (const node of nodes) {
    if (node?.id) visit(node.id);
  }
}

function validatePublishCleanupGate({ nodeById, failures }) {
  const publish = nodeById.get("publish-cleanup");
  if (!publish) return;
  const reachable = transitiveDependencies("publish-cleanup", nodeById);
  for (const required of ["build-cards-page", "quality-audit"]) {
    if (!reachable.has(required)) {
      failures.push(`config/daily-codex-dag.json: publish-cleanup must transitively depend on ${required}.`);
    }
  }
}

function validateInputLineage({ nodes, nodeById, failures }) {
  for (const node of nodes) {
    if (!node?.id) continue;
    const inputs = node.inputs || [];
    if (inputs.length === 0) continue;
    const ancestors = transitiveDependencies(node.id, nodeById);
    if (ancestors.size === 0) {
      failures.push(`config/daily-codex-dag.json: node ${node.id} declares inputs but has no dependency outputs to read from.`);
      continue;
    }
    const upstreamOutputs = new Set();
    for (const ancestorId of ancestors) {
      const ancestor = nodeById.get(ancestorId);
      for (const output of ancestor?.outputs || []) {
        upstreamOutputs.add(normalizePortablePath(output.path));
      }
    }
    for (const input of inputs) {
      const inputPath = normalizePortablePath(input.path);
      if (!upstreamOutputs.has(inputPath)) {
        failures.push(`config/daily-codex-dag.json: node ${node.id} input ${input.path} is not produced by any direct or transitive dependency output.`);
      }
    }
  }
}

function transitiveDependencies(nodeId, nodeById, seen = new Set()) {
  const node = nodeById.get(nodeId);
  if (!node) return seen;
  for (const dep of node.dependencies || []) {
    if (seen.has(dep)) continue;
    seen.add(dep);
    transitiveDependencies(dep, nodeById, seen);
  }
  return seen;
}

function validateAgainstDagSchema({ manifest, schema, ajv, failures }) {
  try {
    const validate = ajv.compile(schema);
    if (!validate(manifest)) {
      for (const error of validate.errors || []) {
        failures.push(`config/daily-codex-dag.json: ${error.instancePath || "/"} ${error.message}`);
      }
    }
  } catch (error) {
    failures.push(`schemas/daily-codex-dag.schema.json: ${error.message}`);
  }
}

function resolveJsonPointer(value, pointer) {
  if (!pointer) return value;
  if (!pointer.startsWith("/")) return undefined;
  return pointer
    .slice(1)
    .split("/")
    .reduce((current, rawSegment) => {
      if (current === undefined || current === null) return undefined;
      const segment = rawSegment.replace(/~1/g, "/").replace(/~0/g, "~");
      if (!Object.hasOwn(current, segment)) return undefined;
      return current[segment];
    }, value);
}

async function validateExistingRelativeFile({ rootDir, relativePath, label, failures, checkedFiles }) {
  if (!isSafeRelativeTemplatePath(relativePath)) {
    failures.push(`config/daily-codex-dag.json: ${label} must be a safe repo-relative path.`);
    return false;
  }
  try {
    await fs.access(path.resolve(rootDir, relativePath));
    checkedFiles.push(toPortablePath(path.resolve(rootDir, relativePath)));
    return true;
  } catch (error) {
    failures.push(`config/daily-codex-dag.json: ${label} missing ${relativePath}: ${error.message}`);
    return false;
  }
}

async function readJsonFile({ rootDir, relativePath, failures, checkedFiles, label = relativePath }) {
  if (!isSafeRelativeTemplatePath(relativePath)) {
    failures.push(`config/daily-codex-dag.json: ${label} must be a safe repo-relative path.`);
    return null;
  }
  const filePath = path.resolve(rootDir, relativePath);
  try {
    const value = JSON.parse(await fs.readFile(filePath, "utf8"));
    checkedFiles.push(toPortablePath(filePath));
    return value;
  } catch (error) {
    failures.push(`config/daily-codex-dag.json: ${label} failed to read JSON ${relativePath}: ${error.message}`);
    return null;
  }
}

function createAjv() {
  const ajv = new Ajv({ allErrors: true, strict: false });
  for (const format of ["date", "date-time", "uri", "uri-reference", "email"]) {
    ajv.addFormat(format, true);
  }
  return ajv;
}

function isSafeRelativeTemplatePath(value) {
  const normalized = normalizePortablePath(value);
  if (!normalized || normalized.startsWith("/") || /^[a-zA-Z]:/.test(normalized)) return false;
  if (normalized.includes("\\")) return false;
  return normalized.split("/").every((part) => part && part !== "." && part !== "..");
}

function isSafeExecutionRelativePath(value, options = {}) {
  if (!nonEmptyString(value)) return false;
  if (value.includes("\\")) return false;
  if (options.allowDot && value === ".") return true;
  if (value === "." || value.startsWith("/") || /^[a-zA-Z]:/.test(value)) return false;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) return false;
  return value.split("/").every((part) => part && part !== "." && part !== ".." && !part.includes(":"));
}

function normalizePortablePath(value) {
  return String(value || "").replace(/\\/g, "/");
}

function requiredReportDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) {
    throw new Error("daily codex DAG dry run requires --date YYYY-MM-DD");
  }
  return String(value);
}

function toIsoTimestamp(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("daily codex DAG dry run requires a valid timestamp");
  }
  return date.toISOString();
}

function toNullableIsoTimestamp(value) {
  if (value === null || value === undefined) return null;
  return toIsoTimestamp(value);
}

function durationBetweenTimestamps(startedAt, finishedAt) {
  if (!isCanonicalIsoTimestamp(startedAt) || !isCanonicalIsoTimestamp(finishedAt)) return null;
  return Date.parse(finishedAt) - Date.parse(startedAt);
}

function defaultNodeExecutionId({ runId, nodeId, resultScope, options }) {
  const fanoutKey = options.fanoutKey
    || options.fanout_key
    || options.itemId
    || options.item_id
    || options.fanout?.fanout_key
    || options.fanout?.item_id
    || "";
  const suffix = resultScope === "fanout_item" && fanoutKey ? `:${fanoutKey}` : "";
  return `${runId}:${nodeId || "unknown-node"}:${resultScope}${suffix}`;
}

function copyDeclaredArtifacts(values) {
  if (!Array.isArray(values)) return values;
  return values.map((artifact) => isPlainObject(artifact)
    ? {
        path: artifact.path,
        required: artifact.required
      }
    : artifact);
}

function copyResolvedArtifacts(values) {
  if (!Array.isArray(values)) return values;
  return values.map((artifact) => isPlainObject(artifact)
    ? {
        path: artifact.path,
        required: artifact.required,
        exists: artifact.exists,
        schema_valid: artifact.schema_valid,
        bytes: artifact.bytes ?? null,
        sha256: artifact.sha256 ?? null
      }
    : artifact);
}

function copyDependencyResults(values) {
  if (!Array.isArray(values)) return values;
  return values.map((dependency) => isPlainObject(dependency)
    ? {
        node_id: dependency.node_id,
        execution_id: dependency.execution_id,
        status: dependency.status,
        required: dependency.required,
        downstream_disposition: dependency.downstream_disposition
      }
    : dependency);
}

function copyIssueObjects(values) {
  if (!Array.isArray(values)) return values;
  return values.map((issue) => {
    if (isPlainObject(issue)) {
      return {
        code: issue.code,
        message: issue.message,
        source: issue.source,
        retryable: issue.retryable
      };
    }
    return {
      code: "message",
      message: String(issue || ""),
      source: "unknown",
      retryable: false
    };
  });
}

function copyFanoutResult(value) {
  if (value === null || value === undefined) return null;
  if (!isPlainObject(value)) return value;
  return {
    item_id: value.item_id,
    fanout_key: value.fanout_key
  };
}

function copyBarrierResult(value) {
  if (value === null || value === undefined) return null;
  if (!isPlainObject(value)) return value;
  return {
    expected_execution_ids: Array.isArray(value.expected_execution_ids) ? [...value.expected_execution_ids] : value.expected_execution_ids,
    observed_execution_ids: Array.isArray(value.observed_execution_ids) ? [...value.observed_execution_ids] : value.observed_execution_ids,
    missing_execution_ids: Array.isArray(value.missing_execution_ids) ? [...value.missing_execution_ids] : value.missing_execution_ids
  };
}

function copyNodeResultAudit(value) {
  return {
    parallel_group: typeof value.parallel_group === "string" ? value.parallel_group : "",
    resilience_policy_ref: typeof value.resilience_policy_ref === "string" ? value.resilience_policy_ref : "",
    owner_path_scope: typeof value.owner_path_scope === "string" ? value.owner_path_scope : "internal_workdir",
    public_artifact: typeof value.public_artifact === "boolean" ? value.public_artifact : false,
    validator_version: typeof value.validator_version === "string" ? value.validator_version : NODE_RESULT_VALIDATOR_VERSION
  };
}

function isStrictIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isCanonicalIsoTimestamp(value) {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

function sameOrderedStringArray(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  if (left.length !== right.length) return false;
  return left.every((value, index) => typeof value === "string" && value === right[index]);
}

function sameArtifactArray(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  if (left.length !== right.length) return false;
  return left.every((artifact, index) => {
    const expected = right[index];
    return isPlainObject(artifact)
      && isPlainObject(expected)
      && artifact.path === expected.path
      && artifact.required === expected.required;
  });
}

function levelsMatch(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  if (left.length !== right.length) return false;
  return left.every((level, index) => {
    const expected = right[index];
    return isPlainObject(level)
      && isPlainObject(expected)
      && level.level === expected.level
      && sameOrderedStringArray(level.node_ids, expected.node_ids);
  });
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateExactKeys({ value, allowed, label, failures }) {
  if (!isPlainObject(value)) return;
  const allowedSet = new Set(allowed);
  for (const key of allowed) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      failures.push(`${label} missing required field ${key}.`);
    }
  }
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) {
      failures.push(`${label} must not include additional field ${key}.`);
    }
  }
}

function validateMessageArray(values, label, failures) {
  if (!Array.isArray(values)) return;
  for (const value of values) {
    if (!nonEmptyString(value)) {
      failures.push(`${label} entries must be non-empty strings.`);
    }
  }
}

function validateNodeIdArray(values, label, failures, options = {}) {
  if (!Array.isArray(values)) {
    failures.push(`${label} must be an array.`);
    return;
  }
  if (options.minItems && values.length < options.minItems) {
    failures.push(`${label} must contain at least ${options.minItems} item.`);
  }
  const seen = new Set();
  for (const value of values) {
    if (!isNodeId(value)) {
      failures.push(`${label} entries must be node ids.`);
      continue;
    }
    if (seen.has(value)) {
      failures.push(`${label} entries must be unique.`);
    }
    seen.add(value);
  }
}

function validateStringArray(values, label, failures) {
  if (!Array.isArray(values)) {
    failures.push(`${label} must be an array.`);
    return;
  }
  const seen = new Set();
  for (const value of values) {
    if (!nonEmptyString(value)) {
      failures.push(`${label} entries must be non-empty strings.`);
      continue;
    }
    if (seen.has(value)) {
      failures.push(`${label} entries must be unique.`);
    }
    seen.add(value);
  }
}

function nonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function isNodeId(value) {
  return typeof value === "string" && /^[a-z][a-z0-9-]*(?::[a-z0-9-]+)?$/.test(value);
}

function isStableIdentifier(value) {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value);
}

function validateNullableTimestamp(value, label, failures) {
  if (value !== null && !isCanonicalIsoTimestamp(value)) {
    failures.push(`${label} must be null or a canonical UTC Date#toISOString() string.`);
  }
}

function validateStableIdentifierArray(values, label, failures) {
  if (!Array.isArray(values)) {
    failures.push(`${label} must be an array.`);
    return;
  }
  const seen = new Set();
  for (const value of values) {
    if (!isStableIdentifier(value)) {
      failures.push(`${label} entries must be stable identifiers.`);
      continue;
    }
    if (seen.has(value)) {
      failures.push(`${label} entries must be unique.`);
    }
    seen.add(value);
  }
}

function formatSummaryValue(value) {
  if (typeof value === "bigint") return `${value.toString()}n`;
  if (typeof value === "symbol") return value.toString();
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

function toPortablePath(filePath) {
  return filePath.replace(/\\/g, "/");
}
