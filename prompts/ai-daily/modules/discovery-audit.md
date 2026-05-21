## 发现源与审计

每天生成日报前，必须先完成两个固定发现面，并把结果写入结构化草稿的 `source_audit`：

1. GitHub Trending / 开源趋势面：
   - 必查 `github-ai-trending` 技能规则。
   - 优先运行 `npm run discover:github-trending -- 50`，把输出的 `source_audit.github_trending` 和 `candidates` 作为开源趋势候选池。
   - 至少检查 GitHub Trending daily 与 weekly：`https://github.com/trending?since=daily`、`https://github.com/trending?since=weekly`。
   - 对 AI 工程常用语言补扫 Python、TypeScript、Rust、Go 的 daily/weekly trending。
   - 至少补看一个趋势交叉源：OSSInsight AI / AI Agent Frameworks collection、Trendshift GitHub trending repositories，或等价可访问来源。
   - 候选项目只有在具备 release、明确 trending 记录、star velocity、notable PR、近期 commit 或可运行 README 时，才能进入 `projects`；否则只进入 `community_leads` 或丢弃。
   - GitHub trending 来源的 `projects` 必须尽量填写 `event_date`、`source`、`signal`、`evidence`，其中 `signal` 使用 `release`、`star_velocity`、`trending`、`notable_pr`、`ecosystem` 或 `official_update`。

2. Builder 原始源面：
   - 必查 `follow-builders` 技能规则，但不要把二手转述当成 Builder 观察。
   - Builder 观察只收录 builder、researcher、founder、maintainer 的原始帖子、个人博客、公开视频或播客片段；没有原始 URL 就不收录。
   - 如果 X/YouTube/feed 无法访问，`builder_observations` 保持空数组，但 `source_audit.builder_sources` 必须记录 `checked:true`、检查过的来源、阻塞状态和原因。
   - Builder 条目必须尽量填写 `role`、`event_date`、`source`、`evidence`；不要把 Builder 条目计入 `main_items`。

结构化草稿必须包含：

```json
"source_audit": {
  "github_trending": {
    "checked": true,
    "sources": [
      {
        "name": "GitHub Trending daily",
        "url": "https://github.com/trending?since=daily",
        "status": "checked",
        "notes": ""
      }
    ],
    "candidates_found": 0,
    "included": 0,
    "notes": ""
  },
  "builder_sources": {
    "checked": true,
    "sources": [
      {
        "name": "follow-builders",
        "url": "https://github.com/zarazhangrui/follow-builders",
        "status": "checked",
        "notes": ""
      }
    ],
    "candidates_found": 0,
    "included": 0,
    "notes": ""
  }
}
```

`sources[].status` 只能使用 `checked`、`blocked`、`no_signal`。没有合格候选时不要凑数，但必须在 `source_audit` 里说明已经检查过什么以及为什么未收录。
