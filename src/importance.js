const IMPORTANCE_ALIASES = new Map([
  ["major", "major"],
  ["high", "major"],
  ["critical", "major"],
  ["重大", "major"],
  ["🔥重大", "major"],
  ["notable", "notable"],
  ["medium", "notable"],
  ["worth_attention", "notable"],
  ["值得关注", "notable"],
  ["⭐值得关注", "notable"],
  ["general", "general"],
  ["low", "general"],
  ["normal", "general"],
  ["一般", "general"],
  ["📌一般", "general"]
]);

const IMPORTANCE_LABELS = {
  major: "重大",
  notable: "值得关注",
  general: "一般"
};

export function normalizeImportance(value) {
  const key = String(value || "").trim().toLowerCase();
  return IMPORTANCE_ALIASES.get(key) || "";
}

export function importanceLabel(value) {
  const normalized = normalizeImportance(value);
  return normalized ? IMPORTANCE_LABELS[normalized] : "";
}

export function importanceTag(item) {
  return importanceLabel(item?.importance);
}

export function withDefaultImportance(sectionName, items) {
  if (!Array.isArray(items)) {
    return [];
  }
  return items.map((item) => ({
    ...item,
    importance: normalizeImportance(item?.importance) || defaultImportanceForSection(sectionName, item)
  }));
}

export function defaultImportanceForSection(sectionName, item = {}) {
  if (sectionName === "main_items") {
    if (item.tier === "T0" || item.tier === "T1") {
      return "major";
    }
    return item.tier === "T2" ? "notable" : "general";
  }
  if (sectionName === "model_releases") {
    return item.release_scope === "provider_official_launch" ? "major" : "notable";
  }
  if (sectionName === "hot_blogs" || sectionName === "chinese_media_dynamics") {
    return "notable";
  }
  if (sectionName === "projects") {
    return item.signal === "product_hunt" || item.signal === "trending" ? "notable" : "general";
  }
  if (sectionName === "github_trending") {
    const rank = Number(item.rank);
    if (Number.isFinite(rank) && rank <= 3 && (item.trend === "new" || item.trend === "up")) {
      return "notable";
    }
    return "general";
  }
  if (sectionName === "huggingface_trending") {
    const rank = Number(item.rank);
    return Number.isFinite(rank) && rank <= 3 ? "notable" : "general";
  }
  if (sectionName === "builder_observations" || sectionName === "official_org_updates") {
    return "notable";
  }
  return "general";
}
