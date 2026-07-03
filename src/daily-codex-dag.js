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

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

function toPortablePath(filePath) {
  return filePath.replace(/\\/g, "/");
}
