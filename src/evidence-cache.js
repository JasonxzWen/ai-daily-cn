import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_MAX_ASSETS = 3;
const DEFAULT_PUBLIC_PREFIX = "assets/evidence";
const IMAGE_EXTENSIONS = new Map([
  ["image/jpeg", ".jpg"],
  ["image/jpg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["image/gif", ".gif"]
]);

export async function cacheEvidenceImages(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const reportDate = requireReportDate(options.reportDate);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const maxAssets = positiveInt(options.maxAssets, DEFAULT_MAX_ASSETS);
  const outDir = path.resolve(rootDir, options.outDir || "docs");
  const publicPrefix = options.publicPrefix || DEFAULT_PUBLIC_PREFIX;
  const candidates = Array.isArray(options.candidates)
    ? options.candidates
    : await readCandidatePoolCandidates(rootDir, options.candidatePoolPath, reportDate);
  const selected = selectImageCandidates(candidates, maxAssets);
  const assets = [];
  const skipped = [];

  if (typeof fetchImpl !== "function") {
    return {
      assets,
      skipped: selected.map((candidate) => ({ id: candidate.id, reason: "fetch_unavailable" }))
    };
  }

  await fs.mkdir(path.join(outDir, publicPrefix), { recursive: true });
  for (const candidate of selected) {
    const imageUrl = candidate.image_url;
    try {
      const response = await fetchImpl(imageUrl, {
        headers: {
          accept: "image/avif,image/webp,image/png,image/jpeg,image/gif,image/*,*/*",
          "user-agent": "ai-daily-cn-static-publisher"
        }
      });
      if (!response?.ok) {
        skipped.push({ id: candidate.id, image_url: imageUrl, reason: `HTTP ${response?.status || "unknown"}` });
        continue;
      }
      const contentType = String(response.headers?.get?.("content-type") || "").split(";")[0].trim().toLowerCase();
      if (contentType && !contentType.startsWith("image/")) {
        skipped.push({ id: candidate.id, image_url: imageUrl, reason: `non_image_content_type=${contentType}` });
        continue;
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length < 100) {
        skipped.push({ id: candidate.id, image_url: imageUrl, reason: "image_too_small" });
        continue;
      }
      const extension = extensionForImage(contentType, imageUrl);
      const fileName = uniqueEvidenceFileName(assets, candidate, reportDate, extension);
      const localPath = path.posix.join(publicPrefix, fileName);
      await fs.writeFile(path.join(outDir, localPath), bytes);
      assets.push({
        type: "figure",
        title: trimText(candidate.image_alt || candidate.title || "Source image", 80),
        source_url: candidate.url,
        local_path: localPath,
        caption: evidenceCaption(candidate),
        extraction_status: "source_image"
      });
    } catch (error) {
      skipped.push({ id: candidate.id, image_url: imageUrl, reason: String(error?.message || error || "fetch_failed") });
    }
  }

  return { assets, skipped };
}

function selectImageCandidates(candidates, maxAssets) {
  const seenUrls = new Set();
  return candidates
    .filter((candidate) => candidate?.image_url && candidate?.url)
    .filter((candidate) => {
      const key = normalizeUrl(candidate.url);
      if (!key || seenUrls.has(key)) {
        return false;
      }
      seenUrls.add(key);
      return true;
    })
    .sort((left, right) => candidateImageScore(right) - candidateImageScore(left))
    .slice(0, maxAssets);
}

function candidateImageScore(candidate) {
  let score = 0;
  if (candidate.status === "included") score += 20;
  if (candidate.included_in === "main_items") score += 16;
  if (candidate.included_in === "hot_blogs") score += 8;
  if (candidate.included_in === "projects") score += 6;
  if (candidate.verification_status === "primary_confirmed") score += 10;
  if (candidate.verification_status === "multi_source_confirmed") score += 8;
  if (candidate.editorial_category === "content_aigc") score += 5;
  if (/image|video|aigc|creator|game|graphics|图像|图片|视频|游戏|生成/i.test(candidate.title || "")) score += 4;
  return score;
}

async function readCandidatePoolCandidates(rootDir, candidatePoolPath, reportDate) {
  const inputPath = candidatePoolPath || path.join(".tmp", `source-candidates-${reportDate}.json`);
  const payload = JSON.parse(await fs.readFile(path.resolve(rootDir, inputPath), "utf8"));
  return Array.isArray(payload.candidates) ? payload.candidates : [];
}

function extensionForImage(contentType, imageUrl) {
  if (IMAGE_EXTENSIONS.has(contentType)) {
    return IMAGE_EXTENSIONS.get(contentType);
  }
  try {
    const ext = path.extname(new URL(imageUrl).pathname).toLowerCase();
    return [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext) ? (ext === ".jpeg" ? ".jpg" : ext) : ".png";
  } catch {
    return ".png";
  }
}

function uniqueEvidenceFileName(existingAssets, candidate, reportDate, extension) {
  const used = new Set(existingAssets.map((asset) => path.posix.basename(asset.local_path || "")));
  const base = slugId(`${candidate.title || candidate.id || "evidence"}-${reportDate}`).slice(0, 96) || `evidence-${reportDate}`;
  let name = `${base}${extension}`;
  let suffix = 2;
  while (used.has(name)) {
    name = `${base}-${suffix}${extension}`;
    suffix += 1;
  }
  return name;
}

function evidenceCaption(candidate) {
  const source = candidate.source ? `图片来自 ${candidate.source}` : "图片来自原始页面";
  const imageSource = candidate.image_source ? `，由 ${candidate.image_source} 提供` : "";
  return `${source}${imageSource}，用于辅助理解该条目的产品、研究或内容生成语境。`;
}

function trimText(value, maxLength) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

function normalizeUrl(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function requireReportDate(reportDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(reportDate || ""))) {
    throw new Error("reportDate must be YYYY-MM-DD");
  }
  return reportDate;
}

function positiveInt(value, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function slugId(value) {
  return String(value)
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
