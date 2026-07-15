---
name: package-release-sniffer
description: Load when tracking newly published package or model-package releases across package registries and release feeds for AI/developer-tool monitoring; do not load for ordinary docs lookup, broad GitHub trend scanning, or implementing package clients.
license: MIT
metadata:
  source: "local-original"
---

# Package Release Sniffer

Use this skill to find newly published packages or meaningful package releases before they become general news.

## Workflow

1. Define the package ecosystem and freshness window before searching.
2. Check primary release surfaces first: registry package pages, registry APIs, release feeds, GitHub Releases, changelogs, model cards, and maintainer announcement posts that link to the package.
3. Record the package name, ecosystem, version, publish time, source URL, maintainer or organization, license signal, install surface, and why the release matters.
4. Prefer packages with concrete shipped artifacts: new package, major/minor version, security fix, SDK/API capability, model/runtime integration, benchmarked performance change, or developer workflow impact.
5. De-duplicate aliases across registry pages, GitHub repositories, model cards, and maintainer posts.
6. Mark uncertainty when publish time, package identity, maintainership, license, or artifact availability is unclear.

## Source Priority

Use primary sources before secondary mentions:

- npm package pages and npm registry metadata
- PyPI project pages and release history
- GitHub Releases, tags, changelogs, and repository package metadata
- Hugging Face model, dataset, Space, and library release pages when they behave like package artifacts
- crates.io, Go package/module pages, Maven Central, NuGet, Docker Hub, or similar registries when relevant
- Maintainer blogs or docs only when they link back to the package or release artifact

## Keep

- First public release of an AI or developer-tool package
- New major or minor release with a clear capability change
- SDK, CLI, MCP server/client, inference runtime, agent framework, eval, data pipeline, observability, RAG, vector database, or deployment package
- Security, compatibility, performance, or migration-impact release
- Package release that is not yet visible in broader trend/news sources

## Drop

- Media-only claims without a package or release source
- Repository commits without a packaged artifact
- Awesome lists, prompt dumps, demo-only repos, and placeholders
- Releases with unclear maintainership, no usable artifact, or no relevant AI/developer-tool signal
- Ordinary patch releases unless they affect security, compatibility, or widely used workflows

## Output Shape

Return concise candidates:

```json
{
  "package": "",
  "ecosystem": "npm | pypi | github-release | hugging-face | crates | go | maven | nuget | docker | other",
  "version": "",
  "published_at": "YYYY-MM-DDTHH:mm:ssZ",
  "source_url": "",
  "maintainer": "",
  "signal": "new_package | major_release | minor_release | security | performance | compatibility | ecosystem",
  "summary": "",
  "why_it_matters": "",
  "confidence": "high | medium | low"
}
```

## Boundaries

- Use `documentation-lookup` when the task is to read current docs for an already chosen package.
- Use `source-post` when a confirmed release must become a publishable article.
- Use implementation workflows when the user wants a registry client, scraper, monitor, or scheduled job built.
- Do not create accounts, subscribe to feeds, change automation, or publish packages.
