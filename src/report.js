import fs from "node:fs/promises";
import path from "node:path";
import { DEFAULT_SITE } from "./config.js";
import { PublisherError } from "./errors.js";
import { canonicalReportUrl, reportRelativePaths } from "./paths.js";
import { defaultGeneratedAt, isValidDateString } from "./time.js";
import { defaultPublishStatus } from "./parser.js";
import { requirePlainLanguage } from "./plain-language.js";
import { requireFreshReport } from "./quality-gates.js";
import { deriveQualityStatus, requirePublishableQuality } from "./quality-status.js";
import { buildAutomationRevision, defaultAutomationRevision } from "./automation-revision.js";
import { normalizeOptimizationSuggestions } from "./feedback-contract.js";
import { withDefaultImportance } from "./importance.js";
import { normalizeUrlIdentity } from "./url.js";
import {
  appendSourceStatusSuggestionsToDraft,
  prepareSourceStatusHistoryUpdate,
  writeSourceStatusHistory
} from "./source-status-history.js";
import {
  readCandidatePool,
  requireCandidateCoverage,
  reportCandidatePoolPublicPath,
  writeCandidatePool
} from "./candidates.js";
import { validateReport } from "./schema.js";
import {
  auditGroupForPlatform,
  PLATFORM_SECTIONS,
  platformForSection,
  requirePlatformExemptItemContract
} from "./platform-exempt.js";
import { attachTrackingComponentSnapshots } from "./tracking-components.js";
import { isTemplatedStoryTitle, normalizeStoryFirstReport, STORY_FIRST_MAX } from "./story-first.js";
import { formatEditorialRankErrors, validateEditorialRankArtifact } from "./editorial-rank.js";

const PUBLIC_PRIMARY_SOURCE_LEVELS = new Set(["primary", "official", "paper", "github", "multi_source", "model_registry"]);
const PUBLIC_NON_PRIMARY_VERIFICATION_STATUSES = new Set(["intermediary_only", "original_social_only", "unverified"]);
const PRIVATE_EDITORIAL_RANK_FIELDS = [
  "admission",
  "demotion_reasons",
  "editorial_rank",
  "rank_policy",
  "selection_reasons"
];
const EDITORIAL_SELECTION_TARGETS = [
  {
    key: "today_selected",
    sourceKey: "today_selected_items",
    maxItems: 20
  },
  {
    key: "must_read",
    sourceKey: "must_read_items",
    maxItems: 8
  }
];
const DAILY_LANE_DEFINITIONS = [
  { id: "must_read", title: "今日必看", maxItems: 8 },
  { id: "major_company_strategy", title: "大厂与战略", maxItems: 20 },
  { id: "watch_source_updates", title: "关注源动态", maxItems: 20 },
  { id: "open_source_github", title: "开源与 GitHub", maxItems: 20 },
  { id: "product_industry", title: "产品与行业", maxItems: 20 },
  { id: "builder_twitter", title: "Builder / Twitter 讨论", maxItems: 20 },
  { id: "trend_tracking", title: "趋势追踪", maxItems: 20 }
];
const DAILY_LANE_IDS = new Set(DAILY_LANE_DEFINITIONS.map((lane) => lane.id));
const EDITORIAL_SELECTION_SECTIONS = [
  "stories",
  "main_items",
  "github_trending",
  "huggingface_trending",
  "model_releases",
  "hot_blogs",
  "chinese_media_dynamics",
  "daily_tracking",
  "projects",
  "builder_observations",
  "official_org_updates",
  "community_leads"
];

export async function writeReportDraft(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const outputDir = path.resolve(rootDir, options.outputDir || "reports-data");
  const raw = options.inputPath ? await fs.readFile(path.resolve(rootDir, options.inputPath), "utf8") : await fs.readFile(0, "utf8");
  const draft = JSON.parse(raw);
  const reportDate = options.reportDate || draft.report_date;
  if (!isValidDateString(reportDate)) {
    throw new PublisherError("report_date_invalid", "结构化日报必须提供有效的 report_date 或 --date。");
  }
  const { candidatePool } = await readCandidatePool({
    rootDir,
    reportDate,
    inputPath: options.candidatePoolPath
  });
  const editorialRankAdmissionContext = await loadEditorialRankAdmission({
    rootDir,
    reportDate,
    artifactPath: options.editorialRankArtifactPath
  });
  const automationRevision = options.automationRevision || (await buildAutomationRevision({ rootDir }));
  const sourceStatusUpdate = await prepareSourceStatusHistoryUpdate({
    rootDir,
    outputDir,
    reportDate,
    generatedAt: options.generatedAt || draft.generated_at,
    sourceAudit: draft.source_audit,
    days: options.sourceStatusWindowDays || 10
  });
  const draftWithSourceSuggestions = appendSourceStatusSuggestionsToDraft(draft, sourceStatusUpdate);
  let report = normalizeReportDraft(draftWithSourceSuggestions, {
    reportDate,
    siteUrl: options.siteUrl || DEFAULT_SITE.siteUrl,
    generatedAt: options.generatedAt,
    candidatePool,
    automationRevision,
    rootDir
  });
  requireEditorialRankAdmission(report, editorialRankAdmissionContext);
  applyEditorialSelection(report, editorialRankAdmissionContext);
  applyDailyLanes(report, editorialRankAdmissionContext);
  report = requireReportSchemaForWrite(report);
  await requireFreshReport(report, {
    historyDir: outputDir,
    historyDays: options.historyDays,
    candidatePool
  });
  const [year, month] = report.report_date.split("-");
  const target = path.join(outputDir, year, month, `${report.report_date}.json`);

  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  const candidatePoolPath = await writeCandidatePool(outputDir, report.report_date, candidatePool);
  const sourceStatusHistoryPath = await writeSourceStatusHistory(sourceStatusUpdate);

  return {
    report,
    path: target,
    candidatePoolPath,
    sourceStatusHistoryPath,
    editorialRankAdmission: editorialRankAdmissionContext?.summary || null
  };
}

async function loadEditorialRankAdmission({ rootDir, reportDate, artifactPath }) {
  if (!artifactPath) {
    return null;
  }
  const resolvedPath = path.resolve(rootDir, artifactPath);
  let artifact;
  try {
    artifact = JSON.parse(await fs.readFile(resolvedPath, "utf8"));
  } catch (error) {
    throw new PublisherError("editorial_rank_artifact_invalid", "Editorial rank artifact must be readable JSON.", {
      artifact_path: artifactPath,
      cause: error.message
    });
  }

  const validation = validateEditorialRankArtifact(artifact, { rootDir });
  if (!validation.valid) {
    throw new PublisherError("editorial_rank_artifact_invalid", "Editorial rank artifact failed validation.", {
      artifact_path: artifactPath,
      errors: validation.errors,
      error_summary: formatEditorialRankErrors(validation.errors)
    });
  }

  const artifactDate = validation.value.source_window?.date;
  if (artifactDate && artifactDate !== reportDate) {
    throw new PublisherError("editorial_rank_artifact_date_mismatch", "Editorial rank artifact date does not match report date.", {
      artifact_path: artifactPath,
      artifact_date: artifactDate,
      report_date: reportDate
    });
  }

  return buildEditorialRankAdmissionContext(validation.value, { artifactPath });
}

function buildEditorialRankAdmissionContext(artifact, { artifactPath }) {
  const itemsBySourceId = new Map();
  const items = Array.isArray(artifact.items) ? artifact.items : [];
  const laneCounts = {};
  let todaySelectedCount = 0;
  let mustReadCount = 0;

  for (const item of items) {
    if (item?.source_id) {
      itemsBySourceId.set(item.source_id, item);
    }
    if (item?.admission?.today_selected?.selected) {
      todaySelectedCount += 1;
    }
    if (item?.admission?.must_read?.selected) {
      mustReadCount += 1;
    }
    for (const laneId of Array.isArray(item?.lane_ids) ? item.lane_ids : []) {
      laneCounts[laneId] = (laneCounts[laneId] || 0) + 1;
    }
  }

  return {
    summary: {
      ok: true,
      artifact_path: artifactPath,
      policy_id: artifact.policy_id,
      generated_at: artifact.generated_at,
      source_window: artifact.source_window,
      item_count: items.length,
      today_selected_count: todaySelectedCount,
      must_read_count: mustReadCount,
      lane_counts: Object.fromEntries(Object.entries(laneCounts).sort(([left], [right]) => left.localeCompare(right))),
      today_selected_items: projectAdmissionItems(items, "today_selected"),
      must_read_items: projectAdmissionItems(items, "must_read")
    },
    itemsBySourceId
  };
}

function projectAdmissionItems(items, target) {
  return items
    .filter((item) => item?.admission?.[target]?.selected)
    .sort((left, right) => (left.editorial_rank || 0) - (right.editorial_rank || 0))
    .map(projectAdmissionItem);
}

function projectAdmissionItem(item) {
  return {
    source_id: item.source_id,
    title: item.title,
    lane_ids: Array.isArray(item.lane_ids) ? [...item.lane_ids] : [],
    topic_ids: Array.isArray(item.topic_ids) ? [...item.topic_ids] : [],
    entity_ids: Array.isArray(item.entity_ids) ? [...item.entity_ids] : [],
    event_type: item.event_type,
    verification_status: item.verification_status
  };
}

function requireEditorialRankAdmission(report, context) {
  if (!context) {
    return;
  }
  const issues = [];
  for (const sectionName of ["stories", "main_items"]) {
    const items = Array.isArray(report?.[sectionName]) ? report[sectionName] : [];
    for (const item of items) {
      const candidateIds = reportItemCandidateIds(item);
      const rankedItem = candidateIds.map((candidateId) => context.itemsBySourceId.get(candidateId)).find(Boolean);
      if (!rankedItem) {
        continue;
      }
      const demotionReasons = selectedAdmissionBlockingReasons(rankedItem);
      if (demotionReasons.length === 0) {
        continue;
      }
      issues.push({
        section: sectionName,
        candidate_id: candidateIds[0],
        title: item?.title || item?.headline || "",
        demotion_reasons: demotionReasons
      });
    }
  }
  if (issues.length > 0) {
    throw new PublisherError("editorial_rank_admission_blocked", "Report includes rank-blocked mainline items.", {
      artifact_path: context.summary.artifact_path,
      issues
    });
  }
}

function applyEditorialSelection(report, context) {
  delete report.editorial_selection;
  if (!context?.summary) {
    return report;
  }

  const reportItemsByCandidateId = buildReportSelectionIndex(report);
  const editorialSelection = {
    schema_version: 1
  };
  let matchedCount = 0;

  for (const target of EDITORIAL_SELECTION_TARGETS) {
    const seenCandidateIds = new Set();
    const items = [];
    const projectedItems = Array.isArray(context.summary[target.sourceKey]) ? context.summary[target.sourceKey] : [];
    for (const projectedItem of projectedItems) {
      const candidateId = publicString(projectedItem?.source_id);
      if (!candidateId || seenCandidateIds.has(candidateId)) {
        continue;
      }
      const matched = reportItemsByCandidateId.get(candidateId);
      if (!matched) {
        continue;
      }
      seenCandidateIds.add(candidateId);
      items.push(projectEditorialSelectionItem(matched, projectedItem, candidateId));
    }
    editorialSelection[target.key] = {
      target: target.key,
      max_items: target.maxItems,
      items
    };
    matchedCount += items.length;
  }

  if (matchedCount > 0) {
    report.editorial_selection = editorialSelection;
  }
  return report;
}

function applyDailyLanes(report, context) {
  delete report.daily_lanes;
  if (!context?.summary || !report?.editorial_selection) {
    return report;
  }

  const laneItemsById = new Map(DAILY_LANE_DEFINITIONS.map((lane) => [lane.id, []]));
  const seenCandidateIdsByLaneId = new Map(DAILY_LANE_DEFINITIONS.map((lane) => [lane.id, new Set()]));
  const todaySelectedItems = Array.isArray(report.editorial_selection.today_selected?.items)
    ? report.editorial_selection.today_selected.items
    : [];
  const mustReadItems = Array.isArray(report.editorial_selection.must_read?.items)
    ? report.editorial_selection.must_read.items
    : [];
  const projectedAdmissionItemsById = new Map(
    (Array.isArray(context.summary.today_selected_items) ? context.summary.today_selected_items : [])
      .map((item) => [publicString(item?.source_id), item])
      .filter(([candidateId]) => candidateId)
  );

  for (const item of mustReadItems.slice(0, 8)) {
    addDailyLaneItem(laneItemsById, seenCandidateIdsByLaneId, "must_read", item);
  }

  for (const item of todaySelectedItems) {
    const candidateId = publicString(item?.candidate_id);
    const projectedAdmissionItem = projectedAdmissionItemsById.get(candidateId);
    const laneIds = Array.isArray(projectedAdmissionItem?.lane_ids) ? projectedAdmissionItem.lane_ids : [];
    for (const laneId of laneIds) {
      if (laneId === "must_read" || !DAILY_LANE_IDS.has(laneId)) {
        continue;
      }
      addDailyLaneItem(laneItemsById, seenCandidateIdsByLaneId, laneId, item);
    }
  }

  const lanes = DAILY_LANE_DEFINITIONS.map((lane) => ({
    lane_id: lane.id,
    title: lane.title,
    max_items: lane.maxItems,
    items: laneItemsById.get(lane.id).slice(0, lane.maxItems)
  }));
  if (lanes.some((lane) => lane.items.length > 0)) {
    report.daily_lanes = {
      schema_version: 1,
      lanes
    };
  }
  return report;
}

function addDailyLaneItem(laneItemsById, seenCandidateIdsByLaneId, laneId, item) {
  const candidateId = publicString(item?.candidate_id);
  if (!candidateId) {
    return;
  }
  const seenCandidateIds = seenCandidateIdsByLaneId.get(laneId);
  if (!seenCandidateIds || seenCandidateIds.has(candidateId)) {
    return;
  }
  seenCandidateIds.add(candidateId);
  laneItemsById.get(laneId).push(projectDailyLaneItem(item));
}

function projectDailyLaneItem(item = {}) {
  const projected = {
    candidate_id: publicString(item.candidate_id),
    title: firstPublicString(item.title, item.candidate_id),
    section: publicString(item.section)
  };
  for (const key of ["url", "source", "summary", "event_type", "verification_status"]) {
    addPublicString(projected, key, item[key]);
  }
  const badges = Array.isArray(item.badges) ? item.badges.map(publicString).filter(Boolean) : [];
  if (badges.length > 0) {
    projected.badges = [...new Set(badges)];
  }
  return projected;
}

function buildReportSelectionIndex(report) {
  const itemsByCandidateId = new Map();
  for (const section of EDITORIAL_SELECTION_SECTIONS) {
    const items = Array.isArray(report?.[section]) ? report[section] : [];
    for (const item of items) {
      for (const candidateId of reportItemCandidateIds(item)) {
        if (!itemsByCandidateId.has(candidateId)) {
          itemsByCandidateId.set(candidateId, { section, item });
        }
      }
    }
  }
  return itemsByCandidateId;
}

function projectEditorialSelectionItem(matched, projectedItem, candidateId) {
  const item = matched.item || {};
  const firstSource = Array.isArray(item.sources) ? item.sources.find((source) => source && typeof source === "object") : null;
  const projected = {
    candidate_id: candidateId,
    title: firstPublicString(item.title, item.headline, item.name, item.repo, projectedItem?.title, candidateId),
    section: matched.section
  };
  addPublicString(projected, "url", item.url, firstSource?.url);
  addPublicString(
    projected,
    "source",
    item.source,
    item.publisher,
    item.author,
    item.repo,
    item.name,
    firstSource?.label,
    item.primary_entity
  );
  addPublicString(
    projected,
    "summary",
    item.summary,
    item.description,
    item.what_happened,
    item.why_it_matters,
    item.content,
    item.evidence
  );
  addPublicString(projected, "event_type", item.event_type, projectedItem?.event_type);
  addPublicString(projected, "verification_status", item.verification_status);
  return projected;
}

function requireReportSchemaForWrite(report) {
  const validation = validateReport(report);
  if (!validation.valid) {
    throw new PublisherError("schema_validation_failed", "Report failed schema validation before write.", {
      errors: validation.errors
    });
  }
  return validation.value;
}

function reportItemCandidateIds(item = {}) {
  return [
    item.candidate_id,
    item.source_id,
    item.id,
    item.story_id,
    ...(Array.isArray(item.source_item_refs) ? item.source_item_refs : [])
  ]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);
}

function firstPublicString(...values) {
  return values.map(publicString).find(Boolean) || "";
}

function addPublicString(target, key, ...values) {
  const value = firstPublicString(...values);
  if (value) {
    target[key] = value;
  }
}

function publicString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function selectedAdmissionBlockingReasons(rankedItem = {}) {
  const todaySelected = rankedItem?.admission?.today_selected;
  const mustRead = rankedItem?.admission?.must_read;
  if (todaySelected?.selected || mustRead?.selected) {
    return [];
  }
  const reasons = new Set();
  for (const admission of [todaySelected, mustRead]) {
    for (const reason of Array.isArray(admission?.blocking_demotion_reasons)
      ? admission.blocking_demotion_reasons
      : []) {
      reasons.add(reason);
    }
  }
  return [...reasons].sort();
}

export function normalizeReportDraft(draft, options = {}) {
  const reportDate = options.reportDate || draft.report_date;
  if (!isValidDateString(reportDate)) {
    throw new PublisherError("report_date_invalid", "结构化日报必须提供有效的 report_date 或 --date。");
  }

  const paths = reportRelativePaths(reportDate);
  const canonicalUrl = canonicalReportUrl(options.siteUrl || DEFAULT_SITE.siteUrl, reportDate);
  const report = {
    ...draft,
    schema_version: 1,
    report_status: draft.report_status || "normal",
    report_date: reportDate,
    canonical_url: draft.canonical_url || canonicalUrl,
    html_path: draft.html_path || paths.htmlPath,
    source_window: draft.source_window || {
      date_from: reportDate,
      date_to: reportDate,
      fallback_window_used: false,
      notes: ""
    },
    hero_highlights: Array.isArray(draft.hero_highlights) ? draft.hero_highlights : [],
    candidate_pool_path: draft.candidate_pool_path || reportCandidatePoolPublicPath(reportDate),
    stories: Array.isArray(draft.stories) ? draft.stories : [],
    main_items: Array.isArray(draft.main_items) ? draft.main_items : [],
    github_trending: Array.isArray(draft.github_trending) ? draft.github_trending : [],
    huggingface_trending: Array.isArray(draft.huggingface_trending) ? draft.huggingface_trending : [],
    model_releases: Array.isArray(draft.model_releases) ? draft.model_releases : [],
    hot_blogs: Array.isArray(draft.hot_blogs) ? draft.hot_blogs : [],
    chinese_media_dynamics: Array.isArray(draft.chinese_media_dynamics) ? draft.chinese_media_dynamics : [],
    daily_tracking: Array.isArray(draft.daily_tracking) ? draft.daily_tracking : [],
    projects: Array.isArray(draft.projects) ? draft.projects : [],
    builder_observations: Array.isArray(draft.builder_observations) ? draft.builder_observations : [],
    official_org_updates: Array.isArray(draft.official_org_updates) ? draft.official_org_updates : [],
    community_leads: Array.isArray(draft.community_leads) ? draft.community_leads : [],
    ...(Array.isArray(draft.wechat_items) ? { wechat_items: draft.wechat_items } : {}),
    ...(Array.isArray(draft.zhihu_items) ? { zhihu_items: draft.zhihu_items } : {}),
    ...(Array.isArray(draft.reddit_items) ? { reddit_items: draft.reddit_items } : {}),
    evidence_assets: Array.isArray(draft.evidence_assets) ? draft.evidence_assets : [],
    publish_status: draft.publish_status || defaultPublishStatus(canonicalUrl),
    generated_at: draft.generated_at || options.generatedAt || defaultGeneratedAt()
  };

  for (const sectionName of [
    "stories",
    "main_items",
    "model_releases",
    "hot_blogs",
    "chinese_media_dynamics",
    "daily_tracking",
    "projects",
    "github_trending",
    "huggingface_trending",
    "builder_observations",
    "official_org_updates",
    "community_leads"
  ]) {
    report[sectionName] = withDefaultImportance(sectionName, report[sectionName]);
  }
  for (const sectionName of PLATFORM_SECTIONS) {
    if (Array.isArray(report[sectionName])) {
      report[sectionName] = withDefaultImportance(sectionName, report[sectionName]);
    }
  }
  report.daily_tracking = attachTrackingComponentSnapshots({ daily_tracking: report.daily_tracking }).daily_tracking;

  if (report.self_check && typeof report.self_check === "object") {
    report.self_check = {
      ...report.self_check,
      report_date: report.self_check.report_date || reportDate,
      builder_skill_used: Array.isArray(report.self_check.builder_skill_used) ? report.self_check.builder_skill_used : [],
      fallback_sources: Array.isArray(report.self_check.fallback_sources) ? report.self_check.fallback_sources : [],
      optimization_suggestions: normalizeOptimizationSuggestions(report.self_check.optimization_suggestions),
      automation_revision:
        options.automationRevision || report.self_check.automation_revision || defaultAutomationRevision()
    };
  }

  const hadExplicitStories = Array.isArray(draft.stories) && draft.stories.length > 0;
  const storyFirstReport = normalizeStoryFirstReport(report, {
    preserveExistingStories: hadExplicitStories,
    allowSecondarySingleSource: true
  });
  Object.assign(report, storyFirstReport);

  report.quality_status = deriveQualityStatus(report, options.candidatePool);

  const validation = validateReport(report);
  if (!validation.valid) {
    throw new PublisherError("schema_validation_failed", "结构化日报草稿未通过 schema 校验。", {
      errors: validation.errors
    });
  }

  requireSourceAudit(validation.value);
  requirePlatformExemptSections(validation.value);
  requirePlainLanguage(validation.value);
  requireCandidateCoverage(validation.value, options.candidatePool);
  requireEvidenceAssetSelectivity(validation.value);
  requireStoryContract(validation.value);
  requireExpandedMainItemFormat(validation.value);
  requireHeroHighlightsContract(validation.value);
  requireChineseGithubTrendingDescriptions(validation.value);
  requirePublishableQuality(validation.value, {
    rootDir: options.rootDir,
    currentAutomationRevision: options.automationRevision
  });

  return stripPrivateDisclosureFields(validation.value);
}

function requirePlatformExemptSections(report) {
  for (const sectionName of PLATFORM_SECTIONS) {
    const items = Array.isArray(report?.[sectionName]) ? report[sectionName] : [];
    if (items.length > 0) {
      const groupName = auditGroupForPlatform(platformForSection(sectionName));
      requireAuditGroup(report?.source_audit?.[groupName], `source_audit.${groupName}`);
    }
    for (const item of items) {
      requirePlatformExemptItemContract(item, { sectionName });
    }
  }
}

function stripPrivateDisclosureFields(report) {
  const publicReport = structuredClone(report);
  for (const sectionName of [
    "stories",
    "main_items",
    "model_releases",
    "hot_blogs",
    "chinese_media_dynamics",
    "daily_tracking",
    "projects",
    "github_trending",
    "huggingface_trending",
    "builder_observations",
    "official_org_updates",
    "community_leads"
  ]) {
    if (!Array.isArray(publicReport[sectionName])) {
      continue;
    }
    publicReport[sectionName] = publicReport[sectionName].map((item) => {
      if (!item || typeof item !== "object") {
        return item;
      }
      const next = { ...item };
      if (!requiresPublicDisclosureFields(next)) {
        delete next.verification_note;
        delete next.risk_note;
      }
      delete next.source_item_refs;
      stripPrivateEditorialRankFields(next);
      return next;
    });
  }
  stripPrivateEditorialRankFields(publicReport);
  return publicReport;
}

function stripPrivateEditorialRankFields(item) {
  for (const field of PRIVATE_EDITORIAL_RANK_FIELDS) {
    delete item[field];
  }
}

function requiresPublicDisclosureFields(item = {}) {
  const status = String(item?.verification_status || "").trim();
  const sourceLevel = String(item?.source_level || "").trim();
  return Boolean(
    item?.intermediary_url ||
      item?.original_url ||
      PUBLIC_NON_PRIMARY_VERIFICATION_STATUSES.has(status) ||
      (sourceLevel && !PUBLIC_PRIMARY_SOURCE_LEVELS.has(sourceLevel))
  );
}

function requireStoryContract(report) {
  const stories = Array.isArray(report.stories) ? report.stories : [];
  const mainItems = Array.isArray(report.main_items) ? report.main_items : [];
  const errors = [];
  if (stories.length === 0) {
    if (mainItems.length > 0) {
      errors.push("stories must be present when main_items are present");
    } else {
      return;
    }
  }
  if (stories.length > STORY_FIRST_MAX) {
    errors.push(`stories must not exceed ${STORY_FIRST_MAX}; got ${stories.length}`);
  }

  const storyIds = new Set();
  const storySourceRefs = new Set();
  const storyUrlOwner = new Map();
  stories.forEach((story, index) => {
    const storyId = String(story?.story_id || "").trim();
    if (!storyId) {
      errors.push(`stories[${index}].story_id is required`);
    } else if (storyIds.has(storyId)) {
      errors.push(`stories[${index}].story_id duplicates ${storyId}`);
    } else {
      storyIds.add(storyId);
    }
    for (const ref of Array.isArray(story?.source_item_refs) ? story.source_item_refs : []) {
      const value = String(ref || "").trim();
      if (value) {
        storySourceRefs.add(value);
      }
    }
    if (isTemplatedStoryTitle(story?.title)) {
      errors.push(`stories[${index}].title is templated and must be concrete`);
    }
    const sources = Array.isArray(story?.sources) ? story.sources : [];
    if (sources.length === 0) {
      errors.push(`stories[${index}].sources must contain at least one public source`);
    }
    for (const source of sources) {
      const url = normalizeUrlForEvidenceGate(source?.url);
      if (!url) {
        continue;
      }
      const previousOwner = storyUrlOwner.get(url);
      if (previousOwner && previousOwner !== storyId) {
        errors.push(`stories[${index}].sources reuses canonical URL ${url} from ${previousOwner}`);
      }
      storyUrlOwner.set(url, storyId || `stories[${index}]`);
    }
  });

  if (mainItems.length > 0) {
    const mainIds = mainItems.map((item) => String(item?.candidate_id || "").trim()).filter(Boolean);
    const missing = mainIds.filter((id) => !storyIds.has(id) && !storySourceRefs.has(id));
    if (missing.length > 0) {
      errors.push(`main_items must be derived from stories; missing story ids: ${missing.slice(0, 5).join(", ")}`);
    }
  }

  if (errors.length > 0) {
    throw new PublisherError(
      "story_contract_failed",
      "Story-centered reports must expose source-linked stories and compatible main_items.",
      { errors }
    );
  }
}

function requireModelReleasesInMainItems(report) {
  const modelReleases = Array.isArray(report.model_releases) ? report.model_releases : [];
  if (modelReleases.length === 0) {
    return;
  }

  const mainUrls = new Set(
    (Array.isArray(report.main_items) ? report.main_items : [])
      .map((item) => normalizeUrlForEvidenceGate(item.url))
      .filter(Boolean)
  );
  const missing = modelReleases
    .map((item, index) => ({
      index,
      name: item?.name || item?.title || "",
      url: normalizeUrlForEvidenceGate(item?.url)
    }))
    .filter((item) => item.url && !mainUrls.has(item.url));

  if (missing.length > 0) {
    throw new PublisherError(
      "model_releases_missing_main_item",
      "model_releases must be mirrored in main_items so model launches stay part of the main report.",
      { missing }
    );
  }
}

function requireEvidenceAssetSelectivity(report) {
  const mainItems = Array.isArray(report.main_items) ? report.main_items : [];
  if (mainItems.length < 6) {
    return;
  }

  const mainUrls = new Set(mainItems.map((item) => normalizeUrlForEvidenceGate(item.url)).filter(Boolean));
  const assets = Array.isArray(report.evidence_assets) ? report.evidence_assets : [];
  const mainEvidenceAssets = assets.filter((asset) => mainUrls.has(normalizeUrlForEvidenceGate(asset?.source_url)));
  const manualMainTables = mainEvidenceAssets.filter((asset) => asset?.type === "table" && asset?.extraction_status === "manual_table");

  if (manualMainTables.length >= Math.ceil(mainItems.length * 0.8)) {
    throw new PublisherError(
      "evidence_assets_overpadded",
      "evidence_assets 不能用人工转写表格覆盖大多数主体信息；只有原文图表或天然适合表格呈现的结构化数据才应挂载表格。",
      {
        main_items: mainItems.length,
        main_evidence_assets: mainEvidenceAssets.length,
        manual_main_tables: manualMainTables.length
      }
    );
  }
}

function normalizeUrlForEvidenceGate(value) {
  return normalizeUrlIdentity(value);
}

function requireSourceAudit(report) {
  const audit = report.source_audit;
  if (!audit || typeof audit !== "object") {
    throw new PublisherError("source_audit_missing", "结构化日报草稿必须包含 source_audit，记录固定发现面和源健康检查结果。");
  }

  const requiredGroups = ["github_trending", "builder_sources", "content_sources", "search_sources", "sources_health"];
  if (String(report.report_date || "") >= "2026-06-11") {
    requiredGroups.splice(1, 0, "huggingface_trending");
    requiredGroups.splice(3, 0, "china_ai_sources");
  }
  for (const groupName of requiredGroups) {
    requireAuditGroup(audit[groupName], `source_audit.${groupName}`);
  }
}

function requireAuditGroup(group, pathName) {
  if (!group || typeof group !== "object") {
    throw new PublisherError("source_audit_incomplete", `${pathName} 缺失。`);
  }
  if (group.checked !== true) {
    throw new PublisherError("source_audit_incomplete", `${pathName}.checked 必须为 true。`);
  }
  if (!Array.isArray(group.sources) || group.sources.length === 0) {
    throw new PublisherError("source_audit_incomplete", `${pathName}.sources 必须至少记录一个已检查来源。`);
  }
  const candidatesFound = Number.isInteger(group.candidates_found) ? group.candidates_found : 0;
  const included = Number.isInteger(group.included) ? group.included : 0;
  if (included > candidatesFound) {
    throw new PublisherError("source_audit_count_inconsistent", `${pathName}.included cannot exceed candidates_found.`, {
      path: pathName,
      candidates_found: candidatesFound,
      included
    });
  }
}

function requireExpandedMainItemFormat(report) {
  const mainItems = Array.isArray(report.main_items) ? report.main_items : [];
  if (mainItems.length < 8) {
    return;
  }

  const bannedMetaPhrases = ["日报跟踪口径", "报道边界", "后续跟进", "反思建议", "对日报的反思"];
  const errors = [];

  mainItems.forEach((item, index) => {
    const bullets = Array.isArray(item.bullets) ? item.bullets.map((bullet) => String(bullet || "").trim()) : [];
    const summary = String(item.summary || "").trim();
    const factLines = [summary, ...bullets].map((line) => line.trim()).filter(Boolean);
    const text = factLines.join("\n");
    if (factLines.length < 2 || factLines.length > 4) {
      errors.push(`main_items[${index}] must contain 2-4 compact factual lines plus title/link`);
    }
    if (!/\*\*[^*]+\*\*/.test(text) && !/==[^=\n]+==/.test(text)) {
      errors.push(`main_items[${index}] missing emphasis`);
    }
    const totalChars = factLines.reduce((sum, line) => sum + line.length, 0);
    if (totalChars < 70) {
      errors.push(`main_items[${index}] summary is too thin`);
    }
    if (/(?:^|\n)\s*(?:(?:==(?:keyword-[^|=]+|tag-[^|=]+)\|(?:影响|留意|变化|落点|判断点|为什么重要)==)|(?:==(?:影响|留意|变化|落点|判断点|为什么重要)==)|(?:影响|留意|变化|落点|判断点|为什么重要))[:：]/u.test(text)) {
      errors.push(`main_items[${index}] contains templated public bullet label`);
    }
    if (/(?:它影响开发者和产品团队能否直接复用官方代码|看仓库活跃度、README、许可证、模型卡|它提示某个产品、平台或服务是否接近可试用|看是否有明确入口、价格、地区、权限|可用它判断是否值得跟进|可用它判断是否需要试用|不直接做 AI 的读者也可用它判断行业风向)/u.test(text)) {
      errors.push(`main_items[${index}] contains generic public template prose`);
    }
    if (/(?:这次放出的信息主要落在|当前公开信息主要落在|公开细节集中在|最有用的公开信息，通常是|当前公开信息主要集中在)/u.test(text)) {
      errors.push(`main_items[${index}] contains generic autodraft prose`);
    }
    const metaPhrase = bannedMetaPhrases.find((phrase) => text.includes(phrase));
    if (metaPhrase) {
      errors.push(`main_items[${index}] contains report-meta phrase: ${metaPhrase}`);
    }
  });

  if (errors.length > 0) {
    throw new PublisherError(
      "main_items_format_weak",
      "Expanded main_items require compact factual summary lines without templated labels, generic watch-next prose, or explanation filler.",
      { errors }
    );
  }
}

function requireHeroHighlightsContract(report) {
  const referenceItems = heroHighlightReferenceItems(report);
  const eligibleReferenceItems = referenceItems.filter((item) => heroHighlightReferenceItemReady(item));
  if (report.report_status === "empty_due_to_network_outage" || eligibleReferenceItems.length < 1) {
    return;
  }

  const highlights = Array.isArray(report.hero_highlights) ? report.hero_highlights : [];
  if (highlights.length === 0) {
    return;
  }
  const errors = [];
  if (highlights.length < 1 || highlights.length > 3) {
    errors.push(`hero_highlights must contain 1 to 3 reader-facing items; found ${highlights.length}`);
  }

  const allowedRefs = new Set();
  for (const item of heroHighlightReferenceItems(report)) {
    if (item?.candidate_id) {
      allowedRefs.add(String(item.candidate_id));
    }
    const url = normalizeUrlForEvidenceGate(item?.url);
    if (url) {
      allowedRefs.add(url);
    }
  }

  highlights.forEach((item, index) => {
    for (const field of ["title", "url", "reason", "what_happened", "why_watch", "category", "source_item_ref"]) {
      if (!String(item?.[field] || "").trim()) {
        errors.push(`hero_highlights[${index}].${field} is required`);
      }
    }
    const ref = String(item?.source_item_ref || "").trim();
    const normalizedRef = normalizeUrlForEvidenceGate(ref) || ref;
    if (ref && !allowedRefs.has(ref) && !allowedRefs.has(normalizedRef)) {
      errors.push(`hero_highlights[${index}].source_item_ref must point to a main_items candidate_id or URL`);
    }
    for (const field of ["reason", "what_happened", "why_watch"]) {
      const text = String(item?.[field] || "");
      if (isWeakHeroHighlightText(text)) {
        errors.push(`hero_highlights[${index}].${field} contains generic template prose`);
      }
    }
  });

  if (errors.length > 0) {
    throw new PublisherError(
      "hero_highlights_contract_failed",
      "Optional hero_highlights must be reader-facing highlight records with result, impact, and a source item reference.",
      { errors }
    );
  }
}

function heroHighlightReferenceItemReady(item) {
  return Boolean(heroHighlightReferenceTitle(item) && normalizeUrlForEvidenceGate(item?.url));
}

function heroHighlightReferenceTitle(item) {
  return String(item?.title || item?.name || item?.repo || item?.organization || "").trim();
}

function heroHighlightReferenceItems(report) {
  return [
    "main_items",
    "github_trending",
    "huggingface_trending",
    "hot_blogs",
    "chinese_media_dynamics",
    "daily_tracking",
    "projects",
    "builder_observations",
    "official_org_updates",
    "community_leads"
  ].flatMap((sectionName) => Array.isArray(report?.[sectionName]) ? report[sectionName] : []);
}

function isWeakHeroHighlightText(value) {
  const text = String(value || "").trim();
  return /发布了一条\s*AI\s*相关更新|原文标题为|published an ai related update|original title|OpenAI News RSS 发布|Anthropic News 发布/i.test(text);
}

function requireChineseGithubTrendingDescriptions(report) {
  const errors = [];
  for (const [index, item] of (Array.isArray(report.github_trending) ? report.github_trending : []).entries()) {
    const description = String(item?.description || "").trim();
    if (description && !hasChineseText(description)) {
      errors.push({
        code: "github_trending_description_not_chinese",
        path: `github_trending[${index}].description`,
        repo: item?.repo || item?.name || "",
        message: "GitHub Trending description must be a Chinese rewrite, not a copied English repo description."
      });
    }
  }

  if (errors.length > 0) {
    throw new PublisherError(
      "github_trending_description_not_chinese",
      "GitHub Trending description 必须中文改写，不能直接复制英文仓库描述。",
      { errors }
    );
  }
}

function hasChineseText(value) {
  return /\p{Script=Han}/u.test(String(value || ""));
}

function requireBuilderXObservation(report, candidatePool) {
  const builderSources = report.source_audit?.builder_sources?.sources || [];
  const checksX = builderSources.some((source) => isFollowBuildersXSource(source) || isXSearchFallbackSource(source));
  if (!checksX) {
    return;
  }

  const hasXObservation = (report.builder_observations || []).some((item) => isXStatusUrl(item.url)) ||
    (candidatePool?.candidates || []).some((candidate) =>
      candidate.status === "included" &&
      candidate.included_in === "builder_observations" &&
      (isXStatusUrl(candidate.url) || isXStatusUrl(candidate.original_url))
    );
  if (hasXObservation) {
    return;
  }

  const sourceState = builderSources
    .filter((source) => isFollowBuildersXSource(source) || isXSearchFallbackSource(source))
    .map((source) => `${source.name}:${source.status}${source.notes ? `:${source.notes}` : ""}`)
    .join(" | ");
  throw new PublisherError(
    "builder_x_observation_missing",
    "Builder 观察必须包含至少一条近期原始 X status；不能在 X 发现失败时只用博客或播客顶替。",
    { sources: sourceState }
  );
}

function isFollowBuildersXSource(source) {
  return /follow-builders x feed/i.test(source?.name || "") || /feed-x\.json/i.test(source?.url || "");
}

function isXSearchFallbackSource(source) {
  return /x builder search/i.test(source?.name || "") || /tavily\.com\/search/i.test(source?.url || "");
}

function isXStatusUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    return (host === "x.com" || host === "twitter.com") && /\/[^/]+\/status\/\d+/i.test(url.pathname);
  } catch {
    return false;
  }
}
