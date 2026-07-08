import fs from "node:fs/promises";
import path from "node:path";
import { buildDailyWorkflowStages } from "./daily-runner.js";

const DEFAULT_POLICY_PATH = path.join("config", "daily-resilience-policy.json");
const DEFAULT_REPORT_DATE = "2099-01-01";
const REQUIRED_VALIDATE_COMMAND = "pnpm run resilience:validate";
const REQUIRED_PACKAGE_SCRIPT = "node scripts/validate-daily-resilience-policy.mjs";

const REQUIRED_TERMINAL_STATUSES = [
  "published",
  "published_degraded",
  "generated_only",
  "needs_ai_repair",
  "unsafe_blocked",
  "infrastructure_blocked_after_fallback_exhausted"
];

const REQUIRED_BLOCKING_REASONS = [
  "unsafe_public_content",
  "unrecoverable_schema",
  "unrecoverable_rendering",
  "internal_leakage",
  "fake_tracking_component",
  "infrastructure_exhausted"
];

const EXTRA_REQUIRED_STAGE_IDS = [
  "prepare_clean_worktree",
  "quality_ai_repair",
  "publish_github_api_fallback",
  "pages_verify",
  "retrospective_write",
  "retrospective_finalize",
  "retrospective_validate",
  "retrospective_correction_write",
  "retrospective_correction_validate"
];
const RETIRED_DISCOVERY_STAGE_IDS = new Set([
  "discover_wechat_platform",
  "discover_zhihu_platform",
  "discover_reddit_platform"
]);

const DOC_MARKERS = [
  {
    path: "tasks/daily-publish-runbook.md",
    contains: [
      "config/daily-resilience-policy.json",
      "corepack pnpm run resilience:validate",
      "published_degraded",
      "infrastructure_blocked_after_fallback_exhausted"
    ]
  },
  {
    path: "prompts/ai-daily/modules/publish-workflow.md",
    contains: [
      "config/daily-resilience-policy.json",
      "corepack pnpm run resilience:validate",
      "published_degraded",
      "infrastructure_blocked_after_fallback_exhausted"
    ]
  },
  {
    path: "docs/codex-automation-setup.md",
    contains: [
      "config/daily-resilience-policy.json",
      "corepack pnpm run resilience:validate",
      "published_degraded",
      "infrastructure_blocked_after_fallback_exhausted"
    ]
  },
  {
    path: "tasks/templates/daily-publish-task.md",
    contains: [
      "config/daily-resilience-policy.json",
      "corepack pnpm run resilience:validate",
      "published_degraded",
      "infrastructure_blocked_after_fallback_exhausted"
    ]
  }
];

export async function loadDailyResiliencePolicy(options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const policyPath = path.resolve(rootDir, options.policyPath || DEFAULT_POLICY_PATH);
  const raw = await fs.readFile(policyPath, "utf8");
  return {
    policyPath,
    policy: JSON.parse(raw)
  };
}

export async function validateDailyResiliencePolicy(options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const failures = [];
  const warnings = [];
  const checkedFiles = [];
  let policy = null;
  let policyPath = path.resolve(rootDir, options.policyPath || DEFAULT_POLICY_PATH);

  try {
    const loaded = await loadDailyResiliencePolicy({ rootDir, policyPath: options.policyPath });
    policyPath = loaded.policyPath;
    policy = loaded.policy;
    checkedFiles.push(toPortablePath(policyPath));
  } catch (error) {
    failures.push(`config/daily-resilience-policy.json: ${error.message}`);
  }

  const requiredStageIds = collectRequiredStageIds(options);
  let stageIds = [];
  if (policy) {
    stageIds = validatePolicyDocument({ policy, failures, requiredStageIds });
  }

  await validatePackageGate({ rootDir, failures, checkedFiles });
  await validateWorkflowContractGate({ rootDir, failures, checkedFiles });
  await validateDocMarkers({ rootDir, failures, checkedFiles });

  return {
    ok: failures.length === 0,
    failures,
    warnings,
    policy,
    required_stage_ids: requiredStageIds,
    stage_ids: uniqueSorted(stageIds),
    checked_files: uniqueSorted(checkedFiles)
  };
}

function validatePolicyDocument({ policy, failures, requiredStageIds }) {
  if (!isPlainObject(policy)) {
    failures.push("config/daily-resilience-policy.json: policy must be an object.");
    return [];
  }

  if (policy.schema_version !== 1) {
    failures.push("config/daily-resilience-policy.json: schema_version must be 1.");
  }
  if (policy.name !== "daily-resilience-contract") {
    failures.push("config/daily-resilience-policy.json: name must be daily-resilience-contract.");
  }

  validateStringArrayIncludes({
    value: policy.terminal_statuses,
    required: REQUIRED_TERMINAL_STATUSES,
    label: "terminal_statuses",
    failures
  });
  validateStringArrayIncludes({
    value: policy.blocking_whitelist,
    required: REQUIRED_BLOCKING_REASONS,
    label: "blocking_whitelist",
    failures
  });
  validateStringArrayIncludes({
    value: policy.required_workflow_gates,
    required: [REQUIRED_VALIDATE_COMMAND],
    label: "required_workflow_gates",
    failures
  });

  if (!Array.isArray(policy.stages)) {
    failures.push("config/daily-resilience-policy.json: stages must be an array.");
    return [];
  }

  const stageIds = [];
  const seen = new Set();
  const blockingWhitelist = new Set(Array.isArray(policy.blocking_whitelist) ? policy.blocking_whitelist : []);
  for (const [index, stage] of policy.stages.entries()) {
    const label = `config/daily-resilience-policy.json: stages/${index}`;
    if (!isPlainObject(stage)) {
      failures.push(`${label} must be an object.`);
      continue;
    }
    if (!isNonEmptyString(stage.id)) {
      failures.push(`${label}.id must be a non-empty string.`);
      continue;
    }
    stageIds.push(stage.id);
    if (seen.has(stage.id)) {
      failures.push(`config/daily-resilience-policy.json: duplicate stage id ${JSON.stringify(stage.id)}.`);
    }
    seen.add(stage.id);
    if (RETIRED_DISCOVERY_STAGE_IDS.has(stage.id)) {
      failures.push(`config/daily-resilience-policy.json: retired platform discovery stage ${stage.id} must not be registered.`);
    }
    validateStagePolicy({ stage, label: `${label} (${stage.id})`, blockingWhitelist, failures });
  }

  for (const stageId of requiredStageIds) {
    if (!seen.has(stageId)) {
      failures.push(`config/daily-resilience-policy.json: missing required stage ${stageId}.`);
    }
  }

  const reportWrite = policy.stages.find((stage) => stage?.id === "report_write");
  if (reportWrite?.fallback?.kind !== "schema_aware_normalizer") {
    failures.push("config/daily-resilience-policy.json: report_write fallback.kind must be schema_aware_normalizer.");
  }
  if (reportWrite?.degrade?.action !== "normalize_public_degraded_fields") {
    failures.push("config/daily-resilience-policy.json: report_write degrade.action must be normalize_public_degraded_fields.");
  }

  return stageIds;
}

function validateStagePolicy({ stage, label, blockingWhitelist, failures }) {
  if (!isNonEmptyString(stage.description)) {
    failures.push(`${label}.description must be a non-empty string.`);
  }

  for (const field of ["retry", "fallback", "degrade", "block"]) {
    if (!isPlainObject(stage[field])) {
      failures.push(`${label}.${field} must be an object.`);
    }
  }

  if (isPlainObject(stage.retry)) {
    if (!Number.isInteger(stage.retry.max_attempts) || stage.retry.max_attempts < 1) {
      failures.push(`${label}.retry.max_attempts must be an integer >= 1.`);
    }
    if (!Array.isArray(stage.retry.backoff_ms)) {
      failures.push(`${label}.retry.backoff_ms must be an array.`);
    }
    if (!Array.isArray(stage.retry.on)) {
      failures.push(`${label}.retry.on must be an array.`);
    }
  }

  if (isPlainObject(stage.fallback) && !isNonEmptyString(stage.fallback.kind)) {
    failures.push(`${label}.fallback.kind must be a non-empty string.`);
  }
  if (isPlainObject(stage.fallback) && !isNonEmptyString(stage.fallback.action)) {
    failures.push(`${label}.fallback.action must be a non-empty string.`);
  }
  if (isPlainObject(stage.degrade) && typeof stage.degrade.allowed !== "boolean") {
    failures.push(`${label}.degrade.allowed must be a boolean.`);
  }
  if (isPlainObject(stage.degrade) && !isNonEmptyString(stage.degrade.action)) {
    failures.push(`${label}.degrade.action must be a non-empty string.`);
  }
  if (isPlainObject(stage.block) && typeof stage.block.allowed !== "boolean") {
    failures.push(`${label}.block.allowed must be a boolean.`);
  }
  if (isPlainObject(stage.block)) {
    if (!Array.isArray(stage.block.reasons) || stage.block.reasons.length === 0) {
      failures.push(`${label}.block.reasons must be a non-empty array.`);
    } else {
      for (const reason of stage.block.reasons) {
        if (!blockingWhitelist.has(reason)) {
          failures.push(`${label}.block.reasons contains non-whitelisted reason ${JSON.stringify(reason)}.`);
        }
      }
    }
  }

  for (const field of ["summary_fields", "replay_fixtures"]) {
    if (!Array.isArray(stage[field]) || stage[field].length === 0 || !stage[field].every(isNonEmptyString)) {
      failures.push(`${label}.${field} must be a non-empty string array.`);
    }
  }
  if (Array.isArray(stage.summary_fields)) {
    for (const field of ["stage_id", "status", "attempts"]) {
      if (!stage.summary_fields.includes(field)) {
        failures.push(`${label}.summary_fields must include ${JSON.stringify(field)}.`);
      }
    }
  }
}

function collectRequiredStageIds(options = {}) {
  const runnerStageIds = buildDailyWorkflowStages({
    reportDate: options.reportDate || DEFAULT_REPORT_DATE,
    publish: true
  }).map((stage) => stage.id);
  return uniqueSorted([...runnerStageIds, ...EXTRA_REQUIRED_STAGE_IDS]);
}

async function validatePackageGate({ rootDir, failures, checkedFiles }) {
  const packagePath = path.join(rootDir, "package.json");
  checkedFiles.push(toPortablePath(packagePath));
  const packageJson = await readJsonOrFailure(packagePath, failures);
  if (!packageJson) return;

  const actualScript = packageJson.scripts?.["resilience:validate"] || "";
  if (actualScript !== REQUIRED_PACKAGE_SCRIPT) {
    failures.push(`package.json scripts.resilience:validate expected ${JSON.stringify(REQUIRED_PACKAGE_SCRIPT)} but found ${JSON.stringify(actualScript)}.`);
  }
  const validateScript = packageJson.scripts?.validate || "";
  if (!validateScript.includes(REQUIRED_VALIDATE_COMMAND)) {
    failures.push(`package.json scripts.validate must include ${JSON.stringify(REQUIRED_VALIDATE_COMMAND)}.`);
  }
}

async function validateWorkflowContractGate({ rootDir, failures, checkedFiles }) {
  const contractPath = path.join(rootDir, "config", "daily-workflow-contract.json");
  checkedFiles.push(toPortablePath(contractPath));
  const contract = await readJsonOrFailure(contractPath, failures);
  if (!contract) return;

  const actualScript = contract.required_package_scripts?.["resilience:validate"] || "";
  if (actualScript !== REQUIRED_PACKAGE_SCRIPT) {
    failures.push(`config/daily-workflow-contract.json required_package_scripts.resilience:validate expected ${JSON.stringify(REQUIRED_PACKAGE_SCRIPT)} but found ${JSON.stringify(actualScript)}.`);
  }
  if (!Array.isArray(contract.validate_must_include) || !contract.validate_must_include.includes(REQUIRED_VALIDATE_COMMAND)) {
    failures.push(`config/daily-workflow-contract.json validate_must_include must include ${JSON.stringify(REQUIRED_VALIDATE_COMMAND)}.`);
  }
  const markerText = JSON.stringify(contract.required_markers || []);
  for (const marker of [
    "config/daily-resilience-policy.json",
    "corepack pnpm run resilience:validate",
    "published_degraded",
    "infrastructure_blocked_after_fallback_exhausted"
  ]) {
    if (!markerText.includes(marker)) {
      failures.push(`config/daily-workflow-contract.json required_markers must include ${JSON.stringify(marker)}.`);
    }
  }
}

async function validateDocMarkers({ rootDir, failures, checkedFiles }) {
  for (const group of DOC_MARKERS) {
    const filePath = path.join(rootDir, group.path);
    checkedFiles.push(toPortablePath(filePath));
    let text;
    try {
      text = await fs.readFile(filePath, "utf8");
    } catch (error) {
      failures.push(`${group.path}: ${error.message}`);
      continue;
    }
    for (const marker of group.contains) {
      if (!text.includes(marker)) {
        failures.push(`${group.path}: missing marker ${JSON.stringify(marker)}.`);
      }
    }
  }
}

function validateStringArrayIncludes({ value, required, label, failures }) {
  if (!Array.isArray(value) || !value.every(isNonEmptyString)) {
    failures.push(`config/daily-resilience-policy.json: ${label} must be a string array.`);
    return;
  }
  for (const item of required) {
    if (!value.includes(item)) {
      failures.push(`config/daily-resilience-policy.json: ${label} missing ${JSON.stringify(item)}.`);
    }
  }
}

async function readJsonOrFailure(filePath, failures) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    failures.push(`${toPortablePath(filePath)}: ${error.message}`);
    return null;
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

function toPortablePath(filePath) {
  return filePath.replace(/\\/g, "/");
}
