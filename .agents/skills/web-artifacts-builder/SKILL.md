---
name: web-artifacts-builder
description: Load when a task needs complex standalone React/Tailwind/shadcn browser artifacts with state, routing, or bundled components; use effective-interact for reports and frontend-design for production UI.
license: Complete terms in LICENSE.txt
---


# Web Artifacts Builder

> Harness Hub adaptation: final bundles are verified before handoff.

To build powerful frontend local browser artifacts, follow these steps:
1. Initialize the frontend repo using `scripts/init-artifact.sh`
2. Develop your artifact by editing the generated code
3. Bundle all code into a single HTML file using `scripts/bundle-artifact.sh`
4. Verify the final bundle
5. Share the artifact with the user

**Stack**: React 18 + TypeScript + Vite + Parcel (bundling) + Tailwind CSS + shadcn/ui

## Design & Style Guidelines

VERY IMPORTANT: To avoid what is often referred to as "AI slop", avoid using excessive centered layouts, purple gradients, uniform rounded corners, and Inter font.

## Quick Start

### Step 1: Initialize Project

Run the initialization script to create a new React project:
```bash
bash scripts/init-artifact.sh <project-name>
cd <project-name>
```

This creates a fully configured project with:
- React + TypeScript (via Vite)
- Tailwind CSS 3.4.1 with shadcn/ui theming system
- Path aliases (`@/`) configured
- 40+ shadcn/ui components pre-installed
- All Radix UI dependencies included
- Parcel configured for bundling (via .parcelrc)
- Node 18+ compatibility (auto-detects and pins Vite version)

### Step 2: Develop Your Artifact

To build the artifact, edit the generated files. See **Common Development Tasks** below for guidance.

### Step 3: Bundle to Single HTML File

To bundle the React app into a single HTML artifact:
```bash
bash scripts/bundle-artifact.sh
```

This creates `bundle.html` - a self-contained artifact with all JavaScript, CSS, and dependencies inlined. This file can be directly shared in Agent conversations as an artifact.

**Requirements**: Your project must have an `index.html` in the root directory.

**What the script does**:
- Installs bundling dependencies (parcel, @parcel/config-default, parcel-resolver-tspaths, html-inline)
- Creates `.parcelrc` config with path alias support
- Builds with Parcel (no source maps)
- Inlines all assets into single HTML using html-inline

### Step 4: Verify the Artifact

Before sharing the artifact, open the final bundle, exercise its critical interaction, and check for console errors. Add screenshots, accessibility checks, or broader browser coverage when risk-based verification requires them.

### Step 5: Share Artifact with User

Share the verified `bundle.html` file in conversation with the user so they can view it as an artifact.

## Reference

- **shadcn/ui components**: https://ui.shadcn.com/docs/components
