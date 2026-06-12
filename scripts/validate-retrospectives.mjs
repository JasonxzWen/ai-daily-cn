#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import Ajv from "ajv/dist/2020.js";

const rootDir = process.cwd();
const schemaPath = "schemas/retrospective.schema.json";
const indexPath = "retrospectives/index.json";
const recordsRoot = "retrospectives";

const failures = [];
const checkedFiles = [];

try {
  await validateRetrospectives();
} catch (error) {
  failures.push({
    code: "validator_internal_error",
    path: "/",
    message: error instanceof Error ? error.message : String(error)
  });
}

const result = {
  ok: failures.length === 0,
  records_checked: checkedFiles.filter((file) => file !== indexPath).length,
  index_path: indexPath,
  checked_files: checkedFiles,
  failures
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

if (!result.ok) {
  process.exitCode = 1;
}

async function validateRetrospectives() {
  const schema = await readJson(schemaPath, "schema_invalid");
  if (!schema) {
    return;
  }

  const validators = compileValidators(schema);
  if (!validators) {
    return;
  }

  const index = await readJson(indexPath, "index_invalid");
  if (index) {
    checkedFiles.push(indexPath);
    validateWithSchema(validators.index, index, indexPath);
    scanForSensitiveData(index, indexPath);
  }

  const recordPaths = await listRecordFiles();
  const records = [];
  for (const recordPath of recordPaths) {
    const record = await readJson(recordPath, "record_invalid");
    if (!record) {
      continue;
    }
    checkedFiles.push(recordPath);
    validateWithSchema(validators.record, record, recordPath);
    scanForSensitiveData(record, recordPath);
    validateRecordConsistency(record, recordPath);
    validateSuggestionEvidence(record, recordPath);
    records.push({ path: recordPath, record });
  }

  if (index) {
    validateIndexConsistency(index, records);
  }
}

function compileValidators(schema) {
  try {
    const ajv = new Ajv({
      allErrors: true,
      strict: true
    });
    const schemaId = schema.$id || "retrospective.schema.json";
    ajv.addSchema(schema, schemaId);
    return {
      record: ajv.compile({ $ref: `${schemaId}#/$defs/record` }),
      index: ajv.compile({ $ref: `${schemaId}#/$defs/index` })
    };
  } catch (error) {
    failures.push({
      code: "schema_compile_failed",
      path: schemaPath,
      message: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

async function readJson(relativePath, code) {
  let content;
  try {
    content = await fs.readFile(resolveRepoPath(relativePath), "utf8");
  } catch (error) {
    failures.push({
      code,
      path: relativePath,
      message: `missing or unreadable JSON file: ${error.code || error.message}`
    });
    return null;
  }

  try {
    return JSON.parse(content);
  } catch (error) {
    failures.push({
      code,
      path: relativePath,
      message: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

async function listRecordFiles() {
  const root = resolveRepoPath(recordsRoot);
  try {
    await fs.stat(root);
  } catch {
    failures.push({
      code: "records_root_missing",
      path: recordsRoot,
      message: "retrospectives directory is required"
    });
    return [];
  }

  const files = [];
  await collectJsonFiles(root, files);
  return files
    .map((file) => normalizePath(path.relative(rootDir, file)))
    .filter((file) => file !== indexPath)
    .sort();
}

async function collectJsonFiles(dir, files) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectJsonFiles(absolutePath, files);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(absolutePath);
    }
  }
}

function validateWithSchema(validate, value, filePath) {
  if (validate(value)) {
    return;
  }
  for (const error of validate.errors || []) {
    failures.push({
      code: "schema_validation_failed",
      path: filePath,
      json_path: error.instancePath || "/",
      message: error.message || "schema validation failed",
      keyword: error.keyword
    });
  }
}

function validateRecordConsistency(record, filePath) {
  if (!isObject(record)) {
    return;
  }

  const expectedPath = expectedRecordPath(record);
  if (expectedPath && filePath !== expectedPath) {
    failures.push({
      code: "record_path_mismatch",
      path: filePath,
      expected_path: expectedPath,
      message: "record file path must match retrospectives/YYYY/MM/<id>.json"
    });
  }

  const [idDate, idRunType] = String(record.id || "").split(".");
  if (record.date && idDate && record.date !== idDate) {
    failures.push({
      code: "record_id_date_mismatch",
      path: filePath,
      message: "record.id date must match record.date"
    });
  }
  if (record.run_type && idRunType && record.run_type !== idRunType) {
    failures.push({
      code: "record_id_run_type_mismatch",
      path: filePath,
      message: "record.id run_type must match record.run_type"
    });
  }
}

function validateSuggestionEvidence(record, filePath) {
  if (!Array.isArray(record?.suggestions)) {
    return;
  }

  record.suggestions.forEach((suggestion, index) => {
    if (!isObject(suggestion) || suggestion.status !== "implemented") {
      return;
    }
    if (!hasNonEmptyArray(suggestion.ledger_links) || !hasNonEmptyArray(suggestion.validation_evidence)) {
      failures.push({
        code: "implemented_suggestion_missing_evidence",
        path: filePath,
        json_path: `/suggestions/${index}`,
        message: "implemented suggestions require item-level ledger_links and validation_evidence"
      });
    }
  });
}

function validateIndexConsistency(index, records) {
  const indexRecords = Array.isArray(index.records) ? index.records : [];
  const actualByPath = new Map(records.map((entry) => [entry.path, entry.record]));
  const actualById = new Map(records.map((entry) => [entry.record?.id, entry]));
  const seenIds = new Set();
  const seenPaths = new Set();

  for (const [indexPosition, entry] of indexRecords.entries()) {
    if (!isObject(entry)) {
      continue;
    }
    const entryPath = normalizePath(entry.path);
    const entryId = String(entry.id || "");

    if (!isSafeRepoRelativePath(entryPath) || entryPath === indexPath || !entryPath.startsWith(`${recordsRoot}/`)) {
      failures.push({
        code: "index_path_invalid",
        path: indexPath,
        json_path: `/records/${indexPosition}/path`,
        message: "index record path must be a repo-relative retrospectives JSON path"
      });
      continue;
    }

    if (seenIds.has(entryId)) {
      failures.push({
        code: "index_duplicate_id",
        path: indexPath,
        json_path: `/records/${indexPosition}/id`,
        message: `duplicate index record id: ${entryId}`
      });
    }
    seenIds.add(entryId);

    if (seenPaths.has(entryPath)) {
      failures.push({
        code: "index_duplicate_path",
        path: indexPath,
        json_path: `/records/${indexPosition}/path`,
        message: `duplicate index record path: ${entryPath}`
      });
    }
    seenPaths.add(entryPath);

    const record = actualByPath.get(entryPath);
    if (!record) {
      failures.push({
        code: "index_record_missing",
        path: indexPath,
        json_path: `/records/${indexPosition}/path`,
        record_path: entryPath,
        message: "index points to a missing retrospective record"
      });
      continue;
    }

    const expectedEntry = {
      id: record.id,
      run_type: record.run_type,
      date: record.date,
      status: record.status,
      path: entryPath,
      title: record.title
    };
    for (const field of ["id", "run_type", "date", "status", "title"]) {
      if (entry[field] !== expectedEntry[field]) {
        failures.push({
          code: "index_record_metadata_mismatch",
          path: indexPath,
          json_path: `/records/${indexPosition}/${field}`,
          record_path: entryPath,
          message: `index ${field} must match record ${field}`
        });
      }
    }
  }

  for (const entry of records) {
    if (!seenPaths.has(entry.path)) {
      failures.push({
        code: "record_missing_from_index",
        path: entry.path,
        message: "retrospective record must be listed in retrospectives/index.json"
      });
    }
    if (entry.record?.id && actualById.get(entry.record.id)?.path !== entry.path) {
      failures.push({
        code: "record_duplicate_id",
        path: entry.path,
        message: `duplicate retrospective record id: ${entry.record.id}`
      });
    }
  }
}

function scanForSensitiveData(value, filePath, jsonPath = "") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanForSensitiveData(item, filePath, `${jsonPath}/${index}`));
    return;
  }
  if (!isObject(value)) {
    if (typeof value === "string") {
      validateSanitizedString(value, filePath, jsonPath || "/");
    }
    return;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    const nestedPath = `${jsonPath}/${escapeJsonPointer(key)}`;
    validateSanitizedKey(key, filePath, nestedPath);
    scanForSensitiveData(nestedValue, filePath, nestedPath);
  }
}

function validateSanitizedKey(key, filePath, jsonPath) {
  const normalized = String(key).toLowerCase();
  const rawLogKeys = new Set([
    "stdout",
    "stderr",
    "raw_log",
    "raw_logs",
    "raw_stdout",
    "raw_stderr",
    "command_output",
    "command_outputs",
    "full_output",
    "terminal_output"
  ]);
  if (rawLogKeys.has(normalized)) {
    failures.push({
      code: "raw_log_field_forbidden",
      path: filePath,
      json_path: jsonPath,
      message: "retrospectives must summarize evidence instead of storing raw command output"
    });
  }
}

function validateSanitizedString(value, filePath, jsonPath) {
  const checks = [
    {
      code: "local_or_private_path_leak",
      pattern: /(?:[A-Za-z]:[\\/]|file:\/\/|\/Users\/[^/\s]+\/|\/home\/[^/\s]+\/|\\Users\\|\.codex[\\/]automations|\.codex[\\/]worktrees|\.codex[\\/]run-worktrees|\$CODEX_HOME|%CODEX_HOME%|CODEX_HOME)/i
    },
    {
      code: "secret_or_cookie_leak",
      pattern: /(?:\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b|github_pat_[A-Za-z0-9_]+|\bBearer\s+[A-Za-z0-9._~+/-]+=*|\b(?:GH_TOKEN|GITHUB_TOKEN|OPENAI_API_KEY|ANTHROPIC_API_KEY|NEWRANK_COOKIE)\b|\bAuthorization\s*:|\bcookie\s*=)/i
    }
  ];

  for (const check of checks) {
    if (check.pattern.test(value)) {
      failures.push({
        code: check.code,
        path: filePath,
        json_path: jsonPath,
        message: "retrospective field contains private, local, or secret-looking data"
      });
    }
  }
}

function expectedRecordPath(record) {
  const date = String(record?.date || "");
  const id = String(record?.id || "");
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(date);
  if (!match || !id) {
    return "";
  }
  return `${recordsRoot}/${match[1]}/${match[2]}/${id}.json`;
}

function hasNonEmptyArray(value) {
  return Array.isArray(value) && value.some((item) => String(item || "").trim());
}

function isSafeRepoRelativePath(value) {
  const normalized = normalizePath(value);
  return Boolean(normalized)
    && !path.isAbsolute(normalized)
    && !normalized.startsWith("../")
    && !normalized.includes("/../")
    && normalized.endsWith(".json");
}

function resolveRepoPath(relativePath) {
  return path.join(rootDir, ...normalizePath(relativePath).split("/"));
}

function normalizePath(value) {
  return String(value || "").replace(/\\/g, "/");
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function escapeJsonPointer(value) {
  return String(value).replace(/~/g, "~0").replace(/\//g, "~1");
}
