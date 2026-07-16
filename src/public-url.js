import { isIP } from "node:net";

const TRACKING_QUERY_RE = /^(?:utm_.+|fbclid|gclid|mc_cid|mc_eid)$/i;
const SENSITIVE_QUERY_RE = /^(?:access[_-]?token|api[_-]?key|auth(?:orization)?|client[_-]?secret|code|credential|key|pass(?:word|wd)?|secret|sig(?:nature)?|token|x-amz-(?:credential|security-token|signature)|x-goog-(?:credential|signature))$/i;

export function sanitizePublicHttpUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    if (!isPublicNetworkHost(url.hostname)) return "";
    url.username = "";
    url.password = "";
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_QUERY_RE.test(key) || SENSITIVE_QUERY_RE.test(key)) {
        url.searchParams.delete(key);
      }
    }
    url.searchParams.sort();
    return url.toString();
  } catch {
    return "";
  }
}

export function isSafePublicHttpUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    if (!isPublicNetworkHost(url.hostname)) return false;
    if (url.username || url.password || url.hash) return false;
    for (const key of url.searchParams.keys()) {
      if (TRACKING_QUERY_RE.test(key) || SENSITIVE_QUERY_RE.test(key)) return false;
    }
    url.searchParams.sort();
    return url.toString() === String(value);
  } catch {
    return false;
  }
}

export function hasUnsafePublicHttpUrlMaterial(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "http:" && url.protocol !== "https:") return true;
    if (!isPublicNetworkHost(url.hostname)) return true;
    if (url.username || url.password) return true;
    if (url.hash) return true;
    return [...url.searchParams.keys()].some((key) => SENSITIVE_QUERY_RE.test(key));
  } catch {
    return true;
  }
}

export function canonicalPublicUrlIdentity(value) {
  const sanitized = sanitizePublicHttpUrl(value);
  if (!sanitized) return "";
  const url = new URL(sanitized);
  if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
  url.hostname = url.hostname.toLowerCase();
  url.searchParams.sort();
  return url.toString();
}

export function urlHostMatches(value, domain, options = {}) {
  let host;
  try {
    host = new URL(String(value || "")).hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  } catch {
    return false;
  }
  const expected = String(domain || "")
    .trim()
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/\.$/, "");
  if (!expected || !/^[a-z0-9.-]+$/.test(expected)) return false;
  return host === expected || (options.allowSubdomains !== false && host.endsWith(`.${expected}`));
}

export function isPublicNetworkHost(value) {
  const host = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return false;
  }
  const version = isIP(host);
  if (version === 4) return isPublicIpv4(host);
  if (version === 6) return isPublicIpv6(host);
  return host.includes(".");
}

export function isSensitivePrivateNetworkHost(value) {
  const host = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
  const version = isIP(host);
  if (version > 0) return !isPublicNetworkHost(host);
  return host.endsWith(".internal") || host.endsWith(".local");
}

function isPublicIpv4(value) {
  const [first, second] = value.split(".").map(Number);
  if (first === 0 || first === 10 || first === 127 || first >= 224) return false;
  if (first === 100 && second >= 64 && second <= 127) return false;
  if (first === 169 && second === 254) return false;
  if (first === 172 && second >= 16 && second <= 31) return false;
  if (first === 192 && (second === 0 || second === 168)) return false;
  if (first === 198 && (second === 18 || second === 19)) return false;
  return true;
}

function isPublicIpv6(value) {
  const groups = parseIpv6Groups(value);
  if (!groups) return false;
  const firstGroup = groups[0];
  if (groups.slice(0, 6).every((group) => group === 0)) return false;
  if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff) return false;
  if ((firstGroup & 0xfe00) === 0xfc00) return false;
  if ((firstGroup & 0xffc0) === 0xfe80) return false;
  if ((firstGroup & 0xffc0) === 0xfec0) return false;
  if ((firstGroup & 0xff00) === 0xff00) return false;
  return true;
}

function parseIpv6Groups(value) {
  let address = String(value || "").toLowerCase();
  if (address.includes(".")) {
    const separator = address.lastIndexOf(":");
    const octets = address.slice(separator + 1).split(".").map(Number);
    if (separator < 0 || octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
      return null;
    }
    address = `${address.slice(0, separator + 1)}${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
  }
  const halves = address.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null;
  const groups = [
    ...left,
    ...Array(Math.max(0, missing)).fill("0"),
    ...right
  ].map((group) => Number.parseInt(group, 16));
  return groups.length === 8 && groups.every((group) => Number.isInteger(group) && group >= 0 && group <= 0xffff)
    ? groups
    : null;
}
