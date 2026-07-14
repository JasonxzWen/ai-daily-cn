import fs from "node:fs";

const workflowContract = JSON.parse(fs.readFileSync(
  new URL("../config/daily-workflow-contract.json", import.meta.url),
  "utf8"
));

export const PUBLIC_SIGNAL_DISCOVERY_LANES = Object.freeze(
  workflowContract.daily_runner.public_signals.discovery_lanes.map((lane) => Object.freeze({ ...lane }))
);

export function publicSignalDiscoveryInputPaths(reportDate) {
  return PUBLIC_SIGNAL_DISCOVERY_LANES.map((lane) =>
    lane.artifact_path_template.replace("YYYY-MM-DD", reportDate));
}

export function transportCompletenessTags(source = {}) {
  const transportStatus = String(source.transport_status || "").trim();
  const limitation = String(source.transport_limitation || "").trim();
  if (transportStatus !== "degraded" && !limitation) return {};
  const providerLimited = /provider_|no_(?:reliable_)?(?:exhaustive_)?pagination|surface_has_no_reliable_pagination|provider_max_results|access_limited/i.test(limitation);
  return {
    completeness_status: "partial",
    completeness_reason: providerLimited ? "provider_limited" : "partial"
  };
}
