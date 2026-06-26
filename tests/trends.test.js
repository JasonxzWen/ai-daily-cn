// #3 trends vocab: emerging harness/context-engineering concepts must register as
// controlled trend topics so cross-source occurrences generate trend pressure.
//
// Run: node --test tests/trends.test.js

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadTrendConfig, buildTrendIndex } from "../src/trends.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");

test("harness engineering trend registers across sources", async () => {
  const config = await loadTrendConfig({ rootDir });
  const reports = [
    {
      report_date: "2026-06-25",
      main_items: [
        { title: "Anthropic on harness engineering", summary: "agent harness design for long-running agent workflows" }
      ],
      hot_blogs: [
        { title: "Context engineering for agents", summary: "context engineering and harness engineering in practice" }
      ]
    },
    {
      report_date: "2026-06-26",
      builder_observations: [{ author: "x", content: "notes on long-running agent harness engineering" }],
      github_trending: [{ name: "x/agent-harness", description: "an agent harness engineering toolkit" }]
    }
  ];
  const index = buildTrendIndex(reports, { config, reportDate: "2026-06-26" });
  const harness = index.topics.find((topic) => topic.id === "harness-engineering");
  assert.ok(
    harness,
    "harness-engineering topic should register; got topics: " + JSON.stringify(index.topics.map((t) => t.id))
  );
  assert.ok(["watching", "active", "hot"].includes(harness.status), `unexpected status ${harness.status}`);
});

test("trends config exposes the emerging harness/context-engineering vocabulary", async () => {
  const config = await loadTrendConfig({ rootDir });
  const harness = config.topics.find((topic) => topic.id === "harness-engineering");
  assert.ok(harness, "harness-engineering topic must be configured");
  for (const alias of ["harness engineering", "agent harness", "context engineering", "long running agent"]) {
    assert.ok(harness.aliases.includes(alias), `harness-engineering must include alias "${alias}"`);
  }
});

test("cross-source breadth promotes a topic to hot without github/builder evidence", async () => {
  const config = await loadTrendConfig({ rootDir });
  // "harness engineering" appears 5x across 5 days spanning 3 distinct lanes
  // (main_items / hot_blogs / projects) — none of them github_trending or
  // builder_observations — with no repeated named entity.
  const reports = [
    { report_date: "2026-06-22", main_items: [{ title: "On harness engineering", summary: "harness engineering for agents" }] },
    { report_date: "2026-06-23", hot_blogs: [{ title: "Harness engineering notes", summary: "harness engineering deep dive" }] },
    { report_date: "2026-06-24", projects: [{ name: "x/agent-harness", description: "a harness engineering toolkit" }] },
    { report_date: "2026-06-25", main_items: [{ title: "More harness engineering", summary: "harness engineering patterns" }] },
    { report_date: "2026-06-26", hot_blogs: [{ title: "Harness engineering recap", summary: "harness engineering review" }] }
  ];
  const index = buildTrendIndex(reports, { config, reportDate: "2026-06-26" });
  const harness = index.topics.find((topic) => topic.id === "harness-engineering");
  assert.ok(harness, "harness-engineering must register");
  assert.deepEqual(
    harness.sections.filter((section) => ["github_trending", "builder_observations"].includes(section)),
    [],
    "fixture must not rely on github/builder evidence"
  );
  assert(harness.sections.length >= 3, `expected >=3 distinct lanes, got ${JSON.stringify(harness.sections)}`);
  assert.equal(harness.status, "hot", `cross-source breadth should reach hot, got ${harness.status}`);
});

test("trends hot tier exposes the cross-source breadth threshold", async () => {
  const config = await loadTrendConfig({ rootDir });
  assert.ok(Number.isInteger(config.thresholds.hot.min_sections), "hot.min_sections must be configured");
  assert(config.thresholds.hot.min_sections >= 2);
});
