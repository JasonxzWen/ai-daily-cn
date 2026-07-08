# AI Daily CN

Automated Chinese AI daily publisher that turns structured reports into a searchable, archived GitHub Pages site.

[Live site](https://jasonxzwen.github.io/ai-daily-cn/) | [Public feed](https://jasonxzwen.github.io/ai-daily-cn/feed.json) | [Latest trends](https://jasonxzwen.github.io/ai-daily-cn/trends.json)

## Why this exists

AI news moves across model labs, product launches, open-source projects, engineering write-ups, benchmarks, and community posts. This repository keeps a daily Chinese archive with two goals:

- make each report easy to read on the web
- keep the underlying data structured enough to audit, rebuild, and reuse

The site is static. It needs no backend, database, queue, or hosted runtime.

## Modernization track

The accepted ADC modernization plan is tracked in [`docs/adc-modernization-roadmap.md`](docs/adc-modernization-roadmap.md). It supersedes the previous React/npm/shadcn-oriented PR stack and moves the project toward pnpm workspaces, Astryx, the `ADC.` visual identity, design workflow tooling, and medium-trust Wechat2RSS source leads.

## What it publishes

- Daily HTML reports under `docs/reports/`
- Reader-safe JSON under `docs/data/`
- A rolling site index at `docs/index.html`
- A public feed at `docs/feed.json`
- Topic trend data at `docs/trends.json`

The canonical report data lives in `reports-data/`. Public artifacts in `docs/` contain only the fields needed by readers and lightweight consumers.

## Quick start

Requirements:

- Node.js 20.19 or newer
- Corepack-managed pnpm

Install dependencies and build the site:

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm run build
```

Open the generated site:

```powershell
python -m http.server 8080 -d docs
```

Then visit `http://localhost:8080/`.

You can also open `docs/index.html` directly in a browser.

## Common commands

| Command | Purpose |
| --- | --- |
| `corepack pnpm run preflight:worktree` | Check branch, dirty state, `origin/main` freshness, sibling worktrees, and GitHub CLI auth before PR work. |
| `corepack pnpm run build` | Build the static site from `reports-data/` and `reports-source/`. |
| `corepack pnpm run validate:docs` | Run the faster documentation and process checks for docs-only changes. |
| `corepack pnpm run validate` | Run the full validation suite before shipping changes. |
| `corepack pnpm test` | Run the Node.js test suite. |
| `corepack pnpm run test:e2e` | Run browser-level checks. |
| `corepack pnpm run sources:validate` | Validate configured source registries. |
| `corepack pnpm run status:self-check -- --date YYYY-MM-DD --output .tmp/status-self-check-YYYY-MM-DD.json` | Inspect site, source, and publish readiness for a date. |

## Generate a daily report

Maintainers can generate a dated report with:

```powershell
corepack pnpm run daily:run -- --date YYYY-MM-DD
```

The command prepares local artifacts and stops at a dry-run publish plan. It does not publish to GitHub Pages unless a maintainer explicitly requests publishing.

Typical outputs:

- `.tmp/run-summary-YYYY-MM-DD.json`
- `reports-data/YYYY/MM/YYYY-MM-DD.json`
- `docs/reports/YYYY/MM/YYYY-MM-DD.html`
- `docs/data/YYYY/MM/YYYY-MM-DD.json`

Run validation before publishing:

```powershell
corepack pnpm run validate
```

## Repository layout

| Path | Description |
| --- | --- |
| `docs/` | Static GitHub Pages output. |
| `docs/reports/` | Published daily HTML pages. |
| `docs/data/` | Public JSON for readers and lightweight integrations. |
| `reports-data/` | Full structured report records. |
| `reports-source/` | Markdown compatibility input. |
| `src/` | Build, report, source, quality, trend, and publish logic. |
| `scripts/` | Validation and maintenance scripts. |
| `schemas/` | JSON schemas for report and workflow data. |
| `config/` | Site, source, trend, and publish configuration. |
| `tests/` | Unit and browser tests. |

## Data contract

Use `docs/data/**` if you want public report content. Use `reports-data/**` only when you need full maintenance data for rebuilding, audit, or quality review.

Public data should not contain credentials, local paths, private source URLs, raw execution logs, or unpublished candidate pools.

## Deployment

GitHub Pages serves the `docs/` build output. The deployment workflow installs dependencies, runs the build, uploads the static artifact, and publishes it to Pages.

Production URL:

```text
https://jasonxzwen.github.io/ai-daily-cn/
```

## Contributing

Useful contributions include:

- fixing stale or inaccurate source references
- improving report readability
- adding reliable AI information sources
- strengthening validation or privacy checks
- improving static site accessibility and mobile layout

Before opening a pull request, run:

```powershell
corepack pnpm run validate
```

If your change affects HTML, CSS, or browser behavior, also inspect the generated site on desktop and mobile viewports.

## Security

Do not put tokens, cookies, private RSS URLs, local absolute paths, or credentials in issues, pull requests, JSON, HTML, logs, or examples.

If you find a security issue, use GitHub private vulnerability reporting when available. If the private report entry is not enabled, contact the maintainer through a private channel and avoid publishing exploit details.

## License

This repository does not currently include a `LICENSE` file. Do not assume third-party reuse or redistribution rights until the repository owner adds one.
