const GITHUB_SOURCE_LEVELS = new Set(["github", "official_open_source_account"]);
const GITHUB_RESERVED_ROOTS = new Set([
  "about",
  "collections",
  "enterprise",
  "events",
  "features",
  "login",
  "marketplace",
  "notifications",
  "orgs",
  "pricing",
  "search",
  "settings",
  "sponsors",
  "topics",
  "trending",
  "users"
]);

export function applyDirectPrimaryTargetVerification(candidate = {}) {
  const target = directPrimaryTarget(candidate);
  if (!target) {
    return candidate;
  }
  const canonicalUrl = String(candidate.url || "").trim();
  candidate.source_level = target.source_level;
  candidate.verification_status = "primary_confirmed";
  candidate.primary_url = canonicalUrl;
  candidate.verification_sources = uniqueUrls([
    ...(Array.isArray(candidate.verification_sources) ? candidate.verification_sources : []),
    canonicalUrl
  ]);
  return candidate;
}

export function effectiveCandidateVerification(candidate = {}) {
  return applyDirectPrimaryTargetVerification({
    ...candidate,
    ...(Array.isArray(candidate.verification_sources)
      ? { verification_sources: [...candidate.verification_sources] }
      : {})
  });
}

export function isDirectPrimaryPublicationUrl(candidate = {}) {
  return directPrimaryTarget(candidate)?.kind === "paper";
}

function directPrimaryTarget(candidate) {
  let parsed;
  let pathname;
  try {
    parsed = new URL(String(candidate?.url || ""));
    pathname = decodeURIComponent(parsed.pathname).replace(/\/+$/, "") || "/";
  } catch {
    return null;
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    return null;
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
  if (isCanonicalPaperPath(hostname, pathname, parsed)) {
    return { kind: "paper", source_level: "paper" };
  }

  if (hostname === "github.com" && isDeclaredGithubTarget(candidate) && isCanonicalGithubRepositoryPath(pathname)) {
    return { kind: "github_repository", source_level: "github" };
  }
  return null;
}

function isCanonicalPaperPath(hostname, pathname, parsed) {
  if (hostname === "arxiv.org") {
    return /^\/(?:abs|pdf)\/(?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[a-z-]+)?\/\d{7})(?:v\d+)?(?:\.pdf)?$/i.test(pathname);
  }
  if (hostname === "openreview.net") {
    return /^\/(?:forum|pdf)$/i.test(pathname) && Boolean(parsed.searchParams.get("id")?.trim());
  }
  if (hostname === "biorxiv.org" || hostname === "medrxiv.org") {
    return /^\/content\/(?:10\.\d{4,9}\/[^/]+|\d{4}\.\d{2}\.\d{2}\.\d+)(?:v\d+)?(?:\.full|\.full\.pdf)?$/i.test(pathname);
  }
  if (hostname === "aclanthology.org") {
    return /^\/\d{4}\.[a-z0-9-]+\.\d+$/i.test(pathname);
  }
  if (hostname === "papers.nips.cc") {
    return /^\/(?:paper_files\/paper|paper)\/\d{4}\/hash\/[a-f0-9]+-(?:Abstract-Conference|Paper-Conference)(?:\.html|\.pdf)$/i.test(pathname);
  }
  if (hostname === "proceedings.mlr.press") {
    return /^\/v\d+\/[a-z0-9-]+(?:\.html|\/[a-z0-9-]+\.pdf)$/i.test(pathname);
  }
  return false;
}

function isDeclaredGithubTarget(candidate) {
  const sourceLevel = String(candidate?.source_level || "").trim();
  const category = String(candidate?.category || "").trim();
  const editorialCategory = String(candidate?.editorial_category || "").trim();
  return GITHUB_SOURCE_LEVELS.has(sourceLevel) ||
    ["project", "github_trending"].includes(category) ||
    editorialCategory === "open_source";
}

function isCanonicalGithubRepositoryPath(pathname) {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length !== 2) {
    return false;
  }
  const [owner, repository] = parts;
  return Boolean(
    owner &&
    repository &&
    !GITHUB_RESERVED_ROOTS.has(owner.toLowerCase()) &&
    !owner.endsWith(".atom") &&
    !repository.endsWith(".atom")
  );
}

function uniqueUrls(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}
