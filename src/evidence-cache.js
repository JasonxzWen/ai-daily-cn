import fs from "node:fs/promises";
import path from "node:path";
import { readJsonArtifact } from "./compressed-json.js";
import {
  isMeaningfulImageCandidate,
  meaningfulImageKind,
  publicEvidenceAssetRole
} from "./media-policy.js";
import { normalizeUrlIdentity } from "./url.js";

const DEFAULT_MAX_ASSETS = 4;
const DEFAULT_PUBLIC_PREFIX = "assets/evidence";
const PUBLIC_EVIDENCE_MIN_WIDTH = 240;
const PUBLIC_EVIDENCE_MIN_HEIGHT = 160;
const PUBLIC_EVIDENCE_MIN_AREA = 80000;
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
  const existingSourceUrls = new Set(
    (Array.isArray(options.existingEvidenceAssets) ? options.existingEvidenceAssets : [])
      .map((asset) => normalizeUrl(asset?.source_url))
      .filter(Boolean)
  );
  const candidates = Array.isArray(options.candidates)
    ? options.candidates
    : await readCandidatePoolCandidates(rootDir, options.candidatePoolPath, reportDate);
  const selected = selectImageCandidates(candidates, maxAssets, existingSourceUrls);
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
      const dimensions = readImageDimensions(bytes);
      if (dimensions && isTooSmallPublicEvidence(dimensions)) {
        skipped.push({
          id: candidate.id,
          image_url: imageUrl,
          reason: `image_dimensions_too_small:${dimensions.width}x${dimensions.height}`
        });
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
        extraction_status: "source_image",
        ...(dimensions ? { width: dimensions.width, height: dimensions.height } : {}),
        byte_size: bytes.length,
        asset_role: publicEvidenceAssetRole(candidate),
        asset_kind: meaningfulImageKind(candidate) || "semantic",
        capture_kind: "source_asset"
      });
    } catch (error) {
      skipped.push({ id: candidate.id, image_url: imageUrl, reason: String(error?.message || error || "fetch_failed") });
    }
  }

  return { assets, skipped };
}

function isTooSmallPublicEvidence({ width, height }) {
  return width < PUBLIC_EVIDENCE_MIN_WIDTH ||
    height < PUBLIC_EVIDENCE_MIN_HEIGHT ||
    width * height < PUBLIC_EVIDENCE_MIN_AREA;
}

function readImageDimensions(buffer) {
  if (buffer.length >= 24 && buffer.toString("ascii", 1, 4) === "PNG") {
    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20)
    };
  }
  if (buffer.length >= 10 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return readWebpDimensions(buffer);
  }
  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    return readJpegDimensions(buffer);
  }
  return null;
}

function readWebpDimensions(buffer) {
  const chunk = buffer.toString("ascii", 12, 16);
  if (chunk === "VP8X" && buffer.length >= 30) {
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3)
    };
  }
  return null;
}

function readJpegDimensions(buffer) {
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2) {
      return null;
    }
    if (marker >= 0xc0 && marker <= 0xc3) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7)
      };
    }
    offset += 2 + length;
  }
  return null;
}

function selectImageCandidates(candidates, maxAssets, existingSourceUrls = new Set()) {
  const seenUrls = new Set();
  const ranked = candidates
    .filter((candidate) => candidate?.image_url && candidate?.url)
    .filter(isMeaningfulImageCandidate)
    .filter((candidate) => !existingSourceUrls.has(normalizeUrl(candidate.url)))
    .filter((candidate) => {
      const key = normalizeUrl(candidate.url);
      if (!key || seenUrls.has(key)) {
        return false;
      }
      seenUrls.add(key);
      return true;
    })
    .sort((left, right) => candidateImageScore(right) - candidateImageScore(left));

  const selected = [];
  const selectedUrls = new Set();

  // Keep at least one image slot for each major public section when candidates exist.
  for (const section of ["main_items", "hot_blogs", "community_leads"]) {
    if (selected.length >= maxAssets) {
      break;
    }
    const candidate = ranked.find((item) =>
      item.included_in === section && !selectedUrls.has(normalizeUrl(item.url))
    );
    if (!candidate) {
      continue;
    }
    selected.push(candidate);
    selectedUrls.add(normalizeUrl(candidate.url));
  }

  for (const candidate of ranked) {
    if (selected.length >= maxAssets) {
      break;
    }
    const key = normalizeUrl(candidate.url);
    if (!key || selectedUrls.has(key)) {
      continue;
    }
    selected.push(candidate);
    selectedUrls.add(key);
  }

  return selected;
}

function candidateImageScore(candidate) {
  let score = 0;
  if (candidate.status === "included") score += 20;
  if (candidate.included_in === "main_items") score += 16;
  if (candidate.included_in === "hot_blogs") score += 8;
  if (candidate.included_in === "community_leads") score += 7;
  if (candidate.included_in === "projects") score += 6;
  if (candidate.verification_status === "primary_confirmed") score += 10;
  if (candidate.verification_status === "multi_source_confirmed") score += 8;
  if (candidate.editorial_category === "content_aigc") score += 5;
  if (/image|video|aigc|creator|game|graphics|图像|图片|视频|游戏|生成/i.test(candidate.title || "")) score += 4;
  return score;
}

async function readCandidatePoolCandidates(rootDir, candidatePoolPath, reportDate) {
  const inputPath = candidatePoolPath || path.join(".tmp", `source-candidates-${reportDate}.json`);
  const payload = await readJsonArtifact(path.resolve(rootDir, inputPath));
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
  return normalizeUrlIdentity(value);
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
