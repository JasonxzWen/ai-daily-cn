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
