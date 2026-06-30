#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildSourceInventoryRows, CORE_SOURCE_CONTRACTS } from "../src/source-effectiveness.js";

const REQUIRED_STATUS_LABELS = [
  "included",
  "updated_not_selected",
  "parsed_not_candidate",
  "no_recent_update",
  "blocked",
  "not_configured_or_skipped"
];

const REQUIRED_MAINTENANCE = {
  owner: "user-reviewed-fixed-source-order",
  handbook_path: "docs/source-first-ia-handbook.md",
  inventory_order_reference_path: "docs/source-inventory-order.md",
  order_tuning_review_path: "docs/source-order-tuning-review.md",
  validation_commands: ["npm run sources:display-contract", "npm run validate"],
  handbook_required_markers: [
    "source-display-governance:v1",
    "baseline-fixed-order",
    "source-first-v2-contract:v1",
    "source-first-v2-layering",
    "internal-source-runtime-order",
    "public-daily-source-audit-exclusion",
    "full-inventory-expansion-semantics",
    "baseline-source-importance-2026-06",
    "source-promotion-review-loop",
    "source-first-v2-validation",
    "new-source-insertion-rules",
    "source-insertion-handbook:v1",
    "source-status-preservation",
    "validation-commands"
  ],
  inventory_order_required_markers: [
    "source-inventory-order:v1",
    "inventory-fixed-order-reference",
    "collection-entry-insertion-rules",
    "inventory-validation-commands"
  ],
  order_tuning_required_markers: [
    "source-order-tuning-review:v1",
    "order-tuning-unmapped-counts",
    "promotion-candidate-review",
    "collection-only-review",
    "order-tuning-validation"
  ]
};

const REQUIRED_SOURCE_INSERTION_HANDBOOK_PHRASES = [
  "Source Insertion Decision Tree",
  "Insertion Rank Rules",
  "Collection Entry Only",
  "Promotion To Logical Source",
  "User Review",
  "section_rank_step",
  "baseline_source_rank_step",
  "insertion_rank_step",
  "Daily status must not reorder rows",
  "first-class logical source",
  "collection-only entry",
  "core_primary",
  "china_models",
  "open_source_platforms",
  "tracking_metrics",
  "builder_community",
  "platform_cn_media",
  "english_media_search"
];

const REQUIRED_ORDER_TUNING_REVIEW_PHRASES = [
  "User Review Surface",
  "Daily source status must not reorder review priorities",
  "Unmapped Source Counts",
  "Promotion Candidate Review",
  "Collection-Only Review",
  "Order Tuning Validation"
];

const REQUIRED_PRESENTATION_CONTRACT = {
  version: "source-first-v2",
  surface: "internal_source_governance",
  public_daily_default: "story_first_without_source_runtime_sections",
  public_runtime_sections: "excluded_by_default",
  first_viewport_order: [
    "source_signal_story",
    "source_metrics_dashboard"
  ],
  source_first_section_order: [
    "source_signal_story",
    "source_first_dashboard",
    "source_status_focus",
    "source_map",
    "source_inventory"
  ],
  reader_source_unit: "logical_source",
  inventory_unit: "collection_entry",
  full_inventory_semantics: "visible_grouped_expanded_non_hiding_search",
  story_content_contract: "story-centered-daily-contract",
  public_excluded_section_ids: [
    "source_signal_story",
    "source_first_dashboard",
    "system_operating_dashboard",
    "source_status_focus",
    "source_map",
    "source_inventory"
  ]
};

const REQUIRED_SOURCE_FIRST_V2_HANDBOOK_PHRASES = [
  "Logical Source Layer",
  "Collection Entry Layer",
  "Source-first runtime is internal governance by default",
  "Public daily pages remain story-first and exclude source runtime audit sections",
  "source signal story before source metrics dashboard in internal source-first runtime",
  "145 collection entries are complete inventory rows, not public daily story content",
  "Story-centered content remains the fact carrier",
  "Promote a collection entry only when source governance should track it as a named source"
];

export async function validateSourceDisplayContract({ rootDir = process.cwd() } = {}) {
  const failures = [];
  const contractPath = path.join(rootDir, "config", "source-display-contract.json");
  const packagePath = path.join(rootDir, "package.json");

  const contract = await readJson(contractPath, failures, "contract");
  const packageJson = await readJson(packagePath, failures, "package");
  const maintenance = contract?.maintenance || {};
  const handbookPath = String(maintenance.handbook_path || REQUIRED_MAINTENANCE.handbook_path);
  const handbookFullPath = path.join(rootDir, handbookPath);
  const handbook = await readText(handbookFullPath, failures, "handbook");
  const inventoryOrderReferencePath = String(maintenance.inventory_order_reference_path || REQUIRED_MAINTENANCE.inventory_order_reference_path);
  const inventoryOrderReferenceFullPath = path.join(rootDir, inventoryOrderReferencePath);
  const inventoryOrderReference = await readText(inventoryOrderReferenceFullPath, failures, "inventory-order-reference");
  const orderTuningReviewPath = String(maintenance.order_tuning_review_path || REQUIRED_MAINTENANCE.order_tuning_review_path);
  const orderTuningReviewFullPath = path.join(rootDir, orderTuningReviewPath);
  const orderTuningReview = await readText(orderTuningReviewFullPath, failures, "order-tuning-review");
  const inventoryRows = buildSourceInventoryRows({ rootDir });
  const unmappedInventoryCount = countUnmappedInventorySources(inventoryRows);

  validateMaintenance(maintenance, failures);
  validateStatusLabels(contract, failures);
  validatePresentationContract(contract, failures);
  const sectionRows = validateSections(contract, failures);
  validateLogicalSourceCoverage(sectionRows, failures);
  validateHandbook(handbook, contract, sectionRows, maintenance, failures);
  validateInventoryOrderReference(inventoryOrderReference, inventoryRows, maintenance, failures);
  validateOrderTuningReview(orderTuningReview, inventoryRows, contract, maintenance, failures);
  validatePackageScripts(packageJson, failures);

  return {
    ok: failures.length === 0,
    failures,
    summary: {
      logical_sources: CORE_SOURCE_CONTRACTS.length,
      display_sources: sectionRows.length,
      handbook_path: handbookPath,
      inventory_sources: inventoryRows.length,
      inventory_order_reference_path: inventoryOrderReferencePath,
      order_tuning_review_path: orderTuningReviewPath,
      order_tuning_unmapped_sources: unmappedInventoryCount,
      required_handbook_markers: REQUIRED_MAINTENANCE.handbook_required_markers,
      required_presentation_contract: REQUIRED_PRESENTATION_CONTRACT,
      required_inventory_order_markers: REQUIRED_MAINTENANCE.inventory_order_required_markers,
      required_order_tuning_markers: REQUIRED_MAINTENANCE.order_tuning_required_markers,
      validation_commands: REQUIRED_MAINTENANCE.validation_commands
    },
    contract: {
      maintenance
    }
  };
}

async function readJson(filePath, failures, label) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    failures.push(`${label}: cannot read valid JSON at ${relativePath(filePath)}: ${error.message}`);
    return null;
  }
}

async function readText(filePath, failures, label) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    failures.push(`${label}: cannot read ${relativePath(filePath)}: ${error.message}`);
    return "";
  }
}

function validateMaintenance(maintenance, failures) {
  if (maintenance.owner !== REQUIRED_MAINTENANCE.owner) {
    failures.push(`maintenance.owner must be ${REQUIRED_MAINTENANCE.owner}`);
  }
  if (maintenance.handbook_path !== REQUIRED_MAINTENANCE.handbook_path) {
    failures.push(`maintenance.handbook_path must be ${REQUIRED_MAINTENANCE.handbook_path}`);
  }
  if (maintenance.inventory_order_reference_path !== REQUIRED_MAINTENANCE.inventory_order_reference_path) {
    failures.push(`maintenance.inventory_order_reference_path must be ${REQUIRED_MAINTENANCE.inventory_order_reference_path}`);
  }
  if (maintenance.order_tuning_review_path !== REQUIRED_MAINTENANCE.order_tuning_review_path) {
    failures.push(`maintenance.order_tuning_review_path must be ${REQUIRED_MAINTENANCE.order_tuning_review_path}`);
  }
  if (maintenance.user_review_required !== true) {
    failures.push("maintenance.user_review_required must be true");
  }
  const rankPolicy = maintenance.rank_policy || {};
  for (const [key, expected] of Object.entries({
    section_rank_step: 10,
    baseline_source_rank_step: 10,
    insertion_rank_step: 5
  })) {
    if (Number(rankPolicy[key]) !== expected) {
      failures.push(`maintenance.rank_policy.${key} must be ${expected}`);
    }
  }
  for (const command of REQUIRED_MAINTENANCE.validation_commands) {
    if (!Array.isArray(maintenance.validation_commands) || !maintenance.validation_commands.includes(command)) {
      failures.push(`maintenance.validation_commands must include ${command}`);
    }
  }
  for (const marker of REQUIRED_MAINTENANCE.handbook_required_markers) {
    if (!Array.isArray(maintenance.handbook_required_markers) || !maintenance.handbook_required_markers.includes(marker)) {
      failures.push(`maintenance.handbook_required_markers must include ${marker}`);
    }
  }
  for (const marker of REQUIRED_MAINTENANCE.inventory_order_required_markers) {
    if (!Array.isArray(maintenance.inventory_order_required_markers) || !maintenance.inventory_order_required_markers.includes(marker)) {
      failures.push(`maintenance.inventory_order_required_markers must include ${marker}`);
    }
  }
  for (const marker of REQUIRED_MAINTENANCE.order_tuning_required_markers) {
    if (!Array.isArray(maintenance.order_tuning_required_markers) || !maintenance.order_tuning_required_markers.includes(marker)) {
      failures.push(`maintenance.order_tuning_required_markers must include ${marker}`);
    }
  }
}

function validateStatusLabels(contract, failures) {
  const labels = new Set(Array.isArray(contract?.status_labels) ? contract.status_labels : []);
  for (const label of REQUIRED_STATUS_LABELS) {
    if (!labels.has(label)) {
      failures.push(`status_labels must include ${label}`);
    }
  }
}

function validatePresentationContract(contract, failures) {
  const presentation = contract?.presentation_contract || {};
  for (const [key, expected] of Object.entries(REQUIRED_PRESENTATION_CONTRACT)) {
    const actual = presentation[key];
    if (Array.isArray(expected)) {
      if (!arrayEquals(actual, expected)) {
        failures.push(`presentation_contract.${key} must be ${JSON.stringify(expected)}`);
      }
      continue;
    }
    if (actual !== expected) {
      failures.push(`presentation_contract.${key} must be ${expected}`);
    }
  }
}

function validateSections(contract, failures) {
  const sections = Array.isArray(contract?.sections) ? contract.sections : [];
  const sectionIds = new Set();
  const sectionRanks = new Set();
  const sourceIds = new Set();
  const rows = [];

  sections.forEach((section, sectionIndex) => {
    const sectionId = String(section?.id || "");
    const sectionRank = Number(section?.rank);
    if (!sectionId) {
      failures.push(`sections[${sectionIndex}].id is required`);
    } else if (sectionIds.has(sectionId)) {
      failures.push(`duplicate section id: ${sectionId}`);
    }
    sectionIds.add(sectionId);

    if (!Number.isFinite(sectionRank)) {
      failures.push(`section ${sectionId || sectionIndex} must have numeric rank`);
    } else {
      if (sectionRanks.has(sectionRank)) {
        failures.push(`duplicate section rank: ${sectionRank}`);
      }
      if (sectionRank % 10 !== 0) {
        failures.push(`section ${sectionId} rank must use 10-point spacing`);
      }
      sectionRanks.add(sectionRank);
    }

    const sourceRanks = new Set();
    const sources = Array.isArray(section?.sources) ? section.sources : [];
    sources.forEach((source, sourceIndex) => {
      const sourceId = String(source?.id || "");
      const sourceRank = Number(source?.rank);
      if (!sourceId) {
        failures.push(`section ${sectionId} sources[${sourceIndex}].id is required`);
      } else if (sourceIds.has(sourceId)) {
        failures.push(`duplicate source id in display contract: ${sourceId}`);
      }
      sourceIds.add(sourceId);

      if (!Number.isFinite(sourceRank)) {
        failures.push(`source ${sourceId || sourceIndex} in section ${sectionId} must have numeric rank`);
      } else if (sourceRanks.has(sourceRank)) {
        failures.push(`duplicate rank ${sourceRank} in section ${sectionId}`);
      }
      sourceRanks.add(sourceRank);
      rows.push({
        id: sourceId,
        rank: sourceRank,
        section_id: sectionId,
        section_rank: sectionRank
      });
    });
  });

  return rows;
}

function validateLogicalSourceCoverage(sectionRows, failures) {
  const displayIds = new Set(sectionRows.map((row) => row.id));
  const logicalIds = new Set(CORE_SOURCE_CONTRACTS.map((source) => source.id));
  for (const id of logicalIds) {
    if (!displayIds.has(id)) {
      failures.push(`display contract missing logical source: ${id}`);
    }
  }
  for (const id of displayIds) {
    if (!logicalIds.has(id)) {
      failures.push(`display contract has unknown logical source: ${id}`);
    }
  }
}

function validateHandbook(handbook, contract, sectionRows, maintenance, failures) {
  for (const marker of REQUIRED_MAINTENANCE.handbook_required_markers) {
    if (!handbook.includes(marker)) {
      failures.push(`handbook missing marker: ${marker}`);
    }
  }
  for (const command of REQUIRED_MAINTENANCE.validation_commands) {
    if (!handbook.includes(command)) {
      failures.push(`handbook missing validation command: ${command}`);
    }
  }
  if (!handbook.includes(REQUIRED_MAINTENANCE.owner)) {
    failures.push(`handbook must name maintenance owner ${REQUIRED_MAINTENANCE.owner}`);
  }
  if (!handbook.includes("do not reorder by daily status")) {
    failures.push("handbook must state: do not reorder by daily status");
  }
  for (const phrase of REQUIRED_SOURCE_INSERTION_HANDBOOK_PHRASES) {
    if (!handbook.includes(phrase)) {
      failures.push(`handbook missing insertion handbook phrase: ${phrase}`);
    }
  }
  for (const phrase of REQUIRED_SOURCE_FIRST_V2_HANDBOOK_PHRASES) {
    if (!handbook.includes(phrase)) {
      failures.push(`handbook missing source-first v2 phrase: ${phrase}`);
    }
  }
  for (const section of Array.isArray(contract?.sections) ? contract.sections : []) {
    if (!handbook.includes(String(section.id || ""))) {
      failures.push(`handbook missing section id: ${section.id}`);
    }
  }
  for (const row of sectionRows) {
    if (!handbook.includes(row.id)) {
      failures.push(`handbook missing source id: ${row.id}`);
    }
  }
  for (const marker of Array.isArray(maintenance.handbook_required_markers) ? maintenance.handbook_required_markers : []) {
    if (!handbook.includes(marker)) {
      failures.push(`handbook missing contract-declared marker: ${marker}`);
    }
  }
}

function validateInventoryOrderReference(reference, inventoryRows, maintenance, failures) {
  for (const marker of REQUIRED_MAINTENANCE.inventory_order_required_markers) {
    if (!reference.includes(marker)) {
      failures.push(`inventory order reference missing marker: ${marker}`);
    }
  }
  for (const marker of Array.isArray(maintenance.inventory_order_required_markers) ? maintenance.inventory_order_required_markers : []) {
    if (!reference.includes(marker)) {
      failures.push(`inventory order reference missing contract-declared marker: ${marker}`);
    }
  }
  if (!reference.includes(REQUIRED_MAINTENANCE.owner)) {
    failures.push(`inventory order reference must name maintenance owner ${REQUIRED_MAINTENANCE.owner}`);
  }
  if (!reference.includes("Daily source status must not reorder this reference")) {
    failures.push("inventory order reference must state that daily source status cannot reorder the reference");
  }

  const listedIds = extractInventorySourceIds(reference);
  const listedCounts = countValues(listedIds);
  const expectedIds = new Set(inventoryRows.map((row) => row.id).filter(Boolean));
  if (listedIds.length !== inventoryRows.length) {
    failures.push(`inventory order reference must list ${inventoryRows.length} source ids, found ${listedIds.length}`);
  }
  for (const row of inventoryRows) {
    const count = listedCounts.get(row.id) || 0;
    if (count !== 1) {
      failures.push(`inventory order reference must list source id exactly once: ${row.id} (found ${count})`);
    }
  }
  for (const id of listedIds) {
    if (!expectedIds.has(id)) {
      failures.push(`inventory order reference lists unknown source id: ${id}`);
    }
    if ((listedCounts.get(id) || 0) > 1) {
      failures.push(`inventory order reference duplicates source id: ${id}`);
    }
  }

  const expectedSectionCounts = countInventorySections(inventoryRows);
  const listedSectionCounts = extractInventorySectionCounts(reference);
  const summarySectionCounts = extractInventorySummarySectionCounts(reference);
  for (const [sectionId, expectedCount] of expectedSectionCounts.entries()) {
    const listedCount = listedSectionCounts.get(sectionId);
    if (listedCount !== expectedCount) {
      failures.push(`inventory order reference section ${sectionId} count must be ${expectedCount}, found ${listedCount ?? "missing"}`);
    }
    const summaryCount = summarySectionCounts.get(sectionId);
    if (summaryCount !== expectedCount) {
      failures.push(`inventory order reference summary table section ${sectionId} count must be ${expectedCount}, found ${summaryCount ?? "missing"}`);
    }
  }
  for (const sectionId of listedSectionCounts.keys()) {
    if (!expectedSectionCounts.has(sectionId)) {
      failures.push(`inventory order reference lists unknown section id: ${sectionId}`);
    }
  }
  for (const sectionId of summarySectionCounts.keys()) {
    if (!expectedSectionCounts.has(sectionId)) {
      failures.push(`inventory order reference summary table lists unknown section id: ${sectionId}`);
    }
  }

  const forbiddenChecks = [
    {
      pattern: /https?:\/\//i,
      message: "inventory order reference must not expose raw URLs"
    },
    {
      pattern: /(?:\bAI_DAILY_[A-Z0-9_]+\b|\b[A-Z][A-Z0-9_]*(?:_API_KEY|_TOKEN|_COOKIE|_SECRET|_BASE_URL|_FEED_URL|_URL)\b|required_env|url_env|base_url_env|\burl\b|env_required|allowed_hosts|include_keywords|exclude_keywords|\bkeywords\b|notes|source_audit|candidate_pool|selection_snapshot|self_check|score|debug)/i,
      message: "inventory order reference must not expose internal source fields"
    },
    {
      pattern: /(?:[A-Za-z]:[\\/]|\\Users\\|\.codex[\\/]|\/Users\/[^/\s]+\/|\/home\/[^/\s]+\/)/i,
      message: "inventory order reference must not expose local paths"
    },
    {
      pattern: /(?:OPENAI_API_KEY|ANTHROPIC_API_KEY|GITHUB_TOKEN|GH_TOKEN|NEWRANK_COOKIE|Authorization\s*:|Bearer\s+[A-Za-z0-9._~+/-]+=*)/i,
      message: "inventory order reference must not expose secret-looking values"
    }
  ];
  for (const check of forbiddenChecks) {
    if (check.pattern.test(reference)) {
      failures.push(check.message);
    }
  }
}

function validateOrderTuningReview(review, inventoryRows, contract, maintenance, failures) {
  for (const marker of REQUIRED_MAINTENANCE.order_tuning_required_markers) {
    if (!review.includes(marker)) {
      failures.push(`order tuning review missing marker: ${marker}`);
    }
  }
  for (const marker of Array.isArray(maintenance.order_tuning_required_markers) ? maintenance.order_tuning_required_markers : []) {
    if (!review.includes(marker)) {
      failures.push(`order tuning review missing contract-declared marker: ${marker}`);
    }
  }
  for (const phrase of REQUIRED_ORDER_TUNING_REVIEW_PHRASES) {
    if (!review.includes(phrase)) {
      failures.push(`order tuning review missing phrase: ${phrase}`);
    }
  }
  if (!review.includes(REQUIRED_MAINTENANCE.owner)) {
    failures.push(`order tuning review must name maintenance owner ${REQUIRED_MAINTENANCE.owner}`);
  }

  const sectionIds = new Set((Array.isArray(contract?.sections) ? contract.sections : []).map((section) => String(section.id || "")).filter(Boolean));
  for (const sectionId of sectionIds) {
    if (!review.includes(sectionId)) {
      failures.push(`order tuning review missing section id: ${sectionId}`);
    }
  }

  const expectedCounts = countUnmappedInventorySections(inventoryRows);
  for (const sectionId of sectionIds) {
    if (!expectedCounts.has(sectionId)) {
      expectedCounts.set(sectionId, 0);
    }
  }
  const listedCounts = extractOrderTuningUnmappedCounts(review);
  for (const [sectionId, expectedCount] of expectedCounts.entries()) {
    const listedCount = listedCounts.get(sectionId);
    if (listedCount !== expectedCount) {
      failures.push(`order tuning review unmapped count for ${sectionId} must be ${expectedCount}, found ${listedCount ?? "missing"}`);
    }
  }
  for (const sectionId of listedCounts.keys()) {
    if (!expectedCounts.has(sectionId)) {
      failures.push(`order tuning review lists unknown unmapped count section: ${sectionId}`);
    }
  }
  const expectedTotal = countUnmappedInventorySources(inventoryRows);
  const listedTotal = extractOrderTuningTotalUnmapped(review);
  if (listedTotal !== expectedTotal) {
    failures.push(`order tuning review total unmapped count must be ${expectedTotal}, found ${listedTotal ?? "missing"}`);
  }

  const inventoryById = new Map(inventoryRows.map((row) => [row.id, row]));
  const seenSourceIds = new Set();
  const seenLogicalIds = new Set();
  const candidates = extractPromotionCandidates(review);
  if (candidates.length < 24) {
    failures.push(`order tuning review must list at least 24 promotion candidates, found ${candidates.length}`);
  }
  for (const candidate of candidates) {
    const row = inventoryById.get(candidate.sourceId);
    if (!row) {
      failures.push(`promotion candidate references unknown source id: ${candidate.sourceId}`);
      continue;
    }
    if (row.logical_source_id) {
      failures.push(`promotion candidate is already mapped to logical source: ${candidate.sourceId}`);
    }
    if (seenSourceIds.has(candidate.sourceId)) {
      failures.push(`promotion candidate duplicates source id: ${candidate.sourceId}`);
    }
    seenSourceIds.add(candidate.sourceId);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(candidate.logicalSourceId)) {
      failures.push(`promotion candidate ${candidate.sourceId} suggested logical source id is invalid: ${candidate.logicalSourceId}`);
    }
    if (seenLogicalIds.has(candidate.logicalSourceId)) {
      failures.push(`promotion candidate duplicates suggested logical source id: ${candidate.logicalSourceId}`);
    }
    seenLogicalIds.add(candidate.logicalSourceId);
    if (!sectionIds.has(candidate.sectionId)) {
      failures.push(`promotion candidate ${candidate.sourceId} suggested section is invalid: ${candidate.sectionId}`);
    }
    if (!Number.isFinite(candidate.rank) || candidate.rank <= 0 || candidate.rank % 5 !== 0) {
      failures.push(`promotion candidate ${candidate.sourceId} suggested rank must use 5-point spacing`);
    }
    if (candidate.action !== "promote") {
      failures.push(`promotion candidate ${candidate.sourceId} action must be promote`);
    }
  }

  const forbiddenChecks = [
    {
      pattern: /https?:\/\//i,
      message: "order tuning review must not expose raw URLs"
    },
    {
      pattern: /(?:\bAI_DAILY_[A-Z0-9_]+\b|\b[A-Z][A-Z0-9_]*(?:_API_KEY|_TOKEN|_COOKIE|_SECRET|_BASE_URL|_FEED_URL|_URL)\b|required_env|url_env|base_url_env|\burl\b|env_required|allowed_hosts|include_keywords|exclude_keywords|\bkeywords\b|notes|source_audit|candidate_pool|selection_snapshot|self_check|score|debug)/i,
      message: "order tuning review must not expose internal source fields"
    },
    {
      pattern: /(?:[A-Za-z]:[\\/]|\\Users\\|\.codex[\\/]|\/Users\/[^/\s]+\/|\/home\/[^/\s]+\/)/i,
      message: "order tuning review must not expose local paths"
    },
    {
      pattern: /(?:OPENAI_API_KEY|ANTHROPIC_API_KEY|GITHUB_TOKEN|GH_TOKEN|NEWRANK_COOKIE|Authorization\s*:|Bearer\s+[A-Za-z0-9._~+/-]+=*)/i,
      message: "order tuning review must not expose secret-looking values"
    }
  ];
  for (const check of forbiddenChecks) {
    if (check.pattern.test(review)) {
      failures.push(check.message);
    }
  }
}

function extractInventorySourceIds(reference) {
  const ids = [];
  const rowPattern = /^\|\s*\d+\.\d+\s*\|\s*`([^`]+)`\s*\|/gm;
  let match;
  while ((match = rowPattern.exec(reference))) {
    ids.push(match[1]);
  }
  return ids;
}

function extractOrderTuningUnmappedCounts(review) {
  const counts = new Map();
  const pattern = /^\|\s*`([a-z0-9_-]+)`\s*\|\s*(\d+)\s*\|/gm;
  let match;
  while ((match = pattern.exec(review))) {
    counts.set(match[1], Number(match[2]));
  }
  return counts;
}

function extractOrderTuningTotalUnmapped(review) {
  const match = review.match(/<!--\s*order-tuning-total-unmapped:(\d+)\s*-->/);
  return match ? Number(match[1]) : null;
}

function extractPromotionCandidates(review) {
  const candidates = [];
  const pattern = /^\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|\s*(\d+)\s*\|\s*`([^`]+)`\s*\|/gm;
  let match;
  while ((match = pattern.exec(review))) {
    candidates.push({
      sourceId: match[1],
      logicalSourceId: match[2],
      sectionId: match[3],
      rank: Number(match[4]),
      action: match[5]
    });
  }
  return candidates;
}

function extractInventorySectionCounts(reference) {
  const counts = new Map();
  const pattern = /<!--\s*inventory-section:([a-z0-9_-]+)\s+count:(\d+)\s*-->/g;
  let match;
  while ((match = pattern.exec(reference))) {
    counts.set(match[1], Number(match[2]));
  }
  return counts;
}

function extractInventorySummarySectionCounts(reference) {
  const counts = new Map();
  const pattern = /^\|\s*`([a-z0-9_-]+)`[^|]*\|\s*(\d+)\s*\|/gm;
  let match;
  while ((match = pattern.exec(reference))) {
    counts.set(match[1], Number(match[2]));
  }
  return counts;
}

function countUnmappedInventorySources(rows = []) {
  return rows.filter((row) => !row.logical_source_id).length;
}

function countUnmappedInventorySections(rows = []) {
  const counts = new Map();
  for (const row of rows) {
    if (row.logical_source_id) {
      continue;
    }
    const sectionId = String(row.display_section || "uncategorized");
    counts.set(sectionId, (counts.get(sectionId) || 0) + 1);
  }
  return counts;
}

function countInventorySections(rows = []) {
  const counts = new Map();
  for (const row of rows) {
    const sectionId = String(row.display_section || "uncategorized");
    counts.set(sectionId, (counts.get(sectionId) || 0) + 1);
  }
  return counts;
}

function countValues(values = []) {
  const counts = new Map();
  for (const value of values) {
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return counts;
}

function arrayEquals(actual, expected) {
  return Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index]);
}

function validatePackageScripts(packageJson, failures) {
  const scripts = packageJson?.scripts || {};
  if (scripts["sources:display-contract"] !== "node scripts/validate-source-display-contract.mjs") {
    failures.push("package.json scripts.sources:display-contract must run the source display validator");
  }
  if (!String(scripts.validate || "").includes("npm run sources:display-contract")) {
    failures.push("package.json scripts.validate must include npm run sources:display-contract");
  }
}

function relativePath(filePath) {
  return filePath.replace(process.cwd() + path.sep, "");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await validateSourceDisplayContract();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) {
    process.exitCode = 1;
  }
}
