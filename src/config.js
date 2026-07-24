export const DEFAULT_SITE = {
  title: "AI 日报",
  siteUrl: "https://jasonxzwen.github.io/ai-daily-cn/",
  publishBranch: "main",
  publishAuthorName: "JasonxzWen",
  publishAuthorEmail: "109508077+JasonxzWen@users.noreply.github.com"
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
  "想象空间",
  "读者应重点核对",
  "判断点",
  "技不止术",
  "热门技术博客",
  "把它当作 AI 产品或平台策略信号",
  "读者应先看原文给出的变化",
  "Generated after syncing current main",
  "strict coverage gates",
  "Fixed source surface checked",
  "timed out twice in the current shell",
  "shadow audit",
  "included 标记已写回"
];

export const SOURCE_TIERS = ["T0", "T1", "T2", "T3"];
