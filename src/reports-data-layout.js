import path from "node:path";
import { dateParts } from "./paths.js";

export const REPORTS_DATA_INTERNAL_DIR = "internal";
export const REPORTS_DATA_OCCURRENCES_DIR = "occurrences";
export const REPORTS_DATA_OBSERVATIONS_DIR = "observations";
export const REPORTS_DATA_SOURCE_FUNNEL_DIR = "source-funnel";
export const REPORTS_DATA_SIGNALS_DIR = "signals";
export const REPORTS_DATA_PUBLIC_SIGNAL_POOL_DIR = "public-signal-pool";
export const SOURCE_STATUS_HISTORY_FILE = "source-status-history.json";

export function occurrenceStoreRelativePath(reportDate) {
  const { year, month } = dateParts(reportDate);
  return path.join(REPORTS_DATA_OCCURRENCES_DIR, year, month, `${reportDate}.json`);
}

export function rawObservationsRelativePath(reportDate) {
  const { year, month } = dateParts(reportDate);
  return path.join(REPORTS_DATA_OBSERVATIONS_DIR, year, month, `${reportDate}.json`);
}

export function sourceFunnelRelativePath(reportDate) {
  const { year, month } = dateParts(reportDate);
  return path.join(REPORTS_DATA_SOURCE_FUNNEL_DIR, year, month, `${reportDate}.json`);
}

export function signalPoolRelativePath(reportDate) {
  const { year, month } = dateParts(reportDate);
  return path.join(REPORTS_DATA_SIGNALS_DIR, year, month, `${reportDate}.json`);
}

export function publicSignalPoolRelativePath(reportDate) {
  const { year, month } = dateParts(reportDate);
  return path.join(REPORTS_DATA_PUBLIC_SIGNAL_POOL_DIR, year, month, `${reportDate}.json`);
}

export function internalCandidatePoolRelativePath(reportDate) {
  const { year, month } = dateParts(reportDate);
  return path.join(REPORTS_DATA_INTERNAL_DIR, "candidates", year, month, `${reportDate}.candidates.json.gz`);
}

export function legacyInternalCandidatePoolRelativePath(reportDate) {
  const { year, month } = dateParts(reportDate);
  return path.join(REPORTS_DATA_INTERNAL_DIR, "candidates", year, month, `${reportDate}.candidates.json`);
}

export function compressedLegacyCandidatePoolRelativePath(reportDate) {
  const { year, month } = dateParts(reportDate);
  return path.join(year, month, `${reportDate}.candidates.json.gz`);
}

export function legacyCandidatePoolRelativePath(reportDate) {
  const { year, month } = dateParts(reportDate);
  return path.join(year, month, `${reportDate}.candidates.json`);
}

export function candidatePoolRelativePaths(reportDate) {
  return [
    internalCandidatePoolRelativePath(reportDate),
    legacyInternalCandidatePoolRelativePath(reportDate),
    compressedLegacyCandidatePoolRelativePath(reportDate),
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
