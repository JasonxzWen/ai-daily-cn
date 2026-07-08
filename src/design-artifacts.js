import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

const DESIGN_ROOT = "design";
const PROTOTYPE_ROOT = path.join(DESIGN_ROOT, "prototypes");
const REQUIRED_DOCS = [
  path.join(DESIGN_ROOT, "adc-visual-system.md"),
  path.join(DESIGN_ROOT, "design-toolchain.md"),
  path.join(PROTOTYPE_ROOT, "README.md"),
  path.join(PROTOTYPE_ROOT, "_template.design.json"),
  path.join(PROTOTYPE_ROOT, "_template.prompt.md"),
  path.join(PROTOTYPE_ROOT, "_template.decision.md")
];
const ALLOWED_TOOLS = new Set(["stitch", "v0", "image-generation", "figma", "manual"]);
const ALLOWED_STATUSES = new Set(["draft", "candidate", "accepted", "rejected"]);
const ALLOWED_POLICIES = new Set(["forbidden", "reference_only", "translated"]);
const ALLOWED_SCREENSHOT_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

export async function validateDesignArtifacts(options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const issues = [];
  const warnings = [];
  const requiredDocs = [];

  for (const relativePath of REQUIRED_DOCS) {
    const exists = await pathExists(path.join(rootDir, relativePath));
    requiredDocs.push({ path: relativePath, exists });
    if (!exists) {
      issues.push({
        code: "design_required_file_missing",
        path: relativePath,
        message: `${relativePath} is required by the design toolchain contract.`
      });
    }
  }

  await validateToolchainDoc(rootDir, issues);

  const artifactFiles = await findDesignArtifactFiles(path.join(rootDir, PROTOTYPE_ROOT));
  if (artifactFiles.length === 0) {
    issues.push({
      code: "design_artifact_template_missing",
      path: PROTOTYPE_ROOT,
      message: "At least the design artifact template must be present."
    });
  }

  const artifacts = [];
  for (const filePath of artifactFiles) {
    const artifact = await validateArtifactRecord({ rootDir, filePath, issues, warnings });
    if (artifact) {
      artifacts.push(artifact);
    }
  }

  return {
    ok: issues.length === 0,
    required_docs: requiredDocs,
    artifacts_checked: artifacts.length,
    artifacts,
    warnings,
    issues
  };
}

async function validateToolchainDoc(rootDir, issues) {
  const docPath = path.join(rootDir, DESIGN_ROOT, "design-toolchain.md");
  let doc = "";
  try {
    doc = await fs.readFile(docPath, "utf8");
  } catch {
    return;
  }

  const requiredPatterns = [
    [/Stitch/, "Stitch must be named as a supported prototype source."],
    [/v0/, "v0 must be named as a supported prototype source."],
    [/generated code/i, "The generated-code boundary must be explicit."],
    [/A stryx|Astryx/, "The translation target must mention Astryx."],
    [/GitHub Pages/, "The static publishing boundary must mention GitHub Pages."]
  ];

  for (const [pattern, message] of requiredPatterns) {
    if (!pattern.test(doc)) {
      issues.push({
        code: "design_toolchain_doc_incomplete",
        path: path.relative(rootDir, docPath),
        message
      });
    }
  }
}

async function findDesignArtifactFiles(dirPath) {
  if (!(await pathExists(dirPath))) return [];
  const files = [];
  await visit(dirPath);
  return files.sort();

  async function visit(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await visit(entryPath);
      } else if (entry.isFile() && entry.name.endsWith(".design.json")) {
        files.push(entryPath);
      }
    }
  }
}

async function validateArtifactRecord({ rootDir, filePath, issues, warnings }) {
  const relativePath = toPosix(path.relative(rootDir, filePath));
  let record;
  try {
    record = JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    issues.push({
      code: "design_artifact_json_invalid",
      path: relativePath,
      message: error instanceof Error ? error.message : String(error)
    });
    return null;
  }

  const artifact = {
    path: relativePath,
    id: stringValue(record.id),
    tool: stringValue(record.tool),
    status: stringValue(record.status)
  };

  requireString(record.schema_version, "schema_version", relativePath, issues, "1");
  requireString(record.id, "id", relativePath, issues);
  requireString(record.title, "title", relativePath, issues);
  requireString(record.tool, "tool", relativePath, issues);
  requireString(record.status, "status", relativePath, issues);

  if (record.tool && !ALLOWED_TOOLS.has(record.tool)) {
    issues.push({
      code: "design_artifact_tool_invalid",
      path: relativePath,
      message: `Unsupported design tool: ${record.tool}.`
    });
  }
  if (record.status && !ALLOWED_STATUSES.has(record.status)) {
    issues.push({
      code: "design_artifact_status_invalid",
      path: relativePath,
      message: `Unsupported design artifact status: ${record.status}.`
    });
  }

  validateRelativeReference({ rootDir, recordPath: relativePath, field: "prompt.path", value: record.prompt?.path, issues });
  validateRelativeReference({
    rootDir,
    recordPath: relativePath,
    field: "evidence.decision_record",
    value: record.evidence?.decision_record,
    issues
  });
  await validateDecisionRecordSections({
    rootDir,
    recordPath: relativePath,
    value: record.evidence?.decision_record,
    issues
  });

  const screenshots = Array.isArray(record.evidence?.screenshots) ? record.evidence.screenshots : [];
  if (record.status === "accepted" && screenshots.length === 0) {
    issues.push({
      code: "design_artifact_screenshot_required",
      path: relativePath,
      message: "Accepted design artifacts must include at least one compressed screenshot."
    });
  }
  for (const screenshot of screenshots) {
    validateScreenshotReference({ rootDir, recordPath: relativePath, screenshot, issues });
  }

  const policy = record.production_boundary?.generated_code_policy;
  if (!policy) {
    issues.push({
      code: "design_artifact_code_policy_missing",
      path: relativePath,
      message: "production_boundary.generated_code_policy is required."
    });
  } else if (!ALLOWED_POLICIES.has(policy)) {
    issues.push({
      code: "design_artifact_code_policy_invalid",
      path: relativePath,
      message: `Unsupported generated-code policy: ${policy}.`
    });
  }

  const forbiddenOutput = record.production_boundary?.forbidden_output;
  if (!Array.isArray(forbiddenOutput) || forbiddenOutput.length === 0) {
    warnings.push({
      code: "design_artifact_forbidden_output_empty",
      path: relativePath,
      message: "List the outputs that must not be committed directly."
    });
  }

  return artifact;
}

function requireString(value, field, recordPath, issues, expected) {
  if (typeof value !== "string" || value.trim() === "") {
    issues.push({
      code: "design_artifact_required_field_missing",
      path: recordPath,
      message: `${field} must be a non-empty string.`
    });
    return;
  }
  if (expected && value !== expected) {
    issues.push({
      code: "design_artifact_schema_version_invalid",
      path: recordPath,
      message: `${field} must be ${expected}.`
    });
  }
}

function validateRelativeReference({ rootDir, recordPath, field, value, issues }) {
  if (typeof value !== "string" || value.trim() === "") {
    issues.push({
      code: "design_artifact_reference_missing",
      path: recordPath,
      message: `${field} must reference a repository-local file.`
    });
    return;
  }
  const normalized = normalizeReference(value);
  if (!normalized || path.isAbsolute(normalized) || normalized.startsWith("..")) {
    issues.push({
      code: "design_artifact_reference_outside_repo",
      path: recordPath,
      message: `${field} must stay inside the repository: ${value}.`
    });
    return;
  }
  const absolutePath = path.resolve(rootDir, normalized);
  if (!isInsidePath(rootDir, absolutePath)) {
    issues.push({
      code: "design_artifact_reference_outside_repo",
      path: recordPath,
      message: `${field} must stay inside the repository: ${value}.`
    });
    return;
  }
  const repositoryRelativePath = toPosix(path.relative(rootDir, absolutePath));
  if (!repositoryRelativePath.startsWith(`${DESIGN_ROOT}/`)) {
    issues.push({
      code: "design_artifact_reference_outside_design",
      path: recordPath,
      message: `${field} must reference a file under ${DESIGN_ROOT}/: ${value}.`
    });
    return;
  }
  if (!pathExistsSync(absolutePath)) {
    issues.push({
      code: "design_artifact_reference_missing_file",
      path: recordPath,
      message: `${field} references a missing file: ${value}.`
    });
  }
}

function validateScreenshotReference({ rootDir, recordPath, screenshot, issues }) {
  if (typeof screenshot !== "string" || screenshot.trim() === "") {
    issues.push({
      code: "design_artifact_screenshot_invalid",
      path: recordPath,
      message: "Screenshot references must be non-empty strings."
    });
    return;
  }
  const normalized = normalizeReference(screenshot);
  const extension = path.extname(normalized).toLowerCase();
  if (!ALLOWED_SCREENSHOT_EXTENSIONS.has(extension)) {
    issues.push({
      code: "design_artifact_screenshot_extension_invalid",
      path: recordPath,
      message: `Screenshot must be png, jpg, jpeg, or webp: ${screenshot}.`
    });
  }
  validateRelativeReference({ rootDir, recordPath, field: "evidence.screenshots", value: screenshot, issues });
}

async function validateDecisionRecordSections({ rootDir, recordPath, value, issues }) {
  if (typeof value !== "string" || value.trim() === "") return;
  const normalized = normalizeReference(value);
  const absolutePath = path.resolve(rootDir, normalized);
  if (!isInsidePath(rootDir, absolutePath) || !pathExistsSync(absolutePath)) return;
  const repositoryRelativePath = toPosix(path.relative(rootDir, absolutePath));
  if (!repositoryRelativePath.startsWith(`${DESIGN_ROOT}/`)) return;

  const content = await fs.readFile(absolutePath, "utf8");
  const requiredHeadings = ["## Accepted", "## Rejected", "## Translation Notes", "## Risks"];
  for (const heading of requiredHeadings) {
    if (!content.includes(heading)) {
      issues.push({
        code: "design_artifact_decision_section_missing",
        path: recordPath,
        message: `Decision record ${value} must include ${heading}.`
      });
    }
  }
}

function normalizeReference(value) {
  return value.replace(/\\/g, "/").replace(/^\.\//, "");
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function pathExistsSync(filePath) {
  try {
    return Boolean(fsSync.statSync(filePath));
  } catch {
    return false;
  }
}

function isInsidePath(parentPath, childPath) {
  const relativePath = path.relative(parentPath, childPath);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function stringValue(value) {
  return typeof value === "string" ? value : "";
}

function toPosix(value) {
  return value.replace(/\\/g, "/");
}
