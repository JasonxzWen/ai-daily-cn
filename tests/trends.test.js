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
  const harness = index.internal_topics.find((topic) => topic.id === "harness-engineering");
  assert.ok(
    harness,
    "harness-engineering topic should register internally; got topics: " + JSON.stringify(index.internal_topics.map((t) => t.id))
  );
  assert.ok(["watching", "active", "hot"].includes(harness.status), `unexpected status ${harness.status}`);
  const publicHarness = index.topics.find((topic) => topic.id === "harness-engineering");
  if (harness.status === "watching") {
    assert.equal(publicHarness, undefined, "watching trends must stay out of public topics");
  } else {
    assert.ok(publicHarness, "hot/active trends should remain public");
  }
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

test("public trend index hides watching topics but keeps internal evidence", () => {
  const config = {
    window_days: 7,
    candidate_window_days: 7,
    thresholds: {
      watching: { min_occurrences: 2, min_active_days: 2 },
      active: { min_occurrences: 3, min_active_days: 3, min_sections_or_entities: 2 },
      hot: {
        min_occurrences: 5,
        min_active_days: 4,
        min_entities: 3,
        min_sections: 3,
        evidence_sections: ["github_trending", "builder_observations"]
      }
    },
    topics: [{ id: "agent-workflows", label: "Agent workflows", aliases: ["agent workflows"] }],
    entities: [{ id: "openai", label: "OpenAI", aliases: ["openai"] }]
  };
  const reports = [
    { report_date: "2026-06-25", main_items: [{ title: "Agent workflows", summary: "agent workflows planning" }] },
    { report_date: "2026-06-26", main_items: [{ title: "Agent workflows", summary: "agent workflows orchestration" }] }
  ];

  const index = buildTrendIndex(reports, { config, reportDate: "2026-06-26" });

  assert.equal(index.topics.find((topic) => topic.id === "agent-workflows"), undefined);
  const internal = index.internal_topics.find((topic) => topic.id === "agent-workflows");
  assert.equal(internal.status, "watching");
  assert.equal(internal.public_visibility, "internal");
});

test("candidate trend topics are explicitly internal hints", () => {
  const config = {
    window_days: 7,
    candidate_window_days: 7,
    topics: [{ id: "controlled-topic", label: "Controlled Topic", aliases: ["controlled topic"] }],
    entities: [{ id: "openai", label: "OpenAI", aliases: ["openai"] }],
    stopwords: ["and", "for"]
  };
  const reports = [
    { report_date: "2026-06-25", main_items: [{ title: "Latent runtime pattern", summary: "latent runtime pattern for agents" }] },
    { report_date: "2026-06-26", hot_blogs: [{ title: "Latent runtime pattern", summary: "latent runtime pattern in tools" }] }
  ];

  const index = buildTrendIndex(reports, { config, reportDate: "2026-06-26" });

  assert(index.candidate_topics.length > 0, "fixture should produce candidate topic hints");
  assert(index.candidate_topics.every((topic) => topic.display === false));
  assert(index.candidate_topics.every((topic) => topic.public_visibility === "internal"));
});
