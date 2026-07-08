import fs from "node:fs/promises";
import path from "node:path";

const DESIGN_ROOT = "design";
const QUALITY_DOC = path.join(DESIGN_ROOT, "frontend-quality-workflow.md");
const SOURCES_MANIFEST = path.join(DESIGN_ROOT, "design-quality-sources.json");
const ADC_SKILL = path.join(".codex", "skills", "adc-frontend-quality", "SKILL.md");
const TASTE_SKILL = path.join(".codex", "skills", "design-taste-frontend", "SKILL.md");
const PACKAGE_JSON = "package.json";
const REQUIRED_DOCS = [QUALITY_DOC, SOURCES_MANIFEST, ADC_SKILL, TASTE_SKILL];

export async function validateDesignQuality(options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const issues = [];
  const warnings = [];
  const requiredDocs = [];

  for (const relativePath of REQUIRED_DOCS) {
    const exists = await pathExists(path.join(rootDir, relativePath));
    requiredDocs.push({ path: toPosix(relativePath), exists });
    if (!exists) {
      issues.push({
        code: "design_quality_required_file_missing",
        path: toPosix(relativePath),
        message: `${toPosix(relativePath)} is required by the ADC frontend quality contract.`
      });
    }
  }

  const manifest = await readJson({ rootDir, relativePath: SOURCES_MANIFEST, issues });
  if (manifest) validateManifest({ manifest, issues });

  await validateQualityDoc({ rootDir, issues });
  await validateAdcSkill({ rootDir, issues });
  await validateTasteSkill({ rootDir, manifest, issues, warnings });
  await validatePackageContracts({ rootDir, issues });

  return {
    ok: issues.length === 0,
    required_docs: requiredDocs,
    sources_checked: Array.isArray(manifest?.adopted_sources) ? manifest.adopted_sources.length : 0,
    warnings,
    issues
  };
}

async function readJson({ rootDir, relativePath, issues }) {
  const absolutePath = path.join(rootDir, relativePath);
  try {
    return JSON.parse(await fs.readFile(absolutePath, "utf8"));
  } catch (error) {
    issues.push({
      code: "design_quality_json_invalid",
      path: toPosix(relativePath),
      message: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

function validateManifest({ manifest, issues }) {
  if (manifest.schema_version !== "1") {
    issues.push({
      code: "design_quality_schema_version_invalid",
      path: toPosix(SOURCES_MANIFEST),
      message: "schema_version must be 1."
    });
  }
  if (!Array.isArray(manifest.adopted_sources)) {
    issues.push({
      code: "design_quality_sources_missing",
      path: toPosix(SOURCES_MANIFEST),
      message: "adopted_sources must be an array."
    });
    return;
  }

  const sources = new Map(manifest.adopted_sources.map((source) => [source.id, source]));
  validateTasteSource(sources.get("taste-skill"), issues);
  validateImpeccableSource(sources.get("impeccable"), issues);
  validateQualityContract(manifest.quality_contract, issues);
}

function validateTasteSource(source, issues) {
  const pathName = toPosix(SOURCES_MANIFEST);
  if (!source) {
    issues.push({
      code: "design_quality_source_missing",
      path: pathName,
      message: "taste-skill source record is required."
    });
    return;
  }
  requireEqual(source.url, "https://github.com/Leonxlnx/taste-skill", "taste-skill.url", pathName, issues);
  requireEqual(source.local_skill, toPosix(TASTE_SKILL), "taste-skill.local_skill", pathName, issues);
  requireEqual(source.license, "MIT", "taste-skill.license", pathName, issues);
  requireString(source.upstream_commit, "taste-skill.upstream_commit", pathName, issues, /^[a-f0-9]{40}$/);
  requireEqual(source.production_dependency, false, "taste-skill.production_dependency", pathName, issues);
  requireString(source.role, "taste-skill.role", pathName, issues);
}

function validateImpeccableSource(source, issues) {
  const pathName = toPosix(SOURCES_MANIFEST);
  if (!source) {
    issues.push({
      code: "design_quality_source_missing",
      path: pathName,
      message: "impeccable source record is required."
    });
    return;
  }
  requireEqual(source.url, "https://github.com/pbakaus/impeccable", "impeccable.url", pathName, issues);
  requireEqual(source.license, "Apache-2.0", "impeccable.license", pathName, issues);
  requireEqual(source.install_command, "npx impeccable install", "impeccable.install_command", pathName, issues);
  requireEqual(source.init_command, "/impeccable init", "impeccable.init_command", pathName, issues);
  requireEqual(source.production_dependency, false, "impeccable.production_dependency", pathName, issues);
  requireString(source.role, "impeccable.role", pathName, issues);
}

function validateQualityContract(contract, issues) {
  const pathName = toPosix(SOURCES_MANIFEST);
  if (!contract || typeof contract !== "object") {
    issues.push({
      code: "design_quality_contract_missing",
      path: pathName,
      message: "quality_contract is required."
    });
    return;
  }
  const stack = new Set(Array.isArray(contract.implementation_stack) ? contract.implementation_stack : []);
  for (const required of ["React", "Astryx", "Vite"]) {
    if (!stack.has(required)) {
      issues.push({
        code: "design_quality_stack_missing",
        path: pathName,
        message: `quality_contract.implementation_stack must include ${required}.`
      });
    }
  }
  const evidence = new Set(
    Array.isArray(contract.required_frontend_pr_evidence) ? contract.required_frontend_pr_evidence : []
  );
  for (const required of [
    "design_read",
    "design_dials",
    "source_or_tool_evidence",
    "audit_or_skip_reason",
    "browser_acceptance"
  ]) {
    if (!evidence.has(required)) {
      issues.push({
        code: "design_quality_evidence_missing",
        path: pathName,
        message: `quality_contract.required_frontend_pr_evidence must include ${required}.`
      });
    }
  }
  const forbidden = new Set(Array.isArray(contract.forbidden) ? contract.forbidden : []);
  for (const required of ["direct_generated_code_to_production", "landing_page_replacement_for_data_product"]) {
    if (!forbidden.has(required)) {
      issues.push({
        code: "design_quality_forbidden_missing",
        path: pathName,
        message: `quality_contract.forbidden must include ${required}.`
      });
    }
  }
}

async function validateQualityDoc({ rootDir, issues }) {
  const relativePath = QUALITY_DOC;
  const doc = await readTextIfExists(path.join(rootDir, relativePath));
  if (!doc) return;

  const requiredPatterns = [
    [/adc-frontend-quality:v1/, "The workflow version marker must be present."],
    [/taste-skill-boundary/, "The taste-skill boundary marker must be present."],
    [/impeccable-boundary/, "The Impeccable boundary marker must be present."],
    [/frontend-quality-validation/, "The validation marker must be present."],
    [/design-taste-frontend/, "The local taste-skill entrypoint must be named."],
    [/npx impeccable install/, "The Impeccable install command must be documented."],
    [/not for dashboards, data tables/i, "The taste-skill negative routing boundary must be explicit."],
    [/React/, "React must be named as an implementation target."],
    [/Astryx/, "Astryx must be named as an implementation target."],
    [/DESIGN_VARIANCE/, "DESIGN_VARIANCE must be required."],
    [/MOTION_INTENSITY/, "MOTION_INTENSITY must be required."],
    [/VISUAL_DENSITY/, "VISUAL_DENSITY must be required."],
    [/prefers-reduced-motion/, "Reduced-motion handling must be required."],
    [/Playwright/, "Browser acceptance must mention Playwright or equivalent evidence."]
  ];
  requirePatterns(doc, requiredPatterns, relativePath, "design_quality_workflow_incomplete", issues);
}

async function validateAdcSkill({ rootDir, issues }) {
  const relativePath = ADC_SKILL;
  const skill = await readTextIfExists(path.join(rootDir, relativePath));
  if (!skill) return;
  const requiredPatterns = [
    [/name:\s*adc-frontend-quality/, "Skill name must match the folder."],
    [/design\/frontend-quality-workflow\.md/, "Skill must progressively load the workflow doc."],
    [/design\/design-quality-sources\.json/, "Skill must progressively load the source manifest."],
    [/design-taste-frontend/, "Skill must reference the local taste skill."],
    [/Impeccable/, "Skill must reference Impeccable."],
    [/React/, "Skill must name React."],
    [/Astryx/, "Skill must name Astryx."],
    [/browser acceptance/i, "Skill must require browser acceptance evidence."],
    [/do not load for backend-only source ingestion/i, "Skill description must avoid non-UI ingestion work."]
  ];
  requirePatterns(skill, requiredPatterns, relativePath, "design_quality_skill_incomplete", issues);
}

async function validateTasteSkill({ rootDir, manifest, issues, warnings }) {
  const relativePath = TASTE_SKILL;
  const skill = await readTextIfExists(path.join(rootDir, relativePath));
  if (!skill) return;

  const tasteSource = Array.isArray(manifest?.adopted_sources)
    ? manifest.adopted_sources.find((source) => source.id === "taste-skill")
    : null;
  const requiredCommit = tasteSource?.upstream_commit;
  const requiredPatterns = [
    [/name:\s*design-taste-frontend/, "Local taste skill name must remain stable."],
    [/Leonxlnx\/taste-skill/, "Local taste skill must record the upstream source."],
    [/license:\s*MIT/, "Local taste skill must record the MIT license."],
    [/do not load for dashboards, data tables, multi-step product UI/i, "Local taste skill must keep the negative routing boundary."]
  ];
  if (typeof requiredCommit === "string" && requiredCommit) {
    requiredPatterns.push([new RegExp(requiredCommit), "Local taste skill must match the manifest upstream commit."]);
  }
  requirePatterns(skill, requiredPatterns, relativePath, "design_quality_taste_skill_incomplete", issues);

  if (!/routine React\/Next logic/i.test(skill)) {
    warnings.push({
      code: "design_quality_taste_skill_boundary_weaker_than_expected",
      path: toPosix(relativePath),
      message: "Consider keeping routine React/Next logic outside the taste skill."
    });
  }
}

async function validatePackageContracts({ rootDir, issues }) {
  const packagePaths = await findWorkspacePackageJsonFiles(rootDir);
  for (const packagePath of packagePaths) {
    const packageJson = await readJson({ rootDir, relativePath: packagePath, issues });
    if (!packageJson) continue;
    if (packagePath === PACKAGE_JSON) validateRootPackageScripts(packageJson, issues);
    validateExternalToolPackageBoundary(packageJson, packagePath, issues);
  }
}

function validateRootPackageScripts(packageJson, issues) {
  const scripts = packageJson.scripts || {};
  if (scripts["design-quality:validate"] !== "node scripts/validate-design-quality.mjs") {
    issues.push({
      code: "design_quality_script_missing",
      path: PACKAGE_JSON,
      message: "package.json must define design-quality:validate."
    });
  }
  for (const scriptName of ["validate:docs", "validate"]) {
    if (typeof scripts[scriptName] !== "string" || !scripts[scriptName].includes("design-quality:validate")) {
      issues.push({
        code: "design_quality_script_not_chained",
        path: PACKAGE_JSON,
        message: `${scriptName} must run design-quality:validate.`
      });
    }
  }
  if (typeof scripts.test !== "string" || !scripts.test.includes("tests/design-quality.test.js")) {
    issues.push({
      code: "design_quality_test_not_chained",
      path: PACKAGE_JSON,
      message: "package.json test script must run tests/design-quality.test.js."
    });
  }
}

function validateExternalToolPackageBoundary(packageJson, packagePath, issues) {
  const dependencyFields = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"];
  for (const field of dependencyFields) {
    const dependencies = packageJson[field];
    if (!dependencies || typeof dependencies !== "object") continue;
    for (const packageName of Object.keys(dependencies)) {
      if (isForbiddenExternalToolName(packageName)) {
        issues.push({
          code: "design_quality_external_tool_dependency_forbidden",
          path: toPosix(packagePath),
          message: `${field}.${packageName} must not be added while the design quality manifest marks external tools as non-production dependencies.`
        });
      }
    }
  }

  const scripts = packageJson.scripts || {};
  for (const [scriptName, command] of Object.entries(scripts)) {
    const scriptText = `${scriptName} ${typeof command === "string" ? command : ""}`;
    if (isForbiddenExternalToolScript(scriptText)) {
      issues.push({
        code: "design_quality_external_tool_script_forbidden",
        path: toPosix(packagePath),
        message: `${scriptName} must not invoke taste-skill or Impeccable from package scripts; record them as optional audit evidence instead.`
      });
    }
  }
}

function requirePatterns(content, patterns, relativePath, code, issues) {
  for (const [pattern, message] of patterns) {
    if (!pattern.test(content)) {
      issues.push({
        code,
        path: toPosix(relativePath),
        message
      });
    }
  }
}

function requireString(value, field, recordPath, issues, pattern) {
  if (typeof value !== "string" || value.trim() === "") {
    issues.push({
      code: "design_quality_required_field_missing",
      path: recordPath,
      message: `${field} must be a non-empty string.`
    });
    return;
  }
  if (pattern && !pattern.test(value)) {
    issues.push({
      code: "design_quality_field_invalid",
      path: recordPath,
      message: `${field} is invalid.`
    });
  }
}

function requireEqual(actual, expected, field, recordPath, issues) {
  if (actual !== expected) {
    issues.push({
      code: "design_quality_field_invalid",
      path: recordPath,
      message: `${field} must be ${expected}.`
    });
  }
}

async function findWorkspacePackageJsonFiles(rootDir) {
  const packagePaths = [PACKAGE_JSON];
  for (const workspaceRoot of ["apps", "packages"]) {
    const absoluteRoot = path.join(rootDir, workspaceRoot);
    let entries = [];
    try {
      entries = await fs.readdir(absoluteRoot, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const relativePath = path.join(workspaceRoot, entry.name, PACKAGE_JSON);
      if (await pathExists(path.join(rootDir, relativePath))) {
        packagePaths.push(relativePath);
      }
    }
  }
  return packagePaths;
}

function isForbiddenExternalToolName(packageName) {
  const normalized = packageName.toLowerCase();
  const tokens = normalized.split(/[^a-z0-9]+/).filter(Boolean);
  return tokens.includes("impeccable") || normalized.includes("taste-skill");
}

function isForbiddenExternalToolScript(scriptText) {
  return /\bnpx\s+impeccable\b/i.test(scriptText) || /\bimpeccable\b/i.test(scriptText) || /taste-skill/i.test(scriptText);
}

async function readTextIfExists(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function toPosix(value) {
  return value.replace(/\\/g, "/");
}
