import path from "node:path";
import { dateParts } from "./paths.js";

export const REPORTS_DATA_INTERNAL_DIR = "internal";
export const SOURCE_STATUS_HISTORY_FILE = "source-status-history.json";

export function internalCandidatePoolRelativePath(reportDate) {
  const { year, month } = dateParts(reportDate);
  return path.join(REPORTS_DATA_INTERNAL_DIR, "candidates", year, month, `${reportDate}.candidates.json`);
}

export function legacyCandidatePoolRelativePath(reportDate) {
  const { year, month } = dateParts(reportDate);
  return path.join(year, month, `${reportDate}.candidates.json`);
}

export function candidatePoolRelativePaths(reportDate) {
  return [
    internalCandidatePoolRelativePath(reportDate),
    legacyCandidatePoolRelativePath(reportDate)
  ];
}

export function internalSourceStatusHistoryRelativePath() {
  return path.join(REPORTS_DATA_INTERNAL_DIR, SOURCE_STATUS_HISTORY_FILE);
}

export function legacySourceStatusHistoryRelativePath() {
  return SOURCE_STATUS_HISTORY_FILE;
}

export function sourceStatusHistoryRelativePaths() {
  return [
    internalSourceStatusHistoryRelativePath(),
    legacySourceStatusHistoryRelativePath()
  ];
}

export function toRepoPath(...segments) {
  return path.posix.join(...segments.map((segment) => String(segment).split(path.sep).join(path.posix.sep)));
}
