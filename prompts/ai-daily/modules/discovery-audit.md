## 发现源与审计

每天生成日报前，必须先完成两个固定发现面，并把结果写入结构化草稿的 `source_audit`：

1. GitHub Trending / 开源趋势面：
   - 必查 `github-ai-trending` 技能规则。
   - 优先运行 `npm run discover:github-trending -- 50`，把输出的 `source_audit.github_trending` 和 `candidates` 作为开源趋势候选池。
   - 如果 shell 网络受限但浏览器可以保存 GitHub Trending HTML 或采样 JSON，改用 `npm run discover:github-trending -- --browser-export <path>`，让同一解析器处理浏览器导出的内容。
   - 至少检查 GitHub Trending daily 与 weekly：`https://github.com/trending?since=daily`、`https://github.com/trending?since=weekly`。
   - 对 AI 工程常用语言补扫 Python、TypeScript、Rust、Go 的 daily/weekly trending。
   - 至少补看一个趋势交叉源：OSSInsight AI / AI Agent Frameworks collection、Trendshift GitHub trending repositories，或等价可访问来源。
   - 候选项目只有在具备 release、明确 trending 记录、star velocity、notable PR、近期 commit 或可运行 README 时，才能进入 `projects`；否则只进入 `community_leads` 或丢弃。
   - GitHub trending 来源的 `projects` 必须尽量填写 `event_date`、`source`、`signal`、`evidence`，其中 `signal` 使用 `release`、`star_velocity`、`trending`、`notable_pr`、`ecosystem` 或 `official_update`。

2. Builder 原始源面：
   - 必查 `follow-builders` 技能规则，但不要把二手转述当成 Builder 观察。
   - `npm run discover:builders -- --date YYYY-MM-DD --limit 20` 必须优先检查 `follow-builders central feed` 的 X、podcast、blog JSON；central feed 中带原始 X URL 的内容视为可审计 Builder 一手候选。
   - central feed 不可用时，才退到 raw feed、本地新鲜缓存和固定 RSS/Atom fallback；过期缓存只用于 `last_successful_feed_at` 和阻塞说明，不直接入选。
   - Builder 观察只收录 builder、researcher、founder、maintainer 的原始帖子、个人博客、公开视频或播客片段；没有原始 URL 就不收录。
   - 如果 X/YouTube/feed 无法访问，`builder_observations` 保持空数组，但 `source_audit.builder_sources` 必须记录 `checked:true`、检查过的来源、阻塞状态和原因，并填写 `blocked_reason` 与 `last_successful_feed_at`。
   - Builder 条目必须尽量填写 `role`、`event_date`、`source`、`evidence`；不要把 Builder 条目计入 `main_items`。

3. 热门博客、访谈和新产品发现面：
   - 至少检查 OpenAI、Anthropic Engineering/News、Google DeepMind/Research、Meta AI、Microsoft Research、Hugging Face Blog 中可访问的官方或工程博客源。
   - 至少检查一个高质量博客/访谈聚合源，例如 Latent.Space、Interconnects、Planet AI、Product Hunt 或 Follow AI Builders。
   - 优先运行 `npm run discover:content-sources -- --date YYYY-MM-DD --limit 20`，把官方实验室博客、热门技术博客、访谈/播客和聚合源写入候选池。
   - Product Hunt 和新产品榜单只产生候选；入选项目区前必须用官网、GitHub、文档或 README 交叉确认，并补充“领域”和“作用”。

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
    "blocked_reason": "",
    "last_successful_feed_at": null,
    "notes": ""
  }
}
```

`sources[].status` 只能使用 `checked`、`blocked`、`no_signal`。没有合格候选时不要凑数，但必须在 `source_audit` 里说明已经检查过什么以及为什么未收录。

### 固定兜底命令

- `npm run discover:github-trending -- --date YYYY-MM-DD --limit 50` 现在会先抓 GitHub Trending daily/weekly 与 Python/TypeScript/Rust/Go 页面；如果这些页面全部失败或没有解析出仓库，会自动调用 OSSInsight `List trending repos` API 作为机器可复现的项目候选兜底。浏览器导出仍使用 `npm run discover:github-trending -- --date YYYY-MM-DD --browser-export <path>`。
- `npm run discover:builders -- --date YYYY-MM-DD --limit 20` 优先消费 `follow-builders central feed`，再用少量固定原始 RSS/Atom 源补充 Builder 候选。它只产生带原始 URL 的候选；没有近期条目时记录 `no_signal`，不要手工改写成入选。
- `npm run discover:content-sources -- --date YYYY-MM-DD --limit 20` 解析 OpenAI、Hugging Face、Google Research、Microsoft Research、Latent.Space、Interconnects、Planet AI、BAIR 等 RSS/Atom；同时解析 Anthropic News、Google DeepMind、Meta AI 等无 RSS 官方页面，以及 Product Hunt developer-tools feed，把近期博客、访谈、播客和产品转成 `hot_blog` 或 `project` 候选。Product Hunt 候选会自动尝试打开产品页并用 GitHub、docs、README 或官网确认用途；确认成功的候选优先使用确认页 URL，确认失败的候选不得直接入选项目区。
- `npm run discover:statuspage-incidents -- --date YYYY-MM-DD --limit 20` 解析 OpenAI/Claude 等 Statuspage Atom/RSS，把近期 incident 转成 `main_item` 候选。状态页候选仍必须和其他候选一起走去重、新鲜度和 `candidate_id` 回指门禁。
