export const DEFAULT_SITE = {
  title: "AI 日报",
  siteUrl: "https://jasonxzwen.github.io/ai-daily-cn/",
  publishBranch: "main"
};

export const SELF_CHECK_HEADINGS = new Set(["自检", "自检与优化建议"]);

export const OPTIONAL_SECTION_HEADINGS = {
  projects: "今日值得关注的项目",
  builderObservations: "Builder 观察",
  communityLeads: "社区线索"
};

export const BANNED_PHRASES = [
  "对我们的影响",
  "工程意义",
  "启示",
  "总之",
  "赛道",
  "深度融合"
];

export const AI_STOCK_PHRASES = [
  ...BANNED_PHRASES,
  "高信号",
  "核心信号",
  "可观察信号",
  "重要信号",
  "更多信号",
  "其他信号",
  "赋能",
  "范式转变",
  "生态闭环",
  "价值闭环",
  "想象空间"
];

export const SOURCE_TIERS = ["T0", "T1", "T2", "T3"];
