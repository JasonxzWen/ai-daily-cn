# Website Cloner Harness

This is a lightweight Skill Hub harness for authorized website clone smoke tests and report-style artifacts. It complements the `clone-website` skill and intentionally avoids importing host-specific upstream agent metadata.

Use the upstream `JCodesMore/ai-website-cloner-template` repository directly when you need its full Next.js 16 template and Node 24+ workflow. Use this harness when the goal is a browser-verifiable local artifact with explicit safety boundaries.

## Commands

```bash
npm run check
npm run dev
```

`npm run check` validates the local `site/index.html` artifact. `npm run dev` serves the `site/` directory for browser inspection.
