import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

const DESIGN_ROOT = "design";
const ILLUSTRATION_ROOT = path.join(DESIGN_ROOT, "illustrations");
const SOURCE_ASSET_ROOT = path.join("apps", "web", "public", "assets");
const GENERATED_ASSET_ROOT = path.join("docs", "assets");
const REQUIRED_DOCS = [
  path.join(DESIGN_ROOT, "illustration-workflow.md"),
  path.join(ILLUSTRATION_ROOT, "README.md")
];
const ALLOWED_STATUSES = new Set(["draft", "active", "retired"]);
const REQUIRED_DECISION_HEADINGS = ["## Accepted", "## Rejected", "## Usage", "## Rights"];

export async function validateIllustrationAssets(options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const issues = [];
  const warnings = [];
  const requiredDocs = [];

  for (const relativePath of REQUIRED_DOCS) {
    const exists = await pathExists(path.join(rootDir, relativePath));
    requiredDocs.push({ path: relativePath, exists });
    if (!exists) {
      issues.push({
        code: "illustration_required_file_missing",
        path: relativePath,
        message: `${relativePath} is required by the illustration workflow contract.`
      });
    }
  }

  await validateWorkflowDoc(rootDir, issues);

  const manifestFiles = await findManifestFiles(path.join(rootDir, ILLUSTRATION_ROOT));
  if (manifestFiles.length === 0) {
    issues.push({
      code: "illustration_manifest_missing",
      path: ILLUSTRATION_ROOT,
      message: "At least one illustration asset manifest is required."
    });
  }

  const assets = [];
  for (const filePath of manifestFiles) {
    const asset = await validateManifest({ rootDir, filePath, issues, warnings });
    if (asset) assets.push(asset);
  }

  return {
    ok: issues.length === 0,
    required_docs: requiredDocs,
    assets_checked: assets.length,
    assets,
    warnings,
    issues
  };
}

async function validateWorkflowDoc(rootDir, issues) {
  const docPath = path.join(rootDir, DESIGN_ROOT, "illustration-workflow.md");
  let doc = "";
  try {
    doc = await fs.readFile(docPath, "utf8");
  } catch {
    return;
  }
  const requiredPatterns = [
    [/original/i, "The workflow must require original ADC illustration assets."],
    [/black-and-white|black and white/i, "The workflow must define the black-and-white line-art style."],
    [/third-party/i, "The third-party IP boundary must be explicit."],
    [/Vite/, "The Vite public asset copy boundary must be explicit."]
  ];
  for (const [pattern, message] of requiredPatterns) {
    if (!pattern.test(doc)) {
      issues.push({
        code: "illustration_workflow_doc_incomplete",
        path: path.relative(rootDir, docPath),
        message
      });
    }
  }
}

async function findManifestFiles(dirPath) {
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
      } else if (entry.isFile() && entry.name.endsWith(".asset.json")) {
        files.push(entryPath);
      }
    }
  }
}

async function validateManifest({ rootDir, filePath, issues, warnings }) {
  const relativePath = toPosix(path.relative(rootDir, filePath));
  let manifest;
  try {
    manifest = JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    issues.push({
      code: "illustration_manifest_json_invalid",
      path: relativePath,
      message: error instanceof Error ? error.message : String(error)
    });
    return null;
  }

  const asset = {
    path: relativePath,
    id: stringValue(manifest.id),
    status: stringValue(manifest.status),
    source_asset: stringValue(manifest.source_asset),
    public_asset: stringValue(manifest.public_asset)
  };

  requireString(manifest.schema_version, "schema_version", relativePath, issues, "1");
  requireString(manifest.id, "id", relativePath, issues);
  requireString(manifest.title, "title", relativePath, issues);
  requireString(manifest.status, "status", relativePath, issues);
  requireString(manifest.style_family, "style_family", relativePath, issues, "adc-line-art");

  if (manifest.status && !ALLOWED_STATUSES.has(manifest.status)) {
    issues.push({
      code: "illustration_status_invalid",
      path: relativePath,
      message: `Unsupported illustration status: ${manifest.status}.`
    });
  }

  const sourceAssetPath = validatePathReference({
    rootDir,
    recordPath: relativePath,
    field: "source_asset",
    value: manifest.source_asset,
    requiredPrefix: `${toPosix(SOURCE_ASSET_ROOT)}/`,
    requiredExtension: ".svg",
    issues
  });
  const publicAssetPath = validatePathReference({
    rootDir,
    recordPath: relativePath,
    field: "public_asset",
    value: manifest.public_asset,
    requiredPrefix: `${toPosix(GENERATED_ASSET_ROOT)}/`,
    requiredExtension: ".svg",
    issues
  });
  const promptPath = validatePathReference({
    rootDir,
    recordPath: relativePath,
    field: "prompt.path",
    value: manifest.prompt?.path,
    requiredPrefix: `${toPosix(ILLUSTRATION_ROOT)}/`,
    issues
  });
  const decisionPath = validatePathReference({
    rootDir,
    recordPath: relativePath,
    field: "decision_record",
    value: manifest.decision_record,
    requiredPrefix: `${toPosix(ILLUSTRATION_ROOT)}/`,
    issues
  });

  await validatePromptRecord({ recordPath: relativePath, promptPath, issues });
  await validateDecisionRecord({ recordPath: relativePath, decisionPath, issues });
  await validateSvgAsset({ recordPath: relativePath, sourceAssetPath, issues, warnings });
  await validateGeneratedCopy({ recordPath: relativePath, sourceAssetPath, publicAssetPath, issues });
  validateRights({ recordPath: relativePath, manifest, issues });

  return asset;
}

function requireString(value, field, recordPath, issues, expected) {
  if (typeof value !== "string" || value.trim() === "") {
    issues.push({
      code: "illustration_required_field_missing",
      path: recordPath,
      message: `${field} must be a non-empty string.`
    });
    return;
  }
  if (expected && value !== expected) {
    issues.push({
      code: "illustration_field_invalid",
      path: recordPath,
      message: `${field} must be ${expected}.`
    });
  }
}

function validatePathReference({ rootDir, recordPath, field, value, requiredPrefix, requiredExtension, issues }) {
  if (typeof value !== "string" || value.trim() === "") {
    issues.push({
      code: "illustration_reference_missing",
      path: recordPath,
      message: `${field} must reference a repository-local file.`
    });
    return null;
  }
  const normalized = normalizeReference(value);
  const absolutePath = path.resolve(rootDir, normalized);
  if (path.isAbsolute(normalized) || !isInsidePath(rootDir, absolutePath)) {
    issues.push({
      code: "illustration_reference_outside_repo",
      path: recordPath,
      message: `${field} must stay inside the repository: ${value}.`
    });
    return null;
  }
  const relativePath = toPosix(path.relative(rootDir, absolutePath));
  if (!relativePath.startsWith(requiredPrefix)) {
    issues.push({
      code: "illustration_reference_wrong_scope",
      path: recordPath,
      message: `${field} must reference ${requiredPrefix}: ${value}.`
    });
    return null;
  }
  if (requiredExtension && path.extname(relativePath).toLowerCase() !== requiredExtension) {
    issues.push({
      code: "illustration_reference_extension_invalid",
      path: recordPath,
      message: `${field} must reference a ${requiredExtension} file: ${value}.`
    });
    return null;
  }
  if (!pathExistsSync(absolutePath)) {
    issues.push({
      code: "illustration_reference_missing_file",
      path: recordPath,
      message: `${field} references a missing file: ${value}.`
    });
    return null;
  }
  return absolutePath;
}

async function validatePromptRecord({ recordPath, promptPath, issues }) {
  if (!promptPath) return;
  const content = await fs.readFile(promptPath, "utf8");
  const requiredPatterns = [
    [/black-and-white|black and white/i, "Prompt must include the black-and-white style constraint."],
    [/rough|line art|ink/i, "Prompt must include the rough-line or ink style constraint."],
    [/third-party/i, "Prompt must forbid third-party illustration copying."],
    [/desktop-first|data product/i, "Prompt must preserve the product surface boundary."]
  ];
  for (const [pattern, message] of requiredPatterns) {
    if (!pattern.test(content)) {
      issues.push({
        code: "illustration_prompt_contract_missing",
        path: recordPath,
        message
      });
    }
  }
}

async function validateDecisionRecord({ recordPath, decisionPath, issues }) {
  if (!decisionPath) return;
  const content = await fs.readFile(decisionPath, "utf8");
  for (const heading of REQUIRED_DECISION_HEADINGS) {
    if (!content.includes(heading)) {
      issues.push({
        code: "illustration_decision_section_missing",
        path: recordPath,
        message: `Decision record must include ${heading}.`
      });
    }
  }
}

async function validateSvgAsset({ recordPath, sourceAssetPath, issues, warnings }) {
  if (!sourceAssetPath) return;
  const content = await fs.readFile(sourceAssetPath, "utf8");
  const size = Buffer.byteLength(content, "utf8");
  if (size > 50000) {
    warnings.push({
      code: "illustration_asset_large",
      path: recordPath,
      message: `SVG asset is larger than expected: ${size} bytes.`
    });
  }
  const requiredMarkers = ["<svg", "<title", "<desc", "ADC."];
  for (const marker of requiredMarkers) {
    if (!content.includes(marker)) {
      issues.push({
        code: "illustration_svg_marker_missing",
        path: recordPath,
        message: `SVG source must include ${marker}.`
      });
    }
  }
  if (
    /<image\b/i.test(content) ||
    /base64,/i.test(content) ||
    /\b(?:href|src)\s*=\s*["']https?:\/\//i.test(content) ||
    /url\(\s*["']?https?:\/\//i.test(content)
  ) {
    issues.push({
      code: "illustration_svg_embedded_external_asset",
      path: recordPath,
      message: "SVG source must not embed external, remote, or base64 image assets."
    });
  }
}

async function validateGeneratedCopy({ recordPath, sourceAssetPath, publicAssetPath, issues }) {
  if (!sourceAssetPath || !publicAssetPath) return;
  const [source, generated] = await Promise.all([
    fs.readFile(sourceAssetPath, "utf8"),
    fs.readFile(publicAssetPath, "utf8")
  ]);
  if (source !== generated) {
    issues.push({
      code: "illustration_generated_asset_drift",
      path: recordPath,
      message: "Generated public asset must match the Vite public source asset."
    });
  }
}

function validateRights({ recordPath, manifest, issues }) {
  if (manifest.rights?.original !== true) {
    issues.push({
      code: "illustration_rights_original_required",
      path: recordPath,
      message: "rights.original must be true for ADC illustration assets."
    });
  }
  if (manifest.rights?.copied_from_third_party !== false) {
    issues.push({
      code: "illustration_third_party_copy_forbidden",
      path: recordPath,
      message: "rights.copied_from_third_party must be false."
    });
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
