# ADC Modernization Roadmap

This document records the accepted replacement plan for the ADC frontend, tooling, and source pipeline. It supersedes the previous React/npm/shadcn-oriented PR stack (#249-#252).

## Current Baseline

- Production `main` includes the 2026-07-08 daily publish and the repaired single-script daily pipeline.
- The previous open PR stack was built before the production hotfixes and before the accepted pnpm/Astryx/ADC. direction.
- New implementation work starts from latest `main`, not from the previous stacked branches.

## Replacement PR Stack

| Order | Branch | Purpose |
| --- | --- | --- |
| 1 | `codex/mainline-closeout` | Record the replacement decision, production baseline, and old PR supersede boundary. |
| 2 | `codex/pnpm-workspace-migration` | Fully migrate to `pnpm + corepack`, remove npm command compatibility, and introduce workspace boundaries. |
| 3 | `codex/astryx-adc-foundation` | Adopt Astryx as the default React component foundation and build the ADC frontend base. |
| 4 | `codex/adc-visual-system` | Replace previous dark/glass visual directions with the light black-and-white `ADC.` identity. |
| 5 | `codex/design-toolchain` | Standardize Stitch, taste-skill, and Impeccable usage for prototype and design QA workflows. |
| 6 | `codex/wechat2rss-medium-trust` | Add 12 Wechat2RSS public feeds as medium-trust Chinese source leads. |

## Technical Direction

### Package And Workspace

- Use `corepack pnpm` as the only supported command runner after the migration PR.
- Remove `package-lock.json` and commit `pnpm-lock.yaml`.
- Use workspace boundaries for app, pipeline, sources, contracts, and design code.
- Scheduled automation must call only `corepack pnpm run daily:codex-pipeline`; old `npm run` scheduler instructions are not retained.

### Frontend Foundation

- Use React, Vite, and GitHub Pages static output.
- Use Astryx as the default design-system component foundation.
- Do not introduce shadcn as a second primary component system.
- Use local ADC domain components only for product-specific surfaces such as daily story cards, source strips, report status, and clustered sections.

### Visual Identity

- The brand character is `ADC.`, derived from the repository name `ai-daily-cn`.
- The accepted visual language is light, black-and-white, hand-drawn, rough-lined, and restrained.
- Remove previous Dracula, dark, glass, and multicolor visual directions from the new frontend.
- `ADC.` assets should support empty states, workflow explanations, report status, and first-screen brand memory. They should not become per-news decorations.

### Design Workflow

- Use Google Stitch for ideation and high-fidelity prototype exploration.
- Commit only Stitch prompts, compressed screenshots, and decision records.
- Do not commit Stitch-exported HTML/CSS as production implementation.
- Use taste-skill as the exploratory taste layer.
- Use Impeccable as the design QA and polish gate.

### Source Expansion

Add the following Wechat2RSS public feeds as medium-trust leads:

- 机器之心
- 量子位
- 极客公园
- 阿里云开发者
- 阿里技术
- 阿里巴巴中间件
- 腾讯技术工程
- 字节跳动技术团队
- 美团技术团队
- 小米技术
- 哔哩哔哩技术
- 阿里云设计中心

Wechat2RSS is treated as transport. The underlying account/source determines authority. Selected facts still require primary-source confirmation or multi-source confirmation before entering reader-facing report copy.

## Explicit Non-Goals

- No search, comparison, or favorite features in this stack.
- Desktop-only at `1280x900`; mobile, tablet, narrow-screen, and touch-only work is not maintained or considered.
- No Next.js or Vercel runtime migration.
- No direct publication of internal source strategy fields.
- No production use of Stitch-generated code.
- No direct copy of the Xiaohei IP; `ADC.` is a project-specific derivative visual system.

## Validation Expectations

Each slice should run the nearest P0 checks before commit and record skipped P1/P2 checks. After the pnpm migration lands, validation commands use `corepack pnpm run ...`.

Required gates across the full stack:

- harness validation
- typecheck
- focused behavior tests
- full test suite when practical
- build
- workflow/DAG/resilience validators
- source validation for source changes
- E2E/browser acceptance for user-visible frontend changes
- privacy/public artifact scan
- PR status closeout
