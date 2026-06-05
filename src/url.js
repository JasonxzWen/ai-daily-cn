export function normalizeUrlIdentity(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  try {
    const url = new URL(raw);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    url.pathname = normalizePathname(url.pathname);

    const params = [...url.searchParams.entries()]
      .filter(([key]) => !/^utm_/i.test(key))
      .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
        `${leftKey}\u0000${leftValue}`.localeCompare(`${rightKey}\u0000${rightValue}`)
      );
    url.search = "";
    for (const [key, paramValue] of params) {
      url.searchParams.append(key, paramValue);
    }

    return url.toString().replace(/\/$/, "");
  } catch {
    return raw.toLowerCase().replace(/#.*$/, "").replace(/\/$/, "");
  }
}

function normalizePathname(pathname) {
  const normalized = String(pathname || "/").replace(/\/+$/, "");
  return normalized || "/";
}
