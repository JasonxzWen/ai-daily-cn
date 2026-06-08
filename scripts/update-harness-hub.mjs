import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
const DEFAULT_SKILLS_ROOT = ".codex/skills";
const DEFAULT_PRESERVED_TOP_LEVEL_DIRS = ["artifacts"];

function toPortablePath(value) {
  return value.split(path.sep).join("/");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readDirEntries(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }
  return fs.readdirSync(dirPath, { withFileTypes: true });
}

function isSkillDirectory(root, entry) {
  return entry.isDirectory() && fs.existsSync(path.join(root, entry.name, "SKILL.md"));
}

function readSkillNames(skillsRoot) {
  return readDirEntries(skillsRoot)
    .filter((entry) => isSkillDirectory(skillsRoot, entry))
    .map((entry) => entry.name)
    .sort();
}

function ensureParent(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function copyFile(sourcePath, targetPath) {
  ensureParent(targetPath);
  fs.copyFileSync(sourcePath, targetPath);
}

function removeFileIfExists(filePath) {
  if (fs.existsSync(filePath)) {
    fs.rmSync(filePath, { force: true });
  }
}

function pruneEmptyDirectories(rootPath) {
  if (!fs.existsSync(rootPath) || !fs.statSync(rootPath).isDirectory()) {
    return false;
  }

  for (const entry of fs.readdirSync(rootPath, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      pruneEmptyDirectories(path.join(rootPath, entry.name));
    }
  }

  if (fs.readdirSync(rootPath).length === 0) {
    fs.rmdirSync(rootPath);
    return true;
  }

  return false;
}

function removeManagedEntries(targetDir, preservedTopLevelDirs) {
  if (!fs.existsSync(targetDir)) {
    return;
  }

  for (const entry of fs.readdirSync(targetDir, { withFileTypes: true })) {
    if (preservedTopLevelDirs.has(entry.name)) {
      continue;
    }
    fs.rmSync(path.join(targetDir, entry.name), { recursive: true, force: true });
  }
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function fileEquals(leftPath, rightPath) {
  if (!fs.existsSync(leftPath) || !fs.existsSync(rightPath)) {
    return false;
  }

  const left = fs.readFileSync(leftPath);
  const right = fs.readFileSync(rightPath);
  return left.equals(right);
}

function walkFiles(rootPath, options = {}) {
  const result = [];
  const skipTopLevelDirs = options.skipTopLevelDirs ?? new Set();
  const skipPathPrefixes = options.skipPathPrefixes ?? [];

  function shouldSkip(relativePath) {
    const portable = toPortablePath(relativePath);
    if (skipPathPrefixes.includes(portable)) {
      return true;
    }
    return skipPathPrefixes.some((prefix) => portable.startsWith(`${prefix}/`));
  }

  function visit(currentPath, relativePath = "") {
    if (!fs.existsSync(currentPath)) {
      return;
    }

    for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
      const nextRelative = relativePath ? path.join(relativePath, entry.name) : entry.name;
      if (!relativePath && entry.isDirectory() && skipTopLevelDirs.has(entry.name)) {
        continue;
      }
      if (shouldSkip(nextRelative)) {
        continue;
      }

      const nextPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        visit(nextPath, nextRelative);
      } else if (entry.isFile()) {
        result.push(toPortablePath(nextRelative));
      }
    }
  }

  visit(rootPath);
  return result.sort();
}

function normalizeStatusOutput(raw) {
  if (!raw) {
    return "## unknown";
  }
  return raw.trim().split(/\r?\n/, 1)[0] ?? "## unknown";
}

function readGitMetadata(sourceRoot) {
  try {
    const commit = execFileSync("git", ["-C", sourceRoot, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    const branch = execFileSync("git", ["-C", sourceRoot, "rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8" }).trim();
    const status = normalizeStatusOutput(execFileSync("git", ["-C", sourceRoot, "status", "-sb"], { encoding: "utf8" }));
    return { commit, branch, status };
  } catch (error) {
    throw new Error(`Failed to read Harness Hub git metadata from ${sourceRoot}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function readManifest(manifestPath) {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Missing Harness Hub aggregation manifest: ${manifestPath}`);
  }
  return readJson(manifestPath);
}

function resolveSkillCategories(manifest, sourceSkillNames, targetSkillNames, targetSkillsRoot) {
  const sourceSkillSet = new Set(sourceSkillNames);
  const overlappingSkills = new Set(
    (manifest.overlappingSkills ?? []).filter((skill) => sourceSkillSet.has(skill) || fs.existsSync(path.join(targetSkillsRoot, skill)))
  );

  for (const skill of targetSkillNames) {
    if (fs.existsSync(path.join(targetSkillsRoot, skill, "_harness-hub"))) {
      overlappingSkills.add(skill);
    }
  }

  const localOnlySkills = new Set(manifest.localOnlySkills ?? []);
  for (const skill of targetSkillNames) {
    if (!sourceSkillSet.has(skill) && !overlappingSkills.has(skill)) {
      localOnlySkills.add(skill);
    }
  }

  const importedSkills = new Set((manifest.importedSkills ?? []).filter((skill) => sourceSkillSet.has(skill)));
  for (const skill of sourceSkillNames) {
    if (!overlappingSkills.has(skill) && !localOnlySkills.has(skill)) {
      importedSkills.add(skill);
    }
  }

  return {
    importedSkills: [...importedSkills].sort(),
    overlappingSkills: [...overlappingSkills].sort(),
    localOnlySkills: [...localOnlySkills].sort(),
  };
}

function syncImportedSkill(skillName, options) {
  const { sourceSkillsRoot, targetSkillsRoot, preservedTopLevelDirs, copiedFiles } = options;
  const sourceDir = path.join(sourceSkillsRoot, skillName);
  const targetDir = path.join(targetSkillsRoot, skillName);
  const sourceFiles = walkFiles(sourceDir, { skipTopLevelDirs: preservedTopLevelDirs });

  removeManagedEntries(targetDir, preservedTopLevelDirs);

  for (const relativePath of sourceFiles) {
    copyFile(path.join(sourceDir, relativePath), path.join(targetDir, relativePath));
    copiedFiles.push({
      skill: skillName,
      path: relativePath,
      strategy: "imported-skill"
    });
  }

  pruneEmptyDirectories(targetDir);
}

function cleanupStaleHarnessHubCopies(harnessHubDir, sourceFiles) {
  if (!fs.existsSync(harnessHubDir)) {
    return;
  }

  const allowed = new Set(sourceFiles);
  for (const relativePath of walkFiles(harnessHubDir)) {
    if (!allowed.has(relativePath)) {
      removeFileIfExists(path.join(harnessHubDir, relativePath));
    }
  }
  pruneEmptyDirectories(harnessHubDir);
}

function syncOverlappingSkill(skillName, options) {
  const {
    root,
    sourceSkillsRoot,
    targetSkillsRoot,
    preservedTopLevelDirs,
    copiedFiles,
    preservedConflicts,
    identicalFiles,
    localOnlyFilesKept
  } = options;

  const sourceDir = path.join(sourceSkillsRoot, skillName);
  const targetDir = path.join(targetSkillsRoot, skillName);
  const harnessHubDir = path.join(targetDir, "_harness-hub");
  const sourceFiles = walkFiles(sourceDir, { skipTopLevelDirs: preservedTopLevelDirs });
  const sourceFileSet = new Set(sourceFiles);

  cleanupStaleHarnessHubCopies(harnessHubDir, sourceFiles);

  for (const relativePath of sourceFiles) {
    const sourcePath = path.join(sourceDir, relativePath);
    const activePath = path.join(targetDir, relativePath);
    const hubCopyPath = path.join(harnessHubDir, relativePath);

    if (!fs.existsSync(activePath)) {
      copyFile(sourcePath, activePath);
      removeFileIfExists(hubCopyPath);
      copiedFiles.push({
        skill: skillName,
        path: relativePath,
        strategy: "hub-only-file"
      });
      continue;
    }

    if (fileEquals(sourcePath, activePath)) {
      removeFileIfExists(hubCopyPath);
      identicalFiles.push({
        skill: skillName,
        path: relativePath
      });
      continue;
    }

    copyFile(sourcePath, hubCopyPath);
    preservedConflicts.push({
      skill: skillName,
      path: relativePath,
      active: `${toPortablePath(path.relative(root, activePath))}`,
      harnessHubCopy: `${toPortablePath(path.relative(root, hubCopyPath))}`,
      sourceSha256: sha256(sourcePath),
      activeSha256: sha256(activePath),
      strategy: "active-local-kept-hub-copy-preserved"
    });
  }

  const activeLocalOnlyFiles = walkFiles(targetDir, {
    skipTopLevelDirs: preservedTopLevelDirs,
    skipPathPrefixes: ["_harness-hub"]
  }).filter((relativePath) => !sourceFileSet.has(relativePath));

  for (const relativePath of activeLocalOnlyFiles) {
    localOnlyFilesKept.push({
      skill: skillName,
      path: relativePath,
      strategy: "local-only-kept"
    });
  }
}

function removeStaleImportedSkills(sourceSkillNames, targetSkillsRoot, importedSkills, localOnlySkills, overlappingSkills) {
  const sourceSkillSet = new Set(sourceSkillNames);
  const importedSkillSet = new Set(importedSkills);
  const localOnlySkillSet = new Set(localOnlySkills);
  const overlappingSkillSet = new Set(overlappingSkills);
  const existingTargetSkills = readSkillNames(targetSkillsRoot);

  for (const skill of existingTargetSkills) {
    if (!importedSkillSet.has(skill)) {
      continue;
    }
    if (sourceSkillSet.has(skill) || localOnlySkillSet.has(skill) || overlappingSkillSet.has(skill)) {
      continue;
    }
    fs.rmSync(path.join(targetSkillsRoot, skill), { recursive: true, force: true });
  }
}

export function syncHarnessHub(options = {}) {
  const root = path.resolve(options.root ?? REPO_ROOT);
  const manifestPath = path.resolve(options.manifestPath ?? path.join(root, ".codex", "harness-hub-aggregation.json"));
  const manifest = readManifest(manifestPath);
  const sourceRoot = path.resolve(options.sourceRoot ?? manifest.source?.path ?? "");
  if (!sourceRoot) {
    throw new Error("Harness Hub source root is required.");
  }
  if (!fs.existsSync(path.join(sourceRoot, "skills"))) {
    throw new Error(`Harness Hub source root does not contain skills/: ${sourceRoot}`);
  }

  const sourceSkillsRoot = path.join(sourceRoot, "skills");
  const targetSkillsRoot = path.join(root, DEFAULT_SKILLS_ROOT);
  const preservedTopLevelDirs = new Set(manifest.policy?.skippedTopLevelSourceDirs ?? DEFAULT_PRESERVED_TOP_LEVEL_DIRS);
  const sourceSkillNames = readSkillNames(sourceSkillsRoot);
  const targetSkillNames = readSkillNames(targetSkillsRoot);
  const categories = resolveSkillCategories(manifest, sourceSkillNames, targetSkillNames, targetSkillsRoot);
  const copiedFiles = [];
  const preservedConflicts = [];
  const identicalFiles = [];
  const localOnlyFilesKept = [];

  fs.mkdirSync(targetSkillsRoot, { recursive: true });
  removeStaleImportedSkills(sourceSkillNames, targetSkillsRoot, categories.importedSkills, categories.localOnlySkills, categories.overlappingSkills);

  for (const skillName of categories.importedSkills) {
    syncImportedSkill(skillName, {
      sourceSkillsRoot,
      targetSkillsRoot,
      preservedTopLevelDirs,
      copiedFiles
    });
  }

  for (const skillName of categories.overlappingSkills) {
    if (!fs.existsSync(path.join(sourceSkillsRoot, skillName))) {
      continue;
    }
    syncOverlappingSkill(skillName, {
      root,
      sourceSkillsRoot,
      targetSkillsRoot,
      preservedTopLevelDirs,
      copiedFiles,
      preservedConflicts,
      identicalFiles,
      localOnlyFilesKept
    });
  }

  const sourceMetadata = options.sourceMetadata ?? readGitMetadata(sourceRoot);
  const nextManifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: {
      path: toPortablePath(sourceRoot),
      branch: sourceMetadata.branch,
      commit: sourceMetadata.commit,
      status: sourceMetadata.status
    },
    target: {
      path: toPortablePath(root),
      skillsRoot: DEFAULT_SKILLS_ROOT
    },
    policy: {
      importedSkills: manifest.policy?.importedSkills ?? "Hub-only skills are copied into .codex/skills.",
      overlappingSkills:
        manifest.policy?.overlappingSkills ??
        "Existing local skill files remain active. Hub-only files are added. Same-path Hub conflicts are preserved under _harness-hub/ inside the same skill.",
      localOnlySkills: manifest.policy?.localOnlySkills ?? "Local-only skills are left untouched.",
      skippedTopLevelSourceDirs: [...preservedTopLevelDirs],
      baseline:
        manifest.policy?.baseline ??
        "Original local skills are computed from tracked .codex/skills/*/SKILL.md files before this aggregation."
    },
    counts: {
      hubSkills: sourceSkillNames.length,
      localSkillsBefore: categories.overlappingSkills.length + categories.localOnlySkills.length,
      importedSkills: categories.importedSkills.length,
      overlappingSkills: categories.overlappingSkills.length,
      localOnlySkills: categories.localOnlySkills.length,
      copiedFiles: copiedFiles.length,
      preservedConflicts: preservedConflicts.length,
      identicalFiles: identicalFiles.length,
      localOnlyFilesKept: localOnlyFilesKept.length
    },
    importedSkills: categories.importedSkills,
    overlappingSkills: categories.overlappingSkills,
    localOnlySkills: categories.localOnlySkills,
    copiedFiles,
    preservedConflicts,
    identicalFiles,
    localOnlyFilesKept
  };

  writeJson(manifestPath, nextManifest);

  return {
    root,
    sourceRoot,
    manifestPath,
    manifest: nextManifest
  };
}

function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--source-root") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--source-root requires a value");
      }
      options.sourceRoot = value;
      index += 1;
      continue;
    }
    if (arg === "--manifest") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--manifest requires a value");
      }
      options.manifestPath = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = syncHarnessHub(parseArgs(process.argv.slice(2)));
    console.log(
      JSON.stringify(
        {
          ok: true,
          source: result.manifest.source,
          target: result.manifest.target,
          counts: result.manifest.counts
        },
        null,
        2
      )
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
