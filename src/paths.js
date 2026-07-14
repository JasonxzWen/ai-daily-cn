import path from "node:path";

export function normalizeSiteUrl(siteUrl) {
  return siteUrl.endsWith("/") ? siteUrl : `${siteUrl}/`;
}

export function dateParts(reportDate) {
  const [year, month] = reportDate.split("-");
  return { year, month };
}

export function reportRelativePaths(reportDate) {
  const { year, month } = dateParts(reportDate);
  return {
    markdownPath: path.posix.join("reports", year, month, `${reportDate}.md`),
    htmlPath: path.posix.join("reports", year, month, `${reportDate}.html`),
    dataPath: path.posix.join("data", year, month, `${reportDate}.json`),
    candidateDataPath: path.posix.join("data", year, month, `${reportDate}.candidates.json`)
  };
}

export function canonicalReportUrl(siteUrl, reportDate) {
  const { htmlPath } = reportRelativePaths(reportDate);
  return new URL(htmlPath, normalizeSiteUrl(siteUrl)).toString();
}

export function canonicalReportDataUrl(siteUrl, reportDate) {
  const { dataPath } = reportRelativePaths(reportDate);
  return new URL(dataPath, normalizeSiteUrl(siteUrl)).toString();
}

export function relativeAssetHref(fromPath, assetPath) {
  const fromDir = path.posix.dirname(fromPath);
  const rel = path.posix.relative(fromDir, assetPath);
  return rel.startsWith(".") ? rel : `./${rel}`;
}

export function toPosixRelative(root, filePath) {
  return path.relative(root, filePath).split(path.sep).join(path.posix.sep);
}
