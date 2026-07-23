const STABLE_TEXT_COLLATOR = new Intl.Collator("en-US", {
  usage: "sort",
  sensitivity: "variant",
  numeric: false
});
const STABLE_CHINESE_COLLATOR = new Intl.Collator("zh-Hans-CN", {
  usage: "sort",
  sensitivity: "variant",
  numeric: false
});

export function compareStableText(left, right) {
  return STABLE_TEXT_COLLATOR.compare(String(left ?? ""), String(right ?? ""));
}

export function compareStableChineseText(left, right) {
  return STABLE_CHINESE_COLLATOR.compare(String(left ?? ""), String(right ?? ""));
}
