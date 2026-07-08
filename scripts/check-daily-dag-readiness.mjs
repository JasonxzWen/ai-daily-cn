#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_DAG_PATH = "config/daily-codex-dag.json";
const READINESS_STATES = ["real", "mapped", "fixture", "planned"];

export async function createDailyDagReadinessReport(options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const manifestInput = options.manifest;
  const dagPathInput = options.dagPath || (typeof manifestInput === "string" ? manifestInput : undefined) || DEFAULT_DAG_PATH;
  const dagPath = resolveUnderRoot(rootDir, dagPathInput);
  const manifest = isRecord(manifestInput) ? manifestInput : JSON.parse(await fs.readFile(dagPath, "utf8"));
  const generatedAt = options.generatedAt || new Date().toISOString();
  const manifestPath = normalizePath(path.relative(rootDir, dagPath) || DEFAULT_DAG_PATH);
  const nodes = Array.isArray(manifest.nodes) ? manifest.nodes : [];
  const reportNodes = nodes.map((node) => classifyNodeReadiness({ node, manifestPath }));
  const counts = {
    real: reportNodes.filter((node) => node.readiness_state === "real").length,
    mapped: reportNodes.filter((node) => node.readiness_state === "mapped").length,
    fixture: reportNodes.filter((node) => node.readiness_state === "fixture").length,
    planned: reportNodes.filter((node) => node.readiness_state === "planned").length,
    production_ready: reportNodes.filter((node) => node.production_ready).length,
    standalone_executable: reportNodes.filter((node) => node.standalone_executable).length,
    blocked: reportNodes.filter((node) => !node.production_ready).length
  };

  return {
    schema_version: 1,
    generated_at: generatedAt,
    manifest_path: manifestPath,
    node_count: reportNodes.length,
    counts,
    production_ready_node_ids: reportNodes
      .filter((node) => node.production_ready)
      .map((node) => node.id),
    nodes: reportNodes
  };
}

function classifyNodeReadiness({ node, manifestPath }) {
  const executionStatus = textValue(node.execution_status);
  const readiness = textValue(node.execution_contract?.readiness);
  const hasNodeExecutionSpec = isRecord(node.execution_contract?.node_execution_spec);
  const readinessState = resolveReadinessState({ executionStatus, readiness, hasNodeExecutionSpec });
  const standaloneExecutable = readinessState === "real";
  const productionReady = readinessState === "real" || readinessState === "mapped";

  return {
    id: textValue(node.id),
    title: textValue(node.title),
    kind: textValue(node.kind),
    readiness_state: readinessState,
    execution_status: executionStatus,
    execution_readiness: readiness,
    runner_stage_ref: textValue(node.runner_stage_ref),
    standalone_executable: standaloneExecutable,
    production_ready: productionReady,
    blocking_reason: blockingReason({ readinessState, readiness, executionStatus }),
    evidence_files: {
      manifest: manifestPath,
      input_schema: textValue(node.schemas?.input),
      output_schema: textValue(node.schemas?.output),
      fixture: textValue(node.fixture)
    }
  };
}

function resolveReadinessState({ executionStatus, readiness, hasNodeExecutionSpec }) {
  if (executionStatus === "fixture") {
    return "fixture";
  }
  if (readiness === "node_executable" && hasNodeExecutionSpec) {
    return executionStatus === "fixture" ? "fixture" : "real";
  }
  if (readiness === "legacy_mapped" || executionStatus === "mapped") {
    return "mapped";
  }
  return "planned";
}

function blockingReason({ readinessState, readiness, executionStatus }) {
  if (readinessState === "real") {
    return "";
  }
  if (readinessState === "mapped") {
    return "Legacy mapped runner stage; compatible with the production runner but not standalone node execution.";
  }
  if (readinessState === "fixture") {
    return "Fixture-only node evidence; do not count it as production-ready.";
  }
  if (readiness === "node_executable" && executionStatus !== "real") {
    return "Node executable readiness is present without a production real-node status.";
  }
  return "Planned-only DAG contract; do not count it as production-ready.";
}

async function runCli(argv) {
  const args = parseArgs(argv);
  const rootDir = path.resolve(args["repo-root"] || process.cwd());
  const report = await createDailyDagReadinessReport({
    rootDir,
    dagPath: args.manifest || args.dag,
    generatedAt: args["generated-at"]
  });
  const output = `${JSON.stringify(report, null, 2)}\n`;
  if (args.output) {
    await fs.mkdir(path.dirname(path.resolve(args.output)), { recursive: true });
    await fs.writeFile(path.resolve(args.output), output, "utf8");
  }
  if (args.json || !args.output) {
    process.stdout.write(output);
  } else {
    process.stdout.write(`Daily DAG readiness report written to ${args.output}\n`);
  }
  return 0;
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      throw new Error(`Unknown argument: ${token}`);
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function resolveUnderRoot(rootDir, targetPath) {
  const resolved = path.resolve(rootDir, targetPath);
  const relative = path.relative(rootDir, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path must stay under repo root: ${targetPath}`);
  }
  return resolved;
}

function textValue(value) {
  return typeof value === "string" ? value : "";
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizePath(filePath) {
  return filePath.replace(/\\/g, "/");
}

export { READINESS_STATES };

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  runCli(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(error?.stack || error?.message || String(error));
      process.exitCode = 1;
    });
}
