import fs from "node:fs";
import path from "node:path";
import Ajv from "ajv/dist/2020.js";
import { fileURLToPath } from "node:url";
import { isValidDateString, isValidDateTimeString } from "./time.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

function loadSchema(name) {
  const schemaPath = path.join(rootDir, "schemas", name);
  return JSON.parse(fs.readFileSync(schemaPath, "utf8"));
}

function createAjv() {
  const ajv = new Ajv({
    allErrors: true,
    strict: true,
    useDefaults: true
  });

  ajv.addFormat("date", {
    type: "string",
    validate: isValidDateString
  });
  ajv.addFormat("date-time", {
    type: "string",
    validate: isValidDateTimeString
  });
  ajv.addFormat("uri", {
    type: "string",
    validate(value) {
      try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
      } catch {
        return false;
      }
    }
  });

  return ajv;
}

export const schemas = {
  report: loadSchema("report.schema.json"),
  feed: loadSchema("feed.schema.json"),
  candidatePool: loadSchema("candidates.schema.json"),
  sourceRegistry: loadSchema("sources.schema.json"),
  trends: loadSchema("trends.schema.json")
};

const ajv = createAjv();
const validateReportSchema = ajv.compile(schemas.report);
const validateFeedSchema = ajv.compile(schemas.feed);
const validateCandidatePoolSchema = ajv.compile(schemas.candidatePool);
const validateSourceRegistrySchema = ajv.compile(schemas.sourceRegistry);
const validateTrendsSchema = ajv.compile(schemas.trends);

export function validateReport(report) {
  const candidate = structuredClone(report);
  const valid = validateReportSchema(candidate);
  return {
    valid,
    value: candidate,
    errors: valid ? [] : normalizeAjvErrors(validateReportSchema.errors)
  };
}

export function validateFeed(feed) {
  const candidate = structuredClone(feed);
  const valid = validateFeedSchema(candidate);
  return {
    valid,
    value: candidate,
    errors: valid ? [] : normalizeAjvErrors(validateFeedSchema.errors)
  };
}

export function validateCandidatePool(candidatePool) {
  const candidate = structuredClone(candidatePool);
  const valid = validateCandidatePoolSchema(candidate);
  return {
    valid,
    value: candidate,
    errors: valid ? [] : normalizeAjvErrors(validateCandidatePoolSchema.errors)
  };
}

export function validateSourceRegistry(sourceRegistry) {
  const candidate = structuredClone(sourceRegistry);
  const valid = validateSourceRegistrySchema(candidate);
  return {
    valid,
    value: candidate,
    errors: valid ? [] : normalizeAjvErrors(validateSourceRegistrySchema.errors)
  };
}

export function validateTrends(trends) {
  const candidate = structuredClone(trends);
  const valid = validateTrendsSchema(candidate);
  return {
    valid,
    value: candidate,
    errors: valid ? [] : normalizeAjvErrors(validateTrendsSchema.errors)
  };
}

function normalizeAjvErrors(errors = []) {
  return errors.map((error) => ({
    code: "schema_validation_failed",
    path: error.instancePath || "/",
    message: error.message || "schema validation failed",
    keyword: error.keyword
  }));
}
