# Source Strategy

Use this reference when collecting materials before a quick-learn syllabus or lesson.

## Source Tiers

Classify every source with the highest applicable tier:

| Tier | Meaning | Examples |
|---|---|---|
| Primary | Original or authoritative source | Official docs, source repo, publisher page, author materials, standards, release notes, book preview, user-provided copy |
| Secondary | Serious explanation or teaching material | University course notes, reputable tutorials, long-form technical blogs, expert reviews, conference talks |
| Tertiary | Orientation or discovery material | Summaries, listicles, Q&A, community threads, short videos |
| Local synthesis | Agent-produced artifact | Source index, concept map, syllabus, quiz bank, notes |

Prefer primary sources for facts and secondary sources for pedagogy. Tertiary sources can reveal common confusion but should not anchor claims unless corroborated.

## Download Policy

Download or clone material when it materially improves learning and is reachable through normal access:

- user-provided files;
- official downloads, public PDFs, public Markdown, open repositories, public docs, sample code, datasets, or course pages;
- pages that can be fetched without login, paywall bypass, captcha avoidance, credential use, rate-limit evasion, or anti-scraping workarounds.

If access is blocked, record the link, access issue, and alternate source. Do not invent missing content. Keep downloaded copyrighted or license-unclear material local to the learning project, cite it, summarize it, and avoid reproducing large verbatim passages in user-facing output.

## Source Quality

Assign a quality grade:

- **A**: official, original, current, and directly relevant.
- **B**: reputable, specific, and mostly current.
- **C**: useful but partial, old, opinionated, or not independently verified.
- **D**: weak, promotional, unclear, outdated, or only useful as a confusion signal.

Record why a source got its grade when it affects the syllabus.

## Freshness

Classify the topic:

- **Stable**: books, fundamentals, historical concepts. Recheck only when new edition/source matters.
- **Evolving**: libraries, frameworks, regulations, markets, tooling. Verify current docs and release notes.
- **Volatile**: prices, breaking API changes, legal/financial rules, live product behavior. Browse current primary sources before answering.

When a fact can change, use current sources and include the source date or observed version.

## Source Pack Fields

Capture at least:

```json
{
  "title": "Source title",
  "url": "https://...",
  "local_path": ".quick-learn/projects/topic/materials/source.pdf",
  "tier": "primary",
  "quality": "A",
  "freshness": "stable",
  "used_for": ["facts", "examples", "assessment"],
  "notes": "Why this source matters",
  "gaps": "What it does not cover"
}
```

Use stable source IDs such as `S1`, `S2`, and `M3-S1` in the source index. Broad entry pages can seed discovery, but module teaching needs concrete anchors. If a lesson cites a specific article, documentation page, PDF section, repository example, or course page, record that item with its own source ID, URL or local path, tier, quality, freshness, used-for fields, and gaps before teaching from it.

## Coverage Adequacy

Distinguish source quality from source coverage. An authoritative page may still be too shallow for the intended lesson.

- **Discovery-only coverage**: directory pages, tables of contents, publisher summaries, catalog entries, and short descriptions. Use these to identify themes and editions, not to claim deep reading.
- **Lesson-ready coverage**: a concrete article, documentation page, repository example, PDF section, lecture, or serious secondary explanation that supports the lesson's facts and examples.
- **Original-text coverage**: the user-provided or legally accessible primary text needed to attribute a claim to the author or source work.

A directory, table of contents, publisher summary, or third-party interpretation does not count as original-text coverage. If the user asks the agent to read the original and only discovery material is available, record a `warn` or `fail`, state the access gap, and do not describe the work as read. Authoritative supplemental material may keep the course moving, but label it as supplementation rather than the book's words.

Review coverage per use: facts, worked examples, critiques, and assessments may need different sources. A source pack is sufficient only when each near-term module has enough lesson-ready evidence for its claims and the remaining gaps are visible.

## Book Learning Pattern

For a book:

1. Find publisher, author, ISBN/edition, official page, table of contents, preview, errata, interviews, and legal downloadable materials.
2. Add user-provided copies or open PDFs/Markdown when available.
3. Search high-quality reviews, study notes, courses, talks, and critique.
4. Build a table-of-contents map, but reorganize modules around the user's goals and prerequisites.
5. Label secondary interpretations as supplemental, not as the book's words.

## Technology Learning Pattern

For a technology:

1. Use official docs, source repository, releases, examples, API reference, architecture docs, and migration guides first.
2. Clone or inspect open-source repos when implementation details matter.
3. Add tutorials and blog posts only after official surface is mapped.
4. Track version, package name, runtime, setup constraints, common errors, and compatibility.
5. Include at least one practical artifact target: a small app, script, refactor, debug task, design note, or decision checklist.

For evolving vendor learning hubs, do not stop at the top-level hub page. Use the hub as `entry/discovery`, then add concrete article, docs, repo, release, or PDF records for each module that will make factual claims.
