import { createHash } from "node:crypto";

import { validatePersistedAifyTodayItem } from "./aify-today-picks.js";
import { containsSecretLikeText } from "./privacy.js";
import { isPlaceholderText } from "./signal-admission.js";

const INTERNAL_COPY_PATTERN = /treat\s+this\s+as|trace\s+it\s+to|selection_reason|入选标准|优先核查|给\s*AI\s*看的/i;
const HTML_OR_CONTROL_PATTERN = /<\/?[A-Za-z][^>]*(?:>|$)|[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const TRUSTED_SOURCE_EXCERPT_ORIGINS = new Set([
  "source_feed",
  "source_metadata",
  "source_original_text",
  "structured_source"
]);
const COMMON_ABBREVIATIONS = new Set([
  "e.g.",
  "i.e.",
  "u.s.",
  "u.k.",
  "dr.",
  "mr.",
  "mrs.",
  "ms.",
  "prof.",
  "no.",
  "vs.",
  "inc.",
  "ltd.",
  "corp.",
  "llc."
]);
const CORPORATE_SUFFIX_ABBREVIATIONS = new Set(["inc.", "ltd.", "corp.", "llc."]);
const COMMON_TLDS = new Set(["ai", "app", "co", "com", "dev", "edu", "gov", "io", "net", "org"]);
const ENGLISH_AUXILIARIES = new Set([
  "am", "is", "are", "was", "were", "be", "been", "has", "have", "had", "do", "does", "did",
  "can", "could", "will", "would", "should", "may", "might", "must"
]);
const ENGLISH_IRREGULAR_FINITE_VERBS = new Map([
  ["beat", "beat"], ["became", "become"], ["built", "build"], ["found", "find"], ["grew", "grow"],
  ["kept", "keep"], ["led", "lead"], ["made", "make"], ["ran", "run"], ["showed", "show"], ["won", "win"], ["wrote", "write"]
]);
const ENGLISH_BASE_VERBS = new Set([
  "achieve", "add", "address", "adopt", "allow", "announce", "apply", "base", "beat", "build", "collect", "compare", "confirm",
  "contain", "create", "deliver", "demonstrate", "deploy", "derive", "describe", "design", "detail", "develop", "discover", "document", "emphasize", "enable", "establish", "fix",
  "evaluate", "examine", "explain", "expose", "extend", "find", "hear", "help", "highlight", "identify", "improve", "include", "increase", "indicate",
  "introduce", "keep", "launch", "measure", "notice", "observe", "offer", "optimize", "outperform", "pause", "power", "present", "prevent", "preserve", "propose",
  "provide", "publish", "record", "recover", "reduce", "reject", "release", "report", "restore", "resume", "reveal",
  "route", "run", "save", "scale", "see", "ship", "show", "stop", "stress", "support", "surpass", "test", "track", "train", "underscore", "unveil", "update",
  "use", "validate", "verify", "watch", "work"
]);
const ENGLISH_RELATIVE_PRONOUNS = new Set([
  "how", "that", "what", "when", "where", "whether", "which", "who", "whom", "whose", "why"
]);
const ENGLISH_CLAUSE_COORDINATORS = new Set(["and", "but", "nor", "or"]);
const ENGLISH_SUBORDINATE_MARKERS = new Set([
  "after", "although", "as", "because", "before", "if", "once", "since", "unless", "when", "whereas", "while"
]);
const ENGLISH_AUXILIARY_MODIFIERS = new Set([
  "also", "already", "even", "just", "more", "not", "now", "often", "only", "still", "very"
]);
const ENGLISH_LEADING_NON_SUBJECT_WORDS = new Set([
  "as", "at", "by", "for", "from", "in", "into", "of", "on", "through", "to", "using", "with", "without"
]);
const ENGLISH_PARTICIPLE_COMPLEMENTS = new Set([
  "across", "after", "against", "amid", "among", "around", "as", "at", "before", "by", "during", "for", "from", "in", "into", "on", "over", "through", "to", "under", "using", "via", "with"
]);
const ENGLISH_ACTIVE_PAST_COMPLEMENTS = new Map([
  ["grow", new Set(["by", "from", "in", "over", "through"])],
  ["improve", new Set(["after", "before", "by", "from", "in", "on", "over", "through"])],
  ["launch", new Set(["after", "at", "before", "during", "in", "on"])],
  ["report", new Set(["on"])],
  ["run", new Set(["against", "at", "for", "in", "on", "with"])]
]);
const ENGLISH_AGENTIVE_SUBJECTS = new Set([
  "agent", "agents", "author", "authors", "company", "developer", "developers", "engineer", "engineers", "he", "i", "it", "lab",
  "organization", "researcher", "researchers", "she", "team", "teams", "they", "we", "you"
]);
const ENGLISH_SUBJECT_PREPOSITIONS = new Set([
  "at", "by", "for", "from", "in", "into", "of", "on", "through", "to", "using", "with", "without"
]);
const ENGLISH_CONTENT_CLAUSE_PARTICIPLE_BASES = new Set([
  "acknowledge", "allege", "announce", "argue", "assert", "assume", "believe", "claim", "conclude", "confirm", "contend",
  "demonstrate", "discover", "emphasize", "estimate", "expect", "find", "hypothesize", "imply", "indicate", "infer",
  "maintain", "note", "posit", "predict", "propose", "prove", "report", "reveal", "say", "show", "state", "stress",
  "suggest", "underscore", "warn"
]);
const ENGLISH_SMALL_CLAUSE_PARTICIPLE_BASES = new Set(["hear", "notice", "observe", "see", "watch"]);
const ENGLISH_CLAUSE_DETERMINERS = new Set(["a", "an", "her", "his", "its", "our", "that", "the", "their", "these", "this", "those"]);
const ENGLISH_NOMINAL_PARTICIPLE_BASES = new Set(["report", "warn"]);
const ENGLISH_NOMINAL_PARTICIPLE_HEADS = new Set(["component", "framework", "layer", "pipeline", "platform", "service", "system", "tool"]);
const ENGLISH_NOMINAL_HEADS = new Set([
  "agent", "api", "architecture", "benchmark", "capability", "component", "data", "engine", "framework", "guide", "infrastructure",
  "layer", "law", "library", "memo", "method", "model", "paper", "pipeline", "platform", "practice", "process", "report",
  "repository", "researcher", "runtime", "service", "study", "system", "task", "team", "tool", "toolkit", "worker", "workflow"
]);
const CJK_PREDICATE_PATTERN = /(?:支持|提供|发布|推出|新增|改进|解释|说明|表明|显示|证明|发现|识别|提出|展示|记录|复盘|构建|实现|采用|引入|允许|帮助|通过|用于|解决|提升|降低|避免|防止|包含|覆盖|保留|恢复|运行|路由|保存|验证|评估|分析|监控|生成|训练|开源|宣布|描述|达到|超过|优于|能够|可以|正在)/u;
const CJK_ATTRIBUTIVE_START_PATTERN = /(?:一个|一种|一套|面向|用于|可用于|基于|围绕|聚焦)/u;
const CJK_BARE_ATTRIBUTIVE_START_PATTERN = /^(?:支持|提供)[^。！？]*的/u;
const CJK_ATTRIBUTIVE_HEAD_PATTERN = /(?:工具包|框架|平台|系统|模型|方法|方案|产品|能力|实践|指南|架构|代码库|库|服务|技术栈)$/u;
const CJK_DIRECT_ATTRIBUTIVE_VERB_PATTERN = new RegExp(
  `${CJK_PREDICATE_PATTERN.source}(?:出|出来|后)?的`,
  "gu"
);
const CJK_PREDICATE_SCAN_PATTERN = new RegExp(CJK_PREDICATE_PATTERN.source, "gu");
const CJK_CLAUSE_SUBJECT_HEAD_PATTERN = /(?:工具包|框架|平台|系统|模型|方法|方案|产品|项目|研究|团队|公司|实验室|研究者|开发者|运行时|代码库|服务|它|他们|她们|我们)$/u;
const CJK_CLEAR_FINITE_PREDICATES = new Set([
  "支持", "提供", "改进", "解释", "说明", "表明", "显示", "证明", "发现", "识别", "提出", "允许", "帮助", "解决",
  "提升", "降低", "避免", "防止", "包含", "覆盖", "达到", "超过", "优于", "能够", "可以", "正在"
]);
const CJK_NOMINAL_TAIL_PATTERN = /^(?:能力|性能|指标|水平|案例|方法|系统|模型|工具|架构|实践|方案|结果|数据|功能|机制)$/u;

export function buildSignalSummary(options = {}) {
  const signalId = String(options.signalId || "");
  const observations = [...(Array.isArray(options.observations) ? options.observations : [])]
    .sort((left, right) => String(left?.id || "").localeCompare(String(right?.id || "")));
  const trusted = observations.find((item) => item?.source_id === "aify_today_picks" && item?.upstream);
  if (trusted) {
    const persistedValidation = validatePersistedAifyTodayItem(trusted.upstream, {
      reportDate: trusted.upstream.upstream_selection_date
    });
    if (persistedValidation.valid) return trustedUpstreamSummary(signalId, trusted);
    return failedSummary(signalId, "trusted_upstream_invalid", "failed", observations);
  }

  const limits = {
    min: Number(options.contract?.summary?.min_length || 20),
    max: Number(options.contract?.summary?.max_length || 360)
  };
  const sourceSynopsis = bestSourceSynopsis(observations, limits);
  if (sourceSynopsis.ready) return sourceSynopsisSummary(signalId, sourceSynopsis);

  const proposal = summaryProposalForSignal(signalId, options.summaryProposals);
  if (proposal) return validateGeneratedSummary(signalId, proposal, observations, limits);
  return failedSummary(signalId, sourceSynopsis.failure_code || "source_synopsis_missing", sourceSynopsis.had_material ? "failed" : "pending", observations);
}

function trustedUpstreamSummary(signalId, observation) {
  const summary = observation.upstream.summary;
  return {
    status: "ready",
    source_summary: summary,
    origin: "upstream_editorial",
    failure_code: null,
    receipt: {
      receipt_id: summaryReceiptId(signalId, "upstream_editorial", summary),
      signal_id: signalId,
      status: "ready",
      origin: "upstream_editorial",
      source_summary_hash: sha256(summary),
      material_content_hashes: [observation.content_hash],
      claim_spans: [],
      critic: { status: "not_required_trusted_upstream", reason_code: null },
      semantic_verifier: { status: "not_required_trusted_upstream", reason_code: null },
      semantic_calls: zeroSemanticCalls(),
      failure_code: null
    }
  };
}

function bestSourceSynopsis(observations, limits) {
  let firstFailure = "source_synopsis_missing";
  let hadMaterial = false;
  for (const observation of observations) {
    const summary = String(observation?.excerpt || "").trim();
    if (!summary) continue;
    hadMaterial = true;
    if (!isTrustedSourceExcerpt(observation)) {
      if (firstFailure === "source_synopsis_missing") firstFailure = "source_synopsis_unverified";
      continue;
    }
    const gate = sourceSummaryGate(summary, observation?.title, limits);
    if (!gate.ok) {
      if (firstFailure === "source_synopsis_missing") firstFailure = gate.code;
      continue;
    }
    return {
      ready: true,
      summary,
      observation,
      had_material: true,
      failure_code: null
    };
  }
  return {
    ready: false,
    summary: null,
    observation: null,
    had_material: hadMaterial,
    failure_code: firstFailure
  };
}

function sourceSynopsisSummary(signalId, candidate) {
  const summary = candidate.summary;
  const observation = candidate.observation;
  return {
    status: "ready",
    source_summary: summary,
    origin: "source_synopsis",
    failure_code: null,
    receipt: {
      receipt_id: summaryReceiptId(signalId, "source_synopsis", summary),
      signal_id: signalId,
      status: "ready",
      origin: "source_synopsis",
      source_summary_hash: sha256(summary),
      material_content_hashes: [observation.content_hash],
      claim_spans: [{
        observation_id: observation.observation_id,
        content_hash: observation.content_hash,
        field: "excerpt",
        start: 0,
        end: summary.length,
        text_hash: sha256(summary)
      }],
      critic: { status: "not_required_source_synopsis", reason_code: null },
      semantic_verifier: { status: "passed_exact_span", reason_code: null },
      semantic_calls: zeroSemanticCalls(),
      failure_code: null
    }
  };
}

function validateGeneratedSummary(signalId, proposal, observations, limits) {
  const summary = String(proposal?.source_summary || "").trim();
  const gate = sourceSummaryGate(summary, proposal?.title || "", limits);
  if (!gate.ok) return failedSummary(signalId, gate.code, "failed", observations, proposal);
  if (proposal?.critic?.status !== "passed") return failedSummary(signalId, "critic_failed", "failed", observations, proposal);
  if (proposal?.semantic_verifier?.status !== "passed") return failedSummary(signalId, "semantic_verifier_failed", "failed", observations, proposal);
  const spans = Array.isArray(proposal?.claim_spans) ? proposal.claim_spans : [];
  if (spans.length === 0 || spans.some((span) => !validClaimSpan(span, observations))) {
    return failedSummary(signalId, "claim_span_invalid", "failed", observations, proposal);
  }
  const semanticCalls = normalizeSemanticCalls(proposal.semantic_calls, {
    summary: 0,
    critic: 0,
    semantic_verifier: 0
  });
  if (semanticCalls.summary < 1 || semanticCalls.critic < 1 || semanticCalls.semantic_verifier < 1) {
    return failedSummary(signalId, "semantic_call_evidence_missing", "failed", observations, proposal);
  }
  return {
    status: "ready",
    source_summary: summary,
    origin: "model_generated",
    failure_code: null,
    receipt: {
      receipt_id: summaryReceiptId(signalId, "model_generated", summary),
      signal_id: signalId,
      status: "ready",
      origin: "model_generated",
      source_summary_hash: sha256(summary),
      material_content_hashes: uniqueStrings(spans.map((item) => item.content_hash)),
      claim_spans: spans.map((span) => ({
        observation_id: span.observation_id,
        content_hash: span.content_hash,
        field: "excerpt",
        start: span.start,
        end: span.end,
        text_hash: span.text_hash
      })),
      critic: { status: "passed", reason_code: null },
      semantic_verifier: { status: "passed", reason_code: null },
      semantic_calls: semanticCalls,
      failure_code: null
    }
  };
}

function failedSummary(signalId, failureCode, status, observations, proposal = null) {
  return {
    status,
    source_summary: null,
    origin: "none",
    failure_code: failureCode,
    receipt: {
      receipt_id: summaryReceiptId(signalId, "none", failureCode),
      signal_id: signalId,
      status,
      origin: "none",
      source_summary_hash: null,
      material_content_hashes: uniqueStrings(observations.map((item) => item?.content_hash)),
      claim_spans: [],
      critic: {
        status: proposal?.critic?.status === "failed" ? "failed" : "not_run",
        reason_code: proposal?.critic?.reason_code || null
      },
      semantic_verifier: {
        status: proposal?.semantic_verifier?.status === "failed" ? "failed" : "not_run",
        reason_code: proposal?.semantic_verifier?.reason_code || null
      },
      semantic_calls: normalizeSemanticCalls(proposal?.semantic_calls),
      failure_code: failureCode
    }
  };
}

function sourceSummaryGate(summary, title, limits) {
  if (!summary) return { ok: false, code: "source_synopsis_missing" };
  if (summary.length < limits.min) return { ok: false, code: "source_synopsis_too_short" };
  if (summary.length > limits.max) return { ok: false, code: "source_synopsis_too_long" };
  if (containsSecretLikeText(summary)) return { ok: false, code: "source_synopsis_secret" };
  if (HTML_OR_CONTROL_PATTERN.test(summary)) return { ok: false, code: "source_synopsis_unsafe_text" };
  if (isPlaceholderText(summary)) return { ok: false, code: "source_synopsis_placeholder" };
  if (INTERNAL_COPY_PATTERN.test(summary)) return { ok: false, code: "source_synopsis_internal_copy" };
  if (normalizedCopy(summary) === normalizedCopy(title)) return { ok: false, code: "source_synopsis_title_repetition" };
  if (!isSentenceLikeSummary(summary)) return { ok: false, code: "source_synopsis_fragment" };
  if (sentenceCount(summary) > 1) return { ok: false, code: "source_synopsis_not_one_sentence" };
  return { ok: true, code: "" };
}

function validClaimSpan(span, observations) {
  const observation = observations.find((item) => item?.observation_id === span?.observation_id);
  if (
    !observation ||
    !isTrustedSourceExcerpt(observation) ||
    observation.content_hash !== span?.content_hash ||
    span?.field !== "excerpt"
  ) return false;
  const excerpt = String(observation.excerpt || "");
  const start = Number(span.start);
  const end = Number(span.end);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > excerpt.length) return false;
  return sha256(excerpt.slice(start, end)) === span.text_hash;
}

function summaryProposalForSignal(signalId, proposals) {
  if (proposals instanceof Map) return proposals.get(signalId) || null;
  if (Array.isArray(proposals)) return proposals.find((item) => item?.signal_id === signalId) || null;
  return proposals?.[signalId] || null;
}

function sentenceCount(value) {
  const text = String(value || "").trim();
  if (!text) return 0;
  return hasInternalSentenceBoundary(text) ? 2 : 1;
}

function hasInternalSentenceBoundary(text) {
  for (let index = 0; index < text.length; index += 1) {
    const punctuation = text[index];
    if (!["。", "！", "？", ".", "!", "?"].includes(punctuation)) continue;
    let cursor = index + 1;
    while (cursor < text.length && /[”’"')）\]]/.test(text[cursor])) cursor += 1;
    const whitespaceStart = cursor;
    while (cursor < text.length && /\s/.test(text[cursor])) cursor += 1;
    if (cursor >= text.length) continue;
    if (["。", "！", "？", "!", "?"].includes(punctuation)) return true;

    const previous = text[index - 1] || "";
    const next = text[cursor] || "";
    if (text[index - 1] === "." || text[index + 1] === ".") continue;
    if (/\d/.test(previous) && /\d/.test(next) && cursor === index + 1) continue;
    if (
      cursor === index + 1 &&
      /[A-Za-z]/.test(previous) &&
      /[A-Za-z]/.test(next) &&
      text[cursor + 1] === "."
    ) continue;
    const token = text.slice(0, index + 1).match(/([A-Za-z](?:[A-Za-z.]*)\.)$/)?.[1]?.toLowerCase() || "";
    if (CORPORATE_SUFFIX_ABBREVIATIONS.has(token)) {
      const nextToken = text.slice(cursor).match(/^([A-Za-z]+)/)?.[1] || "";
      if (cursor > whitespaceStart && /^(?:it|they|the|this|that|we|he|she|a|an)$/i.test(nextToken)) return true;
      continue;
    }
    if (COMMON_ABBREVIATIONS.has(token) || /^(?:[a-z]\.){2,}$/.test(token)) continue;
    if (/^[a-z]\.$/i.test(token) && cursor > whitespaceStart && /[A-Z]/.test(next)) continue;
    if (cursor === whitespaceStart && isCommonDomainPeriod(text, index)) continue;
    return true;
  }
  return false;
}

function isCommonDomainPeriod(text, index) {
  const left = text.slice(0, index).match(/([A-Za-z0-9-]+)$/)?.[1] || "";
  const rightToken = text.slice(index + 1).match(/^([A-Za-z]{2,})(?=$|[/:\s,.!?])/i)?.[1] || "";
  return Boolean(left && rightToken === rightToken.toLowerCase() && COMMON_TLDS.has(rightToken));
}

function isSentenceLikeSummary(value) {
  const text = String(value || "").trim();
  const cjkCount = (text.match(/[\u3400-\u9fff]/g) || []).length;
  if (cjkCount >= 8) return hasCjkFinitePredicate(text) || hasEnglishFinitePredicate(text);
  const words = text.match(/[A-Za-z][A-Za-z0-9'-]*/g) || [];
  return words.length >= 3 &&
    /[.!?][”’"')）\]]*$/.test(text) &&
    hasEnglishFinitePredicate(text);
}

function hasEnglishFinitePredicate(value) {
  const words = englishMainClauseWords(value);
  const markerIndices = [
    words.findIndex((word) => ENGLISH_RELATIVE_PRONOUNS.has(word)),
    words.findIndex((word, index) => index > 0 && isEnglishEmbeddedIngMarker(words, index))
  ].filter((index) => index >= 0);
  const embeddedClauseMarkerIndex = markerIndices.length > 0 ? Math.min(...markerIndices) : -1;
  let embeddedPredicate = null;
  for (const [index, word] of words.entries()) {
    const verb = englishFiniteVerb(word);
    if (index === 0 || !verb || words[index - 1] === "to") continue;

    if (embeddedClauseMarkerIndex >= 0 && index > embeddedClauseMarkerIndex) {
      if (!embeddedPredicate) {
        embeddedPredicate = { index, kind: verb.kind };
        continue;
      }
      const interveningWords = words.slice(embeddedPredicate.index + 1, index);
      const followsRelativeAuxiliary = embeddedPredicate.kind === "auxiliary" &&
        (verb.kind === "base" || verb.kind === "past") &&
        interveningWords.every((candidate) => ENGLISH_AUXILIARY_MODIFIERS.has(candidate) || candidate.endsWith("ly"));
      const coordinatorIndex = interveningWords.findLastIndex((candidate) => ENGLISH_CLAUSE_COORDINATORS.has(candidate));
      const continuesRelativeClause = coordinatorIndex >= 0;
      const entersNestedSubordinateClause = interveningWords.some((candidate) => ENGLISH_SUBORDINATE_MARKERS.has(candidate));
      const entersNestedRelativeClause = interveningWords.some((candidate, relativeIndex) => (
        ENGLISH_RELATIVE_PRONOUNS.has(candidate) ||
        isEnglishEmbeddedIngMarker(words, embeddedPredicate.index + 1 + relativeIndex)
      ));
      if (followsRelativeAuxiliary || continuesRelativeClause || entersNestedSubordinateClause || entersNestedRelativeClause) {
        embeddedPredicate = { index, kind: verb.kind };
        continue;
      }
    }

    const subjectWords = embeddedClauseMarkerIndex >= 0 && index > embeddedClauseMarkerIndex
      ? words.slice(0, embeddedClauseMarkerIndex)
      : words.slice(0, index);
    if (!hasEnglishClauseSubject(subjectWords)) continue;
    if (verb.kind === "base" && !hasPluralEnglishSubject(subjectWords)) continue;
    if (embeddedClauseMarkerIndex >= 0 && index > embeddedClauseMarkerIndex && !hasIndependentMaterialAfterEnglishPredicate(words, index)) continue;
    if (isReducedParticipleFragment(words, index, verb, subjectWords)) continue;
    return true;
  }
  return false;
}

function englishMainClauseWords(value) {
  const text = String(value || "").trim();
  const leadingAdjunct = /^(?:according\s+to|after|although|as(?:\s+long\s+as)?|assuming|because|before|by|despite|during|even\s+(?:if|though|when)|for|from|given(?:\s+that)?|having|if|in(?:\s+case)?|on|once|provided(?:\s+that)?|since|supposing|though|through|to|unless|until|using|when|whenever|whereas|wherever|while|with|without)\b/i;
  if (!leadingAdjunct.test(text)) return englishWords(text);
  const boundaryIndex = text.search(/[,;]/);
  return boundaryIndex < 0 ? [] : englishWords(text.slice(boundaryIndex + 1));
}

function englishWords(value) {
  return String(value || "").match(/[A-Za-z][A-Za-z'-]*/g)?.map((word) => word.toLowerCase()) || [];
}

function isEnglishEmbeddedIngMarker(words, index) {
  const word = words[index] || "";
  if (!word.endsWith("ing")) return false;
  const stem = word.slice(0, -3);
  const candidates = [stem, `${stem}e`];
  if (stem.length >= 2 && stem.at(-1) === stem.at(-2)) candidates.push(stem.slice(0, -1));
  const isContentClauseParticiple = candidates.some((candidate) => ENGLISH_CONTENT_CLAUSE_PARTICIPLE_BASES.has(candidate));
  if (isContentClauseParticiple && !isEnglishPrenominalIngModifier(words, index, candidates)) return true;
  const isSmallClauseParticiple = candidates.some((candidate) => ENGLISH_SMALL_CLAUSE_PARTICIPLE_BASES.has(candidate));
  if (isSmallClauseParticiple && hasCompactEmbeddedClause(words, index)) return true;
  return hasAgreementBoundEmbeddedClause(words, index);
}

function isEnglishPrenominalIngModifier(words, index, baseCandidates) {
  if (!isEnglishNominalHead(words[index + 1])) return false;
  if (!isEnglishNominalHead(words[index - 1])) return true;
  return baseCandidates.some((candidate) => ENGLISH_NOMINAL_PARTICIPLE_BASES.has(candidate)) &&
    ENGLISH_NOMINAL_PARTICIPLE_HEADS.has(englishNominalHeadBase(words[index + 1])) &&
    hasImmediateOuterPredicate(words, index + 2);
}

function isEnglishNominalHead(word) {
  return Boolean(englishNominalHeadBase(word));
}

function englishNominalHeadBase(word) {
  if (!word) return "";
  if (ENGLISH_NOMINAL_HEADS.has(word)) return word;
  const singular = word.endsWith("s") ? word.slice(0, -1) : "";
  return ENGLISH_NOMINAL_HEADS.has(singular) ? singular : "";
}

function hasImmediateOuterPredicate(words, startIndex) {
  for (let index = startIndex; index < words.length; index += 1) {
    if (englishFiniteVerb(words[index])) return true;
    if (!ENGLISH_AUXILIARY_MODIFIERS.has(words[index]) && !words[index].endsWith("ly")) return false;
  }
  return false;
}

function hasAgreementBoundEmbeddedClause(words, index) {
  const outerSubject = words.slice(0, index);
  if (!hasEnglishClauseSubject(outerSubject)) return false;
  for (let candidateIndex = index + 1; candidateIndex < words.length; candidateIndex += 1) {
    const verb = englishFiniteVerb(words[candidateIndex]);
    if (!verb || words[candidateIndex - 1] === "to") continue;
    const innerSubject = words.slice(index + 1, candidateIndex);
    if (!hasEnglishClauseSubject(innerSubject)) return false;
    return englishSubjectAgreesWithVerb(innerSubject, verb) && !englishSubjectAgreesWithVerb(outerSubject, verb);
  }
  return false;
}

function hasCompactEmbeddedClause(words, index) {
  for (let candidateIndex = index + 1; candidateIndex < words.length; candidateIndex += 1) {
    const verb = englishFiniteVerb(words[candidateIndex]);
    if (!verb || words[candidateIndex - 1] === "to") continue;
    const innerSubject = words.slice(index + 1, candidateIndex);
    if (!hasEnglishClauseSubject(innerSubject)) return false;
    return innerSubject.length === 1 || (innerSubject.length <= 3 && ENGLISH_CLAUSE_DETERMINERS.has(innerSubject[0]));
  }
  return false;
}

function englishSubjectAgreesWithVerb(subjectWords, verb) {
  if (verb.kind === "base") return hasPluralEnglishSubject(subjectWords);
  if (verb.kind === "third_person") return !hasPluralEnglishSubject(subjectWords);
  return true;
}

function englishFiniteVerb(word) {
  if (ENGLISH_AUXILIARIES.has(word)) return { kind: "auxiliary", base: word };
  if (ENGLISH_IRREGULAR_FINITE_VERBS.has(word)) {
    return { kind: "past", base: ENGLISH_IRREGULAR_FINITE_VERBS.get(word) };
  }
  if (ENGLISH_BASE_VERBS.has(word)) return { kind: "base", base: word };

  if (word.endsWith("ied")) {
    const base = `${word.slice(0, -3)}y`;
    if (ENGLISH_BASE_VERBS.has(base)) return { kind: "past", base };
  }
  if (word.endsWith("ed")) {
    const candidates = [word.slice(0, -1), word.slice(0, -2)];
    const shortened = word.slice(0, -2);
    if (shortened.length >= 2 && shortened.at(-1) === shortened.at(-2)) candidates.push(shortened.slice(0, -1));
    const base = candidates.find((candidate) => ENGLISH_BASE_VERBS.has(candidate));
    if (base) return { kind: "past", base };
  }
  if (word.endsWith("ies")) {
    const base = `${word.slice(0, -3)}y`;
    if (ENGLISH_BASE_VERBS.has(base)) return { kind: "third_person", base };
  }
  if (word.endsWith("es")) {
    const base = [word.slice(0, -1), word.slice(0, -2)]
      .find((candidate) => ENGLISH_BASE_VERBS.has(candidate));
    if (base) return { kind: "third_person", base };
  }
  if (word.endsWith("s")) {
    const base = word.slice(0, -1);
    if (ENGLISH_BASE_VERBS.has(base)) return { kind: "third_person", base };
  }
  return null;
}

function hasEnglishClauseSubject(words) {
  if (words.length === 0 || ENGLISH_LEADING_NON_SUBJECT_WORDS.has(words[0])) return false;
  return Boolean(englishSubjectHead(words));
}

function englishSubjectHead(words) {
  const prepositionIndex = words.findIndex((word, index) => index > 0 && ENGLISH_SUBJECT_PREPOSITIONS.has(word));
  const subjectCore = prepositionIndex < 0 ? words : words.slice(0, prepositionIndex);
  return [...subjectCore].reverse().find((word) => (
    !["a", "an", "the", "new", "latest"].includes(word) &&
    !ENGLISH_AUXILIARY_MODIFIERS.has(word) &&
    !word.endsWith("ly")
  )) || "";
}

function hasIndependentMaterialAfterEnglishPredicate(words, index) {
  const firstMaterial = words.slice(index + 1).find((word) => (
    !ENGLISH_AUXILIARY_MODIFIERS.has(word) && !word.endsWith("ly")
  ));
  return Boolean(firstMaterial && !ENGLISH_PARTICIPLE_COMPLEMENTS.has(firstMaterial));
}

function isReducedParticipleFragment(words, index, verb, subjectWords) {
  if (verb.kind !== "past") return false;
  const subjectHead = englishSubjectHead(subjectWords);
  const following = words.slice(index + 1);
  const firstMaterial = following.find((word) => (
    !ENGLISH_AUXILIARY_MODIFIERS.has(word) &&
    !["currently", "newly", "previously", "recently", "today", "yesterday"].includes(word) &&
    !word.endsWith("ly")
  ));
  const hasReducedComplement = !firstMaterial || ENGLISH_PARTICIPLE_COMPLEMENTS.has(firstMaterial);
  if (!hasReducedComplement || ENGLISH_AGENTIVE_SUBJECTS.has(subjectHead)) return false;
  if (["a", "an"].includes(subjectWords[0])) return true;
  return !ENGLISH_ACTIVE_PAST_COMPLEMENTS.get(verb.base)?.has(firstMaterial);
}

function hasPluralEnglishSubject(words) {
  const subjectHead = englishSubjectHead(words);
  if (["we", "they", "these", "those", "you"].includes(subjectHead)) return true;
  if (words.includes("and")) return true;
  return subjectHead.endsWith("s") && !["analysis", "basis", "news", "series", "status", "this"].includes(subjectHead);
}

function hasCjkFinitePredicate(value) {
  const text = String(value || "").trim();
  if (isCjkAttributiveOnly(text)) return false;
  return CJK_PREDICATE_PATTERN.test(text) || /是(?:一个|一种|一套)/u.test(text);
}

function isCjkAttributiveOnly(value) {
  const text = String(value || "").trim().replace(/[。！？]+$/u, "");
  const lastAttributive = text.lastIndexOf("的");
  if (/^(?:一个|一种|一套)/u.test(text) && lastAttributive >= 0) {
    const prefix = text.slice(0, lastAttributive);
    const suffix = text.slice(lastAttributive + 1);
    if (CJK_PREDICATE_PATTERN.test(prefix) && !hasStandaloneCjkMainPredicate(suffix)) return true;
  }
  const directAttributives = [...text.matchAll(CJK_DIRECT_ATTRIBUTIVE_VERB_PATTERN)];
  if (directAttributives.length > 0 && lastAttributive >= 0) {
    const firstAttributive = directAttributives[0];
    const prefix = text.slice(0, firstAttributive.index);
    const suffix = text.slice(firstAttributive.index + firstAttributive[0].length);
    if (!hasStandaloneCjkMainPredicate(prefix) && !hasStandaloneCjkMainPredicate(suffix)) return true;
  }
  if (!CJK_ATTRIBUTIVE_HEAD_PATTERN.test(text)) return false;
  if (CJK_BARE_ATTRIBUTIVE_START_PATTERN.test(text)) return true;
  const marker = CJK_ATTRIBUTIVE_START_PATTERN.exec(text);
  if (!marker) return false;
  const markerIndex = marker.index;
  if (text.lastIndexOf("的") < markerIndex) return false;
  const prefix = text.slice(0, markerIndex);
  return !hasStandaloneCjkMainPredicate(prefix);
}

function hasStandaloneCjkMainPredicate(value) {
  const text = String(value || "").trim();
  if (/是(?:一个|一种|一套)?$/u.test(text)) return true;
  return [...text.matchAll(CJK_PREDICATE_SCAN_PATTERN)].some((match) => {
    if (text[match.index + match[0].length] === "的") return false;
    const subject = text.slice(0, match.index).trim();
    if (!subject) return false;
    const subjectResidue = subject
      .replace(CJK_PREDICATE_SCAN_PATTERN, "")
      .replace(/(?:并且|而且|但仍|同时|以及|预计|应该|可能|与|和|且|也|还|仅|只|更|最|可|会|将|已|曾|正|在|的|了|着|过)/gu, "")
      .trim();
    const hasSubject = CJK_CLAUSE_SUBJECT_HEAD_PATTERN.test(subject) ||
      /[\u3400-\u9fff]/u.test(subjectResidue) ||
      /[A-Za-z][A-Za-z0-9._-]*$/u.test(subjectResidue);
    if (!hasSubject) return false;
    const remainder = text.slice(match.index + match[0].length).trim();
    if (/^[了着过]/u.test(remainder)) return true;
    return CJK_CLEAR_FINITE_PREDICATES.has(match[0]) && !CJK_NOMINAL_TAIL_PATTERN.test(remainder);
  });
}

function isTrustedSourceExcerpt(observation) {
  const excerpt = String(observation?.excerpt || "");
  return Boolean(
    excerpt &&
    excerpt === excerpt.trim() &&
    TRUSTED_SOURCE_EXCERPT_ORIGINS.has(String(observation?.excerpt_origin || "")) &&
    observation?.excerpt_hash === sha256(excerpt)
  );
}

function normalizedCopy(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9\u3400-\u9fff]+/g, "");
}

function normalizeSemanticCalls(value, defaults = {}) {
  const input = value && typeof value === "object" ? value : {};
  return {
    summary: nonNegativeInteger(input.summary, defaults.summary || 0),
    translation: nonNegativeInteger(input.translation, defaults.translation || 0),
    critic: nonNegativeInteger(input.critic, defaults.critic || 0),
    semantic_verifier: nonNegativeInteger(input.semantic_verifier, defaults.semantic_verifier || 0),
    scoring: nonNegativeInteger(input.scoring, defaults.scoring || 0)
  };
}

function zeroSemanticCalls() {
  return { summary: 0, translation: 0, critic: 0, semantic_verifier: 0, scoring: 0 };
}

function nonNegativeInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function uniqueStrings(values) {
  return [...new Set(values.map((value) => String(value || "")).filter(Boolean))].sort();
}

function summaryReceiptId(signalId, origin, value) {
  return `sum_${createHash("sha256").update(`${signalId}|${origin}|${value}`).digest("hex").slice(0, 24)}`;
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(String(value || "")).digest("hex")}`;
}
