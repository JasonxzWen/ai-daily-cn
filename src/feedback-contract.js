import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_LEDGER_PATH = "config/feedback-ledger.json";
const DEFAULT_MODULES_PATH = "prompts/ai-daily/modules.json";
const DEFAULT_MANIFEST_PATH = "prompts/ai-daily/manifest.json";
const DEFAULT_PACKAGE_PATH = "package.json";
const DEFAULT_TEST_ROOT = "tests";

export function normalizeOptimizationSuggestions(items = [], options = {}) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items.map((item, index) => normalizeOptimizationSuggestion(item, { ...options, index }));
}

export function normalizeOptimizationSuggestion(item = {}, options = {}) {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    throw new Error(`optimization_suggestions[${options.index ?? 0}] must be an object.`);
  }

  const issue = firstText(item.issue, item.observed_issue, item.title);
  const evidence = firstText(item.evidence, item.trigger, item.why);
  const module = firstText(item.module, item.suggested_module, item.area);
  const suggestion = firstText(item.suggestion, item.proposed_change);
  const expectedBenefit = firstText(item.expected_benefit, item.expectedBenefit, item.benefit);
  const requiresUserConfirmation =
    typeof item.requires_user_confirmation === "boolean"
      ? item.requires_user_confirmation
      : typeof item.needs_user_confirmation === "boolean"
        ? item.needs_user_confirmation
        : null;

  const missing = [];
  if (!issue) missing.push("issue");
  if (!evidence) missing.push("evidence");
  if (!module) missing.push("module");
  if (!suggestion) missing.push("suggestion");
  if (!expectedBenefit) missing.push("expected_benefit");
  if (requiresUserConfirmation === null) missing.push("requires_user_confirmation");
  if (missing.length > 0) {
    throw new Error(`optimization_suggestions[${options.index ?? 0}] missing required fields: ${missing.join(", ")}`);
  }

  return {
    issue,
    evidence,
    module,
    suggestion,
    expected_benefit: expectedBenefit,
    requires_user_confirmation: requiresUserConfirmation
  };
}

export async function validateFeedbackContract(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const ledger = options.ledger || await readJsonIfExists(rootDir, options.ledgerPath || DEFAULT_LEDGER_PATH);
  const promptModules = options.promptModules || await readJsonIfExists(rootDir, options.modulesPath || DEFAULT_MODULES_PATH);
  const promptManifest = options.promptManifest || await readJsonIfExists(rootDir, options.manifestPath || DEFAULT_MANIFEST_PATH);
  const packageJson = options.packageJson || await readJsonIfExists(rootDir, options.packagePath || DEFAULT_PACKAGE_PATH);
  const testFiles = Array.isArray(options.testFiles)
    ? options.testFiles
    : await readTestFiles(rootDir, options.testRoot || DEFAULT_TEST_ROOT);
  const validateCommands = collectValidateCommands(packageJson);
  const failures = [];

  await validateLedger(ledger, failures, { rootDir, testFiles, validateCommands });
  validatePromptModuleMetadata(promptModules, promptManifest, failures);

  return {
    ok: failures.length === 0,
    failures
  };
}

async function validateLedger(ledger, failures, context) {
  if (!ledger || typeof ledger !== "object" || Array.isArray(ledger)) {
    failures.push("config/feedback-ledger.json: missing or invalid feedback ledger");
    return;
  }
  if (ledger.schema_version !== 1) {
    failures.push("config/feedback-ledger.json: schema_version must be 1");
  }
  if (!Array.isArray(ledger.items) || ledger.items.length === 0) {
    failures.push("config/feedback-ledger.json: items must contain at least one feedback item");
    return;
  }

  const seen = new Set();
  for (const item of ledger.items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      failures.push("config/feedback-ledger.json: every feedback item must be an object");
      continue;
    }
    const id = String(item.id || "").trim();
    if (!id) {
      failures.push("config/feedback-ledger.json: every feedback item requires id");
      continue;
    }
    if (seen.has(id)) {
      failures.push(`config/feedback-ledger.json: duplicate feedback id ${id}`);
    }
    seen.add(id);

    const severity = String(item.severity || "").trim();
    const status = String(item.status || "").trim();
    if (!["P0", "P1", "P2", "P3"].includes(severity)) {
      failures.push(`config/feedback-ledger.json: ${id} has invalid severity`);
    }
    if (!["confirmed", "implemented", "closed", "deferred"].includes(status)) {
      failures.push(`config/feedback-ledger.json: ${id} has invalid status`);
    }

    if (severity === "P1" && status !== "closed" && status !== "deferred") {
      await validateScopeBinding(item, failures, context.rootDir);
      validateP1Binding(item, failures, context);
    }
  }
}

async function validateScopeBinding(item, failures, rootDir) {
  const id = item.id;
  if (!Array.isArray(item.scope) || item.scope.length === 0) {
    failures.push(`config/feedback-ledger.json: ${id} P1 feedback requires at least one scope path`);
    return;
  }

  for (const scopePath of item.scope) {
    const relativePath = normalizeRepoPath(scopePath);
    if (!relativePath) {
      failures.push(`config/feedback-ledger.json: ${id} scope path must be repo-relative`);
      continue;
    }
    try {
      await fs.stat(path.join(rootDir, ...relativePath.split("/")));
    } catch {
      failures.push(`config/feedback-ledger.json: ${id} scope path does not exist: ${relativePath}`);
    }
  }
}

function validateP1Binding(item, failures, context) {
  const id = item.id;
  const validation = item.validation;
  if (!validation || typeof validation !== "object" || Array.isArray(validation)) {
    failures.push(`config/feedback-ledger.json: ${id} P1 feedback requires validation binding`);
    return;
  }
  const command = String(validation.command || "").trim();
  const testName = String(validation.test_name || "").trim();
  const gate = String(validation.gate || "").trim();
  if (!command) {
    failures.push(`config/feedback-ledger.json: ${id} validation.command is required`);
  }
  if (!testName && !gate) {
    failures.push(`config/feedback-ledger.json: ${id} validation.test_name or validation.gate is required`);
  }
  if (command && !isCommandCoveredByValidate(command, context.validateCommands)) {
    failures.push(`config/feedback-ledger.json: ${id} validation.command is not covered by npm run validate: ${command}`);
  }
  if (testName && !testNameExists(testName, context.testFiles)) {
    failures.push(`config/feedback-ledger.json: ${id} validation.test_name not found in tests: ${testName}`);
  }
}

function validatePromptModuleMetadata(promptModules, promptManifest, failures) {
  if (!promptModules || !promptManifest) {
    failures.push("prompts/ai-daily: modules.json and manifest.json are required for feedback contract validation");
    return;
  }
  const metadataModules = Array.isArray(promptModules.modules) ? promptModules.modules : [];
  const manifestModules = Array.isArray(promptManifest.modules) ? promptManifest.modules : [];
  const metadataNames = metadataModules.map((item) => `${String(item.name || "").trim()}.md`);
  const missing = manifestModules.filter((moduleName) => !metadataNames.includes(moduleName));
  const extra = metadataNames.filter((moduleName) => moduleName !== ".md" && !manifestModules.includes(moduleName));
  if (missing.length > 0) {
    failures.push(`prompts/ai-daily/modules.json: missing manifest modules ${missing.join(", ")}`);
  }
  if (extra.length > 0) {
    failures.push(`prompts/ai-daily/modules.json: extra modules not in manifest ${extra.join(", ")}`);
  }
  for (const item of metadataModules) {
    if (!String(item.name || "").trim() || !String(item.purpose || "").trim()) {
      failures.push("prompts/ai-daily/modules.json: every module requires name and purpose");
    }
  }
}

async function readJsonIfExists(rootDir, relativePath) {
  try {
    return JSON.parse(await fs.readFile(path.join(rootDir, ...relativePath.split("/")), "utf8"));
  } catch {
    return null;
  }
}

async function readTestFiles(rootDir, testRoot) {
  const files = [];
  const absoluteRoot = path.join(rootDir, ...testRoot.split("/"));
  await readTestFilesRecursive(rootDir, absoluteRoot, files);
  return files;
}

async function readTestFilesRecursive(rootDir, dir, files) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await readTestFilesRecursive(rootDir, absolutePath, files);
      continue;
    }
    if (!/\.(?:[cm]?[jt]sx?)$/.test(entry.name)) {
      continue;
    }
    files.push({
      path: normalizePath(path.relative(rootDir, absolutePath)),
      content: await fs.readFile(absolutePath, "utf8")
    });
  }
}

function collectValidateCommands(packageJson) {
  const scripts = packageJson?.scripts && typeof packageJson.scripts === "object" ? packageJson.scripts : {};
  const commands = new Set();
  const seenScripts = new Set();

  function visit(scriptName) {
    if (seenScripts.has(scriptName)) {
      return;
    }
    seenScripts.add(scriptName);
    const script = String(scripts[scriptName] || "").trim();
    if (!script) {
      return;
    }
    commands.add(normalizeCommand(`npm run ${scriptName}`));
    for (const part of splitScriptParts(script)) {
      commands.add(normalizeCommand(part));
      for (const nestedScript of npmRunScripts(part)) {
        visit(nestedScript);
      }
    }
  }

  visit("validate");
  return [...commands];
}

function splitScriptParts(script) {
  return script
    .split(/\s+&&\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function npmRunScripts(command) {
  const scripts = [];
  const pattern = /\bnpm\s+run\s+([^\s&]+)/g;
  let match;
  while ((match = pattern.exec(command)) !== null) {
    scripts.push(match[1].replace(/^['"]|['"]$/g, ""));
  }
  return scripts;
}

function isCommandCoveredByValidate(command, validateCommands) {
  const normalized = normalizeCommand(command);
  return validateCommands.some((coveredCommand) => coveredCommand === normalized || coveredCommand.includes(normalized));
}

function testNameExists(testName, testFiles) {
  return testFiles.some((file) => String(file.content || "").includes(testName));
}

function normalizeRepoPath(value) {
  const normalized = normalizePath(String(value || "").trim());
  if (!normalized || normalized.startsWith("../") || normalized === ".." || path.isAbsolute(normalized)) {
    return "";
  }
  return normalized;
}

function normalizePath(value) {
  return String(value || "").replace(/\\/g, "/");
}

function normalizeCommand(command) {
  return String(command || "").trim().replace(/\s+/g, " ");
}

function firstText(...values) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) {
      return text;
    }
  }
  return "";
}
