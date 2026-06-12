import { CACHED_DOMAIN_ICONS, CACHED_SOURCE_ICONS } from "./source-icon-cache.js";

const GITHUB_HOSTS = new Set([
  "github.com",
  "gist.github.com",
  "raw.githubusercontent.com"
]);

const FALLBACK_COLORS = [
  "#2f5bea",
  "#0f766e",
  "#b45309",
  "#7c3aed",
  "#be123c",
  "#2563eb",
  "#047857",
  "#9333ea"
];

export function resolveLinkIcon(url, options = {}) {
  const label = String(options.label || "").trim();
  const explicitIcon = String(options.icon || options.sourceIcon || "").trim();
  if (explicitIcon) {
    return iconResult({
      icon: explicitIcon,
      host: normalizeHost(url),
      key: label || normalizeHost(url) || "explicit",
      source: "explicit",
      reason: "explicit_source_icon",
      fallback: false
    });
  }

  const host = normalizeHost(url);
  if (GITHUB_HOSTS.has(host)) {
    const icon = CACHED_DOMAIN_ICONS["github.com"] || CACHED_SOURCE_ICONS["GitHub Trending daily"];
    return iconResult({
      icon,
      host,
      key: "github.com",
      source: "domain-cache",
      reason: "github_unified_icon",
      fallback: false
    });
  }

  const sourceIcon = sourceIconForLabel(label);
  if (sourceIcon) {
    return iconResult({
      icon: sourceIcon,
      host,
      key: label,
      source: "source-cache",
      reason: "source_icon_cache",
      fallback: false
    });
  }

  const domainIcon = domainIconForHost(host);
  if (domainIcon) {
    return iconResult({
      icon: domainIcon,
      host,
      key: host,
      source: "domain-cache",
      reason: "domain_icon_cache",
      fallback: false
    });
  }

  if (options.allowGeneratedFallback === false) {
    return iconResult({
      icon: "",
      host,
      key: host || label || "unknown",
      source: "none",
      reason: "missing_cached_icon",
      fallback: true
    });
  }

  const key = host || label || "unknown";
  return iconResult({
    icon: generatedSiteIcon(siteInitials(label || host || "?"), siteColor(key), "#ffffff"),
    host,
    key,
    source: "generated",
    reason: "generated_initials_fallback",
    fallback: true
  });
}

export function normalizeHost(url) {
  try {
    const host = new URL(String(url || "")).hostname.toLowerCase();
    return host.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function sourceIconForLabel(label) {
  if (!label) {
    return "";
  }
  return CACHED_SOURCE_ICONS[label] || CACHED_SOURCE_ICONS[canonicalSourceLabel(label)] || "";
}

function domainIconForHost(host) {
  if (!host) {
    return "";
  }
  if (CACHED_DOMAIN_ICONS[host]) {
    return CACHED_DOMAIN_ICONS[host];
  }
  const parts = host.split(".");
  while (parts.length > 2) {
    parts.shift();
    const parent = parts.join(".");
    if (CACHED_DOMAIN_ICONS[parent]) {
      return CACHED_DOMAIN_ICONS[parent];
    }
  }
  return "";
}

function canonicalSourceLabel(label) {
  return String(label || "")
    .replace(/\s+RSS$/i, "")
    .replace(/\s+Feed$/i, " feed")
    .trim();
}

function iconResult(result) {
  return {
    icon: result.icon || "",
    host: result.host || "",
    key: result.key || result.host || "",
    source: result.source || "",
    reason: result.reason || "",
    fallback: Boolean(result.fallback)
  };
}

function siteInitials(label) {
  const text = String(label || "").trim();
  if (!text) {
    return "?";
  }
  const words = text.split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }
  return text.slice(0, 2).toUpperCase();
}

function siteColor(value) {
  const text = String(value || "x");
  let hash = 0;
  for (const char of text) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length];
}

function generatedSiteIcon(initials, background, foreground) {
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">`,
    `<rect width="64" height="64" rx="14" fill="${escapeXml(background)}"/>`,
    `<text x="32" y="39" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="22" font-weight="700" fill="${escapeXml(foreground)}">${escapeXml(initials)}</text>`,
    `</svg>`
  ].join("");
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
