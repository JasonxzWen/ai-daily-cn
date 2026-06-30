## Fixed Source Checklist

Every daily run must check and audit this user-requested source surface, using `config/sources/*.json`, dedicated discovery commands, or a documented equivalent feed endpoint:

- Open-source aggregators: `follow-builders`, `ML Papers of the Week`.
- Official lab/company sources: `OpenAI Blog RSS`, `OpenAI News RSS`, `Google DeepMind RSS`, `Google Research Blog`, `Meta AI RSS` or `Meta AI Blog`, `Microsoft Research Blog`, `AWS Machine Learning Blog`, `Anthropic News`, `Hugging Face Blog`.
- International tech media: `TechCrunch AI`, `The Verge`, `MIT Technology Review`, `Ars Technica`, `VentureBeat AI`, `HNRSS Frontpage`.
- Chinese AI/tech media leads: `Jiqizhixin`, `QbitAI`, `36Kr`, `InfoQ CN`; keep them as intermediary leads until traced to primary sources.
- Public APIs and paper/community sources: `arXiv cs.AI`, `arXiv cs.CL`, `arXiv cs.LG`, `arXiv cs.MA`, `arXiv stat.ML`, `Hacker News Topstories API`, `Hugging Face Daily Papers`, `GitHub Trending`.
- High-quality AI aggregators/newsletters: `Smol AI News`, `Latent.Space`.

Map selected items into these six public-topic buckets before rendering:

- Big-company moves: OpenAI, Google, Meta, Anthropic, Microsoft, ByteDance, Alibaba, Tencent, and comparable platform/lab updates.
- Models and papers: real model releases, model-card updates, SOTA results, and notable arXiv/Hugging Face paper items.
- Products and tools: new AI products, Product Hunt candidates, Hugging Face Spaces/models, and developer tools.
- Industry and funding: financing, M&A, IPO, regulation, creator-economy, AIGC/content-industry, and platform policy moves.
- Open-source projects: GitHub Trending and other runnable repositories with recent activity.
- Opinions and long-form reads: Latent.Space, Smol AI News, podcasts, and high-signal builder commentary.

Same-event multi-source reports must be merged. T3, intermediary, community, and aggregator items must not enter factual sections without primary-source or multi-source confirmation.

From `2026-06-02` onward, this checklist is enforced by the publish quality gate, not only by the prompt. The final `source_audit` should prove these sources were checked, even when individual feeds return `no_signal`. Missing automation revision, invalid schema, broken candidate references, stale duplicate stories, unverified factual claims, unconfirmed remote `main`, `remote_ahead`, dirty non-publisher files, API fallback token/base commit failures, and Pages verification failures are blocking. Source-surface coverage gaps are degraded: `publish:dry-run`, local `publish`, and `publish:github-api` may proceed only when the gap is written into internal `quality_status.degraded_sections`; the public page may show only a short reader-facing gap note, not source audit details.

Discovery command output and network outage rules:

- Prefer `node src/cli.js ... --output .tmp/<name>-YYYY-MM-DD.json` for fixed discovery commands. Do not rely on PowerShell `Tee-Object` to preserve JSON, because shell encoding or npm banners can pollute stdout.
- Run `discover:search-news` with provider-level isolation, for example `--provider-timeout-ms 45000 --output .tmp/search-news-YYYY-MM-DD.json`; one provider failure must not erase other provider candidates, timing, cost, or error evidence.
- When multiple fixed source groups are mostly `status:"blocked"` with `fetch failed`, `retry_failed_after_1`, DNS, timeout, or network notes, set `quality_status.status:"degraded"` and include `source_discovery_network_unavailable` in `quality_status.degraded_sections`.
- In that network-outage degradation, explicitly tell the user to check `config.toml` or Codex settings and enable network access when sandbox mode is `workspace-write`: `[sandbox_workspace_write] network_access = true` / 设置“当沙盒设置为工作区写入时允许网络访问”.

Every selected public item should carry an importance label:

- `importance: "major"` renders as `重大` and is reserved for platform/lab launches, high-impact model releases, major funding/M&A/regulatory moves, or events that can change production usage.
- `importance: "notable"` renders as `值得关注` and is for useful new tools, strong papers/blogs, high-signal GitHub Trending entries, Product Hunt items after cross-check, and named-builder viewpoints.
- `importance: "general"` renders as `一般` and is for lightweight community leads, background items, lower-rank trending entries, or operational follow-ups.
