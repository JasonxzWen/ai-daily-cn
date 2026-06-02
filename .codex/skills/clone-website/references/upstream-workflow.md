# Upstream Workflow Summary

Source: `JCodesMore/ai-website-cloner-template` at `c9b4fea5b257370af339abedad727c8903490dac`, MIT.

The upstream project is a Next.js website reconstruction template with a `/clone-website` skill. Its strongest reusable idea is the pipeline, not the host-specific platform packaging.

## Reusable Pipeline

1. Reconnaissance: browser screenshots, global tokens, page topology, and interaction sweep.
2. Foundation: global CSS, fonts, metadata, icon extraction, and authorized asset handling.
3. Component specs: write auditable specs before building each section.
4. Build: implement sections from specs, keeping work small enough to verify.
5. Assembly and QA: compose the page, run build checks, compare screenshots, and report gaps.

## Local Adaptation

Skill Hub keeps this as an explicit side-effect-heavy skill:

- no automatic loading for generic design inspiration;
- no default multi-site or parallel builder dispatch;
- no host-specific platform metadata copied into the distributed skill body;
- no copying of third-party identity assets by default;
- local `harness/website-cloner` provides a lightweight smoke scaffold for browser-verifiable artifacts.

Use the upstream repository directly when the user wants the full Next.js 16 template and has a Node 24+ environment.
