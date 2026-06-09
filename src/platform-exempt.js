import { PublisherError } from "./errors.js";

export const PLATFORM_EXEMPT_PLATFORMS = ["wechat", "zhihu", "reddit"];
export const PLATFORM_EXEMPT_SOURCE_LEVEL = "platform_exempt_signal";
export const PLATFORM_EXEMPT_VERIFICATION_STATUS = "platform_exempt_unverified";
export const PLATFORM_EXEMPT_POLICY = "platform_signal_exempt";
export const PLATFORM_EXEMPT_GATE = "deterministic_platform_gate";

export const PLATFORM_CATEGORY_TO_SECTION = {
  wechat_item: "wechat_items",
  zhihu_item: "zhihu_items",
  reddit_item: "reddit_items"
};

export const PLATFORM_SECTION_TO_CATEGORY = {
  wechat_items: "wechat_item",
  zhihu_items: "zhihu_item",
  reddit_items: "reddit_item"
};

export const PLATFORM_SECTION_TO_PLATFORM = {
  wechat_items: "wechat",
  zhihu_items: "zhihu",
  reddit_items: "reddit"
};

export const PLATFORM_TO_AUDIT_GROUP = {
  wechat: "wechat_sources",
  zhihu: "zhihu_sources",
  reddit: "reddit_sources"
};

export const PLATFORM_AUDIT_GROUPS = Object.values(PLATFORM_TO_AUDIT_GROUP);
export const PLATFORM_SECTIONS = Object.keys(PLATFORM_SECTION_TO_CATEGORY);
export const PLATFORM_CATEGORIES = Object.keys(PLATFORM_CATEGORY_TO_SECTION);

const PLATFORM_HOSTS = {
  wechat: ["mp.weixin.qq.com"],
  zhihu: ["zhihu.com", "zhuanlan.zhihu.com"],
  reddit: ["reddit.com", "old.reddit.com", "redd.it", "www.reddit.com"]
};

const STRONG_FACT_RE =
  /(?:^|[，。；;,.!?\s])(?:已|已经|正式|确认|证明|发布了|宣布了|推出了|上线了|opened|launched|released|announced|confirmed|proved)\b/i;
const WEAK_CLAIM_RE = /原帖|作者|平台线索|讨论|帖子|thread|post|comment|称|提到|显示|suggests|says|mentions|claims/i;

export function isPlatformExemptCategory(category) {
  return Object.hasOwn(PLATFORM_CATEGORY_TO_SECTION, String(category || ""));
}

export function isPlatformExemptSection(sectionName) {
  return Object.hasOwn(PLATFORM_SECTION_TO_CATEGORY, String(sectionName || ""));
}

export function sectionForPlatformCategory(category) {
  return PLATFORM_CATEGORY_TO_SECTION[String(category || "")] || "";
}

export function platformForSection(sectionName) {
  return PLATFORM_SECTION_TO_PLATFORM[String(sectionName || "")] || "";
}

export function auditGroupForPlatform(platform) {
  return PLATFORM_TO_AUDIT_GROUP[String(platform || "")] || "";
}

export function platformFromCandidateCategory(category) {
  const section = sectionForPlatformCategory(category);
  return platformForSection(section);
}

export function platformItemLabel(platform) {
  if (platform === "wechat") return "微信公众号线索";
  if (platform === "zhihu") return "知乎线索";
  if (platform === "reddit") return "Reddit 线索";
  return "平台线索";
}

export function allowedHostsForPlatformSource(source = {}) {
  const platform = String(source.platform || "").trim();
  return normalizedList(source.allowed_hosts || source.allowedHosts || PLATFORM_HOSTS[platform] || []);
}

export function allowedUrlPatternsForPlatformSource(source = {}) {
  return normalizedList(source.allowed_url_patterns || source.allowedUrlPatterns || []);
}

export function includeKeywordsForPlatformSource(source = {}) {
  return normalizedList(source.include_keywords || source.includeKeywords || []);
}

export function excludeKeywordsForPlatformSource(source = {}) {
  return normalizedList(source.exclude_keywords || source.excludeKeywords || []);
}

export function platformSourceRules(source = {}) {
  return {
    platform: String(source.platform || platformFromCandidateCategory(source.candidate_category)).trim(),
    allowedHosts: allowedHostsForPlatformSource(source),
    allowedUrlPatterns: allowedUrlPatternsForPlatformSource(source),
    includeKeywords: includeKeywordsForPlatformSource(source),
    excludeKeywords: excludeKeywordsForPlatformSource(source),
    disclosure: String(source.public_disclosure_label || source.publicDisclosureLabel || "平台扩散发现，未做一手回源核验。").trim()
  };
}

export function platformSourceRejectReason(entry = {}, source = {}) {
  if (source.kill_switch === true || source.killSwitch === true) {
    return "kill_switch_enabled";
  }
  const rules = platformSourceRules(source);
  if (!PLATFORM_EXEMPT_PLATFORMS.includes(rules.platform)) {
    return "platform_missing";
  }
  if (!urlMatchesPlatformRules(entry.url, rules)) {
    return "url_rule_mismatch";
  }
  const text = platformEntryText(entry);
  const matched = matchedPlatformTerms(text, rules.includeKeywords);
  if (rules.includeKeywords.length > 0 && matched.length === 0) {
    return "include_keywords_not_matched";
  }
  if (matchedPlatformTerms(text, rules.excludeKeywords).length > 0) {
    return "exclude_keywords_matched";
  }
  return "";
}

export function platformEntryToCandidate(entry = {}, source = {}, existingCandidates = []) {
  const rules = platformSourceRules(source);
  const text = platformEntryText(entry);
  return {
    platform: rules.platform,
    rule_id: String(source.rule_id || source.ruleId || source.id || "").trim(),
    source_level: PLATFORM_EXEMPT_SOURCE_LEVEL,
    verification_status: PLATFORM_EXEMPT_VERIFICATION_STATUS,
    claim_text: weakClaimText(entry, rules.platform),
    why_watch: String(entry.why_watch || entry.reader_relevance || source.why_watch || source.reader_relevance || "这是一条平台讨论弱信号，可用于观察后续是否出现一手来源。").trim(),
    disclosure: rules.disclosure,
    matched_terms: matchedPlatformTerms(text, rules.includeKeywords),
    exemption_policy: PLATFORM_EXEMPT_POLICY,
    published_by_gate: PLATFORM_EXEMPT_GATE
  };
}

export function requirePlatformExemptItemContract(item = {}, context = {}) {
  const sectionName = String(context.sectionName || "").trim();
  const expectedPlatform = platformForSection(sectionName);
  const required = [
    "candidate_id",
    "platform",
    "source_id",
    "rule_id",
    "title",
    "url",
    "event_date",
    "source",
    "source_level",
    "verification_status",
    "claim_text",
    "why_watch",
    "disclosure",
    "matched_terms",
    "exemption_policy",
    "published_by_gate"
  ];
  const missing = required.filter((field) => {
    if (field === "matched_terms") {
      return !Array.isArray(item[field]) || item[field].length === 0;
    }
    return !String(item[field] || "").trim();
  });
  if (missing.length > 0) {
    throw new PublisherError("platform_exempt_disclosure_missing", "Platform exempt report items must include public audit disclosure fields.", {
      section: sectionName,
      candidate_id: item.candidate_id,
      missing
    });
  }
  if (expectedPlatform && item.platform !== expectedPlatform) {
    throw new PublisherError("platform_exempt_platform_mismatch", "Platform exempt report item is in the wrong section for its platform.", {
      section: sectionName,
      platform: item.platform,
      expected_platform: expectedPlatform
    });
  }
  if (!urlMatchesPlatformRules(item.url, platformSourceRules({ platform: item.platform }))) {
    throw new PublisherError("platform_exempt_url_mismatch", "Platform exempt report item URL must match the disclosed platform host rules.", {
      section: sectionName,
      platform: item.platform,
      url: item.url
    });
  }
  if (item.source_level !== PLATFORM_EXEMPT_SOURCE_LEVEL || item.verification_status !== PLATFORM_EXEMPT_VERIFICATION_STATUS) {
    throw new PublisherError("platform_exempt_disclosure_missing", "Platform exempt items must use the explicit platform exempt source and verification fields.", {
      section: sectionName,
      candidate_id: item.candidate_id
    });
  }
  if (item.exemption_policy !== PLATFORM_EXEMPT_POLICY || item.published_by_gate !== PLATFORM_EXEMPT_GATE) {
    throw new PublisherError("platform_exempt_disclosure_missing", "Platform exempt items must disclose the exemption policy and deterministic gate.", {
      section: sectionName,
      candidate_id: item.candidate_id
    });
  }
  if (!hasWeakClaimWording(item.claim_text)) {
    throw new PublisherError("platform_exempt_claim_too_strong", "Platform exempt items must use weak-claim wording instead of confirmed factual wording.", {
      section: sectionName,
      candidate_id: item.candidate_id,
      claim_text: item.claim_text
    });
  }
}

export function hasWeakClaimWording(value) {
  const text = String(value || "").trim();
  if (!text) {
    return false;
  }
  if (STRONG_FACT_RE.test(text) && !WEAK_CLAIM_RE.test(text)) {
    return false;
  }
  if (/发布了|宣布了|推出了|上线了/.test(text) && !/原帖|作者|平台线索|讨论|帖子|称|提到|显示/.test(text)) {
    return false;
  }
  return WEAK_CLAIM_RE.test(text);
}

function urlMatchesPlatformRules(value, rules) {
  let parsed;
  try {
    parsed = new URL(String(value || ""));
  } catch {
    return false;
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const allowedHosts = rules.allowedHosts.length > 0 ? rules.allowedHosts : PLATFORM_HOSTS[rules.platform] || [];
  const hostOk = allowedHosts.some((allowed) => {
    const normalized = String(allowed || "").toLowerCase().replace(/^www\./, "");
    return host === normalized || host.endsWith(`.${normalized}`);
  });
  if (!hostOk) {
    return false;
  }
  if (rules.allowedUrlPatterns.length === 0) {
    return true;
  }
  return rules.allowedUrlPatterns.some((pattern) => {
    try {
      return new RegExp(pattern).test(String(value || ""));
    } catch {
      return false;
    }
  });
}

function weakClaimText(entry = {}, platform) {
  const raw = String(entry.claim_text || entry.summary || entry.description || entry.title || "").replace(/\s+/g, " ").trim();
  if (hasWeakClaimWording(raw)) {
    return raw;
  }
  const label = platformItemLabel(platform);
  return `${label}显示，原帖称${raw ? `：${raw}` : "这是一条值得观察的讨论线索。"}`;
}

function platformEntryText(entry = {}) {
  return [entry.title, entry.summary, entry.description, entry.content, entry.claim_text]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ");
}

function matchedPlatformTerms(text, terms) {
  const normalizedText = String(text || "").toLowerCase();
  return normalizedList(terms).filter((term) => normalizedText.includes(term.toLowerCase()));
}

function normalizedList(value) {
  const values = Array.isArray(value) ? value : String(value || "").split(",");
  return values.map((item) => String(item || "").trim()).filter(Boolean);
}
