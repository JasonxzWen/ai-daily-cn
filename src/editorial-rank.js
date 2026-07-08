import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv/dist/2020.js";
import {
  evaluateEditorialAdmission,
  formatEditorialContractErrors,
  loadEditorialClassificationContract,
  validateEditorialClassificationContract
} from "./editorial-classification-contract.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(__dirname, "..");
const DEFAULT_POLICY_PATH = path.join(DEFAULT_ROOT, "config", "editorial-rank-policy.json");
const DEFAULT_SCHEMA_PATH = path.join(DEFAULT_ROOT, "schemas", "editorial-rank.schema.json");
const DEFAULT_SOURCE_WINDOW = Object.freeze({ relative_hours: 24 });
const REQUIRED_PRIORITIES = ["critical", "high", "medium", "low"];
const DEFAULT_VERIFICATION_STATUS = "confirmed";

export function loadEditorialRankPolicy(options = {}) {
  const rootDir = path.resolve(options.rootDir || DEFAULT_ROOT);
  const policyPath = path.resolve(rootDir, options.policyPath || DEFAULT_POLICY_PATH);
  return JSON.parse(fs.readFileSync(policyPath, "utf8"));
}

export function validateEditorialRankPolicy(policy, options = {}) {
  const rootDir = path.resolve(options.rootDir || DEFAULT_ROOT);
  const contract = options.contract || loadEditorialClassificationContract({ rootDir });
  const contractValidation = validateEditorialClassificationContract(contract, { rootDir });
  const errors = [];
  if (!contractValidation.valid) {
    errors.push({
      code: "editorial_rank_contract_invalid",
      path: "/contract",
      message: formatEditorialContractErrors(contractValidation.errors),
      keyword: "semantic"
    });
  }

  const policyIsObject = policy && typeof policy === "object" && !Array.isArray(policy);
  const candidate = policyIsObject ? structuredClone(policy) : {};
  if (!policyIsObject) {
    addError(errors, "/", "editorial rank policy must be an object.");
  }
  if (candidate.schema_version !== 1) {
    addError(errors, "/schema_version", "editorial rank policy schema_version must be 1.");
  }
  if (!candidate.policy_id) {
    addError(errors, "/policy_id", "editorial rank policy requires policy_id.");
  }
  if (candidate.contract_name !== contract.name) {
    addError(errors, "/contract_name", `policy contract_name must be ${contract.name}.`);
  }
  if (candidate.artifact?.max_items !== 100) {
    addError(errors, "/artifact/max_items", "internal editorial rank artifact max_items must be 100.");
  }
  if (candidate.artifact?.public !== false) {
    addError(errors, "/artifact/public", "editorial rank artifacts must be internal-only.");
  }
  if (candidate.selection_limits?.today_selected !== contract.admission_targets.today_selected.max_items) {
    addError(errors, "/selection_limits/today_selected", "today_selected limit must match the classification contract.");
  }
  if (candidate.selection_limits?.must_read !== contract.admission_targets.must_read.max_items) {
    addError(errors, "/selection_limits/must_read", "must_read limit must match the classification contract.");
  }
  if (candidate.selection_limits?.quota_policy !== "upper_bound_not_quota") {
    addError(errors, "/selection_limits/quota_policy", "selection limits must be upper bounds, not quotas.");
  }

  const weights = candidate.score_weights || {};
  validateKnownWeightMap(weights.rank_policy, contract.rank_policies, "/score_weights/rank_policy", errors, { requireAll: true });
  validateKnownWeightMap(weights.selection_reason, contract.reason_codes.selection, "/score_weights/selection_reason", errors, { requireAll: true });
  validateKnownWeightMap(weights.demotion_reason, contract.reason_codes.demotion, "/score_weights/demotion_reason", errors, { requireAll: true });
  validateKnownWeightMap(weights.event_type, contract.event_types, "/score_weights/event_type", errors, { requireAll: true });
  validateKnownWeightMap(weights.verification_status, contract.verification_statuses.map((status) => status.id), "/score_weights/verification_status", errors, { requireAll: true });
  validateKnownWeightMap(weights.priority, REQUIRED_PRIORITIES, "/score_weights/priority", errors, { requireAll: true });

  return {
    valid: errors.length === 0,
    value: candidate,
    errors
  };
}

export function buildEditorialRankArtifact(options = {}) {
  const rootDir = path.resolve(options.rootDir || DEFAULT_ROOT);
  const contract = options.contract || loadEditorialClassificationContract({ rootDir });
  const policy = options.policy || loadEditorialRankPolicy({ rootDir });
  const policyValidation = validateEditorialRankPolicy(policy, { rootDir, contract });
  if (!policyValidation.valid) {
    throw new Error(`Invalid editorial rank policy: ${formatEditorialRankErrors(policyValidation.errors)}`);
  }

  const candidates = Array.isArray(options.candidates) ? options.candidates : [];
  const ranked = candidates
    .map((candidate, index) => normalizeRankCandidate(candidate, index, { contract, policy }))
    .sort(compareRankedItems);
  const capped = ranked.slice(0, policy.artifact.max_items);

  for (const [index, item] of capped.entries()) {
    item.editorial_rank = index + 1;
  }

  const todaySelectedIds = selectAdmissionIds(capped, "today_selected", policy.selection_limits.today_selected);
  const mustReadIds = selectAdmissionIds(
    capped.filter((item) => todaySelectedIds.has(item.source_id)),
    "must_read",
    policy.selection_limits.must_read
  );

  const items = capped.map((item) => finalizeRankedItem(item, {
    contract,
    todaySelectedIds,
    mustReadIds
  }));

  return {
    schema_version: 1,
    policy_id: policy.policy_id,
    generated_at: normalizeGeneratedAt(options.generatedAt),
    source_window: structuredClone(options.sourceWindow || DEFAULT_SOURCE_WINDOW),
    items
  };
}

export function validateEditorialRankArtifact(artifact, options = {}) {
  const rootDir = path.resolve(options.rootDir || DEFAULT_ROOT);
  const schemaPath = path.resolve(rootDir, options.schemaPath || DEFAULT_SCHEMA_PATH);
  const schema = options.schema || JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  const policy = options.policy || loadEditorialRankPolicy({ rootDir });
  const ajv = new Ajv({ allErrors: true, strict: true, allowUnionTypes: true });
  const validate = ajv.compile(schema);
  const candidate = artifact && typeof artifact === "object" && !Array.isArray(artifact)
    ? structuredClone(artifact)
    : {};
  const schemaValid = validate(candidate);
  const errors = schemaValid ? [] : normalizeAjvErrors(validate.errors);
  errors.push(...validateArtifactSemantics(candidate, policy));
  return {
    valid: errors.length === 0,
    value: candidate,
    errors
  };
}

export function formatEditorialRankErrors(errors = []) {
  return errors.map((error) => `${error.path}: ${error.message}`).join("\n");
}

function normalizeRankCandidate(candidate, index, context) {
  const { contract, policy } = context;
  const sourceId = String(candidate?.id || candidate?.source_id || "").trim();
  if (!sourceId) {
    throw new Error(`editorial rank candidate at index ${index} is missing id/source_id.`);
  }
  const title = String(candidate?.title || "").trim();
  if (!title) {
    throw new Error(`editorial rank candidate ${sourceId} is missing title.`);
  }

  const decision = evaluateEditorialAdmission(contract, candidate);
  const selectionReasons = uniqueStrings(decision.selection_reasons);
  const demotionReasons = uniqueStrings(decision.demotion_reasons);
  const rankPolicy = chooseRankPolicy(candidate, selectionReasons, demotionReasons);
  const topicIds = intersectKnownIds(candidate?.topics, contract.topics);
  const entityIds = intersectKnownIds(candidate?.entities, contract.entities);
  const eventType = String(candidate?.event_type || "industry_signal");
  const verificationStatus = String(candidate?.verification_status || DEFAULT_VERIFICATION_STATUS);

  return {
    source_id: sourceId,
    title,
    editorial_rank: 0,
    score: computeScore(candidate, {
      policy,
      rankPolicy,
      selectionReasons,
      demotionReasons,
      eventType,
      verificationStatus
    }),
    rank_policy: rankPolicy,
    selection_reasons: selectionReasons,
    demotion_reasons: demotionReasons,
    lane_ids: [],
    topic_ids: topicIds,
    entity_ids: entityIds,
    event_type: eventType,
    verification_status: verificationStatus,
    admission: {
      today_selected: normalizeAdmissionTarget(decision.targets.today_selected),
      must_read: normalizeAdmissionTarget(decision.targets.must_read)
    }
  };
}

function chooseRankPolicy(candidate, selectionReasons, demotionReasons) {
  const selections = new Set(selectionReasons);
  const demotions = new Set(demotionReasons);
  if (demotions.has("github_readme_context_insufficient") || demotions.has("momentum_only")) {
    return "github_momentum_downgrade";
  }
  if (candidate?.source_type === "github" && selections.has("github_repo_context_sufficient")) {
    return "github_contextual_repo";
  }
  if (candidate?.source_type === "official" && selections.has("official_technical_signal")) {
    return "breaking_official_technical";
  }
  if (candidate?.verification_status === "unconfirmed_high_signal" || selections.has("major_company_priority")) {
    return "major_company_high_signal";
  }
  if (candidate?.watch_source_high_value || ["rss", "wechat"].includes(candidate?.source_type) || String(candidate?.event_type || "").startsWith("watch_source_")) {
    return "watch_source_full_internal";
  }
  if (candidate?.trend_state === "hot" || candidate?.trend_state === "active" || candidate?.event_type === "trend_signal") {
    return "trend_hot_active";
  }
  if (candidate?.source_type === "x" || candidate?.event_type === "builder_discussion") {
    return "builder_discussion";
  }
  return "industry_background";
}

function computeScore(candidate, context) {
  const { policy, rankPolicy, selectionReasons, demotionReasons, eventType, verificationStatus } = context;
  const weights = policy.score_weights;
  let score = 0;
  score += getWeight(weights.rank_policy, rankPolicy);
  score += getWeight(weights.event_type, eventType);
  score += getWeight(weights.verification_status, verificationStatus);
  score += getWeight(weights.priority, candidate?.priority || "medium");
  score += getWeight(weights.source_type, candidate?.source_type || "media");
  for (const reason of selectionReasons) {
    score += getWeight(weights.selection_reason, reason);
  }
  for (const reason of demotionReasons) {
    score += getWeight(weights.demotion_reason, reason);
  }
  return score;
}

function finalizeRankedItem(item, context) {
  const todaySelected = context.todaySelectedIds.has(item.source_id);
  const mustRead = context.mustReadIds.has(item.source_id);
  return {
    ...item,
    admission: {
      today_selected: {
        ...item.admission.today_selected,
        selected: todaySelected
      },
      must_read: {
        ...item.admission.must_read,
        selected: mustRead
      }
    },
    lane_ids: deriveLaneIds(item, {
      contract: context.contract,
      mustRead
    })
  };
}

function deriveLaneIds(item, context) {
  const lanes = [];
  if (context.mustRead) {
    lanes.push("must_read");
  }
  if (item.rank_policy === "major_company_high_signal" || item.selection_reasons.includes("major_company_priority")) {
    lanes.push("major_company_strategy");
  }
  if (item.rank_policy === "watch_source_full_internal") {
    lanes.push("watch_source_updates");
  }
  if (item.rank_policy === "github_contextual_repo" || item.rank_policy === "github_momentum_downgrade") {
    lanes.push("open_source_github");
  }
  if (item.rank_policy === "builder_discussion") {
    lanes.push("builder_twitter");
  }
  if (item.rank_policy === "trend_hot_active") {
    lanes.push("trend_tracking");
  }
  if (lanes.length === 0 || item.rank_policy === "industry_background") {
    lanes.push("product_industry");
  }
  return lanes.filter((laneId) => context.contract.daily_lanes.some((lane) => lane.id === laneId));
}

function selectAdmissionIds(items, target, limit) {
  return new Set(
    items
      .filter((item) => item.admission[target].eligible)
      .slice(0, limit)
      .map((item) => item.source_id)
  );
}

function normalizeAdmissionTarget(target) {
  return {
    eligible: Boolean(target?.eligible),
    selected: false,
    blocking_demotion_reasons: uniqueStrings(target?.blocking_demotion_reasons)
  };
}

function compareRankedItems(left, right) {
  if (right.score !== left.score) {
    return right.score - left.score;
  }
  return left.source_id.localeCompare(right.source_id) || left.title.localeCompare(right.title);
}

function validateArtifactSemantics(artifact, policy) {
  const errors = [];
  const items = Array.isArray(artifact?.items) ? artifact.items : [];
  const maxItems = policy?.artifact?.max_items || 100;
  if (items.length > maxItems) {
    addError(errors, "/items", `editorial rank artifact must contain at most ${maxItems} items.`);
  }
  let previous = null;
  const rankPolicies = new Set(Object.keys(policy?.score_weights?.rank_policy || {}));
  for (const [index, item] of items.entries()) {
    if (item.editorial_rank !== index + 1) {
      addError(errors, `/items/${index}/editorial_rank`, "editorial_rank must be contiguous and match item order.");
    }
    if (!Array.isArray(item.lane_ids) || item.lane_ids.length === 0) {
      addError(errors, `/items/${index}/lane_ids`, "ranked items must include at least one daily lane.");
    }
    if (!rankPolicies.has(item.rank_policy)) {
      addError(errors, `/items/${index}/rank_policy`, `${item.rank_policy} is not defined by the rank policy.`);
    }
    if (previous && compareRankedItems(previous, item) > 0) {
      addError(errors, `/items/${index}`, "items must be sorted by score descending, then source_id/title ascending.");
    }
    if (item.admission.must_read.selected && !item.admission.today_selected.selected) {
      addError(errors, `/items/${index}/admission/must_read/selected`, "must_read selection must be a subset of today_selected.");
    }
    previous = item;
  }
  const todaySelectedCount = items.filter((item) => item.admission.today_selected.selected).length;
  const mustReadCount = items.filter((item) => item.admission.must_read.selected).length;
  if (todaySelectedCount > policy.selection_limits.today_selected) {
    addError(errors, "/items", "today_selected selected count exceeds policy limit.");
  }
  if (mustReadCount > policy.selection_limits.must_read) {
    addError(errors, "/items", "must_read selected count exceeds policy limit.");
  }
  return errors;
}

function validateKnownWeightMap(weightMap, allowedIds, pathPrefix, errors, options = {}) {
  if (!weightMap || typeof weightMap !== "object" || Array.isArray(weightMap)) {
    addError(errors, pathPrefix, "weight map must be an object.");
    return;
  }
  const allowed = new Set(allowedIds);
  for (const key of Object.keys(weightMap)) {
    if (!allowed.has(key)) {
      addError(errors, `${pathPrefix}/${key}`, `${key} is not defined by the editorial classification contract.`);
    }
    if (typeof weightMap[key] !== "number") {
      addError(errors, `${pathPrefix}/${key}`, `${key} weight must be numeric.`);
    }
  }
  if (options.requireAll) {
    for (const id of allowedIds) {
      if (!Object.hasOwn(weightMap, id)) {
        addError(errors, pathPrefix, `missing weight for ${id}.`);
      }
    }
  }
}

function normalizeGeneratedAt(generatedAt) {
  if (!generatedAt) {
    return new Date().toISOString();
  }
  if (generatedAt instanceof Date) {
    return generatedAt.toISOString();
  }
  return String(generatedAt);
}

function intersectKnownIds(values = [], knownEntries = []) {
  const known = new Set(knownEntries.map((entry) => entry.id));
  return uniqueStrings(values).filter((value) => known.has(value));
}

function uniqueStrings(values = []) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean))].sort();
}

function getWeight(weightMap = {}, key) {
  return Number(weightMap[key] || 0);
}

function addError(errors, pathValue, message) {
  errors.push({
    code: "editorial_rank_semantic_error",
    path: pathValue,
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
