export const PUBLIC_SURFACE_DIET_START_REPORT_DATE = "2026-07-01";
export const PUBLIC_SURFACE_DIET_START_GENERATED_AT = "2026-07-01T10:00:00.000Z";

export function isPublicSurfaceDietEnabled(report = {}) {
  const generatedAt = String(report?.generated_at || report?.generatedAt || "").trim();
  if (generatedAt) {
    const generatedTime = Date.parse(generatedAt);
    return Number.isFinite(generatedTime) && generatedTime >= Date.parse(PUBLIC_SURFACE_DIET_START_GENERATED_AT);
  }
  const reportDate = String(report?.report_date || report?.reportDate || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(reportDate) && reportDate >= PUBLIC_SURFACE_DIET_START_REPORT_DATE;
}
