const MAX_FUTURE_SKEW_MS = 24 * 60 * 60 * 1000;

export function compareOccurrenceChronology(left, right) {
  const effectiveDelta = effectiveOccurrenceTimestamp(right) - effectiveOccurrenceTimestamp(left);
  if (effectiveDelta !== 0) return effectiveDelta;
  const publishedDelta = chronologyReportedTimestamp(right, "published_at") - chronologyReportedTimestamp(left, "published_at");
  if (publishedDelta !== 0) return publishedDelta;
  const eventDelta = chronologyReportedTimestamp(right, "event_date") - chronologyReportedTimestamp(left, "event_date");
  if (eventDelta !== 0) return eventDelta;
  const collectedDelta = timestamp(right?.collected_at) - timestamp(left?.collected_at);
  if (collectedDelta !== 0) return collectedDelta;
  return String(left?.id || "").localeCompare(String(right?.id || ""));
}

export function classifyOccurrenceDateAnomaly(item) {
  const collected = timestamp(item?.collected_at);
  if (!collected) return null;
  const reported = Math.max(
    timestamp(item?.published_at),
    timestamp(dateStart(item?.event_date))
  );
  return reported > collected + MAX_FUTURE_SKEW_MS
    ? "future_relative_to_collection"
    : null;
}

export function isOccurrenceChronologySorted(items) {
  return Array.isArray(items) && items.every((item, index) => index === 0 || compareOccurrenceChronology(items[index - 1], item) <= 0);
}

export function effectiveOccurrenceTimestamp(item) {
  if (classifyOccurrenceDateAnomaly(item)) return timestamp(item?.collected_at);
  return timestamp(item?.published_at) || timestamp(dateStart(item?.event_date)) || timestamp(item?.collected_at);
}

function chronologyReportedTimestamp(item, field) {
  if (classifyOccurrenceDateAnomaly(item)) return 0;
  return field === "event_date"
    ? timestamp(dateStart(item?.event_date))
    : timestamp(item?.published_at);
}

function dateStart(value) {
  return value ? `${value}T00:00:00.000Z` : "";
}

function timestamp(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}
