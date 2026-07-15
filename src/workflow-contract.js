import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { inspectAutomationInventory } from "./automation-inventory.js";

const DEFAULT_CONTRACT_PATH = path.join("config", "daily-workflow-contract.json");
const REQUIRED_PUBLIC_SIGNAL_DISCOVERY_LANES = [
  ["github-trending", "discover_github_trending", ".tmp/github-trending-YYYY-MM-DD.json"],
  ["source-watch", "discover_source_watch", ".tmp/source-watch-YYYY-MM-DD.json"],
  ["huggingface-trending", "discover_huggingface_trending", ".tmp/huggingface-trending-YYYY-MM-DD.json"],
  ["builders", "discover_builders", ".tmp/builders-YYYY-MM-DD.json"],
  ["china-ai", "discover_china_ai", ".tmp/china-ai-YYYY-MM-DD.json"],
  ["content-sources", "discover_content_sources", ".tmp/content-sources-YYYY-MM-DD.json"],
  ["statuspage-incidents", "discover_statuspage_incidents", ".tmp/statuspage-incidents-YYYY-MM-DD.json"],
  ["search-news", "discover_search_news", ".tmp/search-news-YYYY-MM-DD.json"]
];

export async function loadDailyWorkflowContract(options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const contractPath = path.resolve(rootDir, options.contractPath || DEFAULT_CONTRACT_PATH);
  const raw = await fs.readFile(contractPath, "utf8");
  return {
    contractPath,
    contract: JSON.parse(raw)
  };
}

export async function validateDailyWorkflowContract(options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const { contractPath, contract } = await loadDailyWorkflowContract({
    rootDir,
    contractPath: options.contractPath
  });
  const failures = [];
  const warnings = [];
  const checkedFiles = [toPortablePath(contractPath)];

  if (contract.schema_version !== 1) {
    failures.push("config/daily-workflow-contract.json: schema_version must be 1.");
  }

  validateContractSemantics({ contract, failures });
  await validatePackageScripts({ rootDir, contract, failures, checkedFiles });
  await validateFileMarkers({ rootDir, markerGroups: contract.required_markers || [], failures, checkedFiles });
  await validateForbiddenMarkers({ rootDir, markerGroups: contract.forbidden_markers || [], failures, checkedFiles });
  await validateExternalAutomationPrompt({ rootDir, contract, options, failures, warnings, checkedFiles });
  await validateExternalAutomationInventory({ contract, options, failures, warnings, checkedFiles });

  return {
    ok: failures.length === 0,
    failures,
    warnings,
    checked_files: uniqueSorted(checkedFiles)
  };
}

function validateContractSemantics({ contract, failures }) {
  const prefix = "config/daily-workflow-contract.json";
  const dailyRunner = plainObject(contract.daily_runner);
  if (!dailyRunner) {
    failures.push(`${prefix}: daily_runner must be an object.`);
    return;
  }

  const publicSignals = plainObject(dailyRunner.public_signals);
  if (!publicSignals) {
    failures.push(`${prefix}: daily_runner.public_signals must be an object.`);
  } else {
    expectExact(publicSignals.content_admission_gate, false, `${prefix}: daily_runner.public_signals.content_admission_gate`, failures);
    expectExact(
      publicSignals.membership_policy,
      "all_safe_normalized_observations",
      `${prefix}: daily_runner.public_signals.membership_policy`,
      failures
    );
    expectExact(
      publicSignals.publishes_before_legacy_report,
      true,
      `${prefix}: daily_runner.public_signals.publishes_before_legacy_report`,
      failures
    );
    requireArrayMembers(
      publicSignals.labels_are_non_gating,
      ["source_group", "content_tags", "credibility_tag", "source_health", "access_state"],
      `${prefix}: daily_runner.public_signals.labels_are_non_gating`,
      failures
    );
    validatePublicSignalDiscoveryLanes({ lanes: publicSignals.discovery_lanes, prefix, failures });
    validateSignalBaselineSemantics({ baseline: publicSignals.history_baseline, prefix, failures });
    validateSourceWatchSemantics({ sourceWatch: publicSignals.source_watch, prefix, failures });
  }

  if (dailyRunner.source_watch !== undefined) {
    failures.push(`${prefix}: daily_runner.source_watch is retired; Source Watch must live under daily_runner.public_signals.`);
  }
  if (dailyRunner.official_blog_context !== undefined) {
    failures.push(`${prefix}: daily_runner.official_blog_context is retired; editorial admission must be scoped under daily_runner.legacy_report.`);
  }

  const legacyReport = plainObject(dailyRunner.legacy_report);
  if (!legacyReport) {
    failures.push(`${prefix}: daily_runner.legacy_report must be an object.`);
  } else {
    expectExact(legacyReport.optional_derivative, true, `${prefix}: daily_runner.legacy_report.optional_derivative`, failures);
    expectExact(
      legacyReport.cannot_change_signal_membership,
      true,
      `${prefix}: daily_runner.legacy_report.cannot_change_signal_membership`,
      failures
    );
    expectExact(
      legacyReport.runs_after_public_signal_publish,
      true,
      `${prefix}: daily_runner.legacy_report.runs_after_public_signal_publish`,
      failures
    );
    const officialBlogContext = plainObject(legacyReport.official_blog_context);
    if (!officialBlogContext) {
      failures.push(`${prefix}: daily_runner.legacy_report.official_blog_context must be an object.`);
    } else {
      expectExact(
        officialBlogContext.scope,
        "legacy_report_only",
        `${prefix}: daily_runner.legacy_report.official_blog_context.scope`,
        failures
      );
    }
  }

  const modes = plainObject(dailyRunner.modes);
  requireArrayMembers(
    modes?.dry_run?.allowed_terminal_statuses,
    ["generated_only", "generated_degraded", "generated_signals_only"],
    `${prefix}: daily_runner.modes.dry_run.allowed_terminal_statuses`,
    failures
  );
  requireArrayMembers(
    modes?.publish?.allowed_terminal_statuses,
    ["published", "published_signals_only", "published_pending_pages_verification"],
    `${prefix}: daily_runner.modes.publish.allowed_terminal_statuses`,
    failures
  );
}

function validatePublicSignalDiscoveryLanes({ lanes, prefix, failures }) {
  const label = `${prefix}: daily_runner.public_signals.discovery_lanes`;
  if (!Array.isArray(lanes)) {
    failures.push(`${label} must be an array.`);
    return;
  }
  const actual = lanes.map((lane) => [lane?.id, lane?.stage_id, lane?.artifact_path_template]);
  if (JSON.stringify(actual) !== JSON.stringify(REQUIRED_PUBLIC_SIGNAL_DISCOVERY_LANES)) {
    failures.push(`${label} must be the canonical ordered discovery lane manifest.`);
  }
  if (new Set(lanes.map((lane) => lane?.id)).size !== lanes.length) {
    failures.push(`${label} ids must be unique.`);
  }
  if (new Set(lanes.map((lane) => lane?.artifact_path_template)).size !== lanes.length) {
    failures.push(`${label} artifact templates must be unique.`);
  }
}

function validateSignalBaselineSemantics({ baseline, prefix, failures }) {
  const value = plainObject(baseline);
  const label = `${prefix}: daily_runner.public_signals.history_baseline`;
  if (!value) {
    failures.push(`${label} must be an object.`);
    return;
  }
  const expectedFields = {
    path_pattern: "reports-data/occurrences/baseline-v1/YYYY-MM.json.gz",
    manifest_path: "reports-data/occurrence-baseline-manifest.json",
    immutable: true,
    production_reads_legacy_artifacts: false,
    migration_script: "signals:migrate-baseline"
  };
  for (const [field, expected] of Object.entries(expectedFields)) {
    expectExact(value[field], expected, `${label}.${field}`, failures);
  }
}

function validateSourceWatchSemantics({ sourceWatch, prefix, failures }) {
  const value = plainObject(sourceWatch);
  if (!value) {
    failures.push(`${prefix}: daily_runner.public_signals.source_watch must be an object.`);
    return;
  }
  const exactFields = {
    producer_stage: "discover_source_watch",
    persistence_stage: "signals_write",
    occurrence_store_path_template: "reports-data/occurrences/YYYY/MM/YYYY-MM-DD.json",
    consumer_stage: "signals_build",
    validation_stage: "signals_validate",
    public_index_path: "docs/signals/index.json",
    zero_observations_still_consumed: true
  };
  for (const [field, expected] of Object.entries(exactFields)) {
    expectExact(value[field], expected, `${prefix}: daily_runner.public_signals.source_watch.${field}`, failures);
  }
  requireArrayMembers(
    value.connected_requires,
    [
      "producer_stage_receipt_path_and_sha256_match",
      "signals_write_passed",
      "same_day_occurrence_store_schema_valid",
      "producer_snapshots_trace_to_occurrence_observation_ids",
      "signals_build_passed",
      "signals_validate_passed",
      "public_signal_index_schema_valid"
    ],
    `${prefix}: daily_runner.public_signals.source_watch.connected_requires`,
    failures
  );
}

function requireArrayMembers(actual, required, label, failures) {
  if (!Array.isArray(actual)) {
    failures.push(`${label} must be an array.`);
    return;
  }
  for (const item of required) {
    if (!actual.includes(item)) failures.push(`${label} must include ${JSON.stringify(item)}.`);
  }
}

function expectExact(actual, expected, label, failures) {
  if (actual !== expected) {
    failures.push(`${label} must be ${JSON.stringify(expected)} but found ${JSON.stringify(actual)}.`);
  }
}

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

async function validateExternalAutomationInventory({ contract, options, failures, warnings, checkedFiles }) {
  const inventoryConfig = contract.external_automation_inventory;
  if (!inventoryConfig) return;

  const inventory = await inspectAutomationInventory({
    automationsDir: options.automationsDir,
    projectCwds: inventoryConfig.project_cwds || options.projectCwds
  });
  if (!inventory.available) {
    warnings.push(`external automation inventory not found: ${inventory.automations_dir || inventory.error}`);
    return;
  }

  for (const automation of inventory.automations || []) {
    checkedFiles.push(toPortablePath(automation.path));
  }

  const projectAutomations = inventory.automations || [];
  if (inventoryConfig.require_single_project_automation && projectAutomations.length !== 1) {
    failures.push(`external automations: expected exactly one project automation, found ${projectAutomations.length}.`);
  }

  const allowedProjectIds = new Set(inventoryConfig.allowed_project_automation_ids || []);
  for (const automation of projectAutomations) {
    if (allowedProjectIds.size > 0 && !allowedProjectIds.has(automation.id)) {
      failures.push(`external automations: project automation ${automation.id} is not allowed.`);
    }
  }

  const activePublish = inventory.active_publish_automations || [];
  if (inventoryConfig.require_single_active_publish !== false && activePublish.length !== 1) {
    failures.push(`external automations: expected exactly one active daily publish automation, found ${activePublish.length}.`);
  }

  const allowedPublishIds = new Set(inventoryConfig.allowed_daily_publish_ids || []);
  for (const automation of activePublish) {
    if (allowedPublishIds.size > 0 && !allowedPublishIds.has(automation.id)) {
      failures.push(`external automations: active daily publish automation ${automation.id} is not allowed.`);
    }
    if (automation.legacy_flow) {
      failures.push(`external automations: active daily publish automation ${automation.id} still uses the legacy publish flow.`);
    }
  }

  if (inventoryConfig.require_active_status_self_check) {
    const activeSelfChecks = inventory.active_self_check_automations || [];
    if (activeSelfChecks.length < 1) {
      failures.push("external automations: expected an active status:self-check automation.");
    }
    if (activeSelfChecks.length > 1) {
      failures.push(`external automations: expected one active status:self-check automation, found ${activeSelfChecks.length}.`);
    }
    for (const marker of inventoryConfig.status_self_check_contains || []) {
      if (!activeSelfChecks.some((automation) => automation.path && automation.status_self_check && automation.id.includes(marker))) {
        // Marker compatibility is handled by prompt parsing; keep this optional field future-proof.
        continue;
      }
    }
  }
}

async function validatePackageScripts({ rootDir, contract, failures, checkedFiles }) {
  const packagePath = path.join(rootDir, "package.json");
  checkedFiles.push(toPortablePath(packagePath));
  let packageJson;
  try {
    packageJson = JSON.parse(await fs.readFile(packagePath, "utf8"));
  } catch (error) {
    failures.push(`package.json: ${error.message}`);
    return;
  }

  const requiredScripts = contract.required_package_scripts || {};
  for (const [scriptName, expectedCommand] of Object.entries(requiredScripts)) {
    const actual = packageJson.scripts?.[scriptName];
    if (actual !== expectedCommand) {
      failures.push(`package.json scripts.${scriptName} expected ${JSON.stringify(expectedCommand)} but found ${JSON.stringify(actual || "")}.`);
    }
  }

  const validateScript = packageJson.scripts?.validate || "";
  for (const requiredValidateCommand of contract.validate_must_include || []) {
    if (!validateScript.includes(requiredValidateCommand)) {
      failures.push(`package.json scripts.validate must include ${JSON.stringify(requiredValidateCommand)}.`);
    }
  }
}

async function validateFileMarkers({ rootDir, markerGroups, failures, checkedFiles }) {
  for (const group of markerGroups) {
    const filePath = path.resolve(rootDir, group.path);
    checkedFiles.push(toPortablePath(filePath));
    const text = await readTextOrFailure(filePath, failures);
    if (text === null) continue;
    for (const marker of group.contains || []) {
      if (!text.includes(marker)) {
        failures.push(`${group.path}: missing marker ${JSON.stringify(marker)}.`);
      }
    }
  }
}

async function validateForbiddenMarkers({ rootDir, markerGroups, failures, checkedFiles }) {
  for (const group of markerGroups) {
    const filePath = path.resolve(rootDir, group.path);
    checkedFiles.push(toPortablePath(filePath));
    const text = await readTextOrFailure(filePath, failures);
    if (text === null) continue;
    for (const marker of group.not_contains || []) {
      if (text.includes(marker)) {
        failures.push(`${group.path}: forbidden marker still present ${JSON.stringify(marker)}.`);
      }
    }
  }
}

async function validateExternalAutomationPrompt({ contract, options, failures, warnings, checkedFiles }) {
  const external = contract.external_automation_prompt;
  if (!external) return;

  const automationPromptPath = options.automationPromptPath || await resolveExternalAutomationPromptPath({
    contract,
    external,
    options,
    warnings,
    checkedFiles
  });
  if (!automationPromptPath) return;

  try {
    await fs.access(automationPromptPath);
  } catch {
    warnings.push(`external automation prompt not found: ${automationPromptPath}`);
    return;
  }

  checkedFiles.push(toPortablePath(automationPromptPath));
  const text = await fs.readFile(automationPromptPath, "utf8");
  for (const marker of external.contains || []) {
    if (!text.includes(marker)) {
      failures.push(`${automationPromptPath}: missing marker ${JSON.stringify(marker)}.`);
    }
  }
  for (const marker of external.not_contains || []) {
    if (text.includes(marker)) {
      failures.push(`${automationPromptPath}: forbidden marker still present ${JSON.stringify(marker)}.`);
    }
  }
}

async function resolveExternalAutomationPromptPath({ contract, external, options, warnings, checkedFiles }) {
  if (external.target === "active_daily_publish") {
    const inventory = await inspectAutomationInventory({
      automationsDir: options.automationsDir,
      projectCwds: external.project_cwds || contract.external_automation_inventory?.project_cwds || options.projectCwds
    });
    if (!inventory.available) {
      warnings.push(`external automation inventory not found for prompt target: ${inventory.automations_dir || inventory.error}`);
      return "";
    }
    for (const automation of inventory.automations || []) {
      checkedFiles.push(toPortablePath(automation.path));
    }
    const activePublish = inventory.active_publish_automations || [];
    if (activePublish.length !== 1 || !activePublish[0]?.path) {
      warnings.push(`external automation prompt target active_daily_publish expected one active publish automation, found ${activePublish.length}.`);
      return "";
    }
    return activePublish[0].path;
  }

  return defaultAutomationPromptPath();
}

async function readTextOrFailure(filePath, failures) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    failures.push(`${filePath}: ${error.message}`);
    return null;
  }
}

function defaultAutomationPromptPath() {
  const homeDir = os.homedir();
  return homeDir ? path.join(homeDir, ".codex", "automations", "ai-daily", "automation.toml") : "";
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

function toPortablePath(filePath) {
  return filePath.replace(/\\/g, "/");
}
