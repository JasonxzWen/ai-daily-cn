import { createHash } from "node:crypto";
import {
  normalizeOfficialComponentSnapshot,
  officialSnapshotForInteraction
} from "./official-component-snapshot.js";

const OPENROUTER_SELECTOR_VERSION = "openrouter-rankings-v1";
const ARTIFICIAL_ANALYSIS_SELECTOR_VERSION = "artificial-analysis-index-v1";
const SWE_BENCH_PRO_SELECTOR_VERSION = "swe-bench-pro-v1";

const AA_TABS = [
  ["score", "Score", "score_table"],
  ["token-usage", "Token Usage", "stacked_bar"],
  ["cost", "Cost", "stacked_bar"],
  ["score-vs-token-usage", "Score vs. Token Usage", "scatter"],
  ["score-vs-cost", "Score vs. Cost", "scatter"],
  ["score-vs-compute", "Score vs. Compute", "scatter"]
];

export function attachTrackingComponentSnapshots(report) {
  if (!report || typeof report !== "object") {
    return report;
  }
  const next = structuredClone(report);
  if (!Array.isArray(next.daily_tracking)) {
    return next;
  }
  next.daily_tracking = next.daily_tracking.map((item) => {
    if (!item || typeof item !== "object") {
      return item;
    }
    if (item.tracking_component_snapshot) {
      return item;
    }
    const trackingComponentSnapshot = buildTrackingComponentSnapshot(item);
    return trackingComponentSnapshot
      ? { ...item, tracking_component_snapshot: trackingComponentSnapshot }
      : item;
  });
  return next;
}

export function buildTrackingComponentSnapshot(item, options = {}) {
  if (!item || typeof item !== "object") {
    return null;
  }
  const snapshot = item.snapshot;
  if (!snapshot || typeof snapshot !== "object") {
    return null;
  }
  if (isOpenRouterItem(item, snapshot)) {
    return buildOpenRouterSnapshot(item, snapshot, options);
  }
  if (isArtificialAnalysisItem(item, snapshot)) {
    return buildArtificialAnalysisSnapshot(item, snapshot, options);
  }
  if (isSweBenchProItem(item, snapshot)) {
    return buildSweBenchProSnapshot(item, snapshot, options);
  }
  return null;
}

export function trackingComponentForInteraction(item) {
  const snapshot = sanitizeTrackingComponentSnapshot(item?.tracking_component_snapshot || buildTrackingComponentSnapshot(item));
  if (!snapshot || typeof snapshot !== "object") {
    return null;
  }
  const officialSnapshot = officialSnapshotForInteraction(snapshot.official_component_snapshot);
  if (requiresOfficialSnapshot(snapshot) && snapshot.official_component_snapshot && !officialSnapshot) {
    return null;
  }
  return {
    kind: snapshot.component_kind,
    source: snapshot.source,
    sourceUrl: snapshot.source_url,
    collectedAt: snapshot.collected_at,
    ...(officialSnapshot ? { officialSnapshot } : {}),
    tabs: (snapshot.tabs || []).map((tab) => ({
      id: tab.id,
      label: tab.label,
      view: tab.view,
      status: tab.status,
      fallbackReason: tab.fallback_reason || ""
    })),
    series: (snapshot.series || []).map((series) => ({
      id: series.id,
      tabId: series.tab_id,
      label: series.label,
      chart: series.chart,
      fallbackReason: series.fallback_reason || "",
      rows: (series.rows || []).map(rowForInteraction)
    })),
    rows: (snapshot.rows || []).map(rowForInteraction),
    trace: {
      sourceUrl: snapshot.public_trace?.source_url || snapshot.source_url,
      collectedAt: snapshot.public_trace?.collected_at || snapshot.collected_at,
      selectorVersion: snapshot.public_trace?.selector_version || snapshot.selector_version,
      dataHash: snapshot.public_trace?.data_hash || snapshot.data_hash,
      rawDomHash: snapshot.raw_dom_hash,
      cacheStatus: snapshot.public_trace?.cache_status || "live",
      fallbackReason: snapshot.public_trace?.fallback_reason || snapshot.fallback_reason || "",
      topRows: (snapshot.public_trace?.top_rows || snapshot.rows || []).map(rowForInteraction),
      diff: snapshot.public_trace?.diff || snapshot.diff || {}
    }
  };
}

export function sanitizeTrackingComponentSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") {
    return snapshot;
  }
  if (snapshot.component_kind !== "artificial_analysis_index") {
    return snapshot;
  }
  const next = structuredClone(snapshot);
  const series = (Array.isArray(next.series) ? next.series : [])
    .filter((entry) => Array.isArray(entry?.rows) && entry.rows.length > 0)
    .map((entry) => ({ ...entry, fallback_reason: "" }));
  const tabIdsWithRows = new Set(series.map((entry) => entry.tab_id).filter(Boolean));
  const tabs = (Array.isArray(next.tabs) ? next.tabs : [])
    .filter((entry) => tabIdsWithRows.has(entry?.id))
    .map((entry) => ({ ...entry, status: entry.status === "fallback" ? "partial" : entry.status, fallback_reason: "" }));
  next.series = series;
  next.tabs = tabs;
  return next;
}

export function hasInvalidOfficialTrackingSnapshot(item) {
  const snapshot = item?.tracking_component_snapshot || item?.snapshot;
  const official = snapshot?.official_component_snapshot || item?.snapshot?.official_component_snapshot;
  if (!official) {
    return false;
  }
  const componentKind = snapshot?.component_kind || official?.component_kind || snapshotKindFromItem(item);
  if (!requiresOfficialSnapshot({ component_kind: componentKind })) {
    return false;
  }
  return !officialSnapshotForInteraction(official);
}

function buildOpenRouterSnapshot(item, snapshot, options) {
  const rows = normalizedSnapshotRows(snapshot);
  const historyRows = normalizedOpenRouterHistoryRows(snapshot);
  const officialComponentSnapshot = normalizeOfficialComponentSnapshot(snapshot.official_component_snapshot, {
    componentKind: "openrouter_rankings",
    sourceUrl: snapshot.source_url || item.url,
    capturedAt: snapshot.snapshot_as_of,
    selectorVersion: OPENROUTER_SELECTOR_VERSION
  });
  const status = rows.length >= 10 && snapshot.snapshot_status === "complete" ? "complete" : rows.length > 0 ? "partial" : "fallback";
  const fallbackReason = rows.length > 0 ? "" : "openrouter_rows_missing";
  const tabs = [
    tab("top-models", "Top Models", "stacked_bar", historyRows.length > 0 ? "complete" : status, fallbackReason),
    tab("leaderboard", "LLM Leaderboard", "leaderboard", status, fallbackReason)
  ];
  const series = [
    {
      id: "openrouter-top-models-weekly-usage",
      tab_id: "top-models",
      label: "Weekly usage across OpenRouter",
      chart: "stacked_bar",
      rows: (historyRows.length > 0 ? historyRows : rows).map((row) => ({
        ...row,
        label: row.model,
        value_label: row.value_label || row.tokens
      })),
      fallback_reason: fallbackReason
    },
    {
      id: "openrouter-llm-leaderboard",
      tab_id: "leaderboard",
      label: "LLM Leaderboard",
      chart: "leaderboard",
      rows,
      fallback_reason: fallbackReason
    }
  ];
  return componentSnapshot({
    source: "OpenRouter",
    componentKind: "openrouter_rankings",
    selectorVersion: OPENROUTER_SELECTOR_VERSION,
    sourceUrl: snapshot.source_url || item.url,
    collectedAt: snapshot.snapshot_as_of,
    rows,
    tabs,
    series,
    cachePath: options.cachePath || "",
    fallbackReason,
    officialComponentSnapshot
  });
}

function buildArtificialAnalysisSnapshot(item, snapshot, options) {
  const officialComponentSnapshot = normalizeOfficialComponentSnapshot(snapshot.official_component_snapshot, {
    componentKind: "artificial_analysis_index",
    sourceUrl: snapshot.source_url || item.url,
    capturedAt: snapshot.snapshot_as_of,
    selectorVersion: ARTIFICIAL_ANALYSIS_SELECTOR_VERSION
  });
  if (!officialComponentSnapshot) {
    return null;
  }
  const scoreRows = normalizedSnapshotRows(snapshot).map((row) => ({
    ...row,
    metric: "AA Index",
    score: row.value,
    value_label: row.value_label || row.tokens
  }));
  const sourceTabs = normalizeArtificialAnalysisSourceTabs(snapshot.component_tabs, scoreRows);
  const hasScoreRows = scoreRows.length > 0;
  const collectedTabs = AA_TABS
    .map(([id, label, view]) => ({
      id,
      label,
      view,
      rows: rowsForArtificialAnalysisTab(sourceTabs, id, scoreRows)
    }))
    .filter((entry) => entry.rows.length > 0);
  const tabs = collectedTabs.map((entry) =>
    tab(entry.id, entry.label, entry.view, snapshot.snapshot_status === "complete" ? "complete" : "partial", "")
  );
  const series = collectedTabs.map((entry) => ({
    id: `artificial-analysis-${entry.id}`,
    tab_id: entry.id,
    label: entry.label,
    chart: entry.view,
    rows: entry.rows,
    fallback_reason: ""
  }));
  const fallbackReason = hasScoreRows ? "" : "artificial_analysis_rows_missing";
  return componentSnapshot({
    source: "Artificial Analysis",
    componentKind: "artificial_analysis_index",
    selectorVersion: ARTIFICIAL_ANALYSIS_SELECTOR_VERSION,
    sourceUrl: snapshot.source_url || item.url,
    collectedAt: snapshot.snapshot_as_of,
    rows: scoreRows,
    tabs,
    series,
    cachePath: options.cachePath || "",
    fallbackReason,
    officialComponentSnapshot
  });
}

function buildSweBenchProSnapshot(item, snapshot, options) {
  const officialComponentSnapshot = normalizeOfficialComponentSnapshot(snapshot.official_component_snapshot, {
    componentKind: "swe_bench_pro",
    sourceUrl: snapshot.source_url || item.url,
    capturedAt: snapshot.snapshot_as_of,
    selectorVersion: SWE_BENCH_PRO_SELECTOR_VERSION
  });
  if (!officialComponentSnapshot) {
    return null;
  }
  const rows = normalizedSnapshotRows(snapshot).map((row) => ({
    ...row,
    metric: "Resolve Rate",
    value_label: row.value_label || row.tokens
  }));
  const status = rows.length >= 10 && snapshot.snapshot_status === "complete" ? "complete" : rows.length > 0 ? "partial" : "fallback";
  const fallbackReason = rows.length > 0 ? "" : "swe_bench_pro_rows_missing";
  const tabs = [
    tab("leaderboard", "Public Leaderboard", "leaderboard", status, fallbackReason)
  ];
  const series = [
    {
      id: "swe-bench-pro-public-leaderboard",
      tab_id: "leaderboard",
      label: "SWE-Bench Pro Public Dataset",
      chart: "leaderboard",
      rows,
      fallback_reason: fallbackReason
    }
  ];
  return componentSnapshot({
    source: "Scale Labs SWE-Bench Pro",
    componentKind: "swe_bench_pro",
    selectorVersion: SWE_BENCH_PRO_SELECTOR_VERSION,
    sourceUrl: snapshot.source_url || item.url,
    collectedAt: snapshot.snapshot_as_of,
    rows,
    tabs,
    series,
    cachePath: options.cachePath || "",
    fallbackReason,
    officialComponentSnapshot
  });
}

function requiresOfficialSnapshot(snapshot) {
  return snapshot?.component_kind === "openrouter_rankings" ||
    snapshot?.component_kind === "artificial_analysis_index" ||
    snapshot?.component_kind === "swe_bench_pro";
}

function snapshotKindFromItem(item) {
  const text = `${item?.id || ""} ${item?.name || ""} ${item?.source || ""} ${item?.snapshot?.type || ""}`.toLowerCase();
  if (text.includes("openrouter")) return "openrouter_rankings";
  if (text.includes("artificial") || text.includes("intelligence_index")) return "artificial_analysis_index";
  if (text.includes("swe") || text.includes("scale")) return "swe_bench_pro";
  return "";
}

function componentSnapshot({
  source,
  componentKind,
  selectorVersion,
  sourceUrl,
  collectedAt,
  rows,
  tabs,
  series,
  cachePath,
  fallbackReason,
  officialComponentSnapshot
}) {
  const normalizedRows = rows.map((row) => normalizeComponentRow(row)).filter(Boolean);
  const payloadForHash = {
    component_kind: componentKind,
    source_url: sourceUrl,
    collected_at: collectedAt,
    tabs,
    series,
    rows: normalizedRows
  };
  const dataHash = hashJson(payloadForHash);
  const rawDomHash = hashJson({
    source,
    source_url: sourceUrl,
    selector_version: selectorVersion,
    rows: normalizedRows
  });
  const diff = {
    status: "first_snapshot",
    summary: "No previous component snapshot was available for comparison.",
    changed_rows: [],
    new_entries: normalizedRows.map((row) => row.model).filter(Boolean).slice(0, 10)
  };
  return {
    source,
    component_kind: componentKind,
    source_url: sourceUrl,
    collected_at: collectedAt || new Date().toISOString(),
    selector_version: selectorVersion,
    raw_dom_hash: rawDomHash,
    data_hash: dataHash,
    tabs,
    series: series.map((item) => ({
      id: item.id,
      tab_id: item.tab_id,
      label: item.label,
      chart: item.chart,
      rows: (item.rows || []).map((row) => normalizeComponentRow(row)).filter(Boolean),
      fallback_reason: item.fallback_reason || ""
    })),
    rows: normalizedRows,
    previous_snapshot: null,
    diff,
    cache_path: cachePath || "",
    fallback_reason: fallbackReason || "",
    ...(officialComponentSnapshot ? { official_component_snapshot: officialComponentSnapshot } : {}),
    public_trace: {
      source_url: sourceUrl,
      collected_at: collectedAt || new Date().toISOString(),
      selector_version: selectorVersion,
      data_hash: dataHash,
      top_rows: normalizedRows.slice(0, 10).map(publicTraceRow),
      diff,
      cache_status: cachePath ? "cache" : "live",
      fallback_reason: fallbackReason || ""
    }
  };
}

function normalizedSnapshotRows(snapshot) {
  return (Array.isArray(snapshot?.top_entries) ? snapshot.top_entries : [])
    .map((entry, index) => {
      const tokens = String(entry?.tokens || entry?.value || "").trim();
      const value = parseNumericValue(tokens);
      return normalizeComponentRow({
        rank: Number(entry?.rank) || index + 1,
        model: String(entry?.model || entry?.name || "").trim(),
        provider: String(entry?.provider || "").trim(),
        value,
        value_label: tokens,
        tokens,
        change: String(entry?.change || "").trim(),
        url: isHttpUrl(entry?.url) ? entry.url : undefined
      });
    })
    .filter(Boolean);
}

function normalizedOpenRouterHistoryRows(snapshot) {
  const topProviderByModel = new Map((snapshot?.top_entries || []).map((entry) => [normalizeModelKey(entry.model), entry.provider || ""]));
  return (Array.isArray(snapshot?.history_entries) ? snapshot.history_entries : [])
    .map((entry, index) => normalizeComponentRow({
      rank: Number(entry?.rank) || index + 1,
      model: String(entry?.model || "").trim(),
      provider: String(entry?.provider || topProviderByModel.get(normalizeModelKey(entry?.model)) || "").trim(),
      value: parseNumericValue(entry?.tokens || entry?.value_label || entry?.value || ""),
      value_label: String(entry?.tokens || entry?.value_label || "").trim(),
      tokens: String(entry?.tokens || entry?.value_label || "").trim(),
      change: String(entry?.change || entry?.week || "").trim(),
      metric: String(entry?.week || entry?.date || "").trim()
    }))
    .filter(Boolean);
}

function normalizeArtificialAnalysisSourceTabs(componentTabs, scoreRows) {
  if (!componentTabs || typeof componentTabs !== "object") {
    return {};
  }
  const scoreByModel = new Map(scoreRows.map((row) => [normalizeModelKey(row.model), row]));
  const out = {};
  for (const [key, value] of Object.entries(componentTabs)) {
    const rows = Array.isArray(value?.rows)
      ? value.rows.map((row, index) => {
          const score = scoreByModel.get(normalizeModelKey(row?.model));
          return normalizeComponentRow({
            rank: Number(row?.rank) || Number(score?.rank) || index + 1,
            model: String(row?.model || score?.model || "").trim(),
            provider: String(row?.provider || score?.provider || "").trim(),
            value: Number(row?.value ?? row?.score ?? parseNumericValue(row?.value_label || row?.tokens || "")),
            value_label: String(row?.value_label || row?.tokens || "").trim(),
            change: String(row?.change || "").trim(),
            metric: String(row?.metric || "").trim(),
            secondary_value: row?.secondary_value,
            secondary_value_label: row?.secondary_value_label,
            segments: row?.segments
          });
        }).filter(Boolean)
      : [];
    if (rows.length > 0) {
      out[key] = rows;
    }
  }
  return out;
}

function rowsForArtificialAnalysisTab(sourceTabs, tabId, scoreRows) {
  const key = tabId.replaceAll("-", "_");
  if (tabId === "score") {
    return sourceTabs.score?.length > 0 ? sourceTabs.score : scoreRows;
  }
  return sourceTabs[key] || [];
}

function normalizeComponentRow(row) {
  if (!row || typeof row !== "object") {
    return null;
  }
  const rank = Number(row.rank);
  const model = String(row.model || row.label || "").trim();
  const provider = String(row.provider || "").trim();
  const value = Number(row.value ?? row.score ?? parseNumericValue(row.tokens || row.value_label || ""));
  const valueLabel = String(row.value_label || row.valueLabel || row.tokens || (Number.isFinite(value) ? String(value) : "")).trim();
  if (!model && !valueLabel) {
    return null;
  }
  return {
    rank: Number.isInteger(rank) && rank > 0 ? rank : 1,
    model: model || valueLabel,
    provider,
    value: Number.isFinite(value) ? value : 0,
    value_label: valueLabel,
    change: String(row.change || "").trim(),
    ...(row.metric ? { metric: String(row.metric) } : {}),
    ...(row.secondary_value !== undefined && Number.isFinite(Number(row.secondary_value)) ? { secondary_value: Number(row.secondary_value) } : {}),
    ...(row.secondary_value_label ? { secondary_value_label: String(row.secondary_value_label) } : {}),
    ...(row.segments && typeof row.segments === "object" ? { segments: normalizeSegments(row.segments) } : {}),
    ...(isHttpUrl(row.url) ? { url: row.url } : {})
  };
}

function rowForInteraction(row) {
  return {
    rank: row.rank,
    model: row.model,
    label: row.label || row.model,
    provider: row.provider || "",
    value: row.value,
    valueLabel: row.valueLabel || row.value_label || "",
    change: row.change || "",
    ...(row.metric ? { metric: row.metric } : {}),
    ...(row.secondary_value !== undefined ? { secondaryValue: row.secondary_value } : {}),
    ...(row.secondary_value_label ? { secondaryValueLabel: row.secondary_value_label } : {}),
    ...(row.segments ? { segments: row.segments } : {}),
    ...(row.url ? { url: row.url } : {})
  };
}

function publicTraceRow(row) {
  return {
    rank: row.rank,
    model: row.model,
    provider: row.provider || "",
    value_label: row.value_label || "",
    change: row.change || ""
  };
}

function tab(id, label, view, status, fallbackReason) {
  return {
    id,
    label,
    view,
    status,
    fallback_reason: fallbackReason || ""
  };
}

function hashJson(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(stableValue(value))).digest("hex")}`;
}

function stableValue(value) {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.keys(value)
    .sort()
    .reduce((acc, key) => {
      acc[key] = stableValue(value[key]);
      return acc;
    }, {});
}

function parseNumericValue(value) {
  const text = String(value || "").replace(/,/g, "").trim();
  const match = text.match(/(\d+(?:\.\d+)?)\s*([TGMK])?/i);
  if (!match) {
    return 0;
  }
  const amount = Number(match[1]);
  const unit = String(match[2] || "").toUpperCase();
  const multiplier = unit === "T" ? 1_000_000_000_000 : unit === "G" ? 1_000_000_000 : unit === "M" ? 1_000_000 : unit === "K" ? 1_000 : 1;
  return Number.isFinite(amount) ? amount * multiplier : 0;
}

function normalizeSegments(segments) {
  return Object.fromEntries(Object.entries(segments)
    .map(([key, value]) => [String(key), String(value || "").trim()])
    .filter(([, value]) => value));
}

function normalizeModelKey(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function isOpenRouterItem(item, snapshot) {
  const text = `${item.id || ""} ${item.name || ""} ${item.source || ""} ${snapshot.type || ""}`.toLowerCase();
  return text.includes("openrouter");
}

function isArtificialAnalysisItem(item, snapshot) {
  const text = `${item.id || ""} ${item.name || ""} ${item.source || ""} ${snapshot.type || ""}`.toLowerCase();
  return text.includes("artificial") || text.includes("aa index");
}

function isSweBenchProItem(item, snapshot) {
  const text = `${item.id || ""} ${item.name || ""} ${item.source || ""} ${snapshot.type || ""}`.toLowerCase();
  return text.includes("swe-bench") || text.includes("swe_bench") || text.includes("scale labs");
}

function isHttpUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
