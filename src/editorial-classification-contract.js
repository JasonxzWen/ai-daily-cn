import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv/dist/2020.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(__dirname, "..");
const DEFAULT_CONTRACT_PATH = path.join(DEFAULT_ROOT, "config", "editorial-classification-contract.json");
const DEFAULT_SCHEMA_PATH = path.join(DEFAULT_ROOT, "schemas", "editorial-classification-contract.schema.json");

const HIGH_SIGNAL_EVENT_TYPES = new Set([
  "official_technical_blog",
  "model_release",
  "product_launch",
  "platform_update",
  "engineering_practice",
  "safety_eval_method",
  "strategy_org",
  "pricing_business",
  "layoff_org"
]);

const GITHUB_CONTEXT_INSUFFICIENT = new Set([
  "readme_missing",
  "readme_insufficient",
  "readme_fetch_failed"
]);

export function loadEditorialClassificationContract(options = {}) {
  const rootDir = path.resolve(options.rootDir || DEFAULT_ROOT);
  const contractPath = path.resolve(rootDir, options.contractPath || DEFAULT_CONTRACT_PATH);
  return JSON.parse(fs.readFileSync(contractPath, "utf8"));
}

export function validateEditorialClassificationContract(contract, options = {}) {
  const rootDir = path.resolve(options.rootDir || DEFAULT_ROOT);
  const schemaPath = path.resolve(rootDir, options.schemaPath || DEFAULT_SCHEMA_PATH);
  const schema = options.schema || JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  const ajv = new Ajv({ allErrors: true, strict: true, allowUnionTypes: true });
  const validate = ajv.compile(schema);
  const candidate = structuredClone(contract);
  const schemaValid = validate(candidate);
  const errors = schemaValid ? [] : normalizeAjvErrors(validate.errors);
  errors.push(...validateContractSemantics(candidate));
  return {
    valid: errors.length === 0,
    value: candidate,
    errors
  };
}

export function evaluateEditorialAdmission(contract, item) {
  const contractValidation = validateEditorialClassificationContract(contract);
  if (!contractValidation.valid) {
    throw new Error(`Invalid editorial classification contract: ${formatEditorialContractErrors(contractValidation.errors)}`);
  }

  const candidate = structuredClone(item);
  const selectionReasons = new Set(candidate.selection_reasons || []);
  const demotionReasons = new Set(candidate.demotion_reasons || []);
  const targetEntities = new Set(contract.entities.map((entity) => entity.id));
  const candidateEntities = new Set(candidate.entities || []);
  const touchesTargetEntity = [...candidateEntities].some((entity) => targetEntities.has(entity));
  const eventType = candidate.event_type;
  const verificationStatus = candidate.verification_status || "confirmed";

  applyBoundaryRules(contract, candidate, demotionReasons);
  applyGithubRules(candidate, selectionReasons, demotionReasons);
  applyLowSignalRules(candidate, demotionReasons);
  applySelectionRules(candidate, {
    touchesTargetEntity,
    selectionReasons,
    eventType,
    verificationStatus
  });
  applyUnconfirmedRules(contract, candidate, {
    touchesTargetEntity,
    selectionReasons,
    demotionReasons,
    verificationStatus
  });

  const normalizedSelection = [...selectionReasons].sort();
  const normalizedDemotion = [...demotionReasons].sort();
  const todaySelected = decideTarget(contract.admission_targets.today_selected, normalizedSelection, normalizedDemotion, {
    requiresSelection: true
  });
  const mustRead = decideTarget(contract.admission_targets.must_read, normalizedSelection, normalizedDemotion, {
    requiresSelection: true,
    requiresHighPriority: true,
    priority: candidate.priority
  });

  return {
    id: candidate.id,
    selection_reasons: normalizedSelection,
    demotion_reasons: normalizedDemotion,
    presentation: {
      github_tab_allowed: isGithubTabAllowed(contract, candidate),
      github_summary_mode: getGithubSummaryMode(contract, candidate)
    },
    targets: {
      today_selected: todaySelected,
      must_read: mustRead
    }
  };
}

export function formatEditorialContractErrors(errors = []) {
  return errors.map((error) => `${error.path}: ${error.message}`).join("\n");
}

function validateContractSemantics(contract) {
  const errors = [];
  requireOrderedIds(contract.homepage_tabs, [
    "today_selected",
    "trend_tracking",
    "watch_sources",
    "github",
    "builder",
    "industry"
  ], "/homepage_tabs", errors);
  requireOrderedIds(contract.daily_lanes, [
    "must_read",
    "major_company_strategy",
    "watch_source_updates",
    "open_source_github",
    "product_industry",
    "builder_twitter",
    "trend_tracking"
  ], "/daily_lanes", errors);
  requireIds(contract.topics, [
    "foundation_models",
    "ai_engineering_stack",
    "ai_assistants_agents",
    "ai_practice_methods",
    "workplace_ai_software",
    "emerging_ai_products_projects",
    "enterprise_ai_adoption",
    "enterprise_function_ai",
    "ai_market_dynamics",
    "multimodal_ai",
    "ai_compute_inference",
    "ai_policy_geopolitics",
    "consumer_ai_products",
    "embodied_ai"
  ], "/topics", errors);
  requireIds(contract.entities, [
    "anthropic",
    "openai",
    "microsoft",
    "google",
    "nvidia",
    "alibaba",
    "meta",
    "bytedance",
    "tencent",
    "apple",
    "amazon",
    "deepseek"
  ], "/entities", errors);
  requireValues(contract.verification_statuses.map((status) => status.id), [
    "confirmed",
    "multi_source_confirmed",
    "unconfirmed_high_signal",
    "single_source_unconfirmed"
  ], "/verification_statuses", errors);

  if (contract.admission_targets.today_selected.max_items !== 20) {
    addSemanticError(errors, "/admission_targets/today_selected/max_items", "today_selected max_items must be 20.");
  }
  if (contract.admission_targets.must_read.max_items !== 8) {
    addSemanticError(errors, "/admission_targets/must_read/max_items", "must_read max_items must be 8.");
  }
  if (contract.github_policy.readme_insufficient.today_selected_allowed !== false) {
    addSemanticError(errors, "/github_policy/readme_insufficient/today_selected_allowed", "README-insufficient GitHub items must not enter today_selected.");
  }
  if (contract.github_policy.readme_insufficient.must_read_allowed !== false) {
    addSemanticError(errors, "/github_policy/readme_insufficient/must_read_allowed", "README-insufficient GitHub items must not enter must_read.");
  }
  if (contract.trend_policy.public_states.some((state) => !["hot", "active"].includes(state))) {
    addSemanticError(errors, "/trend_policy/public_states", "Only hot/active trend states can be public.");
  }
  for (const field of ["editorial_rank", "rank_policy", "selection_reasons", "demotion_reasons"]) {
    if (!contract.public_private_boundary.public_articles_forbidden_fields.includes(field)) {
      addSemanticError(errors, "/public_private_boundary/public_articles_forbidden_fields", `${field} must be forbidden in public articles.`);
    }
  }

  return errors;
}

function applyBoundaryRules(contract, candidate, demotionReasons) {
  const forbiddenFields = new Set(contract.public_private_boundary.public_articles_forbidden_fields);
  if ((candidate.public_fields || []).some((field) => forbiddenFields.has(field))) {
    demotionReasons.add("public_internal_boundary_leak");
  }
}

function applyGithubRules(candidate, selectionReasons, demotionReasons) {
  if (candidate.source_type !== "github") {
    return;
  }
  if (candidate.github_context_state === "readme_sufficient" && candidate.event_type === "github_repo_with_context") {
    selectionReasons.add("github_repo_context_sufficient");
    return;
  }
  if (GITHUB_CONTEXT_INSUFFICIENT.has(candidate.github_context_state) || candidate.event_type === "github_momentum") {
    demotionReasons.add("github_readme_context_insufficient");
    demotionReasons.add("momentum_only");
  }
}

function applyLowSignalRules(candidate, demotionReasons) {
  if (candidate.event_type === "partnership_only") {
    demotionReasons.add("partnership_only");
  }
  if (candidate.event_type === "customer_case_low_information") {
    demotionReasons.add("customer_case_low_information");
  }
  if (candidate.event_type === "stale_duplicate" || candidate.is_stale_duplicate) {
    demotionReasons.add("stale_duplicate");
  }
  if (candidate.source_type === "rss" && candidate.event_type === "watch_source_repost" && !candidate.watch_source_high_value) {
    demotionReasons.add("ordinary_rss_repost");
  }
  if (candidate.source_type === "media" && candidate.evidence_level === "low" && Number(candidate.source_count || 0) <= 1) {
    demotionReasons.add("low_evidence_single_source");
  }
  if (candidate.source_type === "x" && candidate.evidence_level === "low") {
    demotionReasons.add("high_noise_x");
  }
}

function applySelectionRules(candidate, context) {
  const { touchesTargetEntity, selectionReasons, eventType, verificationStatus } = context;
  if (candidate.source_type === "official" && ["official_technical_blog", "model_release", "engineering_practice", "safety_eval_method"].includes(eventType)) {
    selectionReasons.add("official_technical_signal");
  }
  if (touchesTargetEntity && HIGH_SIGNAL_EVENT_TYPES.has(eventType)) {
    selectionReasons.add("major_company_priority");
  }
  if (["model_release", "product_launch", "platform_update"].includes(eventType)) {
    selectionReasons.add("model_or_platform_increment");
  }
  if (["engineering_practice", "safety_eval_method", "official_technical_blog"].includes(eventType)) {
    selectionReasons.add("engineering_practice_value");
  }
  if (candidate.watch_source_high_value) {
    selectionReasons.add("watch_source_high_value");
  }
  if (candidate.trend_state === "hot" || candidate.trend_state === "active") {
    selectionReasons.add("trend_hot_or_active");
  }
  if (verificationStatus === "unconfirmed_high_signal" && touchesTargetEntity) {
    selectionReasons.add("major_company_priority");
  }
}

function applyUnconfirmedRules(contract, candidate, context) {
  const { touchesTargetEntity, selectionReasons, demotionReasons, verificationStatus } = context;
  if (verificationStatus !== "unconfirmed_high_signal") {
    return;
  }

  const status = contract.verification_statuses.find((entry) => entry.id === "unconfirmed_high_signal");
  const requiredLabel = status.public_label;
  const titleHasCue = (status.required_title_cues || []).some((cue) => String(candidate.title || "").includes(cue));
  const summaryDisclosesUncertainty = [requiredLabel, "未确认", "线索", "传", "媒体称", "市场风声", "多方讨论"].some((cue) => (
    cue && String(candidate.summary || "").includes(cue)
  ));

  if (!touchesTargetEntity) {
    demotionReasons.add("low_evidence_single_source");
  }
  if (candidate.public_label !== requiredLabel || !summaryDisclosesUncertainty) {
    demotionReasons.add("unconfirmed_signal_missing_public_disclosure");
  }
  if (!titleHasCue) {
    demotionReasons.add("unconfirmed_signal_factualized");
  }
  if (!demotionReasons.has("unconfirmed_signal_missing_public_disclosure") && !demotionReasons.has("unconfirmed_signal_factualized")) {
    selectionReasons.add("unconfirmed_high_signal_disclosed");
  }
}

function decideTarget(targetPolicy, selectionReasons, demotionReasons, options = {}) {
  const forbidden = new Set(targetPolicy.forbidden_demotion_codes || []);
  const blocking = demotionReasons.filter((reason) => forbidden.has(reason));
  const hasSelection = !options.requiresSelection || selectionReasons.length > 0;
  const hasPriority = !options.requiresHighPriority || ["critical", "high"].includes(options.priority);
  return {
    eligible: blocking.length === 0 && hasSelection && hasPriority,
    blocking_demotion_reasons: blocking
  };
}

function isGithubTabAllowed(contract, candidate) {
  if (candidate.source_type !== "github") {
    return false;
  }
  if (GITHUB_CONTEXT_INSUFFICIENT.has(candidate.github_context_state)) {
    return contract.github_policy.readme_insufficient.github_tab_allowed;
  }
  return true;
}

function getGithubSummaryMode(contract, candidate) {
  if (candidate.source_type !== "github") {
    return null;
  }
  if (GITHUB_CONTEXT_INSUFFICIENT.has(candidate.github_context_state) || candidate.event_type === "github_momentum") {
    return contract.github_policy.readme_insufficient.public_summary_mode;
  }
  return "reader_repo_summary";
}

function requireOrderedIds(items, expectedIds, pathPrefix, errors) {
  const actualIds = items.map((item) => item.id);
  if (actualIds.join(",") !== expectedIds.join(",")) {
    addSemanticError(errors, pathPrefix, `Expected ordered ids: ${expectedIds.join(", ")}.`);
  }
}

function requireIds(items, expectedIds, pathPrefix, errors) {
  const actualIds = new Set(items.map((item) => item.id));
  for (const id of expectedIds) {
    if (!actualIds.has(id)) {
      addSemanticError(errors, pathPrefix, `Missing required id ${id}.`);
    }
  }
}

function requireValues(values, expectedValues, pathPrefix, errors) {
  const actualValues = new Set(values);
  for (const value of expectedValues) {
    if (!actualValues.has(value)) {
      addSemanticError(errors, pathPrefix, `Missing required value ${value}.`);
    }
  }
}

function addSemanticError(errors, path, message) {
  errors.push({
    code: "editorial_contract_semantic_error",
    path,
    message,
    keyword: "semantic"
  });
}

function normalizeAjvErrors(errors = []) {
  return errors.map((error) => ({
    code: "schema_validation_failed",
    path: error.instancePath || "/",
    message: error.message || "schema validation failed",
    keyword: error.keyword
  }));
}
