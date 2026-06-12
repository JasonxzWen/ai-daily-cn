const NON_PUBLIC_ASSET_ROLES = new Set(["icon", "favicon", "logo", "avatar", "decorative"]);
const SCREENSHOT_CAPTURE_RE = /\b(?:full[-_ ]?page|browser|viewport|page)[-_ ]?screenshot\b/i;

const MEANINGFUL_IMAGE_RE =
  /\b(?:benchmark|leaderboard|ranking|rankings|table|chart|graph|diagram|architecture|schema|screenshot|product\s+ui|ui\s+screenshot|performance|eval|evaluation|score|frontiercode|swe-bench|intelligence\s+index|cost\s+vs\s+accuracy|accuracy\s+vs\s+cost)\b|(?:基准|评测|性能|榜单|排行|排名|表格|图表|架构|流程图|对比|截图|产品界面|控制台|成本|准确率|模型能力)/iu;
const DECORATIVE_IMAGE_RE =
  /\b(?:hero|cover|banner|illustration|decorative|stock|wallpaper|logo|icon|avatar|favicon|badge|butterfly|moth|computer|server\s+room)\b|(?:题图|封面|横幅|装饰|插画|海报|蝴蝶|电脑配图|机房配图|图标|头像|徽标)/iu;

export function isNonPublicAssetRole(role) {
  return NON_PUBLIC_ASSET_ROLES.has(String(role || "").trim().toLowerCase());
}

export function isScreenshotCaptureKind(value) {
  return SCREENSHOT_CAPTURE_RE.test(String(value || "").trim().toLowerCase());
}

export function meaningfulImageKind(input = {}) {
  const text = publicImagePolicyText(input);
  if (MEANINGFUL_IMAGE_RE.test(text)) {
    if (/\btable\b|表格/i.test(text)) return "table";
    if (/\bchart|graph|cost\s+vs\s+accuracy|accuracy\s+vs\s+cost|图表|对比|成本|准确率/i.test(text)) return "chart";
    if (/\bdiagram|architecture|schema|架构|流程图/i.test(text)) return "diagram";
    if (/\bscreenshot|product\s+ui|ui\s+screenshot|产品界面|控制台|截图/i.test(text)) return "product_screenshot";
    if (/\bleaderboard|ranking|rankings|榜单|排行|排名/i.test(text)) return "leaderboard";
    return "semantic";
  }
  return "";
}

export function isMeaningfulImageCandidate(candidate = {}) {
  const kind = meaningfulImageKind(candidate);
  if (kind) {
    return true;
  }
  const text = publicImagePolicyText(candidate);
  if (DECORATIVE_IMAGE_RE.test(text)) {
    return false;
  }
  if (String(candidate.image_source || "").toLowerCase() === "manual_semantic") {
    return true;
  }
  return false;
}

export function isMeaningfulPublicEvidenceAsset(asset = {}) {
  const type = String(asset.type || "").toLowerCase();
  if (type === "table") {
    return true;
  }
  const role = String(asset.asset_role || asset.role || "").trim().toLowerCase();
  if (["chart", "diagram", "table"].includes(role)) {
    return true;
  }
  const kind = String(asset.asset_kind || "").trim().toLowerCase();
  if (["semantic", "leaderboard", "chart", "diagram", "table", "benchmark", "product_screenshot"].includes(kind)) {
    return true;
  }
  return Boolean(meaningfulImageKind(asset));
}

export function publicImagePolicyText(input = {}) {
  return [
    input.title,
    input.caption,
    input.image_alt,
    input.alt,
    input.evidence,
    input.summary,
    input.description,
    input.source,
    input.url,
    input.source_url,
    input.local_path,
    input.image_source,
    input.extraction_status,
    input.asset_role,
    input.asset_kind,
    input.capture_kind
  ].map((value) => String(value || "")).join(" ");
}

export function publicEvidenceAssetRole(input = {}) {
  const kind = meaningfulImageKind(input);
  if (kind === "table") return "table";
  if (kind === "chart" || kind === "leaderboard") return "chart";
  if (kind === "diagram") return "diagram";
  return "content";
}

