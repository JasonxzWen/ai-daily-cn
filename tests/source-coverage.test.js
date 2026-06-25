// Stage A: guard that the headline-lab engineering/research sources and the
// individual-builder blog class are registered as monitored content sources.
// Prevents silent removal/downgrade of the sources the maintainer explicitly
// requires (anthropic /engineering + /research, openai research, deepmind
// research) and the builder-blog catch-net.
//
// Run: node --test tests/source-coverage.test.js

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cfgPath = path.join(__dirname, "..", "config", "sources", "default-content-sources.json");
const sources = JSON.parse(fs.readFileSync(cfgPath, "utf8")).sources;
const byId = new Map(sources.map((s) => [s.id, s]));

test("headline-lab engineering/research sources are monitored as core T0 primary", () => {
  const required = [
    ["content-anthropic-engineering", "/engineering/"],
    ["content-anthropic-research", "/research/"]
  ];
  for (const [id, linkPattern] of required) {
    const s = byId.get(id);
    assert.ok(s, `${id} must be a registered content source`);
    assert.equal(s.tier, "T0", `${id} must be T0`);
    assert.equal(s.authority, "primary", `${id} must be primary authority`);
    assert.equal(s.enablement, "core", `${id} must be core (always checked)`);
    assert.equal(s.source_kind, "html_index", `${id} must be html_index (no RSS)`);
    assert.equal(s.linkPattern, linkPattern, `${id} linkPattern`);
  }
});

test("individual-builder blog class is registered (catch-net for practitioner posts)", () => {
  const builders = sources.filter((s) => /^content-builder-/.test(s.id));
  assert.ok(builders.length >= 2, "at least two individual-builder blog sources");
  for (const s of builders) {
    assert.equal(s.candidate_category, "hot_blog");
    assert.equal(s.authority, "secondary", `${s.id} individual builder = secondary authority`);
    assert.ok(["rss", "html_index"].includes(s.source_kind));
  }
});
