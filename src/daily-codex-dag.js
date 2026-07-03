import fs from "node:fs/promises";
import path from "node:path";
import Ajv from "ajv/dist/2020.js";

const DEFAULT_DAG_PATH = path.join("config", "daily-codex-dag.json");
const DAG_SCHEMA_PATH = path.join("schemas", "daily-codex-dag.schema.json");

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

function copyLevel(level) {
  return {
    level: level.level,
    node_ids: [...level.node_ids]
  };
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

function validateNextActionShape(nextAction, failures) {
  const label = "daily codex DAG dry-run success summary next_action";
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
  if (node.resilience_policy_ref && !policyStageIds.has(node.resilience_policy_ref)) {
    failures.push(`config/daily-codex-dag.json: node ${node.id} references missing resilience policy stage ${node.resilience_policy_ref}.`);
  }
  if (node.execution_status === "mapped") {
    if (!node.runner_stage_ref) {
      failures.push(`config/daily-codex-dag.json: mapped node ${node.id} requires runner_stage_ref.`);
    }
    if (policyMode !== "resilience_policy_ref") {
      failures.push(`config/daily-codex-dag.json: mapped node ${node.id} must use failure_policy.mode resilience_policy_ref.`);
    }
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
