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
const sourceDir = path.join(__dirname, "..", "config", "sources");
const allSources = fs.readdirSync(sourceDir)
  .filter((name) => name.endsWith(".json"))
  .flatMap((name) => JSON.parse(fs.readFileSync(path.join(sourceDir, name), "utf8")).sources || []);
const allById = new Map(allSources.map((s) => [s.id, s]));

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

test("handoff source plan registers official GitHub org feeds and RSSHub-ready platform routes", () => {
  const officialGithubOrgFeeds = [
    "content-github-openai-org",
    "content-github-anthropics-org",
    "content-github-google-deepmind-org",
    "content-github-meta-llama-org",
    "content-github-deepseek-ai-org",
    "content-github-qwenlm-org"
  ];
  for (const id of officialGithubOrgFeeds) {
    const source = allById.get(id);
    assert.ok(source, `${id} must be registered in config/sources`);
    assert.equal(source.source_kind, "rss", `${id} must use GitHub Atom/RSS semantics`);
    assert.match(source.url, /^https:\/\/github\.com\/.+\.atom$/i, `${id} must point at a GitHub organization Atom feed`);
    assert.equal(source.authority, "primary", `${id} must remain a first-party source`);
    assert.equal(source.verification_policy, "primary_allowed", `${id} should be usable as primary evidence`);
  }

  const rsshubRoutes = [
    ["wechat-rsshub-newrank-template", "/newrank/wechat/"],
    ["platform-zhihu-rsshub-hotlist", "/zhihu/hotlist"],
    ["platform-jike-rsshub-ai-topic", "/jike/"]
  ];
  for (const [id, routePattern] of rsshubRoutes) {
    const source = allById.get(id);
    assert.ok(source, `${id} must be registered as an RSSHub-ready source`);
    assert.equal(source.source_kind, "rsshub", `${id} must use the rsshub source kind`);
    assert.equal(source.base_url_env, "AI_DAILY_RSSHUB_BASE_URL", `${id} must be gated by the shared RSSHub base URL`);
    assert.ok(source.route_path.includes(routePattern), `${id} route_path should include ${routePattern}`);
    assert.equal(source.enablement, "manual", `${id} must not run until explicitly configured`);
  }
});
