import fs from "node:fs/promises";
import path from "node:path";
import { isValidDateString, isValidDateTimeString } from "./time.js";

export const WECHAT_ARTICLE_INPUT_SOURCE = {
  id: "wechat-article-link-input",
  name: "WeChat Article Link Input",
  url: "https://mp.weixin.qq.com/",
  source_kind: "manual",
  candidate_category: "community_lead",
  source_group: "community_discussions",
  content_tags: ["community_discussion", "analysis_opinion"],
  credibility_tag: "single_source_relay"
};

const DEFAULT_ALLOWED_SECTIONS = ["community_leads"];
const ALLOWED_RISK_LEVELS = new Set(["low", "medium", "high"]);
const ALLOWED_SOURCE_LEVELS = new Set(["wechat_industry_whitelist", "wechat_primary_like"]);
const TRACKING_PARAMS = new Set(["scene", "from", "isappinstalled", "clicktime", "enterid", "sessionid"]);
const ARTICLE_PARAMS = new Set(["__biz", "mid", "idx", "sn", "chksm"]);
const LOCAL_INFO_PATTERNS = [
  /\$CODEX_HOME/i,
  /%CODEX_HOME%/i,
  /\b[A-Za-z]:[\\/](?:Users|Documents and Settings|Windows|ProgramData|Temp|tmp)[\\/]/i,
  /(?:^|[^A-Za-z0-9_])\/(?:Users|home|var\/folders|tmp)\//i,
  /\.codex[\\/]automations/i,
  /automations[\\/]ai-daily[\\/]inputs/i
];

export function defaultWeChatInputPath(reportDate, env = process.env) {
  const codexHome = env.CODEX_HOME || path.join(env.USERPROFILE || env.HOME || ".", ".codex");
  return path.join(codexHome, "automations", "ai-daily", "inputs", "wechat", `${reportDate}.json`);
}

export async function loadWeChatArticleInput(options = {}) {
  const reportDate = requireReportDate(options.reportDate);
  const inputPath = options.inputPath || defaultWeChatInputPath(reportDate, options.env || process.env);
  let raw;
  try {
    raw = await fs.readFile(inputPath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
        status: "no_signal",
        articles: [],
        notes: "no date-scoped WeChat article input found"
      };
    }
    throw error;
  }

  const payload = JSON.parse(raw);
  const articles = normalizeWeChatPayload(payload, { reportDate });
  return {
    status: articles.length > 0 ? "checked" : "no_signal",
    articles,
    notes: `${articles.length} reviewed WeChat article links parsed; local path redaction enforced`
  };
}

export function normalizeWeChatPayload(payload, options = {}) {
  const reportDate = requireReportDate(options.reportDate || payload?.report_date);
  const items = Array.isArray(payload) ? payload : Array.isArray(payload?.articles) ? payload.articles : [];
  return items.map((item, index) => normalizeWeChatArticle(item, { reportDate, index }));
}

export function normalizeWeChatArticle(item, options = {}) {
  const index = Number.isInteger(options.index) ? options.index : 0;
  const reportDate = requireReportDate(options.reportDate);
  if (!item || typeof item !== "object") {
    throw wechatInputError(index, "article must be an object");
  }

  const url = normalizeWeChatArticleUrl(requiredString(item.url, index, "url"));
  const accountName = requiredString(item.account_name || item.account || item.source || item.author, index, "account_name");
  const title = requiredString(item.title, index, "title");
  const summary = requiredString(item.summary || item.description, index, "summary");
  const publishedAt = requiredString(item.published_at || item.publishedAt, index, "published_at");
  if (!isValidDateTimeString(publishedAt)) {
    throw wechatInputError(index, "published_at must be an ISO date-time string");
  }
  const eventDate = publishedAt.slice(0, 10);
  if (!isValidDateString(eventDate)) {
    throw wechatInputError(index, "published_at must include a valid date");
  }
  if (eventDate > reportDate) {
    throw wechatInputError(index, "published_at cannot be after report_date");
  }

  const riskLevel = String(item.risk_level || item.riskLevel || "medium").toLowerCase();
  if (!ALLOWED_RISK_LEVELS.has(riskLevel)) {
    throw wechatInputError(index, "risk_level must be low, medium, or high");
  }
  const sourceLevel = String(item.source_level || "wechat_industry_whitelist");
  if (!ALLOWED_SOURCE_LEVELS.has(sourceLevel)) {
    throw wechatInputError(index, "source_level must be wechat_industry_whitelist or wechat_primary_like");
  }
  const allowedSections = normalizeStringArray(item.allowed_sections || item.allowedSections || DEFAULT_ALLOWED_SECTIONS);
  const primaryUrls = normalizeUrlArray(item.primary_urls || item.primaryUrls || item.verification_sources);
  const verificationNotes = requiredString(item.verification_notes || item.verification_note, index, "verification_notes");
  const riskNotes = cleanText(item.risk_notes || item.risk_note || `risk_level=${riskLevel}`);
  const readerRelevance = cleanText(item.reader_relevance || item.why_it_matters || "Wechat article input for AI industry and opinion monitoring.");

  const publicFields = [
    url,
    accountName,
    title,
    summary,
    publishedAt,
    riskLevel,
    sourceLevel,
    allowedSections.join(" "),
    verificationNotes,
    riskNotes,
    readerRelevance,
    primaryUrls.join(" ")
  ].join("\n");
  assertNoLocalInfo(publicFields, `wechat article ${index}`);

  return {
    url,
    account_name: accountName,
    title,
    summary,
    published_at: publishedAt,
    event_date: eventDate,
    risk_level: riskLevel,
    source_level: sourceLevel,
    allowed_sections: allowedSections,
    verification_notes: verificationNotes,
    risk_notes: riskNotes,
    reader_relevance: readerRelevance,
    primary_urls: primaryUrls
  };
}

export function normalizeWeChatArticleUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "mp.weixin.qq.com") {
    throw wechatInputError(0, "url must be an https://mp.weixin.qq.com article URL");
  }
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(key) || (url.pathname.startsWith("/s/") && !ARTICLE_PARAMS.has(key))) {
      url.searchParams.delete(key);
    }
  }
  for (const key of [...url.searchParams.keys()]) {
    if (!ARTICLE_PARAMS.has(key)) {
      url.searchParams.delete(key);
    }
  }
  url.hash = "";
  return url.toString();
}

export function assertNoLocalInfo(value, label = "value") {
  const text = String(value || "");
  const matched = LOCAL_INFO_PATTERNS.find((pattern) => pattern.test(text));
  if (matched) {
    throw wechatInputError(0, `${label} contains local machine information`);
  }
}

function normalizeStringArray(value) {
  const items = Array.isArray(value) ? value : String(value || "").split(",");
  return items.map((item) => cleanText(item)).filter(Boolean);
}

function normalizeUrlArray(value) {
  const items = normalizeStringArray(value);
  return items.map((item) => {
    const url = new URL(item);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("verification source must be http(s)");
    }
    return url.toString();
  });
}

function requiredString(value, index, field) {
  const cleaned = cleanText(value);
  if (!cleaned) {
    throw wechatInputError(index, `${field} is required`);
  }
  return cleaned;
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function requireReportDate(value) {
  if (!isValidDateString(value)) {
    throw new Error("reportDate is required in YYYY-MM-DD format");
  }
  return value;
}

function wechatInputError(index, message) {
  const error = new Error(`wechat_input_invalid at articles[${index}]: ${message}`);
  error.code = message.includes("local machine information") ? "wechat_input_privacy_violation" : "wechat_input_invalid";
  return error;
}
