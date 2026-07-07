import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
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
const EXECUTABLE_NODE_MVP_MODE = "daily_codex_dag_executable_node_mvp";
const REAL_NODE_ADAPTER_MVP_MODE = "daily_codex_dag_real_node_adapter_mvp";
const TWO_NODE_FIXTURE_MVP_MODE = "daily_codex_dag_two_node_fixture_mvp";
const SOURCE_WATCH_COLLECT_MVP_MODE = "daily_codex_dag_source_watch_collect_mvp";
const SOURCE_WATCH_DOWNSTREAM_MVP_MODE = "daily_codex_dag_source_watch_downstream_mvp";
const SYNTHETIC_EXECUTABLE_NODE_ID = "synthetic-command-node";
const SYNTHETIC_EXECUTABLE_SCRIPT = "scripts/run-daily-codex-dag.mjs";
const SYNTHETIC_EXECUTABLE_INPUT_ARTIFACT = ".tmp/daily-codex-pipeline/executable-node-mvp/{report_date}/input.json";
const SYNTHETIC_EXECUTABLE_OUTPUT_ARTIFACT = ".tmp/daily-codex-pipeline/executable-node-mvp/{report_date}/dry-run-summary.json";
const SOURCE_WATCH_COLLECT_NODE_ID = "fetch-source-health";
const SOURCE_WATCH_COLLECT_SCRIPT = "scripts/run-source-watch-collect-fixture.mjs";
const SOURCE_WATCH_COLLECT_OUTPUT_ARTIFACT = ".tmp/daily-codex-pipeline/{report_date}/artifacts/source-health.json";
const SOURCE_WATCH_DOWNSTREAM_NODE_ID = "parse-extract";
const SOURCE_WATCH_DOWNSTREAM_SCRIPT = "scripts/run-source-watch-downstream-fixture.mjs";
const SOURCE_WATCH_DOWNSTREAM_OUTPUT_ARTIFACT = ".tmp/daily-codex-pipeline/{report_date}/artifacts/extracted-candidates.json";
const SOURCE_WATCH_NORMALIZE_MVP_MODE = "daily_codex_dag_source_watch_normalize_mvp";
const SOURCE_WATCH_NORMALIZE_NODE_ID = "normalize-canonicalize";
const SOURCE_WATCH_NORMALIZE_SCRIPT = "scripts/run-source-watch-normalize-fixture.mjs";
const SOURCE_WATCH_NORMALIZE_OUTPUT_ARTIFACT = ".tmp/daily-codex-pipeline/{report_date}/artifacts/canonical-candidates.json";
const SOURCE_WATCH_QUALITY_MVP_MODE = "daily_codex_dag_source_watch_quality_mvp";
const SOURCE_WATCH_QUALITY_NODE_ID = "freshness-history-check";
const SOURCE_WATCH_QUALITY_SCRIPT = "scripts/run-source-watch-quality-fixture.mjs";
const SOURCE_WATCH_QUALITY_OUTPUT_ARTIFACT = ".tmp/daily-codex-pipeline/{report_date}/artifacts/quality-candidates.json";
const SOURCE_WATCH_QUALITY_HISTORY = "tests/fixtures/source-watch/quality-history.json";
const SOURCE_WATCH_ADMIT_MVP_MODE = "daily_codex_dag_source_watch_admit_mvp";
const SOURCE_WATCH_ADMIT_NODE_ID = "admit-reject";
const SOURCE_WATCH_ADMIT_SCRIPT = "scripts/run-source-watch-admit-fixture.mjs";
const SOURCE_WATCH_ADMIT_OUTPUT_ARTIFACT = ".tmp/daily-codex-pipeline/{report_date}/artifacts/admitted-candidates.json";
const SOURCE_WATCH_FIXTURE_CONFIG = "tests/fixtures/source-watch/source-watchlist.json";
const SOURCE_WATCH_FIXTURE_DIR = "tests/fixtures/source-watch";
const REAL_NODE_ADAPTER_TARGET_NODE_ID = "score";
const REAL_NODE_ADAPTER_DEPENDENCY_NODE_ID = "classify-tag-entity";
const REAL_NODE_ADAPTER_SCRIPT = "scripts/replay-daily-codex-dag-node-fixture.mjs";
const TWO_NODE_FIXTURE_CLASSIFY_NODE_ID = "classify-tag-entity";
const TWO_NODE_FIXTURE_SCORE_NODE_ID = "score";
const TWO_NODE_FIXTURE_NODE_IDS = [TWO_NODE_FIXTURE_CLASSIFY_NODE_ID, TWO_NODE_FIXTURE_SCORE_NODE_ID];
const TWO_NODE_FIXTURE_CANONICAL_ARTIFACT = ".tmp/daily-codex-pipeline/{report_date}/artifacts/canonical-candidates.json";
const REAL_NODE_ADAPTER_INPUT_ARTIFACT = ".tmp/daily-codex-pipeline/{report_date}/artifacts/classified-candidates.json";
const REAL_NODE_ADAPTER_OUTPUT_ARTIFACT = ".tmp/daily-codex-pipeline/{report_date}/artifacts/scored-candidates.json";
const REAL_NODE_ADAPTER_RUNNER_STAGE_REF = "admit";
const REAL_NODE_ADAPTER_PARALLEL_GROUP = "item-lanes";
const REAL_NODE_ADAPTER_OWNER_PATH_SCOPE = "internal_workdir";
const REAL_NODE_ADAPTER_PUBLIC_ARTIFACT = false;

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

export function resolveDailyCodexDagCommandRuntimePlan(options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const node = options.node || {};
  const spec = selectExplicitNodeExecutionSpec({ options, node });
  const nodeId = nonEmptyString(node.id) ? node.id : "<unknown>";
  const failures = [];
  const label = `daily codex DAG command runtime plan node ${nodeId}`;

  if (!isPlainObject(spec)) {
    failures.push(`${label} spec must be an object.`);
    return { ok: false, failures, plan: null };
  }
  if (spec.executor !== "command") {
    failures.push(`${label} executor must be command.`);
  }
  if (spec.invocation?.kind !== "command") {
    failures.push(`${label} invocation.kind must be command.`);
    return { ok: false, failures, plan: null };
  }

  validateExecutionStringArray({
    values: spec.invocation.argv,
    label: `${label} invocation.argv`,
    failures,
    requireNonEmptyArray: true
  });
  const commandPolicy = validateCommandInvocationPolicyShape({
    argv: spec.invocation.argv,
    failures,
    label: `${label} invocation.argv`
  });

  if (!isSafeExecutionRelativePath(spec.cwd, { allowDot: true })) {
    failures.push(`${label} cwd must be "." or a safe repo-relative path.`);
  }

  const nodeExecutablePath = Object.prototype.hasOwnProperty.call(options, "nodeExecutablePath")
    ? options.nodeExecutablePath
    : process.execPath;
  if (!nonEmptyString(nodeExecutablePath) || !path.isAbsolute(nodeExecutablePath)) {
    failures.push(`${label} nodeExecutablePath must be an absolute path.`);
  }

  const cwdRelativePath = spec.cwd === "." ? "." : spec.cwd;
  const resolvedCwd = isSafeExecutionRelativePath(cwdRelativePath, { allowDot: true })
    ? path.resolve(rootDir, cwdRelativePath)
    : null;
  if (resolvedCwd && !isPathWithinOrEqual({ parent: rootDir, child: resolvedCwd })) {
    failures.push(`${label} cwd must resolve inside the repository root.`);
  }

  const scriptRelativePath = commandPolicy.scriptPath;
  const resolvedScriptPath = scriptRelativePath && isSafeExecutionRelativePath(scriptRelativePath)
    ? path.resolve(rootDir, scriptRelativePath)
    : null;
  if (resolvedScriptPath && !isPathWithinOrEqual({ parent: rootDir, child: resolvedScriptPath })) {
    failures.push(`${label} script_path must resolve inside the repository root.`);
  }

  if (failures.length > 0) {
    return { ok: false, failures, plan: null };
  }

  const argvTail = spec.invocation.argv.slice(2);
  return {
    ok: true,
    failures,
    plan: {
      runner: "node",
      command: nodeExecutablePath,
      args: [resolvedScriptPath, ...argvTail],
      cwd: resolvedCwd,
      shell: false,
      script_path: resolvedScriptPath,
      argv_tail: argvTail
    }
  };
}

export function resolveDailyCodexDagCodexRuntimePlan(options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const node = options.node || {};
  const spec = selectExplicitNodeExecutionSpec({ options, node });
  const nodeId = nonEmptyString(node.id) ? node.id : "<unknown>";
  const failures = [];
  const label = `daily codex DAG Codex runtime plan node ${nodeId}`;

  if (!isPlainObject(spec)) {
    failures.push(`${label} spec must be an object.`);
    return { ok: false, failures, plan: null };
  }
  if (spec.executor !== "codex_cli") {
    failures.push(`${label} executor must be codex_cli.`);
  }
  if (spec.invocation?.kind !== "codex_cli") {
    failures.push(`${label} invocation.kind must be codex_cli.`);
    return { ok: false, failures, plan: null };
  }

  const codexPolicy = validateCodexCliInvocationPolicyShape({
    invocation: spec.invocation,
    failures,
    label: `${label} invocation`
  });

  if (!isSafeExecutionRelativePath(spec.cwd, { allowDot: true })) {
    failures.push(`${label} cwd must be "." or a safe repo-relative path.`);
  }

  const codexExecutablePath = Object.prototype.hasOwnProperty.call(options, "codexExecutablePath")
    ? options.codexExecutablePath
    : null;
  if (!nonEmptyString(codexExecutablePath) || !path.isAbsolute(codexExecutablePath)) {
    failures.push(`${label} codexExecutablePath must be an absolute path.`);
  }

  const cwdRelativePath = spec.cwd === "." ? "." : spec.cwd;
  const resolvedCwd = isSafeExecutionRelativePath(cwdRelativePath, { allowDot: true })
    ? path.resolve(rootDir, cwdRelativePath)
    : null;
  if (resolvedCwd && !isPathWithinOrEqual({ parent: rootDir, child: resolvedCwd })) {
    failures.push(`${label} cwd must resolve inside the repository root.`);
  }

  const promptTemplate = codexPolicy.promptTemplate;
  const promptTemplatePath = promptTemplate && isSafeExecutionRelativePath(promptTemplate)
    ? path.resolve(rootDir, promptTemplate)
    : null;
  if (promptTemplatePath && !isPathWithinOrEqual({ parent: rootDir, child: promptTemplatePath })) {
    failures.push(`${label} prompt_template must resolve inside the repository root.`);
  }

  if (failures.length > 0) {
    return { ok: false, failures, plan: null };
  }

  const invocationArgs = [...spec.invocation.args];
  return {
    ok: true,
    failures,
    plan: {
      runner: "codex_cli",
      command: codexExecutablePath,
      codex_args: [...invocationArgs],
      invocation_args: invocationArgs,
      cwd: resolvedCwd,
      shell: false,
      prompt_template_path: promptTemplatePath,
      prompt_template: promptTemplate
    }
  };
}

export function resolveDailyCodexDagNodeRuntimePlan(options = {}) {
  const node = options.node || {};
  const spec = selectExplicitNodeExecutionSpec({ options, node });
  const nodeId = nonEmptyString(node.id) ? node.id : "<unknown>";
  const label = `daily codex DAG node runtime plan node ${nodeId}`;
  const failures = [];

  if (node.execution_contract?.readiness !== "node_executable") {
    failures.push(`${label} execution_contract.readiness must be node_executable.`);
  }
  if (!isPlainObject(spec)) {
    failures.push(`${label} spec must be an object.`);
    return { ok: false, failures, plan: null };
  }

  let runtimeResult = null;
  if (spec.executor === "command") {
    runtimeResult = resolveDailyCodexDagCommandRuntimePlan({ ...options, node, spec });
  } else if (spec.executor === "codex_cli") {
    runtimeResult = resolveDailyCodexDagCodexRuntimePlan({ ...options, node, spec });
  } else {
    failures.push(`${label} executor must be command or codex_cli.`);
  }

  if (runtimeResult && !runtimeResult.ok) {
    failures.push(...runtimeResult.failures);
  }
  if (failures.length > 0) {
    return { ok: false, failures, plan: null };
  }

  return {
    ok: true,
    failures,
    plan: {
      node_id: nodeId,
      executor: spec.executor,
      runtime_plan: runtimeResult.plan
    }
  };
}

export async function executeDailyCodexDagCommandNode(options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const node = options.node || {};
  const reportDate = requiredReportDate(options.reportDate || options.report_date || options.date);
  const runId = options.runId || options.run_id || `daily-codex-dag:${reportDate}:command-node`;
  const nodeId = nonEmptyString(node.id) ? node.id : "<unknown>";
  const planResult = resolveDailyCodexDagNodeRuntimePlan({ ...options, rootDir, node });

  if (!planResult.ok) {
    return {
      ok: false,
      failures: planResult.failures,
      result: null,
      runtime_plan: null
    };
  }
  if (planResult.plan.executor !== "command") {
    return {
      ok: false,
      failures: [`daily codex DAG command node executor node ${nodeId} executor must be command.`],
      result: null,
      runtime_plan: planResult.plan.runtime_plan
    };
  }

  const runtimePlan = planResult.plan.runtime_plan;
  const startedAt = toIsoTimestamp(options.startedAt ?? options.started_at ?? new Date());
  const executeCommand = typeof options.executeCommand === "function"
    ? options.executeCommand
    : executeCommandRuntimePlan;
  let executionOutcome;
  try {
    executionOutcome = normalizeCommandExecutionOutcome(await executeCommand({
      command: runtimePlan.command,
      args: [...runtimePlan.args],
      cwd: runtimePlan.cwd,
      shell: runtimePlan.shell,
      timeoutMs: commandNodeTimeoutMs(options),
      runtime_plan: { ...runtimePlan, args: [...runtimePlan.args], argv_tail: [...runtimePlan.argv_tail] },
      node
    }));
  } catch (error) {
    executionOutcome = normalizeCommandExecutionError(error);
  }
  const finishedAt = toIsoTimestamp(options.finishedAt ?? options.finished_at ?? new Date());
  const resolvedInputs = hasOwnOption(options, "resolvedInputs")
    ? options.resolvedInputs
    : hasOwnOption(options, "resolved_inputs")
      ? options.resolved_inputs
      : await resolveDeclaredExecutionArtifacts({ rootDir, reportDate, artifacts: node.inputs || [] });
  const resolvedOutputs = hasOwnOption(options, "resolvedOutputs")
    ? options.resolvedOutputs
    : hasOwnOption(options, "resolved_outputs")
      ? options.resolved_outputs
      : await resolveDeclaredExecutionArtifacts({ rootDir, reportDate, artifacts: node.outputs || [] });
  const executionSucceeded = executionOutcome.exit_code === 0 && !executionOutcome.error_message;
  const resultIssues = executionSucceeded
    ? commandArtifactIssues({ nodeId, declaredInputs: node.inputs || [], declaredOutputs: node.outputs || [], resolvedInputs, resolvedOutputs })
    : [commandExecutionIssue({ nodeId, executionOutcome })];
  const nodeSucceeded = executionSucceeded && resultIssues.length === 0;
  const result = createDailyCodexDagNodeResult({
    reportDate,
    runId,
    manifestName: options.manifestName || options.manifest_name || "daily-codex-dag-contract",
    manifestSchemaVersion: options.manifestSchemaVersion || options.manifest_schema_version || 1,
    nodeId,
    nodeKind: node.kind || "command",
    runnerStageRef: node.runner_stage_ref || "",
    resultScope: "node",
    status: nodeSucceeded ? "success" : "failure",
    downstreamDisposition: nodeSucceeded ? "continue" : "block",
    startedAt,
    finishedAt,
    attemptsStarted: 1,
    maxAttempts: 1,
    attemptsExhausted: !nodeSucceeded,
    dependencyResults: options.dependencyResults || options.dependency_results || [],
    declaredInputs: node.inputs || [],
    declaredOutputs: node.outputs || [],
    resolvedInputs,
    resolvedOutputs,
    failures: resultIssues,
    warnings: [],
    audit: {
      parallel_group: node.parallel_group || "",
      resilience_policy_ref: options.resiliencePolicyRef || options.resilience_policy_ref || "",
      owner_path_scope: node.owner_path_scope || "internal_workdir",
      public_artifact: node.public_artifact === true,
      validator_version: NODE_RESULT_VALIDATOR_VERSION
    }
  });
  const validation = validateDailyCodexDagNodeResult(result);
  const failures = [
    ...resultIssues.map((issue) => issue.message),
    ...validation.failures
  ];

  return {
    ok: nodeSucceeded && validation.ok,
    failures,
    result,
    runtime_plan: runtimePlan
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

export async function createDailyCodexDagExecutableNodeMvp(options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const reportDate = requiredReportDate(options.reportDate || options.date);
  const generatedAt = toIsoTimestamp(options.now || new Date());
  const runId = options.runId || options.run_id || `daily-codex-dag:${reportDate}:executable-node-mvp`;
  const manifest = createSyntheticExecutableNodeManifest({ reportDate });
  const executableNode = manifest.nodes[0];
  const plan = projectDailyCodexDagPlan(manifest);
  const validation = {
    ok: true,
    failures: [],
    warnings: [],
    node_ids: [SYNTHETIC_EXECUTABLE_NODE_ID],
    checked_files: []
  };

  await prepareSyntheticExecutableArtifacts({ rootDir, reportDate });

  const execution = await executeDailyCodexDagCommandNode({
    rootDir,
    reportDate,
    runId,
    manifestName: manifest.name,
    manifestSchemaVersion: manifest.schema_version,
    node: executableNode,
    nodeExecutablePath: options.nodeExecutablePath || options.node_executable_path || process.execPath,
    executeCommand: options.executeCommand,
    startedAt: options.startedAt ?? options.started_at,
    finishedAt: options.finishedAt ?? options.finished_at,
    timeoutSeconds: options.timeoutSeconds ?? options.timeout_seconds
  });
  const nodeResults = execution.result ? [execution.result] : [];
  const nodeResultValidation = validateExecutableNodeMvpNodeResults({
    plan,
    reportDate,
    runId,
    nodeResults
  });
  const nodeSucceeded = execution.ok && execution.result?.status === "success";
  const ok = nodeSucceeded && nodeResultValidation.ok;
  const completedNodes = nodeSucceeded ? [SYNTHETIC_EXECUTABLE_NODE_ID] : [];
  const blockedNodes = nodeSucceeded ? [] : [SYNTHETIC_EXECUTABLE_NODE_ID];

  return {
    ok,
    failures: ok ? [] : uniqueSorted([...execution.failures, ...nodeResultValidation.failures]),
    warnings: uniqueSorted([...validation.warnings, ...nodeResultValidation.warnings]),
    validation,
    mode: EXECUTABLE_NODE_MVP_MODE,
    report_date: reportDate,
    generated_at: generatedAt,
    run_id: runId,
    plan,
    run: {
      final_status: nodeSucceeded ? "executed_one_node" : "blocked",
      levels: plan.levels.map(copyLevel),
      planned_nodes: plan.nodes.map((node) => node.id),
      completed_nodes: completedNodes,
      blocked_nodes: blockedNodes
    },
    node_results: nodeResults,
    node_result_validation: nodeResultValidation,
    executed_commands: [{
      node_id: SYNTHETIC_EXECUTABLE_NODE_ID,
      runner: "node",
      script: SYNTHETIC_EXECUTABLE_SCRIPT
    }],
    codex_invocations: [],
    next_action: {
      kind: "implement_real_dag_node_adapter",
      message: "Executable-node MVP ran one synthetic command node with explicit artifact input/output contracts; next adapt one real low-risk DAG node."
    }
  };
}

export async function createDailyCodexDagRealNodeAdapterMvp(options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const reportDate = requiredReportDate(options.reportDate || options.date);
  const generatedAt = toIsoTimestamp(options.now || new Date());
  const nodeId = options.nodeId || options.node_id || REAL_NODE_ADAPTER_TARGET_NODE_ID;
  const runId = options.runId || options.run_id || `daily-codex-dag:${reportDate}:real-node-adapter:${nodeId}`;

  if (nodeId !== REAL_NODE_ADAPTER_TARGET_NODE_ID) {
    return {
      ok: false,
      failures: [`daily codex DAG real-node adapter MVP only supports ${REAL_NODE_ADAPTER_TARGET_NODE_ID}.`],
      warnings: [],
      validation: null,
      plan: null,
      run: null
    };
  }

  let manifest = null;
  try {
    const loaded = await loadDailyCodexDag({ rootDir, dagPath: options.dagPath });
    manifest = loaded.manifest;
  } catch (error) {
    return {
      ok: false,
      failures: [`${DEFAULT_DAG_PATH}: ${error.message}`],
      warnings: [],
      validation: null,
      plan: null,
      run: null
    };
  }

  const validation = await validateDailyCodexDag({ rootDir, dagPath: options.dagPath, manifest });
  if (!validation.ok) {
    return {
      ok: false,
      failures: validation.failures,
      warnings: validation.warnings,
      validation,
      plan: null,
      run: null
    };
  }

  const sourceNode = manifest.nodes.find((node) => node.id === nodeId);
  if (!sourceNode) {
    return {
      ok: false,
      failures: [`daily codex DAG real-node adapter MVP missing node ${nodeId}.`],
      warnings: validation.warnings,
      validation,
      plan: null,
      run: null
    };
  }

  const executableNode = createRealNodeAdapterCommandNode({ sourceNode, reportDate });
  const fixtureManifest = {
    schema_version: manifest.schema_version,
    name: manifest.name,
    description: `Fixture-only executable adapter for real DAG node ${nodeId}.`,
    nodes: [executableNode]
  };
  const plan = projectDailyCodexDagPlan(fixtureManifest);

  await prepareRealNodeAdapterFixtureArtifacts({ rootDir, reportDate, sourceNode });

  const execution = await executeDailyCodexDagCommandNode({
    rootDir,
    reportDate,
    runId,
    manifestName: manifest.name,
    manifestSchemaVersion: manifest.schema_version,
    node: executableNode,
    nodeExecutablePath: options.nodeExecutablePath || options.node_executable_path || process.execPath,
    executeCommand: options.executeCommand,
    startedAt: options.startedAt ?? options.started_at,
    finishedAt: options.finishedAt ?? options.finished_at,
    timeoutSeconds: options.timeoutSeconds ?? options.timeout_seconds,
    dependencyResults: createRealNodeAdapterDependencyResults({ sourceNode, reportDate, runId }),
    resiliencePolicyRef: sourceNode.resilience_policy_ref || ""
  });
  const nodeResults = execution.result ? [execution.result] : [];
  const nodeResultValidation = validateRealNodeAdapterMvpNodeResults({
    plan,
    sourceNode,
    reportDate,
    runId,
    nodeResults
  });
  const nodeSucceeded = execution.ok && execution.result?.status === "success";
  const ok = nodeSucceeded && nodeResultValidation.ok;
  const completedNodes = nodeSucceeded ? [nodeId] : [];
  const blockedNodes = nodeSucceeded ? [] : [nodeId];

  return {
    ok,
    failures: ok ? [] : uniqueSorted([...execution.failures, ...nodeResultValidation.failures]),
    warnings: uniqueSorted([...validation.warnings, ...nodeResultValidation.warnings]),
    validation,
    mode: REAL_NODE_ADAPTER_MVP_MODE,
    report_date: reportDate,
    generated_at: generatedAt,
    run_id: runId,
    plan,
    run: {
      final_status: nodeSucceeded ? "executed_one_real_node" : "blocked",
      levels: plan.levels.map(copyLevel),
      planned_nodes: plan.nodes.map((node) => node.id),
      completed_nodes: completedNodes,
      blocked_nodes: blockedNodes
    },
    node_results: nodeResults,
    node_result_validation: nodeResultValidation,
    executed_commands: [{
      node_id: nodeId,
      runner: "node",
      script: REAL_NODE_ADAPTER_SCRIPT
    }],
    codex_invocations: [],
    next_action: {
      kind: "wire_multi_node_dag_executor",
      message: "Real-node adapter MVP ran the score node against fixture artifacts; next wire a small multi-node DAG executor sequence."
    }
  };
}

export async function createDailyCodexDagSourceWatchCollectMvp(options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const reportDate = requiredReportDate(options.reportDate || options.date);
  const generatedAt = toIsoTimestamp(options.now || new Date());
  const runId = options.runId || options.run_id || `daily-codex-dag:${reportDate}:source-watch-collect`;

  let manifest = null;
  try {
    const loaded = await loadDailyCodexDag({ rootDir, dagPath: options.dagPath });
    manifest = loaded.manifest;
  } catch (error) {
    return {
      ok: false,
      failures: [`${DEFAULT_DAG_PATH}: ${error.message}`],
      warnings: [],
      validation: null,
      plan: null,
      run: null
    };
  }

  const validation = await validateDailyCodexDag({ rootDir, dagPath: options.dagPath, manifest });
  if (!validation.ok) {
    return {
      ok: false,
      failures: validation.failures,
      warnings: validation.warnings,
      validation,
      plan: null,
      run: null
    };
  }

  const sourceNode = manifest.nodes.find((node) => node.id === SOURCE_WATCH_COLLECT_NODE_ID);
  if (!sourceNode) {
    return {
      ok: false,
      failures: [`daily codex DAG source-watch collect MVP missing node ${SOURCE_WATCH_COLLECT_NODE_ID}.`],
      warnings: validation.warnings,
      validation,
      plan: null,
      run: null
    };
  }

  const executableNode = createSourceWatchCollectCommandNode({
    sourceNode,
    reportDate,
    generatedAt,
    watchlistPath: options.watchlistPath || options.watchlist_path || SOURCE_WATCH_FIXTURE_CONFIG,
    fixtureDir: options.fixtureDir || options.fixture_dir || SOURCE_WATCH_FIXTURE_DIR,
    endpointLimit: options.endpointLimit || options.endpoint_limit || null
  });
  const fixtureManifest = {
    schema_version: manifest.schema_version,
    name: manifest.name,
    description: "Fixture-only executable adapter for the Source Watch collect/context DAG lane.",
    nodes: [executableNode]
  };
  const plan = projectDailyCodexDagPlan(fixtureManifest);

  await prepareSourceWatchCollectFixtureArtifacts({ rootDir, reportDate, sourceNode });

  const execution = await executeDailyCodexDagCommandNode({
    rootDir,
    reportDate,
    runId,
    manifestName: manifest.name,
    manifestSchemaVersion: manifest.schema_version,
    node: executableNode,
    nodeExecutablePath: options.nodeExecutablePath || options.node_executable_path || process.execPath,
    executeCommand: options.executeCommand,
    startedAt: options.startedAt ?? options.started_at,
    finishedAt: options.finishedAt ?? options.finished_at,
    timeoutSeconds: options.timeoutSeconds ?? options.timeout_seconds,
    resiliencePolicyRef: sourceNode.resilience_policy_ref || ""
  });
  const nodeResults = execution.result ? [execution.result] : [];
  const sourceWatch = await summarizeSourceWatchCollectArtifact({ rootDir, reportDate, sourceNode });
  const nodeResultValidation = validateSourceWatchCollectMvpNodeResults({
    plan,
    sourceNode,
    reportDate,
    runId,
    nodeResults
  });
  const nodeSucceeded = execution.ok && execution.result?.status === "success";
  const baseOk = nodeSucceeded && nodeResultValidation.ok && sourceWatch.ok;
  const completedNodes = nodeSucceeded ? [SOURCE_WATCH_COLLECT_NODE_ID] : [];
  const blockedNodes = nodeSucceeded ? [] : [SOURCE_WATCH_COLLECT_NODE_ID];

  const summary = {
    ok: baseOk,
    failures: baseOk ? [] : uniqueSorted([...execution.failures, ...nodeResultValidation.failures, ...sourceWatch.failures]),
    warnings: uniqueSorted([...validation.warnings, ...nodeResultValidation.warnings, ...sourceWatch.warnings]),
    validation,
    mode: SOURCE_WATCH_COLLECT_MVP_MODE,
    report_date: reportDate,
    generated_at: generatedAt,
    run_id: runId,
    plan,
    run: {
      final_status: nodeSucceeded ? "executed_source_watch_collect" : "blocked",
      levels: plan.levels.map(copyLevel),
      planned_nodes: plan.nodes.map((node) => node.id),
      completed_nodes: completedNodes,
      blocked_nodes: blockedNodes
    },
    source_watch: sourceWatch.summary,
    node_results: nodeResults,
    node_result_validation: nodeResultValidation,
    executed_commands: [{
      node_id: SOURCE_WATCH_COLLECT_NODE_ID,
      runner: "node",
      script: SOURCE_WATCH_COLLECT_SCRIPT
    }],
    codex_invocations: [],
    next_action: {
      kind: "wire_parse_extract_source_watch_candidates",
      message: "Source Watch collect/context fixture executed fetch-source-health and wrote source-health.json; next wire parse/extract to consume these candidates."
    }
  };
  const summaryValidation = validateDailyCodexDagRunSummary(summary);
  if (!summaryValidation.ok) {
    return {
      ...summary,
      ok: false,
      failures: uniqueSorted([...summary.failures, ...summaryValidation.failures]),
      warnings: uniqueSorted([...summary.warnings, ...summaryValidation.warnings])
    };
  }
  return summary;
}

export async function createDailyCodexDagSourceWatchDownstreamMvp(options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const reportDate = requiredReportDate(options.reportDate || options.date);
  const generatedAt = toIsoTimestamp(options.now || new Date());
  const runId = options.runId || options.run_id || `daily-codex-dag:${reportDate}:source-watch-downstream`;

  let manifest = null;
  try {
    const loaded = await loadDailyCodexDag({ rootDir, dagPath: options.dagPath });
    manifest = loaded.manifest;
  } catch (error) {
    return {
      ok: false,
      failures: [`${DEFAULT_DAG_PATH}: ${error.message}`],
      warnings: [],
      validation: null,
      plan: null,
      run: null
    };
  }

  const validation = await validateDailyCodexDag({ rootDir, dagPath: options.dagPath, manifest });
  if (!validation.ok) {
    return {
      ok: false,
      failures: validation.failures,
      warnings: validation.warnings,
      validation,
      plan: null,
      run: null
    };
  }

  const collectSourceNode = manifest.nodes.find((node) => node.id === SOURCE_WATCH_COLLECT_NODE_ID);
  const downstreamSourceNode = manifest.nodes.find((node) => node.id === SOURCE_WATCH_DOWNSTREAM_NODE_ID);
  const missingNodeId = !collectSourceNode
    ? SOURCE_WATCH_COLLECT_NODE_ID
    : !downstreamSourceNode
      ? SOURCE_WATCH_DOWNSTREAM_NODE_ID
      : "";
  if (missingNodeId) {
    return {
      ok: false,
      failures: [`daily codex DAG source-watch downstream MVP missing node ${missingNodeId}.`],
      warnings: validation.warnings,
      validation,
      plan: null,
      run: null
    };
  }

  const executableNodes = [
    createSourceWatchCollectCommandNode({
      sourceNode: collectSourceNode,
      reportDate,
      generatedAt,
      watchlistPath: options.watchlistPath || options.watchlist_path || SOURCE_WATCH_FIXTURE_CONFIG,
      fixtureDir: options.fixtureDir || options.fixture_dir || SOURCE_WATCH_FIXTURE_DIR,
      endpointLimit: options.endpointLimit || options.endpoint_limit || null
    }),
    createSourceWatchDownstreamCommandNode({
      sourceNode: downstreamSourceNode,
      reportDate,
      dependencies: [SOURCE_WATCH_COLLECT_NODE_ID]
    })
  ];
  const fixtureManifest = {
    schema_version: manifest.schema_version,
    name: manifest.name,
    description: "Fixture-only executable adapter for the Source Watch collect-to-parse DAG sequence.",
    nodes: executableNodes
  };
  const plan = projectDailyCodexDagPlan(fixtureManifest);

  await prepareSourceWatchDownstreamFixtureArtifacts({ rootDir, reportDate, collectSourceNode, downstreamSourceNode });

  const nodeResults = [];
  const executionFailures = [];
  const executedCommands = [];
  const nodeExecutablePath = options.nodeExecutablePath || options.node_executable_path || process.execPath;
  const collectExecution = await executeDailyCodexDagCommandNode({
    rootDir,
    reportDate,
    runId,
    manifestName: manifest.name,
    manifestSchemaVersion: manifest.schema_version,
    node: executableNodes[0],
    nodeExecutablePath,
    executeCommand: options.executeCommand,
    startedAt: options.startedAt ?? options.started_at,
    finishedAt: options.finishedAt ?? options.finished_at,
    timeoutSeconds: options.timeoutSeconds ?? options.timeout_seconds,
    dependencyResults: [],
    resiliencePolicyRef: collectSourceNode.resilience_policy_ref || ""
  });
  executionFailures.push(...collectExecution.failures);
  if (collectExecution.result) nodeResults.push(collectExecution.result);
  executedCommands.push({
    node_id: SOURCE_WATCH_COLLECT_NODE_ID,
    runner: "node",
    script: SOURCE_WATCH_COLLECT_SCRIPT
  });

  const collectSucceeded = collectExecution.ok && collectExecution.result?.status === "success";
  if (collectSucceeded) {
    const downstreamExecution = await executeDailyCodexDagCommandNode({
      rootDir,
      reportDate,
      runId,
      manifestName: manifest.name,
      manifestSchemaVersion: manifest.schema_version,
      node: executableNodes[1],
      nodeExecutablePath,
      executeCommand: options.executeCommand,
      startedAt: options.startedAt ?? options.started_at,
      finishedAt: options.finishedAt ?? options.finished_at,
      timeoutSeconds: options.timeoutSeconds ?? options.timeout_seconds,
      dependencyResults: [dependencyResultFromNodeResult(collectExecution.result)],
      resiliencePolicyRef: downstreamSourceNode.resilience_policy_ref || ""
    });
    executionFailures.push(...downstreamExecution.failures);
    if (downstreamExecution.result) nodeResults.push(downstreamExecution.result);
    executedCommands.push({
      node_id: SOURCE_WATCH_DOWNSTREAM_NODE_ID,
      runner: "node",
      script: SOURCE_WATCH_DOWNSTREAM_SCRIPT
    });
  } else {
    nodeResults.push(createBlockedSourceWatchDownstreamNodeResult({
      reportDate,
      runId,
      manifestName: manifest.name,
      manifestSchemaVersion: manifest.schema_version,
      node: executableNodes[1],
      dependencyResult: collectExecution.result
        ? dependencyResultFromNodeResult(collectExecution.result)
        : {
            node_id: SOURCE_WATCH_COLLECT_NODE_ID,
            execution_id: `${runId}:${SOURCE_WATCH_COLLECT_NODE_ID}:missing-result`,
            status: "failure",
            required: true,
            downstream_disposition: "block"
          }
    }));
  }

  const sourceWatch = collectSucceeded
    ? await summarizeSourceWatchCollectArtifact({ rootDir, reportDate, sourceNode: collectSourceNode })
    : {
        ok: true,
        failures: [],
        warnings: [],
        summary: {
          ...emptySourceWatchCollectSummary(),
          artifact_path: SOURCE_WATCH_COLLECT_OUTPUT_ARTIFACT
        }
      };
  const downstream = collectSucceeded
    ? await summarizeSourceWatchDownstreamArtifact({ rootDir, reportDate, sourceNode: downstreamSourceNode })
    : {
        ok: true,
        failures: [],
        warnings: [],
        summary: {
          ...emptySourceWatchDownstreamSummary(),
          artifact_path: SOURCE_WATCH_DOWNSTREAM_OUTPUT_ARTIFACT
        }
      };
  const nodeResultValidation = validateSourceWatchDownstreamMvpNodeResults({
    plan,
    reportDate,
    runId,
    nodeResults
  });
  const completedNodes = nodeResults
    .filter((result) => result.status === "success")
    .map((result) => result.node_id);
  const blockedNodes = nodeResults
    .filter((result) => result.status === "failure" || result.status === "blocked")
    .map((result) => result.node_id);
  const ok = nodeResults.length === 2
    && nodeResults.every((result) => result.status === "success")
    && nodeResultValidation.ok
    && sourceWatch.ok
    && downstream.ok;
  const nodeFailureMessages = nodeResults.flatMap((result) => (result.failures || []).map((issue) => issue.message));

  const summary = {
    ok,
    failures: ok ? [] : uniqueSorted([
      ...executionFailures,
      ...nodeFailureMessages,
      ...nodeResultValidation.failures,
      ...sourceWatch.failures,
      ...downstream.failures
    ]),
    warnings: uniqueSorted([
      ...validation.warnings,
      ...nodeResultValidation.warnings,
      ...sourceWatch.warnings,
      ...downstream.warnings
    ]),
    validation,
    mode: SOURCE_WATCH_DOWNSTREAM_MVP_MODE,
    report_date: reportDate,
    generated_at: generatedAt,
    run_id: runId,
    plan,
    run: {
      final_status: ok ? "executed_source_watch_downstream" : "blocked",
      levels: plan.levels.map(copyLevel),
      planned_nodes: plan.nodes.map((node) => node.id),
      completed_nodes: completedNodes,
      blocked_nodes: blockedNodes
    },
    source_watch: sourceWatch.summary,
    downstream: downstream.summary,
    node_results: nodeResults,
    node_result_validation: nodeResultValidation,
    executed_commands: executedCommands,
    codex_invocations: [],
    next_action: {
      kind: "wire_normalize_canonicalize_source_watch_candidates",
      message: "Source Watch downstream fixture consumed source-health.json and emitted extracted-candidates.json; next wire normalize/canonicalize to consume these candidates."
    }
  };
  const summaryValidation = validateDailyCodexDagRunSummary(summary);
  if (!summaryValidation.ok) {
    return {
      ...summary,
      ok: false,
      failures: uniqueSorted([...summary.failures, ...summaryValidation.failures]),
      warnings: uniqueSorted([...summary.warnings, ...summaryValidation.warnings])
    };
  }
  return summary;
}

export async function createDailyCodexDagSourceWatchNormalizeMvp(options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const reportDate = requiredReportDate(options.reportDate || options.date);
  const generatedAt = toIsoTimestamp(options.now || new Date());
  const runId = options.runId || options.run_id || `daily-codex-dag:${reportDate}:source-watch-normalize`;

  let manifest = null;
  try {
    const loaded = await loadDailyCodexDag({ rootDir, dagPath: options.dagPath });
    manifest = loaded.manifest;
  } catch (error) {
    return {
      ok: false,
      failures: [`${DEFAULT_DAG_PATH}: ${error.message}`],
      warnings: [],
      validation: null,
      plan: null,
      run: null
    };
  }

  const validation = await validateDailyCodexDag({ rootDir, dagPath: options.dagPath, manifest });
  if (!validation.ok) {
    return {
      ok: false,
      failures: validation.failures,
      warnings: validation.warnings,
      validation,
      plan: null,
      run: null
    };
  }

  const collectSourceNode = manifest.nodes.find((node) => node.id === SOURCE_WATCH_COLLECT_NODE_ID);
  const downstreamSourceNode = manifest.nodes.find((node) => node.id === SOURCE_WATCH_DOWNSTREAM_NODE_ID);
  const normalizeSourceNode = manifest.nodes.find((node) => node.id === SOURCE_WATCH_NORMALIZE_NODE_ID);
  const missingNodeId = !collectSourceNode
    ? SOURCE_WATCH_COLLECT_NODE_ID
    : !downstreamSourceNode
      ? SOURCE_WATCH_DOWNSTREAM_NODE_ID
      : !normalizeSourceNode
        ? SOURCE_WATCH_NORMALIZE_NODE_ID
        : "";
  if (missingNodeId) {
    return {
      ok: false,
      failures: [`daily codex DAG source-watch normalize MVP missing node ${missingNodeId}.`],
      warnings: validation.warnings,
      validation,
      plan: null,
      run: null
    };
  }

  const executableNodes = [
    createSourceWatchCollectCommandNode({
      sourceNode: collectSourceNode,
      reportDate,
      generatedAt,
      watchlistPath: options.watchlistPath || options.watchlist_path || SOURCE_WATCH_FIXTURE_CONFIG,
      fixtureDir: options.fixtureDir || options.fixture_dir || SOURCE_WATCH_FIXTURE_DIR,
      endpointLimit: options.endpointLimit || options.endpoint_limit || null
    }),
    createSourceWatchDownstreamCommandNode({
      sourceNode: downstreamSourceNode,
      reportDate,
      dependencies: [SOURCE_WATCH_COLLECT_NODE_ID]
    }),
    createSourceWatchNormalizeCommandNode({
      sourceNode: normalizeSourceNode,
      reportDate,
      dependencies: [SOURCE_WATCH_DOWNSTREAM_NODE_ID]
    })
  ];
  const fixtureManifest = {
    schema_version: manifest.schema_version,
    name: manifest.name,
    description: "Fixture-only executable adapter for the Source Watch collect-to-normalize DAG sequence.",
    nodes: executableNodes
  };
  const plan = projectDailyCodexDagPlan(fixtureManifest);

  await prepareSourceWatchNormalizeFixtureArtifacts({ rootDir, reportDate, collectSourceNode, downstreamSourceNode, normalizeSourceNode });

  const nodeResults = [];
  const executionFailures = [];
  const executedCommands = [];
  const nodeExecutablePath = options.nodeExecutablePath || options.node_executable_path || process.execPath;
  const collectExecution = await executeDailyCodexDagCommandNode({
    rootDir,
    reportDate,
    runId,
    manifestName: manifest.name,
    manifestSchemaVersion: manifest.schema_version,
    node: executableNodes[0],
    nodeExecutablePath,
    executeCommand: options.executeCommand,
    startedAt: options.startedAt ?? options.started_at,
    finishedAt: options.finishedAt ?? options.finished_at,
    timeoutSeconds: options.timeoutSeconds ?? options.timeout_seconds,
    dependencyResults: [],
    resiliencePolicyRef: collectSourceNode.resilience_policy_ref || ""
  });
  executionFailures.push(...collectExecution.failures);
  if (collectExecution.result) nodeResults.push(collectExecution.result);
  executedCommands.push({
    node_id: SOURCE_WATCH_COLLECT_NODE_ID,
    runner: "node",
    script: SOURCE_WATCH_COLLECT_SCRIPT
  });

  const collectSucceeded = collectExecution.ok && collectExecution.result?.status === "success";
  let downstreamResult = null;
  if (collectSucceeded) {
    const downstreamExecution = await executeDailyCodexDagCommandNode({
      rootDir,
      reportDate,
      runId,
      manifestName: manifest.name,
      manifestSchemaVersion: manifest.schema_version,
      node: executableNodes[1],
      nodeExecutablePath,
      executeCommand: options.executeCommand,
      startedAt: options.startedAt ?? options.started_at,
      finishedAt: options.finishedAt ?? options.finished_at,
      timeoutSeconds: options.timeoutSeconds ?? options.timeout_seconds,
      dependencyResults: [dependencyResultFromNodeResult(collectExecution.result)],
      resiliencePolicyRef: downstreamSourceNode.resilience_policy_ref || ""
    });
    executionFailures.push(...downstreamExecution.failures);
    if (downstreamExecution.result) {
      downstreamResult = downstreamExecution.result;
      nodeResults.push(downstreamExecution.result);
    }
    executedCommands.push({
      node_id: SOURCE_WATCH_DOWNSTREAM_NODE_ID,
      runner: "node",
      script: SOURCE_WATCH_DOWNSTREAM_SCRIPT
    });
  } else {
    downstreamResult = createBlockedSourceWatchDownstreamNodeResult({
      reportDate,
      runId,
      manifestName: manifest.name,
      manifestSchemaVersion: manifest.schema_version,
      node: executableNodes[1],
      dependencyResult: collectExecution.result
        ? dependencyResultFromNodeResult(collectExecution.result)
        : {
            node_id: SOURCE_WATCH_COLLECT_NODE_ID,
            execution_id: `${runId}:${SOURCE_WATCH_COLLECT_NODE_ID}:missing-result`,
            status: "failure",
            required: true,
            downstream_disposition: "block"
          }
    });
    nodeResults.push(downstreamResult);
  }

  const downstreamSucceeded = downstreamResult?.status === "success";
  if (downstreamSucceeded) {
    const normalizeExecution = await executeDailyCodexDagCommandNode({
      rootDir,
      reportDate,
      runId,
      manifestName: manifest.name,
      manifestSchemaVersion: manifest.schema_version,
      node: executableNodes[2],
      nodeExecutablePath,
      executeCommand: options.executeCommand,
      startedAt: options.startedAt ?? options.started_at,
      finishedAt: options.finishedAt ?? options.finished_at,
      timeoutSeconds: options.timeoutSeconds ?? options.timeout_seconds,
      dependencyResults: [dependencyResultFromNodeResult(downstreamResult)],
      resiliencePolicyRef: normalizeSourceNode.resilience_policy_ref || ""
    });
    executionFailures.push(...normalizeExecution.failures);
    if (normalizeExecution.result) nodeResults.push(normalizeExecution.result);
    executedCommands.push({
      node_id: SOURCE_WATCH_NORMALIZE_NODE_ID,
      runner: "node",
      script: SOURCE_WATCH_NORMALIZE_SCRIPT
    });
  } else {
    nodeResults.push(createBlockedSourceWatchDownstreamNodeResult({
      reportDate,
      runId,
      manifestName: manifest.name,
      manifestSchemaVersion: manifest.schema_version,
      node: executableNodes[2],
      fixtureLabel: "source-watch normalize fixture",
      issueSource: "daily-codex-dag-source-watch-normalize-fixture",
      dependencyResult: downstreamResult
        ? dependencyResultFromNodeResult(downstreamResult)
        : {
            node_id: SOURCE_WATCH_DOWNSTREAM_NODE_ID,
            execution_id: `${runId}:${SOURCE_WATCH_DOWNSTREAM_NODE_ID}:missing-result`,
            status: "failure",
            required: true,
            downstream_disposition: "block"
          }
    }));
  }

  const normalizeResult = nodeResults.find((result) => result.node_id === SOURCE_WATCH_NORMALIZE_NODE_ID);
  const normalizeSucceeded = normalizeResult?.status === "success";
  const sourceWatch = collectSucceeded
    ? await summarizeSourceWatchCollectArtifact({ rootDir, reportDate, sourceNode: collectSourceNode })
    : {
        ok: true,
        failures: [],
        warnings: [],
        summary: {
          ...emptySourceWatchCollectSummary(),
          artifact_path: SOURCE_WATCH_COLLECT_OUTPUT_ARTIFACT
        }
      };
  const downstream = downstreamSucceeded
    ? await summarizeSourceWatchDownstreamArtifact({ rootDir, reportDate, sourceNode: downstreamSourceNode })
    : {
        ok: true,
        failures: [],
        warnings: [],
        summary: {
          ...emptySourceWatchDownstreamSummary(),
          artifact_path: SOURCE_WATCH_DOWNSTREAM_OUTPUT_ARTIFACT
        }
      };
  const normalized = normalizeSucceeded
    ? await summarizeSourceWatchNormalizeArtifact({ rootDir, reportDate, sourceNode: normalizeSourceNode })
    : {
        ok: true,
        failures: [],
        warnings: [],
        summary: {
          ...emptySourceWatchNormalizeSummary(),
          artifact_path: SOURCE_WATCH_NORMALIZE_OUTPUT_ARTIFACT
        }
      };
  const nodeResultValidation = validateSourceWatchNormalizeMvpNodeResults({
    plan,
    reportDate,
    runId,
    nodeResults
  });
  const completedNodes = nodeResults
    .filter((result) => result.status === "success")
    .map((result) => result.node_id);
  const blockedNodes = nodeResults
    .filter((result) => result.status === "failure" || result.status === "blocked")
    .map((result) => result.node_id);
  const ok = nodeResults.length === 3
    && nodeResults.every((result) => result.status === "success")
    && nodeResultValidation.ok
    && sourceWatch.ok
    && downstream.ok
    && normalized.ok;
  const nodeFailureMessages = nodeResults.flatMap((result) => (result.failures || []).map((issue) => issue.message));

  const summary = {
    ok,
    failures: ok ? [] : uniqueSorted([
      ...executionFailures,
      ...nodeFailureMessages,
      ...nodeResultValidation.failures,
      ...sourceWatch.failures,
      ...downstream.failures,
      ...normalized.failures
    ]),
    warnings: uniqueSorted([
      ...validation.warnings,
      ...nodeResultValidation.warnings,
      ...sourceWatch.warnings,
      ...downstream.warnings,
      ...normalized.warnings
    ]),
    validation,
    mode: SOURCE_WATCH_NORMALIZE_MVP_MODE,
    report_date: reportDate,
    generated_at: generatedAt,
    run_id: runId,
    plan,
    run: {
      final_status: ok ? "executed_source_watch_normalize" : "blocked",
      levels: plan.levels.map(copyLevel),
      planned_nodes: plan.nodes.map((node) => node.id),
      completed_nodes: completedNodes,
      blocked_nodes: blockedNodes
    },
    source_watch: sourceWatch.summary,
    downstream: downstream.summary,
    normalized: normalized.summary,
    node_results: nodeResults,
    node_result_validation: nodeResultValidation,
    executed_commands: executedCommands,
    codex_invocations: [],
    next_action: {
      kind: "wire_classify_tag_entity_source_watch_candidates",
      message: "Source Watch normalize fixture consumed extracted-candidates.json and emitted canonical-candidates.json; next wire classify/tag/entity to consume canonical candidates."
    }
  };
  const summaryValidation = validateDailyCodexDagRunSummary(summary);
  if (!summaryValidation.ok) {
    return {
      ...summary,
      ok: false,
      failures: uniqueSorted([...summary.failures, ...summaryValidation.failures]),
      warnings: uniqueSorted([...summary.warnings, ...summaryValidation.warnings])
    };
  }
  return summary;
}

export async function createDailyCodexDagSourceWatchQualityMvp(options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const reportDate = requiredReportDate(options.reportDate || options.date);
  const generatedAt = toIsoTimestamp(options.now || new Date());
  const runId = options.runId || options.run_id || `daily-codex-dag:${reportDate}:source-watch-quality`;
  const normalizeSummary = await createDailyCodexDagSourceWatchNormalizeMvp({
    ...options,
    rootDir,
    reportDate,
    now: generatedAt,
    runId
  });

  if (!isPlainObject(normalizeSummary.plan) || !Array.isArray(normalizeSummary.node_results)) {
    return {
      ...normalizeSummary,
      mode: SOURCE_WATCH_QUALITY_MVP_MODE,
      failures: uniqueSorted([...(normalizeSummary.failures || []), "daily codex DAG source-watch quality MVP could not build the upstream normalize sequence."])
    };
  }

  let manifest = null;
  try {
    const loaded = await loadDailyCodexDag({ rootDir, dagPath: options.dagPath });
    manifest = loaded.manifest;
  } catch (error) {
    return {
      ok: false,
      failures: [`${DEFAULT_DAG_PATH}: ${error.message}`],
      warnings: [],
      validation: null,
      plan: null,
      run: null
    };
  }

  const qualitySourceNode = manifest.nodes.find((node) => node.id === SOURCE_WATCH_QUALITY_NODE_ID);
  if (!qualitySourceNode) {
    return {
      ok: false,
      failures: [`daily codex DAG source-watch quality MVP missing node ${SOURCE_WATCH_QUALITY_NODE_ID}.`],
      warnings: normalizeSummary.validation?.warnings || [],
      validation: normalizeSummary.validation || null,
      plan: null,
      run: null
    };
  }

  const qualityNode = createSourceWatchQualityCommandNode({
    sourceNode: qualitySourceNode,
    reportDate,
    dependencies: [SOURCE_WATCH_NORMALIZE_NODE_ID],
    historyPath: options.historyPath || options.history_path || SOURCE_WATCH_QUALITY_HISTORY
  });
  const fixtureManifest = {
    schema_version: manifest.schema_version,
    name: manifest.name,
    description: "Fixture-only executable adapter for the Source Watch collect-to-quality DAG sequence.",
    nodes: [...normalizeSummary.plan.nodes, qualityNode]
  };
  const plan = projectDailyCodexDagPlan(fixtureManifest);
  await prepareSourceWatchQualityFixtureArtifacts({ rootDir, reportDate });

  const nodeResults = [...normalizeSummary.node_results];
  const executionFailures = [];
  const executedCommands = [...normalizeSummary.executed_commands];
  const nodeExecutablePath = options.nodeExecutablePath || options.node_executable_path || process.execPath;
  const normalizeResult = nodeResults.find((result) => result.node_id === SOURCE_WATCH_NORMALIZE_NODE_ID);
  const normalizeSucceeded = normalizeResult?.status === "success";
  if (normalizeSucceeded) {
    const qualityExecution = await executeDailyCodexDagCommandNode({
      rootDir,
      reportDate,
      runId,
      manifestName: manifest.name,
      manifestSchemaVersion: manifest.schema_version,
      node: qualityNode,
      nodeExecutablePath,
      executeCommand: options.executeCommand,
      startedAt: options.startedAt ?? options.started_at,
      finishedAt: options.finishedAt ?? options.finished_at,
      timeoutSeconds: options.timeoutSeconds ?? options.timeout_seconds,
      dependencyResults: [dependencyResultFromNodeResult(normalizeResult)],
      resiliencePolicyRef: qualitySourceNode.resilience_policy_ref || ""
    });
    executionFailures.push(...qualityExecution.failures);
    if (qualityExecution.result) nodeResults.push(qualityExecution.result);
    executedCommands.push({
      node_id: SOURCE_WATCH_QUALITY_NODE_ID,
      runner: "node",
      script: SOURCE_WATCH_QUALITY_SCRIPT
    });
  } else {
    nodeResults.push(createBlockedSourceWatchDownstreamNodeResult({
      reportDate,
      runId,
      manifestName: manifest.name,
      manifestSchemaVersion: manifest.schema_version,
      node: qualityNode,
      fixtureLabel: "source-watch quality fixture",
      issueSource: "daily-codex-dag-source-watch-quality-fixture",
      dependencyResult: normalizeResult
        ? dependencyResultFromNodeResult(normalizeResult)
        : {
            node_id: SOURCE_WATCH_NORMALIZE_NODE_ID,
            execution_id: `${runId}:${SOURCE_WATCH_NORMALIZE_NODE_ID}:missing-result`,
            status: "failure",
            required: true,
            downstream_disposition: "block"
          }
    }));
  }

  const qualityResult = nodeResults.find((result) => result.node_id === SOURCE_WATCH_QUALITY_NODE_ID);
  const qualitySucceeded = qualityResult?.status === "success";
  const quality = qualitySucceeded
    ? await summarizeSourceWatchQualityArtifact({ rootDir, reportDate })
    : {
        ok: true,
        failures: [],
        warnings: [],
        summary: {
          ...emptySourceWatchQualitySummary(),
          artifact_path: SOURCE_WATCH_QUALITY_OUTPUT_ARTIFACT
        }
      };
  const nodeResultValidation = validateSourceWatchQualityMvpNodeResults({
    plan,
    reportDate,
    runId,
    nodeResults
  });
  const completedNodes = nodeResults
    .filter((result) => result.status === "success")
    .map((result) => result.node_id);
  const blockedNodes = nodeResults
    .filter((result) => result.status === "failure" || result.status === "blocked")
    .map((result) => result.node_id);
  const ok = nodeResults.length === 4
    && nodeResults.every((result) => result.status === "success")
    && nodeResultValidation.ok
    && normalizeSummary.source_watch
    && normalizeSummary.downstream
    && normalizeSummary.normalized
    && quality.ok;
  const nodeFailureMessages = nodeResults.flatMap((result) => (result.failures || []).map((issue) => issue.message));

  const summary = {
    ok,
    failures: ok ? [] : uniqueSorted([
      ...(normalizeSummary.ok ? [] : normalizeSummary.failures || []),
      ...executionFailures,
      ...nodeFailureMessages,
      ...nodeResultValidation.failures,
      ...quality.failures
    ]),
    warnings: uniqueSorted([
      ...(normalizeSummary.warnings || []),
      ...nodeResultValidation.warnings,
      ...quality.warnings
    ]),
    validation: normalizeSummary.validation,
    mode: SOURCE_WATCH_QUALITY_MVP_MODE,
    report_date: reportDate,
    generated_at: generatedAt,
    run_id: runId,
    plan,
    run: {
      final_status: ok ? "executed_source_watch_quality" : "blocked",
      levels: plan.levels.map(copyLevel),
      planned_nodes: plan.nodes.map((node) => node.id),
      completed_nodes: completedNodes,
      blocked_nodes: blockedNodes
    },
    source_watch: normalizeSummary.source_watch,
    downstream: normalizeSummary.downstream,
    normalized: normalizeSummary.normalized,
    quality: quality.summary,
    node_results: nodeResults,
    node_result_validation: nodeResultValidation,
    executed_commands: executedCommands,
    codex_invocations: [],
    next_action: {
      kind: "promote_source_watch_quality_candidates_after_review",
      message: "Source Watch quality fixture consumed canonical-candidates.json and emitted internal quality-candidates.json; next promote admitted candidates only after downstream review gates."
    }
  };
  const summaryValidation = validateDailyCodexDagRunSummary(summary);
  if (!summaryValidation.ok) {
    return {
      ...summary,
      ok: false,
      failures: uniqueSorted([...summary.failures, ...summaryValidation.failures]),
      warnings: uniqueSorted([...summary.warnings, ...summaryValidation.warnings])
    };
  }
  return summary;
}

export async function createDailyCodexDagSourceWatchAdmitMvp(options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const reportDate = requiredReportDate(options.reportDate || options.date);
  const generatedAt = toIsoTimestamp(options.now || new Date());
  const runId = options.runId || options.run_id || `daily-codex-dag:${reportDate}:source-watch-admit`;
  const qualitySummary = await createDailyCodexDagSourceWatchQualityMvp({
    ...options,
    rootDir,
    reportDate,
    now: generatedAt,
    runId
  });

  if (!isPlainObject(qualitySummary.plan) || !Array.isArray(qualitySummary.node_results)) {
    return {
      ...qualitySummary,
      mode: SOURCE_WATCH_ADMIT_MVP_MODE,
      failures: uniqueSorted([...(qualitySummary.failures || []), "daily codex DAG source-watch admit MVP could not build the upstream quality sequence."])
    };
  }

  let manifest = null;
  try {
    const loaded = await loadDailyCodexDag({ rootDir, dagPath: options.dagPath });
    manifest = loaded.manifest;
  } catch (error) {
    return {
      ok: false,
      failures: [`${DEFAULT_DAG_PATH}: ${error.message}`],
      warnings: [],
      validation: null,
      plan: null,
      run: null
    };
  }

  const admitSourceNode = manifest.nodes.find((node) => node.id === SOURCE_WATCH_ADMIT_NODE_ID);
  if (!admitSourceNode) {
    return {
      ok: false,
      failures: [`daily codex DAG source-watch admit MVP missing node ${SOURCE_WATCH_ADMIT_NODE_ID}.`],
      warnings: qualitySummary.validation?.warnings || [],
      validation: qualitySummary.validation || null,
      plan: null,
      run: null
    };
  }

  const admitNode = createSourceWatchAdmitCommandNode({
    sourceNode: admitSourceNode,
    reportDate,
    dependencies: [SOURCE_WATCH_QUALITY_NODE_ID]
  });
  const fixtureManifest = {
    schema_version: manifest.schema_version,
    name: manifest.name,
    description: "Fixture-only executable adapter for the Source Watch collect-to-admit DAG sequence.",
    nodes: [...qualitySummary.plan.nodes, admitNode]
  };
  const plan = projectDailyCodexDagPlan(fixtureManifest);
  await prepareSourceWatchAdmitFixtureArtifacts({ rootDir, reportDate });

  const nodeResults = [...qualitySummary.node_results];
  const executionFailures = [];
  const executedCommands = [...qualitySummary.executed_commands];
  const nodeExecutablePath = options.nodeExecutablePath || options.node_executable_path || process.execPath;
  const qualityResult = nodeResults.find((result) => result.node_id === SOURCE_WATCH_QUALITY_NODE_ID);
  const qualitySucceeded = qualityResult?.status === "success";
  if (qualitySucceeded) {
    const admitExecution = await executeDailyCodexDagCommandNode({
      rootDir,
      reportDate,
      runId,
      manifestName: manifest.name,
      manifestSchemaVersion: manifest.schema_version,
      node: admitNode,
      nodeExecutablePath,
      executeCommand: options.executeCommand,
      startedAt: options.startedAt ?? options.started_at,
      finishedAt: options.finishedAt ?? options.finished_at,
      timeoutSeconds: options.timeoutSeconds ?? options.timeout_seconds,
      dependencyResults: [dependencyResultFromNodeResult(qualityResult)],
      resiliencePolicyRef: admitSourceNode.resilience_policy_ref || ""
    });
    executionFailures.push(...admitExecution.failures);
    if (admitExecution.result) nodeResults.push(admitExecution.result);
    executedCommands.push({
      node_id: SOURCE_WATCH_ADMIT_NODE_ID,
      runner: "node",
      script: SOURCE_WATCH_ADMIT_SCRIPT
    });
  } else {
    nodeResults.push(createBlockedSourceWatchDownstreamNodeResult({
      reportDate,
      runId,
      manifestName: manifest.name,
      manifestSchemaVersion: manifest.schema_version,
      node: admitNode,
      fixtureLabel: "source-watch admit fixture",
      issueSource: "daily-codex-dag-source-watch-admit-fixture",
      dependencyResult: qualityResult
        ? dependencyResultFromNodeResult(qualityResult)
        : {
            node_id: SOURCE_WATCH_QUALITY_NODE_ID,
            execution_id: `${runId}:${SOURCE_WATCH_QUALITY_NODE_ID}:missing-result`,
            status: "failure",
            required: true,
            downstream_disposition: "block"
          }
    }));
  }

  const admitResult = nodeResults.find((result) => result.node_id === SOURCE_WATCH_ADMIT_NODE_ID);
  const admitSucceeded = admitResult?.status === "success";
  const admitted = admitSucceeded
    ? await summarizeSourceWatchAdmitArtifact({ rootDir, reportDate })
    : {
        ok: true,
        failures: [],
        warnings: [],
        summary: {
          ...emptySourceWatchAdmitSummary(),
          artifact_path: SOURCE_WATCH_ADMIT_OUTPUT_ARTIFACT
        }
      };
  const nodeResultValidation = validateSourceWatchAdmitMvpNodeResults({
    plan,
    reportDate,
    runId,
    nodeResults
  });
  const completedNodes = nodeResults
    .filter((result) => result.status === "success")
    .map((result) => result.node_id);
  const blockedNodes = nodeResults
    .filter((result) => result.status === "failure" || result.status === "blocked")
    .map((result) => result.node_id);
  const ok = nodeResults.length === 5
    && nodeResults.every((result) => result.status === "success")
    && nodeResultValidation.ok
    && qualitySummary.source_watch
    && qualitySummary.downstream
    && qualitySummary.normalized
    && qualitySummary.quality
    && admitted.ok;
  const nodeFailureMessages = nodeResults.flatMap((result) => (result.failures || []).map((issue) => issue.message));

  const summary = {
    ok,
    failures: ok ? [] : uniqueSorted([
      ...(qualitySummary.ok ? [] : qualitySummary.failures || []),
      ...executionFailures,
      ...nodeFailureMessages,
      ...nodeResultValidation.failures,
      ...admitted.failures
    ]),
    warnings: uniqueSorted([
      ...(qualitySummary.warnings || []),
      ...nodeResultValidation.warnings,
      ...admitted.warnings
    ]),
    validation: qualitySummary.validation,
    mode: SOURCE_WATCH_ADMIT_MVP_MODE,
    report_date: reportDate,
    generated_at: generatedAt,
    run_id: runId,
    plan,
    run: {
      final_status: ok ? "executed_source_watch_admit" : "blocked",
      levels: plan.levels.map(copyLevel),
      planned_nodes: plan.nodes.map((node) => node.id),
      completed_nodes: completedNodes,
      blocked_nodes: blockedNodes
    },
    source_watch: qualitySummary.source_watch,
    downstream: qualitySummary.downstream,
    normalized: qualitySummary.normalized,
    quality: qualitySummary.quality,
    admitted: admitted.summary,
    node_results: nodeResults,
    node_result_validation: nodeResultValidation,
    executed_commands: executedCommands,
    codex_invocations: [],
    next_action: {
      kind: "wire_admitted_candidates_to_article_index",
      message: "Source Watch admit fixture consumed quality-candidates.json and emitted internal admitted-candidates.json; next wire admitted candidates into the article index contract."
    }
  };
  const summaryValidation = validateDailyCodexDagRunSummary(summary);
  if (!summaryValidation.ok) {
    return {
      ...summary,
      ok: false,
      failures: uniqueSorted([...summary.failures, ...summaryValidation.failures]),
      warnings: uniqueSorted([...summary.warnings, ...summaryValidation.warnings])
    };
  }
  return summary;
}

export async function createDailyCodexDagTwoNodeFixtureMvp(options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const reportDate = requiredReportDate(options.reportDate || options.date);
  const generatedAt = toIsoTimestamp(options.now || new Date());
  const runId = options.runId || options.run_id || `daily-codex-dag:${reportDate}:two-node-fixture`;

  let manifest = null;
  try {
    const loaded = await loadDailyCodexDag({ rootDir, dagPath: options.dagPath });
    manifest = loaded.manifest;
  } catch (error) {
    return {
      ok: false,
      failures: [`${DEFAULT_DAG_PATH}: ${error.message}`],
      warnings: [],
      validation: null,
      plan: null,
      run: null
    };
  }

  const validation = await validateDailyCodexDag({ rootDir, dagPath: options.dagPath, manifest });
  if (!validation.ok) {
    return {
      ok: false,
      failures: validation.failures,
      warnings: validation.warnings,
      validation,
      plan: null,
      run: null
    };
  }

  const sourceNodes = TWO_NODE_FIXTURE_NODE_IDS.map((nodeId) => manifest.nodes.find((node) => node.id === nodeId));
  const missingNodeId = TWO_NODE_FIXTURE_NODE_IDS.find((nodeId, index) => !sourceNodes[index]);
  if (missingNodeId) {
    return {
      ok: false,
      failures: [`daily codex DAG two-node fixture MVP missing node ${missingNodeId}.`],
      warnings: validation.warnings,
      validation,
      plan: null,
      run: null
    };
  }

  const [classifySourceNode, scoreSourceNode] = sourceNodes;
  const executableNodes = [
    createRealNodeAdapterCommandNode({ sourceNode: classifySourceNode, reportDate, dependencies: [] }),
    createRealNodeAdapterCommandNode({ sourceNode: scoreSourceNode, reportDate, dependencies: [TWO_NODE_FIXTURE_CLASSIFY_NODE_ID] })
  ];
  const fixtureManifest = {
    schema_version: manifest.schema_version,
    name: manifest.name,
    description: "Fixture-only executable adapter for the classify-to-score DAG sequence.",
    nodes: executableNodes
  };
  const plan = projectDailyCodexDagPlan(fixtureManifest);

  await prepareTwoNodeFixtureArtifacts({ rootDir, reportDate, classifySourceNode, scoreSourceNode });

  const nodeResults = [];
  const executionFailures = [];
  const executedCommands = [];
  const nodeExecutablePath = options.nodeExecutablePath || options.node_executable_path || process.execPath;
  const classifyExecution = await executeDailyCodexDagCommandNode({
    rootDir,
    reportDate,
    runId,
    manifestName: manifest.name,
    manifestSchemaVersion: manifest.schema_version,
    node: executableNodes[0],
    nodeExecutablePath,
    executeCommand: options.executeCommand,
    startedAt: options.startedAt ?? options.started_at,
    finishedAt: options.finishedAt ?? options.finished_at,
    timeoutSeconds: options.timeoutSeconds ?? options.timeout_seconds,
    dependencyResults: [],
    resiliencePolicyRef: classifySourceNode.resilience_policy_ref || ""
  });
  executionFailures.push(...classifyExecution.failures);
  if (classifyExecution.result) nodeResults.push(classifyExecution.result);
  executedCommands.push({
    node_id: TWO_NODE_FIXTURE_CLASSIFY_NODE_ID,
    runner: "node",
    script: REAL_NODE_ADAPTER_SCRIPT
  });

  if (classifyExecution.ok && classifyExecution.result?.status === "success") {
    const scoreExecution = await executeDailyCodexDagCommandNode({
      rootDir,
      reportDate,
      runId,
      manifestName: manifest.name,
      manifestSchemaVersion: manifest.schema_version,
      node: executableNodes[1],
      nodeExecutablePath,
      executeCommand: options.executeCommand,
      startedAt: options.startedAt ?? options.started_at,
      finishedAt: options.finishedAt ?? options.finished_at,
      timeoutSeconds: options.timeoutSeconds ?? options.timeout_seconds,
      dependencyResults: [dependencyResultFromNodeResult(classifyExecution.result)],
      resiliencePolicyRef: scoreSourceNode.resilience_policy_ref || ""
    });
    executionFailures.push(...scoreExecution.failures);
    if (scoreExecution.result) nodeResults.push(scoreExecution.result);
    executedCommands.push({
      node_id: TWO_NODE_FIXTURE_SCORE_NODE_ID,
      runner: "node",
      script: REAL_NODE_ADAPTER_SCRIPT
    });
  } else {
    nodeResults.push(createBlockedTwoNodeFixtureNodeResult({
      reportDate,
      runId,
      manifestName: manifest.name,
      manifestSchemaVersion: manifest.schema_version,
      node: executableNodes[1],
      dependencyResult: classifyExecution.result
        ? dependencyResultFromNodeResult(classifyExecution.result)
        : {
            node_id: TWO_NODE_FIXTURE_CLASSIFY_NODE_ID,
            execution_id: `${runId}:${TWO_NODE_FIXTURE_CLASSIFY_NODE_ID}:missing-result`,
            status: "failure",
            required: true,
            downstream_disposition: "block"
          }
    }));
  }

  const nodeResultValidation = validateTwoNodeFixtureMvpNodeResults({
    plan,
    reportDate,
    runId,
    nodeResults
  });
  const completedNodes = nodeResults
    .filter((result) => result.status === "success")
    .map((result) => result.node_id);
  const blockedNodes = nodeResults
    .filter((result) => result.status === "failure" || result.status === "blocked")
    .map((result) => result.node_id);
  const ok = nodeResults.length === 2
    && nodeResults.every((result) => result.status === "success")
    && nodeResultValidation.ok;
  const nodeFailureMessages = nodeResults.flatMap((result) => (result.failures || []).map((issue) => issue.message));

  return {
    ok,
    failures: ok ? [] : uniqueSorted([...executionFailures, ...nodeFailureMessages, ...nodeResultValidation.failures]),
    warnings: uniqueSorted([...validation.warnings, ...nodeResultValidation.warnings]),
    validation,
    mode: TWO_NODE_FIXTURE_MVP_MODE,
    report_date: reportDate,
    generated_at: generatedAt,
    run_id: runId,
    plan,
    run: {
      final_status: ok ? "executed_two_node_fixture" : "blocked",
      levels: plan.levels.map(copyLevel),
      planned_nodes: plan.nodes.map((node) => node.id),
      completed_nodes: completedNodes,
      blocked_nodes: blockedNodes
    },
    node_results: nodeResults,
    node_result_validation: nodeResultValidation,
    executed_commands: executedCommands,
    codex_invocations: [],
    next_action: {
      kind: "add_artifact_business_schema_validation",
      message: "Two-node fixture DAG sequence proved dependency-ordered artifact handoff; next add business-schema artifact validation or a third real node."
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

  if (summary.mode === EXECUTABLE_NODE_MVP_MODE) {
    validateExecutableNodeMvpSummary(summary, failures);
    return { ok: failures.length === 0, failures, warnings };
  }
  if (summary.mode === REAL_NODE_ADAPTER_MVP_MODE) {
    validateRealNodeAdapterMvpSummary(summary, failures);
    return { ok: failures.length === 0, failures, warnings };
  }
  if (summary.mode === SOURCE_WATCH_COLLECT_MVP_MODE) {
    validateSourceWatchCollectMvpSummary(summary, failures);
    return { ok: failures.length === 0, failures, warnings };
  }
  if (summary.mode === SOURCE_WATCH_DOWNSTREAM_MVP_MODE) {
    validateSourceWatchDownstreamMvpSummary(summary, failures);
    return { ok: failures.length === 0, failures, warnings };
  }
  if (summary.mode === SOURCE_WATCH_NORMALIZE_MVP_MODE) {
    validateSourceWatchNormalizeMvpSummary(summary, failures);
    return { ok: failures.length === 0, failures, warnings };
  }
  if (summary.mode === SOURCE_WATCH_QUALITY_MVP_MODE) {
    validateSourceWatchQualityMvpSummary(summary, failures);
    return { ok: failures.length === 0, failures, warnings };
  }
  if (summary.mode === SOURCE_WATCH_ADMIT_MVP_MODE) {
    validateSourceWatchAdmitMvpSummary(summary, failures);
    return { ok: failures.length === 0, failures, warnings };
  }
  if (summary.mode === TWO_NODE_FIXTURE_MVP_MODE) {
    validateTwoNodeFixtureMvpSummary(summary, failures);
    return { ok: failures.length === 0, failures, warnings };
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
    await validateNodeExecutionPolicy({ rootDir, node, resiliencePolicy, failures, checkedFiles });
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

function createSyntheticExecutableNodeManifest({ reportDate } = {}) {
  return {
    schema_version: 1,
    name: "daily-codex-dag-contract",
    description: "Synthetic executable-node MVP artifact I/O fixture.",
    nodes: [createSyntheticExecutableCommandNode({ reportDate })]
  };
}

function createSyntheticExecutableCommandNode({ reportDate } = {}) {
  const inputArtifacts = [{ path: SYNTHETIC_EXECUTABLE_INPUT_ARTIFACT, required: true }];
  const outputArtifacts = [{ path: SYNTHETIC_EXECUTABLE_OUTPUT_ARTIFACT, required: true }];
  const outputArtifactPath = materializeArtifactPath({
    templatePath: SYNTHETIC_EXECUTABLE_OUTPUT_ARTIFACT,
    reportDate
  });

  return {
    id: SYNTHETIC_EXECUTABLE_NODE_ID,
    title: "Synthetic command node",
    kind: "command",
    execution_status: "planned",
    execution_contract: {
      readiness: "node_executable",
      summary: "Synthetic command fixture for executable-node MVP artifact I/O.",
      node_execution_spec: {
        executor: "command",
        cwd: ".",
        timeout_seconds: 30,
        invocation: {
          kind: "command",
          argv: [
            "node",
            SYNTHETIC_EXECUTABLE_SCRIPT,
            "--dry-run",
            "--date",
            reportDate,
            "--json",
            "--summary-path",
            outputArtifactPath
          ]
        },
        inputs: inputArtifacts,
        outputs: outputArtifacts
      }
    },
    dependencies: [],
    inputs: inputArtifacts,
    outputs: outputArtifacts,
    runner_stage_ref: "synthetic:artifact-io",
    parallel_group: "mvp-fixture",
    public_artifact: false,
    owner_path_scope: "internal_workdir"
  };
}

async function prepareSyntheticExecutableArtifacts({ rootDir, reportDate }) {
  const inputPath = path.resolve(rootDir, materializeArtifactPath({
    templatePath: SYNTHETIC_EXECUTABLE_INPUT_ARTIFACT,
    reportDate
  }));
  const outputPath = path.resolve(rootDir, materializeArtifactPath({
    templatePath: SYNTHETIC_EXECUTABLE_OUTPUT_ARTIFACT,
    reportDate
  }));
  await fs.mkdir(path.dirname(inputPath), { recursive: true });
  await fs.writeFile(inputPath, `${JSON.stringify({
    schema_version: 1,
    mode: "daily_codex_dag_executable_node_mvp_input",
    report_date: reportDate,
    node_id: SYNTHETIC_EXECUTABLE_NODE_ID
  }, null, 2)}\n`, "utf8");
  await fs.rm(outputPath, { force: true });
}

function createRealNodeAdapterCommandNode({ sourceNode, reportDate, dependencies }) {
  const inputArtifacts = (sourceNode.inputs || []).map(copyArtifact);
  const outputArtifacts = (sourceNode.outputs || []).map(copyArtifact);
  const inputArtifactPath = materializeArtifactPath({
    templatePath: inputArtifacts[0]?.path || "",
    reportDate
  });
  const outputArtifactPath = materializeArtifactPath({
    templatePath: outputArtifacts[0]?.path || "",
    reportDate
  });

  return {
    id: sourceNode.id,
    title: sourceNode.title,
    kind: sourceNode.kind,
    execution_status: sourceNode.execution_status,
    execution_contract: {
      readiness: "node_executable",
      summary: `Fixture-only executable adapter for real DAG node ${sourceNode.id}.`,
      node_execution_spec: {
        executor: "command",
        cwd: ".",
        timeout_seconds: 30,
        invocation: {
          kind: "command",
          argv: [
            "node",
            REAL_NODE_ADAPTER_SCRIPT,
            "--node",
            sourceNode.id,
            "--date",
            reportDate,
            "--input",
            inputArtifactPath,
            "--output",
            outputArtifactPath,
            "--json"
          ]
        },
        inputs: inputArtifacts,
        outputs: outputArtifacts
      }
    },
    dependencies: Array.isArray(dependencies) ? [...dependencies] : [...(sourceNode.dependencies || [])],
    inputs: inputArtifacts,
    outputs: outputArtifacts,
    runner_stage_ref: sourceNode.runner_stage_ref,
    parallel_group: sourceNode.parallel_group,
    public_artifact: sourceNode.public_artifact,
    owner_path_scope: sourceNode.owner_path_scope
  };
}

function createSourceWatchCollectCommandNode({
  sourceNode,
  reportDate,
  generatedAt,
  watchlistPath,
  fixtureDir,
  endpointLimit
}) {
  const outputArtifacts = (sourceNode.outputs || []).map(copyArtifact);
  const outputArtifactPath = materializeArtifactPath({
    templatePath: outputArtifacts[0]?.path || SOURCE_WATCH_COLLECT_OUTPUT_ARTIFACT,
    reportDate
  });
  const argv = [
    "node",
    SOURCE_WATCH_COLLECT_SCRIPT,
    "--date",
    reportDate,
    "--generated-at",
    generatedAt,
    "--config",
    watchlistPath,
    "--fixture-dir",
    fixtureDir,
    "--output",
    outputArtifactPath,
    "--json"
  ];
  if (Number.isInteger(endpointLimit) && endpointLimit > 0) {
    argv.push("--endpoint-limit", String(endpointLimit));
  }

  return {
    id: sourceNode.id,
    title: sourceNode.title,
    kind: sourceNode.kind,
    execution_status: sourceNode.execution_status,
    execution_contract: {
      readiness: "node_executable",
      summary: "Fixture-only executable adapter for the Source Watch collect/context lane.",
      node_execution_spec: {
        executor: "command",
        cwd: ".",
        timeout_seconds: 60,
        invocation: {
          kind: "command",
          argv
        },
        inputs: [],
        outputs: outputArtifacts
      }
    },
    dependencies: [],
    inputs: [],
    outputs: outputArtifacts,
    runner_stage_ref: sourceNode.runner_stage_ref,
    parallel_group: sourceNode.parallel_group,
    public_artifact: sourceNode.public_artifact,
    owner_path_scope: sourceNode.owner_path_scope
  };
}

function createSourceWatchDownstreamCommandNode({ sourceNode, reportDate, dependencies }) {
  const inputArtifacts = (sourceNode.inputs || []).map(copyArtifact);
  const outputArtifacts = (sourceNode.outputs || []).map(copyArtifact);
  const inputArtifactPath = materializeArtifactPath({
    templatePath: inputArtifacts[0]?.path || SOURCE_WATCH_COLLECT_OUTPUT_ARTIFACT,
    reportDate
  });
  const outputArtifactPath = materializeArtifactPath({
    templatePath: outputArtifacts[0]?.path || SOURCE_WATCH_DOWNSTREAM_OUTPUT_ARTIFACT,
    reportDate
  });

  return {
    id: sourceNode.id,
    title: sourceNode.title,
    kind: sourceNode.kind,
    execution_status: sourceNode.execution_status,
    execution_contract: {
      readiness: "node_executable",
      summary: "Fixture-only executable adapter for Source Watch parse/extract consumption.",
      node_execution_spec: {
        executor: "command",
        cwd: ".",
        timeout_seconds: 30,
        invocation: {
          kind: "command",
          argv: [
            "node",
            SOURCE_WATCH_DOWNSTREAM_SCRIPT,
            "--date",
            reportDate,
            "--input",
            inputArtifactPath,
            "--output",
            outputArtifactPath,
            "--json"
          ]
        },
        inputs: inputArtifacts,
        outputs: outputArtifacts
      }
    },
    dependencies: Array.isArray(dependencies) ? [...dependencies] : [...(sourceNode.dependencies || [])],
    inputs: inputArtifacts,
    outputs: outputArtifacts,
    runner_stage_ref: sourceNode.runner_stage_ref,
    parallel_group: sourceNode.parallel_group,
    resilience_policy_ref: sourceNode.resilience_policy_ref || "",
    public_artifact: sourceNode.public_artifact,
    owner_path_scope: sourceNode.owner_path_scope
  };
}

function createSourceWatchNormalizeCommandNode({ sourceNode, reportDate, dependencies }) {
  const inputArtifacts = (sourceNode.inputs || []).map(copyArtifact);
  const outputArtifacts = (sourceNode.outputs || []).map(copyArtifact);
  const inputArtifactPath = materializeArtifactPath({
    templatePath: inputArtifacts[0]?.path || SOURCE_WATCH_DOWNSTREAM_OUTPUT_ARTIFACT,
    reportDate
  });
  const outputArtifactPath = materializeArtifactPath({
    templatePath: outputArtifacts[0]?.path || SOURCE_WATCH_NORMALIZE_OUTPUT_ARTIFACT,
    reportDate
  });

  return {
    id: sourceNode.id,
    title: sourceNode.title,
    kind: "command",
    execution_status: sourceNode.execution_status,
    execution_contract: {
      readiness: "node_executable",
      summary: "Fixture-only executable adapter for Source Watch normalize/canonicalize consumption.",
      node_execution_spec: {
        executor: "command",
        cwd: ".",
        timeout_seconds: 30,
        invocation: {
          kind: "command",
          argv: [
            "node",
            SOURCE_WATCH_NORMALIZE_SCRIPT,
            "--date",
            reportDate,
            "--input",
            inputArtifactPath,
            "--output",
            outputArtifactPath,
            "--json"
          ]
        },
        inputs: inputArtifacts,
        outputs: outputArtifacts
      }
    },
    dependencies: Array.isArray(dependencies) ? [...dependencies] : [...(sourceNode.dependencies || [])],
    inputs: inputArtifacts,
    outputs: outputArtifacts,
    runner_stage_ref: sourceNode.runner_stage_ref,
    parallel_group: sourceNode.parallel_group,
    resilience_policy_ref: sourceNode.resilience_policy_ref || "",
    public_artifact: sourceNode.public_artifact,
    owner_path_scope: sourceNode.owner_path_scope
  };
}

function createSourceWatchQualityCommandNode({ sourceNode, reportDate, dependencies, historyPath }) {
  const inputArtifacts = [{ path: SOURCE_WATCH_NORMALIZE_OUTPUT_ARTIFACT, required: true }];
  const outputArtifacts = [{ path: SOURCE_WATCH_QUALITY_OUTPUT_ARTIFACT, required: true }];
  const inputArtifactPath = materializeArtifactPath({
    templatePath: SOURCE_WATCH_NORMALIZE_OUTPUT_ARTIFACT,
    reportDate
  });
  const outputArtifactPath = materializeArtifactPath({
    templatePath: SOURCE_WATCH_QUALITY_OUTPUT_ARTIFACT,
    reportDate
  });

  return {
    id: sourceNode.id,
    title: sourceNode.title,
    kind: "command",
    execution_status: sourceNode.execution_status,
    execution_contract: {
      readiness: "node_executable",
      summary: "Fixture-only executable adapter for Source Watch quality suppression and freshness checks.",
      node_execution_spec: {
        executor: "command",
        cwd: ".",
        timeout_seconds: 30,
        invocation: {
          kind: "command",
          argv: [
            "node",
            SOURCE_WATCH_QUALITY_SCRIPT,
            "--date",
            reportDate,
            "--input",
            inputArtifactPath,
            "--output",
            outputArtifactPath,
            "--history",
            historyPath,
            "--json"
          ]
        },
        inputs: inputArtifacts,
        outputs: outputArtifacts
      }
    },
    dependencies: Array.isArray(dependencies) ? [...dependencies] : [SOURCE_WATCH_NORMALIZE_NODE_ID],
    inputs: inputArtifacts,
    outputs: outputArtifacts,
    runner_stage_ref: sourceNode.runner_stage_ref,
    parallel_group: sourceNode.parallel_group,
    resilience_policy_ref: sourceNode.resilience_policy_ref || "",
    public_artifact: sourceNode.public_artifact,
    owner_path_scope: sourceNode.owner_path_scope
  };
}

function createSourceWatchAdmitCommandNode({ sourceNode, reportDate, dependencies }) {
  const inputArtifacts = [{ path: SOURCE_WATCH_QUALITY_OUTPUT_ARTIFACT, required: true }];
  const outputArtifacts = [{ path: SOURCE_WATCH_ADMIT_OUTPUT_ARTIFACT, required: true }];
  const inputArtifactPath = materializeArtifactPath({
    templatePath: SOURCE_WATCH_QUALITY_OUTPUT_ARTIFACT,
    reportDate
  });
  const outputArtifactPath = materializeArtifactPath({
    templatePath: SOURCE_WATCH_ADMIT_OUTPUT_ARTIFACT,
    reportDate
  });

  return {
    id: sourceNode.id,
    title: sourceNode.title,
    kind: "command",
    execution_status: sourceNode.execution_status,
    execution_contract: {
      readiness: "node_executable",
      summary: "Fixture-only executable adapter for admitted Source Watch candidate handoff.",
      node_execution_spec: {
        executor: "command",
        cwd: ".",
        timeout_seconds: 30,
        invocation: {
          kind: "command",
          argv: [
            "node",
            SOURCE_WATCH_ADMIT_SCRIPT,
            "--date",
            reportDate,
            "--input",
            inputArtifactPath,
            "--output",
            outputArtifactPath,
            "--json"
          ]
        },
        inputs: inputArtifacts,
        outputs: outputArtifacts
      }
    },
    dependencies: Array.isArray(dependencies) ? [...dependencies] : [SOURCE_WATCH_QUALITY_NODE_ID],
    inputs: inputArtifacts,
    outputs: outputArtifacts,
    runner_stage_ref: sourceNode.runner_stage_ref,
    parallel_group: sourceNode.parallel_group,
    resilience_policy_ref: sourceNode.resilience_policy_ref || "",
    public_artifact: sourceNode.public_artifact,
    owner_path_scope: sourceNode.owner_path_scope
  };
}

async function prepareSourceWatchCollectFixtureArtifacts({ rootDir, reportDate, sourceNode }) {
  const outputArtifact = sourceNode.outputs?.[0] || {};
  const outputPath = path.resolve(rootDir, materializeArtifactPath({
    templatePath: outputArtifact.path || SOURCE_WATCH_COLLECT_OUTPUT_ARTIFACT,
    reportDate
  }));
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.rm(outputPath, { force: true });
}

async function prepareSourceWatchDownstreamFixtureArtifacts({ rootDir, reportDate, collectSourceNode, downstreamSourceNode }) {
  await prepareSourceWatchCollectFixtureArtifacts({ rootDir, reportDate, sourceNode: collectSourceNode });
  const outputArtifact = downstreamSourceNode.outputs?.[0] || {};
  const outputPath = path.resolve(rootDir, materializeArtifactPath({
    templatePath: outputArtifact.path || SOURCE_WATCH_DOWNSTREAM_OUTPUT_ARTIFACT,
    reportDate
  }));
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.rm(outputPath, { force: true });
}

async function prepareSourceWatchNormalizeFixtureArtifacts({ rootDir, reportDate, collectSourceNode, downstreamSourceNode, normalizeSourceNode }) {
  await prepareSourceWatchDownstreamFixtureArtifacts({ rootDir, reportDate, collectSourceNode, downstreamSourceNode });
  const outputArtifact = normalizeSourceNode.outputs?.[0] || {};
  const outputPath = path.resolve(rootDir, materializeArtifactPath({
    templatePath: outputArtifact.path || SOURCE_WATCH_NORMALIZE_OUTPUT_ARTIFACT,
    reportDate
  }));
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.rm(outputPath, { force: true });
}

async function prepareSourceWatchQualityFixtureArtifacts({ rootDir, reportDate }) {
  const outputPath = path.resolve(rootDir, materializeArtifactPath({
    templatePath: SOURCE_WATCH_QUALITY_OUTPUT_ARTIFACT,
    reportDate
  }));
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.rm(outputPath, { force: true });
}

async function prepareSourceWatchAdmitFixtureArtifacts({ rootDir, reportDate }) {
  const outputPath = path.resolve(rootDir, materializeArtifactPath({
    templatePath: SOURCE_WATCH_ADMIT_OUTPUT_ARTIFACT,
    reportDate
  }));
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.rm(outputPath, { force: true });
}

async function summarizeSourceWatchCollectArtifact({ rootDir, reportDate, sourceNode }) {
  const outputArtifact = sourceNode.outputs?.[0] || {};
  const declaredArtifactPath = outputArtifact.path || SOURCE_WATCH_COLLECT_OUTPUT_ARTIFACT;
  const materializedArtifactPath = materializeArtifactPath({
    templatePath: declaredArtifactPath,
    reportDate
  });
  const summary = emptySourceWatchCollectSummary();
  summary.artifact_path = declaredArtifactPath;
  try {
    const payload = JSON.parse(await fs.readFile(path.resolve(rootDir, materializedArtifactPath), "utf8"));
    const githubAudit = isPlainObject(payload.source_audit?.github_watch) ? payload.source_audit.github_watch : {};
    const siteAudit = isPlainObject(payload.source_audit?.site_watch) ? payload.source_audit.site_watch : {};
    const githubSources = Array.isArray(githubAudit.sources) ? githubAudit.sources : [];
    const siteSources = Array.isArray(siteAudit.sources) ? siteAudit.sources : [];
    const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
    const githubCandidates = candidates.filter((candidate) => candidate?.signal === "github_watch").length;
    const siteCandidates = candidates.filter((candidate) => candidate?.signal === "site_watch").length;
    const failureCount = [...githubSources, ...siteSources].filter((source) => source?.status === "blocked" || source?.status === "failed").length;

    return {
      ok: true,
      failures: [],
      warnings: [],
      summary: {
        ...summary,
        artifact_kind: nonBlankString(payload.kind) ? payload.kind : "",
        watched_repos: nonNegativeIntegerOrZero(githubAudit.watched_repos),
        fetched_repos: nonNegativeIntegerOrZero(githubAudit.fetched_repos),
        changed_repos: nonNegativeIntegerOrZero(githubAudit.changed_repos),
        watched_sites: nonNegativeIntegerOrZero(siteAudit.watched_sites),
        fetched_sites: nonNegativeIntegerOrZero(siteAudit.fetched_sites),
        github_candidates_found: nonNegativeIntegerOrZero(githubAudit.candidates_found ?? githubCandidates),
        site_candidates_found: nonNegativeIntegerOrZero(siteAudit.candidates_found ?? siteCandidates),
        total_candidates_found: candidates.length,
        failure_count: failureCount,
        empty: candidates.length === 0,
        rate_limits: githubSources
          .map(sourceWatchRateLimitSnapshot)
          .filter((snapshot) => snapshot !== null)
      }
    };
  } catch (error) {
    return {
      ok: false,
      failures: [`source-watch collect artifact ${materializedArtifactPath} could not be summarized: ${error.message}`],
      warnings: [],
      summary
    };
  }
}

async function summarizeSourceWatchDownstreamArtifact({ rootDir, reportDate, sourceNode }) {
  const outputArtifact = sourceNode.outputs?.[0] || {};
  const declaredArtifactPath = outputArtifact.path || SOURCE_WATCH_DOWNSTREAM_OUTPUT_ARTIFACT;
  const materializedArtifactPath = materializeArtifactPath({
    templatePath: declaredArtifactPath,
    reportDate
  });
  const summary = emptySourceWatchDownstreamSummary();
  summary.artifact_path = declaredArtifactPath;
  try {
    const payload = JSON.parse(await fs.readFile(path.resolve(rootDir, materializedArtifactPath), "utf8"));
    const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
    const signalCounts = isPlainObject(payload.signal_counts) ? payload.signal_counts : {};
    const githubCount = nonNegativeIntegerOrZero(signalCounts.github_watch);
    const siteCount = nonNegativeIntegerOrZero(signalCounts.site_watch);

    return {
      ok: true,
      failures: [],
      warnings: [],
      summary: {
        ...summary,
        artifact_kind: nonBlankString(payload.kind) ? payload.kind : "",
        input_kind: nonBlankString(payload.input_kind) ? payload.input_kind : "",
        total_candidates: candidates.length,
        github_watch_candidates: githubCount,
        site_watch_candidates: siteCount,
        other_candidates: Math.max(0, candidates.length - githubCount - siteCount),
        empty: candidates.length === 0,
        signals: uniqueSorted(candidates.map((candidate) => candidate?.signal).filter((signal) => typeof signal === "string" && signal))
      }
    };
  } catch (error) {
    return {
      ok: false,
      failures: [`source-watch downstream artifact ${materializedArtifactPath} could not be summarized: ${error.message}`],
      warnings: [],
      summary
    };
  }
}

async function summarizeSourceWatchNormalizeArtifact({ rootDir, reportDate, sourceNode }) {
  const outputArtifact = sourceNode.outputs?.[0] || {};
  const declaredArtifactPath = outputArtifact.path || SOURCE_WATCH_NORMALIZE_OUTPUT_ARTIFACT;
  const materializedArtifactPath = materializeArtifactPath({
    templatePath: declaredArtifactPath,
    reportDate
  });
  const summary = emptySourceWatchNormalizeSummary();
  summary.artifact_path = declaredArtifactPath;
  try {
    const payload = JSON.parse(await fs.readFile(path.resolve(rootDir, materializedArtifactPath), "utf8"));
    const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
    const signalCounts = isPlainObject(payload.signal_counts) ? payload.signal_counts : {};
    const githubCount = nonNegativeIntegerOrZero(signalCounts.github_watch);
    const siteCount = nonNegativeIntegerOrZero(signalCounts.site_watch);

    return {
      ok: true,
      failures: [],
      warnings: [],
      summary: {
        ...summary,
        artifact_kind: nonBlankString(payload.kind) ? payload.kind : "",
        input_kind: nonBlankString(payload.input_kind) ? payload.input_kind : "",
        total_candidates: candidates.length,
        github_watch_candidates: githubCount,
        site_watch_candidates: siteCount,
        other_candidates: Math.max(0, candidates.length - githubCount - siteCount),
        empty: candidates.length === 0,
        signals: uniqueSorted(candidates.map((candidate) => candidate?.signal).filter((signal) => typeof signal === "string" && signal))
      }
    };
  } catch (error) {
    return {
      ok: false,
      failures: [`source-watch normalize artifact ${materializedArtifactPath} could not be summarized: ${error.message}`],
      warnings: [],
      summary
    };
  }
}

async function summarizeSourceWatchQualityArtifact({ rootDir, reportDate }) {
  const declaredArtifactPath = SOURCE_WATCH_QUALITY_OUTPUT_ARTIFACT;
  const materializedArtifactPath = materializeArtifactPath({
    templatePath: declaredArtifactPath,
    reportDate
  });
  const summary = emptySourceWatchQualitySummary();
  summary.artifact_path = declaredArtifactPath;
  try {
    const payload = JSON.parse(await fs.readFile(path.resolve(rootDir, materializedArtifactPath), "utf8"));
    const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
    const signalCounts = isPlainObject(payload.signal_counts) ? payload.signal_counts : {};
    const qualityAudit = isPlainObject(payload.quality_audit) ? payload.quality_audit : {};
    const githubCount = nonNegativeIntegerOrZero(signalCounts.github_watch);
    const siteCount = nonNegativeIntegerOrZero(signalCounts.site_watch);

    return {
      ok: true,
      failures: [],
      warnings: [],
      summary: {
        ...summary,
        artifact_kind: nonBlankString(payload.kind) ? payload.kind : "",
        input_kind: nonBlankString(payload.input_kind) ? payload.input_kind : "",
        total_candidates: candidates.length,
        admitted_candidates: nonNegativeIntegerOrZero(payload.admitted_count),
        suppressed_candidates: nonNegativeIntegerOrZero(payload.suppressed_count),
        duplicate_candidates: nonNegativeIntegerOrZero(payload.duplicate_count),
        stale_candidates: nonNegativeIntegerOrZero(payload.stale_count),
        unchanged_repo_candidates: nonNegativeIntegerOrZero(payload.unchanged_repo_count),
        github_watch_candidates: githubCount,
        site_watch_candidates: siteCount,
        other_candidates: Math.max(0, candidates.length - githubCount - siteCount),
        empty: candidates.length === 0,
        signals: uniqueSorted(candidates.map((candidate) => candidate?.signal).filter((signal) => typeof signal === "string" && signal)),
        suppressed_reasons: Array.isArray(qualityAudit.suppressed_reasons)
          ? uniqueSorted(qualityAudit.suppressed_reasons)
          : [],
        public_surface: qualityAudit.public_surface === true
      }
    };
  } catch (error) {
    return {
      ok: false,
      failures: [`source-watch quality artifact ${materializedArtifactPath} could not be summarized: ${error.message}`],
      warnings: [],
      summary
    };
  }
}

async function summarizeSourceWatchAdmitArtifact({ rootDir, reportDate }) {
  const declaredArtifactPath = SOURCE_WATCH_ADMIT_OUTPUT_ARTIFACT;
  const materializedArtifactPath = materializeArtifactPath({
    templatePath: declaredArtifactPath,
    reportDate
  });
  const summary = emptySourceWatchAdmitSummary();
  summary.artifact_path = declaredArtifactPath;
  try {
    const payload = JSON.parse(await fs.readFile(path.resolve(rootDir, materializedArtifactPath), "utf8"));
    const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
    const signalCounts = isPlainObject(payload.signal_counts) ? payload.signal_counts : {};
    const githubCount = nonNegativeIntegerOrZero(signalCounts.github_watch);
    const siteCount = nonNegativeIntegerOrZero(signalCounts.site_watch);

    return {
      ok: true,
      failures: [],
      warnings: [],
      summary: {
        ...summary,
        artifact_kind: nonBlankString(payload.kind) ? payload.kind : "",
        input_kind: nonBlankString(payload.input_kind) ? payload.input_kind : "",
        total_candidates: candidates.length,
        github_watch_candidates: githubCount,
        site_watch_candidates: siteCount,
        other_candidates: Math.max(0, candidates.length - githubCount - siteCount),
        empty: candidates.length === 0,
        signals: uniqueSorted(candidates.map((candidate) => candidate?.signal).filter((signal) => typeof signal === "string" && signal)),
        public_surface: payload.public_surface === true || payload.admission_audit?.public_surface === true
      }
    };
  } catch (error) {
    return {
      ok: false,
      failures: [`source-watch admitted artifact ${materializedArtifactPath} could not be summarized: ${error.message}`],
      warnings: [],
      summary
    };
  }
}

function emptySourceWatchCollectSummary() {
  return {
    artifact_path: "",
    artifact_kind: "source_watch_candidates",
    watched_repos: 0,
    fetched_repos: 0,
    changed_repos: 0,
    watched_sites: 0,
    fetched_sites: 0,
    github_candidates_found: 0,
    site_candidates_found: 0,
    total_candidates_found: 0,
    failure_count: 0,
    empty: true,
    rate_limits: []
  };
}

function emptySourceWatchDownstreamSummary() {
  return {
    artifact_path: "",
    artifact_kind: "source_watch_extracted_candidates",
    input_kind: "source_watch_candidates",
    total_candidates: 0,
    github_watch_candidates: 0,
    site_watch_candidates: 0,
    other_candidates: 0,
    empty: true,
    signals: []
  };
}

function emptySourceWatchNormalizeSummary() {
  return {
    artifact_path: "",
    artifact_kind: "source_watch_canonical_candidates",
    input_kind: "source_watch_extracted_candidates",
    total_candidates: 0,
    github_watch_candidates: 0,
    site_watch_candidates: 0,
    other_candidates: 0,
    empty: true,
    signals: []
  };
}

function emptySourceWatchQualitySummary() {
  return {
    artifact_path: "",
    artifact_kind: "source_watch_quality_candidates",
    input_kind: "source_watch_canonical_candidates",
    total_candidates: 0,
    admitted_candidates: 0,
    suppressed_candidates: 0,
    duplicate_candidates: 0,
    stale_candidates: 0,
    unchanged_repo_candidates: 0,
    github_watch_candidates: 0,
    site_watch_candidates: 0,
    other_candidates: 0,
    empty: true,
    signals: [],
    suppressed_reasons: [],
    public_surface: false
  };
}

function emptySourceWatchAdmitSummary() {
  return {
    artifact_path: "",
    artifact_kind: "source_watch_admitted_candidates",
    input_kind: "source_watch_quality_candidates",
    total_candidates: 0,
    github_watch_candidates: 0,
    site_watch_candidates: 0,
    other_candidates: 0,
    empty: true,
    signals: [],
    public_surface: false
  };
}

function sourceWatchRateLimitSnapshot(source) {
  if (!isPlainObject(source?.rate_limit)) return null;
  return {
    repo: nonBlankString(source.repo) ? source.repo : "",
    limit: nonBlankString(source.rate_limit.limit) ? source.rate_limit.limit : "",
    remaining: nonBlankString(source.rate_limit.remaining) ? source.rate_limit.remaining : "",
    used: nonBlankString(source.rate_limit.used) ? source.rate_limit.used : "",
    reset: nonBlankString(source.rate_limit.reset) ? source.rate_limit.reset : "",
    resource: nonBlankString(source.rate_limit.resource) ? source.rate_limit.resource : ""
  };
}

async function prepareTwoNodeFixtureArtifacts({ rootDir, reportDate, classifySourceNode, scoreSourceNode }) {
  const classifyInputArtifact = classifySourceNode.inputs?.[0] || {};
  const classifyOutputArtifact = classifySourceNode.outputs?.[0] || {};
  const scoreOutputArtifact = scoreSourceNode.outputs?.[0] || {};
  const classifyInputPath = path.resolve(rootDir, materializeArtifactPath({
    templatePath: classifyInputArtifact.path || "",
    reportDate
  }));
  const classifyOutputPath = path.resolve(rootDir, materializeArtifactPath({
    templatePath: classifyOutputArtifact.path || "",
    reportDate
  }));
  const scoreOutputPath = path.resolve(rootDir, materializeArtifactPath({
    templatePath: scoreOutputArtifact.path || "",
    reportDate
  }));

  await fs.mkdir(path.dirname(classifyInputPath), { recursive: true });
  await fs.writeFile(classifyInputPath, `${JSON.stringify({
    schema_version: 1,
    mode: "daily_codex_dag_two_node_fixture_input",
    report_date: reportDate,
    node_id: classifySourceNode.id,
    candidates: [{
      candidate_id: "fixture-candidate-001",
      title: "Fixture canonical candidate",
      url: "https://example.com/daily-codex-dag-fixture",
      language: "en",
      source: {
        name: "Fixture Source",
        authority: "official"
      },
      canonical: {
        title: "Fixture canonical candidate",
        url: "https://example.com/daily-codex-dag-fixture"
      }
    }]
  }, null, 2)}\n`, "utf8");
  await fs.rm(classifyOutputPath, { force: true });
  await fs.rm(scoreOutputPath, { force: true });
}

async function prepareRealNodeAdapterFixtureArtifacts({ rootDir, reportDate, sourceNode }) {
  const inputArtifact = sourceNode.inputs?.[0] || {};
  const outputArtifact = sourceNode.outputs?.[0] || {};
  const inputPath = path.resolve(rootDir, materializeArtifactPath({
    templatePath: inputArtifact.path || "",
    reportDate
  }));
  const outputPath = path.resolve(rootDir, materializeArtifactPath({
    templatePath: outputArtifact.path || "",
    reportDate
  }));
  await fs.mkdir(path.dirname(inputPath), { recursive: true });
  await fs.writeFile(inputPath, `${JSON.stringify({
    schema_version: 1,
    mode: "daily_codex_dag_real_node_adapter_fixture_input",
    report_date: reportDate,
    node_id: sourceNode.id,
    candidates: [{
      candidate_id: "fixture-candidate-001",
      title: "Fixture classified candidate",
      url: "https://example.com/daily-codex-dag-fixture",
      language: "en",
      taxonomy: {
        domain: "models",
        flavor: "release",
        channel: "official"
      },
      tags: ["model-release"],
      entities: ["Fixture Labs"]
    }]
  }, null, 2)}\n`, "utf8");
  await fs.rm(outputPath, { force: true });
}

function createRealNodeAdapterDependencyResults({ sourceNode, reportDate, runId }) {
  return (sourceNode.dependencies || []).map((dependencyId) => ({
    node_id: dependencyId,
    execution_id: `${runId}:${dependencyId}:fixture`,
    status: "success",
    required: true,
    downstream_disposition: "continue"
  }));
}

function dependencyResultFromNodeResult(result) {
  return {
    node_id: result.node_id,
    execution_id: result.execution_id,
    status: result.status,
    required: true,
    downstream_disposition: result.downstream_disposition
  };
}

function createBlockedTwoNodeFixtureNodeResult({
  reportDate,
  runId,
  manifestName,
  manifestSchemaVersion,
  node,
  dependencyResult
}) {
  return createDailyCodexDagNodeResult({
    reportDate,
    runId,
    manifestName,
    manifestSchemaVersion,
    nodeId: node.id,
    nodeKind: node.kind,
    runnerStageRef: node.runner_stage_ref,
    status: "blocked",
    downstreamDisposition: "block",
    startedAt: null,
    finishedAt: null,
    attemptsStarted: 0,
    maxAttempts: 1,
    attemptsExhausted: false,
    dependencyResults: [dependencyResult],
    declaredInputs: node.inputs || [],
    declaredOutputs: node.outputs || [],
    resolvedInputs: [],
    resolvedOutputs: [],
    failures: [nodeResultIssue({
      code: "dependency_blocked",
      message: `daily codex DAG two-node fixture blocked ${node.id} because ${dependencyResult.node_id} did not continue.`,
      source: "daily-codex-dag-two-node-fixture",
      retryable: false
    })],
    warnings: [],
    audit: {
      parallel_group: node.parallel_group || "",
      resilience_policy_ref: node.resilience_policy_ref || "",
      owner_path_scope: node.owner_path_scope || "internal_workdir",
      public_artifact: node.public_artifact === true,
      validator_version: NODE_RESULT_VALIDATOR_VERSION
    }
  });
}

function createBlockedSourceWatchDownstreamNodeResult({
  reportDate,
  runId,
  manifestName,
  manifestSchemaVersion,
  node,
  dependencyResult,
  fixtureLabel = "source-watch downstream fixture",
  issueSource = "daily-codex-dag-source-watch-downstream-fixture"
}) {
  return createDailyCodexDagNodeResult({
    reportDate,
    runId,
    manifestName,
    manifestSchemaVersion,
    nodeId: node.id,
    nodeKind: node.kind,
    runnerStageRef: node.runner_stage_ref,
    status: "blocked",
    downstreamDisposition: "block",
    startedAt: null,
    finishedAt: null,
    attemptsStarted: 0,
    maxAttempts: 1,
    attemptsExhausted: false,
    dependencyResults: [dependencyResult],
    declaredInputs: node.inputs || [],
    declaredOutputs: node.outputs || [],
    resolvedInputs: [],
    resolvedOutputs: [],
    failures: [nodeResultIssue({
      code: "dependency_blocked",
      message: `daily codex DAG ${fixtureLabel} blocked ${node.id} because ${dependencyResult.node_id} did not continue.`,
      source: issueSource,
      retryable: false
    })],
    warnings: [],
    audit: {
      parallel_group: node.parallel_group || "",
      resilience_policy_ref: node.resilience_policy_ref || "",
      owner_path_scope: node.owner_path_scope || "internal_workdir",
      public_artifact: node.public_artifact === true,
      validator_version: NODE_RESULT_VALIDATOR_VERSION
    }
  });
}

function expectedRealNodeAdapterSourceNode() {
  return {
    id: REAL_NODE_ADAPTER_TARGET_NODE_ID,
    kind: "command",
    dependencies: [REAL_NODE_ADAPTER_DEPENDENCY_NODE_ID],
    inputs: [{ path: REAL_NODE_ADAPTER_INPUT_ARTIFACT, required: true }],
    outputs: [{ path: REAL_NODE_ADAPTER_OUTPUT_ARTIFACT, required: true }],
    runner_stage_ref: REAL_NODE_ADAPTER_RUNNER_STAGE_REF,
    parallel_group: REAL_NODE_ADAPTER_PARALLEL_GROUP,
    public_artifact: REAL_NODE_ADAPTER_PUBLIC_ARTIFACT,
    owner_path_scope: REAL_NODE_ADAPTER_OWNER_PATH_SCOPE
  };
}

function expectedSourceWatchCollectSourceNode() {
  return {
    id: SOURCE_WATCH_COLLECT_NODE_ID,
    kind: "command",
    dependencies: [],
    inputs: [],
    outputs: [{ path: SOURCE_WATCH_COLLECT_OUTPUT_ARTIFACT, required: true }],
    runner_stage_ref: "collect",
    parallel_group: "source-lanes",
    public_artifact: false,
    owner_path_scope: "internal_workdir"
  };
}

function expectedSourceWatchDownstreamSourceNodes() {
  return [
    expectedSourceWatchCollectSourceNode(),
    {
      id: SOURCE_WATCH_DOWNSTREAM_NODE_ID,
      kind: "command",
      dependencies: [SOURCE_WATCH_COLLECT_NODE_ID],
      inputs: [{ path: SOURCE_WATCH_COLLECT_OUTPUT_ARTIFACT, required: true }],
      outputs: [{ path: SOURCE_WATCH_DOWNSTREAM_OUTPUT_ARTIFACT, required: true }],
      runner_stage_ref: "collect",
      parallel_group: "source-lanes",
      public_artifact: false,
      owner_path_scope: "internal_workdir"
    }
  ];
}

function expectedSourceWatchNormalizeSourceNodes() {
  return [
    ...expectedSourceWatchDownstreamSourceNodes(),
    {
      id: SOURCE_WATCH_NORMALIZE_NODE_ID,
      kind: "command",
      dependencies: [SOURCE_WATCH_DOWNSTREAM_NODE_ID],
      inputs: [{ path: SOURCE_WATCH_DOWNSTREAM_OUTPUT_ARTIFACT, required: true }],
      outputs: [{ path: SOURCE_WATCH_NORMALIZE_OUTPUT_ARTIFACT, required: true }],
      runner_stage_ref: "collect",
      parallel_group: "source-lanes",
      public_artifact: false,
      owner_path_scope: "internal_workdir"
    }
  ];
}

function expectedSourceWatchQualitySourceNodes() {
  return [
    ...expectedSourceWatchNormalizeSourceNodes(),
    {
      id: SOURCE_WATCH_QUALITY_NODE_ID,
      kind: "command",
      dependencies: [SOURCE_WATCH_NORMALIZE_NODE_ID],
      inputs: [{ path: SOURCE_WATCH_NORMALIZE_OUTPUT_ARTIFACT, required: true }],
      outputs: [{ path: SOURCE_WATCH_QUALITY_OUTPUT_ARTIFACT, required: true }],
      runner_stage_ref: "admit",
      parallel_group: "item-lanes",
      public_artifact: false,
      owner_path_scope: "internal_workdir"
    }
  ];
}

function expectedSourceWatchAdmitSourceNodes() {
  return [
    ...expectedSourceWatchQualitySourceNodes(),
    {
      id: SOURCE_WATCH_ADMIT_NODE_ID,
      kind: "command",
      dependencies: [SOURCE_WATCH_QUALITY_NODE_ID],
      inputs: [{ path: SOURCE_WATCH_QUALITY_OUTPUT_ARTIFACT, required: true }],
      outputs: [{ path: SOURCE_WATCH_ADMIT_OUTPUT_ARTIFACT, required: true }],
      runner_stage_ref: "admit",
      parallel_group: "serial",
      public_artifact: false,
      owner_path_scope: "internal_workdir"
    }
  ];
}

function expectedTwoNodeFixtureSourceNodes() {
  return [{
    id: TWO_NODE_FIXTURE_CLASSIFY_NODE_ID,
    kind: "codex_exec",
    dependencies: [],
    inputs: [{ path: TWO_NODE_FIXTURE_CANONICAL_ARTIFACT, required: true }],
    outputs: [{ path: REAL_NODE_ADAPTER_INPUT_ARTIFACT, required: true }],
    runner_stage_ref: REAL_NODE_ADAPTER_RUNNER_STAGE_REF,
    parallel_group: REAL_NODE_ADAPTER_PARALLEL_GROUP,
    public_artifact: REAL_NODE_ADAPTER_PUBLIC_ARTIFACT,
    owner_path_scope: REAL_NODE_ADAPTER_OWNER_PATH_SCOPE
  }, {
    id: TWO_NODE_FIXTURE_SCORE_NODE_ID,
    kind: "command",
    dependencies: [TWO_NODE_FIXTURE_CLASSIFY_NODE_ID],
    inputs: [{ path: REAL_NODE_ADAPTER_INPUT_ARTIFACT, required: true }],
    outputs: [{ path: REAL_NODE_ADAPTER_OUTPUT_ARTIFACT, required: true }],
    runner_stage_ref: REAL_NODE_ADAPTER_RUNNER_STAGE_REF,
    parallel_group: REAL_NODE_ADAPTER_PARALLEL_GROUP,
    public_artifact: REAL_NODE_ADAPTER_PUBLIC_ARTIFACT,
    owner_path_scope: REAL_NODE_ADAPTER_OWNER_PATH_SCOPE
  }];
}

function validateExecutableNodeMvpNodeResults({ plan, reportDate, runId, nodeResults }) {
  const failures = [];
  const warnings = [];
  if (!Array.isArray(nodeResults)) {
    failures.push("daily codex DAG executable-node MVP node_results must be an array.");
    return nodeResultValidationSummary({ failures, warnings, checkedResults: 0 });
  }
  if (nodeResults.length !== 1) {
    failures.push("daily codex DAG executable-node MVP node_results length must be 1.");
  }

  const planNode = Array.isArray(plan?.nodes)
    ? plan.nodes.find((node) => node.id === SYNTHETIC_EXECUTABLE_NODE_ID)
    : null;
  for (const result of nodeResults) {
    const resultValidation = validateDailyCodexDagNodeResult(result);
    failures.push(...resultValidation.failures);
    warnings.push(...resultValidation.warnings);
    validateExecutableNodeMvpNodeResultAgainstPlan({ result, planNode, reportDate, runId, failures });
  }

  return nodeResultValidationSummary({ failures, warnings, checkedResults: nodeResults.length });
}

function validateExecutableNodeMvpNodeResultAgainstPlan({ result, planNode, reportDate, runId, failures }) {
  const label = "daily codex DAG executable-node MVP node result";
  if (!isPlainObject(result)) return;
  if (!planNode) {
    failures.push(`${label} must match the synthetic plan node.`);
    return;
  }
  if (result.report_date !== reportDate) failures.push(`${label}.report_date must match run report_date.`);
  if (result.run_id !== runId) failures.push(`${label}.run_id must match run_id.`);
  if (result.manifest_name !== "daily-codex-dag-contract") failures.push(`${label}.manifest_name must match synthetic manifest.`);
  if (result.manifest_schema_version !== 1) failures.push(`${label}.manifest_schema_version must be 1.`);
  if (result.node_id !== SYNTHETIC_EXECUTABLE_NODE_ID) failures.push(`${label}.node_id must be ${SYNTHETIC_EXECUTABLE_NODE_ID}.`);
  if (result.node_kind !== "command") failures.push(`${label}.node_kind must be command.`);
  if (result.runner_stage_ref !== planNode.runner_stage_ref) failures.push(`${label}.runner_stage_ref must match plan node.`);
  if (result.result_scope !== "node") failures.push(`${label}.result_scope must be node.`);
  if (!["success", "failure"].includes(result.status)) failures.push(`${label}.status must be success or failure.`);
  if (!sameArtifactArray(result.declared_inputs, planNode.inputs)) failures.push(`${label}.declared_inputs must match plan inputs.`);
  if (!sameArtifactArray(result.declared_outputs, planNode.outputs)) failures.push(`${label}.declared_outputs must match plan outputs.`);
  if (Array.isArray(result.dependency_results) && result.dependency_results.length !== 0) {
    failures.push(`${label}.dependency_results must be empty.`);
  }
  if (result.fanout !== null) failures.push(`${label}.fanout must be null.`);
  if (result.barrier !== null) failures.push(`${label}.barrier must be null.`);
  if (result.audit?.parallel_group !== planNode.parallel_group) failures.push(`${label}.audit.parallel_group must match plan node.`);
  if (result.audit?.owner_path_scope !== planNode.owner_path_scope) failures.push(`${label}.audit.owner_path_scope must match plan node.`);
  if (result.audit?.public_artifact !== planNode.public_artifact) failures.push(`${label}.audit.public_artifact must match plan node.`);
}

function validateRealNodeAdapterMvpNodeResults({ plan, sourceNode, reportDate, runId, nodeResults }) {
  const failures = [];
  const warnings = [];
  if (!Array.isArray(nodeResults)) {
    failures.push("daily codex DAG real-node adapter MVP node_results must be an array.");
    return nodeResultValidationSummary({ failures, warnings, checkedResults: 0 });
  }
  if (nodeResults.length !== 1) {
    failures.push("daily codex DAG real-node adapter MVP node_results length must be 1.");
  }

  const planNode = Array.isArray(plan?.nodes)
    ? plan.nodes.find((node) => node.id === REAL_NODE_ADAPTER_TARGET_NODE_ID)
    : null;
  for (const result of nodeResults) {
    const resultValidation = validateDailyCodexDagNodeResult(result);
    failures.push(...resultValidation.failures);
    warnings.push(...resultValidation.warnings);
    validateRealNodeAdapterMvpNodeResultAgainstPlan({ result, planNode, sourceNode, reportDate, runId, failures });
  }

  return nodeResultValidationSummary({ failures, warnings, checkedResults: nodeResults.length });
}

function validateRealNodeAdapterMvpNodeResultAgainstPlan({ result, planNode, sourceNode, reportDate, runId, failures }) {
  const label = "daily codex DAG real-node adapter MVP node result";
  if (!isPlainObject(result)) return;
  if (!planNode) {
    failures.push(`${label} must match the real adapter plan node.`);
    return;
  }
  if (result.report_date !== reportDate) failures.push(`${label}.report_date must match run report_date.`);
  if (result.run_id !== runId) failures.push(`${label}.run_id must match run_id.`);
  if (result.manifest_name !== "daily-codex-dag-contract") failures.push(`${label}.manifest_name must match manifest.`);
  if (result.manifest_schema_version !== 1) failures.push(`${label}.manifest_schema_version must be 1.`);
  if (result.node_id !== REAL_NODE_ADAPTER_TARGET_NODE_ID) failures.push(`${label}.node_id must be ${REAL_NODE_ADAPTER_TARGET_NODE_ID}.`);
  if (result.node_kind !== "command") failures.push(`${label}.node_kind must be command.`);
  if (result.runner_stage_ref !== sourceNode.runner_stage_ref) failures.push(`${label}.runner_stage_ref must match source node.`);
  if (result.result_scope !== "node") failures.push(`${label}.result_scope must be node.`);
  if (!["success", "failure"].includes(result.status)) failures.push(`${label}.status must be success or failure.`);
  if (!sameArtifactArray(result.declared_inputs, sourceNode.inputs || [])) failures.push(`${label}.declared_inputs must match source node inputs.`);
  if (!sameArtifactArray(result.declared_outputs, sourceNode.outputs || [])) failures.push(`${label}.declared_outputs must match source node outputs.`);
  validateRealNodeAdapterDependencyResults({ result, sourceNode, failures, label });
  if (result.fanout !== null) failures.push(`${label}.fanout must be null.`);
  if (result.barrier !== null) failures.push(`${label}.barrier must be null.`);
  if (result.audit?.parallel_group !== sourceNode.parallel_group) failures.push(`${label}.audit.parallel_group must match source node.`);
  if (result.audit?.owner_path_scope !== sourceNode.owner_path_scope) failures.push(`${label}.audit.owner_path_scope must match source node.`);
  if (result.audit?.public_artifact !== sourceNode.public_artifact) failures.push(`${label}.audit.public_artifact must match source node.`);
}

function validateRealNodeAdapterDependencyResults({ result, sourceNode, failures, label }) {
  if (!Array.isArray(result.dependency_results)) return;
  const expectedDependencies = sourceNode.dependencies || [];
  if (result.dependency_results.length !== expectedDependencies.length) {
    failures.push(`${label}.dependency_results must match source node dependencies.`);
    return;
  }
  for (const dependencyId of expectedDependencies) {
    const dependencyResult = result.dependency_results.find((item) => item.node_id === dependencyId);
    if (!dependencyResult) {
      failures.push(`${label}.dependency_results must include ${dependencyId}.`);
      continue;
    }
    if (dependencyResult.status !== "success") failures.push(`${label}.dependency_results ${dependencyId} status must be success.`);
    if (dependencyResult.required !== true) failures.push(`${label}.dependency_results ${dependencyId} required must be true.`);
    if (dependencyResult.downstream_disposition !== "continue") {
      failures.push(`${label}.dependency_results ${dependencyId} downstream_disposition must be continue.`);
    }
  }
}

function validateSourceWatchCollectMvpNodeResults({ plan, sourceNode, reportDate, runId, nodeResults }) {
  const failures = [];
  const warnings = [];
  if (!Array.isArray(nodeResults)) {
    failures.push("daily codex DAG source-watch collect MVP node_results must be an array.");
    return nodeResultValidationSummary({ failures, warnings, checkedResults: 0 });
  }
  if (nodeResults.length !== 1) {
    failures.push("daily codex DAG source-watch collect MVP node_results length must be 1.");
  }

  const planNode = Array.isArray(plan?.nodes)
    ? plan.nodes.find((node) => node.id === SOURCE_WATCH_COLLECT_NODE_ID)
    : null;
  for (const result of nodeResults) {
    const resultValidation = validateDailyCodexDagNodeResult(result);
    failures.push(...resultValidation.failures);
    warnings.push(...resultValidation.warnings);
    validateSourceWatchCollectMvpNodeResultAgainstPlan({ result, planNode, sourceNode, reportDate, runId, failures });
  }

  return nodeResultValidationSummary({ failures, warnings, checkedResults: nodeResults.length });
}

function validateSourceWatchCollectMvpNodeResultAgainstPlan({ result, planNode, sourceNode, reportDate, runId, failures }) {
  const label = "daily codex DAG source-watch collect MVP node result";
  if (!isPlainObject(result)) return;
  if (!planNode) {
    failures.push(`${label} must match the source-watch collect plan node.`);
    return;
  }
  if (result.report_date !== reportDate) failures.push(`${label}.report_date must match run report_date.`);
  if (result.run_id !== runId) failures.push(`${label}.run_id must match run_id.`);
  if (result.manifest_name !== "daily-codex-dag-contract") failures.push(`${label}.manifest_name must match manifest.`);
  if (result.manifest_schema_version !== 1) failures.push(`${label}.manifest_schema_version must be 1.`);
  if (result.node_id !== SOURCE_WATCH_COLLECT_NODE_ID) failures.push(`${label}.node_id must be ${SOURCE_WATCH_COLLECT_NODE_ID}.`);
  if (result.node_kind !== "command") failures.push(`${label}.node_kind must be command.`);
  if (result.runner_stage_ref !== sourceNode.runner_stage_ref) failures.push(`${label}.runner_stage_ref must match source node.`);
  if (result.result_scope !== "node") failures.push(`${label}.result_scope must be node.`);
  if (!["success", "failure"].includes(result.status)) failures.push(`${label}.status must be success or failure.`);
  if (!sameArtifactArray(result.declared_inputs, [])) failures.push(`${label}.declared_inputs must be empty.`);
  if (!sameArtifactArray(result.declared_outputs, sourceNode.outputs || [])) failures.push(`${label}.declared_outputs must match source node outputs.`);
  if (Array.isArray(result.dependency_results) && result.dependency_results.length !== 0) {
    failures.push(`${label}.dependency_results must be empty.`);
  }
  if (result.fanout !== null) failures.push(`${label}.fanout must be null.`);
  if (result.barrier !== null) failures.push(`${label}.barrier must be null.`);
  if (result.audit?.parallel_group !== sourceNode.parallel_group) failures.push(`${label}.audit.parallel_group must match source node.`);
  if (result.audit?.owner_path_scope !== sourceNode.owner_path_scope) failures.push(`${label}.audit.owner_path_scope must match source node.`);
  if (result.audit?.public_artifact !== sourceNode.public_artifact) failures.push(`${label}.audit.public_artifact must match source node.`);
}

function validateSourceWatchDownstreamMvpNodeResults({ plan, reportDate, runId, nodeResults }) {
  const failures = [];
  const warnings = [];
  if (!Array.isArray(nodeResults)) {
    failures.push("daily codex DAG source-watch downstream MVP node_results must be an array.");
    return nodeResultValidationSummary({ failures, warnings, checkedResults: 0 });
  }
  if (nodeResults.length !== 2) {
    failures.push("daily codex DAG source-watch downstream MVP node_results length must be 2.");
  }

  const expectedNodes = expectedSourceWatchDownstreamSourceNodes();
  const resultByNodeId = new Map(nodeResults.filter(isPlainObject).map((result) => [result.node_id, result]));
  for (let index = 0; index < nodeResults.length; index += 1) {
    const result = nodeResults[index];
    const resultValidation = validateDailyCodexDagNodeResult(result);
    failures.push(...resultValidation.failures);
    warnings.push(...resultValidation.warnings);
    validateSourceWatchDownstreamMvpNodeResultAgainstExpected({
      result,
      expectedNode: expectedNodes[index],
      reportDate,
      runId,
      resultByNodeId,
      failures
    });
  }

  return nodeResultValidationSummary({ failures, warnings, checkedResults: nodeResults.length });
}

function validateSourceWatchDownstreamMvpNodeResultAgainstExpected({
  result,
  expectedNode,
  reportDate,
  runId,
  resultByNodeId,
  failures
}) {
  const label = "daily codex DAG source-watch downstream MVP node result";
  if (!isPlainObject(result)) return;
  if (!expectedNode) {
    failures.push(`${label} has an unexpected result position.`);
    return;
  }
  if (result.report_date !== reportDate) failures.push(`${label}.report_date must match run report_date.`);
  if (result.run_id !== runId) failures.push(`${label}.run_id must match run_id.`);
  if (result.manifest_name !== "daily-codex-dag-contract") failures.push(`${label}.manifest_name must match manifest.`);
  if (result.manifest_schema_version !== 1) failures.push(`${label}.manifest_schema_version must be 1.`);
  if (result.node_id !== expectedNode.id) failures.push(`${label}.node_id must be ${expectedNode.id}.`);
  if (result.node_kind !== expectedNode.kind) failures.push(`${label}.node_kind must be ${expectedNode.kind}.`);
  if (result.runner_stage_ref !== expectedNode.runner_stage_ref) failures.push(`${label}.runner_stage_ref must match expected node.`);
  if (result.result_scope !== "node") failures.push(`${label}.result_scope must be node.`);
  if (!sameArtifactArray(result.declared_inputs, expectedNode.inputs)) failures.push(`${label}.declared_inputs must match expected node inputs.`);
  if (!sameArtifactArray(result.declared_outputs, expectedNode.outputs)) failures.push(`${label}.declared_outputs must match expected node outputs.`);
  if (result.audit?.parallel_group !== expectedNode.parallel_group) failures.push(`${label}.audit.parallel_group must match expected node.`);
  if (result.audit?.owner_path_scope !== expectedNode.owner_path_scope) failures.push(`${label}.audit.owner_path_scope must match expected node.`);
  if (result.audit?.public_artifact !== expectedNode.public_artifact) failures.push(`${label}.audit.public_artifact must match expected node.`);
  if (result.fanout !== null) failures.push(`${label}.fanout must be null.`);
  if (result.barrier !== null) failures.push(`${label}.barrier must be null.`);

  if (expectedNode.id === SOURCE_WATCH_COLLECT_NODE_ID) {
    if (!["success", "failure"].includes(result.status)) {
      failures.push(`${label}.fetch-source-health status must be success or failure.`);
    }
    if (Array.isArray(result.dependency_results) && result.dependency_results.length !== 0) {
      failures.push(`${label}.fetch-source-health dependency_results must be empty.`);
    }
    return;
  }

  if (!["success", "failure", "blocked"].includes(result.status)) {
    failures.push(`${label}.parse-extract status must be success, failure, or blocked.`);
  }
  const collectResult = resultByNodeId.get(SOURCE_WATCH_COLLECT_NODE_ID);
  if (!collectResult) {
    failures.push(`${label}.parse-extract requires fetch-source-health node result evidence.`);
  }
  if (!Array.isArray(result.dependency_results) || result.dependency_results.length !== 1) {
    failures.push(`${label}.parse-extract dependency_results must contain fetch-source-health evidence.`);
    return;
  }
  const dependency = result.dependency_results[0];
  if (dependency.node_id !== SOURCE_WATCH_COLLECT_NODE_ID) {
    failures.push(`${label}.parse-extract dependency_results[0].node_id must be ${SOURCE_WATCH_COLLECT_NODE_ID}.`);
  }
  if (collectResult && dependency.execution_id !== collectResult.execution_id) {
    failures.push(`${label}.parse-extract dependency_results[0].execution_id must match fetch-source-health result.`);
  }
  if (collectResult && dependency.status !== collectResult.status) {
    failures.push(`${label}.parse-extract dependency_results[0].status must match fetch-source-health result.`);
  }
  if (collectResult && dependency.downstream_disposition !== collectResult.downstream_disposition) {
    failures.push(`${label}.parse-extract dependency_results[0].downstream_disposition must match fetch-source-health result.`);
  }
  if (dependency.required !== true) failures.push(`${label}.parse-extract dependency_results[0].required must be true.`);
  if (collectResult?.status !== "success" && result.status !== "blocked") {
    failures.push(`${label}.parse-extract must be blocked when fetch-source-health does not succeed.`);
  }
  if (collectResult?.status === "success" && result.status === "blocked") {
    failures.push(`${label}.parse-extract must not be blocked when fetch-source-health succeeds.`);
  }
}

function validateSourceWatchNormalizeMvpNodeResults({ plan, reportDate, runId, nodeResults }) {
  const failures = [];
  const warnings = [];
  if (!Array.isArray(nodeResults)) {
    failures.push("daily codex DAG source-watch normalize MVP node_results must be an array.");
    return nodeResultValidationSummary({ failures, warnings, checkedResults: 0 });
  }
  if (nodeResults.length !== 3) {
    failures.push("daily codex DAG source-watch normalize MVP node_results length must be 3.");
  }

  const expectedNodes = expectedSourceWatchNormalizeSourceNodes();
  const resultByNodeId = new Map(nodeResults.filter(isPlainObject).map((result) => [result.node_id, result]));
  for (let index = 0; index < nodeResults.length; index += 1) {
    const result = nodeResults[index];
    const resultValidation = validateDailyCodexDagNodeResult(result);
    failures.push(...resultValidation.failures);
    warnings.push(...resultValidation.warnings);
    validateSourceWatchNormalizeMvpNodeResultAgainstExpected({
      result,
      expectedNode: expectedNodes[index],
      reportDate,
      runId,
      resultByNodeId,
      failures
    });
  }

  return nodeResultValidationSummary({ failures, warnings, checkedResults: nodeResults.length });
}

function validateSourceWatchQualityMvpNodeResults({ plan, reportDate, runId, nodeResults }) {
  const failures = [];
  const warnings = [];
  if (!Array.isArray(nodeResults)) {
    failures.push("daily codex DAG source-watch quality MVP node_results must be an array.");
    return nodeResultValidationSummary({ failures, warnings, checkedResults: 0 });
  }
  if (nodeResults.length !== 4) {
    failures.push("daily codex DAG source-watch quality MVP node_results length must be 4.");
  }

  const expectedNodes = expectedSourceWatchQualitySourceNodes();
  const resultByNodeId = new Map(nodeResults.filter(isPlainObject).map((result) => [result.node_id, result]));
  for (let index = 0; index < nodeResults.length; index += 1) {
    const result = nodeResults[index];
    const resultValidation = validateDailyCodexDagNodeResult(result);
    failures.push(...resultValidation.failures);
    warnings.push(...resultValidation.warnings);
    validateSourceWatchNormalizeMvpNodeResultAgainstExpected({
      result,
      expectedNode: expectedNodes[index],
      reportDate,
      runId,
      resultByNodeId,
      failures
    });
  }

  return nodeResultValidationSummary({ failures, warnings, checkedResults: nodeResults.length });
}

function validateSourceWatchAdmitMvpNodeResults({ plan, reportDate, runId, nodeResults }) {
  const failures = [];
  const warnings = [];
  if (!Array.isArray(nodeResults)) {
    failures.push("daily codex DAG source-watch admit MVP node_results must be an array.");
    return nodeResultValidationSummary({ failures, warnings, checkedResults: 0 });
  }
  if (nodeResults.length !== 5) {
    failures.push("daily codex DAG source-watch admit MVP node_results length must be 5.");
  }

  const expectedNodes = expectedSourceWatchAdmitSourceNodes();
  const resultByNodeId = new Map(nodeResults.filter(isPlainObject).map((result) => [result.node_id, result]));
  for (let index = 0; index < nodeResults.length; index += 1) {
    const result = nodeResults[index];
    const resultValidation = validateDailyCodexDagNodeResult(result);
    failures.push(...resultValidation.failures);
    warnings.push(...resultValidation.warnings);
    validateSourceWatchNormalizeMvpNodeResultAgainstExpected({
      result,
      expectedNode: expectedNodes[index],
      reportDate,
      runId,
      resultByNodeId,
      failures
    });
  }

  return nodeResultValidationSummary({ failures, warnings, checkedResults: nodeResults.length });
}

function validateSourceWatchNormalizeMvpNodeResultAgainstExpected({
  result,
  expectedNode,
  reportDate,
  runId,
  resultByNodeId,
  failures
}) {
  const label = "daily codex DAG source-watch normalize MVP node result";
  if (!isPlainObject(result)) return;
  if (!expectedNode) {
    failures.push(`${label} has an unexpected result position.`);
    return;
  }
  if (result.report_date !== reportDate) failures.push(`${label}.report_date must match run report_date.`);
  if (result.run_id !== runId) failures.push(`${label}.run_id must match run_id.`);
  if (result.manifest_name !== "daily-codex-dag-contract") failures.push(`${label}.manifest_name must match manifest.`);
  if (result.manifest_schema_version !== 1) failures.push(`${label}.manifest_schema_version must be 1.`);
  if (result.node_id !== expectedNode.id) failures.push(`${label}.node_id must be ${expectedNode.id}.`);
  if (result.node_kind !== expectedNode.kind) failures.push(`${label}.node_kind must be ${expectedNode.kind}.`);
  if (result.runner_stage_ref !== expectedNode.runner_stage_ref) failures.push(`${label}.runner_stage_ref must match expected node.`);
  if (result.result_scope !== "node") failures.push(`${label}.result_scope must be node.`);
  if (!sameArtifactArray(result.declared_inputs, expectedNode.inputs)) failures.push(`${label}.declared_inputs must match expected node inputs.`);
  if (!sameArtifactArray(result.declared_outputs, expectedNode.outputs)) failures.push(`${label}.declared_outputs must match expected node outputs.`);
  if (result.audit?.parallel_group !== expectedNode.parallel_group) failures.push(`${label}.audit.parallel_group must match expected node.`);
  if (result.audit?.owner_path_scope !== expectedNode.owner_path_scope) failures.push(`${label}.audit.owner_path_scope must match expected node.`);
  if (result.audit?.public_artifact !== expectedNode.public_artifact) failures.push(`${label}.audit.public_artifact must match expected node.`);
  if (result.fanout !== null) failures.push(`${label}.fanout must be null.`);
  if (result.barrier !== null) failures.push(`${label}.barrier must be null.`);

  if (expectedNode.id === SOURCE_WATCH_COLLECT_NODE_ID) {
    if (!["success", "failure"].includes(result.status)) {
      failures.push(`${label}.fetch-source-health status must be success or failure.`);
    }
    if (Array.isArray(result.dependency_results) && result.dependency_results.length !== 0) {
      failures.push(`${label}.fetch-source-health dependency_results must be empty.`);
    }
    return;
  }

  const dependencyNodeId = expectedNode.dependencies[0];
  const dependencyResult = resultByNodeId.get(dependencyNodeId);
  if (!["success", "failure", "blocked"].includes(result.status)) {
    failures.push(`${label}.${expectedNode.id} status must be success, failure, or blocked.`);
  }
  if (!dependencyResult) {
    failures.push(`${label}.${expectedNode.id} requires ${dependencyNodeId} node result evidence.`);
  }
  if (!Array.isArray(result.dependency_results) || result.dependency_results.length !== 1) {
    failures.push(`${label}.${expectedNode.id} dependency_results must contain ${dependencyNodeId} evidence.`);
    return;
  }
  const dependency = result.dependency_results[0];
  if (dependency.node_id !== dependencyNodeId) {
    failures.push(`${label}.${expectedNode.id} dependency_results[0].node_id must be ${dependencyNodeId}.`);
  }
  if (dependencyResult && dependency.execution_id !== dependencyResult.execution_id) {
    failures.push(`${label}.${expectedNode.id} dependency_results[0].execution_id must match ${dependencyNodeId} result.`);
  }
  if (dependencyResult && dependency.status !== dependencyResult.status) {
    failures.push(`${label}.${expectedNode.id} dependency_results[0].status must match ${dependencyNodeId} result.`);
  }
  if (dependencyResult && dependency.downstream_disposition !== dependencyResult.downstream_disposition) {
    failures.push(`${label}.${expectedNode.id} dependency_results[0].downstream_disposition must match ${dependencyNodeId} result.`);
  }
  if (dependency.required !== true) failures.push(`${label}.${expectedNode.id} dependency_results[0].required must be true.`);
  if (dependencyResult?.status !== "success" && result.status !== "blocked") {
    failures.push(`${label}.${expectedNode.id} must be blocked when ${dependencyNodeId} does not succeed.`);
  }
  if (dependencyResult?.status === "success" && result.status === "blocked") {
    failures.push(`${label}.${expectedNode.id} must not be blocked when ${dependencyNodeId} succeeds.`);
  }
}

function validateSourceWatchCollectMvpPlanNodeAgainstExpected({ planNode, expectedSourceNode, failures }) {
  const label = "daily codex DAG source-watch collect MVP plan node";
  if (!isPlainObject(planNode)) return;
  if (planNode.id !== expectedSourceNode.id) failures.push(`${label}.id must be ${expectedSourceNode.id}.`);
  if (planNode.kind !== expectedSourceNode.kind) failures.push(`${label}.kind must be ${expectedSourceNode.kind}.`);
  if (planNode.runner_stage_ref !== expectedSourceNode.runner_stage_ref) {
    failures.push(`${label}.runner_stage_ref must be ${expectedSourceNode.runner_stage_ref}.`);
  }
  if (planNode.parallel_group !== expectedSourceNode.parallel_group) {
    failures.push(`${label}.parallel_group must be ${expectedSourceNode.parallel_group}.`);
  }
  if (planNode.owner_path_scope !== expectedSourceNode.owner_path_scope) {
    failures.push(`${label}.owner_path_scope must be ${expectedSourceNode.owner_path_scope}.`);
  }
  if (planNode.public_artifact !== expectedSourceNode.public_artifact) {
    failures.push(`${label}.public_artifact must be ${expectedSourceNode.public_artifact}.`);
  }
  if (!sameOrderedStringArray(planNode.dependencies, expectedSourceNode.dependencies)) {
    failures.push(`${label}.dependencies must match the fetch-source-health production contract.`);
  }
  if (!sameArtifactArray(planNode.inputs, expectedSourceNode.inputs)) {
    failures.push(`${label}.inputs must match the fetch-source-health production contract.`);
  }
  if (!sameArtifactArray(planNode.outputs, expectedSourceNode.outputs)) {
    failures.push(`${label}.outputs must match the fetch-source-health production contract.`);
  }
}

function validateSourceWatchDownstreamMvpPlanNodeAgainstExpected({ planNode, expectedNode, failures }) {
  const label = "daily codex DAG source-watch downstream MVP plan node";
  if (!isPlainObject(planNode)) return;
  if (!expectedNode) {
    failures.push(`${label} has an unexpected plan position.`);
    return;
  }
  if (planNode.id !== expectedNode.id) failures.push(`${label}.id must be ${expectedNode.id}.`);
  if (planNode.kind !== expectedNode.kind) failures.push(`${label}.kind must be ${expectedNode.kind}.`);
  if (planNode.runner_stage_ref !== expectedNode.runner_stage_ref) {
    failures.push(`${label}.runner_stage_ref must be ${expectedNode.runner_stage_ref}.`);
  }
  if (planNode.parallel_group !== expectedNode.parallel_group) {
    failures.push(`${label}.parallel_group must be ${expectedNode.parallel_group}.`);
  }
  if (planNode.owner_path_scope !== expectedNode.owner_path_scope) {
    failures.push(`${label}.owner_path_scope must be ${expectedNode.owner_path_scope}.`);
  }
  if (planNode.public_artifact !== expectedNode.public_artifact) {
    failures.push(`${label}.public_artifact must be ${expectedNode.public_artifact}.`);
  }
  if (!sameOrderedStringArray(planNode.dependencies, expectedNode.dependencies)) {
    failures.push(`${label}.dependencies must match the production collect-to-parse contract.`);
  }
  if (!sameArtifactArray(planNode.inputs, expectedNode.inputs)) {
    failures.push(`${label}.inputs must match the production collect-to-parse contract.`);
  }
  if (!sameArtifactArray(planNode.outputs, expectedNode.outputs)) {
    failures.push(`${label}.outputs must match the production collect-to-parse contract.`);
  }
}

function validateRealNodeAdapterMvpPlanNodeAgainstExpected({ planNode, expectedSourceNode, failures }) {
  const label = "daily codex DAG real-node adapter MVP plan node";
  if (!isPlainObject(planNode)) return;
  if (planNode.id !== expectedSourceNode.id) failures.push(`${label}.id must be ${expectedSourceNode.id}.`);
  if (planNode.kind !== expectedSourceNode.kind) failures.push(`${label}.kind must be ${expectedSourceNode.kind}.`);
  if (planNode.runner_stage_ref !== expectedSourceNode.runner_stage_ref) {
    failures.push(`${label}.runner_stage_ref must be ${expectedSourceNode.runner_stage_ref}.`);
  }
  if (planNode.parallel_group !== expectedSourceNode.parallel_group) {
    failures.push(`${label}.parallel_group must be ${expectedSourceNode.parallel_group}.`);
  }
  if (planNode.owner_path_scope !== expectedSourceNode.owner_path_scope) {
    failures.push(`${label}.owner_path_scope must be ${expectedSourceNode.owner_path_scope}.`);
  }
  if (planNode.public_artifact !== expectedSourceNode.public_artifact) {
    failures.push(`${label}.public_artifact must be ${expectedSourceNode.public_artifact}.`);
  }
  if (!sameOrderedStringArray(planNode.dependencies, expectedSourceNode.dependencies)) {
    failures.push(`${label}.dependencies must match the score production contract.`);
  }
  if (!sameArtifactArray(planNode.inputs, expectedSourceNode.inputs)) {
    failures.push(`${label}.inputs must match the score production contract.`);
  }
  if (!sameArtifactArray(planNode.outputs, expectedSourceNode.outputs)) {
    failures.push(`${label}.outputs must match the score production contract.`);
  }
}

function validateTwoNodeFixtureMvpNodeResults({ plan, reportDate, runId, nodeResults }) {
  const failures = [];
  const warnings = [];
  if (!Array.isArray(nodeResults)) {
    failures.push("daily codex DAG two-node fixture MVP node_results must be an array.");
    return nodeResultValidationSummary({ failures, warnings, checkedResults: 0 });
  }
  if (nodeResults.length !== 2) {
    failures.push("daily codex DAG two-node fixture MVP node_results length must be 2.");
  }

  const expectedNodes = expectedTwoNodeFixtureSourceNodes();
  const resultByNodeId = new Map(nodeResults.filter(isPlainObject).map((result) => [result.node_id, result]));
  for (let index = 0; index < nodeResults.length; index += 1) {
    const result = nodeResults[index];
    const resultValidation = validateDailyCodexDagNodeResult(result);
    failures.push(...resultValidation.failures);
    warnings.push(...resultValidation.warnings);
    validateTwoNodeFixtureMvpNodeResultAgainstExpected({
      result,
      expectedNode: expectedNodes[index],
      reportDate,
      runId,
      resultByNodeId,
      failures
    });
  }

  return nodeResultValidationSummary({ failures, warnings, checkedResults: nodeResults.length });
}

function validateTwoNodeFixtureMvpNodeResultAgainstExpected({
  result,
  expectedNode,
  reportDate,
  runId,
  resultByNodeId,
  failures
}) {
  const label = "daily codex DAG two-node fixture MVP node result";
  if (!isPlainObject(result)) return;
  if (!expectedNode) {
    failures.push(`${label} has an unexpected result position.`);
    return;
  }
  if (result.report_date !== reportDate) failures.push(`${label}.report_date must match run report_date.`);
  if (result.run_id !== runId) failures.push(`${label}.run_id must match run_id.`);
  if (result.manifest_name !== "daily-codex-dag-contract") failures.push(`${label}.manifest_name must match manifest.`);
  if (result.manifest_schema_version !== 1) failures.push(`${label}.manifest_schema_version must be 1.`);
  if (result.node_id !== expectedNode.id) failures.push(`${label}.node_id must be ${expectedNode.id}.`);
  if (result.node_kind !== expectedNode.kind) failures.push(`${label}.node_kind must be ${expectedNode.kind}.`);
  if (result.runner_stage_ref !== expectedNode.runner_stage_ref) failures.push(`${label}.runner_stage_ref must match expected node.`);
  if (result.result_scope !== "node") failures.push(`${label}.result_scope must be node.`);
  if (!sameArtifactArray(result.declared_inputs, expectedNode.inputs)) failures.push(`${label}.declared_inputs must match expected node inputs.`);
  if (!sameArtifactArray(result.declared_outputs, expectedNode.outputs)) failures.push(`${label}.declared_outputs must match expected node outputs.`);
  if (result.audit?.parallel_group !== expectedNode.parallel_group) failures.push(`${label}.audit.parallel_group must match expected node.`);
  if (result.audit?.owner_path_scope !== expectedNode.owner_path_scope) failures.push(`${label}.audit.owner_path_scope must match expected node.`);
  if (result.audit?.public_artifact !== expectedNode.public_artifact) failures.push(`${label}.audit.public_artifact must match expected node.`);
  if (result.fanout !== null) failures.push(`${label}.fanout must be null.`);
  if (result.barrier !== null) failures.push(`${label}.barrier must be null.`);

  if (expectedNode.id === TWO_NODE_FIXTURE_CLASSIFY_NODE_ID) {
    if (!["success", "failure"].includes(result.status)) {
      failures.push(`${label}.classify status must be success or failure.`);
    }
    if (Array.isArray(result.dependency_results) && result.dependency_results.length !== 0) {
      failures.push(`${label}.classify dependency_results must be empty.`);
    }
    return;
  }

  if (!["success", "failure", "blocked"].includes(result.status)) {
    failures.push(`${label}.score status must be success, failure, or blocked.`);
  }
  const classifyResult = resultByNodeId.get(TWO_NODE_FIXTURE_CLASSIFY_NODE_ID);
  if (!classifyResult) {
    failures.push(`${label}.score requires classify node result evidence.`);
  }
  if (!Array.isArray(result.dependency_results) || result.dependency_results.length !== 1) {
    failures.push(`${label}.score dependency_results must contain classify evidence.`);
    return;
  }
  const dependency = result.dependency_results[0];
  if (dependency.node_id !== TWO_NODE_FIXTURE_CLASSIFY_NODE_ID) {
    failures.push(`${label}.score dependency_results[0].node_id must be ${TWO_NODE_FIXTURE_CLASSIFY_NODE_ID}.`);
  }
  if (classifyResult && dependency.execution_id !== classifyResult.execution_id) {
    failures.push(`${label}.score dependency_results[0].execution_id must match classify result.`);
  }
  if (classifyResult && dependency.status !== classifyResult.status) {
    failures.push(`${label}.score dependency_results[0].status must match classify result.`);
  }
  if (classifyResult && dependency.downstream_disposition !== classifyResult.downstream_disposition) {
    failures.push(`${label}.score dependency_results[0].downstream_disposition must match classify result.`);
  }
  if (dependency.required !== true) failures.push(`${label}.score dependency_results[0].required must be true.`);
  if (classifyResult?.status !== "success" && result.status !== "blocked") {
    failures.push(`${label}.score must be blocked when classify does not succeed.`);
  }
  if (classifyResult?.status === "success" && result.status === "blocked") {
    failures.push(`${label}.score must not be blocked when classify succeeds.`);
  }
}

function validateTwoNodeFixtureMvpPlanNodeAgainstExpected({ planNode, expectedNode, failures }) {
  const label = "daily codex DAG two-node fixture MVP plan node";
  if (!isPlainObject(planNode)) return;
  if (planNode.id !== expectedNode.id) failures.push(`${label}.id must be ${expectedNode.id}.`);
  if (planNode.kind !== expectedNode.kind) failures.push(`${label}.kind must be ${expectedNode.kind}.`);
  if (planNode.runner_stage_ref !== expectedNode.runner_stage_ref) {
    failures.push(`${label}.runner_stage_ref must be ${expectedNode.runner_stage_ref}.`);
  }
  if (planNode.parallel_group !== expectedNode.parallel_group) {
    failures.push(`${label}.parallel_group must be ${expectedNode.parallel_group}.`);
  }
  if (planNode.owner_path_scope !== expectedNode.owner_path_scope) {
    failures.push(`${label}.owner_path_scope must be ${expectedNode.owner_path_scope}.`);
  }
  if (planNode.public_artifact !== expectedNode.public_artifact) {
    failures.push(`${label}.public_artifact must be ${expectedNode.public_artifact}.`);
  }
  if (!sameOrderedStringArray(planNode.dependencies, expectedNode.dependencies)) {
    failures.push(`${label}.dependencies must match the two-node fixture contract.`);
  }
  if (!sameArtifactArray(planNode.inputs, expectedNode.inputs)) {
    failures.push(`${label}.inputs must match the two-node fixture contract.`);
  }
  if (!sameArtifactArray(planNode.outputs, expectedNode.outputs)) {
    failures.push(`${label}.outputs must match the two-node fixture contract.`);
  }
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

function executeCommandRuntimePlan({ command, args, cwd, shell, timeoutMs }) {
  return new Promise((resolve) => {
    execFileCallback(command, args, {
      cwd,
      shell,
      timeout: timeoutMs,
      windowsHide: true,
      maxBuffer: 1024 * 1024
    }, (error, stdout, stderr) => {
      if (error) {
        resolve({
          exitCode: Number.isInteger(error.code) ? error.code : 1,
          signal: error.signal || null,
          stdout,
          stderr,
          errorMessage: error.message
        });
        return;
      }
      resolve({
        exitCode: 0,
        signal: null,
        stdout,
        stderr,
        errorMessage: ""
      });
    });
  });
}

function commandNodeTimeoutMs(options = {}) {
  const spec = selectExplicitNodeExecutionSpec({ options, node: options.node || {} });
  const timeoutSeconds = Number(options.timeoutSeconds ?? options.timeout_seconds ?? spec?.timeout_seconds);
  if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) return 0;
  return Math.floor(timeoutSeconds * 1000);
}

function normalizeCommandExecutionOutcome(value) {
  const outcome = isPlainObject(value) ? value : {};
  const exitCode = normalizeExitCode(outcome.exitCode ?? outcome.exit_code ?? outcome.code, 0);
  return {
    exit_code: exitCode,
    signal: nonBlankString(outcome.signal) ? outcome.signal : null,
    stdout: typeof outcome.stdout === "string" ? outcome.stdout : "",
    stderr: typeof outcome.stderr === "string" ? outcome.stderr : "",
    error_message: typeof outcome.errorMessage === "string"
      ? outcome.errorMessage
      : typeof outcome.error_message === "string"
        ? outcome.error_message
        : ""
  };
}

function normalizeCommandExecutionError(error) {
  const exitCode = normalizeExitCode(error?.code, 1);
  return {
    exit_code: exitCode,
    signal: nonBlankString(error?.signal) ? error.signal : null,
    stdout: typeof error?.stdout === "string" ? error.stdout : "",
    stderr: typeof error?.stderr === "string" ? error.stderr : "",
    error_message: error instanceof Error ? error.message : String(error || "command execution failed")
  };
}

function normalizeExitCode(value, fallback) {
  if (Number.isInteger(value)) return value;
  const numeric = Number(value);
  return Number.isInteger(numeric) ? numeric : fallback;
}

function commandExecutionIssue({ nodeId, executionOutcome }) {
  const signalSuffix = nonBlankString(executionOutcome.signal) ? ` and signal ${executionOutcome.signal}` : "";
  return nodeResultIssue({
    code: "command_execution_failed",
    message: `Command node ${nodeId} failed with exit code ${executionOutcome.exit_code}${signalSuffix}.`,
    source: "command-executor",
    retryable: false
  });
}

function commandArtifactIssues({ nodeId, declaredInputs, declaredOutputs, resolvedInputs, resolvedOutputs }) {
  return [
    ...requiredArtifactIssues({ nodeId, kind: "input", declared: declaredInputs, resolved: resolvedInputs }),
    ...requiredArtifactIssues({ nodeId, kind: "output", declared: declaredOutputs, resolved: resolvedOutputs })
  ];
}

function requiredArtifactIssues({ nodeId, kind, declared, resolved }) {
  if (!Array.isArray(declared) || !Array.isArray(resolved)) return [];
  const issues = [];
  for (const artifact of declared) {
    if (!isPlainObject(artifact) || artifact.required !== true || !nonEmptyString(artifact.path)) continue;
    const resolvedArtifact = resolved.find((item) => isPlainObject(item) && item.path === artifact.path);
    if (!resolvedArtifact || resolvedArtifact.exists !== true) {
      issues.push(nodeResultIssue({
        code: `required_${kind}_artifact_missing`,
        message: `Command node ${nodeId} required ${kind} artifact ${artifact.path} was not resolved.`,
        source: "artifact-verifier",
        retryable: false
      }));
      continue;
    }
    if (resolvedArtifact.schema_valid !== true) {
      issues.push(nodeResultIssue({
        code: `required_${kind}_artifact_invalid`,
        message: `Command node ${nodeId} required ${kind} artifact ${artifact.path} did not pass artifact validation.`,
        source: "artifact-verifier",
        retryable: false
      }));
    }
  }
  return issues;
}

async function resolveDeclaredExecutionArtifacts({ rootDir, reportDate, artifacts }) {
  if (!Array.isArray(artifacts)) return artifacts;
  return Promise.all(artifacts.map((artifact) => resolveDeclaredExecutionArtifact({
    rootDir,
    reportDate,
    artifact
  })));
}

async function resolveDeclaredExecutionArtifact({ rootDir, reportDate, artifact }) {
  if (!isPlainObject(artifact)) return artifact;
  const declaredPath = artifact.path;
  const required = artifact.required === true;
  const missing = {
    path: declaredPath,
    required,
    exists: false,
    schema_valid: false,
    bytes: null,
    sha256: null
  };
  if (!nonEmptyString(declaredPath)) return missing;

  const materializedPath = materializeArtifactPath({ templatePath: declaredPath, reportDate });
  if (!isSafeRelativeTemplatePath(materializedPath)) return missing;
  const absolutePath = path.resolve(rootDir, materializedPath);
  if (!isPathWithinOrEqual({ parent: rootDir, child: absolutePath })) return missing;

  try {
    const stat = await fs.stat(absolutePath);
    if (!stat.isFile()) return missing;
    const bytes = await fs.readFile(absolutePath);
    return {
      path: declaredPath,
      required,
      exists: true,
      schema_valid: artifactJsonSchemaValid({ artifactPath: materializedPath, bytes }),
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex")
    };
  } catch {
    return missing;
  }
}

function materializeArtifactPath({ templatePath, reportDate }) {
  const [yyyy, mm] = String(reportDate || "").split("-");
  return String(templatePath || "")
    .replaceAll("{report_date}", reportDate)
    .replaceAll("{yyyy}", yyyy || "")
    .replaceAll("{mm}", mm || "");
}

function artifactJsonSchemaValid({ artifactPath, bytes }) {
  if (!String(artifactPath || "").toLowerCase().endsWith(".json")) return true;
  try {
    JSON.parse(bytes.toString("utf8"));
    return true;
  } catch {
    return false;
  }
}

function hasOwnOption(options, key) {
  return Object.prototype.hasOwnProperty.call(options, key);
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

function validateExecutableNodeMvpSummary(summary, failures) {
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
      "executed_commands",
      "codex_invocations",
      "next_action"
    ],
    label: "daily codex DAG executable-node MVP summary",
    failures
  });
  if (typeof summary.ok !== "boolean") {
    failures.push("daily codex DAG executable-node MVP summary ok must be a boolean.");
  }
  if (!Array.isArray(summary.failures)) {
    failures.push("daily codex DAG executable-node MVP summary failures must be an array.");
  } else {
    validateMessageArray(summary.failures, "daily codex DAG executable-node MVP summary failures", failures);
    if (summary.ok === true && summary.failures.length !== 0) {
      failures.push("daily codex DAG executable-node MVP summary failures must be empty when ok is true.");
    }
    if (summary.ok === false && summary.failures.length === 0) {
      failures.push("daily codex DAG executable-node MVP summary failures must be non-empty when ok is false.");
    }
  }
  if (!Array.isArray(summary.warnings)) {
    failures.push("daily codex DAG executable-node MVP summary warnings must be an array.");
  } else {
    validateMessageArray(summary.warnings, "daily codex DAG executable-node MVP summary warnings", failures);
  }
  if (summary.mode !== EXECUTABLE_NODE_MVP_MODE) {
    failures.push(`daily codex DAG executable-node MVP summary mode must be ${EXECUTABLE_NODE_MVP_MODE}.`);
  }
  if (!isStrictIsoDate(summary.report_date)) {
    failures.push("daily codex DAG executable-node MVP summary report_date must be a real YYYY-MM-DD date.");
  }
  if (!isCanonicalIsoTimestamp(summary.generated_at)) {
    failures.push("daily codex DAG executable-node MVP summary generated_at must be a canonical UTC Date#toISOString() string.");
  }
  if (!isStableIdentifier(summary.run_id)) {
    failures.push("daily codex DAG executable-node MVP summary run_id must be a stable identifier.");
  }
  if (!isPlainObject(summary.validation)) {
    failures.push("daily codex DAG executable-node MVP summary validation must be an object.");
  } else {
    validateValidationShape({
      validation: summary.validation,
      expectedOk: true,
      label: "daily codex DAG executable-node MVP summary validation",
      failures
    });
  }
  validateNextActionShape(summary.next_action, failures, "daily codex DAG executable-node MVP summary next_action", {
    allowedKinds: ["implement_real_dag_node_adapter"]
  });
  validateExecutableNodeMvpExecutedCommands(summary.executed_commands, failures);
  if (!Array.isArray(summary.codex_invocations) || summary.codex_invocations.length !== 0) {
    failures.push("daily codex DAG executable-node MVP summary codex_invocations must be empty.");
  }

  const plan = isPlainObject(summary.plan) ? summary.plan : null;
  const run = isPlainObject(summary.run) ? summary.run : null;
  if (!plan) failures.push("daily codex DAG executable-node MVP summary plan must be an object.");
  if (!run) failures.push("daily codex DAG executable-node MVP summary run must be an object.");
  if (!Array.isArray(summary.node_results)) failures.push("daily codex DAG executable-node MVP summary node_results must be an array.");
  if (!plan || !run || !Array.isArray(summary.node_results)) return;

  validatePlanShape(plan, failures, { allowNodeExecutable: true });
  validateRunShape(run, failures);
  validateContractRunNodeResultValidation(summary.node_result_validation, failures);

  const planNodes = Array.isArray(plan.nodes) ? plan.nodes : null;
  const planLevels = Array.isArray(plan.levels) ? plan.levels : null;
  if (!planNodes) failures.push("daily codex DAG executable-node MVP summary plan.nodes must be an array.");
  if (!planLevels) failures.push("daily codex DAG executable-node MVP summary plan.levels must be an array.");
  if (!planNodes || !planLevels) return;
  if (plan.node_count !== 1 || planNodes.length !== 1 || planNodes[0]?.id !== SYNTHETIC_EXECUTABLE_NODE_ID) {
    failures.push("daily codex DAG executable-node MVP summary plan must contain only the synthetic command node.");
  }

  const planNodeIds = planNodes.map((node) => isPlainObject(node) ? node.id : undefined);
  const levelPartition = validatePlanLevelPartition({ planNodes, planLevels, failures });
  validateExecutableNodeMvpRunSemantics({ summary, run, planLevels, planNodeIds, failures });
  validatePlanDependencyLevels({ planNodes, levelByNodeId: levelPartition.levelByNodeId, failures });

  const nodeResultValidation = validateExecutableNodeMvpNodeResults({
    plan,
    reportDate: summary.report_date,
    runId: summary.run_id,
    nodeResults: summary.node_results
  });
  failures.push(...nodeResultValidation.failures);
  if (isPlainObject(summary.node_result_validation)) {
    if (summary.node_result_validation.ok !== true) {
      failures.push("daily codex DAG executable-node MVP summary node_result_validation.ok must be true.");
    }
    if (summary.node_result_validation.checked_results !== summary.node_results.length) {
      failures.push("daily codex DAG executable-node MVP summary node_result_validation.checked_results must equal node_results length.");
    }
  }
}

function validateRealNodeAdapterMvpSummary(summary, failures) {
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
      "executed_commands",
      "codex_invocations",
      "next_action"
    ],
    label: "daily codex DAG real-node adapter MVP summary",
    failures
  });
  if (typeof summary.ok !== "boolean") {
    failures.push("daily codex DAG real-node adapter MVP summary ok must be a boolean.");
  }
  if (!Array.isArray(summary.failures)) {
    failures.push("daily codex DAG real-node adapter MVP summary failures must be an array.");
  } else {
    validateMessageArray(summary.failures, "daily codex DAG real-node adapter MVP summary failures", failures);
    if (summary.ok === true && summary.failures.length !== 0) {
      failures.push("daily codex DAG real-node adapter MVP summary failures must be empty when ok is true.");
    }
    if (summary.ok === false && summary.failures.length === 0) {
      failures.push("daily codex DAG real-node adapter MVP summary failures must be non-empty when ok is false.");
    }
  }
  if (!Array.isArray(summary.warnings)) {
    failures.push("daily codex DAG real-node adapter MVP summary warnings must be an array.");
  } else {
    validateMessageArray(summary.warnings, "daily codex DAG real-node adapter MVP summary warnings", failures);
  }
  if (summary.mode !== REAL_NODE_ADAPTER_MVP_MODE) {
    failures.push(`daily codex DAG real-node adapter MVP summary mode must be ${REAL_NODE_ADAPTER_MVP_MODE}.`);
  }
  if (!isStrictIsoDate(summary.report_date)) {
    failures.push("daily codex DAG real-node adapter MVP summary report_date must be a real YYYY-MM-DD date.");
  }
  if (!isCanonicalIsoTimestamp(summary.generated_at)) {
    failures.push("daily codex DAG real-node adapter MVP summary generated_at must be a canonical UTC Date#toISOString() string.");
  }
  if (!isStableIdentifier(summary.run_id)) {
    failures.push("daily codex DAG real-node adapter MVP summary run_id must be a stable identifier.");
  }
  if (!isPlainObject(summary.validation)) {
    failures.push("daily codex DAG real-node adapter MVP summary validation must be an object.");
  } else {
    validateValidationShape({
      validation: summary.validation,
      expectedOk: true,
      label: "daily codex DAG real-node adapter MVP summary validation",
      failures
    });
  }
  validateNextActionShape(summary.next_action, failures, "daily codex DAG real-node adapter MVP summary next_action", {
    allowedKinds: ["wire_multi_node_dag_executor"]
  });
  validateRealNodeAdapterMvpExecutedCommands(summary.executed_commands, failures);
  if (!Array.isArray(summary.codex_invocations) || summary.codex_invocations.length !== 0) {
    failures.push("daily codex DAG real-node adapter MVP summary codex_invocations must be empty.");
  }

  const plan = isPlainObject(summary.plan) ? summary.plan : null;
  const run = isPlainObject(summary.run) ? summary.run : null;
  if (!plan) failures.push("daily codex DAG real-node adapter MVP summary plan must be an object.");
  if (!run) failures.push("daily codex DAG real-node adapter MVP summary run must be an object.");
  if (!Array.isArray(summary.node_results)) failures.push("daily codex DAG real-node adapter MVP summary node_results must be an array.");
  if (!plan || !run || !Array.isArray(summary.node_results)) return;

  validatePlanShape(plan, failures, { allowNodeExecutable: true });
  validateRunShape(run, failures);
  validateContractRunNodeResultValidation(summary.node_result_validation, failures);

  const planNodes = Array.isArray(plan.nodes) ? plan.nodes : null;
  const planLevels = Array.isArray(plan.levels) ? plan.levels : null;
  if (!planNodes) failures.push("daily codex DAG real-node adapter MVP summary plan.nodes must be an array.");
  if (!planLevels) failures.push("daily codex DAG real-node adapter MVP summary plan.levels must be an array.");
  if (!planNodes || !planLevels) return;
  if (plan.node_count !== 1 || planNodes.length !== 1 || planNodes[0]?.id !== REAL_NODE_ADAPTER_TARGET_NODE_ID) {
    failures.push("daily codex DAG real-node adapter MVP summary plan must contain only the score node.");
  }

  const expectedSourceNode = expectedRealNodeAdapterSourceNode();
  validateRealNodeAdapterMvpPlanNodeAgainstExpected({
    planNode: planNodes[0],
    expectedSourceNode,
    failures
  });
  const planNodeIds = planNodes.map((node) => isPlainObject(node) ? node.id : undefined);
  validatePlanLevelPartition({ planNodes, planLevels, failures });
  validateRealNodeAdapterMvpRunSemantics({ summary, run, planLevels, planNodeIds, failures });

  const nodeResultValidation = validateRealNodeAdapterMvpNodeResults({
    plan,
    sourceNode: expectedSourceNode,
    reportDate: summary.report_date,
    runId: summary.run_id,
    nodeResults: summary.node_results
  });
  failures.push(...nodeResultValidation.failures);
  if (isPlainObject(summary.node_result_validation)) {
    if (summary.node_result_validation.ok !== true) {
      failures.push("daily codex DAG real-node adapter MVP summary node_result_validation.ok must be true.");
    }
    if (summary.node_result_validation.checked_results !== summary.node_results.length) {
      failures.push("daily codex DAG real-node adapter MVP summary node_result_validation.checked_results must equal node_results length.");
    }
  }
}

function validateSourceWatchCollectMvpSummary(summary, failures) {
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
      "source_watch",
      "node_results",
      "node_result_validation",
      "executed_commands",
      "codex_invocations",
      "next_action"
    ],
    label: "daily codex DAG source-watch collect MVP summary",
    failures
  });
  if (typeof summary.ok !== "boolean") {
    failures.push("daily codex DAG source-watch collect MVP summary ok must be a boolean.");
  }
  if (!Array.isArray(summary.failures)) {
    failures.push("daily codex DAG source-watch collect MVP summary failures must be an array.");
  } else {
    validateMessageArray(summary.failures, "daily codex DAG source-watch collect MVP summary failures", failures);
    if (summary.ok === true && summary.failures.length !== 0) {
      failures.push("daily codex DAG source-watch collect MVP summary failures must be empty when ok is true.");
    }
    if (summary.ok === false && summary.failures.length === 0) {
      failures.push("daily codex DAG source-watch collect MVP summary failures must be non-empty when ok is false.");
    }
  }
  if (!Array.isArray(summary.warnings)) {
    failures.push("daily codex DAG source-watch collect MVP summary warnings must be an array.");
  } else {
    validateMessageArray(summary.warnings, "daily codex DAG source-watch collect MVP summary warnings", failures);
  }
  if (summary.mode !== SOURCE_WATCH_COLLECT_MVP_MODE) {
    failures.push(`daily codex DAG source-watch collect MVP summary mode must be ${SOURCE_WATCH_COLLECT_MVP_MODE}.`);
  }
  if (!isStrictIsoDate(summary.report_date)) {
    failures.push("daily codex DAG source-watch collect MVP summary report_date must be a real YYYY-MM-DD date.");
  }
  if (!isCanonicalIsoTimestamp(summary.generated_at)) {
    failures.push("daily codex DAG source-watch collect MVP summary generated_at must be a canonical UTC Date#toISOString() string.");
  }
  if (!isStableIdentifier(summary.run_id)) {
    failures.push("daily codex DAG source-watch collect MVP summary run_id must be a stable identifier.");
  }
  if (!isPlainObject(summary.validation)) {
    failures.push("daily codex DAG source-watch collect MVP summary validation must be an object.");
  } else {
    validateValidationShape({
      validation: summary.validation,
      expectedOk: true,
      label: "daily codex DAG source-watch collect MVP summary validation",
      failures
    });
  }
  validateNextActionShape(summary.next_action, failures, "daily codex DAG source-watch collect MVP summary next_action", {
    allowedKinds: ["wire_parse_extract_source_watch_candidates"]
  });
  validateSourceWatchCollectMvpExecutedCommands(summary.executed_commands, failures);
  validateSourceWatchCollectSummaryShape(summary.source_watch, failures);
  if (!Array.isArray(summary.codex_invocations) || summary.codex_invocations.length !== 0) {
    failures.push("daily codex DAG source-watch collect MVP summary codex_invocations must be empty.");
  }

  const plan = isPlainObject(summary.plan) ? summary.plan : null;
  const run = isPlainObject(summary.run) ? summary.run : null;
  if (!plan) failures.push("daily codex DAG source-watch collect MVP summary plan must be an object.");
  if (!run) failures.push("daily codex DAG source-watch collect MVP summary run must be an object.");
  if (!Array.isArray(summary.node_results)) failures.push("daily codex DAG source-watch collect MVP summary node_results must be an array.");
  if (!plan || !run || !Array.isArray(summary.node_results)) return;

  validatePlanShape(plan, failures, { allowNodeExecutable: true });
  validateRunShape(run, failures);
  validateContractRunNodeResultValidation(summary.node_result_validation, failures);

  const planNodes = Array.isArray(plan.nodes) ? plan.nodes : null;
  const planLevels = Array.isArray(plan.levels) ? plan.levels : null;
  if (!planNodes) failures.push("daily codex DAG source-watch collect MVP summary plan.nodes must be an array.");
  if (!planLevels) failures.push("daily codex DAG source-watch collect MVP summary plan.levels must be an array.");
  if (!planNodes || !planLevels) return;
  if (plan.node_count !== 1 || planNodes.length !== 1 || planNodes[0]?.id !== SOURCE_WATCH_COLLECT_NODE_ID) {
    failures.push("daily codex DAG source-watch collect MVP summary plan must contain only the fetch-source-health node.");
  }

  const expectedSourceNode = expectedSourceWatchCollectSourceNode();
  validateSourceWatchCollectMvpPlanNodeAgainstExpected({
    planNode: planNodes[0],
    expectedSourceNode,
    failures
  });
  const planNodeIds = planNodes.map((node) => isPlainObject(node) ? node.id : undefined);
  validatePlanLevelPartition({ planNodes, planLevels, failures });
  validateSourceWatchCollectMvpRunSemantics({ summary, run, planLevels, planNodeIds, failures });

  const nodeResultValidation = validateSourceWatchCollectMvpNodeResults({
    plan,
    sourceNode: expectedSourceNode,
    reportDate: summary.report_date,
    runId: summary.run_id,
    nodeResults: summary.node_results
  });
  failures.push(...nodeResultValidation.failures);
  if (isPlainObject(summary.node_result_validation)) {
    if (summary.node_result_validation.ok !== true) {
      failures.push("daily codex DAG source-watch collect MVP summary node_result_validation.ok must be true.");
    }
    if (summary.node_result_validation.checked_results !== summary.node_results.length) {
      failures.push("daily codex DAG source-watch collect MVP summary node_result_validation.checked_results must equal node_results length.");
    }
  }
}

function validateSourceWatchDownstreamMvpSummary(summary, failures) {
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
      "source_watch",
      "downstream",
      "node_results",
      "node_result_validation",
      "executed_commands",
      "codex_invocations",
      "next_action"
    ],
    label: "daily codex DAG source-watch downstream MVP summary",
    failures
  });
  if (typeof summary.ok !== "boolean") {
    failures.push("daily codex DAG source-watch downstream MVP summary ok must be a boolean.");
  }
  if (!Array.isArray(summary.failures)) {
    failures.push("daily codex DAG source-watch downstream MVP summary failures must be an array.");
  } else {
    validateMessageArray(summary.failures, "daily codex DAG source-watch downstream MVP summary failures", failures);
    if (summary.ok === true && summary.failures.length !== 0) {
      failures.push("daily codex DAG source-watch downstream MVP summary failures must be empty when ok is true.");
    }
    if (summary.ok === false && summary.failures.length === 0) {
      failures.push("daily codex DAG source-watch downstream MVP summary failures must be non-empty when ok is false.");
    }
  }
  if (!Array.isArray(summary.warnings)) {
    failures.push("daily codex DAG source-watch downstream MVP summary warnings must be an array.");
  } else {
    validateMessageArray(summary.warnings, "daily codex DAG source-watch downstream MVP summary warnings", failures);
  }
  if (summary.mode !== SOURCE_WATCH_DOWNSTREAM_MVP_MODE) {
    failures.push(`daily codex DAG source-watch downstream MVP summary mode must be ${SOURCE_WATCH_DOWNSTREAM_MVP_MODE}.`);
  }
  if (!isStrictIsoDate(summary.report_date)) {
    failures.push("daily codex DAG source-watch downstream MVP summary report_date must be a real YYYY-MM-DD date.");
  }
  if (!isCanonicalIsoTimestamp(summary.generated_at)) {
    failures.push("daily codex DAG source-watch downstream MVP summary generated_at must be a canonical UTC Date#toISOString() string.");
  }
  if (!isStableIdentifier(summary.run_id)) {
    failures.push("daily codex DAG source-watch downstream MVP summary run_id must be a stable identifier.");
  }
  if (!isPlainObject(summary.validation)) {
    failures.push("daily codex DAG source-watch downstream MVP summary validation must be an object.");
  } else {
    validateValidationShape({
      validation: summary.validation,
      expectedOk: true,
      label: "daily codex DAG source-watch downstream MVP summary validation",
      failures
    });
  }
  validateNextActionShape(summary.next_action, failures, "daily codex DAG source-watch downstream MVP summary next_action", {
    allowedKinds: ["wire_normalize_canonicalize_source_watch_candidates"]
  });
  validateSourceWatchDownstreamMvpExecutedCommands({ summary, failures });
  validateSourceWatchCollectSummaryShape(summary.source_watch, failures);
  validateSourceWatchDownstreamSummaryShape(summary.downstream, failures);
  validateSourceWatchDownstreamSummaryConsistency(summary, failures);
  if (!Array.isArray(summary.codex_invocations) || summary.codex_invocations.length !== 0) {
    failures.push("daily codex DAG source-watch downstream MVP summary codex_invocations must be empty.");
  }

  const plan = isPlainObject(summary.plan) ? summary.plan : null;
  const run = isPlainObject(summary.run) ? summary.run : null;
  if (!plan) failures.push("daily codex DAG source-watch downstream MVP summary plan must be an object.");
  if (!run) failures.push("daily codex DAG source-watch downstream MVP summary run must be an object.");
  if (!Array.isArray(summary.node_results)) failures.push("daily codex DAG source-watch downstream MVP summary node_results must be an array.");
  if (!plan || !run || !Array.isArray(summary.node_results)) return;

  validatePlanShape(plan, failures, { allowNodeExecutable: true });
  validateRunShape(run, failures);
  validateContractRunNodeResultValidation(summary.node_result_validation, failures);

  const planNodes = Array.isArray(plan.nodes) ? plan.nodes : null;
  const planLevels = Array.isArray(plan.levels) ? plan.levels : null;
  if (!planNodes) failures.push("daily codex DAG source-watch downstream MVP summary plan.nodes must be an array.");
  if (!planLevels) failures.push("daily codex DAG source-watch downstream MVP summary plan.levels must be an array.");
  if (!planNodes || !planLevels) return;
  if (plan.node_count !== 2 || planNodes.length !== 2) {
    failures.push("daily codex DAG source-watch downstream MVP summary plan must contain exactly fetch-source-health and parse-extract.");
  }

  const expectedNodes = expectedSourceWatchDownstreamSourceNodes();
  for (let index = 0; index < expectedNodes.length; index += 1) {
    validateSourceWatchDownstreamMvpPlanNodeAgainstExpected({
      planNode: planNodes[index],
      expectedNode: expectedNodes[index],
      failures
    });
  }
  const planNodeIds = planNodes.map((node) => isPlainObject(node) ? node.id : undefined);
  const levelPartition = validatePlanLevelPartition({ planNodes, planLevels, failures });
  validatePlanDependencyLevels({ planNodes, levelByNodeId: levelPartition.levelByNodeId, failures });
  validateSourceWatchDownstreamMvpRunSemantics({ summary, run, planLevels, planNodeIds, failures });

  const nodeResultValidation = validateSourceWatchDownstreamMvpNodeResults({
    plan,
    reportDate: summary.report_date,
    runId: summary.run_id,
    nodeResults: summary.node_results
  });
  failures.push(...nodeResultValidation.failures);
  if (isPlainObject(summary.node_result_validation)) {
    if (summary.node_result_validation.ok !== true) {
      failures.push("daily codex DAG source-watch downstream MVP summary node_result_validation.ok must be true.");
    }
    if (summary.node_result_validation.checked_results !== summary.node_results.length) {
      failures.push("daily codex DAG source-watch downstream MVP summary node_result_validation.checked_results must equal node_results length.");
    }
  }
}

function validateSourceWatchNormalizeMvpSummary(summary, failures) {
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
      "source_watch",
      "downstream",
      "normalized",
      "node_results",
      "node_result_validation",
      "executed_commands",
      "codex_invocations",
      "next_action"
    ],
    label: "daily codex DAG source-watch normalize MVP summary",
    failures
  });
  if (typeof summary.ok !== "boolean") {
    failures.push("daily codex DAG source-watch normalize MVP summary ok must be a boolean.");
  }
  if (!Array.isArray(summary.failures)) {
    failures.push("daily codex DAG source-watch normalize MVP summary failures must be an array.");
  } else {
    validateMessageArray(summary.failures, "daily codex DAG source-watch normalize MVP summary failures", failures);
    if (summary.ok === true && summary.failures.length !== 0) {
      failures.push("daily codex DAG source-watch normalize MVP summary failures must be empty when ok is true.");
    }
    if (summary.ok === false && summary.failures.length === 0) {
      failures.push("daily codex DAG source-watch normalize MVP summary failures must be non-empty when ok is false.");
    }
  }
  if (!Array.isArray(summary.warnings)) {
    failures.push("daily codex DAG source-watch normalize MVP summary warnings must be an array.");
  } else {
    validateMessageArray(summary.warnings, "daily codex DAG source-watch normalize MVP summary warnings", failures);
  }
  if (summary.mode !== SOURCE_WATCH_NORMALIZE_MVP_MODE) {
    failures.push(`daily codex DAG source-watch normalize MVP summary mode must be ${SOURCE_WATCH_NORMALIZE_MVP_MODE}.`);
  }
  if (!isStrictIsoDate(summary.report_date)) {
    failures.push("daily codex DAG source-watch normalize MVP summary report_date must be a real YYYY-MM-DD date.");
  }
  if (!isCanonicalIsoTimestamp(summary.generated_at)) {
    failures.push("daily codex DAG source-watch normalize MVP summary generated_at must be a canonical UTC Date#toISOString() string.");
  }
  if (!isStableIdentifier(summary.run_id)) {
    failures.push("daily codex DAG source-watch normalize MVP summary run_id must be a stable identifier.");
  }
  if (!isPlainObject(summary.validation)) {
    failures.push("daily codex DAG source-watch normalize MVP summary validation must be an object.");
  } else {
    validateValidationShape({
      validation: summary.validation,
      expectedOk: true,
      label: "daily codex DAG source-watch normalize MVP summary validation",
      failures
    });
  }
  validateNextActionShape(summary.next_action, failures, "daily codex DAG source-watch normalize MVP summary next_action", {
    allowedKinds: ["wire_classify_tag_entity_source_watch_candidates"]
  });
  validateSourceWatchNormalizeMvpExecutedCommands({ summary, failures });
  validateSourceWatchCollectSummaryShape(summary.source_watch, failures);
  validateSourceWatchDownstreamSummaryShape(summary.downstream, failures);
  validateSourceWatchNormalizeSummaryShape(summary.normalized, failures);
  validateSourceWatchNormalizeSummaryConsistency(summary, failures);
  if (!Array.isArray(summary.codex_invocations) || summary.codex_invocations.length !== 0) {
    failures.push("daily codex DAG source-watch normalize MVP summary codex_invocations must be empty.");
  }

  const plan = isPlainObject(summary.plan) ? summary.plan : null;
  const run = isPlainObject(summary.run) ? summary.run : null;
  if (!plan) failures.push("daily codex DAG source-watch normalize MVP summary plan must be an object.");
  if (!run) failures.push("daily codex DAG source-watch normalize MVP summary run must be an object.");
  if (!Array.isArray(summary.node_results)) failures.push("daily codex DAG source-watch normalize MVP summary node_results must be an array.");
  if (!plan || !run || !Array.isArray(summary.node_results)) return;

  validatePlanShape(plan, failures, { allowNodeExecutable: true });
  validateRunShape(run, failures);
  validateContractRunNodeResultValidation(summary.node_result_validation, failures);

  const planNodes = Array.isArray(plan.nodes) ? plan.nodes : null;
  const planLevels = Array.isArray(plan.levels) ? plan.levels : null;
  if (!planNodes) failures.push("daily codex DAG source-watch normalize MVP summary plan.nodes must be an array.");
  if (!planLevels) failures.push("daily codex DAG source-watch normalize MVP summary plan.levels must be an array.");
  if (!planNodes || !planLevels) return;
  if (plan.node_count !== 3 || planNodes.length !== 3) {
    failures.push("daily codex DAG source-watch normalize MVP summary plan must contain exactly fetch-source-health, parse-extract, and normalize-canonicalize.");
  }

  const expectedNodes = expectedSourceWatchNormalizeSourceNodes();
  for (let index = 0; index < expectedNodes.length; index += 1) {
    validateSourceWatchDownstreamMvpPlanNodeAgainstExpected({
      planNode: planNodes[index],
      expectedNode: expectedNodes[index],
      failures
    });
  }
  const planNodeIds = planNodes.map((node) => isPlainObject(node) ? node.id : undefined);
  const levelPartition = validatePlanLevelPartition({ planNodes, planLevels, failures });
  validatePlanDependencyLevels({ planNodes, levelByNodeId: levelPartition.levelByNodeId, failures });
  validateSourceWatchNormalizeMvpRunSemantics({ summary, run, planLevels, planNodeIds, failures });

  const nodeResultValidation = validateSourceWatchNormalizeMvpNodeResults({
    plan,
    reportDate: summary.report_date,
    runId: summary.run_id,
    nodeResults: summary.node_results
  });
  failures.push(...nodeResultValidation.failures);
  if (isPlainObject(summary.node_result_validation)) {
    if (summary.node_result_validation.ok !== true) {
      failures.push("daily codex DAG source-watch normalize MVP summary node_result_validation.ok must be true.");
    }
    if (summary.node_result_validation.checked_results !== summary.node_results.length) {
      failures.push("daily codex DAG source-watch normalize MVP summary node_result_validation.checked_results must equal node_results length.");
    }
  }
}

function validateSourceWatchQualityMvpSummary(summary, failures) {
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
      "source_watch",
      "downstream",
      "normalized",
      "quality",
      "node_results",
      "node_result_validation",
      "executed_commands",
      "codex_invocations",
      "next_action"
    ],
    label: "daily codex DAG source-watch quality MVP summary",
    failures
  });
  if (typeof summary.ok !== "boolean") {
    failures.push("daily codex DAG source-watch quality MVP summary ok must be a boolean.");
  }
  if (!Array.isArray(summary.failures)) {
    failures.push("daily codex DAG source-watch quality MVP summary failures must be an array.");
  } else {
    validateMessageArray(summary.failures, "daily codex DAG source-watch quality MVP summary failures", failures);
    if (summary.ok === true && summary.failures.length !== 0) {
      failures.push("daily codex DAG source-watch quality MVP summary failures must be empty when ok is true.");
    }
    if (summary.ok === false && summary.failures.length === 0) {
      failures.push("daily codex DAG source-watch quality MVP summary failures must be non-empty when ok is false.");
    }
  }
  if (!Array.isArray(summary.warnings)) {
    failures.push("daily codex DAG source-watch quality MVP summary warnings must be an array.");
  } else {
    validateMessageArray(summary.warnings, "daily codex DAG source-watch quality MVP summary warnings", failures);
  }
  if (summary.mode !== SOURCE_WATCH_QUALITY_MVP_MODE) {
    failures.push(`daily codex DAG source-watch quality MVP summary mode must be ${SOURCE_WATCH_QUALITY_MVP_MODE}.`);
  }
  if (!isStrictIsoDate(summary.report_date)) {
    failures.push("daily codex DAG source-watch quality MVP summary report_date must be a real YYYY-MM-DD date.");
  }
  if (!isCanonicalIsoTimestamp(summary.generated_at)) {
    failures.push("daily codex DAG source-watch quality MVP summary generated_at must be a canonical UTC Date#toISOString() string.");
  }
  if (!isStableIdentifier(summary.run_id)) {
    failures.push("daily codex DAG source-watch quality MVP summary run_id must be a stable identifier.");
  }
  if (!isPlainObject(summary.validation)) {
    failures.push("daily codex DAG source-watch quality MVP summary validation must be an object.");
  } else {
    validateValidationShape({
      validation: summary.validation,
      expectedOk: true,
      label: "daily codex DAG source-watch quality MVP summary validation",
      failures
    });
  }
  validateNextActionShape(summary.next_action, failures, "daily codex DAG source-watch quality MVP summary next_action", {
    allowedKinds: ["promote_source_watch_quality_candidates_after_review"]
  });
  validateSourceWatchQualityMvpExecutedCommands({ summary, failures });
  validateSourceWatchCollectSummaryShape(summary.source_watch, failures);
  validateSourceWatchDownstreamSummaryShape(summary.downstream, failures);
  validateSourceWatchNormalizeSummaryShape(summary.normalized, failures);
  validateSourceWatchQualitySummaryShape(summary.quality, failures);
  validateSourceWatchQualitySummaryConsistency(summary, failures);
  if (!Array.isArray(summary.codex_invocations) || summary.codex_invocations.length !== 0) {
    failures.push("daily codex DAG source-watch quality MVP summary codex_invocations must be empty.");
  }

  const plan = isPlainObject(summary.plan) ? summary.plan : null;
  const run = isPlainObject(summary.run) ? summary.run : null;
  if (!plan) failures.push("daily codex DAG source-watch quality MVP summary plan must be an object.");
  if (!run) failures.push("daily codex DAG source-watch quality MVP summary run must be an object.");
  if (!Array.isArray(summary.node_results)) failures.push("daily codex DAG source-watch quality MVP summary node_results must be an array.");
  if (!plan || !run || !Array.isArray(summary.node_results)) return;

  validatePlanShape(plan, failures, { allowNodeExecutable: true });
  validateRunShape(run, failures);
  validateContractRunNodeResultValidation(summary.node_result_validation, failures);

  const planNodes = Array.isArray(plan.nodes) ? plan.nodes : null;
  const planLevels = Array.isArray(plan.levels) ? plan.levels : null;
  if (!planNodes) failures.push("daily codex DAG source-watch quality MVP summary plan.nodes must be an array.");
  if (!planLevels) failures.push("daily codex DAG source-watch quality MVP summary plan.levels must be an array.");
  if (!planNodes || !planLevels) return;
  if (plan.node_count !== 4 || planNodes.length !== 4) {
    failures.push("daily codex DAG source-watch quality MVP summary plan must contain exactly fetch-source-health, parse-extract, normalize-canonicalize, and freshness-history-check.");
  }

  const expectedNodes = expectedSourceWatchQualitySourceNodes();
  for (let index = 0; index < expectedNodes.length; index += 1) {
    validateSourceWatchDownstreamMvpPlanNodeAgainstExpected({
      planNode: planNodes[index],
      expectedNode: expectedNodes[index],
      failures
    });
  }
  const planNodeIds = planNodes.map((node) => isPlainObject(node) ? node.id : undefined);
  const levelPartition = validatePlanLevelPartition({ planNodes, planLevels, failures });
  validatePlanDependencyLevels({ planNodes, levelByNodeId: levelPartition.levelByNodeId, failures });
  validateSourceWatchQualityMvpRunSemantics({ summary, run, planLevels, planNodeIds, failures });

  const nodeResultValidation = validateSourceWatchQualityMvpNodeResults({
    plan,
    reportDate: summary.report_date,
    runId: summary.run_id,
    nodeResults: summary.node_results
  });
  failures.push(...nodeResultValidation.failures);
  if (isPlainObject(summary.node_result_validation)) {
    if (summary.node_result_validation.ok !== true) {
      failures.push("daily codex DAG source-watch quality MVP summary node_result_validation.ok must be true.");
    }
    if (summary.node_result_validation.checked_results !== summary.node_results.length) {
      failures.push("daily codex DAG source-watch quality MVP summary node_result_validation.checked_results must equal node_results length.");
    }
  }
}

function validateSourceWatchAdmitMvpSummary(summary, failures) {
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
      "source_watch",
      "downstream",
      "normalized",
      "quality",
      "admitted",
      "node_results",
      "node_result_validation",
      "executed_commands",
      "codex_invocations",
      "next_action"
    ],
    label: "daily codex DAG source-watch admit MVP summary",
    failures
  });
  if (typeof summary.ok !== "boolean") {
    failures.push("daily codex DAG source-watch admit MVP summary ok must be a boolean.");
  }
  if (!Array.isArray(summary.failures)) {
    failures.push("daily codex DAG source-watch admit MVP summary failures must be an array.");
  } else {
    validateMessageArray(summary.failures, "daily codex DAG source-watch admit MVP summary failures", failures);
    if (summary.ok === true && summary.failures.length !== 0) {
      failures.push("daily codex DAG source-watch admit MVP summary failures must be empty when ok is true.");
    }
    if (summary.ok === false && summary.failures.length === 0) {
      failures.push("daily codex DAG source-watch admit MVP summary failures must be non-empty when ok is false.");
    }
  }
  if (!Array.isArray(summary.warnings)) {
    failures.push("daily codex DAG source-watch admit MVP summary warnings must be an array.");
  } else {
    validateMessageArray(summary.warnings, "daily codex DAG source-watch admit MVP summary warnings", failures);
  }
  if (summary.mode !== SOURCE_WATCH_ADMIT_MVP_MODE) {
    failures.push(`daily codex DAG source-watch admit MVP summary mode must be ${SOURCE_WATCH_ADMIT_MVP_MODE}.`);
  }
  if (!isStrictIsoDate(summary.report_date)) {
    failures.push("daily codex DAG source-watch admit MVP summary report_date must be a real YYYY-MM-DD date.");
  }
  if (!isCanonicalIsoTimestamp(summary.generated_at)) {
    failures.push("daily codex DAG source-watch admit MVP summary generated_at must be a canonical UTC Date#toISOString() string.");
  }
  if (!isStableIdentifier(summary.run_id)) {
    failures.push("daily codex DAG source-watch admit MVP summary run_id must be a stable identifier.");
  }
  if (!isPlainObject(summary.validation)) {
    failures.push("daily codex DAG source-watch admit MVP summary validation must be an object.");
  } else {
    validateValidationShape({
      validation: summary.validation,
      expectedOk: true,
      label: "daily codex DAG source-watch admit MVP summary validation",
      failures
    });
  }
  validateNextActionShape(summary.next_action, failures, "daily codex DAG source-watch admit MVP summary next_action", {
    allowedKinds: ["wire_admitted_candidates_to_article_index"]
  });
  validateSourceWatchAdmitMvpExecutedCommands({ summary, failures });
  validateSourceWatchCollectSummaryShape(summary.source_watch, failures);
  validateSourceWatchDownstreamSummaryShape(summary.downstream, failures);
  validateSourceWatchNormalizeSummaryShape(summary.normalized, failures);
  validateSourceWatchQualitySummaryShape(summary.quality, failures);
  validateSourceWatchAdmitSummaryShape(summary.admitted, failures);
  validateSourceWatchAdmitSummaryConsistency(summary, failures);
  if (!Array.isArray(summary.codex_invocations) || summary.codex_invocations.length !== 0) {
    failures.push("daily codex DAG source-watch admit MVP summary codex_invocations must be empty.");
  }

  const plan = isPlainObject(summary.plan) ? summary.plan : null;
  const run = isPlainObject(summary.run) ? summary.run : null;
  if (!plan) failures.push("daily codex DAG source-watch admit MVP summary plan must be an object.");
  if (!run) failures.push("daily codex DAG source-watch admit MVP summary run must be an object.");
  if (!Array.isArray(summary.node_results)) failures.push("daily codex DAG source-watch admit MVP summary node_results must be an array.");
  if (!plan || !run || !Array.isArray(summary.node_results)) return;

  validatePlanShape(plan, failures, { allowNodeExecutable: true });
  validateRunShape(run, failures);
  validateContractRunNodeResultValidation(summary.node_result_validation, failures);

  const planNodes = Array.isArray(plan.nodes) ? plan.nodes : null;
  const planLevels = Array.isArray(plan.levels) ? plan.levels : null;
  if (!planNodes) failures.push("daily codex DAG source-watch admit MVP summary plan.nodes must be an array.");
  if (!planLevels) failures.push("daily codex DAG source-watch admit MVP summary plan.levels must be an array.");
  if (!planNodes || !planLevels) return;
  if (plan.node_count !== 5 || planNodes.length !== 5) {
    failures.push("daily codex DAG source-watch admit MVP summary plan must contain exactly fetch-source-health, parse-extract, normalize-canonicalize, freshness-history-check, and admit-reject.");
  }

  const expectedNodes = expectedSourceWatchAdmitSourceNodes();
  for (let index = 0; index < expectedNodes.length; index += 1) {
    validateSourceWatchDownstreamMvpPlanNodeAgainstExpected({
      planNode: planNodes[index],
      expectedNode: expectedNodes[index],
      failures
    });
  }
  const planNodeIds = planNodes.map((node) => isPlainObject(node) ? node.id : undefined);
  const levelPartition = validatePlanLevelPartition({ planNodes, planLevels, failures });
  validatePlanDependencyLevels({ planNodes, levelByNodeId: levelPartition.levelByNodeId, failures });
  validateSourceWatchAdmitMvpRunSemantics({ summary, run, planLevels, planNodeIds, failures });

  const nodeResultValidation = validateSourceWatchAdmitMvpNodeResults({
    plan,
    reportDate: summary.report_date,
    runId: summary.run_id,
    nodeResults: summary.node_results
  });
  failures.push(...nodeResultValidation.failures);
  if (isPlainObject(summary.node_result_validation)) {
    if (summary.node_result_validation.ok !== true) {
      failures.push("daily codex DAG source-watch admit MVP summary node_result_validation.ok must be true.");
    }
    if (summary.node_result_validation.checked_results !== summary.node_results.length) {
      failures.push("daily codex DAG source-watch admit MVP summary node_result_validation.checked_results must equal node_results length.");
    }
  }
}

function validateTwoNodeFixtureMvpSummary(summary, failures) {
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
      "executed_commands",
      "codex_invocations",
      "next_action"
    ],
    label: "daily codex DAG two-node fixture MVP summary",
    failures
  });
  if (typeof summary.ok !== "boolean") {
    failures.push("daily codex DAG two-node fixture MVP summary ok must be a boolean.");
  }
  if (!Array.isArray(summary.failures)) {
    failures.push("daily codex DAG two-node fixture MVP summary failures must be an array.");
  } else {
    validateMessageArray(summary.failures, "daily codex DAG two-node fixture MVP summary failures", failures);
    if (summary.ok === true && summary.failures.length !== 0) {
      failures.push("daily codex DAG two-node fixture MVP summary failures must be empty when ok is true.");
    }
    if (summary.ok === false && summary.failures.length === 0) {
      failures.push("daily codex DAG two-node fixture MVP summary failures must be non-empty when ok is false.");
    }
  }
  if (!Array.isArray(summary.warnings)) {
    failures.push("daily codex DAG two-node fixture MVP summary warnings must be an array.");
  } else {
    validateMessageArray(summary.warnings, "daily codex DAG two-node fixture MVP summary warnings", failures);
  }
  if (summary.mode !== TWO_NODE_FIXTURE_MVP_MODE) {
    failures.push(`daily codex DAG two-node fixture MVP summary mode must be ${TWO_NODE_FIXTURE_MVP_MODE}.`);
  }
  if (!isStrictIsoDate(summary.report_date)) {
    failures.push("daily codex DAG two-node fixture MVP summary report_date must be a real YYYY-MM-DD date.");
  }
  if (!isCanonicalIsoTimestamp(summary.generated_at)) {
    failures.push("daily codex DAG two-node fixture MVP summary generated_at must be a canonical UTC Date#toISOString() string.");
  }
  if (!isStableIdentifier(summary.run_id)) {
    failures.push("daily codex DAG two-node fixture MVP summary run_id must be a stable identifier.");
  }
  if (!isPlainObject(summary.validation)) {
    failures.push("daily codex DAG two-node fixture MVP summary validation must be an object.");
  } else {
    validateValidationShape({
      validation: summary.validation,
      expectedOk: true,
      label: "daily codex DAG two-node fixture MVP summary validation",
      failures
    });
  }
  validateNextActionShape(summary.next_action, failures, "daily codex DAG two-node fixture MVP summary next_action", {
    allowedKinds: ["add_artifact_business_schema_validation"]
  });
  validateTwoNodeFixtureMvpExecutedCommands({ summary, failures });
  if (!Array.isArray(summary.codex_invocations) || summary.codex_invocations.length !== 0) {
    failures.push("daily codex DAG two-node fixture MVP summary codex_invocations must be empty.");
  }

  const plan = isPlainObject(summary.plan) ? summary.plan : null;
  const run = isPlainObject(summary.run) ? summary.run : null;
  if (!plan) failures.push("daily codex DAG two-node fixture MVP summary plan must be an object.");
  if (!run) failures.push("daily codex DAG two-node fixture MVP summary run must be an object.");
  if (!Array.isArray(summary.node_results)) failures.push("daily codex DAG two-node fixture MVP summary node_results must be an array.");
  if (!plan || !run || !Array.isArray(summary.node_results)) return;

  validatePlanShape(plan, failures, { allowNodeExecutable: true });
  validateRunShape(run, failures);
  validateContractRunNodeResultValidation(summary.node_result_validation, failures);

  const planNodes = Array.isArray(plan.nodes) ? plan.nodes : null;
  const planLevels = Array.isArray(plan.levels) ? plan.levels : null;
  if (!planNodes) failures.push("daily codex DAG two-node fixture MVP summary plan.nodes must be an array.");
  if (!planLevels) failures.push("daily codex DAG two-node fixture MVP summary plan.levels must be an array.");
  if (!planNodes || !planLevels) return;
  if (plan.node_count !== 2 || planNodes.length !== 2) {
    failures.push("daily codex DAG two-node fixture MVP summary plan must contain exactly two nodes.");
  }

  const expectedNodes = expectedTwoNodeFixtureSourceNodes();
  for (let index = 0; index < expectedNodes.length; index += 1) {
    validateTwoNodeFixtureMvpPlanNodeAgainstExpected({
      planNode: planNodes[index],
      expectedNode: expectedNodes[index],
      failures
    });
  }
  const planNodeIds = planNodes.map((node) => isPlainObject(node) ? node.id : undefined);
  const levelPartition = validatePlanLevelPartition({ planNodes, planLevels, failures });
  validatePlanDependencyLevels({ planNodes, levelByNodeId: levelPartition.levelByNodeId, failures });
  validateTwoNodeFixtureMvpRunSemantics({ summary, run, planLevels, planNodeIds, failures });

  const nodeResultValidation = validateTwoNodeFixtureMvpNodeResults({
    plan,
    reportDate: summary.report_date,
    runId: summary.run_id,
    nodeResults: summary.node_results
  });
  failures.push(...nodeResultValidation.failures);
  if (isPlainObject(summary.node_result_validation)) {
    if (summary.node_result_validation.ok !== true) {
      failures.push("daily codex DAG two-node fixture MVP summary node_result_validation.ok must be true.");
    }
    if (summary.node_result_validation.checked_results !== summary.node_results.length) {
      failures.push("daily codex DAG two-node fixture MVP summary node_result_validation.checked_results must equal node_results length.");
    }
  }
}

function validateExecutableNodeMvpExecutedCommands(values, failures) {
  const label = "daily codex DAG executable-node MVP summary executed_commands";
  if (!Array.isArray(values)) {
    failures.push(`${label} must be an array.`);
    return;
  }
  if (values.length !== 1) {
    failures.push(`${label} length must be 1.`);
    return;
  }
  const command = values[0];
  if (!isPlainObject(command)) {
    failures.push(`${label} entry must be an object.`);
    return;
  }
  validateExactKeys({ value: command, allowed: ["node_id", "runner", "script"], label: `${label} entry`, failures });
  if (command.node_id !== SYNTHETIC_EXECUTABLE_NODE_ID) failures.push(`${label} entry.node_id must be ${SYNTHETIC_EXECUTABLE_NODE_ID}.`);
  if (command.runner !== "node") failures.push(`${label} entry.runner must be node.`);
  if (command.script !== SYNTHETIC_EXECUTABLE_SCRIPT) failures.push(`${label} entry.script must be ${SYNTHETIC_EXECUTABLE_SCRIPT}.`);
}

function validateRealNodeAdapterMvpExecutedCommands(values, failures) {
  const label = "daily codex DAG real-node adapter MVP summary executed_commands";
  if (!Array.isArray(values)) {
    failures.push(`${label} must be an array.`);
    return;
  }
  if (values.length !== 1) {
    failures.push(`${label} length must be 1.`);
    return;
  }
  const command = values[0];
  if (!isPlainObject(command)) {
    failures.push(`${label} entry must be an object.`);
    return;
  }
  validateExactKeys({ value: command, allowed: ["node_id", "runner", "script"], label: `${label} entry`, failures });
  if (command.node_id !== REAL_NODE_ADAPTER_TARGET_NODE_ID) failures.push(`${label} entry.node_id must be ${REAL_NODE_ADAPTER_TARGET_NODE_ID}.`);
  if (command.runner !== "node") failures.push(`${label} entry.runner must be node.`);
  if (command.script !== REAL_NODE_ADAPTER_SCRIPT) failures.push(`${label} entry.script must be ${REAL_NODE_ADAPTER_SCRIPT}.`);
}

function validateSourceWatchCollectMvpExecutedCommands(values, failures) {
  const label = "daily codex DAG source-watch collect MVP summary executed_commands";
  if (!Array.isArray(values)) {
    failures.push(`${label} must be an array.`);
    return;
  }
  if (values.length !== 1) {
    failures.push(`${label} length must be 1.`);
    return;
  }
  const command = values[0];
  if (!isPlainObject(command)) {
    failures.push(`${label} entry must be an object.`);
    return;
  }
  validateExactKeys({ value: command, allowed: ["node_id", "runner", "script"], label: `${label} entry`, failures });
  if (command.node_id !== SOURCE_WATCH_COLLECT_NODE_ID) failures.push(`${label} entry.node_id must be ${SOURCE_WATCH_COLLECT_NODE_ID}.`);
  if (command.runner !== "node") failures.push(`${label} entry.runner must be node.`);
  if (command.script !== SOURCE_WATCH_COLLECT_SCRIPT) failures.push(`${label} entry.script must be ${SOURCE_WATCH_COLLECT_SCRIPT}.`);
}

function validateSourceWatchDownstreamMvpExecutedCommands({ summary, failures }) {
  const label = "daily codex DAG source-watch downstream MVP summary executed_commands";
  const values = summary.executed_commands;
  if (!Array.isArray(values)) {
    failures.push(`${label} must be an array.`);
    return;
  }
  const downstreamResult = Array.isArray(summary.node_results)
    ? summary.node_results.find((result) => result?.node_id === SOURCE_WATCH_DOWNSTREAM_NODE_ID)
    : null;
  const expectedCommands = downstreamResult?.status === "blocked"
    ? [{
        node_id: SOURCE_WATCH_COLLECT_NODE_ID,
        script: SOURCE_WATCH_COLLECT_SCRIPT
      }]
    : [{
        node_id: SOURCE_WATCH_COLLECT_NODE_ID,
        script: SOURCE_WATCH_COLLECT_SCRIPT
      }, {
        node_id: SOURCE_WATCH_DOWNSTREAM_NODE_ID,
        script: SOURCE_WATCH_DOWNSTREAM_SCRIPT
      }];
  if (values.length !== expectedCommands.length) {
    failures.push(`${label} length must match attempted source-watch commands.`);
    return;
  }
  for (let index = 0; index < expectedCommands.length; index += 1) {
    const command = values[index];
    const expected = expectedCommands[index];
    if (!isPlainObject(command)) {
      failures.push(`${label} entry must be an object.`);
      return;
    }
    validateExactKeys({ value: command, allowed: ["node_id", "runner", "script"], label: `${label} entry`, failures });
    if (command.node_id !== expected.node_id) failures.push(`${label} entry.node_id must be ${expected.node_id}.`);
    if (command.runner !== "node") failures.push(`${label} entry.runner must be node.`);
    if (command.script !== expected.script) failures.push(`${label} entry.script must be ${expected.script}.`);
  }
}

function validateSourceWatchNormalizeMvpExecutedCommands({ summary, failures }) {
  const label = "daily codex DAG source-watch normalize MVP summary executed_commands";
  const values = summary.executed_commands;
  if (!Array.isArray(values)) {
    failures.push(`${label} must be an array.`);
    return;
  }
  const normalizeResult = Array.isArray(summary.node_results)
    ? summary.node_results.find((result) => result?.node_id === SOURCE_WATCH_NORMALIZE_NODE_ID)
    : null;
  const downstreamResult = Array.isArray(summary.node_results)
    ? summary.node_results.find((result) => result?.node_id === SOURCE_WATCH_DOWNSTREAM_NODE_ID)
    : null;
  const expectedCommands = [{
    node_id: SOURCE_WATCH_COLLECT_NODE_ID,
    script: SOURCE_WATCH_COLLECT_SCRIPT
  }];
  if (downstreamResult?.status !== "blocked") {
    expectedCommands.push({
      node_id: SOURCE_WATCH_DOWNSTREAM_NODE_ID,
      script: SOURCE_WATCH_DOWNSTREAM_SCRIPT
    });
  }
  if (normalizeResult?.status !== "blocked") {
    expectedCommands.push({
      node_id: SOURCE_WATCH_NORMALIZE_NODE_ID,
      script: SOURCE_WATCH_NORMALIZE_SCRIPT
    });
  }
  if (values.length !== expectedCommands.length) {
    failures.push(`${label} length must match attempted source-watch commands.`);
    return;
  }
  for (let index = 0; index < expectedCommands.length; index += 1) {
    const command = values[index];
    const expected = expectedCommands[index];
    if (!isPlainObject(command)) {
      failures.push(`${label} entry must be an object.`);
      return;
    }
    validateExactKeys({ value: command, allowed: ["node_id", "runner", "script"], label: `${label} entry`, failures });
    if (command.node_id !== expected.node_id) failures.push(`${label} entry.node_id must be ${expected.node_id}.`);
    if (command.runner !== "node") failures.push(`${label} entry.runner must be node.`);
    if (command.script !== expected.script) failures.push(`${label} entry.script must be ${expected.script}.`);
  }
}

function validateSourceWatchQualityMvpExecutedCommands({ summary, failures }) {
  const label = "daily codex DAG source-watch quality MVP summary executed_commands";
  const values = summary.executed_commands;
  if (!Array.isArray(values)) {
    failures.push(`${label} must be an array.`);
    return;
  }
  const nodeResults = Array.isArray(summary.node_results) ? summary.node_results : [];
  const downstreamResult = nodeResults.find((result) => result?.node_id === SOURCE_WATCH_DOWNSTREAM_NODE_ID);
  const normalizeResult = nodeResults.find((result) => result?.node_id === SOURCE_WATCH_NORMALIZE_NODE_ID);
  const qualityResult = nodeResults.find((result) => result?.node_id === SOURCE_WATCH_QUALITY_NODE_ID);
  const expectedCommands = [{
    node_id: SOURCE_WATCH_COLLECT_NODE_ID,
    script: SOURCE_WATCH_COLLECT_SCRIPT
  }];
  if (downstreamResult?.status !== "blocked") {
    expectedCommands.push({
      node_id: SOURCE_WATCH_DOWNSTREAM_NODE_ID,
      script: SOURCE_WATCH_DOWNSTREAM_SCRIPT
    });
  }
  if (normalizeResult?.status !== "blocked") {
    expectedCommands.push({
      node_id: SOURCE_WATCH_NORMALIZE_NODE_ID,
      script: SOURCE_WATCH_NORMALIZE_SCRIPT
    });
  }
  if (qualityResult?.status !== "blocked") {
    expectedCommands.push({
      node_id: SOURCE_WATCH_QUALITY_NODE_ID,
      script: SOURCE_WATCH_QUALITY_SCRIPT
    });
  }
  if (values.length !== expectedCommands.length) {
    failures.push(`${label} length must match attempted source-watch commands.`);
    return;
  }
  for (let index = 0; index < expectedCommands.length; index += 1) {
    const command = values[index];
    const expected = expectedCommands[index];
    if (!isPlainObject(command)) {
      failures.push(`${label} entry must be an object.`);
      return;
    }
    validateExactKeys({ value: command, allowed: ["node_id", "runner", "script"], label: `${label} entry`, failures });
    if (command.node_id !== expected.node_id) failures.push(`${label} entry.node_id must be ${expected.node_id}.`);
    if (command.runner !== "node") failures.push(`${label} entry.runner must be node.`);
    if (command.script !== expected.script) failures.push(`${label} entry.script must be ${expected.script}.`);
  }
}

function validateSourceWatchAdmitMvpExecutedCommands({ summary, failures }) {
  const label = "daily codex DAG source-watch admit MVP summary executed_commands";
  const values = summary.executed_commands;
  if (!Array.isArray(values)) {
    failures.push(`${label} must be an array.`);
    return;
  }
  const nodeResults = Array.isArray(summary.node_results) ? summary.node_results : [];
  const downstreamResult = nodeResults.find((result) => result?.node_id === SOURCE_WATCH_DOWNSTREAM_NODE_ID);
  const normalizeResult = nodeResults.find((result) => result?.node_id === SOURCE_WATCH_NORMALIZE_NODE_ID);
  const qualityResult = nodeResults.find((result) => result?.node_id === SOURCE_WATCH_QUALITY_NODE_ID);
  const admitResult = nodeResults.find((result) => result?.node_id === SOURCE_WATCH_ADMIT_NODE_ID);
  const expectedCommands = [{
    node_id: SOURCE_WATCH_COLLECT_NODE_ID,
    script: SOURCE_WATCH_COLLECT_SCRIPT
  }];
  if (downstreamResult?.status !== "blocked") {
    expectedCommands.push({
      node_id: SOURCE_WATCH_DOWNSTREAM_NODE_ID,
      script: SOURCE_WATCH_DOWNSTREAM_SCRIPT
    });
  }
  if (normalizeResult?.status !== "blocked") {
    expectedCommands.push({
      node_id: SOURCE_WATCH_NORMALIZE_NODE_ID,
      script: SOURCE_WATCH_NORMALIZE_SCRIPT
    });
  }
  if (qualityResult?.status !== "blocked") {
    expectedCommands.push({
      node_id: SOURCE_WATCH_QUALITY_NODE_ID,
      script: SOURCE_WATCH_QUALITY_SCRIPT
    });
  }
  if (admitResult?.status !== "blocked") {
    expectedCommands.push({
      node_id: SOURCE_WATCH_ADMIT_NODE_ID,
      script: SOURCE_WATCH_ADMIT_SCRIPT
    });
  }
  if (values.length !== expectedCommands.length) {
    failures.push(`${label} length must match attempted source-watch commands.`);
    return;
  }
  for (let index = 0; index < expectedCommands.length; index += 1) {
    const command = values[index];
    const expected = expectedCommands[index];
    if (!isPlainObject(command)) {
      failures.push(`${label} entry must be an object.`);
      return;
    }
    validateExactKeys({ value: command, allowed: ["node_id", "runner", "script"], label: `${label} entry`, failures });
    if (command.node_id !== expected.node_id) failures.push(`${label} entry.node_id must be ${expected.node_id}.`);
    if (command.runner !== "node") failures.push(`${label} entry.runner must be node.`);
    if (command.script !== expected.script) failures.push(`${label} entry.script must be ${expected.script}.`);
  }
}

function validateSourceWatchCollectSummaryShape(summary, failures) {
  const label = "daily codex DAG source-watch collect MVP summary source_watch";
  if (!isPlainObject(summary)) {
    failures.push(`${label} must be an object.`);
    return;
  }
  validateExactKeys({
    value: summary,
    allowed: [
      "artifact_path",
      "artifact_kind",
      "watched_repos",
      "fetched_repos",
      "changed_repos",
      "watched_sites",
      "fetched_sites",
      "github_candidates_found",
      "site_candidates_found",
      "total_candidates_found",
      "failure_count",
      "empty",
      "rate_limits"
    ],
    label,
    failures
  });
  if (summary.artifact_path !== SOURCE_WATCH_COLLECT_OUTPUT_ARTIFACT) failures.push(`${label}.artifact_path must be ${SOURCE_WATCH_COLLECT_OUTPUT_ARTIFACT}.`);
  if (summary.artifact_kind !== "source_watch_candidates") failures.push(`${label}.artifact_kind must be source_watch_candidates.`);
  for (const key of [
    "watched_repos",
    "fetched_repos",
    "changed_repos",
    "watched_sites",
    "fetched_sites",
    "github_candidates_found",
    "site_candidates_found",
    "total_candidates_found",
    "failure_count"
  ]) {
    if (!Number.isInteger(summary[key]) || summary[key] < 0) {
      failures.push(`${label}.${key} must be a non-negative integer.`);
    }
  }
  if (typeof summary.empty !== "boolean") failures.push(`${label}.empty must be a boolean.`);
  if (
    Number.isInteger(summary.github_candidates_found)
    && Number.isInteger(summary.site_candidates_found)
    && Number.isInteger(summary.total_candidates_found)
    && summary.total_candidates_found !== summary.github_candidates_found + summary.site_candidates_found
  ) {
    failures.push(`${label}.total_candidates_found must equal github_candidates_found plus site_candidates_found.`);
  }
  if (typeof summary.empty === "boolean" && Number.isInteger(summary.total_candidates_found)) {
    const expectedEmpty = summary.total_candidates_found === 0;
    if (summary.empty !== expectedEmpty) failures.push(`${label}.empty must reflect whether total_candidates_found is zero.`);
  }
  if (
    Number.isInteger(summary.watched_repos)
    && Number.isInteger(summary.fetched_repos)
    && summary.fetched_repos > summary.watched_repos
  ) {
    failures.push(`${label}.fetched_repos must not exceed watched_repos.`);
  }
  if (
    Number.isInteger(summary.fetched_repos)
    && Number.isInteger(summary.changed_repos)
    && summary.changed_repos > summary.fetched_repos
  ) {
    failures.push(`${label}.changed_repos must not exceed fetched_repos.`);
  }
  if (
    Number.isInteger(summary.watched_sites)
    && Number.isInteger(summary.fetched_sites)
    && summary.fetched_sites > summary.watched_sites
  ) {
    failures.push(`${label}.fetched_sites must not exceed watched_sites.`);
  }
  if (
    Number.isInteger(summary.failure_count)
    && Number.isInteger(summary.watched_repos)
    && Number.isInteger(summary.watched_sites)
    && summary.failure_count > summary.watched_repos + summary.watched_sites
  ) {
    failures.push(`${label}.failure_count must not exceed watched_repos plus watched_sites.`);
  }
  if (!Array.isArray(summary.rate_limits)) {
    failures.push(`${label}.rate_limits must be an array.`);
  } else {
    for (const [index, snapshot] of summary.rate_limits.entries()) {
      const itemLabel = `${label}.rate_limits[${index}]`;
      if (!isPlainObject(snapshot)) {
        failures.push(`${itemLabel} must be an object.`);
        continue;
      }
      validateExactKeys({ value: snapshot, allowed: ["repo", "limit", "remaining", "used", "reset", "resource"], label: itemLabel, failures });
      for (const key of ["repo", "limit", "remaining", "used", "reset", "resource"]) {
        if (typeof snapshot[key] !== "string") failures.push(`${itemLabel}.${key} must be a string.`);
      }
    }
  }
}

function validateSourceWatchDownstreamSummaryShape(summary, failures) {
  const label = "daily codex DAG source-watch downstream MVP summary downstream";
  if (!isPlainObject(summary)) {
    failures.push(`${label} must be an object.`);
    return;
  }
  validateExactKeys({
    value: summary,
    allowed: [
      "artifact_path",
      "artifact_kind",
      "input_kind",
      "total_candidates",
      "github_watch_candidates",
      "site_watch_candidates",
      "other_candidates",
      "empty",
      "signals"
    ],
    label,
    failures
  });
  if (summary.artifact_path !== SOURCE_WATCH_DOWNSTREAM_OUTPUT_ARTIFACT) failures.push(`${label}.artifact_path must be ${SOURCE_WATCH_DOWNSTREAM_OUTPUT_ARTIFACT}.`);
  if (summary.artifact_kind !== "source_watch_extracted_candidates") failures.push(`${label}.artifact_kind must be source_watch_extracted_candidates.`);
  if (summary.input_kind !== "source_watch_candidates") failures.push(`${label}.input_kind must be source_watch_candidates.`);
  for (const key of ["total_candidates", "github_watch_candidates", "site_watch_candidates", "other_candidates"]) {
    if (!Number.isInteger(summary[key]) || summary[key] < 0) {
      failures.push(`${label}.${key} must be a non-negative integer.`);
    }
  }
  if (typeof summary.empty !== "boolean") failures.push(`${label}.empty must be a boolean.`);
  if (
    Number.isInteger(summary.github_watch_candidates)
    && Number.isInteger(summary.site_watch_candidates)
    && Number.isInteger(summary.other_candidates)
    && Number.isInteger(summary.total_candidates)
    && summary.total_candidates !== summary.github_watch_candidates + summary.site_watch_candidates + summary.other_candidates
  ) {
    failures.push(`${label}.total_candidates must equal github_watch_candidates plus site_watch_candidates plus other_candidates.`);
  }
  if (typeof summary.empty === "boolean" && Number.isInteger(summary.total_candidates)) {
    const expectedEmpty = summary.total_candidates === 0;
    if (summary.empty !== expectedEmpty) failures.push(`${label}.empty must reflect whether total_candidates is zero.`);
  }
  if (!Array.isArray(summary.signals)) {
    failures.push(`${label}.signals must be an array.`);
  } else {
    if (!sameOrderedStringArray(summary.signals, uniqueSorted(summary.signals))) {
      failures.push(`${label}.signals must be unique and sorted.`);
    }
    for (const [index, signal] of summary.signals.entries()) {
      if (!nonBlankString(signal)) failures.push(`${label}.signals[${index}] must be a non-empty string.`);
    }
  }
}

function validateSourceWatchNormalizeSummaryShape(summary, failures) {
  const label = "daily codex DAG source-watch normalize MVP summary normalized";
  if (!isPlainObject(summary)) {
    failures.push(`${label} must be an object.`);
    return;
  }
  validateExactKeys({
    value: summary,
    allowed: [
      "artifact_path",
      "artifact_kind",
      "input_kind",
      "total_candidates",
      "github_watch_candidates",
      "site_watch_candidates",
      "other_candidates",
      "empty",
      "signals"
    ],
    label,
    failures
  });
  if (summary.artifact_path !== SOURCE_WATCH_NORMALIZE_OUTPUT_ARTIFACT) failures.push(`${label}.artifact_path must be ${SOURCE_WATCH_NORMALIZE_OUTPUT_ARTIFACT}.`);
  if (summary.artifact_kind !== "source_watch_canonical_candidates") failures.push(`${label}.artifact_kind must be source_watch_canonical_candidates.`);
  if (summary.input_kind !== "source_watch_extracted_candidates") failures.push(`${label}.input_kind must be source_watch_extracted_candidates.`);
  for (const key of ["total_candidates", "github_watch_candidates", "site_watch_candidates", "other_candidates"]) {
    if (!Number.isInteger(summary[key]) || summary[key] < 0) {
      failures.push(`${label}.${key} must be a non-negative integer.`);
    }
  }
  if (typeof summary.empty !== "boolean") failures.push(`${label}.empty must be a boolean.`);
  if (
    Number.isInteger(summary.github_watch_candidates)
    && Number.isInteger(summary.site_watch_candidates)
    && Number.isInteger(summary.other_candidates)
    && Number.isInteger(summary.total_candidates)
    && summary.total_candidates !== summary.github_watch_candidates + summary.site_watch_candidates + summary.other_candidates
  ) {
    failures.push(`${label}.total_candidates must equal github_watch_candidates plus site_watch_candidates plus other_candidates.`);
  }
  if (typeof summary.empty === "boolean" && Number.isInteger(summary.total_candidates)) {
    const expectedEmpty = summary.total_candidates === 0;
    if (summary.empty !== expectedEmpty) failures.push(`${label}.empty must reflect whether total_candidates is zero.`);
  }
  if (!Array.isArray(summary.signals)) {
    failures.push(`${label}.signals must be an array.`);
  } else {
    if (!sameOrderedStringArray(summary.signals, uniqueSorted(summary.signals))) {
      failures.push(`${label}.signals must be unique and sorted.`);
    }
    for (const [index, signal] of summary.signals.entries()) {
      if (!nonBlankString(signal)) failures.push(`${label}.signals[${index}] must be a non-empty string.`);
    }
  }
}

function validateSourceWatchQualitySummaryShape(summary, failures) {
  const label = "daily codex DAG source-watch quality MVP summary quality";
  if (!isPlainObject(summary)) {
    failures.push(`${label} must be an object.`);
    return;
  }
  validateExactKeys({
    value: summary,
    allowed: [
      "artifact_path",
      "artifact_kind",
      "input_kind",
      "total_candidates",
      "admitted_candidates",
      "suppressed_candidates",
      "duplicate_candidates",
      "stale_candidates",
      "unchanged_repo_candidates",
      "github_watch_candidates",
      "site_watch_candidates",
      "other_candidates",
      "empty",
      "signals",
      "suppressed_reasons",
      "public_surface"
    ],
    label,
    failures
  });
  if (summary.artifact_path !== SOURCE_WATCH_QUALITY_OUTPUT_ARTIFACT) failures.push(`${label}.artifact_path must be ${SOURCE_WATCH_QUALITY_OUTPUT_ARTIFACT}.`);
  if (summary.artifact_kind !== "source_watch_quality_candidates") failures.push(`${label}.artifact_kind must be source_watch_quality_candidates.`);
  if (summary.input_kind !== "source_watch_canonical_candidates") failures.push(`${label}.input_kind must be source_watch_canonical_candidates.`);
  for (const key of [
    "total_candidates",
    "admitted_candidates",
    "suppressed_candidates",
    "duplicate_candidates",
    "stale_candidates",
    "unchanged_repo_candidates",
    "github_watch_candidates",
    "site_watch_candidates",
    "other_candidates"
  ]) {
    if (!Number.isInteger(summary[key]) || summary[key] < 0) {
      failures.push(`${label}.${key} must be a non-negative integer.`);
    }
  }
  if (typeof summary.empty !== "boolean") failures.push(`${label}.empty must be a boolean.`);
  if (typeof summary.public_surface !== "boolean") failures.push(`${label}.public_surface must be a boolean.`);
  if (
    Number.isInteger(summary.admitted_candidates)
    && Number.isInteger(summary.suppressed_candidates)
    && Number.isInteger(summary.total_candidates)
    && summary.total_candidates !== summary.admitted_candidates + summary.suppressed_candidates
  ) {
    failures.push(`${label}.total_candidates must equal admitted_candidates plus suppressed_candidates.`);
  }
  if (
    Number.isInteger(summary.github_watch_candidates)
    && Number.isInteger(summary.site_watch_candidates)
    && Number.isInteger(summary.other_candidates)
    && Number.isInteger(summary.total_candidates)
    && summary.total_candidates !== summary.github_watch_candidates + summary.site_watch_candidates + summary.other_candidates
  ) {
    failures.push(`${label}.total_candidates must equal github_watch_candidates plus site_watch_candidates plus other_candidates.`);
  }
  if (typeof summary.empty === "boolean" && Number.isInteger(summary.total_candidates)) {
    const expectedEmpty = summary.total_candidates === 0;
    if (summary.empty !== expectedEmpty) failures.push(`${label}.empty must reflect whether total_candidates is zero.`);
  }
  for (const key of ["signals", "suppressed_reasons"]) {
    if (!Array.isArray(summary[key])) {
      failures.push(`${label}.${key} must be an array.`);
    } else {
      if (!sameOrderedStringArray(summary[key], uniqueSorted(summary[key]))) {
        failures.push(`${label}.${key} must be unique and sorted.`);
      }
      for (const [index, value] of summary[key].entries()) {
        if (!nonBlankString(value)) failures.push(`${label}.${key}[${index}] must be a non-empty string.`);
      }
    }
  }
}

function validateSourceWatchAdmitSummaryShape(summary, failures) {
  const label = "daily codex DAG source-watch admit MVP summary admitted";
  if (!isPlainObject(summary)) {
    failures.push(`${label} must be an object.`);
    return;
  }
  validateExactKeys({
    value: summary,
    allowed: [
      "artifact_path",
      "artifact_kind",
      "input_kind",
      "total_candidates",
      "github_watch_candidates",
      "site_watch_candidates",
      "other_candidates",
      "empty",
      "signals",
      "public_surface"
    ],
    label,
    failures
  });
  if (summary.artifact_path !== SOURCE_WATCH_ADMIT_OUTPUT_ARTIFACT) failures.push(`${label}.artifact_path must be ${SOURCE_WATCH_ADMIT_OUTPUT_ARTIFACT}.`);
  if (summary.artifact_kind !== "source_watch_admitted_candidates") failures.push(`${label}.artifact_kind must be source_watch_admitted_candidates.`);
  if (summary.input_kind !== "source_watch_quality_candidates") failures.push(`${label}.input_kind must be source_watch_quality_candidates.`);
  for (const key of [
    "total_candidates",
    "github_watch_candidates",
    "site_watch_candidates",
    "other_candidates"
  ]) {
    if (!Number.isInteger(summary[key]) || summary[key] < 0) {
      failures.push(`${label}.${key} must be a non-negative integer.`);
    }
  }
  if (typeof summary.empty !== "boolean") failures.push(`${label}.empty must be a boolean.`);
  if (typeof summary.public_surface !== "boolean") failures.push(`${label}.public_surface must be a boolean.`);
  if (
    Number.isInteger(summary.github_watch_candidates)
    && Number.isInteger(summary.site_watch_candidates)
    && Number.isInteger(summary.other_candidates)
    && Number.isInteger(summary.total_candidates)
    && summary.total_candidates !== summary.github_watch_candidates + summary.site_watch_candidates + summary.other_candidates
  ) {
    failures.push(`${label}.total_candidates must equal github_watch_candidates plus site_watch_candidates plus other_candidates.`);
  }
  if (typeof summary.empty === "boolean" && Number.isInteger(summary.total_candidates)) {
    const expectedEmpty = summary.total_candidates === 0;
    if (summary.empty !== expectedEmpty) failures.push(`${label}.empty must reflect whether total_candidates is zero.`);
  }
  if (!Array.isArray(summary.signals)) {
    failures.push(`${label}.signals must be an array.`);
  } else {
    if (!sameOrderedStringArray(summary.signals, uniqueSorted(summary.signals))) {
      failures.push(`${label}.signals must be unique and sorted.`);
    }
    for (const [index, value] of summary.signals.entries()) {
      if (!nonBlankString(value)) failures.push(`${label}.signals[${index}] must be a non-empty string.`);
    }
  }
}

function validateSourceWatchDownstreamSummaryConsistency(summary, failures) {
  if (sourceWatchSummaryNodeStatus(summary, SOURCE_WATCH_DOWNSTREAM_NODE_ID) !== "success") return;
  if (!isPlainObject(summary.source_watch) || !isPlainObject(summary.downstream)) return;
  if (
    Number.isInteger(summary.source_watch.total_candidates_found)
    && Number.isInteger(summary.downstream.total_candidates)
    && summary.downstream.total_candidates !== summary.source_watch.total_candidates_found
  ) {
    failures.push("daily codex DAG source-watch downstream MVP summary downstream.total_candidates must equal source_watch.total_candidates_found.");
  }
  if (
    Number.isInteger(summary.source_watch.github_candidates_found)
    && Number.isInteger(summary.downstream.github_watch_candidates)
    && summary.downstream.github_watch_candidates !== summary.source_watch.github_candidates_found
  ) {
    failures.push("daily codex DAG source-watch downstream MVP summary downstream.github_watch_candidates must equal source_watch.github_candidates_found.");
  }
  if (
    Number.isInteger(summary.source_watch.site_candidates_found)
    && Number.isInteger(summary.downstream.site_watch_candidates)
    && summary.downstream.site_watch_candidates !== summary.source_watch.site_candidates_found
  ) {
    failures.push("daily codex DAG source-watch downstream MVP summary downstream.site_watch_candidates must equal source_watch.site_candidates_found.");
  }
}

function validateSourceWatchNormalizeSummaryConsistency(summary, failures) {
  validateSourceWatchDownstreamSummaryConsistency(summary, failures);
  if (sourceWatchSummaryNodeStatus(summary, SOURCE_WATCH_NORMALIZE_NODE_ID) !== "success") return;
  if (!isPlainObject(summary.downstream) || !isPlainObject(summary.normalized)) return;
  if (
    Number.isInteger(summary.downstream.total_candidates)
    && Number.isInteger(summary.normalized.total_candidates)
    && summary.normalized.total_candidates !== summary.downstream.total_candidates
  ) {
    failures.push("daily codex DAG source-watch normalize MVP summary normalized.total_candidates must equal downstream.total_candidates.");
  }
  if (
    Number.isInteger(summary.downstream.github_watch_candidates)
    && Number.isInteger(summary.normalized.github_watch_candidates)
    && summary.normalized.github_watch_candidates !== summary.downstream.github_watch_candidates
  ) {
    failures.push("daily codex DAG source-watch normalize MVP summary normalized.github_watch_candidates must equal downstream.github_watch_candidates.");
  }
  if (
    Number.isInteger(summary.downstream.site_watch_candidates)
    && Number.isInteger(summary.normalized.site_watch_candidates)
    && summary.normalized.site_watch_candidates !== summary.downstream.site_watch_candidates
  ) {
    failures.push("daily codex DAG source-watch normalize MVP summary normalized.site_watch_candidates must equal downstream.site_watch_candidates.");
  }
}

function validateSourceWatchQualitySummaryConsistency(summary, failures) {
  validateSourceWatchNormalizeSummaryConsistency(summary, failures);
  if (sourceWatchSummaryNodeStatus(summary, SOURCE_WATCH_QUALITY_NODE_ID) !== "success") return;
  if (!isPlainObject(summary.normalized) || !isPlainObject(summary.quality)) return;
  if (
    Number.isInteger(summary.normalized.total_candidates)
    && Number.isInteger(summary.quality.total_candidates)
    && summary.quality.total_candidates !== summary.normalized.total_candidates
  ) {
    failures.push("daily codex DAG source-watch quality MVP summary quality.total_candidates must equal normalized.total_candidates.");
  }
  if (
    Number.isInteger(summary.normalized.github_watch_candidates)
    && Number.isInteger(summary.quality.github_watch_candidates)
    && summary.quality.github_watch_candidates !== summary.normalized.github_watch_candidates
  ) {
    failures.push("daily codex DAG source-watch quality MVP summary quality.github_watch_candidates must equal normalized.github_watch_candidates.");
  }
  if (
    Number.isInteger(summary.normalized.site_watch_candidates)
    && Number.isInteger(summary.quality.site_watch_candidates)
    && summary.quality.site_watch_candidates !== summary.normalized.site_watch_candidates
  ) {
    failures.push("daily codex DAG source-watch quality MVP summary quality.site_watch_candidates must equal normalized.site_watch_candidates.");
  }
  if (summary.quality.public_surface !== false) {
    failures.push("daily codex DAG source-watch quality MVP summary quality.public_surface must stay false.");
  }
}

function validateSourceWatchAdmitSummaryConsistency(summary, failures) {
  validateSourceWatchQualitySummaryConsistency(summary, failures);
  if (sourceWatchSummaryNodeStatus(summary, SOURCE_WATCH_ADMIT_NODE_ID) !== "success") return;
  if (!isPlainObject(summary.quality) || !isPlainObject(summary.admitted)) return;
  if (
    Number.isInteger(summary.quality.admitted_candidates)
    && Number.isInteger(summary.admitted.total_candidates)
    && summary.admitted.total_candidates !== summary.quality.admitted_candidates
  ) {
    failures.push("daily codex DAG source-watch admit MVP summary admitted.total_candidates must equal quality.admitted_candidates.");
  }
  if (
    Number.isInteger(summary.quality.github_watch_candidates)
    && Number.isInteger(summary.admitted.github_watch_candidates)
    && summary.admitted.github_watch_candidates > summary.quality.github_watch_candidates
  ) {
    failures.push("daily codex DAG source-watch admit MVP summary admitted.github_watch_candidates must not exceed quality.github_watch_candidates.");
  }
  if (
    Number.isInteger(summary.quality.site_watch_candidates)
    && Number.isInteger(summary.admitted.site_watch_candidates)
    && summary.admitted.site_watch_candidates > summary.quality.site_watch_candidates
  ) {
    failures.push("daily codex DAG source-watch admit MVP summary admitted.site_watch_candidates must not exceed quality.site_watch_candidates.");
  }
  if (summary.admitted.public_surface !== false) {
    failures.push("daily codex DAG source-watch admit MVP summary admitted.public_surface must stay false.");
  }
}

function sourceWatchSummaryNodeStatus(summary, nodeId) {
  if (!Array.isArray(summary?.node_results)) return "";
  const result = summary.node_results.find((nodeResult) => nodeResult?.node_id === nodeId);
  return typeof result?.status === "string" ? result.status : "";
}

function validateTwoNodeFixtureMvpExecutedCommands({ summary, failures }) {
  const label = "daily codex DAG two-node fixture MVP summary executed_commands";
  const values = summary.executed_commands;
  if (!Array.isArray(values)) {
    failures.push(`${label} must be an array.`);
    return;
  }
  const scoreResult = Array.isArray(summary.node_results)
    ? summary.node_results.find((result) => result?.node_id === TWO_NODE_FIXTURE_SCORE_NODE_ID)
    : null;
  const expectedNodeIds = scoreResult?.status === "blocked"
    ? [TWO_NODE_FIXTURE_CLASSIFY_NODE_ID]
    : TWO_NODE_FIXTURE_NODE_IDS;
  if (values.length !== expectedNodeIds.length) {
    failures.push(`${label} length must match attempted fixture commands.`);
    return;
  }
  for (let index = 0; index < expectedNodeIds.length; index += 1) {
    const command = values[index];
    if (!isPlainObject(command)) {
      failures.push(`${label} entry must be an object.`);
      return;
    }
    validateExactKeys({ value: command, allowed: ["node_id", "runner", "script"], label: `${label} entry`, failures });
    if (command.node_id !== expectedNodeIds[index]) failures.push(`${label} entry.node_id must be ${expectedNodeIds[index]}.`);
    if (command.runner !== "node") failures.push(`${label} entry.runner must be node.`);
    if (command.script !== REAL_NODE_ADAPTER_SCRIPT) failures.push(`${label} entry.script must be ${REAL_NODE_ADAPTER_SCRIPT}.`);
  }
}

function validateExecutableNodeMvpRunSemantics({ summary, run, planLevels, planNodeIds, failures }) {
  if (!sameOrderedStringArray(run.planned_nodes, planNodeIds)) {
    failures.push("daily codex DAG executable-node MVP summary run.planned_nodes must equal plan.nodes ids.");
  }
  if (!levelsMatch(run.levels, planLevels)) {
    failures.push("daily codex DAG executable-node MVP summary run.levels must equal plan.levels.");
  }
  const expectedCompleted = summary.ok === true ? [SYNTHETIC_EXECUTABLE_NODE_ID] : [];
  const expectedBlocked = summary.ok === true ? [] : [SYNTHETIC_EXECUTABLE_NODE_ID];
  const expectedStatus = summary.ok === true ? "executed_one_node" : "blocked";
  if (run.final_status !== expectedStatus) {
    failures.push(`daily codex DAG executable-node MVP summary run.final_status must be ${expectedStatus}.`);
  }
  if (!sameOrderedStringArray(run.completed_nodes, expectedCompleted)) {
    failures.push("daily codex DAG executable-node MVP summary run.completed_nodes must match node execution status.");
  }
  if (!sameOrderedStringArray(run.blocked_nodes, expectedBlocked)) {
    failures.push("daily codex DAG executable-node MVP summary run.blocked_nodes must match node execution status.");
  }
  const nodeResult = Array.isArray(summary.node_results) ? summary.node_results[0] : null;
  if (isPlainObject(nodeResult)) {
    const expectedNodeStatus = summary.ok === true ? "success" : "failure";
    if (nodeResult.status !== expectedNodeStatus) {
      failures.push(`daily codex DAG executable-node MVP summary node result status must be ${expectedNodeStatus}.`);
    }
  }
}

function validateTwoNodeFixtureMvpRunSemantics({ summary, run, planLevels, planNodeIds, failures }) {
  if (!sameOrderedStringArray(run.planned_nodes, planNodeIds)) {
    failures.push("daily codex DAG two-node fixture MVP summary run.planned_nodes must equal plan.nodes ids.");
  }
  if (!levelsMatch(run.levels, planLevels)) {
    failures.push("daily codex DAG two-node fixture MVP summary run.levels must equal plan.levels.");
  }
  const nodeResults = Array.isArray(summary.node_results) ? summary.node_results : [];
  const expectedCompleted = nodeResults
    .filter((result) => result?.status === "success")
    .map((result) => result.node_id);
  const expectedBlocked = nodeResults
    .filter((result) => result?.status === "failure" || result?.status === "blocked")
    .map((result) => result.node_id);
  const expectedStatus = summary.ok === true ? "executed_two_node_fixture" : "blocked";
  if (run.final_status !== expectedStatus) {
    failures.push(`daily codex DAG two-node fixture MVP summary run.final_status must be ${expectedStatus}.`);
  }
  if (!sameOrderedStringArray(run.completed_nodes, expectedCompleted)) {
    failures.push("daily codex DAG two-node fixture MVP summary run.completed_nodes must match node execution status.");
  }
  if (!sameOrderedStringArray(run.blocked_nodes, expectedBlocked)) {
    failures.push("daily codex DAG two-node fixture MVP summary run.blocked_nodes must match node execution status.");
  }
  if (summary.ok === true && !sameOrderedStringArray(expectedCompleted, TWO_NODE_FIXTURE_NODE_IDS)) {
    failures.push("daily codex DAG two-node fixture MVP summary success requires both nodes to complete.");
  }
  if (summary.ok === false && expectedBlocked.length === 0) {
    failures.push("daily codex DAG two-node fixture MVP summary failure requires at least one blocked node.");
  }
}

function validateRealNodeAdapterMvpRunSemantics({ summary, run, planLevels, planNodeIds, failures }) {
  if (!sameOrderedStringArray(run.planned_nodes, planNodeIds)) {
    failures.push("daily codex DAG real-node adapter MVP summary run.planned_nodes must equal plan.nodes ids.");
  }
  if (!levelsMatch(run.levels, planLevels)) {
    failures.push("daily codex DAG real-node adapter MVP summary run.levels must equal plan.levels.");
  }
  const expectedCompleted = summary.ok === true ? [REAL_NODE_ADAPTER_TARGET_NODE_ID] : [];
  const expectedBlocked = summary.ok === true ? [] : [REAL_NODE_ADAPTER_TARGET_NODE_ID];
  const expectedStatus = summary.ok === true ? "executed_one_real_node" : "blocked";
  if (run.final_status !== expectedStatus) {
    failures.push(`daily codex DAG real-node adapter MVP summary run.final_status must be ${expectedStatus}.`);
  }
  if (!sameOrderedStringArray(run.completed_nodes, expectedCompleted)) {
    failures.push("daily codex DAG real-node adapter MVP summary run.completed_nodes must match node execution status.");
  }
  if (!sameOrderedStringArray(run.blocked_nodes, expectedBlocked)) {
    failures.push("daily codex DAG real-node adapter MVP summary run.blocked_nodes must match node execution status.");
  }
  const nodeResult = Array.isArray(summary.node_results) ? summary.node_results[0] : null;
  if (isPlainObject(nodeResult)) {
    const expectedNodeStatus = summary.ok === true ? "success" : "failure";
    if (nodeResult.status !== expectedNodeStatus) {
      failures.push(`daily codex DAG real-node adapter MVP summary node result status must be ${expectedNodeStatus}.`);
    }
  }
}

function validateSourceWatchCollectMvpRunSemantics({ summary, run, planLevels, planNodeIds, failures }) {
  if (!sameOrderedStringArray(run.planned_nodes, planNodeIds)) {
    failures.push("daily codex DAG source-watch collect MVP summary run.planned_nodes must equal plan.nodes ids.");
  }
  if (!levelsMatch(run.levels, planLevels)) {
    failures.push("daily codex DAG source-watch collect MVP summary run.levels must equal plan.levels.");
  }
  const expectedCompleted = summary.ok === true ? [SOURCE_WATCH_COLLECT_NODE_ID] : [];
  const expectedBlocked = summary.ok === true ? [] : [SOURCE_WATCH_COLLECT_NODE_ID];
  const expectedStatus = summary.ok === true ? "executed_source_watch_collect" : "blocked";
  if (run.final_status !== expectedStatus) {
    failures.push(`daily codex DAG source-watch collect MVP summary run.final_status must be ${expectedStatus}.`);
  }
  if (!sameOrderedStringArray(run.completed_nodes, expectedCompleted)) {
    failures.push("daily codex DAG source-watch collect MVP summary run.completed_nodes must match node execution status.");
  }
  if (!sameOrderedStringArray(run.blocked_nodes, expectedBlocked)) {
    failures.push("daily codex DAG source-watch collect MVP summary run.blocked_nodes must match node execution status.");
  }
  const nodeResult = Array.isArray(summary.node_results) ? summary.node_results[0] : null;
  if (isPlainObject(nodeResult)) {
    const expectedNodeStatus = summary.ok === true ? "success" : "failure";
    if (nodeResult.status !== expectedNodeStatus) {
      failures.push(`daily codex DAG source-watch collect MVP summary node result status must be ${expectedNodeStatus}.`);
    }
  }
}

function validateSourceWatchDownstreamMvpRunSemantics({ summary, run, planLevels, planNodeIds, failures }) {
  if (!sameOrderedStringArray(run.planned_nodes, planNodeIds)) {
    failures.push("daily codex DAG source-watch downstream MVP summary run.planned_nodes must equal plan.nodes ids.");
  }
  if (!levelsMatch(run.levels, planLevels)) {
    failures.push("daily codex DAG source-watch downstream MVP summary run.levels must equal plan.levels.");
  }
  const nodeResults = Array.isArray(summary.node_results) ? summary.node_results : [];
  const expectedCompleted = nodeResults
    .filter((result) => result?.status === "success")
    .map((result) => result.node_id);
  const expectedBlocked = nodeResults
    .filter((result) => result?.status === "failure" || result?.status === "blocked")
    .map((result) => result.node_id);
  const expectedStatus = summary.ok === true ? "executed_source_watch_downstream" : "blocked";
  if (run.final_status !== expectedStatus) {
    failures.push(`daily codex DAG source-watch downstream MVP summary run.final_status must be ${expectedStatus}.`);
  }
  if (!sameOrderedStringArray(run.completed_nodes, expectedCompleted)) {
    failures.push("daily codex DAG source-watch downstream MVP summary run.completed_nodes must match node execution status.");
  }
  if (!sameOrderedStringArray(run.blocked_nodes, expectedBlocked)) {
    failures.push("daily codex DAG source-watch downstream MVP summary run.blocked_nodes must match node execution status.");
  }
  if (summary.ok === true && !sameOrderedStringArray(expectedCompleted, [SOURCE_WATCH_COLLECT_NODE_ID, SOURCE_WATCH_DOWNSTREAM_NODE_ID])) {
    failures.push("daily codex DAG source-watch downstream MVP summary success requires fetch-source-health and parse-extract to complete.");
  }
  if (summary.ok === false && expectedBlocked.length === 0) {
    failures.push("daily codex DAG source-watch downstream MVP summary failure requires at least one blocked node.");
  }
}

function validateSourceWatchNormalizeMvpRunSemantics({ summary, run, planLevels, planNodeIds, failures }) {
  if (!sameOrderedStringArray(run.planned_nodes, planNodeIds)) {
    failures.push("daily codex DAG source-watch normalize MVP summary run.planned_nodes must equal plan.nodes ids.");
  }
  if (!levelsMatch(run.levels, planLevels)) {
    failures.push("daily codex DAG source-watch normalize MVP summary run.levels must equal plan.levels.");
  }
  const nodeResults = Array.isArray(summary.node_results) ? summary.node_results : [];
  const expectedCompleted = nodeResults
    .filter((result) => result?.status === "success")
    .map((result) => result.node_id);
  const expectedBlocked = nodeResults
    .filter((result) => result?.status === "failure" || result?.status === "blocked")
    .map((result) => result.node_id);
  const expectedStatus = summary.ok === true ? "executed_source_watch_normalize" : "blocked";
  if (run.final_status !== expectedStatus) {
    failures.push(`daily codex DAG source-watch normalize MVP summary run.final_status must be ${expectedStatus}.`);
  }
  if (!sameOrderedStringArray(run.completed_nodes, expectedCompleted)) {
    failures.push("daily codex DAG source-watch normalize MVP summary run.completed_nodes must match node execution status.");
  }
  if (!sameOrderedStringArray(run.blocked_nodes, expectedBlocked)) {
    failures.push("daily codex DAG source-watch normalize MVP summary run.blocked_nodes must match node execution status.");
  }
  if (summary.ok === true && !sameOrderedStringArray(expectedCompleted, [SOURCE_WATCH_COLLECT_NODE_ID, SOURCE_WATCH_DOWNSTREAM_NODE_ID, SOURCE_WATCH_NORMALIZE_NODE_ID])) {
    failures.push("daily codex DAG source-watch normalize MVP summary success requires fetch-source-health, parse-extract, and normalize-canonicalize to complete.");
  }
  if (summary.ok === false && expectedBlocked.length === 0) {
    failures.push("daily codex DAG source-watch normalize MVP summary failure requires at least one blocked node.");
  }
}

function validateSourceWatchQualityMvpRunSemantics({ summary, run, planLevels, planNodeIds, failures }) {
  if (!sameOrderedStringArray(run.planned_nodes, planNodeIds)) {
    failures.push("daily codex DAG source-watch quality MVP summary run.planned_nodes must equal plan.nodes ids.");
  }
  if (!levelsMatch(run.levels, planLevels)) {
    failures.push("daily codex DAG source-watch quality MVP summary run.levels must equal plan.levels.");
  }
  const nodeResults = Array.isArray(summary.node_results) ? summary.node_results : [];
  const expectedCompleted = nodeResults
    .filter((result) => result?.status === "success")
    .map((result) => result.node_id);
  const expectedBlocked = nodeResults
    .filter((result) => result?.status === "failure" || result?.status === "blocked")
    .map((result) => result.node_id);
  const expectedStatus = summary.ok === true ? "executed_source_watch_quality" : "blocked";
  if (run.final_status !== expectedStatus) {
    failures.push(`daily codex DAG source-watch quality MVP summary run.final_status must be ${expectedStatus}.`);
  }
  if (!sameOrderedStringArray(run.completed_nodes, expectedCompleted)) {
    failures.push("daily codex DAG source-watch quality MVP summary run.completed_nodes must match node execution status.");
  }
  if (!sameOrderedStringArray(run.blocked_nodes, expectedBlocked)) {
    failures.push("daily codex DAG source-watch quality MVP summary run.blocked_nodes must match node execution status.");
  }
  if (summary.ok === true && !sameOrderedStringArray(expectedCompleted, [
    SOURCE_WATCH_COLLECT_NODE_ID,
    SOURCE_WATCH_DOWNSTREAM_NODE_ID,
    SOURCE_WATCH_NORMALIZE_NODE_ID,
    SOURCE_WATCH_QUALITY_NODE_ID
  ])) {
    failures.push("daily codex DAG source-watch quality MVP summary success requires all four source-watch quality fixture nodes to complete.");
  }
  if (summary.ok === false && expectedBlocked.length === 0) {
    failures.push("daily codex DAG source-watch quality MVP summary failure requires at least one blocked node.");
  }
}

function validateSourceWatchAdmitMvpRunSemantics({ summary, run, planLevels, planNodeIds, failures }) {
  if (!sameOrderedStringArray(run.planned_nodes, planNodeIds)) {
    failures.push("daily codex DAG source-watch admit MVP summary run.planned_nodes must equal plan.nodes ids.");
  }
  if (!levelsMatch(run.levels, planLevels)) {
    failures.push("daily codex DAG source-watch admit MVP summary run.levels must equal plan.levels.");
  }
  const nodeResults = Array.isArray(summary.node_results) ? summary.node_results : [];
  const expectedCompleted = nodeResults
    .filter((result) => result?.status === "success")
    .map((result) => result.node_id);
  const expectedBlocked = nodeResults
    .filter((result) => result?.status === "failure" || result?.status === "blocked")
    .map((result) => result.node_id);
  const expectedStatus = summary.ok === true ? "executed_source_watch_admit" : "blocked";
  if (run.final_status !== expectedStatus) {
    failures.push(`daily codex DAG source-watch admit MVP summary run.final_status must be ${expectedStatus}.`);
  }
  if (!sameOrderedStringArray(run.completed_nodes, expectedCompleted)) {
    failures.push("daily codex DAG source-watch admit MVP summary run.completed_nodes must match node execution status.");
  }
  if (!sameOrderedStringArray(run.blocked_nodes, expectedBlocked)) {
    failures.push("daily codex DAG source-watch admit MVP summary run.blocked_nodes must match node execution status.");
  }
  if (summary.ok === true && !sameOrderedStringArray(expectedCompleted, [
    SOURCE_WATCH_COLLECT_NODE_ID,
    SOURCE_WATCH_DOWNSTREAM_NODE_ID,
    SOURCE_WATCH_NORMALIZE_NODE_ID,
    SOURCE_WATCH_QUALITY_NODE_ID,
    SOURCE_WATCH_ADMIT_NODE_ID
  ])) {
    failures.push("daily codex DAG source-watch admit MVP summary success requires all five source-watch admit fixture nodes to complete.");
  }
  if (summary.ok === false && expectedBlocked.length === 0) {
    failures.push("daily codex DAG source-watch admit MVP summary failure requires at least one blocked node.");
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

function validatePlanShape(plan, failures, options = {}) {
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
      validatePlanNodeShape(node, failures, options);
    }
  }
}

function validatePlanNodeShape(node, failures, options = {}) {
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
    failures,
    allowNodeExecutable: options.allowNodeExecutable === true
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

function validateExecutionReadiness({ nodeId, executionStatus, readiness, label, failures, allowNodeExecutable = false }) {
  const reservedNodeExecutable = readiness === "node_executable";
  if (executionStatus === "planned" && readiness !== "planned_only" && !reservedNodeExecutable) {
    failures.push(`${label} ${formatSummaryValue(nodeId)} with execution_status planned must use execution_contract.readiness planned_only.`);
  }
  if (executionStatus === "mapped" && readiness !== "legacy_mapped" && !reservedNodeExecutable) {
    failures.push(`${label} ${formatSummaryValue(nodeId)} with execution_status mapped must use execution_contract.readiness legacy_mapped; legacy mapped is not node-level execution.`);
  }
  if (reservedNodeExecutable && !allowNodeExecutable) {
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

function validateNextActionShape(nextAction, failures, label = "daily codex DAG dry-run success summary next_action", options = {}) {
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
  const allowedKinds = Array.isArray(options.allowedKinds) && options.allowedKinds.length > 0
    ? options.allowedKinds
    : ["implement_executable_node_runner"];
  if (!allowedKinds.includes(nextAction.kind)) {
    failures.push(`${label}.kind must be ${allowedKinds.join(" or ")}.`);
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

async function validateNodeExecutionPolicy({ rootDir, node, resiliencePolicy, failures, checkedFiles }) {
  const policyStageIds = new Set((resiliencePolicy?.stages || []).map((stage) => stage?.id).filter(Boolean));
  const policyMode = node.failure_policy?.mode;
  const readiness = node.execution_contract?.readiness;
  const hasNodeExecutionSpec = Object.prototype.hasOwnProperty.call(node.execution_contract || {}, "node_execution_spec");
  await validateNodeExecutionSpecReferences({ rootDir, node, failures, checkedFiles });
  if (node.resilience_policy_ref && !policyStageIds.has(node.resilience_policy_ref)) {
    failures.push(`config/daily-codex-dag.json: node ${node.id} references missing resilience policy stage ${node.resilience_policy_ref}.`);
  }
  const reservedNodeExecutable = readiness === "node_executable";
  if (node.execution_status === "planned" && readiness !== "planned_only" && !reservedNodeExecutable) {
    failures.push(`config/daily-codex-dag.json: planned node ${node.id} must use execution_contract.readiness planned_only.`);
  }
  if (node.execution_status === "mapped") {
    if (readiness !== "legacy_mapped" && !reservedNodeExecutable) {
      failures.push(`config/daily-codex-dag.json: mapped node ${node.id} must use execution_contract.readiness legacy_mapped; legacy mapped is not node-level execution.`);
    }
    if (!node.runner_stage_ref) {
      failures.push(`config/daily-codex-dag.json: mapped node ${node.id} requires runner_stage_ref.`);
    }
    if (policyMode !== "resilience_policy_ref") {
      failures.push(`config/daily-codex-dag.json: mapped node ${node.id} must use failure_policy.mode resilience_policy_ref.`);
    }
  }
  if (reservedNodeExecutable) {
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

async function validateNodeExecutionSpecReferences({ rootDir, node, failures, checkedFiles }) {
  const spec = node.execution_contract?.node_execution_spec;
  if (!spec) return;

  await validateNodeExecutionSpecPreflight({ rootDir, node, spec, failures, checkedFiles });

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

async function validateNodeExecutionSpecPreflight({ rootDir, node, spec, failures, checkedFiles }) {
  if (!isSafeExecutionRelativePath(spec.cwd, { allowDot: true })) {
    failures.push(`config/daily-codex-dag.json: node ${node.id} node_execution_spec.cwd must be "." or a repo-relative path without absolute paths, drive letters, URLs, parent traversal, empty segments, backslashes, or colon-containing path segments.`);
  }
  if (spec.invocation?.kind === "command") {
    validateExecutionStringArray({
      values: spec.invocation.argv,
      label: `config/daily-codex-dag.json: node ${node.id} node_execution_spec.invocation.argv`,
      failures,
      requireNonEmptyArray: true
    });
    await validateCommandInvocationPolicy({
      rootDir,
      node,
      argv: spec.invocation.argv,
      failures,
      checkedFiles
    });
  }
  if (spec.invocation?.kind === "codex_cli") {
    const codexPolicy = validateCodexCliInvocationPolicyShape({
      invocation: spec.invocation,
      failures,
      label: `config/daily-codex-dag.json: node ${node.id} node_execution_spec.invocation`
    });
    if (codexPolicy.shouldCheckExistingFile) {
      await validateExistingRelativeFile({
        rootDir,
        relativePath: codexPolicy.promptTemplate,
        label: `node ${node.id} node_execution_spec.invocation.prompt_template`,
        failures,
        checkedFiles
      });
    }
  }
  validateNodeExecutionRuntimePolicy({ node, spec, failures });
}

function validateExecutionStringArray({ values, label, failures, requireNonEmptyArray = false }) {
  if (!Array.isArray(values)) {
    failures.push(`${label} must be an array of non-empty strings.`);
    return;
  }
  if (requireNonEmptyArray && values.length === 0) {
    failures.push(`${label} must be a non-empty array of non-empty strings.`);
  }
  for (const value of values) {
    if (!nonBlankString(value)) {
      failures.push(`${label} entries must be non-empty strings.`);
    }
  }
}

function selectExplicitNodeExecutionSpec({ options, node }) {
  if (Object.prototype.hasOwnProperty.call(options, "spec")) return options.spec;
  if (Object.prototype.hasOwnProperty.call(options, "nodeExecutionSpec")) return options.nodeExecutionSpec;
  return node.execution_contract?.node_execution_spec;
}

async function validateCommandInvocationPolicy({ rootDir, node, argv, failures, checkedFiles }) {
  if (!Array.isArray(argv) || argv.length === 0) return;
  const label = `config/daily-codex-dag.json: node ${node.id} node_execution_spec.invocation.argv`;
  const commandPolicy = validateCommandInvocationPolicyShape({ argv, failures, label });
  if (commandPolicy.shouldCheckExistingFile) {
    await validateExistingRelativeFile({
      rootDir,
      relativePath: commandPolicy.scriptPath,
      label: `node ${node.id} node_execution_spec.invocation.argv[1]`,
      failures,
      checkedFiles
    });
  }
}

function validateCommandInvocationPolicyShape({ argv, failures, label }) {
  const result = {
    ok: true,
    scriptPath: null,
    shouldCheckExistingFile: false
  };
  if (!Array.isArray(argv) || argv.length === 0) {
    result.ok = false;
    return result;
  }
  for (const token of argv) {
    if (typeof token === "string" && isShellishCommandToken(token)) {
      failures.push(`${label} entries must not contain shell control operators or redirection tokens.`);
      result.ok = false;
      break;
    }
  }
  const runner = argv[0];
  if (runner !== "node") {
    failures.push(`${label}[0] must be node until live executor command policy supports additional runners.`);
    result.ok = false;
    return result;
  }
  const scriptPath = argv[1];
  result.scriptPath = scriptPath;
  if (!nonBlankString(scriptPath)) {
    failures.push(`${label}[1] must be a repo-relative Node script path under scripts/.`);
    result.ok = false;
    return result;
  }
  if (!isSafeExecutionRelativePath(scriptPath)) {
    failures.push(`${label}[1] must be a repo-relative Node script path without absolute paths, drive letters, URLs, parent traversal, empty segments, backslashes, or colon-containing path segments.`);
    result.ok = false;
    return result;
  }
  const underScripts = scriptPath === "scripts" || scriptPath.startsWith("scripts/");
  if (!underScripts) {
    failures.push(`${label}[1] must be under scripts/.`);
    result.ok = false;
  } else {
    result.shouldCheckExistingFile = true;
  }
  if (!scriptPath.endsWith(".mjs") && !scriptPath.endsWith(".js")) {
    failures.push(`${label}[1] must end with .mjs or .js.`);
    result.ok = false;
  }
  return result;
}

function validateCodexCliInvocationPolicyShape({ invocation, failures, label }) {
  const result = {
    ok: true,
    promptTemplate: null,
    args: [],
    shouldCheckExistingFile: false
  };
  if (!isPlainObject(invocation)) {
    failures.push(`${label} must be an object.`);
    result.ok = false;
    return result;
  }
  const promptTemplate = invocation.prompt_template;
  result.promptTemplate = promptTemplate;
  if (!isSafeExecutionRelativePath(promptTemplate)) {
    failures.push(`${label}.prompt_template must be a repo-relative path without absolute paths, drive letters, URLs, parent traversal, empty segments, backslashes, or colon-containing path segments.`);
    result.ok = false;
  } else {
    result.shouldCheckExistingFile = true;
  }

  const failureCount = failures.length;
  validateExecutionStringArray({
    values: invocation.args,
    label: `${label}.args`,
    failures
  });
  if (failures.length !== failureCount) {
    result.ok = false;
  } else {
    result.args = [...invocation.args];
  }
  return result;
}

function isShellishCommandToken(token) {
  return /&&|\|\||;|\||&|`|<|>|\r|\n|\$\(/.test(token);
}

function validateNodeExecutionRuntimePolicy({ node, spec, failures }) {
  const expectedIdempotencyKey = `daily-codex-dag:{report_date}:${node.id}`;
  if (spec.idempotency_key !== expectedIdempotencyKey) {
    failures.push(`config/daily-codex-dag.json: node ${node.id} node_execution_spec.idempotency_key must be ${expectedIdempotencyKey}.`);
  }
  if (spec.concurrency_group !== node.parallel_group) {
    failures.push(`config/daily-codex-dag.json: node ${node.id} node_execution_spec.concurrency_group must match node parallel_group ${node.parallel_group}.`);
  }
  validateRetryPolicyShape({ node, retryPolicy: spec.retry_policy, failures });
  validateArtifactRuntimePolicy({ node, spec, failures });
  validateSandboxRuntimePolicy({ node, spec, failures });
}

function validateRetryPolicyShape({ node, retryPolicy, failures }) {
  if (!retryPolicy || !Array.isArray(retryPolicy.backoff_seconds)) return;
  if (retryPolicy.backoff_seconds.length !== retryPolicy.max_attempts) {
    failures.push(`config/daily-codex-dag.json: node ${node.id} node_execution_spec.retry_policy.backoff_seconds must contain one entry per max_attempts, including 0 for the first attempt.`);
  }
  if (retryPolicy.backoff_seconds[0] !== 0) {
    failures.push(`config/daily-codex-dag.json: node ${node.id} node_execution_spec.retry_policy.backoff_seconds must start with 0 for the first attempt.`);
  }
  for (let index = 1; index < retryPolicy.backoff_seconds.length; index += 1) {
    if (retryPolicy.backoff_seconds[index] < retryPolicy.backoff_seconds[index - 1]) {
      failures.push(`config/daily-codex-dag.json: node ${node.id} node_execution_spec.retry_policy.backoff_seconds must be nondecreasing.`);
      break;
    }
  }
}

function validateArtifactRuntimePolicy({ node, spec, failures }) {
  const verification = spec.artifact_verification || {};
  const hasManifestOutputs = (node.outputs || []).length > 0;
  if (hasManifestOutputs && spec.resume_policy === "reuse_valid_outputs") {
    if (verification.schema !== "declared_outputs") {
      failures.push(`config/daily-codex-dag.json: node ${node.id} node_execution_spec.artifact_verification.schema must be declared_outputs when reuse_valid_outputs is used for a node with manifest outputs.`);
    }
    if (verification.existence !== "required_outputs") {
      failures.push(`config/daily-codex-dag.json: node ${node.id} node_execution_spec.artifact_verification.existence must be required_outputs when reuse_valid_outputs is used for a node with manifest outputs.`);
    }
  }
  if (node.public_artifact) {
    if (spec.publish_boundary !== "public_artifacts") {
      failures.push(`config/daily-codex-dag.json: node ${node.id} node_execution_spec.publish_boundary must be public_artifacts for public artifact nodes.`);
    }
    if (verification.privacy_scan !== "public_outputs") {
      failures.push(`config/daily-codex-dag.json: node ${node.id} node_execution_spec.artifact_verification.privacy_scan must be public_outputs for public artifact nodes.`);
    }
  } else {
    if (spec.publish_boundary === "public_artifacts") {
      failures.push(`config/daily-codex-dag.json: node ${node.id} node_execution_spec.publish_boundary cannot be public_artifacts for non-public nodes.`);
    }
    if (verification.privacy_scan === "public_outputs") {
      failures.push(`config/daily-codex-dag.json: node ${node.id} node_execution_spec.artifact_verification.privacy_scan cannot be public_outputs for non-public nodes.`);
    }
  }
}

function validateSandboxRuntimePolicy({ node, spec, failures }) {
  const sandbox = spec.sandbox || {};
  if (node.public_artifact) {
    if (sandbox.filesystem !== "public_artifact_write") {
      failures.push(`config/daily-codex-dag.json: node ${node.id} node_execution_spec.sandbox.filesystem must be public_artifact_write for public artifact nodes.`);
    }
  } else if (sandbox.filesystem === "public_artifact_write") {
    failures.push(`config/daily-codex-dag.json: node ${node.id} node_execution_spec.sandbox.filesystem cannot be public_artifact_write for non-public nodes.`);
  }
  if (sandbox.network === "source_allowlist" || sandbox.network === "enabled") {
    failures.push(`config/daily-codex-dag.json: node ${node.id} node_execution_spec.sandbox.network ${sandbox.network} is reserved until live executor network policy is defined.`);
  }
  if (sandbox.secrets === "runtime_scoped") {
    failures.push(`config/daily-codex-dag.json: node ${node.id} node_execution_spec.sandbox.secrets runtime_scoped is reserved until live executor secret policy is defined.`);
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
    const filePath = path.resolve(rootDir, relativePath);
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) {
      failures.push(`config/daily-codex-dag.json: ${label} must be a file ${relativePath}.`);
      return false;
    }
    checkedFiles.push(toPortablePath(filePath));
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

function isPathWithinOrEqual({ parent, child }) {
  const resolvedParent = path.resolve(parent);
  const resolvedChild = path.resolve(child);
  const relative = path.relative(resolvedParent, resolvedChild);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
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

function nonBlankString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function nonNegativeIntegerOrZero(value) {
  return Number.isInteger(value) && value >= 0 ? value : 0;
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
