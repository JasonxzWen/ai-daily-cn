import fs from "node:fs/promises";
import path from "node:path";
import { PublisherError } from "./errors.js";
import { defaultGeneratedAt, isValidDateString } from "./time.js";

const STATUS_WEIGHT = {
  hot: 3,
  active: 2,
  watching: 1
};

export async function loadTrendConfig(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const relativeConfigPath = options.configPath || "config/trends.json";
  const configPath = path.resolve(rootDir, relativeConfigPath);
  let raw;
  try {
    raw = await fs.readFile(configPath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new PublisherError("trend_config_missing", `缺少趋势受控词表：${configPath}`, { path: configPath });
    }
    throw new PublisherError("trend_config_unreadable", `趋势受控词表无法读取：${configPath}`, {
      path: configPath,
      cause: error.message
    });
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new PublisherError("trend_config_invalid", `趋势受控词表不是有效 JSON：${configPath}`, {
      path: configPath,
      cause: error.message
    });
  }

  const config = normalizeTrendConfig(parsed);
  if (config.topics.length === 0 || config.entities.length === 0) {
    throw new PublisherError("trend_config_invalid", "趋势受控词表必须同时包含 topics 和 entities。", {
      path: configPath,
      topics: config.topics.length,
      entities: config.entities.length
    });
  }
  return config;
}

export function normalizeTrendConfig(config) {
  const windowDays = positiveInteger(config?.window_days, 7);
  const thresholds = config?.thresholds || {};
  return {
    schema_version: 1,
    window_days: windowDays,
    candidate_window_days: positiveInteger(config?.candidate_window_days, windowDays),
    thresholds: {
      watching: {
        min_occurrences: positiveInteger(thresholds.watching?.min_occurrences, 2),
        min_active_days: positiveInteger(thresholds.watching?.min_active_days, 2)
      },
      active: {
        min_occurrences: positiveInteger(thresholds.active?.min_occurrences, 3),
        min_active_days: positiveInteger(thresholds.active?.min_active_days, 3),
        min_sections_or_entities: positiveInteger(thresholds.active?.min_sections_or_entities, 2)
      },
      hot: {
        min_occurrences: positiveInteger(thresholds.hot?.min_occurrences, 5),
        min_active_days: positiveInteger(thresholds.hot?.min_active_days, 4),
        min_entities: positiveInteger(thresholds.hot?.min_entities, 3),
        min_sections: positiveInteger(thresholds.hot?.min_sections, 3),
        evidence_sections: Array.isArray(thresholds.hot?.evidence_sections)
          ? [...thresholds.hot.evidence_sections].filter(Boolean).sort()
          : ["builder_observations", "github_trending"]
      }
    },
    topics: normalizeControlledList(config?.topics),
    entities: normalizeControlledList(config?.entities),
    stopwords: new Set((Array.isArray(config?.stopwords) ? config.stopwords : []).map(normalizeText).filter(Boolean))
  };
}

export function buildTrendIndex(reports, options = {}) {
  const config = normalizeTrendConfig(options.config || {});
  const orderedReports = [...(Array.isArray(reports) ? reports : [])]
    .filter((report) => isValidDateString(report?.report_date))
    .sort((a, b) => a.report_date.localeCompare(b.report_date));
  const latestDate = options.reportDate || orderedReports.at(-1)?.report_date || "1970-01-01";
  const generatedAt = options.generatedAt || defaultGeneratedAt();
  const occurrences = collectControlledOccurrences(orderedReports, config);
  const currentSummaries = summarizeWindow(occurrences, latestDate, config);
  const currentSummaryById = new Map(currentSummaries.map((summary) => [summary.id, summary]));
  const annotationsByDate = {};

  for (const report of orderedReports) {
    annotationsByDate[report.report_date] = buildDateAnnotations(report, occurrences, config);
  }

  const topics = currentSummaries
    .filter((summary) => summary.status)
    .sort(compareTopicSummaries)
    .map(publicTopicSummary);

  return {
    schema_version: 1,
    generated_at: generatedAt,
    window_days: config.window_days,
    source: {
      report_count: orderedReports.length,
      date_from: subtractDays(latestDate, config.window_days - 1),
      date_to: latestDate
    },
    thresholds: configToPublicThresholds(config.thresholds),
    topics,
    candidate_topics: buildCandidateTopics(orderedReports, config, latestDate),
    annotations_by_date: stableAnnotations(annotationsByDate, currentSummaryById)
  };
}

function collectControlledOccurrences(reports, config) {
  const occurrences = [];
  for (const report of reports) {
    for (const item of reportItems(report)) {
      const text = item.text;
      const entities = matchControlled(config.entities, text, item.entities).map((entity) => entity.label);
      const topics = matchControlled(config.topics, text);
      for (const topic of topics) {
        occurrences.push({
          topic_id: topic.id,
          topic_label: topic.label,
          report_date: report.report_date,
          section: item.section,
          index: item.index,
          entities
        });
      }
    }
  }
  return occurrences;
}

function buildDateAnnotations(report, occurrences, config) {
  const summaries = summarizeWindow(occurrences, report.report_date, config);
  const summaryById = new Map(summaries.map((summary) => [summary.id, summary]));
  const annotations = {
    main_items: buildSectionAnnotations(report, "main_items", summaryById, config),
    github_trending: buildSectionAnnotations(report, "github_trending", summaryById, config)
  };
  return annotations;
}

function buildSectionAnnotations(report, section, summaryById, config) {
  const items = sectionItems(report, section);
  return items
    .map((item, index) => {
      const topicIds = matchControlled(config.topics, itemText(section, item));
      const tags = topicIds
        .map((topic) => summaryById.get(topic.id))
        .filter((summary) => summary?.status === "active" || summary?.status === "hot")
        .sort(compareTopicSummaries)
        .slice(0, 2)
        .map((summary) => trendTag(summary, config.window_days));
      return tags.length > 0 ? { index, tags } : null;
    })
    .filter(Boolean);
}

function summarizeWindow(occurrences, dateTo, config) {
  const start = dateToDay(dateTo) - config.window_days + 1;
  const end = dateToDay(dateTo);
  const byTopic = new Map();

  for (const occurrence of occurrences) {
    const day = dateToDay(occurrence.report_date);
    if (day < start || day > end) {
      continue;
    }
    const summary = byTopic.get(occurrence.topic_id) || {
      id: occurrence.topic_id,
      label: occurrence.topic_label,
      occurrences: 0,
      dateSet: new Set(),
      sectionSet: new Set(),
      entitySet: new Set(),
      reportSet: new Set()
    };
    summary.occurrences += 1;
    summary.dateSet.add(occurrence.report_date);
    summary.sectionSet.add(occurrence.section);
    summary.reportSet.add(occurrence.report_date);
    for (const entity of occurrence.entities) {
      summary.entitySet.add(entity);
    }
    byTopic.set(occurrence.topic_id, summary);
  }

  return [...byTopic.values()].map((summary) => {
    const sections = [...summary.sectionSet].sort();
    const entities = [...summary.entitySet].sort((a, b) => a.localeCompare(b));
    const dates = [...summary.dateSet].sort();
    const publicSummary = {
      id: summary.id,
      label: summary.label,
      status: topicStatus({
        occurrences: summary.occurrences,
        activeDays: dates.length,
        sections,
        entities
      }, config.thresholds),
      occurrences: summary.occurrences,
      active_days: dates.length,
      sections,
      entities,
      dates,
      related_reports: [...summary.reportSet].sort()
    };
    return publicSummary;
  });
}

function topicStatus(summary, thresholds) {
  const hasHotEvidence = summary.sections.some((section) => thresholds.hot.evidence_sections.includes(section));
  // Cross-source breadth: a concept sustained across several distinct lanes is a
  // hot signal even without github/builder evidence or 3+ named entities.
  const hasCrossSourceBreadth = summary.sections.length >= thresholds.hot.min_sections;
  if (
    summary.occurrences >= thresholds.hot.min_occurrences &&
    summary.activeDays >= thresholds.hot.min_active_days &&
    (summary.entities.length >= thresholds.hot.min_entities || hasHotEvidence || hasCrossSourceBreadth)
  ) {
    return "hot";
  }

  if (
    summary.occurrences >= thresholds.active.min_occurrences &&
    summary.activeDays >= thresholds.active.min_active_days &&
    (summary.sections.length >= thresholds.active.min_sections_or_entities ||
      summary.entities.length >= thresholds.active.min_sections_or_entities)
  ) {
    return "active";
  }

  if (
    summary.occurrences >= thresholds.watching.min_occurrences &&
    summary.activeDays >= thresholds.watching.min_active_days
  ) {
    return "watching";
  }

  return "";
}

function publicTopicSummary(summary) {
  return {
    id: summary.id,
    label: summary.label,
    status: summary.status,
    occurrences: summary.occurrences,
    active_days: summary.active_days,
    sections: summary.sections,
    entities: summary.entities,
    dates: summary.dates,
    related_reports: summary.related_reports
  };
}

function trendTag(summary, windowDays) {
  const entities = summary.entities.slice(0, 4);
  return {
    topic_id: summary.id,
    label: summary.label,
    status: summary.status,
    text: `${summary.label}: ${windowDays}d ${summary.occurrences}x/${summary.active_days}d`,
    window_days: windowDays,
    occurrences: summary.occurrences,
    active_days: summary.active_days,
    entities
  };
}

function buildCandidateTopics(reports, config, dateTo) {
  const start = dateToDay(dateTo) - config.candidate_window_days + 1;
  const end = dateToDay(dateTo);
  const controlledAliases = new Set(config.topics.flatMap((topic) => topic.aliases.map(normalizeText)));
  const candidates = new Map();

  for (const report of reports) {
    const day = dateToDay(report.report_date);
    if (day < start || day > end) {
      continue;
    }
    for (const item of reportItems(report)) {
      for (const term of candidateTerms(item.text, config.stopwords)) {
        if (controlledAliases.has(term)) {
          continue;
        }
        const candidate = candidates.get(term) || {
          term,
          occurrences: 0,
          dates: new Set()
        };
        candidate.occurrences += 1;
        candidate.dates.add(report.report_date);
        candidates.set(term, candidate);
      }
    }
  }

  return [...candidates.values()]
    .filter((candidate) => candidate.occurrences >= 2)
    .sort((a, b) => b.occurrences - a.occurrences || b.dates.size - a.dates.size || a.term.localeCompare(b.term))
    .slice(0, 20)
    .map((candidate) => ({
      term: candidate.term,
      occurrences: candidate.occurrences,
      active_days: candidate.dates.size,
      display: false
    }));
}

function reportItems(report) {
  return [
    ...sectionItems(report, "main_items").map((item, index) => ({
      section: "main_items",
      index,
      text: itemText("main_items", item),
      entities: Array.isArray(item.entities) ? item.entities : []
    })),
    ...sectionItems(report, "github_trending").map((item, index) => ({
      section: "github_trending",
      index,
      text: itemText("github_trending", item),
      entities: []
    })),
    ...sectionItems(report, "projects").map((item, index) => ({
      section: "projects",
      index,
      text: itemText("projects", item),
      entities: []
    })),
    ...sectionItems(report, "builder_observations").map((item, index) => ({
      section: "builder_observations",
      index,
      text: itemText("builder_observations", item),
      entities: []
    })),
    ...sectionItems(report, "hot_blogs").map((item, index) => ({
      section: "hot_blogs",
      index,
      text: itemText("hot_blogs", item),
      entities: []
    })),
    ...sectionItems(report, "model_releases").map((item, index) => ({
      section: "model_releases",
      index,
      text: itemText("model_releases", item),
      entities: [item.provider].filter(Boolean)
    }))
  ];
}

function sectionItems(report, section) {
  return Array.isArray(report?.[section]) ? report[section] : [];
}

function itemText(section, item) {
  if (!item || typeof item !== "object") {
    return "";
  }
  if (section === "main_items") {
    return [
      item.title,
      item.summary,
      ...(Array.isArray(item.bullets) ? item.bullets : []),
      ...(Array.isArray(item.entities) ? item.entities : [])
    ].join(" ");
  }
  if (section === "github_trending") {
    return [item.name, item.repo, item.description, item.language, item.evidence].join(" ");
  }
  if (section === "projects") {
    return [item.name, item.description, item.use_case, item.evidence, ...(Array.isArray(item.domains) ? item.domains : [])].join(" ");
  }
  if (section === "builder_observations") {
    return [item.author, item.role, item.content, item.source, item.evidence].join(" ");
  }
  if (section === "hot_blogs") {
    return [item.title, item.publisher, item.author, item.topic, item.summary, item.why_it_matters].join(" ");
  }
  if (section === "model_releases") {
    return [item.name, item.provider, item.summary, item.notes].join(" ");
  }
  return Object.values(item).filter((value) => typeof value === "string").join(" ");
}

function matchControlled(items, text, explicitValues = []) {
  const normalized = ` ${normalizeText([text, ...explicitValues].join(" "))} `;
  return items.filter((item) => item.aliases.some((alias) => alias && normalized.includes(` ${alias} `)));
}

function normalizeControlledList(items) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => item?.id && item?.label)
    .map((item) => ({
      id: String(item.id),
      label: String(item.label),
      aliases: unique([item.label, item.id, ...(Array.isArray(item.aliases) ? item.aliases : [])].map(normalizeText))
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[_/.-]+/g, " ")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function candidateTerms(text, stopwords) {
  const tokens = normalizeText(text)
    .split(" ")
    .filter((token) => token.length >= 3 && !stopwords.has(token) && !/^\d+$/.test(token));
  const terms = new Set();
  for (let index = 0; index < tokens.length; index += 1) {
    terms.add(tokens[index]);
    if (tokens[index + 1]) {
      const phrase = `${tokens[index]} ${tokens[index + 1]}`;
      if (!stopwords.has(phrase)) {
        terms.add(phrase);
      }
    }
  }
  return [...terms];
}

function stableAnnotations(annotationsByDate) {
  return Object.fromEntries(
    Object.entries(annotationsByDate)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, annotations]) => [
        date,
        {
          main_items: sortAnnotations(annotations.main_items),
          github_trending: sortAnnotations(annotations.github_trending)
        }
      ])
  );
}

function sortAnnotations(items) {
  return [...items].sort((a, b) => a.index - b.index);
}

function compareTopicSummaries(left, right) {
  return (
    (STATUS_WEIGHT[right.status] || 0) - (STATUS_WEIGHT[left.status] || 0) ||
    right.active_days - left.active_days ||
    right.occurrences - left.occurrences ||
    left.id.localeCompare(right.id)
  );
}

function configToPublicThresholds(thresholds) {
  return {
    watching: { ...thresholds.watching },
    active: { ...thresholds.active },
    hot: { ...thresholds.hot }
  };
}

function positiveInteger(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function dateToDay(date) {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400000);
}

function subtractDays(date, days) {
  const value = new Date(Date.parse(`${date}T00:00:00Z`));
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}
