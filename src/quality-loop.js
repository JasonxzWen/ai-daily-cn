import { PublisherError } from "./errors.js";
import { findPlainLanguageIssues } from "./plain-language.js";

const DEFAULT_HIGHLIGHT_LIMITS = {
  maxPerText: 3,
  maxChars: 32,
  maxRatio: 0.35
};

const AI_TONE_PHRASES = [
  "high-signal",
  "core signal",
  "more signal",
  "observable signal",
  "paradigm shift",
  "ecosystem flywheel",
  "value flywheel"
];

const AUTO_DRAFT_TEMPLATE_PHRASES = [
  "发布或更新了这条信号",
  "它进入主体的原因是来源可回溯",
  "工程团队应关注它对产品能力、平台接入、评估或运营边界的影响",
  "中介或聚合来源不会被自动提升为主体事实",
  "自动草稿仅把一手",
  "适合工程团队判断是否需要跟进",
  "候选池标记为一手或可信来源",
  "report:draft 自动从固定发现候选池选取",
  "report:draft 已从候选池自动选取"
];

const HOT_BLOG_SUMMARY_MIN_LENGTH = 100;
const HOT_BLOG_SUMMARY_MAX_LENGTH = 260;
const HOT_BLOG_MIN_CHINESE_RATIO = 0.45;
const HOT_BLOG_MIN_CHINESE_CHARS = 60;
const HOT_BLOG_TEMPLATE_RE = /(?:\u8fd9\u7bc7\u6587\u7ae0\u7684\u770b\u70b9\u4e0d\u662f|\u4e0d\u662f\u5355\u4e2a\u6280\u672f\u540d\u8bcd|\u8bfb\u8005\u53ef\u4ee5\u91cd\u70b9\u770b|\u5bf9\u975e\s*AI\s*\u76f4\u63a5\u4ece\u4e1a\u8005|\u4ef7\u503c\u5728\u4e8e)/iu;
const HOT_BLOG_COVERAGE_PATTERNS = [
  /(?:\u6587\u7ae0|\u535a\u5ba2|\u4f5c\u8005|\u539f\u6587|\u5b83).{0,32}(?:\u8bb2|\u68b3\u7406|\u8bf4\u660e|\u5206\u6790|\u62c6\u89e3|\u5c55\u793a|\u56f4\u7ed5|\u9a8c\u8bc1|\u5c55\u5f00)/u,
  /(?:\u4f9d\u636e|\u8bc1\u636e|\u65b9\u6cd5|\u5b9e\u9a8c|\u6848\u4f8b|\u4ee3\u7801|\u63a5\u53e3|\u6570\u636e|\u5bf9\u6bd4|\u9650\u5236|\u6743\u9650|\u5931\u8d25|\u6d41\u7a0b|\u95e8\u69db|\u8fb9\u754c)/u,
  /(?:\u8bfb\u8005|\u56e2\u961f|\u5173\u6ce8|\u7559\u610f|\u6838\u5bf9|\u5224\u65ad|\u8bd5\u70b9|\u91c7\u8d2d|\u843d\u5730|\u98ce\u9669|\u5c40\u9650|\u8def\u7ebf\u56fe|\u53c2\u8003|\u5b89\u5168\u95e8)/u
];

const CANDIDATE_REF_SECTIONS = [
  "main_items",
  "github_trending",
  "hot_blogs",
  "projects",
  "builder_observations",
  "community_leads",
  "model_releases"
];

const PUBLIC_TEXT_FIELDS = [
  ["summary"],
  ["hero_highlights", "*", "title"],
  ["hero_highlights", "*", "reason"],
  ["main_items", "*", "title"],
  ["main_items", "*", "summary"],
  ["main_items", "*", "bullets", "*"],
  ["main_items", "*", "why_it_matters"],
  ["main_items", "*", "reader_relevance"],
  ["main_items", "*", "verification_note"],
  ["main_items", "*", "risk_note"],
  ["main_items", "*", "watch_next"],
  ["hot_blogs", "*", "title"],
  ["hot_blogs", "*", "summary"],
  ["hot_blogs", "*", "reader_relevance"],
  ["hot_blogs", "*", "verification_note"],
  ["hot_blogs", "*", "risk_note"],
  ["hot_blogs", "*", "watch_next"],
  ["projects", "*", "description"],
  ["projects", "*", "use_case"],
  ["projects", "*", "reader_relevance"],
  ["projects", "*", "verification_note"],
  ["projects", "*", "risk_note"],
  ["projects", "*", "watch_next"],
  ["github_trending", "*", "description"],
  ["builder_observations", "*", "translation"],
  ["builder_observations", "*", "content"],
  ["builder_observations", "*", "reader_relevance"],
  ["builder_observations", "*", "verification_note"],
  ["builder_observations", "*", "risk_note"],
  ["builder_observations", "*", "watch_next"],
  ["community_leads", "*", "content"],
  ["community_leads", "*", "reader_relevance"],
  ["community_leads", "*", "verification_note"],
  ["community_leads", "*", "risk_note"],
  ["community_leads", "*", "watch_next"],
  ["self_check", "notes"]
];

const REPAIRABLE_PUBLIC_TEXT_PATTERNS = [
  /^summary$/,
  /^hero_highlights\[\d+\]\.(?:title|reason)$/,
  /^main_items\[\d+\]\.(?:title|summary|why_it_matters|reader_relevance|verification_note|risk_note|watch_next)$/,
  /^main_items\[\d+\]\.bullets\[\d+\]$/,
  /^hot_blogs\[\d+\]\.(?:title|summary|reader_relevance|verification_note|risk_note|watch_next)$/,
  /^projects\[\d+\]\.(?:description|use_case|reader_relevance|verification_note|risk_note|watch_next)$/,
  /^github_trending\[\d+\]\.description$/,
  /^builder_observations\[\d+\]\.(?:translation|content|reader_relevance|verification_note|risk_note|watch_next)$/,
  /^community_leads\[\d+\]\.(?:content|reader_relevance|verification_note|risk_note|watch_next)$/,
  /^self_check\.notes$/
];

export function reviewReportQuality(report, options = {}) {
  const limits = { ...DEFAULT_HIGHLIGHT_LIMITS, ...(options.highlightLimits || {}) };
  const issues = [];
  const aiReviewTasks = [];
  const textEntries = collectPublicTextEntries(report);
  const candidatePool = options.candidatePool || null;
  const autoDraft = isAutoDraftReport(report);

  for (const issue of findPlainLanguageIssues(report)) {
    issues.push({
      code: "plain_language_stock_phrase",
      severity: "error",
      path: stripRootPath(issue.path),
      message: `Text contains stock phrase: ${issue.phrase}`,
      repairable: false
    });
  }

  for (const entry of textEntries) {
    collectEnglishToneIssues(entry, issues);
    collectAutoDraftTemplateIssues(entry, issues, aiReviewTasks);
    collectHighlightIssues(entry, issues, limits);
  }

  collectMainItemDensityIssues(report, issues);
  collectHotBlogSummaryIssues(report, issues, aiReviewTasks);
  collectBuilderTranslationIssues(report, issues, aiReviewTasks);
  collectCandidatePoolIssues(report, candidatePool, issues, { autoDraft });

  const blockingIssues = issues.filter((issue) => issue.severity === "error");
  return {
    ok: blockingIssues.length === 0,
    status: blockingIssues.length > 0 ? "needs_repair" : "ok",
    report_date: report?.report_date || "",
    checklist: buildChecklist(issues, aiReviewTasks, {
      autoDraft,
      candidatePoolChecked: Boolean(candidatePool)
    }),
    issues,
    ai_review_tasks: aiReviewTasks,
    safe_repair_available: issues.some((issue) => issue.repairable === true)
  };
}

export function repairReportQuality(report, review = null, options = {}) {
  const currentReview = review || reviewReportQuality(report, options);
  const repaired = structuredClone(report);
  const repairs = [];

  for (const issue of currentReview.issues) {
    if (issue.code === "builder_content_translation_mismatch") {
      const tokens = parsePath(issue.path);
      const item = getPath(repaired, tokens.slice(0, -1));
      if (item?.translation) {
        setPath(repaired, tokens, item.translation);
        repairs.push({
          code: issue.code,
          path: issue.path,
          action: "set_content_to_translation"
        });
      }
    }

    if (issue.code === "highlight_too_large" || issue.code === "highlight_overused") {
      const tokens = parsePath(issue.path);
      const value = getPath(repaired, tokens);
      if (typeof value === "string") {
        const next = stripNoisyHighlights(value, options.highlightLimits);
        if (next !== value) {
          setPath(repaired, tokens, next);
          repairs.push({
            code: issue.code,
            path: issue.path,
            action: "strip_noisy_highlight_markers"
          });
        }
      }
    }
  }

  return {
    report: repaired,
    repairs,
    review: reviewReportQuality(repaired, options)
  };
}

export function applyQualityRepairContract(report, contract = {}) {
  if (!contract || typeof contract !== "object" || Array.isArray(contract)) {
    throw new PublisherError("quality_repair_contract_invalid", "quality repair contract must be an object.");
  }
  if (contract.schema_version !== 1) {
    throw new PublisherError("quality_repair_contract_invalid", "quality repair contract schema_version must be 1.");
  }
  if (contract.report_date && report?.report_date && contract.report_date !== report.report_date) {
    throw new PublisherError("quality_repair_contract_date_mismatch", "quality repair contract report_date does not match the report.");
  }
  if (!Array.isArray(contract.edits)) {
    throw new PublisherError("quality_repair_contract_invalid", "quality repair contract edits must be an array.");
  }

  const repaired = structuredClone(report);
  const applied = [];
  const rejected = [];

  contract.edits.forEach((edit, index) => {
    const pathName = String(edit?.path || "").trim();
    if (!pathName) {
      rejected.push({ index, path: "", code: "path_missing", message: "edit.path is required" });
      return;
    }
    if (!isAllowedRepairPath(pathName)) {
      rejected.push({ index, path: pathName, code: "path_not_allowed", message: "AI repair cannot change facts, links, dates, source metadata, or audit data." });
      return;
    }
    if (typeof edit.value !== "string" || !edit.value.trim()) {
      rejected.push({ index, path: pathName, code: "value_invalid", message: "edit.value must be a non-empty string." });
      return;
    }

    const tokens = parsePath(pathName);
    if (!pathExists(repaired, tokens)) {
      rejected.push({ index, path: pathName, code: "path_not_found", message: "edit.path does not exist in the report." });
      return;
    }
    if (/^builder_observations\[\d+\]\.content$/.test(pathName)) {
      const item = getPath(repaired, tokens.slice(0, -1));
      if (item?.translation && edit.value.trim() !== String(item.translation).trim()) {
        rejected.push({ index, path: pathName, code: "content_translation_mismatch", message: "builder content must match translation when translation exists." });
        return;
      }
    }

    setPath(repaired, tokens, edit.value);
    if (/^builder_observations\[\d+\]\.translation$/.test(pathName)) {
      const item = getPath(repaired, tokens.slice(0, -1));
      if (item?.content) {
        item.content = edit.value;
      }
    }
    applied.push({
      index,
      path: pathName,
      reason: String(edit.reason || "").trim(),
      evidence_path: String(edit.evidence_path || "").trim()
    });
  });

  return {
    report: repaired,
    applied,
    rejected
  };
}

function collectPublicTextEntries(report) {
  return PUBLIC_TEXT_FIELDS.flatMap((pattern) => collectPatternEntries(report, pattern));
}

function collectPatternEntries(value, pattern, pathName = "") {
  if (pattern.length === 0) {
    return typeof value === "string" ? [{ path: pathName, value }] : [];
  }

  const [part, ...rest] = pattern;
  if (part === "*") {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.flatMap((item, index) => collectPatternEntries(item, rest, `${pathName}[${index}]`));
  }

  if (!value || typeof value !== "object" || !(part in value)) {
    return [];
  }
  const nextPath = pathName ? `${pathName}.${part}` : part;
  return collectPatternEntries(value[part], rest, nextPath);
}

function collectEnglishToneIssues(entry, issues) {
  const lowered = entry.value.toLowerCase();
  const phrase = AI_TONE_PHRASES.find((item) => lowered.includes(item));
  if (!phrase) {
    return;
  }
  issues.push({
    code: "plain_language_stock_phrase",
    severity: "error",
    path: entry.path,
    message: `Text contains stock phrase: ${phrase}`,
    repairable: false
  });
}

function collectAutoDraftTemplateIssues(entry, issues, aiReviewTasks) {
  const phrase = AUTO_DRAFT_TEMPLATE_PHRASES.find((item) => entry.value.includes(item));
  if (!phrase) {
    return;
  }
  issues.push({
    code: "autodraft_template_phrase",
    severity: "error",
    path: entry.path,
    message: `Text still contains automatic draft template wording: ${phrase}`,
    repairable: false
  });
  aiReviewTasks.push({
    kind: "rewrite_autodraft_template",
    path: entry.path,
    instruction: "Rewrite this automatic draft template into concise, source-grounded editorial wording without changing facts, dates, links, or candidate IDs."
  });
}

function collectHighlightIssues(entry, issues, limits) {
  const highlights = [...entry.value.matchAll(/==([^=\n]+)==/g)].map((match) => ({
    raw: match[0],
    text: match[1],
    index: match.index || 0
  }));
  if (highlights.length === 0) {
    return;
  }

  const plainLength = stripMarkup(entry.value).length || 1;
  const highlightedChars = highlights.reduce((sum, item) => sum + visibleHighlightText(item.text).length, 0);
  const tooLarge = highlights.some((item) => visibleHighlightText(item.text).length > limits.maxChars);
  if (tooLarge) {
    issues.push({
      code: "highlight_too_large",
      severity: "error",
      path: entry.path,
      message: `Highlight marker exceeds ${limits.maxChars} visible characters.`,
      repairable: true
    });
  }

  if (highlights.length > limits.maxPerText || highlightedChars / plainLength > limits.maxRatio) {
    issues.push({
      code: "highlight_overused",
      severity: "error",
      path: entry.path,
      message: "Highlight markers cover too much text or appear too often.",
      repairable: true,
      details: {
        highlights: highlights.length,
        highlighted_ratio: Number((highlightedChars / plainLength).toFixed(3))
      }
    });
  }
}

function collectMainItemDensityIssues(report, issues) {
  const items = Array.isArray(report?.main_items) ? report.main_items : [];
  items.forEach((item, index) => {
    const bullets = Array.isArray(item?.bullets) ? item.bullets : [];
    const text = bullets.join("\n").trim();
    if (bullets.length > 0 && !/==[^=\n]+==/.test(text)) {
      issues.push({
        code: "highlight_missing",
        severity: "warning",
        path: `main_items[${index}].bullets`,
        message: "Main item has no inline highlight marker.",
        repairable: false
      });
    }
    if (bullets.length > 0 && stripMarkup(text).length < 80) {
      issues.push({
        code: "content_too_thin",
        severity: "warning",
        path: `main_items[${index}].bullets`,
        message: "Main item public bullets are thin; AI review should add concrete facts from existing evidence.",
        repairable: false
      });
    }
  });
}

function collectHotBlogSummaryIssues(report, issues, aiReviewTasks) {
  const items = Array.isArray(report?.hot_blogs) ? report.hot_blogs : [];
  items.forEach((item, index) => {
    const pathName = `hot_blogs[${index}].summary`;
    const summary = String(item?.summary || "").replace(/\s+/g, " ").trim();
    const plain = stripMarkup(summary);
    const sentenceCount = hotBlogPublicPoints(summary).length;
    const chineseChars = (plain.match(/\p{Script=Han}/gu) || []).length;
    const latinChars = (plain.match(/[A-Za-z]/g) || []).length;
    const ratioBase = chineseChars + latinChars;
    const chineseRatio = ratioBase > 0 ? chineseChars / ratioBase : 0;
    const problems = [];

    if (plain.length < HOT_BLOG_SUMMARY_MIN_LENGTH) {
      problems.push("summary_too_short");
    }
    if (plain.length > HOT_BLOG_SUMMARY_MAX_LENGTH) {
      problems.push("summary_too_long");
    }
    if (sentenceCount < 2 || sentenceCount > 4) {
      problems.push("points_not_2_to_4");
    }
    if (chineseChars < HOT_BLOG_MIN_CHINESE_CHARS || chineseRatio < HOT_BLOG_MIN_CHINESE_RATIO || looksLikeUntranslatedEnglish(plain)) {
      problems.push("not_chinese_editorial_summary");
    }
    if (looksLikeTemplatedHotBlogSummary(plain) || lacksHotBlogEditorialCoverage(plain)) {
      problems.push("template_or_low_information");
    }

    if (problems.length === 0) {
      return;
    }

    const code = problems.includes("not_chinese_editorial_summary")
      ? "hot_blog_summary_untranslated"
      : problems.includes("template_or_low_information")
        ? "hot_blog_summary_template"
        : problems.includes("points_not_2_to_4")
          ? "hot_blog_points_invalid"
          : "hot_blog_summary_too_thin";
    issues.push({
      code,
      severity: "error",
      path: pathName,
      message: "Hot blog summaries must be reader-facing Chinese analysis: 2-4 points, about 100-160 Chinese characters, and no untranslated English excerpt.",
      repairable: false,
      details: {
        problems,
        length: plain.length,
        sentence_count: sentenceCount,
        chinese_chars: chineseChars,
        chinese_ratio: Number(chineseRatio.toFixed(3))
      }
    });
    aiReviewTasks.push({
      kind: "hot_blog_editorial_rewrite",
      path: pathName,
      instruction: "Rewrite the hot blog summary in Chinese for general readers: 2-4 concise points, about 100-160 Chinese characters total, explain what the article says, why it matters, and what to watch without changing facts or links."
    });
  });
}

function hotBlogPublicPoints(summary) {
  const text = String(summary || "").replace(/\s+/g, " ").trim();
  if (!text) {
    return [];
  }
  const parts = text
    .split(/(?<=[\u3002\uff01\uff1f!?\uff1b;])\s*/u)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [text];
}

function looksLikeTemplatedHotBlogSummary(value) {
  return HOT_BLOG_TEMPLATE_RE.test(String(value || ""));
}

function lacksHotBlogEditorialCoverage(value) {
  const text = String(value || "");
  const hits = HOT_BLOG_COVERAGE_PATTERNS.filter((pattern) => pattern.test(text)).length;
  return hits < 2;
}

function looksLikeUntranslatedEnglish(value) {
  const text = String(value || "").trim();
  const englishSentences = text.match(/\b[A-Z][A-Za-z0-9 ,;:'"()[\]\/-]{35,}[.!?]/g) || [];
  return englishSentences.length >= 1;
}

function collectCandidatePoolIssues(report, candidatePool, issues, context = {}) {
  if (!context.autoDraft && !candidatePool) {
    return;
  }
  if (!candidatePool) {
    issues.push({
      code: "candidate_pool_not_checked",
      severity: "error",
      path: "candidate_pool",
      message: "Automatic draft quality review must receive the source candidate pool.",
      repairable: false
    });
    return;
  }

  const candidates = Array.isArray(candidatePool.candidates) ? candidatePool.candidates : [];
  const byId = new Map(candidates.map((candidate) => [String(candidate?.id || ""), candidate]));
  if (candidates.length === 0) {
    issues.push({
      code: "candidate_pool_empty",
      severity: "error",
      path: "candidate_pool.candidates",
      message: "Candidate pool has no candidates.",
      repairable: false
    });
  }

  for (const ref of collectCandidateRefs(report)) {
    if (!ref.id) {
      issues.push({
        code: "candidate_id_missing",
        severity: "error",
        path: ref.path,
        message: "Public report item is missing candidate_id.",
        repairable: false
      });
      continue;
    }
    const candidate = byId.get(ref.id);
    if (!candidate) {
      issues.push({
        code: "candidate_pool_reference_invalid",
        severity: "error",
        path: `${ref.path}.candidate_id`,
        message: "Public report item candidate_id is not present in candidate pool.",
        repairable: false,
        details: { candidate_id: ref.id }
      });
      continue;
    }
    if (candidate.status && candidate.status !== "included") {
      issues.push({
        code: "candidate_pool_reference_invalid",
        severity: "error",
        path: `${ref.path}.candidate_id`,
        message: "Public report item references a candidate that is not marked included.",
        repairable: false,
        details: { candidate_id: ref.id, status: candidate.status }
      });
    }
    if (candidate.included_in && candidate.included_in !== ref.section) {
      issues.push({
        code: "candidate_pool_reference_invalid",
        severity: "error",
        path: `${ref.path}.candidate_id`,
        message: "Public report item candidate is marked for a different section.",
        repairable: false,
        details: { candidate_id: ref.id, expected: ref.section, actual: candidate.included_in }
      });
    }
  }
}

function collectBuilderTranslationIssues(report, issues, aiReviewTasks) {
  const items = Array.isArray(report?.builder_observations) ? report.builder_observations : [];
  items.forEach((item, index) => {
    const originalText = String(item?.original_text || "").trim();
    const translation = String(item?.translation || "").trim();
    const content = String(item?.content || "").trim();
    if (originalText && translation) {
      aiReviewTasks.push({
        kind: "translation_fidelity",
        path: `builder_observations[${index}].translation`,
        source_path: `builder_observations[${index}].original_text`,
        instruction: "Check whether translation preserves the full meaning of original_text without summarizing or adding facts."
      });
    }
    if (originalText && !translation) {
      issues.push({
        code: "builder_translation_missing",
        severity: "error",
        path: `builder_observations[${index}].translation`,
        message: "Builder observation has original_text but no translation.",
        repairable: false
      });
    }
    if (translation && content && translation !== content) {
      issues.push({
        code: "builder_content_translation_mismatch",
        severity: "error",
        path: `builder_observations[${index}].content`,
        message: "Builder observation content must match translation.",
        repairable: true
      });
    }
  });
}

function buildChecklist(issues, aiReviewTasks, context = {}) {
  const failedCodes = new Set(issues.filter((issue) => issue.severity === "error").map((issue) => issue.code));
  const warningCodes = new Set(issues.filter((issue) => issue.severity === "warning").map((issue) => issue.code));
  const candidateFailed = [
    "candidate_pool_not_checked",
    "candidate_pool_empty",
    "candidate_id_missing",
    "candidate_pool_reference_invalid"
  ].some((code) => failedCodes.has(code));
  return [
    {
      id: "plain_language",
      ok: !failedCodes.has("plain_language_stock_phrase"),
      status: failedCodes.has("plain_language_stock_phrase") ? "failed" : "passed"
    },
    {
      id: "highlight_density",
      ok: !failedCodes.has("highlight_too_large") && !failedCodes.has("highlight_overused"),
      status: failedCodes.has("highlight_too_large") || failedCodes.has("highlight_overused") ? "failed" : warningCodes.has("highlight_missing") ? "warning" : "passed"
    },
    {
      id: "builder_translation",
      ok: !failedCodes.has("builder_translation_missing") && !failedCodes.has("builder_content_translation_mismatch"),
      status: failedCodes.has("builder_translation_missing") || failedCodes.has("builder_content_translation_mismatch") ? "failed" : aiReviewTasks.some((task) => task.kind === "translation_fidelity") ? "ai_review_required" : "passed"
    },
    {
      id: "content_density",
      ok: !warningCodes.has("content_too_thin"),
      status: warningCodes.has("content_too_thin") ? "warning" : "passed"
    },
    {
      id: "hot_blog_editorial_quality",
      ok: !failedCodes.has("hot_blog_summary_untranslated") && !failedCodes.has("hot_blog_points_invalid") && !failedCodes.has("hot_blog_summary_too_thin") && !failedCodes.has("hot_blog_summary_template"),
      status: failedCodes.has("hot_blog_summary_untranslated") || failedCodes.has("hot_blog_points_invalid") || failedCodes.has("hot_blog_summary_too_thin") || failedCodes.has("hot_blog_summary_template") ? "failed" : "passed"
    },
    {
      id: "autodraft_editorial_rewrite",
      ok: !failedCodes.has("autodraft_template_phrase"),
      status: failedCodes.has("autodraft_template_phrase") ? "failed" : context.autoDraft ? "passed" : "not_applicable"
    },
    {
      id: "candidate_backrefs",
      ok: !candidateFailed,
      status: candidateFailed ? "failed" : context.candidatePoolChecked ? "passed" : context.autoDraft ? "failed" : "not_applicable"
    }
  ];
}

function stripNoisyHighlights(value, overrideLimits = {}) {
  const limits = { ...DEFAULT_HIGHLIGHT_LIMITS, ...(overrideLimits || {}) };
  let count = 0;
  const plainLength = stripMarkup(value).length || 1;
  const matches = [...value.matchAll(/==([^=\n]+)==/g)];
  if (matches.length === 0) {
    return value;
  }
  const highlightedChars = matches.reduce((sum, match) => sum + visibleHighlightText(match[1]).length, 0);
  const textIsOverHighlighted = highlightedChars / plainLength > limits.maxRatio;
  return value.replace(/==([^=\n]+)==/g, (match, inner) => {
    count += 1;
    if (textIsOverHighlighted || count > limits.maxPerText || visibleHighlightText(inner).length > limits.maxChars) {
      return inner;
    }
    return match;
  });
}

function isAllowedRepairPath(pathName) {
  return REPAIRABLE_PUBLIC_TEXT_PATTERNS.some((pattern) => pattern.test(pathName));
}

function collectCandidateRefs(report) {
  const refs = [];
  for (const section of CANDIDATE_REF_SECTIONS) {
    const items = Array.isArray(report?.[section]) ? report[section] : [];
    items.forEach((item, index) => {
      refs.push({
        section,
        path: `${section}[${index}]`,
        id: String(item?.candidate_id || "").trim()
      });
    });
  }
  return refs;
}

function isAutoDraftReport(report) {
  const skills = Array.isArray(report?.self_check?.builder_skill_used) ? report.self_check.builder_skill_used : [];
  return skills.includes("candidate-pool-autodraft") ||
    String(report?.source_window?.notes || "").includes("report:draft") ||
    String(report?.self_check?.notes || "").includes("report:draft");
}

function parsePath(pathName) {
  const tokens = [];
  for (const part of String(pathName || "").split(".")) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)(?:\[(\d+)\])?$/.exec(part);
    if (!match || ["__proto__", "prototype", "constructor"].includes(match[1])) {
      throw new PublisherError("quality_repair_path_invalid", `Invalid repair path: ${pathName}`);
    }
    tokens.push(match[1]);
    if (match[2] !== undefined) {
      tokens.push(Number.parseInt(match[2], 10));
    }
  }
  return tokens;
}

function pathExists(root, tokens) {
  try {
    getPath(root, tokens);
    return true;
  } catch {
    return false;
  }
}

function getPath(root, tokens) {
  let current = root;
  for (const token of tokens) {
    if (current === null || current === undefined || !(token in current)) {
      throw new PublisherError("quality_repair_path_not_found", `Repair path not found: ${tokens.join(".")}`);
    }
    current = current[token];
  }
  return current;
}

function setPath(root, tokens, value) {
  const parent = getPath(root, tokens.slice(0, -1));
  parent[tokens[tokens.length - 1]] = value;
}

function stripRootPath(pathName) {
  return String(pathName || "").replace(/^\$\./, "");
}

function stripMarkup(value) {
  return String(value || "").replace(/==([^=\n]+)==/g, "$1").replace(/\*\*([^*]+)\*\*/g, "$1");
}

function visibleHighlightText(value) {
  const text = String(value || "").trim();
  const pipeIndex = text.indexOf("|");
  return pipeIndex >= 0 ? text.slice(pipeIndex + 1).trim() : text;
}
