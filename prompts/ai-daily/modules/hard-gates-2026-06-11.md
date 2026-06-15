## 2026-06-11 hard gates

This module is the durable contract for the 2026-06-11 review feedback.

- Run `discover:huggingface-trending` every daily run. Merge `.tmp/huggingface-trending-YYYY-MM-DD.json`, require `source_audit.huggingface_trending`, and render a dedicated Hugging Face Trending Top 10 section for models, datasets, or Spaces. Do not treat ordinary Hugging Face organization pages as trending proof.
- Run `discover:china-ai` every daily run. Merge `.tmp/china-ai-YYYY-MM-DD.json`, require `source_audit.china_ai_sources`, and prefer Chinese official pages or Chinese technical blogs for Tencent, Alibaba/Qwen, ByteDance/Seed, DeepSeek, Zhipu, Kimi/Moonshot, MiniMax, Baidu, and other China AI labs when Chinese and English pages both exist.
- For reports dated `2026-06-11` or later, missing `source_audit.china_ai_sources.checked:true` blocks strict publish. A checked China AI lane with no qualified recent signal is degraded, not blocking, and may be represented only by a short public gap note.
- `hot_blogs` must reserve visible coverage for at least one qualified Chinese or China AI technical blog candidate when such a candidate exists, or record the explicit exclusion/degradation reason.
- Public evidence images must be semantic: benchmark tables, charts, diagrams, architecture, leaderboards, product screenshots, or other source-native evidence that carries information. Hero art, decorative covers, generic compute pictures, logos, favicons, avatars, and stock-like images must not render in public正文.
- OpenRouter, Artificial Analysis, and similar tracking sources must render parsed DOM/JSON/text rows as compact tables or leaderboard components. Full-page screenshots are not accepted as primary public content; a cropped table screenshot is only degraded evidence when structured data cannot be extracted.
- Builder/X discussion cards must be compact. Show author, handle/date/source tags, concise Chinese content, and a truncated or collapsed original excerpt; do not expose raw full threads or internal discovery fields by default.
- Public source coverage is reduced to reader-facing gap notes. Do not render colored audit tags, collapsed per-source details, candidate pools, scores, local paths, tokens, or internal debug logs in the public page.
