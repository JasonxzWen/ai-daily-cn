import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const DEFAULT_CONTRACT_PATH = path.join("config", "daily-workflow-contract.json");

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

  await validatePackageScripts({ rootDir, contract, failures, checkedFiles });
  await validateFileMarkers({ rootDir, markerGroups: contract.required_markers || [], failures, checkedFiles });
  await validateForbiddenMarkers({ rootDir, markerGroups: contract.forbidden_markers || [], failures, checkedFiles });
  await validateExternalAutomationPrompt({ rootDir, contract, options, failures, warnings, checkedFiles });

  return {
    ok: failures.length === 0,
    failures,
    warnings,
    checked_files: uniqueSorted(checkedFiles)
  };
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

  const automationPromptPath = options.automationPromptPath || defaultAutomationPromptPath();
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
