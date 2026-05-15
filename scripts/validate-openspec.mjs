import fs from "node:fs/promises";
import path from "node:path";

const changeId = process.argv[2];

if (!changeId) {
  fail("usage_error", "用法：node scripts/validate-openspec.mjs <change-id>");
}

const rootDir = process.cwd();
const changeDir = path.join(rootDir, "openspec", "changes", changeId);
const specDir = path.join(changeDir, "specs");
const errors = [];

await requireFile(path.join(rootDir, "openspec", "config.yaml"), (content) => {
  requireIncludes(content, "schema: spec-driven", "openspec/config.yaml 必须声明 schema: spec-driven");
});

await requireFile(path.join(changeDir, "proposal.md"), (content) => {
  requireHeading(content, "#", "proposal.md 必须包含一级标题");
});

await requireFile(path.join(changeDir, "design.md"), (content) => {
  requireHeading(content, "#", "design.md 必须包含一级标题");
});

await requireFile(path.join(changeDir, "tasks.md"), (content) => {
  requireIncludes(content, "##", "tasks.md 必须包含二级章节");
  if (!/- \[[ xX]\]\s+/.test(content)) {
    errors.push("tasks.md 必须包含 OpenSpec 风格任务复选框");
  }
});

const specFiles = await listSpecFiles(specDir);
if (specFiles.length === 0) {
  errors.push(`${relative(specDir)} 必须至少包含一个 spec.md`);
}

for (const specFile of specFiles) {
  await requireFile(specFile, (content) => {
    requireIncludes(content, "## ADDED Requirements", `${relative(specFile)} 必须包含 ADDED Requirements`);
    requireIncludes(content, "### Requirement:", `${relative(specFile)} 必须包含至少一个 Requirement`);
    requireIncludes(content, "#### Scenario:", `${relative(specFile)} 必须包含至少一个 Scenario`);
  });
}

if (errors.length > 0) {
  fail("openspec_validation_failed", "OpenSpec 本地校验未通过。", errors);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      change_id: changeId,
      checked_files: [
        "openspec/config.yaml",
        relative(path.join(changeDir, "proposal.md")),
        relative(path.join(changeDir, "design.md")),
        relative(path.join(changeDir, "tasks.md")),
        ...specFiles.map(relative)
      ]
    },
    null,
    2
  )
);

async function requireFile(filePath, validate) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    if (!content.trim()) {
      errors.push(`${relative(filePath)} 不能为空`);
      return;
    }
    validate(content);
  } catch (error) {
    if (error.code === "ENOENT") {
      errors.push(`${relative(filePath)} 不存在`);
      return;
    }
    throw error;
  }
}

async function listSpecFiles(root) {
  try {
    const results = [];
    await walk(root, results);
    return results.sort();
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function walk(dir, results) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(entryPath, results);
    } else if (entry.isFile() && entry.name === "spec.md") {
      results.push(entryPath);
    }
  }
}

function requireHeading(content, marker, message) {
  const pattern = new RegExp(`^${escapeRegExp(marker)}\\s+\\S`, "m");
  if (!pattern.test(content)) {
    errors.push(message);
  }
}

function requireIncludes(content, value, message) {
  if (!content.includes(value)) {
    errors.push(message);
  }
}

function relative(filePath) {
  return path.relative(rootDir, filePath).split(path.sep).join("/");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fail(code, message, details = []) {
  console.error(JSON.stringify({ ok: false, code, message, details }, null, 2));
  process.exit(1);
}
