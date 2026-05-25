import { AI_STOCK_PHRASES } from "./config.js";
import { PublisherError } from "./errors.js";

export function requirePlainLanguage(report) {
  const issues = findPlainLanguageIssues(report);
  if (issues.length === 0) {
    return;
  }

  throw new PublisherError("plain_language_failed", "结构化日报包含泛化套话，请先改成具体事实。", {
    errors: issues.slice(0, 20)
  });
}

export function findPlainLanguageIssues(value) {
  const issues = [];
  walkText(value, "$", issues);
  return issues;
}

function walkText(value, pathName, issues) {
  if (typeof value === "string") {
    collectTextIssues(value, pathName, issues);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => walkText(item, `${pathName}[${index}]`, issues));
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    const childPath = `${pathName}.${key}`;
    if (shouldSkipPath(childPath)) {
      continue;
    }
    walkText(child, childPath, issues);
  }
}

function collectTextIssues(text, pathName, issues) {
  const phrase = AI_STOCK_PHRASES.find((item) => text.includes(item));
  if (phrase) {
    issues.push({
      path: pathName,
      phrase,
      message: "改成事实、动作、日期或来源，不使用泛化判断词。"
    });
  }
}

function shouldSkipPath(pathName) {
  return /\.(?:url|canonical_url|html_path|markdown_path|generated_at|pages_url)$/.test(pathName);
}
